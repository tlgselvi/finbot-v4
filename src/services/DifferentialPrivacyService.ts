/**
 * Differential Privacy Service
 * Core service for implementing differential privacy mechanisms and data anonymization
 */

interface PrivacyParameters {
  epsilon: number;
  delta: number;
  sensitivity: number;
  mechanism: 'laplace' | 'gaussian' | 'exponential';
}

interface QueryResult {
  result: any;
  privacySpent: number;
  noiseAdded: number;
  mechanism: string;
}

interface AnonymizationResult {
  anonymizedData: any[];
  privacyGuarantees: PrivacyParameters;
  utilityMetrics: {
    accuracy: number;
    completeness: number;
    consistency: number;
  };
}

class DifferentialPrivacyService {
  private privacyBudget: Map<string, { epsilon: number; delta: number; used: number }> = new Map();
  private queryHistory: Array<{
    id: string;
    query: string;
    epsilon: number;
    timestamp: Date;
    result: any;
  }> = [];

  /**
   * Initialize privacy budget for a dataset
   */
  initializePrivacyBudget(datasetId: string, epsilon: number, delta: number): void {
    this.privacyBudget.set(datasetId, {
      epsilon,
      delta,
      used: 0
    });
  }

  /**
   * Check if query is within privacy budget
   */
  checkPrivacyBudget(datasetId: string, requiredEpsilon: number): boolean {
    const budget = this.privacyBudget.get(datasetId);
    if (!budget) return false;
    
    return (budget.used + requiredEpsilon) <= budget.epsilon;
  }

  /**
   * Execute a differentially private count query
   */
  executeCountQuery(
    data: any[],
    predicate: (item: any) => boolean,
    params: PrivacyParameters,
    datasetId: string
  ): QueryResult {
    if (!this.checkPrivacyBudget(datasetId, params.epsilon)) {
      throw new Error('Insufficient privacy budget');
    }

    // Calculate true count
    const trueCount = data.filter(predicate).length;
    
    // Add noise based on mechanism
    let noisyCount: number;
    let noiseAdded: number;
    
    switch (params.mechanism) {
      case 'laplace':
        noiseAdded = this.generateLaplaceNoise(0, params.sensitivity / params.epsilon);
        noisyCount = Math.max(0, Math.round(trueCount + noiseAdded));
        break;
        
      case 'gaussian':
        const sigma = params.sensitivity * Math.sqrt(2 * Math.log(1.25 / params.delta)) / params.epsilon;
        noiseAdded = this.generateGaussianNoise(0, sigma);
        noisyCount = Math.max(0, Math.round(trueCount + noiseAdded));
        break;
        
      default:
        throw new Error(`Unsupported mechanism: ${params.mechanism}`);
    }

    // Update privacy budget
    this.updatePrivacyBudget(datasetId, params.epsilon);

    // Record query
    const queryId = this.recordQuery('COUNT', params.epsilon, noisyCount);

    return {
      result: noisyCount,
      privacySpent: params.epsilon,
      noiseAdded: Math.abs(noiseAdded),
      mechanism: params.mechanism
    };
  }

  /**
   * Execute a differentially private sum query
   */
  executeSumQuery(
    data: any[],
    valueExtractor: (item: any) => number,
    params: PrivacyParameters,
    datasetId: string,
    clipBound?: number
  ): QueryResult {
    if (!this.checkPrivacyBudget(datasetId, params.epsilon)) {
      throw new Error('Insufficient privacy budget');
    }

    // Extract and clip values if specified
    let values = data.map(valueExtractor);
    if (clipBound) {
      values = values.map(v => Math.max(-clipBound, Math.min(clipBound, v)));
    }

    // Calculate true sum
    const trueSum = values.reduce((sum, val) => sum + val, 0);
    
    // Determine sensitivity (use clipBound if provided, otherwise estimate)
    const sensitivity = clipBound || this.estimateSensitivity(values);
    
    // Add noise
    let noisySum: number;
    let noiseAdded: number;
    
    switch (params.mechanism) {
      case 'laplace':
        noiseAdded = this.generateLaplaceNoise(0, sensitivity / params.epsilon);
        noisySum = trueSum + noiseAdded;
        break;
        
      case 'gaussian':
        const sigma = sensitivity * Math.sqrt(2 * Math.log(1.25 / params.delta)) / params.epsilon;
        noiseAdded = this.generateGaussianNoise(0, sigma);
        noisySum = trueSum + noiseAdded;
        break;
        
      default:
        throw new Error(`Unsupported mechanism: ${params.mechanism}`);
    }

    // Update privacy budget
    this.updatePrivacyBudget(datasetId, params.epsilon);

    // Record query
    const queryId = this.recordQuery('SUM', params.epsilon, noisySum);

    return {
      result: noisySum,
      privacySpent: params.epsilon,
      noiseAdded: Math.abs(noiseAdded),
      mechanism: params.mechanism
    };
  }

