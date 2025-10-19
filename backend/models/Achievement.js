/**
 * Achievement Model
 * Database model for user achievements and rewards
 */

const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  goalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Goal',
    index: true
  },
  
  milestoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Milestone',
    index: true
  },
  
  // Achievement details
  type: {
    type: String,
    required: true,
    enum: [
      'milestone', 
      'goal_completion', 
      'streak', 
      'consistency', 
      'early_achievement',
      'savings_milestone',
      'category_master',
      'first_goal',
      'multiple_goals'
    ],
    index: true
  },
  
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  
  // Achievement metadata
  category: {
    type: String,
    enum: ['progress', 'consistency', 'milestone', 'completion', 'special'],
    default: 'progress'
  },
  
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'legendary'],
    default: 'medium'
  },
  
  // Rewards
  points: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  
  badge: {
    name: String,
    icon: String,
    color: String,
    rarity: {
      type: String,
      enum: ['common', 'rare', 'epic', 'legendary'],
      default: 'common'
    }
  },
  
  reward: {
    type: String,
    maxlength: 300
  },
  
  // Achievement data
  achievementData: {
    value: mongoose.Schema.Types.Mixed, // Flexible data for different achievement types
    context: mongoose.Schema.Types.Mixed,
    metrics: {
      timeToAchieve: Number, // in days
      effortLevel: Number, // 1-10 scale
      consistency: Number // 0-1 scale
    }
  },
  
  // Status
  isVisible: {
    type: Boolean,
    default: true
  },
  
  isNotified: {
    type: Boolean,
    default: false
  },
  
  // Timestamps
  achievedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  notifiedAt: Date,
  
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
achievementSchema.index({ userId: 1, type: 1 });
achievementSchema.index({ userId: 1, achievedAt: -1 });
achievementSchema.index({ type: 1, difficulty: 1 });

// Virtual fields
achievementSchema.virtual('isRecent').get(function() {
  const daysSinceAchieved = (new Date() - this.achievedAt) / (1000 * 60 * 60 * 24);
  return daysSinceAchieved <= 7; // Recent if within last 7 days
});

achievementSchema.virtual('pointsWithMultiplier').get(function() {
  const multipliers = {
    'easy': 1,
    'medium': 1.2,
    'hard': 1.5,
    'legendary': 2
  };
  
  return Math.round(this.points * (multipliers[this.difficulty] || 1));
});

// Instance methods
achievementSchema.methods.markAsNotified = function() {
  this.isNotified = true;
  this.notifiedAt = new Date();
  return this.save();
};

achievementSchema.methods.generateShareText = function() {
  const templates = {
    'milestone': `🎯 Just hit ${this.achievementData?.value}% of my ${this.title}! #FinancialGoals`,
    'goal_completion': `🏆 Goal achieved: ${this.title}! Another step towards financial freedom! #GoalAchieved`,
    'streak': `🔥 ${this.achievementData?.value} day savings streak! Consistency pays off! #SavingsStreak`,
    'consistency': `📈 Maintaining consistent progress on my financial goals! #FinancialDiscipline`
  };
  
  return templates[this.type] || `🎉 New achievement unlocked: ${this.title}!`;
};

// Static methods
achievementSchema.statics.findByUserId = function(userId, options = {}) {
  const query = { userId };
  
  if (options.type) {
    query.type = options.type;
  }
  
  if (options.category) {
    query.category = options.category;
  }
  
  if (options.isVisible !== undefined) {
    query.isVisible = options.isVisible;
  }
  
  return this.find(query)
    .sort(options.sort || { achievedAt: -1 })
    .limit(options.limit || 20)
    .skip(options.offset || 0);
};

achievementSchema.statics.getUserStats = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalAchievements: { $sum: 1 },
        totalPoints: { $sum: '$points' },
        achievementsByType: {
          $push: {
            type: '$type',
            points: '$points',
            difficulty: '$difficulty'
          }
        },
        achievementsByDifficulty: {
          $push: {
            difficulty: '$difficulty',
            count: 1
          }
        },
        recentAchievements: {
          $sum: {
            $cond: [
              { $gte: ['$achievedAt', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] },
              1,
              0
            ]
          }
        }
      }
    }
  ]);
};

