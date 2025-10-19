/**
 * Test Setup Configuration
 * Global test setup and configuration for Jest and React Testing Library
 */

import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import { TextEncoder, TextDecoder } from 'util';

// Configure React Testing Library
configure({
  testIdAttribute: 'data-testid',
  asyncUtilTimeout: 5000,
  computedStyleSupportsPseudoElements: true
});

// Global test utilities and mocks
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock window.ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
  root: null,
  rootMargin: '',
  thresholds: [],
}));

// Mock scrollTo
Object.defineProperty(window, 'scrollTo', {
  value: jest.fn(),
  writable: true
});

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn()
};
Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock
});

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: jest.fn().mockResolvedValue(undefined),
    readText: jest.fn().mockResolvedValue(''),
  },
  writable: true,
});

// Mock navigator.share
Object.defineProperty(navigator, 'share', {
  value: jest.fn().mockResolvedValue(undefined),
  writable: true,
});

// Mock fetch
global.fetch = jest.fn();

// Mock console methods to reduce noise in tests
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render is no longer supported') ||
       args[0].includes('Warning: An invalid form control') ||
       args[0].includes('Warning: Failed prop type'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };

  console.warn = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('componentWillReceiveProps') ||
       args[0].includes('componentWillUpdate'))
    ) {
      return;
    }
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// Global test helpers
export const createMockGoal = (overrides = {}) => ({
  id: 'test-goal-1',
  title: 'Test Goal',
  description: 'Test goal description',
  targetAmount: 10000,
  currentAmount: 5000,
  targetDate: '2024-12-31T00:00:00Z',
  category: 'emergency_fund',
  priority: 'medium' as const,
  status: 'active' as const,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-10-15T00:00:00Z',
  ...overrides
});

export const createMockMilestone = (overrides = {}) => ({
  id: 'test-milestone-1',
  title: 'Test Milestone',
  description: 'Test milestone description',
  targetAmount: 5000,
  isCompleted: false,
  goalId: 'test-goal-1',
  ...overrides
});

export const createMockAchievement = (overrides = {}) => ({
  id: 'test-achievement-1',
  title: 'Test Achievement',
  description: 'Test achievement description',
  type: 'milestone',
  achievedAt: '2024-10-15T00:00:00Z',
  goalId: 'test-goal-1',
  points: 100,
  ...overrides
});

export const createMockInsight = (overrides = {}) => ({
  id: 'test-insight-1',
  type: 'tip' as const,
  title: 'Test Insight',
  description: 'Test insight description',
  confidence: 0.85,
  actionable: true,
  createdAt: '2024-10-15T00:00:00Z',
  ...overrides
});

// Custom matchers
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// Declare custom matcher types
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}

// Cleanup after each test
afterEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Clear localStorage and sessionStorage
  localStorageMock.clear();
  sessionStorageMock.clear();
  
  // Reset fetch mock
  if (global.fetch) {
    (global.fetch as jest.Mock).mockClear();
  }
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Increase timeout for integration tests
jest.setTimeout(10000);