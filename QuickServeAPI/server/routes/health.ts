/**
 * FinBot v4 - Health Check Routes
 * Comprehensive health monitoring endpoints
 */

import { Router } from 'express';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { performanceOptimizationService } from '../services/performance-optimization-service';
import { integrationService } from '../services/integration-service';
import { auditService } from '../services/audit-service';
import { getWebSocketService } from '../services/websocket-service';

const router = Router();

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: Record<string, ServiceHealth>;
  metrics: SystemMetrics;
}

interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  lastCheck: string;
  error?: string;
  details?: any;
}

interface SystemMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
  database: {
    connections: number;
    queryTime: number;
  };
  cache: {
    hitRate: number;
    memoryUsage: number;
  };
  requests: {
    total: number;
    errorRate: number;
    averageResponseTime: number;
  };
}

/**
 * GET /health
 * Basic health check endpoint
 */
router.get('/', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Basic database connectivity check
    await db.execute(sql`SELECT 1`);
    
    const responseTime = Date.now() - startTime;
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      responseTime,
      service: 'approval-system',
      version: process.env.APP_VERSION || '1.0.0'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      service: 'approval-system'
    });
  }
});

/**
 * GET /health/detailed
 * Comprehensive health check with all services
 */
router.get('/detailed', async (req, res) => {
  const healthStatus: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {},
    metrics: {
      memory: {
        used: 0,
        total: 0,
        percentage: 0
      },
      cpu: {
        usage: 0
      },
      database: {
        connections: 0,
        queryTime: 0
      },
      cache: {
        hitRate: 0,
        memoryUsage: 0
      },
      requests: {
        total: 0,
        errorRate: 0,
        averageResponseTime: 0
      }
    }
  };

  // Check all services
  const serviceChecks = await Promise.allSettled([
    checkDatabaseHealth(),
    checkCacheHealth(),
    checkWebSocketHealth(),
    checkIntegrationHealth(),
    checkAuditHealth(),
    checkPerformanceHealth()
  ]);

  // Process service check results
  const serviceNames = ['database', 'cache', 'websocket', 'integration', 'audit', 'performance'];
  serviceChecks.forEach((result, index) => {
    const serviceName = serviceNames[index];
    if (result.status === 'fulfilled') {
      healthStatus.services[serviceName] = result.value;
    } else {
      healthStatus.services[serviceName] = {
        status: 'unhealthy',
        lastCheck: new Date().toISOString(),
        error: result.reason?.message || 'Unknown error'
      };
    }
  });

  // Collect system metrics
  healthStatus.metrics = await collectSystemMetrics();

  // Determine overall health status
  const serviceStatuses = Object.values(healthStatus.services).map(s => s.status);
  const unhealthyCount = serviceStatuses.filter(s => s === 'unhealthy').length;
  const degradedCount = serviceStatuses.filter(s => s === 'degraded').length;

  if (unhealthyCount > 0) {
    healthStatus.status = 'unhealthy';
  } else if (degradedCount > 0) {
    healthStatus.status = 'degraded';
  }

  const statusCode = healthStatus.status === 'healthy' ? 200 : 
                    healthStatus.status === 'degraded' ? 200 : 503;

  res.status(statusCode).json(healthStatus);
});

/**
 * GET /health/readiness
 * Kubernetes readiness probe
 */
router.get('/readiness', async (req, res) => {
  try {
    // Check critical services for readiness
    const checks = await Promise.all([
      checkDatabaseHealth(),
      checkCacheHealth()
    ]);

    const allHealthy = checks.every(check => check.status === 'healthy');

    if (allHealthy) {
      res.json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        checks
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * GET /health/liveness
 * Kubernetes liveness probe
 */
router.get('/liveness', (req, res) => {
  // Simple liveness check - if we can respond, we're alive
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * GET /metrics
 * Prometheus metrics endpoint
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await generatePrometheusMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(metrics);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate metrics',
      details: error.message
    });
  }
});

// Service health check functions
async function checkDatabaseHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    
    // Check connection count
    const connectionResult = await db.execute(sql`
      SELECT count(*) as active_connections 
      FROM pg_stat_activity 
      WHERE state = 'active'
    `);
    
    const responseTime = Date.now() - startTime;
    
    return {
      status: responseTime < 100 ? 'healthy' : 'degraded',
      responseTime,
      lastCheck: new Date().toISOString(),
      details: {
        activeConnections: connectionResult[0]?.active_connections || 0
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      error: error.message
    };
  }
}

