/**
 * End-to-End Analytics Workflow Tests
 * Complete workflow tests for analytics system integration
 */

const { expect } = require('chai');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const User = require('../../models/User');
const Goal = require('../../models/Goal');
const Transaction = require('../../models/Transaction');
const Budget = require('../../models/Budget');
const Insight = require('../../models/Insight');

describe('Analytics Workflow E2E Tests', () => {
  let testUser;
  let authToken;
  let testGoal;
  let testBudget;

  before(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/finbot_e2e_test');
    }
  });

  beforeEach(async () => {
    // Clean database
    await Promise.all([
      User.deleteMany({}),
      Goal.deleteMany({}),
      Transaction.deleteMany({}),
      Budget.deleteMany({}),
      Insight.deleteMany({})
    ]);

    // Create test user
    testUser = await User.create({
      email: 'e2e.test@example.com',
      password: 'hashedpassword',
      name: 'E2E Test User',
      profile: {
        monthlyIncome: 6000,
        currency: 'USD',
        riskTolerance: 'medium'
      }
    });

    authToken = testUser.generateAuthToken();
    await setupTestData();
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  async function setupTestData() {
    // Create test goal
    testGoal = await Goal.create({
      userId: testUser._id,
      title: 'Emergency Fund',
      targetAmount: 18000,
      currentAmount: 9000,
      targetDate: new Date('2024-12-31'),
      category: 'emergency',
      status: 'active'
    });

    // Create test budget
    testBudget = await Budget.create({
      userId: testUser._id,
      month: new Date('2024-06-01'),
      categories: {
        'groceries': { budgeted: 500, spent: 480 },
        'dining': { budgeted: 400, spent: 520 },
        'transportation': { budgeted: 300, spent: 280 },
        'entertainment': { budgeted: 200, spent: 150 },
        'utilities': { budgeted: 350, spent: 340 },
        'shopping': { budgeted: 300, spent: 450 },
        'healthcare': { budgeted: 150, spent: 120 }
      },
      totalBudgeted: 2200,
      totalSpent: 2340
    });

    // Create test transactions
    const transactions = [
      { category: 'groceries', amount: 120, date: new Date('2024-06-15'), description: 'Weekly groceries' },
      { category: 'dining', amount: 85, date: new Date('2024-06-16'), description: 'Lunch meeting' },
      { category: 'transportation', amount: 45, date: new Date('2024-06-17'), description: 'Gas fill-up' },
      { category: 'entertainment', amount: 60, date: new Date('2024-06-18'), description: 'Movie night' },
      { category: 'shopping', amount: 200, date: new Date('2024-06-19'), description: 'Clothing purchase' },
      { category: 'utilities', amount: 180, date: new Date('2024-06-20'), description: 'Internet bill' },
      { category: 'groceries', amount: 95, date: new Date('2024-06-21'), description: 'Fresh produce' },
      { category: 'dining', amount: 150, date: new Date('2024-06-22'), description: 'Date night dinner' },
      { category: 'healthcare', amount: 75, date: new Date('2024-06-23'), description: 'Prescription' },
      { category: 'transportation', amount: 50, date: new Date('2024-06-24'), description: 'Ride share' }
    ];

    await Transaction.insertMany(
      transactions.map(tx => ({
        ...tx,
        userId: testUser._id,
        type: 'expense'
      }))
    );
  }

  describe('Complete User Journey: New User Onboarding to Advanced Analytics', () => {
    it('should complete full user analytics journey', async () => {
      // Step 1: User gets initial dashboard (should show basic data)
      const initialDashboard = await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(initialDashboard.body.success).to.be.true;
      expect(initialDashboard.body.data.monthlyIncome).to.equal(6000);
      expect(initialDashboard.body.data.monthlyExpenses).to.equal(1060); // Sum of transactions

      // Step 2: User requests AI insights
      const insights = await request(app)
        .get('/api/analytics/insights')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(insights.body.success).to.be.true;
      expect(insights.body.insights).to.be.an('array');

      // Should detect budget overspend in dining and shopping
      const budgetAlerts = insights.body.insights.filter(i => 
        i.type === 'budget_alert' && ['dining', 'shopping'].includes(i.category)
      );
      expect(budgetAlerts.length).to.be.greaterThan(0);

      // Step 3: User acts on an insight
      if (insights.body.insights.length > 0) {
        const firstInsight = insights.body.insights[0];
        
        const actionResponse = await request(app)
          .post(`/api/analytics/insights/${firstInsight.id}/action`)
          .send({ action: 'accept' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(actionResponse.body.success).to.be.true;
      }

      // Step 4: User creates a new goal based on recommendations
      const goalRecommendations = await request(app)
        .get('/api/goals/recommendations')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(goalRecommendations.body.success).to.be.true;

      // Create a vacation goal
      const newGoal = await request(app)
        .post('/api/goals')
        .send({
          title: 'Summer Vacation',
          targetAmount: 5000,
          targetDate: '2024-08-15',
          category: 'travel',
          description: 'Family vacation to Europe'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(newGoal.body.success).to.be.true;
      expect(newGoal.body.goal.feasibilityScore).to.be.within(0, 100);

      // Step 5: User makes progress on goals
      const goalProgress = await request(app)
        .put(`/api/goals/${newGoal.body.goalId}/progress`)
        .send({ amount: 800, note: 'Initial vacation fund contribution' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(goalProgress.body.success).to.be.true;
      expect(goalProgress.body.goal.currentAmount).to.equal(800);

      // Step 6: User gets updated analytics
      const updatedDashboard = await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(updatedDashboard.body.data.goalProgress).to.be.greaterThan(
        initialDashboard.body.data.goalProgress
      );

      // Step 7: User optimizes budget
      const budgetOptimization = await request(app)
        .post('/api/analytics/budget/optimize')
        .send({ 
          preferences: { 
            aggressive: false,
            prioritizeGoals: true,
            maintainLifestyle: true
          }
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(budgetOptimization.body.success).to.be.true;
      expect(budgetOptimization.body.optimizedBudget).to.exist;
      expect(budgetOptimization.body.potentialSavings).to.be.a('number');

      // Step 8: User views comprehensive analytics
      const [spendingAnalytics, goalAnalytics, budgetAnalytics] = await Promise.all([
        request(app).get('/api/analytics/spending').set('Authorization', `Bearer ${authToken}`),
        request(app).get('/api/analytics/goals').set('Authorization', `Bearer ${authToken}`),
        request(app).get('/api/analytics/budget').set('Authorization', `Bearer ${authToken}`)
      ]);

      expect(spendingAnalytics.body.success).to.be.true;
      expect(goalAnalytics.body.success).to.be.true;
      expect(budgetAnalytics.body.success).to.be.true;

      // Verify data consistency across endpoints
      expect(spendingAnalytics.body.data.totalSpending).to.equal(
        budgetAnalytics.body.data.totalSpent
      );
      expect(goalAnalytics.body.totalGoals).to.equal(2); // Emergency fund + vacation
    });
  });

  describe('Budget Optimization Workflow', () => {
    it('should complete budget optimization workflow', async () => {
      // Step 1: Get current budget analysis
      const currentBudget = await request(app)
        .get('/api/analytics/budget')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(currentBudget.body.data.utilization).to.be.greaterThan(100); // Over budget

      // Step 2: Request optimization suggestions
      const optimization = await request(app)
        .post('/api/analytics/budget/optimize')
        .send({
          preferences: {
            aggressive: false,
            categories: ['dining', 'shopping'], // Focus on overspent categories
            goalPriority: 'high'
          }
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(optimization.body.success).to.be.true;
      expect(optimization.body.recommendations).to.be.an('array');
      
      // Should recommend reducing dining and shopping
      const diningRec = optimization.body.recommendations.find(r => r.category === 'dining');
      const shoppingRec = optimization.body.recommendations.find(r => r.category === 'shopping');
      
      expect(diningRec).to.exist;
      expect(shoppingRec).to.exist;
      expect(diningRec.action).to.equal('reduce');
      expect(shoppingRec.action).to.equal('reduce');

      // Step 3: Apply optimization
      const applyOptimization = await request(app)
        .post('/api/analytics/budget/apply')
        .send({
          optimizationId: optimization.body.optimizationId,
          selectedRecommendations: [diningRec.id, shoppingRec.id]
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(applyOptimization.body.success).to.be.true;

      // Step 4: Verify updated budget
      const updatedBudget = await request(app)
        .get('/api/analytics/budget')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(updatedBudget.body.data.utilization).to.be.lessThan(
        currentBudget.body.data.utilization
      );
    });
  });

  describe('Goal Achievement Workflow', () => {
    it('should complete goal achievement workflow with milestones', async () => {
      // Step 1: Get goal details and milestones
      const goalDetails = await request(app)
        .get(`/api/goals/${testGoal._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(goalDetails.body.goal.progressPercentage).to.equal(50); // 9000/18000

      const milestones = await request(app)
        .get(`/api/goals/${testGoal._id}/milestones`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(milestones.body.milestones).to.have.length.greaterThan(0);

      // Step 2: Make contribution to reach next milestone (75%)
      const contributionAmount = 4500; // Will bring total to 13500 (75%)
      
      const progressUpdate = await request(app)
        .put(`/api/goals/${testGoal._id}/progress`)
        .send({ 
          amount: contributionAmount,
          note: 'Large contribution from bonus'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(progressUpdate.body.success).to.be.true;
      expect(progressUpdate.body.goal.currentAmount).to.equal(13500);
      expect(progressUpdate.body.newMilestones).to.have.length.greaterThan(0);

      // Step 3: Check achievements
      const achievements = await request(app)
        .get('/api/goals/achievements')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(achievements.body.success).to.be.true;
      expect(achievements.body.achievements).to.have.length.greaterThan(0);

      // Should have milestone achievement
      const milestoneAchievement = achievements.body.achievements.find(
        a => a.type === 'milestone'
      );
      expect(milestoneAchievement).to.exist;

      // Step 4: Get updated strategy recommendations
      const strategy = await request(app)
        .get(`/api/goals/${testGoal._id}/strategy`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(strategy.body.success).to.be.true;
      expect(strategy.body.strategy.currentRecommendations).to.be.an('array');

      // Step 5: Complete the goal
      const finalContribution = 4500; // Will complete the goal
      
      const completion = await request(app)
        .put(`/api/goals/${testGoal._id}/progress`)
        .send({ 
          amount: finalContribution,
          note: 'Final contribution - goal completed!'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(completion.body.goal.status).to.equal('completed');
      expect(completion.body.goal.currentAmount).to.be.greaterThanOrEqual(18000);

      // Step 6: Verify goal completion analytics
      const finalGoalAnalytics = await request(app)
        .get('/api/analytics/goals')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(finalGoalAnalytics.body.completedGoals).to.equal(1);
    });
  });

  describe('Insight Generation and Action Workflow', () => {
    it('should generate, prioritize, and act on insights', async () => {
      // Step 1: Generate comprehensive insights
      const insights = await request(app)
        .get('/api/analytics/insights?includeAll=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(insights.body.insights).to.have.length.greaterThan(0);

      // Step 2: Filter high-priority actionable insights
      const highPriorityInsights = await request(app)
        .get('/api/analytics/insights?priority=high&actionable=true')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const actionableInsights = highPriorityInsights.body.insights.filter(
        i => i.actionable === true
      );
      expect(actionableInsights.length).to.be.greaterThan(0);

      // Step 3: Act on multiple insights
      const insightActions = actionableInsights.slice(0, 3).map(insight => 
        request(app)
          .post(`/api/analytics/insights/${insight.id}/action`)
          .send({ 
            action: 'accept',
            note: 'Implementing this recommendation'
          })
          .set('Authorization', `Bearer ${authToken}`)
      );

      const actionResults = await Promise.all(insightActions);
      actionResults.forEach(result => {
        expect(result.status).to.equal(200);
        expect(result.body.success).to.be.true;
      });

      // Step 4: Verify insight impact on analytics
      const updatedAnalytics = await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(updatedAnalytics.body.success).to.be.true;

      // Step 5: Get personalized recommendations based on actions
      const personalizedInsights = await request(app)
        .get('/api/analytics/insights/personalized')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(personalizedInsights.body.success).to.be.true;
      expect(personalizedInsights.body.insights).to.be.an('array');
    });
  });

  describe('Real-time Analytics Updates', () => {
    it('should handle real-time transaction processing and analytics updates', async () => {
      // Step 1: Get baseline analytics
      const baselineSpending = await request(app)
        .get('/api/analytics/spending')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const baselineTotal = baselineSpending.body.data.totalSpending;

      // Step 2: Add new transaction
      const newTransaction = await request(app)
        .post('/api/transactions')
        .send({
          category: 'groceries',
          amount: 150,
          description: 'Weekly grocery shopping',
          date: new Date().toISOString()
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      expect(newTransaction.body.success).to.be.true;

      // Step 3: Verify immediate analytics update
      const updatedSpending = await request(app)
        .get('/api/analytics/spending')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(updatedSpending.body.data.totalSpending).to.equal(baselineTotal + 150);

      // Step 4: Check for real-time insights
      const realtimeInsights = await request(app)
        .get('/api/analytics/insights/realtime')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(realtimeInsights.body.success).to.be.true;

      // Step 5: Verify dashboard reflects changes
      const updatedDashboard = await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(updatedDashboard.body.data.monthlyExpenses).to.equal(baselineTotal + 150);
    });
  });

  describe('Cross-Feature Integration', () => {
    it('should demonstrate integration between goals, budget, and insights', async () => {
      // Step 1: Create aggressive savings goal
      const aggressiveGoal = await request(app)
        .post('/api/goals')
        .send({
          title: 'House Down Payment',
          targetAmount: 50000,
          targetDate: '2025-06-01',
          category: 'home'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(201);

      // Step 2: Get budget optimization considering new goal
      const goalAwareBudget = await request(app)
        .post('/api/analytics/budget/optimize')
        .send({
          preferences: {
            goalPriority: 'high',
            considerGoals: [aggressiveGoal.body.goalId]
          }
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(goalAwareBudget.body.recommendations).to.be.an('array');

      // Step 3: Get insights that consider both budget and goals
      const contextualInsights = await request(app)
        .get('/api/analytics/insights?context=goals_and_budget')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Should include insights about aggressive savings needed
      const savingsInsights = contextualInsights.body.insights.filter(
        i => i.type === 'savings_acceleration' || i.category === 'goal_strategy'
      );
      expect(savingsInsights.length).to.be.greaterThan(0);

      // Step 4: Apply integrated recommendations
      const integratedAction = await request(app)
        .post('/api/analytics/apply-integrated-recommendations')
        .send({
          budgetOptimizationId: goalAwareBudget.body.optimizationId,
          goalId: aggressiveGoal.body.goalId,
          insightIds: savingsInsights.map(i => i.id).slice(0, 2)
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(integratedAction.body.success).to.be.true;

      // Step 5: Verify integrated impact
      const finalAnalytics = await Promise.all([
        request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${authToken}`),
        request(app).get('/api/analytics/goals').set('Authorization', `Bearer ${authToken}`),
        request(app).get('/api/analytics/budget').set('Authorization', `Bearer ${authToken}`)
      ]);

      finalAnalytics.forEach(response => {
        expect(response.body.success).to.be.true;
      });

      // Dashboard should reflect optimized financial plan
      const dashboard = finalAnalytics[0].body.data;
      expect(dashboard.savingsRate).to.be.greaterThan(20); // Should be optimized for goals
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle partial system failures gracefully', async () => {
      // Simulate ML service being down
      process.env.ML_SERVICE_ENABLED = 'false';

      // Analytics should still work with fallback methods
      const analyticsWithFallback = await request(app)
        .get('/api/analytics/insights')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(analyticsWithFallback.body.success).to.be.true;
      expect(analyticsWithFallback.body.insights).to.be.an('array');
      
      // Should indicate fallback method was used
      if (analyticsWithFallback.body.insights.length > 0) {
        expect(analyticsWithFallback.body.metadata.method).to.include('fallback');
      }

      // Re-enable ML service
      process.env.ML_SERVICE_ENABLED = 'true';
    });

    it('should maintain data consistency during concurrent operations', async () => {
      // Perform multiple concurrent operations
      const concurrentOperations = [
        request(app).put(`/api/goals/${testGoal._id}/progress`).send({ amount: 500 }).set('Authorization', `Bearer ${authToken}`),
        request(app).post('/api/transactions').send({ category: 'dining', amount: 75, description: 'Lunch' }).set('Authorization', `Bearer ${authToken}`),
        request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${authToken}`),
        request(app).get('/api/analytics/spending').set('Authorization', `Bearer ${authToken}`),
        request(app).post('/api/analytics/budget/optimize').send({ preferences: {} }).set('Authorization', `Bearer ${authToken}`)
      ];

      const results = await Promise.all(concurrentOperations);

      // All operations should succeed
      results.forEach((result, index) => {
        expect(result.status).to.be.oneOf([200, 201], `Operation ${index} failed`);
      });

      // Verify data consistency
      const finalCheck = await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(finalCheck.body.success).to.be.true;
    });
  });
});

module.exports = {
  setupTestData
};