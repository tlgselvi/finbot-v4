/**
 * FinBot v4 - Approval System Audit System Tests
 * 
 * Comprehensive test suite for audit system functionality including:
 * - Immutable audit logging for all approval actions
 * - Audit report generation and export functionality
 * - Compliance reporting and validation
 * - Data integrity verification with digital signatures
 * - Audit trail analysis and forensics
 * 
 * Requirements: 4.1, 4.2, 4.3
 */

const { describe, test, expect, beforeEach, afterEach, jest } = require('@jest/globals');
const AuditService = require('../../src/services/audit-service');
const AuditLogger = require('../../src/services/audit-logger');
const ComplianceReporter = require('../../src/services/compliance-reporter');
const DigitalSignature = require('../../src/utils/digital-signature');
const { createTestDatabase, cleanupTestDatabase } = require('../helpers/database-helper');
const { createMockWorkflow, createMockUser, createMockAuditEvent } = require('../helpers/audit-helper');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

describe('AuditLogger', () => {
    let auditLogger;
    let testDb;
    let mockDigitalSignature;

    beforeEach(async () => {
        testDb = await createTestDatabase();
        
        mockDigitalSignature = {
            sign: jest.fn().mockReturnValue('mock-signature-hash'),
            verify: jest.fn().mockReturnValue(true),
            generateKeyPair: jest.fn().mockReturnValue({
                publicKey: 'mock-public-key',
                privateKey: 'mock-private-key'
            })
        };

        auditLogger = new AuditLogger({
            database: testDb,
            digitalSignature: mockDigitalSignature,
            config: {
                enableSignatures: true,
                compressionEnabled: true,
                batchSize: 100,
                flushInterval: 1000
            }
        });
    });

    afterEach(async () => {
        await cleanupTestDatabase(testDb);
        jest.clearAllMocks();
    });

    describe('Audit Event Logging', () => {
        test('should log approval action with complete audit trail', async () => {
            const auditEvent = {
                eventType: 'approval_action',
                workflowId: 'workflow-123',
                userId: 'user-456',
                action: 'approve',
                level: 2,
                comments: 'Approved after thorough review',
                ipAddress: '192.168.1.100',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                metadata: {
                    transactionId: 'TX-12345',
                    amount: 5000,
                    currency: 'USD',
                    riskScore: 25.5
                }
            };

            const result = await auditLogger.logEvent(auditEvent);

            expect(result.success).toBe(true);
            expect(result.auditId).toBeDefined();
            expect(mockDigitalSignature.sign).toHaveBeenCalled();

            // Verify database record
            const auditRecord = await testDb.query(
                'SELECT * FROM audit_logs WHERE id = $1',
                [result.auditId]
            );

            expect(auditRecord.rows).toHaveLength(1);
            const record = auditRecord.rows[0];
            expect(record.event_type).toBe('approval_action');
            expect(record.workflow_id).toBe('workflow-123');
            expect(record.user_id).toBe('user-456');
            expect(record.signature_hash).toBe('mock-signature-hash');
            expect(record.metadata).toEqual(auditEvent.metadata);
        });

        test('should log workflow state changes automatically', async () => {
            const stateChangeEvent = {
                eventType: 'workflow_state_change',
                workflowId: 'workflow-789',
                userId: 'system',
                previousState: 'pending',
                newState: 'approved',
                trigger: 'approval_action',
                metadata: {
                    approver: 'user-123',
                    level: 3,
                    totalLevels: 3
                }
            };

            const result = await auditLogger.logEvent(stateChangeEvent);

            expect(result.success).toBe(true);

            // Verify immutable timestamp
            const auditRecord = await testDb.query(
                'SELECT created_at FROM audit_logs WHERE id = $1',
                [result.auditId]
            );

            const timestamp = auditRecord.rows[0].created_at;
            expect(new Date(timestamp)).toBeInstanceOf(Date);
        });

        test('should handle batch logging for high-volume events', async () => {
            const batchEvents = Array.from({ length: 50 }, (_, i) => ({
                eventType: 'system_access',
                userId: `user-${i}`,
                action: 'login',
                ipAddress: `192.168.1.${i + 1}`,
                metadata: { sessionId: `session-${i}` }
            }));

            const result = await auditLogger.logBatch(batchEvents);

            expect(result.success).toBe(true);
            expect(result.processedCount).toBe(50);
            expect(result.failedCount).toBe(0);

            // Verify all events were logged
            const auditRecords = await testDb.query(
                'SELECT COUNT(*) as count FROM audit_logs WHERE event_type = $1',
                ['system_access']
            );

            expect(parseInt(auditRecords.rows[0].count)).toBe(50);
        });

        test('should maintain audit log integrity with digital signatures', async () => {
            const auditEvent = createMockAuditEvent({
                eventType: 'rule_modification',
                userId: 'admin-123',
                action: 'update_rule',
                metadata: {
                    ruleId: 'rule-456',
                    changes: {
                        amountThreshold: { from: 1000, to: 2000 },
                        approvalLevels: { from: 2, to: 3 }
                    }
                }
            });

            await auditLogger.logEvent(auditEvent);

            // Verify signature was generated with correct data
            expect(mockDigitalSignature.sign).toHaveBeenCalledWith(
                expect.stringContaining('rule_modification')
            );

            // Test signature verification
            const auditRecord = await testDb.query(
                'SELECT * FROM audit_logs WHERE event_type = $1',
                ['rule_modification']
            );

            const record = auditRecord.rows[0];
            const isValid = await auditLogger.verifySignature(record.id);
            expect(isValid).toBe(true);
        });

        test('should handle audit logging failures gracefully', async () => {
            // Mock database error
            const originalQuery = testDb.query;
            testDb.query = jest.fn().mockRejectedValue(new Error('Database connection lost'));

            const auditEvent = createMockAuditEvent();
            const result = await auditLogger.logEvent(auditEvent);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Database connection lost');

            // Restore original query method
            testDb.query = originalQuery;
        });

        test('should compress large audit payloads', async () => {
            const largeMetadata = {
                documentContent: 'A'.repeat(10000), // 10KB of data
                attachments: Array.from({ length: 100 }, (_, i) => ({
                    id: `attachment-${i}`,
                    name: `document-${i}.pdf`,
                    size: 1024 * (i + 1)
                }))
            };

            const auditEvent = createMockAuditEvent({
                eventType: 'document_upload',
                metadata: largeMetadata
            });

            const result = await auditLogger.logEvent(auditEvent);

            expect(result.success).toBe(true);
            expect(result.compressed).toBe(true);

            // Verify compressed data can be retrieved and decompressed
            const retrievedEvent = await auditLogger.getEvent(result.auditId);
            expect(retrievedEvent.metadata).toEqual(largeMetadata);
        });
    });

    describe('Audit Trail Query and Analysis', () => {
        beforeEach(async () => {
            // Insert test audit data
            const testEvents = [
                createMockAuditEvent({
                    eventType: 'approval_action',
                    workflowId: 'workflow-1',
                    userId: 'user-1',
                    action: 'approve',
                    created_at: '2024-01-15T10:00:00Z'
                }),
                createMockAuditEvent({
                    eventType: 'approval_action',
                    workflowId: 'workflow-1',
                    userId: 'user-2',
                    action: 'reject',
                    created_at: '2024-01-15T11:00:00Z'
                }),
                createMockAuditEvent({
                    eventType: 'rule_modification',
                    userId: 'admin-1',
                    action: 'create_rule',
                    created_at: '2024-01-15T12:00:00Z'
                })
            ];

            for (const event of testEvents) {
                await auditLogger.logEvent(event);
            }
        });

        test('should query audit trail by workflow', async () => {
            const auditTrail = await auditLogger.getWorkflowAuditTrail('workflow-1');

            expect(auditTrail).toHaveLength(2);
            expect(auditTrail[0].action).toBe('approve');
            expect(auditTrail[1].action).toBe('reject');
            expect(auditTrail[0].user_id).toBe('user-1');
            expect(auditTrail[1].user_id).toBe('user-2');
        });

        test('should query audit trail by user', async () => {
            const userAuditTrail = await auditLogger.getUserAuditTrail('user-1', {
                startDate: '2024-01-15T00:00:00Z',
                endDate: '2024-01-15T23:59:59Z'
            });

            expect(userAuditTrail).toHaveLength(1);
            expect(userAuditTrail[0].action).toBe('approve');
            expect(userAuditTrail[0].workflow_id).toBe('workflow-1');
        });

        test('should query audit trail by event type', async () => {
            const ruleEvents = await auditLogger.getEventsByType('rule_modification', {
                limit: 10,
                offset: 0
            });

            expect(ruleEvents.events).toHaveLength(1);
            expect(ruleEvents.events[0].action).toBe('create_rule');
            expect(ruleEvents.events[0].user_id).toBe('admin-1');
            expect(ruleEvents.total).toBe(1);
        });

        test('should perform audit trail analysis for suspicious patterns', async () => {
            // Add suspicious events
            const suspiciousEvents = [
                createMockAuditEvent({
                    eventType: 'approval_action',
                    userId: 'user-suspicious',
                    action: 'approve',
                    ipAddress: '10.0.0.1',
                    created_at: '2024-01-15T14:00:00Z'
                }),
                createMockAuditEvent({
                    eventType: 'approval_action',
                    userId: 'user-suspicious',
                    action: 'approve',
                    ipAddress: '192.168.1.100', // Different IP
                    created_at: '2024-01-15T14:01:00Z'
                })
            ];

            for (const event of suspiciousEvents) {
                await auditLogger.logEvent(event);
            }

            const analysis = await auditLogger.analyzeSuspiciousActivity({
                userId: 'user-suspicious',
                timeWindow: '1 hour'
            });

            expect(analysis.suspiciousPatterns).toContain('multiple_ip_addresses');
            expect(analysis.riskScore).toBeGreaterThan(0);
        });

        test('should generate audit summary statistics', async () => {
            const stats = await auditLogger.getAuditStatistics({
                startDate: '2024-01-15T00:00:00Z',
                endDate: '2024-01-15T23:59:59Z'
            });

            expect(stats.totalEvents).toBe(3);
            expect(stats.eventsByType).toHaveProperty('approval_action', 2);
            expect(stats.eventsByType).toHaveProperty('rule_modification', 1);
            expect(stats.uniqueUsers).toBe(3);
        });
    });
});

