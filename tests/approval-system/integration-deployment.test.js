/**
 * FinBot v4 - Approval System Integration and Deployment Tests
 * 
 * Comprehensive test suite for system integration and deployment validation including:
 * - Integration with existing FinBot modules
 * - Docker container and service orchestration testing
 * - End-to-end workflow testing
 * - Health checks and monitoring validation
 * - Database migration and rollback testing
 * 
 * Requirements: All system integration requirements
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } = require('@jest/globals');
const request = require('supertest');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const Docker = require('dockerode');
const { Client } = require('pg');

const execAsync = promisify(exec);
const docker = new Docker();

describe('Approval System Integration Tests', () => {
    let app;
    let testDb;
    let authToken;

    beforeAll(async () => {
        // Start test application
        app = require('../../src/app');
        
        // Setup test database
        testDb = new Client({
            host: process.env.TEST_DB_HOST || 'localhost',
            port: process.env.TEST_DB_PORT || 5432,
            database: process.env.TEST_DB_NAME || 'finbot_test',
            user: process.env.TEST_DB_USER || 'postgres',
            password: process.env.TEST_DB_PASSWORD || 'password'
        });
        
        await testDb.connect();
        
        // Generate auth token
        const { generateJWT, createMockUser } = require('../helpers/auth-helper');
        authToken = generateJWT(createMockUser({ role: 'approver' }));
    });

    afterAll(async () => {
        await testDb.end();
    });

    describe('Integration with User Management System', () => {
        test('should integrate with existing user authentication', async () => {
            const response = await request(app)
                .get('/api/approval/workflows')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('workflows');
            expect(response.headers).toHaveProperty('x-user-id');
        });

        test('should sync user roles and permissions', async () => {
            // Create user in user management system
            const newUser = {
                email: 'integration-test@finbot.com',
                role: 'approver',
                permissions: ['approve_transactions', 'view_workflows']
            };

            const userResponse = await request(app)
                .post('/api/users')
                .set('Authorization', `Bearer ${authToken}`)
                .send(newUser)
                .expect(201);

            // Verify user can access approval system
            const userToken = generateJWT(userResponse.body.user);
            
            const approvalResponse = await request(app)
                .get('/api/approval/workflows')
                .set('Authorization', `Bearer ${userToken}`)
                .expect(200);

            expect(approvalResponse.body.workflows).toBeDefined();
        });

        test('should handle user role changes in real-time', async () => {
            const userId = 'integration-user-123';
            
            // Update user role
            await request(app)
                .put(`/api/users/${userId}/role`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ role: 'admin' })
                .expect(200);

            // Verify updated permissions are reflected immediately
            const updatedToken = generateJWT({ id: userId, role: 'admin' });
            
            const adminResponse = await request(app)
                .get('/api/approval/admin/rules')
                .set('Authorization', `Bearer ${updatedToken}`)
                .expect(200);

            expect(adminResponse.body.rules).toBeDefined();
        });
    });

    describe('Integration with Transaction Processing System', () => {
        test('should trigger approval workflows for transactions', async () => {
            const transaction = {
                id: 'tx-integration-123',
                amount: 5000,
                currency: 'USD',
                type: 'payment',
                description: 'Integration test transaction'
            };

            // Create transaction that should trigger approval
            const txResponse = await request(app)
                .post('/api/transactions')
                .set('Authorization', `Bearer ${authToken}`)
                .send(transaction)
                .expect(201);

            expect(txResponse.body.status).toBe('pending_approval');
            expect(txResponse.body.approvalWorkflowId).toBeDefined();

            // Verify approval workflow was created
            const workflowResponse = await request(app)
                .get(`/api/approval/workflows/${txResponse.body.approvalWorkflowId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(workflowResponse.body.transactionId).toBe(transaction.id);
        });

        test('should update transaction status after approval', async () => {
            const workflowId = 'workflow-integration-456';
            const transactionId = 'tx-integration-456';

            // Approve workflow
            await request(app)
                .post(`/api/approval/workflows/${workflowId}/action`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ action: 'approve', comment: 'Integration test approval' })
                .expect(200);

            // Verify transaction status updated
            const txResponse = await request(app)
                .get(`/api/transactions/${transactionId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(txResponse.body.status).toBe('approved');
            expect(txResponse.body.approvedAt).toBeDefined();
        });

        test('should handle transaction rejection', async () => {
            const workflowId = 'workflow-integration-789';
            const transactionId = 'tx-integration-789';

            // Reject workflow
            await request(app)
                .post(`/api/approval/workflows/${workflowId}/action`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ action: 'reject', comment: 'Integration test rejection' })
                .expect(200);

            // Verify transaction status updated
            const txResponse = await request(app)
                .get(`/api/transactions/${transactionId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(txResponse.body.status).toBe('rejected');
            expect(txResponse.body.rejectedAt).toBeDefined();
        });
    });

    describe('Integration with Notification System', () => {
        test('should send notifications for approval requests', async () => {
            const mockNotificationService = jest.fn();
            app.notificationService = { send: mockNotificationService };

            const workflowId = 'workflow-notification-123';

            // Create approval request
            await request(app)
                .post('/api/approval/workflows')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    transactionId: 'tx-notification-123',
                    amount: 1000,
                    approvers: ['approver-1', 'approver-2']
                })
                .expect(201);

            // Verify notifications were sent
            expect(mockNotificationService).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'approval_request',
                    recipients: ['approver-1', 'approver-2']
                })
            );
        });

        test('should send status update notifications', async () => {
            const mockNotificationService = jest.fn();
            app.notificationService = { send: mockNotificationService };

            const workflowId = 'workflow-status-123';

            // Approve workflow
            await request(app)
                .post(`/api/approval/workflows/${workflowId}/action`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ action: 'approve' })
                .expect(200);

            // Verify status notification was sent
            expect(mockNotificationService).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'approval_status_update',
                    status: 'approved'
                })
            );
        });
    });

    describe('Integration with Audit System', () => {
        test('should log all approval actions to audit trail', async () => {
            const workflowId = 'workflow-audit-123';

            // Perform approval action
            await request(app)
                .post(`/api/approval/workflows/${workflowId}/action`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ action: 'approve', comment: 'Audit test' })
                .expect(200);

            // Verify audit log entry
            const auditResponse = await request(app)
                .get(`/api/audit/logs?entity_type=approval_workflow&entity_id=${workflowId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(auditResponse.body.logs).toHaveLength(1);
            expect(auditResponse.body.logs[0].action).toBe('approve');
            expect(auditResponse.body.logs[0].comment).toBe('Audit test');
        });

        test('should maintain audit trail integrity', async () => {
            const auditResponse = await request(app)
                .get('/api/audit/integrity-check')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(auditResponse.body.integrity).toBe('valid');
            expect(auditResponse.body.checksumValid).toBe(true);
        });
    });

    describe('End-to-End Workflow Testing', () => {
        test('should complete full approval workflow', async () => {
            // Step 1: Create transaction requiring approval
            const transaction = {
                id: 'tx-e2e-123',
                amount: 10000,
                currency: 'USD',
                description: 'E2E test transaction'
            };

            const txResponse = await request(app)
                .post('/api/transactions')
                .set('Authorization', `Bearer ${authToken}`)
                .send(transaction)
                .expect(201);

            const workflowId = txResponse.body.approvalWorkflowId;

            // Step 2: First level approval
            await request(app)
                .post(`/api/approval/workflows/${workflowId}/action`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ action: 'approve', comment: 'First level approval' })
                .expect(200);

            // Step 3: Check workflow status
            let workflowResponse = await request(app)
                .get(`/api/approval/workflows/${workflowId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(workflowResponse.body.currentLevel).toBe(2);
            expect(workflowResponse.body.status).toBe('pending');

            // Step 4: Second level approval
            const secondApproverToken = generateJWT(createMockUser({ role: 'senior_approver' }));
            
            await request(app)
                .post(`/api/approval/workflows/${workflowId}/action`)
                .set('Authorization', `Bearer ${secondApproverToken}`)
                .send({ action: 'approve', comment: 'Final approval' })
                .expect(200);

            // Step 5: Verify workflow completion
            workflowResponse = await request(app)
                .get(`/api/approval/workflows/${workflowId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(workflowResponse.body.status).toBe('approved');
            expect(workflowResponse.body.completedAt).toBeDefined();

            // Step 6: Verify transaction status
            const finalTxResponse = await request(app)
                .get(`/api/transactions/${transaction.id}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(finalTxResponse.body.status).toBe('approved');
        });

        test('should handle workflow escalation', async () => {
            const workflowId = 'workflow-escalation-123';

            // Wait for escalation timeout (simulated)
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Trigger escalation check
            await request(app)
                .post('/api/approval/workflows/check-escalations')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            // Verify workflow was escalated
            const workflowResponse = await request(app)
                .get(`/api/approval/workflows/${workflowId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(workflowResponse.body.escalated).toBe(true);
            expect(workflowResponse.body.escalatedTo).toBeDefined();
        });
    });
});

describe('Approval System Deployment Tests', () => {
    let containers = [];

    afterAll(async () => {
        // Cleanup containers
        for (const container of containers) {
            try {
                await container.stop();
                await container.remove();
            } catch (error) {
                console.warn('Failed to cleanup container:', error.message);
            }
        }
    });

    describe('Docker Container Testing', () => {
        test('should build Docker image successfully', async () => {
            const { stdout } = await execAsync('docker build -t finbot-approval-test .');
            expect(stdout).toContain('Successfully built');
        });

        test('should start container with correct environment', async () => {
            const container = await docker.createContainer({
                Image: 'finbot-approval-test',
                Env: [
                    'NODE_ENV=test',
                    'DATABASE_URL=postgresql://test:test@localhost:5432/finbot_test',
                    'REDIS_URL=redis://localhost:6379'
                ],
                ExposedPorts: { '3001/tcp': {} },
                HostConfig: {
                    PortBindings: { '3001/tcp': [{ HostPort: '3001' }] }
                }
            });

            containers.push(container);
            await container.start();

            // Wait for container to be ready
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Test health endpoint
            const response = await request('http://localhost:3001')
                .get('/health')
                .expect(200);

            expect(response.body.status).toBe('healthy');
        });

        test('should handle container restart gracefully', async () => {
            const container = containers[containers.length - 1];
            
            // Restart container
            await container.restart();
            
            // Wait for restart
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Verify service is available
            const response = await request('http://localhost:3001')
                .get('/health')
                .expect(200);

            expect(response.body.status).toBe('healthy');
        });
    });

    describe('Service Orchestration Testing', () => {
        test('should start all services with docker-compose', async () => {
            const { stdout } = await execAsync('docker-compose -f docker-compose.test.yml up -d');
            expect(stdout).toContain('Creating');

            // Wait for services to be ready
            await new Promise(resolve => setTimeout(resolve, 10000));

            // Test service connectivity
            const services = ['api', 'database', 'redis'];
            
            for (const service of services) {
                const { stdout: psOutput } = await execAsync('docker-compose -f docker-compose.test.yml ps');
                expect(psOutput).toContain(service);
                expect(psOutput).toContain('Up');
            }
        });

        test('should handle service dependencies correctly', async () => {
            // API should wait for database to be ready
            const { stdout } = await execAsync('docker-compose -f docker-compose.test.yml logs api');
            expect(stdout).toContain('Database connection established');
            expect(stdout).toContain('Server started on port 3001');
        });

        test('should scale services horizontally', async () => {
            await execAsync('docker-compose -f docker-compose.test.yml up -d --scale api=3');
            
            const { stdout } = await execAsync('docker-compose -f docker-compose.test.yml ps api');
            const apiInstances = stdout.split('\n').filter(line => line.includes('api')).length;
            
            expect(apiInstances).toBe(3);
        });
    });

    describe('Health Checks and Monitoring', () => {
        test('should respond to health check endpoint', async () => {
            const response = await request('http://localhost:3001')
                .get('/health')
                .expect(200);

            expect(response.body).toMatchObject({
                status: 'healthy',
                service: 'approval-system',
                version: expect.any(String),
                timestamp: expect.any(String)
            });
        });

        test('should provide detailed health information', async () => {
            const response = await request('http://localhost:3001')
                .get('/health/detailed')
                .expect(200);

            expect(response.body).toHaveProperty('database');
            expect(response.body).toHaveProperty('redis');
            expect(response.body).toHaveProperty('memory');
            expect(response.body).toHaveProperty('uptime');
        });

        test('should expose metrics endpoint', async () => {
            const response = await request('http://localhost:3001')
                .get('/metrics')
                .expect(200);

            expect(response.text).toContain('approval_requests_total');
            expect(response.text).toContain('approval_processing_duration');
            expect(response.text).toContain('nodejs_memory_usage');
        });

        test('should handle graceful shutdown', async () => {
            const container = containers[containers.length - 1];
            
            // Send SIGTERM
            await container.kill({ signal: 'SIGTERM' });
            
            // Wait for graceful shutdown
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            const containerInfo = await container.inspect();
            expect(containerInfo.State.Status).toBe('exited');
            expect(containerInfo.State.ExitCode).toBe(0);
        });
    });

    describe('Database Migration Testing', () => {
        test('should run database migrations on startup', async () => {
            const { stdout } = await execAsync('docker-compose -f docker-compose.test.yml logs api');
            expect(stdout).toContain('Running database migrations');
            expect(stdout).toContain('Migrations completed successfully');
        });

        test('should handle migration rollback', async () => {
            // Run rollback command
            const { stdout } = await execAsync(
                'docker-compose -f docker-compose.test.yml exec api npm run db:rollback'
            );
            
            expect(stdout).toContain('Rollback completed');
        });

        test('should validate database schema after migration', async () => {
            const response = await request('http://localhost:3001')
                .get('/admin/db-schema-validation')
                .expect(200);

            expect(response.body.valid).toBe(true);
            expect(response.body.tables).toContain('approval_workflows');
            expect(response.body.tables).toContain('approval_actions');
            expect(response.body.tables).toContain('approval_rules');
        });
    });

    describe('Load Balancer and High Availability', () => {
        test('should distribute load across multiple instances', async () => {
            const requests = Array.from({ length: 100 }, () =>
                request('http://localhost:3001')
                    .get('/health')
            );

            const responses = await Promise.all(requests);
            
            // All requests should succeed
            expect(responses.every(r => r.status === 200)).toBe(true);
            
            // Responses should come from different instances
            const instanceIds = responses.map(r => r.body.instanceId);
            const uniqueInstances = new Set(instanceIds);
            
            expect(uniqueInstances.size).toBeGreaterThan(1);
        });

        test('should handle instance failure gracefully', async () => {
            // Stop one instance
            const container = containers[0];
            await container.stop();
            
            // Requests should still succeed with remaining instances
            const response = await request('http://localhost:3001')
                .get('/health')
                .expect(200);

            expect(response.body.status).toBe('healthy');
        });

        test('should auto-recover failed instances', async () => {
            // Restart the stopped instance
            const container = containers[0];
            await container.start();
            
            // Wait for recovery
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Instance should be healthy again
            const response = await request('http://localhost:3001')
                .get('/health')
                .expect(200);

            expect(response.body.status).toBe('healthy');
        });
    });

    describe('Security and Configuration Testing', () => {
        test('should use secure configuration in production', async () => {
            const { stdout } = await execAsync(
                'docker-compose -f docker-compose.prod.yml config'
            );
            
            expect(stdout).toContain('NODE_ENV=production');
            expect(stdout).not.toContain('DEBUG=true');
        });

        test('should have proper file permissions', async () => {
            const { stdout } = await execAsync(
                'docker-compose -f docker-compose.test.yml exec api ls -la /app'
            );
            
            // Application files should not be writable by others
            expect(stdout).not.toMatch(/^.{7}w/m);
        });

        test('should run as non-root user', async () => {
            const { stdout } = await execAsync(
                'docker-compose -f docker-compose.test.yml exec api whoami'
            );
            
            expect(stdout.trim()).not.toBe('root');
        });

        test('should have security headers configured', async () => {
            const response = await request('http://localhost:3001')
                .get('/health');

            expect(response.headers['x-content-type-options']).toBe('nosniff');
            expect(response.headers['x-frame-options']).toBe('DENY');
            expect(response.headers['x-xss-protection']).toBe('1; mode=block');
        });
    });

    describe('Backup and Recovery Testing', () => {
        test('should create database backup', async () => {
            const { stdout } = await execAsync(
                'docker-compose -f docker-compose.test.yml exec database pg_dump -U postgres finbot_test'
            );
            
            expect(stdout).toContain('PostgreSQL database dump');
            expect(stdout).toContain('approval_workflows');
        });

        test('should restore from backup', async () => {
            // Create test data
            await request('http://localhost:3001')
                .post('/api/approval/workflows')
                .send({ transactionId: 'backup-test-123' })
                .expect(201);

            // Create backup
            await execAsync(
                'docker-compose -f docker-compose.test.yml exec database pg_dump -U postgres finbot_test > backup.sql'
            );

            // Clear database
            await execAsync(
                'docker-compose -f docker-compose.test.yml exec database psql -U postgres -c "DROP DATABASE finbot_test; CREATE DATABASE finbot_test;"'
            );

            // Restore from backup
            await execAsync(
                'docker-compose -f docker-compose.test.yml exec database psql -U postgres finbot_test < backup.sql'
            );

            // Verify data restored
            const response = await request('http://localhost:3001')
                .get('/api/approval/workflows/backup-test-123')
                .expect(200);

            expect(response.body.transactionId).toBe('backup-test-123');
        });
    });
});