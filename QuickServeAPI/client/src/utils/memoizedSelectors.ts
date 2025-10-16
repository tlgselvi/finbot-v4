/**
 * FinBot v4 - Memoized Selectors
 * Optimized selectors for state management
 */

import { useMemo } from 'react';
import { createMemoizedSelector } from './performanceUtils';

// Types for approval system state
interface ApprovalWorkflow {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  amount: number;
  currentLevel: number;
  totalLevels: number;
  createdAt: string;
}

interface ApprovalState {
  workflows: ApprovalWorkflow[];
  loading: boolean;
  error: string | null;
  filters: {
    status?: string;
    priority?: string;
    dateRange?: { start: string; end: string };
  };
}

/**
 * Selector for pending workflows
 */
export const selectPendingWorkflows = createMemoizedSelector(
  (state: ApprovalState) => state.workflows.filter(w => w.status === 'pending'),
  (a, b) => a.length === b.length && a.every((item, index) => item.id === b[index]?.id)
);

/**
 * Selector for high priority workflows
 */
export const selectHighPriorityWorkflows = createMemoizedSelector(
  (state: ApprovalState) => state.workflows.filter(w => 
    w.priority === 'high' || w.priority === 'critical'
  ),
  (a, b) => a.length === b.length && a.every((item, index) => item.id === b[index]?.id)
);

/**
 * Selector for workflows by status with memoization
 */
export const createWorkflowsByStatusSelector = (status: string) => 
  createMemoizedSelector(
    (state: ApprovalState) => state.workflows.filter(w => w.status === status),
    (a, b) => a.length === b.length && a.every((item, index) => item.id === b[index]?.id)
  );

/**
 * Selector for workflow statistics
 */
export const selectWorkflowStats = createMemoizedSelector(
  (state: ApprovalState) => {
    const workflows = state.workflows;
    return {
      total: workflows.length,
      pending: workflows.filter(w => w.status === 'pending').length,
      approved: workflows.filter(w => w.status === 'approved').length,
      rejected: workflows.filter(w => w.status === 'rejected').length,
      highRisk: workflows.filter(w => w.riskScore >= 75).length,
      avgProcessingTime: calculateAverageProcessingTime(workflows)
    };
  }
);

/**
 * Selector for filtered workflows
 */
export const selectFilteredWorkflows = createMemoizedSelector(
  (state: ApprovalState) => {
    let filtered = state.workflows;
    
    if (state.filters.status) {
      filtered = filtered.filter(w => w.status === state.filters.status);
    }
    
    if (state.filters.priority) {
      filtered = filtered.filter(w => w.priority === state.filters.priority);
    }
    
    if (state.filters.dateRange) {
      const { start, end } = state.filters.dateRange;
      filtered = filtered.filter(w => {
        const createdDate = new Date(w.createdAt);
        return createdDate >= new Date(start) && createdDate <= new Date(end);
      });
    }
    
    return filtered;
  }
);

/**
 * Hook for using memoized workflow selectors
 */
export const useWorkflowSelectors = (state: ApprovalState) => {
  const pendingWorkflows = useMemo(() => selectPendingWorkflows(state), [state]);
  const highPriorityWorkflows = useMemo(() => selectHighPriorityWorkflows(state), [state]);
  const workflowStats = useMemo(() => selectWorkflowStats(state), [state]);
  const filteredWorkflows = useMemo(() => selectFilteredWorkflows(state), [state]);

  return {
    pendingWorkflows,
    highPriorityWorkflows,
    workflowStats,
    filteredWorkflows
  };
};

/**
 * Memoized selector for sorting workflows
 */
export const createSortedWorkflowsSelector = (
  sortBy: keyof ApprovalWorkflow,
  sortOrder: 'asc' | 'desc' = 'desc'
) => createMemoizedSelector(
  (workflows: ApprovalWorkflow[]) => {
    return [...workflows].sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortOrder === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      return 0;
    });
  }
);

/**
 * Memoized selector for paginated workflows
 */
export const createPaginatedWorkflowsSelector = (
  page: number,
  pageSize: number
) => createMemoizedSelector(
  (workflows: ApprovalWorkflow[]) => {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    return {
      items: workflows.slice(startIndex, endIndex),
      totalItems: workflows.length,
      totalPages: Math.ceil(workflows.length / pageSize),
      currentPage: page,
      hasNextPage: endIndex < workflows.length,
      hasPreviousPage: page > 1
    };
  }
);

/**
 * Utility function to calculate average processing time
 */
const calculateAverageProcessingTime = (workflows: ApprovalWorkflow[]): number => {
  const completedWorkflows = workflows.filter(w => 
    w.status === 'approved' || w.status === 'rejected'
  );
  
  if (completedWorkflows.length === 0) return 0;
  
  // Mock calculation - in real app, you'd have completion timestamps
  return Math.round(Math.random() * 24); // Random hours for demo
};

/**
 * Memoized selector for workflow search results
 */
export const createWorkflowSearchSelector = (searchTerm: string) => 
  createMemoizedSelector(
    (workflows: ApprovalWorkflow[]) => {
      if (!searchTerm.trim()) return workflows;
      
      const term = searchTerm.toLowerCase();
      return workflows.filter(workflow => 
        workflow.id.toLowerCase().includes(term) ||
        workflow.status.toLowerCase().includes(term) ||
        workflow.priority.toLowerCase().includes(term)
      );
    }
  );

/**
 * Hook for complex workflow filtering and sorting
 */
export const useAdvancedWorkflowFiltering = (
  workflows: ApprovalWorkflow[],
  filters: {
    search?: string;
    status?: string;
    priority?: string;
    sortBy?: keyof ApprovalWorkflow;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }
) => {
  return useMemo(() => {
    let filtered = workflows;
    
    // Apply search filter
    if (filters.search) {
      const searchSelector = createWorkflowSearchSelector(filters.search);
      filtered = searchSelector(filtered);
    }
    
    // Apply status filter
    if (filters.status) {
      filtered = filtered.filter(w => w.status === filters.status);
    }
    
    // Apply priority filter
    if (filters.priority) {
      filtered = filtered.filter(w => w.priority === filters.priority);
    }
    
    // Apply sorting
    if (filters.sortBy) {
      const sortSelector = createSortedWorkflowsSelector(
        filters.sortBy,
        filters.sortOrder
      );
      filtered = sortSelector(filtered);
    }
    
    // Apply pagination
    if (filters.page && filters.pageSize) {
      const paginationSelector = createPaginatedWorkflowsSelector(
        filters.page,
        filters.pageSize
      );
      return paginationSelector(filtered);
    }
    
    return {
      items: filtered,
      totalItems: filtered.length,
      totalPages: 1,
      currentPage: 1,
      hasNextPage: false,
      hasPreviousPage: false
    };
  }, [workflows, filters]);
};