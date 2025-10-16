/**
 * FinBot v4 - Risk Assessment Engine
 * Advanced risk scoring and fraud detection system
 */

import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import { riskAssessments, approvalWorkflows } from '../db/approval-schema';
import { type TransactionContext } from './approval-rule-engine';

export interface RiskFactor {
  name: string;
  score: number;
  weight: number;
  description: string;
  category: 'amount' | 'time' | 'location' | 'behavior' | 'device' | 'velocity';
}

export interface FraudIndicator {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  confidence: number;
  metadata?: Record<string, any>;
}

export interface RiskAssessmentResult {
  overallScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: RiskFactor[];
  fraudIndicators: FraudIndicator[];
  recommendations: string[];
  assessmentMethod: 'rule_based' | 'ml_model' | 'hybrid';
  confidence: number;
  processingTime: number;
}

export interface RiskThresholds {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

export interface UserRiskProfile {
  userId: string;
  riskScore: number;
  transactionCount: number;
  averageAmount: number;
  suspiciousActivityCount: number;
  lastSuspiciousActivity?: Date;
  accountAge: number;
  verificationLevel: 'basic' | 'enhanced' | 'premium';
  trustScore: number;
}

export class RiskAssessmentEngine {
  private riskThresholds: RiskThresholds = {
    low: 25,
    medium: 50,
    high: 75,
    critical: 90
  };

  private riskWeights = {
    amount: 0.25,
    time: 0.10,
    location: 0.20,
    behavior: 0.15,
    device: 0.10,
    velocity: 0.20
  };

  /**
   * Perform comprehensive risk assessment
   */
  async assessRisk(transaction: TransactionContext): Promise<RiskAssessmentResult> {
    const startTime = Date.now();
    
    try {
      // Get user risk profile
      const userProfile = await this.getUserRiskProfile(transaction.userId);
      
      // Calculate individual risk factors
      const riskFactors = await this.calculateRiskFactors(transaction, userProfile);
      
      // Detect fraud indicators
      const fraudIndicators = await this.detectFraudIndicators(transaction, userProfile);
      
      // Calculate overall score
      const overallScore = this.calculateOverallScore(riskFactors, fraudIndicators);
      
      // Determine risk level
      const riskLevel = this.determineRiskLevel(overallScore);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(riskFactors, fraudIndicators, riskLevel);
      
      const processingTime = Date.now() - startTime;
      
      return {
        overallScore,
        riskLevel,
        riskFactors,
        fraudIndicators,
        recommendations,
        assessmentMethod: 'rule_based', // Would be 'hybrid' with ML integration
        confidence: this.calculateConfidence(riskFactors, fraudIndicators),
        processingTime
      };
      
    } catch (error) {
      console.error('Risk assessment error:', error);
      throw new Error(`Risk assessment failed: ${error.message}`);
    }
  }

  /**
   * Get user risk profile from historical data
   */
  private async getUserRiskProfile(userId: string): Promise<UserRiskProfile> {
    try {
      // Get user transaction history (last 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const userWorkflows = await db
        .select({
          workflow: approvalWorkflows,
          riskAssessment: riskAssessments
        })
        .from(approvalWorkflows)
        .leftJoin(riskAssessments, eq(riskAssessments.workflowId, approvalWorkflows.id))
        .where(
          and(
            eq(approvalWorkflows.requesterId, userId),
            gte(approvalWorkflows.createdAt, ninetyDaysAgo)
          )
        )
        .orderBy(desc(approvalWorkflows.createdAt));

      // Calculate profile metrics
      const transactionCount = userWorkflows.length;
      const totalRiskScore = userWorkflows.reduce((sum, item) => {
        return sum + (parseFloat(item.riskAssessment?.riskScore || '0'));
      }, 0);
      
      const averageRiskScore = transactionCount > 0 ? totalRiskScore / transactionCount : 0;
      
      // Count suspicious activities (high/critical risk)
      const suspiciousActivityCount = userWorkflows.filter(item => 
        item.riskAssessment?.riskLevel === 'high' || item.riskAssessment?.riskLevel === 'critical'
      ).length;

      // Find last suspicious activity
      const lastSuspiciousActivity = userWorkflows.find(item => 
        item.riskAssessment?.riskLevel === 'high' || item.riskAssessment?.riskLevel === 'critical'
      )?.workflow.createdAt;

      // Calculate trust score (inverse of risk)
      const trustScore = Math.max(0, 100 - averageRiskScore);

      return {
        userId,
        riskScore: averageRiskScore,
        transactionCount,
        averageAmount: 0, // Would calculate from actual transaction amounts
        suspiciousActivityCount,
        lastSuspiciousActivity,
        accountAge: 365, // Would calculate from user creation date
        verificationLevel: 'basic', // Would get from user profile
        trustScore
      };

    } catch (error) {
      console.error('Error getting user risk profile:', error);
      // Return default profile for new/unknown users
      return {
        userId,
        riskScore: 50, // Medium risk for unknown users
        transactionCount: 0,
        averageAmount: 0,
        suspiciousActivityCount: 0,
        accountAge: 0,
        verificationLevel: 'basic',
        trustScore: 50
      };
    }
  }

