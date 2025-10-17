/**
 * Hedging Strategy Optimizer
 * 
 * Provides intelligent hedging strategy recommendations using optimization algorithms
 * to minimize currency risk while considering cost-benefit trade-offs.
 */

const { v4: uuidv4 } = require('uuid');

class HedgingStrategyOptimizer {
    constructor(options = {}) {
        this.riskCalculator = options.riskCalculator;
        this.marketDataService = options.marketDataService;
        this.costCalculator = options.costCalculator;
        this.logger = options.logger || console;
        
        // Optimization parameters
        this.maxIterations = options.maxIterations || 1000;
        this.convergenceThreshold = options.convergenceThreshold || 0.0001;
        this.riskTolerance = options.riskTolerance || 0.05;
        
        // Hedging instruments configuration
        this.availableInstruments = options.availableInstruments || [
            'forward_contract',
            'currency_option',
            'currency_swap',
            'natural_hedge'
        ];
        
        // Strategy templates
        this.strategyTemplates = new Map();
        this.initializeStrategyTemplates();
    }

    /**
     * Initialize predefined strategy templates
     */
    initializeStrategyTemplates() {
        // Conservative hedging strategy
        this.strategyTemplates.set('conservative', {
            name: 'Conservative Hedging',
            description: 'Low-risk hedging with high hedge ratios',
            defaultHedgeRatio: 0.8,
            preferredInstruments: ['forward_contract', 'currency_swap'],
            riskReductionTarget: 0.7,
            maxCost: 0.02
        });

        // Balanced hedging strategy
        this.strategyTemplates.set('balanced', {
            name: 'Balanced Hedging',
            description: 'Moderate risk-cost balance',
            defaultHedgeRatio: 0.5,
            preferredInstruments: ['forward_contract', 'currency_option'],
            riskReductionTarget: 0.5,
            maxCost: 0.015
        });

        // Aggressive hedging strategy
        this.strategyTemplates.set('aggressive', {
            name: 'Aggressive Hedging',
            description: 'Cost-optimized with selective hedging',
            defaultHedgeRatio: 0.3,
            preferredInstruments: ['currency_option', 'natural_hedge'],
            riskReductionTarget: 0.3,
            maxCost: 0.01
        });

        // Dynamic hedging strategy
        this.strategyTemplates.set('dynamic', {
            name: 'Dynamic Hedging',
            description: 'Adaptive hedging based on market conditions',
            defaultHedgeRatio: 0.6,
            preferredInstruments: ['forward_contract', 'currency_option', 'currency_swap'],
            riskReductionTarget: 0.6,
            maxCost: 0.025
        });
    }

