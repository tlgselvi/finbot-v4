/**
 * ML Optimization API Routes
 * 
 * Express routes for ML model performance optimization, including
 * model quantization, pruning, GPU acceleration, and performance monitoring.
 */

const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

// Rate limiting
const optimizationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 optimization requests per windowMs
  message: 'Too many optimization requests, please try again later.'
});

// Mock data for development - replace with actual service calls
let mockOptimizations = [
  {
    id: '1',
    modelName: 'spending_predictor',
    optimizationType: 'quantization',
    originalSizeMb: 45.2,
    optimizedSizeMb: 12.8,
    sizeReductionPercent: 71.7,
    status: 'completed',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    performance: {
      avgLatencyMs: 15.3,
      throughputPredPerSec: 65.4
    }
  },
  {
    id: '2',
    modelName: 'anomaly_detector',
    optimizationType: 'pruning',
    originalSizeMb: 32.1,
    optimizedSizeMb: 19.8,
    sizeReductionPercent: 38.3,
    status: 'completed',
    createdAt: new Date(Date.now() - 43200000).toISOString(),
    performance: {
      avgLatencyMs: 8.7,
      throughputPredPerSec: 114.9
    }
  },
  {
    id: '3',
    modelName: 'risk_assessor',
    optimizationType: 'onnx_conversion',
    originalSizeMb: 28.5,
    optimizedSizeMb: 24.1,
    sizeReductionPercent: 15.4,
    status: 'in_progress',
    createdAt: new Date().toISOString()
  }
];

let mockSystemMetrics = {
  cpu: {
    utilizationPercent: 45.2,
    memoryPercent: 67.8
  },
  gpu: [
    {
      deviceId: 0,
      name: 'NVIDIA RTX 4090',
      memoryUtilizationPercent: 34.5,
      memoryAllocatedMb: 8192,
      memoryTotalMb: 24576,
      temperature: 72
    }
  ],
  timestamp: Date.now()
};

let mockCacheMetrics = {
  hitRate: 87.3,
  missRate: 12.7,
  totalRequests: 15420,
  cacheSize: 1024 * 1024 * 512, // 512MB
  evictions: 234
};

let mockPerformanceHistory = [];

// Generate mock performance history
for (let i = 24; i >= 0; i--) {
  mockPerformanceHistory.push({
    avgLatency: 12 + Math.random() * 8,
    p95Latency: 25 + Math.random() * 15,
    throughput: 80 + Math.random() * 40,
    errorRate: Math.random() * 2,
    timestamp: Date.now() - (i * 3600000) // Hours ago
  });
}

/**
 * @route GET /api/ml/optimizations
 * @desc Get all model optimizations
 * @access Private
 */
router.get('/optimizations', async (req, res) => {
  try {
    const { model, status, limit = 50 } = req.query;
    
    let filteredOptimizations = [...mockOptimizations];
    
    if (model && model !== 'all') {
      filteredOptimizations = filteredOptimizations.filter(opt => opt.modelName === model);
    }
    
    if (status) {
      filteredOptimizations = filteredOptimizations.filter(opt => opt.status === status);
    }
    
    filteredOptimizations = filteredOptimizations.slice(0, parseInt(limit));
    
    res.json({
      success: true,
      optimizations: filteredOptimizations,
      total: filteredOptimizations.length
    });
  } catch (error) {
    console.error('Error fetching optimizations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch optimizations',
      error: error.message
    });
  }
});

/**
 * @route POST /api/ml/optimize
 * @desc Start model optimization
 * @access Private
 */