describe('ComplianceReporter', () => {
    let complianceReporter;
    let testDb;
    let auditLogger;

    beforeEach(async () => {
        testDb = await createTestDatabase();
        auditLogger = new AuditLogger({ database: testDb });
        
        complianceReporter = new ComplianceReporter({
            database: testDb,
            auditLogger: auditLogger,
            config: {
                reportFormats: ['pdf', 'excel', 'json'],
                retentionPeriod: '7 years',
                encryptReports: true
            }
        });

        // Insert test compliance data
        await seedComplianceTestData(testDb);
    });

    afterEach(async () => {
        await cleanupTestDatabase(testDb);
    });

    describe('Compliance Report Generation', () => {
        test('should generate SOX compliance report', async () => {
            const report = await complianceReporter.generateSOXReport({
                startDate: '2024-01-01',
                endDate: '2024-01-31',
                includeDetails: true
            });

            expect(report.reportType).toBe('SOX_COMPLIANCE');
            expect(report.period).toEqual({
                start: '2024-01-01',
                end: '2024-01-31'
            });
            expect(report.sections).toHaveProperty('approvalControls');
            expect(report.sections).toHaveProperty('segregationOfDuties');
            expect(report.sections).toHaveProperty('auditTrail');
            expect(report.complianceScore).toBeGreaterThanOrEqual(0);
            expect(report.complianceScore).toBeLessThanOrEqual(100);
        });

        test('should generate audit trail report for regulatory review', async () => {
            const report = await complianceReporter.generateAuditTrailReport({
                workflowIds: ['workflow-1', 'workflow-2'],
                includeSignatures: true,
                format: 'detailed'
            });

            expect(report.workflows).toHaveLength(2);
            expect(report.workflows[0]).toHaveProperty('auditEvents');
            expect(report.workflows[0]).toHaveProperty('signatureVerification');
            expect(report.integrityCheck.passed).toBe(true);
        });

        test('should generate user activity report', async () => {
            const report = await complianceReporter.generateUserActivityReport({
                userId: 'user-123',
                startDate: '2024-01-01',
                endDate: '2024-01-31',
                includeFailedAttempts: true
            });

            expect(report.userId).toBe('user-123');
            expect(report.summary).toHaveProperty('totalActions');
            expect(report.summary).toHaveProperty('approvalActions');
            expect(report.summary).toHaveProperty('rejectionActions');
            expect(report.timeline).toBeInstanceOf(Array);
            expect(report.riskAssessment).toHaveProperty('score');
        });

        test('should generate exception report for failed approvals', async () => {
            const report = await complianceReporter.generateExceptionReport({
                startDate: '2024-01-01',
                endDate: '2024-01-31',
                exceptionTypes: ['timeout', 'override', 'delegation_failure']
            });

            expect(report.exceptions).toBeInstanceOf(Array);
            expect(report.summary).toHaveProperty('totalExceptions');
            expect(report.summary).toHaveProperty('exceptionsByType');
            expect(report.riskAnalysis).toHaveProperty('highRiskExceptions');
        });

        test('should export reports in multiple formats', async () => {
            const reportData = await complianceReporter.generateSOXReport({
                startDate: '2024-01-01',
                endDate: '2024-01-31'
            });

            // Test PDF export
            const pdfBuffer = await complianceReporter.exportToPDF(reportData);
            expect(pdfBuffer).toBeInstanceOf(Buffer);
            expect(pdfBuffer.length).toBeGreaterThan(0);

            // Test Excel export
            const excelBuffer = await complianceReporter.exportToExcel(reportData);
            expect(excelBuffer).toBeInstanceOf(Buffer);
            expect(excelBuffer.length).toBeGreaterThan(0);

            // Test JSON export
            const jsonData = await complianceReporter.exportToJSON(reportData);
            expect(typeof jsonData).toBe('string');
            expect(JSON.parse(jsonData)).toEqual(reportData);
        });
    });

    describe('Automated Compliance Monitoring', () => {
        test('should detect compliance violations automatically', async () => {
            const violations = await complianceReporter.detectViolations({
                rules: [
                    'segregation_of_duties',
                    'approval_timeouts',
                    'unauthorized_overrides'
                ],
                period: '30 days'
            });

            expect(violations).toBeInstanceOf(Array);
            violations.forEach(violation => {
                expect(violation).toHaveProperty('type');
                expect(violation).toHaveProperty('severity');
                expect(violation).toHaveProperty('description');
                expect(violation).toHaveProperty('evidence');
            });
        });

        test('should generate compliance alerts for threshold breaches', async () => {
            const alerts = await complianceReporter.checkComplianceThresholds({
                thresholds: {
                    maxApprovalTime: 48, // hours
                    maxOverrideRate: 5, // percentage
                    minApprovalRate: 95 // percentage
                }
            });

            expect(alerts).toBeInstanceOf(Array);
            alerts.forEach(alert => {
                expect(alert).toHaveProperty('threshold');
                expect(alert).toHaveProperty('actualValue');
                expect(alert).toHaveProperty('severity');
            });
        });

        test('should track compliance metrics over time', async () => {
            const metrics = await complianceReporter.getComplianceMetrics({
                period: '90 days',
                granularity: 'daily'
            });

            expect(metrics.timeline).toBeInstanceOf(Array);
            expect(metrics.summary).toHaveProperty('averageComplianceScore');
            expect(metrics.trends).toHaveProperty('approvalTimesTrend');
            expect(metrics.trends).toHaveProperty('overrideRateTrend');
        });
    });

    describe('Data Retention and Archival', () => {
        test('should implement data retention policies', async () => {
            const retentionResult = await complianceReporter.applyRetentionPolicy({
                policy: 'financial_records',
                retentionPeriod: '7 years',
                dryRun: true
            });

            expect(retentionResult.recordsToArchive).toBeGreaterThanOrEqual(0);
            expect(retentionResult.recordsToDelete).toBeGreaterThanOrEqual(0);
            expect(retentionResult.estimatedStorageSavings).toBeDefined();
        });

        test('should create secure archives for long-term storage', async () => {
            const archiveResult = await complianceReporter.createArchive({
                startDate: '2023-01-01',
                endDate: '2023-12-31',
                includeSignatures: true,
                compressionLevel: 'high'
            });

            expect(archiveResult.archiveId).toBeDefined();
            expect(archiveResult.recordCount).toBeGreaterThan(0);
            expect(archiveResult.archiveSize).toBeGreaterThan(0);
            expect(archiveResult.integrityHash).toBeDefined();
        });

        test('should verify archive integrity', async () => {
            const archiveId = 'archive-2023-001';
            const verification = await complianceReporter.verifyArchiveIntegrity(archiveId);

            expect(verification.isValid).toBe(true);
            expect(verification.recordCount).toBeGreaterThan(0);
            expect(verification.checksumValid).toBe(true);
            expect(verification.signatureValid).toBe(true);
        });
    });
});

