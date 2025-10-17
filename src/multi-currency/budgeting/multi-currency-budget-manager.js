/**
 * Multi-Currency Budget Manager
 * 
 * Manages budget creation, allocation, and tracking across multiple currencies
 * with automatic FX conversion and currency-specific limits.
 */

const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class MultiCurrencyBudgetManager extends EventEmitter {
    constructor(options = {}) {
        super();
        this.currencyConverter = options.currencyConverter;
        this.exchangeRateService = options.exchangeRateService;
        this.approvalService = options.approvalService;
        this.notificationService = options.notificationService;
        this.logger = options.logger || console;
        
        // Budget configuration
        this.defaultBudgetPeriod = options.defaultBudgetPeriod || 'monthly';
        this.autoConversionEnabled = options.autoConversionEnabled !== false;
        this.approvalRequired = options.approvalRequired || false;
        
        // Active budgets storage
        this.activeBudgets = new Map();
        this.budgetTemplates = new Map();
        this.budgetAllocations = new Map();
        
        this.initializeBudgetTemplates();
    }

    /**
     * Initialize predefined budget templates
     */
    initializeBudgetTemplates() {
        // Corporate budget template
        this.budgetTemplates.set('corporate', {
            name: 'Corporate Multi-Currency Budget',
            description: 'Standard corporate budget with multiple currencies',
            categories: [
                { name: 'Operations', percentage: 0.4, currencies: ['USD', 'EUR', 'GBP'] },
                { name: 'Marketing', percentage: 0.2, currencies: ['USD', 'EUR'] },
                { name: 'Travel', percentage: 0.15, currencies: ['USD', 'EUR', 'GBP', 'JPY'] },
                { name: 'Technology', percentage: 0.15, currencies: ['USD'] },
                { name: 'Contingency', percentage: 0.1, currencies: ['USD', 'EUR'] }
            ],
            approvalLimits: {
                'USD': 50000,
                'EUR': 45000,
                'GBP': 40000,
                'JPY': 5000000
            }
        });

        // Personal budget template
        this.budgetTemplates.set('personal', {
            name: 'Personal Multi-Currency Budget',
            description: 'Personal budget for international lifestyle',
            categories: [
                { name: 'Living Expenses', percentage: 0.5, currencies: ['USD', 'EUR', 'GBP'] },
                { name: 'Travel', percentage: 0.2, currencies: ['USD', 'EUR', 'GBP', 'JPY', 'AUD'] },
                { name: 'Entertainment', percentage: 0.15, currencies: ['USD', 'EUR'] },
                { name: 'Savings', percentage: 0.15, currencies: ['USD', 'EUR', 'CHF'] }
            ],
            approvalLimits: {
                'USD': 5000,
                'EUR': 4500,
                'GBP': 4000
            }
        });

        // Project budget template
        this.budgetTemplates.set('project', {
            name: 'Project Multi-Currency Budget',
            description: 'Project-specific budget with international scope',
            categories: [
                { name: 'Personnel', percentage: 0.6, currencies: ['USD', 'EUR', 'GBP', 'INR'] },
                { name: 'Equipment', percentage: 0.2, currencies: ['USD', 'EUR'] },
                { name: 'Travel & Meetings', percentage: 0.1, currencies: ['USD', 'EUR', 'GBP', 'JPY'] },
                { name: 'Miscellaneous', percentage: 0.1, currencies: ['USD', 'EUR'] }
            ],
            approvalLimits: {
                'USD': 25000,
                'EUR': 22000,
                'GBP': 20000,
                'INR': 2000000
            }
        });
    }

    /**
     * Create a new multi-currency budget
     */
    async createBudget(userId, budgetData) {
        try {
            const budget = {
                id: uuidv4(),
                userId,
                name: budgetData.name,
                description: budgetData.description || '',
                baseCurrency: budgetData.baseCurrency || 'USD',
                period: budgetData.period || this.defaultBudgetPeriod,
                startDate: new Date(budgetData.startDate),
                endDate: new Date(budgetData.endDate),
                totalAmount: budgetData.totalAmount,
                status: 'draft',
                categories: [],
                allocations: new Map(),
                approvals: new Map(),
                fxSettings: {
                    autoConversion: budgetData.autoConversion !== false,
                    hedgingEnabled: budgetData.hedgingEnabled || false,
                    rateType: budgetData.rateType || 'spot',
                    rateDate: budgetData.rateDate || new Date()
                },
                metadata: {
                    template: budgetData.template,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    version: 1
                }
            };

            // Apply template if specified
            if (budgetData.template && this.budgetTemplates.has(budgetData.template)) {
                await this.applyBudgetTemplate(budget, budgetData.template);
            }

            // Create budget categories
            if (budgetData.categories) {
                budget.categories = await this.createBudgetCategories(budget, budgetData.categories);
            }

            // Calculate currency allocations
            budget.allocations = await this.calculateCurrencyAllocations(budget);

            // Setup approval workflow if required
            if (this.approvalRequired || budgetData.requiresApproval) {
                await this.setupBudgetApproval(budget);
            } else {
                budget.status = 'active';
            }

            // Store budget
            this.activeBudgets.set(budget.id, budget);
            
            this.logger.info(`Multi-currency budget created: ${budget.id} for user ${userId}`);
            this.emit('budgetCreated', { budget, userId });

            return budget;
            
        } catch (error) {
            this.logger.error(`Failed to create budget for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Apply budget template to budget
     */
    async applyBudgetTemplate(budget, templateName) {
        const template = this.budgetTemplates.get(templateName);
        if (!template) {
            throw new Error(`Budget template '${templateName}' not found`);
        }

        // Apply template categories
        budget.categories = template.categories.map(category => ({
            id: uuidv4(),
            name: category.name,
            percentage: category.percentage,
            amount: budget.totalAmount * category.percentage,
            currencies: [...category.currencies],
            allocations: new Map(),
            spent: 0,
            remaining: budget.totalAmount * category.percentage,
            status: 'active'
        }));

        // Apply approval limits
        budget.approvalLimits = { ...template.approvalLimits };

        this.logger.info(`Applied template '${templateName}' to budget ${budget.id}`);
    }

    /**
     * Create budget categories with currency allocations
     */
    async createBudgetCategories(budget, categoriesData) {
        const categories = [];

        for (const categoryData of categoriesData) {
            const category = {
                id: uuidv4(),
                name: categoryData.name,
                description: categoryData.description || '',
                amount: categoryData.amount,
                percentage: categoryData.amount / budget.totalAmount,
                currencies: categoryData.currencies || [budget.baseCurrency],
                allocations: new Map(),
                spent: 0,
                remaining: categoryData.amount,
                status: 'active',
                limits: categoryData.limits || {},
                approvalRequired: categoryData.approvalRequired || false
            };

            // Calculate currency allocations for category
            if (categoryData.currencyAllocations) {
                category.allocations = await this.calculateCategoryAllocations(
                    category, 
                    categoryData.currencyAllocations,
                    budget.baseCurrency
                );
            } else {
                // Equal distribution across currencies
                const amountPerCurrency = category.amount / category.currencies.length;
                for (const currency of category.currencies) {
                    const convertedAmount = await this.convertAmount(
                        amountPerCurrency, 
                        budget.baseCurrency, 
                        currency
                    );
                    category.allocations.set(currency, {
                        amount: convertedAmount,
                        baseAmount: amountPerCurrency,
                        spent: 0,
                        remaining: convertedAmount,
                        rate: convertedAmount / amountPerCurrency
                    });
                }
            }

            categories.push(category);
        }

        return categories;
    }

    /**
     * Calculate currency allocations for a category
     */
    async calculateCategoryAllocations(category, allocationsData, baseCurrency) {
        const allocations = new Map();
        let totalPercentage = 0;

        // Validate allocation percentages
        for (const allocation of allocationsData) {
            totalPercentage += allocation.percentage;
        }

        if (Math.abs(totalPercentage - 1.0) > 0.01) {
            throw new Error(`Category allocation percentages must sum to 100%, got ${totalPercentage * 100}%`);
        }

        // Calculate allocations
        for (const allocation of allocationsData) {
            const baseAmount = category.amount * allocation.percentage;
            const convertedAmount = await this.convertAmount(
                baseAmount,
                baseCurrency,
                allocation.currency
            );

            allocations.set(allocation.currency, {
                amount: convertedAmount,
                baseAmount: baseAmount,
                percentage: allocation.percentage,
                spent: 0,
                remaining: convertedAmount,
                rate: convertedAmount / baseAmount,
                limits: allocation.limits || {}
            });
        }

        return allocations;
    }

    /**
     * Calculate overall currency allocations for budget
     */
    async calculateCurrencyAllocations(budget) {
        const allocations = new Map();

        // Aggregate allocations from all categories
        for (const category of budget.categories) {
            for (const [currency, allocation] of category.allocations) {
                if (allocations.has(currency)) {
                    const existing = allocations.get(currency);
                    existing.amount += allocation.amount;
                    existing.baseAmount += allocation.baseAmount;
                    existing.remaining += allocation.remaining;
                } else {
                    allocations.set(currency, {
                        amount: allocation.amount,
                        baseAmount: allocation.baseAmount,
                        spent: 0,
                        remaining: allocation.amount,
                        rate: allocation.rate,
                        categories: []
                    });
                }
                
                // Track which categories use this currency
                allocations.get(currency).categories.push({
                    categoryId: category.id,
                    categoryName: category.name,
                    amount: allocation.amount
                });
            }
        }

        return allocations;
    }

    /**
     * Setup budget approval workflow
     */
    async setupBudgetApproval(budget) {
        const approvalRequest = {
            id: uuidv4(),
            budgetId: budget.id,
            userId: budget.userId,
            type: 'budget_creation',
            amount: budget.totalAmount,
            currency: budget.baseCurrency,
            details: {
                budgetName: budget.name,
                period: budget.period,
                categories: budget.categories.length,
                currencies: Array.from(budget.allocations.keys())
            },
            status: 'pending',
            createdAt: new Date()
        };

        budget.approvals.set('creation', approvalRequest);
        budget.status = 'pending_approval';

        if (this.approvalService) {
            await this.approvalService.submitApprovalRequest(approvalRequest);
        }

        this.logger.info(`Budget approval request created: ${approvalRequest.id}`);
    }

    /**
     * Approve budget
     */
    async approveBudget(budgetId, approverId, comments = '') {
        const budget = this.activeBudgets.get(budgetId);
        if (!budget) {
            throw new Error(`Budget ${budgetId} not found`);
        }

        const approvalRequest = budget.approvals.get('creation');
        if (!approvalRequest) {
            throw new Error(`No pending approval found for budget ${budgetId}`);
        }

        approvalRequest.status = 'approved';
        approvalRequest.approverId = approverId;
        approvalRequest.approvedAt = new Date();
        approvalRequest.comments = comments;

        budget.status = 'active';
        budget.metadata.approvedAt = new Date();
        budget.metadata.approvedBy = approverId;

        this.logger.info(`Budget ${budgetId} approved by ${approverId}`);
        this.emit('budgetApproved', { budget, approverId });

        // Send notification
        if (this.notificationService) {
            await this.notificationService.sendNotification({
                userId: budget.userId,
                type: 'budget_approved',
                title: 'Budget Approved',
                message: `Your budget "${budget.name}" has been approved`,
                data: { budgetId, approverId }
            });
        }

        return budget;
    }

    /**
     * Reject budget
     */
    async rejectBudget(budgetId, approverId, reason) {
        const budget = this.activeBudgets.get(budgetId);
        if (!budget) {
            throw new Error(`Budget ${budgetId} not found`);
        }

        const approvalRequest = budget.approvals.get('creation');
        if (!approvalRequest) {
            throw new Error(`No pending approval found for budget ${budgetId}`);
        }

        approvalRequest.status = 'rejected';
        approvalRequest.approverId = approverId;
        approvalRequest.rejectedAt = new Date();
        approvalRequest.reason = reason;

        budget.status = 'rejected';

        this.logger.info(`Budget ${budgetId} rejected by ${approverId}: ${reason}`);
        this.emit('budgetRejected', { budget, approverId, reason });

        // Send notification
        if (this.notificationService) {
            await this.notificationService.sendNotification({
                userId: budget.userId,
                type: 'budget_rejected',
                title: 'Budget Rejected',
                message: `Your budget "${budget.name}" has been rejected: ${reason}`,
                data: { budgetId, approverId, reason }
            });
        }

        return budget;
    }

    /**
     * Update budget with FX rate changes
     */
    async updateBudgetWithFXChanges(budgetId, newRates) {
        const budget = this.activeBudgets.get(budgetId);
        if (!budget) {
            throw new Error(`Budget ${budgetId} not found`);
        }

        const oldAllocations = new Map(budget.allocations);
        
        // Recalculate allocations with new rates
        for (const category of budget.categories) {
            for (const [currency, allocation] of category.allocations) {
                if (newRates[`${budget.baseCurrency}/${currency}`]) {
                    const newRate = newRates[`${budget.baseCurrency}/${currency}`];
                    const newAmount = allocation.baseAmount * newRate;
                    
                    allocation.amount = newAmount;
                    allocation.remaining = newAmount - allocation.spent;
                    allocation.rate = newRate;
                }
            }
        }

        // Recalculate overall allocations
        budget.allocations = await this.calculateCurrencyAllocations(budget);
        budget.metadata.updatedAt = new Date();
        budget.metadata.lastFXUpdate = new Date();

        // Calculate FX impact
        const fxImpact = this.calculateFXImpact(oldAllocations, budget.allocations);
        
        this.logger.info(`Budget ${budgetId} updated with FX changes. Impact: ${fxImpact.totalImpact}`);
        this.emit('budgetFXUpdated', { budget, fxImpact });

        return { budget, fxImpact };
    }

    /**
     * Calculate FX impact on budget
     */
    calculateFXImpact(oldAllocations, newAllocations) {
        const impact = {
            totalImpact: 0,
            currencyImpacts: new Map(),
            percentageChange: 0
        };

        let totalOldValue = 0;
        let totalNewValue = 0;

        for (const [currency, newAllocation] of newAllocations) {
            const oldAllocation = oldAllocations.get(currency);
            if (oldAllocation) {
                const currencyImpact = newAllocation.baseAmount - oldAllocation.baseAmount;
                impact.currencyImpacts.set(currency, {
                    oldAmount: oldAllocation.baseAmount,
                    newAmount: newAllocation.baseAmount,
                    impact: currencyImpact,
                    percentageChange: (currencyImpact / oldAllocation.baseAmount) * 100
                });
                
                totalOldValue += oldAllocation.baseAmount;
                totalNewValue += newAllocation.baseAmount;
            }
        }

        impact.totalImpact = totalNewValue - totalOldValue;
        impact.percentageChange = totalOldValue > 0 ? (impact.totalImpact / totalOldValue) * 100 : 0;

        return impact;
    }

    /**
     * Get budget summary
     */
    async getBudgetSummary(budgetId) {
        const budget = this.activeBudgets.get(budgetId);
        if (!budget) {
            throw new Error(`Budget ${budgetId} not found`);
        }

        const summary = {
            id: budget.id,
            name: budget.name,
            status: budget.status,
            period: budget.period,
            baseCurrency: budget.baseCurrency,
            totalAmount: budget.totalAmount,
            totalSpent: 0,
            totalRemaining: 0,
            utilizationRate: 0,
            categories: [],
            currencies: [],
            fxImpact: 0,
            daysRemaining: Math.ceil((budget.endDate - new Date()) / (1000 * 60 * 60 * 24))
        };

        // Calculate category summaries
        for (const category of budget.categories) {
            const categorySpent = Array.from(category.allocations.values())
                .reduce((sum, alloc) => sum + alloc.spent, 0);
            
            summary.categories.push({
                id: category.id,
                name: category.name,
                amount: category.amount,
                spent: categorySpent,
                remaining: category.amount - categorySpent,
                utilizationRate: category.amount > 0 ? (categorySpent / category.amount) * 100 : 0,
                currencies: Array.from(category.allocations.keys())
            });

            summary.totalSpent += categorySpent;
        }

        summary.totalRemaining = summary.totalAmount - summary.totalSpent;
        summary.utilizationRate = summary.totalAmount > 0 ? (summary.totalSpent / summary.totalAmount) * 100 : 0;

        // Calculate currency summaries
        for (const [currency, allocation] of budget.allocations) {
            summary.currencies.push({
                currency,
                amount: allocation.amount,
                baseAmount: allocation.baseAmount,
                spent: allocation.spent,
                remaining: allocation.remaining,
                rate: allocation.rate,
                categories: allocation.categories.length
            });
        }

        return summary;
    }

    /**
     * Convert amount between currencies
     */
    async convertAmount(amount, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) {
            return amount;
        }

        if (this.currencyConverter) {
            return await this.currencyConverter.convert(amount, fromCurrency, toCurrency);
        }

        // Fallback to exchange rate service
        const rate = await this.exchangeRateService.getRate(fromCurrency, toCurrency);
        return amount * rate;
    }

    /**
     * Get all budgets for a user
     */
    getUserBudgets(userId) {
        return Array.from(this.activeBudgets.values())
            .filter(budget => budget.userId === userId);
    }

    /**
     * Get budget by ID
     */
    getBudget(budgetId) {
        return this.activeBudgets.get(budgetId);
    }

    /**
     * Delete budget
     */
    async deleteBudget(budgetId, userId) {
        const budget = this.activeBudgets.get(budgetId);
        if (!budget) {
            throw new Error(`Budget ${budgetId} not found`);
        }

        if (budget.userId !== userId) {
            throw new Error(`Unauthorized to delete budget ${budgetId}`);
        }

        if (budget.status === 'active' && budget.totalSpent > 0) {
            throw new Error(`Cannot delete active budget with expenses`);
        }

        this.activeBudgets.delete(budgetId);
        this.logger.info(`Budget ${budgetId} deleted by user ${userId}`);
        this.emit('budgetDeleted', { budgetId, userId });

        return true;
    }
}

module.exports = MultiCurrencyBudgetManager;