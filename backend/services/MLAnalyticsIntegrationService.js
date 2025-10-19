/**
 * ML Analytics Integration Service
 * 
 * This service integrates AI-powered financial analytics with existing FinBot systems,
 * providing seamless data flow and intelligent recommendations across all modules.
 */

const axios = require('axios');
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class MLAnalyticsIntegrationService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      mlPipelineUrl: config.mlPipelineUrl || 'http://localhost:8080',
      analyticsApiUrl: config.analyticsApiUrl || 'http://localhost:3000/api',
      cacheTimeout: config.cacheTimeout || 300000, // 5 minutes
      retryAttempts: config.retryAttempts || 3,
      ...config
    };
    
    this.cache = new Map();
    this.integrationStatus = {
      userManagement: false,
      transactionSystem: false,
      approvalSystem: false,
      goalTracking: false,
      budgetOptimization: false
    };
    
    this.eventHandlers = new Map();
    this.setupEventHandlers();
  }

  /**
   * Initialize the integration service
   */
  async initialize() {
    try {
      console.log('Initializing ML Analytics Integration Service...');
      
      // Test connections to all systems
      await this.testSystemConnections();
      
      // Set up event listeners
      this.setupSystemEventListeners();
      
      // Initialize data synchronization
      await this.initializeDataSync();
      
      console.log('ML Analytics Integration Service initialized successfully');
      this.emit('initialized');
      
    } catch (error) {
      console.error('Failed to initialize ML Analytics Integration Service:', error);
      throw error;
    }
  }

  /**
   * Test connections to all integrated systems
   */
  async testSystemConnections() {
    const systems = [
      { name: 'mlPipeline', url: `${this.config.mlPipelineUrl}/health` },
      { name: 'analytics', url: `${this.config.analyticsApiUrl}/health` }
    ];

    for (const system of systems) {
      try {
        const response = await axios.get(system.url, { timeout: 5000 });
        console.log(`✓ ${system.name} connection successful`);
      } catch (error) {
        console.warn(`⚠ ${system.name} connection failed:`, error.message);
      }
    }
  }

  /**
   * Set up event handlers for system integration
   */
  setupEventHandlers() {
    // User Management Integration
    this.eventHandlers.set('user.created', this.handleUserCreated.bind(this));
    this.eventHandlers.set('user.updated', this.handleUserUpdated.bind(this));
    this.eventHandlers.set('user.deleted', this.handleUserDeleted.bind(this));

    // Transaction System Integration
    this.eventHandlers.set('transaction.created', this.handleTransactionCreated.bind(this));
    this.eventHandlers.set('transaction.updated', this.handleTransactionUpdated.bind(this));
    this.eventHandlers.set('transaction.deleted', this.handleTransactionDeleted.bind(this));

    // Approval System Integration
    this.eventHandlers.set('approval.requested', this.handleApprovalRequested.bind(this));
    this.eventHandlers.set('approval.completed', this.handleApprovalCompleted.bind(this));

    // Goal Tracking Integration
    this.eventHandlers.set('goal.created', this.handleGoalCreated.bind(this));
    this.eventHandlers.set('goal.updated', this.handleGoalUpdated.bind(this));
    this.eventHandlers.set('goal.achieved', this.handleGoalAchieved.bind(this));
  }

  /**
   * Set up system event listeners
   */
  setupSystemEventListeners() {
    // Listen to events from other FinBot modules
    process.on('finbot.event', (eventData) => {
      this.handleSystemEvent(eventData);
    });
  }

  /**
   * Handle system events and route to appropriate handlers
   */
  async handleSystemEvent(eventData) {
    try {
      const { type, data, userId, timestamp } = eventData;
      
      console.log(`Handling system event: ${type} for user ${userId}`);
      
      const handler = this.eventHandlers.get(type);
      if (handler) {
        await handler(data, userId, timestamp);
      } else {
        console.warn(`No handler found for event type: ${type}`);
      }
      
    } catch (error) {
      console.error('Error handling system event:', error);
      this.emit('error', error);
    }
  }

  // User Management Integration Handlers

  /**
   * Handle user creation - set up ML analytics profile
   */
  async handleUserCreated(userData, userId, timestamp) {
    try {
      console.log(`Setting up ML analytics for new user: ${userId}`);
      
      // Initialize user's financial profile in ML system
      const profileData = {
        userId: userId,
        demographics: {
          age: userData.age,
          location: userData.location,
          occupation: userData.occupation
        },
        preferences: userData.preferences || {},
        riskTolerance: userData.riskTolerance || 'medium',
        createdAt: timestamp
      };

      await this.callMLService('/api/ml/users/profile', 'POST', profileData);
      
      // Generate initial insights and recommendations
      await this.generateInitialInsights(userId);
      
      this.emit('user.analytics.initialized', { userId, profileData });
      
    } catch (error) {
      console.error(`Error setting up analytics for user ${userId}:`, error);
    }
  }

  /**
   * Handle user updates - sync profile changes
   */
  async handleUserUpdated(userData, userId, timestamp) {
    try {
      console.log(`Syncing user profile updates for: ${userId}`);
      
      const updateData = {
        userId: userId,
        updates: userData,
        updatedAt: timestamp
      };

      await this.callMLService('/api/ml/users/profile', 'PUT', updateData);
      
      // Trigger profile-based recommendation refresh
      await this.refreshUserRecommendations(userId);
      
    } catch (error) {
      console.error(`Error syncing user updates for ${userId}:`, error);
    }
  }

  /**
   * Handle user deletion - cleanup ML data
   */
  async handleUserDeleted(userData, userId, timestamp) {
    try {
      console.log(`Cleaning up ML data for deleted user: ${userId}`);
      
      await this.callMLService(`/api/ml/users/${userId}`, 'DELETE');
      
      // Remove from cache
      this.clearUserCache(userId);
      
    } catch (error) {
      console.error(`Error cleaning up ML data for user ${userId}:`, error);
    }
  }

  // Transaction System Integration Handlers

  /**
   * Handle new transaction - trigger ML analysis
   */
  async handleTransactionCreated(transactionData, userId, timestamp) {
    try {
      console.log(`Processing new transaction for ML analysis: ${transactionData.id}`);
      
      // Send transaction for anomaly detection
      const anomalyResult = await this.callMLService('/api/ml/anomaly/detect', 'POST', {
        transaction: transactionData
      });

      // Update spending patterns
      await this.updateSpendingPatterns(userId, transactionData);
      
      // Generate insights if anomaly detected
      if (anomalyResult.anomaly_detection?.is_anomaly) {
        await this.handleAnomalyDetected(userId, transactionData, anomalyResult);
      }
      
      // Update budget tracking
      await this.updateBudgetTracking(userId, transactionData);
      
      this.emit('transaction.analyzed', { 
        userId, 
        transactionId: transactionData.id, 
        anomalyResult 
      });
      
    } catch (error) {
      console.error(`Error processing transaction ${transactionData.id}:`, error);
    }
  }

  /**
   * Handle transaction updates
   */
  async handleTransactionUpdated(transactionData, userId, timestamp) {
    try {
      console.log(`Processing transaction update: ${transactionData.id}`);
      
      // Re-analyze updated transaction
      await this.handleTransactionCreated(transactionData, userId, timestamp);
      
    } catch (error) {
      console.error(`Error processing transaction update ${transactionData.id}:`, error);
    }
  }

  /**
   * Handle transaction deletion
   */
  async handleTransactionDeleted(transactionData, userId, timestamp) {
    try {
      console.log(`Processing transaction deletion: ${transactionData.id}`);
      
      // Update spending patterns to remove deleted transaction
      await this.removeFromSpendingPatterns(userId, transactionData);
      
    } catch (error) {
      console.error(`Error processing transaction deletion ${transactionData.id}:`, error);
    }
  }

  // Approval System Integration Handlers

  /**
   * Handle approval request - provide AI recommendations
   */
  async handleApprovalRequested(approvalData, userId, timestamp) {
    try {
      console.log(`Generating AI recommendations for approval: ${approvalData.id}`);
      
      // Get user's financial context
      const userContext = await this.getUserFinancialContext(userId);
      
      // Generate AI-powered approval recommendation
      const recommendation = await this.generateApprovalRecommendation(
        approvalData, 
        userContext
      );
      
      // Send recommendation back to approval system
      this.emit('approval.recommendation', {
        approvalId: approvalData.id,
        userId: userId,
        recommendation: recommendation,
        confidence: recommendation.confidence,
        reasoning: recommendation.reasoning
      });
      
    } catch (error) {
      console.error(`Error generating approval recommendation for ${approvalData.id}:`, error);
    }
  }

  /**
   * Handle approval completion - update ML models
   */
  async handleApprovalCompleted(approvalData, userId, timestamp) {
    try {
      console.log(`Processing approval completion: ${approvalData.id}`);
      
      // Update ML models with approval outcome for learning
      const learningData = {
        userId: userId,
        approvalId: approvalData.id,
        decision: approvalData.decision,
        amount: approvalData.amount,
        category: approvalData.category,
        aiRecommendation: approvalData.aiRecommendation,
        actualOutcome: approvalData.decision,
        timestamp: timestamp
      };

      await this.callMLService('/api/ml/learning/approval-outcome', 'POST', learningData);
      
    } catch (error) {
      console.error(`Error processing approval completion ${approvalData.id}:`, error);
    }
  }

  // Goal Tracking Integration Handlers

  /**
   * Handle goal creation - AI-enhanced goal planning
   */
  async handleGoalCreated(goalData, userId, timestamp) {
    try {
      console.log(`Enhancing goal with AI recommendations: ${goalData.id}`);
      
      // Get AI-powered goal enhancement
      const enhancement = await this.callMLService('/api/ml/goals/enhance', 'POST', {
        userId: userId,
        goal: goalData
      });
      
      // Generate achievement strategy
      const strategy = await this.generateGoalStrategy(userId, goalData, enhancement);
      
      this.emit('goal.enhanced', {
        goalId: goalData.id,
        userId: userId,
        enhancement: enhancement,
        strategy: strategy
      });
      
    } catch (error) {
      console.error(`Error enhancing goal ${goalData.id}:`, error);
    }
  }

  /**
   * Handle goal updates
   */
  async handleGoalUpdated(goalData, userId, timestamp) {
    try {
      console.log(`Processing goal update: ${goalData.id}`);
      
      // Update goal progress in ML system
      await this.callMLService('/api/ml/goals/progress', 'PUT', {
        userId: userId,
        goalId: goalData.id,
        progress: goalData.progress,
        updatedAt: timestamp
      });
      
      // Generate updated recommendations if needed
      if (goalData.progress) {
        await this.updateGoalRecommendations(userId, goalData);
      }
      
    } catch (error) {
      console.error(`Error processing goal update ${goalData.id}:`, error);
    }
  }

  /**
   * Handle goal achievement
   */
  async handleGoalAchieved(goalData, userId, timestamp) {
    try {
      console.log(`Processing goal achievement: ${goalData.id}`);
      
      // Record achievement in ML system for learning
      await this.callMLService('/api/ml/goals/achievement', 'POST', {
        userId: userId,
        goalId: goalData.id,
        achievedAt: timestamp,
        actualDuration: goalData.actualDuration,
        finalAmount: goalData.finalAmount
      });
      
      // Generate new goal suggestions based on achievement
      const newGoalSuggestions = await this.generateNewGoalSuggestions(userId, goalData);
      
      this.emit('goal.achievement.processed', {
        goalId: goalData.id,
        userId: userId,
        newSuggestions: newGoalSuggestions
      });
      
    } catch (error) {
      console.error(`Error processing goal achievement ${goalData.id}:`, error);
    }
  }

  // Helper Methods

  /**
   * Call ML service with retry logic
   */
  async callMLService(endpoint, method = 'GET', data = null) {
    const url = `${this.config.mlPipelineUrl}${endpoint}`;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const config = {
          method: method,
          url: url,
          timeout: 10000,
          headers: {
            'Content-Type': 'application/json'
          }
        };
        
        if (data && (method === 'POST' || method === 'PUT')) {
          config.data = data;
        }
        
        const response = await axios(config);
        return response.data;
        
      } catch (error) {
        console.warn(`ML service call attempt ${attempt} failed:`, error.message);
        
        if (attempt === this.config.retryAttempts) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  /**
   * Generate initial insights for new user
   */
  async generateInitialInsights(userId) {
    try {
      const insights = await this.callMLService('/api/ml/insights/generate', 'POST', {
        userId: userId,
        type: 'initial_setup'
      });
      
      return insights;
      
    } catch (error) {
      console.error(`Error generating initial insights for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Update spending patterns with new transaction
   */
  async updateSpendingPatterns(userId, transactionData) {
    try {
      await this.callMLService('/api/ml/patterns/spending', 'POST', {
        userId: userId,
        transaction: transactionData
      });
      
    } catch (error) {
      console.error(`Error updating spending patterns for user ${userId}:`, error);
    }
  }

  /**
   * Handle detected anomaly
   */
  async handleAnomalyDetected(userId, transactionData, anomalyResult) {
    try {
      // Generate anomaly alert
      const alert = {
        userId: userId,
        type: 'anomaly_detected',
        severity: anomalyResult.anomaly_detection.alert_level,
        message: `Unusual transaction detected: ${transactionData.description}`,
        data: {
          transaction: transactionData,
          anomalyScore: anomalyResult.anomaly_detection.anomaly_score,
          explanation: anomalyResult.anomaly_detection.explanation
        },
        timestamp: new Date()
      };
      
      this.emit('anomaly.detected', alert);
      
    } catch (error) {
      console.error(`Error handling anomaly for user ${userId}:`, error);
    }
  }

  /**
   * Update budget tracking
   */
  async updateBudgetTracking(userId, transactionData) {
    try {
      await this.callMLService('/api/ml/budget/update', 'POST', {
        userId: userId,
        transaction: transactionData
      });
      
    } catch (error) {
      console.error(`Error updating budget tracking for user ${userId}:`, error);
    }
  }

  /**
   * Get user's financial context
   */
  async getUserFinancialContext(userId) {
    try {
      const cacheKey = `financial_context_${userId}`;
      
      // Check cache first
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.config.cacheTimeout) {
          return cached.data;
        }
      }
      
      // Fetch from ML service
      const context = await this.callMLService(`/api/ml/users/${userId}/context`);
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: context,
        timestamp: Date.now()
      });
      
      return context;
      
    } catch (error) {
      console.error(`Error getting financial context for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Generate AI-powered approval recommendation
   */
  async generateApprovalRecommendation(approvalData, userContext) {
    try {
      const recommendation = await this.callMLService('/api/ml/approval/recommend', 'POST', {
        approval: approvalData,
        context: userContext
      });
      
      return recommendation;
      
    } catch (error) {
      console.error(`Error generating approval recommendation:`, error);
      return {
        decision: 'manual_review',
        confidence: 0.0,
        reasoning: 'AI recommendation unavailable, manual review required'
      };
    }
  }

  /**
   * Generate goal achievement strategy
   */
  async generateGoalStrategy(userId, goalData, enhancement) {
    try {
      const strategy = await this.callMLService('/api/ml/goals/strategy', 'POST', {
        userId: userId,
        goal: goalData,
        enhancement: enhancement
      });
      
      return strategy;
      
    } catch (error) {
      console.error(`Error generating goal strategy:`, error);
      return null;
    }
  }

  /**
   * Update goal recommendations
   */
  async updateGoalRecommendations(userId, goalData) {
    try {
      await this.callMLService('/api/ml/goals/recommendations/update', 'POST', {
        userId: userId,
        goal: goalData
      });
      
    } catch (error) {
      console.error(`Error updating goal recommendations:`, error);
    }
  }

  /**
   * Generate new goal suggestions
   */
  async generateNewGoalSuggestions(userId, achievedGoal) {
    try {
      const suggestions = await this.callMLService('/api/ml/goals/suggestions', 'POST', {
        userId: userId,
        achievedGoal: achievedGoal
      });
      
      return suggestions;
      
    } catch (error) {
      console.error(`Error generating new goal suggestions:`, error);
      return [];
    }
  }

  /**
   * Refresh user recommendations
   */
  async refreshUserRecommendations(userId) {
    try {
      await this.callMLService(`/api/ml/users/${userId}/recommendations/refresh`, 'POST');
      
    } catch (error) {
      console.error(`Error refreshing recommendations for user ${userId}:`, error);
    }
  }

  /**
   * Clear user cache
   */
  clearUserCache(userId) {
    const keysToDelete = [];
    for (const [key] of this.cache) {
      if (key.includes(userId)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Initialize data synchronization
   */
  async initializeDataSync() {
    try {
      console.log('Initializing data synchronization...');
      
      // Sync existing users
      await this.syncExistingUsers();
      
      // Sync recent transactions
      await this.syncRecentTransactions();
      
      console.log('Data synchronization completed');
      
    } catch (error) {
      console.error('Error initializing data sync:', error);
    }
  }

  /**
   * Sync existing users to ML system
   */
  async syncExistingUsers() {
    try {
      // This would typically fetch users from the user management system
      // For now, we'll simulate this
      console.log('Syncing existing users to ML system...');
      
    } catch (error) {
      console.error('Error syncing existing users:', error);
    }
  }

  /**
   * Sync recent transactions
   */
  async syncRecentTransactions() {
    try {
      // This would typically fetch recent transactions
      // For now, we'll simulate this
      console.log('Syncing recent transactions to ML system...');
      
    } catch (error) {
      console.error('Error syncing recent transactions:', error);
    }
  }

  /**
   * Get integration status
   */
  getIntegrationStatus() {
    return {
      ...this.integrationStatus,
      cacheSize: this.cache.size,
      eventHandlers: this.eventHandlers.size,
      uptime: process.uptime()
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const status = {
        service: 'ML Analytics Integration',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        integrations: this.integrationStatus,
        cache: {
          size: this.cache.size,
          maxAge: this.config.cacheTimeout
        }
      };
      
      // Test ML service connection
      try {
        await this.callMLService('/health');
        status.mlServiceConnection = 'healthy';
      } catch (error) {
        status.mlServiceConnection = 'unhealthy';
        status.status = 'degraded';
      }
      
      return status;
      
    } catch (error) {
      return {
        service: 'ML Analytics Integration',
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = MLAnalyticsIntegrationService;