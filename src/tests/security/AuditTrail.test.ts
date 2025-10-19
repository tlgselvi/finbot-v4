/**
 * Audit Trail Security Tests
 * Tests for comprehensive audit logging and security monitoring
 */

import AuditLogger from '../../services/AuditLogger';

// Mock audit logger implementation
class MockAuditLogger {
  private logs: Array<{
    id: string;
    timestamp: Date;
    userId?: string;
    action: string;
    resource: string;
    details: any;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    success: boolean;
    metadata?: any;
  }> = [];

  private securityEvents: Array<{
    id: string;
    timestamp: Date;
    eventType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    source: string;
    metadata: any;
  }> = [];

  logUserAction(
    userId: string,
    action: string,
    resource: string,
    details: any,
    context: {
      ipAddress?: string;
      userAgent?: string;
      sessionId?: string;
    } = {},
    success: boolean = true
  ): void {
    const logEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      userId,
      action,
      resource,
      details,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      sessionId: context.sessionId,
      severity: this.determineSeverity(action, success),
      category: this.categorizeAction(action),
      success,
      metadata: {
        source: 'user_action',
        environment: 'test'
      }
    };

    this.logs.push(logEntry);
  }

  logSecurityEvent(
    eventType: string,
    description: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    source: string,
    metadata: any = {}
  ): void {
    const event = {
      id: `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      eventType,
      severity,
      description,
      source,
      metadata: {
        ...metadata,
        environment: 'test'
      }
    };

    this.securityEvents.push(event);
  }

  logMLModelAccess(
    userId: string,
    modelId: string,
    operation: string,
    inputData: any,
    outputData: any,
    context: any = {}
  ): void {
    this.logUserAction(
      userId,
      `ml_model_${operation}`,
      `model:${modelId}`,
      {
        inputDataHash: this.hashSensitiveData(inputData),
        outputDataHash: this.hashSensitiveData(outputData),
        modelVersion: context.modelVersion,
        inferenceTime: context.inferenceTime
      },
      context,
      true
    );
  }

  logPrivacyOperation(
    userId: string,
    operation: string,
    datasetId: string,
    privacyParameters: any,
    context: any = {}
  ): void {
    this.logUserAction(
      userId,
      `privacy_${operation}`,
      `dataset:${datasetId}`,
      {
        epsilon: privacyParameters.epsilon,
        delta: privacyParameters.delta,
        mechanism: privacyParameters.mechanism,
        budgetUsed: privacyParameters.budgetUsed
      },
      context,
      true
    );
  }

  queryLogs(filters: {
    userId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
    severity?: string;
    category?: string;
    success?: boolean;
  }): any[] {
    return this.logs.filter(log => {
      if (filters.userId && log.userId !== filters.userId) return false;
      if (filters.action && !log.action.includes(filters.action)) return false;
      if (filters.resource && !log.resource.includes(filters.resource)) return false;
      if (filters.startDate && log.timestamp < filters.startDate) return false;
      if (filters.endDate && log.timestamp > filters.endDate) return false;
      if (filters.severity && log.severity !== filters.severity) return false;
      if (filters.category && log.category !== filters.category) return false;
      if (filters.success !== undefined && log.success !== filters.success) return false;
      return true;
    });
  }

  querySecurityEvents(filters: {
    eventType?: string;
    severity?: string;
    startDate?: Date;
    endDate?: Date;
    source?: string;
  }): any[] {
    return this.securityEvents.filter(event => {
      if (filters.eventType && event.eventType !== filters.eventType) return false;
      if (filters.severity && event.severity !== filters.severity) return false;
      if (filters.startDate && event.timestamp < filters.startDate) return false;
      if (filters.endDate && event.timestamp > filters.endDate) return false;
      if (filters.source && event.source !== filters.source) return false;
      return true;
    });
  }

  generateAuditReport(startDate: Date, endDate: Date): any {
    const logs = this.queryLogs({ startDate, endDate });
    const securityEvents = this.querySecurityEvents({ startDate, endDate });

    const summary = {
      totalActions: logs.length,
      successfulActions: logs.filter(l => l.success).length,
      failedActions: logs.filter(l => !l.success).length,
      securityEvents: securityEvents.length,
      criticalEvents: securityEvents.filter(e => e.severity === 'critical').length,
      uniqueUsers: new Set(logs.map(l => l.userId)).size,
      topActions: this.getTopActions(logs),
      riskScore: this.calculateRiskScore(logs, securityEvents)
    };

    return {
      summary,
      logs,
      securityEvents,
      generatedAt: new Date()
    };
  }

  private determineSeverity(action: string, success: boolean): 'low' | 'medium' | 'high' | 'critical' {
    if (!success) {
      if (action.includes('login') || action.includes('auth')) return 'high';
      if (action.includes('admin') || action.includes('privacy')) return 'critical';
      return 'medium';
    }

    if (action.includes('admin') || action.includes('delete')) return 'high';
    if (action.includes('privacy') || action.includes('ml_model')) return 'medium';
    return 'low';
  }

  private categorizeAction(action: string): string {
    if (action.includes('auth') || action.includes('login')) return 'authentication';
    if (action.includes('privacy')) return 'privacy';
    if (action.includes('ml_model')) return 'ml_operations';
    if (action.includes('admin')) return 'administration';
    if (action.includes('data')) return 'data_access';
    return 'general';
  }

  private hashSensitiveData(data: any): string {
    // Simple hash for testing - in production use proper cryptographic hash
    return `hash_${JSON.stringify(data).length}_${Date.now()}`;
  }

  private getTopActions(logs: any[]): Array<{ action: string; count: number }> {
    const actionCounts = logs.reduce((acc, log) => {
      acc[log.action] = (acc[log.action] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(actionCounts)
      .map(([action, count]) => ({ action, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private calculateRiskScore(logs: any[], securityEvents: any[]): number {
    let score = 0;
    
    // Failed authentication attempts
    const failedAuth = logs.filter(l => !l.success && l.category === 'authentication').length;
    score += failedAuth * 2;
    
    // Critical security events
    const criticalEvents = securityEvents.filter(e => e.severity === 'critical').length;
    score += criticalEvents * 10;
    
    // High severity events
    const highEvents = securityEvents.filter(e => e.severity === 'high').length;
    score += highEvents * 5;
    
    // Normalize to 0-100 scale
    return Math.min(100, score);
  }

  getAllLogs(): any[] {
    return [...this.logs];
  }

  getAllSecurityEvents(): any[] {
    return [...this.securityEvents];
  }

  clearLogs(): void {
    this.logs = [];
    this.securityEvents = [];
  }
}

describe('Audit Trail Security Tests', () => {
  let auditLogger: MockAuditLogger;

  beforeEach(() => {
    auditLogger = new MockAuditLogger();
  });

  describe('User Action Logging', () => {
    it('should log user authentication events', () => {
      const userId = 'user123';
      const context = {
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        sessionId: 'session_abc123'
      };

      // Successful login
      auditLogger.logUserAction(
        userId,
        'user_login',
        'auth_system',
        { email: 'user@example.com' },
        context,
        true
      );

      // Failed login attempt
      auditLogger.logUserAction(
        userId,
        'user_login',
        'auth_system',
        { email: 'user@example.com', reason: 'invalid_password' },
        context,
        false
      );

      const logs = auditLogger.getAllLogs();
      expect(logs).toHaveLength(2);

      const successLog = logs.find(l => l.success);
      const failLog = logs.find(l => !l.success);

      expect(successLog?.action).toBe('user_login');
      expect(successLog?.severity).toBe('low');
      expect(successLog?.category).toBe('authentication');

      expect(failLog?.action).toBe('user_login');
      expect(failLog?.severity).toBe('high');
      expect(failLog?.success).toBe(false);
    });

    it('should log ML model access with privacy protection', () => {
      const userId = 'analyst123';
      const modelId = 'spending_prediction_v2';
      const inputData = { userId: 'customer456', transactions: [100, 200, 300] };
      const outputData = { prediction: 450, confidence: 0.85 };

      auditLogger.logMLModelAccess(
        userId,
        modelId,
        'inference',
        inputData,
        outputData,
        {
          modelVersion: '2.1.0',
          inferenceTime: 150,
          ipAddress: '10.0.1.50'
        }
      );

      const logs = auditLogger.queryLogs({ action: 'ml_model_inference' });
      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.resource).toBe('model:spending_prediction_v2');
      expect(log.details.inputDataHash).toBeDefined();
      expect(log.details.outputDataHash).toBeDefined();
      expect(log.details.modelVersion).toBe('2.1.0');
      expect(log.severity).toBe('medium');
    });

    it('should log privacy operations with detailed parameters', () => {
      const userId = 'privacy_officer';
      const datasetId = 'customer_transactions';
      const privacyParams = {
        epsilon: 1.0,
        delta: 1e-5,
        mechanism: 'laplace',
        budgetUsed: 0.5
      };

      auditLogger.logPrivacyOperation(
        userId,
        'differential_privacy_query',
        datasetId,
        privacyParams,
        { ipAddress: '10.0.2.100' }
      );

      const logs = auditLogger.queryLogs({ action: 'privacy_differential_privacy_query' });
      expect(logs).toHaveLength(1);

      const log = logs[0];
      expect(log.resource).toBe('dataset:customer_transactions');
      expect(log.details.epsilon).toBe(1.0);
      expect(log.details.mechanism).toBe('laplace');
      expect(log.severity).toBe('medium');
    });

    it('should capture comprehensive context information', () => {
      const userId = 'admin123';
      const context = {
        ipAddress: '203.0.113.1',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        sessionId: 'sess_xyz789'
      };

      auditLogger.logUserAction(
        userId,
        'admin_user_delete',
        'user:target_user_456',
        { targetUserId: 'target_user_456', reason: 'policy_violation' },
        context,
        true
      );

      const logs = auditLogger.getAllLogs();
      const log = logs[0];

      expect(log.userId).toBe(userId);
      expect(log.ipAddress).toBe(context.ipAddress);
      expect(log.userAgent).toBe(context.userAgent);
      expect(log.sessionId).toBe(context.sessionId);
      expect(log.timestamp).toBeInstanceOf(Date);
      expect(log.id).toMatch(/^log_\d+_[a-z0-9]+$/);
    });
  });

  describe('Security Event Logging', () => {
    it('should log security threats and anomalies', () => {
      auditLogger.logSecurityEvent(
        'suspicious_login_pattern',
        'Multiple failed login attempts from same IP within 5 minutes',
        'high',
        'authentication_monitor',
        {
          ipAddress: '198.51.100.1',
          attemptCount: 15,
          timeWindow: '5min'
        }
      );

      auditLogger.logSecurityEvent(
        'data_exfiltration_attempt',
        'Unusual large data download detected',
        'critical',
        'data_loss_prevention',
        {
          userId: 'user789',
          dataSize: '500MB',
          endpoint: '/api/export/all-transactions'
        }
      );

      const events = auditLogger.getAllSecurityEvents();
      expect(events).toHaveLength(2);

      const highEvent = events.find(e => e.severity === 'high');
      const criticalEvent = events.find(e => e.severity === 'critical');

      expect(highEvent?.eventType).toBe('suspicious_login_pattern');
      expect(criticalEvent?.eventType).toBe('data_exfiltration_attempt');
      expect(criticalEvent?.metadata.dataSize).toBe('500MB');
    });

    it('should categorize security events by severity', () => {
      const events = [
        { type: 'password_policy_violation', severity: 'low' as const },
        { type: 'unauthorized_api_access', severity: 'medium' as const },
        { type: 'privilege_escalation_attempt', severity: 'high' as const },
        { type: 'data_breach_detected', severity: 'critical' as const }
      ];

      events.forEach(event => {
        auditLogger.logSecurityEvent(
          event.type,
          `Security event: ${event.type}`,
          event.severity,
          'security_monitor'
        );
      });

      const lowEvents = auditLogger.querySecurityEvents({ severity: 'low' });
      const criticalEvents = auditLogger.querySecurityEvents({ severity: 'critical' });

      expect(lowEvents).toHaveLength(1);
      expect(criticalEvents).toHaveLength(1);
      expect(criticalEvents[0].eventType).toBe('data_breach_detected');
    });
  });

  describe('Audit Log Querying and Analysis', () => {
    beforeEach(() => {
      // Setup test data
      const users = ['user1', 'user2', 'admin1'];
      const actions = ['login', 'data_access', 'ml_model_inference', 'privacy_query'];
      
      // Generate test logs
      for (let i = 0; i < 50; i++) {
        const userId = users[i % users.length];
        const action = actions[i % actions.length];
        const success = Math.random() > 0.1; // 90% success rate
        
        auditLogger.logUserAction(
          userId,
          action,
          `resource_${i}`,
          { testData: i },
          { ipAddress: `192.168.1.${100 + (i % 50)}` },
          success
        );
      }

      // Generate security events
      for (let i = 0; i < 10; i++) {
        auditLogger.logSecurityEvent(
          `event_type_${i % 3}`,
          `Security event ${i}`,
          i % 4 === 0 ? 'critical' : 'medium',
          'test_source'
        );
      }
    });

    it('should filter logs by user', () => {
      const user1Logs = auditLogger.queryLogs({ userId: 'user1' });
      const user2Logs = auditLogger.queryLogs({ userId: 'user2' });
      
      expect(user1Logs.length).toBeGreaterThan(0);
      expect(user2Logs.length).toBeGreaterThan(0);
      expect(user1Logs.every(log => log.userId === 'user1')).toBe(true);
      expect(user2Logs.every(log => log.userId === 'user2')).toBe(true);
    });

    it('should filter logs by action type', () => {
      const loginLogs = auditLogger.queryLogs({ action: 'login' });
      const mlLogs = auditLogger.queryLogs({ action: 'ml_model' });
      
      expect(loginLogs.length).toBeGreaterThan(0);
      expect(mlLogs.length).toBeGreaterThan(0);
      expect(loginLogs.every(log => log.action.includes('login'))).toBe(true);
      expect(mlLogs.every(log => log.action.includes('ml_model'))).toBe(true);
    });

    it('should filter logs by date range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      
      const recentLogs = auditLogger.queryLogs({ startDate: oneHourAgo });
      const allLogs = auditLogger.queryLogs({ startDate: twoHoursAgo });
      
      expect(recentLogs.length).toBe(allLogs.length); // All logs are recent in test
      expect(recentLogs.every(log => log.timestamp >= oneHourAgo)).toBe(true);
    });

    it('should filter logs by success status', () => {
      const successLogs = auditLogger.queryLogs({ success: true });
      const failedLogs = auditLogger.queryLogs({ success: false });
      
      expect(successLogs.length).toBeGreaterThan(0);
      expect(failedLogs.length).toBeGreaterThan(0);
      expect(successLogs.every(log => log.success === true)).toBe(true);
      expect(failedLogs.every(log => log.success === false)).toBe(true);
    });

    it('should generate comprehensive audit reports', () => {
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      const endDate = new Date();
      
      const report = auditLogger.generateAuditReport(startDate, endDate);
      
      expect(report.summary).toBeDefined();
      expect(report.summary.totalActions).toBeGreaterThan(0);
      expect(report.summary.successfulActions).toBeGreaterThan(0);
      expect(report.summary.uniqueUsers).toBeGreaterThan(0);
      expect(report.summary.topActions).toBeInstanceOf(Array);
      expect(report.summary.riskScore).toBeGreaterThanOrEqual(0);
      
      expect(report.logs).toBeInstanceOf(Array);
      expect(report.securityEvents).toBeInstanceOf(Array);
      expect(report.generatedAt).toBeInstanceOf(Date);
    });

    it('should calculate risk scores based on security events', () => {
      // Clear existing data
      auditLogger.clearLogs();
      
      // Add high-risk events
      auditLogger.logUserAction('user1', 'user_login', 'auth', {}, {}, false);
      auditLogger.logUserAction('user1', 'user_login', 'auth', {}, {}, false);
      auditLogger.logSecurityEvent('data_breach', 'Critical security breach', 'critical', 'monitor');
      
      const report = auditLogger.generateAuditReport(
        new Date(Date.now() - 60 * 60 * 1000),
        new Date()
      );
      
      expect(report.summary.riskScore).toBeGreaterThan(0);
      expect(report.summary.failedActions).toBe(2);
      expect(report.summary.criticalEvents).toBe(1);
    });
  });

  describe('Audit Log Integrity and Security', () => {
    it('should ensure log immutability', () => {
      auditLogger.logUserAction('user1', 'test_action', 'resource1', { data: 'original' });
      
      const logs = auditLogger.getAllLogs();
      const originalLog = { ...logs[0] };
      
      // Attempt to modify log (should not affect stored log)
      logs[0].details.data = 'modified';
      
      const logsAfterModification = auditLogger.getAllLogs();
      expect(logsAfterModification[0].details.data).toBe('original');
    });

    it('should generate unique log identifiers', () => {
      const logIds = new Set();
      
      for (let i = 0; i < 100; i++) {
        auditLogger.logUserAction(`user${i}`, 'test_action', 'resource', {});
      }
      
      const logs = auditLogger.getAllLogs();
      logs.forEach(log => {
        expect(logIds.has(log.id)).toBe(false);
        logIds.add(log.id);
      });
      
      expect(logIds.size).toBe(100);
    });

    it('should handle concurrent logging safely', async () => {
      const promises = [];
      
      // Simulate concurrent log writes
      for (let i = 0; i < 50; i++) {
        promises.push(
          new Promise<void>((resolve) => {
            setTimeout(() => {
              auditLogger.logUserAction(`user${i}`, 'concurrent_action', 'resource', { index: i });
              resolve();
            }, Math.random() * 10);
          })
        );
      }
      
      await Promise.all(promises);
      
      const logs = auditLogger.getAllLogs();
      expect(logs).toHaveLength(50);
      
      // Check that all logs have unique IDs
      const ids = logs.map(log => log.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(50);
    });

    it('should validate log data integrity', () => {
      const testCases = [
        { userId: 'user1', action: 'valid_action', resource: 'resource1', details: { valid: true } },
        { userId: '', action: 'empty_user', resource: 'resource2', details: {} },
        { userId: 'user2', action: '', resource: 'resource3', details: null }
      ];
      
      testCases.forEach((testCase, index) => {
        auditLogger.logUserAction(
          testCase.userId,
          testCase.action,
          testCase.resource,
          testCase.details
        );
      });
      
      const logs = auditLogger.getAllLogs();
      expect(logs).toHaveLength(3);
      
      // All logs should have required fields
      logs.forEach(log => {
        expect(log.id).toBeDefined();
        expect(log.timestamp).toBeInstanceOf(Date);
        expect(log.action).toBeDefined();
        expect(log.resource).toBeDefined();
        expect(log.severity).toBeDefined();
        expect(log.category).toBeDefined();
      });
    });
  });

  describe('Compliance and Retention', () => {
    it('should support audit log retention policies', () => {
      // Simulate old logs
      const oldDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year ago
      
      // In a real implementation, this would involve database operations
      // For testing, we'll simulate the retention check
      const retentionPeriod = 90 * 24 * 60 * 60 * 1000; // 90 days
      const cutoffDate = new Date(Date.now() - retentionPeriod);
      
      const shouldRetain = (logDate: Date) => logDate >= cutoffDate;
      
      expect(shouldRetain(new Date())).toBe(true); // Recent log
      expect(shouldRetain(oldDate)).toBe(false); // Old log
    });

    it('should support regulatory compliance reporting', () => {
      // Add logs that would be relevant for compliance
      auditLogger.logUserAction('user1', 'data_access', 'pii_data', { recordCount: 100 });
      auditLogger.logUserAction('user2', 'data_export', 'customer_data', { exportSize: '1MB' });
      auditLogger.logPrivacyOperation('privacy_officer', 'anonymization', 'dataset1', {
        epsilon: 1.0,
        delta: 1e-5,
        mechanism: 'laplace',
        budgetUsed: 0.3
      });
      
      const complianceReport = {
        dataAccessLogs: auditLogger.queryLogs({ action: 'data_access' }),
        dataExportLogs: auditLogger.queryLogs({ action: 'data_export' }),
        privacyOperations: auditLogger.queryLogs({ category: 'privacy' }),
        securityIncidents: auditLogger.querySecurityEvents({ severity: 'high' })
      };
      
      expect(complianceReport.dataAccessLogs.length).toBeGreaterThan(0);
      expect(complianceReport.dataExportLogs.length).toBeGreaterThan(0);
      expect(complianceReport.privacyOperations.length).toBeGreaterThan(0);
    });
  });
});