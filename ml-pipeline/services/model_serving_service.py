"""
Model Serving Infrastructure Service
Handles ML model deployment, serving, and management
"""

import asyncio
import logging
import json
import os
import time
from typing import Dict, List, Optional, Any, Union
from datetime import datetime, timedelta
from enum import Enum
import aiohttp
import numpy as np
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)

class ModelStatus(Enum):
    """Model deployment status"""
    LOADING = "loading"
    READY = "ready"
    ERROR = "error"
    UPDATING = "updating"
    RETIRED = "retired"

class ModelType(Enum):
    """Supported model types"""
    TENSORFLOW = "tensorflow"
    PYTORCH = "pytorch"
    SKLEARN = "sklearn"
    ONNX = "onnx"
    CUSTOM = "custom"

class ServingFramework(Enum):
    """Model serving frameworks"""
    TENSORFLOW_SERVING = "tensorflow_serving"
    TORCHSERVE = "torchserve"
    SELDON_CORE = "seldon_core"
    MLFLOW = "mlflow"
    CUSTOM_API = "custom_api"

@dataclass
class ModelMetadata:
    """Model metadata and configuration"""
    model_id: str
    name: str
    version: str
    model_type: ModelType
    framework: ServingFramework
    input_schema: Dict
    output_schema: Dict
    model_path: str
    config: Dict
    created_at: datetime
    updated_at: datetime
    status: ModelStatus = ModelStatus.LOADING
    
@dataclass
class PredictionRequest:
    """Prediction request structure"""
    model_id: str
    inputs: Dict[str, Any]
    request_id: Optional[str] = None
    timeout: Optional[float] = 30.0
    metadata: Optional[Dict] = None

@dataclass
class PredictionResponse:
    """Prediction response structure"""
    model_id: str
    predictions: Dict[str, Any]
    request_id: Optional[str] = None
    latency_ms: float = 0.0
    model_version: Optional[str] = None
    confidence: Optional[float] = None
    metadata: Optional[Dict] = None

