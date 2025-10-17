/**
 * Multi-Currency Reporting Engine
 */

const { v4: uuidv4 } = require('uuid');

class MultiCurrencyReportingEngine {
    constructor(options = {}) {
        this.budgetManager = options.budgetManager;
        this.expenseService = options.expenseService;
        this.fxImpactAnalyzer = options.fxImpactAnalyzer;
        this.currencyConverter = options.currencyConverter;
        this.logger = options.logger || console;
        
        this.reportTemplates = new Map();
        this.generatedReports = new Map();
        
        this.initializeReportTemplates();
    }

    initializeReportTemplates() {
        this.reportTemplates.set('budget_performance', {
            name: 'Budget Performance Report',
            sections: ['summary', 'budget_vs_actual', 'currency_breakdown', 'fx_impact', 'variance_analysis'],
            defaultPeriod: 'monthly',
            supportedFormats: ['json', 'pdf', 'excel']
        });

        this.reportTemplates.set('expense_analysis', {
            name: 'Expense Analysis Report',
            sections: ['expense_summary', 'category_breakdown', 'currency_distribution', 'trends', 'top_merchants'],
            defaultPeriod: 'monthly',
            supportedFormats: ['json', 'pdf', 'excel']
        });

        this.reportTemplates.set('fx_impact', {
            name: 'FX Impact Report',
            sections: ['fx_summary', 'currency_performance', 'hedging_effectiveness', 'risk_metrics'],
            defaultPeriod: 'monthly',
            supportedFormats: ['json', 'pdf']
        });

        this.reportTemplates.set('consolidated_financial', {
            name: 'Consolidated Financial Report',
            sections: ['executive_summary', 'budget_performance', 'expense_analysis', 'fx_impact', 'recommendations'],
            defaultPeriod: 'monthly',
            supportedFormats: ['json', 'pdf', 'excel']
        });
    }

    async generateReport(userId, reportType, options = {}) {
        const template = this.reportTemplates.get(reportType);
        if (!template) {
            throw new Error(`Report template '${reportType}' not found`);
        }

        const report = {
            id: uuidv4(),
            userId,
            type: reportType,
            name: template.name,
            period: options.period || template.defaultPeriod,
            startDate: new Date(options.startDate || this.getDefaultStartDate(options.period)),
            endDate: new Date(options.endDate || new Date()),
            baseCurrency: options.baseCurrency || 'USD',
            format: options.format || 'json',
            sections: {},
            metadata: {
                generatedAt: new Date(),
                generatedBy: userId,
                version: '1.0'
            }
        };

        // Generate each section
        for (const sectionName of template.sections) {
            try {
                report.sections[sectionName] = await this.generateReportSection(
                    sectionName, 
                    userId, 
                    report
                );
            } catch (error) {
                this.logger.error(`Failed to generate section ${sectionName}:`, error);
                report.sections[sectionName] = { error: error.message };
            }
        }

        this.generatedReports.set(report.id, report);
        return report;
    }

    async generateReportSection(sectionName, userId, report) {
        switch (sectionName) {
            case 'summary':
                return await this.generateSummarySection(userId, report);
            case 'budget_vs_actual':
                return await this.generateBudgetVsActualSection(userId, report);
            case 'currency_breakdown':
                return await this.generateCurrencyBreakdownSection(userId, report);
            case 'fx_impact':
                return await this.generateFXImpactSection(userId, report);
            case 'variance_analysis':
                return await this.generateVarianceAnalysisSection(userId, report);
            case 'expense_summary':
                return await this.generateExpenseSummarySection(userId, report);
            case 'category_breakdown':
                return await this.generateCategoryBreakdownSection(userId, report);
            case 'currency_distribution':
                return await this.generateCurrencyDistributionSection(userId, report);
            case 'trends':
                return await this.generateTrendsSection(userId, report);
            case 'top_merchants':
                return await this.generateTopMerchantsSection(userId, report);
            case 'fx_summary':
                return await this.generateFXSummarySection(userId, report);
            case 'currency_performance':
                return await this.generateCurrencyPerformanceSection(userId, report);
            case 'hedging_effectiveness':
                return await this.generateHedgingEffectivenessSection(userId, report);
            case 'risk_metrics':
                return await this.generateRiskMetricsSection(userId, report);
            case 'executive_summary':
                return await this.generateExecutiveSummarySection(userId, report);
            case 'recommendations':
                return await this.generateRecommendationsSection(userId, report);
            default:
                throw new Error(`Unknown section: ${sectionName}`);
        }
    }

