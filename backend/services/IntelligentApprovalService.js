/**
 * Intelligent Approval Service
 * 
 * AI-powered approval system that provides intelligent recommendations
 * for financial transactions and decisions based on ML analytics.
 */

const axios = require('axios');
const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class IntelligentApprovalService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      mlPipelineUrl: config.mlPipelineUrl || 'http://localhost:8080',
      confidenceThreshold: config.confidenceThreshold || 0.7,
      autoApprovalLimit: config.autoApprovalLimit || 1000,
      riskThreshold: config.riskThreshold || 0.8,
      ...config
    };
    
    this.approvalQueue = new Map();
    this.approvalHistory = new Map();
    this.modelPerformance = {
      totalPredictions: 0,
      correctPredictions: 0,
      accuracy: 0
    };
  }

  /**
   * Initialize the intelligent approval service
   */
  async initialize() {
    try {
      console.log('Initializing Intelligent Approval Service...');
      
      // Load historical approval data for model training
      await this.loadHistoricalData();
      
      // Set up periodic model performance evaluation
      this.setupPerformanceMonitoring();
      
      console.log('Intelligent Approval Service initialized successfully');
      this.emit('initialized');
      
    } catch (error) {
      console.error('Failed to initialize Intelligent Approval Service:', error);
      throw error;
    }
  }

  /**
   * Process approval request with AI recommendations
   */
  async processApprovalRequest(approvalData) {
    try {
      const approvalId = uuidv4();
      const timestamp = new Date();
      
      console.log(`Processing approval request: ${approvalId}`);
      
      // Create approval record
      const approval = {
        id: approvalId,
        userId: approvalData.userId,
        type: approvalData.type,
        amount: approvalData.amount,
        description: approvalData.description,
        category: approvalData.category,
        metadata: approvalData.metadata || {},
        status: 'pending',
        createdAt: timestamp,
        updatedAt: timestamp
      };
      
      // Get user financial context
      const userContext = await this.getUserFinancialContext(approvalData.userId);
      
      // Generate AI recommendation
      const aiRecommendation = await this.generateAIRecommendation(approval, userContext);
      
      // Add AI recommendation to approval
      approval.aiRecommendation = aiRecommendation;
      
      // Determine approval flow based on AI recommendation
      const approvalFlow = this.determineApprovalFlow(approval, aiRecommendation);
      approval.approvalFlow = approvalFlow;
      
      // Store in queue
      this.approvalQueue.set(approvalId, approval);
      
      // Handle based on approval flow
      if (approvalFlow.autoApprove) {
        await this.autoApprove(approval);
      } else if (approvalFlow.autoReject) {
        await this.autoReject(approval);
      } else {
        await this.requireManualReview(approval);
      }
      
      this.emit('approval.processed', approval);
      
      return {
        approvalId: approvalId,
        status: approval.status,
        aiRecommendation: aiRecommendation,
        approvalFlow: approvalFlow,
        estimatedProcessingTime: approvalFlow.estimatedTime
      };
      
    } catch (error) {
      console.error('Error processing approval request:', error);
      throw error;
    }
  }

  /**
   * Generate AI-powered approval recommendation
   */
  async generateAIRecommendation(approval, userContext) {
    try {
      console.log(`Generating AI recommendation for approval: ${approval.id}`);
      
      // Prepare data for ML model
      const mlInput = {
        approval: {
          type: approval.type,
          amount: approval.amount,
          category: approval.category,
          description: approval.description,
          timestamp: approval.createdAt
        },
        userContext: userContext,
        historicalData: await this.getUserApprovalHistory(approval.userId)
      };
      
      // Call ML service for recommendation
      const response = await axios.post(
        `${this.config.mlPipelineUrl}/api/ml/approval/recommend`,
        mlInput,
        { timeout: 10000 }
      );
      
      const recommendation = response.data;
      
      // Enhance recommendation with business rules
      const enhancedRecommendation = await this.enhanceWithBusinessRules(
        recommendation, 
        approval, 
        userContext
      );
      
      // Update model performance tracking
      this.modelPerformance.totalPredictions++;
      
      return enhancedRecommendation;
      
    } catch (error) {
      console.error('Error generating AI recommendation:', error);
      
      // Fallback recommendation
      return {
        decision: 'manual_review',
        confidence: 0.0,
        reasoning: 'AI recommendation service unavailable',
        riskScore: 0.5,
        factors: [],
        fallback: true
      };
    }
  }

  /**
   * Enhance AI recommendation with business rules
   */
  async enhanceWithBusinessRules(aiRecommendation, approval, userContext) {
    try {
      const enhanced = { ...aiRecommendation };
      
      // Apply amount-based rules
      if (approval.amount > this.config.autoApprovalLimit) {
        enhanced.requiresManualReview = true;
        enhanced.reasoning += ` Amount exceeds auto-approval limit (${this.config.autoApprovalLimit}).`;
      }
      
      // Apply risk-based rules
      if (enhanced.riskScore > this.config.riskThreshold) {
        enhanced.requiresManualReview = true;
        enhanced.reasoning += ` High risk score (${enhanced.riskScore}).`;
      }
      
      // Apply user-specific rules
      if (userContext.riskProfile === 'high') {
        enhanced.requiresManualReview = true;
        enhanced.reasoning += ' User has high risk profile.';
      }
      
      // Apply category-specific rules
      const restrictedCategories = ['gambling', 'crypto', 'high_risk_investment'];
      if (restrictedCategories.includes(approval.category)) {
        enhanced.requiresManualReview = true;
        enhanced.reasoning += ` Category '${approval.category}' requires manual review.`;
      }
      
      // Apply time-based rules
      const hour = new Date().getHours();
      if (hour < 6 || hour > 22) {
        enhanced.requiresManualReview = true;
        enhanced.reasoning += ' Transaction outside business hours.';
      }
      
      // Apply frequency-based rules
      const recentApprovals = await this.getRecentApprovals(approval.userId, 24); // Last 24 hours
      if (recentApprovals.length > 10) {
        enhanced.requiresManualReview = true;
        enhanced.reasoning += ' High frequency of recent approvals.';
      }
      
      return enhanced;
      
    } catch (error) {
      console.error('Error enhancing recommendation with business rules:', error);
      return aiRecommendation;
    }
  }

  /**
   * Determine approval flow based on AI recommendation
   */
  determineApprovalFlow(approval, aiRecommendation) {
    const flow = {
      autoApprove: false,
      autoReject: false,
      requireManualReview: false,
      priority: 'normal',
      estimatedTime: '2-4 hours',
      reviewers: []
    };
    
    // Check for auto-approval conditions
    if (
      aiRecommendation.decision === 'approve' &&
      aiRecommendation.confidence >= this.config.confidenceThreshold &&
      !aiRecommendation.requiresManualReview &&
      approval.amount <= this.config.autoApprovalLimit &&
      aiRecommendation.riskScore <= this.config.riskThreshold
    ) {
      flow.autoApprove = true;
      flow.estimatedTime = 'immediate';
      return flow;
    }
    
    // Check for auto-rejection conditions
    if (
      aiRecommendation.decision === 'reject' &&
      aiRecommendation.confidence >= 0.9 &&
      aiRecommendation.riskScore > 0.9
    ) {
      flow.autoReject = true;
      flow.estimatedTime = 'immediate';
      return flow;
    }
    
    // Require manual review
    flow.requireManualReview = true;
    
    // Determine priority based on amount and risk
    if (approval.amount > 10000 || aiRecommendation.riskScore > 0.8) {
      flow.priority = 'high';
      flow.estimatedTime = '1-2 hours';
      flow.reviewers = ['senior_analyst', 'risk_manager'];
    } else if (approval.amount > 5000 || aiRecommendation.riskScore > 0.6) {
      flow.priority = 'medium';
      flow.estimatedTime = '2-4 hours';
      flow.reviewers = ['analyst'];
    } else {
      flow.priority = 'normal';
      flow.estimatedTime = '4-8 hours';
      flow.reviewers = ['junior_analyst'];
    }
    
    return flow;
  }

  /**
   * Auto-approve the request
   */
  async autoApprove(approval) {
    try {
      console.log(`Auto-approving request: ${approval.id}`);
      
      approval.status = 'approved';
      approval.approvedBy = 'ai_system';
      approval.approvedAt = new Date();
      approval.updatedAt = new Date();
      
      // Move to history
      this.approvalHistory.set(approval.id, approval);
      this.approvalQueue.delete(approval.id);
      
      // Notify relevant systems
      this.emit('approval.auto_approved', approval);
      
      // Log for audit
      await this.logApprovalDecision(approval, 'auto_approved');
      
    } catch (error) {
      console.error(`Error auto-approving request ${approval.id}:`, error);
    }
  }

  /**
   * Auto-reject the request
   */
  async autoReject(approval) {
    try {
      console.log(`Auto-rejecting request: ${approval.id}`);
      
      approval.status = 'rejected';
      approval.rejectedBy = 'ai_system';
      approval.rejectedAt = new Date();
      approval.updatedAt = new Date();
      approval.rejectionReason = approval.aiRecommendation.reasoning;
      
      // Move to history
      this.approvalHistory.set(approval.id, approval);
      this.approvalQueue.delete(approval.id);
      
      // Notify relevant systems
      this.emit('approval.auto_rejected', approval);
      
      // Log for audit
      await this.logApprovalDecision(approval, 'auto_rejected');
      
    } catch (error) {
      console.error(`Error auto-rejecting request ${approval.id}:`, error);
    }
  }

  /**
   * Require manual review
   */
  async requireManualReview(approval) {
    try {
      console.log(`Requiring manual review for request: ${approval.id}`);
      
      approval.status = 'manual_review';
      approval.assignedReviewers = approval.approvalFlow.reviewers;
      approval.priority = approval.approvalFlow.priority;
      approval.updatedAt = new Date();
      
      // Notify reviewers
      this.emit('approval.manual_review_required', approval);
      
      // Log for audit
      await this.logApprovalDecision(approval, 'manual_review_required');
      
    } catch (error) {
      console.error(`Error requiring manual review for ${approval.id}:`, error);
    }
  }

  /**
   * Process manual approval decision
   */
  async processManualDecision(approvalId, decision, reviewerId, reasoning) {
    try {
      console.log(`Processing manual decision for approval: ${approvalId}`);
      
      const approval = this.approvalQueue.get(approvalId);
      if (!approval) {
        throw new Error(`Approval ${approvalId} not found`);
      }
      
      // Update approval with manual decision
      approval.status = decision;
      approval.manualDecision = {
        decision: decision,
        reviewerId: reviewerId,
        reasoning: reasoning,
        decidedAt: new Date()
      };
      approval.updatedAt = new Date();
      
      // Move to history
      this.approvalHistory.set(approvalId, approval);
      this.approvalQueue.delete(approvalId);
      
      // Update model performance if we have AI recommendation
      if (approval.aiRecommendation && !approval.aiRecommendation.fallback) {
        this.updateModelPerformance(approval.aiRecommendation.decision, decision);
      }
      
      // Notify systems
      this.emit('approval.manual_decision', approval);
      
      // Log for audit
      await this.logApprovalDecision(approval, 'manual_decision');
      
      return approval;
      
    } catch (error) {
      console.error(`Error processing manual decision for ${approvalId}:`, error);
      throw error;
    }
  }

  /**
   * Get user financial context
   */
  async getUserFinancialContext(userId) {
    try {
      const response = await axios.get(
        `${this.config.mlPipelineUrl}/api/ml/users/${userId}/context`,
        { timeout: 5000 }
      );
      
      return response.data;
      
    } catch (error) {
      console.error(`Error getting financial context for user ${userId}:`, error);
      
      // Return default context
      return {
        userId: userId,
        riskProfile: 'medium',
        creditScore: 700,
        monthlyIncome: 5000,
        monthlyExpenses: 3500,
        savingsRate: 0.3,
        debtToIncomeRatio: 0.2
      };
    }
  }

  /**
   * Get user approval history
   */
  async getUserApprovalHistory(userId, limit = 50) {
    try {
      const userApprovals = [];
      
      // Get from history
      for (const [id, approval] of this.approvalHistory) {
        if (approval.userId === userId) {
          userApprovals.push(approval);
        }
      }
      
      // Sort by date and limit
      return userApprovals
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
        
    } catch (error) {
      console.error(`Error getting approval history for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Get recent approvals for a user
   */
  async getRecentApprovals(userId, hours = 24) {
    try {
      const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      const recentApprovals = [];
      
      // Check queue
      for (const [id, approval] of this.approvalQueue) {
        if (approval.userId === userId && new Date(approval.createdAt) > cutoffTime) {
          recentApprovals.push(approval);
        }
      }
      
      // Check history
      for (const [id, approval] of this.approvalHistory) {
        if (approval.userId === userId && new Date(approval.createdAt) > cutoffTime) {
          recentApprovals.push(approval);
        }
      }
      
      return recentApprovals;
      
    } catch (error) {
      console.error(`Error getting recent approvals for user ${userId}:`, error);
      return [];
    }
  }

  /**
   * Update model performance metrics
   */
  updateModelPerformance(aiDecision, actualDecision) {
    try {
      if (aiDecision === actualDecision) {
        this.modelPerformance.correctPredictions++;
      }
      
      this.modelPerformance.accuracy = 
        this.modelPerformance.correctPredictions / this.modelPerformance.totalPredictions;
      
      console.log(`Model accuracy updated: ${(this.modelPerformance.accuracy * 100).toFixed(2)}%`);
      
    } catch (error) {
      console.error('Error updating model performance:', error);
    }
  }

  /**
   * Log approval decision for audit
   */
  async logApprovalDecision(approval, action) {
    try {
      const logEntry = {
        approvalId: approval.id,
        userId: approval.userId,
        action: action,
        amount: approval.amount,
        category: approval.category,
        aiRecommendation: approval.aiRecommendation,
        finalDecision: approval.status,
        timestamp: new Date(),
        metadata: {
          confidence: approval.aiRecommendation?.confidence,
          riskScore: approval.aiRecommendation?.riskScore,
          reviewers: approval.assignedReviewers
        }
      };
      
      // In a real implementation, this would write to an audit log
      console.log('Audit log entry:', JSON.stringify(logEntry, null, 2));
      
    } catch (error) {
      console.error('Error logging approval decision:', error);
    }
  }

  /**
   * Load historical approval data
   */
  async loadHistoricalData() {
    try {
      console.log('Loading historical approval data...');
      
      // In a real implementation, this would load from database
      // For now, we'll simulate some historical data
      
      console.log('Historical approval data loaded');
      
    } catch (error) {
      console.error('Error loading historical data:', error);
    }
  }

  /**
   * Set up performance monitoring
   */
  setupPerformanceMonitoring() {
    // Monitor model performance every hour
    setInterval(() => {
      this.evaluateModelPerformance();
    }, 60 * 60 * 1000);
  }

  /**
   * Evaluate model performance
   */
  async evaluateModelPerformance() {
    try {
      console.log('Evaluating model performance...');
      
      const performance = {
        ...this.modelPerformance,
        timestamp: new Date(),
        queueSize: this.approvalQueue.size,
        historySize: this.approvalHistory.size
      };
      
      // Emit performance metrics
      this.emit('performance.evaluated', performance);
      
      // Alert if performance is degrading
      if (performance.accuracy < 0.7 && performance.totalPredictions > 100) {
        this.emit('performance.degraded', performance);
      }
      
    } catch (error) {
      console.error('Error evaluating model performance:', error);
    }
  }

  /**
   * Get approval statistics
   */
  getApprovalStatistics() {
    try {
      const stats = {
        queue: {
          total: this.approvalQueue.size,
          byStatus: {},
          byPriority: {}
        },
        history: {
          total: this.approvalHistory.size,
          byDecision: {}
        },
        modelPerformance: this.modelPerformance
      };
      
      // Analyze queue
      for (const [id, approval] of this.approvalQueue) {
        stats.queue.byStatus[approval.status] = (stats.queue.byStatus[approval.status] || 0) + 1;
        stats.queue.byPriority[approval.priority] = (stats.queue.byPriority[approval.priority] || 0) + 1;
      }
      
      // Analyze history
      for (const [id, approval] of this.approvalHistory) {
        stats.history.byDecision[approval.status] = (stats.history.byDecision[approval.status] || 0) + 1;
      }
      
      return stats;
      
    } catch (error) {
      console.error('Error getting approval statistics:', error);
      return {};
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const status = {
        service: 'Intelligent Approval Service',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        queue: {
          size: this.approvalQueue.size,
          oldestRequest: this.getOldestQueueItem()
        },
        modelPerformance: this.modelPerformance
      };
      
      // Check ML service connection
      try {
        await axios.get(`${this.config.mlPipelineUrl}/health`, { timeout: 5000 });
        status.mlServiceConnection = 'healthy';
      } catch (error) {
        status.mlServiceConnection = 'unhealthy';
        status.status = 'degraded';
      }
      
      return status;
      
    } catch (error) {
      return {
        service: 'Intelligent Approval Service',
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get oldest item in queue
   */
  getOldestQueueItem() {
    let oldest = null;
    
    for (const [id, approval] of this.approvalQueue) {
      if (!oldest || new Date(approval.createdAt) < new Date(oldest.createdAt)) {
        oldest = approval;
      }
    }
    
    return oldest ? {
      id: oldest.id,
      age: Date.now() - new Date(oldest.createdAt).getTime(),
      priority: oldest.priority
    } : null;
  }
}

module.exports = IntelligentApprovalService;