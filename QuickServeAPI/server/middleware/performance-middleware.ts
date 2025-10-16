/**
 * FinBot v4 - Server-side Performance Monitoring Middleware
 * Request/response performance tracking and APM integration
 */

import { Request, Response, NextFunction } from 'express';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

interface PerformanceMetric {
  requestId: string;
  method: string;
  url: string;
  statusCode: number;
  duration: number;
  timestamp: number;
  userAgent?: string;
  ip: string;
  userId?: string;
  
  // Detailed timing
  timing: {
    start: number;
    end: number;
    middleware: number;
    database?: number;
    external?: number;
  };
  
  // Resource usage
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  
  // Request details
  requestSize: number;
  responseSize: number;
  
  // Custom metrics
  custom?: Record<string, any>;
}

interface PerformanceConfig {
  enableDetailedTiming: boolean;
  enableMemoryTracking: boolean;
  enableSlowQueryLogging: boolean;
  slowQueryThreshold: number;
  enableRequestSizeTracking: boolean;
  sampleRate: number;
  excludePaths: string[];
}

class ServerPerformanceMonitor extends EventEmitter {
  private metrics: PerformanceMetric[] = [];
  private config: PerformanceConfig;
  private activeRequests = new Map<string, any>();

  constructor(config: Partial<PerformanceConfig> = {}) {
    super();
    
    this.config = {
      enableDetailedTiming: true,
      enableMemoryTracking: true,
      enableSlowQueryLogging: true,
      slowQueryThreshold: 1000, // 1 second
      enableRequestSizeTracking: true,
      sampleRate: 1.0,
      excludePaths: ['/health', '/metrics', '/favicon.ico'],
      ...config
    };
  }

  /**
   * Express middleware for performance monitoring
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Check if we should sample this request
      if (Math.random() > this.config.sampleRate) {
        return next();
      }

      // Skip excluded paths
      if (this.config.excludePaths.some(path => req.path.startsWith(path))) {
        return next();
      }

      const requestId = this.generateRequestId();
      const startTime = performance.now();
      const startMemory = process.memoryUsage();

      // Store request context
      const requestContext = {
        requestId,
        startTime,
        startMemory,
        method: req.method,
        url: req.originalUrl || req.url,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        userId: (req as any).user?.id,
        middlewareTime: 0,
        databaseTime: 0,
        externalTime: 0
      };

      this.activeRequests.set(requestId, requestContext);

      // Add request ID to request object
      (req as any).performanceId = requestId;

      // Track request size
      let requestSize = 0;
      if (this.config.enableRequestSizeTracking) {
        requestSize = this.calculateRequestSize(req);
      }

      // Override res.end to capture response metrics
      const originalEnd = res.end.bind(res);
      let responseSize = 0;

      res.end = function(chunk?: any, encoding?: any) {
        const endTime = performance.now();
        const endMemory = process.memoryUsage();
        const duration = endTime - startTime;

        // Calculate response size
        if (chunk) {
          responseSize = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
        }

        // Create performance metric
        const metric: PerformanceMetric = {
          requestId,
          method: req.method,
          url: req.originalUrl || req.url,
          statusCode: res.statusCode,
          duration,
          timestamp: Date.now(),
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          userId: (req as any).user?.id,
          
          timing: {
            start: startTime,
            end: endTime,
            middleware: requestContext.middlewareTime,
            database: requestContext.databaseTime,
            external: requestContext.externalTime
          },
          
          memory: {
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal,
            external: endMemory.external - startMemory.external,
            rss: endMemory.rss - startMemory.rss
          },
          
          requestSize,
          responseSize,
          
          custom: requestContext.custom
        };

        // Store metric
        this.recordMetric(metric);

        // Clean up active request
        this.activeRequests.delete(requestId);

        // Call original end
        return originalEnd.call(this, chunk, encoding);
      }.bind(this);

      next();
    };
  }

  /**
   * Middleware to track database query time
   */
  databaseMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const requestId = (req as any).performanceId;
      if (!requestId) return next();

      const requestContext = this.activeRequests.get(requestId);
      if (!requestContext) return next();

