-- FinBot v4 - Database Indexes for Performance Optimization
-- Optimized indexes for frequent queries

-- Approval Workflows indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_workflows_status 
ON approval_workflows(status) 
WHERE status IN ('pending', 'approved', 'rejected');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_workflows_requester_status 
ON approval_workflows(requester_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_workflows_created_at 
ON approval_workflows(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_workflows_status_created 
ON approval_workflows(status, created_at DESC);

-- Composite index for dashboard queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_workflows_dashboard 
ON approval_workflows(status, created_at DESC, requester_id);

-- Risk Assessments indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_assessments_workflow_id 
ON risk_assessments(workflow_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_assessments_risk_score 
ON risk_assessments(risk_score DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_assessments_risk_level 
ON risk_assessments(risk_level);

-- Approval Actions indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_actions_workflow_id 
ON approval_actions(workflow_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_actions_approver_id 
ON approval_actions(approver_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_actions_workflow_level 
ON approval_actions(workflow_id, level);

-- Composite index for approver queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_actions_approver_workflow 
ON approval_actions(approver_id, workflow_id, level);

-- Approval Rules indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_rules_transaction_type 
ON approval_rules(transaction_type);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_rules_active 
ON approval_rules(is_active) 
WHERE is_active = true;

-- User Roles indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_roles_user_id 
ON user_roles(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_roles_role_name 
ON user_roles(role_name);

-- Composite index for role-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_roles_user_role 
ON user_roles(user_id, role_name);

-- Audit Logs indexes (if exists)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_entity_type_id 
ON audit_logs(entity_type, entity_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_id 
ON audit_logs(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_created_at 
ON audit_logs(created_at DESC);

-- Notifications indexes (if exists)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_id_read 
ON notifications(user_id, is_read);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_created_at 
ON notifications(created_at DESC);

-- Partial indexes for better performance on filtered queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_workflows_pending_high_risk 
ON approval_workflows(created_at DESC) 
WHERE status = 'pending';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_workflows_recent 
ON approval_workflows(id, status, created_at) 
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';

-- GIN indexes for JSON columns (if any)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_assessments_risk_factors_gin 
ON risk_assessments USING GIN(risk_factors);

-- Expression indexes for computed values
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_workflows_processing_time 
ON approval_workflows((EXTRACT(EPOCH FROM (updated_at - created_at)))) 
WHERE status IN ('approved', 'rejected');

-- Indexes for text search (if needed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_workflows_transaction_id_text 
ON approval_workflows USING GIN(to_tsvector('english', transaction_id));

-- Statistics update for better query planning
ANALYZE approval_workflows;
ANALYZE risk_assessments;
ANALYZE approval_actions;
ANALYZE approval_rules;
ANALYZE user_roles;

-- Create materialized view for dashboard statistics (optional)
CREATE MATERIALIZED VIEW IF NOT EXISTS dashboard_stats AS
SELECT 
  COUNT(*) as total_workflows,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
  COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
  COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today_count,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as week_count,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600) FILTER (
    WHERE status IN ('approved', 'rejected')
  ) as avg_processing_hours,
  CURRENT_TIMESTAMP as last_updated
FROM approval_workflows;

-- Index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_stats_last_updated 
ON dashboard_stats(last_updated);

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_dashboard_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_stats;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to refresh stats periodically (optional)
-- This would typically be done via a cron job or scheduled task