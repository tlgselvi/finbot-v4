/**
 * Milestone Model
 * Database model for goal milestones and achievements
 */

const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema({
  goalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Goal',
    required: true,
    index: true
  },
  
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Milestone details
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  
  targetAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'achieved', 'missed'],
    default: 'pending',
    index: true
  },
  
  achievedAt: Date,
  
  // Rewards and celebration
  reward: {
    type: String,
    maxlength: 300
  },
  
  celebrationMessage: {
    type: String,
    maxlength: 500
  },
  
  points: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Achievement details
  achievementData: {
    actualAmount: Number,
    daysToAchieve: Number,
    contributionsCount: Number,
    averageContribution: Number
  },
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
milestoneSchema.index({ goalId: 1, percentage: 1 });
milestoneSchema.index({ userId: 1, status: 1 });
milestoneSchema.index({ achievedAt: -1 });

// Virtual fields
milestoneSchema.virtual('isAchieved').get(function() {
  return this.status === 'achieved';
});

milestoneSchema.virtual('daysOverdue').get(function() {
  if (this.status !== 'pending') return 0;
  
  // Calculate expected achievement date based on goal timeline
  // This would need goal data to be accurate
  return 0;
});

// Instance methods
milestoneSchema.methods.markAsAchieved = function(actualAmount, contributionsCount = 0) {
  this.status = 'achieved';
  this.achievedAt = new Date();
  
  this.achievementData = {
    actualAmount,
    daysToAchieve: Math.ceil((new Date() - this.createdAt) / (1000 * 60 * 60 * 24)),
    contributionsCount,
    averageContribution: contributionsCount > 0 ? actualAmount / contributionsCount : 0
  };
  
  // Calculate points based on percentage and achievement speed
  this.points = this.calculatePoints();
  
  this.updatedAt = new Date();
  return this;
};

milestoneSchema.methods.calculatePoints = function() {
  const basePoints = {
    25: 100,
    50: 250,
    75: 400,
    90: 600,
    100: 1000
  };
  
  let points = basePoints[this.percentage] || this.percentage * 10;
  
  // Bonus points for early achievement
  if (this.achievementData && this.achievementData.daysToAchieve) {
    const expectedDays = this.percentage * 3; // Rough estimate
    if (this.achievementData.daysToAchieve < expectedDays) {
      points *= 1.2; // 20% bonus for early achievement
    }
  }
  
  return Math.round(points);
};

// Static methods
milestoneSchema.statics.findByGoalId = function(goalId) {
  return this.find({ goalId }).sort({ percentage: 1 });
};

milestoneSchema.statics.findAchievedByUserId = function(userId, limit = 10) {
  return this.find({ 
    userId, 
    status: 'achieved' 
  })
  .sort({ achievedAt: -1 })
  .limit(limit)
  .populate('goalId', 'title category');
};

milestoneSchema.statics.getUserMilestoneStats = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalPoints: { $sum: '$points' }
      }
    }
  ]);
};

// Pre-save middleware
milestoneSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Milestone', milestoneSchema);