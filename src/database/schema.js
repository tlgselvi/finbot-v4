// FinBot v4 - Drizzle ORM Schema Definitions
const { 
  pgTable, 
  uuid, 
  varchar, 
  decimal, 
  integer, 
  boolean, 
  timestamp, 
  text, 
  jsonb,
  inet,
  serial,
  index
} = require('drizzle-orm/pg-core');
const { relations } = require('drizzle-orm');

// Users table (assumed to exist from main FinBot system)
const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('user'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
});

// Approval Rules
const approvalRules = pgTable('approval_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  transactionType: varchar('transaction_type', { length: 100 }).notNull(),
  amountThreshold: decimal('amount_threshold', { precision: 15, scale: 2 }),
  currency: varchar('currency', { length: 3 }).default('USD'),
  approvalLevels: integer('approval_levels').notNull().default(1),
  requiredRoles: jsonb('required_roles').notNull().default([]),
  conditions: jsonb('conditions').default({}),
  isActive: boolean('is_active').default(true),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
}, (table) => ({
  activeRulesIdx: index('idx_approval_rules_active').on(table.isActive),
  transactionTypeIdx: index('idx_approval_rules_transaction_type').on(table.transactionType),
  thresholdIdx: index('idx_approval_rules_threshold').on(table.amountThreshold),
  createdByIdx: index('idx_approval_rules_created_by').on(table.createdBy)
}));

// Approval Workflows
const approvalWorkflows = pgTable('approval_workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull(),
  ruleId: uuid('rule_id').references(() => approvalRules.id, { onDelete: 'set null' }),
  requesterId: uuid('requester_id').notNull(),
  currentLevel: integer('current_level').default(1),
  totalLevels: integer('total_levels').notNull(),
  status: varchar('status', { length: 50 }).default('pending'),
  riskScore: decimal('risk_score', { precision: 5, scale: 2 }).default('0.0'),
  emergencyOverride: boolean('emergency_override').default(false),
  overrideReason: text('override_reason'),
  overrideBy: uuid('override_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').default({})
}, (table) => ({
  statusIdx: index('idx_approval_workflows_status').on(table.status),
  requesterIdx: index('idx_approval_workflows_requester').on(table.requesterId),
  createdAtIdx: index('idx_approval_workflows_created_at').on(table.createdAt),
  pendingIdx: index('idx_approval_workflows_pending').on(table.status, table.currentLevel),
  transactionIdx: index('idx_approval_workflows_transaction').on(table.transactionId)
}));

// Approval Actions
const approvalActions = pgTable('approval_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').notNull().references(() => approvalWorkflows.id, { onDelete: 'cascade' }),
  approverId: uuid('approver_id').notNull(),
  level: integer('level').notNull(),
  action: varchar('action', { length: 20 }).notNull(),
  comments: text('comments'),
  delegatedTo: uuid('delegated_to'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent')
}, (table) => ({
  workflowIdx: index('idx_approval_actions_workflow').on(table.workflowId),
  approverIdx: index('idx_approval_actions_approver').on(table.approverId),
  levelIdx: index('idx_approval_actions_level').on(table.level),
  createdAtIdx: index('idx_approval_actions_created_at').on(table.createdAt),
  actionIdx: index('idx_approval_actions_action').on(table.action)
}));

