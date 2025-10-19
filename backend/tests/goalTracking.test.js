/**
 * Goal Tracking Service Tests
 * Comprehensive tests for AI-assisted goal tracking and planning
 */

const GoalTrackingService = require('../services/GoalTrackingService');
const { expect } = require('chai');
const sinon = require('sinon');

describe('GoalTrackingService', () => {
  let goalService;
  let mockUserId;

  beforeEach(() => {
    goalService = new GoalTrackingService();
    mockUserId = 'user123';
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Goal Creation', () => {
    it('should create a goal with AI enhancement', async () => {
      const goalData = {
        title: 'Emergency Fund',
        targetAmount: 15000,
        targetDate: '2024-12-31',
        category: 'emergency',
        currentIncome: 5000
      };

      const result = await goalService.createGoal(mockUserId, goalData);

      expect(result.success).to.be.true;
      expect(result.goal).to.exist;
      expect(result.goal.title).to.equal('Emergency Fund');
      expect(result.goal.suggestedMonthlyContribution).to.be.a('number');
      expect(result.goal.feasibilityScore).to.be.within(0, 100);
      expect(result.goal.riskLevel).to.be.oneOf(['low', 'medium', 'high']);
    });

    it('should generate appropriate milestones for new goal', async () => {
      const goalData = {
        title: 'Vacation Fund',
        targetAmount: 5000,
        targetDate: '2024-08-15',
        category: 'travel',
        currentIncome: 4000
      };

      const result = await goalService.createGoal(mockUserId, goalData);
      const goal = result.goal;

      expect(goal.milestones).to.have.length(5); // 25%, 50%, 75%, 90%, 100%
      
      // Check first milestone
      const firstMilestone = goalService.milestones.get(goal.milestones[0]);
      expect(firstMilestone.percentage).to.equal(25);
      expect(firstMilestone.targetAmount).to.equal(1250);
      expect(firstMilestone.status).to.equal('pending');
    });

    it('should create achievement strategy for new goal', async () => {
      const goalData = {
        title: 'Home Down Payment',
        targetAmount: 50000,
        targetDate: '2025-06-01',
        category: 'home',
        currentIncome: 6000
      };

      const result = await goalService.createGoal(mockUserId, goalData);
      const goal = result.goal;

      expect(goal.strategyId).to.exist;
      
      const strategy = goalService.strategies.get(goal.strategyId);
      expect(strategy).to.exist;
      expect(strategy.savingsStrategy).to.exist;
      expect(strategy.timelineStrategy).to.exist;
      expect(strategy.currentRecommendations).to.be.an('array');
    });
  });

  describe('Progress Tracking', () => {
    let goalId;

    beforeEach(async () => {
      const goalData = {
        title: 'Test Goal',
        targetAmount: 10000,
        targetDate: '2024-12-31',
        category: 'other',
        currentIncome: 5000
      };

      const result = await goalService.createGoal(mockUserId, goalData);
      goalId = result.goalId;
    });

    it('should update goal progress correctly', async () => {
      const contributionAmount = 1000;
      
      const result = await goalService.updateGoalProgress(goalId, contributionAmount);

      expect(result.success).to.be.true;
      expect(result.goal.currentAmount).to.equal(1000);
      expect(result.progressPercentage).to.equal(10);
      expect(result.remainingAmount).to.equal(9000);
    });

    it('should detect milestone achievements', async () => {
      // Contribute enough to reach 25% milestone
      const result = await goalService.updateGoalProgress(goalId, 2500);

      expect(result.success).to.be.true;
      expect(result.newMilestones).to.have.length(1);
      
      const achievedMilestone = result.newMilestones[0];
      expect(achievedMilestone.percentage).to.equal(25);
      expect(achievedMilestone.status).to.equal('achieved');
    });

    it('should mark goal as completed when target reached', async () => {
      const result = await goalService.updateGoalProgress(goalId, 10000);

      expect(result.success).to.be.true;
      expect(result.goal.status).to.equal('completed');
      expect(result.goal.completedAt).to.exist;
    });

    it('should update average monthly progress', async () => {
      // Make multiple contributions
      await goalService.updateGoalProgress(goalId, 500);
      await goalService.updateGoalProgress(goalId, 750);
      const result = await goalService.updateGoalProgress(goalId, 1000);

      expect(result.goal.averageMonthlyProgress).to.be.greaterThan(0);
      expect(result.goal.progressHistory).to.have.length(3);
    });
  });

  describe('AI Recommendations', () => {
    it('should assess goal risk correctly', () => {
      // High risk scenario
      const highRisk = goalService.assessGoalRisk(10000, 6, 3000); // $1667/month on $3000 income
      expect(highRisk).to.equal('high');

      // Low risk scenario
      const lowRisk = goalService.assessGoalRisk(5000, 12, 8000); // $417/month on $8000 income
      expect(lowRisk).to.equal('low');
    });

    it('should calculate feasibility score appropriately', () => {
      const score1 = goalService.calculateFeasibilityScore(10000, 12, 5000, 'emergency');
      expect(score1).to.be.within(0, 100);

      const score2 = goalService.calculateFeasibilityScore(50000, 6, 3000, 'luxury');
      expect(score2).to.be.lessThan(score1); // Should be less feasible
    });

    it('should generate relevant goal strategies', () => {
      const goalData = {
        targetAmount: 20000,
        targetDate: '2024-06-01',
        category: 'emergency',
        currentIncome: 4000
      };

      const strategies = goalService.generateGoalStrategies(goalData, 45);
      
      expect(strategies).to.be.an('array');
      expect(strategies.length).to.be.greaterThan(0);
      
      const hasTimelineStrategy = strategies.some(s => s.type === 'timeline_adjustment');
      expect(hasTimelineStrategy).to.be.true; // Low feasibility should suggest timeline adjustment
    });
  });

  describe('Analytics and Insights', () => {
    let goalId;

    beforeEach(async () => {
      const goalData = {
        title: 'Analytics Test Goal',
        targetAmount: 8000,
        targetDate: '2024-10-01',
        category: 'travel',
        currentIncome: 5000
      };

      const result = await goalService.createGoal(mockUserId, goalData);
      goalId = result.goalId;

      // Add some progress history
      await goalService.updateGoalProgress(goalId, 1000);
      await goalService.updateGoalProgress(goalId, 800);
      await goalService.updateGoalProgress(goalId, 1200);
    });

    it('should provide detailed goal analytics', async () => {
      const result = await goalService.getGoalAnalytics(mockUserId, goalId);

      expect(result.success).to.be.true;
      expect(result.goal).to.exist;
      expect(result.milestones).to.be.an('array');
      expect(result.strategy).to.exist;
      expect(result.analytics).to.exist;
      expect(result.analytics.successProbability).to.be.within(0, 100);
    });

    it('should calculate projected completion correctly', () => {
      const goal = goalService.goals.get(goalId);
      const projection = goalService.calculateProjectedCompletion(goal);

      expect(projection).to.exist;
      expect(projection.date).to.be.a('date');
      expect(projection.monthsRemaining).to.be.a('number');
      expect(projection.onTrack).to.be.a('boolean');
    });

    it('should analyze progress trends', () => {
      const goal = goalService.goals.get(goalId);
      const analysis = goalService.analyzeProgressTrends(goal);

      expect(analysis).to.exist;
      expect(analysis.trend).to.be.oneOf(['increasing', 'decreasing', 'stable']);
      expect(analysis.averageContribution).to.be.a('number');
      expect(analysis.consistency).to.be.within(0, 1);
    });

    it('should provide overall user analytics', async () => {
      // Create another goal
      await goalService.createGoal(mockUserId, {
        title: 'Second Goal',
        targetAmount: 5000,
        targetDate: '2024-09-01',
        category: 'education',
        currentIncome: 5000
      });

      const result = await goalService.getGoalAnalytics(mockUserId);

      expect(result.success).to.be.true;
      expect(result.summary).to.exist;
      expect(result.summary.totalGoals).to.equal(2);
      expect(result.summary.activeGoals).to.equal(2);
      expect(result.goalsByCategory).to.exist;
    });
  });

  describe('Goal Recommendations', () => {
    it('should generate new goal suggestions', async () => {
      const userProfile = {
        age: 28,
        annualIncome: 60000,
        monthlyExpenses: 3500,
        riskTolerance: 'medium'
      };

      const result = await goalService.generateGoalRecommendations(mockUserId, userProfile);

      expect(result.success).to.be.true;
      expect(result.recommendations).to.exist;
      expect(result.recommendations.newGoalSuggestions).to.be.an('array');
      
      // Should suggest emergency fund for new user
      const emergencySuggestion = result.recommendations.newGoalSuggestions
        .find(s => s.category === 'emergency');
      expect(emergencySuggestion).to.exist;
    });

    it('should suggest goal improvements for existing goals', async () => {
      // Create a high-risk goal
      const goalData = {
        title: 'Aggressive Goal',
        targetAmount: 50000,
        targetDate: '2024-06-01', // Very short timeline
        category: 'other',
        currentIncome: 3000
      };

      await goalService.createGoal(mockUserId, goalData);

      const userProfile = { annualIncome: 36000 };
      const result = await goalService.generateGoalRecommendations(mockUserId, userProfile);

      expect(result.recommendations.improvementSuggestions).to.be.an('array');
      expect(result.recommendations.improvementSuggestions.length).to.be.greaterThan(0);
    });
  });

  describe('Milestone Management', () => {
    it('should generate appropriate milestone titles and descriptions', () => {
      const title25 = goalService.generateMilestoneTitle(25, 'emergency');
      const title100 = goalService.generateMilestoneTitle(100, 'travel');

      expect(title25).to.include('Quarter');
      expect(title100).to.include('Achieved');

      const description = goalService.generateMilestoneDescription(50, 5000, {
        title: 'Test Goal'
      });
      expect(description).to.include('$5,000');
      expect(description).to.include('50%');
    });

    it('should calculate achievement points correctly', () => {
      const points25 = goalService.calculateAchievementPoints(25);
      const points100 = goalService.calculateAchievementPoints(100);

      expect(points25).to.equal(100);
      expect(points100).to.equal(1000);
      expect(points100).to.be.greaterThan(points25);
    });

    it('should generate celebration messages', () => {
      const message = goalService.generateCelebrationMessage(75, 'Vacation Fund');
      
      expect(message).to.be.a('string');
      expect(message).to.include('75%');
      expect(message).to.include('Vacation Fund');
    });
  });

  describe('Strategy Generation', () => {
    let goal;

    beforeEach(async () => {
      const goalData = {
        title: 'Strategy Test Goal',
        targetAmount: 12000,
        targetDate: '2024-12-01',
        category: 'home',
        currentIncome: 5000
      };

      const result = await goalService.createGoal(mockUserId, goalData);
      goal = result.goal;
    });

    it('should generate savings strategy', () => {
      const strategy = goalService.generateSavingsStrategy(goal);

      expect(strategy).to.exist;
      expect(strategy.requiredMonthlyAmount).to.be.a('number');
      expect(strategy.suggestedFrequency).to.exist;
      expect(strategy.automationRecommendation).to.be.a('boolean');
    });

    it('should generate timeline strategy', () => {
      const strategy = goalService.generateTimelineStrategy(goal);

      expect(strategy).to.exist;
      expect(strategy.onTrack).to.be.a('boolean');
      expect(strategy.projectedCompletion).to.exist;
    });

    it('should generate optimization tips', () => {
      const tips = goalService.generateOptimizationTips(goal);

      expect(tips).to.be.an('array');
      expect(tips.length).to.be.greaterThan(0);
      
      const automationTip = tips.find(tip => tip.category === 'automation');
      expect(automationTip).to.exist;
    });
  });

  describe('Event Handling', () => {
    it('should emit events for goal creation', (done) => {
      goalService.once('goalCreated', (data) => {
        expect(data.userId).to.equal(mockUserId);
        expect(data.goal).to.exist;
        done();
      });

      goalService.createGoal(mockUserId, {
        title: 'Event Test Goal',
        targetAmount: 5000,
        targetDate: '2024-08-01',
        category: 'other',
        currentIncome: 4000
      });
    });

    it('should emit events for milestone achievements', async () => {
      const goalData = {
        title: 'Milestone Event Goal',
        targetAmount: 4000,
        targetDate: '2024-07-01',
        category: 'other',
        currentIncome: 4000
      };

      const result = await goalService.createGoal(mockUserId, goalData);
      const goalId = result.goalId;

      let milestoneEventFired = false;
      goalService.once('milestoneAchieved', (data) => {
        expect(data.goal).to.exist;
        expect(data.milestone).to.exist;
        expect(data.achievement).to.exist;
        milestoneEventFired = true;
      });

      // Contribute enough to reach first milestone
      await goalService.updateGoalProgress(goalId, 1000);
      
      expect(milestoneEventFired).to.be.true;
    });

    it('should emit events for goal completion', async () => {
      const goalData = {
        title: 'Completion Event Goal',
        targetAmount: 2000,
        targetDate: '2024-06-01',
        category: 'other',
        currentIncome: 4000
      };

      const result = await goalService.createGoal(mockUserId, goalData);
      const goalId = result.goalId;

      let completionEventFired = false;
      goalService.once('goalCompleted', (data) => {
        expect(data.goal).to.exist;
        expect(data.goal.status).to.equal('completed');
        completionEventFired = true;
      });

      // Complete the goal
      await goalService.updateGoalProgress(goalId, 2000);
      
      expect(completionEventFired).to.be.true;
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid goal data gracefully', async () => {
      const invalidGoalData = {
        title: '', // Empty title
        targetAmount: -1000, // Negative amount
        targetDate: 'invalid-date',
        category: 'invalid-category'
      };

      const result = await goalService.createGoal(mockUserId, invalidGoalData);
      expect(result.success).to.be.false;
      expect(result.error).to.exist;
    });

    it('should handle progress updates for non-existent goals', async () => {
      const result = await goalService.updateGoalProgress('non-existent-id', 1000);
      expect(result.success).to.be.false;
      expect(result.error).to.include('not found');
    });

    it('should handle analytics requests for non-existent goals', async () => {
      const result = await goalService.getGoalAnalytics(mockUserId, 'non-existent-id');
      expect(result.success).to.be.false;
      expect(result.error).to.include('not found');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple goals efficiently', async () => {
      const startTime = Date.now();
      
      // Create multiple goals
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(goalService.createGoal(mockUserId, {
          title: `Performance Goal ${i}`,
          targetAmount: 5000 + (i * 1000),
          targetDate: '2024-12-31',
          category: 'other',
          currentIncome: 5000
        }));
      }
      
      const results = await Promise.all(promises);
      const endTime = Date.now();
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(endTime - startTime).to.be.lessThan(5000); // 5 seconds
      
      // All goals should be created successfully
      results.forEach(result => {
        expect(result.success).to.be.true;
      });
    });

    it('should handle rapid progress updates', async () => {
      const goalData = {
        title: 'Rapid Update Goal',
        targetAmount: 10000,
        targetDate: '2024-12-31',
        category: 'other',
        currentIncome: 5000
      };

      const result = await goalService.createGoal(mockUserId, goalData);
      const goalId = result.goalId;

      // Make rapid progress updates
      const updatePromises = [];
      for (let i = 0; i < 20; i++) {
        updatePromises.push(goalService.updateGoalProgress(goalId, 100));
      }

      const updateResults = await Promise.all(updatePromises);
      
      // All updates should succeed
      updateResults.forEach(updateResult => {
        expect(updateResult.success).to.be.true;
      });

      // Final amount should be correct
      const finalGoal = goalService.goals.get(goalId);
      expect(finalGoal.currentAmount).to.equal(2000);
      expect(finalGoal.progressHistory).to.have.length(20);
    });
  });
});

module.exports = {
  GoalTrackingService
};