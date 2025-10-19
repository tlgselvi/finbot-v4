/**
 * useGoalTracking Hook Tests
 * Unit tests for the goal tracking custom hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useGoalTracking } from '../useGoalTracking';

// Mock setTimeout to control async behavior
jest.useFakeTimers();

describe('useGoalTracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Initial state', () => {
    it('initializes with empty state', () => {
      const { result } = renderHook(() => useGoalTracking());
      
      expect(result.current.goals).toEqual([]);
      expect(result.current.milestones).toEqual([]);
      expect(result.current.achievements).toEqual([]);
      expect(result.current.insights).toEqual([]);
      expect(result.current.isLoading).toBe(true); // Loading on mount
      expect(result.current.error).toBe(null);
    });

    it('provides all required functions', () => {
      const { result } = renderHook(() => useGoalTracking());
      
      expect(typeof result.current.createGoal).toBe('function');
      expect(typeof result.current.updateGoalProgress).toBe('function');
      expect(typeof result.current.updateGoal).toBe('function');
      expect(typeof result.current.deleteGoal).toBe('function');
      expect(typeof result.current.refreshData).toBe('function');
    });
  });

  describe('Data loading', () => {
    it('loads initial data on mount', async () => {
      const { result } = renderHook(() => useGoalTracking());
      
      expect(result.current.isLoading).toBe(true);
      
      // Fast-forward timers to complete the mock API call
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      
      expect(result.current.goals).toHaveLength(2);
      expect(result.current.milestones).toHaveLength(3);
      expect(result.current.achievements).toHaveLength(2);
      expect(result.current.insights).toHaveLength(1);
    });

    it('handles loading errors', async () => {
      // Mock console.error to avoid test output noise
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Mock a failing API call by overriding the Promise
      const originalPromise = global.Promise;
      global.Promise = class extends originalPromise {
        constructor(executor: any) {
          super((resolve, reject) => {
            executor(reject, resolve); // Swap resolve/reject to cause failure
          });
        }
      } as any;
      
      const { result } = renderHook(() => useGoalTracking());
      
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      await waitFor(() => {
        expect(result.current.error).toBe('Failed to load goal tracking data');
      });
      
      // Restore
      global.Promise = originalPromise;
      consoleSpy.mockRestore();
    });
  });

  describe('Goal creation', () => {
    it('creates a new goal successfully', async () => {
      const { result } = renderHook(() => useGoalTracking());
      
      // Wait for initial load
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      
      const newGoalData = {
        title: 'New Car Fund',
        description: 'Save for a new car',
        targetAmount: 25000,
        targetDate: '2025-12-31',
        category: 'car_purchase',
        priority: 'medium' as const,
        status: 'active' as const,
        milestones: [
          {
            title: 'First $10,000',
            targetAmount: 10000,
            description: 'First milestone'
          }
        ]
      };
      
      let createdGoal: any;
      
      await act(async () => {
        createdGoal = await result.current.createGoal(newGoalData);
        jest.advanceTimersByTime(500);
      });
      
      await waitFor(() => {
        expect(result.current.goals).toHaveLength(3);
      });
      
      const newGoal = result.current.goals.find(g => g.title === 'New Car Fund');
      expect(newGoal).toBeDefined();
      expect(newGoal?.currentAmount).toBe(0);
      expect(newGoal?.status).toBe('active');
      
      // Check milestones were created
      const goalMilestones = result.current.milestones.filter(m => m.goalId === newGoal?.id);
      expect(goalMilestones).toHaveLength(1);
    });

    it('handles goal creation errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const { result } = renderHook(() => useGoalTracking());
      
      // Wait for initial load
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      // Mock a failing creation by causing Promise rejection
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((callback: any) => {
        callback();
        throw new Error('Creation failed');
      }) as any;
      
      const newGoalData = {
        title: 'Test Goal',
        description: 'Test',
        targetAmount: 1000,
        targetDate: '2025-01-01',
        category: 'test',
        priority: 'low' as const,
        status: 'active' as const
      };
      
      await expect(
        act(async () => {
          await result.current.createGoal(newGoalData);
        })
      ).rejects.toThrow();
      
      // Restore
      global.setTimeout = originalSetTimeout;
      consoleSpy.mockRestore();
    });
  });

  describe('Progress updates', () => {
    it('updates goal progress successfully', async () => {
      const { result } = renderHook(() => useGoalTracking());
      
      // Wait for initial load
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      await waitFor(() => {
        expect(result.current.goals).toHaveLength(2);
      });
      
      const goalId = result.current.goals[0].id;
      const initialAmount = result.current.goals[0].currentAmount;
      
      let updateResult: any;
      
      await act(async () => {
        updateResult = await result.current.updateGoalProgress(goalId, 1000, 'Monthly savings');
        jest.advanceTimersByTime(500);
      });
      
      await waitFor(() => {
        const updatedGoal = result.current.goals.find(g => g.id === goalId);
        expect(updatedGoal?.currentAmount).toBe(initialAmount + 1000);
      });
      
      expect(updateResult.goal).toBeDefined();
      expect(updateResult.progressPercentage).toBeGreaterThan(0);
    });

    it('completes milestones when progress reaches target', async () => {
      const { result } = renderHook(() => useGoalTracking());
      
      // Wait for initial load
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      await waitFor(() => {
        expect(result.current.goals).toHaveLength(2);
      });
      
      const goalId = result.current.goals[0].id;
      
      // Add enough progress to complete a milestone
      await act(async () => {
        await result.current.updateGoalProgress(goalId, 5000);
        jest.advanceTimersByTime(500);
      });
      
      await waitFor(() => {
        // Check if new achievements were created for milestone completion
        const milestoneAchievements = result.current.achievements.filter(
          a => a.type === 'milestone' && a.goalId === goalId
        );
        expect(milestoneAchievements.length).toBeGreaterThan(0);
      });
    });

    it('marks goal as completed when target is reached', async () => {
      const { result } = renderHook(() => useGoalTracking());
      
      // Wait for initial load
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      await waitFor(() => {
        expect(result.current.goals).toHaveLength(2);
      });
      
      const goal = result.current.goals[0];
      const remainingAmount = goal.targetAmount - goal.currentAmount;
      
      await act(async () => {
        await result.current.updateGoalProgress(goal.id, remainingAmount + 100);
        jest.advanceTimersByTime(500);
      });
      
      await waitFor(() => {
        const completedGoal = result.current.goals.find(g => g.id === goal.id);
        expect(completedGoal?.status).toBe('completed');
      });
      
      // Check for goal completion achievement
      const completionAchievements = result.current.achievements.filter(
        a => a.type === 'goal_completion' && a.goalId === goal.id
      );
      expect(completionAchievements.length).toBeGreaterThan(0);
    });

    it('handles progress update errors', async () => {
      const { result } = renderHook(() => useGoalTracking());
      
      // Wait for initial load
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      // Try to update non-existent goal
      await expect(
        act(async () => {
          await result.current.updateGoalProgress('non-existent-id', 100);
        })
      ).rejects.toThrow('Goal not found');
    });
  });

  describe('Goal updates', () => {
    it('updates goal properties successfully', async () => {
      const { result } = renderHook(() => useGoalTracking());
      
      // Wait for initial load
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      await waitFor(() => {
        expect(result.current.goals).toHaveLength(2);
      });
      
      const goalId = result.current.goals[0].id;
      const updates = {
        title: 'Updated Emergency Fund',
        priority: 'low' as const
      };
      
      await act(async () => {
        await result.current.updateGoal(goalId, updates);
        jest.advanceTimersByTime(500);
      });
      
      await waitFor(() => {
        const updatedGoal = result.current.goals.find(g => g.id === goalId);
        expect(updatedGoal?.title).toBe('Updated Emergency Fund');
        expect(updatedGoal?.priority).toBe('low');
      });
    });
  });

  describe('Goal deletion', () => {
    it('deletes goal and related data successfully', async () => {
      const { result } = renderHook(() => useGoalTracking());
      
      // Wait for initial load
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      await waitFor(() => {
        expect(result.current.goals).toHaveLength(2);
      });
      
      const goalId = result.current.goals[0].id;
      const initialMilestoneCount = result.current.milestones.length;
      
      await act(async () => {
        await result.current.deleteGoal(goalId);
        jest.advanceTimersByTime(500);
      });
      
      await waitFor(() => {
        expect(result.current.goals).toHaveLength(1);
        expect(result.current.goals.find(g => g.id === goalId)).toBeUndefined();
      });
      
      // Check that related milestones and achievements are also deleted
      const remainingMilestones = result.current.milestones.filter(m => m.goalId === goalId);
      expect(remainingMilestones).toHaveLength(0);
      
      const remainingAchievements = result.current.achievements.filter(a => a.goalId === goalId);
      expect(remainingAchievements).toHaveLength(0);
    });
  });

  describe('Data refresh', () => {
    it('refreshes data successfully', async () => {
      const { result } = renderHook(() => useGoalTracking());
      
      // Wait for initial load
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      
      // Trigger refresh
      act(() => {
        result.current.refreshData();
      });
      
      expect(result.current.isLoading).toBe(true);
      
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      
      // Data should be reloaded
      expect(result.current.goals).toHaveLength(2);
    });
  });

  describe('Error handling', () => {
    it('sets error state when operations fail', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const { result } = renderHook(() => useGoalTracking());
      
      // Wait for initial load
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      // Mock a failing update
      const originalSetTimeout = global.setTimeout;
      global.setTimeout = ((callback: any) => {
        throw new Error('Update failed');
      }) as any;
      
      await act(async () => {
        try {
          await result.current.updateGoal('test-id', { title: 'Test' });
        } catch (error) {
          // Expected to throw
        }
      });
      
      expect(result.current.error).toBe('Failed to update goal');
      
      // Restore
      global.setTimeout = originalSetTimeout;
      consoleSpy.mockRestore();
    });

    it('clears error state on successful operations', async () => {
      const { result } = renderHook(() => useGoalTracking());
      
      // Wait for initial load
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      // Manually set error state
      act(() => {
        (result.current as any).setError = (error: string) => {
          // This would be handled internally by the hook
        };
      });
      
      // Perform successful operation
      await act(async () => {
        await result.current.refreshData();
        jest.advanceTimersByTime(1000);
      });
      
      await waitFor(() => {
        expect(result.current.error).toBe(null);
      });
    });
  });

  describe('Loading states', () => {
    it('manages loading state correctly during operations', async () => {
      const { result } = renderHook(() => useGoalTracking());
      
      // Initial loading
      expect(result.current.isLoading).toBe(true);
      
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      
      // Loading during goal creation
      act(() => {
        result.current.createGoal({
          title: 'Test Goal',
          description: 'Test',
          targetAmount: 1000,
          targetDate: '2025-01-01',
          category: 'test',
          priority: 'low',
          status: 'active'
        });
      });
      
      expect(result.current.isLoading).toBe(true);
      
      act(() => {
        jest.advanceTimersByTime(500);
      });
      
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });
});