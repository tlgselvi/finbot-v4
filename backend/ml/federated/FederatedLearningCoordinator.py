"""
Federated Learning Coordinator
Manages federated learning infrastructure and client coordination
"""

import asyncio
import logging
import json
import hashlib
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import numpy as np
import tensorflow as tf
import tensorflow_federated as tff
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64
import os

from .models.FederatedModels import create_federated_model
from .aggregation.SecureAggregation import SecureAggregationProtocol
from .privacy.DifferentialPrivacy import DifferentialPrivacyManager
from ..storage.ModelStorage import ModelStorage
from ..monitoring.FederatedMetrics import FederatedMetricsCollector

logger = logging.getLogger(__name__)

class FederatedLearningCoordinator:
    """
    Coordinates federated learning across multiple clients with privacy preservation
    """
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.model_storage = ModelStorage(config.get('storage', {}))
        self.metrics_collector = FederatedMetricsCollector()
        self.dp_manager = DifferentialPrivacyManager(config.get('privacy', {}))
        self.secure_aggregation = SecureAggregationProtocol()
        
        # Federated learning parameters
        self.min_clients = config.get('min_clients', 3)
        self.max_clients = config.get('max_clients', 100)
        self.rounds_per_epoch = config.get('rounds_per_epoch', 10)
        self.client_timeout = config.get('client_timeout', 300)  # 5 minutes
        
        # Security parameters
        self.encryption_key = self._generate_encryption_key()
        self.client_registry: Dict[str, Dict] = {}
        self.active_rounds: Dict[str, Dict] = {}
        
        # Model versioning
        self.current_model_version = 0
        self.global_model = None
        
        logger.info("Federated Learning Coordinator initialized")
    
    def _generate_encryption_key(self) -> Fernet:
        """Generate encryption key for secure communication"""
        password = os.environ.get('FL_ENCRYPTION_PASSWORD', 'default_password').encode()
        salt = os.environ.get('FL_ENCRYPTION_SALT', 'default_salt').encode()
        
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(password))
        return Fernet(key)
    
    async def initialize_global_model(self, model_config: Dict[str, Any]) -> bool:
        """Initialize the global federated model"""
        try:
            # Create the federated model
            self.global_model = create_federated_model(model_config)
            
            # Initialize with random weights
            dummy_data = self._create_dummy_data(model_config)
            self.global_model.compile(
                optimizer='adam',
                loss='sparse_categorical_crossentropy',
                metrics=['accuracy']
            )
            
            # Save initial model
            await self.model_storage.save_model(
                self.global_model,
                f"global_model_v{self.current_model_version}",
                metadata={
                    'version': self.current_model_version,
                    'created_at': datetime.utcnow().isoformat(),
                    'config': model_config
                }
            )
            
            logger.info(f"Global model initialized with version {self.current_model_version}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize global model: {e}")
            return False
    
    def _create_dummy_data(self, model_config: Dict[str, Any]) -> Tuple[np.ndarray, np.ndarray]:
        """Create dummy data for model initialization"""
        input_shape = model_config.get('input_shape', (10,))
        batch_size = 1
        
        x_dummy = np.random.random((batch_size,) + input_shape)
        y_dummy = np.random.randint(0, model_config.get('num_classes', 2), (batch_size,))
        
        return x_dummy, y_dummy
    
    async def register_client(self, client_id: str, client_info: Dict[str, Any]) -> Dict[str, Any]:
        """Register a new federated learning client"""
        try:
            # Validate client information
            required_fields = ['public_key', 'capabilities', 'data_size']
            if not all(field in client_info for field in required_fields):
                raise ValueError("Missing required client information")
            
            # Generate client credentials
            client_token = self._generate_client_token(client_id)
            
            # Store client information
            self.client_registry[client_id] = {
                'info': client_info,
                'token': client_token,
                'registered_at': datetime.utcnow().isoformat(),
                'last_seen': datetime.utcnow().isoformat(),
                'status': 'active',
                'rounds_participated': 0,
                'total_contribution': 0.0
            }
            
            logger.info(f"Client {client_id} registered successfully")
            
            return {
                'client_id': client_id,
                'token': client_token,
                'model_version': self.current_model_version,
                'status': 'registered'
            }
            
        except Exception as e:
            logger.error(f"Failed to register client {client_id}: {e}")
            raise
    
    def _generate_client_token(self, client_id: str) -> str:
        """Generate secure token for client authentication"""
        timestamp = datetime.utcnow().isoformat()
        data = f"{client_id}:{timestamp}:{os.urandom(16).hex()}"
        return hashlib.sha256(data.encode()).hexdigest()
    
    async def start_federated_round(self, round_config: Dict[str, Any]) -> str:
        """Start a new federated learning round"""
        try:
            round_id = f"round_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
            
            # Select clients for this round
            selected_clients = await self._select_clients_for_round(round_config)
            
            if len(selected_clients) < self.min_clients:
                raise ValueError(f"Insufficient clients: {len(selected_clients)} < {self.min_clients}")
            
            # Prepare round configuration
            round_info = {
                'round_id': round_id,
                'model_version': self.current_model_version,
                'selected_clients': selected_clients,
                'config': round_config,
                'started_at': datetime.utcnow().isoformat(),
                'deadline': (datetime.utcnow() + timedelta(seconds=self.client_timeout)).isoformat(),
                'status': 'active',
                'client_updates': {},
                'aggregation_result': None
            }
            
            self.active_rounds[round_id] = round_info
            
            # Notify selected clients
            await self._notify_clients_for_round(round_id, selected_clients)
            
            logger.info(f"Started federated round {round_id} with {len(selected_clients)} clients")
            
            return round_id
            
        except Exception as e:
            logger.error(f"Failed to start federated round: {e}")
            raise
    
    async def _select_clients_for_round(self, round_config: Dict[str, Any]) -> List[str]:
        """Select clients for federated learning round"""
        # Get active clients
        active_clients = [
            client_id for client_id, info in self.client_registry.items()
            if info['status'] == 'active' and 
            (datetime.utcnow() - datetime.fromisoformat(info['last_seen'])).seconds < 3600
        ]
        
        # Apply selection strategy
        strategy = round_config.get('client_selection', 'random')
        max_clients = min(round_config.get('max_clients', self.max_clients), len(active_clients))
        
        if strategy == 'random':
            selected = np.random.choice(active_clients, size=min(max_clients, len(active_clients)), replace=False)
        elif strategy == 'data_size':
            # Select clients with more data
            client_scores = [(cid, self.client_registry[cid]['info']['data_size']) for cid in active_clients]
            client_scores.sort(key=lambda x: x[1], reverse=True)
            selected = [cid for cid, _ in client_scores[:max_clients]]
        else:
            selected = active_clients[:max_clients]
        
        return list(selected)
    
    async def _notify_clients_for_round(self, round_id: str, client_ids: List[str]):
        """Notify selected clients about the new round"""
        round_info = self.active_rounds[round_id]
        
        for client_id in client_ids:
            try:
                # Prepare client-specific round information
                client_round_info = {
                    'round_id': round_id,
                    'model_version': round_info['model_version'],
                    'deadline': round_info['deadline'],
                    'training_config': round_info['config'].get('training', {}),
                    'privacy_config': round_info['config'].get('privacy', {})
                }
                
                # Encrypt the information
                encrypted_info = self.encryption_key.encrypt(
                    json.dumps(client_round_info).encode()
                )
                
                # Store notification (in real implementation, this would be sent via message queue)
                await self._store_client_notification(client_id, encrypted_info)
                
            except Exception as e:
                logger.error(f"Failed to notify client {client_id}: {e}")
    
    async def _store_client_notification(self, client_id: str, encrypted_info: bytes):
        """Store client notification (placeholder for message queue)"""
        # In a real implementation, this would send the notification via
        # a message queue system like Redis, RabbitMQ, or cloud messaging
        logger.info(f"Notification stored for client {client_id}")
    
    async def receive_client_update(self, client_id: str, round_id: str, 
                                  encrypted_update: bytes) -> Dict[str, Any]:
        """Receive and process client model update"""
        try:
            # Validate client and round
            if client_id not in self.client_registry:
                raise ValueError(f"Unknown client: {client_id}")
            
            if round_id not in self.active_rounds:
                raise ValueError(f"Unknown round: {round_id}")
            
            round_info = self.active_rounds[round_id]
            if client_id not in round_info['selected_clients']:
                raise ValueError(f"Client {client_id} not selected for round {round_id}")
            
            # Decrypt the update
            decrypted_data = self.encryption_key.decrypt(encrypted_update)
            client_update = json.loads(decrypted_data.decode())
            
            # Validate update structure
            required_fields = ['model_weights', 'training_metrics', 'data_size']
            if not all(field in client_update for field in required_fields):
                raise ValueError("Invalid client update structure")
            
            # Apply differential privacy if enabled
            if self.config.get('privacy', {}).get('enable_dp', False):
                client_update = await self.dp_manager.apply_privacy(client_update)
            
            # Store the update
            round_info['client_updates'][client_id] = {
                'update': client_update,
                'received_at': datetime.utcnow().isoformat(),
                'data_size': client_update['data_size']
            }
            
            # Update client statistics
            self.client_registry[client_id]['last_seen'] = datetime.utcnow().isoformat()
            self.client_registry[client_id]['rounds_participated'] += 1
            
            logger.info(f"Received update from client {client_id} for round {round_id}")
            
            # Check if we have enough updates to proceed with aggregation
            if len(round_info['client_updates']) >= self.min_clients:
                await self._check_round_completion(round_id)
            
            return {'status': 'received', 'round_id': round_id}
            
        except Exception as e:
            logger.error(f"Failed to process client update: {e}")
            raise
    
    async def _check_round_completion(self, round_id: str):
        """Check if round is complete and trigger aggregation"""
        round_info = self.active_rounds[round_id]
        
        # Check if all selected clients have submitted or deadline passed
        all_submitted = len(round_info['client_updates']) == len(round_info['selected_clients'])
        deadline_passed = datetime.utcnow() > datetime.fromisoformat(round_info['deadline'])
        
        if all_submitted or (deadline_passed and len(round_info['client_updates']) >= self.min_clients):
            await self._aggregate_round(round_id)
    
    async def _aggregate_round(self, round_id: str):
        """Aggregate client updates using secure aggregation"""
        try:
            round_info = self.active_rounds[round_id]
            client_updates = round_info['client_updates']
            
            logger.info(f"Starting aggregation for round {round_id} with {len(client_updates)} updates")
            
            # Prepare updates for aggregation
            updates_list = []
            weights_list = []
            
            for client_id, update_info in client_updates.items():
                update = update_info['update']
                data_size = update_info['data_size']
                
                # Convert model weights to numpy arrays
                model_weights = [np.array(w) for w in update['model_weights']]
                updates_list.append(model_weights)
                weights_list.append(data_size)
            
            # Perform secure aggregation
            aggregated_weights = await self.secure_aggregation.aggregate(
                updates_list, weights_list
            )
            
            # Update global model
            self.global_model.set_weights(aggregated_weights)
            self.current_model_version += 1
            
            # Save updated global model
            await self.model_storage.save_model(
                self.global_model,
                f"global_model_v{self.current_model_version}",
                metadata={
                    'version': self.current_model_version,
                    'round_id': round_id,
                    'num_clients': len(client_updates),
                    'aggregated_at': datetime.utcnow().isoformat()
                }
            )
            
            # Update round status
            round_info['status'] = 'completed'
            round_info['aggregation_result'] = {
                'new_model_version': self.current_model_version,
                'num_clients_aggregated': len(client_updates),
                'completed_at': datetime.utcnow().isoformat()
            }
            
            # Collect metrics
            await self.metrics_collector.record_round_completion(round_id, round_info)
            
            logger.info(f"Round {round_id} aggregation completed. New model version: {self.current_model_version}")
            
        except Exception as e:
            logger.error(f"Failed to aggregate round {round_id}: {e}")
            round_info['status'] = 'failed'
            round_info['error'] = str(e)
    
    async def get_global_model(self, client_id: str) -> Dict[str, Any]:
        """Get the current global model for a client"""
        try:
            if client_id not in self.client_registry:
                raise ValueError(f"Unknown client: {client_id}")
            
            # Serialize model weights
            model_weights = [w.tolist() for w in self.global_model.get_weights()]
            
            model_info = {
                'model_version': self.current_model_version,
                'model_weights': model_weights,
                'model_config': self.global_model.get_config(),
                'updated_at': datetime.utcnow().isoformat()
            }
            
            # Encrypt model information
            encrypted_model = self.encryption_key.encrypt(
                json.dumps(model_info).encode()
            )
            
            return {
                'encrypted_model': base64.b64encode(encrypted_model).decode(),
                'model_version': self.current_model_version
            }
            
        except Exception as e:
            logger.error(f"Failed to get global model for client {client_id}: {e}")
            raise
    
    async def get_round_status(self, round_id: str) -> Dict[str, Any]:
        """Get the status of a federated learning round"""
        if round_id not in self.active_rounds:
            raise ValueError(f"Unknown round: {round_id}")
        
        round_info = self.active_rounds[round_id]
        
        return {
            'round_id': round_id,
            'status': round_info['status'],
            'selected_clients': len(round_info['selected_clients']),
            'received_updates': len(round_info['client_updates']),
            'started_at': round_info['started_at'],
            'deadline': round_info['deadline'],
            'aggregation_result': round_info.get('aggregation_result')
        }
    
    async def get_client_statistics(self, client_id: str) -> Dict[str, Any]:
        """Get statistics for a specific client"""
        if client_id not in self.client_registry:
            raise ValueError(f"Unknown client: {client_id}")
        
        client_info = self.client_registry[client_id]
        
        return {
            'client_id': client_id,
            'status': client_info['status'],
            'registered_at': client_info['registered_at'],
            'last_seen': client_info['last_seen'],
            'rounds_participated': client_info['rounds_participated'],
            'total_contribution': client_info['total_contribution']
        }
    
    async def shutdown(self):
        """Shutdown the federated learning coordinator"""
        logger.info("Shutting down Federated Learning Coordinator")
        
        # Complete any active rounds
        for round_id in list(self.active_rounds.keys()):
            round_info = self.active_rounds[round_id]
            if round_info['status'] == 'active':
                round_info['status'] = 'cancelled'
        
        # Save final model state
        if self.global_model is not None:
            await self.model_storage.save_model(
                self.global_model,
                f"global_model_final_v{self.current_model_version}",
                metadata={
                    'version': self.current_model_version,
                    'shutdown_at': datetime.utcnow().isoformat(),
                    'final_model': True
                }
            )
        
        logger.info("Federated Learning Coordinator shutdown completed")