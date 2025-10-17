/**
 * Multi-Currency Account Manager
 * Çoklu para birimi hesap yönetimi ve bakiye işlemleri
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');

class MultiCurrencyAccountManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      defaultCurrency: config.defaultCurrency || 'USD',
      supportedCurrencies: config.supportedCurrencies || ['USD', 'EUR', 'GBP', 'JPY', 'CAD'],
      maxAccountsPerUser: config.maxAccountsPerUser || 10,
      minBalanceThreshold: config.minBalanceThreshold || 0.01,
      maxDailyTransactionLimit: config.maxDailyTransactionLimit || 50000,
      enableOverdraftProtection: config.enableOverdraftProtection !== false,
      overdraftLimit: config.overdraftLimit || 1000,
      accountTypes: config.accountTypes || ['checking', 'savings', 'investment', 'business'],
      ...config
    };

    // Hesap verileri (gerçek uygulamada veritabanında saklanır)
    this.accounts = new Map();
    this.userAccounts = new Map(); // userId -> accountIds[]
    this.accountBalances = new Map(); // accountId -> { currency -> balance }
    this.reservedBalances = new Map(); // accountId -> { currency -> reserved }
    this.transactionHistory = new Map(); // accountId -> transactions[]
    
    // Günlük limitler takibi
    this.dailyLimits = new Map(); // userId -> { date, totalAmount }
    
    // İstatistikler
    this.stats = {
      totalAccounts: 0,
      totalUsers: 0,
      totalBalance: {},
      accountsByType: {},
      accountsByCurrency: {}
    };

    this.initializeStats();
  }

  initializeStats() {
    // İstatistikleri başlat
    this.config.supportedCurrencies.forEach(currency => {
      this.stats.totalBalance[currency] = 0;
      this.stats.accountsByCurrency[currency] = 0;
    });

    this.config.accountTypes.forEach(type => {
      this.stats.accountsByType[type] = 0;
    });
  }

  // Hesap Oluşturma ve Yönetimi

  async createAccount(userId, accountData) {
    try {
      const {
        accountType = 'checking',
        currency = this.config.defaultCurrency,
        accountName,
        initialBalance = 0,
        metadata = {}
      } = accountData;

      // Validasyonlar
      this.validateAccountCreation(userId, accountType, currency, initialBalance);

      // Kullanıcının hesap sayısını kontrol et
      const userAccountCount = this.getUserAccountCount(userId);
      if (userAccountCount >= this.config.maxAccountsPerUser) {
        throw new Error(`Maksimum hesap sayısına ulaşıldı: ${this.config.maxAccountsPerUser}`);
      }

      // Yeni hesap oluştur
      const accountId = uuidv4();
      const account = {
        id: accountId,
        userId,
        accountType,
        primaryCurrency: currency,
        accountName: accountName || `${accountType.charAt(0).toUpperCase() + accountType.slice(1)} Account`,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          ...metadata,
          overdraftEnabled: accountType === 'checking' && this.config.enableOverdraftProtection,
          overdraftLimit: accountType === 'checking' ? this.config.overdraftLimit : 0
        }
      };

      // Hesabı kaydet
      this.accounts.set(accountId, account);

      // Kullanıcı hesaplarını güncelle
      if (!this.userAccounts.has(userId)) {
        this.userAccounts.set(userId, []);
      }
      this.userAccounts.get(userId).push(accountId);

      // Bakiye başlat
      this.accountBalances.set(accountId, {});
      this.reservedBalances.set(accountId, {});
      this.transactionHistory.set(accountId, []);

      // Başlangıç bakiyesi varsa ekle
      if (initialBalance > 0) {
        await this.creditBalance(accountId, currency, initialBalance, {
          type: 'initial_deposit',
          description: 'Hesap açılış bakiyesi'
        });
      }

      // İstatistikleri güncelle
      this.updateAccountStats(accountType, currency, 1);

      this.emit('accountCreated', {
        accountId,
        userId,
        accountType,
        currency,
        initialBalance
      });

      logger.info(`Yeni hesap oluşturuldu: ${accountId} - Kullanıcı: ${userId}`);

      return {
        success: true,
        account: {
          ...account,
          balance: this.getAccountBalance(accountId),
          availableBalance: this.getAvailableBalance(accountId)
        }
      };

    } catch (error) {
      logger.error('Hesap oluşturma hatası:', error);
      throw error;
    }
  }

  async closeAccount(accountId, userId, reason = 'user_request') {
    try {
      const account = this.getAccount(accountId);
      
      if (!account) {
        throw new Error('Hesap bulunamadı');
      }

      if (account.userId !== userId) {
        throw new Error('Bu hesaba erişim yetkiniz yok');
      }

      if (account.status === 'closed') {
        throw new Error('Hesap zaten kapalı');
      }

      // Hesapta bakiye var mı kontrol et
      const balances = this.getAccountBalance(accountId);
      const hasBalance = Object.values(balances).some(balance => Math.abs(balance) > this.config.minBalanceThreshold);

      if (hasBalance) {
        throw new Error('Hesap kapatılmadan önce tüm bakiyeler sıfırlanmalı');
      }

      // Bekleyen işlemler var mı kontrol et
      const reservedBalances = this.getReservedBalance(accountId);
      const hasReserved = Object.values(reservedBalances).some(reserved => reserved > 0);

      if (hasReserved) {
        throw new Error('Hesap kapatılmadan önce bekleyen işlemler tamamlanmalı');
      }

      // Hesabı kapat
      account.status = 'closed';
      account.closedAt = new Date();
      account.closureReason = reason;
      account.updatedAt = new Date();

      // Kullanıcı hesaplarından çıkar
      const userAccountIds = this.userAccounts.get(userId) || [];
      const updatedAccountIds = userAccountIds.filter(id => id !== accountId);
      this.userAccounts.set(userId, updatedAccountIds);

      // İstatistikleri güncelle
      this.updateAccountStats(account.accountType, account.primaryCurrency, -1);

      this.emit('accountClosed', {
        accountId,
        userId,
        reason
      });

      logger.info(`Hesap kapatıldı: ${accountId} - Sebep: ${reason}`);

      return { success: true, closedAt: account.closedAt };

    } catch (error) {
      logger.error('Hesap kapatma hatası:', error);
      throw error;
    }
  }

  // Bakiye Yönetimi

  async creditBalance(accountId, currency, amount, transactionData = {}) {
    try {
      this.validateTransaction(accountId, currency, amount, 'credit');

      const account = this.getAccount(accountId);
      if (!account || account.status !== 'active') {
        throw new Error('Geçersiz veya aktif olmayan hesap');
      }

      // Bakiye güncelle
      const balances = this.accountBalances.get(accountId);
      const currentBalance = balances[currency] || 0;
      const newBalance = currentBalance + amount;

      balances[currency] = this.roundAmount(newBalance, currency);
      this.accountBalances.set(accountId, balances);

      // İşlem kaydı oluştur
      const transaction = this.createTransactionRecord(
        accountId,
        'credit',
        currency,
        amount,
        newBalance,
        transactionData
      );

      // İşlem geçmişine ekle
      const history = this.transactionHistory.get(accountId);
      history.push(transaction);
      this.transactionHistory.set(accountId, history);

      // İstatistikleri güncelle
      this.stats.totalBalance[currency] = (this.stats.totalBalance[currency] || 0) + amount;

      // Hesap güncelleme zamanını ayarla
      account.updatedAt = new Date();

      this.emit('balanceCredited', {
        accountId,
        currency,
        amount,
        newBalance,
        transaction
      });

      logger.debug(`Bakiye yüklendi: ${accountId} - ${amount} ${currency}`);

      return {
        success: true,
        transaction,
        newBalance,
        availableBalance: this.getAvailableBalance(accountId)[currency] || 0
      };

    } catch (error) {
      logger.error('Bakiye yükleme hatası:', error);
      throw error;
    }
  }

  async debitBalance(accountId, currency, amount, transactionData = {}) {
    try {
      this.validateTransaction(accountId, currency, amount, 'debit');

      const account = this.getAccount(accountId);
      if (!account || account.status !== 'active') {
        throw new Error('Geçersiz veya aktif olmayan hesap');
      }

      // Yeterli bakiye kontrolü
      const availableBalance = this.getAvailableBalance(accountId)[currency] || 0;
      const overdraftLimit = account.metadata.overdraftEnabled ? account.metadata.overdraftLimit : 0;
      const maxDebitAmount = availableBalance + overdraftLimit;

      if (amount > maxDebitAmount) {
        throw new Error(`Yetersiz bakiye. Mevcut: ${availableBalance} ${currency}, Talep: ${amount} ${currency}`);
      }

      // Bakiye güncelle
      const balances = this.accountBalances.get(accountId);
      const currentBalance = balances[currency] || 0;
      const newBalance = currentBalance - amount;

      balances[currency] = this.roundAmount(newBalance, currency);
      this.accountBalances.set(accountId, balances);

      // İşlem kaydı oluştur
      const transaction = this.createTransactionRecord(
        accountId,
        'debit',
        currency,
        amount,
        newBalance,
        transactionData
      );

      // İşlem geçmişine ekle
      const history = this.transactionHistory.get(accountId);
      history.push(transaction);
      this.transactionHistory.set(accountId, history);

      // İstatistikleri güncelle
      this.stats.totalBalance[currency] = (this.stats.totalBalance[currency] || 0) - amount;

      // Hesap güncelleme zamanını ayarla
      account.updatedAt = new Date();

      this.emit('balanceDebited', {
        accountId,
        currency,
        amount,
        newBalance,
        transaction
      });

      logger.debug(`Bakiye düşüldü: ${accountId} - ${amount} ${currency}`);

      return {
        success: true,
        transaction,
        newBalance,
        availableBalance: this.getAvailableBalance(accountId)[currency] || 0
      };

    } catch (error) {
      logger.error('Bakiye düşme hatası:', error);
      throw error;
    }
  }

  async reserveBalance(accountId, currency, amount, reservationId = null, expiresAt = null) {
    try {
      this.validateTransaction(accountId, currency, amount, 'reserve');

      const account = this.getAccount(accountId);
      if (!account || account.status !== 'active') {
        throw new Error('Geçersiz veya aktif olmayan hesap');
      }

      // Yeterli bakiye kontrolü
      const availableBalance = this.getAvailableBalance(accountId)[currency] || 0;
      if (amount > availableBalance) {
        throw new Error(`Yetersiz kullanılabilir bakiye. Mevcut: ${availableBalance} ${currency}`);
      }

      // Rezervasyon ID oluştur
      const resId = reservationId || uuidv4();

      // Rezerve bakiyeyi güncelle
      const reservedBalances = this.reservedBalances.get(accountId);
      const currentReserved = reservedBalances[currency] || 0;
      reservedBalances[currency] = this.roundAmount(currentReserved + amount, currency);
      this.reservedBalances.set(accountId, reservedBalances);

      // Rezervasyon kaydı oluştur
      const reservation = {
        id: resId,
        accountId,
        currency,
        amount,
        createdAt: new Date(),
        expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 saat
        status: 'active'
      };

      this.emit('balanceReserved', {
        accountId,
        currency,
        amount,
        reservationId: resId,
        availableBalance: this.getAvailableBalance(accountId)[currency] || 0
      });

      logger.debug(`Bakiye rezerve edildi: ${accountId} - ${amount} ${currency} - ID: ${resId}`);

      return {
        success: true,
        reservationId: resId,
        reservation,
        availableBalance: this.getAvailableBalance(accountId)[currency] || 0
      };

    } catch (error) {
      logger.error('Bakiye rezervasyon hatası:', error);
      throw error;
    }
  }

  async releaseReservation(accountId, currency, amount, reservationId) {
    try {
      const account = this.getAccount(accountId);
      if (!account) {
        throw new Error('Hesap bulunamadı');
      }

      // Rezerve bakiyeyi güncelle
      const reservedBalances = this.reservedBalances.get(accountId);
      const currentReserved = reservedBalances[currency] || 0;
      
      if (currentReserved < amount) {
        throw new Error('Serbest bırakılacak miktar rezerve bakiyeden fazla');
      }

      reservedBalances[currency] = this.roundAmount(currentReserved - amount, currency);
      this.reservedBalances.set(accountId, reservedBalances);

      this.emit('reservationReleased', {
        accountId,
        currency,
        amount,
        reservationId,
        availableBalance: this.getAvailableBalance(accountId)[currency] || 0
      });

      logger.debug(`Rezervasyon serbest bırakıldı: ${accountId} - ${amount} ${currency} - ID: ${reservationId}`);

      return {
        success: true,
        availableBalance: this.getAvailableBalance(accountId)[currency] || 0
      };

    } catch (error) {
      logger.error('Rezervasyon serbest bırakma hatası:', error);
      throw error;
    }
  }

  // Transfer İşlemleri

  async transferBetweenAccounts(fromAccountId, toAccountId, currency, amount, transferData = {}) {
    try {
      // Validasyonlar
      if (fromAccountId === toAccountId) {
        throw new Error('Aynı hesaplar arası transfer yapılamaz');
      }

      const fromAccount = this.getAccount(fromAccountId);
      const toAccount = this.getAccount(toAccountId);

      if (!fromAccount || !toAccount) {
        throw new Error('Geçersiz hesap ID\'si');
      }

      if (fromAccount.status !== 'active' || toAccount.status !== 'active') {
        throw new Error('Aktif olmayan hesaplar arası transfer yapılamaz');
      }

      // Günlük limit kontrolü
      await this.checkDailyLimit(fromAccount.userId, amount);

      // Transfer işlemi (atomik)
      const transferId = uuidv4();
      
      // Önce gönderen hesaptan düş
      await this.debitBalance(fromAccountId, currency, amount, {
        type: 'transfer_out',
        transferId,
        toAccountId,
        description: transferData.description || 'Hesaplar arası transfer',
        ...transferData
      });

      // Sonra alıcı hesaba ekle
      await this.creditBalance(toAccountId, currency, amount, {
        type: 'transfer_in',
        transferId,
        fromAccountId,
        description: transferData.description || 'Hesaplar arası transfer',
        ...transferData
      });

      // Günlük limit güncelle
      this.updateDailyLimit(fromAccount.userId, amount);

      this.emit('transferCompleted', {
        transferId,
        fromAccountId,
        toAccountId,
        currency,
        amount,
        fromUserId: fromAccount.userId,
        toUserId: toAccount.userId
      });

      logger.info(`Transfer tamamlandı: ${fromAccountId} -> ${toAccountId} - ${amount} ${currency}`);

      return {
        success: true,
        transferId,
        fromBalance: this.getAccountBalance(fromAccountId)[currency] || 0,
        toBalance: this.getAccountBalance(toAccountId)[currency] || 0
      };

    } catch (error) {
      logger.error('Transfer hatası:', error);
      throw error;
    }
  }

  // Sorgulama Metodları

  getAccount(accountId) {
    return this.accounts.get(accountId);
  }

  getUserAccounts(userId) {
    const accountIds = this.userAccounts.get(userId) || [];
    return accountIds.map(id => {
      const account = this.accounts.get(id);
      return {
        ...account,
        balance: this.getAccountBalance(id),
        availableBalance: this.getAvailableBalance(id),
        reservedBalance: this.getReservedBalance(id)
      };
    });
  }

  getAccountBalance(accountId) {
    return this.accountBalances.get(accountId) || {};
  }

  getAvailableBalance(accountId) {
    const totalBalance = this.getAccountBalance(accountId);
    const reservedBalance = this.getReservedBalance(accountId);
    const availableBalance = {};

    // Her para birimi için kullanılabilir bakiyeyi hesapla
    const allCurrencies = new Set([
      ...Object.keys(totalBalance),
      ...Object.keys(reservedBalance)
    ]);

    allCurrencies.forEach(currency => {
      const total = totalBalance[currency] || 0;
      const reserved = reservedBalance[currency] || 0;
      availableBalance[currency] = this.roundAmount(total - reserved, currency);
    });

    return availableBalance;
  }

  getReservedBalance(accountId) {
    return this.reservedBalances.get(accountId) || {};
  }

  getTransactionHistory(accountId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      currency = null,
      type = null,
      startDate = null,
      endDate = null
    } = options;

    let transactions = this.transactionHistory.get(accountId) || [];

    // Filtreleme
    if (currency) {
      transactions = transactions.filter(tx => tx.currency === currency);
    }

    if (type) {
      transactions = transactions.filter(tx => tx.type === type);
    }

    if (startDate) {
      transactions = transactions.filter(tx => new Date(tx.timestamp) >= new Date(startDate));
    }

    if (endDate) {
      transactions = transactions.filter(tx => new Date(tx.timestamp) <= new Date(endDate));
    }

    // Sıralama (en yeni önce)
    transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Sayfalama
    const total = transactions.length;
    const paginatedTransactions = transactions.slice(offset, offset + limit);

    return {
      transactions: paginatedTransactions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    };
  }

  // Yardımcı Metodlar

  validateAccountCreation(userId, accountType, currency, initialBalance) {
    if (!userId) {
      throw new Error('Kullanıcı ID gerekli');
    }

    if (!this.config.accountTypes.includes(accountType)) {
      throw new Error(`Desteklenmeyen hesap türü: ${accountType}`);
    }

    if (!this.config.supportedCurrencies.includes(currency)) {
      throw new Error(`Desteklenmeyen para birimi: ${currency}`);
    }

    if (initialBalance < 0) {
      throw new Error('Başlangıç bakiyesi negatif olamaz');
    }
  }

  validateTransaction(accountId, currency, amount, type) {
    if (!accountId) {
      throw new Error('Hesap ID gerekli');
    }

    if (!this.config.supportedCurrencies.includes(currency)) {
      throw new Error(`Desteklenmeyen para birimi: ${currency}`);
    }

    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error('Geçersiz işlem tutarı');
    }

    if (amount < this.config.minBalanceThreshold) {
      throw new Error(`Minimum işlem tutarı: ${this.config.minBalanceThreshold}`);
    }
  }

  createTransactionRecord(accountId, type, currency, amount, newBalance, transactionData) {
    return {
      id: uuidv4(),
      accountId,
      type,
      currency,
      amount: this.roundAmount(amount, currency),
      balanceAfter: this.roundAmount(newBalance, currency),
      timestamp: new Date(),
      description: transactionData.description || '',
      metadata: transactionData.metadata || {},
      ...transactionData
    };
  }

  roundAmount(amount, currency) {
    // Para birimine göre yuvarlama (JPY için 0 ondalık, diğerleri için 2)
    const decimals = currency === 'JPY' ? 0 : 2;
    return Math.round(amount * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  getUserAccountCount(userId) {
    return (this.userAccounts.get(userId) || []).length;
  }

  async checkDailyLimit(userId, amount) {
    const today = new Date().toDateString();
    const userLimit = this.dailyLimits.get(userId);

    if (userLimit && userLimit.date === today) {
      if (userLimit.totalAmount + amount > this.config.maxDailyTransactionLimit) {
        throw new Error(`Günlük işlem limiti aşıldı: ${this.config.maxDailyTransactionLimit}`);
      }
    }
  }

  updateDailyLimit(userId, amount) {
    const today = new Date().toDateString();
    const userLimit = this.dailyLimits.get(userId);

    if (userLimit && userLimit.date === today) {
      userLimit.totalAmount += amount;
    } else {
      this.dailyLimits.set(userId, {
        date: today,
        totalAmount: amount
      });
    }
  }

  updateAccountStats(accountType, currency, delta) {
    this.stats.accountsByType[accountType] = (this.stats.accountsByType[accountType] || 0) + delta;
    this.stats.accountsByCurrency[currency] = (this.stats.accountsByCurrency[currency] || 0) + delta;
    
    if (delta > 0) {
      this.stats.totalAccounts++;
    } else {
      this.stats.totalAccounts--;
    }
  }

  // İstatistikler ve Raporlama

  getAccountStatistics() {
    return {
      ...this.stats,
      totalUsers: this.userAccounts.size,
      averageAccountsPerUser: this.userAccounts.size > 0 ? this.stats.totalAccounts / this.userAccounts.size : 0,
      lastUpdated: new Date().toISOString()
    };
  }

  getUserPortfolioSummary(userId) {
    const accounts = this.getUserAccounts(userId);
    const summary = {
      totalAccounts: accounts.length,
      accountTypes: {},
      totalBalance: {},
      availableBalance: {},
      reservedBalance: {}
    };

    accounts.forEach(account => {
      // Hesap türü sayısı
      summary.accountTypes[account.accountType] = (summary.accountTypes[account.accountType] || 0) + 1;

      // Bakiye toplamları
      Object.entries(account.balance).forEach(([currency, balance]) => {
        summary.totalBalance[currency] = (summary.totalBalance[currency] || 0) + balance;
      });

      Object.entries(account.availableBalance).forEach(([currency, balance]) => {
        summary.availableBalance[currency] = (summary.availableBalance[currency] || 0) + balance;
      });

      Object.entries(account.reservedBalance).forEach(([currency, balance]) => {
        summary.reservedBalance[currency] = (summary.reservedBalance[currency] || 0) + balance;
      });
    });

    return summary;
  }

  // Sağlık Kontrolü

  async healthCheck() {
    const health = {
      status: 'healthy',
      accounts: {
        total: this.stats.totalAccounts,
        active: Array.from(this.accounts.values()).filter(acc => acc.status === 'active').length
      },
      users: {
        total: this.userAccounts.size
      },
      balances: {
        currencies: Object.keys(this.stats.totalBalance).length,
        totalValue: this.stats.totalBalance
      }
    };

    // Temel sağlık kontrolleri
    if (this.stats.totalAccounts === 0) {
      health.status = 'warning';
      health.message = 'Hiç hesap bulunmuyor';
    }

    return health;
  }
}

module.exports = MultiCurrencyAccountManager;