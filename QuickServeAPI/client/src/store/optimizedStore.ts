/**
 * FinBot v4 - Optimized State Store
 * High-performance state management with normalization and selective updates
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { devtools } from 'zustand/middleware';

// Normalized state structure
interface NormalizedState<T> {
  byId: Record<string, T>;
  allIds: string[];
}

interface ApprovalWorkflow {
  id: string;
  transactionId: string;
  requesterId: string;
  currentLevel: number;
  totalLevels: number;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  riskScore: number;
  amount: number;
  currency: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
}

interface AppState {
  // Normalized entities
  workflows: NormalizedState<ApprovalWorkflow>;
  users: NormalizedState<User>;
  
  // UI state
  ui: {
    loading: {
      workflows: boolean;
      users: boolean;
      dashboard: boolean;
    };
    errors: {
      workflows: string | null;
      users: string | null;
      dashboard: string | null;
    };
    filters: {
      status: string | null;
      priority: string | null;
      dateRange: { start: string; end: string } | null;
      search: string;
    };
    pagination: {
      workflows: {
        page: number;
        pageSize: number;
        total: number;
      };
    };
    selectedItems: {
      workflowIds: string[];
      userIds: string[];
    };
  };
  
  // Computed/derived state cache
  cache: {
    filteredWorkflowIds: string[];
    sortedWorkflowIds: string[];
    dashboardStats: {
      totalPending: number;
      totalApproved: number;
      totalRejected: number;
      highRiskPending: number;
    } | null;
    lastUpdated: number;
  };
}

interface AppActions {
  // Workflow actions
  setWorkflows: (workflows: ApprovalWorkflow[]) => void;
  addWorkflow: (workflow: ApprovalWorkflow) => void;
  updateWorkflow: (id: string, updates: Partial<ApprovalWorkflow>) => void;
  removeWorkflow: (id: string) => void;
  
  // User actions
  setUsers: (users: User[]) => void;
  addUser: (user: User) => void;
  updateUser: (id: string, updates: Partial<User>) => void;
  
  // UI actions
  setLoading: (key: keyof AppState['ui']['loading'], loading: boolean) => void;
  setError: (key: keyof AppState['ui']['errors'], error: string | null) => void;
  setFilter: (key: keyof AppState['ui']['filters'], value: any) => void;
  clearFilters: () => void;
  setPagination: (updates: Partial<AppState['ui']['pagination']['workflows']>) => void;
  setSelectedWorkflows: (ids: string[]) => void;
  toggleWorkflowSelection: (id: string) => void;
  
  // Cache actions
  invalidateCache: () => void;
  updateCache: (updates: Partial<AppState['cache']>) => void;
  
  // Computed selectors
  getFilteredWorkflows: () => ApprovalWorkflow[];
  getSortedWorkflows: (sortBy: keyof ApprovalWorkflow, order: 'asc' | 'desc') => ApprovalWorkflow[];
  getDashboardStats: () => AppState['cache']['dashboardStats'];
  getWorkflowById: (id: string) => ApprovalWorkflow | undefined;
  getUserById: (id: string) => User | undefined;
}

// Helper functions for normalization
const normalizeArray = <T extends { id: string }>(items: T[]): NormalizedState<T> => ({
  byId: items.reduce((acc, item) => ({ ...acc, [item.id]: item }), {}),
  allIds: items.map(item => item.id)
});

const denormalizeArray = <T>(normalized: NormalizedState<T>): T[] =>
  normalized.allIds.map(id => normalized.byId[id]).filter(Boolean);

// Initial state
const initialState: AppState = {
  workflows: { byId: {}, allIds: [] },
  users: { byId: {}, allIds: [] },
  ui: {
    loading: {
      workflows: false,
      users: false,
      dashboard: false
    },
    errors: {
      workflows: null,
      users: null,
      dashboard: null
    },
    filters: {
      status: null,
      priority: null,
      dateRange: null,
      search: ''
    },
    pagination: {
      workflows: {
        page: 1,
        pageSize: 20,
        total: 0
      }
    },
    selectedItems: {
      workflowIds: [],
      userIds: []
    }
  },
  cache: {
    filteredWorkflowIds: [],
    sortedWorkflowIds: [],
    dashboardStats: null,
    lastUpdated: 0
  }
};

// Create optimized store with middleware
export const useAppStore = create<AppState & AppActions>()(
  devtools(
    subscribeWithSelector(
      immer((set, get) => ({
        ...initialState,
        
        // Workflow actions
        setWorkflows: (workflows) => set((state) => {
          state.workflows = normalizeArray(workflows);
          state.ui.pagination.workflows.total = workflows.length;
          state.cache.lastUpdated = Date.now();
          // Invalidate cache
          state.cache.filteredWorkflowIds = [];
          state.cache.sortedWorkflowIds = [];
          state.cache.dashboardStats = null;
        }),
        
        addWorkflow: (workflow) => set((state) => {
          state.workflows.byId[workflow.id] = workflow;
          state.workflows.allIds.push(workflow.id);
          state.ui.pagination.workflows.total += 1;
          state.cache.lastUpdated = Date.now();
          // Invalidate cache
          state.cache.filteredWorkflowIds = [];
          state.cache.sortedWorkflowIds = [];
          state.cache.dashboardStats = null;
        }),
        
        updateWorkflow: (id, updates) => set((state) => {
          if (state.workflows.byId[id]) {
            Object.assign(state.workflows.byId[id], updates);
            state.cache.lastUpdated = Date.now();
            // Invalidate cache
            state.cache.filteredWorkflowIds = [];
            state.cache.sortedWorkflowIds = [];
            state.cache.dashboardStats = null;
          }
        }),
        
        removeWorkflow: (id) => set((state) => {
          delete state.workflows.byId[id];
          state.workflows.allIds = state.workflows.allIds.filter(wId => wId !== id);
          state.ui.pagination.workflows.total -= 1;
          state.ui.selectedItems.workflowIds = state.ui.selectedItems.workflowIds.filter(wId => wId !== id);
          state.cache.lastUpdated = Date.now();
          // Invalidate cache
          state.cache.filteredWorkflowIds = [];
          state.cache.sortedWorkflowIds = [];
          state.cache.dashboardStats = null;
        }),
        
        // User actions
        setUsers: (users) => set((state) => {
          state.users = normalizeArray(users);
        }),
        
        addUser: (user) => set((state) => {
          state.users.byId[user.id] = user;
          state.users.allIds.push(user.id);
        }),
        
        updateUser: (id, updates) => set((state) => {
          if (state.users.byId[id]) {
            Object.assign(state.users.byId[id], updates);
          }
        }),
        
        // UI actions
        setLoading: (key, loading) => set((state) => {
          state.ui.loading[key] = loading;
        }),
        
        setError: (key, error) => set((state) => {
          state.ui.errors[key] = error;
        }),
        
        setFilter: (key, value) => set((state) => {
          (state.ui.filters as any)[key] = value;
          // Invalidate filtered cache
          state.cache.filteredWorkflowIds = [];
        }),
        
        clearFilters: () => set((state) => {
          state.ui.filters = {
            status: null,
            priority: null,
            dateRange: null,
            search: ''
          };
          state.cache.filteredWorkflowIds = [];
        }),
        
        setPagination: (updates) => set((state) => {
          Object.assign(state.ui.pagination.workflows, updates);
        }),
        
        setSelectedWorkflows: (ids) => set((state) => {
          state.ui.selectedItems.workflowIds = ids;
        }),
        
        toggleWorkflowSelection: (id) => set((state) => {
          const selected = state.ui.selectedItems.workflowIds;
          if (selected.includes(id)) {
            state.ui.selectedItems.workflowIds = selected.filter(wId => wId !== id);
          } else {
            state.ui.selectedItems.workflowIds.push(id);
          }
        }),
        
        // Cache actions
        invalidateCache: () => set((state) => {
          state.cache.filteredWorkflowIds = [];
          state.cache.sortedWorkflowIds = [];
          state.cache.dashboardStats = null;
        }),
        
        updateCache: (updates) => set((state) => {
          Object.assign(state.cache, updates);
        }),
        
        // Computed selectors
        getFilteredWorkflows: () => {
          const state = get();
          
          // Return cached result if available
          if (state.cache.filteredWorkflowIds.length > 0) {
            return state.cache.filteredWorkflowIds.map(id => state.workflows.byId[id]).filter(Boolean);
          }
          
          let workflows = denormalizeArray(state.workflows);
          const filters = state.ui.filters;
          
          // Apply filters
          if (filters.status) {
            workflows = workflows.filter(w => w.status === filters.status);
          }
          
          if (filters.priority) {
            workflows = workflows.filter(w => w.priority === filters.priority);
          }
          
          if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            workflows = workflows.filter(w => 
              w.id.toLowerCase().includes(searchTerm) ||
              w.transactionId.toLowerCase().includes(searchTerm) ||
              w.type.toLowerCase().includes(searchTerm)
            );
          }
          
          if (filters.dateRange) {
            const { start, end } = filters.dateRange;
            workflows = workflows.filter(w => {
              const createdDate = new Date(w.createdAt);
              return createdDate >= new Date(start) && createdDate <= new Date(end);
            });
          }
          
          // Cache the result
          set((state) => {
            state.cache.filteredWorkflowIds = workflows.map(w => w.id);
          });
          
          return workflows;
        },
        
        getSortedWorkflows: (sortBy, order = 'desc') => {
          const state = get();
          const workflows = state.getFilteredWorkflows();
          
          return [...workflows].sort((a, b) => {
            const aValue = a[sortBy];
            const bValue = b[sortBy];
            
            if (typeof aValue === 'string' && typeof bValue === 'string') {
              return order === 'asc' 
                ? aValue.localeCompare(bValue)
                : bValue.localeCompare(aValue);
            }
            
            if (typeof aValue === 'number' && typeof bValue === 'number') {
              return order === 'asc' ? aValue - bValue : bValue - aValue;
            }
            
            return 0;
          });
        },
        
        getDashboardStats: () => {
          const state = get();
          
          // Return cached result if available
          if (state.cache.dashboardStats) {
            return state.cache.dashboardStats;
          }
          
          const workflows = denormalizeArray(state.workflows);
          const stats = {
            totalPending: workflows.filter(w => w.status === 'pending').length,
            totalApproved: workflows.filter(w => w.status === 'approved').length,
            totalRejected: workflows.filter(w => w.status === 'rejected').length,
            highRiskPending: workflows.filter(w => w.status === 'pending' && w.riskScore >= 75).length
          };
          
          // Cache the result
          set((state) => {
            state.cache.dashboardStats = stats;
          });
          
          return stats;
        },
        
        getWorkflowById: (id) => {
          const state = get();
          return state.workflows.byId[id];
        },
        
        getUserById: (id) => {
          const state = get();
          return state.users.byId[id];
        }
      }))
    ),
    { name: 'app-store' }
  )
);

// Selective subscriptions for performance
export const useWorkflowsLoading = () => useAppStore(state => state.ui.loading.workflows);
export const useWorkflowsError = () => useAppStore(state => state.ui.errors.workflows);
export const useWorkflowFilters = () => useAppStore(state => state.ui.filters);
export const useSelectedWorkflows = () => useAppStore(state => state.ui.selectedItems.workflowIds);
export const usePagination = () => useAppStore(state => state.ui.pagination.workflows);

// Computed selectors with memoization
export const useFilteredWorkflows = () => useAppStore(state => state.getFilteredWorkflows());
export const useDashboardStats = () => useAppStore(state => state.getDashboardStats());

// Actions
export const useWorkflowActions = () => useAppStore(state => ({
  setWorkflows: state.setWorkflows,
  addWorkflow: state.addWorkflow,
  updateWorkflow: state.updateWorkflow,
  removeWorkflow: state.removeWorkflow,
  setLoading: state.setLoading,
  setError: state.setError
}));

export const useFilterActions = () => useAppStore(state => ({
  setFilter: state.setFilter,
  clearFilters: state.clearFilters
}));

export const useSelectionActions = () => useAppStore(state => ({
  setSelectedWorkflows: state.setSelectedWorkflows,
  toggleWorkflowSelection: state.toggleWorkflowSelection
}));