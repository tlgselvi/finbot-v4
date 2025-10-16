/**
 * FinBot v4 - Replica Query Router
 * Intelligent query routing between master and read replicas
 */

import { DatabaseReplicaManager } from './replica-manager';

interface QueryAnalysis {
  isReadOnly: boolean;
  complexity: 'low' | 'medium' | 'high';
  estimatedRows: number;
  tables: string[];
  hasJoins: boolean;
  hasAggregations: boolean;
}

interface RoutingOptions {
  forceReplica?: boolean;
  forceMaster?: boolean;
  maxLag?: number; // Maximum acceptable replication lag in seconds
  region?: string;
  timeout?: number;
}

export class ReplicaQueryRouter {
  private replicationLag = new Map<string, number>();
  private queryPatterns = new Map<string, QueryAnalysis>();

  constructor(private replicaManager: DatabaseReplicaManager) {
    this.initializeQueryPatterns();
    this.startLagMonitoring();
  }

  /**
   * Route query to appropriate database
   */
  async routeQuery<T = any>(
    query: string,
    params: any[] = [],
    options: RoutingOptions = {}
  ): Promise<{ rows: T[]; rowCount: number; duration: number; source: string }> {
    const analysis = this.analyzeQuery(query);
    const routing = this.determineRouting(analysis, options);

    if (routing.useReplica) {
      return this.replicaManager.executeReadQuery(query, params, {
        preferReplica: true,
        region: options.region,
        timeout: options.timeout
      });
    } else {
      return this.replicaManager.executeWriteQuery(query, params, {
        timeout: options.timeout
      });
    }
  }

  /**
   * Analyze query to determine characteristics
   */
  private analyzeQuery(query: string): QueryAnalysis {
    const normalizedQuery = query.trim().toLowerCase();
    
    // Check cache first
    const cacheKey = this.generateQueryCacheKey(normalizedQuery);
    if (this.queryPatterns.has(cacheKey)) {
      return this.queryPatterns.get(cacheKey)!;
    }

    const analysis: QueryAnalysis = {
      isReadOnly: this.isReadOnlyQuery(normalizedQuery),
      complexity: this.assessComplexity(normalizedQuery),
      estimatedRows: this.estimateRowCount(normalizedQuery),
      tables: this.extractTables(normalizedQuery),
      hasJoins: this.hasJoins(normalizedQuery),
      hasAggregations: this.hasAggregations(normalizedQuery)
    };

    // Cache the analysis
    this.queryPatterns.set(cacheKey, analysis);
    
    return analysis;
  }

  /**
   * Determine routing strategy
   */
  private determineRouting(
    analysis: QueryAnalysis,
    options: RoutingOptions
  ): { useReplica: boolean; reason: string } {
    // Force routing if specified
    if (options.forceMaster) {
      return { useReplica: false, reason: 'forced_master' };
    }
    
    if (options.forceReplica && analysis.isReadOnly) {
      return { useReplica: true, reason: 'forced_replica' };
    }

    // Write queries always go to master
    if (!analysis.isReadOnly) {
      return { useReplica: false, reason: 'write_query' };
    }

    // Check replication lag constraints
    if (options.maxLag !== undefined) {
      const hasAcceptableLag = this.hasReplicasWithAcceptableLag(options.maxLag);
      if (!hasAcceptableLag) {
        return { useReplica: false, reason: 'replication_lag_too_high' };
      }
    }

    // Complex queries might be better on master (more resources)
    if (analysis.complexity === 'high' && analysis.estimatedRows > 10000) {
      return { useReplica: false, reason: 'complex_query_high_volume' };
    }

    // Queries on critical tables might need fresh data
    const criticalTables = ['approval_workflows', 'approval_actions', 'risk_assessments'];
    const touchesCriticalTables = analysis.tables.some(table => 
      criticalTables.includes(table)
    );
    
    if (touchesCriticalTables && !options.forceReplica) {
      // Allow some lag for critical tables, but prefer fresher data
      const maxCriticalLag = options.maxLag || 5; // 5 seconds default
      const hasAcceptableLag = this.hasReplicasWithAcceptableLag(maxCriticalLag);
      if (!hasAcceptableLag) {
        return { useReplica: false, reason: 'critical_table_fresh_data_needed' };
      }
    }

    // Default to replica for read queries
    return { useReplica: true, reason: 'read_only_query' };
  }

  /**
   * Check if query is read-only
   */
  private isReadOnlyQuery(query: string): boolean {
    const writeKeywords = [
      'insert', 'update', 'delete', 'create', 'drop', 'alter',
      'truncate', 'replace', 'merge', 'call', 'exec'
    ];
    
    const firstWord = query.split(/\s+/)[0];
    return !writeKeywords.includes(firstWord);
  }

