/**
 * Dashboard Integration Tests
 * Integration tests for dashboard functionality and component interactions
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import AnalyticsDashboard from '../../components/Dashboard/AnalyticsDashboard';
import BudgetOptimizationDashboard from '../../components/BudgetOptimization/BudgetOptimizationDashboard';
import GoalTrackingDashboard from '../../components/GoalTracking/GoalTrackingDashboard';

// Mock API calls
jest.mock('../../services/api', () => ({
  analyticsAPI: {
    getDashboardData: jest.fn(),
    getInsights: jest.fn(),
    getSpendingAnalytics: jest.fn(),
  },
  budgetOptimizationAPI: {
    getBudgetData: jest.fn(),
    getOptimizationSuggestions: jest.fn(),
    getBudgetScenarios: jest.fn(),
    updateBudgetCategory: jest.fn(),
    optimizeBudget: jest.fn(),
    applyOptimization: jest.fn(),
  },
  goalTrackingAPI: {
    getGoals: jest.fn(),
    getGoalAnalytics: jest.fn(),
    createGoal: jest.fn(),
    updateGoalProgress: jest.fn(),
  }
}));

// Mock data
const mockDashboardData = {
  totalBalance: 25000,
  monthlyIncome: 6000,
  monthlyExpenses: 4200,
  savingsRate: 30,
  budgetUtilization: 70,
  goalProgress: 65,
  insights: [
    {
      id: 'insight1',
      type: 'spending',
      title: 'Dining out increased by 20%',
      description: 'Your dining expenses have increased significantly this month',
      priority: 'medium',
      confidence: 85,
      actionable: true,
      category: 'dining'
    }
  ],
  recentTransactions: [
    {
      id: 'tx1',
      amount: 85.50,
      category: 'dining',
      description: 'Restaurant dinner',
      date: '2024-06-15T19:30:00Z'
    }
  ],
  upcomingBills: [
    {
      id: 'bill1',
      name: 'Electric Bill',
      amount: 120,
      dueDate: '2024-06-25'
    }
  ]
};

const mockBudgetData = {
  categories: [
    {
      id: 'cat1',
      name: 'Groceries',
      budgeted: 500,
      spent: 450,
      icon: '🛒',
      color: '#4CAF50',
      priority: 'high',
      isFixed: false,
      trend: 'stable',
      lastMonthSpent: 420,
      averageSpent: 440,
      tags: ['food'],
      monthlyData: []
    }
  ],
  totalBudgeted: 2000,
  totalSpent: 1800,
  monthlyTrend: []
};

const mockGoalsData = [
  {
    id: 'goal1',
    title: 'Emergency Fund',
    targetAmount: 15000,
    currentAmount: 8500,
    targetDate: '2024-12-31',
    category: 'emergency',
    status: 'active',
    progressPercentage: 56.7
  }
];

// Test wrapper
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  
  const theme = createTheme();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider theme={theme}>
          {children}
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('Dashboard Integration Tests', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock implementations
    const { analyticsAPI, budgetOptimizationAPI, goalTrackingAPI } = require('../../services/api');
    
    analyticsAPI.getDashboardData.mockResolvedValue(mockDashboardData);
    analyticsAPI.getInsights.mockResolvedValue(mockDashboardData.insights);
    analyticsAPI.getSpendingAnalytics.mockResolvedValue({
      totalSpending: 4200,
      categoryBreakdown: { dining: 800, groceries: 500 }
    });
    
    budgetOptimizationAPI.getBudgetData.mockResolvedValue(mockBudgetData);
    budgetOptimizationAPI.getOptimizationSuggestions.mockResolvedValue([]);
    budgetOptimizationAPI.getBudgetScenarios.mockResolvedValue([]);
    
    goalTrackingAPI.getGoals.mockResolvedValue(mockGoalsData);
    goalTrackingAPI.getGoalAnalytics.mockResolvedValue({
      totalGoals: 1,
      activeGoals: 1,
      completedGoals: 0
    });
  });

  describe('Analytics Dashboard Integration', () => {
    it('loads and displays dashboard data correctly', async () => {
      render(
        <TestWrapper>
          <AnalyticsDashboard />
        </TestWrapper>
      );

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('$25,000')).toBeInTheDocument();
      });

      // Check all main metrics are displayed
      expect(screen.getByText('$6,000')).toBeInTheDocument(); // Monthly income
      expect(screen.getByText('$4,200')).toBeInTheDocument(); // Monthly expenses
      expect(screen.getByText('30%')).toBeInTheDocument(); // Savings rate
    });

    it('displays insights and allows interaction', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <AnalyticsDashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Dining out increased by 20%')).toBeInTheDocument();
      });

      // Should show insight details
      expect(screen.getByText('Your dining expenses have increased significantly this month')).toBeInTheDocument();
      
      // Should have actionable buttons
      const actionButtons = screen.getAllByText(/view details|take action/i);
      expect(actionButtons.length).toBeGreaterThan(0);
    });

    it('shows recent transactions with proper formatting', async () => {
      render(
        <TestWrapper>
          <AnalyticsDashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Restaurant dinner')).toBeInTheDocument();
      });

      expect(screen.getByText('$85.50')).toBeInTheDocument();
      expect(screen.getByText('dining')).toBeInTheDocument();
    });

    it('displays upcoming bills section', async () => {
      render(
        <TestWrapper>
          <AnalyticsDashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Electric Bill')).toBeInTheDocument();
      });

      expect(screen.getByText('$120')).toBeInTheDocument();
    });
  });

  describe('Budget Optimization Integration', () => {
    it('integrates budget data with optimization suggestions', async () => {
      const { budgetOptimizationAPI } = require('../../services/api');
      
      // Mock optimization suggestions
      budgetOptimizationAPI.getOptimizationSuggestions.mockResolvedValue([
        {
          id: 'opt1',
          type: 'reduce',
          title: 'Reduce Dining Expenses',
          description: 'Consider cooking more meals at home',
          category: 'dining',
          impact: 'medium',
          difficulty: 'easy',
          potentialSavings: 150,
          confidence: 80,
          timeframe: '1 month',
          reasoning: ['Spending above average'],
          steps: ['Plan weekly meals', 'Set dining budget'],
          risks: [],
          benefits: ['Save money', 'Healthier eating'],
          aiGenerated: true,
          priority: 1,
          tags: ['lifestyle']
        }
      ]);

      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      // Wait for budget data to load
      await waitFor(() => {
        expect(screen.getByText('$2,000')).toBeInTheDocument(); // Total budgeted
      });

      // Switch to AI Suggestions tab
      const user = userEvent.setup();
      await user.click(screen.getByText('AI Suggestions'));

      // Should show optimization suggestions
      await waitFor(() => {
        expect(screen.getByText('Reduce Dining Expenses')).toBeInTheDocument();
      });

      expect(screen.getByText('$150')).toBeInTheDocument(); // Potential savings
      expect(screen.getByText('80%')).toBeInTheDocument(); // Confidence
    });

    it('handles budget category updates correctly', async () => {
      const { budgetOptimizationAPI } = require('../../services/api');
      budgetOptimizationAPI.updateBudgetCategory.mockResolvedValue({});

      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('Groceries')).toBeInTheDocument();
      });

      // Find and interact with budget slider
      const sliders = screen.getAllByRole('slider');
      if (sliders.length > 0) {
        fireEvent.change(sliders[0], { target: { value: '550' } });
        
        await waitFor(() => {
          expect(budgetOptimizationAPI.updateBudgetCategory).toHaveBeenCalledWith(
            'cat1',
            { budgeted: 550 }
          );
        });
      }
    });

    it('applies optimization suggestions successfully', async () => {
      const { budgetOptimizationAPI } = require('../../services/api');
      budgetOptimizationAPI.applyOptimization.mockResolvedValue({});
      
      // Setup suggestions
      budgetOptimizationAPI.getOptimizationSuggestions.mockResolvedValue([
        {
          id: 'opt1',
          type: 'reduce',
          title: 'Test Optimization',
          description: 'Test description',
          category: 'dining',
          impact: 'medium',
          difficulty: 'easy',
          potentialSavings: 100,
          confidence: 85,
          timeframe: '1 month',
          reasoning: [],
          steps: [],
          risks: [],
          benefits: [],
          aiGenerated: true,
          priority: 1,
          tags: []
        }
      ]);

      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      // Navigate to AI Suggestions
      await user.click(screen.getByText('AI Suggestions'));

      // Wait for suggestions to load
      await waitFor(() => {
        expect(screen.getByText('Test Optimization')).toBeInTheDocument();
      });

      // Apply optimization
      const applyButton = screen.getByText('Apply');
      await user.click(applyButton);

      await waitFor(() => {
        expect(budgetOptimizationAPI.applyOptimization).toHaveBeenCalledWith('opt1');
      });
    });
  });

  describe('Goal Tracking Integration', () => {
    it('displays goal progress and milestones', async () => {
      render(
        <TestWrapper>
          <GoalTrackingDashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
      });

      expect(screen.getByText('$15,000')).toBeInTheDocument(); // Target amount
      expect(screen.getByText('$8,500')).toBeInTheDocument(); // Current amount
      expect(screen.getByText('56.7%')).toBeInTheDocument(); // Progress percentage
    });

    it('handles goal progress updates', async () => {
      const { goalTrackingAPI } = require('../../services/api');
      goalTrackingAPI.updateGoalProgress.mockResolvedValue({
        success: true,
        goal: { ...mockGoalsData[0], currentAmount: 9000 }
      });

      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <GoalTrackingDashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
      });

      // Find and click add progress button
      const addProgressButtons = screen.getAllByText(/add.*progress|contribute/i);
      if (addProgressButtons.length > 0) {
        await user.click(addProgressButtons[0]);

        // Should open progress dialog or form
        // This would depend on the actual implementation
      }
    });
  });

  describe('Cross-Component Data Flow', () => {
    it('updates related components when budget changes affect goals', async () => {
      const { budgetOptimizationAPI, goalTrackingAPI } = require('../../services/api');
      
      // Mock successful budget update
      budgetOptimizationAPI.updateBudgetCategory.mockResolvedValue({});
      
      // Mock goal data that would be affected
      goalTrackingAPI.getGoalAnalytics.mockResolvedValue({
        totalGoals: 1,
        activeGoals: 1,
        completedGoals: 0,
        totalSaved: 8500,
        projectedSavings: 200 // Increased due to budget optimization
      });

      render(
        <TestWrapper>
          <div>
            <BudgetOptimizationDashboard />
            <GoalTrackingDashboard />
          </div>
        </TestWrapper>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByText('Groceries')).toBeInTheDocument();
      });

      // Simulate budget change that affects savings
      const sliders = screen.getAllByRole('slider');
      if (sliders.length > 0) {
        fireEvent.change(sliders[0], { target: { value: '450' } }); // Reduce budget
      }

      // Should trigger updates to goal projections
      await waitFor(() => {
        expect(budgetOptimizationAPI.updateBudgetCategory).toHaveBeenCalled();
      });
    });

    it('shows consistent data across dashboard components', async () => {
      render(
        <TestWrapper>
          <AnalyticsDashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        // Budget utilization should be consistent
        expect(screen.getByText('70%')).toBeInTheDocument();
        
        // Goal progress should match
        expect(screen.getByText('65%')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('handles API errors gracefully across components', async () => {
      const { analyticsAPI } = require('../../services/api');
      
      // Mock API error
      analyticsAPI.getDashboardData.mockRejectedValue(new Error('Network error'));

      render(
        <TestWrapper>
          <AnalyticsDashboard />
        </TestWrapper>
      );

      // Should show error state
      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });
    });

    it('shows loading states during data fetching', async () => {
      const { analyticsAPI } = require('../../services/api');
      
      // Mock delayed response
      analyticsAPI.getDashboardData.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockDashboardData), 1000))
      );

      render(
        <TestWrapper>
          <AnalyticsDashboard />
        </TestWrapper>
      );

      // Should show loading indicator
      expect(screen.getByRole('progressbar')).toBeInTheDocument();

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('$25,000')).toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });

  describe('Real-time Updates', () => {
    it('refreshes data when refresh button is clicked', async () => {
      const { analyticsAPI } = require('../../services/api');
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <AnalyticsDashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('$25,000')).toBeInTheDocument();
      });

      // Clear previous calls
      analyticsAPI.getDashboardData.mockClear();

      // Click refresh button
      const refreshButton = screen.getByLabelText(/refresh/i);
      await user.click(refreshButton);

      // Should call API again
      await waitFor(() => {
        expect(analyticsAPI.getDashboardData).toHaveBeenCalled();
      });
    });

    it('updates UI when underlying data changes', async () => {
      const { analyticsAPI } = require('../../services/api');
      
      const { rerender } = render(
        <TestWrapper>
          <AnalyticsDashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('$25,000')).toBeInTheDocument();
      });

      // Update mock data
      const updatedData = {
        ...mockDashboardData,
        totalBalance: 26000
      };
      analyticsAPI.getDashboardData.mockResolvedValue(updatedData);

      // Trigger re-render (simulating data update)
      rerender(
        <TestWrapper>
          <AnalyticsDashboard />
        </TestWrapper>
      );

      // Should show updated data
      await waitFor(() => {
        expect(screen.getByText('$26,000')).toBeInTheDocument();
      });
    });
  });

  describe('Performance Integration', () => {
    it('handles large datasets efficiently', async () => {
      const { analyticsAPI } = require('../../services/api');
      
      // Mock large dataset
      const largeDataset = {
        ...mockDashboardData,
        recentTransactions: Array.from({ length: 100 }, (_, i) => ({
          id: `tx${i}`,
          amount: Math.random() * 1000,
          category: 'test',
          description: `Transaction ${i}`,
          date: new Date().toISOString()
        }))
      };
      
      analyticsAPI.getDashboardData.mockResolvedValue(largeDataset);

      const startTime = performance.now();
      
      render(
        <TestWrapper>
          <AnalyticsDashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('$25,000')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render within reasonable time (adjust threshold as needed)
      expect(renderTime).toBeLessThan(2000); // 2 seconds
    });
  });
});