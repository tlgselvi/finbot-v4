/**
 * FinBot v4 - Main API Routes
 * Central routing configuration with approval system integration
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';

// Import route modules
import approvalRulesRouter from './approval-rules';
import approvalWorkflowsRouter from './approval-workflows';

// Import existing routes (these would be from FinBot v3)
// import authRouter from './auth';
// import accountsRouter from './accounts';
// import transactionsRouter from './transactions';
// import dashboardRouter from './dashboard';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '4.0.0',
    features: {
      approvalSystem: true,
      specDrivenDevelopment: true
    }
  });
});

// API version info
router.get('/version', (req, res) => {
  res.json({
    version: '4.0.0',
    name: 'FinBot v4 API',
    description: 'Advanced Financial Management System with Approval Workflows',
    features: [
      'Multi-level Approval System',
      'Risk Assessment Engine',
      'Real-time Notifications',
      'Comprehensive Audit Trail',
      'Emergency Override Capabilities',
      'Fraud Detection',
      'Role-based Access Control'
    ],
    endpoints: {
      approvalRules: '/api/approval-rules',
      approvalWorkflows: '/api/approval-workflows',
      health: '/api/health',
      version: '/api/version'
    }
  });
});

// Approval System Routes
router.use('/approval-rules', approvalRulesRouter);
router.use('/approval-workflows', approvalWorkflowsRouter);

// Existing FinBot v3 routes (would be imported)
// router.use('/auth', authRouter);
// router.use('/accounts', accountsRouter);
// router.use('/transactions', transactionsRouter);
// router.use('/dashboard', dashboardRouter);

// API documentation endpoint
router.get('/docs', (req, res) => {
  res.json({
    title: 'FinBot v4 API Documentation',
    description: 'RESTful API for FinBot v4 Financial Management System',
    version: '4.0.0',
    baseUrl: req.protocol + '://' + req.get('host') + '/api',
    authentication: {
      type: 'Bearer Token (JWT)',
      header: 'Authorization: Bearer <token>',
      endpoints: {
        login: 'POST /auth/login',
        refresh: 'POST /auth/refresh'
      }
    },
    approvalSystem: {
      description: 'Multi-level approval system for financial transactions',
      endpoints: {
        'GET /approval-rules': 'List approval rules',
        'POST /approval-rules': 'Create approval rule',
        'GET /approval-rules/:id': 'Get specific rule',
        'PUT /approval-rules/:id': 'Update rule',
        'DELETE /approval-rules/:id': 'Deactivate rule',
        'POST /approval-rules/:id/test': 'Test rule against sample transaction',
        'GET /approval-workflows': 'List workflows',
        'POST /approval-workflows': 'Create workflow',
        'GET /approval-workflows/:id': 'Get workflow details',
        'POST /approval-workflows/:id/actions': 'Submit approval decision',
        'GET /approval-workflows/pending/me': 'Get my pending approvals',
        'POST /approval-workflows/:id/emergency-override': 'Emergency override (admin)',
        'POST /approval-workflows/:id/cancel': 'Cancel workflow'
      }
    },
    permissions: {
      'view_approval_rules': 'View approval rules',
      'manage_approval_rules': 'Create/update/delete approval rules',
      'view_approval_workflows': 'View approval workflows',
      'create_approval_workflow': 'Create new approval workflows',
      'approve_workflow': 'Submit approval decisions',
      'emergency_override': 'Emergency override workflows (admin only)',
      'cancel_workflow': 'Cancel workflows',
      'view_approval_statistics': 'View approval statistics',
      'view_approval_dashboard': 'View approval dashboard'
    },
    examples: {
      createRule: {
        method: 'POST',
        url: '/api/approval-rules',
        headers: {
          'Authorization': 'Bearer <token>',
          'Content-Type': 'application/json'
        },
        body: {
          name: 'Large Transfer Rule',
          transactionType: 'transfer',
          amountThreshold: 50000,
          currency: 'TRY',
          approvalLevels: 2,
          requiredRoles: [['finance'], ['admin']],
          createdBy: '<user-id>'
        }
      },
      createWorkflow: {
        method: 'POST',
        url: '/api/approval-workflows',
        headers: {
          'Authorization': 'Bearer <token>',
          'Content-Type': 'application/json'
        },
        body: {
          transaction: {
            id: '<transaction-id>',
            type: 'transfer',
            amount: 75000,
            currency: 'TRY',
            userId: '<user-id>'
          },
          requesterId: '<requester-id>'
        }
      },
      approveWorkflow: {
        method: 'POST',
        url: '/api/approval-workflows/<workflow-id>/actions',
        headers: {
          'Authorization': 'Bearer <token>',
          'Content-Type': 'application/json'
        },
        body: {
          action: 'approve',
          comments: 'Approved after reviewing transaction details'
        }
      }
    }
  });
});

// Catch-all for undefined routes
router.use('*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    code: 'ENDPOINT_NOT_FOUND',
    path: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      'GET /api/health',
      'GET /api/version',
      'GET /api/docs',
      'GET /api/approval-rules',
      'POST /api/approval-rules',
      'GET /api/approval-workflows',
      'POST /api/approval-workflows'
    ],
    traceId: req.id
  });
});

export default router;