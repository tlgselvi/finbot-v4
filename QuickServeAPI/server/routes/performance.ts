/**
 * FinBot v4 - Performance Monitoring API Routes
 * Server-side performance metrics collection and analysis
 */

import { Router } from 'express';
import { z } from 'zod';
import { validateRequest } from '../middleware/validation';
import { rateLimit } from 'express-rate-limit';

const router = Router();

// Rate limiting for performance endpoints
const performanceRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many performance metrics requests',
  standardHeaders: true,
  legacyHeaders: false
});

// Validation schemas
const MetricsSchema = z.object({
  metrics: z.array(z.object({
    // Core Web Vitals
    cls: z.number().optional(),
    fid: z.number().optional(),
    fcp: z.number().optional(),
    lcp: z.number().optional(),
    ttfb: z.number().optional(),
    
    // Navigation timing
    navigationTiming: z.object({
      domContentLoadedEventEnd: z.number(),
      domContentLoadedEventStart: z.number(),
      domInteractive: z.number(),
      loadEventEnd: z.number(),
      loadEventStart: z.number(),
      responseEnd: z.number(),
      responseStart: z.number(),
      requestStart: z.number(),
      connectEnd: z.number(),
      connectStart: z.number(),
      domainLookupEnd: z.number(),
      domainLookupStart: z.number()
    }).optional(),
    
    // Resource timing
    resourceTiming: z.array(z.object({
      name: z.string(),
      duration: z.number(),
      transferSize: z.number().optional(),
      encodedBodySize: z.number().optional(),
      decodedBodySize: z.number().optional(),
      initiatorType: z.string(),
      startTime: z.number(),
      responseEnd: z.number()
    })).optional(),
    
    // Memory usage
    memoryUsage: z.object({
      usedJSHeapSize: z.number(),
      totalJSHeapSize: z.number(),
      jsHeapSizeLimit: z.number()
    }).optional(),
    
    // Connection info
    connectionInfo: z.object({
      effectiveType: z.string(),
      downlink: z.number(),
      rtt: z.number(),
      saveData: z.boolean()
    }).optional(),
    
    // Custom metrics
    customMark: z.object({
      name: z.string(),
      timestamp: z.number(),
      detail: z.any().optional()
    }).optional(),
    
    customMeasure: z.object({
      name: z.string(),
      duration: z.number(),
      startTime: z.number()
    }).optional(),
    
    pageView: z.object({
      path: z.string(),
      referrer: z.string(),
      timestamp: z.number()
    }).optional(),
    
    interaction: z.object({
      type: z.string(),
      target: z.string(),
      duration: z.number().optional(),
      timestamp: z.number()
    }).optional(),
    
    // Context
    userAgent: z.string(),
    viewport: z.object({
      width: z.number(),
      height: z.number()
    }),
    timestamp: z.number(),
    url: z.string(),
    userId: z.string().optional(),
    sessionId: z.string()
  })),
  timestamp: z.number(),
  userAgent: z.string(),
  url: z.string()
});

// In-memory storage for demo (use database in production)
const performanceMetrics: any[] = [];
const performanceStats = {
  totalMetrics: 0,
  uniqueSessions: new Set(),
  avgWebVitals: {
    cls: 0,
    fid: 0,
    fcp: 0,
    lcp: 0,
    ttfb: 0
  }
};

/**
 * POST /api/performance/metrics
 * Collect performance metrics from clients
 */
