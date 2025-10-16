/**
 * FinBot v4 - Optimized State Hooks
 * Custom hooks for efficient state management
 */

import { useCallback, useMemo, useRef, useEffect } from 'react';
import { useAppStore } from '../store/optimizedStore';

/**
 * Hook for optimized workflow data fetching with caching
 */
export const useWorkflowData = (workflowId?: string) => {
  const workflow = useAppStore(state => 
    workflowId ? state.getWorkflowById(workflowId) : null
  );
  const loading = useAppStore(state => state.ui.loading.workflows);
  const error = useAppStore(state => state.ui.errors.workflows);
  const actions = useAppStore(state => ({
    setLoading: state.setLoading,
    setError: state.setError,
    updateWorkflow: state.updateWorkflow
  }));

  const fetchWorkflow = useCallback(async (id: string) => {
    if (!id) return;
    
    actions.setLoading('workflows', true);
    actions.setError('workflows', null);
    
    try {
      const response = await fetch(`/api/approval-workflows/${id}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        actions.updateWorkflow(id, data.data.workflow);
      } else {
        actions.setError('workflows', 'Failed to fetch workflow');
      }
    } catch (err) {
      actions.setError('workflows', 'Network error');
    } finally {
      actions.setLoading('workflows', false);
    }
  }, [actions]);

  return {
    workflow,
    loading,
    error,
    fetchWorkflow,
    refetch: workflowId ? () => fetchWorkflow(workflowId) : undefined
  };
};

/**
 * Hook for optimized dashboard data with selective updates
 */
export const useDashboardData = () => {
  const stats = useAppStore(state => state.getDashboardStats());
  const filteredWorkflows = useAppStore(state => state.getFilteredWorkflows());
  const loading = useAppStore(state => state.ui.loading.dashboard);
  const error = useAppStore(state => state.ui.errors.dashboard);
  const actions = useAppStore(state => ({
    setWorkflows: state.setWorkflows,
    setLoading: state.setLoading,
    setError: state.setError
  }));

  const loadDashboardData = useCallback(async () => {
    actions.setLoading('dashboard', true);
    actions.setError('dashboard', null);
    
    try {
      const [statsResponse, workflowsResponse] = await Promise.all([
        fetch('/api/approval-workflows/dashboard/summary', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch('/api/approval-workflows?limit=50', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        })
      ]);

      if (statsResponse.ok && workflowsResponse.ok) {
        const workflowsData = await workflowsResponse.json();
        const workflows = workflowsData.data.map((item: any) => ({
          ...item.workflow,
          priority: getPriorityFromRisk(item.riskAssessment?.riskScore || 0),
          amount: Math.random() * 100000,
          currency: 'TRY',
          type: item.rule?.transactionType || 'transfer'
        }));
        
        actions.setWorkflows(workflows);
      } else {
        actions.setError('dashboard', 'Failed to load dashboard data');
      }
    } catch (err) {
      actions.setError('dashboard', 'Network error');
    } finally {
      actions.setLoading('dashboard', false);
    }
  }, [actions]);

  const getPriorityFromRisk = useCallback((riskScore: number) => {
    if (riskScore >= 75) return 'critical';
    if (riskScore >= 50) return 'high';
    if (riskScore >= 25) return 'medium';
    return 'low';
  }, []);

  return {
    stats,
    workflows: filteredWorkflows,
    loading,
    error,
    loadDashboardData,
    refetch: loadDashboardData
  };
};

/**
 * Hook for optimized filtering with debounced search
 */
export const useOptimizedFiltering = () => {
  const filters = useAppStore(state => state.ui.filters);
  const actions = useAppStore(state => ({
    setFilter: state.setFilter,
    clearFilters: state.clearFilters
  }));
  
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  const setSearchFilter = useCallback((search: string) => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // Debounce search updates
    searchTimeoutRef.current = setTimeout(() => {
      actions.setFilter('search', search);
    }, 300);
  }, [actions]);

  const setStatusFilter = useCallback((status: string | null) => {
    actions.setFilter('status', status);
  }, [actions]);

  const setPriorityFilter = useCallback((priority: string | null) => {
    actions.setFilter('priority', priority);
  }, [actions]);

  const setDateRangeFilter = useCallback((dateRange: { start: string; end: string } | null) => {
    actions.setFilter('dateRange', dateRange);
  }, [actions]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return {
    filters,
    setSearchFilter,
    setStatusFilter,
    setPriorityFilter,
    setDateRangeFilter,
    clearFilters: actions.clearFilters
  };
};

/**
 * Hook for optimized selection management
 */
export const useOptimizedSelection = () => {
  const selectedIds = useAppStore(state => state.ui.selectedItems.workflowIds);
  const workflows = useAppStore(state => state.getFilteredWorkflows());
  const actions = useAppStore(state => ({
    setSelectedWorkflows: state.setSelectedWorkflows,
    toggleWorkflowSelection: state.toggleWorkflowSelection
  }));

  const selectedWorkflows = useMemo(() => 
    workflows.filter(w => selectedIds.includes(w.id)),
    [workflows, selectedIds]
  );

  const selectAll = useCallback(() => {
    const allIds = workflows.map(w => w.id);
    actions.setSelectedWorkflows(allIds);
  }, [workflows, actions]);

  const selectNone = useCallback(() => {
    actions.setSelectedWorkflows([]);
  }, [actions]);

  const isAllSelected = useMemo(() => 
    workflows.length > 0 && selectedIds.length === workflows.length,
    [workflows.length, selectedIds.length]
  );

  const isPartiallySelected = useMemo(() => 
    selectedIds.length > 0 && selectedIds.length < workflows.length,
    [selectedIds.length, workflows.length]
  );

  return {
    selectedIds,
    selectedWorkflows,
    isAllSelected,
    isPartiallySelected,
    selectAll,
    selectNone,
    toggleSelection: actions.toggleWorkflowSelection,
    setSelected: actions.setSelectedWorkflows
  };
};

/**
 * Hook for optimized pagination
 */
export const useOptimizedPagination = () => {
  const pagination = useAppStore(state => state.ui.pagination.workflows);
  const totalWorkflows = useAppStore(state => state.workflows.allIds.length);
  const filteredWorkflows = useAppStore(state => state.getFilteredWorkflows());
  const setPagination = useAppStore(state => state.setPagination);

  const paginatedWorkflows = useMemo(() => {
    const startIndex = (pagination.page - 1) * pagination.pageSize;
    const endIndex = startIndex + pagination.pageSize;
    return filteredWorkflows.slice(startIndex, endIndex);
  }, [filteredWorkflows, pagination.page, pagination.pageSize]);

  const totalPages = useMemo(() => 
    Math.ceil(filteredWorkflows.length / pagination.pageSize),
    [filteredWorkflows.length, pagination.pageSize]
  );

  const goToPage = useCallback((page: number) => {
    setPagination({ page: Math.max(1, Math.min(page, totalPages)) });
  }, [setPagination, totalPages]);

  const nextPage = useCallback(() => {
    if (pagination.page < totalPages) {
      setPagination({ page: pagination.page + 1 });
    }
  }, [pagination.page, totalPages, setPagination]);

  const previousPage = useCallback(() => {
    if (pagination.page > 1) {
      setPagination({ page: pagination.page - 1 });
    }
  }, [pagination.page, setPagination]);

  const setPageSize = useCallback((pageSize: number) => {
    setPagination({ pageSize, page: 1 });
  }, [setPagination]);

  return {
    currentPage: pagination.page,
    pageSize: pagination.pageSize,
    totalPages,
    totalItems: filteredWorkflows.length,
    paginatedWorkflows,
    hasNextPage: pagination.page < totalPages,
    hasPreviousPage: pagination.page > 1,
    goToPage,
    nextPage,
    previousPage,
    setPageSize
  };
};

/**
 * Hook for batch operations with optimistic updates
 */
export const useBatchOperations = () => {
  const selectedIds = useAppStore(state => state.ui.selectedItems.workflowIds);
  const actions = useAppStore(state => ({
    updateWorkflow: state.updateWorkflow,
    removeWorkflow: state.removeWorkflow,
    setSelectedWorkflows: state.setSelectedWorkflows,
    setLoading: state.setLoading,
    setError: state.setError
  }));

  const batchApprove = useCallback(async (ids: string[] = selectedIds) => {
    if (ids.length === 0) return;

    actions.setLoading('workflows', true);
    
    // Optimistic update
    ids.forEach(id => {
      actions.updateWorkflow(id, { status: 'approved' as const });
    });

    try {
      const response = await fetch('/api/approval-workflows/batch-approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ workflowIds: ids })
      });

      if (!response.ok) {
        // Revert optimistic update
        ids.forEach(id => {
          actions.updateWorkflow(id, { status: 'pending' as const });
        });
        actions.setError('workflows', 'Batch approval failed');
      } else {
        actions.setSelectedWorkflows([]);
      }
    } catch (err) {
      // Revert optimistic update
      ids.forEach(id => {
        actions.updateWorkflow(id, { status: 'pending' as const });
      });
      actions.setError('workflows', 'Network error');
    } finally {
      actions.setLoading('workflows', false);
    }
  }, [selectedIds, actions]);

  const batchReject = useCallback(async (ids: string[] = selectedIds) => {
    if (ids.length === 0) return;

    actions.setLoading('workflows', true);
    
    // Optimistic update
    ids.forEach(id => {
      actions.updateWorkflow(id, { status: 'rejected' as const });
    });

    try {
      const response = await fetch('/api/approval-workflows/batch-reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ workflowIds: ids })
      });

      if (!response.ok) {
        // Revert optimistic update
        ids.forEach(id => {
          actions.updateWorkflow(id, { status: 'pending' as const });
        });
        actions.setError('workflows', 'Batch rejection failed');
      } else {
        actions.setSelectedWorkflows([]);
      }
    } catch (err) {
      // Revert optimistic update
      ids.forEach(id => {
        actions.updateWorkflow(id, { status: 'pending' as const });
      });
      actions.setError('workflows', 'Network error');
    } finally {
      actions.setLoading('workflows', false);
    }
  }, [selectedIds, actions]);

  const batchDelete = useCallback(async (ids: string[] = selectedIds) => {
    if (ids.length === 0) return;

    actions.setLoading('workflows', true);
    
    try {
      const response = await fetch('/api/approval-workflows/batch-delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ workflowIds: ids })
      });

      if (response.ok) {
        ids.forEach(id => {
          actions.removeWorkflow(id);
        });
        actions.setSelectedWorkflows([]);
      } else {
        actions.setError('workflows', 'Batch deletion failed');
      }
    } catch (err) {
      actions.setError('workflows', 'Network error');
    } finally {
      actions.setLoading('workflows', false);
    }
  }, [selectedIds, actions]);

  return {
    selectedCount: selectedIds.length,
    batchApprove,
    batchReject,
    batchDelete
  };
};