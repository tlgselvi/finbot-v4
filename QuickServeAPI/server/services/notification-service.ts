/**
 * FinBot v4 - Notification Service
 * Multi-channel notification system for approval workflows
 */

import { getWebSocketService } from './websocket-service';
import { auditService } from './audit-service';

export interface NotificationChannel {
  type: 'websocket' | 'email' | 'sms' | 'slack' | 'teams';
  enabled: boolean;
  config?: Record<string, any>;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  channels: NotificationChannel[];
  variables: string[];
}

export interface NotificationRequest {
  templateId: string;
  recipients: {
    userId: string;
    email?: string;
    phone?: string;
    slackId?: string;
    teamsId?: string;
  }[];
  variables: Record<string, any>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  workflowId?: string;
  metadata?: Record<string, any>;
}

export class NotificationService {
  private templates: Map<string, NotificationTemplate> = new Map();
  private deliveryQueue: NotificationRequest[] = [];
  private processing = false;

  constructor() {
    this.initializeDefaultTemplates();
    this.startQueueProcessor();
  }

  /**
   * Initialize default notification templates
   */
  private initializeDefaultTemplates() {
    const defaultTemplates: NotificationTemplate[] = [
      {
        id: 'workflow_assigned',
        name: 'Workflow Assigned',
        subject: 'New Approval Request - {{transactionType}} {{amount}} {{currency}}',
        body: `
          <h3>New Approval Request</h3>
          <p>A new workflow has been assigned to you for approval.</p>
          <ul>
            <li><strong>Transaction Type:</strong> {{transactionType}}</li>
            <li><strong>Amount:</strong> {{amount}} {{currency}}</li>
            <li><strong>Requester:</strong> {{requesterName}}</li>
            <li><strong>Risk Level:</strong> {{riskLevel}}</li>
            <li><strong>Current Level:</strong> {{currentLevel}} of {{totalLevels}}</li>
          </ul>
          <p><a href="{{approvalUrl}}">Review and Approve</a></p>
        `,
        channels: [
          { type: 'websocket', enabled: true },
          { type: 'email', enabled: true }
        ],
        variables: ['transactionType', 'amount', 'currency', 'requesterName', 'riskLevel', 'currentLevel', 'totalLevels', 'approvalUrl']
      },
      {
        id: 'workflow_approved',
        name: 'Workflow Approved',
        subject: 'Approval Completed - {{transactionType}} {{amount}} {{currency}}',
        body: `
          <h3>Approval Completed</h3>
          <p>Your workflow has been approved and completed.</p>
          <ul>
            <li><strong>Transaction Type:</strong> {{transactionType}}</li>
            <li><strong>Amount:</strong> {{amount}} {{currency}}</li>
            <li><strong>Approved By:</strong> {{approverName}}</li>
            <li><strong>Completion Time:</strong> {{completionTime}}</li>
          </ul>
          {{#if comments}}<p><strong>Comments:</strong> {{comments}}</p>{{/if}}
        `,
        channels: [
          { type: 'websocket', enabled: true },
          { type: 'email', enabled: true }
        ],
        variables: ['transactionType', 'amount', 'currency', 'approverName', 'completionTime', 'comments']
      },
      {
        id: 'workflow_rejected',
        name: 'Workflow Rejected',
        subject: 'Approval Rejected - {{transactionType}} {{amount}} {{currency}}',
        body: `
          <h3>Approval Rejected</h3>
          <p>Your workflow has been rejected.</p>
          <ul>
            <li><strong>Transaction Type:</strong> {{transactionType}}</li>
            <li><strong>Amount:</strong> {{amount}} {{currency}}</li>
            <li><strong>Rejected By:</strong> {{approverName}}</li>
            <li><strong>Rejection Time:</strong> {{rejectionTime}}</li>
          </ul>
          <p><strong>Reason:</strong> {{rejectionReason}}</p>
          {{#if canResubmit}}<p><a href="{{resubmitUrl}}">Modify and Resubmit</a></p>{{/if}}
        `,
        channels: [
          { type: 'websocket', enabled: true },
          { type: 'email', enabled: true }
        ],
        variables: ['transactionType', 'amount', 'currency', 'approverName', 'rejectionTime', 'rejectionReason', 'canResubmit', 'resubmitUrl']
      },
      {
        id: 'workflow_delegated',
        name: 'Workflow Delegated',
        subject: 'Workflow Delegated to You - {{transactionType}} {{amount}} {{currency}}',
        body: `
          <h3>Workflow Delegated</h3>
          <p>A workflow has been delegated to you for approval.</p>
          <ul>
            <li><strong>Transaction Type:</strong> {{transactionType}}</li>
            <li><strong>Amount:</strong> {{amount}} {{currency}}</li>
            <li><strong>Delegated By:</strong> {{delegatorName}}</li>
            <li><strong>Delegation Reason:</strong> {{delegationReason}}</li>
            <li><strong>Current Level:</strong> {{currentLevel}} of {{totalLevels}}</li>
          </ul>
          <p><a href="{{approvalUrl}}">Review and Approve</a></p>
        `,
        channels: [
          { type: 'websocket', enabled: true },
          { type: 'email', enabled: true }
        ],
        variables: ['transactionType', 'amount', 'currency', 'delegatorName', 'delegationReason', 'currentLevel', 'totalLevels', 'approvalUrl']
      },
      {
        id: 'workflow_escalated',
        name: 'Workflow Escalated',
        subject: 'URGENT: Workflow Escalated - {{transactionType}} {{amount}} {{currency}}',
        body: `
          <h3>🚨 Urgent: Workflow Escalated</h3>
          <p>A workflow has been escalated and requires immediate attention.</p>
          <ul>
            <li><strong>Transaction Type:</strong> {{transactionType}}</li>
            <li><strong>Amount:</strong> {{amount}} {{currency}}</li>
            <li><strong>Escalated By:</strong> {{escalatorName}}</li>
            <li><strong>Escalation Reason:</strong> {{escalationReason}}</li>
            <li><strong>New Level:</strong> {{newLevel}} of {{totalLevels}}</li>
            <li><strong>Risk Level:</strong> {{riskLevel}}</li>
          </ul>
          <p><a href="{{approvalUrl}}">Review Immediately</a></p>
        `,
        channels: [
          { type: 'websocket', enabled: true },
          { type: 'email', enabled: true },
          { type: 'sms', enabled: true }
        ],
        variables: ['transactionType', 'amount', 'currency', 'escalatorName', 'escalationReason', 'newLevel', 'totalLevels', 'riskLevel', 'approvalUrl']
      },
      {
        id: 'workflow_overdue',
        name: 'Workflow Overdue',
        subject: 'OVERDUE: Approval Required - {{transactionType}} {{amount}} {{currency}}',
        body: `
          <h3>⚠️ Overdue Approval</h3>
          <p>A workflow assigned to you is overdue and requires immediate attention.</p>
          <ul>
            <li><strong>Transaction Type:</strong> {{transactionType}}</li>
            <li><strong>Amount:</strong> {{amount}} {{currency}}</li>
            <li><strong>Days Overdue:</strong> {{daysOverdue}}</li>
            <li><strong>SLA Breach:</strong> {{slaBreached}}</li>
            <li><strong>Current Level:</strong> {{currentLevel}} of {{totalLevels}}</li>
          </ul>
          <p><a href="{{approvalUrl}}">Approve Now</a></p>
        `,
        channels: [
          { type: 'websocket', enabled: true },
          { type: 'email', enabled: true },
          { type: 'sms', enabled: true }
        ],
        variables: ['transactionType', 'amount', 'currency', 'daysOverdue', 'slaBreached', 'currentLevel', 'totalLevels', 'approvalUrl']
      }
    ];

    defaultTemplates.forEach(template => {
      this.templates.set(template.id, template);
    });
  }

