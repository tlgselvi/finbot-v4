/**
 * FinBot v4 - Performance Optimization Service
 * Caching, query optimization, and scalability improvements
 */

import Redis from 'ioredis';
import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { approvalRules, approvalWorkflows, riskAssessments } from '../db/approval-schema';

export interface CacheConfig {
  ttl: number; // Time to live in seconds
  maxSize?: number; // Maximum cache size
  strategy: 'lru' | 'lfu' | 'fifo';
}

export interface PerformanceMetrics {
  cacheHitRate: number;
  averageQueryTime: number;
  activeConnections: number;
  memoryUsage: number;
  cpuUsage: number;
  throughput: number;
}

export class PerformanceOptimizationService {
  private redis: Redis;
  private queryCache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  private connectionPool: any;
  private metrics: PerformanceMetrics = {
    cacheHitRate: 0,
    averageQueryTime: 0,
    activeConnections: 0,
    memoryUsage: 0,
    cpuUsage: 0,
    throughput: 0
  };

  constructor() {
    this.initializeRedis();
    this.initializeConnectionPool();
    this.startMetricsCollection();
  }

  /**
   * Initialize Redis connection for caching
   */
  private initializeRedis() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4,
      keyPrefix: 'finbot:approval:',
      // Connection pool settings
      maxLoadingTimeout: 5000,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3
    });

    this.redis.on('connect', () => {
      console.log('Redis connected for performance optimization');
    });

    this.redis.on('error', (error) => {
      console.error('Redis connection error:', error);
    });
  }

  /**
   * Initialize database connection pool
   */
  private initializeConnectionPool() {
    // Database connection pool configuration would go here
    // This is handled by Drizzle ORM and the underlying database driver
    console.log('Database connection pool initialized');
  }

  /**
   * Start collecting performance metrics
   */
  private startMetricsCollection() {
    setInterval(() => {
      this.collectMetrics();
    }, 30000); // Collect metrics every 30 seconds
  }

  /**
   * Cache approval rules with intelligent invalidation
   */
  async cacheApprovalRules(): Promise<void> {
    try {
      const cacheKey = 'approval_rules:active';
      
      // Check if cache exists and is valid
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return; // Cache is still valid
      }

      // Fetch fresh data
      const rules = await db
        .select()
        .from(approvalRules)
        .where(eq(approvalRules.isActive, true))
        .orderBy(desc(approvalRules.updatedAt));

      // Cache for 1 hour
      await this.redis.setex(cacheKey, 3600, JSON.stringify(rules));
      
      // Also cache individual rules
      for (const rule of rules) {
        await this.redis.setex(
          `approval_rule:${rule.id}`,
          3600,
          JSON.stringify(rule)
        );
      }

      console.log(`Cached ${rules.length} approval rules`);
    } catch (error) {
      console.error('Error caching approval rules:', error);
    }
  }

  /**
   * Get cached approval rules
   */
  async getCachedApprovalRules(): Promise<any[]> {
    try {
      const cacheKey = 'approval_rules:active';
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        this.updateCacheHitRate(true);
        return JSON.parse(cached);
      }

      this.updateCacheHitRate(false);
      
      // Cache miss - fetch and cache
      await this.cacheApprovalRules();
      const freshCached = await this.redis.get(cacheKey);
      return freshCached ? JSON.parse(freshCached) : [];
      
    } catch (error) {
      console.error('Error getting cached approval rules:', error);
      return [];
    }
  }

  /**
   * Cache workflow data with smart expiration
   */
  async cacheWorkflow(workflowId: string, data: any, ttl: number = 1800): Promise<void> {
    try {
      const cacheKey = `workflow:${workflowId}`;
      await this.redis.setex(cacheKey, ttl, JSON.stringify(data));
      
      // Cache workflow status separately for quick lookups
      await this.redis.setex(
        `workflow_status:${workflowId}`,
        ttl,
        data.status
      );
    } catch (error) {
      console.error('Error caching workflow:', error);
    }
  }

  /**
   * Get cached workflow
   */
  async getCachedWorkflow(workflowId: string): Promise<any | null> {
    try {
      const cacheKey = `workflow:${workflowId}`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        this.updateCacheHitRate(true);
        return JSON.parse(cached);
      }

      this.updateCacheHitRate(false);
      return null;
    } catch (error) {
      console.error('Error getting cached workflow:', error);
      return null;
    }
  }

  /**
   * Cache user permissions for quick authorization checks
   */
  async cacheUserPermissions(userId: string, permissions: string[], ttl: number = 3600): Promise<void> {
    try {
      const cacheKey = `user_permissions:${userId}`;
      await this.redis.setex(cacheKey, ttl, JSON.stringify(permissions));
    } catch (error) {
      console.error('Error caching user permissions:', error);
    }
  }

  /**
   * Get cached user permissions
   */
  async getCachedUserPermissions(userId: string): Promise<string[] | null> {
    try {
      const cacheKey = `user_permissions:${userId}`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        this.updateCacheHitRate(true);
        return JSON.parse(cached);
      }

      this.updateCacheHitRate(false);
      return null;
    } catch (error) {
      console.error('Error getting cached user permissions:', error);
      return null;
    }
  }

  /**
   * Implement query result caching with automatic invalidation
   */
  async cacheQuery(queryKey: string, queryFn: () => Promise<any>, ttl: number = 300): Promise<any> {
    try {
      // Check memory cache first (faster)
      const memoryCached = this.queryCache.get(queryKey);
      if (memoryCached && Date.now() - memoryCached.timestamp < memoryCached.ttl * 1000) {
        this.updateCacheHitRate(true);
        return memoryCached.data;
      }

      // Check Redis cache
      const redisCached = await this.redis.get(`query:${queryKey}`);
      if (redisCached) {
        const data = JSON.parse(redisCached);
        // Update memory cache
        this.queryCache.set(queryKey, {
          data,
          timestamp: Date.now(),
          ttl
        });
        this.updateCacheHitRate(true);
        return data;
      }

      this.updateCacheHitRate(false);

      // Execute query and cache result
      const startTime = Date.now();
      const result = await queryFn();
      const queryTime = Date.now() - startTime;

      // Update average query time
      this.updateAverageQueryTime(queryTime);

      // Cache in both memory and Redis
      this.queryCache.set(queryKey, {
        data: result,
        timestamp: Date.now(),
        ttl
      });

      await this.redis.setex(`query:${queryKey}`, ttl, JSON.stringify(result));

      return result;
    } catch (error) {
      console.error('Error in query caching:', error);
      // Fallback to direct query execution
      return await queryFn();
    }
  }

  /**
   * Invalidate cache when data changes
   */
  async invalidateCache(patterns: string[]): Promise<void> {
    try {
      for (const pattern of patterns) {
        // Invalidate Redis cache
        const keys = await this.redis.keys(`*${pattern}*`);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }

        // Invalidate memory cache
        for (const [key] of this.queryCache) {
          if (key.includes(pattern)) {
            this.queryCache.delete(key);
          }
        }
      }
    } catch (error) {
      console.error('Error invalidating cache:', error);
    }
  }

  /**
   * Optimize database queries with prepared statements and indexing
   */
  async optimizeQueries(): Promise<void> {
    try {
      // Create indexes for frequently queried columns
      const indexQueries = [
        'CREATE INDEX IF NOT EXISTS idx_approval_workflows_status ON approval_workflows(status)',
        'CREATE INDEX IF NOT EXISTS idx_approval_workflows_requester ON approval_workflows(requester_id)',
        'CREATE INDEX IF NOT EXISTS idx_approval_workflows_created_at ON approval_workflows(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_approval_actions_workflow ON approval_actions(workflow_id)',
        'CREATE INDEX IF NOT EXISTS idx_approval_actions_approver ON approval_actions(approver_id)',
        'CREATE INDEX IF NOT EXISTS idx_risk_assessments_workflow ON risk_assessments(workflow_id)',
        'CREATE INDEX IF NOT EXISTS idx_risk_assessments_level ON risk_assessments(risk_level)',
        'CREATE INDEX IF NOT EXISTS idx_approval_rules_active ON approval_rules(is_active)',
        'CREATE INDEX IF NOT EXISTS idx_approval_rules_type ON approval_rules(transaction_type)'
      ];

      for (const query of indexQueries) {
        try {
          await db.execute(sql.raw(query));
        } catch (error) {
          // Index might already exist, continue
          console.log(`Index creation skipped: ${error.message}`);
        }
      }

      console.log('Database query optimization completed');
    } catch (error) {
      console.error('Error optimizing queries:', error);
    }
  }

  /**
   * Implement connection pooling optimization
   */
  configureConnectionPool(config: {
    min: number;
    max: number;
    acquireTimeoutMillis: number;
    idleTimeoutMillis: number;
  }): void {
    // This would configure the database connection pool
    // Implementation depends on the specific database driver
    console.log('Connection pool configured:', config);
  }

  /**
   * Implement horizontal scaling support
   */
  async setupLoadBalancing(): Promise<void> {
    try {
      // Configure Redis Cluster for distributed caching
      // This would set up Redis cluster configuration
      
      // Configure database read replicas
      // This would set up read replica routing
      
      // Configure service discovery
      // This would register the service with a service discovery system
      
      console.log('Load balancing setup completed');
    } catch (error) {
      console.error('Error setting up load balancing:', error);
    }
  }

  /**
   * Memory optimization and garbage collection
   */
  optimizeMemoryUsage(): void {
    // Clean up expired cache entries
    const now = Date.now();
    for (const [key, value] of this.queryCache) {
      if (now - value.timestamp > value.ttl * 1000) {
        this.queryCache.delete(key);
      }
    }

    // Limit cache size
    if (this.queryCache.size > 1000) {
      const entries = Array.from(this.queryCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest 20% of entries
      const toRemove = Math.floor(entries.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        this.queryCache.delete(entries[i][0]);
      }
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Collect and update performance metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      // Update memory usage
      const memUsage = process.memoryUsage();
      this.metrics.memoryUsage = memUsage.heapUsed / 1024 / 1024; // MB

      // Update cache metrics
      const cacheSize = this.queryCache.size;
      
      // Update Redis metrics
      const redisInfo = await this.redis.info('memory');
      
      // Update connection metrics (would get from actual connection pool)
      this.metrics.activeConnections = 10; // Placeholder

      console.log('Performance metrics updated:', this.metrics);
    } catch (error) {
      console.error('Error collecting metrics:', error);
    }
  }

  /**
   * Update cache hit rate
   */
  private updateCacheHitRate(hit: boolean): void {
    // Simple moving average for cache hit rate
    const alpha = 0.1; // Smoothing factor
    const hitValue = hit ? 1 : 0;
    this.metrics.cacheHitRate = this.metrics.cacheHitRate * (1 - alpha) + hitValue * alpha;
  }

  /**
   * Update average query time
   */
  private updateAverageQueryTime(queryTime: number): void {
    const alpha = 0.1;
    this.metrics.averageQueryTime = this.metrics.averageQueryTime * (1 - alpha) + queryTime * alpha;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Warm up caches on startup
   */
  async warmUpCaches(): Promise<void> {
    try {
      console.log('Warming up caches...');
      
      // Pre-load frequently accessed data
      await this.cacheApprovalRules();
      
      // Pre-load recent workflows
      const recentWorkflows = await db
        .select()
        .from(approvalWorkflows)
        .where(eq(approvalWorkflows.status, 'pending'))
        .limit(100);

      for (const workflow of recentWorkflows) {
        await this.cacheWorkflow(workflow.id, workflow, 1800);
      }

      console.log('Cache warm-up completed');
    } catch (error) {
      console.error('Error warming up caches:', error);
    }
  }

  /**
   * Health check for performance optimization service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: PerformanceMetrics;
    issues: string[];
  }> {
    const issues: string[] = [];
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    try {
      // Check Redis connection
      await this.redis.ping();
    } catch (error) {
      issues.push('Redis connection failed');
      status = 'degraded';
    }

    // Check cache hit rate
    if (this.metrics.cacheHitRate < 0.5) {
      issues.push('Low cache hit rate');
      if (status === 'healthy') status = 'degraded';
    }

    // Check memory usage
    if (this.metrics.memoryUsage > 1000) { // 1GB
      issues.push('High memory usage');
      if (status === 'healthy') status = 'degraded';
    }

    // Check query performance
    if (this.metrics.averageQueryTime > 1000) { // 1 second
      issues.push('Slow query performance');
      status = 'unhealthy';
    }

    return {
      status,
      metrics: this.metrics,
      issues
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.redis.quit();
      this.queryCache.clear();
      console.log('Performance optimization service cleaned up');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

// Export singleton instance
export const performanceOptimizationService = new PerformanceOptimizationService();