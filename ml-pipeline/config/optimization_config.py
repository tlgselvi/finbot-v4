"""
ML Model Optimization Configuration

Configuration settings for model optimization, GPU acceleration,
and performance monitoring services.
"""

import os
from dataclasses import dataclass
from typing import Dict, List, Optional, Any
from enum import Enum

class OptimizationType(Enum):
    """Types of model optimizations"""
    QUANTIZATION = "quantization"
    PRUNING = "pruning"
    ONNX_CONVERSION = "onnx_conversion"
    TENSORFLOW_LITE = "tensorflow_lite"
    TENSORRT = "tensorrt"

class QuantizationType(Enum):
    """Types of quantization"""
    DYNAMIC = "dynamic"
    STATIC = "static"
    QAT = "qat"  # Quantization Aware Training

@dataclass
class OptimizationConfig:
    """Configuration for model optimization"""
    
    # General settings
    enabled: bool = True
    max_concurrent_optimizations: int = 3
    optimization_timeout_minutes: int = 30
    
    # Quantization settings
    quantization_enabled: bool = True
    default_quantization_type: QuantizationType = QuantizationType.DYNAMIC
    quantization_backends: List[str] = None
    
    # Pruning settings
    pruning_enabled: bool = True
    default_pruning_ratio: float = 0.2
    max_pruning_ratio: float = 0.8
    pruning_methods: List[str] = None
    
    # ONNX settings
    onnx_enabled: bool = True
    onnx_opset_version: int = 11
    onnx_optimization_level: str = "all"
    
    # TensorFlow Lite settings
    tflite_enabled: bool = True
    tflite_quantization: bool = True
    tflite_optimization: bool = True
    
    # TensorRT settings
    tensorrt_enabled: bool = False
    tensorrt_fp16: bool = True
    tensorrt_workspace_size: int = 1 << 30  # 1GB
    
    def __post_init__(self):
        if self.quantization_backends is None:
            self.quantization_backends = ["fbgemm", "qnnpack"]
        
        if self.pruning_methods is None:
            self.pruning_methods = ["magnitude", "structured"]

@dataclass
class GPUConfig:
    """Configuration for GPU acceleration"""
    
    # General GPU settings
    enabled: bool = True
    auto_detect_devices: bool = True
    preferred_device_type: str = "cuda"  # cuda, mps, cpu
    
    # Memory management
    memory_fraction: float = 0.8
    memory_pool_enabled: bool = True
    memory_pool_size_mb: int = 1024
    auto_clear_cache: bool = True
    cache_clear_threshold: float = 0.9
    
    # Batch processing
    max_batch_size: int = 32
    batch_timeout_ms: int = 100
    max_queue_size: int = 1000
    
    # Performance optimization
    cudnn_benchmark: bool = True
    cudnn_deterministic: bool = False
    mixed_precision: bool = True
    compile_models: bool = True
    
    # TensorRT specific
    tensorrt_enabled: bool = False
    tensorrt_precision: str = "fp16"  # fp32, fp16, int8
    tensorrt_max_workspace_size: int = 1 << 30  # 1GB

@dataclass
class CacheConfig:
    """Configuration for prediction caching"""
    
    # Redis settings
    redis_url: str = "redis://localhost:6379"
    redis_db: int = 0
    redis_password: Optional[str] = None
    
    # Cache behavior
    enabled: bool = True
    default_ttl_seconds: int = 3600  # 1 hour
    max_cache_size_mb: int = 1024  # 1GB
    
    # Cache keys
    key_prefix: str = "ml_prediction"
    include_model_version: bool = True
    include_input_hash: bool = True
    
    # Eviction policy
    eviction_policy: str = "lru"  # lru, lfu, random
    eviction_threshold: float = 0.9
    
    # Performance
    compression_enabled: bool = True
    compression_algorithm: str = "gzip"  # gzip, lz4, snappy

