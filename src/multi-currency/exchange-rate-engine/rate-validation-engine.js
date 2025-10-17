/**
 * Rate Validation and Quality Assurance Engine
 * Comprehensive validation system for exchange rates with anomaly detection
 */

const EventEmitter = require('events');
const logger = require('../../utils/logger');

class RateValidationEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      validation: {
        maxRateDeviation: config.validation?.maxRateDeviation || 0.1, // 10%
        minQualityScore: config.validation?.minQualityScore || 70,
        maxSpreadPercent: config.validation?.maxSpreadPercent || 5, // 5%
        staleDataThreshold: config.validation?.staleDataThreshold || 300000, // 5 minutes
        minProviderCount: config.validation?.minProviderCount || 2,
        crossRateToleranceBps: config.validation?.crossRateToleranceBps || 10, // 10 basis points
        ...config.validation
      },
      anomaly: {
        enabled: config.anomaly?.enabled || true,
        zScoreThreshold: config.anomaly?.zScoreThreshold || 3,
        windowSize: config.anomaly?.windowSize || 100,
        minHistorySize: config.anomaly?.minHistorySize || 10,
        ...config.anomaly
      },
      arbitrage: {
        enabled: config.arbitrage?.enabled || true,
        minOpportunityBps: config.arbitrage?.minOpportunityBps || 5, // 5 basis points
        maxTriangularDeviation: config.arbitrage?.maxTriangularDeviation || 0.001, // 0.1%
        ...config.arbitrage
      },
      reliability: {
        trackProviderPerformance: config.reliability?.trackProviderPerformance || true,
        minReliabilityScore: config.reliability?.minReliabilityScore || 0.8,
        reliabilityDecayFactor: config.reliability?.reliabilityDecayFactor || 0.95,
        ...config.reliability
      },
      ...config
    };

    // Historical data for anomaly detection
    this.rateHistory = new Map();
    
    // Provider reliability tracking
    this.providerReliability = new Map();
    
    // Cross-rate validation cache
    this.crossRateCache = new Map();
    
    // Validation statistics
    this.stats = {
      totalValidations: 0,
      passedValidations: 0,
      failedValidations: 0,
      anomaliesDetected: 0,
      arbitrageOpportunities: 0,
      providerFailures: new Map()
    };

    // Quality metrics
    this.qualityMetrics = {
      averageQualityScore: 0,
      averageSpread: 0,
      averageProviderCount: 0,
      dataFreshness: 0
    };
  }

  // Main validation method
  async validateRates(rates, metadata = {}) {
    const validationResults = {
      overall: {
        isValid: true,
        qualityScore: 0,
        warnings: [],
        errors: [],
        timestamp: new Date()
      },
      rates: {},
      crossRateValidation: null,
      arbitrageOpportunities: [],
      providerReliability: {},
      recommendations: []
    };

    this.stats.totalValidations++;

    try {
      // 1. Individual rate validation
      for (const [pair, rateData] of Object.entries(rates)) {
        const rateValidation = await this.validateSingleRate(pair, rateData, metadata);
        validationResults.rates[pair] = rateValidation;
        
        if (!rateValidation.isValid) {
          validationResults.overall.isValid = false;
          validationResults.overall.errors.push(...rateValidation.errors);
        }
        
        validationResults.overall.warnings.push(...rateValidation.warnings);
      }

      // 2. Cross-rate validation
      if (this.config.arbitrage.enabled) {
        validationResults.crossRateValidation = await this.validateCrossRates(rates);
        validationResults.arbitrageOpportunities = validationResults.crossRateValidation.opportunities;
      }

      // 3. Provider reliability assessment
      if (this.config.reliability.trackProviderPerformance) {
        validationResults.providerReliability = await this.assessProviderReliability(rates);
      }

      // 4. Calculate overall quality score
      validationResults.overall.qualityScore = this.calculateOverallQualityScore(validationResults);

      // 5. Generate recommendations
      validationResults.recommendations = this.generateRecommendations(validationResults);

      // Update statistics
      if (validationResults.overall.isValid) {
        this.stats.passedValidations++;
      } else {
        this.stats.failedValidations++;
      }

      this.stats.anomaliesDetected += Object.values(validationResults.rates)
        .filter(r => r.anomalyScore > this.config.anomaly.zScoreThreshold).length;

      this.stats.arbitrageOpportunities += validationResults.arbitrageOpportunities.length;

      // Update quality metrics
      this.updateQualityMetrics(validationResults);

      // Emit validation event
      this.emit('validationComplete', validationResults);

      return validationResults;

    } catch (error) {
      logger.error('Rate validation failed:', error);
      validationResults.overall.isValid = false;
      validationResults.overall.errors.push(`Validation error: ${error.message}`);
      
      this.emit('validationError', error);
      return validationResults;
    }
  }

  // Individual rate validation
  async validateSingleRate(pair, rateData, metadata = {}) {
    const validation = {
      pair,
      isValid: true,
      qualityScore: 100,
      warnings: [],
      errors: [],
      anomalyScore: 0,
      checks: {
        basicValidation: false,
        rangeValidation: false,
        freshnessValidation: false,
        spreadValidation: false,
        providerValidation: false,
        anomalyDetection: false
      }
    };

    try {
      // 1. Basic validation
      validation.checks.basicValidation = this.performBasicValidation(rateData, validation);

      // 2. Range validation
      validation.checks.rangeValidation = this.performRangeValidation(pair, rateData, validation);

      // 3. Data freshness validation
      validation.checks.freshnessValidation = this.performFreshnessValidation(rateData, validation);

      // 4. Spread validation
      validation.checks.spreadValidation = this.performSpreadValidation(rateData, validation);

      // 5. Provider validation
      validation.checks.providerValidation = this.performProviderValidation(rateData, validation);

      // 6. Anomaly detection
      if (this.config.anomaly.enabled) {
        validation.checks.anomalyDetection = await this.performAnomalyDetection(pair, rateData, validation);
      }

      // Calculate final quality score
      validation.qualityScore = this.calculateRateQualityScore(validation, rateData);

      // Determine if rate is valid
      validation.isValid = validation.errors.length === 0 && 
                          validation.qualityScore >= this.config.validation.minQualityScore;

    } catch (error) {
      validation.isValid = false;
      validation.errors.push(`Validation error: ${error.message}`);
      logger.error(`Error validating rate ${pair}:`, error);
    }

    return validation;
  }

  // Basic validation checks
  performBasicValidation(rateData, validation) {
    // Check if rate exists and is a valid number
    if (!rateData.rate || typeof rateData.rate !== 'number' || isNaN(rateData.rate)) {
      validation.errors.push('Invalid or missing rate value');
      return false;
    }

    // Check if rate is positive
    if (rateData.rate <= 0) {
      validation.errors.push('Rate must be positive');
      return false;
    }

    // Check for reasonable rate bounds (e.g., not extremely small or large)
    if (rateData.rate < 0.000001 || rateData.rate > 1000000) {
      validation.warnings.push('Rate value is outside typical range');
    }

    // Validate bid/ask if present
    if (rateData.bid && rateData.ask) {
      if (rateData.bid >= rateData.ask) {
        validation.errors.push('Bid rate must be less than ask rate');
        return false;
      }
      
      if (rateData.bid <= 0 || rateData.ask <= 0) {
        validation.errors.push('Bid and ask rates must be positive');
        return false;
      }
    }

    return true;
  }

  // Range validation against historical data
  performRangeValidation(pair, rateData, validation) {
    const history = this.rateHistory.get(pair);
    
    if (!history || history.length < this.config.anomaly.minHistorySize) {
      validation.warnings.push('Insufficient historical data for range validation');
      return true; // Pass validation but with warning
    }

    // Calculate historical statistics
    const rates = history.map(h => h.rate);
    const mean = rates.reduce((a, b) => a + b) / rates.length;
    const variance = rates.reduce((a, b) => a + Math.pow(b - mean, 2)) / rates.length;
    const stdDev = Math.sqrt(variance);

    // Check if current rate is within acceptable range
    const deviation = Math.abs(rateData.rate - mean) / mean;
    
    if (deviation > this.config.validation.maxRateDeviation) {
      validation.warnings.push(`Rate deviation ${(deviation * 100).toFixed(2)}% exceeds threshold`);
      validation.qualityScore -= 20;
    }

    // Z-score calculation for anomaly detection
    const zScore = Math.abs((rateData.rate - mean) / stdDev);
    validation.zScore = zScore;

    return true;
  }

  // Data freshness validation
  performFreshnessValidation(rateData, validation) {
    if (!rateData.timestamp) {
      validation.warnings.push('Missing timestamp');
      return true;
    }

    const age = Date.now() - new Date(rateData.timestamp).getTime();
    
    if (age > this.config.validation.staleDataThreshold) {
      validation.warnings.push(`Stale data: ${Math.round(age / 1000)}s old`);
      validation.qualityScore -= Math.min(30, age / 10000); // Reduce score based on age
    }

    return true;
  }

  // Spread validation
  performSpreadValidation(rateData, validation) {
    if (!rateData.bid || !rateData.ask) {
      return true; // No spread to validate
    }

    const spread = rateData.ask - rateData.bid;
    const spreadPercent = (spread / rateData.rate) * 100;

    if (spreadPercent > this.config.validation.maxSpreadPercent) {
      validation.warnings.push(`High spread: ${spreadPercent.toFixed(3)}%`);
      validation.qualityScore -= 15;
    }

    // Check for negative spread (should not happen)
    if (spread < 0) {
      validation.errors.push('Negative spread detected');
      return false;
    }

    return true;
  }

  // Provider validation
  performProviderValidation(rateData, validation) {
    if (!rateData.providers || !Array.isArray(rateData.providers)) {
      validation.warnings.push('Missing provider information');
      return true;
    }

    if (rateData.providers.length < this.config.validation.minProviderCount) {
      validation.warnings.push(`Insufficient providers: ${rateData.providers.length}`);
      validation.qualityScore -= 10;
    }

    // Check provider reliability
    let totalReliability = 0;
    let reliableProviders = 0;

    rateData.providers.forEach(provider => {
      const reliability = this.providerReliability.get(provider);
      if (reliability) {
        totalReliability += reliability.score;
        if (reliability.score >= this.config.reliability.minReliabilityScore) {
          reliableProviders++;
        }
      }
    });

    if (reliableProviders === 0) {
      validation.warnings.push('No reliable providers');
      validation.qualityScore -= 25;
    }

    const avgReliability = totalReliability / rateData.providers.length;
    validation.avgProviderReliability = avgReliability;

    return true;
  }

  // Anomaly detection
  async performAnomalyDetection(pair, rateData, validation) {
    if (!this.config.anomaly.enabled) {
      return true;
    }

    const history = this.rateHistory.get(pair) || [];
    
    if (history.length < this.config.anomaly.minHistorySize) {
      // Add to history and skip anomaly detection
      this.addToHistory(pair, rateData);
      return true;
    }

    // Calculate z-score
    const rates = history.map(h => h.rate);
    const mean = rates.reduce((a, b) => a + b) / rates.length;
    const variance = rates.reduce((a, b) => a + Math.pow(b - mean, 2)) / rates.length;
    const stdDev = Math.sqrt(variance);
    
    const zScore = Math.abs((rateData.rate - mean) / stdDev);
    validation.anomalyScore = zScore;

    if (zScore > this.config.anomaly.zScoreThreshold) {
      validation.warnings.push(`Anomaly detected: z-score ${zScore.toFixed(2)}`);
      validation.qualityScore -= Math.min(40, zScore * 10);
      
      this.emit('anomalyDetected', {
        pair,
        rate: rateData.rate,
        zScore,
        mean,
        stdDev,
        timestamp: new Date()
      });
    }

    // Add current rate to history
    this.addToHistory(pair, rateData);

    return true;
  }

  // Cross-rate validation
  async validateCrossRates(rates) {
    const validation = {
      isValid: true,
      opportunities: [],
      inconsistencies: [],
      triangularArbitrage: []
    };

    const pairs = Object.keys(rates);
    const currencies = [...new Set(pairs.flatMap(pair => pair.split('/')))];

    // Check triangular arbitrage opportunities
    for (let i = 0; i < currencies.length; i++) {
      for (let j = i + 1; j < currencies.length; j++) {
        for (let k = j + 1; k < currencies.length; k++) {
          const curr1 = currencies[i];
          const curr2 = currencies[j];
          const curr3 = currencies[k];

          const arbitrage = this.checkTriangularArbitrage(curr1, curr2, curr3, rates);
          if (arbitrage.opportunity) {
            validation.opportunities.push(arbitrage);
            validation.triangularArbitrage.push(arbitrage);
          }
        }
      }
    }

    // Check for rate inconsistencies
    const inconsistencies = this.checkRateConsistencies(rates);
    validation.inconsistencies = inconsistencies;

    if (inconsistencies.length > 0) {
      validation.isValid = false;
    }

    return validation;
  }

  // Triangular arbitrage detection
  checkTriangularArbitrage(curr1, curr2, curr3, rates) {
    const rate12 = this.findRate(curr1, curr2, rates);
    const rate23 = this.findRate(curr2, curr3, rates);
    const rate31 = this.findRate(curr3, curr1, rates);

    if (!rate12 || !rate23 || !rate31) {
      return { opportunity: false, reason: 'Missing rates' };
    }

    // Calculate implied rate vs actual rate
    const impliedRate = rate12 * rate23 * rate31;
    const deviation = Math.abs(impliedRate - 1);

    const opportunity = deviation > this.config.arbitrage.maxTriangularDeviation;

    return {
      opportunity,
      currencies: [curr1, curr2, curr3],
      rates: { rate12, rate23, rate31 },
      impliedRate,
      deviation,
      profitPotentialBps: deviation * 10000, // In basis points
      timestamp: new Date()
    };
  }

  // Find rate between two currencies
  findRate(fromCurrency, toCurrency, rates) {
    // Direct rate
    const directPair = `${fromCurrency}/${toCurrency}`;
    if (rates[directPair]) {
      return rates[directPair].rate;
    }

    // Inverse rate
    const inversePair = `${toCurrency}/${fromCurrency}`;
    if (rates[inversePair]) {
      return 1 / rates[inversePair].rate;
    }

    return null;
  }

  // Check rate consistencies
  checkRateConsistencies(rates) {
    const inconsistencies = [];
    
    // Check for duplicate pairs with different rates
    const pairRates = new Map();
    
    Object.entries(rates).forEach(([pair, rateData]) => {
      const [base, quote] = pair.split('/');
      const normalizedPair = base < quote ? `${base}/${quote}` : `${quote}/${base}`;
      
      if (pairRates.has(normalizedPair)) {
        const existing = pairRates.get(normalizedPair);
        const currentRate = base < quote ? rateData.rate : 1 / rateData.rate;
        
        const deviation = Math.abs(existing.rate - currentRate) / existing.rate;
        if (deviation > 0.001) { // 0.1% tolerance
          inconsistencies.push({
            type: 'duplicate_pair',
            pair: normalizedPair,
            rates: [existing.rate, currentRate],
            deviation
          });
        }
      } else {
        pairRates.set(normalizedPair, {
          rate: base < quote ? rateData.rate : 1 / rateData.rate,
          originalPair: pair
        });
      }
    });

    return inconsistencies;
  }

  // Provider reliability assessment
  async assessProviderReliability(rates) {
    const assessment = {};
    
    Object.values(rates).forEach(rateData => {
      if (rateData.providers) {
        rateData.providers.forEach(provider => {
          if (!assessment[provider]) {
            assessment[provider] = {
              provider,
              rateCount: 0,
              qualitySum: 0,
              avgQuality: 0,
              reliability: this.providerReliability.get(provider)?.score || 0.5
            };
          }
          
          assessment[provider].rateCount++;
          assessment[provider].qualitySum += rateData.qualityScore || 0;
          assessment[provider].avgQuality = assessment[provider].qualitySum / assessment[provider].rateCount;
        });
      }
    });

    // Update provider reliability scores
    Object.values(assessment).forEach(providerData => {
      const currentReliability = this.providerReliability.get(providerData.provider) || { score: 0.5, history: [] };
      
      // Update reliability based on quality
      const qualityFactor = providerData.avgQuality / 100;
      const newScore = (currentReliability.score * this.config.reliability.reliabilityDecayFactor) + 
                      (qualityFactor * (1 - this.config.reliability.reliabilityDecayFactor));
      
      this.providerReliability.set(providerData.provider, {
        score: newScore,
        history: [...currentReliability.history.slice(-99), {
          timestamp: new Date(),
          quality: providerData.avgQuality,
          rateCount: providerData.rateCount
        }]
      });
      
      providerData.reliability = newScore;
    });

    return assessment;
  }

  // Calculate overall quality score
  calculateOverallQualityScore(validationResults) {
    const rateValidations = Object.values(validationResults.rates);
    
    if (rateValidations.length === 0) {
      return 0;
    }

    const avgRateQuality = rateValidations.reduce((sum, r) => sum + r.qualityScore, 0) / rateValidations.length;
    let overallScore = avgRateQuality;

    // Penalize for cross-rate inconsistencies
    if (validationResults.crossRateValidation?.inconsistencies.length > 0) {
      overallScore -= validationResults.crossRateValidation.inconsistencies.length * 10;
    }

    // Bonus for arbitrage opportunities (indicates good data quality)
    if (validationResults.arbitrageOpportunities.length > 0) {
      overallScore += Math.min(5, validationResults.arbitrageOpportunities.length);
    }

    return Math.max(0, Math.min(100, overallScore));
  }

  // Calculate individual rate quality score
  calculateRateQualityScore(validation, rateData) {
    let score = 100;

    // Deduct points for each error
    score -= validation.errors.length * 30;

    // Deduct points for warnings
    score -= validation.warnings.length * 10;

    // Adjust based on anomaly score
    if (validation.anomalyScore > this.config.anomaly.zScoreThreshold) {
      score -= Math.min(40, validation.anomalyScore * 10);
    }

    // Adjust based on provider reliability
    if (validation.avgProviderReliability) {
      score += (validation.avgProviderReliability - 0.5) * 20;
    }

    // Adjust based on data freshness
    if (rateData.timestamp) {
      const age = Date.now() - new Date(rateData.timestamp).getTime();
      if (age < 60000) { // Less than 1 minute
        score += 5;
      } else if (age > this.config.validation.staleDataThreshold) {
        score -= Math.min(20, age / 30000);
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  // Generate recommendations
  generateRecommendations(validationResults) {
    const recommendations = [];

    // Check overall quality
    if (validationResults.overall.qualityScore < 70) {
      recommendations.push({
        type: 'quality',
        priority: 'high',
        message: 'Overall rate quality is below acceptable threshold',
        action: 'Review data sources and validation parameters'
      });
    }

    // Check for too many anomalies
    const anomalyCount = Object.values(validationResults.rates)
      .filter(r => r.anomalyScore > this.config.anomaly.zScoreThreshold).length;
    
    if (anomalyCount > Object.keys(validationResults.rates).length * 0.2) {
      recommendations.push({
        type: 'anomaly',
        priority: 'medium',
        message: `High number of anomalies detected: ${anomalyCount}`,
        action: 'Investigate data sources and market conditions'
      });
    }

    // Check for arbitrage opportunities
    if (validationResults.arbitrageOpportunities.length > 0) {
      recommendations.push({
        type: 'arbitrage',
        priority: 'low',
        message: `${validationResults.arbitrageOpportunities.length} arbitrage opportunities detected`,
        action: 'Review for potential trading opportunities or data inconsistencies'
      });
    }

    // Check provider reliability
    const unreliableProviders = Object.values(validationResults.providerReliability || {})
      .filter(p => p.reliability < this.config.reliability.minReliabilityScore);
    
    if (unreliableProviders.length > 0) {
      recommendations.push({
        type: 'provider',
        priority: 'medium',
        message: `${unreliableProviders.length} providers have low reliability scores`,
        action: 'Consider reducing weight or removing unreliable providers'
      });
    }

    return recommendations;
  }

  // Utility methods
  addToHistory(pair, rateData) {
    if (!this.rateHistory.has(pair)) {
      this.rateHistory.set(pair, []);
    }

    const history = this.rateHistory.get(pair);
    history.push({
      rate: rateData.rate,
      timestamp: new Date(rateData.timestamp || Date.now())
    });

    // Keep only recent history
    if (history.length > this.config.anomaly.windowSize) {
      history.shift();
    }
  }

  updateQualityMetrics(validationResults) {
    const rateValidations = Object.values(validationResults.rates);
    
    if (rateValidations.length > 0) {
      this.qualityMetrics.averageQualityScore = rateValidations
        .reduce((sum, r) => sum + r.qualityScore, 0) / rateValidations.length;
    }

    this.qualityMetrics.averageProviderCount = rateValidations
      .reduce((sum, r) => sum + (r.providerCount || 0), 0) / rateValidations.length;
  }

  // Public API methods
  getValidationStats() {
    return {
      ...this.stats,
      qualityMetrics: { ...this.qualityMetrics },
      providerReliability: Object.fromEntries(this.providerReliability),
      historySize: this.rateHistory.size
    };
  }

  getProviderReliability(provider) {
    return this.providerReliability.get(provider) || null;
  }

  clearHistory(pair = null) {
    if (pair) {
      this.rateHistory.delete(pair);
    } else {
      this.rateHistory.clear();
    }
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    logger.info('Rate validation config updated');
  }
}

module.exports = RateValidationEngine;