// Risk Assessments
const riskAssessments = pgTable('risk_assessments', {
  id: uuid('id').primaryKey().defaultRandom(),
  transactionId: uuid('transaction_id').notNull(),
  workflowId: uuid('workflow_id').references(() => approvalWorkflows.id, { onDelete: 'cascade' }),
  riskScore: decimal('risk_score', { precision: 5, scale: 2 }).notNull(),
  riskFactors: jsonb('risk_factors').notNull().default([]),
  fraudIndicators: jsonb('fraud_indicators').default([]),
  assessmentMethod: varchar('assessment_method', { length: 50 }).default('rule_based'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, (table) => ({
  transactionIdx: index('idx_risk_assessments_transaction').on(table.transactionId),
  workflowIdx: index('idx_risk_assessments_workflow').on(table.workflowId),
  scoreIdx: index('idx_risk_assessments_score').on(table.riskScore),
  createdAtIdx: index('idx_risk_assessments_created_at').on(table.createdAt)
}));

// Approval Notifications
const approvalNotifications = pgTable('approval_notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').notNull().references(() => approvalWorkflows.id, { onDelete: 'cascade' }),
  recipientId: uuid('recipient_id').notNull(),
  notificationType: varchar('notification_type', { length: 50 }).notNull(),
  channel: varchar('channel', { length: 20 }).notNull(),
  subject: varchar('subject', { length: 255 }),
  message: text('message').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  status: varchar('status', { length: 20 }).default('pending'),
  retryCount: integer('retry_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow()
}, (table) => ({
  workflowIdx: index('idx_approval_notifications_workflow').on(table.workflowId),
  recipientIdx: index('idx_approval_notifications_recipient').on(table.recipientId),
  statusIdx: index('idx_approval_notifications_status').on(table.status),
  pendingIdx: index('idx_approval_notifications_pending').on(table.status, table.createdAt),
  typeIdx: index('idx_approval_notifications_type').on(table.notificationType)
}));

// Approval Templates
const approvalTemplates = pgTable('approval_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  transactionTypes: varchar('transaction_types').array().notNull(),
  templateConfig: jsonb('template_config').notNull(),
  isActive: boolean('is_active').default(true),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow()
}, (table) => ({
  activeIdx: index('idx_approval_templates_active').on(table.isActive),
  transactionTypesIdx: index('idx_approval_templates_transaction_types').on(table.transactionTypes)
}));

// Migrations tracking table
const migrations = pgTable('migrations', {
  id: serial('id').primaryKey(),
  filename: varchar('filename', { length: 255 }).notNull().unique(),
  executedAt: timestamp('executed_at', { withTimezone: true }).defaultNow()
});

// Define relationships
const approvalRulesRelations = relations(approvalRules, ({ many, one }) => ({
  workflows: many(approvalWorkflows),
  createdByUser: one(users, {
    fields: [approvalRules.createdBy],
    references: [users.id]
  })
}));

const approvalWorkflowsRelations = relations(approvalWorkflows, ({ many, one }) => ({
  rule: one(approvalRules, {
    fields: [approvalWorkflows.ruleId],
    references: [approvalRules.id]
  }),
  requester: one(users, {
    fields: [approvalWorkflows.requesterId],
    references: [users.id]
  }),
  actions: many(approvalActions),
  notifications: many(approvalNotifications),
  riskAssessments: many(riskAssessments)
}));

const approvalActionsRelations = relations(approvalActions, ({ one }) => ({
  workflow: one(approvalWorkflows, {
    fields: [approvalActions.workflowId],
    references: [approvalWorkflows.id]
  }),
  approver: one(users, {
    fields: [approvalActions.approverId],
    references: [users.id]
  }),
  delegatedToUser: one(users, {
    fields: [approvalActions.delegatedTo],
    references: [users.id]
  })
}));

const riskAssessmentsRelations = relations(riskAssessments, ({ one }) => ({
  workflow: one(approvalWorkflows, {
    fields: [riskAssessments.workflowId],
    references: [approvalWorkflows.id]
  })
}));

const approvalNotificationsRelations = relations(approvalNotifications, ({ one }) => ({
  workflow: one(approvalWorkflows, {
    fields: [approvalNotifications.workflowId],
    references: [approvalWorkflows.id]
  }),
  recipient: one(users, {
    fields: [approvalNotifications.recipientId],
    references: [users.id]
  })
}));

const approvalTemplatesRelations = relations(approvalTemplates, ({ one }) => ({
  createdByUser: one(users, {
    fields: [approvalTemplates.createdBy],
    references: [users.id]
  })
}));

// Export schema
module.exports = {
  // Tables
  users,
  approvalRules,
  approvalWorkflows,
  approvalActions,
  riskAssessments,
  approvalNotifications,
  approvalTemplates,
  migrations,
  
  // Relations
  approvalRulesRelations,
  approvalWorkflowsRelations,
  approvalActionsRelations,
  riskAssessmentsRelations,
  approvalNotificationsRelations,
  approvalTemplatesRelations
};