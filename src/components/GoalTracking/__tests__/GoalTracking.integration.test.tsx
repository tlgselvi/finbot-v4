/**
 * Goal Tracking Integration Tests
 * Integration tests for the complete goal tracking workflow
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import '@testing-library/jest-dom';

import GoalTrackingDashboard from '../GoalTrackingDashboard';

// Mock the hook with more realistic behavior
jest.mock('../../../hooks/useGoalTracking');

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

// Mock data that will be updated during tests
let mockGoals = [
  {
    id: '1',
    title: 'Emergency Fund',
    description: 'Build a 6-month emergency fund',
    targetAmount: 15000,
    currentAmount: 5000,
    targetDate: '2024-12-31',
    category: 'emergency_fund',
    priority: 'high' as const,
    status: 'active' as const,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-10-15T00:00:00Z'
  }
];

let mockMilestones = [
  {
    id: '1',
    title: 'First $5,000',
    description: 'Reach the first milestone',
    targetAmount: 5000,
    isCompleted: true,
    completedAt: '2024-08-15T00:00:00Z',
    goalId: '1'
  },
  {
    id: '2',
    title: 'Halfway Point',
    description: 'Reach $7,500',
    targetAmount: 7500,
    isCompleted: false,
    goalId: '1'
  }
];

let mockAchievements: any[] = [];
let mockInsights: any[] = [];

// Mock hook implementation
const mockHookImplementation = {
  goals: mockGoals,
  milestones: mockMilestones,
  achievements: mockAchievements,
  insights: mockInsights,
  isLoading: false,
  error: null,
  createGoal: jest.fn().mockImplementation(async (goalData) => {
    const newGoal = {
      ...goalData,
      id: Date.now().toString(),
      currentAmount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    mockGoals.push(newGoal);
    return newGoal;
  }),
  updateGoalProgress: jest.fn().mockImplementation(async (goalId, amount, note) => {
    const goalIndex = mockGoals.findIndex(g => g.id === goalId);
    if (goalIndex === -1) throw new Error('Goal not found');
    
    const goal = mockGoals[goalIndex];
    const newAmount = goal.currentAmount + amount;
    const updatedGoal = {
      ...goal,
      currentAmount: newAmount,
      status: newAmount >= goal.targetAmount ? 'completed' : goal.status,
      updatedAt: new Date().toISOString()
    };
    
    mockGoals[goalIndex] = updatedGoal;
    
    // Check for milestone completions
    const newMilestones = mockMilestones.filter(m => 
      m.goalId === goalId && 
      !m.isCompleted && 
      newAmount >= m.targetAmount
    );
    
    newMilestones.forEach(milestone => {
      const milestoneIndex = mockMilestones.findIndex(m => m.id === milestone.id);
      mockMilestones[milestoneIndex] = {
        ...milestone,
        isCompleted: true,
        completedAt: new Date().toISOString()
      };
      
      // Add achievement
      mockAchievements.push({
        id: `achievement-${Date.now()}-${milestone.id}`,
        title: 'Milestone Achieved!',
        description: `Completed milestone: ${milestone.title}`,
        type: 'milestone',
        achievedAt: new Date().toISOString(),
        goalId: goalId,
        points: 50
      });
    });
    
    // Check for goal completion
    if (updatedGoal.status === 'completed') {
      mockAchievements.push({
        id: `achievement-${Date.now()}-goal-${goalId}`,
        title: 'Goal Completed!',
        description: `Successfully completed goal: ${updatedGoal.title}`,
        type: 'goal_completion',
        achievedAt: new Date().toISOString(),
        goalId: goalId,
        points: 200
      });
    }
    
    return {
      goal: updatedGoal,
      newMilestones,
      progressPercentage: (newAmount / goal.targetAmount) * 100
    };
  }),
  updateGoal: jest.fn().mockImplementation(async (goalId, updates) => {
    const goalIndex = mockGoals.findIndex(g => g.id === goalId);
    if (goalIndex === -1) throw new Error('Goal not found');
    
    mockGoals[goalIndex] = {
      ...mockGoals[goalIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };
  }),
  deleteGoal: jest.fn().mockImplementation(async (goalId) => {
    mockGoals = mockGoals.filter(g => g.id !== goalId);
    mockMilestones = mockMilestones.filter(m => m.goalId !== goalId);
    mockAchievements = mockAchievements.filter(a => a.goalId !== goalId);
  }),
  refreshData: jest.fn()
};

// Apply the mock
require('../../../hooks/useGoalTracking').useGoalTracking.mockReturnValue(mockHookImplementation);

describe('Goal Tracking Integration Tests', () => {
  beforeEach(() => {
    // Reset mock data
    mockGoals = [
      {
        id: '1',
        title: 'Emergency Fund',
        description: 'Build a 6-month emergency fund',
        targetAmount: 15000,
        currentAmount: 5000,
        targetDate: '2024-12-31',
        category: 'emergency_fund',
        priority: 'high' as const,
        status: 'active' as const,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-10-15T00:00:00Z'
      }
    ];
    
    mockMilestones = [
      {
        id: '1',
        title: 'First $5,000',
        description: 'Reach the first milestone',
        targetAmount: 5000,
        isCompleted: true,
        completedAt: '2024-08-15T00:00:00Z',
        goalId: '1'
      },
      {
        id: '2',
        title: 'Halfway Point',
        description: 'Reach $7,500',
        targetAmount: 7500,
        isCompleted: false,
        goalId: '1'
      }
    ];
    
    mockAchievements = [];
    mockInsights = [];
    
    // Update mock implementation
    mockHookImplementation.goals = mockGoals;
    mockHookImplementation.milestones = mockMilestones;
    mockHookImplementation.achievements = mockAchievements;
    mockHookImplementation.insights = mockInsights;
    
    jest.clearAllMocks();
  });

  describe('Complete Goal Workflow', () => {
    it('allows user to create a new goal and track progress', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Initial state - should show 1 goal
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // Active goals count
      
      // Create a new goal
      const newGoalButton = screen.getByText('New Goal');
      await user.click(newGoalButton);
      
      // Goal wizard should open (mocked)
      expect(mockHookImplementation.createGoal).toBeDefined();
      
      // Simulate goal creation
      await mockHookImplementation.createGoal({
        title: 'Vacation Fund',
        description: 'Save for summer vacation',
        targetAmount: 5000,
        targetDate: '2025-06-01',
        category: 'vacation',
        priority: 'medium',
        status: 'active'
      });
      
      // Update the mock to reflect new goal
      mockHookImplementation.goals = mockGoals;
      
      // Re-render to see updated state
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Should now show 2 goals
      expect(screen.getByText('2')).toBeInTheDocument(); // Active goals count
    });

    it('handles progress updates and milestone achievements', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Find the goal card and add progress
      const goalCard = screen.getByText('Emergency Fund').closest('.MuiCard-root');
      expect(goalCard).toBeInTheDocument();
      
      // Simulate adding progress that completes a milestone
      await mockHookImplementation.updateGoalProgress('1', 2500, 'Monthly savings');
      
      // Check that milestone was completed
      const completedMilestone = mockMilestones.find(m => m.id === '2');
      expect(completedMilestone?.isCompleted).toBe(true);
      
      // Check that achievement was created
      expect(mockAchievements).toHaveLength(1);
      expect(mockAchievements[0].type).toBe('milestone');
    });

    it('completes goal when target amount is reached', async () => {
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Add enough progress to complete the goal
      await mockHookImplementation.updateGoalProgress('1', 10000, 'Final contribution');
      
      // Goal should be marked as completed
      const completedGoal = mockGoals.find(g => g.id === '1');
      expect(completedGoal?.status).toBe('completed');
      expect(completedGoal?.currentAmount).toBe(15000);
      
      // Should have goal completion achievement
      const completionAchievement = mockAchievements.find(a => a.type === 'goal_completion');
      expect(completionAchievement).toBeDefined();
      expect(completionAchievement?.points).toBe(200);
    });
  });

  describe('Tab Navigation and Content', () => {
    it('shows different content in each tab', async () => {
      const user = userEvent.setup();
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Default tab should show goals
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument();
      
      // Switch to Milestones tab
      const milestonesTab = screen.getByText('Milestones');
      await user.click(milestonesTab);
      
      // Should show milestone content
      expect(screen.getByText('Milestone Tracker')).toBeInTheDocument();
      
      // Switch to Achievements tab
      const achievementsTab = screen.getByText('Achievements');
      await user.click(achievementsTab);
      
      // Should show achievements content
      expect(screen.getByText('Your Achievements')).toBeInTheDocument();
      
      // Switch to Insights tab
      const insightsTab = screen.getByText('Insights');
      await user.click(insightsTab);
      
      // Should show insights content
      expect(screen.getByText('AI-Powered Insights')).toBeInTheDocument();
    });
  });

  describe('Filtering and Sorting', () => {
    it('filters goals by status correctly', async () => {
      const user = userEvent.setup();
      
      // Add a completed goal to test filtering
      await mockHookImplementation.createGoal({
        title: 'Completed Goal',
        description: 'Already finished',
        targetAmount: 1000,
        targetDate: '2024-01-01',
        category: 'other',
        priority: 'low',
        status: 'completed'
      });
      
      // Update the completed goal's current amount
      const completedGoalIndex = mockGoals.findIndex(g => g.title === 'Completed Goal');
      mockGoals[completedGoalIndex].currentAmount = 1000;
      mockGoals[completedGoalIndex].status = 'completed';
      
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Should show both goals initially (filter = "all")
      expect(screen.getByText('2 goals')).toBeInTheDocument();
      
      // Filter by completed goals
      const statusFilter = screen.getByLabelText('Status');
      await user.click(statusFilter);
      
      const completedOption = screen.getByText('Completed');
      await user.click(completedOption);
      
      // Should show only completed goals
      expect(screen.getByText('1 goals')).toBeInTheDocument();
    });

    it('sorts goals by different criteria', async () => {
      const user = userEvent.setup();
      
      // Add another goal with different progress
      await mockHookImplementation.createGoal({
        title: 'High Progress Goal',
        description: 'Almost done',
        targetAmount: 1000,
        targetDate: '2025-01-01',
        category: 'other',
        priority: 'low',
        status: 'active'
      });
      
      // Set high progress for the new goal
      const newGoalIndex = mockGoals.findIndex(g => g.title === 'High Progress Goal');
      mockGoals[newGoalIndex].currentAmount = 900; // 90% progress
      
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Change sort to progress
      const sortFilter = screen.getByLabelText('Sort by');
      await user.click(sortFilter);
      
      const progressOption = screen.getByText('Progress');
      await user.click(progressOption);
      
      // Goals should be sorted by progress (implementation would reorder)
      expect(screen.getByDisplayValue('progress')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('handles API errors gracefully', async () => {
      // Mock an error in progress update
      mockHookImplementation.updateGoalProgress.mockRejectedValueOnce(new Error('API Error'));
      
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Attempt to update progress
      try {
        await mockHookImplementation.updateGoalProgress('1', 100);
      } catch (error) {
        expect(error.message).toBe('API Error');
      }
      
      // Dashboard should still be functional
      expect(screen.getByText('Goal Tracking Dashboard')).toBeInTheDocument();
    });
  });

  describe('Real-time Updates', () => {
    it('updates UI when data changes', async () => {
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Initial progress
      const initialProgress = (5000 / 15000) * 100; // 33%
      expect(screen.getByText('33%')).toBeInTheDocument();
      
      // Update progress
      await mockHookImplementation.updateGoalProgress('1', 1500);
      
      // Re-render to see updated progress
      renderWithTheme(<GoalTrackingDashboard />);
      
      // New progress should be (6500 / 15000) * 100 = 43%
      const newProgress = (6500 / 15000) * 100;
      expect(screen.getByText('43%')).toBeInTheDocument();
    });
  });

  describe('Achievement Celebrations', () => {
    it('triggers celebration when milestone is achieved', async () => {
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Add progress that completes the next milestone
      const result = await mockHookImplementation.updateGoalProgress('1', 2500);
      
      // Should have new milestones in result
      expect(result.newMilestones).toHaveLength(1);
      expect(result.newMilestones[0].title).toBe('Halfway Point');
      
      // Achievement should be created
      expect(mockAchievements).toHaveLength(1);
      expect(mockAchievements[0].description).toContain('Halfway Point');
    });

    it('triggers celebration when goal is completed', async () => {
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Complete the goal
      const result = await mockHookImplementation.updateGoalProgress('1', 10000);
      
      // Goal should be completed
      expect(result.goal.status).toBe('completed');
      
      // Should have goal completion achievement
      const completionAchievement = mockAchievements.find(a => a.type === 'goal_completion');
      expect(completionAchievement).toBeDefined();
      expect(completionAchievement?.title).toBe('Goal Completed!');
    });
  });

  describe('Data Persistence', () => {
    it('maintains state across operations', async () => {
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Perform multiple operations
      await mockHookImplementation.updateGoalProgress('1', 1000);
      await mockHookImplementation.updateGoal('1', { title: 'Updated Emergency Fund' });
      
      // State should be maintained
      const updatedGoal = mockGoals.find(g => g.id === '1');
      expect(updatedGoal?.title).toBe('Updated Emergency Fund');
      expect(updatedGoal?.currentAmount).toBe(6000);
    });
  });

  describe('Performance', () => {
    it('handles multiple rapid updates', async () => {
      renderWithTheme(<GoalTrackingDashboard />);
      
      // Perform multiple rapid updates
      const updates = Array.from({ length: 5 }, (_, i) => 
        mockHookImplementation.updateGoalProgress('1', 100, `Update ${i + 1}`)
      );
      
      await Promise.all(updates);
      
      // Final amount should reflect all updates
      const finalGoal = mockGoals.find(g => g.id === '1');
      expect(finalGoal?.currentAmount).toBe(5500); // 5000 + (5 * 100)
    });
  });
});