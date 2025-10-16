/**
 * FinBot v4 - Response Optimization Middleware
 * Advanced response optimization with streaming and compression
 */

import { Request, Response, NextFunction } from 'express';
import { Transform } from 'stream';
import { JSONStreamer, JSONMinifier } from '../utils/json-optimization';

interface OptimizationOptions {
  enableStreaming?: boolean;
  enableMinification?: boolean;
  streamThreshold?: number; // Minimum response size to stream (bytes)
  chunkSize?: number;
  removeEmpty?: boolean;
  compressKeys?: boolean;
}

const DEFAULT_OPTIONS: OptimizationOptions = {
  enableStreaming: true,
  enableMinification: true,
  streamThreshold: 50 * 1024, // 50KB
  chunkSize: 100,
  removeEmpty: true,
  compressKeys: false
};

/**
 * Response optimization middleware
 */
export const optimizeResponse = (options: OptimizationOptions = {}) => {
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    // Override res.json for optimization
    res.json = function(data: any) {
      return optimizeJsonResponse(this, data, config, originalJson);
    };

    // Override res.send for optimization
    res.send = function(data: any) {
      if (typeof data === 'object') {
        return optimizeJsonResponse(this, data, config, originalSend);
      }
      return originalSend(data);
    };

    next();
  };
};

/**
 * Optimize JSON response
 */
const optimizeJsonResponse = (
  res: Response,
  data: any,
  config: OptimizationOptions,
  originalMethod: Function
) => {
  try {
    let optimizedData = data;

    // Remove empty objects/arrays if enabled
    if (config.removeEmpty) {
      optimizedData = JSONMinifier.removeEmpty(optimizedData);
    }

    // Compress keys if enabled (for repeated structures)
    let keyMap: Map<string, string> | undefined;
    if (config.compressKeys) {
      const compressed = JSONMinifier.compressKeys(optimizedData);
      optimizedData = compressed.compressed;
      keyMap = compressed.keyMap;
      
      // Add key map to response headers for client decompression
      res.setHeader('X-Key-Map', JSON.stringify(Array.from(keyMap.entries())));
    }

    // Check if response should be streamed
    const jsonString = JSON.stringify(optimizedData);
    const shouldStream = config.enableStreaming && 
                        jsonString.length > (config.streamThreshold || 0) &&
                        Array.isArray(data);

    if (shouldStream) {
      return streamArrayResponse(res, optimizedData, config);
    }

    // Apply minification if enabled
    if (config.enableMinification) {
      const minified = JSONMinifier.minify(jsonString);
      res.setHeader('X-Minification-Ratio', 
        `${((jsonString.length - minified.length) / jsonString.length * 100).toFixed(1)}%`
      );
      return originalMethod(minified);
    }

    return originalMethod(optimizedData);

  } catch (error) {
    console.error('Response optimization error:', error);
    // Fallback to original response
    return originalMethod(data);
  }
};

/**
 * Stream array response for large datasets
 */
const streamArrayResponse = (
  res: Response,
  data: any[],
  config: OptimizationOptions
) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Stream-Type', 'array');
  res.setHeader('X-Total-Items', data.length.toString());

  JSONStreamer.streamArray(res, data, {
    chunkSize: config.chunkSize,
    transform: config.removeEmpty ? JSONMinifier.removeEmpty : undefined
  });
};

/**
 * Pagination optimization middleware
 */
export const optimizePagination = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);

    res.json = function(data: any) {
      // Optimize pagination responses
      if (data && data.data && Array.isArray(data.data) && data.pagination) {
        const optimized = optimizePaginatedResponse(data);
        return originalJson(optimized);
      }

      return originalJson(data);
    };

    next();
  };
};

/**
 * Optimize paginated response structure
 */
const optimizePaginatedResponse = (response: any) => {
  const { data, pagination, ...rest } = response;
  
  // Add metadata to help client optimize rendering
  const optimized = {
    ...rest,
    data,
    pagination: {
      ...pagination,
      hasData: data.length > 0,
      isEmpty: data.length === 0,
      isFirstPage: pagination.page === 1,
      isLastPage: pagination.page >= pagination.totalPages,
      itemsInPage: data.length
    },
    meta: {
      responseSize: JSON.stringify(data).length,
      itemCount: data.length,
      avgItemSize: data.length > 0 ? Math.round(JSON.stringify(data).length / data.length) : 0
    }
  };

  return optimized;
};

/**
 * Response caching optimization
 */
export const optimizeResponseCaching = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Set appropriate cache headers based on route
    const setCacheHeaders = () => {
      const path = req.path;
      
      if (path.includes('/dashboard') || path.includes('/summary')) {
        // Dashboard data - short cache
        res.setHeader('Cache-Control', 'public, max-age=120'); // 2 minutes
      } else if (path.includes('/workflows') && req.method === 'GET') {
        // Workflow data - medium cache
        res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minutes
      } else if (path.includes('/rules') && req.method === 'GET') {
        // Rules data - longer cache
        res.setHeader('Cache-Control', 'public, max-age=600'); // 10 minutes
      } else if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
        // Write operations - no cache
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
      
      // Add ETag for conditional requests
      res.setHeader('Vary', 'Accept-Encoding, Authorization');
    };

    // Set cache headers before response
    res.on('finish', setCacheHeaders);
    
    next();
  };
};

/**
 * Response compression ratio tracking
 */
export const trackCompressionRatio = () => {
  const stats = {
    totalResponses: 0,
    totalOriginalSize: 0,
    totalOptimizedSize: 0,
    optimizationMethods: {
      minification: 0,
      emptyRemoval: 0,
      keyCompression: 0,
      streaming: 0
    }
  };

  return {
    middleware: (req: Request, res: Response, next: NextFunction) => {
      const originalJson = res.json.bind(res);
      
      res.json = function(data: any) {
        const originalSize = JSON.stringify(data).length;
        stats.totalResponses++;
        stats.totalOriginalSize += originalSize;
        
        // Track optimization method used
        const streamType = res.getHeader('X-Stream-Type');
        const minificationRatio = res.getHeader('X-Minification-Ratio');
        const keyMap = res.getHeader('X-Key-Map');
        
        if (streamType) stats.optimizationMethods.streaming++;
        if (minificationRatio) stats.optimizationMethods.minification++;
        if (keyMap) stats.optimizationMethods.keyCompression++;
        
        return originalJson(data);
      };
      
      next();
    },
    
    getStats: () => ({
      ...stats,
      averageOptimizationRatio: stats.totalOriginalSize > 0 
        ? ((stats.totalOriginalSize - stats.totalOptimizedSize) / stats.totalOriginalSize * 100).toFixed(1) + '%'
        : '0%',
      averageResponseSize: stats.totalResponses > 0 
        ? Math.round(stats.totalOptimizedSize / stats.totalResponses) + ' bytes'
        : '0 bytes'
    })
  };
};

/**
 * Conditional response middleware (304 Not Modified)
 */
export const conditionalResponse = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    
    res.json = function(data: any) {
      // Generate ETag based on data
      const etag = generateETag(data);
      res.setHeader('ETag', etag);
      
      // Check if client has cached version
      const clientETag = req.headers['if-none-match'];
      if (clientETag === etag) {
        return res.status(304).end();
      }
      
      return originalJson(data);
    };
    
    next();
  };
};

/**
 * Generate ETag for response data
 */
const generateETag = (data: any): string => {
  const crypto = require('crypto');
  const hash = crypto.createHash('md5');
  hash.update(JSON.stringify(data));
  return `"${hash.digest('hex')}"`;
};