/**
 * FinBot v4 - Database Replica Manager
 * Read replica management with automatic failover and load balancing
 */

import { Pool, PoolClient } from 'pg';
import { EventEmitter } from 'events';

interface ReplicaConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: any;
  maxConnections?: number;
  priority?: number; // Higher number = higher priority
  region?: string;
}

interface ReplicaPool {
  pool: Pool;
  config: ReplicaConfig;
  isHealthy: boolean;
  lastHealthCheck: Date;
  connectionCount: number;
  queryCount: number;
  avgResponseTime: number;
  errors: number;
}

interface QueryOptions {
  preferReplica?: boolean;
  maxRetries?: number;
  timeout?: number;
  region?: string;
}

export class DatabaseReplicaManager extends EventEmitter {
  private masterPool: Pool;
  private replicas: Map<string, ReplicaPool> = new Map();
  private healthCheckInterval: NodeJS.Timeout;
  private stats = {
    totalQueries: 0,
    masterQueries: 0,
    replicaQueries: 0,
    failovers: 0,
    errors: 0
  };

  constructor(
    private masterConfig: ReplicaConfig,
    private replicaConfigs: ReplicaConfig[] = []
  ) {
    super();
    this.initializeMaster();
    this.initializeReplicas();
    this.startHealthChecks();
  }

  /**
   * Initialize master database connection
   */
  private initializeMaster() {
    this.masterPool = new Pool({
      host: this.masterConfig.host,
      port: this.masterConfig.port,
      database: this.masterConfig.database,
      user: this.masterConfig.user,
      password: this.masterConfig.password,
      ssl: this.masterConfig.ssl,
      max: this.masterConfig.maxConnections || 20,
      min: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      application_name: 'finbot_v4_master'
    });

    this.masterPool.on('error', (err) => {
      console.error('Master database error:', err);
      this.emit('masterError', err);
    });

    console.log('Master database pool initialized');
  }

