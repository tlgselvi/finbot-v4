#!/usr/bin/env node

/**
 * FinBot v4 - Database Deployment Tests
 * Comprehensive tests for PostgreSQL HA cluster, Redis cluster, backup systems
 */

const { execSync } = require('child_process');
const { Client } = require('pg');
const redis = require('redis');
const chalk = require('chalk');

class DatabaseTests {
  constructor() {
    this.testResults = [];
    this.kubectl = 'kubectl';
    this.pgConfig = {
      host: process.env.POSTGRES_HOST || 'postgres-primary.database.svc.cluster.local',
      port: process.env.POSTGRES_PORT || 5432,
      database: process.env.POSTGRES_DB || 'finbot_v4',
      user: process.env.POSTGRES_USER || 'finbot_user',
      password: process.env.POSTGRES_PASSWORD || 'finbot_password_2024'
    };
    this.redisConfig = {
      host: process.env.REDIS_HOST || 'redis-cluster.cache.svc.cluster.local',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || 'redis_password_2024'
    };
  }

  async runAllTests() {
    console.log(chalk.bold('🗄️  Running Database Deployment Tests\n'));

    try {
      await this.testPostgreSQLDeployment();
      await this.testPostgreSQLHA();
      await this.testPostgreSQLPerformance();
      await this.testPostgreSQLBackup();
      await this.testPgBouncerDeployment();
      await this.testRedisClusterDeployment();
      await this.testRedisClusterHA();
      await this.testRedisPerformance();
      await this.testDatabaseConnectivity();
      await this.testDatabaseSecurity();
      
      this.printResults();
      
      const failedTests = this.testResults.filter(r => !r.passed).length;
      if (failedTests > 0) {
        console.log(chalk.red(`\n❌ ${failedTests} tests failed`));
        process.exit(1);
      } else {
        console.log(chalk.green('\n✅ All database tests passed'));
        process.exit(0);
      }
    } catch (error) {
      console.error(chalk.red('❌ Database tests failed:'), error.message);
      process.exit(1);
    }
  }

  async testPostgreSQLDeployment() {
    console.log(chalk.blue('🐘 Testing PostgreSQL deployment...'));
    
    try {
      // Test PostgreSQL cluster pods
      const pgPods = execSync(`${this.kubectl} get pods -n database -l postgresql=postgres-cluster --no-headers`, { encoding: 'utf8' });
      const runningPods = pgPods.split('\n').filter(line => line.includes('Running')).length;
      const expectedPods = 3; // HA configuration
      
      this.addResult('PostgreSQL HA Pods', runningPods >= expectedPods, `${runningPods}/${expectedPods} pods running`);
      
      // Test PostgreSQL services
      const services = ['postgres-primary', 'postgres-readonly', 'postgres-any'];
      for (const service of services) {
        try {
          const serviceInfo = execSync(`${this.kubectl} get service ${service} -n database -o jsonpath='{.spec.clusterIP}'`, { encoding: 'utf8' });
          const hasService = serviceInfo.length > 0;
          this.addResult(`PostgreSQL Service: ${service}`, hasService, hasService ? `ClusterIP: ${serviceInfo}` : 'Service not found');
        } catch (error) {
          this.addResult(`PostgreSQL Service: ${service}`, false, 'Service not found');
        }
      }
      
      // Test PostgreSQL cluster status
      const clusterStatus = execSync(`${this.kubectl} get cluster postgres-cluster -n database -o jsonpath='{.status.phase}'`, { encoding: 'utf8' });
      const isHealthy = clusterStatus === 'Cluster in healthy state' || clusterStatus.includes('healthy');
      this.addResult('PostgreSQL Cluster Status', isHealthy, `Status: ${clusterStatus}`);
      
      // Test storage
      const pvcs = execSync(`${this.kubectl} get pvc -n database -l postgresql=postgres-cluster --no-headers | wc -l`, { encoding: 'utf8' });
      const hasPVCs = parseInt(pvcs.trim()) >= 3;
      this.addResult('PostgreSQL Storage', hasPVCs, `${pvcs.trim()} PVCs created`);
      
    } catch (error) {
      this.addResult('PostgreSQL Deployment', false, `Failed to test deployment: ${error.message}`);
    }
  }

