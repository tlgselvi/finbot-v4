/**
 * Exchange Rate Engine Failover and Reliability Tests
 * Tests for provider failover, data quality, and system resilience
 */

const { describe, it, beforeEach, afterEach, expect, jest } = require('@jest/globals');
const ExchangeRateIngestionPipeline = require('../../src/multi-currency/exchange-rate-engine/rate-ingestion-pipeline');
const axios = require('axios');

// Mock external dependencies
jest.mock('axios');
jest.mock('ioredis');
jest.mock('kafkajs');
jest.mock('ws');

const Redis = require('ioredis');

describe('Exchange Rate Engine Failover Tests', () => {
  let pipeline;
  let mockRedis;

  beforeEach(() => {
    // Mock Redis
    mockRedis = {
      setex: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
      pipeline: jest.fn().mockReturnValue({
        setex: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      }),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
      subscribe: jest.fn().mockResolvedValue(1),
      publish: jest.fn().mockResolvedValue(1),
      config: jest.fn().mockResolvedValue('OK'),
      dbsize: jest.fn().mockResolvedValue(0),
      info: jest.fn().mockResolvedValue('used_memory:1024')
    };

    Redis.mockImplementation(() => mockRedis);

    const config = {
      providers: ['fxapi', 'exchangerate', 'currencylayer', 'reuters'],
      baseCurrency: 'USD',
      targetCurrencies: ['EUR', 'GBP', 'JPY'],
      enableKafka: false,
      enableStreaming: false,
      maxFailures: 3,
      retryAttempts: 2,
      retryDelay: 100,
      cache: {
        redis: { host: 'localhost', port: 6379 }
      }
    };

    pipeline = new ExchangeRateIngestionPipeline(config);
  });

  afterEach(async () => {
    if (pipeline.isRunning) {
      await pipeline.stop();
    }
    jest.clearAllMocks();
  });

  describe('Provider Failover', () => {
    it('should continue operating when one provider fails', async () => {
      // Mock one provider failing, others succeeding
      axios.get.mockImplementation((url) => {
        if (url.includes('fxapi')) {
          return Promise.reject(new Error('Provider 1 failed'));
        }
        if (url.includes('exchangerate')) {
          return Promise.resolve({
            data: { rates: { EUR: 0.85, GBP: 0.73, JPY: 110 } }
          });
        }
        if (url.includes('currencylayer')) {
          return Promise.resolve({
            data: { 
              success: true,
              quotes: { USDEUR: 0.84, USDGBP: 0.72, USDJPY: 109 }
            }
          });
        }
        return Promise.reject(new Error('Unknown provider'));
      });

      const ratesUpdated = jest.fn();
      pipeline.on('ratesUpdated', ratesUpdated);

      await pipeline.fetchRates();

      expect(ratesUpdated).toHaveBeenCalled();
      expect(pipeline.providerStats.fxapi.failures).toBe(1);
      expect(pipeline.providerStats.exchangerate.successes).toBe(1);
      expect(pipeline.providerStats.currencylayer.successes).toBe(1);
    });

    it('should handle multiple provider failures gracefully', async () => {
      // Mock multiple providers failing
      axios.get.mockImplementation((url) => {
        if (url.includes('fxapi') || url.includes('exchangerate')) {
          return Promise.reject(new Error('Provider failed'));
        }
        if (url.includes('currencylayer')) {
          return Promise.resolve({
            data: { 
              success: true,
              quotes: { USDEUR: 0.84, USDGBP: 0.72, USDJPY: 109 }
            }
          });
        }
        return Promise.reject(new Error('Provider failed'));
      });

      const ratesUpdated = jest.fn();
      pipeline.on('ratesUpdated', ratesUpdated);

      await pipeline.fetchRates();

      expect(ratesUpdated).toHaveBeenCalled();
      expect(pipeline.providerStats.fxapi.failures).toBe(1);
      expect(pipeline.providerStats.exchangerate.failures).toBe(1);
      expect(pipeline.providerStats.currencylayer.successes).toBe(1);
    });

    it('should fail gracefully when all providers fail', async () => {
      // Mock all providers failing
      axios.get.mockRejectedValue(new Error('All providers failed'));

      await expect(pipeline.fetchRates()).rejects.toThrow('All rate providers failed');
      
      Object.values(pipeline.providerStats).forEach(stats => {
        expect(stats.failures).toBe(1);
      });
    });

    it('should mark providers as unhealthy after repeated failures', async () => {
      // Mock repeated failures for one provider
      axios.get.mockImplementation((url) => {
        if (url.includes('fxapi')) {
          return Promise.reject(new Error('Persistent failure'));
        }
        return Promise.resolve({
          data: { rates: { EUR: 0.85, GBP: 0.73, JPY: 110 } }
        });
      });

      // Simulate multiple fetch attempts
      for (let i = 0; i < 5; i++) {
        try {
          await pipeline.fetchRates();
        } catch (error) {
          // Ignore errors for this test
        }
      }

      expect(pipeline.providerStats.fxapi.isHealthy).toBe(false);
      expect(pipeline.providerStats.fxapi.failures).toBe(5);
    });

    it('should recover provider health after successful requests', async () => {
      // First, make provider unhealthy
      pipeline.providerStats.fxapi.failures = 10;
      pipeline.providerStats.fxapi.requests = 10;
      pipeline.providerStats.fxapi.isHealthy = false;

      // Mock successful response
      axios.get.mockResolvedValue({
        data: {
          success: true,
          rates: { EUR: 0.85, GBP: 0.73, JPY: 110 }
        }
      });

      await pipeline.fetchRates();

      expect(pipeline.providerStats.fxapi.successes).toBeGreaterThan(0);
      expect(pipeline.providerStats.fxapi.isHealthy).toBe(true);
    });
  });

  describe('Data Quality Resilience', () => {
    it('should handle invalid rate data from providers', async () => {
      // Mock provider returning invalid data
      axios.get.mockImplementation((url) => {
        if (url.includes('fxapi')) {
          return Promise.resolve({
            data: {
              success: true,
              rates: { EUR: null, GBP: -1, JPY: 'invalid' }
            }
          });
        }
        return Promise.resolve({
          data: { rates: { EUR: 0.85, GBP: 0.73, JPY: 110 } }
        });
      });

      const ratesUpdated = jest.fn();
      pipeline.on('ratesUpdated', ratesUpdated);

      await pipeline.fetchRates();

      expect(ratesUpdated).toHaveBeenCalled();
      
      // Should use valid data from other providers
      const eventData = ratesUpdated.mock.calls[0][0];
      expect(eventData.rates.EUR.rate).toBe(0.85);
      expect(eventData.rates.GBP.rate).toBe(0.73);
    });

    it('should detect and handle extreme rate changes', async () => {
      // First, establish normal rates
      axios.get.mockResolvedValue({
        data: { rates: { EUR: 0.85, GBP: 0.73, JPY: 110 } }
      });

      await pipeline.fetchRates();

      // Now mock extreme rate change
      axios.get.mockResolvedValue({
        data: { rates: { EUR: 2.50, GBP: 0.73, JPY: 110 } } // 194% increase
      });

      const anomalyDetected = jest.fn();
      pipeline.on('rateAnomaly', anomalyDetected);

      await pipeline.fetchRates();

      // Should detect anomaly but still process the rate
      expect(anomalyDetected).toHaveBeenCalled();
    });

    it('should handle partial data from providers', async () => {
      // Mock providers returning partial data
      axios.get.mockImplementation((url) => {
        if (url.includes('fxapi')) {
          return Promise.resolve({
            data: {
              success: true,
              rates: { EUR: 0.85 } // Only EUR
            }
          });
        }
        if (url.includes('exchangerate')) {
          return Promise.resolve({
            data: { rates: { GBP: 0.73, JPY: 110 } } // Only GBP and JPY
          });
        }
        return Promise.reject(new Error('Provider failed'));
      });

      const ratesUpdated = jest.fn();
      pipeline.on('ratesUpdated', ratesUpdated);

      await pipeline.fetchRates();

      expect(ratesUpdated).toHaveBeenCalled();
      
      const eventData = ratesUpdated.mock.calls[0][0];
      expect(eventData.rates).toHaveProperty('EUR');
      expect(eventData.rates).toHaveProperty('GBP');
      expect(eventData.rates).toHaveProperty('JPY');
    });
  });

  describe('Cache Resilience', () => {
    it('should continue operating when Redis is unavailable', async () => {
      // Mock Redis connection failure
      mockRedis.setex.mockRejectedValue(new Error('Redis connection failed'));
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

      // Mock successful provider response
      axios.get.mockResolvedValue({
        data: { rates: { EUR: 0.85, GBP: 0.73, JPY: 110 } }
      });

      const ratesUpdated = jest.fn();
      pipeline.on('ratesUpdated', ratesUpdated);

      await pipeline.fetchRates();

      // Should still emit rates even without cache
      expect(ratesUpdated).toHaveBeenCalled();
    });

    it('should fall back to memory cache when Redis fails', async () => {
      await pipeline.rateCache.connect();

      // Set some data in memory cache
      pipeline.rateCache.setInMemoryCache('USD/EUR', {
        rate: 0.85,
        timestamp: new Date(),
        cachedAt: new Date()
      });

      // Mock Redis failure
      mockRedis.get.mockRejectedValue(new Error('Redis failed'));

      const rate = await pipeline.getRate('USD', 'EUR');
      
      expect(rate).toBeTruthy();
      expect(rate.rate).toBe(0.85);
    });

    it('should handle cache corruption gracefully', async () => {
      await pipeline.rateCache.connect();

      // Mock corrupted data in Redis
      mockRedis.get.mockResolvedValue('invalid json data');

      const rate = await pipeline.getRate('USD', 'EUR');
      expect(rate).toBeNull(); // Should return null for corrupted data
    });
  });

  describe('Network Resilience', () => {
    it('should handle network timeouts', async () => {
      // Mock network timeout
      axios.get.mockImplementation((url) => {
        if (url.includes('fxapi')) {
          return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('ETIMEDOUT')), 50);
          });
        }
        return Promise.resolve({
          data: { rates: { EUR: 0.85, GBP: 0.73, JPY: 110 } }
        });
      });

      const ratesUpdated = jest.fn();
      pipeline.on('ratesUpdated', ratesUpdated);

      await pipeline.fetchRates();

      expect(ratesUpdated).toHaveBeenCalled();
      expect(pipeline.providerStats.fxapi.failures).toBe(1);
    });

    it('should handle DNS resolution failures', async () => {
      // Mock DNS failure
      axios.get.mockImplementation((url) => {
        if (url.includes('fxapi')) {
          return Promise.reject(new Error('ENOTFOUND'));
        }
        return Promise.resolve({
          data: { rates: { EUR: 0.85, GBP: 0.73, JPY: 110 } }
        });
      });

      const ratesUpdated = jest.fn();
      pipeline.on('ratesUpdated', ratesUpdated);

      await pipeline.fetchRates();

      expect(ratesUpdated).toHaveBeenCalled();
      expect(pipeline.providerStats.fxapi.failures).toBe(1);
    });

    it('should handle SSL/TLS certificate errors', async () => {
      // Mock SSL error
      axios.get.mockImplementation((url) => {
        if (url.includes('fxapi')) {
          return Promise.reject(new Error('CERT_UNTRUSTED'));
        }
        return Promise.resolve({
          data: { rates: { EUR: 0.85, GBP: 0.73, JPY: 110 } }
        });
      });

      const ratesUpdated = jest.fn();
      pipeline.on('ratesUpdated', ratesUpdated);

      await pipeline.fetchRates();

      expect(ratesUpdated).toHaveBeenCalled();
      expect(pipeline.providerStats.fxapi.failures).toBe(1);
    });
  });

  describe('System Recovery', () => {
    it('should recover from temporary system failures', async () => {
      let failureCount = 0;
      
      // Mock temporary failures followed by success
      axios.get.mockImplementation(() => {
        failureCount++;
        if (failureCount <= 2) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve({
          data: { rates: { EUR: 0.85, GBP: 0.73, JPY: 110 } }
        });
      });

      // First two attempts should fail
      await expect(pipeline.fetchRates()).rejects.toThrow();
      await expect(pipeline.fetchRates()).rejects.toThrow();

      // Third attempt should succeed
      const ratesUpdated = jest.fn();
      pipeline.on('ratesUpdated', ratesUpdated);

      await pipeline.fetchRates();
      expect(ratesUpdated).toHaveBeenCalled();
    });

    it('should handle graceful degradation under load', async () => {
      // Mock slow responses
      axios.get.mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              data: { rates: { EUR: 0.85, GBP: 0.73, JPY: 110 } }
            });
          }, 200); // 200ms delay
        });
      });

      const startTime = Date.now();
      
      // Make multiple concurrent requests
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(pipeline.fetchRates());
      }

      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should handle concurrent requests efficiently
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should maintain data consistency during failures', async () => {
      // Mock inconsistent data from providers
      axios.get.mockImplementation((url) => {
        if (url.includes('fxapi')) {
          return Promise.resolve({
            data: {
              success: true,
              rates: { EUR: 0.85, GBP: 0.73 }
            }
          });
        }
        if (url.includes('exchangerate')) {
          return Promise.resolve({
            data: { rates: { EUR: 0.90, GBP: 0.75 } } // Different rates
          });
        }
        return Promise.reject(new Error('Provider failed'));
      });

      const ratesUpdated = jest.fn();
      pipeline.on('ratesUpdated', ratesUpdated);

      await pipeline.fetchRates();

      expect(ratesUpdated).toHaveBeenCalled();
      
      const eventData = ratesUpdated.mock.calls[0][0];
      
      // Should consolidate rates and provide quality scores
      expect(eventData.rates.EUR.rate).toBeCloseTo(0.875, 2); // Weighted average
      expect(eventData.rates.EUR.qualityScore).toBeDefined();
      expect(eventData.rates.EUR.spread).toBeDefined();
    });
  });

  describe('Circuit Breaker Pattern', () => {
    it('should implement circuit breaker for failing providers', async () => {
      // Mock persistent failures
      axios.get.mockRejectedValue(new Error('Persistent failure'));

      // Trigger multiple failures to open circuit
      for (let i = 0; i < pipeline.maxFailures; i++) {
        try {
          await pipeline.fetchRates();
        } catch (error) {
          // Expected to fail
        }
      }

      expect(pipeline.failureCount).toBe(pipeline.maxFailures);
      expect(pipeline.isRunning).toBe(false); // Should stop after max failures
    });

    it('should reset circuit breaker after successful operations', async () => {
      // First, trigger failures
      pipeline.failureCount = pipeline.maxFailures - 1;

      // Mock successful response
      axios.get.mockResolvedValue({
        data: { rates: { EUR: 0.85, GBP: 0.73, JPY: 110 } }
      });

      await pipeline.fetchRates();

      expect(pipeline.failureCount).toBe(0); // Should reset on success
    });
  });

  describe('Health Monitoring', () => {
    it('should provide accurate health status during failures', async () => {
      // Mock mixed provider health
      pipeline.providerStats.fxapi.isHealthy = false;
      pipeline.providerStats.fxapi.failures = 5;
      pipeline.providerStats.exchangerate.isHealthy = true;
      pipeline.providerStats.exchangerate.successes = 10;

      const health = await pipeline.healthCheck();

      expect(health.providers.healthy).toBe(1);
      expect(health.providers.total).toBe(4);
      expect(health.providers.healthPercentage).toBe(25);
    });

    it('should detect degraded performance', async () => {
      // Simulate degraded performance
      Object.values(pipeline.providerStats).forEach(stats => {
        stats.isHealthy = false;
      });

      const health = await pipeline.healthCheck();

      expect(health.status).toBe('degraded');
      expect(health.isHealthy).toBe(false);
    });

    it('should provide detailed failure information', async () => {
      // Mock specific failures
      pipeline.providerStats.fxapi.lastFailure = new Date();
      pipeline.providerStats.fxapi.failures = 3;

      const stats = await pipeline.getProviderStats();

      expect(stats.providers.fxapi.failures).toBe(3);
      expect(stats.providers.fxapi.lastFailure).toBeDefined();
      expect(stats.failureCount).toBeDefined();
    });
  });
});