#!/usr/bin/env node

/**
 * FinBot v4 - Performance Regression Test Suite
 * Automated performance regression testing with baseline comparison
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');

// Configuration
const CONFIG = {
  // Performance thresholds
  thresholds: {
    responseTime: {
      p50: 500,   // 50th percentile < 500ms
      p95: 2000,  // 95th percentile < 2s
      p99: 5000,  // 99th percentile < 5s
    },
    throughput: {
      min: 100,   // Minimum requests per second
    },
    errorRate: {
      max: 0.05,  // Maximum 5% error rate
    },
    memoryUsage: {
      max: 512,   // Maximum 512MB memory usage
    },
    cpuUsage: {
      max: 80,    // Maximum 80% CPU usage
    }
  },
  
  // Test configuration
  testDuration: '2m',
  warmupDuration: '30s',
  baselineFile: 'tests/performance/baseline.json',
  resultsDir: 'tests/performance/results',
  
  // Regression detection
  regressionThreshold: 0.15, // 15% performance degradation
  improvementThreshold: 0.10, // 10% performance improvement
};

class PerformanceRegressionTest {
  constructor() {
    this.ensureDirectories();
    this.baseline = this.loadBaseline();
  }
  
  ensureDirectories() {
    if (!fs.existsSync(CONFIG.resultsDir)) {
      fs.mkdirSync(CONFIG.resultsDir, { recursive: true });
    }
  }
  
  loadBaseline() {
    if (fs.existsSync(CONFIG.baselineFile)) {
      try {
        return JSON.parse(fs.readFileSync(CONFIG.baselineFile, 'utf8'));
      } catch (error) {
        console.warn(chalk.yellow('Warning: Could not load baseline, will create new one'));
        return null;
      }
    }
    return null;
  }
  
  saveBaseline(results) {
    fs.writeFileSync(CONFIG.baselineFile, JSON.stringify(results, null, 2));
    console.log(chalk.green('✅ New baseline saved'));
  }
  
  async runLighthouseTest() {
    console.log(chalk.blue('🔍 Running Lighthouse performance audit...'));
    
    try {
      const lighthouseCmd = `npx lighthouse http://localhost:3000 --output=json --output-path=${CONFIG.resultsDir}/lighthouse-${Date.now()}.json --chrome-flags="--headless --no-sandbox" --quiet`;
      const result = execSync(lighthouseCmd, { encoding: 'utf8' });
      
      const reportPath = result.match(/Report saved to (.+\.json)/)?.[1];
      if (reportPath && fs.existsSync(reportPath)) {
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        return this.extractLighthouseMetrics(report);
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Lighthouse test failed:', error.message));
      return null;
    }
  }
  
  extractLighthouseMetrics(report) {
    const audits = report.audits;
    return {
      performanceScore: report.categories.performance.score * 100,
      firstContentfulPaint: audits['first-contentful-paint']?.numericValue || 0,
      largestContentfulPaint: audits['largest-contentful-paint']?.numericValue || 0,
      firstInputDelay: audits['max-potential-fid']?.numericValue || 0,
      cumulativeLayoutShift: audits['cumulative-layout-shift']?.numericValue || 0,
      speedIndex: audits['speed-index']?.numericValue || 0,
      totalBlockingTime: audits['total-blocking-time']?.numericValue || 0,
    };
  }
  
  async runK6LoadTest() {
    console.log(chalk.blue('⚡ Running k6 load test...'));
    
    try {
      const k6Cmd = `k6 run --duration=${CONFIG.testDuration} --vus=50 --out json=${CONFIG.resultsDir}/k6-results-${Date.now()}.json tests/performance/k6-load-test.js`;
      const result = execSync(k6Cmd, { encoding: 'utf8' });
      
      // Parse k6 output for metrics
      const lines = result.split('\n');
      const metrics = {};
      
      lines.forEach(line => {
        if (line.includes('http_req_duration')) {
          const match = line.match(/avg=([0-9.]+)ms.*p\\(95\\)=([0-9.]+)ms.*p\\(99\\)=([0-9.]+)ms/);
          if (match) {
            metrics.responseTime = {
              avg: parseFloat(match[1]),
              p95: parseFloat(match[2]),
              p99: parseFloat(match[3])
            };
          }
        }
        
        if (line.includes('http_reqs')) {
          const match = line.match(/([0-9.]+)\\/s/);
          if (match) {
            metrics.throughput = parseFloat(match[1]);
          }
        }
        
        if (line.includes('http_req_failed')) {
          const match = line.match/([0-9.]+)%/);
          if (match) {
            metrics.errorRate = parseFloat(match[1]) / 100;
          }
        }
      });
      
      return metrics;
    } catch (error) {
      console.warn(chalk.yellow('Warning: k6 load test failed:', error.message));
      return null;
    }
  }
  
  async runArtilleryTest() {
    console.log(chalk.blue('🎯 Running Artillery load test...'));
    
    try {
      const artilleryCmd = `npx artillery run tests/performance/load-test.yml --output ${CONFIG.resultsDir}/artillery-${Date.now()}.json`;
      const result = execSync(artilleryCmd, { encoding: 'utf8' });
      
      // Parse Artillery output
      const lines = result.split('\n');
      const metrics = {};
      
      lines.forEach(line => {
        if (line.includes('Response time')) {
          const match = line.match(/min: ([0-9.]+).*median: ([0-9.]+).*p95: ([0-9.]+).*p99: ([0-9.]+)/);
          if (match) {
            metrics.responseTime = {
              min: parseFloat(match[1]),
              median: parseFloat(match[2]),
              p95: parseFloat(match[3]),
              p99: parseFloat(match[4])
            };
          }
        }
        
        if (line.includes('Requests/sec')) {
          const match = line.match(/([0-9.]+)/);
          if (match) {
            metrics.throughput = parseFloat(match[1]);
          }
        }
      });
      
      return metrics;
    } catch (error) {
      console.warn(chalk.yellow('Warning: Artillery test failed:', error.message));
      return null;
    }
  }
  
  async measureResourceUsage() {
    console.log(chalk.blue('📊 Measuring resource usage...'));
    
    try {
      // Get memory usage
      const memoryCmd = process.platform === 'win32' 
        ? 'wmic process where "name=\'node.exe\'" get WorkingSetSize /value'
        : 'ps -o pid,rss -p $(pgrep -f "node.*server")';
      
      const memoryResult = execSync(memoryCmd, { encoding: 'utf8' });
      
      // Get CPU usage (simplified)
      const cpuCmd = process.platform === 'win32'
        ? 'wmic cpu get loadpercentage /value'
        : 'top -bn1 | grep "Cpu(s)" | awk \'{print $2}\' | cut -d\'%\' -f1';
      
      const cpuResult = execSync(cpuCmd, { encoding: 'utf8' });
      
      return {
        memoryUsage: this.parseMemoryUsage(memoryResult),
        cpuUsage: this.parseCpuUsage(cpuResult)
      };
    } catch (error) {
      console.warn(chalk.yellow('Warning: Resource usage measurement failed:', error.message));
      return { memoryUsage: 0, cpuUsage: 0 };
    }
  }
  
  parseMemoryUsage(output) {
    // Simplified memory parsing - would need platform-specific implementation
    const match = output.match(/([0-9]+)/);
    return match ? parseInt(match[1]) / 1024 / 1024 : 0; // Convert to MB
  }
  
  parseCpuUsage(output) {
    // Simplified CPU parsing - would need platform-specific implementation
    const match = output.match(/([0-9.]+)/);
    return match ? parseFloat(match[1]) : 0;
  }
  
  compareWithBaseline(current) {
    if (!this.baseline) {
      return { status: 'baseline', regressions: [], improvements: [] };
    }
    
    const regressions = [];
    const improvements = [];
    
    // Compare response times
    if (current.responseTime && this.baseline.responseTime) {
      const p95Change = (current.responseTime.p95 - this.baseline.responseTime.p95) / this.baseline.responseTime.p95;
      if (p95Change > CONFIG.regressionThreshold) {
        regressions.push({
          metric: 'Response Time P95',
          current: current.responseTime.p95,
          baseline: this.baseline.responseTime.p95,
          change: p95Change * 100
        });
      } else if (p95Change < -CONFIG.improvementThreshold) {
        improvements.push({
          metric: 'Response Time P95',
          current: current.responseTime.p95,
          baseline: this.baseline.responseTime.p95,
          change: p95Change * 100
        });
      }
    }
    
    // Compare throughput
    if (current.throughput && this.baseline.throughput) {
      const throughputChange = (current.throughput - this.baseline.throughput) / this.baseline.throughput;
      if (throughputChange < -CONFIG.regressionThreshold) {
        regressions.push({
          metric: 'Throughput',
          current: current.throughput,
          baseline: this.baseline.throughput,
          change: throughputChange * 100
        });
      } else if (throughputChange > CONFIG.improvementThreshold) {
        improvements.push({
          metric: 'Throughput',
          current: current.throughput,
          baseline: this.baseline.throughput,
          change: throughputChange * 100
        });
      }
    }
    
    // Compare Lighthouse score
    if (current.lighthouse && this.baseline.lighthouse) {
      const scoreChange = (current.lighthouse.performanceScore - this.baseline.lighthouse.performanceScore) / this.baseline.lighthouse.performanceScore;
      if (scoreChange < -CONFIG.regressionThreshold) {
        regressions.push({
          metric: 'Lighthouse Performance Score',
          current: current.lighthouse.performanceScore,
          baseline: this.baseline.lighthouse.performanceScore,
          change: scoreChange * 100
        });
      } else if (scoreChange > CONFIG.improvementThreshold) {
        improvements.push({
          metric: 'Lighthouse Performance Score',
          current: current.lighthouse.performanceScore,
          baseline: this.baseline.lighthouse.performanceScore,
          change: scoreChange * 100
        });
      }
    }
    
    const status = regressions.length > 0 ? 'regression' : 
                   improvements.length > 0 ? 'improvement' : 'stable';
    
    return { status, regressions, improvements };
  }
  
  checkThresholds(results) {
    const violations = [];
    
    // Check response time thresholds
    if (results.responseTime) {
      if (results.responseTime.p95 > CONFIG.thresholds.responseTime.p95) {
        violations.push({
          metric: 'Response Time P95',
          current: results.responseTime.p95,
          threshold: CONFIG.thresholds.responseTime.p95,
          message: `P95 response time (${results.responseTime.p95}ms) exceeds threshold (${CONFIG.thresholds.responseTime.p95}ms)`
        });
      }
      
      if (results.responseTime.p99 > CONFIG.thresholds.responseTime.p99) {
        violations.push({
          metric: 'Response Time P99',
          current: results.responseTime.p99,
          threshold: CONFIG.thresholds.responseTime.p99,
          message: `P99 response time (${results.responseTime.p99}ms) exceeds threshold (${CONFIG.thresholds.responseTime.p99}ms)`
        });
      }
    }
    
    // Check throughput threshold
    if (results.throughput && results.throughput < CONFIG.thresholds.throughput.min) {
      violations.push({
        metric: 'Throughput',
        current: results.throughput,
        threshold: CONFIG.thresholds.throughput.min,
        message: `Throughput (${results.throughput} req/s) below threshold (${CONFIG.thresholds.throughput.min} req/s)`
      });
    }
    
    // Check error rate threshold
    if (results.errorRate && results.errorRate > CONFIG.thresholds.errorRate.max) {
      violations.push({
        metric: 'Error Rate',
        current: results.errorRate * 100,
        threshold: CONFIG.thresholds.errorRate.max * 100,
        message: `Error rate (${(results.errorRate * 100).toFixed(1)}%) exceeds threshold (${(CONFIG.thresholds.errorRate.max * 100).toFixed(1)}%)`
      });
    }
    
    return violations;
  }
  
  generateReport(results, comparison, violations) {
    const report = {
      timestamp: new Date().toISOString(),
      commit: this.getGitCommit(),
      branch: this.getGitBranch(),
      results: results,
      comparison: comparison,
      violations: violations,
      summary: {
        status: violations.length > 0 ? 'failed' : comparison.status,
        regressionCount: comparison.regressions?.length || 0,
        improvementCount: comparison.improvements?.length || 0,
        violationCount: violations.length
      }
    };
    
    // Save report
    const reportFile = path.join(CONFIG.resultsDir, `regression-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    return report;
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
  
  printReport(report) {
    console.log('\n' + chalk.bold('🔍 Performance Regression Test Report'));
    console.log(chalk.gray('='.repeat(60)));
    
    // Summary
    console.log(chalk.bold('\n📊 Summary:'));
    console.log(`  Status: ${this.getStatusIcon(report.summary.status)} ${report.summary.status.toUpperCase()}`);
    console.log(`  Commit: ${report.commit.substring(0, 8)}`);
    console.log(`  Branch: ${report.branch}`);
    console.log(`  Regressions: ${report.summary.regressionCount}`);
    console.log(`  Improvements: ${report.summary.improvementCount}`);
    console.log(`  Violations: ${report.summary.violationCount}`);
    
    // Results
    if (report.results.lighthouse) {
      console.log(chalk.bold('\n🔍 Lighthouse Results:'));
      console.log(`  Performance Score: ${report.results.lighthouse.performanceScore.toFixed(1)}/100`);
      console.log(`  First Contentful Paint: ${report.results.lighthouse.firstContentfulPaint.toFixed(0)}ms`);
      console.log(`  Largest Contentful Paint: ${report.results.lighthouse.largestContentfulPaint.toFixed(0)}ms`);
    }
    
    if (report.results.responseTime) {
      console.log(chalk.bold('\n⚡ Load Test Results:'));
      console.log(`  Response Time P95: ${report.results.responseTime.p95.toFixed(0)}ms`);
      console.log(`  Response Time P99: ${report.results.responseTime.p99.toFixed(0)}ms`);
      console.log(`  Throughput: ${report.results.throughput?.toFixed(1) || 'N/A'} req/s`);
      console.log(`  Error Rate: ${((report.results.errorRate || 0) * 100).toFixed(2)}%`);
    }
    
    // Regressions
    if (report.comparison.regressions?.length > 0) {
      console.log(chalk.bold.red('\n📉 Performance Regressions:'));
      report.comparison.regressions.forEach(regression => {
        console.log(chalk.red(`  ❌ ${regression.metric}: ${regression.change.toFixed(1)}% slower`));
        console.log(chalk.gray(`     Current: ${regression.current}, Baseline: ${regression.baseline}`));
      });
    }
    
    // Improvements
    if (report.comparison.improvements?.length > 0) {
      console.log(chalk.bold.green('\n📈 Performance Improvements:'));
      report.comparison.improvements.forEach(improvement => {
        console.log(chalk.green(`  ✅ ${improvement.metric}: ${Math.abs(improvement.change).toFixed(1)}% better`));
        console.log(chalk.gray(`     Current: ${improvement.current}, Baseline: ${improvement.baseline}`));
      });
    }
    
    // Violations
    if (report.violations.length > 0) {
      console.log(chalk.bold.red('\n🚨 Threshold Violations:'));
      report.violations.forEach(violation => {
        console.log(chalk.red(`  ❌ ${violation.message}`));
      });
    }
    
    console.log(chalk.gray('\n' + '='.repeat(60)));
  }
  
  getStatusIcon(status) {
    const icons = {
      'passed': '✅',
      'failed': '❌',
      'regression': '📉',
      'improvement': '📈',
      'stable': '➡️',
      'baseline': '📏'
    };
    return icons[status] || '❓';
  }
  
  async run(options = {}) {
    try {
      console.log(chalk.bold('🚀 Starting performance regression test...\n'));
      
      const results = {};
      
      // Run Lighthouse test
      if (!options.skipLighthouse) {
        results.lighthouse = await this.runLighthouseTest();
      }
      
      // Run load tests
      if (!options.skipLoadTest) {
        const k6Results = await this.runK6LoadTest();
        const artilleryResults = await this.runArtilleryTest();
        
        // Combine results (prefer k6, fallback to artillery)
        results.responseTime = k6Results?.responseTime || artilleryResults?.responseTime;
        results.throughput = k6Results?.throughput || artilleryResults?.throughput;
        results.errorRate = k6Results?.errorRate || 0;
      }
      
      // Measure resource usage
      if (!options.skipResourceCheck) {
        const resourceUsage = await this.measureResourceUsage();
        results.memoryUsage = resourceUsage.memoryUsage;
        results.cpuUsage = resourceUsage.cpuUsage;
      }
      
      // Compare with baseline
      const comparison = this.compareWithBaseline(results);
      
      // Check thresholds
      const violations = this.checkThresholds(results);
      
      // Generate report
      const report = this.generateReport(results, comparison, violations);
      this.printReport(report);
      
      // Update baseline if requested or if this is the first run
      if (options.updateBaseline || !this.baseline) {
        this.saveBaseline(results);
      }
      
      // Exit with appropriate code
      if (violations.length > 0) {
        console.log(chalk.red('\n❌ Performance regression test failed due to threshold violations'));
        process.exit(1);
      } else if (comparison.status === 'regression') {
        console.log(chalk.red('\n❌ Performance regression detected'));
        process.exit(1);
      } else {
        console.log(chalk.green('\n✅ Performance regression test passed'));
        process.exit(0);
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Performance regression test failed:'), error.message);
      process.exit(1);
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    updateBaseline: args.includes('--update-baseline'),
    skipLighthouse: args.includes('--skip-lighthouse'),
    skipLoadTest: args.includes('--skip-load-test'),
    skipResourceCheck: args.includes('--skip-resource-check'),
  };
  
  const test = new PerformanceRegressionTest();
  test.run(options);
}

module.exports = PerformanceRegressionTest;