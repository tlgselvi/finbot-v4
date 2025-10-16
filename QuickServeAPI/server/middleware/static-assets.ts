/**
 * FinBot v4 - Static Asset Optimization Middleware
 * CDN integration and static asset optimization
 */

import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import path from 'path';
import fs from 'fs';

interface CDNConfig {
  enabled: boolean;
  baseUrl: string;
  regions: string[];
  cacheTTL: number;
  fallbackToLocal: boolean;
}

interface AssetOptimizationConfig {
  enableVersioning: boolean;
  enableCompression: boolean;
  enableCaching: boolean;
  maxAge: number;
  immutableAssets: string[];
  compressibleTypes: string[];
}

const DEFAULT_CDN_CONFIG: CDNConfig = {
  enabled: process.env.NODE_ENV === 'production',
  baseUrl: process.env.CDN_BASE_URL || 'https://cdn.finbot.com',
  regions: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
  cacheTTL: 31536000, // 1 year
  fallbackToLocal: true
};

const DEFAULT_ASSET_CONFIG: AssetOptimizationConfig = {
  enableVersioning: true,
  enableCompression: true,
  enableCaching: true,
  maxAge: 31536000, // 1 year for versioned assets
  immutableAssets: ['.js', '.css', '.woff', '.woff2', '.ttf', '.eot'],
  compressibleTypes: [
    'text/css',
    'text/javascript',
    'application/javascript',
    'application/json',
    'text/html',
    'text/plain',
    'image/svg+xml'
  ]
};

// Asset version cache
const assetVersions = new Map<string, string>();
const assetHashes = new Map<string, string>();

/**
 * CDN middleware for static assets
 */
export const cdnMiddleware = (config: Partial<CDNConfig> = {}) => {
  const cdnConfig = { ...DEFAULT_CDN_CONFIG, ...config };
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip if CDN is disabled
    if (!cdnConfig.enabled) {
      return next();
    }

    // Only handle static asset requests
    if (!isStaticAsset(req.path)) {
      return next();
    }

    // Generate CDN URL
    const cdnUrl = generateCDNUrl(req.path, cdnConfig);
    
    // Add CDN headers
    res.setHeader('X-CDN-URL', cdnUrl);
    res.setHeader('X-CDN-Region', getBestRegion(req));
    
    // Redirect to CDN if not already served from CDN
    if (!req.headers['x-served-by-cdn'] && shouldRedirectToCDN(req)) {
      return res.redirect(301, cdnUrl);
    }

    next();
  };
};

/**
 * Static asset optimization middleware
 */
export const optimizeStaticAssets = (config: Partial<AssetOptimizationConfig> = {}) => {
  const assetConfig = { ...DEFAULT_ASSET_CONFIG, ...config };
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Only handle static assets
    if (!isStaticAsset(req.path)) {
      return next();
    }

    const filePath = req.path;
    const fileExtension = path.extname(filePath);
    
    // Set appropriate cache headers
    setCacheHeaders(res, filePath, fileExtension, assetConfig);
    
    // Add asset versioning
    if (assetConfig.enableVersioning) {
      addAssetVersioning(req, res, filePath);
    }
    
    // Add compression headers
    if (assetConfig.enableCompression && isCompressible(filePath, assetConfig)) {
      res.setHeader('Vary', 'Accept-Encoding');
    }
    
    // Add security headers for assets
    addSecurityHeaders(res, fileExtension);
    
    next();
  };
};

/**
 * Asset versioning middleware
 */
export const assetVersioning = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalSendFile = res.sendFile.bind(res);
    
    res.sendFile = function(filePath: string, options?: any) {
      // Generate version hash for the file
      const version = getAssetVersion(filePath);
      
      if (version) {
        this.setHeader('X-Asset-Version', version);
        this.setHeader('ETag', `"${version}"`);
        
        // Check if client has cached version
        const clientETag = req.headers['if-none-match'];
        if (clientETag === `"${version}"`) {
          return this.status(304).end();
        }
      }
      
      return originalSendFile(filePath, options);
    };
    
    next();
  };
};

/**
 * Generate CDN URL for asset
 */
const generateCDNUrl = (assetPath: string, config: CDNConfig): string => {
  const version = assetVersions.get(assetPath) || 'latest';
  const region = config.regions[0]; // Use primary region
  
  return `${config.baseUrl}/${region}${assetPath}?v=${version}`;
};

/**
 * Get best CDN region based on request
 */
const getBestRegion = (req: Request): string => {
  const clientIP = req.ip;
  const acceptLanguage = req.headers['accept-language'];
  
  // Simple region selection based on Accept-Language
  if (acceptLanguage?.includes('tr')) return 'eu-west-1';
  if (acceptLanguage?.includes('en-US')) return 'us-east-1';
  if (acceptLanguage?.includes('ja') || acceptLanguage?.includes('ko')) return 'ap-southeast-1';
  
  return 'us-east-1'; // Default region
};

/**
 * Check if request should be redirected to CDN
 */
const shouldRedirectToCDN = (req: Request): boolean => {
  // Don't redirect if already from CDN
  if (req.headers['x-served-by-cdn']) return false;
  
  // Don't redirect in development
  if (process.env.NODE_ENV !== 'production') return false;
  
  // Don't redirect for certain user agents (e.g., bots)
  const userAgent = req.headers['user-agent']?.toLowerCase();
  if (userAgent?.includes('bot') || userAgent?.includes('crawler')) return false;
  
  return true;
};

/**
 * Check if path is a static asset
 */
