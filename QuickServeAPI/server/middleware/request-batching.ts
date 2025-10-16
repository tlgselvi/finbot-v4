/**
 * FinBot v4 - Request Batching Middleware
 * GraphQL-style request batching for API optimization
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

interface BatchRequest {
  id: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: any;
}

interface BatchResponse {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body: any;
  duration?: number;
}

interface BatchedRequest extends Request {
  batchId?: string;
  originalRequests?: BatchRequest[];
}

// Batch configuration
const BATCH_CONFIG = {
  maxBatchSize: 10,
  batchTimeout: 100, // ms
  enabledRoutes: [
    '/api/approval-workflows',
    '/api/users',
    '/api/audit-logs'
  ],
  
  // Routes that should not be batched
  excludedRoutes: [
    '/api/auth',
    '/api/health',
    '/api/batch'
  ]
};

// Active batch requests
const activeBatches = new Map<string, {
  requests: BatchRequest[];
  responses: Map<string, BatchResponse>;
  timeout: NodeJS.Timeout;
  resolve: (responses: BatchResponse[]) => void;
}>();

/**
 * Check if route supports batching
 */
const isBatchableRoute = (url: string): boolean => {
  // Check if route is excluded
  if (BATCH_CONFIG.excludedRoutes.some(route => url.startsWith(route))) {
    return false;
  }
  
  // Check if route is enabled for batching
  return BATCH_CONFIG.enabledRoutes.some(route => url.startsWith(route));
};

/**
 * Batch request handler
 */
export const batchRequests = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only handle POST requests to /api/batch
    if (req.method !== 'POST' || req.path !== '/api/batch') {
      return next();
    }

    try {
      const { requests } = req.body as { requests: BatchRequest[] };
      
      if (!Array.isArray(requests) || requests.length === 0) {
        return res.status(400).json({
          error: 'Invalid batch request format',
          code: 'INVALID_BATCH_FORMAT'
        });
      }

      if (requests.length > BATCH_CONFIG.maxBatchSize) {
        return res.status(400).json({
          error: `Batch size exceeds maximum of ${BATCH_CONFIG.maxBatchSize}`,
          code: 'BATCH_SIZE_EXCEEDED'
        });
      }

      // Validate all requests are batchable
      const invalidRequests = requests.filter(r => !isBatchableRoute(r.url));
      if (invalidRequests.length > 0) {
        return res.status(400).json({
          error: 'Some requests are not batchable',
          code: 'NON_BATCHABLE_REQUESTS',
          invalidRequests: invalidRequests.map(r => r.url)
        });
      }

      // Process batch
      const responses = await processBatch(requests, req);
      
      res.json({
        success: true,
        responses,
        batchSize: requests.length,
        processingTime: responses.reduce((sum, r) => sum + (r.duration || 0), 0)
      });

    } catch (error) {
      console.error('Batch processing error:', error);
      res.status(500).json({
        error: 'Failed to process batch request',
        code: 'BATCH_PROCESSING_ERROR',
        details: error.message
      });
    }
  };
};

/**
 * Process batch of requests
 */
const processBatch = async (
  requests: BatchRequest[],
  originalReq: Request
): Promise<BatchResponse[]> => {
  const responses: BatchResponse[] = [];
  
  // Process requests in parallel with concurrency limit
  const concurrencyLimit = 5;
  const chunks = chunkArray(requests, concurrencyLimit);
  
  for (const chunk of chunks) {
    const chunkPromises = chunk.map(request => processIndividualRequest(request, originalReq));
    const chunkResponses = await Promise.all(chunkPromises);
    responses.push(...chunkResponses);
  }
  
  return responses;
};

/**
 * Process individual request within batch
 */
const processIndividualRequest = async (
  request: BatchRequest,
  originalReq: Request
): Promise<BatchResponse> => {
  const startTime = Date.now();
  
  try {
    // Create mock request/response objects
    const mockReq = createMockRequest(request, originalReq);
    const mockRes = createMockResponse();
    
    // Execute the request through the router
    const response = await executeRequest(mockReq, mockRes);
    
    return {
      id: request.id,
      status: response.statusCode,
      headers: response.headers,
      body: response.body,
      duration: Date.now() - startTime
    };
    
  } catch (error) {
    return {
      id: request.id,
      status: 500,
      body: {
        error: 'Internal server error',
        code: 'BATCH_REQUEST_ERROR',
        details: error.message
      },
      duration: Date.now() - startTime
    };
  }
};

/**
 * Create mock request object
 */
