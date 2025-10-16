// FinBot v4 - k6 Load Testing Script
// Alternative load testing with k6 for different metrics and reporting

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');
const requestCount = new Counter('requests');

// Test configuration
export const options = {
  stages: [
    // Warm-up
    { duration: '1m', target: 5 },
    // Ramp-up
    { duration: '2m', target: 50 },
    // Sustained load
    { duration: '5m', target: 50 },
    // Peak load
    { duration: '2m', target: 100 },
    // Cool-down
    { duration: '1m', target: 0 },
  ],
  
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests under 2s
    http_req_failed: ['rate<0.05'],    // Error rate under 5%
    errors: ['rate<0.05'],
    response_time: ['p(99)<5000'],     // 99% under 5s
  },
  
  // Resource limits
  noConnectionReuse: false,
  userAgent: 'FinBot-k6-LoadTest/1.0',
};

// Test data
const BASE_URL = 'http://localhost:3001';
const users = [
  { email: 'test@finbot.com', password: 'test123' },
  { email: 'admin@finbot.com', password: 'admin123' },
  { email: 'manager@finbot.com', password: 'manager123' },
];

const transactionTypes = ['transfer', 'payment', 'withdrawal', 'investment'];
const currencies = ['TRY', 'USD', 'EUR'];

// Helper functions
function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function generateTransactionData() {
  return {
    id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: getRandomElement(transactionTypes),
    amount: Math.floor(Math.random() * 100000) + 1000,
    currency: getRandomElement(currencies),
    userId: `user-${Math.floor(Math.random() * 100) + 1}`,
  };
}

// Authentication helper
function authenticate() {
  const user = getRandomElement(users);
  const loginResponse = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify(user), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  requestCount.add(1);
  responseTime.add(loginResponse.timings.duration);
  
  const loginSuccess = check(loginResponse, {
    'login successful': (r) => r.status === 200,
    'login response time OK': (r) => r.timings.duration < 1000,
  });
  
  if (!loginSuccess) {
    errorRate.add(1);
    return null;
  }
  
  const token = loginResponse.json('token');
  return token;
}

// Main test scenarios
export default function () {
  const token = authenticate();
  if (!token) {
    sleep(1);
    return;
  }
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  
  // Scenario selection (weighted)
  const scenario = Math.random();
  
  if (scenario < 0.3) {
    // Dashboard access (30%)
    dashboardScenario(headers);
  } else if (scenario < 0.55) {
    // Workflow operations (25%)
    workflowScenario(headers);
  } else if (scenario < 0.75) {
    // Search and filter (20%)
    searchScenario(headers);
  } else if (scenario < 0.9) {
    // Rules management (15%)
    rulesScenario(headers);
  } else {
    // Bulk operations (10%)
    bulkScenario(headers);
  }
  
  sleep(Math.random() * 2 + 1); // Random sleep 1-3 seconds
}

function dashboardScenario(headers) {
  // Dashboard summary
  const summaryResponse = http.get(`${BASE_URL}/api/approval-workflows/dashboard/summary`, { headers });
  requestCount.add(1);
  responseTime.add(summaryResponse.timings.duration);
  
  const summaryCheck = check(summaryResponse, {
    'dashboard summary OK': (r) => r.status === 200,
    'dashboard summary time OK': (r) => r.timings.duration < 2000,
    'dashboard has data': (r) => r.json('data.summary') !== undefined,
  });
  
  if (!summaryCheck) errorRate.add(1);
  
  // Workflows list
  const workflowsResponse = http.get(`${BASE_URL}/api/approval-workflows?page=1&limit=20`, { headers });
  requestCount.add(1);
  responseTime.add(workflowsResponse.timings.duration);
  
  const workflowsCheck = check(workflowsResponse, {
    'workflows list OK': (r) => r.status === 200,
    'workflows list time OK': (r) => r.timings.duration < 2000,
  });
  
  if (!workflowsCheck) errorRate.add(1);
}

