"""
A/B Testing Framework for ML Models
Advanced experimentation platform for model comparison and automated promotion
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
from scipy import stats
import redis.asyncio as redis
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

class ExperimentStatus(Enum):
    """Experiment status types"""
    DRAFT = "draft"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class TrafficSplitStrategy(Enum):
    """Traffic splitting strategies"""
    RANDOM = "random"
    USER_HASH = "user_hash"
    GEOGRAPHIC = "geographic"
    FEATURE_BASED = "feature_based"
    GRADUAL_ROLLOUT = "gradual_rollout"

class MetricType(Enum):
    """Types of metrics to track"""
    LATENCY = "latency"
    ACCURACY = "accuracy"
    ERROR_RATE = "error_rate"
    THROUGHPUT = "throughput"
    USER_SATISFACTION = "user_satisfaction"
    BUSINESS_METRIC = "business_metric"
    CONVERSION_RATE = "conversion_rate"

class StatisticalTest(Enum):
    """Statistical test types"""
    T_TEST = "t_test"
    MANN_WHITNEY = "mann_whitney"
    CHI_SQUARE = "chi_square"
    BOOTSTRAP = "bootstrap"
    BAYESIAN = "bayesian"

@dataclass
class ModelVariant:
    """Model variant configuration"""
    variant_id: str
    model_id: str
    model_version: str
    traffic_percentage: float
    description: str
    is_control: bool = False
    config_overrides: Optional[Dict] = None
    
@dataclass
class ExperimentConfig:
    """A/B test experiment configuration"""
    experiment_id: str
    name: str
    description: str
    variants: List[ModelVariant]
    traffic_split_strategy: TrafficSplitStrategy
    primary_metric: str
    secondary_metrics: List[str]
    minimum_sample_size: int
    confidence_level: float
    statistical_power: float
    max_duration_days: int
    early_stopping_enabled: bool = True
    significance_threshold: float = 0.05
    
@dataclass
class ExperimentResult:
    """A/B test experiment result"""
    experiment_id: str
    variant_id: str
    metric_name: str
    sample_size: int
    mean_value: float
    std_deviation: float
    confidence_interval: Tuple[float, float]
    p_value: Optional[float] = None
    effect_size: Optional[float] = None
    is_significant: Optional[bool] = None

@dataclass
class TrafficAllocation:
    """Traffic allocation decision"""
    user_id: str
    experiment_id: str
    variant_id: str
    allocation_timestamp: datetime
    allocation_method: str
    metadata: Optional[Dict] = None

class ABTestingService:
    """
    A/B Testing Framework for ML Models
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._get_default_config()
        self.redis_client = None
        self.experiments: Dict[str, ExperimentConfig] = {}
        self.active_allocations: Dict[str, Dict[str, str]] = {}  # user_id -> {experiment_id: variant_id}
        self.metrics_collector = MetricsCollector()
        self.statistical_analyzer = StatisticalAnalyzer()
        self.traffic_splitter = TrafficSplitter()
        self.is_initialized = False
        
    def _get_default_config(self) -> Dict:
        """Get default service configuration"""
        return {
            'redis_config': {
                'url': 'redis://localhost:6379',
                'db': 2,  # Separate DB for A/B testing
                'key_prefix': 'finbot:ab_test:'
            },
            'experiment_settings': {
                'default_confidence_level': 0.95,
                'default_statistical_power': 0.8,
                'min_sample_size': 100,
                'max_experiment_duration_days': 30,
                'early_stopping_check_interval_hours': 6,
                'significance_threshold': 0.05
            },
            'traffic_settings': {
                'default_split_strategy': 'user_hash',
                'gradual_rollout_step_size': 0.1,
                'rollout_interval_hours': 24,
                'max_traffic_percentage': 0.5  # Max 50% traffic for experiments
            },
            'metrics_settings': {
                'collection_interval_minutes': 5,
                'aggregation_window_minutes': 60,
                'retention_days': 90,
                'real_time_monitoring': True
            },
            'automation_settings': {
                'auto_promotion_enabled': True,
                'promotion_criteria': {
                    'min_improvement_threshold': 0.05,  # 5% improvement
                    'min_confidence_level': 0.95,
                    'min_sample_size': 1000
                },
                'auto_stop_criteria': {
                    'max_degradation_threshold': -0.1,  # 10% degradation
                    'min_confidence_level': 0.99
                }
            }
        }
    
    async def initialize(self) -> bool:
        """Initialize the A/B testing service"""
        try:
            # Initialize Redis connection
            redis_config = self.config['redis_config']
            self.redis_client = redis.from_url(
                redis_config['url'], 
                db=redis_config['db'],
                decode_responses=True
            )
            await self.redis_client.ping()
            
            # Initialize components
            await self.metrics_collector.initialize(self.redis_client)
            await self.statistical_analyzer.initialize()
            await self.traffic_splitter.initialize()
            
            # Load existing experiments
            await self._load_experiments()
            
            # Start background tasks
            asyncio.create_task(self._start_experiment_monitoring())
            asyncio.create_task(self._start_metrics_collection())
            asyncio.create_task(self._start_auto_promotion_check())
            
            self.is_initialized = True
            logger.info("A/B testing service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"A/B testing service initialization error: {str(e)}")
            return False
    
    async def create_experiment(self, experiment_config: ExperimentConfig) -> Dict:
        """
        Create a new A/B test experiment
        
        Args:
            experiment_config: Experiment configuration
            
        Returns:
            Experiment creation result
        """
        try:
            if not self.is_initialized:
                raise ValueError("Service not initialized")
            
            # Validate experiment configuration
            validation_result = await self._validate_experiment_config(experiment_config)
            if not validation_result['valid']:
                return {
                    'success': False,
                    'error': validation_result['error']
                }
            
            # Check for conflicts with existing experiments
            conflict_check = await self._check_experiment_conflicts(experiment_config)
            if conflict_check['has_conflicts']:
                return {
                    'success': False,
                    'error': f"Experiment conflicts detected: {conflict_check['conflicts']}"
                }
            
            # Store experiment configuration
            await self._store_experiment(experiment_config)
            
            # Initialize experiment metrics
            await self.metrics_collector.initialize_experiment_metrics(
                experiment_config.experiment_id,
                experiment_config.variants,
                [experiment_config.primary_metric] + experiment_config.secondary_metrics
            )
            
            # Add to active experiments
            self.experiments[experiment_config.experiment_id] = experiment_config
            
            logger.info(f"Experiment created: {experiment_config.experiment_id}")
            
            return {
                'success': True,
                'experiment_id': experiment_config.experiment_id,
                'status': ExperimentStatus.DRAFT.value,
                'variants': len(experiment_config.variants),
                'created_at': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Experiment creation error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def start_experiment(self, experiment_id: str) -> Dict:
        """
        Start an A/B test experiment
        
        Args:
            experiment_id: Experiment identifier
            
        Returns:
            Start result
        """
        try:
            if experiment_id not in self.experiments:
                return {
                    'success': False,
                    'error': 'Experiment not found'
                }
            
            experiment = self.experiments[experiment_id]
            
            # Validate experiment is ready to start
            readiness_check = await self._check_experiment_readiness(experiment)
            if not readiness_check['ready']:
                return {
                    'success': False,
                    'error': f"Experiment not ready: {readiness_check['reason']}"
                }
            
            # Update experiment status
            await self._update_experiment_status(experiment_id, ExperimentStatus.RUNNING)
            
            # Initialize traffic allocation
            await self.traffic_splitter.initialize_experiment_allocation(experiment)
            
            # Start metrics collection
            await self.metrics_collector.start_experiment_collection(experiment_id)
            
            logger.info(f"Experiment started: {experiment_id}")
            
            return {
                'success': True,
                'experiment_id': experiment_id,
                'status': ExperimentStatus.RUNNING.value,
                'started_at': datetime.now().isoformat(),
                'estimated_duration_days': experiment.max_duration_days
            }
            
        except Exception as e:
            logger.error(f"Experiment start error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def allocate_traffic(self, user_id: str, experiment_id: str, 
                             context: Optional[Dict] = None) -> Dict:
        """
        Allocate user to experiment variant
        
        Args:
            user_id: User identifier
            experiment_id: Experiment identifier
            context: Additional context for allocation
            
        Returns:
            Traffic allocation result
        """
        try:
            if experiment_id not in self.experiments:
                return {
                    'success': False,
                    'error': 'Experiment not found'
                }
            
            experiment = self.experiments[experiment_id]
            
            # Check if user already allocated
            existing_allocation = await self._get_user_allocation(user_id, experiment_id)
            if existing_allocation:
                return {
                    'success': True,
                    'experiment_id': experiment_id,
                    'variant_id': existing_allocation['variant_id'],
                    'is_new_allocation': False,
                    'allocation_method': existing_allocation['allocation_method']
                }
            
            # Allocate user to variant
            allocation_result = await self.traffic_splitter.allocate_user(
                user_id, experiment, context
            )
            
            if allocation_result['success']:
                # Store allocation
                allocation = TrafficAllocation(
                    user_id=user_id,
                    experiment_id=experiment_id,
                    variant_id=allocation_result['variant_id'],
                    allocation_timestamp=datetime.now(),
                    allocation_method=allocation_result['method'],
                    metadata=context
                )
                
                await self._store_user_allocation(allocation)
                
                # Update active allocations cache
                if user_id not in self.active_allocations:
                    self.active_allocations[user_id] = {}
                self.active_allocations[user_id][experiment_id] = allocation_result['variant_id']
            
            return {
                'success': allocation_result['success'],
                'experiment_id': experiment_id,
                'variant_id': allocation_result.get('variant_id'),
                'is_new_allocation': True,
                'allocation_method': allocation_result.get('method'),
                'error': allocation_result.get('error')
            }
            
        except Exception as e:
            logger.error(f"Traffic allocation error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def record_metric(self, user_id: str, experiment_id: str, 
                          metric_name: str, metric_value: float,
                          timestamp: Optional[datetime] = None) -> Dict:
        """
        Record a metric value for an experiment
        
        Args:
            user_id: User identifier
            experiment_id: Experiment identifier
            metric_name: Name of the metric
            metric_value: Metric value
            timestamp: Optional timestamp
            
        Returns:
            Recording result
        """
        try:
            # Get user's variant allocation
            allocation = await self._get_user_allocation(user_id, experiment_id)
            if not allocation:
                return {
                    'success': False,
                    'error': 'User not allocated to experiment'
                }
            
            # Record metric
            result = await self.metrics_collector.record_metric(
                experiment_id=experiment_id,
                variant_id=allocation['variant_id'],
                user_id=user_id,
                metric_name=metric_name,
                metric_value=metric_value,
                timestamp=timestamp or datetime.now()
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Metric recording error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def get_experiment_results(self, experiment_id: str, 
                                   include_real_time: bool = True) -> Dict:
        """
        Get experiment results and statistical analysis
        
        Args:
            experiment_id: Experiment identifier
            include_real_time: Include real-time metrics
            
        Returns:
            Experiment results
        """
        try:
            if experiment_id not in self.experiments:
                return {
                    'success': False,
                    'error': 'Experiment not found'
                }
            
            experiment = self.experiments[experiment_id]
            
            # Get metrics data
            metrics_data = await self.metrics_collector.get_experiment_metrics(
                experiment_id, include_real_time
            )
            
            # Perform statistical analysis
            analysis_results = await self.statistical_analyzer.analyze_experiment(
                experiment, metrics_data
            )
            
            # Generate recommendations
            recommendations = await self._generate_experiment_recommendations(
                experiment, analysis_results
            )
            
            return {
                'success': True,
                'experiment_id': experiment_id,
                'experiment_name': experiment.name,
                'status': await self._get_experiment_status(experiment_id),
                'variants': [
                    {
                        'variant_id': variant.variant_id,
                        'model_id': variant.model_id,
                        'traffic_percentage': variant.traffic_percentage,
                        'is_control': variant.is_control
                    }
                    for variant in experiment.variants
                ],
                'metrics_summary': metrics_data,
                'statistical_analysis': analysis_results,
                'recommendations': recommendations,
                'generated_at': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Get experiment results error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def stop_experiment(self, experiment_id: str, reason: str = "manual") -> Dict:
        """
        Stop an A/B test experiment
        
        Args:
            experiment_id: Experiment identifier
            reason: Reason for stopping
            
        Returns:
            Stop result
        """
        try:
            if experiment_id not in self.experiments:
                return {
                    'success': False,
                    'error': 'Experiment not found'
                }
            
            # Update experiment status
            await self._update_experiment_status(experiment_id, ExperimentStatus.COMPLETED)
            
            # Stop metrics collection
            await self.metrics_collector.stop_experiment_collection(experiment_id)
            
            # Generate final results
            final_results = await self.get_experiment_results(experiment_id, include_real_time=False)
            
            # Store final results
            await self._store_experiment_results(experiment_id, final_results, reason)
            
            logger.info(f"Experiment stopped: {experiment_id}, reason: {reason}")
            
            return {
                'success': True,
                'experiment_id': experiment_id,
                'status': ExperimentStatus.COMPLETED.value,
                'stopped_at': datetime.now().isoformat(),
                'stop_reason': reason,
                'final_results': final_results
            }
            
        except Exception as e:
            logger.error(f"Experiment stop error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _validate_experiment_config(self, config: ExperimentConfig) -> Dict:
        """Validate experiment configuration"""
        try:
            # Check traffic percentages sum to 100%
            total_traffic = sum(variant.traffic_percentage for variant in config.variants)
            if abs(total_traffic - 100.0) > 0.01:
                return {
                    'valid': False,
                    'error': f'Traffic percentages must sum to 100%, got {total_traffic}%'
                }
            
            # Check for control variant
            control_variants = [v for v in config.variants if v.is_control]
            if len(control_variants) != 1:
                return {
                    'valid': False,
                    'error': 'Exactly one control variant is required'
                }
            
            # Validate sample size
            if config.minimum_sample_size < self.config['experiment_settings']['min_sample_size']:
                return {
                    'valid': False,
                    'error': f'Minimum sample size too small: {config.minimum_sample_size}'
                }
            
            return {'valid': True}
            
        except Exception as e:
            return {
                'valid': False,
                'error': str(e)
            }
    
    async def _check_experiment_conflicts(self, config: ExperimentConfig) -> Dict:
        """Check for conflicts with existing experiments"""
        try:
            conflicts = []
            
            # Check for overlapping model experiments
            for existing_id, existing_exp in self.experiments.items():
                if existing_exp.name == config.name:
                    conflicts.append(f"Experiment name already exists: {config.name}")
                
                # Check model overlap
                existing_models = {v.model_id for v in existing_exp.variants}
                new_models = {v.model_id for v in config.variants}
                
                if existing_models & new_models:
                    conflicts.append(f"Model overlap with experiment {existing_id}")
            
            return {
                'has_conflicts': len(conflicts) > 0,
                'conflicts': conflicts
            }
            
        except Exception as e:
            return {
                'has_conflicts': True,
                'conflicts': [str(e)]
            }
    
    async def _store_experiment(self, config: ExperimentConfig) -> None:
        """Store experiment configuration"""
        try:
            key = f"{self.config['redis_config']['key_prefix']}experiment:{config.experiment_id}"
            data = {
                'config': json.dumps(asdict(config), default=str),
                'status': ExperimentStatus.DRAFT.value,
                'created_at': datetime.now().isoformat()
            }
            
            await self.redis_client.hset(key, mapping=data)
            
        except Exception as e:
            logger.error(f"Store experiment error: {str(e)}")
            raise
    
    async def _load_experiments(self) -> None:
        """Load existing experiments from storage"""
        try:
            pattern = f"{self.config['redis_config']['key_prefix']}experiment:*"
            keys = await self.redis_client.keys(pattern)
            
            for key in keys:
                experiment_data = await self.redis_client.hgetall(key)
                if experiment_data:
                    config_data = json.loads(experiment_data['config'])
                    # Reconstruct ExperimentConfig object
                    # This would need proper deserialization in real implementation
                    experiment_id = key.split(':')[-1]
                    logger.info(f"Loaded experiment: {experiment_id}")
                    
        except Exception as e:
            logger.error(f"Load experiments error: {str(e)}")
    
    async def _start_experiment_monitoring(self) -> None:
        """Start background experiment monitoring"""
        while True:
            try:
                await self._check_experiment_health()
                await self._check_early_stopping_conditions()
                await asyncio.sleep(3600)  # Check every hour
            except Exception as e:
                logger.error(f"Experiment monitoring error: {str(e)}")
                await asyncio.sleep(300)  # Wait 5 minutes on error
    
    async def _start_metrics_collection(self) -> None:
        """Start background metrics collection"""
        while True:
            try:
                await self.metrics_collector.collect_metrics()
                interval = self.config['metrics_settings']['collection_interval_minutes']
                await asyncio.sleep(interval * 60)
            except Exception as e:
                logger.error(f"Metrics collection error: {str(e)}")
                await asyncio.sleep(60)
    
    async def _start_auto_promotion_check(self) -> None:
        """Start background auto-promotion checking"""
        while True:
            try:
                await self._check_auto_promotion_conditions()
                await asyncio.sleep(21600)  # Check every 6 hours
            except Exception as e:
                logger.error(f"Auto-promotion check error: {str(e)}")
                await asyncio.sleep(3600)
    
    async def cleanup(self) -> None:
        """Cleanup service resources"""
        try:
            if self.redis_client:
                await self.redis_client.close()
            
            logger.info("A/B testing service cleaned up")
            
        except Exception as e:
            logger.error(f"Cleanup error: {str(e)}")


class TrafficSplitter:
    """Traffic splitting for A/B tests"""
    
    def __init__(self):
        pass
    
    async def initialize(self) -> None:
        """Initialize traffic splitter"""
        pass
    
    async def allocate_user(self, user_id: str, experiment: ExperimentConfig, 
                          context: Optional[Dict] = None) -> Dict:
        """Allocate user to experiment variant"""
        try:
            # Use user hash for consistent allocation
            user_hash = int(hashlib.md5(f"{user_id}:{experiment.experiment_id}".encode()).hexdigest(), 16)
            allocation_point = (user_hash % 10000) / 100.0  # 0-100%
            
            # Find variant based on traffic percentages
            cumulative_percentage = 0.0
            for variant in experiment.variants:
                cumulative_percentage += variant.traffic_percentage
                if allocation_point <= cumulative_percentage:
                    return {
                        'success': True,
                        'variant_id': variant.variant_id,
                        'method': 'user_hash',
                        'allocation_point': allocation_point
                    }
            
            # Fallback to control variant
            control_variant = next(v for v in experiment.variants if v.is_control)
            return {
                'success': True,
                'variant_id': control_variant.variant_id,
                'method': 'fallback_control',
                'allocation_point': allocation_point
            }
            
        except Exception as e:
            logger.error(f"User allocation error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def initialize_experiment_allocation(self, experiment: ExperimentConfig) -> None:
        """Initialize experiment allocation settings"""
        # This would set up any experiment-specific allocation rules
        pass


class MetricsCollector:
    """Metrics collection for A/B tests"""
    
    def __init__(self):
        self.redis_client = None
        
    async def initialize(self, redis_client) -> None:
        """Initialize metrics collector"""
        self.redis_client = redis_client
    
    async def initialize_experiment_metrics(self, experiment_id: str, 
                                          variants: List[ModelVariant],
                                          metrics: List[str]) -> None:
        """Initialize metrics tracking for experiment"""
        try:
            # Create metric tracking structures
            for variant in variants:
                for metric in metrics:
                    key = f"metrics:{experiment_id}:{variant.variant_id}:{metric}"
                    await self.redis_client.delete(key)  # Clear any existing data
                    
        except Exception as e:
            logger.error(f"Initialize experiment metrics error: {str(e)}")
    
    async def record_metric(self, experiment_id: str, variant_id: str,
                          user_id: str, metric_name: str, metric_value: float,
                          timestamp: datetime) -> Dict:
        """Record a metric value"""
        try:
            # Store individual metric
            key = f"metrics:{experiment_id}:{variant_id}:{metric_name}"
            metric_data = {
                'user_id': user_id,
                'value': metric_value,
                'timestamp': timestamp.isoformat()
            }
            
            await self.redis_client.lpush(key, json.dumps(metric_data))
            
            # Update aggregated metrics
            await self._update_aggregated_metrics(experiment_id, variant_id, metric_name, metric_value)
            
            return {'success': True}
            
        except Exception as e:
            logger.error(f"Record metric error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def get_experiment_metrics(self, experiment_id: str, 
                                   include_real_time: bool = True) -> Dict:
        """Get aggregated metrics for experiment"""
        try:
            # This would retrieve and aggregate metrics from Redis
            # For now, return mock data
            return {
                'experiment_id': experiment_id,
                'variants': {
                    'control': {
                        'sample_size': 1250,
                        'metrics': {
                            'latency': {'mean': 85.3, 'std': 12.4},
                            'accuracy': {'mean': 0.847, 'std': 0.023},
                            'error_rate': {'mean': 0.034, 'std': 0.008}
                        }
                    },
                    'treatment': {
                        'sample_size': 1180,
                        'metrics': {
                            'latency': {'mean': 78.9, 'std': 11.8},
                            'accuracy': {'mean': 0.863, 'std': 0.021},
                            'error_rate': {'mean': 0.028, 'std': 0.007}
                        }
                    }
                },
                'collection_period': {
                    'start': (datetime.now() - timedelta(days=7)).isoformat(),
                    'end': datetime.now().isoformat()
                }
            }
            
        except Exception as e:
            logger.error(f"Get experiment metrics error: {str(e)}")
            return {}
    
    async def _update_aggregated_metrics(self, experiment_id: str, variant_id: str,
                                       metric_name: str, metric_value: float) -> None:
        """Update aggregated metrics"""
        try:
            # Update running statistics
            agg_key = f"agg_metrics:{experiment_id}:{variant_id}:{metric_name}"
            
            # Get current stats
            current_stats = await self.redis_client.hgetall(agg_key)
            
            if current_stats:
                count = int(current_stats.get('count', 0))
                sum_val = float(current_stats.get('sum', 0))
                sum_sq = float(current_stats.get('sum_sq', 0))
            else:
                count = 0
                sum_val = 0
                sum_sq = 0
            
            # Update stats
            count += 1
            sum_val += metric_value
            sum_sq += metric_value ** 2
            
            # Store updated stats
            await self.redis_client.hset(agg_key, mapping={
                'count': count,
                'sum': sum_val,
                'sum_sq': sum_sq,
                'mean': sum_val / count,
                'last_updated': datetime.now().isoformat()
            })
            
        except Exception as e:
            logger.error(f"Update aggregated metrics error: {str(e)}")
    
    async def start_experiment_collection(self, experiment_id: str) -> None:
        """Start metrics collection for experiment"""
        pass
    
    async def stop_experiment_collection(self, experiment_id: str) -> None:
        """Stop metrics collection for experiment"""
        pass
    
    async def collect_metrics(self) -> None:
        """Background metrics collection"""
        pass


class StatisticalAnalyzer:
    """Statistical analysis for A/B tests"""
    
    def __init__(self):
        pass
    
    async def initialize(self) -> None:
        """Initialize statistical analyzer"""
        pass
    
    async def analyze_experiment(self, experiment: ExperimentConfig, 
                               metrics_data: Dict) -> Dict:
        """Perform statistical analysis on experiment"""
        try:
            results = {}
            
            # Get control and treatment data
            variants_data = metrics_data.get('variants', {})
            control_variant = next(v for v in experiment.variants if v.is_control)
            
            control_data = variants_data.get(control_variant.variant_id, {})
            
            # Analyze each treatment variant against control
            for variant in experiment.variants:
                if variant.is_control:
                    continue
                
                treatment_data = variants_data.get(variant.variant_id, {})
                
                # Perform statistical tests for each metric
                variant_results = {}
                for metric_name in [experiment.primary_metric] + experiment.secondary_metrics:
                    test_result = await self._perform_statistical_test(
                        control_data.get('metrics', {}).get(metric_name, {}),
                        treatment_data.get('metrics', {}).get(metric_name, {}),
                        metric_name
                    )
                    variant_results[metric_name] = test_result
                
                results[variant.variant_id] = variant_results
            
            return results
            
        except Exception as e:
            logger.error(f"Statistical analysis error: {str(e)}")
            return {}
    
    async def _perform_statistical_test(self, control_metrics: Dict, 
                                      treatment_metrics: Dict, 
                                      metric_name: str) -> Dict:
        """Perform statistical test between control and treatment"""
        try:
            # Extract metrics
            control_mean = control_metrics.get('mean', 0)
            control_std = control_metrics.get('std', 0)
            treatment_mean = treatment_metrics.get('mean', 0)
            treatment_std = treatment_metrics.get('std', 0)
            
            # Mock sample sizes (would come from actual data)
            control_n = 1250
            treatment_n = 1180
            
            # Perform t-test (simplified)
            if control_std > 0 and treatment_std > 0:
                # Welch's t-test
                pooled_se = np.sqrt((control_std**2 / control_n) + (treatment_std**2 / treatment_n))
                t_stat = (treatment_mean - control_mean) / pooled_se
                
                # Degrees of freedom (Welch-Satterthwaite equation)
                df = ((control_std**2 / control_n) + (treatment_std**2 / treatment_n))**2 / \
                     ((control_std**2 / control_n)**2 / (control_n - 1) + 
                      (treatment_std**2 / treatment_n)**2 / (treatment_n - 1))
                
                # Calculate p-value
                p_value = 2 * (1 - stats.t.cdf(abs(t_stat), df))
                
                # Effect size (Cohen's d)
                pooled_std = np.sqrt(((control_n - 1) * control_std**2 + 
                                    (treatment_n - 1) * treatment_std**2) / 
                                   (control_n + treatment_n - 2))
                effect_size = (treatment_mean - control_mean) / pooled_std if pooled_std > 0 else 0
                
                # Confidence interval for difference
                margin_of_error = stats.t.ppf(0.975, df) * pooled_se
                ci_lower = (treatment_mean - control_mean) - margin_of_error
                ci_upper = (treatment_mean - control_mean) + margin_of_error
                
                return {
                    'test_type': 'welch_t_test',
                    'control_mean': control_mean,
                    'treatment_mean': treatment_mean,
                    'difference': treatment_mean - control_mean,
                    'relative_improvement': ((treatment_mean - control_mean) / control_mean * 100) if control_mean != 0 else 0,
                    't_statistic': t_stat,
                    'p_value': p_value,
                    'degrees_of_freedom': df,
                    'effect_size': effect_size,
                    'confidence_interval': [ci_lower, ci_upper],
                    'is_significant': p_value < 0.05,
                    'control_sample_size': control_n,
                    'treatment_sample_size': treatment_n
                }
            else:
                return {
                    'test_type': 'insufficient_data',
                    'error': 'Insufficient variance for statistical test'
                }
                
        except Exception as e:
            logger.error(f"Statistical test error: {str(e)}")
            return {
                'test_type': 'error',
                'error': str(e)
            }


    async def _generate_experiment_recommendations(self, experiment: ExperimentConfig, 
                                                 analysis_results: Dict) -> List[str]:
        """Generate recommendations based on experiment results"""
        try:
            recommendations = []
            
            # Check primary metric
            if 'treatment' in analysis_results:
                primary_result = analysis_results['treatment'].get(experiment.primary_metric, {})
                
                if 'relative_improvement' in primary_result:
                    improvement = primary_result['relative_improvement']
                    is_significant = primary_result.get('is_significant', False)
                    
                    if is_significant and improvement > 5:
                        recommendations.append(f"🚀 Strong positive result: {improvement:.1f}% improvement in {experiment.primary_metric}")
                        recommendations.append("✅ Recommend promoting treatment variant to production")
                    elif is_significant and improvement > 0:
                        recommendations.append(f"📈 Positive result: {improvement:.1f}% improvement in {experiment.primary_metric}")
                        recommendations.append("⚖️ Consider extended testing or gradual rollout")
                    elif is_significant and improvement < -5:
                        recommendations.append(f"⚠️ Negative result: {improvement:.1f}% degradation in {experiment.primary_metric}")
                        recommendations.append("❌ Do not promote - investigate issues")
                    else:
                        recommendations.append("📊 No significant difference detected")
                        recommendations.append("🔄 Consider extending experiment duration")
            
            return recommendations
            
        except Exception as e:
            logger.error(f"Generate recommendations error: {str(e)}")
            return ["Error generating recommendations"]
    
    async def _get_experiment_status(self, experiment_id: str) -> str:
        """Get current experiment status"""
        # Mock implementation
        return ExperimentStatus.RUNNING.value
    
    async def _get_user_allocation(self, user_id: str, experiment_id: str) -> Optional[Dict]:
        """Get user's experiment allocation"""
        # Mock implementation
        if user_id and experiment_id:
            return {
                'variant_id': 'control',
                'allocation_method': 'user_hash'
            }
        return None
    
    async def _store_user_allocation(self, allocation: TrafficAllocation) -> None:
        """Store user allocation"""
        # Mock implementation
        pass
    
    async def _update_experiment_status(self, experiment_id: str, status: ExperimentStatus) -> None:
        """Update experiment status"""
        # Mock implementation
        pass
    
    async def _check_experiment_readiness(self, experiment: ExperimentConfig) -> Dict:
        """Check if experiment is ready to start"""
        return {'ready': True}
    
    async def _store_experiment_results(self, experiment_id: str, results: Dict, reason: str) -> None:
        """Store final experiment results"""
        # Mock implementation
        pass
    
    async def _check_experiment_health(self) -> None:
        """Check health of running experiments"""
        pass
    
    async def _check_early_stopping_conditions(self) -> None:
        """Check early stopping conditions"""
        pass
    
    async def _check_auto_promotion_conditions(self) -> None:
        """Check auto-promotion conditions"""
        pass