describe('Digital Signature and Integrity Verification', () => {
    let digitalSignature;
    let testKeyPair;

    beforeEach(async () => {
        digitalSignature = new DigitalSignature({
            algorithm: 'RSA-SHA256',
            keySize: 2048
        });

        testKeyPair = await digitalSignature.generateKeyPair();
    });

    describe('Digital Signature Operations', () => {
        test('should generate and verify digital signatures', async () => {
            const data = JSON.stringify({
                workflowId: 'workflow-123',
                action: 'approve',
                timestamp: new Date().toISOString(),
                userId: 'user-456'
            });

            const signature = await digitalSignature.sign(data, testKeyPair.privateKey);
            expect(signature).toBeDefined();
            expect(typeof signature).toBe('string');

            const isValid = await digitalSignature.verify(data, signature, testKeyPair.publicKey);
            expect(isValid).toBe(true);
        });

        test('should detect tampered data', async () => {
            const originalData = JSON.stringify({ amount: 1000, approved: true });
            const tamperedData = JSON.stringify({ amount: 10000, approved: true });

            const signature = await digitalSignature.sign(originalData, testKeyPair.privateKey);
            const isValid = await digitalSignature.verify(tamperedData, signature, testKeyPair.publicKey);

            expect(isValid).toBe(false);
        });

        test('should handle signature verification with wrong key', async () => {
            const data = 'test data';
            const wrongKeyPair = await digitalSignature.generateKeyPair();

            const signature = await digitalSignature.sign(data, testKeyPair.privateKey);
            const isValid = await digitalSignature.verify(data, signature, wrongKeyPair.publicKey);

            expect(isValid).toBe(false);
        });

        test('should create timestamped signatures', async () => {
            const data = 'audit event data';
            const timestamp = new Date().toISOString();

            const timestampedSignature = await digitalSignature.signWithTimestamp(
                data, 
                testKeyPair.privateKey, 
                timestamp
            );

            expect(timestampedSignature).toHaveProperty('signature');
            expect(timestampedSignature).toHaveProperty('timestamp');
            expect(timestampedSignature.timestamp).toBe(timestamp);

            const isValid = await digitalSignature.verifyTimestampedSignature(
                data,
                timestampedSignature,
                testKeyPair.publicKey
            );

            expect(isValid).toBe(true);
        });
    });

    describe('Batch Signature Operations', () => {
        test('should sign multiple audit events in batch', async () => {
            const auditEvents = Array.from({ length: 10 }, (_, i) => ({
                id: `event-${i}`,
                data: `audit event ${i}`,
                timestamp: new Date().toISOString()
            }));

            const batchSignatures = await digitalSignature.signBatch(
                auditEvents,
                testKeyPair.privateKey
            );

            expect(batchSignatures).toHaveLength(10);
            
            // Verify all signatures
            for (let i = 0; i < auditEvents.length; i++) {
                const isValid = await digitalSignature.verify(
                    auditEvents[i].data,
                    batchSignatures[i],
                    testKeyPair.publicKey
                );
                expect(isValid).toBe(true);
            }
        });

        test('should create merkle tree for batch integrity', async () => {
            const auditEvents = Array.from({ length, 8 }, (_, i) => ({
                id: `event-${i}`,
                data: `audit event ${i}`
            }));

            const merkleTree = await digitalSignature.createMerkleTree(auditEvents);

            expect(merkleTree.root).toBeDefined();
            expect(merkleTree.leaves).toHaveLength(8);
            expect(merkleTree.proof).toBeInstanceOf(Array);

            // Verify merkle proof for specific event
            const eventIndex = 3;
            const isValid = await digitalSignature.verifyMerkleProof(
                auditEvents[eventIndex],
                merkleTree.proof[eventIndex],
                merkleTree.root
            );

            expect(isValid).toBe(true);
        });
    });
});

