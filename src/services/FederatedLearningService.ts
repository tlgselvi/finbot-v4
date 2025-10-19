/**
 * Federated Learning Service
 * Core service for managing federated learning operations and privacy-preserving ML
 */

import { EventEmitter } from 'events';

interface ModelUpdate {
  clientId: string;
  weights: Float32Array[];
  gradients: Float32Array[];
  dataSize: number;
  accuracy: number;
  loss: number;
  privacyNoise?: Float32Array[];
}

interface AggregationResult {
  globalWeights: Float32Array[];
  accuracy: number;
  loss: number;
  participantCount: number;
  privacyBudgetUsed: number;
}

interface PrivacyConfig {
  epsilon: number;
  delta: number;
  noiseMultiplier: number;
  clipNorm: number;
  enableSecureAggregation: boolean;
}

interface ClientConfig {
  clientId: string;
  dataSize: number;
  batchSize: number;
  learningRate: number;
  epochs: number;
}

class FederatedLearningService extends EventEmitter {
  private clients: Map<string, ClientConfig> = new Map();
  private modelUpdates: Map<string, ModelUpdate> = new Map();
  private globalWeights: Float32Array[] = [];
  private privacyConfig: PrivacyConfig;
  private roundNumber: number = 0;
  private isTraining: boolean = false;
  private privacyBudgetUsed: number = 0;

  constructor(privacyConfig: PrivacyConfig) {
    super();
    this.privacyConfig = privacyConfig;
    this.initializeGlobalModel();
  }

  /**
   * Initialize the global model with random weights
   */
  private initializeGlobalModel(): void {
    // Initialize with typical neural network layer sizes for financial analytics
    const layerSizes = [100, 64, 32, 16, 1]; // Input -> Hidden layers -> Output
    
    this.globalWeights = [];
    for (let i = 0; i < layerSizes.length - 1; i++) {
      const weightMatrix = new Float32Array(layerSizes[i] * layerSizes[i + 1]);
      const biasVector = new Float32Array(layerSizes[i + 1]);
      
      // Xavier initialization
      const limit = Math.sqrt(6 / (layerSizes[i] + layerSizes[i + 1]));
      for (let j = 0; j < weightMatrix.length; j++) {
        weightMatrix[j] = (Math.random() * 2 - 1) * limit;
      }
      for (let j = 0; j < biasVector.length; j++) {
        biasVector[j] = 0;
      }
      
      this.globalWeights.push(weightMatrix, biasVector);
    }
    
    this.emit('modelInitialized', {
      layerCount: layerSizes.length - 1,
      totalParameters: this.globalWeights.reduce((sum, layer) => sum + layer.length, 0)
    });
  }

  /**
   * Register a new client for federated learning
   */
  registerClient(config: ClientConfig): void {
    this.clients.set(config.clientId, config);
    this.emit('clientRegistered', config);
  }

  /**
   * Unregister a client
   */
  unregisterClient(clientId: string): void {
    this.clients.delete(clientId);
    this.modelUpdates.delete(clientId);
    this.emit('clientUnregistered', { clientId });
  }

  /**
   * Start a new federated learning round
   */
  async startFederatedRound(minClients: number = 2): Promise<void> {
    if (this.isTraining) {
      throw new Error('Training round already in progress');
    }

    if (this.clients.size < minClients) {
      throw new Error(`Insufficient clients. Need at least ${minClients}, have ${this.clients.size}`);
    }

    this.isTraining = true;
    this.roundNumber++;
    this.modelUpdates.clear();

    this.emit('roundStarted', {
      roundNumber: this.roundNumber,
      participantCount: this.clients.size,
      globalWeights: this.globalWeights
    });

    // Send global model to all clients
    for (const [clientId, config] of this.clients) {
      this.emit('modelSent', {
        clientId,
        globalWeights: this.globalWeights,
        config
      });
    }
  }

  /**
   * Receive model update from a client
   */
  receiveModelUpdate(update: ModelUpdate): void {
    if (!this.isTraining) {
      throw new Error('No training round in progress');
    }

    if (!this.clients.has(update.clientId)) {
      throw new Error('Client not registered');
    }

    // Apply differential privacy noise if enabled
    if (this.privacyConfig.epsilon > 0) {
      update = this.applyDifferentialPrivacy(update);
    }

    this.modelUpdates.set(update.clientId, update);
    
    this.emit('updateReceived', {
      clientId: update.clientId,
      accuracy: update.accuracy,
      loss: update.loss,
      receivedCount: this.modelUpdates.size,
      totalClients: this.clients.size
    });

    // Check if all clients have submitted updates
    if (this.modelUpdates.size === this.clients.size) {
      this.performAggregation();
    }
  }

  /**
   * Apply differential privacy noise to model updates
   */
  private applyDifferentialPrivacy(update: ModelUpdate): ModelUpdate {
    const noisyWeights = update.weights.map(layer => {
      const noisyLayer = new Float32Array(layer.length);
      const sensitivity = this.privacyConfig.clipNorm;
      const noiseScale = sensitivity * this.privacyConfig.noiseMultiplier / this.privacyConfig.epsilon;
      
      for (let i = 0; i < layer.length; i++) {
        // Add Gaussian noise
        const noise = this.generateGaussianNoise(0, noiseScale);
        noisyLayer[i] = layer[i] + noise;
      }
      
      return noisyLayer;
    });

    // Update privacy budget
    this.privacyBudgetUsed += this.privacyConfig.epsilon;

    return {
      ...update,
      weights: noisyWeights,
      privacyNoise: update.weights.map(layer => 
        new Float32Array(layer.length).map(() => 
          this.generateGaussianNoise(0, this.privacyConfig.noiseMultiplier)
        )
      )
    };
  }

