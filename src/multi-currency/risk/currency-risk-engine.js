/**
 * Currency Risk Calculation Engine
 * 
 * Implements comprehensive currency risk assessment including:
 * - VaR (Value at Risk) calculations using Historical and Monte Carlo methods
 * - Currency exposure analysis and concentration risk metrics
 * - Correlation analysis and risk factor decomposition
 * - Real-time risk monitoring and alerting
 */

const EventEmitter = require('events');
const crypto = require('crypto');

// UUID v4 generator using crypto
function uuidv4() {
    return crypto.randomUUID();
}

class CurrencyRiskEngine extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.config = {
            confidenceLevels: [0.95, 0.99],
            lookbackPeriods: {
                short: 30,    // 30 days
                medium: 90,   // 90 days
                long: 252     // 1 year
            },
            monteCarloSimulations: 10000,
            correlationThreshold: 0.7,
            concentrationThreshold: 0.25, // 25% of portfolio
            riskUpdateInterval: 300000,   // 5 minutes
            ...options
        };

        this.riskCache = new Map();
        this.correlationMatrix = new Map();
        this.volatilityCache = new Map();
        
        this.startRiskMonitoring();
    }

    /**
     * Calculate comprehensive currency risk for a portfolio
     */
    async calculateCurrencyRisk(userId, portfolio, options = {}) {
        try {
            const riskId = uuidv4();
            const timestamp = new Date();

            // Get portfolio exposures
            const exposures = await this.calculateCurrencyExposures(portfolio);
            
            // Calculate volatilities and correlations
            const volatilities = await this.calculateVolatilities(exposures);
            const correlations = await this.calculateCorrelationMatrix(exposures);
            
            // Calculate VaR using different methods
            const historicalVaR = await this.calculateHistoricalVaR(exposures, volatilities);
            const parametricVaR = await this.calculateParametricVaR(exposures, volatilities, correlations);
            const monteCarloVaR = await this.calculateMonteCarloVaR(exposures, volatilities, correlations);
            
            // Calculate Expected Shortfall (Conditional VaR)
            const expectedShortfall = await this.calculateExpectedShortfall(exposures, volatilities, correlations);
            
            // Analyze concentration risk
            const concentrationRisk = this.analyzeConcentrationRisk(exposures);
            
            // Decompose risk factors
            const riskFactors = await this.decomposeRiskFactors(exposures, volatilities, correlations);
            
            // Calculate stress test scenarios
            const stressTests = await this.performStressTests(exposures);

            const riskAssessment = {
                id: riskId,
                userId,
                timestamp,
                baseCurrency: portfolio.baseCurrency,
                exposures,
                totalRisk: this.calculateTotalRisk(exposures, volatilities, correlations),
                var: {
                    historical: historicalVaR,
                    parametric: parametricVaR,
                    monteCarlo: monteCarloVaR
                },
                expectedShortfall,
                concentrationRisk,
                riskFactors,
                stressTests,
                correlationMatrix: Array.from(correlations.entries()),
                volatilities: Array.from(volatilities.entries()),
                riskScore: this.calculateRiskScore(exposures, volatilities, concentrationRisk),
                recommendations: await this.generateRiskRecommendations(exposures, concentrationRisk, riskFactors)
            };

            // Cache the risk assessment
            this.riskCache.set(userId, riskAssessment);
            
            // Emit risk calculated event
            this.emit('riskCalculated', riskAssessment);
            
            // Check for risk alerts
            await this.checkRiskAlerts(riskAssessment);

            return riskAssessment;

        } catch (error) {
            this.emit('error', {
                type: 'RISK_CALCULATION_ERROR',
                userId,
                error: error.message,
                timestamp: new Date()
            });
            throw error;
        }
    }

    /**
     * Calculate currency exposures from portfolio
     */
    async calculateCurrencyExposures(portfolio) {
        const exposures = new Map();
        let totalValue = 0;

        // Calculate absolute exposures
        for (const account of portfolio.accounts) {
            if (account.currency !== portfolio.baseCurrency) {
                const baseValue = account.balance * await this.getExchangeRate(
                    account.currency, 
                    portfolio.baseCurrency
                );
                
                exposures.set(account.currency, {
                    currency: account.currency,
                    absoluteExposure: baseValue,
                    originalAmount: account.balance,
                    exchangeRate: await this.getExchangeRate(account.currency, portfolio.baseCurrency),
                    accountType: account.accountType
                });
                
                totalValue += baseValue;
            } else {
                totalValue += account.balance;
            }
        }

        // Calculate relative exposures (percentages)
        for (const [currency, exposure] of exposures) {
            exposure.relativeExposure = exposure.absoluteExposure / totalValue;
            exposure.exposureRank = 0; // Will be set after sorting
        }

        // Rank exposures by size
        const sortedExposures = Array.from(exposures.entries())
            .sort(([,a], [,b]) => b.absoluteExposure - a.absoluteExposure);
        
        sortedExposures.forEach(([currency, exposure], index) => {
            exposure.exposureRank = index + 1;
        });

        return exposures;
    }

    /**
     * Calculate historical volatilities for currencies
     */
    async calculateVolatilities(exposures) {
        const volatilities = new Map();
        
        for (const [currency, exposure] of exposures) {
            // Get historical price data
            const priceHistory = await this.getHistoricalPrices(
                currency, 
                exposure.baseCurrency || 'USD',
                this.config.lookbackPeriods.medium
            );
            
            // Calculate returns
            const returns = this.calculateReturns(priceHistory);
            
            // Calculate volatility (annualized standard deviation)
            const volatility = this.calculateVolatility(returns);
            
            volatilities.set(currency, {
                daily: volatility,
                weekly: volatility * Math.sqrt(7),
                monthly: volatility * Math.sqrt(30),
                annual: volatility * Math.sqrt(252),
                returns: returns.slice(-30) // Keep last 30 returns for correlation
            });
        }
        
        return volatilities;
    }

    /**
     * Calculate correlation matrix between currencies
     */
    async calculateCorrelationMatrix(exposures) {
        const currencies = Array.from(exposures.keys());
        const correlations = new Map();
        
        // Get returns for all currencies
        const returnsData = new Map();
        for (const currency of currencies) {
            const priceHistory = await this.getHistoricalPrices(
                currency, 
                'USD', // Use USD as common base for correlation
                this.config.lookbackPeriods.medium
            );
            returnsData.set(currency, this.calculateReturns(priceHistory));
        }
        
        // Calculate pairwise correlations
        for (let i = 0; i < currencies.length; i++) {
            for (let j = i; j < currencies.length; j++) {
                const curr1 = currencies[i];
                const curr2 = currencies[j];
                
                const correlation = i === j ? 1.0 : 
                    this.calculateCorrelation(
                        returnsData.get(curr1),
                        returnsData.get(curr2)
                    );
                
                correlations.set(`${curr1}-${curr2}`, correlation);
                if (i !== j) {
                    correlations.set(`${curr2}-${curr1}`, correlation);
                }
            }
        }
        
        return correlations;
    }

    /**
     * Calculate Historical VaR
     */
    async calculateHistoricalVaR(exposures, volatilities) {
        const var95 = new Map();
        const var99 = new Map();
        
        for (const [currency, exposure] of exposures) {
            const volatility = volatilities.get(currency);
            if (!volatility) continue;
            
            // Get historical returns
            const returns = volatility.returns;
            const sortedReturns = [...returns].sort((a, b) => a - b);
            
            // Calculate VaR at different confidence levels
            const var95Index = Math.floor(sortedReturns.length * 0.05);
            const var99Index = Math.floor(sortedReturns.length * 0.01);
            
            const exposure95 = exposure.absoluteExposure * Math.abs(sortedReturns[var95Index]);
            const exposure99 = exposure.absoluteExposure * Math.abs(sortedReturns[var99Index]);
            
            var95.set(currency, exposure95);
            var99.set(currency, exposure99);
        }
        
        return {
            var95: this.sumMapValues(var95),
            var99: this.sumMapValues(var99),
            byCurrency: {
                var95: Array.from(var95.entries()),
                var99: Array.from(var99.entries())
            }
        };
    }

    /**
     * Calculate Parametric VaR (Variance-Covariance method)
     */
    async calculateParametricVaR(exposures, volatilities, correlations) {
        const currencies = Array.from(exposures.keys());
        const n = currencies.length;
        
        // Create exposure vector
        const exposureVector = currencies.map(curr => exposures.get(curr).absoluteExposure);
        
        // Create volatility vector
        const volatilityVector = currencies.map(curr => volatilities.get(curr).daily);
        
        // Create correlation matrix
        const correlationMatrix = this.createCorrelationMatrix(currencies, correlations);
        
        // Calculate portfolio variance
        let portfolioVariance = 0;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                portfolioVariance += exposureVector[i] * exposureVector[j] * 
                    volatilityVector[i] * volatilityVector[j] * correlationMatrix[i][j];
            }
        }
        
        const portfolioStdDev = Math.sqrt(portfolioVariance);
        
        // Calculate VaR using normal distribution
        const z95 = 1.645; // 95% confidence level
        const z99 = 2.326; // 99% confidence level
        
        return {
            var95: portfolioStdDev * z95,
            var99: portfolioStdDev * z99,
            portfolioStdDev,
            portfolioVariance
        };
    }

    /**
     * Calculate Monte Carlo VaR
     */
    async calculateMonteCarloVaR(exposures, volatilities, correlations) {
        const currencies = Array.from(exposures.keys());
        const simulations = this.config.monteCarloSimulations;
        const portfolioReturns = [];
        
        // Generate random scenarios
        for (let sim = 0; sim < simulations; sim++) {
            let portfolioReturn = 0;
            
            // Generate correlated random returns for each currency
            const randomReturns = this.generateCorrelatedReturns(currencies, volatilities, correlations);
            
            // Calculate portfolio return for this scenario
            for (const [currency, exposure] of exposures) {
                const currencyReturn = randomReturns.get(currency);
                portfolioReturn += exposure.absoluteExposure * currencyReturn;
            }
            
            portfolioReturns.push(portfolioReturn);
        }
        
        // Sort returns and calculate VaR
        portfolioReturns.sort((a, b) => a - b);
        
        const var95Index = Math.floor(simulations * 0.05);
        const var99Index = Math.floor(simulations * 0.01);
        
        return {
            var95: Math.abs(portfolioReturns[var95Index]),
            var99: Math.abs(portfolioReturns[var99Index]),
            meanReturn: portfolioReturns.reduce((sum, ret) => sum + ret, 0) / simulations,
            stdDev: this.calculateStandardDeviation(portfolioReturns),
            simulations: simulations
        };
    }

    /**
     * Calculate Expected Shortfall (Conditional VaR)
     */
    async calculateExpectedShortfall(exposures, volatilities, correlations) {
        // Use Monte Carlo method for Expected Shortfall calculation
        const currencies = Array.from(exposures.keys());
        const simulations = this.config.monteCarloSimulations;
        const portfolioReturns = [];
        
        // Generate scenarios
        for (let sim = 0; sim < simulations; sim++) {
            let portfolioReturn = 0;
            const randomReturns = this.generateCorrelatedReturns(currencies, volatilities, correlations);
            
            for (const [currency, exposure] of exposures) {
                const currencyReturn = randomReturns.get(currency);
                portfolioReturn += exposure.absoluteExposure * currencyReturn;
            }
            
            portfolioReturns.push(portfolioReturn);
        }
        
        portfolioReturns.sort((a, b) => a - b);
        
        // Calculate Expected Shortfall (average of worst 5% and 1% scenarios)
        const var95Index = Math.floor(simulations * 0.05);
        const var99Index = Math.floor(simulations * 0.01);
        
        const es95 = portfolioReturns.slice(0, var95Index)
            .reduce((sum, ret) => sum + Math.abs(ret), 0) / var95Index;
        
        const es99 = portfolioReturns.slice(0, var99Index)
            .reduce((sum, ret) => sum + Math.abs(ret), 0) / var99Index;
        
        return {
            es95,
            es99,
            interpretation: {
                es95: `Expected loss in worst 5% of scenarios: ${es95.toFixed(2)}`,
                es99: `Expected loss in worst 1% of scenarios: ${es99.toFixed(2)}`
            }
        };
    }

    /**
     * Analyze concentration risk
     */
    analyzeConcentrationRisk(exposures) {
        const totalExposure = Array.from(exposures.values())
            .reduce((sum, exp) => sum + exp.absoluteExposure, 0);
        
        const concentrations = Array.from(exposures.entries())
            .map(([currency, exposure]) => ({
                currency,
                concentration: exposure.absoluteExposure / totalExposure,
                absoluteExposure: exposure.absoluteExposure,
                isHighConcentration: (exposure.absoluteExposure / totalExposure) > this.config.concentrationThreshold
            }))
            .sort((a, b) => b.concentration - a.concentration);
        
        const herfindahlIndex = concentrations
            .reduce((sum, conc) => sum + Math.pow(conc.concentration, 2), 0);
        
        const maxConcentration = concentrations[0]?.concentration || 0;
        const top3Concentration = concentrations.slice(0, 3)
            .reduce((sum, conc) => sum + conc.concentration, 0);
        
        return {
            concentrations,
            herfindahlIndex,
            maxConcentration,
            top3Concentration,
            riskLevel: this.assessConcentrationRiskLevel(herfindahlIndex, maxConcentration),
            recommendations: this.generateConcentrationRecommendations(concentrations)
        };
    }

    /**
     * Decompose risk factors
     */
    async decomposeRiskFactors(exposures, volatilities, correlations) {
        const riskFactors = [];
        
        // Individual currency risk factors
        for (const [currency, exposure] of exposures) {
            const volatility = volatilities.get(currency);
            const individualRisk = exposure.absoluteExposure * volatility.daily;
            
            riskFactors.push({
                type: 'individual',
                currency,
                riskContribution: individualRisk,
                volatility: volatility.daily,
                exposure: exposure.absoluteExposure,
                relativeContribution: 0 // Will be calculated after total
            });
        }
        
        // Correlation risk factors
        const currencies = Array.from(exposures.keys());
        for (let i = 0; i < currencies.length; i++) {
            for (let j = i + 1; j < currencies.length; j++) {
                const curr1 = currencies[i];
                const curr2 = currencies[j];
                const correlation = correlations.get(`${curr1}-${curr2}`);
                
                if (Math.abs(correlation) > this.config.correlationThreshold) {
                    const exp1 = exposures.get(curr1);
                    const exp2 = exposures.get(curr2);
                    const vol1 = volatilities.get(curr1);
                    const vol2 = volatilities.get(curr2);
                    
                    const correlationRisk = 2 * exp1.absoluteExposure * exp2.absoluteExposure * 
                        vol1.daily * vol2.daily * correlation;
                    
                    riskFactors.push({
                        type: 'correlation',
                        currencies: [curr1, curr2],
                        correlation,
                        riskContribution: Math.abs(correlationRisk),
                        isHighCorrelation: Math.abs(correlation) > 0.8
                    });
                }
            }
        }
        
        // Calculate relative contributions
        const totalRisk = riskFactors.reduce((sum, factor) => sum + Math.abs(factor.riskContribution), 0);
        riskFactors.forEach(factor => {
            factor.relativeContribution = Math.abs(factor.riskContribution) / totalRisk;
        });
        
        return riskFactors.sort((a, b) => b.riskContribution - a.riskContribution);
    }

    /**
     * Perform stress tests
     */
    async performStressTests(exposures) {
        const stressScenarios = [
            { name: '2008 Financial Crisis', shocks: { 'EUR': -0.15, 'GBP': -0.20, 'JPY': 0.10 } },
            { name: 'COVID-19 Pandemic', shocks: { 'EUR': -0.12, 'GBP': -0.18, 'AUD': -0.25 } },
            { name: 'Brexit Referendum', shocks: { 'GBP': -0.30, 'EUR': -0.08 } },
            { name: 'Emerging Market Crisis', shocks: { 'BRL': -0.40, 'TRY': -0.35, 'ZAR': -0.30 } },
            { name: 'USD Strength', shocks: { 'EUR': -0.10, 'GBP': -0.12, 'JPY': -0.08, 'CAD': -0.15 } }
        ];
        
        const stressResults = [];
        
        for (const scenario of stressScenarios) {
            let totalLoss = 0;
            const currencyLosses = new Map();
            
            for (const [currency, exposure] of exposures) {
                const shock = scenario.shocks[currency] || 0;
                const loss = exposure.absoluteExposure * Math.abs(shock);
                
                currencyLosses.set(currency, loss);
                totalLoss += loss;
            }
            
            stressResults.push({
                scenario: scenario.name,
                totalLoss,
                currencyLosses: Array.from(currencyLosses.entries()),
                severity: this.assessStressSeverity(totalLoss, exposures)
            });
        }
        
        return stressResults.sort((a, b) => b.totalLoss - a.totalLoss);
    }

    /**
     * Generate risk recommendations
     */
    async generateRiskRecommendations(exposures, concentrationRisk, riskFactors) {
        const recommendations = [];
        
        // Concentration risk recommendations
        if (concentrationRisk.maxConcentration > this.config.concentrationThreshold) {
            recommendations.push({
                type: 'concentration',
                priority: 'high',
                title: 'Reduce Currency Concentration',
                description: `Your portfolio has ${(concentrationRisk.maxConcentration * 100).toFixed(1)}% exposure to ${concentrationRisk.concentrations[0].currency}`,
                action: 'Consider diversifying into other currencies or hedging this exposure',
                impact: 'Reduces concentration risk and improves portfolio stability'
            });
        }
        
        // High correlation recommendations
        const highCorrelationFactors = riskFactors.filter(f => 
            f.type === 'correlation' && f.isHighCorrelation
        );
        
        if (highCorrelationFactors.length > 0) {
            recommendations.push({
                type: 'correlation',
                priority: 'medium',
                title: 'Address High Currency Correlations',
                description: `Found ${highCorrelationFactors.length} highly correlated currency pairs`,
                action: 'Consider hedging or diversifying into uncorrelated currencies',
                impact: 'Reduces correlation risk and improves diversification'
            });
        }
        
        // Volatility recommendations
        const highVolatilityCurrencies = Array.from(exposures.entries())
            .filter(([currency, exposure]) => {
                const vol = this.volatilityCache.get(currency);
                return vol && vol.annual > 0.20; // 20% annual volatility threshold
            });
        
        if (highVolatilityCurrencies.length > 0) {
            recommendations.push({
                type: 'volatility',
                priority: 'medium',
                title: 'Manage High Volatility Exposures',
                description: `${highVolatilityCurrencies.length} currencies have high volatility`,
                action: 'Consider hedging volatile currency exposures',
                impact: 'Reduces portfolio volatility and potential losses'
            });
        }
        
        return recommendations;
    }

    // Helper methods
    calculateReturns(prices) {
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i-1]) / prices[i-1]);
        }
        return returns;
    }

    calculateVolatility(returns) {
        const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
        return Math.sqrt(variance);
    }

    calculateCorrelation(returns1, returns2) {
        const n = Math.min(returns1.length, returns2.length);
        const mean1 = returns1.slice(0, n).reduce((sum, ret) => sum + ret, 0) / n;
        const mean2 = returns2.slice(0, n).reduce((sum, ret) => sum + ret, 0) / n;
        
        let numerator = 0;
        let sumSq1 = 0;
        let sumSq2 = 0;
        
        for (let i = 0; i < n; i++) {
            const diff1 = returns1[i] - mean1;
            const diff2 = returns2[i] - mean2;
            
            numerator += diff1 * diff2;
            sumSq1 += diff1 * diff1;
            sumSq2 += diff2 * diff2;
        }
        
        const denominator = Math.sqrt(sumSq1 * sumSq2);
        return denominator === 0 ? 0 : numerator / denominator;
    }

    calculateStandardDeviation(values) {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }

    generateCorrelatedReturns(currencies, volatilities, correlations) {
        // Simplified correlated random number generation
        // In production, use Cholesky decomposition for proper correlation
        const returns = new Map();
        
        for (const currency of currencies) {
            const vol = volatilities.get(currency);
            const randomReturn = this.generateRandomNormal() * vol.daily;
            returns.set(currency, randomReturn);
        }
        
        return returns;
    }

    generateRandomNormal() {
        // Box-Muller transformation for normal distribution
        let u = 0, v = 0;
        while(u === 0) u = Math.random();
        while(v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    createCorrelationMatrix(currencies, correlations) {
        const n = currencies.length;
        const matrix = Array(n).fill().map(() => Array(n).fill(0));
        
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const key = `${currencies[i]}-${currencies[j]}`;
                matrix[i][j] = correlations.get(key) || (i === j ? 1 : 0);
            }
        }
        
        return matrix;
    }

    sumMapValues(map) {
        return Array.from(map.values()).reduce((sum, val) => sum + val, 0);
    }

    calculateTotalRisk(exposures, volatilities, correlations) {
        // Simplified total risk calculation
        let totalRisk = 0;
        for (const [currency, exposure] of exposures) {
            const vol = volatilities.get(currency);
            if (vol) {
                totalRisk += exposure.absoluteExposure * vol.daily;
            }
        }
        return totalRisk;
    }

    calculateRiskScore(exposures, volatilities, concentrationRisk) {
        // Risk score from 0-100 (higher is riskier)
        let score = 0;
        
        // Concentration component (0-40 points)
        score += concentrationRisk.maxConcentration * 40;
        
        // Volatility component (0-40 points)
        const avgVolatility = Array.from(volatilities.values())
            .reduce((sum, vol) => sum + vol.annual, 0) / volatilities.size;
        score += Math.min(avgVolatility * 200, 40); // Cap at 40 points
        
        // Diversification component (0-20 points)
        const numCurrencies = exposures.size;
        score += Math.max(20 - numCurrencies * 2, 0); // Fewer currencies = higher score
        
        return Math.min(Math.round(score), 100);
    }

    assessConcentrationRiskLevel(herfindahlIndex, maxConcentration) {
        if (maxConcentration > 0.5 || herfindahlIndex > 0.25) return 'high';
        if (maxConcentration > 0.3 || herfindahlIndex > 0.15) return 'medium';
        return 'low';
    }

    generateConcentrationRecommendations(concentrations) {
        return concentrations
            .filter(conc => conc.isHighConcentration)
            .map(conc => ({
                currency: conc.currency,
                currentConcentration: conc.concentration,
                recommendedMax: this.config.concentrationThreshold,
                action: `Reduce ${conc.currency} exposure by ${((conc.concentration - this.config.concentrationThreshold) * 100).toFixed(1)}%`
            }));
    }

    assessStressSeverity(totalLoss, exposures) {
        const totalExposure = Array.from(exposures.values())
            .reduce((sum, exp) => sum + exp.absoluteExposure, 0);
        
        const lossPercentage = totalLoss / totalExposure;
        
        if (lossPercentage > 0.20) return 'severe';
        if (lossPercentage > 0.10) return 'high';
        if (lossPercentage > 0.05) return 'medium';
        return 'low';
    }

    async checkRiskAlerts(riskAssessment) {
        const alerts = [];
        
        // Check VaR thresholds
        if (riskAssessment.var.parametric.var95 > 100000) { // $100k threshold
            alerts.push({
                type: 'var_threshold',
                severity: 'high',
                message: `95% VaR exceeds $100,000: $${riskAssessment.var.parametric.var95.toFixed(2)}`,
                timestamp: new Date()
            });
        }
        
        // Check concentration alerts
        if (riskAssessment.concentrationRisk.maxConcentration > 0.4) {
            alerts.push({
                type: 'concentration_alert',
                severity: 'medium',
                message: `High concentration risk: ${(riskAssessment.concentrationRisk.maxConcentration * 100).toFixed(1)}% in single currency`,
                timestamp: new Date()
            });
        }
        
        // Emit alerts
        for (const alert of alerts) {
            this.emit('riskAlert', { ...alert, userId: riskAssessment.userId });
        }
    }

    startRiskMonitoring() {
        setInterval(async () => {
            try {
                // Update risk assessments for active users
                for (const [userId, cachedRisk] of this.riskCache) {
                    if (Date.now() - cachedRisk.timestamp.getTime() > this.config.riskUpdateInterval) {
                        // Risk assessment is stale, trigger update
                        this.emit('riskUpdateRequired', { userId });
                    }
                }
            } catch (error) {
                this.emit('error', {
                    type: 'RISK_MONITORING_ERROR',
                    error: error.message,
                    timestamp: new Date()
                });
            }
        }, this.config.riskUpdateInterval);
    }

    // Mock methods for external dependencies - GitHub compatible
    async getExchangeRate(fromCurrency, toCurrency) {
        // Mock exchange rates for testing
        const rates = {
            'EUR-USD': 1.08,
            'GBP-USD': 1.25,
            'JPY-USD': 0.0067,
            'CAD-USD': 0.74,
            'AUD-USD': 0.66,
            'CHF-USD': 1.09,
            'USD-EUR': 0.93,
            'USD-GBP': 0.80,
            'USD-JPY': 149.0,
            'USD-CAD': 1.35,
            'USD-AUD': 1.52,
            'USD-CHF': 0.92
        };
        
        const key = `${fromCurrency}-${toCurrency}`;
        const reverseKey = `${toCurrency}-${fromCurrency}`;
        
        if (rates[key]) {
            return rates[key] * (1 + (Math.random() - 0.5) * 0.01); // ±0.5% variation
        } else if (rates[reverseKey]) {
            return (1 / rates[reverseKey]) * (1 + (Math.random() - 0.5) * 0.01);
        }
        
        return 1.0 + (Math.random() - 0.5) * 0.1; // ±5% for unknown pairs
    }

    async getHistoricalPrices(currency, baseCurrency, days) {
        // Generate realistic historical price data for testing
        const prices = [];
        let price = await this.getExchangeRate(currency, baseCurrency);
        
        // Generate more realistic price movements
        for (let i = 0; i < days; i++) {
            // Add some trend and mean reversion
            const trend = Math.sin(i / 30) * 0.001; // Monthly cycle
            const randomWalk = (Math.random() - 0.5) * 0.015; // ±0.75% daily
            const meanReversion = (1.0 - price) * 0.01; // Revert to 1.0
            
            const change = trend + randomWalk + meanReversion;
            price *= (1 + change);
            prices.push(Math.max(price, 0.1)); // Prevent negative prices
        }
        
        return prices;
    }
}

module.exports = CurrencyRiskEngine;