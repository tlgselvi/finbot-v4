/**
 * FX-Aware Transaction Processing Engine
 * Handles multi-currency transactions with automatic conversions and P&L tracking
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');

class FXTransactionProcessor extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      defaultBaseCurrency: config.defaultBaseCurrency || 'USD',
      autoConversion: config.autoConversion !== false,
      feeCalculation: config.feeCalculation !== false,
      pnlTracking: config.pnlTracking !== false,
      riskChecks: config.riskChecks !== false,
      maxTransactionAmount: config.maxTransactionAmount || 1000000,
      minTransactionAmount: config.minTransactionAmount || 0.01,
      supportedTransactionTypes: config.supportedTransactionTypes || [
        'transfer', 'conversion', 'payment', 'deposit', 'withdrawal', 'trade'
      ],
      conversionSlippage: config.conversionSlippage || 0.001, // 0.1%
      ...config
    };

    // Dependencies (injected)
    this.currencyManager = null;
    this.accountManager = null;
    this.conversionService = null;
    this.rateEngine = null;
    this.database = null;

    // Transaction state
    this.pendingTransactions = new Map();
    this.processingQueue = [];
    this.isProcessing = false;

    // Statistics
    this.stats = {
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      totalVolume: new Map(), // by currency
      conversionCount: 0,
      averageProcessingTime: 0,
      feeCollected: new Map() // by currency
    };
  }

  // Initialize with dependencies
  initialize(dependencies) {
    this.currencyManager = dependencies.currencyManager;
    this.accountManager = dependencies.accountManager;
    this.conversionService = dependencies.conversionService;
    this.rateEngine = dependencies.rateEngine;
    this.database = dependencies.database;

    logger.info('FX Transaction Processor initialized');
  }

  // Main transaction processing method
  async processTransaction(transactionRequest) {
    const startTime = Date.now();
    const transactionId = uuidv4();
    
    try {
      // Validate transaction request
      const validation = await this.validateTransactionRequest(transactionRequest);
      if (!validation.isValid) {
        throw new Error(`Transaction validation failed: ${validation.errors.join(', ')}`);
      }

      // Create transaction record
      const transaction = await this.createTransactionRecord(transactionId, transactionRequest);
      
      // Add to pending transactions
      this.pendingTransactions.set(transactionId, transaction);

      // Process based on transaction type
      let result;
      switch (transaction.type) {
        case 'transfer':
          result = await this.processTransfer(transaction);
          break;
        case 'conversion':
          result = await this.processConversion(transaction);
          break;
        case 'payment':
          result = await this.processPayment(transaction);
          break;
        case 'deposit':
          result = await this.processDeposit(transaction);
          break;
        case 'withdrawal':
          result = await this.processWithdrawal(transaction);
          break;
        case 'trade':
          result = await this.processTrade(transaction);
          break;
        default:
          throw new Error(`Unsupported transaction type: ${transaction.type}`);
      }

      // Update transaction with result
      transaction.status = 'completed';
      transaction.completedAt = new Date();
      transaction.result = result;
      transaction.processingTime = Date.now() - startTime;

      // Calculate P&L if enabled
      if (this.config.pnlTracking) {
        transaction.pnl = await this.calculateTransactionPnL(transaction);
      }

      // Save final transaction state
      await this.saveTransaction(transaction);

      // Update statistics
      this.updateStatistics(transaction, true);

      // Remove from pending
      this.pendingTransactions.delete(transactionId);

      // Emit success event
      this.emit('transactionCompleted', transaction);

      logger.info(`Transaction ${transactionId} completed successfully in ${transaction.processingTime}ms`);
      
      return {
        transactionId,
        status: 'completed',
        result,
        processingTime: transaction.processingTime
      };

    } catch (error) {
      logger.error(`Transaction ${transactionId} failed:`, error);

      // Update transaction with error
      const transaction = this.pendingTransactions.get(transactionId);
      if (transaction) {
        transaction.status = 'failed';
        transaction.error = error.message;
        transaction.failedAt = new Date();
        transaction.processingTime = Date.now() - startTime;

        await this.saveTransaction(transaction);
        this.updateStatistics(transaction, false);
        this.pendingTransactions.delete(transactionId);
      }

      // Emit failure event
      this.emit('transactionFailed', { transactionId, error: error.message });

      throw error;
    }
  }

  // Validate transaction request
  async validateTransactionRequest(request) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Basic validation
    if (!request.type || !this.config.supportedTransactionTypes.includes(request.type)) {
      validation.errors.push('Invalid or unsupported transaction type');
    }

    if (!request.userId) {
      validation.errors.push('User ID is required');
    }

    if (!request.amount || request.amount <= 0) {
      validation.errors.push('Invalid transaction amount');
    }

    if (request.amount < this.config.minTransactionAmount) {
      validation.errors.push(`Amount below minimum: ${this.config.minTransactionAmount}`);
    }

    if (request.amount > this.config.maxTransactionAmount) {
      validation.errors.push(`Amount exceeds maximum: ${this.config.maxTransactionAmount}`);
    }

    if (!request.currency) {
      validation.errors.push('Currency is required');
    }

    // Currency validation
    if (request.currency && this.currencyManager) {
      const currencyInfo = await this.currencyManager.getCurrency(request.currency);
      if (!currencyInfo || !currencyInfo.isActive) {
        validation.errors.push(`Currency ${request.currency} is not supported or inactive`);
      }
    }

    // Type-specific validation
    switch (request.type) {
      case 'transfer':
        if (!request.fromAccountId || !request.toAccountId) {
          validation.errors.push('Transfer requires both from and to account IDs');
        }
        if (request.fromAccountId === request.toAccountId) {
          validation.errors.push('Cannot transfer to the same account');
        }
        break;

      case 'conversion':
        if (!request.fromCurrency || !request.toCurrency) {
          validation.errors.push('Conversion requires both from and to currencies');
        }
        if (request.fromCurrency === request.toCurrency) {
          validation.errors.push('Cannot convert to the same currency');
        }
        break;

      case 'payment':
        if (!request.payeeId && !request.payeeAccount) {
          validation.errors.push('Payment requires payee information');
        }
        break;
    }

    // Account validation
    if (request.fromAccountId && this.accountManager) {
      try {
        const account = await this.accountManager.getAccount(request.fromAccountId);
        if (!account) {
          validation.errors.push('Source account not found');
        } else if (!account.isActive) {
          validation.errors.push('Source account is inactive');
        } else if (account.userId !== request.userId) {
          validation.errors.push('Source account does not belong to user');
        }
      } catch (error) {
        validation.errors.push('Error validating source account');
      }
    }

    validation.isValid = validation.errors.length === 0;
    return validation;
  }

  // Create transaction record
  async createTransactionRecord(transactionId, request) {
    const transaction = {
      id: transactionId,
      type: request.type,
      userId: request.userId,
      amount: request.amount,
      currency: request.currency,
      fromAccountId: request.fromAccountId,
      toAccountId: request.toAccountId,
      fromCurrency: request.fromCurrency,
      toCurrency: request.toCurrency,
      payeeId: request.payeeId,
      payeeAccount: request.payeeAccount,
      description: request.description,
      metadata: request.metadata || {},
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      
      // FX-related fields
      exchangeRate: null,
      convertedAmount: null,
      conversionFee: null,
      totalFee: null,
      
      // P&L tracking
      pnl: null,
      unrealizedPnL: null,
      
      // Processing info
      processingTime: null,
      completedAt: null,
      failedAt: null,
      error: null,
      result: null
    };

    return transaction;
  }

  // Process transfer transaction
  async processTransfer(transaction) {
    const { fromAccountId, toAccountId, amount, currency } = transaction;

    // Get accounts
    const [fromAccount, toAccount] = await Promise.all([
      this.accountManager.getAccount(fromAccountId),
      this.accountManager.getAccount(toAccountId)
    ]);

    if (!fromAccount || !toAccount) {
      throw new Error('One or both accounts not found');
    }

    // Check if currency conversion is needed
    const needsConversion = fromAccount.currency !== currency || toAccount.currency !== currency;
    
    let transferAmount = amount;
    let exchangeRate = 1;
    let conversionFee = 0;

    if (needsConversion && this.config.autoConversion) {
      // Get exchange rate
      const rate = await this.rateEngine.getRate(fromAccount.currency, toAccount.currency);
      if (!rate) {
        throw new Error(`Exchange rate not available for ${fromAccount.currency}/${toAccount.currency}`);
      }

      exchangeRate = rate.rate;
      transferAmount = amount * exchangeRate;
      
      // Calculate conversion fee
      if (this.config.feeCalculation) {
        conversionFee = this.calculateConversionFee(amount, exchangeRate);
      }

      transaction.exchangeRate = exchangeRate;
      transaction.convertedAmount = transferAmount;
      transaction.conversionFee = conversionFee;
    }

    // Check sufficient balance
    const requiredAmount = amount + conversionFee;
    if (fromAccount.availableBalance < requiredAmount) {
      throw new Error('Insufficient balance');
    }

    // Execute transfer
    const transferResult = await this.executeTransfer({
      fromAccount,
      toAccount,
      originalAmount: amount,
      transferAmount,
      conversionFee,
      exchangeRate,
      transaction
    });

    return transferResult;
  }

  // Process currency conversion
  async processConversion(transaction) {
    const { userId, amount, fromCurrency, toCurrency } = transaction;

    // Get exchange rate
    const rate = await this.rateEngine.getRate(fromCurrency, toCurrency);
    if (!rate) {
      throw new Error(`Exchange rate not available for ${fromCurrency}/${toCurrency}`);
    }

    const exchangeRate = rate.rate;
    const convertedAmount = amount * exchangeRate;
    
    // Calculate fees
    const conversionFee = this.calculateConversionFee(amount, exchangeRate);
    const totalFee = conversionFee;

    // Get user's accounts
    const fromAccount = await this.accountManager.getUserAccount(userId, fromCurrency);
    const toAccount = await this.accountManager.getUserAccount(userId, toCurrency);

    if (!fromAccount) {
      throw new Error(`No ${fromCurrency} account found for user`);
    }

    // Check balance
    const requiredAmount = amount + totalFee;
    if (fromAccount.availableBalance < requiredAmount) {
      throw new Error('Insufficient balance for conversion');
    }

    // Create to account if it doesn't exist
    let targetAccount = toAccount;
    if (!targetAccount) {
      targetAccount = await this.accountManager.createAccount({
        userId,
        currency: toCurrency,
        accountType: 'currency',
        isActive: true
      });
    }

    // Execute conversion
    const conversionResult = await this.executeConversion({
      fromAccount,
      toAccount: targetAccount,
      originalAmount: amount,
      convertedAmount,
      exchangeRate,
      conversionFee,
      totalFee,
      transaction
    });

    // Update transaction
    transaction.exchangeRate = exchangeRate;
    transaction.convertedAmount = convertedAmount;
    transaction.conversionFee = conversionFee;
    transaction.totalFee = totalFee;

    return conversionResult;
  }

  // Process payment transaction
  async processPayment(transaction) {
    const { userId, amount, currency, payeeId, payeeAccount } = transaction;

    // Get payer account
    const payerAccount = await this.accountManager.getUserAccount(userId, currency);
    if (!payerAccount) {
      throw new Error(`No ${currency} account found for user`);
    }

    // Calculate fees
    const paymentFee = this.calculatePaymentFee(amount, currency);
    const totalAmount = amount + paymentFee;

    // Check balance
    if (payerAccount.availableBalance < totalAmount) {
      throw new Error('Insufficient balance for payment');
    }

    // Get or validate payee account
    let targetAccount;
    if (payeeAccount) {
      targetAccount = await this.accountManager.getAccount(payeeAccount);
      if (!targetAccount) {
        throw new Error('Payee account not found');
      }
    } else if (payeeId) {
      targetAccount = await this.accountManager.getUserAccount(payeeId, currency);
      if (!targetAccount) {
        // Create account for payee if it doesn't exist
        targetAccount = await this.accountManager.createAccount({
          userId: payeeId,
          currency,
          accountType: 'currency',
          isActive: true
        });
      }
    }

    // Execute payment
    const paymentResult = await this.executePayment({
      payerAccount,
      payeeAccount: targetAccount,
      amount,
      paymentFee,
      totalAmount,
      transaction
    });

    transaction.totalFee = paymentFee;
    return paymentResult;
  }

  // Process deposit transaction
  async processDeposit(transaction) {
    const { userId, amount, currency } = transaction;

    // Get or create user account
    let account = await this.accountManager.getUserAccount(userId, currency);
    if (!account) {
      account = await this.accountManager.createAccount({
        userId,
        currency,
        accountType: 'currency',
        isActive: true
      });
    }

    // Execute deposit
    const depositResult = await this.executeDeposit({
      account,
      amount,
      transaction
    });

    return depositResult;
  }

  // Process withdrawal transaction
  async processWithdrawal(transaction) {
    const { userId, amount, currency } = transaction;

    // Get user account
    const account = await this.accountManager.getUserAccount(userId, currency);
    if (!account) {
      throw new Error(`No ${currency} account found for user`);
    }

    // Calculate withdrawal fee
    const withdrawalFee = this.calculateWithdrawalFee(amount, currency);
    const totalAmount = amount + withdrawalFee;

    // Check balance
    if (account.availableBalance < totalAmount) {
      throw new Error('Insufficient balance for withdrawal');
    }

    // Execute withdrawal
    const withdrawalResult = await this.executeWithdrawal({
      account,
      amount,
      withdrawalFee,
      totalAmount,
      transaction
    });

    transaction.totalFee = withdrawalFee;
    return withdrawalResult;
  }

  // Process trade transaction
  async processTrade(transaction) {
    const { userId, amount, fromCurrency, toCurrency } = transaction;

    // This is similar to conversion but with different fee structure
    // and potentially different execution logic for trading
    
    const rate = await this.rateEngine.getRate(fromCurrency, toCurrency);
    if (!rate) {
      throw new Error(`Exchange rate not available for ${fromCurrency}/${toCurrency}`);
    }

    const exchangeRate = rate.rate;
    const convertedAmount = amount * exchangeRate;
    
    // Calculate trading fees (typically higher than conversion fees)
    const tradingFee = this.calculateTradingFee(amount, exchangeRate);
    const totalFee = tradingFee;

    // Get accounts
    const fromAccount = await this.accountManager.getUserAccount(userId, fromCurrency);
    const toAccount = await this.accountManager.getUserAccount(userId, toCurrency);

    if (!fromAccount) {
      throw new Error(`No ${fromCurrency} account found for user`);
    }

    // Check balance
    const requiredAmount = amount + totalFee;
    if (fromAccount.availableBalance < requiredAmount) {
      throw new Error('Insufficient balance for trade');
    }

    // Create to account if needed
    let targetAccount = toAccount;
    if (!targetAccount) {
      targetAccount = await this.accountManager.createAccount({
        userId,
        currency: toCurrency,
        accountType: 'trading',
        isActive: true
      });
    }

    // Execute trade
    const tradeResult = await this.executeTrade({
      fromAccount,
      toAccount: targetAccount,
      originalAmount: amount,
      convertedAmount,
      exchangeRate,
      tradingFee,
      totalFee,
      transaction
    });

    transaction.exchangeRate = exchangeRate;
    transaction.convertedAmount = convertedAmount;
    transaction.conversionFee = tradingFee;
    transaction.totalFee = totalFee;

    return tradeResult;
  }

  // Execute transfer between accounts
  async executeTransfer({ fromAccount, toAccount, originalAmount, transferAmount, conversionFee, exchangeRate, transaction }) {
    const operations = [];

    try {
      // Start database transaction
      await this.database.beginTransaction();

      // Debit from source account
      const debitOperation = await this.accountManager.debitAccount(fromAccount.id, originalAmount + conversionFee, {
        transactionId: transaction.id,
        description: `Transfer to ${toAccount.id}`,
        metadata: { exchangeRate, conversionFee }
      });
      operations.push(debitOperation);

      // Credit to destination account
      const creditOperation = await this.accountManager.creditAccount(toAccount.id, transferAmount, {
        transactionId: transaction.id,
        description: `Transfer from ${fromAccount.id}`,
        metadata: { exchangeRate, originalAmount }
      });
      operations.push(creditOperation);

      // Record fee if applicable
      if (conversionFee > 0) {
        await this.recordFee(conversionFee, fromAccount.currency, transaction.id, 'conversion');
      }

      // Commit transaction
      await this.database.commitTransaction();

      return {
        operations,
        fromAccount: fromAccount.id,
        toAccount: toAccount.id,
        originalAmount,
        transferAmount,
        exchangeRate,
        conversionFee
      };

    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  // Execute currency conversion
  async executeConversion({ fromAccount, toAccount, originalAmount, convertedAmount, exchangeRate, conversionFee, totalFee, transaction }) {
    const operations = [];

    try {
      await this.database.beginTransaction();

      // Debit from source currency account
      const debitOperation = await this.accountManager.debitAccount(fromAccount.id, originalAmount + totalFee, {
        transactionId: transaction.id,
        description: `Conversion to ${toAccount.currency}`,
        metadata: { exchangeRate, convertedAmount }
      });
      operations.push(debitOperation);

      // Credit to target currency account
      const creditOperation = await this.accountManager.creditAccount(toAccount.id, convertedAmount, {
        transactionId: transaction.id,
        description: `Conversion from ${fromAccount.currency}`,
        metadata: { exchangeRate, originalAmount }
      });
      operations.push(creditOperation);

      // Record conversion fee
      if (conversionFee > 0) {
        await this.recordFee(conversionFee, fromAccount.currency, transaction.id, 'conversion');
      }

      await this.database.commitTransaction();

      // Update conversion statistics
      this.stats.conversionCount++;

      return {
        operations,
        fromCurrency: fromAccount.currency,
        toCurrency: toAccount.currency,
        originalAmount,
        convertedAmount,
        exchangeRate,
        conversionFee
      };

    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  // Execute payment
  async executePayment({ payerAccount, payeeAccount, amount, paymentFee, totalAmount, transaction }) {
    const operations = [];

    try {
      await this.database.beginTransaction();

      // Debit from payer
      const debitOperation = await this.accountManager.debitAccount(payerAccount.id, totalAmount, {
        transactionId: transaction.id,
        description: `Payment to ${payeeAccount.userId}`,
        metadata: { paymentFee }
      });
      operations.push(debitOperation);

      // Credit to payee
      const creditOperation = await this.accountManager.creditAccount(payeeAccount.id, amount, {
        transactionId: transaction.id,
        description: `Payment from ${payerAccount.userId}`,
        metadata: { originalAmount: totalAmount }
      });
      operations.push(creditOperation);

      // Record payment fee
      if (paymentFee > 0) {
        await this.recordFee(paymentFee, payerAccount.currency, transaction.id, 'payment');
      }

      await this.database.commitTransaction();

      return {
        operations,
        payerAccount: payerAccount.id,
        payeeAccount: payeeAccount.id,
        amount,
        paymentFee
      };

    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  // Execute deposit
  async executeDeposit({ account, amount, transaction }) {
    try {
      await this.database.beginTransaction();

      const creditOperation = await this.accountManager.creditAccount(account.id, amount, {
        transactionId: transaction.id,
        description: 'Deposit',
        metadata: { source: 'external' }
      });

      await this.database.commitTransaction();

      return {
        operation: creditOperation,
        account: account.id,
        amount
      };

    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  // Execute withdrawal
  async executeWithdrawal({ account, amount, withdrawalFee, totalAmount, transaction }) {
    try {
      await this.database.beginTransaction();

      const debitOperation = await this.accountManager.debitAccount(account.id, totalAmount, {
        transactionId: transaction.id,
        description: 'Withdrawal',
        metadata: { withdrawalFee, netAmount: amount }
      });

      // Record withdrawal fee
      if (withdrawalFee > 0) {
        await this.recordFee(withdrawalFee, account.currency, transaction.id, 'withdrawal');
      }

      await this.database.commitTransaction();

      return {
        operation: debitOperation,
        account: account.id,
        amount,
        withdrawalFee
      };

    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  // Execute trade
  async executeTrade({ fromAccount, toAccount, originalAmount, convertedAmount, exchangeRate, tradingFee, totalFee, transaction }) {
    const operations = [];

    try {
      await this.database.beginTransaction();

      // Debit from source currency account
      const debitOperation = await this.accountManager.debitAccount(fromAccount.id, originalAmount + totalFee, {
        transactionId: transaction.id,
        description: `Trade to ${toAccount.currency}`,
        metadata: { exchangeRate, convertedAmount, tradingFee }
      });
      operations.push(debitOperation);

      // Credit to target currency account
      const creditOperation = await this.accountManager.creditAccount(toAccount.id, convertedAmount, {
        transactionId: transaction.id,
        description: `Trade from ${fromAccount.currency}`,
        metadata: { exchangeRate, originalAmount }
      });
      operations.push(creditOperation);

      // Record trading fee
      if (tradingFee > 0) {
        await this.recordFee(tradingFee, fromAccount.currency, transaction.id, 'trading');
      }

      await this.database.commitTransaction();

      return {
        operations,
        fromCurrency: fromAccount.currency,
        toCurrency: toAccount.currency,
        originalAmount,
        convertedAmount,
        exchangeRate,
        tradingFee
      };

    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  // Fee calculation methods
  calculateConversionFee(amount, exchangeRate) {
    // Simple percentage-based fee
    const feeRate = 0.002; // 0.2%
    return amount * feeRate;
  }

  calculatePaymentFee(amount, currency) {
    // Flat fee + percentage
    const flatFee = 0.50; // $0.50 equivalent
    const percentageFee = amount * 0.001; // 0.1%
    return flatFee + percentageFee;
  }

  calculateWithdrawalFee(amount, currency) {
    // Higher fee for withdrawals
    const flatFee = 2.00; // $2.00 equivalent
    const percentageFee = amount * 0.005; // 0.5%
    return flatFee + percentageFee;
  }

  calculateTradingFee(amount, exchangeRate) {
    // Higher fee for trading
    const feeRate = 0.005; // 0.5%
    return amount * feeRate;
  }

  // P&L calculation
  async calculateTransactionPnL(transaction) {
    if (!transaction.exchangeRate || transaction.exchangeRate === 1) {
      return { realized: 0, unrealized: 0 };
    }

    // Get current exchange rate for comparison
    const currentRate = await this.rateEngine.getRate(transaction.fromCurrency, transaction.toCurrency);
    if (!currentRate) {
      return { realized: 0, unrealized: 0 };
    }

    const executionRate = transaction.exchangeRate;
    const currentMarketRate = currentRate.rate;

    // Calculate P&L based on rate difference
    const rateDifference = currentMarketRate - executionRate;
    const pnlAmount = transaction.amount * rateDifference;

    return {
      realized: 0, // Realized when position is closed
      unrealized: pnlAmount,
      executionRate,
      currentRate: currentMarketRate,
      rateDifference
    };
  }

  // Record fee collection
  async recordFee(amount, currency, transactionId, feeType) {
    // This would typically record fees in a separate fees table
    // For now, just update statistics
    if (!this.stats.feeCollected.has(currency)) {
      this.stats.feeCollected.set(currency, 0);
    }
    this.stats.feeCollected.set(currency, this.stats.feeCollected.get(currency) + amount);

    logger.debug(`Recorded ${feeType} fee: ${amount} ${currency} for transaction ${transactionId}`);
  }

  // Save transaction to database
  async saveTransaction(transaction) {
    // This would save to the transactions table
    // For now, just log
    logger.debug(`Saving transaction ${transaction.id} with status ${transaction.status}`);
  }

  // Update statistics
  updateStatistics(transaction, success) {
    this.stats.totalTransactions++;
    
    if (success) {
      this.stats.successfulTransactions++;
      
      // Update volume statistics
      if (!this.stats.totalVolume.has(transaction.currency)) {
        this.stats.totalVolume.set(transaction.currency, 0);
      }
      this.stats.totalVolume.set(transaction.currency, 
        this.stats.totalVolume.get(transaction.currency) + transaction.amount);

      // Update average processing time
      const currentAvg = this.stats.averageProcessingTime;
      const newAvg = (currentAvg * (this.stats.successfulTransactions - 1) + transaction.processingTime) / this.stats.successfulTransactions;
      this.stats.averageProcessingTime = newAvg;
    } else {
      this.stats.failedTransactions++;
    }
  }

  // Get transaction by ID
  async getTransaction(transactionId) {
    // Check pending transactions first
    if (this.pendingTransactions.has(transactionId)) {
      return this.pendingTransactions.get(transactionId);
    }

    // Query database for completed transactions
    // This would be implemented based on your database layer
    return null;
  }

  // Get user transaction history
  async getUserTransactionHistory(userId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      currency = null,
      type = null,
      startDate = null,
      endDate = null
    } = options;

    // This would query the database for user transactions
    // For now, return empty array
    return {
      transactions: [],
      total: 0,
      hasMore: false
    };
  }

  // Get transaction statistics
  getTransactionStatistics() {
    return {
      ...this.stats,
      totalVolume: Object.fromEntries(this.stats.totalVolume),
      feeCollected: Object.fromEntries(this.stats.feeCollected),
      pendingTransactions: this.pendingTransactions.size,
      successRate: this.stats.totalTransactions > 0 ? 
        (this.stats.successfulTransactions / this.stats.totalTransactions) * 100 : 0
    };
  }

  // Health check
  async healthCheck() {
    const health = {
      status: 'healthy',
      pendingTransactions: this.pendingTransactions.size,
      isProcessing: this.isProcessing,
      dependencies: {},
      errors: []
    };

    // Check dependencies
    try {
      if (this.currencyManager) {
        health.dependencies.currencyManager = 'connected';
      } else {
        health.dependencies.currencyManager = 'missing';
        health.errors.push('Currency manager not initialized');
      }

      if (this.accountManager) {
        health.dependencies.accountManager = 'connected';
      } else {
        health.dependencies.accountManager = 'missing';
        health.errors.push('Account manager not initialized');
      }

      if (this.rateEngine) {
        health.dependencies.rateEngine = 'connected';
      } else {
        health.dependencies.rateEngine = 'missing';
        health.errors.push('Rate engine not initialized');
      }

      if (this.database) {
        health.dependencies.database = 'connected';
      } else {
        health.dependencies.database = 'missing';
        health.errors.push('Database not initialized');
      }

    } catch (error) {
      health.errors.push(`Health check error: ${error.message}`);
    }

    if (health.errors.length > 0) {
      health.status = 'degraded';
    }

    return health;
  }
}

module.exports = FXTransactionProcessor;