/**
 * Batch Processor for Historical Financial Data
 * Handles batch processing using Apache Airflow-like workflow
 */

const cron = require('node-cron');
const { Pool } = require('pg');
const logger = require('../../utils/logger');
const { validateTransactionData } = require('./data-validation');
const { enrichTransactionData } = require('./data-enrichment');

class BatchProcessor {
  constructor(config = {}) {
    this.config = {
      batchSize: config.batchSize || 1000,
      maxConcurrency: config.maxConcurrency || 5,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 5000,
      ...config
    };

    // Database connections
    this.sourceDb = new Pool(config.sourceDatabase);
    this.targetDb = new Pool(config.targetDatabase);
    
    this.isRunning = false;
    this.currentJobs = new Map();
    this.jobHistory = [];
    
    // Schedule configurations
    this.schedules = {
      daily: '0 2 * * *',        // 2 AM daily
      hourly: '0 * * * *',       // Every hour
      weekly: '0 2 * * 0',       // 2 AM on Sundays
      ...config.schedules
    };
  }

  async initialize() {
    try {
      // Test database connections
      await this.sourceDb.query('SELECT 1');
      await this.targetDb.query('SELECT 1');
      
      logger.info('Batch processor initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize batch processor:', error);
      throw error;
    }
  }

  async startScheduler() {
    if (this.isRunning) {
      logger.warn('Batch processor scheduler is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting batch processor scheduler...');

    // Schedule daily historical data processing
    cron.schedule(this.schedules.daily, () => {
      this.runJob('daily-historical-processing', this.processDailyHistoricalData.bind(this));
    });

    // Schedule hourly incremental processing
    cron.schedule(this.schedules.hourly, () => {
      this.runJob('hourly-incremental-processing', this.processIncrementalData.bind(this));
    });

    // Schedule weekly feature recalculation
    cron.schedule(this.schedules.weekly, () => {
      this.runJob('weekly-feature-recalculation', this.recalculateWeeklyFeatures.bind(this));
    });

    logger.info('Batch processor scheduler started');
  }

  async runJob(jobId, jobFunction) {
    if (this.currentJobs.has(jobId)) {
      logger.warn(`Job ${jobId} is already running, skipping...`);
      return;
    }

    const job = {
      id: jobId,
      startTime: new Date(),
      status: 'running',
      progress: 0,
      totalRecords: 0,
      processedRecords: 0,
      errors: []
    };

    this.currentJobs.set(jobId, job);
    logger.info(`Starting job: ${jobId}`);

    try {
      await jobFunction(job);
      job.status = 'completed';
      job.endTime = new Date();
      logger.info(`Job ${jobId} completed successfully`);
    } catch (error) {
      job.status = 'failed';
      job.endTime = new Date();
      job.error = error.message;
      logger.error(`Job ${jobId} failed:`, error);
    } finally {
      this.currentJobs.delete(jobId);
      this.jobHistory.push({ ...job });
      
      // Keep only last 100 job records
      if (this.jobHistory.length > 100) {
        this.jobHistory = this.jobHistory.slice(-100);
      }
    }
  }

  async processDailyHistoricalData(job) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    logger.info(`Processing historical data for ${yesterday.toISOString().split('T')[0]}`);

    // Get total count for progress tracking
    const countResult = await this.sourceDb.query(`
      SELECT COUNT(*) as total 
      FROM transactions 
      WHERE created_at >= $1 AND created_at < $2
    `, [yesterday, today]);
    
    job.totalRecords = parseInt(countResult.rows[0].total);
    
    if (job.totalRecords === 0) {
      logger.info('No records to process for the specified date range');
      return;
    }

    let offset = 0;
    const batchSize = this.config.batchSize;

    while (offset < job.totalRecords) {
      const batch = await this.fetchBatch(yesterday, today, offset, batchSize);
      await this.processBatch(batch, job);
      
      offset += batchSize;
      job.processedRecords = Math.min(offset, job.totalRecords);
      job.progress = (job.processedRecords / job.totalRecords) * 100;
      
      logger.debug(`Processed ${job.processedRecords}/${job.totalRecords} records (${job.progress.toFixed(1)}%)`);
    }
  }

  async processIncrementalData(job) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const now = new Date();

    logger.info(`Processing incremental data from ${oneHourAgo.toISOString()}`);

