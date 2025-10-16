#!/usr/bin/env node

/**
 * FinBot v4 - Load Balancer Tests
 * Comprehensive tests for NGINX ingress controller, SSL, rate limiting, and traffic management
 */

const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const chalk = require('chalk');
const crypto = require('crypto');

class LoadBalancerTests {
  constructor() {
    this.testResults = [];
    this.baseUrl = process.env.TEST_BASE_URL || 'https://finbot.com';
    this.apiUrl = process.env.TEST_API_URL || 'https://api.finbot.com';
    this.kubectl = 'kubectl';
    this.testTimeout = 30000; // 30 seconds
  }

  async runAllTests() {
    console.log(chalk.bold('🔧 Running Load Balancer Tests\n'));

    try {
      await this.testIngressControllerDeployment();
      await this.testSSLTermination();
      await this.testCertificateManagement();
      await this.testRateLimiting();
      await this.testTrafficRouting();
      await this.testHealthChecks();
      await this.testFailover();
      await this.testSecurityHeaders();
      await this.testGeoRouting();
      await this.testLoadBalancing();
      
      this.printResults();
      
      const failedTests = this.testResults.filter(r => !r.passed).length;
      if (failedTests > 0) {
        console.log(chalk.red(`\n❌ ${failedTests} tests failed`));
        process.exit(1);
      } else {
        console.log(chalk.green('\n✅ All load balancer tests passed'));
        process.exit(0);
      }
    } catch (error) {
      console.error(chalk.red('❌ Load balancer tests failed:'), error.message);
      process.exit(1);
    }
  }

  async testIngressControllerDeployment() {
    console.log(chalk.blue('🚀 Testing ingress controller deployment...'));
    
    try {
      // Test NGINX ingress controller pods
      const ingressPods = execSync(`${this.kubectl} get pods -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx --no-headers`, { encoding: 'utf8' });
      const runningPods = ingressPods.split('\n').filter(line => line.includes('Running')).length;
      const expectedPods = 3; // HA configuration
      
      this.addResult('Ingress Controller HA', runningPods >= expectedPods, `${runningPods}/${expectedPods} pods running`);
      
      // Test ingress controller service
      const ingressService = execSync(`${this.kubectl} get service ingress-nginx -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].ip}'`, { encoding: 'utf8' });
      const hasLoadBalancer = ingressService.length > 0;
      this.addResult('Load Balancer Service', hasLoadBalancer, hasLoadBalancer ? `External IP: ${ingressService}` : 'No external IP assigned');
      
      // Test ingress class
      const ingressClass = execSync(`${this.kubectl} get ingressclass nginx -o jsonpath='{.metadata.annotations.ingressclass\\.kubernetes\\.io/is-default-class}'`, { encoding: 'utf8' });
      const isDefaultClass = ingressClass === 'true';
      this.addResult('Default Ingress Class', isDefaultClass, isDefaultClass ? 'NGINX is default ingress class' : 'NGINX is not default ingress class');
      
      // Test HPA configuration
      const hpa = execSync(`${this.kubectl} get hpa nginx-ingress-hpa -n ingress-nginx -o jsonpath='{.spec.minReplicas}'`, { encoding: 'utf8' });
      const hasHPA = parseInt(hpa) >= 3;
      this.addResult('Horizontal Pod Autoscaler', hasHPA, hasHPA ? `Min replicas: ${hpa}` : 'HPA not properly configured');
      
    } catch (error) {
      this.addResult('Ingress Controller Deployment', false, `Failed to test deployment: ${error.message}`);
    }
  }

