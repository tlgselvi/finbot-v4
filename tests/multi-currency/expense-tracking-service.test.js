/**
 * Multi-Currency Expense Tracking Service Tests
 */

const ExpenseTrackingService = require('../../src/multi-currency/budgeting/expense-tracking-service');

describe('ExpenseTrackingService', () => {
    let expenseService;
    let mockCurrencyManager;
    let mockOcrService;
    let mockLocationService;
    let mockConversionService;

    beforeEach(() => {
        mockCurrencyManager = {
            isValidCurrency: jest.fn().mockResolvedValue(true)
        };

        mockOcrService = {
            processReceipt: jest.fn().mockResolvedValue({
                text: 'STARBUCKS\n123 Main St\n$4.50\nCoffee\n01/15/2024',
                confidence: 0.95
            })
        };

        mockLocationService = {
            getCurrencyForLocation: jest.fn().mockResolvedValue({
                currency: 'USD',
                country: 'US'
            })
        };

        mockConversionService = {
            convertCurrency: jest.fn().mockResolvedValue({
                convertedAmount: 4.50,
                exchangeRate: 1.0,
                rateDate: new Date()
            })
        };

        expenseService = new ExpenseTrackingService({
            currencyManager: mockCurrencyManager,
            ocrService: mockOcrService,
            locationService: mockLocationService,
            conversionService: mockConversionService,
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
        });

        // Mock database operations
        expenseService.saveExpense = jest.fn().mockResolvedValue(true);
        expenseService.updateExpense = jest.fn().mockResolvedValue(true);
        expenseService.getUserProfile = jest.fn().mockResolvedValue({ baseCurrency: 'USD' });
        expenseService.validateAgainstBudget = jest.fn().mockResolvedValue({ withinBudget: true });
        expenseService.updateBudgetTracking = jest.fn().mockResolvedValue(true);
    });

    describe('createExpense', () => {
        test('should create expense with provided currency', async () => {
            const expenseData = {
                amount: 25.50,
                currency: 'EUR',
                description: 'Lunch at restaurant',
                category: 'food_dining',
                merchant: 'Restaurant ABC'
            };

            const expense = await expenseService.createExpense('user123', expenseData);

            expect(expense).toBeDefined();
            expect(expense.originalCurrency).toBe('EUR');
            expect(expense.amount).toBe(25.50);
            expect(expense.userId).toBe('user123');
            expect(expenseService.saveExpense).toHaveBeenCalledWith(expense);
        });

        test('should auto-detect currency when not provided', async () => {
            const expenseData = {
                amount: 4.50,
                description: 'Coffee at Starbucks',
                location: { lat: 40.7128, lng: -74.0060 }, // NYC coordinates
                merchant: 'Starbucks'
            };

            const expense = await expenseService.createExpense('user123', expenseData);

            expect(expense.originalCurrency).toBe('USD');
            expect(mockLocationService.getCurrencyForLocation).toHaveBeenCalled();
        });

        test('should convert to base currency', async () => {
            const expenseData = {
                amount: 20.00,
                currency: 'EUR',
                description: 'Dinner'
            };

            mockConversionService.convertCurrency.mockResolvedValue({
                convertedAmount: 22.00,
                exchangeRate: 1.1,
                rateDate: new Date()
            });

            const expense = await expenseService.createExpense('user123', expenseData);

            expect(expense.baseCurrencyAmount).toBe(22.00);
            expect(expense.exchangeRate).toBe(1.1);
            expect(mockConversionService.convertCurrency).toHaveBeenCalledWith({
                fromCurrency: 'EUR',
                toCurrency: 'USD',
                amount: 20.00,
                date: expense.date
            });
        });
    });

    describe('currency detection', () => {
        test('should detect currency from location', async () => {
            const location = { lat: 48.8566, lng: 2.3522 }; // Paris coordinates
            mockLocationService.getCurrencyForLocation.mockResolvedValue({
                currency: 'EUR',
                country: 'FR'
            });

            const currency = await expenseService.detectFromLocation(location);

            expect(currency).toBe('EUR');
            expect(mockLocationService.getCurrencyForLocation).toHaveBeenCalledWith(location);
        });

        test('should detect currency from merchant', async () => {
            expenseService.getMerchantData = jest.fn().mockResolvedValue({
                primaryCurrency: 'GBP'
            });

            const currency = await expenseService.detectFromMerchant('Tesco UK');

            expect(currency).toBe('GBP');
        });

        test('should detect currency from description symbols', async () => {
            const currency1 = await expenseService.detectFromDescription('Coffee €3.50');
            const currency2 = await expenseService.detectFromDescription('Lunch £12.00');
            const currency3 = await expenseService.detectFromDescription('Taxi ¥1500');

            expect(currency1).toBe('EUR');
            expect(currency2).toBe('GBP');
            expect(currency3).toBe('JPY');
        });

        test('should detect currency from description codes', async () => {
            const currency = await expenseService.detectFromDescription('Payment 100 CAD processed');

            expect(currency).toBe('CAD');
            expect(mockCurrencyManager.isValidCurrency).toHaveBeenCalledWith('CAD');
        });
    });

    describe('OCR processing', () => {
        test('should process receipt and extract data', async () => {
            const expense = {
                id: 'exp123',
                receiptUrl: 'https://example.com/receipt.jpg',
                originalCurrency: 'USD',
                amount: 4.50,
                merchant: 'Starbucks'
            };

            expenseService.getExpense = jest.fn().mockResolvedValue(expense);

            const result = await expenseService.processReceiptOCR(expense);

            expect(result.success).toBe(true);
            expect(result.extractedData).toBeDefined();
            expect(mockOcrService.processReceipt).toHaveBeenCalledWith(
                expense.receiptUrl,
                expect.objectContaining({
                    currency: 'USD',
                    enhanceFinancialData: true
                })
            );
        });

        test('should validate extracted data against expense', async () => {
            const expense = {
                amount: 4.50,
                merchant: 'Starbucks',
                date: new Date('2024-01-15')
            };

            const extractedData = {
                amount: 4.50,
                merchant: 'STARBUCKS',
                date: new Date('2024-01-15')
            };

            const validation = await expenseService.validateExtractedData(expense, extractedData);

            expect(validation.isValid).toBe(true);
            expect(validation.confidence).toBeGreaterThan(0.8);
            expect(validation.discrepancies).toHaveLength(0);
        });

        test('should detect discrepancies in extracted data', async () => {
            const expense = {
                amount: 4.50,
                merchant: 'Starbucks'
            };

            const extractedData = {
                amount: 5.50, // Different amount
                merchant: 'McDonald\'s' // Different merchant
            };

            const validation = await expenseService.validateExtractedData(expense, extractedData);

            expect(validation.isValid).toBe(false);
            expect(validation.discrepancies.length).toBeGreaterThan(0);
            expect(validation.confidence).toBeLessThan(0.8);
        });
    });

    describe('amount extraction', () => {
        test('should extract USD amounts', () => {
            const text = 'Total: $12.50\nTax: $1.25\nSubtotal: $11.25';
            const amounts = expenseService.extractAmounts(text, 'USD');

            expect(amounts).toEqual([12.50, 1.25, 11.25]);
        });

        test('should extract EUR amounts', () => {
            const text = 'Total: €15,50\nTax: €2,50';
            const amounts = expenseService.extractAmounts(text, 'EUR');

            expect(amounts).toEqual([15.50, 2.50]);
        });

        test('should extract JPY amounts', () => {
            const text = 'Total: ¥1,500\nTax: ¥150';
            const amounts = expenseService.extractAmounts(text, 'JPY');

            expect(amounts).toEqual([1500, 150]);
        });
    });

    describe('merchant name extraction', () => {
        test('should extract merchant name from receipt text', () => {
            const text = 'STARBUCKS COFFEE\n123 Main Street\nNew York, NY 10001\n(555) 123-4567';
            const merchant = expenseService.extractMerchantName(text);

            expect(merchant).toBe('STARBUCKS COFFEE');
        });

        test('should skip address and phone lines', () => {
            const text = '123 Main Street\nSTARBUCKS COFFEE\n(555) 123-4567';
            const merchant = expenseService.extractMerchantName(text);

            expect(merchant).toBe('STARBUCKS COFFEE');
        });
    });

    describe('date extraction', () => {
        test('should extract dates in various formats', () => {
            const formats = [
                '01/15/2024',
                '01-15-2024',
                '2024-01-15',
                '15.01.2024'
            ];

            formats.forEach(dateStr => {
                const date = expenseService.extractDate(`Receipt date: ${dateStr}`);
                expect(date).toBeInstanceOf(Date);
                expect(date.getFullYear()).toBe(2024);
                expect(date.getMonth()).toBe(0); // January (0-indexed)
            });
        });
    });

    describe('line items extraction', () => {
        test('should extract line items with descriptions and amounts', () => {
            const text = `
                STARBUCKS COFFEE
                Grande Latte        $4.50
                Blueberry Muffin    $2.95
                Tax                 $0.75
                Total               $8.20
            `;

            const items = expenseService.extractLineItems(text, 'USD');

            expect(items).toHaveLength(4);
            expect(items[0]).toEqual({
                description: 'Grande Latte',
                amount: 4.50
            });
            expect(items[1]).toEqual({
                description: 'Blueberry Muffin',
                amount: 2.95
            });
        });
    });

    describe('expense analytics', () => {
        test('should calculate comprehensive analytics', async () => {
            const mockExpenses = [
                {
                    amount: 10.00,
                    originalCurrency: 'USD',
                    baseCurrencyAmount: 10.00,
                    category: 'food_dining',
                    merchant: 'Starbucks',
                    paymentMethod: 'credit_card',
                    date: new Date('2024-01-15'),
                    ocrData: { confidence: 0.95 }
                },
                {
                    amount: 20.00,
                    originalCurrency: 'EUR',
                    baseCurrencyAmount: 22.00,
                    category: 'food_dining',
                    merchant: 'Restaurant ABC',
                    paymentMethod: 'cash',
                    date: new Date('2024-01-20'),
                    ocrData: { confidence: 0.88 }
                }
            ];

            expenseService.getExpenses = jest.fn().mockResolvedValue(mockExpenses);

            const analytics = await expenseService.getExpenseAnalytics('user123');

            expect(analytics.totalExpenses).toBe(2);
            expect(analytics.totalAmount.baseCurrency).toBe(32.00);
            expect(analytics.averageExpense).toBe(16.00);
            expect(analytics.categoryBreakdown.food_dining).toBe(32.00);
            expect(analytics.currencyBreakdown.USD.count).toBe(1);
            expect(analytics.currencyBreakdown.EUR.count).toBe(1);
            expect(analytics.ocrProcessingStats.processed).toBe(2);
            expect(analytics.ocrProcessingStats.successful).toBe(2);
            expect(analytics.ocrProcessingStats.averageConfidence).toBeCloseTo(0.915);
        });
    });

    describe('string similarity', () => {
        test('should calculate string similarity correctly', () => {
            const similarity1 = expenseService.calculateStringSimilarity('Starbucks', 'STARBUCKS');
            const similarity2 = expenseService.calculateStringSimilarity('Starbucks', 'McDonald\'s');
            const similarity3 = expenseService.calculateStringSimilarity('Starbucks Coffee', 'Starbucks');

            expect(similarity1).toBeGreaterThan(0.9);
            expect(similarity2).toBeLessThan(0.3);
            expect(similarity3).toBeGreaterThan(0.7);
        });
    });

    describe('helper functions', () => {
        test('should identify address patterns', () => {
            expect(expenseService.looksLikeAddress('123 Main Street')).toBe(true);
            expect(expenseService.looksLikeAddress('456 Oak Avenue')).toBe(true);
            expect(expenseService.looksLikeAddress('Starbucks Coffee')).toBe(false);
        });

        test('should identify phone patterns', () => {
            expect(expenseService.looksLikePhone('(555) 123-4567')).toBe(true);
            expect(expenseService.looksLikePhone('555-123-4567')).toBe(true);
            expect(expenseService.looksLikePhone('555.123.4567')).toBe(true);
            expect(expenseService.looksLikePhone('Starbucks Coffee')).toBe(false);
        });

        test('should get appropriate language for currency', () => {
            expect(expenseService.getCurrencyLanguage('EUR')).toBe('en,de,fr,es,it');
            expect(expenseService.getCurrencyLanguage('JPY')).toBe('ja,en');
            expect(expenseService.getCurrencyLanguage('USD')).toBe('en');
        });
    });

    describe('OCR queue processing', () => {
        test('should queue receipt for processing', async () => {
            const expense = {
                id: 'exp123',
                receiptUrl: 'https://example.com/receipt.jpg',
                originalCurrency: 'USD',
                amount: 100.00
            };

            await expenseService.queueReceiptProcessing(expense);

            expect(expenseService.ocrQueue).toHaveLength(1);
            expect(expenseService.ocrQueue[0].expenseId).toBe('exp123');
            expect(expenseService.ocrQueue[0].priority).toBe('high'); // Amount > 100
        });

        test('should prioritize high-value expenses in queue', async () => {
            const lowValueExpense = {
                id: 'exp1',
                receiptUrl: 'url1',
                originalCurrency: 'USD',
                amount: 10.00
            };

            const highValueExpense = {
                id: 'exp2',
                receiptUrl: 'url2',
                originalCurrency: 'USD',
                amount: 500.00
            };

            await expenseService.queueReceiptProcessing(lowValueExpense);
            await expenseService.queueReceiptProcessing(highValueExpense);

            // Sort queue by priority (this happens in processOCRQueue)
            expenseService.ocrQueue.sort((a, b) => {
                if (a.priority === 'high' && b.priority !== 'high') return -1;
                if (b.priority === 'high' && a.priority !== 'high') return 1;
                return a.queuedAt - b.queuedAt;
            });

            expect(expenseService.ocrQueue[0].expenseId).toBe('exp2'); // High priority first
            expect(expenseService.ocrQueue[1].expenseId).toBe('exp1');
        });
    });

    describe('error handling', () => {
        test('should handle OCR processing errors gracefully', async () => {
            const expense = {
                id: 'exp123',
                receiptUrl: 'https://example.com/invalid-receipt.jpg',
                originalCurrency: 'USD'
            };

            mockOcrService.processReceipt.mockRejectedValue(new Error('OCR service unavailable'));

            const result = await expenseService.processReceiptOCR(expense);

            expect(result.success).toBe(false);
            expect(result.error).toBe('OCR service unavailable');
            expect(expenseService.updateExpense).toHaveBeenCalledWith(
                expect.objectContaining({
                    ocrData: expect.objectContaining({
                        error: 'OCR service unavailable'
                    })
                })
            );
        });

        test('should handle currency detection failures', async () => {
            mockLocationService.getCurrencyForLocation.mockRejectedValue(new Error('Location service error'));

            const expenseData = {
                amount: 25.50,
                description: 'Lunch',
                location: { lat: 40.7128, lng: -74.0060 }
            };

            const expense = await expenseService.createExpense('user123', expenseData);

            // Should default to USD when detection fails
            expect(expense.originalCurrency).toBe('USD');
        });
    });
});