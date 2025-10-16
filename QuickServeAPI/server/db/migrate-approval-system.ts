/**
 * FinBot v4 - Approval System Database Migration
 * Script to create approval system tables in existing database
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import fs from 'fs';
import path from 'path';

// Database connection
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

/**
 * Run approval system migration
 */
export async function migrateApprovalSystem() {
  console.log('🚀 Starting FinBot v4 Approval System migration...\n');

  try {
    // 1. Read and execute schema creation script
    console.log('📊 Creating approval system tables...');
    const schemaScript = fs.readFileSync(
      path.join(process.cwd(), 'database/init/01-init-database.sql'),
      'utf8'
    );

    // Execute schema creation
    await sql.unsafe(schemaScript);
    console.log('✅ Approval system tables created successfully');

    // 2. Read and execute seed data script
    console.log('🌱 Inserting seed data...');
    const seedScript = fs.readFileSync(
      path.join(process.cwd(), 'database/init/02-seed-data.sql'),
      'utf8'
    );

    // Execute seed data
    await sql.unsafe(seedScript);
    console.log('✅ Seed data inserted successfully');

    // 3. Verify tables exist
    console.log('🔍 Verifying table creation...');
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%approval%'
      ORDER BY table_name;
    `;

    console.log('📋 Created tables:');
    tables.forEach(table => {
      console.log(`  ✅ ${table.table_name}`);
    });

    // 4. Check seed data
    console.log('\n🔍 Verifying seed data...');
    const ruleCount = await sql`SELECT COUNT(*) as count FROM approval_rules`;
    console.log(`  ✅ Approval rules: ${ruleCount[0].count}`);

    const assessmentCount = await sql`SELECT COUNT(*) as count FROM risk_assessments`;
    console.log(`  ✅ Risk assessments: ${assessmentCount[0].count}`);

    console.log('\n🎉 Approval System migration completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('  1. Start the development server: npm run dev');
    console.log('  2. Test API endpoints: GET /api/health');
    console.log('  3. Create your first approval rule: POST /api/approval-rules');
    console.log('  4. View API documentation: GET /api/docs');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

/**
 * Rollback approval system (for development)
 */
export async function rollbackApprovalSystem() {
  console.log('🔄 Rolling back Approval System...');

  try {
    // Drop tables in reverse order (due to foreign keys)
    const dropQueries = [
      'DROP TABLE IF EXISTS audit_logs.audit_trail CASCADE;',
      'DROP TABLE IF EXISTS risk_assessments CASCADE;',
      'DROP TABLE IF EXISTS approval_actions CASCADE;',
      'DROP TABLE IF EXISTS approval_workflows CASCADE;',
      'DROP TABLE IF EXISTS approval_rules CASCADE;',
      'DROP TYPE IF EXISTS approval_status CASCADE;',
      'DROP TYPE IF EXISTS transaction_type CASCADE;',
      'DROP TYPE IF EXISTS user_role CASCADE;',
      'DROP TYPE IF EXISTS risk_level CASCADE;',
      'DROP SCHEMA IF EXISTS audit_logs CASCADE;'
    ];

    for (const query of dropQueries) {
      await sql.unsafe(query);
    }

    console.log('✅ Approval System rollback completed');

  } catch (error) {
    console.error('❌ Rollback failed:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

// CLI execution
if (require.main === module) {
  const command = process.argv[2];

  if (command === 'migrate') {
    migrateApprovalSystem()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else if (command === 'rollback') {
    rollbackApprovalSystem()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    console.log('Usage:');
    console.log('  npm run migrate:approval     # Run migration');
    console.log('  npm run rollback:approval    # Rollback migration');
    process.exit(1);
  }
}