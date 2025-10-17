/**
 * Currency Risk Engine Tests
 * 
 * Tests for comprehensive currency risk assessment including:
 * - VaR calculations (Historical, Parametric, Monte Carlo)
 * - Currency exposure analysis
 * - Correlation analysis and risk factor decomposition
 * - Stress testing and concentration risk analysis
 */

const CurrencyRiskEngine = require('../../src/multi-currency/risk/currency-risk-engine');

describe('CurrencyRiskEngine', () => {
    let riskEngine;
    let mockPortfolio;

    beforeEach(() => {
        riskEngine = new CurrencyRiskEngine({
            monteCarloSimulations: 1000, // Reduced for testing
            riskUpdateInterval: 1000 // 1 second for testing
        });

        mockPortfolio = {
            id: 'portfolio-1',
            userId: 'user-1',
            baseCurrency: 'USD',
            accounts: [
                {
                    id: 'acc-1',
                    currency: 'EUR',
                    balance: 50000,
                    accountType: 'checking'
                },
                {
                    id: 'acc-2',
                    currency: 'GBP',
                    balance: 30000,
                    accountType: 'savings'
                },
                {
                    id: 'acc-3',
                    currency: 'JPY',
                    balance: 2000000,
                    accountType: 'investment'
                },
                {
                    id: 'acc-4',
                    currency: 'USD',
                    balance: 100000,
                    accountType: 'checking'
                }
            ]
        };
    });

    afterEach(() => {
        if (riskEngine) {
            riskEngine.removeAllListeners();
        }
    });

    describe('Currency Risk Calculation', () => {
        test('should calculate comprehensive currency risk assessment', async () => {
            const riskAssessment = await riskEngine.calculateCurrencyRisk('user-1', mockPortfolio);

            expect(riskAssessment).toHaveProperty('id');
            expect(riskAssessment).toHaveProperty('userId', 'user-1');
            expect(riskAssessment).toHaveProperty('baseCurrency', 'USD');
            expect(riskAssessment).toHaveProperty('exposures');
            expect(riskAssessment).toHaveProperty('totalRisk');
            expect(riskAssessment).toHaveProperty('var');
            expect(riskAssessment).toHaveProperty('expectedShortfall');
            expect(riskAssessment).toHaveProperty('concentrationRisk');
            expect(riskAssessment).toHaveProperty('riskFactors');
            expect(riskAssessment).toHaveProperty('stressTests');
            expect(riskAssessment).toHaveProperty('riskScore');
            expect(riskAssessment).toHaveProperty('recommendations');

            // Verify VaR structure
            expect(riskAssessment.var).toHaveProperty('historical');
            expect(riskAssessment.var).toHaveProperty('parametric');
            expect(riskAssessment.var).toHaveProperty('monteCarlo');

            // Verify each VaR method has required properties
            expect(riskAssessment.var.historical).toHaveProperty('var95');
            expect(riskAssessment.var.historical).toHaveProperty('var99');
            expect(riskAssessment.var.parametric).toHaveProperty('var95');
            expect(riskAssessment.var.parametric).toHaveProperty('var99');
            expect(riskAssessment.var.monteCarlo).toHaveProperty('var95');
            expect(riskAssessment.var.monteCarlo).toHaveProperty('var99');
        });

        test('should emit riskCalculated event', async () => {
            const eventPromise = new Promise(resolve => {
                riskEngine.once('riskCalculated', resolve);
            });

            await riskEngine.calculateCurrencyRisk('user-1', mockPortfolio);
            const event = await eventPromise;

            expect(event).toHaveProperty('userId', 'user-1');
            expect(event).toHaveProperty('totalRisk');
        });

        test('should handle calculation errors gracefully', async () => {
            const eventPromise = new Promise(resolve => {
                riskEngine.once('error', resolve);
            });

            // Mock a method to throw an error
            jest.spyOn(riskEngine, 'calculateCurrencyExposures').mockRejectedValue(new Error('Test error'));

            await expect(riskEngine.calculateCurrencyRisk('user-1', mockPortfolio))
                .rejects.toThrow('Test error');

            const errorEvent = await eventPromise;
            expect(errorEvent).toHaveProperty('type', 'RISK_CALCULATION_ERROR');
            expect(errorEvent).toHaveProperty('userId', 'user-1');
        });
    });

    describe('Currency Exposure Analysis', () => {
        test('should calculate currency exposures correctly', async () => {
            const exposures = await riskEngine.calculateCurrencyExposures(mockPortfolio);

            expect(exposures).toBeInstanceOf(Map);
            expect(exposures.size).toBe(3); // EUR, GBP, JPY (USD is base currency)

            // Check EUR exposure
            const eurExposure = exposures.get('EUR');
            expect(eurExposure).toHaveProperty('currency', 'EUR');
            expect(eurExposure).toHaveProperty('absoluteExposure');
            expect(eurExposure).toHaveProperty('originalAmount', 50000);
            expect(eurExposure).toHaveProperty('relativeExposure');
            expect(eurExposure).toHaveProperty('exposureRank');

            // Verify all exposures have required properties
            for (const [currency, exposure] of exposures) {
                expect(exposure).toHaveProperty('currency');
                expect(exposure).toHaveProperty('absoluteExposure');
                expect(exposure).toHaveProperty('originalAmount');
                expect(exposure).toHaveProperty('exchangeRate');
                expect(exposure).toHaveProperty('relativeExposure');
                expect(exposure).toHaveProperty('exposureRank');
                expect(exposure.relativeExposure).toBeGreaterThan(0);
                expect(exposure.relativeExposure).toBeLessThanOrEqual(1);
            }
        });

        test('should rank exposures by size', async () => {
            const exposures = await riskEngine.calculateCurrencyExposures(mockPortfolio);
            const exposureArray = Array.from(exposures.values());

            // Check that ranks are assigned
            exposureArray.forEach(exposure => {
                expect(exposure.exposureRank).toBeGreaterThan(0);
                expect(exposure.exposureRank).toBeLessThanOrEqual(exposures.size);
            });

            // Check that ranks are unique
            const ranks = exposureArray.map(exp => exp.exposureRank);
            const uniqueRanks = [...new Set(ranks)];
            expect(uniqueRanks.length).toBe(ranks.length);
        });
    });

    describe('Volatility Calculations', () => {
        test('should calculate volatilities for all currencies', async () => {
            const exposures = await riskEngine.calculateCurrencyExposures(mockPortfolio);
            const volatilities = await riskEngine.calculateVolatilities(exposures);

            expect(volatilities).toBeInstanceOf(Map);
            expect(volatilities.size).toBe(exposures.size);

            for (const [currency, volatility] of volatilities) {
                expect(volatility).toHaveProperty('daily');
                expect(volatility).toHaveProperty('weekly');
                expect(volatility).toHaveProperty('monthly');
                expect(volatility).toHaveProperty('annual');
                expect(volatility).toHaveProperty('returns');

                expect(volatility.daily).toBeGreaterThan(0);
                expect(volatility.weekly).toBeGreaterThan(volatility.daily);
                expect(volatility.monthly).toBeGreaterThan(volatility.weekly);
                expect(volatility.annual).toBeGreaterThan(volatility.monthly);
                expect(Array.isArray(volatility.returns)).toBe(true);
            }
        });

        test('should calculate annualized volatilities correctly', async () => {
            const exposures = await riskEngine.calculateCurrencyExposures(mockPortfolio);
            const volatilities = await riskEngine.calculateVolatilities(exposures);

            for (const [currency, volatility] of volatilities) {
                // Check scaling relationships (approximately)
                const expectedWeekly = volatility.daily * Math.sqrt(7);
                const expectedMonthly = volatility.daily * Math.sqrt(30);
                const expectedAnnual = volatility.daily * Math.sqrt(252);

                expect(volatility.weekly).toBeCloseTo(expectedWeekly, 6);
                expect(volatility.monthly).toBeCloseTo(expectedMonthly, 6);
                expect(volatility.annual).toBeCloseTo(expectedAnnual, 6);
            }
        });
    });

    describe('Correlation Analysis', () => {
        test('should calculate correlation matrix', async () => {
            const exposures = await riskEngine.calculateCurrencyExposures(mockPortfolio);
            const correlations = await riskEngine.calculateCorrelationMatrix(exposures);

            expect(correlations).toBeInstanceOf(Map);

            const currencies = Array.from(exposures.keys());
            
            // Check diagonal elements (self-correlation should be 1)
            for (const currency of currencies) {
                const selfCorrelation = correlations.get(`${currency}-${currency}`);
                expect(selfCorrelation).toBe(1.0);
            }

            // Check symmetry
            for (let i = 0; i < currencies.length; i++) {
                for (let j = i + 1; j < currencies.length; j++) {
                    const curr1 = currencies[i];
                    const curr2 = currencies[j];
                    const corr12 = correlations.get(`${curr1}-${curr2}`);
                    const corr21 = correlations.get(`${curr2}-${curr1}`);
                    
                    expect(corr12).toBe(corr21);
                    expect(corr12).toBeGreaterThanOrEqual(-1);
                    expect(corr12).toBeLessThanOrEqual(1);
                }
            }
        });
    });

    describe('VaR Calculations', () => {
        test('should calculate Historical VaR', async () => {
            const exposures = await riskEngine.calculateCurrencyExposures(mockPortfolio);
            const volatilities = await riskEngine.calculateVolatilities(exposures);
            const historicalVaR = await riskEngine.calculateHistoricalVaR(exposures, volatilities);

            expect(historicalVaR).toHaveProperty('var95');
            expect(historicalVaR).toHaveProperty('var99');
            expect(historicalVaR).toHaveProperty('byCurrency');

            expect(historicalVaR.var95).toBeGreaterThan(0);
            expect(historicalVaR.var99).toBeGreaterThan(historicalVaR.var95); // 99% VaR should be higher
            
            expect(historicalVaR.byCurrency).toHaveProperty('var95');
            expect(historicalVaR.byCurrency).toHaveProperty('var99');
            expect(Array.isArray(historicalVaR.byCurrency.var95)).toBe(true);
            expect(Array.isArray(historicalVaR.byCurrency.var99)).toBe(true);
        });

        test('should calculate Parametric VaR', async () => {
            const exposures = await riskEngine.calculateCurrencyExposures(mockPortfolio);
            const volatilities = await riskEngine.calculateVolatilities(exposures);
            const correlations = await riskEngine.calculateCorrelationMatrix(exposures);
            const parametricVaR = await riskEngine.calculateParametricVaR(exposures, volatilities, correlations);

            expect(parametricVaR).toHaveProperty('var95');
            expect(parametricVaR).toHaveProperty('var99');
            expect(parametricVaR).toHaveProperty('portfolioStdDev');
            expect(parametricVaR).toHaveProperty('portfolioVariance');

            expect(parametricVaR.var95).toBeGreaterThan(0);
            expect(parametricVaR.var99).toBeGreaterThan(parametricVaR.var95);
            expect(parametricVaR.portfolioStdDev).toBeGreaterThan(0);
            expect(parametricVaR.portfolioVariance).toBeGreaterThan(0);
        });

        test('should calculate Monte Carlo VaR', async () => {
            const exposures = await riskEngine.calculateCurrencyExposures(mockPortfolio);
            const volatilities = await riskEngine.calculateVolatilities(exposures);
            const correlations = await riskEngine.calculateCorrelationMatrix(exposures);
            const monteCarloVaR = await riskEngine.calculateMonteCarloVaR(exposures, volatilities, correlations);

            expect(monteCarloVaR).toHaveProperty('var95');
            expect(monteCarloVaR).toHaveProperty('var99');
            expect(monteCarloVaR).toHaveProperty('meanReturn');
            expect(monteCarloVaR).toHaveProperty('stdDev');
            expect(monteCarloVaR).toHaveProperty('simulations');

            expect(monteCarloVaR.var95).toBeGreaterThan(0);
            expect(monteCarloVaR.var99).toBeGreaterThan(monteCarloVaR.var95);
            expect(monteCarloVaR.simulations).toBe(1000); // Our test configuration
        });

        test('should calculate Expected Shortfall', async () => {
            const exposures = await riskEngine.calculateCurrencyExposures(mockPortfolio);
            const volatilities = await riskEngine.calculateVolatilities(exposures);
            const correlations = await riskEngine.calculateCorrelationMatrix(exposures);
            const expectedShortfall = await riskEngine.calculateExpectedShortfall(exposures, volatilities, correlations);

            expect(expectedShortfall).toHaveProperty('es95');
            expect(expectedShortfall).toHaveProperty('es99');
            expect(expectedShortfall).toHaveProperty('interpretation');

            expect(expectedShortfall.es95).toBeGreaterThan(0);
            expect(expectedShortfall.es99).toBeGreaterThan(expectedShortfall.es95);
            expect(expectedShortfall.interpretation).toHaveProperty('es95');
            expect(expectedShortfall.interpretation).toHaveProperty('es99');
        });
    });

    describe('Concentration Risk Analysis', () => {
        test('should analyze concentration risk', async () => {
            const exposures = await riskEngine.calculateCurrencyExposures(mockPortfolio);
            const concentrationRisk = riskEngine.analyzeConcentrationRisk(exposures);

            expect(concentrationRisk).toHaveProperty('concentrations');
            expect(concentrationRisk).toHaveProperty('herfindahlIndex');
            expect(concentrationRisk).toHaveProperty('maxConcentration');
            expect(concentrationRisk).toHaveProperty('top3Concentration');
            expect(concentrationRisk).toHaveProperty('riskLevel');
            expect(concentrationRisk).toHaveProperty('recommendations');

            expect(Array.isArray(concentrationRisk.concentrations)).toBe(true);
            expect(concentrationRisk.herfindahlIndex).toBeGreaterThan(0);
            expect(concentrationRisk.herfindahlIndex).toBeLessThanOrEqual(1);
            expect(concentrationRisk.maxConcentration).toBeGreaterThan(0);
            expect(concentrationRisk.maxConcentration).toBeLessThanOrEqual(1);
            expect(['low', 'medium', 'high']).toContain(concentrationRisk.riskLevel);

            // Check concentrations are sorted by size
            for (let i = 1; i < concentrationRisk.concentrations.length; i++) {
                expect(concentrationRisk.concentrations[i].concentration)
                    .toBeLessThanOrEqual(concentrationRisk.concentrations[i-1].concentration);
            }
        });

        test('should identify high concentration currencies', async () => {
            // Create a portfolio with high concentration
            const highConcPortfolio = {
                ...mockPortfolio,
                accounts: [
                    { currency: 'EUR', balance: 90000, accountType: 'checking' },
                    { currency: 'GBP', balance: 5000, accountType: 'savings' },
                    { currency: 'USD', balance: 5000, accountType: 'checking' }
                ]
            };

            const exposures = await riskEngine.calculateCurrencyExposures(highConcPortfolio);
            const concentrationRisk = riskEngine.analyzeConcentrationRisk(exposures);

            const highConcCurrencies = concentrationRisk.concentrations
                .filter(conc => conc.isHighConcentration);
            
            expect(highConcCurrencies.length).toBeGreaterThan(0);
            expect(concentrationRisk.riskLevel).toBe('high');
        });
    });

    describe('Risk Factor Decomposition', () => {
        test('should decompose risk factors', async () => {
            const exposures = await riskEngine.calculateCurrencyExposures(mockPortfolio);
            const volatilities = await riskEngine.calculateVolatilities(exposures);
            const correlations = await riskEngine.calculateCorrelationMatrix(exposures);
            const riskFactors = await riskEngine.decomposeRiskFactors(exposures, volatilities, correlations);

            expect(Array.isArray(riskFactors)).toBe(true);
            expect(riskFactors.length).toBeGreaterThan(0);

            // Check individual risk factors
            const individualFactors = riskFactors.filter(f => f.type === 'individual');
            expect(individualFactors.length).toBe(exposures.size);

            for (const factor of individualFactors) {
                expect(factor).toHaveProperty('type', 'individual');
                expect(factor).toHaveProperty('currency');
                expect(factor).toHaveProperty('riskContribution');
                expect(factor).toHaveProperty('volatility');
                expect(factor).toHaveProperty('exposure');
                expect(factor).toHaveProperty('relativeContribution');
                
                expect(factor.riskContribution).toBeGreaterThan(0);
                expect(factor.relativeContribution).toBeGreaterThan(0);
                expect(factor.relativeContribution).toBeLessThanOrEqual(1);
            }

            // Check correlation factors
            const correlationFactors = riskFactors.filter(f => f.type === 'correlation');
            for (const factor of correlationFactors) {
                expect(factor).toHaveProperty('type', 'correlation');
                expect(factor).toHaveProperty('currencies');
                expect(factor).toHaveProperty('correlation');
                expect(factor).toHaveProperty('riskContribution');
                expect(Array.isArray(factor.currencies)).toBe(true);
                expect(factor.currencies.length).toBe(2);
            }

            // Check that factors are sorted by risk contribution
            for (let i = 1; i < riskFactors.length; i++) {
                expect(riskFactors[i].riskContribution)
                    .toBeLessThanOrEqual(riskFactors[i-1].riskContribution);
            }
        });
    });

    describe('Stress Testing', () => {
        test('should perform stress tests', async () => {
            const exposures = await riskEngine.calculateCurrencyExposures(mockPortfolio);
            const stressTests = await riskEngine.performStressTests(exposures);

            expect(Array.isArray(stressTests)).toBe(true);
            expect(stressTests.length).toBeGreaterThan(0);

            for (const test of stressTests) {
                expect(test).toHaveProperty('scenario');
                expect(test).toHaveProperty('totalLoss');
                expect(test).toHaveProperty('currencyLosses');
                expect(test).toHaveProperty('severity');

                expect(typeof test.scenario).toBe('string');
                expect(test.totalLoss).toBeGreaterThanOrEqual(0);
                expect(Array.isArray(test.currencyLosses)).toBe(true);
                expect(['low', 'medium', 'high', 'severe']).toContain(test.severity);
            }

            // Check that stress tests are sorted by total loss (descending)
            for (let i = 1; i < stressTests.length; i++) {
                expect(stressTests[i].totalLoss)
                    .toBeLessThanOrEqual(stressTests[i-1].totalLoss);
            }
        });
    });

    describe('Risk Recommendations', () => {
        test('should generate risk recommendations', async () => {
            const exposures = await riskEngine.calculateCurrencyExposures(mockPortfolio);
            const concentrationRisk = riskEngine.analyzeConcentrationRisk(exposures);
            const volatilities = await riskEngine.calculateVolatilities(exposures);
            const correlations = await riskEngine.calculateCorrelationMatrix(exposures);
            const riskFactors = await riskEngine.decomposeRiskFactors(exposures, volatilities, correlations);
            
            const recommendations = await riskEngine.generateRiskRecommendations(
                exposures, 
                concentrationRisk, 
                riskFactors
            );

            expect(Array.isArray(recommendations)).toBe(true);

            for (const recommendation of recommendations) {
                expect(recommendation).toHaveProperty('type');
                expect(recommendation).toHaveProperty('priority');
                expect(recommendation).toHaveProperty('title');
                expect(recommendation).toHaveProperty('description');
                expect(recommendation).toHaveProperty('action');
                expect(recommendation).toHaveProperty('impact');

                expect(['concentration', 'correlation', 'volatility']).toContain(recommendation.type);
                expect(['low', 'medium', 'high']).toContain(recommendation.priority);
            }
        });
    });

    describe('Risk Alerts', () => {
        test('should emit risk alerts for high VaR', async () => {
            const alertPromise = new Promise(resolve => {
                riskEngine.once('riskAlert', resolve);
            });

            // Mock high VaR scenario
            jest.spyOn(riskEngine, 'calculateParametricVaR').mockResolvedValue({
                var95: 150000, // Above $100k threshold
                var99: 200000,
                portfolioStdDev: 5000,
                portfolioVariance: 25000000
            });

            await riskEngine.calculateCurrencyRisk('user-1', mockPortfolio);
            
            const alert = await alertPromise;
            expect(alert).toHaveProperty('type', 'var_threshold');
            expect(alert).toHaveProperty('severity', 'high');
            expect(alert).toHaveProperty('userId', 'user-1');
        });

        test('should emit concentration alerts', async () => {
            const alertPromise = new Promise(resolve => {
                riskEngine.once('riskAlert', resolve);
            });

            // Create high concentration portfolio
            const highConcPortfolio = {
                ...mockPortfolio,
                accounts: [
                    { currency: 'EUR', balance: 80000, accountType: 'checking' },
                    { currency: 'USD', balance: 20000, accountType: 'checking' }
                ]
            };

            await riskEngine.calculateCurrencyRisk('user-1', highConcPortfolio);
            
            const alert = await alertPromise;
            expect(alert).toHaveProperty('type', 'concentration_alert');
            expect(alert).toHaveProperty('severity', 'medium');
            expect(alert).toHaveProperty('userId', 'user-1');
        });
    });

    describe('Risk Monitoring', () => {
        test('should emit risk update required events', (done) => {
            const testEngine = new CurrencyRiskEngine({
                riskUpdateInterval: 100 // 100ms for testing
            });

            // Add a stale risk assessment
            testEngine.riskCache.set('user-1', {
                timestamp: new Date(Date.now() - 200), // 200ms ago
                userId: 'user-1'
            });

            testEngine.once('riskUpdateRequired', (event) => {
                expect(event).toHaveProperty('userId', 'user-1');
                testEngine.removeAllListeners();
                done();
            });
        });
    });

    describe('Helper Methods', () => {
        test('should calculate returns correctly', () => {
            const prices = [100, 102, 101, 105, 103];
            const returns = riskEngine.calculateReturns(prices);

            expect(returns).toHaveLength(4);
            expect(returns[0]).toBeCloseTo(0.02, 4); // (102-100)/100
            expect(returns[1]).toBeCloseTo(-0.0098, 4); // (101-102)/102
            expect(returns[2]).toBeCloseTo(0.0396, 4); // (105-101)/101
            expect(returns[3]).toBeCloseTo(-0.0190, 4); // (103-105)/105
        });

        test('should calculate volatility correctly', () => {
            const returns = [0.01, -0.02, 0.03, -0.01, 0.02];
            const volatility = riskEngine.calculateVolatility(returns);

            expect(volatility).toBeGreaterThan(0);
            expect(typeof volatility).toBe('number');
        });

        test('should calculate correlation correctly', () => {
            const returns1 = [0.01, 0.02, -0.01, 0.03, -0.02];
            const returns2 = [0.02, 0.01, -0.02, 0.02, -0.01];
            const correlation = riskEngine.calculateCorrelation(returns1, returns2);

            expect(correlation).toBeGreaterThanOrEqual(-1);
            expect(correlation).toBeLessThanOrEqual(1);
        });

        test('should generate random normal numbers', () => {
            const samples = [];
            for (let i = 0; i < 1000; i++) {
                samples.push(riskEngine.generateRandomNormal());
            }

            const mean = samples.reduce((sum, val) => sum + val, 0) / samples.length;
            const variance = samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / samples.length;

            // Should be approximately normal distribution (mean ≈ 0, variance ≈ 1)
            expect(Math.abs(mean)).toBeLessThan(0.1);
            expect(Math.abs(variance - 1)).toBeLessThan(0.2);
        });

        test('should calculate risk score correctly', () => {
            const mockExposures = new Map([
                ['EUR', { absoluteExposure: 50000 }],
                ['GBP', { absoluteExposure: 30000 }]
            ]);

            const mockVolatilities = new Map([
                ['EUR', { annual: 0.15 }],
                ['GBP', { annual: 0.20 }]
            ]);

            const mockConcentrationRisk = {
                maxConcentration: 0.6 // 60%
            };

            const riskScore = riskEngine.calculateRiskScore(
                mockExposures, 
                mockVolatilities, 
                mockConcentrationRisk
            );

            expect(riskScore).toBeGreaterThanOrEqual(0);
            expect(riskScore).toBeLessThanOrEqual(100);
            expect(typeof riskScore).toBe('number');
        });
    });
});