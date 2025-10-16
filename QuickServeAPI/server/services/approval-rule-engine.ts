/**
 * FinBot v4 - Approval Rule Engine Service
 * Core business logic for evaluating approval rules and determining workflow requirements
 */

import { eq, and, desc, asc } from 'drizzle-orm';
import { db } from '../db';
import { approvalRules } from '../db/approval-schema';
import { 
  ApprovalRuleModel, 
  ApprovalHelpers,
  type TransactionType, 
  type UserRole,
  type ApprovalRule 
} from '../db/approval-models';

export interface TransactionContext {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  userId: string;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  location?: {
    country: string;
    city: string;
    coordinates?: { lat: number; lng: number };
  };
  deviceFingerprint?: string;
  userHistory?: {
    totalTransactions: number;
    averageAmount: number;
    lastTransactionDate: Date;
    suspiciousActivityCount: number;
  };
  metadata?: Record<string, any>;
}

export interface ApprovalRequirement {
  ruleId: string;
  ruleName: string;
  totalLevels: number;
  requiredRoles: UserRole[][];
  riskScore: number;
  additionalLevels: number;
  emergencyOverrideAllowed: boolean;
}

export interface RuleEvaluationResult {
  requiresApproval: boolean;
  matchedRule?: ApprovalRequirement;
  riskAssessment: {
    score: number;
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: Record<string, number>;
    fraudIndicators: string[];
  };
  autoApproved: boolean;
  reason: string;
}

export class ApprovalRuleEngine {
  /**
   * Evaluate transaction against all active approval rules
   */
  async evaluateTransaction(transaction: TransactionContext): Promise<RuleEvaluationResult> {
    try {
      // 1. Get all active rules for transaction type
      const activeRules = await this.getActiveRulesForTransaction(transaction);
      
      // 2. Calculate risk score
      const riskAssessment = this.calculateRiskAssessment(transaction);
      
      // 3. Find matching rule
      const matchedRule = this.findMatchingRule(activeRules, transaction);
      
      // 4. Determine if approval is required
      if (!matchedRule) {
        return {
          requiresApproval: false,
          riskAssessment,
          autoApproved: true,
          reason: 'No matching approval rule found - auto-approved'
        };
      }

      // 5. Check for auto-approval conditions
      const autoApprovalCheck = this.checkAutoApproval(matchedRule, riskAssessment, transaction);
      if (autoApprovalCheck.autoApprove) {
        return {
          requiresApproval: false,
          riskAssessment,
          autoApproved: true,
          reason: autoApprovalCheck.reason
        };
      }

      // 6. Build approval requirement
      const approvalRequirement = this.buildApprovalRequirement(matchedRule, riskAssessment);

      return {
        requiresApproval: true,
        matchedRule: approvalRequirement,
        riskAssessment,
        autoApproved: false,
        reason: `Approval required: ${approvalRequirement.totalLevels} level(s), Risk: ${riskAssessment.level}`
      };

    } catch (error) {
      console.error('Rule evaluation error:', error);
      throw new Error(`Failed to evaluate approval rules: ${error.message}`);
    }
  }

  /**
   * Get all active rules for a specific transaction type
   */
  private async getActiveRulesForTransaction(transaction: TransactionContext): Promise<ApprovalRule[]> {
    const rules = await db
      .select()
      .from(approvalRules)
      .where(
        and(
          eq(approvalRules.isActive, true),
          eq(approvalRules.transactionType, transaction.type),
          eq(approvalRules.currency, transaction.currency)
        )
      )
      .orderBy(asc(approvalRules.amountThreshold));

    return rules;
  }

  /**
   * Find the most appropriate rule for the transaction using priority system
   */
  private findMatchingRule(rules: ApprovalRule[], transaction: TransactionContext): ApprovalRule | null {
    // Find all rules that match the transaction
    const matchingRules = rules.filter(rule => {
      return this.evaluateRuleConditions(rule, transaction);
    });

    if (matchingRules.length === 0) {
      return null;
    }

    // If multiple rules match, use priority system
    if (matchingRules.length > 1) {
      return this.selectRuleByPriority(matchingRules, transaction);
    }

    return matchingRules[0];
  }

