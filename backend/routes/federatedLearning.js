/**
 * Federated Learning API Routes
 * RESTful API endpoints for federated learning operations
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, validationResult } = require('express-validator');
const FederatedLearningService = require('../services/FederatedLearningService');

const router = express.Router();

// Initialize federated learning service
const federatedService = new FederatedLearningService();

// Rate limiting for federated learning endpoints
const federatedRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many federated learning requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all federated learning routes
router.use(federatedRateLimit);

/**
 * Register a new client for federated learning
 * POST /api/federated/register
 */
router.post('/register', [
  body('clientId').isString().isLength({ min: 1, max: 100 }).trim(),
  body('deviceInfo').optional().isObject(),
  body('privacyPreferences').optional().isObject(),
  body('capabilities').optional().isObject()
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { clientId, deviceInfo, privacyPreferences, capabilities } = req.body;

    // Register client
    const result = await federatedService.registerClient(clientId, {
      deviceInfo,
      privacyPreferences,
      capabilities,
      registeredFrom: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json(result);

  } catch (error) {
    console.error('Failed to register federated learning client:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register client',
      message: error.message
    });
  }
});

/**
 * Start a new federated learning round
 * POST /api/federated/round/start
 */
router.post('/round/start', async (req, res) => {
  try {
    const roundInfo = await federatedService.startFederatedRound();
    res.json({
      success: true,
      roundInfo
    });

  } catch (error) {
    console.error('Failed to start federated learning round:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start round',
      message: error.message
    });
  }
});

/**
 * Receive model update from client
 * POST /api/federated/update
 */
router.post('/update', [
  body('clientId').isString().isLength({ min: 1, max: 100 }).trim(),
  body('roundNumber').isInt({ min: 1 }),
  body('weights').isArray(),
  body('metrics').isObject(),
  body('dataSize').isInt({ min: 1 }),
  body('privacyMetrics').optional().isObject()
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { clientId, roundNumber, weights, metrics, dataSize, privacyMetrics } = req.body;

    // Convert serialized weights back to tensors
    const tf = require('@tensorflow/tfjs-node');
    const tensorWeights = weights.map(w => tf.tensor(w.data, w.shape));

    const modelUpdate = {
      weights: tensorWeights,
      metrics,
      dataSize,
      privacyMetrics,
      receivedFrom: req.ip,
      timestamp: new Date().toISOString()
    };

    const result = await federatedService.receiveClientUpdate(clientId, modelUpdate);

    res.json(result);

  } catch (error) {
    console.error('Failed to receive model update:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process model update',
      message: error.message
    });
  }
});

/**
 * Get current global model weights
 * GET /api/federated/model/weights
 */
router.get('/model/weights', async (req, res) => {
  try {
    const weights = federatedService.getModelWeights();
    
    if (!weights) {
      return res.status(404).json({
        success: false,
        error: 'Global model not available'
      });
    }

    res.json({
      success: true,
      weights,
      roundNumber: federatedService.roundNumber,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to get model weights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get model weights',
      message: error.message
    });
  }
});

/**
 * Get federated learning statistics
 * GET /api/federated/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = federatedService.getStatistics();
    
    res.json({
      success: true,
      statistics: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Failed to get federated learning statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
      message: error.message
    });
  }
});

/**
 * Get client information
 * GET /api/federated/client/:clientId
 */
router.get('/client/:clientId', [
  param('clientId').isString().isLength({ min: 1, max: 100 }).trim()
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { clientId } = req.params;
    const client = federatedService.clients.get(clientId);

    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // Remove sensitive information
    const sanitizedClient = {
      id: client.id,
      registeredAt: client.registeredAt,
      lastSeen: client.lastSeen,
      roundsParticipated: client.roundsParticipated,
      averageAccuracy: client.averageAccuracy,
      status: client.status,
      privacyPreferences: {
        maxRounds: client.privacyPreferences.maxRounds,
        allowModelSharing: client.privacyPreferences.allowModelSharing,
        noiseLevel: client.privacyPreferences.noiseLevel
      }
    };

    res.json({
      success: true,
      client: sanitizedClient
    });

  } catch (error) {
    console.error('Failed to get client information:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get client information',
      message: error.message
    });
  }
});

