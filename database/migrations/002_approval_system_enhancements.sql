-- FinBot v4 - Approval System Database Schema Enhancements
-- Migration: 002_approval_system_enhancements.sql
-- Description: Add performance optimizations, additional indexes, and audit improvements

-- Add additional performance indexes for complex queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_compound_performance 
ON approval_workflows(status, current_level, created_at, requester_id) 
WHERE status IN ('pending', 'escalated');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_actions_compound_audit 
ON approval_actions(workflow_id, approver_id, created_at, action);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_delivery_tracking 
ON approval_notifications(status, created_at, retry_count) 
WHERE status IN ('pending', 'failed');

-- Add GIN indexes for JSONB columns for better query performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_approval_rules_conditions_gin 
ON approval_rules USING GIN(conditions);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_metadata_gin 
ON approval_workflows USING GIN(metadata);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_factors_gin 
ON risk_assessments USING GIN(risk_factors);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fraud_indicators_gin 
ON risk_assessments USING GIN(fraud_indicators);

-- Add specialized indexes for time-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_time_range 
ON approval_workflows(created_at, completed_at, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_actions_time_series 
ON approval_actions(created_at, action, approver_id);

-- Add indexes for delegation and escalation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_actions_delegation_tracking 
ON approval_actions(delegated_to, action, created_at) 
WHERE action = 'delegate';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workflows_escalation 
ON approval_workflows(status, current_level, created_at) 
WHERE status = 'escalated';

-- Create materialized view for approval analytics
CREATE MATERIALIZED VIEW approval_analytics_daily AS
SELECT 
    DATE_TRUNC('day', w.created_at) as date,
    w.status,
    r.transaction_type,
    COUNT(*) as workflow_count,
    AVG(w.risk_score) as avg_risk_score,
    AVG(CASE 
        WHEN w.completed_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (w.completed_at - w.created_at))/3600 
        ELSE NULL 
    END) as avg_completion_hours,
    COUNT(CASE WHEN w.emergency_override THEN 1 END) as emergency_overrides,
    COUNT(CASE WHEN w.current_level > 1 THEN 1 END) as multi_level_approvals
FROM approval_workflows w
LEFT JOIN approval_rules r ON w.rule_id = r.id
WHERE w.created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY DATE_TRUNC('day', w.created_at), w.status, r.transaction_type;

-- Create unique index on materialized view
CREATE UNIQUE INDEX idx_approval_analytics_daily_unique 
ON approval_analytics_daily(date, status, COALESCE(transaction_type, 'unknown'));

-- Create function to refresh analytics
CREATE OR REPLACE FUNCTION refresh_approval_analytics()
RETURNS void AS $
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY approval_analytics_daily;
END;
$ LANGUAGE plpgsql;

