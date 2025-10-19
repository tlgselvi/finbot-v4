/**
 * Privacy Budget Manager
 * Advanced privacy budget management and tracking system
 */

interface BudgetAllocation {
  id: string;
  datasetId: string;
  operation: string;
  epsilonAllocated: number;
  deltaAllocated: number;
  epsilonUsed: number;
  deltaUsed: number;
  timestamp: Date;
  expiresAt?: Date;
  status: 'active' | 'used' | 'expired' | 'cancelled';
  metadata?: Record<string, any>;
}

interface BudgetPolicy {
  id: string;
  name: string;
  description: string;
  maxEpsilonPerQuery: number;
  maxEpsilonPerDay: number;
  maxEpsilonPerDataset: number;
  allowedOperations: string[];
  requiredApprovals: string[];
  autoRenewal: boolean;
  renewalPeriod?: number; // in milliseconds
}

interface BudgetAlert {
  id: string;
  type: 'warning' | 'critical' | 'info';
  message: string;
  datasetId?: string;
  threshold: number;
  currentUsage: number;
  timestamp: Date;
  acknowledged: boolean;
}

interface CompositionAnalysis {
  totalEpsilon: number;
  totalDelta: number;
  compositionType: 'basic' | 'advanced' | 'rdp';
  privacyLoss: number;
  recommendations: string[];
}

class PrivacyBudgetManager {
  private budgets: Map<string, {
    totalEpsilon: number;
    totalDelta: number;
    usedEpsilon: number;
    usedDelta: number;
    allocations: BudgetAllocation[];
    policy: BudgetPolicy;
    createdAt: Date;
    lastReset: Date;
  }> = new Map();

  private policies: Map<string, BudgetPolicy> = new Map();
  private alerts: BudgetAlert[] = [];
  private allocationHistory: BudgetAllocation[] = [];

  constructor() {
    this.initializeDefaultPolicies();
  }

  /**
   * Initialize default budget policies
   */
  private initializeDefaultPolicies(): void {
    const defaultPolicy: BudgetPolicy = {
      id: 'default',
      name: 'Default Privacy Policy',
      description: 'Standard privacy budget policy for general use',
      maxEpsilonPerQuery: 1.0,
      maxEpsilonPerDay: 10.0,
      maxEpsilonPerDataset: 100.0,
      allowedOperations: ['count', 'sum', 'average', 'anonymization'],
      requiredApprovals: [],
      autoRenewal: false
    };

    const strictPolicy: BudgetPolicy = {
      id: 'strict',
      name: 'Strict Privacy Policy',
      description: 'High privacy protection with limited budget',
      maxEpsilonPerQuery: 0.1,
      maxEpsilonPerDay: 1.0,
      maxEpsilonPerDataset: 10.0,
      allowedOperations: ['count', 'sum'],
      requiredApprovals: ['privacy_officer'],
      autoRenewal: false
    };

    const researchPolicy: BudgetPolicy = {
      id: 'research',
      name: 'Research Privacy Policy',
      description: 'Flexible policy for research purposes',
      maxEpsilonPerQuery: 2.0,
      maxEpsilonPerDay: 20.0,
      maxEpsilonPerDataset: 200.0,
      allowedOperations: ['count', 'sum', 'average', 'anonymization', 'histogram'],
      requiredApprovals: ['research_lead'],
      autoRenewal: true,
      renewalPeriod: 7 * 24 * 60 * 60 * 1000 // 7 days
    };

    this.policies.set('default', defaultPolicy);
    this.policies.set('strict', strictPolicy);
    this.policies.set('research', researchPolicy);
  }

