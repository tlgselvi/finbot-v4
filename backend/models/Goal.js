/**
 * Goal Model
 * Database model for financial goals with AI-assisted tracking
 */

const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Basic goal information
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  
  category: {
    type: String,
    required: true,
    enum: ['emergency', 'retirement', 'travel', 'education', 'home', 'investment', 'other'],
    index: true
  },
  
  // Financial details
  targetAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  currentAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  targetDate: {
    type: Date,
    required: true,
    index: true
  },
  
  // Goal status and priority
  status: {
    type: String,
    enum: ['active', 'completed', 'paused', 'deleted'],
    default: 'active',
    index: true
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  
  // AI-generated properties
  suggestedMonthlyContribution: {
    type: Number,
    min: 0
  },
  
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  
  feasibilityScore: {
    type: Number,
    min: 0,
    max: 100
  },
  
  // Milestone configuration
  milestonePercentages: [{
    type: Number,
    min: 0,
    max: 100
  }],
  
  completedMilestones: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Milestone'
  }],
  
  // Progress tracking
  progressHistory: [{
    date: {
      type: Date,
      default: Date.now
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    percentage: {
      type: Number,
      min: 0,
      max: 100
    },
    note: {
      type: String,
      maxlength: 500
    },
    source: {
      type: String,
      enum: ['manual', 'automatic', 'transfer', 'bonus'],
      default: 'manual'
    }
  }],
  
  lastContribution: {
    amount: Number,
    date: Date
  },
  
  averageMonthlyProgress: {
    type: Number,
    default: 0
  },
  
  // Strategy and recommendations
  strategies: [{
    type: {
      type: String,
      required: true
    },
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    impact: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    implemented: {
      type: Boolean,
      default: false
    },
    implementedAt: Date
  }],
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  completedAt: Date,
  deletedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
goalSchema.index({ userId: 1, status: 1 });
goalSchema.index({ userId: 1, category: 1 });
goalSchema.index({ userId: 1, targetDate: 1 });
goalSchema.index({ createdAt: -1 });

// Virtual fields
goalSchema.virtual('progressPercentage').get(function() {
  return this.targetAmount > 0 ? (this.currentAmount / this.targetAmount) * 100 : 0;
});

goalSchema.virtual('remainingAmount').get(function() {
  return Math.max(0, this.targetAmount - this.currentAmount);
});

goalSchema.virtual('daysRemaining').get(function() {
  const now = new Date();
  const target = new Date(this.targetDate);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
});

goalSchema.virtual('isOverdue').get(function() {
  return new Date() > new Date(this.targetDate) && this.status === 'active';
});

goalSchema.virtual('monthsToTarget').get(function() {
  const now = new Date();
  const target = new Date(this.targetDate);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24 * 30));
});

// Instance methods
goalSchema.methods.addContribution = function(amount, date = new Date(), note = '', source = 'manual') {
  const previousAmount = this.currentAmount;
  this.currentAmount += amount;
  
  const contribution = {
    date,
    amount,
    totalAmount: this.currentAmount,
    percentage: (this.currentAmount / this.targetAmount) * 100,
    note,
    source
  };
  
  this.progressHistory.push(contribution);
  this.lastContribution = {
    amount,
    date
  };
  
  // Update average monthly progress
  this.updateAverageMonthlyProgress();
  
  // Check if goal is completed
  if (this.currentAmount >= this.targetAmount && this.status === 'active') {
    this.status = 'completed';
    this.completedAt = new Date();
  }
  
  this.updatedAt = new Date();
  return contribution;
};

goalSchema.methods.updateAverageMonthlyProgress = function() {
  const monthsActive = Math.max(1, 
    (new Date() - this.createdAt) / (1000 * 60 * 60 * 24 * 30)
  );
  this.averageMonthlyProgress = this.currentAmount / monthsActive;
};

