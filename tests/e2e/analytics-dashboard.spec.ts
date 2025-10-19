/**
 * Analytics Dashboard E2E Tests
 * End-to-end testing with Playwright
 */

import { test, expect, Page } from '@playwright/test';

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'testpassword123'
};

const mockBudgetData = {
  housing: { budgeted: 1500, actual: 1450 },
  food: { budgeted: 600, actual: 680 },
  transport: { budgeted: 400, actual: 420 },
  entertainment: { budgeted: 300, actual: 350 }
};

const mockGoals = [
  {
    id: 'emergency_fund',
    title: 'Emergency Fund',
    targetAmount: 15000,
    currentAmount: 8500,
    targetDate: '2024-12-31'
  },
  {
    id: 'house_fund', 
    title: 'House Down Payment',
    targetAmount: 60000,
    currentAmount: 22000,
    targetDate: '2025-06-30'
  }
];

// Helper functions
async function loginUser(page: Page) {
  await page.goto('/login');
  await page.fill('[data-testid="email-input"]', testUser.email);
  await page.fill('[data-testid="password-input"]', testUser.password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('/dashboard');
}

async function mockApiResponses(page: Page) {
  // Mock budget API
  await page.route('**/api/budget**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        categories: Object.entries(mockBudgetData).map(([name, data]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          ...data
        })),
        totalBudget: 2800,
        totalActual: 2900,
        savingsRate: 15.5
      })
    });
  });

  // Mock goals API
  await page.route('**/api/goals**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        goals: mockGoals,
        totalProgress: 46.7,
        activeGoals: 2,
        completedGoals: 0
      })
    });
  });

  // Mock insights API
  await page.route('**/api/insights**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        insights: [
          {
            id: 'food_overspending',
            type: 'warning',
            title: 'Food Budget Alert',
            description: 'You\'re overspending on food by 13%',
            recommendation: 'Consider meal planning to reduce costs'
          },
          {
            id: 'emergency_progress',
            type: 'success', 
            title: 'Great Progress!',
            description: 'Your emergency fund is 57% complete',
            recommendation: 'Keep up the consistent saving'
          }
        ]
      })
    });
  });
}

