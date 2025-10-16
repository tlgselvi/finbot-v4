/**
 * FinBot v4 - Audit Reporting Service
 * Generate comprehensive audit reports and export functionality
 */

import { eq, and, desc, gte, lte, sql, between } from 'drizzle-orm';
import { db } from '../db';
import { approvalWorkflows, approvalActions, riskAssessments, approvalRules } from '../db/approval-schema';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { createWriteStream } from 'fs';
import { join } from 'path';

export interface AuditReportFilter {
  startDate: Date;
  endDate: Date;
  userId?: string;
  workflowStatus?: string[];
  riskLevel?: string[];
  transactionType?: string[];
  amountRange?: { min: number; max: number };
  approverIds?: string[];
  includeSystemActions?: boolean;
}

export interface AuditReportData {
  summary: {
    totalWorkflows: number;
    totalActions: number;
    approvedWorkflows: number;
    rejectedWorkflows: number;
    pendingWorkflows: number;
    averageProcessingTime: number;
    complianceScore: number;
  };
  workflows: Array<{
    id: string;
    transactionId: string;
    requesterId: string;
    status: string;
    riskScore: number;
    riskLevel: string;
    currentLevel: number;
    totalLevels: number;
    createdAt: Date;
    completedAt?: Date;
    processingTime?: number;
    actions: Array<{
      id: string;
      approverId: string;
      level: number;
      action: string;
      comments?: string;
      createdAt: Date;
      ipAddress?: string;
    }>;
  }>;
  riskAnalysis: {
    riskDistribution: Record<string, number>;
    highRiskTransactions: number;
    fraudDetected: number;
    averageRiskScore: number;
  };
  complianceMetrics: {
    slaCompliance: number;
    approvalAccuracy: number;
    auditTrailCompleteness: number;
    segregationOfDuties: number;
  };
  trends: {
    dailyVolume: Array<{ date: string; count: number; amount: number }>;
    approvalRates: Array<{ period: string; approved: number; rejected: number }>;
    riskTrends: Array<{ period: string; averageRisk: number }>;
  };
}

export interface ExportOptions {
  format: 'pdf' | 'excel' | 'csv' | 'json';
  includeCharts?: boolean;
  includeDetails?: boolean;
  template?: 'standard' | 'executive' | 'compliance' | 'detailed';
  customFields?: string[];
}

export class AuditReportingService {
  /**
   * Generate comprehensive audit report
   */
  async generateAuditReport(filter: AuditReportFilter): Promise<AuditReportData> {
    try {
      const [
        workflows,
        summary,
        riskAnalysis,
        complianceMetrics,
        trends
      ] = await Promise.all([
        this.getWorkflowData(filter),
        this.generateSummary(filter),
        this.generateRiskAnalysis(filter),
        this.generateComplianceMetrics(filter),
        this.generateTrends(filter)
      ]);

      return {
        summary,
        workflows,
        riskAnalysis,
        complianceMetrics,
        trends
      };

    } catch (error) {
      console.error('Audit report generation error:', error);
      throw new Error(`Failed to generate audit report: ${error.message}`);
    }
  }

  /**
   * Get workflow data with filters
   */
  private async getWorkflowData(filter: AuditReportFilter) {
    const conditions = [
      gte(approvalWorkflows.createdAt, filter.startDate),
      lte(approvalWorkflows.createdAt, filter.endDate)
    ];

    if (filter.userId) {
      conditions.push(eq(approvalWorkflows.requesterId, filter.userId));
    }

    if (filter.workflowStatus && filter.workflowStatus.length > 0) {
      conditions.push(sql`${approvalWorkflows.status} IN ${filter.workflowStatus}`);
    }

    const workflows = await db
      .select({
        workflow: approvalWorkflows,
        riskAssessment: riskAssessments
      })
      .from(approvalWorkflows)
      .leftJoin(riskAssessments, eq(riskAssessments.workflowId, approvalWorkflows.id))
      .where(and(...conditions))
      .orderBy(desc(approvalWorkflows.createdAt));

    // Get actions for each workflow
    const workflowsWithActions = await Promise.all(
      workflows.map(async (item) => {
        const actions = await db
          .select()
          .from(approvalActions)
          .where(eq(approvalActions.workflowId, item.workflow.id))
          .orderBy(desc(approvalActions.createdAt));

        const processingTime = item.workflow.completedAt
          ? (item.workflow.completedAt.getTime() - item.workflow.createdAt.getTime()) / (1000 * 60 * 60)
          : undefined;

        return {
          id: item.workflow.id,
          transactionId: item.workflow.transactionId,
          requesterId: item.workflow.requesterId,
          status: item.workflow.status,
          riskScore: parseFloat(item.riskAssessment?.riskScore || '0'),
          riskLevel: item.riskAssessment?.riskLevel || 'unknown',
          currentLevel: item.workflow.currentLevel,
          totalLevels: item.workflow.totalLevels,
          createdAt: item.workflow.createdAt,
          completedAt: item.workflow.completedAt,
          processingTime,
          actions: actions.map(action => ({
            id: action.id,
            approverId: action.approverId,
            level: action.level,
            action: action.action,
            comments: action.comments,
            createdAt: action.createdAt,
            ipAddress: action.ipAddress
          }))
        };
      })
    );

    return workflowsWithActions;
  }