  /**
   * Send notification using specified template
   */
  async sendNotification(request: NotificationRequest): Promise<{
    success: boolean;
    deliveryResults: Array<{
      channel: string;
      recipient: string;
      success: boolean;
      error?: string;
    }>;
  }> {
    try {
      const template = this.templates.get(request.templateId);
      if (!template) {
        throw new Error(`Template ${request.templateId} not found`);
      }

      const deliveryResults: Array<{
        channel: string;
        recipient: string;
        success: boolean;
        error?: string;
      }> = [];

      // Process each recipient
      for (const recipient of request.recipients) {
        // Process each enabled channel
        for (const channel of template.channels) {
          if (!channel.enabled) continue;

          try {
            await this.deliverNotification(
              channel,
              recipient,
              template,
              request.variables,
              request.priority
            );

            deliveryResults.push({
              channel: channel.type,
              recipient: recipient.userId,
              success: true
            });

          } catch (error) {
            console.error(`Failed to deliver ${channel.type} notification to ${recipient.userId}:`, error);
            deliveryResults.push({
              channel: channel.type,
              recipient: recipient.userId,
              success: false,
              error: error.message
            });
          }
        }
      }

      // Log notification attempt
      await auditService.logNotification({
        templateId: request.templateId,
        recipients: request.recipients.map(r => r.userId),
        workflowId: request.workflowId,
        priority: request.priority,
        deliveryResults,
        timestamp: new Date()
      });

      return {
        success: deliveryResults.some(r => r.success),
        deliveryResults
      };

    } catch (error) {
      console.error('Send notification error:', error);
      throw new Error(`Failed to send notification: ${error.message}`);
    }
  }

