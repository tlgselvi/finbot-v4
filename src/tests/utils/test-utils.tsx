/**
 * Test Utilities
 * Common utilities and helpers for testing React components
 */

import React, { ReactElement } from 'react';
import { render, RenderOptions, RenderResult } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock data generators
export const generateMockBudgetItem = (overrides = {}) => ({
  id: 'test-budget-item',
  category: 'Food & Dining',
  icon: '🍽️',
  currentAmount: 600,
  optimizedAmount: 550,
  actualSpending: 680,
  limit: 700,
  priority: 'medium' as const,
  isFixed: false,
  trend: 8.2,
  subcategories: [
    { id: 'groceries', name: 'Groceries', amount: 400, percentage: 66.7 },
    { id: 'dining', name: 'Dining Out', amount: 200, percentage: 33.3 }
  ],
  ...overrides
});

export const generateMockGoal = (overrides = {}) => ({
  id: 'test-goal',
  title: 'Test Goal',
  description: 'Test goal description',
  category: 'savings' as const,
  targetAmount: 10000,
  currentAmount: 5000,
  targetDate: new Date('2024-12-31'),
  priority: 'high' as const,
  status: 'in_progress' as const,
  milestones: [
    {
      id: 'milestone-1',
      title: 'First Milestone',
      targetAmount: 2500,
      targetDate: new Date('2024-06-30'),
      completed: true,
      completedAt: new Date('2024-06-15')
    },
    {
      id: 'milestone-2',
      title: 'Second Milestone',
      targetAmount: 5000,
      targetDate: new Date('2024-09-30'),
      completed: false
    }
  ],
  monthlyContribution: 500,
  autoContribute: true,
  tags: ['important'],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-10-18'),
  ...overrides
});

export const generateMockInsight = (overrides = {}) => ({
  id: 'test-insight',
  type: 'warning' as const,
  title: 'Test Insight',
  description: 'This is a test insight',
  recommendation: 'Consider taking action',
  confidence: 0.85,
  impact: 'medium' as const,
  ...overrides
});

// Custom render function with providers
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
  theme?: any;
}

const createWrapper = (options: CustomRenderOptions = {}) => {
  const { initialEntries = ['/'], theme = createTheme() } = options;
  
  // Create a new QueryClient for each test
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider theme={theme}>
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            {children}
          </LocalizationProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
};

export const renderWithProviders = (
  ui: ReactElement,
  options: CustomRenderOptions = {}
): RenderResult => {
  return render(ui, {
    wrapper: createWrapper(options),
    ...options,
  });
};

