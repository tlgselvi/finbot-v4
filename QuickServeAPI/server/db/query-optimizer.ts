/**
 * FinBot v4 - Database Query Optimizer
 * Optimized database queries with proper indexing and connection pooling
 */

import { Pool, PoolClient } from 'pg';
import { performance } from 'perf_hooks';

// Connection pool configuration
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'finbot_v4',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  
  // Pool settings for performance
  max: 20, // Maximum number of clients in the pool
  min: 5,  // Minimum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection could not be established
  maxUses: 7500, // Close (and replace) a connection after it has been used 7500 times
  
  // Performance optimizations
  statement_timeout: 10000, // 10 second statement timeout
  query_timeout: 10000,     // 10 second query timeout
  application_name: 'finbot_v4_api',
  
  // SSL configuration for production
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
};

// Create connection pool
export const pool = new Pool(poolConfig);

// Query performance monitoring
interface QueryMetrics {
  query: string;
  duration: number;
  timestamp: Date;
  rowCount?: number;
  error?: string;
}

const queryMetrics: QueryMetrics[] = [];
const MAX_METRICS_HISTORY = 1000;

// Log slow queries (> 1 second)
const logSlowQuery = (metrics: QueryMetrics) => {
  if (metrics.duration > 1000) {
    console.warn(`Slow query detected (${metrics.duration}ms):`, {
      query: metrics.query.substring(0, 200),
      duration: metrics.duration,
      rowCount: metrics.rowCount
    });
  }
};

// Store query metrics
const storeMetrics = (metrics: QueryMetrics) => {
  queryMetrics.push(metrics);
  if (queryMetrics.length > MAX_METRICS_HISTORY) {
    queryMetrics.shift();
  }
  logSlowQuery(metrics);
};

