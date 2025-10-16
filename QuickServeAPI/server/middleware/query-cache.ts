/**
 * FinBot v4 - Query Cache Middleware
 * Caching middleware for database queries
 */

import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';

// In-memory cache (in production, use Redis)
const queryCache = new Map<string, {
  data: any;
  timestamp: number;
  ttl: number;
}>();

// Cache configuration
const CACHE_CONFIG = {
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  maxSize: 1000, // Maximum number of cached entries
  
  // Route-specific TTL settings
  routeTTL: {
    '/api/approval-workflows/dashboard/summary': 2 * 60 * 1000, // 2 minutes
    '/api/approval-workflows/pending/me': 1 * 60 * 1000, // 1 minute
    '/api/approval-workflows': 3 * 60 * 1000, // 3 minutes
  }
};

/**
 * Generate cache key from request
 */
const generateCacheKey = (req: Request): string => {
  const { method, path, query, user } = req;
  const keyData = {
    method,
    path,
    query: JSON.stringify(query),
    userId: user?.id || 'anonymous'
  };
  
  return createHash('md5').update(JSON.stringify(keyData)).digest('hex');
};

/**
 * Get TTL for specific route
 */
const getTTL = (path: string): number => {
  return CACHE_CONFIG.routeTTL[path] || CACHE_CONFIG.defaultTTL;
};

/**
 * Clean expired entries
 */
const cleanExpiredEntries = (): void => {
  const now = Date.now();
  const keysToDelete: string[] = [];
  
  for (const [key, entry] of queryCache.entries()) {
    if (now - entry.timestamp > entry.ttl) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => queryCache.delete(key));
};

/**
 * Enforce cache size limit
 */
const enforceCacheLimit = (): void => {
  if (queryCache.size > CACHE_CONFIG.maxSize) {
    // Remove oldest entries (simple LRU)
    const entries = Array.from(queryCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    const toRemove = entries.slice(0, queryCache.size - CACHE_CONFIG.maxSize);
    toRemove.forEach(([key]) => queryCache.delete(key));
  }
};

/**
 * Cache middleware for GET requests
 */
export const cacheQuery = (options: {
  ttl?: number;
  skipCache?: boolean;
  keyGenerator?: (req: Request) => string;
} = {}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET' || options.skipCache) {
      return next();
    }

    const cacheKey = options.keyGenerator ? options.keyGenerator(req) : generateCacheKey(req);
    const ttl = options.ttl || getTTL(req.path);
    
    // Check cache
    const cached = queryCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
      console.log(`Cache hit for key: ${cacheKey}`);
      return res.json({
        ...cached.data,
        cached: true,
        cacheAge: Date.now() - cached.timestamp
      });
    }

    // Override res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = function(data: any) {
      // Only cache successful responses
      if (res.statusCode === 200 && data.success) {
        queryCache.set(cacheKey, {
          data,
          timestamp: Date.now(),
          ttl
        });
        
        // Periodic cleanup
        if (Math.random() < 0.1) { // 10% chance
          cleanExpiredEntries();
          enforceCacheLimit();
        }
      }
      
      return originalJson(data);
    };

    next();
  };
};

/**
 * Invalidate cache entries by pattern
 */
export const invalidateCache = (pattern?: string | RegExp): void => {
  if (!pattern) {
    queryCache.clear();
    return;
  }

  const keysToDelete: string[] = [];
  
  for (const key of queryCache.keys()) {
    if (typeof pattern === 'string' && key.includes(pattern)) {
      keysToDelete.push(key);
    } else if (pattern instanceof RegExp && pattern.test(key)) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => queryCache.delete(key));
  console.log(`Invalidated ${keysToDelete.length} cache entries`);
};

/**
 * Cache invalidation middleware for write operations
 */
export const invalidateCacheOnWrite = (patterns: (string | RegExp)[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Override res.json to invalidate cache after successful write
    const originalJson = res.json.bind(res);
    res.json = function(data: any) {
      // Only invalidate on successful write operations
      if (res.statusCode < 400 && data.success) {
        patterns.forEach(pattern => invalidateCache(pattern));
      }
      
      return originalJson(data);
    };

    next();
  };
};

/**
 * Get cache statistics
 */
export const getCacheStats = () => {
  const now = Date.now();
  let validEntries = 0;
  let expiredEntries = 0;
  
  for (const entry of queryCache.values()) {
    if (now - entry.timestamp < entry.ttl) {
      validEntries++;
    } else {
      expiredEntries++;
    }
  }
  
  return {
    totalEntries: queryCache.size,
    validEntries,
    expiredEntries,
    hitRate: 0, // Would need to track hits/misses for accurate rate
    memoryUsage: process.memoryUsage().heapUsed
  };
};

/**
 * Warm cache with common queries
 */
export const warmCache = async () => {
  // This would typically be called on application startup
  // to pre-populate cache with frequently accessed data
  console.log('Cache warming not implemented yet');
};

// Periodic cleanup job
setInterval(() => {
  cleanExpiredEntries();
  enforceCacheLimit();
}, 5 * 60 * 1000); // Every 5 minutes