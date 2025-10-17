/**
 * Data Validation Module for Financial Transaction Data
 * Provides comprehensive validation schemas and quality checks
 */

const Joi = require('joi');
const logger = require('../../utils/logger');

// Transaction validation schema
const transactionSchema = Joi.object({
  transactionId: Joi.string().required().min(1).max(100),
  userId: Joi.string().required().uuid(),
  accountId: Joi.string().required().uuid(),
  amount: Joi.number().required().positive().precision(2),
  currency: Joi.string().required().length(3).uppercase(),
  category: Joi.string().required().min(1).max(50),
  merchant: Joi.string().allow('').max(100),
  description: Joi.string().allow('').max(500),
  location: Joi.object({
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
    address: Joi.string().max(200),
    city: Joi.string().max(50),
    country: Joi.string().length(2).uppercase()
  }).allow(null),
  timestamp: Joi.string().required().isoDate(),
  isInternational: Joi.boolean().default(false),
  metadata: Joi.object().default({})
});

// Quality check thresholds
const QUALITY_THRESHOLDS = {
  MAX_AMOUNT: 1000000, // $1M
  MIN_AMOUNT: 0.01,    // 1 cent
  MAX_DESCRIPTION_LENGTH: 500,
  SUSPICIOUS_KEYWORDS: [
    'test', 'dummy', 'fake', 'sample', 'debug'
  ],
  VALID_CURRENCIES: [
    'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SEK', 'NZD'
  ],
  VALID_CATEGORIES: [
    'food', 'transportation', 'entertainment', 'shopping', 'utilities',
    'healthcare', 'education', 'travel', 'insurance', 'investment',
    'transfer', 'salary', 'other'
  ]
};

class DataValidator {
  constructor(config = {}) {
    this.config = {
      strictMode: config.strictMode || false,
      customRules: config.customRules || [],
      qualityThresholds: { ...QUALITY_THRESHOLDS, ...config.qualityThresholds }
    };
    
    this.validationStats = {
      totalValidated: 0,
      passed: 0,
      failed: 0,
      warnings: 0
    };
  }

  async validateTransactionData(data) {
    this.validationStats.totalValidated++;
    
    const result = {
      isValid: false,
      data: null,
      errors: [],
      warnings: [],
      qualityScore: 0
    };

    try {
      // Schema validation
      const schemaResult = await this.validateSchema(data);
      if (!schemaResult.isValid) {
        result.errors.push(...schemaResult.errors);
        this.validationStats.failed++;
        return result;
      }

      result.data = schemaResult.data;

      // Business rule validation
      const businessRuleResult = await this.validateBusinessRules(result.data);
      if (!businessRuleResult.isValid) {
        if (this.config.strictMode) {
          result.errors.push(...businessRuleResult.errors);
          this.validationStats.failed++;
          return result;
        } else {
          result.warnings.push(...businessRuleResult.errors);
          this.validationStats.warnings++;
        }
      }

      // Quality checks
      const qualityResult = await this.performQualityChecks(result.data);
      result.warnings.push(...qualityResult.warnings);
      result.qualityScore = qualityResult.score;

      // Custom validation rules
      if (this.config.customRules.length > 0) {
        const customResult = await this.validateCustomRules(result.data);
        result.warnings.push(...customResult.warnings);
        if (!customResult.isValid && this.config.strictMode) {
          result.errors.push(...customResult.errors);
          this.validationStats.failed++;
          return result;
        }
      }

      result.isValid = true;
      this.validationStats.passed++;
      
    } catch (error) {
      result.errors.push(`Validation error: ${error.message}`);
      this.validationStats.failed++;
      logger.error('Data validation failed:', error);
    }

    return result;
  }

