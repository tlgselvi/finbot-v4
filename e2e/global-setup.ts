/**
 * Playwright Global Setup
 * Global setup for E2E tests
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test setup...');
  
  // Launch browser for setup
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // Wait for the application to be ready
    console.log('⏳ Waiting for application to be ready...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    // Verify the application is loaded
    await page.waitForSelector('body', { timeout: 30000 });
    console.log('✅ Application is ready');
    
    // Setup test data or authentication if needed
    // This is where you would set up any global test state
    
    // Clear any existing data
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    console.log('🧹 Cleared browser storage');
    
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
  
  console.log('✅ E2E test setup completed');
}

export default globalSetup;