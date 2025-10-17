/**
 * Tests for Multi-Currency Budgeting System
 */

const MultiCurrencyBudgetManager = require('../../src/multi-currency/budgeting/multi-currency-budget-manager');
const ExpenseTrackingService = require('../../src/multi-currency/budgeting/expense-tracking-service');
const FXImpactAnalyzer = require('../../src/multi-currency/budgeting/fx-impact-analyzer');
const MultiCurrencyReportingEngine = require('../../src/multi-currency/reporting/multi-currency-reporting-engine');

describe('Multi-Currency Budgeting System', () => {
    let budgetManager;
    let expenseService;
    let fxAnalyzer;
    let reportingEngine;
    let mockServices;

    beforeEach(() => {
        mockServices = {
            currencyConverter: {
                convert: jest.fn().mockResolvedValue({ convertedAmount: 1100, exchangeRate: 1.1 })
            },
            exchangeRateService: {
                getRate: jest.fn().mockResolvedValue(1.1),
                getHistoricalRates: jest.fn().mockResolvedValue([
                    { date: new Date(), rate: 1.1 },
                    { date: new Date(), rate: 1.08 }
                ])
            },
            approvalService: {
                submitApprovalRequest: jest.fn().mockResolvedValue(true)
            },
            notificationService: {
                sendNotification: jest.fn().mockResolvedValue(true)
            },
            ocrService: {
                processReceipt: jest.fn().mockResolvedValue({
                    total: 25.50,
                    currency: 'USD',
                    merchant: 'Test Restaurant',
                    date: new Date(),
                    confidence: 0.95
                })
            }
        };

        budgetManager = new MultiCurrencyBudgetManager({
            currencyConverter: mockServices.currencyConverter,
            exchangeRateService: mockServices.exchangeRateService,
            approvalService: mockServices.approvalService,
            notificationService: mockServices.notificationService,
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        });

        expenseService = new ExpenseTrackingService({
            currencyConverter: mockServices.currencyConverter,
            ocrService: mockServices.ocrService,
            budgetManager: budgetManager,
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        });

        fxAnalyzer = new FXImpactAnalyzer({
            exchangeRateService: mockServices.exchangeRateService,
            budgetManager: budgetManager,
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        });

        reportingEngine = new MultiCurrencyReportingEngine({
            budgetManager: budgetManager,
            expenseService: expenseService,
            fxImpactAnalyzer: fxAnalyzer,
            currencyConverter: mockServices.currencyConverter,
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        });
    });

    describe('Budget Creation and Management', () => {
        it('should create multi-currency budget successfully', async () => {
            const userId = 'user123';
            const budgetData = {
                name: 'Q1 Marketing Budget',
                description: 'Marketing budget for Q1',
                baseCurrency: 'USD',
                totalAmount: 100000,
                startDate: '2024-01-01',
                endDate: '2024-03-31',
                categories: [
                    {
                        name: 'Digital Marketing',
                        amount: 60000,
                        currencies: ['USD', 'EUR'],
                        currencyAllocations: [
                            { currency: 'USD', percentage: 0.7 },
                            { currency: 'EUR', percentage: 0.3 }
                        ]
                    },
                    {
                        name: 'Events',
                        amount: 40000,
                        currencies: ['USD', 'GBP'],
                        currencyAllocations: [
                            { currency: 'USD', percentage: 0.5 },
                            { currency: 'GBP', percentage: 0.5 }
                        ]
                    }
                ]
            };

            const budget = await budgetManager.createBudget(userId, budgetData);

            expect(budget).toHaveProperty('id');
            expect(budget.name).toBe('Q1 Marketing Budget');
            expect(budget.totalAmount).toBe(100000);
            expect(budget.categories.length).toBe(2);
            expect(budget.allocations.size).toBeGreaterThan(0);
            expect(budget.status).toBe('active');
        });

        it('should apply budget template correctly', async () => {
            const userId = 'user123';
            const budgetData = {
                name: 'Corporate Budget',
                baseCurrency: 'USD',
                totalAmount: 500000,
                startDate: '2024-01-01',
                endDate: '2024-12-31',
                template: 'corporate'
            };

            const budget = await budgetManager.createBudget(userId, budgetData);

            expect(budget.categories.length).toBe(5); // Corporate template has 5 categories
            expect(budget.categories.find(c => c.name === 'Operations')).toBeTruthy();
            expect(budget.categories.find(c => c.name === 'Marketing')).toBeTruthy();
            expect(budget.approvalLimits).toBeDefined();
        });

        it('should handle budget approval workflow', async () => {
            const userId = 'user123';
            const budgetData = {
                name: 'Test Budget',
                baseCurrency: 'USD',
                totalAmount: 50000,
                startDate: '2024-01-01',
                endDate: '2024-12-31',
                requiresApproval: true
            };

            budgetManager.approvalRequired = true;
            const budget = await budgetManager.createBudget(userId, budgetData);

            expect(budget.status).toBe('pending_approval');
            expect(budget.approvals.has('creation')).toBe(true);

            // Approve budget
            const approvedBudget = await budgetManager.approveBudget(budget.id, 'approver123', 'Approved');
            expect(approvedBudget.status).toBe('active');
            expect(mockServices.notificationService.sendNotification).toHaveBeenCalled();
        });

        it('should update budget with FX changes', async () => {
            const userId = 'user123';
            const budgetData = {
                name: 'FX Test Budget',
                baseCurrency: 'USD',
                totalAmount: 100000,
                startDate: '2024-01-01',
                endDate: '2024-12-31',
                categories: [{
                    name: 'Test Category',
                    amount: 100000,
                    currencies: ['EUR'],
                    currencyAllocations: [{ currency: 'EUR', percentage: 1.0 }]
                }]
            };

            const budget = await budgetManager.createBudget(userId, budgetData);
            
            // Simulate FX rate change
            const newRates = { 'USD/EUR': 1.2 }; // Rate increased from 1.1 to 1.2
            const result = await budgetManager.updateBudgetWithFXChanges(budget.id, newRates);

            expect(result.fxImpact.totalImpact).toBeGreaterThan(0);
            expect(result.budget.metadata.lastFXUpdate).toBeDefined();
        });
    });

    describe('Expense Tracking', () => {
        it('should create expense and auto-categorize', async () => {
            const userId = 'user123';
            const expenseData = {
                amount: 150,
                currency: 'EUR',
                baseCurrency: 'USD',
                description: 'Uber ride to airport',
                merchant: 'UBER',
                date: new Date()
            };

            const expense = await expenseService.createExpense(userId, expenseData);

            expect(expense).toHaveProperty('id');
            expect(expense.baseCurrencyAmount).toBe(1100); // Mocked conversion
            expect(expense.category).toBe('Travel'); // Auto-categorized
            expect(expense.metadata.autoCategorizationApplied).toBe(true);
        });

        it('should process OCR receipt', async () => {
            const userId = 'user123';
            const receiptImage = 'base64-image-data';

            const expense = await expenseService.processReceiptOCR(userId, receiptImage);

            expect(expense.amount).toBe(25.50);
            expect(expense.merchant).toBe('Test Restaurant');
            expect(expense.receipt.confidence).toBe(0.95);
            expect(mockServices.ocrService.processReceipt).toHaveBeenCalledWith(receiptImage);
        });

        it('should update budget when expense is linked', async () => {
            // Create budget first
            const userId = 'user123';
            const budgetData = {
                name: 'Test Budget',
                baseCurrency: 'USD',
                totalAmount: 10000,
                startDate: '2024-01-01',
                endDate: '2024-12-31',
                categories: [{
                    name: 'Travel',
                    amount: 5000,
                    currencies: ['USD'],
                    currencyAllocations: [{ currency: 'USD', percentage: 1.0 }]
                }]
            };

            const budget = await budgetManager.createBudget(userId, budgetData);

            // Create expense linked to budget
            const expenseData = {
                amount: 100,
                currency: 'USD',
                description: 'Travel expense',
                category: 'Travel',
                budgetId: budget.id
            };

            const expense = await expenseService.createExpense(userId, expenseData);

            // Check budget was updated
            const updatedBudget = budgetManager.getBudget(budget.id);
            const travelCategory = updatedBudget.categories.find(c => c.name === 'Travel');
            const usdAllocation = travelCategory.allocations.get('USD');
            
            expect(usdAllocation.spent).toBe(100);
            expect(usdAllocation.remaining).toBe(usdAllocation.amount - 100);
        });

        it('should generate expense report', async () => {
            const userId = 'user123';
            
            // Create some test expenses
            await expenseService.createExpense(userId, {
                amount: 100, currency: 'USD', category: 'Travel', date: new Date()
            });
            await expenseService.createExpense(userId, {
                amount: 50, currency: 'EUR', category: 'Meals', date: new Date()
            });

            const report = await expenseService.generateExpenseReport(userId);

            expect(report.totalExpenses).toBe(2);
            expect(report.currencyBreakdown.size).toBe(2);
            expect(report.categoryBreakdown.size).toBe(2);
            expect(report.totalAmount).toBeGreaterThan(0);
        });
    });

    describe('FX Impact Analysis', () => {
        it('should analyze budget FX impact', async () => {
            // Create budget with multiple currencies
            const userId = 'user123';
            const budgetData = {
                name: 'FX Impact Test',
                baseCurrency: 'USD',
                totalAmount: 100000,
                startDate: '2024-01-01',
                endDate: '2024-12-31',
                categories: [{
                    name: 'Operations',
                    amount: 100000,
                    currencies: ['EUR', 'GBP'],
                    currencyAllocations: [
                        { currency: 'EUR', percentage: 0.6 },
                        { currency: 'GBP', percentage: 0.4 }
                    ]
                }]
            };

            const budget = await budgetManager.createBudget(userId, budgetData);

            // Mock historical rates with volatility
            mockServices.exchangeRateService.getHistoricalRates.mockResolvedValue([
                { date: new Date('2024-01-01'), rate: 1.0 },
                { date: new Date('2024-01-02'), rate: 1.05 },
                { date: new Date('2024-01-03'), rate: 1.1 },
                { date: new Date('2024-01-04'), rate: 1.08 }
            ]);

            const analysis = await fxAnalyzer.analyzeBudgetFXImpact(budget.id);

            expect(analysis).toHaveProperty('totalImpact');
            expect(analysis).toHaveProperty('currencyImpacts');
            expect(analysis).toHaveProperty('scenarios');
            expect(analysis).toHaveProperty('recommendations');
            expect(analysis.currencyImpacts.size).toBeGreaterThan(0);
        });

        it('should perform sensitivity analysis', async () => {
            const userId = 'user123';
            const budgetData = {
                name: 'Sensitivity Test',
                baseCurrency: 'USD',
                totalAmount: 50000,
                startDate: '2024-01-01',
                endDate: '2024-12-31',
                categories: [{
                    name: 'Test',
                    amount: 50000,
                    currencies: ['EUR'],
                    currencyAllocations: [{ currency: 'EUR', percentage: 1.0 }]
                }]
            };

            const budget = await budgetManager.createBudget(userId, budgetData);
            const sensitivity = await fxAnalyzer.performSensitivityAnalysis(budget.id);

            expect(sensitivity).toHaveProperty('shockResults');
            expect(sensitivity.shockResults.size).toBeGreaterThan(0);
            
            // Check that different shock levels are tested
            const firstShock = sensitivity.shockResults.get(0.05);
            expect(firstShock).toBeDefined();
            expect(firstShock.has('EUR')).toBe(true);
        });

        it('should generate FX forecast', async () => {
            const userId = 'user123';
            const budgetData = {
                name: 'Forecast Test',
                baseCurrency: 'USD',
                totalAmount: 30000,
                startDate: '2024-01-01',
                endDate: '2024-12-31',
                categories: [{
                    name: 'Test',
                    amount: 30000,
                    currencies: ['EUR'],
                    currencyAllocations: [{ currency: 'EUR', percentage: 1.0 }]
                }]
            };

            const budget = await budgetManager.createBudget(userId, budgetData);
            
            // Mock sufficient historical data
            const historicalRates = Array.from({ length: 100 }, (_, i) => ({
                date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
                rate: 1.1 + (Math.random() - 0.5) * 0.1
            }));
            
            mockServices.exchangeRateService.getHistoricalRates.mockResolvedValue(historicalRates);

            const forecast = await fxAnalyzer.generateFXForecast(budget.id, 90);

            expect(forecast).toHaveProperty('currencyForecasts');
            expect(forecast.currencyForecasts.has('EUR')).toBe(true);
            
            const eurForecast = forecast.currencyForecasts.get('EUR');
            expect(eurForecast).toHaveProperty('forecastedRate');
            expect(eurForecast).toHaveProperty('confidenceInterval');
            expect(eurForecast).toHaveProperty('budgetImpact');
        });
    });

    describe('Reporting System', () => {
        it('should generate budget performance report', async () => {
            const userId = 'user123';
            
            // Create budget and expenses
            const budgetData = {
                name: 'Performance Test Budget',
                baseCurrency: 'USD',
                totalAmount: 20000,
                startDate: '2024-01-01',
                endDate: '2024-12-31',
                categories: [{
                    name: 'Marketing',
                    amount: 20000,
                    currencies: ['USD'],
                    currencyAllocations: [{ currency: 'USD', percentage: 1.0 }]
                }]
            };

            const budget = await budgetManager.createBudget(userId, budgetData);
            
            await expenseService.createExpense(userId, {
                amount: 5000,
                currency: 'USD',
                category: 'Marketing',
                budgetId: budget.id,
                date: new Date()
            });

            const report = await reportingEngine.generateReport(userId, 'budget_performance');

            expect(report).toHaveProperty('sections');
            expect(report.sections).toHaveProperty('summary');
            expect(report.sections).toHaveProperty('budget_vs_actual');
            expect(report.sections).toHaveProperty('currency_breakdown');
            expect(report.sections).toHaveProperty('fx_impact');
            expect(report.sections).toHaveProperty('variance_analysis');
        });

        it('should generate expense analysis report', async () => {
            const userId = 'user123';
            
            // Create various expenses
            await expenseService.createExpense(userId, {
                amount: 100, currency: 'USD', category: 'Travel', 
                merchant: 'Airline', date: new Date('2024-01-15')
            });
            await expenseService.createExpense(userId, {
                amount: 50, currency: 'EUR', category: 'Meals', 
                merchant: 'Restaurant', date: new Date('2024-01-20')
            });
            await expenseService.createExpense(userId, {
                amount: 200, currency: 'USD', category: 'Travel', 
                merchant: 'Hotel', date: new Date('2024-02-01')
            });

            const report = await reportingEngine.generateReport(userId, 'expense_analysis', {
                startDate: '2024-01-01',
                endDate: '2024-02-28'
            });

            expect(report.sections).toHaveProperty('expense_summary');
            expect(report.sections).toHaveProperty('category_breakdown');
            expect(report.sections).toHaveProperty('currency_distribution');
            expect(report.sections).toHaveProperty('trends');
            
            const summary = report.sections.expense_summary;
            expect(summary.totalExpenses).toBe(3);
            expect(summary.categoryCount).toBe(2);
            expect(summary.currencyCount).toBe(2);
        });

        it('should generate consolidated financial report', async () => {
            const userId = 'user123';
            
            const report = await reportingEngine.generateReport(userId, 'consolidated_financial');

            expect(report.sections).toHaveProperty('executive_summary');
            expect(report.sections).toHaveProperty('budget_performance');
            expect(report.sections).toHaveProperty('expense_analysis');
            expect(report.sections).toHaveProperty('fx_impact');
            expect(report.sections).toHaveProperty('recommendations');
        });
    });

    describe('Integration Tests', () => {
        it('should handle complete budget lifecycle', async () => {
            const userId = 'user123';
            
            // 1. Create budget
            const budgetData = {
                name: 'Integration Test Budget',
                baseCurrency: 'USD',
                totalAmount: 50000,
                startDate: '2024-01-01',
                endDate: '2024-12-31',
                categories: [
                    {
                        name: 'Travel',
                        amount: 30000,
                        currencies: ['USD', 'EUR'],
                        currencyAllocations: [
                            { currency: 'USD', percentage: 0.6 },
                            { currency: 'EUR', percentage: 0.4 }
                        ]
                    },
                    {
                        name: 'Equipment',
                        amount: 20000,
                        currencies: ['USD'],
                        currencyAllocations: [{ currency: 'USD', percentage: 1.0 }]
                    }
                ]
            };

            const budget = await budgetManager.createBudget(userId, budgetData);
            expect(budget.status).toBe('active');

            // 2. Add expenses
            await expenseService.createExpense(userId, {
                amount: 1000, currency: 'USD', category: 'Travel', 
                budgetId: budget.id, date: new Date()
            });
            await expenseService.createExpense(userId, {
                amount: 500, currency: 'EUR', category: 'Travel', 
                budgetId: budget.id, date: new Date()
            });

            // 3. Analyze FX impact
            const fxAnalysis = await fxAnalyzer.analyzeBudgetFXImpact(budget.id);
            expect(fxAnalysis).toHaveProperty('totalImpact');

            // 4. Generate report
            const report = await reportingEngine.generateReport(userId, 'budget_performance');
            expect(report.sections.summary.totalBudgets).toBe(1);

            // 5. Update with FX changes
            const newRates = { 'USD/EUR': 1.15 };
            const fxUpdate = await budgetManager.updateBudgetWithFXChanges(budget.id, newRates);
            expect(fxUpdate.fxImpact).toBeDefined();
        });

        it('should handle multi-currency expense workflow', async () => {
            const userId = 'user123';
            
            // Create expenses in different currencies
            const expenses = [
                { amount: 100, currency: 'USD', category: 'Travel' },
                { amount: 80, currency: 'EUR', category: 'Meals' },
                { amount: 60, currency: 'GBP', category: 'Transport' },
                { amount: 5000, currency: 'JPY', category: 'Accommodation' }
            ];

            const createdExpenses = [];
            for (const expenseData of expenses) {
                const expense = await expenseService.createExpense(userId, expenseData);
                createdExpenses.push(expense);
            }

            expect(createdExpenses.length).toBe(4);
            
            // Generate expense report
            const report = await expenseService.generateExpenseReport(userId);
            expect(report.currencyBreakdown.size).toBe(4);
            expect(report.categoryBreakdown.size).toBe(4);
        });
    });

    describe('Error Handling', () => {
        it('should handle invalid budget data', async () => {
            const userId = 'user123';
            const invalidBudgetData = {
                name: '',
                totalAmount: -1000
            };

            await expect(budgetManager.createBudget(userId, invalidBudgetData))
                .rejects.toThrow();
        });

        it('should handle currency conversion failures', async () => {
            mockServices.currencyConverter.convert.mockRejectedValue(new Error('Conversion failed'));

            const userId = 'user123';
            const expenseData = {
                amount: 100,
                currency: 'EUR',
                baseCurrency: 'USD'
            };

            await expect(expenseService.createExpense(userId, expenseData))
                .rejects.toThrow('Conversion failed');
        });

        it('should handle missing budget for FX analysis', async () => {
            await expect(fxAnalyzer.analyzeBudgetFXImpact('nonexistent-budget'))
                .rejects.toThrow('Budget nonexistent-budget not found');
        });
    });
});