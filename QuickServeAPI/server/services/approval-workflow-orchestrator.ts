/**
 * FinBot v4 - Approval Workflow Orchestrator
 * State machine for managing approval workflow lifecycle
 */

import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { db } from '../db';
import { approvalWorkflows, approvalActions, riskAssessments, approvalRules } from '../db/approval-schema';
import { 
  ApprovalWorkflowModel, 
  ApprovalActionModel,
  RiskAssessmentModel,
  type ApprovalStatus,
  type NewApprovalWorkflow,
  type NewApprovalAction,
  type NewRiskAssessment,
  type UserRole
} from '../db/approval-models';
import { approvalRuleEngine, type TransactionContext } from './approval-rule-engine';
import { getWebSocketService } from './websocket-service';
import { notificationService } from './notification-service';
import { riskAssessmentEngine } from './risk-assessment-engine';
import { fraudDetectionService } from './fraud-detection-service';

export interface WorkflowCreationRequest {
  transaction: TransactionContext;
  requesterId: string;
  metadata?: Record<string, any>;
}

export interface ApprovalDecision {
  workflowId: string;
  approverId: string;
  action: 'approve' | 'reject' | 'delegate' | 'escalate';
  level: number;
  comments?: string;
  delegatedTo?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface WorkflowStateTransition {
  fromStatus: ApprovalStatus;
  toStatus: ApprovalStatus;
  action: string;
  level: number;
  timestamp: Date;
  actorId: string;
}

export class ApprovalWorkflowOrchestrator {
  /**
   * Create new approval workflow for transaction with comprehensive risk assessment
   */
  async createWorkflow(request: WorkflowCreationRequest): Promise<{
    workflowId: string;
    requiresApproval: boolean;
    autoApproved: boolean;
    riskAssessment: any;
    fraudDetection?: any;
    blocked?: boolean;
    blockReason?: string;
  }> {
    try {
      // 1. Perform comprehensive risk assessment
      const riskAssessment = await riskAssessmentEngine.assessRisk(request.transaction);
      
      // 2. Perform fraud detection
      const userProfile = await this.getUserRiskProfile(request.requesterId);
      const fraudDetection = await fraudDetectionService.detectFraud(request.transaction, userProfile);

      // 3. Check if transaction should be blocked
      if (fraudDetection.isFraudulent || riskAssessment.riskLevel === 'critical') {
        // Block transaction and create audit record
        await this.blockTransaction(request.transaction, riskAssessment, fraudDetection);
        
        return {
          workflowId: '',
          requiresApproval: false,
          autoApproved: false,
          riskAssessment,
          fraudDetection,
          blocked: true,
          blockReason: fraudDetection.blockedReasons.join('; ') || 'Critical risk level detected'
        };
      }

      // 4. Evaluate transaction against approval rules
      const evaluation = await approvalRuleEngine.evaluateTransaction(request.transaction);

      // 5. Enhance evaluation with risk assessment results
      const enhancedEvaluation = this.enhanceEvaluationWithRisk(evaluation, riskAssessment, fraudDetection);

      // 6. Create comprehensive risk assessment record
      const riskAssessmentData: NewRiskAssessment = {
        transactionId: request.transaction.id,
        riskScore: riskAssessment.overallScore.toString(),
        riskLevel: riskAssessment.riskLevel,
        riskFactors: {
          factors: riskAssessment.riskFactors,
          fraudIndicators: fraudDetection.detectedPatterns,
          velocityChecks: fraudDetection.velocityChecks,
          geolocationAnalysis: fraudDetection.geolocationAnalysis,
          deviceAnalysis: fraudDetection.deviceAnalysis
        },
        fraudIndicators: { 
          indicators: riskAssessment.fraudIndicators,
          fraudScore: fraudDetection.fraudScore,
          patterns: fraudDetection.detectedPatterns.map(p => p.id)
        },
        assessmentMethod: riskAssessment.assessmentMethod
      };

      const [riskRecord] = await db
        .insert(riskAssessments)
        .values(riskAssessmentData)
        .returning();

      // 7. Check if approval is required after risk enhancement
      if (!enhancedEvaluation.requiresApproval || enhancedEvaluation.autoApproved) {
        // Update risk assessment with workflow completion
        await db
          .update(riskAssessments)
          .set({ 
            workflowId: null, // No workflow created
            metadata: { autoApproved: true, reason: enhancedEvaluation.reason }
          })
          .where(eq(riskAssessments.id, riskRecord.id));

        return {
          workflowId: '',
          requiresApproval: false,
          autoApproved: true,
          riskAssessment,
          fraudDetection
        };
      }

      // 8. Create enhanced workflow record
      const workflowData: NewApprovalWorkflow = {
        transactionId: request.transaction.id,
        ruleId: enhancedEvaluation.matchedRule!.ruleId,
        requesterId: request.requesterId,
        currentLevel: 1,
        totalLevels: enhancedEvaluation.matchedRule!.totalLevels,
        status: fraudDetection.requiresManualReview ? 'pending' : 'pending',
        riskScore: riskAssessment.overallScore.toString(),
        emergencyOverride: false,
        metadata: {
          ...request.metadata,
          riskAssessmentId: riskRecord.id,
          evaluationReason: enhancedEvaluation.reason,
          fraudScore: fraudDetection.fraudScore,
          requiresManualReview: fraudDetection.requiresManualReview,
          riskLevel: riskAssessment.riskLevel,
          detectedPatterns: fraudDetection.detectedPatterns.map(p => p.id),
          recommendations: [...riskAssessment.recommendations, ...fraudDetection.recommendations]
        }
      };

      const [workflow] = await db
        .insert(approvalWorkflows)
        .values(workflowData)
        .returning();

      // 5. Update risk assessment with workflow ID
      await db
        .update(riskAssessments)
        .set({ workflowId: workflow.id })
        .where(eq(riskAssessments.id, riskRecord.id));

      // Send real-time notification for new workflow
      try {
        const wsService = getWebSocketService();
        wsService.sendWorkflowAssignment(request.requesterId, workflow.id, {
          transactionType: request.transaction.type,
          amount: request.transaction.amount,
          currency: request.transaction.currency,
          riskLevel: evaluation.riskAssessment.level,
          currentLevel: 1,
          totalLevels: evaluation.matchedRule!.totalLevels
        });
      } catch (error) {
        console.warn('Failed to send WebSocket notification:', error);
      }

      return {
        workflowId: workflow.id,
        requiresApproval: true,
        autoApproved: false,
        riskAssessment,
        fraudDetection
      };

    } catch (error) {
      console.error('Workflow creation error:', error);
      throw new Error(`Failed to create approval workflow: ${error.message}`);
    }
  }

