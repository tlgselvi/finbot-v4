/**
 * Federated Learning Service
 * Privacy-preserving machine learning infrastructure using TensorFlow Federated
 */

const tf = require('@tensorflow/tfjs-node');
const crypto = require('crypto');
const EventEmitter = require('events');

class FederatedLearningService extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map();
    this.globalModel = null;
    this.roundNumber = 0;
    this.minClientsPerRound = 3;
    this.maxClientsPerRound = 10;
    this.learningRate = 0.01;
    this.aggregationStrategy = 'federated_averaging';
    this.privacyBudget = 1.0;
    this.noiseMultiplier = 0.1;
    
    this.initializeGlobalModel();
  }

  /**
   * Initialize the global model architecture
   */
  async initializeGlobalModel() {
    try {
      // Create a simple neural network for financial prediction
      this.globalModel = tf.sequential({
        layers: [
          tf.layers.dense({
            inputShape: [10], // 10 financial features
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

      // Compile the model
      this.globalModel.compile({
        optimizer: tf.train.adam(this.learningRate),
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
      });

      console.log('Global federated learning model initialized');
      this.emit('modelInitialized', {
        modelSummary: this.getModelSummary(),
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Failed to initialize global model:', error);
      throw error;
    }
  }

  /**
   * Register a new client for federated learning
   */
  registerClient(clientId, clientInfo = {}) {
    try {
      const client = {
        id: clientId,
        registeredAt: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        roundsParticipated: 0,
        averageAccuracy: 0,
        dataSize: clientInfo.dataSize || 0,
        deviceInfo: clientInfo.deviceInfo || {},
        privacyPreferences: clientInfo.privacyPreferences || {
          maxRounds: 100,
          allowModelSharing: true,
          noiseLevel: 'medium'
        },
        status: 'active'
      };

      this.clients.set(clientId, client);
      
      console.log(`Client ${clientId} registered for federated learning`);
      this.emit('clientRegistered', { clientId, client });

      return {
        success: true,
        clientId,
        globalModelWeights: this.getModelWeights(),
        roundNumber: this.roundNumber
      };

    } catch (error) {
      console.error(`Failed to register client ${clientId}:`, error);
      throw error;
    }
  }

  /**
   * Start a new federated learning round
   */
  async startFederatedRound() {
    try {
      this.roundNumber++;
      console.log(`Starting federated learning round ${this.roundNumber}`);

      // Select clients for this round
      const selectedClients = this.selectClientsForRound();
      
      if (selectedClients.length < this.minClientsPerRound) {
        throw new Error(`Insufficient clients for round. Need ${this.minClientsPerRound}, got ${selectedClients.length}`);
      }

      const roundInfo = {
        roundNumber: this.roundNumber,
        selectedClients: selectedClients.map(c => c.id),
        globalModelWeights: this.getModelWeights(),
        trainingConfig: {
          epochs: 5,
          batchSize: 32,
          learningRate: this.learningRate,
          privacyBudget: this.privacyBudget / this.roundNumber // Decrease privacy budget over time
        },
        deadline: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
      };

      // Notify selected clients
      selectedClients.forEach(client => {
        client.lastSeen = new Date().toISOString();
        client.status = 'training';
      });

      this.emit('roundStarted', roundInfo);
      
      return roundInfo;

    } catch (error) {
      console.error(`Failed to start federated round ${this.roundNumber}:`, error);
      throw error;
    }
  }

  /**
   * Receive model updates from clients
   */
  async receiveClientUpdate(clientId, modelUpdate) {
    try {
      const client = this.clients.get(clientId);
      if (!client) {
        throw new Error(`Unknown client: ${clientId}`);
      }

      // Validate model update
      const isValid = await this.validateModelUpdate(modelUpdate);
      if (!isValid) {
        throw new Error('Invalid model update received');
      }

      // Apply differential privacy noise
      const noisyUpdate = this.addDifferentialPrivacyNoise(modelUpdate);

      // Store the update
      if (!this.currentRoundUpdates) {
        this.currentRoundUpdates = new Map();
      }
      
      this.currentRoundUpdates.set(clientId, {
        weights: noisyUpdate.weights,
        metrics: noisyUpdate.metrics,
        dataSize: noisyUpdate.dataSize,
        receivedAt: new Date().toISOString()
      });

      // Update client info
      client.lastSeen = new Date().toISOString();
      client.roundsParticipated++;
      client.status = 'completed';
      
      if (noisyUpdate.metrics && noisyUpdate.metrics.accuracy) {
        client.averageAccuracy = (
          (client.averageAccuracy * (client.roundsParticipated - 1) + noisyUpdate.metrics.accuracy) / 
          client.roundsParticipated
        );
      }

      console.log(`Received update from client ${clientId} for round ${this.roundNumber}`);
      this.emit('clientUpdateReceived', { clientId, roundNumber: this.roundNumber });

      // Check if we have enough updates to aggregate
      const selectedClients = this.selectClientsForRound();
      if (this.currentRoundUpdates.size >= Math.min(selectedClients.length, this.maxClientsPerRound)) {
        await this.aggregateModelUpdates();
      }

      return { success: true, roundNumber: this.roundNumber };

    } catch (error) {
      console.error(`Failed to receive update from client ${clientId}:`, error);
      throw error;
    }
  }

  /**
   * Aggregate model updates using federated averaging
   */
  async aggregateModelUpdates() {
    try {
      console.log(`Aggregating ${this.currentRoundUpdates.size} model updates for round ${this.roundNumber}`);

      const updates = Array.from(this.currentRoundUpdates.values());
      const totalDataSize = updates.reduce((sum, update) => sum + (update.dataSize || 1), 0);

      // Weighted federated averaging
      const aggregatedWeights = await this.federatedAveraging(updates, totalDataSize);

      // Update global model
      await this.updateGlobalModel(aggregatedWeights);

      // Calculate round metrics
      const roundMetrics = this.calculateRoundMetrics(updates);

      const roundResult = {
        roundNumber: this.roundNumber,
        participatingClients: this.currentRoundUpdates.size,
        aggregatedMetrics: roundMetrics,
        globalModelAccuracy: roundMetrics.averageAccuracy,
        completedAt: new Date().toISOString()
      };

      // Reset for next round
      this.currentRoundUpdates = new Map();

      console.log(`Round ${this.roundNumber} completed with ${roundResult.participatingClients} clients`);
      this.emit('roundCompleted', roundResult);

      return roundResult;

    } catch (error) {
      console.error(`Failed to aggregate model updates for round ${this.roundNumber}:`, error);
      throw error;
    }
  }

  /**
   * Federated averaging algorithm
   */
  async federatedAveraging(updates, totalDataSize) {
    try {
      const modelWeights = this.globalModel.getWeights();
      const aggregatedWeights = [];

      // Initialize aggregated weights with zeros
      for (let i = 0; i < modelWeights.length; i++) {
        const shape = modelWeights[i].shape;
        aggregatedWeights.push(tf.zeros(shape));
      }

      // Weighted averaging
      for (const update of updates) {
        const weight = (update.dataSize || 1) / totalDataSize;
        
        for (let i = 0; i < update.weights.length; i++) {
          const weightedUpdate = tf.mul(update.weights[i], weight);
          aggregatedWeights[i] = tf.add(aggregatedWeights[i], weightedUpdate);
          weightedUpdate.dispose();
        }
      }

      return aggregatedWeights;

    } catch (error) {
      console.error('Failed to perform federated averaging:', error);
      throw error;
    }
  }

  /**
   * Add differential privacy noise to model updates
   */
  addDifferentialPrivacyNoise(modelUpdate) {
    try {
      const noisyWeights = modelUpdate.weights.map(weight => {
        // Add Gaussian noise for differential privacy
        const noise = tf.randomNormal(weight.shape, 0, this.noiseMultiplier);
        const noisyWeight = tf.add(weight, noise);
        noise.dispose();
        return noisyWeight;
      });

      return {
        ...modelUpdate,
        weights: noisyWeights,
        privacyBudgetUsed: this.privacyBudget / this.roundNumber
      };

    } catch (error) {
      console.error('Failed to add differential privacy noise:', error);
      throw error;
    }
  }

  /**
   * Validate model update from client
   */
  async validateModelUpdate(modelUpdate) {
    try {
      // Check if update has required fields
      if (!modelUpdate.weights || !Array.isArray(modelUpdate.weights)) {
        return false;
      }

      // Check if weights have correct shapes
      const expectedShapes = this.globalModel.getWeights().map(w => w.shape);
      if (modelUpdate.weights.length !== expectedShapes.length) {
        return false;
      }

      for (let i = 0; i < modelUpdate.weights.length; i++) {
        const expectedShape = expectedShapes[i];
        const actualShape = modelUpdate.weights[i].shape;
        
        if (expectedShape.length !== actualShape.length) {
          return false;
        }
        
        for (let j = 0; j < expectedShape.length; j++) {
          if (expectedShape[j] !== actualShape[j]) {
            return false;
          }
        }
      }

      // Check for suspicious values (potential attacks)
      for (const weight of modelUpdate.weights) {
        const values = await weight.data();
        const hasNaN = values.some(v => isNaN(v));
        const hasInf = values.some(v => !isFinite(v));
        const hasExtremeValues = values.some(v => Math.abs(v) > 1000);
        
        if (hasNaN || hasInf || hasExtremeValues) {
          console.warn('Suspicious values detected in model update');
          return false;
        }
      }

      return true;

    } catch (error) {
      console.error('Failed to validate model update:', error);
      return false;
    }
  }

  /**
   * Select clients for the current round
   */
  selectClientsForRound() {
    const activeClients = Array.from(this.clients.values())
      .filter(client => client.status === 'active')
      .filter(client => {
        // Check if client hasn't exceeded max rounds
        const maxRounds = client.privacyPreferences.maxRounds || 100;
        return client.roundsParticipated < maxRounds;
      });

    // Randomly select clients (can be improved with more sophisticated selection)
    const shuffled = activeClients.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, this.maxClientsPerRound);
  }

  /**
   * Update global model with aggregated weights
   */
  async updateGlobalModel(aggregatedWeights) {
    try {
      this.globalModel.setWeights(aggregatedWeights);
      
      // Dispose old weights to prevent memory leaks
      aggregatedWeights.forEach(weight => weight.dispose());
      
      console.log(`Global model updated for round ${this.roundNumber}`);
      this.emit('globalModelUpdated', {
        roundNumber: this.roundNumber,
        modelSummary: this.getModelSummary()
      });

    } catch (error) {
      console.error('Failed to update global model:', error);
      throw error;
    }
  }

  /**
   * Calculate metrics for the completed round
   */
  calculateRoundMetrics(updates) {
    const accuracies = updates
      .map(update => update.metrics?.accuracy)
      .filter(acc => acc !== undefined);

    const losses = updates
      .map(update => update.metrics?.loss)
      .filter(loss => loss !== undefined);

    return {
      averageAccuracy: accuracies.length > 0 ? 
        accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length : 0,
      averageLoss: losses.length > 0 ? 
        losses.reduce((sum, loss) => sum + loss, 0) / losses.length : 0,
      participatingClients: updates.length,
      totalDataSize: updates.reduce((sum, update) => sum + (update.dataSize || 0), 0)
    };
  }

  /**
   * Get current model weights for distribution to clients
   */
  getModelWeights() {
    try {
      return this.globalModel.getWeights().map(weight => ({
        shape: weight.shape,
        data: weight.arraySync()
      }));
    } catch (error) {
      console.error('Failed to get model weights:', error);
      return null;
    }
  }

  /**
   * Get model summary
   */
  getModelSummary() {
    try {
      const totalParams = this.globalModel.countParams();
      const layers = this.globalModel.layers.map(layer => ({
        name: layer.name,
        className: layer.getClassName(),
        outputShape: layer.outputShape
      }));

      return {
        totalParameters: totalParams,
        layers: layers,
        inputShape: this.globalModel.inputShape,
        outputShape: this.globalModel.outputShape
      };
    } catch (error) {
      console.error('Failed to get model summary:', error);
      return null;
    }
  }

  /**
   * Get federated learning statistics
   */
  getStatistics() {
    const activeClients = Array.from(this.clients.values())
      .filter(client => client.status === 'active');

    const totalRoundsParticipated = Array.from(this.clients.values())
      .reduce((sum, client) => sum + client.roundsParticipated, 0);

    return {
      totalClients: this.clients.size,
      activeClients: activeClients.length,
      currentRound: this.roundNumber,
      totalRoundsParticipated,
      averageClientParticipation: this.clients.size > 0 ? 
        totalRoundsParticipated / this.clients.size : 0,
      privacyBudgetRemaining: Math.max(0, this.privacyBudget - (this.privacyBudget / Math.max(1, this.roundNumber))),
      modelSummary: this.getModelSummary()
    };
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    try {
      if (this.globalModel) {
        this.globalModel.dispose();
      }
      
      if (this.currentRoundUpdates) {
        this.currentRoundUpdates.forEach(update => {
          update.weights.forEach(weight => weight.dispose());
        });
      }

      console.log('Federated learning service cleaned up');
    } catch (error) {
      console.error('Failed to cleanup federated learning service:', error);
    }
  }
}

module.exports = FederatedLearningService;