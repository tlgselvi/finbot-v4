-- FinBot v4 Approval System - Mevcut Database'e Ekleme
-- Bu script mevcut FinBot database'ine approval system tablolarını ekler

-- Enable required extensions (if not exists)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Mevcut public schema'yı kullan (yeni schema oluşturma)
-- CREATE SCHEMA approval_system; -- Gerekirse sonra ekleriz

-- Create custom types
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'escalated');
CREATE TYPE transaction_type AS ENUM ('transfer', 'payment', 'withdrawal', 'investment', 'loan');
CREATE TYPE user_role AS ENUM ('admin', 'finance', 'viewer', 'auditor');
CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high', 'critical');

-- Create approval_rules table (mevcut public schema'da)
CREATE TABLE IF NOT EXISTS approval_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    transaction_type transaction_type NOT NULL,
    amount_threshold DECIMAL(15,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'TRY',
    approval_levels INTEGER NOT NULL DEFAULT 1 CHECK (approval_levels BETWEEN 1 AND 5),
    required_roles JSONB NOT NULL DEFAULT '[]',
    conditions JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_amount_threshold CHECK (amount_threshold >= 0),
    CONSTRAINT valid_currency CHECK (currency ~ '^[A-Z]{3}$')
);

-- Create approval_workflows table
CREATE TABLE IF NOT EXISTS approval_workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL,
    rule_id UUID REFERENCES approval_system.approval_rules(id),
    requester_id UUID NOT NULL,
    current_level INTEGER NOT NULL DEFAULT 1,
    total_levels INTEGER NOT NULL,
    status approval_status NOT NULL DEFAULT 'pending',
    risk_score DECIMAL(5,2) DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
    emergency_override BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    
    CONSTRAINT valid_levels CHECK (current_level <= total_levels),
    CONSTRAINT valid_completion CHECK (
        (status IN ('approved', 'rejected', 'cancelled') AND completed_at IS NOT NULL) OR
        (status IN ('pending', 'escalated') AND completed_at IS NULL)
    )
);

-- Create approval_actions table
CREATE TABLE approval_system.approval_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL REFERENCES approval_system.approval_workflows(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL,
    level INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('approve', 'reject', 'delegate', 'escalate')),
    comments TEXT,
    delegated_to UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT,
    
    CONSTRAINT valid_delegation CHECK (
        (action = 'delegate' AND delegated_to IS NOT NULL) OR
        (action != 'delegate' AND delegated_to IS NULL)
    )
);

-- Create risk_assessments table
CREATE TABLE approval_system.risk_assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID NOT NULL,
    workflow_id UUID REFERENCES approval_system.approval_workflows(id),
    risk_score DECIMAL(5,2) NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    risk_level risk_level NOT NULL,
    risk_factors JSONB DEFAULT '{}',
    fraud_indicators JSONB DEFAULT '{}',
    assessment_method VARCHAR(50) NOT NULL DEFAULT 'rule_based',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_risk_level_score CHECK (
        (risk_level = 'low' AND risk_score < 25) OR
        (risk_level = 'medium' AND risk_score >= 25 AND risk_score < 50) OR
        (risk_level = 'high' AND risk_score >= 50 AND risk_score < 75) OR
        (risk_level = 'critical' AND risk_score >= 75)
    )
);

-- Create indexes for performance
CREATE INDEX idx_approval_rules_active ON approval_system.approval_rules(is_active, transaction_type);
CREATE INDEX idx_approval_rules_threshold ON approval_system.approval_rules(transaction_type, amount_threshold);

CREATE INDEX idx_workflows_status_requester ON approval_system.approval_workflows(status, requester_id);
CREATE INDEX idx_workflows_created_at ON approval_system.approval_workflows(created_at DESC);
CREATE INDEX idx_workflows_transaction ON approval_system.approval_workflows(transaction_id);

CREATE INDEX idx_actions_workflow_level ON approval_system.approval_actions(workflow_id, level);
CREATE INDEX idx_actions_approver ON approval_system.approval_actions(approver_id, created_at DESC);

CREATE INDEX idx_risk_assessments_transaction ON approval_system.risk_assessments(transaction_id);
CREATE INDEX idx_risk_assessments_score ON approval_system.risk_assessments(risk_score DESC);

-- Create audit trigger function
CREATE OR REPLACE FUNCTION audit_logs.audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs.audit_trail (
            table_name, operation, record_id, new_values, created_at
        ) VALUES (
            TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(NEW), NOW()
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs.audit_trail (
            table_name, operation, record_id, old_values, new_values, created_at
        ) VALUES (
            TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(OLD), to_jsonb(NEW), NOW()
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs.audit_trail (
            table_name, operation, record_id, old_values, created_at
        ) VALUES (
            TG_TABLE_NAME, TG_OP, OLD.id, to_jsonb(OLD), NOW()
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create audit trail table
CREATE TABLE audit_logs.audit_trail (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    operation VARCHAR(10) NOT NULL,
    record_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_trail_table_record ON audit_logs.audit_trail(table_name, record_id);
CREATE INDEX idx_audit_trail_created_at ON audit_logs.audit_trail(created_at DESC);

-- Add audit triggers
CREATE TRIGGER audit_approval_rules
    AFTER INSERT OR UPDATE OR DELETE ON approval_system.approval_rules
    FOR EACH ROW EXECUTE FUNCTION audit_logs.audit_trigger_function();

CREATE TRIGGER audit_approval_workflows
    AFTER INSERT OR UPDATE OR DELETE ON approval_system.approval_workflows
    FOR EACH ROW EXECUTE FUNCTION audit_logs.audit_trigger_function();

CREATE TRIGGER audit_approval_actions
    AFTER INSERT OR UPDATE OR DELETE ON approval_system.approval_actions
    FOR EACH ROW EXECUTE FUNCTION audit_logs.audit_trigger_function();

-- Grant permissions
GRANT USAGE ON SCHEMA approval_system TO finbot_user;
GRANT USAGE ON SCHEMA audit_logs TO finbot_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA approval_system TO finbot_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA audit_logs TO finbot_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA approval_system TO finbot_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA audit_logs TO finbot_user;