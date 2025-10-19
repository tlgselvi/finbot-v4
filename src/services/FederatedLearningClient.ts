/**
 * Federated Learning Client
 * Client-side implementation for privacy-preserving machine learning
 */

import * as tf from '@tensorflow/tfjs';

interface ClientConfig {
  clientId: string;
  serverUrl: string;
  privacyPreferences: {
    maxRounds: number;
    allowModelSharing: boolean;
    noiseLevel: 'low' | 'medium' | 'high';
    dataRetentionDays: number;
  };
  trainingConfig: {
    epochs: number;
    batchSize: number;
    validationSplit: number;
  };
}

interface ModelUpdate {
  weights: tf.Tensor[];
  metrics: {
    accuracy: number;
    loss: number;
    epochs: number;
  };
  dataSize: number;
  privacyMetrics: {
    noiseLevel: number;
    privacyBudgetUsed: number;
  };
}

interface TrainingData {
  features: number[][];
  labels: number[];
  metadata?: {
    userId: string;
    timestamp: string;
    dataSource: string;
  };
}

export class FederatedLearningClient {
  private clientId: string;
  private serverUrl: string;
  private localModel: tf.LayersModel | null = null;
  private privacyPreferences: ClientConfig['privacyPreferences'];
  private trainingConfig: ClientConfig['trainingConfig'];
  private isTraining: boolean = false;
  private roundNumber: number = 0;
  private participatedRounds: number = 0;

  constructor(config: ClientConfig) {
    this.clientId = config.clientId;
    this.serverUrl = config.serverUrl;
    this.privacyPreferences = config.privacyPreferences;
    this.trainingConfig = config.trainingConfig;
  }

