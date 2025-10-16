/**
 * FinBot v4 - Fraud Detection Service
 * Advanced fraud detection algorithms and pattern analysis
 */

import { eq, and, desc, gte, lte, sql, between } from 'drizzle-orm';
import { db } from '../db';
import { approvalWorkflows, riskAssessments } from '../db/approval-schema';
import { type TransactionContext } from './approval-rule-engine';
import { type UserRiskProfile } from './risk-assessment-engine';

export interface FraudPattern {
  id: string;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  indicators: string[];
  metadata?: Record<string, any>;
}

export interface VelocityCheck {
  timeWindow: string;
  transactionCount: number;
  totalAmount: number;
  threshold: {
    count: number;
    amount: number;
  };
  exceeded: boolean;
  riskScore: number;
}

export interface GeolocationAnalysis {
  currentLocation: {
    country: string;
    city: string;
    coordinates?: { lat: number; lng: number };
  };
  previousLocations: Array<{
    country: string;
    city: string;
    timestamp: Date;
    distance?: number;
  }>;
  impossibleTravel: boolean;
  riskScore: number;
  suspiciousMovement: boolean;
}

export interface DeviceFingerprint {
  id: string;
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  platform: string;
  plugins: string[];
  isKnown: boolean;
  riskScore: number;
  suspiciousAttributes: string[];
}

export interface FraudDetectionResult {
  isFraudulent: boolean;
  fraudScore: number;
  detectedPatterns: FraudPattern[];
  velocityChecks: VelocityCheck[];
  geolocationAnalysis?: GeolocationAnalysis;
  deviceAnalysis?: DeviceFingerprint;
  recommendations: string[];
  blockedReasons: string[];
  requiresManualReview: boolean;
}

export class FraudDetectionService {
  private fraudPatterns: Map<string, FraudPattern> = new Map();
  private velocityThresholds = {
    hourly: { count: 10, amount: 100000 },
    daily: { count: 50, amount: 1000000 },
    weekly: { count: 200, amount: 5000000 }
  };

  constructor() {
    this.initializeFraudPatterns();
  }

  /**
   * Initialize known fraud patterns
   */
  private initializeFraudPatterns() {
    const patterns: FraudPattern[] = [
      {
        id: 'rapid_succession',
        name: 'Rapid Succession Transactions',
        description: 'Multiple transactions in very short time period',
        severity: 'high',
        confidence: 0.8,
        indicators: ['high_velocity', 'short_intervals']
      },
      {
        id: 'round_amount_pattern',
        name: 'Round Amount Pattern',
        description: 'Suspicious pattern of round number transactions',
        severity: 'medium',
        confidence: 0.6,
        indicators: ['round_amounts', 'pattern_detected']
      },
      {
        id: 'impossible_travel',
        name: 'Impossible Travel',
        description: 'Transaction from geographically impossible location',
        severity: 'critical',
        confidence: 0.9,
        indicators: ['location_anomaly', 'travel_impossible']
      },
      {
        id: 'device_switching',
        name: 'Frequent Device Switching',
        description: 'Rapid switching between different devices',
        severity: 'high',
        confidence: 0.7,
        indicators: ['device_anomaly', 'multiple_devices']
      },
      {
        id: 'amount_structuring',
        name: 'Amount Structuring',
        description: 'Transactions structured to avoid detection thresholds',
        severity: 'high',
        confidence: 0.8,
        indicators: ['structured_amounts', 'threshold_avoidance']
      },
      {
        id: 'time_pattern_anomaly',
        name: 'Time Pattern Anomaly',
        description: 'Unusual transaction timing patterns',
        severity: 'medium',
        confidence: 0.6,
        indicators: ['time_anomaly', 'pattern_deviation']
      },
      {
        id: 'dormant_account_activation',
        name: 'Dormant Account Activation',
        description: 'Sudden activity on previously dormant account',
        severity: 'high',
        confidence: 0.7,
        indicators: ['dormant_account', 'sudden_activity']
      }
    ];

    patterns.forEach(pattern => {
      this.fraudPatterns.set(pattern.id, pattern);
    });
  }