  /**
   * Process approval decision
   */
  async processApprovalDecision(decision: ApprovalDecision): Promise<{
    success: boolean;
    newStatus: ApprovalStatus;
    nextLevel?: number;
    completed: boolean;
    message: string;
  }> {
    try {
      // 1. Get current workflow state
      const workflow = await this.getWorkflowById(decision.workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      const workflowModel = new ApprovalWorkflowModel(workflow);

      // 2. Validate decision
      this.validateApprovalDecision(workflowModel, decision);

      // 3. Record approval action
      const actionData: NewApprovalAction = {
        workflowId: decision.workflowId,
        approverId: decision.approverId,
        level: decision.level,
        action: decision.action,
        comments: decision.comments,
        delegatedTo: decision.delegatedTo,
        ipAddress: decision.ipAddress,
        userAgent: decision.userAgent
      };

      const [action] = await db
        .insert(approvalActions)
        .values(actionData)
        .returning();

      // 4. Calculate new workflow state
      const stateTransition = this.calculateStateTransition(workflowModel, decision);

      // 5. Update workflow
      const updateData: any = {
        status: stateTransition.toStatus,
        updatedAt: new Date()
      };

      // If approved and not at final level, move to next level
      if (decision.action === 'approve' && !workflowModel.isAtFinalLevel()) {
        updateData.currentLevel = workflowModel.getNextLevel();
      }

      // If workflow is completed, set completion timestamp
      if (['approved', 'rejected', 'cancelled'].includes(stateTransition.toStatus)) {
        updateData.completedAt = new Date();
      }

      const [updatedWorkflow] = await db
        .update(approvalWorkflows)
        .set(updateData)
        .where(eq(approvalWorkflows.id, decision.workflowId))
        .returning();

      // Send real-time notifications
      try {
        const wsService = getWebSocketService();
        
        // Send workflow update notification
        wsService.sendWorkflowUpdate(decision.workflowId, {
          status: stateTransition.toStatus,
          currentLevel: updateData.currentLevel,
          message: this.getDecisionMessage(decision.action, stateTransition.toStatus),
          updatedBy: decision.approverId,
          timestamp: new Date()
        });

        // Send specific notifications based on action
        if (decision.action === 'approve' && stateTransition.toStatus === 'approved') {
          wsService.sendApprovalNotification(decision.workflowId, workflow.requesterId, {
            approverName: decision.approverId, // Would be resolved to actual name
            completionTime: new Date(),
            comments: decision.comments
          });
        } else if (decision.action === 'reject') {
          wsService.sendRejectionNotification(decision.workflowId, workflow.requesterId, {
            approverName: decision.approverId,
            rejectionTime: new Date(),
            rejectionReason: decision.comments || 'No reason provided'
          });
        }
      } catch (error) {
        console.warn('Failed to send WebSocket notifications:', error);
      }

      return {
        success: true,
        newStatus: stateTransition.toStatus,
        nextLevel: updateData.currentLevel,
        completed: !!updateData.completedAt,
        message: this.getDecisionMessage(decision.action, stateTransition.toStatus)
      };

    } catch (error) {
      console.error('Approval decision processing error:', error);
      throw new Error(`Failed to process approval decision: ${error.message}`);
    }
  }

  /**
   * Get workflow by ID with related data
   */
  async getWorkflowById(workflowId: string) {
    const workflow = await db
      .select()
      .from(approvalWorkflows)
      .where(eq(approvalWorkflows.id, workflowId))
      .limit(1);

    return workflow[0] || null;
  }

  /**
   * Get workflow with full details (actions, risk assessment)
   */
  async getWorkflowDetails(workflowId: string) {
    const workflow = await this.getWorkflowById(workflowId);
    if (!workflow) return null;

    // Get approval actions
    const actions = await db
      .select()
      .from(approvalActions)
      .where(eq(approvalActions.workflowId, workflowId))
      .orderBy(desc(approvalActions.createdAt));

    // Get risk assessment
    const riskAssessment = await db
      .select()
      .from(riskAssessments)
      .where(eq(riskAssessments.workflowId, workflowId))
      .limit(1);

    return {
      workflow,
      actions,
      riskAssessment: riskAssessment[0] || null
    };
  }

  /**
   * Get pending workflows for user with role-based filtering
   */
  async getPendingWorkflowsForUser(userId: string, userRoles: UserRole[]) {
    try {
      // Get workflows where user can approve at current level
      const workflows = await db
        .select({
          workflow: approvalWorkflows,
          riskAssessment: {
            riskScore: riskAssessments.riskScore,
            riskLevel: riskAssessments.riskLevel
          }
        })
        .from(approvalWorkflows)
        .leftJoin(riskAssessments, eq(riskAssessments.workflowId, approvalWorkflows.id))
        .where(eq(approvalWorkflows.status, 'pending'))
        .orderBy(desc(approvalWorkflows.createdAt));

      // Filter workflows based on user roles and current level
      const filteredWorkflows = [];
      
      for (const item of workflows) {
        const workflow = item.workflow;
        const canApprove = await this.canUserApproveWorkflow(userId, userRoles, workflow);
        
        if (canApprove) {
          filteredWorkflows.push({
            ...item,
            canApprove: true,
            urgency: this.calculateUrgency(workflow, item.riskAssessment),
            timeRemaining: this.calculateTimeRemaining(workflow)
          });
        }
      }

      return filteredWorkflows;

    } catch (error) {
      console.error('Get pending workflows error:', error);
      throw new Error(`Failed to get pending workflows: ${error.message}`);
    }
  }

  /**
   * Check if user can approve workflow at current level
   */
  private async canUserApproveWorkflow(
    userId: string, 
    userRoles: UserRole[], 
    workflow: any
  ): Promise<boolean> {
    // Get the approval rule to check required roles for current level
    const rule = await db
      .select()
      .from(approvalRules)
      .where(eq(approvalRules.id, workflow.ruleId))
      .limit(1);

    if (!rule[0]) return false;

    const requiredRoles = rule[0].requiredRoles as UserRole[][];
    const currentLevelRoles = requiredRoles[workflow.currentLevel - 1];

    if (!currentLevelRoles) return false;

    // Check if user has any of the required roles for current level
    return currentLevelRoles.some(role => userRoles.includes(role));
  }

  /**
   * Calculate workflow urgency
   */
  private calculateUrgency(workflow: any, riskAssessment?: any): 'low' | 'medium' | 'high' | 'critical' {
    const hoursOld = (Date.now() - new Date(workflow.createdAt).getTime()) / (1000 * 60 * 60);
    const riskLevel = riskAssessment?.riskLevel || 'low';

    // Critical risk or very old workflows
    if (riskLevel === 'critical' || hoursOld > 48) {
      return 'critical';
    }

    // High risk or old workflows
    if (riskLevel === 'high' || hoursOld > 24) {
      return 'high';
    }

    // Medium risk or moderately old workflows
    if (riskLevel === 'medium' || hoursOld > 8) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Calculate time remaining for workflow
   */
  private calculateTimeRemaining(workflow: any): {
    hours: number;
    isOverdue: boolean;
    slaBreached: boolean;
  } {
    const createdAt = new Date(workflow.createdAt);
    const now = new Date();
    const hoursElapsed = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

    // SLA thresholds based on workflow level and risk
    const slaHours = this.getSlaHours(workflow);
    const warningHours = slaHours * 0.8; // 80% of SLA

    return {
      hours: Math.max(0, slaHours - hoursElapsed),
      isOverdue: hoursElapsed > slaHours,
      slaBreached: hoursElapsed > slaHours * 1.2 // 120% of SLA
    };
  }

  /**
   * Get SLA hours for workflow
   */
  private getSlaHours(workflow: any): number {
    // Base SLA hours by level
    const baseSla = {
      1: 4,   // 4 hours for first level
      2: 8,   // 8 hours for second level
      3: 12,  // 12 hours for third level
      4: 24,  // 24 hours for fourth level
      5: 48   // 48 hours for fifth level
    };

    return baseSla[workflow.currentLevel] || 24;
  }

  /**
   * Get user risk profile for fraud detection
   */
  private async getUserRiskProfile(userId: string): Promise<any> {
    try {
      // Get user transaction history (last 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const userWorkflows = await db
        .select({
          workflow: approvalWorkflows,
          riskAssessment: riskAssessments
        })
        .from(approvalWorkflows)
        .leftJoin(riskAssessments, eq(riskAssessments.workflowId, approvalWorkflows.id))
        .where(
          and(
            eq(approvalWorkflows.requesterId, userId),
            gte(approvalWorkflows.createdAt, ninetyDaysAgo)
          )
        )
        .orderBy(desc(approvalWorkflows.createdAt));

      // Calculate profile metrics
      const transactionCount = userWorkflows.length;
      const totalRiskScore = userWorkflows.reduce((sum, item) => {
        return sum + (parseFloat(item.riskAssessment?.riskScore || '0'));
      }, 0);
      
      const averageRiskScore = transactionCount > 0 ? totalRiskScore / transactionCount : 0;
      
      // Count suspicious activities
      const suspiciousActivityCount = userWorkflows.filter(item => 
        item.riskAssessment?.riskLevel === 'high' || item.riskAssessment?.riskLevel === 'critical'
      ).length;

      // Find last suspicious activity
      const lastSuspiciousActivity = userWorkflows.find(item => 
        item.riskAssessment?.riskLevel === 'high' || item.riskAssessment?.riskLevel === 'critical'
      )?.workflow.createdAt;

      return {
        userId,
        riskScore: averageRiskScore,
        transactionCount,
        averageAmount: 0, // Would calculate from actual transaction amounts
        suspiciousActivityCount,
        lastSuspiciousActivity,
        accountAge: 365, // Would calculate from user creation date
        verificationLevel: 'basic',
        trustScore: Math.max(0, 100 - averageRiskScore)
      };

    } catch (error) {
      console.error('Error getting user risk profile:', error);
      return {
        userId,
        riskScore: 50,
        transactionCount: 0,
        averageAmount: 0,
        suspiciousActivityCount: 0,
        accountAge: 0,
        verificationLevel: 'basic',
        trustScore: 50
      };
    }
  }

  /**
   * Block transaction due to fraud/high risk
   */
  private async blockTransaction(
    transaction: TransactionContext,
    riskAssessment: any,
    fraudDetection: any
  ): Promise<void> {
    try {
      // Create blocked transaction record
      const blockData = {
        transactionId: transaction.id,
        userId: transaction.userId,
        blockReason: fraudDetection.blockedReasons.join('; ') || 'Critical risk detected',
        riskScore: riskAssessment.overallScore,
        fraudScore: fraudDetection.fraudScore,
        detectedPatterns: fraudDetection.detectedPatterns.map((p: any) => p.id),
        blockedAt: new Date(),
        metadata: {
          riskAssessment,
          fraudDetection,
          transaction: {
            type: transaction.type,
            amount: transaction.amount,
            currency: transaction.currency
          }
        }
      };

      // Log the block action (would save to blocked_transactions table)
      console.log('Transaction blocked:', blockData);

      // Send notifications
      try {
        const wsService = getWebSocketService();
        wsService.notifyUser(transaction.userId, {
          type: 'workflow_rejected',
          workflowId: transaction.id,
          userId: transaction.userId,
          data: {
            message: 'Transaction blocked due to security concerns',
            blockReason: blockData.blockReason,
            riskLevel: riskAssessment.riskLevel,
            fraudScore: fraudDetection.fraudScore
          },
          timestamp: new Date()
        });
      } catch (error) {
        console.warn('Failed to send block notification:', error);
      }

    } catch (error) {
      console.error('Error blocking transaction:', error);
      throw error;
    }
  }

  /**
   * Enhance rule evaluation with risk assessment results
   */
  private enhanceEvaluationWithRisk(
    evaluation: any,
    riskAssessment: any,
    fraudDetection: any
  ): any {
    const enhanced = { ...evaluation };

    // Adjust approval requirements based on risk
    if (enhanced.matchedRule) {
      let additionalLevels = 0;
      
      // Add levels based on risk
      if (riskAssessment.riskLevel === 'high') {
        additionalLevels += 1;
      } else if (riskAssessment.riskLevel === 'critical') {
        additionalLevels += 2;
      }

      // Add levels based on fraud detection
      if (fraudDetection.fraudScore >= 60) {
        additionalLevels += 1;
      }

      // Add levels for specific fraud patterns
      const criticalPatterns = fraudDetection.detectedPatterns.filter(
        (p: any) => p.severity === 'critical'
      );
      additionalLevels += criticalPatterns.length;

      // Update matched rule with additional levels
      enhanced.matchedRule = {
        ...enhanced.matchedRule,
        totalLevels: Math.min(
          enhanced.matchedRule.totalLevels + additionalLevels,
          5 // Maximum 5 levels
        ),
        additionalLevels,
        riskEnhanced: true
      };

      // Update reason
      enhanced.reason = `${enhanced.reason} - Enhanced with ${additionalLevels} additional level(s) due to risk assessment`;
    }

    // Override auto-approval for high-risk transactions
    if (riskAssessment.riskLevel === 'high' || riskAssessment.riskLevel === 'critical') {
      enhanced.autoApproved = false;
      enhanced.requiresApproval = true;
      enhanced.reason = 'Manual approval required due to high risk level';
    }

    // Override auto-approval for fraud detection
    if (fraudDetection.requiresManualReview) {
      enhanced.autoApproved = false;
      enhanced.requiresApproval = true;
      enhanced.reason = 'Manual approval required due to fraud indicators';
    }

    return enhanced;
  }

  /**
   * Get risk-based approval recommendations
   */
  async getRiskBasedRecommendations(workflowId: string): Promise<{
    riskLevel: string;
    fraudScore: number;
    recommendations: string[];
    requiredActions: string[];
    additionalChecks: string[];
  }> {
    try {
      const workflow = await this.getWorkflowById(workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      const riskAssessment = await db
        .select()
        .from(riskAssessments)
        .where(eq(riskAssessments.workflowId, workflowId))
        .limit(1);

      if (!riskAssessment[0]) {
        return {
          riskLevel: 'unknown',
          fraudScore: 0,
          recommendations: ['Standard approval process'],
          requiredActions: [],
          additionalChecks: []
        };
      }

      const risk = riskAssessment[0];
      const metadata = workflow.metadata || {};
      
      const recommendations: string[] = [];
      const requiredActions: string[] = [];
      const additionalChecks: string[] = [];

      // Risk level based recommendations
      switch (risk.riskLevel) {
        case 'critical':
          recommendations.push('Require senior management approval');
          recommendations.push('Conduct thorough investigation');
          requiredActions.push('Identity verification');
          requiredActions.push('Source of funds verification');
          additionalChecks.push('Enhanced due diligence');
          break;
        
        case 'high':
          recommendations.push('Require additional approval level');
          recommendations.push('Request supporting documentation');
          requiredActions.push('Transaction justification');
          additionalChecks.push('Background check');
          break;
        
        case 'medium':
          recommendations.push('Standard approval with monitoring');
          additionalChecks.push('Transaction monitoring');
          break;
        
        default:
          recommendations.push('Standard approval process');
      }

      // Fraud score based recommendations
      const fraudScore = metadata.fraudScore || 0;
      if (fraudScore >= 70) {
        recommendations.push('Consider blocking transaction');
        requiredActions.push('Fraud investigation');
      } else if (fraudScore >= 50) {
        recommendations.push('Enhanced verification required');
        additionalChecks.push('Fraud pattern analysis');
      }

      // Pattern-specific recommendations
      const detectedPatterns = metadata.detectedPatterns || [];
      detectedPatterns.forEach((patternId: string) => {
        switch (patternId) {
          case 'rapid_succession':
            additionalChecks.push('Velocity monitoring');
            break;
          case 'impossible_travel':
            requiredActions.push('Location verification');
            break;
          case 'amount_structuring':
            requiredActions.push('Structuring investigation');
            break;
        }
      });

      return {
        riskLevel: risk.riskLevel,
        fraudScore,
        recommendations: [...new Set(recommendations)],
        requiredActions: [...new Set(requiredActions)],
        additionalChecks: [...new Set(additionalChecks)]
      };

    } catch (error) {
      console.error('Error getting risk-based recommendations:', error);
      throw new Error(`Failed to get recommendations: ${error.message}`);
    }
  }

  /**
   * Emergency override workflow
   */
  async emergencyOverride(
    workflowId: string, 
    adminId: string, 
    reason: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const workflow = await this.getWorkflowById(workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      const workflowModel = new ApprovalWorkflowModel(workflow);
      
      if (!workflowModel.isPending()) {
        throw new Error('Can only override pending workflows');
      }

      // Record override action
      const overrideAction: NewApprovalAction = {
        workflowId,
        approverId: adminId,
        level: workflowModel.currentLevel,
        action: 'approve',
        comments: `EMERGENCY OVERRIDE: ${reason}`,
        ipAddress
      };

      await db.insert(approvalActions).values(overrideAction);

      // Update workflow
      await db
        .update(approvalWorkflows)
        .set({
          status: 'approved',
          emergencyOverride: true,
          completedAt: new Date()
        })
        .where(eq(approvalWorkflows.id, workflowId));

      return {
        success: true,
        message: 'Emergency override completed successfully'
      };

    } catch (error) {
      console.error('Emergency override error:', error);
      throw new Error(`Failed to process emergency override: ${error.message}`);
    }
  }

  /**
   * Cancel workflow
   */
  async cancelWorkflow(
    workflowId: string, 
    cancelledBy: string, 
    reason: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const workflow = await this.getWorkflowById(workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      const workflowModel = new ApprovalWorkflowModel(workflow);
      
      if (workflowModel.isCompleted()) {
        throw new Error('Cannot cancel completed workflow');
      }

      // Record cancellation action
      const cancelAction: NewApprovalAction = {
        workflowId,
        approverId: cancelledBy,
        level: workflowModel.currentLevel,
        action: 'reject',
        comments: `CANCELLED: ${reason}`
      };

      await db.insert(approvalActions).values(cancelAction);

      // Update workflow
      await db
        .update(approvalWorkflows)
        .set({
          status: 'cancelled',
          completedAt: new Date()
        })
        .where(eq(approvalWorkflows.id, workflowId));

      return {
        success: true,
        message: 'Workflow cancelled successfully'
      };

    } catch (error) {
      console.error('Cancel workflow error:', error);
      throw new Error(`Failed to cancel workflow: ${error.message}`);
    }
  }

  /**
   * Validate approval decision
   */
  private validateApprovalDecision(workflow: ApprovalWorkflowModel, decision: ApprovalDecision) {
    if (!workflow.isPending()) {
      throw new Error('Workflow is not in pending state');
    }

    if (!workflow.canApproveAtLevel(decision.level)) {
      throw new Error(`Cannot approve at level ${decision.level}. Current level is ${workflow.currentLevel}`);
    }

    if (decision.action === 'delegate' && !decision.delegatedTo) {
      throw new Error('Delegation target is required for delegate action');
    }
  }

  /**
   * Calculate state transition based on decision
   */
  private calculateStateTransition(
    workflow: ApprovalWorkflowModel, 
    decision: ApprovalDecision
  ): WorkflowStateTransition {
    let newStatus: ApprovalStatus = workflow.status;

    switch (decision.action) {
      case 'approve':
        if (workflow.isAtFinalLevel()) {
          newStatus = 'approved';
        } else {
          newStatus = 'pending'; // Move to next level
        }
        break;

      case 'reject':
        newStatus = 'rejected';
        break;

      case 'delegate':
        newStatus = 'pending'; // Stays pending, but assigned to different user
        break;

      case 'escalate':
        newStatus = 'escalated';
        break;

      default:
        throw new Error(`Unknown approval action: ${decision.action}`);
    }

    return {
      fromStatus: workflow.status,
      toStatus: newStatus,
      action: decision.action,
      level: decision.level,
      timestamp: new Date(),
      actorId: decision.approverId
    };
  }

  /**
   * Get decision message
   */
  private getDecisionMessage(action: string, newStatus: ApprovalStatus): string {
    const messages = {
      'approve': {
        'approved': 'Workflow approved and completed',
        'pending': 'Approval recorded, moved to next level'
      },
      'reject': {
        'rejected': 'Workflow rejected and completed'
      },
      'delegate': {
        'pending': 'Workflow delegated to another approver'
      },
      'escalate': {
        'escalated': 'Workflow escalated to higher authority'
      }
    };

    return messages[action]?.[newStatus] || `Action ${action} completed with status ${newStatus}`;
  }

  /**
   * Delegate workflow to another user
   */
  async delegateWorkflow(
    workflowId: string,
    fromUserId: string,
    toUserId: string,
    reason: string,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const workflow = await this.getWorkflowById(workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      const workflowModel = new ApprovalWorkflowModel(workflow);
      
      if (!workflowModel.isPending()) {
        throw new Error('Can only delegate pending workflows');
      }

      // Validate that target user can approve at current level
      // This would typically check user roles against rule requirements
      
      // Record delegation action
      const delegationAction: NewApprovalAction = {
        workflowId,
        approverId: fromUserId,
        level: workflowModel.currentLevel,
        action: 'delegate',
        comments: `Delegated to user: ${reason}`,
        delegatedTo: toUserId,
        ipAddress
      };

      await db.insert(approvalActions).values(delegationAction);

      // Update workflow metadata to track delegation
      const currentMetadata = workflow.metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        delegations: [
          ...(currentMetadata.delegations || []),
          {
            fromUserId,
            toUserId,
            level: workflowModel.currentLevel,
            timestamp: new Date(),
            reason
          }
        ],
        currentAssignee: toUserId
      };

      await db
        .update(approvalWorkflows)
        .set({ 
          metadata: updatedMetadata,
          updatedAt: new Date()
        })
        .where(eq(approvalWorkflows.id, workflowId));

      return {
        success: true,
        message: `Workflow delegated successfully to user ${toUserId}`
      };

    } catch (error) {
      console.error('Delegate workflow error:', error);
      throw new Error(`Failed to delegate workflow: ${error.message}`);
    }
  }

  /**
   * Escalate workflow to higher authority
   */
  async escalateWorkflow(
    workflowId: string,
    escalatedBy: string,
    reason: string,
    targetLevel?: number,
    ipAddress?: string
  ): Promise<{ success: boolean; message: string; newLevel: number }> {
    try {
      const workflow = await this.getWorkflowById(workflowId);
      if (!workflow) {
        throw new Error('Workflow not found');
      }

      const workflowModel = new ApprovalWorkflowModel(workflow);
      
      if (!workflowModel.isPending()) {
        throw new Error('Can only escalate pending workflows');
      }

      // Determine escalation target level
      const newLevel = targetLevel || Math.min(workflowModel.totalLevels, workflowModel.currentLevel + 1);
      
      if (newLevel <= workflowModel.currentLevel) {
        throw new Error('Escalation level must be higher than current level');
      }

      // Record escalation action
      const escalationAction: NewApprovalAction = {
        workflowId,
        approverId: escalatedBy,
        level: workflowModel.currentLevel,
        action: 'escalate',
        comments: `Escalated to level ${newLevel}: ${reason}`,
        ipAddress
      };

      await db.insert(approvalActions).values(escalationAction);

      // Update workflow to new level
      const currentMetadata = workflow.metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        escalations: [
          ...(currentMetadata.escalations || []),
          {
            fromLevel: workflowModel.currentLevel,
            toLevel: newLevel,
            escalatedBy,
            timestamp: new Date(),
            reason
          }
        ]
      };

      await db
        .update(approvalWorkflows)
        .set({
          currentLevel: newLevel,
          status: 'escalated',
          metadata: updatedMetadata,
          updatedAt: new Date()
        })
        .where(eq(approvalWorkflows.id, workflowId));

      return {
        success: true,
        message: `Workflow escalated to level ${newLevel}`,
        newLevel
      };

    } catch (error) {
      console.error('Escalate workflow error:', error);
      throw new Error(`Failed to escalate workflow: ${error.message}`);
    }
  }

  /**
   * Bulk approve multiple workflows
   */
  async bulkApproveWorkflows(
    workflowIds: string[],
    approverId: string,
    comments?: string,
    ipAddress?: string
  ): Promise<{
    successful: string[];
    failed: Array<{ workflowId: string; error: string }>;
    summary: {
      total: number;
      successful: number;
      failed: number;
    };
  }> {
    const successful: string[] = [];
    const failed: Array<{ workflowId: string; error: string }> = [];

    for (const workflowId of workflowIds) {
      try {
        const workflow = await this.getWorkflowById(workflowId);
        if (!workflow) {
          failed.push({ workflowId, error: 'Workflow not found' });
          continue;
        }

        const decision: ApprovalDecision = {
          workflowId,
          approverId,
          action: 'approve',
          level: workflow.currentLevel,
          comments: comments || 'Bulk approval',
          ipAddress
        };

        await this.processApprovalDecision(decision);
        successful.push(workflowId);

      } catch (error) {
        failed.push({ workflowId, error: error.message });
      }
    }

    return {
      successful,
      failed,
      summary: {
        total: workflowIds.length,
        successful: successful.length,
        failed: failed.length
      }
    };
  }

  /**
   * Get workflows by advanced filters
   */
  async getWorkflowsByFilters(filters: {
    status?: ApprovalStatus[];
    riskLevel?: string[];
    amountRange?: { min: number; max: number };
    dateRange?: { start: Date; end: Date };
    requesterId?: string;
    transactionType?: string[];
    currentLevel?: number[];
    assignedTo?: string;
    overdue?: boolean;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    try {
      const {
        status,
        riskLevel,
        amountRange,
        dateRange,
        requesterId,
        transactionType,
        currentLevel,
        assignedTo,
        overdue,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = filters;

      // Build where conditions
      const conditions = [];

      if (status && status.length > 0) {
        conditions.push(sql`${approvalWorkflows.status} IN ${status}`);
      }

      if (requesterId) {
        conditions.push(eq(approvalWorkflows.requesterId, requesterId));
      }

      if (currentLevel && currentLevel.length > 0) {
        conditions.push(sql`${approvalWorkflows.currentLevel} IN ${currentLevel}`);
      }

      if (dateRange) {
        conditions.push(sql`${approvalWorkflows.createdAt} >= ${dateRange.start}`);
        conditions.push(sql`${approvalWorkflows.createdAt} <= ${dateRange.end}`);
      }

      // Calculate offset
      const offset = (page - 1) * limit;

      // Build order by
      const orderBy = sortOrder === 'desc' 
        ? desc(approvalWorkflows[sortBy as keyof typeof approvalWorkflows])
        : asc(approvalWorkflows[sortBy as keyof typeof approvalWorkflows]);

      // Execute query
      const workflows = await db
        .select({
          workflow: approvalWorkflows,
          riskAssessment: {
            riskScore: riskAssessments.riskScore,
            riskLevel: riskAssessments.riskLevel
          }
        })
        .from(approvalWorkflows)
        .leftJoin(riskAssessments, eq(riskAssessments.workflowId, approvalWorkflows.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      // Apply additional filters that require post-processing
      let filteredWorkflows = workflows;

      if (riskLevel && riskLevel.length > 0) {
        filteredWorkflows = filteredWorkflows.filter(item => 
          item.riskAssessment && riskLevel.includes(item.riskAssessment.riskLevel)
        );
      }

      if (overdue) {
        filteredWorkflows = filteredWorkflows.filter(item => {
          const timeRemaining = this.calculateTimeRemaining(item.workflow);
          return timeRemaining.isOverdue;
        });
      }

      return {
        workflows: filteredWorkflows,
        pagination: {
          page,
          limit,
          total: filteredWorkflows.length // This would be a separate count query in production
        }
      };

    } catch (error) {
      console.error('Get workflows by filters error:', error);
      throw new Error(`Failed to get workflows by filters: ${error.message}`);
    }
  }

  /**
   * Get comprehensive workflow statistics
   */
  async getWorkflowStatistics(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    try {
      // Get basic counts
      const [
        totalWorkflows,
        pendingWorkflows,
        approvedWorkflows,
        rejectedWorkflows,
        escalatedWorkflows,
        overdueWorkflows
      ] = await Promise.all([
        db.select({ count: sql`count(*)` }).from(approvalWorkflows),
        db.select({ count: sql`count(*)` }).from(approvalWorkflows).where(eq(approvalWorkflows.status, 'pending')),
        db.select({ count: sql`count(*)` }).from(approvalWorkflows).where(eq(approvalWorkflows.status, 'approved')),
        db.select({ count: sql`count(*)` }).from(approvalWorkflows).where(eq(approvalWorkflows.status, 'rejected')),
        db.select({ count: sql`count(*)` }).from(approvalWorkflows).where(eq(approvalWorkflows.status, 'escalated')),
        // Overdue would require more complex query
        Promise.resolve([{ count: '0' }])
      ]);

      return {
        totalWorkflows: parseInt(totalWorkflows[0]?.count || '0'),
        pendingWorkflows: parseInt(pendingWorkflows[0]?.count || '0'),
        approvedWorkflows: parseInt(approvedWorkflows[0]?.count || '0'),
        rejectedWorkflows: parseInt(rejectedWorkflows[0]?.count || '0'),
        escalatedWorkflows: parseInt(escalatedWorkflows[0]?.count || '0'),
        overdueWorkflows: parseInt(overdueWorkflows[0]?.count || '0'),
        averageProcessingTime: 0, // Would calculate from completed workflows
        workflowsByRiskLevel: {
          low: 0,
          medium: 0,
          high: 0,
          critical: 0
        },
        workflowsByLevel: {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0
        },
        approvalRates: {
          overall: 0,
          byRiskLevel: {},
          byTransactionType: {}
        }
      };

    } catch (error) {
      console.error('Get workflow statistics error:', error);
      throw new Error(`Failed to get workflow statistics: ${error.message}`);
    }
  }
}

// Export singleton instance
export const approvalWorkflowOrchestrator = new ApprovalWorkflowOrchestrator();