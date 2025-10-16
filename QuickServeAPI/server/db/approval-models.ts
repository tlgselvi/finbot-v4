/**
 * FinBot v4 - Approval System Database Models
 * Business logic models with validation and helper methods
 */

import { z } from 'zod';
import type { 
  ApprovalRule, 
  NewApprovalRule, 
  ApprovalWorkflow, 
  NewApprovalWorkflow,
  ApprovalAction,
  NewApprovalAction,
  RiskAssessment,
  NewRiskAssessment,
  ApprovalStatus,
  TransactionType,
  UserRole,
  RiskLevel
} from './approval-schema';

// Validation Schemas
export const ApprovalRuleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  transactionType: z.enum(['transfer', 'payment', 'withdrawal', 'investment', 'loan']),
  amountThreshold: z.number().min(0),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/),
  approvalLevels: z.number().int().min(1).max(5),
  requiredRoles: z.array(z.array(z.enum(['admin', 'finance', 'viewer', 'auditor']))),
  conditions: z.record(z.any()).optional(),
  isActive: z.boolean().default(true),
  createdBy: z.string().uuid(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const ApprovalWorkflowSchema = z.object({
  id: z.string().uuid().optional(),
  transactionId: z.string().uuid(),
  ruleId: z.string().uuid().optional(),
  requesterId: z.string().uuid(),
  currentLevel: z.number().int().min(1),
  totalLevels: z.number().int().min(1),
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled', 'escalated']).default('pending'),
  riskScore: z.number().min(0).max(100).optional(),
  emergencyOverride: z.boolean().default(false),
  createdAt: z.date().optional(),
  completedAt: z.date().optional(),
  metadata: z.record(z.any()).optional(),
});

export const ApprovalActionSchema = z.object({
  id: z.string().uuid().optional(),
  workflowId: z.string().uuid(),
  approverId: z.string().uuid(),
  level: z.number().int().min(1),
  action: z.enum(['approve', 'reject', 'delegate', 'escalate']),
  comments: z.string().optional(),
  delegatedTo: z.string().uuid().optional(),
  createdAt: z.date().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

export const RiskAssessmentSchema = z.object({
  id: z.string().uuid().optional(),
  transactionId: z.string().uuid(),
  workflowId: z.string().uuid().optional(),
  riskScore: z.number().min(0).max(100),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  riskFactors: z.record(z.any()).optional(),
  fraudIndicators: z.record(z.any()).optional(),
  assessmentMethod: z.string().default('rule_based'),
  createdAt: z.date().optional(),
});

// Business Logic Classes
export class ApprovalRuleModel {
  constructor(private data: ApprovalRule) {}

  static validate(data: unknown): ApprovalRule {
    return ApprovalRuleSchema.parse(data);
  }

  static create(data: NewApprovalRule): NewApprovalRule {
    return ApprovalRuleSchema.omit({ id: true, createdAt: true, updatedAt: true }).parse(data);
  }

  get id() { return this.data.id; }
  get name() { return this.data.name; }
  get transactionType() { return this.data.transactionType; }
  get amountThreshold() { return parseFloat(this.data.amountThreshold || '0'); }
  get currency() { return this.data.currency; }
  get approvalLevels() { return this.data.approvalLevels; }
  get requiredRoles() { return this.data.requiredRoles as UserRole[][]; }
  get isActive() { return this.data.isActive; }

  /**
   * Check if this rule matches a transaction
   */
  matches(transaction: { type: TransactionType; amount: number; currency: string }): boolean {
    if (!this.isActive) return false;
    if (this.transactionType !== transaction.type) return false;
    if (this.currency !== transaction.currency) return false;
    if (transaction.amount < this.amountThreshold) return false;
    
    return true;
  }

  /**
   * Get required approvers for a specific level
   */
  getRequiredRolesForLevel(level: number): UserRole[] {
    if (level < 1 || level > this.approvalLevels) {
      throw new Error(`Invalid approval level: ${level}`);
    }
    return this.requiredRoles[level - 1] || [];
  }

  /**
   * Check if rule is valid
   */
  isValid(): boolean {
    return this.approvalLevels > 0 && 
           this.approvalLevels <= 5 && 
           this.amountThreshold >= 0 &&
           this.requiredRoles.length === this.approvalLevels;
  }
}

export class ApprovalWorkflowModel {
  constructor(private data: ApprovalWorkflow) {}

  static validate(data: unknown): ApprovalWorkflow {
    return ApprovalWorkflowSchema.parse(data);
  }

  static create(data: NewApprovalWorkflow): NewApprovalWorkflow {
    return ApprovalWorkflowSchema.omit({ id: true, createdAt: true, completedAt: true }).parse(data);
  }

  get id() { return this.data.id; }
  get transactionId() { return this.data.transactionId; }
  get requesterId() { return this.data.requesterId; }
  get currentLevel() { return this.data.currentLevel; }
  get totalLevels() { return this.data.totalLevels; }
  get status() { return this.data.status as ApprovalStatus; }
  get riskScore() { return parseFloat(this.data.riskScore || '0'); }
  get emergencyOverride() { return this.data.emergencyOverride; }
  get createdAt() { return this.data.createdAt; }
  get completedAt() { return this.data.completedAt; }

  /**
   * Check if workflow is pending
   */
  isPending(): boolean {
    return this.status === 'pending';
  }

  /**
   * Check if workflow is completed
   */
  isCompleted(): boolean {
    return ['approved', 'rejected', 'cancelled'].includes(this.status);
  }

  /**
   * Check if workflow can be approved at current level
   */
  canApproveAtLevel(level: number): boolean {
    return this.isPending() && this.currentLevel === level;
  }

  /**
   * Check if workflow is at final level
   */
  isAtFinalLevel(): boolean {
    return this.currentLevel === this.totalLevels;
  }

  /**
   * Get next level for approval
   */
  getNextLevel(): number | null {
    if (this.isAtFinalLevel()) return null;
    return this.currentLevel + 1;
  }

  /**
   * Calculate processing time
   */
  getProcessingTime(): number | null {
    if (!this.completedAt || !this.createdAt) return null;
    return this.completedAt.getTime() - this.createdAt.getTime();
  }

  /**
   * Get workflow priority based on risk score and amount
   */
  getPriority(): 'low' | 'medium' | 'high' | 'critical' {
    const riskScore = this.riskScore;
    
    if (riskScore >= 75) return 'critical';
    if (riskScore >= 50) return 'high';
    if (riskScore >= 25) return 'medium';
    return 'low';
  }
}

export class ApprovalActionModel {
  constructor(private data: ApprovalAction) {}

  static validate(data: unknown): ApprovalAction {
    return ApprovalActionSchema.parse(data);
  }

  static create(data: NewApprovalAction): NewApprovalAction {
    return ApprovalActionSchema.omit({ id: true, createdAt: true }).parse(data);
  }

  get id() { return this.data.id; }
  get workflowId() { return this.data.workflowId; }
  get approverId() { return this.data.approverId; }
  get level() { return this.data.level; }
  get action() { return this.data.action; }
  get comments() { return this.data.comments; }
  get delegatedTo() { return this.data.delegatedTo; }
  get createdAt() { return this.data.createdAt; }

  /**
   * Check if action is approval
   */
  isApproval(): boolean {
    return this.action === 'approve';
  }

  /**
   * Check if action is rejection
   */
  isRejection(): boolean {
    return this.action === 'reject';
  }

  /**
   * Check if action is delegation
   */
  isDelegation(): boolean {
    return this.action === 'delegate';
  }

  /**
   * Validate delegation action
   */
  isValidDelegation(): boolean {
    return this.isDelegation() && !!this.delegatedTo;
  }
}

export class RiskAssessmentModel {
  constructor(private data: RiskAssessment) {}

  static validate(data: unknown): RiskAssessment {
    return RiskAssessmentSchema.parse(data);
  }

  static create(data: NewRiskAssessment): NewRiskAssessment {
    return RiskAssessmentSchema.omit({ id: true, createdAt: true }).parse(data);
  }

  get id() { return this.data.id; }
  get transactionId() { return this.data.transactionId; }
  get riskScore() { return parseFloat(this.data.riskScore); }
  get riskLevel() { return this.data.riskLevel as RiskLevel; }
  get riskFactors() { return this.data.riskFactors as Record<string, any>; }
  get fraudIndicators() { return this.data.fraudIndicators as Record<string, any>; }
  get assessmentMethod() { return this.data.assessmentMethod; }

  /**
   * Check if risk is high
   */
  isHighRisk(): boolean {
    return ['high', 'critical'].includes(this.riskLevel);
  }

  /**
   * Check if fraud indicators exist
   */
  hasFraudIndicators(): boolean {
    return Object.keys(this.fraudIndicators || {}).length > 0;
  }

  /**
   * Get risk level from score
   */
  static getRiskLevelFromScore(score: number): RiskLevel {
    if (score >= 75) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }

  /**
   * Calculate additional approval levels based on risk
   */
  getAdditionalApprovalLevels(): number {
    switch (this.riskLevel) {
      case 'critical': return 2;
      case 'high': return 1;
      case 'medium': return 0;
      case 'low': return 0;
      default: return 0;
    }
  }
}

// Helper Functions
export const ApprovalHelpers = {
  /**
   * Calculate risk score based on transaction details
   */
  calculateRiskScore(transaction: {
    amount: number;
    type: TransactionType;
    userId: string;
    timestamp: Date;
    ipAddress?: string;
  }): number {
    let score = 0;

    // Amount factor (0-30 points)
    score += Math.min(transaction.amount / 10000, 30);

    // Time factor (0-20 points) - Night transactions are riskier
    const hour = transaction.timestamp.getHours();
    if (hour < 6 || hour > 22) score += 20;

    // Transaction type factor (0-25 points)
    const typeRisk = {
      'transfer': 10,
      'payment': 5,
      'withdrawal': 15,
      'investment': 20,
      'loan': 25
    };
    score += typeRisk[transaction.type] || 0;

    // Weekend factor (0-10 points)
    const dayOfWeek = transaction.timestamp.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) score += 10;

    return Math.min(score, 100);
  },

  /**
   * Validate approval rule configuration
   */
  validateApprovalRule(rule: Partial<NewApprovalRule>): string[] {
    const errors: string[] = [];

    if (!rule.name || rule.name.trim().length === 0) {
      errors.push('Rule name is required');
    }

    if (!rule.transactionType) {
      errors.push('Transaction type is required');
    }

    if (rule.amountThreshold === undefined || rule.amountThreshold < 0) {
      errors.push('Amount threshold must be non-negative');
    }

    if (!rule.approvalLevels || rule.approvalLevels < 1 || rule.approvalLevels > 5) {
      errors.push('Approval levels must be between 1 and 5');
    }

    if (!rule.requiredRoles || !Array.isArray(rule.requiredRoles)) {
      errors.push('Required roles must be an array');
    } else if (rule.requiredRoles.length !== rule.approvalLevels) {
      errors.push('Required roles array length must match approval levels');
    }

    return errors;
  },

  /**
   * Check if user has required role for approval level
   */
  hasRequiredRole(userRoles: UserRole[], requiredRoles: UserRole[]): boolean {
    return requiredRoles.some(role => userRoles.includes(role));
  },

  /**
   * Get workflow status display text
   */
  getStatusDisplayText(status: ApprovalStatus): string {
    const statusMap = {
      'pending': 'Onay Bekliyor',
      'approved': 'Onaylandı',
      'rejected': 'Reddedildi',
      'cancelled': 'İptal Edildi',
      'escalated': 'Yükseltildi'
    };
    return statusMap[status] || status;
  },

  /**
   * Get transaction type display text
   */
  getTransactionTypeDisplayText(type: TransactionType): string {
    const typeMap = {
      'transfer': 'Transfer',
      'payment': 'Ödeme',
      'withdrawal': 'Para Çekme',
      'investment': 'Yatırım',
      'loan': 'Kredi'
    };
    return typeMap[type] || type;
  }
};

// Export all types and models
export type {
  ApprovalRule,
  NewApprovalRule,
  ApprovalWorkflow,
  NewApprovalWorkflow,
  ApprovalAction,
  NewApprovalAction,
  RiskAssessment,
  NewRiskAssessment,
  ApprovalStatus,
  TransactionType,
  UserRole,
  RiskLevel
};