-- Add approval workflow state validation function
CREATE OR REPLACE FUNCTION validate_workflow_state_transition()
RETURNS TRIGGER AS $
BEGIN
    -- Validate state transitions
    IF OLD.status IS NOT NULL AND OLD.status != NEW.status THEN
        -- Define valid state transitions
        IF NOT (
            (OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected', 'cancelled', 'escalated', 'expired')) OR
            (OLD.status = 'escalated' AND NEW.status IN ('approved', 'rejected', 'cancelled', 'pending')) OR
            (OLD.status = 'expired' AND NEW.status IN ('cancelled', 'pending'))
        ) THEN
            RAISE EXCEPTION 'Invalid workflow state transition from % to %', OLD.status, NEW.status;
        END IF;
    END IF;
    
    -- Validate level progression
    IF OLD.current_level IS NOT NULL AND NEW.current_level != OLD.current_level THEN
        IF NEW.current_level < 1 OR NEW.current_level > NEW.total_levels THEN
            RAISE EXCEPTION 'Invalid approval level: % (must be between 1 and %)', NEW.current_level, NEW.total_levels;
        END IF;
    END IF;
    
    -- Set completion timestamp for final states
    IF NEW.status IN ('approved', 'rejected', 'cancelled') AND NEW.completed_at IS NULL THEN
        NEW.completed_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

-- Add the validation trigger
DROP TRIGGER IF EXISTS validate_workflow_state ON approval_workflows;
CREATE TRIGGER validate_workflow_state
    BEFORE UPDATE ON approval_workflows
    FOR EACH ROW EXECUTE FUNCTION validate_workflow_state_transition();

-- Add function for automatic workflow expiration
CREATE OR REPLACE FUNCTION expire_stale_workflows()
RETURNS INTEGER AS $
DECLARE
    expired_count INTEGER;
BEGIN
    -- Expire workflows that have been pending for more than 7 days
    UPDATE approval_workflows 
    SET status = 'expired', 
        completed_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || '{"expired_reason": "timeout", "expired_at": "' || NOW() || '"}'
    WHERE status = 'pending' 
    AND created_at < NOW() - INTERVAL '7 days'
    AND NOT COALESCE((metadata->>'no_expiry')::boolean, false);
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    -- Log expiration events
    INSERT INTO approval_actions (workflow_id, approver_id, level, action, comments)
    SELECT id, requester_id, current_level, 'expire', 'Automatically expired due to timeout'
    FROM approval_workflows 
    WHERE status = 'expired' 
    AND completed_at > NOW() - INTERVAL '1 minute';
    
    RETURN expired_count;
END;
$ LANGUAGE plpgsql;

-- Add notification retry logic function
CREATE OR REPLACE FUNCTION retry_failed_notifications()
RETURNS INTEGER AS $
DECLARE
    retry_count INTEGER;
BEGIN
    -- Retry failed notifications that haven't exceeded max retry count
    UPDATE approval_notifications 
    SET status = 'pending',
        retry_count = retry_count + 1,
        created_at = NOW()
    WHERE status = 'failed' 
    AND retry_count < 3
    AND created_at < NOW() - INTERVAL '1 hour';
    
    GET DIAGNOSTICS retry_count = ROW_COUNT;
    
    RETURN retry_count;
END;
$ LANGUAGE plpgsql;

-- Add approval performance metrics function
CREATE OR REPLACE FUNCTION get_approval_metrics(
    start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    metric_name TEXT,
    metric_value NUMERIC,
    metric_unit TEXT
) AS $
BEGIN
    RETURN QUERY
    SELECT 'total_workflows'::TEXT, COUNT(*)::NUMERIC, 'count'::TEXT
    FROM approval_workflows 
    WHERE created_at::DATE BETWEEN start_date AND end_date
    
    UNION ALL
    
    SELECT 'avg_approval_time'::TEXT, 
           AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600)::NUMERIC, 
           'hours'::TEXT
    FROM approval_workflows 
    WHERE completed_at IS NOT NULL 
    AND created_at::DATE BETWEEN start_date AND end_date
    
    UNION ALL
    
    SELECT 'approval_rate'::TEXT,
           (COUNT(CASE WHEN status = 'approved' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0))::NUMERIC,
           'percentage'::TEXT
    FROM approval_workflows 
    WHERE status IN ('approved', 'rejected')
    AND created_at::DATE BETWEEN start_date AND end_date
    
    UNION ALL
    
    SELECT 'avg_risk_score'::TEXT,
           AVG(risk_score)::NUMERIC,
           'score'::TEXT
    FROM approval_workflows 
    WHERE created_at::DATE BETWEEN start_date AND end_date
    
    UNION ALL
    
    SELECT 'emergency_override_rate'::TEXT,
           (COUNT(CASE WHEN emergency_override THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0))::NUMERIC,
           'percentage'::TEXT
    FROM approval_workflows 
    WHERE created_at::DATE BETWEEN start_date AND end_date;
END;
$ LANGUAGE plpgsql;

