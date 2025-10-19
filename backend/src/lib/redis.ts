import Redis from 'redis';

let redis: Redis.RedisClientType | null = null;

export async function connectRedis() {
  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    redis = Redis.createClient({
      url: redisUrl,
    });

    redis.on('error', (err) => {
      console.error('❌ Redis Client Error:', err);
    });

    redis.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    redis.on('ready', () => {
      console.log('✅ Redis ready for operations');
    });

    redis.on('end', () => {
      console.log('🔌 Redis connection closed');
    });

    await redis.connect();
    return redis;
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    throw error;
  }
}

export async function disconnectRedis() {
  if (redis) {
    try {
      await redis.quit();
      redis = null;
      console.log('✅ Redis disconnected successfully');
    } catch (error) {
      console.error('❌ Redis disconnection failed:', error);
    }
  }
}

export function getRedisClient(): Redis.RedisClientType {
  if (!redis) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redis;
}

// Cache utilities
export class CacheManager {
  private client: Redis.RedisClientType;

  constructor(client: Redis.RedisClientType) {
    this.client = client;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  async flush(): Promise<boolean> {
    try {
      await this.client.flushAll();
      return true;
    } catch (error) {
      console.error('Cache flush error:', error);
      return false;
    }
  }

  // Session management
  async setSession(sessionId: string, sessionData: any, ttlSeconds: number = 3600): Promise<boolean> {
    return this.set(`session:${sessionId}`, sessionData, ttlSeconds);
  }

  async getSession<T>(sessionId: string): Promise<T | null> {
    return this.get<T>(`session:${sessionId}`);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.del(`session:${sessionId}`);
  }

  // User-specific caching
  async setUserCache<T>(userId: string, key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    return this.set(`user:${userId}:${key}`, value, ttlSeconds);
  }

  async getUserCache<T>(userId: string, key: string): Promise<T | null> {
    return this.get<T>(`user:${userId}:${key}`);
  }

  async deleteUserCache(userId: string, key: string): Promise<boolean> {
    return this.del(`user:${userId}:${key}`);
  }

  // Notification queue
  async queueNotification(notification: any): Promise<boolean> {
    try {
      await this.client.lPush('notifications:queue', JSON.stringify(notification));
      return true;
    } catch (error) {
      console.error('Queue notification error:', error);
      return false;
    }
  }

  async dequeueNotification(): Promise<any | null> {
    try {
      const notification = await this.client.rPop('notifications:queue');
      return notification ? JSON.parse(notification) : null;
    } catch (error) {
      console.error('Dequeue notification error:', error);
      return null;
    }
  }

  // Rate limiting
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    try {
      const current = await this.client.incr(key);
      
      if (current === 1) {
        await this.client.expire(key, windowSeconds);
      }

      const ttl = await this.client.ttl(key);
      const resetTime = Date.now() + (ttl * 1000);

      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
        resetTime
      };
    } catch (error) {
      console.error('Rate limit check error:', error);
      return { allowed: true, remaining: limit, resetTime: Date.now() + (windowSeconds * 1000) };
    }
  }
}

// Health check
export async function checkRedisHealth() {
  try {
    if (!redis) {
      return { status: 'unhealthy', error: 'Redis client not initialized' };
    }

    await redis.ping();
    return { status: 'healthy', timestamp: new Date().toISOString() };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString() 
    };
  }
}

export { redis };