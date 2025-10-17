/**
 * FX Impact Analyzer for Multi-Currency Budgets
 */

const { v4: uuidv4 } = require('uuid');

class FXImpactAnalyzer {
    constructor(options = {}) {
        this.exchangeRateService = options.exchangeRateService;
        this.budgetManager = options.budgetManager;
        this.logger = options.logger || console;
        
        this.impactHistory = new Map();
        this.sensitivityAnalysis = new Map();
    }

    async analyzeBudgetFXImpact(budgetId, analysisOptions = {}) {
        const budget = this.budgetManager.getBudget(budgetId);
        if (!budget) {
            throw new Error(`Budget ${budgetId} not found`);
        }

        const analysis = {
            budgetId,
            baseCurrency: budget.baseCurrency,
            analysisDate: new Date(),
            totalImpact: 0,
            impactPercentage: 0,
            currencyImpacts: new Map(),
            categoryImpacts: new Map(),
            scenarios: [],
            recommendations: []
        };

        // Get current and historical rates
        const currentRates = await this.getCurrentRates(budget);
        const historicalRates = await this.getHistoricalRates(budget, analysisOptions.period || 30);

        // Calculate variance analysis
        analysis.currencyImpacts = await this.calculateCurrencyVarianceImpact(
            budget, currentRates, historicalRates
        );

        // Calculate category-level impacts
        analysis.categoryImpacts = await this.calculateCategoryFXImpact(budget, analysis.currencyImpacts);

        // Calculate total impact
        analysis.totalImpact = Array.from(analysis.currencyImpacts.values())
            .reduce((sum, impact) => sum + impact.totalImpact, 0);
        
        analysis.impactPercentage = (analysis.totalImpact / budget.totalAmount) * 100;

        // Scenario analysis
        analysis.scenarios = await this.performScenarioAnalysis(budget, currentRates);

        // Generate recommendations
        analysis.recommendations = this.generateFXRecommendations(analysis);

        // Store analysis
        this.impactHistory.set(uuidv4(), analysis);

        return analysis;
    }

    async calculateCurrencyVarianceImpact(budget, currentRates, historicalRates) {
        const impacts = new Map();

        for (const [currency, allocation] of budget.allocations) {
            if (currency === budget.baseCurrency) continue;

            const currencyPair = `${budget.baseCurrency}/${currency}`;
            const currentRate = currentRates[currencyPair];
            const historicalData = historicalRates[currencyPair] || [];

            if (!currentRate || historicalData.length === 0) continue;

            // Calculate historical statistics
            const rates = historicalData.map(d => d.rate);
            const avgRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
            const volatility = this.calculateVolatility(rates);
            const minRate = Math.min(...rates);
            const maxRate = Math.max(...rates);

            // Calculate impacts
            const rateChange = currentRate - avgRate;
            const rateChangePercent = (rateChange / avgRate) * 100;
            const budgetImpact = allocation.baseAmount * rateChange;

            impacts.set(currency, {
                currency,
                currentRate,
                averageRate: avgRate,
                rateChange,
                rateChangePercent,
                volatility,
                minRate,
                maxRate,
                budgetAllocation: allocation.baseAmount,
                totalImpact: budgetImpact,
                impactPercent: (budgetImpact / budget.totalAmount) * 100,
                riskLevel: this.assessCurrencyRiskLevel(volatility, Math.abs(rateChangePercent))
            });
        }

        return impacts;
    }

    async calculateCategoryFXImpact(budget, currencyImpacts) {
        const categoryImpacts = new Map();

        for (const category of budget.categories) {
            let totalCategoryImpact = 0;
            const currencyBreakdown = new Map();

            for (const [currency, allocation] of category.allocations) {
                const currencyImpact = currencyImpacts.get(currency);
                if (currencyImpact) {
                    const categoryAllocationImpact = (allocation.baseAmount / currencyImpact.budgetAllocation) * currencyImpact.totalImpact;
                    totalCategoryImpact += categoryAllocationImpact;
                    
                    currencyBreakdown.set(currency, {
                        allocation: allocation.baseAmount,
                        impact: categoryAllocationImpact,
                        impactPercent: (categoryAllocationImpact / category.amount) * 100
                    });
                }
            }

            categoryImpacts.set(category.id, {
                categoryId: category.id,
                categoryName: category.name,
                totalImpact: totalCategoryImpact,
                impactPercent: (totalCategoryImpact / category.amount) * 100,
                currencyBreakdown,
                riskLevel: this.assessCategoryRiskLevel(totalCategoryImpact, category.amount)
            });
        }

        return categoryImpacts;
    }

