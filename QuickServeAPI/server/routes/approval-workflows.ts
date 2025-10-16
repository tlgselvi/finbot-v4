/**
 * FinBot v4 - Approval Workflows API Routes
 * REST endpoints for managing approval workflows
 */

import { Router } from 'express';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { approvalWorkflows, approvalActions, riskAssessments, approvalRules } from '../db/approval-schema';
import { ApprovalWorkflowSchema, ApprovalActionSchema } from '../db/approval-models';
import { approvalWorkflowOrchestrator } from '../services/approval-workflow-orchestrator';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { ApprovalWorkflowQueries } from '../db/query-optimizer';
import { cacheQuery, invalidateCacheOnWrite } from '../middleware/query-cache';

const router = Router();

// Validation schemas
const CreateWorkflowSchema = z.object({
  transaction: z.object({
    id: z.string().uuid(),
    type: z.enum(['transfer', 'payment', 'withdrawal', 'investment', 'loan']),
    amount: z.number().min(0),
    currency: z.string().length(3),
    userId: z.string().uuid(),
    timestamp: z.string().datetime().optional(),
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    metadata: z.record(z.any()).optional()
  }),
  requesterId: z.string().uuid(),
  metadata: z.record(z.any()).optional()
});

const ApprovalDecisionSchema = z.object({
  action: z.enum(['approve', 'reject', 'delegate', 'escalate']),
  comments: z.string().optional(),
  delegatedTo: z.string().uuid().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional()
});

const EmergencyOverrideSchema = z.object({
  reason: z.string().min(10).max(500),
  ipAddress: z.string().optional()
});

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * POST /api/approval-workflows
 * Create new approval workflow
 */