  /**
   * Deliver notification via specific channel
   */
  private async deliverNotification(
    channel: NotificationChannel,
    recipient: any,
    template: NotificationTemplate,
    variables: Record<string, any>,
    priority: string
  ) {
    const renderedSubject = this.renderTemplate(template.subject, variables);
    const renderedBody = this.renderTemplate(template.body, variables);

    switch (channel.type) {
      case 'websocket':
        await this.deliverWebSocketNotification(recipient.userId, {
          subject: renderedSubject,
          body: renderedBody,
          priority,
          templateId: template.id
        });
        break;

      case 'email':
        await this.deliverEmailNotification(recipient.email, {
          subject: renderedSubject,
          body: renderedBody,
          priority
        });
        break;

      case 'sms':
        await this.deliverSMSNotification(recipient.phone, {
          message: renderedSubject, // SMS uses subject as message
          priority
        });
        break;

      case 'slack':
        await this.deliverSlackNotification(recipient.slackId, {
          text: renderedSubject,
          blocks: this.convertToSlackBlocks(renderedBody),
          priority
        });
        break;

      case 'teams':
        await this.deliverTeamsNotification(recipient.teamsId, {
          title: renderedSubject,
          text: renderedBody,
          priority
        });
        break;

      default:
        throw new Error(`Unsupported notification channel: ${channel.type}`);
    }
  }

  /**
   * Deliver WebSocket notification
   */
  private async deliverWebSocketNotification(userId: string, notification: any) {
    try {
      const wsService = getWebSocketService();
      wsService.notifyUser(userId, {
        type: 'workflow_updated',
        workflowId: notification.workflowId || 'system',
        userId,
        data: notification,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('WebSocket delivery error:', error);
      throw error;
    }
  }

  /**
   * Deliver email notification
   */
  private async deliverEmailNotification(email: string, notification: any) {
    // This would integrate with email service (SendGrid, AWS SES, etc.)
    console.log(`Email notification sent to ${email}:`, notification.subject);
    
    // Mock implementation - would be replaced with actual email service
    return Promise.resolve();
  }

  /**
   * Deliver SMS notification
   */
  private async deliverSMSNotification(phone: string, notification: any) {
    // This would integrate with SMS service (Twilio, AWS SNS, etc.)
    console.log(`SMS notification sent to ${phone}:`, notification.message);
    
    // Mock implementation - would be replaced with actual SMS service
    return Promise.resolve();
  }

  /**
   * Deliver Slack notification
   */
  private async deliverSlackNotification(slackId: string, notification: any) {
    // This would integrate with Slack API
    console.log(`Slack notification sent to ${slackId}:`, notification.text);
    
    // Mock implementation - would be replaced with actual Slack integration
    return Promise.resolve();
  }

  /**
   * Deliver Teams notification
   */
  private async deliverTeamsNotification(teamsId: string, notification: any) {
    // This would integrate with Microsoft Teams API
    console.log(`Teams notification sent to ${teamsId}:`, notification.title);
    
    // Mock implementation - would be replaced with actual Teams integration
    return Promise.resolve();
  }

  /**
   * Render template with variables
   */
  private renderTemplate(template: string, variables: Record<string, any>): string {
    let rendered = template;
    
    // Simple template rendering - would use a proper template engine in production
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      rendered = rendered.replace(regex, String(value || ''));
    });

    // Handle conditional blocks (simplified)
    rendered = rendered.replace(/{{#if\s+(\w+)}}(.*?){{\/if}}/gs, (match, condition, content) => {
      return variables[condition] ? content : '';
    });

    return rendered;
  }

  /**
   * Convert HTML to Slack blocks (simplified)
   */
  private convertToSlackBlocks(html: string): any[] {
    // This would convert HTML to Slack block format
    // Simplified implementation
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: html.replace(/<[^>]*>/g, '') // Strip HTML tags
        }
      }
    ];
  }

  /**
   * Add notification to queue for batch processing
   */
  queueNotification(request: NotificationRequest) {
    this.deliveryQueue.push(request);
  }

  /**
   * Start queue processor for batch notifications
   */
  private startQueueProcessor() {
    setInterval(async () => {
      if (this.processing || this.deliveryQueue.length === 0) {
        return;
      }

      this.processing = true;
      const batch = this.deliveryQueue.splice(0, 10); // Process 10 at a time

      try {
        await Promise.all(
          batch.map(request => this.sendNotification(request))
        );
      } catch (error) {
        console.error('Batch notification processing error:', error);
      } finally {
        this.processing = false;
      }
    }, 5000); // Process every 5 seconds
  }

  /**
   * Get notification template
   */
  getTemplate(templateId: string): NotificationTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Add or update notification template
   */
  setTemplate(template: NotificationTemplate) {
    this.templates.set(template.id, template);
  }

  /**
   * Get queue status
   */
  getQueueStatus(): {
    queueLength: number;
    processing: boolean;
  } {
    return {
      queueLength: this.deliveryQueue.length,
      processing: this.processing
    };
  }
}

// Export singleton instance
export const notificationService = new NotificationService();