    async performScenarioAnalysis(budget, currentRates) {
        const scenarios = [
            { name: 'Optimistic', description: '10% favorable FX movement', multiplier: 1.1 },
            { name: 'Pessimistic', description: '10% adverse FX movement', multiplier: 0.9 },
            { name: 'Stress Test', description: '20% adverse FX movement', multiplier: 0.8 },
            { name: 'Crisis', description: '30% adverse FX movement', multiplier: 0.7 }
        ];

        const scenarioResults = [];

        for (const scenario of scenarios) {
            const scenarioRates = {};
            for (const [pair, rate] of Object.entries(currentRates)) {
                scenarioRates[pair] = rate * scenario.multiplier;
            }

            const scenarioImpact = await this.calculateScenarioImpact(budget, scenarioRates, currentRates);
            
            scenarioResults.push({
                name: scenario.name,
                description: scenario.description,
                totalImpact: scenarioImpact.totalImpact,
                impactPercent: scenarioImpact.impactPercent,
                worstAffectedCurrency: scenarioImpact.worstCurrency,
                budgetAtRisk: scenarioImpact.budgetAtRisk
            });
        }

        return scenarioResults;
    }

    async calculateScenarioImpact(budget, scenarioRates, baseRates) {
        let totalImpact = 0;
        let worstCurrency = '';
        let worstImpact = 0;
        let budgetAtRisk = 0;

        for (const [currency, allocation] of budget.allocations) {
            if (currency === budget.baseCurrency) continue;

            const currencyPair = `${budget.baseCurrency}/${currency}`;
            const scenarioRate = scenarioRates[currencyPair];
            const baseRate = baseRates[currencyPair];

            if (scenarioRate && baseRate) {
                const rateChange = scenarioRate - baseRate;
                const impact = allocation.baseAmount * rateChange;
                totalImpact += impact;

                if (Math.abs(impact) > Math.abs(worstImpact)) {
                    worstImpact = impact;
                    worstCurrency = currency;
                }

                if (impact < 0) {
                    budgetAtRisk += Math.abs(impact);
                }
            }
        }

        return {
            totalImpact,
            impactPercent: (totalImpact / budget.totalAmount) * 100,
            worstCurrency,
            budgetAtRisk
        };
    }

    generateFXRecommendations(analysis) {
        const recommendations = [];

        // High impact recommendation
        if (Math.abs(analysis.impactPercentage) > 10) {
            recommendations.push({
                type: 'high_impact_alert',
                priority: 'high',
                title: 'Significant FX Impact Detected',
                description: `Budget is experiencing ${analysis.impactPercentage.toFixed(1)}% FX impact`,
                action: 'Consider implementing FX hedging strategies'
            });
        }

        // Currency-specific recommendations
        for (const [currency, impact] of analysis.currencyImpacts) {
            if (impact.riskLevel === 'high') {
                recommendations.push({
                    type: 'currency_risk',
                    priority: 'medium',
                    title: `High Risk Currency: ${currency}`,
                    description: `${currency} showing high volatility (${impact.volatility.toFixed(2)}) and significant rate change (${impact.rateChangePercent.toFixed(1)}%)`,
                    action: `Consider hedging ${currency} exposure or reducing allocation`
                });
            }
        }

        // Rebalancing recommendations
        const highImpactCategories = Array.from(analysis.categoryImpacts.values())
            .filter(cat => Math.abs(cat.impactPercent) > 15);

        if (highImpactCategories.length > 0) {
            recommendations.push({
                type: 'rebalancing',
                priority: 'medium',
                title: 'Budget Rebalancing Recommended',
                description: `${highImpactCategories.length} categories showing significant FX impact`,
                action: 'Review and rebalance currency allocations'
            });
        }

        return recommendations;
    }

