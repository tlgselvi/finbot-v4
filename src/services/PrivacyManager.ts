/**
 * Privacy Manager
 * Manages differential privacy, secure aggregation, and privacy budget tracking
 */

interface PrivacyBudget {
  epsilon: number;
  delta: number;
  used: number;
  remaining: number;
  allocations: PrivacyAllocation[];
}

interface PrivacyAllocation {
  id: string;
  operation: string;
  epsilonUsed: number;
  deltaUsed: number;
  timestamp: string;
  clientId?: string;
}

interface DifferentialPrivacyConfig {
  epsilon: number;
  delta: number;
  sensitivity: number;
  noiseMultiplier: number;
  clipBound: number;
}

interface SecureAggregationConfig {
  threshold: number;
  keySize: number;
  enableEncryption: boolean;
  enableSecretSharing: boolean;
}

class PrivacyManager {
  private privacyBudget: PrivacyBudget;
  private dpConfig: DifferentialPrivacyConfig;
  private saConfig: SecureAggregationConfig;
  private allocations: Map<string, PrivacyAllocation> = new Map();

  constructor(
    initialBudget: { epsilon: number; delta: number },
    dpConfig: DifferentialPrivacyConfig,
    saConfig: SecureAggregationConfig
  ) {
    this.privacyBudget = {
      epsilon: initialBudget.epsilon,
      delta: initialBudget.delta,
      used: 0,
      remaining: initialBudget.epsilon,
      allocations: []
    };
    this.dpConfig = dpConfig;
    this.saConfig = saConfig;
  }

  /**
   * Add differential privacy noise to data
   */
  addDifferentialPrivacyNoise(
    data: Float32Array,
    sensitivity: number,
    epsilon: number,
    mechanism: 'laplace' | 'gaussian' = 'gaussian'
  ): { noisyData: Float32Array; privacySpent: number } {
    if (this.privacyBudget.remaining < epsilon) {
      throw new Error('Insufficient privacy budget');
    }

    const noisyData = new Float32Array(data.length);
    let noiseScale: number;

    if (mechanism === 'laplace') {
      noiseScale = sensitivity / epsilon;
      for (let i = 0; i < data.length; i++) {
        noisyData[i] = data[i] + this.generateLaplaceNoise(0, noiseScale);
      }
    } else {
      // Gaussian mechanism
      const sigma = sensitivity * this.dpConfig.noiseMultiplier / epsilon;
      for (let i = 0; i < data.length; i++) {
        noisyData[i] = data[i] + this.generateGaussianNoise(0, sigma);
      }
    }

    // Update privacy budget
    this.updatePrivacyBudget(epsilon, this.dpConfig.delta, 'differential_privacy_noise');

    return {
      noisyData,
      privacySpent: epsilon
    };
  }

  /**
   * Apply gradient clipping for differential privacy
   */
  clipGradients(gradients: Float32Array[], clipBound: number): Float32Array[] {
    const clippedGradients = gradients.map(gradient => new Float32Array(gradient.length));
    
    for (let layerIdx = 0; layerIdx < gradients.length; layerIdx++) {
      const gradient = gradients[layerIdx];
      const clippedGradient = clippedGradients[layerIdx];
      
      // Calculate L2 norm
      let norm = 0;
      for (let i = 0; i < gradient.length; i++) {
        norm += gradient[i] * gradient[i];
      }
      norm = Math.sqrt(norm);
      
      // Clip if necessary
      const clipFactor = Math.min(1, clipBound / norm);
      for (let i = 0; i < gradient.length; i++) {
        clippedGradient[i] = gradient[i] * clipFactor;
      }
    }
    
    return clippedGradients;
  }

  /**
   * Generate Laplace noise
   */
  private generateLaplaceNoise(location: number = 0, scale: number = 1): number {
    const u = Math.random() - 0.5;
    return location - scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  /**
   * Generate Gaussian noise using Box-Muller transform
   */
  private generateGaussianNoise(mean: number = 0, stddev: number = 1): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return z * stddev + mean;
  }