  /**
   * Perform comprehensive fraud detection
   */
  async detectFraud(
    transaction: TransactionContext,
    userProfile: UserRiskProfile
  ): Promise<FraudDetectionResult> {
    try {
      // Perform various fraud detection checks
      const [
        detectedPatterns,
        velocityChecks,
        geolocationAnalysis,
        deviceAnalysis
      ] = await Promise.all([
        this.detectFraudPatterns(transaction, userProfile),
        this.performVelocityChecks(transaction),
        this.analyzeGeolocation(transaction),
        this.analyzeDevice(transaction)
      ]);

      // Calculate overall fraud score
      const fraudScore = this.calculateFraudScore(
        detectedPatterns,
        velocityChecks,
        geolocationAnalysis,
        deviceAnalysis
      );

      // Determine if transaction is fraudulent
      const isFraudulent = fraudScore >= 80 || 
        detectedPatterns.some(p => p.severity === 'critical') ||
        velocityChecks.some(v => v.exceeded && v.riskScore > 70);

      // Generate recommendations and blocked reasons
      const recommendations = this.generateRecommendations(
        detectedPatterns,
        velocityChecks,
        geolocationAnalysis,
        deviceAnalysis,
        fraudScore
      );

      const blockedReasons = this.generateBlockedReasons(
        detectedPatterns,
        velocityChecks,
        geolocationAnalysis,
        deviceAnalysis
      );

      const requiresManualReview = fraudScore >= 60 || 
        detectedPatterns.some(p => p.severity === 'high' || p.severity === 'critical');

      return {
        isFraudulent,
        fraudScore,
        detectedPatterns,
        velocityChecks,
        geolocationAnalysis,
        deviceAnalysis,
        recommendations,
        blockedReasons,
        requiresManualReview
      };

    } catch (error) {
      console.error('Fraud detection error:', error);
      throw new Error(`Fraud detection failed: ${error.message}`);
    }
  }

  /**
   * Detect fraud patterns in transaction
   */
  private async detectFraudPatterns(
    transaction: TransactionContext,
    userProfile: UserRiskProfile
  ): Promise<FraudPattern[]> {
    const detectedPatterns: FraudPattern[] = [];

    // Check for rapid succession pattern
    const rapidSuccession = await this.checkRapidSuccession(transaction);
    if (rapidSuccession) {
      detectedPatterns.push(this.fraudPatterns.get('rapid_succession')!);
    }

    // Check for round amount pattern
    const roundAmountPattern = this.checkRoundAmountPattern(transaction, userProfile);
    if (roundAmountPattern) {
      detectedPatterns.push(this.fraudPatterns.get('round_amount_pattern')!);
    }

    // Check for amount structuring
    const amountStructuring = await this.checkAmountStructuring(transaction);
    if (amountStructuring) {
      detectedPatterns.push(this.fraudPatterns.get('amount_structuring')!);
    }

    // Check for time pattern anomaly
    const timePatternAnomaly = this.checkTimePatternAnomaly(transaction, userProfile);
    if (timePatternAnomaly) {
      detectedPatterns.push(this.fraudPatterns.get('time_pattern_anomaly')!);
    }

    // Check for dormant account activation
    const dormantAccountActivation = this.checkDormantAccountActivation(userProfile);
    if (dormantAccountActivation) {
      detectedPatterns.push(this.fraudPatterns.get('dormant_account_activation')!);
    }

    return detectedPatterns;
  }