router.post('/optimize', 
  optimizationLimiter,
  [
    body('modelName').notEmpty().withMessage('Model name is required'),
    body('optimizationType').isIn(['quantization', 'pruning', 'onnx_conversion', 'tensorflow_lite'])
      .withMessage('Invalid optimization type')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { modelName, optimizationType, options = {} } = req.body;
      
      // Create new optimization job
      const newOptimization = {
        id: Date.now().toString(),
        modelName,
        optimizationType,
        originalSizeMb: 0,
        optimizedSizeMb: 0,
        sizeReductionPercent: 0,
        status: 'in_progress',
        createdAt: new Date().toISOString(),
        options
      };
      
      mockOptimizations.unshift(newOptimization);
      
      // Simulate optimization process
      setTimeout(() => {
        const optimization = mockOptimizations.find(opt => opt.id === newOptimization.id);
        if (optimization) {
          optimization.status = 'completed';
          optimization.originalSizeMb = 30 + Math.random() * 20;
          optimization.optimizedSizeMb = optimization.originalSizeMb * (0.3 + Math.random() * 0.4);
          optimization.sizeReductionPercent = 
            ((optimization.originalSizeMb - optimization.optimizedSizeMb) / optimization.originalSizeMb) * 100;
          optimization.performance = {
            avgLatencyMs: 5 + Math.random() * 20,
            throughputPredPerSec: 50 + Math.random() * 100
          };
        }
      }, 5000 + Math.random() * 10000); // 5-15 seconds
      
      res.json({
        success: true,
        message: 'Optimization started',
        optimizationId: newOptimization.id,
        estimatedDuration: '5-15 minutes'
      });
    } catch (error) {
      console.error('Error starting optimization:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start optimization',
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/ml/system-metrics
 * @desc Get current system metrics
 * @access Private
 */
router.get('/system-metrics', async (req, res) => {
  try {
    // Update mock metrics with some variation
    mockSystemMetrics.cpu.utilizationPercent = Math.max(0, Math.min(100, 
      mockSystemMetrics.cpu.utilizationPercent + (Math.random() - 0.5) * 10));
    mockSystemMetrics.cpu.memoryPercent = Math.max(0, Math.min(100, 
      mockSystemMetrics.cpu.memoryPercent + (Math.random() - 0.5) * 5));
    
    if (mockSystemMetrics.gpu && mockSystemMetrics.gpu.length > 0) {
      mockSystemMetrics.gpu[0].memoryUtilizationPercent = Math.max(0, Math.min(100,
        mockSystemMetrics.gpu[0].memoryUtilizationPercent + (Math.random() - 0.5) * 15));
      mockSystemMetrics.gpu[0].temperature = Math.max(30, Math.min(90,
        mockSystemMetrics.gpu[0].temperature + (Math.random() - 0.5) * 5));
    }
    
    mockSystemMetrics.timestamp = Date.now();
    
    res.json(mockSystemMetrics);
  } catch (error) {
    console.error('Error fetching system metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system metrics',
      error: error.message
    });
  }
});

/**
 * @route GET /api/ml/cache-metrics
 * @desc Get cache performance metrics
 * @access Private
 */
router.get('/cache-metrics', async (req, res) => {
  try {
    // Update mock cache metrics
    mockCacheMetrics.totalRequests += Math.floor(Math.random() * 100);
    mockCacheMetrics.hitRate = Math.max(70, Math.min(95, 
      mockCacheMetrics.hitRate + (Math.random() - 0.5) * 2));
    mockCacheMetrics.missRate = 100 - mockCacheMetrics.hitRate;
    
    res.json(mockCacheMetrics);
  } catch (error) {
    console.error('Error fetching cache metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cache metrics',
      error: error.message
    });
  }
});

/**
 * @route GET /api/ml/performance-history
 * @desc Get performance metrics history
 * @access Private
 */
router.get('/performance-history', 
  [
    query('hours').optional().isInt({ min: 1, max: 168 }).withMessage('Hours must be between 1 and 168')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const hours = parseInt(req.query.hours) || 24;
      const hoursAgo = hours * 3600000;
      const cutoffTime = Date.now() - hoursAgo;
      
      // Filter history and add new data points
      let filteredHistory = mockPerformanceHistory.filter(point => point.timestamp >= cutoffTime);
      
      // Add a new data point
      const latestPoint = {
        avgLatency: 12 + Math.random() * 8,
        p95Latency: 25 + Math.random() * 15,
        throughput: 80 + Math.random() * 40,
        errorRate: Math.random() * 2,
        timestamp: Date.now()
      };
      
      filteredHistory.push(latestPoint);
      mockPerformanceHistory = filteredHistory;
      
      res.json({
        success: true,
        metrics: filteredHistory,
        timeRange: `${hours} hours`
      });
    } catch (error) {
      console.error('Error fetching performance history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch performance history',
        error: error.message
      });
    }
  }
);

/**
 * @route POST /api/ml/cache/clear
 * @desc Clear prediction cache
 * @access Private
 */
router.post('/cache/clear', async (req, res) => {
  try {
    // Reset cache metrics
    mockCacheMetrics.totalRequests = 0;
    mockCacheMetrics.hitRate = 0;
    mockCacheMetrics.missRate = 0;
    mockCacheMetrics.cacheSize = 0;
    mockCacheMetrics.evictions = 0;
    
    res.json({
      success: true,
      message: 'Cache cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
      error: error.message
    });
  }
});

/**
 * @route POST /api/ml/gpu/clear-cache
 * @desc Clear GPU memory cache
 * @access Private
 */
router.post('/gpu/clear-cache', async (req, res) => {
  try {
    // Simulate GPU cache clearing
    if (mockSystemMetrics.gpu && mockSystemMetrics.gpu.length > 0) {
      mockSystemMetrics.gpu[0].memoryUtilizationPercent = Math.max(10, 
        mockSystemMetrics.gpu[0].memoryUtilizationPercent * 0.3);
    }
    
    res.json({
      success: true,
      message: 'GPU cache cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing GPU cache:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear GPU cache',
      error: error.message
    });
  }
});

/**
 * @route GET /api/ml/models/:modelName/benchmark
 * @desc Benchmark model performance
 * @access Private
 */
router.get('/models/:modelName/benchmark', async (req, res) => {
  try {
    const { modelName } = req.params;
    const { iterations = 100 } = req.query;
    
    // Simulate benchmarking
    const benchmarkResults = {
      modelName,
      iterations: parseInt(iterations),
      avgLatencyMs: 10 + Math.random() * 20,
      throughputPredPerSec: 50 + Math.random() * 100,
      totalTimeMs: (10 + Math.random() * 20) * parseInt(iterations),
      memoryUsageMb: 100 + Math.random() * 500,
      timestamp: Date.now()
    };
    
    res.json({
      success: true,
      benchmark: benchmarkResults
    });
  } catch (error) {
    console.error('Error benchmarking model:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to benchmark model',
      error: error.message
    });
  }
});

/**
 * @route GET /api/ml/health
 * @desc Health check for ML optimization services
 * @access Private
 */
router.get('/health', async (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      services: {
        optimization: 'running',
        gpu_acceleration: mockSystemMetrics.gpu && mockSystemMetrics.gpu.length > 0 ? 'running' : 'unavailable',
        cache: 'running',
        monitoring: 'running'
      },
      metrics: {
        activeOptimizations: mockOptimizations.filter(opt => opt.status === 'in_progress').length,
        completedOptimizations: mockOptimizations.filter(opt => opt.status === 'completed').length,
        cacheHitRate: mockCacheMetrics.hitRate,
        avgLatency: mockPerformanceHistory[mockPerformanceHistory.length - 1]?.avgLatency || 0
      },
      timestamp: Date.now()
    };
    
    res.json(healthStatus);
  } catch (error) {
    console.error('Error in health check:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: Date.now()
    });
  }
});

module.exports = router;