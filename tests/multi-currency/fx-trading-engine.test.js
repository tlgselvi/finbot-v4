/**
 * FX Trading Engine Test Suite
 * Comprehensive tests for order management, execution, settlement, and analytics
 */

const { describe, it, beforeEach, afterEach, expect, jest } = require('@jest/globals');
const FXOrderManager = require('../../src/multi-currency/trading/fx-order-manager');
const FXExecutionEngine = require('../../src/multi-currency/trading/fx-execution-engine');
const FXSettlementEngine = require('../../src/multi-currency/trading/fx-settlement-engine');
const FXAnalyticsEngine = require('../../src/multi-currency/trading/fx-analytics-engine');

// Mock dependencies
const mockAccountManager = {
  getAccount: jest.fn(),
  getUserAccount: jest.fn(),
  reserveBalance: jest.fn(),
  releaseReservation: jest.fn(),
  debitAccount: jest.fn(),
  creditAccount: jest.fn()
};

const mockRateProvider = {
  getRate: jest.fn(),
  getLatestRates: jest.fn()
};

const mockRiskEngine = {
  assessOrderRisk: jest.fn()
};

const mockComplianceEngine = {
  checkOrderCompliance: jest.fn(),
  checkSettlement: jest.fn()
};

const mockPaymentSystem = {
  sendPayment: jest.fn(),
  checkIncomingPayment: jest.fn()
};

const mockNostroManager = {
  getBalance: jest.fn(),
  debitAccount: jest.fn(),
  creditAccount: jest.fn()
};

