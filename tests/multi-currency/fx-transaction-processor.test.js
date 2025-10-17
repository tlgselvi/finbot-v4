/**
 * FX Transaction Processor Test Suite
 * Tests for FX-aware transaction processing with automatic conversions and P&L tracking
 */

const { describe, it, beforeEach, afterEach, expect, jest } = require('@jest/globals');
const FXTransactionProcessor = require('../../src/multi-currency/transactions/fx-transaction-processor');

describe('FX Transaction Processor', () => {
    let processor;
    let mockDependencies;

    beforeEach(() => {
        // Mock dependencies
        mockDependencies = {
            currencyManager: {
                getCurrency: jest.fn(),
                isCurrencySupported: jest.fn().mockReturnValue(true),
                validateCurrencyAmount: jest.fn().mockReturnValue(true)
            },
            accountManager: {
                getAccount: jest.fn(),
                getUserAccount: jest.fn(),
                createAccount: jest.fn(),
                debitAccount: jest.fn(),
                creditAccount: jest.fn()
            },
            conversionService: {
                convertAmount: jest.fn(),
                getConversionRate: jest.fn()
            },
            rateEngine: {
                getRate: jest.fn()
            },
            database: {
                beginTransaction: jest.fn(),
                commitTransaction: jest.fn(),
                rollbackTransaction: jest.fn()
            }
        };

        processor = new FXTransactionProcessor({
            defaultBaseCurrency: 'USD',
            autoConversion: true,
            feeCalculation: true,
            pnlTracking: true,
            maxTransactionAmount: 1000000,
            minTransactionAmount: 0.01
        });

        processor.initialize(mockDependencies);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Transaction Validation', () => {
        it('should validate transaction request successfully', async () => {
            const request = {
                type: 'conversion',
                userId: 'user1',
                amount: 100,
                currency: 'USD',
                fromCurrency: 'USD',
                toCurrency: 'EUR'
            };

            const validation = await processor.validateTransactionRequest(request);

            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);
        });

        it('should reject invalid transaction type', async () => {
            const request = {
                type: 'invalid_type',
                userId: 'user1',
                amount: 100,
                currency: 'USD'
            };

            const validation = await processor.validateTransactionRequest(request);

            expect(validation.isValid).toBe(false);
            expect(validation.errors).toContain('Invalid or unsupported transaction type');
        });

        it('should reject missing required fields', async () => {
            const request = {
                type: 'conversion',
                // Missing userId, amount, currency
            };

            const validation = await processor.validateTransactionRequest(request);

            expect(validation.isValid).toBe(false);
            expect(validation.errors).toContain('User ID is required');
            expect(validation.errors).toContain('Invalid transaction amount');
            expect(validation.errors).toContain('Currency is required');
        });

        it('should reject amounts outside limits', async () => {
            const tooSmallRequest = {
                type: 'conversion',
                userId: 'user1',
                amount: 0.001,
                currency: 'USD'
            };

            const tooLargeRequest = {
                type: 'conversion',
                userId: 'user1',
                amount: 2000000,
                currency: 'USD'
            };

            const smallValidation = await processor.validateTransactionRequest(tooSmallRequest);
            const largeValidation = await processor.validateTransactionRequest(tooLargeRequest);

            expect(smallValidation.isValid).toBe(false);
            expect(smallValidation.errors).toContain('Amount below minimum: 0.01');

            expect(largeValidation.isValid).toBe(false);
            expect(largeValidation.errors).toContain('Amount exceeds maximum: 1000000');
        });

        it('should validate transfer-specific requirements', async () => {
            const invalidTransfer = {
                type: 'transfer',
                userId: 'user1',
                amount: 100,
                currency: 'USD',
                fromAccountId: 'account1',
                toAccountId: 'account1' // Same account
            };

            const validation = await processor.validateTransactionRequest(invalidTransfer);

            expect(validation.isValid).toBe(false);
            expect(validation.errors).toContain('Cannot transfer to the same account');
        });

        it('should validate conversion-specific requirements', async () => {
            const invalidConversion = {
                type: 'conversion',
                userId: 'user1',
                amount: 100,
                currency: 'USD',
                fromCurrency: 'USD',
                toCurrency: 'USD' // Same currency
            };

            const validation = await processor.validateTransactionRequest(invalidConversion);

            expect(validation.isValid).toBe(false);
            expect(validation.errors).toContain('Cannot convert to the same currency');
        });
    });

    describe('Currency Conversion Processing', () => {
        beforeEach(() => {
            // Mock successful rate lookup
            mockDependencies.rateEngine.getRate.mockResolvedValue({
                rate: 0.85,
                pair: 'USD/EUR',
                timestamp: new Date(),
                qualityScore: 95
            });

            // Mock user accounts
            mockDependencies.accountManager.getUserAccount
                .mockResolvedValueOnce({
                    id: 'usd-account',
                    userId: 'user1',
                    currency: 'USD',
                    balance: 1000,
                    availableBalance: 1000,
                    isActive: true
                })
                .mockResolvedValueOnce({
                    id: 'eur-account',
                    userId: 'user1',
                    currency: 'EUR',
                    balance: 500,
                    availableBalance: 500,
                    isActive: true
                });

            // Mock account operations
            mockDependencies.accountManager.debitAccount.mockResolvedValue({
                id: 'debit1',
                accountId: 'usd-account',
                amount: 102.5, // 100 + 2.5 fee
                type: 'debit'
            });

            mockDependencies.accountManager.creditAccount.mockResolvedValue({
                id: 'credit1',
                accountId: 'eur-account',
                amount: 85,
                type: 'credit'
            });

            // Mock database operations
            mockDependencies.database.beginTransaction.mockResolvedValue();
            mockDependencies.database.commitTransaction.mockResolvedValue();
        });

        it('should process currency conversion successfully', async () => {
            const request = {
                type: 'conversion',
                userId: 'user1',
                amount: 100,
                fromCurrency: 'USD',
                toCurrency: 'EUR'
            };

            const result = await processor.processTransaction(request);

            expect(result.status).toBe('completed');
            expect(result.transactionId).toBeDefined();
            expect(mockDependencies.rateEngine.getRate).toHaveBeenCalledWith('USD', 'EUR');
            expect(mockDependencies.accountManager.debitAccount).toHaveBeenCalled();
            expect(mockDependencies.accountManager.creditAccount).toHaveBeenCalled();
            expect(mockDependencies.database.commitTransaction).toHaveBeenCalled();
        });

        it('should create target account if it does not exist', async () => {
            // Mock: EUR account doesn't exist
            mockDependencies.accountManager.getUserAccount
                .mockResolvedValueOnce({
                    id: 'usd-account',
                    userId: 'user1',
                    currency: 'USD',
                    balance: 1000,
                    availableBalance: 1000,
                    isActive: true
                })
                .mockResolvedValueOnce(null); // No EUR account

            mockDependencies.accountManager.createAccount.mockResolvedValue({
                id: 'new-eur-account',
                userId: 'user1',
                currency: 'EUR',
                balance: 0,
                availableBalance: 0,
                isActive: true
            });

            const request = {
                type: 'conversion',
                userId: 'user1',
                amount: 100,
                fromCurrency: 'USD',
                toCurrency: 'EUR'
            };

            const result = await processor.processTransaction(request);

            expect(result.status).toBe('completed');
            expect(mockDependencies.accountManager.createAccount).toHaveBeenCalledWith({
                userId: 'user1',
                currency: 'EUR',
                accountType: 'currency',
                isActive: true
            });
        });

        it('should handle insufficient balance', async () => {
            mockDependencies.accountManager.getUserAccount.mockResolvedValueOnce({
                id: 'usd-account',
                userId: 'user1',
                currency: 'USD',
                balance: 50,
                availableBalance: 50, // Less than required (100 + fees)
                isActive: true
            });

            const request = {
                type: 'conversion',
                userId: 'user1',
                amount: 100,
                fromCurrency: 'USD',
                toCurrency: 'EUR'
            };

            await expect(processor.processTransaction(request)).rejects.toThrow('Insufficient balance');
        });

        it('should handle rate unavailable', async () => {
            mockDependencies.rateEngine.getRate.mockResolvedValue(null);

            const request = {
                type: 'conversion',
                userId: 'user1',
                amount: 100,
                fromCurrency: 'USD',
                toCurrency: 'EUR'
            };

            await expect(processor.processTransaction(request)).rejects.toThrow('Exchange rate not available');
        });

        it('should calculate fees correctly', async () => {
            const request = {
                type: 'conversion',
                userId: 'user1',
                amount: 1000,
                fromCurrency: 'USD',
                toCurrency: 'EUR'
            };

            await processor.processTransaction(request);

            // Verify debit includes fee (0.2% of 1000 = 2)
            expect(mockDependencies.accountManager.debitAccount).toHaveBeenCalledWith(
                'usd-account',
                1002, // 1000 + 2 fee
                expect.any(Object)
            );
        });
    });

    describe('Transfer Processing', () => {
        beforeEach(() => {
            mockDependencies.accountManager.getAccount
                .mockResolvedValueOnce({
                    id: 'account1',
                    userId: 'user1',
                    currency: 'USD',
                    balance: 1000,
                    availableBalance: 1000,
                    isActive: true
                })
                .mockResolvedValueOnce({
                    id: 'account2',
                    userId: 'user2',
                    currency: 'USD',
                    balance: 500,
                    availableBalance: 500,
                    isActive: true
                });

            mockDependencies.accountManager.debitAccount.mockResolvedValue({
                id: 'debit1',
                accountId: 'account1',
                amount: 100,
                type: 'debit'
            });

            mockDependencies.accountManager.creditAccount.mockResolvedValue({
                id: 'credit1',
                accountId: 'account2',
                amount: 100,
                type: 'credit'
            });

            mockDependencies.database.beginTransaction.mockResolvedValue();
            mockDependencies.database.commitTransaction.mockResolvedValue();
        });

        it('should process same-currency transfer successfully', async () => {
            const request = {
                type: 'transfer',
                userId: 'user1',
                fromAccountId: 'account1',
                toAccountId: 'account2',
                amount: 100,
                currency: 'USD'
            };

            const result = await processor.processTransaction(request);

            expect(result.status).toBe('completed');
            expect(mockDependencies.accountManager.debitAccount).toHaveBeenCalledWith(
                'account1',
                100, // No conversion fee for same currency
                expect.any(Object)
            );
            expect(mockDependencies.accountManager.creditAccount).toHaveBeenCalledWith(
                'account2',
                100,
                expect.any(Object)
            );
        });

        it('should process cross-currency transfer with conversion', async () => {
            // Mock accounts with different currencies
            mockDependencies.accountManager.getAccount
                .mockResolvedValueOnce({
                    id: 'account1',
                    userId: 'user1',
                    currency: 'USD',
                    balance: 1000,
                    availableBalance: 1000,
                    isActive: true
                })
                .mockResolvedValueOnce({
                    id: 'account2',
                    userId: 'user2',
                    currency: 'EUR',
                    balance: 500,
                    availableBalance: 500,
                    isActive: true
                });

            mockDependencies.rateEngine.getRate.mockResolvedValue({
                rate: 0.85,
                pair: 'USD/EUR',
                timestamp: new Date()
            });

            const request = {
                type: 'transfer',
                userId: 'user1',
                fromAccountId: 'account1',
                toAccountId: 'account2',
                amount: 100,
                currency: 'USD'
            };

            const result = await processor.processTransaction(request);

            expect(result.status).toBe('completed');
            expect(mockDependencies.rateEngine.getRate).toHaveBeenCalledWith('USD', 'EUR');
        });

        it('should handle account not found', async () => {
            mockDependencies.accountManager.getAccount
                .mockResolvedValueOnce(null) // Account not found
                .mockResolvedValueOnce({
                    id: 'account2',
                    userId: 'user2',
                    currency: 'USD',
                    balance: 500,
                    availableBalance: 500,
                    isActive: true
                });

            const request = {
                type: 'transfer',
                userId: 'user1',
                fromAccountId: 'account1',
                toAccountId: 'account2',
                amount: 100,
                currency: 'USD'
            };

            await expect(processor.processTransaction(request)).rejects.toThrow('One or both accounts not found');
        });
    });

    describe('Payment Processing', () => {
        beforeEach(() => {
            mockDependencies.accountManager.getUserAccount
                .mockResolvedValueOnce({
                    id: 'payer-account',
                    userId: 'user1',
                    currency: 'USD',
                    balance: 1000,
                    availableBalance: 1000,
                    isActive: true
                })
                .mockResolvedValueOnce({
                    id: 'payee-account',
                    userId: 'user2',
                    currency: 'USD',
                    balance: 100,
                    availableBalance: 100,
                    isActive: true
                });

            mockDependencies.accountManager.debitAccount.mockResolvedValue({
                id: 'debit1',
                accountId: 'payer-account',
                amount: 50.6, // 50 + 0.6 fee
                type: 'debit'
            });

            mockDependencies.accountManager.creditAccount.mockResolvedValue({
                id: 'credit1',
                accountId: 'payee-account',
                amount: 50,
                type: 'credit'
            });

            mockDependencies.database.beginTransaction.mockResolvedValue();
            mockDependencies.database.commitTransaction.mockResolvedValue();
        });

        it('should process payment successfully', async () => {
            const request = {
                type: 'payment',
                userId: 'user1',
                payeeId: 'user2',
                amount: 50,
                currency: 'USD'
            };

            const result = await processor.processTransaction(request);

            expect(result.status).toBe('completed');
            expect(mockDependencies.accountManager.getUserAccount).toHaveBeenCalledWith('user1', 'USD');
            expect(mockDependencies.accountManager.getUserAccount).toHaveBeenCalledWith('user2', 'USD');
            expect(mockDependencies.accountManager.debitAccount).toHaveBeenCalled();
            expect(mockDependencies.accountManager.creditAccount).toHaveBeenCalled();
        });

        it('should create payee account if it does not exist', async () => {
            mockDependencies.accountManager.getUserAccount
                .mockResolvedValueOnce({
                    id: 'payer-account',
                    userId: 'user1',
                    currency: 'USD',
                    balance: 1000,
                    availableBalance: 1000,
                    isActive: true
                })
                .mockResolvedValueOnce(null); // Payee account doesn't exist

            mockDependencies.accountManager.createAccount.mockResolvedValue({
                id: 'new-payee-account',
                userId: 'user2',
                currency: 'USD',
                balance: 0,
                availableBalance: 0,
                isActive: true
            });

            const request = {
                type: 'payment',
                userId: 'user1',
                payeeId: 'user2',
                amount: 50,
                currency: 'USD'
            };

            const result = await processor.processTransaction(request);

            expect(result.status).toBe('completed');
            expect(mockDependencies.accountManager.createAccount).toHaveBeenCalledWith({
                userId: 'user2',
                currency: 'USD',
                accountType: 'currency',
                isActive: true
            });
        });

        it('should calculate payment fees correctly', async () => {
            const request = {
                type: 'payment',
                userId: 'user1',
                payeeId: 'user2',
                amount: 1000,
                currency: 'USD'
            };

            await processor.processTransaction(request);

            // Payment fee = 0.50 + (1000 * 0.001) = 1.50
            expect(mockDependencies.accountManager.debitAccount).toHaveBeenCalledWith(
                'payer-account',
                1001.5, // 1000 + 1.5 fee
                expect.any(Object)
            );
        });
    });

    describe('Deposit and Withdrawal Processing', () => {
        beforeEach(() => {
            mockDependencies.accountManager.getUserAccount.mockResolvedValue({
                id: 'user-account',
                userId: 'user1',
                currency: 'USD',
                balance: 1000,
                availableBalance: 1000,
                isActive: true
            });

            mockDependencies.accountManager.creditAccount.mockResolvedValue({
                id: 'credit1',
                accountId: 'user-account',
                amount: 200,
                type: 'credit'
            });

            mockDependencies.accountManager.debitAccount.mockResolvedValue({
                id: 'debit1',
                accountId: 'user-account',
                amount: 105, // 100 + 5 fee
                type: 'debit'
            });

            mockDependencies.database.beginTransaction.mockResolvedValue();
            mockDependencies.database.commitTransaction.mockResolvedValue();
        });

        it('should process deposit successfully', async () => {
            const request = {
                type: 'deposit',
                userId: 'user1',
                amount: 200,
                currency: 'USD'
            };

            const result = await processor.processTransaction(request);

            expect(result.status).toBe('completed');
            expect(mockDependencies.accountManager.creditAccount).toHaveBeenCalledWith(
                'user-account',
                200,
                expect.any(Object)
            );
        });

        it('should create account for deposit if it does not exist', async () => {
            mockDependencies.accountManager.getUserAccount.mockResolvedValue(null);
            mockDependencies.accountManager.createAccount.mockResolvedValue({
                id: 'new-account',
                userId: 'user1',
                currency: 'USD',
                balance: 0,
                availableBalance: 0,
                isActive: true
            });

            const request = {
                type: 'deposit',
                userId: 'user1',
                amount: 200,
                currency: 'USD'
            };

            const result = await processor.processTransaction(request);

            expect(result.status).toBe('completed');
            expect(mockDependencies.accountManager.createAccount).toHaveBeenCalled();
        });

        it('should process withdrawal successfully', async () => {
            const request = {
                type: 'withdrawal',
                userId: 'user1',
                amount: 100,
                currency: 'USD'
            };

            const result = await processor.processTransaction(request);

            expect(result.status).toBe('completed');
            expect(mockDependencies.accountManager.debitAccount).toHaveBeenCalled();
        });

        it('should calculate withdrawal fees correctly', async () => {
            const request = {
                type: 'withdrawal',
                userId: 'user1',
                amount: 500,
                currency: 'USD'
            };

            await processor.processTransaction(request);

            // Withdrawal fee = 2.00 + (500 * 0.005) = 4.50
            expect(mockDependencies.accountManager.debitAccount).toHaveBeenCalledWith(
                'user-account',
                504.5, // 500 + 4.5 fee
                expect.any(Object)
            );
        });
    });

    describe('Trading Processing', () => {
        beforeEach(() => {
            mockDependencies.rateEngine.getRate.mockResolvedValue({
                rate: 0.85,
                pair: 'USD/EUR',
                timestamp: new Date(),
                qualityScore: 95
            });

            mockDependencies.accountManager.getUserAccount
                .mockResolvedValueOnce({
                    id: 'usd-account',
                    userId: 'user1',
                    currency: 'USD',
                    balance: 2000,
                    availableBalance: 2000,
                    isActive: true
                })
                .mockResolvedValueOnce({
                    id: 'eur-account',
                    userId: 'user1',
                    currency: 'EUR',
                    balance: 500,
                    availableBalance: 500,
                    isActive: true
                });

            mockDependencies.accountManager.debitAccount.mockResolvedValue({
                id: 'debit1',
                accountId: 'usd-account',
                amount: 1005, // 1000 + 5 trading fee
                type: 'debit'
            });

            mockDependencies.accountManager.creditAccount.mockResolvedValue({
                id: 'credit1',
                accountId: 'eur-account',
                amount: 850,
                type: 'credit'
            });

            mockDependencies.database.beginTransaction.mockResolvedValue();
            mockDependencies.database.commitTransaction.mockResolvedValue();
        });

        it('should process FX trade successfully', async () => {
            const request = {
                type: 'trade',
                userId: 'user1',
                fromCurrency: 'USD',
                toCurrency: 'EUR',
                amount: 1000
            };

            const result = await processor.processTransaction(request);

            expect(result.status).toBe('completed');
            expect(mockDependencies.rateEngine.getRate).toHaveBeenCalledWith('USD', 'EUR');
            expect(mockDependencies.accountManager.debitAccount).toHaveBeenCalled();
            expect(mockDependencies.accountManager.creditAccount).toHaveBeenCalled();
        });

        it('should create trading account if needed', async () => {
            mockDependencies.accountManager.getUserAccount
                .mockResolvedValueOnce({
                    id: 'usd-account',
                    userId: 'user1',
                    currency: 'USD',
                    balance: 2000,
                    availableBalance: 2000,
                    isActive: true
                })
                .mockResolvedValueOnce(null); // No EUR trading account

            mockDependencies.accountManager.createAccount.mockResolvedValue({
                id: 'new-eur-account',
                userId: 'user1',
                currency: 'EUR',
                balance: 0,
                availableBalance: 0,
                isActive: true
            });

            const request = {
                type: 'trade',
                userId: 'user1',
                fromCurrency: 'USD',
                toCurrency: 'EUR',
                amount: 1000
            };

            const result = await processor.processTransaction(request);

            expect(result.status).toBe('completed');
            expect(mockDependencies.accountManager.createAccount).toHaveBeenCalledWith({
                userId: 'user1',
                currency: 'EUR',
                accountType: 'trading',
                isActive: true
            });
        });

        it('should calculate trading fees correctly', async () => {
            const request = {
                type: 'trade',
                userId: 'user1',
                fromCurrency: 'USD',
                toCurrency: 'EUR',
                amount: 2000
            };

            await processor.processTransaction(request);

            // Trading fee = 2000 * 0.005 = 10
            expect(mockDependencies.accountManager.debitAccount).toHaveBeenCalledWith(
                'usd-account',
                2010, // 2000 + 10 fee
                expect.any(Object)
            );
        });
    });

    describe('Error Handling and Rollback', () => {
        it('should rollback transaction on database error', async () => {
            mockDependencies.accountManager.getUserAccount.mockResolvedValue({
                id: 'account1',
                userId: 'user1',
                currency: 'USD',
                balance: 1000,
                availableBalance: 1000,
                isActive: true
            });

            mockDependencies.database.beginTransaction.mockResolvedValue();
            mockDependencies.accountManager.debitAccount.mockRejectedValue(new Error('Database error'));
            mockDependencies.database.rollbackTransaction.mockResolvedValue();

            const request = {
                type: 'deposit',
                userId: 'user1',
                amount: 100,
                currency: 'USD'
            };

            await expect(processor.processTransaction(request)).rejects.toThrow('Database error');
            expect(mockDependencies.database.rollbackTransaction).toHaveBeenCalled();
        });

        it('should handle validation errors gracefully', async () => {
            const request = {
                type: 'invalid_type',
                userId: 'user1',
                amount: 100,
                currency: 'USD'
            };

            await expect(processor.processTransaction(request)).rejects.toThrow('Transaction validation failed');
        });

        it('should update statistics on failure', async () => {
            const initialStats = processor.getTransactionStatistics();

            const request = {
                type: 'invalid_type',
                userId: 'user1',
                amount: 100,
                currency: 'USD'
            };

            try {
                await processor.processTransaction(request);
            } catch (error) {
                // Expected to fail
            }

            const updatedStats = processor.getTransactionStatistics();
            expect(updatedStats.failedTransactions).toBe(initialStats.failedTransactions + 1);
        });
    });

    describe('P&L Calculation', () => {
        beforeEach(() => {
            mockDependencies.rateEngine.getRate.mockResolvedValue({
                rate: 0.90, // Current rate different from execution rate
                pair: 'USD/EUR',
                timestamp: new Date(),
                qualityScore: 95
            });
        });

        it('should calculate P&L for FX transaction', async () => {
            const transaction = {
                id: 'tx1',
                type: 'conversion',
                fromCurrency: 'USD',
                toCurrency: 'EUR',
                amount: 1000,
                exchangeRate: 0.85, // Execution rate
                convertedAmount: 850
            };

            const pnl = await processor.calculateTransactionPnL(transaction);

            expect(pnl.realized).toBe(0); // No realized P&L until position closed
            expect(pnl.unrealized).toBeCloseTo(50, 1); // (0.90 - 0.85) / 0.85 * 850
            expect(pnl.executionRate).toBe(0.85);
            expect(pnl.currentRate).toBe(0.90);
        });

        it('should return zero P&L for non-FX transactions', async () => {
            const transaction = {
                id: 'tx1',
                type: 'deposit',
                amount: 1000,
                currency: 'USD'
            };

            const pnl = await processor.calculateTransactionPnL(transaction);

            expect(pnl.realized).toBe(0);
            expect(pnl.unrealized).toBe(0);
        });

        it('should handle missing current rate', async () => {
            mockDependencies.rateEngine.getRate.mockResolvedValue(null);

            const transaction = {
                id: 'tx1',
                type: 'conversion',
                fromCurrency: 'USD',
                toCurrency: 'EUR',
                amount: 1000,
                exchangeRate: 0.85
            };

            const pnl = await processor.calculateTransactionPnL(transaction);

            expect(pnl.realized).toBe(0);
            expect(pnl.unrealized).toBe(0);
        });
    });

    describe('Statistics and Monitoring', () => {
        it('should track transaction statistics', async () => {
            const initialStats = processor.getTransactionStatistics();

            // Mock successful transaction
            mockDependencies.accountManager.getUserAccount.mockResolvedValue({
                id: 'account1',
                userId: 'user1',
                currency: 'USD',
                balance: 1000,
                availableBalance: 1000,
                isActive: true
            });

            mockDependencies.accountManager.creditAccount.mockResolvedValue({
                id: 'credit1',
                accountId: 'account1',
                amount: 100,
                type: 'credit'
            });

            mockDependencies.database.beginTransaction.mockResolvedValue();
            mockDependencies.database.commitTransaction.mockResolvedValue();

            const request = {
                type: 'deposit',
                userId: 'user1',
                amount: 100,
                currency: 'USD'
            };

            await processor.processTransaction(request);

            const updatedStats = processor.getTransactionStatistics();
            expect(updatedStats.totalTransactions).toBe(initialStats.totalTransactions + 1);
            expect(updatedStats.successfulTransactions).toBe(initialStats.successfulTransactions + 1);
            expect(updatedStats.totalVolume.get('USD')).toBe((initialStats.totalVolume.get('USD') || 0) + 100);
        });

        it('should calculate success rate correctly', () => {
            processor.stats.totalTransactions = 10;
            processor.stats.successfulTransactions = 8;
            processor.stats.failedTransactions = 2;

            const stats = processor.getTransactionStatistics();
            expect(stats.successRate).toBe(80);
        });
    });

    describe('Health Check', () => {
        it('should return healthy status when all dependencies are available', async () => {
            const health = await processor.healthCheck();

            expect(health.status).toBe('healthy');
            expect(health.dependencies.currencyManager).toBe('connected');
            expect(health.dependencies.accountManager).toBe('connected');
            expect(health.dependencies.rateEngine).toBe('connected');
            expect(health.dependencies.database).toBe('connected');
        });

        it('should return degraded status when dependencies are missing', async () => {
            processor.currencyManager = null;

            const health = await processor.healthCheck();

            expect(health.status).toBe('degraded');
            expect(health.dependencies.currencyManager).toBe('missing');
            expect(health.errors).toContain('Currency manager not initialized');
        });
    });

    describe('Transaction Retrieval', () => {
        it('should get pending transaction', async () => {
            // Add a pending transaction
            const transactionId = 'pending-tx-1';
            const pendingTransaction = {
                id: transactionId,
                status: 'pending',
                userId: 'user1',
                amount: 100,
                currency: 'USD'
            };

            processor.pendingTransactions.set(transactionId, pendingTransaction);

            const retrieved = await processor.getTransaction(transactionId);
            expect(retrieved).toEqual(pendingTransaction);
        });

        it('should return null for non-existent transaction', async () => {
            const retrieved = await processor.getTransaction('non-existent');
            expect(retrieved).toBeNull();
        });
    });
});