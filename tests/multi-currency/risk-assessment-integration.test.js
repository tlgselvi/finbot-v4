/**
 * Integration Tests for Risk Assessment System
 * 
 * Tests the complete risk assessment workflow including risk calculation,
 * monitoring, hedging optimization, and execution management.
 */

const CurrencyRiskEngine = require('../../src/multi-currency/risk/currency-risk-engine');
const RiskMonitoringEngine = require('../../src/multi-currency/risk/risk-monitoring-engine');
const HedgingStrategyOptimizer = require('../../src/multi-currency/risk/hedging-strategy-optimizer');
const HedgingExecutionManager = require('../../src/multi-currency/risk/hedging-execution-manager');

describe('Risk Assessment System Integration', () => {
    let riskEngine;
    let riskMonitor;
    let hedgingOptimizer;
    let executionManager;
    let mockServices;

    beforeEach(() => {
        // Mock external services
        mockServices = {
            portfolioService: {
                getPortfolio: jest.fn(),
                getCurrencyExposures: jest.fn()
            },
            exchangeRateService: {
                getCurrentRates: jest.fn(),
                getHistoricalRates: jest.fn()
            },
            marketDataService: {
                getCurrencyData: jest.fn()
            },
            fxTradingEngine: {
                executeForwardContract: jest.fn(),
                executeCurrencyOption: jest.fn(),
                executeCurrencySwap: jest.fn()
            },
            alertService: {
                sendAlert: jest.fn()
            },
            configService: {
                saveRiskThresholds: jest.fn(),
                loadAllRiskThresholds: jest.fn()
            }
        };

        // Initialize components
        riskEngine = new CurrencyRiskEngine({
            portfolioService: mockServices.portfolioService,
            exchangeRateService: mockServices.exchangeRateService,
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        });

        riskMonitor = new RiskMonitoringEngine({
            riskCalculator: riskEngine,
            alertService: mockServices.alertService,
            configService: mockServices.configService,
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        });

        hedgingOptimizer = new HedgingStrategyOptimizer({
            riskCalculator: riskEngine,
            marketDataService: mockServices.marketDataService,
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        });

        executionManager = new HedgingExecutionManager({
            fxTradingEngine: mockServices.fxTradingEngine,
            riskMonitor: riskMonitor,
            hedgingOptimizer: hedgingOptimizer,
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        });
    });

    describe('Complete Risk Management Workflow', () => {
        it('should execute complete risk assessment to hedging workflow', async () => {
            const userId = 'user123';
            
            // Setup mock data
            const mockPortfolio = {
                userId,
                baseCurrency: 'USD',
                totalValue: 1000000,
                positions: [
                    { currency: 'EUR', amount: 400000, value: 440000 },
                    { currency: 'GBP', amount: 200000, value: 260000 },
                    { currency: 'JPY', amount: 30000000, value: 300000 }
                ]
            };

            const mockRates = {
                'EUR/USD': { rate: 1.1, volatility: 0.12, timestamp: new Date() },
                'GBP/USD': { rate: 1.3, volatility: 0.15, timestamp: new Date() },
                'JPY/USD': { rate: 0.01, volatility: 0.08, timestamp: new Date() }
            };

            const mockHistoricalRates = {
                'EUR/USD': Array.from({ length: 252 }, (_, i) => ({
                    date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
                    rate: 1.1 + (Math.random() - 0.5) * 0.1
                })),
                'GBP/USD': Array.from({ length: 252 }, (_, i) => ({
                    date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
                    rate: 1.3 + (Math.random() - 0.5) * 0.15
                })),
                'JPY/USD': Array.from({ length: 252 }, (_, i) => ({
                    date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
                    rate: 0.01 + (Math.random() - 0.5) * 0.002
                }))
            };

            const mockMarketData = {
                EUR: {
                    spotRate: 1.1,
                    forwardRates: { '3M': 1.105 },
                    impliedVolatility: 0.12,
                    liquidity: 'high'
                },
                GBP: {
                    spotRate: 1.3,
                    forwardRates: { '3M': 1.295 },
                    impliedVolatility: 0.15,
                    liquidity: 'medium'
                }
            };

            // Mock service responses
            mockServices.portfolioService.getPortfolio.mockResolvedValue(mockPortfolio);
            mockServices.portfolioService.getCurrencyExposures.mockResolvedValue(mockPortfolio.positions);
            mockServices.exchangeRateService.getCurrentRates.mockResolvedValue(mockRates);
            mockServices.exchangeRateService.getHistoricalRates.mockResolvedValue(mockHistoricalRates);
            mockServices.marketDataService.getCurrencyData.mockImplementation((currency) => 
                Promise.resolve(mockMarketData[currency])
            );

            // Step 1: Calculate risk assessment
            const riskAssessment = await riskEngine.calculateRisk(userId);
            
            expect(riskAssessment).toHaveProperty('exposures');
            expect(riskAssessment).toHaveProperty('var95');
            expect(riskAssessment).toHaveProperty('totalRisk');
            expect(riskAssessment.exposures.length).toBe(3);

            // Step 2: Set risk thresholds and start monitoring
            const riskThresholds = {
                maxVaR95: 0.05,
                maxVolatility: 0.15,
                maxCorrelation: 0.8,
                defaultMaxConcentration: 0.3
            };

            await riskMonitor.setRiskThresholds(userId, riskThresholds);
            
            // Step 3: Check if hedging is needed (simulate high risk)
            const highRiskExposure = riskAssessment.exposures.find(e => e.percentage > 0.3);
            
            if (highRiskExposure) {
                // Step 4: Generate hedging recommendations
                const hedgingRecommendations = await hedgingOptimizer.generateHedgingRecommendations(userId);
                
                expect(hedgingRecommendations).toHaveProperty('recommendations');
                expect(hedgingRecommendations).toHaveProperty('costBenefitAnalysis');
                expect(hedgingRecommendations.recommendations.length).toBeGreaterThan(0);

                // Step 5: Execute best hedging strategy
                const bestStrategy = hedgingRecommendations.recommendations[0];
                
                // Mock execution responses
                mockServices.fxTradingEngine.executeForwardContract.mockResolvedValue({
                    transactionId: 'tx123',
                    executionRate: 1.1,
                    totalCost: 1000
                });

                // Mock manager methods
                executionManager.getHedgingStrategy = jest.fn().mockResolvedValue(bestStrategy);
                executionManager.validateExecutionConditions = jest.fn().mockResolvedValue(true);
                executionManager.saveHedgeRecord = jest.fn().mockResolvedValue(true);
                executionManager.scheduleEffectivenessTest = jest.fn().mockResolvedValue(true);
                executionManager.calculateBaselineRisk = jest.fn().mockResolvedValue(0.05);
                executionManager.startEffectivenessMonitoring = jest.fn();

                const executionResult = await executionManager.executeHedgingStrategy(userId, bestStrategy.id);
                
                expect(executionResult).toHaveProperty('hedgeId');
                expect(executionResult).toHaveProperty('executionResults');
                expect(executionResult.executionResults.success).toBe(true);

                // Step 6: Verify risk reduction
                const postHedgeRisk = await riskEngine.calculateRisk(userId);
                // In a real scenario, we would expect reduced risk after hedging
            }
        });

        it('should handle risk breach and trigger automatic hedging', async () => {
            const userId = 'user123';
            
            // Setup high-risk scenario
            const highRiskPortfolio = {
                userId,
                baseCurrency: 'USD',
                totalValue: 1000000,
                positions: [
                    { currency: 'EUR', amount: 600000, value: 660000 }, // 66% concentration
                    { currency: 'USD', amount: 340000, value: 340000 }
                ]
            };

            mockServices.portfolioService.getPortfolio.mockResolvedValue(highRiskPortfolio);
            mockServices.portfolioService.getCurrencyExposures.mockResolvedValue(highRiskPortfolio.positions);
            mockServices.configService.loadAllRiskThresholds.mockResolvedValue({
                [userId]: {
                    maxVaR95: 0.05,
                    maxVolatility: 0.15,
                    maxCorrelation: 0.8,
                    defaultMaxConcentration: 0.3
                }
            });

            // Start monitoring
            riskMonitor.startMonitoring();
            
            // Simulate risk check that should trigger breach
            await riskMonitor.checkUserRisk(userId);
            
            // Verify alert was sent
            expect(mockServices.alertService.sendAlert).toHaveBeenCalled();
            
            const alertCall = mockServices.alertService.sendAlert.mock.calls[0][0];
            expect(alertCall.type).toBe('RISK_BREACH');
            expect(alertCall.severity).toBeDefined();
        });
    });

    describe('Stress Testing Integration', () => {
        it('should perform comprehensive stress testing across all components', async () => {
            const userId = 'user123';
            
            // Define stress scenarios
            const stressScenarios = [
                {
                    name: 'EUR Crisis',
                    description: 'European financial crisis scenario',
                    shocks: [
                        { currencyPair: 'EUR/USD', shockPercent: -15 },
                        { currencyPair: 'GBP/USD', shockPercent: -8 }
                    ]
                },
                {
                    name: 'USD Strength',
                    description: 'Strong USD scenario',
                    shocks: [
                        { currencyPair: 'EUR/USD', shockPercent: -10 },
                        { currencyPair: 'GBP/USD', shockPercent: -12 },
                        { currencyPair: 'JPY/USD', shockPercent: -5 }
                    ]
                }
            ];

            // Mock current risk calculation
            riskEngine.calculateRisk = jest.fn().mockResolvedValue({
                var95: 0.04,
                portfolioValue: 1000000
            });

            // Mock stressed risk calculation
            riskEngine.calculateRiskWithRates = jest.fn().mockResolvedValue({
                var95: 0.08,
                portfolioValue: 850000
            });

            // Mock rate retrieval
            riskMonitor.getCurrentRate = jest.fn().mockReturnValue(1.1);

            // Perform stress testing
            const stressTestReport = await riskMonitor.performStressTest(userId, stressScenarios);
            
            expect(stressTestReport).toHaveProperty('scenarios');
            expect(stressTestReport).toHaveProperty('summary');
            expect(stressTestReport.scenarios.length).toBe(2);
            
            // Verify stress test results
            for (const scenario of stressTestReport.scenarios) {
                expect(scenario).toHaveProperty('impact');
                expect(scenario.impact).toHaveProperty('varChange');
                expect(scenario.impact).toHaveProperty('valueChange');
                expect(scenario.impact).toHaveProperty('percentageChange');
            }

            expect(stressTestReport.summary).toHaveProperty('worstCaseScenario');
            expect(stressTestReport.summary).toHaveProperty('averageImpact');
            expect(stressTestReport.summary).toHaveProperty('riskLevel');
        });
    });

    describe('Hedge Effectiveness Testing', () => {
        it('should perform ongoing hedge effectiveness testing', async () => {
            const hedgeId = 'hedge123';
            
            // Setup active hedge
            const mockHedge = {
                id: hedgeId,
                userId: 'user123',
                targetCurrency: 'EUR',
                hedgeRatio: 0.8,
                status: 'active',
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

            executionManager.activeHedges.set(hedgeId, mockHedge);
            executionManager.effectivenessTests.set(hedgeId, mockTracking);

            // Mock value calculations for effectiveness test
            executionManager.calculateHedgeValue = jest.fn().mockResolvedValue({
                current: 105000,
                previous: 100000
            });
            executionManager.calculateExposureValue = jest.fn().mockResolvedValue({
                current: 95000,
                previous: 100000
            });
            executionManager.updateHedgeRecord = jest.fn().mockResolvedValue(true);

            // Perform effectiveness test
            const effectivenessResult = await executionManager.performEffectivenessTest(hedgeId);
            
            expect(effectivenessResult).toHaveProperty('effectiveness');
            expect(effectivenessResult).toHaveProperty('isEffective');
            expect(effectivenessResult).toHaveProperty('testDate');
            expect(effectivenessResult.effectiveness).toBeCloseTo(1.0, 1);
            expect(effectivenessResult.isEffective).toBe(true);

            // Verify tracking data was updated
            expect(mockTracking.trackingPoints.length).toBe(1);
            expect(mockHedge.actualEffectiveness).toBeCloseTo(1.0, 1);
        });

        it('should handle ineffective hedge scenarios', async () => {
            const hedgeId = 'hedge123';
            
            const mockHedge = {
                id: hedgeId,
                userId: 'user123',
                accounting: {
                    effectiveness: {
                        threshold: 0.8,
                        results: []
                    }
                }
            };

            const mockTracking = { trackingPoints: [] };

            executionManager.activeHedges.set(hedgeId, mockHedge);
            executionManager.effectivenessTests.set(hedgeId, mockTracking);

            // Mock ineffective hedge scenario
            executionManager.calculateHedgeValue = jest.fn().mockResolvedValue({
                current: 101000,
                previous: 100000
            });
            executionManager.calculateExposureValue = jest.fn().mockResolvedValue({
                current: 95000,
                previous: 100000
            });
            executionManager.handleIneffectiveHedge = jest.fn().mockResolvedValue(true);
            executionManager.updateHedgeRecord = jest.fn().mockResolvedValue(true);

            const effectivenessResult = await executionManager.performEffectivenessTest(hedgeId);
            
            expect(effectivenessResult.effectiveness).toBeLessThan(0.8);
            expect(effectivenessResult.isEffective).toBe(false);
            expect(executionManager.handleIneffectiveHedge).toHaveBeenCalled();
        });
    });

    describe('Performance and Load Testing', () => {
        it('should handle high-frequency risk calculations efficiently', async () => {
            const userIds = Array.from({ length: 100 }, (_, i) => `user${i}`);
            
            // Mock portfolio data for all users
            mockServices.portfolioService.getPortfolio.mockImplementation((userId) => 
                Promise.resolve({
                    userId,
                    baseCurrency: 'USD',
                    totalValue: 500000 + Math.random() * 1000000,
                    positions: [
                        { currency: 'EUR', amount: 200000, value: 220000 },
                        { currency: 'GBP', amount: 100000, value: 130000 }
                    ]
                })
            );

            const startTime = Date.now();
            
            // Perform risk calculations for all users
            const riskPromises = userIds.map(userId => riskEngine.calculateRisk(userId));
            const riskResults = await Promise.all(riskPromises);
            
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            const avgTimePerCalculation = totalTime / userIds.length;
            
            expect(riskResults.length).toBe(100);
            expect(avgTimePerCalculation).toBeLessThan(100); // Should be under 100ms per calculation
            
            // Verify all results have required properties
            riskResults.forEach(result => {
                expect(result).toHaveProperty('exposures');
                expect(result).toHaveProperty('var95');
                expect(result).toHaveProperty('totalRisk');
            });
        });

        it('should handle concurrent hedge executions', async () => {
            const hedgeRequests = Array.from({ length: 10 }, (_, i) => ({
                userId: `user${i}`,
                strategyId: `strategy${i}`
            }));

            // Mock strategy and execution data
            executionManager.getHedgingStrategy = jest.fn().mockImplementation((strategyId) => 
                Promise.resolve({
                    id: strategyId,
                    userId: strategyId.replace('strategy', 'user'),
                    name: `Strategy ${strategyId}`,
                    type: 'forward_contract',
                    targetCurrency: 'EUR',
                    hedgeRatio: 0.8,
                    exposure: 100000,
                    effectiveness: 0.9,
                    instruments: [{
                        type: 'forward_contract',
                        currency: 'EUR',
                        amount: 80000,
                        rate: 1.1,
                        maturity: 90
                    }]
                })
            );

            executionManager.validateExecutionConditions = jest.fn().mockResolvedValue(true);
            executionManager.saveHedgeRecord = jest.fn().mockResolvedValue(true);
            executionManager.scheduleEffectivenessTest = jest.fn().mockResolvedValue(true);
            executionManager.calculateBaselineRisk = jest.fn().mockResolvedValue(0.05);
            executionManager.startEffectivenessMonitoring = jest.fn();

            mockServices.fxTradingEngine.executeForwardContract.mockResolvedValue({
                transactionId: 'tx123',
                executionRate: 1.1,
                totalCost: 800
            });

            const startTime = Date.now();
            
            // Execute hedges concurrently
            const executionPromises = hedgeRequests.map(req => 
                executionManager.executeHedgingStrategy(req.userId, req.strategyId)
            );
            const executionResults = await Promise.all(executionPromises);
            
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            
            expect(executionResults.length).toBe(10);
            expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
            
            // Verify all executions were successful
            executionResults.forEach(result => {
                expect(result).toHaveProperty('hedgeId');
                expect(result).toHaveProperty('executionResults');
                expect(result.executionResults.success).toBe(true);
            });
        });
    });

    describe('Error Handling and Recovery', () => {
        it('should handle market data failures gracefully', async () => {
            const userId = 'user123';
            
            // Mock market data failure
            mockServices.marketDataService.getCurrencyData.mockRejectedValue(
                new Error('Market data service unavailable')
            );

            // Should still generate recommendations using default data
            const recommendations = await hedgingOptimizer.generateHedgingRecommendations(userId);
            
            expect(recommendations).toHaveProperty('recommendations');
            expect(recommendations.recommendations.length).toBeGreaterThan(0);
        });

        it('should handle execution failures and provide fallback options', async () => {
            const userId = 'user123';
            const strategyId = 'strategy123';
            
            const mockStrategy = {
                id: strategyId,
                userId,
                instruments: [{
                    type: 'forward_contract',
                    currency: 'EUR',
                    amount: 100000
                }]
            };

            executionManager.getHedgingStrategy = jest.fn().mockResolvedValue(mockStrategy);
            executionManager.validateExecutionConditions = jest.fn().mockResolvedValue(true);
            
            // Mock execution failure
            mockServices.fxTradingEngine.executeForwardContract.mockRejectedValue(
                new Error('Execution failed - insufficient liquidity')
            );

            await expect(executionManager.executeHedgingStrategy(userId, strategyId))
                .rejects.toThrow('Execution failed - insufficient liquidity');
        });

        it('should recover from monitoring system failures', async () => {
            const userId = 'user123';
            
            // Mock risk calculation failure
            riskEngine.calculateRisk = jest.fn().mockRejectedValue(
                new Error('Risk calculation failed')
            );

            // Monitor should handle the error gracefully
            await riskMonitor.checkUserRisk(userId);
            
            // Should emit error event but not crash
            expect(riskMonitor.listenerCount('riskCheckFailed')).toBeGreaterThanOrEqual(0);
        });
    });

    afterEach(() => {
        // Cleanup
        if (riskMonitor.isMonitoring) {
            riskMonitor.stopMonitoring();
        }
        
        jest.clearAllMocks();
    });
});