-- Add function to get pending approvals for a user
CREATE OR REPLACE FUNCTION get_user_pending_approvals(user_id UUID)
RETURNS TABLE(
    workflow_id UUID,
    transaction_id UUID,
    requester_name TEXT,
    transaction_type TEXT,
    amount DECIMAL,
    currency TEXT,
    risk_score DECIMAL,
    created_at TIMESTAMP WITH TIME ZONE,
    required_role TEXT,
    priority INTEGER
) AS $
BEGIN
    RETURN QUERY
    SELECT 
        w.id,
        w.transaction_id,
        'User ' || w.requester_id::TEXT as requester_name, -- Replace with actual user lookup
        r.transaction_type,
        (w.metadata->>'amount')::DECIMAL as amount,
        COALESCE(r.currency, 'USD') as currency,
        w.risk_score,
        w.created_at,
        (r.required_roles->>((w.current_level - 1)::INT))::TEXT as required_role,
        COALESCE((w.metadata->>'priority')::INTEGER, 1) as priority
    FROM approval_workflows w
    LEFT JOIN approval_rules r ON w.rule_id = r.id
    WHERE w.status = 'pending'
    AND (
        -- User has required role for current level
        (r.required_roles->>((w.current_level - 1)::INT))::TEXT = 'any' OR
        user_id IN (
            SELECT unnest(string_to_array(r.required_roles->>((w.current_level - 1)::INT), ','))::UUID
        )
    )
    ORDER BY 
        COALESCE((w.metadata->>'priority')::INTEGER, 1) DESC,
        w.risk_score DESC,
        w.created_at ASC;
END;
$ LANGUAGE plpgsql;

-- Add constraint to prevent duplicate active rules for same criteria
CREATE UNIQUE INDEX idx_approval_rules_unique_active 
ON approval_rules(transaction_type, amount_threshold, currency) 
WHERE is_active = true AND amount_threshold IS NOT NULL;

-- Add partial unique index for rules without amount threshold
CREATE UNIQUE INDEX idx_approval_rules_unique_active_no_threshold 
ON approval_rules(transaction_type, currency) 
WHERE is_active = true AND amount_threshold IS NULL;

-- Add check constraint for notification retry logic
ALTER TABLE approval_notifications 
ADD CONSTRAINT check_retry_count CHECK (retry_count >= 0 AND retry_count <= 5);

-- Add check constraint for workflow metadata
ALTER TABLE approval_workflows 
ADD CONSTRAINT check_metadata_structure CHECK (
    metadata IS NULL OR (
        jsonb_typeof(metadata) = 'object' AND
        (metadata ? 'priority' IS FALSE OR (metadata->>'priority')::INTEGER BETWEEN 1 AND 5)
    )
);

-- Create function for bulk approval operations
CREATE OR REPLACE FUNCTION bulk_approve_workflows(
    workflow_ids UUID[],
    approver_id UUID,
    comments TEXT DEFAULT NULL
)
RETURNS TABLE(
    workflow_id UUID,
    success BOOLEAN,
    message TEXT
) AS $
DECLARE
    wf_id UUID;
    current_workflow RECORD;
BEGIN
    FOREACH wf_id IN ARRAY workflow_ids
    LOOP
        BEGIN
            -- Get current workflow state
            SELECT * INTO current_workflow 
            FROM approval_workflows 
            WHERE id = wf_id AND status = 'pending';
            
            IF NOT FOUND THEN
                RETURN QUERY SELECT wf_id, false, 'Workflow not found or not pending';
                CONTINUE;
            END IF;
            
            -- Insert approval action
            INSERT INTO approval_actions (
                workflow_id, approver_id, level, action, comments
            ) VALUES (
                wf_id, approver_id, current_workflow.current_level, 'approve', comments
            );
            
            -- Update workflow status
            IF current_workflow.current_level >= current_workflow.total_levels THEN
                UPDATE approval_workflows 
                SET status = 'approved', completed_at = NOW()
                WHERE id = wf_id;
            ELSE
                UPDATE approval_workflows 
                SET current_level = current_level + 1
                WHERE id = wf_id;
            END IF;
            
            RETURN QUERY SELECT wf_id, true, 'Approved successfully';
            
        EXCEPTION WHEN OTHERS THEN
            RETURN QUERY SELECT wf_id, false, SQLERRM;
        END;
    END LOOP;
END;
$ LANGUAGE plpgsql;

-- Add database maintenance function
CREATE OR REPLACE FUNCTION cleanup_old_approval_data()
RETURNS TEXT AS $
DECLARE
    deleted_notifications INTEGER;
    deleted_assessments INTEGER;
    archived_workflows INTEGER;
