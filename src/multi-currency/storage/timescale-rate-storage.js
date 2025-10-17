/**
 * TimescaleDB Historical Rate Storage
 * Handles time-series storage and querying of exchange rates
 */

const { Pool } = require('pg');
const logger = require('../../utils/logger');

class TimescaleRateStorage {
  constructor(config = {}) {
    this.config = {
      host: config.host || process.env.TIMESCALE_HOST || 'localhost',
      port: config.port || process.env.TIMESCALE_PORT || 5432,
      database: config.database || process.env.TIMESCALE_DB || 'finbot_rates',
      user: config.user || process.env.TIMESCALE_USER || 'finbot',
      password: config.password || process.env.TIMESCALE_PASSWORD || 'password',
      ssl: config.ssl || false,
      max: config.maxConnections || 20,
      idleTimeoutMillis: config.idleTimeout || 30000,
      connectionTimeoutMillis: config.connectionTimeout || 2000,
      retentionPolicies: {
        raw: config.rawRetentionDays || 90,      // 3 months of raw data
        hourly: config.hourlyRetentionDays || 730, // 2 years of hourly aggregates
        daily: config.dailyRetentionDays || 2555,  // 7 years of daily aggregates
        monthly: config.monthlyRetentionDays || 3650 // 10 years of monthly aggregates
      },
      compressionAfterDays: config.compressionAfterDays || 7,
      ...config
    };

    this.pool = null;
    this.isInitialized = false;
    this.stats = {
      totalRates: 0,
      ratesPerCurrency: {},
      oldestRate: null,
      newestRate: null,
      compressionRatio: 0
    };
  }

  async initialize() {
    try {
      // Create connection pool
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl,
        max: this.config.max,
        idleTimeoutMillis: this.config.idleTimeoutMillis,
        connectionTimeoutMillis: this.config.connectionTimeoutMillis
      });

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      // Initialize database schema
      await this.initializeSchema();

      // Set up retention policies
      await this.setupRetentionPolicies();

      // Set up compression policies
      await this.setupCompressionPolicies();

      // Set up continuous aggregates
      await this.setupContinuousAggregates();

      // Update statistics
      await this.updateStatistics();

