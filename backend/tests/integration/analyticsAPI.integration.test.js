/**
 * Analytics API Integration Tests
 * Integration tests for analytics API endpoints with real database and ML models
 */

const { expect } = require('chai');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const User = require('../../models/User');
const Goal = require('../../models/Goal');
const Transaction = require('../../models/Transaction');
const Budget = require('../../models/Budget');

describe('Analytics API Integration Tests', () => {
  let authToken;
  let testUser;
  let testGoal;
  let testTransactions;

  before(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/finbot_test');
    }
  });

  beforeEach(async () => {
    // Clean database
    await Promise.all([
      User.deleteMany({}),
      Goal.deleteMany({}),
      Transaction.deleteMany({}),
      Budget.deleteMany({})
    ]);

    // Create test user
    testUser = await User.create({
      email: 'test@example.com',
      password: 'hashedpassword',
      name: 'Test User',
      profile: {
        monthlyIncome: 5000,
        currency: 'USD'
      }
    });

    // Generate auth token
    authToken = testUser.generateAuthToken();

    // Create test data
    await createTestData();
  });

  after(async () => {
    // Clean up and close connection
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  async function createTestData() {
    // Create test goal
    testGoal = await Goal.create({
      userId: testUser._id,
      title: 'Emergency Fund',
      targetAmount: 15000,
      currentAmount: 8500,
      targetDate: new Date('2024-12-31'),
      category: 'emergency',
      status: 'active'
    });

    // Create test transactions
    const transactionData = [
      { category: 'groceries', amount: 120, date: new Date('2024-06-01'), description: 'Supermarket' },
      { category: 'dining', amount: 85, date: new Date('2024-06-02'), description: 'Restaurant' },
      { category: 'transportation', amount: 45, date: new Date('2024-06-03'), description: 'Gas' },
      { category: 'entertainment', amount: 60, date: new Date('2024-06-04'), description: 'Movie tickets' },
      { category: 'groceries', amount: 95, date: new Date('2024-06-05'), description: 'Grocery store' },
      { category: 'dining', amount: 150, date: new Date('2024-06-06'), description: 'Fine dining' },
      { category: 'utilities', amount: 200, date: new Date('2024-06-07'), description: 'Electric bill' },
      { category: 'shopping', amount: 300, date: new Date('2024-06-08'), description: 'Clothing' },
      { category: 'healthcare', amount: 75, date: new Date('2024-06-09'), description: 'Pharmacy' },
      { category: 'transportation', amount: 50, date: new Date('2024-06-10'), description: 'Uber' }
    ];

    testTransactions = await Transaction.insertMany(
      transactionData.map(tx => ({
        ...tx,
        userId: testUser._id,
        type: 'expense'
      }))
    );

    // Create test budget
    await Budget.create({
      userId: testUser._id,
      month: new Date('2024-06-01'),
      categories: {
        'groceries': { budgeted: 400, spent: 215 },
        'dining': { budgeted: 300, spent: 235 },
        'transportation': { budgeted: 200, spent: 95 },
        'entertainment': { budgeted: 150, spent: 60 },
        'utilities': { budgeted: 250, spent: 200 },
        'shopping': { budgeted: 200, spent: 300 },
        'healthcare': { budgeted: 100, spent: 75 }
      },
      totalBudgeted: 1600,
      totalSpent: 1180
    });
  }

  describe('GET /api/analytics/dashboard', () => {
    it('should return comprehensive dashboard data', async () => {
      const response = await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.exist;
      
      const { data } = response.body;
      expect(data.totalBalance).to.be.a('number');
      expect(data.monthlyIncome).to.equal(5000);
      expect(data.monthlyExpenses).to.be.a('number');
      expect(data.savingsRate).to.be.a('number');
      expect(data.budgetUtilization).to.be.a('number');
      expect(data.goalProgress).to.be.a('number');
      expect(data.insights).to.be.an('array');
      expect(data.recentTransactions).to.be.an('array');
    });

    it('should include recent transactions in dashboard', async () => {
      const response = await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const { recentTransactions } = response.body.data;
      expect(recentTransactions).to.have.length.at.most(10);
      expect(recentTransactions[0]).to.have.property('amount');
      expect(recentTransactions[0]).to.have.property('category');
      expect(recentTransactions[0]).to.have.property('date');
    });

    it('should calculate correct financial metrics', async () => {
      const response = await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const { data } = response.body;
      
      // Verify calculations based on test data
      expect(data.monthlyExpenses).to.equal(1180); // Sum of all test transactions
      expect(data.savingsRate).to.be.within(70, 80); // (5000 - 1180) / 5000 * 100
      expect(data.budgetUtilization).to.be.within(70, 80); // 1180 / 1600 * 100
    });
  });

  describe('GET /api/analytics/insights', () => {
    it('should generate AI-powered insights', async () => {
      const response = await request(app)
        .get('/api/analytics/insights')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.insights).to.be.an('array');
      
      if (response.body.insights.length > 0) {
        const insight = response.body.insights[0];
        expect(insight).to.have.property('id');
        expect(insight).to.have.property('type');
        expect(insight).to.have.property('title');
        expect(insight).to.have.property('description');
        expect(insight).to.have.property('priority');
        expect(insight).to.have.property('confidence');
      }
    });

    it('should detect budget overspend insights', async () => {
      const response = await request(app)
        .get('/api/analytics/insights')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const budgetInsights = response.body.insights.filter(
        insight => insight.type === 'budget_alert' || insight.category === 'shopping'
      );

      // Should detect shopping category overspend (300 spent vs 200 budgeted)
      expect(budgetInsights.length).to.be.greaterThan(0);
    });

    it('should filter insights by category', async () => {
      const response = await request(app)
        .get('/api/analytics/insights?category=spending')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const insights = response.body.insights;
      insights.forEach(insight => {
        expect(['spending', 'budget_alert']).to.include(insight.type);
      });
    });

    it('should limit insights based on query parameter', async () => {
      const response = await request(app)
        .get('/api/analytics/insights?limit=3')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.insights).to.have.length.at.most(3);
    });
  });

  describe('POST /api/analytics/insights/:insightId/action', () => {
    let testInsightId;

    beforeEach(async () => {
      // Get an insight first
      const insightsResponse = await request(app)
        .get('/api/analytics/insights')
        .set('Authorization', `Bearer ${authToken}`);

      if (insightsResponse.body.insights.length > 0) {
        testInsightId = insightsResponse.body.insights[0].id;
      }
    });

    it('should process insight action successfully', async () => {
      if (!testInsightId) {
        this.skip();
      }

      const response = await request(app)
        .post(`/api/analytics/insights/${testInsightId}/action`)
        .send({ action: 'accept' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.message).to.exist;
    });

    it('should validate action parameter', async () => {
      const response = await request(app)
        .post('/api/analytics/insights/test-insight/action')
        .send({ action: 'invalid_action' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).to.be.false;
      expect(response.body.errors).to.exist;
    });

    it('should handle non-existent insight', async () => {
      const response = await request(app)
        .post('/api/analytics/insights/non-existent-insight/action')
        .send({ action: 'accept' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).to.be.false;
    });
  });

  describe('GET /api/analytics/spending', () => {
    it('should return spending analytics', async () => {
      const response = await request(app)
        .get('/api/analytics/spending')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.exist;
      
      const { data } = response.body;
      expect(data.totalSpending).to.equal(1180);
      expect(data.categoryBreakdown).to.exist;
      expect(data.categoryBreakdown.groceries).to.equal(215);
      expect(data.categoryBreakdown.shopping).to.equal(300);
      expect(data.topCategories).to.be.an('array');
    });

    it('should support date range filtering', async () => {
      const startDate = '2024-06-01';
      const endDate = '2024-06-05';

      const response = await request(app)
        .get(`/api/analytics/spending?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const { data } = response.body;
      
      // Should only include transactions from June 1-5
      expect(data.totalSpending).to.be.lessThan(1180);
      expect(data.totalSpending).to.equal(405); // Sum of first 5 transactions
    });

    it('should calculate spending trends', async () => {
      const response = await request(app)
        .get('/api/analytics/spending')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const { data } = response.body;
      expect(data.monthlyTrend).to.be.an('array');
      expect(data.comparisonToPrevious).to.exist;
      expect(data.comparisonToPrevious.amount).to.be.a('number');
      expect(data.comparisonToPrevious.percentage).to.be.a('number');
    });
  });

  describe('GET /api/analytics/budget', () => {
    it('should return budget analytics', async () => {
      const response = await request(app)
        .get('/api/analytics/budget')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.exist;
      
      const { data } = response.body;
      expect(data.totalBudget).to.equal(1600);
      expect(data.totalSpent).to.equal(1180);
      expect(data.utilization).to.be.within(70, 80);
      expect(data.categories).to.be.an('array');
      expect(data.optimizationSuggestions).to.be.an('array');
    });

    it('should identify over-budget categories', async () => {
      const response = await request(app)
        .get('/api/analytics/budget')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const { categories } = response.body.data;
      const shoppingCategory = categories.find(cat => cat.name === 'shopping');
      
      expect(shoppingCategory).to.exist;
      expect(shoppingCategory.status).to.equal('over_budget');
      expect(shoppingCategory.utilization).to.be.greaterThan(100);
    });

    it('should provide optimization suggestions', async () => {
      const response = await request(app)
        .get('/api/analytics/budget')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const { optimizationSuggestions } = response.body.data;
      expect(optimizationSuggestions).to.be.an('array');
      
      if (optimizationSuggestions.length > 0) {
        const suggestion = optimizationSuggestions[0];
        expect(suggestion).to.have.property('category');
        expect(suggestion).to.have.property('suggestion');
        expect(suggestion).to.have.property('potentialSavings');
        expect(suggestion).to.have.property('difficulty');
      }
    });
  });

  describe('GET /api/analytics/goals', () => {
    it('should return goal analytics', async () => {
      const response = await request(app)
        .get('/api/analytics/goals')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.totalGoals).to.equal(1);
      expect(response.body.activeGoals).to.equal(1);
      expect(response.body.completedGoals).to.equal(0);
      expect(response.body.totalSaved).to.equal(8500);
      expect(response.body.totalTarget).to.equal(15000);
      expect(response.body.goalsByCategory).to.exist;
    });

    it('should calculate goal progress correctly', async () => {
      const response = await request(app)
        .get('/api/analytics/goals')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const expectedProgress = (8500 / 15000) * 100; // 56.67%
      expect(response.body.totalProgress).to.be.closeTo(expectedProgress, 1);
    });

    it('should group goals by category', async () => {
      const response = await request(app)
        .get('/api/analytics/goals')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const { goalsByCategory } = response.body;
      expect(goalsByCategory.emergency).to.exist;
      expect(goalsByCategory.emergency.count).to.equal(1);
      expect(goalsByCategory.emergency.target).to.equal(15000);
      expect(goalsByCategory.emergency.current).to.equal(8500);
    });
  });

  describe('Error Handling', () => {
    it('should handle unauthorized requests', async () => {
      const response = await request(app)
        .get('/api/analytics/dashboard')
        .expect(401);

      expect(response.body.success).to.be.false;
    });

    it('should handle invalid date formats', async () => {
      const response = await request(app)
        .get('/api/analytics/spending?startDate=invalid-date')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).to.be.false;
      expect(response.body.errors).to.exist;
    });

    it('should handle database connection errors gracefully', async () => {
      // Temporarily close database connection
      await mongoose.connection.close();

      const response = await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.success).to.be.false;

      // Reconnect for other tests
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/finbot_test');
    });
  });

  describe('Performance Tests', () => {
    it('should handle large datasets efficiently', async () => {
      // Create large dataset
      const largeTransactionSet = Array.from({ length: 1000 }, (_, i) => ({
        userId: testUser._id,
        category: 'test',
        amount: Math.random() * 1000,
        date: new Date(2024, 5, Math.floor(i / 30) + 1),
        description: `Test transaction ${i}`,
        type: 'expense'
      }));

      await Transaction.insertMany(largeTransactionSet);

      const startTime = Date.now();

      const response = await request(app)
        .get('/api/analytics/spending')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.body.success).to.be.true;
      expect(duration).to.be.lessThan(3000); // Should complete within 3 seconds
    });

    it('should handle concurrent requests', async () => {
      const concurrentRequests = Array.from({ length: 5 }, () =>
        request(app)
          .get('/api/analytics/dashboard')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(concurrentRequests);

      responses.forEach(response => {
        expect(response.status).to.equal(200);
        expect(response.body.success).to.be.true;
      });
    });
  });

  describe('Data Consistency Tests', () => {
    it('should maintain data consistency across endpoints', async () => {
      // Get spending data from different endpoints
      const [dashboardResponse, spendingResponse, budgetResponse] = await Promise.all([
        request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${authToken}`),
        request(app).get('/api/analytics/spending').set('Authorization', `Bearer ${authToken}`),
        request(app).get('/api/analytics/budget').set('Authorization', `Bearer ${authToken}`)
      ]);

      const dashboardExpenses = dashboardResponse.body.data.monthlyExpenses;
      const spendingTotal = spendingResponse.body.data.totalSpending;
      const budgetSpent = budgetResponse.body.data.totalSpent;

      // All should report the same total spending
      expect(dashboardExpenses).to.equal(spendingTotal);
      expect(spendingTotal).to.equal(budgetSpent);
    });

    it('should update analytics when underlying data changes', async () => {
      // Get initial analytics
      const initialResponse = await request(app)
        .get('/api/analytics/spending')
        .set('Authorization', `Bearer ${authToken}`);

      const initialTotal = initialResponse.body.data.totalSpending;

      // Add new transaction
      await Transaction.create({
        userId: testUser._id,
        category: 'groceries',
        amount: 100,
        date: new Date(),
        description: 'New grocery purchase',
        type: 'expense'
      });

      // Get updated analytics
      const updatedResponse = await request(app)
        .get('/api/analytics/spending')
        .set('Authorization', `Bearer ${authToken}`);

      const updatedTotal = updatedResponse.body.data.totalSpending;

      expect(updatedTotal).to.equal(initialTotal + 100);
    });
  });
});

module.exports = {
  createTestData
};