  /**
   * Assess query complexity
   */
  private assessComplexity(query: string): 'low' | 'medium' | 'high' {
    let complexity = 0;
    
    // Count joins
    const joinCount = (query.match(/\b(join|left join|right join|inner join|outer join)\b/g) || []).length;
    complexity += joinCount * 2;
    
    // Count subqueries
    const subqueryCount = (query.match(/\(/g) || []).length;
    complexity += subqueryCount;
    
    // Count aggregations
    const aggregationCount = (query.match(/\b(count|sum|avg|max|min|group by|having)\b/g) || []).length;
    complexity += aggregationCount * 1.5;
    
    // Count window functions
    const windowFunctionCount = (query.match(/\bover\s*\(/g) || []).length;
    complexity += windowFunctionCount * 3;
    
    // Count CTEs
    const cteCount = (query.match(/\bwith\b/g) || []).length;
    complexity += cteCount * 2;
    
    if (complexity <= 3) return 'low';
    if (complexity <= 8) return 'medium';
    return 'high';
  }

  /**
   * Estimate row count based on query patterns
   */
  private estimateRowCount(query: string): number {
    // Simple heuristic based on query patterns
    if (query.includes('limit')) {
      const limitMatch = query.match(/limit\s+(\d+)/);
      if (limitMatch) {
        return parseInt(limitMatch[1]);
      }
    }
    
    // Check for specific table patterns
    if (query.includes('approval_workflows')) {
      if (query.includes('where')) return 100; // Filtered query
      return 1000; // Full table scan
    }
    
    if (query.includes('audit_logs')) {
      return 5000; // Audit logs tend to be large
    }
    
    return 500; // Default estimate
  }

  /**
   * Extract table names from query
   */
  private extractTables(query: string): string[] {
    const tables: string[] = [];
    
    // Simple regex to extract table names (this could be more sophisticated)
    const fromMatch = query.match(/from\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);
    if (fromMatch) {
      fromMatch.forEach(match => {
        const tableName = match.replace(/from\s+/, '');
        tables.push(tableName);
      });
    }
    
    const joinMatches = query.match(/join\s+([a-zA-Z_][a-zA-Z0-9_]*)/g);
    if (joinMatches) {
      joinMatches.forEach(match => {
        const tableName = match.replace(/.*join\s+/, '');
        tables.push(tableName);
      });
    }
    
    return [...new Set(tables)]; // Remove duplicates
  }

  /**
   * Check if query has joins
   */
  private hasJoins(query: string): boolean {
    return /\b(join|left join|right join|inner join|outer join)\b/.test(query);
  }

  /**
   * Check if query has aggregations
   */
  private hasAggregations(query: string): boolean {
    return /\b(count|sum|avg|max|min|group by|having)\b/.test(query);
  }

  /**
   * Generate cache key for query pattern
   */
  private generateQueryCacheKey(query: string): string {
    // Normalize query by removing specific values
    const normalized = query
      .replace(/\$\d+/g, '$?') // Replace parameter placeholders
      .replace(/\b\d+\b/g, '?') // Replace numbers
      .replace(/'[^']*'/g, "'?'") // Replace string literals
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    return normalized;
  }

  /**
   * Check if replicas have acceptable lag
   */
  private hasReplicasWithAcceptableLag(maxLag: number): boolean {
    const stats = this.replicaManager.getStats();
    
    return stats.replicas.some(replica => {
      if (!replica.isHealthy) return false;
      
      const lag = this.replicationLag.get(replica.id) || 0;
      return lag <= maxLag;
    });
  }

  /**
   * Initialize common query patterns
   */
  private initializeQueryPatterns() {
    // Pre-cache common query patterns
    const commonPatterns = [
      'select * from approval_workflows where status = $?',
      'select count(*) from approval_workflows',
      'select * from approval_workflows where id = $?',
      'select * from users where id = $?',
      'select * from approval_rules where is_active = true'
    ];

    commonPatterns.forEach(pattern => {
      const analysis = this.analyzeQuery(pattern);
      this.queryPatterns.set(pattern, analysis);
    });
  }

  /**
   * Start monitoring replication lag
   */
  private startLagMonitoring() {
    setInterval(async () => {
      await this.measureReplicationLag();
    }, 10000); // Check every 10 seconds
  }

  /**
   * Measure replication lag for all replicas
   */
  private async measureReplicationLag() {
    const stats = this.replicaManager.getStats();
    
    for (const replica of stats.replicas) {
      if (!replica.isHealthy) continue;
      
      try {
        // Simple lag measurement using timestamp comparison
        const masterResult = await this.replicaManager.executeWriteQuery(
          'SELECT EXTRACT(EPOCH FROM NOW()) as timestamp'
        );
        
        const replicaResult = await this.replicaManager.executeReadQuery(
          'SELECT EXTRACT(EPOCH FROM NOW()) as timestamp',
          [],
          { preferReplica: true, region: replica.region }
        );
        
        if (masterResult.source === 'master' && replicaResult.source !== 'master') {
          const masterTime = parseFloat(masterResult.rows[0].timestamp);
          const replicaTime = parseFloat(replicaResult.rows[0].timestamp);
          const lag = Math.abs(masterTime - replicaTime);
          
          this.replicationLag.set(replica.id, lag);
        }
      } catch (error) {
        console.error(`Failed to measure lag for replica ${replica.id}:`, error);
        // Set high lag value to discourage use
        this.replicationLag.set(replica.id, 999);
      }
    }
  }

  /**
   * Get routing statistics
   */
  getRoutingStats() {
    const stats = this.replicaManager.getStats();
    
    return {
      ...stats,
      replicationLag: Object.fromEntries(this.replicationLag),
      queryPatternsCached: this.queryPatterns.size,
      routing: {
        totalQueries: stats.stats.totalQueries,
        masterQueries: stats.stats.masterQueries,
        replicaQueries: stats.stats.replicaQueries,
        replicaUtilization: stats.stats.replicaUtilization
      }
    };
  }

  /**
   * Clear query pattern cache
   */
  clearQueryPatternCache() {
    this.queryPatterns.clear();
    this.initializeQueryPatterns();
  }
}