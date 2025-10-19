/**
 * Audit Logger Service
 * Comprehensive audit logging system for ML operations and security events
 */

import { EventEmitter } from 'events';

interface AuditEvent {
  id: string;
  timestamp: Date;
  userId: string;
  sessionId: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress: string;
  userAgent: string;
  status: 'SUCCESS' | 'FAILURE' | 'ERROR'tion' | 'data_access' | 'ml_operation' | 'system' | 'privacy';
  ipAddress: string;
  userAgent?: string;
  details?: Record<string, any>;
  riskScore?: number;
  complianceFlags?: string[];
}

interface AuditQuery {
  userId?: string;
  action?: string;
  resource?: string;
  category?: string;
  severity?: string;
  result?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
}

interface AuditMetrics {
  totalEvents: number;
  eventsByCategory: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  eventsByResult: Record<string, number>;
  topUsers: Array<{ userId: string; count: number }>;
  topActions: Array<{ action: string; count: number }>;
  riskTrends: Array<{ date: string; riskScore: number }>;
}

interface ComplianceReport {
  reportId: string;
  generatedAt: Date;
  period: { start: Date; end: Date };
  totalEvents: number;
  complianceScore: number;
  violations: Array<{
    type: string;
    count: number;
    severity: string;
    description: string;
  }>;
  recommendations: string[];
}

class AuditLogger extends EventEmitter {
  private events: AuditEvent[] = [];
  private eventIndex: Map<string, AuditEvent> = new Map();
  private userIndex: Map<string, AuditEvent[]> = new Map();
  private actionIndex: Map<string, AuditEvent[]> = new Map();
  private categoryIndex: Map<string, AuditEvent[]> = new Map();
  private isEnabled: boolean = true;
  private retentionPeriod: number = 90 * 24 * 60 * 60 * 1000; // 90 days
  private maxEvents: number = 1000000; // 1M events max

  constructor() {
    super();
    this.startCleanupScheduler();
  }

  /**
   * Log an audit event
   */
  logEvent(eventData: Omit<AuditEvent, 'id' | 'timestamp'>): string {
    if (!this.isEnabled) {
      return '';
    }

    const event: AuditEvent = {
      id: this.generateEventId(),
      timestamp: new Date(),
      ...eventData
    };

    // Add to main storage
    this.events.push(event);
    this.eventIndex.set(event.id, event);

    // Update indexes
    this.updateIndexes(event);

    // Check for compliance violations
    this.checkComplianceViolations(event);

    // Emit event for real-time monitoring
    this.emit('auditEvent', event);

    // Check if cleanup is needed
    if (this.events.length > this.maxEvents) {
      this.performCleanup();
    }

    return event.id;
  }

  /**
   * Log authentication event
   */
  logAuthentication(
    userId: string,
    action: 'login' | 'logout' | 'login_failed' | 'password_change' | 'mfa_enabled',
    result: 'success' | 'failure' | 'error',
    ipAddress: string,
    details?: Record<string, any>
  ): string {
    return this.logEvent({
      userId,
      action: `auth_${action}`,
      resource: '/auth',
      result,
      severity: result === 'failure' ? 'medium' : 'low',
      category: 'authentication',
      ipAddress,
      details,
      riskScore: this.calculateAuthRiskScore(action, result, details)
    });
  }

  /**
   * Log data access event
   */
  logDataAccess(
    userId: string,
    resource: string,
    resourceId: string,
    action: 'read' | 'write' | 'delete' | 'export',
    result: 'success' | 'failure' | 'error',
    ipAddress: string,
    details?: Record<string, any>
  ): string {
    return this.logEvent({
      userId,
      action: `data_${action}`,
      resource,
      resourceId,
      result,
      severity: this.getDataAccessSeverity(action, resource),
      category: 'data_access',
      ipAddress,
      details,
      riskScore: this.calculateDataAccessRiskScore(action, resource, details),
      complianceFlags: this.getComplianceFlags(resource, action)
    });
  }

  /**
   * Log ML operation event
   */
  logMLOperation(
    userId: string,
    operation: 'model_training' | 'model_inference' | 'model_deployment' | 'federated_learning' | 'privacy_query',
    modelId: string,
    result: 'success' | 'failure' | 'error',
    ipAddress: string,
    details?: Record<string, any>
  ): string {
    return this.logEvent({
      userId,
      action: `ml_${operation}`,
      resource: `/ml/models/${modelId}`,
      resourceId: modelId,
      result,
      severity: this.getMLOperationSeverity(operation),
      category: 'ml_operation',
      ipAddress,
      details,
      riskScore: this.calculateMLRiskScore(operation, details),
      complianceFlags: this.getMLComplianceFlags(operation, details)
    });
  }