  /**
   * Calculate individual risk factors
   */
  private async calculateRiskFactors(
    transaction: TransactionContext, 
    userProfile: UserRiskProfile
  ): Promise<RiskFactor[]> {
    const factors: RiskFactor[] = [];

    // Amount-based risk
    const amountRisk = this.calculateAmountRisk(transaction.amount, userProfile);
    factors.push({
      name: 'Transaction Amount',
      score: amountRisk.score,
      weight: this.riskWeights.amount,
      description: amountRisk.description,
      category: 'amount'
    });

    // Time-based risk
    const timeRisk = this.calculateTimeRisk(transaction.timestamp);
    factors.push({
      name: 'Transaction Time',
      score: timeRisk.score,
      weight: this.riskWeights.time,
      description: timeRisk.description,
      category: 'time'
    });

    // Location-based risk
    const locationRisk = this.calculateLocationRisk(transaction.location, transaction.ipAddress);
    factors.push({
      name: 'Transaction Location',
      score: locationRisk.score,
      weight: this.riskWeights.location,
      description: locationRisk.description,
      category: 'location'
    });

    // Behavioral risk
    const behaviorRisk = this.calculateBehaviorRisk(transaction, userProfile);
    factors.push({
      name: 'User Behavior',
      score: behaviorRisk.score,
      weight: this.riskWeights.behavior,
      description: behaviorRisk.description,
      category: 'behavior'
    });

    // Device-based risk
    const deviceRisk = this.calculateDeviceRisk(transaction.deviceFingerprint, transaction.userAgent);
    factors.push({
      name: 'Device Security',
      score: deviceRisk.score,
      weight: this.riskWeights.device,
      description: deviceRisk.description,
      category: 'device'
    });

    // Velocity-based risk
    const velocityRisk = await this.calculateVelocityRisk(transaction, userProfile);
    factors.push({
      name: 'Transaction Velocity',
      score: velocityRisk.score,
      weight: this.riskWeights.velocity,
      description: velocityRisk.description,
      category: 'velocity'
    });

    return factors;
  }

  /**
   * Calculate amount-based risk
   */
  private calculateAmountRisk(amount: number, userProfile: UserRiskProfile): {
    score: number;
    description: string;
  } {
    let score = 0;
    let description = '';

    // Base amount risk
    if (amount < 1000) {
      score = 0;
      description = 'Low amount transaction';
    } else if (amount < 10000) {
      score = 10;
      description = 'Moderate amount transaction';
    } else if (amount < 50000) {
      score = 25;
      description = 'High amount transaction';
    } else if (amount < 100000) {
      score = 40;
      description = 'Very high amount transaction';
    } else {
      score = 60;
      description = 'Extremely high amount transaction';
    }

    // Adjust based on user's average transaction amount
    if (userProfile.averageAmount > 0) {
      const ratio = amount / userProfile.averageAmount;
      if (ratio > 10) {
        score += 30;
        description += ' - Significantly higher than user average';
      } else if (ratio > 5) {
        score += 20;
        description += ' - Much higher than user average';
      } else if (ratio > 2) {
        score += 10;
        description += ' - Higher than user average';
      }
    }

    return { score: Math.min(score, 100), description };
  }

