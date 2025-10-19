"""
Auto-Scaling Service for ML Infrastructure

This service provides automated scaling capabilities for ML inference services,
resource optimization, and cost management based on demand and performance metrics.
"""

import asyncio
import logging
import time
import json
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from enum import Enum
import aiohttp
import aioredis
import psutil
import math

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ScalingAction(Enum):
    """Types of scaling actions"""
    SCALE_UP = "scale_up"
    SCALE_DOWN = "scale_down"
    NO_ACTION = "no_action"

class ResourceType(Enum):
    """Types of resources to scale"""
    CPU = "cpu"
    MEMORY = "memory"
    GPU = "gpu"
    REPLICAS = "replicas"

@dataclass
class ScalingMetrics:
    """Metrics used for scaling decisions"""
    cpu_utilization: float
    memory_utilization: float
    gpu_utilization: float
    request_rate: float
    response_time_p95: float
    error_rate: float
    queue_length: int
    active_connections: int
    timestamp: datetime

@dataclass
class ScalingRule:
    """Rule for automated scaling"""
    name: str
    service_name: str
    metric_name: str
    threshold_up: float
    threshold_down: float
    scale_up_factor: float
    scale_down_factor: float
    min_replicas: int
    max_replicas: int
    cooldown_period: int  # seconds
    enabled: bool = True

@dataclass
class ScalingEvent:
    """Record of a scaling event"""
    timestamp: datetime
    service_name: str
    action: ScalingAction
    reason: str
    old_replicas: int
    new_replicas: int
    metrics: ScalingMetrics

