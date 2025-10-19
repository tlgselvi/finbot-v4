/**
 * Playwright Global Teardown
 * Global teardown for E2E tests
 */

import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting E2E test teardown...');
  
  try {
    // Cleanup any global test state
    // This is where you would clean up databases, files, etc.
    
    console.log('🗑️ Cleaned up test data');
    
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw here as it might mask test failures
  }
  
  console.log('✅ E2E test teardown completed');
}

export default globalTeardown;