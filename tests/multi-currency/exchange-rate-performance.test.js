/**
 * Exchange Rate Engine Performance Tests
 * High-frequency and load testing for rate processing
 */

const { describe, it, beforeEach, afterEach, expect, jest } = require('@jest/globals');
const ExchangeRateIngestionPipeline = require('../../src/multi-currency/exchange-rate-engine/rate-ingestion-pipeline');
const RedisRateCache = require('../../src/multi-currency/exchange-rate-engine/redis-rate-cache');

// Mock external dependencies
jest.mock('ioredis');
jest.mock('axios');

const Redis = require('ioredis');

describe('Exchange Rate Engine Performance Tests', () => {
  let pipeline;
  let cache;
  let mockRedis;

  beforeEach(() => {
    // Mock Redis with performance-optimized responses
    mockRedis = {
      setex: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      mget: jest.fn().mockResolvedValue([]),
      pipeline: jest.fn().mockReturnValue({
        setex: jest.fn().mockReturnThis(),
        get: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([])
      }),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
      subscribe: jest.fn().mockResolvedValue(1),
      publish: jest.fn().mockResolvedValue(1),
      config: jest.fn().mockResolvedValue('OK'),
      keys: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(1),
      dbsize: jest.fn().mockResolvedValue(0),
      info: jest.fn().mockResolvedValue('used_memory:1024')
    };

    Redis.mockImplementation(() => mockRedis);

    const config = {
      providers: ['fxapi', 'exchangerate'],
      baseCurrency: 'USD',
      targetCurrencies: Array.from({ length: 50 }, (_, i) => `CURR${i}`), // 50 currencies
      enableKafka: false,
      enableStreaming: false,
      cache: {
        redis: { host: 'localhost', port: 6379 }
      }
    };

    pipeline = new ExchangeRateIngestionPipeline(config);
    cache = new RedisRateCache(config.cache);
  });

  afterEach(async () => {
    if (pipeline.isRunning) {
      await pipeline.stop();
    }
    if (cache.isConnected) {
      await cache.disconnect();
    }
    jest.clearAllMocks();
  });

  describe('High-Frequency Rate Updates', () => {
    it('should process 1000 rate updates within 1 second', async () => {
      await cache.connect();
      
      const rateCount = 1000;
      const rates = {};
      
      // Generate test rates
      for (let i = 0; i < rateCount; i++) {
        rates[`USD/CURR${i % 50}`] = {
          rate: Math.random() * 2,
          timestamp: new Date(),
          provider: 'test'
        };
      }

      const startTime = process.hrtime.bigint();
      
      // Process rates in batches for better performance
      const batchSize = 100;
      const batches = [];
      
      for (let i = 0; i < rateCount; i += batchSize) {
        const batch = {};
        for (let j = i; j < Math.min(i + batchSize, rateCount); j++) {
          const key = Object.keys(rates)[j];
          batch[key] = rates[key];
        }
        batches.push(batch);
      }

      // Process all batches
      await Promise.all(batches.map(batch => cache.setRates(batch)));
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(mockRedis.pipeline).toHaveBeenCalledTimes(batches.length);
    });

    it('should handle concurrent rate validation efficiently', async () => {
      const rateCount = 500;
      const rates = {};
      
      for (let i = 0; i < rateCount; i++) {
        rates[`USD/CURR${i % 20}`] = {
          rate: 1 + Math.random(),
          timestamp: new Date(),
          providers: ['provider1', 'provider2'],
          qualityScore: 80 + Math.random() * 20
        };
      }

      const startTime = process.hrtime.bigint();
      
      const validation = await pipeline.validationEngine.validateRates(rates);
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      expect(validation.overall.qualityScore).toBeGreaterThan(0);
      expect(Object.keys(validation.rates)).toHaveLength(Object.keys(rates).length);
    });

    it('should maintain performance under memory pressure', async () => {
      await cache.connect();
      
      // Fill cache with many rates to simulate memory pressure
      const largeDataSet = {};
      for (let i = 0; i < 10000; i++) {
        largeDataSet[`PAIR${i}`] = {
          rate: Math.random() * 100,
          timestamp: new Date(),
          provider: 'test',
          // Add some bulk to simulate real-world data
          metadata: {
            spread: Math.random() * 0.01,
            volume: Math.random() * 1000000,
            volatility: Math.random() * 0.1
          }
        };
      }

      const startTime = process.hrtime.bigint();
      
      // Process in chunks to avoid overwhelming the system
      const chunkSize = 1000;
      const chunks = [];
      const keys = Object.keys(largeDataSet);
      
      for (let i = 0; i < keys.length; i += chunkSize) {
        const chunk = {};
        for (let j = i; j < Math.min(i + chunkSize, keys.length); j++) {
          chunk[keys[j]] = largeDataSet[keys[j]];
        }
        chunks.push(chunk);
      }

      await Promise.all(chunks.map(chunk => cache.setRates(chunk, { ttl: 60 })));
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      // Should handle large dataset efficiently
      expect(duration).toBeLessThan(5000); // 5 seconds max
    });
  });

  describe('Concurrent Access Performance', () => {
    it('should handle 100 concurrent rate requests efficiently', async () => {
      await cache.connect();
      
      // Pre-populate cache
      const testRates = {};
      for (let i = 0; i < 20; i++) {
        testRates[`USD/CURR${i}`] = {
          rate: Math.random() * 2,
          timestamp: new Date(),
          provider: 'test'
        };
      }
      
      await cache.setRates(testRates);
      
      // Mock cache hits
      mockRedis.get.mockImplementation((key) => {
        const pair = key.replace('fx:rates:', '');
        if (testRates[pair]) {
          return Promise.resolve(JSON.stringify({
            ...testRates[pair],
            cachedAt: new Date().toISOString()
          }));
        }
        return Promise.resolve(null);
      });

      const startTime = process.hrtime.bigint();
      
      // Create 100 concurrent requests
      const requests = [];
      for (let i = 0; i < 100; i++) {
        const pair = `USD/CURR${i % 20}`;
        requests.push(cache.getRate(pair));
      }

      const results = await Promise.all(requests);
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      expect(duration).toBeLessThan(500); // Should complete within 500ms
      expect(results.filter(r => r !== null)).toHaveLength(100);
    });

    it('should efficiently handle mixed read/write operations', async () => {
      await cache.connect();
      
      const operations = [];
      const startTime = process.hrtime.bigint();
      
      // Mix of read and write operations
      for (let i = 0; i < 200; i++) {
        if (i % 3 === 0) {
          // Write operation
          operations.push(cache.setRate(`USD/CURR${i % 10}`, {
            rate: Math.random() * 2,
            timestamp: new Date(),
            provider: 'test'
          }));
        } else {
          // Read operation
          operations.push(cache.getRate(`USD/CURR${i % 10}`));
        }
      }

      await Promise.allSettled(operations);
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Memory Usage Optimization', () => {
    it('should maintain reasonable memory usage with large datasets', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Process large amount of rate data
      for (let batch = 0; batch < 10; batch++) {
        const rates = {};
        for (let i = 0; i < 1000; i++) {
          rates[`BATCH${batch}_PAIR${i}`] = {
            rate: Math.random() * 100,
            timestamp: new Date(),
            provider: 'test',
            bid: Math.random() * 100,
            ask: Math.random() * 100,
            spread: Math.random() * 0.01
          };
        }
        
        await pipeline.validationEngine.validateRates(rates);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });

    it('should efficiently manage cache eviction', async () => {
      await cache.connect();
      
      // Fill memory cache beyond its limit
      for (let i = 0; i < 2000; i++) {
        cache.setInMemoryCache(`PAIR${i}`, {
          rate: Math.random(),
          timestamp: new Date()
        });
      }

      // Memory cache should not exceed reasonable size
      expect(cache.memoryCacheStats.size).toBeLessThanOrEqual(1000);
    });
  });

  describe('Validation Performance', () => {
    it('should perform anomaly detection efficiently on large datasets', async () => {
      const validator = pipeline.validationEngine;
      
      // Build up history for multiple pairs
      for (let pair = 0; pair < 50; pair++) {
        for (let i = 0; i < 100; i++) {
          const rateData = {
            rate: 1 + Math.random() * 0.1, // Normal variation
            timestamp: new Date(Date.now() - i * 60000) // 1 minute intervals
          };
          await validator.validateSingleRate(`USD/CURR${pair}`, rateData);
        }
      }

      // Now test performance with anomaly detection
      const testRates = {};
      for (let i = 0; i < 50; i++) {
        testRates[`USD/CURR${i}`] = {
          rate: 1 + Math.random() * 0.1,
          timestamp: new Date(),
          providers: ['provider1', 'provider2']
        };
      }

      const startTime = process.hrtime.bigint();
      
      const validation = await validator.validateRates(testRates);
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(validation.overall.qualityScore).toBeGreaterThan(0);
    });

    it('should efficiently detect arbitrage opportunities', async () => {
      // Create a complex rate matrix
      const rates = {};
      const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'];
      
      // Generate rates for all currency pairs
      for (let i = 0; i < currencies.length; i++) {
        for (let j = i + 1; j < currencies.length; j++) {
          const base = currencies[i];
          const quote = currencies[j];
          rates[`${base}/${quote}`] = {
            rate: Math.random() * 2 + 0.5,
            timestamp: new Date(),
            providers: ['provider1']
          };
        }
      }

      const startTime = process.hrtime.bigint();
      
      const validation = await pipeline.validationEngine.validateRates(rates);
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      expect(validation.crossRateValidation).toBeDefined();
    });
  });

  describe('Streaming Performance', () => {
    it('should handle high-frequency streaming updates', async () => {
      const updateCount = 1000;
      const updates = [];
      
      const startTime = process.hrtime.bigint();
      
      // Simulate streaming updates
      for (let i = 0; i < updateCount; i++) {
        const rateUpdate = {
          pair: `USD/CURR${i % 10}`,
          rate: Math.random() * 2,
          timestamp: new Date(),
          provider: 'stream',
          isStreaming: true
        };
        
        updates.push(pipeline.updateSingleRate(rateUpdate));
      }

      await Promise.all(updates);
      
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;

      expect(duration).toBeLessThan(2000); // Should handle 1000 updates within 2 seconds
    });
  });

  describe('Resource Cleanup', () => {
    it('should properly clean up resources under load', async () => {
      await pipeline.start();
      
      // Simulate heavy load
      const operations = [];
      for (let i = 0; i < 100; i++) {
        operations.push(pipeline.fetchRates().catch(() => {})); // Ignore errors
      }

      await Promise.allSettled(operations);
      
      // Stop pipeline
      const stopStart = process.hrtime.bigint();
      await pipeline.stop();
      const stopEnd = process.hrtime.bigint();
      const stopDuration = Number(stopEnd - stopStart) / 1000000;

      // Should stop quickly even under load
      expect(stopDuration).toBeLessThan(1000);
      expect(pipeline.isRunning).toBe(false);
    });

    it('should handle graceful shutdown with pending operations', async () => {
      await cache.connect();
      
      // Start many operations
      const operations = [];
      for (let i = 0; i < 50; i++) {
        operations.push(cache.setRate(`USD/CURR${i}`, {
          rate: Math.random(),
          timestamp: new Date()
        }));
      }

      // Don't wait for operations to complete
      const disconnectStart = process.hrtime.bigint();
      await cache.disconnect();
      const disconnectEnd = process.hrtime.bigint();
      const disconnectDuration = Number(disconnectEnd - disconnectStart) / 1000000;

      // Should disconnect quickly
      expect(disconnectDuration).toBeLessThan(500);
      expect(cache.isConnected).toBe(false);
    });
  });

  describe('Benchmark Tests', () => {
    it('should meet performance benchmarks for rate processing', async () => {
      const benchmarks = {
        singleRateValidation: 10, // ms
        batchRateValidation: 1000, // ms for 100 rates
        cacheWrite: 5, // ms
        cacheRead: 2, // ms
        crossRateCalculation: 50 // ms
      };

      // Single rate validation benchmark
      const singleRateStart = process.hrtime.bigint();
      await pipeline.validationEngine.validateSingleRate('USD/EUR', {
        rate: 0.85,
        timestamp: new Date()
      });
      const singleRateEnd = process.hrtime.bigint();
      const singleRateDuration = Number(singleRateEnd - singleRateStart) / 1000000;
      
      expect(singleRateDuration).toBeLessThan(benchmarks.singleRateValidation);

      // Batch validation benchmark
      const batchRates = {};
      for (let i = 0; i < 100; i++) {
        batchRates[`USD/CURR${i}`] = {
          rate: Math.random() * 2,
          timestamp: new Date()
        };
      }

      const batchStart = process.hrtime.bigint();
      await pipeline.validationEngine.validateRates(batchRates);
      const batchEnd = process.hrtime.bigint();
      const batchDuration = Number(batchEnd - batchStart) / 1000000;
      
      expect(batchDuration).toBeLessThan(benchmarks.batchRateValidation);
    });
  });
});