  /**
   * Perform secure aggregation using secret sharing
   */
  performSecureAggregation(
    clientUpdates: Map<string, Float32Array[]>,
    threshold: number
  ): Float32Array[] {
    if (clientUpdates.size < threshold) {
      throw new Error(`Insufficient participants for secure aggregation. Need ${threshold}, have ${clientUpdates.size}`);
    }

    const clientIds = Array.from(clientUpdates.keys());
    const firstUpdate = clientUpdates.get(clientIds[0])!;
    const aggregatedUpdate = firstUpdate.map(layer => new Float32Array(layer.length));

    if (this.saConfig.enableSecretSharing) {
      // Simulate secret sharing aggregation
      return this.secretSharingAggregation(clientUpdates, threshold);
    } else {
      // Simple aggregation with encryption
      return this.encryptedAggregation(clientUpdates);
    }
  }

  /**
   * Secret sharing based aggregation
   */
  private secretSharingAggregation(
    clientUpdates: Map<string, Float32Array[]>,
    threshold: number
  ): Float32Array[] {
    const clientIds = Array.from(clientUpdates.keys()).slice(0, threshold);
    const firstUpdate = clientUpdates.get(clientIds[0])!;
    const result = firstUpdate.map(layer => new Float32Array(layer.length));

    // Simulate Shamir's secret sharing reconstruction
    for (let layerIdx = 0; layerIdx < result.length; layerIdx++) {
      const layer = result[layerIdx];
      
      for (let paramIdx = 0; paramIdx < layer.length; paramIdx++) {
        let sum = 0;
        
        // Lagrange interpolation for secret reconstruction
        for (let i = 0; i < threshold; i++) {
          const clientId = clientIds[i];
          const clientUpdate = clientUpdates.get(clientId)![layerIdx];
          const share = clientUpdate[paramIdx];
          
          let lagrangeCoeff = 1;
          for (let j = 0; j < threshold; j++) {
            if (i !== j) {
              lagrangeCoeff *= (j + 1) / ((j + 1) - (i + 1));
            }
          }
          
          sum += share * lagrangeCoeff;
        }
        
        layer[paramIdx] = sum / clientIds.length;
      }
    }

    return result;
  }

  /**
   * Encrypted aggregation
   */
  private encryptedAggregation(clientUpdates: Map<string, Float32Array[]>): Float32Array[] {
    const clientIds = Array.from(clientUpdates.keys());
    const firstUpdate = clientUpdates.get(clientIds[0])!;
    const result = firstUpdate.map(layer => new Float32Array(layer.length));

    // Simple averaging with simulated encryption
    for (let layerIdx = 0; layerIdx < result.length; layerIdx++) {
      const layer = result[layerIdx];
      
      for (let paramIdx = 0; paramIdx < layer.length; paramIdx++) {
        let sum = 0;
        
        for (const clientId of clientIds) {
          const clientUpdate = clientUpdates.get(clientId)![layerIdx];
          // Simulate decryption and aggregation
          const encryptedValue = clientUpdate[paramIdx];
          const decryptedValue = this.simulateDecryption(encryptedValue);
          sum += decryptedValue;
        }
        
        layer[paramIdx] = sum / clientIds.length;
      }
    }

    return result;
  }

  /**
   * Simulate encryption/decryption (placeholder for real cryptographic operations)
   */
  private simulateDecryption(encryptedValue: number): number {
    // In a real implementation, this would use proper homomorphic encryption
    return encryptedValue;
  }

