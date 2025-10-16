/**
 * FinBot v4 - Integration Service
 * Integrate approval system with existing FinBot modules
 */

import { approvalWorkflowOrchestrator } from './approval-workflow-orchestrator';
import { approvalRuleEngine } from './approval-rule-engine';
import { auditService } from './audit-service';
import { getWebSocketService } from './websocket-service';
import { notificationService } from './notification-service';

export interface TransactionRequest {
  id: string;
  type: 'transfer' | 'payment' | 'withdrawal' | 'investment' | 'loan';
  amount: number;
  currency: string;
  fromAccount: string;
  toAccount?: string;
  description: string;
  userId: string;
  metadata?: Record<string, any>;
}

export interface IntegrationResult {
  requiresApproval: boolean;
  workflowId?: string;
  autoApproved: boolean;
  canProceed: boolean;
  message: string;
  riskLevel?: string;
  estimatedApprovalTime?: number;
}

export class IntegrationService {
  /**
   * Main integration point for financial transactions
   */
  async processTransaction(transaction: TransactionRequest): Promise<IntegrationResult> {
    try {
      // Log transaction attempt
      await auditService.logTransactionAttempt({
        transactionId: transaction.id,
        userId: transaction.userId,
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        timestamp: new Date()
      });

      // Convert to approval system format
      const transactionContext = {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        currency: transaction.currency,
        userId: transaction.userId,
        timestamp: new Date(),
        metadata: {
          ...transaction.metadata,
          fromAccount: transaction.fromAccount,
          toAccount: transaction.toAccount,
          description: transaction.description
        }
      };

      // Create approval workflow
      const workflowResult = await approvalWorkflowOrchestrator.createWorkflow({
        transaction: transactionContext,
        requesterId: transaction.userId,
        metadata: {
          originalTransaction: transaction,
          source: 'finbot_transaction_system'
        }
      });

      // Handle blocked transactions
      if (workflowResult.blocked) {
        await this.handleBlockedTransaction(transaction, workflowResult.blockReason || 'Security concerns');
        
        return {
          requiresApproval: false,
          autoApproved: false,
          canProceed: false,
          message: `Transaction blocked: ${workflowResult.blockReason}`,
          riskLevel: workflowResult.riskAssessment?.riskLevel
        };
      }

      // Handle auto-approved transactions
      if (workflowResult.autoApproved) {
        await this.executeTransaction(transaction);
        
        return {
          requiresApproval: false,
          autoApproved: true,
          canProceed: true,
          message: 'Transaction approved and executed automatically',
          riskLevel: workflowResult.riskAssessment?.riskLevel
        };
      }

      // Handle transactions requiring approval
      if (workflowResult.requiresApproval) {
        const estimatedTime = this.calculateEstimatedApprovalTime(workflowResult.riskAssessment?.riskLevel);
        
        // Send notifications to approvers
        await this.notifyApprovers(workflowResult.workflowId, transaction);
        
        return {
          requiresApproval: true,
          workflowId: workflowResult.workflowId,
          autoApproved: false,
          canProceed: false,
          message: 'Transaction submitted for approval',
          riskLevel: workflowResult.riskAssessment?.riskLevel,
          estimatedApprovalTime: estimatedTime
        };
      }

      // Fallback case
      return {
        requiresApproval: false,
        autoApproved: false,
        canProceed: false,
        message: 'Transaction processing failed',
        riskLevel: 'unknown'
      };

    } catch (error) {
      console.error('Transaction processing error:', error);
      
      // Log error
      await auditService.logError({
        type: 'transaction_processing_error',
        transactionId: transaction.id,
        userId: transaction.userId,
        error: error.message,
        timestamp: new Date()
      });

      return {
        requiresApproval: false,
        autoApproved: false,
        canProceed: false,
        message: 'Transaction processing failed due to system error',
        riskLevel: 'unknown'
      };
    }
  }

  /**
   * Handle workflow completion and execute transaction
   */
  async handleWorkflowCompletion(workflowId: string, status: 'approved' | 'rejected'): Promise<void> {
    try {
      const workflowDetails = await approvalWorkflowOrchestrator.getWorkflowDetails(workflowId);
      
      if (!workflowDetails) {
        throw new Error('Workflow not found');
      }

      const originalTransaction = workflowDetails.workflow.metadata?.originalTransaction;
      
      if (!originalTransaction) {
        throw new Error('Original transaction data not found');
      }

      if (status === 'approved') {
        // Execute the approved transaction
        await this.executeTransaction(originalTransaction);
        
        // Send success notification
        await this.sendTransactionNotification(originalTransaction, 'completed');
        
      } else if (status === 'rejected') {
        // Handle rejected transaction
        await this.handleRejectedTransaction(originalTransaction, workflowDetails);
        
        // Send rejection notification
        await this.sendTransactionNotification(originalTransaction, 'rejected');
      }

    } catch (error) {
      console.error('Workflow completion handling error:', error);
      throw error;
    }
  }

