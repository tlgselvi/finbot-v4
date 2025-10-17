/**
 * Feature Serving API for FinBot AI Analytics
 * Provides online and offline feature serving capabilities
 */

const express = require('express');
const { spawn } = require('child_process');
const redis = require('redis');
const { Pool } = require('pg');
const logger = require('../../utils/logger');

class FeatureServingAPI {
  constructor(config = {}) {
    this.config = {
      port: config.port || 3001,
      feastRepoPath: config.feastRepoPath || './feast_repo',
      redisUrl: config.redisUrl || 'redis://localhost:6379',
      postgresConfig: config.postgresConfig || {
        host: 'localhost',
        port: 5432,
        database: 'finbot',
        user: 'finbot',
        password: 'password'
      },
      ...config
    };

    this.app = express();
    this.redisClient = null;
    this.pgPool = null;
    this.feastProcess = null;
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  async initialize() {
    try {
      // Initialize Redis connection
      this.redisClient = redis.createClient({ url: this.config.redisUrl });
      await this.redisClient.connect();
      
      // Initialize PostgreSQL connection
      this.pgPool = new Pool(this.config.postgresConfig);
      await this.pgPool.query('SELECT 1');
      
      // Start Feast serving process
      await this.startFeastServing();
      
      logger.info('Feature serving API initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize feature serving API:', error);
      throw error;
    }
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    
    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug(`${req.method} ${req.path}`, { body: req.body, query: req.query });
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          redis: this.redisClient?.isReady || false,
          postgres: this.pgPool ? true : false,
          feast: this.feastProcess ? true : false
        }
      });
    });

    // Online feature serving
    this.app.post('/features/online', async (req, res) => {
      try {
        const features = await this.getOnlineFeatures(req.body);
        res.json({ success: true, features });
      } catch (error) {
        logger.error('Online feature serving failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Batch feature serving
    this.app.post('/features/batch', async (req, res) => {
      try {
        const features = await this.getBatchFeatures(req.body);
        res.json({ success: true, features });
      } catch (error) {
        logger.error('Batch feature serving failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Feature service serving (for ML models)
    this.app.post('/features/service/:serviceName', async (req, res) => {
      try {
        const features = await this.getFeatureService(req.params.serviceName, req.body);
        res.json({ success: true, features });
      } catch (error) {
        logger.error('Feature service serving failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Real-time feature computation
    this.app.post('/features/realtime', async (req, res) => {
      try {
        const features = await this.computeRealtimeFeatures(req.body);
        res.json({ success: true, features });
      } catch (error) {
        logger.error('Real-time feature computation failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Feature statistics
    this.app.get('/features/stats/:featureView', async (req, res) => {
      try {
        const stats = await this.getFeatureStats(req.params.featureView);
        res.json({ success: true, stats });
      } catch (error) {
        logger.error('Feature stats retrieval failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Feature freshness check
    this.app.get('/features/freshness/:entityId', async (req, res) => {
      try {
        const freshness = await this.checkFeatureFreshness(req.params.entityId);
        res.json({ success: true, freshness });
      } catch (error) {
        logger.error('Feature freshness check failed:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  async getOnlineFeatures(request) {
    const { featureService, entities, features } = request;
    
    // Use Feast Python client through subprocess
    const feastCommand = [
      'python', '-c', `
import sys
sys.path.append('${this.config.feastRepoPath}')
from feast import FeatureStore
import json

fs = FeatureStore(repo_path='${this.config.feastRepoPath}')

entities = ${JSON.stringify(entities)}
features = ${JSON.stringify(features)}

try:
    if '${featureService}':
        result = fs.get_online_features(
            feature_service='${featureService}',
            entity_rows=entities
        )
    else:
        result = fs.get_online_features(
            features=features,
            entity_rows=entities
        )
    
    # Convert to dictionary
    feature_dict = result.to_dict()
    print(json.dumps(feature_dict))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`
    ];

    return new Promise((resolve, reject) => {
      const process = spawn(feastCommand[0], feastCommand.slice(1));
      let output = '';
      let error = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        error += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Feast process failed: ${error}`));
          return;
        }

        try {
          const result = JSON.parse(output.trim());
          if (result.error) {
            reject(new Error(result.error));
          } else {
            resolve(result);
          }
        } catch (parseError) {
          reject(new Error(`Failed to parse Feast output: ${parseError.message}`));
        }
      });
    });
  }

  async getBatchFeatures(request) {
    const { featureService, entityDf, features } = request;
    
    // For batch features, we'll use direct database queries for better performance
    // This is a simplified implementation - in production, you'd use Feast's offline store
    
    const query = this.buildBatchQuery(features, entityDf);
    const result = await this.pgPool.query(query.sql, query.params);
    
    return this.formatBatchResult(result.rows, features);
  }

  async getFeatureService(serviceName, request) {
    const { entities } = request;
    
    // Map service names to feature configurations
    const serviceConfigs = {
      'spending_prediction_v1': [
        'user_spending_features',
        'user_ml_features', 
        'user_realtime_features'
      ],
      'anomaly_detection_v1': [
        'transaction_features',
        'user_spending_features',
        'merchant_features',
        'user_realtime_features'
      ],
      'risk_assessment_v1': [
        'transaction_features',
        'user_ml_features',
        'merchant_features'
      ],
      'budget_optimization_v1': [
        'user_spending_features',
        'user_ml_features'
      ]
    };

    const featureViews = serviceConfigs[serviceName];
    if (!featureViews) {
      throw new Error(`Unknown feature service: ${serviceName}`);
    }

    // Get features from each feature view
    const allFeatures = {};
    
    for (const featureView of featureViews) {
      const features = await this.getFeatureViewData(featureView, entities);
      Object.assign(allFeatures, features);
    }

    return allFeatures;
  }

  async getFeatureViewData(featureView, entities) {
    // Direct Redis/PostgreSQL queries for better performance
    const features = {};
    
    switch (featureView) {
      case 'user_spending_features':
        features.user_spending = await this.getUserSpendingFeatures(entities);
        break;
      case 'user_ml_features':
        features.user_ml = await this.getUserMLFeatures(entities);
        break;
      case 'user_realtime_features':
        features.user_realtime = await this.getUserRealtimeFeatures(entities);
        break;
      case 'transaction_features':
        features.transaction = await this.getTransactionFeatures(entities);
        break;
      case 'merchant_features':
        features.merchant = await this.getMerchantFeatures(entities);
        break;
    }
    
    return features;
  }

  async getUserSpendingFeatures(entities) {
    const userIds = entities.map(e => e.user_id || e.user).filter(Boolean);
    if (userIds.length === 0) return {};

    // Try Redis first (online store)
    const cachedFeatures = await this.getFromRedis(`user_spending:${userIds.join(',')}`);
    if (cachedFeatures) {
      return cachedFeatures;
    }

    // Fallback to PostgreSQL (offline store)
    const query = `
      SELECT 
        user_id,
        avg_transaction_amount,
        monthly_spending_total,
        transaction_frequency,
        most_frequent_category,
        most_frequent_merchant,
        spending_variance,
        EXTRACT(DAYS FROM NOW() - last_transaction_date) as days_since_last_transaction
      FROM user_spending_patterns 
      WHERE user_id = ANY($1)
    `;
    
    const result = await this.pgPool.query(query, [userIds]);
    const features = this.formatUserFeatures(result.rows);
    
    // Cache in Redis
    await this.setInRedis(`user_spending:${userIds.join(',')}`, features, 3600);
    
    return features;
  }

  async getUserMLFeatures(entities) {
    const userIds = entities.map(e => e.user_id || e.user).filter(Boolean);
    if (userIds.length === 0) return {};

    const query = `
      SELECT * FROM user_ml_features 
      WHERE user_id = ANY($1)
    `;
    
    const result = await this.pgPool.query(query, [userIds]);
    return this.formatUserFeatures(result.rows);
  }

  async getUserRealtimeFeatures(entities) {
    const userIds = entities.map(e => e.user_id || e.user).filter(Boolean);
    if (userIds.length === 0) return {};

    // Real-time features are computed on-demand
    const features = {};
    
    for (const userId of userIds) {
      features[userId] = await this.computeUserRealtimeFeatures(userId);
    }
    
    return features;
  }

  async computeUserRealtimeFeatures(userId) {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Transactions in last hour
    const hourlyQuery = `
      SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
      FROM transactions 
      WHERE user_id = $1 AND created_at >= $2
    `;
    const hourlyResult = await this.pgPool.query(hourlyQuery, [userId, oneHourAgo]);

    // Transactions today
    const dailyQuery = `
      SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
      FROM transactions 
      WHERE user_id = $1 AND created_at >= $2
    `;
    const dailyResult = await this.pgPool.query(dailyQuery, [userId, startOfDay]);

    // Compute unusual activity score
    const unusualScore = await this.computeUnusualActivityScore(userId, hourlyResult.rows[0], dailyResult.rows[0]);

    return {
      transactions_last_hour: parseInt(hourlyResult.rows[0].count),
      spending_last_hour: parseFloat(hourlyResult.rows[0].total),
      transactions_today: parseInt(dailyResult.rows[0].count),
      spending_today: parseFloat(dailyResult.rows[0].total),
      unusual_activity_score: unusualScore
    };
  }

  async computeUnusualActivityScore(userId, hourlyStats, dailyStats) {
    // Get user's historical averages
    const avgQuery = `
      SELECT 
        avg_transaction_amount,
        transaction_frequency
      FROM user_spending_patterns 
      WHERE user_id = $1
    `;
    const avgResult = await this.pgPool.query(avgQuery, [userId]);
    
    if (avgResult.rows.length === 0) return 0;
    
    const userAvg = avgResult.rows[0];
    const expectedHourlySpending = userAvg.avg_transaction_amount * userAvg.transaction_frequency / 24;
    const expectedDailySpending = userAvg.avg_transaction_amount * userAvg.transaction_frequency;
    
    // Calculate deviation scores
    const hourlyDeviation = Math.abs(dailyStats.total - expectedHourlySpending) / (expectedHourlySpending + 1);
    const dailyDeviation = Math.abs(dailyStats.total - expectedDailySpending) / (expectedDailySpending + 1);
    
    // Combine scores (0-100 scale)
    return Math.min(100, (hourlyDeviation + dailyDeviation) * 50);
  }

  async getTransactionFeatures(entities) {
    const transactionIds = entities.map(e => e.transaction_id || e.transaction).filter(Boolean);
    if (transactionIds.length === 0) return {};

    const query = `
      SELECT * FROM processed_transactions 
      WHERE transaction_id = ANY($1)
    `;
    
    const result = await this.pgPool.query(query, [transactionIds]);
    return this.formatTransactionFeatures(result.rows);
  }

  async getMerchantFeatures(entities) {
    const merchants = entities.map(e => e.merchant).filter(Boolean);
    if (merchants.length === 0) return {};

    const query = `
      SELECT * FROM merchant_statistics 
      WHERE merchant = ANY($1)
    `;
    
    const result = await this.pgPool.query(query, [merchants]);
    return this.formatMerchantFeatures(result.rows);
  }

  async computeRealtimeFeatures(request) {
    const { userId, transactionData } = request;
    
    // Compute features that need real-time calculation
    const realtimeFeatures = {
      // Transaction velocity
      recent_transaction_velocity: await this.computeTransactionVelocity(userId),
      
      // Spending patterns
      current_spending_rate: await this.computeCurrentSpendingRate(userId),
      
      // Anomaly indicators
      transaction_anomaly_score: await this.computeTransactionAnomalyScore(userId, transactionData),
      
      // Risk indicators
      real_time_risk_score: await this.computeRealTimeRiskScore(userId, transactionData)
    };

    return realtimeFeatures;
  }

  async computeTransactionVelocity(userId) {
    const query = `
      SELECT 
        COUNT(*) as count_1h,
        (SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '24 hours') as count_24h
      FROM transactions 
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 hour'
    `;
    
    const result = await this.pgPool.query(query, [userId]);
    const { count_1h, count_24h } = result.rows[0];
    
    return {
      transactions_per_hour: parseInt(count_1h),
      transactions_per_day: parseInt(count_24h),
      velocity_ratio: count_24h > 0 ? count_1h / (count_24h / 24) : 0
    };
  }

  async computeCurrentSpendingRate(userId) {
    const query = `
      SELECT 
        COALESCE(SUM(amount), 0) as spending_1h,
        (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '24 hours') as spending_24h
      FROM transactions 
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '1 hour'
    `;
    
    const result = await this.pgPool.query(query, [userId]);
    const { spending_1h, spending_24h } = result.rows[0];
    
    return {
      spending_per_hour: parseFloat(spending_1h),
      spending_per_day: parseFloat(spending_24h),
      spending_rate_ratio: spending_24h > 0 ? spending_1h / (spending_24h / 24) : 0
    };
  }

  async computeTransactionAnomalyScore(userId, transactionData) {
    // Simple anomaly detection based on amount and frequency
    const userAvgQuery = `
      SELECT avg_transaction_amount, transaction_frequency
      FROM user_spending_patterns 
      WHERE user_id = $1
    `;
    
    const avgResult = await this.pgPool.query(userAvgQuery, [userId]);
    if (avgResult.rows.length === 0) return 0;
    
    const { avg_transaction_amount, transaction_frequency } = avgResult.rows[0];
    
    // Amount anomaly
    const amountDeviation = Math.abs(transactionData.amount - avg_transaction_amount) / avg_transaction_amount;
    
    // Frequency anomaly (simplified)
    const expectedDailyTransactions = transaction_frequency;
    const recentVelocity = await this.computeTransactionVelocity(userId);
    const frequencyDeviation = Math.abs(recentVelocity.transactions_per_day - expectedDailyTransactions) / expectedDailyTransactions;
    
    // Combine scores
    return Math.min(100, (amountDeviation + frequencyDeviation) * 50);
  }

  async computeRealTimeRiskScore(userId, transactionData) {
    let riskScore = 0;
    
    // High amount risk
    if (transactionData.amount > 1000) riskScore += 20;
    if (transactionData.amount > 5000) riskScore += 30;
    
    // Time-based risk
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) riskScore += 15;
    
    // Location-based risk (if available)
    if (transactionData.isInternational) riskScore += 25;
    
    // Velocity-based risk
    const velocity = await this.computeTransactionVelocity(userId);
    if (velocity.velocity_ratio > 3) riskScore += 20;
    
    return Math.min(100, riskScore);
  }

  // Helper methods

  buildBatchQuery(features, entityDf) {
    // Simplified batch query builder
    const tables = new Set();
    const columns = [];
    
    features.forEach(feature => {
      const [table, column] = feature.split(':');
      tables.add(table);
      columns.push(`${table}.${column}`);
    });
    
    const sql = `
      SELECT ${columns.join(', ')}
      FROM ${Array.from(tables).join(' JOIN ... ON ...')}
      WHERE entity_id = ANY($1)
    `;
    
    return {
      sql,
      params: [entityDf.map(e => e.entity_id)]
    };
  }

  formatBatchResult(rows, features) {
    return rows.map(row => {
      const formatted = {};
      features.forEach(feature => {
        const [, column] = feature.split(':');
        formatted[feature] = row[column];
      });
      return formatted;
    });
  }

  formatUserFeatures(rows) {
    const features = {};
    rows.forEach(row => {
      features[row.user_id] = { ...row };
      delete features[row.user_id].user_id;
    });
    return features;
  }

  formatTransactionFeatures(rows) {
    const features = {};
    rows.forEach(row => {
      features[row.transaction_id] = { ...row };
      delete features[row.transaction_id].transaction_id;
    });
    return features;
  }

  formatMerchantFeatures(rows) {
    const features = {};
    rows.forEach(row => {
      features[row.merchant] = { ...row };
      delete features[row.merchant].merchant;
    });
    return features;
  }

  async getFromRedis(key) {
    try {
      const data = await this.redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.warn('Redis get failed:', error);
      return null;
    }
  }

  async setInRedis(key, data, ttl = 3600) {
    try {
      await this.redisClient.setEx(key, ttl, JSON.stringify(data));
    } catch (error) {
      logger.warn('Redis set failed:', error);
    }
  }

  async getFeatureStats(featureView) {
    // Return statistics about feature freshness, completeness, etc.
    const query = `
      SELECT 
        COUNT(*) as total_records,
        MAX(created_at) as last_updated,
        MIN(created_at) as first_record
      FROM ${featureView}
    `;
    
    const result = await this.pgPool.query(query);
    return result.rows[0];
  }

  async checkFeatureFreshness(entityId) {
    // Check when features were last updated for an entity
    const queries = [
      `SELECT MAX(created_at) as last_updated FROM user_spending_patterns WHERE user_id = $1`,
      `SELECT MAX(created_at) as last_updated FROM user_ml_features WHERE user_id = $1`,
    ];
    
    const results = await Promise.all(
      queries.map(query => this.pgPool.query(query, [entityId]))
    );
    
    return {
      user_spending_features: results[0].rows[0]?.last_updated,
      user_ml_features: results[1].rows[0]?.last_updated,
    };
  }

  async startFeastServing() {
    // Start Feast feature server (if needed)
    // This is optional as we're implementing direct serving
    logger.info('Feature serving API ready (direct implementation)');
  }

  async start() {
    await this.initialize();
    
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, () => {
        logger.info(`Feature serving API listening on port ${this.config.port}`);
        resolve();
      });
    });
  }

  async stop() {
    if (this.server) {
      this.server.close();
    }
    
    if (this.redisClient) {
      await this.redisClient.disconnect();
    }
    
    if (this.pgPool) {
      await this.pgPool.end();
    }
    
    if (this.feastProcess) {
      this.feastProcess.kill();
    }
    
    logger.info('Feature serving API stopped');
  }
}

module.exports = FeatureServingAPI;