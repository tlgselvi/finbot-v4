-- FinBot v4 - Approval System Database Schema
-- Migration: 001_create_approval_system_tables.sql
-- Description: Create core tables for the approval system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create approval_rules table
CREATE TABLE approval_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    transaction_type VARCHAR(100) NOT NULL,
    amount_threshold DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'USD',
    approval_levels INTEGER NOT NULL DEFAULT 1 CHECK (approval_levels BETWEEN 1 AND 5),
    required_roles JSONB NOT NULL DEFAULT '[]',
    conditions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_transaction_type CHECK (transaction_type IN (
        'transfer', 'payment', 'withdrawal', 'investment', 'loan', 'expense', 'other'
    )),
    CONSTRAINT valid_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT positive_threshold CHECK (amount_threshold IS NULL OR amount_threshold > 0)
);

-- Create approval_workflows table
CREATE TABLE approval_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL,
    rule_id UUID REFERENCES approval_rules(id) ON DELETE SET NULL,
    requester_id UUID NOT NULL,
    current_level INTEGER DEFAULT 1,
    total_levels INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    risk_score DECIMAL(5,2) DEFAULT 0.0,
    emergency_override BOOLEAN DEFAULT false,
    override_reason TEXT,
    override_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT valid_status CHECK (status IN (
        'pending', 'approved', 'rejected', 'cancelled', 'escalated', 'expired'
    )),
    CONSTRAINT valid_levels CHECK (
        current_level BETWEEN 1 AND total_levels AND 
        total_levels BETWEEN 1 AND 5
    ),
    CONSTRAINT valid_risk_score CHECK (risk_score BETWEEN 0.0 AND 100.0),
    CONSTRAINT completed_status_check CHECK (
        (status IN ('approved', 'rejected', 'cancelled') AND completed_at IS NOT NULL) OR
        (status NOT IN ('approved', 'rejected', 'cancelled') AND completed_at IS NULL)
    )
);

-- Create approval_actions table
CREATE TABLE approval_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL,
    level INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL,
    comments TEXT,
    delegated_to UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    
    -- Constraints
    CONSTRAINT valid_action CHECK (action IN (
        'approve', 'reject', 'delegate', 'escalate', 'request_info'
    )),
    CONSTRAINT valid_level CHECK (level BETWEEN 1 AND 5),
    CONSTRAINT delegation_check CHECK (
        (action = 'delegate' AND delegated_to IS NOT NULL) OR
        (action != 'delegate' AND delegated_to IS NULL)
    )
);

-- Create risk_assessments table
CREATE TABLE risk_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL,
    workflow_id UUID REFERENCES approval_workflows(id) ON DELETE CASCADE,
    risk_score DECIMAL(5,2) NOT NULL,
    risk_factors JSONB NOT NULL DEFAULT '[]',
    fraud_indicators JSONB DEFAULT '[]',
    assessment_method VARCHAR(50) DEFAULT 'rule_based',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_risk_score CHECK (risk_score BETWEEN 0.0 AND 100.0),
    CONSTRAINT valid_assessment_method CHECK (assessment_method IN (
        'rule_based', 'ml_model', 'hybrid', 'manual'
    ))
);

-- Create approval_notifications table
CREATE TABLE approval_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL,
    notification_type VARCHAR(50) NOT NULL,
    channel VARCHAR(20) NOT NULL,
    subject VARCHAR(255),
    message TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_notification_type CHECK (notification_type IN (
        'approval_request', 'approval_reminder', 'approval_approved', 
        'approval_rejected', 'approval_escalated', 'approval_expired'
    )),
    CONSTRAINT valid_channel CHECK (channel IN (
        'email', 'sms', 'push', 'in_app', 'slack', 'teams'
    )),
    CONSTRAINT valid_status CHECK (status IN (
        'pending', 'sent', 'delivered', 'failed', 'cancelled'
    ))
);

-- Create approval_templates table for reusable workflow templates
CREATE TABLE approval_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    transaction_types VARCHAR(100)[] NOT NULL,
    template_config JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance optimization

-- Approval rules indexes
CREATE INDEX idx_approval_rules_active ON approval_rules(is_active) WHERE is_active = true;
CREATE INDEX idx_approval_rules_transaction_type ON approval_rules(transaction_type);
CREATE INDEX idx_approval_rules_threshold ON approval_rules(amount_threshold) WHERE amount_threshold IS NOT NULL;
CREATE INDEX idx_approval_rules_created_by ON approval_rules(created_by);

