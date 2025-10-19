/**
 * Budget Optimization Hook
 * Custom hook for managing budget optimization state and operations
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { budgetOptimizationAPI } from '../services/api';

interface BudgetCategory {
  id: string;
  name: string;
  budgeted: number;
  spent: number;
  icon: string;
  color: string;
  priority: 'high' | 'medium' | 'low';
  isFixed: boolean;
  trend: 'up' | 'down' | 'stable';
  lastMonthSpent: number;
  averageSpent: number;
  tags: string[];
  monthlyData: Array<{
    month: string;
    budgeted: number;
    spent: number;
  }>;
}

interface BudgetData {
  categories: BudgetCategory[];
  totalBudgeted: number;
  totalSpent: number;
  monthlyTrend: Array<{
    month: string;
    budgeted: number;
    spent: number;
    variance: number;
  }>;
}

interface OptimizationSuggestion {
  id: string;
  type: 'reduce' | 'increase' | 'reallocate' | 'automate' | 'goal_based';
  title: string;
  description: string;
  category: string;
  impact: 'low' | 'medium' | 'high';
  difficulty: 'easy' | 'medium' | 'hard';
  potentialSavings: number;
  confidence: number;
  timeframe: string;
  reasoning: string[];
  steps: string[];
  risks: string[];
  benefits: string[];
  aiGenerated: boolean;
  priority: number;
  tags: string[];
}

interface BudgetScenario {
  id: string;
  name: string;
  description: string;
  modifications: Record<string, number>;
  projectedSavings: number;
  createdAt: string;
  isActive: boolean;
}

interface OptimizationSettings {
  aggressiveness: 'conservative' | 'moderate' | 'aggressive';
  prioritizeGoals: boolean;
  maintainLifestyle: boolean;
  autoApplyRecommendations: boolean;
  notificationPreferences: {
    overspendAlerts: boolean;
    optimizationSuggestions: boolean;
    goalProgress: boolean;
  };
}

export const useBudgetOptimization = () => {
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch budget data
  const {
    data: budgetData,
    isLoading: budgetLoading,
    error: budgetError
  } = useQuery({
    queryKey: ['budgetData'],
    queryFn: budgetOptimizationAPI.getBudgetData,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });

  // Fetch optimization suggestions
  const {
    data: optimizationSuggestions,
    isLoading: suggestionsLoading,
    error: suggestionsError
  } = useQuery({
    queryKey: ['optimizationSuggestions'],
    queryFn: budgetOptimizationAPI.getOptimizationSuggestions,
    staleTime: 10 * 60 * 1000, // 10 minutes
    enabled: !!budgetData, // Only fetch when budget data is available
  });

  // Fetch budget scenarios
  const {
    data: scenarios,
    isLoading: scenariosLoading,
    error: scenariosError
  } = useQuery({
    queryKey: ['budgetScenarios'],
    queryFn: budgetOptimizationAPI.getBudgetScenarios,
    staleTime: 15 * 60 * 1000, // 15 minutes
  });

  // Update budget category mutation
  const updateCategoryMutation = useMutation({
    mutationFn: ({ categoryId, updates }: { categoryId: string; updates: Partial<BudgetCategory> }) =>
      budgetOptimizationAPI.updateBudgetCategory(categoryId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgetData'] });
      queryClient.invalidateQueries({ queryKey: ['optimizationSuggestions'] });
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to update budget category');
    },
  });

  // Optimize budget mutation
  const optimizeBudgetMutation = useMutation({
    mutationFn: (settings: OptimizationSettings) =>
      budgetOptimizationAPI.optimizeBudget(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optimizationSuggestions'] });
      queryClient.invalidateQueries({ queryKey: ['budgetData'] });
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to optimize budget');
    },
  });

  // Apply optimization mutation
  const applyOptimizationMutation = useMutation({
    mutationFn: (optimizationId: string) =>
      budgetOptimizationAPI.applyOptimization(optimizationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgetData'] });
      queryClient.invalidateQueries({ queryKey: ['optimizationSuggestions'] });
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to apply optimization');
    },
  });

  // Create scenario mutation
  const createScenarioMutation = useMutation({
    mutationFn: ({ name, modifications }: { name: string; modifications: Record<string, number> }) =>
      budgetOptimizationAPI.createBudgetScenario(name, modifications),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgetScenarios'] });
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to create scenario');
    },
  });

  // Compare scenarios mutation
  const compareScenariosQuery = useQuery({
    queryKey: ['scenarioComparison'],
    queryFn: budgetOptimizationAPI.compareScenarios,
    enabled: false, // Only run when explicitly called
  });

  // Save budget mutation
  const saveBudgetMutation = useMutation({
    mutationFn: () => budgetOptimizationAPI.saveBudget(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgetData'] });
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to save budget');
    },
  });

  // Callback functions
  const updateBudgetCategory = useCallback(
    async (categoryId: string, updates: Partial<BudgetCategory>) => {
      try {
        setError(null);
        await updateCategoryMutation.mutateAsync({ categoryId, updates });
      } catch (error) {
        console.error('Error updating budget category:', error);
        throw error;
      }
    },
    [updateCategoryMutation]
  );

  const optimizeBudget = useCallback(
    async (settings: OptimizationSettings) => {
      try {
        setError(null);
        await optimizeBudgetMutation.mutateAsync(settings);
      } catch (error) {
        console.error('Error optimizing budget:', error);
        throw error;
      }
    },
    [optimizeBudgetMutation]
  );

  const applyOptimization = useCallback(
    async (optimizationId: string) => {
      try {
        setError(null);
        await applyOptimizationMutation.mutateAsync(optimizationId);
      } catch (error) {
        console.error('Error applying optimization:', error);
        throw error;
      }
    },
    [applyOptimizationMutation]
  );

  const createScenario = useCallback(
    async (name: string, modifications: Record<string, number>) => {
      try {
        setError(null);
        await createScenarioMutation.mutateAsync({ name, modifications });
      } catch (error) {
        console.error('Error creating scenario:', error);
        throw error;
      }
    },
    [createScenarioMutation]
  );

  const compareScenarios = useCallback(
    async () => {
      try {
        setError(null);
        return await compareScenariosQuery.refetch();
      } catch (error) {
        console.error('Error comparing scenarios:', error);
        throw error;
      }
    },
    [compareScenariosQuery]
  );

  const saveBudget = useCallback(
    async () => {
      try {
        setError(null);
        await saveBudgetMutation.mutateAsync();
      } catch (error) {
        console.error('Error saving budget:', error);
        throw error;
      }
    },
    [saveBudgetMutation]
  );

  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['budgetData'] });
    queryClient.invalidateQueries({ queryKey: ['optimizationSuggestions'] });
    queryClient.invalidateQueries({ queryKey: ['budgetScenarios'] });
  }, [queryClient]);

  // Calculate derived data
  const budgetSummary = useMemo(() => {
    if (!budgetData) return null;

    const totalBudgeted = budgetData.categories.reduce((sum, cat) => sum + cat.budgeted, 0);
    const totalSpent = budgetData.categories.reduce((sum, cat) => sum + cat.spent, 0);
    const utilization = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;
    const remaining = totalBudgeted - totalSpent;
    const variance = totalSpent - totalBudgeted;

    const overBudgetCategories = budgetData.categories.filter(cat => cat.spent > cat.budgeted);
    const underBudgetCategories = budgetData.categories.filter(cat => cat.spent < cat.budgeted * 0.8);
    const onTrackCategories = budgetData.categories.filter(cat => {
      const util = cat.budgeted > 0 ? (cat.spent / cat.budgeted) * 100 : 0;
      return util >= 80 && util <= 100;
    });

    return {
      totalBudgeted,
      totalSpent,
      utilization,
      remaining,
      variance,
      overBudgetCount: overBudgetCategories.length,
      underBudgetCount: underBudgetCategories.length,
      onTrackCount: onTrackCategories.length,
      overBudgetCategories,
      underBudgetCategories,
      onTrackCategories
    };
  }, [budgetData]);

  const optimizationSummary = useMemo(() => {
    if (!optimizationSuggestions) return null;

    const totalPotentialSavings = optimizationSuggestions.reduce(
      (sum, suggestion) => sum + suggestion.potentialSavings,
      0
    );

    const averageConfidence = optimizationSuggestions.length > 0
      ? optimizationSuggestions.reduce((sum, suggestion) => sum + suggestion.confidence, 0) / optimizationSuggestions.length
      : 0;

    const suggestionsByImpact = {
      high: optimizationSuggestions.filter(s => s.impact === 'high').length,
      medium: optimizationSuggestions.filter(s => s.impact === 'medium').length,
      low: optimizationSuggestions.filter(s => s.impact === 'low').length,
    };

    const suggestionsByType = optimizationSuggestions.reduce((acc, suggestion) => {
      acc[suggestion.type] = (acc[suggestion.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalPotentialSavings,
      averageConfidence,
      totalSuggestions: optimizationSuggestions.length,
      suggestionsByImpact,
      suggestionsByType,
      aiGeneratedCount: optimizationSuggestions.filter(s => s.aiGenerated).length
    };
  }, [optimizationSuggestions]);

  // Clear error when data changes
  useEffect(() => {
    if (budgetData || optimizationSuggestions || scenarios) {
      setError(null);
    }
  }, [budgetData, optimizationSuggestions, scenarios]);

  // Set error from queries
  useEffect(() => {
    const queryError = budgetError || suggestionsError || scenariosError;
    if (queryError) {
      setError(queryError.message || 'An error occurred while fetching data');
    }
  }, [budgetError, suggestionsError, scenariosError]);

  const isLoading = budgetLoading || suggestionsLoading || scenariosLoading ||
    updateCategoryMutation.isPending || optimizeBudgetMutation.isPending ||
    applyOptimizationMutation.isPending || createScenarioMutation.isPending ||
    saveBudgetMutation.isPending;

  return {
    // Data
    budgetData,
    optimizationSuggestions: optimizationSuggestions || [],
    scenarios: scenarios || [],
    budgetSummary,
    optimizationSummary,

    // State
    isLoading,
    error,

    // Actions
    updateBudgetCategory,
    optimizeBudget,
    applyOptimization,
    createScenario,
    compareScenarios,
    saveBudget,
    refreshData,

    // Mutation states
    isUpdatingCategory: updateCategoryMutation.isPending,
    isOptimizing: optimizeBudgetMutation.isPending,
    isApplyingOptimization: applyOptimizationMutation.isPending,
    isCreatingScenario: createScenarioMutation.isPending,
    isSaving: saveBudgetMutation.isPending,
  };
};