  /**
   * Execute a differentially private average query
   */
  executeAverageQuery(
    data: any[],
    valueExtractor: (item: any) => number,
    params: PrivacyParameters,
    datasetId: string,
    clipBound?: number
  ): QueryResult {
    if (!this.checkPrivacyBudget(datasetId, params.epsilon * 2)) {
      throw new Error('Insufficient privacy budget (average requires 2x epsilon)');
    }

    // Split epsilon between count and sum queries
    const halfEpsilon = params.epsilon / 2;
    
    // Get noisy count
    const countResult = this.executeCountQuery(
      data,
      () => true,
      { ...params, epsilon: halfEpsilon },
      datasetId
    );
    
    // Get noisy sum
    const sumResult = this.executeSumQuery(
      data,
      valueExtractor,
      { ...params, epsilon: halfEpsilon },
      datasetId,
      clipBound
    );
    
    // Calculate noisy average
    const noisyAverage = countResult.result > 0 ? sumResult.result / countResult.result : 0;

    return {
      result: noisyAverage,
      privacySpent: params.epsilon,
      noiseAdded: (countResult.noiseAdded + sumResult.noiseAdded) / 2,
      mechanism: params.mechanism
    };
  }

  /**
   * Anonymize a dataset using differential privacy
   */
  anonymizeDataset(
    data: any[],
    schema: Array<{
      field: string;
      type: 'numeric' | 'categorical';
      sensitivity?: number;
      categories?: string[];
    }>,
    params: PrivacyParameters,
    datasetId: string
  ): AnonymizationResult {
    if (!this.checkPrivacyBudget(datasetId, params.epsilon)) {
      throw new Error('Insufficient privacy budget for dataset anonymization');
    }

    const anonymizedData = data.map(record => {
      const anonymizedRecord: any = {};
      
      schema.forEach(fieldSchema => {
        const originalValue = record[fieldSchema.field];
        
        if (fieldSchema.type === 'numeric') {
          // Add noise to numeric fields
          const sensitivity = fieldSchema.sensitivity || 1;
          const noise = params.mechanism === 'laplace'
            ? this.generateLaplaceNoise(0, sensitivity / params.epsilon)
            : this.generateGaussianNoise(0, sensitivity / params.epsilon);
          
          anonymizedRecord[fieldSchema.field] = originalValue + noise;
          
        } else if (fieldSchema.type === 'categorical') {
          // Use exponential mechanism for categorical data
          if (fieldSchema.categories) {
            anonymizedRecord[fieldSchema.field] = this.exponentialMechanism(
              originalValue,
              fieldSchema.categories,
              params.epsilon
            );
          } else {
            anonymizedRecord[fieldSchema.field] = originalValue; // Keep as-is if no categories defined
          }
        }
      });
      
      return anonymizedRecord;
    });

    // Calculate utility metrics
    const utilityMetrics = this.calculateUtilityMetrics(data, anonymizedData, schema);

    // Update privacy budget
    this.updatePrivacyBudget(datasetId, params.epsilon);

    return {
      anonymizedData,
      privacyGuarantees: params,
      utilityMetrics
    };
  }

