/**
 * Differential Privacy Tests
 * Comprehensive tests for differential privacy mechanisms and data anonymization
 */

import DifferentialPrivacyService from '../../services/DifferentialPrivacyService';
import PrivacyBudgetManager from '../../services/PrivacyBudgetManager';

describe('Differential Privacy Tests', () => {
  let dpService: DifferentialPrivacyService;
  let budgetManager: PrivacyBudgetManager;
  const testDatasetId = 'test-dataset-1';

  beforeEach(() => {
    dpService = new DifferentialPrivacyService();
    budgetManager = new PrivacyBudgetManager();
    
    // Initialize test privacy budget
    dpService.initializePrivacyBudget(testDatasetId, 10.0, 1e-5);
    budgetManager.initializeBudget(testDatasetId, 10.0, 1e-5);
  });

  describe('Privacy Budget Management', () => {
    it('should enforce privacy budget limits', async () => {
      const largeEpsilon = 15.0; // Exceeds budget of 10.0
      
      expect(() => {
        dpService.executeCountQuery(
          [],
          () => true,
          { epsilon: largeEpsilon, delta: 1e-5, sensitivity: 1, mechanism: 'laplace' },
          testDatasetId
        );
      }).toThrow('Insufficient privacy budget');
    });

    it('should track privacy budget usage correctly', () => {
      const epsilon1 = 2.0;
      const epsilon2 = 3.0;
      
      dpService.executeCountQuery(
        [1, 2, 3, 4, 5],
        (x) => x > 2,
        { epsilon: epsilon1, delta: 1e-5, sensitivity: 1, mechanism: 'laplace' },
        testDatasetId
      );
      
      dpService.executeCountQuery(
        [1, 2, 3, 4, 5],
        (x) => x > 3,
        { epsilon: epsilon2, delta: 1e-5, sensitivity: 1, mechanism: 'laplace' },
        testDatasetId
      );
      
      const budgetStatus = dpService.getPrivacyBudgetStatus(testDatasetId);
      expect(budgetStatus?.used).toBeCloseTo(epsilon1 + epsilon2, 2);
      expect(budgetStatus?.remaining).toBeCloseTo(10.0 - epsilon1 - epsilon2, 2);
    });

    it('should prevent queries when budget is exhausted', () => {
      // Exhaust the budget
      dpService.executeCountQuery(
        [1, 2, 3],
        () => true,
        { epsilon: 10.0, delta: 1e-5, sensitivity: 1, mechanism: 'laplace' },
        testDatasetId
      );
      
      // Try another query
      expect(() => {
        dpService.executeCountQuery(
          [1, 2, 3],
          () => true,
          { epsilon: 0.1, delta: 1e-5, sensitivity: 1, mechanism: 'laplace' },
          testDatasetId
        );
      }).toThrow('Insufficient privacy budget');
    });
  });

  describe('Noise Addition Mechanisms', () => {
    const testData = Array.from({ length: 1000 }, (_, i) => i + 1);
    
    it('should add appropriate Laplace noise', () => {
      const trueCount = testData.filter(x => x > 500).length;
      const results: number[] = [];
      
      // Run multiple queries to test noise distribution
      for (let i = 0; i < 50; i++) {
        dpService.resetPrivacyBudget(testDatasetId);
        const result = dpService.executeCountQuery(
          testData,
          (x) => x > 500,
          { epsilon: 1.0, delta: 1e-5, sensitivity: 1, mechanism: 'laplace' },
          testDatasetId
        );
        results.push(result.result);
      }
      
      // Check that results vary (noise is added)
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBeGreaterThan(1);
      
      // Check that mean is close to true value
      const mean = results.reduce((sum, val) => sum + val, 0) / results.length;
      expect(Math.abs(mean - trueCount)).toBeLessThan(50); // Allow some variance
    });

    it('should add appropriate Gaussian noise', () => {
      const testData = [10, 20, 30, 40, 50];
      const trueSum = testData.reduce((sum, val) => sum + val, 0);
      const results: number[] = [];
      
      for (let i = 0; i < 50; i++) {
        dpService.resetPrivacyBudget(testDatasetId);
        const result = dpService.executeSumQuery(
          testData,
          (x) => x,
          { epsilon: 1.0, delta: 1e-5, sensitivity: 50, mechanism: 'gaussian' },
          testDatasetId
        );
        results.push(result.result);
      }
      
      // Check noise is added
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBeGreaterThan(1);
      
      // Check mean is close to true value
      const mean = results.reduce((sum, val) => sum + val, 0) / results.length;
      expect(Math.abs(mean - trueSum)).toBeLessThan(100);
    });

    it('should respect sensitivity bounds', () => {
      const testData = [1, 100, 1000]; // High variance data
      const clipBound = 10;
      
      const result = dpService.executeSumQuery(
        testData,
        (x) => x,
        { epsilon: 1.0, delta: 1e-5, sensitivity: clipBound, mechanism: 'laplace' },
        testDatasetId,
        clipBound
      );
      
      // With clipping, the sum should be much lower than unclipped
      expect(result.result).toBeLessThan(1101); // Original sum without clipping
    });
  });

  describe('Data Anonymization', () => {
    const testData = [
      { id: 1, age: 25, income: 50000, location: 'NYC' },
      { id: 2, age: 35, income: 75000, location: 'SF' },
      { id: 3, age: 45, income: 100000, location: 'LA' }
    ];

    const schema = [
      { field: 'age', type: 'numeric' as const, sensitivity: 1 },
      { field: 'income', type: 'numeric' as const, sensitivity: 10000 },
      { field: 'location', type: 'categorical' as const, categories: ['NYC', 'SF', 'LA', 'CHI'] }
    ];

    it('should anonymize numerical fields with noise', () => {
      const result = dpService.anonymizeDataset(
        testData,
        schema,
        { epsilon: 1.0, delta: 1e-5, sensitivity: 1, mechanism: 'laplace' },
        testDatasetId
      );

      expect(result.anonymizedData).toHaveLength(testData.length);
      
      // Check that numerical values are modified
      const originalAges = testData.map(d => d.age);
      const anonymizedAges = result.anonymizedData.map(d => d.age);
      
      expect(originalAges).not.toEqual(anonymizedAges);
    });

    it('should preserve data utility within acceptable bounds', () => {
      const result = dpService.anonymizeDataset(
        testData,
        schema,
        { epsilon: 1.0, delta: 1e-5, sensitivity: 1, mechanism: 'gaussian' },
        testDatasetId
      );

      // Utility metrics should be reasonable
      expect(result.utilityMetrics.accuracy).toBeGreaterThan(0.5);
      expect(result.utilityMetrics.completeness).toBeGreaterThan(0.9);
      expect(result.utilityMetrics.consistency).toBeGreaterThan(0.5);
    });

    it('should handle categorical data with exponential mechanism', () => {
      const result = dpService.anonymizeDataset(
        testData,
        schema,
        { epsilon: 1.0, delta: 1e-5, sensitivity: 1, mechanism: 'laplace' },
        testDatasetId
      );

      // All location values should be from the allowed categories
      const allowedLocations = ['NYC', 'SF', 'LA', 'CHI'];
      result.anonymizedData.forEach(record => {
        expect(allowedLocations).toContain(record.location);
      });
    });
  });

  describe('Privacy Composition', () => {
    it('should calculate basic composition correctly', () => {
      const queries = [
        { epsilon: 1.0, delta: 1e-6 },
        { epsilon: 2.0, delta: 2e-6 },
        { epsilon: 1.5, delta: 1.5e-6 }
      ];

      const composition = dpService.calculatePrivacyLoss(queries, 'basic');
      
      expect(composition.totalEpsilon).toBe(4.5);
      expect(composition.totalDelta).toBe(4.5e-6);
    });

    it('should calculate advanced composition with better bounds', () => {
      const queries = Array(10).fill({ epsilon: 0.1, delta: 1e-6 });
      
      const basicComposition = dpService.calculatePrivacyLoss(queries, 'basic');
      const advancedComposition = dpService.calculatePrivacyLoss(queries, 'advanced');
      
      // Advanced composition should give better (lower) privacy loss
      expect(advancedComposition.totalEpsilon).toBeLessThan(basicComposition.totalEpsilon);
    });
  });

  describe('Privacy Parameter Validation', () => {
    it('should validate epsilon values', () => {
      const invalidParams = [
        { epsilon: 0, delta: 1e-5, sensitivity: 1, mechanism: 'laplace' as const },
        { epsilon: -1, delta: 1e-5, sensitivity: 1, mechanism: 'laplace' as const },
        { epsilon: 100, delta: 1e-5, sensitivity: 1, mechanism: 'laplace' as const }
      ];

      invalidParams.forEach(params => {
        const validation = dpService.validatePrivacyParameters(params);
        expect(validation.isValid).toBe(false);
        expect(validation.errors.length).toBeGreaterThan(0);
      });
    });

    it('should validate delta values', () => {
      const invalidParams = [
        { epsilon: 1.0, delta: -1, sensitivity: 1, mechanism: 'laplace' as const },
        { epsilon: 1.0, delta: 1, sensitivity: 1, mechanism: 'laplace' as const },
        { epsilon: 1.0, delta: 0.1, sensitivity: 1, mechanism: 'laplace' as const }
      ];

      invalidParams.forEach(params => {
        const validation = dpService.validatePrivacyParameters(params);
        expect(validation.isValid).toBe(false);
        expect(validation.errors.some(e => e.includes('Delta'))).toBe(true);
      });
    });

    it('should accept valid parameters', () => {
      const validParams = {
        epsilon: 1.0,
        delta: 1e-5,
        sensitivity: 1,
        mechanism: 'laplace' as const
      };

      const validation = dpService.validatePrivacyParameters(validParams);
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Privacy Attacks and Defenses', () => {
    it('should resist membership inference attacks', () => {
      const memberData = [1, 2, 3, 4, 5];
      const nonMemberData = [6, 7, 8, 9, 10];
      
      // Query with member data
      const memberResult = dpService.executeCountQuery(
        memberData,
        (x) => x > 2,
        { epsilon: 0.1, delta: 1e-5, sensitivity: 1, mechanism: 'laplace' },
        testDatasetId
      );
      
      dpService.resetPrivacyBudget(testDatasetId);
      
      // Query with non-member data
      const nonMemberResult = dpService.executeCountQuery(
        nonMemberData,
        (x) => x > 2,
        { epsilon: 0.1, delta: 1e-5, sensitivity: 1, mechanism: 'laplace' },
        testDatasetId
      );
      
      // With sufficient noise, results should not be easily distinguishable
      // This is a simplified test - real membership inference is more complex
      const difference = Math.abs(memberResult.result - nonMemberResult.result);
      expect(difference).toBeLessThan(10); // Noise should mask the difference
    });

    it('should prevent reconstruction attacks through query limits', () => {
      const data = [1, 2, 3, 4, 5];
      let queriesExecuted = 0;
      
      try {
        // Try to execute many queries to reconstruct data
        for (let i = 0; i < 100; i++) {
          dpService.executeCountQuery(
            data,
            (x) => x > i % 5,
            { epsilon: 0.1, delta: 1e-6, sensitivity: 1, mechanism: 'laplace' },
            testDatasetId
          );
          queriesExecuted++;
        }
      } catch (error) {
        // Should eventually run out of privacy budget
        expect(error.message).toContain('Insufficient privacy budget');
      }
      
      // Should not be able to execute all 100 queries
      expect(queriesExecuted).toBeLessThan(100);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large datasets efficiently', () => {
      const largeData = Array.from({ length: 100000 }, (_, i) => i);
      
      const startTime = Date.now();
      const result = dpService.executeCountQuery(
        largeData,
        (x) => x > 50000,
        { epsilon: 1.0, delta: 1e-5, sensitivity: 1, mechanism: 'laplace' },
        testDatasetId
      );
      const endTime = Date.now();
      
      expect(result.result).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should maintain privacy guarantees under concurrent queries', async () => {
      const data = [1, 2, 3, 4, 5];
      const promises: Promise<any>[] = [];
      
      // Execute multiple concurrent queries
      for (let i = 0; i < 10; i++) {
        const promise = new Promise((resolve) => {
          setTimeout(() => {
            try {
              const result = dpService.executeCountQuery(
                data,
                (x) => x > 2,
                { epsilon: 0.5, delta: 1e-6, sensitivity: 1, mechanism: 'laplace' },
                testDatasetId
              );
              resolve(result);
            } catch (error) {
              resolve({ error: error.message });
            }
          }, Math.random() * 100);
        });
        promises.push(promise);
      }
      
      const results = await Promise.all(promises);
      
      // Some queries should succeed, some should fail due to budget exhaustion
      const successes = results.filter(r => !r.error);
      const failures = results.filter(r => r.error);
      
      expect(successes.length + failures.length).toBe(10);
      expect(successes.length).toBeLessThan(10); // Budget should be exhausted
    });
  });
});