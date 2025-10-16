/**
 * FinBot v4 - Batch API Client
 * Client-side request batching for performance optimization
 */

import { BatchClient } from '../../server/middleware/request-batching';

// Create singleton batch client instance
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export const batchClient = new BatchClient(API_BASE_URL);

/**
 * Enhanced API client with automatic batching
 */
export class OptimizedAPIClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;
  private batchEnabled: boolean;

  constructor(baseUrl: string = API_BASE_URL, options: {
    defaultHeaders?: Record<string, string>;
    batchEnabled?: boolean;
  } = {}) {
    this.baseUrl = baseUrl;
    this.defaultHeaders = options.defaultHeaders || {};
    this.batchEnabled = options.batchEnabled ?? true;
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string) {
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Remove authentication token
   */
  clearAuthToken() {
    delete this.defaultHeaders['Authorization'];
  }

  /**
   * Make GET request (with optional batching)
   */
  async get<T = any>(url: string, options: {
    headers?: Record<string, string>;
    batch?: boolean;
    cache?: boolean;
  } = {}): Promise<T> {
    const { headers = {}, batch = this.batchEnabled, cache = false } = options;
    
    const requestHeaders = { ...this.defaultHeaders, ...headers };
    
    if (batch && this.isBatchableRequest('GET', url)) {
      return batchClient.get(url, requestHeaders);
    }

    // Add cache headers if requested
    if (cache) {
      requestHeaders['Cache-Control'] = 'max-age=300'; // 5 minutes
    }

    const response = await fetch(`${this.baseUrl}${url}`, {
      method: 'GET',
      headers: requestHeaders
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Make POST request
   */
  async post<T = any>(url: string, data?: any, options: {
    headers?: Record<string, string>;
    batch?: boolean;
  } = {}): Promise<T> {
    const { headers = {}, batch = this.batchEnabled } = options;
    
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...headers
    };

    if (batch && this.isBatchableRequest('POST', url)) {
      return batchClient.post(url, data, requestHeaders);
    }

    const response = await fetch(`${this.baseUrl}${url}`, {
      method: 'POST',
      headers: requestHeaders,
      body: data ? JSON.stringify(data) : undefined
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Make PUT request
   */
  async put<T = any>(url: string, data?: any, options: {
    headers?: Record<string, string>;
    batch?: boolean;
  } = {}): Promise<T> {
    const { headers = {}, batch = this.batchEnabled } = options;
    
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...headers
    };

    if (batch && this.isBatchableRequest('PUT', url)) {
      return batchClient.put(url, data, requestHeaders);
    }

    const response = await fetch(`${this.baseUrl}${url}`, {
      method: 'PUT',
      headers: requestHeaders,
      body: data ? JSON.stringify(data) : undefined
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Make DELETE request
   */
  async delete<T = any>(url: string, options: {
    headers?: Record<string, string>;
    batch?: boolean;
  } = {}): Promise<T> {
    const { headers = {}, batch = this.batchEnabled } = options;
    
    const requestHeaders = { ...this.defaultHeaders, ...headers };

    if (batch && this.isBatchableRequest('DELETE', url)) {
      return batchClient.delete(url, requestHeaders);
    }

    const response = await fetch(`${this.baseUrl}${url}`, {
      method: 'DELETE',
      headers: requestHeaders
    });

    return this.handleResponse<T>(response);
  }

  /**
   * Batch multiple requests
   */
  async batch(requests: Array<{
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    url: string;
    data?: any;
    headers?: Record<string, string>;
  }>): Promise<any[]> {
    const batchRequests = requests.map(req => ({
      id: Math.random().toString(36).substr(2, 9),
      method: req.method,
      url: req.url,
      headers: { ...this.defaultHeaders, ...req.headers },
      body: req.data
    }));

    const response = await fetch(`${this.baseUrl}/api/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.defaultHeaders
      },
      body: JSON.stringify({ requests: batchRequests })
    });

    const result = await this.handleResponse(response);
    return result.responses.map((r: any) => r.body);
  }

  /**
   * Handle response and errors
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: 'Network error',
        status: response.status
      }));
      
      throw new APIError(error.error || 'Request failed', response.status, error);
    }

    const contentType = response.headers.get('Content-Type');
    
    if (contentType?.includes('application/json')) {
      return response.json();
    }
    
    return response.text() as any;
  }

  /**
   * Check if request can be batched
   */
  private isBatchableRequest(method: string, url: string): boolean {
    // Only batch GET requests for now
    if (method !== 'GET') return false;
    
    // Check if URL is batchable
    const batchableRoutes = [
      '/api/approval-workflows',
      '/api/users',
      '/api/audit-logs'
    ];
    
    return batchableRoutes.some(route => url.startsWith(route));
  }
}

/**
 * Custom API Error class
 */
export class APIError extends Error {
  public status: number;
  public data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Default API client instance
 */
export const apiClient = new OptimizedAPIClient();

/**
 * Approval workflows API methods
 */
export const approvalAPI = {
  // Get workflows with caching
  getWorkflows: (params?: Record<string, any>) => {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiClient.get(`/api/approval-workflows${queryString}`, { cache: true });
  },

  // Get workflow by ID
  getWorkflow: (id: string) => {
    return apiClient.get(`/api/approval-workflows/${id}`, { cache: true });
  },

  // Get pending workflows for current user
  getPendingWorkflows: () => {
    return apiClient.get('/api/approval-workflows/pending/me', { cache: true });
  },

  // Get dashboard summary
  getDashboardSummary: () => {
    return apiClient.get('/api/approval-workflows/dashboard/summary', { cache: true });
  },

  // Submit approval decision
  submitDecision: (workflowId: string, decision: any) => {
    return apiClient.post(`/api/approval-workflows/${workflowId}/actions`, decision);
  },

  // Batch get multiple workflows
  batchGetWorkflows: (ids: string[]) => {
    const requests = ids.map(id => ({
      method: 'GET' as const,
      url: `/api/approval-workflows/${id}`
    }));
    
    return apiClient.batch(requests);
  }
};

/**
 * Request interceptor for automatic token refresh
 */
export const setupRequestInterceptor = (
  getToken: () => string | null,
  refreshToken: () => Promise<string>,
  onTokenRefresh?: (token: string) => void
) => {
  const originalFetch = window.fetch;
  
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = getToken();
    
    if (token && init?.headers) {
      (init.headers as any)['Authorization'] = `Bearer ${token}`;
    }
    
    let response = await originalFetch(input, init);
    
    // Handle token expiration
    if (response.status === 401) {
      try {
        const newToken = await refreshToken();
        onTokenRefresh?.(newToken);
        
        // Retry request with new token
        if (init?.headers) {
          (init.headers as any)['Authorization'] = `Bearer ${newToken}`;
        }
        
        response = await originalFetch(input, init);
      } catch (error) {
        // Token refresh failed, redirect to login
        window.location.href = '/login';
        throw error;
      }
    }
    
    return response;
  };
};

/**
 * Response caching utility
 */
export class ResponseCache {
  private cache = new Map<string, {
    data: any;
    timestamp: number;
    ttl: number;
  }>();

  set(key: string, data: any, ttl: number = 5 * 60 * 1000) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  clear() {
    this.cache.clear();
  }

  delete(key: string) {
    this.cache.delete(key);
  }
}

export const responseCache = new ResponseCache();