  async testPostgreSQLHA() {
    console.log(chalk.blue('🔄 Testing PostgreSQL high availability...'));
    
    try {
      // Test pod anti-affinity
      const podNodes = execSync(`${this.kubectl} get pods -n database -l postgresql=postgres-cluster -o jsonpath='{.items[*].spec.nodeName}'`, { encoding: 'utf8' });
      const uniqueNodes = [...new Set(podNodes.split(' ').filter(node => node))];
      const distributedAcrossNodes = uniqueNodes.length >= 2;
      this.addResult('Pod Distribution', distributedAcrossNodes, `Pods on ${uniqueNodes.length} nodes`);
      
      // Test pod disruption budget
      const pdb = execSync(`${this.kubectl} get pdb postgres-pdb -n database -o jsonpath='{.spec.minAvailable}'`, { encoding: 'utf8' });
      const hasPDB = parseInt(pdb) >= 2;
      this.addResult('Pod Disruption Budget', hasPDB, hasPDB ? `Min available: ${pdb}` : 'PDB not configured');
      
      // Test primary/replica roles
      const pgPods = execSync(`${this.kubectl} get pods -n database -l postgresql=postgres-cluster -o jsonpath='{.items[*].metadata.name}'`, { encoding: 'utf8' });
      const podNames = pgPods.split(' ').filter(name => name);
      
      let primaryCount = 0;
      let replicaCount = 0;
      
      for (const podName of podNames) {
        try {
          const role = execSync(`${this.kubectl} get pod ${podName} -n database -o jsonpath='{.metadata.labels.role}'`, { encoding: 'utf8' });
          if (role === 'primary') primaryCount++;
          if (role === 'replica') replicaCount++;
        } catch (error) {
          // Pod might not have role label yet
        }
      }
      
      this.addResult('Primary/Replica Roles', primaryCount === 1 && replicaCount >= 2, `Primary: ${primaryCount}, Replicas: ${replicaCount}`);
      
      // Test automatic failover capability
      const failoverConfig = execSync(`${this.kubectl} get cluster postgres-cluster -n database -o jsonpath='{.spec.primaryUpdateStrategy}'`, { encoding: 'utf8' });
      const hasFailover = failoverConfig === 'unsupervised';
      this.addResult('Automatic Failover', hasFailover, `Update strategy: ${failoverConfig}`);
      
    } catch (error) {
      this.addResult('PostgreSQL HA', false, `Failed to test HA: ${error.message}`);
    }
  }

  async testPostgreSQLPerformance() {
    console.log(chalk.blue('⚡ Testing PostgreSQL performance...'));
    
    try {
      // Test connection to PostgreSQL
      const client = new Client(this.pgConfig);
      await client.connect();
      
      // Test basic query performance
      const startTime = Date.now();
      await client.query('SELECT 1');
      const queryTime = Date.now() - startTime;
      const fastQuery = queryTime < 100; // Should be under 100ms
      this.addResult('PostgreSQL Query Performance', fastQuery, `Query time: ${queryTime}ms`);
      
      // Test connection pooling
      const connections = await client.query('SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = \'active\'');
      const activeConnections = parseInt(connections.rows[0].active_connections);
      const reasonableConnections = activeConnections < 50; // Should not have too many active connections
      this.addResult('PostgreSQL Connections', reasonableConnections, `Active connections: ${activeConnections}`);
      
      // Test database configuration
      const sharedBuffers = await client.query('SHOW shared_buffers');
      const hasOptimalConfig = sharedBuffers.rows[0].shared_buffers !== '128MB'; // Should be tuned from default
      this.addResult('PostgreSQL Configuration', hasOptimalConfig, `Shared buffers: ${sharedBuffers.rows[0].shared_buffers}`);
      
      // Test WAL configuration
      const walLevel = await client.query('SHOW wal_level');
      const hasWAL = walLevel.rows[0].wal_level === 'replica' || walLevel.rows[0].wal_level === 'logical';
      this.addResult('PostgreSQL WAL Level', hasWAL, `WAL level: ${walLevel.rows[0].wal_level}`);
      
      await client.end();
      
    } catch (error) {
      this.addResult('PostgreSQL Performance', false, `Failed to test performance: ${error.message}`);
    }
  }

