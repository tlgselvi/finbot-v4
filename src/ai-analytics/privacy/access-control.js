/**
 * Access Control System for AI Analytics
 * Implements role-based access control and audit logging
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const logger = require('../../utils/logger');
const DataPrivacyEngine = require('./data-privacy-engine');

class AccessControlSystem {
  constructor(config = {}) {
    this.config = {
      jwtSecret: config.jwtSecret || process.env.JWT_SECRET,
      jwtExpiresIn: config.jwtExpiresIn || '24h',
      bcryptRounds: config.bcryptRounds || 12,
      maxLoginAttempts: config.maxLoginAttempts || 5,
      lockoutDuration: config.lockoutDuration || 15 * 60 * 1000, // 15 minutes
      sessionTimeout: config.sessionTimeout || 60 * 60 * 1000, // 1 hour
      ...config
    };

    this.privacyEngine = new DataPrivacyEngine(config.privacy);
    this.activeSessions = new Map();
    this.loginAttempts = new Map();
    this.auditLogs = [];

    // Define role hierarchy and permissions
    this.roles = {
      admin: {
        level: 100,
        permissions: [
          'analytics:read',
          'analytics:write',
          'analytics:admin',
          'models:read',
          'models:write',
          'models:deploy',
          'data:read',
          'data:write',
          'data:delete',
          'users:read',
          'users:write',
          'audit:read'
        ]
      },
      data_scientist: {
        level: 80,
        permissions: [
          'analytics:read',
          'analytics:write',
          'models:read',
          'models:write',
          'models:deploy',
          'data:read',
          'data:write'
        ]
      },
      analyst: {
        level: 60,
        permissions: [
          'analytics:read',
          'models:read',
          'data:read'
        ]
      },
      api_user: {
        level: 40,
        permissions: [
          'analytics:read',
          'models:read'
        ]
      },
      viewer: {
        level: 20,
        permissions: [
          'analytics:read'
        ]
      }
    };

    // Resource-specific permissions
    this.resourcePermissions = {
      'user_data': ['data:read', 'data:write'],
      'transaction_data': ['data:read', 'data:write'],
      'ml_models': ['models:read', 'models:write', 'models:deploy'],
      'analytics_results': ['analytics:read', 'analytics:write'],
      'audit_logs': ['audit:read'],
      'system_config': ['analytics:admin']
    };
  }

  // === AUTHENTICATION METHODS ===

  /**
   * Authenticate user with username/password
   */
  async authenticate(username, password, clientInfo = {}) {
    try {
      // Check for account lockout
      if (this.isAccountLocked(username)) {
        await this.logSecurityEvent('authentication_blocked', username, {
          reason: 'account_locked',
          clientInfo
        });
        throw new Error('Account temporarily locked due to multiple failed attempts');
      }

      // Validate credentials (this would typically query a database)
      const user = await this.validateCredentials(username, password);
      
      if (!user) {
        await this.recordFailedLogin(username, clientInfo);
        await this.logSecurityEvent('authentication_failed', username, {
          reason: 'invalid_credentials',
          clientInfo
        });
        throw new Error('Invalid credentials');
      }

      // Reset failed login attempts on successful authentication
      this.loginAttempts.delete(username);

      // Generate session
      const session = await this.createSession(user, clientInfo);
      
      await this.logSecurityEvent('authentication_success', username, {
        sessionId: session.sessionId,
        clientInfo
      });

      return session;

    } catch (error) {
      logger.error('Authentication failed:', error);
      throw error;
    }
  }

  /**
   * Validate user credentials
   */
  async validateCredentials(username, password) {
    // This is a mock implementation - in production, this would query your user database
    const mockUsers = {
      'admin': {
        id: 'user_1',
        username: 'admin',
        passwordHash: await bcrypt.hash('admin123', this.config.bcryptRounds),
        role: 'admin',
        email: 'admin@finbot.com',
        isActive: true
      },
      'analyst': {
        id: 'user_2',
        username: 'analyst',
        passwordHash: await bcrypt.hash('analyst123', this.config.bcryptRounds),
        role: 'analyst',
        email: 'analyst@finbot.com',
        isActive: true
      }
    };

    const user = mockUsers[username];
    if (!user || !user.isActive) {
      return null;
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
      permissions: this.roles[user.role]?.permissions || []
    };
  }

  /**
   * Create authenticated session
   */
  async createSession(user, clientInfo = {}) {
    const sessionId = this.generateSessionId();
    const expiresAt = new Date(Date.now() + this.config.sessionTimeout);

    const sessionData = {
      sessionId,
      userId: user.id,
      username: user.username,
      role: user.role,
      permissions: user.permissions,
      createdAt: new Date(),
      expiresAt,
      clientInfo: {
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent,
        ipHash: clientInfo.ip ? this.privacyEngine.hashIP(clientInfo.ip) : null
      },
      isActive: true
    };

    // Store session
    this.activeSessions.set(sessionId, sessionData);

    // Generate JWT token
    const token = jwt.sign(
      {
        sessionId,
        userId: user.id,
        role: user.role,
        permissions: user.permissions
      },
      this.config.jwtSecret,
      { expiresIn: this.config.jwtExpiresIn }
    );

    return {
      token,
      sessionId,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        permissions: user.permissions
      },
      expiresAt
    };
  }

  /**
   * Validate session token
   */
  async validateSession(token) {
    try {
      // Verify JWT token
      const decoded = jwt.verify(token, this.config.jwtSecret);
      
      // Check if session exists and is active
      const session = this.activeSessions.get(decoded.sessionId);
      if (!session || !session.isActive) {
        throw new Error('Session not found or inactive');
      }

      // Check session expiration
      if (new Date() > session.expiresAt) {
        await this.invalidateSession(decoded.sessionId);
        throw new Error('Session expired');
      }

      // Update last activity
      session.lastActivity = new Date();

      return {
        sessionId: session.sessionId,
        userId: session.userId,
        username: session.username,
        role: session.role,
        permissions: session.permissions
      };

    } catch (error) {
      logger.warn('Session validation failed:', error.message);
      throw new Error('Invalid or expired session');
    }
  }

  /**
   * Invalidate session
   */
  async invalidateSession(sessionId, reason = 'logout') {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isActive = false;
      session.invalidatedAt = new Date();
      session.invalidationReason = reason;

      await this.logSecurityEvent('session_invalidated', session.username, {
        sessionId,
        reason
      });

      this.activeSessions.delete(sessionId);
    }
  }

  // === AUTHORIZATION METHODS ===

  /**
   * Check if user has required permission
   */
  hasPermission(userPermissions, requiredPermission) {
    if (!Array.isArray(userPermissions)) {
      return false;
    }

    // Admin has all permissions
    if (userPermissions.includes('analytics:admin')) {
      return true;
    }

    return userPermissions.includes(requiredPermission);
  }

  /**
   * Check if user can access resource
   */
  canAccessResource(userPermissions, resourceType, action = 'read') {
    const requiredPermissions = this.resourcePermissions[resourceType];
    if (!requiredPermissions) {
      return false;
    }

    const actionPermission = `${resourceType.split('_')[0]}:${action}`;
    return this.hasPermission(userPermissions, actionPermission) ||
           requiredPermissions.some(perm => this.hasPermission(userPermissions, perm));
  }

  /**
   * Check role hierarchy
   */
  hasRoleLevel(userRole, requiredLevel) {
    const userLevel = this.roles[userRole]?.level || 0;
    return userLevel >= requiredLevel;
  }

  /**
   * Filter data based on user permissions
   */
  filterDataByPermissions(data, userPermissions, dataType) {
    // Apply data filtering based on user role and permissions
    if (this.hasPermission(userPermissions, 'analytics:admin')) {
      return data; // Admin sees everything
    }

    // Apply field-level filtering
    const filteredData = { ...data };

    // Remove sensitive fields for non-admin users
    const sensitiveFields = {
      user_data: ['ssn', 'full_address', 'phone'],
      transaction_data: ['account_number', 'routing_number'],
      analytics_results: ['raw_user_ids']
    };

    const fieldsToRemove = sensitiveFields[dataType] || [];
    fieldsToRemove.forEach(field => {
      delete filteredData[field];
    });

    // Apply anonymization for certain roles
    if (!this.hasPermission(userPermissions, 'data:write')) {
      if (filteredData.userId) {
        filteredData.userId = this.privacyEngine.anonymizeUserId(filteredData.userId);
      }
    }

    return filteredData;
  }

  // === MIDDLEWARE FUNCTIONS ===

  /**
   * Express middleware for authentication
   */
  requireAuth() {
    return async (req, res, next) => {
      try {
        const token = this.extractToken(req);
        if (!token) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const session = await this.validateSession(token);
        req.user = session;
        req.sessionId = session.sessionId;

        next();
      } catch (error) {
        return res.status(401).json({ error: error.message });
      }
    };
  }

  /**
   * Express middleware for authorization
   */
  requirePermission(permission) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!this.hasPermission(req.user.permissions, permission)) {
        await this.logSecurityEvent('authorization_denied', req.user.username, {
          requiredPermission: permission,
          userPermissions: req.user.permissions,
          resource: req.path
        });
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      next();
    };
  }

  /**
   * Express middleware for resource access control
   */
  requireResourceAccess(resourceType, action = 'read') {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!this.canAccessResource(req.user.permissions, resourceType, action)) {
        await this.logSecurityEvent('resource_access_denied', req.user.username, {
          resourceType,
          action,
          userPermissions: req.user.permissions,
          resource: req.path
        });
        return res.status(403).json({ error: 'Resource access denied' });
      }

      next();
    };
  }

  // === SECURITY MONITORING ===

  /**
   * Record failed login attempt
   */
  async recordFailedLogin(username, clientInfo) {
    const attempts = this.loginAttempts.get(username) || {
      count: 0,
      firstAttempt: new Date(),
      lastAttempt: new Date()
    };

    attempts.count++;
    attempts.lastAttempt = new Date();

    this.loginAttempts.set(username, attempts);

    // Check if account should be locked
    if (attempts.count >= this.config.maxLoginAttempts) {
      attempts.lockedUntil = new Date(Date.now() + this.config.lockoutDuration);
      
      await this.logSecurityEvent('account_locked', username, {
        attemptCount: attempts.count,
        lockoutDuration: this.config.lockoutDuration,
        clientInfo
      });
    }
  }

  /**
   * Check if account is locked
   */
  isAccountLocked(username) {
    const attempts = this.loginAttempts.get(username);
    if (!attempts || !attempts.lockedUntil) {
      return false;
    }

    if (new Date() > attempts.lockedUntil) {
      // Lockout period expired, reset attempts
      this.loginAttempts.delete(username);
      return false;
    }

    return true;
  }

  /**
   * Log security events
   */
  async logSecurityEvent(eventType, username, details = {}) {
    const auditEntry = this.privacyEngine.createAuditLog(
      eventType,
      username,
      {
        ...details,
        timestamp: new Date().toISOString(),
        severity: this.getEventSeverity(eventType)
      },
      ['ip', 'userAgent', 'sessionId']
    );

    this.auditLogs.push(auditEntry);
    
    // Keep only last 10000 audit logs in memory
    if (this.auditLogs.length > 10000) {
      this.auditLogs = this.auditLogs.slice(-10000);
    }

    // Log high-severity events
    if (auditEntry.data.severity === 'high') {
      logger.warn(`Security event: ${eventType}`, auditEntry);
    }

    // In production, you would also store this in a database
    logger.info(`Security audit: ${eventType}`, { username, details });
  }

  /**
   * Get event severity level
   */
  getEventSeverity(eventType) {
    const severityMap = {
      'authentication_failed': 'medium',
      'authentication_blocked': 'high',
      'account_locked': 'high',
      'authorization_denied': 'medium',
      'resource_access_denied': 'medium',
      'session_invalidated': 'low',
      'authentication_success': 'low'
    };

    return severityMap[eventType] || 'low';
  }

  // === UTILITY METHODS ===

  /**
   * Extract token from request
   */
  extractToken(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }

  /**
   * Generate secure session ID
   */
  generateSessionId() {
    return this.privacyEngine.generateSecureRandom(32);
  }

  /**
   * Get active sessions count
   */
  getActiveSessionsCount() {
    return this.activeSessions.size;
  }

  /**
   * Get security statistics
   */
  getSecurityStats() {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const recentAudits = this.auditLogs.filter(
      log => new Date(log.timestamp) > last24h
    );

    const eventCounts = {};
    recentAudits.forEach(log => {
      eventCounts[log.action] = (eventCounts[log.action] || 0) + 1;
    });

    return {
      activeSessions: this.activeSessions.size,
      lockedAccounts: Array.from(this.loginAttempts.values())
        .filter(attempt => attempt.lockedUntil && new Date() < attempt.lockedUntil).length,
      auditEvents24h: recentAudits.length,
      eventBreakdown: eventCounts,
      lastUpdated: now.toISOString()
    };
  }

  /**
   * Cleanup expired sessions
   */
  cleanupExpiredSessions() {
    const now = new Date();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now > session.expiresAt) {
        this.activeSessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired sessions`);
    }

    return cleanedCount;
  }

  /**
   * Start periodic cleanup
   */
  startPeriodicCleanup(intervalMs = 5 * 60 * 1000) { // 5 minutes
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, intervalMs);
  }
}

module.exports = AccessControlSystem;