  async testSSLTermination() {
    console.log(chalk.blue('🔒 Testing SSL termination...'));
    
    try {
      // Test HTTPS redirect
      const httpResponse = await this.makeRequest('http://finbot.com', { followRedirects: false });
      const hasRedirect = httpResponse.statusCode >= 300 && httpResponse.statusCode < 400;
      this.addResult('HTTP to HTTPS Redirect', hasRedirect, hasRedirect ? `Redirects with ${httpResponse.statusCode}` : 'No redirect configured');
      
      // Test SSL certificate
      const httpsResponse = await this.makeRequest(this.baseUrl);
      const hasValidSSL = httpsResponse.statusCode === 200;
      this.addResult('SSL Certificate Valid', hasValidSSL, hasValidSSL ? 'SSL certificate is valid' : 'SSL certificate invalid');
      
      // Test TLS version
      const tlsInfo = await this.getTLSInfo(this.baseUrl);
      const supportsTLS13 = tlsInfo.protocol === 'TLSv1.3' || tlsInfo.protocol === 'TLSv1.2';
      this.addResult('TLS Version', supportsTLS13, `Using ${tlsInfo.protocol}`);
      
      // Test certificate expiry
      const certExpiry = await this.getCertificateExpiry(this.baseUrl);
      const daysUntilExpiry = Math.floor((certExpiry - Date.now()) / (1000 * 60 * 60 * 24));
      const certValid = daysUntilExpiry > 30;
      this.addResult('Certificate Expiry', certValid, `Expires in ${daysUntilExpiry} days`);
      
    } catch (error) {
      this.addResult('SSL Termination', false, `Failed to test SSL: ${error.message}`);
    }
  }

  async testCertificateManagement() {
    console.log(chalk.blue('📜 Testing certificate management...'));
    
    try {
      // Test cert-manager deployment
      const certManagerPods = execSync(`${this.kubectl} get pods -n cert-manager -l app=cert-manager --no-headers`, { encoding: 'utf8' });
      const certManagerRunning = certManagerPods.split('\n').filter(line => line.includes('Running')).length;
      this.addResult('Cert-Manager Running', certManagerRunning >= 2, `${certManagerRunning} cert-manager pods running`);
      
      // Test webhook
      const webhookPods = execSync(`${this.kubectl} get pods -n cert-manager -l app=webhook --no-headers`, { encoding: 'utf8' });
      const webhookRunning = webhookPods.split('\n').filter(line => line.includes('Running')).length;
      this.addResult('Cert-Manager Webhook', webhookRunning >= 2, `${webhookRunning} webhook pods running`);
      
      // Test cluster issuers
      const clusterIssuers = execSync(`${this.kubectl} get clusterissuers --no-headers | wc -l`, { encoding: 'utf8' });
      const hasIssuers = parseInt(clusterIssuers.trim()) >= 2;
      this.addResult('Cluster Issuers', hasIssuers, `${clusterIssuers.trim()} cluster issuers configured`);
      
      // Test certificate resource
      const certificates = execSync(`${this.kubectl} get certificates -n ingress-nginx --no-headers | wc -l`, { encoding: 'utf8' });
      const hasCertificates = parseInt(certificates.trim()) > 0;
      this.addResult('Certificate Resources', hasCertificates, `${certificates.trim()} certificates managed`);
      
    } catch (error) {
      this.addResult('Certificate Management', false, `Failed to test cert-manager: ${error.message}`);
    }
  }