  async validateSchema(data) {
    try {
      const { error, value } = transactionSchema.validate(data, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        return {
          isValid: false,
          errors: error.details.map(detail => detail.message),
          data: null
        };
      }

      return {
        isValid: true,
        errors: [],
        data: value
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Schema validation error: ${error.message}`],
        data: null
      };
    }
  }

  async validateBusinessRules(data) {
    const errors = [];

    // Amount validation
    if (data.amount > this.config.qualityThresholds.MAX_AMOUNT) {
      errors.push(`Amount ${data.amount} exceeds maximum threshold`);
    }

    if (data.amount < this.config.qualityThresholds.MIN_AMOUNT) {
      errors.push(`Amount ${data.amount} below minimum threshold`);
    }

    // Currency validation
    if (!this.config.qualityThresholds.VALID_CURRENCIES.includes(data.currency)) {
      errors.push(`Invalid currency: ${data.currency}`);
    }

    // Category validation
    if (!this.config.qualityThresholds.VALID_CATEGORIES.includes(data.category.toLowerCase())) {
      errors.push(`Invalid category: ${data.category}`);
    }

    // Timestamp validation
    const transactionDate = new Date(data.timestamp);
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    if (transactionDate < oneYearAgo) {
      errors.push('Transaction date is too old (more than 1 year)');
    }

    if (transactionDate > oneHourFromNow) {
      errors.push('Transaction date is in the future');
    }

    // Location validation
    if (data.location) {
      if (data.location.latitude && (data.location.latitude < -90 || data.location.latitude > 90)) {
        errors.push('Invalid latitude value');
      }
      if (data.location.longitude && (data.location.longitude < -180 || data.location.longitude > 180)) {
        errors.push('Invalid longitude value');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async performQualityChecks(data) {
    const warnings = [];
    let qualityScore = 100;

    // Check for suspicious keywords
    const description = (data.description || '').toLowerCase();
    const merchant = (data.merchant || '').toLowerCase();
    
    for (const keyword of this.config.qualityThresholds.SUSPICIOUS_KEYWORDS) {
      if (description.includes(keyword) || merchant.includes(keyword)) {
        warnings.push(`Suspicious keyword detected: ${keyword}`);
        qualityScore -= 10;
      }
    }

    // Check data completeness
    if (!data.merchant || data.merchant.trim() === '') {
      warnings.push('Missing merchant information');
      qualityScore -= 5;
    }

    if (!data.description || data.description.trim() === '') {
      warnings.push('Missing transaction description');
      qualityScore -= 5;
    }

    if (!data.location) {
      warnings.push('Missing location information');
      qualityScore -= 3;
    }

    // Check for unusual patterns
    if (data.amount % 1 === 0 && data.amount > 100) {
      warnings.push('Round number amount may indicate test data');
      qualityScore -= 2;
    }

    // Check merchant name quality
    if (data.merchant && data.merchant.length < 3) {
      warnings.push('Merchant name too short');
      qualityScore -= 3;
    }

    // Check for duplicate-like patterns
    if (data.description && data.merchant && 
        data.description.toLowerCase() === data.merchant.toLowerCase()) {
      warnings.push('Description identical to merchant name');
      qualityScore -= 2;
    }

    // Ensure quality score doesn't go below 0
    qualityScore = Math.max(0, qualityScore);

    return {
      warnings,
      score: qualityScore
    };
  }

  async validateCustomRules(data) {
    const errors = [];
    const warnings = [];

    for (const rule of this.config.customRules) {
      try {
        const result = await rule.validate(data);
        if (!result.isValid) {
          if (rule.severity === 'error') {
            errors.push(result.message);
          } else {
            warnings.push(result.message);
          }
        }
      } catch (error) {
        warnings.push(`Custom rule validation failed: ${error.message}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Batch validation for multiple records
  async validateBatch(dataArray) {
    const results = [];
    const batchStats = {
      total: dataArray.length,
      valid: 0,
      invalid: 0,
      warnings: 0
    };

    for (const data of dataArray) {
      const result = await this.validateTransactionData(data);
      results.push(result);

      if (result.isValid) {
        batchStats.valid++;
      } else {
        batchStats.invalid++;
      }

      if (result.warnings.length > 0) {
        batchStats.warnings++;
      }
    }

    return {
      results,
      batchStats,
      overallValid: batchStats.invalid === 0
    };
  }

  // Get validation statistics
  getStats() {
    const total = this.validationStats.totalValidated;
    return {
      ...this.validationStats,
      successRate: total > 0 ? (this.validationStats.passed / total) * 100 : 0,
      failureRate: total > 0 ? (this.validationStats.failed / total) * 100 : 0,
      warningRate: total > 0 ? (this.validationStats.warnings / total) * 100 : 0
    };
  }

  // Reset statistics
  resetStats() {
    this.validationStats = {
      totalValidated: 0,
      passed: 0,
      failed: 0,
      warnings: 0
    };
  }

  // Add custom validation rule
  addCustomRule(rule) {
    if (typeof rule.validate !== 'function') {
      throw new Error('Custom rule must have a validate function');
    }
    
    this.config.customRules.push({
      name: rule.name || 'custom',
      severity: rule.severity || 'warning',
      validate: rule.validate
    });
  }

  // Remove custom validation rule
  removeCustomRule(ruleName) {
    this.config.customRules = this.config.customRules.filter(
      rule => rule.name !== ruleName
    );
  }
}

// Export validation function for direct use
async function validateTransactionData(data, config = {}) {
  const validator = new DataValidator(config);
  return await validator.validateTransactionData(data);
}

module.exports = {
  DataValidator,
  validateTransactionData,
  QUALITY_THRESHOLDS
};