/**
 * Exchange Rate Data Ingestion Pipeline
 * Handles real-time FX rate ingestion from multiple providers
 */

const axios = require('axios');
const EventEmitter = require('events');
const { Kafka } = require('kafkajs');
const WebSocket = require('ws');
const RedisRateCache = require('./redis-rate-cache');
const RateValidationEngine = require('./rate-validation-engine');
const logger = require('../../utils/logger');

class ExchangeRateIngestionPipeline extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      providers: config.providers || ['fxapi', 'exchangerate', 'currencylayer', 'reuters', 'bloomberg', 'oanda', 'fxcm'],
      updateInterval: config.updateInterval || 60000, // 1 minute
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 5000,
      timeout: config.timeout || 10000,
      baseCurrency: config.baseCurrency || 'USD',
      targetCurrencies: config.targetCurrencies || ['EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY'],
      enableStreaming: config.enableStreaming || true,
      enableKafka: config.enableKafka || true,
      kafkaConfig: config.kafkaConfig || {
        clientId: 'fx-rate-ingestion',
        brokers: ['localhost:9092'],
        topic: 'fx-rates'
      },
      qualityThreshold: config.qualityThreshold || 70,
      maxRateDeviation: config.maxRateDeviation || 0.1, // 10%
      ...config
    };

    // Provider configurations
    this.providerConfigs = {
      fxapi: {
        baseUrl: 'https://api.fxapi.com/v1',
        apiKey: process.env.FXAPI_KEY,
        rateLimit: 1000, // requests per month
        reliability: 0.95,
        supportsStreaming: false
      },
      exchangerate: {
        baseUrl: 'https://api.exchangerate-api.com/v4',
        apiKey: process.env.EXCHANGERATE_API_KEY,
        rateLimit: 1500,
        reliability: 0.90,
        supportsStreaming: false
      },
      currencylayer: {
        baseUrl: 'http://api.currencylayer.com',
        apiKey: process.env.CURRENCYLAYER_KEY,
        rateLimit: 1000,
        reliability: 0.85,
        supportsStreaming: false
      },
      reuters: {
        baseUrl: 'https://api.reuters.com/fx/v1',
        apiKey: process.env.REUTERS_API_KEY,
        rateLimit: 10000,
        reliability: 0.98,
        supportsStreaming: true,
        streamUrl: 'wss://stream.reuters.com/fx'
      },
      bloomberg: {
        baseUrl: 'https://api.bloomberg.com/fx/v1',
        apiKey: process.env.BLOOMBERG_API_KEY,
        rateLimit: 15000,
        reliability: 0.99,
        supportsStreaming: true,
        streamUrl: 'wss://stream.bloomberg.com/fx'
      },
      oanda: {
        baseUrl: 'https://api-fxtrade.oanda.com/v3',
        apiKey: process.env.OANDA_API_KEY,
        rateLimit: 5000,
        reliability: 0.92,
        supportsStreaming: true,
        streamUrl: 'wss://stream-fxtrade.oanda.com/v3/pricing/stream'
      },
      fxcm: {
        baseUrl: 'https://api.fxcm.com/v1',
        apiKey: process.env.FXCM_API_KEY,
        rateLimit: 3000,
        reliability: 0.88,
        supportsStreaming: true,
        streamUrl: 'wss://api.fxcm.com/socketio'
      }
    };

    this.isRunning = false;
    this.intervalId = null;
    this.lastUpdate = null;
    this.providerStats = {};
    this.rateCache = new Map();
    this.failureCount = 0;
    this.maxFailures = 5;
    this.streamConnections = new Map();
    this.kafkaProducer = null;
    this.kafka = null;
    this.rateValidationQueue = [];
    this.anomalyDetector = new RateAnomalyDetector();
    this.rateCache = new RedisRateCache(config.cache);
    this.validationEngine = new RateValidationEngine(config.validation);

    // Initialize provider stats
    this.config.providers.forEach(provider => {
      this.providerStats[provider] = {
        requests: 0,
        successes: 0,
        failures: 0,
        lastSuccess: null,
        lastFailure: null,
        avgResponseTime: 0,
        isHealthy: true
      };
    });

    // Set up validation engine event listeners
    this.validationEngine.on('anomalyDetected', (anomaly) => {
      logger.warn(`Rate anomaly detected:`, anomaly);
      this.emit('rateAnomaly', anomaly);
    });

    this.validationEngine.on('validationComplete', (results) => {
      this.emit('validationComplete', results);
    });

    this.validationEngine.on('validationError', (error) => {
      logger.error('Validation error:', error);
      this.emit('validationError', error);
    });
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Exchange rate ingestion pipeline is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting exchange rate ingestion pipeline...');

    // Initialize Redis cache
    await this.rateCache.connect();

    // Initialize Kafka if enabled
    if (this.config.enableKafka) {
      await this.initializeKafka();
    }

    // Initial fetch
    await this.fetchRates();

    // Set up periodic updates
    this.intervalId = setInterval(async () => {
      try {
        await this.fetchRates();
      } catch (error) {
        logger.error('Periodic rate fetch failed:', error);
        this.handleFailure(error);
      }
    }, this.config.updateInterval);

    // Set up streaming connections if enabled
    if (this.config.enableStreaming) {
      await this.initializeStreamingConnections();
    }

    this.emit('started');
    logger.info('Exchange rate ingestion pipeline started');
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Close streaming connections
    for (const [provider, connection] of this.streamConnections) {
      try {
        if (connection.readyState === WebSocket.OPEN) {
          connection.close();
        }
      } catch (error) {
        logger.warn(`Error closing stream connection for ${provider}:`, error);
      }
    }
    this.streamConnections.clear();

    // Disconnect Kafka
    if (this.kafkaProducer) {
      await this.kafkaProducer.disconnect();
      this.kafkaProducer = null;
    }

    // Disconnect Redis cache
    await this.rateCache.disconnect();

    this.emit('stopped');
    logger.info('Exchange rate ingestion pipeline stopped');
  }

  async fetchRates() {
    const startTime = Date.now();
    const results = [];

    // Fetch from all providers in parallel
    const fetchPromises = this.config.providers.map(provider => 
      this.fetchFromProvider(provider)
    );

    const providerResults = await Promise.allSettled(fetchPromises);

    // Process results
    for (let i = 0; i < providerResults.length; i++) {
      const provider = this.config.providers[i];
      const result = providerResults[i];

      if (result.status === 'fulfilled' && result.value) {
        results.push({
          provider,
          rates: result.value,
          timestamp: new Date(),
          success: true
        });
        this.updateProviderStats(provider, true, Date.now() - startTime);
      } else {
        logger.warn(`Failed to fetch rates from ${provider}:`, result.reason);
        this.updateProviderStats(provider, false);
      }
    }

    if (results.length === 0) {
      throw new Error('All rate providers failed');
    }

    // Validate and consolidate rates
    const consolidatedRates = this.consolidateRates(results);
    
    // Enhanced validation with comprehensive quality assurance
    const validationResults = await this.validationEngine.validateRates(consolidatedRates, {
      providers: results.map(r => r.provider),
      timestamp: new Date()
    });
    
    // Extract arbitrage opportunities from validation results
    const arbitrageOpportunities = validationResults.arbitrageOpportunities;
    
    // Update cache (both Redis and in-memory)
    await this.updateRateCache(consolidatedRates);
    
    // Publish to Kafka if enabled
    if (this.config.enableKafka) {
      await this.publishToKafka(consolidatedRates);
    }
    
    // Emit rate update event
    this.emit('ratesUpdated', {
      rates: consolidatedRates,
      timestamp: new Date(),
      providers: results.map(r => r.provider),
      totalProviders: this.config.providers.length,
      successfulProviders: results.length,
      validation: validationResults,
      qualityScore: validationResults.overall.qualityScore,
      arbitrageOpportunities
    });

    this.lastUpdate = new Date();
    this.failureCount = 0; // Reset failure count on success

    logger.debug(`Fetched rates from ${results.length}/${this.config.providers.length} providers`);
  }

  async fetchFromProvider(provider) {
    const config = this.providerConfigs[provider];
    if (!config) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const stats = this.providerStats[provider];
    stats.requests++;

    try {
      let rates;
      
      switch (provider) {
        case 'fxapi':
          rates = await this.fetchFromFxApi(config);
          break;
        case 'exchangerate':
          rates = await this.fetchFromExchangeRateApi(config);
          break;
        case 'currencylayer':
          rates = await this.fetchFromCurrencyLayer(config);
          break;
        case 'reuters':
          rates = await this.fetchFromReuters(config);
          break;
        case 'bloomberg':
          rates = await this.fetchFromBloomberg(config);
          break;
        case 'oanda':
          rates = await this.fetchFromOanda(config);
          break;
        case 'fxcm':
          rates = await this.fetchFromFxcm(config);
          break;
        default:
          throw new Error(`No implementation for provider: ${provider}`);
      }

      return this.normalizeRates(rates, provider);

    } catch (error) {
      stats.lastFailure = new Date();
      throw error;
    }
  }

  async fetchFromFxApi(config) {
    if (!config.apiKey) {
      throw new Error('FxApi API key not configured');
    }

    const response = await axios.get(`${config.baseUrl}/latest`, {
      params: {
        access_key: config.apiKey,
        base: this.config.baseCurrency,
        symbols: this.config.targetCurrencies.join(',')
      },
      timeout: this.config.timeout
    });

    if (!response.data.success) {
      throw new Error(`FxApi error: ${response.data.error?.info || 'Unknown error'}`);
    }

    return response.data.rates;
  }

  async fetchFromExchangeRateApi(config) {
    const response = await axios.get(
      `${config.baseUrl}/latest/${this.config.baseCurrency}`,
      { timeout: this.config.timeout }
    );

    if (!response.data.rates) {
      throw new Error('ExchangeRate-API: No rates in response');
    }

    // Filter to target currencies
    const filteredRates = {};
    this.config.targetCurrencies.forEach(currency => {
      if (response.data.rates[currency]) {
        filteredRates[currency] = response.data.rates[currency];
      }
    });

    return filteredRates;
  }

  async fetchFromCurrencyLayer(config) {
    if (!config.apiKey) {
      throw new Error('CurrencyLayer API key not configured');
    }

    const response = await axios.get(`${config.baseUrl}/live`, {
      params: {
        access_key: config.apiKey,
        source: this.config.baseCurrency,
        currencies: this.config.targetCurrencies.join(',')
      },
      timeout: this.config.timeout
    });

    if (!response.data.success) {
      throw new Error(`CurrencyLayer error: ${response.data.error?.info || 'Unknown error'}`);
    }

    // Convert CurrencyLayer format (USDEUR) to standard format (EUR)
    const normalizedRates = {};
    Object.entries(response.data.quotes).forEach(([key, value]) => {
      const currency = key.substring(3); // Remove base currency prefix
      if (this.config.targetCurrencies.includes(currency)) {
        normalizedRates[currency] = value;
      }
    });

    return normalizedRates;
  }

  async fetchFromReuters(config) {
    if (!config.apiKey) {
      throw new Error('Reuters API key not configured');
    }

    const response = await axios.get(`${config.baseUrl}/rates`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      params: {
        base: this.config.baseCurrency,
        symbols: this.config.targetCurrencies.join(','),
        format: 'json'
      },
      timeout: this.config.timeout
    });

    if (!response.data.rates) {
      throw new Error('Reuters: No rates in response');
    }

    return response.data.rates;
  }

  async fetchFromBloomberg(config) {
    if (!config.apiKey) {
      throw new Error('Bloomberg API key not configured');
    }

    const response = await axios.get(`${config.baseUrl}/rates`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'X-Bloomberg-Client': 'FinBot-v4'
      },
      params: {
        base_currency: this.config.baseCurrency,
        quote_currencies: this.config.targetCurrencies.join(','),
        include_bid_ask: true
      },
      timeout: this.config.timeout
    });

    if (!response.data.data) {
      throw new Error('Bloomberg: No data in response');
    }

    // Bloomberg returns more detailed data including bid/ask
    const rates = {};
    response.data.data.forEach(item => {
      rates[item.quote_currency] = {
        rate: item.mid_rate,
        bid: item.bid_rate,
        ask: item.ask_rate,
        spread: item.spread
      };
    });

    return rates;
  }

  async fetchFromOanda(config) {
    if (!config.apiKey) {
      throw new Error('OANDA API key not configured');
    }

    const instruments = this.config.targetCurrencies.map(currency => 
      `${this.config.baseCurrency}_${currency}`
    ).join(',');

    const response = await axios.get(`${config.baseUrl}/pricing`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      params: {
        instruments,
        includeUnitsAvailable: false
      },
      timeout: this.config.timeout
    });

    if (!response.data.prices) {
      throw new Error('OANDA: No prices in response');
    }

    const rates = {};
    response.data.prices.forEach(price => {
      const [base, quote] = price.instrument.split('_');
      if (base === this.config.baseCurrency) {
        rates[quote] = {
          rate: (parseFloat(price.bids[0].price) + parseFloat(price.asks[0].price)) / 2,
          bid: parseFloat(price.bids[0].price),
          ask: parseFloat(price.asks[0].price),
          spread: parseFloat(price.asks[0].price) - parseFloat(price.bids[0].price)
        };
      }
    });

    return rates;
  }

  async fetchFromFxcm(config) {
    if (!config.apiKey) {
      throw new Error('FXCM API key not configured');
    }

    const response = await axios.get(`${config.baseUrl}/rates`, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'User-Agent': 'FinBot-FX/1.0'
      },
      params: {
        base: this.config.baseCurrency,
        symbols: this.config.targetCurrencies.join(',')
      },
      timeout: this.config.timeout
    });

    if (!response.data.rates) {
      throw new Error('FXCM: No rates in response');
    }

    return response.data.rates;
  }

  normalizeRates(rates, provider) {
    const normalized = {};
    const timestamp = new Date();

    Object.entries(rates).forEach(([currency, rateData]) => {
      // Handle both simple rate values and complex rate objects
      if (typeof rateData === 'number') {
        normalized[currency] = {
          rate: parseFloat(rateData),
          provider,
          timestamp,
          pair: `${this.config.baseCurrency}/${currency}`
        };
      } else {
        // Complex rate object with bid/ask
        normalized[currency] = {
          rate: parseFloat(rateData.rate || rateData.mid || rateData.price),
          bid: rateData.bid ? parseFloat(rateData.bid) : null,
          ask: rateData.ask ? parseFloat(rateData.ask) : null,
          spread: rateData.spread ? parseFloat(rateData.spread) : null,
          provider,
          timestamp,
          pair: `${this.config.baseCurrency}/${currency}`
        };

        // Calculate spread if not provided but bid/ask are available
        if (!normalized[currency].spread && normalized[currency].bid && normalized[currency].ask) {
          normalized[currency].spread = normalized[currency].ask - normalized[currency].bid;
        }

        // Calculate mid rate if not provided but bid/ask are available
        if (!normalized[currency].rate && normalized[currency].bid && normalized[currency].ask) {
          normalized[currency].rate = (normalized[currency].bid + normalized[currency].ask) / 2;
        }
      }
    });

    return normalized;
  }

  consolidateRates(providerResults) {
    const consolidated = {};
    const ratesByCurrency = {};

    // Group rates by currency
    providerResults.forEach(result => {
      Object.entries(result.rates).forEach(([currency, rateData]) => {
        if (!ratesByCurrency[currency]) {
          ratesByCurrency[currency] = [];
        }
        ratesByCurrency[currency].push({
          ...rateData,
          provider: result.provider,
          reliability: this.providerConfigs[result.provider].reliability
        });
      });
    });

    // Calculate consolidated rate for each currency
    Object.entries(ratesByCurrency).forEach(([currency, rates]) => {
      consolidated[currency] = this.calculateConsolidatedRate(rates, currency);
    });

    return consolidated;
  }

  calculateConsolidatedRate(rates, currency) {
    if (rates.length === 1) {
      return {
        ...rates[0],
        qualityScore: 85, // Single provider gets moderate quality score
        providerCount: 1,
        rawRates: [{ provider: rates[0].provider, rate: rates[0].rate }]
      };
    }

    // Weighted average based on provider reliability
    let totalWeight = 0;
    let weightedSum = 0;
    let weightedBidSum = 0;
    let weightedAskSum = 0;
    let bidCount = 0;
    let askCount = 0;

    rates.forEach(rateData => {
      const weight = rateData.reliability;
      totalWeight += weight;
      weightedSum += rateData.rate * weight;

      if (rateData.bid) {
        weightedBidSum += rateData.bid * weight;
        bidCount++;
      }
      if (rateData.ask) {
        weightedAskSum += rateData.ask * weight;
        askCount++;
      }
    });

    const consolidatedRate = weightedSum / totalWeight;
    const consolidatedBid = bidCount > 0 ? weightedBidSum / totalWeight : null;
    const consolidatedAsk = askCount > 0 ? weightedAskSum / totalWeight : null;

    // Calculate spread (difference between highest and lowest rates)
    const rateValues = rates.map(r => r.rate);
    const minRate = Math.min(...rateValues);
    const maxRate = Math.max(...rateValues);
    const rateSpread = ((maxRate - minRate) / consolidatedRate) * 100; // Percentage spread

    // Calculate bid-ask spread if available
    const bidAskSpread = consolidatedBid && consolidatedAsk ? 
      ((consolidatedAsk - consolidatedBid) / consolidatedRate) * 10000 : null; // In basis points

    // Quality score based on agreement between providers and data completeness
    let qualityScore = Math.max(0, 100 - rateSpread * 10);
    
    // Bonus for having bid/ask data
    if (bidAskSpread !== null) {
      qualityScore = Math.min(100, qualityScore + 10);
    }

    // Bonus for multiple high-reliability providers
    const avgReliability = rates.reduce((sum, r) => sum + r.reliability, 0) / rates.length;
    qualityScore = Math.min(100, qualityScore + (avgReliability - 0.8) * 50);

    return {
      rate: consolidatedRate,
      bid: consolidatedBid,
      ask: consolidatedAsk,
      spread: rateSpread,
      bidAskSpread: bidAskSpread,
      qualityScore: Math.round(qualityScore),
      providers: rates.map(r => r.provider),
      providerCount: rates.length,
      timestamp: new Date(),
      pair: `${this.config.baseCurrency}/${currency}`,
      minRate,
      maxRate,
      avgReliability,
      rawRates: rates.map(r => ({ 
        provider: r.provider, 
        rate: r.rate,
        bid: r.bid,
        ask: r.ask,
        reliability: r.reliability
      }))
    };
  }

  async updateRateCache(rates) {
    try {
      // Prepare rates for caching
      const cacheRates = {};
      Object.entries(rates).forEach(([currency, rateData]) => {
        const cacheKey = `${this.config.baseCurrency}/${currency}`;
        cacheRates[cacheKey] = {
          ...rateData,
          cachedAt: new Date()
        };
      });

      // Update Redis cache (batch operation)
      await this.rateCache.setRates(cacheRates);

      // Update local in-memory cache
      Object.entries(cacheRates).forEach(([key, value]) => {
        this.rateCache.set(key, value);
      });

      logger.debug(`Updated cache with ${Object.keys(rates).length} rates`);
      
    } catch (error) {
      logger.error('Failed to update rate cache:', error);
      // Continue execution even if cache update fails
    }
  }

  updateProviderStats(provider, success, responseTime = null) {
    const stats = this.providerStats[provider];
    
    if (success) {
      stats.successes++;
      stats.lastSuccess = new Date();
      
      if (responseTime) {
        // Update average response time
        const totalRequests = stats.successes;
        stats.avgResponseTime = ((stats.avgResponseTime * (totalRequests - 1)) + responseTime) / totalRequests;
      }
      
      stats.isHealthy = true;
    } else {
      stats.failures++;
      stats.lastFailure = new Date();
      
      // Mark as unhealthy if failure rate is too high
      const failureRate = stats.failures / stats.requests;
      stats.isHealthy = failureRate < 0.5; // Less than 50% failure rate
    }
  }

  handleFailure(error) {
    this.failureCount++;
    
    if (this.failureCount >= this.maxFailures) {
      logger.error(`Too many consecutive failures (${this.failureCount}), stopping pipeline`);
      this.emit('criticalFailure', error);
      this.stop();
    } else {
      this.emit('failure', error);
    }
  }

  // Public API methods

  getLatestRates(currencies = null) {
    const targetCurrencies = currencies || this.config.targetCurrencies;
    const rates = {};

    targetCurrencies.forEach(currency => {
      const cacheKey = `${this.config.baseCurrency}/${currency}`;
      const cachedRate = this.rateCache.get(cacheKey);
      
      if (cachedRate) {
        rates[currency] = cachedRate;
      }
    });

    return {
      baseCurrency: this.config.baseCurrency,
      rates,
      lastUpdate: this.lastUpdate,
      cacheSize: this.rateCache.size
    };
  }

  async getRate(fromCurrency, toCurrency, options = {}) {
    try {
      // Direct rate
      const directKey = `${fromCurrency}/${toCurrency}`;
      let rate = await this.rateCache.getRate(directKey, options);
      
      if (rate) {
        return rate;
      }

      // Inverse rate
      const inverseKey = `${toCurrency}/${fromCurrency}`;
      rate = await this.rateCache.getRate(inverseKey, options);
      
      if (rate) {
        return {
          ...rate,
          rate: 1 / rate.rate,
          bid: rate.ask ? 1 / rate.ask : null,
          ask: rate.bid ? 1 / rate.bid : null,
          pair: directKey,
          isInverse: true
        };
      }

      // Cross rate through base currency
      if (fromCurrency !== this.config.baseCurrency && toCurrency !== this.config.baseCurrency) {
        const fromBaseKey = `${this.config.baseCurrency}/${fromCurrency}`;
        const toBaseKey = `${this.config.baseCurrency}/${toCurrency}`;
        
        const [fromBaseRate, toBaseRate] = await Promise.all([
          this.rateCache.getRate(fromBaseKey, options),
          this.rateCache.getRate(toBaseKey, options)
        ]);
        
        if (fromBaseRate && toBaseRate) {
          return {
            rate: toBaseRate.rate / fromBaseRate.rate,
            bid: (toBaseRate.bid && fromBaseRate.ask) ? toBaseRate.bid / fromBaseRate.ask : null,
            ask: (toBaseRate.ask && fromBaseRate.bid) ? toBaseRate.ask / fromBaseRate.bid : null,
            pair: directKey,
            isCrossRate: true,
            timestamp: new Date(Math.min(
              new Date(fromBaseRate.timestamp).getTime(), 
              new Date(toBaseRate.timestamp).getTime()
            )),
            qualityScore: Math.min(fromBaseRate.qualityScore || 0, toBaseRate.qualityScore || 0),
            providers: [...new Set([
              ...(fromBaseRate.providers || []), 
              ...(toBaseRate.providers || [])
            ])],
            sourceRates: { fromBase: fromBaseRate, toBase: toBaseRate }
          };
        }
      }

      return null;
      
    } catch (error) {
      logger.error(`Error getting rate for ${fromCurrency}/${toCurrency}:`, error);
      return null;
    }
  }

  async getProviderStats() {
    const cacheInfo = await this.rateCache.getCacheInfo();
    const validationStats = this.validationEngine.getValidationStats();
    
    return {
      providers: { ...this.providerStats },
      isRunning: this.isRunning,
      lastUpdate: this.lastUpdate,
      cache: cacheInfo,
      validation: validationStats,
      failureCount: this.failureCount,
      healthyProviders: Object.values(this.providerStats).filter(s => s.isHealthy).length,
      streamingConnections: this.streamConnections.size,
      kafkaEnabled: this.config.enableKafka && !!this.kafkaProducer
    };
  }

  // Rate alert management methods
  async setRateAlert(pair, threshold, direction = 'both', options = {}) {
    return await this.rateCache.setRateAlert(pair, threshold, direction, options);
  }

  async removeRateAlert(pair) {
    return await this.rateCache.deleteRate(`alert:${pair}`);
  }

  async getRateAlerts() {
    // This would typically query Redis for all alert configurations
    const cacheInfo = await this.rateCache.getCacheInfo();
    return {
      alertCount: cacheInfo.alertCount,
      // Additional alert details would be retrieved from Redis
    };
  }

  async validateRates(rates) {
    const validationResults = {};
    
    Object.entries(rates).forEach(([currency, rateData]) => {
      const validation = {
        isValid: true,
        warnings: [],
        errors: []
      };

      // Check rate value
      if (!rateData.rate || rateData.rate <= 0) {
        validation.isValid = false;
        validation.errors.push('Invalid rate value');
      }

      // Check for extreme rate changes (more than 10% from previous)
      const previousRate = this.getPreviousRate(currency);
      if (previousRate) {
        const changePercent = Math.abs((rateData.rate - previousRate.rate) / previousRate.rate) * 100;
        if (changePercent > 10) {
          validation.warnings.push(`Large rate change: ${changePercent.toFixed(2)}%`);
        }
      }

      // Check data freshness
      const dataAge = Date.now() - new Date(rateData.timestamp).getTime();
      if (dataAge > 5 * 60 * 1000) { // 5 minutes
        validation.warnings.push('Stale rate data');
      }

      // Check quality score
      if (rateData.qualityScore < 70) {
        validation.warnings.push('Low quality score');
      }

      validationResults[currency] = validation;
    });

    return validationResults;
  }

  getPreviousRate(currency) {
    // This would typically query a database for historical rates
    // For now, return null (no previous rate available)
    return null;
  }

  // Health check method
  async healthCheck() {
    const healthyProviders = Object.values(this.providerStats).filter(s => s.isHealthy).length;
    const totalProviders = this.config.providers.length;
    
    // Get cache health
    const cacheHealth = await this.rateCache.healthCheck();
    
    const status = {
      status: this.isRunning ? 'running' : 'stopped',
      isHealthy: healthyProviders > 0 && cacheHealth.status !== 'unhealthy',
      providers: {
        healthy: healthyProviders,
        total: totalProviders,
        healthPercentage: (healthyProviders / totalProviders) * 100
      },
      cache: cacheHealth,
      lastUpdate: this.lastUpdate,
      failureCount: this.failureCount,
      streaming: {
        connections: this.streamConnections.size,
        enabled: this.config.enableStreaming
      },
      kafka: {
        connected: !!this.kafkaProducer,
        enabled: this.config.enableKafka
      }
    };

    // Overall health assessment
    if (status.providers.healthPercentage < 50) {
      status.status = 'degraded';
      status.isHealthy = false;
    }

    if (this.failureCount >= this.maxFailures) {
      status.status = 'critical';
      status.isHealthy = false;
    }

    return status;
  }

  // Kafka integration methods
  async initializeKafka() {
    try {
      this.kafka = new Kafka(this.config.kafkaConfig);
      this.kafkaProducer = this.kafka.producer();
      await this.kafkaProducer.connect();
      logger.info('Kafka producer connected successfully');
    } catch (error) {
      logger.error('Failed to initialize Kafka:', error);
      this.config.enableKafka = false;
    }
  }

  async publishToKafka(rates) {
    if (!this.kafkaProducer || !this.config.enableKafka) {
      return;
    }

    try {
      const messages = Object.entries(rates).map(([currency, rateData]) => ({
        key: `${this.config.baseCurrency}/${currency}`,
        value: JSON.stringify({
          ...rateData,
          baseCurrency: this.config.baseCurrency,
          quoteCurrency: currency,
          publishedAt: new Date().toISOString()
        }),
        timestamp: Date.now().toString()
      }));

      await this.kafkaProducer.send({
        topic: this.config.kafkaConfig.topic,
        messages
      });

      logger.debug(`Published ${messages.length} rate updates to Kafka`);
    } catch (error) {
      logger.error('Failed to publish to Kafka:', error);
    }
  }

  // Streaming connection methods
  async initializeStreamingConnections() {
    const streamingProviders = this.config.providers.filter(provider => 
      this.providerConfigs[provider]?.supportsStreaming
    );

    for (const provider of streamingProviders) {
      try {
        await this.connectToStream(provider);
      } catch (error) {
        logger.warn(`Failed to connect to ${provider} stream:`, error);
      }
    }
  }

  async connectToStream(provider) {
    const config = this.providerConfigs[provider];
    if (!config.streamUrl) {
      return;
    }

    const ws = new WebSocket(config.streamUrl, {
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'User-Agent': 'FinBot-FX-Pipeline/1.0'
      }
    });

    ws.on('open', () => {
      logger.info(`Connected to ${provider} streaming API`);
      this.subscribeToRates(ws, provider);
    });

    ws.on('message', (data) => {
      try {
        this.handleStreamMessage(data, provider);
      } catch (error) {
        logger.error(`Error processing stream message from ${provider}:`, error);
      }
    });

    ws.on('error', (error) => {
      logger.error(`Stream error from ${provider}:`, error);
      this.updateProviderStats(provider, false);
    });

    ws.on('close', () => {
      logger.warn(`Stream connection closed for ${provider}`);
      this.streamConnections.delete(provider);
      
      // Attempt to reconnect after delay
      setTimeout(() => {
        if (this.isRunning) {
          this.connectToStream(provider);
        }
      }, this.config.retryDelay);
    });

    this.streamConnections.set(provider, ws);
  }

  subscribeToRates(ws, provider) {
    const subscriptionMessage = {
      action: 'subscribe',
      symbols: this.config.targetCurrencies.map(currency => 
        `${this.config.baseCurrency}/${currency}`
      )
    };

    ws.send(JSON.stringify(subscriptionMessage));
  }

  handleStreamMessage(data, provider) {
    const message = JSON.parse(data.toString());
    
    if (message.type === 'rate_update' && message.data) {
      const rateUpdate = this.normalizeStreamRate(message.data, provider);
      
      // Validate the rate
      if (this.validateSingleRate(rateUpdate)) {
        // Update cache immediately for streaming data
        this.updateSingleRate(rateUpdate);
        
        // Publish to Kafka
        if (this.config.enableKafka) {
          this.publishSingleRateToKafka(rateUpdate);
        }

        // Emit real-time update
        this.emit('streamRateUpdate', rateUpdate);
      }
    }
  }

  normalizeStreamRate(data, provider) {
    // This would be customized for each provider's stream format
    return {
      pair: data.symbol || data.pair,
      rate: parseFloat(data.rate || data.price),
      bid: parseFloat(data.bid),
      ask: parseFloat(data.ask),
      timestamp: new Date(data.timestamp || Date.now()),
      provider,
      isStreaming: true
    };
  }

  async validateSingleRate(rateData) {
    try {
      // Use the comprehensive validation engine
      const validation = await this.validationEngine.validateSingleRate(rateData.pair, rateData);
      
      // Log validation results
      if (!validation.isValid) {
        logger.warn(`Rate validation failed for ${rateData.pair}:`, validation.errors);
      }
      
      if (validation.warnings.length > 0) {
        logger.debug(`Rate validation warnings for ${rateData.pair}:`, validation.warnings);
      }

      // Add validation metadata to rate data
      rateData.validation = {
        isValid: validation.isValid,
        qualityScore: validation.qualityScore,
        anomalyScore: validation.anomalyScore,
        warnings: validation.warnings,
        errors: validation.errors
      };

      return validation.isValid;
      
    } catch (error) {
      logger.error(`Error validating rate for ${rateData.pair}:`, error);
      return false;
    }
  }

  async updateSingleRate(rateData) {
    try {
      const cacheKey = rateData.pair;
      const enrichedData = {
        ...rateData,
        cachedAt: new Date(),
        qualityScore: rateData.flagged ? 50 : 95 // Lower quality for flagged rates
      };

      await this.rateCache.setRate(cacheKey, enrichedData, {
        ttl: 60 // 1 minute TTL for streaming data
      });
      
    } catch (error) {
      logger.error(`Error updating single rate for ${rateData.pair}:`, error);
    }
  }

  async publishSingleRateToKafka(rateData) {
    if (!this.kafkaProducer) {
      return;
    }

    try {
      await this.kafkaProducer.send({
        topic: this.config.kafkaConfig.topic,
        messages: [{
          key: rateData.pair,
          value: JSON.stringify({
            ...rateData,
            publishedAt: new Date().toISOString()
          }),
          timestamp: Date.now().toString()
        }]
      });
    } catch (error) {
      logger.error('Failed to publish single rate to Kafka:', error);
    }
  }

  // Get validation statistics
  getValidationStats() {
    return this.validationEngine.getValidationStats();
  }

  // Get provider reliability scores
  getProviderReliability(provider = null) {
    if (provider) {
      return this.validationEngine.getProviderReliability(provider);
    }
    return this.validationEngine.getValidationStats().providerReliability;
  }

  // Update validation configuration
  updateValidationConfig(config) {
    this.validationEngine.updateConfig(config);
  }

  // Rate interpolation for missing data
  interpolateRate(fromCurrency, toCurrency, timestamp) {
    // Get historical rates around the timestamp
    const historicalRates = this.getHistoricalRates(fromCurrency, toCurrency, timestamp);
    
    if (historicalRates.length < 2) {
      return null;
    }

    // Linear interpolation
    const before = historicalRates.find(r => r.timestamp <= timestamp);
    const after = historicalRates.find(r => r.timestamp > timestamp);

    if (!before || !after) {
      return historicalRates[0]; // Return closest available rate
    }

    const timeDiff = after.timestamp - before.timestamp;
    const targetDiff = timestamp - before.timestamp;
    const ratio = targetDiff / timeDiff;

    const interpolatedRate = before.rate + (after.rate - before.rate) * ratio;

    return {
      rate: interpolatedRate,
      pair: `${fromCurrency}/${toCurrency}`,
      timestamp: new Date(timestamp),
      isInterpolated: true,
      interpolationMethod: 'linear',
      sourceRates: [before, after]
    };
  }

  getHistoricalRates(fromCurrency, toCurrency, aroundTimestamp, windowMinutes = 60) {
    // This would typically query TimescaleDB
    // For now, return empty array
    return [];
  }

  // Force validation of specific rates
  async forceValidation(rates) {
    return await this.validationEngine.validateRates(rates, {
      timestamp: new Date(),
      source: 'manual'
    });
  }

  // Clear validation history
  clearValidationHistory(pair = null) {
    this.validationEngine.clearHistory(pair);
  }
}

