/**
 * Tests for Hedging Execution Manager
 */

const HedgingExecutionManager = require('../../src/multi-currency/risk/hedging-execution-manager');

describe('HedgingExecutionManager', () => {
    let manager;
    let mockFxTradingEngine;
    let mockRiskMonitor;
    let mockHedgingOptimizer;
    let mockPortfolioManager;
    let mockAccountingService;

    beforeEach(() => {
        mockFxTradingEngine = {
            executeForwardContract: jest.fn(),
            executeCurrencyOption: jest.fn(),
            executeCurrencySwap: jest.fn()
        };

        mockRiskMonitor = {
            on: jest.fn()
        };

        mockHedgingOptimizer = {
            generateHedgingRecommendations: jest.fn()
        };

        mockPortfolioManager = {
            getPortfolio: jest.fn()
        };

        mockAccountingService = {
            recordHedgeAccounting: jest.fn()
        };

        manager = new HedgingExecutionManager({
            fxTradingEngine: mockFxTradingEngine,
            riskMonitor: mockRiskMonitor,
            hedgingOptimizer: mockHedgingOptimizer,
            portfolioManager: mockPortfolioManager,
            accountingService: mockAccountingService,
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        });
    });

    describe('executeHedgingStrategy', () => {
        it('should execute hedging strategy successfully', async () => {
            const userId = 'user123';
            const strategyId = 'strategy456';
            
            const mockStrategy = {
                id: strategyId,
                userId,
                name: 'EUR Hedge Strategy',
                type: 'forward_contract',
                targetCurrency: 'EUR',
                hedgeRatio: 0.8,
                exposure: 100000,
                effectiveness: 0.95,
                instruments: [{
                    type: 'forward_contract',
                    currency: 'EUR',
                    amount: 80000,
                    rate: 1.1,
                    maturity: 90
                }]
            };

            const mockExecution = {
                transactionId: 'tx123',
                executionRate: 1.1,
                totalCost: 800
            };

            // Mock strategy retrieval
            manager.getHedgingStrategy = jest.fn().mockResolvedValue(mockStrategy);
            manager.validateExecutionConditions = jest.fn().mockResolvedValue(true);
            manager.saveHedgeRecord = jest.fn().mockResolvedValue(true);
            manager.scheduleEffectivenessTest = jest.fn().mockResolvedValue(true);
            manager.calculateBaselineRisk = jest.fn().mockResolvedValue(0.05);
            manager.startEffectivenessMonitoring = jest.fn();

            mockFxTradingEngine.executeForwardContract.mockResolvedValue(mockExecution);

            const result = await manager.executeHedgingStrategy(userId, strategyId);

            expect(result).toHaveProperty('hedgeId');
            expect(result).toHaveProperty('executionResults');
            expect(result).toHaveProperty('expectedEffectiveness', 0.95);
            expect(result.executionResults.success).toBe(true);
            expect(mockFxTradingEngine.executeForwardContract).toHaveBeenCalled();
        });

        it('should handle execution failures gracefully', async () => {
            const userId = 'user123';
            const strategyId = 'strategy456';

            manager.getHedgingStrategy = jest.fn().mockRejectedValue(new Error('Strategy not found'));

            await expect(manager.executeHedgingStrategy(userId, strategyId))
                .rejects.toThrow('Strategy not found');
        });
    });

    describe('createExecutionPlan', () => {
        it('should create detailed execution plan', async () => {
            const mockStrategy = {
                id: 'strategy123',
                userId: 'user123',
                instruments: [{
                    type: 'forward_contract',
                    currency: 'EUR',
                    amount: 100000,
                    rate: 1.1,
                    maturity: 90
                }]
            };

            manager.planInstrumentExecution = jest.fn().mockResolvedValue({
                id: 'plan123',
                type: 'forward_contract',
                notional: 100000,
                estimatedCost: 1000
            });
            manager.generateRiskChecks = jest.fn().mockResolvedValue([]);

            const plan = await manager.createExecutionPlan(mockStrategy);

            expect(plan).toHaveProperty('id');
            expect(plan).toHaveProperty('instruments');
            expect(plan).toHaveProperty('totalNotional', 100000);
            expect(plan).toHaveProperty('estimatedCost', 1000);
            expect(plan).toHaveProperty('executionOrder');
        });
    });

    describe('executeInstrument', () => {
        it('should execute forward contract', async () => {
            const instrumentPlan = {
                id: 'plan123',
                type: 'forward_contract',
                currency: 'EUR',
                notional: 100000,
                rate: 1.1,
                maturity: 90
            };

            const mockExecution = {
                transactionId: 'tx123',
                executionRate: 1.1,
                totalCost: 1000
            };

            mockFxTradingEngine.executeForwardContract.mockResolvedValue(mockExecution);

            const result = await manager.executeInstrument(instrumentPlan);

            expect(result.success).toBe(true);
            expect(result.type).toBe('forward_contract');
            expect(result.actualCost).toBe(1000);
            expect(result.transactionIds).toContain('tx123');
        });

        it('should execute currency option', async () => {
            const instrumentPlan = {
                id: 'plan123',
                type: 'currency_option',
                currency: 'EUR',
                notional: 100000,
                strike: 1.08,
                expiry: 90,
                optionType: 'put'
            };

            const mockExecution = {
                transactionId: 'tx123',
                premium: 0.02,
                totalPremium: 2000
            };

            mockFxTradingEngine.executeCurrencyOption.mockResolvedValue(mockExecution);

            const result = await manager.executeInstrument(instrumentPlan);

            expect(result.success).toBe(true);
            expect(result.type).toBe('currency_option');
            expect(result.actualCost).toBe(2000);
        });

        it('should handle execution errors', async () => {
            const instrumentPlan = {
                id: 'plan123',
                type: 'forward_contract',
                currency: 'EUR',
                notional: 100000
            };

            mockFxTradingEngine.executeForwardContract.mockRejectedValue(new Error('Execution failed'));

            const result = await manager.executeInstrument(instrumentPlan);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Execution failed');
        });
    });

    describe('performHedgeRebalancing', () => {
        it('should rebalance hedges when threshold exceeded', async () => {
            const userId = 'user123';
            const mockHedge = {
                id: 'hedge123',
                userId,
                targetCurrency: 'EUR',
                hedgeRatio: 0.8,
                status: 'active'
            };

            manager.activeHedges.set('hedge123', mockHedge);
            manager.getCurrentExposure = jest.fn().mockResolvedValue({ amount: 120000 });
            manager.calculateOptimalHedgeRatio = jest.fn().mockResolvedValue(0.6);
            manager.calculateRebalanceTrades = jest.fn().mockResolvedValue([]);
            manager.executeRebalanceTrades = jest.fn().mockResolvedValue({ totalCost: 500 });
            manager.updateHedgeRecord = jest.fn().mockResolvedValue(true);

            const result = await manager.performHedgeRebalancing(userId);

            expect(result.rebalancedHedges).toBe(1);
            expect(result.results[0].action).toBe('rebalanced');
            expect(result.results[0].newRatio).toBe(0.6);
        });

        it('should skip rebalancing when within threshold', async () => {
            const userId = 'user123';
            const mockHedge = {
                id: 'hedge123',
                userId,
                targetCurrency: 'EUR',
                hedgeRatio: 0.8,
                status: 'active'
            };

            manager.activeHedges.set('hedge123', mockHedge);
            manager.getCurrentExposure = jest.fn().mockResolvedValue({ amount: 100000 });
            manager.calculateOptimalHedgeRatio = jest.fn().mockResolvedValue(0.82); // Within 10% threshold

            const result = await manager.performHedgeRebalancing(userId);

            expect(result.rebalancedHedges).toBe(0);
        });
    });

    describe('performEffectivenessTest', () => {
        it('should calculate hedge effectiveness correctly', async () => {
            const hedgeId = 'hedge123';
            const mockHedge = {
                id: hedgeId,
                accounting: {
                    effectiveness: {
                        threshold: 0.8,
                        results: []
                    }
                }
            };

            const mockTracking = {
                trackingPoints: []
            };

            manager.activeHedges.set(hedgeId, mockHedge);
            manager.effectivenessTests.set(hedgeId, mockTracking);
            manager.calculateHedgeValue = jest.fn().mockResolvedValue({
                current: 105000,
                previous: 100000
            });
            manager.calculateExposureValue = jest.fn().mockResolvedValue({
                current: 95000,
                previous: 100000
            });
            manager.updateHedgeRecord = jest.fn().mockResolvedValue(true);

            const result = await manager.performEffectivenessTest(hedgeId);

            expect(result.effectiveness).toBeCloseTo(1.0, 1); // 5000 / 5000 = 1.0
            expect(result.isEffective).toBe(true);
            expect(mockHedge.actualEffectiveness).toBeCloseTo(1.0, 1);
        });

        it('should handle ineffective hedge', async () => {
            const hedgeId = 'hedge123';
            const mockHedge = {
                id: hedgeId,
                accounting: {
                    effectiveness: {
                        threshold: 0.8,
                        results: []
                    }
                }
            };

            const mockTracking = {
                trackingPoints: []
            };

            manager.activeHedges.set(hedgeId, mockHedge);
            manager.effectivenessTests.set(hedgeId, mockTracking);
            manager.calculateHedgeValue = jest.fn().mockResolvedValue({
                current: 102000,
                previous: 100000
            });
            manager.calculateExposureValue = jest.fn().mockResolvedValue({
                current: 95000,
                previous: 100000
            });
            manager.handleIneffectiveHedge = jest.fn().mockResolvedValue(true);
            manager.updateHedgeRecord = jest.fn().mockResolvedValue(true);

            const result = await manager.performEffectivenessTest(hedgeId);

            expect(result.effectiveness).toBeCloseTo(0.4, 1); // 2000 / 5000 = 0.4
            expect(result.isEffective).toBe(false);
            expect(manager.handleIneffectiveHedge).toHaveBeenCalled();
        });
    });

    describe('terminateHedge', () => {
        it('should terminate hedge successfully', async () => {
            const hedgeId = 'hedge123';
            const mockHedge = {
                id: hedgeId,
                userId: 'user123',
                status: 'active',
                totalCost: 1000
            };

            manager.activeHedges.set(hedgeId, mockHedge);
            manager.generateClosingTrades = jest.fn().mockResolvedValue([]);
            manager.executeClosingTrades = jest.fn().mockResolvedValue({ totalCost: 200 });
            manager.calculateFinalEffectiveness = jest.fn().mockResolvedValue(0.85);
            manager.updateHedgeRecord = jest.fn().mockResolvedValue(true);

            const result = await manager.terminateHedge(hedgeId, 'manual');

            expect(result.hedgeId).toBe(hedgeId);
            expect(result.terminationReason).toBe('manual');
            expect(result.totalCost).toBe(1200); // 1000 + 200
            expect(mockHedge.status).toBe('terminated');
            expect(manager.activeHedges.has(hedgeId)).toBe(false);
        });

        it('should throw error for non-existent hedge', async () => {
            await expect(manager.terminateHedge('nonexistent'))
                .rejects.toThrow('Hedge nonexistent not found');
        });
    });

    describe('getHedgePerformanceReport', () => {
        it('should generate comprehensive performance report', async () => {
            const hedgeId = 'hedge123';
            const mockHedge = {
                id: hedgeId,
                strategyName: 'EUR Hedge',
                status: 'active',
                createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
                expectedEffectiveness: 0.9,
                actualEffectiveness: 0.85,
                totalCost: 1000,
                accounting: {
                    effectiveness: {
                        results: []
                    }
                }
            };

            const mockTracking = {
                riskReduction: 0.4
            };

            manager.activeHedges.set(hedgeId, mockHedge);
            manager.effectivenessTests.set(hedgeId, mockTracking);
            manager.calculateOngoingCosts = jest.fn().mockResolvedValue(200);
            manager.calculateHedgeMTM = jest.fn().mockResolvedValue(1500);
            manager.calculateHedgePnL = jest.fn().mockResolvedValue(300);

            const report = await manager.getHedgePerformanceReport(hedgeId);

            expect(report.hedgeId).toBe(hedgeId);
            expect(report.duration).toBe(30);
            expect(report.effectiveness.expected).toBe(0.9);
            expect(report.effectiveness.actual).toBe(0.85);
            expect(report.effectiveness.variance).toBe(-0.05);
            expect(report.cost.total).toBe(1200);
            expect(report.riskReduction).toBe(0.4);
        });

        it('should throw error for non-existent hedge', async () => {
            await expect(manager.getHedgePerformanceReport('nonexistent'))
                .rejects.toThrow('Hedge nonexistent not found');
        });
    });

    describe('Hedge Accounting', () => {
        it('should setup hedge accounting correctly', async () => {
            const mockHedge = {
                id: 'hedge123',
                targetCurrency: 'EUR',
                notionalAmount: 100000,
                instruments: [],
                strategyName: 'EUR Hedge',
                accounting: {
                    designation: 'cash_flow_hedge',
                    effectiveness: {
                        method: 'dollar_offset',
                        threshold: 0.8
                    }
                }
            };

            manager.scheduleEffectivenessTest = jest.fn().mockResolvedValue(true);

            await manager.setupHedgeAccounting(mockHedge);

            expect(manager.hedgeAccounting.has('hedge123')).toBe(true);
            const accounting = manager.hedgeAccounting.get('hedge123');
            expect(accounting.designation).toBe('cash_flow_hedge');
            expect(accounting.hedgedItem.currency).toBe('EUR');
            expect(accounting.effectivenessTest.threshold).toBe(0.8);
        });
    });

    describe('Execution Planning', () => {
        it('should optimize execution order correctly', () => {
            const instruments = [
                { type: 'currency_option', priority: 2 },
                { type: 'forward_contract', priority: 1 },
                { type: 'currency_swap', priority: 3 }
            ];

            const optimized = manager.optimizeExecutionOrder(instruments);

            expect(optimized[0].type).toBe('forward_contract');
        });

        it('should calculate optimal slicing for large orders', () => {
            const instrument = { amount: 5000000 };
            const slicing = manager.calculateOptimalSlicing(instrument);

            expect(slicing.sliceSize).toBeLessThanOrEqual(100000);
            expect(slicing.sliceCount).toBeGreaterThan(1);
            expect(slicing.interval).toBe(300000);
        });
    });
});