  /**
   * Register with the federated learning server
   */
  async register(): Promise<boolean> {
    try {
      const deviceInfo = await this.getDeviceInfo();
      
      const response = await fetch(`${this.serverUrl}/federated/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId: this.clientId,
          deviceInfo,
          privacyPreferences: this.privacyPreferences,
          capabilities: {
            supportsGPU: tf.backend().name === 'webgl',
            memoryLimit: this.getMemoryLimit(),
            computeCapability: await this.benchmarkDevice()
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Registration failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success && result.globalModelWeights) {
        await this.initializeLocalModel(result.globalModelWeights);
        this.roundNumber = result.roundNumber;
        console.log(`Client ${this.clientId} registered successfully`);
        return true;
      }

      return false;

    } catch (error) {
      console.error('Failed to register with federated learning server:', error);
      return false;
    }
  }

  /**
   * Initialize local model with global weights
   */
  private async initializeLocalModel(globalWeights: any[]): Promise<void> {
    try {
      // Create the same model architecture as the server
      this.localModel = tf.sequential({
        layers: [
          tf.layers.dense({
            inputShape: [10],
            units: 64,
            activation: 'relu',
            name: 'dense1'
          }),
          tf.layers.dropout({ rate: 0.2, name: 'dropout1' }),
          tf.layers.dense({
            units: 32,
            activation: 'relu',
            name: 'dense2'
          }),
          tf.layers.dropout({ rate: 0.2, name: 'dropout2' }),
          tf.layers.dense({
            units: 16,
            activation: 'relu',
            name: 'dense3'
          }),
          tf.layers.dense({
            units: 1,
            activation: 'sigmoid',
            name: 'output'
          })
        ]
      });

      this.localModel.compile({
        optimizer: tf.train.adam(0.01),
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
      });

      // Set weights from global model
      const weights = globalWeights.map(w => tf.tensor(w.data, w.shape));
      this.localModel.setWeights(weights);

      // Dispose temporary tensors
      weights.forEach(w => w.dispose());

      console.log('Local model initialized with global weights');

    } catch (error) {
      console.error('Failed to initialize local model:', error);
      throw error;
    }
  }

  /**
   * Participate in a federated learning round
   */
  async participateInRound(trainingData: TrainingData): Promise<boolean> {
    try {
      if (this.isTraining) {
        console.log('Already participating in a training round');
        return false;
      }

      if (!this.localModel) {
        throw new Error('Local model not initialized');
      }

      // Check privacy constraints
      if (this.participatedRounds >= this.privacyPreferences.maxRounds) {
        console.log('Maximum rounds reached, skipping participation');
        return false;
      }

      this.isTraining = true;
      console.log(`Starting local training for round ${this.roundNumber + 1}`);

      // Prepare training data
      const { features, labels } = await this.preprocessData(trainingData);
      
      // Train local model
      const trainingResult = await this.trainLocalModel(features, labels);
      
      // Create model update with privacy protection
      const modelUpdate = await this.createModelUpdate(trainingResult, trainingData.features.length);
      
      // Send update to server
      const success = await this.sendModelUpdate(modelUpdate);
      
      if (success) {
        this.participatedRounds++;
        this.roundNumber++;
      }

      this.isTraining = false;
      return success;

    } catch (error) {
      console.error('Failed to participate in federated round:', error);
      this.isTraining = false;
      return false;
    }
  }

  /**
   * Preprocess training data with privacy protection
   */
  private async preprocessData(trainingData: TrainingData): Promise<{
    features: tf.Tensor2D;
    labels: tf.Tensor2D;
  }> {
    try {
      // Apply data minimization - only use necessary features
      const minimizedFeatures = this.applyDataMinimization(trainingData.features);
      
      // Add noise for local differential privacy
      const noisyFeatures = this.addLocalDifferentialPrivacy(minimizedFeatures);
      
      // Normalize features
      const normalizedFeatures = this.normalizeFeatures(noisyFeatures);
      
      const features = tf.tensor2d(normalizedFeatures);
      const labels = tf.tensor2d(trainingData.labels.map(l => [l]));

      return { features, labels };

    } catch (error) {
      console.error('Failed to preprocess training data:', error);
      throw error;
    }
  }

  /**
   * Apply data minimization to reduce privacy exposure
   */
  private applyDataMinimization(features: number[][]): number[][] {
    // Remove or mask sensitive features based on privacy preferences
    return features.map(row => {
      // Example: Remove exact amounts, keep only ranges or categories
      return row.map((value, index) => {
        // Apply different minimization strategies based on feature type
        if (index < 3) { // Assume first 3 features are amounts
          return this.quantizeValue(value, 100); // Quantize to nearest 100
        }
        return value;
      });
    });
  }

  /**
   * Add local differential privacy noise
   */
  private addLocalDifferentialPrivacy(features: number[][]): number[][] {
    const noiseScale = this.getNoiseScale();
    
    return features.map(row => 
      row.map(value => {
        const noise = this.generateLaplaceNoise(0, noiseScale);
        return value + noise;
      })
    );
  }

  /**
   * Get noise scale based on privacy preferences
   */
  private getNoiseScale(): number {
    switch (this.privacyPreferences.noiseLevel) {
      case 'low': return 0.1;
      case 'medium': return 0.5;
      case 'high': return 1.0;
      default: return 0.5;
    }
  }

  /**
   * Generate Laplace noise for differential privacy
   */
  private generateLaplaceNoise(mean: number, scale: number): number {
    const u = Math.random() - 0.5;
    return mean - scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  /**
   * Quantize value to reduce precision
   */
  private quantizeValue(value: number, quantum: number): number {
    return Math.round(value / quantum) * quantum;
  }

  /**
   * Normalize features
   */
  private normalizeFeatures(features: number[][]): number[][] {
    if (features.length === 0) return features;
    
    const numFeatures = features[0].length;
    const means = new Array(numFeatures).fill(0);
    const stds = new Array(numFeatures).fill(1);
    
    // Calculate means
    for (let i = 0; i < numFeatures; i++) {
      const values = features.map(row => row[i]);
      means[i] = values.reduce((sum, val) => sum + val, 0) / values.length;
    }
    
    // Calculate standard deviations
    for (let i = 0; i < numFeatures; i++) {
      const values = features.map(row => row[i]);
      const variance = values.reduce((sum, val) => sum + Math.pow(val - means[i], 2), 0) / values.length;
      stds[i] = Math.sqrt(variance) || 1;
    }
    
    // Normalize
    return features.map(row => 
      row.map((value, i) => (value - means[i]) / stds[i])
    );
  }

  /**
   * Train local model on client data
   */
  private async trainLocalModel(features: tf.Tensor2D, labels: tf.Tensor2D): Promise<tf.History> {
    try {
      if (!this.localModel) {
        throw new Error('Local model not initialized');
      }

      const history = await this.localModel.fit(features, labels, {
        epochs: this.trainingConfig.epochs,
        batchSize: this.trainingConfig.batchSize,
        validationSplit: this.trainingConfig.validationSplit,
        verbose: 0,
        shuffle: true,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            console.log(`Epoch ${epoch + 1}: loss=${logs?.loss?.toFixed(4)}, accuracy=${logs?.acc?.toFixed(4)}`);
          }
        }
      });

      // Dispose tensors
      features.dispose();
      labels.dispose();

      return history;

    } catch (error) {
      console.error('Failed to train local model:', error);
      throw error;
    }
  }

  /**
   * Create model update with privacy protection
   */
  private async createModelUpdate(trainingResult: tf.History, dataSize: number): Promise<ModelUpdate> {
    try {
      if (!this.localModel) {
        throw new Error('Local model not initialized');
      }

      const weights = this.localModel.getWeights();
      const lastEpoch = trainingResult.history.loss.length - 1;
      
      const metrics = {
        accuracy: trainingResult.history.acc?.[lastEpoch] || 0,
        loss: trainingResult.history.loss[lastEpoch] || 0,
        epochs: this.trainingConfig.epochs
      };

      // Apply gradient clipping for privacy
      const clippedWeights = this.clipGradients(weights);

      const privacyBudgetUsed = this.calculatePrivacyBudgetUsed();

      return {
        weights: clippedWeights,
        metrics,
        dataSize,
        privacyMetrics: {
          noiseLevel: this.getNoiseScale(),
          privacyBudgetUsed
        }
      };

    } catch (error) {
      console.error('Failed to create model update:', error);
      throw error;
    }
  }

  /**
   * Clip gradients to prevent privacy leakage
   */
  private clipGradients(weights: tf.Tensor[], clipNorm: number = 1.0): tf.Tensor[] {
    return weights.map(weight => {
      const norm = tf.norm(weight);
      const clipFactor = tf.minimum(tf.scalar(1.0), tf.div(clipNorm, norm));
      return tf.mul(weight, clipFactor);
    });
  }

  /**
   * Calculate privacy budget used in this round
   */
  private calculatePrivacyBudgetUsed(): number {
    // Simple privacy budget calculation
    const baseEpsilon = 0.1;
    const noiseFactor = this.getNoiseScale();
    return baseEpsilon / noiseFactor;
  }

  /**
   * Send model update to server
   */
  private async sendModelUpdate(modelUpdate: ModelUpdate): Promise<boolean> {
    try {
      // Serialize weights for transmission
      const serializedWeights = await Promise.all(
        modelUpdate.weights.map(async (weight) => ({
          shape: weight.shape,
          data: await weight.data()
        }))
      );

      const response = await fetch(`${this.serverUrl}/federated/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clientId: this.clientId,
          roundNumber: this.roundNumber + 1,
          weights: serializedWeights,
          metrics: modelUpdate.metrics,
          dataSize: modelUpdate.dataSize,
          privacyMetrics: modelUpdate.privacyMetrics
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to send model update: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Dispose weights after sending
      modelUpdate.weights.forEach(weight => weight.dispose());

      console.log(`Model update sent successfully for round ${this.roundNumber + 1}`);
      return result.success;

    } catch (error) {
      console.error('Failed to send model update:', error);
      return false;
    }
  }

  /**
   * Get device information for server registration
   */
  private async getDeviceInfo(): Promise<any> {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: (navigator as any).deviceMemory,
      connection: (navigator as any).connection?.effectiveType,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get memory limit for training
   */
  private getMemoryLimit(): number {
    const deviceMemory = (navigator as any).deviceMemory;
    if (deviceMemory) {
      return Math.min(deviceMemory * 0.25 * 1024 * 1024 * 1024, 1024 * 1024 * 1024); // 25% of device memory, max 1GB
    }
    return 512 * 1024 * 1024; // Default 512MB
  }

  /**
   * Benchmark device performance
   */
  private async benchmarkDevice(): Promise<number> {
    try {
      const start = performance.now();
      
      // Simple matrix multiplication benchmark
      const a = tf.randomNormal([100, 100]);
      const b = tf.randomNormal([100, 100]);
      const c = tf.matMul(a, b);
      await c.data();
      
      const end = performance.now();
      
      // Cleanup
      a.dispose();
      b.dispose();
      c.dispose();
      
      return end - start; // Lower is better

    } catch (error) {
      console.error('Failed to benchmark device:', error);
      return 1000; // Default slow performance
    }
  }

  /**
   * Get client statistics
   */
  getStatistics(): any {
    return {
      clientId: this.clientId,
      participatedRounds: this.participatedRounds,
      currentRound: this.roundNumber,
      isTraining: this.isTraining,
      privacyPreferences: this.privacyPreferences,
      modelInfo: this.localModel ? {
        totalParams: this.localModel.countParams(),
        layers: this.localModel.layers.length
      } : null
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    try {
      if (this.localModel) {
        this.localModel.dispose();
        this.localModel = null;
      }
      console.log(`Client ${this.clientId} cleaned up`);
    } catch (error) {
      console.error('Failed to cleanup federated learning client:', error);
    }
  }
}