test.describe('Analytics Dashboard E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockApiResponses(page);
  });

  test('should load and display dashboard overview', async ({ page }) => {
    await loginUser(page);
    
    // Check main dashboard elements
    await expect(page.locator('[data-testid="dashboard-title"]')).toContainText('Financial Analytics');
    await expect(page.locator('[data-testid="total-budget-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="savings-rate-card"]')).toBeVisible();
    await expect(page.locator('[data-testid="goal-progress-card"]')).toBeVisible();
  });

  test('should display budget categories with correct data', async ({ page }) => {
    await loginUser(page);
    
    // Wait for budget data to load
    await page.waitForSelector('[data-testid="budget-categories"]');
    
    // Check housing category
    const housingCategory = page.locator('[data-testid="category-housing"]');
    await expect(housingCategory).toBeVisible();
    await expect(housingCategory.locator('[data-testid="budgeted-amount"]')).toContainText('$1,500');
    await expect(housingCategory.locator('[data-testid="actual-amount"]')).toContainText('$1,450');
    
    // Check food category (overspending)
    const foodCategory = page.locator('[data-testid="category-food"]');
    await expect(foodCategory).toBeVisible();
    await expect(foodCategory.locator('[data-testid="budgeted-amount"]')).toContainText('$600');
    await expect(foodCategory.locator('[data-testid="actual-amount"]')).toContainText('$680');
    await expect(foodCategory.locator('[data-testid="overspending-indicator"]')).toBeVisible();
  });

  test('should show goal progress correctly', async ({ page }) => {
    await loginUser(page);
    
    // Navigate to goals section
    await page.click('[data-testid="goals-tab"]');
    await page.waitForSelector('[data-testid="goals-list"]');
    
    // Check emergency fund goal
    const emergencyGoal = page.locator('[data-testid="goal-emergency_fund"]');
    await expect(emergencyGoal).toBeVisible();
    await expect(emergencyGoal.locator('[data-testid="goal-title"]')).toContainText('Emergency Fund');
    await expect(emergencyGoal.locator('[data-testid="goal-progress"]')).toContainText('57%');
    await expect(emergencyGoal.locator('[data-testid="current-amount"]')).toContainText('$8,500');
    await expect(emergencyGoal.locator('[data-testid="target-amount"]')).toContainText('$15,000');
    
    // Check house fund goal
    const houseGoal = page.locator('[data-testid="goal-house_fund"]');
    await expect(houseGoal).toBeVisible();
    await expect(houseGoal.locator('[data-testid="goal-title"]')).toContainText('House Down Payment');
  });

  test('should display AI insights and recommendations', async ({ page }) => {
    await loginUser(page);
    
    // Navigate to insights section
    await page.click('[data-testid="insights-tab"]');
    await page.waitForSelector('[data-testid="insights-list"]');
    
    // Check warning insight
    const warningInsight = page.locator('[data-testid="insight-food_overspending"]');
    await expect(warningInsight).toBeVisible();
    await expect(warningInsight.locator('[data-testid="insight-title"]')).toContainText('Food Budget Alert');
    await expect(warningInsight.locator('[data-testid="insight-description"]')).toContainText('overspending on food by 13%');
    await expect(warningInsight.locator('[data-testid="insight-recommendation"]')).toContainText('meal planning');
    
    // Check success insight
    const successInsight = page.locator('[data-testid="insight-emergency_progress"]');
    await expect(successInsight).toBeVisible();
    await expect(successInsight.locator('[data-testid="insight-title"]')).toContainText('Great Progress!');
  });

  test('should handle budget optimization workflow', async ({ page }) => {
    await loginUser(page);
    
    // Navigate to budget optimization
    await page.click('[data-testid="budget-optimization-tab"]');
    await page.waitForSelector('[data-testid="optimization-dashboard"]');
    
    // Click optimize button
    await page.click('[data-testid="optimize-budget-button"]');
    
    // Wait for optimization to complete
    await page.waitForSelector('[data-testid="optimization-results"]');
    
    // Check optimization results
    await expect(page.locator('[data-testid="potential-savings"]')).toBeVisible();
    await expect(page.locator('[data-testid="optimization-score"]')).toBeVisible();
    await expect(page.locator('[data-testid="recommendations-list"]')).toBeVisible();
    
    // Apply optimization
    await page.click('[data-testid="apply-optimization-button"]');
    
    // Verify success message
    await expect(page.locator('[data-testid="optimization-applied-message"]')).toBeVisible();
  });

  test('should create a new financial goal', async ({ page }) => {
    await loginUser(page);
    
    // Navigate to goals
    await page.click('[data-testid="goals-tab"]');
    
    // Click new goal button
    await page.click('[data-testid="new-goal-button"]');
    
    // Fill goal wizard
    await page.waitForSelector('[data-testid="goal-wizard"]');
    
    // Step 1: Choose template
    await page.click('[data-testid="vacation-goal-template"]');
    
    // Step 2: Set details
    await page.fill('[data-testid="goal-title-input"]', 'European Vacation');
    await page.fill('[data-testid="goal-description-input"]', 'Two week trip to Europe');
    await page.fill('[data-testid="target-amount-input"]', '8000');
    await page.fill('[data-testid="monthly-contribution-input"]', '400');
    
    // Continue through wizard
    await page.click('[data-testid="wizard-continue-button"]');
    await page.click('[data-testid="wizard-continue-button"]');
    
    // Final step: Create goal
    await page.click('[data-testid="create-goal-button"]');
    
    // Verify goal was created
    await page.waitForSelector('[data-testid="goal-created-success"]');
    await expect(page.locator('[data-testid="goals-list"]')).toContainText('European Vacation');
  });

  test('should add funds to existing goal', async ({ page }) => {
    await loginUser(page);
    
    // Navigate to goals
    await page.click('[data-testid="goals-tab"]');
    await page.waitForSelector('[data-testid="goals-list"]');
    
    // Click on emergency fund goal
    const emergencyGoal = page.locator('[data-testid="goal-emergency_fund"]');
    await emergencyGoal.click();
    
    // Click add funds button
    await page.click('[data-testid="add-funds-button"]');
    
    // Fill amount
    await page.fill('[data-testid="add-funds-amount"]', '500');
    
    // Submit
    await page.click('[data-testid="add-funds-submit"]');
    
    // Verify updated amount
    await expect(page.locator('[data-testid="current-amount"]')).toContainText('$9,000');
    
    // Check for milestone achievement if applicable
    const milestoneAlert = page.locator('[data-testid="milestone-achieved"]');
    if (await milestoneAlert.isVisible()) {
      await expect(milestoneAlert).toContainText('Milestone Achieved!');
    }
  });

  test('should filter and search functionality', async ({ page }) => {
    await loginUser(page);
    
    // Test budget category filtering
    await page.selectOption('[data-testid="category-filter"]', 'food');
    await expect(page.locator('[data-testid="category-housing"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="category-food"]')).toBeVisible();
    
    // Reset filter
    await page.selectOption('[data-testid="category-filter"]', 'all');
    
    // Test goal filtering
    await page.click('[data-testid="goals-tab"]');
    await page.selectOption('[data-testid="goal-status-filter"]', 'in_progress');
    
    // Should show active goals
    await expect(page.locator('[data-testid="goal-emergency_fund"]')).toBeVisible();
    await expect(page.locator('[data-testid="goal-house_fund"]')).toBeVisible();
  });

  test('should handle responsive design', async ({ page }) => {
    await loginUser(page);
    
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Check mobile navigation
    await expect(page.locator('[data-testid="mobile-menu-button"]')).toBeVisible();
    await page.click('[data-testid="mobile-menu-button"]');
    await expect(page.locator('[data-testid="mobile-navigation"]')).toBeVisible();
    
    // Check cards stack vertically
    const budgetCards = page.locator('[data-testid="budget-overview-cards"]');
    await expect(budgetCards).toHaveCSS('flex-direction', 'column');
    
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    
    // Check tablet layout
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible();
    await expect(page.locator('[data-testid="main-content"]')).toBeVisible();
  });

  test('should handle error states gracefully', async ({ page }) => {
    // Mock API error
    await page.route('**/api/budget**', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' })
      });
    });
    
    await loginUser(page);
    
    // Should show error message
    await expect(page.locator('[data-testid="budget-error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="budget-error-message"]')).toContainText('Failed to load budget data');
    
    // Should show retry button
    await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
  });

  test('should persist data across page refreshes', async ({ page }) => {
    await loginUser(page);
    
    // Make some changes
    await page.click('[data-testid="goals-tab"]');
    const emergencyGoal = page.locator('[data-testid="goal-emergency_fund"]');
    await emergencyGoal.click();
    await page.click('[data-testid="add-funds-button"]');
    await page.fill('[data-testid="add-funds-amount"]', '200');
    await page.click('[data-testid="add-funds-submit"]');
    
    // Refresh page
    await page.reload();
    
    // Verify data persisted
    await page.waitForSelector('[data-testid="goals-list"]');
    await expect(page.locator('[data-testid="current-amount"]')).toContainText('$8,700');
  });

  test('should export data functionality', async ({ page }) => {
    await loginUser(page);
    
    // Test budget export
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-budget-button"]');
    const download = await downloadPromise;
    
    // Verify download
    expect(download.suggestedFilename()).toContain('budget-export');
    expect(download.suggestedFilename()).toContain('.csv');
    
    // Test goal export
    await page.click('[data-testid="goals-tab"]');
    const goalDownloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-goals-button"]');
    const goalDownload = await goalDownloadPromise;
    
    expect(goalDownload.suggestedFilename()).toContain('goals-export');
  });
});