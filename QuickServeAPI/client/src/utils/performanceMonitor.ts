/**
 * FinBot v4 - Client-side Performance Monitor
 * Web Vitals tracking and real user monitoring (RUM)
 */

import { getCLS, getFID, getFCP, getLCP, getTTFB, Metric } from 'web-vitals';

interface PerformanceMetrics {
  // Core Web Vitals
  cls?: number;
  fid?: number;
  fcp?: number;
  lcp?: number;
  ttfb?: number;
  
  // Custom metrics
  navigationTiming?: PerformanceNavigationTiming;
  resourceTiming?: PerformanceResourceTiming[];
  memoryUsage?: any;
  connectionInfo?: any;
  
  // User context
  userAgent: string;
  viewport: { width: number; height: number };
  timestamp: number;
  url: string;
  userId?: string;
  sessionId: string;
}

interface PerformanceConfig {
  enableWebVitals: boolean;
  enableResourceTiming: boolean;
  enableMemoryMonitoring: boolean;
  enableNetworkInfo: boolean;
  sampleRate: number;
  reportingEndpoint: string;
  batchSize: number;
  flushInterval: number;
}

class PerformanceMonitor {
  private config: PerformanceConfig;
  private metrics: PerformanceMetrics[] = [];
  private sessionId: string;
  private flushTimer?: NodeJS.Timeout;
  private observer?: PerformanceObserver;

  constructor(config: Partial<PerformanceConfig> = {}) {
    this.config = {
      enableWebVitals: true,
      enableResourceTiming: true,
      enableMemoryMonitoring: true,
      enableNetworkInfo: true,
      sampleRate: 1.0,
      reportingEndpoint: '/api/performance/metrics',
      batchSize: 10,
      flushInterval: 30000, // 30 seconds
      ...config
    };

    this.sessionId = this.generateSessionId();
    this.initialize();
  }

  /**
   * Initialize performance monitoring
   */
  private initialize() {
    // Only run in browser environment
    if (typeof window === 'undefined') return;

    // Check if we should sample this session
    if (Math.random() > this.config.sampleRate) return;

    console.log('🔍 Performance monitoring initialized');

    // Initialize Web Vitals
    if (this.config.enableWebVitals) {
      this.initializeWebVitals();
    }

    // Initialize resource timing
    if (this.config.enableResourceTiming) {
      this.initializeResourceTiming();
    }

    // Initialize navigation timing
    this.initializeNavigationTiming();

    // Start periodic flushing
    this.startPeriodicFlush();

    // Flush on page unload
    this.setupUnloadHandler();
  }

  /**
   * Initialize Web Vitals monitoring
   */
  private initializeWebVitals() {
    const handleMetric = (metric: Metric) => {
      this.recordMetric({
        [metric.name.toLowerCase()]: metric.value,
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        timestamp: Date.now(),
        url: window.location.href,
        sessionId: this.sessionId
      });

      console.log(`📊 ${metric.name}: ${metric.value}`, metric);
    };

    // Core Web Vitals
    getCLS(handleMetric);
    getFID(handleMetric);
    getFCP(handleMetric);
    getLCP(handleMetric);
    getTTFB(handleMetric);
  }

  /**
   * Initialize resource timing monitoring
   */
  private initializeResourceTiming() {
    if (!('PerformanceObserver' in window)) return;

    this.observer = new PerformanceObserver((list) => {
      const entries = list.getEntries() as PerformanceResourceTiming[];
      
      // Filter and process resource entries
      const relevantEntries = entries.filter(entry => {
        // Focus on important resources
        return entry.initiatorType === 'fetch' || 
               entry.initiatorType === 'xmlhttprequest' ||
               entry.name.includes('/api/') ||
               entry.name.includes('.js') ||
               entry.name.includes('.css');
      });

      if (relevantEntries.length > 0) {
        this.recordMetric({
          resourceTiming: relevantEntries.map(entry => ({
            name: entry.name,
            duration: entry.duration,
            transferSize: entry.transferSize,
            encodedBodySize: entry.encodedBodySize,
            decodedBodySize: entry.decodedBodySize,
            initiatorType: entry.initiatorType,
            startTime: entry.startTime,
            responseEnd: entry.responseEnd
          })),
          userAgent: navigator.userAgent,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          },
          timestamp: Date.now(),
          url: window.location.href,
          sessionId: this.sessionId
        });
      }
    });