-- Approval workflows indexes
CREATE INDEX idx_approval_workflows_status ON approval_workflows(status);
CREATE INDEX idx_approval_workflows_requester ON approval_workflows(requester_id);
CREATE INDEX idx_approval_workflows_created_at ON approval_workflows(created_at);
CREATE INDEX idx_approval_workflows_pending ON approval_workflows(status, current_level) WHERE status = 'pending';
CREATE INDEX idx_approval_workflows_transaction ON approval_workflows(transaction_id);
CREATE INDEX idx_approval_workflows_rule ON approval_workflows(rule_id) WHERE rule_id IS NOT NULL;

-- Approval actions indexes
CREATE INDEX idx_approval_actions_workflow ON approval_actions(workflow_id);
CREATE INDEX idx_approval_actions_approver ON approval_actions(approver_id);
CREATE INDEX idx_approval_actions_level ON approval_actions(level);
CREATE INDEX idx_approval_actions_created_at ON approval_actions(created_at);
CREATE INDEX idx_approval_actions_action ON approval_actions(action);

-- Risk assessments indexes
CREATE INDEX idx_risk_assessments_transaction ON risk_assessments(transaction_id);
CREATE INDEX idx_risk_assessments_workflow ON risk_assessments(workflow_id) WHERE workflow_id IS NOT NULL;
CREATE INDEX idx_risk_assessments_score ON risk_assessments(risk_score);
CREATE INDEX idx_risk_assessments_created_at ON risk_assessments(created_at);

-- Approval notifications indexes
CREATE INDEX idx_approval_notifications_workflow ON approval_notifications(workflow_id);
CREATE INDEX idx_approval_notifications_recipient ON approval_notifications(recipient_id);
CREATE INDEX idx_approval_notifications_status ON approval_notifications(status);
CREATE INDEX idx_approval_notifications_pending ON approval_notifications(status, created_at) WHERE status = 'pending';
CREATE INDEX idx_approval_notifications_type ON approval_notifications(notification_type);

-- Approval templates indexes
CREATE INDEX idx_approval_templates_active ON approval_templates(is_active) WHERE is_active = true;
CREATE INDEX idx_approval_templates_transaction_types ON approval_templates USING GIN(transaction_types);

-- Create composite indexes for common queries
CREATE INDEX idx_workflows_status_level_created ON approval_workflows(status, current_level, created_at);
CREATE INDEX idx_actions_workflow_level_created ON approval_actions(workflow_id, level, created_at);

-- Additional performance indexes for complex queries
CREATE INDEX idx_workflows_requester_status_created ON approval_workflows(requester_id, status, created_at);
CREATE INDEX idx_workflows_risk_score_status ON approval_workflows(risk_score, status) WHERE status = 'pending';
CREATE INDEX idx_actions_approver_action_created ON approval_actions(approver_id, action, created_at);
CREATE INDEX idx_notifications_recipient_status_type ON approval_notifications(recipient_id, status, notification_type);