  /**
   * Calculate time-based risk
   */
  private calculateTimeRisk(timestamp: Date): {
    score: number;
    description: string;
  } {
    const hour = timestamp.getHours();
    const day = timestamp.getDay();
    let score = 0;
    let description = '';

    // Hour-based risk
    if (hour >= 22 || hour < 6) {
      score += 25;
      description = 'Night time transaction (22:00-06:00)';
    } else if (hour >= 6 && hour < 8) {
      score += 10;
      description = 'Early morning transaction';
    } else if (hour >= 18 && hour < 22) {
      score += 5;
      description = 'Evening transaction';
    } else {
      description = 'Business hours transaction';
    }

    // Weekend risk
    if (day === 0 || day === 6) {
      score += 10;
      description += day === 0 ? ' on Sunday' : ' on Saturday';
    }

    return { score, description };
  }

  /**
   * Calculate location-based risk
   */
  private calculateLocationRisk(location?: any, ipAddress?: string): {
    score: number;
    description: string;
  } {
    let score = 0;
    let description = 'Location analysis';

    if (!location && !ipAddress) {
      score = 30;
      description = 'No location data available';
      return { score, description };
    }

    if (location) {
      // High-risk countries (simplified)
      const highRiskCountries = ['XX', 'YY']; // Would be actual country codes
      if (highRiskCountries.includes(location.country)) {
        score += 40;
        description = `Transaction from high-risk country: ${location.country}`;
      } else {
        description = `Transaction from ${location.country}`;
      }
    }

    // IP-based risk (would integrate with IP intelligence services)
    if (ipAddress) {
      // Check for VPN/Proxy indicators
      // This would use external services like MaxMind, IPQualityScore, etc.
      const isVpnOrProxy = false; // Placeholder
      if (isVpnOrProxy) {
        score += 25;
        description += ' - VPN/Proxy detected';
      }
    }

    return { score, description };
  }

  /**
   * Calculate behavioral risk
   */
  private calculateBehaviorRisk(transaction: TransactionContext, userProfile: UserRiskProfile): {
    score: number;
    description: string;
  } {
    let score = 0;
    let description = 'Behavioral analysis';

    // New user risk
    if (userProfile.transactionCount === 0) {
      score += 30;
      description = 'New user with no transaction history';
    } else if (userProfile.transactionCount < 5) {
      score += 20;
      description = 'User with limited transaction history';
    } else {
      description = 'Established user';
    }

    // Suspicious activity history
    if (userProfile.suspiciousActivityCount > 0) {
      score += userProfile.suspiciousActivityCount * 15;
      description += ` - ${userProfile.suspiciousActivityCount} previous suspicious activities`;
    }

    // Trust score adjustment
    const trustAdjustment = (100 - userProfile.trustScore) * 0.3;
    score += trustAdjustment;

    return { score: Math.min(score, 100), description };
  }

  /**
   * Calculate device-based risk
   */
  private calculateDeviceRisk(deviceFingerprint?: string, userAgent?: string): {
    score: number;
    description: string;
  } {
    let score = 0;
    let description = 'Device analysis';

    // Unknown device
    if (!deviceFingerprint) {
      score += 20;
      description = 'Unknown device';
    } else {
      description = 'Known device';
    }

    // Suspicious user agent
    if (userAgent) {
      const suspiciousPatterns = ['bot', 'crawler', 'automated', 'script', 'headless'];
      const isSuspicious = suspiciousPatterns.some(pattern => 
        userAgent.toLowerCase().includes(pattern)
      );
      
      if (isSuspicious) {
        score += 40;
        description += ' - Suspicious user agent detected';
      }
    }

    return { score, description };
  }