const isStaticAsset = (path: string): boolean => {
  const staticExtensions = [
    '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
    '.woff', '.woff2', '.ttf', '.eot', '.otf', '.mp4', '.webm', '.pdf'
  ];
  
  const extension = path.substring(path.lastIndexOf('.'));
  return staticExtensions.includes(extension);
};

/**
 * Set appropriate cache headers for assets
 */
const setCacheHeaders = (
  res: Response,
  filePath: string,
  fileExtension: string,
  config: AssetOptimizationConfig
) => {
  const isImmutable = config.immutableAssets.includes(fileExtension);
  
  if (isImmutable) {
    // Immutable assets - long cache with immutable directive
    res.setHeader('Cache-Control', `public, max-age=${config.maxAge}, immutable`);
  } else {
    // Mutable assets - shorter cache with revalidation
    res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
  }
  
  // Add Last-Modified header
  res.setHeader('Last-Modified', new Date().toUTCString());
};

/**
 * Add asset versioning headers
 */
const addAssetVersioning = (req: Request, res: Response, filePath: string) => {
  const version = getAssetVersion(filePath);
  
  if (version) {
    res.setHeader('X-Asset-Version', version);
    res.setHeader('ETag', `"${version}"`);
    
    // Handle conditional requests
    const clientETag = req.headers['if-none-match'];
    const clientModified = req.headers['if-modified-since'];
    
    if (clientETag === `"${version}"`) {
      res.status(304).end();
      return;
    }
  }
};

/**
 * Get or generate asset version hash
 */
const getAssetVersion = (filePath: string): string | null => {
  // Check cache first
  if (assetVersions.has(filePath)) {
    return assetVersions.get(filePath)!;
  }
  
  try {
    // Generate hash from file content
    const fullPath = path.join(process.cwd(), 'public', filePath);
    
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath);
      const hash = createHash('md5').update(content).digest('hex').substring(0, 8);
      
      assetVersions.set(filePath, hash);
      return hash;
    }
  } catch (error) {
    console.error(`Error generating version for ${filePath}:`, error);
  }
  
  return null;
};

/**
 * Check if asset is compressible
 */
const isCompressible = (filePath: string, config: AssetOptimizationConfig): boolean => {
  const extension = path.extname(filePath);
  const mimeType = getMimeType(extension);
  
  return config.compressibleTypes.some(type => mimeType.includes(type));
};

/**
 * Get MIME type for file extension
 */
const getMimeType = (extension: string): string => {
  const mimeTypes: Record<string, string> = {
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
  };
  
  return mimeTypes[extension] || 'application/octet-stream';
};

/**
 * Add security headers for assets
 */
const addSecurityHeaders = (res: Response, fileExtension: string) => {
  // Add CORS headers for fonts
  if (['.woff', '.woff2', '.ttf', '.eot', '.otf'].includes(fileExtension)) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
  }
  
  // Add X-Content-Type-Options for all assets
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Add referrer policy for images
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(fileExtension)) {
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  }
};

/**
 * Asset preloading middleware
 */
export const assetPreloading = () => {
  const criticalAssets = [
    '/css/main.css',
    '/js/main.js',
    '/fonts/inter-var.woff2'
  ];
  
  return (req: Request, res: Response, next: NextFunction) => {
    // Only add preload headers for HTML requests
    if (req.path === '/' || req.path.endsWith('.html')) {
      const preloadLinks = criticalAssets.map(asset => {
        const asType = getAssetType(asset);
        return `<${asset}>; rel=preload; as=${asType}`;
      }).join(', ');
      
      res.setHeader('Link', preloadLinks);
    }
    
    next();
  };
};

/**
 * Get asset type for preloading
 */
const getAssetType = (assetPath: string): string => {
  const extension = path.extname(assetPath);
  
  switch (extension) {
    case '.css': return 'style';
    case '.js': return 'script';
    case '.woff':
    case '.woff2':
    case '.ttf':
    case '.eot': return 'font';
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.gif':
    case '.svg': return 'image';
    default: return 'fetch';
  }
};

/**
 * Asset manifest generation
 */
export const generateAssetManifest = () => {
  const manifest: Record<string, {
    version: string;
    size: number;
    hash: string;
    lastModified: string;
  }> = {};
  
  const publicDir = path.join(process.cwd(), 'public');
  
  const scanDirectory = (dir: string, baseDir: string = '') => {
    if (!fs.existsSync(dir)) return;
    
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const relativePath = path.join(baseDir, file).replace(/\\/g, '/');
      
      if (fs.statSync(filePath).isDirectory()) {
        scanDirectory(filePath, relativePath);
      } else if (isStaticAsset(relativePath)) {
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath);
        const hash = createHash('md5').update(content).digest('hex');
        
        manifest[relativePath] = {
          version: hash.substring(0, 8),
          size: stats.size,
          hash,
          lastModified: stats.mtime.toISOString()
        };
      }
    });
  };
  
  scanDirectory(publicDir);
  
  return manifest;
};

/**
 * Service Worker cache strategy
 */
export const serviceWorkerCaching = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add service worker cache headers
    if (req.path === '/sw.js') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Service-Worker-Allowed', '/');
    }
    
    // Add cache strategy headers for different asset types
    if (isStaticAsset(req.path)) {
      const extension = path.extname(req.path);
      
      if (['.js', '.css'].includes(extension)) {
        res.setHeader('X-Cache-Strategy', 'stale-while-revalidate');
      } else if (['.png', '.jpg', '.jpeg', '.gif'].includes(extension)) {
        res.setHeader('X-Cache-Strategy', 'cache-first');
      } else if (['.woff', '.woff2', '.ttf'].includes(extension)) {
        res.setHeader('X-Cache-Strategy', 'cache-first');
      }
    }
    
    next();
  };
};