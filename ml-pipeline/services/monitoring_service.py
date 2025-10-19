"""
ML Monitoring Service

This service provides comprehensive monitoring capabilities for ML models,
system performance, and business metrics using Prometheus and custom metrics.
"""

import asyncio
import logging
import time
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import psutil
import json
from dataclasses import dataclass
from enum import Enum
import aiohttp
import aioredis
from prometheus_client import (
    Counter, Histogram, Gauge, Summary, Info,
    CollectorRegistry, generate_latest, CONTENT_TYPE_LATEST
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AlertSeverity(Enum):
    """Alert severity levels"""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"

@dataclass
class MetricDefinition:
    """Definition of a custom metric"""
    name: str
    metric_type: str  # counter, gauge, histogram, summary
    description: str
    labels: List[str] = None
    buckets: List[float] = None  # For histograms

@dataclass
class Alert:
    """Alert definition"""
    name: str
    severity: AlertSeverity
    message: str
    labels: Dict[str, str]
    timestamp: datetime
    resolved: bool = False

class MLMonitoringService:
    """Service for monitoring ML models and system performance"""
    
    def __init__(self, redis_url: str = "redis://localhost:6379", 
                 prometheus_gateway: str = None):
        self.redis_url = redis_url
        self.prometheus_gateway = prometheus_gateway
        self.redis_client = None
        self.registry = CollectorRegistry()
        self.metrics = {}
        self.alerts = []
        self.is_monitoring = False
        
        # Initialize core metrics
        self._initialize_core_metrics()
        
    async def initialize(self):
        """Initialize monitoring service"""
        try:
            self.redis_client = await aioredis.from_url(self.redis_url)
            logger.info("ML monitoring service initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize monitoring service: {e}")
            
    async def close(self):
        """Close monitoring service"""
        if self.redis_client:
            await self.redis_client.close()
        self.is_monitoring = False
        
    def _initialize_core_metrics(self):
        """Initialize core Prometheus metrics"""
        
        # Model performance metrics
        self.metrics['model_requests_total'] = Counter(
            'ml_model_requests_total',
            'Total number of ML model requests',
            ['model_name', 'version', 'endpoint'],
            registry=self.registry
        )
        
        self.metrics['model_errors_total'] = Counter(
            'ml_model_errors_total',
            'Total number of ML model errors',
            ['model_name', 'version', 'error_type'],
            registry=self.registry
        )
        
        self.metrics['model_inference_duration'] = Histogram(
            'ml_model_inference_duration_seconds',
            'ML model inference duration in seconds',
            ['model_name', 'version'],
            buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
            registry=self.registry
        )
        
        self.metrics['model_accuracy'] = Gauge(
            'ml_model_accuracy',
            'ML model accuracy score',
            ['model_name', 'version'],
            registry=self.registry
        )
        
        self.metrics['prediction_confidence'] = Histogram(
            'ml_prediction_confidence',
            'ML prediction confidence scores',
            ['model_name'],
            buckets=[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
            registry=self.registry
        )
        
        # System metrics
        self.metrics['gpu_utilization'] = Gauge(
            'gpu_utilization_percent',
            'GPU utilization percentage',
            ['gpu_id', 'gpu_name'],
            registry=self.registry
        )
        
        self.metrics['gpu_memory_used'] = Gauge(
            'gpu_memory_used_percent',
            'GPU memory usage percentage',
            ['gpu_id', 'gpu_name'],
            registry=self.registry
        )
        
        # Cache metrics
        self.metrics['cache_hit_rate'] = Gauge(
            'ml_cache_hit_rate',
            'ML prediction cache hit rate',
            registry=self.registry
        )
        
        self.metrics['cache_operations'] = Counter(
            'ml_cache_operations_total',
            'Total cache operations',
            ['operation', 'result'],
            registry=self.registry
        )
        
        # Business metrics
        self.metrics['anomaly_detection_rate'] = Gauge(
            'ml_anomaly_detection_rate',
            'Rate of anomaly detection',
            registry=self.registry
        )
        
        self.metrics['insight_engagement_rate'] = Gauge(
            'ml_insight_engagement_rate',
            'User engagement rate with insights',
            registry=self.registry
        )
        
        # Data quality metrics
        self.metrics['data_quality_issues'] = Counter(
            'ml_data_quality_issues_total',
            'Total data quality issues detected',
            ['issue_type', 'data_source'],
            registry=self.registry
        )
        
        self.metrics['feature_missing_rate'] = Gauge(
            'ml_feature_missing_rate',
            'Rate of missing features',
            ['feature_name'],
            registry=self.registry
        )
        
        self.metrics['data_freshness'] = Gauge(
            'ml_data_last_updated_timestamp',
            'Timestamp of last data update',
            ['data_source'],
            registry=self.registry
        )
        
        # Training metrics
        self.metrics['training_duration'] = Histogram(
            'ml_training_duration_seconds',
            'ML model training duration in seconds',
            ['model_name', 'training_type'],
            buckets=[60, 300, 600, 1800, 3600, 7200, 14400, 28800],
            registry=self.registry
        )
        
        self.metrics['model_loading_failures'] = Counter(
            'ml_model_loading_failures_total',
            'Total model loading failures',
            ['model_name', 'error_type'],
            registry=self.registry
        )
        
        self.metrics['training_pipeline_status'] = Gauge(
            'ml_training_pipeline_status',
            'Training pipeline status (1=success, 0=failure)',
            ['pipeline_name'],
            registry=self.registry
        )
    
    def record_model_request(self, model_name: str, version: str = "v1", 
                           endpoint: str = "predict"):
        """Record a model request"""
        self.metrics['model_requests_total'].labels(
            model_name=model_name, 
            version=version, 
            endpoint=endpoint
        ).inc()
    
    def record_model_error(self, model_name: str, version: str = "v1", 
                          error_type: str = "unknown"):
        """Record a model error"""
        self.metrics['model_errors_total'].labels(
            model_name=model_name, 
            version=version, 
            error_type=error_type
        ).inc()
    
    def record_inference_time(self, model_name: str, duration: float, 
                            version: str = "v1"):
        """Record model inference time"""
        self.metrics['model_inference_duration'].labels(
            model_name=model_name, 
            version=version
        ).observe(duration)
    
    def update_model_accuracy(self, model_name: str, accuracy: float, 
                            version: str = "v1"):
        """Update model accuracy metric"""
        self.metrics['model_accuracy'].labels(
            model_name=model_name, 
            version=version
        ).set(accuracy)
    
    def record_prediction_confidence(self, model_name: str, confidence: float):
        """Record prediction confidence"""
        self.metrics['prediction_confidence'].labels(
            model_name=model_name
        ).observe(confidence)
    
    def update_gpu_metrics(self, gpu_id: str, gpu_name: str, 
                          utilization: float, memory_used: float):
        """Update GPU metrics"""
        self.metrics['gpu_utilization'].labels(
            gpu_id=gpu_id, 
            gpu_name=gpu_name
        ).set(utilization)
        
        self.metrics['gpu_memory_used'].labels(
            gpu_id=gpu_id, 
            gpu_name=gpu_name
        ).set(memory_used)
    
    def update_cache_metrics(self, hit_rate: float):
        """Update cache hit rate"""
        self.metrics['cache_hit_rate'].set(hit_rate)
    
    def record_cache_operation(self, operation: str, result: str):
        """Record cache operation"""
        self.metrics['cache_operations'].labels(
            operation=operation, 
            result=result
        ).inc()
    
    def update_business_metrics(self, anomaly_rate: float, engagement_rate: float):
        """Update business metrics"""
        self.metrics['anomaly_detection_rate'].set(anomaly_rate)
        self.metrics['insight_engagement_rate'].set(engagement_rate)
    
    def record_data_quality_issue(self, issue_type: str, data_source: str):
        """Record data quality issue"""
        self.metrics['data_quality_issues'].labels(
            issue_type=issue_type, 
            data_source=data_source
        ).inc()
    
    def update_feature_missing_rate(self, feature_name: str, missing_rate: float):
        """Update feature missing rate"""
        self.metrics['feature_missing_rate'].labels(
            feature_name=feature_name
        ).set(missing_rate)
    
    def update_data_freshness(self, data_source: str, timestamp: float):
        """Update data freshness timestamp"""
        self.metrics['data_freshness'].labels(
            data_source=data_source
        ).set(timestamp)
    
    def record_training_duration(self, model_name: str, duration: float, 
                               training_type: str = "full"):
        """Record training duration"""
        self.metrics['training_duration'].labels(
            model_name=model_name, 
            training_type=training_type
        ).observe(duration)
    
    def record_model_loading_failure(self, model_name: str, error_type: str):
        """Record model loading failure"""
        self.metrics['model_loading_failures'].labels(
            model_name=model_name, 
            error_type=error_type
        ).inc()
    
    def update_training_pipeline_status(self, pipeline_name: str, success: bool):
        """Update training pipeline status"""
        self.metrics['training_pipeline_status'].labels(
            pipeline_name=pipeline_name
        ).set(1 if success else 0)
    
    async def collect_system_metrics(self):
        """Collect system-level metrics"""
        try:
            # CPU and memory metrics are handled by node_exporter
            # Here we collect ML-specific system metrics
            
            # GPU metrics (if available)
            try:
                import GPUtil
                gpus = GPUtil.getGPUs()
                for gpu in gpus:
                    self.update_gpu_metrics(
                        gpu_id=str(gpu.id),
                        gpu_name=gpu.name,
                        utilization=gpu.load * 100,
                        memory_used=(gpu.memoryUsed / gpu.memoryTotal) * 100
                    )
            except ImportError:
                pass  # GPU monitoring not available
            
            # Cache metrics
            if self.redis_client:
                try:
                    info = await self.redis_client.info()
                    hit_rate = info.get('keyspace_hits', 0) / max(
                        info.get('keyspace_hits', 0) + info.get('keyspace_misses', 0), 1
                    )
                    self.update_cache_metrics(hit_rate)
                except Exception as e:
                    logger.warning(f"Failed to collect Redis metrics: {e}")
            
        except Exception as e:
            logger.error(f"Error collecting system metrics: {e}")
    
    async def check_alert_conditions(self):
        """Check for alert conditions and generate alerts"""
        try:
            current_time = datetime.now()
            
            # Example alert conditions (these would be more sophisticated in practice)
            
            # Check model error rate
            # This is simplified - in practice you'd query Prometheus for rates
            
            # Check GPU utilization
            try:
                import GPUtil
                gpus = GPUtil.getGPUs()
                for gpu in gpus:
                    if gpu.load > 0.9:  # 90% utilization
                        alert = Alert(
                            name="HighGPUUtilization",
                            severity=AlertSeverity.WARNING,
                            message=f"GPU {gpu.id} utilization is {gpu.load*100:.1f}%",
                            labels={"gpu_id": str(gpu.id), "gpu_name": gpu.name},
                            timestamp=current_time
                        )
                        await self._send_alert(alert)
            except ImportError:
                pass
            
        except Exception as e:
            logger.error(f"Error checking alert conditions: {e}")
    
    async def _send_alert(self, alert: Alert):
        """Send alert to alerting system"""
        try:
            # Store alert
            self.alerts.append(alert)
            
            # Send to Redis for other services to consume
            if self.redis_client:
                alert_data = {
                    "name": alert.name,
                    "severity": alert.severity.value,
                    "message": alert.message,
                    "labels": alert.labels,
                    "timestamp": alert.timestamp.isoformat()
                }
                await self.redis_client.lpush("ml_alerts", json.dumps(alert_data))
                await self.redis_client.expire("ml_alerts", 86400)  # 24 hours
            
            logger.warning(f"Alert generated: {alert.name} - {alert.message}")
            
        except Exception as e:
            logger.error(f"Error sending alert: {e}")
    
    async def start_monitoring(self, interval: int = 30):
        """Start continuous monitoring"""
        self.is_monitoring = True
        logger.info(f"Starting ML monitoring with {interval}s interval")
        
        while self.is_monitoring:
            try:
                await self.collect_system_metrics()
                await self.check_alert_conditions()
                await asyncio.sleep(interval)
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(interval)
    
    def stop_monitoring(self):
        """Stop continuous monitoring"""
        self.is_monitoring = False
        logger.info("Stopped ML monitoring")
    
    def get_metrics(self) -> str:
        """Get Prometheus metrics in text format"""
        return generate_latest(self.registry).decode('utf-8')
    
    def get_metrics_content_type(self) -> str:
        """Get content type for metrics"""
        return CONTENT_TYPE_LATEST
    
    async def get_alert_summary(self) -> Dict[str, Any]:
        """Get summary of recent alerts"""
        try:
            recent_alerts = [
                alert for alert in self.alerts 
                if alert.timestamp > datetime.now() - timedelta(hours=24)
            ]
            
            summary = {
                "total_alerts": len(recent_alerts),
                "critical_alerts": len([a for a in recent_alerts if a.severity == AlertSeverity.CRITICAL]),
                "warning_alerts": len([a for a in recent_alerts if a.severity == AlertSeverity.WARNING]),
                "info_alerts": len([a for a in recent_alerts if a.severity == AlertSeverity.INFO]),
                "recent_alerts": [
                    {
                        "name": alert.name,
                        "severity": alert.severity.value,
                        "message": alert.message,
                        "timestamp": alert.timestamp.isoformat()
                    }
                    for alert in recent_alerts[-10:]  # Last 10 alerts
                ]
            }
            
            return summary
            
        except Exception as e:
            logger.error(f"Error getting alert summary: {e}")
            return {"error": str(e)}
    
    async def get_health_status(self) -> Dict[str, Any]:
        """Get monitoring service health status"""
        try:
            status = {
                "service_status": "healthy" if self.is_monitoring else "stopped",
                "redis_connected": self.redis_client is not None,
                "metrics_collected": len(self.metrics),
                "alerts_count": len(self.alerts),
                "last_check": datetime.now().isoformat()
            }
            
            return status
            
        except Exception as e:
            logger.error(f"Error getting health status: {e}")
            return {"service_status": "unhealthy", "error": str(e)}

# Global monitoring service instance
monitoring_service = MLMonitoringService()