  /**
   * Generate Gaussian noise using Box-Muller transform
   */
  private generateGaussianNoise(mean: number = 0, stddev: number = 1): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while (v === 0) v = Math.random();
    
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return z * stddev + mean;
  }

  /**
   * Perform secure aggregation of model updates
   */
  private performAggregation(): void {
    const updates = Array.from(this.modelUpdates.values());
    const totalDataSize = updates.reduce((sum, update) => sum + update.dataSize, 0);
    
    // Weighted federated averaging
    const newGlobalWeights = this.globalWeights.map((globalLayer, layerIndex) => {
      const aggregatedLayer = new Float32Array(globalLayer.length);
      
      for (const update of updates) {
        const weight = update.dataSize / totalDataSize;
        const clientLayer = update.weights[layerIndex];
        
        for (let i = 0; i < aggregatedLayer.length; i++) {
          aggregatedLayer[i] += clientLayer[i] * weight;
        }
      }
      
      return aggregatedLayer;
    });

    // Apply secure aggregation if enabled
    if (this.privacyConfig.enableSecureAggregation) {
      this.applySecureAggregation(newGlobalWeights);
    }

    this.globalWeights = newGlobalWeights;

    // Calculate aggregated metrics
    const avgAccuracy = updates.reduce((sum, update) => 
      sum + update.accuracy * (update.dataSize / totalDataSize), 0
    );
    const avgLoss = updates.reduce((sum, update) => 
      sum + update.loss * (update.dataSize / totalDataSize), 0
    );

    const result: AggregationResult = {
      globalWeights: this.globalWeights,
      accuracy: avgAccuracy,
      loss: avgLoss,
      participantCount: updates.length,
      privacyBudgetUsed: this.privacyBudgetUsed
    };

    this.isTraining = false;
    
    this.emit('roundCompleted', {
      roundNumber: this.roundNumber,
      result,
      privacyMetrics: {
        budgetUsed: this.privacyBudgetUsed,
        epsilon: this.privacyConfig.epsilon,
        delta: this.privacyConfig.delta,
        noiseMultiplier: this.privacyConfig.noiseMultiplier
      }
    });
  }

  /**
   * Apply secure aggregation protocols
   */
  private applySecureAggregation(weights: Float32Array[]): void {
    // Simulate secure aggregation by adding cryptographic operations
    // In a real implementation, this would involve:
    // 1. Secret sharing
    // 2. Homomorphic encryption
    // 3. Secure multi-party computation
    
    for (const layer of weights) {
      for (let i = 0; i < layer.length; i++) {
        // Apply a simple transformation to simulate secure aggregation
        // Real implementation would use proper cryptographic protocols
        layer[i] = this.secureTransform(layer[i]);
      }
    }
  }

  /**
   * Simulate secure transformation (placeholder for real cryptographic operations)
   */
  private secureTransform(value: number): number {
    // This is a placeholder - real secure aggregation would use
    // homomorphic encryption or secure multi-party computation
    return value;
  }

  /**
   * Get current global model
   */
  getGlobalModel(): {
    weights: Float32Array[];
    version: number;
    accuracy?: number;
    loss?: number;
  } {
    return {
      weights: this.globalWeights,
      version: this.roundNumber,
    };
  }

  /**
   * Get privacy metrics
   */
  getPrivacyMetrics(): {
    budgetUsed: number;
    budgetRemaining: number;
    epsilon: number;
    delta: number;
    noiseMultiplier: number;
    roundsCompleted: number;
  } {
    return {
      budgetUsed: this.privacyBudgetUsed,
      budgetRemaining: Math.max(0, 10 - this.privacyBudgetUsed), // Assume total budget of 10
      epsilon: this.privacyConfig.epsilon,
      delta: this.privacyConfig.delta,
      noiseMultiplier: this.privacyConfig.noiseMultiplier,
      roundsCompleted: this.roundNumber
    };
  }

  /**
   * Update privacy configuration
   */
  updatePrivacyConfig(config: Partial<PrivacyConfig>): void {
    this.privacyConfig = { ...this.privacyConfig, ...config };
    this.emit('privacyConfigUpdated', this.privacyConfig);
  }

  /**
   * Get connected clients
   */
  getConnectedClients(): ClientConfig[] {
    return Array.from(this.clients.values());
  }

  /**
   * Check if training is in progress
   */
  isTrainingInProgress(): boolean {
    return this.isTraining;
  }

  /**
   * Stop current training round
   */
  stopTraining(): void {
    if (this.isTraining) {
      this.isTraining = false;
      this.modelUpdates.clear();
      this.emit('trainingStopped', { roundNumber: this.roundNumber });
    }
  }

  /**
   * Export global model for download
   */
  exportModel(): Blob {
    const modelData = {
      version: this.roundNumber,
      weights: this.globalWeights.map(layer => Array.from(layer)),
      privacyMetrics: this.getPrivacyMetrics(),
      timestamp: new Date().toISOString()
    };

    return new Blob([JSON.stringify(modelData, null, 2)], {
      type: 'application/json'
    });
  }

  /**
   * Import global model
   */
  importModel(modelData: any): void {
    if (this.isTraining) {
      throw new Error('Cannot import model during training');
    }

    this.globalWeights = modelData.weights.map((layer: number[]) => 
      new Float32Array(layer)
    );
    this.roundNumber = modelData.version || 0;
    
    this.emit('modelImported', {
      version: this.roundNumber,
      parameterCount: this.globalWeights.reduce((sum, layer) => sum + layer.length, 0)
    });
  }
}

export default FederatedLearningService;
export type { ModelUpdate, AggregationResult, PrivacyConfig, ClientConfig };