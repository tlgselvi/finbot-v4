/**
 * Transaction History and P&L Tracking Service
 * Manages transaction history, P&L calculations, and reporting
 */

const EventEmitter = require('events');
const logger = require('../../utils/logger');

class TransactionHistoryService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      defaultPageSize: config.defaultPageSize || 50,
      maxPageSize: config.maxPageSize || 500,
      pnlCalculationInterval: config.pnlCalculationInterval || 300000, // 5 minutes
      historicalDataRetention: config.historicalDataRetention || 365, // days
      enableRealTimePnL: config.enableRealTimePnL !== false,
      baseCurrency: config.baseCurrency || 'USD',
      ...config
    };

    // Dependencies
    this.database = null;
    this.rateEngine = null;
    this.accountManager = null;

    // P&L calculation state
    this.pnlCalculationTimer = null;
    this.lastPnLUpdate = new Map(); // userId -> timestamp
    this.cachedPnL = new Map(); // userId -> P&L data

    // Statistics
    this.stats = {
      totalTransactions: 0,
      pnlCalculations: 0,
      lastCalculationTime: null,
      averageCalculationTime: 0
    };
  }

  // Initialize service
  initialize(dependencies) {
    this.database = dependencies.database;
    this.rateEngine = dependencies.rateEngine;
    this.accountManager = dependencies.accountManager;

    // Start P&L calculation timer if enabled
    if (this.config.enableRealTimePnL) {
      this.startPnLCalculationTimer();
    }

    logger.info('Transaction History Service initialized');
  }

  // Start real-time P&L calculation
  startPnLCalculationTimer() {
    if (this.pnlCalculationTimer) {
      clearInterval(this.pnlCalculationTimer);
    }

    this.pnlCalculationTimer = setInterval(async () => {
      try {
        await this.updateAllUsersPnL();
      } catch (error) {
        logger.error('P&L calculation timer error:', error);
      }
    }, this.config.pnlCalculationInterval);

    logger.info('P&L calculation timer started');
  }

  // Stop P&L calculation timer
  stopPnLCalculationTimer() {
    if (this.pnlCalculationTimer) {
      clearInterval(this.pnlCalculationTimer);
      this.pnlCalculationTimer = null;
    }
  }

  // Record transaction in history
  async recordTransaction(transaction) {
    try {
      // Save transaction to database
      const savedTransaction = await this.saveTransactionToHistory(transaction);

      // Update user's P&L if this is an FX transaction
      if (this.isFXTransaction(transaction)) {
        await this.updateUserPnL(transaction.userId);
      }

      // Update statistics
      this.stats.totalTransactions++;

      // Emit event
      this.emit('transactionRecorded', savedTransaction);

      return savedTransaction;

    } catch (error) {
      logger.error('Error recording transaction:', error);
      throw error;
    }
  }

  // Save transaction to database
  async saveTransactionToHistory(transaction) {
    const historyRecord = {
      id: transaction.id,
      userId: transaction.userId,
      type: transaction.type,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      fromCurrency: transaction.fromCurrency,
      toCurrency: transaction.toCurrency,
      fromAccountId: transaction.fromAccountId,
      toAccountId: transaction.toAccountId,
      exchangeRate: transaction.exchangeRate,
      convertedAmount: transaction.convertedAmount,
      conversionFee: transaction.conversionFee,
      totalFee: transaction.totalFee,
      description: transaction.description,
      metadata: JSON.stringify(transaction.metadata || {}),
      pnl: transaction.pnl ? JSON.stringify(transaction.pnl) : null,
      createdAt: transaction.createdAt,
      completedAt: transaction.completedAt,
      failedAt: transaction.failedAt,
      processingTime: transaction.processingTime,
      error: transaction.error
    };

    // This would insert into transactions table
    // For now, just return the record
    logger.debug(`Saved transaction ${transaction.id} to history`);
    return historyRecord;
  }

  // Get user transaction history
  async getUserTransactionHistory(userId, options = {}) {
    const {
      page = 1,
      limit = this.config.defaultPageSize,
      currency = null,
      type = null,
      status = null,
      startDate = null,
      endDate = null,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = options;

    // Validate and sanitize inputs
    const pageSize = Math.min(limit, this.config.maxPageSize);
    const offset = (page - 1) * pageSize;

    try {
      // Build query conditions
      const conditions = ['user_id = ?'];
      const params = [userId];

      if (currency) {
        conditions.push('(currency = ? OR from_currency = ? OR to_currency = ?)');
        params.push(currency, currency, currency);
      }

      if (type) {
        conditions.push('type = ?');
        params.push(type);
      }

      if (status) {
        conditions.push('status = ?');
        params.push(status);
      }

      if (startDate) {
        conditions.push('created_at >= ?');
        params.push(startDate);
      }

      if (endDate) {
        conditions.push('created_at <= ?');
        params.push(endDate);
      }

      // Build query
      const whereClause = conditions.join(' AND ');
      const orderClause = `ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
      
      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM transaction_history WHERE ${whereClause}`;
      // const totalResult = await this.database.query(countQuery, params);
      // const total = totalResult[0].total;

      // Get transactions
      const dataQuery = `
        SELECT * FROM transaction_history 
        WHERE ${whereClause} 
        ${orderClause} 
        LIMIT ? OFFSET ?
      `;
      // const transactions = await this.database.query(dataQuery, [...params, pageSize, offset]);

      // For now, return mock data
      const transactions = [];
      const total = 0;

      return {
        transactions: transactions.map(this.formatTransactionForResponse),
        pagination: {
          page,
          limit: pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
          hasNext: (page * pageSize) < total,
          hasPrev: page > 1
        }
      };

    } catch (error) {
      logger.error('Error getting user transaction history:', error);
      throw error;
    }
  }

  // Get transaction by ID
  async getTransaction(transactionId, userId = null) {
    try {
      let query = 'SELECT * FROM transaction_history WHERE id = ?';
      const params = [transactionId];

      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }

      // const result = await this.database.query(query, params);
      // if (result.length === 0) {
      //   return null;
      // }

      // return this.formatTransactionForResponse(result[0]);

      // For now, return null
      return null;

    } catch (error) {
      logger.error('Error getting transaction:', error);
      throw error;
    }
  }

  // Calculate user P&L
  async calculateUserPnL(userId, options = {}) {
    const {
      baseCurrency = this.config.baseCurrency,
      includeUnrealized = true,
      groupByCurrency = false,
      startDate = null,
      endDate = null
    } = options;

    const startTime = Date.now();

    try {
      // Get user's FX transactions
      const fxTransactions = await this.getUserFXTransactions(userId, { startDate, endDate });

      // Get current exchange rates
      const currentRates = await this.getCurrentRatesForUser(userId);

      // Calculate P&L
      const pnlCalculation = {
        userId,
        baseCurrency,
        calculatedAt: new Date(),
        totalRealizedPnL: 0,
        totalUnrealizedPnL: 0,
        totalPnL: 0,
        currencyBreakdown: {},
        transactionCount: fxTransactions.length
      };

      // Process each transaction
      for (const transaction of fxTransactions) {
        const transactionPnL = await this.calculateTransactionPnL(transaction, currentRates, baseCurrency);
        
        // Add to totals
        pnlCalculation.totalRealizedPnL += transactionPnL.realized;
        if (includeUnrealized) {
          pnlCalculation.totalUnrealizedPnL += transactionPnL.unrealized;
        }

        // Group by currency if requested
        if (groupByCurrency) {
          const currency = transaction.fromCurrency || transaction.currency;
          if (!pnlCalculation.currencyBreakdown[currency]) {
            pnlCalculation.currencyBreakdown[currency] = {
              realized: 0,
              unrealized: 0,
              transactionCount: 0
            };
          }
          
          pnlCalculation.currencyBreakdown[currency].realized += transactionPnL.realized;
          pnlCalculation.currencyBreakdown[currency].unrealized += transactionPnL.unrealized;
          pnlCalculation.currencyBreakdown[currency].transactionCount++;
        }
      }

      pnlCalculation.totalPnL = pnlCalculation.totalRealizedPnL + pnlCalculation.totalUnrealizedPnL;

      // Cache the result
      this.cachedPnL.set(userId, pnlCalculation);
      this.lastPnLUpdate.set(userId, Date.now());

      // Update statistics
      this.stats.pnlCalculations++;
      this.stats.lastCalculationTime = new Date();
      const calculationTime = Date.now() - startTime;
      this.stats.averageCalculationTime = 
        (this.stats.averageCalculationTime * (this.stats.pnlCalculations - 1) + calculationTime) / this.stats.pnlCalculations;

      logger.debug(`Calculated P&L for user ${userId} in ${calculationTime}ms`);

      return pnlCalculation;

    } catch (error) {
      logger.error('Error calculating user P&L:', error);
      throw error;
    }
  }

  // Calculate P&L for a specific transaction
  async calculateTransactionPnL(transaction, currentRates, baseCurrency) {
    const pnl = {
      transactionId: transaction.id,
      realized: 0,
      unrealized: 0,
      executionRate: transaction.exchangeRate,
      currentRate: null,
      rateDifference: 0
    };

    // Only calculate P&L for FX transactions
    if (!this.isFXTransaction(transaction) || !transaction.exchangeRate) {
      return pnl;
    }

    const fromCurrency = transaction.fromCurrency;
    const toCurrency = transaction.toCurrency;

    // Get current rate
    const rateKey = `${fromCurrency}/${toCurrency}`;
    const currentRate = currentRates[rateKey];

    if (!currentRate) {
      logger.warn(`No current rate available for ${rateKey}`);
      return pnl;
    }

    pnl.currentRate = currentRate.rate;
    pnl.rateDifference = currentRate.rate - transaction.exchangeRate;

    // Calculate unrealized P&L based on position
    // This is a simplified calculation - in reality, you'd need to track positions
    const positionSize = transaction.convertedAmount || (transaction.amount * transaction.exchangeRate);
    pnl.unrealized = positionSize * (pnl.rateDifference / transaction.exchangeRate);

    // Convert to base currency if needed
    if (toCurrency !== baseCurrency) {
      const toBaseRate = currentRates[`${toCurrency}/${baseCurrency}`];
      if (toBaseRate) {
        pnl.unrealized *= toBaseRate.rate;
      }
    }

    return pnl;
  }

  // Get user's FX transactions
  async getUserFXTransactions(userId, options = {}) {
    const { startDate, endDate } = options;

    try {
      let query = `
        SELECT * FROM transaction_history 
        WHERE user_id = ? 
        AND (type = 'conversion' OR type = 'trade' OR exchange_rate IS NOT NULL)
        AND status = 'completed'
      `;
      const params = [userId];

      if (startDate) {
        query += ' AND created_at >= ?';
        params.push(startDate);
      }

      if (endDate) {
        query += ' AND created_at <= ?';
        params.push(endDate);
      }

      query += ' ORDER BY created_at DESC';

      // const transactions = await this.database.query(query, params);
      // return transactions.map(this.formatTransactionForResponse);

      // For now, return empty array
      return [];

    } catch (error) {
      logger.error('Error getting user FX transactions:', error);
      throw error;
    }
  }

  // Get current exchange rates for user's currencies
  async getCurrentRatesForUser(userId) {
    try {
      // Get user's currencies from their accounts
      const userAccounts = await this.accountManager.getUserAccounts(userId);
      const currencies = [...new Set(userAccounts.map(account => account.currency))];

      const rates = {};

      // Get rates for all currency pairs
      for (let i = 0; i < currencies.length; i++) {
        for (let j = i + 1; j < currencies.length; j++) {
          const fromCurrency = currencies[i];
          const toCurrency = currencies[j];

          try {
            const rate = await this.rateEngine.getRate(fromCurrency, toCurrency);
            if (rate) {
              rates[`${fromCurrency}/${toCurrency}`] = rate;
              // Also store inverse rate
              rates[`${toCurrency}/${fromCurrency}`] = {
                ...rate,
                rate: 1 / rate.rate,
                isInverse: true
              };
            }
          } catch (error) {
            logger.warn(`Could not get rate for ${fromCurrency}/${toCurrency}:`, error);
          }
        }

        // Get rate to base currency
        if (currencies[i] !== this.config.baseCurrency) {
          try {
            const baseRate = await this.rateEngine.getRate(currencies[i], this.config.baseCurrency);
            if (baseRate) {
              rates[`${currencies[i]}/${this.config.baseCurrency}`] = baseRate;
            }
          } catch (error) {
            logger.warn(`Could not get base rate for ${currencies[i]}:`, error);
          }
        }
      }

      return rates;

    } catch (error) {
      logger.error('Error getting current rates for user:', error);
      return {};
    }
  }

  // Update P&L for specific user
  async updateUserPnL(userId) {
    try {
      const pnl = await this.calculateUserPnL(userId);
      this.emit('pnlUpdated', { userId, pnl });
      return pnl;
    } catch (error) {
      logger.error(`Error updating P&L for user ${userId}:`, error);
      throw error;
    }
  }

  // Update P&L for all users (called by timer)
  async updateAllUsersPnL() {
    try {
      // Get list of users with FX transactions
      const usersWithFXTransactions = await this.getUsersWithFXTransactions();

      logger.info(`Updating P&L for ${usersWithFXTransactions.length} users`);

      // Update P&L for each user
      const updatePromises = usersWithFXTransactions.map(userId => 
        this.updateUserPnL(userId).catch(error => {
          logger.error(`Failed to update P&L for user ${userId}:`, error);
        })
      );

      await Promise.allSettled(updatePromises);

    } catch (error) {
      logger.error('Error updating all users P&L:', error);
    }
  }

  // Get users with FX transactions
  async getUsersWithFXTransactions() {
    try {
      const query = `
        SELECT DISTINCT user_id 
        FROM transaction_history 
        WHERE (type = 'conversion' OR type = 'trade' OR exchange_rate IS NOT NULL)
        AND status = 'completed'
        AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
      `;

      // const result = await this.database.query(query);
      // return result.map(row => row.user_id);

      // For now, return empty array
      return [];

    } catch (error) {
      logger.error('Error getting users with FX transactions:', error);
      return [];
    }
  }

  // Get cached P&L for user
  getCachedUserPnL(userId) {
    return this.cachedPnL.get(userId) || null;
  }

  // Get transaction summary for user
  async getUserTransactionSummary(userId, options = {}) {
    const {
      period = '30d', // 7d, 30d, 90d, 1y
      currency = null
    } = options;

    try {
      // Calculate date range based on period
      const endDate = new Date();
      const startDate = new Date();
      
      switch (period) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(endDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(endDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        default:
          startDate.setDate(endDate.getDate() - 30);
      }

      // Get transaction statistics
      let query = `
        SELECT 
          type,
          status,
          currency,
          COUNT(*) as count,
          SUM(amount) as total_amount,
          SUM(COALESCE(total_fee, 0)) as total_fees,
          AVG(processing_time) as avg_processing_time
        FROM transaction_history 
        WHERE user_id = ? 
        AND created_at >= ? 
        AND created_at <= ?
      `;
      const params = [userId, startDate, endDate];

      if (currency) {
        query += ' AND (currency = ? OR from_currency = ? OR to_currency = ?)';
        params.push(currency, currency, currency);
      }

      query += ' GROUP BY type, status, currency';

      // const results = await this.database.query(query, params);

      // For now, return mock summary
      const summary = {
        period,
        startDate,
        endDate,
        totalTransactions: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        totalVolume: {},
        totalFees: {},
        averageProcessingTime: 0,
        transactionsByType: {},
        transactionsByCurrency: {},
        pnl: this.getCachedUserPnL(userId)
      };

      return summary;

    } catch (error) {
      logger.error('Error getting user transaction summary:', error);
      throw error;
    }
  }

  // Utility methods
  isFXTransaction(transaction) {
    return transaction.type === 'conversion' || 
           transaction.type === 'trade' || 
           (transaction.exchangeRate && transaction.exchangeRate !== 1);
  }

  formatTransactionForResponse(transaction) {
    return {
      ...transaction,
      metadata: transaction.metadata ? JSON.parse(transaction.metadata) : {},
      pnl: transaction.pnl ? JSON.parse(transaction.pnl) : null
    };
  }

  // Get service statistics
  getStatistics() {
    return {
      ...this.stats,
      cachedPnLCount: this.cachedPnL.size,
      pnlCalculationEnabled: this.config.enableRealTimePnL,
      lastPnLUpdateCount: this.lastPnLUpdate.size
    };
  }

  // Health check
  async healthCheck() {
    const health = {
      status: 'healthy',
      pnlCalculationActive: !!this.pnlCalculationTimer,
      cachedPnLCount: this.cachedPnL.size,
      dependencies: {},
      errors: []
    };

    try {
      if (this.database) {
        health.dependencies.database = 'connected';
      } else {
        health.dependencies.database = 'missing';
        health.errors.push('Database not initialized');
      }

      if (this.rateEngine) {
        health.dependencies.rateEngine = 'connected';
      } else {
        health.dependencies.rateEngine = 'missing';
        health.errors.push('Rate engine not initialized');
      }

      if (this.accountManager) {
        health.dependencies.accountManager = 'connected';
      } else {
        health.dependencies.accountManager = 'missing';
        health.errors.push('Account manager not initialized');
      }

    } catch (error) {
      health.errors.push(`Health check error: ${error.message}`);
    }

    if (health.errors.length > 0) {
      health.status = 'degraded';
    }

    return health;
  }

  // Cleanup method
  async cleanup() {
    this.stopPnLCalculationTimer();
    this.cachedPnL.clear();
    this.lastPnLUpdate.clear();
    logger.info('Transaction History Service cleaned up');
  }
}

module.exports = TransactionHistoryService;