  /**
   * Check for rapid succession transactions
   */
  private async checkRapidSuccession(transaction: TransactionContext): Promise<boolean> {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const recentTransactions = await db
        .select({ count: sql`count(*)` })
        .from(approvalWorkflows)
        .where(
          and(
            eq(approvalWorkflows.requesterId, transaction.userId),
            gte(approvalWorkflows.createdAt, fiveMinutesAgo)
          )
        );

      const count = parseInt(recentTransactions[0]?.count || '0');
      return count >= 3; // 3 or more transactions in 5 minutes

    } catch (error) {
      console.error('Rapid succession check error:', error);
      return false;
    }
  }

  /**
   * Check for round amount patterns
   */
  private checkRoundAmountPattern(
    transaction: TransactionContext,
    userProfile: UserRiskProfile
  ): boolean {
    const amount = transaction.amount;
    
    // Check if amount is suspiciously round
    const isRound = amount % 1000 === 0 || amount % 10000 === 0;
    
    // Additional checks for pattern detection would go here
    // This is a simplified implementation
    
    return isRound && amount >= 10000;
  }

  /**
   * Check for amount structuring (avoiding detection thresholds)
   */
  private async checkAmountStructuring(transaction: TransactionContext): Promise<boolean> {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const recentTransactions = await db
        .select({
          workflow: approvalWorkflows
        })
        .from(approvalWorkflows)
        .where(
          and(
            eq(approvalWorkflows.requesterId, transaction.userId),
            gte(approvalWorkflows.createdAt, oneDayAgo)
          )
        );

      // Check for multiple transactions just below common thresholds
      const commonThresholds = [10000, 50000, 100000];
      
      for (const threshold of commonThresholds) {
        const nearThresholdTransactions = recentTransactions.filter(t => {
          // This would need actual transaction amount from metadata
          // For now, using a placeholder check
          return true; // Placeholder
        });

        if (nearThresholdTransactions.length >= 3) {
          return true;
        }
      }

      return false;

    } catch (error) {
      console.error('Amount structuring check error:', error);
      return false;
    }
  }

  /**
   * Check for time pattern anomalies
   */
  private checkTimePatternAnomaly(
    transaction: TransactionContext,
    userProfile: UserRiskProfile
  ): boolean {
    const hour = transaction.timestamp.getHours();
    const day = transaction.timestamp.getDay();

    // Check for unusual timing
    const isNightTime = hour >= 2 && hour < 5;
    const isWeekend = day === 0 || day === 6;
    
    // This would be more sophisticated with user's historical patterns
    return isNightTime && userProfile.transactionCount > 10;
  }

  /**
   * Check for dormant account activation
   */
  private checkDormantAccountActivation(userProfile: UserRiskProfile): boolean {
    // Check if account was dormant and suddenly became active
    const isDormant = userProfile.transactionCount === 0 || 
      (userProfile.lastSuspiciousActivity && 
       (Date.now() - userProfile.lastSuspiciousActivity.getTime()) > 90 * 24 * 60 * 60 * 1000);
    
    return isDormant && userProfile.accountAge > 365; // Old account, suddenly active
  }

  /**
   * Perform velocity checks
   */
  private async performVelocityChecks(transaction: TransactionContext): Promise<VelocityCheck[]> {
    const checks: VelocityCheck[] = [];

    try {
      // Hourly check
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const hourlyTransactions = await db
        .select({ count: sql`count(*)` })
        .from(approvalWorkflows)
        .where(
          and(
            eq(approvalWorkflows.requesterId, transaction.userId),
            gte(approvalWorkflows.createdAt, oneHourAgo)
          )
        );

      const hourlyCount = parseInt(hourlyTransactions[0]?.count || '0');
      checks.push({
        timeWindow: 'hourly',
        transactionCount: hourlyCount,
        totalAmount: 0, // Would calculate from actual amounts
        threshold: this.velocityThresholds.hourly,
        exceeded: hourlyCount > this.velocityThresholds.hourly.count,
        riskScore: Math.min((hourlyCount / this.velocityThresholds.hourly.count) * 100, 100)
      });

      // Daily check
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const dailyTransactions = await db
        .select({ count: sql`count(*)` })
        .from(approvalWorkflows)
        .where(
          and(
            eq(approvalWorkflows.requesterId, transaction.userId),
            gte(approvalWorkflows.createdAt, oneDayAgo)
          )
        );

      const dailyCount = parseInt(dailyTransactions[0]?.count || '0');
      checks.push({
        timeWindow: 'daily',
        transactionCount: dailyCount,
        totalAmount: 0, // Would calculate from actual amounts
        threshold: this.velocityThresholds.daily,
        exceeded: dailyCount > this.velocityThresholds.daily.count,
        riskScore: Math.min((dailyCount / this.velocityThresholds.daily.count) * 100, 100)
      });

      // Weekly check
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weeklyTransactions = await db
        .select({ count: sql`count(*)` })
        .from(approvalWorkflows)
        .where(
          and(
            eq(approvalWorkflows.requesterId, transaction.userId),
            gte(approvalWorkflows.createdAt, oneWeekAgo)
          )
        );

      const weeklyCount = parseInt(weeklyTransactions[0]?.count || '0');
      checks.push({
        timeWindow: 'weekly',
        transactionCount: weeklyCount,
        totalAmount: 0, // Would calculate from actual amounts
        threshold: this.velocityThresholds.weekly,
        exceeded: weeklyCount > this.velocityThresholds.weekly.count,
        riskScore: Math.min((weeklyCount / this.velocityThresholds.weekly.count) * 100, 100)
      });

    } catch (error) {
      console.error('Velocity check error:', error);
    }

    return checks;
  }

  /**
   * Analyze geolocation for fraud indicators
   */
  private async analyzeGeolocation(transaction: TransactionContext): Promise<GeolocationAnalysis | undefined> {
    if (!transaction.location) {
      return undefined;
    }

    try {
      // Get previous locations (would query from transaction history)
      const previousLocations = []; // Placeholder

      // Check for impossible travel
      const impossibleTravel = this.checkImpossibleTravel(
        transaction.location,
        previousLocations,
        transaction.timestamp
      );

      // Calculate risk score based on location factors
      let riskScore = 0;
      
      // High-risk countries
      const highRiskCountries = ['XX', 'YY']; // Would be actual country codes
      if (highRiskCountries.includes(transaction.location.country)) {
        riskScore += 40;
      }

      // Suspicious movement patterns
      const suspiciousMovement = this.detectSuspiciousMovement(
        transaction.location,
        previousLocations
      );

      if (suspiciousMovement) riskScore += 30;
      if (impossibleTravel) riskScore += 50;

      return {
        currentLocation: transaction.location,
        previousLocations,
        impossibleTravel,
        riskScore: Math.min(riskScore, 100),
        suspiciousMovement
      };

    } catch (error) {
      console.error('Geolocation analysis error:', error);
      return undefined;
    }
  }

  /**
   * Check for impossible travel between locations
   */
  private checkImpossibleTravel(
    currentLocation: any,
    previousLocations: any[],
    currentTime: Date
  ): boolean {
    if (previousLocations.length === 0) return false;

    const lastLocation = previousLocations[0];
    if (!lastLocation.coordinates || !currentLocation.coordinates) return false;

    // Calculate distance and time
    const distance = this.calculateDistance(
      lastLocation.coordinates,
      currentLocation.coordinates
    );

    const timeDiff = (currentTime.getTime() - lastLocation.timestamp.getTime()) / (1000 * 60 * 60); // hours
    const maxSpeed = 1000; // km/h (commercial aircraft speed)

    return distance > (maxSpeed * timeDiff);
  }

  /**
   * Detect suspicious movement patterns
   */
  private detectSuspiciousMovement(currentLocation: any, previousLocations: any[]): boolean {
    // Check for rapid location changes, unusual patterns, etc.
    // This is a simplified implementation
    return previousLocations.length > 3 && 
           previousLocations.every(loc => loc.country !== currentLocation.country);
  }

  /**
   * Analyze device fingerprint
   */
  private async analyzeDevice(transaction: TransactionContext): Promise<DeviceFingerprint | undefined> {
    if (!transaction.deviceFingerprint && !transaction.userAgent) {
      return undefined;
    }

    const suspiciousAttributes: string[] = [];
    let riskScore = 0;

    // Analyze user agent
    if (transaction.userAgent) {
      const suspiciousPatterns = ['bot', 'crawler', 'automated', 'script', 'headless', 'phantom'];
      const isSuspicious = suspiciousPatterns.some(pattern => 
        transaction.userAgent!.toLowerCase().includes(pattern)
      );

      if (isSuspicious) {
        suspiciousAttributes.push('suspicious_user_agent');
        riskScore += 40;
      }
    }

    // Check if device is known
    const isKnown = !!transaction.deviceFingerprint;
    if (!isKnown) {
      suspiciousAttributes.push('unknown_device');
      riskScore += 20;
    }

    return {
      id: transaction.deviceFingerprint || 'unknown',
      userAgent: transaction.userAgent || 'unknown',
      screenResolution: 'unknown', // Would extract from device fingerprint
      timezone: 'unknown',
      language: 'unknown',
      platform: 'unknown',
      plugins: [],
      isKnown,
      riskScore: Math.min(riskScore, 100),
      suspiciousAttributes
    };
  }

  /**
   * Calculate overall fraud score
   */
  private calculateFraudScore(
    patterns: FraudPattern[],
    velocityChecks: VelocityCheck[],
    geolocationAnalysis?: GeolocationAnalysis,
    deviceAnalysis?: DeviceFingerprint
  ): number {
    let score = 0;

    // Pattern-based score
    patterns.forEach(pattern => {
      const severityMultiplier = {
        low: 10,
        medium: 25,
        high: 40,
        critical: 60
      };
      score += severityMultiplier[pattern.severity] * pattern.confidence;
    });

    // Velocity-based score
    const maxVelocityScore = Math.max(...velocityChecks.map(v => v.riskScore), 0);
    score += maxVelocityScore * 0.3;

    // Geolocation-based score
    if (geolocationAnalysis) {
      score += geolocationAnalysis.riskScore * 0.4;
    }

    // Device-based score
    if (deviceAnalysis) {
      score += deviceAnalysis.riskScore * 0.2;
    }

    return Math.min(score, 100);
  }

  /**
   * Generate recommendations based on fraud analysis
   */
  private generateRecommendations(
    patterns: FraudPattern[],
    velocityChecks: VelocityCheck[],
    geolocationAnalysis?: GeolocationAnalysis,
    deviceAnalysis?: DeviceFingerprint,
    fraudScore?: number
  ): string[] {
    const recommendations: string[] = [];

    if (fraudScore && fraudScore >= 80) {
      recommendations.push('Block transaction immediately');
      recommendations.push('Initiate fraud investigation');
      recommendations.push('Contact user for verification');
    } else if (fraudScore && fraudScore >= 60) {
      recommendations.push('Require manual review');
      recommendations.push('Request additional verification');
      recommendations.push('Monitor user activity closely');
    }

    // Pattern-specific recommendations
    patterns.forEach(pattern => {
      switch (pattern.id) {
        case 'rapid_succession':
          recommendations.push('Implement transaction cooling-off period');
          break;
        case 'impossible_travel':
          recommendations.push('Verify user location and identity');
          break;
        case 'device_switching':
          recommendations.push('Require device verification');
          break;
        case 'amount_structuring':
          recommendations.push('Review transaction patterns for structuring');
          break;
      }
    });

    // Velocity-specific recommendations
    const exceededVelocity = velocityChecks.find(v => v.exceeded);
    if (exceededVelocity) {
      recommendations.push(`Implement ${exceededVelocity.timeWindow} transaction limits`);
      recommendations.push('Review transaction velocity patterns');
    }

    return [...new Set(recommendations)];
  }

  /**
   * Generate blocked reasons
   */
  private generateBlockedReasons(
    patterns: FraudPattern[],
    velocityChecks: VelocityCheck[],
    geolocationAnalysis?: GeolocationAnalysis,
    deviceAnalysis?: DeviceFingerprint
  ): string[] {
    const reasons: string[] = [];

    // Critical patterns
    const criticalPatterns = patterns.filter(p => p.severity === 'critical');
    criticalPatterns.forEach(pattern => {
      reasons.push(pattern.description);
    });

    // Velocity violations
    const exceededVelocity = velocityChecks.filter(v => v.exceeded);
    exceededVelocity.forEach(velocity => {
      reasons.push(`Exceeded ${velocity.timeWindow} transaction limit`);
    });

    // Geolocation issues
    if (geolocationAnalysis?.impossibleTravel) {
      reasons.push('Impossible travel detected');
    }

    // Device issues
    if (deviceAnalysis?.suspiciousAttributes.includes('suspicious_user_agent')) {
      reasons.push('Suspicious device or automation detected');
    }

    return reasons;
  }

  /**
   * Calculate distance between two coordinates
   */
  private calculateDistance(
    point1: { lat: number; lng: number },
    point2: { lat: number; lng: number }
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(point2.lat - point1.lat);
    const dLng = this.toRadians(point2.lng - point1.lng);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(point1.lat)) * Math.cos(this.toRadians(point2.lat)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Update velocity thresholds
   */
  updateVelocityThresholds(thresholds: Partial<typeof this.velocityThresholds>) {
    this.velocityThresholds = { ...this.velocityThresholds, ...thresholds };
  }

  /**
   * Add custom fraud pattern
   */
  addFraudPattern(pattern: FraudPattern) {
    this.fraudPatterns.set(pattern.id, pattern);
  }

  /**
   * Get fraud statistics
   */
  async getFraudStatistics(days: number = 30): Promise<{
    totalTransactions: number;
    fraudulentTransactions: number;
    fraudRate: number;
    topPatterns: Array<{ pattern: string; count: number }>;
    velocityViolations: number;
  }> {
    // This would query actual fraud detection results
    // Placeholder implementation
    return {
      totalTransactions: 0,
      fraudulentTransactions: 0,
      fraudRate: 0,
      topPatterns: [],
      velocityViolations: 0
    };
  }
}

// Export singleton instance
export const fraudDetectionService = new FraudDetectionService();