@dataclass
class MonitoringConfig:
    """Configuration for performance monitoring"""
    
    # Metrics collection
    enabled: bool = True
    collection_interval_seconds: int = 30
    retention_hours: int = 168  # 1 week
    
    # System metrics
    collect_cpu_metrics: bool = True
    collect_memory_metrics: bool = True
    collect_gpu_metrics: bool = True
    collect_disk_metrics: bool = True
    
    # ML metrics
    collect_inference_metrics: bool = True
    collect_model_metrics: bool = True
    collect_cache_metrics: bool = True
    
    # Alerting
    alerting_enabled: bool = True
    latency_threshold_ms: float = 1000.0
    error_rate_threshold: float = 0.05  # 5%
    memory_threshold: float = 0.9  # 90%
    
    # Storage
    metrics_backend: str = "prometheus"  # prometheus, influxdb, custom
    metrics_endpoint: Optional[str] = None

@dataclass
class ModelConfig:
    """Configuration for specific models"""
    
    name: str
    type: str  # pytorch, tensorflow, onnx, etc.
    path: str
    input_shape: tuple
    
    # Optimization preferences
    preferred_optimizations: List[OptimizationType] = None
    optimization_priority: int = 1  # 1-10, higher is more important
    
    # Performance requirements
    max_latency_ms: Optional[float] = None
    min_throughput: Optional[float] = None
    max_memory_mb: Optional[float] = None
    
    # Device preferences
    preferred_device: Optional[str] = None
    allow_cpu_fallback: bool = True
    
    def __post_init__(self):
        if self.preferred_optimizations is None:
            self.preferred_optimizations = [
                OptimizationType.QUANTIZATION,
                OptimizationType.ONNX_CONVERSION
            ]

