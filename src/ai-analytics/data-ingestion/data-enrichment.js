/**
 * Data Enrichment Module for Financial Transaction Data
 * Enhances transaction data with additional context and derived features
 */

const axios = require('axios');
const logger = require('../../utils/logger');

class DataEnricher {
  constructor(config = {}) {
    this.config = {
      enableGeocoding: config.enableGeocoding || false,
      enableMerchantLookup: config.enableMerchantLookup || false,
      enableCategoryMapping: config.enableCategoryMapping || true,
      geocodingApiKey: config.geocodingApiKey,
      merchantApiKey: config.merchantApiKey,
      cacheEnabled: config.cacheEnabled || true,
      cacheTtl: config.cacheTtl || 3600, // 1 hour
      ...config
    };

    // In-memory cache for enrichment data
    this.cache = new Map();
    
    // Merchant category mapping
    this.merchantCategories = new Map([
      ['mcdonalds', 'food'],
      ['starbucks', 'food'],
      ['walmart', 'shopping'],
      ['amazon', 'shopping'],
      ['uber', 'transportation'],
      ['shell', 'transportation'],
      ['netflix', 'entertainment'],
      ['spotify', 'entertainment']
    ]);

    // Category standardization mapping
    this.categoryMapping = new Map([
      ['restaurant', 'food'],
      ['gas station', 'transportation'],
      ['grocery', 'shopping'],
      ['supermarket', 'shopping'],
      ['pharmacy', 'healthcare'],
      ['hospital', 'healthcare'],
      ['movie', 'entertainment'],
      ['streaming', 'entertainment']
    ]);
  }

  async enrichTransactionData(transactionData) {
    try {
      let enrichedData = { ...transactionData };

      // Standardize and enrich merchant information
      enrichedData = await this.enrichMerchantData(enrichedData);

      // Enhance category information
      enrichedData = await this.enrichCategoryData(enrichedData);

      // Add location-based enrichment
      if (enrichedData.location) {
        enrichedData = await this.enrichLocationData(enrichedData);
      }

      // Add temporal enrichment
      enrichedData = await this.enrichTemporalData(enrichedData);

      // Add behavioral context
      enrichedData = await this.enrichBehavioralContext(enrichedData);

      // Add risk indicators
      enrichedData = await this.enrichRiskIndicators(enrichedData);

      // Add metadata
      enrichedData.enrichmentTimestamp = new Date().toISOString();
      enrichedData.enrichmentVersion = '1.0';

      return enrichedData;

    } catch (error) {
      logger.error('Data enrichment failed:', error);
      // Return original data with error flag
      return {
        ...transactionData,
        enrichmentError: error.message,
        enrichmentTimestamp: new Date().toISOString()
      };
    }
  }

  async enrichMerchantData(data) {
    const enriched = { ...data };
    
    if (!enriched.merchant) {
      return enriched;
    }

    const merchantKey = enriched.merchant.toLowerCase().trim();
    
    // Check cache first
    if (this.config.cacheEnabled) {
      const cached = this.getCachedData(`merchant:${merchantKey}`);
      if (cached) {
        return { ...enriched, ...cached };
      }
    }

    // Standardize merchant name
    enriched.merchantNormalized = this.normalizeMerchantName(enriched.merchant);
    
    // Detect merchant chain/brand
    enriched.merchantChain = this.detectMerchantChain(merchantKey);
    
    // Get merchant category from known mappings
    const knownCategory = this.merchantCategories.get(enriched.merchantChain || merchantKey);
    if (knownCategory && (!enriched.category || enriched.category === 'other')) {
      enriched.category = knownCategory;
      enriched.categorySource = 'merchant_mapping';
    }

    // External merchant lookup (if enabled)
    if (this.config.enableMerchantLookup && this.config.merchantApiKey) {
      try {
        const merchantInfo = await this.lookupMerchantInfo(enriched.merchant);
        if (merchantInfo) {
          enriched.merchantInfo = merchantInfo;
          if (merchantInfo.category) {
            enriched.category = merchantInfo.category;
            enriched.categorySource = 'external_api';
          }
        }
      } catch (error) {
        logger.warn('External merchant lookup failed:', error.message);
      }
    }

    // Cache the enrichment data
    if (this.config.cacheEnabled) {
      const cacheData = {
        merchantNormalized: enriched.merchantNormalized,
        merchantChain: enriched.merchantChain,
        merchantInfo: enriched.merchantInfo
      };
      this.setCachedData(`merchant:${merchantKey}`, cacheData);
    }

    return enriched;
  }

  async enrichCategoryData(data) {
    const enriched = { ...data };
    
    if (!enriched.category) {
      enriched.category = 'other';
    }

    // Normalize category
    const normalizedCategory = enriched.category.toLowerCase().trim();
    
    // Apply category mapping
    const mappedCategory = this.categoryMapping.get(normalizedCategory);
    if (mappedCategory) {
      enriched.categoryOriginal = enriched.category;
      enriched.category = mappedCategory;
      enriched.categorySource = 'mapping';
    }

    // Add category metadata
    enriched.categoryMetadata = this.getCategoryMetadata(enriched.category);

    return enriched;
  }

