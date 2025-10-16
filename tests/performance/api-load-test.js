// FinBot v4 - API Load Testing with k6
// Performance testing for API endpoints

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('error_rate');
const responseTime = new Trend('response_time');
const requestCount = new Counter('request_count');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up to 10 users
    { duration: '5m', target: 10 },   // Stay at 10 users
    { duration: '2m', target: 20 },   // Ramp up to 20 users
    { duration: '5m', target: 20 },   // Stay at 20 users
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '5m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests must complete below 2s
    http_req_failed: ['rate<0.05'],    // Error rate must be below 5%
    error_rate: ['rate<0.05'],
    response_time: ['p(95)<2000'],
  },
};

// Test data
const testUsers = [
  { email: 'test1@finbot.com', password: 'TestPassword123!' },
  { email: 'test2@finbot.com', password: 'TestPassword123!' },
  { email: 'test3@finbot.com', password: 'TestPassword123!' },
];

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3001';

// Helper function to authenticate user
function authenticateUser(user) {
  const loginResponse = http.post(`${API_BASE_URL}/api/auth/login`, {
    email: user.email,
    password: user.password,
  }, {
    headers: { 'Content-Type': 'application/json' },
  });

  const isLoginSuccessful = check(loginResponse, {
    'login successful': (r) => r.status === 200,
    'login response has token': (r) => r.json('token') !== undefined,
  });

  if (isLoginSuccessful) {
    return loginResponse.json('token');
  }
  return null;
}

// Helper function to make authenticated request
function makeAuthenticatedRequest(method, url, token, payload = null) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  let response;
  if (method === 'GET') {
    response = http.get(url, { headers });
  } else if (method === 'POST') {
    response = http.post(url, JSON.stringify(payload), { headers });
  } else if (method === 'PUT') {
    response = http.put(url, JSON.stringify(payload), { headers });
  } else if (method === 'DELETE') {
    response = http.del(url, null, { headers });
  }

  // Record metrics
  requestCount.add(1);
  responseTime.add(response.timings.duration);
  errorRate.add(response.status >= 400);

  return response;
}

export default function () {
  // Health check test
  const healthResponse = http.get(`${API_BASE_URL}/health`);
  check(healthResponse, {
    'health check status is 200': (r) => r.status === 200,
    'health check response time < 500ms': (r) => r.timings.duration < 500,
  });

  // Select random test user
  const user = testUsers[Math.floor(Math.random() * testUsers.length)];
  
  // Authenticate
  const token = authenticateUser(user);
  if (!token) {
    console.error('Authentication failed');
    return;
  }

  // Test scenarios with different weights
  const scenario = Math.random();

  if (scenario < 0.3) {
    // Scenario 1: User profile operations (30%)
    testUserProfile(token);
  } else if (scenario < 0.6) {
    // Scenario 2: Transaction operations (30%)
    testTransactions(token);
  } else if (scenario < 0.8) {
    // Scenario 3: Account operations (20%)
    testAccounts(token);
  } else {
    // Scenario 4: Dashboard and analytics (20%)
    testDashboard(token);
  }

  sleep(1); // Think time between requests
}

function testUserProfile(token) {
  // Get user profile
  const profileResponse = makeAuthenticatedRequest('GET', `${API_BASE_URL}/api/user/profile`, token);
  check(profileResponse, {
    'get profile status is 200': (r) => r.status === 200,
    'profile has user data': (r) => r.json('user') !== undefined,
  });

  // Update user preferences
  const updateResponse = makeAuthenticatedRequest('PUT', `${API_BASE_URL}/api/user/preferences`, token, {
    theme: 'dark',
    notifications: true,
    currency: 'USD',
  });
  check(updateResponse, {
    'update preferences status is 200': (r) => r.status === 200,
  });
}

