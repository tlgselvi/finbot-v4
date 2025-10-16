#!/usr/bin/env node

/**
 * FinBot v4 - Asset Optimization Script
 * Automated asset optimization and CDN preparation
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Configuration
const CONFIG = {
  inputDir: path.join(__dirname, '../public'),
  outputDir: path.join(__dirname, '../optimized'),
  manifestFile: path.join(__dirname, '../optimized/manifest.json'),
  
  // Optimization settings
  javascript: {
    minify: true,
    sourceMaps: false,
    target: 'es2018'
  },
  
  css: {
    minify: true,
    autoprefixer: true,
    purgeUnused: false
  },
  
  images: {
    quality: {
      jpeg: 85,
      png: 'auto',
      webp: 85
    },
    generateWebP: true,
    generateAvif: false,
    responsive: false
  },
  
  fonts: {
    subset: false,
    woff2Only: false
  }
};

class AssetOptimizer {
  constructor(config = CONFIG) {
    this.config = config;
    this.stats = {
      processed: 0,
      originalSize: 0,
      optimizedSize: 0,
      files: {}
    };
  }

  async optimize() {
    console.log('🚀 Starting asset optimization...');
    console.log(`Input: ${this.config.inputDir}`);
    console.log(`Output: ${this.config.outputDir}`);
    
    // Ensure output directory exists
    this.ensureDir(this.config.outputDir);
    
    // Process all files
    await this.processDirectory(this.config.inputDir);
    
    // Generate manifest
    await this.generateManifest();
    
    // Show statistics
    this.showStats();
    
    console.log('✅ Asset optimization completed!');
  }

  async processDirectory(dir, relativePath = '') {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const relativeFilePath = path.join(relativePath, file).replace(/\\/g, '/');
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        await this.processDirectory(filePath, relativeFilePath);
      } else {
        await this.processFile(filePath, relativeFilePath);
      }
    }
  }

  async processFile(filePath, relativePath) {
    const extension = path.extname(filePath).toLowerCase();
    const outputPath = path.join(this.config.outputDir, relativePath);
    
    // Ensure output directory exists
    this.ensureDir(path.dirname(outputPath));
    
    const originalSize = fs.statSync(filePath).size;
    this.stats.originalSize += originalSize;
    
    try {
      switch (extension) {
        case '.js':
          await this.optimizeJavaScript(filePath, outputPath);
          break;
        case '.css':
          await this.optimizeCSS(filePath, outputPath);
          break;
        case '.png':
        case '.jpg':
        case '.jpeg':
          await this.optimizeImage(filePath, outputPath);
          break;
        case '.gif':
          await this.optimizeGif(filePath, outputPath);
          break;
        case '.svg':
          await this.optimizeSVG(filePath, outputPath);
          break;
        case '.woff':
        case '.woff2':
        case '.ttf':
        case '.eot':
          await this.optimizeFont(filePath, outputPath);
          break;
        default:
          // Copy other files as-is
          fs.copyFileSync(filePath, outputPath);
      }
      
      const optimizedSize = fs.statSync(outputPath).size;
      this.stats.optimizedSize += optimizedSize;
      this.stats.processed++;
      
      // Store file info
      this.stats.files[relativePath] = {
        originalSize,
        optimizedSize,
        savings: originalSize - optimizedSize,
        savingsPercent: Math.round((originalSize - optimizedSize) / originalSize * 100)
      };
      
      console.log(`✓ ${relativePath} (${this.formatBytes(originalSize)} → ${this.formatBytes(optimizedSize)})`);
      
    } catch (error) {
      console.error(`❌ Error processing ${relativePath}:`, error.message);
      // Copy original file as fallback
      fs.copyFileSync(filePath, outputPath);
    }
  }

  async optimizeJavaScript(inputPath, outputPath) {
    if (!this.config.javascript.minify) {
      fs.copyFileSync(inputPath, outputPath);
      return;
    }

    try {
      // Use terser for minification
      const command = `npx terser "${inputPath}" --compress --mangle --output "${outputPath}"`;
      execSync(command, { stdio: 'pipe' });
    } catch (error) {
      // Fallback to copying original
      fs.copyFileSync(inputPath, outputPath);
    }
  }

  async optimizeCSS(inputPath, outputPath) {
    if (!this.config.css.minify) {
      fs.copyFileSync(inputPath, outputPath);
      return;
    }

    try {
      // Use csso for minification
      const command = `npx csso "${inputPath}" --output "${outputPath}"`;
      execSync(command, { stdio: 'pipe' });
    } catch (error) {
      // Fallback to copying original
      fs.copyFileSync(inputPath, outputPath);
    }
  }

  async optimizeImage(inputPath, outputPath) {
    const extension = path.extname(inputPath).toLowerCase();
    
    try {
      if (extension === '.png') {
        // Optimize PNG
        execSync(`optipng -o7 -out "${outputPath}" "${inputPath}"`, { stdio: 'pipe' });
      } else if (extension === '.jpg' || extension === '.jpeg') {
        // Optimize JPEG
        execSync(`jpegoptim --max=${this.config.images.quality.jpeg} --strip-all --stdout "${inputPath}" > "${outputPath}"`, { 
          stdio: 'pipe',
          shell: true 
        });
      }
      
      // Generate WebP version if enabled
      if (this.config.images.generateWebP) {
        const webpPath = outputPath + '.webp';
        try {
          execSync(`cwebp -q ${this.config.images.quality.webp} "${inputPath}" -o "${webpPath}"`, { stdio: 'pipe' });
        } catch (webpError) {
          // WebP generation failed, continue without it
        }
      }
      
    } catch (error) {
      // Fallback to copying original
      fs.copyFileSync(inputPath, outputPath);
    }
  }

  async optimizeGif(inputPath, outputPath) {
    try {
      execSync(`gifsicle --optimize=3 --output "${outputPath}" "${inputPath}"`, { stdio: 'pipe' });
    } catch (error) {
      fs.copyFileSync(inputPath, outputPath);
    }
  }

  async optimizeSVG(inputPath, outputPath) {
    try {
      execSync(`npx svgo "${inputPath}" --output "${outputPath}"`, { stdio: 'pipe' });
    } catch (error) {
      fs.copyFileSync(inputPath, outputPath);
    }
  }

  async optimizeFont(inputPath, outputPath) {
    // For now, just copy fonts
    // In the future, could implement font subsetting
    fs.copyFileSync(inputPath, outputPath);
  }

  async generateManifest() {
    console.log('📝 Generating asset manifest...');
    
    const manifest = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      files: {},
      stats: {
        totalFiles: this.stats.processed,
        originalSize: this.stats.originalSize,
        optimizedSize: this.stats.optimizedSize,
        totalSavings: this.stats.originalSize - this.stats.optimizedSize,
        savingsPercent: Math.round((this.stats.originalSize - this.stats.optimizedSize) / this.stats.originalSize * 100)
      }
    };
    
    // Generate file hashes and metadata
    const scanDir = (dir, baseDir = '') => {
      const files = fs.readdirSync(dir);
      
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const relativePath = path.join(baseDir, file).replace(/\\/g, '/');
        
        if (fs.statSync(filePath).isDirectory()) {
          scanDir(filePath, relativePath);
        } else {
          const content = fs.readFileSync(filePath);
          const hash = crypto.createHash('md5').update(content).digest('hex');
          const stats = fs.statSync(filePath);
          
          manifest.files[relativePath] = {
            hash: hash.substring(0, 8),
            fullHash: hash,
            size: stats.size,
            lastModified: stats.mtime.toISOString(),
            contentType: this.getContentType(path.extname(relativePath)),
            cacheable: this.isCacheable(relativePath),
            maxAge: this.getCacheMaxAge(relativePath)
          };
        }
      });
    };
    
    scanDir(this.config.outputDir);
    
    // Write manifest
    fs.writeFileSync(this.config.manifestFile, JSON.stringify(manifest, null, 2));
    console.log(`✓ Manifest generated: ${this.config.manifestFile}`);
  }

  getContentType(extension) {
    const types = {
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject'
    };
    
    return types[extension] || 'application/octet-stream';
  }

  isCacheable(filePath) {
    const cacheableExtensions = ['.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.woff', '.woff2', '.ttf', '.eot'];
    const extension = path.extname(filePath);
    return cacheableExtensions.includes(extension);
  }

  getCacheMaxAge(filePath) {
    const extension = path.extname(filePath);
    
    // Long cache for immutable assets
    if (['.js', '.css', '.woff', '.woff2', '.ttf', '.eot'].includes(extension)) {
      return 31536000; // 1 year
    }
    
    // Medium cache for images
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(extension)) {
      return 2592000; // 30 days
    }
    
    return 3600; // 1 hour default
  }

  ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  showStats() {
    console.log('\n📊 Optimization Statistics:');
    console.log('============================');
    console.log(`Files processed: ${this.stats.processed}`);
    console.log(`Original size: ${this.formatBytes(this.stats.originalSize)}`);
    console.log(`Optimized size: ${this.formatBytes(this.stats.optimizedSize)}`);
    console.log(`Total savings: ${this.formatBytes(this.stats.originalSize - this.stats.optimizedSize)}`);
    console.log(`Savings percentage: ${Math.round((this.stats.originalSize - this.stats.optimizedSize) / this.stats.originalSize * 100)}%`);
    
    // Show top savings
    const topSavings = Object.entries(this.stats.files)
      .filter(([, info]) => info.savings > 0)
      .sort(([, a], [, b]) => b.savings - a.savings)
      .slice(0, 5);
    
    if (topSavings.length > 0) {
      console.log('\n🏆 Top space savings:');
      topSavings.forEach(([file, info]) => {
        console.log(`  ${file}: ${this.formatBytes(info.savings)} (${info.savingsPercent}%)`);
      });
    }
  }
}

// CLI execution
if (require.main === module) {
  const optimizer = new AssetOptimizer();
  optimizer.optimize().catch(error => {
    console.error('❌ Optimization failed:', error);
    process.exit(1);
  });
}

module.exports = AssetOptimizer;