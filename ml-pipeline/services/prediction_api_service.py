"""
Real-time Prediction API Service
High-performance APIs for ML model predictions with caching and optimization
"""

import asyncio
import logging
import json
import time
from typing import Dict, List, Optional, Any, Union
from datetime import datetime, timedelta
from enum import Enum
import aiohttp
import redis.asyncio as redis
from dataclasses import dataclass, asdict
import hashlib
import numpy as np
from concurrent.futures import ThreadPoolExecutor
# uvloop import with Windows compatibility
try:
    import uvloop
except ImportError:
    # uvloop not available on Windows, use default event loop
    uvloop = None

from services.model_serving_service import (
    ModelServingService, PredictionRequest, PredictionResponse,
    ModelMetadata, ModelStatus
)

logger = logging.getLogger(__name__)

class PredictionType(Enum):
    """Types of predictions supported"""
    BUDGET_OPTIMIZATION = "budget_optimization"
    RISK_ASSESSMENT = "risk_assessment"
    ANOMALY_DETECTION = "anomaly_detection"
    SPENDING_PREDICTION = "spending_prediction"
    GOAL_RECOMMENDATION = "goal_recommendation"
    INSIGHT_GENERATION = "insight_generation"

class CacheStrategy(Enum):
    """Caching strategies for predictions"""
    NO_CACHE = "no_cache"
    SHORT_TERM = "short_term"  # 5 minutes
    MEDIUM_TERM = "medium_term"  # 1 hour
    LONG_TERM = "long_term"  # 24 hours
    PERSISTENT = "persistent"  # Until invalidated

@dataclass
class PredictionConfig:
    """Configuration for prediction requests"""
    model_id: str
    prediction_type: PredictionType
    cache_strategy: CacheStrategy = CacheStrategy.MEDIUM_TERM
    timeout: float = 30.0
    enable_batching: bool = True
    max_batch_size: int = 32
    batch_timeout_ms: int = 50
    enable_caching: bool = True
    cache_ttl: int = 3600  # seconds

@dataclass
class BatchPredictionRequest:
    """Batch prediction request"""
    requests: List[PredictionRequest]
    batch_id: str
    priority: int = 1
    max_wait_time: float = 100.0  # milliseconds

@dataclass
class PredictionMetrics:
    """Prediction performance metrics"""
    request_id: str
    model_id: str
    prediction_type: str
    latency_ms: float
    cache_hit: bool
    batch_size: int
    timestamp: datetime
    success: bool
    error_message: Optional[str] = None

