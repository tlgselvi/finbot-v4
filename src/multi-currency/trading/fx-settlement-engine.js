/**
 * FX Settlement and Clearing Engine
 * Handles T+0, T+1, T+2 settlement cycles with netting and optimization
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');

class FXSettlementEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      supportedSettlementCycles: config.supportedSettlementCycles || ['T+0', 'T+1', 'T+2'],
      defaultSettlementCycle: config.defaultSettlementCycle || 'T+2',
      enableNetting: config.enableNetting !== false,
      enableOptimization: config.enableOptimization !== false,
      maxSettlementAmount: config.maxSettlementAmount || 100000000, // 100M
      settlementCutoffTimes: config.settlementCutoffTimes || {
        'T+0': '16:00',
        'T+1': '15:00', 
        'T+2': '14:00'
      },
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 5000,
      ...config
    };

    // Dependencies
    this.accountManager = null;
    this.paymentSystem = null;
    this.nostroManager = null;
    this.complianceEngine = null;

    // Settlement state
    this.pendingSettlements = new Map(); // settlementId -> settlement
    this.settlementBatches = new Map(); // batchId -> batch
    this.failedSettlements = new Map(); // settlementId -> failure info
    this.nettingGroups = new Map(); // groupId -> netting group

    // Settlement cycles and schedules
    this.settlementSchedules = new Map();
    this.processingTimers = new Map();

    // Statistics
    this.stats = {
      totalSettlements: 0,
      successfulSettlements: 0,
      failedSettlements: 0,
      totalVolume: new Map(),
      averageSettlementTime: 0,
      nettingEfficiency: 0,
      settlementsByType: new Map()
    };

    this.initializeSettlementSchedules();
  }  // Initia
lize settlement engine
  initialize(dependencies) {
    this.accountManager = dependencies.accountManager;
    this.paymentSystem = dependencies.paymentSystem;
    this.nostroManager = dependencies.nostroManager;
    this.complianceEngine = dependencies.complianceEngine;

    // Start settlement processing
    this.startSettlementProcessing();

    logger.info('FX Settlement Engine initialized');
  }

  initializeSettlementSchedules() {
    // Set up settlement schedules for each cycle
    this.config.supportedSettlementCycles.forEach(cycle => {
      const cutoffTime = this.config.settlementCutoffTimes[cycle];
      this.settlementSchedules.set(cycle, {
        cycle,
        cutoffTime,
        nextSettlement: this.calculateNextSettlementDate(cycle),
        isActive: true
      });
    });
  }

  // Main settlement creation method
  async createSettlement(tradeData) {
    const settlementId = uuidv4();
    const startTime = Date.now();

    try {
      // Determine settlement cycle
      const settlementCycle = this.determineSettlementCycle(tradeData);
      
      // Create settlement record
      const settlement = {
        id: settlementId,
        tradeId: tradeData.tradeId,
        orderId: tradeData.orderId,
        userId: tradeData.userId,
        counterpartyId: tradeData.counterpartyId || 'internal',
        currencyPair: tradeData.currencyPair,
        baseCurrency: tradeData.baseCurrency,
        quoteCurrency: tradeData.quoteCurrency,
        side: tradeData.side,
        quantity: tradeData.quantity,
        price: tradeData.price,
        grossAmount: tradeData.quantity * tradeData.price,
        netAmount: null, // Will be calculated after fees
        commission: tradeData.commission || 0,
        settlementCycle,
        settlementDate: this.calculateSettlementDate(settlementCycle),
        valueDate: this.calculateValueDate(settlementCycle),
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        legs: this.createSettlementLegs(tradeData),
        metadata: {
          executionId: tradeData.executionId,
          liquidityProvider: tradeData.liquidityProvider,
          ...tradeData.metadata
        }
      };

      settlement.netAmount = settlement.grossAmount - settlement.commission;

      // Validate settlement
      await this.validateSettlement(settlement);

      // Store settlement
      this.pendingSettlements.set(settlementId, settlement);

      // Add to netting group if enabled
      if (this.config.enableNetting) {
        await this.addToNettingGroup(settlement);
      }

      // Schedule settlement processing
      await this.scheduleSettlement(settlement);

      this.emit('settlementCreated', {
        settlementId,
        tradeId: tradeData.tradeId,
        settlementDate: settlement.settlementDate,
        amount: settlement.netAmount
      });

      logger.info(`Settlement created: ${settlementId} for trade ${tradeData.tradeId} - ${settlementCycle}`);

      return {
        settlementId,
        settlementDate: settlement.settlementDate,
        valueDate: settlement.valueDate,
        status: 'pending'
      };

    } catch (error) {
      logger.error('Settlement creation error:', error);
      throw error;
    }
  }

  createSettlementLegs(tradeData) {
    const legs = [];

    if (tradeData.side === 'buy') {
      // Buy side: receive base currency, pay quote currency
      legs.push({
        id: uuidv4(),
        type: 'receive',
        currency: tradeData.baseCurrency,
        amount: tradeData.quantity,
        account: 'nostro', // Would be actual nostro account
        status: 'pending'
      });

      legs.push({
        id: uuidv4(),
        type: 'pay',
        currency: tradeData.quoteCurrency,
        amount: tradeData.quantity * tradeData.price,
        account: 'nostro',
        status: 'pending'
      });

    } else {
      // Sell side: pay base currency, receive quote currency
      legs.push({
        id: uuidv4(),
        type: 'pay',
        currency: tradeData.baseCurrency,
        amount: tradeData.quantity,
        account: 'nostro',
        status: 'pending'
      });

      legs.push({
        id: uuidv4(),
        type: 'receive',
        currency: tradeData.quoteCurrency,
        amount: tradeData.quantity * tradeData.price,
        account: 'nostro',
        status: 'pending'
      });
    }

    return legs;
  }

  // Settlement processing
  startSettlementProcessing() {
    // Process settlements every minute
    this.processingInterval = setInterval(async () => {
      try {
        await this.processScheduledSettlements();
      } catch (error) {
        logger.error('Settlement processing error:', error);
      }
    }, 60000);

    logger.info('Settlement processing started');
  }

  async processScheduledSettlements() {
    const now = new Date();
    const settlementsToProcess = [];

    // Find settlements ready for processing
    for (const [settlementId, settlement] of this.pendingSettlements) {
      if (settlement.settlementDate <= now && settlement.status === 'pending') {
        settlementsToProcess.push(settlement);
      }
    }

    if (settlementsToProcess.length === 0) return;

    logger.info(`Processing ${settlementsToProcess.length} scheduled settlements`);

    // Group settlements by currency and counterparty for netting
    const nettingGroups = this.groupSettlementsForNetting(settlementsToProcess);

    // Process each netting group
    for (const group of nettingGroups) {
      try {
        await this.processNettingGroup(group);
      } catch (error) {
        logger.error(`Error processing netting group:`, error);
        // Process settlements individually if netting fails
        for (const settlement of group.settlements) {
          try {
            await this.processIndividualSettlement(settlement);
          } catch (individualError) {
            logger.error(`Individual settlement processing failed:`, individualError);
          }
        }
      }
    }
  }

  groupSettlementsForNetting(settlements) {
    if (!this.config.enableNetting) {
      return settlements.map(settlement => ({
        id: uuidv4(),
        settlements: [settlement],
        netAmounts: new Map()
      }));
    }

    const groups = new Map();

    settlements.forEach(settlement => {
      const groupKey = `${settlement.counterpartyId}_${settlement.settlementDate.toDateString()}`;
      
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: uuidv4(),
          counterpartyId: settlement.counterpartyId,
          settlementDate: settlement.settlementDate,
          settlements: [],
          netAmounts: new Map()
        });
      }

      groups.get(groupKey).settlements.push(settlement);
    });

    // Calculate net amounts for each group
    groups.forEach(group => {
      group.settlements.forEach(settlement => {
        settlement.legs.forEach(leg => {
          const key = `${leg.currency}_${leg.type}`;
          const currentAmount = group.netAmounts.get(key) || 0;
          
          if (leg.type === 'receive') {
            group.netAmounts.set(key, currentAmount + leg.amount);
          } else {
            group.netAmounts.set(key, currentAmount - leg.amount);
          }
        });
      });
    });

    return Array.from(groups.values());
  }

  async processNettingGroup(group) {
    const batchId = uuidv4();
    const startTime = Date.now();

    try {
      // Create settlement batch
      const batch = {
        id: batchId,
        counterpartyId: group.counterpartyId,
        settlementDate: group.settlementDate,
        settlements: group.settlements.map(s => s.id),
        netAmounts: group.netAmounts,
        status: 'processing',
        createdAt: new Date(),
        processedAt: null,
        legs: []
      };

      this.settlementBatches.set(batchId, batch);

      // Create net settlement legs
      for (const [key, netAmount] of group.netAmounts) {
        if (Math.abs(netAmount) > 0.01) { // Only settle non-zero amounts
          const [currency, type] = key.split('_');
          
          const leg = {
            id: uuidv4(),
            batchId,
            currency,
            amount: Math.abs(netAmount),
            direction: netAmount > 0 ? 'receive' : 'pay',
            status: 'pending'
          };

          batch.legs.push(leg);
        }
      }

      // Process settlement legs
      for (const leg of batch.legs) {
        await this.processSettlementLeg(leg, group.counterpartyId);
      }

      // Update batch status
      batch.status = 'completed';
      batch.processedAt = new Date();

      // Update individual settlements
      for (const settlement of group.settlements) {
        settlement.status = 'settled';
        settlement.batchId = batchId;
        settlement.settledAt = new Date();
        settlement.processingTime = Date.now() - startTime;

        this.pendingSettlements.delete(settlement.id);
      }

      // Update statistics
      this.updateSettlementStats(group.settlements, true);

      this.emit('nettingGroupProcessed', {
        batchId,
        settlementCount: group.settlements.length,
        netLegs: batch.legs.length,
        processingTime: Date.now() - startTime
      });

      logger.info(`Netting group processed: ${batchId} - ${group.settlements.length} settlements, ${batch.legs.length} net legs`);

    } catch (error) {
      logger.error(`Netting group processing failed:`, error);
      throw error;
    }
  }

  async processIndividualSettlement(settlement) {
    const startTime = Date.now();

    try {
      settlement.status = 'processing';
      settlement.updatedAt = new Date();

      // Process each settlement leg
      for (const leg of settlement.legs) {
        await this.processSettlementLeg(leg, settlement.counterpartyId);
      }

      // Update settlement status
      settlement.status = 'settled';
      settlement.settledAt = new Date();
      settlement.processingTime = Date.now() - startTime;

      // Remove from pending
      this.pendingSettlements.delete(settlement.id);

      // Update statistics
      this.updateSettlementStats([settlement], true);

      this.emit('settlementProcessed', {
        settlementId: settlement.id,
        tradeId: settlement.tradeId,
        processingTime: settlement.processingTime
      });

      logger.info(`Settlement processed: ${settlement.id} in ${settlement.processingTime}ms`);

    } catch (error) {
      await this.handleSettlementFailure(settlement, error);
      throw error;
    }
  }

  async processSettlementLeg(leg, counterpartyId) {
    try {
      leg.status = 'processing';

      if (leg.direction === 'pay') {
        // Outgoing payment
        await this.processOutgoingPayment(leg, counterpartyId);
      } else {
        // Incoming payment (receive)
        await this.processIncomingPayment(leg, counterpartyId);
      }

      leg.status = 'completed';
      leg.processedAt = new Date();

    } catch (error) {
      leg.status = 'failed';
      leg.error = error.message;
      leg.failedAt = new Date();
      throw error;
    }
  }

  async processOutgoingPayment(leg, counterpartyId) {
    // Check nostro account balance
    const nostroBalance = await this.nostroManager.getBalance(leg.currency);
    
    if (nostroBalance < leg.amount) {
      throw new Error(`Insufficient nostro balance for ${leg.currency}: ${nostroBalance} < ${leg.amount}`);
    }

    // Create payment instruction
    const paymentInstruction = {
      id: uuidv4(),
      legId: leg.id,
      currency: leg.currency,
      amount: leg.amount,
      counterpartyId,
      paymentMethod: this.selectPaymentMethod(leg.currency, leg.amount),
      priority: this.determinePaymentPriority(leg.amount),
      valueDate: new Date()
    };

    // Send payment
    const paymentResult = await this.paymentSystem.sendPayment(paymentInstruction);
    
    if (!paymentResult.success) {
      throw new Error(`Payment failed: ${paymentResult.error}`);
    }

    // Update nostro account
    await this.nostroManager.debitAccount(leg.currency, leg.amount, {
      legId: leg.id,
      paymentId: paymentResult.paymentId,
      counterpartyId
    });

    leg.paymentId = paymentResult.paymentId;
    leg.paymentReference = paymentResult.reference;
  }

  async processIncomingPayment(leg, counterpartyId) {
    // For incoming payments, we typically wait for confirmation
    // This is a simplified implementation
    
    // Check if payment has been received
    const paymentStatus = await this.paymentSystem.checkIncomingPayment({
      currency: leg.currency,
      amount: leg.amount,
      counterpartyId,
      expectedDate: new Date()
    });

    if (paymentStatus.received) {
      // Credit nostro account
      await this.nostroManager.creditAccount(leg.currency, leg.amount, {
        legId: leg.id,
        paymentId: paymentStatus.paymentId,
        counterpartyId
      });

      leg.paymentId = paymentStatus.paymentId;
      leg.paymentReference = paymentStatus.reference;
    } else {
      // Schedule for retry
      throw new Error('Incoming payment not yet received');
    }
  }

  // Settlement failure handling
  async handleSettlementFailure(settlement, error) {
    settlement.status = 'failed';
    settlement.error = error.message;
    settlement.failedAt = new Date();

    // Store failure information
    this.failedSettlements.set(settlement.id, {
      settlement: { ...settlement },
      error: error.message,
      failureTime: new Date(),
      retryCount: 0
    });

    // Schedule retry if within limits
    const failureInfo = this.failedSettlements.get(settlement.id);
    if (failureInfo.retryCount < this.config.retryAttempts) {
      setTimeout(async () => {
        try {
          failureInfo.retryCount++;
          await this.retrySettlement(settlement.id);
        } catch (retryError) {
          logger.error(`Settlement retry failed:`, retryError);
        }
      }, this.config.retryDelay * (failureInfo.retryCount + 1));
    }

    // Update statistics
    this.updateSettlementStats([settlement], false);

    this.emit('settlementFailed', {
      settlementId: settlement.id,
      tradeId: settlement.tradeId,
      error: error.message,
      retryScheduled: failureInfo.retryCount < this.config.retryAttempts
    });

    logger.error(`Settlement failed: ${settlement.id} - ${error.message}`);
  }

  async retrySettlement(settlementId) {
    const failureInfo = this.failedSettlements.get(settlementId);
    if (!failureInfo) return;

    const settlement = failureInfo.settlement;
    
    try {
      // Reset settlement status
      settlement.status = 'pending';
      settlement.error = null;
      settlement.failedAt = null;
      settlement.updatedAt = new Date();

      // Add back to pending settlements
      this.pendingSettlements.set(settlementId, settlement);

      // Remove from failed settlements
      this.failedSettlements.delete(settlementId);

      logger.info(`Settlement retry scheduled: ${settlementId} (attempt ${failureInfo.retryCount})`);

    } catch (error) {
      logger.error(`Settlement retry setup failed:`, error);
    }
  }

  // Utility methods
  determineSettlementCycle(tradeData) {
    // Simple logic - would be more complex in reality
    if (tradeData.settlementCycle) {
      return tradeData.settlementCycle;
    }

    // Default based on currency pair
    const [baseCurrency, quoteCurrency] = tradeData.currencyPair.split('/');
    
    if (baseCurrency === 'USD' && quoteCurrency === 'CAD') {
      return 'T+1'; // USD/CAD settles T+1
    }
    
    return this.config.defaultSettlementCycle;
  }

  calculateSettlementDate(cycle) {
    const now = new Date();
    const days = parseInt(cycle.substring(2)) || 0;
    
    const settlementDate = new Date(now);
    settlementDate.setDate(now.getDate() + days);
    
    // Skip weekends (simplified)
    while (settlementDate.getDay() === 0 || settlementDate.getDay() === 6) {
      settlementDate.setDate(settlementDate.getDate() + 1);
    }
    
    return settlementDate;
  }

  calculateValueDate(cycle) {
    // Value date is typically the same as settlement date for FX
    return this.calculateSettlementDate(cycle);
  }

  calculateNextSettlementDate(cycle) {
    const now = new Date();
    const cutoffTime = this.config.settlementCutoffTimes[cycle];
    const [hours, minutes] = cutoffTime.split(':').map(Number);
    
    const nextSettlement = new Date(now);
    nextSettlement.setHours(hours, minutes, 0, 0);
    
    // If past cutoff time, move to next business day
    if (now > nextSettlement) {
      nextSettlement.setDate(nextSettlement.getDate() + 1);
    }
    
    return nextSettlement;
  }

  selectPaymentMethod(currency, amount) {
    // Simple payment method selection
    if (amount > 1000000) {
      return 'SWIFT_WIRE';
    } else if (['USD', 'EUR', 'GBP'].includes(currency)) {
      return 'RTGS';
    } else {
      return 'CORRESPONDENT_BANK';
    }
  }

  determinePaymentPriority(amount) {
    if (amount > 10000000) {
      return 'HIGH';
    } else if (amount > 1000000) {
      return 'NORMAL';
    } else {
      return 'LOW';
    }
  }

  async validateSettlement(settlement) {
    // Basic validation
    if (settlement.quantity <= 0) {
      throw new Error('Settlement quantity must be positive');
    }

    if (settlement.price <= 0) {
      throw new Error('Settlement price must be positive');
    }

    if (settlement.netAmount > this.config.maxSettlementAmount) {
      throw new Error(`Settlement amount exceeds maximum: ${this.config.maxSettlementAmount}`);
    }

    // Compliance checks
    if (this.complianceEngine) {
      const complianceResult = await this.complianceEngine.checkSettlement(settlement);
      if (!complianceResult.approved) {
        throw new Error(`Settlement rejected by compliance: ${complianceResult.reason}`);
      }
    }
  }

  async scheduleSettlement(settlement) {
    // Add to appropriate processing queue based on settlement date
    const delay = settlement.settlementDate.getTime() - Date.now();
    
    if (delay > 0) {
      setTimeout(() => {
        // Settlement will be picked up by the regular processing cycle
        logger.debug(`Settlement ${settlement.id} ready for processing`);
      }, delay);
    }
  }

  async addToNettingGroup(settlement) {
    const groupKey = `${settlement.counterpartyId}_${settlement.settlementDate.toDateString()}`;
    
    if (!this.nettingGroups.has(groupKey)) {
      this.nettingGroups.set(groupKey, {
        id: uuidv4(),
        counterpartyId: settlement.counterpartyId,
        settlementDate: settlement.settlementDate,
        settlements: [],
        netAmounts: new Map()
      });
    }

    const group = this.nettingGroups.get(groupKey);
    group.settlements.push(settlement.id);
  }

  // Statistics
  updateSettlementStats(settlements, success) {
    settlements.forEach(settlement => {
      this.stats.totalSettlements++;
      
      if (success) {
        this.stats.successfulSettlements++;
        
        // Update volume stats
        const currencyPair = settlement.currencyPair;
        if (!this.stats.totalVolume.has(currencyPair)) {
          this.stats.totalVolume.set(currencyPair, 0);
        }
        this.stats.totalVolume.set(currencyPair, 
          this.stats.totalVolume.get(currencyPair) + settlement.netAmount);

        // Update average settlement time
        if (settlement.processingTime) {
          const totalTime = this.stats.averageSettlementTime * (this.stats.successfulSettlements - 1) + settlement.processingTime;
          this.stats.averageSettlementTime = totalTime / this.stats.successfulSettlements;
        }

        // Update settlement type stats
        const cycle = settlement.settlementCycle;
        if (!this.stats.settlementsByType.has(cycle)) {
          this.stats.settlementsByType.set(cycle, 0);
        }
        this.stats.settlementsByType.set(cycle, this.stats.settlementsByType.get(cycle) + 1);

      } else {
        this.stats.failedSettlements++;
      }
    });

    // Calculate netting efficiency
    const totalBatches = this.settlementBatches.size;
    const totalIndividualSettlements = this.stats.totalSettlements;
    if (totalIndividualSettlements > 0) {
      this.stats.nettingEfficiency = ((totalIndividualSettlements - totalBatches) / totalIndividualSettlements) * 100;
    }
  }

  // Query methods
  getSettlement(settlementId) {
    return this.pendingSettlements.get(settlementId) || 
           this.failedSettlements.get(settlementId)?.settlement || 
           null;
  }

  getSettlementBatch(batchId) {
    return this.settlementBatches.get(batchId) || null;
  }

  getPendingSettlements(filters = {}) {
    let settlements = Array.from(this.pendingSettlements.values());

    if (filters.currency) {
      settlements = settlements.filter(s => 
        s.baseCurrency === filters.currency || s.quoteCurrency === filters.currency);
    }

    if (filters.settlementDate) {
      settlements = settlements.filter(s => 
        s.settlementDate.toDateString() === filters.settlementDate.toDateString());
    }

    if (filters.counterpartyId) {
      settlements = settlements.filter(s => s.counterpartyId === filters.counterpartyId);
    }

    return settlements;
  }

  getSettlementStatistics() {
    return {
      ...this.stats,
      totalVolume: Object.fromEntries(this.stats.totalVolume),
      settlementsByType: Object.fromEntries(this.stats.settlementsByType),
      providerStats: Object.fromEntries(this.stats.providerStats || new Map()),
      pendingSettlements: this.pendingSettlements.size,
      failedSettlements: this.failedSettlements.size,
      settlementBatches: this.settlementBatches.size,
      successRate: this.stats.totalSettlements > 0 ? 
        (this.stats.successfulSettlements / this.stats.totalSettlements) * 100 : 0
    };
  }

  // Health check
  async healthCheck() {
    const health = {
      status: 'healthy',
      pendingSettlements: this.pendingSettlements.size,
      failedSettlements: this.failedSettlements.size,
      settlementBatches: this.settlementBatches.size,
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

    if (this.paymentSystem) {
      health.dependencies.paymentSystem = 'connected';
    } else {
      health.dependencies.paymentSystem = 'missing';
      health.errors.push('Payment system not configured');
    }

    if (this.nostroManager) {
      health.dependencies.nostroManager = 'connected';
    } else {
      health.dependencies.nostroManager = 'missing';
      health.errors.push('Nostro manager not configured');
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
    // Stop processing
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Clear processing timers
    this.processingTimers.forEach(timer => clearTimeout(timer));
    this.processingTimers.clear();

    // Log pending settlements
    if (this.pendingSettlements.size > 0) {
      logger.warn(`${this.pendingSettlements.size} settlements still pending during cleanup`);
    }

    logger.info('FX Settlement Engine cleaned up');
  }
}

module.exports = FXSettlementEngine;