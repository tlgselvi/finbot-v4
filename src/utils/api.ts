/**
 * API Utility Functions
 * Centralized API configuration and helper functions
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
const ML_API_BASE_URL = process.env.NEXT_PUBLIC_ML_API_URL || 'http://localhost:8080';

export class ApiClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${url}`, error);
      throw error;
    }
  }

  // GET request
  async get<T>(endpoint: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  // POST request
  async post<T>(
    endpoint: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      headers,
    });
  }

  // PUT request
  async put<T>(
    endpoint: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      headers,
    });
  }

  // DELETE request
  async delete<T>(endpoint: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', headers });
  }

  // Set authorization token
  setAuthToken(token: string) {
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  // Remove authorization token
  removeAuthToken() {
    delete this.defaultHeaders['Authorization'];
  }
}

// Default API client instance
export const apiClient = new ApiClient();

// ML API client instance
export const mlApiClient = new ApiClient(ML_API_BASE_URL);

// API endpoints
export const API_ENDPOINTS = {
  // Health check
  HEALTH: '/health',
  
  // Dashboard
  DASHBOARD: '/api/dashboard',
  INSIGHTS: '/api/insights',
  
  // Authentication
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh',
    PROFILE: '/api/auth/profile',
  },
  
  // Goals
  GOALS: {
    LIST: '/api/goals',
    CREATE: '/api/goals',
    GET: (id: string) => `/api/goals/${id}`,
    UPDATE: (id: string) => `/api/goals/${id}`,
    DELETE: (id: string) => `/api/goals/${id}`,
    PROGRESS: (id: string) => `/api/goals/${id}/progress`,
    MILESTONES: (id: string) => `/api/goals/${id}/milestones`,
    STRATEGY: (id: string) => `/api/goals/${id}/strategy`,
    ANALYTICS: '/api/goals/analytics/overview',
    RECOMMENDATIONS: '/api/goals/recommendations',
    ACHIEVEMENTS: '/api/goals/achievements',
  },
  
  // Transactions
  TRANSACTIONS: {
    LIST: '/api/transactions',
    CREATE: '/api/transactions',
    GET: (id: string) => `/api/transactions/${id}`,
    UPDATE: (id: string) => `/api/transactions/${id}`,
    DELETE: (id: string) => `/api/transactions/${id}`,
    CATEGORIZE: '/api/transactions/categorize',
    IMPORT: '/api/transactions/import',
    EXPORT: '/api/transactions/export',
  },
  
  // Budget
  BUDGET: {
    LIST: '/api/budget',
    CREATE: '/api/budget',
    GET: (id: string) => `/api/budget/${id}`,
    UPDATE: (id: string) => `/api/budget/${id}`,
    DELETE: (id: string) => `/api/budget/${id}`,
    TRACKING: '/api/budget/tracking',
    ALERTS: '/api/budget/alerts',
  },
  
  // Notifications
  NOTIFICATIONS: {
    LIST: '/api/notifications',
    MARK_READ: (id: string) => `/api/notifications/${id}/read`,
    PREFERENCES: '/api/notifications/preferences',
  },
};

// ML API endpoints
export const ML_API_ENDPOINTS = {
  HEALTH: '/health',
  ANOMALY_DETECTION: '/api/v1/anomaly/detect',
  RISK_ASSESSMENT: '/api/v1/risk/assess',
  INSIGHTS: '/api/v1/insights/generate',
  BUDGET_OPTIMIZATION: '/api/v1/budget/optimize',
};

// Helper functions for common API operations
export const apiHelpers = {
  // Dashboard data
  async getDashboardData() {
    return apiClient.get(API_ENDPOINTS.DASHBOARD);
  },

  // Insights
  async getInsights() {
    return apiClient.get(API_ENDPOINTS.INSIGHTS);
  },

  // Health checks
  async checkBackendHealth() {
    return apiClient.get(API_ENDPOINTS.HEALTH);
  },

  async checkMLServiceHealth() {
    return mlApiClient.get(ML_API_ENDPOINTS.HEALTH);
  },

  // ML Services
  async detectAnomaly(data: any) {
    return mlApiClient.post(ML_API_ENDPOINTS.ANOMALY_DETECTION, data);
  },

  async assessRisk(data: any) {
    return mlApiClient.post(ML_API_ENDPOINTS.RISK_ASSESSMENT, data);
  },

  async generateInsights(data: any) {
    return mlApiClient.post(ML_API_ENDPOINTS.INSIGHTS, data);
  },

  async optimizeBudget(data: any) {
    return mlApiClient.post(ML_API_ENDPOINTS.BUDGET_OPTIMIZATION, data);
  },
};

export default apiClient;