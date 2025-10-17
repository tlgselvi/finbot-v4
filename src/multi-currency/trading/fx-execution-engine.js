/**
 * FX Execution Engine
 * Smart order routing and execution with optimal price discovery
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');

class FXExecutionEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      executionAlgorithms: config.executionAlgorithms || [
        'TWAP', 'VWAP', 'Implementation_Shortfall', 'POV', 'Market_Making'
      ],
      liquidityProviders: config.liquidityProviders || [
        'internal', 'bank_a', 'bank_b', 'ecn_1', 'ecn_2'
      ],
      maxSlippage: config.maxSlippage || 0.005, // 0.5%
      maxPartialFills: config.maxPartialFills || 10,
      executionTimeout: config.executionTimeout || 30000, // 30 seconds
      priceImprovementThreshold: config.priceImprovementThreshold || 0.0001, // 1 pip
      enableSmartRouting: config.enableSmartRouting !== false,
      enableLatencyOptimization: config.enableLatencyOptimization !== false,
      ...config
    };

    // Dependencies
    this.orderManager = null;
    this.rateProvider = null;
    this.liquidityProviders = new Map();
    this.marketDataProvider = null;

    // Execution state
    this.activeExecutions = new Map(); // executionId -> execution context
    this.executionQueue = [];
    this.isProcessing = false;

    // Liquidity provider configurations
    this.providerConfigs = {
      internal: {
        name: 'Internal Pool',
        priority: 1,
        maxOrderSize: 1000000,
        avgLatency: 5, // ms
        reliability: 0.99,
        costBps: 0.5 // 0.5 basis points
      },
      bank_a: {
        name: 'Bank A',
        priority: 2,
        maxOrderSize: 5000000,
        avgLatency: 15,
        reliability: 0.98,
        costBps: 1.0
      },
      bank_b: {
        name: 'Bank B',
        priority: 3,
        maxOrderSize: 10000000,
        avgLatency: 20,
        reliability: 0.97,
        costBps: 1.2
      },
      ecn_1: {
        name: 'ECN 1',
        priority: 4,
        maxOrderSize: 2000000,
        avgLatency: 8,
        reliability: 0.96,
        costBps: 0.8
      },
      ecn_2: {
        name: 'ECN 2',
        priority: 5,
        maxOrderSize: 3000000,
        avgLatency: 12,
        reliability: 0.95,
        costBps: 1.1
      }
    };

    // Execution algorithms
    this.algorithms = {
      TWAP: new TWAPAlgorithm(this),
      VWAP: new VWAPAlgorithm(this),
      Implementation_Shortfall: new ImplementationShortfallAlgorithm(this),
      POV: new POVAlgorithm(this),
      Market_Making: new MarketMakingAlgorithm(this)
    };

    // Statistics
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalVolume: new Map(),
      averageExecutionTime: 0,
      averageSlippage: 0,
      priceImprovements: 0,
      providerStats: new Map()
    };

    this.initializeProviderStats();
  }

  // Initialize execution engine
  initialize(dependencies) {
    this.orderManager = dependencies.orderManager;
    this.rateProvider = dependencies.rateProvider;
    this.marketDataProvider = dependencies.marketDataProvider;

    // Initialize liquidity providers
    this.config.liquidityProviders.forEach(providerId => {
      if (dependencies.liquidityProviders && dependencies.liquidityProviders[providerId]) {
        this.liquidityProviders.set(providerId, dependencies.liquidityProviders[providerId]);
      }
    });

    // Start execution processing
    this.startExecutionProcessing();

    logger.info('FX Execution Engine initialized');
  }

  initializeProviderStats() {
    this.config.liquidityProviders.forEach(providerId => {
      this.stats.providerStats.set(providerId, {
        executions: 0,
        volume: 0,
        averageLatency: 0,
        successRate: 0,
        lastUsed: null
      });
    });
  }

  // Main execution method
  async executeOrder(order, executionOptions = {}) {
    const executionId = uuidv4();
    const startTime = Date.now();

    try {
      // Create execution context
      const executionContext = {
        id: executionId,
        order: { ...order },
        options: {
          algorithm: executionOptions.algorithm || this.selectOptimalAlgorithm(order),
          maxSlippage: executionOptions.maxSlippage || this.config.maxSlippage,
          timeLimit: executionOptions.timeLimit || this.config.executionTimeout,
          preferredProviders: executionOptions.preferredProviders || [],
          ...executionOptions
        },
        status: 'pending',
        startTime,
        executions: [],
        totalFilled: 0,
        remainingQuantity: order.remainingQuantity,
        averagePrice: 0,
        slippage: 0,
        metadata: {}
      };

      this.activeExecutions.set(executionId, executionContext);

      // Add to execution queue
      this.executionQueue.push(executionContext);

      this.emit('executionStarted', {
        executionId,
        orderId: order.id,
        algorithm: executionContext.options.algorithm
      });

      logger.info(`Execution started: ${executionId} for order ${order.id} using ${executionContext.options.algorithm}`);

      return {
        executionId,
        status: 'pending',
        estimatedCompletion: new Date(Date.now() + executionContext.options.timeLimit)
      };

    } catch (error) {
      logger.error('Error starting execution:', error);
      throw error;
    }
  }

  // Execution processing loop
  startExecutionProcessing() {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.processExecutions();
  }

  async processExecutions() {
    while (this.isProcessing && this.executionQueue.length > 0) {
      const executionContext = this.executionQueue.shift();
      
      try {
        await this.processExecution(executionContext);
      } catch (error) {
        logger.error(`Execution processing error for ${executionContext.id}:`, error);
        await this.handleExecutionError(executionContext, error);
      }
    }

    // Schedule next processing cycle
    setTimeout(() => {
      if (this.isProcessing) {
        this.processExecutions();
      }
    }, 100); // 100ms cycle
  }

  async processExecution(executionContext) {
    const { id, order, options } = executionContext;
    
    // Check timeout
    if (Date.now() - executionContext.startTime > options.timeLimit) {
      await this.handleExecutionTimeout(executionContext);
      return;
    }

    // Check if execution is complete
    if (executionContext.remainingQuantity <= 0) {
      await this.completeExecution(executionContext);
      return;
    }

    // Get execution algorithm
    const algorithm = this.algorithms[options.algorithm];
    if (!algorithm) {
      throw new Error(`Unknown execution algorithm: ${options.algorithm}`);
    }

    // Execute next slice
    const slice = await algorithm.getNextSlice(executionContext);
    if (slice) {
      await this.executeSlice(executionContext, slice);
    }
  }

  async executeSlice(executionContext, slice) {
    const { quantity, targetPrice, urgency, providers } = slice;
    
    try {
      // Select optimal liquidity provider
      const provider = await this.selectLiquidityProvider(
        executionContext.order.currencyPair,
        quantity,
        providers || executionContext.options.preferredProviders
      );

      // Get current market price
      const marketData = await this.getMarketData(executionContext.order.currencyPair);
      
      // Execute with selected provider
      const execution = await this.executeWithProvider(
        provider,
        executionContext.order,
        quantity,
        targetPrice || marketData.midPrice,
        urgency
      );

      // Update execution context
      executionContext.executions.push(execution);
      executionContext.totalFilled += execution.quantity;
      executionContext.remainingQuantity -= execution.quantity;

      // Calculate average price and slippage
      this.updateExecutionMetrics(executionContext, execution);

      // Notify order manager
      await this.orderManager.executeOrder(executionContext.order.id, {
        executionPrice: execution.price,
        executionQuantity: execution.quantity,
        executionTime: execution.timestamp,
        liquidityProvider: provider.id,
        executionId: execution.id
      });

      this.emit('sliceExecuted', {
        executionId: executionContext.id,
        orderId: executionContext.order.id,
        execution
      });

    } catch (error) {
      logger.error(`Slice execution error:`, error);
      throw error;
    }
  }

  async executeWithProvider(provider, order, quantity, targetPrice, urgency = 'normal') {
    const executionId = uuidv4();
    const startTime = Date.now();

    try {
      // Validate execution parameters
      this.validateExecution(provider, order, quantity, targetPrice);

      // Get quote from provider
      const quote = await this.getProviderQuote(provider, order.currencyPair, quantity, order.side);
      
      // Check price improvement
      const priceImprovement = this.calculatePriceImprovement(targetPrice, quote.price, order.side);
      
      // Execute if price is acceptable
      if (Math.abs(quote.price - targetPrice) / targetPrice <= this.config.maxSlippage) {
        const execution = await this.sendExecutionToProvider(provider, {
          executionId,
          orderId: order.id,
          currencyPair: order.currencyPair,
          side: order.side,
          quantity,
          price: quote.price,
          urgency
        });

        // Update provider statistics
        this.updateProviderStats(provider.id, execution, Date.now() - startTime);

        return {
          id: executionId,
          providerId: provider.id,
          quantity: execution.filledQuantity,
          price: execution.executionPrice,
          timestamp: new Date(),
          latency: Date.now() - startTime,
          priceImprovement,
          commission: execution.commission || 0
        };

      } else {
        throw new Error(`Price slippage too high: ${Math.abs(quote.price - targetPrice) / targetPrice * 100}%`);
      }

    } catch (error) {
      logger.error(`Provider execution error with ${provider.id}:`, error);
      throw error;
    }
  }

  // Liquidity provider selection
  async selectLiquidityProvider(currencyPair, quantity, preferredProviders = []) {
    if (!this.config.enableSmartRouting) {
      // Use first available provider
      const providerId = preferredProviders[0] || this.config.liquidityProviders[0];
      return this.getProviderById(providerId);
    }

    // Get quotes from all suitable providers
    const quotes = await this.getProviderQuotes(currencyPair, quantity, preferredProviders);
    
    if (quotes.length === 0) {
      throw new Error('No liquidity providers available');
    }

    // Score providers based on multiple factors
    const scoredProviders = quotes.map(quote => {
      const provider = this.getProviderById(quote.providerId);
      const config = this.providerConfigs[quote.providerId];
      const stats = this.stats.providerStats.get(quote.providerId);

      const score = this.calculateProviderScore(quote, config, stats, quantity);
      
      return {
        provider,
        quote,
        score
      };
    });

    // Select best provider
    scoredProviders.sort((a, b) => b.score - a.score);
    
    return scoredProviders[0].provider;
  }

  calculateProviderScore(quote, config, stats, quantity) {
    let score = 0;

    // Price competitiveness (40%)
    const priceScore = 1 / (1 + Math.abs(quote.spread));
    score += priceScore * 0.4;

    // Reliability (25%)
    const reliabilityScore = config.reliability * (stats.successRate / 100);
    score += reliabilityScore * 0.25;

    // Latency (20%)
    const latencyScore = 1 / (1 + config.avgLatency / 1000);
    score += latencyScore * 0.2;

    // Capacity (10%)
    const capacityScore = Math.min(quantity / config.maxOrderSize, 1);
    score += capacityScore * 0.1;

    // Cost (5%)
    const costScore = 1 / (1 + config.costBps / 100);
    score += costScore * 0.05;

    return score;
  }

  async getProviderQuotes(currencyPair, quantity, preferredProviders = []) {
    const providers = preferredProviders.length > 0 ? 
      preferredProviders : this.config.liquidityProviders;

    const quotePromises = providers.map(async (providerId) => {
      try {
        const provider = this.getProviderById(providerId);
        const quote = await this.getProviderQuote(provider, currencyPair, quantity, 'buy');
        return { providerId, ...quote };
      } catch (error) {
        logger.warn(`Failed to get quote from ${providerId}:`, error);
        return null;
      }
    });

    const quotes = await Promise.allSettled(quotePromises);
    return quotes
      .filter(result => result.status === 'fulfilled' && result.value)
      .map(result => result.value);
  }

  async getProviderQuote(provider, currencyPair, quantity, side) {
    // Mock implementation - in reality this would call actual provider APIs
    const [baseCurrency, quoteCurrency] = currencyPair.split('/');
    const rate = await this.rateProvider.getRate(baseCurrency, quoteCurrency);
    
    if (!rate) {
      throw new Error(`No rate available for ${currencyPair}`);
    }

    const config = this.providerConfigs[provider.id];
    const spread = rate.spread || 0.0001;
    const costAdjustment = config.costBps / 10000;

    return {
      price: side === 'buy' ? rate.ask + costAdjustment : rate.bid - costAdjustment,
      quantity,
      spread,
      timestamp: new Date(),
      validUntil: new Date(Date.now() + 5000) // 5 second validity
    };
  }

  async sendExecutionToProvider(provider, executionRequest) {
    // Mock implementation - in reality this would send to actual provider
    const latency = this.providerConfigs[provider.id].avgLatency;
    
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, latency));

    // Simulate execution
    const success = Math.random() > 0.05; // 95% success rate
    
    if (!success) {
      throw new Error('Provider execution failed');
    }

    return {
      executionId: executionRequest.executionId,
      filledQuantity: executionRequest.quantity,
      executionPrice: executionRequest.price,
      commission: executionRequest.quantity * executionRequest.price * 0.001, // 0.1%
      timestamp: new Date()
    };
  }

  // Market data methods
  async getMarketData(currencyPair) {
    try {
      const [baseCurrency, quoteCurrency] = currencyPair.split('/');
      const rate = await this.rateProvider.getRate(baseCurrency, quoteCurrency);
      
      if (!rate) {
        throw new Error(`No market data available for ${currencyPair}`);
      }

      return {
        currencyPair,
        bid: rate.bid || rate.rate * 0.9999,
        ask: rate.ask || rate.rate * 1.0001,
        midPrice: rate.rate,
        spread: rate.spread || 0.0001,
        timestamp: rate.timestamp || new Date(),
        volume: 0, // Would come from market data provider
        volatility: 0 // Would be calculated from historical data
      };

    } catch (error) {
      logger.error(`Error getting market data for ${currencyPair}:`, error);
      throw error;
    }
  }

  // Algorithm selection
  selectOptimalAlgorithm(order) {
    const { orderType, quantity, currencyPair } = order;

    // Simple algorithm selection logic
    if (orderType === 'market') {
      if (quantity > 1000000) {
        return 'TWAP'; // Large orders use TWAP
      } else {
        return 'Implementation_Shortfall'; // Medium orders use IS
      }
    } else if (orderType === 'limit') {
      return 'POV'; // Limit orders use POV
    } else {
      return 'VWAP'; // Default to VWAP
    }
  }

  // Utility methods
  validateExecution(provider, order, quantity, targetPrice) {
    const config = this.providerConfigs[provider.id];
    
    if (quantity > config.maxOrderSize) {
      throw new Error(`Order size ${quantity} exceeds provider limit ${config.maxOrderSize}`);
    }

    if (targetPrice <= 0) {
      throw new Error('Target price must be positive');
    }

    if (quantity <= 0) {
      throw new Error('Quantity must be positive');
    }
  }

  calculatePriceImprovement(targetPrice, executionPrice, side) {
    if (side === 'buy') {
      return targetPrice - executionPrice; // Positive if executed below target
    } else {
      return executionPrice - targetPrice; // Positive if executed above target
    }
  }

  updateExecutionMetrics(executionContext, execution) {
    const executions = executionContext.executions;
    
    // Calculate weighted average price
    const totalValue = executions.reduce((sum, exec) => sum + (exec.quantity * exec.price), 0);
    const totalQuantity = executions.reduce((sum, exec) => sum + exec.quantity, 0);
    executionContext.averagePrice = totalValue / totalQuantity;

    // Calculate slippage (would need benchmark price)
    // For now, using first execution as benchmark
    if (executions.length > 1) {
      const benchmarkPrice = executions[0].price;
      executionContext.slippage = Math.abs(executionContext.averagePrice - benchmarkPrice) / benchmarkPrice;
    }
  }

  updateProviderStats(providerId, execution, latency) {
    const stats = this.stats.providerStats.get(providerId);
    if (!stats) return;

    stats.executions++;
    stats.volume += execution.filledQuantity * execution.executionPrice;
    stats.averageLatency = (stats.averageLatency * (stats.executions - 1) + latency) / stats.executions;
    stats.successRate = 100; // Would track failures in real implementation
    stats.lastUsed = new Date();
  }

  getProviderById(providerId) {
    const provider = this.liquidityProviders.get(providerId);
    if (!provider) {
      // Return mock provider for testing
      return {
        id: providerId,
        name: this.providerConfigs[providerId]?.name || providerId,
        isConnected: true
      };
    }
    return provider;
  }

  // Execution completion
  async completeExecution(executionContext) {
    const { id, order, executions } = executionContext;
    const endTime = Date.now();
    const totalTime = endTime - executionContext.startTime;

    executionContext.status = 'completed';
    executionContext.endTime = endTime;
    executionContext.totalTime = totalTime;

    // Update statistics
    this.stats.totalExecutions++;
    this.stats.successfulExecutions++;
    
    const totalVolume = executions.reduce((sum, exec) => sum + (exec.quantity * exec.price), 0);
    const currencyPair = order.currencyPair;
    
    if (!this.stats.totalVolume.has(currencyPair)) {
      this.stats.totalVolume.set(currencyPair, 0);
    }
    this.stats.totalVolume.set(currencyPair, this.stats.totalVolume.get(currencyPair) + totalVolume);

    // Update average execution time
    this.stats.averageExecutionTime = 
      (this.stats.averageExecutionTime * (this.stats.totalExecutions - 1) + totalTime) / this.stats.totalExecutions;

    // Update average slippage
    this.stats.averageSlippage = 
      (this.stats.averageSlippage * (this.stats.totalExecutions - 1) + executionContext.slippage) / this.stats.totalExecutions;

    // Count price improvements
    const improvements = executions.filter(exec => exec.priceImprovement > this.config.priceImprovementThreshold);
    this.stats.priceImprovements += improvements.length;

    // Remove from active executions
    this.activeExecutions.delete(id);

    this.emit('executionCompleted', {
      executionId: id,
      orderId: order.id,
      totalFilled: executionContext.totalFilled,
      averagePrice: executionContext.averagePrice,
      totalTime,
      slippage: executionContext.slippage,
      executions: executions.length
    });

    logger.info(`Execution completed: ${id} - ${executionContext.totalFilled} @ ${executionContext.averagePrice} in ${totalTime}ms`);
  }

  async handleExecutionTimeout(executionContext) {
    const { id, order } = executionContext;
    
    executionContext.status = 'timeout';
    executionContext.endTime = Date.now();

    this.stats.failedExecutions++;
    this.activeExecutions.delete(id);

    this.emit('executionTimeout', {
      executionId: id,
      orderId: order.id,
      partialFilled: executionContext.totalFilled,
      remainingQuantity: executionContext.remainingQuantity
    });

    logger.warn(`Execution timeout: ${id} - partially filled ${executionContext.totalFilled}`);
  }

  async handleExecutionError(executionContext, error) {
    const { id, order } = executionContext;
    
    executionContext.status = 'error';
    executionContext.error = error.message;
    executionContext.endTime = Date.now();

    this.stats.failedExecutions++;
    this.activeExecutions.delete(id);

    this.emit('executionError', {
      executionId: id,
      orderId: order.id,
      error: error.message,
      partialFilled: executionContext.totalFilled
    });

    logger.error(`Execution error: ${id} - ${error.message}`);
  }

  // Query methods
  getExecution(executionId) {
    return this.activeExecutions.get(executionId) || null;
  }

  getActiveExecutions() {
    return Array.from(this.activeExecutions.values());
  }

  getExecutionStatistics() {
    return {
      ...this.stats,
      totalVolume: Object.fromEntries(this.stats.totalVolume),
      providerStats: Object.fromEntries(this.stats.providerStats),
      activeExecutions: this.activeExecutions.size,
      queuedExecutions: this.executionQueue.length,
      successRate: this.stats.totalExecutions > 0 ? 
        (this.stats.successfulExecutions / this.stats.totalExecutions) * 100 : 0
    };
  }

  // Health check
  async healthCheck() {
    const health = {
      status: 'healthy',
      activeExecutions: this.activeExecutions.size,
      queuedExecutions: this.executionQueue.length,
      isProcessing: this.isProcessing,
      providers: {},
      algorithms: {},
      errors: []
    };

    // Check providers
    for (const [providerId, provider] of this.liquidityProviders) {
      try {
        health.providers[providerId] = {
          connected: provider.isConnected || true,
          lastUsed: this.stats.providerStats.get(providerId)?.lastUsed
        };
      } catch (error) {
        health.providers[providerId] = { connected: false, error: error.message };
        health.errors.push(`Provider ${providerId}: ${error.message}`);
      }
    }

    // Check algorithms
    Object.keys(this.algorithms).forEach(algoName => {
      health.algorithms[algoName] = 'available';
    });

    // Check dependencies
    if (!this.rateProvider) {
      health.errors.push('Rate provider not configured');
      health.status = 'degraded';
    }

    if (!this.orderManager) {
      health.errors.push('Order manager not configured');
      health.status = 'degraded';
    }

    if (health.errors.length > 0 && health.status === 'healthy') {
      health.status = 'degraded';
    }

    return health;
  }

  // Cleanup
  async cleanup() {
    this.isProcessing = false;
    
    // Cancel active executions
    for (const [executionId, context] of this.activeExecutions) {
      try {
        await this.handleExecutionError(context, new Error('System shutdown'));
      } catch (error) {
        logger.error(`Error cancelling execution ${executionId}:`, error);
      }
    }

    this.activeExecutions.clear();
    this.executionQueue.length = 0;

    logger.info('FX Execution Engine cleaned up');
  }
}

// Execution Algorithms

class TWAPAlgorithm {
  constructor(engine) {
    this.engine = engine;
    this.name = 'TWAP';
  }

  async getNextSlice(executionContext) {
    const { remainingQuantity, options, startTime } = executionContext;
    const elapsed = Date.now() - startTime;
    const timeRemaining = options.timeLimit - elapsed;
    
    if (timeRemaining <= 0) return null;

    // Simple TWAP: divide remaining quantity by remaining time slices
    const sliceCount = Math.ceil(timeRemaining / 10000); // 10 second slices
    const sliceSize = Math.min(remainingQuantity / sliceCount, remainingQuantity);

    return {
      quantity: sliceSize,
      urgency: 'low',
      targetPrice: null // Use market price
    };
  }
}

class VWAPAlgorithm {
  constructor(engine) {
    this.engine = engine;
    this.name = 'VWAP';
  }

  async getNextSlice(executionContext) {
    // Simplified VWAP - would need historical volume data
    const { remainingQuantity } = executionContext;
    const sliceSize = Math.min(remainingQuantity * 0.1, remainingQuantity); // 10% slices

    return {
      quantity: sliceSize,
      urgency: 'normal',
      targetPrice: null
    };
  }
}

class ImplementationShortfallAlgorithm {
  constructor(engine) {
    this.engine = engine;
    this.name = 'Implementation Shortfall';
  }

  async getNextSlice(executionContext) {
    const { remainingQuantity, options } = executionContext;
    
    // Aggressive execution for Implementation Shortfall
    const sliceSize = Math.min(remainingQuantity * 0.2, remainingQuantity); // 20% slices

    return {
      quantity: sliceSize,
      urgency: 'high',
      targetPrice: null
    };
  }
}

class POVAlgorithm {
  constructor(engine) {
    this.engine = engine;
    this.name = 'POV';
    this.participationRate = 0.1; // 10% of volume
  }

  async getNextSlice(executionContext) {
    const { remainingQuantity } = executionContext;
    
    // Would need real-time volume data
    const estimatedVolume = 1000; // Mock volume
    const sliceSize = Math.min(estimatedVolume * this.participationRate, remainingQuantity);

    return {
      quantity: sliceSize,
      urgency: 'normal',
      targetPrice: null
    };
  }
}

class MarketMakingAlgorithm {
  constructor(engine) {
    this.engine = engine;
    this.name = 'Market Making';
  }

  async getNextSlice(executionContext) {
    const { remainingQuantity, order } = executionContext;
    
    // Conservative market making approach
    const sliceSize = Math.min(remainingQuantity * 0.05, remainingQuantity); // 5% slices

    // Try to get better price by posting limit orders
    const marketData = await this.engine.getMarketData(order.currencyPair);
    const targetPrice = order.side === 'buy' ? 
      marketData.bid + (marketData.spread * 0.3) : 
      marketData.ask - (marketData.spread * 0.3);

    return {
      quantity: sliceSize,
      urgency: 'low',
      targetPrice
    };
  }
}

module.exports = FXExecutionEngine;