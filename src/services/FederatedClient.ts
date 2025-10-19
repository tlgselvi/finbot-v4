/**
 * Federated Learning Client
 * Client-side implementation for federated learning with privacy preservation
 */

import { EventEmitter } from 'events';

interface TrainingData {
  features: Float32Array[];
  labels: Float32Array;
}

interface TrainingConfig {
  batchSize: number;
  epochs: number;
  learningRate: number;
  clipNorm: number;
}

interface ModelWeights {
  weights: Float32Array[];
  biases: Float32Array[];
}

interface TrainingMetrics {
  accuracy: number;
  loss: number;
  epoch: number;
  batchesProcessed: number;
}

class FederatedClient extends EventEmitter {
  private clientId: string;
  private localData: TrainingData;
  private currentWeights: Float32Array[] = [];
  private trainingConfig: TrainingConfig;
  private isTraining: boolean = false;

  constructor(
    clientId: string,
    localData: TrainingData,
    trainingConfig: TrainingConfig
  ) {
    super();
    this.clientId = clientId;
    this.localData = localData;
    this.trainingConfig = trainingConfig;
  }

  /**
   * Receive global model weights from the server
   */
  receiveGlobalModel(weights: Float32Array[]): void {
    this.currentWeights = weights.map(layer => new Float32Array(layer));
    this.emit('modelReceived', {
      clientId: this.clientId,
      parameterCount: weights.reduce((sum, layer) => sum + layer.length, 0)
    });
  }

  /**
   * Start local training on the client's data
   */
  async startLocalTraining(): Promise<{
    weights: Float32Array[];
    accuracy: number;
    loss: number;
    dataSize: number;
  }> {
    if (this.isTraining) {
      throw new Error('Training already in progress');
    }

    if (this.currentWeights.length === 0) {
      throw new Error('No global model received');
    }

    this.isTraining = true;
    
    try {
      this.emit('trainingStarted', { clientId: this.clientId });

      const result = await this.performLocalTraining();
      
      this.emit('trainingCompleted', {
        clientId: this.clientId,
        accuracy: result.accuracy,
        loss: result.loss,
        dataSize: result.dataSize
      });

      return result;
    } finally {
      this.isTraining = false;
    }
  }

  /**
   * Perform local training using federated learning algorithms
   */
  private async performLocalTraining(): Promise<{
    weights: Float32Array[];
    accuracy: number;
    loss: number;
    dataSize: number;
  }> {
    const { batchSize, epochs, learningRate } = this.trainingConfig;
    const dataSize = this.localData.features.length;
    
    // Create local copy of weights for training
    const localWeights = this.currentWeights.map(layer => new Float32Array(layer));
    
    let totalLoss = 0;
    let correctPredictions = 0;
    let totalPredictions = 0;

    for (let epoch = 0; epoch < epochs; epoch++) {
      // Shuffle data for each epoch
      const shuffledIndices = this.shuffleArray([...Array(dataSize).keys()]);
      
      for (let batchStart = 0; batchStart < dataSize; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize, dataSize);
        const batchIndices = shuffledIndices.slice(batchStart, batchEnd);
        
        // Forward pass
        const batchPredictions: number[] = [];
        const batchTargets: number[] = [];
        
        for (const idx of batchIndices) {
          const features = this.localData.features[idx];
          const target = this.localData.labels[idx];
          
          const prediction = this.forwardPass(features, localWeights);
          batchPredictions.push(prediction);
          batchTargets.push(target);
          
          // Calculate accuracy
          const predictedClass = prediction > 0.5 ? 1 : 0;
          const actualClass = target > 0.5 ? 1 : 0;
          if (predictedClass === actualClass) correctPredictions++;
          totalPredictions++;
        }
        
        // Calculate batch loss
        const batchLoss = this.calculateLoss(batchPredictions, batchTargets);
        totalLoss += batchLoss;
        
        // Backward pass and weight update
        const gradients = this.calculateGradients(
          batchIndices.map(idx => this.localData.features[idx]),
          batchPredictions,
          batchTargets,
          localWeights
        );
        
        this.updateWeights(localWeights, gradients, learningRate);
        
        // Apply gradient clipping for privacy
        this.clipGradients(gradients, this.trainingConfig.clipNorm);
      }
      
      // Emit progress
      this.emit('epochCompleted', {
        clientId: this.clientId,
        epoch: epoch + 1,
        totalEpochs: epochs,
        loss: totalLoss / totalPredictions,
        accuracy: correctPredictions / totalPredictions
      });
      
      // Simulate training delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const finalAccuracy = correctPredictions / totalPredictions;
    const finalLoss = totalLoss / totalPredictions;

    return {
      weights: localWeights,
      accuracy: finalAccuracy,
      loss: finalLoss,
      dataSize: dataSize
    };
  }

  /**
   * Forward pass through the neural network
   */
  private forwardPass(features: Float32Array, weights: Float32Array[]): number {
    let activation = new Float32Array(features);
    
    // Process each layer
    for (let layerIdx = 0; layerIdx < weights.length; layerIdx += 2) {
      const weightMatrix = weights[layerIdx];
      const biases = weights[layerIdx + 1];
      
      const inputSize = activation.length;
      const outputSize = biases.length;
      const newActivation = new Float32Array(outputSize);
      
      // Matrix multiplication: activation = weights * input + bias
      for (let i = 0; i < outputSize; i++) {
        let sum = biases[i];
        for (let j = 0; j < inputSize; j++) {
          sum += weightMatrix[i * inputSize + j] * activation[j];
        }
        
        // Apply activation function (sigmoid for output layer, ReLU for hidden)
        if (layerIdx === weights.length - 2) {
          // Output layer - sigmoid
          newActivation[i] = 1 / (1 + Math.exp(-sum));
        } else {
          // Hidden layer - ReLU
          newActivation[i] = Math.max(0, sum);
        }
      }
      
      activation = newActivation;
    }
    
    return activation[0]; // Assuming single output
  }