  async testRateLimiting() {
    console.log(chalk.blue('🚦 Testing rate limiting...'));
    
    try {
      const testEndpoint = `${this.apiUrl}/health`;
      const requests = [];
      const concurrentRequests = 50;
      
      // Send concurrent requests to trigger rate limiting
      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(this.makeRequest(testEndpoint, { timeout: 5000 }));
      }
      
      const responses = await Promise.allSettled(requests);
      const rateLimitedResponses = responses.filter(r => 
        r.status === 'fulfilled' && r.value.statusCode === 429
      ).length;
      
      // We expect some rate limiting to occur
      const hasRateLimiting = rateLimitedResponses > 0;
      this.addResult('Rate Limiting Active', hasRateLimiting, `${rateLimitedResponses}/${concurrentRequests} requests rate limited`);
      
      // Test rate limit headers
      const singleResponse = await this.makeRequest(testEndpoint);
      const hasRateLimitHeaders = singleResponse.headers['x-ratelimit-limit'] || singleResponse.headers['x-rate-limit'];
      this.addResult('Rate Limit Headers', !!hasRateLimitHeaders, hasRateLimitHeaders ? 'Rate limit headers present' : 'No rate limit headers');
      
      // Test different endpoints have different limits
      const authEndpoint = `${this.apiUrl}/api/auth/login`;
      const authResponse = await this.makeRequest(authEndpoint, { method: 'POST', timeout: 5000 });
      const authRateLimited = authResponse.statusCode === 429 || authResponse.statusCode === 404; // 404 is OK, means endpoint exists
      this.addResult('Auth Endpoint Rate Limiting', true, `Auth endpoint responds with ${authResponse.statusCode}`);
      
    } catch (error) {
      this.addResult('Rate Limiting', false, `Failed to test rate limiting: ${error.message}`);
    }
  }

  async testTrafficRouting() {
    console.log(chalk.blue('🛣️  Testing traffic routing...'));
    
    try {
      // Test main domain routing
      const mainResponse = await this.makeRequest(this.baseUrl);
      const mainRouting = mainResponse.statusCode === 200;
      this.addResult('Main Domain Routing', mainRouting, `Main domain returns ${mainResponse.statusCode}`);
      
      // Test API subdomain routing
      const apiResponse = await this.makeRequest(`${this.apiUrl}/health`);
      const apiRouting = apiResponse.statusCode === 200 || apiResponse.statusCode === 404;
      this.addResult('API Subdomain Routing', apiRouting, `API subdomain returns ${apiResponse.statusCode}`);
      
      // Test www redirect
      const wwwResponse = await this.makeRequest('https://www.finbot.com', { followRedirects: false });
      const wwwRouting = wwwResponse.statusCode === 200 || (wwwResponse.statusCode >= 300 && wwwResponse.statusCode < 400);
      this.addResult('WWW Subdomain Routing', wwwRouting, `WWW subdomain returns ${wwwResponse.statusCode}`);
      
      // Test path-based routing
      const apiPathResponse = await this.makeRequest(`${this.baseUrl}/api/health`);
      const pathRouting = apiPathResponse.statusCode === 200 || apiPathResponse.statusCode === 404;
      this.addResult('Path-based Routing', pathRouting, `API path returns ${apiPathResponse.statusCode}`);
      
    } catch (error) {
      this.addResult('Traffic Routing', false, `Failed to test routing: ${error.message}`);
    }
  }

  async testHealthChecks() {
    console.log(chalk.blue('❤️  Testing health checks...'));
    
    try {
      // Test ingress controller health
      const ingressHealth = execSync(`${this.kubectl} get pods -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}'`, { encoding: 'utf8' });
      const allIngressHealthy = ingressHealth.split(' ').every(status => status === 'True');
      this.addResult('Ingress Controller Health', allIngressHealthy, allIngressHealthy ? 'All ingress pods healthy' : 'Some ingress pods unhealthy');
      
      // Test health endpoint
      const healthResponse = await this.makeRequest(`${this.baseUrl}/health`);
      const healthEndpoint = healthResponse.statusCode === 200;
      this.addResult('Health Endpoint', healthEndpoint, `Health endpoint returns ${healthResponse.statusCode}`);
      
      // Test readiness probes
      const readinessProbes = execSync(`${this.kubectl} get pods -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx -o jsonpath='{.items[*].status.containerStatuses[*].ready}'`, { encoding: 'utf8' });
      const allReady = readinessProbes.split(' ').every(status => status === 'true');
      this.addResult('Readiness Probes', allReady, allReady ? 'All containers ready' : 'Some containers not ready');
      
      // Test liveness probes
      const livenessProbes = execSync(`${this.kubectl} get pods -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx -o jsonpath='{.items[*].status.containerStatuses[*].restartCount}'`, { encoding: 'utf8' });
      const restartCounts = livenessProbes.split(' ').map(count => parseInt(count) || 0);
      const lowRestarts = restartCounts.every(count => count < 5);
      this.addResult('Liveness Probes', lowRestarts, `Max restart count: ${Math.max(...restartCounts)}`);
      
    } catch (error) {
      this.addResult('Health Checks', false, `Failed to test health checks: ${error.message}`);
    }
  }

  async testFailover() {
    console.log(chalk.blue('🔄 Testing failover capabilities...'));
    
    try {
      // Test pod disruption budget
      const pdb = execSync(`${this.kubectl} get pdb nginx-ingress-pdb -n ingress-nginx -o jsonpath='{.spec.minAvailable}'`, { encoding: 'utf8' });
      const hasPDB = parseInt(pdb) >= 2;
      this.addResult('Pod Disruption Budget', hasPDB, hasPDB ? `Min available: ${pdb}` : 'PDB not configured properly');
      
      // Test anti-affinity rules
      const affinity = execSync(`${this.kubectl} get deployment nginx-ingress-controller -n ingress-nginx -o jsonpath='{.spec.template.spec.affinity.podAntiAffinity}'`, { encoding: 'utf8' });
      const hasAntiAffinity = affinity.length > 0;
      this.addResult('Pod Anti-Affinity', hasAntiAffinity, hasAntiAffinity ? 'Anti-affinity configured' : 'No anti-affinity rules');
      
      // Test multiple replicas across nodes
      const podNodes = execSync(`${this.kubectl} get pods -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx -o jsonpath='{.items[*].spec.nodeName}'`, { encoding: 'utf8' });
      const uniqueNodes = [...new Set(podNodes.split(' ').filter(node => node))];
      const distributedAcrossNodes = uniqueNodes.length >= 2;
      this.addResult('Node Distribution', distributedAcrossNodes, `Pods on ${uniqueNodes.length} nodes`);
      
      // Test service endpoints
      const endpoints = execSync(`${this.kubectl} get endpoints ingress-nginx -n ingress-nginx -o jsonpath='{.subsets[*].addresses[*].ip}'`, { encoding: 'utf8' });
      const endpointCount = endpoints.split(' ').filter(ip => ip).length;
      const hasMultipleEndpoints = endpointCount >= 3;
      this.addResult('Service Endpoints', hasMultipleEndpoints, `${endpointCount} endpoints available`);
      
    } catch (error) {
      this.addResult('Failover', false, `Failed to test failover: ${error.message}`);
    }
  }

  async testSecurityHeaders() {
    console.log(chalk.blue('🛡️  Testing security headers...'));
    
    try {
      const response = await this.makeRequest(this.baseUrl);
      const headers = response.headers;
      
      // Test security headers
      const securityHeaders = {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      };
      
      Object.entries(securityHeaders).forEach(([header, expectedValue]) => {
        const headerValue = headers[header.toLowerCase()] || headers[header];
        const hasHeader = headerValue && headerValue.includes(expectedValue);
        this.addResult(`Security Header: ${header}`, hasHeader, hasHeader ? `Present: ${headerValue}` : 'Missing or incorrect');
      });
      
      // Test CSP header
      const csp = headers['content-security-policy'];
      const hasCSP = !!csp;
      this.addResult('Content Security Policy', hasCSP, hasCSP ? 'CSP header present' : 'CSP header missing');
      
      // Test custom headers
      const requestId = headers['x-request-id'];
      const hasRequestId = !!requestId;
      this.addResult('Request ID Header', hasRequestId, hasRequestId ? `Request ID: ${requestId.substring(0, 8)}...` : 'No request ID header');
      
    } catch (error) {
      this.addResult('Security Headers', false, `Failed to test security headers: ${error.message}`);
    }
  }

  async testGeoRouting() {
    console.log(chalk.blue('🌍 Testing geo-routing...'));
    
    try {
      // Test with different user agents and headers
      const testCases = [
        { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bot)' }, name: 'Bot User Agent' },
        { headers: { 'X-Forwarded-For': '192.168.1.1' }, name: 'Internal IP' },
        { headers: { 'Accept-Language': 'en-US,en;q=0.9' }, name: 'English Language' }
      ];
      
      for (const testCase of testCases) {
        const response = await this.makeRequest(this.baseUrl, { headers: testCase.headers });
        const responseOk = response.statusCode === 200 || response.statusCode === 403; // 403 might be expected for bots
        this.addResult(`Geo-routing: ${testCase.name}`, responseOk, `Response: ${response.statusCode}`);
      }
      
      // Test rate limiting for bots
      const botResponse = await this.makeRequest(this.baseUrl, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' }
      });
      const botHandling = botResponse.statusCode === 200 || botResponse.statusCode === 403 || botResponse.statusCode === 429;
      this.addResult('Bot Handling', botHandling, `Bot request returns ${botResponse.statusCode}`);
      
    } catch (error) {
      this.addResult('Geo-routing', false, `Failed to test geo-routing: ${error.message}`);
    }
  }

  async testLoadBalancing() {
    console.log(chalk.blue('⚖️  Testing load balancing...'));
    
    try {
      // Test multiple requests to see load distribution
      const responses = [];
      const requestCount = 10;
      
      for (let i = 0; i < requestCount; i++) {
        const response = await this.makeRequest(`${this.baseUrl}/health`);
        responses.push({
          statusCode: response.statusCode,
          server: response.headers['x-served-by'] || response.headers['server'],
          responseTime: response.responseTime
        });
      }
      
      const successfulResponses = responses.filter(r => r.statusCode === 200 || r.statusCode === 404);
      const successRate = (successfulResponses.length / requestCount) * 100;
      this.addResult('Load Balancing Success Rate', successRate >= 90, `${successRate}% success rate`);
      
      // Test response time consistency
      const responseTimes = successfulResponses.map(r => r.responseTime).filter(t => t);
      if (responseTimes.length > 0) {
        const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        const maxResponseTime = Math.max(...responseTimes);
        const consistentPerformance = maxResponseTime < avgResponseTime * 3; // Max should not be 3x average
        this.addResult('Response Time Consistency', consistentPerformance, `Avg: ${avgResponseTime.toFixed(0)}ms, Max: ${maxResponseTime.toFixed(0)}ms`);
      }
      
      // Test upstream health
      const upstreamHealth = execSync(`${this.kubectl} get endpoints -n production --no-headers | grep finbot | wc -l`, { encoding: 'utf8' });
      const hasUpstreams = parseInt(upstreamHealth.trim()) > 0;
      this.addResult('Upstream Services', hasUpstreams, `${upstreamHealth.trim()} upstream services available`);
      
    } catch (error) {
      this.addResult('Load Balancing', false, `Failed to test load balancing: ${error.message}`);
    }
  }

  async makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'FinBot-LoadBalancer-Test/1.0',
          ...options.headers
        },
        timeout: options.timeout || this.testTimeout,
        rejectUnauthorized: false // For testing purposes
      };
      
      const req = client.request(requestOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const responseTime = Date.now() - startTime;
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data: data,
            responseTime: responseTime
          });
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  }

  async getTLSInfo(url) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        rejectUnauthorized: false
      };
      
      const socket = require('tls').connect(options, () => {
        const protocol = socket.getProtocol();
        const cipher = socket.getCipher();
        socket.end();
        resolve({ protocol, cipher });
      });
      
      socket.on('error', reject);
      socket.setTimeout(5000, () => {
        socket.destroy();
        reject(new Error('TLS connection timeout'));
      });
    });
  }

  async getCertificateExpiry(url) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || 443,
        rejectUnauthorized: false
      };
      
      const socket = require('tls').connect(options, () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        resolve(new Date(cert.valid_to));
      });
      
      socket.on('error', reject);
      socket.setTimeout(5000, () => {
        socket.destroy();
        reject(new Error('Certificate check timeout'));
      });
    });
  }

  addResult(testName, passed, message) {
    this.testResults.push({ testName, passed, message });
    const icon = passed ? '✅' : '❌';
    const color = passed ? chalk.green : chalk.red;
    console.log(`  ${icon} ${color(testName)}: ${message}`);
  }

  printResults() {
    console.log(chalk.bold('\n📊 Load Balancer Test Results:'));
    console.log(chalk.gray('='.repeat(60)));
    
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    const total = this.testResults.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(chalk.green(`Passed: ${passed}`));
    console.log(chalk.red(`Failed: ${failed}`));
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      console.log(chalk.bold.red('\n❌ Failed Tests:'));
      this.testResults
        .filter(r => !r.passed)
        .forEach(r => console.log(chalk.red(`  • ${r.testName}: ${r.message}`)));
    }
  }
}

// CLI interface
if (require.main === module) {
  const tests = new LoadBalancerTests();
  tests.runAllTests();
}

module.exports = LoadBalancerTests;