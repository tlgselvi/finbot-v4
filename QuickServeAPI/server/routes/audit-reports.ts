/**
 * FinBot v4 - Audit Reports API Routes
 * REST endpoints for audit reporting and export functionality
 */

import { Router } from 'express';
import { z } from 'zod';
import { auditReportingService } from '../services/audit-reporting-service';
import { authenticateToken, requirePermission } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = Router();

// Validation schemas
const AuditReportFilterSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  userId: z.string().uuid().optional(),
  workflowStatus: z.array(z.string()).optional(),
  riskLevel: z.array(z.string()).optional(),
  transactionType: z.array(z.string()).optional(),
  amountRange: z.object({
    min: z.number().min(0),
    max: z.number().min(0)
  }).optional(),
  approverIds: z.array(z.string().uuid()).optional(),
  includeSystemActions: z.boolean().optional()
});

const ExportOptionsSchema = z.object({
  format: z.enum(['pdf', 'excel', 'csv', 'json']),
  includeCharts: z.boolean().optional(),
  includeDetails: z.boolean().optional(),
  template: z.enum(['standard', 'executive', 'compliance', 'detailed']).optional(),
  customFields: z.array(z.string()).optional()
});

const ScheduleReportSchema = z.object({
  schedule: z.enum(['daily', 'weekly', 'monthly']),
  filter: AuditReportFilterSchema.partial(),
  exportOptions: ExportOptionsSchema,
  recipients: z.array(z.string().email())
});

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * POST /api/audit-reports/generate
 * Generate audit report with specified filters
 */
