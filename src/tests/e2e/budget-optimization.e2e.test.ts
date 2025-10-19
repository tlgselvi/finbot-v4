/**
 * Budget Optimization E2E Tests
 * End-to-end tests for complete budget optimization workflows using Playwright
 */

import { test, expect, Page } from '@playwright/test';

// Test data
const testUser = {
  email: 'test@example.com',
  password: 'testpassword123'
};

const mockBudgetData = {
  categories: [
    { name: 'Groceries', budgeted: 500, spent: 450 },
    { name: 'Entertainment', budgeted: 200, spent: 280 },
    { name: 'Transportation', budgeted: 300, spent: 250 },
    { name: 'Utilities', budgeted: 400, spent: 380 }
  ]
};

// Helper functions
async function loginUser(page: Page) {
  await page.goto('/login');
  await page.fill('[data-testid="email-input"]', testUser.email);
  await page.fill('[data-testid="password-input"]', testUser.password);
  await page.click('[data-testid="login-button"]');
  await page.waitForURL('/dashboard');
}

async function navigateToBudgetOptimization(page: Page) {
  await page.click('[data-testid="budget-optimization-nav"]');
  await page.waitForURL('/budget-optimization');
  await page.waitForSelector('[data-testid="budget-optimization-dashboard"]');
}

async function waitForBudgetDataToLoad(page: Page) {
  await page.waitForSelector('[data-testid="budget-summary"]');
  await page.waitForSelector('[data-testid="category-list"]');
}