  /**
   * Initialize privacy budget for a dataset
   */
  initializeBudget(
    datasetId: string,
    totalEpsilon: number,
    totalDelta: number,
    policyId: string = 'default'
  ): void {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy ${policyId} not found`);
    }

    if (totalEpsilon > policy.maxEpsilonPerDataset) {
      throw new Error(`Total epsilon exceeds policy limit of ${policy.maxEpsilonPerDataset}`);
    }

    this.budgets.set(datasetId, {
      totalEpsilon,
      totalDelta,
      usedEpsilon: 0,
      usedDelta: 0,
      allocations: [],
      policy,
      createdAt: new Date(),
      lastReset: new Date()
    });

    this.createAlert('info', `Privacy budget initialized for dataset ${datasetId}`, datasetId, 0, 0);
  }

  /**
   * Request budget allocation for an operation
   */
  requestAllocation(
    datasetId: string,
    operation: string,
    requestedEpsilon: number,
    requestedDelta: number,
    metadata?: Record<string, any>
  ): BudgetAllocation {
    const budget = this.budgets.get(datasetId);
    if (!budget) {
      throw new Error(`No budget found for dataset ${datasetId}`);
    }

    // Check policy constraints
    this.validateAllocationRequest(budget, operation, requestedEpsilon, requestedDelta);

    // Check available budget
    const availableEpsilon = budget.totalEpsilon - budget.usedEpsilon;
    const availableDelta = budget.totalDelta - budget.usedDelta;

    if (requestedEpsilon > availableEpsilon) {
      throw new Error(`Insufficient epsilon budget. Requested: ${requestedEpsilon}, Available: ${availableEpsilon}`);
    }

    if (requestedDelta > availableDelta) {
      throw new Error(`Insufficient delta budget. Requested: ${requestedDelta}, Available: ${availableDelta}`);
    }

    // Create allocation
    const allocation: BudgetAllocation = {
      id: `alloc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      datasetId,
      operation,
      epsilonAllocated: requestedEpsilon,
      deltaAllocated: requestedDelta,
      epsilonUsed: 0,
      deltaUsed: 0,
      timestamp: new Date(),
      status: 'active',
      metadata
    };

    budget.allocations.push(allocation);
    this.allocationHistory.push(allocation);

    // Check for alerts
    this.checkBudgetThresholds(datasetId);

