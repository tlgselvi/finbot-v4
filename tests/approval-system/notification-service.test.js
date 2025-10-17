/**
 * FinBot v4 - Approval System Notification Service Tests
 * 
 * Comprehensive test suite for notification service functionality including:
 * - Multi-channel notification delivery (email, SMS, in-app, push)
 * - Template rendering and personalization
 * - Retry mechanisms and failure handling
 * - Notification queue management
 * - Integration with external service providers
 * 
 * Requirements: 1.5, 5.1
 */

const { describe, test, expect, beforeEach, afterEach, jest } = require('@jest/globals');
const NotificationService = require('../../src/services/notification-service');
const EmailProvider = require('../../src/providers/email-provider');
const SMSProvider = require('../../src/providers/sms-provider');
const PushProvider = require('../../src/providers/push-provider');
const InAppProvider = require('../../src/providers/in-app-provider');
const NotificationQueue = require('../../src/queues/notification-queue');
const NotificationTemplate = require('../../src/templates/notification-template');
const { createTestDatabase, cleanupTestDatabase } = require('../helpers/database-helper');
const { createMockWorkflow, createMockUser } = require('../helpers/approval-helper');

describe('NotificationService', () => {
    let notificationService;
    let mockEmailProvider;
    let mockSMSProvider;
    let mockPushProvider;
    let mockInAppProvider;
    let mockQueue;
    let testDb;

    beforeEach(async () => {
        // Setup test database
        testDb = await createTestDatabase();

        // Create mock providers
        mockEmailProvider = {
            send: jest.fn().mockResolvedValue({ success: true, messageId: 'email-123' }),
            validateConfig: jest.fn().mockReturnValue(true),
            getDeliveryStatus: jest.fn().mockResolvedValue('delivered')
        };

        mockSMSProvider = {
            send: jest.fn().mockResolvedValue({ success: true, messageId: 'sms-123' }),
            validateConfig: jest.fn().mockReturnValue(true),
            getDeliveryStatus: jest.fn().mockResolvedValue('delivered')
        };

        mockPushProvider = {
            send: jest.fn().mockResolvedValue({ success: true, messageId: 'push-123' }),
            validateConfig: jest.fn().mockReturnValue(true),
            getDeliveryStatus: jest.fn().mockResolvedValue('delivered')
        };

        mockInAppProvider = {
            send: jest.fn().mockResolvedValue({ success: true, messageId: 'inapp-123' }),
            validateConfig: jest.fn().mockReturnValue(true),
            markAsRead: jest.fn().mockResolvedValue(true)
        };

        mockQueue = {
            add: jest.fn().mockResolvedValue({ id: 'job-123' }),
            process: jest.fn(),
            getJob: jest.fn(),
            getWaiting: jest.fn().mockResolvedValue([]),
            getFailed: jest.fn().mockResolvedValue([]),
            clean: jest.fn().mockResolvedValue(0)
        };

        // Initialize notification service with mocks
        notificationService = new NotificationService({
            database: testDb,
            providers: {
                email: mockEmailProvider,
                sms: mockSMSProvider,
                push: mockPushProvider,
                inApp: mockInAppProvider
            },
            queue: mockQueue,
            config: {
                retryAttempts: 3,
                retryDelay: 1000,
                batchSize: 10,
                rateLimits: {
                    email: { perMinute: 100 },
                    sms: { perMinute: 50 },
                    push: { perMinute: 1000 }
                }
            }
        });
    });

    afterEach(async () => {
        await cleanupTestDatabase(testDb);
        jest.clearAllMocks();
    });

    describe('Notification Creation and Queuing', () => {
        test('should create and queue approval request notification', async () => {
            const workflow = createMockWorkflow({
                id: 'workflow-123',
                transaction_id: 'tx-456',
                requester_id: 'user-789',
                status: 'pending'
            });

            const approver = createMockUser({
                id: 'approver-123',
                email: 'approver@finbot.com',
                phone: '+1234567890',
                preferences: {
                    notifications: {
                        email: true,
                        sms: false,
                        push: true,
                        inApp: true
                    }
                }
            });

            const result = await notificationService.createApprovalRequest({
                workflow,
                approver,
                channels: ['email', 'push', 'inApp']
            });

            expect(result.success).toBe(true);
            expect(result.notifications).toHaveLength(3);
            expect(mockQueue.add).toHaveBeenCalledTimes(3);

            // Verify notification records created in database
            const notifications = await testDb.query(
                'SELECT * FROM approval_notifications WHERE workflow_id = $1',
                [workflow.id]
            );
            expect(notifications.rows).toHaveLength(3);
        });

        test('should respect user notification preferences', async () => {
            const workflow = createMockWorkflow();
            const approver = createMockUser({
                preferences: {
                    notifications: {
                        email: false,
                        sms: false,
                        push: true,
                        inApp: true
                    }
                }
            });

            const result = await notificationService.createApprovalRequest({
                workflow,
                approver,
                channels: ['email', 'sms', 'push', 'inApp']
            });

            expect(result.notifications).toHaveLength(2); // Only push and inApp
            expect(result.notifications.every(n => ['push', 'inApp'].includes(n.channel))).toBe(true);
        });

        test('should handle batch notification creation', async () => {
            const workflow = createMockWorkflow();
            const approvers = Array.from({ length: 5 }, (_, i) => 
                createMockUser({ id: `approver-${i}` })
            );

            const result = await notificationService.createBatchNotifications({
                workflow,
                approvers,
                notificationType: 'approval_request',
                channels: ['email', 'inApp']
            });

            expect(result.success).toBe(true);
            expect(result.totalNotifications).toBe(10); // 5 approvers × 2 channels
            expect(mockQueue.add).toHaveBeenCalledTimes(10);
        });
    });

    describe('Template Rendering and Personalization', () => {
        test('should render email template with workflow data', async () => {
            const workflow = createMockWorkflow({
                transaction_id: 'TX-12345',
                metadata: {
                    amount: 5000,
                    currency: 'USD',
                    description: 'Office equipment purchase'
                }
            });

            const approver = createMockUser({
                name: 'John Approver',
                email: 'john@finbot.com'
            });

            const template = await notificationService.renderTemplate({
                type: 'approval_request',
                channel: 'email',
                data: { workflow, approver }
            });

            expect(template.subject).toContain('Approval Required');
            expect(template.subject).toContain('TX-12345');
            expect(template.body).toContain('John Approver');
            expect(template.body).toContain('$5,000.00');
            expect(template.body).toContain('Office equipment purchase');
        });

        test('should render SMS template with character limit', async () => {
            const workflow = createMockWorkflow({
                transaction_id: 'TX-12345',
                metadata: { amount: 1500, currency: 'USD' }
            });

            const template = await notificationService.renderTemplate({
                type: 'approval_request',
                channel: 'sms',
                data: { workflow }
            });

            expect(template.body.length).toBeLessThanOrEqual(160);
            expect(template.body).toContain('TX-12345');
            expect(template.body).toContain('$1,500');
        });

        test('should handle template rendering errors gracefully', async () => {
            const invalidData = { workflow: null };

            const result = await notificationService.renderTemplate({
                type: 'approval_request',
                channel: 'email',
                data: invalidData
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('template rendering');
        });

        test('should support custom template variables', async () => {
            const workflow = createMockWorkflow();
            const customData = {
                companyName: 'FinBot Corp',
                urgencyLevel: 'High',
                deadline: '2024-01-15'
            };

            const template = await notificationService.renderTemplate({
                type: 'approval_request',
                channel: 'email',
                data: { workflow, ...customData }
            });

            expect(template.body).toContain('FinBot Corp');
            expect(template.body).toContain('High');
            expect(template.body).toContain('2024-01-15');
        });
    });

    describe('Multi-Channel Delivery', () => {
        test('should deliver email notification successfully', async () => {
            const notification = {
                id: 'notif-123',
                channel: 'email',
                recipient_id: 'user-456',
                subject: 'Approval Required',
                message: 'Please review the pending approval request.',
                metadata: {
                    to: 'user@finbot.com',
                    from: 'noreply@finbot.com'
                }
            };

            const result = await notificationService.deliverNotification(notification);

            expect(result.success).toBe(true);
            expect(result.messageId).toBe('email-123');
            expect(mockEmailProvider.send).toHaveBeenCalledWith({
                to: 'user@finbot.com',
                from: 'noreply@finbot.com',
                subject: 'Approval Required',
                body: 'Please review the pending approval request.'
            });

            // Verify database update
            const updatedNotification = await testDb.query(
                'SELECT * FROM approval_notifications WHERE id = $1',
                [notification.id]
            );
            expect(updatedNotification.rows[0].status).toBe('sent');
        });

        test('should deliver SMS notification successfully', async () => {
            const notification = {
                id: 'notif-456',
                channel: 'sms',
                recipient_id: 'user-789',
                message: 'Approval needed for TX-12345. Amount: $5,000. Reply APPROVE or REJECT.',
                metadata: {
                    to: '+1234567890',
                    from: '+1987654321'
                }
            };

            const result = await notificationService.deliverNotification(notification);

            expect(result.success).toBe(true);
            expect(mockSMSProvider.send).toHaveBeenCalledWith({
                to: '+1234567890',
                from: '+1987654321',
                body: 'Approval needed for TX-12345. Amount: $5,000. Reply APPROVE or REJECT.'
            });
        });

        test('should deliver push notification successfully', async () => {
            const notification = {
                id: 'notif-789',
                channel: 'push',
                recipient_id: 'user-123',
                subject: 'Approval Required',
                message: 'New approval request awaiting your review.',
                metadata: {
                    deviceTokens: ['token1', 'token2'],
                    badge: 1,
                    sound: 'default'
                }
            };

            const result = await notificationService.deliverNotification(notification);

            expect(result.success).toBe(true);
            expect(mockPushProvider.send).toHaveBeenCalledWith({
                tokens: ['token1', 'token2'],
                title: 'Approval Required',
                body: 'New approval request awaiting your review.',
                badge: 1,
                sound: 'default'
            });
        });

        test('should deliver in-app notification successfully', async () => {
            const notification = {
                id: 'notif-101',
                channel: 'inApp',
                recipient_id: 'user-202',
                subject: 'Approval Required',
                message: 'Please review the pending approval request.',
                metadata: {
                    priority: 'high',
                    category: 'approval'
                }
            };

            const result = await notificationService.deliverNotification(notification);

            expect(result.success).toBe(true);
            expect(mockInAppProvider.send).toHaveBeenCalledWith({
                userId: 'user-202',
                title: 'Approval Required',
                body: 'Please review the pending approval request.',
                priority: 'high',
                category: 'approval'
            });
        });
    });

    describe('Retry Mechanisms and Failure Handling', () => {
        test('should retry failed notifications', async () => {
            mockEmailProvider.send
                .mockRejectedValueOnce(new Error('Temporary failure'))
                .mockResolvedValueOnce({ success: true, messageId: 'email-retry-123' });

            const notification = {
                id: 'notif-retry-1',
                channel: 'email',
                recipient_id: 'user-456',
                subject: 'Test',
                message: 'Test message',
                metadata: { to: 'test@finbot.com' }
            };

            const result = await notificationService.deliverNotification(notification);

            expect(result.success).toBe(true);
            expect(mockEmailProvider.send).toHaveBeenCalledTimes(2);
        });

        test('should handle permanent failures after max retries', async () => {
            mockSMSProvider.send.mockRejectedValue(new Error('Invalid phone number'));

            const notification = {
                id: 'notif-fail-1',
                channel: 'sms',
                recipient_id: 'user-789',
                message: 'Test SMS',
                metadata: { to: 'invalid-phone' }
            };

            const result = await notificationService.deliverNotification(notification);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid phone number');
            expect(mockSMSProvider.send).toHaveBeenCalledTimes(3); // Initial + 2 retries
        });

        test('should implement exponential backoff for retries', async () => {
            const startTime = Date.now();
            mockPushProvider.send
                .mockRejectedValueOnce(new Error('Rate limit exceeded'))
                .mockRejectedValueOnce(new Error('Rate limit exceeded'))
                .mockResolvedValueOnce({ success: true, messageId: 'push-backoff-123' });

            const notification = {
                id: 'notif-backoff-1',
                channel: 'push',
                recipient_id: 'user-123',
                message: 'Test push',
                metadata: { deviceTokens: ['token1'] }
            };

            const result = await notificationService.deliverNotification(notification);
            const endTime = Date.now();

            expect(result.success).toBe(true);
            expect(endTime - startTime).toBeGreaterThan(3000); // Should have delays
            expect(mockPushProvider.send).toHaveBeenCalledTimes(3);
        });

        test('should handle provider-specific error codes', async () => {
            const providerError = new Error('Provider error');
            providerError.code = 'INVALID_RECIPIENT';
            providerError.permanent = true;

            mockEmailProvider.send.mockRejectedValue(providerError);

            const notification = {
                id: 'notif-provider-error',
                channel: 'email',
                recipient_id: 'user-456',
                message: 'Test',
                metadata: { to: 'invalid@email' }
            };

            const result = await notificationService.deliverNotification(notification);

            expect(result.success).toBe(false);
            expect(result.permanent).toBe(true);
            expect(mockEmailProvider.send).toHaveBeenCalledTimes(1); // No retries for permanent errors
        });
    });

    describe('Notification Queue Management', () => {
        test('should process notification queue in batches', async () => {
            const notifications = Array.from({ length: 25 }, (_, i) => ({
                id: `notif-batch-${i}`,
                channel: 'email',
                recipient_id: `user-${i}`,
                message: `Test message ${i}`,
                metadata: { to: `user${i}@finbot.com` }
            }));

            await notificationService.processBatch(notifications);

            expect(mockEmailProvider.send).toHaveBeenCalledTimes(25);
            expect(mockQueue.add).toHaveBeenCalledTimes(25);
        });

        test('should respect rate limits per channel', async () => {
            const emailNotifications = Array.from({ length: 150 }, (_, i) => ({
                id: `email-${i}`,
                channel: 'email',
                recipient_id: `user-${i}`,
                message: 'Test',
                metadata: { to: `user${i}@finbot.com` }
            }));

            const startTime = Date.now();
            await notificationService.processBatch(emailNotifications);
            const endTime = Date.now();

            // Should take at least 30 seconds due to rate limiting (100 per minute)
            expect(endTime - startTime).toBeGreaterThan(30000);
        });

        test('should prioritize high-priority notifications', async () => {
            const notifications = [
                { id: 'low-1', priority: 1, channel: 'email' },
                { id: 'high-1', priority: 5, channel: 'email' },
                { id: 'medium-1', priority: 3, channel: 'email' },
                { id: 'high-2', priority: 5, channel: 'email' }
            ];

            const processOrder = [];
            mockEmailProvider.send.mockImplementation((data) => {
                processOrder.push(data.notificationId);
                return Promise.resolve({ success: true });
            });

            await notificationService.processBatch(notifications);

            expect(processOrder[0]).toMatch(/high-/);
            expect(processOrder[1]).toMatch(/high-/);
            expect(processOrder[2]).toMatch(/medium-/);
            expect(processOrder[3]).toMatch(/low-/);
        });

        test('should handle queue cleanup and maintenance', async () => {
            await notificationService.cleanupQueue({
                removeCompleted: true,
                removeFailedAfter: 24 * 60 * 60 * 1000, // 24 hours
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

            expect(mockQueue.clean).toHaveBeenCalledWith(24 * 60 * 60 * 1000, 'failed');
            expect(mockQueue.clean).toHaveBeenCalledWith(7 * 24 * 60 * 60 * 1000, 'completed');
        });
    });

    describe('Delivery Status Tracking', () => {
        test('should track notification delivery status', async () => {
            const notificationId = 'notif-status-1';
            
            // Mock provider status check
            mockEmailProvider.getDeliveryStatus.mockResolvedValue('delivered');

            const status = await notificationService.getDeliveryStatus(notificationId);

            expect(status.status).toBe('delivered');
            expect(mockEmailProvider.getDeliveryStatus).toHaveBeenCalledWith('email-123');
        });

        test('should handle webhook delivery confirmations', async () => {
            const webhookData = {
                messageId: 'email-webhook-123',
                status: 'delivered',
                timestamp: new Date().toISOString(),
                recipient: 'user@finbot.com'
            };

            const result = await notificationService.handleDeliveryWebhook(webhookData);

            expect(result.success).toBe(true);
            
            // Verify database update
            const notification = await testDb.query(
                'SELECT * FROM approval_notifications WHERE message_id = $1',
                ['email-webhook-123']
            );
            expect(notification.rows[0].status).toBe('delivered');
        });

        test('should generate delivery reports', async () => {
            const report = await notificationService.generateDeliveryReport({
                startDate: '2024-01-01',
                endDate: '2024-01-31',
                channels: ['email', 'sms'],
                groupBy: 'channel'
            });

            expect(report).toHaveProperty('totalSent');
            expect(report).toHaveProperty('deliveryRate');
            expect(report).toHaveProperty('channelBreakdown');
            expect(report.channelBreakdown).toHaveProperty('email');
            expect(report.channelBreakdown).toHaveProperty('sms');
        });
    });

    describe('Integration with External Providers', () => {
        test('should handle SendGrid email provider integration', async () => {
            const sendGridProvider = new EmailProvider({
                type: 'sendgrid',
                apiKey: 'test-api-key',
                fromEmail: 'noreply@finbot.com'
            });

            notificationService.registerProvider('email', sendGridProvider);

            const notification = {
                channel: 'email',
                recipient_id: 'user-123',
                subject: 'Test SendGrid',
                message: 'Test message',
                metadata: { to: 'test@finbot.com' }
            };

            // Mock SendGrid API response
            sendGridProvider.send = jest.fn().mockResolvedValue({
                success: true,
                messageId: 'sg-123'
            });

            const result = await notificationService.deliverNotification(notification);

            expect(result.success).toBe(true);
            expect(sendGridProvider.send).toHaveBeenCalled();
        });

        test('should handle Twilio SMS provider integration', async () => {
            const twilioProvider = new SMSProvider({
                type: 'twilio',
                accountSid: 'test-sid',
                authToken: 'test-token',
                fromNumber: '+1987654321'
            });

            notificationService.registerProvider('sms', twilioProvider);

            const notification = {
                channel: 'sms',
                recipient_id: 'user-456',
                message: 'Test Twilio SMS',
                metadata: { to: '+1234567890' }
            };

            twilioProvider.send = jest.fn().mockResolvedValue({
                success: true,
                messageId: 'twilio-123'
            });

            const result = await notificationService.deliverNotification(notification);

            expect(result.success).toBe(true);
            expect(twilioProvider.send).toHaveBeenCalled();
        });

        test('should handle Firebase push notification integration', async () => {
            const firebaseProvider = new PushProvider({
                type: 'firebase',
                serverKey: 'test-server-key',
                projectId: 'finbot-project'
            });

            notificationService.registerProvider('push', firebaseProvider);

            const notification = {
                channel: 'push',
                recipient_id: 'user-789',
                subject: 'Test Firebase Push',
                message: 'Test push notification',
                metadata: { deviceTokens: ['firebase-token-123'] }
            };

            firebaseProvider.send = jest.fn().mockResolvedValue({
                success: true,
                messageId: 'firebase-123'
            });

            const result = await notificationService.deliverNotification(notification);

            expect(result.success).toBe(true);
            expect(firebaseProvider.send).toHaveBeenCalled();
        });
    });

    describe('Performance and Scalability', () => {
        test('should handle high-volume notification processing', async () => {
            const notifications = Array.from({ length: 1000 }, (_, i) => ({
                id: `perf-test-${i}`,
                channel: 'email',
                recipient_id: `user-${i}`,
                message: `Performance test ${i}`,
                metadata: { to: `user${i}@finbot.com` }
            }));

            const startTime = Date.now();
            await notificationService.processBatch(notifications);
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(30000); // Should complete within 30 seconds
            expect(mockEmailProvider.send).toHaveBeenCalledTimes(1000);
        });

        test('should implement connection pooling for database operations', async () => {
            const dbSpy = jest.spyOn(testDb, 'query');
            
            const notifications = Array.from({ length: 100 }, (_, i) => ({
                id: `pool-test-${i}`,
                channel: 'email'
            }));

            await notificationService.processBatch(notifications);

            // Should reuse connections efficiently
            expect(dbSpy).toHaveBeenCalled();
            expect(testDb.pool.totalCount).toBeLessThan(20); // Connection pool limit
        });

        test('should handle memory usage efficiently for large batches', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            const largeNotifications = Array.from({ length: 10000 }, (_, i) => ({
                id: `memory-test-${i}`,
                channel: 'email',
                message: 'A'.repeat(1000), // 1KB message
                metadata: { to: `user${i}@finbot.com` }
            }));

            await notificationService.processBatch(largeNotifications);

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            // Memory increase should be reasonable (less than 100MB)
            expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
        });
    });

    describe('Error Handling and Monitoring', () => {
        test('should log notification errors for monitoring', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            
            mockEmailProvider.send.mockRejectedValue(new Error('Provider unavailable'));

            const notification = {
                id: 'error-test-1',
                channel: 'email',
                message: 'Test error handling'
            };

            await notificationService.deliverNotification(notification);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Notification delivery failed'),
                expect.any(Object)
            );

            consoleSpy.mockRestore();
        });

        test('should emit metrics for notification processing', async () => {
            const metricsSpy = jest.spyOn(notificationService, 'emitMetric');

            const notification = {
                id: 'metrics-test-1',
                channel: 'email',
                message: 'Test metrics'
            };

            await notificationService.deliverNotification(notification);

            expect(metricsSpy).toHaveBeenCalledWith('notification.sent', 1, {
                channel: 'email',
                success: true
            });
        });

        test('should handle graceful shutdown', async () => {
            const shutdownPromise = notificationService.shutdown();

            expect(mockQueue.close).toHaveBeenCalled();
            
            await shutdownPromise;
            
            expect(notificationService.isShuttingDown).toBe(true);
        });
    });
});

/**
 * Integration Tests for Notification Service
 * Tests the complete notification workflow with real database and queue
 */
describe('NotificationService Integration Tests', () => {
    let notificationService;
    let realDb;

    beforeEach(async () => {
        realDb = await createTestDatabase();
        notificationService = new NotificationService({
            database: realDb,
            config: {
                providers: {
                    email: { type: 'mock' },
                    sms: { type: 'mock' }
                }
            }
        });
    });

    afterEach(async () => {
        await cleanupTestDatabase(realDb);
    });

    test('should complete end-to-end notification workflow', async () => {
        // Create test workflow
        const workflow = await realDb.query(`
            INSERT INTO approval_workflows (
                id, transaction_id, requester_id, total_levels, status
            ) VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, ['workflow-e2e-1', 'tx-e2e-1', 'user-e2e-1', 2, 'pending']);

        // Create approval request notification
        const result = await notificationService.createApprovalRequest({
            workflow: workflow.rows[0],
            approver: { id: 'approver-e2e-1', email: 'approver@finbot.com' },
            channels: ['email', 'inApp']
        });

        expect(result.success).toBe(true);

        // Verify notifications were created in database
        const notifications = await realDb.query(
            'SELECT * FROM approval_notifications WHERE workflow_id = $1',
            ['workflow-e2e-1']
        );

        expect(notifications.rows).toHaveLength(2);
        expect(notifications.rows.every(n => n.status === 'pending')).toBe(true);

        // Process the notification queue
        await notificationService.processQueue();

        // Verify notifications were processed
        const processedNotifications = await realDb.query(
            'SELECT * FROM approval_notifications WHERE workflow_id = $1',
            ['workflow-e2e-1']
        );

        expect(processedNotifications.rows.every(n => n.status === 'sent')).toBe(true);
    });
});