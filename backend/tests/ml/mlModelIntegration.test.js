/**
 * ML Model Integration Tests
 * Tests for ML model integration with analytics services
 */

const { expect } = require('chai');
const sinon = require('sinon');
const axios = require('axios');
const MLModelService = require('../../services/MLModelService');
const PredictionService = require('../../services/PredictionService');
const AnomalyDetectionService = require('../../services/AnomalyDetectionService');

describe('ML Model Integration Tests', () => {
  let mlService;
  let predictionService;
  let anomalyService;
  let mockUserId;

  beforeEach(() => {
    mlService = new MLModelService();
    predictionService = new PredictionService();
    anomalyService = new AnomalyDetectionService();
    mockUserId = 'user123';
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('ML Model Service', () => {
    describe('Model Loading and Initialization', () => {
      it('should load spending prediction model successfully', async () => {
        const mockModelResponse = {
          model_id: 'spending_predictor_v2.1',
          status: 'loaded',
          version: '2.1.0',
          features: ['historical_spending', 'seasonal_patterns', 'user_demographics'],
          accuracy: 0.87
        };

        sinon.stub(axios, 'get').resolves({ data: mockModelResponse });

        const result = await mlService.loadModel('spending_predictor');

        expect(result.success).to.be.true;
        expect(result.model.model_id).to.equal('spending_predictor_v2.1');
        expect(result.model.accuracy).to.equal(0.87);
      });

      it('should handle model loading failures gracefully', async () => {
        sinon.stub(axios, 'get').rejects(new Error('Model service unavailable'));

        const result = await mlService.loadModel('spending_predictor');

        expect(result.success).to.be.false;
        expect(result.error).to.include('unavailable');
        expect(result.fallback).to.be.true;
      });

      it('should cache loaded models', async () => {
        const mockModelResponse = {
          model_id: 'test_model',
          status: 'loaded'
        };

        const axiosStub = sinon.stub(axios, 'get').resolves({ data: mockModelResponse });

        // Load model twice
        await mlService.loadModel('test_model');
        await mlService.loadModel('test_model');

        // Should only make one API call due to caching
        expect(axiosStub.calledOnce).to.be.true;
      });
    });

    describe('Model Prediction Calls', () => {
      it('should make successful prediction calls', async () => {
        const mockPredictionResponse = {
          prediction: 3450.75,
          confidence: 0.87,
          features_used: ['historical_spending', 'seasonal_patterns'],
          model_version: 'v2.1.0',
          processing_time_ms: 45
        };

        sinon.stub(axios, 'post').resolves({ data: mockPredictionResponse });

        const inputData = {
          user_id: mockUserId,
          historical_spending: [3200, 3400, 3100, 3500],
          seasonal_factors: { month: 6, is_holiday: false },
          user_profile: { age: 30, income: 5000 }
        };

        const result = await mlService.predict('spending_predictor', inputData);

        expect(result.success).to.be.true;
        expect(result.prediction).to.equal(3450.75);
        expect(result.confidence).to.equal(0.87);
        expect(result.processingTime).to.equal(45);
      });

      it('should handle prediction timeouts', async () => {
        sinon.stub(axios, 'post').callsFake(() => 
          new Promise((resolve) => setTimeout(resolve, 10000))
        );

        const inputData = { user_id: mockUserId };
        const result = await mlService.predict('spending_predictor', inputData, { timeout: 1000 });

        expect(result.success).to.be.false;
        expect(result.error).to.include('timeout');
        expect(result.fallback).to.be.true;
      });

      it('should validate input data before prediction', async () => {
        const invalidInputData = {
          // Missing required fields
          user_id: null,
          historical_spending: []
        };

        const result = await mlService.predict('spending_predictor', invalidInputData);

        expect(result.success).to.be.false;
        expect(result.error).to.include('validation');
      });

      it('should handle malformed prediction responses', async () => {
        sinon.stub(axios, 'post').resolves({ 
          data: { 
            // Missing required fields
            confidence: 0.5 
          } 
        });

        const inputData = { user_id: mockUserId, historical_spending: [1000, 2000] };
        const result = await mlService.predict('spending_predictor', inputData);

        expect(result.success).to.be.false;
        expect(result.error).to.include('malformed');
      });
    });

    describe('Model Health Monitoring', () => {
      it('should check model health status', async () => {
        const mockHealthResponse = {
          status: 'healthy',
          uptime: 3600,
          requests_per_minute: 45,
          average_response_time: 120,
          error_rate: 0.02,
          memory_usage: 0.65,
          cpu_usage: 0.45
        };

        sinon.stub(axios, 'get').resolves({ data: mockHealthResponse });

        const health = await mlService.checkModelHealth('spending_predictor');

        expect(health.status).to.equal('healthy');
        expect(health.errorRate).to.equal(0.02);
        expect(health.averageResponseTime).to.equal(120);
      });

      it('should detect unhealthy models', async () => {
        const mockHealthResponse = {
          status: 'unhealthy',
          error_rate: 0.25, // High error rate
          average_response_time: 5000 // Slow response
        };

        sinon.stub(axios, 'get').resolves({ data: mockHealthResponse });

        const health = await mlService.checkModelHealth('spending_predictor');

        expect(health.status).to.equal('unhealthy');
        expect(health.recommendations).to.be.an('array');
        expect(health.recommendations).to.include('Consider model retraining');
      });
    });
  });

  describe('Prediction Service Integration', () => {
    describe('Spending Predictions', () => {
      it('should generate accurate spending predictions', async () => {
        const mockMLResponse = {
          prediction: 3450.75,
          confidence: 0.87,
          breakdown: {
            'groceries': 800,
            'dining': 600,
            'transportation': 400,
            'entertainment': 300,
            'utilities': 500,
            'other': 850.75
          },
          factors: {
            'seasonal_adjustment': 1.05,
            'trend_factor': 0.98,
            'user_behavior_factor': 1.02
          }
        };

        sinon.stub(mlService, 'predict').resolves({
          success: true,
          ...mockMLResponse
        });

        const userSpendingData = {
          userId: mockUserId,
          historicalSpending: [3200, 3400, 3100, 3500, 3300],
          currentMonth: 6,
          userProfile: { age: 30, income: 5000, location: 'urban' }
        };

        const prediction = await predictionService.predictMonthlySpending(userSpendingData);

        expect(prediction.success).to.be.true;
        expect(prediction.totalPredicted).to.equal(3450.75);
        expect(prediction.confidence).to.equal(0.87);
        expect(prediction.categoryBreakdown).to.exist;
        expect(prediction.categoryBreakdown.groceries).to.equal(800);
      });

      it('should provide prediction ranges and uncertainty', async () => {
        const mockMLResponse = {
          prediction: 3450.75,
          confidence: 0.87,
          prediction_interval: {
            lower_bound: 3100.50,
            upper_bound: 3801.00,
            confidence_level: 0.95
          }
        };

        sinon.stub(mlService, 'predict').resolves({
          success: true,
          ...mockMLResponse
        });

        const prediction = await predictionService.predictMonthlySpending({
          userId: mockUserId,
          historicalSpending: [3200, 3400, 3100]
        });

        expect(prediction.range).to.exist;
        expect(prediction.range.min).to.equal(3100.50);
        expect(prediction.range.max).to.equal(3801.00);
        expect(prediction.uncertainty).to.be.a('number');
      });

      it('should fallback to statistical methods when ML fails', async () => {
        sinon.stub(mlService, 'predict').resolves({
          success: false,
          error: 'Model unavailable'
        });

        const userSpendingData = {
          userId: mockUserId,
          historicalSpending: [3200, 3400, 3100, 3500, 3300]
        };

        const prediction = await predictionService.predictMonthlySpending(userSpendingData);

        expect(prediction.success).to.be.true;
        expect(prediction.method).to.equal('statistical_fallback');
        expect(prediction.totalPredicted).to.be.a('number');
        expect(prediction.confidence).to.be.lessThan(0.7); // Lower confidence for fallback
      });
    });

    describe('Budget Optimization Predictions', () => {
      it('should predict optimal budget allocations', async () => {
        const mockMLResponse = {
          optimized_budget: {
            'groceries': 750,
            'dining': 500,
            'transportation': 350,
            'entertainment': 250,
            'utilities': 500,
            'savings': 650
          },
          optimization_score: 0.92,
          potential_savings: 200,
          recommendations: [
            {
              category: 'dining',
              action: 'reduce',
              amount: 100,
              reason: 'Above average spending pattern'
            }
          ]
        };

        sinon.stub(mlService, 'predict').resolves({
          success: true,
          ...mockMLResponse
        });

        const budgetData = {
          userId: mockUserId,
          currentBudget: {
            'groceries': 800,
            'dining': 600,
            'transportation': 400,
            'entertainment': 300,
            'utilities': 500
          },
          spendingHistory: {},
          goals: []
        };

        const optimization = await predictionService.optimizeBudget(budgetData);

        expect(optimization.success).to.be.true;
        expect(optimization.optimizedBudget).to.exist;
        expect(optimization.potentialSavings).to.equal(200);
        expect(optimization.recommendations).to.have.length(1);
      });
    });

    describe('Goal Achievement Predictions', () => {
      it('should predict goal completion probability', async () => {
        const mockMLResponse = {
          completion_probability: 0.78,
          projected_completion_date: '2024-11-15',
          required_monthly_contribution: 850,
          success_factors: [
            { factor: 'consistent_contributions', weight: 0.4 },
            { factor: 'realistic_timeline', weight: 0.3 },
            { factor: 'income_stability', weight: 0.3 }
          ],
          risk_factors: [
            { factor: 'aggressive_timeline', impact: 0.15 }
          ]
        };

        sinon.stub(mlService, 'predict').resolves({
          success: true,
          ...mockMLResponse
        });

        const goalData = {
          userId: mockUserId,
          targetAmount: 15000,
          currentAmount: 8500,
          targetDate: '2024-12-31',
          monthlyContributions: [500, 600, 450, 700],
          userProfile: { income: 5000, expenses: 3500 }
        };

        const prediction = await predictionService.predictGoalCompletion(goalData);

        expect(prediction.success).to.be.true;
        expect(prediction.completionProbability).to.equal(0.78);
        expect(prediction.projectedDate).to.exist;
        expect(prediction.requiredMonthlyContribution).to.equal(850);
        expect(prediction.successFactors).to.have.length(3);
      });
    });
  });

  describe('Anomaly Detection Integration', () => {
    describe('Transaction Anomaly Detection', () => {
      it('should detect spending anomalies using ML', async () => {
        const mockMLResponse = {
          anomalies: [
            {
              transaction_id: 'tx123',
              anomaly_score: 0.92,
              anomaly_type: 'amount_outlier',
              reasons: ['unusual_amount', 'unusual_merchant'],
              risk_level: 'high',
              confidence: 0.89
            },
            {
              transaction_id: 'tx456',
              anomaly_score: 0.75,
              anomaly_type: 'pattern_deviation',
              reasons: ['unusual_time', 'unusual_location'],
              risk_level: 'medium',
              confidence: 0.72
            }
          ],
          model_version: 'anomaly_detector_v1.5.0'
        };

        sinon.stub(mlService, 'predict').resolves({
          success: true,
          ...mockMLResponse
        });

        const transactionData = [
          { id: 'tx123', amount: 2500, merchant: 'Unknown Store', category: 'shopping', timestamp: new Date() },
          { id: 'tx456', amount: 150, merchant: 'Gas Station', category: 'transportation', timestamp: new Date() },
          { id: 'tx789', amount: 45, merchant: 'Coffee Shop', category: 'dining', timestamp: new Date() }
        ];

        const anomalies = await anomalyService.detectTransactionAnomalies(mockUserId, transactionData);

        expect(anomalies.success).to.be.true;
        expect(anomalies.anomalies).to.have.length(2);
        expect(anomalies.anomalies[0].transactionId).to.equal('tx123');
        expect(anomalies.anomalies[0].score).to.equal(0.92);
        expect(anomalies.anomalies[0].riskLevel).to.equal('high');
      });

      it('should handle real-time anomaly detection', async () => {
        const mockMLResponse = {
          is_anomaly: true,
          anomaly_score: 0.88,
          processing_time_ms: 25,
          real_time: true
        };

        sinon.stub(mlService, 'predict').resolves({
          success: true,
          ...mockMLResponse
        });

        const transaction = {
          id: 'tx_realtime',
          amount: 1500,
          merchant: 'Electronics Store',
          category: 'shopping',
          timestamp: new Date(),
          location: { lat: 40.7128, lng: -74.0060 }
        };

        const result = await anomalyService.detectRealTimeAnomaly(mockUserId, transaction);

        expect(result.success).to.be.true;
        expect(result.isAnomaly).to.be.true;
        expect(result.score).to.equal(0.88);
        expect(result.processingTime).to.be.lessThan(100); // Real-time requirement
      });

      it('should provide anomaly explanations', async () => {
        const mockMLResponse = {
          anomaly_score: 0.85,
          explanations: [
            {
              feature: 'amount',
              contribution: 0.6,
              description: 'Transaction amount is 3.2x higher than typical for this category'
            },
            {
              feature: 'merchant',
              contribution: 0.25,
              description: 'First time transaction with this merchant'
            }
          ],
          similar_transactions: [
            { amount: 800, date: '2024-05-15', similarity: 0.7 },
            { amount: 750, date: '2024-04-20', similarity: 0.65 }
          ]
        };

        sinon.stub(mlService, 'predict').resolves({
          success: true,
          ...mockMLResponse
        });

        const transaction = {
          id: 'tx_explain',
          amount: 2400,
          merchant: 'New Electronics Store',
          category: 'shopping'
        };

        const explanation = await anomalyService.explainAnomaly(mockUserId, transaction);

        expect(explanation.success).to.be.true;
        expect(explanation.explanations).to.have.length(2);
        expect(explanation.explanations[0].feature).to.equal('amount');
        expect(explanation.explanations[0].contribution).to.equal(0.6);
        expect(explanation.similarTransactions).to.have.length(2);
      });
    });

    describe('Pattern Anomaly Detection', () => {
      it('should detect spending pattern anomalies', async () => {
        const mockMLResponse = {
          pattern_anomalies: [
            {
              type: 'spending_spike',
              category: 'dining',
              anomaly_score: 0.82,
              time_period: '2024-06-01_to_2024-06-07',
              description: 'Dining spending increased by 150% compared to typical week'
            },
            {
              type: 'frequency_change',
              category: 'transportation',
              anomaly_score: 0.71,
              time_period: '2024-06-01_to_2024-06-30',
              description: 'Transportation transactions decreased by 60%'
            }
          ]
        };

        sinon.stub(mlService, 'predict').resolves({
          success: true,
          ...mockMLResponse
        });

        const spendingData = {
          userId: mockUserId,
          timeRange: { start: '2024-06-01', end: '2024-06-30' },
          categories: ['dining', 'transportation', 'groceries'],
          granularity: 'weekly'
        };

        const patterns = await anomalyService.detectPatternAnomalies(spendingData);

        expect(patterns.success).to.be.true;
        expect(patterns.anomalies).to.have.length(2);
        expect(patterns.anomalies[0].type).to.equal('spending_spike');
        expect(patterns.anomalies[0].category).to.equal('dining');
      });
    });
  });

  describe('Model Performance and Monitoring', () => {
    describe('Prediction Accuracy Tracking', () => {
      it('should track prediction accuracy over time', async () => {
        const predictions = [
          { id: 'pred1', predicted: 3500, actual: 3450, date: '2024-05-01' },
          { id: 'pred2', predicted: 3200, actual: 3180, date: '2024-04-01' },
          { id: 'pred3', predicted: 3800, actual: 3750, date: '2024-03-01' }
        ];

        const accuracy = await mlService.calculatePredictionAccuracy('spending_predictor', predictions);

        expect(accuracy.meanAbsoluteError).to.be.a('number');
        expect(accuracy.meanAbsolutePercentageError).to.be.lessThan(10); // Should be < 10%
        expect(accuracy.r2Score).to.be.greaterThan(0.8); // Should have good correlation
        expect(accuracy.predictionCount).to.equal(3);
      });

      it('should identify model drift', async () => {
        const recentPredictions = [
          { predicted: 3500, actual: 4000, date: '2024-06-01' },
          { predicted: 3200, actual: 3800, date: '2024-06-02' },
          { predicted: 3100, actual: 3700, date: '2024-06-03' }
        ];

        const historicalAccuracy = 0.92;
        const currentAccuracy = await mlService.calculatePredictionAccuracy('spending_predictor', recentPredictions);

        const drift = await mlService.detectModelDrift('spending_predictor', {
          historical: historicalAccuracy,
          current: currentAccuracy.r2Score
        });

        expect(drift.isDrifting).to.be.true;
        expect(drift.severity).to.be.oneOf(['low', 'medium', 'high']);
        expect(drift.recommendations).to.include('Consider model retraining');
      });
    });

    describe('A/B Testing Integration', () => {
      it('should support A/B testing of different models', async () => {
        const modelA = 'spending_predictor_v2.0';
        const modelB = 'spending_predictor_v2.1';

        // Mock responses for both models
        sinon.stub(mlService, 'predict')
          .withArgs(modelA).resolves({ success: true, prediction: 3400, confidence: 0.85 })
          .withArgs(modelB).resolves({ success: true, prediction: 3450, confidence: 0.87 });

        const inputData = { userId: mockUserId, historicalSpending: [3200, 3400] };

        const abTest = await mlService.runABTest([modelA, modelB], inputData, mockUserId);

        expect(abTest.results).to.have.length(2);
        expect(abTest.results[0].model).to.equal(modelA);
        expect(abTest.results[1].model).to.equal(modelB);
        expect(abTest.selectedModel).to.exist;
        expect(abTest.selectionReason).to.exist;
      });

      it('should track A/B test performance metrics', async () => {
        const testResults = [
          { model: 'v2.0', userId: 'user1', predicted: 3400, actual: 3380, timestamp: new Date() },
          { model: 'v2.1', userId: 'user2', predicted: 3450, actual: 3440, timestamp: new Date() },
          { model: 'v2.0', userId: 'user3', predicted: 3200, actual: 3250, timestamp: new Date() },
          { model: 'v2.1', userId: 'user4', predicted: 3600, actual: 3580, timestamp: new Date() }
        ];

        const metrics = await mlService.calculateABTestMetrics(testResults);

        expect(metrics.v20).to.exist;
        expect(metrics.v21).to.exist;
        expect(metrics.v20.accuracy).to.be.a('number');
        expect(metrics.v21.accuracy).to.be.a('number');
        expect(metrics.winner).to.be.oneOf(['v2.0', 'v2.1', 'inconclusive']);
        expect(metrics.confidence).to.be.within(0, 1);
      });
    });

    describe('Model Fallback and Resilience', () => {
      it('should gracefully fallback when primary model fails', async () => {
        // Primary model fails
        sinon.stub(mlService, 'predict')
          .withArgs('spending_predictor_primary').rejects(new Error('Model service down'))
          .withArgs('spending_predictor_fallback').resolves({ 
            success: true, 
            prediction: 3300, 
            confidence: 0.75,
            method: 'fallback'
          });

        const inputData = { userId: mockUserId, historicalSpending: [3200, 3400] };

        const result = await predictionService.predictWithFallback(inputData);

        expect(result.success).to.be.true;
        expect(result.prediction).to.equal(3300);
        expect(result.method).to.equal('fallback');
        expect(result.confidence).to.be.lessThan(0.8); // Lower confidence for fallback
      });

      it('should implement circuit breaker pattern', async () => {
        // Simulate multiple failures
        const failingStub = sinon.stub(mlService, 'predict').rejects(new Error('Service unavailable'));

        // Make multiple calls to trigger circuit breaker
        for (let i = 0; i < 5; i++) {
          await predictionService.predictMonthlySpending({ userId: mockUserId });
        }

        // Circuit breaker should be open now
        const circuitState = await mlService.getCircuitBreakerState('spending_predictor');
        expect(circuitState.state).to.equal('open');
        expect(circuitState.failureCount).to.be.greaterThan(3);

        // Subsequent calls should fail fast
        const startTime = Date.now();
        await predictionService.predictMonthlySpending({ userId: mockUserId });
        const endTime = Date.now();

        expect(endTime - startTime).to.be.lessThan(100); // Should fail fast
      });
    });
  });

  describe('Data Pipeline Integration', () => {
    it('should handle feature engineering pipeline', async () => {
      const rawUserData = {
        userId: mockUserId,
        transactions: [
          { amount: 120, category: 'groceries', date: '2024-06-01', merchant: 'Supermarket A' },
          { amount: 85, category: 'dining', date: '2024-06-02', merchant: 'Restaurant B' }
        ],
        userProfile: { age: 30, income: 5000, location: 'urban' }
      };

      const features = await mlService.engineerFeatures(rawUserData);

      expect(features).to.exist;
      expect(features.spending_by_category).to.exist;
      expect(features.spending_by_category.groceries).to.equal(120);
      expect(features.spending_by_category.dining).to.equal(85);
      expect(features.user_demographics).to.exist;
      expect(features.temporal_features).to.exist;
      expect(features.behavioral_features).to.exist;
    });

    it('should validate feature quality', async () => {
      const features = {
        spending_by_category: { groceries: 120, dining: 85 },
        user_demographics: { age: 30, income: 5000 },
        temporal_features: { day_of_week: 1, month: 6 },
        behavioral_features: { avg_transaction_amount: 102.5 }
      };

      const validation = await mlService.validateFeatures(features);

      expect(validation.isValid).to.be.true;
      expect(validation.completeness).to.be.greaterThan(0.8);
      expect(validation.quality_score).to.be.greaterThan(0.7);
      expect(validation.missing_features).to.be.an('array');
    });
  });
});

module.exports = {
  MLModelService,
  PredictionService,
  AnomalyDetectionService
};