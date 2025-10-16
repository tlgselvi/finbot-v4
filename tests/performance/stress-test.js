// FinBot v4 - Stress Testing with k6
// High load stress testing to find breaking points

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('error_rate');
const responseTime = new Trend('response_time');
const requestCount = new Counter('request_count');

// Stress test configuration
export const options = {
  stages: [
    { duration: '1m', target: 50 },    // Ramp up to 50 users
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '3m', target: 200 },   // Ramp up to 200 users
    { duration: '5m', target: 300 },   // Ramp up to 300 users
    { duration: '5m', target: 500 },   // Ramp up to 500 users (stress)
    { duration: '10m', target: 500 },  // Stay at 500 users
    { duration: '3m', target: 0 },     // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'], // 95% of requests must complete below 5s (relaxed for stress)
    http_req_failed: ['rate<0.1'],     // Error rate must be below 10% (relaxed for stress)
    error_rate: ['rate<0.1'],
  },
};

const API_BASE_URL = __ENV.API_BASE_URL || 'http://localhost:3001';

// Stress test focuses on high-frequency, lightweight operations
export default function () {
  const scenario = Math.random();
  
  if (scenario < 0.4) {
    // Health checks and status endpoints (40%)
    stressHealthEndpoints();
  } else if (scenario < 0.7) {
    // Authentication stress (30%)
    stressAuthentication();
  } else if (scenario < 0.9) {
    // Read-heavy operations (20%)
    stressReadOperations();
  } else {
    // Write operations (10%)
    stressWriteOperations();
  }
  
  sleep(0.1); // Minimal think time for stress testing
}

function stressHealthEndpoints() {
  // Health check
  const healthResponse = http.get(`${API_BASE_URL}/health`);
  recordMetrics(healthResponse);
  check(healthResponse, {
    'health check status is 200': (r) => r.status === 200,
  });
  
  // Ready check
  const readyResponse = http.get(`${API_BASE_URL}/ready`);
  recordMetrics(readyResponse);
  check(readyResponse, {
    'ready check status is 200': (r) => r.status === 200,
  });
  
  // Metrics endpoint
  const metricsResponse = http.get(`${API_BASE_URL}/metrics`);
  recordMetrics(metricsResponse);
  check(metricsResponse, {
    'metrics endpoint accessible': (r) => r.status === 200,
  });
}