  /**
   * Log privacy operation event
   */
  logPrivacyOperation(
    userId: string,
    operation: 'differential_privacy_query' | 'data_anonymization' | 'privacy_budget_allocation' | 'consent_management',
    resource: string,
    result: 'success' | 'failure' | 'error',
    ipAddress: string,
    privacyParameters?: Record<string, any>
  ): string {
    return this.logEvent({
      userId,
      action: `privacy_${operation}`,
      resource,
      result,
      severity: 'high', // Privacy operations are always high severity
      category: 'privacy',
      ipAddress,
      details: privacyParameters,
      riskScore: this.calculatePrivacyRiskScore(operation, privacyParameters),
      complianceFlags: ['GDPR', 'CCPA', 'HIPAA']
    });
  }

  /**
   * Log system event
   */
  logSystemEvent(
    action: string,
    resource: string,
    result: 'success' | 'failure' | 'error',
    severity: 'low' | 'medium' | 'high' | 'critical',
    details?: Record<string, any>
  ): string {
    return this.logEvent({
      userId: 'system',
      action,
      resource,
      result,
      severity,
      category: 'system',
      ipAddress: 'localhost',
      details
    });
  }

  /**
   * Query audit events
   */
  queryEvents(query: AuditQuery): AuditEvent[] {
    let filteredEvents = [...this.events];

    // Apply filters
    if (query.userId) {
      filteredEvents = filteredEvents.filter(e => e.userId === query.userId);
    }

    if (query.action) {
      filteredEvents = filteredEvents.filter(e => e.action.includes(query.action!));
    }

    if (query.resource) {
      filteredEvents = filteredEvents.filter(e => e.resource.includes(query.resource!));
    }

    if (query.category) {
      filteredEvents = filteredEvents.filter(e => e.category === query.category);
    }

    if (query.severity) {
      filteredEvents = filteredEvents.filter(e => e.severity === query.severity);
    }

    if (query.result) {
      filteredEvents = filteredEvents.filter(e => e.result === query.result);
    }

    if (query.startTime) {
      filteredEvents = filteredEvents.filter(e => e.timestamp >= query.startTime!);
    }

    if (query.endTime) {
      filteredEvents = filteredEvents.filter(e => e.timestamp <= query.endTime!);
    }

    // Sort by timestamp (newest first)
    filteredEvents.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 100;
    
    return filteredEvents.slice(offset, offset + limit);
  }

  /**
   * Get audit metrics
   */
  getMetrics(startTime?: Date, endTime?: Date): AuditMetrics {
    let events = this.events;

    if (startTime || endTime) {
      events = events.filter(e => {
        if (startTime && e.timestamp < startTime) return false;
        if (endTime && e.timestamp > endTime) return false;
        return true;
      });
    }

    const eventsByCategory: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};
    const eventsByResult: Record<string, number> = {};
    const userCounts: Record<string, number> = {};
    const actionCounts: Record<string, number> = {};

    events.forEach(event => {
      // Category counts
      eventsByCategory[event.category] = (eventsByCategory[event.category] || 0) + 1;
      
      // Severity counts
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
      
      // Result counts
      eventsByResult[event.result] = (eventsByResult[event.result] || 0) + 1;
      
      // User counts
      userCounts[event.userId] = (userCounts[event.userId] || 0) + 1;
      
      // Action counts
      actionCounts[event.action] = (actionCounts[event.action] || 0) + 1;
    });

