/**
 * FinBot v4 - Advanced Cache Service
 * Multi-level caching with intelligent invalidation and warming
 */

import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';
import { EventEmitter } from 'events';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for group invalidation
  compress?: boolean; // Enable compression for large values
  serialize?: boolean; // Custom serialization
  namespace?: string; // Cache namespace
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
  memoryUsage: number;
  keyCount: number;
}

export interface CacheWarmupConfig {
  key: string;
  loader: () => Promise<any>;
  ttl?: number;
  tags?: string[];
  priority?: number;
}

export class AdvancedCacheService extends EventEmitter {
  private redis: Redis;
  private l1Cache: LRUCache<string, any>; // Memory cache (L1)
  private stats: CacheStats;
  private compressionThreshold = 1024; // Compress values larger than 1KB
  private defaultTTL = 3600; // 1 hour default TTL
  private keyPrefix = 'finbot:cache:';

  constructor() {
    super();
    this.initializeRedis();
    this.initializeL1Cache();
    this.initializeStats();
    this.setupEventHandlers();
  }

  /**
   * Initialize Redis connection
   */
  private initializeRedis() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_CACHE_DB || '1'),
      keyPrefix: this.keyPrefix,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4,
      // Compression and serialization
      compression: 'gzip',
      // Connection pool settings
      maxLoadingTimeout: 5000,
      enableReadyCheck: true
    });

    this.redis.on('connect', () => {
      console.log('Advanced cache service connected to Redis');
      this.emit('redis:connected');
    });

    this.redis.on('error', (error) => {
      console.error('Redis cache error:', error);
      this.emit('redis:error', error);
    });

    this.redis.on('reconnecting', () => {
      console.log('Redis cache reconnecting...');
      this.emit('redis:reconnecting');
    });
  }

  /**
   * Initialize L1 (memory) cache
   */
  private initializeL1Cache() {
    this.l1Cache = new LRUCache({
      max: 1000, // Maximum number of items
      maxSize: 50 * 1024 * 1024, // 50MB max size
      sizeCalculation: (value) => {
        return JSON.stringify(value).length;
      },
      ttl: 5 * 60 * 1000, // 5 minutes TTL for L1 cache
      allowStale: false,
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });
  }

  /**
   * Initialize cache statistics
   */
  private initializeStats() {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0,
      memoryUsage: 0,
      keyCount: 0
    };

    // Update stats periodically
    setInterval(() => {
      this.updateStats();
    }, 30000); // Every 30 seconds
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers() {
    // Handle cache events
    this.on('cache:hit', () => this.stats.hits++);
    this.on('cache:miss', () => this.stats.misses++);
    this.on('cache:set', () => this.stats.sets++);
    this.on('cache:delete', () => this.stats.deletes++);
  }

  /**
   * Get value from cache with multi-level lookup
   */
  async get<T>(key: string, options: CacheOptions = {}): Promise<T | null> {
    const fullKey = this.buildKey(key, options.namespace);

    try {
      // Try L1 cache first
      const l1Value = this.l1Cache.get(fullKey);
      if (l1Value !== undefined) {
        this.emit('cache:hit', { level: 'L1', key: fullKey });
        return l1Value;
      }

      // Try Redis (L2) cache
      const redisValue = await this.redis.get(fullKey);
      if (redisValue !== null) {
        const parsedValue = this.deserialize(redisValue);
        
        // Store in L1 cache for faster future access
        this.l1Cache.set(fullKey, parsedValue);
        
        this.emit('cache:hit', { level: 'L2', key: fullKey });
        return parsedValue;
      }

      this.emit('cache:miss', { key: fullKey });
      return null;

    } catch (error) {
      console.error('Cache get error:', error);
      this.emit('cache:error', { operation: 'get', key: fullKey, error });
      return null;
    }
  }

  /**
   * Set value in cache with multi-level storage
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<boolean> {
    const fullKey = this.buildKey(key, options.namespace);
    const ttl = options.ttl || this.defaultTTL;

    try {
      const serializedValue = this.serialize(value, options.compress);

      // Store in both L1 and L2 caches
      this.l1Cache.set(fullKey, value);
      
      // Set in Redis with TTL
      if (options.tags && options.tags.length > 0) {
        // Use pipeline for atomic operations with tags
        const pipeline = this.redis.pipeline();
        pipeline.setex(fullKey, ttl, serializedValue);
        
        // Add to tag sets for group invalidation
        options.tags.forEach(tag => {
          pipeline.sadd(`tag:${tag}`, fullKey);
          pipeline.expire(`tag:${tag}`, ttl + 300); // Tag expires 5 minutes after cache
        });
        
        await pipeline.exec();
      } else {
        await this.redis.setex(fullKey, ttl, serializedValue);
      }

      this.emit('cache:set', { key: fullKey, ttl, tags: options.tags });
      return true;

    } catch (error) {
      console.error('Cache set error:', error);
      this.emit('cache:error', { operation: 'set', key: fullKey, error });
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string, options: CacheOptions = {}): Promise<boolean> {
    const fullKey = this.buildKey(key, options.namespace);

    try {
      // Remove from both caches
      this.l1Cache.delete(fullKey);
      const result = await this.redis.del(fullKey);

      this.emit('cache:delete', { key: fullKey });
      return result > 0;

    } catch (error) {
      console.error('Cache delete error:', error);
      this.emit('cache:error', { operation: 'delete', key: fullKey, error });
      return false;
    }
  }

  /**
   * Get or set pattern - fetch from cache or execute loader function
   */
  async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // Execute loader function
    try {
      const value = await loader();
      
      // Store in cache
      await this.set(key, value, options);
      
      return value;
    } catch (error) {
      console.error('Cache loader error:', error);
      throw error;
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    let totalDeleted = 0;

    try {
      for (const tag of tags) {
        const tagKey = `tag:${tag}`;
        const keys = await this.redis.smembers(tagKey);
        
        if (keys.length > 0) {
          // Remove from L1 cache
          keys.forEach(key => this.l1Cache.delete(key));
          
          // Remove from Redis
          const deleted = await this.redis.del(...keys);
          totalDeleted += deleted;
          
          // Remove tag set
          await this.redis.del(tagKey);
        }
      }

      this.emit('cache:invalidate', { tags, keysDeleted: totalDeleted });
      return totalDeleted;

    } catch (error) {
      console.error('Cache invalidation error:', error);
      this.emit('cache:error', { operation: 'invalidateByTags', tags, error });
      return 0;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        // Remove from L1 cache
        keys.forEach(key => this.l1Cache.delete(key));
        
        // Remove from Redis
        const deleted = await this.redis.del(...keys);
        
        this.emit('cache:invalidate', { pattern, keysDeleted: deleted });
        return deleted;
      }

      return 0;

    } catch (error) {
      console.error('Cache pattern invalidation error:', error);
      this.emit('cache:error', { operation: 'invalidateByPattern', pattern, error });
      return 0;
    }
  }

  /**
   * Warm up cache with predefined data
   */
  async warmup(configs: CacheWarmupConfig[]): Promise<void> {
    console.log(`Starting cache warmup for ${configs.length} items...`);
    
    // Sort by priority (higher priority first)
    const sortedConfigs = configs.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    const warmupPromises = sortedConfigs.map(async (config) => {
      try {
        const value = await config.loader();
        await this.set(config.key, value, {
          ttl: config.ttl,
          tags: config.tags
        });
        console.log(`Cache warmed up: ${config.key}`);
      } catch (error) {
        console.error(`Cache warmup failed for ${config.key}:`, error);
      }
    });

    await Promise.allSettled(warmupPromises);
    console.log('Cache warmup completed');
    this.emit('cache:warmup:complete', { count: configs.length });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    await this.updateStats();
    return { ...this.stats };
  }

  /**
   * Update cache statistics
   */
  private async updateStats() {
    try {
      // Update hit rate
      const total = this.stats.hits + this.stats.misses;
      this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

      // Update memory usage and key count
      const info = await this.redis.memory('usage');
      this.stats.memoryUsage = info || 0;
      
      const keyCount = await this.redis.dbsize();
      this.stats.keyCount = keyCount;

    } catch (error) {
      console.error('Error updating cache stats:', error);
    }
  }

  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    try {
      this.l1Cache.clear();
      await this.redis.flushdb();
      
      this.emit('cache:clear');
      console.log('All caches cleared');

    } catch (error) {
      console.error('Cache clear error:', error);
      this.emit('cache:error', { operation: 'clear', error });
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    redis: boolean;
    l1Cache: boolean;
    stats: CacheStats;
  }> {
    let redisHealthy = false;
    let l1CacheHealthy = false;

    try {
      // Test Redis connection
      await this.redis.ping();
      redisHealthy = true;
    } catch (error) {
      console.error('Redis health check failed:', error);
    }

    try {
      // Test L1 cache
      this.l1Cache.set('health-check', 'ok');
      const value = this.l1Cache.get('health-check');
      l1CacheHealthy = value === 'ok';
      this.l1Cache.delete('health-check');
    } catch (error) {
      console.error('L1 cache health check failed:', error);
    }

    const stats = await this.getStats();
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (redisHealthy && l1CacheHealthy) {
      status = 'healthy';
    } else if (redisHealthy || l1CacheHealthy) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      redis: redisHealthy,
      l1Cache: l1CacheHealthy,
      stats
    };
  }

  /**
   * Build cache key with namespace
   */
  private buildKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  /**
   * Serialize value for storage
   */
  private serialize(value: any, compress = false): string {
    const serialized = JSON.stringify(value);
    
    if (compress && serialized.length > this.compressionThreshold) {
      // Would implement compression here (e.g., using zlib)
      return serialized;
    }
    
    return serialized;
  }

  /**
   * Deserialize value from storage
   */
  private deserialize(value: string): any {
    try {
      return JSON.parse(value);
    } catch (error) {
      console.error('Cache deserialization error:', error);
      return null;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      this.l1Cache.clear();
      await this.redis.quit();
      this.removeAllListeners();
      console.log('Advanced cache service cleaned up');
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  }
}

// Export singleton instance
export const advancedCacheService = new AdvancedCacheService();