goalSchema.methods.calculateProjectedCompletion = function() {
  if (this.averageMonthlyProgress <= 0) {
    return null;
  }
  
  const remainingAmount = this.targetAmount - this.currentAmount;
  const monthsToCompletion = remainingAmount / this.averageMonthlyProgress;
  const projectedDate = new Date();
  projectedDate.setMonth(projectedDate.getMonth() + monthsToCompletion);
  
  return {
    date: projectedDate,
    monthsRemaining: Math.ceil(monthsToCompletion),
    onTrack: projectedDate <= this.targetDate
  };
};

goalSchema.methods.calculateSuccessProbability = function() {
  let probability = 50; // Base probability
  
  // Adjust based on current progress
  const progressPercentage = this.progressPercentage;
  probability += progressPercentage * 0.3;
  
  // Adjust based on consistency
  if (this.progressHistory.length > 3) {
    const recentContributions = this.progressHistory.slice(-3);
    const consistency = recentContributions.length / 3;
    probability += consistency * 20;
  }
  
  // Adjust based on timeline feasibility
  const timeRemaining = this.monthsToTarget;
  const requiredMonthly = this.remainingAmount / timeRemaining;
  
  if (this.averageMonthlyProgress > requiredMonthly * 1.2) {
    probability += 15;
  } else if (this.averageMonthlyProgress < requiredMonthly * 0.8) {
    probability -= 20;
  }
  
  return Math.max(0, Math.min(100, Math.round(probability)));
};

goalSchema.methods.getProgressTrend = function() {
  const history = this.progressHistory.slice(-6); // Last 6 contributions
  if (history.length < 3) return null;
  
  const amounts = history.map(h => h.amount);
  const trend = this.calculateTrend(amounts);
  
  return {
    trend: trend > 0.1 ? 'increasing' : trend < -0.1 ? 'decreasing' : 'stable',
    averageContribution: amounts.reduce((a, b) => a + b, 0) / amounts.length,
    consistency: this.calculateConsistency(amounts)
  };
};

goalSchema.methods.calculateTrend = function(values) {
  if (values.length < 2) return 0;
  
  const n = values.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
  const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;
  
  return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
};

goalSchema.methods.calculateConsistency = function(values) {
  if (values.length < 2) return 1;
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  
  return Math.max(0, 1 - (stdDev / mean));
};

// Static methods
goalSchema.statics.findByUserId = function(userId, options = {}) {
  const query = { userId };
  
  if (options.status) {
    query.status = options.status;
  }
  
  if (options.category) {
    query.category = options.category;
  }
  
  return this.find(query)
    .sort(options.sort || { updatedAt: -1 })
    .limit(options.limit || 20)
    .skip(options.offset || 0);
};

goalSchema.statics.getGoalAnalytics = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalGoals: { $sum: 1 },
        activeGoals: {
          $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
        },
        completedGoals: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        totalTargetAmount: { $sum: '$targetAmount' },
        totalCurrentAmount: { $sum: '$currentAmount' },
        averageFeasibilityScore: { $avg: '$feasibilityScore' }
      }
    }
  ]);
};

goalSchema.statics.getGoalsByCategory = function(userId) {
  return this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        totalTarget: { $sum: '$targetAmount' },
        totalCurrent: { $sum: '$currentAmount' },
        averageProgress: { $avg: { $multiply: [{ $divide: ['$currentAmount', '$targetAmount'] }, 100] } }
      }
    }
  ]);
};

// Pre-save middleware
goalSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Update average monthly progress
  if (this.isModified('currentAmount') || this.isModified('progressHistory')) {
    this.updateAverageMonthlyProgress();
  }
  
  next();
});

// Pre-find middleware to exclude deleted goals by default
goalSchema.pre(/^find/, function(next) {
  if (!this.getQuery().status && !this.getQuery().deletedAt) {
    this.find({ status: { $ne: 'deleted' } });
  }
  next();
});

module.exports = mongoose.model('Goal', goalSchema);