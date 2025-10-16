-- FinBot v4 Seed Data
-- This script inserts initial data for development and testing

-- Insert default approval rules
INSERT INTO approval_system.approval_rules (
    name, transaction_type, amount_threshold, currency, approval_levels, required_roles, created_by
) VALUES 
    -- Transfer rules
    ('Small Transfer', 'transfer', 10000.00, 'TRY', 1, '["finance"]', uuid_generate_v4()),
    ('Medium Transfer', 'transfer', 50000.00, 'TRY', 2, '["finance", "admin"]', uuid_generate_v4()),
    ('Large Transfer', 'transfer', 100000.00, 'TRY', 3, '["finance", "admin", "admin"]', uuid_generate_v4()),
    
    -- Payment rules
    ('Small Payment', 'payment', 5000.00, 'TRY', 1, '["finance"]', uuid_generate_v4()),
    ('Medium Payment', 'payment', 25000.00, 'TRY', 2, '["finance", "admin"]', uuid_generate_v4()),
    ('Large Payment', 'payment', 75000.00, 'TRY', 3, '["finance", "admin", "admin"]', uuid_generate_v4()),
    
    -- Investment rules
    ('Small Investment', 'investment', 25000.00, 'TRY', 2, '["finance", "admin"]', uuid_generate_v4()),
    ('Large Investment', 'investment', 100000.00, 'TRY', 3, '["finance", "admin", "admin"]', uuid_generate_v4()),
    
    -- Withdrawal rules
    ('ATM Withdrawal', 'withdrawal', 2000.00, 'TRY', 1, '["finance"]', uuid_generate_v4()),
    ('Bank Withdrawal', 'withdrawal', 20000.00, 'TRY', 2, '["finance", "admin"]', uuid_generate_v4()),
    
    -- Loan rules (always requires high approval)
    ('Personal Loan', 'loan', 0.00, 'TRY', 3, '["finance", "admin", "admin"]', uuid_generate_v4()),
    ('Business Loan', 'loan', 0.00, 'TRY', 3, '["finance", "admin", "admin"]', uuid_generate_v4());

-- Insert sample risk assessment data (for testing)
INSERT INTO approval_system.risk_assessments (
    transaction_id, risk_score, risk_level, risk_factors, assessment_method
) VALUES 
    (uuid_generate_v4(), 15.5, 'low', '{"amount_factor": 10, "time_factor": 5, "location_factor": 0}', 'rule_based'),
    (uuid_generate_v4(), 35.0, 'medium', '{"amount_factor": 20, "time_factor": 10, "location_factor": 5}', 'rule_based'),
    (uuid_generate_v4(), 65.5, 'high', '{"amount_factor": 30, "time_factor": 20, "location_factor": 15}', 'rule_based'),
    (uuid_generate_v4(), 85.0, 'critical', '{"amount_factor": 30, "time_factor": 25, "location_factor": 25, "fraud_indicators": ["unusual_pattern"]}', 'ml_model');

-- Create a view for active approval rules
CREATE VIEW approval_system.active_rules AS
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
FROM approval_system.approval_rules 
WHERE is_active = true
ORDER BY transaction_type, amount_threshold;

-- Create a view for pending workflows
CREATE VIEW approval_system.pending_workflows AS
SELECT 
    w.id,
    w.transaction_id,
    w.requester_id,
    w.current_level,
    w.total_levels,
    w.risk_score,
    w.created_at,
    r.name as rule_name,
    r.transaction_type
FROM approval_system.approval_workflows w
JOIN approval_system.approval_rules r ON w.rule_id = r.id
WHERE w.status = 'pending'
ORDER BY w.risk_score DESC, w.created_at ASC;

-- Create a function to get approval statistics
CREATE OR REPLACE FUNCTION approval_system.get_approval_stats(
    start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    total_workflows BIGINT,
    approved_workflows BIGINT,
    rejected_workflows BIGINT,
    pending_workflows BIGINT,
    avg_processing_time INTERVAL,
    avg_risk_score DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_workflows,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_workflows,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_workflows,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_workflows,
        AVG(completed_at - created_at) FILTER (WHERE completed_at IS NOT NULL) as avg_processing_time,
        AVG(risk_score) as avg_risk_score
    FROM approval_system.approval_workflows
    WHERE created_at::DATE BETWEEN start_date AND end_date;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions on views and functions
GRANT SELECT ON approval_system.active_rules TO finbot_user;
GRANT SELECT ON approval_system.pending_workflows TO finbot_user;
GRANT EXECUTE ON FUNCTION approval_system.get_approval_stats TO finbot_user;