class ModelServingService:
    """
    Service for ML model serving infrastructure
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._get_default_config()
        self.models: Dict[str, ModelMetadata] = {}
        self.serving_endpoints: Dict[str, str] = {}
        self.load_balancer = ModelLoadBalancer(self.config.get('load_balancer', {}))
        self.model_registry = ModelRegistry(self.config.get('registry', {}))
        self.is_initialized = False
        
    def _get_default_config(self) -> Dict:
        """Get default service configuration"""
        return {
            'serving_config': {
                'tensorflow_serving': {
                    'host': 'localhost',
                    'port': 8501,
                    'model_base_path': '/models',
                    'enable_batching': True,
                    'max_batch_size': 32,
                    'batch_timeout_micros': 50000
                },
                'seldon_core': {
                    'namespace': 'seldon-system',
                    'protocol': 'http',
                    'enable_explainer': True,
                    'enable_outlier_detection': False
                },
                'custom_api': {
                    'host': 'localhost',
                    'port': 8080,
                    'workers': 4,
                    'timeout': 30
                }
            },
            'load_balancer': {
                'strategy': 'round_robin',  # round_robin, least_connections, weighted
                'health_check_interval': 30,
                'max_retries': 3,
                'circuit_breaker_threshold': 5
            },
            'registry': {
                'backend': 'local',  # local, s3, gcs, azure
                'model_store_path': './model_store',
                'metadata_store': 'sqlite:///models.db'
            },
            'monitoring': {
                'enable_metrics': True,
                'metrics_port': 9090,
                'log_predictions': True,
                'performance_tracking': True
            },
            'auto_scaling': {
                'enable': True,
                'min_replicas': 1,
                'max_replicas': 10,
                'target_cpu_utilization': 70,
                'scale_up_threshold': 80,
                'scale_down_threshold': 30
            }
        }
    
    async def initialize(self) -> bool:
        """Initialize the model serving service"""
        try:
            # Initialize model registry
            await self.model_registry.initialize()
            
            # Initialize load balancer
            await self.load_balancer.initialize()
            
            # Load existing models
            await self._load_existing_models()
            
            # Start health monitoring
            asyncio.create_task(self._start_health_monitoring())
            
            # Start metrics collection
            if self.config['monitoring']['enable_metrics']:
                asyncio.create_task(self._start_metrics_collection())
            
            self.is_initialized = True
            logger.info("Model serving service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Model serving service initialization error: {str(e)}")
            return False
    
    async def deploy_model(self, model_metadata: ModelMetadata,
                          framework: Optional[ServingFramework] = None) -> Dict:
        """
        Deploy a model to serving infrastructure
        
        Args:
            model_metadata: Model metadata and configuration
            framework: Optional serving framework override
            
        Returns:
            Deployment result with endpoint information
        """
        try:
            if not self.is_initialized:
                raise ValueError("Service not initialized")
            
            model_id = model_metadata.model_id
            serving_framework = framework or model_metadata.framework
            
            logger.info(f"Deploying model {model_id} with {serving_framework.value}")
            
            # Validate model
            validation_result = await self._validate_model(model_metadata)
            if not validation_result['valid']:
                return {
                    'success': False,
                    'error': f"Model validation failed: {validation_result['error']}"
                }
            
            # Deploy based on framework
            if serving_framework == ServingFramework.TENSORFLOW_SERVING:
                deployment_result = await self._deploy_tensorflow_serving(model_metadata)
            elif serving_framework == ServingFramework.SELDON_CORE:
                deployment_result = await self._deploy_seldon_core(model_metadata)
            elif serving_framework == ServingFramework.CUSTOM_API:
                deployment_result = await self._deploy_custom_api(model_metadata)
            else:
                return {
                    'success': False,
                    'error': f"Unsupported serving framework: {serving_framework.value}"
                }
            
            if deployment_result['success']:
                # Register model
                model_metadata.status = ModelStatus.READY
                model_metadata.updated_at = datetime.now()
                self.models[model_id] = model_metadata
                
                # Register endpoint
                self.serving_endpoints[model_id] = deployment_result['endpoint']
                
                # Add to load balancer
                await self.load_balancer.add_endpoint(
                    model_id, deployment_result['endpoint']
                )
                
                # Store in registry
                await self.model_registry.register_model(model_metadata)
                
                logger.info(f"Model {model_id} deployed successfully")
                
                return {
                    'success': True,
                    'model_id': model_id,
                    'endpoint': deployment_result['endpoint'],
                    'status': model_metadata.status.value,
                    'deployment_time': datetime.now().isoformat()
                }
            else:
                return deployment_result
                
        except Exception as e:
            logger.error(f"Model deployment error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def predict(self, request: PredictionRequest) -> PredictionResponse:
        """
        Make prediction using deployed model
        
        Args:
            request: Prediction request
            
        Returns:
            Prediction response
        """
        try:
            start_time = time.time()
            
            model_id = request.model_id
            
            # Check if model exists and is ready
            if model_id not in self.models:
                raise ValueError(f"Model {model_id} not found")
            
            model = self.models[model_id]
            if model.status != ModelStatus.READY:
                raise ValueError(f"Model {model_id} not ready (status: {model.status.value})")
            
            # Get endpoint from load balancer
            endpoint = await self.load_balancer.get_endpoint(model_id)
            if not endpoint:
                raise ValueError(f"No available endpoint for model {model_id}")
            
            # Validate input
            validation_result = self._validate_input(request.inputs, model.input_schema)
            if not validation_result['valid']:
                raise ValueError(f"Invalid input: {validation_result['error']}")
            
            # Make prediction
            prediction_result = await self._make_prediction(endpoint, request, model)
            
            # Calculate latency
            latency_ms = (time.time() - start_time) * 1000
            
            # Create response
            response = PredictionResponse(
                model_id=model_id,
                predictions=prediction_result['predictions'],
                request_id=request.request_id,
                latency_ms=latency_ms,
                model_version=model.version,
                confidence=prediction_result.get('confidence'),
                metadata=prediction_result.get('metadata')
            )
            
            # Log prediction if enabled
            if self.config['monitoring']['log_predictions']:
                await self._log_prediction(request, response)
            
            return response
            
        except Exception as e:
            logger.error(f"Prediction error: {str(e)}")
            # Return error response
            return PredictionResponse(
                model_id=request.model_id,
                predictions={'error': str(e)},
                request_id=request.request_id,
                latency_ms=(time.time() - start_time) * 1000 if 'start_time' in locals() else 0
            )
    
    async def batch_predict(self, requests: List[PredictionRequest]) -> List[PredictionResponse]:
        """
        Make batch predictions
        
        Args:
            requests: List of prediction requests
            
        Returns:
            List of prediction responses
        """
        try:
            # Group requests by model
            model_requests = {}
            for req in requests:
                if req.model_id not in model_requests:
                    model_requests[req.model_id] = []
                model_requests[req.model_id].append(req)
            
            # Process each model's requests
            all_responses = []
            for model_id, model_reqs in model_requests.items():
                if model_id in self.models and self.models[model_id].status == ModelStatus.READY:
                    # Use batch prediction if supported
                    batch_responses = await self._batch_predict_model(model_id, model_reqs)
                    all_responses.extend(batch_responses)
                else:
                    # Individual predictions for unsupported batch models
                    for req in model_reqs:
                        response = await self.predict(req)
                        all_responses.append(response)
            
            return all_responses
            
        except Exception as e:
            logger.error(f"Batch prediction error: {str(e)}")
            return [
                PredictionResponse(
                    model_id=req.model_id,
                    predictions={'error': str(e)},
                    request_id=req.request_id
                )
                for req in requests
            ]  
  
    async def _deploy_tensorflow_serving(self, model_metadata: ModelMetadata) -> Dict:
        """Deploy model using TensorFlow Serving"""
        try:
            tf_config = self.config['serving_config']['tensorflow_serving']
            
            # Prepare model for TensorFlow Serving
            model_path = await self._prepare_tensorflow_model(model_metadata)
            
            # Create serving configuration
            serving_config = {
                'model_config_list': {
                    'config': [{
                        'name': model_metadata.name,
                        'base_path': model_path,
                        'model_platform': 'tensorflow',
                        'model_version_policy': {'latest': {'num_versions': 1}}
                    }]
                }
            }
            
            # Deploy to TensorFlow Serving
            endpoint = f"http://{tf_config['host']}:{tf_config['port']}/v1/models/{model_metadata.name}"
            
            # Verify deployment
            health_check = await self._check_tensorflow_serving_health(endpoint)
            if not health_check:
                return {
                    'success': False,
                    'error': 'TensorFlow Serving health check failed'
                }
            
            return {
                'success': True,
                'endpoint': endpoint,
                'framework': 'tensorflow_serving',
                'config': serving_config
            }
            
        except Exception as e:
            logger.error(f"TensorFlow Serving deployment error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _deploy_seldon_core(self, model_metadata: ModelMetadata) -> Dict:
        """Deploy model using Seldon Core"""
        try:
            seldon_config = self.config['serving_config']['seldon_core']
            
            # Create Seldon deployment manifest
            deployment_manifest = {
                'apiVersion': 'machinelearning.seldon.io/v1',
                'kind': 'SeldonDeployment',
                'metadata': {
                    'name': f"{model_metadata.name}-{model_metadata.version}",
                    'namespace': seldon_config['namespace']
                },
                'spec': {
                    'name': model_metadata.name,
                    'predictors': [{
                        'name': 'default',
                        'replicas': 1,
                        'graph': {
                            'name': 'classifier',
                            'implementation': 'SKLEARN_SERVER',
                            'modelUri': model_metadata.model_path,
                            'parameters': [
                                {'name': 'method', 'value': 'predict_proba', 'type': 'STRING'}
                            ]
                        }
                    }]
                }
            }
            
            # Apply deployment (simulated - would use Kubernetes API in real implementation)
            endpoint = f"http://{model_metadata.name}-{model_metadata.version}.{seldon_config['namespace']}.svc.cluster.local/api/v1.0/predictions"
            
            return {
                'success': True,
                'endpoint': endpoint,
                'framework': 'seldon_core',
                'manifest': deployment_manifest
            }
            
        except Exception as e:
            logger.error(f"Seldon Core deployment error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _deploy_custom_api(self, model_metadata: ModelMetadata) -> Dict:
        """Deploy model using custom API server"""
        try:
            api_config = self.config['serving_config']['custom_api']
            
            # Create custom API server configuration
            server_config = {
                'model_id': model_metadata.model_id,
                'model_path': model_metadata.model_path,
                'model_type': model_metadata.model_type.value,
                'input_schema': model_metadata.input_schema,
                'output_schema': model_metadata.output_schema,
                'config': model_metadata.config
            }
            
            # Start custom API server (simulated)
            endpoint = f"http://{api_config['host']}:{api_config['port']}/predict/{model_metadata.model_id}"
            
            return {
                'success': True,
                'endpoint': endpoint,
                'framework': 'custom_api',
                'config': server_config
            }
            
        except Exception as e:
            logger.error(f"Custom API deployment error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _validate_model(self, model_metadata: ModelMetadata) -> Dict:
        """Validate model before deployment"""
        try:
            # Check if model file exists
            if not os.path.exists(model_metadata.model_path):
                return {
                    'valid': False,
                    'error': f"Model file not found: {model_metadata.model_path}"
                }
            
            # Validate input/output schemas
            if not model_metadata.input_schema:
                return {
                    'valid': False,
                    'error': "Input schema is required"
                }
            
            if not model_metadata.output_schema:
                return {
                    'valid': False,
                    'error': "Output schema is required"
                }
            
            # Model type specific validation
            if model_metadata.model_type == ModelType.TENSORFLOW:
                validation_result = await self._validate_tensorflow_model(model_metadata)
            elif model_metadata.model_type == ModelType.SKLEARN:
                validation_result = await self._validate_sklearn_model(model_metadata)
            else:
                validation_result = {'valid': True}  # Basic validation for other types
            
            return validation_result
            
        except Exception as e:
            return {
                'valid': False,
                'error': str(e)
            }
    
    def _validate_input(self, inputs: Dict, schema: Dict) -> Dict:
        """Validate prediction input against schema"""
        try:
            # Basic schema validation
            required_fields = schema.get('required', [])
            for field in required_fields:
                if field not in inputs:
                    return {
                        'valid': False,
                        'error': f"Required field missing: {field}"
                    }
            
            # Type validation
            properties = schema.get('properties', {})
            for field, value in inputs.items():
                if field in properties:
                    expected_type = properties[field].get('type')
                    if expected_type and not self._check_type(value, expected_type):
                        return {
                            'valid': False,
                            'error': f"Invalid type for field {field}: expected {expected_type}"
                        }
            
            return {'valid': True}
            
        except Exception as e:
            return {
                'valid': False,
                'error': str(e)
            }
    
    def _check_type(self, value: Any, expected_type: str) -> bool:
        """Check if value matches expected type"""
        type_mapping = {
            'string': str,
            'number': (int, float),
            'integer': int,
            'boolean': bool,
            'array': list,
            'object': dict
        }
        
        expected_python_type = type_mapping.get(expected_type)
        if expected_python_type:
            return isinstance(value, expected_python_type)
        
        return True  # Unknown type, assume valid
    
    async def _make_prediction(self, endpoint: str, request: PredictionRequest, 
                             model: ModelMetadata) -> Dict:
        """Make prediction call to serving endpoint"""
        try:
            # Prepare request payload
            payload = {
                'inputs': request.inputs,
                'metadata': request.metadata or {}
            }
            
            # Make HTTP request to serving endpoint
            timeout = aiohttp.ClientTimeout(total=request.timeout)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(endpoint, json=payload) as response:
                    if response.status == 200:
                        result = await response.json()
                        return {
                            'predictions': result.get('predictions', result),
                            'confidence': result.get('confidence'),
                            'metadata': result.get('metadata')
                        }
                    else:
                        error_text = await response.text()
                        raise Exception(f"Prediction failed: {response.status} - {error_text}")
                        
        except Exception as e:
            logger.error(f"Prediction call error: {str(e)}")
            raise
    
    async def get_model_status(self, model_id: str) -> Dict:
        """Get model deployment status"""
        try:
            if model_id not in self.models:
                return {
                    'success': False,
                    'error': 'Model not found'
                }
            
            model = self.models[model_id]
            endpoint = self.serving_endpoints.get(model_id)
            
            # Check endpoint health
            health_status = 'unknown'
            if endpoint:
                health_status = await self._check_endpoint_health(endpoint)
            
            return {
                'success': True,
                'model_id': model_id,
                'status': model.status.value,
                'endpoint': endpoint,
                'health': health_status,
                'version': model.version,
                'framework': model.framework.value,
                'created_at': model.created_at.isoformat(),
                'updated_at': model.updated_at.isoformat()
            }
            
        except Exception as e:
            logger.error(f"Get model status error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def list_models(self) -> Dict:
        """List all deployed models"""
        try:
            models_info = []
            
            for model_id, model in self.models.items():
                endpoint = self.serving_endpoints.get(model_id)
                health_status = 'unknown'
                
                if endpoint:
                    health_status = await self._check_endpoint_health(endpoint)
                
                models_info.append({
                    'model_id': model_id,
                    'name': model.name,
                    'version': model.version,
                    'status': model.status.value,
                    'framework': model.framework.value,
                    'endpoint': endpoint,
                    'health': health_status,
                    'created_at': model.created_at.isoformat()
                })
            
            return {
                'success': True,
                'models': models_info,
                'total_models': len(models_info)
            }
            
        except Exception as e:
            logger.error(f"List models error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def undeploy_model(self, model_id: str) -> Dict:
        """Undeploy a model from serving infrastructure"""
        try:
            if model_id not in self.models:
                return {
                    'success': False,
                    'error': 'Model not found'
                }
            
            model = self.models[model_id]
            
            # Remove from load balancer
            await self.load_balancer.remove_endpoint(model_id)
            
            # Update model status
            model.status = ModelStatus.RETIRED
            model.updated_at = datetime.now()
            
            # Remove from active models
            endpoint = self.serving_endpoints.pop(model_id, None)
            
            # Update registry
            await self.model_registry.update_model_status(model_id, ModelStatus.RETIRED)
            
            logger.info(f"Model {model_id} undeployed successfully")
            
            return {
                'success': True,
                'model_id': model_id,
                'status': 'retired',
                'undeployed_at': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Model undeploy error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _check_endpoint_health(self, endpoint: str) -> str:
        """Check health of serving endpoint"""
        try:
            # Add health check path
            health_endpoint = f"{endpoint}/health" if not endpoint.endswith('/health') else endpoint
            
            timeout = aiohttp.ClientTimeout(total=5)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(health_endpoint) as response:
                    if response.status == 200:
                        return 'healthy'
                    else:
                        return 'unhealthy'
                        
        except Exception:
            return 'unhealthy'
    
    async def cleanup(self) -> None:
        """Cleanup service resources"""
        try:
            # Stop all models
            for model_id in list(self.models.keys()):
                await self.undeploy_model(model_id)
            
            # Cleanup load balancer
            if self.load_balancer:
                await self.load_balancer.cleanup()
            
            # Cleanup registry
            if self.model_registry:
                await self.model_registry.cleanup()
            
            logger.info("Model serving service cleaned up")
            
        except Exception as e:
            logger.error(f"Cleanup error: {str(e)}")


class ModelLoadBalancer:
    """Load balancer for model serving endpoints"""
    
    def __init__(self, config: Dict):
        self.config = config
        self.endpoints: Dict[str, List[str]] = {}
        self.health_status: Dict[str, bool] = {}
        self.request_counts: Dict[str, int] = {}
        
    async def initialize(self) -> None:
        """Initialize load balancer"""
        # Start health checking
        if self.config.get('health_check_interval', 0) > 0:
            asyncio.create_task(self._health_check_loop())
    
    async def add_endpoint(self, model_id: str, endpoint: str) -> None:
        """Add endpoint to load balancer"""
        if model_id not in self.endpoints:
            self.endpoints[model_id] = []
        
        if endpoint not in self.endpoints[model_id]:
            self.endpoints[model_id].append(endpoint)
            self.health_status[endpoint] = True
            self.request_counts[endpoint] = 0
    
    async def remove_endpoint(self, model_id: str) -> None:
        """Remove all endpoints for a model"""
        if model_id in self.endpoints:
            for endpoint in self.endpoints[model_id]:
                self.health_status.pop(endpoint, None)
                self.request_counts.pop(endpoint, None)
            del self.endpoints[model_id]
    
    async def get_endpoint(self, model_id: str) -> Optional[str]:
        """Get best endpoint for model using load balancing strategy"""
        if model_id not in self.endpoints:
            return None
        
        available_endpoints = [
            ep for ep in self.endpoints[model_id] 
            if self.health_status.get(ep, False)
        ]
        
        if not available_endpoints:
            return None
        
        strategy = self.config.get('strategy', 'round_robin')
        
        if strategy == 'round_robin':
            return self._round_robin_selection(available_endpoints)
        elif strategy == 'least_connections':
            return self._least_connections_selection(available_endpoints)
        else:
            return available_endpoints[0]  # Default to first available
    
    def _round_robin_selection(self, endpoints: List[str]) -> str:
        """Round robin endpoint selection"""
        # Simple round robin based on request counts
        min_requests = min(self.request_counts.get(ep, 0) for ep in endpoints)
        selected_endpoints = [ep for ep in endpoints if self.request_counts.get(ep, 0) == min_requests]
        
        selected = selected_endpoints[0]
        self.request_counts[selected] = self.request_counts.get(selected, 0) + 1
        return selected
    
    def _least_connections_selection(self, endpoints: List[str]) -> str:
        """Least connections endpoint selection"""
        return min(endpoints, key=lambda ep: self.request_counts.get(ep, 0))
    
    async def cleanup(self) -> None:
        """Cleanup load balancer"""
        self.endpoints.clear()
        self.health_status.clear()
        self.request_counts.clear()


class ModelRegistry:
    """Model registry for metadata management"""
    
    def __init__(self, config: Dict):
        self.config = config
        self.models: Dict[str, ModelMetadata] = {}
        
    async def initialize(self) -> None:
        """Initialize model registry"""
        # Load existing models from storage
        await self._load_models_from_storage()
    
    async def register_model(self, model: ModelMetadata) -> None:
        """Register model in registry"""
        self.models[model.model_id] = model
        await self._save_model_to_storage(model)
    
    async def get_model(self, model_id: str) -> Optional[ModelMetadata]:
        """Get model metadata"""
        return self.models.get(model_id)
    
    async def update_model_status(self, model_id: str, status: ModelStatus) -> None:
        """Update model status"""
        if model_id in self.models:
            self.models[model_id].status = status
            self.models[model_id].updated_at = datetime.now()
            await self._save_model_to_storage(self.models[model_id])
    
    async def _load_models_from_storage(self) -> None:
        """Load models from persistent storage"""
        # Simulated - would load from actual storage
        pass
    
    async def _save_model_to_storage(self, model: ModelMetadata) -> None:
        """Save model to persistent storage"""
        # Simulated - would save to actual storage
        pass
    
    async def cleanup(self) -> None:
        """Cleanup registry"""
        self.models.clear()