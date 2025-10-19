/**
 * Test Configuration
 * Configuration for analytics service tests
 */

const path = require('path');

module.exports = {
  // Test environment configuration
  testEnvironment: 'node',
  
  // Test database configuration
  database: {
    uri: process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/finbot_test',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    }
  },

  // ML service configuration for tests
  mlService: {
    baseUrl: process.env.ML_SERVICE_TEST_URL || 'http://localhost:8001',
    timeout: 5000,
    retries: 2,
    fallbackEnabled: true
  },

  // Test data configuration
  testData: {
    users: {
      testUser: {
        email: 'test@example.com',
        name: 'Test User',
        monthlyIncome: 5000,
        currency: 'USD'
      },
      premiumUser: {
        email: 'premium@example.com',
        name: 'Premium User',
        monthlyIncome: 8000,
        currency: 'USD',
        subscription: 'premium'
      }
    },
    
    transactions: {
      sampleSize: 100,
      categories: ['groceries', 'dining', 'transportation', 'entertainment', 'utilities', 'shopping', 'healthcare'],
      dateRange: {
        start: '2024-01-01',
        end: '2024-06-30'
      }
    },

    goals: {
      emergency: {
        title: 'Emergency Fund',
        targetAmount: 15000,
        category: 'emergency'
      },
      vacation: {
        title: 'Summer Vacation',
        targetAmount: 5000,
        category: 'travel'
      },
      home: {
        title: 'House Down Payment',
        targetAmount: 50000,
        category: 'home'
      }
    }
  },

  // Performance test thresholds
  performance: {
    apiResponseTime: 2000, // 2 seconds max
    dashboardLoadTime: 1500, // 1.5 seconds max
    insightGenerationTime: 3000, // 3 seconds max
    mlPredictionTime: 1000, // 1 second max
    concurrentUsers: 10,
    transactionBatchSize: 1000
  },

  // Test coverage requirements
  coverage: {
    statements: 80,
    branches: 75,
    functions: 80,
    lines: 80
  },

  // Mock configurations
  mocks: {
    mlService: {
      enabled: true,
      responses: {
        spendingPrediction: {
          prediction: 3450.75,
          confidence: 0.87,
          processingTime: 45
        },
        anomalyDetection: {
          anomalies: [],
          processingTime: 25
        },
        insightGeneration: {
          insights: [],
          processingTime: 150
        }
      }
    },
    
    externalServices: {
      bankingAPI: {
        enabled: true,
        latency: 200
      },
      notificationService: {
        enabled: true,
        latency: 100
      }
    }
  },

  // Test timeouts
  timeouts: {
    unit: 5000,
    integration: 10000,
    e2e: 30000,
    performance: 60000
  },

  // Logging configuration for tests
  logging: {
    level: process.env.TEST_LOG_LEVEL || 'error',
    silent: process.env.NODE_ENV === 'test',
    file: path.join(__dirname, 'logs', 'test.log')
  },

  // Cleanup configuration
  cleanup: {
    afterEach: true,
    afterAll: true,
    preserveData: process.env.PRESERVE_TEST_DATA === 'true'
  }
};

// Test utilities
module.exports.utils = {
  /**
   * Generate test user data
   */
  generateTestUser: (overrides = {}) => {
    return {
      ...module.exports.testData.users.testUser,
      ...overrides,
      email: overrides.email || `test-${Date.now()}@example.com`
    };
  },

  /**
   * Generate test transaction data
   */
  generateTestTransactions: (count = 10, userId = null) => {
    const categories = module.exports.testData.transactions.categories;
    const transactions = [];

    for (let i = 0; i < count; i++) {
      transactions.push({
        userId,
        category: categories[Math.floor(Math.random() * categories.length)],
        amount: Math.round((Math.random() * 500 + 10) * 100) / 100,
        description: `Test transaction ${i + 1}`,
        date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        type: 'expense'
      });
    }

    return transactions;
  },

  /**
   * Generate test goal data
   */
  generateTestGoal: (type = 'emergency', userId = null, overrides = {}) => {
    const goalTemplate = module.exports.testData.goals[type];
    return {
      userId,
      ...goalTemplate,
      targetDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      currentAmount: 0,
      status: 'active',
      ...overrides
    };
  },

  /**
   * Wait for async operations
   */
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Retry function for flaky tests
   */
  retry: async (fn, maxAttempts = 3, delay = 1000) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await module.exports.utils.wait(delay);
        }
      }
    }
    
    throw lastError;
  },

  /**
   * Clean test database
   */
  cleanDatabase: async (models = []) => {
    const mongoose = require('mongoose');
    
    if (models.length === 0) {
      // Clean all collections
      const collections = await mongoose.connection.db.collections();
      await Promise.all(collections.map(collection => collection.deleteMany({})));
    } else {
      // Clean specific models
      await Promise.all(models.map(Model => Model.deleteMany({})));
    }
  },

  /**
   * Setup test data
   */
  setupTestData: async (userId) => {
    const User = require('../models/User');
    const Transaction = require('../models/Transaction');
    const Goal = require('../models/Goal');
    const Budget = require('../models/Budget');

    // Create test transactions
    const transactions = module.exports.utils.generateTestTransactions(20, userId);
    await Transaction.insertMany(transactions);

    // Create test goal
    const goal = module.exports.utils.generateTestGoal('emergency', userId);
    await Goal.create(goal);

    // Create test budget
    const budget = {
      userId,
      month: new Date(),
      categories: {
        'groceries': { budgeted: 500, spent: 450 },
        'dining': { budgeted: 300, spent: 320 },
        'transportation': { budgeted: 200, spent: 180 },
        'entertainment': { budgeted: 150, spent: 140 }
      },
      totalBudgeted: 1150,
      totalSpent: 1090
    };
    await Budget.create(budget);

    return { transactions, goal, budget };
  }
};