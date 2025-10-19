"""
Basic tests for ML Model Optimization Services

Simple test suite that doesn't require heavy ML dependencies.
"""

import pytest
import asyncio
import os
import sys
import tempfile
import json
from unittest.mock import Mock, patch, AsyncMock
import time

# Add the parent directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

class TestOptimizationBasics:
    """Basic tests for optimization functionality"""
    
    def test_cache_key_generation(self):
        """Test cache key generation logic"""
        import hashlib
        
        def create_prediction_cache_key(model_name: str, input_data: dict) -> str:
            """Create a unique cache key for prediction input"""
            input_str = json.dumps(input_data, sort_keys=True, default=str)
            input_hash = hashlib.md5(input_str.encode()).hexdigest()
            return f"prediction:{model_name}:{input_hash}"
        
        model_name = "test_model"
        input_data = {"user_id": "test_user", "features": [1, 2, 3]}
        
        cache_key = create_prediction_cache_key(model_name, input_data)
        
        assert isinstance(cache_key, str)
        assert cache_key.startswith("prediction:")
        assert model_name in cache_key
        
        # Same input should generate same key
        cache_key2 = create_prediction_cache_key(model_name, input_data)
        assert cache_key == cache_key2
        
        # Different input should generate different key
        different_data = {**input_data, "user_id": "different_user"}
        cache_key3 = create_prediction_cache_key(model_name, different_data)
        assert cache_key != cache_key3
    
    def test_system_resource_monitoring(self):
        """Test system resource monitoring functionality"""
        try:
            import psutil
            
            def get_system_resources():
                """Get current system resource usage"""
                cpu_percent = psutil.cpu_percent(interval=0.1)
                memory = psutil.virtual_memory()
                disk = psutil.disk_usage('/')
                
                return {
                    "cpu_percent": cpu_percent,
                    "memory_percent": memory.percent,
                    "memory_used_gb": memory.used / (1024**3),
                    "memory_total_gb": memory.total / (1024**3),
                    "disk_percent": disk.percent,
                    "disk_used_gb": disk.used / (1024**3),
                    "disk_total_gb": disk.total / (1024**3)
                }
            
            resources = get_system_resources()
            
            assert "cpu_percent" in resources
            assert "memory_percent" in resources
            assert "memory_used_gb" in resources
            assert "memory_total_gb" in resources
            assert "disk_percent" in resources
            
            assert 0 <= resources["cpu_percent"] <= 100
            assert 0 <= resources["memory_percent"] <= 100
            assert resources["memory_used_gb"] >= 0
            assert resources["memory_total_gb"] > 0
            
        except ImportError:
            pytest.skip("psutil not available")
    
    def test_optimization_config_validation(self):
        """Test optimization configuration validation"""
        
        class OptimizationConfig:
            def __init__(self):
                self.default_pruning_ratio = 0.2
                self.max_pruning_ratio = 0.8
                self.max_concurrent_optimizations = 3
        
        def validate_config(config):
            """Validate configuration and return list of issues"""
            issues = []
            
            if config.default_pruning_ratio > config.max_pruning_ratio:
                issues.append("Default pruning ratio cannot be greater than max pruning ratio")
            
            if config.max_concurrent_optimizations <= 0:
                issues.append("Max concurrent optimizations must be positive")
            
            return issues
        
        # Valid config
        config = OptimizationConfig()
        issues = validate_config(config)
        assert len(issues) == 0
        
        # Invalid config - pruning ratio
        config.default_pruning_ratio = 0.9
        issues = validate_config(config)
        assert len(issues) == 1
        assert "pruning ratio" in issues[0]
        
        # Invalid config - concurrent optimizations
        config.default_pruning_ratio = 0.2
        config.max_concurrent_optimizations = 0
        issues = validate_config(config)
        assert len(issues) == 1
        assert "concurrent optimizations" in issues[0]
    
    def test_performance_metrics_calculation(self):
        """Test performance metrics calculation"""
        
        def calculate_performance_metrics(latencies, throughputs):
            """Calculate performance metrics from measurements"""
            if not latencies or not throughputs:
                return {}
            
            avg_latency = sum(latencies) / len(latencies)
            p95_latency = sorted(latencies)[int(len(latencies) * 0.95)]
            avg_throughput = sum(throughputs) / len(throughputs)
            
            return {
                "avg_latency_ms": avg_latency,
                "p95_latency_ms": p95_latency,
                "avg_throughput": avg_throughput,
                "total_measurements": len(latencies)
            }
        
        # Test with sample data
        latencies = [10.5, 12.3, 9.8, 15.2, 11.1, 13.7, 8.9, 14.5, 10.2, 12.8]
        throughputs = [95.3, 88.7, 102.1, 78.9, 91.5, 85.2, 108.3, 82.1, 97.8, 89.4]
        
        metrics = calculate_performance_metrics(latencies, throughputs)
        
        assert "avg_latency_ms" in metrics
        assert "p95_latency_ms" in metrics
        assert "avg_throughput" in metrics
        assert "total_measurements" in metrics
        
        assert metrics["avg_latency_ms"] > 0
        assert metrics["p95_latency_ms"] >= metrics["avg_latency_ms"]
        assert metrics["avg_throughput"] > 0
        assert metrics["total_measurements"] == len(latencies)
        
        # Test with empty data
        empty_metrics = calculate_performance_metrics([], [])
        assert empty_metrics == {}
    
    def test_model_size_calculation(self):
        """Test model size calculation utilities"""
        
        def format_bytes(bytes_value):
            """Format bytes to human readable format"""
            if bytes_value == 0:
                return '0 B'
            
            k = 1024
            sizes = ['B', 'KB', 'MB', 'GB']
            i = 0
            
            while bytes_value >= k and i < len(sizes) - 1:
                bytes_value /= k
                i += 1
            
            return f"{bytes_value:.2f} {sizes[i]}"
        
        def calculate_size_reduction(original_size, optimized_size):
            """Calculate size reduction percentage"""
            if original_size <= 0:
                return 0
            
            return ((original_size - optimized_size) / original_size) * 100
        
        # Test byte formatting
        assert format_bytes(0) == '0 B'
        assert format_bytes(512) == '512.00 B'
        assert format_bytes(1024) == '1.00 KB'
        assert format_bytes(1024 * 1024) == '1.00 MB'
        assert format_bytes(1024 * 1024 * 1024) == '1.00 GB'
        
        # Test size reduction calculation
        original = 100 * 1024 * 1024  # 100 MB
        optimized = 30 * 1024 * 1024  # 30 MB
        
        reduction = calculate_size_reduction(original, optimized)
        assert reduction == 70.0  # 70% reduction
        
        # Test edge cases
        assert calculate_size_reduction(0, 0) == 0
        assert calculate_size_reduction(100, 100) == 0
        assert calculate_size_reduction(100, 0) == 100
    
    @pytest.mark.asyncio
    async def test_async_cache_operations(self):
        """Test async cache operations simulation"""
        
        class MockCache:
            def __init__(self):
                self.cache = {}
            
            async def set(self, key, value, ttl=None):
                """Set cache value"""
                self.cache[key] = {
                    "value": value,
                    "expires": time.time() + (ttl or 3600)
                }
            
            async def get(self, key):
                """Get cache value"""
                if key in self.cache:
                    entry = self.cache[key]
                    if time.time() < entry["expires"]:
                        return entry["value"]
                    else:
                        del self.cache[key]
                return None
            
            async def delete(self, key):
                """Delete cache entry"""
                if key in self.cache:
                    del self.cache[key]
                    return True
                return False
        
        cache = MockCache()
        
        # Test set and get
        await cache.set("test_key", {"prediction": [0.5, 0.3, 0.2]}, ttl=300)
        result = await cache.get("test_key")
        
        assert result is not None
        assert result["prediction"] == [0.5, 0.3, 0.2]
        
        # Test cache miss
        missing = await cache.get("nonexistent_key")
        assert missing is None
        
        # Test delete
        deleted = await cache.delete("test_key")
        assert deleted is True
        
        # Verify deletion
        result_after_delete = await cache.get("test_key")
        assert result_after_delete is None
    
    def test_device_selection_logic(self):
        """Test device selection logic"""
        
        def get_optimal_device(available_devices, model_size_mb=0):
            """Get optimal device for inference"""
            
            # Mock device info
            devices = {
                "cuda": {"available": "cuda" in available_devices, "memory_gb": 24},
                "mps": {"available": "mps" in available_devices, "memory_gb": 16},
                "cpu": {"available": True, "memory_gb": 32}
            }
            
            # Prefer CUDA if available and model fits
            if devices["cuda"]["available"]:
                if model_size_mb / 1024 < devices["cuda"]["memory_gb"] * 0.8:
                    return "cuda"
            
            # Fallback to MPS if available
            if devices["mps"]["available"]:
                if model_size_mb / 1024 < devices["mps"]["memory_gb"] * 0.8:
                    return "mps"
            
            # Fallback to CPU
            return "cpu"
        
        # Test with CUDA available
        device = get_optimal_device(["cuda", "cpu"], model_size_mb=1000)
        assert device == "cuda"
        
        # Test with large model that doesn't fit in GPU
        device = get_optimal_device(["cuda", "cpu"], model_size_mb=25000)
        assert device == "cpu"
        
        # Test with only MPS available
        device = get_optimal_device(["mps", "cpu"], model_size_mb=1000)
        assert device == "mps"
        
        # Test with only CPU available
        device = get_optimal_device(["cpu"], model_size_mb=1000)
        assert device == "cpu"

