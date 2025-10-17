/**
 * Stress Tests for Extreme Market Scenarios
 * 
 * Tests risk assessment system behavior under extreme market conditions
 * including financial crises, market crashes, and high volatility periods.
 */

const CurrencyRiskEngine = require('../../src/multi-currency/risk/currency-risk-engine');
const RiskMonitoringEngine = require('../../src/multi-currency/risk/risk-monitoring-engine');
const HedgingStrategyOptimizer = require('../../src/multi-currency/risk/hedging-strategy-optimizer');

describe('Risk Assessment Stress Scenarios', () => {
    let riskEngine;
    let riskMonitor;
    let hedgingOptimizer;
    let mockServices;

    beforeEach(() => {
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
            alertService: {
                sendAlert: jest.fn()
            },
            configService: {
                saveRiskThresholds: jest.fn(),
                loadAllRiskThresholds: jest.fn()
            }
        };

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
    });

    describe('Financial Crisis Scenarios', () => {
        it('should handle 2008-style financial crisis scenario', async () => {
            const userId = 'user123';
            
            // Setup portfolio with significant exposure
            const crisisPortfolio = {
                userId,
                baseCurrency: 'USD',
                totalValue: 5000000,
                positions: [
                    { currency: 'EUR', amount: 1500000, value: 1650000 },
                    { currency: 'GBP', amount: 1000000, value: 1300000 },
                    { currency: 'JPY', amount: 200000000, value: 2000000 },
                    { currency: 'USD', amount: 50000, value: 50000 }
                ]
            };

            // Crisis-level exchange rates (major devaluations)
            const crisisRates = {
                'EUR/USD': { rate: 0.95, volatility: 0.45, timestamp: new Date() }, // 30% drop
                'GBP/USD': { rate: 1.05, volatility: 0.50, timestamp: new Date() }, // 35% drop
                'JPY/USD': { rate: 0.007, volatility: 0.35, timestamp: new Date() }  // 30% drop
            };

            // Extreme historical volatility data
            const crisisHistoricalRates = {
                'EUR/USD': Array.from({ length: 252 }, (_, i) => ({
                    date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
                    rate: 1.35 - (i / 252) * 0.4 + (Math.random() - 0.5) * 0.3
                })),
                'GBP/USD': Array.from({ length: 252 }, (_, i) => ({
                    date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
                    rate: 1.6 - (i / 252) * 0.55 + (Math.random() - 0.5) * 0.4
                })),
                'JPY/USD': Array.from({ length: 252 }, (_, i) => ({
                    date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
                    rate: 0.01 - (i / 252) * 0.003 + (Math.random() - 0.5) * 0.002
                }))
            };

            mockServices.portfolioService.getPortfolio.mockResolvedValue(crisisPortfolio);
            mockServices.portfolioService.getCurrencyExposures.mockResolvedValue(crisisPortfolio.positions);
            mockServices.exchangeRateService.getCurrentRates.mockResolvedValue(crisisRates);
            mockServices.exchangeRateService.getHistoricalRates.mockResolvedValue(crisisHistoricalRates);

            // Calculate risk during crisis
            const crisisRisk = await riskEngine.calculateRisk(userId);
            
            expect(crisisRisk.var95).toBeGreaterThan(0.15); // Expect very high VaR
            expect(crisisRisk.totalRisk).toBeGreaterThan(0.2); // Expect high total risk
            expect(crisisRisk.portfolioVolatility).toBeGreaterThan(0.3); // Expect high volatility
            
            // Check that all exposures are flagged as high risk
            const highRiskExposures = crisisRisk.exposures.filter(e => e.riskLevel > 0.1);
            expect(highRiskExposures.length).toBeGreaterThan(0);

            // Verify correlation increases during crisis
            expect(crisisRisk.maxCorrelation).toBeGreaterThan(0.7);
        });

        it('should handle European debt crisis scenario', async () => {
            const userId = 'user123';
            
            const euroDebtPortfolio = {
                userId,
                baseCurrency: 'USD',
                totalValue: 2000000,
                positions: [
                    { currency: 'EUR', amount: 1200000, value: 1320000 }, // Heavy EUR exposure
                    { currency: 'CHF', amount: 300000, value: 330000 },   // Safe haven
                    { currency: 'USD', amount: 350000, value: 350000 }
                ]
            };

            // EUR crisis rates with CHF strength
            const euroDebtRates = {
                'EUR/USD': { rate: 1.05, volatility: 0.35, timestamp: new Date() },
                'CHF/USD': { rate: 1.15, volatility: 0.20, timestamp: new Date() }
            };

            mockServices.portfolioService.getPortfolio.mockResolvedValue(euroDebtPortfolio);
            mockServices.portfolioService.getCurrencyExposures.mockResolvedValue(euroDebtPortfolio.positions);
            mockServices.exchangeRateService.getCurrentRates.mockResolvedValue(euroDebtRates);

            const riskAssessment = await riskEngine.calculateRisk(userId);
            
            // EUR should show high risk
            const eurExposure = riskAssessment.exposures.find(e => e.currency === 'EUR');
            expect(eurExposure.riskLevel).toBeGreaterThan(0.08);
            
            // CHF should show lower risk (safe haven)
            const chfExposure = riskAssessment.exposures.find(e => e.currency === 'CHF');
            expect(chfExposure.riskLevel).toBeLessThan(eurExposure.riskLevel);
        });
    });

    describe('Market Crash Scenarios', () => {
        it('should handle sudden market crash with extreme volatility', async () => {
            const userId = 'user123';
            
            // Portfolio before crash
            const precrashPortfolio = {
                userId,
                baseCurrency: 'USD',
                totalValue: 3000000,
                positions: [
                    { currency: 'EUR', amount: 800000, value: 880000 },
                    { currency: 'GBP', amount: 600000, value: 780000 },
                    { currency: 'AUD', amount: 700000, value: 1050000 },
                    { currency: 'CAD', amount: 400000, value: 520000 }
                ]
            };

            // Extreme volatility rates (flash crash scenario)
            const crashRates = {
                'EUR/USD': { rate: 1.08, volatility: 0.80, timestamp: new Date() },
                'GBP/USD': { rate: 1.25, volatility: 0.75, timestamp: new Date() },
                'AUD/USD': { rate: 0.68, volatility: 0.90, timestamp: new Date() },
                'CAD/USD': { rate: 0.72, volatility: 0.60, timestamp: new Date() }
            };

            mockServices.portfolioService.getPortfolio.mockResolvedValue(precrashPortfolio);
            mockServices.portfolioService.getCurrencyExposures.mockResolvedValue(precrashPortfolio.positions);
            mockServices.exchangeRateService.getCurrentRates.mockResolvedValue(crashRates);

            const crashRisk = await riskEngine.calculateRisk(userId);
            
            // Expect extremely high volatility measures
            expect(crashRisk.portfolioVolatility).toBeGreaterThan(0.5);
            expect(crashRisk.var95).toBeGreaterThan(0.2);
            
            // All currencies should show elevated risk
            crashRisk.exposures.forEach(exposure => {
                expect(exposure.volatility).toBeGreaterThan(0.4);
            });
        });

        it('should handle currency-specific crash (e.g., Turkish Lira crisis)', async () => {
            const userId = 'user123';
            
            const emergingMarketPortfolio = {
                userId,
                baseCurrency: 'USD',
                totalValue: 1000000,
                positions: [
                    { currency: 'TRY', amount: 2000000, value: 200000 }, // Turkish Lira exposure
                    { currency: 'EUR', amount: 400000, value: 440000 },
                    { currency: 'USD', amount: 360000, value: 360000 }
                ]
            };

            // TRY crisis rates (massive devaluation)
            const tryCrisis = {
                'TRY/USD': { rate: 0.08, volatility: 1.2, timestamp: new Date() }, // 80% devaluation
                'EUR/USD': { rate: 1.1, volatility: 0.15, timestamp: new Date() }
            };

            mockServices.portfolioService.getPortfolio.mockResolvedValue(emergingMarketPortfolio);
            mockServices.portfolioService.getCurrencyExposures.mockResolvedValue(emergingMarketPortfolio.positions);
            mockServices.exchangeRateService.getCurrentRates.mockResolvedValue(tryCrisis);

            const riskAssessment = await riskEngine.calculateRisk(userId);
            
            // TRY should show extreme risk
            const tryExposure = riskAssessment.exposures.find(e => e.currency === 'TRY');
            expect(tryExposure.riskLevel).toBeGreaterThan(0.3);
            expect(tryExposure.volatility).toBeGreaterThan(1.0);
            
            // Portfolio should be flagged as extremely high risk
            expect(riskAssessment.totalRisk).toBeGreaterThan(0.25);
        });
    });

    describe('High Volatility Periods', () => {
        it('should handle Brexit-style political uncertainty', async () => {
            const userId = 'user123';
            
            const brexitPortfolio = {
                userId,
                baseCurrency: 'USD',
                totalValue: 2500000,
                positions: [
                    { currency: 'GBP', amount: 1000000, value: 1300000 }, // Heavy GBP exposure
                    { currency: 'EUR', amount: 600000, value: 660000 },
                    { currency: 'USD', amount: 540000, value: 540000 }
                ]
            };

            // Brexit uncertainty rates
            const brexitRates = {
                'GBP/USD': { rate: 1.25, volatility: 0.45, timestamp: new Date() },
                'EUR/USD': { rate: 1.08, volatility: 0.25, timestamp: new Date() }
            };

            // Simulate high correlation during political crisis
            const brexitHistoricalRates = {
                'GBP/USD': Array.from({ length: 252 }, (_, i) => {
                    const trend = Math.sin(i / 10) * 0.1; // Oscillating uncertainty
                    return {
                        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
                        rate: 1.3 + trend + (Math.random() - 0.5) * 0.2
                    };
                }),
                'EUR/USD': Array.from({ length: 252 }, (_, i) => {
                    const correlation = 0.6; // Correlated with GBP during crisis
                    const gbpMove = Math.sin(i / 10) * 0.1;
                    return {
                        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
                        rate: 1.1 + gbpMove * correlation + (Math.random() - 0.5) * 0.1
                    };
                })
            };

            mockServices.portfolioService.getPortfolio.mockResolvedValue(brexitPortfolio);
            mockServices.portfolioService.getCurrencyExposures.mockResolvedValue(brexitPortfolio.positions);
            mockServices.exchangeRateService.getCurrentRates.mockResolvedValue(brexitRates);
            mockServices.exchangeRateService.getHistoricalRates.mockResolvedValue(brexitHistoricalRates);

            const riskAssessment = await riskEngine.calculateRisk(userId);
            
            // GBP should show very high volatility
            const gbpExposure = riskAssessment.exposures.find(e => e.currency === 'GBP');
            expect(gbpExposure.volatility).toBeGreaterThan(0.4);
            
            // High correlation between EUR and GBP during crisis
            expect(riskAssessment.maxCorrelation).toBeGreaterThan(0.5);
        });

        it('should handle central bank intervention scenarios', async () => {
            const userId = 'user123';
            
            // Swiss National Bank intervention scenario
            const snbPortfolio = {
                userId,
                baseCurrency: 'USD',
                totalValue: 1500000,
                positions: [
                    { currency: 'CHF', amount: 800000, value: 880000 },
                    { currency: 'EUR', amount: 500000, value: 550000 },
                    { currency: 'USD', amount: 70000, value: 70000 }
                ]
            };

            // Sudden CHF appreciation after intervention removal
            const snbRates = {
                'CHF/USD': { rate: 1.25, volatility: 0.60, timestamp: new Date() }, // Sudden appreciation
                'EUR/USD': { rate: 1.05, volatility: 0.30, timestamp: new Date() }
            };

            mockServices.portfolioService.getPortfolio.mockResolvedValue(snbPortfolio);
            mockServices.portfolioService.getCurrencyExposures.mockResolvedValue(snbPortfolio.positions);
            mockServices.exchangeRateService.getCurrentRates.mockResolvedValue(snbRates);

            const riskAssessment = await riskEngine.calculateRisk(userId);
            
            // CHF should show high volatility due to intervention
            const chfExposure = riskAssessment.exposures.find(e => e.currency === 'CHF');
            expect(chfExposure.volatility).toBeGreaterThan(0.5);
            
            // Portfolio risk should be elevated
            expect(riskAssessment.var95).toBeGreaterThan(0.1);
        });
    });

    describe('Extreme Hedging Scenarios', () => {
        it('should generate appropriate hedging for crisis conditions', async () => {
            const userId = 'user123';
            
            // Setup crisis-level risk assessment
            const crisisRisk = {
                exposures: [
                    {
                        currency: 'EUR',
                        amount: 1000000,
                        percentage: 0.5,
                        riskLevel: 0.25, // Very high risk
                        direction: 'long',
                        volatility: 0.45
                    }
                ],
                portfolioValue: 2000000,
                var95: 0.2,
                totalRisk: 0.3
            };

            // Crisis market data with high volatility and low liquidity
            const crisisMarketData = {
                EUR: {
                    spotRate: 1.05,
                    forwardRates: { '3M': 1.02 },
                    impliedVolatility: 0.45,
                    liquidity: 'low',
                    spread: 0.005 // Wide spreads during crisis
                }
            };

            riskEngine.calculateRisk = jest.fn().mockResolvedValue(crisisRisk);
            mockServices.marketDataService.getCurrencyData.mockResolvedValue(crisisMarketData.EUR);

            const hedgingRecommendations = await hedgingOptimizer.generateHedgingRecommendations(userId);
            
            expect(hedgingRecommendations.recommendations.length).toBeGreaterThan(0);
            
            // Should recommend higher hedge ratios during crisis
            const recommendations = hedgingRecommendations.recommendations;
            const avgHedgeRatio = recommendations.reduce((sum, r) => sum + r.hedgeRatio, 0) / recommendations.length;
            expect(avgHedgeRatio).toBeGreaterThan(0.6);
            
            // Should prefer more liquid instruments during crisis
            const forwardRecommendations = recommendations.filter(r => r.type === 'forward_contract');
            expect(forwardRecommendations.length).toBeGreaterThan(0);
        });

        it('should handle hedging when markets are closed or illiquid', async () => {
            const userId = 'user123';
            
            const illiquidRisk = {
                exposures: [{
                    currency: 'TRY',
                    amount: 500000,
                    percentage: 0.5,
                    riskLevel: 0.4,
                    direction: 'long'
                }],
                portfolioValue: 1000000,
                var95: 0.3
            };

            // Illiquid market conditions
            const illiquidMarketData = {
                TRY: {
                    spotRate: 0.05,
                    forwardRates: {},
                    impliedVolatility: 1.5,
                    liquidity: 'very_low',
                    spread: 0.02
                }
            };

            riskEngine.calculateRisk = jest.fn().mockResolvedValue(illiquidRisk);
            mockServices.marketDataService.getCurrencyData.mockResolvedValue(illiquidMarketData.TRY);

            const hedgingRecommendations = await hedgingOptimizer.generateHedgingRecommendations(userId);
            
            // Should still provide recommendations but with warnings
            expect(hedgingRecommendations.recommendations.length).toBeGreaterThan(0);
            
            // Should prefer natural hedging when markets are illiquid
            const naturalHedges = hedgingRecommendations.recommendations.filter(r => r.type === 'natural_hedge');
            expect(naturalHedges.length).toBeGreaterThan(0);
        });
    });

    describe('System Resilience Under Stress', () => {
        it('should maintain performance under high load during market stress', async () => {
            const userIds = Array.from({ length: 50 }, (_, i) => `user${i}`);
            
            // Setup high-stress market conditions for all users
            mockServices.portfolioService.getPortfolio.mockImplementation((userId) => ({
                userId,
                baseCurrency: 'USD',
                totalValue: 1000000 + Math.random() * 2000000,
                positions: [
                    { currency: 'EUR', amount: 400000, value: 400000 * 0.9 }, // 10% loss
                    { currency: 'GBP', amount: 300000, value: 300000 * 0.85 }, // 15% loss
                    { currency: 'JPY', amount: 50000000, value: 300000 * 0.8 } // 20% loss
                ]
            }));

            const stressRates = {
                'EUR/USD': { rate: 0.9, volatility: 0.6, timestamp: new Date() },
                'GBP/USD': { rate: 1.1, volatility: 0.7, timestamp: new Date() },
                'JPY/USD': { rate: 0.006, volatility: 0.5, timestamp: new Date() }
            };

            mockServices.exchangeRateService.getCurrentRates.mockResolvedValue(stressRates);

            const startTime = Date.now();
            
            // Perform risk calculations for all users simultaneously
            const riskPromises = userIds.map(userId => riskEngine.calculateRisk(userId));
            const results = await Promise.allSettled(riskPromises);
            
            const endTime = Date.now();
            const totalTime = endTime - startTime;
            
            // Check that most calculations succeeded
            const successfulResults = results.filter(r => r.status === 'fulfilled');
            expect(successfulResults.length).toBeGreaterThan(userIds.length * 0.9); // 90% success rate
            
            // Performance should still be reasonable under stress
            expect(totalTime).toBeLessThan(10000); // Under 10 seconds for 50 users
        });

        it('should handle cascading failures gracefully', async () => {
            const userId = 'user123';
            
            // Simulate cascading service failures
            mockServices.portfolioService.getPortfolio.mockRejectedValue(new Error('Portfolio service down'));
            mockServices.exchangeRateService.getCurrentRates.mockRejectedValue(new Error('Rate service down'));
            mockServices.marketDataService.getCurrencyData.mockRejectedValue(new Error('Market data down'));

            // Risk engine should handle failures gracefully
            await expect(riskEngine.calculateRisk(userId)).rejects.toThrow();
            
            // But monitoring should continue with fallback mechanisms
            riskMonitor.getCurrentRate = jest.fn().mockReturnValue(1.0); // Fallback rate
            
            // Should not crash the monitoring system
            expect(() => riskMonitor.checkUserRisk(userId)).not.toThrow();
        });
    });

    describe('Recovery Scenarios', () => {
        it('should handle market recovery and risk normalization', async () => {
            const userId = 'user123';
            
            // Start with crisis conditions
            const crisisPortfolio = {
                userId,
                baseCurrency: 'USD',
                totalValue: 800000, // 20% loss
                positions: [
                    { currency: 'EUR', amount: 300000, value: 270000 },
                    { currency: 'GBP', amount: 200000, value: 220000 },
                    { currency: 'USD', amount: 310000, value: 310000 }
                ]
            };

            const crisisRates = {
                'EUR/USD': { rate: 0.9, volatility: 0.5, timestamp: new Date() },
                'GBP/USD': { rate: 1.1, volatility: 0.6, timestamp: new Date() }
            };

            mockServices.portfolioService.getPortfolio.mockResolvedValue(crisisPortfolio);
            mockServices.portfolioService.getCurrencyExposures.mockResolvedValue(crisisPortfolio.positions);
            mockServices.exchangeRateService.getCurrentRates.mockResolvedValue(crisisRates);

            const crisisRisk = await riskEngine.calculateRisk(userId);
            expect(crisisRisk.var95).toBeGreaterThan(0.15);

            // Simulate market recovery
            const recoveryPortfolio = {
                ...crisisPortfolio,
                totalValue: 950000, // Partial recovery
                positions: [
                    { currency: 'EUR', amount: 300000, value: 315000 },
                    { currency: 'GBP', amount: 200000, value: 250000 },
                    { currency: 'USD', amount: 385000, value: 385000 }
                ]
            };

            const recoveryRates = {
                'EUR/USD': { rate: 1.05, volatility: 0.25, timestamp: new Date() },
                'GBP/USD': { rate: 1.25, volatility: 0.30, timestamp: new Date() }
            };

            mockServices.portfolioService.getPortfolio.mockResolvedValue(recoveryPortfolio);
            mockServices.portfolioService.getCurrencyExposures.mockResolvedValue(recoveryPortfolio.positions);
            mockServices.exchangeRateService.getCurrentRates.mockResolvedValue(recoveryRates);

            const recoveryRisk = await riskEngine.calculateRisk(userId);
            
            // Risk should decrease during recovery
            expect(recoveryRisk.var95).toBeLessThan(crisisRisk.var95);
            expect(recoveryRisk.portfolioVolatility).toBeLessThan(crisisRisk.portfolioVolatility);
        });
    });
});