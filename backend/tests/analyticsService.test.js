/**
 * Analytics Service Tests
 * Comprehensive tests for AI-powered financial analytics services
 */

const { expect } = require('chai');
const sinon = require('sinon');
const request = require('supertest');
const express = require('express');

// Mock services and dependencies
const AnalyticsService = require('../services/AnalyticsService');
const InsightEngine = require('../services/InsightEngine');
const BudgetOptimizationService = require('../services/BudgetOptimizationService');
const GoalTrackingService = require('../services/GoalTrackingService');

describe('Analytics Service Integration Tests', () => {
  let app;
  let analyticsService;
  let insightEngine;
  let budgetService;
  let goalService;
  let mockUserId;
  let authToken;

  beforeEach(() => {
    // Initialize services
    analyticsService = new AnalyticsService();
    insightEngine = new InsightEngine();
    budgetService = new BudgetOptimizationService();
    goalService = new GoalTrackingService();
    
    mockUserId = 'user123';
    authToken = 'mock-jwt-token';

    // Setup Express app for testing
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    app.use((req, res, next) => {
      req.user = { id: mockUserId, email: 'test@example.com' };
      next();
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Analytics API Endpoints', () => {
    describe('GET /api/analytics/dashboard', () => {
      it('should return comprehensive dashboard data', async () => {
        // Mock dashboard data
        const mockDashboardData = {
          totalBalance: 25000,
          monthlyIncome: 5000,
          monthlyExpenses: 3500,
          savingsRate: 30,
          budgetUtilization: 70,
          goalProgress: 65,
          insights: [
            {
              id: 'insight1',
              type: 'spending',
              title: 'Dining out increased by 20%',
              description: 'Your dining expenses have increased significantly this month',
              priority: 'medium',
              confidence: 85
            }
          ],
          recentTransactions: [],
          upcomingBills: [],
          achievements: []
        };

        sinon.stub(analyticsService, 'getDashboardData').resolves(mockDashboardData);

        const response = await request(app)
          .get('/api/analytics/dashboard')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).to.be.true;
        expect(response.body.data).to.deep.equal(mockDashboardData);
        expect(analyticsService.getDashboardData.calledWith(mockUserId)).to.be.true;
      });

      it('should handle dashboard data retrieval errors', async () => {
        sinon.stub(analyticsService, 'getDashboardData').rejects(new Error('Database error'));

        const response = await request(app)
          .get('/api/analytics/dashboard')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(500);

        expect(response.body.success).to.be.false;
        expect(response.body.error).to.include('error');
      });
    });

    describe('GET /api/analytics/insights', () => {
      it('should return AI-generated insights', async () => {
        const mockInsights = [
          {
            id: 'insight1',
            type: 'saving',
            title: 'Potential Monthly Savings',
            description: 'You could save $200/month by optimizing subscriptions',
            priority: 'high',
            confidence: 92,
            actionable: true,
            potentialSavings: 200,
            category: 'subscriptions'
          },
          {
            id: 'insight2',
            type: 'spending',
            title: 'Unusual Spending Pattern',
            description: 'Entertainment spending is 40% above average',
            priority: 'medium',
            confidence: 78,
            actionable: true,
            category: 'entertainment'
          }
        ];

        sinon.stub(insightEngine, 'generateInsights').resolves(mockInsights);

        const response = await request(app)
          .get('/api/analytics/insights')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).to.be.true;
        expect(response.body.insights).to.have.length(2);
        expect(response.body.insights[0].potentialSavings).to.equal(200);
      });

      it('should filter insights by category', async () => {
        const mockInsights = [
          { id: '1', category: 'spending', type: 'spending' },
          { id: '2', category: 'saving', type: 'saving' }
        ];

        sinon.stub(insightEngine, 'generateInsights').resolves(mockInsights);

        const response = await request(app)
          .get('/api/analytics/insights?category=spending')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.insights).to.have.length(1);
        expect(response.body.insights[0].category).to.equal('spending');
      });

      it('should limit insights based on query parameter', async () => {
        const mockInsights = Array.from({ length: 10 }, (_, i) => ({
          id: `insight${i}`,
          type: 'spending',
          category: 'general'
        }));

        sinon.stub(insightEngine, 'generateInsights').resolves(mockInsights);

        const response = await request(app)
          .get('/api/analytics/insights?limit=5')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.insights).to.have.length(5);
      });
    });

    describe('POST /api/analytics/insights/:insightId/action', () => {
      it('should process insight action successfully', async () => {
        const insightId = 'insight123';
        const action = 'accept';

        sinon.stub(insightEngine, 'processInsightAction').resolves({
          success: true,
          message: 'Action processed successfully'
        });

        const response = await request(app)
          .post(`/api/analytics/insights/${insightId}/action`)
          .send({ action })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).to.be.true;
        expect(insightEngine.processInsightAction.calledWith(mockUserId, insightId, action)).to.be.true;
      });

      it('should validate action parameter', async () => {
        const response = await request(app)
          .post('/api/analytics/insights/insight123/action')
          .send({ action: 'invalid_action' })
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        expect(response.body.success).to.be.false;
        expect(response.body.errors).to.exist;
      });
    });

    describe('GET /api/analytics/spending', () => {
      it('should return spending analytics', async () => {
        const mockSpendingData = {
          totalSpending: 3500,
          categoryBreakdown: {
            'Food & Dining': 800,
            'Transportation': 400,
            'Shopping': 600,
            'Entertainment': 300,
            'Bills & Utilities': 1200,
            'Healthcare': 200
          },
          monthlyTrend: [3200, 3400, 3100, 3500],
          comparisonToPrevious: {
            amount: 200,
            percentage: 6.1,
            trend: 'increase'
          },
          topCategories: [
            { category: 'Bills & Utilities', amount: 1200, percentage: 34.3 },
            { category: 'Food & Dining', amount: 800, percentage: 22.9 }
          ]
        };

        sinon.stub(analyticsService, 'getSpendingAnalytics').resolves(mockSpendingData);

        const response = await request(app)
          .get('/api/analytics/spending')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).to.be.true;
        expect(response.body.data.totalSpending).to.equal(3500);
        expect(response.body.data.categoryBreakdown).to.exist;
        expect(response.body.data.monthlyTrend).to.have.length(4);
      });

      it('should support date range filtering', async () => {
        const startDate = '2024-01-01';
        const endDate = '2024-01-31';

        sinon.stub(analyticsService, 'getSpendingAnalytics').resolves({});

        await request(app)
          .get(`/api/analytics/spending?startDate=${startDate}&endDate=${endDate}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(analyticsService.getSpendingAnalytics.calledWith(
          mockUserId, 
          sinon.match.has('startDate', new Date(startDate))
        )).to.be.true;
      });
    });

    describe('GET /api/analytics/budget', () => {
      it('should return budget analytics and optimization suggestions', async () => {
        const mockBudgetData = {
          totalBudget: 4000,
          totalSpent: 3500,
          utilization: 87.5,
          categories: [
            {
              name: 'Food & Dining',
              budgeted: 800,
              spent: 850,
              utilization: 106.25,
              status: 'over_budget'
            },
            {
              name: 'Transportation',
              budgeted: 500,
              spent: 400,
              utilization: 80,
              status: 'on_track'
            }
          ],
          optimizationSuggestions: [
            {
              category: 'Food & Dining',
              suggestion: 'Consider meal planning to reduce dining out expenses',
              potentialSavings: 150,
              difficulty: 'medium'
            }
          ],
          projectedEndOfMonth: {
            totalProjected: 3800,
            overBudgetCategories: ['Food & Dining'],
            projectedSavings: 200
          }
        };

        sinon.stub(budgetService, 'getBudgetAnalytics').resolves(mockBudgetData);

        const response = await request(app)
          .get('/api/analytics/budget')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).to.be.true;
        expect(response.body.data.utilization).to.equal(87.5);
        expect(response.body.data.optimizationSuggestions).to.have.length(1);
        expect(response.body.data.categories).to.have.length(2);
      });
    });

    describe('GET /api/analytics/goals', () => {
      it('should return goal analytics and progress', async () => {
        const mockGoalData = {
          totalGoals: 4,
          activeGoals: 3,
          completedGoals: 1,
          totalProgress: 65.5,
          totalSaved: 15000,
          totalTarget: 45000,
          goalsByCategory: {
            'emergency': { count: 1, progress: 80, target: 15000, current: 12000 },
            'travel': { count: 1, progress: 45, target: 8000, current: 3600 },
            'home': { count: 1, progress: 25, target: 50000, current: 12500 }
          },
          recentMilestones: [
            {
              goalId: 'goal1',
              goalTitle: 'Emergency Fund',
              milestone: '75% Complete',
              achievedAt: new Date('2024-06-10')
            }
          ],
          projectedCompletions: [
            {
              goalId: 'goal1',
              title: 'Emergency Fund',
              projectedDate: new Date('2024-08-15'),
              onTrack: true
            }
          ]
        };

        sinon.stub(goalService, 'getGoalAnalytics').resolves({ success: true, ...mockGoalData });

        const response = await request(app)
          .get('/api/analytics/goals')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).to.be.true;
        expect(response.body.totalGoals).to.equal(4);
        expect(response.body.goalsByCategory).to.exist;
        expect(response.body.recentMilestones).to.have.length(1);
      });
    });
  });

  describe('Business Logic Tests', () => {
    describe('Analytics Service Core Functions', () => {
      it('should calculate financial health score correctly', () => {
        const financialData = {
          income: 5000,
          expenses: 3500,
          savings: 1500,
          debt: 2000,
          emergencyFund: 10000,
          investmentValue: 25000
        };

        const healthScore = analyticsService.calculateFinancialHealthScore(financialData);

        expect(healthScore).to.be.within(0, 100);
        expect(healthScore).to.be.a('number');
      });

      it('should identify spending anomalies', () => {
        const transactionHistory = [
          { category: 'dining', amount: 50, date: '2024-06-01' },
          { category: 'dining', amount: 45, date: '2024-06-02' },
          { category: 'dining', amount: 55, date: '2024-06-03' },
          { category: 'dining', amount: 200, date: '2024-06-04' }, // Anomaly
          { category: 'dining', amount: 48, date: '2024-06-05' }
        ];

        const anomalies = analyticsService.detectSpendingAnomalies(transactionHistory);

        expect(anomalies).to.be.an('array');
        expect(anomalies).to.have.length(1);
        expect(anomalies[0].amount).to.equal(200);
        expect(anomalies[0].anomalyScore).to.be.greaterThan(0.8);
      });

      it('should generate spending predictions', () => {
        const historicalData = [
          { month: '2024-01', total: 3200 },
          { month: '2024-02', total: 3400 },
          { month: '2024-03', total: 3100 },
          { month: '2024-04', total: 3500 },
          { month: '2024-05', total: 3300 }
        ];

        const prediction = analyticsService.predictNextMonthSpending(historicalData);

        expect(prediction).to.exist;
        expect(prediction.predictedAmount).to.be.a('number');
        expect(prediction.confidence).to.be.within(0, 1);
        expect(prediction.range).to.exist;
        expect(prediction.range.min).to.be.lessThan(prediction.range.max);
      });

      it('should calculate savings potential', () => {
        const spendingData = {
          categories: {
            'subscriptions': { current: 150, average: 100, potential: 50 },
            'dining': { current: 800, average: 600, potential: 200 },
            'transportation': { current: 400, average: 350, potential: 50 }
          }
        };

        const savingsPotential = analyticsService.calculateSavingsPotential(spendingData);

        expect(savingsPotential.totalPotential).to.equal(300);
        expect(savingsPotential.recommendations).to.have.length(3);
        expect(savingsPotential.recommendations[0].category).to.equal('dining');
        expect(savingsPotential.recommendations[0].potential).to.equal(200);
      });
    });

    describe('Insight Engine Functions', () => {
      it('should generate personalized insights', async () => {
        const userData = {
          userId: mockUserId,
          spendingHistory: [
            { category: 'dining', amount: 800, month: '2024-06' },
            { category: 'dining', amount: 600, month: '2024-05' }
          ],
          budgets: {
            'dining': 700
          },
          goals: [
            { category: 'emergency', progress: 60, target: 15000 }
          ]
        };

        const insights = await insightEngine.generatePersonalizedInsights(userData);

        expect(insights).to.be.an('array');
        expect(insights.length).to.be.greaterThan(0);
        
        const budgetInsight = insights.find(i => i.type === 'budget_alert');
        expect(budgetInsight).to.exist;
        expect(budgetInsight.category).to.equal('dining');
      });

      it('should rank insights by priority and confidence', () => {
        const rawInsights = [
          { id: '1', priority: 'low', confidence: 90 },
          { id: '2', priority: 'high', confidence: 70 },
          { id: '3', priority: 'medium', confidence: 85 },
          { id: '4', priority: 'high', confidence: 95 }
        ];

        const rankedInsights = insightEngine.rankInsights(rawInsights);

        expect(rankedInsights[0].id).to.equal('4'); // High priority, high confidence
        expect(rankedInsights[1].id).to.equal('2'); // High priority, lower confidence
        expect(rankedInsights[2].id).to.equal('3'); // Medium priority
        expect(rankedInsights[3].id).to.equal('1'); // Low priority
      });

      it('should filter duplicate insights', () => {
        const insights = [
          { id: '1', type: 'spending', category: 'dining', fingerprint: 'dining_overspend' },
          { id: '2', type: 'spending', category: 'dining', fingerprint: 'dining_overspend' },
          { id: '3', type: 'saving', category: 'subscriptions', fingerprint: 'sub_optimization' }
        ];

        const uniqueInsights = insightEngine.filterDuplicateInsights(insights);

        expect(uniqueInsights).to.have.length(2);
        expect(uniqueInsights.map(i => i.fingerprint)).to.deep.equal(['dining_overspend', 'sub_optimization']);
      });
    });

    describe('Budget Optimization Functions', () => {
      it('should optimize budget allocation', () => {
        const currentBudget = {
          'dining': 800,
          'transportation': 400,
          'entertainment': 300,
          'shopping': 500
        };

        const spendingHistory = {
          'dining': { average: 650, trend: 'decreasing' },
          'transportation': { average: 420, trend: 'increasing' },
          'entertainment': { average: 250, trend: 'stable' },
          'shopping': { average: 600, trend: 'increasing' }
        };

        const optimizedBudget = budgetService.optimizeBudgetAllocation(currentBudget, spendingHistory);

        expect(optimizedBudget).to.exist;
        expect(optimizedBudget.recommendations).to.be.an('array');
        expect(optimizedBudget.totalSavings).to.be.a('number');
        
        // Should recommend reducing dining budget and increasing shopping budget
        const diningRec = optimizedBudget.recommendations.find(r => r.category === 'dining');
        const shoppingRec = optimizedBudget.recommendations.find(r => r.category === 'shopping');
        
        expect(diningRec.action).to.equal('decrease');
        expect(shoppingRec.action).to.equal('increase');
      });

      it('should generate budget alerts', () => {
        const budgetData = {
          categories: [
            { name: 'dining', budgeted: 700, spent: 750, daysInMonth: 30, dayOfMonth: 20 },
            { name: 'transportation', budgeted: 400, spent: 200, daysInMonth: 30, dayOfMonth: 20 }
          ]
        };

        const alerts = budgetService.generateBudgetAlerts(budgetData);

        expect(alerts).to.be.an('array');
        expect(alerts).to.have.length(1);
        expect(alerts[0].category).to.equal('dining');
        expect(alerts[0].type).to.equal('over_budget');
      });
    });
  });

  describe('ML Model Integration Tests', () => {
    describe('Spending Prediction Model', () => {
      it('should integrate with ML model for spending predictions', async () => {
        const mockMLResponse = {
          prediction: 3450.75,
          confidence: 0.87,
          features_used: ['historical_spending', 'seasonal_patterns', 'user_behavior'],
          model_version: 'v2.1.0'
        };

        // Mock ML service call
        sinon.stub(analyticsService, 'callMLModel').resolves(mockMLResponse);

        const userSpendingData = {
          userId: mockUserId,
          historicalSpending: [3200, 3400, 3100, 3500, 3300],
          seasonalFactors: { month: 6, isHoliday: false },
          userProfile: { age: 30, income: 5000 }
        };

        const prediction = await analyticsService.predictSpendingWithML(userSpendingData);

        expect(prediction.amount).to.equal(3450.75);
        expect(prediction.confidence).to.equal(0.87);
        expect(analyticsService.callMLModel.calledOnce).to.be.true;
      });

      it('should handle ML model failures gracefully', async () => {
        sinon.stub(analyticsService, 'callMLModel').rejects(new Error('ML service unavailable'));

        const userSpendingData = {
          userId: mockUserId,
          historicalSpending: [3200, 3400, 3100]
        };

        const prediction = await analyticsService.predictSpendingWithML(userSpendingData);

        // Should fallback to statistical prediction
        expect(prediction.amount).to.be.a('number');
        expect(prediction.confidence).to.be.lessThan(0.7); // Lower confidence for fallback
        expect(prediction.method).to.equal('statistical_fallback');
      });
    });

    describe('Anomaly Detection Model', () => {
      it('should integrate with ML model for anomaly detection', async () => {
        const mockMLResponse = {
          anomalies: [
            {
              transaction_id: 'tx123',
              anomaly_score: 0.92,
              reasons: ['unusual_amount', 'unusual_merchant'],
              risk_level: 'high'
            }
          ],
          model_version: 'anomaly_v1.5.0'
        };

        sinon.stub(analyticsService, 'callMLModel').resolves(mockMLResponse);

        const transactionData = [
          { id: 'tx123', amount: 2500, merchant: 'Unknown Store', category: 'shopping' },
          { id: 'tx124', amount: 45, merchant: 'Grocery Store', category: 'groceries' }
        ];

        const anomalies = await analyticsService.detectAnomaliesWithML(mockUserId, transactionData);

        expect(anomalies).to.have.length(1);
        expect(anomalies[0].transactionId).to.equal('tx123');
        expect(anomalies[0].score).to.equal(0.92);
        expect(anomalies[0].riskLevel).to.equal('high');
      });
    });

    describe('Insight Generation Model', () => {
      it('should integrate with ML model for insight generation', async () => {
        const mockMLResponse = {
          insights: [
            {
              type: 'optimization',
              category: 'subscriptions',
              title: 'Subscription Optimization Opportunity',
              description: 'You have 3 unused subscriptions costing $47/month',
              confidence: 0.89,
              potential_savings: 47,
              actionable: true
            }
          ],
          model_version: 'insights_v3.2.0'
        };

        sinon.stub(analyticsService, 'callMLModel').resolves(mockMLResponse);

        const userData = {
          userId: mockUserId,
          transactions: [],
          subscriptions: [],
          spending_patterns: {}
        };

        const insights = await insightEngine.generateInsightsWithML(userData);

        expect(insights).to.have.length(1);
        expect(insights[0].type).to.equal('optimization');
        expect(insights[0].potentialSavings).to.equal(47);
        expect(insights[0].confidence).to.equal(0.89);
      });
    });
  });

  describe('End-to-End Workflow Tests', () => {
    it('should complete full analytics workflow', async () => {
      // 1. User requests dashboard data
      const dashboardRequest = await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(dashboardRequest.status).to.equal(200);

      // 2. User requests insights
      const insightsRequest = await request(app)
        .get('/api/analytics/insights')
        .set('Authorization', `Bearer ${authToken}`);

      expect(insightsRequest.status).to.equal(200);

      // 3. User acts on an insight
      const actionRequest = await request(app)
        .post('/api/analytics/insights/insight1/action')
        .send({ action: 'accept' })
        .set('Authorization', `Bearer ${authToken}`);

      expect(actionRequest.status).to.equal(200);

      // 4. User checks updated analytics
      const updatedAnalytics = await request(app)
        .get('/api/analytics/spending')
        .set('Authorization', `Bearer ${authToken}`);

      expect(updatedAnalytics.status).to.equal(200);
    });

    it('should handle complete budget optimization workflow', async () => {
      // 1. Get current budget analytics
      const budgetAnalytics = await request(app)
        .get('/api/analytics/budget')
        .set('Authorization', `Bearer ${authToken}`);

      expect(budgetAnalytics.status).to.equal(200);

      // 2. Request budget optimization
      const optimizationRequest = await request(app)
        .post('/api/analytics/budget/optimize')
        .send({ preferences: { aggressive: false } })
        .set('Authorization', `Bearer ${authToken}`);

      expect(optimizationRequest.status).to.equal(200);

      // 3. Apply optimization suggestions
      const applyOptimization = await request(app)
        .post('/api/analytics/budget/apply-optimization')
        .send({ optimizationId: 'opt123' })
        .set('Authorization', `Bearer ${authToken}`);

      expect(applyOptimization.status).to.equal(200);
    });

    it('should handle complete goal tracking workflow', async () => {
      // 1. Get goal analytics
      const goalAnalytics = await request(app)
        .get('/api/analytics/goals')
        .set('Authorization', `Bearer ${authToken}`);

      expect(goalAnalytics.status).to.equal(200);

      // 2. Create new goal based on recommendations
      const createGoal = await request(app)
        .post('/api/goals')
        .send({
          title: 'Emergency Fund',
          targetAmount: 15000,
          targetDate: '2024-12-31',
          category: 'emergency'
        })
        .set('Authorization', `Bearer ${authToken}`);

      expect(createGoal.status).to.equal(201);

      // 3. Update goal progress
      const updateProgress = await request(app)
        .put(`/api/goals/${createGoal.body.goalId}/progress`)
        .send({ amount: 1000 })
        .set('Authorization', `Bearer ${authToken}`);

      expect(updateProgress.status).to.equal(200);

      // 4. Check updated analytics
      const updatedGoalAnalytics = await request(app)
        .get('/api/analytics/goals')
        .set('Authorization', `Bearer ${authToken}`);

      expect(updatedGoalAnalytics.status).to.equal(200);
    });
  });

  describe('Performance and Load Tests', () => {
    it('should handle concurrent analytics requests', async () => {
      const concurrentRequests = Array.from({ length: 10 }, () =>
        request(app)
          .get('/api/analytics/dashboard')
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(concurrentRequests);

      responses.forEach(response => {
        expect(response.status).to.equal(200);
      });
    });

    it('should complete analytics calculations within time limits', async () => {
      const startTime = Date.now();

      await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).to.be.lessThan(2000); // Should complete within 2 seconds
    });

    it('should handle large datasets efficiently', async () => {
      // Mock large dataset
      const largeTransactionSet = Array.from({ length: 10000 }, (_, i) => ({
        id: `tx${i}`,
        amount: Math.random() * 1000,
        category: 'test',
        date: new Date()
      }));

      sinon.stub(analyticsService, 'getTransactionHistory').resolves(largeTransactionSet);

      const startTime = Date.now();

      const response = await request(app)
        .get('/api/analytics/spending')
        .set('Authorization', `Bearer ${authToken}`);

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.status).to.equal(200);
      expect(duration).to.be.lessThan(5000); // Should handle large dataset within 5 seconds
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing user data gracefully', async () => {
      sinon.stub(analyticsService, 'getDashboardData').resolves(null);

      const response = await request(app)
        .get('/api/analytics/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).to.be.true;
      expect(response.body.data).to.exist;
      // Should return default/empty dashboard data
    });

    it('should handle invalid date ranges', async () => {
      const response = await request(app)
        .get('/api/analytics/spending?startDate=invalid&endDate=2024-01-31')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).to.be.false;
      expect(response.body.errors).to.exist;
    });

    it('should handle ML model timeout', async () => {
      sinon.stub(analyticsService, 'callMLModel').callsFake(() => 
        new Promise((resolve) => setTimeout(resolve, 10000)) // 10 second timeout
      );

      const response = await request(app)
        .get('/api/analytics/insights')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Should fallback to rule-based insights
      expect(response.body.success).to.be.true;
      expect(response.body.insights).to.exist;
    });

    it('should validate input parameters', async () => {
      const response = await request(app)
        .post('/api/analytics/insights/invalid-id/action')
        .send({ action: 'invalid' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).to.be.false;
      expect(response.body.errors).to.be.an('array');
    });
  });
});

module.exports = {
  AnalyticsService,
  InsightEngine,
  BudgetOptimizationService
};