  /**
   * Generate summary statistics
   */
  private async generateSummary(filter: AuditReportFilter) {
    const conditions = [
      gte(approvalWorkflows.createdAt, filter.startDate),
      lte(approvalWorkflows.createdAt, filter.endDate)
    ];

    const [
      totalWorkflows,
      approvedWorkflows,
      rejectedWorkflows,
      pendingWorkflows,
      totalActions
    ] = await Promise.all([
      db.select({ count: sql`count(*)` })
        .from(approvalWorkflows)
        .where(and(...conditions)),
      
      db.select({ count: sql`count(*)` })
        .from(approvalWorkflows)
        .where(and(...conditions, eq(approvalWorkflows.status, 'approved'))),
      
      db.select({ count: sql`count(*)` })
        .from(approvalWorkflows)
        .where(and(...conditions, eq(approvalWorkflows.status, 'rejected'))),
      
      db.select({ count: sql`count(*)` })
        .from(approvalWorkflows)
        .where(and(...conditions, eq(approvalWorkflows.status, 'pending'))),
      
      db.select({ count: sql`count(*)` })
        .from(approvalActions)
        .leftJoin(approvalWorkflows, eq(approvalActions.workflowId, approvalWorkflows.id))
        .where(and(...conditions))
    ]);

    // Calculate average processing time
    const completedWorkflows = await db
      .select({
        createdAt: approvalWorkflows.createdAt,
        completedAt: approvalWorkflows.completedAt
      })
      .from(approvalWorkflows)
      .where(and(
        ...conditions,
        sql`${approvalWorkflows.completedAt} IS NOT NULL`
      ));

    const averageProcessingTime = completedWorkflows.length > 0
      ? completedWorkflows.reduce((sum, workflow) => {
          const processingTime = (workflow.completedAt!.getTime() - workflow.createdAt.getTime()) / (1000 * 60 * 60);
          return sum + processingTime;
        }, 0) / completedWorkflows.length
      : 0;

    // Calculate compliance score (simplified)
    const complianceScore = this.calculateComplianceScore({
      totalWorkflows: parseInt(totalWorkflows[0]?.count || '0'),
      completedOnTime: completedWorkflows.length,
      averageProcessingTime
    });

    return {
      totalWorkflows: parseInt(totalWorkflows[0]?.count || '0'),
      totalActions: parseInt(totalActions[0]?.count || '0'),
      approvedWorkflows: parseInt(approvedWorkflows[0]?.count || '0'),
      rejectedWorkflows: parseInt(rejectedWorkflows[0]?.count || '0'),
      pendingWorkflows: parseInt(pendingWorkflows[0]?.count || '0'),
      averageProcessingTime,
      complianceScore
    };
  }

