/**
 * FinBot v4 - Approval System Middleware
 * Express middleware for approval system integration
 */

import { Request, Response, NextFunction } from 'express';
import { approvalRuleEngine } from '../services/approval-rule-engine';
import { approvalWorkflowOrchestrator } from '../services/approval-workflow-orchestrator';

// Extend Request interface
declare global {
  namespace Express {
    interface Request {
      approvalRequired?: boolean;
      approvalWorkflow?: any;
      riskAssessment?: any;
    }
  }
}

/**
 * Middleware to check if transaction requires approval
 */
export const checkApprovalRequired = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Extract transaction details from request
    const transaction = {
      id: req.body.transactionId || `temp-${Date.now()}`,
      type: req.body.type || req.body.transactionType,
      amount: parseFloat(req.body.amount || '0'),
      currency: req.body.currency || 'TRY',
      userId: req.user?.id || req.body.userId,
      timestamp: new Date(req.body.timestamp || Date.now()),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: req.body.metadata || {}
    };

    // Evaluate if approval is required
    const evaluation = await approvalRuleEngine.evaluateTransaction(transaction);

    // Attach results to request
    req.approvalRequired = evaluation.requiresApproval && !evaluation.autoApproved;
    req.riskAssessment = evaluation.riskAssessment;

    // If approval required, create workflow
    if (req.approvalRequired) {
      const workflowResult = await approvalWorkflowOrchestrator.createWorkflow({
        transaction,
        requesterId: req.user?.id || transaction.userId,
        metadata: {
          endpoint: req.path,
          method: req.method,
          originalRequest: req.body
        }
      });

      req.approvalWorkflow = workflowResult;

      // If workflow created, return approval required response
      if (workflowResult.requiresApproval) {
        return res.status(202).json({
          success: false,
          requiresApproval: true,
          workflowId: workflowResult.workflowId,
          riskAssessment: workflowResult.riskAssessment,
          message: 'Transaction requires approval. Workflow created.',
          nextSteps: [
            'Wait for approval from authorized personnel',
            'Check workflow status using the provided workflow ID',
            'You will be notified when approval is completed'
          ]
        });
      }
    }

    // Continue to next middleware if no approval required
    next();

  } catch (error) {
    console.error('Approval check middleware error:', error);
    res.status(500).json({
      error: 'Failed to check approval requirements',
      code: 'APPROVAL_CHECK_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
};

/**
 * Middleware to validate approval permissions
 */
export const validateApprovalPermissions = (requiredPermission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const userPermissions = req.user?.permissions || [];
      const userRoles = req.user?.roles || [];

      // Check if user has required permission
      if (!userPermissions.includes(requiredPermission)) {
        return res.status(403).json({
          error: 'Insufficient permissions for approval action',
          code: 'APPROVAL_PERMISSION_ERROR',
          required: requiredPermission,
          current: userPermissions,
          traceId: req.id
        });
      }

      // Check role-based restrictions
      const restrictedActions = {
        'emergency_override': ['admin'],
        'cancel_workflow': ['admin', 'finance'],
        'approve_high_risk': ['admin', 'finance']
      };

      if (restrictedActions[requiredPermission]) {
        const allowedRoles = restrictedActions[requiredPermission];
        const hasAllowedRole = allowedRoles.some(role => userRoles.includes(role));

        if (!hasAllowedRole) {
          return res.status(403).json({
            error: 'Insufficient role for this approval action',
            code: 'APPROVAL_ROLE_ERROR',
            requiredRoles: allowedRoles,
            currentRoles: userRoles,
            traceId: req.id
          });
        }
      }

      next();

    } catch (error) {
      console.error('Approval permissions validation error:', error);
      res.status(500).json({
        error: 'Failed to validate approval permissions',
        code: 'PERMISSION_VALIDATION_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  };
};

/**
 * Middleware to log approval actions for audit
 */
export const auditApprovalAction = (req: Request, res: Response, next: NextFunction) => {
  // Store original res.json to intercept response
  const originalJson = res.json;

  res.json = function(body: any) {
    // Log approval action
    const auditData = {
      userId: req.user?.id,
      action: req.body.action || req.method,
      workflowId: req.params.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date(),
      success: body.success || false,
      details: {
        endpoint: req.path,
        method: req.method,
        body: req.body,
        response: body
      }
    };

    // In a real implementation, this would write to audit log table
    console.log('Approval Action Audit:', JSON.stringify(auditData, null, 2));

    // Call original json method
    return originalJson.call(this, body);
  };

  next();
};

/**
 * Middleware to check workflow ownership or permissions
 */
export const checkWorkflowAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workflowId = req.params.id;
    const userId = req.user?.id;
    const userRoles = req.user?.roles || [];

    if (!workflowId) {
      return res.status(400).json({
        error: 'Workflow ID is required',
        code: 'WORKFLOW_ID_MISSING',
        traceId: req.id
      });
    }

    // Get workflow details
    const workflow = await approvalWorkflowOrchestrator.getWorkflowById(workflowId);

    if (!workflow) {
      return res.status(404).json({
        error: 'Workflow not found',
        code: 'WORKFLOW_NOT_FOUND',
        traceId: req.id
      });
    }

    // Check access permissions
    const isOwner = workflow.requesterId === userId;
    const isAdmin = userRoles.includes('admin');
    const isFinanceManager = userRoles.includes('finance');

    // Allow access if user is owner, admin, or finance manager
    if (!isOwner && !isAdmin && !isFinanceManager) {
      return res.status(403).json({
        error: 'Access denied to this workflow',
        code: 'WORKFLOW_ACCESS_DENIED',
        traceId: req.id
      });
    }

    // Attach workflow to request for use in route handlers
    req.approvalWorkflow = workflow;
    next();

  } catch (error) {
    console.error('Workflow access check error:', error);
    res.status(500).json({
      error: 'Failed to check workflow access',
      code: 'WORKFLOW_ACCESS_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
};

/**
 * Middleware to validate approval decision
 */
export const validateApprovalDecision = (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, delegatedTo } = req.body;
    const workflow = req.approvalWorkflow;

    if (!workflow) {
      return res.status(400).json({
        error: 'Workflow context not found',
        code: 'WORKFLOW_CONTEXT_MISSING',
        traceId: req.id
      });
    }

    // Validate workflow state
    if (workflow.status !== 'pending') {
      return res.status(409).json({
        error: 'Workflow is not in pending state',
        code: 'WORKFLOW_NOT_PENDING',
        currentStatus: workflow.status,
        traceId: req.id
      });
    }

    // Validate delegation
    if (action === 'delegate') {
      if (!delegatedTo) {
        return res.status(400).json({
          error: 'Delegation target is required for delegate action',
          code: 'DELEGATION_TARGET_MISSING',
          traceId: req.id
        });
      }

      if (delegatedTo === req.user?.id) {
        return res.status(400).json({
          error: 'Cannot delegate to yourself',
          code: 'SELF_DELEGATION_ERROR',
          traceId: req.id
        });
      }
    }

    // Validate escalation permissions
    if (action === 'escalate') {
      const userRoles = req.user?.roles || [];
      if (!userRoles.includes('admin') && !userRoles.includes('finance')) {
        return res.status(403).json({
          error: 'Insufficient permissions to escalate workflow',
          code: 'ESCALATION_PERMISSION_ERROR',
          traceId: req.id
        });
      }
    }

    next();

  } catch (error) {
    console.error('Approval decision validation error:', error);
    res.status(500).json({
      error: 'Failed to validate approval decision',
      code: 'DECISION_VALIDATION_ERROR',
      details: error.message,
      traceId: req.id
    });
  }
};

/**
 * Middleware to check rate limits for approval actions
 */
export const approvalRateLimit = (req: Request, res: Response, next: NextFunction) => {
  // Simple rate limiting - in production, use Redis-based rate limiting
  const userId = req.user?.id;
  const action = req.body.action || req.method;
  
  // For now, just log the action and continue
  console.log(`Approval action rate check: User ${userId}, Action: ${action}`);
  
  // In production, implement proper rate limiting:
  // - Track approval actions per user per time window
  // - Block suspicious rapid-fire approvals
  // - Allow emergency overrides for admins
  
  next();
};