function workflowScenario(headers) {
  // Create workflow
  const transactionData = generateTransactionData();
  const createPayload = {
    transaction: transactionData,
    requesterId: `requester-${Math.floor(Math.random() * 50) + 1}`,
  };
  
  const createResponse = http.post(
    `${BASE_URL}/api/approval-workflows`,
    JSON.stringify(createPayload),
    { headers }
  );
  
  requestCount.add(1);
  responseTime.add(createResponse.timings.duration);
  
  const createCheck = check(createResponse, {
    'workflow created': (r) => r.status === 201,
    'workflow create time OK': (r) => r.timings.duration < 3000,
  });
  
  if (!createCheck) {
    errorRate.add(1);
    return;
  }
  
  const workflowId = createResponse.json('data.workflow.id');
  if (workflowId) {
    // Get workflow details
    const getResponse = http.get(`${BASE_URL}/api/approval-workflows/${workflowId}`, { headers });
    requestCount.add(1);
    responseTime.add(getResponse.timings.duration);
    
    const getCheck = check(getResponse, {
      'workflow retrieved': (r) => r.status === 200,
      'workflow get time OK': (r) => r.timings.duration < 1500,
    });
    
    if (!getCheck) errorRate.add(1);
  }
}

function searchScenario(headers) {
  const searchParams = new URLSearchParams({
    status: getRandomElement(['pending', 'approved', 'rejected']),
    page: Math.floor(Math.random() * 10) + 1,
    limit: Math.floor(Math.random() * 50) + 10,
  });
  
  const searchResponse = http.get(
    `${BASE_URL}/api/approval-workflows/search?${searchParams}`,
    { headers }
  );
  
  requestCount.add(1);
  responseTime.add(searchResponse.timings.duration);
  
  const searchCheck = check(searchResponse, {
    'search successful': (r) => r.status === 200,
    'search time OK': (r) => r.timings.duration < 2500,
  });
  
  if (!searchCheck) errorRate.add(1);
}

function rulesScenario(headers) {
  // Get rules
  const rulesResponse = http.get(`${BASE_URL}/api/approval-rules`, { headers });
  requestCount.add(1);
  responseTime.add(rulesResponse.timings.duration);
  
  const rulesCheck = check(rulesResponse, {
    'rules retrieved': (r) => r.status === 200,
    'rules time OK': (r) => r.timings.duration < 1500,
  });
  
  if (!rulesCheck) errorRate.add(1);
  
  // Create rule (occasionally)
  if (Math.random() < 0.3) {
    const rulePayload = {
      name: `Load Test Rule ${Date.now()}`,
      transactionType: getRandomElement(transactionTypes),
      amountThreshold: Math.floor(Math.random() * 100000) + 10000,
      currency: 'TRY',
      approvalLevels: Math.floor(Math.random() * 3) + 1,
      requiredRoles: [['finance'], ['admin']],
      createdBy: `user-${Math.floor(Math.random() * 10) + 1}`,
    };
    
    const createRuleResponse = http.post(
      `${BASE_URL}/api/approval-rules`,
      JSON.stringify(rulePayload),
      { headers }
    );
    
    requestCount.add(1);
    responseTime.add(createRuleResponse.timings.duration);
    
    const createRuleCheck = check(createRuleResponse, {
      'rule created': (r) => r.status === 201,
      'rule create time OK': (r) => r.timings.duration < 2000,
    });
    
    if (!createRuleCheck) errorRate.add(1);
  }
}

function bulkScenario(headers) {
  // Simulate bulk operations by making multiple requests
  const bulkSize = Math.floor(Math.random() * 5) + 3; // 3-7 requests
  
  for (let i = 0; i < bulkSize; i++) {
    const transactionData = generateTransactionData();
    const createPayload = {
      transaction: transactionData,
      requesterId: `bulk-requester-${i}`,
    };
    
    const response = http.post(
      `${BASE_URL}/api/approval-workflows`,
      JSON.stringify(createPayload),
      { headers }
    );
    
    requestCount.add(1);
    responseTime.add(response.timings.duration);
    
    const bulkCheck = check(response, {
      'bulk request successful': (r) => r.status === 201,
      'bulk request time OK': (r) => r.timings.duration < 4000,
    });
    
    if (!bulkCheck) errorRate.add(1);
    
    sleep(0.1); // Small delay between bulk requests
  }
}

// Setup and teardown
export function setup() {
  console.log('Starting FinBot v4 k6 load test...');
  console.log(`Target: ${BASE_URL}`);
  console.log('Test scenarios: Dashboard, Workflows, Search, Rules, Bulk operations');
}

export function teardown(data) {
  console.log('FinBot v4 k6 load test completed');
}