  /**
   * Update privacy budget
   */
  private updatePrivacyBudget(
    epsilonUsed: number,
    deltaUsed: number,
    operation: string,
    clientId?: string
  ): void {
    const allocation: PrivacyAllocation = {
      id: `alloc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      operation,
      epsilonUsed,
      deltaUsed,
      timestamp: new Date().toISOString(),
      clientId
    };

    this.allocations.set(allocation.id, allocation);
    this.privacyBudget.allocations.push(allocation);
    this.privacyBudget.used += epsilonUsed;
    this.privacyBudget.remaining = Math.max(0, this.privacyBudget.epsilon - this.privacyBudget.used);
  }

  /**
   * Check if operation is within privacy budget
   */
  checkPrivacyBudget(epsilonRequired: number): boolean {
    return this.privacyBudget.remaining >= epsilonRequired;
  }

  /**
   * Get current privacy budget status
   */
  getPrivacyBudgetStatus(): PrivacyBudget {
    return { ...this.privacyBudget };
  }

  /**
   * Calculate privacy loss for a given operation
   */
  calculatePrivacyLoss(
    operation: 'query' | 'aggregation' | 'noise_addition',
    parameters: {
      sensitivity?: number;
      noiseScale?: number;
      queryCount?: number;
    }
  ): { epsilon: number; delta: number } {
    switch (operation) {
      case 'query':
        return {
          epsilon: (parameters.sensitivity || 1) / (parameters.noiseScale || 1),
          delta: 0
        };
      
      case 'aggregation':
        return {
          epsilon: this.dpConfig.epsilon / (parameters.queryCount || 1),
          delta: this.dpConfig.delta
        };
      
      case 'noise_addition':
        return {
          epsilon: (parameters.sensitivity || 1) * this.dpConfig.noiseMultiplier,
          delta: this.dpConfig.delta
        };
      
      default:
        return { epsilon: 0, delta: 0 };
    }
  }

  /**
   * Generate privacy report
   */
  generatePrivacyReport(): {
    budgetStatus: PrivacyBudget;
    riskAssessment: string;
    recommendations: string[];
    complianceStatus: boolean;
  } {
    const budgetUsagePercentage = (this.privacyBudget.used / this.privacyBudget.epsilon) * 100;
    
    let riskAssessment: string;
    let recommendations: string[] = [];
    
    if (budgetUsagePercentage < 50) {
      riskAssessment = 'Low Risk';
      recommendations.push('Privacy budget is well within safe limits');
    } else if (budgetUsagePercentage < 80) {
      riskAssessment = 'Medium Risk';
      recommendations.push('Monitor privacy budget usage closely');
      recommendations.push('Consider reducing noise parameters if possible');
    } else {
      riskAssessment = 'High Risk';
      recommendations.push('Privacy budget is nearly exhausted');
      recommendations.push('Implement stricter privacy controls');
      recommendations.push('Consider resetting privacy budget for new analysis period');
    }

    const complianceStatus = budgetUsagePercentage < 90;

    return {
      budgetStatus: this.getPrivacyBudgetStatus(),
      riskAssessment,
      recommendations,
      complianceStatus
    };
  }

  /**
   * Reset privacy budget (for new analysis period)
   */
  resetPrivacyBudget(newBudget?: { epsilon: number; delta: number }): void {
    if (newBudget) {
      this.privacyBudget.epsilon = newBudget.epsilon;
      this.privacyBudget.delta = newBudget.delta;
    }
    
    this.privacyBudget.used = 0;
    this.privacyBudget.remaining = this.privacyBudget.epsilon;
    this.privacyBudget.allocations = [];
    this.allocations.clear();
  }

  /**
   * Update differential privacy configuration
   */
  updateDPConfig(config: Partial<DifferentialPrivacyConfig>): void {
    this.dpConfig = { ...this.dpConfig, ...config };
  }

  /**
   * Update secure aggregation configuration
   */
  updateSAConfig(config: Partial<SecureAggregationConfig>): void {
    this.saConfig = { ...this.saConfig, ...config };
  }

  /**
   * Get privacy metrics for monitoring
   */
  getPrivacyMetrics(): {
    budgetUtilization: number;
    totalAllocations: number;
    averageEpsilonPerOperation: number;
    riskLevel: 'low' | 'medium' | 'high';
    complianceScore: number;
  } {
    const budgetUtilization = (this.privacyBudget.used / this.privacyBudget.epsilon) * 100;
    const totalAllocations = this.privacyBudget.allocations.length;
    const averageEpsilonPerOperation = totalAllocations > 0 
      ? this.privacyBudget.used / totalAllocations 
      : 0;
    
    let riskLevel: 'low' | 'medium' | 'high';
    if (budgetUtilization < 50) riskLevel = 'low';
    else if (budgetUtilization < 80) riskLevel = 'medium';
    else riskLevel = 'high';
    
    const complianceScore = Math.max(0, 100 - budgetUtilization);

    return {
      budgetUtilization,
      totalAllocations,
      averageEpsilonPerOperation,
      riskLevel,
      complianceScore
    };
  }
}

export default PrivacyManager;
export type { 
  PrivacyBudget, 
  PrivacyAllocation, 
  DifferentialPrivacyConfig, 
  SecureAggregationConfig 
};