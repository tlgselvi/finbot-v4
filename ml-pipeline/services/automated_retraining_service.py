"""
Automated Model Retraining Service

This service monitors model performance and automatically triggers retraining
when performance degrades or new data becomes available.
"""

import asyncio
import logging
import json
import time
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from enum import Enum
import aioredis
import numpy as np
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RetrainingTrigger(Enum):
    """Types of retraining triggers"""
    PERFORMANCE_DEGRADATION = "performance_degradation"
    DATA_DRIFT = "data_drift"
    SCHEDULED = "scheduled"
    MANUAL = "manual"
    NEW_DATA_AVAILABLE = "new_data_available"

class ModelStatus(Enum):
    """Model training status"""
    ACTIVE = "active"
    TRAINING = "training"
    VALIDATION = "validation"
    DEPLOYMENT_PENDING = "deployment_pending"
    FAILED = "failed"
    DEPRECATED = "deprecated"

@dataclass
class ModelPerformanceMetrics:
    """Model performance metrics"""
    model_name: str
    version: str
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    auc_roc: float
    avg_latency_ms: float
    throughput_rps: float
    error_rate: float
    data_points: int
    timestamp: datetime

@dataclass
class RetrainingConfig:
    """Configuration for automated retraining"""
    model_name: str
    performance_threshold: float  # Minimum acceptable accuracy
    drift_threshold: float  # Maximum acceptable drift score
    min_data_points: int  # Minimum data points for retraining
    retraining_schedule: str  # Cron-like schedule
    max_training_time: int  # Maximum training time in seconds
    validation_split: float  # Validation data split ratio
    auto_deploy: bool  # Auto-deploy if validation passes
    enabled: bool = True

@dataclass
class RetrainingJob:
    """Retraining job information"""
    job_id: str
    model_name: str
    trigger: RetrainingTrigger
    trigger_reason: str
    config: RetrainingConfig
    status: ModelStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    metrics: Optional[ModelPerformanceMetrics] = None
    error_message: Optional[str] = None

