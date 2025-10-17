/**
 * Exchange Rate Engine Test Suite
 * Comprehensive tests for rate ingestion, caching, and validation
 */

const { describe, it, beforeEach, afterEach, expect, jest } = require('@jest/globals');
const ExchangeRateIngestionPipeline = require('../../src/multi-currency/exchange-rate-engine/rate-ingestion-pipeline');
const RedisRateCache = require('../../src/multi-currency/exchange-rate-engine/redis-rate-cache');
const RateValidationEngine = require('../../src/multi-currency/exchange-rate-engine/rate-validation-engine');

// Mock external dependencies
jest.mock('axios');
jest.mock('ioredis');
jest.mock('kafkajs');
jest.mock('ws');

const axios = require('axios');
const Redis = require('ioredis');

describe('Exchange Rate Engine', () => {
  let pipeline;
  let mockRedis;
  
  const mockConfig = {
    providers: ['fxapi', 'exchangerate'],
    updateInterval: 5000,
    baseCurrency: 'USD',
    targetCurrencies: ['EUR', 'GBP', 'JPY'],
    enableKafka: false,
    enableStreaming: false,
    cache: {
      redis: {
        host: 'localhost',
        port: 6379
      }
    }
  };

  beforeEach(() => {
    // Mock Redis
    mockRedis = {
      setex: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
      dbsize: jest.fn().mockResolvedValue(0),
      info: jest.fn().mockResolvedValue('used_memory:1024'),
      config: jest.fn().mockResolvedValue('OK'),
      pipeline: jest.fn().mockReturnValue({
        setex: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      }),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
      subscribe: jest.fn().mockResolvedValue(1),
      publish: jest.fn().mockResolvedValue(1)
    };

    Redis.mockImplementation(() => mockRedis);

    pipeline = new ExchangeRateIngestionPipeline(mockConfig);
  });

  afterEach(async () => {
    if (pipeline.isRunning) {
      await pipeline.stop();
    }
    jest.clearAllMocks();
  });

  describe('Rate Ingestion Pipeline', () => {
    describe('Initialization', () => {
      it('should initialize with default configuration', () => {
        const defaultPipeline = new ExchangeRateIngestionPipeline();
        expect(defaultPipeline.config.baseCurrency).toBe('USD');
        expect(defaultPipeline.config.updateInterval).toBe(60000);
        expect(defaultPipeline.isRunning).toBe(false);
      });

      it('should initialize provider stats', () => {
        expect(pipeline.providerStats).toHaveProperty('fxapi');
        expect(pipeline.providerStats).toHaveProperty('exchangerate');
        expect(pipeline.providerStats.fxapi.requests).toBe(0);
        expect(pipeline.providerStats.fxapi.isHealthy).toBe(true);
      });
    });

    describe('Provider Integration', () => {
      beforeEach(() => {
        axios.get.mockClear();
      });

      it('should fetch rates from FxApi provider', async () => {
        const mockResponse = {
          data: {
            success: true,
            rates: {
              EUR: 0.85,
              GBP: 0.73,
              JPY: 110.5
            }
          }
        };

        axios.get.mockResolvedValue(mockResponse);
        process.env.FXAPI_KEY = 'test-key';

        const rates = await pipeline.fetchFromProvider('fxapi');
        
        expect(axios.get).toHaveBeenCalledWith(
          expect.stringContaining('fxapi.com'),
          expect.objectContaining({
            params: expect.objectContaining({
              access_key: 'test-key',
              base: 'USD'
            })
          })
        );

        expect(rates).toHaveProperty('EUR');
        expect(rates.EUR.rate).toBe(0.85);
        expect(rates.EUR.provider).toBe('fxapi');
      });

      it('should fetch rates from ExchangeRate-API provider', async () => {
        const mockResponse = {
          data: {
            rates: {
              EUR: 0.84,
              GBP: 0.72,
              JPY: 109.8
            }
          }
        };

        axios.get.mockResolvedValue(mockResponse);

        const rates = await pipeline.fetchFromProvider('exchangerate');
        
        expect(axios.get).toHaveBeenCalledWith(
          expect.stringContaining('exchangerate-api.com'),
          expect.any(Object)
        );

        expect(rates).toHaveProperty('EUR');
        expect(rates.EUR.rate).toBe(0.84);
      });

      it('should handle provider failures gracefully', async () => {
        axios.get.mockRejectedValue(new Error('Network error'));

        await expect(pipeline.fetchFromProvider('fxapi')).rejects.toThrow('Network error');
        expect(pipeline.providerStats.fxapi.failures).toBe(1);
      });

      it('should normalize rates from different providers', () => {
        const simpleRates = { EUR: 0.85, GBP: 0.73 };
        const complexRates = {
          EUR: { rate: 0.85, bid: 0.849, ask: 0.851 },
          GBP: { rate: 0.73, bid: 0.729, ask: 0.731 }
        };

        const normalizedSimple = pipeline.normalizeRates(simpleRates, 'provider1');
        const normalizedComplex = pipeline.normalizeRates(complexRates, 'provider2');

        expect(normalizedSimple.EUR.rate).toBe(0.85);
        expect(normalizedSimple.EUR.provider).toBe('provider1');

        expect(normalizedComplex.EUR.rate).toBe(0.85);
        expect(normalizedComplex.EUR.bid).toBe(0.849);
        expect(normalizedComplex.EUR.ask).toBe(0.851);
      });
    });

    describe('Rate Consolidation', () => {
      it('should consolidate rates from multiple providers', () => {
        const providerResults = [
          {
            provider: 'provider1',
            rates: {
              EUR: { rate: 0.85, provider: 'provider1', reliability: 0.9 }
            }
          },
          {
            provider: 'provider2',
            rates: {
              EUR: { rate: 0.84, provider: 'provider2', reliability: 0.8 }
            }
          }
        ];

        const consolidated = pipeline.consolidateRates(providerResults);
        
        expect(consolidated).toHaveProperty('EUR');
        expect(consolidated.EUR.rate).toBeCloseTo(0.846, 2); // Weighted average
        expect(consolidated.EUR.providers).toEqual(['provider1', 'provider2']);
        expect(consolidated.EUR.providerCount).toBe(2);
      });

      it('should calculate quality scores based on provider agreement', () => {
        const providerResults = [
          {
            provider: 'provider1',
            rates: {
              EUR: { rate: 0.85, provider: 'provider1', reliability: 0.9 }
            }
          },
          {
            provider: 'provider2',
            rates: {
              EUR: { rate: 0.85, provider: 'provider2', reliability: 0.9 }
            }
          }
        ];

        const consolidated = pipeline.consolidateRates(providerResults);
        
        // Perfect agreement should result in high quality score
        expect(consolidated.EUR.qualityScore).toBeGreaterThan(90);
      });

      it('should handle single provider gracefully', () => {
        const providerResults = [
          {
            provider: 'provider1',
            rates: {
              EUR: { rate: 0.85, provider: 'provider1', reliability: 0.9 }
            }
          }
        ];

        const consolidated = pipeline.consolidateRates(providerResults);
        
        expect(consolidated.EUR.rate).toBe(0.85);
        expect(consolidated.EUR.qualityScore).toBe(85); // Single provider gets moderate score
      });
    });

    describe('Rate Retrieval', () => {
      beforeEach(async () => {
        // Mock cache with some rates
        mockRedis.get.mockImplementation((key) => {
          const rates = {
            'fx:rates:USD/EUR': JSON.stringify({
              rate: 0.85,
              timestamp: new Date().toISOString(),
              cachedAt: new Date().toISOString()
            }),
            'fx:rates:EUR/GBP': JSON.stringify({
              rate: 0.86,
              timestamp: new Date().toISOString(),
              cachedAt: new Date().toISOString()
            })
          };
          return Promise.resolve(rates[key] || null);
        });

        await pipeline.rateCache.connect();
      });

      it('should retrieve direct rates', async () => {
        const rate = await pipeline.getRate('USD', 'EUR');
        
        expect(rate).toBeTruthy();
        expect(rate.rate).toBe(0.85);
        expect(rate.pair).toBe('USD/EUR');
      });

      it('should calculate inverse rates', async () => {
        const rate = await pipeline.getRate('EUR', 'USD');
        
        expect(rate).toBeTruthy();
        expect(rate.rate).toBeCloseTo(1.176, 3); // 1/0.85
        expect(rate.isInverse).toBe(true);
      });

      it('should calculate cross rates', async () => {
        const rate = await pipeline.getRate('USD', 'GBP');
        
        expect(rate).toBeTruthy();
        expect(rate.isCrossRate).toBe(true);
        expect(rate.sourceRates).toBeTruthy();
      });

      it('should return null for unavailable rates', async () => {
        const rate = await pipeline.getRate('USD', 'XYZ');
        expect(rate).toBeNull();
      });
    });

    describe('Pipeline Lifecycle', () => {
      it('should start and stop pipeline correctly', async () => {
        expect(pipeline.isRunning).toBe(false);
        
        // Mock successful rate fetch
        jest.spyOn(pipeline, 'fetchRates').mockResolvedValue();
        
        await pipeline.start();
        expect(pipeline.isRunning).toBe(true);
        expect(pipeline.intervalId).toBeTruthy();
        
        await pipeline.stop();
        expect(pipeline.isRunning).toBe(false);
        expect(pipeline.intervalId).toBeNull();
      });

      it('should handle startup failures', async () => {
        jest.spyOn(pipeline.rateCache, 'connect').mockRejectedValue(new Error('Redis connection failed'));
        
        await expect(pipeline.start()).rejects.toThrow('Redis connection failed');
        expect(pipeline.isRunning).toBe(false);
      });
    });

    describe('Error Handling', () => {
      it('should handle provider failures and continue with available providers', async () => {
        axios.get.mockImplementation((url) => {
          if (url.includes('fxapi')) {
            return Promise.reject(new Error('Provider 1 failed'));
          }
          return Promise.resolve({
            data: {
              rates: { EUR: 0.85, GBP: 0.73 }
            }
          });
        });

        const results = await pipeline.fetchRates();
        
        // Should still emit rates from working provider
        expect(pipeline.lastUpdate).toBeTruthy();
      });

      it('should stop pipeline after max failures', async () => {
        jest.spyOn(pipeline, 'fetchRates').mockRejectedValue(new Error('All providers failed'));
        
        // Simulate multiple failures
        for (let i = 0; i < pipeline.maxFailures; i++) {
          pipeline.handleFailure(new Error('Test failure'));
        }
        
        expect(pipeline.isRunning).toBe(false);
      });
    });

    describe('Health Check', () => {
      it('should return healthy status when running normally', async () => {
        pipeline.isRunning = true;
        pipeline.lastUpdate = new Date();
        pipeline.providerStats.fxapi.isHealthy = true;
        
        const health = await pipeline.healthCheck();
        
        expect(health.status).toBe('running');
        expect(health.isHealthy).toBe(true);
        expect(health.providers.healthy).toBeGreaterThan(0);
      });

      it('should return degraded status with provider issues', async () => {
        pipeline.isRunning = true;
        Object.values(pipeline.providerStats).forEach(stat => {
          stat.isHealthy = false;
        });
        
        const health = await pipeline.healthCheck();
        
        expect(health.isHealthy).toBe(false);
        expect(health.providers.healthy).toBe(0);
      });
    });
  });

  describe('Redis Rate Cache', () => {
    let cache;

    beforeEach(() => {
      cache = new RedisRateCache({
        redis: { host: 'localhost', port: 6379 }
      });
    });

    afterEach(async () => {
      if (cache.isConnected) {
        await cache.disconnect();
      }
    });

    describe('Cache Operations', () => {
      beforeEach(async () => {
        await cache.connect();
      });

      it('should set and get rates', async () => {
        const rateData = {
          rate: 0.85,
          timestamp: new Date(),
          provider: 'test'
        };

        await cache.setRate('USD/EUR', rateData);
        
        expect(mockRedis.setex).toHaveBeenCalled();
        
        // Mock get response
        mockRedis.get.mockResolvedValue(JSON.stringify({
          ...rateData,
          cachedAt: new Date().toISOString()
        }));

        const retrieved = await cache.getRate('USD/EUR');
        expect(retrieved.rate).toBe(0.85);
      });

      it('should handle batch rate operations', async () => {
        const rates = {
          'USD/EUR': { rate: 0.85, timestamp: new Date() },
          'USD/GBP': { rate: 0.73, timestamp: new Date() }
        };

        await cache.setRates(rates);
        
        expect(mockRedis.pipeline).toHaveBeenCalled();
      });

      it('should implement memory cache fallback', async () => {
        // Simulate Redis failure
        mockRedis.get.mockRejectedValue(new Error('Redis error'));
        
        // Set in memory cache directly
        cache.setInMemoryCache('USD/EUR', { rate: 0.85, timestamp: new Date() });
        
        const rate = await cache.getRate('USD/EUR');
        expect(rate.rate).toBe(0.85);
      });
    });

    describe('Alert System', () => {
      beforeEach(async () => {
        await cache.connect();
      });

      it('should set and trigger rate alerts', async () => {
        const alertTriggered = jest.fn();
        cache.on('rateAlert', alertTriggered);

        await cache.setRateAlert('USD/EUR', 0.90, 'above');
        
        // Simulate rate that triggers alert
        const rateData = { rate: 0.91, timestamp: new Date() };
        await cache.checkRateAlerts('USD/EUR', rateData);
        
        expect(alertTriggered).toHaveBeenCalled();
      });

      it('should respect alert rate limiting', async () => {
        const alertTriggered = jest.fn();
        cache.on('rateAlert', alertTriggered);

        await cache.setRateAlert('USD/EUR', 0.90, 'above');
        
        const rateData = { rate: 0.91, timestamp: new Date() };
        
        // Trigger alert twice quickly
        await cache.checkRateAlerts('USD/EUR', rateData);
        await cache.checkRateAlerts('USD/EUR', rateData);
        
        // Should only trigger once due to rate limiting
        expect(alertTriggered).toHaveBeenCalledTimes(1);
      });
    });

    describe('Cache Management', () => {
      beforeEach(async () => {
        await cache.connect();
      });

      it('should clear cache', async () => {
        await cache.clearCache();
        expect(mockRedis.keys).toHaveBeenCalled();
        expect(mockRedis.del).toHaveBeenCalled();
      });

      it('should provide cache information', async () => {
        const info = await cache.getCacheInfo();
        
        expect(info).toHaveProperty('isConnected');
        expect(info).toHaveProperty('stats');
        expect(info).toHaveProperty('memoryCache');
      });

      it('should perform health checks', async () => {
        const health = await cache.healthCheck();
        
        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('isConnected');
        expect(health).toHaveProperty('metrics');
      });
    });
  });

  describe('Rate Validation Engine', () => {
    let validator;

    beforeEach(() => {
      validator = new RateValidationEngine({
        validation: {
          maxRateDeviation: 0.1,
          minQualityScore: 70
        },
        anomaly: {
          enabled: true,
          zScoreThreshold: 3
        }
      });
    });

    describe('Single Rate Validation', () => {
      it('should validate basic rate properties', async () => {
        const rateData = {
          rate: 0.85,
          timestamp: new Date(),
          provider: 'test'
        };

        const validation = await validator.validateSingleRate('USD/EUR', rateData);
        
        expect(validation.isValid).toBe(true);
        expect(validation.qualityScore).toBeGreaterThan(0);
        expect(validation.errors).toHaveLength(0);
      });

      it('should reject invalid rates', async () => {
        const invalidRates = [
          { rate: 0 },
          { rate: -1 },
          { rate: null },
          { rate: 'invalid' }
        ];

        for (const rateData of invalidRates) {
          const validation = await validator.validateSingleRate('USD/EUR', rateData);
          expect(validation.isValid).toBe(false);
          expect(validation.errors.length).toBeGreaterThan(0);
        }
      });

      it('should validate bid/ask spreads', async () => {
        const rateData = {
          rate: 0.85,
          bid: 0.849,
          ask: 0.851,
          timestamp: new Date()
        };

        const validation = await validator.validateSingleRate('USD/EUR', rateData);
        expect(validation.isValid).toBe(true);

        // Test invalid spread
        const invalidSpread = {
          rate: 0.85,
          bid: 0.851,
          ask: 0.849, // Ask < Bid
          timestamp: new Date()
        };

        const invalidValidation = await validator.validateSingleRate('USD/EUR', invalidSpread);
        expect(invalidValidation.isValid).toBe(false);
      });

      it('should detect stale data', async () => {
        const staleRateData = {
          rate: 0.85,
          timestamp: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
          provider: 'test'
        };

        const validation = await validator.validateSingleRate('USD/EUR', staleRateData);
        expect(validation.warnings.some(w => w.includes('Stale data'))).toBe(true);
      });
    });

    describe('Anomaly Detection', () => {
      it('should detect rate anomalies', async () => {
        // Add some normal rates to history
        for (let i = 0; i < 20; i++) {
          const normalRate = {
            rate: 0.85 + (Math.random() - 0.5) * 0.01, // Small variations around 0.85
            timestamp: new Date()
          };
          await validator.validateSingleRate('USD/EUR', normalRate);
        }

        // Now test an anomalous rate
        const anomalousRate = {
          rate: 1.20, // Significantly different
          timestamp: new Date()
        };

        const validation = await validator.validateSingleRate('USD/EUR', anomalousRate);
        expect(validation.anomalyScore).toBeGreaterThan(validator.config.anomaly.zScoreThreshold);
      });

      it('should handle insufficient history gracefully', async () => {
        const rateData = {
          rate: 0.85,
          timestamp: new Date()
        };

        const validation = await validator.validateSingleRate('USD/EUR', rateData);
        expect(validation.isValid).toBe(true);
        expect(validation.anomalyScore).toBe(0);
      });
    });

    describe('Cross-Rate Validation', () => {
      it('should detect triangular arbitrage opportunities', async () => {
        const rates = {
          'USD/EUR': { rate: 0.85, timestamp: new Date() },
          'EUR/GBP': { rate: 0.86, timestamp: new Date() },
          'GBP/USD': { rate: 1.35, timestamp: new Date() }
        };

        const validation = await validator.validateRates(rates);
        
        // Check if arbitrage opportunities are detected
        expect(validation.arbitrageOpportunities).toBeDefined();
        expect(Array.isArray(validation.arbitrageOpportunities)).toBe(true);
      });

      it('should detect rate inconsistencies', async () => {
        const rates = {
          'USD/EUR': { rate: 0.85, timestamp: new Date() },
          'EUR/USD': { rate: 1.20, timestamp: new Date() } // Should be ~1.176
        };

        const validation = await validator.validateRates(rates);
        expect(validation.crossRateValidation.inconsistencies.length).toBeGreaterThan(0);
      });
    });

    describe('Provider Reliability', () => {
      it('should track provider performance', async () => {
        const rates = {
          'USD/EUR': {
            rate: 0.85,
            providers: ['provider1', 'provider2'],
            qualityScore: 90,
            timestamp: new Date()
          }
        };

        const validation = await validator.validateRates(rates);
        expect(validation.providerReliability).toBeDefined();
        expect(validation.providerReliability.provider1).toBeDefined();
      });

      it('should update reliability scores over time', async () => {
        const highQualityRates = {
          'USD/EUR': {
            rate: 0.85,
            providers: ['reliable_provider'],
            qualityScore: 95,
            timestamp: new Date()
          }
        };

        await validator.validateRates(highQualityRates);
        
        const reliability1 = validator.getProviderReliability('reliable_provider');
        
        // Validate more high-quality rates
        await validator.validateRates(highQualityRates);
        
        const reliability2 = validator.getProviderReliability('reliable_provider');
        
        expect(reliability2.score).toBeGreaterThanOrEqual(reliability1.score);
      });
    });

    describe('Validation Statistics', () => {
      it('should track validation statistics', async () => {
        const rates = {
          'USD/EUR': { rate: 0.85, timestamp: new Date() }
        };

        await validator.validateRates(rates);
        
        const stats = validator.getValidationStats();
        expect(stats.totalValidations).toBeGreaterThan(0);
        expect(stats.passedValidations).toBeGreaterThan(0);
      });

      it('should provide quality metrics', async () => {
        const rates = {
          'USD/EUR': { rate: 0.85, timestamp: new Date() },
          'USD/GBP': { rate: 0.73, timestamp: new Date() }
        };

        await validator.validateRates(rates);
        
        const stats = validator.getValidationStats();
        expect(stats.qualityMetrics).toBeDefined();
        expect(stats.qualityMetrics.averageQualityScore).toBeGreaterThan(0);
      });
    });
  });

  describe('Integration Tests', () => {
    it('should integrate all components correctly', async () => {
      // Mock successful provider responses
      axios.get.mockImplementation((url) => {
        if (url.includes('fxapi')) {
          return Promise.resolve({
            data: {
              success: true,
              rates: { EUR: 0.85, GBP: 0.73 }
            }
          });
        }
        return Promise.resolve({
          data: {
            rates: { EUR: 0.84, GBP: 0.72 }
          }
        });
      });

      const eventSpy = jest.fn();
      pipeline.on('ratesUpdated', eventSpy);

      await pipeline.start();
      
      // Wait for initial fetch
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(eventSpy).toHaveBeenCalled();
      
      const eventData = eventSpy.mock.calls[0][0];
      expect(eventData.rates).toBeDefined();
      expect(eventData.validation).toBeDefined();
      expect(eventData.qualityScore).toBeGreaterThan(0);
      
      await pipeline.stop();
    });

    it('should handle end-to-end rate flow with validation and caching', async () => {
      // Mock provider response
      axios.get.mockResolvedValue({
        data: {
          success: true,
          rates: { EUR: 0.85 }
        }
      });

      await pipeline.start();
      
      // Fetch rates
      await pipeline.fetchRates();
      
      // Verify rate is cached and validated
      const rate = await pipeline.getRate('USD', 'EUR');
      expect(rate).toBeTruthy();
      expect(rate.rate).toBe(0.85);
      expect(rate.validation).toBeDefined();
      
      // Check validation stats
      const stats = pipeline.getValidationStats();
      expect(stats.totalValidations).toBeGreaterThan(0);
      
      await pipeline.stop();
    });
  });

  describe('Performance Tests', () => {
    it('should handle high-frequency rate updates', async () => {
      const startTime = Date.now();
      const rateCount = 100;
      
      const rates = {};
      for (let i = 0; i < rateCount; i++) {
        rates[`USD/CURR${i}`] = {
          rate: Math.random(),
          timestamp: new Date()
        };
      }

      await pipeline.validationEngine.validateRates(rates);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should process 100 rates in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);
    });

    it('should handle concurrent rate requests', async () => {
      await pipeline.rateCache.connect();
      
      // Set up some cached rates
      const rates = {
        'USD/EUR': { rate: 0.85, timestamp: new Date() },
        'USD/GBP': { rate: 0.73, timestamp: new Date() },
        'USD/JPY': { rate: 110, timestamp: new Date() }
      };
      
      await pipeline.rateCache.setRates(rates);
      
      // Make concurrent requests
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(pipeline.getRate('USD', 'EUR'));
        promises.push(pipeline.getRate('USD', 'GBP'));
        promises.push(pipeline.getRate('USD', 'JPY'));
      }
      
      const results = await Promise.all(promises);
      
      // All requests should succeed
      expect(results.every(r => r !== null)).toBe(true);
    });
  });
});