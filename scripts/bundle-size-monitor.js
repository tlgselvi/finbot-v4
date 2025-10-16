#!/usr/bin/env node

/**
 * FinBot v4 - Bundle Size Monitor
 * Monitors and tracks bundle size changes for performance regression detection
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');

// Configuration
const CONFIG = {
  // Bundle size limits (in KB)
  limits: {
    'main': 500,      // Main bundle
    'vendor': 1000,   // Vendor libraries
    'chunk': 200,     // Individual chunks
    'total': 2000,    // Total bundle size
  },
  
  // Paths
  buildDir: 'QuickServeAPI/client/dist',
  reportDir: 'tests/performance/bundle-reports',
  historyFile: 'tests/performance/bundle-history.json',
  
  // Thresholds for warnings
  warningThreshold: 0.1,  // 10% increase
  errorThreshold: 0.25,   // 25% increase
};

class BundleSizeMonitor {
  constructor() {
    this.ensureDirectories();
    this.history = this.loadHistory();
  }
  
  ensureDirectories() {
    if (!fs.existsSync(CONFIG.reportDir)) {
      fs.mkdirSync(CONFIG.reportDir, { recursive: true });
    }
  }
  
  loadHistory() {
    if (fs.existsSync(CONFIG.historyFile)) {
      try {
        return JSON.parse(fs.readFileSync(CONFIG.historyFile, 'utf8'));
      } catch (error) {
        console.warn(chalk.yellow('Warning: Could not load bundle history, starting fresh'));
        return [];
      }
    }
    return [];
  }
  
  saveHistory() {
    fs.writeFileSync(CONFIG.historyFile, JSON.stringify(this.history, null, 2));
  }
  
  analyzeBundleSize() {
    if (!fs.existsSync(CONFIG.buildDir)) {
      throw new Error(`Build directory not found: ${CONFIG.buildDir}`);
    }
    
    const files = this.getBundleFiles();
    const analysis = {
      timestamp: new Date().toISOString(),
      commit: this.getGitCommit(),
      branch: this.getGitBranch(),
      files: {},
      totals: {
        size: 0,
        gzipSize: 0,
        count: 0
      }
    };
    
    console.log(chalk.blue('📊 Analyzing bundle sizes...'));
    
    files.forEach(file => {
      const filePath = path.join(CONFIG.buildDir, file);
      const stats = fs.statSync(filePath);
      const gzipSize = this.getGzipSize(filePath);
      
      const fileAnalysis = {
        size: stats.size,
        gzipSize: gzipSize,
        sizeKB: Math.round(stats.size / 1024 * 100) / 100,
        gzipSizeKB: Math.round(gzipSize / 1024 * 100) / 100,
        type: this.categorizeFile(file)
      };
      
      analysis.files[file] = fileAnalysis;
      analysis.totals.size += stats.size;
      analysis.totals.gzipSize += gzipSize;
      analysis.totals.count++;
    });
    
    analysis.totals.sizeKB = Math.round(analysis.totals.size / 1024 * 100) / 100;
    analysis.totals.gzipSizeKB = Math.round(analysis.totals.gzipSize / 1024 * 100) / 100;
    
    return analysis;
  }
  
  getBundleFiles() {
    const files = fs.readdirSync(CONFIG.buildDir);
    return files.filter(file => {
      return file.endsWith('.js') || file.endsWith('.css');
    });
  }
  
  getGzipSize(filePath) {
    try {
      const gzipCommand = process.platform === 'win32' 
        ? `powershell -Command "& {(Get-Content '${filePath}' -Raw | ForEach-Object {[System.Text.Encoding]::UTF8.GetBytes($_)} | ForEach-Object {[System.IO.Compression.GzipStream]::new([System.IO.MemoryStream]::new($_), [System.IO.Compression.CompressionMode]::Compress)} | ForEach-Object {$_.BaseStream.Length})}"` 
        : `gzip -c "${filePath}" | wc -c`;
      
      const result = execSync(gzipCommand, { encoding: 'utf8' });
      return parseInt(result.trim());
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not calculate gzip size for ${filePath}`));
      return 0;
    }
  }
  
  categorizeFile(filename) {
    if (filename.includes('vendor') || filename.includes('node_modules')) {
      return 'vendor';
    } else if (filename.includes('main') || filename.includes('index')) {
      return 'main';
    } else if (filename.endsWith('.css')) {
      return 'styles';
    } else {
      return 'chunk';
    }
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
  
  compareWithPrevious(current) {
    if (this.history.length === 0) {
      console.log(chalk.green('✅ First bundle analysis - establishing baseline'));
      return { status: 'baseline', changes: [] };
    }
    
    const previous = this.history[this.history.length - 1];
    const changes = [];
    const comparison = {
      status: 'ok',
      changes: changes,
      totalChange: {
        size: current.totals.size - previous.totals.size,
        gzipSize: current.totals.gzipSize - previous.totals.gzipSize,
        sizePercent: ((current.totals.size - previous.totals.size) / previous.totals.size) * 100,
        gzipSizePercent: ((current.totals.gzipSize - previous.totals.gzipSize) / previous.totals.gzipSize) * 100
      }
    };
    
    // Compare individual files
    Object.keys(current.files).forEach(filename => {
      const currentFile = current.files[filename];
      const previousFile = previous.files[filename];
      
      if (!previousFile) {
        changes.push({
          file: filename,
          type: 'added',
          size: currentFile.size,
          gzipSize: currentFile.gzipSize
        });
      } else {
        const sizeDiff = currentFile.size - previousFile.size;
        const gzipSizeDiff = currentFile.gzipSize - previousFile.gzipSize;
        const sizePercent = (sizeDiff / previousFile.size) * 100;
        
        if (Math.abs(sizePercent) > 1) { // Only report changes > 1%
          changes.push({
            file: filename,
            type: 'modified',
            sizeDiff: sizeDiff,
            gzipSizeDiff: gzipSizeDiff,
            sizePercent: sizePercent,
            previousSize: previousFile.size,
            currentSize: currentFile.size
          });
        }
      }
    });
    
    // Check for removed files
    Object.keys(previous.files).forEach(filename => {
      if (!current.files[filename]) {
        changes.push({
          file: filename,
          type: 'removed',
          size: previous.files[filename].size,
          gzipSize: previous.files[filename].gzipSize
        });
      }
    });
    
    // Determine overall status
    if (comparison.totalChange.sizePercent > CONFIG.errorThreshold * 100) {
      comparison.status = 'error';
    } else if (comparison.totalChange.sizePercent > CONFIG.warningThreshold * 100) {
      comparison.status = 'warning';
    }
    
    return comparison;
  }
  
  checkLimits(analysis) {
    const violations = [];
    
    // Check total size
    if (analysis.totals.sizeKB > CONFIG.limits.total) {
      violations.push({
        type: 'total',
        current: analysis.totals.sizeKB,
        limit: CONFIG.limits.total,
        message: `Total bundle size (${analysis.totals.sizeKB}KB) exceeds limit (${CONFIG.limits.total}KB)`
      });
    }
    
    // Check individual files
    Object.entries(analysis.files).forEach(([filename, fileData]) => {
      const limit = CONFIG.limits[fileData.type] || CONFIG.limits.chunk;
      if (fileData.sizeKB > limit) {
        violations.push({
          type: 'file',
          file: filename,
          current: fileData.sizeKB,
          limit: limit,
          message: `File ${filename} (${fileData.sizeKB}KB) exceeds ${fileData.type} limit (${limit}KB)`
        });
      }
    });
    
    return violations;
  }
  
  generateReport(analysis, comparison, violations) {
    const report = {
      timestamp: analysis.timestamp,
      commit: analysis.commit,
      branch: analysis.branch,
      summary: {
        totalFiles: analysis.totals.count,
        totalSize: analysis.totals.sizeKB,
        totalGzipSize: analysis.totals.gzipSizeKB,
        status: comparison.status,
        violations: violations.length
      },
      comparison: comparison,
      violations: violations,
      files: analysis.files
    };
    
    // Save detailed report
    const reportFile = path.join(CONFIG.reportDir, `bundle-report-${Date.now()}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    return report;
  }
  
  printReport(report) {
    console.log('\n' + chalk.bold('📦 Bundle Size Analysis Report'));
    console.log(chalk.gray('='.repeat(50)));
    
    // Summary
    console.log(chalk.bold('\n📊 Summary:'));
    console.log(`  Total files: ${report.summary.totalFiles}`);
    console.log(`  Total size: ${report.summary.totalSize}KB`);
    console.log(`  Total gzipped: ${report.summary.totalGzipSize}KB`);
    console.log(`  Commit: ${report.commit.substring(0, 8)}`);
    console.log(`  Branch: ${report.branch}`);
    
    // Status
    const statusIcon = {
      'ok': '✅',
      'warning': '⚠️',
      'error': '❌',
      'baseline': '📏'
    }[report.comparison.status] || '❓';
    
    console.log(`\n${statusIcon} Status: ${report.comparison.status.toUpperCase()}`);
    
    // Changes
    if (report.comparison.changes.length > 0) {
      console.log(chalk.bold('\n📈 Changes:'));
      report.comparison.changes.forEach(change => {
        if (change.type === 'added') {
          console.log(chalk.green(`  + ${change.file} (${Math.round(change.size/1024)}KB)`));
        } else if (change.type === 'removed') {
          console.log(chalk.red(`  - ${change.file} (${Math.round(change.size/1024)}KB)`));
        } else if (change.type === 'modified') {
          const icon = change.sizeDiff > 0 ? '📈' : '📉';
          const color = change.sizeDiff > 0 ? chalk.yellow : chalk.green;
          console.log(color(`  ${icon} ${change.file} (${change.sizePercent > 0 ? '+' : ''}${change.sizePercent.toFixed(1)}%)`));
        }
      });
      
      // Total change
      if (report.comparison.totalChange) {
        const totalChange = report.comparison.totalChange;
        const icon = totalChange.size > 0 ? '📈' : '📉';
        const color = totalChange.size > 0 ? chalk.yellow : chalk.green;
        console.log(color(`\n  ${icon} Total change: ${totalChange.sizePercent > 0 ? '+' : ''}${totalChange.sizePercent.toFixed(1)}% (${totalChange.size > 0 ? '+' : ''}${Math.round(totalChange.size/1024)}KB)`));
      }
    }
    
    // Violations
    if (report.violations.length > 0) {
      console.log(chalk.bold.red('\n🚨 Size Limit Violations:'));
      report.violations.forEach(violation => {
        console.log(chalk.red(`  ❌ ${violation.message}`));
      });
    }
    
    // Top files
    const sortedFiles = Object.entries(report.files)
      .sort(([,a], [,b]) => b.size - a.size)
      .slice(0, 10);
    
    console.log(chalk.bold('\n📋 Largest Files:'));
    sortedFiles.forEach(([filename, data]) => {
      console.log(`  ${data.sizeKB}KB (${data.gzipSizeKB}KB gzipped) - ${filename}`);
    });
    
    console.log(chalk.gray('\n' + '='.repeat(50)));
  }
  
  run() {
    try {
      console.log(chalk.bold('🚀 Starting bundle size analysis...\n'));
      
      const analysis = this.analyzeBundleSize();
      const comparison = this.compareWithPrevious(analysis);
      const violations = this.checkLimits(analysis);
      const report = this.generateReport(analysis, comparison, violations);
      
      // Add to history
      this.history.push(analysis);
      
      // Keep only last 50 entries
      if (this.history.length > 50) {
        this.history = this.history.slice(-50);
      }
      
      this.saveHistory();
      this.printReport(report);
      
      // Exit with appropriate code
      if (violations.length > 0) {
        console.log(chalk.red('\n❌ Bundle size check failed due to limit violations'));
        process.exit(1);
      } else if (comparison.status === 'error') {
        console.log(chalk.red('\n❌ Bundle size increased significantly'));
        process.exit(1);
      } else if (comparison.status === 'warning') {
        console.log(chalk.yellow('\n⚠️  Bundle size increased moderately'));
        process.exit(0);
      } else {
        console.log(chalk.green('\n✅ Bundle size check passed'));
        process.exit(0);
      }
      
    } catch (error) {
      console.error(chalk.red('❌ Bundle size analysis failed:'), error.message);
      process.exit(1);
    }
  }
}

// CLI interface
if (require.main === module) {
  const monitor = new BundleSizeMonitor();
  monitor.run();
}

module.exports = BundleSizeMonitor;