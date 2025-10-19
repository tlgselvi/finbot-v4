/**
 * Goal Tracking Hook
 * Custom hook for managing goal tracking state and operations
 */

import { useState, useCallback, useEffect } from 'react';

interface Goal {
  id: string;
  title: string;
  description: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  status: 'active' | 'completed' | 'paused';
  createdAt: string;
  updatedAt: string;
  milestones?: Milestone[];
}

interface Milestone {
  id: string;
  title: string;
  description: string;
  targetAmount: number;
  isCompleted: boolean;
  completedAt?: string;
  goalId: string;
  celebrationMessage?: string;
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  type: string;
  achievedAt: string;
  goalId?: string;
  points?: number;
}

interface Insight {
  id: string;
  type: 'success' | 'warning' | 'tip' | 'prediction';
  title: string;
  description: string;
  confidence: number;
  actionable: boolean;
  goalId?: string;
  createdAt: string;
}

interface ProgressUpdateResult {
  goal: Goal;
  newMilestones: Milestone[];
  progressPercentage: number;
}

export const useGoalTracking = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Simulate API calls - replace with actual API calls
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock data - replace with actual API responses
      const mockGoals: Goal[] = [
        {
          id: '1',
          title: 'Emergency Fund',
          description: 'Build a 6-month emergency fund for financial security',
          targetAmount: 15000,
          currentAmount: 8500,
          targetDate: '2024-12-31',
          category: 'emergency_fund',
          priority: 'high',
          status: 'active',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-10-15T00:00:00Z'
        },
        {
          id: '2',
          title: 'Vacation to Europe',
          description: 'Save for a 2-week European vacation',
          targetAmount: 5000,
          currentAmount: 2800,
          targetDate: '2025-06-01',
          category: 'vacation',
          priority: 'medium',
          status: 'active',
          createdAt: '2024-02-01T00:00:00Z',
          updatedAt: '2024-10-10T00:00:00Z'
        }
      ];

      const mockMilestones: Milestone[] = [
        {
          id: '1',
          title: 'First $5,000',
          description: 'Reach the first milestone of $5,000',
          targetAmount: 5000,
          isCompleted: true,
          completedAt: '2024-08-15T00:00:00Z',
          goalId: '1',
          celebrationMessage: 'Great start on your emergency fund!'
        },
        {
          id: '2',
          title: 'Halfway Point',
          description: 'Reach $7,500 - halfway to your goal',
          targetAmount: 7500,
          isCompleted: true,
          completedAt: '2024-09-20T00:00:00Z',
          goalId: '1',
          celebrationMessage: 'You\'re halfway there! Keep it up!'
        },
        {
          id: '3',
          title: 'Almost There',
          description: 'Reach $12,000 - almost at your goal',
          targetAmount: 12000,
          isCompleted: false,
          goalId: '1',
          celebrationMessage: 'So close to your emergency fund goal!'
        }
      ];

      const mockAchievements: Achievement[] = [
        {
          id: '1',
          title: 'First Milestone',
          description: 'Completed your first savings milestone',
          type: 'milestone',
          achievedAt: '2024-08-15T00:00:00Z',
          goalId: '1',
          points: 100
        },
        {
          id: '2',
          title: 'Consistent Saver',
          description: 'Made progress for 30 consecutive days',
          type: 'streak',
          achievedAt: '2024-09-01T00:00:00Z',
          points: 200
        }
      ];

      const mockInsights: Insight[] = [
        {
          id: '1',
          type: 'tip',
          title: 'Optimize Your Savings Rate',
          description: 'Consider increasing your monthly contribution by $200 to reach your emergency fund goal 2 months earlier.',
          confidence: 0.85,
          actionable: true,
          goalId: '1',
          createdAt: '2024-10-15T00:00:00Z'
        }
      ];

      setGoals(mockGoals);
      setMilestones(mockMilestones);
      setAchievements(mockAchievements);
      setInsights(mockInsights);
      
    } catch (err) {
      setError('Failed to load goal tracking data');
      console.error('Error loading goal tracking data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createGoal = useCallback(async (goalData: Omit<Goal, 'id' | 'currentAmount' | 'createdAt' | 'updatedAt'>) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const newGoal: Goal = {
        ...goalData,
        id: Date.now().toString(),
        currentAmount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      setGoals(prev => [...prev, newGoal]);

      // Generate milestones if provided
      if (goalData.milestones && goalData.milestones.length > 0) {
        const newMilestones = goalData.milestones.map((milestone, index) => ({
          ...milestone,
          id: `${newGoal.id}-milestone-${index}`,
          goalId: newGoal.id,
          isCompleted: false
        }));
        
        setMilestones(prev => [...prev, ...newMilestones]);
      }

      return newGoal;
    } catch (err) {
      setError('Failed to create goal');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateGoalProgress = useCallback(async (goalId: string, amount: number, note?: string): Promise<ProgressUpdateResult> => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      let updatedGoal: Goal | null = null;
      const newMilestones: Milestone[] = [];
      
      setGoals(prev => prev.map(goal => {
        if (goal.id === goalId) {
          const newAmount = goal.currentAmount + amount;
          updatedGoal = {
            ...goal,
            currentAmount: newAmount,
            updatedAt: new Date().toISOString(),
            status: newAmount >= goal.targetAmount ? 'completed' : goal.status
          };
          return updatedGoal;
        }
        return goal;
      }));

      if (!updatedGoal) {
        throw new Error('Goal not found');
      }

      // Check for milestone completions
      const goalMilestones = milestones.filter(m => m.goalId === goalId && !m.isCompleted);
      const completedMilestones = goalMilestones.filter(m => updatedGoal!.currentAmount >= m.targetAmount);
      
      if (completedMilestones.length > 0) {
        setMilestones(prev => prev.map(milestone => {
          if (completedMilestones.some(cm => cm.id === milestone.id)) {
            const completed = {
              ...milestone,
              isCompleted: true,
              completedAt: new Date().toISOString()
            };
            newMilestones.push(completed);
            return completed;
          }
          return milestone;
        }));

        // Add milestone achievements
        const milestoneAchievements = completedMilestones.map(milestone => ({
          id: `achievement-${Date.now()}-${milestone.id}`,
          title: 'Milestone Achieved!',
          description: `Completed milestone: ${milestone.title}`,
          type: 'milestone',
          achievedAt: new Date().toISOString(),
          goalId: goalId,
          points: 50
        }));

        setAchievements(prev => [...prev, ...milestoneAchievements]);
      }

      // Check for goal completion
      if (updatedGoal.status === 'completed') {
        const completionAchievement: Achievement = {
          id: `achievement-${Date.now()}-goal-${goalId}`,
          title: 'Goal Completed!',
          description: `Successfully completed goal: ${updatedGoal.title}`,
          type: 'goal_completion',
          achievedAt: new Date().toISOString(),
          goalId: goalId,
          points: 200
        };

        setAchievements(prev => [...prev, completionAchievement]);
      }

      const progressPercentage = (updatedGoal.currentAmount / updatedGoal.targetAmount) * 100;

      return {
        goal: updatedGoal,
        newMilestones,
        progressPercentage
      };
      
    } catch (err) {
      setError('Failed to update goal progress');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [milestones]);

  const updateGoal = useCallback(async (goalId: string, updates: Partial<Goal>) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setGoals(prev => prev.map(goal => 
        goal.id === goalId 
          ? { ...goal, ...updates, updatedAt: new Date().toISOString() }
          : goal
      ));
      
    } catch (err) {
      setError('Failed to update goal');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteGoal = useCallback(async (goalId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setGoals(prev => prev.filter(goal => goal.id !== goalId));
      setMilestones(prev => prev.filter(milestone => milestone.goalId !== goalId));
      setAchievements(prev => prev.filter(achievement => achievement.goalId !== goalId));
      
    } catch (err) {
      setError('Failed to delete goal');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    goals,
    milestones,
    achievements,
    insights,
    isLoading,
    error,
    createGoal,
    updateGoalProgress,
    updateGoal,
    deleteGoal,
    refreshData
  };
};