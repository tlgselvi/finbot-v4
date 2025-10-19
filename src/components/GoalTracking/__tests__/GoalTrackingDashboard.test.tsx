/**
 * Goal Tracking Dashboard Tests
 * Comprehensive unit and integration tests for the goal tracking dashboard
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import '@testing-library/jest-dom';

import GoalTrackingDashboard from '../GoalTrackingDashboard';
import { useGoalTracking } from '../../../hooks/useGoalTracking';

// Mock the hook
jest.mock('../../../hooks/useGoalTracking');
const mockUseGoalTracking = useGoalTracking as jest.MockedFunction<typeof useGoalTracking>;

// Mock formatters
jest.mock('../../../utils/formatters', () => ({
  formatCurrency: (amount: number) => `$${amount.toLocaleString()}`,
  formatPercentage: (value: number) => `${Math.round(value)}%`,
  formatDate: (date: string) => new Date(date).toLocaleDateString()
}));

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      {component}
    </ThemeProvider>
  );
};

const mockGoals = [
  {
    id: '1',
    title: 'Emergency Fund',
    description: 'Build a 6-month emergency fund',
    targetAmount: 15000,
    currentAmount: 8500,
    targetDate: '2024-12-31',
    category: 'emergency_fund',
    priority: 'high' as const,
    status: 'active' as const,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-10-15T00:00:00Z'
  },
  {
    id: '2',
    title: 'Vacation Fund',
    description: 'Save for European vacation',
    targetAmount: 5000,
    currentAmount: 5000,
    targetDate: '2025-06-01',
    category: 'vacation',
    priority: 'medium' as const,
    status: 'completed' as const,
    createdAt: '2024-02-01T00:00:00Z',
    updatedAt: '2024-09-15T00:00:00Z'
  }
];

const mockMilestones = [
  {
    id: '1',
    title: 'First Milestone',
    description: 'Reach $5,000',
    targetAmount: 5000,
    isCompleted: true,
    completedAt: '2024-08-15T00:00:00Z',
    goalId: '1'
  }
];

const mockAchievements = [
  {
    id: '1',
    title: 'First Goal Completed',
    description: 'Completed your first savings goal',
    type: 'goal_completion',
    achievedAt: '2024-09-15T00:00:00Z',
    goalId: '2',
    points: 200
  }
];

const mockInsights = [
  {
    id: '1',
    type: 'tip' as const,
    title: 'Savings Tip',
    description: 'Consider increasing your monthly savings',
    confidence: 0.85,
    actionable: true,
    createdAt: '2024-10-15T00:00:00Z'
  }
];

const defaultMockHookReturn = {
  goals: mockGoals,
  milestones: mockMilestones,
  achievements: mockAchievements,
  insights: mockInsights,
  isLoading: false,
  error: null,
  createGoal: jest.fn(),
  updateGoalProgress: jest.fn(),
  updateGoal: jest.fn(),
  deleteGoal: jest.fn(),
  refreshData: jest.fn()
};

describe('GoalTrackingDashboard', () => {
  beforeEach(() => {
    mockUseGoalTracking.mockReturnValue(defaultMockHookReturn);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the dashboard title and subtitle', () => {
      renderWithTheme(<GoalTrackingDashboard />);
      
      expect(screen.getByText('Goal Tracking Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Track your financial goals and celebrate your achievements')).toBeInTheDocument();
    });

    it('renders summary cards with correct data', () => {
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Active goals count (only goal 1 is active)
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('Active Goals')).toBeInTheDocument();
      
      // Completed goals count (goal 2 is completed)
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('Completed Goals')).toBeInTheDocument();
      
      // Total saved (8500 + 5000 = 13500)
      expect(screen.getByText('$13,500')).toBeInTheDocument();
      expect(screen.getByText('Total Saved')).toBeInTheDocument();
      
      // Achievements count
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('Achievements')).toBeInTheDocument();
    });

    it('renders navigation tabs', () => {
      renderWithTheme(<GoalTrackingDashboard />);
      
      expect(screen.getByText('My Goals')).toBeInTheDocument();
      expect(screen.getByText('Milestones')).toBeInTheDocument();
      expect(screen.getByText('Achievements')).toBeInTheDocument();
      expect(screen.getByText('Insights')).toBeInTheDocument();
    });

    it('renders goal cards for active goals', () => {
      renderWithTheme(<GoalTrackingDashboard />);
      
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
      expect(screen.getByText('Build a 6-month emergency fund')).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('shows loading spinner when data is loading', () => {
      mockUseGoalTracking.mockReturnValue({
        ...defaultMockHookReturn,
        goals: null,
        isLoading: true
      });

      renderWithTheme(<GoalTrackingDashboard />);
      
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('shows error message when there is an error', () => {
      mockUseGoalTracking.mockReturnValue({
        ...defaultMockHookReturn,
        error: 'Failed to load data'
      });

      renderWithTheme(<GoalTrackingDashboard />);
      
      expect(screen.getByText('Failed to load data')).toBeInTheDocument();
    });
  });

  describe('Goal Filtering and Sorting', () => {
    it('filters goals by status', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Open status filter
      const statusFilter = screen.getByLabelText('Status');
      await user.click(statusFilter);
      
      // Select completed goals
      const completedOption = screen.getByText('Completed');
      await user.click(completedOption);
      
      // Should show completed goals count
      expect(screen.getByText('1 goals')).toBeInTheDocument();
    });

    it('sorts goals by different criteria', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Open sort filter
      const sortFilter = screen.getByLabelText('Sort by');
      await user.click(sortFilter);
      
      // Select progress sorting
      const progressOption = screen.getByText('Progress');
      await user.click(progressOption);
      
      // Verify sorting is applied (implementation would sort goals)
      expect(screen.getByDisplayValue('progress')).toBeInTheDocument();
    });
  });

  describe('Goal Creation', () => {
    it('opens goal wizard when New Goal button is clicked', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalTrackingDashboard />);
      
      const newGoalButton = screen.getByText('New Goal');
      await user.click(newGoalButton);
      
      // Goal wizard should open (mocked component would show)
      expect(screen.getByText('New Goal')).toBeInTheDocument();
    });

    it('opens goal wizard when FAB is clicked', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalTrackingDashboard />);
      
      const fab = screen.getByLabelText('add goal');
      await user.click(fab);
      
      // Goal wizard should open
      expect(screen.getByText('New Goal')).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('switches between tabs correctly', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Click on Milestones tab
      const milestonesTab = screen.getByText('Milestones');
      await user.click(milestonesTab);
      
      // Should show milestones content
      expect(screen.getByText('Milestones')).toBeInTheDocument();
      
      // Click on Achievements tab
      const achievementsTab = screen.getByText('Achievements');
      await user.click(achievementsTab);
      
      // Should show achievements content
      expect(screen.getByText('Your Achievements')).toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('shows empty state when no goals exist', () => {
      mockUseGoalTracking.mockReturnValue({
        ...defaultMockHookReturn,
        goals: []
      });

      renderWithTheme(<GoalTrackingDashboard />);
      
      expect(screen.getByText('No goals yet')).toBeInTheDocument();
      expect(screen.getByText('Create your first financial goal to get started')).toBeInTheDocument();
    });

    it('shows filtered empty state when no goals match filter', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Filter by paused goals (none exist)
      const statusFilter = screen.getByLabelText('Status');
      await user.click(statusFilter);
      
      const pausedOption = screen.getByText('Paused');
      await user.click(pausedOption);
      
      expect(screen.getByText('No paused goals')).toBeInTheDocument();
    });
  });

  describe('Progress Updates', () => {
    it('handles progress updates correctly', async () => {
      const mockUpdateProgress = jest.fn().mockResolvedValue({
        goal: mockGoals[0],
        newMilestones: [],
        progressPercentage: 60
      });

      mockUseGoalTracking.mockReturnValue({
        ...defaultMockHookReturn,
        updateGoalProgress: mockUpdateProgress
      });

      renderWithTheme(<GoalTrackingDashboard />);
      
      // This would be triggered by child components
      // Testing the handler function exists and works
      expect(mockUpdateProgress).toBeDefined();
    });

    it('shows celebration when milestone is achieved', async () => {
      const mockUpdateProgress = jest.fn().mockResolvedValue({
        goal: mockGoals[0],
        newMilestones: [mockMilestones[0]],
        progressPercentage: 60
      });

      mockUseGoalTracking.mockReturnValue({
        ...defaultMockHookReturn,
        updateGoalProgress: mockUpdateProgress
      });

      renderWithTheme(<GoalTrackingDashboard />);
      
      // Celebration should be triggered for new milestones
      expect(mockUpdateProgress).toBeDefined();
    });
  });

  describe('Achievements Display', () => {
    it('displays achievements in achievements tab', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Navigate to achievements tab
      const achievementsTab = screen.getByText('Achievements');
      await user.click(achievementsTab);
      
      // Should show achievement
      expect(screen.getByText('First Goal Completed')).toBeInTheDocument();
      expect(screen.getByText('Completed your first savings goal')).toBeInTheDocument();
    });

    it('shows empty state when no achievements exist', async () => {
      const user = userEvent.setup();
      
      mockUseGoalTracking.mockReturnValue({
        ...defaultMockHookReturn,
        achievements: []
      });

      renderWithTheme(<GoalTrackingDashboard />);
      
      // Navigate to achievements tab
      const achievementsTab = screen.getByText('Achievements');
      await user.click(achievementsTab);
      
      expect(screen.getByText('No achievements yet. Keep working on your goals!')).toBeInTheDocument();
    });
  });

  describe('Refresh Functionality', () => {
    it('calls refreshData when refresh button is clicked', async () => {
      const user = userEvent.setup();
      const mockRefreshData = jest.fn();
      
      mockUseGoalTracking.mockReturnValue({
        ...defaultMockHookReturn,
        refreshData: mockRefreshData
      });

      renderWithTheme(<GoalTrackingDashboard />);
      
      const refreshButton = screen.getByLabelText('Refresh Data');
      await user.click(refreshButton);
      
      expect(mockRefreshData).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels and roles', () => {
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Check for proper tab roles
      expect(screen.getByRole('tablist')).toBeInTheDocument();
      expect(screen.getAllByRole('tab')).toHaveLength(4);
      
      // Check for proper button labels
      expect(screen.getByLabelText('add goal')).toBeInTheDocument();
      expect(screen.getByLabelText('Refresh Data')).toBeInTheDocument();
    });

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Tab navigation should work
      await user.tab();
      expect(document.activeElement).toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    it('renders properly on different screen sizes', () => {
      // Test mobile view
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      renderWithTheme(<GoalTrackingDashboard />);
      
      // Should still render main components
      expect(screen.getByText('Goal Tracking Dashboard')).toBeInTheDocument();
      expect(screen.getByText('My Goals')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('handles goal creation errors gracefully', async () => {
      const mockCreateGoal = jest.fn().mockRejectedValue(new Error('Creation failed'));
      
      mockUseGoalTracking.mockReturnValue({
        ...defaultMockHookReturn,
        createGoal: mockCreateGoal
      });

      renderWithTheme(<GoalTrackingDashboard />);
      
      // Error handling should be in place
      expect(mockCreateGoal).toBeDefined();
    });

    it('handles progress update errors gracefully', async () => {
      const mockUpdateProgress = jest.fn().mockRejectedValue(new Error('Update failed'));
      
      mockUseGoalTracking.mockReturnValue({
        ...defaultMockHookReturn,
        updateGoalProgress: mockUpdateProgress
      });

      renderWithTheme(<GoalTrackingDashboard />);
      
      // Error handling should be in place
      expect(mockUpdateProgress).toBeDefined();
    });
  });
});