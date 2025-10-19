/**
 * Jest Setup
 * Global test setup and configuration
 */

import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import { customMatchers } from '../utils/test-utils';

// Configure testing library
configure({
  testIdAttribute: 'data-testid',
});

// Extend Jest matchers
expect.extend(customMatchers);

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

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  observe() { return null; }
  disconnect() { return null; }
  unobserve() { return null; }
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() { return null; }
  disconnect() { return null; }
  unobserve() { return null; }
};

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
};
global.localStorage = localStorageMock as any;

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.sessionStorage = sessionStorageMock as any;

// Mock fetch
global.fetch = jest.fn();

// Mock console methods for cleaner test output
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
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

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

// Global test utilities
global.testUtils = {
  // Add any global test utilities here
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Mock date for consistent testing
  mockDate: (date: string) => {
    const mockDate = new Date(date);
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
  },
  
  // Restore date mock
  restoreDate: () => {
    (global.Date as any).mockRestore?.();
  }
};

// Type declarations for global utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeWithinRange(floor: number, ceiling: number): R;
      toHaveCurrency(expectedAmount: number): R;
    }
  }
  
  var testUtils: {
    waitFor: (ms: number) => Promise<void>;
    mockDate: (date: string) => void;
    restoreDate: () => void;
  };
}