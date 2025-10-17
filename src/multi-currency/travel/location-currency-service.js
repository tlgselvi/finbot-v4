/**
 * Location-Based Currency Detection Service
 */

const { v4: uuidv4 } = require('uuid');

class LocationCurrencyService {
    constructor(options = {}) {
        this.geoLocationService = options.geoLocationService;
        this.currencyManager = options.currencyManager;
        this.logger = options.logger || console;
        
        this.countryToCurrency = new Map();
        this.locationHistory = new Map();
        this.travelItineraries = new Map();
        
        this.initializeCountryCurrencyMapping();
    }

    initializeCountryCurrencyMapping() {
        const mappings = [
            // Major economies
            { country: 'US', currency: 'USD', name: 'United States' },
            { country: 'GB', currency: 'GBP', name: 'United Kingdom' },
            { country: 'DE', currency: 'EUR', name: 'Germany' },
            { country: 'FR', currency: 'EUR', name: 'France' },
            { country: 'IT', currency: 'EUR', name: 'Italy' },
            { country: 'ES', currency: 'EUR', name: 'Spain' },
            { country: 'JP', currency: 'JPY', name: 'Japan' },
            { country: 'CN', currency: 'CNY', name: 'China' },
            { country: 'CA', currency: 'CAD', name: 'Canada' },
            { country: 'AU', currency: 'AUD', name: 'Australia' },
            { country: 'CH', currency: 'CHF', name: 'Switzerland' },
            { country: 'SE', currency: 'SEK', name: 'Sweden' },
            { country: 'NO', currency: 'NOK', name: 'Norway' },
            { country: 'DK', currency: 'DKK', name: 'Denmark' },
            { country: 'SG', currency: 'SGD', name: 'Singapore' },
            { country: 'HK', currency: 'HKD', name: 'Hong Kong' },
            { country: 'KR', currency: 'KRW', name: 'South Korea' },
            { country: 'IN', currency: 'INR', name: 'India' },
            { country: 'BR', currency: 'BRL', name: 'Brazil' },
            { country: 'MX', currency: 'MXN', name: 'Mexico' },
            { country: 'RU', currency: 'RUB', name: 'Russia' },
            { country: 'TR', currency: 'TRY', name: 'Turkey' },
            { country: 'ZA', currency: 'ZAR', name: 'South Africa' },
            { country: 'TH', currency: 'THB', name: 'Thailand' },
            { country: 'MY', currency: 'MYR', name: 'Malaysia' },
            { country: 'ID', currency: 'IDR', name: 'Indonesia' },
            { country: 'PH', currency: 'PHP', name: 'Philippines' },
            { country: 'VN', currency: 'VND', name: 'Vietnam' },
            { country: 'AE', currency: 'AED', name: 'UAE' },
            { country: 'SA', currency: 'SAR', name: 'Saudi Arabia' },
            { country: 'IL', currency: 'ILS', name: 'Israel' },
            { country: 'EG', currency: 'EGP', name: 'Egypt' },
            { country: 'NZ', currency: 'NZD', name: 'New Zealand' }
        ];

        mappings.forEach(mapping => {
            this.countryToCurrency.set(mapping.country, {
                currency: mapping.currency,
                name: mapping.name
            });
        });
    }

    async detectCurrencyFromLocation(userId, coordinates) {
        try {
            const location = await this.geoLocationService.reverseGeocode(
                coordinates.latitude, 
                coordinates.longitude
            );

            const countryCode = location.countryCode;
            const currencyInfo = this.countryToCurrency.get(countryCode);

            if (!currencyInfo) {
                this.logger.warn(`No currency mapping found for country: ${countryCode}`);
                return null;
            }

            const detection = {
                id: uuidv4(),
                userId,
                coordinates,
                location: {
                    country: location.country,
                    countryCode,
                    city: location.city,
                    region: location.region
                },
                currency: currencyInfo.currency,
                confidence: this.calculateDetectionConfidence(location),
                timestamp: new Date(),
                source: 'gps'
            };

            // Store location history
            this.updateLocationHistory(userId, detection);

            this.logger.info(`Currency detected: ${currencyInfo.currency} for location ${location.city}, ${location.country}`);
            return detection;

        } catch (error) {
            this.logger.error('Currency detection from location failed:', error);
            throw error;
        }
    }

    async detectCurrencyFromAddress(userId, address) {
        try {
            const location = await this.geoLocationService.geocode(address);
            return await this.detectCurrencyFromLocation(userId, {
                latitude: location.latitude,
                longitude: location.longitude
            });
        } catch (error) {
            this.logger.error('Currency detection from address failed:', error);
            throw error;
        }
    }