    const topUsers = Object.entries(userCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, count }));

    const topActions = Object.entries(actionCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([action, count]) => ({ action, count }));

    // Calculate risk trends (simplified)
    const riskTrends = this.calculateRiskTrends(events);

    return {
      totalEvents: events.length,
      eventsByCategory,
      eventsBySeverity,
      eventsByResult,
      topUsers,
      topActions,
      riskTrends
    };
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport(startTime: Date, endTime: Date): ComplianceReport {
    const events = this.queryEvents({ startTime, endTime, limit: Number.MAX_SAFE_INTEGER });
    
    const violations: Array<{
      type: string;
      count: number;
      severity: string;
      description: string;
    }> = [];

    // Check for various compliance violations
    const unauthorizedAccess = events.filter(e => 
      e.category === 'data_access' && e.result === 'failure'
    ).length;

    if (unauthorizedAccess > 0) {
      violations.push({
        type: 'unauthorized_access',
        count: unauthorizedAccess,
        severity: 'high',
        description: 'Unauthorized data access attempts detected'
      });
    }

    const privacyViolations = events.filter(e => 
      e.category === 'privacy' && e.result === 'error'
    ).length;

    if (privacyViolations > 0) {
      violations.push({
        type: 'privacy_violation',
        count: privacyViolations,
        severity: 'critical',
        description: 'Privacy operation failures detected'
      });
    }

    // Calculate compliance score
    const totalRiskEvents = events.filter(e => 
      e.severity === 'high' || e.severity === 'critical'
    ).length;
    
    const complianceScore = Math.max(0, 100 - (totalRiskEvents / events.length) * 100);

    const recommendations = this.generateComplianceRecommendations(violations, events);

    return {
      reportId: this.generateEventId(),
      generatedAt: new Date(),
      period: { start: startTime, end: endTime },
      totalEvents: events.length,
      complianceScore,
      violations,
      recommendations
    };
  }

  /**
   * Export audit logs
   */
  exportLogs(
    query: AuditQuery,
    format: 'json' | 'csv' | 'xml' = 'json'
  ): string {
    const events = this.queryEvents(query);
    
    switch (format) {
      case 'json':
        return JSON.stringify(events, null, 2);
        
      case 'csv':
        return this.convertToCSV(events);
        
      case 'xml':
        return this.convertToXML(events);
        
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Update indexes for fast querying
   */
  private updateIndexes(event: AuditEvent): void {
    // User index
    if (!this.userIndex.has(event.userId)) {
      this.userIndex.set(event.userId, []);
    }
    this.userIndex.get(event.userId)!.push(event);

    // Action index
    if (!this.actionIndex.has(event.action)) {
      this.actionIndex.set(event.action, []);
    }
    this.actionIndex.get(event.action)!.push(event);

    // Category index
    if (!this.categoryIndex.has(event.category)) {
      this.categoryIndex.set(event.category, []);
    }
    this.categoryIndex.get(event.category)!.push(event);
  }

  /**
   * Check for compliance violations
   */
  private checkComplianceViolations(event: AuditEvent): void {
    const violations: string[] = [];

    // Check for suspicious patterns
    if (event.category === 'data_access' && event.result === 'failure') {
      violations.push('unauthorized_access_attempt');
    }

    if (event.category === 'privacy' && event.severity === 'critical') {
      violations.push('privacy_violation');
    }

    if (violations.length > 0) {
      this.emit('complianceViolation', {
        eventId: event.id,
        violations,
        event
      });
    }
  }

  /**
   * Calculate risk scores for different operations
   */
  private calculateAuthRiskScore(
    action: string,
    result: string,
    details?: Record<string, any>
  ): number {
    let score = 0;
    
    if (result === 'failure') score += 30;
    if (action === 'login_failed') score += 20;
    if (details?.consecutiveFailures && details.consecutiveFailures > 3) score += 40;
    if (details?.unknownDevice) score += 25;
    
    return Math.min(100, score);
  }

  private calculateDataAccessRiskScore(
    action: string,
    resource: string,
    details?: Record<string, any>
  ): number {
    let score = 0;
    
    if (action === 'export') score += 30;
    if (resource.includes('sensitive') || resource.includes('pii')) score += 40;
    if (details?.largeDataset) score += 20;
    if (details?.offHours) score += 15;
    
    return Math.min(100, score);
  }

  private calculateMLRiskScore(operation: string, details?: Record<string, any>): number {
    let score = 0;
    
    if (operation === 'model_deployment') score += 25;
    if (operation === 'federated_learning') score += 15;
    if (details?.sensitiveData) score += 30;
    if (details?.productionModel) score += 20;
    
    return Math.min(100, score);
  }

  private calculatePrivacyRiskScore(
    operation: string,
    parameters?: Record<string, any>
  ): number {
    let score = 20; // Base score for privacy operations
    
    if (operation === 'differential_privacy_query') {
      if (parameters?.epsilon && parameters.epsilon > 1) score += 30;
      if (parameters?.budgetExhausted) score += 50;
    }
    
    if (operation === 'data_anonymization') score += 25;
    
    return Math.min(100, score);
  }

  /**
   * Get severity levels for different operations
   */
  private getDataAccessSeverity(action: string, resource: string): 'low' | 'medium' | 'high' | 'critical' {
    if (resource.includes('sensitive') || resource.includes('pii')) {
      return action === 'export' ? 'critical' : 'high';
    }
    return action === 'read' ? 'low' : 'medium';
  }

  private getMLOperationSeverity(operation: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (operation) {
      case 'model_deployment': return 'high';
      case 'model_training': return 'medium';
      case 'federated_learning': return 'high';
      case 'privacy_query': return 'high';
      default: return 'low';
    }
  }

  /**
   * Get compliance flags for operations
   */
  private getComplianceFlags(resource: string, action: string): string[] {
    const flags: string[] = [];
    
    if (resource.includes('pii') || resource.includes('personal')) {
      flags.push('GDPR', 'CCPA');
    }
    
    if (resource.includes('health') || resource.includes('medical')) {
      flags.push('HIPAA');
    }
    
    if (action === 'export') {
      flags.push('DATA_EXPORT');
    }
    
    return flags;
  }

  private getMLComplianceFlags(operation: string, details?: Record<string, any>): string[] {
    const flags: string[] = ['AI_GOVERNANCE'];
    
    if (operation === 'federated_learning') {
      flags.push('PRIVACY_PRESERVING_ML');
    }
    
    if (details?.biasDetection) {
      flags.push('FAIRNESS_COMPLIANCE');
    }
    
    return flags;
  }

  /**
   * Helper methods for data conversion
   */
  private convertToCSV(events: AuditEvent[]): string {
    if (events.length === 0) return '';
    
    const headers = Object.keys(events[0]).join(',');
    const rows = events.map(event => 
      Object.values(event).map(value => 
        typeof value === 'object' ? JSON.stringify(value) : String(value)
      ).join(',')
    );
    
    return [headers, ...rows].join('\n');
  }

  private convertToXML(events: AuditEvent[]): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<auditLogs>\n';
    
    events.forEach(event => {
      xml += '  <event>\n';
      Object.entries(event).forEach(([key, value]) => {
        const xmlValue = typeof value === 'object' 
          ? `<![CDATA[${JSON.stringify(value)}]]>`
          : String(value);
        xml += `    <${key}>${xmlValue}</${key}>\n`;
      });
      xml += '  </event>\n';
    });
    
    xml += '</auditLogs>';
    return xml;
  }

  /**
   * Calculate risk trends over time
   */
  private calculateRiskTrends(events: AuditEvent[]): Array<{ date: string; riskScore: number }> {
    const dailyRisks: Record<string, number[]> = {};
    
    events.forEach(event => {
      const date = event.timestamp.toISOString().split('T')[0];
      if (!dailyRisks[date]) {
        dailyRisks[date] = [];
      }
      if (event.riskScore) {
        dailyRisks[date].push(event.riskScore);
      }
    });
    
    return Object.entries(dailyRisks)
      .map(([date, scores]) => ({
        date,
        riskScore: scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Generate compliance recommendations
   */
  private generateComplianceRecommendations(
    violations: Array<{ type: string; count: number; severity: string; description: string }>,
    events: AuditEvent[]
  ): string[] {
    const recommendations: string[] = [];
    
    if (violations.some(v => v.type === 'unauthorized_access')) {
      recommendations.push('Implement stronger access controls and regular permission reviews');
    }
    
    if (violations.some(v => v.type === 'privacy_violation')) {
      recommendations.push('Review privacy policies and implement additional safeguards');
    }
    
    const highRiskEvents = events.filter(e => e.severity === 'high' || e.severity === 'critical');
    if (highRiskEvents.length > events.length * 0.1) {
      recommendations.push('High number of risk events detected - consider security assessment');
    }
    
    recommendations.push('Regular audit log reviews and compliance monitoring recommended');
    
    return recommendations;
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start cleanup scheduler
   */
  private startCleanupScheduler(): void {
    setInterval(() => {
      this.performCleanup();
    }, 24 * 60 * 60 * 1000); // Daily cleanup
  }

  /**
   * Perform cleanup of old events
   */
  private performCleanup(): void {
    const cutoffTime = new Date(Date.now() - this.retentionPeriod);
    
    this.events = this.events.filter(event => event.timestamp > cutoffTime);
    
    // Rebuild indexes
    this.eventIndex.clear();
    this.userIndex.clear();
    this.actionIndex.clear();
    this.categoryIndex.clear();
    
    this.events.forEach(event => {
      this.eventIndex.set(event.id, event);
      this.updateIndexes(event);
    });
    
    this.emit('cleanup', {
      eventsRemoved: this.events.length,
      cutoffTime
    });
  }

  /**
   * Enable/disable audit logging
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    this.emit('statusChanged', { enabled });
  }

  /**
   * Get current status
   */
  getStatus(): {
    enabled: boolean;
    totalEvents: number;
    retentionPeriod: number;
    maxEvents: number;
  } {
    return {
      enabled: this.isEnabled,
      totalEvents: this.events.length,
      retentionPeriod: this.retentionPeriod,
      maxEvents: this.maxEvents
    };
  }
}

export default AuditLogger;
export type { AuditEvent, AuditQuery, AuditMetrics, ComplianceReport };