achievementSchema.statics.getLeaderboard = function(type = null, limit = 10) {
  const matchStage = type ? { $match: { type } } : { $match: {} };
  
  return this.aggregate([
    matchStage,
    {
      $group: {
        _id: '$userId',
        totalPoints: { $sum: '$points' },
        achievementCount: { $sum: 1 },
        lastAchievement: { $max: '$achievedAt' }
      }
    },
    { $sort: { totalPoints: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $project: {
        userId: '$_id',
        userName: '$user.name',
        totalPoints: 1,
        achievementCount: 1,
        lastAchievement: 1
      }
    }
  ]);
};

achievementSchema.statics.createMilestoneAchievement = function(userId, goalId, milestoneId, milestoneData) {
  const achievement = new this({
    userId,
    goalId,
    milestoneId,
    type: 'milestone',
    title: `${milestoneData.title} Achieved!`,
    description: milestoneData.celebrationMessage,
    category: 'milestone',
    difficulty: this.getDifficultyByPercentage(milestoneData.percentage),
    points: this.getPointsByPercentage(milestoneData.percentage),
    badge: this.getBadgeByPercentage(milestoneData.percentage),
    reward: milestoneData.reward,
    achievementData: {
      value: milestoneData.percentage,
      context: {
        goalTitle: milestoneData.goalTitle,
        targetAmount: milestoneData.targetAmount,
        category: milestoneData.category
      }
    }
  });
  
  return achievement.save();
};

achievementSchema.statics.createGoalCompletionAchievement = function(userId, goalId, goalData) {
  const achievement = new this({
    userId,
    goalId,
    type: 'goal_completion',
    title: `Goal Completed: ${goalData.title}`,
    description: `Congratulations! You've successfully achieved your ${goalData.category} goal of $${goalData.targetAmount.toLocaleString()}.`,
    category: 'completion',
    difficulty: this.getDifficultyByAmount(goalData.targetAmount),
    points: this.getPointsByGoalCompletion(goalData),
    badge: this.getBadgeByGoalCompletion(goalData),
    reward: 'Celebrate your achievement!',
    achievementData: {
      value: goalData.targetAmount,
      context: {
        category: goalData.category,
        timeToComplete: goalData.completedAt - goalData.createdAt,
        contributionsCount: goalData.progressHistory.length
      }
    }
  });
  
  return achievement.save();
};

achievementSchema.statics.createStreakAchievement = function(userId, streakData) {
  const achievement = new this({
    userId,
    type: 'streak',
    title: `${streakData.days} Day Savings Streak!`,
    description: `Amazing consistency! You've made contributions for ${streakData.days} consecutive days.`,
    category: 'consistency',
    difficulty: this.getDifficultyByStreak(streakData.days),
    points: streakData.days * 10,
    badge: this.getBadgeByStreak(streakData.days),
    reward: 'Keep up the momentum!',
    achievementData: {
      value: streakData.days,
      context: {
        totalAmount: streakData.totalAmount,
        averageDaily: streakData.averageDaily
      }
    }
  });
  
  return achievement.save();
};

// Helper methods for achievement creation
achievementSchema.statics.getDifficultyByPercentage = function(percentage) {
  if (percentage >= 100) return 'legendary';
  if (percentage >= 75) return 'hard';
  if (percentage >= 50) return 'medium';
  return 'easy';
};

achievementSchema.statics.getPointsByPercentage = function(percentage) {
  const basePoints = {
    25: 100,
    50: 250,
    75: 400,
    90: 600,
    100: 1000
  };
  
  return basePoints[percentage] || percentage * 10;
};

achievementSchema.statics.getBadgeByPercentage = function(percentage) {
  const badges = {
    25: { name: 'First Quarter', icon: '🎯', color: '#4CAF50', rarity: 'common' },
    50: { name: 'Halfway Hero', icon: '⭐', color: '#FF9800', rarity: 'rare' },
    75: { name: 'Almost There', icon: '🚀', color: '#9C27B0', rarity: 'epic' },
    100: { name: 'Goal Crusher', icon: '🏆', color: '#FFD700', rarity: 'legendary' }
  };
  
  return badges[percentage] || { name: 'Progress', icon: '📈', color: '#2196F3', rarity: 'common' };
};

achievementSchema.statics.getDifficultyByAmount = function(amount) {
  if (amount >= 100000) return 'legendary';
  if (amount >= 50000) return 'hard';
  if (amount >= 10000) return 'medium';
  return 'easy';
};

achievementSchema.statics.getPointsByGoalCompletion = function(goalData) {
  let basePoints = 500;
  
  // Bonus for larger amounts
  if (goalData.targetAmount >= 50000) basePoints *= 2;
  else if (goalData.targetAmount >= 10000) basePoints *= 1.5;
  
  // Bonus for early completion
  const timeToComplete = (goalData.completedAt - goalData.createdAt) / (1000 * 60 * 60 * 24);
  const expectedTime = (goalData.targetDate - goalData.createdAt) / (1000 * 60 * 60 * 24);
  
  if (timeToComplete < expectedTime * 0.8) {
    basePoints *= 1.3; // 30% bonus for early completion
  }
  
  return Math.round(basePoints);
};

achievementSchema.statics.getBadgeByGoalCompletion = function(goalData) {
  const categoryBadges = {
    'emergency': { name: 'Safety Net', icon: '🛡️', color: '#F44336', rarity: 'epic' },
    'retirement': { name: 'Future Secure', icon: '🏖️', color: '#4CAF50', rarity: 'legendary' },
    'travel': { name: 'Wanderlust', icon: '✈️', color: '#03DAC6', rarity: 'rare' },
    'education': { name: 'Knowledge Seeker', icon: '🎓', color: '#9C27B0', rarity: 'epic' },
    'home': { name: 'Home Owner', icon: '🏠', color: '#FF9800', rarity: 'legendary' }
  };
  
  return categoryBadges[goalData.category] || 
    { name: 'Goal Achiever', icon: '🎯', color: '#2196F3', rarity: 'rare' };
};

achievementSchema.statics.getDifficultyByStreak = function(days) {
  if (days >= 100) return 'legendary';
  if (days >= 30) return 'hard';
  if (days >= 7) return 'medium';
  return 'easy';
};

achievementSchema.statics.getBadgeByStreak = function(days) {
  if (days >= 100) return { name: 'Centurion', icon: '💯', color: '#FFD700', rarity: 'legendary' };
  if (days >= 30) return { name: 'Monthly Master', icon: '🔥', color: '#FF5722', rarity: 'epic' };
  if (days >= 7) return { name: 'Week Warrior', icon: '⚡', color: '#FF9800', rarity: 'rare' };
  return { name: 'Streak Starter', icon: '🌟', color: '#4CAF50', rarity: 'common' };
};

module.exports = mongoose.model('Achievement', achievementSchema);