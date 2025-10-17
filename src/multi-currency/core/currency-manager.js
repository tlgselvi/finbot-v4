/**
 * Currency Manager Service
 * Core business logic for multi-currency operations
 */

const EventEmitter = require('events');
const FXTransactionProcessor = require('../transactions/fx-transaction-processor');
const TransactionHistoryService = require('../transactions/transaction-history-service');
const logger = require('../../utils/logger');

class CurrencyManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      baseCurrency: config.baseCurrency || 'USD',
      supportedCurrencies: config.supportedCurrencies || [
        'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SEK', 'NZD'
      ],
      defaultPrecision: config.defaultPrecision || 4,
      conversionFeeRate: config.conversionFeeRate || 0.0025, // 0.25%
      minConversionAmount: config.minConversionAmount || 0.01,
      maxConversionAmount: config.maxConversionAmount || 1000000,
      enableRegionalRestrictions: config.enableRegionalRestrictions || false,
      ...config
    };

    // ISO 4217 Currency definitions
    this.currencyDefinitions = {
      'USD': {
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        decimalPlaces: 2,
        numericCode: 840,
        minorUnit: 'cent',
        countries: ['US'],
        tradingHours: { start: '00:00', end: '23:59', timezone: 'UTC' },
        isActive: true,
        isCrypto: false,
        category: 'major'
      },
      'EUR': {
        code: 'EUR',
        name: 'Euro',
        symbol: '€',
        decimalPlaces: 2,
        numericCode: 978,
        minorUnit: 'cent',
        countries: ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI', 'GR', 'LU', 'SI', 'CY', 'MT', 'SK', 'EE', 'LV', 'LT'],
        tradingHours: { start: '00:00', end: '23:59', timezone: 'UTC' },
        isActive: true,
        isCrypto: false,
        category: 'major'
      },
      'GBP': {
        code: 'GBP',
        name: 'British Pound Sterling',
        symbol: '£',
        decimalPlaces: 2,
        numericCode: 826,
        minorUnit: 'penny',
        countries: ['GB'],
        tradingHours: { start: '00:00', end: '23:59', timezone: 'UTC' },
        isActive: true,
        isCrypto: false,
        category: 'major'
      },
      'JPY': {
        code: 'JPY',
        name: 'Japanese Yen',
        symbol: '¥',
        decimalPlaces: 0,
        numericCode: 392,
        minorUnit: 'sen',
        countries: ['JP'],
        tradingHours: { start: '00:00', end: '23:59', timezone: 'UTC' },
        isActive: true,
        isCrypto: false,
        category: 'major'
      },
      'CAD': {
        code: 'CAD',
        name: 'Canadian Dollar',
        symbol: 'C$',
        decimalPlaces: 2,
        numericCode: 124,
        minorUnit: 'cent',
        countries: ['CA'],
        tradingHours: { start: '00:00', end: '23:59', timezone: 'UTC' },
        isActive: true,
        isCrypto: false,
        category: 'major'
      },
      'AUD': {
        code: 'AUD',
        name: 'Australian Dollar',
        symbol: 'A$',
        decimalPlaces: 2,
        numericCode: 36,
        minorUnit: 'cent',
        countries: ['AU'],
        tradingHours: { start: '00:00', end: '23:59', timezone: 'UTC' },
        isActive: true,
        isCrypto: false,
        category: 'major'
      },
      'CHF': {
        code: 'CHF',
        name: 'Swiss Franc',
        symbol: 'CHF',
        decimalPlaces: 2,
        numericCode: 756,
        minorUnit: 'rappen',
        countries: ['CH', 'LI'],
        tradingHours: { start: '00:00', end: '23:59', timezone: 'UTC' },
        isActive: true,
        isCrypto: false,
        category: 'major'
      },
      'CNY': {
        code: 'CNY',
        name: 'Chinese Yuan',
        symbol: '¥',
        decimalPlaces: 2,
        numericCode: 156,
        minorUnit: 'jiao',
        countries: ['CN'],
        tradingHours: { start: '01:30', end: '08:30', timezone: 'UTC' },
        isActive: true,
        isCrypto: false,
        category: 'emerging'
      },
      'SEK': {
        code: 'SEK',
        name: 'Swedish Krona',
        symbol: 'kr',
        decimalPlaces: 2,
        numericCode: 752,
        minorUnit: 'öre',
        countries: ['SE'],
        tradingHours: { start: '00:00', end: '23:59', timezone: 'UTC' },
        isActive: true,
        isCrypto: false,
        category: 'minor'
      },
      'NZD': {
        code: 'NZD',
        name: 'New Zealand Dollar',
        symbol: 'NZ$',
        decimalPlaces: 2,
        numericCode: 554,
        minorUnit: 'cent',
        countries: ['NZ'],
        tradingHours: { start: '00:00', end: '23:59', timezone: 'UTC' },
        isActive: true,
        isCrypto: false,
        category: 'minor'
      }
    };

    // Currency pairs configuration
    this.currencyPairs = new Map();
    this.initializeCurrencyPairs();

    // Regional restrictions
    this.regionalRestrictions = {
      'US': { restrictedCurrencies: [], requiresCompliance: true },
      'EU': { restrictedCurrencies: [], requiresCompliance: true },
      'CN': { restrictedCurrencies: ['USD'], requiresCompliance: true },
      'RU': { restrictedCurrencies: ['USD', 'EUR'], requiresCompliance: true }
    };

    // Active currency configurations
    this.activeCurrencies = new Set(this.config.supportedCurrencies);
    
    // Transaction processing
    this.transactionProcessor = new FXTransactionProcessor({
      defaultBaseCurrency: this.config.baseCurrency,
      autoConversion: true,
      feeCalculation: true,
      pnlTracking: true,
      riskChecks: true
    });

    this.historyService = new TransactionHistoryService({
      baseCurrency: this.config.baseCurrency,
      enableRealTimePnL: true
    });

    // Statistics
    this.stats = {
      totalCurrencies: 0,
      activeCurrencies: 0,
      currencyPairs: 0,
      conversionsToday: 0,
      totalVolumeToday: 0,
      transactionsToday: 0,
      totalTransactionVolume: 0
    };

    this.updateStatistics();
  }

  initializeCurrencyPairs() {
    // Create all possible currency pairs
    const currencies = this.config.supportedCurrencies;
    
    for (let i = 0; i < currencies.length; i++) {
      for (let j = 0; j < currencies.length; j++) {
        if (i !== j) {
          const baseCurrency = currencies[i];
          const quoteCurrency = currencies[j];
          const pairCode = `${baseCurrency}/${quoteCurrency}`;
          
          this.currencyPairs.set(pairCode, {
            base: baseCurrency,
            quote: quoteCurrency,
            symbol: pairCode,
            isActive: true,
            minTradeAmount: this.getMinTradeAmount(baseCurrency, quoteCurrency),
            maxTradeAmount: this.getMaxTradeAmount(baseCurrency, quoteCurrency),
            tickSize: this.getTickSize(baseCurrency, quoteCurrency),
            tradingHours: this.getTradingHours(baseCurrency, quoteCurrency),
            settlementDays: this.getSettlementDays(baseCurrency, quoteCurrency)
          });
        }
      }
    }
  }

  // Currency Configuration Methods

  getCurrencyDefinition(currencyCode) {
    const definition = this.currencyDefinitions[currencyCode.toUpperCase()];
    if (!definition) {
      throw new Error(`Currency not supported: ${currencyCode}`);
    }
    return definition;
  }

  getAllCurrencies() {
    return Object.values(this.currencyDefinitions).filter(currency => 
      this.activeCurrencies.has(currency.code)
    );
  }

  getSupportedCurrencies() {
    return Array.from(this.activeCurrencies);
  }

  isCurrencySupported(currencyCode) {
    return this.activeCurrencies.has(currencyCode.toUpperCase());
  }

  addCurrency(currencyDefinition) {
    const { code } = currencyDefinition;
    
    if (this.currencyDefinitions[code]) {
      throw new Error(`Currency ${code} already exists`);
    }

    // Validate currency definition
    this.validateCurrencyDefinition(currencyDefinition);

    // Add to definitions
    this.currencyDefinitions[code] = {
      ...currencyDefinition,
      isActive: true
    };

    // Add to active currencies
    this.activeCurrencies.add(code);

    // Update currency pairs
    this.addCurrencyPairs(code);

    // Update statistics
    this.updateStatistics();

    this.emit('currencyAdded', { currency: code, definition: currencyDefinition });
    logger.info(`Currency added: ${code}`);

    return true;
  }

  removeCurrency(currencyCode) {
    const code = currencyCode.toUpperCase();
    
    if (!this.currencyDefinitions[code]) {
      throw new Error(`Currency not found: ${code}`);
    }

    if (code === this.config.baseCurrency) {
      throw new Error('Cannot remove base currency');
    }

    // Remove from active currencies
    this.activeCurrencies.delete(code);

    // Deactivate currency
    this.currencyDefinitions[code].isActive = false;

    // Remove currency pairs
    this.removeCurrencyPairs(code);

    // Update statistics
    this.updateStatistics();

    this.emit('currencyRemoved', { currency: code });
    logger.info(`Currency removed: ${code}`);

    return true;
  }

  activateCurrency(currencyCode) {
    const code = currencyCode.toUpperCase();
    const definition = this.currencyDefinitions[code];
    
    if (!definition) {
      throw new Error(`Currency not found: ${code}`);
    }

    if (definition.isActive) {
      return false; // Already active
    }

    definition.isActive = true;
    this.activeCurrencies.add(code);
    this.addCurrencyPairs(code);
    this.updateStatistics();

    this.emit('currencyActivated', { currency: code });
    logger.info(`Currency activated: ${code}`);

    return true;
  }

  deactivateCurrency(currencyCode) {
    const code = currencyCode.toUpperCase();
    
    if (code === this.config.baseCurrency) {
      throw new Error('Cannot deactivate base currency');
    }

    const definition = this.currencyDefinitions[code];
    if (!definition || !definition.isActive) {
      return false; // Not found or already inactive
    }

    definition.isActive = false;
    this.activeCurrencies.delete(code);
    this.removeCurrencyPairs(code);
    this.updateStatistics();

    this.emit('currencyDeactivated', { currency: code });
    logger.info(`Currency deactivated: ${code}`);

    return true;
  }

  // Currency Pair Management

  getCurrencyPair(baseCurrency, quoteCurrency) {
    const pairCode = `${baseCurrency.toUpperCase()}/${quoteCurrency.toUpperCase()}`;
    return this.currencyPairs.get(pairCode);
  }

  getAllCurrencyPairs() {
    return Array.from(this.currencyPairs.values()).filter(pair => pair.isActive);
  }

  addCurrencyPairs(currencyCode) {
    const currencies = Array.from(this.activeCurrencies);
    
    currencies.forEach(otherCurrency => {
      if (otherCurrency !== currencyCode) {
        // Add pair: currencyCode/otherCurrency
        const pair1 = `${currencyCode}/${otherCurrency}`;
        this.currencyPairs.set(pair1, {
          base: currencyCode,
          quote: otherCurrency,
          symbol: pair1,
          isActive: true,
          minTradeAmount: this.getMinTradeAmount(currencyCode, otherCurrency),
          maxTradeAmount: this.getMaxTradeAmount(currencyCode, otherCurrency),
          tickSize: this.getTickSize(currencyCode, otherCurrency),
          tradingHours: this.getTradingHours(currencyCode, otherCurrency),
          settlementDays: this.getSettlementDays(currencyCode, otherCurrency)
        });

        // Add pair: otherCurrency/currencyCode
        const pair2 = `${otherCurrency}/${currencyCode}`;
        this.currencyPairs.set(pair2, {
          base: otherCurrency,
          quote: currencyCode,
          symbol: pair2,
          isActive: true,
          minTradeAmount: this.getMinTradeAmount(otherCurrency, currencyCode),
          maxTradeAmount: this.getMaxTradeAmount(otherCurrency, currencyCode),
          tickSize: this.getTickSize(otherCurrency, currencyCode),
          tradingHours: this.getTradingHours(otherCurrency, currencyCode),
          settlementDays: this.getSettlementDays(otherCurrency, currencyCode)
        });
      }
    });
  }

  removeCurrencyPairs(currencyCode) {
    const pairsToRemove = [];
    
    for (const [pairCode, pair] of this.currencyPairs.entries()) {
      if (pair.base === currencyCode || pair.quote === currencyCode) {
        pairsToRemove.push(pairCode);
      }
    }

    pairsToRemove.forEach(pairCode => {
      this.currencyPairs.delete(pairCode);
    });
  }

  // Trading Configuration Methods

  getMinTradeAmount(baseCurrency, quoteCurrency) {
    // Different minimum amounts based on currency category
    const baseDefinition = this.getCurrencyDefinition(baseCurrency);
    const quoteDefinition = this.getCurrencyDefinition(quoteCurrency);

    if (baseDefinition.category === 'major' && quoteDefinition.category === 'major') {
      return 1.00;
    } else if (baseDefinition.category === 'emerging' || quoteDefinition.category === 'emerging') {
      return 10.00;
    } else {
      return 5.00;
    }
  }

  getMaxTradeAmount(baseCurrency, quoteCurrency) {
    // Different maximum amounts based on currency category
    const baseDefinition = this.getCurrencyDefinition(baseCurrency);
    const quoteDefinition = this.getCurrencyDefinition(quoteCurrency);

    if (baseDefinition.category === 'major' && quoteDefinition.category === 'major') {
      return 10000000; // 10M
    } else if (baseDefinition.category === 'emerging' || quoteDefinition.category === 'emerging') {
      return 1000000; // 1M
    } else {
      return 5000000; // 5M
    }
  }

  getTickSize(baseCurrency, quoteCurrency) {
    // Tick size based on currency pair characteristics
    const baseDefinition = this.getCurrencyDefinition(baseCurrency);
    const quoteDefinition = this.getCurrencyDefinition(quoteCurrency);

    if (baseCurrency === 'JPY' || quoteCurrency === 'JPY') {
      return 0.01; // JPY pairs typically have 2 decimal places
    } else if (baseDefinition.category === 'major' && quoteDefinition.category === 'major') {
      return 0.0001; // 4 decimal places for major pairs
    } else {
      return 0.00001; // 5 decimal places for minor pairs
    }
  }

  getTradingHours(baseCurrency, quoteCurrency) {
    // Combine trading hours of both currencies
    const baseHours = this.getCurrencyDefinition(baseCurrency).tradingHours;
    const quoteHours = this.getCurrencyDefinition(quoteCurrency).tradingHours;

    // For simplicity, use the intersection of trading hours
    // In practice, this would be more complex
    return {
      start: baseHours.start > quoteHours.start ? baseHours.start : quoteHours.start,
      end: baseHours.end < quoteHours.end ? baseHours.end : quoteHours.end,
      timezone: 'UTC'
    };
  }

  getSettlementDays(baseCurrency, quoteCurrency) {
    // Standard settlement is T+2 for most currency pairs
    // Some exceptions apply
    if (baseCurrency === 'USD' || quoteCurrency === 'USD') {
      if ((baseCurrency === 'CAD' && quoteCurrency === 'USD') || 
          (baseCurrency === 'USD' && quoteCurrency === 'CAD')) {
        return 1; // USD/CAD settles T+1
      }
    }
    
    return 2; // Standard T+2 settlement
  }

  // Regional Restrictions

  checkRegionalRestrictions(currencyCode, userRegion) {
    if (!this.config.enableRegionalRestrictions) {
      return { allowed: true };
    }

    const restrictions = this.regionalRestrictions[userRegion];
    if (!restrictions) {
      return { allowed: true };
    }

    const isRestricted = restrictions.restrictedCurrencies.includes(currencyCode);
    
    return {
      allowed: !isRestricted,
      requiresCompliance: restrictions.requiresCompliance,
      restrictions: isRestricted ? [`Currency ${currencyCode} is restricted in region ${userRegion}`] : []
    };
  }

  addRegionalRestriction(region, currencyCode, reason = '') {
    if (!this.regionalRestrictions[region]) {
      this.regionalRestrictions[region] = {
        restrictedCurrencies: [],
        requiresCompliance: true
      };
    }

    if (!this.regionalRestrictions[region].restrictedCurrencies.includes(currencyCode)) {
      this.regionalRestrictions[region].restrictedCurrencies.push(currencyCode);
      
      this.emit('regionalRestrictionAdded', {
        region,
        currency: currencyCode,
        reason
      });
      
      logger.info(`Regional restriction added: ${currencyCode} in ${region}`);
    }
  }

  removeRegionalRestriction(region, currencyCode) {
    const restrictions = this.regionalRestrictions[region];
    if (!restrictions) return false;

    const index = restrictions.restrictedCurrencies.indexOf(currencyCode);
    if (index > -1) {
      restrictions.restrictedCurrencies.splice(index, 1);
      
      this.emit('regionalRestrictionRemoved', {
        region,
        currency: currencyCode
      });
      
      logger.info(`Regional restriction removed: ${currencyCode} in ${region}`);
      return true;
    }

    return false;
  }

  // Validation Methods

  validateCurrencyDefinition(definition) {
    const required = ['code', 'name', 'symbol', 'decimalPlaces', 'numericCode'];
    
    for (const field of required) {
      if (!definition[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (definition.code.length !== 3) {
      throw new Error('Currency code must be 3 characters');
    }

    if (definition.decimalPlaces < 0 || definition.decimalPlaces > 8) {
      throw new Error('Decimal places must be between 0 and 8');
    }

    if (definition.numericCode < 1 || definition.numericCode > 999) {
      throw new Error('Numeric code must be between 1 and 999');
    }
  }

  validateCurrencyAmount(amount, currencyCode) {
    const definition = this.getCurrencyDefinition(currencyCode);
    
    if (typeof amount !== 'number' || isNaN(amount)) {
      throw new Error('Amount must be a valid number');
    }

    if (amount < 0) {
      throw new Error('Amount cannot be negative');
    }

    if (amount < this.config.minConversionAmount) {
      throw new Error(`Amount below minimum: ${this.config.minConversionAmount}`);
    }

    if (amount > this.config.maxConversionAmount) {
      throw new Error(`Amount above maximum: ${this.config.maxConversionAmount}`);
    }

    // Check decimal places
    const decimalPlaces = (amount.toString().split('.')[1] || '').length;
    if (decimalPlaces > definition.decimalPlaces) {
      throw new Error(`Too many decimal places for ${currencyCode}. Maximum: ${definition.decimalPlaces}`);
    }

    return true;
  }

  // Utility Methods

  formatAmount(amount, currencyCode) {
    const definition = this.getCurrencyDefinition(currencyCode);
    
    return {
      amount: parseFloat(amount.toFixed(definition.decimalPlaces)),
      formatted: `${definition.symbol}${amount.toFixed(definition.decimalPlaces)}`,
      currency: currencyCode,
      symbol: definition.symbol
    };
  }

  roundAmount(amount, currencyCode) {
    const definition = this.getCurrencyDefinition(currencyCode);
    const multiplier = Math.pow(10, definition.decimalPlaces);
    return Math.round(amount * multiplier) / multiplier;
  }

  isMarketOpen(baseCurrency, quoteCurrency) {
    const pair = this.getCurrencyPair(baseCurrency, quoteCurrency);
    if (!pair) return false;

    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
    
    return currentTime >= pair.tradingHours.start && currentTime <= pair.tradingHours.end;
  }

  // Statistics and Monitoring

  updateStatistics() {
    this.stats.totalCurrencies = Object.keys(this.currencyDefinitions).length;
    this.stats.activeCurrencies = this.activeCurrencies.size;
    this.stats.currencyPairs = Array.from(this.currencyPairs.values()).filter(p => p.isActive).length;
  }

  incrementConversionStats(amount) {
    this.stats.conversionsToday++;
    this.stats.totalVolumeToday += amount;
  }

  getStatistics() {
    return {
      ...this.stats,
      baseCurrency: this.config.baseCurrency,
      supportedCurrencies: Array.from(this.activeCurrencies),
      lastUpdated: new Date().toISOString()
    };
  }

  // Configuration Management

  updateConfiguration(newConfig) {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // Handle base currency change
    if (newConfig.baseCurrency && newConfig.baseCurrency !== oldConfig.baseCurrency) {
      this.emit('baseCurrencyChanged', {
        old: oldConfig.baseCurrency,
        new: newConfig.baseCurrency
      });
    }

    // Handle supported currencies change
    if (newConfig.supportedCurrencies) {
      const added = newConfig.supportedCurrencies.filter(c => !oldConfig.supportedCurrencies.includes(c));
      const removed = oldConfig.supportedCurrencies.filter(c => !newConfig.supportedCurrencies.includes(c));

      added.forEach(currency => {
        if (this.currencyDefinitions[currency]) {
          this.activateCurrency(currency);
        }
      });

      removed.forEach(currency => {
        this.deactivateCurrency(currency);
      });
    }

    this.emit('configurationUpdated', { oldConfig, newConfig });
    logger.info('Currency manager configuration updated');
  }

  getConfiguration() {
    return {
      ...this.config,
      activeCurrencies: Array.from(this.activeCurrencies),
      totalCurrencyPairs: this.currencyPairs.size
    };
  }

  // Transaction Processing Methods

  // Initialize transaction processing with dependencies
  initializeTransactionProcessing(dependencies) {
    this.transactionProcessor.initialize({
      currencyManager: this,
      accountManager: dependencies.accountManager,
      conversionService: dependencies.conversionService,
      rateEngine: dependencies.rateEngine,
      database: dependencies.database
    });

    this.historyService.initialize({
      database: dependencies.database,
      rateEngine: dependencies.rateEngine,
      accountManager: dependencies.accountManager
    });

    // Set up event listeners
    this.transactionProcessor.on('transactionCompleted', (transaction) => {
      this.historyService.recordTransaction(transaction);
      this.incrementTransactionStats(transaction.amount, transaction.currency);
      this.emit('transactionCompleted', transaction);
    });

    this.transactionProcessor.on('transactionFailed', (data) => {
      this.emit('transactionFailed', data);
    });

    this.historyService.on('pnlUpdated', (data) => {
      this.emit('pnlUpdated', data);
    });

    logger.info('Transaction processing initialized');
  }

  // Process a multi-currency transaction
  async processTransaction(transactionRequest) {
    try {
      // Validate currency support
      if (transactionRequest.currency && !this.isCurrencySupported(transactionRequest.currency)) {
        throw new Error(`Currency not supported: ${transactionRequest.currency}`);
      }

      if (transactionRequest.fromCurrency && !this.isCurrencySupported(transactionRequest.fromCurrency)) {
        throw new Error(`From currency not supported: ${transactionRequest.fromCurrency}`);
      }

      if (transactionRequest.toCurrency && !this.isCurrencySupported(transactionRequest.toCurrency)) {
        throw new Error(`To currency not supported: ${transactionRequest.toCurrency}`);
      }

      // Check regional restrictions if enabled
      if (this.config.enableRegionalRestrictions && transactionRequest.userRegion) {
        const currencies = [
          transactionRequest.currency,
          transactionRequest.fromCurrency,
          transactionRequest.toCurrency
        ].filter(Boolean);

        for (const currency of currencies) {
          const restriction = this.checkRegionalRestrictions(currency, transactionRequest.userRegion);
          if (!restriction.allowed) {
            throw new Error(`Transaction restricted: ${restriction.restrictions.join(', ')}`);
          }
        }
      }

      // Validate amounts
      if (transactionRequest.amount) {
        this.validateCurrencyAmount(transactionRequest.amount, transactionRequest.currency);
      }

      // Process through transaction processor
      const result = await this.transactionProcessor.processTransaction(transactionRequest);

      return result;

    } catch (error) {
      logger.error('Transaction processing failed:', error);
      throw error;
    }
  }

  // Currency conversion with transaction processing
  async convertCurrency(userId, fromCurrency, toCurrency, amount, options = {}) {
    const transactionRequest = {
      type: 'conversion',
      userId,
      fromCurrency,
      toCurrency,
      amount,
      description: options.description || `Convert ${amount} ${fromCurrency} to ${toCurrency}`,
      metadata: options.metadata || {},
      userRegion: options.userRegion
    };

    return await this.processTransaction(transactionRequest);
  }

  // Transfer between accounts with currency conversion
  async transferBetweenAccounts(userId, fromAccountId, toAccountId, amount, currency, options = {}) {
    const transactionRequest = {
      type: 'transfer',
      userId,
      fromAccountId,
      toAccountId,
      amount,
      currency,
      description: options.description || `Transfer ${amount} ${currency}`,
      metadata: options.metadata || {},
      userRegion: options.userRegion
    };

    return await this.processTransaction(transactionRequest);
  }

  // Make payment in any supported currency
  async makePayment(userId, payeeId, amount, currency, options = {}) {
    const transactionRequest = {
      type: 'payment',
      userId,
      payeeId,
      payeeAccount: options.payeeAccount,
      amount,
      currency,
      description: options.description || `Payment of ${amount} ${currency}`,
      metadata: options.metadata || {},
      userRegion: options.userRegion
    };

    return await this.processTransaction(transactionRequest);
  }

  // Deposit funds
  async depositFunds(userId, amount, currency, options = {}) {
    const transactionRequest = {
      type: 'deposit',
      userId,
      amount,
      currency,
      description: options.description || `Deposit ${amount} ${currency}`,
      metadata: options.metadata || {},
      userRegion: options.userRegion
    };

    return await this.processTransaction(transactionRequest);
  }

  // Withdraw funds
  async withdrawFunds(userId, amount, currency, options = {}) {
    const transactionRequest = {
      type: 'withdrawal',
      userId,
      amount,
      currency,
      description: options.description || `Withdraw ${amount} ${currency}`,
      metadata: options.metadata || {},
      userRegion: options.userRegion
    };

    return await this.processTransaction(transactionRequest);
  }

  // Execute FX trade
  async executeTrade(userId, fromCurrency, toCurrency, amount, options = {}) {
    const transactionRequest = {
      type: 'trade',
      userId,
      fromCurrency,
      toCurrency,
      amount,
      description: options.description || `Trade ${amount} ${fromCurrency} for ${toCurrency}`,
      metadata: options.metadata || {},
      userRegion: options.userRegion
    };

    return await this.processTransaction(transactionRequest);
  }

  // Transaction History Methods

  // Get user transaction history
  async getUserTransactionHistory(userId, options = {}) {
    return await this.historyService.getUserTransactionHistory(userId, options);
  }

  // Get specific transaction
  async getTransaction(transactionId, userId = null) {
    return await this.historyService.getTransaction(transactionId, userId);
  }

  // Get user P&L
  async getUserPnL(userId, options = {}) {
    return await this.historyService.calculateUserPnL(userId, options);
  }

  // Get cached P&L
  getCachedUserPnL(userId) {
    return this.historyService.getCachedUserPnL(userId);
  }

  // Get transaction summary
  async getUserTransactionSummary(userId, options = {}) {
    return await this.historyService.getUserTransactionSummary(userId, options);
  }

  // Statistics Methods

  incrementTransactionStats(amount, currency) {
    this.stats.transactionsToday++;
    this.stats.totalTransactionVolume += amount;
    this.incrementConversionStats(amount); // Keep existing conversion stats
  }

  getTransactionStatistics() {
    const processorStats = this.transactionProcessor.getTransactionStatistics();
    const historyStats = this.historyService.getStatistics();

    return {
      processor: processorStats,
      history: historyStats,
      manager: {
        transactionsToday: this.stats.transactionsToday,
        totalTransactionVolume: this.stats.totalTransactionVolume
      }
    };
  }

  // Health Check

  async healthCheck() {
    const health = {
      status: 'healthy',
      currencies: {
        total: this.stats.totalCurrencies,
        active: this.stats.activeCurrencies,
        base: this.config.baseCurrency
      },
      pairs: {
        total: this.stats.currencyPairs,
        active: Array.from(this.currencyPairs.values()).filter(p => p.isActive).length
      },
      restrictions: {
        enabled: this.config.enableRegionalRestrictions,
        regions: Object.keys(this.regionalRestrictions).length
      },
      transactions: {
        processor: await this.transactionProcessor.healthCheck(),
        history: await this.historyService.healthCheck()
      }
    };

    // Check if base currency is active
    if (!this.activeCurrencies.has(this.config.baseCurrency)) {
      health.status = 'unhealthy';
      health.error = 'Base currency is not active';
    }

    // Check minimum currency requirements
    if (this.activeCurrencies.size < 2) {
      health.status = 'degraded';
      health.warning = 'Less than 2 active currencies';
    }

    // Check transaction processor health
    if (health.transactions.processor.status !== 'healthy') {
      health.status = 'degraded';
      health.warning = 'Transaction processor is not healthy';
    }

    // Check history service health
    if (health.transactions.history.status !== 'healthy') {
      health.status = 'degraded';
      health.warning = 'Transaction history service is not healthy';
    }

    return health;
  }

  // Cleanup method
  async cleanup() {
    if (this.historyService) {
      await this.historyService.cleanup();
    }
    logger.info('Currency Manager cleaned up');
  }
}

module.exports = CurrencyManager;