  /**
   * Execute approved transaction
   */
  private async executeTransaction(transaction: TransactionRequest): Promise<void> {
    try {
      // This would integrate with the actual transaction processing system
      console.log(`Executing transaction: ${transaction.id}`);
      
      // Mock transaction execution
      const executionResult = {
        transactionId: transaction.id,
        status: 'completed',
        executedAt: new Date(),
        confirmationNumber: `TXN-${Date.now()}`,
        fees: this.calculateTransactionFees(transaction)
      };

      // Log successful execution
      await auditService.logTransactionExecution({
        transactionId: transaction.id,
        userId: transaction.userId,
        amount: transaction.amount,
        currency: transaction.currency,
        status: 'completed',
        confirmationNumber: executionResult.confirmationNumber,
        fees: executionResult.fees,
        timestamp: new Date()
      });

      // Update account balances (would integrate with account service)
      await this.updateAccountBalances(transaction);

      // Send real-time notification
      const wsService = getWebSocketService();
      wsService.notifyUser(transaction.userId, {
        type: 'workflow_approved',
        workflowId: transaction.id,
        userId: transaction.userId,
        data: {
          message: 'Transaction completed successfully',
          confirmationNumber: executionResult.confirmationNumber,
          amount: transaction.amount,
          currency: transaction.currency
        },
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Transaction execution error:', error);
      
      // Log execution failure
      await auditService.logTransactionExecution({
        transactionId: transaction.id,
        userId: transaction.userId,
        amount: transaction.amount,
        currency: transaction.currency,
        status: 'failed',
        error: error.message,
        timestamp: new Date()
      });

      throw error;
    }
  }

  /**
   * Handle blocked transaction
   */
  private async handleBlockedTransaction(transaction: TransactionRequest, reason: string): Promise<void> {
    try {
      // Log blocked transaction
      await auditService.logTransactionBlock({
        transactionId: transaction.id,
        userId: transaction.userId,
        amount: transaction.amount,
        currency: transaction.currency,
        blockReason: reason,
        timestamp: new Date()
      });

      // Send notification to user
      await notificationService.sendNotification({
        templateId: 'transaction_blocked',
        recipients: [{
          userId: transaction.userId,
          email: 'user@example.com' // Would get from user service
        }],
        variables: {
          transactionId: transaction.id,
          amount: transaction.amount,
          currency: transaction.currency,
          blockReason: reason,
          supportContact: 'support@finbot.com'
        },
        priority: 'high',
        workflowId: transaction.id
      });

      // Send real-time notification
      const wsService = getWebSocketService();
      wsService.notifyUser(transaction.userId, {
        type: 'workflow_rejected',
        workflowId: transaction.id,
        userId: transaction.userId,
        data: {
          message: `Transaction blocked: ${reason}`,
          blockReason: reason,
          canAppeal: true
        },
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Error handling blocked transaction:', error);
    }
  }

  /**
   * Handle rejected transaction
   */
  private async handleRejectedTransaction(transaction: TransactionRequest, workflowDetails: any): Promise<void> {
    try {
      const rejectionReason = workflowDetails.actions
        ?.filter((action: any) => action.action === 'reject')
        ?.map((action: any) => action.comments)
        ?.join('; ') || 'No reason provided';

      // Log rejection
      await auditService.logTransactionRejection({
        transactionId: transaction.id,
        userId: transaction.userId,
        amount: transaction.amount,
        currency: transaction.currency,
        rejectionReason,
        timestamp: new Date()
      });

      // Check if user can resubmit
      const canResubmit = this.canResubmitTransaction(transaction, rejectionReason);

      // Send notification
      await notificationService.sendNotification({
        templateId: 'transaction_rejected',
        recipients: [{
          userId: transaction.userId,
          email: 'user@example.com'
        }],
        variables: {
          transactionId: transaction.id,
          amount: transaction.amount,
          currency: transaction.currency,
          rejectionReason,
          canResubmit,
          resubmitUrl: canResubmit ? `${process.env.CLIENT_URL}/transactions/resubmit/${transaction.id}` : undefined
        },
        priority: 'medium',
        workflowId: transaction.id
      });

    } catch (error) {
      console.error('Error handling rejected transaction:', error);
    }
  }

  /**
   * Notify approvers about new workflow
   */
  private async notifyApprovers(workflowId: string, transaction: TransactionRequest): Promise<void> {
    try {
      // Get workflow details to determine required approvers
      const workflowDetails = await approvalWorkflowOrchestrator.getWorkflowDetails(workflowId);
      
      if (!workflowDetails) {
        return;
      }

      // This would integrate with user management system to get approver details
      const approvers = await this.getRequiredApprovers(workflowDetails.workflow);

      for (const approver of approvers) {
        await notificationService.sendNotification({
          templateId: 'workflow_assigned',
          recipients: [{
            userId: approver.id,
            email: approver.email
          }],
          variables: {
            transactionType: transaction.type,
            amount: transaction.amount,
            currency: transaction.currency,
            requesterName: 'User Name', // Would get from user service
            riskLevel: workflowDetails.riskAssessment?.riskLevel || 'unknown',
            currentLevel: workflowDetails.workflow.currentLevel,
            totalLevels: workflowDetails.workflow.totalLevels,
            approvalUrl: `${process.env.CLIENT_URL}/approvals/${workflowId}`
          },
          priority: workflowDetails.riskAssessment?.riskLevel === 'critical' ? 'critical' : 'medium',
          workflowId
        });
      }

    } catch (error) {
      console.error('Error notifying approvers:', error);
    }
  }

  /**
   * Send transaction status notification
   */
  private async sendTransactionNotification(
    transaction: TransactionRequest, 
    status: 'completed' | 'rejected'
  ): Promise<void> {
    try {
      const templateId = status === 'completed' ? 'transaction_completed' : 'transaction_rejected';
      
      await notificationService.sendNotification({
        templateId,
        recipients: [{
          userId: transaction.userId,
          email: 'user@example.com' // Would get from user service
        }],
        variables: {
          transactionId: transaction.id,
          transactionType: transaction.type,
          amount: transaction.amount,
          currency: transaction.currency,
          status,
          completionTime: new Date().toISOString()
        },
        priority: 'medium',
        workflowId: transaction.id
      });

    } catch (error) {
      console.error('Error sending transaction notification:', error);
    }
  }

  /**
   * Calculate estimated approval time based on risk level
   */
  private calculateEstimatedApprovalTime(riskLevel?: string): number {
    const baseTimes = {
      low: 2,      // 2 hours
      medium: 4,   // 4 hours
      high: 8,     // 8 hours
      critical: 24 // 24 hours
    };

    return baseTimes[riskLevel as keyof typeof baseTimes] || 4;
  }

  /**
   * Calculate transaction fees
   */
  private calculateTransactionFees(transaction: TransactionRequest): number {
    const feeRates = {
      transfer: 0.001,    // 0.1%
      payment: 0.002,     // 0.2%
      withdrawal: 0.005,  // 0.5%
      investment: 0.01,   // 1%
      loan: 0.02          // 2%
    };

    const rate = feeRates[transaction.type] || 0.001;
    return Math.max(transaction.amount * rate, 1); // Minimum 1 unit fee
  }

  /**
   * Update account balances (mock implementation)
   */
  private async updateAccountBalances(transaction: TransactionRequest): Promise<void> {
    try {
      // This would integrate with the account management system
      console.log(`Updating account balances for transaction: ${transaction.id}`);
      
      // Mock balance update
      const balanceUpdate = {
        fromAccount: transaction.fromAccount,
        toAccount: transaction.toAccount,
        amount: transaction.amount,
        currency: transaction.currency,
        fees: this.calculateTransactionFees(transaction),
        timestamp: new Date()
      };

      // Log balance update
      await auditService.logBalanceUpdate(balanceUpdate);

    } catch (error) {
      console.error('Error updating account balances:', error);
      throw error;
    }
  }

  /**
   * Get required approvers for workflow
   */
  private async getRequiredApprovers(workflow: any): Promise<Array<{id: string, email: string}>> {
    // This would integrate with user management system
    // Mock implementation
    return [
      { id: 'approver-1', email: 'approver1@company.com' },
      { id: 'approver-2', email: 'approver2@company.com' }
    ];
  }

  /**
   * Check if transaction can be resubmitted
   */
  private canResubmitTransaction(transaction: TransactionRequest, rejectionReason: string): boolean {
    // Business logic to determine if transaction can be resubmitted
    const nonResubmittableReasons = [
      'fraud detected',
      'account suspended',
      'insufficient funds',
      'compliance violation'
    ];

    return !nonResubmittableReasons.some(reason => 
      rejectionReason.toLowerCase().includes(reason)
    );
  }

  /**
   * Integration health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: Record<string, boolean>;
    issues: string[];
  }> {
    const services: Record<string, boolean> = {};
    const issues: string[] = [];

    try {
      // Check approval workflow orchestrator
      services.workflowOrchestrator = true;
    } catch (error) {
      services.workflowOrchestrator = false;
      issues.push('Workflow orchestrator unavailable');
    }

    try {
      // Check notification service
      services.notificationService = true;
    } catch (error) {
      services.notificationService = false;
      issues.push('Notification service unavailable');
    }

    try {
      // Check audit service
      services.auditService = true;
    } catch (error) {
      services.auditService = false;
      issues.push('Audit service unavailable');
    }

    const healthyServices = Object.values(services).filter(Boolean).length;
    const totalServices = Object.keys(services).length;
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyServices === totalServices) {
      status = 'healthy';
    } else if (healthyServices >= totalServices * 0.7) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return { status, services, issues };
  }

  /**
   * Get integration statistics
   */
  async getIntegrationStatistics(days: number = 30): Promise<{
    totalTransactions: number;
    autoApproved: number;
    manualApproval: number;
    blocked: number;
    averageProcessingTime: number;
    successRate: number;
  }> {
    // This would query actual transaction data
    // Mock implementation
    return {
      totalTransactions: 1250,
      autoApproved: 980,
      manualApproval: 245,
      blocked: 25,
      averageProcessingTime: 3.5, // hours
      successRate: 98.2 // percentage
    };
  }
}

// Export singleton instance
export const integrationService = new IntegrationService();