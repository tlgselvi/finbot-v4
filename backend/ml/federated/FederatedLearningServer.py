"""
Federated Learning Server
TensorFlow Federated implementation for privacy-preserving ML training
"""

import tensorflow as tf
import tensorflow_federated as tff
import numpy as np
import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
import json
import hashlib
import hmac
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class ClientUpdate:
    """Represents a client model update"""
    client_id: str
    model_weights: List[np.ndarray]
    num_examples: int
    loss: float
    accuracy: float
    timestamp: datetime
    signature: str

@dataclass
class FederatedRound:
    """Represents a federated learning round"""
    round_id: int
    participating_clients: List[str]
    global_model_weights: List[np.ndarray]
    aggregated_loss: float
    aggregated_accuracy: float
    convergence_metrics: Dict[str, float]
    timestamp: datetime

class SecureAggregator:
    """Secure aggregation protocol for federated learning"""
    
    def __init__(self, encryption_key: bytes):
        self.cipher_suite = Fernet(encryption_key)
        
    def encrypt_weights(self, weights: List[np.ndarray]) -> bytes:
        """Encrypt model weights for secure transmission"""
        try:
            # Serialize weights
            weights_bytes = self._serialize_weights(weights)
            
            # Encrypt
            encrypted_weights = self.cipher_suite.encrypt(weights_bytes)
            return encrypted_weights
            
        except Exception as e:
            logger.error(f"Error encrypting weights: {e}")
            raise
    
    def decrypt_weights(self, encrypted_weights: bytes) -> List[np.ndarray]:
        """Decrypt model weights"""
        try:
            # Decrypt
            weights_bytes = self.cipher_suite.decrypt(encrypted_weights)
            
            # Deserialize
            weights = self._deserialize_weights(weights_bytes)
            return weights
            
        except Exception as e:
            logger.error(f"Error decrypting weights: {e}")
            raise
    
    def _serialize_weights(self, weights: List[np.ndarray]) -> bytes:
        """Serialize numpy arrays to bytes"""
        serialized = []
        for weight in weights:
            serialized.append({
                'data': weight.tobytes(),
                'shape': weight.shape,
                'dtype': str(weight.dtype)
            })
        return json.dumps(serialized, default=str).encode()
    
    def _deserialize_weights(self, weights_bytes: bytes) -> List[np.ndarray]:
        """Deserialize bytes to numpy arrays"""
        serialized = json.loads(weights_bytes.decode())
        weights = []
        for item in serialized:
            weight = np.frombuffer(
                item['data'], 
                dtype=np.dtype(item['dtype'])
            ).reshape(item['shape'])
            weights.append(weight)
        return weights
    
    def secure_aggregate(self, client_updates: List[ClientUpdate]) -> Tuple[List[np.ndarray], Dict[str, float]]:
        """Perform secure aggregation of client updates"""
        try:
            if not client_updates:
                raise ValueError("No client updates provided")
            
            # Verify client signatures
            verified_updates = self._verify_client_updates(client_updates)
            
            # Perform weighted averaging
            aggregated_weights = self._weighted_average(verified_updates)
            
            # Calculate aggregation metrics
            metrics = self._calculate_aggregation_metrics(verified_updates)
            
            logger.info(f"Securely aggregated {len(verified_updates)} client updates")
            return aggregated_weights, metrics
            
        except Exception as e:
            logger.error(f"Error in secure aggregation: {e}")
            raise
    
    def _verify_client_updates(self, client_updates: List[ClientUpdate]) -> List[ClientUpdate]:
        """Verify client update signatures"""
        verified_updates = []
        
        for update in client_updates:
            # Verify signature (simplified - in production use proper PKI)
            expected_signature = self._generate_signature(update)
            if hmac.compare_digest(update.signature, expected_signature):
                verified_updates.append(update)
            else:
                logger.warning(f"Invalid signature for client {update.client_id}")
        
        return verified_updates
    
    def _generate_signature(self, update: ClientUpdate) -> str:
        """Generate signature for client update"""
        # Create message to sign
        message = f"{update.client_id}:{update.num_examples}:{update.loss}:{update.accuracy}"
        
        # Generate HMAC signature
        signature = hmac.new(
            b'federated_learning_key',  # In production, use proper key management
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        return signature
    
    def _weighted_average(self, client_updates: List[ClientUpdate]) -> List[np.ndarray]:
        """Perform weighted averaging of client model weights"""
        total_examples = sum(update.num_examples for update in client_updates)
        
        if total_examples == 0:
            raise ValueError("Total examples is zero")
        
        # Initialize aggregated weights
        aggregated_weights = None
        
        for update in client_updates:
            weight = update.num_examples / total_examples
            
            if aggregated_weights is None:
                # Initialize with first client's weights
                aggregated_weights = [w * weight for w in update.model_weights]
            else:
                # Add weighted contribution
                for i, w in enumerate(update.model_weights):
                    aggregated_weights[i] += w * weight
        
        return aggregated_weights
    
    def _calculate_aggregation_metrics(self, client_updates: List[ClientUpdate]) -> Dict[str, float]:
        """Calculate metrics for the aggregation round"""
        total_examples = sum(update.num_examples for update in client_updates)
        
        # Weighted average loss and accuracy
        weighted_loss = sum(
            update.loss * update.num_examples for update in client_updates
        ) / total_examples
        
        weighted_accuracy = sum(
            update.accuracy * update.num_examples for update in client_updates
        ) / total_examples
        
        return {
            'aggregated_loss': weighted_loss,
            'aggregated_accuracy': weighted_accuracy,
            'num_clients': len(client_updates),
            'total_examples': total_examples,
            'loss_variance': np.var([update.loss for update in client_updates]),
            'accuracy_variance': np.var([update.accuracy for update in client_updates])
        }

class FederatedLearningServer:
    """Main federated learning server implementation"""
    
    def __init__(self, model_fn, encryption_key: Optional[bytes] = None):
        self.model_fn = model_fn
        self.current_round = 0
        self.global_model = None
        self.round_history: List[FederatedRound] = []
        self.active_clients: Dict[str, datetime] = {}
        
        # Initialize secure aggregator
        if encryption_key is None:
            encryption_key = Fernet.generate_key()
        self.aggregator = SecureAggregator(encryption_key)
        
        # Initialize TFF environment
        self._initialize_tff_environment()
        
        logger.info("Federated Learning Server initialized")
    
    def _initialize_tff_environment(self):
        """Initialize TensorFlow Federated environment"""
        try:
            # Set up TFF execution context
            tff.backends.native.set_local_python_execution_context()
            
            # Create federated model
            self.federated_model = self._create_federated_model()
            
            # Create federated averaging process
            self.federated_averaging = tff.learning.algorithms.build_weighted_fed_avg(
                model_fn=self.model_fn,
                client_optimizer_fn=lambda: tf.keras.optimizers.SGD(learning_rate=0.02),
                server_optimizer_fn=lambda: tf.keras.optimizers.SGD(learning_rate=1.0)
            )
            
            # Initialize server state
            self.server_state = self.federated_averaging.initialize()
            
            logger.info("TFF environment initialized successfully")
            
        except Exception as e:
            logger.error(f"Error initializing TFF environment: {e}")
            raise
    
    def _create_federated_model(self):
        """Create federated model specification"""
        return tff.learning.models.from_keras_model(
            keras_model=self.model_fn(),
            input_spec=self._get_input_spec(),
            loss=tf.keras.losses.SparseCategoricalCrossentropy(),
            metrics=[tf.keras.metrics.SparseCategoricalAccuracy()]
        )
    
    def _get_input_spec(self):
        """Get input specification for the model"""
        # This should be customized based on your specific model
        return (
            tf.TensorSpec(shape=[None, 10], dtype=tf.float32),  # features
            tf.TensorSpec(shape=[None], dtype=tf.int32)         # labels
        )
    
    async def register_client(self, client_id: str, client_info: Dict[str, Any]) -> Dict[str, Any]:
        """Register a new client for federated learning"""
        try:
            # Validate client information
            if not self._validate_client_info(client_info):
                raise ValueError("Invalid client information")
            
            # Register client
            self.active_clients[client_id] = datetime.now()
            
            # Generate client configuration
            client_config = {
                'client_id': client_id,
                'model_config': self._get_model_config(),
                'training_config': self._get_training_config(),
                'encryption_key': base64.b64encode(self.aggregator.cipher_suite._encryption_key).decode(),
                'round_id': self.current_round
            }
            
            logger.info(f"Client {client_id} registered successfully")
            return client_config
            
        except Exception as e:
            logger.error(f"Error registering client {client_id}: {e}")
            raise
    
    def _validate_client_info(self, client_info: Dict[str, Any]) -> bool:
        """Validate client registration information"""
        required_fields = ['device_id', 'app_version', 'platform']
        return all(field in client_info for field in required_fields)
    
    def _get_model_config(self) -> Dict[str, Any]:
        """Get model configuration for clients"""
        return {
            'model_type': 'financial_analytics',
            'input_shape': [10],  # Customize based on your model
            'output_classes': 5,
            'learning_rate': 0.01,
            'batch_size': 32
        }
    
    def _get_training_config(self) -> Dict[str, Any]:
        """Get training configuration for clients"""
        return {
            'local_epochs': 3,
            'min_examples': 10,
            'max_examples': 1000,
            'privacy_budget': 1.0,
            'differential_privacy': True
        }
    
    async def start_federated_round(self, min_clients: int = 3, timeout_seconds: int = 300) -> Dict[str, Any]:
        """Start a new federated learning round"""
        try:
            logger.info(f"Starting federated round {self.current_round + 1}")
            
            # Select participating clients
            participating_clients = self._select_clients(min_clients)
            
            if len(participating_clients) < min_clients:
                raise ValueError(f"Insufficient clients: {len(participating_clients)} < {min_clients}")
            
            # Broadcast global model to clients
            await self._broadcast_global_model(participating_clients)
            
            # Wait for client updates
            client_updates = await self._collect_client_updates(
                participating_clients, 
                timeout_seconds
            )
            
            # Perform secure aggregation
            aggregated_weights, metrics = self.aggregator.secure_aggregate(client_updates)
            
            # Update global model
            self._update_global_model(aggregated_weights)
            
            # Record round results
            round_result = self._record_round_results(
                participating_clients, 
                aggregated_weights, 
                metrics
            )
            
            self.current_round += 1
            
            logger.info(f"Federated round {self.current_round} completed successfully")
            return round_result
            
        except Exception as e:
            logger.error(f"Error in federated round: {e}")
            raise
    
    def _select_clients(self, min_clients: int) -> List[str]:
        """Select clients for the current round"""
        # Remove inactive clients
        current_time = datetime.now()
        active_threshold = timedelta(hours=24)
        
        active_clients = [
            client_id for client_id, last_seen in self.active_clients.items()
            if current_time - last_seen < active_threshold
        ]
        
        # Select subset of clients (can implement more sophisticated selection)
        selected_clients = active_clients[:min(len(active_clients), min_clients * 2)]
        
        return selected_clients
    
    async def _broadcast_global_model(self, client_ids: List[str]):
        """Broadcast current global model to selected clients"""
        try:
            if self.global_model is None:
                # Initialize global model
                self.global_model = self.model_fn()
            
            # Get model weights
            model_weights = self.global_model.get_weights()
            
            # Encrypt weights
            encrypted_weights = self.aggregator.encrypt_weights(model_weights)
            
            # Broadcast to clients (implementation depends on communication protocol)
            for client_id in client_ids:
                await self._send_to_client(client_id, {
                    'type': 'global_model_update',
                    'round_id': self.current_round + 1,
                    'encrypted_weights': base64.b64encode(encrypted_weights).decode(),
                    'timestamp': datetime.now().isoformat()
                })
            
            logger.info(f"Global model broadcasted to {len(client_ids)} clients")
            
        except Exception as e:
            logger.error(f"Error broadcasting global model: {e}")
            raise
    
    async def _send_to_client(self, client_id: str, message: Dict[str, Any]):
        """Send message to specific client (placeholder implementation)"""
        # This would be implemented based on your communication protocol
        # (WebSocket, HTTP, message queue, etc.)
        logger.debug(f"Sending message to client {client_id}: {message['type']}")
    
    async def _collect_client_updates(self, client_ids: List[str], timeout_seconds: int) -> List[ClientUpdate]:
        """Collect model updates from participating clients"""
        client_updates = []
        
        # Wait for client updates (simplified implementation)
        # In production, this would use proper async communication
        await asyncio.sleep(timeout_seconds / 10)  # Simulate waiting
        
        # Simulate receiving client updates
        for client_id in client_ids:
            # This would be replaced with actual client communication
            update = self._simulate_client_update(client_id)
            client_updates.append(update)
        
        logger.info(f"Collected {len(client_updates)} client updates")
        return client_updates
    
    def _simulate_client_update(self, client_id: str) -> ClientUpdate:
        """Simulate a client update (for testing purposes)"""
        # Generate random weights (in production, these come from actual clients)
        if self.global_model is None:
            self.global_model = self.model_fn()
        
        model_weights = self.global_model.get_weights()
        
        # Add some noise to simulate training
        noisy_weights = []
        for weight in model_weights:
            noise = np.random.normal(0, 0.01, weight.shape)
            noisy_weights.append(weight + noise)
        
        # Generate signature
        update = ClientUpdate(
            client_id=client_id,
            model_weights=noisy_weights,
            num_examples=np.random.randint(50, 200),
            loss=np.random.uniform(0.1, 0.5),
            accuracy=np.random.uniform(0.7, 0.95),
            timestamp=datetime.now(),
            signature=""  # Will be set below
        )
        
        update.signature = self.aggregator._generate_signature(update)
        return update
    
    def _update_global_model(self, aggregated_weights: List[np.ndarray]):
        """Update the global model with aggregated weights"""
        try:
            if self.global_model is None:
                self.global_model = self.model_fn()
            
            self.global_model.set_weights(aggregated_weights)
            logger.info("Global model updated successfully")
            
        except Exception as e:
            logger.error(f"Error updating global model: {e}")
            raise
    
    def _record_round_results(self, participating_clients: List[str], 
                            aggregated_weights: List[np.ndarray], 
                            metrics: Dict[str, float]) -> Dict[str, Any]:
        """Record the results of the federated round"""
        round_result = FederatedRound(
            round_id=self.current_round + 1,
            participating_clients=participating_clients,
            global_model_weights=aggregated_weights,
            aggregated_loss=metrics['aggregated_loss'],
            aggregated_accuracy=metrics['aggregated_accuracy'],
            convergence_metrics=metrics,
            timestamp=datetime.now()
        )
        
        self.round_history.append(round_result)
        
        return {
            'round_id': round_result.round_id,
            'num_clients': len(participating_clients),
            'aggregated_loss': round_result.aggregated_loss,
            'aggregated_accuracy': round_result.aggregated_accuracy,
            'convergence_metrics': round_result.convergence_metrics,
            'timestamp': round_result.timestamp.isoformat()
        }
    
    def get_server_status(self) -> Dict[str, Any]:
        """Get current server status"""
        return {
            'current_round': self.current_round,
            'active_clients': len(self.active_clients),
            'total_rounds': len(self.round_history),
            'last_round_accuracy': self.round_history[-1].aggregated_accuracy if self.round_history else None,
            'server_uptime': datetime.now().isoformat()
        }
    
    def save_model(self, filepath: str):
        """Save the current global model"""
        if self.global_model is not None:
            self.global_model.save(filepath)
            logger.info(f"Global model saved to {filepath}")
        else:
            logger.warning("No global model to save")
    
    def load_model(self, filepath: str):
        """Load a saved global model"""
        try:
            self.global_model = tf.keras.models.load_model(filepath)
            logger.info(f"Global model loaded from {filepath}")
        except Exception as e:
            logger.error(f"Error loading model from {filepath}: {e}")
            raise

# Example model function for financial analytics
def create_financial_model():
    """Create a simple financial analytics model"""
    model = tf.keras.Sequential([
        tf.keras.layers.Dense(64, activation='relu', input_shape=(10,)),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(32, activation='relu'),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(5, activation='softmax')  # 5 financial categories
    ])
    
    model.compile(
        optimizer='adam',
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy']
    )
    
    return model

# Example usage
if __name__ == "__main__":
    # Initialize federated learning server
    fl_server = FederatedLearningServer(create_financial_model)
    
    # Example of running federated learning
    async def run_federated_learning():
        try:
            # Register some clients
            for i in range(5):
                client_info = {
                    'device_id': f'device_{i}',
                    'app_version': '1.0.0',
                    'platform': 'mobile'
                }
                await fl_server.register_client(f'client_{i}', client_info)
            
            # Run federated rounds
            for round_num in range(3):
                result = await fl_server.start_federated_round(min_clients=3)
                print(f"Round {result['round_id']} completed:")
                print(f"  Accuracy: {result['aggregated_accuracy']:.4f}")
                print(f"  Loss: {result['aggregated_loss']:.4f}")
                print(f"  Clients: {result['num_clients']}")
            
            # Save final model
            fl_server.save_model('federated_financial_model.h5')
            
        except Exception as e:
            logger.error(f"Error in federated learning: {e}")
    
    # Run the example
    asyncio.run(run_federated_learning())