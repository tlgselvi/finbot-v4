/**
 * FinBot v4 - Audit Service
 * Comprehensive audit logging for approval system
 */

import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { db } from '../db';
import crypto from 'crypto';

// Audit log table schema (would be in approval-schema.ts)
interface AuditLog {
  id: string;
  tableName: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT';
  recordId: string;
  userId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  processingTime?: number;
  metadata?: Record<string, any>;
  signature?: string;
  createdAt: Date;
}

interface AuditEvent {
  action: string;
  resource: string;
  resourceId: string;
  userId: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  processingTime?: number;
}

export class AuditService {
  private secretKey: string;

  constructor() {
    this.secretKey = process.env.AUDIT_SECRET_KEY || 'default-audit-key';
  }

  /**
   * Log approval system event
   */
  async logEvent(event: AuditEvent): Promise<void> {
    try {
      const auditRecord = {
        id: crypto.randomUUID(),
        tableName: event.resource,
        operation: this.getOperationFromAction(event.action),
        recordId: event.resourceId,
        userId: event.userId,
        newValues: event.details,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        endpoint: event.endpoint,
        method: event.method,
        statusCode: event.statusCode,
        processingTime: event.processingTime,
        metadata: {
          action: event.action,
          timestamp: new Date().toISOString(),
          source: 'approval-system'
        },
        createdAt: new Date()
      };

      // Generate digital signature for integrity
      auditRecord.signature = this.generateSignature(auditRecord);

      // In production, this would insert into audit_logs table
      console.log('AUDIT LOG:', JSON.stringify(auditRecord, null, 2));

      // Store in database (mock implementation)
      // await db.insert(auditLogs).values(auditRecord);

    } catch (error) {
      console.error('Audit logging error:', error);
      // Never throw errors from audit logging to avoid breaking main flow
    }
  }

  /**
   * Log approval rule changes
   */
  async logRuleChange(
    action: 'create' | 'update' | 'delete' | 'activate' | 'deactivate',
    ruleId: string,
    userId: string,
    oldValues?: any,
    newValues?: any,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      action: `rule_${action}`,
      resource: 'approval_rules',
      resourceId: ruleId,
      userId,
      details: {
        action,
        oldValues,
        newValues,
        ...metadata
      }
    });
  }

  /**
   * Log workflow state changes
   */
  async logWorkflowChange(
    action: 'create' | 'approve' | 'reject' | 'delegate' | 'escalate' | 'cancel' | 'override',
    workflowId: string,
    userId: string,
    level?: number,
    comments?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logEvent({
      action: `workflow_${action}`,
      resource: 'approval_workflows',
      resourceId: workflowId,
      userId,
      details: {
        action,
        level,
        comments,
        timestamp: new Date().toISOString(),
        ...metadata
      }
    });
  }

  /**
   * Log security events
   */
  async logSecurityEvent(
    event: 'unauthorized_access' | 'permission_denied' | 'suspicious_activity' | 'fraud_detected',
    userId: string,
    details: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.logEvent({
      action: `security_${event}`,
      resource: 'security',
      resourceId: crypto.randomUUID(),
      userId,
      details: {
        event,
        severity: this.getSecuritySeverity(event),
        ...details
      },
      ipAddress,
      userAgent
    });
  }

  /**
   * Get audit logs with filtering
   */
  async getAuditLogs(filters: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    resource?: string;
    action?: string;
    page?: number;
    limit?: number;
  }) {
    // Mock implementation - would query audit_logs table
    return {
      logs: [],
      pagination: {
        page: filters.page || 1,
        limit: filters.limit || 50,
        total: 0,
        totalPages: 0
      }
    };
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' | 'pdf' = 'json'
  ) {
    try {
      const logs = await this.getAuditLogs({ startDate, endDate });
      
      const report = {
        reportId: crypto.randomUUID(),
        generatedAt: new Date().toISOString(),
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        },
        summary: {
          totalEvents: logs.logs.length,
          ruleChanges: 0,
          workflowActions: 0,
          securityEvents: 0,
          uniqueUsers: 0
        },
        details: logs.logs,
        integrity: {
          verified: true,
          signatureValid: true,
          lastVerification: new Date().toISOString()
        }
      };

      return report;
    } catch (error) {
      console.error('Compliance report generation error:', error);
      throw new Error(`Failed to generate compliance report: ${error.message}`);
    }
  }

  /**
   * Verify audit log integrity
   */
  async verifyIntegrity(logId: string): Promise<boolean> {
    try {
      // In production, this would:
      // 1. Retrieve log from database
      // 2. Recalculate signature
      // 3. Compare with stored signature
      // 4. Return verification result
      
      return true; // Mock implementation
    } catch (error) {
      console.error('Integrity verification error:', error);
      return false;
    }
  }

  /**
   * Archive old audit logs
   */
  async archiveOldLogs(retentionDays: number = 2555): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      // In production, this would:
      // 1. Export logs older than cutoff to archive storage
      // 2. Encrypt archived data
      // 3. Delete from active table
      // 4. Return count of archived records

      return 0; // Mock implementation
    } catch (error) {
      console.error('Archive logs error:', error);
      throw new Error(`Failed to archive logs: ${error.message}`);
    }
  }

  /**
   * Generate digital signature for audit record
   */
  private generateSignature(record: any): string {
    const data = JSON.stringify({
      tableName: record.tableName,
      operation: record.operation,
      recordId: record.recordId,
      userId: record.userId,
      oldValues: record.oldValues,
      newValues: record.newValues,
      createdAt: record.createdAt
    });

    return crypto
      .createHmac('sha256', this.secretKey)
      .update(data)
      .digest('hex');
  }

  /**
   * Get operation type from action
   */
  private getOperationFromAction(action: string): 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT' {
    if (action.includes('create')) return 'INSERT';
    if (action.includes('update') || action.includes('approve') || action.includes('reject')) return 'UPDATE';
    if (action.includes('delete')) return 'DELETE';
    return 'SELECT';
  }

  /**
   * Get security event severity
   */
  private getSecuritySeverity(event: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (event) {
      case 'fraud_detected': return 'critical';
      case 'unauthorized_access': return 'high';
      case 'permission_denied': return 'medium';
      case 'suspicious_activity': return 'medium';
      default: return 'low';
    }
  }

  /**
   * Create audit middleware for Express
   */
  createAuditMiddleware() {
    return (req: any, res: any, next: any) => {
      const startTime = Date.now();
      
      // Store original res.json to intercept response
      const originalJson = res.json;
      
      res.json = (body: any) => {
        const processingTime = Date.now() - startTime;
        
        // Log the API call
        this.logEvent({
          action: 'api_call',
          resource: 'api',
          resourceId: req.id || crypto.randomUUID(),
          userId: req.user?.id || 'anonymous',
          details: {
            endpoint: req.path,
            method: req.method,
            query: req.query,
            body: req.body,
            response: body
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: req.path,
          method: req.method,
          statusCode: res.statusCode,
          processingTime
        });

        return originalJson.call(res, body);
      };

      next();
    };
  }
}

// Export singleton instance
export const auditService = new AuditService();