  async testPostgreSQLBackup() {
    console.log(chalk.blue('💾 Testing PostgreSQL backup system...'));
    
    try {
      // Test backup CronJob
      const backupCronJob = execSync(`${this.kubectl} get cronjob postgres-backup -n database -o jsonpath='{.spec.schedule}'`, { encoding: 'utf8' });
      const hasBackupJob = backupCronJob.length > 0;
      this.addResult('Backup CronJob', hasBackupJob, hasBackupJob ? `Schedule: ${backupCronJob}` : 'No backup job found');
      
      // Test WAL archive CronJob
      const walCronJob = execSync(`${this.kubectl} get cronjob postgres-wal-archive -n database -o jsonpath='{.spec.schedule}'`, { encoding: 'utf8' });
      const hasWALJob = walCronJob.length > 0;
      this.addResult('WAL Archive CronJob', hasWALJob, hasWALJob ? `Schedule: ${walCronJob}` : 'No WAL archive job found');
      
      // Test backup cleanup CronJob
      const cleanupCronJob = execSync(`${this.kubectl} get cronjob postgres-backup-cleanup -n database -o jsonpath='{.spec.schedule}'`, { encoding: 'utf8' });
      const hasCleanupJob = cleanupCronJob.length > 0;
      this.addResult('Backup Cleanup CronJob', hasCleanupJob, hasCleanupJob ? `Schedule: ${cleanupCronJob}` : 'No cleanup job found');
      
      // Test backup credentials
      const backupSecret = execSync(`${this.kubectl} get secret backup-credentials -n database -o jsonpath='{.data.ACCESS_KEY_ID}'`, { encoding: 'utf8' });
      const hasBackupCredentials = backupSecret.length > 0;
      this.addResult('Backup Credentials', hasBackupCredentials, hasBackupCredentials ? 'Backup credentials configured' : 'No backup credentials');
      
      // Test backup monitoring
      const backupMonitor = execSync(`${this.kubectl} get deployment backup-monitor -n database --no-headers | wc -l`, { encoding: 'utf8' });
      const hasBackupMonitor = parseInt(backupMonitor.trim()) > 0;
      this.addResult('Backup Monitoring', hasBackupMonitor, hasBackupMonitor ? 'Backup monitor deployed' : 'No backup monitor');
      
    } catch (error) {
      this.addResult('PostgreSQL Backup', false, `Failed to test backup: ${error.message}`);
    }
  }

  async testPgBouncerDeployment() {
    console.log(chalk.blue('🔗 Testing PgBouncer connection pooler...'));
    
    try {
      // Test PgBouncer deployment
      const pgBouncerPods = execSync(`${this.kubectl} get pods -n database -l app=pgbouncer --no-headers`, { encoding: 'utf8' });
      const runningPods = pgBouncerPods.split('\n').filter(line => line.includes('Running')).length;
      const expectedPods = 3;
      
      this.addResult('PgBouncer Deployment', runningPods >= expectedPods, `${runningPods}/${expectedPods} pods running`);
      
      // Test PgBouncer service
      const pgBouncerService = execSync(`${this.kubectl} get service pgbouncer -n database -o jsonpath='{.spec.clusterIP}'`, { encoding: 'utf8' });
      const hasService = pgBouncerService.length > 0;
      this.addResult('PgBouncer Service', hasService, hasService ? `ClusterIP: ${pgBouncerService}` : 'Service not found');
      
      // Test PgBouncer configuration
      const pgBouncerConfig = execSync(`${this.kubectl} get configmap pgbouncer-config -n database -o jsonpath='{.data.pgbouncer\\.ini}'`, { encoding: 'utf8' });
      const hasConfig = pgBouncerConfig.includes('pool_mode');
      this.addResult('PgBouncer Configuration', hasConfig, hasConfig ? 'Configuration found' : 'No configuration');
      
      // Test PgBouncer connectivity (if accessible)
      try {
        const poolerConfig = {
          host: 'pgbouncer.database.svc.cluster.local',
          port: 5432,
          database: 'finbot_v4',
          user: this.pgConfig.user,
          password: this.pgConfig.password,
          connectionTimeoutMillis: 5000
        };
        
        const poolerClient = new Client(poolerConfig);
        await poolerClient.connect();
        await poolerClient.query('SELECT 1');
        await poolerClient.end();
        
        this.addResult('PgBouncer Connectivity', true, 'Connection successful');
      } catch (error) {
        this.addResult('PgBouncer Connectivity', false, `Connection failed: ${error.message}`);
      }
      
    } catch (error) {
      this.addResult('PgBouncer Deployment', false, `Failed to test PgBouncer: ${error.message}`);
    }
  }