router.post('/metrics',
  performanceRateLimit,
  validateRequest({ body: MetricsSchema }),
  async (req, res) => {
    try {
      const { metrics, timestamp, userAgent, url } = req.body;
      
      // Process each metric
      metrics.forEach((metric: any) => {
        // Store metric
        performanceMetrics.push({
          ...metric,
          receivedAt: Date.now(),
          clientTimestamp: timestamp,
          serverUserAgent: userAgent,
          serverUrl: url,
          clientIP: req.ip
        });
        
        // Update stats
        performanceStats.totalMetrics++;
        performanceStats.uniqueSessions.add(metric.sessionId);
        
        // Update Web Vitals averages
        if (metric.cls !== undefined) {
          performanceStats.avgWebVitals.cls = updateAverage(performanceStats.avgWebVitals.cls, metric.cls);
        }
        if (metric.fid !== undefined) {
          performanceStats.avgWebVitals.fid = updateAverage(performanceStats.avgWebVitals.fid, metric.fid);
        }
        if (metric.fcp !== undefined) {
          performanceStats.avgWebVitals.fcp = updateAverage(performanceStats.avgWebVitals.fcp, metric.fcp);
        }
        if (metric.lcp !== undefined) {
          performanceStats.avgWebVitals.lcp = updateAverage(performanceStats.avgWebVitals.lcp, metric.lcp);
        }
        if (metric.ttfb !== undefined) {
          performanceStats.avgWebVitals.ttfb = updateAverage(performanceStats.avgWebVitals.ttfb, metric.ttfb);
        }
      });
      
      // Log performance issues
      metrics.forEach((metric: any) => {
        checkPerformanceThresholds(metric);
      });
      
      res.json({
        success: true,
        message: 'Performance metrics received',
        processed: metrics.length
      });
      
    } catch (error) {
      console.error('Performance metrics processing error:', error);
      res.status(500).json({
        error: 'Failed to process performance metrics',
        code: 'METRICS_PROCESSING_ERROR'
      });
    }
  }
);

/**
 * GET /api/performance/dashboard
 * Get performance dashboard data
 */
router.get('/dashboard', async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;
    
    // Calculate time range
    const now = Date.now();
    const timeRangeMs = parseTimeRange(timeRange as string);
    const startTime = now - timeRangeMs;
    
    // Filter metrics by time range
    const recentMetrics = performanceMetrics.filter(
      metric => metric.receivedAt >= startTime
    );
    
    // Calculate statistics
    const stats = calculatePerformanceStats(recentMetrics);
    
    res.json({
      success: true,
      data: {
        timeRange,
        totalMetrics: recentMetrics.length,
        uniqueSessions: new Set(recentMetrics.map(m => m.sessionId)).size,
        webVitals: stats.webVitals,
        pageLoad: stats.pageLoad,
        resources: stats.resources,
        errors: stats.errors,
        trends: stats.trends
      }
    });
    
  } catch (error) {
    console.error('Performance dashboard error:', error);
    res.status(500).json({
      error: 'Failed to generate performance dashboard',
      code: 'DASHBOARD_ERROR'
    });
  }
});

/**
 * GET /api/performance/web-vitals
 * Get Web Vitals summary
 */
router.get('/web-vitals', async (req, res) => {
  try {
    const { timeRange = '24h', url } = req.query;
    
    const now = Date.now();
    const timeRangeMs = parseTimeRange(timeRange as string);
    const startTime = now - timeRangeMs;
    
    let filteredMetrics = performanceMetrics.filter(
      metric => metric.receivedAt >= startTime
    );
    
    // Filter by URL if specified
    if (url) {
      filteredMetrics = filteredMetrics.filter(
        metric => metric.url.includes(url as string)
      );
    }
    
    // Calculate Web Vitals statistics
    const webVitals = {
      cls: calculateMetricStats(filteredMetrics, 'cls'),
      fid: calculateMetricStats(filteredMetrics, 'fid'),
      fcp: calculateMetricStats(filteredMetrics, 'fcp'),
      lcp: calculateMetricStats(filteredMetrics, 'lcp'),
      ttfb: calculateMetricStats(filteredMetrics, 'ttfb')
    };
    
    // Calculate scores based on thresholds
    const scores = {
      cls: calculateWebVitalScore('cls', webVitals.cls.p75),
      fid: calculateWebVitalScore('fid', webVitals.fid.p75),
      fcp: calculateWebVitalScore('fcp', webVitals.fcp.p75),
      lcp: calculateWebVitalScore('lcp', webVitals.lcp.p75),
      ttfb: calculateWebVitalScore('ttfb', webVitals.ttfb.p75)
    };
    
    res.json({
      success: true,
      data: {
        timeRange,
        url: url || 'all',
        sampleSize: filteredMetrics.length,
        webVitals,
        scores,
        overallScore: Object.values(scores).reduce((sum, score) => sum + score, 0) / Object.keys(scores).length
      }
    });
    
  } catch (error) {
    console.error('Web Vitals error:', error);
    res.status(500).json({
      error: 'Failed to get Web Vitals data',
      code: 'WEB_VITALS_ERROR'
    });
  }
});

