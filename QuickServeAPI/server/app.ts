/**
 * FinBot v4 - Express Application Setup
 * Main application configuration with performance optimizations
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { advancedCompression, compressionStats } from './middleware/compression';
import { batchRequests } from './middleware/request-batching';
import { optimizeJsonResponse } from './utils/json-optimization';
import { cacheQuery } from './middleware/query-cache';

// Import routes
import apiRoutes from './routes/index';
import healthRoutes from './routes/health';

const app = express();

// Initialize compression stats
const { middleware: compressionStatsMiddleware, getStats } = compressionStats();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/api/health' || req.path === '/health';
  }
});

app.use(limiter);

// Request logging
app.use(requestLogger);

// Compression middleware (must be before other middleware that sends responses)
app.use(advancedCompression());
app.use(compressionStatsMiddleware);

// JSON optimization
app.use(optimizeJsonResponse());

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  strict: true,
  type: ['application/json', 'application/*+json']
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 1000
}));

// Request batching middleware
app.use(batchRequests());

// Health check (before authentication)
app.use('/health', healthRoutes);

// API routes
app.use('/api', apiRoutes);

// Compression statistics endpoint
app.get('/api/stats/compression', (req, res) => {
  res.json({
    success: true,
    data: getStats(),
    timestamp: new Date().toISOString()
  });
});

// Performance monitoring endpoint
app.get('/api/stats/performance', (req, res) => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  res.json({
    success: true,
    data: {
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    },
    timestamp: new Date().toISOString()
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// 404 handler for unmatched routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    code: 'ROUTE_NOT_FOUND',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

export default app;