  /**
   * Generate risk analysis
   */
  private async generateRiskAnalysis(filter: AuditReportFilter) {
    const conditions = [
      gte(approvalWorkflows.createdAt, filter.startDate),
      lte(approvalWorkflows.createdAt, filter.endDate)
    ];

    const riskData = await db
      .select({
        riskLevel: riskAssessments.riskLevel,
        riskScore: riskAssessments.riskScore,
        fraudIndicators: riskAssessments.fraudIndicators
      })
      .from(riskAssessments)
      .leftJoin(approvalWorkflows, eq(riskAssessments.workflowId, approvalWorkflows.id))
      .where(and(...conditions));

    const riskDistribution = riskData.reduce((acc, item) => {
      const level = item.riskLevel || 'unknown';
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const highRiskTransactions = riskData.filter(
      item => item.riskLevel === 'high' || item.riskLevel === 'critical'
    ).length;

    const fraudDetected = riskData.filter(
      item => item.fraudIndicators && 
              typeof item.fraudIndicators === 'object' && 
              'indicators' in item.fraudIndicators &&
              Array.isArray(item.fraudIndicators.indicators) &&
              item.fraudIndicators.indicators.length > 0
    ).length;

    const averageRiskScore = riskData.length > 0
      ? riskData.reduce((sum, item) => sum + parseFloat(item.riskScore || '0'), 0) / riskData.length
      : 0;

    return {
      riskDistribution,
      highRiskTransactions,
      fraudDetected,
      averageRiskScore
    };
  }

  /**
   * Generate compliance metrics
   */
  private async generateComplianceMetrics(filter: AuditReportFilter) {
    // This would calculate various compliance metrics
    // For now, returning mock data structure
    return {
      slaCompliance: 85.5, // Percentage of workflows completed within SLA
      approvalAccuracy: 92.3, // Percentage of correct approval decisions
      auditTrailCompleteness: 98.7, // Percentage of complete audit trails
      segregationOfDuties: 94.2 // Percentage compliance with segregation rules
    };
  }

  /**
   * Generate trend data
   */
  private async generateTrends(filter: AuditReportFilter) {
    // Generate daily volume trends
    const dailyVolume = await this.generateDailyVolumeTrends(filter);
    
    // Generate approval rate trends
    const approvalRates = await this.generateApprovalRateTrends(filter);
    
    // Generate risk trends
    const riskTrends = await this.generateRiskTrends(filter);

    return {
      dailyVolume,
      approvalRates,
      riskTrends
    };
  }

  /**
   * Generate daily volume trends
   */
  private async generateDailyVolumeTrends(filter: AuditReportFilter) {
    const trends = [];
    const startDate = new Date(filter.startDate);
    const endDate = new Date(filter.endDate);

    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const dayStart = new Date(date);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const dayData = await db
        .select({ count: sql`count(*)` })
        .from(approvalWorkflows)
        .where(
          and(
            gte(approvalWorkflows.createdAt, dayStart),
            lte(approvalWorkflows.createdAt, dayEnd)
          )
        );

      trends.push({
        date: date.toISOString().split('T')[0],
        count: parseInt(dayData[0]?.count || '0'),
        amount: 0 // Would calculate from actual transaction amounts
      });
    }

    return trends;
  }

  /**
   * Generate approval rate trends
   */
  private async generateApprovalRateTrends(filter: AuditReportFilter) {
    // This would generate weekly or monthly approval rate trends
    // For now, returning mock data
    return [
      { period: 'Week 1', approved: 85, rejected: 15 },
      { period: 'Week 2', approved: 78, rejected: 22 },
      { period: 'Week 3', approved: 92, rejected: 8 },
      { period: 'Week 4', approved: 88, rejected: 12 }
    ];
  }

  /**
   * Generate risk trends
   */
  private async generateRiskTrends(filter: AuditReportFilter) {
    // This would generate risk score trends over time
    // For now, returning mock data
    return [
      { period: 'Week 1', averageRisk: 35.2 },
      { period: 'Week 2', averageRisk: 42.1 },
      { period: 'Week 3', averageRisk: 28.7 },
      { period: 'Week 4', averageRisk: 31.5 }
    ];
  }

  /**
   * Export audit report in specified format
   */
  async exportAuditReport(
    reportData: AuditReportData,
    options: ExportOptions,
    outputPath?: string
  ): Promise<string> {
    try {
      switch (options.format) {
        case 'pdf':
          return await this.exportToPDF(reportData, options, outputPath);
        case 'excel':
          return await this.exportToExcel(reportData, options, outputPath);
        case 'csv':
          return await this.exportToCSV(reportData, options, outputPath);
        case 'json':
          return await this.exportToJSON(reportData, options, outputPath);
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      throw new Error(`Failed to export report: ${error.message}`);
    }
  }

  /**
   * Export to PDF
   */
  private async exportToPDF(
    reportData: AuditReportData,
    options: ExportOptions,
    outputPath?: string
  ): Promise<string> {
    const filePath = outputPath || join(process.cwd(), 'exports', `audit-report-${Date.now()}.pdf`);
    
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const stream = createWriteStream(filePath);
        doc.pipe(stream);

        // Header
        doc.fontSize(20).text('Audit Report', { align: 'center' });
        doc.moveDown();

        // Summary Section
        doc.fontSize(16).text('Executive Summary');
        doc.fontSize(12);
        doc.text(`Total Workflows: ${reportData.summary.totalWorkflows}`);
        doc.text(`Approved: ${reportData.summary.approvedWorkflows}`);
        doc.text(`Rejected: ${reportData.summary.rejectedWorkflows}`);
        doc.text(`Pending: ${reportData.summary.pendingWorkflows}`);
        doc.text(`Average Processing Time: ${reportData.summary.averageProcessingTime.toFixed(2)} hours`);
        doc.text(`Compliance Score: ${reportData.summary.complianceScore.toFixed(1)}%`);
        doc.moveDown();

        // Risk Analysis Section
        doc.fontSize(16).text('Risk Analysis');
        doc.fontSize(12);
        doc.text(`High Risk Transactions: ${reportData.riskAnalysis.highRiskTransactions}`);
        doc.text(`Fraud Detected: ${reportData.riskAnalysis.fraudDetected}`);
        doc.text(`Average Risk Score: ${reportData.riskAnalysis.averageRiskScore.toFixed(1)}`);
        doc.moveDown();

        // Risk Distribution
        doc.text('Risk Distribution:');
        Object.entries(reportData.riskAnalysis.riskDistribution).forEach(([level, count]) => {
          doc.text(`  ${level}: ${count}`);
        });
        doc.moveDown();

        // Compliance Metrics
        doc.fontSize(16).text('Compliance Metrics');
        doc.fontSize(12);
        doc.text(`SLA Compliance: ${reportData.complianceMetrics.slaCompliance.toFixed(1)}%`);
        doc.text(`Approval Accuracy: ${reportData.complianceMetrics.approvalAccuracy.toFixed(1)}%`);
        doc.text(`Audit Trail Completeness: ${reportData.complianceMetrics.auditTrailCompleteness.toFixed(1)}%`);
        doc.text(`Segregation of Duties: ${reportData.complianceMetrics.segregationOfDuties.toFixed(1)}%`);

        // Include detailed workflow data if requested
        if (options.includeDetails) {
          doc.addPage();
          doc.fontSize(16).text('Detailed Workflow Data');
          doc.fontSize(10);
          
          reportData.workflows.slice(0, 50).forEach((workflow, index) => {
            if (index > 0 && index % 20 === 0) {
              doc.addPage();
            }
            
            doc.text(`Workflow ${workflow.id}:`);
            doc.text(`  Status: ${workflow.status}`);
            doc.text(`  Risk Level: ${workflow.riskLevel}`);
            doc.text(`  Processing Time: ${workflow.processingTime?.toFixed(2) || 'N/A'} hours`);
            doc.text(`  Actions: ${workflow.actions.length}`);
            doc.moveDown(0.5);
          });
        }

        doc.end();

        stream.on('finish', () => {
          resolve(filePath);
        });

        stream.on('error', (error) => {
          reject(error);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Export to Excel
   */
  private async exportToExcel(
    reportData: AuditReportData,
    options: ExportOptions,
    outputPath?: string
  ): Promise<string> {
    const filePath = outputPath || join(process.cwd(), 'exports', `audit-report-${Date.now()}.xlsx`);

    const workbook = XLSX.utils.book_new();

    // Summary Sheet
    const summaryData = [
      ['Metric', 'Value'],
      ['Total Workflows', reportData.summary.totalWorkflows],
      ['Approved Workflows', reportData.summary.approvedWorkflows],
      ['Rejected Workflows', reportData.summary.rejectedWorkflows],
      ['Pending Workflows', reportData.summary.pendingWorkflows],
      ['Average Processing Time (hours)', reportData.summary.averageProcessingTime.toFixed(2)],
      ['Compliance Score (%)', reportData.summary.complianceScore.toFixed(1)]
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Workflows Sheet
    if (options.includeDetails) {
      const workflowData = [
        ['Workflow ID', 'Transaction ID', 'Status', 'Risk Level', 'Risk Score', 'Processing Time (hours)', 'Actions Count']
      ];
      
      reportData.workflows.forEach(workflow => {
        workflowData.push([
          workflow.id,
          workflow.transactionId,
          workflow.status,
          workflow.riskLevel,
          workflow.riskScore,
          workflow.processingTime?.toFixed(2) || 'N/A',
          workflow.actions.length
        ]);
      });

      const workflowSheet = XLSX.utils.aoa_to_sheet(workflowData);
      XLSX.utils.book_append_sheet(workbook, workflowSheet, 'Workflows');
    }

    // Risk Analysis Sheet
    const riskData = [
      ['Risk Level', 'Count'],
      ...Object.entries(reportData.riskAnalysis.riskDistribution)
    ];
    const riskSheet = XLSX.utils.aoa_to_sheet(riskData);
    XLSX.utils.book_append_sheet(workbook, riskSheet, 'Risk Analysis');

    // Compliance Metrics Sheet
    const complianceData = [
      ['Metric', 'Score (%)'],
      ['SLA Compliance', reportData.complianceMetrics.slaCompliance.toFixed(1)],
      ['Approval Accuracy', reportData.complianceMetrics.approvalAccuracy.toFixed(1)],
      ['Audit Trail Completeness', reportData.complianceMetrics.auditTrailCompleteness.toFixed(1)],
      ['Segregation of Duties', reportData.complianceMetrics.segregationOfDuties.toFixed(1)]
    ];
    const complianceSheet = XLSX.utils.aoa_to_sheet(complianceData);
    XLSX.utils.book_append_sheet(workbook, complianceSheet, 'Compliance');

    XLSX.writeFile(workbook, filePath);
    return filePath;
  }

  /**
   * Export to CSV
   */
  private async exportToCSV(
    reportData: AuditReportData,
    options: ExportOptions,
    outputPath?: string
  ): Promise<string> {
    const filePath = outputPath || join(process.cwd(), 'exports', `audit-report-${Date.now()}.csv`);

    const csvData = [
      ['Workflow ID', 'Transaction ID', 'Status', 'Risk Level', 'Risk Score', 'Processing Time (hours)', 'Actions Count', 'Created At', 'Completed At']
    ];

    reportData.workflows.forEach(workflow => {
      csvData.push([
        workflow.id,
        workflow.transactionId,
        workflow.status,
        workflow.riskLevel,
        workflow.riskScore.toString(),
        workflow.processingTime?.toFixed(2) || 'N/A',
        workflow.actions.length.toString(),
        workflow.createdAt.toISOString(),
        workflow.completedAt?.toISOString() || 'N/A'
      ]);
    });

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    
    // Write to file (would use fs.writeFileSync in actual implementation)
    console.log(`CSV export would be written to: ${filePath}`);
    
    return filePath;
  }

  /**
   * Export to JSON
   */
  private async exportToJSON(
    reportData: AuditReportData,
    options: ExportOptions,
    outputPath?: string
  ): Promise<string> {
    const filePath = outputPath || join(process.cwd(), 'exports', `audit-report-${Date.now()}.json`);

    const jsonContent = JSON.stringify(reportData, null, 2);
    
    // Write to file (would use fs.writeFileSync in actual implementation)
    console.log(`JSON export would be written to: ${filePath}`);
    
    return filePath;
  }

  /**
   * Calculate compliance score
   */
  private calculateComplianceScore(metrics: {
    totalWorkflows: number;
    completedOnTime: number;
    averageProcessingTime: number;
  }): number {
    if (metrics.totalWorkflows === 0) return 100;

    // Simple compliance scoring algorithm
    const slaCompliance = (metrics.completedOnTime / metrics.totalWorkflows) * 100;
    const timeEfficiency = Math.max(0, 100 - (metrics.averageProcessingTime / 24) * 10); // Penalty for long processing times
    
    return Math.min(100, (slaCompliance * 0.7) + (timeEfficiency * 0.3));
  }

  /**
   * Schedule automated report generation
   */
  async scheduleAutomatedReport(
    schedule: 'daily' | 'weekly' | 'monthly',
    filter: Partial<AuditReportFilter>,
    exportOptions: ExportOptions,
    recipients: string[]
  ): Promise<string> {
    // This would integrate with a job scheduler like node-cron
    // For now, just return a scheduled job ID
    const jobId = `audit-report-${schedule}-${Date.now()}`;
    
    console.log(`Scheduled ${schedule} audit report with ID: ${jobId}`);
    console.log(`Recipients: ${recipients.join(', ')}`);
    console.log(`Export format: ${exportOptions.format}`);
    
    return jobId;
  }

  /**
   * Get available report templates
   */
  getReportTemplates(): Array<{
    id: string;
    name: string;
    description: string;
    sections: string[];
  }> {
    return [
      {
        id: 'standard',
        name: 'Standard Audit Report',
        description: 'Comprehensive audit report with all standard sections',
        sections: ['summary', 'workflows', 'risk_analysis', 'compliance', 'trends']
      },
      {
        id: 'executive',
        name: 'Executive Summary',
        description: 'High-level summary for executive review',
        sections: ['summary', 'compliance', 'trends']
      },
      {
        id: 'compliance',
        name: 'Compliance Report',
        description: 'Focused on regulatory compliance metrics',
        sections: ['compliance', 'risk_analysis', 'workflows']
      },
      {
        id: 'detailed',
        name: 'Detailed Analysis',
        description: 'In-depth analysis with all available data',
        sections: ['summary', 'workflows', 'risk_analysis', 'compliance', 'trends', 'actions']
      }
    ];
  }
}

// Export singleton instance
export const auditReportingService = new AuditReportingService();