class OptimizationConfigManager:
    """Manager for optimization configurations"""
    
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or os.getenv("OPTIMIZATION_CONFIG_PATH", "config/optimization.yaml")
        self.optimization_config = OptimizationConfig()
        self.gpu_config = GPUConfig()
        self.cache_config = CacheConfig()
        self.monitoring_config = MonitoringConfig()
        self.model_configs: Dict[str, ModelConfig] = {}
        
        self._load_config()
    
    def _load_config(self):
        """Load configuration from file or environment variables"""
        try:
            # Load from environment variables
            self._load_from_env()
            
            # Load from config file if exists
            if os.path.exists(self.config_path):
                self._load_from_file()
                
        except Exception as e:
            print(f"Warning: Failed to load configuration: {e}")
            print("Using default configuration")
    
    def _load_from_env(self):
        """Load configuration from environment variables"""
        
        # Optimization config
        self.optimization_config.enabled = os.getenv("OPTIMIZATION_ENABLED", "true").lower() == "true"
        self.optimization_config.max_concurrent_optimizations = int(
            os.getenv("MAX_CONCURRENT_OPTIMIZATIONS", "3")
        )
        
        # GPU config
        self.gpu_config.enabled = os.getenv("GPU_ENABLED", "true").lower() == "true"
        self.gpu_config.memory_fraction = float(os.getenv("GPU_MEMORY_FRACTION", "0.8"))
        self.gpu_config.max_batch_size = int(os.getenv("GPU_MAX_BATCH_SIZE", "32"))
        
        # Cache config
        self.cache_config.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        self.cache_config.enabled = os.getenv("CACHE_ENABLED", "true").lower() == "true"
        self.cache_config.default_ttl_seconds = int(os.getenv("CACHE_TTL_SECONDS", "3600"))
        
        # Monitoring config
        self.monitoring_config.enabled = os.getenv("MONITORING_ENABLED", "true").lower() == "true"
        self.monitoring_config.collection_interval_seconds = int(
            os.getenv("MONITORING_INTERVAL_SECONDS", "30")
        )
    
    def _load_from_file(self):
        """Load configuration from YAML file"""
        try:
            import yaml
            
            with open(self.config_path, 'r') as f:
                config_data = yaml.safe_load(f)
            
            # Update configurations with file data
            if 'optimization' in config_data:
                self._update_config(self.optimization_config, config_data['optimization'])
            
            if 'gpu' in config_data:
                self._update_config(self.gpu_config, config_data['gpu'])
            
            if 'cache' in config_data:
                self._update_config(self.cache_config, config_data['cache'])
            
            if 'monitoring' in config_data:
                self._update_config(self.monitoring_config, config_data['monitoring'])
            
            if 'models' in config_data:
                for model_name, model_data in config_data['models'].items():
                    self.model_configs[model_name] = ModelConfig(
                        name=model_name,
                        **model_data
                    )
                    
        except ImportError:
            print("Warning: PyYAML not installed, skipping file configuration")
        except Exception as e:
            print(f"Warning: Failed to load config file: {e}")
    
    def _update_config(self, config_obj, config_data):
        """Update configuration object with data from dict"""
        for key, value in config_data.items():
            if hasattr(config_obj, key):
                setattr(config_obj, key, value)
    
    def get_model_config(self, model_name: str) -> Optional[ModelConfig]:
        """Get configuration for a specific model"""
        return self.model_configs.get(model_name)
    
    def add_model_config(self, model_config: ModelConfig):
        """Add configuration for a model"""
        self.model_configs[model_config.name] = model_config
    
    def get_optimization_config(self) -> OptimizationConfig:
        """Get optimization configuration"""
        return self.optimization_config
    
    def get_gpu_config(self) -> GPUConfig:
        """Get GPU configuration"""
        return self.gpu_config
    
    def get_cache_config(self) -> CacheConfig:
        """Get cache configuration"""
        return self.cache_config
    
    def get_monitoring_config(self) -> MonitoringConfig:
        """Get monitoring configuration"""
        return self.monitoring_config
    
    def validate_config(self) -> List[str]:
        """Validate configuration and return list of issues"""
        issues = []
        
        # Validate optimization config
        if self.optimization_config.default_pruning_ratio > self.optimization_config.max_pruning_ratio:
            issues.append("Default pruning ratio cannot be greater than max pruning ratio")
        
        if self.optimization_config.max_concurrent_optimizations <= 0:
            issues.append("Max concurrent optimizations must be positive")
        
        # Validate GPU config
        if not 0 < self.gpu_config.memory_fraction <= 1:
            issues.append("GPU memory fraction must be between 0 and 1")
        
        if self.gpu_config.max_batch_size <= 0:
            issues.append("Max batch size must be positive")
        
        # Validate cache config
        if self.cache_config.default_ttl_seconds <= 0:
            issues.append("Cache TTL must be positive")
        
        if not 0 < self.cache_config.eviction_threshold <= 1:
            issues.append("Cache eviction threshold must be between 0 and 1")
        
        # Validate monitoring config
        if self.monitoring_config.collection_interval_seconds <= 0:
            issues.append("Monitoring collection interval must be positive")
        
        if not 0 <= self.monitoring_config.error_rate_threshold <= 1:
            issues.append("Error rate threshold must be between 0 and 1")
        
        return issues
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary"""
        return {
            "optimization": self.optimization_config.__dict__,
            "gpu": self.gpu_config.__dict__,
            "cache": self.cache_config.__dict__,
            "monitoring": self.monitoring_config.__dict__,
            "models": {name: config.__dict__ for name, config in self.model_configs.items()}
        }

# Global configuration instance
config_manager = OptimizationConfigManager()

# Convenience functions
def get_optimization_config() -> OptimizationConfig:
    return config_manager.get_optimization_config()

def get_gpu_config() -> GPUConfig:
    return config_manager.get_gpu_config()

def get_cache_config() -> CacheConfig:
    return config_manager.get_cache_config()

def get_monitoring_config() -> MonitoringConfig:
    return config_manager.get_monitoring_config()

def get_model_config(model_name: str) -> Optional[ModelConfig]:
    return config_manager.get_model_config(model_name)