  async enrichLocationData(data) {
    const enriched = { ...data };
    
    if (!enriched.location || (!enriched.location.latitude && !enriched.location.address)) {
      return enriched;
    }

    const locationKey = enriched.location.latitude 
      ? `${enriched.location.latitude},${enriched.location.longitude}`
      : enriched.location.address;

    // Check cache
    if (this.config.cacheEnabled) {
      const cached = this.getCachedData(`location:${locationKey}`);
      if (cached) {
        enriched.locationEnriched = cached;
        return enriched;
      }
    }

    const locationEnrichment = {};

    // Reverse geocoding (if coordinates available)
    if (enriched.location.latitude && this.config.enableGeocoding) {
      try {
        const geocodeResult = await this.reverseGeocode(
          enriched.location.latitude, 
          enriched.location.longitude
        );
        
        if (geocodeResult) {
          locationEnrichment.address = geocodeResult.address;
          locationEnrichment.city = geocodeResult.city;
          locationEnrichment.state = geocodeResult.state;
          locationEnrichment.country = geocodeResult.country;
          locationEnrichment.postalCode = geocodeResult.postalCode;
          locationEnrichment.timezone = geocodeResult.timezone;
        }
      } catch (error) {
        logger.warn('Reverse geocoding failed:', error.message);
      }
    }

    // Add location-based insights
    locationEnrichment.locationType = this.determineLocationType(enriched.location, enriched.merchant);
    locationEnrichment.isInternational = this.isInternationalLocation(enriched.location);
    
    // Distance from user's home (if available)
    if (enriched.userHomeLocation) {
      locationEnrichment.distanceFromHome = this.calculateDistance(
        enriched.location,
        enriched.userHomeLocation
      );
    }

    enriched.locationEnriched = locationEnrichment;

    // Cache the result
    if (this.config.cacheEnabled) {
      this.setCachedData(`location:${locationKey}`, locationEnrichment);
    }

    return enriched;
  }

  async enrichTemporalData(data) {
    const enriched = { ...data };
    const timestamp = new Date(enriched.timestamp);

    enriched.temporalFeatures = {
      hour: timestamp.getHours(),
      dayOfWeek: timestamp.getDay(),
      dayOfMonth: timestamp.getDate(),
      month: timestamp.getMonth() + 1,
      quarter: Math.floor(timestamp.getMonth() / 3) + 1,
      year: timestamp.getFullYear(),
      
      // Derived temporal features
      isWeekend: [0, 6].includes(timestamp.getDay()),
      isBusinessHours: timestamp.getHours() >= 9 && timestamp.getHours() <= 17,
      isEarlyMorning: timestamp.getHours() >= 5 && timestamp.getHours() < 9,
      isEvening: timestamp.getHours() >= 18 && timestamp.getHours() <= 23,
      isLateNight: timestamp.getHours() >= 0 && timestamp.getHours() < 5,
      
      // Time periods
      timeOfDay: this.getTimeOfDay(timestamp.getHours()),
      dayType: this.getDayType(timestamp),
      season: this.getSeason(timestamp.getMonth() + 1),
      
      // Special dates
      isHoliday: await this.isHoliday(timestamp),
      isPayday: this.isPayday(timestamp),
      isMonthEnd: this.isMonthEnd(timestamp)
    };

    return enriched;
  }

  async enrichBehavioralContext(data) {
    const enriched = { ...data };
    
    // This would typically involve database queries to get user history
    // For now, we'll add placeholders that would be populated by the feature store
    
    enriched.behavioralContext = {
      // User spending patterns (to be populated by feature store)
      userAvgTransactionAmount: null,
      userMonthlySpending: null,
      userCategoryFrequency: null,
      userMerchantFrequency: null,
      
      // Transaction patterns
      isRecurring: this.detectRecurringTransaction(enriched),
      isUnusualAmount: null, // To be calculated with historical data
      isUnusualMerchant: null, // To be calculated with historical data
      isUnusualLocation: null, // To be calculated with historical data
      
      // Spending velocity
      recentTransactionCount: null, // To be populated
      dailySpendingTotal: null, // To be populated
      weeklySpendingTotal: null // To be populated
    };

    return enriched;
  }

  async enrichRiskIndicators(data) {
    const enriched = { ...data };
    
    enriched.riskIndicators = {
      // Amount-based risk
      isHighValue: enriched.amount > 1000,
      isVeryHighValue: enriched.amount > 10000,
      isRoundAmount: enriched.amount % 1 === 0 && enriched.amount >= 100,
      
      // Time-based risk
      isOffHours: enriched.temporalFeatures?.isLateNight || enriched.temporalFeatures?.isEarlyMorning,
      isWeekendTransaction: enriched.temporalFeatures?.isWeekend,
      
      // Location-based risk
      isInternational: enriched.locationEnriched?.isInternational || false,
      isFarFromHome: enriched.locationEnriched?.distanceFromHome > 100, // 100km
      
      // Merchant-based risk
      isNewMerchant: null, // To be calculated with historical data
      isSuspiciousMerchant: this.isSuspiciousMerchant(enriched.merchant),
      
      // Pattern-based risk
      isDuplicate: null, // To be calculated with recent transactions
      isVelocityAnomaly: null, // To be calculated with spending patterns
      
      // Overall risk score (to be calculated by risk engine)
      riskScore: null
    };

    return enriched;
  }