// Anomaly Detection Class
class RateAnomalyDetector {
  constructor() {
    this.historicalData = new Map();
    this.windowSize = 100; // Number of historical points to consider
  }

  detectAnomaly(currency, rateData) {
    const key = rateData.pair || currency;
    const history = this.historicalData.get(key) || [];
    
    if (history.length < 10) {
      // Not enough data for anomaly detection
      this.addToHistory(key, rateData);
      return 0;
    }

    // Calculate z-score
    const rates = history.map(h => h.rate);
    const mean = rates.reduce((a, b) => a + b) / rates.length;
    const variance = rates.reduce((a, b) => a + Math.pow(b - mean, 2)) / rates.length;
    const stdDev = Math.sqrt(variance);
    
    const zScore = Math.abs((rateData.rate - mean) / stdDev);
    
    // Add to history
    this.addToHistory(key, rateData);
    
    // Return anomaly score (0-1, where 1 is most anomalous)
    return Math.min(zScore / 3, 1); // Normalize to 0-1 range
  }

  addToHistory(key, rateData) {
    const history = this.historicalData.get(key) || [];
    history.push({
      rate: rateData.rate,
      timestamp: rateData.timestamp
    });

    // Keep only recent data
    if (history.length > this.windowSize) {
      history.shift();
    }

    this.historicalData.set(key, history);
  }
}

module.exports = ExchangeRateIngestionPipeline;