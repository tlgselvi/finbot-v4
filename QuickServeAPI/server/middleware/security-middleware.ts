/**
 * FinBot v4 - Security Middleware
 * Comprehensive security hardening measures
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { body, validationResult, sanitizeBody } from 'express-validator';
import crypto from 'crypto';
import { auditService } from '../services/audit-service';

// Rate limiting configurations
export const createRateLimiter = (windowMs: number, max: number, message?: string) => {
  return rateLimit({
    windowMs,
    max,
    message: message || 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req: Request, res: Response) => {
      // Log rate limit violations
      auditService.logSecurityEvent({
        type: 'rate_limit_exceeded',
        userId: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        timestamp: new Date()
      });

      res.status(429).json({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.round(windowMs / 1000)
      });
    }
  });
};

// Different rate limits for different endpoints
export const generalRateLimit = createRateLimiter(15 * 60 * 1000, 100); // 100 requests per 15 minutes
export const authRateLimit = createRateLimiter(15 * 60 * 1000, 5); // 5 login attempts per 15 minutes
export const approvalRateLimit = createRateLimiter(60 * 1000, 10); // 10 approval actions per minute
export const reportRateLimit = createRateLimiter(60 * 60 * 1000, 5); // 5 reports per hour

// Security headers middleware
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});

// Input validation and sanitization
export const validateAndSanitizeInput = [
  // Sanitize all string inputs
  body('*').customSanitizer((value) => {
    if (typeof value === 'string') {
      // Remove potentially dangerous characters
      return value.replace(/[<>\"'%;()&+]/g, '');
    }
    return value;
  }),

  // Validate common fields
  body('email').optional().isEmail().normalizeEmail(),
  body('amount').optional().isNumeric().toFloat(),
  body('comments').optional().isLength({ max: 1000 }).trim(),
  
  // Custom validation middleware
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Log validation failures
      auditService.logSecurityEvent({
        type: 'input_validation_failed',
        userId: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        details: { errors: errors.array() },
        timestamp: new Date()
      });

      return res.status(400).json({
        error: 'Input validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
    }
    next();
  }
];

// SQL injection protection
export const sqlInjectionProtection = (req: Request, res: Response, next: NextFunction) => {
  const suspiciousPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
    /(--|\/\*|\*\/|;)/g,
    /(\b(WAITFOR|DELAY)\b)/gi
  ];

  const checkForSqlInjection = (obj: any, path = ''): boolean => {
    if (typeof obj === 'string') {
      return suspiciousPatterns.some(pattern => pattern.test(obj));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        if (checkForSqlInjection(value, `${path}.${key}`)) {
          return true;
        }
      }
    }
    
    return false;
  };

  if (checkForSqlInjection(req.body) || checkForSqlInjection(req.query) || checkForSqlInjection(req.params)) {
    // Log potential SQL injection attempt
    auditService.logSecurityEvent({
      type: 'sql_injection_attempt',
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      details: {
        body: req.body,
        query: req.query,
        params: req.params
      },
      timestamp: new Date()
    });

    return res.status(400).json({
      error: 'Invalid input detected',
      code: 'INVALID_INPUT'
    });
  }

  next();
};

// XSS protection
export const xssProtection = (req: Request, res: Response, next: NextFunction) => {
  const xssPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<img[^>]+src[\\s]*=[\\s]*["\']javascript:/gi
  ];

  const checkForXss = (obj: any): boolean => {
    if (typeof obj === 'string') {
      return xssPatterns.some(pattern => pattern.test(obj));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      for (const value of Object.values(obj)) {
        if (checkForXss(value)) {
          return true;
        }
      }
    }
    
    return false;
  };

  if (checkForXss(req.body) || checkForXss(req.query)) {
    // Log potential XSS attempt
    auditService.logSecurityEvent({
      type: 'xss_attempt',
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      details: {
        body: req.body,
        query: req.query
      },
      timestamp: new Date()
    });

    return res.status(400).json({
      error: 'Invalid content detected',
      code: 'INVALID_CONTENT'
    });
  }

  next();
};

// CSRF protection
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF for GET requests and API endpoints with proper authentication
  if (req.method === 'GET' || req.path.startsWith('/api/')) {
    return next();
  }

  const token = req.headers['x-csrf-token'] as string;
  const sessionToken = req.session?.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    auditService.logSecurityEvent({
      type: 'csrf_token_invalid',
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      timestamp: new Date()
    });

    return res.status(403).json({
      error: 'Invalid CSRF token',
      code: 'CSRF_TOKEN_INVALID'
    });
  }

  next();
};

// IP whitelist/blacklist
export const ipFiltering = (req: Request, res: Response, next: NextFunction) => {
  const clientIp = req.ip;
  
  // Blacklisted IPs (would be stored in database/cache)
  const blacklistedIps = new Set([
    // Add known malicious IPs
  ]);

  // Whitelist for admin endpoints (optional)
  const adminWhitelist = new Set([
    '127.0.0.1',
    '::1'
  ]);

  if (blacklistedIps.has(clientIp)) {
    auditService.logSecurityEvent({
      type: 'blacklisted_ip_access',
      ipAddress: clientIp,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      timestamp: new Date()
    });

    return res.status(403).json({
      error: 'Access denied',
      code: 'IP_BLOCKED'
    });
  }

  // Check whitelist for admin endpoints
  if (req.path.startsWith('/api/admin/') && !adminWhitelist.has(clientIp)) {
    auditService.logSecurityEvent({
      type: 'admin_access_from_non_whitelisted_ip',
      ipAddress: clientIp,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      timestamp: new Date()
    });

    return res.status(403).json({
      error: 'Admin access restricted',
      code: 'ADMIN_ACCESS_RESTRICTED'
    });
  }

  next();
};

// Request size limiting
export const requestSizeLimit = (maxSize: number = 10 * 1024 * 1024) => { // 10MB default
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > maxSize) {
      auditService.logSecurityEvent({
        type: 'request_size_exceeded',
        userId: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        details: { contentLength, maxSize },
        timestamp: new Date()
      });

      return res.status(413).json({
        error: 'Request too large',
        code: 'REQUEST_TOO_LARGE',
        maxSize
      });
    }

    next();
  };
};

// Sensitive data encryption
export const encryptSensitiveData = (data: any): string => {
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipher(algorithm, key);
  cipher.setAAD(Buffer.from('approval-system'));
  
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return JSON.stringify({
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  });
};

// Sensitive data decryption
export const decryptSensitiveData = (encryptedData: string): any => {
  try {
    const { encrypted, iv, authTag } = JSON.parse(encryptedData);
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
    
    const decipher = crypto.createDecipher(algorithm, key);
    decipher.setAAD(Buffer.from('approval-system'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (error) {
    throw new Error('Failed to decrypt sensitive data');
  }
};

// Security audit logging
export const securityAuditLogger = (req: Request, res: Response, next: NextFunction) => {
  // Log all requests to sensitive endpoints
  const sensitiveEndpoints = [
    '/api/approval-workflows',
    '/api/approval-rules',
    '/api/audit-reports',
    '/api/admin'
  ];

  const isSensitive = sensitiveEndpoints.some(endpoint => req.path.startsWith(endpoint));
  
  if (isSensitive) {
    auditService.logSecurityEvent({
      type: 'sensitive_endpoint_access',
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      method: req.method,
      timestamp: new Date()
    });
  }

  next();
};

// Session security
export const sessionSecurity = (req: Request, res: Response, next: NextFunction) => {
  if (req.session) {
    // Regenerate session ID periodically
    const lastRegeneration = req.session.lastRegeneration || 0;
    const now = Date.now();
    
    if (now - lastRegeneration > 30 * 60 * 1000) { // 30 minutes
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err);
        } else {
          req.session!.lastRegeneration = now;
        }
        next();
      });
    } else {
      next();
    }
  } else {
    next();
  }
};

// Export all security middleware
export const securityMiddleware = {
  generalRateLimit,
  authRateLimit,
  approvalRateLimit,
  reportRateLimit,
  securityHeaders,
  validateAndSanitizeInput,
  sqlInjectionProtection,
  xssProtection,
  csrfProtection,
  ipFiltering,
  requestSizeLimit,
  securityAuditLogger,
  sessionSecurity,
  encryptSensitiveData,
  decryptSensitiveData
};