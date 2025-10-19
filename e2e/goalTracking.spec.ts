/**
 * Goal Tracking E2E Tests
 * End-to-end tests for complete goal tracking user workflows using Playwright
 */

import { test, expect, Page } from '@playwright/test';

// Test data
const testGoal = {
  title: 'Emergency Fund E2E Test',
  description: 'Test emergency fund for E2E testing',
  targetAmount: '10000',
  targetDate: '2025-12-31',
  category: 'emergency_fund',
  priority: 'high'
};

const testProgressAmount = '500';
const testProgressNote = 'Monthly savings contribution';

// Helper functions
async function navigateToGoalTracking(page: Page) {
  await page.goto('/goal-tracking');
  await expect(page.getByText('Goal Tracking Dashboard')).toBeVisible();
}

async function createGoal(page: Page, goal = testGoal) {
  // Click New Goal button
  await page.getByText('New Goal').click();
  
  // Fill goal wizard - Step 1: Goal Details
  await expect(page.getByText('Create New Goal')).toBeVisible();
  await page.getByLabel('Goal Title').fill(goal.title);
  await page.getByLabel('Description (Optional)').fill(goal.description);
  
  // Select category
  await page.getByLabel('Category').click();
  await page.getByText('Emergency Fund').click();
  
  // Continue to next step
  await page.getByText('Continue').click();
  
  // Step 2: Target & Timeline
  await page.getByLabel('Target Amount').fill(goal.targetAmount);
  await page.getByLabel('Target Date').fill(goal.targetDate);
  
  // Select priority
  await page.getByLabel('Priority').click();
  await page.getByText('High Priority').click();
  
  // Continue to next step
  await page.getByText('Continue').click();
  
  // Step 3: AI Recommendations (skip or accept)
  await page.waitForTimeout(2000); // Wait for AI recommendations to load
  await page.getByText('Continue').click();
  
  // Step 4: Milestones (use auto-generated)
  await expect(page.getByText('Auto-generate milestones')).toBeVisible();
  await page.getByText('Continue').click();
  
  // Step 5: Review & Create
  await expect(page.getByText('Review Your Goal')).toBeVisible();
  await page.getByText('Create Goal').click();
  
  // Wait for goal to be created
  await expect(page.getByText(goal.title)).toBeVisible();
}

async function addProgressToGoal(page: Page, goalTitle: string, amount = testProgressAmount, note = testProgressNote) {
  // Find the goal card and click Add Progress
  const goalCard = page.locator('.MuiCard-root').filter({ hasText: goalTitle });
  await goalCard.getByText('Add Progress').click();
  
  // Fill progress form
  await expect(page.getByText(`Add Progress to ${goalTitle}`)).toBeVisible();
  await page.getByLabel('Amount').fill(amount);
  await page.getByLabel('Note (optional)').fill(note);
  
  // Submit progress
  await page.getByRole('button', { name: 'Add Progress' }).click();
  
  // Wait for success notification
  await expect(page.getByText('Progress updated successfully!')).toBeVisible();
}