/**
 * Update client privacy preferences
 * PUT /api/federated/client/:clientId/privacy
 */
router.put('/client/:clientId/privacy', [
  param('clientId').isString().isLength({ min: 1, max: 100 }).trim(),
  body('maxRounds').optional().isInt({ min: 1, max: 1000 }),
  body('allowModelSharing').optional().isBoolean(),
  body('noiseLevel').optional().isIn(['low', 'medium', 'high']),
  body('dataRetentionDays').optional().isInt({ min: 1, max: 365 })
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { clientId } = req.params;
    const privacyUpdates = req.body;

    const client = federatedService.clients.get(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    // Update privacy preferences
    client.privacyPreferences = {
      ...client.privacyPreferences,
      ...privacyUpdates
    };
    client.updatedAt = new Date().toISOString();

    res.json({
      success: true,
      message: 'Privacy preferences updated',
      privacyPreferences: client.privacyPreferences
    });

  } catch (error) {
    console.error('Failed to update client privacy preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update privacy preferences',
      message: error.message
    });
  }
});

/**
 * Deregister a client
 * DELETE /api/federated/client/:clientId
 */
router.delete('/client/:clientId', [
  param('clientId').isString().isLength({ min: 1, max: 100 }).trim()
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { clientId } = req.params;
    
    const deleted = federatedService.clients.delete(clientId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    res.json({
      success: true,
      message: 'Client deregistered successfully'
    });

  } catch (error) {
    console.error('Failed to deregister client:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deregister client',
      message: error.message
    });
  }
});

/**
 * Get round history
 * GET /api/federated/rounds/history
 */
router.get('/rounds/history', async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;
    
    // This would typically come from a database
    // For now, return mock data
    const roundHistory = Array.from({ length: Math.min(limit, 50) }, (_, i) => ({
      roundNumber: federatedService.roundNumber - i,
      participatingClients: Math.floor(Math.random() * 10) + 3,
      averageAccuracy: 0.7 + Math.random() * 0.2,
      averageLoss: Math.random() * 0.5,
      completedAt: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(),
      privacyBudgetUsed: (federatedService.privacyBudget / Math.max(1, federatedService.roundNumber - i))
    }));

    res.json({
      success: true,
      rounds: roundHistory,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: federatedService.roundNumber
      }
    });

  } catch (error) {
    console.error('Failed to get round history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get round history',
      message: error.message
    });
  }
});

/**
 * Health check endpoint
 * GET /api/federated/health
 */
router.get('/health', (req, res) => {
  try {
    const stats = federatedService.getStatistics();
    
    res.json({
      success: true,
      status: 'healthy',
      service: 'federated-learning',
      timestamp: new Date().toISOString(),
      metrics: {
        totalClients: stats.totalClients,
        activeClients: stats.activeClients,
        currentRound: stats.currentRound,
        privacyBudgetRemaining: stats.privacyBudgetRemaining
      }
    });

  } catch (error) {
    console.error('Federated learning health check failed:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Event listeners for federated learning service
federatedService.on('clientRegistered', (data) => {
  console.log(`Client registered: ${data.clientId}`);
});

federatedService.on('roundStarted', (roundInfo) => {
  console.log(`Federated learning round ${roundInfo.roundNumber} started with ${roundInfo.selectedClients.length} clients`);
});

federatedService.on('roundCompleted', (roundResult) => {
  console.log(`Federated learning round ${roundResult.roundNumber} completed with accuracy: ${roundResult.aggregatedMetrics.averageAccuracy.toFixed(4)}`);
});

federatedService.on('globalModelUpdated', (data) => {
  console.log(`Global model updated for round ${data.roundNumber}`);
});

// Cleanup on process exit
process.on('SIGINT', () => {
  console.log('Cleaning up federated learning service...');
  federatedService.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Cleaning up federated learning service...');
  federatedService.cleanup();
  process.exit(0);
});

module.exports = router;