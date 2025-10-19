"""
Real-time Prediction Service
High-performance ML model inference with caching and optimization
"""

import asyncio
import logging
import json
import time
import hashlib
from typing import Dict, List, Optional, Any, Union, Tuple
from datetime import datetime, timedelta
from enum import Enum
from dataclasses import dataclass, asdict
import numpy as np
from collections import defaultdict, OrderedDict
import threading
import concurrent.futures
from functools import lru_cache
import pickle
# Redis imports (optional)
try:
    import aioredis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    aioredis = None

logger = logging.getLogger(__name__)

class PredictionType(Enum):
    """Types of predictions supported"""
    SPENDING_FORECAST = "spending_forecast"
    ANOMALY_DETECTION = "anomaly_detection"
    RISK_ASSESSMENT = "risk_assessment"
    BUDGET_OPTIMIZATION = "budget_optimization"
    GOAL_PREDICTION = "goal_prediction"

class ModelVersion(Enum):
    """Model version types"""
    LATEST = "latest"
    STABLE = "stable"
    CANARY = "canary"
    SPECIFIC = "specific"

@dataclass
class PredictionRequest:
    """Prediction request structure"""
    request_id: str
    user_id: str
    prediction_type: PredictionType
    features: Dict[str, Any]
    model_version: Optional[str] = None
    cache_ttl: Optional[int] = 300  # 5 minutes default
    priority: str = "normal"  # normal, high, critical
    metadata: Optional[Dict] = None
    timestamp: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()

@dataclass
class PredictionResponse:
    """Prediction response structure"""
    request_id: str
    user_id: str
    prediction_type: PredictionType
    predictions: Dict[str, Any]
    confidence_scores: Dict[str, float]
    model_info: Dict[str, str]
    processing_time_ms: float
    cached: bool = False
    timestamp: datetime = None
    expires_at: Optional[datetime] = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()

@dataclass
class BatchPredictionRequest:
    """Batch prediction request structure"""
    batch_id: str
    requests: List[PredictionRequest]
    callback_url: Optional[str] = None
    priority: str = "normal"
    max_parallel: int = 10
    timeout_seconds: int = 300
    created_at: datetime = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now()

