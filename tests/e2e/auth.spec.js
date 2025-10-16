// FinBot v4 - Authentication E2E Tests
// End-to-end tests for user authentication flows

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display login page', async ({ page }) => {
    await expect(page).toHaveTitle(/FinBot/);
    await expect(page.locator('h1')).toContainText('Welcome to FinBot');
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    // Fill login form
    await page.fill('[data-testid="email-input"]', 'test@finbot.com');
    await page.fill('[data-testid="password-input"]', 'TestPassword123!');
    
    // Submit form
    await page.click('[data-testid="login-button"]');
    
    // Wait for navigation to dashboard
    await page.waitForURL('/dashboard');
    
    // Verify successful login
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard-title"]')).toContainText('Dashboard');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    // Fill login form with invalid credentials
    await page.fill('[data-testid="email-input"]', 'invalid@finbot.com');
    await page.fill('[data-testid="password-input"]', 'wrongpassword');
    
    // Submit form
    await page.click('[data-testid="login-button"]');
    
    // Verify error message
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Invalid credentials');
    
    // Verify still on login page
    await expect(page).toHaveURL('/');
  });

  test('should validate email format', async ({ page }) => {
    // Fill invalid email
    await page.fill('[data-testid="email-input"]', 'invalid-email');
    await page.fill('[data-testid="password-input"]', 'TestPassword123!');
    
    // Try to submit
    await page.click('[data-testid="login-button"]');
    
    // Verify validation error
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="email-error"]')).toContainText('Please enter a valid email');
  });

  test('should validate password requirements', async ({ page }) => {
    await page.fill('[data-testid="email-input"]', 'test@finbot.com');
    await page.fill('[data-testid="password-input"]', '123'); // Too short
    
    await page.click('[data-testid="login-button"]');
    
    await expect(page.locator('[data-testid="password-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-error"]')).toContainText('Password must be at least 8 characters');
  });

  test('should register new user', async ({ page }) => {
    // Navigate to register page
    await page.click('[data-testid="register-link"]');
    await expect(page).toHaveURL('/register');
    
    // Fill registration form
    const timestamp = Date.now();
    await page.fill('[data-testid="first-name-input"]', 'Test');
    await page.fill('[data-testid="last-name-input"]', 'User');
    await page.fill('[data-testid="email-input"]', `test${timestamp}@finbot.com`);
    await page.fill('[data-testid="password-input"]', 'TestPassword123!');
    await page.fill('[data-testid="confirm-password-input"]', 'TestPassword123!');
    
    // Accept terms
    await page.check('[data-testid="terms-checkbox"]');
    
    // Submit registration
    await page.click('[data-testid="register-button"]');
    
    // Verify successful registration
    await page.waitForURL('/dashboard');
    await expect(page.locator('[data-testid="welcome-message"]')).toContainText('Welcome to FinBot');
  });

  test('should show error for existing email', async ({ page }) => {
    await page.click('[data-testid="register-link"]');
    
    // Try to register with existing email
    await page.fill('[data-testid="first-name-input"]', 'Test');
    await page.fill('[data-testid="last-name-input"]', 'User');
    await page.fill('[data-testid="email-input"]', 'test@finbot.com'); // Existing email
    await page.fill('[data-testid="password-input"]', 'TestPassword123!');
    await page.fill('[data-testid="confirm-password-input"]', 'TestPassword123!');
    await page.check('[data-testid="terms-checkbox"]');
    
    await page.click('[data-testid="register-button"]');
    
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Email already exists');
  });

  test('should validate password confirmation', async ({ page }) => {
    await page.click('[data-testid="register-link"]');
    
    await page.fill('[data-testid="first-name-input"]', 'Test');
    await page.fill('[data-testid="last-name-input"]', 'User');
    await page.fill('[data-testid="email-input"]', 'test@finbot.com');
    await page.fill('[data-testid="password-input"]', 'TestPassword123!');
    await page.fill('[data-testid="confirm-password-input"]', 'DifferentPassword123!');
    
    await page.click('[data-testid="register-button"]');
    
    await expect(page.locator('[data-testid="confirm-password-error"]')).toContainText('Passwords do not match');
  });

  test('should logout user', async ({ page }) => {
    // Login first
    await page.fill('[data-testid="email-input"]', 'test@finbot.com');
    await page.fill('[data-testid="password-input"]', 'TestPassword123!');
    await page.click('[data-testid="login-button"]');
    
    await page.waitForURL('/dashboard');
    
    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');
    
    // Verify redirected to login page
    await page.waitForURL('/');
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });

  test('should handle forgot password', async ({ page }) => {
    await page.click('[data-testid="forgot-password-link"]');
    await expect(page).toHaveURL('/forgot-password');
    
    await page.fill('[data-testid="email-input"]', 'test@finbot.com');
    await page.click('[data-testid="reset-password-button"]');
    
    await expect(page.locator('[data-testid="success-message"]')).toContainText('Password reset email sent');
  });

  test('should persist login session', async ({ page, context }) => {
    // Login
    await page.fill('[data-testid="email-input"]', 'test@finbot.com');
    await page.fill('[data-testid="password-input"]', 'TestPassword123!');
    await page.click('[data-testid="login-button"]');
    
    await page.waitForURL('/dashboard');
    
    // Create new page in same context
    const newPage = await context.newPage();
    await newPage.goto('/dashboard');
    
    // Should be logged in without credentials
    await expect(newPage.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should redirect to login when accessing protected route', async ({ page }) => {
    // Try to access protected route without login
    await page.goto('/dashboard');
    
    // Should be redirected to login
    await page.waitForURL('/');
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });

  test('should handle session expiry', async ({ page }) => {
    // Login
    await page.fill('[data-testid="email-input"]', 'test@finbot.com');
    await page.fill('[data-testid="password-input"]', 'TestPassword123!');
    await page.click('[data-testid="login-button"]');
    
    await page.waitForURL('/dashboard');
    
    // Simulate expired token by clearing localStorage
    await page.evaluate(() => {
      localStorage.removeItem('authToken');
    });
    
    // Try to access API endpoint
    await page.reload();
    
    // Should be redirected to login
    await page.waitForURL('/');
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
  });
});