    async generateSummarySection(userId, report) {
        const budgets = this.budgetManager.getUserBudgets(userId);
        const activeBudgets = budgets.filter(b => b.status === 'active');
        
        let totalBudgeted = 0;
        let totalSpent = 0;
        const currencySummary = new Map();

        for (const budget of activeBudgets) {
            const budgetSummary = await this.budgetManager.getBudgetSummary(budget.id);
            totalBudgeted += budgetSummary.totalAmount;
            totalSpent += budgetSummary.totalSpent;

            for (const currencyData of budgetSummary.currencies) {
                if (!currencySummary.has(currencyData.currency)) {
                    currencySummary.set(currencyData.currency, {
                        budgeted: 0,
                        spent: 0,
                        remaining: 0
                    });
                }
                const summary = currencySummary.get(currencyData.currency);
                summary.budgeted += currencyData.baseAmount;
                summary.spent += currencyData.spent;
                summary.remaining += currencyData.remaining;
            }
        }

        return {
            totalBudgets: activeBudgets.length,
            totalBudgeted,
            totalSpent,
            totalRemaining: totalBudgeted - totalSpent,
            utilizationRate: totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0,
            currencySummary: Object.fromEntries(currencySummary),
            period: `${report.startDate.toISOString().split('T')[0]} to ${report.endDate.toISOString().split('T')[0]}`
        };
    }

    async generateBudgetVsActualSection(userId, report) {
        const budgets = this.budgetManager.getUserBudgets(userId);
        const activeBudgets = budgets.filter(b => b.status === 'active');
        const budgetComparisons = [];

        for (const budget of activeBudgets) {
            const budgetSummary = await this.budgetManager.getBudgetSummary(budget.id);
            const comparison = {
                budgetId: budget.id,
                budgetName: budget.name,
                budgeted: budgetSummary.totalAmount,
                actual: budgetSummary.totalSpent,
                variance: budgetSummary.totalSpent - budgetSummary.totalAmount,
                variancePercent: budgetSummary.totalAmount > 0 ? 
                    ((budgetSummary.totalSpent - budgetSummary.totalAmount) / budgetSummary.totalAmount) * 100 : 0,
                categories: []
            };

            for (const category of budgetSummary.categories) {
                comparison.categories.push({
                    name: category.name,
                    budgeted: category.amount,
                    actual: category.spent,
                    variance: category.spent - category.amount,
                    variancePercent: category.amount > 0 ? 
                        ((category.spent - category.amount) / category.amount) * 100 : 0
                });
            }

            budgetComparisons.push(comparison);
        }

        return {
            budgetComparisons,
            overallVariance: budgetComparisons.reduce((sum, comp) => sum + comp.variance, 0),
            budgetsOverBudget: budgetComparisons.filter(comp => comp.variance > 0).length,
            budgetsUnderBudget: budgetComparisons.filter(comp => comp.variance < 0).length
        };
    }

    async generateCurrencyBreakdownSection(userId, report) {
        const expenses = this.expenseService.getExpensesByUser(userId, {
            startDate: report.startDate,
            endDate: report.endDate
        });

        const currencyBreakdown = new Map();
        let totalAmount = 0;

        for (const expense of expenses) {
            if (!currencyBreakdown.has(expense.currency)) {
                currencyBreakdown.set(expense.currency, {
                    currency: expense.currency,
                    totalAmount: 0,
                    totalBaseAmount: 0,
                    transactionCount: 0,
                    averageAmount: 0,
                    averageRate: 0
                });
            }

            const breakdown = currencyBreakdown.get(expense.currency);
            breakdown.totalAmount += expense.amount;
            breakdown.totalBaseAmount += expense.baseCurrencyAmount;
            breakdown.transactionCount++;
            totalAmount += expense.baseCurrencyAmount;
        }

        // Calculate percentages and averages
        currencyBreakdown.forEach(breakdown => {
            breakdown.percentage = totalAmount > 0 ? (breakdown.totalBaseAmount / totalAmount) * 100 : 0;
            breakdown.averageAmount = breakdown.transactionCount > 0 ? 
                breakdown.totalAmount / breakdown.transactionCount : 0;
            breakdown.averageRate = breakdown.totalAmount > 0 ? 
                breakdown.totalBaseAmount / breakdown.totalAmount : 0;
        });

        return {
            totalAmount,
            currencyCount: currencyBreakdown.size,
            breakdown: Array.from(currencyBreakdown.values()).sort((a, b) => b.totalBaseAmount - a.totalBaseAmount)
        };
    }