class PredictionCache:
    """High-performance prediction caching system"""
    
    def __init__(self, redis_url: str = "redis://localhost:6379", 
                 max_memory_cache: int = 1000):
        self.redis_url = redis_url
        self.redis_client = None
        self.memory_cache = OrderedDict()
        self.max_memory_cache = max_memory_cache
        self.cache_stats = {
            'hits': 0,
            'misses': 0,
            'memory_hits': 0,
            'redis_hits': 0
        }
        self._lock = threading.RLock()
    
    async def initialize(self):
        """Initialize cache connections"""
        try:
            if REDIS_AVAILABLE:
                self.redis_client = await aioredis.from_url(self.redis_url)
                logger.info("Prediction cache initialized with Redis")
            else:
                logger.info("Redis not available, using memory cache only")
        except Exception as e:
            logger.warning(f"Redis connection failed, using memory cache only: {str(e)}")
    
    def _generate_cache_key(self, request: PredictionRequest) -> str:
        """Generate cache key for prediction request"""
        # Create deterministic hash from request features
        features_str = json.dumps(request.features, sort_keys=True)
        key_data = f"{request.user_id}:{request.prediction_type.value}:{features_str}:{request.model_version}"
        return hashlib.md5(key_data.encode()).hexdigest()
    
    async def get(self, request: PredictionRequest) -> Optional[PredictionResponse]:
        """Get cached prediction"""
        cache_key = self._generate_cache_key(request)
        
        # Check memory cache first
        with self._lock:
            if cache_key in self.memory_cache:
                response = self.memory_cache[cache_key]
                # Move to end (LRU)
                self.memory_cache.move_to_end(cache_key)
                
                # Check if not expired
                if response.expires_at and response.expires_at > datetime.now():
                    self.cache_stats['hits'] += 1
                    self.cache_stats['memory_hits'] += 1
                    response.cached = True
                    return response
                else:
                    # Remove expired entry
                    del self.memory_cache[cache_key]
        
        # Check Redis cache
        if self.redis_client:
            try:
                cached_data = await self.redis_client.get(f"prediction:{cache_key}")
                if cached_data:
                    response_dict = json.loads(cached_data)
                    response = PredictionResponse(**response_dict)
                    
                    # Check if not expired
                    if response.expires_at and datetime.fromisoformat(response.expires_at) > datetime.now():
                        # Add to memory cache
                        with self._lock:
                            self.memory_cache[cache_key] = response
                            if len(self.memory_cache) > self.max_memory_cache:
                                self.memory_cache.popitem(last=False)
                        
                        self.cache_stats['hits'] += 1
                        self.cache_stats['redis_hits'] += 1
                        response.cached = True
                        return response
            except Exception as e:
                logger.error(f"Redis cache get error: {str(e)}")
        
        self.cache_stats['misses'] += 1
        return None
    
    async def set(self, request: PredictionRequest, response: PredictionResponse):
        """Cache prediction response"""
        cache_key = self._generate_cache_key(request)
        
        # Set expiration
        if request.cache_ttl:
            response.expires_at = datetime.now() + timedelta(seconds=request.cache_ttl)
        
        # Add to memory cache
        with self._lock:
            self.memory_cache[cache_key] = response
            if len(self.memory_cache) > self.max_memory_cache:
                self.memory_cache.popitem(last=False)
        
        # Add to Redis cache
        if self.redis_client and request.cache_ttl:
            try:
                response_dict = asdict(response)
                response_dict['timestamp'] = response.timestamp.isoformat()
                if response.expires_at:
                    response_dict['expires_at'] = response.expires_at.isoformat()
                
                await self.redis_client.setex(
                    f"prediction:{cache_key}",
                    request.cache_ttl,
                    json.dumps(response_dict, default=str)
                )
            except Exception as e:
                logger.error(f"Redis cache set error: {str(e)}")
    
    def get_stats(self) -> Dict:
        """Get cache statistics"""
        total_requests = self.cache_stats['hits'] + self.cache_stats['misses']
        hit_rate = (self.cache_stats['hits'] / total_requests * 100) if total_requests > 0 else 0
        
        return {
            'total_requests': total_requests,
            'cache_hits': self.cache_stats['hits'],
            'cache_misses': self.cache_stats['misses'],
            'hit_rate_percent': round(hit_rate, 2),
            'memory_hits': self.cache_stats['memory_hits'],
            'redis_hits': self.cache_stats['redis_hits'],
            'memory_cache_size': len(self.memory_cache)
        }

class ModelRouter:
    """Route predictions to appropriate model versions"""
    
    def __init__(self):
        self.model_endpoints = {}
        self.model_weights = {}
        self.health_status = {}
        self.performance_metrics = defaultdict(list)
    
    def register_model(self, model_id: str, endpoint: str, 
                      version: str = "latest", weight: float = 1.0):
        """Register a model endpoint"""
        self.model_endpoints[model_id] = {
            'endpoint': endpoint,
            'version': version,
            'weight': weight,
            'registered_at': datetime.now()
        }
        self.model_weights[model_id] = weight
        self.health_status[model_id] = True
        logger.info(f"Model registered: {model_id} -> {endpoint}")
    
    def get_model_endpoint(self, prediction_type: PredictionType, 
                          model_version: Optional[str] = None) -> Optional[str]:
        """Get appropriate model endpoint for prediction"""
        # Map prediction types to model IDs
        model_mapping = {
            PredictionType.SPENDING_FORECAST: "spending-predictor",
            PredictionType.ANOMALY_DETECTION: "anomaly-detector", 
            PredictionType.RISK_ASSESSMENT: "risk-assessor",
            PredictionType.BUDGET_OPTIMIZATION: "budget-optimizer",
            PredictionType.GOAL_PREDICTION: "goal-predictor"
        }
        
        model_id = model_mapping.get(prediction_type)
        if not model_id:
            return None
        
        # Handle version-specific routing
        if model_version and model_version != "latest":
            versioned_model_id = f"{model_id}-{model_version}"
            if versioned_model_id in self.model_endpoints:
                model_id = versioned_model_id
        
        if model_id in self.model_endpoints and self.health_status.get(model_id, False):
            return self.model_endpoints[model_id]['endpoint']
        
        return None
    
    def update_health_status(self, model_id: str, is_healthy: bool):
        """Update model health status"""
        self.health_status[model_id] = is_healthy
        if not is_healthy:
            logger.warning(f"Model marked unhealthy: {model_id}")
    
    def record_performance(self, model_id: str, latency_ms: float, success: bool):
        """Record model performance metrics"""
        self.performance_metrics[model_id].append({
            'latency_ms': latency_ms,
            'success': success,
            'timestamp': datetime.now()
        })
        
        # Keep only recent metrics (last 1000 requests)
        if len(self.performance_metrics[model_id]) > 1000:
            self.performance_metrics[model_id] = self.performance_metrics[model_id][-1000:]