    /**
     * Generate optimal hedging recommendations for a user's portfolio
     */
    async generateHedgingRecommendations(userId, options = {}) {
        try {
            // Get current risk assessment
            const riskAssessment = await this.riskCalculator.calculateRisk(userId);
            
            // Get market data for hedging instruments
            const marketData = await this.getMarketData(riskAssessment.exposures);
            
            // Generate strategy recommendations
            const recommendations = [];
            
            for (const exposure of riskAssessment.exposures) {
                if (exposure.riskLevel > this.riskTolerance) {
                    const strategies = await this.optimizeHedgingStrategies(
                        exposure,
                        marketData,
                        options
                    );
                    recommendations.push(...strategies);
                }
            }

            // Rank and filter recommendations
            const rankedRecommendations = this.rankRecommendations(recommendations);
            
            // Perform cost-benefit analysis
            const analysisResults = await this.performCostBenefitAnalysis(
                rankedRecommendations,
                riskAssessment
            );

            this.logger.info(`Generated ${rankedRecommendations.length} hedging recommendations for user ${userId}`);
            
            return {
                recommendations: rankedRecommendations,
                costBenefitAnalysis: analysisResults,
                riskReduction: this.calculateTotalRiskReduction(rankedRecommendations),
                totalCost: this.calculateTotalCost(rankedRecommendations),
                timestamp: new Date()
            };
            
        } catch (error) {
            this.logger.error(`Failed to generate hedging recommendations for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Optimize hedging strategies for a specific currency exposure
     */
    async optimizeHedgingStrategies(exposure, marketData, options = {}) {
        const strategies = [];
        const template = options.template || 'balanced';
        const strategyConfig = this.strategyTemplates.get(template);
        
        // Generate strategies for each available instrument
        for (const instrument of this.availableInstruments) {
            if (strategyConfig.preferredInstruments.includes(instrument)) {
                const strategy = await this.createOptimalStrategy(
                    exposure,
                    instrument,
                    marketData,
                    strategyConfig
                );
                
                if (strategy) {
                    strategies.push(strategy);
                }
            }
        }

        // Optimize hedge ratios using mathematical optimization
        const optimizedStrategies = await this.optimizeHedgeRatios(strategies, exposure);
        
        return optimizedStrategies;
    }

    /**
     * Create optimal strategy for a specific instrument
     */
    async createOptimalStrategy(exposure, instrument, marketData, config) {
        try {
            const instrumentData = marketData[exposure.currency]?.[instrument];
            if (!instrumentData) {
                return null;
            }

            const strategy = {
                id: uuidv4(),
                name: `${config.name} - ${instrument.replace('_', ' ').toUpperCase()}`,
                type: instrument,
                targetCurrency: exposure.currency,
                exposure: exposure.amount,
                hedgeRatio: config.defaultHedgeRatio,
                instruments: [],
                effectiveness: 0,
                cost: 0,
                duration: this.getOptimalDuration(instrument, exposure),
                riskReduction: 0,
                confidence: 0.8,
                marketConditions: this.assessMarketConditions(instrumentData),
                createdAt: new Date()
            };

            // Configure instrument-specific parameters
            switch (instrument) {
                case 'forward_contract':
                    strategy.instruments = await this.configureForwardContract(
                        exposure, instrumentData, config
                    );
                    break;
                    
                case 'currency_option':
                    strategy.instruments = await this.configureCurrencyOption(
                        exposure, instrumentData, config
                    );
                    break;
                    
                case 'currency_swap':
                    strategy.instruments = await this.configureCurrencySwap(
                        exposure, instrumentData, config
                    );
                    break;
                    
                case 'natural_hedge':
                    strategy.instruments = await this.configureNaturalHedge(
                        exposure, instrumentData, config
                    );
                    break;
            }

            // Calculate strategy metrics
            strategy.cost = await this.calculateStrategyCost(strategy);
            strategy.effectiveness = await this.calculateEffectiveness(strategy, exposure);
            strategy.riskReduction = strategy.effectiveness * strategy.hedgeRatio;

            return strategy;
            
        } catch (error) {
            this.logger.error(`Failed to create strategy for ${instrument}:`, error);
            return null;
        }
    }

    /**
     * Configure forward contract hedging
     */
    async configureForwardContract(exposure, marketData, config) {
        const forwardRate = marketData.forwardRates?.['3M'] || marketData.spotRate;
        const hedgeAmount = exposure.amount * config.defaultHedgeRatio;
        
        return [{
            type: 'forward_contract',
            currency: exposure.currency,
            amount: hedgeAmount,
            rate: forwardRate,
            maturity: 90, // 3 months
            premium: 0,
            delta: 1.0,
            gamma: 0,
            vega: 0,
            theta: 0
        }];
    }

    /**
     * Configure currency option hedging
     */
    async configureCurrencyOption(exposure, marketData, config) {
        const spotRate = marketData.spotRate;
        const volatility = marketData.impliedVolatility || 0.15;
        const hedgeAmount = exposure.amount * config.defaultHedgeRatio;
        
        // Determine optimal strike price (typically at-the-money or slightly out-of-the-money)
        const strikeRate = spotRate * (exposure.direction === 'long' ? 0.98 : 1.02);
        
        // Calculate option premium using Black-Scholes approximation
        const premium = this.calculateOptionPremium(
            spotRate, strikeRate, volatility, 0.25, 0.02
        );

        return [{
            type: 'currency_option',
            currency: exposure.currency,
            amount: hedgeAmount,
            strikeRate: strikeRate,
            premium: premium,
            maturity: 90,
            optionType: exposure.direction === 'long' ? 'put' : 'call',
            delta: this.calculateOptionDelta(spotRate, strikeRate, volatility, 0.25),
            gamma: this.calculateOptionGamma(spotRate, strikeRate, volatility, 0.25),
            vega: this.calculateOptionVega(spotRate, strikeRate, volatility, 0.25),
            theta: this.calculateOptionTheta(spotRate, strikeRate, volatility, 0.25)
        }];
    }

    /**
     * Configure currency swap hedging
     */
    async configureCurrencySwap(exposure, marketData, config) {
        const swapRate = marketData.swapRates?.['1Y'] || marketData.spotRate;
        const hedgeAmount = exposure.amount * config.defaultHedgeRatio;
        
        return [{
            type: 'currency_swap',
            currency: exposure.currency,
            amount: hedgeAmount,
            swapRate: swapRate,
            maturity: 365, // 1 year
            paymentFrequency: 'quarterly',
            floatingRate: marketData.interestRates?.floating || 0.02,
            fixedRate: marketData.interestRates?.fixed || 0.025,
            notionalAmount: hedgeAmount
        }];
    }

    /**
     * Configure natural hedge strategy
     */
    async configureNaturalHedge(exposure, marketData, config) {
        // Natural hedging involves matching currency exposures
        const hedgeAmount = exposure.amount * config.defaultHedgeRatio;
        
        return [{
            type: 'natural_hedge',
            currency: exposure.currency,
            amount: hedgeAmount,
            method: 'operational_matching',
            description: 'Match currency exposure through operational activities',
            effectiveness: 0.7, // Natural hedges are typically less precise
            cost: 0.001, // Very low direct cost
            implementation: 'gradual'
        }];
    }

    /**
     * Optimize hedge ratios using mathematical optimization
     */
    async optimizeHedgeRatios(strategies, exposure) {
        const optimizedStrategies = [];
        
        for (const strategy of strategies) {
            // Use gradient descent to find optimal hedge ratio
            const optimalRatio = await this.findOptimalHedgeRatio(strategy, exposure);
            
            // Update strategy with optimal ratio
            const optimizedStrategy = {
                ...strategy,
                hedgeRatio: optimalRatio,
                riskReduction: strategy.effectiveness * optimalRatio
            };
            
            // Recalculate cost with new ratio
            optimizedStrategy.cost = await this.calculateStrategyCost(optimizedStrategy);
            
            optimizedStrategies.push(optimizedStrategy);
        }
        
        return optimizedStrategies;
    }

    /**
     * Find optimal hedge ratio using optimization algorithm
     */
    async findOptimalHedgeRatio(strategy, exposure) {
        let bestRatio = strategy.hedgeRatio;
        let bestScore = await this.calculateUtilityScore(strategy, exposure);
        
        // Simple grid search optimization
        for (let ratio = 0.1; ratio <= 1.0; ratio += 0.1) {
            const testStrategy = { ...strategy, hedgeRatio: ratio };
            testStrategy.cost = await this.calculateStrategyCost(testStrategy);
            testStrategy.riskReduction = strategy.effectiveness * ratio;
            
            const score = await this.calculateUtilityScore(testStrategy, exposure);
            
            if (score > bestScore) {
                bestScore = score;
                bestRatio = ratio;
            }
        }
        
        return bestRatio;
    }

    /**
     * Calculate utility score for strategy optimization
     */
    async calculateUtilityScore(strategy, exposure) {
        const riskReductionWeight = 0.6;
        const costWeight = 0.3;
        const effectivenessWeight = 0.1;
        
        const riskReductionScore = strategy.riskReduction;
        const costScore = Math.max(0, 1 - (strategy.cost / 0.05)); // Normalize cost
        const effectivenessScore = strategy.effectiveness;
        
        return (riskReductionWeight * riskReductionScore) +
               (costWeight * costScore) +
               (effectivenessWeight * effectivenessScore);
    }

    /**
     * Rank recommendations by effectiveness and cost
     */
    rankRecommendations(recommendations) {
        return recommendations.sort((a, b) => {
            // Primary sort: risk reduction per unit cost
            const aRatio = a.riskReduction / (a.cost || 0.001);
            const bRatio = b.riskReduction / (b.cost || 0.001);
            
            if (Math.abs(aRatio - bRatio) > 0.1) {
                return bRatio - aRatio;
            }
            
            // Secondary sort: total risk reduction
            return b.riskReduction - a.riskReduction;
        });
    }

    /**
     * Perform comprehensive cost-benefit analysis
     */
    async performCostBenefitAnalysis(recommendations, riskAssessment) {
        const analysis = {
            totalRiskReduction: 0,
            totalCost: 0,
            netBenefit: 0,
            paybackPeriod: 0,
            riskAdjustedReturn: 0,
            scenarios: []
        };

        // Calculate aggregate metrics
        for (const recommendation of recommendations) {
            analysis.totalRiskReduction += recommendation.riskReduction;
            analysis.totalCost += recommendation.cost;
        }

        // Calculate net benefit (risk reduction value minus cost)
        const riskReductionValue = analysis.totalRiskReduction * riskAssessment.portfolioValue;
        analysis.netBenefit = riskReductionValue - analysis.totalCost;
        
        // Calculate payback period
        analysis.paybackPeriod = analysis.totalCost / (riskReductionValue / 365);
        
        // Calculate risk-adjusted return
        analysis.riskAdjustedReturn = analysis.netBenefit / analysis.totalCost;

        // Scenario analysis
        analysis.scenarios = await this.performScenarioAnalysis(recommendations, riskAssessment);

        return analysis;
    }

    /**
     * Perform scenario analysis for hedging strategies
     */
    async performScenarioAnalysis(recommendations, riskAssessment) {
        const scenarios = [
            { name: 'Bull Market', currencyMovement: 0.1, probability: 0.3 },
            { name: 'Bear Market', currencyMovement: -0.1, probability: 0.3 },
            { name: 'High Volatility', currencyMovement: 0.05, volatilityMultiplier: 2, probability: 0.2 },
            { name: 'Stable Market', currencyMovement: 0.02, probability: 0.2 }
        ];

        const scenarioResults = [];

        for (const scenario of scenarios) {
            const result = {
                scenario: scenario.name,
                probability: scenario.probability,
                unhedgedLoss: 0,
                hedgedLoss: 0,
                hedgingBenefit: 0,
                costEffectiveness: 0
            };

            // Calculate unhedged portfolio impact
            result.unhedgedLoss = riskAssessment.portfolioValue * 
                                 Math.abs(scenario.currencyMovement) * 
                                 (scenario.volatilityMultiplier || 1);

            // Calculate hedged portfolio impact
            let totalHedgeBenefit = 0;
            let totalHedgeCost = 0;

            for (const recommendation of recommendations) {
                const hedgeBenefit = recommendation.riskReduction * result.unhedgedLoss;
                totalHedgeBenefit += hedgeBenefit;
                totalHedgeCost += recommendation.cost;
            }

            result.hedgedLoss = result.unhedgedLoss - totalHedgeBenefit;
            result.hedgingBenefit = totalHedgeBenefit - totalHedgeCost;
            result.costEffectiveness = result.hedgingBenefit / totalHedgeCost;

            scenarioResults.push(result);
        }

        return scenarioResults;
    }

    /**
     * Calculate strategy cost including all fees and premiums
     */
    async calculateStrategyCost(strategy) {
        let totalCost = 0;

        for (const instrument of strategy.instruments) {
            switch (instrument.type) {
                case 'forward_contract':
                    // Forward contracts typically have bid-ask spread cost
                    totalCost += instrument.amount * 0.001; // 0.1% spread
                    break;
                    
                case 'currency_option':
                    // Options have premium cost
                    totalCost += instrument.premium * instrument.amount;
                    break;
                    
                case 'currency_swap':
                    // Swaps have setup and ongoing costs
                    totalCost += instrument.amount * 0.002; // 0.2% setup cost
                    break;
                    
                case 'natural_hedge':
                    // Natural hedges have minimal direct cost
                    totalCost += instrument.amount * 0.0005; // 0.05% operational cost
                    break;
            }
        }

        // Add management and monitoring costs
        totalCost += strategy.exposure * 0.0001; // 0.01% management fee

        return totalCost;
    }

    /**
     * Calculate hedge effectiveness
     */
    async calculateEffectiveness(strategy, exposure) {
        let effectiveness = 0;

        for (const instrument of strategy.instruments) {
            switch (instrument.type) {
                case 'forward_contract':
                    effectiveness = 0.95; // Very high effectiveness
                    break;
                    
                case 'currency_option':
                    effectiveness = Math.abs(instrument.delta) * 0.9; // Delta-adjusted effectiveness
                    break;
                    
                case 'currency_swap':
                    effectiveness = 0.85; // High effectiveness for long-term hedging
                    break;
                    
                case 'natural_hedge':
                    effectiveness = 0.7; // Moderate effectiveness
                    break;
            }
        }

        // Adjust for market conditions and correlation
        const marketAdjustment = this.getMarketConditionAdjustment(strategy.marketConditions);
        effectiveness *= marketAdjustment;

        return Math.min(effectiveness, 1.0);
    }

    /**
     * Get optimal duration for hedging instrument
     */
    getOptimalDuration(instrument, exposure) {
        const durations = {
            'forward_contract': 90,  // 3 months
            'currency_option': 90,   // 3 months
            'currency_swap': 365,    // 1 year
            'natural_hedge': 180     // 6 months
        };

        return durations[instrument] || 90;
    }

    /**
     * Assess market conditions for strategy selection
     */
    assessMarketConditions(instrumentData) {
        return {
            volatility: instrumentData.impliedVolatility || 0.15,
            liquidity: instrumentData.liquidity || 'high',
            spread: instrumentData.spread || 0.001,
            trend: instrumentData.trend || 'neutral',
            correlation: instrumentData.correlation || 0.8
        };
    }

    /**
     * Get market condition adjustment factor
     */
    getMarketConditionAdjustment(conditions) {
        let adjustment = 1.0;

        // Adjust for volatility
        if (conditions.volatility > 0.25) {
            adjustment *= 0.9; // High volatility reduces effectiveness
        } else if (conditions.volatility < 0.1) {
            adjustment *= 1.1; // Low volatility improves effectiveness
        }

        // Adjust for liquidity
        if (conditions.liquidity === 'low') {
            adjustment *= 0.85;
        } else if (conditions.liquidity === 'high') {
            adjustment *= 1.05;
        }

        return Math.min(adjustment, 1.2);
    }

    /**
     * Get market data for hedging instruments
     */
    async getMarketData(exposures) {
        const marketData = {};

        for (const exposure of exposures) {
            try {
                const currencyData = await this.marketDataService.getCurrencyData(exposure.currency);
                marketData[exposure.currency] = {
                    spotRate: currencyData.spotRate,
                    forwardRates: currencyData.forwardRates,
                    swapRates: currencyData.swapRates,
                    impliedVolatility: currencyData.impliedVolatility,
                    interestRates: currencyData.interestRates,
                    liquidity: currencyData.liquidity,
                    spread: currencyData.spread,
                    trend: currencyData.trend,
                    correlation: currencyData.correlation
                };
            } catch (error) {
                this.logger.warn(`Failed to get market data for ${exposure.currency}:`, error);
                // Use default values
                marketData[exposure.currency] = this.getDefaultMarketData();
            }
        }

        return marketData;
    }

    /**
     * Get default market data when real data is unavailable
     */
    getDefaultMarketData() {
        return {
            spotRate: 1.0,
            forwardRates: { '3M': 1.0, '6M': 1.0, '1Y': 1.0 },
            swapRates: { '1Y': 1.0, '2Y': 1.0, '5Y': 1.0 },
            impliedVolatility: 0.15,
            interestRates: { floating: 0.02, fixed: 0.025 },
            liquidity: 'medium',
            spread: 0.001,
            trend: 'neutral',
            correlation: 0.8
        };
    }

    /**
     * Calculate total risk reduction from all recommendations
     */
    calculateTotalRiskReduction(recommendations) {
        return recommendations.reduce((total, rec) => total + rec.riskReduction, 0);
    }

    /**
     * Calculate total cost of all recommendations
     */
    calculateTotalCost(recommendations) {
        return recommendations.reduce((total, rec) => total + rec.cost, 0);
    }

    /**
     * Black-Scholes option premium calculation (simplified)
     */
    calculateOptionPremium(spot, strike, volatility, timeToExpiry, riskFreeRate = 0.02) {
        const d1 = (Math.log(spot / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) /
                   (volatility * Math.sqrt(timeToExpiry));
        const d2 = d1 - volatility * Math.sqrt(timeToExpiry);
        
        // Simplified premium calculation
        return spot * this.normalCDF(d1) - strike * Math.exp(-riskFreeRate * timeToExpiry) * this.normalCDF(d2);
    }

    /**
     * Calculate option delta
     */
    calculateOptionDelta(spot, strike, volatility, timeToExpiry) {
        const d1 = (Math.log(spot / strike) + (0.02 + 0.5 * volatility * volatility) * timeToExpiry) /
                   (volatility * Math.sqrt(timeToExpiry));
        return this.normalCDF(d1);
    }

    /**
     * Calculate option gamma
     */
    calculateOptionGamma(spot, strike, volatility, timeToExpiry) {
        const d1 = (Math.log(spot / strike) + (0.02 + 0.5 * volatility * volatility) * timeToExpiry) /
                   (volatility * Math.sqrt(timeToExpiry));
        return this.normalPDF(d1) / (spot * volatility * Math.sqrt(timeToExpiry));
    }

    /**
     * Calculate option vega
     */
    calculateOptionVega(spot, strike, volatility, timeToExpiry) {
        const d1 = (Math.log(spot / strike) + (0.02 + 0.5 * volatility * volatility) * timeToExpiry) /
                   (volatility * Math.sqrt(timeToExpiry));
        return spot * this.normalPDF(d1) * Math.sqrt(timeToExpiry);
    }

    /**
     * Calculate option theta
     */
    calculateOptionTheta(spot, strike, volatility, timeToExpiry) {
        const d1 = (Math.log(spot / strike) + (0.02 + 0.5 * volatility * volatility) * timeToExpiry) /
                   (volatility * Math.sqrt(timeToExpiry));
        const d2 = d1 - volatility * Math.sqrt(timeToExpiry);
        
        return -(spot * this.normalPDF(d1) * volatility) / (2 * Math.sqrt(timeToExpiry)) -
               0.02 * strike * Math.exp(-0.02 * timeToExpiry) * this.normalCDF(d2);
    }

    /**
     * Normal cumulative distribution function
     */
    normalCDF(x) {
        return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
    }

    /**
     * Normal probability density function
     */
    normalPDF(x) {
        return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    }

    /**
     * Error function approximation
     */
    erf(x) {
        const a1 =  0.254829592;
        const a2 = -0.284496736;
        const a3 =  1.421413741;
        const a4 = -1.453152027;
        const a5 =  1.061405429;
        const p  =  0.3275911;

        const sign = x >= 0 ? 1 : -1;
        x = Math.abs(x);

        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

        return sign * y;
    }
}

module.exports = HedgingStrategyOptimizer;