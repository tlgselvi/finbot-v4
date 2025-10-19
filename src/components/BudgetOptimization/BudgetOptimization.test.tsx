/**
 * Budget Optimization Component Tests
 * Comprehensive test suite for budget optimization components
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import '@testing-library/jest-dom';

import BudgetOptimizationDashboard from './BudgetOptimizationDashboard';
import BudgetCategory from './BudgetCategory';
import BudgetVisualization from './BudgetVisualization';
import OptimizationSuggestions from './OptimizationSuggestions';

// Mock the custom hook
jest.mock('../../hooks/useBudgetOptimization', () => ({
  useBudgetOptimization: () => ({
    optimizeBudget: jest.fn().mockResolvedValue({
      totalSavings: 500,
      optimizationScore: 0.85,
      optimizedBudget: {
        'Housing': 1400,
        'Food & Dining': 550,
        'Transportation': 350,
        'Entertainment': 250,
        'Savings': 1000
      },
      recommendations: [
        {
          id: 'reduce_entertainment',
          category: 'Entertainment',
          type: 'reduce',
          amount: 50,
          impact: 0.7,
          confidence: 0.85,
          description: 'Reduce entertainment spending by 17%',
          reasoning: 'You can save money by reducing entertainment expenses.'
        }
      ],
      scenarios: []
    }),
    getBudgetRecommendations: jest.fn(),
    saveBudgetPlan: jest.fn(),
    loadBudgetPlan: jest.fn(),
    isLoading: false,
    error: null
  })
}));

// Mock recharts
jest.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Cell: () => <div data-testid="cell" />,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />
}));

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      {component}
    </ThemeProvider>
  );
};

describe('BudgetOptimizationDashboard', () => {
  test('renders dashboard with main components', () => {
    renderWithTheme(<BudgetOptimizationDashboard />);
    
    expect(screen.getByText('Budget Optimization')).toBeInTheDocument();
    expect(screen.getByText('AI-powered budget planning and optimization')).toBeInTheDocument();
    expect(screen.getByText('Optimize')).toBeInTheDocument();
  });

  test('displays budget overview cards', () => {
    renderWithTheme(<BudgetOptimizationDashboard />);
    
    expect(screen.getByText('Total Budget')).toBeInTheDocument();
    expect(screen.getByText('Potential Savings')).toBeInTheDocument();
    expect(screen.getByText('Savings Rate')).toBeInTheDocument();
    expect(screen.getByText('Overspending')).toBeInTheDocument();
  });

  test('handles optimization trigger', async () => {
    renderWithTheme(<BudgetOptimizationDashboard />);
    
    const optimizeButton = screen.getByText('Optimize');
    fireEvent.click(optimizeButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Optimization complete/)).toBeInTheDocument();
    });
  });

  test('switches between tabs', () => {
    renderWithTheme(<BudgetOptimizationDashboard />);
    
    const visualizationTab = screen.getByText('Visualization');
    fireEvent.click(visualizationTab);
    
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });
});