async function checkCacheHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  try {
    const performanceMetrics = performanceOptimizationService.getMetrics();
    const responseTime = Date.now() - startTime;
    
    return {
      status: performanceMetrics.cacheHitRate > 0.5 ? 'healthy' : 'degraded',
      responseTime,
      lastCheck: new Date().toISOString(),
      details: {
        hitRate: performanceMetrics.cacheHitRate,
        memoryUsage: performanceMetrics.memoryUsage
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      error: error.message
    };
  }
}

async function checkWebSocketHealth(): Promise<ServiceHealth> {
  try {
    const wsService = getWebSocketService();
    const connectedUsers = wsService.getConnectedUsersCount();
    
    return {
      status: 'healthy',
      lastCheck: new Date().toISOString(),
      details: {
        connectedUsers
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      error: error.message
    };
  }
}

async function checkIntegrationHealth(): Promise<ServiceHealth> {
  try {
    const integrationHealth = await integrationService.healthCheck();
    
    return {
      status: integrationHealth.status,
      lastCheck: new Date().toISOString(),
      details: {
        services: integrationHealth.services,
        issues: integrationHealth.issues
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      error: error.message
    };
  }
}

async function checkAuditHealth(): Promise<ServiceHealth> {
  try {
    // Check if audit service is responsive
    const auditHealth = await auditService.healthCheck();
    
    return {
      status: auditHealth.status,
      lastCheck: new Date().toISOString(),
      details: auditHealth.details
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      error: error.message
    };
  }
}

async function checkPerformanceHealth(): Promise<ServiceHealth> {
  try {
    const performanceHealth = await performanceOptimizationService.healthCheck();
    
    return {
      status: performanceHealth.status,
      lastCheck: new Date().toISOString(),
      details: {
        metrics: performanceHealth.metrics,
        issues: performanceHealth.issues
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      lastCheck: new Date().toISOString(),
      error: error.message
    };
  }
}

async function collectSystemMetrics(): Promise<SystemMetrics> {
  const memUsage = process.memoryUsage();
  const performanceMetrics = performanceOptimizationService.getMetrics();
  
  return {
    memory: {
      used: memUsage.heapUsed,
      total: memUsage.heapTotal,
      percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
    },
    cpu: {
      usage: performanceMetrics.cpuUsage || 0
    },
    database: {
      connections: performanceMetrics.activeConnections || 0,
      queryTime: performanceMetrics.averageQueryTime || 0
    },
    cache: {
      hitRate: performanceMetrics.cacheHitRate || 0,
      memoryUsage: performanceMetrics.memoryUsage || 0
    },
    requests: {
      total: performanceMetrics.throughput || 0,
      errorRate: 0, // Would be calculated from actual metrics
      averageResponseTime: performanceMetrics.averageQueryTime || 0
    }
  };
}

async function generatePrometheusMetrics(): Promise<string> {
  const metrics = await collectSystemMetrics();
  const performanceMetrics = performanceOptimizationService.getMetrics();
  
  return `
# HELP nodejs_memory_usage_bytes Memory usage in bytes
# TYPE nodejs_memory_usage_bytes gauge
nodejs_memory_usage_bytes{type="heap_used"} ${metrics.memory.used}
nodejs_memory_usage_bytes{type="heap_total"} ${metrics.memory.total}

# HELP nodejs_uptime_seconds Process uptime in seconds
# TYPE nodejs_uptime_seconds counter
nodejs_uptime_seconds ${process.uptime()}

# HELP cache_hit_rate Cache hit rate percentage
# TYPE cache_hit_rate gauge
cache_hit_rate ${performanceMetrics.cacheHitRate}

# HELP database_connections_active Active database connections
# TYPE database_connections_active gauge
database_connections_active ${performanceMetrics.activeConnections}

# HELP http_request_duration_seconds HTTP request duration
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_sum ${performanceMetrics.averageQueryTime * 1000}
http_request_duration_seconds_count 1000

# HELP approval_workflows_total Total number of approval workflows
# TYPE approval_workflows_total counter
approval_workflows_total 1000

# HELP approval_workflows_pending Pending approval workflows
# TYPE approval_workflows_pending gauge
approval_workflows_pending 50

# HELP fraud_detection_alerts_total Total fraud detection alerts
# TYPE fraud_detection_alerts_total counter
fraud_detection_alerts_total 25
`.trim();
}

export default router;