    async generateFXImpactSection(userId, report) {
        const budgets = this.budgetManager.getUserBudgets(userId);
        const fxImpacts = [];
        let totalFXImpact = 0;

        for (const budget of budgets) {
            if (budget.status === 'active') {
                try {
                    const impact = await this.fxImpactAnalyzer.analyzeBudgetFXImpact(budget.id);
                    fxImpacts.push({
                        budgetId: budget.id,
                        budgetName: budget.name,
                        totalImpact: impact.totalImpact,
                        impactPercentage: impact.impactPercentage,
                        currencyImpacts: Object.fromEntries(impact.currencyImpacts)
                    });
                    totalFXImpact += impact.totalImpact;
                } catch (error) {
                    this.logger.error(`FX impact analysis failed for budget ${budget.id}:`, error);
                }
            }
        }

        return {
            totalFXImpact,
            budgetImpacts: fxImpacts,
            averageImpactPercentage: fxImpacts.length > 0 ? 
                fxImpacts.reduce((sum, impact) => sum + impact.impactPercentage, 0) / fxImpacts.length : 0
        };
    }

    async generateVarianceAnalysisSection(userId, report) {
        const budgets = this.budgetManager.getUserBudgets(userId);
        const variances = [];

        for (const budget of budgets) {
            if (budget.status === 'active') {
                const budgetSummary = await this.budgetManager.getBudgetSummary(budget.id);
                
                // Separate operational variance from FX variance
                let fxVariance = 0;
                try {
                    const fxImpact = await this.fxImpactAnalyzer.analyzeBudgetFXImpact(budget.id);
                    fxVariance = fxImpact.totalImpact;
                } catch (error) {
                    this.logger.warn(`Could not calculate FX variance for budget ${budget.id}`);
                }

                const totalVariance = budgetSummary.totalSpent - budgetSummary.totalAmount;
                const operationalVariance = totalVariance - fxVariance;

                variances.push({
                    budgetId: budget.id,
                    budgetName: budget.name,
                    totalVariance,
                    operationalVariance,
                    fxVariance,
                    operationalVariancePercent: budgetSummary.totalAmount > 0 ? 
                        (operationalVariance / budgetSummary.totalAmount) * 100 : 0,
                    fxVariancePercent: budgetSummary.totalAmount > 0 ? 
                        (fxVariance / budgetSummary.totalAmount) * 100 : 0
                });
            }
        }

        return {
            budgetVariances: variances,
            totalOperationalVariance: variances.reduce((sum, v) => sum + v.operationalVariance, 0),
            totalFXVariance: variances.reduce((sum, v) => sum + v.fxVariance, 0)
        };
    }

    async generateExpenseSummarySection(userId, report) {
        const expenses = this.expenseService.getExpensesByUser(userId, {
            startDate: report.startDate,
            endDate: report.endDate
        });

        const summary = {
            totalExpenses: expenses.length,
            totalAmount: expenses.reduce((sum, exp) => sum + exp.baseCurrencyAmount, 0),
            averageExpense: 0,
            medianExpense: 0,
            currencyCount: new Set(expenses.map(exp => exp.currency)).size,
            categoryCount: new Set(expenses.map(exp => exp.category)).size,
            dailyAverage: 0
        };

        if (expenses.length > 0) {
            summary.averageExpense = summary.totalAmount / expenses.length;
            
            const sortedAmounts = expenses.map(exp => exp.baseCurrencyAmount).sort((a, b) => a - b);
            const mid = Math.floor(sortedAmounts.length / 2);
            summary.medianExpense = sortedAmounts.length % 2 === 0 ? 
                (sortedAmounts[mid - 1] + sortedAmounts[mid]) / 2 : sortedAmounts[mid];

            const daysDiff = Math.ceil((report.endDate - report.startDate) / (1000 * 60 * 60 * 24));
            summary.dailyAverage = summary.totalAmount / daysDiff;
        }

        return summary;
    }