class PredictionService:
    """
    High-performance real-time prediction service
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._get_default_config()
        self.cache = PredictionCache(
            redis_url=self.config['cache']['redis_url'],
            max_memory_cache=self.config['cache']['max_memory_cache']
        )
        self.model_router = ModelRouter()
        self.executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=self.config['performance']['max_workers']
        )
        self.request_queue = asyncio.Queue(maxsize=self.config['performance']['max_queue_size'])
        self.batch_processor = None
        self.metrics = {
            'total_requests': 0,
            'successful_predictions': 0,
            'failed_predictions': 0,
            'average_latency_ms': 0,
            'cache_hit_rate': 0
        }
        self.is_initialized = False
    
    def _get_default_config(self) -> Dict:
        """Get default service configuration"""
        return {
            'cache': {
                'redis_url': 'redis://localhost:6379',
                'max_memory_cache': 1000,
                'default_ttl': 300
            },
            'performance': {
                'max_workers': 20,
                'max_queue_size': 1000,
                'request_timeout': 30,
                'batch_size': 50,
                'batch_timeout': 5
            },
            'models': {
                'health_check_interval': 60,
                'max_retries': 3,
                'circuit_breaker_threshold': 5
            },
            'monitoring': {
                'metrics_retention_hours': 24,
                'alert_latency_threshold_ms': 1000,
                'alert_error_rate_threshold': 0.05
            }
        }
    
    async def initialize(self) -> bool:
        """Initialize the prediction service"""
        try:
            # Initialize cache
            await self.cache.initialize()
            
            # Register default models
            await self._register_default_models()
            
            # Start background tasks
            asyncio.create_task(self._process_request_queue())
            asyncio.create_task(self._monitor_model_health())
            asyncio.create_task(self._update_metrics())
            
            self.is_initialized = True
            logger.info("Prediction service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Prediction service initialization error: {str(e)}")
            return False
    
    async def predict(self, request: PredictionRequest) -> PredictionResponse:
        """
        Make a single prediction
        
        Args:
            request: Prediction request
            
        Returns:
            Prediction response
        """
        start_time = time.time()
        
        try:
            if not self.is_initialized:
                raise ValueError("Service not initialized")
            
            self.metrics['total_requests'] += 1
            
            # Check cache first
            cached_response = await self.cache.get(request)
            if cached_response:
                return cached_response
            
            # Get model endpoint
            endpoint = self.model_router.get_model_endpoint(
                request.prediction_type, request.model_version
            )
            
            if not endpoint:
                raise ValueError(f"No available model for {request.prediction_type.value}")
            
            # Make prediction
            prediction_result = await self._make_model_prediction(endpoint, request)
            
            # Create response
            processing_time = (time.time() - start_time) * 1000
            
            response = PredictionResponse(
                request_id=request.request_id,
                user_id=request.user_id,
                prediction_type=request.prediction_type,
                predictions=prediction_result['predictions'],
                confidence_scores=prediction_result.get('confidence_scores', {}),
                model_info=prediction_result.get('model_info', {}),
                processing_time_ms=processing_time,
                cached=False
            )
            
            # Cache response
            await self.cache.set(request, response)
            
            self.metrics['successful_predictions'] += 1
            
            # Record performance
            model_id = prediction_result.get('model_info', {}).get('model_id', 'unknown')
            self.model_router.record_performance(model_id, processing_time, True)
            
            return response
            
        except Exception as e:
            processing_time = (time.time() - start_time) * 1000
            self.metrics['failed_predictions'] += 1
            
            logger.error(f"Prediction error: {str(e)}")
            
            # Return error response
            return PredictionResponse(
                request_id=request.request_id,
                user_id=request.user_id,
                prediction_type=request.prediction_type,
                predictions={'error': str(e)},
                confidence_scores={},
                model_info={'error': True},
                processing_time_ms=processing_time,
                cached=False
            )
    
    async def predict_batch(self, batch_request: BatchPredictionRequest) -> List[PredictionResponse]:
        """
        Make batch predictions
        
        Args:
            batch_request: Batch prediction request
            
        Returns:
            List of prediction responses
        """
        try:
            if not self.is_initialized:
                raise ValueError("Service not initialized")
            
            logger.info(f"Processing batch prediction: {batch_request.batch_id} ({len(batch_request.requests)} requests)")
            
            # Process requests in parallel with limited concurrency
            semaphore = asyncio.Semaphore(batch_request.max_parallel)
            
            async def process_single_request(req):
                async with semaphore:
                    return await self.predict(req)
            
            # Execute all predictions
            tasks = [process_single_request(req) for req in batch_request.requests]
            responses = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Handle exceptions
            final_responses = []
            for i, response in enumerate(responses):
                if isinstance(response, Exception):
                    # Create error response
                    req = batch_request.requests[i]
                    error_response = PredictionResponse(
                        request_id=req.request_id,
                        user_id=req.user_id,
                        prediction_type=req.prediction_type,
                        predictions={'error': str(response)},
                        confidence_scores={},
                        model_info={'error': True},
                        processing_time_ms=0,
                        cached=False
                    )
                    final_responses.append(error_response)
                else:
                    final_responses.append(response)
            
            logger.info(f"Batch prediction completed: {batch_request.batch_id}")
            return final_responses
            
        except Exception as e:
            logger.error(f"Batch prediction error: {str(e)}")
            raise
    
    async def _make_model_prediction(self, endpoint: str, request: PredictionRequest) -> Dict:
        """Make prediction call to model endpoint"""
        try:
            # Simulate model prediction (in real implementation, this would call actual ML models)
            await asyncio.sleep(0.01)  # Simulate network latency
            
            # Generate mock predictions based on prediction type
            if request.prediction_type == PredictionType.SPENDING_FORECAST:
                predictions = {
                    'next_month_spending': np.random.uniform(1000, 5000),
                    'category_breakdown': {
                        'food': np.random.uniform(200, 800),
                        'transport': np.random.uniform(100, 400),
                        'entertainment': np.random.uniform(50, 300),
                        'utilities': np.random.uniform(100, 200)
                    },
                    'confidence_interval': [0.8, 1.2]
                }
                confidence_scores = {
                    'overall_confidence': np.random.uniform(0.7, 0.95),
                    'category_confidence': np.random.uniform(0.6, 0.9)
                }
                
            elif request.prediction_type == PredictionType.ANOMALY_DETECTION:
                anomaly_score = np.random.uniform(0, 1)
                predictions = {
                    'anomaly_score': anomaly_score,
                    'is_anomaly': anomaly_score > 0.7,
                    'anomaly_type': 'spending_spike' if anomaly_score > 0.8 else 'normal',
                    'affected_categories': ['food', 'entertainment'] if anomaly_score > 0.7 else []
                }
                confidence_scores = {
                    'detection_confidence': np.random.uniform(0.8, 0.98)
                }
                
            elif request.prediction_type == PredictionType.RISK_ASSESSMENT:
                risk_score = np.random.uniform(0, 1)
                predictions = {
                    'risk_score': risk_score,
                    'risk_level': 'high' if risk_score > 0.7 else 'medium' if risk_score > 0.4 else 'low',
                    'risk_factors': ['high_spending_variance', 'low_savings_rate'] if risk_score > 0.6 else [],
                    'recommendations': ['increase_emergency_fund', 'diversify_investments']
                }
                confidence_scores = {
                    'assessment_confidence': np.random.uniform(0.75, 0.92)
                }
                
            elif request.prediction_type == PredictionType.BUDGET_OPTIMIZATION:
                predictions = {
                    'optimized_budget': {
                        'food': np.random.uniform(400, 600),
                        'transport': np.random.uniform(200, 300),
                        'entertainment': np.random.uniform(100, 200),
                        'savings': np.random.uniform(500, 1000)
                    },
                    'potential_savings': np.random.uniform(100, 500),
                    'optimization_score': np.random.uniform(0.6, 0.9)
                }
                confidence_scores = {
                    'optimization_confidence': np.random.uniform(0.7, 0.88)
                }
                
            else:  # GOAL_PREDICTION
                predictions = {
                    'goal_achievability': np.random.uniform(0.3, 0.95),
                    'estimated_timeline_months': np.random.randint(6, 36),
                    'required_monthly_savings': np.random.uniform(200, 800),
                    'success_probability': np.random.uniform(0.4, 0.9)
                }
                confidence_scores = {
                    'prediction_confidence': np.random.uniform(0.65, 0.85)
                }
            
            return {
                'predictions': predictions,
                'confidence_scores': confidence_scores,
                'model_info': {
                    'model_id': f"{request.prediction_type.value}-model",
                    'version': request.model_version or "1.0.0",
                    'endpoint': endpoint
                }
            }
            
        except Exception as e:
            logger.error(f"Model prediction error: {str(e)}")
            raise
    
    async def _register_default_models(self):
        """Register default model endpoints"""
        models = [
            ("spending-predictor", "http://localhost:8001/predict", "1.0.0"),
            ("anomaly-detector", "http://localhost:8002/predict", "1.0.0"),
            ("risk-assessor", "http://localhost:8003/predict", "1.0.0"),
            ("budget-optimizer", "http://localhost:8004/predict", "1.0.0"),
            ("goal-predictor", "http://localhost:8005/predict", "1.0.0")
        ]
        
        for model_id, endpoint, version in models:
            self.model_router.register_model(model_id, endpoint, version)
    
    async def _process_request_queue(self):
        """Background task to process queued requests"""
        while True:
            try:
                # Process requests from queue (for future async processing)
                await asyncio.sleep(0.1)
            except Exception as e:
                logger.error(f"Request queue processing error: {str(e)}")
    
    async def _monitor_model_health(self):
        """Background task to monitor model health"""
        while True:
            try:
                # Check model health periodically
                for model_id, model_info in self.model_router.model_endpoints.items():
                    # Simulate health check (in real implementation, ping model endpoints)
                    is_healthy = np.random.random() > 0.05  # 95% uptime simulation
                    self.model_router.update_health_status(model_id, is_healthy)
                
                await asyncio.sleep(self.config['models']['health_check_interval'])
                
            except Exception as e:
                logger.error(f"Model health monitoring error: {str(e)}")
                await asyncio.sleep(60)
    
    async def _update_metrics(self):
        """Background task to update service metrics"""
        while True:
            try:
                # Update cache metrics
                cache_stats = self.cache.get_stats()
                self.metrics['cache_hit_rate'] = cache_stats['hit_rate_percent']
                
                # Calculate average latency
                total_latency = 0
                total_requests = 0
                
                for model_id, performance_data in self.model_router.performance_metrics.items():
                    for metric in performance_data[-100:]:  # Last 100 requests
                        if metric['success']:
                            total_latency += metric['latency_ms']
                            total_requests += 1
                
                if total_requests > 0:
                    self.metrics['average_latency_ms'] = total_latency / total_requests
                
                await asyncio.sleep(60)  # Update every minute
                
            except Exception as e:
                logger.error(f"Metrics update error: {str(e)}")
                await asyncio.sleep(60)
    
    def get_service_status(self) -> Dict:
        """Get service status and metrics"""
        return {
            'service_status': 'healthy' if self.is_initialized else 'initializing',
            'metrics': self.metrics,
            'cache_stats': self.cache.get_stats(),
            'model_status': {
                model_id: {
                    'healthy': self.model_router.health_status.get(model_id, False),
                    'endpoint': info['endpoint'],
                    'version': info['version']
                }
                for model_id, info in self.model_router.model_endpoints.items()
            },
            'performance': {
                'total_requests': self.metrics['total_requests'],
                'success_rate': (
                    self.metrics['successful_predictions'] / 
                    max(1, self.metrics['total_requests'])
                ) * 100,
                'average_latency_ms': self.metrics['average_latency_ms'],
                'cache_hit_rate': self.metrics['cache_hit_rate']
            }
        }
    
    async def cleanup(self):
        """Cleanup service resources"""
        try:
            if self.cache.redis_client:
                await self.cache.redis_client.close()
            
            self.executor.shutdown(wait=True)
            logger.info("Prediction service cleaned up")
            
        except Exception as e:
            logger.error(f"Cleanup error: {str(e)}")