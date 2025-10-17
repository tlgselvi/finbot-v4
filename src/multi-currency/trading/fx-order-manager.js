/**
 * FX Order Management System
 * Comprehensive foreign exchange order management with risk controls and compliance
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');

class FXOrderManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      supportedOrderTypes: config.supportedOrderTypes || [
        'market', 'limit', 'stop', 'stop_limit', 'trailing_stop'
      ],
      maxOrderSize: config.maxOrderSize || 10000000, // 10M
      minOrderSize: config.minOrderSize || 100,
      maxOrdersPerUser: config.maxOrdersPerUser || 50,
      orderExpiryHours: config.orderExpiryHours || 24,
      enableRiskChecks: config.enableRiskChecks !== false,
      enablePreTradeCompliance: config.enablePreTradeCompliance !== false,
      slippageTolerance: config.slippageTolerance || 0.001, // %0.1
      ...config
    };

    // Bağımlılıklar
    this.rateProvider = config.rateProvider;
    this.accountManager = config.accountManager;
    this.riskEngine = config.riskEngine;
    this.complianceEngine = config.complianceEngine;

    // Emir verileri
    this.orders = new Map(); // orderId -> order
    this.userOrders = new Map(); // userId -> orderIds[]
    this.orderBook = new Map(); // currencyPair -> orders[]
    this.executedOrders = new Map(); // orderId -> execution details
    
    // Emir durumları
    this.orderStatuses = [
      'pending', 'submitted', 'partial_filled', 'filled', 
      'cancelled', 'rejected', 'expired'
    ];

    // İstatistikler
    this.stats = {
      totalOrders: 0,
      ordersByType: {},
      ordersByStatus: {},
      totalVolume: {},
      averageOrderSize: 0,
      fillRate: 0
    };

    this.initializeStats();
  }

  initializeStats() {
    this.config.supportedOrderTypes.forEach(type => {
      this.stats.ordersByType[type] = 0;
    });

    this.orderStatuses.forEach(status => {
      this.stats.ordersByStatus[status] = 0;
    });
  }

  // Emir Oluşturma ve Yönetimi

  async createOrder(userId, orderData) {
    try {
      const {
        orderType,
        currencyPair,
        side, // 'buy' veya 'sell'
        quantity,
        price = null, // Market emirlerde null
        stopPrice = null, // Stop emirlerde gerekli
        timeInForce = 'GTC', // GTC, IOC, FOK, DAY
        metadata = {}
      } = orderData;

      // Temel validasyonlar
      this.validateOrderRequest(userId, orderData);

      // Risk kontrolleri
      if (this.config.enableRiskChecks) {
        await this.performRiskChecks(userId, orderData);
      }

      // Ön-ticaret uyumluluk kontrolleri
      if (this.config.enablePreTradeCompliance) {
        await this.performComplianceChecks(userId, orderData);
      }

      // Emir ID oluştur
      const orderId = uuidv4();
      
      // Para birimi çiftini ayrıştır
      const [baseCurrency, quoteCurrency] = currencyPair.split('/');

      // Emir objesi oluştur
      const order = {
        id: orderId,
        userId,
        orderType,
        currencyPair,
        baseCurrency,
        quoteCurrency,
        side,
        quantity: this.roundQuantity(quantity, baseCurrency),
        originalQuantity: this.roundQuantity(quantity, baseCurrency),
        price: price ? this.roundPrice(price, currencyPair) : null,
        stopPrice: stopPrice ? this.roundPrice(stopPrice, currencyPair) : null,
        timeInForce,
        status: 'pending',
        filledQuantity: 0,
        averageFillPrice: 0,
        remainingQuantity: this.roundQuantity(quantity, baseCurrency),
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: this.calculateExpiryTime(timeInForce),
        fills: [],
        metadata: {
          ...metadata,
          clientOrderId: metadata.clientOrderId || `client_${Date.now()}`,
          source: metadata.source || 'api'
        }
      };

      // Hesap bakiye kontrolü ve rezervasyon
      if (side === 'sell') {
        // Satış emri - base currency rezerve et
        await this.reserveBalance(userId, baseCurrency, quantity, orderId);
      } else {
        // Alış emri - quote currency rezerve et (market emri için mevcut fiyat kullan)
        const reserveAmount = price ? quantity * price : await this.estimateMarketCost(currencyPair, quantity);
        await this.reserveBalance(userId, quoteCurrency, reserveAmount, orderId);
      }

      // Emri kaydet
      this.orders.set(orderId, order);

      // Kullanıcı emirlerini güncelle
      if (!this.userOrders.has(userId)) {
        this.userOrders.set(userId, []);
      }
      this.userOrders.get(userId).push(orderId);

      // Emir defterine ekle
      this.addToOrderBook(order);

      // İstatistikleri güncelle
      this.updateOrderStats(order, 'created');

      // Emir durumunu güncelle
      await this.updateOrderStatus(orderId, 'submitted');

      this.emit('orderCreated', {
        orderId,
        userId,
        order: { ...order }
      });

      logger.info(`FX emri oluşturuldu: ${orderId} - ${side} ${quantity} ${currencyPair}`);

      return {
        success: true,
        orderId,
        order: { ...order }
      };

    } catch (error) {
      logger.error('FX emir oluşturma hatası:', error);
      throw error;
    }
  }

  async cancelOrder(orderId, userId, reason = 'user_request') {
    try {
      const order = this.orders.get(orderId);
      
      if (!order) {
        throw new Error('Emir bulunamadı');
      }

      if (order.userId !== userId) {
        throw new Error('Bu emre erişim yetkiniz yok');
      }

      if (!['pending', 'submitted', 'partial_filled'].includes(order.status)) {
        throw new Error(`Emir iptal edilemez. Mevcut durum: ${order.status}`);
      }

      // Rezerve bakiyeyi serbest bırak
      await this.releaseOrderReservation(order);

      // Emir durumunu güncelle
      await this.updateOrderStatus(orderId, 'cancelled', { reason });

      // Emir defterinden çıkar
      this.removeFromOrderBook(order);

      this.emit('orderCancelled', {
        orderId,
        userId,
        reason,
        remainingQuantity: order.remainingQuantity
      });

      logger.info(`FX emri iptal edildi: ${orderId} - Sebep: ${reason}`);

      return {
        success: true,
        orderId,
        cancelledQuantity: order.remainingQuantity
      };

    } catch (error) {
      logger.error('FX emir iptal hatası:', error);
      throw error;
    }
  }

  async modifyOrder(orderId, userId, modifications) {
    try {
      const order = this.orders.get(orderId);
      
      if (!order) {
        throw new Error('Emir bulunamadı');
      }

      if (order.userId !== userId) {
        throw new Error('Bu emre erişim yetkiniz yok');
      }

      if (!['pending', 'submitted'].includes(order.status)) {
        throw new Error(`Emir değiştirilemez. Mevcut durum: ${order.status}`);
      }

      const {
        quantity = null,
        price = null,
        stopPrice = null,
        timeInForce = null
      } = modifications;

      // Değişiklikleri uygula
      if (quantity && quantity !== order.quantity) {
        // Miktar değişikliği - rezervasyon güncelle
        await this.updateOrderReservation(order, quantity);
        order.quantity = this.roundQuantity(quantity, order.baseCurrency);
        order.remainingQuantity = order.quantity - order.filledQuantity;
      }

      if (price && price !== order.price) {
        order.price = this.roundPrice(price, order.currencyPair);
      }

      if (stopPrice && stopPrice !== order.stopPrice) {
        order.stopPrice = this.roundPrice(stopPrice, order.currencyPair);
      }

      if (timeInForce && timeInForce !== order.timeInForce) {
        order.timeInForce = timeInForce;
        order.expiresAt = this.calculateExpiryTime(timeInForce);
      }

      order.updatedAt = new Date();

      // Emir defterini güncelle
      this.updateOrderBook(order);

      this.emit('orderModified', {
        orderId,
        userId,
        modifications,
        updatedOrder: { ...order }
      });

      logger.info(`FX emri değiştirildi: ${orderId}`);

      return {
        success: true,
        orderId,
        updatedOrder: { ...order }
      };

    } catch (error) {
      logger.error('FX emir değiştirme hatası:', error);
      throw error;
    }
  }

  // Order Execution Methods

  async executeOrder(orderId, executionData) {
    try {
      const order = this.orders.get(orderId);
      
      if (!order) {
        throw new Error('Order not found');
      }

      if (!['submitted', 'partial_filled'].includes(order.status)) {
        throw new Error(`Order cannot be executed. Current status: ${order.status}`);
      }

      const {
        executionPrice,
        executionQuantity,
        executionTime = new Date(),
        liquidityProvider = 'internal',
        executionId = uuidv4()
      } = executionData;

      // Validate execution
      this.validateExecution(order, executionPrice, executionQuantity);

      // Create execution record
      const execution = {
        id: executionId,
        orderId,
        executionPrice: this.roundPrice(executionPrice, order.currencyPair),
        executionQuantity: this.roundQuantity(executionQuantity, order.baseCurrency),
        executionTime,
        liquidityProvider,
        side: order.side,
        currencyPair: order.currencyPair,
        grossAmount: executionQuantity * executionPrice,
        commission: this.calculateCommission(executionQuantity, executionPrice, order.currencyPair),
        netAmount: null // Will be calculated after commission
      };

      execution.netAmount = execution.grossAmount - execution.commission;

      // Update order with execution
      order.fills.push(execution);
      order.filledQuantity += executionQuantity;
      order.remainingQuantity = order.originalQuantity - order.filledQuantity;
      
      // Calculate average fill price
      const totalValue = order.fills.reduce((sum, fill) => sum + (fill.executionQuantity * fill.executionPrice), 0);
      order.averageFillPrice = totalValue / order.filledQuantity;
      
      order.updatedAt = new Date();

      // Update order status
      if (order.remainingQuantity <= 0) {
        await this.updateOrderStatus(orderId, 'filled');
        this.removeFromOrderBook(order);
      } else {
        await this.updateOrderStatus(orderId, 'partial_filled');
      }

      // Process settlement
      await this.processOrderSettlement(order, execution);

      // Store execution
      this.executedOrders.set(executionId, execution);

      // Update statistics
      this.updateExecutionStats(execution);

      this.emit('orderExecuted', {
        orderId,
        executionId,
        execution,
        orderStatus: order.status,
        remainingQuantity: order.remainingQuantity
      });

      logger.info(`Order executed: ${orderId} - ${executionQuantity} @ ${executionPrice}`);

      return {
        success: true,
        executionId,
        execution,
        orderStatus: order.status,
        remainingQuantity: order.remainingQuantity
      };

    } catch (error) {
      logger.error('Order execution error:', error);
      throw error;
    }
  }

  async processOrderSettlement(order, execution) {
    try {
      const { side, baseCurrency, quoteCurrency, userId } = order;
      const { executionQuantity, executionPrice, netAmount, commission } = execution;

      if (side === 'buy') {
        // Buy order: Credit base currency, debit quote currency
        await this.accountManager.creditAccount(
          await this.getUserAccount(userId, baseCurrency),
          executionQuantity,
          {
            orderId: order.id,
            executionId: execution.id,
            type: 'fx_buy',
            rate: executionPrice
          }
        );

        await this.accountManager.debitAccount(
          await this.getUserAccount(userId, quoteCurrency),
          netAmount + commission,
          {
            orderId: order.id,
            executionId: execution.id,
            type: 'fx_buy_payment',
            rate: executionPrice,
            commission
          }
        );

      } else {
        // Sell order: Debit base currency, credit quote currency
        await this.accountManager.debitAccount(
          await this.getUserAccount(userId, baseCurrency),
          executionQuantity,
          {
            orderId: order.id,
            executionId: execution.id,
            type: 'fx_sell',
            rate: executionPrice
          }
        );

        await this.accountManager.creditAccount(
          await this.getUserAccount(userId, quoteCurrency),
          netAmount - commission,
          {
            orderId: order.id,
            executionId: execution.id,
            type: 'fx_sell_proceeds',
            rate: executionPrice,
            commission
          }
        );
      }

      // Release remaining reservation if order is fully filled
      if (order.status === 'filled') {
        await this.releaseOrderReservation(order);
      }

    } catch (error) {
      logger.error('Settlement processing error:', error);
      throw error;
    }
  }

  // Order Book Management

  addToOrderBook(order) {
    const { currencyPair } = order;
    
    if (!this.orderBook.has(currencyPair)) {
      this.orderBook.set(currencyPair, {
        buy: [],
        sell: []
      });
    }

    const book = this.orderBook.get(currencyPair);
    book[order.side].push(order);

    // Sort order book
    this.sortOrderBook(currencyPair);
  }

  removeFromOrderBook(order) {
    const { currencyPair, side, id } = order;
    const book = this.orderBook.get(currencyPair);
    
    if (book && book[side]) {
      book[side] = book[side].filter(o => o.id !== id);
    }
  }

  updateOrderBook(order) {
    this.removeFromOrderBook(order);
    this.addToOrderBook(order);
  }

  sortOrderBook(currencyPair) {
    const book = this.orderBook.get(currencyPair);
    if (!book) return;

    // Sort buy orders by price descending (highest first)
    book.buy.sort((a, b) => {
      if (a.orderType === 'market' && b.orderType !== 'market') return -1;
      if (b.orderType === 'market' && a.orderType !== 'market') return 1;
      if (a.orderType === 'market' && b.orderType === 'market') return a.createdAt - b.createdAt;
      return (b.price || 0) - (a.price || 0);
    });

    // Sort sell orders by price ascending (lowest first)
    book.sell.sort((a, b) => {
      if (a.orderType === 'market' && b.orderType !== 'market') return -1;
      if (b.orderType === 'market' && a.orderType !== 'market') return 1;
      if (a.orderType === 'market' && b.orderType === 'market') return a.createdAt - b.createdAt;
      return (a.price || Infinity) - (b.price || Infinity);
    });
  }

  getOrderBook(currencyPair, depth = 10) {
    const book = this.orderBook.get(currencyPair);
    if (!book) {
      return { buy: [], sell: [] };
    }

    return {
      buy: book.buy.slice(0, depth).map(order => ({
        price: order.price,
        quantity: order.remainingQuantity,
        orderCount: 1,
        side: 'buy'
      })),
      sell: book.sell.slice(0, depth).map(order => ({
        price: order.price,
        quantity: order.remainingQuantity,
        orderCount: 1,
        side: 'sell'
      }))
    };
  }

  // Validation Methods

  validateOrderRequest(userId, orderData) {
    const {
      orderType,
      currencyPair,
      side,
      quantity,
      price,
      stopPrice,
      timeInForce
    } = orderData;

    // Basic validations
    if (!this.config.supportedOrderTypes.includes(orderType)) {
      throw new Error(`Unsupported order type: ${orderType}`);
    }

    if (!currencyPair || !currencyPair.includes('/')) {
      throw new Error('Invalid currency pair format');
    }

    if (!['buy', 'sell'].includes(side)) {
      throw new Error('Side must be buy or sell');
    }

    if (!quantity || quantity <= 0) {
      throw new Error('Quantity must be positive');
    }

    if (quantity < this.config.minOrderSize) {
      throw new Error(`Order size below minimum: ${this.config.minOrderSize}`);
    }

    if (quantity > this.config.maxOrderSize) {
      throw new Error(`Order size above maximum: ${this.config.maxOrderSize}`);
    }

    // Order type specific validations
    if (['limit', 'stop_limit'].includes(orderType) && (!price || price <= 0)) {
      throw new Error('Limit orders require a valid price');
    }

    if (['stop', 'stop_limit', 'trailing_stop'].includes(orderType) && (!stopPrice || stopPrice <= 0)) {
      throw new Error('Stop orders require a valid stop price');
    }

    if (orderType === 'stop_limit' && price && stopPrice) {
      if (side === 'buy' && stopPrice <= price) {
        throw new Error('Buy stop-limit: stop price must be above limit price');
      }
      if (side === 'sell' && stopPrice >= price) {
        throw new Error('Sell stop-limit: stop price must be below limit price');
      }
    }

    // Time in force validation
    const validTIF = ['GTC', 'IOC', 'FOK', 'DAY'];
    if (timeInForce && !validTIF.includes(timeInForce)) {
      throw new Error(`Invalid time in force: ${timeInForce}`);
    }

    // User order limit check
    const userOrderCount = this.userOrders.get(userId)?.length || 0;
    if (userOrderCount >= this.config.maxOrdersPerUser) {
      throw new Error(`Maximum orders per user exceeded: ${this.config.maxOrdersPerUser}`);
    }
  }

  validateExecution(order, executionPrice, executionQuantity) {
    if (executionQuantity <= 0) {
      throw new Error('Execution quantity must be positive');
    }

    if (executionQuantity > order.remainingQuantity) {
      throw new Error('Execution quantity exceeds remaining order quantity');
    }

    if (executionPrice <= 0) {
      throw new Error('Execution price must be positive');
    }

    // Price validation for limit orders
    if (order.orderType === 'limit') {
      if (order.side === 'buy' && executionPrice > order.price) {
        throw new Error('Buy limit order executed above limit price');
      }
      if (order.side === 'sell' && executionPrice < order.price) {
        throw new Error('Sell limit order executed below limit price');
      }
    }

    // Slippage check for market orders
    if (order.orderType === 'market') {
      // This would typically check against current market price
      // For now, we'll skip this validation
    }
  }

  // Risk and Compliance Methods

  async performRiskChecks(userId, orderData) {
    if (!this.riskEngine) {
      logger.warn('Risk engine not configured, skipping risk checks');
      return;
    }

    try {
      const riskAssessment = await this.riskEngine.assessOrderRisk(userId, orderData);
      
      if (!riskAssessment.approved) {
        throw new Error(`Order rejected by risk engine: ${riskAssessment.reason}`);
      }

      if (riskAssessment.warnings && riskAssessment.warnings.length > 0) {
        logger.warn(`Risk warnings for order:`, riskAssessment.warnings);
      }

    } catch (error) {
      logger.error('Risk check failed:', error);
      throw error;
    }
  }

  async performComplianceChecks(userId, orderData) {
    if (!this.complianceEngine) {
      logger.warn('Compliance engine not configured, skipping compliance checks');
      return;
    }

    try {
      const complianceResult = await this.complianceEngine.checkOrderCompliance(userId, orderData);
      
      if (!complianceResult.approved) {
        throw new Error(`Order rejected by compliance: ${complianceResult.reason}`);
      }

    } catch (error) {
      logger.error('Compliance check failed:', error);
      throw error;
    }
  }

  // Account and Balance Management

  async reserveBalance(userId, currency, amount, orderId) {
    try {
      const account = await this.getUserAccount(userId, currency);
      
      if (account.availableBalance < amount) {
        throw new Error(`Insufficient ${currency} balance. Required: ${amount}, Available: ${account.availableBalance}`);
      }

      await this.accountManager.reserveBalance(account.id, amount, {
        orderId,
        type: 'fx_order_reservation',
        currency
      });

    } catch (error) {
      logger.error(`Balance reservation failed for ${currency}:`, error);
      throw error;
    }
  }

  async releaseOrderReservation(order) {
    try {
      const { userId, side, baseCurrency, quoteCurrency, remainingQuantity, price } = order;

      if (side === 'sell') {
        // Release base currency reservation
        const account = await this.getUserAccount(userId, baseCurrency);
        await this.accountManager.releaseReservation(account.id, remainingQuantity, {
          orderId: order.id,
          type: 'fx_order_release'
        });
      } else {
        // Release quote currency reservation
        const reservedAmount = price ? remainingQuantity * price : await this.estimateMarketCost(order.currencyPair, remainingQuantity);
        const account = await this.getUserAccount(userId, quoteCurrency);
        await this.accountManager.releaseReservation(account.id, reservedAmount, {
          orderId: order.id,
          type: 'fx_order_release'
        });
      }

    } catch (error) {
      logger.error('Error releasing order reservation:', error);
      throw error;
    }
  }

  async updateOrderReservation(order, newQuantity) {
    try {
      // Release current reservation
      await this.releaseOrderReservation(order);
      
      // Create new reservation
      const { userId, side, baseCurrency, quoteCurrency, price } = order;
      
      if (side === 'sell') {
        await this.reserveBalance(userId, baseCurrency, newQuantity, order.id);
      } else {
        const reserveAmount = price ? newQuantity * price : await this.estimateMarketCost(order.currencyPair, newQuantity);
        await this.reserveBalance(userId, quoteCurrency, reserveAmount, order.id);
      }

    } catch (error) {
      logger.error('Error updating order reservation:', error);
      throw error;
    }
  }

  async getUserAccount(userId, currency) {
    const account = await this.accountManager.getUserAccount(userId, currency);
    if (!account) {
      throw new Error(`No ${currency} account found for user ${userId}`);
    }
    return account;
  }

  async estimateMarketCost(currencyPair, quantity) {
    try {
      if (!this.rateProvider) {
        throw new Error('Rate provider not configured');
      }

      const [baseCurrency, quoteCurrency] = currencyPair.split('/');
      const rate = await this.rateProvider.getRate(baseCurrency, quoteCurrency);
      
      if (!rate) {
        throw new Error(`Rate not available for ${currencyPair}`);
      }

      // Add slippage buffer for market orders
      const slippageBuffer = 1 + this.config.slippageTolerance;
      return quantity * rate.ask * slippageBuffer;

    } catch (error) {
      logger.error('Error estimating market cost:', error);
      throw error;
    }
  }

  // Utility Methods

  roundQuantity(quantity, currency) {
    // Different currencies have different precision requirements
    const precision = this.getCurrencyPrecision(currency);
    return Math.round(quantity * Math.pow(10, precision)) / Math.pow(10, precision);
  }

  roundPrice(price, currencyPair) {
    // Different currency pairs have different price precision
    const precision = this.getPairPricePrecision(currencyPair);
    return Math.round(price * Math.pow(10, precision)) / Math.pow(10, precision);
  }

  getCurrencyPrecision(currency) {
    // Standard precision for major currencies
    const precisionMap = {
      'USD': 2, 'EUR': 2, 'GBP': 2, 'JPY': 0,
      'CHF': 2, 'CAD': 2, 'AUD': 2, 'NZD': 2
    };
    return precisionMap[currency] || 2;
  }

  getPairPricePrecision(currencyPair) {
    // JPY pairs typically have 2-3 decimal places, others have 4-5
    if (currencyPair.includes('JPY')) {
      return 3;
    }
    return 5;
  }

  calculateExpiryTime(timeInForce) {
    const now = new Date();
    
    switch (timeInForce) {
      case 'DAY':
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        return endOfDay;
      case 'GTC':
        return null; // Good till cancelled
      case 'IOC':
      case 'FOK':
        return new Date(now.getTime() + 1000); // 1 second for immediate orders
      default:
        return new Date(now.getTime() + (this.config.orderExpiryHours * 60 * 60 * 1000));
    }
  }

  calculateCommission(quantity, price, currencyPair) {
    // Simple commission calculation - 0.1% of trade value
    const tradeValue = quantity * price;
    return tradeValue * 0.001;
  }

  // Order Status Management

  async updateOrderStatus(orderId, newStatus, metadata = {}) {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const oldStatus = order.status;
    order.status = newStatus;
    order.updatedAt = new Date();

    if (metadata.reason) {
      order.metadata.statusReason = metadata.reason;
    }

    // Update statistics
    this.stats.ordersByStatus[oldStatus]--;
    this.stats.ordersByStatus[newStatus]++;

    this.emit('orderStatusChanged', {
      orderId,
      oldStatus,
      newStatus,
      order: { ...order },
      metadata
    });

    logger.debug(`Order ${orderId} status changed: ${oldStatus} -> ${newStatus}`);
  }

  // Query Methods

  getOrder(orderId, userId = null) {
    const order = this.orders.get(orderId);
    
    if (!order) {
      return null;
    }

    if (userId && order.userId !== userId) {
      throw new Error('Access denied to this order');
    }

    return { ...order };
  }

  getUserOrders(userId, options = {}) {
    const {
      status = null,
      currencyPair = null,
      orderType = null,
      limit = 50,
      offset = 0
    } = options;

    const userOrderIds = this.userOrders.get(userId) || [];
    let orders = userOrderIds.map(id => this.orders.get(id)).filter(Boolean);

    // Apply filters
    if (status) {
      orders = orders.filter(order => order.status === status);
    }

    if (currencyPair) {
      orders = orders.filter(order => order.currencyPair === currencyPair);
    }

    if (orderType) {
      orders = orders.filter(order => order.orderType === orderType);
    }

    // Sort by creation time (newest first)
    orders.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    const total = orders.length;
    orders = orders.slice(offset, offset + limit);

    return {
      orders: orders.map(order => ({ ...order })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  getOrderHistory(userId, options = {}) {
    const {
      startDate = null,
      endDate = null,
      currencyPair = null,
      limit = 100,
      offset = 0
    } = options;

    const userOrderIds = this.userOrders.get(userId) || [];
    let orders = userOrderIds.map(id => this.orders.get(id)).filter(Boolean);

    // Filter by date range
    if (startDate) {
      orders = orders.filter(order => order.createdAt >= startDate);
    }

    if (endDate) {
      orders = orders.filter(order => order.createdAt <= endDate);
    }

    // Filter by currency pair
    if (currencyPair) {
      orders = orders.filter(order => order.currencyPair === currencyPair);
    }

    // Only include completed orders (filled, cancelled, rejected, expired)
    orders = orders.filter(order => 
      ['filled', 'cancelled', 'rejected', 'expired'].includes(order.status)
    );

    // Sort by completion time
    orders.sort((a, b) => b.updatedAt - a.updatedAt);

    // Apply pagination
    const total = orders.length;
    orders = orders.slice(offset, offset + limit);

    return {
      orders: orders.map(order => ({ ...order })),
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };
  }

  // Statistics and Monitoring

  updateOrderStats(order, action) {
    switch (action) {
      case 'created':
        this.stats.totalOrders++;
        this.stats.ordersByType[order.orderType]++;
        this.stats.ordersByStatus[order.status]++;
        break;
    }

    // Update average order size
    if (action === 'created') {
      const totalValue = this.stats.averageOrderSize * (this.stats.totalOrders - 1) + order.quantity;
      this.stats.averageOrderSize = totalValue / this.stats.totalOrders;
    }
  }

  updateExecutionStats(execution) {
    const { currencyPair, executionQuantity, executionPrice } = execution;
    const tradeValue = executionQuantity * executionPrice;

    if (!this.stats.totalVolume[currencyPair]) {
      this.stats.totalVolume[currencyPair] = 0;
    }
    this.stats.totalVolume[currencyPair] += tradeValue;

    // Update fill rate
    const filledOrders = this.stats.ordersByStatus.filled || 0;
    const totalOrders = this.stats.totalOrders || 1;
    this.stats.fillRate = (filledOrders / totalOrders) * 100;
  }

  getStatistics() {
    return {
      ...this.stats,
      activeOrders: this.orders.size,
      orderBookDepth: Array.from(this.orderBook.entries()).reduce((acc, [pair, book]) => {
        acc[pair] = {
          buyOrders: book.buy.length,
          sellOrders: book.sell.length
        };
        return acc;
      }, {}),
      lastUpdated: new Date()
    };
  }

  // Order Expiry Management

  startExpiryMonitoring() {
    // Check for expired orders every minute
    this.expiryInterval = setInterval(() => {
      this.checkExpiredOrders();
    }, 60000);

    logger.info('Order expiry monitoring started');
  }

  stopExpiryMonitoring() {
    if (this.expiryInterval) {
      clearInterval(this.expiryInterval);
      this.expiryInterval = null;
    }
    logger.info('Order expiry monitoring stopped');
  }

  async checkExpiredOrders() {
    const now = new Date();
    const expiredOrders = [];

    for (const [orderId, order] of this.orders.entries()) {
      if (order.expiresAt && now > order.expiresAt && 
          ['pending', 'submitted', 'partial_filled'].includes(order.status)) {
        expiredOrders.push(order);
      }
    }

    for (const order of expiredOrders) {
      try {
        await this.cancelOrder(order.id, order.userId, 'expired');
        await this.updateOrderStatus(order.id, 'expired');
      } catch (error) {
        logger.error(`Error expiring order ${order.id}:`, error);
      }
    }

    if (expiredOrders.length > 0) {
      logger.info(`Expired ${expiredOrders.length} orders`);
    }
  }

  // Health Check

  async healthCheck() {
    const health = {
      status: 'healthy',
      orderCount: this.orders.size,
      activeOrderCount: Array.from(this.orders.values()).filter(o => 
        ['pending', 'submitted', 'partial_filled'].includes(o.status)
      ).length,
      orderBookPairs: this.orderBook.size,
      dependencies: {},
      errors: []
    };

    // Check dependencies
    if (this.accountManager) {
      health.dependencies.accountManager = 'connected';
    } else {
      health.dependencies.accountManager = 'missing';
      health.errors.push('Account manager not configured');
    }

    if (this.rateProvider) {
      health.dependencies.rateProvider = 'connected';
    } else {
      health.dependencies.rateProvider = 'missing';
      health.errors.push('Rate provider not configured');
    }

    if (this.riskEngine) {
      health.dependencies.riskEngine = 'connected';
    } else {
      health.dependencies.riskEngine = 'optional';
    }

    if (this.complianceEngine) {
      health.dependencies.complianceEngine = 'connected';
    } else {
      health.dependencies.complianceEngine = 'optional';
    }

    if (health.errors.length > 0) {
      health.status = 'degraded';
    }

    return health;
  }

  // Cleanup

  async cleanup() {
    this.stopExpiryMonitoring();
    
    // Cancel all pending orders
    const pendingOrders = Array.from(this.orders.values()).filter(order =>
      ['pending', 'submitted', 'partial_filled'].includes(order.status)
    );

    for (const order of pendingOrders) {
      try {
        await this.cancelOrder(order.id, order.userId, 'system_shutdown');
      } catch (error) {
        logger.error(`Error cancelling order ${order.id} during cleanup:`, error);
      }
    }

    this.orders.clear();
    this.userOrders.clear();
    this.orderBook.clear();
    this.executedOrders.clear();

    logger.info('FX Order Manager cleaned up');
  }
}