router.post('/',
  requirePermission('create_approval_workflow'),
  validateRequest({ body: CreateWorkflowSchema }),
  async (req, res) => {
    try {
      const { transaction, requesterId, metadata } = req.body;

      // Add timestamp if not provided
      if (!transaction.timestamp) {
        transaction.timestamp = new Date().toISOString();
      }

      const result = await approvalWorkflowOrchestrator.createWorkflow({
        transaction: {
          ...transaction,
          timestamp: new Date(transaction.timestamp)
        },
        requesterId,
        metadata
      });

      res.status(201).json({
        success: true,
        data: result,
        message: result.requiresApproval 
          ? 'Approval workflow created successfully'
          : 'Transaction auto-approved'
      });

    } catch (error) {
      console.error('Create workflow error:', error);
      res.status(500).json({
        error: 'Failed to create approval workflow',
        code: 'CREATE_WORKFLOW_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * GET /api/approval-workflows
 * Get workflows with filtering and pagination (Optimized)
 */
router.get('/', 
  requirePermission('view_approval_workflows'),
  cacheQuery({ ttl: 3 * 60 * 1000 }), // 3 minute cache
  async (req, res) => {
  try {
    const {
      page = '1',
      limit = '50',
      status,
      requesterId,
      priority,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100); // Cap at 100
    const offset = (pageNum - 1) * limitNum;

    // Use optimized query
    const filters: any = {
      limit: limitNum,
      offset,
      status: status as string,
      requesterId: requesterId as string,
      priority: priority as string
    };

    if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
    if (dateTo) filters.dateTo = new Date(dateTo as string);

    const result = await ApprovalWorkflowQueries.getWorkflows(filters);

    const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count || '0') : 0;

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      performance: {
        queryTime: result.duration,
        rowCount: result.rowCount
      }
    });

  } catch (error) {
    console.error('Get workflows error:', error);
    res.status(500).json({
      error: 'Failed to fetch workflows',
      code: 'FETCH_WORKFLOWS_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
});

/**
 * GET /api/approval-workflows/:id
 * Get specific workflow with full details (Optimized)
 */
router.get('/:id', requirePermission('view_approval_workflows'), async (req, res) => {
  try {
    const { id } = req.params;

    // Use optimized single query
    const result = await ApprovalWorkflowQueries.getWorkflowById(id);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Workflow not found',
        code: 'WORKFLOW_NOT_FOUND',
        details: `Workflow with ID ${id} does not exist`,
        traceId: req.id
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
      performance: {
        queryTime: result.duration,
        rowCount: result.rowCount
      }
    });

  } catch (error) {
    console.error('Get workflow error:', error);
    res.status(500).json({
      error: 'Failed to fetch workflow',
      code: 'FETCH_WORKFLOW_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
});

/**
 * POST /api/approval-workflows/:id/actions
 * Submit approval decision
 */
router.post('/:id/actions',
  requirePermission('approve_workflow'),
  validateRequest({ body: ApprovalDecisionSchema }),
  invalidateCacheOnWrite(['/api/approval-workflows', 'pending', 'dashboard']),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { action, comments, delegatedTo, ipAddress, userAgent } = req.body;

      // Get workflow to determine current level
      const workflow = await approvalWorkflowOrchestrator.getWorkflowById(id);
      if (!workflow) {
        return res.status(404).json({
          error: 'Workflow not found',
          code: 'WORKFLOW_NOT_FOUND',
          traceId: req.id
        });
      }

      const decision = {
        workflowId: id,
        approverId: req.user.id,
        action,
        level: workflow.currentLevel,
        comments,
        delegatedTo,
        ipAddress: ipAddress || req.ip,
        userAgent: userAgent || req.get('User-Agent')
      };

      const result = await approvalWorkflowOrchestrator.processApprovalDecision(decision);

      res.json({
        success: true,
        data: result,
        message: result.message
      });

    } catch (error) {
      console.error('Process approval decision error:', error);
      
      if (error.message.includes('not in pending state') || 
          error.message.includes('Cannot approve at level')) {
        return res.status(409).json({
          error: 'Invalid workflow state for this action',
          code: 'WORKFLOW_STATE_ERROR',
          details: error.message,
          traceId: req.id
        });
      }

      res.status(500).json({
        error: 'Failed to process approval decision',
        code: 'APPROVAL_DECISION_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * GET /api/approval-workflows/pending/me
 * Get pending workflows assigned to current user (Optimized)
 */
router.get('/pending/me', 
  requirePermission('view_approval_workflows'),
  cacheQuery({ ttl: 1 * 60 * 1000 }), // 1 minute cache
  async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = '20' } = req.query;

    // Use optimized query
    const result = await ApprovalWorkflowQueries.getPendingWorkflowsForApprover(
      userId,
      parseInt(limit as string)
    );

    res.json({
      success: true,
      data: result.rows,
      performance: {
        queryTime: result.duration,
        rowCount: result.rowCount
      }
    });

  } catch (error) {
    console.error('Get pending workflows error:', error);
    res.status(500).json({
      error: 'Failed to fetch pending workflows',
      code: 'FETCH_PENDING_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
});

/**
 * POST /api/approval-workflows/:id/emergency-override
 * Emergency override for critical situations (admin only)
 */
router.post('/:id/emergency-override',
  requirePermission('emergency_override'),
  validateRequest({ body: EmergencyOverrideSchema }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason, ipAddress } = req.body;

      const result = await approvalWorkflowOrchestrator.emergencyOverride(
        id,
        req.user.id,
        reason,
        ipAddress || req.ip
      );

      res.json({
        success: true,
        data: result,
        message: result.message
      });

    } catch (error) {
      console.error('Emergency override error:', error);
      res.status(500).json({
        error: 'Failed to process emergency override',
        code: 'EMERGENCY_OVERRIDE_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * POST /api/approval-workflows/:id/cancel
 * Cancel workflow
 */
router.post('/:id/cancel',
  requirePermission('cancel_workflow'),
  validateRequest({ 
    body: z.object({ 
      reason: z.string().min(5).max(500) 
    }) 
  }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const result = await approvalWorkflowOrchestrator.cancelWorkflow(
        id,
        req.user.id,
        reason
      );

      res.json({
        success: true,
        data: result,
        message: result.message
      });

    } catch (error) {
      console.error('Cancel workflow error:', error);
      res.status(500).json({
        error: 'Failed to cancel workflow',
        code: 'CANCEL_WORKFLOW_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * GET /api/approval-workflows/:id/history
 * Get workflow action history
 */
router.get('/:id/history', requirePermission('view_approval_workflows'), async (req, res) => {
  try {
    const { id } = req.params;

    const actions = await db
      .select({
        action: approvalActions,
        approver: {
          // This would join with users table in real implementation
          id: approvalActions.approverId
        }
      })
      .from(approvalActions)
      .where(eq(approvalActions.workflowId, id))
      .orderBy(desc(approvalActions.createdAt));

    res.json({
      success: true,
      data: actions
    });

  } catch (error) {
    console.error('Get workflow history error:', error);
    res.status(500).json({
      error: 'Failed to fetch workflow history',
      code: 'FETCH_HISTORY_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
});

/**
 * GET /api/approval-workflows/statistics
 * Get workflow statistics
 */
router.get('/stats/overview', requirePermission('view_approval_statistics'), async (req, res) => {
  try {
    const { days = '30' } = req.query;

    const statistics = await approvalWorkflowOrchestrator.getWorkflowStatistics(
      parseInt(days as string)
    );

    res.json({
      success: true,
      data: statistics
    });

  } catch (error) {
    console.error('Get workflow statistics error:', error);
    res.status(500).json({
      error: 'Failed to fetch workflow statistics',
      code: 'STATISTICS_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
});

/**
 * POST /api/approval-workflows/:id/delegate
 * Delegate workflow to another user
 */
router.post('/:id/delegate',
  requirePermission('delegate_workflow'),
  validateRequest({ 
    body: z.object({
      toUserId: z.string().uuid(),
      reason: z.string().min(5).max(500),
      ipAddress: z.string().optional()
    })
  }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { toUserId, reason, ipAddress } = req.body;

      const result = await approvalWorkflowOrchestrator.delegateWorkflow(
        id,
        req.user.id,
        toUserId,
        reason,
        ipAddress || req.ip
      );

      res.json({
        success: true,
        data: result,
        message: result.message
      });

    } catch (error) {
      console.error('Delegate workflow error:', error);
      res.status(500).json({
        error: 'Failed to delegate workflow',
        code: 'DELEGATE_WORKFLOW_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * POST /api/approval-workflows/:id/escalate
 * Escalate workflow to higher authority
 */
router.post('/:id/escalate',
  requirePermission('escalate_workflow'),
  validateRequest({ 
    body: z.object({
      reason: z.string().min(5).max(500),
      targetLevel: z.number().min(1).max(5).optional(),
      ipAddress: z.string().optional()
    })
  }),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { reason, targetLevel, ipAddress } = req.body;

      const result = await approvalWorkflowOrchestrator.escalateWorkflow(
        id,
        req.user.id,
        reason,
        targetLevel,
        ipAddress || req.ip
      );

      res.json({
        success: true,
        data: result,
        message: result.message
      });

    } catch (error) {
      console.error('Escalate workflow error:', error);
      res.status(500).json({
        error: 'Failed to escalate workflow',
        code: 'ESCALATE_WORKFLOW_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * POST /api/approval-workflows/bulk-approve
 * Bulk approve multiple workflows (Optimized)
 */
router.post('/bulk-approve',
  requirePermission('bulk_approve_workflows'),
  validateRequest({ 
    body: z.object({
      workflowIds: z.array(z.string().uuid()).min(1).max(50),
      comments: z.string().optional(),
      ipAddress: z.string().optional()
    })
  }),
  async (req, res) => {
    try {
      const { workflowIds, comments, ipAddress } = req.body;

      // Use optimized batch update
      const updateResult = await ApprovalWorkflowQueries.batchUpdateWorkflows(
        workflowIds,
        { 
          status: 'approved',
          updated_at: new Date()
        }
      );

      // Log bulk approval action (simplified)
      console.log(`Bulk approval by ${req.user.id}: ${workflowIds.length} workflows`);

      res.json({
        success: true,
        data: {
          updated: updateResult.rows,
          summary: {
            total: workflowIds.length,
            successful: updateResult.rowCount,
            failed: workflowIds.length - updateResult.rowCount
          }
        },
        performance: {
          queryTime: updateResult.duration,
          rowCount: updateResult.rowCount
        },
        message: `Bulk approval completed: ${updateResult.rowCount}/${workflowIds.length} successful`
      });

    } catch (error) {
      console.error('Bulk approve error:', error);
      res.status(500).json({
        error: 'Failed to bulk approve workflows',
        code: 'BULK_APPROVE_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * GET /api/approval-workflows/search
 * Advanced workflow search with filters
 */
router.get('/search', requirePermission('view_approval_workflows'), async (req, res) => {
  try {
    const {
      status,
      riskLevel,
      minAmount,
      maxAmount,
      startDate,
      endDate,
      requesterId,
      transactionType,
      currentLevel,
      assignedTo,
      overdue,
      page = '1',
      limit = '50',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filters object
    const filters: any = {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc'
    };

    if (status) {
      filters.status = Array.isArray(status) ? status : [status];
    }

    if (riskLevel) {
      filters.riskLevel = Array.isArray(riskLevel) ? riskLevel : [riskLevel];
    }

    if (minAmount || maxAmount) {
      filters.amountRange = {
        min: minAmount ? parseFloat(minAmount as string) : 0,
        max: maxAmount ? parseFloat(maxAmount as string) : Number.MAX_SAFE_INTEGER
      };
    }

    if (startDate || endDate) {
      filters.dateRange = {
        start: startDate ? new Date(startDate as string) : new Date(0),
        end: endDate ? new Date(endDate as string) : new Date()
      };
    }

    if (requesterId) filters.requesterId = requesterId as string;
    if (transactionType) {
      filters.transactionType = Array.isArray(transactionType) ? transactionType : [transactionType];
    }
    if (currentLevel) {
      filters.currentLevel = Array.isArray(currentLevel) 
        ? currentLevel.map(l => parseInt(l as string))
        : [parseInt(currentLevel as string)];
    }
    if (assignedTo) filters.assignedTo = assignedTo as string;
    if (overdue) filters.overdue = overdue === 'true';

    const result = await approvalWorkflowOrchestrator.getWorkflowsByFilters(filters);

    res.json({
      success: true,
      data: result.workflows,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Search workflows error:', error);
    res.status(500).json({
      error: 'Failed to search workflows',
      code: 'SEARCH_WORKFLOWS_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
});

/**
 * GET /api/approval-workflows/dashboard
 * Get dashboard data for approval workflows (Optimized)
 */
router.get('/dashboard/summary', 
  requirePermission('view_approval_dashboard'),
  cacheQuery({ ttl: 2 * 60 * 1000 }), // 2 minute cache
  async (req, res) => {
  try {
    const { userId } = req.query;
    
    // Use optimized single query for dashboard stats
    const result = await ApprovalWorkflowQueries.getDashboardStats(userId as string);

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          summary: {
            totalPending: 0,
            totalApproved: 0,
            totalRejected: 0,
            highRiskPending: 0,
            avgProcessingHours: 0
          }
        }
      });
    }

    const stats = result.rows[0];
    const dashboardData = {
      summary: {
        totalPending: parseInt(stats.pending_count || '0'),
        totalApproved: parseInt(stats.approved_count || '0'),
        totalRejected: parseInt(stats.rejected_count || '0'),
        highRiskPending: parseInt(stats.high_risk_pending || '0'),
        avgProcessingHours: parseFloat(stats.avg_processing_hours || '0'),
        todayCount: parseInt(stats.today_count || '0'),
        weekCount: parseInt(stats.week_count || '0')
      },
      performance: {
        queryTime: result.duration,
        rowCount: result.rowCount
      }
    };

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Get dashboard summary error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard summary',
      code: 'DASHBOARD_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
});

/**
 * GET /api/approval-workflows/my-assignments
 * Get workflows assigned to current user (including delegated)
 */
router.get('/my-assignments', requirePermission('view_approval_workflows'), async (req, res) => {
  try {
    const userId = req.user.id;
    const userRoles = req.user.roles || [];

    // Get workflows assigned to user
    const assignedWorkflows = await approvalWorkflowOrchestrator.getPendingWorkflowsForUser(
      userId, 
      userRoles
    );

    // Add additional metadata
    const enrichedWorkflows = assignedWorkflows.map(workflow => ({
      ...workflow,
      assignmentType: workflow.workflow.metadata?.currentAssignee === userId ? 'delegated' : 'role_based',
      slaStatus: workflow.timeRemaining.isOverdue ? 'overdue' : 
                 workflow.timeRemaining.slaBreached ? 'breached' : 'on_time'
    }));

    res.json({
      success: true,
      data: enrichedWorkflows,
      summary: {
        total: enrichedWorkflows.length,
        overdue: enrichedWorkflows.filter(w => w.timeRemaining.isOverdue).length,
        highRisk: enrichedWorkflows.filter(w => w.riskAssessment?.riskLevel === 'high').length,
        critical: enrichedWorkflows.filter(w => w.urgency === 'critical').length
      }
    });

  } catch (error) {
    console.error('Get my assignments error:', error);
    res.status(500).json({
      error: 'Failed to fetch assigned workflows',
      code: 'FETCH_ASSIGNMENTS_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
});

export default router;