/**
 * FinBot v4 - Performance Monitoring Utilities
 * Web Vitals tracking and performance analytics
 */

import { getCLS, getFID, getFCP, getLCP, getTTFB, Metric } from 'web-vitals';

export interface PerformanceMetrics {
  // Core Web Vitals
  cls?: number; // Cumulative Layout Shift
  fid?: number; // First Input Delay
  lcp?: number; // Largest Contentful Paint
  
  // Other important metrics
  fcp?: number; // First Contentful Paint
  ttfb?: number; // Time to First Byte
  
  // Custom metrics
  bundleSize?: number;
  loadTime?: number;
  renderTime?: number;
  interactionTime?: number;
  
  // Navigation timing
  navigationTiming?: PerformanceNavigationTiming;
  
  // Resource timing
  resourceTiming?: PerformanceResourceTiming[];
  
  // Memory usage
  memoryUsage?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

export interface PerformanceBudget {
  lcp: number; // Largest Contentful Paint (ms)
  fid: number; // First Input Delay (ms)
  cls: number; // Cumulative Layout Shift (score)
  fcp: number; // First Contentful Paint (ms)
  ttfb: number; // Time to First Byte (ms)
  bundleSize: number; // Bundle size (bytes)
  loadTime: number; // Total load time (ms)
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {};
  private budget: PerformanceBudget;
  private observers: PerformanceObserver[] = [];
  private analyticsEndpoint?: string;

  constructor(budget?: Partial<PerformanceBudget>, analyticsEndpoint?: string) {
    this.budget = {
      lcp: 2500, // 2.5 seconds
      fid: 100,  // 100ms
      cls: 0.1,  // 0.1 score
      fcp: 1800, // 1.8 seconds
      ttfb: 800, // 800ms
      bundleSize: 1200000, // 1.2MB
      loadTime: 3000, // 3 seconds
      ...budget
    };
    
    this.analyticsEndpoint = analyticsEndpoint;
    this.initializeMonitoring();
  }

  /**
   * Initialize performance monitoring
   */
  private initializeMonitoring() {
    if (typeof window === 'undefined') return;

    // Collect Web Vitals
    this.collectWebVitals();
    
    // Collect navigation timing
    this.collectNavigationTiming();
    
    // Collect resource timing
    this.collectResourceTiming();
    
    // Monitor memory usage
    this.monitorMemoryUsage();
    
    // Monitor long tasks
    this.monitorLongTasks();
    
    // Monitor layout shifts
    this.monitorLayoutShifts();
    
    // Monitor first input delay
    this.monitorFirstInputDelay();
    
    // Send metrics when page is about to unload
    this.setupBeforeUnload();
  }

  /**
   * Collect Core Web Vitals
   */
  private collectWebVitals() {
    getCLS((metric) => {
      this.metrics.cls = metric.value;
      this.checkBudget('cls', metric.value);
      this.sendMetric('cls', metric);
    });

    getFID((metric) => {
      this.metrics.fid = metric.value;
      this.checkBudget('fid', metric.value);
      this.sendMetric('fid', metric);
    });

    getLCP((metric) => {
      this.metrics.lcp = metric.value;
      this.checkBudget('lcp', metric.value);
      this.sendMetric('lcp', metric);
    });

    getFCP((metric) => {
      this.metrics.fcp = metric.value;
      this.checkBudget('fcp', metric.value);
      this.sendMetric('fcp', metric);
    });

    getTTFB((metric) => {
      this.metrics.ttfb = metric.value;
      this.checkBudget('ttfb', metric.value);
      this.sendMetric('ttfb', metric);
    });
  }

  /**
   * Collect navigation timing data
   */
  private collectNavigationTiming() {
    if ('performance' in window && 'getEntriesByType' in performance) {
      const navigationEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      
      if (navigationEntries.length > 0) {
        const navigation = navigationEntries[0];
        this.metrics.navigationTiming = navigation;
        
        // Calculate custom metrics
        this.metrics.loadTime = navigation.loadEventEnd - navigation.fetchStart;
        this.metrics.renderTime = navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart;
        
        this.checkBudget('loadTime', this.metrics.loadTime);
      }
    }
  }

