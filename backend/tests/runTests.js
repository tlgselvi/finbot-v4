/**
 * Test Runner Script
 * Orchestrates running all analytics service tests
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

class TestRunner {
  constructor() {
    this.testSuites = [
      {
        name: 'Unit Tests',
        pattern: 'tests/**/*.test.js',
        timeout: 10000,
        coverage: true
      },
      {
        name: 'Integration Tests',
        pattern: 'tests/integration/**/*.test.js',
        timeout: 30000,
        coverage: true,
        setup: 'setupIntegrationTests'
      },
      {
        name: 'ML Integration Tests',
        pattern: 'tests/ml/**/*.test.js',
        timeout: 20000,
        coverage: true,
        setup: 'setupMLTests'
      },
      {
        name: 'E2E Tests',
        pattern: 'tests/e2e/**/*.test.js',
        timeout: 60000,
        coverage: false,
        setup: 'setupE2ETests'
      }
    ];

    this.results = {
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      coverage: null,
      duration: 0
    };
  }

  async runAllTests() {
    console.log(chalk.blue.bold('🚀 Starting Analytics Service Test Suite\n'));

    const startTime = Date.now();

    try {
      // Setup test environment
      await this.setupTestEnvironment();

      // Run test suites
      for (const suite of this.testSuites) {
        await this.runTestSuite(suite);
      }

      // Generate reports
      await this.generateReports();

      this.results.duration = Date.now() - startTime;
      this.printSummary();

    } catch (error) {
      console.error(chalk.red.bold('❌ Test execution failed:'), error.message);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  async setupTestEnvironment() {
    console.log(chalk.yellow('📋 Setting up test environment...'));

    // Set test environment variables
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_TEST_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/finbot_test';
    process.env.ML_SERVICE_TEST_URL = process.env.ML_SERVICE_TEST_URL || 'http://localhost:8001';

    // Create test directories
    const testDirs = ['logs', 'coverage', 'reports'];
    testDirs.forEach(dir => {
      const dirPath = path.join(__dirname, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    });

    // Start test services if needed
    if (process.env.START_TEST_SERVICES === 'true') {
      await this.startTestServices();
    }

    console.log(chalk.green('✅ Test environment ready\n'));
  }

  async startTestServices() {
    console.log(chalk.yellow('🔧 Starting test services...'));

    // Start test database
    if (process.env.START_TEST_DB === 'true') {
      await this.startTestDatabase();
    }

    // Start mock ML service
    if (process.env.START_MOCK_ML === 'true') {
      await this.startMockMLService();
    }
  }

  async startTestDatabase() {
    return new Promise((resolve, reject) => {
      const mongod = spawn('mongod', [
        '--dbpath', path.join(__dirname, 'data'),
        '--port', '27017',
        '--nojournal',
        '--smallfiles'
      ]);

      mongod.stdout.on('data', (data) => {
        if (data.toString().includes('waiting for connections')) {
          resolve();
        }
      });

      mongod.stderr.on('data', (data) => {
        console.error('MongoDB error:', data.toString());
      });

      setTimeout(() => reject(new Error('MongoDB startup timeout')), 10000);
    });
  }

  async startMockMLService() {
    const mockMLServer = require('./mocks/mockMLService');
    await mockMLServer.start(8001);
    console.log(chalk.green('✅ Mock ML service started on port 8001'));
  }

  async runTestSuite(suite) {
    console.log(chalk.blue.bold(`📝 Running ${suite.name}...`));

    const startTime = Date.now();

    try {
      // Setup suite-specific environment
      if (suite.setup) {
        await this[suite.setup]();
      }

      // Run tests
      const result = await this.executeTests(suite);
      
      const duration = Date.now() - startTime;
      console.log(chalk.green(`✅ ${suite.name} completed in ${duration}ms`));
      
      this.updateResults(result);

    } catch (error) {
      console.error(chalk.red(`❌ ${suite.name} failed:`), error.message);
      this.results.failed += 1;
    }

    console.log(''); // Empty line for readability
  }

  async executeTests(suite) {
    return new Promise((resolve, reject) => {
      const args = [
        '--recursive',
        '--timeout', suite.timeout.toString(),
        '--reporter', 'json',
        suite.pattern
      ];

      if (suite.coverage) {
        args.unshift('--require', 'nyc/register');
      }

      const mocha = spawn('npx', ['mocha', ...args], {
        cwd: path.join(__dirname, '..'),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      mocha.stdout.on('data', (data) => {
        output += data.toString();
      });

      mocha.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      mocha.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            resolve(result);
          } catch (error) {
            resolve({ tests: [], passes: 0, failures: 0, pending: 0 });
          }
        } else {
          reject(new Error(errorOutput || `Test process exited with code ${code}`));
        }
      });

      // Set timeout for the entire test suite
      setTimeout(() => {
        mocha.kill();
        reject(new Error(`Test suite timeout after ${suite.timeout}ms`));
      }, suite.timeout + 5000);
    });
  }

  async setupIntegrationTests() {
    console.log(chalk.yellow('🔧 Setting up integration tests...'));
    
    // Start test database connection
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI);
    }

    // Clean test database
    await mongoose.connection.dropDatabase();
    
    console.log(chalk.green('✅ Integration test environment ready'));
  }

  async setupMLTests() {
    console.log(chalk.yellow('🔧 Setting up ML integration tests...'));
    
    // Verify ML service is available or start mock
    try {
      const axios = require('axios');
      await axios.get(`${process.env.ML_SERVICE_TEST_URL}/health`);
      console.log(chalk.green('✅ ML service is available'));
    } catch (error) {
      console.log(chalk.yellow('⚠️  ML service not available, using mocks'));
      process.env.USE_ML_MOCKS = 'true';
    }
  }

  async setupE2ETests() {
    console.log(chalk.yellow('🔧 Setting up E2E tests...'));
    
    // Setup complete test environment
    await this.setupIntegrationTests();
    
    // Start application server for E2E tests
    const app = require('../app');
    const server = app.listen(0); // Use random available port
    process.env.TEST_SERVER_PORT = server.address().port;
    
    console.log(chalk.green(`✅ E2E test server started on port ${process.env.TEST_SERVER_PORT}`));
  }

  updateResults(result) {
    if (result && result.stats) {
      this.results.passed += result.stats.passes || 0;
      this.results.failed += result.stats.failures || 0;
      this.results.skipped += result.stats.pending || 0;
      this.results.total += result.stats.tests || 0;
    }
  }

  async generateReports() {
    console.log(chalk.yellow('📊 Generating test reports...'));

    // Generate coverage report
    if (process.env.GENERATE_COVERAGE !== 'false') {
      await this.generateCoverageReport();
    }

    // Generate test report
    await this.generateTestReport();

    console.log(chalk.green('✅ Reports generated'));
  }

  async generateCoverageReport() {
    return new Promise((resolve, reject) => {
      const nyc = spawn('npx', ['nyc', 'report', '--reporter=html', '--reporter=text-summary'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit'
      });

      nyc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('Coverage report generation failed'));
        }
      });
    });
  }

  async generateTestReport() {
    const report = {
      timestamp: new Date().toISOString(),
      results: this.results,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        testDatabase: process.env.MONGODB_TEST_URI,
        mlService: process.env.ML_SERVICE_TEST_URL
      },
      suites: this.testSuites.map(suite => ({
        name: suite.name,
        pattern: suite.pattern,
        timeout: suite.timeout
      }))
    };

    const reportPath = path.join(__dirname, 'reports', 'test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(chalk.blue(`📄 Test report saved to: ${reportPath}`));
  }

  printSummary() {
    console.log(chalk.blue.bold('\n📋 Test Summary'));
    console.log(chalk.blue('═'.repeat(50)));
    
    console.log(chalk.green(`✅ Passed: ${this.results.passed}`));
    console.log(chalk.red(`❌ Failed: ${this.results.failed}`));
    console.log(chalk.yellow(`⏭️  Skipped: ${this.results.skipped}`));
    console.log(chalk.blue(`📊 Total: ${this.results.total}`));
    console.log(chalk.magenta(`⏱️  Duration: ${this.results.duration}ms`));

    const successRate = this.results.total > 0 
      ? ((this.results.passed / this.results.total) * 100).toFixed(1)
      : 0;

    console.log(chalk.cyan(`📈 Success Rate: ${successRate}%`));

    if (this.results.failed > 0) {
      console.log(chalk.red.bold('\n❌ Some tests failed!'));
      process.exit(1);
    } else {
      console.log(chalk.green.bold('\n🎉 All tests passed!'));
    }
  }

  async cleanup() {
    console.log(chalk.yellow('\n🧹 Cleaning up...'));

    // Close database connections
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }

    // Stop test services
    if (process.env.STOP_TEST_SERVICES === 'true') {
      await this.stopTestServices();
    }

    console.log(chalk.green('✅ Cleanup completed'));
  }

  async stopTestServices() {
    // Stop mock services, test databases, etc.
    // Implementation depends on how services were started
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      options[key] = value || true;
    }
  });

  // Set environment variables from options
  if (options.coverage === 'false') process.env.GENERATE_COVERAGE = 'false';
  if (options.services) process.env.START_TEST_SERVICES = 'true';
  if (options.verbose) process.env.TEST_LOG_LEVEL = 'debug';

  const runner = new TestRunner();
  runner.runAllTests().catch(error => {
    console.error(chalk.red.bold('Test runner failed:'), error);
    process.exit(1);
  });
}

module.exports = TestRunner;