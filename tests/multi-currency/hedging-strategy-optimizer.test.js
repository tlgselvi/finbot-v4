/**
 * Tests for Hedging Strategy Optimizer
 */

const HedgingStrategyOptimizer = require('../../src/multi-currency/risk/hedging-strategy-optimizer');

describe('HedgingStrategyOptimizer', () => {
    let optimizer;
    let mockRiskCalculator;
    let mockMarketDataService;
    let mockCostCalculator;

    beforeEach(() => {
        mockRiskCalculator = {
            calculateRisk: jest.fn()
        };

        mockMarketDataService = {
            getCurrencyData: jest.fn()
        };

        mockCostCalculator = {
            calculateCost: jest.fn()
        };

        optimizer = new HedgingStrategyOptimizer({
            riskCalculator: mockRiskCalculator,
            marketDataService: mockMarketDataService,
            costCalculator: mockCostCalculator,
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        });
    });

    describe('generateHedgingRecommendations', () => {
        it('should generate hedging recommendations for high-risk exposures', async () => {
            const userId = 'user123';
            const mockRiskAssessment = {
                exposures: [
                    {
                        currency: 'EUR',
                        amount: 100000,
                        percentage: 0.4,
                        riskLevel: 0.08,
                        direction: 'long'
                    },
                    {
                        currency: 'GBP',
                        amount: 50000,
                        percentage: 0.2,
                        riskLevel: 0.03,
                        direction: 'short'
                    }
                ],
                portfolioValue: 250000,
                var95: 0.06
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

            mockRiskCalculator.calculateRisk.mockResolvedValue(mockRiskAssessment);
            mockMarketDataService.getCurrencyData.mockImplementation((currency) => {
                return Promise.resolve(mockMarketData[currency]);
            });

            const result = await optimizer.generateHedgingRecommendations(userId);

            expect(result).toHaveProperty('recommendations');
            expect(result).toHaveProperty('costBenefitAnalysis');
            expect(result).toHaveProperty('riskReduction');
            expect(result).toHaveProperty('totalCost');
            expect(result.recommendations.length).toBeGreaterThan(0);
            
            // Should only recommend hedging for EUR (high risk), not GBP (low risk)
            const eurRecommendations = result.recommendations.filter(r => r.targetCurrency === 'EUR');
            expect(eurRecommendations.length).toBeGreaterThan(0);
        });

        it('should handle market data failures gracefully', async () => {
            const userId = 'user123';
            const mockRiskAssessment = {
                exposures: [
                    {
                        currency: 'EUR',
                        amount: 100000,
                        riskLevel: 0.08,
                        direction: 'long'
                    }
                ],
                portfolioValue: 250000
            };

            mockRiskCalculator.calculateRisk.mockResolvedValue(mockRiskAssessment);
            mockMarketDataService.getCurrencyData.mockRejectedValue(new Error('Market data unavailable'));

            const result = await optimizer.generateHedgingRecommendations(userId);

            expect(result.recommendations.length).toBeGreaterThan(0);
            // Should use default market data
        });
    });

    describe('optimizeHedgingStrategies', () => {
        it('should create strategies for preferred instruments', async () => {
            const exposure = {
                currency: 'EUR',
                amount: 100000,
                riskLevel: 0.08,
                direction: 'long'
            };

            const marketData = {
                EUR: {
                    forward_contract: {
                        spotRate: 1.1,
                        forwardRates: { '3M': 1.105 }
                    },
                    currency_option: {
                        spotRate: 1.1,
                        impliedVolatility: 0.12
                    }
                }
            };

            const strategies = await optimizer.optimizeHedgingStrategies(exposure, marketData, {
                template: 'balanced'
            });

            expect(strategies.length).toBeGreaterThan(0);
            expect(strategies[0]).toHaveProperty('type');
            expect(strategies[0]).toHaveProperty('hedgeRatio');
            expect(strategies[0]).toHaveProperty('cost');
            expect(strategies[0]).toHaveProperty('effectiveness');
        });
    });

    describe('createOptimalStrategy', () => {
        it('should create forward contract strategy', async () => {
            const exposure = {
                currency: 'EUR',
                amount: 100000,
                direction: 'long'
            };

            const instrumentData = {
                spotRate: 1.1,
                forwardRates: { '3M': 1.105 }
            };

            const config = {
                name: 'Test Strategy',
                defaultHedgeRatio: 0.8,
                preferredInstruments: ['forward_contract']
            };

            const strategy = await optimizer.createOptimalStrategy(
                exposure, 'forward_contract', instrumentData, config
            );

            expect(strategy).toBeTruthy();
            expect(strategy.type).toBe('forward_contract');
            expect(strategy.instruments.length).toBe(1);
            expect(strategy.instruments[0].type).toBe('forward_contract');
            expect(strategy.instruments[0].rate).toBe(1.105);
        });

        it('should create currency option strategy', async () => {
            const exposure = {
                currency: 'EUR',
                amount: 100000,
                direction: 'long'
            };

            const instrumentData = {
                spotRate: 1.1,
                impliedVolatility: 0.12
            };

            const config = {
                name: 'Test Strategy',
                defaultHedgeRatio: 0.6,
                preferredInstruments: ['currency_option']
            };

            const strategy = await optimizer.createOptimalStrategy(
                exposure, 'currency_option', instrumentData, config
            );

            expect(strategy).toBeTruthy();
            expect(strategy.type).toBe('currency_option');
            expect(strategy.instruments.length).toBe(1);
            expect(strategy.instruments[0].type).toBe('currency_option');
            expect(strategy.instruments[0].optionType).toBe('put'); // Long exposure needs put option
        });
    });

    describe('performCostBenefitAnalysis', () => {
        it('should calculate comprehensive cost-benefit metrics', async () => {
            const recommendations = [
                {
                    riskReduction: 0.4,
                    cost: 1000,
                    effectiveness: 0.8
                },
                {
                    riskReduction: 0.3,
                    cost: 800,
                    effectiveness: 0.7
                }
            ];

            const riskAssessment = {
                portfolioValue: 250000,
                var95: 0.06
            };

            const analysis = await optimizer.performCostBenefitAnalysis(recommendations, riskAssessment);

            expect(analysis).toHaveProperty('totalRiskReduction');
            expect(analysis).toHaveProperty('totalCost');
            expect(analysis).toHaveProperty('netBenefit');
            expect(analysis).toHaveProperty('paybackPeriod');
            expect(analysis).toHaveProperty('scenarios');
            
            expect(analysis.totalRiskReduction).toBe(0.7);
            expect(analysis.totalCost).toBe(1800);
            expect(analysis.scenarios.length).toBeGreaterThan(0);
        });
    });

    describe('rankRecommendations', () => {
        it('should rank recommendations by risk reduction per unit cost', () => {
            const recommendations = [
                { riskReduction: 0.3, cost: 1000 },
                { riskReduction: 0.4, cost: 1200 },
                { riskReduction: 0.2, cost: 500 }
            ];

            const ranked = optimizer.rankRecommendations(recommendations);

            // Should be ranked by risk reduction per unit cost
            expect(ranked[0].riskReduction / ranked[0].cost).toBeGreaterThanOrEqual(
                ranked[1].riskReduction / ranked[1].cost
            );
        });
    });

    describe('calculateStrategyCost', () => {
        it('should calculate forward contract cost', async () => {
            const strategy = {
                instruments: [{
                    type: 'forward_contract',
                    amount: 100000
                }],
                exposure: 100000
            };

            const cost = await optimizer.calculateStrategyCost(strategy);

            expect(cost).toBeGreaterThan(0);
            expect(cost).toBe(110); // 0.1% spread + 0.01% management fee
        });

        it('should calculate option cost including premium', async () => {
            const strategy = {
                instruments: [{
                    type: 'currency_option',
                    amount: 100000,
                    premium: 0.02
                }],
                exposure: 100000
            };

            const cost = await optimizer.calculateStrategyCost(strategy);

            expect(cost).toBeGreaterThan(2000); // Premium cost + management fee
        });
    });

    describe('calculateEffectiveness', () => {
        it('should calculate high effectiveness for forward contracts', async () => {
            const strategy = {
                instruments: [{
                    type: 'forward_contract'
                }],
                marketConditions: {
                    volatility: 0.12,
                    liquidity: 'high'
                }
            };

            const exposure = { currency: 'EUR' };
            const effectiveness = await optimizer.calculateEffectiveness(strategy, exposure);

            expect(effectiveness).toBeGreaterThan(0.9);
            expect(effectiveness).toBeLessThanOrEqual(1.0);
        });

        it('should calculate delta-adjusted effectiveness for options', async () => {
            const strategy = {
                instruments: [{
                    type: 'currency_option',
                    delta: 0.6
                }],
                marketConditions: {
                    volatility: 0.12,
                    liquidity: 'high'
                }
            };

            const exposure = { currency: 'EUR' };
            const effectiveness = await optimizer.calculateEffectiveness(strategy, exposure);

            expect(effectiveness).toBeGreaterThan(0.5);
            expect(effectiveness).toBeLessThan(0.95);
        });
    });

    describe('Option Greeks Calculations', () => {
        it('should calculate option premium using Black-Scholes', () => {
            const premium = optimizer.calculateOptionPremium(1.1, 1.08, 0.15, 0.25, 0.02);
            
            expect(premium).toBeGreaterThan(0);
            expect(premium).toBeLessThan(0.1); // Reasonable premium range
        });

        it('should calculate option delta', () => {
            const delta = optimizer.calculateOptionDelta(1.1, 1.08, 0.15, 0.25);
            
            expect(delta).toBeGreaterThan(0);
            expect(delta).toBeLessThanOrEqual(1);
        });

        it('should calculate option gamma', () => {
            const gamma = optimizer.calculateOptionGamma(1.1, 1.08, 0.15, 0.25);
            
            expect(gamma).toBeGreaterThan(0);
        });

        it('should calculate option vega', () => {
            const vega = optimizer.calculateOptionVega(1.1, 1.08, 0.15, 0.25);
            
            expect(vega).toBeGreaterThan(0);
        });
    });

    describe('Utility Functions', () => {
        it('should calculate normal CDF correctly', () => {
            expect(optimizer.normalCDF(0)).toBeCloseTo(0.5, 2);
            expect(optimizer.normalCDF(1)).toBeGreaterThan(0.8);
            expect(optimizer.normalCDF(-1)).toBeLessThan(0.2);
        });

        it('should calculate normal PDF correctly', () => {
            expect(optimizer.normalPDF(0)).toBeCloseTo(0.399, 2);
            expect(optimizer.normalPDF(1)).toBeLessThan(optimizer.normalPDF(0));
        });

        it('should calculate error function correctly', () => {
            expect(optimizer.erf(0)).toBeCloseTo(0, 2);
            expect(optimizer.erf(1)).toBeGreaterThan(0.8);
            expect(optimizer.erf(-1)).toBeLessThan(-0.8);
        });
    });
});