class PredictionAPIService:
    """
    High-performance real-time prediction API service
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._get_default_config()
        self.model_serving = ModelServingService(self.config.get('model_serving', {}))
        self.redis_client = None
        self.batch_processor = BatchProcessor(self.config.get('batching', {}))
        self.cache_manager = CacheManager(self.config.get('caching', {}))
        self.metrics_collector = MetricsCollector()
        self.thread_pool = ThreadPoolExecutor(max_workers=self.config.get('max_workers', 10))
        self.is_initialized = False
        
    def _get_default_config(self) -> Dict:
        """Get default service configuration"""
        return {
            'api_config': {
                'host': '0.0.0.0',
                'port': 8080,
                'max_concurrent_requests': 1000,
                'request_timeout': 30.0,
                'enable_cors': True,
                'enable_compression': True
            },
            'caching': {
                'redis_url': 'redis://localhost:6379',
                'default_ttl': 3600,
                'max_cache_size': '1GB',
                'enable_compression': True,
                'cache_key_prefix': 'finbot:predictions:'
            },
            'batching': {
                'enable': True,
                'max_batch_size': 32,
                'batch_timeout_ms': 50,
                'max_queue_size': 1000,
                'batch_strategies': ['time_based', 'size_based', 'adaptive']
            },
            'optimization': {
                'enable_async_processing': True,
                'enable_result_streaming': True,
                'enable_request_deduplication': True,
                'connection_pool_size': 100,
                'keep_alive_timeout': 30
            },
            'monitoring': {
                'enable_metrics': True,
                'metrics_interval': 10,
                'enable_tracing': True,
                'log_slow_requests': True,
                'slow_request_threshold_ms': 1000
            },
            'rate_limiting': {
                'enable': True,
                'requests_per_minute': 1000,
                'burst_size': 100,
                'per_user_limit': 100
            }
        }
    
    async def initialize(self) -> bool:
        """Initialize the prediction API service"""
        try:
            # Set event loop policy for better performance (if uvloop available)
            if uvloop and hasattr(asyncio, 'set_event_loop_policy'):
                asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
            
            # Initialize model serving
            await self.model_serving.initialize()
            
            # Initialize Redis connection
            redis_url = self.config['caching']['redis_url']
            self.redis_client = redis.from_url(redis_url, decode_responses=True)
            await self.redis_client.ping()
            
            # Initialize batch processor
            await self.batch_processor.initialize()
            
            # Initialize cache manager
            await self.cache_manager.initialize(self.redis_client)
            
            # Start background tasks
            asyncio.create_task(self._start_batch_processing())
            asyncio.create_task(self._start_metrics_collection())
            asyncio.create_task(self._start_cache_cleanup())
            
            self.is_initialized = True
            logger.info("Prediction API service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Prediction API service initialization error: {str(e)}")
            return False
    
    async def predict_single(self, prediction_config: PredictionConfig,
                           inputs: Dict[str, Any],
                           user_id: Optional[str] = None,
                           request_id: Optional[str] = None) -> Dict:
        """
        Make single real-time prediction
        
        Args:
            prediction_config: Prediction configuration
            inputs: Input data for prediction
            user_id: Optional user identifier
            request_id: Optional request identifier
            
        Returns:
            Prediction result with metadata
        """
        try:
            start_time = time.time()
            request_id = request_id or self._generate_request_id()
            
            # Check cache first
            cache_hit = False
            if prediction_config.enable_caching:
                cached_result = await self.cache_manager.get_prediction(
                    prediction_config, inputs, user_id
                )
                if cached_result:
                    cache_hit = True
                    latency_ms = (time.time() - start_time) * 1000
                    
                    # Record metrics
                    await self._record_metrics(PredictionMetrics(
                        request_id=request_id,
                        model_id=prediction_config.model_id,
                        prediction_type=prediction_config.prediction_type.value,
                        latency_ms=latency_ms,
                        cache_hit=True,
                        batch_size=1,
                        timestamp=datetime.now(),
                        success=True
                    ))
                    
                    return {
                        'success': True,
                        'request_id': request_id,
                        'prediction': cached_result['prediction'],
                        'model_id': prediction_config.model_id,
                        'latency_ms': latency_ms,
                        'cache_hit': True,
                        'timestamp': datetime.now().isoformat()
                    }
            
            # Create prediction request
            pred_request = PredictionRequest(
                model_id=prediction_config.model_id,
                inputs=inputs,
                request_id=request_id,
                timeout=prediction_config.timeout,
                metadata={
                    'user_id': user_id,
                    'prediction_type': prediction_config.prediction_type.value,
                    'timestamp': datetime.now().isoformat()
                }
            )
            
            # Make prediction
            if prediction_config.enable_batching:
                # Add to batch queue
                result = await self.batch_processor.add_request(pred_request, prediction_config)
            else:
                # Direct prediction
                result = await self.model_serving.predict(pred_request)
            
            # Process result
            if hasattr(result, 'predictions') and 'error' not in result.predictions:
                # Cache successful result
                if prediction_config.enable_caching:
                    await self.cache_manager.cache_prediction(
                        prediction_config, inputs, result.predictions, user_id
                    )
                
                latency_ms = (time.time() - start_time) * 1000
                
                # Record metrics
                await self._record_metrics(PredictionMetrics(
                    request_id=request_id,
                    model_id=prediction_config.model_id,
                    prediction_type=prediction_config.prediction_type.value,
                    latency_ms=latency_ms,
                    cache_hit=False,
                    batch_size=1,
                    timestamp=datetime.now(),
                    success=True
                ))
                
                return {
                    'success': True,
                    'request_id': request_id,
                    'prediction': result.predictions,
                    'model_id': prediction_config.model_id,
                    'model_version': result.model_version,
                    'confidence': result.confidence,
                    'latency_ms': latency_ms,
                    'cache_hit': False,
                    'timestamp': datetime.now().isoformat()
                }
            else:
                # Handle error
                error_msg = result.predictions.get('error', 'Unknown prediction error') if hasattr(result, 'predictions') else str(result)
                
                await self._record_metrics(PredictionMetrics(
                    request_id=request_id,
                    model_id=prediction_config.model_id,
                    prediction_type=prediction_config.prediction_type.value,
                    latency_ms=(time.time() - start_time) * 1000,
                    cache_hit=False,
                    batch_size=1,
                    timestamp=datetime.now(),
                    success=False,
                    error_message=error_msg
                ))
                
                return {
                    'success': False,
                    'request_id': request_id,
                    'error': error_msg,
                    'model_id': prediction_config.model_id,
                    'latency_ms': (time.time() - start_time) * 1000,
                    'timestamp': datetime.now().isoformat()
                }
                
        except Exception as e:
            logger.error(f"Single prediction error: {str(e)}")
            return {
                'success': False,
                'request_id': request_id or 'unknown',
                'error': str(e),
                'latency_ms': (time.time() - start_time) * 1000 if 'start_time' in locals() else 0,
                'timestamp': datetime.now().isoformat()
            }
    
    async def predict_batch(self, batch_request: BatchPredictionRequest) -> Dict:
        """
        Make batch predictions with optimization
        
        Args:
            batch_request: Batch prediction request
            
        Returns:
            Batch prediction results
        """
        try:
            start_time = time.time()
            
            # Group requests by model for efficient processing
            model_groups = {}
            for req in batch_request.requests:
                if req.model_id not in model_groups:
                    model_groups[req.model_id] = []
                model_groups[req.model_id].append(req)
            
            # Process each model group
            all_results = []
            for model_id, requests in model_groups.items():
                # Check cache for each request
                cached_results = []
                uncached_requests = []
                
                for req in requests:
                    # Simple cache check (would need proper cache key generation)
                    cache_key = self._generate_cache_key(req.inputs, req.model_id)
                    cached = await self.redis_client.get(cache_key)
                    
                    if cached:
                        cached_results.append({
                            'request_id': req.request_id,
                            'prediction': json.loads(cached),
                            'cache_hit': True
                        })
                    else:
                        uncached_requests.append(req)
                
                # Process uncached requests
                if uncached_requests:
                    batch_results = await self.model_serving.batch_predict(uncached_requests)
                    
                    # Cache results and format response
                    for i, result in enumerate(batch_results):
                        if hasattr(result, 'predictions') and 'error' not in result.predictions:
                            # Cache successful result
                            cache_key = self._generate_cache_key(
                                uncached_requests[i].inputs, 
                                uncached_requests[i].model_id
                            )
                            await self.redis_client.setex(
                                cache_key, 
                                self.config['caching']['default_ttl'],
                                json.dumps(result.predictions)
                            )
                        
                        all_results.append({
                            'request_id': result.request_id,
                            'prediction': result.predictions,
                            'model_id': result.model_id,
                            'latency_ms': result.latency_ms,
                            'cache_hit': False,
                            'success': 'error' not in result.predictions if hasattr(result, 'predictions') else False
                        })
                
                # Add cached results
                all_results.extend(cached_results)
            
            total_latency = (time.time() - start_time) * 1000
            
            return {
                'success': True,
                'batch_id': batch_request.batch_id,
                'total_requests': len(batch_request.requests),
                'successful_predictions': len([r for r in all_results if r.get('success', True)]),
                'cache_hits': len([r for r in all_results if r.get('cache_hit', False)]),
                'total_latency_ms': total_latency,
                'results': all_results,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Batch prediction error: {str(e)}")
            return {
                'success': False,
                'batch_id': batch_request.batch_id,
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            }
    
    async def predict_budget_optimization(self, user_id: str, 
                                        financial_data: Dict,
                                        optimization_goal: str = "balance_lifestyle") -> Dict:
        """
        Specialized budget optimization prediction
        
        Args:
            user_id: User identifier
            financial_data: User's financial information
            optimization_goal: Optimization strategy
            
        Returns:
            Budget optimization result
        """
        try:
            config = PredictionConfig(
                model_id="budget-optimizer-v1",
                prediction_type=PredictionType.BUDGET_OPTIMIZATION,
                cache_strategy=CacheStrategy.MEDIUM_TERM,
                enable_caching=True,
                cache_ttl=1800  # 30 minutes
            )
            
            inputs = {
                'monthly_income': financial_data.get('monthly_income', 0),
                'monthly_expenses': financial_data.get('monthly_expenses', 0),
                'financial_goals': financial_data.get('financial_goals', []),
                'debt_breakdown': financial_data.get('debt_breakdown', {}),
                'optimization_goal': optimization_goal,
                'user_preferences': financial_data.get('preferences', {})
            }
            
            result = await self.predict_single(config, inputs, user_id)
            
            # Enhance result with budget-specific metadata
            if result['success']:
                result['prediction_type'] = 'budget_optimization'
                result['optimization_goal'] = optimization_goal
                
                # Add budget-specific insights
                if 'allocations' in result['prediction']:
                    result['insights'] = self._generate_budget_insights(result['prediction'])
            
            return result
            
        except Exception as e:
            logger.error(f"Budget optimization prediction error: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'prediction_type': 'budget_optimization'
            }
    
    async def predict_risk_assessment(self, user_id: str, 
                                    transaction_data: Dict,
                                    financial_profile: Dict) -> Dict:
        """
        Specialized risk assessment prediction
        
        Args:
            user_id: User identifier
            transaction_data: Recent transaction information
            financial_profile: User's financial profile
            
        Returns:
            Risk assessment result
        """
        try:
            config = PredictionConfig(
                model_id="risk-assessor-v1",
                prediction_type=PredictionType.RISK_ASSESSMENT,
                cache_strategy=CacheStrategy.SHORT_TERM,
                enable_caching=True,
                cache_ttl=300  # 5 minutes
            )
            
            inputs = {
                'transactions': transaction_data.get('recent_transactions', []),
                'monthly_income': financial_profile.get('monthly_income', 0),
                'monthly_expenses': financial_profile.get('monthly_expenses', 0),
                'debt_to_income_ratio': financial_profile.get('debt_to_income_ratio', 0),
                'emergency_fund_months': financial_profile.get('emergency_fund_months', 0),
                'credit_score': financial_profile.get('credit_score', 0),
                'investment_portfolio': financial_profile.get('investments', {})
            }
            
            result = await self.predict_single(config, inputs, user_id)
            
            # Enhance result with risk-specific metadata
            if result['success']:
                result['prediction_type'] = 'risk_assessment'
                
                # Add risk-specific insights
                if 'risk_score' in result['prediction']:
                    result['risk_level'] = self._categorize_risk_level(result['prediction']['risk_score'])
                    result['recommendations'] = self._generate_risk_recommendations(result['prediction'])
            
            return result
            
        except Exception as e:
            logger.error(f"Risk assessment prediction error: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'prediction_type': 'risk_assessment'
            }
    
    def _generate_request_id(self) -> str:
        """Generate unique request ID"""
        return f"pred_{int(time.time() * 1000)}_{hash(time.time()) % 10000}"
    
    def _generate_cache_key(self, inputs: Dict, model_id: str) -> str:
        """Generate cache key for inputs"""
        # Create deterministic hash of inputs
        input_str = json.dumps(inputs, sort_keys=True)
        input_hash = hashlib.md5(input_str.encode()).hexdigest()
        return f"{self.config['caching']['cache_key_prefix']}{model_id}:{input_hash}"
    
    def _generate_budget_insights(self, prediction: Dict) -> List[str]:
        """Generate budget-specific insights"""
        insights = []
        
        if 'allocations' in prediction:
            total_allocated = sum(alloc.get('recommended_amount', 0) for alloc in prediction['allocations'])
            total_income = prediction.get('total_income', 0)
            
            if total_income > 0:
                allocation_rate = (total_allocated / total_income) * 100
                if allocation_rate > 90:
                    insights.append("⚠️ Budget allocation is very tight - consider increasing income or reducing expenses")
                elif allocation_rate < 70:
                    insights.append("💰 You have room for additional savings or investments")
                else:
                    insights.append("✅ Budget allocation looks balanced")
        
        return insights
    
    def _categorize_risk_level(self, risk_score: float) -> str:
        """Categorize risk score into levels"""
        if risk_score >= 80:
            return "high"
        elif risk_score >= 60:
            return "medium-high"
        elif risk_score >= 40:
            return "medium"
        elif risk_score >= 20:
            return "low-medium"
        else:
            return "low"
    
    def _generate_risk_recommendations(self, prediction: Dict) -> List[str]:
        """Generate risk-specific recommendations"""
        recommendations = []
        risk_score = prediction.get('risk_score', 0)
        
        if risk_score >= 70:
            recommendations.extend([
                "🚨 Consider building a larger emergency fund",
                "📉 Review and reduce high-risk investments",
                "💳 Focus on paying down high-interest debt"
            ])
        elif risk_score >= 40:
            recommendations.extend([
                "⚖️ Maintain current risk management strategies",
                "📊 Consider diversifying your investment portfolio",
                "💰 Continue building emergency savings"
            ])
        else:
            recommendations.extend([
                "✅ Your financial risk is well-managed",
                "📈 Consider opportunities for growth investments",
                "🎯 Focus on long-term financial goals"
            ])
        
        return recommendations    

    async def _record_metrics(self, metrics: PredictionMetrics) -> None:
        """Record prediction metrics"""
        try:
            await self.metrics_collector.record_prediction(metrics)
        except Exception as e:
            logger.error(f"Metrics recording error: {str(e)}")
    
    async def _start_batch_processing(self) -> None:
        """Start background batch processing"""
        while True:
            try:
                await self.batch_processor.process_batches()
                await asyncio.sleep(0.01)  # 10ms interval
            except Exception as e:
                logger.error(f"Batch processing error: {str(e)}")
                await asyncio.sleep(1)
    
    async def _start_metrics_collection(self) -> None:
        """Start background metrics collection"""
        while True:
            try:
                await self.metrics_collector.flush_metrics()
                await asyncio.sleep(self.config['monitoring']['metrics_interval'])
            except Exception as e:
                logger.error(f"Metrics collection error: {str(e)}")
                await asyncio.sleep(10)
    
    async def _start_cache_cleanup(self) -> None:
        """Start background cache cleanup"""
        while True:
            try:
                await self.cache_manager.cleanup_expired()
                await asyncio.sleep(300)  # 5 minutes
            except Exception as e:
                logger.error(f"Cache cleanup error: {str(e)}")
                await asyncio.sleep(60)
    
    async def get_prediction_metrics(self, time_range: int = 3600) -> Dict:
        """Get prediction performance metrics"""
        try:
            return await self.metrics_collector.get_metrics_summary(time_range)
        except Exception as e:
            logger.error(f"Get metrics error: {str(e)}")
            return {'error': str(e)}
    
    async def cleanup(self) -> None:
        """Cleanup service resources"""
        try:
            if self.redis_client:
                await self.redis_client.close()
            
            if self.batch_processor:
                await self.batch_processor.cleanup()
            
            if self.thread_pool:
                self.thread_pool.shutdown(wait=True)
            
            logger.info("Prediction API service cleaned up")
            
        except Exception as e:
            logger.error(f"Cleanup error: {str(e)}")


class BatchProcessor:
    """Batch processing for prediction requests"""
    
    def __init__(self, config: Dict):
        self.config = config
        self.request_queue = asyncio.Queue(maxsize=config.get('max_queue_size', 1000))
        self.pending_batches: Dict[str, List] = {}
        self.batch_timers: Dict[str, float] = {}
        
    async def initialize(self) -> None:
        """Initialize batch processor"""
        pass
    
    async def add_request(self, request: PredictionRequest, 
                         config: PredictionConfig) -> PredictionResponse:
        """Add request to batch queue"""
        try:
            # Create future for result
            future = asyncio.Future()
            
            # Add to queue
            await self.request_queue.put({
                'request': request,
                'config': config,
                'future': future,
                'timestamp': time.time()
            })
            
            # Wait for result
            return await asyncio.wait_for(future, timeout=config.timeout)
            
        except asyncio.TimeoutError:
            logger.error(f"Batch request timeout: {request.request_id}")
            return PredictionResponse(
                model_id=request.model_id,
                predictions={'error': 'Request timeout'},
                request_id=request.request_id
            )
    
    async def process_batches(self) -> None:
        """Process pending batches"""
        try:
            # Collect requests for batching
            batch_candidates = {}
            
            # Drain queue up to batch size
            for _ in range(self.config.get('max_batch_size', 32)):
                try:
                    item = self.request_queue.get_nowait()
                    model_id = item['request'].model_id
                    
                    if model_id not in batch_candidates:
                        batch_candidates[model_id] = []
                    
                    batch_candidates[model_id].append(item)
                    
                except asyncio.QueueEmpty:
                    break
            
            # Process each model's batch
            for model_id, items in batch_candidates.items():
                if len(items) >= self.config.get('min_batch_size', 1):
                    await self._process_model_batch(model_id, items)
                else:
                    # Put back small batches
                    for item in items:
                        await self.request_queue.put(item)
                        
        except Exception as e:
            logger.error(f"Batch processing error: {str(e)}")
    
    async def _process_model_batch(self, model_id: str, items: List[Dict]) -> None:
        """Process batch for specific model"""
        try:
            # Extract requests
            requests = [item['request'] for item in items]
            futures = [item['future'] for item in items]
            
            # Make batch prediction (simulated)
            # In real implementation, this would call the model serving service
            results = []
            for request in requests:
                # Simulate prediction
                result = PredictionResponse(
                    model_id=request.model_id,
                    predictions={'simulated': True, 'batch_processed': True},
                    request_id=request.request_id,
                    latency_ms=50.0
                )
                results.append(result)
            
            # Set futures with results
            for future, result in zip(futures, results):
                if not future.done():
                    future.set_result(result)
                    
        except Exception as e:
            logger.error(f"Model batch processing error: {str(e)}")
            # Set error for all futures
            for item in items:
                future = item['future']
                if not future.done():
                    future.set_exception(e)
    
    async def cleanup(self) -> None:
        """Cleanup batch processor"""
        # Cancel pending requests
        while not self.request_queue.empty():
            try:
                item = self.request_queue.get_nowait()
                future = item['future']
                if not future.done():
                    future.cancel()
            except asyncio.QueueEmpty:
                break


class CacheManager:
    """Cache management for predictions"""
    
    def __init__(self, config: Dict):
        self.config = config
        self.redis_client = None
        
    async def initialize(self, redis_client) -> None:
        """Initialize cache manager"""
        self.redis_client = redis_client
    
    async def get_prediction(self, config: PredictionConfig, 
                           inputs: Dict, user_id: Optional[str]) -> Optional[Dict]:
        """Get cached prediction"""
        try:
            cache_key = self._generate_cache_key(config, inputs, user_id)
            cached_data = await self.redis_client.get(cache_key)
            
            if cached_data:
                return json.loads(cached_data)
            
            return None
            
        except Exception as e:
            logger.error(f"Cache get error: {str(e)}")
            return None
    
    async def cache_prediction(self, config: PredictionConfig, 
                             inputs: Dict, prediction: Dict, 
                             user_id: Optional[str]) -> None:
        """Cache prediction result"""
        try:
            cache_key = self._generate_cache_key(config, inputs, user_id)
            ttl = self._get_cache_ttl(config.cache_strategy)
            
            cache_data = {
                'prediction': prediction,
                'cached_at': datetime.now().isoformat(),
                'ttl': ttl
            }
            
            await self.redis_client.setex(
                cache_key, 
                ttl,
                json.dumps(cache_data)
            )
            
        except Exception as e:
            logger.error(f"Cache set error: {str(e)}")
    
    def _generate_cache_key(self, config: PredictionConfig, 
                          inputs: Dict, user_id: Optional[str]) -> str:
        """Generate cache key"""
        key_data = {
            'model_id': config.model_id,
            'prediction_type': config.prediction_type.value,
            'inputs': inputs,
            'user_id': user_id
        }
        
        key_str = json.dumps(key_data, sort_keys=True)
        key_hash = hashlib.md5(key_str.encode()).hexdigest()
        
        return f"{self.config['cache_key_prefix']}{key_hash}"
    
    def _get_cache_ttl(self, strategy: CacheStrategy) -> int:
        """Get TTL for cache strategy"""
        ttl_mapping = {
            CacheStrategy.NO_CACHE: 0,
            CacheStrategy.SHORT_TERM: 300,      # 5 minutes
            CacheStrategy.MEDIUM_TERM: 3600,    # 1 hour
            CacheStrategy.LONG_TERM: 86400,     # 24 hours
            CacheStrategy.PERSISTENT: 604800    # 7 days
        }
        
        return ttl_mapping.get(strategy, self.config['default_ttl'])
    
    async def cleanup_expired(self) -> None:
        """Cleanup expired cache entries"""
        try:
            # Get all cache keys
            pattern = f"{self.config['cache_key_prefix']}*"
            keys = await self.redis_client.keys(pattern)
            
            # Check and remove expired keys (Redis handles this automatically)
            # This is mainly for logging and metrics
            logger.debug(f"Cache cleanup: {len(keys)} keys checked")
            
        except Exception as e:
            logger.error(f"Cache cleanup error: {str(e)}")


class MetricsCollector:
    """Metrics collection for predictions"""
    
    def __init__(self):
        self.metrics_buffer = []
        self.metrics_lock = asyncio.Lock()
        
    async def record_prediction(self, metrics: PredictionMetrics) -> None:
        """Record prediction metrics"""
        try:
            async with self.metrics_lock:
                self.metrics_buffer.append(metrics)
                
                # Flush if buffer is full
                if len(self.metrics_buffer) >= 100:
                    await self._flush_buffer()
                    
        except Exception as e:
            logger.error(f"Metrics recording error: {str(e)}")
    
    async def flush_metrics(self) -> None:
        """Flush metrics buffer"""
        try:
            async with self.metrics_lock:
                if self.metrics_buffer:
                    await self._flush_buffer()
        except Exception as e:
            logger.error(f"Metrics flush error: {str(e)}")
    
    async def _flush_buffer(self) -> None:
        """Flush metrics buffer to storage"""
        try:
            # In real implementation, this would write to metrics storage
            # For now, just log summary
            if self.metrics_buffer:
                total_requests = len(self.metrics_buffer)
                successful_requests = len([m for m in self.metrics_buffer if m.success])
                avg_latency = sum(m.latency_ms for m in self.metrics_buffer) / total_requests
                cache_hits = len([m for m in self.metrics_buffer if m.cache_hit])
                
                logger.info(f"Metrics flush: {total_requests} requests, "
                          f"{successful_requests} successful, "
                          f"{avg_latency:.2f}ms avg latency, "
                          f"{cache_hits} cache hits")
                
                self.metrics_buffer.clear()
                
        except Exception as e:
            logger.error(f"Metrics buffer flush error: {str(e)}")
    
    async def get_metrics_summary(self, time_range: int) -> Dict:
        """Get metrics summary for time range"""
        try:
            # In real implementation, this would query metrics storage
            # For now, return current buffer stats
            async with self.metrics_lock:
                if not self.metrics_buffer:
                    return {
                        'total_requests': 0,
                        'successful_requests': 0,
                        'error_rate': 0,
                        'avg_latency_ms': 0,
                        'cache_hit_rate': 0
                    }
                
                total_requests = len(self.metrics_buffer)
                successful_requests = len([m for m in self.metrics_buffer if m.success])
                avg_latency = sum(m.latency_ms for m in self.metrics_buffer) / total_requests
                cache_hits = len([m for m in self.metrics_buffer if m.cache_hit])
                
                return {
                    'total_requests': total_requests,
                    'successful_requests': successful_requests,
                    'error_rate': (total_requests - successful_requests) / total_requests * 100,
                    'avg_latency_ms': avg_latency,
                    'cache_hit_rate': cache_hits / total_requests * 100 if total_requests > 0 else 0,
                    'time_range_seconds': time_range
                }
                
        except Exception as e:
            logger.error(f"Get metrics summary error: {str(e)}")
            return {'error': str(e)}