/**
 * GET /api/performance/resources
 * Get resource timing analysis
 */
router.get('/resources', async (req, res) => {
  try {
    const { timeRange = '24h', type } = req.query;
    
    const now = Date.now();
    const timeRangeMs = parseTimeRange(timeRange as string);
    const startTime = now - timeRangeMs;
    
    // Get metrics with resource timing
    const metricsWithResources = performanceMetrics.filter(
      metric => metric.receivedAt >= startTime && metric.resourceTiming
    );
    
    // Flatten resource timing data
    const resources: any[] = [];
    metricsWithResources.forEach(metric => {
      if (metric.resourceTiming) {
        metric.resourceTiming.forEach((resource: any) => {
          resources.push({
            ...resource,
            sessionId: metric.sessionId,
            url: metric.url,
            timestamp: metric.receivedAt
          });
        });
      }
    });
    
    // Filter by type if specified
    let filteredResources = resources;
    if (type) {
      filteredResources = resources.filter(r => r.initiatorType === type);
    }
    
    // Analyze resources
    const analysis = analyzeResources(filteredResources);
    
    res.json({
      success: true,
      data: {
        timeRange,
        type: type || 'all',
        totalResources: filteredResources.length,
        analysis
      }
    });
    
  } catch (error) {
    console.error('Resource analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze resources',
      code: 'RESOURCE_ANALYSIS_ERROR'
    });
  }
});

/**
 * GET /api/performance/alerts
 * Get performance alerts and issues
 */
router.get('/alerts', async (req, res) => {
  try {
    const { severity = 'all' } = req.query;
    
    // Get recent metrics for alert analysis
    const recentMetrics = performanceMetrics.filter(
      metric => metric.receivedAt >= Date.now() - (60 * 60 * 1000) // Last hour
    );
    
    const alerts = generatePerformanceAlerts(recentMetrics);
    
    // Filter by severity
    let filteredAlerts = alerts;
    if (severity !== 'all') {
      filteredAlerts = alerts.filter(alert => alert.severity === severity);
    }
    
    res.json({
      success: true,
      data: {
        alerts: filteredAlerts,
        summary: {
          total: alerts.length,
          critical: alerts.filter(a => a.severity === 'critical').length,
          warning: alerts.filter(a => a.severity === 'warning').length,
          info: alerts.filter(a => a.severity === 'info').length
        }
      }
    });
    
  } catch (error) {
    console.error('Performance alerts error:', error);
    res.status(500).json({
      error: 'Failed to get performance alerts',
      code: 'ALERTS_ERROR'
    });
  }
});

// Helper functions

function updateAverage(currentAvg: number, newValue: number): number {
  // Simple moving average (in production, use proper statistical methods)
  return (currentAvg + newValue) / 2;
}

function parseTimeRange(timeRange: string): number {
  const ranges: Record<string, number> = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };
  
  return ranges[timeRange] || ranges['24h'];
}

function calculatePerformanceStats(metrics: any[]) {
  // Calculate various performance statistics
  return {
    webVitals: {
      cls: calculateMetricStats(metrics, 'cls'),
      fid: calculateMetricStats(metrics, 'fid'),
      fcp: calculateMetricStats(metrics, 'fcp'),
      lcp: calculateMetricStats(metrics, 'lcp'),
      ttfb: calculateMetricStats(metrics, 'ttfb')
    },
    pageLoad: calculatePageLoadStats(metrics),
    resources: calculateResourceStats(metrics),
    errors: calculateErrorStats(metrics),
    trends: calculateTrends(metrics)
  };
}