describe('Performance and Scalability Tests', () => {
    let auditLogger;
    let testDb;

    beforeEach(async () => {
        testDb = await createTestDatabase();
        auditLogger = new AuditLogger({
            database: testDb,
            config: {
                batchSize: 1000,
                flushInterval: 5000,
                compressionEnabled: true
            }
        });
    });

    afterEach(async () => {
        await cleanupTestDatabase(testDb);
    });

    test('should handle high-volume audit logging', async () => {
        const startTime = Date.now();
        const eventCount = 10000;

        const events = Array.from({ length: eventCount }, (_, i) => 
            createMockAuditEvent({
                eventType: 'performance_test',
                userId: `user-${i % 100}`,
                metadata: { testIndex: i }
            })
        );

        const result = await auditLogger.logBatch(events);
        const endTime = Date.now();

        expect(result.success).toBe(true);
        expect(result.processedCount).toBe(eventCount);
        expect(endTime - startTime).toBeLessThan(30000); // Should complete within 30 seconds

        // Verify all events were logged
        const count = await testDb.query(
            'SELECT COUNT(*) as count FROM audit_logs WHERE event_type = $1',
            ['performance_test']
        );
        expect(parseInt(count.rows[0].count)).toBe(eventCount);
    });

    test('should efficiently query large audit datasets', async () => {
        // Insert large dataset
        const events = Array.from({ length: 5000 }, (_, i) => 
            createMockAuditEvent({
                eventType: 'query_test',
                userId: `user-${i % 50}`,
                workflowId: `workflow-${i % 100}`,
                created_at: new Date(Date.now() - (i * 60000)).toISOString() // Spread over time
            })
        );

        await auditLogger.logBatch(events);

        // Test query performance
        const startTime = Date.now();
        const results = await auditLogger.getEventsByType('query_test', {
            limit: 100,
            offset: 0,
            sortBy: 'created_at',
            sortOrder: 'desc'
        });
        const endTime = Date.now();

        expect(results.events).toHaveLength(100);
        expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should handle concurrent audit operations', async () => {
        const concurrentOperations = Array.from({ length: 10 }, (_, i) => 
            auditLogger.logBatch(
                Array.from({ length: 100 }, (_, j) => 
                    createMockAuditEvent({
                        eventType: 'concurrent_test',
                        userId: `user-${i}-${j}`,
                        metadata: { batchIndex: i, eventIndex: j }
                    })
                )
            )
        );

        const results = await Promise.all(concurrentOperations);

        // All operations should succeed
        results.forEach(result => {
            expect(result.success).toBe(true);
            expect(result.processedCount).toBe(100);
        });

        // Verify total count
        const totalCount = await testDb.query(
            'SELECT COUNT(*) as count FROM audit_logs WHERE event_type = $1',
            ['concurrent_test']
        );
        expect(parseInt(totalCount.rows[0].count)).toBe(1000);
    });
});

