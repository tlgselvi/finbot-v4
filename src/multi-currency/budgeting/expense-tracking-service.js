/**
 * Multi-Currency Expense Tracking Service
 */

const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class ExpenseTrackingService extends EventEmitter {
    constructor(options = {}) {
        super();
        this.currencyConverter = options.currencyConverter;
        this.ocrService = options.ocrService;
        this.categoryService = options.categoryService;
        this.budgetManager = options.budgetManager;
        this.logger = options.logger || console;
        
        this.expenses = new Map();
        this.categories = new Map();
        this.autoCategorizationRules = new Map();
        
        this.initializeDefaultCategories();
        this.initializeCategorizationRules();
    }

    initializeDefaultCategories() {
        const defaultCategories = [
            { name: 'Travel', currencies: ['USD', 'EUR', 'GBP', 'JPY'], keywords: ['hotel', 'flight', 'taxi', 'uber'] },
            { name: 'Meals', currencies: ['USD', 'EUR', 'GBP'], keywords: ['restaurant', 'food', 'cafe', 'lunch'] },
            { name: 'Office Supplies', currencies: ['USD', 'EUR'], keywords: ['office', 'supplies', 'stationery'] },
            { name: 'Technology', currencies: ['USD'], keywords: ['software', 'hardware', 'computer', 'tech'] },
            { name: 'Marketing', currencies: ['USD', 'EUR'], keywords: ['advertising', 'marketing', 'promotion'] }
        ];

        defaultCategories.forEach(cat => {
            this.categories.set(cat.name, {
                id: uuidv4(),
                name: cat.name,
                supportedCurrencies: cat.currencies,
                keywords: cat.keywords,
                rules: []
            });
        });
    }

    initializeCategorizationRules() {
        this.autoCategorizationRules.set('merchant_based', {
            'UBER': 'Travel',
            'AIRBNB': 'Travel',
            'BOOKING.COM': 'Travel',
            'AMAZON': 'Office Supplies',
            'MICROSOFT': 'Technology'
        });
    }

    async createExpense(userId, expenseData) {
        const expense = {
            id: uuidv4(),
            userId,
            amount: expenseData.amount,
            currency: expenseData.currency,
            baseCurrencyAmount: 0,
            baseCurrency: expenseData.baseCurrency || 'USD',
            exchangeRate: 1,
            description: expenseData.description,
            merchant: expenseData.merchant || '',
            category: expenseData.category || 'Uncategorized',
            subcategory: expenseData.subcategory || '',
            date: new Date(expenseData.date || Date.now()),
            location: expenseData.location || {},
            receipt: expenseData.receipt || null,
            budgetId: expenseData.budgetId || null,
            tags: expenseData.tags || [],
            metadata: {
                source: expenseData.source || 'manual',
                confidence: expenseData.confidence || 1.0,
                autoCategorizationApplied: false,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        };

        // Convert to base currency
        if (expense.currency !== expense.baseCurrency) {
            const conversion = await this.currencyConverter.convert(
                expense.amount, 
                expense.currency, 
                expense.baseCurrency
            );
            expense.baseCurrencyAmount = conversion.convertedAmount;
            expense.exchangeRate = conversion.exchangeRate;
        } else {
            expense.baseCurrencyAmount = expense.amount;
        }

        // Auto-categorize if not provided
        if (expense.category === 'Uncategorized') {
            expense.category = await this.autoCategorizExpense(expense);
            expense.metadata.autoCategorizationApplied = true;
        }

        // Update budget if linked
        if (expense.budgetId) {
            await this.updateBudgetWithExpense(expense);
        }

        this.expenses.set(expense.id, expense);
        this.emit('expenseCreated', expense);
        
        return expense;
    }

    async processReceiptOCR(userId, receiptImage, options = {}) {
        try {
            const ocrResult = await this.ocrService.processReceipt(receiptImage);
            
            const expense = {
                userId,
                amount: ocrResult.total,
                currency: ocrResult.currency || options.defaultCurrency || 'USD',
                description: ocrResult.merchant || 'Receipt expense',
                merchant: ocrResult.merchant,
                date: ocrResult.date || new Date(),
                location: ocrResult.location || {},
                receipt: {
                    imageUrl: receiptImage,
                    ocrData: ocrResult,
                    confidence: ocrResult.confidence
                },
                source: 'ocr'
            };

            return await this.createExpense(userId, expense);
        } catch (error) {
            this.logger.error('OCR processing failed:', error);
            throw error;
        }
    }

    async autoCategorizExpense(expense) {
        // Rule-based categorization
        const merchantUpper = expense.merchant.toUpperCase();
        for (const [merchant, category] of Object.entries(this.autoCategorizationRules.get('merchant_based'))) {
            if (merchantUpper.includes(merchant)) {
                return category;
            }
        }

        // Keyword-based categorization
        const description = expense.description.toLowerCase();
        for (const [categoryName, categoryData] of this.categories) {
            for (const keyword of categoryData.keywords) {
                if (description.includes(keyword)) {
                    return categoryName;
                }
            }
        }

        return 'Uncategorized';
    }

    async updateBudgetWithExpense(expense) {
        if (!this.budgetManager) return;

        try {
            const budget = this.budgetManager.getBudget(expense.budgetId);
            if (!budget) return;

            // Find matching category in budget
            const budgetCategory = budget.categories.find(cat => 
                cat.name.toLowerCase() === expense.category.toLowerCase()
            );

            if (budgetCategory) {
                // Update category allocation for the expense currency
                const allocation = budgetCategory.allocations.get(expense.currency);
                if (allocation) {
                    allocation.spent += expense.amount;
                    allocation.remaining = allocation.amount - allocation.spent;
                }

                // Update overall budget allocation
                const budgetAllocation = budget.allocations.get(expense.currency);
                if (budgetAllocation) {
                    budgetAllocation.spent += expense.amount;
                    budgetAllocation.remaining = budgetAllocation.amount - budgetAllocation.spent;
                }

                this.emit('budgetUpdated', { budgetId: expense.budgetId, expense });
            }
        } catch (error) {
            this.logger.error('Failed to update budget with expense:', error);
        }
    }

    getExpensesByUser(userId, filters = {}) {
        const userExpenses = Array.from(this.expenses.values())
            .filter(expense => expense.userId === userId);

        return this.applyFilters(userExpenses, filters);
    }

    applyFilters(expenses, filters) {
        let filtered = expenses;

        if (filters.startDate) {
            filtered = filtered.filter(exp => exp.date >= new Date(filters.startDate));
        }

        if (filters.endDate) {
            filtered = filtered.filter(exp => exp.date <= new Date(filters.endDate));
        }

        if (filters.category) {
            filtered = filtered.filter(exp => exp.category === filters.category);
        }

        if (filters.currency) {
            filtered = filtered.filter(exp => exp.currency === filters.currency);
        }

        if (filters.minAmount) {
            filtered = filtered.filter(exp => exp.baseCurrencyAmount >= filters.minAmount);
        }

        if (filters.maxAmount) {
            filtered = filtered.filter(exp => exp.baseCurrencyAmount <= filters.maxAmount);
        }

        return filtered;
    }

    async generateExpenseReport(userId, reportOptions = {}) {
        const expenses = this.getExpensesByUser(userId, reportOptions.filters || {});
        
        const report = {
            userId,
            period: reportOptions.period || 'monthly',
            baseCurrency: reportOptions.baseCurrency || 'USD',
            totalExpenses: expenses.length,
            totalAmount: 0,
            currencyBreakdown: new Map(),
            categoryBreakdown: new Map(),
            monthlyTrends: [],
            topMerchants: [],
            generatedAt: new Date()
        };

        // Calculate totals and breakdowns
        expenses.forEach(expense => {
            report.totalAmount += expense.baseCurrencyAmount;

            // Currency breakdown
            if (!report.currencyBreakdown.has(expense.currency)) {
                report.currencyBreakdown.set(expense.currency, {
                    amount: 0,
                    count: 0,
                    baseAmount: 0
                });
            }
            const currencyData = report.currencyBreakdown.get(expense.currency);
            currencyData.amount += expense.amount;
            currencyData.baseAmount += expense.baseCurrencyAmount;
            currencyData.count++;

            // Category breakdown
            if (!report.categoryBreakdown.has(expense.category)) {
                report.categoryBreakdown.set(expense.category, {
                    amount: 0,
                    count: 0,
                    percentage: 0
                });
            }
            const categoryData = report.categoryBreakdown.get(expense.category);
            categoryData.amount += expense.baseCurrencyAmount;
            categoryData.count++;
        });

        // Calculate percentages
        report.categoryBreakdown.forEach(categoryData => {
            categoryData.percentage = (categoryData.amount / report.totalAmount) * 100;
        });

        return report;
    }
}

module.exports = ExpenseTrackingService;