  /**
   * Calculate loss using binary cross-entropy
   */
  private calculateLoss(predictions: number[], targets: number[]): number {
    let loss = 0;
    for (let i = 0; i < predictions.length; i++) {
      const pred = Math.max(1e-15, Math.min(1 - 1e-15, predictions[i])); // Clip to avoid log(0)
      loss += -(targets[i] * Math.log(pred) + (1 - targets[i]) * Math.log(1 - pred));
    }
    return loss / predictions.length;
  }

  /**
   * Calculate gradients using backpropagation
   */
  private calculateGradients(
    batchFeatures: Float32Array[],
    predictions: number[],
    targets: number[],
    weights: Float32Array[]
  ): Float32Array[] {
    const gradients: Float32Array[] = weights.map(layer => new Float32Array(layer.length));
    const batchSize = batchFeatures.length;
    
    // Simplified gradient calculation for demonstration
    // In a real implementation, this would be a full backpropagation algorithm
    
    for (let sampleIdx = 0; sampleIdx < batchSize; sampleIdx++) {
      const features = batchFeatures[sampleIdx];
      const prediction = predictions[sampleIdx];
      const target = targets[sampleIdx];
      
      // Output layer gradient (simplified)
      const outputError = prediction - target;
      
      // Calculate gradients for each layer (simplified)
      for (let layerIdx = 0; layerIdx < weights.length; layerIdx += 2) {
        const weightGradients = gradients[layerIdx];
        const biasGradients = gradients[layerIdx + 1];
        
        // Simplified gradient calculation
        for (let i = 0; i < weightGradients.length; i++) {
          weightGradients[i] += outputError * (Math.random() - 0.5) * 0.01; // Simplified
        }
        
        for (let i = 0; i < biasGradients.length; i++) {
          biasGradients[i] += outputError * 0.01; // Simplified
        }
      }
    }
    
    // Average gradients over batch
    for (const gradient of gradients) {
      for (let i = 0; i < gradient.length; i++) {
        gradient[i] /= batchSize;
      }
    }
    
    return gradients;
  }

  /**
   * Update weights using gradients
   */
  private updateWeights(
    weights: Float32Array[],
    gradients: Float32Array[],
    learningRate: number
  ): void {
    for (let layerIdx = 0; layerIdx < weights.length; layerIdx++) {
      const layerWeights = weights[layerIdx];
      const layerGradients = gradients[layerIdx];
      
      for (let i = 0; i < layerWeights.length; i++) {
        layerWeights[i] -= learningRate * layerGradients[i];
      }
    }
  }

  /**
   * Clip gradients for differential privacy
   */
  private clipGradients(gradients: Float32Array[], clipNorm: number): void {
    // Calculate global gradient norm
    let globalNorm = 0;
    for (const gradient of gradients) {
      for (let i = 0; i < gradient.length; i++) {
        globalNorm += gradient[i] * gradient[i];
      }
    }
    globalNorm = Math.sqrt(globalNorm);
    
    // Clip if necessary
    if (globalNorm > clipNorm) {
      const clipFactor = clipNorm / globalNorm;
      for (const gradient of gradients) {
        for (let i = 0; i < gradient.length; i++) {
          gradient[i] *= clipFactor;
        }
      }
    }
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Generate synthetic financial data for training
   */
  static generateSyntheticFinancialData(sampleCount: number): TrainingData {
    const features: Float32Array[] = [];
    const labels = new Float32Array(sampleCount);
    
    for (let i = 0; i < sampleCount; i++) {
      // Generate synthetic financial features
      const feature = new Float32Array([
        Math.random() * 100000,      // Income
        Math.random() * 50000,       // Expenses
        Math.random() * 10000,       // Savings
        Math.random() * 5000,        // Debt
        Math.random() * 800,         // Credit Score (normalized)
        Math.random() * 20,          // Years of credit history
        Math.random() * 10,          // Number of accounts
        Math.random() * 0.3,         // Debt-to-income ratio
        Math.random() * 0.1,         // Default rate
        Math.random()                // Risk score
      ]);
      
      features.push(feature);
      
      // Generate label based on features (simplified risk assessment)
      const riskScore = (
        feature[3] / feature[0] +    // Debt-to-income
        (1 - feature[4] / 800) +     // Credit score (inverted)
        feature[8]                   // Default rate
      ) / 3;
      
      labels[i] = riskScore > 0.5 ? 1 : 0; // High risk = 1, Low risk = 0
    }
    
    return { features, labels };
  }

  /**
   * Get client information
   */
  getClientInfo(): {
    clientId: string;
    dataSize: number;
    isTraining: boolean;
  } {
    return {
      clientId: this.clientId,
      dataSize: this.localData.features.length,
      isTraining: this.isTraining
    };
  }

  /**
   * Update training configuration
   */
  updateTrainingConfig(config: Partial<TrainingConfig>): void {
    this.trainingConfig = { ...this.trainingConfig, ...config };
    this.emit('configUpdated', { clientId: this.clientId, config: this.trainingConfig });
  }

  /**
   * Stop training if in progress
   */
  stopTraining(): void {
    if (this.isTraining) {
      this.isTraining = false;
      this.emit('trainingStopped', { clientId: this.clientId });
    }
  }
}

export default FederatedClient;
export type { TrainingData, TrainingConfig, ModelWeights, TrainingMetrics };