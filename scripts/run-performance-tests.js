#!/usr/bin/env node

/**
 * FinBot v4 - Performance Test Runner
 * Orchestrates all performance tests and generates comprehensive reports
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const chalk = require('chalk');

// Configuration
const CONFIG = {
  // Test types
  tests: {
    lighthouse: {
      enabled: true,
      command: 'npx lighthouse http://localhost:3000 --output=json --chrome-flags="--headless --no-sandbox"',
      timeout: 120000, // 2 minutes
    },
    k6: {
      enabled: true,
      command: 'k6 run tests/performance/k6-load-test.js',
      timeout: 300000, // 5 minutes
    },
    artillery: {
      enabled: true,
      command: 'npx artillery run tests/performance/load-test.yml',
      timeout: 600000, // 10 minutes
    },
    bundleSize: {
      enabled: true,
      command: 'node scripts/bundle-size-monitor.js',
      timeout: 60000, // 1 minute
    },
    regression: {
      enabled: true,
      command: 'node tests/performance/regression-test.js',
      timeout: 900000, // 15 minutes
    }
  },
  
  // Paths
  resultsDir: 'tests/performance/results',
  reportsDir: 'tests/performance/reports',
  
  // Server configuration
  server: {
    command: 'npm run dev',
    port: 3000,
    healthCheck: '/api/health',
    startupTimeout: 30000, // 30 seconds
  },
  
  // Parallel execution
  maxConcurrentTests: 2,
};

class PerformanceTestRunner {
  constructor() {
    this.results = {};
    this.serverProcess = null;
    this.ensureDirectories();
  }
  
  ensureDirectories() {
    [CONFIG.resultsDir, CONFIG.reportsDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }
  
  async startServer() {
    console.log(chalk.blue('🚀 Starting development server...'));
    
    return new Promise((resolve, reject) => {
      this.serverProcess = spawn('npm', ['run', 'dev'], {
        stdio: 'pipe',
        shell: true,
        cwd: process.cwd()
      });
      
      let output = '';
      this.serverProcess.stdout.on('data', (data) => {
        output += data.toString();
        if (output.includes('ready') || output.includes('listening') || output.includes(`${CONFIG.server.port}`)) {
          setTimeout(() => this.checkServerHealth(resolve, reject), 2000);
        }
      });
      
      this.serverProcess.stderr.on('data', (data) => {
        console.log(chalk.gray(data.toString()));
      });
      
      this.serverProcess.on('error', (error) => {
        reject(new Error(`Failed to start server: ${error.message}`));
      });
      
      // Timeout fallback
      setTimeout(() => {
        this.checkServerHealth(resolve, reject);
      }, CONFIG.server.startupTimeout);
    });
  }
  
  async checkServerHealth(resolve, reject) {
    try {
      const healthUrl = `http://localhost:${CONFIG.server.port}${CONFIG.server.healthCheck}`;
      const response = await fetch(healthUrl);
      
      if (response.ok) {
        console.log(chalk.green('✅ Server is ready'));
        resolve();
      } else {
        throw new Error(`Health check failed: ${response.status}`);
      }
    } catch (error) {
      // Try basic port check
      try {
        const response = await fetch(`http://localhost:${CONFIG.server.port}`);
        console.log(chalk.green('✅ Server is ready (basic check)'));
        resolve();
      } catch (portError) {
        reject(new Error(`Server health check failed: ${error.message}`));
      }
    }
  }
  
  stopServer() {
    if (this.serverProcess) {
      console.log(chalk.blue('🛑 Stopping development server...'));
      this.serverProcess.kill('SIGTERM');
      
      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          this.serverProcess.kill('SIGKILL');
        }
      }, 5000);
    }
  }
  
  async runTest(testName, testConfig) {
    console.log(chalk.blue(`🧪 Running ${testName} test...`));
    
    const startTime = Date.now();
    
    try {
      const result = await this.executeCommand(testConfig.command, testConfig.timeout);
      const duration = Date.now() - startTime;
      
      const testResult = {
        name: testName,
        status: 'passed',
        duration: duration,
        output: result.stdout,
        error: null,
        timestamp: new Date().toISOString()
      };
      
      console.log(chalk.green(`✅ ${testName} test completed in ${(duration / 1000).toFixed(1)}s`));
      return testResult;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      const testResult = {
        name: testName,
        status: 'failed',
        duration: duration,
        output: error.stdout || '',
        error: error.message,
        timestamp: new Date().toISOString()
      };
      
      console.log(chalk.red(`❌ ${testName} test failed after ${(duration / 1000).toFixed(1)}s`));
      console.log(chalk.red(`   Error: ${error.message}`));
      
      return testResult;
    }
  }
  
  executeCommand(command, timeout) {
    return new Promise((resolve, reject) => {
      const child = execSync(command, {
        encoding: 'utf8',
        timeout: timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });
      
      resolve({ stdout: child });
    }).catch(error => {
      reject({
        message: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || ''
      });
    });
  }
  
  async runTestsSequentially() {
    const results = [];
    
    for (const [testName, testConfig] of Object.entries(CONFIG.tests)) {
      if (testConfig.enabled) {
        const result = await this.runTest(testName, testConfig);
        results.push(result);
        
        // Short delay between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    return results;
  }
  
  async runTestsInParallel() {
    const testEntries = Object.entries(CONFIG.tests).filter(([, config]) => config.enabled);
    const results = [];
    
    // Run tests in batches
    for (let i = 0; i < testEntries.length; i += CONFIG.maxConcurrentTests) {
      const batch = testEntries.slice(i, i + CONFIG.maxConcurrentTests);
      
      console.log(chalk.blue(`🔄 Running batch ${Math.floor(i / CONFIG.maxConcurrentTests) + 1}...`));
      
      const batchPromises = batch.map(([testName, testConfig]) => 
        this.runTest(testName, testConfig)
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Delay between batches
      if (i + CONFIG.maxConcurrentTests < testEntries.length) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    return results;
  }
  
  generateSummaryReport(results) {
    const summary = {
      timestamp: new Date().toISOString(),
      commit: this.getGitCommit(),
      branch: this.getGitBranch(),
      totalTests: results.length,
      passedTests: results.filter(r => r.status === 'passed').length,
      failedTests: results.filter(r => r.status === 'failed').length,
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
      results: results
    };
    
    // Save detailed report
    const reportFile = path.join(CONFIG.reportsDir, `performance-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(summary, null, 2));
    
    return summary;
  }
  
  getGitCommit() {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch (error) {
      return 'unknown';
    }
  }
  
  getGitBranch() {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    } catch (error) {
      return 'unknown';
    }
  }
  
  printSummaryReport(summary) {
    console.log('\n' + chalk.bold('📊 Performance Test Summary Report'));
    console.log(chalk.gray('='.repeat(60)));
    
    // Overview
    console.log(chalk.bold('\n📈 Overview:'));
    console.log(`  Total Tests: ${summary.totalTests}`);
    console.log(`  Passed: ${chalk.green(summary.passedTests)}`);
    console.log(`  Failed: ${chalk.red(summary.failedTests)}`);
    console.log(`  Success Rate: ${((summary.passedTests / summary.totalTests) * 100).toFixed(1)}%`);
    console.log(`  Total Duration: ${(summary.totalDuration / 1000 / 60).toFixed(1)} minutes`);
    console.log(`  Commit: ${summary.commit.substring(0, 8)}`);
    console.log(`  Branch: ${summary.branch}`);
    
    // Test Results
    console.log(chalk.bold('\n🧪 Test Results:'));
    summary.results.forEach(result => {
      const statusIcon = result.status === 'passed' ? '✅' : '❌';
      const statusColor = result.status === 'passed' ? chalk.green : chalk.red;
      const duration = (result.duration / 1000).toFixed(1);
      
      console.log(`  ${statusIcon} ${statusColor(result.name.padEnd(15))} ${duration}s`);
      
      if (result.error) {
        console.log(chalk.red(`     Error: ${result.error.substring(0, 100)}...`));
      }
    });
    
    // Performance Insights
    console.log(chalk.bold('\n💡 Performance Insights:'));
    
    const lighthouseResult = summary.results.find(r => r.name === 'lighthouse');
    if (lighthouseResult && lighthouseResult.status === 'passed') {
      console.log('  🔍 Lighthouse audit completed successfully');
    }
    
    const loadTestResult = summary.results.find(r => r.name === 'k6' || r.name === 'artillery');
    if (loadTestResult && loadTestResult.status === 'passed') {
      console.log('  ⚡ Load testing completed successfully');
    }
    
    const bundleResult = summary.results.find(r => r.name === 'bundleSize');
    if (bundleResult && bundleResult.status === 'passed') {
      console.log('  📦 Bundle size analysis passed');
    }
    
    const regressionResult = summary.results.find(r => r.name === 'regression');
    if (regressionResult && regressionResult.status === 'passed') {
      console.log('  📊 No performance regressions detected');
    }
    
    // Recommendations
    const failedTests = summary.results.filter(r => r.status === 'failed');
    if (failedTests.length > 0) {
      console.log(chalk.bold.red('\n⚠️  Recommendations:'));
      failedTests.forEach(test => {
        console.log(chalk.red(`  • Review ${test.name} test failure and address issues`));
      });
    }
    
    console.log(chalk.gray('\n' + '='.repeat(60)));
  }
  
  async run(options = {}) {
    const startTime = Date.now();
    
    try {
      console.log(chalk.bold('🚀 Starting FinBot v4 Performance Test Suite\n'));
      
      // Start server if needed
      if (!options.skipServer) {
        await this.startServer();
      }
      
      // Run tests
      const results = options.parallel 
        ? await this.runTestsInParallel()
        : await this.runTestsSequentially();
      
      // Generate and display report
      const summary = this.generateSummaryReport(results);
      this.printSummaryReport(summary);
      
      const totalDuration = Date.now() - startTime;
      console.log(chalk.blue(`\n🏁 Performance test suite completed in ${(totalDuration / 1000 / 60).toFixed(1)} minutes`));
      
      // Exit with appropriate code
      const hasFailures = summary.failedTests > 0;
      if (hasFailures) {
        console.log(chalk.red('\n❌ Performance test suite failed'));
        process.exit(1);
      } else {
        console.log(chalk.green('\n✅ Performance test suite passed'));
        process.exit(0);
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Performance test suite failed:'), error.message);
      process.exit(1);
    } finally {
      // Always stop server
      this.stopServer();
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    parallel: args.includes('--parallel'),
    skipServer: args.includes('--skip-server'),
  };
  
  // Handle specific test selection
  const testArg = args.find(arg => arg.startsWith('--test='));
  if (testArg) {
    const testName = testArg.split('=')[1];
    Object.keys(CONFIG.tests).forEach(test => {
      CONFIG.tests[test].enabled = test === testName;
    });
  }
  
  const runner = new PerformanceTestRunner();
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n⚠️  Received SIGINT, shutting down gracefully...'));
    runner.stopServer();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log(chalk.yellow('\n⚠️  Received SIGTERM, shutting down gracefully...'));
    runner.stopServer();
    process.exit(0);
  });
  
  runner.run(options);
}

module.exports = PerformanceTestRunner;