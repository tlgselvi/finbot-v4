/**
 * FinBot v4 - Database Configuration
 * Centralized database configuration with replica support
 */

import { DatabaseReplicaManager } from '../db/replica-manager';
import { ReplicaQueryRouter } from '../db/replica-query-router';

// Database configuration
const DATABASE_CONFIG = {
  master: {
    host: process.env.DB_MASTER_HOST || 'localhost',
    port: parseInt(process.env.DB_MASTER_PORT || '5432'),
    database: process.env.DB_NAME || 'finbot_v4',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    maxConnections: 20
  },
  
  replicas: [
    {
      host: process.env.DB_REPLICA_1_HOST || 'localhost',
      port: parseInt(process.env.DB_REPLICA_1_PORT || '5433'),
      database: process.env.DB_NAME || 'finbot_v4',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      maxConnections: 15,
      priority: 1,
      region: 'primary'
    },
    {
      host: process.env.DB_REPLICA_2_HOST || 'localhost',
      port: parseInt(process.env.DB_REPLICA_2_PORT || '5434'),
      database: process.env.DB_NAME || 'finbot_v4',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      maxConnections: 15,
      priority: 2,
      region: 'secondary'
    }
  ]
};

// Initialize replica manager and query router
export const replicaManager = new DatabaseReplicaManager(
  DATABASE_CONFIG.master,
  DATABASE_CONFIG.replicas
);

export const queryRouter = new ReplicaQueryRouter(replicaManager);

// Convenience functions for different query types
export const executeReadQuery = async <T = any>(
  query: string,
  params: any[] = [],
  options: {
    preferReplica?: boolean;
    maxLag?: number;
    region?: string;
    timeout?: number;
  } = {}
) => {
  return queryRouter.routeQuery<T>(query, params, {
    forceReplica: options.preferReplica,
    maxLag: options.maxLag,
    region: options.region,
    timeout: options.timeout
  });
};

export const executeWriteQuery = async <T = any>(
  query: string,
  params: any[] = [],
  options: {
    timeout?: number;
  } = {}
) => {
  return replicaManager.executeWriteQuery<T>(query, params, {
    timeout: options.timeout
  });
};

export const executeTransaction = async <T>(
  callback: (client: any) => Promise<T>
) => {
  return replicaManager.executeTransaction(callback);
};

// Health check function
export const checkDatabaseHealth = async () => {
  const stats = replicaManager.getStats();
  const routingStats = queryRouter.getRoutingStats();
  
  return {
    healthy: stats.master.connectionCount >= 0,
    master: stats.master,
    replicas: stats.replicas,
    routing: routingStats.routing,
    replicationLag: routingStats.replicationLag
  };
};

// Graceful shutdown
export const shutdownDatabase = async () => {
  await replicaManager.shutdown();
};

// Event listeners for monitoring
replicaManager.on('masterError', (error) => {
  console.error('Master database error:', error);
  // Could send alerts here
});

replicaManager.on('replicaError', ({ replicaId, error }) => {
  console.error(`Replica ${replicaId} error:`, error);
  // Could send alerts here
});

replicaManager.on('replicaUnhealthy', (replicaId) => {
  console.warn(`Replica ${replicaId} marked as unhealthy`);
  // Could send alerts here
});

replicaManager.on('replicaHealthy', (replicaId) => {
  console.log(`Replica ${replicaId} is healthy again`);
  // Could send recovery notifications here
});