      // Track database timing
      const originalQuery = req.query;
      const startTime = performance.now();

      // Override database query methods (this is a simplified example)
      // In practice, you'd integrate with your ORM or database client
      
      res.on('finish', () => {
        const dbTime = performance.now() - startTime;
        requestContext.databaseTime += dbTime;

        if (this.config.enableSlowQueryLogging && dbTime > this.config.slowQueryThreshold) {
          console.warn(`Slow database query detected: ${dbTime}ms for ${req.path}`);
          this.emit('slowQuery', {
            requestId,
            duration: dbTime,
            path: req.path,
            query: originalQuery
          });
        }
      });

      next();
    };
  }

  /**
   * Record performance metric
   */
  private recordMetric(metric: PerformanceMetric) {
    this.metrics.push(metric);

    // Emit events for real-time monitoring
    this.emit('metric', metric);

    // Check for performance issues
    this.checkPerformanceThresholds(metric);

    // Limit memory usage by keeping only recent metrics
    if (this.metrics.length > 10000) {
      this.metrics = this.metrics.slice(-5000);
    }
  }

  /**
   * Check performance thresholds and emit alerts
   */
  private checkPerformanceThresholds(metric: PerformanceMetric) {
    const alerts: string[] = [];

    // Slow request threshold
    if (metric.duration > 5000) {
      alerts.push(`Slow request: ${metric.duration}ms`);
      this.emit('slowRequest', metric);
    }

    // High memory usage
    if (metric.memory.heapUsed > 50 * 1024 * 1024) { // 50MB
      alerts.push(`High memory usage: ${Math.round(metric.memory.heapUsed / 1024 / 1024)}MB`);
      this.emit('highMemoryUsage', metric);
    }

    // Large response size
    if (metric.responseSize > 1024 * 1024) { // 1MB
      alerts.push(`Large response: ${Math.round(metric.responseSize / 1024)}KB`);
      this.emit('largeResponse', metric);
    }

    // Error responses
    if (metric.statusCode >= 500) {
      this.emit('serverError', metric);
    } else if (metric.statusCode >= 400) {
      this.emit('clientError', metric);
    }

    if (alerts.length > 0) {
      console.warn(`Performance alerts for ${metric.method} ${metric.url}:`, alerts);
    }
  }

  /**
   * Calculate request size
   */
  private calculateRequestSize(req: Request): number {
    let size = 0;
    
    // Headers size
    size += JSON.stringify(req.headers).length;
    
    // URL size
    size += req.url.length;
    
    // Body size (if available)
    if (req.body) {
      size += JSON.stringify(req.body).length;
    }
    
    return size;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get performance statistics
   */
  getStats(timeRange = 3600000) { // Default 1 hour
    const now = Date.now();
    const recentMetrics = this.metrics.filter(
      metric => metric.timestamp >= now - timeRange
    );

    if (recentMetrics.length === 0) {
      return {
        totalRequests: 0,
        avgResponseTime: 0,
        errorRate: 0,
        throughput: 0
      };
    }

    const totalRequests = recentMetrics.length;
    const avgResponseTime = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / totalRequests;
    const errorCount = recentMetrics.filter(m => m.statusCode >= 400).length;
    const errorRate = (errorCount / totalRequests) * 100;
    const throughput = totalRequests / (timeRange / 1000); // requests per second

    // Calculate percentiles
    const sortedDurations = recentMetrics.map(m => m.duration).sort((a, b) => a - b);
    const p50 = sortedDurations[Math.floor(sortedDurations.length * 0.5)];
    const p95 = sortedDurations[Math.floor(sortedDurations.length * 0.95)];
    const p99 = sortedDurations[Math.floor(sortedDurations.length * 0.99)];

    // Memory statistics
    const avgMemoryUsage = recentMetrics.reduce((sum, m) => sum + m.memory.heapUsed, 0) / totalRequests;
    const maxMemoryUsage = Math.max(...recentMetrics.map(m => m.memory.heapUsed));

    // Status code distribution
    const statusCodes = recentMetrics.reduce((acc, m) => {
      acc[m.statusCode] = (acc[m.statusCode] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    // Slowest endpoints
    const endpointStats = recentMetrics.reduce((acc, m) => {
      const key = `${m.method} ${m.url}`;
      if (!acc[key]) {
        acc[key] = { count: 0, totalDuration: 0, maxDuration: 0 };
      }
      acc[key].count++;
      acc[key].totalDuration += m.duration;
      acc[key].maxDuration = Math.max(acc[key].maxDuration, m.duration);
      return acc;
    }, {} as Record<string, any>);

    const slowestEndpoints = Object.entries(endpointStats)
      .map(([endpoint, stats]) => ({
        endpoint,
        avgDuration: stats.totalDuration / stats.count,
        maxDuration: stats.maxDuration,
        count: stats.count
      }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);

    return {
      timeRange,
      totalRequests,
      avgResponseTime,
      errorRate,
      throughput,
      percentiles: { p50, p95, p99 },
      memory: {
        avgUsage: avgMemoryUsage,
        maxUsage: maxMemoryUsage
      },
      statusCodes,
      slowestEndpoints,
      activeRequests: this.activeRequests.size
    };
  }

  /**
   * Get metrics for specific time range
   */
  getMetrics(startTime?: number, endTime?: number) {
    let filteredMetrics = this.metrics;

    if (startTime) {
      filteredMetrics = filteredMetrics.filter(m => m.timestamp >= startTime);
    }

    if (endTime) {
      filteredMetrics = filteredMetrics.filter(m => m.timestamp <= endTime);
    }

    return filteredMetrics;
  }

  /**
   * Clear old metrics
   */
  clearMetrics(olderThan?: number) {
    const cutoff = olderThan || Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    this.metrics = this.metrics.filter(m => m.timestamp >= cutoff);
  }

  /**
   * Add custom metric to current request
   */
  addCustomMetric(requestId: string, key: string, value: any) {
    const requestContext = this.activeRequests.get(requestId);
    if (requestContext) {
      if (!requestContext.custom) {
        requestContext.custom = {};
      }
      requestContext.custom[key] = value;
    }
  }

  /**
   * Track external API call time
   */
  trackExternalCall(requestId: string, duration: number) {
    const requestContext = this.activeRequests.get(requestId);
    if (requestContext) {
      requestContext.externalTime += duration;
    }
  }
}

// Create singleton instance
export const serverPerformanceMonitor = new ServerPerformanceMonitor({
  enableDetailedTiming: true,
  enableMemoryTracking: true,
  enableSlowQueryLogging: true,
  slowQueryThreshold: 1000,
  sampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0
});

// Express middleware functions
export const performanceMiddleware = () => serverPerformanceMonitor.middleware();
export const databasePerformanceMiddleware = () => serverPerformanceMonitor.databaseMiddleware();

// Utility functions for custom tracking
export const trackCustomMetric = (req: Request, key: string, value: any) => {
  const requestId = (req as any).performanceId;
  if (requestId) {
    serverPerformanceMonitor.addCustomMetric(requestId, key, value);
  }
};

export const trackExternalCall = async <T>(
  req: Request,
  operation: () => Promise<T>
): Promise<T> => {
  const requestId = (req as any).performanceId;
  const startTime = performance.now();
  
  try {
    const result = await operation();
    const duration = performance.now() - startTime;
    
    if (requestId) {
      serverPerformanceMonitor.trackExternalCall(requestId, duration);
    }
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    
    if (requestId) {
      serverPerformanceMonitor.trackExternalCall(requestId, duration);
    }
    
    throw error;
  }
};

// Event listeners for monitoring integration
serverPerformanceMonitor.on('slowRequest', (metric) => {
  console.warn(`Slow request detected: ${metric.method} ${metric.url} took ${metric.duration}ms`);
});

serverPerformanceMonitor.on('highMemoryUsage', (metric) => {
  console.warn(`High memory usage: ${Math.round(metric.memory.heapUsed / 1024 / 1024)}MB for ${metric.method} ${metric.url}`);
});

serverPerformanceMonitor.on('serverError', (metric) => {
  console.error(`Server error: ${metric.statusCode} for ${metric.method} ${metric.url}`);
});

export default serverPerformanceMonitor;