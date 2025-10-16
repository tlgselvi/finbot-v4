#!/usr/bin/env node

/**
 * FinBot v4 - Build Optimization Script
 * Advanced build optimization with caching and parallel processing
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');
const os = require('os');

// Configuration
const CONFIG = {
  // Build settings
  parallel: true,
  maxWorkers: os.cpus().length,
  enableCache: true,
  cacheDir: path.join(__dirname, '../.build-cache'),
  
  // Optimization settings
  minify: true,
  treeshake: true,
  splitChunks: true,
  generateSourceMaps: false,
  
  // Target environments
  targets: {
    client: {
      dir: 'QuickServeAPI/client',
      buildCommand: 'npm run build',
      outputDir: 'build'
    },
    server: {
      dir: 'QuickServeAPI',
      buildCommand: 'npm run build',
      outputDir: 'dist'
    }
  },
  
  // Cache settings
  cacheValidityHours: 24,
  
  // Performance budgets
  budgets: {
    client: {
      maxBundleSize: 1024 * 1024, // 1MB
      maxChunkSize: 512 * 1024,   // 512KB
      maxAssetSize: 256 * 1024    // 256KB
    }
  }
};

class BuildOptimizer {
  constructor(config = CONFIG) {
    this.config = config;
    this.buildStats = {
      startTime: Date.now(),
      targets: {},
      cache: {
        hits: 0,
        misses: 0
      }
    };
    
    this.ensureCacheDir();
  }

  /**
   * Main build optimization entry point
   */
  async optimize() {
    console.log('🚀 Starting optimized build process...');
    
    try {
      // Pre-build analysis
      await this.analyzeDependencies();
      
      // Build targets
      if (this.config.parallel) {
        await this.buildParallel();
      } else {
        await this.buildSequential();
      }
      
      // Post-build optimization
      await this.postBuildOptimization();
      
      // Performance analysis
      await this.analyzePerformance();
      
      // Generate build report
      this.generateBuildReport();
      
      console.log('✅ Build optimization completed successfully!');
      
    } catch (error) {
      console.error('❌ Build optimization failed:', error);
      process.exit(1);
    }
  }

  /**
   * Analyze dependencies for optimization opportunities
   */
  async analyzeDependencies() {
    console.log('📊 Analyzing dependencies...');
    
    const targets = Object.keys(this.config.targets);
    
    for (const target of targets) {
      const targetConfig = this.config.targets[target];
      const packageJsonPath = path.join(targetConfig.dir, 'package.json');
      
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // Analyze bundle size impact
        const dependencies = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies
        };
        
        const heavyDependencies = await this.findHeavyDependencies(dependencies);
        
        if (heavyDependencies.length > 0) {
          console.log(`⚠️  Heavy dependencies found in ${target}:`);
          heavyDependencies.forEach(dep => {
            console.log(`   - ${dep.name}: ~${dep.size}`);
          });
        }
        
        this.buildStats.targets[target] = {
          dependencies: Object.keys(dependencies).length,
          heavyDependencies: heavyDependencies.length
        };
      }
    }
  }

  /**
   * Build targets in parallel
   */
  async buildParallel() {
    console.log('🔄 Building targets in parallel...');
    
    const targets = Object.keys(this.config.targets);
    const buildPromises = targets.map(target => this.buildTarget(target));
    
    const results = await Promise.allSettled(buildPromises);
    
    // Check for failures
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
      throw new Error(`Build failed for ${failures.length} target(s)`);
    }
  }

  /**
   * Build targets sequentially
   */
  async buildSequential() {
    console.log('🔄 Building targets sequentially...');
    
    const targets = Object.keys(this.config.targets);
    
    for (const target of targets) {
      await this.buildTarget(target);
    }
  }

  /**
   * Build individual target with caching
   */
  async buildTarget(target) {
    const targetConfig = this.config.targets[target];
    const startTime = Date.now();
    
    console.log(`📦 Building ${target}...`);
    
    // Check cache
    if (this.config.enableCache) {
      const cacheKey = await this.generateCacheKey(target);
      const cachedBuild = this.getCachedBuild(cacheKey);
      
      if (cachedBuild) {
        console.log(`💾 Using cached build for ${target}`);
        this.restoreCachedBuild(target, cachedBuild);
        this.buildStats.cache.hits++;
        return;
      }
      
      this.buildStats.cache.misses++;
    }
    
    // Perform build
    const buildEnv = this.getBuildEnvironment(target);
    
    try {
      execSync(targetConfig.buildCommand, {
        cwd: targetConfig.dir,
        stdio: 'inherit',
        env: { ...process.env, ...buildEnv }
      });
      
      const buildTime = Date.now() - startTime;
      console.log(`✅ ${target} built successfully in ${buildTime}ms`);
      
      // Cache the build
      if (this.config.enableCache) {
        const cacheKey = await this.generateCacheKey(target);
        await this.cacheBuild(target, cacheKey);
      }
      
      // Store build stats
      this.buildStats.targets[target] = {
        ...this.buildStats.targets[target],
        buildTime,
        success: true
      };
      
    } catch (error) {
      console.error(`❌ Failed to build ${target}:`, error.message);
      this.buildStats.targets[target] = {
        ...this.buildStats.targets[target],
        buildTime: Date.now() - startTime,
        success: false,
        error: error.message
      };
      throw error;
    }
  }

  /**
   * Generate cache key for target
   */
  async generateCacheKey(target) {
    const targetConfig = this.config.targets[target];
    const hash = crypto.createHash('md5');
    
    // Include package.json and lock file
    const packageJsonPath = path.join(targetConfig.dir, 'package.json');
    const lockFilePath = path.join(targetConfig.dir, 'package-lock.json');
    
    if (fs.existsSync(packageJsonPath)) {
      hash.update(fs.readFileSync(packageJsonPath));
    }
    
    if (fs.existsSync(lockFilePath)) {
      hash.update(fs.readFileSync(lockFilePath));
    }
    
    // Include source files hash
    const sourceHash = await this.getSourceFilesHash(targetConfig.dir);
    hash.update(sourceHash);
    
    // Include build configuration
    hash.update(JSON.stringify(this.config));
    
    return hash.digest('hex');
  }

  /**
   * Get hash of source files
   */
  async getSourceFilesHash(dir) {
    const hash = crypto.createHash('md5');
    const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.css', '.scss', '.json'];
    
    const walkDir = (currentDir) => {
      const files = fs.readdirSync(currentDir);
      
      files.forEach(file => {
        const filePath = path.join(currentDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          walkDir(filePath);
        } else if (stat.isFile()) {
          const ext = path.extname(file);
          if (sourceExtensions.includes(ext)) {
            hash.update(fs.readFileSync(filePath));
          }
        }
      });
    };
    
    walkDir(dir);
    return hash.digest('hex');
  }

  /**
   * Get cached build if available and valid
   */
  getCachedBuild(cacheKey) {
    const cacheFile = path.join(this.config.cacheDir, `${cacheKey}.json`);
    
    if (!fs.existsSync(cacheFile)) {
      return null;
    }
    
    try {
      const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      const cacheAge = Date.now() - cacheData.timestamp;
      const maxAge = this.config.cacheValidityHours * 60 * 60 * 1000;
      
      if (cacheAge > maxAge) {
        fs.unlinkSync(cacheFile);
        return null;
      }
      
      return cacheData;
    } catch (error) {
      return null;
    }
  }

  /**
   * Cache build results
   */
  async cacheBuild(target, cacheKey) {
    const targetConfig = this.config.targets[target];
    const outputDir = path.join(targetConfig.dir, targetConfig.outputDir);
    
    if (!fs.existsSync(outputDir)) {
      return;
    }
    
    const cacheData = {
      target,
      cacheKey,
      timestamp: Date.now(),
      outputPath: outputDir
    };
    
    const cacheFile = path.join(this.config.cacheDir, `${cacheKey}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
    
    // Copy build output to cache
    const cacheOutputDir = path.join(this.config.cacheDir, cacheKey);
    if (fs.existsSync(cacheOutputDir)) {
      fs.rmSync(cacheOutputDir, { recursive: true });
    }
    
    this.copyDirectory(outputDir, cacheOutputDir);
  }

  /**
   * Restore cached build
   */
  restoreCachedBuild(target, cacheData) {
    const targetConfig = this.config.targets[target];
    const outputDir = path.join(targetConfig.dir, targetConfig.outputDir);
    const cacheOutputDir = path.join(this.config.cacheDir, cacheData.cacheKey);
    
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true });
    }
    
    this.copyDirectory(cacheOutputDir, outputDir);
  }

  /**
   * Get build environment variables
   */
  getBuildEnvironment(target) {
    const env = {
      NODE_ENV: 'production',
      CI: 'true'
    };
    
    if (target === 'client') {
      env.GENERATE_SOURCEMAP = this.config.generateSourceMaps ? 'true' : 'false';
      env.INLINE_RUNTIME_CHUNK = 'false';
      env.REACT_APP_BUILD_OPTIMIZATION = 'true';
    }
    
    return env;
  }

  /**
   * Post-build optimization
   */
  async postBuildOptimization() {
    console.log('⚡ Running post-build optimizations...');
    
    // Optimize client build
    if (this.config.targets.client) {
      await this.optimizeClientBuild();
    }
    
    // Optimize server build
    if (this.config.targets.server) {
      await this.optimizeServerBuild();
    }
  }

  /**
   * Optimize client build
   */
  async optimizeClientBuild() {
    const clientDir = this.config.targets.client.dir;
    const buildDir = path.join(clientDir, 'build');
    
    if (!fs.existsSync(buildDir)) {
      return;
    }
    
    console.log('🎨 Optimizing client assets...');
    
    // Run asset optimization
    try {
      execSync('node scripts/optimize-assets.js', {
        cwd: process.cwd(),
        stdio: 'inherit'
      });
    } catch (error) {
      console.warn('⚠️  Asset optimization failed:', error.message);
    }
  }

  /**
   * Optimize server build
   */
  async optimizeServerBuild() {
    const serverDir = this.config.targets.server.dir;
    const distDir = path.join(serverDir, 'dist');
    
    if (!fs.existsSync(distDir)) {
      return;
    }
    
    console.log('🔧 Optimizing server build...');
    
    // Remove source maps in production
    if (!this.config.generateSourceMaps) {
      const mapFiles = this.findFiles(distDir, '.map');
      mapFiles.forEach(file => fs.unlinkSync(file));
    }
  }

  /**
   * Analyze build performance
   */
  async analyzePerformance() {
    console.log('📈 Analyzing build performance...');
    
    // Check bundle sizes against budgets
    if (this.config.budgets.client) {
      await this.checkBundleBudgets();
    }
    
    // Analyze build times
    this.analyzeBuildTimes();
  }

  /**
   * Check bundle size budgets
   */
  async checkBundleBudgets() {
    const clientBuildDir = path.join(this.config.targets.client.dir, 'build');
    
    if (!fs.existsSync(clientBuildDir)) {
      return;
    }
    
    const budgets = this.config.budgets.client;
    const jsFiles = this.findFiles(clientBuildDir, '.js');
    
    let totalSize = 0;
    let budgetViolations = [];
    
    jsFiles.forEach(file => {
      const size = fs.statSync(file).size;
      totalSize += size;
      
      if (size > budgets.maxChunkSize) {
        budgetViolations.push({
          file: path.relative(clientBuildDir, file),
          size,
          budget: budgets.maxChunkSize,
          type: 'chunk'
        });
      }
    });
    
    if (totalSize > budgets.maxBundleSize) {
      budgetViolations.push({
        file: 'Total bundle',
        size: totalSize,
        budget: budgets.maxBundleSize,
        type: 'bundle'
      });
    }
    
    if (budgetViolations.length > 0) {
      console.log('⚠️  Bundle budget violations:');
      budgetViolations.forEach(violation => {
        const sizeMB = (violation.size / 1024 / 1024).toFixed(2);
        const budgetMB = (violation.budget / 1024 / 1024).toFixed(2);
        console.log(`   - ${violation.file}: ${sizeMB}MB (budget: ${budgetMB}MB)`);
      });
    }
  }

  /**
   * Analyze build times
   */
  analyzeBuildTimes() {
    const totalTime = Date.now() - this.buildStats.startTime;
    
    console.log(`⏱️  Total build time: ${totalTime}ms`);
    
    Object.entries(this.buildStats.targets).forEach(([target, stats]) => {
      if (stats.buildTime) {
        console.log(`   - ${target}: ${stats.buildTime}ms`);
      }
    });
  }

  /**
   * Generate build report
   */
  generateBuildReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalTime: Date.now() - this.buildStats.startTime,
      targets: this.buildStats.targets,
      cache: this.buildStats.cache,
      config: this.config
    };
    
    const reportPath = path.join(this.config.cacheDir, 'build-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`📄 Build report saved to: ${reportPath}`);
  }

  /**
   * Utility functions
   */
  ensureCacheDir() {
    if (!fs.existsSync(this.config.cacheDir)) {
      fs.mkdirSync(this.config.cacheDir, { recursive: true });
    }
  }

  copyDirectory(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const files = fs.readdirSync(src);
    
    files.forEach(file => {
      const srcFile = path.join(src, file);
      const destFile = path.join(dest, file);
      const stat = fs.statSync(srcFile);
      
      if (stat.isDirectory()) {
        this.copyDirectory(srcFile, destFile);
      } else {
        fs.copyFileSync(srcFile, destFile);
      }
    });
  }

  findFiles(dir, extension) {
    const files = [];
    
    const walkDir = (currentDir) => {
      const dirFiles = fs.readdirSync(currentDir);
      
      dirFiles.forEach(file => {
        const filePath = path.join(currentDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          walkDir(filePath);
        } else if (file.endsWith(extension)) {
          files.push(filePath);
        }
      });
    };
    
    walkDir(dir);
    return files;
  }

  async findHeavyDependencies(dependencies) {
    // This is a simplified implementation
    // In practice, you'd use tools like bundlephobia API
    const heavyPackages = [
      'lodash', 'moment', 'rxjs', 'core-js', 'babel-polyfill'
    ];
    
    return Object.keys(dependencies)
      .filter(dep => heavyPackages.includes(dep))
      .map(dep => ({ name: dep, size: 'Unknown' }));
  }
}

// CLI execution
if (require.main === module) {
  const optimizer = new BuildOptimizer();
  optimizer.optimize().catch(error => {
    console.error('Build optimization failed:', error);
    process.exit(1);
  });
}

module.exports = BuildOptimizer;