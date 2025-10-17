/**
 * Kafka Stream Processor for Real-time Transaction Data
 * Handles real-time financial transaction streaming and processing
 */

const kafka = require('kafkajs');
const { Readable } = require('stream');
const logger = require('../../utils/logger');
const { validateTransactionData } = require('./data-validation');
const { enrichTransactionData } = require('./data-enrichment');

class KafkaStreamProcessor {
  constructor(config = {}) {
    this.kafkaConfig = {
      clientId: 'finbot-ai-analytics',
      brokers: config.brokers || ['localhost:9092'],
      ...config.kafka
    };
    
    this.kafka = kafka(this.kafkaConfig);
    this.consumer = this.kafka.consumer({ 
      groupId: 'ai-analytics-group',
      ...config.consumer 
    });
    this.producer = this.kafka.producer(config.producer);
    
    this.topics = {
      input: config.inputTopic || 'financial-transactions',
      output: config.outputTopic || 'processed-transactions',
      errors: config.errorTopic || 'processing-errors'
    };
    
    this.isRunning = false;
    this.processingStats = {
      processed: 0,
      errors: 0,
      startTime: null
    };
  }

  async initialize() {
    try {
      await this.producer.connect();
      await this.consumer.connect();
      
      await this.consumer.subscribe({ 
        topic: this.topics.input,
        fromBeginning: false 
      });
      
      logger.info('Kafka stream processor initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Kafka stream processor:', error);
      throw error;
    }
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Stream processor is already running');
      return;
    }

    this.isRunning = true;
    this.processingStats.startTime = new Date();
    
    logger.info('Starting Kafka stream processor...');

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          await this.processMessage(message);
          this.processingStats.processed++;
        } catch (error) {
          this.processingStats.errors++;
          logger.error('Error processing message:', error);
          await this.handleProcessingError(message, error);
        }
      },
    });
  }

  async processMessage(message) {
    const startTime = Date.now();
    
    try {
      // Parse message
      const rawData = JSON.parse(message.value.toString());
      
      // Validate transaction data
      const validationResult = await validateTransactionData(rawData);
      if (!validationResult.isValid) {
        throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
      }

      // Enrich transaction data
      const enrichedData = await enrichTransactionData(validationResult.data);
      
      // Extract features for ML pipeline
      const features = await this.extractFeatures(enrichedData);
      
      // Prepare processed message
      const processedMessage = {
        ...enrichedData,
        features,
        processingTimestamp: new Date().toISOString(),
        processingLatency: Date.now() - startTime
      };

      // Send to output topic
      await this.producer.send({
        topic: this.topics.output,
        messages: [{
          key: enrichedData.transactionId,
          value: JSON.stringify(processedMessage),
          headers: {
            'content-type': 'application/json',
            'processing-version': '1.0'
          }
        }]
      });

      logger.debug(`Processed transaction ${enrichedData.transactionId} in ${Date.now() - startTime}ms`);
      
    } catch (error) {
      logger.error('Message processing failed:', error);
      throw error;
    }
  }

  async extractFeatures(transactionData) {
    const features = {
      // Basic transaction features
      amount: transactionData.amount,
      category: transactionData.category,
      merchant: transactionData.merchant,
      timestamp: transactionData.timestamp,
      
      // Temporal features
      hour: new Date(transactionData.timestamp).getHours(),
      dayOfWeek: new Date(transactionData.timestamp).getDay(),
      dayOfMonth: new Date(transactionData.timestamp).getDate(),
      month: new Date(transactionData.timestamp).getMonth() + 1,
      
      // User behavior features
      userId: transactionData.userId,
      accountId: transactionData.accountId,
      
      // Location features (if available)
      location: transactionData.location || null,
      
      // Derived features
      isWeekend: [0, 6].includes(new Date(transactionData.timestamp).getDay()),
      isBusinessHours: (() => {
        const hour = new Date(transactionData.timestamp).getHours();
        return hour >= 9 && hour <= 17;
      })(),
      
      // Amount categories
      amountCategory: this.categorizeAmount(transactionData.amount),
      
      // Frequency features (to be calculated by feature store)
      transactionFrequency: null, // Will be populated by feature store
      avgTransactionAmount: null,  // Will be populated by feature store
      
      // Risk indicators
      isHighValue: transactionData.amount > 1000,
      isInternational: transactionData.isInternational || false
    };

    return features;
  }

  categorizeAmount(amount) {
    if (amount < 10) return 'micro';
    if (amount < 50) return 'small';
    if (amount < 200) return 'medium';
    if (amount < 1000) return 'large';
    return 'very_large';
  }

  async handleProcessingError(message, error) {
    try {
      const errorMessage = {
        originalMessage: message.value.toString(),
        error: error.message,
        timestamp: new Date().toISOString(),
        topic: this.topics.input
      };

      await this.producer.send({
        topic: this.topics.errors,
        messages: [{
          value: JSON.stringify(errorMessage),
          headers: {
            'error-type': 'processing-error'
          }
        }]
      });
    } catch (errorHandlingError) {
      logger.error('Failed to send error message:', errorHandlingError);
    }
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info('Stopping Kafka stream processor...');
    
    try {
      await this.consumer.disconnect();
      await this.producer.disconnect();
      logger.info('Kafka stream processor stopped successfully');
    } catch (error) {
      logger.error('Error stopping Kafka stream processor:', error);
      throw error;
    }
  }

  getStats() {
    const runtime = this.processingStats.startTime 
      ? Date.now() - this.processingStats.startTime.getTime()
      : 0;
      
    return {
      ...this.processingStats,
      runtime,
      throughput: runtime > 0 ? (this.processingStats.processed / (runtime / 1000)) : 0,
      errorRate: this.processingStats.processed > 0 
        ? (this.processingStats.errors / this.processingStats.processed) 
        : 0
    };
  }

  // Health check method
  async healthCheck() {
    try {
      const admin = this.kafka.admin();
      await admin.connect();
      
      const metadata = await admin.fetchTopicMetadata({ 
        topics: [this.topics.input, this.topics.output] 
      });
      
      await admin.disconnect();
      
      return {
        status: 'healthy',
        topics: metadata.topics.map(t => t.name),
        isRunning: this.isRunning,
        stats: this.getStats()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        isRunning: this.isRunning
      };
    }
  }
}

module.exports = KafkaStreamProcessor;