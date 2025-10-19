"""
Resource Optimization Service

This service provides cost-effective resource management for ML operations,
including compute optimization, storage management, and cost analysis.
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
import psutil

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ResourceType(Enum):
    """Types of resources to optimize"""
    CPU = "cpu"
    MEMORY = "memory"
    GPU = "gpu"
    STORAGE = "storage"
    NETWORK = "network"

class OptimizationStrategy(Enum):
    """Resource optimization strategies"""
    COST_OPTIMIZED = "cost_optimized"
    PERFORMANCE_OPTIMIZED = "performance_optimized"
    BALANCED = "balanced"
    GREEN_COMPUTING = "green_computing"

@dataclass
class ResourceUsage:
    """Resource usage information"""
    resource_type: ResourceType
    current_usage: float
    peak_usage: float
    average_usage: float
    allocated_capacity: float
    utilization_percent: float
    cost_per_hour: float
    timestamp: datetime

@dataclass
class OptimizationRecommendation:
    """Resource optimization recommendation"""
    resource_type: ResourceType
    service_name: str
    current_allocation: float
    recommended_allocation: float
    potential_savings_percent: float
    potential_savings_usd_monthly: float
    impact_description: str
    confidence_score: float
    implementation_effort: str  # low, medium, high

@dataclass
class CostAnalysis:
    """Cost analysis for resources"""
    service_name: str
    daily_cost_usd: float
    monthly_cost_usd: float
    yearly_cost_usd: float
    cost_breakdown: Dict[str, float]
    efficiency_score: float
    waste_percentage: float

class ResourceOptimizationService:
    """Service for optimizing resource usage and costs"""
    
    def __init__(self, redis_url: str = "redis://localhost:6379"):
        self.redis_url = redis_url
        self.redis_client = None
        self.resource_usage_history = {}
        self.optimization_recommendations = []
        self.cost_tracking = {}
        self.is_monitoring = False
        self.monitoring_interval = 300  # 5 minutes
        
        # Resource pricing (simplified, per hour in USD)
        self.resource_pricing = {
            ResourceType.CPU: 0.05,  # per vCPU hour
            ResourceType.MEMORY: 0.01,  # per GB hour
            ResourceType.GPU: 2.50,  # per GPU hour
            ResourceType.STORAGE: 0.0001,  # per GB hour
            ResourceType.NETWORK: 0.001  # per GB transferred
        }
        
    async def initialize(self):
        """Initialize resource optimization service"""
        try:
            self.redis_client = await aioredis.from_url(self.redis_url)
            
            # Load historical data
            await self._load_usage_history()
            
            logger.info("Resource optimization service initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize resource optimization service: {e}")
            
    async def close(self):
        """Close resource optimization service"""
        if self.redis_client:
            await self.redis_client.close()
        self.is_monitoring = False
        
    async def _load_usage_history(self):
        """Load resource usage history from Redis"""
        try:
            if self.redis_client:
                history_data = await self.redis_client.get("resource_usage_history")
                if history_data:
                    self.resource_usage_history = json.loads(history_data)
                    logger.info("Loaded resource usage history from Redis")
        except Exception as e:
            logger.error(f"Error loading usage history: {e}")
    
    async def _save_usage_history(self):
        """Save resource usage history to Redis"""
        try:
            if self.redis_client:
                await self.redis_client.set(
                    "resource_usage_history", 
                    json.dumps(self.resource_usage_history, default=str)
                )
        except Exception as e:
            logger.error(f"Error saving usage history: {e}")
    
    async def collect_resource_usage(self, service_name: str) -> Dict[ResourceType, ResourceUsage]:
        """Collect current resource usage for a service"""
        try:
            current_time = datetime.now()
            usage_data = {}
            
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            cpu_count = psutil.cpu_count()
            
            usage_data[ResourceType.CPU] = ResourceUsage(
                resource_type=ResourceType.CPU,
                current_usage=cpu_percent,
                peak_usage=min(100.0, cpu_percent * 1.2),  # Simulated peak
                average_usage=cpu_percent * 0.8,  # Simulated average
                allocated_capacity=cpu_count * 100,  # 100% per CPU
                utilization_percent=cpu_percent,
                cost_per_hour=cpu_count * self.resource_pricing[ResourceType.CPU],
                timestamp=current_time
            )
            
            # Memory usage
            memory = psutil.virtual_memory()
            memory_gb = memory.total / (1024**3)
            memory_used_gb = memory.used / (1024**3)
            
            usage_data[ResourceType.MEMORY] = ResourceUsage(
                resource_type=ResourceType.MEMORY,
                current_usage=memory_used_gb,
                peak_usage=memory_used_gb * 1.1,  # Simulated peak
                average_usage=memory_used_gb * 0.9,  # Simulated average
                allocated_capacity=memory_gb,
                utilization_percent=memory.percent,
                cost_per_hour=memory_gb * self.resource_pricing[ResourceType.MEMORY],
                timestamp=current_time
            )
            
            # GPU usage (if available)
            try:
                import GPUtil
                gpus = GPUtil.getGPUs()
                if gpus:
                    gpu = gpus[0]  # Use first GPU for simplicity
                    usage_data[ResourceType.GPU] = ResourceUsage(
                        resource_type=ResourceType.GPU,
                        current_usage=gpu.load * 100,
                        peak_usage=min(100.0, gpu.load * 100 * 1.15),
                        average_usage=gpu.load * 100 * 0.85,
                        allocated_capacity=100.0,
                        utilization_percent=gpu.load * 100,
                        cost_per_hour=self.resource_pricing[ResourceType.GPU],
                        timestamp=current_time
                    )
            except ImportError:
                pass  # GPU monitoring not available
            
            # Storage usage
            disk = psutil.disk_usage('/')
            storage_gb = disk.total / (1024**3)
            storage_used_gb = disk.used / (1024**3)
            
            usage_data[ResourceType.STORAGE] = ResourceUsage(
                resource_type=ResourceType.STORAGE,
                current_usage=storage_used_gb,
                peak_usage=storage_used_gb,  # Storage doesn't have peaks like CPU
                average_usage=storage_used_gb,
                allocated_capacity=storage_gb,
                utilization_percent=disk.percent,
                cost_per_hour=storage_gb * self.resource_pricing[ResourceType.STORAGE],
                timestamp=current_time
            )
            
            # Store usage history
            if service_name not in self.resource_usage_history:
                self.resource_usage_history[service_name] = []
            
            self.resource_usage_history[service_name].append({
                "timestamp": current_time.isoformat(),
                "usage": {rt.value: asdict(usage) for rt, usage in usage_data.items()}
            })
            
            # Keep only last 24 hours of data
            cutoff_time = current_time - timedelta(hours=24)
            self.resource_usage_history[service_name] = [
                entry for entry in self.resource_usage_history[service_name]
                if datetime.fromisoformat(entry["timestamp"]) > cutoff_time
            ]
            
            return usage_data
            
        except Exception as e:
            logger.error(f"Error collecting resource usage for {service_name}: {e}")
            return {}
    
    def analyze_usage_patterns(self, service_name: str) -> Dict[str, Any]:
        """Analyze usage patterns for a service"""
        try:
            if service_name not in self.resource_usage_history:
                return {"error": "No usage history available"}
            
            history = self.resource_usage_history[service_name]
            if not history:
                return {"error": "Empty usage history"}
            
            analysis = {}
            
            # Analyze each resource type
            for resource_type in ResourceType:
                resource_data = []
                for entry in history:
                    if resource_type.value in entry["usage"]:
                        usage = entry["usage"][resource_type.value]
                        resource_data.append({
                            "timestamp": entry["timestamp"],
                            "utilization": usage["utilization_percent"],
                            "cost": usage["cost_per_hour"]
                        })
                
                if resource_data:
                    utilizations = [d["utilization"] for d in resource_data]
                    costs = [d["cost"] for d in resource_data]
                    
                    analysis[resource_type.value] = {
                        "avg_utilization": sum(utilizations) / len(utilizations),
                        "max_utilization": max(utilizations),
                        "min_utilization": min(utilizations),
                        "avg_cost_per_hour": sum(costs) / len(costs),
                        "total_cost_24h": sum(costs),
                        "data_points": len(resource_data),
                        "efficiency_score": self._calculate_efficiency_score(utilizations),
                        "waste_percentage": self._calculate_waste_percentage(utilizations)
                    }
            
            return analysis
            
        except Exception as e:
            logger.error(f"Error analyzing usage patterns for {service_name}: {e}")
            return {"error": str(e)}
    
    def _calculate_efficiency_score(self, utilizations: List[float]) -> float:
        """Calculate efficiency score based on utilization patterns"""
        if not utilizations:
            return 0.0
        
        avg_util = sum(utilizations) / len(utilizations)
        
        # Optimal utilization is around 70-80%
        if 70 <= avg_util <= 80:
            return 100.0
        elif 60 <= avg_util < 70 or 80 < avg_util <= 90:
            return 85.0
        elif 50 <= avg_util < 60 or 90 < avg_util <= 95:
            return 70.0
        else:
            return max(0.0, 50.0 - abs(avg_util - 75))
    
    def _calculate_waste_percentage(self, utilizations: List[float]) -> float:
        """Calculate resource waste percentage"""
        if not utilizations:
            return 0.0
        
        avg_util = sum(utilizations) / len(utilizations)
        
        # Waste is the unused capacity
        return max(0.0, 100.0 - avg_util)
    
    async def generate_optimization_recommendations(self, service_name: str, 
                                                 strategy: OptimizationStrategy = OptimizationStrategy.BALANCED) -> List[OptimizationRecommendation]:
        """Generate optimization recommendations for a service"""
        try:
            recommendations = []
            
            # Analyze current usage patterns
            analysis = self.analyze_usage_patterns(service_name)
            if "error" in analysis:
                return recommendations
            
            # Generate recommendations for each resource type
            for resource_type_str, resource_analysis in analysis.items():
                resource_type = ResourceType(resource_type_str)
                
                avg_util = resource_analysis["avg_utilization"]
                max_util = resource_analysis["max_utilization"]
                waste_pct = resource_analysis["waste_percentage"]
                
                # Determine optimization based on strategy and utilization
                recommendation = self._generate_resource_recommendation(
                    resource_type, service_name, avg_util, max_util, waste_pct, strategy
                )
                
                if recommendation:
                    recommendations.append(recommendation)
            
            self.optimization_recommendations.extend(recommendations)
            return recommendations
            
        except Exception as e:
            logger.error(f"Error generating recommendations for {service_name}: {e}")
            return []
    
    def _generate_resource_recommendation(self, resource_type: ResourceType, service_name: str,
                                        avg_util: float, max_util: float, waste_pct: float,
                                        strategy: OptimizationStrategy) -> Optional[OptimizationRecommendation]:
        """Generate recommendation for a specific resource type"""
        try:
            current_allocation = 100.0  # Simplified - assume 100% allocation
            recommended_allocation = current_allocation
            
            # Determine recommendation based on utilization and strategy
            if strategy == OptimizationStrategy.COST_OPTIMIZED:
                # Aggressive cost optimization
                if avg_util < 50:
                    recommended_allocation = current_allocation * 0.7
                elif avg_util < 70:
                    recommended_allocation = current_allocation * 0.85
            
            elif strategy == OptimizationStrategy.PERFORMANCE_OPTIMIZED:
                # Ensure headroom for performance
                if max_util > 80:
                    recommended_allocation = current_allocation * 1.3
                elif avg_util > 70:
                    recommended_allocation = current_allocation * 1.15
            
            elif strategy == OptimizationStrategy.BALANCED:
                # Balance cost and performance
                if avg_util < 40:
                    recommended_allocation = current_allocation * 0.8
                elif avg_util > 85:
                    recommended_allocation = current_allocation * 1.2
            
            elif strategy == OptimizationStrategy.GREEN_COMPUTING:
                # Optimize for energy efficiency
                if avg_util < 60:
                    recommended_allocation = current_allocation * 0.75
            
            # Calculate potential savings
            if recommended_allocation != current_allocation:
                savings_percent = abs(current_allocation - recommended_allocation) / current_allocation * 100
                
                # Estimate monthly savings (simplified)
                base_cost = self.resource_pricing[resource_type] * 24 * 30  # Monthly cost
                savings_usd = base_cost * (savings_percent / 100)
                
                # Determine implementation effort
                effort = "low" if savings_percent < 20 else "medium" if savings_percent < 50 else "high"
                
                # Calculate confidence score
                confidence = min(95.0, 60.0 + (waste_pct / 2))  # Higher waste = higher confidence
                
                return OptimizationRecommendation(
                    resource_type=resource_type,
                    service_name=service_name,
                    current_allocation=current_allocation,
                    recommended_allocation=recommended_allocation,
                    potential_savings_percent=savings_percent,
                    potential_savings_usd_monthly=savings_usd,
                    impact_description=self._get_impact_description(resource_type, recommended_allocation > current_allocation),
                    confidence_score=confidence,
                    implementation_effort=effort
                )
            
            return None
            
        except Exception as e:
            logger.error(f"Error generating recommendation for {resource_type}: {e}")
            return None
    
    def _get_impact_description(self, resource_type: ResourceType, is_scale_up: bool) -> str:
        """Get impact description for a recommendation"""
        action = "increase" if is_scale_up else "reduce"
        
        descriptions = {
            ResourceType.CPU: f"Will {action} compute capacity and processing speed",
            ResourceType.MEMORY: f"Will {action} memory availability and caching capability",
            ResourceType.GPU: f"Will {action} ML inference speed and parallel processing",
            ResourceType.STORAGE: f"Will {action} data storage capacity",
            ResourceType.NETWORK: f"Will {action} network bandwidth and data transfer speed"
        }
        
        return descriptions.get(resource_type, f"Will {action} {resource_type.value} resources")
    
    async def calculate_cost_analysis(self, service_name: str) -> CostAnalysis:
        """Calculate comprehensive cost analysis for a service"""
        try:
            # Get current resource usage
            usage_data = await self.collect_resource_usage(service_name)
            
            # Calculate costs
            daily_costs = {}
            total_daily_cost = 0.0
            
            for resource_type, usage in usage_data.items():
                daily_cost = usage.cost_per_hour * 24
                daily_costs[resource_type.value] = daily_cost
                total_daily_cost += daily_cost
            
            # Calculate efficiency and waste
            analysis = self.analyze_usage_patterns(service_name)
            
            avg_efficiency = 0.0
            avg_waste = 0.0
            
            if "error" not in analysis:
                efficiencies = [data.get("efficiency_score", 0) for data in analysis.values()]
                wastes = [data.get("waste_percentage", 0) for data in analysis.values()]
                
                avg_efficiency = sum(efficiencies) / len(efficiencies) if efficiencies else 0
                avg_waste = sum(wastes) / len(wastes) if wastes else 0
            
            return CostAnalysis(
                service_name=service_name,
                daily_cost_usd=total_daily_cost,
                monthly_cost_usd=total_daily_cost * 30,
                yearly_cost_usd=total_daily_cost * 365,
                cost_breakdown=daily_costs,
                efficiency_score=avg_efficiency,
                waste_percentage=avg_waste
            )
            
        except Exception as e:
            logger.error(f"Error calculating cost analysis for {service_name}: {e}")
            return CostAnalysis(
                service_name=service_name,
                daily_cost_usd=0.0,
                monthly_cost_usd=0.0,
                yearly_cost_usd=0.0,
                cost_breakdown={},
                efficiency_score=0.0,
                waste_percentage=0.0
            )
    
    async def monitor_resources(self):
        """Monitor resources for all services"""
        try:
            services = ["ml-model-serving", "gpu-inference", "api-gateway", "redis-cache", "database"]
            
            for service_name in services:
                # Collect usage data
                await self.collect_resource_usage(service_name)
                
                # Generate recommendations periodically (every hour)
                current_time = datetime.now()
                if current_time.minute == 0:  # Top of the hour
                    recommendations = await self.generate_optimization_recommendations(service_name)
                    if recommendations:
                        logger.info(f"Generated {len(recommendations)} optimization recommendations for {service_name}")
            
            # Save usage history
            await self._save_usage_history()
            
        except Exception as e:
            logger.error(f"Error monitoring resources: {e}")
    
    async def start_monitoring(self):
        """Start resource monitoring loop"""
        self.is_monitoring = True
        logger.info(f"Starting resource monitoring with {self.monitoring_interval}s interval")
        
        while self.is_monitoring:
            try:
                await self.monitor_resources()
                await asyncio.sleep(self.monitoring_interval)
            except Exception as e:
                logger.error(f"Error in monitoring loop: {e}")
                await asyncio.sleep(self.monitoring_interval)
    
    def stop_monitoring(self):
        """Stop resource monitoring"""
        self.is_monitoring = False
        logger.info("Stopped resource monitoring")
    
    async def get_optimization_summary(self) -> Dict[str, Any]:
        """Get summary of optimization opportunities"""
        try:
            services = ["ml-model-serving", "gpu-inference", "api-gateway", "redis-cache", "database"]
            
            summary = {
                "total_services": len(services),
                "total_recommendations": len(self.optimization_recommendations),
                "potential_monthly_savings": 0.0,
                "services": {},
                "top_recommendations": []
            }
            
            # Analyze each service
            for service_name in services:
                cost_analysis = await self.calculate_cost_analysis(service_name)
                recommendations = await self.generate_optimization_recommendations(service_name)
                
                service_savings = sum(rec.potential_savings_usd_monthly for rec in recommendations)
                summary["potential_monthly_savings"] += service_savings
                
                summary["services"][service_name] = {
                    "monthly_cost": cost_analysis.monthly_cost_usd,
                    "efficiency_score": cost_analysis.efficiency_score,
                    "waste_percentage": cost_analysis.waste_percentage,
                    "recommendations_count": len(recommendations),
                    "potential_savings": service_savings
                }
            
            # Get top recommendations
            all_recommendations = []
            for service_name in services:
                recommendations = await self.generate_optimization_recommendations(service_name)
                all_recommendations.extend(recommendations)
            
            # Sort by potential savings
            top_recommendations = sorted(
                all_recommendations, 
                key=lambda x: x.potential_savings_usd_monthly, 
                reverse=True
            )[:5]
            
            summary["top_recommendations"] = [
                {
                    "service": rec.service_name,
                    "resource_type": rec.resource_type.value,
                    "potential_savings": rec.potential_savings_usd_monthly,
                    "confidence": rec.confidence_score,
                    "impact": rec.impact_description
                }
                for rec in top_recommendations
            ]
            
            return summary
            
        except Exception as e:
            logger.error(f"Error getting optimization summary: {e}")
            return {"error": str(e)}
    
    async def implement_recommendation(self, recommendation_id: str) -> bool:
        """Implement an optimization recommendation"""
        try:
            # In a real implementation, this would call APIs to actually resize resources
            # For now, we'll simulate the implementation
            
            logger.info(f"Implementing optimization recommendation {recommendation_id}")
            
            # Simulate implementation delay
            await asyncio.sleep(5)
            
            # Mark as implemented (in practice, you'd track this properly)
            logger.info(f"Successfully implemented recommendation {recommendation_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error implementing recommendation {recommendation_id}: {e}")
            return False

# Global resource optimization service instance
resource_optimization_service = ResourceOptimizationService()