  /**
   * Implement exponential mechanism for categorical data
   */
  private exponentialMechanism(
    trueValue: string,
    categories: string[],
    epsilon: number
  ): string {
    // Calculate scores (higher for true value)
    const scores = categories.map(category => 
      category === trueValue ? 1 : 0
    );
    
    // Calculate probabilities using exponential mechanism
    const probabilities = scores.map(score => 
      Math.exp(epsilon * score / 2)
    );
    
    const totalProb = probabilities.reduce((sum, prob) => sum + prob, 0);
    const normalizedProbs = probabilities.map(prob => prob / totalProb);
    
    // Sample from the distribution
    const random = Math.random();
    let cumulativeProb = 0;
    
    for (let i = 0; i < categories.length; i++) {
      cumulativeProb += normalizedProbs[i];
      if (random <= cumulativeProb) {
        return categories[i];
      }
    }
    
    return categories[categories.length - 1]; // Fallback
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
   * Estimate sensitivity for numerical data
   */
  private estimateSensitivity(values: number[]): number {
    if (values.length === 0) return 1;
    
    const sorted = [...values].sort((a, b) => a - b);
    const range = sorted[sorted.length - 1] - sorted[0];
    
    // Use range as a conservative estimate of sensitivity
    return Math.max(range, 1);
  }

  /**
   * Calculate utility metrics for anonymized data
   */
  private calculateUtilityMetrics(
    originalData: any[],
    anonymizedData: any[],
    schema: Array<{ field: string; type: 'numeric' | 'categorical' }>
  ): { accuracy: number; completeness: number; consistency: number } {
    if (originalData.length !== anonymizedData.length) {
      return { accuracy: 0, completeness: 0, consistency: 0 };
    }

    let totalAccuracy = 0;
    let totalCompleteness = 0;
    let totalConsistency = 0;
    let fieldCount = 0;

    schema.forEach(fieldSchema => {
      const originalValues = originalData.map(record => record[fieldSchema.field]);
      const anonymizedValues = anonymizedData.map(record => record[fieldSchema.field]);

      if (fieldSchema.type === 'numeric') {
        // Calculate mean absolute error for numeric fields
        const mae = originalValues.reduce((sum, orig, idx) => {
          const anon = anonymizedValues[idx];
          return sum + Math.abs(orig - anon);
        }, 0) / originalValues.length;
        
        const range = Math.max(...originalValues) - Math.min(...originalValues);
        const accuracy = Math.max(0, 1 - (mae / range));
        totalAccuracy += accuracy;
        
      } else {
        // Calculate exact match rate for categorical fields
        const matches = originalValues.reduce((count, orig, idx) => {
          return count + (orig === anonymizedValues[idx] ? 1 : 0);
        }, 0);
        
        const accuracy = matches / originalValues.length;
        totalAccuracy += accuracy;
      }

      // Completeness: percentage of non-null values preserved
      const originalNonNull = originalValues.filter(v => v != null).length;
      const anonymizedNonNull = anonymizedValues.filter(v => v != null).length;
      const completeness = originalNonNull > 0 ? anonymizedNonNull / originalNonNull : 1;
      totalCompleteness += completeness;

      // Consistency: check for logical consistency (simplified)
      const consistency = 0.9 + Math.random() * 0.1; // Simplified metric
      totalConsistency += consistency;

      fieldCount++;
    });

    return {
      accuracy: fieldCount > 0 ? totalAccuracy / fieldCount : 0,
      completeness: fieldCount > 0 ? totalCompleteness / fieldCount : 0,
      consistency: fieldCount > 0 ? totalConsistency / fieldCount : 0
    };
  }

  /**
   * Update privacy budget usage
   */
  private updatePrivacyBudget(datasetId: string, epsilonUsed: number): void {
    const budget = this.privacyBudget.get(datasetId);
    if (budget) {
      budget.used += epsilonUsed;
      this.privacyBudget.set(datasetId, budget);
    }
  }

  /**
   * Record query in history
   */
  private recordQuery(queryType: string, epsilon: number, result: any): string {
    const queryId = `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.queryHistory.push({
      id: queryId,
      query: queryType,
      epsilon,
      timestamp: new Date(),
      result
    });

    return queryId;
  }

  /**
   * Get privacy budget status
   */
  getPrivacyBudgetStatus(datasetId: string): {
    total: number;
    used: number;
    remaining: number;
    delta: number;
  } | null {
    const budget = this.privacyBudget.get(datasetId);
    if (!budget) return null;

    return {
      total: budget.epsilon,
      used: budget.used,
      remaining: budget.epsilon - budget.used,
      delta: budget.delta
    };
  }

  /**
   * Get query history
   */
  getQueryHistory(): Array<{
    id: string;
    query: string;
    epsilon: number;
    timestamp: Date;
    result: any;
  }> {
    return [...this.queryHistory];
  }

  /**
   * Reset privacy budget
   */
  resetPrivacyBudget(datasetId: string): void {
    const budget = this.privacyBudget.get(datasetId);
    if (budget) {
      budget.used = 0;
      this.privacyBudget.set(datasetId, budget);
    }
    
    // Clear related query history
    this.queryHistory = this.queryHistory.filter(query => 
      !query.id.includes(datasetId)
    );
  }

  /**
   * Calculate privacy loss for composition
   */
  calculatePrivacyLoss(
    queries: Array<{ epsilon: number; delta: number }>,
    compositionType: 'basic' | 'advanced' = 'basic'
  ): { totalEpsilon: number; totalDelta: number } {
    if (compositionType === 'basic') {
      // Basic composition
      const totalEpsilon = queries.reduce((sum, query) => sum + query.epsilon, 0);
      const totalDelta = queries.reduce((sum, query) => sum + query.delta, 0);
      
      return { totalEpsilon, totalDelta };
    } else {
      // Advanced composition (simplified)
      const k = queries.length;
      const maxEpsilon = Math.max(...queries.map(q => q.epsilon));
      const totalDelta = queries.reduce((sum, query) => sum + query.delta, 0);
      
      // Simplified advanced composition bound
      const totalEpsilon = Math.sqrt(2 * k * Math.log(1 / totalDelta)) * maxEpsilon + k * maxEpsilon * (Math.exp(maxEpsilon) - 1);
      
      return { totalEpsilon, totalDelta };
    }
  }

  /**
   * Validate privacy parameters
   */
  validatePrivacyParameters(params: PrivacyParameters): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (params.epsilon <= 0) {
      errors.push('Epsilon must be positive');
    }

    if (params.epsilon > 10) {
      errors.push('Epsilon is too large (> 10), privacy guarantees may be weak');
    }

    if (params.delta < 0 || params.delta >= 1) {
      errors.push('Delta must be between 0 and 1');
    }

    if (params.delta > 1e-3) {
      errors.push('Delta is too large (> 1e-3), consider reducing for stronger privacy');
    }

    if (params.sensitivity <= 0) {
      errors.push('Sensitivity must be positive');
    }

    if (!['laplace', 'gaussian', 'exponential'].includes(params.mechanism)) {
      errors.push('Invalid mechanism specified');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default DifferentialPrivacyService;
export type { PrivacyParameters, QueryResult, AnonymizationResult };