function calculateMetricStats(metrics: any[], metricName: string) {
  const values = metrics
    .map(m => m[metricName])
    .filter(v => v !== undefined && v !== null)
    .sort((a, b) => a - b);
  
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p75: 0, p95: 0 };
  }
  
  return {
    count: values.length,
    min: values[0],
    max: values[values.length - 1],
    avg: values.reduce((sum, v) => sum + v, 0) / values.length,
    p50: values[Math.floor(values.length * 0.5)],
    p75: values[Math.floor(values.length * 0.75)],
    p95: values[Math.floor(values.length * 0.95)]
  };
}

function calculateWebVitalScore(metric: string, value: number): number {
  const thresholds: Record<string, { good: number; poor: number }> = {
    cls: { good: 0.1, poor: 0.25 },
    fid: { good: 100, poor: 300 },
    fcp: { good: 1800, poor: 3000 },
    lcp: { good: 2500, poor: 4000 },
    ttfb: { good: 800, poor: 1800 }
  };
  
  const threshold = thresholds[metric];
  if (!threshold) return 0;
  
  if (value <= threshold.good) return 100;
  if (value >= threshold.poor) return 0;
  
  // Linear interpolation between good and poor
  return Math.round(100 * (1 - (value - threshold.good) / (threshold.poor - threshold.good)));
}

function calculatePageLoadStats(metrics: any[]) {
  const navigationMetrics = metrics.filter(m => m.navigationTiming);
  
  if (navigationMetrics.length === 0) {
    return { domContentLoaded: 0, loadComplete: 0, timeToInteractive: 0 };
  }
  
  const domContentLoaded = navigationMetrics.map(m => 
    m.navigationTiming.domContentLoadedEventEnd - m.navigationTiming.navigationStart
  );
  
  const loadComplete = navigationMetrics.map(m => 
    m.navigationTiming.loadEventEnd - m.navigationTiming.navigationStart
  );
  
  return {
    domContentLoaded: calculateMetricStats(domContentLoaded.map((v, i) => ({ value: v })), 'value'),
    loadComplete: calculateMetricStats(loadComplete.map((v, i) => ({ value: v })), 'value'),
    timeToInteractive: calculateMetricStats(navigationMetrics.map(m => ({ value: m.navigationTiming.domInteractive })), 'value')
  };
}

function calculateResourceStats(metrics: any[]) {
  const resourceMetrics = metrics.filter(m => m.resourceTiming);
  const allResources: any[] = [];
  
  resourceMetrics.forEach(metric => {
    if (metric.resourceTiming) {
      allResources.push(...metric.resourceTiming);
    }
  });
  
  return {
    totalRequests: allResources.length,
    avgDuration: allResources.length > 0 
      ? allResources.reduce((sum, r) => sum + r.duration, 0) / allResources.length 
      : 0,
    byType: groupResourcesByType(allResources)
  };
}

function calculateErrorStats(metrics: any[]) {
  // This would analyze error metrics if they were collected
  return {
    totalErrors: 0,
    errorRate: 0,
    topErrors: []
  };
}

function calculateTrends(metrics: any[]) {
  // This would calculate performance trends over time
  return {
    webVitalsTrend: 'stable',
    pageLoadTrend: 'improving',
    errorTrend: 'stable'
  };
}

function analyzeResources(resources: any[]) {
  const byType = groupResourcesByType(resources);
  const slowResources = resources
    .filter(r => r.duration > 1000)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10);
  
  return {
    byType,
    slowResources,
    totalTransferSize: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
    avgDuration: resources.length > 0 
      ? resources.reduce((sum, r) => sum + r.duration, 0) / resources.length 
      : 0
  };
}

function groupResourcesByType(resources: any[]) {
  const grouped: Record<string, any> = {};
  
  resources.forEach(resource => {
    const type = resource.initiatorType || 'other';
    if (!grouped[type]) {
      grouped[type] = {
        count: 0,
        totalDuration: 0,
        totalSize: 0
      };
    }
    
    grouped[type].count++;
    grouped[type].totalDuration += resource.duration;
    grouped[type].totalSize += resource.transferSize || 0;
  });
  
  // Calculate averages
  Object.keys(grouped).forEach(type => {
    grouped[type].avgDuration = grouped[type].totalDuration / grouped[type].count;
    grouped[type].avgSize = grouped[type].totalSize / grouped[type].count;
  });
  
  return grouped;
}