  /**
   * Calculate velocity-based risk
   */
  private async calculateVelocityRisk(
    transaction: TransactionContext, 
    userProfile: UserRiskProfile
  ): Promise<{ score: number; description: string }> {
    let score = 0;
    let description = 'Velocity analysis';

    try {
      // Check recent transaction frequency
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const [recentHourly, recentDaily] = await Promise.all([
        db.select({ count: sql`count(*)` })
          .from(approvalWorkflows)
          .where(
            and(
              eq(approvalWorkflows.requesterId, transaction.userId),
              gte(approvalWorkflows.createdAt, oneHourAgo)
            )
          ),
        
        db.select({ count: sql`count(*)` })
          .from(approvalWorkflows)
          .where(
            and(
              eq(approvalWorkflows.requesterId, transaction.userId),
              gte(approvalWorkflows.createdAt, oneDayAgo)
            )
          )
      ]);

      const hourlyCount = parseInt(recentHourly[0]?.count || '0');
      const dailyCount = parseInt(recentDaily[0]?.count || '0');

      // Hourly velocity risk
      if (hourlyCount > 10) {
        score += 50;
        description = `High velocity: ${hourlyCount} transactions in last hour`;
      } else if (hourlyCount > 5) {
        score += 30;
        description = `Moderate velocity: ${hourlyCount} transactions in last hour`;
      } else if (hourlyCount > 2) {
        score += 15;
        description = `Elevated velocity: ${hourlyCount} transactions in last hour`;
      } else {
        description = 'Normal transaction velocity';
      }

      // Daily velocity risk
      if (dailyCount > 50) {
        score += 30;
        description += ` - ${dailyCount} transactions today`;
      } else if (dailyCount > 20) {
        score += 15;
        description += ` - ${dailyCount} transactions today`;
      }

    } catch (error) {
      console.error('Velocity calculation error:', error);
      score = 10; // Default moderate risk if calculation fails
      description = 'Velocity analysis unavailable';
    }

    return { score: Math.min(score, 100), description };
  }

  /**
   * Detect fraud indicators
   */
  private async detectFraudIndicators(
    transaction: TransactionContext, 
    userProfile: UserRiskProfile
  ): Promise<FraudIndicator[]> {
    const indicators: FraudIndicator[] = [];

    // Amount-based indicators
    if (transaction.amount > 500000) {
      indicators.push({
        type: 'high_amount',
        severity: 'high',
        description: 'Transaction amount exceeds 500,000',
        confidence: 0.8
      });
    }

    // Time-based indicators
    const hour = transaction.timestamp.getHours();
    if (hour >= 2 && hour < 5) {
      indicators.push({
        type: 'unusual_time',
        severity: 'medium',
        description: 'Transaction during unusual hours (2-5 AM)',
        confidence: 0.6
      });
    }

    // Behavioral indicators
    if (userProfile.suspiciousActivityCount > 2) {
      indicators.push({
        type: 'repeat_offender',
        severity: 'high',
        description: 'User has multiple previous suspicious activities',
        confidence: 0.9,
        metadata: { count: userProfile.suspiciousActivityCount }
      });
    }

    // Device indicators
    if (!transaction.deviceFingerprint) {
      indicators.push({
        type: 'unknown_device',
        severity: 'medium',
        description: 'Transaction from unknown device',
        confidence: 0.7
      });
    }

    // Pattern-based indicators (would use ML models in production)
    if (this.detectAnomalousPattern(transaction, userProfile)) {
      indicators.push({
        type: 'anomalous_pattern',
        severity: 'high',
        description: 'Transaction pattern deviates significantly from user norm',
        confidence: 0.75
      });
    }

    return indicators;
  }

  /**
   * Detect anomalous patterns (simplified rule-based approach)
   */
  private detectAnomalousPattern(transaction: TransactionContext, userProfile: UserRiskProfile): boolean {
    // Check for significant deviation from user's normal behavior
    if (userProfile.averageAmount > 0) {
      const amountRatio = transaction.amount / userProfile.averageAmount;
      if (amountRatio > 20) return true; // 20x normal amount
    }

    // Check for rapid succession of transactions (would need recent transaction data)
    // This is a placeholder - would implement with actual transaction history

    return false;
  }