class TestOptimizationIntegration:
    """Integration tests for optimization components"""
    
    @pytest.mark.asyncio
    async def test_optimization_workflow_simulation(self):
        """Test complete optimization workflow simulation"""
        
        class MockOptimizationService:
            def __init__(self):
                self.optimizations = []
            
            async def quantize_model(self, model_name, quantization_type="dynamic"):
                """Simulate model quantization"""
                result = {
                    "model_name": model_name,
                    "optimization_type": "quantization",
                    "quantization_method": quantization_type,
                    "original_size_mb": 45.2,
                    "optimized_size_mb": 12.8,
                    "size_reduction_percent": 71.7,
                    "status": "completed",
                    "created_at": time.time()
                }
                self.optimizations.append(result)
                return result
            
            async def prune_model(self, model_name, pruning_ratio=0.2):
                """Simulate model pruning"""
                result = {
                    "model_name": model_name,
                    "optimization_type": "pruning",
                    "pruning_ratio": pruning_ratio,
                    "original_parameters": 1250000,
                    "pruned_parameters": int(1250000 * (1 - pruning_ratio)),
                    "parameter_reduction_percent": pruning_ratio * 100,
                    "status": "completed",
                    "created_at": time.time()
                }
                self.optimizations.append(result)
                return result
            
            def get_optimizations(self):
                """Get all optimizations"""
                return self.optimizations
        
        service = MockOptimizationService()
        
        # Step 1: Quantize model
        quantization_result = await service.quantize_model("test_model", "dynamic")
        assert quantization_result["optimization_type"] == "quantization"
        assert quantization_result["size_reduction_percent"] > 0
        
        # Step 2: Prune model
        pruning_result = await service.prune_model("test_model", 0.3)
        assert pruning_result["optimization_type"] == "pruning"
        assert pruning_result["parameter_reduction_percent"] == 30.0
        
        # Step 3: Verify optimizations are stored
        optimizations = service.get_optimizations()
        assert len(optimizations) == 2
        assert optimizations[0]["model_name"] == "test_model"
        assert optimizations[1]["model_name"] == "test_model"

if __name__ == "__main__":
    pytest.main([__file__, "-v"])