/**
 * Para Birimi Dönüştürme Servisi
 * Gerçek zamanlı döviz kurları ile para birimi dönüştürme işlemleri
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');

class CurrencyConversionService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      baseCurrency: config.baseCurrency || 'USD',
      supportedCurrencies: config.supportedCurrencies || ['USD', 'EUR', 'GBP', 'JPY', 'CAD'],
      conversionFeeRate: config.conversionFeeRate || 0.0025, // %0.25 komisyon
      spreadRate: config.spreadRate || 0.001, // %0.1 spread
      minConversionAmount: config.minConversionAmount || 1.0,
      maxConversionAmount: config.maxConversionAmount || 1000000,
      rateValidityPeriod: config.rateValidityPeriod || 60000, // 1 dakika
      enableRateCache: config.enableRateCache !== false,
      enableConversionHistory: config.enableConversionHistory !== false,
      ...config
    };

    // Dış bağımlılıklar (dependency injection)
    this.rateProvider = config.rateProvider; // Exchange rate provider
    this.accountManager = config.accountManager; // Multi-currency account manager
    
    // Kur önbelleği
    this.rateCache = new Map();
    this.lastRateUpdate = new Map();
    
    // Dönüştürme geçmişi
    this.conversionHistory = new Map(); // userId -> conversions[]
    
    // İstatistikler
    this.stats = {
      totalConversions: 0,
      totalVolume: {},
      conversionsByPair: {},
      totalFees: {},
      averageConversionAmount: 0,
      successRate: 0,
      failedConversions: 0
    };

    this.initializeStats();
  }

  initializeStats() {
    this.config.supportedCurrencies.forEach(currency => {
      this.stats.totalVolume[currency] = 0;
      this.stats.totalFees[currency] = 0;
    });
  }

  // Ana Dönüştürme Metodları

  async convertCurrency(fromCurrency, toCurrency, amount, options = {}) {
    try {
      const {
        userId = null,
        accountId = null,
        rateType = 'mid', // 'bid', 'ask', 'mid'
        includeSpread = true,
        includeFees = true,
        executeConversion = false // Gerçek hesap işlemi yapılsın mı
      } = options;

      // Validasyonlar
      this.validateConversionRequest(fromCurrency, toCurrency, amount);

      // Aynı para birimi kontrolü
      if (fromCurrency === toCurrency) {
        return {
          success: true,
          fromCurrency,
          toCurrency,
          originalAmount: amount,
          convertedAmount: amount,
          exchangeRate: 1.0,
          fees: 0,
          spread: 0,
          totalCost: amount,
          conversionId: uuidv4(),
          timestamp: new Date()
        };
      }

      // Döviz kurunu al
      const rateInfo = await this.getExchangeRate(fromCurrency, toCurrency, rateType);
      
      if (!rateInfo) {
        throw new Error(`${fromCurrency}/${toCurrency} için döviz kuru bulunamadı`);
      }

      // Dönüştürme hesaplamaları
      const conversionResult = this.calculateConversion(
        amount, 
        rateInfo, 
        { includeSpread, includeFees }
      );

      // Dönüştürme kaydı oluştur
      const conversionRecord = {
        id: uuidv4(),
        userId,
        accountId,
        fromCurrency,
        toCurrency,
        originalAmount: amount,
        exchangeRate: rateInfo.rate,
        effectiveRate: conversionResult.effectiveRate,
        convertedAmount: conversionResult.convertedAmount,
        fees: conversionResult.fees,
        spread: conversionResult.spread,
        totalCost: conversionResult.totalCost,
        rateProvider: rateInfo.provider,
        rateTimestamp: rateInfo.timestamp,
        timestamp: new Date(),
        executed: false
      };

      // Gerçek hesap işlemi yapılacaksa
      if (executeConversion && this.accountManager && accountId) {
        await this.executeAccountConversion(conversionRecord);
        conversionRecord.executed = true;
      }

      // Geçmişe kaydet
      if (this.config.enableConversionHistory && userId) {
        this.addToConversionHistory(userId, conversionRecord);
      }

      // İstatistikleri güncelle
      this.updateConversionStats(conversionRecord);

      this.emit('conversionCompleted', conversionRecord);

      logger.info(`Para birimi dönüştürme tamamlandı: ${amount} ${fromCurrency} -> ${conversionResult.convertedAmount} ${toCurrency}`);

      return {
        success: true,
        ...conversionRecord
      };

    } catch (error) {
      this.stats.failedConversions++;
      logger.error('Para birimi dönüştürme hatası:', error);
      
      this.emit('conversionFailed', {
        fromCurrency,
        toCurrency,
        amount,
        error: error.message,
        timestamp: new Date()
      });

      throw error;
    }
  }

  async getConversionQuote(fromCurrency, toCurrency, amount, rateType = 'mid') {
    try {
      // Sadece fiyat teklifi ver, işlem yapma
      const result = await this.convertCurrency(fromCurrency, toCurrency, amount, {
        rateType,
        executeConversion: false
      });

      return {
        quote: {
          fromCurrency: result.fromCurrency,
          toCurrency: result.toCurrency,
          amount: result.originalAmount,
          convertedAmount: result.convertedAmount,
          exchangeRate: result.exchangeRate,
          effectiveRate: result.effectiveRate,
          fees: result.fees,
          spread: result.spread,
          totalCost: result.totalCost,
          validUntil: new Date(Date.now() + this.config.rateValidityPeriod),
          quoteId: result.conversionId
        },
        timestamp: result.timestamp
      };

    } catch (error) {
      logger.error('Dönüştürme teklifi hatası:', error);
      throw error;
    }
  }

  async executeBatchConversion(conversions, userId = null) {
    try {
      const results = [];
      const errors = [];

      for (const conversion of conversions) {
        try {
          const result = await this.convertCurrency(
            conversion.fromCurrency,
            conversion.toCurrency,
            conversion.amount,
            {
              userId,
              accountId: conversion.accountId,
              executeConversion: conversion.executeConversion || false,
              ...conversion.options
            }
          );
          results.push(result);
        } catch (error) {
          errors.push({
            conversion,
            error: error.message
          });
        }
      }

      return {
        success: errors.length === 0,
        results,
        errors,
        totalProcessed: conversions.length,
        successCount: results.length,
        errorCount: errors.length
      };

    } catch (error) {
      logger.error('Toplu dönüştürme hatası:', error);
      throw error;
    }
  }

  // Döviz Kuru Yönetimi

  async getExchangeRate(fromCurrency, toCurrency, rateType = 'mid') {
    try {
      const pairKey = `${fromCurrency}/${toCurrency}`;
      const now = Date.now();

      // Önbellekten kontrol et
      if (this.config.enableRateCache) {
        const cachedRate = this.rateCache.get(pairKey);
        const lastUpdate = this.lastRateUpdate.get(pairKey) || 0;

        if (cachedRate && (now - lastUpdate) < this.config.rateValidityPeriod) {
          return {
            ...cachedRate,
            source: 'cache'
          };
        }
      }

      // Rate provider'dan al
      if (!this.rateProvider) {
        throw new Error('Döviz kuru sağlayıcısı yapılandırılmamış');
      }

      const rateData = await this.rateProvider.getRate(fromCurrency, toCurrency);
      
      if (!rateData) {
        throw new Error(`${pairKey} için kur bulunamadı`);
      }

      // Kur tipine göre ayarla
      let rate;
      switch (rateType) {
        case 'bid':
          rate = rateData.bidRate || rateData.rate * (1 - this.config.spreadRate);
          break;
        case 'ask':
          rate = rateData.askRate || rateData.rate * (1 + this.config.spreadRate);
          break;
        case 'mid':
        default:
          rate = rateData.rate;
          break;
      }

      const rateInfo = {
        rate,
        bidRate: rateData.bidRate,
        askRate: rateData.askRate,
        spread: rateData.spread,
        provider: rateData.provider || 'unknown',
        timestamp: rateData.timestamp || new Date(),
        qualityScore: rateData.qualityScore || 100,
        source: 'provider'
      };

      // Önbelleğe kaydet
      if (this.config.enableRateCache) {
        this.rateCache.set(pairKey, rateInfo);
        this.lastRateUpdate.set(pairKey, now);
      }

      return rateInfo;

    } catch (error) {
      logger.error(`Döviz kuru alma hatası (${fromCurrency}/${toCurrency}):`, error);
      throw error;
    }
  }

  async getMultipleRates(currencyPairs, rateType = 'mid') {
    try {
      const rates = {};
      const errors = {};

      for (const pair of currencyPairs) {
        const [fromCurrency, toCurrency] = pair.split('/');
        try {
          rates[pair] = await this.getExchangeRate(fromCurrency, toCurrency, rateType);
        } catch (error) {
          errors[pair] = error.message;
        }
      }

      return {
        rates,
        errors,
        timestamp: new Date()
      };

    } catch (error) {
      logger.error('Çoklu kur alma hatası:', error);
      throw error;
    }
  }

  // Hesaplama Metodları

  calculateConversion(amount, rateInfo, options = {}) {
    const { includeSpread = true, includeFees = true } = options;

    let effectiveRate = rateInfo.rate;
    let spread = 0;
    let fees = 0;

    // Spread hesapla
    if (includeSpread && rateInfo.spread) {
      spread = amount * rateInfo.spread;
      effectiveRate = rateInfo.rate * (1 - rateInfo.spread);
    }

    // Temel dönüştürme
    let convertedAmount = amount * effectiveRate;

    // Komisyon hesapla
    if (includeFees) {
      fees = convertedAmount * this.config.conversionFeeRate;
      convertedAmount -= fees;
    }

    // Toplam maliyet
    const totalCost = amount + (spread / effectiveRate); // Spread'i kaynak para biriminde

    return {
      convertedAmount: this.roundAmount(convertedAmount),
      effectiveRate,
      fees: this.roundAmount(fees),
      spread: this.roundAmount(spread),
      totalCost: this.roundAmount(totalCost)
    };
  }

  calculateCrossRate(baseCurrency, fromCurrency, toCurrency, baseRates) {
    // Çapraz kur hesaplama (USD üzerinden)
    const fromRate = baseRates[`${baseCurrency}/${fromCurrency}`];
    const toRate = baseRates[`${baseCurrency}/${toCurrency}`];

    if (!fromRate || !toRate) {
      throw new Error('Çapraz kur hesaplama için gerekli kurlar bulunamadı');
    }

    return {
      rate: toRate.rate / fromRate.rate,
      timestamp: new Date(Math.min(fromRate.timestamp, toRate.timestamp)),
      isCrossRate: true,
      baseRates: { fromRate, toRate }
    };
  }

  // Hesap İşlemleri

  async executeAccountConversion(conversionRecord) {
    try {
      if (!this.accountManager) {
        throw new Error('Hesap yöneticisi yapılandırılmamış');
      }

      const {
        accountId,
        fromCurrency,
        toCurrency,
        originalAmount,
        convertedAmount,
        fees,
        id: conversionId
      } = conversionRecord;

      // Kaynak para biriminden düş
      await this.accountManager.debitBalance(accountId, fromCurrency, originalAmount, {
        type: 'currency_conversion_out',
        conversionId,
        toCurrency,
        description: `${fromCurrency} -> ${toCurrency} dönüştürme`
      });

      // Hedef para birimine ekle
      await this.accountManager.creditBalance(accountId, toCurrency, convertedAmount, {
        type: 'currency_conversion_in',
        conversionId,
        fromCurrency,
        description: `${fromCurrency} -> ${toCurrency} dönüştürme`
      });

      // Komisyon varsa düş
      if (fees > 0) {
        await this.accountManager.debitBalance(accountId, toCurrency, fees, {
          type: 'conversion_fee',
          conversionId,
          description: 'Döviz dönüştürme komisyonu'
        });
      }

      logger.info(`Hesap dönüştürme işlemi tamamlandı: ${conversionId}`);

    } catch (error) {
      logger.error('Hesap dönüştürme işlemi hatası:', error);
      throw error;
    }
  }

  // Geçmiş ve İstatistikler

  addToConversionHistory(userId, conversionRecord) {
    if (!this.conversionHistory.has(userId)) {
      this.conversionHistory.set(userId, []);
    }

    const userHistory = this.conversionHistory.get(userId);
    userHistory.push(conversionRecord);

    // Son 1000 işlemi tut
    if (userHistory.length > 1000) {
      userHistory.splice(0, userHistory.length - 1000);
    }

    this.conversionHistory.set(userId, userHistory);
  }

  getConversionHistory(userId, options = {}) {
    const {
      limit = 50,
      offset = 0,
      fromCurrency = null,
      toCurrency = null,
      startDate = null,
      endDate = null
    } = options;

    let history = this.conversionHistory.get(userId) || [];

    // Filtreleme
    if (fromCurrency) {
      history = history.filter(conv => conv.fromCurrency === fromCurrency);
    }

    if (toCurrency) {
      history = history.filter(conv => conv.toCurrency === toCurrency);
    }

    if (startDate) {
      history = history.filter(conv => new Date(conv.timestamp) >= new Date(startDate));
    }

    if (endDate) {
      history = history.filter(conv => new Date(conv.timestamp) <= new Date(endDate));
    }

    // Sıralama (en yeni önce)
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Sayfalama
    const total = history.length;
    const paginatedHistory = history.slice(offset, offset + limit);

    return {
      conversions: paginatedHistory,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    };
  }

  updateConversionStats(conversionRecord) {
    this.stats.totalConversions++;
    
    const { fromCurrency, toCurrency, originalAmount, convertedAmount, fees } = conversionRecord;
    const pairKey = `${fromCurrency}/${toCurrency}`;

    // Hacim istatistikleri
    this.stats.totalVolume[fromCurrency] = (this.stats.totalVolume[fromCurrency] || 0) + originalAmount;
    this.stats.totalVolume[toCurrency] = (this.stats.totalVolume[toCurrency] || 0) + convertedAmount;

    // Komisyon istatistikleri
    if (fees > 0) {
      this.stats.totalFees[toCurrency] = (this.stats.totalFees[toCurrency] || 0) + fees;
    }

    // Çift istatistikleri
    this.stats.conversionsByPair[pairKey] = (this.stats.conversionsByPair[pairKey] || 0) + 1;

    // Ortalama dönüştürme tutarı
    const totalConversions = this.stats.totalConversions;
    this.stats.averageConversionAmount = 
      (this.stats.averageConversionAmount * (totalConversions - 1) + originalAmount) / totalConversions;

    // Başarı oranı
    const totalAttempts = this.stats.totalConversions + this.stats.failedConversions;
    this.stats.successRate = totalAttempts > 0 ? (this.stats.totalConversions / totalAttempts) * 100 : 0;
  }

  // Yardımcı Metodlar

  validateConversionRequest(fromCurrency, toCurrency, amount) {
    if (!fromCurrency || !toCurrency) {
      throw new Error('Kaynak ve hedef para birimleri gerekli');
    }

    if (!this.config.supportedCurrencies.includes(fromCurrency)) {
      throw new Error(`Desteklenmeyen kaynak para birimi: ${fromCurrency}`);
    }

    if (!this.config.supportedCurrencies.includes(toCurrency)) {
      throw new Error(`Desteklenmeyen hedef para birimi: ${toCurrency}`);
    }

    if (typeof amount !== 'number' || amount <= 0) {
      throw new Error('Geçersiz dönüştürme tutarı');
    }

    if (amount < this.config.minConversionAmount) {
      throw new Error(`Minimum dönüştürme tutarı: ${this.config.minConversionAmount}`);
    }

    if (amount > this.config.maxConversionAmount) {
      throw new Error(`Maksimum dönüştürme tutarı: ${this.config.maxConversionAmount}`);
    }
  }

  roundAmount(amount, decimals = 2) {
    return Math.round(amount * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  clearRateCache() {
    this.rateCache.clear();
    this.lastRateUpdate.clear();
    logger.info('Döviz kuru önbelleği temizlendi');
  }

  // Konfigürasyon ve Yönetim

  updateConfiguration(newConfig) {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    this.emit('configurationUpdated', { oldConfig, newConfig });
    logger.info('Dönüştürme servisi konfigürasyonu güncellendi');
  }

  getConfiguration() {
    return {
      ...this.config,
      cacheSize: this.rateCache.size,
      supportedPairs: this.getSupportedCurrencyPairs()
    };
  }

  getSupportedCurrencyPairs() {
    const pairs = [];
    const currencies = this.config.supportedCurrencies;

    for (let i = 0; i < currencies.length; i++) {
      for (let j = 0; j < currencies.length; j++) {
        if (i !== j) {
          pairs.push(`${currencies[i]}/${currencies[j]}`);
        }
      }
    }

    return pairs;
  }

  getStatistics() {
    return {
      ...this.stats,
      cacheStats: {
        size: this.rateCache.size,
        hitRate: this.calculateCacheHitRate()
      },
      lastUpdated: new Date().toISOString()
    };
  }

  calculateCacheHitRate() {
    // Basit cache hit rate hesaplama
    // Gerçek uygulamada daha detaylı metrikler tutulabilir
    return this.rateCache.size > 0 ? 0.85 : 0; // Mock değer
  }

  // Sağlık Kontrolü

  async healthCheck() {
    const health = {
      status: 'healthy',
      rateProvider: {
        connected: !!this.rateProvider,
        status: 'unknown'
      },
      accountManager: {
        connected: !!this.accountManager,
        status: 'unknown'
      },
      cache: {
        size: this.rateCache.size,
        enabled: this.config.enableRateCache
      },
      stats: {
        totalConversions: this.stats.totalConversions,
        successRate: this.stats.successRate,
        failedConversions: this.stats.failedConversions
      }
    };

    // Rate provider sağlık kontrolü
    if (this.rateProvider && typeof this.rateProvider.healthCheck === 'function') {
      try {
        const providerHealth = await this.rateProvider.healthCheck();
        health.rateProvider.status = providerHealth.status;
      } catch (error) {
        health.rateProvider.status = 'unhealthy';
        health.rateProvider.error = error.message;
      }
    }

    // Account manager sağlık kontrolü
    if (this.accountManager && typeof this.accountManager.healthCheck === 'function') {
      try {
        const accountHealth = await this.accountManager.healthCheck();
        health.accountManager.status = accountHealth.status;
      } catch (error) {
        health.accountManager.status = 'unhealthy';
        health.accountManager.error = error.message;
      }
    }

    // Genel durum değerlendirmesi
    if (!this.rateProvider) {
      health.status = 'degraded';
      health.warnings = ['Rate provider yapılandırılmamış'];
    }

    if (this.stats.successRate < 95 && this.stats.totalConversions > 10) {
      health.status = 'degraded';
      health.warnings = health.warnings || [];
      health.warnings.push('Düşük başarı oranı');
    }

    return health;
  }
}

module.exports = CurrencyConversionService;