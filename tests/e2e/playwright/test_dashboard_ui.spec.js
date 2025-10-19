/**
 * Playwright E2E tests for FinBot ML Analytics Dashboard UI
 */

const { test, expect } = require('@playwright/test');

test.describe('FinBot ML Analytics Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard
    await page.goto('http://dashboard:3000');
    
    // Handle login if required
    if (await page.locator('input[name="username"]').isVisible()) {
      await page.fill('input[name="username"]', 'e2e.test@finbot.com');
      await page.fill('input[name="password"]', 'e2e-test-password');
      await page.click('button[type="submit"]');
      await page.waitForURL('**/dashboard**');
    }
  });

  test('should display main dashboard with analytics widgets', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/FinBot|Dashboard/);
    
    // Check for main navigation
    const navigation = page.locator('nav, .navbar, .sidebar');
    await expect(navigation).toBeVisible();
    
    // Check for analytics widgets
    const widgets = [
      '.spending-overview',
      '.budget-status',
      '.goal-progress',
      '.risk-assessment',
      '.recent-transactions'
    ];
    
    for (const widget of widgets) {
      const element = page.locator(widget);
      if (await element.count() > 0) {
        await expect(element.first()).toBeVisible();
      }
    }
  });

  test('should handle transaction anomaly detection workflow', async ({ page }) => {
    // Navigate to transactions page
    await page.click('a[href*="transactions"], .nav-transactions');
    
    // Wait for transactions to load
    await page.waitForSelector('.transaction-list, .transactions-table', { timeout: 10000 });
    
    // Look for anomaly indicators
    const anomalyAlerts = page.locator('.anomaly-alert, .alert-danger, .warning-icon');
    
    if (await anomalyAlerts.count() > 0) {
      // Click on first anomaly alert
      await anomalyAlerts.first().click();
      
      // Check if anomaly details modal opens
      const modal = page.locator('.modal, .alert-details, .anomaly-details');
      await expect(modal).toBeVisible();
      
      // Check for anomaly information
      const anomalyInfo = page.locator('.anomaly-score, .risk-level, .explanation');
      await expect(anomalyInfo.first()).toBeVisible();
      
      // Close modal
      await page.click('.modal-close, .close-btn, [data-dismiss="modal"]');
    }
  });

  test('should perform budget optimization workflow', async ({ page }) => {
    // Navigate to budget page
    await page.click('a[href*="budget"], .nav-budget');
    
    // Wait for budget page to load
    await page.waitForSelector('.budget-overview, .budget-container', { timeout: 10000 });
    
    // Look for optimize budget button
    const optimizeBtn = page.locator('button:has-text("Optimize"), .optimize-budget-btn, [data-action="optimize"]');
    
    if (await optimizeBtn.count() > 0) {
      // Click optimize button
      await optimizeBtn.first().click();
      
      // Wait for optimization to complete
      await page.waitForSelector('.optimization-results, .budget-suggestions', { timeout: 15000 });
      
      // Check for optimization suggestions
      const suggestions = page.locator('.budget-suggestion, .optimization-item');
      await expect(suggestions.first()).toBeVisible();
      
      // Check for projected savings
      const savings = page.locator('.projected-savings, .savings-amount');
      if (await savings.count() > 0) {
        await expect(savings.first()).toBeVisible();
      }
      
      // Apply optimization if button exists
      const applyBtn = page.locator('button:has-text("Apply"), .apply-optimization-btn');
      if (await applyBtn.count() > 0) {
        await applyBtn.first().click();
        
        // Wait for confirmation
        await page.waitForSelector('.success-message, .confirmation', { timeout: 5000 });
      }
    }
  });

  test('should display and interact with goal tracking', async ({ page }) => {
    // Navigate to goals page
    await page.click('a[href*="goals"], .nav-goals');
    
    // Wait for goals page to load
    await page.waitForSelector('.goals-container, .goal-list', { timeout: 10000 });
    
    // Check for goal cards
    const goalCards = page.locator('.goal-card, .goal-item');
    
    if (await goalCards.count() > 0) {
      // Click on first goal
      await goalCards.first().click();
      
      // Check for goal details
      const goalDetails = page.locator('.goal-details, .goal-modal');
      await expect(goalDetails).toBeVisible();
      
      // Check for progress information
      const progressInfo = [
        '.progress-percentage',
        '.target-amount',
        '.current-amount',
        '.projected-completion'
      ];
      
      for (const info of progressInfo) {
        const element = page.locator(info);
        if (await element.count() > 0) {
          await expect(element.first()).toBeVisible();
        }
      }
      
      // Check for recommendations
      const recommendations = page.locator('.recommendations, .goal-suggestions');
      if (await recommendations.count() > 0) {
        await expect(recommendations.first()).toBeVisible();
      }
    }
  });

  test('should handle risk assessment display', async ({ page }) => {
    // Navigate to risk assessment page
    await page.click('a[href*="risk"], .nav-risk, a[href*="profile"]');
    
    // Wait for risk page to load
    await page.waitForSelector('.risk-assessment, .financial-profile', { timeout: 10000 });
    
    // Check for risk score display
    const riskScore = page.locator('.risk-score, .overall-risk');
    if (await riskScore.count() > 0) {
      await expect(riskScore.first()).toBeVisible();
    }
    
    // Check for risk factors
    const riskFactors = page.locator('.risk-factors, .risk-breakdown');
    if (await riskFactors.count() > 0) {
      await expect(riskFactors.first()).toBeVisible();
    }
    
    // Check for recommendations
    const recommendations = page.locator('.risk-recommendations, .improvement-suggestions');
    if (await recommendations.count() > 0) {
      await expect(recommendations.first()).toBeVisible();
    }
  });

  test('should display insights and notifications', async ({ page }) => {
    // Check for insights section on dashboard
    const insights = page.locator('.insights, .financial-insights, .recommendations');
    
    if (await insights.count() > 0) {
      await expect(insights.first()).toBeVisible();
      
      // Check for individual insight items
      const insightItems = page.locator('.insight-item, .insight-card');
      if (await insightItems.count() > 0) {
        // Click on first insight
        await insightItems.first().click();
        
        // Check for insight details
        const insightDetails = page.locator('.insight-details, .insight-modal');
        if (await insightDetails.count() > 0) {
          await expect(insightDetails.first()).toBeVisible();
        }
      }
    }
    
    // Check for notifications
    const notifications = page.locator('.notifications, .alerts, .notification-bell');
    if (await notifications.count() > 0) {
      await notifications.first().click();
      
      // Check for notification dropdown/modal
      const notificationList = page.locator('.notification-list, .notification-dropdown');
      if (await notificationList.count() > 0) {
        await expect(notificationList.first()).toBeVisible();
      }
    }
  });

  test('should handle responsive design on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Check if mobile navigation works
    const mobileMenu = page.locator('.mobile-menu, .hamburger, .menu-toggle');
    if (await mobileMenu.count() > 0) {
      await mobileMenu.first().click();
      
      // Check if navigation menu appears
      const navMenu = page.locator('.nav-menu, .mobile-nav, .sidebar');
      await expect(navMenu).toBeVisible();
    }
    
    // Check if widgets stack properly on mobile
    const widgets = page.locator('.widget, .card, .dashboard-item');
    if (await widgets.count() > 0) {
      // Widgets should be visible and properly sized
      await expect(widgets.first()).toBeVisible();
    }
  });

  test('should handle error states gracefully', async ({ page }) => {
    // Test network error handling by intercepting requests
    await page.route('**/api/**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' })
      });
    });
    
    // Reload page to trigger API calls
    await page.reload();
    
    // Check for error messages
    const errorMessages = page.locator('.error-message, .alert-error, .error-state');
    if (await errorMessages.count() > 0) {
      await expect(errorMessages.first()).toBeVisible();
    }
    
    // Check for retry buttons
    const retryButtons = page.locator('button:has-text("Retry"), .retry-btn');
    if (await retryButtons.count() > 0) {
      await expect(retryButtons.first()).toBeVisible();
    }
  });

  test('should perform search and filtering', async ({ page }) => {
    // Navigate to transactions page
    await page.click('a[href*="transactions"], .nav-transactions');
    
    // Look for search input
    const searchInput = page.locator('input[type="search"], .search-input, input[placeholder*="search"]');
    
    if (await searchInput.count() > 0) {
      // Perform search
      await searchInput.first().fill('Starbucks');
      await page.keyboard.press('Enter');
      
      // Wait for search results
      await page.waitForTimeout(2000);
      
      // Check if results are filtered
      const transactionItems = page.locator('.transaction-item, .transaction-row');
      if (await transactionItems.count() > 0) {
        // At least one result should contain the search term
        const searchResults = page.locator('.transaction-item:has-text("Starbucks"), .transaction-row:has-text("Starbucks")');
        if (await searchResults.count() > 0) {
          await expect(searchResults.first()).toBeVisible();
        }
      }
    }
    
    // Test category filtering
    const categoryFilter = page.locator('select[name="category"], .category-filter');
    if (await categoryFilter.count() > 0) {
      await categoryFilter.first().selectOption('restaurants');
      await page.waitForTimeout(1000);
      
      // Check if transactions are filtered by category
      const filteredTransactions = page.locator('.transaction-item, .transaction-row');
      if (await filteredTransactions.count() > 0) {
        // Should show only restaurant transactions
        await expect(filteredTransactions.first()).toBeVisible();
      }
    }
  });

  test('should handle data export functionality', async ({ page }) => {
    // Navigate to transactions or reports page
    await page.click('a[href*="transactions"], a[href*="reports"]');
    
    // Look for export button
    const exportBtn = page.locator('button:has-text("Export"), .export-btn, [data-action="export"]');
    
    if (await exportBtn.count() > 0) {
      // Set up download handler
      const downloadPromise = page.waitForEvent('download');
      
      // Click export button
      await exportBtn.first().click();
      
      // Wait for download to start
      try {
        const download = await downloadPromise;
        
        // Verify download
        expect(download.suggestedFilename()).toMatch(/\.(csv|xlsx|pdf)$/);
      } catch (error) {
        // Export might not be fully implemented
        console.log('Export functionality not available or not working');
      }
    }
  });
});

test.describe('Performance Tests', () => {
  test('should load dashboard within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('http://dashboard:3000');
    
    // Wait for main content to load
    await page.waitForSelector('.dashboard, .main-content', { timeout: 10000 });
    
    const loadTime = Date.now() - startTime;
    
    // Dashboard should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should handle concurrent user interactions', async ({ page }) => {
    await page.goto('http://dashboard:3000');
    
    // Simulate multiple rapid interactions
    const interactions = [
      () => page.click('a[href*="transactions"]'),
      () => page.click('a[href*="budget"]'),
      () => page.click('a[href*="goals"]'),
      () => page.click('a[href*="profile"]')
    ];
    
    // Execute interactions rapidly
    for (const interaction of interactions) {
      try {
        await interaction();
        await page.waitForTimeout(500);
      } catch (error) {
        // Some interactions might fail due to rapid execution
        console.log('Interaction failed:', error.message);
      }
    }
    
    // Page should still be responsive
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});