describe('FX Trading Engine', () => {
  let orderManager;
  let executionEngine;
  let settlementEngine;
  let analyticsEngine;

  beforeEach(() => {
    // Initialize components
    orderManager = new FXOrderManager({
      maxOrderSize: 10000000,
      minOrderSize: 100,
      enableRiskChecks: true,
      enablePreTradeCompliance: true
    });

    executionEngine = new FXExecutionEngine({
      enableSmartRouting: true,
      maxSlippage: 0.005
    });

    settlementEngine = new FXSettlementEngine({
      enableNetting: true,
      defaultSettlementCycle: 'T+2'
    });

    analyticsEngine = new FXAnalyticsEngine({
      enableRealTimePnL: true,
      baseCurrency: 'USD'
    });

    // Set up dependencies
    orderManager.accountManager = mockAccountManager;
    orderManager.riskEngine = mockRiskEngine;
    orderManager.complianceEngine = mockComplianceEngine;

    executionEngine.initialize({
      orderManager,
      rateProvider: mockRateProvider,
      liquidityProviders: {}
    });

    settlementEngine.initialize({
      accountManager: mockAccountManager,
      paymentSystem: mockPaymentSystem,
      nostroManager: mockNostroManager,
      complianceEngine: mockComplianceEngine
    });

    analyticsEngine.initialize({
      rateProvider: mockRateProvider,
      orderManager,
      settlementEngine,
      accountManager: mockAccountManager
    });

    // Clear all mocks
    jest.clearAllMocks();
  }); 
 afterEach(async () => {
    await orderManager.cleanup();
    await executionEngine.cleanup();
    await settlementEngine.cleanup();
    await analyticsEngine.cleanup();
  });

  describe('FX Order Manager', () => {
    beforeEach(() => {
      // Mock successful account operations
      mockAccountManager.getUserAccount.mockResolvedValue({
        id: 'account1',
        userId: 'user1',
        currency: 'USD',
        balance: 100000,
        availableBalance: 100000,
        isActive: true
      });

      mockAccountManager.reserveBalance.mockResolvedValue(true);
      mockRiskEngine.assessOrderRisk.mockResolvedValue({ approved: true });
      mockComplianceEngine.checkOrderCompliance.mockResolvedValue({ approved: true });
    });

    describe('Order Creation', () => {
      it('should create market order successfully', async () => {
        const orderData = {
          orderType: 'market',
          currencyPair: 'EUR/USD',
          side: 'buy',
          quantity: 10000,
          timeInForce: 'IOC'
        };

        const result = await orderManager.createOrder('user1', orderData);

        expect(result.success).toBe(true);
        expect(result.orderId).toBeDefined();
        expect(result.order.status).toBe('submitted');
        expect(mockAccountManager.reserveBalance).toHaveBeenCalled();
      });

      it('should create limit order successfully', async () => {
        const orderData = {
          orderType: 'limit',
          currencyPair: 'EUR/USD',
          side: 'sell',
          quantity: 5000,
          price: 1.1000,
          timeInForce: 'GTC'
        };

        const result = await orderManager.createOrder('user1', orderData);

        expect(result.success).toBe(true);
        expect(result.order.price).toBe(1.1000);
        expect(result.order.orderType).toBe('limit');
      });

      it('should validate order parameters', async () => {
        const invalidOrderData = {
          orderType: 'invalid_type',
          currencyPair: 'EUR/USD',
          side: 'buy',
          quantity: 10000
        };

        await expect(orderManager.createOrder('user1', invalidOrderData))
          .rejects.toThrow('Unsupported order type');
      });

      it('should enforce order size limits', async () => {
        const oversizedOrder = {
          orderType: 'market',
          currencyPair: 'EUR/USD',
          side: 'buy',
          quantity: 20000000 // Above max limit
        };

        await expect(orderManager.createOrder('user1', oversizedOrder))
          .rejects.toThrow('Order size above maximum');
      });

      it('should perform risk checks', async () => {
        mockRiskEngine.assessOrderRisk.mockResolvedValue({
          approved: false,
          reason: 'Exceeds risk limits'
        });

        const orderData = {
          orderType: 'market',
          currencyPair: 'EUR/USD',
          side: 'buy',
          quantity: 10000
        };

        await expect(orderManager.createOrder('user1', orderData))
          .rejects.toThrow('Order rejected by risk engine');
      });
    });

    describe('Order Management', () => {
      let orderId;

      beforeEach(async () => {
        const orderData = {
          orderType: 'limit',
          currencyPair: 'EUR/USD',
          side: 'buy',
          quantity: 10000,
          price: 1.0950,
          timeInForce: 'GTC'
        };

        const result = await orderManager.createOrder('user1', orderData);
        orderId = result.orderId;
      });

      it('should cancel order successfully', async () => {
        const result = await orderManager.cancelOrder(orderId, 'user1');

        expect(result.success).toBe(true);
        expect(result.cancelledQuantity).toBe(10000);

        const order = orderManager.getOrder(orderId);
        expect(order.status).toBe('cancelled');
      });

      it('should modify order successfully', async () => {
        const modifications = {
          quantity: 15000,
          price: 1.0960
        };

        const result = await orderManager.modifyOrder(orderId, 'user1', modifications);

        expect(result.success).toBe(true);
        expect(result.updatedOrder.quantity).toBe(15000);
        expect(result.updatedOrder.price).toBe(1.0960);
      });

      it('should prevent unauthorized access', async () => {
        await expect(orderManager.cancelOrder(orderId, 'user2'))
          .rejects.toThrow('Bu emre erişim yetkiniz yok');
      });
    });

    describe('Order Book Management', () => {
      beforeEach(async () => {
        // Create multiple orders
        const orders = [
          { orderType: 'limit', currencyPair: 'EUR/USD', side: 'buy', quantity: 5000, price: 1.0950 },
          { orderType: 'limit', currencyPair: 'EUR/USD', side: 'buy', quantity: 3000, price: 1.0940 },
          { orderType: 'limit', currencyPair: 'EUR/USD', side: 'sell', quantity: 4000, price: 1.0970 },
          { orderType: 'limit', currencyPair: 'EUR/USD', side: 'sell', quantity: 6000, price: 1.0980 }
        ];

        for (const orderData of orders) {
          await orderManager.createOrder('user1', orderData);
        }
      });

      it('should maintain sorted order book', () => {
        const orderBook = orderManager.getOrderBook('EUR/USD');

        expect(orderBook.buy).toHaveLength(2);
        expect(orderBook.sell).toHaveLength(2);

        // Buy orders should be sorted by price descending
        expect(orderBook.buy[0].price).toBeGreaterThan(orderBook.buy[1].price);

        // Sell orders should be sorted by price ascending
        expect(orderBook.sell[0].price).toBeLessThan(orderBook.sell[1].price);
      });

      it('should return order book with specified depth', () => {
        const orderBook = orderManager.getOrderBook('EUR/USD', 1);

        expect(orderBook.buy).toHaveLength(1);
        expect(orderBook.sell).toHaveLength(1);
      });
    });
  });  de
scribe('FX Execution Engine', () => {
    beforeEach(() => {
      mockRateProvider.getRate.mockResolvedValue({
        rate: 1.1000,
        bid: 1.0999,
        ask: 1.1001,
        spread: 0.0002,
        timestamp: new Date()
      });
    });

    describe('Order Execution', () => {
      it('should execute market order successfully', async () => {
        const order = {
          id: 'order1',
          userId: 'user1',
          orderType: 'market',
          currencyPair: 'EUR/USD',
          side: 'buy',
          quantity: 10000,
          remainingQuantity: 10000,
          status: 'submitted'
        };

        const result = await executionEngine.executeOrder(order);

        expect(result.executionId).toBeDefined();
        expect(result.status).toBe('pending');
      });

      it('should select optimal execution algorithm', () => {
        const marketOrder = { orderType: 'market', quantity: 500000 };
        const limitOrder = { orderType: 'limit', quantity: 100000 };

        expect(executionEngine.selectOptimalAlgorithm(marketOrder)).toBe('TWAP');
        expect(executionEngine.selectOptimalAlgorithm(limitOrder)).toBe('POV');
      });

      it('should validate execution parameters', () => {
        const provider = { id: 'test_provider' };
        const order = { currencyPair: 'EUR/USD' };

        expect(() => {
          executionEngine.validateExecution(provider, order, -100, 1.1000);
        }).toThrow('Quantity must be positive');

        expect(() => {
          executionEngine.validateExecution(provider, order, 100, -1.1000);
        }).toThrow('Target price must be positive');
      });
    });

    describe('Liquidity Provider Selection', () => {
      it('should select best liquidity provider', async () => {
        // Mock multiple provider quotes
        jest.spyOn(executionEngine, 'getProviderQuotes').mockResolvedValue([
          { providerId: 'provider1', price: 1.1000, spread: 0.0001 },
          { providerId: 'provider2', price: 1.1002, spread: 0.0002 },
          { providerId: 'provider3', price: 1.0999, spread: 0.0001 }
        ]);

        const provider = await executionEngine.selectLiquidityProvider('EUR/USD', 10000);

        expect(provider).toBeDefined();
        expect(provider.id).toBeDefined();
      });

      it('should handle provider unavailability', async () => {
        jest.spyOn(executionEngine, 'getProviderQuotes').mockResolvedValue([]);

        await expect(executionEngine.selectLiquidityProvider('EUR/USD', 10000))
          .rejects.toThrow('No liquidity providers available');
      });
    });

    describe('Execution Algorithms', () => {
      it('should execute TWAP algorithm', async () => {
        const algorithm = executionEngine.algorithms.TWAP;
        const executionContext = {
          remainingQuantity: 100000,
          options: { timeLimit: 60000 },
          startTime: Date.now()
        };

        const slice = await algorithm.getNextSlice(executionContext);

        expect(slice).toBeDefined();
        expect(slice.quantity).toBeGreaterThan(0);
        expect(slice.urgency).toBe('low');
      });

      it('should execute VWAP algorithm', async () => {
        const algorithm = executionEngine.algorithms.VWAP;
        const executionContext = {
          remainingQuantity: 50000
        };

        const slice = await algorithm.getNextSlice(executionContext);

        expect(slice).toBeDefined();
        expect(slice.quantity).toBe(5000); // 10% of remaining
        expect(slice.urgency).toBe('normal');
      });
    });
  });  describ
e('FX Settlement Engine', () => {
    beforeEach(() => {
      mockNostroManager.getBalance.mockResolvedValue(1000000);
      mockPaymentSystem.sendPayment.mockResolvedValue({
        success: true,
        paymentId: 'payment1',
        reference: 'REF123'
      });
      mockPaymentSystem.checkIncomingPayment.mockResolvedValue({
        received: true,
        paymentId: 'payment2',
        reference: 'REF456'
      });
      mockComplianceEngine.checkSettlement.mockResolvedValue({ approved: true });
    });

    describe('Settlement Creation', () => {
      it('should create settlement successfully', async () => {
        const tradeData = {
          tradeId: 'trade1',
          orderId: 'order1',
          userId: 'user1',
          currencyPair: 'EUR/USD',
          baseCurrency: 'EUR',
          quoteCurrency: 'USD',
          side: 'buy',
          quantity: 10000,
          price: 1.1000,
          commission: 11
        };

        const result = await settlementEngine.createSettlement(tradeData);

        expect(result.settlementId).toBeDefined();
        expect(result.settlementDate).toBeDefined();
        expect(result.status).toBe('pending');
      });

      it('should determine correct settlement cycle', () => {
        const usdCadTrade = {
          currencyPair: 'USD/CAD',
          baseCurrency: 'USD',
          quoteCurrency: 'CAD'
        };

        const eurUsdTrade = {
          currencyPair: 'EUR/USD',
          baseCurrency: 'EUR',
          quoteCurrency: 'USD'
        };

        expect(settlementEngine.determineSettlementCycle(usdCadTrade)).toBe('T+1');
        expect(settlementEngine.determineSettlementCycle(eurUsdTrade)).toBe('T+2');
      });

      it('should create correct settlement legs', () => {
        const buyTrade = {
          side: 'buy',
          baseCurrency: 'EUR',
          quoteCurrency: 'USD',
          quantity: 10000,
          price: 1.1000
        };

        const legs = settlementEngine.createSettlementLegs(buyTrade);

        expect(legs).toHaveLength(2);
        expect(legs[0].type).toBe('receive');
        expect(legs[0].currency).toBe('EUR');
        expect(legs[1].type).toBe('pay');
        expect(legs[1].currency).toBe('USD');
      });
    });

    describe('Settlement Processing', () => {
      it('should process individual settlement', async () => {
        const settlement = {
          id: 'settlement1',
          tradeId: 'trade1',
          userId: 'user1',
          counterpartyId: 'bank1',
          status: 'pending',
          legs: [
            {
              id: 'leg1',
              type: 'pay',
              currency: 'EUR',
              amount: 10000,
              status: 'pending'
            },
            {
              id: 'leg2',
              type: 'receive',
              currency: 'USD',
              amount: 11000,
              status: 'pending'
            }
          ]
        };

        await settlementEngine.processIndividualSettlement(settlement);

        expect(settlement.status).toBe('settled');
        expect(settlement.settledAt).toBeDefined();
        expect(mockPaymentSystem.sendPayment).toHaveBeenCalled();
      });

      it('should handle netting groups', async () => {
        const settlements = [
          {
            id: 'settlement1',
            counterpartyId: 'bank1',
            settlementDate: new Date(),
            legs: [
              { currency: 'EUR', type: 'pay', amount: 10000 },
              { currency: 'USD', type: 'receive', amount: 11000 }
            ]
          },
          {
            id: 'settlement2',
            counterpartyId: 'bank1',
            settlementDate: new Date(),
            legs: [
              { currency: 'EUR', type: 'receive', amount: 5000 },
              { currency: 'USD', type: 'pay', amount: 5500 }
            ]
          }
        ];

        const groups = settlementEngine.groupSettlementsForNetting(settlements);

        expect(groups).toHaveLength(1);
        expect(groups[0].settlements).toHaveLength(2);
        expect(groups[0].netAmounts.get('EUR_pay')).toBe(-5000); // Net 5000 EUR to pay
      });

      it('should handle settlement failures with retry', async () => {
        mockPaymentSystem.sendPayment.mockRejectedValue(new Error('Payment failed'));

        const settlement = {
          id: 'settlement1',
          status: 'pending',
          legs: [{ id: 'leg1', type: 'pay', currency: 'EUR', amount: 10000 }]
        };

        await expect(settlementEngine.processIndividualSettlement(settlement))
          .rejects.toThrow('Payment failed');

        expect(settlement.status).toBe('failed');
        expect(settlementEngine.failedSettlements.has('settlement1')).toBe(true);
      });
    });

    describe('Settlement Validation', () => {
      it('should validate settlement parameters', async () => {
        const invalidSettlement = {
          quantity: -100,
          price: 1.1000,
          netAmount: 50000
        };

        await expect(settlementEngine.validateSettlement(invalidSettlement))
          .rejects.toThrow('Settlement quantity must be positive');
      });

      it('should enforce settlement limits', async () => {
        const oversizedSettlement = {
          quantity: 1000,
          price: 1.1000,
          netAmount: 200000000 // Above max limit
        };

        await expect(settlementEngine.validateSettlement(oversizedSettlement))
          .rejects.toThrow('Settlement amount exceeds maximum');
      });
    });
  });  
describe('FX Analytics Engine', () => {
    beforeEach(() => {
      mockRateProvider.getRate.mockResolvedValue({
        rate: 1.1000,
        bid: 1.0999,
        ask: 1.1001,
        timestamp: new Date()
      });
    });

    describe('P&L Calculation', () => {
      it('should calculate position P&L correctly', async () => {
        const position = {
          quantity: 10000,
          averagePrice: 1.0950,
          realizedPnL: 0
        };

        const positionPnL = await analyticsEngine.calculatePositionPnL(position, 'EUR/USD');

        expect(positionPnL.unrealized).toBeCloseTo(500, 0); // (1.1000 - 1.0950) * 10000
        expect(positionPnL.priceChangePercent).toBeCloseTo(4.57, 1);
      });

      it('should update positions from trade executions', async () => {
        const executionData = {
          orderId: 'order1',
          executionId: 'exec1',
          execution: {
            id: 'exec1',
            executionQuantity: 5000,
            executionPrice: 1.1000,
            executionTime: new Date(),
            side: 'buy'
          }
        };

        // Mock order
        orderManager.getOrder = jest.fn().mockReturnValue({
          userId: 'user1',
          currencyPair: 'EUR/USD',
          side: 'buy'
        });

        await analyticsEngine.handleOrderExecution(executionData);

        const userPositions = analyticsEngine.getUserPositions('user1');
        expect(userPositions.has('EUR/USD')).toBe(true);

        const position = userPositions.get('EUR/USD');
        expect(position.quantity).toBe(5000);
        expect(position.averagePrice).toBe(1.1000);
      });

      it('should calculate currency exposure', async () => {
        // Set up positions
        analyticsEngine.positions.set('user1', new Map([
          ['EUR/USD', { quantity: 10000, averagePrice: 1.1000 }],
          ['GBP/USD', { quantity: -5000, averagePrice: 1.3000 }]
        ]));

        const pnlData = {
          userId: 'user1',
          currencyExposure: new Map()
        };

        await analyticsEngine.calculateCurrencyExposure('user1', pnlData);

        expect(pnlData.currencyExposure.has('EUR')).toBe(true);
        expect(pnlData.currencyExposure.has('GBP')).toBe(true);
        expect(pnlData.currencyExposure.has('USD')).toBe(true);
      });
    });

    describe('Performance Metrics', () => {
      it('should calculate win rate correctly', () => {
        const trades = [
          { pnl: 100 },
          { pnl: -50 },
          { pnl: 200 },
          { pnl: -30 },
          { pnl: 150 }
        ];

        const winRate = analyticsEngine.calculateWinRate(trades);
        expect(winRate).toBe(60); // 3 out of 5 trades are winners
      });

      it('should calculate profit factor correctly', () => {
        const trades = [
          { pnl: 100 },
          { pnl: -50 },
          { pnl: 200 },
          { pnl: -30 }
        ];

        const profitFactor = analyticsEngine.calculateProfitFactor(trades);
        expect(profitFactor).toBeCloseTo(3.75, 2); // 300 / 80
      });

      it('should calculate average win and loss', () => {
        const trades = [
          { pnl: 100 },
          { pnl: -50 },
          { pnl: 200 },
          { pnl: -30 }
        ];

        const avgWin = analyticsEngine.calculateAverageWin(trades);
        const avgLoss = analyticsEngine.calculateAverageLoss(trades);

        expect(avgWin).toBe(150); // (100 + 200) / 2
        expect(avgLoss).toBe(-40); // (-50 + -30) / 2
      });
    });

    describe('Risk Metrics', () => {
      it('should calculate concentration risk', () => {
        const positions = new Map([
          ['EUR/USD', { quantity: 10000, averagePrice: 1.1000 }],
          ['GBP/USD', { quantity: 5000, averagePrice: 1.3000 }],
          ['USD/JPY', { quantity: 2000, averagePrice: 110.00 }]
        ]);

        const concentrationRisk = analyticsEngine.calculateConcentrationRisk(positions);
        expect(concentrationRisk).toBeGreaterThan(0);
        expect(concentrationRisk).toBeLessThan(1);
      });

      it('should calculate leverage ratio', () => {
        const positions = new Map([
          ['EUR/USD', { quantity: 10000, averagePrice: 1.1000 }],
          ['GBP/USD', { quantity: 5000, averagePrice: 1.3000 }]
        ]);

        const leverage = analyticsEngine.calculateLeverageRatio(positions);
        expect(leverage).toBe(17500); // 11000 + 6500
      });
    });

    describe('Reporting', () => {
      it('should generate daily report', async () => {
        // Set up test data
        analyticsEngine.pnlData.set('user1', {
          userId: 'user1',
          totalPnL: 500,
          realizedPnL: 300,
          unrealizedPnL: 200
        });

        const report = await analyticsEngine.generateDailyReport();

        expect(report.id).toBeDefined();
        expect(report.type).toBe('daily');
        expect(report.summary.activeUsers).toBe(1);
        expect(report.userReports.has('user1')).toBe(true);
      });

      it('should generate user report', async () => {
        analyticsEngine.pnlData.set('user1', {
          totalPnL: 500,
          realizedPnL: 300,
          unrealizedPnL: 200
        });

        analyticsEngine.tradeAnalytics.set('trade1', {
          userId: 'user1',
          quantity: 1000,
          price: 1.1000,
          pnl: 100,
          timestamp: new Date()
        });

        const userReport = await analyticsEngine.generateUserReport('user1', new Date());

        expect(userReport.userId).toBe('user1');
        expect(userReport.totalPnL).toBe(500);
        expect(userReport.tradeCount).toBe(1);
        expect(userReport.volume).toBe(1100);
      });
    });
  });  describe(
'Integration Tests', () => {
    it('should handle complete trading workflow', async () => {
      // 1. Create order
      const orderData = {
        orderType: 'market',
        currencyPair: 'EUR/USD',
        side: 'buy',
        quantity: 10000,
        timeInForce: 'IOC'
      };

      const orderResult = await orderManager.createOrder('user1', orderData);
      expect(orderResult.success).toBe(true);

      const order = orderManager.getOrder(orderResult.orderId);

      // 2. Execute order
      const executionResult = await executionEngine.executeOrder(order);
      expect(executionResult.executionId).toBeDefined();

      // 3. Simulate execution completion
      const executionData = {
        orderId: order.id,
        executionId: executionResult.executionId,
        execution: {
          id: executionResult.executionId,
          executionQuantity: 10000,
          executionPrice: 1.1000,
          executionTime: new Date(),
          commission: 11
        }
      };

      await orderManager.executeOrder(order.id, {
        executionPrice: 1.1000,
        executionQuantity: 10000,
        executionTime: new Date(),
        liquidityProvider: 'test_provider',
        executionId: executionResult.executionId
      });

      // 4. Create settlement
      const tradeData = {
        tradeId: executionResult.executionId,
        orderId: order.id,
        userId: 'user1',
        currencyPair: 'EUR/USD',
        baseCurrency: 'EUR',
        quoteCurrency: 'USD',
        side: 'buy',
        quantity: 10000,
        price: 1.1000,
        commission: 11,
        executionId: executionResult.executionId
      };

      const settlementResult = await settlementEngine.createSettlement(tradeData);
      expect(settlementResult.settlementId).toBeDefined();

      // 5. Update analytics
      await analyticsEngine.handleOrderExecution(executionData);

      // Verify analytics were updated
      const userPositions = analyticsEngine.getUserPositions('user1');
      expect(userPositions.has('EUR/USD')).toBe(true);

      const position = userPositions.get('EUR/USD');
      expect(position.quantity).toBe(10000);
      expect(position.averagePrice).toBe(1.1000);
    });

    it('should handle order cancellation workflow', async () => {
      // Create limit order
      const orderData = {
        orderType: 'limit',
        currencyPair: 'EUR/USD',
        side: 'buy',
        quantity: 10000,
        price: 1.0950,
        timeInForce: 'GTC'
      };

      const orderResult = await orderManager.createOrder('user1', orderData);
      const orderId = orderResult.orderId;

      // Verify order is in order book
      const orderBook = orderManager.getOrderBook('EUR/USD');
      expect(orderBook.buy.some(o => o.price === 1.0950)).toBe(true);

      // Cancel order
      const cancelResult = await orderManager.cancelOrder(orderId, 'user1');
      expect(cancelResult.success).toBe(true);

      // Verify order is removed from order book
      const updatedOrderBook = orderManager.getOrderBook('EUR/USD');
      expect(updatedOrderBook.buy.some(o => o.price === 1.0950)).toBe(false);

      // Verify balance reservation is released
      expect(mockAccountManager.releaseReservation).toHaveBeenCalled();
    });

    it('should handle partial fill scenario', async () => {
      // Create large order
      const orderData = {
        orderType: 'market',
        currencyPair: 'EUR/USD',
        side: 'buy',
        quantity: 50000,
        timeInForce: 'IOC'
      };

      const orderResult = await orderManager.createOrder('user1', orderData);
      const order = orderManager.getOrder(orderResult.orderId);

      // Execute partial fill
      await orderManager.executeOrder(order.id, {
        executionPrice: 1.1000,
        executionQuantity: 30000, // Partial fill
        executionTime: new Date(),
        liquidityProvider: 'test_provider',
        executionId: 'exec1'
      });

      const updatedOrder = orderManager.getOrder(order.id);
      expect(updatedOrder.status).toBe('partial_filled');
      expect(updatedOrder.filledQuantity).toBe(30000);
      expect(updatedOrder.remainingQuantity).toBe(20000);

      // Execute remaining quantity
      await orderManager.executeOrder(order.id, {
        executionPrice: 1.1005,
        executionQuantity: 20000,
        executionTime: new Date(),
        liquidityProvider: 'test_provider',
        executionId: 'exec2'
      });

      const finalOrder = orderManager.getOrder(order.id);
      expect(finalOrder.status).toBe('filled');
      expect(finalOrder.filledQuantity).toBe(50000);
      expect(finalOrder.remainingQuantity).toBe(0);

      // Check average fill price
      const expectedAvgPrice = (30000 * 1.1000 + 20000 * 1.1005) / 50000;
      expect(finalOrder.averageFillPrice).toBeCloseTo(expectedAvgPrice, 4);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle insufficient balance', async () => {
      mockAccountManager.getUserAccount.mockResolvedValue({
        id: 'account1',
        userId: 'user1',
        currency: 'USD',
        balance: 1000,
        availableBalance: 1000, // Insufficient for large order
        isActive: true
      });

      const orderData = {
        orderType: 'market',
        currencyPair: 'EUR/USD',
        side: 'buy',
        quantity: 10000 // Requires ~11000 USD
      };

      await expect(orderManager.createOrder('user1', orderData))
        .rejects.toThrow('Insufficient USD balance');
    });

    it('should handle rate provider failures', async () => {
      mockRateProvider.getRate.mockRejectedValue(new Error('Rate provider unavailable'));

      const position = {
        quantity: 10000,
        averagePrice: 1.0950
      };

      const positionPnL = await analyticsEngine.calculatePositionPnL(position, 'EUR/USD');
      expect(positionPnL.error).toBeDefined();
      expect(positionPnL.unrealized).toBe(0);
    });

    it('should handle settlement system failures', async () => {
      mockPaymentSystem.sendPayment.mockRejectedValue(new Error('Payment system down'));

      const tradeData = {
        tradeId: 'trade1',
        userId: 'user1',
        currencyPair: 'EUR/USD',
        baseCurrency: 'EUR',
        quoteCurrency: 'USD',
        side: 'buy',
        quantity: 10000,
        price: 1.1000
      };

      const settlementResult = await settlementEngine.createSettlement(tradeData);
      const settlement = settlementEngine.getSettlement(settlementResult.settlementId);

      // Settlement should be created but will fail during processing
      expect(settlement).toBeDefined();
      expect(settlement.status).toBe('pending');
    });
  });

  describe('Performance and Load Tests', () => {
    it('should handle high order volume', async () => {
      const startTime = Date.now();
      const orderPromises = [];

      // Create 100 orders concurrently
      for (let i = 0; i < 100; i++) {
        const orderData = {
          orderType: 'limit',
          currencyPair: 'EUR/USD',
          side: i % 2 === 0 ? 'buy' : 'sell',
          quantity: 1000 + i * 10,
          price: i % 2 === 0 ? 1.0950 - i * 0.0001 : 1.1050 + i * 0.0001,
          timeInForce: 'GTC'
        };

        orderPromises.push(orderManager.createOrder(`user${i % 10}`, orderData));
      }

      const results = await Promise.allSettled(orderPromises);
      const successfulOrders = results.filter(r => r.status === 'fulfilled').length;

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(successfulOrders).toBeGreaterThan(90); // At least 90% success rate
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should maintain order book performance under load', () => {
      const startTime = Date.now();

      // Get order book 1000 times
      for (let i = 0; i < 1000; i++) {
        orderManager.getOrderBook('EUR/USD', 10);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Health Checks', () => {
    it('should return healthy status for all components', async () => {
      const orderHealth = await orderManager.healthCheck();
      const executionHealth = await executionEngine.healthCheck();
      const settlementHealth = await settlementEngine.healthCheck();
      const analyticsHealth = await analyticsEngine.healthCheck();

      expect(orderHealth.status).toBe('healthy');
      expect(executionHealth.status).toBe('healthy');
      expect(settlementHealth.status).toBe('degraded'); // Missing some dependencies
      expect(analyticsHealth.status).toBe('healthy');
    });

    it('should detect unhealthy dependencies', async () => {
      // Remove a critical dependency
      orderManager.accountManager = null;

      const health = await orderManager.healthCheck();
      expect(health.status).toBe('degraded');
      expect(health.dependencies.accountManager).toBe('missing');
    });
  });
});