test.describe('Budget Optimization E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Setup API mocking
    await page.route('**/api/budget/**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: mockBudgetData
          })
        });
      } else {
        await route.continue();
      }
    });

    await loginUser(page);
  });

  test.describe('Dashboard Navigation and Loading', () => {
    test('should navigate to budget optimization dashboard', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      
      // Verify page elements are present
      await expect(page.locator('h1')).toContainText('Budget Optimization');
      await expect(page.locator('[data-testid="budget-summary"]')).toBeVisible();
      await expect(page.locator('[data-testid="optimization-tabs"]')).toBeVisible();
    });

    test('should display budget summary with correct totals', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Check total budgeted amount
      const totalBudgeted = mockBudgetData.categories.reduce((sum, cat) => sum + cat.budgeted, 0);
      await expect(page.locator('[data-testid="total-budgeted"]')).toContainText(`$${totalBudgeted.toLocaleString()}`);

      // Check total spent amount
      const totalSpent = mockBudgetData.categories.reduce((sum, cat) => sum + cat.spent, 0);
      await expect(page.locator('[data-testid="total-spent"]')).toContainText(`$${totalSpent.toLocaleString()}`);

      // Check utilization percentage
      const utilization = ((totalSpent / totalBudgeted) * 100).toFixed(1);
      await expect(page.locator('[data-testid="utilization"]')).toContainText(`${utilization}%`);
    });

    test('should show loading state initially', async ({ page }) => {
      // Delay API response to test loading state
      await page.route('**/api/budget/**', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: mockBudgetData })
        });
      });

      await navigateToBudgetOptimization(page);
      
      // Should show loading indicator
      await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible();
      
      // Wait for data to load
      await waitForBudgetDataToLoad(page);
      await expect(page.locator('[data-testid="loading-indicator"]')).not.toBeVisible();
    });
  });

  test.describe('Tab Navigation', () => {
    test('should switch between different tabs', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Test Budget Manager tab (default)
      await expect(page.locator('[data-testid="budget-manager-panel"]')).toBeVisible();

      // Switch to Visualization tab
      await page.click('[data-testid="visualization-tab"]');
      await expect(page.locator('[data-testid="visualization-panel"]')).toBeVisible();
      await expect(page.locator('[data-testid="budget-manager-panel"]')).not.toBeVisible();

      // Switch to AI Suggestions tab
      await page.click('[data-testid="ai-suggestions-tab"]');
      await expect(page.locator('[data-testid="ai-suggestions-panel"]')).toBeVisible();

      // Switch to Scenarios tab
      await page.click('[data-testid="scenarios-tab"]');
      await expect(page.locator('[data-testid="scenarios-panel"]')).toBeVisible();

      // Switch to Comparison tab
      await page.click('[data-testid="comparison-tab"]');
      await expect(page.locator('[data-testid="comparison-panel"]')).toBeVisible();
    });

    test('should maintain tab state when refreshing', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Switch to Visualization tab
      await page.click('[data-testid="visualization-tab"]');
      await expect(page.locator('[data-testid="visualization-panel"]')).toBeVisible();

      // Refresh page
      await page.reload();
      await waitForBudgetDataToLoad(page);

      // Should remember the selected tab
      await expect(page.locator('[data-testid="visualization-panel"]')).toBeVisible();
    });
  });

  test.describe('Budget Category Management', () => {
    test('should display all budget categories with correct data', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Check each category is displayed
      for (const category of mockBudgetData.categories) {
        const categoryCard = page.locator(`[data-testid="category-${category.name.toLowerCase()}"]`);
        await expect(categoryCard).toBeVisible();
        await expect(categoryCard.locator('[data-testid="category-name"]')).toContainText(category.name);
        await expect(categoryCard.locator('[data-testid="budgeted-amount"]')).toContainText(`$${category.budgeted}`);
        await expect(categoryCard.locator('[data-testid="spent-amount"]')).toContainText(`$${category.spent}`);
      }
    });

    test('should edit category budget using inline editing', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Mock API response for update
      await page.route('**/api/budget/categories/*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      });

      // Find first category and enter edit mode
      const firstCategory = page.locator('[data-testid^="category-"]').first();
      await firstCategory.locator('[data-testid="category-menu"]').click();
      await page.click('[data-testid="edit-category"]');

      // Edit budget amount
      const budgetInput = firstCategory.locator('[data-testid="budget-input"]');
      await budgetInput.clear();
      await budgetInput.fill('600');

      // Save changes
      await firstCategory.locator('[data-testid="save-button"]').click();

      // Verify success message
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Budget category updated successfully');
    });

    test('should adjust budget using slider', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Mock API response for update
      await page.route('**/api/budget/categories/*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      });

      // Find a category with slider (non-fixed category)
      const categoryWithSlider = page.locator('[data-testid^="category-"]:has([data-testid="budget-slider"])').first();
      
      // Adjust slider
      const slider = categoryWithSlider.locator('[data-testid="budget-slider"]');
      await slider.click({ position: { x: 100, y: 0 } }); // Move slider to specific position

      // Should trigger API call and show updated value
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
    });

    test('should filter categories by status', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Filter by over budget categories
      await page.click('[data-testid="filter-select"]');
      await page.click('[data-testid="filter-over-budget"]');

      // Should only show Entertainment category (over budget)
      await expect(page.locator('[data-testid="category-entertainment"]')).toBeVisible();
      await expect(page.locator('[data-testid="category-groceries"]')).not.toBeVisible();

      // Reset filter
      await page.click('[data-testid="filter-select"]');
      await page.click('[data-testid="filter-all"]');

      // Should show all categories again
      await expect(page.locator('[data-testid="category-groceries"]')).toBeVisible();
      await expect(page.locator('[data-testid="category-entertainment"]')).toBeVisible();
    });

    test('should sort categories by different criteria', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Sort by budget amount (descending)
      await page.click('[data-testid="sort-select"]');
      await page.click('[data-testid="sort-budget-amount"]');

      // Verify order (Groceries should be first with $500)
      const firstCategory = page.locator('[data-testid^="category-"]').first();
      await expect(firstCategory.locator('[data-testid="category-name"]')).toContainText('Groceries');

      // Sort by utilization
      await page.click('[data-testid="sort-select"]');
      await page.click('[data-testid="sort-utilization"]');

      // Entertainment should be first (140% utilization)
      const firstCategoryAfterSort = page.locator('[data-testid^="category-"]').first();
      await expect(firstCategoryAfterSort.locator('[data-testid="category-name"]')).toContainText('Entertainment');
    });
  });

  test.describe('Add New Category', () => {
    test('should add new budget category successfully', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Mock API response for creating category
      await page.route('**/api/budget/categories', async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, id: 'new-category-id' })
          });
        }
      });

      // Click add category button
      await page.click('[data-testid="add-category-button"]');

      // Fill form
      await page.fill('[data-testid="category-name-input"]', 'Healthcare');
      await page.fill('[data-testid="budget-amount-input"]', '300');
      await page.click('[data-testid="priority-select"]');
      await page.click('[data-testid="priority-medium"]');
      await page.fill('[data-testid="icon-input"]', '🏥');

      // Submit form
      await page.click('[data-testid="add-category-submit"]');

      // Verify success
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Category added successfully');
      
      // Dialog should close
      await expect(page.locator('[data-testid="add-category-dialog"]')).not.toBeVisible();
    });

    test('should validate form inputs', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Click add category button
      await page.click('[data-testid="add-category-button"]');

      // Try to submit without required fields
      await page.click('[data-testid="add-category-submit"]');

      // Should show validation errors
      await expect(page.locator('[data-testid="name-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="budget-error"]')).toBeVisible();
    });
  });

  test.describe('Budget Optimization', () => {
    test('should run budget optimization and show suggestions', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Mock optimization API response
      await page.route('**/api/budget/optimize', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            suggestions: [
              {
                id: 'opt1',
                title: 'Reduce Entertainment Spending',
                description: 'You are 40% over budget in entertainment',
                category: 'Entertainment',
                impact: 'medium',
                potentialSavings: 80,
                confidence: 85
              }
            ]
          })
        });
      });

      // Click optimize budget button
      await page.click('[data-testid="optimize-budget-button"]');

      // Should show loading state
      await expect(page.locator('[data-testid="optimization-loading"]')).toBeVisible();

      // Wait for optimization to complete
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Budget optimization completed');

      // Switch to AI Suggestions tab to see results
      await page.click('[data-testid="ai-suggestions-tab"]');

      // Verify suggestions are displayed
      await expect(page.locator('[data-testid="suggestion-opt1"]')).toBeVisible();
      await expect(page.locator('[data-testid="suggestion-title"]')).toContainText('Reduce Entertainment Spending');
      await expect(page.locator('[data-testid="potential-savings"]')).toContainText('$80');
    });

    test('should apply optimization suggestion', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Mock suggestions
      await page.route('**/api/budget/suggestions', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            suggestions: [
              {
                id: 'opt1',
                title: 'Reduce Entertainment Spending',
                description: 'You are 40% over budget in entertainment',
                category: 'Entertainment',
                impact: 'medium',
                potentialSavings: 80,
                confidence: 85
              }
            ]
          })
        });
      });

      // Mock apply optimization API
      await page.route('**/api/budget/apply-optimization/*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      });

      // Navigate to AI Suggestions tab
      await page.click('[data-testid="ai-suggestions-tab"]');

      // Wait for suggestions to load
      await expect(page.locator('[data-testid="suggestion-opt1"]')).toBeVisible();

      // Apply suggestion
      await page.click('[data-testid="apply-suggestion-opt1"]');

      // Verify success
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Optimization applied successfully');
    });
  });

  test.describe('Visualization', () => {
    test('should display budget visualization charts', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Switch to Visualization tab
      await page.click('[data-testid="visualization-tab"]');

      // Should show chart controls
      await expect(page.locator('[data-testid="chart-type-selector"]')).toBeVisible();
      await expect(page.locator('[data-testid="view-mode-selector"]')).toBeVisible();

      // Should show default pie chart
      await expect(page.locator('[data-testid="pie-chart"]')).toBeVisible();

      // Switch to bar chart
      await page.click('[data-testid="chart-type-bar"]');
      await expect(page.locator('[data-testid="bar-chart"]')).toBeVisible();
      await expect(page.locator('[data-testid="pie-chart"]')).not.toBeVisible();

      // Switch view mode
      await page.click('[data-testid="view-mode-select"]');
      await page.click('[data-testid="view-mode-variance"]');

      // Chart should update to show variance data
      await expect(page.locator('[data-testid="chart-title"]')).toContainText('Variance');
    });

    test('should show category performance details', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Switch to Visualization tab
      await page.click('[data-testid="visualization-tab"]');

      // Should show category performance section
      await expect(page.locator('[data-testid="category-performance"]')).toBeVisible();

      // Each category should have a performance card
      for (const category of mockBudgetData.categories) {
        const performanceCard = page.locator(`[data-testid="performance-${category.name.toLowerCase()}"]`);
        await expect(performanceCard).toBeVisible();
        
        const utilization = ((category.spent / category.budgeted) * 100).toFixed(1);
        await expect(performanceCard.locator('[data-testid="utilization-chip"]')).toContainText(`${utilization}%`);
      }
    });
  });

  test.describe('Settings and Export', () => {
    test('should open and configure settings', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Open settings
      await page.click('[data-testid="settings-button"]');
      await expect(page.locator('[data-testid="settings-dialog"]')).toBeVisible();

      // Change optimization aggressiveness
      await page.click('[data-testid="aggressiveness-select"]');
      await page.click('[data-testid="aggressiveness-aggressive"]');

      // Toggle switches
      await page.click('[data-testid="prioritize-goals-switch"]');
      await page.click('[data-testid="auto-apply-switch"]');

      // Save settings
      await page.click('[data-testid="save-settings-button"]');

      // Dialog should close
      await expect(page.locator('[data-testid="settings-dialog"]')).not.toBeVisible();
    });

    test('should export budget data', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Mock download
      const downloadPromise = page.waitForEvent('download');

      // Open export dialog
      await page.click('[data-testid="export-button"]');
      await expect(page.locator('[data-testid="export-dialog"]')).toBeVisible();

      // Export as PDF
      await page.click('[data-testid="export-pdf-button"]');

      // Should trigger download
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toContain('.pdf');

      // Should show success message
      await expect(page.locator('[data-testid="success-message"]')).toContainText('Budget exported as PDF');
    });
  });

  test.describe('Responsive Design', () => {
    test('should work on mobile viewport', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Should show mobile-optimized layout
      await expect(page.locator('[data-testid="budget-optimization-dashboard"]')).toBeVisible();
      await expect(page.locator('[data-testid="budget-summary"]')).toBeVisible();

      // Tabs should be scrollable on mobile
      await expect(page.locator('[data-testid="optimization-tabs"]')).toHaveAttribute('aria-orientation', 'horizontal');

      // Categories should stack vertically
      const categories = page.locator('[data-testid^="category-"]');
      const firstCategory = categories.first();
      const secondCategory = categories.nth(1);
      
      const firstBox = await firstCategory.boundingBox();
      const secondBox = await secondCategory.boundingBox();
      
      // Second category should be below first (higher y position)
      expect(secondBox!.y).toBeGreaterThan(firstBox!.y);
    });

    test('should work on tablet viewport', async ({ page }) => {
      // Set tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });

      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Should show tablet-optimized layout
      await expect(page.locator('[data-testid="budget-optimization-dashboard"]')).toBeVisible();
      
      // Should show more categories per row than mobile
      const categories = page.locator('[data-testid^="category-"]');
      expect(await categories.count()).toBeGreaterThan(0);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle API errors gracefully', async ({ page }) => {
      // Mock API error
      await page.route('**/api/budget/**', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, error: 'Internal server error' })
        });
      });

      await navigateToBudgetOptimization(page);

      // Should show error message
      await expect(page.locator('[data-testid="error-message"]')).toContainText('Internal server error');
    });

    test('should handle network failures', async ({ page }) => {
      // Simulate network failure
      await page.route('**/api/budget/**', async (route) => {
        await route.abort('failed');
      });

      await navigateToBudgetOptimization(page);

      // Should show network error message
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    });
  });

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Tab through interactive elements
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Should be able to activate buttons with Enter
      await page.keyboard.press('Enter');
    });

    test('should have proper ARIA labels', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Check for ARIA labels on key elements
      await expect(page.locator('[aria-label="Refresh Data"]')).toBeVisible();
      await expect(page.locator('[aria-label="Export Budget"]')).toBeVisible();
      await expect(page.locator('[aria-label="Settings"]')).toBeVisible();
    });

    test('should support screen readers', async ({ page }) => {
      await navigateToBudgetOptimization(page);
      await waitForBudgetDataToLoad(page);

      // Check for proper heading structure
      await expect(page.locator('h1')).toContainText('Budget Optimization');
      
      // Check for descriptive text
      await expect(page.locator('[data-testid="dashboard-description"]')).toContainText('Interactive budget planning and optimization tools');
    });
  });
});

// Performance tests
test.describe('Performance Tests', () => {
  test('should load dashboard within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    
    await navigateToBudgetOptimization(page);
    await waitForBudgetDataToLoad(page);
    
    const loadTime = Date.now() - startTime;
    
    // Should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('should handle rapid interactions without issues', async ({ page }) => {
    await navigateToBudgetOptimization(page);
    await waitForBudgetDataToLoad(page);

    // Rapidly switch between tabs
    for (let i = 0; i < 5; i++) {
      await page.click('[data-testid="visualization-tab"]');
      await page.click('[data-testid="ai-suggestions-tab"]');
      await page.click('[data-testid="budget-manager-tab"]');
    }

    // Should still be responsive
    await expect(page.locator('[data-testid="budget-manager-panel"]')).toBeVisible();
  });
});