  async testRedisClusterDeployment() {
    console.log(chalk.blue('🔴 Testing Redis cluster deployment...'));
    
    try {
      // Test Redis cluster pods
      const redisPods = execSync(`${this.kubectl} get pods -n cache -l app=redis-cluster --no-headers`, { encoding: 'utf8' });
      const runningPods = redisPods.split('\n').filter(line => line.includes('Running')).length;
      const expectedPods = 6; // 3 masters + 3 replicas
      
      this.addResult('Redis Cluster Pods', runningPods >= expectedPods, `${runningPods}/${expectedPods} pods running`);
      
      // Test Redis services
      const redisServices = ['redis-cluster', 'redis-cluster-headless'];
      for (const service of redisServices) {
        try {
          const serviceInfo = execSync(`${this.kubectl} get service ${service} -n cache -o jsonpath='{.spec.clusterIP}'`, { encoding: 'utf8' });
          const hasService = serviceInfo.length > 0;
          this.addResult(`Redis Service: ${service}`, hasService, hasService ? `ClusterIP: ${serviceInfo}` : 'Service not found');
        } catch (error) {
          this.addResult(`Redis Service: ${service}`, false, 'Service not found');
        }
      }
      
      // Test Redis StatefulSet
      const statefulSet = execSync(`${this.kubectl} get statefulset redis-cluster -n cache -o jsonpath='{.status.readyReplicas}'`, { encoding: 'utf8' });
      const readyReplicas = parseInt(statefulSet) || 0;
      const hasStatefulSet = readyReplicas >= 6;
      this.addResult('Redis StatefulSet', hasStatefulSet, `${readyReplicas}/6 replicas ready`);
      
      // Test Redis storage
      const redisPVCs = execSync(`${this.kubectl} get pvc -n cache -l app=redis-cluster --no-headers | wc -l`, { encoding: 'utf8' });
      const hasStorage = parseInt(redisPVCs.trim()) >= 6;
      this.addResult('Redis Storage', hasStorage, `${redisPVCs.trim()} PVCs created`);
      
    } catch (error) {
      this.addResult('Redis Cluster Deployment', false, `Failed to test deployment: ${error.message}`);
    }
  }

  async testRedisClusterHA() {
    console.log(chalk.blue('🔄 Testing Redis cluster high availability...'));
    
    try {
      // Test pod anti-affinity
      const redisPodNodes = execSync(`${this.kubectl} get pods -n cache -l app=redis-cluster -o jsonpath='{.items[*].spec.nodeName}'`, { encoding: 'utf8' });
      const uniqueRedisNodes = [...new Set(redisPodNodes.split(' ').filter(node => node))];
      const redisDistributed = uniqueRedisNodes.length >= 3;
      this.addResult('Redis Pod Distribution', redisDistributed, `Pods on ${uniqueRedisNodes.length} nodes`);
      
      // Test Redis cluster initialization
      const initJob = execSync(`${this.kubectl} get job redis-cluster-init -n cache -o jsonpath='{.status.succeeded}'`, { encoding: 'utf8' });
      const clusterInitialized = initJob === '1';
      this.addResult('Redis Cluster Initialization', clusterInitialized, clusterInitialized ? 'Cluster initialized' : 'Cluster not initialized');
      
      // Test pod disruption budget
      const redisPDB = execSync(`${this.kubectl} get pdb redis-cluster-pdb -n cache -o jsonpath='{.spec.minAvailable}'`, { encoding: 'utf8' });
      const hasRedisPDB = parseInt(redisPDB) >= 4;
      this.addResult('Redis Pod Disruption Budget', hasRedisPDB, hasRedisPDB ? `Min available: ${redisPDB}` : 'PDB not configured');
      
      // Test Redis cluster configuration
      const redisConfig = execSync(`${this.kubectl} get configmap redis-cluster-config -n cache -o jsonpath='{.data.redis\\.conf}'`, { encoding: 'utf8' });
      const hasClusterConfig = redisConfig.includes('cluster-enabled yes');
      this.addResult('Redis Cluster Configuration', hasClusterConfig, hasClusterConfig ? 'Cluster mode enabled' : 'Cluster mode not enabled');
      
    } catch (error) {
      this.addResult('Redis Cluster HA', false, `Failed to test HA: ${error.message}`);
    }
  }