// Mock API responses
export const mockApiResponse = (data: any, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

// Mock fetch implementation
export const createMockFetch = (responses: Record<string, any>) => {
  return jest.fn((url: string) => {
    const matchedResponse = Object.entries(responses).find(([pattern]) => 
      url.includes(pattern)
    );
    
    if (matchedResponse) {
      return Promise.resolve(mockApiResponse(matchedResponse[1]));
    }
    
    return Promise.reject(new Error(`No mock response for ${url}`));
  });
};

// Wait for async operations
export const waitForAsyncOperations = () => 
  new Promise(resolve => setTimeout(resolve, 0));

// Mock intersection observer
export const mockIntersectionObserver = () => {
  const mockIntersectionObserver = jest.fn();
  mockIntersectionObserver.mockReturnValue({
    observe: () => null,
    unobserve: () => null,
    disconnect: () => null
  });
  window.IntersectionObserver = mockIntersectionObserver;
};

// Mock resize observer
export const mockResizeObserver = () => {
  const mockResizeObserver = jest.fn();
  mockResizeObserver.mockReturnValue({
    observe: () => null,
    unobserve: () => null,
    disconnect: () => null
  });
  window.ResizeObserver = mockResizeObserver;
};

// Mock chart libraries
export const mockChartLibraries = () => {
  jest.mock('recharts', () => ({
    ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
    PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
    Pie: () => <div data-testid="pie" />,
    Cell: () => <div data-testid="cell" />,
    BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
    Bar: () => <div data-testid="bar" />,
    LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
    Line: () => <div data-testid="line" />,
    AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
    Area: () => <div data-testid="area" />,
    XAxis: () => <div data-testid="x-axis" />,
    YAxis: () => <div data-testid="y-axis" />,
    CartesianGrid: () => <div data-testid="cartesian-grid" />,
    Tooltip: () => <div data-testid="tooltip" />,
    Legend: () => <div data-testid="legend" />,
    RadialBarChart: ({ children }: any) => <div data-testid="radial-bar-chart">{children}</div>,
    RadialBar: () => <div data-testid="radial-bar" />,
    Treemap: () => <div data-testid="treemap" />,
    ComposedChart: ({ children }: any) => <div data-testid="composed-chart">{children}</div>,
    RadarChart: ({ children }: any) => <div data-testid="radar-chart">{children}</div>,
    Radar: () => <div data-testid="radar" />,
    PolarGrid: () => <div data-testid="polar-grid" />,
    PolarAngleAxis: () => <div data-testid="polar-angle-axis" />,
    PolarRadiusAxis: () => <div data-testid="polar-radius-axis" />
  }));

  jest.mock('react-circular-progressbar', () => ({
    CircularProgressbar: ({ value, text }: any) => (
      <div data-testid="circular-progressbar" data-value={value}>
        {text}
      </div>
    ),
    CircularProgressbarWithChildren: ({ children }: any) => (
      <div data-testid="circular-progressbar-with-children">{children}</div>
    ),
    buildStyles: () => ({})
  }));
};

// Custom matchers
export const customMatchers = {
  toBeWithinRange: (received: number, floor: number, ceiling: number) => {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
  
  toHaveCurrency: (received: string, expectedAmount: number) => {
    const currencyRegex = /\$[\d,]+\.?\d*/;
    const match = received.match(currencyRegex);
    
    if (!match) {
      return {
        message: () => `expected "${received}" to contain currency format`,
        pass: false,
      };
    }
    
    const amount = parseFloat(match[0].replace(/[$,]/g, ''));
    const pass = Math.abs(amount - expectedAmount) < 0.01;
    
    return {
      message: () => `expected "${received}" to contain currency amount ${expectedAmount}`,
      pass,
    };
  }
};

// Test data factories
export class TestDataFactory {
  static createBudgetData(count = 5) {
    const categories = ['Housing', 'Food', 'Transport', 'Entertainment', 'Healthcare'];
    return categories.slice(0, count).map((category, index) => 
      generateMockBudgetItem({
        id: `budget-${index}`,
        category,
        currentAmount: 500 + index * 200,
        actualSpending: 450 + index * 220
      })
    );
  }

  static createGoalData(count = 3) {
    const goalTypes = [
      { title: 'Emergency Fund', category: 'emergency', targetAmount: 15000 },
      { title: 'House Down Payment', category: 'purchase', targetAmount: 60000 },
      { title: 'Vacation Fund', category: 'travel', targetAmount: 8000 }
    ];
    
    return goalTypes.slice(0, count).map((goal, index) =>
      generateMockGoal({
        id: `goal-${index}`,
        ...goal,
        currentAmount: goal.targetAmount * (0.3 + index * 0.2)
      })
    );
  }

  static createInsightData(count = 4) {
    const insights = [
      { type: 'warning', title: 'Overspending Alert', impact: 'high' },
      { type: 'success', title: 'Great Progress', impact: 'medium' },
      { type: 'info', title: 'Optimization Opportunity', impact: 'medium' },
      { type: 'error', title: 'Budget Exceeded', impact: 'high' }
    ];
    
    return insights.slice(0, count).map((insight, index) =>
      generateMockInsight({
        id: `insight-${index}`,
        ...insight
      })
    );
  }
}

// Performance testing utilities
export const measureRenderTime = async (renderFn: () => void) => {
  const start = performance.now();
  renderFn();
  await waitForAsyncOperations();
  const end = performance.now();
  return end - start;
};

// Accessibility testing helpers
export const checkAccessibility = async (container: HTMLElement) => {
  const { axe } = await import('axe-core');
  const results = await axe.run(container);
  return results.violations;
};

// Export everything for easy importing
export * from '@testing-library/react';
export { renderWithProviders as render };