class AutomatedRetrainingService:
    """Service for automated model retraining"""
    
    def __init__(self, redis_url: str = "redis://localhost:6379",
                 model_storage_path: str = "models/"):
        self.redis_url = redis_url
        self.model_storage_path = Path(model_storage_path)
        self.redis_client = None
        self.retraining_configs = {}
        self.active_jobs = {}
        self.job_history = []
        self.is_monitoring = False
        self.monitoring_interval = 300  # 5 minutes
        
        # Initialize default configurations
        self._initialize_default_configs()
        
    async def initialize(self):
        """Initialize automated retraining service"""
        try:
            self.redis_client = await aioredis.from_url(self.redis_url)
            
            # Load configurations from Redis
            await self._load_retraining_configs()
            
            # Create model storage directory
            self.model_storage_path.mkdir(parents=True, exist_ok=True)
            
            logger.info("Automated retraining service initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize retraining service: {e}")
            
    async def close(self):
        """Close automated retraining service"""
        if self.redis_client:
            await self.redis_client.close()
        self.is_monitoring = False
        
    def _initialize_default_configs(self):
        """Initialize default retraining configurations"""
        
        # Spending prediction model
        self.retraining_configs["spending_predictor"] = RetrainingConfig(
            model_name="spending_predictor",
            performance_threshold=0.85,  # 85% accuracy threshold
            drift_threshold=0.3,  # 30% drift threshold
            min_data_points=10000,
            retraining_schedule="0 2 * * 0",  # Weekly at 2 AM Sunday
            max_training_time=7200,  # 2 hours
            validation_split=0.2,
            auto_deploy=True
        )
        
        # Anomaly detection model
        self.retraining_configs["anomaly_detector"] = RetrainingConfig(
            model_name="anomaly_detector",
            performance_threshold=0.90,  # 90% accuracy threshold
            drift_threshold=0.25,
            min_data_points=5000,
            retraining_schedule="0 3 * * 1",  # Weekly at 3 AM Monday
            max_training_time=3600,  # 1 hour
            validation_split=0.15,
            auto_deploy=True
        )
        
        # Risk assessment model
        self.retraining_configs["risk_assessor"] = RetrainingConfig(
            model_name="risk_assessor",
            performance_threshold=0.88,
            drift_threshold=0.2,
            min_data_points=8000,
            retraining_schedule="0 1 1 * *",  # Monthly at 1 AM on 1st
            max_training_time=5400,  # 1.5 hours
            validation_split=0.25,
            auto_deploy=False  # Manual deployment for risk models
        )
        
        # Budget optimizer model
        self.retraining_configs["budget_optimizer"] = RetrainingConfig(
            model_name="budget_optimizer",
            performance_threshold=0.82,
            drift_threshold=0.35,
            min_data_points=15000,
            retraining_schedule="0 4 * * 3",  # Weekly at 4 AM Wednesday
            max_training_time=4800,  # 80 minutes
            validation_split=0.2,
            auto_deploy=True
        )
    
    async def _load_retraining_configs(self):
        """Load retraining configurations from Redis"""
        try:
            if self.redis_client:
                configs_data = await self.redis_client.get("retraining_configs")
                if configs_data:
                    configs_dict = json.loads(configs_data)
                    for config_name, config_data in configs_dict.items():
                        self.retraining_configs[config_name] = RetrainingConfig(**config_data)
                    logger.info(f"Loaded {len(configs_dict)} retraining configs from Redis")
        except Exception as e:
            logger.error(f"Error loading retraining configs: {e}")
    
    async def _save_retraining_configs(self):
        """Save retraining configurations to Redis"""
        try:
            if self.redis_client:
                configs_dict = {
                    name: asdict(config) for name, config in self.retraining_configs.items()
                }
                await self.redis_client.set("retraining_configs", json.dumps(configs_dict, default=str))
        except Exception as e:
            logger.error(f"Error saving retraining configs: {e}")
    
    async def get_model_performance(self, model_name: str) -> Optional[ModelPerformanceMetrics]:
        """Get current model performance metrics"""
        try:
            if self.redis_client:
                metrics_data = await self.redis_client.get(f"model_metrics:{model_name}")
                if metrics_data:
                    metrics_dict = json.loads(metrics_data)
                    return ModelPerformanceMetrics(**metrics_dict)
            
            # If no metrics in Redis, return simulated metrics
            return self._simulate_model_metrics(model_name)
            
        except Exception as e:
            logger.error(f"Error getting model performance for {model_name}: {e}")
            return None
    
    def _simulate_model_metrics(self, model_name: str) -> ModelPerformanceMetrics:
        """Simulate model metrics for testing"""
        import random
        
        # Base metrics with some variation
        base_accuracy = 0.85
        variation = random.uniform(-0.1, 0.05)  # Slight degradation bias
        
        return ModelPerformanceMetrics(
            model_name=model_name,
            version="v1.0",
            accuracy=max(0.6, min(0.95, base_accuracy + variation)),
            precision=max(0.6, min(0.95, 0.83 + variation)),
            recall=max(0.6, min(0.95, 0.87 + variation)),
            f1_score=max(0.6, min(0.95, 0.85 + variation)),
            auc_roc=max(0.6, min(0.95, 0.89 + variation)),
            avg_latency_ms=random.uniform(50, 200),
            throughput_rps=random.uniform(100, 500),
            error_rate=random.uniform(0.01, 0.05),
            data_points=random.randint(5000, 50000),
            timestamp=datetime.now()
        )
    
    async def check_performance_degradation(self, model_name: str) -> Tuple[bool, str]:
        """Check if model performance has degraded"""
        try:
            config = self.retraining_configs.get(model_name)
            if not config or not config.enabled:
                return False, "Model not configured for monitoring"
            
            metrics = await self.get_model_performance(model_name)
            if not metrics:
                return False, "No performance metrics available"
            
            # Check accuracy threshold
            if metrics.accuracy < config.performance_threshold:
                return True, f"Accuracy ({metrics.accuracy:.3f}) below threshold ({config.performance_threshold})"
            
            # Check error rate
            if metrics.error_rate > 0.1:  # 10% error rate threshold
                return True, f"High error rate ({metrics.error_rate:.3f})"
            
            # Check latency
            if metrics.avg_latency_ms > 1000:  # 1 second threshold
                return True, f"High latency ({metrics.avg_latency_ms:.0f}ms)"
            
            return False, "Performance within acceptable limits"
            
        except Exception as e:
            logger.error(f"Error checking performance degradation for {model_name}: {e}")
            return False, f"Error: {e}"
    
    async def check_data_drift(self, model_name: str) -> Tuple[bool, str]:
        """Check for data drift"""
        try:
            # In a real implementation, this would analyze feature distributions
            # For now, we'll simulate drift detection
            
            import random
            drift_score = random.uniform(0.0, 0.5)
            
            config = self.retraining_configs.get(model_name)
            if not config:
                return False, "Model not configured"
            
            if drift_score > config.drift_threshold:
                return True, f"Data drift detected (score: {drift_score:.3f})"
            
            return False, f"No significant drift (score: {drift_score:.3f})"
            
        except Exception as e:
            logger.error(f"Error checking data drift for {model_name}: {e}")
            return False, f"Error: {e}"
    
    async def check_new_data_availability(self, model_name: str) -> Tuple[bool, str]:
        """Check if sufficient new data is available for retraining"""
        try:
            config = self.retraining_configs.get(model_name)
            if not config:
                return False, "Model not configured"
            
            # Simulate checking data availability
            import random
            available_data_points = random.randint(1000, 20000)
            
            if available_data_points >= config.min_data_points:
                return True, f"Sufficient new data available ({available_data_points} points)"
            
            return False, f"Insufficient data ({available_data_points} < {config.min_data_points})"
            
        except Exception as e:
            logger.error(f"Error checking data availability for {model_name}: {e}")
            return False, f"Error: {e}"
    
    async def should_retrain_model(self, model_name: str) -> Tuple[bool, RetrainingTrigger, str]:
        """Determine if a model should be retrained"""
        try:
            # Check performance degradation
            needs_retrain, reason = await self.check_performance_degradation(model_name)
            if needs_retrain:
                return True, RetrainingTrigger.PERFORMANCE_DEGRADATION, reason
            
            # Check data drift
            has_drift, drift_reason = await self.check_data_drift(model_name)
            if has_drift:
                return True, RetrainingTrigger.DATA_DRIFT, drift_reason
            
            # Check new data availability
            has_new_data, data_reason = await self.check_new_data_availability(model_name)
            if has_new_data:
                return True, RetrainingTrigger.NEW_DATA_AVAILABLE, data_reason
            
            return False, RetrainingTrigger.SCHEDULED, "No retraining needed"
            
        except Exception as e:
            logger.error(f"Error determining retraining need for {model_name}: {e}")
            return False, RetrainingTrigger.MANUAL, f"Error: {e}"
    
    async def start_retraining_job(self, model_name: str, trigger: RetrainingTrigger, 
                                 reason: str) -> str:
        """Start a retraining job"""
        try:
            config = self.retraining_configs.get(model_name)
            if not config:
                raise ValueError(f"No configuration found for model: {model_name}")
            
            # Generate job ID
            job_id = f"{model_name}_{int(time.time())}"
            
            # Create retraining job
            job = RetrainingJob(
                job_id=job_id,
                model_name=model_name,
                trigger=trigger,
                trigger_reason=reason,
                config=config,
                status=ModelStatus.TRAINING,
                started_at=datetime.now()
            )
            
            # Store job
            self.active_jobs[job_id] = job
            
            # Start training in background
            asyncio.create_task(self._execute_retraining_job(job))
            
            logger.info(f"Started retraining job {job_id} for {model_name} (trigger: {trigger.value})")
            return job_id
            
        except Exception as e:
            logger.error(f"Error starting retraining job for {model_name}: {e}")
            raise
    
    async def _execute_retraining_job(self, job: RetrainingJob):
        """Execute a retraining job"""
        try:
            logger.info(f"Executing retraining job {job.job_id}")
            
            # Simulate training process
            training_steps = [
                ("Data preparation", 30),
                ("Feature engineering", 45),
                ("Model training", 180),
                ("Validation", 60),
                ("Model evaluation", 30)
            ]
            
            for step_name, duration in training_steps:
                logger.info(f"Job {job.job_id}: {step_name}")
                await asyncio.sleep(duration / 10)  # Accelerated for demo
                
                # Check if job should be cancelled (timeout, etc.)
                elapsed = (datetime.now() - job.started_at).total_seconds()
                if elapsed > job.config.max_training_time:
                    job.status = ModelStatus.FAILED
                    job.error_message = "Training timeout exceeded"
                    job.completed_at = datetime.now()
                    return
            
            # Simulate training results
            job.status = ModelStatus.VALIDATION
            
            # Generate validation metrics
            import random
            new_accuracy = random.uniform(0.85, 0.95)
            
            job.metrics = ModelPerformanceMetrics(
                model_name=job.model_name,
                version=f"v{int(time.time())}",
                accuracy=new_accuracy,
                precision=random.uniform(0.83, 0.93),
                recall=random.uniform(0.85, 0.95),
                f1_score=random.uniform(0.84, 0.94),
                auc_roc=random.uniform(0.87, 0.97),
                avg_latency_ms=random.uniform(40, 120),
                throughput_rps=random.uniform(150, 600),
                error_rate=random.uniform(0.005, 0.02),
                data_points=random.randint(10000, 50000),
                timestamp=datetime.now()
            )
            
            # Check if validation passes
            if new_accuracy >= job.config.performance_threshold:
                if job.config.auto_deploy:
                    job.status = ModelStatus.DEPLOYMENT_PENDING
                    await self._deploy_model(job)
                else:
                    job.status = ModelStatus.ACTIVE
                    logger.info(f"Job {job.job_id}: Training completed, manual deployment required")
            else:
                job.status = ModelStatus.FAILED
                job.error_message = f"Validation failed: accuracy {new_accuracy:.3f} < threshold {job.config.performance_threshold}"
            
            job.completed_at = datetime.now()
            
            # Move to history
            self.job_history.append(job)
            if job.job_id in self.active_jobs:
                del self.active_jobs[job.job_id]
            
            # Store job result in Redis
            if self.redis_client:
                await self.redis_client.lpush(
                    "retraining_jobs", 
                    json.dumps(asdict(job), default=str)
                )
                await self.redis_client.ltrim("retraining_jobs", 0, 999)  # Keep last 1000 jobs
            
            logger.info(f"Completed retraining job {job.job_id} with status: {job.status.value}")
            
        except Exception as e:
            logger.error(f"Error executing retraining job {job.job_id}: {e}")
            job.status = ModelStatus.FAILED
            job.error_message = str(e)
            job.completed_at = datetime.now()
    
    async def _deploy_model(self, job: RetrainingJob):
        """Deploy a trained model"""
        try:
            logger.info(f"Deploying model from job {job.job_id}")
            
            # Simulate deployment process
            await asyncio.sleep(30)  # Deployment time
            
            # Update model metrics in Redis
            if self.redis_client and job.metrics:
                await self.redis_client.set(
                    f"model_metrics:{job.model_name}",
                    json.dumps(asdict(job.metrics), default=str)
                )
            
            job.status = ModelStatus.ACTIVE
            logger.info(f"Successfully deployed model from job {job.job_id}")
            
        except Exception as e:
            logger.error(f"Error deploying model from job {job.job_id}: {e}")
            job.status = ModelStatus.FAILED
            job.error_message = f"Deployment failed: {e}"
    
    async def monitor_models(self):
        """Monitor all configured models for retraining needs"""
        try:
            for model_name, config in self.retraining_configs.items():
                if not config.enabled:
                    continue
                
                # Skip if already training
                if any(job.model_name == model_name and job.status == ModelStatus.TRAINING 
                       for job in self.active_jobs.values()):
                    continue
                
                # Check if retraining is needed
                should_retrain, trigger, reason = await self.should_retrain_model(model_name)
                
                if should_retrain:
                    try:
                        job_id = await self.start_retraining_job(model_name, trigger, reason)
                        logger.info(f"Triggered retraining for {model_name}: {reason}")
                    except Exception as e:
                        logger.error(f"Failed to start retraining for {model_name}: {e}")
                        
        except Exception as e:
            logger.error(f"Error monitoring models: {e}")
    
    async def start_monitoring(self):
        """Start the monitoring loop"""
        self.is_monitoring = True
        logger.info(f"Starting model monitoring with {self.monitoring_interval}s interval")
        
        while self.is_monitoring:
            try:
                await self.monitor_models()
                await asyncio.sleep(self.monitoring_interval)
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(self.monitoring_interval)
    
    def stop_monitoring(self):
        """Stop the monitoring loop"""
        self.is_monitoring = False
        logger.info("Stopped model monitoring")
    
    async def get_retraining_status(self) -> Dict[str, Any]:
        """Get status of all retraining activities"""
        try:
            status = {
                "active_jobs": len(self.active_jobs),
                "completed_jobs": len(self.job_history),
                "monitoring_enabled": self.is_monitoring,
                "configured_models": len(self.retraining_configs),
                "jobs": {}
            }
            
            # Add active jobs
            for job_id, job in self.active_jobs.items():
                status["jobs"][job_id] = {
                    "model_name": job.model_name,
                    "status": job.status.value,
                    "trigger": job.trigger.value,
                    "started_at": job.started_at.isoformat(),
                    "elapsed_seconds": (datetime.now() - job.started_at).total_seconds()
                }
            
            # Add recent completed jobs
            recent_jobs = sorted(self.job_history, key=lambda x: x.completed_at or datetime.min, reverse=True)[:10]
            for job in recent_jobs:
                status["jobs"][job.job_id] = {
                    "model_name": job.model_name,
                    "status": job.status.value,
                    "trigger": job.trigger.value,
                    "started_at": job.started_at.isoformat(),
                    "completed_at": job.completed_at.isoformat() if job.completed_at else None,
                    "error_message": job.error_message
                }
            
            return status
            
        except Exception as e:
            logger.error(f"Error getting retraining status: {e}")
            return {"error": str(e)}
    
    async def trigger_manual_retraining(self, model_name: str, reason: str = "Manual trigger") -> str:
        """Manually trigger retraining for a model"""
        return await self.start_retraining_job(model_name, RetrainingTrigger.MANUAL, reason)
    
    async def cancel_retraining_job(self, job_id: str) -> bool:
        """Cancel an active retraining job"""
        try:
            if job_id in self.active_jobs:
                job = self.active_jobs[job_id]
                job.status = ModelStatus.FAILED
                job.error_message = "Job cancelled by user"
                job.completed_at = datetime.now()
                
                self.job_history.append(job)
                del self.active_jobs[job_id]
                
                logger.info(f"Cancelled retraining job {job_id}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error cancelling job {job_id}: {e}")
            return False

# Global automated retraining service instance
automated_retraining_service = AutomatedRetrainingService()