/**
 * Goal Tracking API Routes
 * RESTful endpoints for AI-assisted goal tracking and planning
 */

const express = require('express');
const router = express.Router();
const GoalTrackingService = require('../services/GoalTrackingService');
const { authenticateToken, validateRequest } = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');

// Initialize goal tracking service
const goalService = new GoalTrackingService();

/**
 * @route POST /api/goals
 * @desc Create a new financial goal with AI assistance
 * @access Private
 */
router.post('/',
  authenticateToken,
  [
    body('title').notEmpty().withMessage('Goal title is required'),
    body('targetAmount').isFloat({ min: 0 }).withMessage('Target amount must be positive'),
    body('targetDate').isISO8601().withMessage('Valid target date is required'),
    body('category').isIn(['emergency', 'retirement', 'travel', 'education', 'home', 'investment', 'other'])
      .withMessage('Invalid category'),
    body('currentIncome').optional().isFloat({ min: 0 }),
    body('description').optional().isString()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const goalData = req.body;

      const result = await goalService.createGoal(userId, goalData);
      
      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error creating goal:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route GET /api/goals
 * @desc Get all goals for authenticated user
 * @access Private
 */
router.get('/',
  authenticateToken,
  [
    query('status').optional().isIn(['active', 'completed', 'paused']),
    query('category').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 })
  ],
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { status, category, limit = 20, offset = 0 } = req.query;

      // Get user goals with filters
      const userGoals = Array.from(goalService.goals.values())
        .filter(goal => {
          if (goal.userId !== userId) return false;
          if (status && goal.status !== status) return false;
          if (category && goal.category !== category) return false;
          return true;
        })
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(offset, offset + parseInt(limit));

      // Add progress calculations
      const goalsWithProgress = userGoals.map(goal => ({
        ...goal,
        progressPercentage: (goal.currentAmount / goal.targetAmount) * 100,
        remainingAmount: goal.targetAmount - goal.currentAmount,
        daysRemaining: Math.ceil((goal.targetDate - new Date()) / (1000 * 60 * 60 * 24)),
        milestoneCount: goal.milestones ? goal.milestones.length : 0,
        completedMilestoneCount: goal.completedMilestones ? goal.completedMilestones.length : 0
      }));

      res.json({
        success: true,
        goals: goalsWithProgress,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: userGoals.length
        }
      });
    } catch (error) {
      console.error('Error fetching goals:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route GET /api/goals/:goalId
 * @desc Get detailed goal information with analytics
 * @access Private
 */
router.get('/:goalId',
  authenticateToken,
  [
    param('goalId').isUUID().withMessage('Invalid goal ID')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const { goalId } = req.params;

      const result = await goalService.getGoalAnalytics(userId, goalId);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error) {
      console.error('Error fetching goal details:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route PUT /api/goals/:goalId/progress
 * @desc Update goal progress with new contribution
 * @access Private
 */
router.put('/:goalId/progress',
  authenticateToken,
  [
    param('goalId').isUUID().withMessage('Invalid goal ID'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Contribution amount must be positive'),
    body('date').optional().isISO8601().withMessage('Invalid date format'),
    body('note').optional().isString().isLength({ max: 500 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { goalId } = req.params;
      const { amount, date, note } = req.body;
      const contributionDate = date ? new Date(date) : new Date();

      // Verify goal ownership
      const goal = goalService.goals.get(goalId);
      if (!goal || goal.userId !== req.user.id) {
        return res.status(404).json({
          success: false,
          error: 'Goal not found'
        });
      }

      const result = await goalService.updateGoalProgress(goalId, amount, contributionDate);
      
      if (result.success) {
        // Add note to the contribution if provided
        if (note && result.goal.progressHistory.length > 0) {
          const lastContribution = result.goal.progressHistory[result.goal.progressHistory.length - 1];
          lastContribution.note = note;
        }

        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error updating goal progress:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route GET /api/goals/:goalId/milestones
 * @desc Get milestones for a specific goal
 * @access Private
 */
router.get('/:goalId/milestones',
  authenticateToken,
  [
    param('goalId').isUUID().withMessage('Invalid goal ID')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { goalId } = req.params;
      const userId = req.user.id;

      // Verify goal ownership
      const goal = goalService.goals.get(goalId);
      if (!goal || goal.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Goal not found'
        });
      }

      // Get milestones
      const milestones = goal.milestones.map(milestoneId => 
        goalService.milestones.get(milestoneId)
      ).filter(Boolean);

      res.json({
        success: true,
        milestones: milestones.sort((a, b) => a.percentage - b.percentage)
      });
    } catch (error) {
      console.error('Error fetching milestones:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route GET /api/goals/:goalId/strategy
 * @desc Get achievement strategy for a specific goal
 * @access Private
 */
router.get('/:goalId/strategy',
  authenticateToken,
  [
    param('goalId').isUUID().withMessage('Invalid goal ID')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { goalId } = req.params;
      const userId = req.user.id;

      // Verify goal ownership
      const goal = goalService.goals.get(goalId);
      if (!goal || goal.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Goal not found'
        });
      }

      // Get strategy
      const strategy = goalService.strategies.get(goal.strategyId);
      if (!strategy) {
        return res.status(404).json({
          success: false,
          error: 'Strategy not found'
        });
      }

      res.json({
        success: true,
        strategy
      });
    } catch (error) {
      console.error('Error fetching strategy:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route PUT /api/goals/:goalId
 * @desc Update goal details
 * @access Private
 */
router.put('/:goalId',
  authenticateToken,
  [
    param('goalId').isUUID().withMessage('Invalid goal ID'),
    body('title').optional().notEmpty().withMessage('Goal title cannot be empty'),
    body('targetAmount').optional().isFloat({ min: 0 }).withMessage('Target amount must be positive'),
    body('targetDate').optional().isISO8601().withMessage('Valid target date is required'),
    body('description').optional().isString(),
    body('priority').optional().isIn(['low', 'medium', 'high'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { goalId } = req.params;
      const userId = req.user.id;
      const updates = req.body;

      // Verify goal ownership
      const goal = goalService.goals.get(goalId);
      if (!goal || goal.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Goal not found'
        });
      }

      // Update goal
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          goal[key] = updates[key];
        }
      });
      goal.updatedAt = new Date();

      // Regenerate strategy if target amount or date changed
      if (updates.targetAmount || updates.targetDate) {
        await goalService.updateAchievementStrategy(goalId);
      }

      goalService.goals.set(goalId, goal);

      res.json({
        success: true,
        goal: {
          ...goal,
          progressPercentage: (goal.currentAmount / goal.targetAmount) * 100,
          remainingAmount: goal.targetAmount - goal.currentAmount
        }
      });
    } catch (error) {
      console.error('Error updating goal:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route DELETE /api/goals/:goalId
 * @desc Delete a goal (soft delete - mark as inactive)
 * @access Private
 */
router.delete('/:goalId',
  authenticateToken,
  [
    param('goalId').isUUID().withMessage('Invalid goal ID')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { goalId } = req.params;
      const userId = req.user.id;

      // Verify goal ownership
      const goal = goalService.goals.get(goalId);
      if (!goal || goal.userId !== userId) {
        return res.status(404).json({
          success: false,
          error: 'Goal not found'
        });
      }

      // Soft delete - mark as inactive
      goal.status = 'deleted';
      goal.deletedAt = new Date();
      goal.updatedAt = new Date();

      goalService.goals.set(goalId, goal);

      res.json({
        success: true,
        message: 'Goal deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting goal:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route GET /api/goals/analytics/overview
 * @desc Get overall goal analytics for user
 * @access Private
 */
router.get('/analytics/overview',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const result = await goalService.getGoalAnalytics(userId);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error fetching goal analytics:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route GET /api/goals/recommendations
 * @desc Get AI-powered goal recommendations
 * @access Private
 */
router.get('/recommendations',
  authenticateToken,
  async (req, res) => {
    try {
      const userId = req.user.id;
      
      // Mock user profile - in real app, this would come from user service
      const userProfile = {
        age: req.user.age || 30,
        annualIncome: req.user.annualIncome || 60000,
        monthlyExpenses: req.user.monthlyExpenses || 3000,
        riskTolerance: req.user.riskTolerance || 'medium'
      };

      const result = await goalService.generateGoalRecommendations(userId, userProfile);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error generating recommendations:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

/**
 * @route GET /api/goals/achievements
 * @desc Get user achievements and milestones
 * @access Private
 */
router.get('/achievements',
  authenticateToken,
  [
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('type').optional().isIn(['milestone', 'goal_completion', 'streak'])
  ],
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { limit = 20, type } = req.query;

      let achievements = Array.from(goalService.achievements.values())
        .filter(achievement => achievement.userId === userId);

      if (type) {
        achievements = achievements.filter(achievement => achievement.type === type);
      }

      achievements = achievements
        .sort((a, b) => new Date(b.achievedAt) - new Date(a.achievedAt))
        .slice(0, parseInt(limit));

      res.json({
        success: true,
        achievements,
        totalPoints: achievements.reduce((sum, a) => sum + (a.points || 0), 0)
      });
    } catch (error) {
      console.error('Error fetching achievements:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
);

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('Goal routes error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

module.exports = router;