  /**
   * Evaluate all rule conditions including complex time and location-based rules
   */
  private evaluateRuleConditions(rule: ApprovalRule, transaction: TransactionContext): boolean {
    const ruleModel = new ApprovalRuleModel(rule);
    
    // Basic amount and type matching
    const basicMatch = ruleModel.matches({
      type: transaction.type,
      amount: transaction.amount,
      currency: transaction.currency
    });

    if (!basicMatch) {
      return false;
    }

    // Evaluate complex conditions if they exist
    if (rule.conditions && Object.keys(rule.conditions).length > 0) {
      return this.evaluateComplexConditions(rule.conditions, transaction);
    }

    return true;
  }

  /**
   * Evaluate complex conditions (time-based, location-based, etc.)
   */
  private evaluateComplexConditions(conditions: any, transaction: TransactionContext): boolean {
    // Time-based conditions
    if (conditions.timeRestrictions) {
      if (!this.evaluateTimeConditions(conditions.timeRestrictions, transaction.timestamp)) {
        return false;
      }
    }

    // Location-based conditions
    if (conditions.locationRestrictions) {
      if (!this.evaluateLocationConditions(conditions.locationRestrictions, transaction.location)) {
        return false;
      }
    }

    // User history conditions
    if (conditions.userHistoryRequirements) {
      if (!this.evaluateUserHistoryConditions(conditions.userHistoryRequirements, transaction.userHistory)) {
        return false;
      }
    }

    // Device-based conditions
    if (conditions.deviceRestrictions) {
      if (!this.evaluateDeviceConditions(conditions.deviceRestrictions, transaction)) {
        return false;
      }
    }

    // Amount velocity conditions
    if (conditions.velocityLimits) {
      if (!this.evaluateVelocityConditions(conditions.velocityLimits, transaction)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate time-based conditions
   */
  private evaluateTimeConditions(timeRestrictions: any, timestamp: Date): boolean {
    const hour = timestamp.getHours();
    const day = timestamp.getDay();
    const date = timestamp.getDate();
    const month = timestamp.getMonth();

    // Business hours restriction
    if (timeRestrictions.businessHoursOnly) {
      if (hour < 8 || hour > 18) {
        return false;
      }
    }

    // Weekday restriction
    if (timeRestrictions.weekdaysOnly) {
      if (day === 0 || day === 6) { // Sunday or Saturday
        return false;
      }
    }

    // Specific hour ranges
    if (timeRestrictions.allowedHours) {
      const allowedHours = timeRestrictions.allowedHours as number[];
      if (!allowedHours.includes(hour)) {
        return false;
      }
    }

    // Holiday restrictions (simplified - would need holiday calendar integration)
    if (timeRestrictions.excludeHolidays) {
      // This would check against a holiday calendar
      // For now, just exclude common holidays
      if (month === 0 && date === 1) return false; // New Year
      if (month === 11 && date === 25) return false; // Christmas
    }

    return true;
  }

  /**
   * Evaluate location-based conditions
   */
  private evaluateLocationConditions(locationRestrictions: any, location?: any): boolean {
    if (!location) {
      return !locationRestrictions.requireLocation;
    }

    // Country restrictions
    if (locationRestrictions.allowedCountries) {
      const allowedCountries = locationRestrictions.allowedCountries as string[];
      if (!allowedCountries.includes(location.country)) {
        return false;
      }
    }

    // Blocked countries
    if (locationRestrictions.blockedCountries) {
      const blockedCountries = locationRestrictions.blockedCountries as string[];
      if (blockedCountries.includes(location.country)) {
        return false;
      }
    }

    // Geographic radius restrictions
    if (locationRestrictions.allowedRadius && location.coordinates) {
      const centerPoint = locationRestrictions.centerPoint;
      const maxRadius = locationRestrictions.allowedRadius;
      
      if (centerPoint && maxRadius) {
        const distance = this.calculateDistance(
          location.coordinates,
          centerPoint
        );
        
        if (distance > maxRadius) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Evaluate user history conditions
   */
  private evaluateUserHistoryConditions(historyRequirements: any, userHistory?: any): boolean {
    if (!userHistory) {
      return !historyRequirements.requireHistory;
    }

    // Minimum transaction count
    if (historyRequirements.minTransactions) {
      if (userHistory.totalTransactions < historyRequirements.minTransactions) {
        return false;
      }
    }

    // Maximum suspicious activity count
    if (historyRequirements.maxSuspiciousActivity !== undefined) {
      if (userHistory.suspiciousActivityCount > historyRequirements.maxSuspiciousActivity) {
        return false;
      }
    }

    // Account age requirement
    if (historyRequirements.minAccountAge && userHistory.lastTransactionDate) {
      const daysSinceFirst = Math.floor(
        (Date.now() - userHistory.lastTransactionDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysSinceFirst < historyRequirements.minAccountAge) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate device-based conditions
   */
  private evaluateDeviceConditions(deviceRestrictions: any, transaction: TransactionContext): boolean {
    // Known device requirement
    if (deviceRestrictions.requireKnownDevice && !transaction.deviceFingerprint) {
      return false;
    }

    // User agent restrictions
    if (deviceRestrictions.blockedUserAgents && transaction.userAgent) {
      const blockedPatterns = deviceRestrictions.blockedUserAgents as string[];
      for (const pattern of blockedPatterns) {
        if (transaction.userAgent.includes(pattern)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Evaluate velocity conditions (transaction frequency/amount limits)
   */
  private evaluateVelocityConditions(velocityLimits: any, transaction: TransactionContext): boolean {
    // This would typically query recent transaction history
    // For now, return true as we'd need to implement transaction history lookup
    
    // Daily amount limit
    if (velocityLimits.dailyAmountLimit) {
      // Would check sum of transactions in last 24 hours
    }

    // Hourly transaction count limit
    if (velocityLimits.hourlyTransactionLimit) {
      // Would check count of transactions in last hour
    }

    // Weekly amount limit
    if (velocityLimits.weeklyAmountLimit) {
      // Would check sum of transactions in last 7 days
    }

    return true; // Placeholder - implement with actual transaction history
  }

  /**
   * Select rule by priority when multiple rules match
   */
  private selectRuleByPriority(matchingRules: ApprovalRule[], transaction: TransactionContext): ApprovalRule {
    // Priority system:
    // 1. Most specific amount threshold (highest threshold that still matches)
    // 2. Most complex conditions (more conditions = higher priority)
    // 3. Most restrictive approval levels (more levels = higher priority)
    
    return matchingRules.sort((a, b) => {
      // First priority: amount threshold specificity
      const amountDiff = b.amountThreshold - a.amountThreshold;
      if (amountDiff !== 0) return amountDiff;
      
      // Second priority: condition complexity
      const aConditionCount = a.conditions ? Object.keys(a.conditions).length : 0;
      const bConditionCount = b.conditions ? Object.keys(b.conditions).length : 0;
      const conditionDiff = bConditionCount - aConditionCount;
      if (conditionDiff !== 0) return conditionDiff;
      
      // Third priority: approval level restrictiveness
      return b.approvalLevels - a.approvalLevels;
    })[0];
  }

  /**
   * Calculate distance between two geographic points (Haversine formula)
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
   * Calculate comprehensive risk assessment with advanced fraud detection
   */
  private calculateRiskAssessment(transaction: TransactionContext) {
    const baseScore = ApprovalHelpers.calculateRiskScore(transaction);
    
    // Comprehensive risk factors
    const riskFactors: Record<string, number> = {
      amount: this.calculateAmountRisk(transaction.amount),
      time: this.calculateTimeRisk(transaction.timestamp),
      frequency: this.calculateFrequencyRisk(transaction.userHistory),
      location: this.calculateLocationRisk(transaction.location, transaction.ipAddress),
      type: this.calculateTypeRisk(transaction.type),
      device: this.calculateDeviceRisk(transaction.deviceFingerprint, transaction.userAgent),
      behavior: this.calculateBehaviorRisk(transaction.userHistory, transaction)
    };

    // Advanced fraud indicators
    const fraudIndicators: string[] = [];
    
    // Amount-based indicators
    if (transaction.amount > 100000) {
      fraudIndicators.push('high_amount');
    }
    
    if (transaction.userHistory && transaction.amount > transaction.userHistory.averageAmount * 10) {
      fraudIndicators.push('unusual_amount_spike');
    }
    
    // Time-based indicators
    if (this.isNightTransaction(transaction.timestamp)) {
      fraudIndicators.push('night_transaction');
    }
    
    if (this.isWeekendTransaction(transaction.timestamp)) {
      fraudIndicators.push('weekend_transaction');
    }
    
    // Location-based indicators
    if (transaction.location && this.isSuspiciousLocation(transaction.location)) {
      fraudIndicators.push('suspicious_location');
    }
    
    // Device-based indicators
    if (!transaction.deviceFingerprint) {
      fraudIndicators.push('unknown_device');
    }
    
    // Behavioral indicators
    if (transaction.userHistory && transaction.userHistory.suspiciousActivityCount > 0) {
      fraudIndicators.push('previous_suspicious_activity');
    }
    
    // Velocity indicators
    if (this.detectVelocityAnomaly(transaction)) {
      fraudIndicators.push('velocity_anomaly');
    }

    // Calculate weighted final score
    const weights = {
      amount: 0.25,
      time: 0.10,
      frequency: 0.15,
      location: 0.20,
      type: 0.10,
      device: 0.10,
      behavior: 0.10
    };

    const weightedScore = Object.entries(riskFactors).reduce((sum, [factor, score]) => {
      return sum + (score * (weights[factor] || 0.1));
    }, 0);

    // Add fraud indicator penalty
    const fraudPenalty = fraudIndicators.length * 5;
    const finalScore = Math.min(weightedScore + fraudPenalty, 100);

    return {
      score: finalScore,
      level: this.getRiskLevel(finalScore),
      factors: riskFactors,
      fraudIndicators
    };
  }

  /**
   * Calculate amount-based risk with dynamic thresholds
   */
  private calculateAmountRisk(amount: number): number {
    // Progressive risk scoring based on amount ranges
    if (amount < 1000) return 0;
    if (amount < 10000) return 5;
    if (amount < 50000) return 15;
    if (amount < 100000) return 25;
    if (amount < 500000) return 40;
    if (amount < 1000000) return 60;
    return 80; // Very high amounts
  }

  /**
   * Calculate frequency-based risk from user history
   */
  private calculateFrequencyRisk(userHistory?: any): number {
    if (!userHistory) return 20; // Unknown user = higher risk
    
    const { totalTransactions, lastTransactionDate } = userHistory;
    
    // New users with few transactions are riskier
    if (totalTransactions < 5) return 25;
    if (totalTransactions < 20) return 15;
    
    // Check transaction recency
    if (lastTransactionDate) {
      const daysSinceLastTransaction = Math.floor(
        (Date.now() - lastTransactionDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      // Long gaps in activity are suspicious
      if (daysSinceLastTransaction > 90) return 20;
      if (daysSinceLastTransaction > 30) return 10;
    }
    
    return 0; // Regular user with good history
  }

  /**
   * Calculate location-based risk
   */
  private calculateLocationRisk(location?: any, ipAddress?: string): number {
    if (!location && !ipAddress) return 30; // No location data = higher risk
    
    let risk = 0;
    
    if (location) {
      // High-risk countries (simplified list)
      const highRiskCountries = ['XX', 'YY']; // Would be actual country codes
      if (highRiskCountries.includes(location.country)) {
        risk += 40;
      }
      
      // Check for VPN/proxy indicators (would need external service)
      // if (this.isVpnOrProxy(ipAddress)) risk += 20;
    }
    
    return Math.min(risk, 50);
  }

  /**
   * Calculate device-based risk
   */
  private calculateDeviceRisk(deviceFingerprint?: string, userAgent?: string): number {
    let risk = 0;
    
    // Unknown device
    if (!deviceFingerprint) {
      risk += 15;
    }
    
    // Suspicious user agents
    if (userAgent) {
      const suspiciousPatterns = ['bot', 'crawler', 'automated', 'script'];
      for (const pattern of suspiciousPatterns) {
        if (userAgent.toLowerCase().includes(pattern)) {
          risk += 25;
          break;
        }
      }
    }
    
    return Math.min(risk, 40);
  }

  /**
   * Calculate behavioral risk based on user patterns
   */
  private calculateBehaviorRisk(userHistory?: any, transaction?: TransactionContext): number {
    if (!userHistory) return 15;
    
    let risk = 0;
    
    // Previous suspicious activity
    if (userHistory.suspiciousActivityCount > 0) {
      risk += userHistory.suspiciousActivityCount * 10;
    }
    
    // Unusual transaction pattern
    if (transaction && userHistory.averageAmount > 0) {
      const amountDeviation = Math.abs(transaction.amount - userHistory.averageAmount) / userHistory.averageAmount;
      if (amountDeviation > 5) { // 500% deviation
        risk += 20;
      } else if (amountDeviation > 2) { // 200% deviation
        risk += 10;
      }
    }
    
    return Math.min(risk, 35);
  }

  /**
   * Check if location is suspicious
   */
  private isSuspiciousLocation(location: any): boolean {
    // High-risk countries or regions
    const highRiskCountries = ['XX', 'YY']; // Would be actual country codes
    return highRiskCountries.includes(location.country);
  }

  /**
   * Detect velocity anomalies
   */
  private detectVelocityAnomaly(transaction: TransactionContext): boolean {
    // This would check recent transaction patterns
    // For now, return false as we'd need transaction history lookup
    return false;
  }

  /**
   * Calculate time-based risk
   */
  private calculateTimeRisk(timestamp: Date): number {
    const hour = timestamp.getHours();
    
    // Night hours (22:00 - 06:00) are riskier
    if (hour >= 22 || hour < 6) {
      return 20;
    }
    
    // Early morning (06:00 - 08:00) slightly risky
    if (hour >= 6 && hour < 8) {
      return 10;
    }
    
    // Business hours (08:00 - 18:00) are safe
    if (hour >= 8 && hour < 18) {
      return 0;
    }
    
    // Evening (18:00 - 22:00) slightly risky
    return 5;
  }

  /**
   * Calculate transaction type risk
   */
  private calculateTypeRisk(type: TransactionType): number {
    const typeRiskMap = {
      'payment': 5,
      'transfer': 10,
      'withdrawal': 15,
      'investment': 20,
      'loan': 25
    };
    
    return typeRiskMap[type] || 10;
  }

  /**
   * Check if transaction is during night hours
   */
  private isNightTransaction(timestamp: Date): boolean {
    const hour = timestamp.getHours();
    return hour >= 22 || hour < 6;
  }

  /**
   * Check if transaction is during weekend
   */
  private isWeekendTransaction(timestamp: Date): boolean {
    const day = timestamp.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
  }

  /**
   * Get risk level from score
   */
  private getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 75) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }

  /**
   * Check if transaction can be auto-approved
   */
  private checkAutoApproval(
    rule: ApprovalRule, 
    riskAssessment: any, 
    transaction: TransactionContext
  ): { autoApprove: boolean; reason: string } {
    
    // Never auto-approve high-risk transactions
    if (riskAssessment.level === 'critical') {
      return { autoApprove: false, reason: 'Critical risk level detected' };
    }

    // Never auto-approve loans
    if (transaction.type === 'loan') {
      return { autoApprove: false, reason: 'Loan transactions require manual approval' };
    }

    // Auto-approve very small amounts with low risk
    if (transaction.amount < 1000 && riskAssessment.level === 'low') {
      return { autoApprove: true, reason: 'Small amount with low risk - auto-approved' };
    }

    // Check for emergency override conditions
    const ruleModel = new ApprovalRuleModel(rule);
    if (ruleModel.approvalLevels === 1 && riskAssessment.level === 'low') {
      return { autoApprove: true, reason: 'Single-level approval with low risk - auto-approved' };
    }

    return { autoApprove: false, reason: 'Manual approval required' };
  }

  /**
   * Build approval requirement object
   */
  private buildApprovalRequirement(
    rule: ApprovalRule, 
    riskAssessment: any
  ): ApprovalRequirement {
    const ruleModel = new ApprovalRuleModel(rule);
    
    // Calculate additional levels based on risk
    const additionalLevels = riskAssessment.level === 'critical' ? 1 : 0;
    const totalLevels = ruleModel.approvalLevels + additionalLevels;

    // Build required roles array
    const requiredRoles = [...ruleModel.requiredRoles];
    
    // Add additional admin approval for high-risk transactions
    if (additionalLevels > 0) {
      requiredRoles.push(['admin']);
    }

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      totalLevels,
      requiredRoles,
      riskScore: riskAssessment.score,
      additionalLevels,
      emergencyOverrideAllowed: riskAssessment.level !== 'critical'
    };
  }

  /**
   * Test rule against sample transaction (for admin interface)
   */
  async testRule(
    ruleId: string, 
    sampleTransaction: Omit<TransactionContext, 'id' | 'userId' | 'timestamp'>
  ): Promise<RuleEvaluationResult> {
    const rule = await db
      .select()
      .from(approvalRules)
      .where(eq(approvalRules.id, ruleId))
      .limit(1);

    if (!rule[0]) {
      throw new Error('Rule not found');
    }

    const testTransaction: TransactionContext = {
      ...sampleTransaction,
      id: 'test-transaction',
      userId: 'test-user',
      timestamp: new Date()
    };

    return this.evaluateTransaction(testTransaction);
  }

  /**
   * Get comprehensive rule evaluation statistics
   */
  async getRuleStatistics(ruleId: string, days: number = 30): Promise<{
    totalEvaluations: number;
    autoApprovals: number;
    manualApprovals: number;
    averageRiskScore: number;
    riskDistribution: Record<string, number>;
    performanceMetrics: {
      averageEvaluationTime: number;
      successRate: number;
      errorRate: number;
    };
    fraudDetection: {
      flaggedTransactions: number;
      falsePositives: number;
      truePositives: number;
    };
  }> {
    // This would typically query approval_workflows and risk_assessments tables
    // Implementation would include actual database queries
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Mock implementation - would be replaced with actual queries
    return {
      totalEvaluations: 0,
      autoApprovals: 0,
      manualApprovals: 0,
      averageRiskScore: 0,
      riskDistribution: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      },
      performanceMetrics: {
        averageEvaluationTime: 0,
        successRate: 0,
        errorRate: 0
      },
      fraudDetection: {
        flaggedTransactions: 0,
        falsePositives: 0,
        truePositives: 0
      }
    };
  }

  /**
   * Batch evaluate multiple transactions for performance testing
   */
  async batchEvaluateTransactions(transactions: TransactionContext[]): Promise<{
    results: RuleEvaluationResult[];
    summary: {
      totalProcessed: number;
      autoApproved: number;
      requiresApproval: number;
      errors: number;
      averageProcessingTime: number;
    };
  }> {
    const startTime = Date.now();
    const results: RuleEvaluationResult[] = [];
    let errors = 0;

    for (const transaction of transactions) {
      try {
        const result = await this.evaluateTransaction(transaction);
        results.push(result);
      } catch (error) {
        console.error(`Error evaluating transaction ${transaction.id}:`, error);
        errors++;
        // Add error result
        results.push({
          requiresApproval: true,
          riskAssessment: {
            score: 100,
            level: 'critical',
            factors: {},
            fraudIndicators: ['evaluation_error']
          },
          autoApproved: false,
          reason: `Evaluation error: ${error.message}`
        });
      }
    }

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    const summary = {
      totalProcessed: transactions.length,
      autoApproved: results.filter(r => r.autoApproved).length,
      requiresApproval: results.filter(r => r.requiresApproval && !r.autoApproved).length,
      errors,
      averageProcessingTime: totalTime / transactions.length
    };

    return { results, summary };
  }

  /**
   * Analyze rule effectiveness and suggest optimizations
   */
  async analyzeRuleEffectiveness(ruleId: string): Promise<{
    effectiveness: {
      accuracyScore: number;
      falsePositiveRate: number;
      falseNegativeRate: number;
      processingEfficiency: number;
    };
    recommendations: string[];
    optimizationSuggestions: {
      thresholdAdjustments: Record<string, number>;
      conditionModifications: string[];
      performanceImprovements: string[];
    };
  }> {
    // This would analyze historical data to provide insights
    // Mock implementation for now
    
    return {
      effectiveness: {
        accuracyScore: 85.5,
        falsePositiveRate: 12.3,
        falseNegativeRate: 2.2,
        processingEfficiency: 94.7
      },
      recommendations: [
        'Consider adjusting amount threshold based on recent transaction patterns',
        'Add time-based conditions to reduce false positives during business hours',
        'Implement user behavior scoring for better risk assessment'
      ],
      optimizationSuggestions: {
        thresholdAdjustments: {
          amountThreshold: 15000,
          riskScoreThreshold: 65
        },
        conditionModifications: [
          'Add business hours exception for amounts under 50,000',
          'Include user transaction history in risk calculation',
          'Implement location-based risk scoring'
        ],
        performanceImprovements: [
          'Cache frequently accessed rules',
          'Optimize database queries with proper indexing',
          'Implement rule evaluation caching for similar transactions'
        ]
      }
    };
  }

  /**
   * Simulate rule changes and predict impact
   */
  async simulateRuleChanges(
    ruleId: string,
    proposedChanges: Partial<ApprovalRule>,
    sampleTransactions: TransactionContext[]
  ): Promise<{
    currentResults: RuleEvaluationResult[];
    proposedResults: RuleEvaluationResult[];
    impact: {
      approvalRateChange: number;
      riskScoreChange: number;
      processingTimeChange: number;
      falsePositiveChange: number;
    };
  }> {
    // Get current rule
    const currentRule = await db
      .select()
      .from(approvalRules)
      .where(eq(approvalRules.id, ruleId))
      .limit(1);

    if (!currentRule[0]) {
      throw new Error('Rule not found');
    }

    // Evaluate with current rule
    const currentResults: RuleEvaluationResult[] = [];
    for (const transaction of sampleTransactions) {
      const result = await this.evaluateTransaction(transaction);
      currentResults.push(result);
    }

    // Temporarily apply proposed changes (in memory only)
    const modifiedRule = { ...currentRule[0], ...proposedChanges };
    
    // Evaluate with proposed changes
    const proposedResults: RuleEvaluationResult[] = [];
    for (const transaction of sampleTransactions) {
      // This would use the modified rule for evaluation
      // For now, just copy current results as placeholder
      proposedResults.push({ ...currentResults[0] });
    }

    // Calculate impact metrics
    const currentApprovalRate = currentResults.filter(r => !r.requiresApproval).length / currentResults.length;
    const proposedApprovalRate = proposedResults.filter(r => !r.requiresApproval).length / proposedResults.length;

    const currentAvgRisk = currentResults.reduce((sum, r) => sum + r.riskAssessment.score, 0) / currentResults.length;
    const proposedAvgRisk = proposedResults.reduce((sum, r) => sum + r.riskAssessment.score, 0) / proposedResults.length;

    return {
      currentResults,
      proposedResults,
      impact: {
        approvalRateChange: (proposedApprovalRate - currentApprovalRate) * 100,
        riskScoreChange: proposedAvgRisk - currentAvgRisk,
        processingTimeChange: 0, // Would measure actual processing time difference
        falsePositiveChange: 0   // Would require labeled test data
      }
    };
  }

  /**
   * Validate rule configuration
   */
  validateRuleConfiguration(ruleData: any): { isValid: boolean; errors: string[] } {
    const errors = ApprovalHelpers.validateApprovalRule(ruleData);
    
    // Additional business logic validations
    if (ruleData.transactionType === 'loan' && ruleData.approvalLevels < 2) {
      errors.push('Loan transactions must require at least 2 approval levels');
    }

    if (ruleData.amountThreshold > 1000000 && ruleData.approvalLevels < 3) {
      errors.push('High-value transactions (>1M) must require at least 3 approval levels');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const approvalRuleEngine = new ApprovalRuleEngine();