class AutoScalingService:
    """Service for automated scaling of ML infrastructure"""
    
    def __init__(self, redis_url: str = "redis://localhost:6379",
                 kubernetes_config: Optional[str] = None):
        self.redis_url = redis_url
        self.kubernetes_config = kubernetes_config
        self.redis_client = None
        self.scaling_rules = {}
        self.scaling_history = []
        self.last_scaling_actions = {}
        self.is_scaling_enabled = True
        self.monitoring_interval = 30  # seconds
        
        # Initialize default scaling rules
        self._initialize_default_rules()
        
    async def initialize(self):
        """Initialize auto-scaling service"""
        try:
            self.redis_client = await aioredis.from_url(self.redis_url)
            
            # Load scaling rules from Redis if available
            await self._load_scaling_rules()
            
            logger.info("Auto-scaling service initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize auto-scaling service: {e}")
            
    async def close(self):
        """Close auto-scaling service"""
        if self.redis_client:
            await self.redis_client.close()
            
    def _initialize_default_rules(self):
        """Initialize default scaling rules"""
        
        # ML Model Serving scaling rules
        self.scaling_rules["ml-model-serving"] = ScalingRule(
            name="ml-model-serving-cpu",
            service_name="ml-model-serving",
            metric_name="cpu_utilization",
            threshold_up=70.0,
            threshold_down=30.0,
            scale_up_factor=1.5,
            scale_down_factor=0.7,
            min_replicas=2,
            max_replicas=20,
            cooldown_period=300  # 5 minutes
        )
        
        # GPU inference scaling rules
        self.scaling_rules["gpu-inference"] = ScalingRule(
            name="gpu-inference-utilization",
            service_name="gpu-inference",
            metric_name="gpu_utilization",
            threshold_up=80.0,
            threshold_down=40.0,
            scale_up_factor=1.3,
            scale_down_factor=0.8,
            min_replicas=1,
            max_replicas=10,
            cooldown_period=600  # 10 minutes (GPU scaling is more expensive)
        )
        
        # API Gateway scaling rules
        self.scaling_rules["api-gateway"] = ScalingRule(
            name="api-gateway-requests",
            service_name="api-gateway",
            metric_name="request_rate",
            threshold_up=1000.0,  # requests per second
            threshold_down=200.0,
            scale_up_factor=1.4,
            scale_down_factor=0.75,
            min_replicas=3,
            max_replicas=15,
            cooldown_period=180  # 3 minutes
        )
        
        # Cache service scaling rules
        self.scaling_rules["redis-cache"] = ScalingRule(
            name="redis-cache-memory",
            service_name="redis-cache",
            metric_name="memory_utilization",
            threshold_up=85.0,
            threshold_down=50.0,
            scale_up_factor=1.2,
            scale_down_factor=0.9,
            min_replicas=2,
            max_replicas=8,
            cooldown_period=900  # 15 minutes
        )
    
    async def _load_scaling_rules(self):
        """Load scaling rules from Redis"""
        try:
            if self.redis_client:
                rules_data = await self.redis_client.get("scaling_rules")
                if rules_data:
                    rules_dict = json.loads(rules_data)
                    for rule_name, rule_data in rules_dict.items():
                        self.scaling_rules[rule_name] = ScalingRule(**rule_data)
                    logger.info(f"Loaded {len(rules_dict)} scaling rules from Redis")
        except Exception as e:
            logger.error(f"Error loading scaling rules: {e}")
    
    async def _save_scaling_rules(self):
        """Save scaling rules to Redis"""
        try:
            if self.redis_client:
                rules_dict = {
                    name: asdict(rule) for name, rule in self.scaling_rules.items()
                }
                await self.redis_client.set("scaling_rules", json.dumps(rules_dict, default=str))
        except Exception as e:
            logger.error(f"Error saving scaling rules: {e}")
    
    async def collect_metrics(self, service_name: str) -> ScalingMetrics:
        """Collect metrics for a specific service"""
        try:
            # In a real implementation, this would query Prometheus or other monitoring systems
            # For now, we'll simulate metrics collection
            
            current_time = datetime.now()
            
            # Simulate metrics based on service type and time patterns
            base_cpu = 50.0
            base_memory = 60.0
            base_gpu = 45.0
            
            # Add some time-based variation (higher load during business hours)
            hour = current_time.hour
            if 9 <= hour <= 17:  # Business hours
                load_multiplier = 1.5
            elif 18 <= hour <= 22:  # Evening peak
                load_multiplier = 1.2
            else:  # Night/early morning
                load_multiplier = 0.7
            
            # Add some randomness
            import random
            random_factor = random.uniform(0.8, 1.2)
            
            metrics = ScalingMetrics(
                cpu_utilization=min(95.0, base_cpu * load_multiplier * random_factor),
                memory_utilization=min(90.0, base_memory * load_multiplier * random_factor),
                gpu_utilization=min(95.0, base_gpu * load_multiplier * random_factor),
                request_rate=max(10.0, 500.0 * load_multiplier * random_factor),
                response_time_p95=max(50.0, 200.0 / load_multiplier * random_factor),
                error_rate=max(0.1, 2.0 / load_multiplier * random_factor),
                queue_length=max(0, int(50 * load_multiplier * random_factor)),
                active_connections=max(10, int(200 * load_multiplier * random_factor)),
                timestamp=current_time
            )
            
            return metrics
            
        except Exception as e:
            logger.error(f"Error collecting metrics for {service_name}: {e}")
            return ScalingMetrics(
                cpu_utilization=0.0, memory_utilization=0.0, gpu_utilization=0.0,
                request_rate=0.0, response_time_p95=0.0, error_rate=0.0,
                queue_length=0, active_connections=0, timestamp=datetime.now()
            )
    
    def should_scale(self, rule: ScalingRule, metrics: ScalingMetrics, 
                    current_replicas: int) -> Tuple[ScalingAction, str]:
        """Determine if scaling action is needed"""
        try:
            # Get the metric value based on rule
            metric_value = getattr(metrics, rule.metric_name.replace('-', '_'), 0.0)
            
            # Check cooldown period
            last_action_time = self.last_scaling_actions.get(rule.service_name)
            if last_action_time:
                time_since_last = (datetime.now() - last_action_time).total_seconds()
                if time_since_last < rule.cooldown_period:
                    return ScalingAction.NO_ACTION, f"Cooldown period active ({time_since_last:.0f}s < {rule.cooldown_period}s)"
            
            # Check scale up conditions
            if metric_value > rule.threshold_up and current_replicas < rule.max_replicas:
                return ScalingAction.SCALE_UP, f"{rule.metric_name} ({metric_value:.1f}) > threshold ({rule.threshold_up})"
            
            # Check scale down conditions
            if metric_value < rule.threshold_down and current_replicas > rule.min_replicas:
                return ScalingAction.SCALE_DOWN, f"{rule.metric_name} ({metric_value:.1f}) < threshold ({rule.threshold_down})"
            
            return ScalingAction.NO_ACTION, f"{rule.metric_name} ({metric_value:.1f}) within thresholds"
            
        except Exception as e:
            logger.error(f"Error determining scaling action: {e}")
            return ScalingAction.NO_ACTION, f"Error: {e}"
    
    def calculate_new_replicas(self, rule: ScalingRule, action: ScalingAction, 
                             current_replicas: int) -> int:
        """Calculate new replica count based on scaling action"""
        try:
            if action == ScalingAction.SCALE_UP:
                new_replicas = math.ceil(current_replicas * rule.scale_up_factor)
                return min(new_replicas, rule.max_replicas)
            elif action == ScalingAction.SCALE_DOWN:
                new_replicas = math.floor(current_replicas * rule.scale_down_factor)
                return max(new_replicas, rule.min_replicas)
            else:
                return current_replicas
                
        except Exception as e:
            logger.error(f"Error calculating new replicas: {e}")
            return current_replicas
    
    async def execute_scaling_action(self, service_name: str, new_replicas: int) -> bool:
        """Execute the scaling action"""
        try:
            # In a real implementation, this would call Kubernetes API or container orchestrator
            # For now, we'll simulate the scaling action
            
            logger.info(f"Scaling {service_name} to {new_replicas} replicas")
            
            # Simulate API call delay
            await asyncio.sleep(1)
            
            # Store the scaling action in Redis for other services to see
            if self.redis_client:
                scaling_info = {
                    "service_name": service_name,
                    "replicas": new_replicas,
                    "timestamp": datetime.now().isoformat()
                }
                await self.redis_client.hset("service_replicas", service_name, json.dumps(scaling_info))
            
            return True
            
        except Exception as e:
            logger.error(f"Error executing scaling action for {service_name}: {e}")
            return False
    
    async def get_current_replicas(self, service_name: str) -> int:
        """Get current replica count for a service"""
        try:
            if self.redis_client:
                replica_info = await self.redis_client.hget("service_replicas", service_name)
                if replica_info:
                    info = json.loads(replica_info)
                    return info.get("replicas", 1)
            
            # Default replica count if not found
            rule = self.scaling_rules.get(service_name)
            return rule.min_replicas if rule else 1
            
        except Exception as e:
            logger.error(f"Error getting current replicas for {service_name}: {e}")
            return 1
    
    async def process_scaling_rules(self):
        """Process all scaling rules and execute actions if needed"""
        try:
            for rule_name, rule in self.scaling_rules.items():
                if not rule.enabled:
                    continue
                
                # Collect metrics for the service
                metrics = await self.collect_metrics(rule.service_name)
                
                # Get current replica count
                current_replicas = await self.get_current_replicas(rule.service_name)
                
                # Determine if scaling is needed
                action, reason = self.should_scale(rule, metrics, current_replicas)
                
                if action != ScalingAction.NO_ACTION:
                    # Calculate new replica count
                    new_replicas = self.calculate_new_replicas(rule, action, current_replicas)
                    
                    if new_replicas != current_replicas:
                        # Execute scaling action
                        success = await self.execute_scaling_action(rule.service_name, new_replicas)
                        
                        if success:
                            # Record scaling event
                            event = ScalingEvent(
                                timestamp=datetime.now(),
                                service_name=rule.service_name,
                                action=action,
                                reason=reason,
                                old_replicas=current_replicas,
                                new_replicas=new_replicas,
                                metrics=metrics
                            )
                            
                            self.scaling_history.append(event)
                            self.last_scaling_actions[rule.service_name] = datetime.now()
                            
                            logger.info(f"Scaled {rule.service_name}: {current_replicas} -> {new_replicas} ({reason})")
                            
                            # Store event in Redis
                            if self.redis_client:
                                await self.redis_client.lpush(
                                    "scaling_events", 
                                    json.dumps(asdict(event), default=str)
                                )
                                await self.redis_client.ltrim("scaling_events", 0, 999)  # Keep last 1000 events
                
        except Exception as e:
            logger.error(f"Error processing scaling rules: {e}")
    
    async def start_auto_scaling(self):
        """Start the auto-scaling loop"""
        logger.info(f"Starting auto-scaling with {self.monitoring_interval}s interval")
        
        while self.is_scaling_enabled:
            try:
                await self.process_scaling_rules()
                await asyncio.sleep(self.monitoring_interval)
            except Exception as e:
                logger.error(f"Error in auto-scaling loop: {e}")
                await asyncio.sleep(self.monitoring_interval)
    
    def stop_auto_scaling(self):
        """Stop the auto-scaling loop"""
        self.is_scaling_enabled = False
        logger.info("Stopped auto-scaling")
    
    async def add_scaling_rule(self, rule: ScalingRule):
        """Add a new scaling rule"""
        self.scaling_rules[rule.name] = rule
        await self._save_scaling_rules()
        logger.info(f"Added scaling rule: {rule.name}")
    
    async def remove_scaling_rule(self, rule_name: str):
        """Remove a scaling rule"""
        if rule_name in self.scaling_rules:
            del self.scaling_rules[rule_name]
            await self._save_scaling_rules()
            logger.info(f"Removed scaling rule: {rule_name}")
    
    async def update_scaling_rule(self, rule_name: str, updates: Dict[str, Any]):
        """Update an existing scaling rule"""
        if rule_name in self.scaling_rules:
            rule = self.scaling_rules[rule_name]
            for key, value in updates.items():
                if hasattr(rule, key):
                    setattr(rule, key, value)
            await self._save_scaling_rules()
            logger.info(f"Updated scaling rule: {rule_name}")
    
    def get_scaling_rules(self) -> Dict[str, ScalingRule]:
        """Get all scaling rules"""
        return self.scaling_rules.copy()
    
    def get_scaling_history(self, limit: int = 100) -> List[ScalingEvent]:
        """Get scaling history"""
        return self.scaling_history[-limit:]
    
    async def get_service_status(self) -> Dict[str, Any]:
        """Get status of all monitored services"""
        try:
            status = {}
            
            for rule_name, rule in self.scaling_rules.items():
                metrics = await self.collect_metrics(rule.service_name)
                current_replicas = await self.get_current_replicas(rule.service_name)
                action, reason = self.should_scale(rule, metrics, current_replicas)
                
                status[rule.service_name] = {
                    "current_replicas": current_replicas,
                    "min_replicas": rule.min_replicas,
                    "max_replicas": rule.max_replicas,
                    "metrics": asdict(metrics),
                    "next_action": action.value,
                    "action_reason": reason,
                    "rule_enabled": rule.enabled
                }
            
            return status
            
        except Exception as e:
            logger.error(f"Error getting service status: {e}")
            return {}
    
    async def predict_scaling_needs(self, hours_ahead: int = 24) -> Dict[str, Any]:
        """Predict future scaling needs based on historical patterns"""
        try:
            predictions = {}
            
            # This is a simplified prediction model
            # In practice, you'd use more sophisticated time series forecasting
            
            current_hour = datetime.now().hour
            
            for rule_name, rule in self.scaling_rules.items():
                current_replicas = await self.get_current_replicas(rule.service_name)
                
                # Predict based on time patterns
                predicted_load = []
                for h in range(hours_ahead):
                    future_hour = (current_hour + h) % 24
                    
                    if 9 <= future_hour <= 17:  # Business hours
                        load_factor = 1.5
                    elif 18 <= future_hour <= 22:  # Evening
                        load_factor = 1.2
                    else:  # Night
                        load_factor = 0.7
                    
                    predicted_replicas = max(
                        rule.min_replicas,
                        min(rule.max_replicas, int(current_replicas * load_factor))
                    )
                    
                    predicted_load.append({
                        "hour": future_hour,
                        "predicted_replicas": predicted_replicas,
                        "load_factor": load_factor
                    })
                
                predictions[rule.service_name] = {
                    "current_replicas": current_replicas,
                    "predictions": predicted_load,
                    "max_predicted": max(p["predicted_replicas"] for p in predicted_load),
                    "min_predicted": min(p["predicted_replicas"] for p in predicted_load)
                }
            
            return predictions
            
        except Exception as e:
            logger.error(f"Error predicting scaling needs: {e}")
            return {}
    
    async def optimize_costs(self) -> Dict[str, Any]:
        """Analyze and suggest cost optimizations"""
        try:
            optimizations = {}
            
            for rule_name, rule in self.scaling_rules.items():
                current_replicas = await self.get_current_replicas(rule.service_name)
                metrics = await self.collect_metrics(rule.service_name)
                
                # Calculate utilization efficiency
                avg_utilization = (
                    metrics.cpu_utilization + 
                    metrics.memory_utilization + 
                    metrics.gpu_utilization
                ) / 3
                
                # Suggest optimizations
                suggestions = []
                
                if avg_utilization < 30 and current_replicas > rule.min_replicas:
                    suggestions.append({
                        "type": "scale_down",
                        "description": f"Low utilization ({avg_utilization:.1f}%), consider scaling down",
                        "potential_savings": f"{(current_replicas - rule.min_replicas) * 100}% cost reduction"
                    })
                
                if metrics.response_time_p95 > 1000:  # 1 second
                    suggestions.append({
                        "type": "scale_up",
                        "description": f"High response time ({metrics.response_time_p95:.0f}ms), consider scaling up",
                        "impact": "Improved user experience"
                    })
                
                if rule.max_replicas > current_replicas * 3:
                    suggestions.append({
                        "type": "adjust_limits",
                        "description": "Max replicas limit seems too high, consider reducing",
                        "potential_savings": "Reduced over-provisioning risk"
                    })
                
                optimizations[rule.service_name] = {
                    "current_state": {
                        "replicas": current_replicas,
                        "utilization": avg_utilization,
                        "response_time": metrics.response_time_p95
                    },
                    "suggestions": suggestions,
                    "efficiency_score": min(100, avg_utilization * 1.5)  # Simplified efficiency score
                }
            
            return optimizations
            
        except Exception as e:
            logger.error(f"Error optimizing costs: {e}")
            return {}

# Global auto-scaling service instance
auto_scaling_service = AutoScalingService()