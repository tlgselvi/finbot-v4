/**
 * Differential Privacy Hook
 * Custom hook for managing differential privacy operations and data anonymization
 */

import { useState, useCallback, useEffect } from 'react';

interface PrivacyBudget {
  epsilon: number;
  delta: number;
  total: number;
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
  queryId?: string;
}

interface Dataset {
  id: string;
  name: string;
  description: string;
  recordCount: number;
  privacyLevel: number;
  lastAnonymized?: string;
  schema: DatasetSchema[];
}

interface DatasetSchema {
  column: string;
  type: 'numeric' | 'categorical' | 'text' | 'datetime';
  sensitivity: number;
  nullable: boolean;
}

interface PrivateQuery {
  id: string;
  queryText: string;
  dataset: string;
  mechanism: 'laplace' | 'gaussian';
  epsilonUsed: number;
  deltaUsed: number;
  executedAt: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

interface AnonymizedData {
  id: string;
  originalDatasetId: string;
  anonymizedAt: string;
  privacyParameters: {
    epsilon: number;
    delta: number;
    mechanism: string;
    clipBound: number;
  };
  utilityMetrics: {
    accuracy: number;
    completeness: number;
    consistency: number;
  };
}

interface PrivacyMetrics {
  currentEpsilon: number;
  currentDelta: number;
  riskScore: number;
  utilityScore: number;
  totalQueries: number;
  averageEpsilon: number;
  mostUsedMechanism: string;
  complianceStatus: boolean;
  recommendations: string[];
}

interface QueryRequest {
  dataset: string;
  query: string;
  epsilon: number;
  delta: number;
  mechanism: 'laplace' | 'gaussian';
  sensitivity: number;
}

interface AnonymizationRequest {
  datasetId: string;
  epsilon: number;
  delta: number;
  mechanism: 'laplace' | 'gaussian';
  clipBound: number;
}

export const useDifferentialPrivacy = () => {
  const [privacyBudget, setPrivacyBudget] = useState<PrivacyBudget | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [queries, setQueries] = useState<PrivateQuery[]>([]);
  const [anonymizedData, setAnonymizedData] = useState<AnonymizedData[]>([]);
  const [privacyMetrics, setPrivacyMetrics] = useState<PrivacyMetrics | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize differential privacy system
  useEffect(() => {
    initializeDifferentialPrivacy();
  }, []);

  const initializeDifferentialPrivacy = useCallback(async () => {
    setIsProcessing(true);
    setError(null);
    
    try {
      // Simulate initialization
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock initial data
      const mockBudget: PrivacyBudget = {
        epsilon: 10.0,
        delta: 1e-5,
        total: 10.0,
        used: 2.5,
        remaining: 7.5,
        allocations: [
          {
            id: 'alloc-1',
            operation: 'count_query',
            epsilonUsed: 0.5,
            deltaUsed: 1e-6,
            timestamp: '2024-10-15T10:00:00Z',
            queryId: 'query-1'
          },
          {
            id: 'alloc-2',
            operation: 'sum_query',
            epsilonUsed: 1.0,
            deltaUsed: 2e-6,
            timestamp: '2024-10-15T11:00:00Z',
            queryId: 'query-2'
          },
          {
            id: 'alloc-3',
            operation: 'dataset_anonymization',
            epsilonUsed: 1.0,
            deltaUsed: 1e-6,
            timestamp: '2024-10-15T12:00:00Z'
          }
        ]
      };

      const mockDatasets: Dataset[] = [
        {
          id: 'dataset-1',
          name: 'Customer Transactions',
          description: 'Financial transaction data for customers',
          recordCount: 150000,
          privacyLevel: 2.5,
          lastAnonymized: '2024-10-15T12:00:00Z',
          schema: [
            { column: 'customer_id', type: 'categorical', sensitivity: 1.0, nullable: false },
            { column: 'amount', type: 'numeric', sensitivity: 100.0, nullable: false },
            { column: 'transaction_date', type: 'datetime', sensitivity: 1.0, nullable: false },
            { column: 'category', type: 'categorical', sensitivity: 1.0, nullable: true }
          ]
        },
        {
          id: 'dataset-2',
          name: 'User Demographics',
          description: 'Demographic information of users',
          recordCount: 50000,
          privacyLevel: 1.8,
          schema: [
            { column: 'user_id', type: 'categorical', sensitivity: 1.0, nullable: false },
            { column: 'age', type: 'numeric', sensitivity: 1.0, nullable: true },
            { column: 'income', type: 'numeric', sensitivity: 1000.0, nullable: true },
            { column: 'location', type: 'categorical', sensitivity: 1.0, nullable: true }
          ]
        }
      ];

      const mockQueries: PrivateQuery[] = [
        {
          id: 'query-1',
          queryText: 'SELECT COUNT(*) FROM transactions WHERE amount > 1000',
          dataset: 'dataset-1',
          mechanism: 'laplace',
          epsilonUsed: 0.5,
          deltaUsed: 1e-6,
          executedAt: '2024-10-15T10:00:00Z',
          status: 'completed',
          result: { count: 12547 }
        },
        {
          id: 'query-2',
          queryText: 'SELECT AVG(amount) FROM transactions GROUP BY category',
          dataset: 'dataset-1',
          mechanism: 'gaussian',
          epsilonUsed: 1.0,
          deltaUsed: 2e-6,
          executedAt: '2024-10-15T11:00:00Z',
          status: 'completed',
          result: { 
            food: 45.67,
            transport: 23.45,
            entertainment: 78.90
          }
        }
      ];

      const mockAnonymizedData: AnonymizedData[] = [
        {
          id: 'anon-1',
          originalDatasetId: 'dataset-1',
          anonymizedAt: '2024-10-15T12:00:00Z',
          privacyParameters: {
            epsilon: 1.0,
            delta: 1e-6,
            mechanism: 'gaussian',
            clipBound: 1.0
          },
          utilityMetrics: {
            accuracy: 0.95,
            completeness: 0.98,
            consistency: 0.92
          }
        }
      ];

      const mockMetrics: PrivacyMetrics = {
        currentEpsilon: 2.5,
        currentDelta: 4e-6,
        riskScore: 0.25,
        utilityScore: 0.95,
        totalQueries: 2,
        averageEpsilon: 0.75,
        mostUsedMechanism: 'gaussian',
        complianceStatus: true,
        recommendations: [
          'Privacy budget usage is within safe limits',
          'Consider using Gaussian mechanism for numerical queries',
          'Monitor utility metrics for anonymized datasets',
          'Regular privacy audits recommended'
        ]
      };

      setPrivacyBudget(mockBudget);
      setDatasets(mockDatasets);
      setQueries(mockQueries);
      setAnonymizedData(mockAnonymizedData);
      setPrivacyMetrics(mockMetrics);
      
    } catch (err) {
      setError('Failed to initialize differential privacy system');
      console.error('Differential privacy initialization error:', err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const executePrivateQuery = useCallback(async (request: QueryRequest) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      // Validate privacy budget
      if (!privacyBudget || privacyBudget.remaining < request.epsilon) {
        throw new Error('Insufficient privacy budget for this query');
      }

      // Create new query
      const newQuery: PrivateQuery = {
        id: `query-${Date.now()}`,
        queryText: request.query,
        dataset: request.dataset,
        mechanism: request.mechanism,
        epsilonUsed: request.epsilon,
        deltaUsed: request.delta,
        executedAt: new Date().toISOString(),
        status: 'running'
      };

      setQueries(prev => [...prev, newQuery]);

      // Simulate query execution
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Generate mock result based on query type
      let result: any;
      if (request.query.toLowerCase().includes('count')) {
        // Add Laplace noise to count
        const trueCount = Math.floor(Math.random() * 10000) + 1000;
        const noise = request.mechanism === 'laplace' 
          ? generateLaplaceNoise(0, request.sensitivity / request.epsilon)
          : generateGaussianNoise(0, request.sensitivity / request.epsilon);
        result = { count: Math.max(0, Math.round(trueCount + noise)) };
      } else if (request.query.toLowerCase().includes('avg') || request.query.toLowerCase().includes('sum')) {
        // Add noise to numerical aggregates
        const trueValue = Math.random() * 1000;
        const noise = request.mechanism === 'laplace' 
          ? generateLaplaceNoise(0, request.sensitivity / request.epsilon)
          : generateGaussianNoise(0, request.sensitivity / request.epsilon);
        result = { value: Math.max(0, trueValue + noise) };
      } else {
        result = { message: 'Query executed with differential privacy' };
      }

      // Update query with result
      setQueries(prev => prev.map(q => 
        q.id === newQuery.id 
          ? { ...q, status: 'completed', result }
          : q
      ));

      // Update privacy budget
      const newAllocation: PrivacyAllocation = {
        id: `alloc-${Date.now()}`,
        operation: 'private_query',
        epsilonUsed: request.epsilon,
        deltaUsed: request.delta,
        timestamp: new Date().toISOString(),
        queryId: newQuery.id
      };

      setPrivacyBudget(prev => prev ? {
        ...prev,
        used: prev.used + request.epsilon,
        remaining: prev.remaining - request.epsilon,
        allocations: [...prev.allocations, newAllocation]
      } : null);

      // Update metrics
      setPrivacyMetrics(prev => prev ? {
        ...prev,
        currentEpsilon: prev.currentEpsilon + request.epsilon,
        totalQueries: prev.totalQueries + 1,
        averageEpsilon: (prev.currentEpsilon + request.epsilon) / (prev.totalQueries + 1)
      } : null);

      return result;

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute private query');
      
      // Update query status to failed
      setQueries(prev => prev.map(q => 
        q.queryText === request.query && q.status === 'running'
          ? { ...q, status: 'failed', error: err instanceof Error ? err.message : 'Unknown error' }
          : q
      ));
      
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [privacyBudget]);

  const anonymizeDataset = useCallback(async (request: AnonymizationRequest) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      // Validate privacy budget
      if (!privacyBudget || privacyBudget.remaining < request.epsilon) {
        throw new Error('Insufficient privacy budget for dataset anonymization');
      }

      // Simulate anonymization process
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Create anonymized data record
      const newAnonymizedData: AnonymizedData = {
        id: `anon-${Date.now()}`,
        originalDatasetId: request.datasetId,
        anonymizedAt: new Date().toISOString(),
        privacyParameters: {
          epsilon: request.epsilon,
          delta: request.delta,
          mechanism: request.mechanism,
          clipBound: request.clipBound
        },
        utilityMetrics: {
          accuracy: 0.90 + Math.random() * 0.08, // 90-98%
          completeness: 0.95 + Math.random() * 0.04, // 95-99%
          consistency: 0.88 + Math.random() * 0.10 // 88-98%
        }
      };

      setAnonymizedData(prev => [...prev, newAnonymizedData]);

      // Update dataset
      setDatasets(prev => prev.map(dataset => 
        dataset.id === request.datasetId
          ? { 
              ...dataset, 
              privacyLevel: dataset.privacyLevel + request.epsilon,
              lastAnonymized: new Date().toISOString()
            }
          : dataset
      ));

      // Update privacy budget
      const newAllocation: PrivacyAllocation = {
        id: `alloc-${Date.now()}`,
        operation: 'dataset_anonymization',
        epsilonUsed: request.epsilon,
        deltaUsed: request.delta,
        timestamp: new Date().toISOString()
      };

      setPrivacyBudget(prev => prev ? {
        ...prev,
        used: prev.used + request.epsilon,
        remaining: prev.remaining - request.epsilon,
        allocations: [...prev.allocations, newAllocation]
      } : null);

      return newAnonymizedData;

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to anonymize dataset');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [privacyBudget]);

  const generatePrivacyReport = useCallback(async () => {
    setIsProcessing(true);
    setError(null);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));

      const report = {
        generatedAt: new Date().toISOString(),
        privacyBudget: privacyBudget,
        totalQueries: queries.length,
        totalDatasets: datasets.length,
        complianceStatus: privacyBudget ? privacyBudget.used / privacyBudget.total < 0.9 : false,
        riskAssessment: privacyMetrics?.riskScore || 0,
        recommendations: privacyMetrics?.recommendations || []
      };

      return report;

    } catch (err) {
      setError('Failed to generate privacy report');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [privacyBudget, queries, datasets, privacyMetrics]);

  const updatePrivacyBudget = useCallback(async (newBudget: { epsilon: number; delta: number }) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      setPrivacyBudget(prev => prev ? {
        ...prev,
        epsilon: newBudget.epsilon,
        delta: newBudget.delta,
        total: newBudget.epsilon,
        remaining: newBudget.epsilon - prev.used
      } : null);

    } catch (err) {
      setError('Failed to update privacy budget');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const resetPrivacyBudget = useCallback(async () => {
    setIsProcessing(true);
    setError(null);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));

      setPrivacyBudget(prev => prev ? {
        ...prev,
        used: 0,
        remaining: prev.total,
        allocations: []
      } : null);

      setQueries([]);
      setAnonymizedData([]);

      // Reset dataset privacy levels
      setDatasets(prev => prev.map(dataset => ({
        ...dataset,
        privacyLevel: 0,
        lastAnonymized: undefined
      })));

    } catch (err) {
      setError('Failed to reset privacy budget');
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const refreshMetrics = useCallback(async () => {
    setIsProcessing(true);
    setError(null);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Recalculate metrics
      const totalEpsilon = privacyBudget?.used || 0;
      const queryCount = queries.length;
      const avgEpsilon = queryCount > 0 ? totalEpsilon / queryCount : 0;
      
      const mechanismCounts = queries.reduce((acc, query) => {
        acc[query.mechanism] = (acc[query.mechanism] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const mostUsed = Object.entries(mechanismCounts)
        .sort(([,a], [,b]) => b - a)[0]?.[0] || 'gaussian';

      const riskScore = privacyBudget ? (privacyBudget.used / privacyBudget.total) : 0;
      const utilityScore = anonymizedData.length > 0 
        ? anonymizedData.reduce((sum, data) => sum + data.utilityMetrics.accuracy, 0) / anonymizedData.length
        : 1.0;

      setPrivacyMetrics(prev => ({
        currentEpsilon: totalEpsilon,
        currentDelta: privacyBudget?.delta || 1e-5,
        riskScore,
        utilityScore,
        totalQueries: queryCount,
        averageEpsilon: avgEpsilon,
        mostUsedMechanism: mostUsed,
        complianceStatus: riskScore < 0.9,
        recommendations: generateRecommendations(riskScore, utilityScore, queryCount)
      }));

    } catch (err) {
      setError('Failed to refresh metrics');
    } finally {
      setIsProcessing(false);
    }
  }, [privacyBudget, queries, anonymizedData]);

  // Helper functions
  const generateLaplaceNoise = (location: number = 0, scale: number = 1): number => {
    const u = Math.random() - 0.5;
    return location - scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  };

  const generateGaussianNoise = (mean: number = 0, stddev: number = 1): number => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return z * stddev + mean;
  };

  const generateRecommendations = (riskScore: number, utilityScore: number, queryCount: number): string[] => {
    const recommendations: string[] = [];
    
    if (riskScore < 0.3) {
      recommendations.push('Privacy budget usage is within safe limits');
    } else if (riskScore < 0.7) {
      recommendations.push('Monitor privacy budget usage closely');
      recommendations.push('Consider reducing epsilon values for future queries');
    } else {
      recommendations.push('Privacy budget is nearly exhausted');
      recommendations.push('Consider resetting budget for new analysis period');
      recommendations.push('Implement stricter privacy controls');
    }

    if (utilityScore > 0.9) {
      recommendations.push('Data utility is well preserved');
    } else if (utilityScore > 0.7) {
      recommendations.push('Consider optimizing privacy parameters to improve utility');
    } else {
      recommendations.push('Data utility is significantly impacted - review privacy settings');
    }

    if (queryCount > 10) {
      recommendations.push('Consider batch processing queries to optimize privacy budget');
    }

    return recommendations;
  };

  return {
    privacyBudget,
    datasets,
    queries,
    anonymizedData,
    privacyMetrics,
    isProcessing,
    error,
    executePrivateQuery,
    anonymizeDataset,
    generatePrivacyReport,
    updatePrivacyBudget,
    resetPrivacyBudget,
    refreshMetrics
  };
};