  /**
   * Collect resource timing data
   */
  private collectResourceTiming() {
    if ('performance' in window && 'getEntriesByType' in performance) {
      const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      this.metrics.resourceTiming = resourceEntries;
      
      // Calculate bundle size
      const jsResources = resourceEntries.filter(entry => 
        entry.name.endsWith('.js') && !entry.name.includes('node_modules')
      );
      
      const totalBundleSize = jsResources.reduce((total, resource) => 
        total + (resource.transferSize || 0), 0
      );
      
      this.metrics.bundleSize = totalBundleSize;
      this.checkBudget('bundleSize', totalBundleSize);
    }
  }

  /**
   * Monitor memory usage
   */
  private monitorMemoryUsage() {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.memoryUsage = {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit
      };
    }
  }

  /**
   * Monitor long tasks (> 50ms)
   */
  private monitorLongTasks() {
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (entry.duration > 50) {
              console.warn(`Long task detected: ${entry.duration}ms`, entry);
              this.sendCustomMetric('long_task', {
                duration: entry.duration,
                startTime: entry.startTime,
                name: entry.name
              });
            }
          });
        });
        
        observer.observe({ entryTypes: ['longtask'] });
        this.observers.push(observer);
      } catch (error) {
        console.warn('Long task monitoring not supported:', error);
      }
    }
  }

  /**
   * Monitor layout shifts
   */
  private monitorLayoutShifts() {
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            if (entry.value > 0.1) {
              console.warn(`Significant layout shift detected: ${entry.value}`, entry);
              this.sendCustomMetric('layout_shift', {
                value: entry.value,
                startTime: entry.startTime,
                sources: entry.sources
              });
            }
          });
        });
        
        observer.observe({ entryTypes: ['layout-shift'] });
        this.observers.push(observer);
      } catch (error) {
        console.warn('Layout shift monitoring not supported:', error);
      }
    }
  }

  /**
   * Monitor first input delay
   */
  private monitorFirstInputDelay() {
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            this.metrics.interactionTime = entry.processingStart - entry.startTime;
            
            if (this.metrics.interactionTime > 100) {
              console.warn(`Slow interaction detected: ${this.metrics.interactionTime}ms`);
            }
          });
        });
        
        observer.observe({ entryTypes: ['first-input'] });
        this.observers.push(observer);
      } catch (error) {
        console.warn('First input delay monitoring not supported:', error);
      }
    }
  }

  /**
   * Check if metric exceeds budget
   */
  private checkBudget(metric: keyof PerformanceBudget, value: number) {
    const budgetValue = this.budget[metric];
    
    if (value > budgetValue) {
      console.warn(`Performance budget exceeded for ${metric}: ${value} > ${budgetValue}`);
      
      this.sendCustomMetric('budget_exceeded', {
        metric,
        value,
        budget: budgetValue,
        excess: value - budgetValue
      });
    }
  }

  /**
   * Send metric to analytics
   */
  private sendMetric(name: string, metric: Metric) {
    // Send to Google Analytics if available
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', name, {
        event_category: 'Web Vitals',
        value: Math.round(metric.value),
        metric_id: metric.id,
        metric_delta: metric.delta,
        custom_parameter: 'performance_monitoring'
      });
    }

    // Send to custom analytics endpoint
    if (this.analyticsEndpoint) {
      this.sendToAnalytics({
        type: 'web_vital',
        name,
        value: metric.value,
        id: metric.id,
        delta: metric.delta,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Send custom metric
   */
  private sendCustomMetric(name: string, data: any) {
    if (this.analyticsEndpoint) {
      this.sendToAnalytics({
        type: 'custom_metric',
        name,
        data,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Send data to analytics endpoint
   */
  private async sendToAnalytics(data: any) {
    if (!this.analyticsEndpoint) return;

    try {
      await fetch(this.analyticsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error('Failed to send analytics data:', error);
    }
  }

  /**
   * Setup beforeunload handler to send final metrics
   */
  private setupBeforeUnload() {
    window.addEventListener('beforeunload', () => {
      this.sendFinalMetrics();
    });

    // Also send metrics on visibility change (when user switches tabs)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.sendFinalMetrics();
      }
    });
  }

  /**
   * Send final metrics before page unload
   */
  private sendFinalMetrics() {
    const finalMetrics = this.getMetrics();
    
    if (this.analyticsEndpoint && navigator.sendBeacon) {
      navigator.sendBeacon(
        this.analyticsEndpoint,
        JSON.stringify({
          type: 'final_metrics',
          metrics: finalMetrics,
          timestamp: Date.now()
        })
      );
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    // Update memory usage
    this.monitorMemoryUsage();
    
    return { ...this.metrics };
  }

  /**
   * Get performance score (0-100)
   */
  getPerformanceScore(): number {
    const metrics = this.getMetrics();
    let score = 100;
    
    // Deduct points for budget violations
    Object.entries(this.budget).forEach(([key, budgetValue]) => {
      const metricValue = metrics[key as keyof PerformanceMetrics] as number;
      
      if (metricValue && metricValue > budgetValue) {
        const excess = (metricValue - budgetValue) / budgetValue;
        score -= Math.min(excess * 20, 20); // Max 20 points deduction per metric
      }
    });
    
    return Math.max(0, Math.round(score));
  }

  /**
   * Get performance report
   */
  getPerformanceReport(): {
    score: number;
    metrics: PerformanceMetrics;
    budget: PerformanceBudget;
    violations: Array<{ metric: string; value: number; budget: number; excess: number }>;
  } {
    const metrics = this.getMetrics();
    const score = this.getPerformanceScore();
    const violations: Array<{ metric: string; value: number; budget: number; excess: number }> = [];
    
    Object.entries(this.budget).forEach(([key, budgetValue]) => {
      const metricValue = metrics[key as keyof PerformanceMetrics] as number;
      
      if (metricValue && metricValue > budgetValue) {
        violations.push({
          metric: key,
          value: metricValue,
          budget: budgetValue,
          excess: metricValue - budgetValue
        });
      }
    });
    
    return {
      score,
      metrics,
      budget: this.budget,
      violations
    };
  }

  /**
   * Cleanup observers
   */
  cleanup() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

// Create global performance monitor instance
export const performanceMonitor = new PerformanceMonitor(
  {
    lcp: 2500,
    fid: 100,
    cls: 0.1,
    fcp: 1800,
    ttfb: 800,
    bundleSize: 1200000,
    loadTime: 3000
  },
  process.env.REACT_APP_ANALYTICS_ENDPOINT
);

// Auto-start monitoring when module loads
if (typeof window !== 'undefined') {
  // Start monitoring after page load
  if (document.readyState === 'complete') {
    performanceMonitor;
  } else {
    window.addEventListener('load', () => {
      performanceMonitor;
    });
  }
}

// Export utility functions
export const measurePerformance = (name: string, fn: () => void | Promise<void>) => {
  return async () => {
    const startTime = performance.now();
    
    try {
      await fn();
    } finally {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      console.log(`Performance: ${name} took ${duration.toFixed(2)}ms`);
      
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'performance_measure', {
          event_category: 'Performance',
          event_label: name,
          value: Math.round(duration),
          custom_parameter: 'performance_monitoring'
        });
      }
    }
  };
};

export const markPerformance = (name: string) => {
  if ('performance' in window && 'mark' in performance) {
    performance.mark(name);
  }
};

export const measureBetweenMarks = (startMark: string, endMark: string, measureName: string) => {
  if ('performance' in window && 'measure' in performance) {
    try {
      performance.measure(measureName, startMark, endMark);
      const measure = performance.getEntriesByName(measureName)[0];
      console.log(`Performance: ${measureName} took ${measure.duration.toFixed(2)}ms`);
      return measure.duration;
    } catch (error) {
      console.warn('Performance measurement failed:', error);
      return 0;
    }
  }
  return 0;
};