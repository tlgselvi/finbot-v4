// FinBot v4 - Database Connection Manager
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

class DatabaseManager {
  constructor() {
    this.pool = null;
    this.isConnected = false;
  }

  // Initialize database connection
  async connect() {
    try {
      const config = {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'finbot_v4',
        user: process.env.DB_USER || 'finbot_user',
        password: process.env.DB_PASSWORD || 'finbot_password',
        max: 20, // Maximum number of clients in the pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      };

      this.pool = new Pool(config);
      
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.isConnected = true;
      console.log('✅ Database connected successfully');
      
      return this.pool;
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      throw error;
    }
  }

  // Get database client
  async getClient() {
    if (!this.isConnected) {
      await this.connect();
    }
    return this.pool.connect();
  }

  // Execute query
  async query(text, params) {
    if (!this.isConnected) {
      await this.connect();
    }
    
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 Query executed in ${duration}ms:`, text.substring(0, 100));
      }
      
      return result;
    } catch (error) {
      console.error('❌ Query error:', error.message);
      console.error('Query:', text);
      throw error;
    }
  }

  // Run migrations
  async runMigrations() {
    try {
      console.log('🔄 Running database migrations...');
      
      // Create migrations table if it doesn't exist
      await this.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Get list of migration files
      const migrationsDir = path.join(__dirname, '../../database/migrations');
      const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

      // Get already executed migrations
      const executedMigrations = await this.query(
        'SELECT filename FROM migrations ORDER BY id'
      );
      const executedFiles = executedMigrations.rows.map(row => row.filename);

      // Execute pending migrations
      for (const filename of migrationFiles) {
        if (!executedFiles.includes(filename)) {
          console.log(`📄 Executing migration: ${filename}`);
          
          const migrationPath = path.join(migrationsDir, filename);
          const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
          
          // Execute migration in a transaction
          const client = await this.getClient();
          try {
            await client.query('BEGIN');
            await client.query(migrationSQL);
            await client.query(
              'INSERT INTO migrations (filename) VALUES ($1)',
              [filename]
            );
            await client.query('COMMIT');
            console.log(`✅ Migration ${filename} completed successfully`);
          } catch (error) {
            await client.query('ROLLBACK');
            console.error(`❌ Migration ${filename} failed:`, error.message);
            throw error;
          } finally {
            client.release();
          }
        }
      }

      console.log('✅ All migrations completed successfully');
    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  }

  // Health check
  async healthCheck() {
    try {
      const result = await this.query('SELECT NOW() as current_time, version() as db_version');
      return {
        status: 'healthy',
        timestamp: result.rows[0].current_time,
        version: result.rows[0].db_version,
        connections: {
          total: this.pool.totalCount,
          idle: this.pool.idleCount,
          waiting: this.pool.waitingCount
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Close connection
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('🔌 Database connection closed');
    }
  }
}

// Create singleton instance
const dbManager = new DatabaseManager();

module.exports = {
  DatabaseManager,
  db: dbManager
};