router.post('/generate',
  requirePermission('generate_audit_reports'),
  validateRequest({ body: AuditReportFilterSchema }),
  async (req, res) => {
    try {
      const filter = {
        ...req.body,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate)
      };

      const reportData = await auditReportingService.generateAuditReport(filter);

      res.json({
        success: true,
        data: reportData,
        message: 'Audit report generated successfully'
      });

    } catch (error) {
      console.error('Generate audit report error:', error);
      res.status(500).json({
        error: 'Failed to generate audit report',
        code: 'GENERATE_REPORT_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * POST /api/audit-reports/export
 * Export audit report in specified format
 */
router.post('/export',
  requirePermission('export_audit_reports'),
  validateRequest({ 
    body: z.object({
      filter: AuditReportFilterSchema,
      exportOptions: ExportOptionsSchema
    })
  }),
  async (req, res) => {
    try {
      const { filter, exportOptions } = req.body;
      
      const filterWithDates = {
        ...filter,
        startDate: new Date(filter.startDate),
        endDate: new Date(filter.endDate)
      };

      // Generate report data
      const reportData = await auditReportingService.generateAuditReport(filterWithDates);

      // Export to specified format
      const filePath = await auditReportingService.exportAuditReport(
        reportData,
        exportOptions
      );

      res.json({
        success: true,
        data: {
          filePath,
          downloadUrl: `/api/audit-reports/download/${encodeURIComponent(filePath)}`,
          format: exportOptions.format,
          generatedAt: new Date().toISOString()
        },
        message: 'Report exported successfully'
      });

    } catch (error) {
      console.error('Export audit report error:', error);
      res.status(500).json({
        error: 'Failed to export audit report',
        code: 'EXPORT_REPORT_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * GET /api/audit-reports/download/:filePath
 * Download exported report file
 */
router.get('/download/:filePath',
  requirePermission('download_audit_reports'),
  async (req, res) => {
    try {
      const { filePath } = req.params;
      const decodedPath = decodeURIComponent(filePath);

      // Security check - ensure file is in exports directory
      if (!decodedPath.includes('exports/')) {
        return res.status(403).json({
          error: 'Access denied',
          code: 'INVALID_FILE_PATH',
          traceId: req.id
        });
      }

      // In a real implementation, this would serve the actual file
      res.json({
        success: true,
        message: 'File download would be initiated',
        filePath: decodedPath
      });

    } catch (error) {
      console.error('Download report error:', error);
      res.status(500).json({
        error: 'Failed to download report',
        code: 'DOWNLOAD_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * GET /api/audit-reports/templates
 * Get available report templates
 */
router.get('/templates',
  requirePermission('view_audit_reports'),
  async (req, res) => {
    try {
      const templates = auditReportingService.getReportTemplates();

      res.json({
        success: true,
        data: templates
      });

    } catch (error) {
      console.error('Get templates error:', error);
      res.status(500).json({
        error: 'Failed to get report templates',
        code: 'GET_TEMPLATES_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * POST /api/audit-reports/schedule
 * Schedule automated report generation
 */
router.post('/schedule',
  requirePermission('schedule_audit_reports'),
  validateRequest({ body: ScheduleReportSchema }),
  async (req, res) => {
    try {
      const { schedule, filter, exportOptions, recipients } = req.body;

      const jobId = await auditReportingService.scheduleAutomatedReport(
        schedule,
        filter,
        exportOptions,
        recipients
      );

      res.json({
        success: true,
        data: {
          jobId,
          schedule,
          recipients: recipients.length,
          nextRun: this.calculateNextRun(schedule)
        },
        message: 'Automated report scheduled successfully'
      });

    } catch (error) {
      console.error('Schedule report error:', error);
      res.status(500).json({
        error: 'Failed to schedule automated report',
        code: 'SCHEDULE_REPORT_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * GET /api/audit-reports/summary
 * Get quick audit summary for dashboard
 */
router.get('/summary',
  requirePermission('view_audit_reports'),
  async (req, res) => {
    try {
      const { days = '30' } = req.query;
      const daysNum = parseInt(days as string);

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysNum);

      const filter = {
        startDate,
        endDate
      };

      const reportData = await auditReportingService.generateAuditReport(filter);

      // Return only summary data for dashboard
      res.json({
        success: true,
        data: {
          summary: reportData.summary,
          riskAnalysis: {
            highRiskTransactions: reportData.riskAnalysis.highRiskTransactions,
            fraudDetected: reportData.riskAnalysis.fraudDetected,
            averageRiskScore: reportData.riskAnalysis.averageRiskScore
          },
          complianceScore: reportData.complianceMetrics.slaCompliance,
          period: {
            days: daysNum,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString()
          }
        }
      });

    } catch (error) {
      console.error('Get audit summary error:', error);
      res.status(500).json({
        error: 'Failed to get audit summary',
        code: 'GET_SUMMARY_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * GET /api/audit-reports/compliance-dashboard
 * Get compliance dashboard data
 */
router.get('/compliance-dashboard',
  requirePermission('view_compliance_reports'),
  async (req, res) => {
    try {
      const { period = '30' } = req.query;
      const days = parseInt(period as string);

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const filter = { startDate, endDate };
      const reportData = await auditReportingService.generateAuditReport(filter);

      const complianceDashboard = {
        overallScore: reportData.summary.complianceScore,
        metrics: reportData.complianceMetrics,
        riskDistribution: reportData.riskAnalysis.riskDistribution,
        trends: reportData.trends.approvalRates,
        alerts: [
          // Generate compliance alerts based on thresholds
          ...(reportData.complianceMetrics.slaCompliance < 90 ? [{
            type: 'warning',
            message: 'SLA compliance below 90%',
            value: reportData.complianceMetrics.slaCompliance,
            threshold: 90
          }] : []),
          ...(reportData.riskAnalysis.fraudDetected > 0 ? [{
            type: 'critical',
            message: `${reportData.riskAnalysis.fraudDetected} fraud cases detected`,
            value: reportData.riskAnalysis.fraudDetected,
            threshold: 0
          }] : [])
        ],
        recommendations: this.generateComplianceRecommendations(reportData)
      };

      res.json({
        success: true,
        data: complianceDashboard
      });

    } catch (error) {
      console.error('Get compliance dashboard error:', error);
      res.status(500).json({
        error: 'Failed to get compliance dashboard',
        code: 'COMPLIANCE_DASHBOARD_ERROR',
        details: error.message,
        traceId: req.id
      });
    }
  }
);

/**
 * Helper method to calculate next run time
 */
function calculateNextRun(schedule: string): string {
  const now = new Date();
  const nextRun = new Date(now);

  switch (schedule) {
    case 'daily':
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(9, 0, 0, 0); // 9 AM next day
      break;
    case 'weekly':
      nextRun.setDate(nextRun.getDate() + (7 - nextRun.getDay() + 1)); // Next Monday
      nextRun.setHours(9, 0, 0, 0);
      break;
    case 'monthly':
      nextRun.setMonth(nextRun.getMonth() + 1, 1); // First day of next month
      nextRun.setHours(9, 0, 0, 0);
      break;
  }

  return nextRun.toISOString();
}

/**
 * Helper method to generate compliance recommendations
 */
function generateComplianceRecommendations(reportData: any): string[] {
  const recommendations = [];

  if (reportData.complianceMetrics.slaCompliance < 90) {
    recommendations.push('Improve SLA compliance by optimizing approval workflows');
  }

  if (reportData.riskAnalysis.fraudDetected > 0) {
    recommendations.push('Review and strengthen fraud detection mechanisms');
  }

  if (reportData.riskAnalysis.averageRiskScore > 50) {
    recommendations.push('Consider tightening approval criteria for high-risk transactions');
  }

  if (reportData.summary.averageProcessingTime > 24) {
    recommendations.push('Streamline approval processes to reduce processing time');
  }

  return recommendations;
}

export default router;