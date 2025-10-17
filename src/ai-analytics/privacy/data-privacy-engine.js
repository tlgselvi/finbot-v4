/**
 * Data Privacy Engine for FinBot AI Analytics
 * Implements data encryption, anonymization, and privacy-preserving techniques
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const logger = require('../../utils/logger');

class DataPrivacyEngine {
  constructor(config = {}) {
    this.config = {
      encryptionAlgorithm: config.encryptionAlgorithm || 'aes-256-gcm',
      keyDerivationRounds: config.keyDerivationRounds || 100000,
      saltLength: config.saltLength || 32,
      ivLength: config.ivLength || 16,
      tagLength: config.tagLength || 16,
      masterKey: config.masterKey || process.env.MASTER_ENCRYPTION_KEY,
      anonymizationSalt: config.anonymizationSalt || process.env.ANONYMIZATION_SALT,
      differentialPrivacyEpsilon: config.differentialPrivacyEpsilon || 1.0,
      ...config
    };

    if (!this.config.masterKey) {
      throw new Error('Master encryption key is required');
    }

    this.keyCache = new Map();
    this.anonymizationCache = new Map();
  }

  // === ENCRYPTION METHODS ===

  /**
   * Encrypt sensitive data at rest
   */
  async encryptData(data, context = {}) {
    try {
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);
      const salt = crypto.randomBytes(this.config.saltLength);
      const iv = crypto.randomBytes(this.config.ivLength);
      
      // Derive key from master key and context
      const key = await this.deriveKey(this.config.masterKey, salt, context);
      
      // Encrypt data
      const cipher = crypto.createCipher(this.config.encryptionAlgorithm, key, iv);
      let encrypted = cipher.update(dataString, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Combine all components
      const result = {
        encrypted,
        salt: salt.toString('hex'),
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        algorithm: this.config.encryptionAlgorithm,
        timestamp: new Date().toISOString()
      };

      return Buffer.from(JSON.stringify(result)).toString('base64');
    } catch (error) {
      logger.error('Data encryption failed:', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt sensitive data
   */
  async decryptData(encryptedData, context = {}) {
    try {
      const dataObj = JSON.parse(Buffer.from(encryptedData, 'base64').toString());
      
      const salt = Buffer.from(dataObj.salt, 'hex');
      const iv = Buffer.from(dataObj.iv, 'hex');
      const tag = Buffer.from(dataObj.tag, 'hex');
      
      // Derive the same key
      const key = await this.deriveKey(this.config.masterKey, salt, context);
      
      // Decrypt data
      const decipher = crypto.createDecipher(dataObj.algorithm, key, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(dataObj.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Try to parse as JSON, fallback to string
      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    } catch (error) {
      logger.error('Data decryption failed:', error);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Derive encryption key from master key and context
   */
  async deriveKey(masterKey, salt, context = {}) {
    const contextString = JSON.stringify(context);
    const cacheKey = `${salt.toString('hex')}-${contextString}`;
    
    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey);
    }

    const key = crypto.pbkdf2Sync(
      masterKey + contextString,
      salt,
      this.config.keyDerivationRounds,
      32, // 256 bits
      'sha256'
    );

    this.keyCache.set(cacheKey, key);
    return key;
  }

  // === ANONYMIZATION METHODS ===

  /**
   * Anonymize user identifiers using consistent hashing
   */
  anonymizeUserId(userId) {
    if (this.anonymizationCache.has(userId)) {
      return this.anonymizationCache.get(userId);
    }

    const hash = crypto
      .createHmac('sha256', this.config.anonymizationSalt)
      .update(userId)
      .digest('hex')
      .substring(0, 16); // Use first 16 characters

    const anonymizedId = `anon_${hash}`;
    this.anonymizationCache.set(userId, anonymizedId);
    
    return anonymizedId;
  }

  /**
   * Pseudonymize sensitive fields while maintaining referential integrity
   */
  pseudonymizeData(data, fields = []) {
    const pseudonymized = { ...data };
    
    fields.forEach(field => {
      if (pseudonymized[field]) {
        pseudonymized[field] = this.generatePseudonym(pseudonymized[field], field);
      }
    });

    return pseudonymized;
  }

  /**
   * Generate consistent pseudonym for a value
   */
  generatePseudonym(value, fieldType) {
    const hash = crypto
      .createHmac('sha256', this.config.anonymizationSalt + fieldType)
      .update(value.toString())
      .digest('hex');

    switch (fieldType) {
      case 'email':
        return `user_${hash.substring(0, 8)}@example.com`;
      case 'phone':
        return `+1555${hash.substring(0, 7)}`;
      case 'name':
        return `User_${hash.substring(0, 8)}`;
      case 'address':
        return `${hash.substring(0, 4)} Anonymous St, Privacy City`;
      default:
        return `pseudo_${hash.substring(0, 12)}`;
    }
  }

  // === DATA MASKING METHODS ===

  /**
   * Mask sensitive data for logging or display
   */
  maskSensitiveData(data, maskingRules = {}) {
    const defaultRules = {
      email: (email) => email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
      phone: (phone) => phone.replace(/(\d{3})(\d{3})(\d{4})/, '$1-***-$3'),
      ssn: (ssn) => ssn.replace(/(\d{3})(\d{2})(\d{4})/, '***-**-$3'),
      creditCard: (cc) => cc.replace(/(\d{4})(\d{8})(\d{4})/, '$1-****-****-$3'),
      amount: (amount) => amount > 1000 ? '***' : amount.toString(),
      ...maskingRules
    };

    const masked = { ...data };
    
    Object.keys(defaultRules).forEach(field => {
      if (masked[field]) {
        masked[field] = defaultRules[field](masked[field]);
      }
    });

    return masked;
  }

  // === DIFFERENTIAL PRIVACY METHODS ===

  /**
   * Add differential privacy noise to numerical data
   */
  addDifferentialPrivacyNoise(value, sensitivity = 1, epsilon = null) {
    const actualEpsilon = epsilon || this.config.differentialPrivacyEpsilon;
    
    // Laplace mechanism for differential privacy
    const scale = sensitivity / actualEpsilon;
    const noise = this.generateLaplaceNoise(scale);
    
    return value + noise;
  }

  /**
   * Generate Laplace noise for differential privacy
   */
  generateLaplaceNoise(scale) {
    // Generate uniform random number in (-0.5, 0.5)
    const u = Math.random() - 0.5;
    
    // Apply inverse CDF of Laplace distribution
    const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    
    return noise;
  }

  /**
   * Apply differential privacy to aggregated statistics
   */
  privatizeAggregation(aggregation, queryType = 'count') {
    const sensitivities = {
      count: 1,
      sum: 1000, // Assuming max transaction amount
      avg: 1000,
      max: 1000,
      min: 1000
    };

    const sensitivity = sensitivities[queryType] || 1;
    
    if (typeof aggregation === 'number') {
      return this.addDifferentialPrivacyNoise(aggregation, sensitivity);
    }

    // Handle object aggregations
    const privatized = {};
    Object.keys(aggregation).forEach(key => {
      if (typeof aggregation[key] === 'number') {
        privatized[key] = this.addDifferentialPrivacyNoise(aggregation[key], sensitivity);
      } else {
        privatized[key] = aggregation[key];
      }
    });

    return privatized;
  }

  // === ACCESS CONTROL METHODS ===

  /**
   * Generate access token with embedded permissions
   */
  async generateAccessToken(userId, permissions, expiresIn = 3600) {
    const payload = {
      userId: this.anonymizeUserId(userId),
      permissions,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + expiresIn
    };

    const token = await this.encryptData(payload, { type: 'access_token' });
    return token;
  }

  /**
   * Validate and decode access token
   */
  async validateAccessToken(token) {
    try {
      const payload = await this.decryptData(token, { type: 'access_token' });
      
      // Check expiration
      if (payload.exp < Math.floor(Date.now() / 1000)) {
        throw new Error('Token expired');
      }

      return payload;
    } catch (error) {
      logger.error('Token validation failed:', error);
      throw new Error('Invalid token');
    }
  }

  /**
   * Check if user has required permission
   */
  hasPermission(userPermissions, requiredPermission) {
    if (!Array.isArray(userPermissions)) {
      return false;
    }

    return userPermissions.includes(requiredPermission) || 
           userPermissions.includes('admin');
  }

  // === AUDIT LOGGING METHODS ===

  /**
   * Create privacy-compliant audit log entry
   */
  createAuditLog(action, userId, data = {}, sensitiveFields = []) {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      action,
      userId: this.anonymizeUserId(userId),
      sessionId: this.generateSessionId(),
      data: this.maskSensitiveData(data, this.getSensitiveFieldMasks(sensitiveFields)),
      ipHash: data.ip ? this.hashIP(data.ip) : null,
      userAgent: data.userAgent ? this.hashUserAgent(data.userAgent) : null
    };

    return auditEntry;
  }

  /**
   * Hash IP address for privacy
   */
  hashIP(ip) {
    return crypto
      .createHash('sha256')
      .update(ip + this.config.anonymizationSalt)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Hash user agent for privacy
   */
  hashUserAgent(userAgent) {
    return crypto
      .createHash('sha256')
      .update(userAgent + this.config.anonymizationSalt)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Get masking rules for sensitive fields
   */
  getSensitiveFieldMasks(fields) {
    const masks = {};
    fields.forEach(field => {
      masks[field] = () => '***';
    });
    return masks;
  }

  // === DATA RETENTION METHODS ===

  /**
   * Check if data should be retained based on privacy policies
   */
  shouldRetainData(dataType, createdAt, userConsent = true) {
    const retentionPolicies = {
      transaction: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
      user_profile: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
      analytics: 2 * 365 * 24 * 60 * 60 * 1000, // 2 years
      logs: 1 * 365 * 24 * 60 * 60 * 1000, // 1 year
    };

    if (!userConsent) {
      return false;
    }

    const retentionPeriod = retentionPolicies[dataType] || retentionPolicies.analytics;
    const dataAge = Date.now() - new Date(createdAt).getTime();

    return dataAge < retentionPeriod;
  }

  /**
   * Anonymize data for long-term retention
   */
  anonymizeForRetention(data, dataType) {
    const anonymized = { ...data };
    
    // Remove or anonymize PII based on data type
    const piiFields = {
      transaction: ['userId', 'accountId', 'merchant', 'description'],
      user_profile: ['name', 'email', 'phone', 'address'],
      analytics: ['userId', 'sessionId', 'ipAddress']
    };

    const fieldsToAnonymize = piiFields[dataType] || [];
    
    fieldsToAnonymize.forEach(field => {
      if (anonymized[field]) {
        anonymized[field] = this.generatePseudonym(anonymized[field], field);
      }
    });

    // Add anonymization metadata
    anonymized._anonymized = true;
    anonymized._anonymizedAt = new Date().toISOString();

    return anonymized;
  }

  // === CONSENT MANAGEMENT ===

  /**
   * Validate user consent for data processing
   */
  validateConsent(userId, processingType, consentData) {
    const requiredConsents = {
      analytics: ['data_processing', 'analytics'],
      ml_training: ['data_processing', 'analytics', 'ml_training'],
      personalization: ['data_processing', 'personalization'],
      marketing: ['data_processing', 'marketing']
    };

    const required = requiredConsents[processingType] || ['data_processing'];
    
    return required.every(consent => 
      consentData[consent] && 
      new Date(consentData[consent].grantedAt) > new Date(consentData[consent].revokedAt || 0)
    );
  }

  // === UTILITY METHODS ===

  /**
   * Securely compare two values to prevent timing attacks
   */
  secureCompare(a, b) {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Generate cryptographically secure random string
   */
  generateSecureRandom(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Clear sensitive data from memory
   */
  clearSensitiveData(obj) {
    if (typeof obj === 'object' && obj !== null) {
      Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'string') {
          obj[key] = '0'.repeat(obj[key].length);
        }
        delete obj[key];
      });
    }
  }

  /**
   * Get privacy compliance report
   */
  getPrivacyComplianceReport() {
    return {
      encryptionEnabled: !!this.config.masterKey,
      anonymizationEnabled: !!this.config.anonymizationSalt,
      differentialPrivacyEnabled: this.config.differentialPrivacyEpsilon > 0,
      auditLoggingEnabled: true,
      dataRetentionPolicies: true,
      consentManagement: true,
      lastUpdated: new Date().toISOString()
    };
  }
}

module.exports = DataPrivacyEngine;