-- Indexes for audit and reporting queries
CREATE INDEX idx_workflows_completed_date ON approval_workflows(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX idx_actions_delegation ON approval_actions(delegated_to) WHERE delegated_to IS NOT NULL;
CREATE INDEX idx_workflows_emergency_override ON approval_workflows(emergency_override, override_by) WHERE emergency_override = true;

-- Create partial indexes for active records
CREATE INDEX idx_active_rules_type_threshold ON approval_rules(transaction_type, amount_threshold) 
    WHERE is_active = true;

-- Create functional indexes
CREATE INDEX idx_approval_rules_name_lower ON approval_rules(LOWER(name));
CREATE INDEX idx_workflows_metadata_priority ON approval_workflows((metadata->>'priority')) 
    WHERE metadata ? 'priority';

-- Add triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_approval_rules_updated_at 
    BEFORE UPDATE ON approval_rules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_approval_templates_updated_at 
    BEFORE UPDATE ON approval_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add audit trigger function
CREATE OR REPLACE FUNCTION audit_approval_changes()
RETURNS TRIGGER AS $$
BEGIN
    -- Log significant changes to approval workflows
    IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
        INSERT INTO approval_actions (
            workflow_id, 
            approver_id, 
            level, 
            action, 
            comments,
            created_at
        ) VALUES (
            NEW.id,
            COALESCE(NEW.override_by, NEW.requester_id),
            NEW.current_level,
            CASE 
                WHEN NEW.status = 'approved' THEN 'approve'
                WHEN NEW.status = 'rejected' THEN 'reject'
                WHEN NEW.status = 'cancelled' THEN 'cancel'
                ELSE 'update'
            END,
            'System generated action for status change',
            NOW()
        );
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER audit_workflow_changes 
    AFTER UPDATE ON approval_workflows 
    FOR EACH ROW EXECUTE FUNCTION audit_approval_changes();

-- Insert default approval rules
INSERT INTO approval_rules (
    name, 
    transaction_type, 
    amount_threshold, 
    currency, 
    approval_levels, 
    required_roles, 
    conditions,
    created_by
) VALUES 
(
    'Small Expense Approval', 
    'expense', 
    100.00, 
    'USD', 
    1, 
    '["manager"]',
    '{"auto_approve_below": 50}',
    uuid_generate_v4()
),
(
    'Medium Transfer Approval', 
    'transfer', 
    1000.00, 
    'USD', 
    2, 
    '["manager", "finance_director"]',
    '{"require_documentation": true}',
    uuid_generate_v4()
),
(
    'Large Investment Approval', 
    'investment', 
    10000.00, 
    'USD', 
    3, 
    '["manager", "finance_director", "ceo"]',
    '{"require_board_approval": true, "require_risk_assessment": true}',
    uuid_generate_v4()
),
(
    'Emergency Payment Override', 
    'payment', 
    5000.00, 
    'USD', 
    1, 
    '["emergency_approver"]',
    '{"emergency_only": true, "max_per_day": 3}',
    uuid_generate_v4()
);

-- Insert default approval templates
INSERT INTO approval_templates (
    name,
    description,
    transaction_types,
    template_config,
    created_by
) VALUES 
(
    'Standard Expense Workflow',
    'Standard approval workflow for expense transactions',
    ARRAY['expense'],
    '{
        "levels": [
            {"role": "manager", "amount_limit": 1000},
            {"role": "finance_director", "amount_limit": 5000},
            {"role": "ceo", "amount_limit": null}
        ],
        "notifications": {
            "channels": ["email", "in_app"],
            "reminders": [24, 72]
        },
        "escalation": {
            "timeout_hours": 48,
            "escalate_to": "next_level"
        }
    }',
    uuid_generate_v4()
),
(
    'Investment Approval Workflow',
    'Multi-level approval workflow for investment transactions',
    ARRAY['investment'],
    '{
        "levels": [
            {"role": "portfolio_manager", "amount_limit": 50000},
            {"role": "investment_committee", "amount_limit": 250000},
            {"role": "board", "amount_limit": null}
        ],
        "requirements": {
            "risk_assessment": true,
            "documentation": ["investment_memo", "risk_analysis"],
            "external_approval": true
        },
        "notifications": {
            "channels": ["email", "slack"],
            "reminders": [12, 24, 48]
        }
    }',
    uuid_generate_v4()
);

-- Add comments to tables and columns
COMMENT ON TABLE approval_rules IS 'Configuration rules for approval workflows based on transaction criteria';
COMMENT ON TABLE approval_workflows IS 'Active approval workflow instances for transactions';
COMMENT ON TABLE approval_actions IS 'Individual approval actions taken by users in workflows';
COMMENT ON TABLE risk_assessments IS 'Risk assessment results for transactions requiring approval';
COMMENT ON TABLE approval_notifications IS 'Notification queue and delivery tracking for approval workflows';
COMMENT ON TABLE approval_templates IS 'Reusable workflow templates for different transaction types';

COMMENT ON COLUMN approval_rules.required_roles IS 'JSON array of roles required for each approval level';
COMMENT ON COLUMN approval_rules.conditions IS 'JSON object containing additional rule conditions and parameters';
COMMENT ON COLUMN approval_workflows.metadata IS 'JSON object for storing additional workflow context and data';
COMMENT ON COLUMN risk_assessments.risk_factors IS 'JSON array of identified risk factors and their weights';
COMMENT ON COLUMN risk_assessments.fraud_indicators IS 'JSON array of potential fraud indicators detected';

-- Create views for common queries
CREATE VIEW active_approval_rules AS
SELECT 
    id,
    name,
    transaction_type,
    amount_threshold,
    currency,
    approval_levels,
    required_roles,
    conditions,
    created_at,
    updated_at
FROM approval_rules 
WHERE is_active = true;

CREATE VIEW pending_approvals AS
SELECT 
    w.id as workflow_id,
    w.transaction_id,
    w.requester_id,
    w.current_level,
    w.total_levels,
    w.risk_score,
    w.created_at,
    r.name as rule_name,
    r.required_roles->>(w.current_level - 1) as required_role
FROM approval_workflows w
LEFT JOIN approval_rules r ON w.rule_id = r.id
WHERE w.status = 'pending';

CREATE VIEW approval_statistics AS
SELECT 
    DATE_TRUNC('day', created_at) as date,
    status,
    COUNT(*) as count,
    AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600) as avg_hours_to_complete
FROM approval_workflows 
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at), status
ORDER BY date DESC;

-- Grant permissions (adjust based on your user roles)
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO approval_service;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO approval_service;

-- Migration completed successfully
SELECT 'Approval System database schema created successfully' as result;