    this.observer.observe({ entryTypes: ['resource'] });
  }

  /**
   * Initialize navigation timing
   */
  private initializeNavigationTiming() {
    // Wait for page load to complete
    window.addEventListener('load', () => {
      setTimeout(() => {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        
        if (navigation) {
          this.recordMetric({
            navigationTiming: {
              domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
              domContentLoadedEventStart: navigation.domContentLoadedEventStart,
              domInteractive: navigation.domInteractive,
              loadEventEnd: navigation.loadEventEnd,
              loadEventStart: navigation.loadEventStart,
              responseEnd: navigation.responseEnd,
              responseStart: navigation.responseStart,
              requestStart: navigation.requestStart,
              connectEnd: navigation.connectEnd,
              connectStart: navigation.connectStart,
              domainLookupEnd: navigation.domainLookupEnd,
              domainLookupStart: navigation.domainLookupStart
            },
            memoryUsage: this.getMemoryUsage(),
            connectionInfo: this.getConnectionInfo(),
            userAgent: navigator.userAgent,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight
            },
            timestamp: Date.now(),
            url: window.location.href,
            sessionId: this.sessionId
          });
        }
      }, 1000);
    });
  }

  /**
   * Record performance metric
   */
  private recordMetric(metric: Partial<PerformanceMetrics>) {
    this.metrics.push({
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      timestamp: Date.now(),
      url: window.location.href,
      sessionId: this.sessionId,
      ...metric
    });

    // Flush if batch size reached
    if (this.metrics.length >= this.config.batchSize) {
      this.flush();
    }
  }

  /**
   * Get memory usage information
   */
  private getMemoryUsage() {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      };
    }
    return null;
  }

  /**
   * Get connection information
   */
  private getConnectionInfo() {
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      return {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData
      };
    }
    return null;
  }

  /**
   * Start periodic flushing
   */
  private startPeriodicFlush() {
    this.flushTimer = setInterval(() => {
      if (this.metrics.length > 0) {
        this.flush();
      }
    }, this.config.flushInterval);
  }

  /**
   * Setup page unload handler
   */
  private setupUnloadHandler() {
    const handleUnload = () => {
      if (this.metrics.length > 0) {
        this.flush(true); // Synchronous flush on unload
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    
    // Modern browsers support visibilitychange
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.metrics.length > 0) {
        this.flush(true);
      }
    });
  }

  /**
   * Flush metrics to server
   */
  private async flush(synchronous = false) {
    if (this.metrics.length === 0) return;

    const metricsToSend = [...this.metrics];
    this.metrics = [];

    const payload = {
      metrics: metricsToSend,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    try {
      if (synchronous && 'sendBeacon' in navigator) {
        // Use sendBeacon for synchronous sending on page unload
        navigator.sendBeacon(
          this.config.reportingEndpoint,
          JSON.stringify(payload)
        );
      } else {
        // Use fetch for normal sending
        await fetch(this.config.reportingEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
      }
    } catch (error) {
      console.error('Failed to send performance metrics:', error);
      // Re-add metrics to queue for retry
      this.metrics.unshift(...metricsToSend);
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Set user ID for tracking
   */
  setUserId(userId: string) {
    this.metrics.forEach(metric => {
      metric.userId = userId;
    });
  }

  /**
   * Track custom performance mark
   */
  mark(name: string, detail?: any) {
    if ('performance' in window && 'mark' in performance) {
      performance.mark(name, { detail });
    }

    this.recordMetric({
      customMark: {
        name,
        timestamp: Date.now(),
        detail
      },
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      timestamp: Date.now(),
      url: window.location.href,
      sessionId: this.sessionId
    });
  }

  /**
   * Measure time between two marks
   */
  measure(name: string, startMark: string, endMark?: string) {
    if ('performance' in window && 'measure' in performance) {
      try {
        performance.measure(name, startMark, endMark);
        const measure = performance.getEntriesByName(name, 'measure')[0];
        
        this.recordMetric({
          customMeasure: {
            name,
            duration: measure.duration,
            startTime: measure.startTime
          },
          userAgent: navigator.userAgent,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          },
          timestamp: Date.now(),
          url: window.location.href,
          sessionId: this.sessionId
        });
      } catch (error) {
        console.error('Failed to measure performance:', error);
      }
    }
  }

  /**
   * Track page view
   */
  trackPageView(path?: string) {
    this.recordMetric({
      pageView: {
        path: path || window.location.pathname,
        referrer: document.referrer,
        timestamp: Date.now()
      },
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      timestamp: Date.now(),
      url: window.location.href,
      sessionId: this.sessionId
    });
  }

  /**
   * Track user interaction
   */
  trackInteraction(type: string, target: string, duration?: number) {
    this.recordMetric({
      interaction: {
        type,
        target,
        duration,
        timestamp: Date.now()
      },
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      timestamp: Date.now(),
      url: window.location.href,
      sessionId: this.sessionId
    });
  }

  /**
   * Get current performance summary
   */
  getPerformanceSummary() {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    return {
      // Page load metrics
      domContentLoaded: navigation ? navigation.domContentLoadedEventEnd - navigation.navigationStart : 0,
      loadComplete: navigation ? navigation.loadEventEnd - navigation.navigationStart : 0,
      
      // Memory usage
      memoryUsage: this.getMemoryUsage(),
      
      // Connection info
      connectionInfo: this.getConnectionInfo(),
      
      // Session info
      sessionId: this.sessionId,
      metricsQueued: this.metrics.length
    };
  }

  /**
   * Cleanup and stop monitoring
   */
  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    if (this.observer) {
      this.observer.disconnect();
    }
    
    // Final flush
    if (this.metrics.length > 0) {
      this.flush(true);
    }
  }
}

// Create singleton instance
export const performanceMonitor = new PerformanceMonitor({
  enableWebVitals: true,
  enableResourceTiming: true,
  enableMemoryMonitoring: true,
  enableNetworkInfo: true,
  sampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% sampling in production
  reportingEndpoint: '/api/performance/metrics'
});

// React hook for performance monitoring
export const usePerformanceMonitoring = () => {
  const trackPageView = (path?: string) => {
    performanceMonitor.trackPageView(path);
  };

  const trackInteraction = (type: string, target: string, duration?: number) => {
    performanceMonitor.trackInteraction(type, target, duration);
  };

  const mark = (name: string, detail?: any) => {
    performanceMonitor.mark(name, detail);
  };

  const measure = (name: string, startMark: string, endMark?: string) => {
    performanceMonitor.measure(name, startMark, endMark);
  };

  const getPerformanceSummary = () => {
    return performanceMonitor.getPerformanceSummary();
  };

  return {
    trackPageView,
    trackInteraction,
    mark,
    measure,
    getPerformanceSummary
  };
};

export default performanceMonitor;