function checkPerformanceThresholds(metric: any) {
  const alerts: string[] = [];
  
  // Check Web Vitals thresholds
  if (metric.cls > 0.25) alerts.push(`High CLS: ${metric.cls}`);
  if (metric.fid > 300) alerts.push(`High FID: ${metric.fid}ms`);
  if (metric.lcp > 4000) alerts.push(`High LCP: ${metric.lcp}ms`);
  if (metric.fcp > 3000) alerts.push(`High FCP: ${metric.fcp}ms`);
  if (metric.ttfb > 1800) alerts.push(`High TTFB: ${metric.ttfb}ms`);
  
  // Check memory usage
  if (metric.memoryUsage && metric.memoryUsage.usedJSHeapSize > 50 * 1024 * 1024) {
    alerts.push(`High memory usage: ${Math.round(metric.memoryUsage.usedJSHeapSize / 1024 / 1024)}MB`);
  }
  
  if (alerts.length > 0) {
    console.warn(`Performance alerts for ${metric.url}:`, alerts);
  }
}

function generatePerformanceAlerts(metrics: any[]) {
  const alerts: any[] = [];
  
  // Analyze recent metrics for patterns
  const webVitalsIssues = analyzeWebVitalsIssues(metrics);
  const resourceIssues = analyzeResourceIssues(metrics);
  const memoryIssues = analyzeMemoryIssues(metrics);
  
  alerts.push(...webVitalsIssues, ...resourceIssues, ...memoryIssues);
  
  return alerts.sort((a, b) => {
    const severityOrder = { critical: 3, warning: 2, info: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });
}

function analyzeWebVitalsIssues(metrics: any[]) {
  const alerts: any[] = [];
  
  // Check for consistently poor Web Vitals
  const poorLCP = metrics.filter(m => m.lcp > 4000).length;
  const poorCLS = metrics.filter(m => m.cls > 0.25).length;
  const poorFID = metrics.filter(m => m.fid > 300).length;
  
  if (poorLCP > metrics.length * 0.1) {
    alerts.push({
      type: 'web_vitals',
      severity: 'warning',
      message: `${Math.round(poorLCP / metrics.length * 100)}% of sessions have poor LCP`,
      metric: 'lcp',
      timestamp: Date.now()
    });
  }
  
  if (poorCLS > metrics.length * 0.1) {
    alerts.push({
      type: 'web_vitals',
      severity: 'warning',
      message: `${Math.round(poorCLS / metrics.length * 100)}% of sessions have poor CLS`,
      metric: 'cls',
      timestamp: Date.now()
    });
  }
  
  return alerts;
}

function analyzeResourceIssues(metrics: any[]) {
  const alerts: any[] = [];
  
  // Analyze slow resources
  const allResources: any[] = [];
  metrics.forEach(metric => {
    if (metric.resourceTiming) {
      allResources.push(...metric.resourceTiming);
    }
  });
  
  const slowResources = allResources.filter(r => r.duration > 2000);
  if (slowResources.length > 0) {
    alerts.push({
      type: 'resources',
      severity: 'info',
      message: `${slowResources.length} slow resources detected (>2s)`,
      details: slowResources.slice(0, 5).map(r => r.name),
      timestamp: Date.now()
    });
  }
  
  return alerts;
}

function analyzeMemoryIssues(metrics: any[]) {
  const alerts: any[] = [];
  
  const highMemoryUsage = metrics.filter(m => 
    m.memoryUsage && m.memoryUsage.usedJSHeapSize > 100 * 1024 * 1024
  );
  
  if (highMemoryUsage.length > 0) {
    alerts.push({
      type: 'memory',
      severity: 'warning',
      message: `${highMemoryUsage.length} sessions with high memory usage (>100MB)`,
      timestamp: Date.now()
    });
  }
  
  return alerts;
}

export default router;