  /**
   * Initialize read replica connections
   */
  private initializeReplicas() {
    this.replicaConfigs.forEach((config, index) => {
      const replicaId = `replica_${index}`;
      
      const pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        ssl: config.ssl,
        max: config.maxConnections || 15,
        min: 2,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        application_name: `finbot_v4_${replicaId}`
      });

      pool.on('error', (err) => {
        console.error(`Replica ${replicaId} error:`, err);
        this.markReplicaUnhealthy(replicaId);
        this.emit('replicaError', { replicaId, error: err });
      });

      const replicaPool: ReplicaPool = {
        pool,
        config,
        isHealthy: true,
        lastHealthCheck: new Date(),
        connectionCount: 0,
        queryCount: 0,
        avgResponseTime: 0,
        errors: 0
      };

      this.replicas.set(replicaId, replicaPool);
      console.log(`Replica ${replicaId} initialized (${config.host}:${config.port})`);
    });
  }

  /**
   * Execute read query with replica selection
   */
  async executeReadQuery<T = any>(
    query: string,
    params: any[] = [],
    options: QueryOptions = {}
  ): Promise<{ rows: T[]; rowCount: number; duration: number; source: string }> {
    const startTime = Date.now();
    this.stats.totalQueries++;

    // Determine if we should use replica
    const useReplica = options.preferReplica !== false && this.hasHealthyReplicas();
    
    if (useReplica) {
      try {
        const replica = this.selectBestReplica(options);
        if (replica) {
          const result = await this.executeOnReplica(replica, query, params, options);
          this.stats.replicaQueries++;
          return {
            ...result,
            duration: Date.now() - startTime,
            source: replica
          };
        }
      } catch (error) {
        console.warn('Replica query failed, falling back to master:', error);
        this.stats.failovers++;
      }
    }

    // Fallback to master
    const result = await this.executeOnMaster(query, params, options);
    this.stats.masterQueries++;
    return {
      ...result,
      duration: Date.now() - startTime,
      source: 'master'
    };
  }

  /**
   * Execute write query (always on master)
   */
  async executeWriteQuery<T = any>(
    query: string,
    params: any[] = [],
    options: QueryOptions = {}
  ): Promise<{ rows: T[]; rowCount: number; duration: number; source: string }> {
    const startTime = Date.now();
    this.stats.totalQueries++;
    this.stats.masterQueries++;

    const result = await this.executeOnMaster(query, params, options);
    return {
      ...result,
      duration: Date.now() - startTime,
      source: 'master'
    };
  }

  /**
   * Execute transaction (always on master)
   */
  async executeTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    options: QueryOptions = {}
  ): Promise<T> {
    const client = await this.masterPool.connect();
    
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
  }

  /**
   * Execute query on master database
   */
  private async executeOnMaster(
    query: string,
    params: any[],
    options: QueryOptions
  ): Promise<{ rows: any[]; rowCount: number }> {
    const timeout = options.timeout || 10000;
    const maxRetries = options.maxRetries || 1;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = await Promise.race([
          this.masterPool.connect(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), timeout)
          )
        ]);

        try {
          const result = await client.query(query, params);
          return {
            rows: result.rows,
            rowCount: result.rowCount || 0
          };
        } finally {
          client.release();
        }
      } catch (error) {
        this.stats.errors++;
        
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Execute query on specific replica
   */
  private async executeOnReplica(
    replicaId: string,
    query: string,
    params: any[],
    options: QueryOptions
  ): Promise<{ rows: any[]; rowCount: number }> {
    const replica = this.replicas.get(replicaId);
    if (!replica || !replica.isHealthy) {
      throw new Error(`Replica ${replicaId} is not available`);
    }

    const timeout = options.timeout || 10000;
    const startTime = Date.now();

    try {
      const client = await Promise.race([
        replica.pool.connect(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), timeout)
        )
      ]);

      try {
        const result = await client.query(query, params);
        
        // Update replica stats
        replica.queryCount++;
        replica.connectionCount = replica.pool.totalCount;
        const queryTime = Date.now() - startTime;
        replica.avgResponseTime = (replica.avgResponseTime + queryTime) / 2;

        return {
          rows: result.rows,
          rowCount: result.rowCount || 0
        };
      } finally {
        client.release();
      }
    } catch (error) {
      replica.errors++;
      
      // Mark replica as unhealthy if too many errors
      if (replica.errors > 5) {
        this.markReplicaUnhealthy(replicaId);
      }
      
      throw error;
    }
  }

  /**
   * Select best replica based on load balancing strategy
   */
  private selectBestReplica(options: QueryOptions): string | null {
    const healthyReplicas = Array.from(this.replicas.entries())
      .filter(([, replica]) => replica.isHealthy);

    if (healthyReplicas.length === 0) {
      return null;
    }

    // Region preference
    if (options.region) {
      const regionReplicas = healthyReplicas.filter(
        ([, replica]) => replica.config.region === options.region
      );
      if (regionReplicas.length > 0) {
        return this.selectByLoadBalancing(regionReplicas);
      }
    }

    return this.selectByLoadBalancing(healthyReplicas);
  }

  /**
   * Load balancing selection algorithm
   */
  private selectByLoadBalancing(replicas: [string, ReplicaPool][]): string {
    // Weighted round-robin based on priority and current load
    let bestReplica = replicas[0];
    let bestScore = this.calculateReplicaScore(bestReplica[1]);

    for (const replica of replicas.slice(1)) {
      const score = this.calculateReplicaScore(replica[1]);
      if (score > bestScore) {
        bestReplica = replica;
        bestScore = score;
      }
    }

    return bestReplica[0];
  }

  /**
   * Calculate replica score for load balancing
   */
  private calculateReplicaScore(replica: ReplicaPool): number {
    const priority = replica.config.priority || 1;
    const loadFactor = Math.max(1, replica.connectionCount / 10); // Penalize high load
    const errorFactor = Math.max(1, replica.errors / 5); // Penalize errors
    const responseFactor = Math.max(1, replica.avgResponseTime / 100); // Penalize slow responses

    return priority / (loadFactor * errorFactor * responseFactor);
  }

  /**
   * Check if any healthy replicas are available
   */
  private hasHealthyReplicas(): boolean {
    return Array.from(this.replicas.values()).some(replica => replica.isHealthy);
  }

  /**
   * Mark replica as unhealthy
   */
  private markReplicaUnhealthy(replicaId: string) {
    const replica = this.replicas.get(replicaId);
    if (replica) {
      replica.isHealthy = false;
      console.warn(`Replica ${replicaId} marked as unhealthy`);
      this.emit('replicaUnhealthy', replicaId);
    }
  }

  /**
   * Mark replica as healthy
   */
  private markReplicaHealthy(replicaId: string) {
    const replica = this.replicas.get(replicaId);
    if (replica) {
      replica.isHealthy = true;
      replica.errors = 0; // Reset error count
      console.log(`Replica ${replicaId} marked as healthy`);
      this.emit('replicaHealthy', replicaId);
    }
  }

  /**
   * Start health check monitoring
   */
  private startHealthChecks() {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 30000); // Check every 30 seconds

    console.log('Health check monitoring started');
  }

  /**
   * Perform health checks on all replicas
   */
  private async performHealthChecks() {
    const healthCheckPromises = Array.from(this.replicas.entries()).map(
      async ([replicaId, replica]) => {
        try {
          const client = await Promise.race([
            replica.pool.connect(),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Health check timeout')), 5000)
            )
          ]);

          try {
            await client.query('SELECT 1');
            replica.lastHealthCheck = new Date();
            
            if (!replica.isHealthy) {
              this.markReplicaHealthy(replicaId);
            }
          } finally {
            client.release();
          }
        } catch (error) {
          console.error(`Health check failed for replica ${replicaId}:`, error);
          this.markReplicaUnhealthy(replicaId);
        }
      }
    );

    await Promise.allSettled(healthCheckPromises);
  }

  /**
   * Get replica statistics
   */
  getStats() {
    const replicaStats = Array.from(this.replicas.entries()).map(([id, replica]) => ({
      id,
      host: replica.config.host,
      port: replica.config.port,
      region: replica.config.region,
      isHealthy: replica.isHealthy,
      lastHealthCheck: replica.lastHealthCheck,
      connectionCount: replica.connectionCount,
      queryCount: replica.queryCount,
      avgResponseTime: replica.avgResponseTime,
      errors: replica.errors,
      priority: replica.config.priority || 1
    }));

    return {
      master: {
        host: this.masterConfig.host,
        port: this.masterConfig.port,
        connectionCount: this.masterPool.totalCount,
        idleCount: this.masterPool.idleCount,
        waitingCount: this.masterPool.waitingCount
      },
      replicas: replicaStats,
      stats: {
        ...this.stats,
        replicaUtilization: this.stats.totalQueries > 0 
          ? (this.stats.replicaQueries / this.stats.totalQueries * 100).toFixed(1) + '%'
          : '0%',
        healthyReplicas: replicaStats.filter(r => r.isHealthy).length,
        totalReplicas: replicaStats.length
      }
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('Shutting down database replica manager...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Close all replica connections
    const closePromises = Array.from(this.replicas.values()).map(
      replica => replica.pool.end()
    );

    // Close master connection
    closePromises.push(this.masterPool.end());

    await Promise.all(closePromises);
    console.log('Database connections closed');
  }

  /**
   * Force refresh of replica health status
   */
  async refreshReplicaHealth() {
    await this.performHealthChecks();
  }

  /**
   * Add new replica at runtime
   */
  async addReplica(config: ReplicaConfig): Promise<string> {
    const replicaId = `replica_${Date.now()}`;
    
    const pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      max: config.maxConnections || 15,
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      application_name: `finbot_v4_${replicaId}`
    });

    pool.on('error', (err) => {
      console.error(`Replica ${replicaId} error:`, err);
      this.markReplicaUnhealthy(replicaId);
      this.emit('replicaError', { replicaId, error: err });
    });

    const replicaPool: ReplicaPool = {
      pool,
      config,
      isHealthy: true,
      lastHealthCheck: new Date(),
      connectionCount: 0,
      queryCount: 0,
      avgResponseTime: 0,
      errors: 0
    };

    this.replicas.set(replicaId, replicaPool);
    console.log(`Replica ${replicaId} added (${config.host}:${config.port})`);
    
    return replicaId;
  }

  /**
   * Remove replica
   */
  async removeReplica(replicaId: string): Promise<boolean> {
    const replica = this.replicas.get(replicaId);
    if (!replica) {
      return false;
    }

    await replica.pool.end();
    this.replicas.delete(replicaId);
    console.log(`Replica ${replicaId} removed`);
    
    return true;
  }
}