  async testRedisPerformance() {
    console.log(chalk.blue('⚡ Testing Redis performance...'));
    
    try {
      // Test Redis connectivity and performance
      const redisClient = redis.createClient({
        host: this.redisConfig.host,
        port: this.redisConfig.port,
        password: this.redisConfig.password,
        connectTimeout: 5000
      });
      
      await redisClient.connect();
      
      // Test basic operations
      const startTime = Date.now();
      await redisClient.set('test_key', 'test_value');
      const value = await redisClient.get('test_key');
      const operationTime = Date.now() - startTime;
      
      const fastOperation = operationTime < 50; // Should be under 50ms
      const correctValue = value === 'test_value';
      
      this.addResult('Redis Operation Performance', fastOperation, `Operation time: ${operationTime}ms`);
      this.addResult('Redis Data Integrity', correctValue, correctValue ? 'Data stored/retrieved correctly' : 'Data integrity issue');
      
      // Test Redis cluster info
      const clusterInfo = await redisClient.sendCommand(['CLUSTER', 'INFO']);
      const clusterOk = clusterInfo.includes('cluster_state:ok');
      this.addResult('Redis Cluster State', clusterOk, clusterOk ? 'Cluster state OK' : 'Cluster state not OK');
      
      // Test Redis memory usage
      const memoryInfo = await redisClient.sendCommand(['INFO', 'memory']);
      const memoryUsed = memoryInfo.match(/used_memory:(\d+)/);
      const hasMemoryInfo = !!memoryUsed;
      this.addResult('Redis Memory Monitoring', hasMemoryInfo, hasMemoryInfo ? `Memory used: ${Math.round(memoryUsed[1] / 1024 / 1024)}MB` : 'No memory info');
      
      // Cleanup
      await redisClient.del('test_key');
      await redisClient.disconnect();
      
    } catch (error) {
      this.addResult('Redis Performance', false, `Failed to test performance: ${error.message}`);
    }
  }

  async testDatabaseConnectivity() {
    console.log(chalk.blue('🔌 Testing database connectivity...'));
    
    try {
      // Test PostgreSQL connectivity from different services
      const pgServices = ['postgres-primary', 'postgres-readonly', 'pgbouncer'];
      
      for (const service of pgServices) {
        try {
          const testConfig = {
            ...this.pgConfig,
            host: `${service}.database.svc.cluster.local`,
            connectionTimeoutMillis: 5000
          };
          
          const client = new Client(testConfig);
          await client.connect();
          await client.query('SELECT 1');
          await client.end();
          
          this.addResult(`PostgreSQL Connectivity: ${service}`, true, 'Connection successful');
        } catch (error) {
          this.addResult(`PostgreSQL Connectivity: ${service}`, false, `Connection failed: ${error.message}`);
        }
      }
      
      // Test Redis connectivity
      try {
        const redisClient = redis.createClient({
          host: this.redisConfig.host,
          port: this.redisConfig.port,
          password: this.redisConfig.password,
          connectTimeout: 5000
        });
        
        await redisClient.connect();
        await redisClient.ping();
        await redisClient.disconnect();
        
        this.addResult('Redis Connectivity', true, 'Connection successful');
      } catch (error) {
        this.addResult('Redis Connectivity', false, `Connection failed: ${error.message}`);
      }
      
      // Test cross-namespace connectivity
      const networkPolicies = execSync(`${this.kubectl} get networkpolicies --all-namespaces --no-headers | wc -l`, { encoding: 'utf8' });
      const hasNetworkPolicies = parseInt(networkPolicies.trim()) > 0;
      this.addResult('Network Policies', hasNetworkPolicies, `${networkPolicies.trim()} network policies configured`);
      
    } catch (error) {
      this.addResult('Database Connectivity', false, `Failed to test connectivity: ${error.message}`);
    }
  }

