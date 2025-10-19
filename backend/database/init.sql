-- FinBot Database Initialization Script
-- This script sets up the initial database configuration

-- Create database if it doesn't exist (for Docker initialization)
-- Note: This will only run if the database doesn't exist

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for additional encryption functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create indexes for better performance (these will be created by Prisma migrations)
-- This file serves as documentation and backup

-- Performance optimization settings
-- These can be adjusted based on your server specifications

-- Shared memory settings (adjust based on available RAM)
-- shared_buffers = 256MB (for 1GB RAM server)
-- effective_cache_size = 1GB (for 1GB RAM server)

-- Connection settings
-- max_connections = 100

-- Write-ahead logging settings for better performance
-- wal_buffers = 16MB
-- checkpoint_completion_target = 0.9

-- Query planner settings
-- random_page_cost = 1.1 (for SSD storage)
-- effective_io_concurrency = 200 (for SSD storage)

-- Maintenance settings
-- maintenance_work_mem = 64MB
-- autovacuum = on

-- Logging settings for monitoring
-- log_statement = 'mod' (log all modifications)
-- log_min_duration_statement = 1000 (log slow queries > 1s)

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- This function will be used by Prisma migrations to automatically update timestamps

-- Create a function for audit logging
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
BEGIN
    -- This function can be extended to automatically create audit logs
    -- for sensitive table changes
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

-- Performance monitoring views
-- These views help monitor database performance

CREATE OR REPLACE VIEW slow_queries AS
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    rows,
    100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
ORDER BY mean_time DESC;

-- Table size monitoring
CREATE OR REPLACE VIEW table_sizes AS
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_stats
JOIN pg_tables ON pg_stats.tablename = pg_tables.tablename
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index usage monitoring
CREATE OR REPLACE VIEW index_usage AS
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
ORDER BY idx_tup_read DESC;

-- Connection monitoring
CREATE OR REPLACE VIEW active_connections AS
SELECT 
    pid,
    usename,
    application_name,
    client_addr,
    state,
    query_start,
    state_change,
    query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY query_start;

-- Database statistics
CREATE OR REPLACE VIEW db_stats AS
SELECT 
    datname,
    numbackends,
    xact_commit,
    xact_rollback,
    blks_read,
    blks_hit,
    tup_returned,
    tup_fetched,
    tup_inserted,
    tup_updated,
    tup_deleted
FROM pg_stat_database
WHERE datname = current_database();

-- Grant necessary permissions for monitoring
-- These will be adjusted based on your user setup

COMMENT ON DATABASE postgres IS 'FinBot AI Financial Analytics Database';

-- Create a maintenance function for regular cleanup
CREATE OR REPLACE FUNCTION maintenance_cleanup()
RETURNS void AS $$
BEGIN
    -- Clean up old audit logs (older than 2 years)
    DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '2 years';
    
    -- Clean up expired sessions
    DELETE FROM user_sessions WHERE expires_at < NOW();
    
    -- Clean up old notifications (older than 6 months)
    DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '6 months' AND status = 'READ';
    
    -- Update statistics
    ANALYZE;
    
    RAISE NOTICE 'Maintenance cleanup completed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule maintenance (this would typically be done via cron or pg_cron extension)
-- SELECT cron.schedule('maintenance-cleanup', '0 2 * * 0', 'SELECT maintenance_cleanup();');

COMMENT ON FUNCTION maintenance_cleanup() IS 'Regular maintenance function to clean up old data and update statistics';

-- Create backup function
CREATE OR REPLACE FUNCTION create_backup_info()
RETURNS TABLE(
    backup_time timestamp,
    database_size text,
    table_count bigint,
    user_count bigint,
    transaction_count bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        NOW() as backup_time,
        pg_size_pretty(pg_database_size(current_database())) as database_size,
        (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') as table_count,
        (SELECT count(*) FROM users) as user_count,
        (SELECT count(*) FROM transactions) as transaction_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_backup_info() IS 'Generate backup information and statistics';

-- Security settings
-- Row Level Security will be configured per table as needed

-- Create a function to validate email addresses
CREATE OR REPLACE FUNCTION is_valid_email(email text)
RETURNS boolean AS $$
BEGIN
    RETURN email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$';
END;
$$ LANGUAGE plpgsql;

-- Create a function to generate secure random tokens
CREATE OR REPLACE FUNCTION generate_secure_token(length integer DEFAULT 32)
RETURNS text AS $$
BEGIN
    RETURN encode(gen_random_bytes(length), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Performance optimization: Create partial indexes for common queries
-- These will be created by Prisma migrations, but documented here

-- Example partial indexes (will be created by migrations):
-- CREATE INDEX CONCURRENTLY idx_transactions_user_date ON transactions(user_id, transaction_date) WHERE status = 'COMPLETED';
-- CREATE INDEX CONCURRENTLY idx_notifications_pending ON notifications(user_id, scheduled_at) WHERE status = 'PENDING';
-- CREATE INDEX CONCURRENTLY idx_goals_active ON goals(user_id, target_date) WHERE status = 'ACTIVE';

-- Logging configuration
-- Enable query logging for performance monitoring
-- ALTER SYSTEM SET log_statement = 'mod';
-- ALTER SYSTEM SET log_min_duration_statement = 1000;
-- SELECT pg_reload_conf();

COMMENT ON SCHEMA public IS 'FinBot AI Financial Analytics - Main application schema';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'FinBot database initialization completed successfully!';
    RAISE NOTICE 'Database: %', current_database();
    RAISE NOTICE 'Version: %', version();
    RAISE NOTICE 'Time: %', NOW();
END $$;