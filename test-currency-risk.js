/**
 * Simple test for Currency Risk Engine - GitHub Actions Compatible
 */

const CurrencyRiskEngine = require('./src/multi-currency/risk/currency-risk-engine');

async function testCurrencyRiskEngine() {
    console.log('🚀 Testing Currency Risk Engine...');
    
    const riskEngine = new CurrencyRiskEngine({
        monteCarloSimulations: 50, // Reduced for CI/CD
        riskUpdateInterval: 10000,
        lookbackPeriods: {
            short: 10,
            medium: 30,
            long: 60
        }
    });

    const mockPortfolio = {
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

    try {
        console.log('Calculating currency risk assessment...');
        const riskAssessment = await riskEngine.calculateCurrencyRisk('user-1', mockPortfolio);
        
        console.log('\n=== CURRENCY RISK ASSESSMENT ===');
        console.log(`Risk ID: ${riskAssessment.id}`);
        console.log(`User ID: ${riskAssessment.userId}`);
        console.log(`Base Currency: ${riskAssessment.baseCurrency}`);
        console.log(`Total Risk: $${riskAssessment.totalRisk.toFixed(2)}`);
        console.log(`Risk Score: ${riskAssessment.riskScore}/100`);
        
        console.log('\n=== CURRENCY EXPOSURES ===');
        for (const [currency, exposure] of riskAssessment.exposures) {
            console.log(`${currency}: $${exposure.absoluteExposure.toFixed(2)} (${(exposure.relativeExposure * 100).toFixed(1)}%)`);
        }
        
        console.log('\n=== VALUE AT RISK (VaR) ===');
        console.log(`Historical VaR (95%): $${riskAssessment.var.historical.var95.toFixed(2)}`);
        console.log(`Historical VaR (99%): $${riskAssessment.var.historical.var99.toFixed(2)}`);
        console.log(`Parametric VaR (95%): $${riskAssessment.var.parametric.var95.toFixed(2)}`);
        console.log(`Parametric VaR (99%): $${riskAssessment.var.parametric.var99.toFixed(2)}`);
        console.log(`Monte Carlo VaR (95%): $${riskAssessment.var.monteCarlo.var95.toFixed(2)}`);
        console.log(`Monte Carlo VaR (99%): $${riskAssessment.var.monteCarlo.var99.toFixed(2)}`);
        
        console.log('\n=== EXPECTED SHORTFALL ===');
        console.log(`Expected Shortfall (95%): $${riskAssessment.expectedShortfall.es95.toFixed(2)}`);
        console.log(`Expected Shortfall (99%): $${riskAssessment.expectedShortfall.es99.toFixed(2)}`);
        
        console.log('\n=== CONCENTRATION RISK ===');
        console.log(`Max Concentration: ${(riskAssessment.concentrationRisk.maxConcentration * 100).toFixed(1)}%`);
        console.log(`Herfindahl Index: ${riskAssessment.concentrationRisk.herfindahlIndex.toFixed(4)}`);
        console.log(`Risk Level: ${riskAssessment.concentrationRisk.riskLevel}`);
        
        console.log('\n=== TOP RISK FACTORS ===');
        riskAssessment.riskFactors.slice(0, 5).forEach((factor, index) => {
            if (factor.type === 'individual') {
                console.log(`${index + 1}. ${factor.currency} Individual Risk: $${factor.riskContribution.toFixed(2)} (${(factor.relativeContribution * 100).toFixed(1)}%)`);
            } else {
                console.log(`${index + 1}. ${factor.currencies.join('-')} Correlation Risk: $${factor.riskContribution.toFixed(2)} (${(factor.relativeContribution * 100).toFixed(1)}%)`);
            }
        });
        
        console.log('\n=== STRESS TEST RESULTS ===');
        riskAssessment.stressTests.slice(0, 3).forEach((test, index) => {
            console.log(`${index + 1}. ${test.scenario}: $${test.totalLoss.toFixed(2)} loss (${test.severity} severity)`);
        });
        
        console.log('\n=== RECOMMENDATIONS ===');
        riskAssessment.recommendations.forEach((rec, index) => {
            console.log(`${index + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`);
            console.log(`   ${rec.description}`);
            console.log(`   Action: ${rec.action}`);
        });
        
        console.log('\n✅ Currency Risk Engine test completed successfully!');
        return true;
        
    } catch (error) {
        console.error('❌ Error testing Currency Risk Engine:', error.message);
        console.error(error.stack);
        return false;
    } finally {
        riskEngine.removeAllListeners();
    }
}

// Run the test with timeout
async function runTest() {
    const timeout = setTimeout(() => {
        console.error('❌ Test timed out after 30 seconds');
        process.exit(1);
    }, 30000);
    
    try {
        const success = await testCurrencyRiskEngine();
        clearTimeout(timeout);
        process.exit(success ? 0 : 1);
    } catch (error) {
        clearTimeout(timeout);
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

runTest();