test.describe('Goal Tracking E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set up test environment
    await page.goto('/');
    
    // Mock API responses for consistent testing
    await page.route('**/api/goals**', async route => {
      const url = route.request().url();
      const method = route.request().method();
      
      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            goals: [],
            milestones: [],
            achievements: [],
            insights: []
          })
        });
      } else if (method === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'test-goal-1',
            ...testGoal,
            currentAmount: 0,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          })
        });
      }
    });
  });

  test.describe('Goal Creation Workflow', () => {
    test('should create a new goal through the wizard', async ({ page }) => {
      await navigateToGoalTracking(page);
      
      // Initial state - no goals
      await expect(page.getByText('No goals yet')).toBeVisible();
      await expect(page.getByText('Create your first financial goal to get started')).toBeVisible();
      
      // Create a new goal
      await createGoal(page);
      
      // Verify goal appears in dashboard
      await expect(page.getByText(testGoal.title)).toBeVisible();
      await expect(page.getByText(testGoal.description)).toBeVisible();
      await expect(page.getByText('$10,000')).toBeVisible(); // Target amount
      
      // Verify summary cards updated
      await expect(page.getByText('1').first()).toBeVisible(); // Active goals count
    });

    test('should validate required fields in goal wizard', async ({ page }) => {
      await navigateToGoalTracking(page);
      
      // Open goal wizard
      await page.getByText('New Goal').click();
      
      // Try to continue without filling required fields
      await page.getByText('Continue').click();
      
      // Should show validation errors
      await expect(page.getByText('Goal title is required')).toBeVisible();
      await expect(page.getByText('Please select a category')).toBeVisible();
    });

    test('should show AI recommendations during goal creation', async ({ page }) => {
      await navigateToGoalTracking(page);
      
      // Start creating a goal
      await page.getByText('New Goal').click();
      
      // Fill basic details
      await page.getByLabel('Goal Title').fill('Emergency Fund');
      await page.getByLabel('Category').click();
      await page.getByText('Emergency Fund').click();
      await page.getByText('Continue').click();
      
      // Fill target and timeline
      await page.getByLabel('Target Amount').fill('15000');
      await page.getByLabel('Target Date').fill('2024-12-31');
      await page.getByText('Continue').click();
      
      // Should show AI recommendations
      await expect(page.getByText('AI is analyzing your goal')).toBeVisible();
      await page.waitForTimeout(3000); // Wait for AI analysis
      
      // Should show recommendations
      await expect(page.getByText('AI Recommendations')).toBeVisible();
    });
  });

  test.describe('Progress Tracking', () => {
    test('should add progress to a goal', async ({ page }) => {
      await navigateToGoalTracking(page);
      
      // Create a goal first
      await createGoal(page);
      
      // Add progress
      await addProgressToGoal(page, testGoal.title);
      
      // Verify progress is reflected in UI
      await expect(page.getByText('$500')).toBeVisible(); // Current amount
      await expect(page.getByText('5%')).toBeVisible(); // Progress percentage
    });

    test('should complete milestones when progress reaches targets', async ({ page }) => {
      await navigateToGoalTracking(page);
      
      // Create a goal
      await createGoal(page);
      
      // Add significant progress to complete first milestone
      await addProgressToGoal(page, testGoal.title, '2500', 'Large contribution');
      
      // Should show milestone completion celebration
      await expect(page.getByText('Congratulations!')).toBeVisible();
      await expect(page.getByText('Milestone Achieved!')).toBeVisible();
      
      // Close celebration
      await page.getByText('Continue').click();
      
      // Check milestones tab
      await page.getByText('Milestones').click();
      await expect(page.getByText('Completed')).toBeVisible();
    });

    test('should complete goal when target amount is reached', async ({ page }) => {
      await navigateToGoalTracking(page);
      
      // Create a goal
      await createGoal(page);
      
      // Add progress to complete the goal
      await addProgressToGoal(page, testGoal.title, '10000', 'Final contribution');
      
      // Should show goal completion celebration
      await expect(page.getByText('Goal Completed!')).toBeVisible();
      await expect(page.getByText('🎉')).toBeVisible();
      
      // Close celebration
      await page.getByText('Continue').click();
      
      // Goal should show as completed
      await expect(page.getByText('Goal completed! 🎉')).toBeVisible();
      
      // Summary should update
      await expect(page.getByText('1').nth(1)).toBeVisible(); // Completed goals count
    });
  });

  test.describe('Goal Management', () => {
    test('should edit an existing goal', async ({ page }) => {
      await navigateToGoalTracking(page);
      
      // Create a goal
      await createGoal(page);
      
      // Open goal menu
      const goalCard = page.locator('.MuiCard-root').filter({ hasText: testGoal.title });
      await goalCard.getByLabelText('more').click();
      
      // Click edit
      await page.getByText('Edit Goal').click();
      
      // Update goal details
      await expect(page.getByText('Edit Goal')).toBeVisible();
      const titleInput = page.getByDisplayValue(testGoal.title);
      await titleInput.clear();
      await titleInput.fill('Updated Emergency Fund');
      
      // Save changes
      await page.getByText('Save Changes').click();
      
      // Verify changes
      await expect(page.getByText('Updated Emergency Fund')).toBeVisible();
    });

    test('should pause and resume a goal', async ({ page }) => {
      await navigateToGoalTracking(page);
      
      // Create a goal
      await createGoal(page);
      
      // Pause the goal
      const goalCard = page.locator('.MuiCard-root').filter({ hasText: testGoal.title });
      await goalCard.getByLabelText('more').click();
      await page.getByText('Pause Goal').click();
      
      // Should show paused status
      await expect(page.getByText('This goal is currently paused')).toBeVisible();
      
      // Resume the goal
      await goalCard.getByLabelText('more').click();
      await page.getByText('Resume Goal').click();
      
      // Should show active status again
      await expect(page.getByText('Add Progress')).toBeVisible();
    });

    test('should delete a goal with confirmation', async ({ page }) => {
      await navigateToGoalTracking(page);
      
      // Create a goal
      await createGoal(page);
      
      // Delete the goal
      const goalCard = page.locator('.MuiCard-root').filter({ hasText: testGoal.title });
      await goalCard.getByLabelLabel('more').click();
      await page.getByText('Delete Goal').click();
      
      // Confirm deletion
      await expect(page.getByText('Are you sure you want to delete')).toBeVisible();
      await page.getByRole('button', { name: 'Delete' }).click();
      
      // Goal should be removed
      await expect(page.getByText(testGoal.title)).not.toBeVisible();
      await expect(page.getByText('No goals yet')).toBeVisible();
    });
  });

  test.describe('Dashboard Navigation', () => {
    test('should navigate between dashboard tabs', async ({ page }) => {
      await navigateToGoalTracking(page);
      
      // Create a goal and add some progress for data
      await createGoal(page);
      await addProgressToGoal(page, testGoal.title);
      
      // Test Milestones tab
      await page.getByText('Milestones').click();
      await expect(page.getByText('Milestone Tracker')).toBeVisible();
      
      // Test Achievements tab
      await page.getByText('Achievements').click();
      await expect(page.getByText('Your Achievements')).toBeVisible();
      
      // Test Insights tab
      await page.getByText('Insights').click();
      await expect(page.getByText('AI-Powered Insights')).toBeVisible();
      
      // Return to My Goals tab
      await page.getByText('My Goals').click();
      await expect(page.getByText(testGoal.title)).toBeVisible();
    });

    test('should filter and sort goals', async ({ page }) => {
      await navigateToGoalTracking(page);
      
      // Create multiple goals
      await createGoal(page);
      await createGoal(page, {
        ...testGoal,
        title: 'Vacation Fund',
        category: 'vacation',
        priority: 'medium'
      });
      
      // Test status filter
      await page.getByLabel('Status').click();
      await page.getByText('Active').click();
      await expect(page.getByText('2 goals')).toBeVisible();
      
      // Test sorting
      await page.getByLabel('Sort by').click();
      await page.getByText('Priority').click();
      
      // High priority goal should appear first
      const goalCards = page.locator('.MuiCard-root');
      await expect(goalCards.first()).toContainText('Emergency Fund E2E Test');
    });
  });

  test.describe('Responsive Design', () => {
    test('should work on mobile devices', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      
      await navigateToGoalTracking(page);
      
      // Should still show main elements
      await expect(page.getByText('Goal Tracking Dashboard')).toBeVisible();
      
      // FAB should be visible for goal creation
      await expect(page.getByLabelText('add goal')).toBeVisible();
      
      // Create a goal using FAB
      await page.getByLabelText('add goal').click();
      await expect(page.getByText('Create New Goal')).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle network errors gracefully', async ({ page }) => {
      // Mock network failure
      await page.route('**/api/goals**', async route => {
        await route.abort('failed');
      });
      
      await navigateToGoalTracking(page);
      
      // Should show error message
      await expect(page.getByText('Failed to load goal tracking data')).toBeVisible();
    });

    test('should validate progress input', async ({ page }) => {
      await navigateToGoalTracking(page);
      
      // Create a goal
      await createGoal(page);
      
      // Try to add invalid progress
      const goalCard = page.locator('.MuiCard-root').filter({ hasText: testGoal.title });
      await goalCard.getByText('Add Progress').click();
      
      // Submit without amount
      const submitButton = page.getByRole('button', { name: 'Add Progress' });
      await expect(submitButton).toBeDisabled();
      
      // Add invalid amount
      await page.getByLabel('Amount').fill('-100');
      await expect(submitButton).toBeDisabled();
    });
  });

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      await navigateToGoalTracking(page);
      
      // Create a goal
      await createGoal(page);
      
      // Test keyboard navigation
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter'); // Should activate focused element
      
      // Should be able to navigate through interactive elements
      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeVisible();
    });

    test('should have proper ARIA labels', async ({ page }) => {
      await navigateToGoalTracking(page);
      
      // Check for proper ARIA labels
      await expect(page.getByLabelText('Refresh Data')).toBeVisible();
      await expect(page.getByLabelText('add goal')).toBeVisible();
      
      // Check tab accessibility
      await expect(page.getByRole('tablist')).toBeVisible();
      const tabs = page.getByRole('tab');
      await expect(tabs).toHaveCount(4);
    });
  });

  test.describe('Performance', () => {
    test('should load dashboard quickly', async ({ page }) => {
      const startTime = Date.now();
      
      await navigateToGoalTracking(page);
      
      // Dashboard should load within reasonable time
      await expect(page.getByText('Goal Tracking Dashboard')).toBeVisible();
      
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(3000); // Should load within 3 seconds
    });

    test('should handle multiple rapid interactions', async ({ page }) => {
      await navigateToGoalTracking(page);
      
      // Create a goal
      await createGoal(page);
      
      // Rapidly click refresh button multiple times
      const refreshButton = page.getByLabelText('Refresh Data');
      await refreshButton.click();
      await refreshButton.click();
      await refreshButton.click();
      
      // Should still be functional
      await expect(page.getByText(testGoal.title)).toBeVisible();
    });
  });
});