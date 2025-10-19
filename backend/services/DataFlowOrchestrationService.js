/**
 * Data Flow Orchestration Service
 * 
 * Orchestrates seamless data flow between all FinBot modules,
 * ensuring data consistency, real-time synchronization, and efficient processing.
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class DataFlowOrchestrationService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      batchSize: config.batchSize || 100,
      syncInterval: config.syncInterval || 30000, // 30 seconds
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      ...config
    };
    
    this.dataStreams = new Map();
    this.syncQueues = new Map();
    this.processingStatus = new Map();
    this.errorLog = [];
    this.metrics = {
      totalProcessed: 0,
      totalErrors: 0,
      avgProcessingTime: 0,
      lastSyncTime: null
    };
    
    this.setupDataStreams();
  }

  /**
   * Initialize the data flow orchestration service
   */
  async initialize() {
    try {
      console.log('Initializing Data Flow Orchestration Service...');
      
      // Initialize data streams
      await this.initializeDataStreams();
      
      // Start periodic synchronization
      this.startPeriodicSync();
      
      // Set up error handling
      this.setupErrorHandling();
      
      console.log('Data Flow Orchestration Service initialized successfully');
      this.emit('initialized');
      
    } catch (error) {
      console.error('Failed to initialize Data Flow Orchestration Service:', error);
      throw error;
    }
  }

  /**
   * Set up data streams between modules
   */
  setupDataStreams() {
    // User Management → ML Analytics
    this.dataStreams.set('user_to_ml', {
      source: 'user_management',
      target: 'ml_analytics',
      dataTypes: ['user_profile', 'preferences', 'demographics'],
      transformations: ['normalize_demographics', 'extract_features'],
      realTime: true
    });
    
    // Transaction System → ML Analytics
    this.dataStreams.set('transaction_to_ml', {
      source: 'transaction_system',
      target: 'ml_analytics',
      dataTypes: ['transactions', 'spending_patterns', 'merchant_data'],
      transformations: ['categorize_transactions', 'extract_patterns'],
      realTime: true
    });
    
    // ML Analytics → Approval System
    this.dataStreams.set('ml_to_approval', {
      source: 'ml_analytics',
      target: 'approval_system',
      dataTypes: ['risk_scores', 'recommendations', 'anomaly_alerts'],
      transformations: ['format_recommendations', 'calculate_confidence'],
      realTime: true
    });
    
    // ML Analytics → Goal Tracking
    this.dataStreams.set('ml_to_goals', {
      source: 'ml_analytics',
      target: 'goal_tracking',
      dataTypes: ['progress_predictions', 'achievement_insights', 'strategy_recommendations'],
      transformations: ['format_insights', 'calculate_milestones'],
      realTime: false
    });
    
    // Goal Tracking → ML Analytics
    this.dataStreams.set('goals_to_ml', {
      source: 'goal_tracking',
      target: 'ml_analytics',
      dataTypes: ['goal_progress', 'achievements', 'user_behavior'],
      transformations: ['extract_behavior_patterns', 'normalize_progress'],
      realTime: false
    });
    
    // ML Analytics → Budget System
    this.dataStreams.set('ml_to_budget', {
      source: 'ml_analytics',
      target: 'budget_system',
      dataTypes: ['spending_forecasts', 'budget_recommendations', 'optimization_suggestions'],
      transformations: ['format_forecasts', 'validate_recommendations'],
      realTime: false
    });
    
    // Budget System → ML Analytics
    this.dataStreams.set('budget_to_ml', {
      source: 'budget_system',
      target: 'ml_analytics',
      dataTypes: ['budget_performance', 'variance_data', 'user_adjustments'],
      transformations: ['calculate_variance', 'extract_adjustment_patterns'],
      realTime: false
    });
  }

  /**
   * Initialize data streams
   */
  async initializeDataStreams() {
    try {
      for (const [streamId, stream] of this.dataStreams) {
        // Initialize sync queue for each stream
        this.syncQueues.set(streamId, []);
        
        // Initialize processing status
        this.processingStatus.set(streamId, {
          isProcessing: false,
          lastProcessed: null,
          totalProcessed: 0,
          errors: 0
        });
        
        console.log(`Initialized data stream: ${streamId}`);
      }
      
    } catch (error) {
      console.error('Error initializing data streams:', error);
      throw error;
    }
  }

  /**
   * Process data flow between modules
   */
  async processDataFlow(sourceModule, targetModule, data, dataType) {
    try {
      const flowId = uuidv4();
      const startTime = Date.now();
      
      console.log(`Processing data flow ${flowId}: ${sourceModule} → ${targetModule}`);
      
      // Find matching data stream
      const streamId = this.findDataStream(sourceModule, targetModule, dataType);
      if (!streamId) {
        throw new Error(`No data stream found for ${sourceModule} → ${targetModule} (${dataType})`);
      }
      
      const stream = this.dataStreams.get(streamId);
      
      // Validate data
      const validatedData = await this.validateData(data, dataType, stream);
      
      // Transform data
      const transformedData = await this.transformData(validatedData, stream.transformations);
      
      // Route data to target
      const result = await this.routeData(transformedData, targetModule, dataType);
      
      // Update metrics
      const processingTime = Date.now() - startTime;
      this.updateMetrics(streamId, processingTime, true);
      
      // Log successful processing
      this.logDataFlow(flowId, sourceModule, targetModule, dataType, 'success', processingTime);
      
      this.emit('data.processed', {
        flowId,
        sourceModule,
        targetModule,
        dataType,
        processingTime,
        recordCount: Array.isArray(transformedData) ? transformedData.length : 1
      });
      
      return result;
      
    } catch (error) {
      console.error('Error processing data flow:', error);
      
      // Update error metrics
      this.updateMetrics(streamId, 0, false);
      
      // Log error
      this.logError(error, { sourceModule, targetModule, dataType });
      
      throw error;
    }
  }

  /**
   * Queue data for batch processing
   */
  async queueData(sourceModule, targetModule, data, dataType) {
    try {
      const streamId = this.findDataStream(sourceModule, targetModule, dataType);
      if (!streamId) {
        throw new Error(`No data stream found for ${sourceModule} → ${targetModule} (${dataType})`);
      }
      
      const queue = this.syncQueues.get(streamId);
      
      // Add to queue
      queue.push({
        id: uuidv4(),
        data: data,
        dataType: dataType,
        timestamp: new Date(),
        retryCount: 0
      });
      
      console.log(`Queued data for stream ${streamId}: ${queue.length} items in queue`);
      
      // Process immediately if real-time stream
      const stream = this.dataStreams.get(streamId);
      if (stream.realTime) {
        await this.processBatch(streamId);
      }
      
    } catch (error) {
      console.error('Error queuing data:', error);
      this.logError(error, { sourceModule, targetModule, dataType });
    }
  }

  /**
   * Process batch of queued data
   */
  async processBatch(streamId) {
    try {
      const status = this.processingStatus.get(streamId);
      if (status.isProcessing) {
        console.log(`Stream ${streamId} is already processing, skipping batch`);
        return;
      }
      
      const queue = this.syncQueues.get(streamId);
      if (queue.length === 0) {
        return;
      }
      
      // Mark as processing
      status.isProcessing = true;
      
      const stream = this.dataStreams.get(streamId);
      const batchSize = Math.min(queue.length, this.config.batchSize);
      const batch = queue.splice(0, batchSize);
      
      console.log(`Processing batch for stream ${streamId}: ${batch.length} items`);
      
      const results = [];
      const errors = [];
      
      for (const item of batch) {
        try {
          const result = await this.processDataFlow(
            stream.source,
            stream.target,
            item.data,
            item.dataType
          );
          results.push(result);
          
        } catch (error) {
          console.error(`Error processing item ${item.id}:`, error);
          
          // Retry logic
          if (item.retryCount < this.config.retryAttempts) {
            item.retryCount++;
            queue.push(item); // Re-queue for retry
            console.log(`Re-queued item ${item.id} for retry (attempt ${item.retryCount})`);
          } else {
            errors.push({ item, error });
            console.error(`Max retries exceeded for item ${item.id}`);
          }
        }
      }
      
      // Update status
      status.isProcessing = false;
      status.lastProcessed = new Date();
      status.totalProcessed += results.length;
      status.errors += errors.length;
      
      // Emit batch completion
      this.emit('batch.processed', {
        streamId,
        processed: results.length,
        errors: errors.length,
        remaining: queue.length
      });
      
    } catch (error) {
      console.error(`Error processing batch for stream ${streamId}:`, error);
      
      // Reset processing status
      const status = this.processingStatus.get(streamId);
      status.isProcessing = false;
    }
  }

  /**
   * Find data stream for source/target/type combination
   */
  findDataStream(sourceModule, targetModule, dataType) {
    for (const [streamId, stream] of this.dataStreams) {
      if (
        stream.source === sourceModule &&
        stream.target === targetModule &&
        stream.dataTypes.includes(dataType)
      ) {
        return streamId;
      }
    }
    return null;
  }

  /**
   * Validate data according to stream requirements
   */
  async validateData(data, dataType, stream) {
    try {
      // Basic validation
      if (!data) {
        throw new Error('Data is required');
      }
      
      // Type-specific validation
      switch (dataType) {
        case 'user_profile':
          return this.validateUserProfile(data);
        case 'transactions':
          return this.validateTransactions(data);
        case 'risk_scores':
          return this.validateRiskScores(data);
        case 'goal_progress':
          return this.validateGoalProgress(data);
        default:
          return data; // Pass through if no specific validation
      }
      
    } catch (error) {
      console.error(`Data validation failed for type ${dataType}:`, error);
      throw error;
    }
  }

  /**
   * Transform data according to stream transformations
   */
  async transformData(data, transformations) {
    try {
      let transformedData = data;
      
      for (const transformation of transformations) {
        transformedData = await this.applyTransformation(transformedData, transformation);
      }
      
      return transformedData;
      
    } catch (error) {
      console.error('Data transformation failed:', error);
      throw error;
    }
  }

  /**
   * Apply specific transformation to data
   */
  async applyTransformation(data, transformation) {
    try {
      switch (transformation) {
        case 'normalize_demographics':
          return this.normalizeDemographics(data);
        case 'extract_features':
          return this.extractFeatures(data);
        case 'categorize_transactions':
          return this.categorizeTransactions(data);
        case 'extract_patterns':
          return this.extractPatterns(data);
        case 'format_recommendations':
          return this.formatRecommendations(data);
        case 'calculate_confidence':
          return this.calculateConfidence(data);
        default:
          console.warn(`Unknown transformation: ${transformation}`);
          return data;
      }
      
    } catch (error) {
      console.error(`Transformation ${transformation} failed:`, error);
      throw error;
    }
  }

  /**
   * Route transformed data to target module
   */
  async routeData(data, targetModule, dataType) {
    try {
      console.log(`Routing data to ${targetModule} (type: ${dataType})`);
      
      // Simulate routing to different modules
      switch (targetModule) {
        case 'ml_analytics':
          return await this.routeToMLAnalytics(data, dataType);
        case 'approval_system':
          return await this.routeToApprovalSystem(data, dataType);
        case 'goal_tracking':
          return await this.routeToGoalTracking(data, dataType);
        case 'budget_system':
          return await this.routeToBudgetSystem(data, dataType);
        default:
          throw new Error(`Unknown target module: ${targetModule}`);
      }
      
    } catch (error) {
      console.error(`Error routing data to ${targetModule}:`, error);
      throw error;
    }
  }

  // Validation Methods

  validateUserProfile(data) {
    if (!data.userId) throw new Error('User ID is required');
    if (!data.demographics) throw new Error('Demographics are required');
    return data;
  }

  validateTransactions(data) {
    if (!Array.isArray(data)) data = [data];
    
    for (const transaction of data) {
      if (!transaction.id) throw new Error('Transaction ID is required');
      if (!transaction.amount) throw new Error('Transaction amount is required');
      if (!transaction.userId) throw new Error('User ID is required');
    }
    
    return data;
  }

  validateRiskScores(data) {
    if (!data.userId) throw new Error('User ID is required');
    if (typeof data.riskScore !== 'number') throw new Error('Risk score must be a number');
    if (data.riskScore < 0 || data.riskScore > 1) throw new Error('Risk score must be between 0 and 1');
    return data;
  }

  validateGoalProgress(data) {
    if (!data.goalId) throw new Error('Goal ID is required');
    if (!data.userId) throw new Error('User ID is required');
    if (typeof data.progress !== 'number') throw new Error('Progress must be a number');
    return data;
  }

  // Transformation Methods

  normalizeDemographics(data) {
    // Normalize demographic data
    const normalized = { ...data };
    
    if (normalized.demographics) {
      // Normalize age to age group
      if (normalized.demographics.age) {
        const age = normalized.demographics.age;
        if (age < 25) normalized.demographics.ageGroup = 'young';
        else if (age < 45) normalized.demographics.ageGroup = 'middle';
        else normalized.demographics.ageGroup = 'senior';
      }
      
      // Normalize location to region
      if (normalized.demographics.location) {
        // This would typically use a location service
        normalized.demographics.region = 'unknown';
      }
    }
    
    return normalized;
  }

  extractFeatures(data) {
    // Extract ML features from user data
    const features = {
      ...data,
      features: {
        hasHighIncome: (data.monthlyIncome || 0) > 10000,
        hasLowDebt: (data.debtToIncomeRatio || 0) < 0.3,
        isActiveSaver: (data.savingsRate || 0) > 0.2,
        riskTolerance: data.riskProfile || 'medium'
      }
    };
    
    return features;
  }

  categorizeTransactions(data) {
    // Categorize transactions automatically
    if (!Array.isArray(data)) data = [data];
    
    return data.map(transaction => ({
      ...transaction,
      autoCategory: this.inferCategory(transaction.description || ''),
      isRecurring: this.isRecurringTransaction(transaction)
    }));
  }

  extractPatterns(data) {
    // Extract spending patterns from transaction data
    if (!Array.isArray(data)) data = [data];
    
    const patterns = {
      transactions: data,
      patterns: {
        avgAmount: data.reduce((sum, t) => sum + t.amount, 0) / data.length,
        mostFrequentCategory: this.getMostFrequentCategory(data),
        spendingTrend: this.calculateSpendingTrend(data)
      }
    };
    
    return patterns;
  }

  formatRecommendations(data) {
    // Format ML recommendations for approval system
    return {
      ...data,
      formatted: true,
      displayText: this.generateRecommendationText(data),
      actionItems: this.extractActionItems(data)
    };
  }

  calculateConfidence(data) {
    // Calculate confidence scores for recommendations
    return {
      ...data,
      confidence: Math.min(1.0, (data.confidence || 0.5) * 1.1), // Boost confidence slightly
      confidenceLevel: this.getConfidenceLevel(data.confidence || 0.5)
    };
  }

  // Routing Methods

  async routeToMLAnalytics(data, dataType) {
    // Route data to ML Analytics service
    console.log(`Routing ${dataType} to ML Analytics`);
    
    // Simulate API call to ML service
    return {
      success: true,
      target: 'ml_analytics',
      dataType: dataType,
      processed: true,
      timestamp: new Date()
    };
  }

  async routeToApprovalSystem(data, dataType) {
    // Route data to Approval System
    console.log(`Routing ${dataType} to Approval System`);
    
    return {
      success: true,
      target: 'approval_system',
      dataType: dataType,
      processed: true,
      timestamp: new Date()
    };
  }

  async routeToGoalTracking(data, dataType) {
    // Route data to Goal Tracking service
    console.log(`Routing ${dataType} to Goal Tracking`);
    
    return {
      success: true,
      target: 'goal_tracking',
      dataType: dataType,
      processed: true,
      timestamp: new Date()
    };
  }

  async routeToBudgetSystem(data, dataType) {
    // Route data to Budget System
    console.log(`Routing ${dataType} to Budget System`);
    
    return {
      success: true,
      target: 'budget_system',
      dataType: dataType,
      processed: true,
      timestamp: new Date()
    };
  }

  // Helper Methods

  inferCategory(description) {
    const categories = {
      'grocery': ['grocery', 'supermarket', 'food'],
      'gas': ['gas', 'fuel', 'petrol'],
      'restaurant': ['restaurant', 'cafe', 'dining'],
      'shopping': ['amazon', 'store', 'retail']
    };
    
    const desc = description.toLowerCase();
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => desc.includes(keyword))) {
        return category;
      }
    }
    
    return 'other';
  }

  isRecurringTransaction(transaction) {
    // Simple heuristic for recurring transactions
    const recurringKeywords = ['subscription', 'monthly', 'recurring', 'auto'];
    const desc = (transaction.description || '').toLowerCase();
    return recurringKeywords.some(keyword => desc.includes(keyword));
  }

  getMostFrequentCategory(transactions) {
    const categoryCount = {};
    transactions.forEach(t => {
      const category = t.category || 'other';
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    });
    
    return Object.keys(categoryCount).reduce((a, b) => 
      categoryCount[a] > categoryCount[b] ? a : b
    );
  }

  calculateSpendingTrend(transactions) {
    if (transactions.length < 2) return 'stable';
    
    const sorted = transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
    const secondHalf = sorted.slice(Math.floor(sorted.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, t) => sum + t.amount, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, t) => sum + t.amount, 0) / secondHalf.length;
    
    const change = (secondAvg - firstAvg) / firstAvg;
    
    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  generateRecommendationText(data) {
    return `AI recommends: ${data.decision || 'review'} (confidence: ${((data.confidence || 0) * 100).toFixed(1)}%)`;
  }

  extractActionItems(data) {
    return data.recommendations || [];
  }

  getConfidenceLevel(confidence) {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.6) return 'medium';
    return 'low';
  }

  // Utility Methods

  updateMetrics(streamId, processingTime, success) {
    this.metrics.totalProcessed++;
    
    if (!success) {
      this.metrics.totalErrors++;
    }
    
    // Update average processing time
    this.metrics.avgProcessingTime = 
      (this.metrics.avgProcessingTime * (this.metrics.totalProcessed - 1) + processingTime) / 
      this.metrics.totalProcessed;
  }

  logDataFlow(flowId, source, target, dataType, status, processingTime) {
    console.log(`Data flow ${flowId}: ${source} → ${target} (${dataType}) - ${status} (${processingTime}ms)`);
  }

  logError(error, context) {
    const errorEntry = {
      timestamp: new Date(),
      error: error.message,
      context: context,
      stack: error.stack
    };
    
    this.errorLog.push(errorEntry);
    
    // Keep only last 100 errors
    if (this.errorLog.length > 100) {
      this.errorLog.shift();
    }
    
    this.emit('error.logged', errorEntry);
  }

  setupErrorHandling() {
    this.on('error', (error) => {
      console.error('Data Flow Orchestration Error:', error);
    });
  }

  startPeriodicSync() {
    setInterval(async () => {
      try {
        await this.processAllQueues();
        this.metrics.lastSyncTime = new Date();
      } catch (error) {
        console.error('Error in periodic sync:', error);
      }
    }, this.config.syncInterval);
  }

  async processAllQueues() {
    for (const [streamId] of this.dataStreams) {
      try {
        await this.processBatch(streamId);
      } catch (error) {
        console.error(`Error processing queue ${streamId}:`, error);
      }
    }
  }

  getStatus() {
    const status = {
      service: 'Data Flow Orchestration',
      streams: {},
      metrics: this.metrics,
      errors: this.errorLog.slice(-10) // Last 10 errors
    };
    
    for (const [streamId, stream] of this.dataStreams) {
      const queue = this.syncQueues.get(streamId);
      const processing = this.processingStatus.get(streamId);
      
      status.streams[streamId] = {
        source: stream.source,
        target: stream.target,
        realTime: stream.realTime,
        queueSize: queue.length,
        processing: processing
      };
    }
    
    return status;
  }

  async healthCheck() {
    try {
      const status = this.getStatus();
      
      return {
        service: 'Data Flow Orchestration Service',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        ...status
      };
      
    } catch (error) {
      return {
        service: 'Data Flow Orchestration Service',
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = DataFlowOrchestrationService;