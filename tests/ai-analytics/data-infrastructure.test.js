/**
 * Data Infrastructure Tests for AI Analytics
 * Tests for data ingestion, feature store, and privacy components
 */

const { describe, it, beforeEach, afterEach, before, after } = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const KafkaStreamProcessor = require('../../src/ai-analytics/data-ingestion/kafka-stream-processor');
const BatchProcessor = require('../../src/ai-analytics/data-ingestion/batch-processor');
const { validateTransactionData } = require('../../src/ai-analytics/data-ingestion/data-validation');
const { enrichTransactionData } = require('../../src/ai-analytics/data-ingestion/data-enrichment');
const FeatureServingAPI = require('../../src/ai-analytics/feature-store/feature-serving-api');
const DataPrivacyEngine = require('../../src/ai-analytics/privacy/data-privacy-engine');
const AccessControlSystem = require('../../src/ai-analytics/privacy/access-control');

describe('AI Analytics Data Infrastructure', () => {
  
  describe('Data Validation', () => {
    it('should validate correct transaction data', async () => {
      const validTransaction = {
        transactionId: 'txn_123456789',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        accountId: '550e8400-e29b-41d4-a716-446655440001',
        amount: 125.50,
        currency: 'USD',
        category: 'food',
        merchant: 'Starbucks Coffee',
        description: 'Coffee purchase',
        timestamp: new Date().toISOString(),
        location: {
          latitude: 40.7128,
          longitude: -74.0060,
          address: '123 Main St, New York, NY',
          city: 'New York',
          country: 'US'
        },
        isInternational: false,
        metadata: { source: 'mobile_app' }
      };

      const result = await validateTransactionData(validTransaction);
      
      expect(result.isValid).to.be.true;
      expect(result.errors).to.be.empty;
      expect(result.data).to.deep.include(validTransaction);
      expect(result.qualityScore).to.be.above(80);
    });

    it('should reject invalid transaction data', async () => {
      const invalidTransaction = {
        transactionId: '', // Invalid: empty
        userId: 'invalid-uuid', // Invalid: not a UUID
        amount: -50, // Invalid: negative amount
        currency: 'INVALID', // Invalid: not 3 characters
        category: '', // Invalid: empty
        timestamp: 'invalid-date' // Invalid: not ISO date
      };

      const result = await validateTransactionData(invalidTransaction);
      
      expect(result.isValid).to.be.false;
      expect(result.errors).to.not.be.empty;
      expect(result.errors.length).to.be.above(3);
    });

    it('should handle business rule validation', async () => {
      const suspiciousTransaction = {
        transactionId: 'txn_test_123',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        accountId: '550e8400-e29b-41d4-a716-446655440001',
        amount: 2000000, // Exceeds maximum threshold
        currency: 'USD',
        category: 'test', // Suspicious category
        merchant: 'Test Merchant',
        description: 'Test transaction',
        timestamp: new Date().toISOString()
      };

      const result = await validateTransactionData(suspiciousTransaction, {
        strictMode: false
      });
      
      expect(result.isValid).to.be.true; // Should pass in non-strict mode
      expect(result.warnings).to.not.be.empty;
      expect(result.qualityScore).to.be.below(70);
    });

    it('should perform batch validation', async () => {
      const transactions = [
        {
          transactionId: 'txn_1',
          userId: '550e8400-e29b-41d4-a716-446655440000',
          accountId: '550e8400-e29b-41d4-a716-446655440001',
          amount: 50.00,
          currency: 'USD',
          category: 'food',
          timestamp: new Date().toISOString()
        },
        {
          transactionId: 'txn_2',
          userId: 'invalid-uuid',
          amount: -100,
          currency: 'INVALID'
        }
      ];

      const { DataValidator } = require('../../src/ai-analytics/data-ingestion/data-validation');
      const validator = new DataValidator();
      const result = await validator.validateBatch(transactions);
      
      expect(result.batchStats.total).to.equal(2);
      expect(result.batchStats.valid).to.equal(1);
      expect(result.batchStats.invalid).to.equal(1);
      expect(result.overallValid).to.be.false;
    });
  });

  describe('Data Enrichment', () => {
    let enricher;

    beforeEach(() => {
      const { DataEnricher } = require('../../src/ai-analytics/data-ingestion/data-enrichment');
      enricher = new DataEnricher({
        enableGeocoding: false, // Disable external APIs for testing
        enableMerchantLookup: false,
        cacheEnabled: true
      });
    });

    it('should enrich transaction with temporal features', async () => {
      const transaction = {
        transactionId: 'txn_123',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 25.50,
        merchant: 'Starbucks',
        category: 'food',
        timestamp: '2024-01-15T14:30:00.000Z'
      };

      const enriched = await enricher.enrichTransactionData(transaction);
      
      expect(enriched.temporalFeatures).to.exist;
      expect(enriched.temporalFeatures.hour).to.equal(14);
      expect(enriched.temporalFeatures.isBusinessHours).to.be.true;
      expect(enriched.temporalFeatures.timeOfDay).to.equal('afternoon');
      expect(enriched.temporalFeatures.isWeekend).to.be.false;
    });

    it('should normalize merchant names', async () => {
      const transaction = {
        transactionId: 'txn_123',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 25.50,
        merchant: 'STARBUCKS COFFEE #1234',
        category: 'food',
        timestamp: new Date().toISOString()
      };

      const enriched = await enricher.enrichTransactionData(transaction);
      
      expect(enriched.merchantNormalized).to.equal('starbucks coffee 1234');
      expect(enriched.merchantChain).to.equal('starbucks');
    });

    it('should add risk indicators', async () => {
      const highRiskTransaction = {
        transactionId: 'txn_123',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 5000,
        merchant: 'Unknown Merchant',
        category: 'other',
        timestamp: '2024-01-15T02:30:00.000Z', // Late night
        isInternational: true
      };

      const enriched = await enricher.enrichTransactionData(highRiskTransaction);
      
      expect(enriched.riskIndicators).to.exist;
      expect(enriched.riskIndicators.isHighValue).to.be.true;
      expect(enriched.riskIndicators.isVeryHighValue).to.be.true;
      expect(enriched.riskIndicators.isOffHours).to.be.true;
      expect(enriched.riskIndicators.isInternational).to.be.true;
    });

    it('should handle enrichment errors gracefully', async () => {
      const invalidTransaction = null;

      const enriched = await enricher.enrichTransactionData(invalidTransaction);
      
      expect(enriched.enrichmentError).to.exist;
      expect(enriched.enrichmentTimestamp).to.exist;
    });
  });

  describe('Kafka Stream Processor', () => {
    let processor;
    let mockKafka;

    beforeEach(() => {
      // Mock Kafka for testing
      mockKafka = {
        consumer: sinon.stub().returns({
          connect: sinon.stub().resolves(),
          subscribe: sinon.stub().resolves(),
          run: sinon.stub().resolves(),
          disconnect: sinon.stub().resolves()
        }),
        producer: sinon.stub().returns({
          connect: sinon.stub().resolves(),
          send: sinon.stub().resolves(),
          disconnect: sinon.stub().resolves()
        }),
        admin: sinon.stub().returns({
          connect: sinon.stub().resolves(),
          fetchTopicMetadata: sinon.stub().resolves({
            topics: [{ name: 'test-topic' }]
          }),
          disconnect: sinon.stub().resolves()
        })
      };

      processor = new KafkaStreamProcessor({
        brokers: ['localhost:9092'],
        inputTopic: 'test-input',
        outputTopic: 'test-output'
      });

      // Replace Kafka instance with mock
      processor.kafka = mockKafka;
      processor.consumer = mockKafka.consumer();
      processor.producer = mockKafka.producer();
    });

    afterEach(async () => {
      if (processor.isRunning) {
        await processor.stop();
      }
    });

    it('should initialize successfully', async () => {
      await processor.initialize();
      
      expect(processor.consumer.connect.calledOnce).to.be.true;
      expect(processor.producer.connect.calledOnce).to.be.true;
      expect(processor.consumer.subscribe.calledOnce).to.be.true;
    });

    it('should process messages correctly', async () => {
      const mockMessage = {
        value: Buffer.from(JSON.stringify({
          transactionId: 'txn_123',
          userId: '550e8400-e29b-41d4-a716-446655440000',
          accountId: '550e8400-e29b-41d4-a716-446655440001',
          amount: 100.00,
          currency: 'USD',
          category: 'food',
          merchant: 'Test Merchant',
          timestamp: new Date().toISOString()
        }))
      };

      await processor.initialize();
      await processor.processMessage(mockMessage);
      
      expect(processor.producer.send.calledOnce).to.be.true;
      expect(processor.processingStats.processed).to.equal(1);
    });

    it('should handle processing errors', async () => {
      const invalidMessage = {
        value: Buffer.from('invalid json')
      };

      await processor.initialize();
      
      try {
        await processor.processMessage(invalidMessage);
      } catch (error) {
        expect(error).to.exist;
      }
      
      expect(processor.processingStats.errors).to.equal(1);
    });

    it('should provide health check', async () => {
      await processor.initialize();
      
      const health = await processor.healthCheck();
      
      expect(health.status).to.equal('healthy');
      expect(health.topics).to.include('test-topic');
      expect(health.isRunning).to.be.false;
    });
  });

  describe('Batch Processor', () => {
    let processor;
    let mockPgPool;

    beforeEach(() => {
      mockPgPool = {
        query: sinon.stub(),
        end: sinon.stub().resolves()
      };

      processor = new BatchProcessor({
        batchSize: 100,
        maxConcurrency: 2,
        sourceDatabase: { mock: true },
        targetDatabase: { mock: true }
      });

      processor.sourceDb = mockPgPool;
      processor.targetDb = mockPgPool;
    });

    afterEach(async () => {
      if (processor.isRunning) {
        await processor.stop();
      }
    });

    it('should process daily historical data', async () => {
      // Mock database responses
      mockPgPool.query
        .onFirstCall().resolves({ rows: [{ total: '10' }] }) // Count query
        .onSecondCall().resolves({ // Batch query
          rows: [
            {
              id: 'txn_1',
              user_id: '550e8400-e29b-41d4-a716-446655440000',
              amount: '100.00',
              category: 'food',
              created_at: new Date()
            }
          ]
        })
        .onThirdCall().resolves(); // Insert query

      const job = {
        id: 'test-job',
        totalRecords: 0,
        processedRecords: 0,
        errors: []
      };

      await processor.processDailyHistoricalData(job);
      
      expect(job.totalRecords).to.equal(10);
      expect(mockPgPool.query.callCount).to.be.above(2);
    });

    it('should handle processing errors with retry', async () => {
      const record = {
        id: 'txn_1',
        user_id: 'invalid-uuid',
        amount: 'invalid',
        created_at: new Date()
      };

      const job = { errors: [] };

      await processor.processRecord(record, job);
      
      expect(job.errors.length).to.equal(1);
      expect(job.errors[0].recordId).to.equal('txn_1');
    });

    it('should provide status information', () => {
      const status = processor.getStatus();
      
      expect(status.isRunning).to.be.false;
      expect(status.currentJobs).to.be.an('array');
      expect(status.recentJobs).to.be.an('array');
      expect(status.config).to.exist;
    });
  });

  describe('Feature Serving API', () => {
    let api;
    let mockRedis;
    let mockPgPool;

    beforeEach(() => {
      mockRedis = {
        connect: sinon.stub().resolves(),
        get: sinon.stub().resolves(null),
        setEx: sinon.stub().resolves(),
        disconnect: sinon.stub().resolves(),
        isReady: true
      };

      mockPgPool = {
        query: sinon.stub().resolves({ rows: [] }),
        end: sinon.stub().resolves()
      };

      api = new FeatureServingAPI({
        port: 3002,
        redisUrl: 'redis://localhost:6379',
        postgresConfig: { mock: true }
      });

      api.redisClient = mockRedis;
      api.pgPool = mockPgPool;
    });

    afterEach(async () => {
      if (api.server) {
        await api.stop();
      }
    });

    it('should get user spending features', async () => {
      mockPgPool.query.resolves({
        rows: [{
          user_id: '550e8400-e29b-41d4-a716-446655440000',
          avg_transaction_amount: 125.50,
          monthly_spending_total: 2500.00,
          transaction_frequency: 15.5
        }]
      });

      const entities = [{ user_id: '550e8400-e29b-41d4-a716-446655440000' }];
      const features = await api.getUserSpendingFeatures(entities);
      
      expect(features).to.exist;
      expect(mockPgPool.query.calledOnce).to.be.true;
    });

    it('should compute real-time features', async () => {
      mockPgPool.query
        .onFirstCall().resolves({ rows: [{ count: '2', total: '150.00' }] }) // Hourly
        .onSecondCall().resolves({ rows: [{ count: '5', total: '500.00' }] }) // Daily
        .onThirdCall().resolves({ rows: [{ avg_transaction_amount: 100, transaction_frequency: 10 }] }); // Avg

      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const features = await api.computeUserRealtimeFeatures(userId);
      
      expect(features.transactions_last_hour).to.equal(2);
      expect(features.spending_last_hour).to.equal(150.00);
      expect(features.transactions_today).to.equal(5);
      expect(features.spending_today).to.equal(500.00);
      expect(features.unusual_activity_score).to.be.a('number');
    });

    it('should handle feature service requests', async () => {
      mockPgPool.query.resolves({ rows: [] });

      const request = {
        entities: [{ user_id: '550e8400-e29b-41d4-a716-446655440000' }]
      };

      const features = await api.getFeatureService('spending_prediction_v1', request);
      
      expect(features).to.exist;
      expect(features.user_spending).to.exist;
      expect(features.user_ml).to.exist;
      expect(features.user_realtime).to.exist;
    });
  });

  describe('Data Privacy Engine', () => {
    let privacyEngine;

    beforeEach(() => {
      privacyEngine = new DataPrivacyEngine({
        masterKey: 'test-master-key-32-characters-long',
        anonymizationSalt: 'test-salt'
      });
    });

    it('should encrypt and decrypt data', async () => {
      const originalData = {
        userId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 125.50,
        sensitive: 'secret information'
      };

      const encrypted = await privacyEngine.encryptData(originalData);
      expect(encrypted).to.be.a('string');
      expect(encrypted).to.not.include('secret information');

      const decrypted = await privacyEngine.decryptData(encrypted);
      expect(decrypted).to.deep.equal(originalData);
    });

    it('should anonymize user IDs consistently', () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      
      const anonymized1 = privacyEngine.anonymizeUserId(userId);
      const anonymized2 = privacyEngine.anonymizeUserId(userId);
      
      expect(anonymized1).to.equal(anonymized2);
      expect(anonymized1).to.not.equal(userId);
      expect(anonymized1).to.match(/^anon_[a-f0-9]{16}$/);
    });

    it('should pseudonymize sensitive fields', () => {
      const data = {
        email: 'user@example.com',
        phone: '+1234567890',
        name: 'John Doe',
        amount: 100.00
      };

      const pseudonymized = privacyEngine.pseudonymizeData(data, ['email', 'phone', 'name']);
      
      expect(pseudonymized.email).to.not.equal(data.email);
      expect(pseudonymized.email).to.match(/^user_[a-f0-9]{8}@example\.com$/);
      expect(pseudonymized.phone).to.not.equal(data.phone);
      expect(pseudonymized.name).to.not.equal(data.name);
      expect(pseudonymized.amount).to.equal(data.amount); // Not pseudonymized
    });

    it('should mask sensitive data', () => {
      const data = {
        email: 'user@example.com',
        phone: '1234567890',
        amount: 1500
      };

      const masked = privacyEngine.maskSensitiveData(data);
      
      expect(masked.email).to.equal('us***@example.com');
      expect(masked.phone).to.equal('123-***-7890');
      expect(masked.amount).to.equal('***'); // High amount masked
    });

    it('should add differential privacy noise', () => {
      const originalValue = 1000;
      const noisyValue = privacyEngine.addDifferentialPrivacyNoise(originalValue, 1, 1.0);
      
      expect(noisyValue).to.not.equal(originalValue);
      expect(Math.abs(noisyValue - originalValue)).to.be.below(100); // Reasonable noise level
    });

    it('should create audit logs', () => {
      const auditLog = privacyEngine.createAuditLog(
        'data_access',
        '550e8400-e29b-41d4-a716-446655440000',
        { resource: 'user_data', ip: '192.168.1.1' },
        ['ip']
      );

      expect(auditLog.timestamp).to.exist;
      expect(auditLog.action).to.equal('data_access');
      expect(auditLog.userId).to.match(/^anon_[a-f0-9]{16}$/);
      expect(auditLog.data.ip).to.equal('***'); // Masked
      expect(auditLog.ipHash).to.exist;
    });
  });

  describe('Access Control System', () => {
    let accessControl;

    beforeEach(() => {
      accessControl = new AccessControlSystem({
        jwtSecret: 'test-jwt-secret',
        maxLoginAttempts: 3,
        lockoutDuration: 5000 // 5 seconds for testing
      });
    });

    afterEach(() => {
      accessControl.activeSessions.clear();
      accessControl.loginAttempts.clear();
    });

    it('should authenticate valid user', async () => {
      const session = await accessControl.authenticate('admin', 'admin123', {
        ip: '192.168.1.1',
        userAgent: 'test-agent'
      });

      expect(session.token).to.exist;
      expect(session.user.username).to.equal('admin');
      expect(session.user.role).to.equal('admin');
      expect(session.user.permissions).to.include('analytics:admin');
    });

    it('should reject invalid credentials', async () => {
      try {
        await accessControl.authenticate('admin', 'wrong-password');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Invalid credentials');
      }
    });

    it('should lock account after multiple failed attempts', async () => {
      // Make multiple failed attempts
      for (let i = 0; i < 3; i++) {
        try {
          await accessControl.authenticate('admin', 'wrong-password');
        } catch (error) {
          // Expected to fail
        }
      }

      // Account should now be locked
      try {
        await accessControl.authenticate('admin', 'admin123');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Account temporarily locked');
      }
    });

    it('should validate session tokens', async () => {
      const session = await accessControl.authenticate('admin', 'admin123');
      
      const validatedSession = await accessControl.validateSession(session.token);
      
      expect(validatedSession.userId).to.equal(session.user.id);
      expect(validatedSession.role).to.equal('admin');
    });

    it('should check permissions correctly', () => {
      const adminPermissions = ['analytics:admin', 'data:read', 'data:write'];
      const analystPermissions = ['analytics:read', 'data:read'];

      expect(accessControl.hasPermission(adminPermissions, 'data:write')).to.be.true;
      expect(accessControl.hasPermission(analystPermissions, 'data:write')).to.be.false;
      expect(accessControl.hasPermission(adminPermissions, 'any:permission')).to.be.true; // Admin has all
    });

    it('should filter data based on permissions', () => {
      const sensitiveData = {
        userId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 100.00,
        ssn: '123-45-6789',
        account_number: '1234567890'
      };

      const adminPermissions = ['analytics:admin'];
      const analystPermissions = ['analytics:read'];

      const adminFiltered = accessControl.filterDataByPermissions(
        sensitiveData, adminPermissions, 'user_data'
      );
      const analystFiltered = accessControl.filterDataByPermissions(
        sensitiveData, analystPermissions, 'user_data'
      );

      expect(adminFiltered.ssn).to.equal('123-45-6789'); // Admin sees everything
      expect(analystFiltered.ssn).to.be.undefined; // Analyst doesn't see SSN
      expect(analystFiltered.userId).to.match(/^anon_[a-f0-9]{16}$/); // Anonymized for analyst
    });

    it('should generate security statistics', () => {
      const stats = accessControl.getSecurityStats();
      
      expect(stats.activeSessions).to.be.a('number');
      expect(stats.lockedAccounts).to.be.a('number');
      expect(stats.auditEvents24h).to.be.a('number');
      expect(stats.eventBreakdown).to.be.an('object');
      expect(stats.lastUpdated).to.exist;
    });
  });

  describe('Integration Tests', () => {
    it('should process transaction end-to-end', async () => {
      const transaction = {
        transactionId: 'txn_integration_test',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        accountId: '550e8400-e29b-41d4-a716-446655440001',
        amount: 75.25,
        currency: 'USD',
        category: 'food',
        merchant: 'Test Restaurant',
        description: 'Lunch',
        timestamp: new Date().toISOString(),
        location: {
          latitude: 40.7128,
          longitude: -74.0060
        }
      };

      // Step 1: Validate
      const validationResult = await validateTransactionData(transaction);
      expect(validationResult.isValid).to.be.true;

      // Step 2: Enrich
      const enriched = await enrichTransactionData(validationResult.data);
      expect(enriched.temporalFeatures).to.exist;
      expect(enriched.riskIndicators).to.exist;

      // Step 3: Privacy protection
      const privacyEngine = new DataPrivacyEngine({
        masterKey: 'test-master-key-32-characters-long',
        anonymizationSalt: 'test-salt'
      });

      const anonymizedUserId = privacyEngine.anonymizeUserId(enriched.userId);
      expect(anonymizedUserId).to.not.equal(enriched.userId);

      // Step 4: Feature extraction (mock)
      const features = {
        amount: enriched.amount,
        category: enriched.category,
        hour: enriched.temporalFeatures.hour,
        isWeekend: enriched.temporalFeatures.isWeekend,
        riskScore: enriched.riskIndicators.isHighValue ? 50 : 10
      };

      expect(features.amount).to.equal(75.25);
      expect(features.category).to.equal('food');
      expect(features.riskScore).to.equal(10); // Low risk
    });

    it('should handle privacy-compliant analytics workflow', async () => {
      const privacyEngine = new DataPrivacyEngine({
        masterKey: 'test-master-key-32-characters-long',
        anonymizationSalt: 'test-salt'
      });

      const accessControl = new AccessControlSystem({
        jwtSecret: 'test-jwt-secret'
      });

      // Authenticate user
      const session = await accessControl.authenticate('analyst', 'analyst123');
      
      // Simulate analytics request
      const rawData = {
        userId: '550e8400-e29b-41d4-a716-446655440000',
        totalSpending: 1500.00,
        transactionCount: 25,
        avgAmount: 60.00
      };

      // Apply privacy protection
      const filteredData = accessControl.filterDataByPermissions(
        rawData, session.user.permissions, 'analytics_results'
      );

      // Add differential privacy
      const privatizedData = {
        ...filteredData,
        totalSpending: privacyEngine.addDifferentialPrivacyNoise(filteredData.totalSpending, 100, 1.0),
        transactionCount: Math.round(privacyEngine.addDifferentialPrivacyNoise(filteredData.transactionCount, 1, 1.0)),
        avgAmount: privacyEngine.addDifferentialPrivacyNoise(filteredData.avgAmount, 10, 1.0)
      };

      // Create audit log
      const auditLog = privacyEngine.createAuditLog(
        'analytics_access',
        session.user.id,
        { resource: 'user_spending_data' }
      );

      expect(privatizedData.userId).to.match(/^anon_[a-f0-9]{16}$/);
      expect(privatizedData.totalSpending).to.not.equal(rawData.totalSpending);
      expect(auditLog.action).to.equal('analytics_access');
    });
  });

  describe('Performance Tests', () => {
    it('should handle high-volume data validation', async () => {
      const { DataValidator } = require('../../src/ai-analytics/data-ingestion/data-validation');
      const validator = new DataValidator();

      const transactions = [];
      for (let i = 0; i < 1000; i++) {
        transactions.push({
          transactionId: `txn_${i}`,
          userId: '550e8400-e29b-41d4-a716-446655440000',
          accountId: '550e8400-e29b-41d4-a716-446655440001',
          amount: Math.random() * 1000,
          currency: 'USD',
          category: 'food',
          timestamp: new Date().toISOString()
        });
      }

      const startTime = Date.now();
      const result = await validator.validateBatch(transactions);
      const duration = Date.now() - startTime;

      expect(result.batchStats.total).to.equal(1000);
      expect(duration).to.be.below(5000); // Should complete within 5 seconds
      expect(result.batchStats.valid).to.equal(1000);
    });

    it('should handle concurrent feature requests', async () => {
      const api = new FeatureServingAPI({
        redisUrl: 'redis://localhost:6379',
        postgresConfig: { mock: true }
      });

      // Mock dependencies
      api.redisClient = {
        get: sinon.stub().resolves(null),
        setEx: sinon.stub().resolves()
      };
      api.pgPool = {
        query: sinon.stub().resolves({ rows: [] })
      };

      const requests = [];
      for (let i = 0; i < 100; i++) {
        requests.push(
          api.getUserSpendingFeatures([{ user_id: `user_${i}` }])
        );
      }

      const startTime = Date.now();
      const results = await Promise.all(requests);
      const duration = Date.now() - startTime;

      expect(results.length).to.equal(100);
      expect(duration).to.be.below(2000); // Should complete within 2 seconds
    });
  });
});

// Test utilities
function generateMockTransaction(overrides = {}) {
  return {
    transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId: '550e8400-e29b-41d4-a716-446655440000',
    accountId: '550e8400-e29b-41d4-a716-446655440001',
    amount: Math.round((Math.random() * 1000 + 10) * 100) / 100,
    currency: 'USD',
    category: ['food', 'transportation', 'shopping', 'entertainment'][Math.floor(Math.random() * 4)],
    merchant: 'Test Merchant',
    description: 'Test transaction',
    timestamp: new Date().toISOString(),
    ...overrides
  };
}

function generateMockUser(overrides = {}) {
  return {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    username: `testuser_${Math.random().toString(36).substr(2, 9)}`,
    email: `test_${Math.random().toString(36).substr(2, 9)}@example.com`,
    role: 'analyst',
    isActive: true,
    ...overrides
  };
}

module.exports = {
  generateMockTransaction,
  generateMockUser
};