BEGIN
    -- Delete old notifications (older than 90 days)
    DELETE FROM approval_notifications 
    WHERE created_at < NOW() - INTERVAL '90 days'
    AND status IN ('delivered', 'failed', 'cancelled');
    GET DIAGNOSTICS deleted_notifications = ROW_COUNT;
    
    -- Delete old risk assessments for completed workflows (older than 1 year)
    DELETE FROM risk_assessments 
    WHERE created_at < NOW() - INTERVAL '1 year'
    AND workflow_id IN (
        SELECT id FROM approval_workflows 
        WHERE status IN ('approved', 'rejected', 'cancelled')
        AND completed_at < NOW() - INTERVAL '1 year'
    );
    GET DIAGNOSTICS deleted_assessments = ROW_COUNT;
    
    -- Archive old completed workflows (move to archive table if exists)
    -- For now, just count them
    SELECT COUNT(*) INTO archived_workflows
    FROM approval_workflows 
    WHERE completed_at < NOW() - INTERVAL '2 years'
    AND status IN ('approved', 'rejected', 'cancelled');
    
    RETURN format('Cleanup completed: %s notifications, %s assessments, %s workflows ready for archive',
                  deleted_notifications, deleted_assessments, archived_workflows);
END;
$ LANGUAGE plpgsql;

-- Create scheduled job function (requires pg_cron extension)
-- SELECT cron.schedule('expire-workflows', '0 */6 * * *', 'SELECT expire_stale_workflows();');
-- SELECT cron.schedule('retry-notifications', '*/15 * * * *', 'SELECT retry_failed_notifications();');
-- SELECT cron.schedule('refresh-analytics', '0 1 * * *', 'SELECT refresh_approval_analytics();');

-- Add helpful views for monitoring and reporting
CREATE VIEW workflow_performance_summary AS
SELECT 
    r.transaction_type,
    COUNT(*) as total_workflows,
    COUNT(CASE WHEN w.status = 'approved' THEN 1 END) as approved_count,
    COUNT(CASE WHEN w.status = 'rejected' THEN 1 END) as rejected_count,
    COUNT(CASE WHEN w.status = 'pending' THEN 1 END) as pending_count,
    AVG(CASE WHEN w.completed_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (w.completed_at - w.created_at))/3600 
        ELSE NULL END) as avg_completion_hours,
    AVG(w.risk_score) as avg_risk_score,
    COUNT(CASE WHEN w.emergency_override THEN 1 END) as emergency_overrides
FROM approval_workflows w
LEFT JOIN approval_rules r ON w.rule_id = r.id
WHERE w.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY r.transaction_type;

CREATE VIEW approver_workload AS
SELECT 
    a.approver_id,
    COUNT(*) as total_actions,
    COUNT(CASE WHEN a.action = 'approve' THEN 1 END) as approvals,
    COUNT(CASE WHEN a.action = 'reject' THEN 1 END) as rejections,
    COUNT(CASE WHEN a.action = 'delegate' THEN 1 END) as delegations,
    AVG(EXTRACT(EPOCH FROM (a.created_at - w.created_at))/3600) as avg_response_hours
FROM approval_actions a
JOIN approval_workflows w ON a.workflow_id = w.id
WHERE a.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY a.approver_id;

-- Add comments for new objects
COMMENT ON MATERIALIZED VIEW approval_analytics_daily IS 'Daily aggregated analytics for approval workflows performance monitoring';
COMMENT ON FUNCTION expire_stale_workflows() IS 'Automatically expires workflows that have been pending beyond the timeout period';
COMMENT ON FUNCTION retry_failed_notifications() IS 'Retries failed notifications that haven not exceeded maximum retry count';
COMMENT ON FUNCTION get_approval_metrics(DATE, DATE) IS 'Returns key approval system metrics for a given date range';
COMMENT ON FUNCTION get_user_pending_approvals(UUID) IS 'Returns pending approval workflows assigned to a specific user';
COMMENT ON FUNCTION bulk_approve_workflows(UUID[], UUID, TEXT) IS 'Performs bulk approval operations on multiple workflows';
COMMENT ON FUNCTION cleanup_old_approval_data() IS 'Maintenance function to clean up old approval system data';

-- Migration completed successfully
SELECT 'Approval System database enhancements completed successfully' as result;