const createMockRequest = (batchRequest: BatchRequest, originalReq: Request): any => {
  const url = new URL(batchRequest.url, `http://${originalReq.get('host')}`);
  
  return {
    method: batchRequest.method,
    url: batchRequest.url,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: {
      ...originalReq.headers,
      ...batchRequest.headers
    },
    body: batchRequest.body,
    user: originalReq.user,
    ip: originalReq.ip,
    get: (header: string) => batchRequest.headers?.[header] || originalReq.get(header)
  };
};

/**
 * Create mock response object
 */
const createMockResponse = (): any => {
  let statusCode = 200;
  let headers: Record<string, string> = {};
  let body: any = null;
  
  return {
    statusCode,
    headers,
    body,
    
    status: function(code: number) {
      statusCode = code;
      return this;
    },
    
    setHeader: function(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    
    getHeader: function(name: string) {
      return headers[name];
    },
    
    json: function(data: any) {
      body = data;
      headers['Content-Type'] = 'application/json';
      return this;
    },
    
    send: function(data: any) {
      body = data;
      return this;
    },
    
    end: function() {
      return this;
    }
  };
};

/**
 * Execute request through router (simplified)
 */
const executeRequest = async (mockReq: any, mockRes: any): Promise<any> => {
  // This is a simplified implementation
  // In a real scenario, you'd need to integrate with your actual router
  
  return new Promise((resolve) => {
    // Simulate API call processing
    setTimeout(() => {
      mockRes.json({ 
        success: true, 
        data: `Mock response for ${mockReq.path}`,
        timestamp: new Date().toISOString()
      });
      
      resolve({
        statusCode: mockRes.statusCode,
        headers: mockRes.headers,
        body: mockRes.body
      });
    }, Math.random() * 50); // Random delay 0-50ms
  });
};

/**
 * Utility function to chunk array
 */
const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * Client-side batching helper
 */
export class BatchClient {
  private baseUrl: string;
  private batchQueue: BatchRequest[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private pendingRequests = new Map<string, {
    resolve: (response: any) => void;
    reject: (error: any) => void;
  }>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Add request to batch queue
   */
  async request(method: string, url: string, options: {
    headers?: Record<string, string>;
    body?: any;
  } = {}): Promise<any> {
    const requestId = uuidv4();
    
    const batchRequest: BatchRequest = {
      id: requestId,
      method: method.toUpperCase(),
      url,
      headers: options.headers,
      body: options.body
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      this.batchQueue.push(batchRequest);
      
      // Schedule batch execution
      this.scheduleBatch();
    });
  }

  /**
   * Schedule batch execution
   */
  private scheduleBatch() {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }

    this.batchTimeout = setTimeout(() => {
      this.executeBatch();
    }, BATCH_CONFIG.batchTimeout);

    // Execute immediately if batch is full
    if (this.batchQueue.length >= BATCH_CONFIG.maxBatchSize) {
      clearTimeout(this.batchTimeout);
      this.executeBatch();
    }
  }

  /**
   * Execute batch request
   */
  private async executeBatch() {
    if (this.batchQueue.length === 0) return;

    const requests = [...this.batchQueue];
    this.batchQueue = [];
    this.batchTimeout = null;

    try {
      const response = await fetch(`${this.baseUrl}/api/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
      });

      const result = await response.json();
      
      if (result.success) {
        // Resolve individual requests
        result.responses.forEach((batchResponse: BatchResponse) => {
          const pending = this.pendingRequests.get(batchResponse.id);
          if (pending) {
            if (batchResponse.status >= 200 && batchResponse.status < 300) {
              pending.resolve(batchResponse.body);
            } else {
              pending.reject(new Error(batchResponse.body.error || 'Request failed'));
            }
            this.pendingRequests.delete(batchResponse.id);
          }
        });
      } else {
        // Reject all pending requests
        requests.forEach(req => {
          const pending = this.pendingRequests.get(req.id);
          if (pending) {
            pending.reject(new Error(result.error || 'Batch request failed'));
            this.pendingRequests.delete(req.id);
          }
        });
      }
    } catch (error) {
      // Reject all pending requests
      requests.forEach(req => {
        const pending = this.pendingRequests.get(req.id);
        if (pending) {
          pending.reject(error);
          this.pendingRequests.delete(req.id);
        }
      });
    }
  }

  /**
   * Convenience methods
   */
  get(url: string, headers?: Record<string, string>) {
    return this.request('GET', url, { headers });
  }

  post(url: string, body?: any, headers?: Record<string, string>) {
    return this.request('POST', url, { body, headers });
  }

  put(url: string, body?: any, headers?: Record<string, string>) {
    return this.request('PUT', url, { body, headers });
  }

  delete(url: string, headers?: Record<string, string>) {
    return this.request('DELETE', url, { headers });
  }
}