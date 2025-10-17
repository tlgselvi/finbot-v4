/**
 * Simple test for Hedging Strategy Optimizer - GitHub Actions Compatible
 */

const HedgingStrategyOptimizer = require('./src/multi-currency/risk/hedging-strategy-optimizer');

async function testHedgingOptimizer() {
    console.log('🚀 Testing Hedging Strategy Optimizer...');
    
    const optimizer = new HedgingStrategyOptimizer({
        maxIterations: 50, // Reduced for CI/CD
        instruments: {
            forward: {
                name: 'Forward Contract',
                costBasisPoints: 10,
                effectiveness: 0.95,
                minAmount: 10000,
                maxTenor: 365,
                liquidity: 'high'
            },
            option: {
                name: 'Currency Option',
                costBasisPoints: 50,
                effectiveness: 0.85,
                minAmount: 25000,
                maxTenor: 180,
                liquidity: 'medium'
            }
        }
    });

    const mockCurrencyRisk = {
        id: 'risk-1',
        userId: 'user-1',
        baseCurrency: 'USD',
        exposures: new Map([
            ['EUR', {
                currency: 'EUR',
                absoluteExposure: 150000,
                relativeExposure: 0.5, // 50% concentration - high risk
                exposureRank: 1
            }],
            ['GBP', {
                currency: 'GBP',
                absoluteExposure: 90000,
                relativeExposure: 0.3,
                exposureRank: 2
            }],
            ['JPY', {
                currency: 'JPY',
                absoluteExposure: 60000,
                relativeExposure: 0.2,
                exposureRank: 3
            }]
        ]),
        totalRisk: 75000,
        var: {
            parametric: {
                var95: 35000,
                var99: 50000
            }
        },
        riskFactors: [
            {
                type: 'individual',
                currency: 'EUR',
                riskContribution: 30000,
                relativeContribution: 0.4
            },
            {
                type: 'individual',
                currency: 'GBP',
                riskContribution: 25000,
                relativeContribution: 0.33
            },
            {
                type: 'individual',
                currency: 'JPY',
                riskContribution: 20000,
                relativeContribution: 0.27
            }
        ],
        volatilities: new Map([
            ['EUR', { annual: 0.15, daily: 0.01 }],
            ['GBP', { annual: 0.22, daily: 0.014 }], // High volatility
            ['JPY', { annual: 0.12, daily: 0.008 }]
        ]),
        correlationMatrix: new Map([
            ['EUR-GBP', 0.7],
            ['EUR-JPY', 0.3],
            ['GBP-JPY', 0.2]
        ]),
        riskScore: 75
    };

    try {
        console.log('Generating hedging strategies...');
        const hedgingRecommendation = await optimizer.generateHedgingStrategies('user-1', mockCurrencyRisk);
        
        console.log('\n=== HEDGING STRATEGY RECOMMENDATION ===');
        console.log(`Recommendation ID: ${hedgingRecommendation.id}`);
        console.log(`User ID: ${hedgingRecommendation.userId}`);
        console.log(`Base Currency: ${hedgingRecommendation.baseCurrency}`);
        console.log(`Total Cost: $${hedgingRecommendation.totalCost.toFixed(2)}`);
        console.log(`Expected Effectiveness: ${(hedgingRecommendation.expectedEffectiveness * 100).toFixed(1)}%`);
        console.log(`Risk Reduction: $${hedgingRecommendation.riskReduction.toFixed(2)}`);
        
        console.log('\n=== HEDGING NEEDS ANALYSIS ===');
        hedgingRecommendation.hedgingNeeds.forEach((need, index) => {
            console.log(`${index + 1}. ${need.currency}:`);
            console.log(`   Exposure: $${need.exposure.toFixed(2)} (${(need.relativeExposure * 100).toFixed(1)}%)`);
            console.log(`   Priority: ${need.priority.toUpperCase()}`);
            console.log(`   Recommended Hedge Ratio: ${(need.recommendedHedgeRatio * 100).toFixed(1)}%`);
            console.log(`   Time Horizon: ${need.timeHorizon} days`);
            console.log(`   Urgency: ${need.urgency}`);
        });
        
        console.log('\n=== RECOMMENDED STRATEGY ===');
        const recommended = hedgingRecommendation.recommendedStrategy;
        console.log(`Strategy ID: ${recommended.id}`);
        console.log(`Type: ${recommended.type}`);
        console.log(`Currency: ${recommended.currency}`);
        console.log(`Exposure: $${recommended.exposure.toFixed(2)}`);
        console.log(`Hedge Ratio: ${(recommended.hedgeRatio * 100).toFixed(1)}%`);
        console.log(`Time Horizon: ${recommended.timeHorizon} days`);
        console.log(`Cost: $${recommended.cost.toFixed(2)}`);
        console.log(`Effectiveness: ${(recommended.effectiveness * 100).toFixed(1)}%`);
        console.log(`Liquidity: ${recommended.liquidity}`);
        
        if (recommended.instrument) {
            console.log(`Instrument: ${recommended.instrument.name}`);
        }
        
        if (recommended.costBenefitAnalysis) {
            const cba = recommended.costBenefitAnalysis;
            console.log('\n--- Cost-Benefit Analysis ---');
            console.log(`Total Cost: $${cba.totalCost.toFixed(2)}`);
            console.log(`Total Benefit: $${cba.totalBenefit.toFixed(2)}`);
            console.log(`Benefit-Cost Ratio: ${cba.benefitCostRatio.toFixed(2)}`);
            console.log(`Hedge Effectiveness: ${(cba.hedgeEffectiveness * 100).toFixed(1)}%`);
            
            if (cba.scenarioAnalysis && cba.scenarioAnalysis.length > 0) {
                console.log('\n--- Scenario Analysis ---');
                cba.scenarioAnalysis.forEach(scenario => {
                    console.log(`${scenario.scenario}: Net Benefit $${scenario.netBenefit.toFixed(2)} (${(scenario.effectiveProtection * 100).toFixed(1)}% protection)`);
                });
            }
        }
        
        console.log('\n=== ALTERNATIVE STRATEGIES ===');
        hedgingRecommendation.alternativeStrategies.forEach((strategy, index) => {
            console.log(`${index + 1}. ${strategy.type} for ${strategy.currency}:`);
            console.log(`   Cost: $${strategy.cost.toFixed(2)}`);
            console.log(`   Effectiveness: ${(strategy.effectiveness * 100).toFixed(1)}%`);
            console.log(`   Liquidity: ${strategy.liquidity}`);
        });
        
        console.log('\n=== IMPLEMENTATION PLAN ===');
        const plan = hedgingRecommendation.implementationPlan;
        console.log(`Implementation Timeline: ${plan.timeline} days`);
        console.log(`Prerequisites: ${plan.prerequisites.join(', ')}`);
        
        console.log('\nImplementation Phases:');
        plan.phases.forEach(phase => {
            console.log(`Phase ${phase.phase}: ${phase.name} (${phase.duration} days)`);
            console.log(`  Tasks: ${phase.tasks.join(', ')}`);
        });
        
        console.log('\n=== REBALANCE SCHEDULE ===');
        const rebalance = hedgingRecommendation.rebalanceSchedule;
        console.log(`Frequency: ${rebalance.frequency}`);
        console.log(`Next Rebalance: ${rebalance.nextRebalance.toDateString()}`);
        console.log(`Triggers: ${rebalance.triggers.join(', ')}`);
        
        console.log('\n✅ Hedging Strategy Optimizer test completed successfully!');
        return true;
        
    } catch (error) {
        console.error('❌ Error testing Hedging Strategy Optimizer:', error.message);
        console.error(error.stack);
        return false;
    } finally {
        optimizer.removeAllListeners();
    }
}

// Run the test with timeout
async function runTest() {
    const timeout = setTimeout(() => {
        console.error('❌ Test timed out after 30 seconds');
        process.exit(1);
    }, 30000);
    
    try {
        const success = await testHedgingOptimizer();
        clearTimeout(timeout);
        process.exit(success ? 0 : 1);
    } catch (error) {
        clearTimeout(timeout);
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

runTest();