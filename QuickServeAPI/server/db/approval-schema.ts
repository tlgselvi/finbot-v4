/**
 * FinBot v4 - Approval System Database Schema
 * Drizzle ORM schema definitions for approval system
 */

import { pgTable, uuid, varchar, decimal, integer, boolean, timestamp, jsonb, text, inet, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const approvalStatusEnum = pgEnum('approval_status', [
  'pending',
  'approved', 
  'rejected',
  'cancelled',
  'escalated'
]);

export const transactionTypeEnum = pgEnum('transaction_type', [
  'transfer',
  'payment',
  'withdrawal', 
  'investment',
  'loan'
]);

export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'finance',
  'viewer',
  'auditor'
]);

export const riskLevelEnum = pgEnum('risk_level', [
  'low',
  'medium',
  'high',
  'critical'
]);

// Approval Rules Table
export const approvalRules = pgTable('approval_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  transactionType: transactionTypeEnum('transaction_type').notNull(),
  amountThreshold: decimal('amount_threshold', { precision: 15, scale: 2 }).notNull().default('0'),
  currency: varchar('currency', { length: 3 }).notNull().default('TRY'),
  approvalLevels: integer('approval_levels').notNull().default(1),
  requiredRoles: jsonb('required_roles').notNull().default('[]'),
  conditions: jsonb('conditions').default('{}'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// Approval Workflows Table
export const approvalWorkflows = pgTable('approval_workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull(),
  ruleId: uuid('rule_id').references(() => approvalRules.id),
  requesterId: uuid('requester_id').notNull(),
  currentLevel: integer('current_level').notNull().default(1),
  totalLevels: integer('total_levels').notNull(),
  status: approvalStatusEnum('status').notNull().default('pending'),
  riskScore: decimal('risk_score', { precision: 5, scale: 2 }).default('0'),
  emergencyOverride: boolean('emergency_override').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').default('{}'),
});

// Approval Actions Table
export const approvalActions = pgTable('approval_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').notNull().references(() => approvalWorkflows.id, { onDelete: 'cascade' }),
  approverId: uuid('approver_id').notNull(),
  level: integer('level').notNull(),
  action: varchar('action', { length: 20 }).notNull(),
  comments: text('comments'),
  delegatedTo: uuid('delegated_to'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
});

// Risk Assessments Table
export const riskAssessments = pgTable('risk_assessments', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull(),
  workflowId: uuid('workflow_id').references(() => approvalWorkflows.id),
  riskScore: decimal('risk_score', { precision: 5, scale: 2 }).notNull(),
  riskLevel: riskLevelEnum('risk_level').notNull(),
  riskFactors: jsonb('risk_factors').default('{}'),
  fraudIndicators: jsonb('fraud_indicators').default('{}'),
  assessmentMethod: varchar('assessment_method', { length: 50 }).notNull().default('rule_based'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// Relations
export const approvalRulesRelations = relations(approvalRules, ({ many }) => ({
  workflows: many(approvalWorkflows),
}));

export const approvalWorkflowsRelations = relations(approvalWorkflows, ({ one, many }) => ({
  rule: one(approvalRules, {
    fields: [approvalWorkflows.ruleId],
    references: [approvalRules.id],
  }),
  actions: many(approvalActions),
  riskAssessment: one(riskAssessments, {
    fields: [approvalWorkflows.id],
    references: [riskAssessments.workflowId],
  }),
}));

export const approvalActionsRelations = relations(approvalActions, ({ one }) => ({
  workflow: one(approvalWorkflows, {
    fields: [approvalActions.workflowId],
    references: [approvalWorkflows.id],
  }),
}));

export const riskAssessmentsRelations = relations(riskAssessments, ({ one }) => ({
  workflow: one(approvalWorkflows, {
    fields: [riskAssessments.workflowId],
    references: [approvalWorkflows.id],
  }),
}));

// TypeScript Types
export type ApprovalRule = typeof approvalRules.$inferSelect;
export type NewApprovalRule = typeof approvalRules.$inferInsert;

export type ApprovalWorkflow = typeof approvalWorkflows.$inferSelect;
export type NewApprovalWorkflow = typeof approvalWorkflows.$inferInsert;

export type ApprovalAction = typeof approvalActions.$inferSelect;
export type NewApprovalAction = typeof approvalActions.$inferInsert;

export type RiskAssessment = typeof riskAssessments.$inferSelect;
export type NewRiskAssessment = typeof riskAssessments.$inferInsert;

// Enums for TypeScript
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'escalated';
export type TransactionType = 'transfer' | 'payment' | 'withdrawal' | 'investment' | 'loan';
export type UserRole = 'admin' | 'finance' | 'viewer' | 'auditor';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';