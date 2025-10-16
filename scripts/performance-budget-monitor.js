#!/usr/bin/env node

/**
 * FinBot v4 - Performance Budget Monitor
 * Monitors performance metrics against defined budgets and sends alerts
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');

// Configuration
const CONFIG = {
  budgetFile: 'monitoring/performance-budgets.json',
  historyFile: 'monitoring/performance-history.json',
  reportsDir: 'monitoring/budget-reports',
  maxHistoryEntries: 100,
};

class PerformanceBudgetMonitor {
  constructor() {
    this.budgets = this.loadBudgets();
    this.history = this.loadHistory();
    this.ensureDirectories();
  }
  
  ensureDirectories() {
    if (!fs.existsSync(CONFIG.reportsDir)) {
      fs.mkdirSync(CONFIG.reportsDir, { recursive: true });
    }
  }
  
  loadBudgets() {
    if (!fs.existsSync(CONFIG.budgetFile)) {
      throw new Error(`Budget file not found: ${CONFIG.budgetFile}`);
    }
    
    try {
      return JSON.parse(fs.readFileSync(CONFIG.budgetFile, 'utf8'));
    } catch (error) {
      throw new Error(`Failed to parse budget file: ${error.message}`);
    }
  }
  
  loadHistory() {
    if (fs.existsSync(CONFIG.historyFile)) {
      try {
        return JSON.parse(fs.readFileSync(CONFIG.historyFile, 'utf8'));
      } catch (error) {
        console.warn(chalk.yellow('Warning: Could not load performance history, starting fresh'));
        return [];
      }
    }
    return [];
  }
  
  saveHistory() {
    // Keep only the last N entries
    if (this.history.length > CONFIG.maxHistoryEntries) {
      this.history = this.history.slice(-CONFIG.maxHistoryEntries);
    }
    
    fs.writeFileSync(CONFIG.historyFile, JSON.stringify(this.history, null, 2));
  }
  
  async collectMetrics() {
    console.log(chalk.blue('📊 Collecting performance metrics...'));
    
    const metrics = {
      timestamp: new Date().toISOString(),
      commit: this.getGitCommit(),
      branch: this.getGitBranch(),
      lighthouse: await this.collectLighthouseMetrics(),
      bundleSize: await this.collectBundleSizeMetrics(),
      apiPerformance: await this.collectApiMetrics(),
      resourceUsage: await this.collectResourceMetrics(),
    };
    
    return metrics;
  }
  
  async collectLighthouseMetrics() {
    try {
      console.log(chalk.gray('  🔍 Running Lighthouse audit...'));
      
      const lighthouseCmd = `npx lighthouse http://localhost:3000 --output=json --chrome-flags="--headless --no-sandbox" --quiet`;
      const result = execSync(lighthouseCmd, { encoding: 'utf8', timeout: 120000 });
      
      // Parse Lighthouse output to get JSON file path
      const jsonMatch = result.match(/Report saved to (.+\.json)/);
      if (jsonMatch && fs.existsSync(jsonMatch[1])) {
        const report = JSON.parse(fs.readFileSync(jsonMatch[1], 'utf8'));
        
        return {
          performanceScore: report.categories.performance.score * 100,
          firstContentfulPaint: report.audits['first-contentful-paint']?.numericValue || 0,
          largestContentfulPaint: report.audits['largest-contentful-paint']?.numericValue || 0,
          firstInputDelay: report.audits['max-potential-fid']?.numericValue || 0,
          cumulativeLayoutShift: report.audits['cumulative-layout-shift']?.numericValue || 0,
          speedIndex: report.audits['speed-index']?.numericValue || 0,
          totalBlockingTime: report.audits['total-blocking-time']?.numericValue || 0,
          timeToInteractive: report.audits['interactive']?.numericValue || 0,
        };
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Lighthouse metrics collection failed:', error.message));
      return null;
    }
  }
  
  async collectBundleSizeMetrics() {
    try {
      console.log(chalk.gray('  📦 Analyzing bundle size...'));
      
      const buildDir = 'finbotv3/QuickServeAPI/client/dist';
      if (!fs.existsSync(buildDir)) {
        console.warn(chalk.yellow('Warning: Build directory not found, skipping bundle analysis'));
        return null;
      }
      
      const files = fs.readdirSync(buildDir);
      const jsFiles = files.filter(f => f.endsWith('.js'));
      const cssFiles = files.filter(f => f.endsWith('.css'));
      
      let totalSize = 0;
      let scriptSize = 0;
      let styleSize = 0;
      
      jsFiles.forEach(file => {
        const size = fs.statSync(path.join(buildDir, file)).size;
        scriptSize += size;
        totalSize += size;
      });
      
      cssFiles.forEach(file => {
        const size = fs.statSync(path.join(buildDir, file)).size;
        styleSize += size;
        totalSize += size;
      });
      
      return {
        totalSize: Math.round(totalSize / 1024), // KB
        scriptSize: Math.round(scriptSize / 1024), // KB
        styleSize: Math.round(styleSize / 1024), // KB
        scriptCount: jsFiles.length,
        styleCount: cssFiles.length,
      };
    } catch (error) {
      console.warn(chalk.yellow('Warning: Bundle size collection failed:', error.message));
      return null;
    }
  }
  
  async collectApiMetrics() {
    try {
      console.log(chalk.gray('  ⚡ Testing API performance...'));
      
      const baseUrl = 'http://localhost:3001';
      const endpoints = [
        '/api/health',
        '/api/approval-workflows',
        '/api/approval-rules',
      ];
      
      const results = {};
      
      for (const endpoint of endpoints) {
        const startTime = Date.now();
        try {
          const response = await fetch(`${baseUrl}${endpoint}`);
          const endTime = Date.now();
          
          results[endpoint] = {
            responseTime: endTime - startTime,
            status: response.status,
            success: response.ok,
          };
        } catch (error) {
          results[endpoint] = {
            responseTime: -1,
            status: 0,
            success: false,
            error: error.message,
          };
        }
      }
      
      // Calculate averages
      const successfulRequests = Object.values(results).filter(r => r.success);
      const avgResponseTime = successfulRequests.length > 0 
        ? successfulRequests.reduce((sum, r) => sum + r.responseTime, 0) / successfulRequests.length
        : -1;
      
      return {
        endpoints: results,
        averageResponseTime: avgResponseTime,
        successRate: successfulRequests.length / Object.keys(results).length,
      };
    } catch (error) {
      console.warn(chalk.yellow('Warning: API metrics collection failed:', error.message));
      return null;
    }
  }
  
  async collectResourceMetrics() {
    try {
      console.log(chalk.gray('  💾 Collecting resource usage...'));
      
      // Simple memory and CPU usage collection
      const memoryUsage = process.memoryUsage();
      
      return {
        memoryUsage: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.warn(chalk.yellow('Warning: Resource metrics collection failed:', error.message));
      return null;
    }
  }
  
  checkBudgets(metrics) {
    const violations = [];
    const warnings = [];
    
    this.budgets.budgets.forEach(budget => {
      // Check timing budgets
      if (budget.timings && metrics.lighthouse) {
        budget.timings.forEach(timing => {
          const metricValue = this.getMetricValue(metrics.lighthouse, timing.metric);
          if (metricValue !== null) {
            const budgetValue = timing.budget;
            const tolerance = timing.tolerance || 0;
            
            if (metricValue > budgetValue + tolerance) {
              violations.push({
                type: 'timing',
                path: budget.path,
                metric: timing.metric,
                value: metricValue,
                budget: budgetValue,
                tolerance: tolerance,
                exceedBy: metricValue - budgetValue,
                exceedByPercent: ((metricValue - budgetValue) / budgetValue) * 100,
              });
            } else if (metricValue > budgetValue) {
              warnings.push({
                type: 'timing',
                path: budget.path,
                metric: timing.metric,
                value: metricValue,
                budget: budgetValue,
                tolerance: tolerance,
                exceedBy: metricValue - budgetValue,
                exceedByPercent: ((metricValue - budgetValue) / budgetValue) * 100,
              });
            }
          }
        });
      }
      
      // Check resource size budgets
      if (budget.resourceSizes && metrics.bundleSize) {
        budget.resourceSizes.forEach(resource => {
          const metricValue = this.getBundleMetricValue(metrics.bundleSize, resource.resourceType);
          if (metricValue !== null) {
            const budgetValue = resource.budget;
            const tolerance = resource.tolerance || 0;
            
            if (metricValue > budgetValue + tolerance) {
              violations.push({
                type: 'resource-size',
                path: budget.path,
                metric: resource.resourceType,
                value: metricValue,
                budget: budgetValue,
                tolerance: tolerance,
                exceedBy: metricValue - budgetValue,
                exceedByPercent: ((metricValue - budgetValue) / budgetValue) * 100,
              });
            } else if (metricValue > budgetValue) {
              warnings.push({
                type: 'resource-size',
                path: budget.path,
                metric: resource.resourceType,
                value: metricValue,
                budget: budgetValue,
                tolerance: tolerance,
                exceedBy: metricValue - budgetValue,
                exceedByPercent: ((metricValue - budgetValue) / budgetValue) * 100,
              });
            }
          }
        });
      }
    });
    
    return { violations, warnings };
  }
  
  getMetricValue(lighthouse, metric) {
    const metricMap = {
      'first-contentful-paint': lighthouse.firstContentfulPaint,
      'largest-contentful-paint': lighthouse.largestContentfulPaint,
      'first-input-delay': lighthouse.firstInputDelay,
      'cumulative-layout-shift': lighthouse.cumulativeLayoutShift,
      'speed-index': lighthouse.speedIndex,
      'total-blocking-time': lighthouse.totalBlockingTime,
      'time-to-interactive': lighthouse.timeToInteractive,
    };
    
    return metricMap[metric] || null;
  }
  
  getBundleMetricValue(bundleSize, resourceType) {
    const metricMap = {
      'script': bundleSize.scriptSize,
      'stylesheet': bundleSize.styleSize,
      'total': bundleSize.totalSize,
    };
    
    return metricMap[resourceType] || null;
  }
  
  async sendAlerts(violations, warnings, metrics) {
    if (violations.length === 0 && warnings.length === 0) {
      return;
    }
    
    console.log(chalk.blue('📢 Sending performance alerts...'));
    
    const alertData = {
      timestamp: new Date().toISOString(),
      commit: metrics.commit,
      branch: metrics.branch,
      violations: violations,
      warnings: warnings,
      summary: {
        totalViolations: violations.length,
        totalWarnings: warnings.length,
        criticalIssues: violations.filter(v => v.exceedByPercent > 50).length,
      }
    };
    
    // Send to configured channels
    for (const channel of this.budgets.alerts.channels) {
      if (channel.enabled) {
        try {
          await this.sendAlert(channel, alertData);
        } catch (error) {
          console.warn(chalk.yellow(`Warning: Failed to send alert to ${channel.type}:`, error.message));
        }
      }
    }
  }
  
  async sendAlert(channel, alertData) {
    switch (channel.type) {
      case 'slack':
        await this.sendSlackAlert(channel, alertData);
        break;
      case 'email':
        await this.sendEmailAlert(channel, alertData);
        break;
      case 'github':
        await this.sendGitHubAlert(channel, alertData);
        break;
      default:
        console.warn(chalk.yellow(`Unknown alert channel type: ${channel.type}`));
    }
  }
  
  async sendSlackAlert(channel, alertData) {
    if (!process.env.SLACK_WEBHOOK_URL) {
      console.warn(chalk.yellow('SLACK_WEBHOOK_URL not configured, skipping Slack alert'));
      return;
    }
    
    const message = this.formatSlackMessage(alertData);
    
    try {
      const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      
      if (response.ok) {
        console.log(chalk.green('✅ Slack alert sent successfully'));
      } else {
        throw new Error(`Slack API error: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Failed to send Slack alert: ${error.message}`);
    }
  }
  
  formatSlackMessage(alertData) {
    const emoji = alertData.summary.criticalIssues > 0 ? '🚨' : '⚠️';
    const color = alertData.summary.criticalIssues > 0 ? 'danger' : 'warning';
    
    return {
      text: `${emoji} FinBot v4 Performance Budget Alert`,
      attachments: [
        {
          color: color,
          fields: [
            {
              title: 'Summary',
              value: `Violations: ${alertData.summary.totalViolations}\nWarnings: ${alertData.summary.totalWarnings}\nCritical: ${alertData.summary.criticalIssues}`,
              short: true
            },
            {
              title: 'Commit',
              value: `${alertData.commit.substring(0, 8)} (${alertData.branch})`,
              short: true
            }
          ],
          footer: 'FinBot Performance Monitor',
          ts: Math.floor(Date.now() / 1000)
        }
      ]
    };
  }
  
  async sendEmailAlert(channel, alertData) {
    console.log(chalk.gray('📧 Email alerts not implemented yet'));
  }
  
  async sendGitHubAlert(channel, alertData) {
    console.log(chalk.gray('🐙 GitHub alerts not implemented yet'));
  }
  
  generateReport(metrics, budgetCheck) {
    const report = {
      timestamp: metrics.timestamp,
      commit: metrics.commit,
      branch: metrics.branch,
      metrics: metrics,
      budgetCheck: budgetCheck,
      summary: {
        status: budgetCheck.violations.length > 0 ? 'failed' : 
                budgetCheck.warnings.length > 0 ? 'warning' : 'passed',
        violationCount: budgetCheck.violations.length,
        warningCount: budgetCheck.warnings.length,
      }
    };
    
    // Save report
    const reportFile = path.join(CONFIG.reportsDir, `budget-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    return report;
  }
  
  printReport(report) {
    console.log('\n' + chalk.bold('📊 Performance Budget Report'));
    console.log(chalk.gray('='.repeat(50)));
    
    // Summary
    const statusIcon = {
      'passed': '✅',
      'warning': '⚠️',
      'failed': '❌'
    }[report.summary.status];
    
    console.log(chalk.bold('\n📈 Summary:'));
    console.log(`  Status: ${statusIcon} ${report.summary.status.toUpperCase()}`);
    console.log(`  Violations: ${chalk.red(report.summary.violationCount)}`);
    console.log(`  Warnings: ${chalk.yellow(report.summary.warningCount)}`);
    console.log(`  Commit: ${report.commit.substring(0, 8)}`);
    console.log(`  Branch: ${report.branch}`);
    
    // Metrics
    if (report.metrics.lighthouse) {
      console.log(chalk.bold('\n🔍 Lighthouse Metrics:'));
      console.log(`  Performance Score: ${report.metrics.lighthouse.performanceScore.toFixed(1)}/100`);
      console.log(`  First Contentful Paint: ${report.metrics.lighthouse.firstContentfulPaint.toFixed(0)}ms`);
      console.log(`  Largest Contentful Paint: ${report.metrics.lighthouse.largestContentfulPaint.toFixed(0)}ms`);
      console.log(`  Cumulative Layout Shift: ${report.metrics.lighthouse.cumulativeLayoutShift.toFixed(3)}`);
    }
    
    if (report.metrics.bundleSize) {
      console.log(chalk.bold('\n📦 Bundle Size:'));
      console.log(`  Total Size: ${report.metrics.bundleSize.totalSize}KB`);
      console.log(`  Script Size: ${report.metrics.bundleSize.scriptSize}KB`);
      console.log(`  Style Size: ${report.metrics.bundleSize.styleSize}KB`);
    }
    
    // Violations
    if (report.budgetCheck.violations.length > 0) {
      console.log(chalk.bold.red('\n🚨 Budget Violations:'));
      report.budgetCheck.violations.forEach(violation => {
        console.log(chalk.red(`  ❌ ${violation.metric}: ${violation.value} (budget: ${violation.budget}, exceeded by ${violation.exceedByPercent.toFixed(1)}%)`));
      });
    }
    
    // Warnings
    if (report.budgetCheck.warnings.length > 0) {
      console.log(chalk.bold.yellow('\n⚠️  Budget Warnings:'));
      report.budgetCheck.warnings.forEach(warning => {
        console.log(chalk.yellow(`  ⚠️  ${warning.metric}: ${warning.value} (budget: ${warning.budget}, exceeded by ${warning.exceedByPercent.toFixed(1)}%)`));
      });
    }
    
    console.log(chalk.gray('\n' + '='.repeat(50)));
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
  
  async run() {
    try {
      console.log(chalk.bold('🚀 Starting performance budget monitoring...\n'));
      
      // Collect metrics
      const metrics = await this.collectMetrics();
      
      // Check against budgets
      const budgetCheck = this.checkBudgets(metrics);
      
      // Generate report
      const report = this.generateReport(metrics, budgetCheck);
      this.printReport(report);
      
      // Send alerts if needed
      await this.sendAlerts(budgetCheck.violations, budgetCheck.warnings, metrics);
      
      // Update history
      this.history.push({
        timestamp: metrics.timestamp,
        commit: metrics.commit,
        branch: metrics.branch,
        status: report.summary.status,
        violationCount: report.summary.violationCount,
        warningCount: report.summary.warningCount,
      });
      this.saveHistory();
      
      // Exit with appropriate code
      if (budgetCheck.violations.length > 0) {
        console.log(chalk.red('\n❌ Performance budget check failed'));
        process.exit(1);
      } else if (budgetCheck.warnings.length > 0) {
        console.log(chalk.yellow('\n⚠️  Performance budget check passed with warnings'));
        process.exit(0);
      } else {
        console.log(chalk.green('\n✅ Performance budget check passed'));
        process.exit(0);
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Performance budget monitoring failed:'), error.message);
      process.exit(1);
    }
  }
}

// CLI interface
if (require.main === module) {
  const monitor = new PerformanceBudgetMonitor();
  monitor.run();
}

module.exports = PerformanceBudgetMonitor;