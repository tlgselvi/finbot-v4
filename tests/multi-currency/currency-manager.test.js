/**
 * Currency Manager Service Test Suite
 * Comprehensive tests for currency operations, transaction processing, and multi-currency workflows
 */

const { describe, it, beforeEach, afterEach, expect, jest } = require('@jest/globals');
const CurrencyManager = require('../../src/multi-currency/core/currency-manager');
const FXTransactionProcessor = require('../../src/multi-currency/transactions/fx-transaction-processor');
const TransactionHistoryService = require('../../src/multi-currency/transactions/transaction-history-service');

// Mock dependencies
const mockAccountManager = {
  getAccount: jest.fn(),
  getUserAccount: jest.fn(),
  getUserAccounts: jest.fn(),
  createAccount: jest.fn(),
  debitAccount: jest.fn(),
  creditAccount: jest.fn()
};

const mockConversionService = {
  convertAmount: jest.fn(),
  getConversionRate: jest.fn()
};

const mockRateEngine = {
  getRate: jest.fn(),
  getLatestRates: jest.fn()
};

const mockDatabase = {
  beginTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  query: jest.fn()
};

describe('Currency Manager Service', () => {
  let currencyManager;

  beforeEach(() => {
    currencyManager = new CurrencyManager({
      baseCurrency: 'USD',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'JPY', 'CAD'],
      enableRegionalRestrictions: false
    });

    // Initialize transaction processing
    currencyManager.initializeTransactionProcessing({
      accountManager: mockAccountManager,
      conversionService: mockConversionService,
      rateEngine: mockRateEngine,
      database: mockDatabase
    });

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await currencyManager.cleanup();
  });

  describe('Currency Configuration', () => {
    describe('Currency Definitions', () => {
      it('should return currency definition for supported currency', () => {
        const usdDefinition = currencyManager.getCurrencyDefinition('USD');
        
        expect(usdDefinition).toBeDefined();
        expect(usdDefinition.code).toBe('USD');
        expect(usdDefinition.name).toBe('US Dollar');
        expect(usdDefinition.symbol).toBe('$');
        expect(usdDefinition.decimalPlaces).toBe(2);
        expect(usdDefinition.isActive).toBe(true);
      });

      it('should throw error for unsupported currency', () => {
        expect(() => {
          currencyManager.getCurrencyDefinition('XYZ');
        }).toThrow('Currency not supported: XYZ');
      });

      it('should return all active currencies', () => {
        const currencies = currencyManager.getAllCurrencies();
        
        expect(currencies).toHaveLength(5);
        expect(currencies.every(c => c.isActive)).toBe(true);
        expect(currencies.map(c => c.code)).toEqual(
          expect.arrayContaining(['USD', 'EUR', 'GBP', 'JPY', 'CAD'])
        );
      });

      it('should check currency support correctly', () => {
        expect(currencyManager.isCurrencySupported('USD')).toBe(true);
        expect(currencyManager.isCurrencySupported('eur')).toBe(true); // Case insensitive
        expect(currencyManager.isCurrencySupported('XYZ')).toBe(false);
      });
    });

    describe('Currency Management', () => {
      it('should add new currency successfully', () => {
        const newCurrency = {
          code: 'AUD',
          name: 'Australian Dollar',
          symbol: 'A$',
          decimalPlaces: 2,
          numericCode: 36,
          minorUnit: 'cent',
          countries: ['AU'],
          tradingHours: { start: '00:00', end: '23:59', timezone: 'UTC' },
          category: 'major'
        };

        const result = currencyManager.addCurrency(newCurrency);
        
        expect(result).toBe(true);
        expect(currencyManager.isCurrencySupported('AUD')).toBe(true);
        expect(currencyManager.getSupportedCurrencies()).toContain('AUD');
      });

      it('should not add duplicate currency', () => {
        const duplicateCurrency = {
          code: 'USD',
          name: 'US Dollar Duplicate',
          symbol: '$',
          decimalPlaces: 2,
          numericCode: 840
        };

        expect(() => {
          currencyManager.addCurrency(duplicateCurrency);
        }).toThrow('Currency USD already exists');
      });

      it('should validate currency definition', () => {
        const invalidCurrency = {
          code: 'INVALID', // Too long
          name: 'Invalid Currency'
        };

        expect(() => {
          currencyManager.addCurrency(invalidCurrency);
        }).toThrow('Currency code must be 3 characters');
      });

      it('should deactivate currency successfully', () => {
        const result = currencyManager.deactivateCurrency('EUR');
        
        expect(result).toBe(true);
        expect(currencyManager.isCurrencySupported('EUR')).toBe(false);
      });

      it('should not deactivate base currency', () => {
        expect(() => {
          currencyManager.deactivateCurrency('USD');
        }).toThrow('Cannot deactivate base currency');
      });

      it('should reactivate currency successfully', () => {
        currencyManager.deactivateCurrency('EUR');
        const result = currencyManager.activateCurrency('EUR');
        
        expect(result).toBe(true);
        expect(currencyManager.isCurrencySupported('EUR')).toBe(true);
      });
    });

    describe('Currency Pairs', () => {
      it('should return currency pair information', () => {
        const pair = currencyManager.getCurrencyPair('USD', 'EUR');
        
        expect(pair).toBeDefined();
        expect(pair.base).toBe('USD');
        expect(pair.quote).toBe('EUR');
        expect(pair.symbol).toBe('USD/EUR');
        expect(pair.isActive).toBe(true);
        expect(pair.minTradeAmount).toBeGreaterThan(0);
        expect(pair.maxTradeAmount).toBeGreaterThan(pair.minTradeAmount);
      });

      it('should return all active currency pairs', () => {
        const pairs = currencyManager.getAllCurrencyPairs();
        
        expect(pairs.length).toBeGreaterThan(0);
        expect(pairs.every(p => p.isActive)).toBe(true);
        
        // Should have pairs for all combinations
        const expectedPairs = 5 * 4; // 5 currencies, 4 pairs each (excluding self)
        expect(pairs.length).toBe(expectedPairs);
      });

      it('should calculate correct trading parameters', () => {
        const majorPair = currencyManager.getCurrencyPair('USD', 'EUR');
        const jpyPair = currencyManager.getCurrencyPair('USD', 'JPY');
        
        // Major pairs should have smaller tick size
        expect(majorPair.tickSize).toBe(0.0001);
        
        // JPY pairs should have different tick size
        expect(jpyPair.tickSize).toBe(0.01);
        
        // Settlement days should be standard T+2
        expect(majorPair.settlementDays).toBe(2);
      });
    });
  });

  describe('Amount Validation and Formatting', () => {
    it('should validate currency amounts correctly', () => {
      expect(() => {
        currencyManager.validateCurrencyAmount(100.50, 'USD');
      }).not.toThrow();

      expect(() => {
        currencyManager.validateCurrencyAmount(-10, 'USD');
      }).toThrow('Amount cannot be negative');

      expect(() => {
        currencyManager.validateCurrencyAmount('invalid', 'USD');
      }).toThrow('Amount must be a valid number');

      expect(() => {
        currencyManager.validateCurrencyAmount(0.001, 'USD');
      }).toThrow('Amount below minimum');
    });

    it('should validate decimal places correctly', () => {
      expect(() => {
        currencyManager.validateCurrencyAmount(100.123, 'USD'); // 3 decimal places
      }).toThrow('Too many decimal places for USD. Maximum: 2');

      expect(() => {
        currencyManager.validateCurrencyAmount(100.12, 'USD'); // 2 decimal places
      }).not.toThrow();

      expect(() => {
        currencyManager.validateCurrencyAmount(100.1, 'JPY'); // JPY has 0 decimal places
      }).toThrow('Too many decimal places for JPY. Maximum: 0');
    });

    it('should format amounts correctly', () => {
      const formatted = currencyManager.formatAmount(123.456, 'USD');
      
      expect(formatted.amount).toBe(123.46); // Rounded to 2 decimal places
      expect(formatted.formatted).toBe('$123.46');
      expect(formatted.currency).toBe('USD');
      expect(formatted.symbol).toBe('$');
    });

    it('should round amounts correctly', () => {
      expect(currencyManager.roundAmount(123.456, 'USD')).toBe(123.46);
      expect(currencyManager.roundAmount(123.456, 'JPY')).toBe(123);
      expect(currencyManager.roundAmount(123.999, 'USD')).toBe(124.00);
    });
  });

  describe('Regional Restrictions', () => {
    beforeEach(() => {
      currencyManager.config.enableRegionalRestrictions = true;
    });

    it('should check regional restrictions correctly', () => {
      // Add restriction
      currencyManager.addRegionalRestriction('CN', 'USD', 'Capital controls');
      
      const restriction = currencyManager.checkRegionalRestrictions('USD', 'CN');
      expect(restriction.allowed).toBe(false);
      expect(restriction.restrictions).toContain('Currency USD is restricted in region CN');
      
      const noRestriction = currencyManager.checkRegionalRestrictions('EUR', 'CN');
      expect(noRestriction.allowed).toBe(true);
    });

    it('should add and remove regional restrictions', () => {
      currencyManager.addRegionalRestriction('RU', 'EUR', 'Sanctions');
      
      let restriction = currencyManager.checkRegionalRestrictions('EUR', 'RU');
      expect(restriction.allowed).toBe(false);
      
      currencyManager.removeRegionalRestriction('RU', 'EUR');
      
      restriction = currencyManager.checkRegionalRestrictions('EUR', 'RU');
      expect(restriction.allowed).toBe(true);
    });

    it('should allow transactions when restrictions disabled', () => {
      currencyManager.config.enableRegionalRestrictions = false;
      currencyManager.addRegionalRestriction('CN', 'USD', 'Test');
      
      const restriction = currencyManager.checkRegionalRestrictions('USD', 'CN');
      expect(restriction.allowed).toBe(true);
    });
  });

  describe('Transaction Processing', () => {
    beforeEach(() => {
      // Mock successful account operations
      mockAccountManager.getAccount.mockResolvedValue({
        id: 'account1',
        userId: 'user1',
        currency: 'USD',
        balance: 1000,
        availableBalance: 1000,
        isActive: true
      });

      mockAccountManager.getUserAccount.mockResolvedValue({
        id: 'account1',
        userId: 'user1',
        currency: 'USD',
        balance: 1000,
        availableBalance: 1000,
        isActive: true
      });

      mockAccountManager.debitAccount.mockResolvedValue({
        id: 'debit1',
        accountId: 'account1',
        amount: 100,
        type: 'debit'
      });

      mockAccountManager.creditAccount.mockResolvedValue({
        id: 'credit1',
        accountId: 'account2',
        amount: 85,
        type: 'credit'
      });

      mockRateEngine.getRate.mockResolvedValue({
        rate: 0.85,
        pair: 'USD/EUR',
        timestamp: new Date(),
        qualityScore: 95
      });

      mockDatabase.beginTransaction.mockResolvedValue();
      mockDatabase.commitTransaction.mockResolvedValue();
      mockDatabase.rollbackTransaction.mockResolvedValue();
    });

    describe('Currency Conversion', () => {
      it('should process currency conversion successfully', async () => {
        const result = await currencyManager.convertCurrency(
          'user1', 'USD', 'EUR', 100
        );

        expect(result).toBeDefined();
        expect(result.status).toBe('completed');
        expect(mockRateEngine.getRate).toHaveBeenCalledWith('USD', 'EUR');
        expect(mockAccountManager.debitAccount).toHaveBeenCalled();
        expect(mockAccountManager.creditAccount).toHaveBeenCalled();
      });

      it('should validate currency support before conversion', async () => {
        await expect(
          currencyManager.convertCurrency('user1', 'XYZ', 'EUR', 100)
        ).rejects.toThrow('From currency not supported: XYZ');

        await expect(
          currencyManager.convertCurrency('user1', 'USD', 'XYZ', 100)
        ).rejects.toThrow('To currency not supported: XYZ');
      });

      it('should validate amount before conversion', async () => {
        await expect(
          currencyManager.convertCurrency('user1', 'USD', 'EUR', -100)
        ).rejects.toThrow('Amount cannot be negative');

        await expect(
          currencyManager.convertCurrency('user1', 'USD', 'EUR', 0.001)
        ).rejects.toThrow('Amount below minimum');
      });
    });

    describe('Account Transfers', () => {
      it('should process transfer between accounts successfully', async () => {
        const result = await currencyManager.transferBetweenAccounts(
          'user1', 'account1', 'account2', 100, 'USD'
        );

        expect(result).toBeDefined();
        expect(result.status).toBe('completed');
        expect(mockAccountManager.getAccount).toHaveBeenCalledWith('account1');
        expect(mockAccountManager.getAccount).toHaveBeenCalledWith('account2');
      });

      it('should handle cross-currency transfers', async () => {
        mockAccountManager.getAccount
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
            userId: 'user1',
            currency: 'EUR',
            balance: 500,
            availableBalance: 500,
            isActive: true
          });

        const result = await currencyManager.transferBetweenAccounts(
          'user1', 'account1', 'account2', 100, 'USD'
        );

        expect(result).toBeDefined();
        expect(mockRateEngine.getRate).toHaveBeenCalled();
      });
    });

    describe('Payments', () => {
      it('should process payment successfully', async () => {
        const result = await currencyManager.makePayment(
          'user1', 'user2', 50, 'USD'
        );

        expect(result).toBeDefined();
        expect(result.status).toBe('completed');
        expect(mockAccountManager.getUserAccount).toHaveBeenCalledWith('user1', 'USD');
      });

      it('should create payee account if it does not exist', async () => {
        mockAccountManager.getUserAccount
          .mockResolvedValueOnce({
            id: 'account1',
            userId: 'user1',
            currency: 'USD',
            balance: 1000,
            availableBalance: 1000,
            isActive: true
          })
          .mockResolvedValueOnce(null); // Payee account doesn't exist

        mockAccountManager.createAccount.mockResolvedValue({
          id: 'account2',
          userId: 'user2',
          currency: 'USD',
          balance: 0,
          availableBalance: 0,
          isActive: true
        });

        const result = await currencyManager.makePayment(
          'user1', 'user2', 50, 'USD'
        );

        expect(result).toBeDefined();
        expect(mockAccountManager.createAccount).toHaveBeenCalledWith({
          userId: 'user2',
          currency: 'USD',
          accountType: 'currency',
          isActive: true
        });
      });
    });

    describe('Deposits and Withdrawals', () => {
      it('should process deposit successfully', async () => {
        const result = await currencyManager.depositFunds(
          'user1', 200, 'USD'
        );

        expect(result).toBeDefined();
        expect(result.status).toBe('completed');
        expect(mockAccountManager.creditAccount).toHaveBeenCalled();
      });

      it('should process withdrawal successfully', async () => {
        const result = await currencyManager.withdrawFunds(
          'user1', 100, 'USD'
        );

        expect(result).toBeDefined();
        expect(result.status).toBe('completed');
        expect(mockAccountManager.debitAccount).toHaveBeenCalled();
      });

      it('should create account for deposit if it does not exist', async () => {
        mockAccountManager.getUserAccount.mockResolvedValue(null);
        mockAccountManager.createAccount.mockResolvedValue({
          id: 'account1',
          userId: 'user1',
          currency: 'USD',
          balance: 0,
          availableBalance: 0,
          isActive: true
        });

        const result = await currencyManager.depositFunds(
          'user1', 200, 'USD'
        );

        expect(result).toBeDefined();
        expect(mockAccountManager.createAccount).toHaveBeenCalled();
      });
    });

    describe('FX Trading', () => {
      it('should execute FX trade successfully', async () => {
        const result = await currencyManager.executeTrade(
          'user1', 'USD', 'EUR', 1000
        );

        expect(result).toBeDefined();
        expect(result.status).toBe('completed');
        expect(mockRateEngine.getRate).toHaveBeenCalledWith('USD', 'EUR');
      });

      it('should create trading account if needed', async () => {
        mockAccountManager.getUserAccount
          .mockResolvedValueOnce({
            id: 'account1',
            userId: 'user1',
            currency: 'USD',
            balance: 2000,
            availableBalance: 2000,
            isActive: true
          })
          .mockResolvedValueOnce(null); // No EUR trading account

        mockAccountManager.createAccount.mockResolvedValue({
          id: 'account2',
          userId: 'user1',
          currency: 'EUR',
          balance: 0,
          availableBalance: 0,
          isActive: true
        });

        const result = await currencyManager.executeTrade(
          'user1', 'USD', 'EUR', 1000
        );

        expect(result).toBeDefined();
        expect(mockAccountManager.createAccount).toHaveBeenCalledWith({
          userId: 'user1',
          currency: 'EUR',
          accountType: 'trading',
          isActive: true
        });
      });
    });

    describe('Error Handling', () => {
      it('should handle insufficient balance', async () => {
        mockAccountManager.getUserAccount.mockResolvedValue({
          id: 'account1',
          userId: 'user1',
          currency: 'USD',
          balance: 50,
          availableBalance: 50,
          isActive: true
        });

        await expect(
          currencyManager.convertCurrency('user1', 'USD', 'EUR', 100)
        ).rejects.toThrow('Insufficient balance');
      });

      it('should handle rate unavailable', async () => {
        mockRateEngine.getRate.mockResolvedValue(null);

        await expect(
          currencyManager.convertCurrency('user1', 'USD', 'EUR', 100)
        ).rejects.toThrow('Exchange rate not available');
      });

      it('should rollback transaction on error', async () => {
        mockAccountManager.debitAccount.mockRejectedValue(new Error('Database error'));

        await expect(
          currencyManager.convertCurrency('user1', 'USD', 'EUR', 100)
        ).rejects.toThrow();

        expect(mockDatabase.rollbackTransaction).toHaveBeenCalled();
      });
    });
  });

  describe('Transaction History and P&L', () => {
    beforeEach(() => {
      // Mock history service methods
      jest.spyOn(currencyManager.historyService, 'getUserTransactionHistory')
        .mockResolvedValue({
          transactions: [
            {
              id: 'tx1',
              type: 'conversion',
              amount: 100,
              currency: 'USD',
              status: 'completed'
            }
          ],
          pagination: {
            page: 1,
            limit: 50,
            total: 1,
            totalPages: 1
          }
        });

      jest.spyOn(currencyManager.historyService, 'calculateUserPnL')
        .mockResolvedValue({
          userId: 'user1',
          totalRealizedPnL: 10.50,
          totalUnrealizedPnL: 5.25,
          totalPnL: 15.75,
          baseCurrency: 'USD'
        });
    });

    it('should get user transaction history', async () => {
      const history = await currencyManager.getUserTransactionHistory('user1', {
        page: 1,
        limit: 10
      });

      expect(history).toBeDefined();
      expect(history.transactions).toHaveLength(1);
      expect(history.pagination.total).toBe(1);
    });

    it('should calculate user P&L', async () => {
      const pnl = await currencyManager.getUserPnL('user1');

      expect(pnl).toBeDefined();
      expect(pnl.totalPnL).toBe(15.75);
      expect(pnl.totalRealizedPnL).toBe(10.50);
      expect(pnl.totalUnrealizedPnL).toBe(5.25);
    });

    it('should get cached P&L', () => {
      const cachedPnL = {
        userId: 'user1',
        totalPnL: 20.00,
        calculatedAt: new Date()
      };

      currencyManager.historyService.cachedPnL.set('user1', cachedPnL);

      const result = currencyManager.getCachedUserPnL('user1');
      expect(result).toEqual(cachedPnL);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should return currency statistics', () => {
      const stats = currencyManager.getStatistics();

      expect(stats).toBeDefined();
      expect(stats.totalCurrencies).toBeGreaterThan(0);
      expect(stats.activeCurrencies).toBeGreaterThan(0);
      expect(stats.baseCurrency).toBe('USD');
      expect(stats.supportedCurrencies).toContain('USD');
    });

    it('should return transaction statistics', () => {
      const stats = currencyManager.getTransactionStatistics();

      expect(stats).toBeDefined();
      expect(stats.processor).toBeDefined();
      expect(stats.history).toBeDefined();
      expect(stats.manager).toBeDefined();
    });

    it('should increment transaction statistics', () => {
      const initialStats = currencyManager.getStatistics();
      
      currencyManager.incrementTransactionStats(100, 'USD');
      
      const updatedStats = currencyManager.getStatistics();
      expect(updatedStats.transactionsToday).toBe(initialStats.transactionsToday + 1);
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      const newConfig = {
        baseCurrency: 'EUR',
        conversionFeeRate: 0.005
      };

      currencyManager.updateConfiguration(newConfig);

      const config = currencyManager.getConfiguration();
      expect(config.baseCurrency).toBe('EUR');
      expect(config.conversionFeeRate).toBe(0.005);
    });

    it('should emit events on configuration changes', () => {
      const configUpdatedSpy = jest.fn();
      const baseCurrencyChangedSpy = jest.fn();

      currencyManager.on('configurationUpdated', configUpdatedSpy);
      currencyManager.on('baseCurrencyChanged', baseCurrencyChangedSpy);

      currencyManager.updateConfiguration({ baseCurrency: 'EUR' });

      expect(configUpdatedSpy).toHaveBeenCalled();
      expect(baseCurrencyChangedSpy).toHaveBeenCalledWith({
        old: 'USD',
        new: 'EUR'
      });
    });

    it('should handle supported currencies changes', () => {
      const newConfig = {
        supportedCurrencies: ['USD', 'EUR', 'GBP', 'AUD'] // Added AUD, removed JPY, CAD
      };

      // Mock the currency definition for AUD
      currencyManager.currencyDefinitions.AUD = {
        code: 'AUD',
        name: 'Australian Dollar',
        symbol: 'A$',
        decimalPlaces: 2,
        isActive: false
      };

      currencyManager.updateConfiguration(newConfig);

      expect(currencyManager.isCurrencySupported('AUD')).toBe(true);
      expect(currencyManager.isCurrencySupported('JPY')).toBe(false);
      expect(currencyManager.isCurrencySupported('CAD')).toBe(false);
    });
  });

  describe('Market Hours and Trading', () => {
    it('should check if market is open', () => {
      // Mock current time to be within trading hours
      const originalDate = Date;
      global.Date = jest.fn(() => ({
        toTimeString: () => '10:30:00 GMT+0000 (UTC)'
      }));

      const isOpen = currencyManager.isMarketOpen('USD', 'EUR');
      expect(typeof isOpen).toBe('boolean');

      global.Date = originalDate;
    });

    it('should return trading hours for currency pair', () => {
      const pair = currencyManager.getCurrencyPair('USD', 'EUR');
      
      expect(pair.tradingHours).toBeDefined();
      expect(pair.tradingHours.start).toBeDefined();
      expect(pair.tradingHours.end).toBeDefined();
      expect(pair.tradingHours.timezone).toBe('UTC');
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when all components are working', async () => {
      const health = await currencyManager.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.currencies.active).toBeGreaterThan(1);
      expect(health.currencies.base).toBe('USD');
      expect(health.pairs.active).toBeGreaterThan(0);
      expect(health.transactions.processor).toBeDefined();
      expect(health.transactions.history).toBeDefined();
    });

    it('should return unhealthy status when base currency is inactive', async () => {
      currencyManager.deactivateCurrency = jest.fn(); // Mock to avoid error
      currencyManager.activeCurrencies.delete('USD');

      const health = await currencyManager.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.error).toBe('Base currency is not active');
    });

    it('should return degraded status with insufficient currencies', async () => {
      // Remove all currencies except base
      currencyManager.activeCurrencies.clear();
      currencyManager.activeCurrencies.add('USD');

      const health = await currencyManager.healthCheck();

      expect(health.status).toBe('degraded');
      expect(health.warning).toBe('Less than 2 active currencies');
    });
  });

  describe('Event Handling', () => {
    it('should emit currency events', () => {
      const currencyAddedSpy = jest.fn();
      const currencyRemovedSpy = jest.fn();

      currencyManager.on('currencyAdded', currencyAddedSpy);
      currencyManager.on('currencyRemoved', currencyRemovedSpy);

      // Add currency
      const newCurrency = {
        code: 'AUD',
        name: 'Australian Dollar',
        symbol: 'A$',
        decimalPlaces: 2,
        numericCode: 36,
        category: 'major'
      };

      currencyManager.addCurrency(newCurrency);
      expect(currencyAddedSpy).toHaveBeenCalledWith({
        currency: 'AUD',
        definition: expect.objectContaining(newCurrency)
      });

      // Remove currency (deactivate)
      currencyManager.deactivateCurrency('AUD');
      expect(currencyRemovedSpy).toHaveBeenCalledWith({
        currency: 'AUD'
      });
    });

    it('should emit transaction events', async () => {
      const transactionCompletedSpy = jest.fn();
      const transactionFailedSpy = jest.fn();

      currencyManager.on('transactionCompleted', transactionCompletedSpy);
      currencyManager.on('transactionFailed', transactionFailedSpy);

      // Successful transaction
      await currencyManager.convertCurrency('user1', 'USD', 'EUR', 100);
      expect(transactionCompletedSpy).toHaveBeenCalled();

      // Failed transaction
      mockRateEngine.getRate.mockResolvedValue(null);
      
      try {
        await currencyManager.convertCurrency('user1', 'USD', 'EUR', 100);
      } catch (error) {
        // Expected to fail
      }

      expect(transactionFailedSpy).toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete currency conversion workflow', async () => {
      // Setup: User wants to convert 1000 USD to EUR
      const userId = 'user1';
      const fromCurrency = 'USD';
      const toCurrency = 'EUR';
      const amount = 1000;

      // Mock exchange rate
      mockRateEngine.getRate.mockResolvedValue({
        rate: 0.85,
        pair: 'USD/EUR',
        timestamp: new Date(),
        qualityScore: 95
      });

      // Mock user accounts
      mockAccountManager.getUserAccount
        .mockResolvedValueOnce({
          id: 'usd-account',
          userId,
          currency: 'USD',
          balance: 2000,
          availableBalance: 2000,
          isActive: true
        })
        .mockResolvedValueOnce({
          id: 'eur-account',
          userId,
          currency: 'EUR',
          balance: 500,
          availableBalance: 500,
          isActive: true
        });

      // Execute conversion
      const result = await currencyManager.convertCurrency(
        userId, fromCurrency, toCurrency, amount
      );

      // Verify result
      expect(result.status).toBe('completed');
      expect(result.transactionId).toBeDefined();

      // Verify account operations
      expect(mockAccountManager.debitAccount).toHaveBeenCalledWith(
        'usd-account',
        expect.any(Number), // amount + fees
        expect.any(Object)
      );

      expect(mockAccountManager.creditAccount).toHaveBeenCalledWith(
        'eur-account',
        850, // 1000 * 0.85
        expect.any(Object)
      );

      // Verify database transaction
      expect(mockDatabase.beginTransaction).toHaveBeenCalled();
      expect(mockDatabase.commitTransaction).toHaveBeenCalled();
    });

    it('should handle multi-step transaction with account creation', async () => {
      const userId = 'user1';
      
      // Mock: User has USD account but no EUR account
      mockAccountManager.getUserAccount
        .mockResolvedValueOnce({
          id: 'usd-account',
          userId,
          currency: 'USD',
          balance: 1000,
          availableBalance: 1000,
          isActive: true
        })
        .mockResolvedValueOnce(null); // No EUR account

      // Mock account creation
      mockAccountManager.createAccount.mockResolvedValue({
        id: 'new-eur-account',
        userId,
        currency: 'EUR',
        balance: 0,
        availableBalance: 0,
        isActive: true
      });

      const result = await currencyManager.convertCurrency(
        userId, 'USD', 'EUR', 500
      );

      expect(result.status).toBe('completed');
      expect(mockAccountManager.createAccount).toHaveBeenCalledWith({
        userId,
        currency: 'EUR',
        accountType: 'currency',
        isActive: true
      });
    });
  });
});