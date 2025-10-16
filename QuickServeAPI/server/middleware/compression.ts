/**
 * FinBot v4 - Response Compression Middleware
 * Advanced compression with Gzip/Brotli support and optimization
 */

import { Request, Response, NextFunction } from 'express';
import compression from 'compression';
import { createBrotliCompress, createGzip, constants } from 'zlib';
import { pipeline } from 'stream';
import { promisify } from 'util';

const pipelineAsync = promisify(pipeline);

// Compression configuration
const COMPRESSION_CONFIG = {
  // Minimum response size to compress (bytes)
  threshold: 1024,
  
  // Compression levels
  gzip: {
    level: constants.Z_BEST_COMPRESSION,
    windowBits: 15,
    memLevel: 8,
    strategy: constants.Z_DEFAULT_STRATEGY
  },
  
  brotli: {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 6, // Balance between compression and speed
      [constants.BROTLI_PARAM_SIZE_HINT]: 0,
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT
    }
  },
  
  // Content types to compress
  compressibleTypes: [
    'application/json',
    'application/javascript',
    'application/xml',
    'text/css',
    'text/html',
    'text/javascript',
    'text/plain',
    'text/xml',
    'image/svg+xml'
  ],
  
  // Routes to skip compression
  skipRoutes: [
    '/api/health',
    '/api/metrics'
  ]
};

/**
 * Check if content type is compressible
 */
const isCompressible = (contentType: string): boolean => {
  if (!contentType) return false;
  
  return COMPRESSION_CONFIG.compressibleTypes.some(type => 
    contentType.toLowerCase().includes(type)
  );
};

/**
 * Check if route should be compressed
 */
const shouldCompress = (req: Request): boolean => {
  return !COMPRESSION_CONFIG.skipRoutes.some(route => 
    req.path.startsWith(route)
  );
};

/**
 * Get best compression method based on Accept-Encoding header
 */
const getBestCompression = (acceptEncoding: string): 'br' | 'gzip' | null => {
  if (!acceptEncoding) return null;
  
  const encoding = acceptEncoding.toLowerCase();
  
  // Prefer Brotli if supported (better compression)
  if (encoding.includes('br')) return 'br';
  if (encoding.includes('gzip')) return 'gzip';
  
  return null;
};

/**
 * Custom compression middleware with Brotli support
 */
export const advancedCompression = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip compression for certain routes
    if (!shouldCompress(req)) {
      return next();
    }

    const originalSend = res.send.bind(res);
    const originalJson = res.json.bind(res);

    // Override res.send
    res.send = function(data: any) {
      return compressResponse(this, data, originalSend);
    };

    // Override res.json
    res.json = function(data: any) {
      const jsonString = JSON.stringify(data);
      this.setHeader('Content-Type', 'application/json; charset=utf-8');
      return compressResponse(this, jsonString, originalSend);
    };

    next();
  };
};

/**
 * Compress response data
 */
const compressResponse = async (
  res: Response,
  data: any,
  originalSend: Function
): Promise<Response> => {
  const req = res.req as Request;
  
  // Convert data to buffer
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  
  // Skip compression for small responses
  if (buffer.length < COMPRESSION_CONFIG.threshold) {
    return originalSend.call(res, data);
  }

  // Check if content type is compressible
  const contentType = res.getHeader('Content-Type') as string;
  if (!isCompressible(contentType)) {
    return originalSend.call(res, data);
  }

  // Get best compression method
  const acceptEncoding = req.headers['accept-encoding'] as string;
  const compressionMethod = getBestCompression(acceptEncoding);
  
  if (!compressionMethod) {
    return originalSend.call(res, data);
  }

  try {
    let compressedData: Buffer;
    
    if (compressionMethod === 'br') {
      compressedData = await compressBrotli(buffer);
      res.setHeader('Content-Encoding', 'br');
    } else {
      compressedData = await compressGzip(buffer);
      res.setHeader('Content-Encoding', 'gzip');
    }

    // Set headers
    res.setHeader('Content-Length', compressedData.length);
    res.setHeader('Vary', 'Accept-Encoding');
    
    // Add compression ratio to response headers (for monitoring)
    const compressionRatio = ((buffer.length - compressedData.length) / buffer.length * 100).toFixed(1);
    res.setHeader('X-Compression-Ratio', `${compressionRatio}%`);
    res.setHeader('X-Original-Size', buffer.length.toString());
    res.setHeader('X-Compressed-Size', compressedData.length.toString());

    return originalSend.call(res, compressedData);
    
  } catch (error) {
    console.error('Compression error:', error);
    // Fallback to uncompressed response
    return originalSend.call(res, data);
  }
};

/**
 * Compress data using Brotli
 */
const compressBrotli = async (data: Buffer): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const brotli = createBrotliCompress(COMPRESSION_CONFIG.brotli);
    
    brotli.on('data', (chunk) => chunks.push(chunk));
    brotli.on('end', () => resolve(Buffer.concat(chunks)));
    brotli.on('error', reject);
    
    brotli.write(data);
    brotli.end();
  });
};

/**
 * Compress data using Gzip
 */
const compressGzip = async (data: Buffer): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gzip = createGzip(COMPRESSION_CONFIG.gzip);
    
    gzip.on('data', (chunk) => chunks.push(chunk));
    gzip.on('end', () => resolve(Buffer.concat(chunks)));
    gzip.on('error', reject);
    
    gzip.write(data);
    gzip.end();
  });
};

/**
 * Standard Express compression middleware (fallback)
 */
export const standardCompression = compression({
  threshold: COMPRESSION_CONFIG.threshold,
  level: 6,
  filter: (req, res) => {
    // Skip compression for certain routes
    if (!shouldCompress(req)) return false;
    
    // Use compression's default filter
    return compression.filter(req, res);
  }
});

/**
 * Compression statistics middleware
 */
export const compressionStats = () => {
  const stats = {
    totalRequests: 0,
    compressedRequests: 0,
    totalOriginalSize: 0,
    totalCompressedSize: 0,
    compressionMethods: {
      br: 0,
      gzip: 0,
      none: 0
    }
  };

  return {
    middleware: (req: Request, res: Response, next: NextFunction) => {
      stats.totalRequests++;
      
      // Track compression stats
      res.on('finish', () => {
        const encoding = res.getHeader('Content-Encoding') as string;
        const originalSize = parseInt(res.getHeader('X-Original-Size') as string || '0');
        const compressedSize = parseInt(res.getHeader('X-Compressed-Size') as string || '0');
        
        if (encoding && originalSize && compressedSize) {
          stats.compressedRequests++;
          stats.totalOriginalSize += originalSize;
          stats.totalCompressedSize += compressedSize;
          
          if (encoding === 'br') {
            stats.compressionMethods.br++;
          } else if (encoding === 'gzip') {
            stats.compressionMethods.gzip++;
          }
        } else {
          stats.compressionMethods.none++;
        }
      });
      
      next();
    },
    
    getStats: () => ({
      ...stats,
      compressionRatio: stats.totalOriginalSize > 0 
        ? ((stats.totalOriginalSize - stats.totalCompressedSize) / stats.totalOriginalSize * 100).toFixed(1) + '%'
        : '0%',
      compressionRate: stats.totalRequests > 0 
        ? (stats.compressedRequests / stats.totalRequests * 100).toFixed(1) + '%'
        : '0%'
    })
  };
};