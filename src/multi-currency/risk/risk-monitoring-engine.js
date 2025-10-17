/**
 * Risk Monitoring Engine
 * 
 * Provides real-time risk monitoring, threshold management, and alerting
 * for multi-currency portfolios and FX positions.
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class RiskMonitoringEngine extends EventEmitter {
    constructor(options = {}) {
        super();
        this.riskCalculator = options.riskCalculator;
        this.alertService = options.alertService;
        this.configService = options.configService;
        this.logger = options.logger || console;
        
        // Risk monitoring configuration
        this.monitoringInterval = options.monitoringInterval || 60000; // 1 minute
        this.alertCooldown = options.alertCooldown || 300000; // 5 minutes
        
        // Active monitoring state
        this.isMonitoring = false;
        this.monitoringTimer = null;
        this.lastAlerts = new Map(); // Track last alert times
        this.riskThresholds = new Map(); // User-specific thresholds
        
        // Risk breach tracking
        this.activeBreaches = new Map();
        this.breachHistory = [];
        
        this.initializeMonitoring();
    }

    /**
     * Initialize risk monitoring system
     */
    async initializeMonitoring() {
        try {
            await this.loadRiskThresholds();
            this.logger.info('Risk monitoring engine initialized');
        } catch (error) {
            this.logger.error('Failed to initialize risk monitoring:', error);
            throw error;
        }
    }

    /**
     * Start real-time risk monitoring
     */
    startMonitoring() {
        if (this.isMonitoring) {
            this.logger.warn('Risk monitoring already active');
            return;
        }

        this.isMonitoring = true;
        this.monitoringTimer = setInterval(
            () => this.performRiskCheck(),
            this.monitoringInterval
        );
        
        this.logger.info('Risk monitoring started');
        this.emit('monitoringStarted');
    }

    /**
     * Stop risk monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
        }
        
        this.logger.info('Risk monitoring stopped');
        this.emit('monitoringStopped');
    }

    /**
     * Set risk thresholds for a user
     */
    async setRiskThresholds(userId, thresholds) {
        try {
            const validatedThresholds = this.validateThresholds(thresholds);
            this.riskThresholds.set(userId, validatedThresholds);
            
            // Persist to database
            await this.configService.saveRiskThresholds(userId, validatedThresholds);
            
            this.logger.info(`Risk thresholds updated for user ${userId}`);
            this.emit('thresholdsUpdated', { userId, thresholds: validatedThresholds });
            
            return validatedThresholds;
        } catch (error) {
            this.logger.error(`Failed to set risk thresholds for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Get risk thresholds for a user
     */
    getRiskThresholds(userId) {
        return this.riskThresholds.get(userId) || this.getDefaultThresholds();
    }

    /**
     * Perform comprehensive risk check for all monitored users
     */
    async performRiskCheck() {
        try {
            const monitoredUsers = Array.from(this.riskThresholds.keys());
            
            for (const userId of monitoredUsers) {
                await this.checkUserRisk(userId);
            }
            
            this.emit('riskCheckCompleted', { 
                timestamp: new Date(),
                usersChecked: monitoredUsers.length 
            });
        } catch (error) {
            this.logger.error('Risk check failed:', error);
            this.emit('riskCheckFailed', error);
        }
    }

    /**
     * Check risk for a specific user
     */
    async checkUserRisk(userId) {
        try {
            const thresholds = this.getRiskThresholds(userId);
            const riskAssessment = await this.riskCalculator.calculateRisk(userId);
            
            // Check various risk metrics
            const breaches = [];
            
            // Portfolio VaR check
            if (riskAssessment.var95 > thresholds.maxVaR95) {
                breaches.push({
                    type: 'VAR_95_BREACH',
                    metric: 'VaR 95%',
                    current: riskAssessment.var95,
                    threshold: thresholds.maxVaR95,
                    severity: this.calculateSeverity(riskAssessment.var95, thresholds.maxVaR95)
                });
            }

            // Currency concentration check
            for (const exposure of riskAssessment.exposures) {
                const concentrationLimit = thresholds.maxCurrencyConcentration[exposure.currency] || 
                                         thresholds.defaultMaxConcentration;
                
                if (exposure.percentage > concentrationLimit) {
                    breaches.push({
                        type: 'CONCENTRATION_BREACH',
                        metric: `${exposure.currency} Concentration`,
                        current: exposure.percentage,
                        threshold: concentrationLimit,
                        currency: exposure.currency,
                        severity: this.calculateSeverity(exposure.percentage, concentrationLimit)
                    });
                }
            }

            // Correlation risk check
            if (riskAssessment.maxCorrelation > thresholds.maxCorrelation) {
                breaches.push({
                    type: 'CORRELATION_BREACH',
                    metric: 'Maximum Correlation',
                    current: riskAssessment.maxCorrelation,
                    threshold: thresholds.maxCorrelation,
                    severity: this.calculateSeverity(riskAssessment.maxCorrelation, thresholds.maxCorrelation)
                });
            }

            // Volatility check
            if (riskAssessment.portfolioVolatility > thresholds.maxVolatility) {
                breaches.push({
                    type: 'VOLATILITY_BREACH',
                    metric: 'Portfolio Volatility',
                    current: riskAssessment.portfolioVolatility,
                    threshold: thresholds.maxVolatility,
                    severity: this.calculateSeverity(riskAssessment.portfolioVolatility, thresholds.maxVolatility)
                });
            }

            // Process breaches
            if (breaches.length > 0) {
                await this.handleRiskBreaches(userId, breaches, riskAssessment);
            } else {
                await this.clearRiskBreaches(userId);
            }

            this.emit('userRiskChecked', { userId, breaches: breaches.length, riskAssessment });
            
        } catch (error) {
            this.logger.error(`Risk check failed for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Handle risk threshold breaches
     */
    async handleRiskBreaches(userId, breaches, riskAssessment) {
        const timestamp = new Date();
        
        for (const breach of breaches) {
            const breachId = `${userId}_${breach.type}_${breach.currency || 'portfolio'}`;
            
            // Check if this is a new breach or escalation
            const existingBreach = this.activeBreaches.get(breachId);
            const isNewBreach = !existingBreach;
            const isEscalation = existingBreach && breach.severity > existingBreach.severity;
            
            // Update active breach
            this.activeBreaches.set(breachId, {
                ...breach,
                userId,
                breachId,
                firstDetected: existingBreach?.firstDetected || timestamp,
                lastUpdated: timestamp,
                alertCount: (existingBreach?.alertCount || 0) + 1
            });

            // Send alert if new breach, escalation, or cooldown period passed
            const shouldAlert = isNewBreach || isEscalation || 
                               this.shouldSendAlert(userId, breach.type);

            if (shouldAlert) {
                await this.sendRiskAlert(userId, breach, riskAssessment);
                this.lastAlerts.set(`${userId}_${breach.type}`, timestamp);
            }

            // Record in breach history
            this.breachHistory.push({
                id: uuidv4(),
                userId,
                breach,
                riskAssessment: {
                    totalRisk: riskAssessment.totalRisk,
                    var95: riskAssessment.var95,
                    portfolioValue: riskAssessment.portfolioValue
                },
                timestamp,
                isNewBreach,
                isEscalation
            });
        }

        this.emit('riskBreachesDetected', { userId, breaches, timestamp });
    }

    /**
     * Clear risk breaches for a user
     */
    async clearRiskBreaches(userId) {
        const clearedBreaches = [];
        
        for (const [breachId, breach] of this.activeBreaches.entries()) {
            if (breach.userId === userId) {
                clearedBreaches.push(breach);
                this.activeBreaches.delete(breachId);
            }
        }

        if (clearedBreaches.length > 0) {
            await this.sendRiskClearAlert(userId, clearedBreaches);
            this.emit('riskBreachesCleared', { userId, clearedBreaches });
        }
    }

    /**
     * Send risk alert notification
     */
    async sendRiskAlert(userId, breach, riskAssessment) {
        try {
            const alert = {
                id: uuidv4(),
                userId,
                type: 'RISK_BREACH',
                severity: breach.severity,
                title: this.getAlertTitle(breach),
                message: this.getAlertMessage(breach, riskAssessment),
                data: {
                    breach,
                    riskAssessment: {
                        totalRisk: riskAssessment.totalRisk,
                        var95: riskAssessment.var95,
                        portfolioValue: riskAssessment.portfolioValue
                    }
                },
                timestamp: new Date(),
                channels: this.getAlertChannels(breach.severity)
            };

            await this.alertService.sendAlert(alert);
            
            this.logger.warn(`Risk alert sent for user ${userId}:`, {
                type: breach.type,
                severity: breach.severity,
                metric: breach.metric
            });

            this.emit('alertSent', alert);
            
        } catch (error) {
            this.logger.error(`Failed to send risk alert for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Send risk clear notification
     */
    async sendRiskClearAlert(userId, clearedBreaches) {
        try {
            const alert = {
                id: uuidv4(),
                userId,
                type: 'RISK_CLEAR',
                severity: 'INFO',
                title: 'Risk Thresholds Back to Normal',
                message: `${clearedBreaches.length} risk threshold(s) are now within acceptable limits.`,
                data: { clearedBreaches },
                timestamp: new Date(),
                channels: ['in_app']
            };

            await this.alertService.sendAlert(alert);
            this.emit('alertSent', alert);
            
        } catch (error) {
            this.logger.error(`Failed to send risk clear alert for user ${userId}:`, error);
        }
    }

    /**
     * Perform stress testing
     */
    async performStressTest(userId, scenarios) {
        try {
            const results = [];
            
            for (const scenario of scenarios) {
                const stressResult = await this.runStressScenario(userId, scenario);
                results.push(stressResult);
            }

            const stressTestReport = {
                id: uuidv4(),
                userId,
                scenarios: results,
                timestamp: new Date(),
                summary: this.generateStressTestSummary(results)
            };

            this.emit('stressTestCompleted', stressTestReport);
            return stressTestReport;
            
        } catch (error) {
            this.logger.error(`Stress test failed for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Run individual stress scenario
     */
    async runStressScenario(userId, scenario) {
        const currentRisk = await this.riskCalculator.calculateRisk(userId);
        
        // Apply scenario shocks to exchange rates
        const shockedRates = this.applyScenarioShocks(scenario);
        
        // Calculate risk under stressed conditions
        const stressedRisk = await this.riskCalculator.calculateRiskWithRates(
            userId, 
            shockedRates
        );

        return {
            scenario: scenario.name,
            description: scenario.description,
            shocks: scenario.shocks,
            currentRisk: {
                var95: currentRisk.var95,
                totalValue: currentRisk.portfolioValue
            },
            stressedRisk: {
                var95: stressedRisk.var95,
                totalValue: stressedRisk.portfolioValue
            },
            impact: {
                varChange: stressedRisk.var95 - currentRisk.var95,
                valueChange: stressedRisk.portfolioValue - currentRisk.portfolioValue,
                percentageChange: ((stressedRisk.portfolioValue - currentRisk.portfolioValue) / 
                                 currentRisk.portfolioValue) * 100
            }
        };
    }

    /**
     * Apply scenario shocks to exchange rates
     */
    applyScenarioShocks(scenario) {
        const shockedRates = new Map();
        
        for (const shock of scenario.shocks) {
            const { currencyPair, shockPercent } = shock;
            const currentRate = this.getCurrentRate(currencyPair);
            const shockedRate = currentRate * (1 + shockPercent / 100);
            shockedRates.set(currencyPair, shockedRate);
        }
        
        return shockedRates;
    }

    /**
     * Generate stress test summary
     */
    generateStressTestSummary(results) {
        const worstCase = results.reduce((worst, current) => 
            current.impact.valueChange < worst.impact.valueChange ? current : worst
        );

        const averageImpact = results.reduce((sum, result) => 
            sum + result.impact.valueChange, 0) / results.length;

        return {
            worstCaseScenario: worstCase.scenario,
            worstCaseImpact: worstCase.impact.valueChange,
            averageImpact,
            scenariosCount: results.length,
            riskLevel: this.assessOverallRiskLevel(results)
        };
    }

    /**
     * Validate risk thresholds
     */
    validateThresholds(thresholds) {
        const validated = { ...thresholds };
        
        // Ensure required thresholds exist
        if (!validated.maxVaR95 || validated.maxVaR95 <= 0) {
            throw new Error('Invalid maxVaR95 threshold');
        }
        
        if (!validated.maxVolatility || validated.maxVolatility <= 0) {
            throw new Error('Invalid maxVolatility threshold');
        }
        
        if (!validated.maxCorrelation || validated.maxCorrelation < 0 || validated.maxCorrelation > 1) {
            throw new Error('Invalid maxCorrelation threshold');
        }
        
        // Set defaults for optional thresholds
        validated.defaultMaxConcentration = validated.defaultMaxConcentration || 0.3;
        validated.maxCurrencyConcentration = validated.maxCurrencyConcentration || {};
        
        return validated;
    }

    /**
     * Get default risk thresholds
     */
    getDefaultThresholds() {
        return {
            maxVaR95: 0.05, // 5% VaR
            maxVolatility: 0.15, // 15% volatility
            maxCorrelation: 0.8, // 80% correlation
            defaultMaxConcentration: 0.3, // 30% concentration
            maxCurrencyConcentration: {
                'USD': 0.5,
                'EUR': 0.4,
                'GBP': 0.3,
                'JPY': 0.3
            }
        };
    }

    /**
     * Calculate breach severity
     */
    calculateSeverity(current, threshold) {
        const ratio = current / threshold;
        
        if (ratio >= 2.0) return 'CRITICAL';
        if (ratio >= 1.5) return 'HIGH';
        if (ratio >= 1.2) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * Check if alert should be sent based on cooldown
     */
    shouldSendAlert(userId, breachType) {
        const lastAlert = this.lastAlerts.get(`${userId}_${breachType}`);
        if (!lastAlert) return true;
        
        return (Date.now() - lastAlert.getTime()) > this.alertCooldown;
    }

    /**
     * Get alert title based on breach type
     */
    getAlertTitle(breach) {
        const titles = {
            'VAR_95_BREACH': 'Portfolio VaR Threshold Exceeded',
            'CONCENTRATION_BREACH': `${breach.currency} Concentration Risk Alert`,
            'CORRELATION_BREACH': 'High Correlation Risk Detected',
            'VOLATILITY_BREACH': 'Portfolio Volatility Alert'
        };
        
        return titles[breach.type] || 'Risk Threshold Breach';
    }

    /**
     * Get alert message
     */
    getAlertMessage(breach, riskAssessment) {
        return `${breach.metric} is ${breach.current.toFixed(4)} (${((breach.current / breach.threshold - 1) * 100).toFixed(1)}% above threshold of ${breach.threshold.toFixed(4)}). ` +
               `Current portfolio VaR: ${riskAssessment.var95.toFixed(4)}`;
    }

    /**
     * Get alert channels based on severity
     */
    getAlertChannels(severity) {
        const channels = ['in_app'];
        
        if (severity === 'HIGH' || severity === 'CRITICAL') {
            channels.push('email');
        }
        
        if (severity === 'CRITICAL') {
            channels.push('sms');
        }
        
        return channels;
    }

    /**
     * Load risk thresholds from database
     */
    async loadRiskThresholds() {
        try {
            const thresholds = await this.configService.loadAllRiskThresholds();
            
            for (const [userId, userThresholds] of Object.entries(thresholds)) {
                this.riskThresholds.set(userId, userThresholds);
            }
            
            this.logger.info(`Loaded risk thresholds for ${Object.keys(thresholds).length} users`);
        } catch (error) {
            this.logger.error('Failed to load risk thresholds:', error);
            throw error;
        }
    }

    /**
     * Get current exchange rate
     */
    getCurrentRate(currencyPair) {
        // This would integrate with the exchange rate engine
        // For now, return a mock rate
        return 1.0;
    }

    /**
     * Assess overall risk level from stress test results
     */
    assessOverallRiskLevel(results) {
        const maxLoss = Math.min(...results.map(r => r.impact.valueChange));
        const maxLossPercent = Math.min(...results.map(r => r.impact.percentageChange));
        
        if (maxLossPercent <= -20) return 'HIGH';
        if (maxLossPercent <= -10) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * Get monitoring status
     */
    getMonitoringStatus() {
        return {
            isActive: this.isMonitoring,
            monitoredUsers: this.riskThresholds.size,
            activeBreaches: this.activeBreaches.size,
            lastCheck: this.lastCheck,
            uptime: this.isMonitoring ? Date.now() - this.startTime : 0
        };
    }

    /**
     * Get risk breach history
     */
    getRiskBreachHistory(userId, options = {}) {
        let history = this.breachHistory.filter(entry => entry.userId === userId);
        
        if (options.startDate) {
            history = history.filter(entry => entry.timestamp >= options.startDate);
        }
        
        if (options.endDate) {
            history = history.filter(entry => entry.timestamp <= options.endDate);
        }
        
        if (options.breachType) {
            history = history.filter(entry => entry.breach.type === options.breachType);
        }
        
        return history.sort((a, b) => b.timestamp - a.timestamp);
    }
}

module.exports = RiskMonitoringEngine;