  async testDatabaseSecurity() {
    console.log(chalk.blue('🔒 Testing database security...'));
    
    try {
      // Test PostgreSQL secrets
      const pgSecret = execSync(`${this.kubectl} get secret postgres-credentials -n database -o jsonpath='{.data.username}'`, { encoding: 'utf8' });
      const hasPgSecret = pgSecret.length > 0;
      this.addResult('PostgreSQL Secrets', hasPgSecret, hasPgSecret ? 'Credentials configured' : 'No credentials found');
      
      // Test Redis secrets
      const redisSecret = execSync(`${this.kubectl} get secret redis-cluster-secret -n cache -o jsonpath='{.data.password}'`, { encoding: 'utf8' });
      const hasRedisSecret = redisSecret.length > 0;
      this.addResult('Redis Secrets', hasRedisSecret, hasRedisSecret ? 'Password configured' : 'No password found');
      
      // Test service accounts
      const serviceAccounts = ['postgres-service-account', 'postgres-backup', 'redis-cluster'];
      for (const sa of serviceAccounts) {
        try {
          const namespace = sa.includes('redis') ? 'cache' : 'database';
          execSync(`${this.kubectl} get serviceaccount ${sa} -n ${namespace}`, { encoding: 'utf8' });
          this.addResult(`Service Account: ${sa}`, true, 'Service account exists');
        } catch (error) {
          this.addResult(`Service Account: ${sa}`, false, 'Service account not found');
        }
      }
      
      // Test RBAC roles
      const roles = execSync(`${this.kubectl} get roles -n database --no-headers | wc -l`, { encoding: 'utf8' });
      const hasRoles = parseInt(roles.trim()) > 0;
      this.addResult('Database RBAC Roles', hasRoles, `${roles.trim()} roles configured`);
      
      // Test network policies
      const dbNetworkPolicies = execSync(`${this.kubectl} get networkpolicies -n database --no-headers | wc -l`, { encoding: 'utf8' });
      const cacheNetworkPolicies = execSync(`${this.kubectl} get networkpolicies -n cache --no-headers | wc -l`, { encoding: 'utf8' });
      const hasDbNetPol = parseInt(dbNetworkPolicies.trim()) > 0;
      const hasCacheNetPol = parseInt(cacheNetworkPolicies.trim()) > 0;
      
      this.addResult('Database Network Policies', hasDbNetPol, `${dbNetworkPolicies.trim()} policies in database namespace`);
      this.addResult('Cache Network Policies', hasCacheNetPol, `${cacheNetworkPolicies.trim()} policies in cache namespace`);
      
    } catch (error) {
      this.addResult('Database Security', false, `Failed to test security: ${error.message}`);
    }
  }

  addResult(testName, passed, message) {
    this.testResults.push({ testName, passed, message });
    const icon = passed ? '✅' : '❌';
    const color = passed ? chalk.green : chalk.red;
    console.log(`  ${icon} ${color(testName)}: ${message}`);
  }

  printResults() {
    console.log(chalk.bold('\n📊 Database Test Results:'));
    console.log(chalk.gray('='.repeat(60)));
    
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    const total = this.testResults.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(chalk.green(`Passed: ${passed}`));
    console.log(chalk.red(`Failed: ${failed}`));
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      console.log(chalk.bold.red('\n❌ Failed Tests:'));
      this.testResults
        .filter(r => !r.passed)
        .forEach(r => console.log(chalk.red(`  • ${r.testName}: ${r.message}`)));
    }
  }
}

// CLI interface
if (require.main === module) {
  const tests = new DatabaseTests();
  tests.runAllTests();
}

module.exports = DatabaseTests;