  // Helper methods

  normalizeMerchantName(merchant) {
    return merchant
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  detectMerchantChain(merchantName) {
    // Simple chain detection - can be enhanced with ML
    const chains = {
      'mcdonalds': ['mcdonald', 'mcd ', 'golden arches'],
      'starbucks': ['starbucks', 'sbux'],
      'walmart': ['walmart', 'wal-mart', 'wal mart'],
      'amazon': ['amazon', 'amzn'],
      'uber': ['uber'],
      'shell': ['shell']
    };

    for (const [chain, patterns] of Object.entries(chains)) {
      if (patterns.some(pattern => merchantName.includes(pattern))) {
        return chain;
      }
    }

    return null;
  }

  getCategoryMetadata(category) {
    const metadata = {
      food: { essential: true, discretionary: false, recurring: true },
      transportation: { essential: true, discretionary: false, recurring: true },
      utilities: { essential: true, discretionary: false, recurring: true },
      healthcare: { essential: true, discretionary: false, recurring: false },
      shopping: { essential: false, discretionary: true, recurring: false },
      entertainment: { essential: false, discretionary: true, recurring: false },
      travel: { essential: false, discretionary: true, recurring: false },
      other: { essential: false, discretionary: true, recurring: false }
    };

    return metadata[category] || metadata.other;
  }

  determineLocationType(location, merchant) {
    // Simple location type detection
    if (!location.address && !merchant) return 'unknown';
    
    const address = (location.address || '').toLowerCase();
    const merchantName = (merchant || '').toLowerCase();
    
    if (address.includes('airport') || merchantName.includes('airport')) return 'airport';
    if (address.includes('mall') || address.includes('shopping')) return 'shopping_center';
    if (merchantName.includes('gas') || merchantName.includes('fuel')) return 'gas_station';
    if (merchantName.includes('restaurant') || merchantName.includes('cafe')) return 'restaurant';
    
    return 'general';
  }

  isInternationalLocation(location) {
    // Simple international detection - would be enhanced with user's home country
    if (!location.country) return false;
    return location.country !== 'US'; // Assuming US as default
  }

  calculateDistance(location1, location2) {
    if (!location1.latitude || !location2.latitude) return null;
    
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(location2.latitude - location1.latitude);
    const dLon = this.toRad(location2.longitude - location1.longitude);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(location1.latitude)) * Math.cos(this.toRad(location2.latitude)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  getTimeOfDay(hour) {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  getDayType(date) {
    const day = date.getDay();
    if (day === 0 || day === 6) return 'weekend';
    return 'weekday';
  }

  getSeason(month) {
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'autumn';
    return 'winter';
  }

  async isHoliday(date) {
    // Simple holiday detection - can be enhanced
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    const holidays = [
      { month: 1, day: 1 },   // New Year
      { month: 7, day: 4 },   // Independence Day
      { month: 12, day: 25 }  // Christmas
    ];
    
    return holidays.some(h => h.month === month && h.day === day);
  }

  isPayday(date) {
    // Assume payday is 15th and last day of month
    const day = date.getDate();
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    
    return day === 15 || day === lastDay;
  }

  isMonthEnd(date) {
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return date.getDate() >= lastDay - 2; // Last 3 days of month
  }

  detectRecurringTransaction(data) {
    // Simple recurring detection - would be enhanced with historical analysis
    const amount = data.amount;
    const merchant = data.merchant || '';
    
    // Round amounts from known recurring merchants
    if (amount % 1 === 0 && merchant.toLowerCase().includes('netflix')) return true;
    if (amount % 1 === 0 && merchant.toLowerCase().includes('spotify')) return true;
    
    return false;
  }

  isSuspiciousMerchant(merchant) {
    if (!merchant) return false;
    
    const suspicious = ['test', 'dummy', 'fake', 'unknown', 'temp'];
    return suspicious.some(word => merchant.toLowerCase().includes(word));
  }

  async reverseGeocode(lat, lng) {
    // Placeholder for reverse geocoding API call
    // Would integrate with Google Maps, MapBox, etc.
    return null;
  }

  async lookupMerchantInfo(merchant) {
    // Placeholder for merchant lookup API
    return null;
  }

  // Cache management
  getCachedData(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.config.cacheTtl * 1000) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  setCachedData(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }
}

// Export enrichment function for direct use
async function enrichTransactionData(data, config = {}) {
  const enricher = new DataEnricher(config);
  return await enricher.enrichTransactionData(data);
}

module.exports = {
  DataEnricher,
  enrichTransactionData
};