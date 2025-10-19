/**
 * Goal Tracking and Planning Service
 * AI-assisted financial goal setting, tracking, and milestone monitoring
 */

const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class GoalTrackingService extends EventEmitter {
  constructor() {
    super();
    this.goals = new Map();
    this.milestones = new Map();
    this.achievements = new Map();
    this.strategies = new Map();
  }

  /**
   * Create a new financial goal with AI assistance
   */
  async createGoal(userId, goalData) {
    try {
      const goalId = uuidv4();
      
      // AI-assisted goal validation and enhancement
      const enhancedGoal = await this.enhanceGoalWithAI(goalData);
      
      const goal = {
        id: goalId,
        userId,
        title: enhancedGoal.title,
        description: enhancedGoal.description,
        targetAmount: enhancedGoal.targetAmount,
        currentAmount: 0,
        targetDate: new Date(enhancedGoal.targetDate),
        category: enhancedGoal.category,
        priority: enhancedGoal.priority || 'medium',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        
        // AI-generated properties
        suggestedMonthlyContribution: enhancedGoal.suggestedMonthlyContribution,
        riskLevel: enhancedGoal.riskLevel,
        feasibilityScore: enhancedGoal.feasibilityScore,
        
        // Milestone configuration
        milestonePercentages: [25, 50, 75, 90, 100],
        completedMilestones: [],
        
        // Strategy recommendations
        strategies: enhancedGoal.strategies || [],
        
        // Progress tracking
        progressHistory: [],
        lastContribution: null,
        averageMonthlyProgress: 0
      };

      this.goals.set(goalId, goal);
      
      // Generate initial milestones
      await this.generateMilestones(goalId);
      
      // Create achievement strategy
      await this.createAchievementStrategy(goalId);
      
      this.emit('goalCreated', { userId, goal });
      
      return {
        success: true,
        goalId,
        goal,
        message: 'Goal created successfully with AI recommendations'
      };
    } catch (error) {
      console.error('Error creating goal:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * AI-enhanced goal validation and improvement
   */
  async enhanceGoalWithAI(goalData) {
    const { title, targetAmount, targetDate, category, currentIncome } = goalData;
    
    // Calculate time to goal in months
    const monthsToGoal = Math.ceil(
      (new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 30)
    );
    
    // AI-suggested monthly contribution
    const suggestedMonthlyContribution = Math.ceil(targetAmount / monthsToGoal);
    
    // Risk assessment based on goal parameters
    const riskLevel = this.assessGoalRisk(targetAmount, monthsToGoal, currentIncome);
    
    // Feasibility score (0-100)
    const feasibilityScore = this.calculateFeasibilityScore(
      targetAmount, 
      monthsToGoal, 
      currentIncome,
      category
    );
    
    // Generate AI strategies
    const strategies = this.generateGoalStrategies(goalData, feasibilityScore);
    
    return {
      ...goalData,
      suggestedMonthlyContribution,
      riskLevel,
      feasibilityScore,
      strategies,
      // AI-enhanced title if needed
      title: this.enhanceGoalTitle(title, category),
      // AI-suggested description improvements
      description: goalData.description || this.generateGoalDescription(goalData)
    };
  }

  /**
   * Generate milestone-based progress monitoring
   */
  async generateMilestones(goalId) {
    const goal = this.goals.get(goalId);
    if (!goal) throw new Error('Goal not found');

    const milestones = goal.milestonePercentages.map((percentage, index) => {
      const milestoneId = uuidv4();
      const targetAmount = (goal.targetAmount * percentage) / 100;
      
      const milestone = {
        id: milestoneId,
        goalId,
        percentage,
        targetAmount,
        title: this.generateMilestoneTitle(percentage, goal.category),
        description: this.generateMilestoneDescription(percentage, targetAmount, goal),
        status: 'pending',
        achievedAt: null,
        reward: this.generateMilestoneReward(percentage),
        celebrationMessage: this.generateCelebrationMessage(percentage, goal.title)
      };

      this.milestones.set(milestoneId, milestone);
      return milestone;
    });

    goal.milestones = milestones.map(m => m.id);
    this.goals.set(goalId, goal);

    return milestones;
  }

  /**
   * Update goal progress and check milestones
   */
  async updateGoalProgress(goalId, contributionAmount, contributionDate = new Date()) {
    try {
      const goal = this.goals.get(goalId);
      if (!goal) throw new Error('Goal not found');

      // Update goal progress
      const previousAmount = goal.currentAmount;
      goal.currentAmount += contributionAmount;
      goal.lastContribution = {
        amount: contributionAmount,
        date: contributionDate
      };
      
      // Add to progress history
      goal.progressHistory.push({
        date: contributionDate,
        amount: contributionAmount,
        totalAmount: goal.currentAmount,
        percentage: (goal.currentAmount / goal.targetAmount) * 100
      });

      // Update average monthly progress
      goal.averageMonthlyProgress = this.calculateAverageMonthlyProgress(goal);
      goal.updatedAt = new Date();

      // Check for milestone achievements
      const newMilestones = await this.checkMilestoneAchievements(goalId, previousAmount);
      
      // Update goal status if completed
      if (goal.currentAmount >= goal.targetAmount) {
        goal.status = 'completed';
        goal.completedAt = new Date();
        this.emit('goalCompleted', { goal });
      }

      this.goals.set(goalId, goal);
      
      // Generate updated strategy recommendations
      const updatedStrategies = await this.updateAchievementStrategy(goalId);

      this.emit('goalProgressUpdated', { 
        goal, 
        contribution: { amount: contributionAmount, date: contributionDate },
        newMilestones,
        updatedStrategies
      });

      return {
        success: true,
        goal,
        newMilestones,
        progressPercentage: (goal.currentAmount / goal.targetAmount) * 100,
        remainingAmount: goal.targetAmount - goal.currentAmount,
        updatedStrategies
      };
    } catch (error) {
      console.error('Error updating goal progress:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check and process milestone achievements
   */
  async checkMilestoneAchievements(goalId, previousAmount) {
    const goal = this.goals.get(goalId);
    const achievedMilestones = [];

    for (const milestoneId of goal.milestones) {
      const milestone = this.milestones.get(milestoneId);
      
      if (milestone.status === 'pending' && 
          goal.currentAmount >= milestone.targetAmount &&
          previousAmount < milestone.targetAmount) {
        
        // Mark milestone as achieved
        milestone.status = 'achieved';
        milestone.achievedAt = new Date();
        
        goal.completedMilestones.push(milestoneId);
        achievedMilestones.push(milestone);
        
        this.milestones.set(milestoneId, milestone);
        
        // Create achievement record
        const achievementId = uuidv4();
        const achievement = {
          id: achievementId,
          userId: goal.userId,
          goalId,
          milestoneId,
          type: 'milestone',
          title: `${milestone.title} Achieved!`,
          description: milestone.celebrationMessage,
          achievedAt: new Date(),
          reward: milestone.reward,
          points: this.calculateAchievementPoints(milestone.percentage)
        };
        
        this.achievements.set(achievementId, achievement);
        
        this.emit('milestoneAchieved', { goal, milestone, achievement });
      }
    }

    return achievedMilestones;
  }

  /**
   * Create and update achievement strategies
   */
  async createAchievementStrategy(goalId) {
    const goal = this.goals.get(goalId);
    if (!goal) throw new Error('Goal not found');

    const strategyId = uuidv4();
    const strategy = {
      id: strategyId,
      goalId,
      userId: goal.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      
      // Core strategy components
      savingsStrategy: this.generateSavingsStrategy(goal),
      timelineStrategy: this.generateTimelineStrategy(goal),
      riskMitigation: this.generateRiskMitigation(goal),
      optimizationTips: this.generateOptimizationTips(goal),
      
      // Dynamic recommendations
      currentRecommendations: this.generateCurrentRecommendations(goal),
      nextActions: this.generateNextActions(goal),
      
      // Progress predictions
      projectedCompletion: this.calculateProjectedCompletion(goal),
      successProbability: this.calculateSuccessProbability(goal)
    };

    this.strategies.set(strategyId, strategy);
    goal.strategyId = strategyId;
    this.goals.set(goalId, goal);

    return strategy;
  }

  /**
   * Update achievement strategy based on current progress
   */
  async updateAchievementStrategy(goalId) {
    const goal = this.goals.get(goalId);
    const strategy = this.strategies.get(goal.strategyId);
    
    if (!strategy) return await this.createAchievementStrategy(goalId);

    // Update strategy based on current progress
    strategy.currentRecommendations = this.generateCurrentRecommendations(goal);
    strategy.nextActions = this.generateNextActions(goal);
    strategy.projectedCompletion = this.calculateProjectedCompletion(goal);
    strategy.successProbability = this.calculateSuccessProbability(goal);
    strategy.updatedAt = new Date();

    // Add progress-based optimizations
    if (goal.progressHistory.length > 3) {
      strategy.progressAnalysis = this.analyzeProgressTrends(goal);
      strategy.adaptiveRecommendations = this.generateAdaptiveRecommendations(goal);
    }

    this.strategies.set(goal.strategyId, strategy);
    return strategy;
  }

  /**
   * Get comprehensive goal analytics
   */
  async getGoalAnalytics(userId, goalId = null) {
    try {
      const userGoals = Array.from(this.goals.values())
        .filter(goal => goal.userId === userId);

      if (goalId) {
        const specificGoal = userGoals.find(goal => goal.id === goalId);
        if (!specificGoal) throw new Error('Goal not found');
        
        return this.generateDetailedGoalAnalytics(specificGoal);
      }

      // Generate overall analytics for all user goals
      return this.generateOverallGoalAnalytics(userGoals);
    } catch (error) {
      console.error('Error getting goal analytics:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate AI-powered goal recommendations
   */
  async generateGoalRecommendations(userId, userProfile) {
    try {
      const userGoals = Array.from(this.goals.values())
        .filter(goal => goal.userId === userId);

      const recommendations = {
        newGoalSuggestions: this.suggestNewGoals(userProfile, userGoals),
        improvementSuggestions: this.suggestGoalImprovements(userGoals),
        strategyOptimizations: this.suggestStrategyOptimizations(userGoals),
        timelineAdjustments: this.suggestTimelineAdjustments(userGoals)
      };

      return {
        success: true,
        recommendations
      };
    } catch (error) {
      console.error('Error generating goal recommendations:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Helper methods for AI calculations and generations

  assessGoalRisk(targetAmount, monthsToGoal, currentIncome) {
    const monthlyRequirement = targetAmount / monthsToGoal;
    const incomeRatio = monthlyRequirement / (currentIncome || 1);
    
    if (incomeRatio > 0.3) return 'high';
    if (incomeRatio > 0.15) return 'medium';
    return 'low';
  }

  calculateFeasibilityScore(targetAmount, monthsToGoal, currentIncome, category) {
    let baseScore = 70;
    
    // Adjust based on income ratio
    const monthlyRequirement = targetAmount / monthsToGoal;
    const incomeRatio = monthlyRequirement / (currentIncome || 1);
    
    if (incomeRatio < 0.1) baseScore += 20;
    else if (incomeRatio < 0.2) baseScore += 10;
    else if (incomeRatio > 0.3) baseScore -= 30;
    else if (incomeRatio > 0.2) baseScore -= 15;
    
    // Adjust based on timeline
    if (monthsToGoal > 24) baseScore += 10;
    else if (monthsToGoal < 6) baseScore -= 20;
    
    // Adjust based on category
    const categoryMultipliers = {
      'emergency': 1.2,
      'retirement': 1.1,
      'education': 1.0,
      'travel': 0.9,
      'luxury': 0.8
    };
    
    baseScore *= (categoryMultipliers[category] || 1.0);
    
    return Math.max(0, Math.min(100, Math.round(baseScore)));
  }

  generateGoalStrategies(goalData, feasibilityScore) {
    const strategies = [];
    
    if (feasibilityScore < 60) {
      strategies.push({
        type: 'timeline_adjustment',
        title: 'Consider Extending Timeline',
        description: 'Extending your target date could make this goal more achievable',
        impact: 'high'
      });
    }
    
    strategies.push({
      type: 'automated_savings',
      title: 'Set Up Automatic Transfers',
      description: 'Automate your savings to ensure consistent progress',
      impact: 'high'
    });
    
    if (goalData.category === 'emergency') {
      strategies.push({
        type: 'priority_focus',
        title: 'Prioritize Emergency Fund',
        description: 'Emergency funds should be your top financial priority',
        impact: 'critical'
      });
    }
    
    return strategies;
  }

  generateMilestoneTitle(percentage, category) {
    const titles = {
      25: `Quarter Way There!`,
      50: `Halfway Milestone`,
      75: `Three-Quarters Complete`,
      90: `Almost There!`,
      100: `Goal Achieved!`
    };
    
    return titles[percentage] || `${percentage}% Complete`;
  }

  generateMilestoneDescription(percentage, targetAmount, goal) {
    return `Reach $${targetAmount.toLocaleString()} (${percentage}% of your ${goal.title} goal)`;
  }

  generateMilestoneReward(percentage) {
    const rewards = {
      25: 'Treat yourself to a small celebration',
      50: 'Enjoy a nice dinner out',
      75: 'Plan a fun weekend activity',
      90: 'Buy something you\'ve been wanting',
      100: 'Celebrate your achievement!'
    };
    
    return rewards[percentage] || 'Acknowledge your progress';
  }

  generateCelebrationMessage(percentage, goalTitle) {
    const messages = {
      25: `Great start on your ${goalTitle}! You're building momentum.`,
      50: `Fantastic! You're halfway to achieving your ${goalTitle}.`,
      75: `Excellent progress! Your ${goalTitle} is within reach.`,
      90: `Almost there! Your ${goalTitle} is so close you can taste it.`,
      100: `Congratulations! You've achieved your ${goalTitle}!`
    };
    
    return messages[percentage] || `${percentage}% progress on your ${goalTitle}!`;
  }

  calculateAverageMonthlyProgress(goal) {
    if (goal.progressHistory.length < 2) return 0;
    
    const monthsActive = Math.max(1, 
      (new Date() - goal.createdAt) / (1000 * 60 * 60 * 24 * 30)
    );
    
    return goal.currentAmount / monthsActive;
  }

  calculateAchievementPoints(percentage) {
    const basePoints = {
      25: 100,
      50: 250,
      75: 400,
      90: 600,
      100: 1000
    };
    
    return basePoints[percentage] || percentage * 10;
  }

  // Additional helper methods would continue here...
  // (generateSavingsStrategy, generateTimelineStrategy, etc.)
}

module.exports = GoalTrackingService;  g
enerateSavingsStrategy(goal) {
    const monthsRemaining = Math.ceil(
      (goal.targetDate - new Date()) / (1000 * 60 * 60 * 24 * 30)
    );
    const remainingAmount = goal.targetAmount - goal.currentAmount;
    const requiredMonthly = remainingAmount / monthsRemaining;

    return {
      requiredMonthlyAmount: requiredMonthly,
      suggestedFrequency: 'weekly',
      automationRecommendation: true,
      budgetAllocation: this.calculateBudgetAllocation(requiredMonthly),
      savingsAccounts: this.recommendSavingsAccounts(goal.category)
    };
  }

  generateTimelineStrategy(goal) {
    const currentProgress = (goal.currentAmount / goal.targetAmount) * 100;
    const timeElapsed = (new Date() - goal.createdAt) / (1000 * 60 * 60 * 24);
    const totalTimeframe = (goal.targetDate - goal.createdAt) / (1000 * 60 * 60 * 24);
    const timeProgress = (timeElapsed / totalTimeframe) * 100;

    return {
      onTrack: currentProgress >= timeProgress * 0.9,
      projectedCompletion: this.calculateProjectedCompletion(goal),
      adjustmentRecommendations: this.generateTimelineAdjustments(goal),
      accelerationOptions: this.generateAccelerationOptions(goal)
    };
  }

  generateRiskMitigation(goal) {
    const risks = [];
    
    if (goal.riskLevel === 'high') {
      risks.push({
        risk: 'Aggressive savings target',
        mitigation: 'Consider extending timeline or reducing target amount',
        priority: 'high'
      });
    }

    if (goal.category === 'investment') {
      risks.push({
        risk: 'Market volatility',
        mitigation: 'Diversify investments and consider dollar-cost averaging',
        priority: 'medium'
      });
    }

    return risks;
  }

  generateOptimizationTips(goal) {
    const tips = [];
    
    tips.push({
      category: 'automation',
      tip: 'Set up automatic transfers on payday',
      impact: 'high',
      effort: 'low'
    });

    if (goal.averageMonthlyProgress > 0) {
      const projectedMonths = (goal.targetAmount - goal.currentAmount) / goal.averageMonthlyProgress;
      if (projectedMonths > 12) {
        tips.push({
          category: 'acceleration',
          tip: 'Look for additional income sources or reduce expenses',
          impact: 'high',
          effort: 'medium'
        });
      }
    }

    return tips;
  }

  generateCurrentRecommendations(goal) {
    const recommendations = [];
    const currentProgress = (goal.currentAmount / goal.targetAmount) * 100;
    
    if (currentProgress < 10) {
      recommendations.push({
        type: 'getting_started',
        title: 'Build Initial Momentum',
        description: 'Make your first significant contribution to establish the habit',
        priority: 'high'
      });
    } else if (currentProgress < 50) {
      recommendations.push({
        type: 'consistency',
        title: 'Maintain Consistent Contributions',
        description: 'Focus on regular, automated contributions',
        priority: 'medium'
      });
    } else {
      recommendations.push({
        type: 'final_push',
        title: 'Final Sprint to Goal',
        description: 'Consider increasing contributions for the final stretch',
        priority: 'medium'
      });
    }

    return recommendations;
  }

  generateNextActions(goal) {
    const actions = [];
    const daysSinceLastContribution = goal.lastContribution 
      ? (new Date() - new Date(goal.lastContribution.date)) / (1000 * 60 * 60 * 24)
      : Infinity;

    if (daysSinceLastContribution > 30) {
      actions.push({
        action: 'Make a contribution',
        description: 'It\'s been a while since your last contribution',
        urgency: 'high',
        estimatedTime: '5 minutes'
      });
    }

    actions.push({
      action: 'Review and adjust budget',
      description: 'Ensure your budget allocates enough for this goal',
      urgency: 'medium',
      estimatedTime: '15 minutes'
    });

    return actions;
  }

  calculateProjectedCompletion(goal) {
    if (goal.averageMonthlyProgress <= 0) {
      return null;
    }

    const remainingAmount = goal.targetAmount - goal.currentAmount;
    const monthsToCompletion = remainingAmount / goal.averageMonthlyProgress;
    const projectedDate = new Date();
    projectedDate.setMonth(projectedDate.getMonth() + monthsToCompletion);

    return {
      date: projectedDate,
      monthsRemaining: Math.ceil(monthsToCompletion),
      onTrack: projectedDate <= goal.targetDate
    };
  }

  calculateSuccessProbability(goal) {
    let probability = 50; // Base probability

    // Adjust based on current progress
    const progressPercentage = (goal.currentAmount / goal.targetAmount) * 100;
    probability += progressPercentage * 0.3;

    // Adjust based on consistency
    if (goal.progressHistory.length > 3) {
      const recentContributions = goal.progressHistory.slice(-3);
      const consistency = recentContributions.length / 3;
      probability += consistency * 20;
    }

    // Adjust based on timeline feasibility
    const timeRemaining = (goal.targetDate - new Date()) / (1000 * 60 * 60 * 24 * 30);
    const requiredMonthly = (goal.targetAmount - goal.currentAmount) / timeRemaining;
    
    if (goal.averageMonthlyProgress > requiredMonthly * 1.2) {
      probability += 15;
    } else if (goal.averageMonthlyProgress < requiredMonthly * 0.8) {
      probability -= 20;
    }

    return Math.max(0, Math.min(100, Math.round(probability)));
  }

  analyzeProgressTrends(goal) {
    const history = goal.progressHistory.slice(-6); // Last 6 contributions
    if (history.length < 3) return null;

    const amounts = history.map(h => h.amount);
    const trend = this.calculateTrend(amounts);
    
    return {
      trend: trend > 0.1 ? 'increasing' : trend < -0.1 ? 'decreasing' : 'stable',
      averageContribution: amounts.reduce((a, b) => a + b, 0) / amounts.length,
      consistency: this.calculateConsistency(amounts),
      recommendation: this.getTrendRecommendation(trend, amounts)
    };
  }

  generateAdaptiveRecommendations(goal) {
    const analysis = this.analyzeProgressTrends(goal);
    if (!analysis) return [];

    const recommendations = [];

    if (analysis.trend === 'decreasing') {
      recommendations.push({
        type: 'trend_reversal',
        title: 'Reverse Declining Contributions',
        description: 'Your contributions have been decreasing. Consider reviewing your budget.',
        priority: 'high'
      });
    }

    if (analysis.consistency < 0.7) {
      recommendations.push({
        type: 'improve_consistency',
        title: 'Improve Contribution Consistency',
        description: 'Set up automatic transfers to maintain regular progress.',
        priority: 'medium'
      });
    }

    return recommendations;
  }

  generateDetailedGoalAnalytics(goal) {
    const strategy = this.strategies.get(goal.strategyId);
    const milestones = goal.milestones.map(id => this.milestones.get(id));
    
    return {
      success: true,
      goal: {
        ...goal,
        progressPercentage: (goal.currentAmount / goal.targetAmount) * 100,
        remainingAmount: goal.targetAmount - goal.currentAmount,
        daysRemaining: Math.ceil((goal.targetDate - new Date()) / (1000 * 60 * 60 * 24))
      },
      milestones,
      strategy,
      analytics: {
        progressTrend: this.analyzeProgressTrends(goal),
        projectedCompletion: this.calculateProjectedCompletion(goal),
        successProbability: this.calculateSuccessProbability(goal),
        performanceMetrics: this.calculatePerformanceMetrics(goal)
      }
    };
  }

  generateOverallGoalAnalytics(userGoals) {
    const activeGoals = userGoals.filter(g => g.status === 'active');
    const completedGoals = userGoals.filter(g => g.status === 'completed');
    
    const totalTargetAmount = activeGoals.reduce((sum, g) => sum + g.targetAmount, 0);
    const totalCurrentAmount = activeGoals.reduce((sum, g) => sum + g.currentAmount, 0);
    
    return {
      success: true,
      summary: {
        totalGoals: userGoals.length,
        activeGoals: activeGoals.length,
        completedGoals: completedGoals.length,
        totalProgress: totalTargetAmount > 0 ? (totalCurrentAmount / totalTargetAmount) * 100 : 0,
        totalSaved: totalCurrentAmount,
        totalTarget: totalTargetAmount
      },
      goalsByCategory: this.groupGoalsByCategory(userGoals),
      recentAchievements: this.getRecentAchievements(userGoals[0]?.userId),
      recommendations: this.generateOverallRecommendations(userGoals)
    };
  }

  // Utility helper methods
  calculateTrend(values) {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;
    
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  calculateConsistency(values) {
    if (values.length < 2) return 1;
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return Math.max(0, 1 - (stdDev / mean));
  }

  getTrendRecommendation(trend, amounts) {
    if (trend > 0.1) {
      return 'Great job increasing your contributions! Keep up the momentum.';
    } else if (trend < -0.1) {
      return 'Consider reviewing your budget to maintain consistent contributions.';
    } else {
      return 'Your contributions are stable. Consider small increases when possible.';
    }
  }

  calculatePerformanceMetrics(goal) {
    const timeElapsed = (new Date() - goal.createdAt) / (1000 * 60 * 60 * 24);
    const totalTimeframe = (goal.targetDate - goal.createdAt) / (1000 * 60 * 60 * 24);
    
    return {
      timeProgress: (timeElapsed / totalTimeframe) * 100,
      amountProgress: (goal.currentAmount / goal.targetAmount) * 100,
      efficiency: ((goal.currentAmount / goal.targetAmount) / (timeElapsed / totalTimeframe)) * 100,
      contributionFrequency: goal.progressHistory.length / (timeElapsed / 30), // contributions per month
      averageContribution: goal.progressHistory.length > 0 
        ? goal.progressHistory.reduce((sum, h) => sum + h.amount, 0) / goal.progressHistory.length 
        : 0
    };
  }

  groupGoalsByCategory(goals) {
    const grouped = {};
    goals.forEach(goal => {
      if (!grouped[goal.category]) {
        grouped[goal.category] = {
          count: 0,
          totalTarget: 0,
          totalCurrent: 0,
          goals: []
        };
      }
      grouped[goal.category].count++;
      grouped[goal.category].totalTarget += goal.targetAmount;
      grouped[goal.category].totalCurrent += goal.currentAmount;
      grouped[goal.category].goals.push(goal);
    });
    return grouped;
  }

  getRecentAchievements(userId) {
    return Array.from(this.achievements.values())
      .filter(achievement => achievement.userId === userId)
      .sort((a, b) => new Date(b.achievedAt) - new Date(a.achievedAt))
      .slice(0, 5);
  }

  generateOverallRecommendations(goals) {
    const recommendations = [];
    
    const activeGoals = goals.filter(g => g.status === 'active');
    if (activeGoals.length > 5) {
      recommendations.push({
        type: 'goal_management',
        title: 'Consider Consolidating Goals',
        description: 'You have many active goals. Consider prioritizing the most important ones.',
        priority: 'medium'
      });
    }

    const highRiskGoals = activeGoals.filter(g => g.riskLevel === 'high');
    if (highRiskGoals.length > 0) {
      recommendations.push({
        type: 'risk_management',
        title: 'Review High-Risk Goals',
        description: `${highRiskGoals.length} of your goals have high risk levels. Consider adjusting timelines.`,
        priority: 'high'
      });
    }

    return recommendations;
  }

  enhanceGoalTitle(title, category) {
    // Simple title enhancement - could be more sophisticated with NLP
    const categoryPrefixes = {
      'emergency': 'Emergency Fund:',
      'retirement': 'Retirement:',
      'travel': 'Travel Fund:',
      'education': 'Education:',
      'home': 'Home:'
    };
    
    const prefix = categoryPrefixes[category];
    if (prefix && !title.includes(prefix.replace(':', ''))) {
      return `${prefix} ${title}`;
    }
    
    return title;
  }

  generateGoalDescription(goalData) {
    const { category, targetAmount, targetDate } = goalData;
    const monthsToGoal = Math.ceil(
      (new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24 * 30)
    );
    
    return `Save $${targetAmount.toLocaleString()} for ${category} over ${monthsToGoal} months.`;
  }

  calculateBudgetAllocation(requiredMonthly) {
    return {
      recommended: requiredMonthly,
      minimum: requiredMonthly * 0.8,
      stretch: requiredMonthly * 1.2
    };
  }

  recommendSavingsAccounts(category) {
    const recommendations = {
      'emergency': ['High-yield savings account', 'Money market account'],
      'retirement': ['401(k)', 'IRA', 'Roth IRA'],
      'travel': ['High-yield savings account', 'CD'],
      'education': ['529 plan', 'Education savings account'],
      'home': ['High-yield savings account', 'CD']
    };
    
    return recommendations[category] || ['High-yield savings account'];
  }

  generateAccelerationOptions(goal) {
    return [
      {
        option: 'Increase monthly contribution by 20%',
        impact: 'Complete 2-3 months earlier',
        effort: 'medium'
      },
      {
        option: 'Add windfalls (bonuses, tax refunds)',
        impact: 'Significant acceleration',
        effort: 'low'
      },
      {
        option: 'Reduce other expenses temporarily',
        impact: 'Complete 1-2 months earlier',
        effort: 'high'
      }
    ];
  }

  generateTimelineAdjustments(goal) {
    const currentProgress = (goal.currentAmount / goal.targetAmount) * 100;
    const timeElapsed = (new Date() - goal.createdAt) / (1000 * 60 * 60 * 24 * 30);
    const expectedProgress = (timeElapsed / ((goal.targetDate - goal.createdAt) / (1000 * 60 * 60 * 24 * 30))) * 100;
    
    if (currentProgress < expectedProgress * 0.8) {
      return {
        recommendation: 'extend',
        suggestedExtension: 3, // months
        reason: 'Current progress is behind schedule'
      };
    } else if (currentProgress > expectedProgress * 1.2) {
      return {
        recommendation: 'accelerate',
        possibleAcceleration: 2, // months
        reason: 'Ahead of schedule - could complete earlier'
      };
    }
    
    return {
      recommendation: 'maintain',
      reason: 'On track with current timeline'
    };
  }

  suggestNewGoals(userProfile, existingGoals) {
    const suggestions = [];
    const existingCategories = new Set(existingGoals.map(g => g.category));
    
    if (!existingCategories.has('emergency')) {
      suggestions.push({
        category: 'emergency',
        title: 'Emergency Fund',
        description: 'Build 3-6 months of expenses for financial security',
        priority: 'critical',
        suggestedAmount: (userProfile.monthlyExpenses || 3000) * 6
      });
    }
    
    if (!existingCategories.has('retirement') && userProfile.age < 50) {
      suggestions.push({
        category: 'retirement',
        title: 'Retirement Savings',
        description: 'Start building your retirement nest egg',
        priority: 'high',
        suggestedAmount: userProfile.annualIncome * 0.1
      });
    }
    
    return suggestions;
  }

  suggestGoalImprovements(goals) {
    return goals.map(goal => {
      const improvements = [];
      
      if (goal.feasibilityScore < 60) {
        improvements.push({
          type: 'feasibility',
          suggestion: 'Consider extending timeline or reducing target amount',
          impact: 'high'
        });
      }
      
      if (!goal.lastContribution || 
          (new Date() - new Date(goal.lastContribution.date)) > 30 * 24 * 60 * 60 * 1000) {
        improvements.push({
          type: 'activity',
          suggestion: 'Make a contribution to maintain momentum',
          impact: 'medium'
        });
      }
      
      return {
        goalId: goal.id,
        improvements
      };
    }).filter(item => item.improvements.length > 0);
  }

  suggestStrategyOptimizations(goals) {
    const optimizations = [];
    
    const highRiskGoals = goals.filter(g => g.riskLevel === 'high');
    if (highRiskGoals.length > 0) {
      optimizations.push({
        type: 'risk_reduction',
        title: 'Reduce Goal Risk Levels',
        description: 'Consider adjusting timelines for high-risk goals',
        affectedGoals: highRiskGoals.map(g => g.id)
      });
    }
    
    return optimizations;
  }
}

module.exports = GoalTrackingService;