    async createTravelItinerary(userId, itineraryData) {
        const itinerary = {
            id: uuidv4(),
            userId,
            name: itineraryData.name,
            description: itineraryData.description || '',
            startDate: new Date(itineraryData.startDate),
            endDate: new Date(itineraryData.endDate),
            destinations: [],
            currencies: new Set(),
            recommendations: [],
            status: 'planned',
            createdAt: new Date()
        };

        // Process destinations
        for (const dest of itineraryData.destinations) {
            const destination = await this.processDestination(dest);
            itinerary.destinations.push(destination);
            itinerary.currencies.add(destination.currency);
        }

        // Generate currency recommendations
        itinerary.recommendations = await this.generateCurrencyRecommendations(itinerary);

        this.travelItineraries.set(itinerary.id, itinerary);
        return itinerary;
    }

    async processDestination(destinationData) {
        const destination = {
            id: uuidv4(),
            name: destinationData.name,
            country: destinationData.country,
            city: destinationData.city,
            arrivalDate: new Date(destinationData.arrivalDate),
            departureDate: new Date(destinationData.departureDate),
            currency: null,
            exchangeRate: null,
            estimatedBudget: destinationData.estimatedBudget || 0,
            activities: destinationData.activities || []
        };

        // Detect currency for destination
        if (destinationData.coordinates) {
            const detection = await this.detectCurrencyFromLocation(
                'system', 
                destinationData.coordinates
            );
            if (detection) {
                destination.currency = detection.currency;
            }
        } else if (destinationData.address) {
            const detection = await this.detectCurrencyFromAddress(
                'system', 
                destinationData.address
            );
            if (detection) {
                destination.currency = detection.currency;
            }
        }

        // Get exchange rate if currency detected
        if (destination.currency && this.currencyManager) {
            try {
                destination.exchangeRate = await this.currencyManager.getExchangeRate(
                    'USD', 
                    destination.currency
                );
            } catch (error) {
                this.logger.warn(`Failed to get exchange rate for ${destination.currency}`);
            }
        }

        return destination;
    }

    async generateCurrencyRecommendations(itinerary) {
        const recommendations = [];
        const currencies = Array.from(itinerary.currencies);

        // Multi-currency card recommendation
        if (currencies.length > 2) {
            recommendations.push({
                type: 'multi_currency_card',
                priority: 'high',
                title: 'Multi-Currency Travel Card Recommended',
                description: `Your itinerary involves ${currencies.length} currencies (${currencies.join(', ')}). Consider a multi-currency travel card to avoid multiple conversion fees.`,
                currencies: currencies,
                estimatedSavings: this.calculatePotentialSavings(itinerary, 'multi_currency_card')
            });
        }

        // Cash recommendations by destination
        for (const destination of itinerary.destinations) {
            const cashRecommendation = await this.generateCashRecommendation(destination);
            if (cashRecommendation) {
                recommendations.push(cashRecommendation);
            }
        }

        // Exchange timing recommendations
        const timingRecommendations = await this.generateExchangeTimingRecommendations(currencies);
        recommendations.push(...timingRecommendations);

        return recommendations;
    }

    async generateCashRecommendation(destination) {
        const cashPreferenceByCountry = {
            'JP': { preference: 'high', reason: 'Many places in Japan still prefer cash' },
            'DE': { preference: 'medium', reason: 'Germany has mixed cash/card usage' },
            'TH': { preference: 'high', reason: 'Street vendors and local markets prefer cash' },
            'IN': { preference: 'high', reason: 'Cash is widely preferred in India' },
            'CN': { preference: 'low', reason: 'Digital payments are dominant in China' },
            'SE': { preference: 'low', reason: 'Sweden is largely cashless' },
            'KR': { preference: 'low', reason: 'Card payments are widely accepted' }
        };

        const countryCode = this.getCountryCodeFromCurrency(destination.currency);
        const cashPref = cashPreferenceByCountry[countryCode];

        if (cashPref && cashPref.preference === 'high') {
            return {
                type: 'cash_recommendation',
                priority: 'medium',
                title: `Cash Recommended for ${destination.name}`,
                description: cashPref.reason,
                currency: destination.currency,
                suggestedAmount: this.calculateSuggestedCashAmount(destination),
                exchangeOptions: await this.findBestExchangeOptions(destination.currency)
            };
        }

        return null;
    }

    async generateExchangeTimingRecommendations(currencies) {
        const recommendations = [];

        for (const currency of currencies) {
            try {
                const volatility = await this.getCurrencyVolatility(currency);
                const trend = await this.getCurrencyTrend(currency);

                if (volatility > 0.15) { // High volatility
                    recommendations.push({
                        type: 'exchange_timing',
                        priority: 'medium',
                        title: `${currency} Exchange Timing Alert`,
                        description: `${currency} is showing high volatility (${(volatility * 100).toFixed(1)}%). Consider monitoring rates closely before exchanging.`,
                        currency,
                        volatility,
                        trend,
                        suggestion: trend > 0 ? 'Consider exchanging soon' : 'Consider waiting for better rates'
                    });
                }
            } catch (error) {
                this.logger.warn(`Failed to get volatility data for ${currency}`);
            }
        }

        return recommendations;
    }

