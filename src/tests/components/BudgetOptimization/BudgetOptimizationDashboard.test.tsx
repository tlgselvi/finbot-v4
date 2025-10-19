/**
 * Budget Optimization Dashboard Component Tests
 * Unit tests for BudgetOptimizationDashboard using React Testing Library
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import BudgetOptimizationDashboard from '../../../components/BudgetOptimization/BudgetOptimizationDashboard';
import { useBudgetOptimization } from '../../../hooks/useBudgetOptimization';

// Mock the custom hook
jest.mock('../../../hooks/useBudgetOptimization');
const mockUseBudgetOptimization = useBudgetOptimization as jest.MockedFunction<typeof useBudgetOptimization>;

// Mock data
const mockBudgetData = {
  categories: [
    {
      id: 'cat1',
      name: 'Groceries',
      budgeted: 500,
      spent: 450,
      icon: '🛒',
      color: '#4CAF50',
      priority: 'high' as const,
      isFixed: false,
      trend: 'stable' as const,
      lastMonthSpent: 420,
      averageSpent: 440,
      tags: ['food', 'essentials'],
      monthlyData: [
        { month: 'Jan', budgeted: 500, spent: 450 },
        { month: 'Feb', budgeted: 500, spent: 480 }
      ]
    },
    {
      id: 'cat2',
      name: 'Entertainment',
      budgeted: 200,
      spent: 250,
      icon: '🎬',
      color: '#FF9800',
      priority: 'medium' as const,
      isFixed: false,
      trend: 'up' as const,
      lastMonthSpent: 180,
      averageSpent: 190,
      tags: ['leisure'],
      monthlyData: [
        { month: 'Jan', budgeted: 200, spent: 180 },
        { month: 'Feb', budgeted: 200, spent: 250 }
      ]
    }
  ],
  totalBudgeted: 700,
  totalSpent: 700,
  monthlyTrend: [
    { month: 'Jan', budgeted: 700, spent: 630, variance: -70 },
    { month: 'Feb', budgeted: 700, spent: 730, variance: 30 }
  ]
};

const mockOptimizationSuggestions = [
  {
    id: 'opt1',
    type: 'reduce' as const,
    title: 'Reduce Entertainment Spending',
    description: 'You are over budget in entertainment category',
    category: 'Entertainment',
    impact: 'medium' as const,
    difficulty: 'easy' as const,
    potentialSavings: 50,
    confidence: 85,
    timeframe: '1 month',
    reasoning: ['Spending 25% over budget', 'Similar users save $50/month'],
    steps: ['Set spending limit', 'Track daily expenses'],
    risks: ['May reduce quality of life'],
    benefits: ['More savings for goals', 'Better budget control'],
    aiGenerated: true,
    priority: 1,
    tags: ['overspend', 'lifestyle']
  }
];

const mockScenarios = [
  {
    id: 'scenario1',
    name: 'Conservative Budget',
    description: 'Reduce all non-essential spending by 10%',
    modifications: { 'Entertainment': 180 },
    projectedSavings: 20,
    createdAt: '2024-06-01',
    isActive: false
  }
];

// Test wrapper component
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
      <ThemeProvider theme={theme}>
        <DndProvider backend={HTML5Backend}>
          {children}
        </DndProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

describe('BudgetOptimizationDashboard', () => {
  const mockHookReturn = {
    budgetData: mockBudgetData,
    optimizationSuggestions: mockOptimizationSuggestions,
    scenarios: mockScenarios,
    isLoading: false,
    error: null,
    updateBudgetCategory: jest.fn(),
    optimizeBudget: jest.fn(),
    applyOptimization: jest.fn(),
    createScenario: jest.fn(),
    compareScenarios: jest.fn(),
    saveBudget: jest.fn(),
    refreshData: jest.fn()
  };

  beforeEach(() => {
    mockUseBudgetOptimization.mockReturnValue(mockHookReturn);
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the dashboard with header and summary', () => {
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      expect(screen.getByText('Budget Optimization')).toBeInTheDocument();
      expect(screen.getByText('Interactive budget planning and optimization tools')).toBeInTheDocument();
      expect(screen.getByText('$700')).toBeInTheDocument(); // Total budgeted
    });

    it('renders budget summary cards with correct values', () => {
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      expect(screen.getByText('Total Budgeted')).toBeInTheDocument();
      expect(screen.getByText('Total Spent')).toBeInTheDocument();
      expect(screen.getByText('Remaining')).toBeInTheDocument();
      expect(screen.getByText('Utilization')).toBeInTheDocument();
      expect(screen.getByText('100.0%')).toBeInTheDocument(); // Utilization percentage
    });

    it('renders all tab panels', () => {
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      expect(screen.getByText('Budget Manager')).toBeInTheDocument();
      expect(screen.getByText('Visualization')).toBeInTheDocument();
      expect(screen.getByText('AI Suggestions')).toBeInTheDocument();
      expect(screen.getByText('Scenarios')).toBeInTheDocument();
      expect(screen.getByText('Comparison')).toBeInTheDocument();
    });

    it('renders action buttons in header', () => {
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      expect(screen.getByText('Optimize Budget')).toBeInTheDocument();
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
      expect(screen.getByLabelText('Refresh Data')).toBeInTheDocument();
      expect(screen.getByLabelText('Export Budget')).toBeInTheDocument();
      expect(screen.getByLabelText('Settings')).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('shows loading state when data is loading', () => {
      mockUseBudgetOptimization.mockReturnValue({
        ...mockHookReturn,
        isLoading: true,
        budgetData: null
      });

      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('disables buttons when loading', () => {
      mockUseBudgetOptimization.mockReturnValue({
        ...mockHookReturn,
        isLoading: true
      });

      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      expect(screen.getByText('Optimize Budget')).toBeDisabled();
      expect(screen.getByText('Save Changes')).toBeDisabled();
    });
  });

  describe('Error Handling', () => {
    it('displays error message when there is an error', () => {
      mockUseBudgetOptimization.mockReturnValue({
        ...mockHookReturn,
        error: 'Failed to load budget data'
      });

      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      expect(screen.getByText('Failed to load budget data')).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('switches between tabs correctly', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      // Click on Visualization tab
      await user.click(screen.getByText('Visualization'));
      
      // Should show visualization content
      expect(screen.getByRole('tabpanel', { name: /visualization/i })).toBeVisible();

      // Click on AI Suggestions tab
      await user.click(screen.getByText('AI Suggestions'));
      
      // Should show AI suggestions content
      expect(screen.getByRole('tabpanel', { name: /ai suggestions/i })).toBeVisible();
    });

    it('maintains tab state when switching', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      // Switch to different tabs and back
      await user.click(screen.getByText('Scenarios'));
      await user.click(screen.getByText('Budget Manager'));
      
      // Should be back to Budget Manager tab
      expect(screen.getByRole('tabpanel', { name: /budget manager/i })).toBeVisible();
    });
  });

  describe('User Interactions', () => {
    it('calls optimizeBudget when optimize button is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      await user.click(screen.getByText('Optimize Budget'));
      
      expect(mockHookReturn.optimizeBudget).toHaveBeenCalledWith({
        aggressiveness: 'moderate',
        prioritizeGoals: true,
        maintainLifestyle: true,
        autoApplyRecommendations: false,
        notificationPreferences: {
          overspendAlerts: true,
          optimizationSuggestions: true,
          goalProgress: true
        }
      });
    });

    it('calls saveBudget when save button is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      await user.click(screen.getByText('Save Changes'));
      
      expect(mockHookReturn.saveBudget).toHaveBeenCalled();
    });

    it('calls refreshData when refresh button is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Refresh Data'));
      
      expect(mockHookReturn.refreshData).toHaveBeenCalled();
    });

    it('opens settings dialog when settings button is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Settings'));
      
      expect(screen.getByText('Budget Optimization Settings')).toBeInTheDocument();
    });

    it('opens export dialog when export button is clicked', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      await user.click(screen.getByLabelText('Export Budget'));
      
      expect(screen.getByText('Export Budget')).toBeInTheDocument();
      expect(screen.getByText('Export as PDF')).toBeInTheDocument();
    });
  });

  describe('Settings Dialog', () => {
    it('updates optimization settings correctly', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      // Open settings dialog
      await user.click(screen.getByLabelText('Settings'));
      
      // Change aggressiveness setting
      const aggressivenessSelect = screen.getByLabelText('Optimization Aggressiveness');
      await user.click(aggressivenessSelect);
      await user.click(screen.getByText('Aggressive'));

      // Toggle a switch
      const prioritizeGoalsSwitch = screen.getByLabelText('Prioritize Financial Goals');
      await user.click(prioritizeGoalsSwitch);

      // Save settings
      await user.click(screen.getByText('Save Settings'));

      // Dialog should close
      expect(screen.queryByText('Budget Optimization Settings')).not.toBeInTheDocument();
    });

    it('cancels settings changes correctly', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      // Open settings dialog
      await user.click(screen.getByLabelText('Settings'));
      
      // Make changes
      const aggressivenessSelect = screen.getByLabelText('Optimization Aggressiveness');
      await user.click(aggressivenessSelect);
      await user.click(screen.getByText('Conservative'));

      // Cancel changes
      await user.click(screen.getByText('Cancel'));

      // Dialog should close without saving
      expect(screen.queryByText('Budget Optimization Settings')).not.toBeInTheDocument();
    });
  });

  describe('Export Dialog', () => {
    it('handles PDF export correctly', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      // Open export dialog
      await user.click(screen.getByLabelText('Export Budget'));
      
      // Click PDF export
      await user.click(screen.getByText('Export as PDF'));

      // Should show success message
      await waitFor(() => {
        expect(screen.getByText('Budget exported as PDF')).toBeInTheDocument();
      });
    });

    it('handles Excel export correctly', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      // Open export dialog
      await user.click(screen.getByLabelText('Export Budget'));
      
      // Click Excel export
      await user.click(screen.getByText('Export as Excel'));

      // Should show success message
      await waitFor(() => {
        expect(screen.getByText('Budget exported as EXCEL')).toBeInTheDocument();
      });
    });
  });

  describe('Snackbar Notifications', () => {
    it('shows success message after successful optimization', async () => {
      const user = userEvent.setup();
      mockHookReturn.optimizeBudget.mockResolvedValue(undefined);
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      await user.click(screen.getByText('Optimize Budget'));
      
      await waitFor(() => {
        expect(screen.getByText('Budget optimization completed')).toBeInTheDocument();
      });
    });

    it('shows error message when optimization fails', async () => {
      const user = userEvent.setup();
      mockHookReturn.optimizeBudget.mockRejectedValue(new Error('Optimization failed'));
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      await user.click(screen.getByText('Optimize Budget'));
      
      await waitFor(() => {
        expect(screen.getByText('Budget optimization failed')).toBeInTheDocument();
      });
    });

    it('closes snackbar when close button is clicked', async () => {
      const user = userEvent.setup();
      mockHookReturn.saveBudget.mockResolvedValue(undefined);
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      // Trigger success message
      await user.click(screen.getByText('Save Changes'));
      
      await waitFor(() => {
        expect(screen.getByText('Budget saved successfully')).toBeInTheDocument();
      });

      // Close snackbar
      const closeButton = screen.getByLabelText('Close');
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('Budget saved successfully')).not.toBeInTheDocument();
      });
    });
  });

  describe('Floating Action Button', () => {
    it('renders FAB and triggers optimization on click', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      const fab = screen.getByLabelText('optimize');
      expect(fab).toBeInTheDocument();

      await user.click(fab);
      
      expect(mockHookReturn.optimizeBudget).toHaveBeenCalled();
    });

    it('disables FAB when loading', () => {
      mockUseBudgetOptimization.mockReturnValue({
        ...mockHookReturn,
        isLoading: true
      });

      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      const fab = screen.getByLabelText('optimize');
      expect(fab).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels for interactive elements', () => {
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      expect(screen.getByLabelText('Refresh Data')).toBeInTheDocument();
      expect(screen.getByLabelText('Export Budget')).toBeInTheDocument();
      expect(screen.getByLabelText('Settings')).toBeInTheDocument();
      expect(screen.getByLabelText('optimize')).toBeInTheDocument();
    });

    it('has proper tab navigation structure', () => {
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      const tabList = screen.getByRole('tablist');
      expect(tabList).toBeInTheDocument();

      const tabs = within(tabList).getAllByRole('tab');
      expect(tabs).toHaveLength(5);
    });

    it('maintains focus management in dialogs', async () => {
      const user = userEvent.setup();
      
      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      // Open settings dialog
      await user.click(screen.getByLabelText('Settings'));
      
      // Dialog should be focused
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-labelledby');
    });
  });

  describe('Responsive Behavior', () => {
    it('adapts layout for different screen sizes', () => {
      // Mock window.innerWidth for mobile
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(
        <TestWrapper>
          <BudgetOptimizationDashboard />
        </TestWrapper>
      );

      // Should still render main components
      expect(screen.getByText('Budget Optimization')).toBeInTheDocument();
      expect(screen.getByText('Budget Manager')).toBeInTheDocument();
    });
  });
});

// Integration test for component interaction
describe('BudgetOptimizationDashboard Integration', () => {
  it('integrates properly with child components', async () => {
    const user = userEvent.setup();
    
    const mockHookReturn = {
      budgetData: mockBudgetData,
      optimizationSuggestions: mockOptimizationSuggestions,
      scenarios: mockScenarios,
      isLoading: false,
      error: null,
      updateBudgetCategory: jest.fn(),
      optimizeBudget: jest.fn(),
      applyOptimization: jest.fn(),
      createScenario: jest.fn(),
      compareScenarios: jest.fn(),
      saveBudget: jest.fn(),
      refreshData: jest.fn()
    };

    mockUseBudgetOptimization.mockReturnValue(mockHookReturn);

    render(
      <TestWrapper>
        <BudgetOptimizationDashboard />
      </TestWrapper>
    );

    // Test tab switching and content rendering
    await user.click(screen.getByText('AI Suggestions'));
    
    // Should render optimization suggestions
    expect(screen.getByText('AI-Powered Budget Optimization Suggestions')).toBeInTheDocument();

    // Switch to scenarios tab
    await user.click(screen.getByText('Scenarios'));
    
    // Should render scenarios content
    expect(screen.getByRole('tabpanel', { name: /scenarios/i })).toBeVisible();
  });
});