// Optimized query executor with performance monitoring
export const executeQuery = async <T = any>(
  query: string,
  params: any[] = [],
  client?: PoolClient
): Promise<{ rows: T[]; rowCount: number; duration: number }> => {
  const start = performance.now();
  const queryClient = client || pool;
  
  try {
    const result = await queryClient.query(query, params);
    const duration = performance.now() - start;
    
    storeMetrics({
      query,
      duration,
      timestamp: new Date(),
      rowCount: result.rowCount || 0
    });
    
    return {
      rows: result.rows,
      rowCount: result.rowCount || 0,
      duration
    };
  } catch (error) {
    const duration = performance.now() - start;
    
    storeMetrics({
      query,
      duration,
      timestamp: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    throw error;
  }
};

// Transaction wrapper with automatic rollback
export const executeTransaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Optimized approval workflow queries
export class ApprovalWorkflowQueries {
  
  // Get workflows with optimized joins and indexing
  static async getWorkflows(filters: {
    status?: string;
    priority?: string;
    requesterId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
    offset?: number;
  } = {}) {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;
    
    // Build WHERE conditions dynamically
    if (filters.status) {
      conditions.push(`aw.status = $${paramIndex++}`);
      params.push(filters.status);
    }
    
    if (filters.requesterId) {
      conditions.push(`aw.requester_id = $${paramIndex++}`);
      params.push(filters.requesterId);
    }
    
    if (filters.dateFrom) {
      conditions.push(`aw.created_at >= $${paramIndex++}`);
      params.push(filters.dateFrom);
    }
    
    if (filters.dateTo) {
      conditions.push(`aw.created_at <= $${paramIndex++}`);
      params.push(filters.dateTo);
    }
    
    // Priority filter (derived from risk score)
    if (filters.priority) {
      switch (filters.priority) {
        case 'critical':
          conditions.push(`ra.risk_score >= 75`);
          break;
        case 'high':
          conditions.push(`ra.risk_score >= 50 AND ra.risk_score < 75`);
          break;
        case 'medium':
          conditions.push(`ra.risk_score >= 25 AND ra.risk_score < 50`);
          break;
        case 'low':
          conditions.push(`ra.risk_score < 25`);
          break;
      }
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = filters.limit ? `LIMIT $${paramIndex++}` : '';
    const offsetClause = filters.offset ? `OFFSET $${paramIndex++}` : '';
    
    if (filters.limit) params.push(filters.limit);
    if (filters.offset) params.push(filters.offset);
    
    const query = `
      SELECT 
        aw.id,
        aw.transaction_id,
        aw.requester_id,
        aw.current_level,
        aw.total_levels,
        aw.status,
        aw.created_at,
        aw.updated_at,
        ra.risk_score,
        ra.risk_level,
        ar.name as rule_name,
        ar.transaction_type,
        COUNT(*) OVER() as total_count
      FROM approval_workflows aw
      LEFT JOIN risk_assessments ra ON aw.id = ra.workflow_id
      LEFT JOIN approval_rules ar ON aw.rule_id = ar.id
      ${whereClause}
      ORDER BY aw.created_at DESC
      ${limitClause}
      ${offsetClause}
    `;
    
    return executeQuery(query, params);
  }
  
  // Get workflow by ID with all related data
  static async getWorkflowById(workflowId: string) {
    const query = `
      SELECT 
        aw.*,
        ra.risk_score,
        ra.risk_level,
        ra.risk_factors,
        ar.name as rule_name,
        ar.transaction_type,
        ar.required_roles,
        json_agg(
          json_build_object(
            'id', aa.id,
            'approver_id', aa.approver_id,
            'level', aa.level,
            'action', aa.action,
            'comments', aa.comments,
            'created_at', aa.created_at
          ) ORDER BY aa.level, aa.created_at
        ) FILTER (WHERE aa.id IS NOT NULL) as actions
      FROM approval_workflows aw
      LEFT JOIN risk_assessments ra ON aw.id = ra.workflow_id
      LEFT JOIN approval_rules ar ON aw.rule_id = ar.id
      LEFT JOIN approval_actions aa ON aw.id = aa.workflow_id
      WHERE aw.id = $1
      GROUP BY aw.id, ra.risk_score, ra.risk_level, ra.risk_factors, ar.name, ar.transaction_type, ar.required_roles
    `;
    
    return executeQuery(query, [workflowId]);
  }
  
  // Get dashboard statistics with optimized aggregation
  static async getDashboardStats(userId?: string) {
    const userFilter = userId ? 'WHERE aw.requester_id = $1' : '';
    const params = userId ? [userId] : [];
    
    const query = `
      SELECT 
        COUNT(*) as total_workflows,
        COUNT(*) FILTER (WHERE aw.status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE aw.status = 'approved') as approved_count,
        COUNT(*) FILTER (WHERE aw.status = 'rejected') as rejected_count,
        COUNT(*) FILTER (WHERE aw.status = 'cancelled') as cancelled_count,
        COUNT(*) FILTER (WHERE aw.status = 'pending' AND ra.risk_score >= 75) as high_risk_pending,
        AVG(EXTRACT(EPOCH FROM (aw.updated_at - aw.created_at)) / 3600) FILTER (
          WHERE aw.status IN ('approved', 'rejected')
        ) as avg_processing_hours,
        COUNT(*) FILTER (WHERE aw.created_at >= CURRENT_DATE) as today_count,
        COUNT(*) FILTER (WHERE aw.created_at >= CURRENT_DATE - INTERVAL '7 days') as week_count
      FROM approval_workflows aw
      LEFT JOIN risk_assessments ra ON aw.id = ra.workflow_id
      ${userFilter}
    `;
    
    return executeQuery(query, params);
  }
  
  // Get pending workflows for a specific approver
  static async getPendingWorkflowsForApprover(approverId: string, limit = 20) {
    const query = `
      SELECT DISTINCT
        aw.id,
        aw.transaction_id,
        aw.requester_id,
        aw.current_level,
        aw.total_levels,
        aw.status,
        aw.created_at,
        ra.risk_score,
        ra.risk_level,
        ar.name as rule_name,
        ar.transaction_type
      FROM approval_workflows aw
      JOIN approval_rules ar ON aw.rule_id = ar.id
      LEFT JOIN risk_assessments ra ON aw.id = ra.workflow_id
      JOIN user_roles ur ON ur.user_id = $1
      WHERE aw.status = 'pending'
        AND aw.current_level <= array_length(ar.required_roles, 1)
        AND ur.role_name = ANY(ar.required_roles[aw.current_level])
        AND NOT EXISTS (
          SELECT 1 FROM approval_actions aa 
          WHERE aa.workflow_id = aw.id 
            AND aa.approver_id = $1 
            AND aa.level = aw.current_level
        )
      ORDER BY 
        CASE WHEN ra.risk_score >= 75 THEN 1 ELSE 2 END,
        aw.created_at ASC
      LIMIT $2
    `;
    
    return executeQuery(query, [approverId, limit]);
  }
  
  // Batch update workflows (for bulk operations)
  static async batchUpdateWorkflows(
    workflowIds: string[],
    updates: { status?: string; updated_at?: Date }
  ) {
    if (workflowIds.length === 0) return { rows: [], rowCount: 0, duration: 0 };
    
    const setClause: string[] = [];
    const params: any[] = [workflowIds];
    let paramIndex = 2;
    
    if (updates.status) {
      setClause.push(`status = $${paramIndex++}`);
      params.push(updates.status);
    }
    
    if (updates.updated_at) {
      setClause.push(`updated_at = $${paramIndex++}`);
      params.push(updates.updated_at);
    } else {
      setClause.push(`updated_at = CURRENT_TIMESTAMP`);
    }
    
    const query = `
      UPDATE approval_workflows 
      SET ${setClause.join(', ')}
      WHERE id = ANY($1)
      RETURNING id, status, updated_at
    `;
    
    return executeQuery(query, params);
  }
  
  // Get workflow history with pagination
  static async getWorkflowHistory(
    workflowId: string,
    limit = 50,
    offset = 0
  ) {
    const query = `
      SELECT 
        aa.id,
        aa.approver_id,
        aa.level,
        aa.action,
        aa.comments,
        aa.created_at,
        u.name as approver_name,
        u.email as approver_email
      FROM approval_actions aa
      LEFT JOIN users u ON aa.approver_id = u.id
      WHERE aa.workflow_id = $1
      ORDER BY aa.level, aa.created_at
      LIMIT $2 OFFSET $3
    `;
    
    return executeQuery(query, [workflowId, limit, offset]);
  }
}

// Database health check
export const checkDatabaseHealth = async (): Promise<{
  healthy: boolean;
  poolStats: any;
  avgQueryTime: number;
  slowQueries: number;
}> => {
  try {
    const start = performance.now();
    await executeQuery('SELECT 1');
    const queryTime = performance.now() - start;
    
    const recentMetrics = queryMetrics.slice(-100);
    const avgQueryTime = recentMetrics.length > 0 
      ? recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length
      : 0;
    
    const slowQueries = recentMetrics.filter(m => m.duration > 1000).length;
    
    return {
      healthy: true,
      poolStats: {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      },
      avgQueryTime,
      slowQueries
    };
  } catch (error) {
    return {
      healthy: false,
      poolStats: null,
      avgQueryTime: 0,
      slowQueries: 0
    };
  }
};

// Cleanup function for graceful shutdown
export const closePool = async () => {
  await pool.end();
};