    async generateCategoryBreakdownSection(userId, report) {
        const expenses = this.expenseService.getExpensesByUser(userId, {
            startDate: report.startDate,
            endDate: report.endDate
        });

        const categoryBreakdown = new Map();
        let totalAmount = 0;

        for (const expense of expenses) {
            if (!categoryBreakdown.has(expense.category)) {
                categoryBreakdown.set(expense.category, {
                    category: expense.category,
                    totalAmount: 0,
                    transactionCount: 0,
                    averageAmount: 0,
                    currencies: new Set()
                });
            }

            const breakdown = categoryBreakdown.get(expense.category);
            breakdown.totalAmount += expense.baseCurrencyAmount;
            breakdown.transactionCount++;
            breakdown.currencies.add(expense.currency);
            totalAmount += expense.baseCurrencyAmount;
        }

        // Calculate percentages and averages
        const result = Array.from(categoryBreakdown.values()).map(breakdown => ({
            ...breakdown,
            currencies: Array.from(breakdown.currencies),
            percentage: totalAmount > 0 ? (breakdown.totalAmount / totalAmount) * 100 : 0,
            averageAmount: breakdown.transactionCount > 0 ? breakdown.totalAmount / breakdown.transactionCount : 0
        })).sort((a, b) => b.totalAmount - a.totalAmount);

        return {
            totalAmount,
            categoryCount: result.length,
            breakdown: result
        };
    }

    async generateTrendsSection(userId, report) {
        const expenses = this.expenseService.getExpensesByUser(userId, {
            startDate: report.startDate,
            endDate: report.endDate
        });

        // Group by month
        const monthlyTrends = new Map();
        
        for (const expense of expenses) {
            const monthKey = `${expense.date.getFullYear()}-${String(expense.date.getMonth() + 1).padStart(2, '0')}`;
            
            if (!monthlyTrends.has(monthKey)) {
                monthlyTrends.set(monthKey, {
                    month: monthKey,
                    totalAmount: 0,
                    transactionCount: 0,
                    categories: new Map(),
                    currencies: new Map()
                });
            }

            const trend = monthlyTrends.get(monthKey);
            trend.totalAmount += expense.baseCurrencyAmount;
            trend.transactionCount++;

            // Category trends
            if (!trend.categories.has(expense.category)) {
                trend.categories.set(expense.category, 0);
            }
            trend.categories.set(expense.category, trend.categories.get(expense.category) + expense.baseCurrencyAmount);

            // Currency trends
            if (!trend.currencies.has(expense.currency)) {
                trend.currencies.set(expense.currency, 0);
            }
            trend.currencies.set(expense.currency, trend.currencies.get(expense.currency) + expense.baseCurrencyAmount);
        }

        const trends = Array.from(monthlyTrends.values()).map(trend => ({
            ...trend,
            categories: Object.fromEntries(trend.categories),
            currencies: Object.fromEntries(trend.currencies)
        })).sort((a, b) => a.month.localeCompare(b.month));

        return {
            monthlyTrends: trends,
            trendAnalysis: this.analyzeTrends(trends)
        };
    }

    analyzeTrends(trends) {
        if (trends.length < 2) return { direction: 'insufficient_data' };

        const amounts = trends.map(t => t.totalAmount);
        const firstHalf = amounts.slice(0, Math.floor(amounts.length / 2));
        const secondHalf = amounts.slice(Math.floor(amounts.length / 2));

        const firstAvg = firstHalf.reduce((sum, amt) => sum + amt, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, amt) => sum + amt, 0) / secondHalf.length;

        const change = ((secondAvg - firstAvg) / firstAvg) * 100;

        return {
            direction: change > 5 ? 'increasing' : change < -5 ? 'decreasing' : 'stable',
            changePercent: change,
            averageMonthlySpend: amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length
        };
    }

    getDefaultStartDate(period) {
        const now = new Date();
        switch (period) {
            case 'weekly':
                return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            case 'monthly':
                return new Date(now.getFullYear(), now.getMonth(), 1);
            case 'quarterly':
                const quarter = Math.floor(now.getMonth() / 3);
                return new Date(now.getFullYear(), quarter * 3, 1);
            case 'yearly':
                return new Date(now.getFullYear(), 0, 1);
            default:
                return new Date(now.getFullYear(), now.getMonth(), 1);
        }
    }

    getReport(reportId) {
        return this.generatedReports.get(reportId);
    }

    getUserReports(userId) {
        return Array.from(this.generatedReports.values())
            .filter(report => report.userId === userId);
    }
}

module.exports = MultiCurrencyReportingEngine;