      this.isInitialized = true;
      logger.info('TimescaleDB rate storage initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize TimescaleDB rate storage:', error);
      throw error;
    }
  }

  async initializeSchema() {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Enable TimescaleDB extension
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
      `);

      // Create exchange rates table
      await client.query(`
        CREATE TABLE IF NOT EXISTS exchange_rates (
          time TIMESTAMPTZ NOT NULL,
          base_currency CHAR(3) NOT NULL,
          target_currency CHAR(3) NOT NULL,
          rate DECIMAL(20,10) NOT NULL,
          bid_rate DECIMAL(20,10),
          ask_rate DECIMAL(20,10),
          spread DECIMAL(10,6),
          volume BIGINT DEFAULT 0,
          provider VARCHAR(50) NOT NULL,
          quality_score DECIMAL(5,2) DEFAULT 100.0,
          is_interpolated BOOLEAN DEFAULT FALSE,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // Create hypertable
      await client.query(`
        SELECT create_hypertable('exchange_rates', 'time', 
          chunk_time_interval => INTERVAL '1 day',
          if_not_exists => TRUE
        );
      `);

      // Create indexes for efficient querying
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency_pair_time 
        ON exchange_rates (base_currency, target_currency, time DESC);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_exchange_rates_provider_time 
        ON exchange_rates (provider, time DESC);
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_exchange_rates_quality_time 
        ON exchange_rates (quality_score, time DESC);
      `);

      // Create rate alerts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS rate_alerts (
          id SERIAL PRIMARY KEY,
          base_currency CHAR(3) NOT NULL,
          target_currency CHAR(3) NOT NULL,
          alert_type VARCHAR(20) NOT NULL, -- 'threshold', 'volatility', 'anomaly'
          threshold_value DECIMAL(20,10),
          condition VARCHAR(10), -- 'above', 'below', 'change'
          is_active BOOLEAN DEFAULT TRUE,
          user_id UUID,
          notification_channels TEXT[],
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // Create rate interpolation log
      await client.query(`
        CREATE TABLE IF NOT EXISTS rate_interpolation_log (
          time TIMESTAMPTZ NOT NULL,
          base_currency CHAR(3) NOT NULL,
          target_currency CHAR(3) NOT NULL,
          interpolated_rate DECIMAL(20,10) NOT NULL,
          interpolation_method VARCHAR(50) NOT NULL,
          confidence_score DECIMAL(5,2),
          source_rates JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      await client.query('COMMIT');
      logger.info('TimescaleDB schema initialized');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async setupRetentionPolicies() {
    const client = await this.pool.connect();
    
    try {
      // Raw data retention policy
      await client.query(`
        SELECT add_retention_policy('exchange_rates', 
          INTERVAL '${this.config.retentionPolicies.raw} days',
          if_not_exists => TRUE
        );
      `);

      logger.info(`Set up retention policy: ${this.config.retentionPolicies.raw} days for raw data`);

    } catch (error) {
      logger.warn('Failed to set up retention policy:', error.message);
    } finally {
      client.release();
    }
  }

  async setupCompressionPolicies() {
    const client = await this.pool.connect();
    
    try {
      // Enable compression for older data
      await client.query(`
        ALTER TABLE exchange_rates SET (
          timescaledb.compress,
          timescaledb.compress_segmentby = 'base_currency, target_currency, provider',
          timescaledb.compress_orderby = 'time DESC'
        );
      `);

      await client.query(`
        SELECT add_compression_policy('exchange_rates', 
          INTERVAL '${this.config.compressionAfterDays} days',
          if_not_exists => TRUE
        );
      `);

      logger.info(`Set up compression policy: compress data older than ${this.config.compressionAfterDays} days`);

    } catch (error) {
      logger.warn('Failed to set up compression policy:', error.message);
    } finally {
      client.release();
    }
  }

  async setupContinuousAggregates() {
    const client = await this.pool.connect();
    
    try {
      // Hourly aggregates
      await client.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS exchange_rates_hourly
        WITH (timescaledb.continuous) AS
        SELECT 
          time_bucket('1 hour', time) AS bucket,
          base_currency,
          target_currency,
          provider,
          AVG(rate) as avg_rate,
          MIN(rate) as min_rate,
          MAX(rate) as max_rate,
          FIRST(rate, time) as open_rate,
          LAST(rate, time) as close_rate,
          COUNT(*) as sample_count,
          STDDEV(rate) as volatility,
          AVG(quality_score) as avg_quality
        FROM exchange_rates
        GROUP BY bucket, base_currency, target_currency, provider;
      `);

      // Daily aggregates
      await client.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS exchange_rates_daily
        WITH (timescaledb.continuous) AS
        SELECT 
          time_bucket('1 day', time) AS bucket,
          base_currency,
          target_currency,
          AVG(rate) as avg_rate,
          MIN(rate) as min_rate,
          MAX(rate) as max_rate,
          FIRST(rate, time) as open_rate,
          LAST(rate, time) as close_rate,
          COUNT(*) as sample_count,
          STDDEV(rate) as volatility,
          AVG(quality_score) as avg_quality,
          COUNT(DISTINCT provider) as provider_count
        FROM exchange_rates
        GROUP BY bucket, base_currency, target_currency;
      `);

      // Set up refresh policies
      await client.query(`
        SELECT add_continuous_aggregate_policy('exchange_rates_hourly',
          start_offset => INTERVAL '3 hours',
          end_offset => INTERVAL '1 hour',
          schedule_interval => INTERVAL '1 hour',
          if_not_exists => TRUE
        );
      `);

      await client.query(`
        SELECT add_continuous_aggregate_policy('exchange_rates_daily',
          start_offset => INTERVAL '2 days',
          end_offset => INTERVAL '1 day',
          schedule_interval => INTERVAL '1 day',
          if_not_exists => TRUE
        );
      `);

      logger.info('Set up continuous aggregates for hourly and daily data');

    } catch (error) {
      logger.warn('Failed to set up continuous aggregates:', error.message);
    } finally {
      client.release();
    }
  }

  async storeRates(rates, metadata = {}) {
    if (!this.isInitialized) {
      throw new Error('TimescaleDB storage not initialized');
    }

    const client = await this.pool.connect();
    const startTime = Date.now();
    
    try {
      await client.query('BEGIN');

      const insertedRates = [];
      
      for (const [currencyPair, rateData] of Object.entries(rates)) {
        const [baseCurrency, targetCurrency] = currencyPair.split('/');
        
        // Insert rate data
        const insertQuery = `
          INSERT INTO exchange_rates (
            time, base_currency, target_currency, rate, bid_rate, ask_rate,
            spread, volume, provider, quality_score, is_interpolated, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (time, base_currency, target_currency, provider) 
          DO UPDATE SET 
            rate = EXCLUDED.rate,
            bid_rate = EXCLUDED.bid_rate,
            ask_rate = EXCLUDED.ask_rate,
            spread = EXCLUDED.spread,
            quality_score = EXCLUDED.quality_score,
            metadata = EXCLUDED.metadata
          RETURNING *;
        `;

        const values = [
          rateData.timestamp || new Date(),
          baseCurrency,
          targetCurrency,
          rateData.rate,
          rateData.bidRate || null,
          rateData.askRate || null,
          rateData.spread || null,
          rateData.volume || 0,
          rateData.provider || 'unknown',
          rateData.qualityScore || 100.0,
          rateData.isInterpolated || false,
          JSON.stringify(rateData.metadata || {})
        ];

        const result = await client.query(insertQuery, values);
        insertedRates.push(result.rows[0]);
      }

      await client.query('COMMIT');

      const processingTime = Date.now() - startTime;
      
      // Update statistics
      this.stats.totalRates += insertedRates.length;
      
      logger.debug(`Stored ${insertedRates.length} rates in ${processingTime}ms`);

      return {
        success: true,
        insertedCount: insertedRates.length,
        processingTime,
        rates: insertedRates
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to store rates:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getRates(baseCurrency, targetCurrency, options = {}) {
    if (!this.isInitialized) {
      throw new Error('TimescaleDB storage not initialized');
    }

    const {
      startTime = new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
      endTime = new Date(),
      provider = null,
      aggregation = 'raw', // 'raw', 'hourly', 'daily'
      limit = 1000,
      orderBy = 'time DESC'
    } = options;

    const client = await this.pool.connect();
    
    try {
      let tableName = 'exchange_rates';
      let selectFields = `
        time, base_currency, target_currency, rate, bid_rate, ask_rate,
        spread, volume, provider, quality_score, is_interpolated, metadata
      `;

      // Choose appropriate table based on aggregation
      if (aggregation === 'hourly') {
        tableName = 'exchange_rates_hourly';
        selectFields = `
          bucket as time, base_currency, target_currency, provider,
          avg_rate as rate, min_rate, max_rate, open_rate, close_rate,
          sample_count, volatility, avg_quality as quality_score
        `;
      } else if (aggregation === 'daily') {
        tableName = 'exchange_rates_daily';
        selectFields = `
          bucket as time, base_currency, target_currency,
          avg_rate as rate, min_rate, max_rate, open_rate, close_rate,
          sample_count, volatility, avg_quality as quality_score, provider_count
        `;
      }

      let query = `
        SELECT ${selectFields}
        FROM ${tableName}
        WHERE base_currency = $1 
          AND target_currency = $2
          AND time >= $3 
          AND time <= $4
      `;

      const params = [baseCurrency, targetCurrency, startTime, endTime];
      let paramIndex = 5;

      if (provider && aggregation === 'raw') {
        query += ` AND provider = $${paramIndex}`;
        params.push(provider);
        paramIndex++;
      }

      query += ` ORDER BY ${orderBy} LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await client.query(query, params);

      return {
        rates: result.rows,
        count: result.rows.length,
        baseCurrency,
        targetCurrency,
        startTime,
        endTime,
        aggregation
      };

    } catch (error) {
      logger.error('Failed to retrieve rates:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getLatestRate(baseCurrency, targetCurrency, provider = null) {
    if (!this.isInitialized) {
      throw new Error('TimescaleDB storage not initialized');
    }

    const client = await this.pool.connect();
    
    try {
      let query = `
        SELECT time, base_currency, target_currency, rate, bid_rate, ask_rate,
               spread, volume, provider, quality_score, is_interpolated, metadata
        FROM exchange_rates
        WHERE base_currency = $1 AND target_currency = $2
      `;

      const params = [baseCurrency, targetCurrency];

      if (provider) {
        query += ` AND provider = $3`;
        params.push(provider);
      }

      query += ` ORDER BY time DESC LIMIT 1`;

      const result = await client.query(query, params);

      return result.rows.length > 0 ? result.rows[0] : null;

    } catch (error) {
      logger.error('Failed to get latest rate:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async interpolateRate(baseCurrency, targetCurrency, timestamp, method = 'linear') {
    if (!this.isInitialized) {
      throw new Error('TimescaleDB storage not initialized');
    }

    const client = await this.pool.connect();
    
    try {
      // Get surrounding rates for interpolation
      const beforeQuery = `
        SELECT time, rate, quality_score
        FROM exchange_rates
        WHERE base_currency = $1 AND target_currency = $2 AND time <= $3
        ORDER BY time DESC LIMIT 1
      `;

      const afterQuery = `
        SELECT time, rate, quality_score
        FROM exchange_rates
        WHERE base_currency = $1 AND target_currency = $2 AND time >= $3
        ORDER BY time ASC LIMIT 1
      `;

      const params = [baseCurrency, targetCurrency, timestamp];

      const [beforeResult, afterResult] = await Promise.all([
        client.query(beforeQuery, params),
        client.query(afterQuery, params)
      ]);

      const beforeRate = beforeResult.rows[0];
      const afterRate = afterResult.rows[0];

      if (!beforeRate || !afterRate) {
        return null; // Cannot interpolate without surrounding data
      }

      let interpolatedRate;
      let confidenceScore = 100;

      switch (method) {
        case 'linear':
          interpolatedRate = this.linearInterpolation(
            beforeRate, afterRate, timestamp
          );
          break;
        case 'exponential':
          interpolatedRate = this.exponentialInterpolation(
            beforeRate, afterRate, timestamp
          );
          break;
        default:
          interpolatedRate = this.linearInterpolation(
            beforeRate, afterRate, timestamp
          );
      }

      // Calculate confidence based on time gap and quality
      const timeDiff = new Date(afterRate.time) - new Date(beforeRate.time);
      const maxGap = 60 * 60 * 1000; // 1 hour
      
      if (timeDiff > maxGap) {
        confidenceScore *= Math.max(0.1, 1 - (timeDiff - maxGap) / maxGap);
      }

      confidenceScore *= Math.min(beforeRate.quality_score, afterRate.quality_score) / 100;

      // Store interpolation log
      await client.query(`
        INSERT INTO rate_interpolation_log (
          time, base_currency, target_currency, interpolated_rate,
          interpolation_method, confidence_score, source_rates
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        timestamp,
        baseCurrency,
        targetCurrency,
        interpolatedRate,
        method,
        confidenceScore,
        JSON.stringify({ before: beforeRate, after: afterRate })
      ]);

      return {
        rate: interpolatedRate,
        timestamp,
        method,
        confidenceScore,
        isInterpolated: true,
        sourceRates: { before: beforeRate, after: afterRate }
      };

    } catch (error) {
      logger.error('Failed to interpolate rate:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  linearInterpolation(beforeRate, afterRate, timestamp) {
    const beforeTime = new Date(beforeRate.time).getTime();
    const afterTime = new Date(afterRate.time).getTime();
    const targetTime = new Date(timestamp).getTime();

    const timeFraction = (targetTime - beforeTime) / (afterTime - beforeTime);
    const rateDiff = afterRate.rate - beforeRate.rate;

    return parseFloat(beforeRate.rate) + (rateDiff * timeFraction);
  }

  exponentialInterpolation(beforeRate, afterRate, timestamp) {
    // Simple exponential interpolation (could be enhanced)
    const beforeTime = new Date(beforeRate.time).getTime();
    const afterTime = new Date(afterRate.time).getTime();
    const targetTime = new Date(timestamp).getTime();

    const timeFraction = (targetTime - beforeTime) / (afterTime - beforeTime);
    const rateRatio = afterRate.rate / beforeRate.rate;

    return parseFloat(beforeRate.rate) * Math.pow(rateRatio, timeFraction);
  }

  async getVolatility(baseCurrency, targetCurrency, period = '24 hours') {
    if (!this.isInitialized) {
      throw new Error('TimescaleDB storage not initialized');
    }

    const client = await this.pool.connect();
    
    try {
      const query = `
        SELECT 
          STDDEV(rate) as volatility,
          AVG(rate) as avg_rate,
          MIN(rate) as min_rate,
          MAX(rate) as max_rate,
          COUNT(*) as sample_count
        FROM exchange_rates
        WHERE base_currency = $1 
          AND target_currency = $2
          AND time >= NOW() - INTERVAL '${period}'
      `;

      const result = await client.query(query, [baseCurrency, targetCurrency]);
      const row = result.rows[0];

      if (!row || row.sample_count === '0') {
        return null;
      }

      return {
        volatility: parseFloat(row.volatility) || 0,
        avgRate: parseFloat(row.avg_rate),
        minRate: parseFloat(row.min_rate),
        maxRate: parseFloat(row.max_rate),
        sampleCount: parseInt(row.sample_count),
        period,
        volatilityPercent: row.avg_rate > 0 ? (parseFloat(row.volatility) / parseFloat(row.avg_rate)) * 100 : 0
      };

    } catch (error) {
      logger.error('Failed to calculate volatility:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async detectAnomalies(baseCurrency, targetCurrency, options = {}) {
    const {
      lookbackPeriod = '7 days',
      threshold = 2.5, // Standard deviations
      minSamples = 100
    } = options;

    if (!this.isInitialized) {
      throw new Error('TimescaleDB storage not initialized');
    }

    const client = await this.pool.connect();
    
    try {
      // Get statistical baseline
      const baselineQuery = `
        SELECT 
          AVG(rate) as mean_rate,
          STDDEV(rate) as std_rate,
          COUNT(*) as sample_count
        FROM exchange_rates
        WHERE base_currency = $1 
          AND target_currency = $2
          AND time >= NOW() - INTERVAL '${lookbackPeriod}'
          AND time <= NOW() - INTERVAL '1 hour'
      `;

      const baselineResult = await client.query(baselineQuery, [baseCurrency, targetCurrency]);
      const baseline = baselineResult.rows[0];

      if (!baseline || parseInt(baseline.sample_count) < minSamples) {
        return { anomalies: [], message: 'Insufficient data for anomaly detection' };
      }

      // Find recent anomalies
      const anomalyQuery = `
        SELECT time, rate, provider, quality_score,
               ABS(rate - $3) / $4 as z_score
        FROM exchange_rates
        WHERE base_currency = $1 
          AND target_currency = $2
          AND time >= NOW() - INTERVAL '1 hour'
          AND ABS(rate - $3) / $4 > $5
        ORDER BY time DESC
      `;

      const anomalyResult = await client.query(anomalyQuery, [
        baseCurrency,
        targetCurrency,
        baseline.mean_rate,
        baseline.std_rate,
        threshold
      ]);

      const anomalies = anomalyResult.rows.map(row => ({
        time: row.time,
        rate: parseFloat(row.rate),
        provider: row.provider,
        qualityScore: parseFloat(row.quality_score),
        zScore: parseFloat(row.z_score),
        severity: this.getAnomalySeverity(parseFloat(row.z_score))
      }));

      return {
        anomalies,
        baseline: {
          meanRate: parseFloat(baseline.mean_rate),
          stdRate: parseFloat(baseline.std_rate),
          sampleCount: parseInt(baseline.sample_count)
        },
        threshold,
        lookbackPeriod
      };

    } catch (error) {
      logger.error('Failed to detect anomalies:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  getAnomalySeverity(zScore) {
    if (zScore > 4) return 'critical';
    if (zScore > 3) return 'high';
    if (zScore > 2.5) return 'medium';
    return 'low';
  }

  async updateStatistics() {
    if (!this.isInitialized) {
      return;
    }

    const client = await this.pool.connect();
    
    try {
      // Get total rates count
      const totalResult = await client.query(`
        SELECT COUNT(*) as total FROM exchange_rates
      `);
      this.stats.totalRates = parseInt(totalResult.rows[0].total);

      // Get rates per currency
      const currencyResult = await client.query(`
        SELECT 
          CONCAT(base_currency, '/', target_currency) as pair,
          COUNT(*) as count
        FROM exchange_rates
        GROUP BY base_currency, target_currency
      `);

      this.stats.ratesPerCurrency = {};
      currencyResult.rows.forEach(row => {
        this.stats.ratesPerCurrency[row.pair] = parseInt(row.count);
      });

      // Get oldest and newest rates
      const rangeResult = await client.query(`
        SELECT MIN(time) as oldest, MAX(time) as newest FROM exchange_rates
      `);
      
      if (rangeResult.rows[0].oldest) {
        this.stats.oldestRate = rangeResult.rows[0].oldest;
        this.stats.newestRate = rangeResult.rows[0].newest;
      }

      // Get compression ratio
      const compressionResult = await client.query(`
        SELECT 
          pg_size_pretty(pg_total_relation_size('exchange_rates')) as total_size,
          pg_size_pretty(pg_relation_size('exchange_rates')) as table_size
      `);

      this.stats.compressionInfo = compressionResult.rows[0];

    } catch (error) {
      logger.warn('Failed to update statistics:', error);
    } finally {
      client.release();
    }
  }

  async cleanup() {
    if (!this.isInitialized) {
      return;
    }

    const client = await this.pool.connect();
    
    try {
      // Clean up old interpolation logs
      await client.query(`
        DELETE FROM rate_interpolation_log 
        WHERE created_at < NOW() - INTERVAL '30 days'
      `);

      // Clean up inactive alerts
      await client.query(`
        DELETE FROM rate_alerts 
        WHERE is_active = FALSE AND updated_at < NOW() - INTERVAL '90 days'
      `);

      logger.info('Cleanup completed');

    } catch (error) {
      logger.error('Cleanup failed:', error);
    } finally {
      client.release();
    }
  }

  getStatistics() {
    return {
      ...this.stats,
      isInitialized: this.isInitialized,
      config: {
        retentionPolicies: this.config.retentionPolicies,
        compressionAfterDays: this.config.compressionAfterDays
      }
    };
  }

  async healthCheck() {
    const health = {
      status: 'healthy',
      database: false,
      hypertable: false,
      compression: false,
      aggregates: false
    };

    if (!this.isInitialized) {
      health.status = 'not_initialized';
      return health;
    }

    const client = await this.pool.connect();
    
    try {
      // Test database connection
      await client.query('SELECT 1');
      health.database = true;

      // Check hypertable
      const hypertableResult = await client.query(`
        SELECT * FROM timescaledb_information.hypertables 
        WHERE hypertable_name = 'exchange_rates'
      `);
      health.hypertable = hypertableResult.rows.length > 0;

      // Check compression
      const compressionResult = await client.query(`
        SELECT * FROM timescaledb_information.compression_settings 
        WHERE hypertable_name = 'exchange_rates'
      `);
      health.compression = compressionResult.rows.length > 0;

      // Check continuous aggregates
      const aggregatesResult = await client.query(`
        SELECT * FROM timescaledb_information.continuous_aggregates 
        WHERE hypertable_name = 'exchange_rates'
      `);
      health.aggregates = aggregatesResult.rows.length > 0;

    } catch (error) {
      health.status = 'unhealthy';
      health.error = error.message;
    } finally {
      client.release();
    }

    return health;
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isInitialized = false;
      logger.info('TimescaleDB connection pool closed');
    }
  }
}

module.exports = TimescaleRateStorage;