function testTransactions(token) {
  // Get transactions list
  const transactionsResponse = makeAuthenticatedRequest('GET', `${API_BASE_URL}/api/transactions?limit=20&offset=0`, token);
  check(transactionsResponse, {
    'get transactions status is 200': (r) => r.status === 200,
    'transactions response has data': (r) => r.json('transactions') !== undefined,
  });

  // Create new transaction
  const newTransaction = {
    amount: Math.floor(Math.random() * 1000) + 10,
    description: `Test transaction ${Date.now()}`,
    category: 'testing',
    type: 'expense',
  };

  const createResponse = makeAuthenticatedRequest('POST', `${API_BASE_URL}/api/transactions`, token, newTransaction);
  check(createResponse, {
    'create transaction status is 201': (r) => r.status === 201,
    'created transaction has id': (r) => r.json('id') !== undefined,
  });

  if (createResponse.status === 201) {
    const transactionId = createResponse.json('id');
    
    // Get specific transaction
    const getResponse = makeAuthenticatedRequest('GET', `${API_BASE_URL}/api/transactions/${transactionId}`, token);
    check(getResponse, {
      'get specific transaction status is 200': (r) => r.status === 200,
    });

    // Update transaction
    const updateResponse = makeAuthenticatedRequest('PUT', `${API_BASE_URL}/api/transactions/${transactionId}`, token, {
      ...newTransaction,
      description: `Updated ${newTransaction.description}`,
    });
    check(updateResponse, {
      'update transaction status is 200': (r) => r.status === 200,
    });
  }
}

function testAccounts(token) {
  // Get accounts list
  const accountsResponse = makeAuthenticatedRequest('GET', `${API_BASE_URL}/api/accounts`, token);
  check(accountsResponse, {
    'get accounts status is 200': (r) => r.status === 200,
    'accounts response has data': (r) => r.json('accounts') !== undefined,
  });

  // Create new account
  const newAccount = {
    name: `Test Account ${Date.now()}`,
    type: 'checking',
    balance: Math.floor(Math.random() * 10000),
    currency: 'USD',
  };

  const createResponse = makeAuthenticatedRequest('POST', `${API_BASE_URL}/api/accounts`, token, newAccount);
  check(createResponse, {
    'create account status is 201': (r) => r.status === 201,
    'created account has id': (r) => r.json('id') !== undefined,
  });

  if (createResponse.status === 201) {
    const accountId = createResponse.json('id');
    
    // Get account balance
    const balanceResponse = makeAuthenticatedRequest('GET', `${API_BASE_URL}/api/accounts/${accountId}/balance`, token);
    check(balanceResponse, {
      'get account balance status is 200': (r) => r.status === 200,
    });
  }
}

function testDashboard(token) {
  // Get dashboard summary
  const summaryResponse = makeAuthenticatedRequest('GET', `${API_BASE_URL}/api/dashboard/summary`, token);
  check(summaryResponse, {
    'get dashboard summary status is 200': (r) => r.status === 200,
    'summary has financial data': (r) => r.json('totalBalance') !== undefined,
  });

  // Get spending analytics
  const analyticsResponse = makeAuthenticatedRequest('GET', `${API_BASE_URL}/api/analytics/spending?period=30d`, token);
  check(analyticsResponse, {
    'get analytics status is 200': (r) => r.status === 200,
  });

  // Get budget information
  const budgetResponse = makeAuthenticatedRequest('GET', `${API_BASE_URL}/api/budget/current`, token);
  check(budgetResponse, {
    'get budget status is 200': (r) => r.status === 200,
  });
}

// Setup function to create test data
export function setup() {
  console.log('Setting up load test...');
  
  // Create test users if they don't exist
  for (const user of testUsers) {
    const registerResponse = http.post(`${API_BASE_URL}/api/auth/register`, {
      email: user.email,
      password: user.password,
      firstName: 'Test',
      lastName: 'User',
    }, {
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (registerResponse.status === 201 || registerResponse.status === 409) {
      console.log(`Test user ${user.email} ready`);
    }
  }
  
  return { testUsers };
}

// Teardown function to clean up test data
export function teardown(data) {
  console.log('Cleaning up load test...');
  // Cleanup logic would go here if needed
}

// Handle summary to export results
export function handleSummary(data) {
  return {
    'performance-results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

function textSummary(data, options = {}) {
  const indent = options.indent || '';
  const enableColors = options.enableColors || false;
  
  let summary = `${indent}Load Test Results:\n`;
  summary += `${indent}==================\n`;
  summary += `${indent}Total Requests: ${data.metrics.http_reqs.count}\n`;
  summary += `${indent}Failed Requests: ${data.metrics.http_req_failed.count} (${(data.metrics.http_req_failed.rate * 100).toFixed(2)}%)\n`;
  summary += `${indent}Average Response Time: ${data.metrics.http_req_duration.avg.toFixed(2)}ms\n`;
  summary += `${indent}95th Percentile: ${data.metrics.http_req_duration['p(95)'].toFixed(2)}ms\n`;
  summary += `${indent}99th Percentile: ${data.metrics.http_req_duration['p(99)'].toFixed(2)}ms\n`;
  summary += `${indent}Requests/sec: ${data.metrics.http_reqs.rate.toFixed(2)}\n`;
  
  return summary;
}