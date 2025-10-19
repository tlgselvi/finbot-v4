"""
Prometheus Metrics Service

This service provides comprehensive monitoring capabilities for ML systems,
including model performance, system resources, and business metrics.
"""

import time
import logging
import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from prometheus_client import (
    Counter, Histogram, Gauge, Summary, Info,
    CollectorRegistry, generate_latest, CONTENT_TYPE_LATEST
)
import psutil
import threading
from dataclasses import dataclass
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MetricType(Enum):
    """Types of metrics"""
    COUNTER = "counter"
    HISTOGRAM = "histogram"
    GAUGE = "gauge"
    SUMMARY = "summary"
    INFO = "info"

@dataclass
class AlertRule:
    """Alert rule configuration"""
    name: str
    metric_name: str
    condition: str  # e.g., "> 0.95", "< 0.8"
    threshold: float
    duration: int  # seconds
    severity: str  # critical, warning, info
    description: str
    enabled: bool = True

class PrometheusMetricsService:
    """Service for collecting and exposing Prometheus metrics"""
    
    def __init__(self, registry: Optional[CollectorRegistry] = None):
        self.registry = registry or CollectorRegistry()
        self.metrics = {}
        self.alert_rules = []
        self.alert_states = {}
        self.collection_interval = 30  # seconds
        self.is_collecting = False
        self.collection_thread = None
        
        # Initialize core metrics
        self._initialize_core_metrics()
        
    def _initialize_core_metrics(self):
        """Initialize core system and ML metrics"""
        
        # System metrics
        self.metrics['cpu_usage'] = Gauge(
            'system_cpu_usage_percent',
            'CPU usage percentage',
            registry=self.registry
        )
        
        self.metrics['memory_usage'] = Gauge(
            'system_memory_usage_percent',
            'Memory usage percentage',
            registry=self.registry
        )
        
        self.metrics['disk_usage'] = Gauge(
            'system_disk_usage_percent',
            'Disk usage percentage',
            registry=self.registry
        )
        
        # GPU metrics
        self.metrics['gpu_utilization'] = Gauge(
            'gpu_utilization_percent',
            'GPU utilization percentage',
            ['device_id', 'device_name'],
            registry=self.registry
        )
        
        self.metrics['gpu_memory_usage'] = Gauge(
            'gpu_memory_usage_percent',
            'GPU memory usage percentage',
            ['device_id', 'device_name'],
            registry=self.registry
        )
        
        # ML Model metrics
        self.metrics['model_inference_duration'] = Histogram(
            'ml_model_inference_duration_seconds',
            'Time spent on model inference',
            ['model_name', 'model_version'],
            buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
            registry=self.registry
        )
        
        self.metrics['model_predictions_total'] = Counter(
            'ml_model_predictions_total',
            'Total number of model predictions',
            ['model_name', 'model_version', 'status'],
            registry=self.registry
        )
        
        self.metrics['model_accuracy'] = Gauge(
            'ml_model_accuracy',
            'Model accuracy score',
            ['model_name', 'model_version'],
            registry=self.registry
        )
        
        self.metrics['model_drift_score'] = Gauge(
            'ml_model_drift_score',
            'Model drift detection score',
            ['model_name', 'model_version'],
            registry=self.registry
        )
        
        # Cache metrics
        self.metrics['cache_hits_total'] = Counter(
            'cache_hits_total',
            'Total number of cache hits',
            ['cache_type'],
            registry=self.registry
        )
        
        self.metrics['cache_misses_total'] = Counter(
            'cache_misses_total',
            'Total number of cache misses',
            ['cache_type'],
            registry=self.registry
        )
        
        self.metrics['cache_size_bytes'] = Gauge(
            'cache_size_bytes',
            'Current cache size in bytes',
            ['cache_type'],
            registry=self.registry
        )
        
        # Business metrics
        self.metrics['user_insights_generated'] = Counter(
            'user_insights_generated_total',
            'Total number of insights generated',
            ['insight_type', 'user_segment'],
            registry=self.registry
        )
        
        self.metrics['user_engagement_rate'] = Gauge(
            'user_engagement_rate',
            'User engagement rate with insights',
            ['insight_type'],
            registry=self.registry
        )
        
        self.metrics['budget_optimizations_total'] = Counter(
            'budget_optimizations_total',
            'Total number of budget optimizations performed',
            ['optimization_type'],
            registry=self.registry
        )
        
        self.metrics['risk_assessments_total'] = Counter(
            'risk_assessments_total',
            'Total number of risk assessments performed',
            ['risk_level'],
            registry=self.registry
        )
        
        # API metrics
        self.metrics['api_requests_total'] = Counter(
            'api_requests_total',
            'Total number of API requests',
            ['method', 'endpoint', 'status_code'],
            registry=self.registry
        )
        
        self.metrics['api_request_duration'] = Histogram(
            'api_request_duration_seconds',
            'Time spent processing API requests',
            ['method', 'endpoint'],
            buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
            registry=self.registry
        )
        
        # Error metrics
        self.metrics['errors_total'] = Counter(
            'errors_total',
            'Total number of errors',
            ['error_type', 'service'],
            registry=self.registry
        )
        
        logger.info("Core metrics initialized")
    
    def record_model_inference(self, model_name: str, model_version: str, 
                              duration: float, status: str = "success"):
        """Record model inference metrics"""
        try:
            self.metrics['model_inference_duration'].labels(
                model_name=model_name,
                model_version=model_version
            ).observe(duration)
            
            self.metrics['model_predictions_total'].labels(
                model_name=model_name,
                model_version=model_version,
                status=status
            ).inc()
            
        except Exception as e:
            logger.error(f"Error recording model inference metrics: {e}")
    
    def update_model_accuracy(self, model_name: str, model_version: str, accuracy: float):
        """Update model accuracy metric"""
        try:
            self.metrics['model_accuracy'].labels(
                model_name=model_name,
                model_version=model_version
            ).set(accuracy)
            
        except Exception as e:
            logger.error(f"Error updating model accuracy: {e}")
    
    def update_model_drift(self, model_name: str, model_version: str, drift_score: float):
        """Update model drift score"""
        try:
            self.metrics['model_drift_score'].labels(
                model_name=model_name,
                model_version=model_version
            ).set(drift_score)
            
        except Exception as e:
            logger.error(f"Error updating model drift score: {e}")
    
    def record_cache_operation(self, cache_type: str, operation: str):
        """Record cache hit/miss"""
        try:
            if operation == "hit":
                self.metrics['cache_hits_total'].labels(cache_type=cache_type).inc()
            elif operation == "miss":
                self.metrics['cache_misses_total'].labels(cache_type=cache_type).inc()
                
        except Exception as e:
            logger.error(f"Error recording cache operation: {e}")
    
    def update_cache_size(self, cache_type: str, size_bytes: int):
        """Update cache size metric"""
        try:
            self.metrics['cache_size_bytes'].labels(cache_type=cache_type).set(size_bytes)
            
        except Exception as e:
            logger.error(f"Error updating cache size: {e}")
    
    def record_insight_generation(self, insight_type: str, user_segment: str = "default"):
        """Record insight generation"""
        try:
            self.metrics['user_insights_generated'].labels(
                insight_type=insight_type,
                user_segment=user_segment
            ).inc()
            
        except Exception as e:
            logger.error(f"Error recording insight generation: {e}")
    
    def update_engagement_rate(self, insight_type: str, rate: float):
        """Update user engagement rate"""
        try:
            self.metrics['user_engagement_rate'].labels(insight_type=insight_type).set(rate)
            
        except Exception as e:
            logger.error(f"Error updating engagement rate: {e}")
    
    def record_budget_optimization(self, optimization_type: str):
        """Record budget optimization"""
        try:
            self.metrics['budget_optimizations_total'].labels(
                optimization_type=optimization_type
            ).inc()
            
        except Exception as e:
            logger.error(f"Error recording budget optimization: {e}")
    
    def record_risk_assessment(self, risk_level: str):
        """Record risk assessment"""
        try:
            self.metrics['risk_assessments_total'].labels(risk_level=risk_level).inc()
            
        except Exception as e:
            logger.error(f"Error recording risk assessment: {e}")
    
    def record_api_request(self, method: str, endpoint: str, status_code: int, duration: float):
        """Record API request metrics"""
        try:
            self.metrics['api_requests_total'].labels(
                method=method,
                endpoint=endpoint,
                status_code=str(status_code)
            ).inc()
            
            self.metrics['api_request_duration'].labels(
                method=method,
                endpoint=endpoint
            ).observe(duration)
            
        except Exception as e:
            logger.error(f"Error recording API request metrics: {e}")
    
    def record_error(self, error_type: str, service: str):
        """Record error occurrence"""
        try:
            self.metrics['errors_total'].labels(
                error_type=error_type,
                service=service
            ).inc()
            
        except Exception as e:
            logger.error(f"Error recording error metric: {e}")
    
    def collect_system_metrics(self):
        """Collect system resource metrics"""
        try:
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            self.metrics['cpu_usage'].set(cpu_percent)
            
            # Memory usage
            memory = psutil.virtual_memory()
            self.metrics['memory_usage'].set(memory.percent)
            
            # Disk usage
            disk = psutil.disk_usage('/')
            self.metrics['disk_usage'].set(disk.percent)
            
            # GPU metrics (if available)
            try:
                import GPUtil
                gpus = GPUtil.getGPUs()
                for gpu in gpus:
                    self.metrics['gpu_utilization'].labels(
                        device_id=str(gpu.id),
                        device_name=gpu.name
                    ).set(gpu.load * 100)
                    
                    self.metrics['gpu_memory_usage'].labels(
                        device_id=str(gpu.id),
                        device_name=gpu.name
                    ).set((gpu.memoryUsed / gpu.memoryTotal) * 100)
                    
            except ImportError:
                pass  # GPU monitoring not available
            
        except Exception as e:
            logger.error(f"Error collecting system metrics: {e}")
    
    def add_alert_rule(self, rule: AlertRule):
        """Add an alert rule"""
        self.alert_rules.append(rule)
        self.alert_states[rule.name] = {
            'active': False,
            'triggered_at': None,
            'last_check': None
        }
        logger.info(f"Added alert rule: {rule.name}")
    
    def check_alert_rules(self):
        """Check all alert rules and trigger alerts if necessary"""
        try:
            current_time = time.time()
            
            for rule in self.alert_rules:
                if not rule.enabled:
                    continue
                
                # Get current metric value
                metric_value = self._get_metric_value(rule.metric_name)
                if metric_value is None:
                    continue
                
                # Check condition
                alert_triggered = self._evaluate_condition(metric_value, rule.condition, rule.threshold)
                
                alert_state = self.alert_states[rule.name]
                
                if alert_triggered:
                    if not alert_state['active']:
                        # New alert
                        if alert_state['triggered_at'] is None:
                            alert_state['triggered_at'] = current_time
                        elif current_time - alert_state['triggered_at'] >= rule.duration:
                            # Alert duration exceeded, activate alert
                            alert_state['active'] = True
                            self._trigger_alert(rule, metric_value)
                else:
                    # Reset alert state
                    alert_state['active'] = False
                    alert_state['triggered_at'] = None
                
                alert_state['last_check'] = current_time
                
        except Exception as e:
            logger.error(f"Error checking alert rules: {e}")
    
    def _get_metric_value(self, metric_name: str) -> Optional[float]:
        """Get current value of a metric"""
        try:
            # This is a simplified implementation
            # In practice, you'd query the actual metric values
            if metric_name in self.metrics:
                # For demo purposes, return a mock value
                return 0.5
            return None
        except Exception as e:
            logger.error(f"Error getting metric value for {metric_name}: {e}")
            return None
    
    def _evaluate_condition(self, value: float, condition: str, threshold: float) -> bool:
        """Evaluate alert condition"""
        try:
            if condition.startswith('>'):
                return value > threshold
            elif condition.startswith('<'):
                return value < threshold
            elif condition.startswith('>='):
                return value >= threshold
            elif condition.startswith('<='):
                return value <= threshold
            elif condition.startswith('=='):
                return abs(value - threshold) < 0.001
            elif condition.startswith('!='):
                return abs(value - threshold) >= 0.001
            return False
        except Exception as e:
            logger.error(f"Error evaluating condition: {e}")
            return False
    
    def _trigger_alert(self, rule: AlertRule, current_value: float):
        """Trigger an alert"""
        try:
            alert_message = {
                'rule_name': rule.name,
                'severity': rule.severity,
                'description': rule.description,
                'metric_name': rule.metric_name,
                'current_value': current_value,
                'threshold': rule.threshold,
                'condition': rule.condition,
                'timestamp': datetime.now().isoformat()
            }
            
            logger.warning(f"ALERT TRIGGERED: {alert_message}")
            
            # Here you would integrate with alerting systems like:
            # - Slack notifications
            # - Email alerts
            # - PagerDuty
            # - Discord webhooks
            
        except Exception as e:
            logger.error(f"Error triggering alert: {e}")
    
    def start_collection(self):
        """Start automatic metrics collection"""
        if self.is_collecting:
            return
        
        self.is_collecting = True
        self.collection_thread = threading.Thread(target=self._collection_loop, daemon=True)
        self.collection_thread.start()
        logger.info("Started metrics collection")
    
    def stop_collection(self):
        """Stop automatic metrics collection"""
        self.is_collecting = False
        if self.collection_thread:
            self.collection_thread.join(timeout=5)
        logger.info("Stopped metrics collection")
    
    def _collection_loop(self):
        """Main collection loop"""
        while self.is_collecting:
            try:
                self.collect_system_metrics()
                self.check_alert_rules()
                time.sleep(self.collection_interval)
            except Exception as e:
                logger.error(f"Error in collection loop: {e}")
                time.sleep(5)  # Wait before retrying
    
    def get_metrics_output(self) -> str:
        """Get Prometheus metrics output"""
        try:
            return generate_latest(self.registry).decode('utf-8')
        except Exception as e:
            logger.error(f"Error generating metrics output: {e}")
            return ""
    
    def get_metrics_summary(self) -> Dict[str, Any]:
        """Get summary of current metrics"""
        try:
            summary = {
                'total_metrics': len(self.metrics),
                'active_alerts': sum(1 for state in self.alert_states.values() if state['active']),
                'total_alert_rules': len(self.alert_rules),
                'collection_status': 'running' if self.is_collecting else 'stopped',
                'last_collection': datetime.now().isoformat()
            }
            
            return summary
        except Exception as e:
            logger.error(f"Error getting metrics summary: {e}")
            return {}

# Global metrics service instance
metrics_service = PrometheusMetricsService()

# Default alert rules
default_alert_rules = [
    AlertRule(
        name="high_cpu_usage",
        metric_name="system_cpu_usage_percent",
        condition="> 90",
        threshold=90.0,
        duration=300,  # 5 minutes
        severity="warning",
        description="CPU usage is above 90% for 5 minutes"
    ),
    AlertRule(
        name="high_memory_usage",
        metric_name="system_memory_usage_percent",
        condition="> 85",
        threshold=85.0,
        duration=300,
        severity="warning",
        description="Memory usage is above 85% for 5 minutes"
    ),
    AlertRule(
        name="model_high_latency",
        metric_name="ml_model_inference_duration_seconds",
        condition="> 1.0",
        threshold=1.0,
        duration=60,
        severity="critical",
        description="Model inference latency is above 1 second"
    ),
    AlertRule(
        name="low_cache_hit_rate",
        metric_name="cache_hit_rate",
        condition="< 0.8",
        threshold=0.8,
        duration=600,  # 10 minutes
        severity="warning",
        description="Cache hit rate is below 80% for 10 minutes"
    )
]

# Add default alert rules
for rule in default_alert_rules:
    metrics_service.add_alert_rule(rule)