describe('Integration Tests', () => {
    let auditService;
    let testDb;

    beforeEach(async () => {
        testDb = await createTestDatabase();
        auditService = new AuditService({
            database: testDb,
            config: {
                enableRealTimeMonitoring: true,
                complianceStandards: ['SOX', 'PCI-DSS', 'GDPR']
            }
        });
    });

    afterEach(async () => {
        await cleanupTestDatabase(testDb);
    });

    test('should complete end-to-end audit workflow', async () => {
        // 1. Log approval action
        const auditEvent = createMockAuditEvent({
            eventType: 'approval_action',
            workflowId: 'integration-workflow-1',
            userId: 'integration-user-1',
            action: 'approve'
        });

        const logResult = await auditService.logEvent(auditEvent);
        expect(logResult.success).toBe(true);

        // 2. Generate audit trail
        const auditTrail = await auditService.getWorkflowAuditTrail('integration-workflow-1');
        expect(auditTrail).toHaveLength(1);

        // 3. Generate compliance report
        const complianceReport = await auditService.generateComplianceReport({
            type: 'workflow_audit',
            workflowId: 'integration-workflow-1'
        });
        expect(complianceReport.complianceScore).toBeGreaterThan(0);

        // 4. Verify data integrity
        const integrityCheck = await auditService.verifyDataIntegrity(logResult.auditId);
        expect(integrityCheck.isValid).toBe(true);

        // 5. Export audit data
        const exportResult = await auditService.exportAuditData({
            workflowId: 'integration-workflow-1',
            format: 'json'
        });
        expect(exportResult.success).toBe(true);
        expect(exportResult.data).toBeDefined();
    });
});

// Helper function to seed compliance test data
async function seedComplianceTestData(db) {
    const testWorkflows = [
        {
            id: 'workflow-1',
            transaction_id: 'TX-001',
            requester_id: 'user-1',
            status: 'approved',
            created_at: '2024-01-15T10:00:00Z',
            completed_at: '2024-01-15T12:00:00Z'
        },
        {
            id: 'workflow-2',
            transaction_id: 'TX-002',
            requester_id: 'user-2',
            status: 'rejected',
            created_at: '2024-01-16T09:00:00Z',
            completed_at: '2024-01-16T10:30:00Z'
        }
    ];

    for (const workflow of testWorkflows) {
        await db.query(`
            INSERT INTO approval_workflows (
                id, transaction_id, requester_id, total_levels, status, created_at, completed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            workflow.id,
            workflow.transaction_id,
            workflow.requester_id,
            2,
            workflow.status,
            workflow.created_at,
            workflow.completed_at
        ]);
    }
}