    // Get total count
    const countResult = await this.sourceDb.query(`
      SELECT COUNT(*) as total 
      FROM transactions 
      WHERE created_at >= $1 AND created_at < $2
    `, [oneHourAgo, now]);
    
    job.totalRecords = parseInt(countResult.rows[0].total);
    
    if (job.totalRecords === 0) {
      logger.info('No new records to process');
      return;
    }

    const batch = await this.fetchBatch(oneHourAgo, now, 0, job.totalRecords);
    await this.processBatch(batch, job);
    
    job.processedRecords = job.totalRecords;
    job.progress = 100;
  }

  async fetchBatch(startTime, endTime, offset, limit) {
    const query = `
      SELECT 
        id,
        user_id,
        account_id,
        amount,
        currency,
        category,
        merchant,
        description,
        location,
        created_at,
        metadata
      FROM transactions 
      WHERE created_at >= $1 AND created_at < $2
      ORDER BY created_at
      LIMIT $3 OFFSET $4
    `;

    const result = await this.sourceDb.query(query, [startTime, endTime, limit, offset]);
    return result.rows;
  }

  async processBatch(batch, job) {
    const promises = batch.map(record => this.processRecord(record, job));
    
    // Process with controlled concurrency
    const chunks = this.chunkArray(promises, this.config.maxConcurrency);
    
    for (const chunk of chunks) {
      await Promise.all(chunk);
    }
  }

  async processRecord(record, job) {
    let attempt = 0;
    
    while (attempt < this.config.retryAttempts) {
      try {
        // Transform raw record to standard format
        const transactionData = this.transformRecord(record);
        
        // Validate data
        const validationResult = await validateTransactionData(transactionData);
        if (!validationResult.isValid) {
          throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
        }

        // Enrich data
        const enrichedData = await enrichTransactionData(validationResult.data);
        
        // Extract features
        const features = await this.extractBatchFeatures(enrichedData, record.created_at);
        
        // Store processed data
        await this.storeProcessedData(enrichedData, features);
        
        return; // Success, exit retry loop
        
      } catch (error) {
        attempt++;
        logger.warn(`Processing failed for record ${record.id}, attempt ${attempt}:`, error.message);
        
        if (attempt >= this.config.retryAttempts) {
          job.errors.push({
            recordId: record.id,
            error: error.message,
            attempts: attempt
          });
          logger.error(`Failed to process record ${record.id} after ${attempt} attempts`);
        } else {
          await this.delay(this.config.retryDelay);
        }
      }
    }
  }

  transformRecord(record) {
    return {
      transactionId: record.id,
      userId: record.user_id,
      accountId: record.account_id,
      amount: parseFloat(record.amount),
      currency: record.currency,
      category: record.category,
      merchant: record.merchant,
      description: record.description,
      location: record.location,
      timestamp: record.created_at.toISOString(),
      metadata: record.metadata || {}
    };
  }

  async extractBatchFeatures(transactionData, timestamp) {
    // Similar to stream processor but with historical context
    const features = {
      // Basic features
      amount: transactionData.amount,
      category: transactionData.category,
      merchant: transactionData.merchant,
      timestamp: transactionData.timestamp,
      
      // Temporal features
      hour: timestamp.getHours(),
      dayOfWeek: timestamp.getDay(),
      dayOfMonth: timestamp.getDate(),
      month: timestamp.getMonth() + 1,
      quarter: Math.floor(timestamp.getMonth() / 3) + 1,
      year: timestamp.getFullYear(),
      
      // Historical aggregations (calculated from database)
      userMonthlyAvg: await this.calculateUserMonthlyAverage(transactionData.userId, timestamp),
      userCategoryFreq: await this.calculateUserCategoryFrequency(transactionData.userId, transactionData.category, timestamp),
      merchantPopularity: await this.calculateMerchantPopularity(transactionData.merchant, timestamp),
      
      // Derived features
      isWeekend: [0, 6].includes(timestamp.getDay()),
      isBusinessHours: timestamp.getHours() >= 9 && timestamp.getHours() <= 17,
      amountCategory: this.categorizeAmount(transactionData.amount),
      
      // Seasonal features
      season: this.getSeason(timestamp.getMonth() + 1),
      isHoliday: await this.isHoliday(timestamp)
    };

    return features;
  }

  async calculateUserMonthlyAverage(userId, timestamp) {
    const startOfMonth = new Date(timestamp.getFullYear(), timestamp.getMonth(), 1);
    const endOfMonth = new Date(timestamp.getFullYear(), timestamp.getMonth() + 1, 0);
    
    const result = await this.sourceDb.query(`
      SELECT AVG(amount) as avg_amount
      FROM transactions
      WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
    `, [userId, startOfMonth, endOfMonth]);
    
    return parseFloat(result.rows[0].avg_amount) || 0;
  }

  async calculateUserCategoryFrequency(userId, category, timestamp) {
    const thirtyDaysAgo = new Date(timestamp.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const result = await this.sourceDb.query(`
      SELECT COUNT(*) as frequency
      FROM transactions
      WHERE user_id = $1 AND category = $2 AND created_at >= $3 AND created_at <= $4
    `, [userId, category, thirtyDaysAgo, timestamp]);
    
    return parseInt(result.rows[0].frequency) || 0;
  }

  async calculateMerchantPopularity(merchant, timestamp) {
    const sevenDaysAgo = new Date(timestamp.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const result = await this.sourceDb.query(`
      SELECT COUNT(DISTINCT user_id) as unique_users
      FROM transactions
      WHERE merchant = $1 AND created_at >= $2 AND created_at <= $3
    `, [merchant, sevenDaysAgo, timestamp]);
    
    return parseInt(result.rows[0].unique_users) || 0;
  }

  categorizeAmount(amount) {
    if (amount < 10) return 'micro';
    if (amount < 50) return 'small';
    if (amount < 200) return 'medium';
    if (amount < 1000) return 'large';
    return 'very_large';
  }

  getSeason(month) {
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'autumn';
    return 'winter';
  }

  async isHoliday(date) {
    // Simple holiday detection - can be enhanced with external API
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    // Major US holidays
    const holidays = [
      { month: 1, day: 1 },   // New Year
      { month: 7, day: 4 },   // Independence Day
      { month: 12, day: 25 }  // Christmas
    ];
    
    return holidays.some(h => h.month === month && h.day === day);
  }

  async storeProcessedData(enrichedData, features) {
    const query = `
      INSERT INTO processed_transactions (
        transaction_id, user_id, account_id, amount, currency, category,
        merchant, description, location, timestamp, features, processed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (transaction_id) DO UPDATE SET
        features = EXCLUDED.features,
        processed_at = EXCLUDED.processed_at
    `;

    await this.targetDb.query(query, [
      enrichedData.transactionId,
      enrichedData.userId,
      enrichedData.accountId,
      enrichedData.amount,
      enrichedData.currency,
      enrichedData.category,
      enrichedData.merchant,
      enrichedData.description,
      enrichedData.location,
      enrichedData.timestamp,
      JSON.stringify(features),
      new Date()
    ]);
  }

  async recalculateWeeklyFeatures(job) {
    logger.info('Starting weekly feature recalculation...');
    
    // Recalculate user spending patterns
    await this.recalculateUserSpendingPatterns(job);
    
    // Recalculate merchant statistics
    await this.recalculateMerchantStatistics(job);
    
    // Recalculate category trends
    await this.recalculateCategoryTrends(job);
    
    job.processedRecords = job.totalRecords;
    job.progress = 100;
  }

  async recalculateUserSpendingPatterns(job) {
    // Implementation for user spending pattern recalculation
    logger.info('Recalculating user spending patterns...');
    // This would involve complex aggregations and statistical calculations
  }

  async recalculateMerchantStatistics(job) {
    // Implementation for merchant statistics recalculation
    logger.info('Recalculating merchant statistics...');
  }

  async recalculateCategoryTrends(job) {
    // Implementation for category trends recalculation
    logger.info('Recalculating category trends...');
  }

  chunkArray(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stop() {
    this.isRunning = false;
    logger.info('Stopping batch processor...');
    
    // Wait for current jobs to complete
    while (this.currentJobs.size > 0) {
      logger.info(`Waiting for ${this.currentJobs.size} jobs to complete...`);
      await this.delay(1000);
    }
    
    await this.sourceDb.end();
    await this.targetDb.end();
    
    logger.info('Batch processor stopped');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      currentJobs: Array.from(this.currentJobs.values()),
      recentJobs: this.jobHistory.slice(-10),
      config: this.config
    };
  }
}

module.exports = BatchProcessor;