    return allocation;
  }

  /**
   * Use allocated budget
   */
  useBudget(
    allocationId: string,
    epsilonUsed: number,
    deltaUsed: number
  ): void {
    let allocation: BudgetAllocation | undefined;
    let budget: any;

    // Find allocation
    for (const [datasetId, datasetBudget] of this.budgets) {
      allocation = datasetBudget.allocations.find(a => a.id === allocationId);
      if (allocation) {
        budget = datasetBudget;
        break;
      }
    }

    if (!allocation || !budget) {
      throw new Error(`Allocation ${allocationId} not found`);
    }

    if (allocation.status !== 'active') {
      throw new Error(`Allocation ${allocationId} is not active`);
    }

    // Validate usage doesn't exceed allocation
    if (epsilonUsed > allocation.epsilonAllocated) {
      throw new Error(`Epsilon usage exceeds allocation: ${epsilonUsed} > ${allocation.epsilonAllocated}`);
    }

    if (deltaUsed > allocation.deltaAllocated) {
      throw new Error(`Delta usage exceeds allocation: ${deltaUsed} > ${allocation.deltaAllocated}`);
    }

    // Update allocation and budget
    allocation.epsilonUsed = epsilonUsed;
    allocation.deltaUsed = deltaUsed;
    allocation.status = 'used';

    budget.usedEpsilon += epsilonUsed;
    budget.usedDelta += deltaUsed;

    // Update history
    const historyIndex = this.allocationHistory.findIndex(a => a.id === allocationId);
    if (historyIndex >= 0) {
      this.allocationHistory[historyIndex] = { ...allocation };
    }

    // Check for alerts
    this.checkBudgetThresholds(allocation.datasetId);
  }

  /**
   * Validate allocation request against policy
   */
  private validateAllocationRequest(
    budget: any,
    operation: string,
    requestedEpsilon: number,
    requestedDelta: number
  ): void {
    const policy = budget.policy;

    // Check if operation is allowed
    if (!policy.allowedOperations.includes(operation)) {
      throw new Error(`Operation ${operation} not allowed by policy ${policy.id}`);
    }

    // Check per-query limits
    if (requestedEpsilon > policy.maxEpsilonPerQuery) {
      throw new Error(`Requested epsilon ${requestedEpsilon} exceeds per-query limit ${policy.maxEpsilonPerQuery}`);
    }

    // Check daily limits
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayUsage = budget.allocations
      .filter((a: BudgetAllocation) => a.timestamp >= today && a.status === 'used')
      .reduce((sum: number, a: BudgetAllocation) => sum + a.epsilonUsed, 0);

    if (todayUsage + requestedEpsilon > policy.maxEpsilonPerDay) {
      throw new Error(`Daily epsilon limit exceeded. Used today: ${todayUsage}, Limit: ${policy.maxEpsilonPerDay}`);
    }
  }

  /**
   * Check budget thresholds and create alerts
   */
  private checkBudgetThresholds(datasetId: string): void {
    const budget = this.budgets.get(datasetId);
    if (!budget) return;

    const usagePercentage = (budget.usedEpsilon / budget.totalEpsilon) * 100;

    // Create alerts based on usage thresholds
    if (usagePercentage >= 90 && !this.hasRecentAlert(datasetId, 'critical')) {
      this.createAlert(
        'critical',
        `Privacy budget critically low: ${usagePercentage.toFixed(1)}% used`,
        datasetId,
        90,
        usagePercentage
      );
    } else if (usagePercentage >= 75 && !this.hasRecentAlert(datasetId, 'warning')) {
      this.createAlert(
        'warning',
        `Privacy budget warning: ${usagePercentage.toFixed(1)}% used`,
        datasetId,
        75,
        usagePercentage
      );
    }
  }

  /**
   * Check if there's a recent alert of the same type
   */
  private hasRecentAlert(datasetId: string, type: string): boolean {
    const recentThreshold = new Date(Date.now() - 60 * 60 * 1000); // 1 hour
    return this.alerts.some(alert => 
      alert.datasetId === datasetId &&
      alert.type === type &&
      alert.timestamp > recentThreshold &&
      !alert.acknowledged
    );
  }

  /**
   * Create a budget alert
   */
  private createAlert(
    type: 'warning' | 'critical' | 'info',
    message: string,
    datasetId?: string,
    threshold: number = 0,
    currentUsage: number = 0
  ): void {
    const alert: BudgetAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      message,
      datasetId,
      threshold,
      currentUsage,
      timestamp: new Date(),
      acknowledged: false
    };

    this.alerts.push(alert);
  }

  /**
   * Analyze privacy composition for multiple queries
   */
  analyzeComposition(
    datasetId: string,
    compositionType: 'basic' | 'advanced' | 'rdp' = 'advanced'
  ): CompositionAnalysis {
    const budget = this.budgets.get(datasetId);
    if (!budget) {
      throw new Error(`No budget found for dataset ${datasetId}`);
    }

    const usedAllocations = budget.allocations.filter(a => a.status === 'used');
    
    let totalEpsilon: number;
    let totalDelta: number;

    switch (compositionType) {
      case 'basic':
        totalEpsilon = usedAllocations.reduce((sum, a) => sum + a.epsilonUsed, 0);
        totalDelta = usedAllocations.reduce((sum, a) => sum + a.deltaUsed, 0);
        break;

      case 'advanced':
        // Advanced composition theorem
        const k = usedAllocations.length;
        const maxEpsilon = Math.max(...usedAllocations.map(a => a.epsilonUsed));
        totalDelta = usedAllocations.reduce((sum, a) => sum + a.deltaUsed, 0);
        
        if (k > 0) {
          totalEpsilon = Math.sqrt(2 * k * Math.log(1 / totalDelta)) * maxEpsilon + 
                       k * maxEpsilon * (Math.exp(maxEpsilon) - 1);
        } else {
          totalEpsilon = 0;
        }
        break;

      case 'rdp':
        // Simplified RDP composition (would need full RDP implementation)
        totalEpsilon = usedAllocations.reduce((sum, a) => sum + a.epsilonUsed, 0) * 0.8; // Simplified
        totalDelta = usedAllocations.reduce((sum, a) => sum + a.deltaUsed, 0);
        break;

      default:
        throw new Error(`Unknown composition type: ${compositionType}`);
    }

    const privacyLoss = totalEpsilon / budget.totalEpsilon;
    const recommendations = this.generateCompositionRecommendations(privacyLoss, usedAllocations.length);

    return {
      totalEpsilon,
      totalDelta,
      compositionType,
      privacyLoss,
      recommendations
    };
  }

  /**
   * Generate recommendations based on composition analysis
   */
  private generateCompositionRecommendations(privacyLoss: number, queryCount: number): string[] {
    const recommendations: string[] = [];

    if (privacyLoss > 0.8) {
      recommendations.push('Privacy budget is nearly exhausted - consider resetting or requesting additional budget');
    } else if (privacyLoss > 0.5) {
      recommendations.push('Privacy budget usage is high - monitor remaining queries carefully');
    }

    if (queryCount > 20) {
      recommendations.push('Large number of queries detected - consider batch processing to optimize privacy budget');
    }

    if (privacyLoss < 0.1) {
      recommendations.push('Privacy budget usage is low - you have room for additional queries');
    }

    recommendations.push('Consider using advanced composition techniques for better privacy accounting');

    return recommendations;
  }

  /**
   * Reset privacy budget for a dataset
   */
  resetBudget(datasetId: string, newEpsilon?: number, newDelta?: number): void {
    const budget = this.budgets.get(datasetId);
    if (!budget) {
      throw new Error(`No budget found for dataset ${datasetId}`);
    }

    // Archive current allocations
    budget.allocations.forEach(allocation => {
      if (allocation.status === 'active') {
        allocation.status = 'cancelled';
      }
    });

    // Reset budget
    budget.usedEpsilon = 0;
    budget.usedDelta = 0;
    budget.allocations = [];
    budget.lastReset = new Date();

    if (newEpsilon !== undefined) {
      budget.totalEpsilon = newEpsilon;
    }
    if (newDelta !== undefined) {
      budget.totalDelta = newDelta;
    }

    this.createAlert('info', `Privacy budget reset for dataset ${datasetId}`, datasetId, 0, 0);
  }

  /**
   * Get budget status for a dataset
   */
  getBudgetStatus(datasetId: string): {
    totalEpsilon: number;
    totalDelta: number;
    usedEpsilon: number;
    usedDelta: number;
    remainingEpsilon: number;
    remainingDelta: number;
    usagePercentage: number;
    activeAllocations: number;
    policy: BudgetPolicy;
  } | null {
    const budget = this.budgets.get(datasetId);
    if (!budget) return null;

    return {
      totalEpsilon: budget.totalEpsilon,
      totalDelta: budget.totalDelta,
      usedEpsilon: budget.usedEpsilon,
      usedDelta: budget.usedDelta,
      remainingEpsilon: budget.totalEpsilon - budget.usedEpsilon,
      remainingDelta: budget.totalDelta - budget.usedDelta,
      usagePercentage: (budget.usedEpsilon / budget.totalEpsilon) * 100,
      activeAllocations: budget.allocations.filter(a => a.status === 'active').length,
      policy: budget.policy
    };
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): BudgetAlert[] {
    return this.alerts.filter(alert => !alert.acknowledged);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  /**
   * Get allocation history for a dataset
   */
  getAllocationHistory(datasetId: string): BudgetAllocation[] {
    return this.allocationHistory.filter(a => a.datasetId === datasetId);
  }

  /**
   * Create a new budget policy
   */
  createPolicy(policy: Omit<BudgetPolicy, 'id'>): BudgetPolicy {
    const newPolicy: BudgetPolicy = {
      ...policy,
      id: `policy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    this.policies.set(newPolicy.id, newPolicy);
    return newPolicy;
  }

  /**
   * Get all available policies
   */
  getPolicies(): BudgetPolicy[] {
    return Array.from(this.policies.values());
  }

  /**
   * Generate privacy budget report
   */
  generateReport(datasetId?: string): {
    summary: {
      totalDatasets: number;
      totalAllocations: number;
      totalEpsilonUsed: number;
      averageUsagePercentage: number;
    };
    datasets: Array<{
      datasetId: string;
      status: any;
      composition: CompositionAnalysis;
    }>;
    alerts: BudgetAlert[];
    recommendations: string[];
  } {
    const datasets = datasetId ? [datasetId] : Array.from(this.budgets.keys());
    
    let totalAllocations = 0;
    let totalEpsilonUsed = 0;
    let totalUsagePercentage = 0;

    const datasetReports = datasets.map(id => {
      const status = this.getBudgetStatus(id);
      const composition = this.analyzeComposition(id);
      
      if (status) {
        totalAllocations += this.allocationHistory.filter(a => a.datasetId === id).length;
        totalEpsilonUsed += status.usedEpsilon;
        totalUsagePercentage += status.usagePercentage;
      }

      return {
        datasetId: id,
        status,
        composition
      };
    });

    const recommendations = [
      'Regular privacy budget monitoring is recommended',
      'Consider implementing automated budget renewal policies',
      'Review and update privacy policies based on usage patterns',
      'Implement advanced composition techniques for better privacy accounting'
    ];

    return {
      summary: {
        totalDatasets: datasets.length,
        totalAllocations,
        totalEpsilonUsed,
        averageUsagePercentage: datasets.length > 0 ? totalUsagePercentage / datasets.length : 0
      },
      datasets: datasetReports,
      alerts: this.getActiveAlerts(),
      recommendations
    };
  }
}

export default PrivacyBudgetManager;
export type { BudgetAllocation, BudgetPolicy, BudgetAlert, CompositionAnalysis };