  /**
   * Calculate overall risk score
   */
  private calculateOverallScore(riskFactors: RiskFactor[], fraudIndicators: FraudIndicator[]): number {
    // Weighted sum of risk factors
    const factorScore = riskFactors.reduce((sum, factor) => {
      return sum + (factor.score * factor.weight);
    }, 0);

    // Fraud indicator penalty
    const fraudPenalty = fraudIndicators.reduce((sum, indicator) => {
      const severityMultiplier = {
        low: 5,
        medium: 15,
        high: 30,
        critical: 50
      };
      return sum + (severityMultiplier[indicator.severity] * indicator.confidence);
    }, 0);

    return Math.min(factorScore + fraudPenalty, 100);
  }

  /**
   * Determine risk level from score
   */
  private determineRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= this.riskThresholds.critical) return 'critical';
    if (score >= this.riskThresholds.high) return 'high';
    if (score >= this.riskThresholds.medium) return 'medium';
    return 'low';
  }

  /**
   * Generate recommendations based on risk assessment
   */
  private generateRecommendations(
    riskFactors: RiskFactor[], 
    fraudIndicators: FraudIndicator[], 
    riskLevel: string
  ): string[] {
    const recommendations: string[] = [];

    if (riskLevel === 'critical') {
      recommendations.push('Require manual review by senior approver');
      recommendations.push('Consider blocking transaction pending investigation');
      recommendations.push('Implement additional identity verification');
    } else if (riskLevel === 'high') {
      recommendations.push('Require additional approval level');
      recommendations.push('Request additional documentation');
      recommendations.push('Implement enhanced monitoring');
    } else if (riskLevel === 'medium') {
      recommendations.push('Standard approval process with monitoring');
      recommendations.push('Consider requesting transaction justification');
    }

    // Specific recommendations based on risk factors
    const highRiskFactors = riskFactors.filter(f => f.score * f.weight > 15);
    highRiskFactors.forEach(factor => {
      switch (factor.category) {
        case 'amount':
          recommendations.push('Verify transaction amount and purpose');
          break;
        case 'location':
          recommendations.push('Verify user location and identity');
          break;
        case 'device':
          recommendations.push('Implement device verification');
          break;
        case 'velocity':
          recommendations.push('Review recent transaction patterns');
          break;
      }
    });

    // Fraud indicator recommendations
    fraudIndicators.forEach(indicator => {
      if (indicator.severity === 'high' || indicator.severity === 'critical') {
        recommendations.push(`Address ${indicator.type}: ${indicator.description}`);
      }
    });

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(riskFactors: RiskFactor[], fraudIndicators: FraudIndicator[]): number {
    // Base confidence on data availability and quality
    let confidence = 0.7; // Base confidence

    // Increase confidence with more data points
    if (riskFactors.length >= 5) confidence += 0.1;
    if (fraudIndicators.length > 0) confidence += 0.1;

    // Decrease confidence for missing critical data
    const hasLocationData = riskFactors.some(f => f.category === 'location' && f.score > 0);
    const hasDeviceData = riskFactors.some(f => f.category === 'device' && f.score > 0);
    
    if (!hasLocationData) confidence -= 0.1;
    if (!hasDeviceData) confidence -= 0.1;

    return Math.max(0.3, Math.min(confidence, 1.0));
  }

  /**
   * Update risk thresholds
   */
  updateRiskThresholds(thresholds: Partial<RiskThresholds>) {
    this.riskThresholds = { ...this.riskThresholds, ...thresholds };
  }

  /**
   * Get current risk thresholds
   */
  getRiskThresholds(): RiskThresholds {
    return { ...this.riskThresholds };
  }

  /**
   * Batch assess multiple transactions
   */
  async batchAssessRisk(transactions: TransactionContext[]): Promise<RiskAssessmentResult[]> {
    const results = await Promise.all(
      transactions.map(transaction => this.assessRisk(transaction))
    );
    return results;
  }
}

// Export singleton instance
export const riskAssessmentEngine = new RiskAssessmentEngine();