function stressAuthentication() {
  // Rapid login attempts with different users
  const users = [
    { email: 'stress1@finbot.com', password: 'StressTest123!' },
    { email: 'stress2@finbot.com', password: 'StressTest123!' },
    { email: 'stress3@finbot.com', password: 'StressTest123!' },
  ];
  
  const user = users[Math.floor(Math.random() * users.length)];
  
  const loginResponse = http.post(`${API_BASE_URL}/api/auth/login`, {
    email: user.email,
    password: user.password,
  }, {
    headers: { 'Content-Type': 'application/json' },
  });
  
  recordMetrics(loginResponse);
  check(loginResponse, {
    'login request processed': (r) => r.status === 200 || r.status === 401,
  });
  
  // Token validation stress
  if (loginResponse.status === 200) {
    const token = loginResponse.json('token');
    const validateResponse = http.get(`${API_BASE_URL}/api/auth/validate`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    
    recordMetrics(validateResponse);
    check(validateResponse, {
      'token validation processed': (r) => r.status === 200 || r.status === 401,
    });
  }
}

function stressReadOperations() {
  // Create a session token for read operations
  const loginResponse = http.post(`${API_BASE_URL}/api/auth/login`, {
    email: 'stress1@finbot.com',
    password: 'StressTest123!',
  }, {
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (loginResponse.status !== 200) return;
  
  const token = loginResponse.json('token');
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  
  // Rapid read operations
  const endpoints = [
    '/api/user/profile',
    '/api/accounts',
    '/api/transactions?limit=10',
    '/api/dashboard/summary',
    '/api/analytics/spending?period=7d',
  ];
  
  const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  const response = http.get(`${API_BASE_URL}${endpoint}`, { headers });
  
  recordMetrics(response);
  check(response, {
    'read operation processed': (r) => r.status === 200 || r.status === 401 || r.status === 403,
  });
}

function stressWriteOperations() {
  // Create a session token for write operations
  const loginResponse = http.post(`${API_BASE_URL}/api/auth/login`, {
    email: 'stress1@finbot.com',
    password: 'StressTest123!',
  }, {
    headers: { 'Content-Type': 'application/json' },
  });
  
  if (loginResponse.status !== 200) return;
  
  const token = loginResponse.json('token');
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  
  // Rapid write operations
  const operations = [
    () => {
      // Create transaction
      return http.post(`${API_BASE_URL}/api/transactions`, {
        amount: Math.floor(Math.random() * 100) + 1,
        description: `Stress test ${Date.now()}`,
        category: 'testing',
        type: 'expense',
      }, { headers });
    },
    () => {
      // Update user preferences
      return http.put(`${API_BASE_URL}/api/user/preferences`, {
        theme: Math.random() > 0.5 ? 'dark' : 'light',
        notifications: Math.random() > 0.5,
      }, { headers });
    },
    () => {
      // Create account
      return http.post(`${API_BASE_URL}/api/accounts`, {
        name: `Stress Account ${Date.now()}`,
        type: 'checking',
        balance: Math.floor(Math.random() * 1000),
      }, { headers });
    },
  ];
  
  const operation = operations[Math.floor(Math.random() * operations.length)];
  const response = operation();
  
  recordMetrics(response);
  check(response, {
    'write operation processed': (r) => r.status >= 200 && r.status < 500,
  });
}

function recordMetrics(response) {
  requestCount.add(1);
  responseTime.add(response.timings.duration);
  errorRate.add(response.status >= 400);
}

// Setup function for stress test
export function setup() {
  console.log('Setting up stress test...');
  
  // Create stress test users
  const stressUsers = [
    { email: 'stress1@finbot.com', password: 'StressTest123!' },
    { email: 'stress2@finbot.com', password: 'StressTest123!' },
    { email: 'stress3@finbot.com', password: 'StressTest123!' },
  ];
  
  for (const user of stressUsers) {
    const registerResponse = http.post(`${API_BASE_URL}/api/auth/register`, {
      email: user.email,
      password: user.password,
      firstName: 'Stress',
      lastName: 'Test',
    }, {
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (registerResponse.status === 201 || registerResponse.status === 409) {
      console.log(`Stress test user ${user.email} ready`);
    }
  }
  
  return { stressUsers };
}

// Handle summary for stress test results
export function handleSummary(data) {
  const summary = {
    testType: 'stress',
    timestamp: new Date().toISOString(),
    duration: data.state.testRunDurationMs,
    metrics: {
      totalRequests: data.metrics.http_reqs.count,
      failedRequests: data.metrics.http_req_failed.count,
      errorRate: data.metrics.http_req_failed.rate,
      avgResponseTime: data.metrics.http_req_duration.avg,
      p95ResponseTime: data.metrics.http_req_duration['p(95)'],
      p99ResponseTime: data.metrics.http_req_duration['p(99)'],
      requestsPerSecond: data.metrics.http_reqs.rate,
      maxVUs: Math.max(...Object.values(data.metrics.vus.values || {})),
    },
    thresholds: data.thresholds,
  };
  
  return {
    'stress-test-results.json': JSON.stringify(summary, null, 2),
    stdout: generateStressReport(summary),
  };
}

function generateStressReport(summary) {
  let report = '\n=== STRESS TEST RESULTS ===\n';
  report += `Test Duration: ${(summary.duration / 1000).toFixed(2)}s\n`;
  report += `Total Requests: ${summary.metrics.totalRequests}\n`;
  report += `Failed Requests: ${summary.metrics.failedRequests} (${(summary.metrics.errorRate * 100).toFixed(2)}%)\n`;
  report += `Requests/sec: ${summary.metrics.requestsPerSecond.toFixed(2)}\n`;
  report += `Max Concurrent Users: ${summary.metrics.maxVUs}\n`;
  report += `Average Response Time: ${summary.metrics.avgResponseTime.toFixed(2)}ms\n`;
  report += `95th Percentile: ${summary.metrics.p95ResponseTime.toFixed(2)}ms\n`;
  report += `99th Percentile: ${summary.metrics.p99ResponseTime.toFixed(2)}ms\n`;
  
  report += '\n=== THRESHOLD RESULTS ===\n';
  for (const [metric, result] of Object.entries(summary.thresholds)) {
    const status = result.ok ? '✓ PASS' : '✗ FAIL';
    report += `${metric}: ${status}\n`;
  }
  
  if (summary.metrics.errorRate > 0.1) {
    report += '\n⚠️  WARNING: High error rate detected during stress test\n';
  }
  
  if (summary.metrics.p95ResponseTime > 5000) {
    report += '\n⚠️  WARNING: High response times detected during stress test\n';
  }
  
  report += '\n=== RECOMMENDATIONS ===\n';
  if (summary.metrics.errorRate > 0.05) {
    report += '• Consider increasing resource limits or optimizing error handling\n';
  }
  if (summary.metrics.p95ResponseTime > 2000) {
    report += '• Consider performance optimizations or scaling improvements\n';
  }
  if (summary.metrics.requestsPerSecond < 100) {
    report += '• Consider investigating throughput bottlenecks\n';
  }
  
  return report;
}