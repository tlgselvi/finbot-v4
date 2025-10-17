/**
 * Hedging Strategy Optimizer Tests
 * 
 * Tests for comprehensive hedging strategy optimization including:
 * - Strategy generation and optimization
 * - Cost-benefit analysis
 * - Hedge effectiveness testing
 * - Implementation planning
 */

const HedgingStrategyOptimizer = require('../../src/multi-currency/risk/hedging-strategy-optimizer');

describe('HedgingStrategyOptimizer', () => {
    let optimizer;
    let mockCurrencyRisk;

    beforeEach(() => {
        optimizer = new HedgingStrategyOptimizer({
            maxIterations: 100, // Reduced for testing
            monteCarloSimulations: 50
        });

        mockCurrencyRisk = {
            id: 'risk-1',
            userId: 'user-1',
            baseCurrency: 'USD',
            exposures: new Map([
                ['EUR', {
                    currency: 'EUR',
                    absoluteExposure: 100000,
                    relativeExposure: 0.4,
                    exposureRank: 1
                }],
                ['GBP', {
                    currency: 'GBP',
                    absoluteExposure: 75000,
                    relativeExposure: 0.3,
                    exposureRank: 2
                }],
                ['JPY', {
                    currency: 'JPY',
                    absoluteExposure: 50000,
                    relativeExposure: 0.2,
                    exposureRank: 3
                }]
            ]),
            totalRisk: 50000,
            var: {
                parametric: {
                    var95: 25000,
                    var99: 35000
                }
            },
            riskFactors: [
                {
                    type: 'individual',
                    currency: 'EUR',
                    riskContribution: 20000,
                    relativeContribution: 0.4
                },
                {
                    type: 'individual',
                    currency: 'GBP',
                    riskContribution: 15000,
                    relativeContribution: 0.3
                },
                {
                    type: 'individual',
                    currency: 'JPY',
                    riskContribution: 10000,
                    relativeContribution: 0.2
                }
            ],
            volatilities: new Map([
                ['EUR', { annual: 0.15, daily: 0.01 }],
                ['GBP', { annual: 0.20, daily: 0.013 }],
                ['JPY', { annual: 0.12, daily: 0.008 }]
            ]),
            correlationMatrix: new Map([
                ['EUR-GBP', 0.7],
                ['EUR-JPY', 0.3],
                ['GBP-JPY', 0.2]
            ]),
            riskScore: 65
        };
    });

    afterEach(() => {
        if (optimizer) {
            optimizer.removeAllListeners();
        }
    });

    describe('Hedging Strategy Generation', () => {
        test('should generate hedging strategies for currency exposures', async () => {
            const strategies = await optimizer.generateHedgingStrategies('user-1', mockCurrencyRisk);

            expect(strategies).toHaveProperty('id');
            expect(strategies).toHaveProperty('userId', 'user-1');
            expect(strategies).toHaveProperty('baseCurrency', 'USD');
            expect(strategies).toHaveProperty('hedgingNeeds');
            expect(strategies).toHaveProperty('recommendedStrategy');
            expect(strategies).toHaveProperty('alternativeStrategies');
            expect(strategies).toHaveProperty('implementationPlan');
            expect(strategies).toHaveProperty('riskReduction');
            expect(strategies).toHaveProperty('totalCost');
            expect(strategies).toHaveProperty('expectedEffectiveness');

            expect(Array.isArray(strategies.hedgingNeeds)).toBe(true);
            expect(Array.isArray(strategies.alternativeStrategies)).toBe(true);
            expect(strategies.recommendedStrategy).toHaveProperty('id');
            expect(strategies.implementationPlan).toHaveProperty('phases');
        });

        test('should emit strategyGenerated event', async () => {
            const eventPromise = new Promise(resolve => {
                optimizer.once('strategyGenerated', resolve);
            });

            await optimizer.generateHedgingStrategies('user-1', mockCurrencyRisk);
            const event = await eventPromise;

            expect(event).toHaveProperty('userId', 'user-1');
            expect(event).toHaveProperty('recommendedStrategy');
        });

        test('should handle generation errors gracefully', async () => {
            const eventPromise = new Promise(resolve => {
                optimizer.once('error', resolve);
            });

            // Mock a method to throw an error
            jest.spyOn(optimizer, 'analyzeHedgingNeeds').mockImplementation(() => {
                throw new Error('Test error');
            });

            await expect(optimizer.generateHedgingStrategies('user-1', mockCurrencyRisk))
                .rejects.toThrow('Test error');

            const errorEvent = await eventPromise;
            expect(errorEvent).toHaveProperty('type', 'HEDGING_OPTIMIZATION_ERROR');
            expect(errorEvent).toHaveProperty('userId', 'user-1');
        });
    });

    describe('Hedging Needs Analysis', () => {
        test('should analyze hedging needs correctly', () => {
            const hedgingNeeds = optimizer.analyzeHedgingNeeds(mockCurrencyRisk);

            expect(Array.isArray(hedgingNeeds)).toBe(true);
            expect(hedgingNeeds.length).toBeGreaterThan(0);

            for (const need of hedgingNeeds) {
                expect(need).toHaveProperty('currency');
                expect(need).toHaveProperty('exposure');
                expect(need).toHaveProperty('relativeExposure');
                expect(need).toHaveProperty('priority');
                expect(need).toHaveProperty('riskContribution');
                expect(need).toHaveProperty('volatility');
                expect(need).toHaveProperty('recommendedHedgeRatio');
                expect(need).toHaveProperty('timeHorizon');
                expect(need).toHaveProperty('urgency');

                expect(['high', 'medium', 'low']).toContain(need.priority);
                expect(['immediate', 'high', 'medium', 'low']).toContain(need.urgency);
                expect(need.recommendedHedgeRatio).toBeGreaterThan(0);
                expect(need.recommendedHedgeRatio).toBeLessThanOrEqual(1);
            }
        });

        test('should prioritize high concentration exposures', () => {
            const hedgingNeeds = optimizer.analyzeHedgingNeeds(mockCurrencyRisk);
            
            // EUR has 40% concentration, should be high priority
            const eurNeed = hedgingNeeds.find(need => need.currency === 'EUR');
            expect(eurNeed).toBeDefined();
            expect(eurNeed.priority).toBe('high');
        });

        test('should sort needs by priority and risk contribution', () => {
            const hedgingNeeds = optimizer.analyzeHedgingNeeds(mockCurrencyRisk);
            
            // Check that needs are sorted properly
            for (let i = 1; i < hedgingNeeds.length; i++) {
                const current = hedgingNeeds[i];
                const previous = hedgingNeeds[i - 1];
                
                const currentPriorityScore = optimizer.getPriorityScore(current.priority);
                const previousPriorityScore = optimizer.getPriorityScore(previous.priority);
                
                if (currentPriorityScore !== previousPriorityScore) {
                    expect(currentPriorityScore).toBeLessThanOrEqual(previousPriorityScore);
                } else {
                    expect(current.riskContribution).toBeLessThanOrEqual(previous.riskContribution);
                }
            }
        });
    });

    describe('Hedging Need Assessment', () => {
        test('should assess high concentration as high priority', () => {
            const highConcExposure = {
                currency: 'EUR',
                absoluteExposure: 100000,
                relativeExposure: 0.6 // 60% concentration
            };

            const assessment = optimizer.assessHedgingNeed(highConcExposure, mockCurrencyRisk);

            expect(assessment.required).toBe(true);
            expect(assessment.priority).toBe('high');
            expect(assessment.urgency).toBe('immediate');
            expect(assessment.recommendedRatio).toBeGreaterThan(0.5);
        });

        test('should assess high volatility as medium priority', () => {
            const highVolExposure = {
                currency: 'GBP',
                absoluteExposure: 50000,
                relativeExposure: 0.2 // 20% concentration, but high volatility
            };

            // Mock high volatility
            jest.spyOn(optimizer, 'getVolatility').mockReturnValue(0.25); // 25% volatility

            const assessment = optimizer.assessHedgingNeed(highVolExposure, mockCurrencyRisk);

            expect(assessment.required).toBe(true);
            expect(assessment.priority).toBe('medium');
            expect(assessment.urgency).toBe('high');
        });

        test('should not require hedging for low risk exposures', () => {
            const lowRiskExposure = {
                currency: 'CHF',
                absoluteExposure: 10000,
                relativeExposure: 0.05 // 5% concentration
            };

            // Mock low volatility
            jest.spyOn(optimizer, 'getVolatility').mockReturnValue(0.08); // 8% volatility

            const assessment = optimizer.assessHedgingNeed(lowRiskExposure, mockCurrencyRisk);

            expect(assessment.required).toBe(false);
        });
    });

    describe('Strategy Alternative Generation', () => {
        test('should generate strategy alternatives', async () => {
            const hedgingNeeds = optimizer.analyzeHedgingNeeds(mockCurrencyRisk);
            const strategies = await optimizer.generateStrategyAlternatives(hedgingNeeds);

            expect(Array.isArray(strategies)).toBe(true);
            expect(strategies.length).toBeGreaterThan(0);

            for (const strategy of strategies) {
                expect(strategy).toHaveProperty('id');
                expect(strategy).toHaveProperty('type');
                expect(strategy).toHaveProperty('currency');
                expect(strategy).toHaveProperty('exposure');
                expect(strategy).toHaveProperty('hedgeRatio');
                expect(strategy).toHaveProperty('timeHorizon');
                expect(strategy).toHaveProperty('cost');
                expect(strategy).toHaveProperty('effectiveness');
                expect(strategy).toHaveProperty('liquidity');

                expect(['single_instrument', 'combination', 'basket_hedge', 'natural_hedge'])
                    .toContain(strategy.type);
                expect(['high', 'medium', 'low']).toContain(strategy.liquidity);
            }
        });

        test('should generate combination strategies for large exposures', async () => {
            // Create a large exposure scenario
            const largeExposureRisk = {
                ...mockCurrencyRisk,
                exposures: new Map([
                    ['EUR', {
                        currency: 'EUR',
                        absoluteExposure: 500000, // Large exposure
                        relativeExposure: 0.8,
                        exposureRank: 1
                    }]
                ])
            };

            const hedgingNeeds = optimizer.analyzeHedgingNeeds(largeExposureRisk);
            const strategies = await optimizer.generateStrategyAlternatives(hedgingNeeds);

            const combinationStrategies = strategies.filter(s => s.type === 'combination');
            expect(combinationStrategies.length).toBeGreaterThan(0);

            const combinationStrategy = combinationStrategies[0];
            expect(combinationStrategy).toHaveProperty('instruments');
            expect(Array.isArray(combinationStrategy.instruments)).toBe(true);
            expect(combinationStrategy.instruments.length).toBe(2);
        });

        test('should generate portfolio-level strategies', async () => {
            const hedgingNeeds = optimizer.analyzeHedgingNeeds(mockCurrencyRisk);
            const strategies = await optimizer.generateStrategyAlternatives(hedgingNeeds);

            const portfolioStrategies = strategies.filter(s => 
                s.type === 'basket_hedge' || s.type === 'natural_hedge'
            );
            
            expect(portfolioStrategies.length).toBeGreaterThan(0);
        });
    });

    describe('Hedge Ratio Optimization', () => {
        test('should optimize hedge ratios', async () => {
            const mockStrategy = {
                id: 'strategy-1',
                type: 'single_instrument',
                currency: 'EUR',
                exposure: 100000,
                hedgeRatio: 0.5,
                effectiveness: 0.9
            };

            const optimizedStrategies = await optimizer.optimizeHedgeRatios([mockStrategy], mockCurrencyRisk);

            expect(optimizedStrategies).toHaveLength(1);
            const optimized = optimizedStrategies[0];

            expect(optimized).toHaveProperty('hedgeRatio');
            expect(optimized).toHaveProperty('optimizationDetails');
            expect(optimized.optimizationDetails).toHaveProperty('originalRatio', 0.5);
            expect(optimized.optimizationDetails).toHaveProperty('optimizedRatio');
            expect(optimized.optimizationDetails).toHaveProperty('improvement');
            expect(optimized.optimizationDetails).toHaveProperty('method', 'gradient_descent');

            expect(optimized.hedgeRatio).toBeGreaterThanOrEqual(0.25);
            expect(optimized.hedgeRatio).toBeLessThanOrEqual(1.0);
        });

        test('should find optimal hedge ratio within bounds', async () => {
            const mockStrategy = {
                id: 'strategy-1',
                type: 'single_instrument',
                currency: 'EUR',
                exposure: 100000,
                hedgeRatio: 0.5,
                effectiveness: 0.9
            };

            const optimalRatio = await optimizer.findOptimalHedgeRatio(mockStrategy, mockCurrencyRisk);

            expect(optimalRatio).toBeGreaterThanOrEqual(optimizer.config.hedgeRatioRange.min);
            expect(optimalRatio).toBeLessThanOrEqual(optimizer.config.hedgeRatioRange.max);
        });

        test('should evaluate hedge ratio effectiveness', async () => {
            const mockStrategy = {
                id: 'strategy-1',
                type: 'single_instrument',
                currency: 'EUR',
                exposure: 100000,
                effectiveness: 0.9
            };

            const score = await optimizer.evaluateHedgeRatio(0.7, mockStrategy, mockCurrencyRisk);

            expect(typeof score).toBe('number');
            expect(score).toBeGreaterThan(0);
        });
    });

    describe('Cost-Benefit Analysis', () => {
        test('should perform comprehensive cost-benefit analysis', async () => {
            const mockStrategy = {
                id: 'strategy-1',
                type: 'single_instrument',
                currency: 'EUR',
                exposure: 100000,
                hedgeRatio: 0.7,
                effectiveness: 0.9,
                cost: 1000,
                timeHorizon: 90,
                liquidity: 'high'
            };

            const analyzed = await optimizer.performCostBenefitAnalysis([mockStrategy], mockCurrencyRisk);

            expect(analyzed).toHaveLength(1);
            const analysis = analyzed[0];

            expect(analysis).toHaveProperty('costBenefitAnalysis');
            const cba = analysis.costBenefitAnalysis;

            // Check cost components
            expect(cba).toHaveProperty('directCost');
            expect(cba).toHaveProperty('opportunityCost');
            expect(cba).toHaveProperty('transactionCost');
            expect(cba).toHaveProperty('totalCost');

            // Check benefit components
            expect(cba).toHaveProperty('riskReduction');
            expect(cba).toHaveProperty('volatilityReduction');
            expect(cba).toHaveProperty('downSideProtection');
            expect(cba).toHaveProperty('totalBenefit');

            // Check ratios
            expect(cba).toHaveProperty('benefitCostRatio');
            expect(cba).toHaveProperty('riskAdjustedReturn');

            // Check effectiveness metrics
            expect(cba).toHaveProperty('hedgeEffectiveness');
            expect(cba).toHaveProperty('correlationEffectiveness');

            // Check scenario analysis
            expect(cba).toHaveProperty('scenarioAnalysis');
            expect(Array.isArray(cba.scenarioAnalysis)).toBe(true);

            // Verify calculations
            expect(cba.totalCost).toBe(cba.directCost + cba.opportunityCost + cba.transactionCost);
            expect(cba.totalBenefit).toBe(cba.riskReduction + cba.volatilityReduction + cba.downSideProtection);
        });

        test('should calculate scenario analysis correctly', async () => {
            const mockStrategy = {
                id: 'strategy-1',
                type: 'single_instrument',
                currency: 'EUR',
                exposure: 100000,
                hedgeRatio: 0.7,
                effectiveness: 0.9
            };

            const scenarioAnalysis = await optimizer.performScenarioAnalysis(mockStrategy, mockCurrencyRisk);

            expect(Array.isArray(scenarioAnalysis)).toBe(true);
            expect(scenarioAnalysis.length).toBeGreaterThan(0);

            for (const scenario of scenarioAnalysis) {
                expect(scenario).toHaveProperty('scenario');
                expect(scenario).toHaveProperty('probability');
                expect(scenario).toHaveProperty('marketMove');
                expect(scenario).toHaveProperty('unhedgedLoss');
                expect(scenario).toHaveProperty('hedgedLoss');
                expect(scenario).toHaveProperty('hedgeCost');
                expect(scenario).toHaveProperty('netBenefit');
                expect(scenario).toHaveProperty('effectiveProtection');

                expect(scenario.probability).toBeGreaterThan(0);
                expect(scenario.probability).toBeLessThanOrEqual(1);
                expect(scenario.hedgedLoss).toBeLessThanOrEqual(scenario.unhedgedLoss);
            }

            // Check that probabilities sum to approximately 1
            const totalProbability = scenarioAnalysis.reduce((sum, s) => sum + s.probability, 0);
            expect(totalProbability).toBeCloseTo(1, 1);
        });
    });

    describe('Strategy Ranking', () => {
        test('should rank strategies by efficiency', () => {
            const mockStrategies = [
                {
                    id: 'strategy-1',
                    type: 'single_instrument',
                    liquidity: 'high',
                    costBenefitAnalysis: {
                        benefitCostRatio: 5,
                        riskReduction: 10000,
                        hedgeEffectiveness: 0.9
                    }
                },
                {
                    id: 'strategy-2',
                    type: 'combination',
                    liquidity: 'medium',
                    costBenefitAnalysis: {
                        benefitCostRatio: 3,
                        riskReduction: 15000,
                        hedgeEffectiveness: 0.8
                    }
                },
                {
                    id: 'strategy-3',
                    type: 'single_instrument',
                    liquidity: 'low',
                    costBenefitAnalysis: {
                        benefitCostRatio: 8,
                        riskReduction: 5000,
                        hedgeEffectiveness: 0.95
                    }
                }
            ];

            const ranked = optimizer.rankStrategiesByEfficiency(mockStrategies);

            expect(ranked).toHaveLength(3);
            
            // Check that strategies are sorted by efficiency score (descending)
            for (let i = 1; i < ranked.length; i++) {
                const currentScore = optimizer.calculateEfficiencyScore(ranked[i]);
                const previousScore = optimizer.calculateEfficiencyScore(ranked[i - 1]);
                expect(currentScore).toBeLessThanOrEqual(previousScore);
            }
        });

        test('should calculate efficiency score correctly', () => {
            const mockStrategy = {
                type: 'single_instrument',
                liquidity: 'high',
                costBenefitAnalysis: {
                    benefitCostRatio: 5,
                    riskReduction: 10000,
                    hedgeEffectiveness: 0.9
                }
            };

            const score = optimizer.calculateEfficiencyScore(mockStrategy);

            expect(typeof score).toBe('number');
            expect(score).toBeGreaterThan(0);
            expect(score).toBeLessThanOrEqual(1);
        });
    });

    describe('Implementation Planning', () => {
        test('should generate comprehensive implementation plan', async () => {
            const mockStrategy = {
                id: 'strategy-1',
                type: 'single_instrument',
                currency: 'EUR',
                exposure: 100000,
                timeHorizon: 90
            };

            const plan = await optimizer.generateImplementationPlan(mockStrategy, mockCurrencyRisk);

            expect(plan).toHaveProperty('id');
            expect(plan).toHaveProperty('strategyId', mockStrategy.id);
            expect(plan).toHaveProperty('phases');
            expect(plan).toHaveProperty('timeline');
            expect(plan).toHaveProperty('prerequisites');
            expect(plan).toHaveProperty('riskConsiderations');
            expect(plan).toHaveProperty('monitoringPlan');

            expect(Array.isArray(plan.phases)).toBe(true);
            expect(plan.phases.length).toBe(3); // Preparation, Implementation, Monitoring

            // Check phase structure
            for (const phase of plan.phases) {
                expect(phase).toHaveProperty('phase');
                expect(phase).toHaveProperty('name');
                expect(phase).toHaveProperty('duration');
                expect(phase).toHaveProperty('tasks');
                expect(phase).toHaveProperty('deliverables');

                expect(Array.isArray(phase.tasks)).toBe(true);
                expect(Array.isArray(phase.deliverables)).toBe(true);
            }
        });

        test('should calculate implementation timeline correctly', () => {
            const simpleStrategy = {
                type: 'single_instrument',
                exposure: 50000
            };

            const complexStrategy = {
                type: 'combination',
                exposure: 2000000
            };

            const simpleTimeline = optimizer.calculateImplementationTimeline(simpleStrategy);
            const complexTimeline = optimizer.calculateImplementationTimeline(complexStrategy);

            expect(typeof simpleTimeline).toBe('number');
            expect(typeof complexTimeline).toBe('number');
            expect(complexTimeline).toBeGreaterThan(simpleTimeline);
        });

        test('should identify prerequisites correctly', () => {
            const largeStrategy = {
                type: 'combination',
                exposure: 1000000
            };

            const prerequisites = optimizer.identifyPrerequisites(largeStrategy);

            expect(Array.isArray(prerequisites)).toBe(true);
            expect(prerequisites).toContain('Risk approval');
            expect(prerequisites).toContain('Counterparty agreement');
            expect(prerequisites).toContain('Senior management approval');
            expect(prerequisites).toContain('Complex derivatives approval');
        });
    });

    describe('Helper Methods', () => {
        test('should calculate instrument cost correctly', () => {
            const amount = 100000;
            const instrument = {
                costBasisPoints: 50 // 0.5%
            };

            const cost = optimizer.calculateInstrumentCost(amount, instrument);
            expect(cost).toBe(500); // 100000 * 0.005
        });

        test('should get risk contribution correctly', () => {
            const riskFactors = [
                { type: 'individual', currency: 'EUR', riskContribution: 10000 },
                { type: 'individual', currency: 'GBP', riskContribution: 5000 }
            ];

            const eurContribution = optimizer.getRiskContribution('EUR', riskFactors);
            const gbpContribution = optimizer.getRiskContribution('GBP', riskFactors);
            const unknownContribution = optimizer.getRiskContribution('JPY', riskFactors);

            expect(eurContribution).toBe(10000);
            expect(gbpContribution).toBe(5000);
            expect(unknownContribution).toBe(0);
        });

        test('should get volatility correctly', () => {
            const volatilities = new Map([
                ['EUR', { annual: 0.15 }],
                ['GBP', { annual: 0.20 }]
            ]);

            const eurVol = optimizer.getVolatility('EUR', volatilities);
            const gbpVol = optimizer.getVolatility('GBP', volatilities);
            const unknownVol = optimizer.getVolatility('JPY', volatilities);

            expect(eurVol).toBe(0.15);
            expect(gbpVol).toBe(0.20);
            expect(unknownVol).toBe(0.15); // Default value
        });

        test('should calculate priority scores correctly', () => {
            expect(optimizer.getPriorityScore('high')).toBe(3);
            expect(optimizer.getPriorityScore('medium')).toBe(2);
            expect(optimizer.getPriorityScore('low')).toBe(1);
            expect(optimizer.getPriorityScore('unknown')).toBe(0);
        });

        test('should calculate liquidity scores correctly', () => {
            expect(optimizer.getLiquidityScore('high')).toBe(1);
            expect(optimizer.getLiquidityScore('medium')).toBe(0.7);
            expect(optimizer.getLiquidityScore('low')).toBe(0.4);
            expect(optimizer.getLiquidityScore('unknown')).toBe(0.5);
        });

        test('should identify natural hedge opportunities', () => {
            const hedgingNeeds = [
                { currency: 'USD', exposure: 100000 },
                { currency: 'EUR', exposure: 80000 },
                { currency: 'JPY', exposure: 50000 },
                { currency: 'AUD', exposure: 30000 }
            ];

            const opportunities = optimizer.identifyNaturalHedgeOpportunities(hedgingNeeds);

            expect(Array.isArray(opportunities)).toBe(true);
            
            for (const opportunity of opportunities) {
                expect(opportunity).toHaveProperty('type', 'natural_hedge');
                expect(opportunity).toHaveProperty('currencies');
                expect(opportunity).toHaveProperty('exposures');
                expect(opportunity).toHaveProperty('hedgeRatio');
                expect(opportunity).toHaveProperty('cost', 0);
                expect(Array.isArray(opportunity.currencies)).toBe(true);
                expect(opportunity.currencies.length).toBe(2);
            }
        });

        test('should check negative correlations correctly', () => {
            expect(optimizer.areNegativelyCorrelated('USD', 'EUR')).toBe(true);
            expect(optimizer.areNegativelyCorrelated('EUR', 'USD')).toBe(true);
            expect(optimizer.areNegativelyCorrelated('JPY', 'AUD')).toBe(true);
            expect(optimizer.areNegativelyCorrelated('EUR', 'GBP')).toBe(false);
        });
    });
});