    updateLocationHistory(userId, detection) {
        if (!this.locationHistory.has(userId)) {
            this.locationHistory.set(userId, []);
        }

        const history = this.locationHistory.get(userId);
        history.push(detection);

        // Keep only last 100 locations
        if (history.length > 100) {
            history.splice(0, history.length - 100);
        }
    }

    getLocationHistory(userId, limit = 50) {
        const history = this.locationHistory.get(userId) || [];
        return history.slice(-limit).reverse(); // Most recent first
    }

    getCurrentLocation(userId) {
        const history = this.locationHistory.get(userId) || [];
        return history.length > 0 ? history[history.length - 1] : null;
    }

    async getRecommendedCurrency(userId, context = {}) {
        const currentLocation = this.getCurrentLocation(userId);
        
        if (!currentLocation) {
            return {
                currency: context.baseCurrency || 'USD',
                reason: 'No location data available',
                confidence: 0.1
            };
        }

        // Check if user is traveling (multiple recent locations)
        const recentHistory = this.getLocationHistory(userId, 10);
        const uniqueCountries = new Set(recentHistory.map(loc => loc.location.countryCode));

        if (uniqueCountries.size > 1) {
            // User is traveling, recommend based on current location
            return {
                currency: currentLocation.currency,
                reason: `Currently in ${currentLocation.location.city}, ${currentLocation.location.country}`,
                confidence: currentLocation.confidence,
                travelMode: true,
                visitedCountries: Array.from(uniqueCountries)
            };
        } else {
            // User is in home location, use base currency or local currency
            return {
                currency: currentLocation.currency,
                reason: `Located in ${currentLocation.location.country}`,
                confidence: currentLocation.confidence,
                travelMode: false
            };
        }
    }

    calculateDetectionConfidence(location) {
        let confidence = 0.8; // Base confidence

        // Increase confidence based on location accuracy
        if (location.accuracy && location.accuracy < 100) {
            confidence += 0.1;
        }

        // Increase confidence if we have city information
        if (location.city) {
            confidence += 0.05;
        }

        // Increase confidence if we have detailed address
        if (location.address) {
            confidence += 0.05;
        }

        return Math.min(confidence, 1.0);
    }

    calculatePotentialSavings(itinerary, recommendationType) {
        // Simplified savings calculation
        const totalBudget = itinerary.destinations.reduce(
            (sum, dest) => sum + (dest.estimatedBudget || 0), 0
        );

        switch (recommendationType) {
            case 'multi_currency_card':
                return totalBudget * 0.02; // 2% savings on conversion fees
            case 'cash_exchange':
                return totalBudget * 0.01; // 1% savings on better rates
            default:
                return 0;
        }
    }

    calculateSuggestedCashAmount(destination) {
        const baseBudget = destination.estimatedBudget || 500;
        
        // Suggest 30-50% of budget in cash for high-cash countries
        return {
            min: baseBudget * 0.3,
            max: baseBudget * 0.5,
            currency: destination.currency
        };
    }

    async findBestExchangeOptions(currency) {
        // Mock exchange options - in real implementation, this would query actual services
        return [
            {
                provider: 'Local Bank',
                rate: 'Market rate + 2%',
                fees: 'Low',
                convenience: 'High'
            },
            {
                provider: 'Airport Exchange',
                rate: 'Market rate + 5%',
                fees: 'High',
                convenience: 'Very High'
            },
            {
                provider: 'Online Exchange',
                rate: 'Market rate + 1%',
                fees: 'Very Low',
                convenience: 'Medium'
            }
        ];
    }

    getCountryCodeFromCurrency(currency) {
        for (const [countryCode, info] of this.countryToCurrency) {
            if (info.currency === currency) {
                return countryCode;
            }
        }
        return null;
    }

    async getCurrencyVolatility(currency) {
        // Mock volatility calculation
        return Math.random() * 0.3; // 0-30% volatility
    }

    async getCurrencyTrend(currency) {
        // Mock trend calculation (-1 to 1, negative = weakening, positive = strengthening)
        return (Math.random() - 0.5) * 2;
    }

    getTravelItinerary(itineraryId) {
        return this.travelItineraries.get(itineraryId);
    }

    getUserItineraries(userId) {
        return Array.from(this.travelItineraries.values())
            .filter(itinerary => itinerary.userId === userId);
    }
}

module.exports = LocationCurrencyService;