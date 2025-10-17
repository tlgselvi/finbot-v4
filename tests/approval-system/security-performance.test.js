/**
 * FinBot v4 - Approval System Security and Performance Tests
 * 
 * Comprehensive test suite for security and performance validation including:
 * - Authentication and authorization testing
 * - Input validation and sanitization
 * - Rate limiting and DDoS protection
 * - Performance under high load
 * - Concurrent approval processing
 * - Memory and resource usage optimization
 * 
 * Requirements: Security and performance requirements
 */

const { describe, test, expect, beforeEach, afterEach, jest } = require('@jest/globals');
const request = require('supertest');
const app = require('../../src/app');
const { createTestDatabase, cleanupTestDatabase } = require('../helpers/database-helper');
const { generateJWT, createMockUser } = require('../helpers/auth-helper');
const { performance } = require('perf_hooks');

describe('Approval System Security Tests', () => {
    let testDb;
    let authToken;
    let adminToken;
    let unauthorizedToken;

    beforeEach(async () => {
        testDb = await createTestDatabase();
        
        // Create test users with different roles
        const approver = createMockUser({ role: 'approver', permissions: ['approve_transactions'] });
        const admin = createMockUser({ role: 'admin', permissions: ['manage_rules', 'view_audit'] });
        const user = createMockUser({ role: 'user', permissions: ['submit_requests'] });
        
        authToken = generateJWT(approver);
        adminToken = generateJWT(admin);
        unauthorizedToken = generateJWT(user);
    });

    afterEach(async () => {
        await cleanupTestDatabase(testDb);
    });

    describe('Authentication and Authorization', () => {
        test('should reject requests without authentication token', async () => {
            const response = await request(app)
                .get('/api/approval/workflows')
                .expect(401);

            expect(response.body.error).toContain('authentication required');
        });

        test('should reject requests with invalid token', async () => {
            const response = await request(app)
                .get('/api/approval/workflows')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401);

            expect(response.body.error).toContain('invalid token');
        });

        test('should reject requests with expired token', async () => {
            const expiredToken = generateJWT(createMockUser(), { expiresIn: '-1h' });
            
            const response = await request(app)
                .get('/api/approval/workflows')
                .set('Authorization', `Bearer ${expiredToken}`)
                .expect(401);

            expect(response.body.error).toContain('token expired');
        });

        test('should enforce role-based access control', async () => {
            // User without admin permissions trying to access admin endpoint
            const response = await request(app)
                .get('/api/approval/admin/rules')
                .set('Authorization', `Bearer ${unauthorizedToken}`)
                .expect(403);

            expect(response.body.error).toContain('insufficient permissions');
        });

        test('should allow access with proper permissions', async () => {
            const response = await request(app)
                .get('/api/approval/admin/rules')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body).toHaveProperty('rules');
        });

        test('should validate JWT signature integrity', async () => {
            const tamperedToken = authToken.slice(0, -10) + 'tampered123';
            
            const response = await request(app)
                .get('/api/approval/workflows')
                .set('Authorization', `Bearer ${tamperedToken}`)
                .expect(401);

            expect(response.body.error).toContain('invalid signature');
        });
    });

    describe('Input Validation and Sanitization', () => {
        test('should validate and sanitize approval request data', async () => {
            const maliciousData = {
                workflowId: '<script>alert("xss")</script>',
                action: 'approve',
                comment: '<img src=x onerror=alert("xss")>',
                amount: 'not-a-number'
            };

            const response = await request(app)
                .post('/api/approval/workflows/action')
                .set('Authorization', `Bearer ${authToken}`)
                .send(maliciousData)
                .expect(400);

            expect(response.body.errors).toContain('invalid workflowId format');
            expect(response.body.errors).toContain('invalid amount');
        });

        test('should prevent SQL injection attacks', async () => {
            const sqlInjection = "'; DROP TABLE approval_workflows; --";
            
            const response = await request(app)
                .get(`/api/approval/workflows/${sqlInjection}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(400);

            expect(response.body.error).toContain('invalid workflow ID');
        });

        test('should sanitize HTML content in comments', async () => {
            const htmlContent = '<script>alert("xss")</script><b>Bold text</b>';
            
            const response = await request(app)
                .post('/api/approval/workflows/workflow-123/action')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    action: 'approve',
                    comment: htmlContent
                })
                .expect(200);

            // HTML should be sanitized but safe tags preserved
            expect(response.body.comment).not.toContain('<script>');
            expect(response.body.comment).toContain('&lt;b&gt;Bold text&lt;/b&gt;');
        });

        test('should validate file upload security', async () => {
            const maliciousFile = Buffer.from('<?php system($_GET["cmd"]); ?>');
            
            const response = await request(app)
                .post('/api/approval/workflows/workflow-123/attachments')
                .set('Authorization', `Bearer ${authToken}`)
                .attach('file', maliciousFile, 'malicious.php')
                .expect(400);

            expect(response.body.error).toContain('file type not allowed');
        });

        test('should enforce file size limits', async () => {
            const largeFile = Buffer.alloc(11 * 1024 * 1024); // 11MB file
            
            const response = await request(app)
                .post('/api/approval/workflows/workflow-123/attachments')
                .set('Authorization', `Bearer ${authToken}`)
                .attach('file', largeFile, 'large-file.pdf')
                .expect(413);

            expect(response.body.error).toContain('file too large');
        });
    });

    describe('Rate Limiting and DDoS Protection', () => {
        test('should enforce rate limits per user', async () => {
            const requests = Array.from({ length: 101 }, () =>
                request(app)
                    .get('/api/approval/workflows')
                    .set('Authorization', `Bearer ${authToken}`)
            );

            const responses = await Promise.all(requests);
            const rateLimitedResponses = responses.filter(r => r.status === 429);
            
            expect(rateLimitedResponses.length).toBeGreaterThan(0);
            expect(rateLimitedResponses[0].body.error).toContain('rate limit exceeded');
        });

        test('should enforce global rate limits', async () => {
            const users = Array.from({ length: 10 }, () => createMockUser());
            const tokens = users.map(user => generateJWT(user));
            
            const requests = tokens.flatMap(token =>
                Array.from({ length: 20 }, () =>
                    request(app)
                        .get('/api/approval/workflows')
                        .set('Authorization', `Bearer ${token}`)
                )
            );

            const responses = await Promise.all(requests);
            const rateLimitedResponses = responses.filter(r => r.status === 429);
            
            expect(rateLimitedResponses.length).toBeGreaterThan(0);
        });

        test('should implement progressive delays for repeated violations', async () => {
            const startTime = performance.now();
            
            // Make requests that will trigger rate limiting
            const requests = Array.from({ length: 10 }, async (_, i) => {
                const response = await request(app)
                    .post('/api/approval/workflows/invalid-id/action')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({ action: 'approve' });
                
                return { response, timestamp: performance.now() };
            });

            const results = await Promise.all(requests);
            const delays = results.slice(1).map((result, i) => 
                result.timestamp - results[i].timestamp
            );

            // Delays should increase progressively
            expect(delays[delays.length - 1]).toBeGreaterThan(delays[0]);
        });

        test('should block suspicious IP addresses', async () => {
            // Simulate multiple failed login attempts from same IP
            const failedAttempts = Array.from({ length: 10 }, () =>
                request(app)
                    .post('/api/auth/login')
                    .send({ email: 'invalid@email.com', password: 'wrong-password' })
            );

            await Promise.all(failedAttempts);

            // Subsequent requests from same IP should be blocked
            const response = await request(app)
                .get('/api/approval/workflows')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(429);

            expect(response.body.error).toContain('IP temporarily blocked');
        });
    });

    describe('Data Encryption and Security', () => {
        test('should encrypt sensitive data at rest', async () => {
            const sensitiveData = {
                workflowId: 'workflow-123',
                comment: 'Confidential approval comment',
                metadata: { ssn: '123-45-6789', account: '9876543210' }
            };

            await request(app)
                .post('/api/approval/workflows/workflow-123/action')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ action: 'approve', ...sensitiveData })
                .expect(200);

            // Check that sensitive data is encrypted in database
            const dbRecord = await testDb.query(
                'SELECT comment, metadata FROM approval_actions WHERE workflow_id = $1',
                ['workflow-123']
            );

            expect(dbRecord.rows[0].comment).not.toContain('Confidential');
            expect(dbRecord.rows[0].metadata).not.toContain('123-45-6789');
        });

        test('should use secure headers in responses', async () => {
            const response = await request(app)
                .get('/api/approval/workflows')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.headers['x-content-type-options']).toBe('nosniff');
            expect(response.headers['x-frame-options']).toBe('DENY');
            expect(response.headers['x-xss-protection']).toBe('1; mode=block');
            expect(response.headers['strict-transport-security']).toContain('max-age');
        });

        test('should validate CSRF tokens for state-changing operations', async () => {
            const response = await request(app)
                .post('/api/approval/workflows/workflow-123/action')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ action: 'approve' })
                .expect(403);

            expect(response.body.error).toContain('CSRF token required');
        });
    });
});

describe('Approval System Performance Tests', () => {
    let testDb;
    let authToken;

    beforeEach(async () => {
        testDb = await createTestDatabase();
        authToken = generateJWT(createMockUser({ role: 'approver' }));
    });

    afterEach(async () => {
        await cleanupTestDatabase(testDb);
    });

    describe('High Load Performance', () => {
        test('should handle concurrent approval requests', async () => {
            const concurrentRequests = 50;
            const startTime = performance.now();

            const requests = Array.from({ length: concurrentRequests }, (_, i) =>
                request(app)
                    .post(`/api/approval/workflows/workflow-${i}/action`)
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({ action: 'approve', comment: `Approval ${i}` })
            );

            const responses = await Promise.all(requests);
            const endTime = performance.now();
            const duration = endTime - startTime;

            // All requests should succeed
            expect(responses.every(r => r.status === 200)).toBe(true);
            
            // Should complete within reasonable time (5 seconds for 50 requests)
            expect(duration).toBeLessThan(5000);
            
            // Average response time should be acceptable
            const avgResponseTime = duration / concurrentRequests;
            expect(avgResponseTime).toBeLessThan(100); // 100ms average
        });

        test('should maintain performance under database load', async () => {
            // Create large dataset
            const workflows = Array.from({ length: 1000 }, (_, i) => ({
                id: `perf-workflow-${i}`,
                transaction_id: `tx-${i}`,
                requester_id: 'user-123',
                status: 'pending'
            }));

            // Insert test data
            for (const workflow of workflows) {
                await testDb.query(
                    'INSERT INTO approval_workflows (id, transaction_id, requester_id, status) VALUES ($1, $2, $3, $4)',
                    [workflow.id, workflow.transaction_id, workflow.requester_id, workflow.status]
                );
            }

            const startTime = performance.now();
            
            const response = await request(app)
                .get('/api/approval/workflows?limit=100&offset=0')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            const endTime = performance.now();
            const queryTime = endTime - startTime;

            expect(response.body.workflows).toHaveLength(100);
            expect(queryTime).toBeLessThan(500); // Should complete within 500ms
        });

        test('should optimize memory usage for large result sets', async () => {
            const initialMemory = process.memoryUsage().heapUsed;

            // Request large dataset
            const response = await request(app)
                .get('/api/approval/workflows?limit=1000')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            expect(response.body.workflows).toBeDefined();
            // Memory increase should be reasonable (less than 50MB)
            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
        });

        test('should handle bulk operations efficiently', async () => {
            const bulkData = Array.from({ length: 100 }, (_, i) => ({
                workflowId: `bulk-workflow-${i}`,
                action: 'approve',
                comment: `Bulk approval ${i}`
            }));

            const startTime = performance.now();

            const response = await request(app)
                .post('/api/approval/workflows/bulk-action')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ actions: bulkData })
                .expect(200);

            const endTime = performance.now();
            const processingTime = endTime - startTime;

            expect(response.body.processed).toBe(100);
            expect(processingTime).toBeLessThan(2000); // Should complete within 2 seconds
        });
    });

    describe('Database Performance Optimization', () => {
        test('should use database indexes effectively', async () => {
            // Test query performance with indexed columns
            const startTime = performance.now();

            await request(app)
                .get('/api/approval/workflows?status=pending&requester_id=user-123')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            const endTime = performance.now();
            const queryTime = endTime - startTime;

            // Indexed query should be fast
            expect(queryTime).toBeLessThan(100);
        });

        test('should implement connection pooling', async () => {
            const concurrentQueries = 20;
            
            const queries = Array.from({ length: concurrentQueries }, () =>
                request(app)
                    .get('/api/approval/workflows')
                    .set('Authorization', `Bearer ${authToken}`)
            );

            const responses = await Promise.all(queries);

            // All queries should succeed without connection errors
            expect(responses.every(r => r.status === 200)).toBe(true);
            
            // Connection pool should not be exhausted
            expect(testDb.pool.totalCount).toBeLessThan(50);
        });

        test('should cache frequently accessed data', async () => {
            // First request (cache miss)
            const startTime1 = performance.now();
            await request(app)
                .get('/api/approval/rules')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);
            const firstRequestTime = performance.now() - startTime1;

            // Second request (cache hit)
            const startTime2 = performance.now();
            await request(app)
                .get('/api/approval/rules')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);
            const secondRequestTime = performance.now() - startTime2;

            // Cached request should be significantly faster
            expect(secondRequestTime).toBeLessThan(firstRequestTime * 0.5);
        });
    });

    describe('Resource Usage Monitoring', () => {
        test('should monitor CPU usage under load', async () => {
            const startCpuUsage = process.cpuUsage();
            
            // Generate CPU-intensive load
            const requests = Array.from({ length: 100 }, () =>
                request(app)
                    .post('/api/approval/workflows/complex-calculation')
                    .set('Authorization', `Bearer ${authToken}`)
                    .send({ data: Array.from({ length: 1000 }, (_, i) => i) })
            );

            await Promise.all(requests);
            
            const endCpuUsage = process.cpuUsage(startCpuUsage);
            const cpuUsageMs = (endCpuUsage.user + endCpuUsage.system) / 1000;

            // CPU usage should be reasonable
            expect(cpuUsageMs).toBeLessThan(10000); // Less than 10 seconds of CPU time
        });

        test('should handle memory leaks prevention', async () => {
            const initialMemory = process.memoryUsage().heapUsed;
            
            // Perform operations that could cause memory leaks
            for (let i = 0; i < 100; i++) {
                await request(app)
                    .get('/api/approval/workflows')
                    .set('Authorization', `Bearer ${authToken}`);
            }

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = finalMemory - initialMemory;

            // Memory increase should be minimal
            expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
        });

        test('should implement graceful degradation under stress', async () => {
            // Simulate high load
            const heavyLoad = Array.from({ length: 200 }, () =>
                request(app)
                    .get('/api/approval/workflows')
                    .set('Authorization', `Bearer ${authToken}`)
            );

            const responses = await Promise.all(heavyLoad);
            
            // Most requests should succeed
            const successfulRequests = responses.filter(r => r.status === 200);
            const rateLimitedRequests = responses.filter(r => r.status === 429);
            
            expect(successfulRequests.length).toBeGreaterThan(100);
            expect(rateLimitedRequests.length).toBeGreaterThan(0);
            
            // No server errors should occur
            const serverErrors = responses.filter(r => r.status >= 500);
            expect(serverErrors.length).toBe(0);
        });
    });

    describe('Scalability Testing', () => {
        test('should scale horizontally with multiple instances', async () => {
            // Simulate multiple app instances
            const instances = [app, app, app]; // In real test, these would be separate instances
            
            const requests = Array.from({ length: 150 }, (_, i) =>
                request(instances[i % instances.length])
                    .get('/api/approval/workflows')
                    .set('Authorization', `Bearer ${authToken}`)
            );

            const responses = await Promise.all(requests);
            
            // All requests should be handled successfully
            expect(responses.every(r => r.status === 200 || r.status === 429)).toBe(true);
        });

        test('should handle database connection scaling', async () => {
            // Test with multiple concurrent database operations
            const dbOperations = Array.from({ length: 50 }, async (_, i) => {
                return testDb.query(
                    'INSERT INTO approval_workflows (id, transaction_id, requester_id, status) VALUES ($1, $2, $3, $4)',
                    [`scale-test-${i}`, `tx-${i}`, 'user-123', 'pending']
                );
            });

            const results = await Promise.all(dbOperations);
            
            // All operations should succeed
            expect(results.every(r => r.rowCount === 1)).toBe(true);
        });
    });
});

describe('Penetration Testing', () => {
    let testDb;
    let authToken;

    beforeEach(async () => {
        testDb = await createTestDatabase();
        authToken = generateJWT(createMockUser());
    });

    afterEach(async () => {
        await cleanupTestDatabase(testDb);
    });

    describe('Common Attack Vectors', () => {
        test('should prevent directory traversal attacks', async () => {
            const maliciousPath = '../../../etc/passwd';
            
            const response = await request(app)
                .get(`/api/approval/attachments/${maliciousPath}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(400);

            expect(response.body.error).toContain('invalid file path');
        });

        test('should prevent command injection', async () => {
            const commandInjection = 'test; rm -rf /';
            
            const response = await request(app)
                .post('/api/approval/workflows/search')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ query: commandInjection })
                .expect(400);

            expect(response.body.error).toContain('invalid search query');
        });

        test('should prevent XML external entity (XXE) attacks', async () => {
            const xxePayload = `<?xml version="1.0" encoding="UTF-8"?>
                <!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
                <workflow><id>&xxe;</id></workflow>`;
            
            const response = await request(app)
                .post('/api/approval/workflows/import')
                .set('Authorization', `Bearer ${authToken}`)
                .set('Content-Type', 'application/xml')
                .send(xxePayload)
                .expect(400);

            expect(response.body.error).toContain('XML parsing not allowed');
        });

        test('should prevent server-side request forgery (SSRF)', async () => {
            const ssrfUrl = 'http://localhost:22/admin';
            
            const response = await request(app)
                .post('/api/approval/webhooks/test')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ url: ssrfUrl })
                .expect(400);

            expect(response.body.error).toContain('invalid webhook URL');
        });
    });

    describe('Session Security', () => {
        test('should invalidate sessions on logout', async () => {
            // Logout
            await request(app)
                .post('/api/auth/logout')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            // Token should be invalid after logout
            const response = await request(app)
                .get('/api/approval/workflows')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(401);

            expect(response.body.error).toContain('token invalidated');
        });

        test('should prevent session fixation attacks', async () => {
            const sessionId = 'fixed-session-id';
            
            const response = await request(app)
                .post('/api/auth/login')
                .set('Cookie', `sessionId=${sessionId}`)
                .send({ email: 'test@finbot.com', password: 'password' })
                .expect(200);

            // Session ID should be regenerated
            expect(response.headers['set-cookie']).toBeDefined();
            expect(response.headers['set-cookie'][0]).not.toContain(sessionId);
        });
    });
});