/**
 * Redis-based Rate Caching System
 * Multi-level caching strategy for exchange rates with intelligent refresh
 */

const Redis = require('ioredis');
const EventEmitter = require('events');
const logger = require('../../utils/logger');

class RedisRateCache extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      redis: {
        host: config.redis?.host || process.env.REDIS_HOST || 'localhost',
        port: config.redis?.port || process.env.REDIS_PORT || 6379,
        password: config.redis?.password || process.env.REDIS_PASSWORD,
        db: config.redis?.db || 0,
        keyPrefix: config.redis?.keyPrefix || 'fx:rates:',
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      },
      cache: {
        defaultTTL: config.cache?.defaultTTL || 300, // 5 minutes
        alertTTL: config.cache?.alertTTL || 86400, // 24 hours
        historicalTTL: config.cache?.historicalTTL || 604800, // 7 days
        maxMemoryUsage: config.cache?.maxMemoryUsage || '2gb',
        evictionPolicy: config.cache?.evictionPolicy || 'allkeys-lru'
      },
      alerts: {
        enabled: config.alerts?.enabled || true,
        thresholds: config.alerts?.thresholds || {},
        notificationDelay: config.alerts?.notificationDelay || 60000 // 1 minute
      },
      compression: {
        enabled: config.compression?.enabled || true,
        algorithm: config.compression?.algorithm || 'gzip',
        threshold: config.compression?.threshold || 1024 // bytes
      },
      ...config
    };

    // Redis clients
    this.redis = null;
    this.subscriber = null;
    this.publisher = null;

    // In-memory L1 cache
    this.memoryCache = new Map();
    this.memoryCacheStats = {
      hits: 0,
      misses: 0,
      size: 0
    };

    // Alert system
    this.alertThresholds = new Map();
    this.lastAlerts = new Map();
    this.alertQueue = [];

    // Cache statistics
    this.stats = {
      l1Hits: 0,
      l1Misses: 0,
      l2Hits: 0,
      l2Misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      totalRequests: 0
    };

    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
  }

  async connect() {
    try {
      // Main Redis client
      this.redis = new Redis(this.config.redis);
      
      // Subscriber for rate alerts
      this.subscriber = new Redis(this.config.redis);
      
      // Publisher for rate updates
      this.publisher = new Redis(this.config.redis);

      // Set up event handlers
      this.setupEventHandlers();

      // Configure Redis memory settings
      await this.configureRedis();

      // Subscribe to rate update channels
      await this.setupSubscriptions();

      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      logger.info('Redis rate cache connected successfully');
      this.emit('connected');

    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      this.handleConnectionError(error);
      throw error;
    }
  }

  async disconnect() {
    this.isConnected = false;
    
    if (this.redis) {
      await this.redis.quit();
    }
    if (this.subscriber) {
      await this.subscriber.quit();
    }
    if (this.publisher) {
      await this.publisher.quit();
    }

    this.memoryCache.clear();
    logger.info('Redis rate cache disconnected');
    this.emit('disconnected');
  }

  setupEventHandlers() {
    // Redis connection events
    this.redis.on('connect', () => {
      logger.info('Redis connected');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis error:', error);
      this.stats.errors++;
      this.handleConnectionError(error);
    });

    this.redis.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });

    // Subscriber events
    this.subscriber.on('message', (channel, message) => {
      this.handleRateUpdate(channel, message);
    });

    this.subscriber.on('error', (error) => {
      logger.error('Redis subscriber error:', error);
    });
  }

  async configureRedis() {
    try {
      // Set memory policy
      await this.redis.config('SET', 'maxmemory-policy', this.config.cache.evictionPolicy);
      
      // Set max memory if specified
      if (this.config.cache.maxMemoryUsage) {
        await this.redis.config('SET', 'maxmemory', this.config.cache.maxMemoryUsage);
      }

      logger.debug('Redis configured successfully');
    } catch (error) {
      logger.warn('Failed to configure Redis:', error);
    }
  }

  async setupSubscriptions() {
    try {
      // Subscribe to rate update channels
      await this.subscriber.subscribe('fx:rates:updates');
      await this.subscriber.subscribe('fx:rates:alerts');
      
      logger.debug('Subscribed to Redis channels');
    } catch (error) {
      logger.error('Failed to setup Redis subscriptions:', error);
    }
  }

  handleConnectionError(error) {
    this.isConnected = false;
    this.emit('error', error);

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      
      setTimeout(() => {
        logger.info(`Attempting to reconnect to Redis (attempt ${this.reconnectAttempts})`);
        this.connect().catch(err => {
          logger.error('Reconnection failed:', err);
        });
      }, delay);
    } else {
      logger.error('Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
    }
  }

  // Core caching methods

  async getRate(pair, options = {}) {
    this.stats.totalRequests++;
    
    try {
      // L1 Cache (Memory) check
      const memoryResult = this.getFromMemoryCache(pair);
      if (memoryResult && !this.isStale(memoryResult, options.maxAge)) {
        this.stats.l1Hits++;
        return memoryResult;
      }
      this.stats.l1Misses++;

      // L2 Cache (Redis) check
      const redisResult = await this.getFromRedisCache(pair, options);
      if (redisResult) {
        this.stats.l2Hits++;
        // Update L1 cache
        this.setInMemoryCache(pair, redisResult);
        return redisResult;
      }
      this.stats.l2Misses++;

      return null;

    } catch (error) {
      logger.error(`Error getting rate for ${pair}:`, error);
      this.stats.errors++;
      
      // Fallback to memory cache even if stale
      const fallback = this.getFromMemoryCache(pair);
      if (fallback) {
        logger.warn(`Using stale cache data for ${pair}`);
        return { ...fallback, isStale: true };
      }
      
      throw error;
    }
  }

  async setRate(pair, rateData, options = {}) {
    try {
      const ttl = options.ttl || this.config.cache.defaultTTL;
      const enrichedData = {
        ...rateData,
        cachedAt: new Date().toISOString(),
        ttl: ttl
      };

      // Set in Redis (L2)
      await this.setInRedisCache(pair, enrichedData, ttl);
      
      // Set in Memory (L1)
      this.setInMemoryCache(pair, enrichedData);

      // Publish update notification
      await this.publishRateUpdate(pair, enrichedData);

      // Check for alerts
      await this.checkRateAlerts(pair, rateData);

      this.stats.sets++;
      
    } catch (error) {
      logger.error(`Error setting rate for ${pair}:`, error);
      this.stats.errors++;
      throw error;
    }
  }

  async setRates(rates, options = {}) {
    const pipeline = this.redis.pipeline();
    const ttl = options.ttl || this.config.cache.defaultTTL;

    try {
      for (const [pair, rateData] of Object.entries(rates)) {
        const enrichedData = {
          ...rateData,
          cachedAt: new Date().toISOString(),
          ttl: ttl
        };

        // Add to pipeline
        const key = this.buildKey(pair);
        const value = await this.serializeData(enrichedData);
        pipeline.setex(key, ttl, value);

        // Set in memory cache
        this.setInMemoryCache(pair, enrichedData);

        // Check for alerts (async)
        this.checkRateAlerts(pair, rateData).catch(err => {
          logger.warn(`Alert check failed for ${pair}:`, err);
        });
      }

      // Execute pipeline
      await pipeline.exec();

      // Publish batch update
      await this.publishBatchUpdate(rates);

      this.stats.sets += Object.keys(rates).length;
      
    } catch (error) {
      logger.error('Error setting batch rates:', error);
      this.stats.errors++;
      throw error;
    }
  }

  async deleteRate(pair) {
    try {
      const key = this.buildKey(pair);
      
      // Delete from Redis
      await this.redis.del(key);
      
      // Delete from memory cache
      this.memoryCache.delete(pair);

      this.stats.deletes++;
      
    } catch (error) {
      logger.error(`Error deleting rate for ${pair}:`, error);
      this.stats.errors++;
      throw error;
    }
  }

  // Memory cache methods

  getFromMemoryCache(pair) {
    const data = this.memoryCache.get(pair);
    if (data) {
      this.memoryCacheStats.hits++;
      return data;
    }
    this.memoryCacheStats.misses++;
    return null;
  }

  setInMemoryCache(pair, data) {
    // Implement LRU eviction if cache is getting too large
    if (this.memoryCache.size >= 1000) { // Max 1000 items in memory
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }

    this.memoryCache.set(pair, data);
    this.memoryCacheStats.size = this.memoryCache.size;
  }

  // Redis cache methods

  async getFromRedisCache(pair, options = {}) {
    if (!this.isConnected) {
      return null;
    }

    try {
      const key = this.buildKey(pair);
      const value = await this.redis.get(key);
      
      if (!value) {
        return null;
      }

      const data = await this.deserializeData(value);
      
      // Check if data is stale
      if (this.isStale(data, options.maxAge)) {
        return options.allowStale ? { ...data, isStale: true } : null;
      }

      return data;
      
    } catch (error) {
      logger.error(`Redis get error for ${pair}:`, error);
      return null;
    }
  }

  async setInRedisCache(pair, data, ttl) {
    if (!this.isConnected) {
      return;
    }

    try {
      const key = this.buildKey(pair);
      const value = await this.serializeData(data);
      
      await this.redis.setex(key, ttl, value);
      
    } catch (error) {
      logger.error(`Redis set error for ${pair}:`, error);
      throw error;
    }
  }

  // Alert system methods

  async setRateAlert(pair, threshold, direction = 'both', options = {}) {
    const alertKey = `alert:${pair}`;
    const alertData = {
      pair,
      threshold,
      direction, // 'above', 'below', 'both'
      enabled: true,
      createdAt: new Date().toISOString(),
      lastTriggered: null,
      triggerCount: 0,
      ...options
    };

    this.alertThresholds.set(alertKey, alertData);

    // Store in Redis for persistence
    if (this.isConnected) {
      try {
        const key = this.buildKey(alertKey);
        const value = await this.serializeData(alertData);
        await this.redis.setex(key, this.config.cache.alertTTL, value);
      } catch (error) {
        logger.error(`Error storing alert for ${pair}:`, error);
      }
    }

    logger.info(`Rate alert set for ${pair}: ${direction} ${threshold}`);
  }

  async checkRateAlerts(pair, rateData) {
    if (!this.config.alerts.enabled) {
      return;
    }

    const alertKey = `alert:${pair}`;
    let alertConfig = this.alertThresholds.get(alertKey);

    // Load from Redis if not in memory
    if (!alertConfig && this.isConnected) {
      try {
        const key = this.buildKey(alertKey);
        const value = await this.redis.get(key);
        if (value) {
          alertConfig = await this.deserializeData(value);
          this.alertThresholds.set(alertKey, alertConfig);
        }
      } catch (error) {
        logger.warn(`Error loading alert config for ${pair}:`, error);
      }
    }

    if (!alertConfig || !alertConfig.enabled) {
      return;
    }

    const currentRate = rateData.rate;
    const threshold = alertConfig.threshold;
    let shouldTrigger = false;

    switch (alertConfig.direction) {
      case 'above':
        shouldTrigger = currentRate > threshold;
        break;
      case 'below':
        shouldTrigger = currentRate < threshold;
        break;
      case 'both':
        shouldTrigger = Math.abs(currentRate - threshold) > (threshold * 0.01); // 1% deviation
        break;
    }

    if (shouldTrigger) {
      await this.triggerRateAlert(pair, rateData, alertConfig);
    }
  }

  async triggerRateAlert(pair, rateData, alertConfig) {
    const now = new Date();
    const lastAlert = this.lastAlerts.get(pair);

    // Rate limiting: don't send alerts too frequently
    if (lastAlert && (now - lastAlert) < this.config.alerts.notificationDelay) {
      return;
    }

    const alert = {
      pair,
      currentRate: rateData.rate,
      threshold: alertConfig.threshold,
      direction: alertConfig.direction,
      timestamp: now.toISOString(),
      rateData
    };

    // Update alert statistics
    alertConfig.lastTriggered = now.toISOString();
    alertConfig.triggerCount++;
    this.alertThresholds.set(`alert:${pair}`, alertConfig);

    // Store last alert time
    this.lastAlerts.set(pair, now);

    // Publish alert
    if (this.isConnected) {
      try {
        await this.publisher.publish('fx:rates:alerts', JSON.stringify(alert));
      } catch (error) {
        logger.error('Error publishing rate alert:', error);
      }
    }

    // Emit alert event
    this.emit('rateAlert', alert);

    logger.info(`Rate alert triggered for ${pair}: ${rateData.rate} (threshold: ${alertConfig.threshold})`);
  }

  // Utility methods

  buildKey(identifier) {
    return `${this.config.redis.keyPrefix}${identifier}`;
  }

  async serializeData(data) {
    let serialized = JSON.stringify(data);
    
    if (this.config.compression.enabled && serialized.length > this.config.compression.threshold) {
      const zlib = require('zlib');
      const compressed = zlib.gzipSync(serialized);
      return `gzip:${compressed.toString('base64')}`;
    }
    
    return serialized;
  }

  async deserializeData(value) {
    if (value.startsWith('gzip:')) {
      const zlib = require('zlib');
      const compressed = Buffer.from(value.substring(5), 'base64');
      const decompressed = zlib.gunzipSync(compressed);
      return JSON.parse(decompressed.toString());
    }
    
    return JSON.parse(value);
  }

  isStale(data, maxAge) {
    if (!maxAge) {
      maxAge = this.config.cache.defaultTTL * 1000; // Convert to milliseconds
    }
    
    const cachedAt = new Date(data.cachedAt);
    const age = Date.now() - cachedAt.getTime();
    
    return age > maxAge;
  }

  // Rate update publishing

  async publishRateUpdate(pair, rateData) {
    if (!this.isConnected) {
      return;
    }

    try {
      const update = {
        pair,
        rate: rateData.rate,
        timestamp: new Date().toISOString(),
        source: 'cache'
      };

      await this.publisher.publish('fx:rates:updates', JSON.stringify(update));
    } catch (error) {
      logger.error('Error publishing rate update:', error);
    }
  }

  async publishBatchUpdate(rates) {
    if (!this.isConnected) {
      return;
    }

    try {
      const update = {
        type: 'batch',
        pairs: Object.keys(rates),
        timestamp: new Date().toISOString(),
        count: Object.keys(rates).length
      };

      await this.publisher.publish('fx:rates:updates', JSON.stringify(update));
    } catch (error) {
      logger.error('Error publishing batch update:', error);
    }
  }

  handleRateUpdate(channel, message) {
    try {
      const data = JSON.parse(message);
      
      if (channel === 'fx:rates:updates') {
        this.emit('rateUpdate', data);
      } else if (channel === 'fx:rates:alerts') {
        this.emit('rateAlert', data);
      }
    } catch (error) {
      logger.error('Error handling rate update:', error);
    }
  }

  // Cache management methods

  async clearCache(pattern = '*') {
    try {
      const keys = await this.redis.keys(this.buildKey(pattern));
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info(`Cleared ${keys.length} cache entries`);
      }

      // Clear memory cache
      this.memoryCache.clear();
      this.memoryCacheStats.size = 0;
      
    } catch (error) {
      logger.error('Error clearing cache:', error);
      throw error;
    }
  }

  async getCacheInfo() {
    const info = {
      isConnected: this.isConnected,
      stats: { ...this.stats },
      memoryCache: { ...this.memoryCacheStats },
      alertCount: this.alertThresholds.size,
      config: {
        defaultTTL: this.config.cache.defaultTTL,
        maxMemoryUsage: this.config.cache.maxMemoryUsage,
        evictionPolicy: this.config.cache.evictionPolicy
      }
    };

    if (this.isConnected) {
      try {
        const redisInfo = await this.redis.info('memory');
        const keyCount = await this.redis.dbsize();
        
        info.redis = {
          keyCount,
          memoryInfo: this.parseRedisInfo(redisInfo)
        };
      } catch (error) {
        logger.warn('Error getting Redis info:', error);
      }
    }

    return info;
  }

  parseRedisInfo(infoString) {
    const info = {};
    const lines = infoString.split('\r\n');
    
    lines.forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        info[key] = value;
      }
    });
    
    return info;
  }

  // Health check
  async healthCheck() {
    const health = {
      status: 'healthy',
      isConnected: this.isConnected,
      errors: [],
      metrics: await this.getCacheInfo()
    };

    try {
      if (this.isConnected) {
        // Test Redis connectivity
        const testKey = this.buildKey('health:test');
        await this.redis.setex(testKey, 10, 'test');
        const testValue = await this.redis.get(testKey);
        
        if (testValue !== 'test') {
          health.status = 'degraded';
          health.errors.push('Redis read/write test failed');
        }
        
        await this.redis.del(testKey);
      } else {
        health.status = 'unhealthy';
        health.errors.push('Redis not connected');
      }

      // Check error rate
      const errorRate = this.stats.errors / Math.max(this.stats.totalRequests, 1);
      if (errorRate > 0.1) { // 10% error rate
        health.status = 'degraded';
        health.errors.push(`High error rate: ${(errorRate * 100).toFixed(2)}%`);
      }

    } catch (error) {
      health.status = 'unhealthy';
      health.errors.push(`Health check failed: ${error.message}`);
    }

    return health;
  }
}

module.exports = RedisRateCache;