    async performSensitivityAnalysis(budgetId, sensitivityOptions = {}) {
        const budget = this.budgetManager.getBudget(budgetId);
        if (!budget) {
            throw new Error(`Budget ${budgetId} not found`);
        }

        const currentRates = await this.getCurrentRates(budget);
        const shockLevels = sensitivityOptions.shockLevels || [0.05, 0.1, 0.15, 0.2]; // 5%, 10%, 15%, 20%
        
        const sensitivity = {
            budgetId,
            analysisDate: new Date(),
            baseCurrency: budget.baseCurrency,
            shockResults: new Map()
        };

        for (const shockLevel of shockLevels) {
            const shockResults = new Map();

            for (const [currency] of budget.allocations) {
                if (currency === budget.baseCurrency) continue;

                // Positive shock
                const positiveShockRates = { ...currentRates };
                positiveShockRates[`${budget.baseCurrency}/${currency}`] *= (1 + shockLevel);
                const positiveImpact = await this.calculateScenarioImpact(budget, positiveShockRates, currentRates);

                // Negative shock
                const negativeShockRates = { ...currentRates };
                negativeShockRates[`${budget.baseCurrency}/${currency}`] *= (1 - shockLevel);
                const negativeImpact = await this.calculateScenarioImpact(budget, negativeShockRates, currentRates);

                shockResults.set(currency, {
                    positiveShock: positiveImpact,
                    negativeShock: negativeImpact,
                    sensitivity: Math.abs(positiveImpact.totalImpact - negativeImpact.totalImpact) / (2 * shockLevel)
                });
            }

            sensitivity.shockResults.set(shockLevel, shockResults);
        }

        this.sensitivityAnalysis.set(budgetId, sensitivity);
        return sensitivity;
    }

    async generateFXForecast(budgetId, forecastPeriod = 90) {
        const budget = this.budgetManager.getBudget(budgetId);
        if (!budget) {
            throw new Error(`Budget ${budgetId} not found`);
        }

        const historicalRates = await this.getHistoricalRates(budget, 252); // 1 year
        const forecast = {
            budgetId,
            forecastPeriod,
            generatedAt: new Date(),
            currencyForecasts: new Map()
        };

        for (const [currency] of budget.allocations) {
            if (currency === budget.baseCurrency) continue;

            const currencyPair = `${budget.baseCurrency}/${currency}`;
            const historicalData = historicalRates[currencyPair] || [];

            if (historicalData.length < 30) continue;

            const rates = historicalData.map(d => d.rate);
            const trend = this.calculateTrend(rates);
            const volatility = this.calculateVolatility(rates);
            const currentRate = rates[rates.length - 1];

            // Simple forecast using trend and volatility
            const forecastedRate = currentRate * (1 + trend * (forecastPeriod / 365));
            const confidenceInterval = volatility * Math.sqrt(forecastPeriod / 365);

            forecast.currencyForecasts.set(currency, {
                currentRate,
                forecastedRate,
                trend,
                volatility,
                confidenceInterval,
                upperBound: forecastedRate + confidenceInterval,
                lowerBound: forecastedRate - confidenceInterval,
                budgetImpact: budget.allocations.get(currency).baseAmount * (forecastedRate - currentRate)
            });
        }

        return forecast;
    }

    calculateVolatility(rates) {
        if (rates.length < 2) return 0;

        const returns = [];
        for (let i = 1; i < rates.length; i++) {
            returns.push(Math.log(rates[i] / rates[i - 1]));
        }

        const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
        const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
        
        return Math.sqrt(variance * 252); // Annualized volatility
    }

    calculateTrend(rates) {
        if (rates.length < 2) return 0;

        const n = rates.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const y = rates;

        const sumX = x.reduce((sum, val) => sum + val, 0);
        const sumY = y.reduce((sum, val) => sum + val, 0);
        const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
        const sumXX = x.reduce((sum, val) => sum + val * val, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const avgY = sumY / n;

        return slope / avgY; // Normalized trend
    }

    assessCurrencyRiskLevel(volatility, rateChangePercent) {
        if (volatility > 0.3 || rateChangePercent > 15) return 'high';
        if (volatility > 0.2 || rateChangePercent > 10) return 'medium';
        return 'low';
    }

    assessCategoryRiskLevel(impact, categoryAmount) {
        const impactPercent = Math.abs(impact / categoryAmount) * 100;
        if (impactPercent > 20) return 'high';
        if (impactPercent > 10) return 'medium';
        return 'low';
    }

    async getCurrentRates(budget) {
        const rates = {};
        for (const currency of budget.allocations.keys()) {
            if (currency !== budget.baseCurrency) {
                const rate = await this.exchangeRateService.getRate(budget.baseCurrency, currency);
                rates[`${budget.baseCurrency}/${currency}`] = rate;
            }
        }
        return rates;
    }

    async getHistoricalRates(budget, days) {
        const rates = {};
        for (const currency of budget.allocations.keys()) {
            if (currency !== budget.baseCurrency) {
                const historical = await this.exchangeRateService.getHistoricalRates(
                    budget.baseCurrency, 
                    currency, 
                    days
                );
                rates[`${budget.baseCurrency}/${currency}`] = historical;
            }
        }
        return rates;
    }
}

module.exports = FXImpactAnalyzer;