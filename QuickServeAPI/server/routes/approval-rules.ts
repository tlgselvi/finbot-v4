/**
 * FinBot v4 - Approval Rules API Routes
 * REST endpoints for managing approval rules configuration
 */

import { Router } from 'express';
import { eq, and, desc, asc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { approvalRules } from '../db/approval-schema';
import { ApprovalRuleModel, ApprovalRuleSchema } from '../db/approval-models';
import { approvalRuleEngine } from '../services/approval-rule-engine';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = Router();

// Validation schemas
const CreateRuleSchema = ApprovalRuleSchema.omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

const UpdateRuleSchema = CreateRuleSchema.partial();

const TestRuleSchema = z.object({
  transactionType: z.enum(['transfer', 'payment', 'withdrawal', 'investment', 'loan']),
  amount: z.number().min(0),
  currency: z.string().length(3),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/approval-rules
 * Get all approval rules with filtering and pagination
 */
router.get('/', requirePermission('view_approval_rules'), async (req, res) => {
  try {
    const {
      page = '1',
      limit = '50',
      type,
      currency = 'TRY',
      active = 'true',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Build where conditions
    const conditions = [];
    
    if (active !== 'all') {
      conditions.push(eq(approvalRules.isActive, active === 'true'));
    }
    
    if (type) {
      conditions.push(eq(approvalRules.transactionType, type as any));
    }
    
    if (currency) {
      conditions.push(eq(approvalRules.currency, currency as string));
    }

    // Build order by
    const orderBy = sortOrder === 'desc' 
      ? desc(approvalRules[sortBy as keyof typeof approvalRules])
      : asc(approvalRules[sortBy as keyof typeof approvalRules]);

    // Get rules with pagination
    const rules = await db
      .select()
      .from(approvalRules)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(orderBy)
      .limit(limitNum)
      .offset(offset);

    // Get total count
    const totalCount = await db
      .select({ count: sql`count(*)` })
      .from(approvalRules)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const total = parseInt(totalCount[0]?.count || '0');

    res.json({
      success: true,
      data: rules,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Get approval rules error:', error);
    res.status(500).json({
      error: 'Failed to fetch approval rules',
      code: 'FETCH_RULES_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
});

/**
 * GET /api/approval-rules/:id
 * Get specific approval rule by ID
 */
router.get('/:id', requirePermission('view_approval_rules'), async (req, res) => {
  try {
    const { id } = req.params;

    const rule = await db
      .select()
      .from(approvalRules)
      .where(eq(approvalRules.id, id))
      .limit(1);

    if (!rule[0]) {
      return res.status(404).json({
        error: 'Approval rule not found',
        code: 'RULE_NOT_FOUND',
        details: `Rule with ID ${id} does not exist`,
        traceId: req.id
      });
    }

    res.json({
      success: true,
      data: rule[0]
    });

  } catch (error) {
    console.error('Get approval rule error:', error);
    res.status(500).json({
      error: 'Failed to fetch approval rule',
      code: 'FETCH_RULE_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
});

/**
 * POST /api/approval-rules
 * Create new approval rule
 */
router.post('/', 
  requirePermission('manage_approval_rules'),
  validateRequest({ body: CreateRuleSchema }),
  async (req, res) => {
    try {
      const ruleData = {
        ...req.body,
        createdBy: req.user.id,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Validate rule configuration
      const validation = approvalRuleEngine.validateRuleConfiguration(ruleData);
      if (!validation.isValid) {
        return res.status(400).json({
          error: 'Invalid rule configuration',
          code: 'RULE_VALIDATION_ERROR',
          details: validation.errors,
          traceId: req.id
        });
      }

      // Create rule
      const [newRule] = await db
        .insert(approvalRules)
        .values(ruleData)
        .returning();

      res.status(201).json({
        success: true,
        data: newRule,
        message: 'Approval rule created successfully'
      });

    } catch (error) {
      console.error('Create approval rule error:', error);
      
      if (error.code === '23505') { // Unique constraint violation
        return res.status(409).json({
          error: 'Rule with this configuration already exists',
          code: 'RULE_DUPLICATE_ERROR',
          details: error.detail,
          traceId: req.id
        });
      }

      res.status(500).json({
        error: 'Failed to create approval rule',
        code: 'CREATE_RULE_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * PUT /api/approval-rules/:id
 * Update existing approval rule
 */
router.put('/:id',
  requirePermission('manage_approval_rules'),
  validateRequest({ body: UpdateRuleSchema }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = {
        ...req.body,
        updatedAt: new Date()
      };

      // Check if rule exists
      const existingRule = await db
        .select()
        .from(approvalRules)
        .where(eq(approvalRules.id, id))
        .limit(1);

      if (!existingRule[0]) {
        return res.status(404).json({
          error: 'Approval rule not found',
          code: 'RULE_NOT_FOUND',
          details: `Rule with ID ${id} does not exist`,
          traceId: req.id
        });
      }

      // Merge with existing data for validation
      const mergedData = { ...existingRule[0], ...updateData };
      
      // Validate updated rule configuration
      const validation = approvalRuleEngine.validateRuleConfiguration(mergedData);
      if (!validation.isValid) {
        return res.status(400).json({
          error: 'Invalid rule configuration',
          code: 'RULE_VALIDATION_ERROR',
          details: validation.errors,
          traceId: req.id
        });
      }

      // Update rule
      const [updatedRule] = await db
        .update(approvalRules)
        .set(updateData)
        .where(eq(approvalRules.id, id))
        .returning();

      res.json({
        success: true,
        data: updatedRule,
        message: 'Approval rule updated successfully'
      });

    } catch (error) {
      console.error('Update approval rule error:', error);
      res.status(500).json({
        error: 'Failed to update approval rule',
        code: 'UPDATE_RULE_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * DELETE /api/approval-rules/:id
 * Delete approval rule (soft delete by setting isActive = false)
 */
router.delete('/:id', requirePermission('manage_approval_rules'), async (req, res) => {
  try {
    const { id } = req.params;

    // Check if rule exists
    const existingRule = await db
      .select()
      .from(approvalRules)
      .where(eq(approvalRules.id, id))
      .limit(1);

    if (!existingRule[0]) {
      return res.status(404).json({
        error: 'Approval rule not found',
        code: 'RULE_NOT_FOUND',
        details: `Rule with ID ${id} does not exist`,
        traceId: req.id
      });
    }

    // Soft delete (deactivate)
    const [deactivatedRule] = await db
      .update(approvalRules)
      .set({ 
        isActive: false, 
        updatedAt: new Date() 
      })
      .where(eq(approvalRules.id, id))
      .returning();

    res.json({
      success: true,
      data: deactivatedRule,
      message: 'Approval rule deactivated successfully'
    });

  } catch (error) {
    console.error('Delete approval rule error:', error);
    res.status(500).json({
      error: 'Failed to delete approval rule',
      code: 'DELETE_RULE_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
});

/**
 * POST /api/approval-rules/:id/activate
 * Activate deactivated rule
 */
router.post('/:id/activate', requirePermission('manage_approval_rules'), async (req, res) => {
  try {
    const { id } = req.params;

    const [activatedRule] = await db
      .update(approvalRules)
      .set({ 
        isActive: true, 
        updatedAt: new Date() 
      })
      .where(eq(approvalRules.id, id))
      .returning();

    if (!activatedRule) {
      return res.status(404).json({
        error: 'Approval rule not found',
        code: 'RULE_NOT_FOUND',
        traceId: req.id
      });
    }

    res.json({
      success: true,
      data: activatedRule,
      message: 'Approval rule activated successfully'
    });

  } catch (error) {
    console.error('Activate approval rule error:', error);
    res.status(500).json({
      error: 'Failed to activate approval rule',
      code: 'ACTIVATE_RULE_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
});

/**
 * POST /api/approval-rules/:id/test
 * Test rule against sample transaction
 */
router.post('/:id/test',
  requirePermission('manage_approval_rules'),
  validateRequest({ body: TestRuleSchema }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const testTransaction = req.body;

      const result = await approvalRuleEngine.testRule(id, testTransaction);

      res.json({
        success: true,
        data: result,
        message: 'Rule test completed successfully'
      });

    } catch (error) {
      console.error('Test approval rule error:', error);
      
      if (error.message === 'Rule not found') {
        return res.status(404).json({
          error: 'Approval rule not found',
          code: 'RULE_NOT_FOUND',
          traceId: req.id
        });
      }

      res.status(500).json({
        error: 'Failed to test approval rule',
        code: 'TEST_RULE_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * GET /api/approval-rules/:id/statistics
 * Get rule usage statistics
 */
router.get('/:id/statistics', requirePermission('view_approval_rules'), async (req, res) => {
  try {
    const { id } = req.params;
    const { days = '30' } = req.query;

    const statistics = await approvalRuleEngine.getRuleStatistics(id, parseInt(days as string));

    res.json({
      success: true,
      data: statistics
    });

  } catch (error) {
    console.error('Get rule statistics error:', error);
    res.status(500).json({
      error: 'Failed to fetch rule statistics',
      code: 'STATISTICS_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
});

/**
 * GET /api/approval-rules/types
 * Get available transaction types and their configurations
 */
router.get('/meta/types', requirePermission('view_approval_rules'), async (req, res) => {
  try {
    const transactionTypes = [
      {
        value: 'transfer',
        label: 'Transfer',
        description: 'Money transfers between accounts',
        defaultLevels: 2,
        minAmount: 0
      },
      {
        value: 'payment',
        label: 'Payment',
        description: 'Bill payments and purchases',
        defaultLevels: 1,
        minAmount: 0
      },
      {
        value: 'withdrawal',
        label: 'Withdrawal',
        description: 'Cash withdrawals',
        defaultLevels: 1,
        minAmount: 0
      },
      {
        value: 'investment',
        label: 'Investment',
        description: 'Investment transactions',
        defaultLevels: 2,
        minAmount: 1000
      },
      {
        value: 'loan',
        label: 'Loan',
        description: 'Loan applications and disbursements',
        defaultLevels: 3,
        minAmount: 0
      }
    ];

    const userRoles = [
      { value: 'admin', label: 'Administrator' },
      { value: 'finance', label: 'Finance Manager' },
      { value: 'viewer', label: 'Viewer' },
      { value: 'auditor', label: 'Auditor' }
    ];

    const currencies = [
      { value: 'TRY', label: 'Turkish Lira' },
      { value: 'USD', label: 'US Dollar' },
      { value: 'EUR', label: 'Euro' },
      { value: 'GBP', label: 'British Pound' }
    ];

    res.json({
      success: true,
      data: {
        transactionTypes,
        userRoles,
        currencies,
        maxApprovalLevels: 5
      }
    });

  } catch (error) {
    console.error('Get rule metadata error:', error);
    res.status(500).json({
      error: 'Failed to fetch rule metadata',
      code: 'METADATA_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
});

export default router;