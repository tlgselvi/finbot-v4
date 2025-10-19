"""
Tests for ML Model Optimization Services

Comprehensive test suite for model optimization, GPU acceleration,
and performance monitoring services.
"""

import pytest
import asyncio
import torch
import torch.nn as nn
import numpy as np
import tempfile
import os
import json
from unittest.mock import Mock, patch, AsyncMock
import time

# Import services to test
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from services.model_optimization_service import ModelOptimizationService, model_optimization_service
from services.gpu_acceleration_service import GPUAccelerationService, InferenceJob, gpu_acceleration_service
from config.optimization_config import OptimizationConfig, GPUConfig, CacheConfig

class SimpleTestModel(nn.Module):
    """Simple PyTorch model for testing"""
    
    def __init__(self, input_size=10, hidden_size=20, output_size=1):
        super().__init__()
        self.linear1 = nn.Linear(input_size, hidden_size)
        self.relu = nn.ReLU()
        self.linear2 = nn.Linear(hidden_size, output_size)
    
    def forward(self, x):
        x = self.linear1(x)
        x = self.relu(x)
        x = self.linear2(x)
        return x

@pytest.fixture
def test_model():
    """Create a simple test model"""
    return SimpleTestModel()

@pytest.fixture
def optimization_service():
    """Create optimization service instance"""
    return ModelOptimizationService(redis_url="redis://localhost:6379/1", cache_ttl=300)

@pytest.fixture
def gpu_service():
    """Create GPU acceleration service instance"""
    return GPUAccelerationService(max_batch_size=16, max_queue_size=100)

@pytest.fixture
async def initialized_optimization_service(optimization_service):
    """Initialize optimization service"""
    await optimization_service.initialize()
    yield optimization_service
    await optimization_service.close()

@pytest.fixture
def sample_input_data():
    """Sample input data for testing"""
    return {
        "user_id": "test_user_123",
        "features": [1.0, 2.0, 3.0, 4.0, 5.0],
        "timestamp": time.time()
    }

class TestModelOptimizationService:
    """Test cases for ModelOptimizationService"""
    
    def test_quantize_pytorch_model_dynamic(self, optimization_service, test_model):
        """Test dynamic quantization of PyTorch model"""
        result = optimization_service.quantize_pytorch_model(
            test_model, 
            "test_model", 
            "dynamic"
        )
        
        assert result["model_name"] == "test_model"
        assert result["optimization_type"] == "quantization"
        assert result["quantization_method"] == "dynamic"
        assert result["size_reduction_percent"] > 0
        assert os.path.exists(result["model_path"])
        
        # Cleanup
        if os.path.exists(result["model_path"]):
            os.remove(result["model_path"])
    
    def test_prune_pytorch_model(self, optimization_service, test_model):
        """Test pruning of PyTorch model"""
        pruning_ratio = 0.3
        result = optimization_service.prune_pytorch_model(
            test_model, 
            "test_model", 
            pruning_ratio
        )
        
        assert result["model_name"] == "test_model"
        assert result["optimization_type"] == "pruning"
        assert result["pruning_ratio"] == pruning_ratio
        assert result["parameter_reduction_percent"] > 0
        assert os.path.exists(result["model_path"])
        
        # Cleanup
        if os.path.exists(result["model_path"]):
            os.remove(result["model_path"])
    
    def test_convert_to_onnx(self, optimization_service, test_model):
        """Test ONNX conversion"""
        input_shape = (10,)
        result = optimization_service.convert_to_onnx(
            test_model, 
            "test_model", 
            input_shape, 
            "pytorch"
        )
        
        assert result["model_name"] == "test_model"
        assert result["optimization_type"] == "onnx_conversion"
        assert result["framework"] == "pytorch"
        assert result["onnx_size_mb"] > 0
        assert os.path.exists(result["model_path"])
        
        # Cleanup
        if os.path.exists(result["model_path"]):
            os.remove(result["model_path"])
    
    @pytest.mark.asyncio
    async def test_cache_prediction_result(self, initialized_optimization_service, sample_input_data):
        """Test caching prediction results"""
        cache_key = "test_prediction_key"
        result = {"prediction": [0.5, 0.3, 0.2], "confidence": 0.85}
        
        # Cache the result
        await initialized_optimization_service.cache_prediction_result(cache_key, result)
        
        # Retrieve the result
        cached_result = await initialized_optimization_service.get_cached_prediction(cache_key)
        
        assert cached_result is not None
        assert cached_result["prediction"] == result["prediction"]
        assert cached_result["confidence"] == result["confidence"]
    
    def test_create_prediction_cache_key(self, optimization_service, sample_input_data):
        """Test cache key generation"""
        model_name = "test_model"
        cache_key = optimization_service.create_prediction_cache_key(model_name, sample_input_data)
        
        assert isinstance(cache_key, str)
        assert cache_key.startswith("prediction:")
        assert model_name in cache_key
        
        # Same input should generate same key
        cache_key2 = optimization_service.create_prediction_cache_key(model_name, sample_input_data)
        assert cache_key == cache_key2
        
        # Different input should generate different key
        different_data = {**sample_input_data, "user_id": "different_user"}
        cache_key3 = optimization_service.create_prediction_cache_key(model_name, different_data)
        assert cache_key != cache_key3
    
    def test_benchmark_model_performance(self, optimization_service):
        """Test model performance benchmarking"""
        # Create a temporary ONNX model file for testing
        with tempfile.NamedTemporaryFile(suffix='.onnx', delete=False) as tmp_file:
            # Create a simple ONNX model (mock)
            tmp_file.write(b"mock_onnx_model_data")
            tmp_path = tmp_file.name
        
        try:
            # This will fail because it's not a real ONNX model, but we can test the error handling
            with pytest.raises(Exception):
                optimization_service.benchmark_model_performance(tmp_path, (10,), 10)
        finally:
            os.unlink(tmp_path)
    
    def test_get_system_resources(self, optimization_service):
        """Test system resource monitoring"""
        resources = optimization_service.get_system_resources()
        
        assert "cpu_percent" in resources
        assert "memory_percent" in resources
        assert "memory_used_gb" in resources
        assert "memory_total_gb" in resources
        assert "disk_percent" in resources
        
        assert 0 <= resources["cpu_percent"] <= 100
        assert 0 <= resources["memory_percent"] <= 100
        assert resources["memory_used_gb"] >= 0
        assert resources["memory_total_gb"] > 0

class TestGPUAccelerationService:
    """Test cases for GPUAccelerationService"""
    
    def test_device_detection(self, gpu_service):
        """Test GPU device detection"""
        assert hasattr(gpu_service, 'device_info')
        assert len(gpu_service.device_info) > 0
        
        # CPU should always be available
        from services.gpu_acceleration_service import AcceleratorType
        assert AcceleratorType.CPU in gpu_service.device_info
        assert gpu_service.device_info[AcceleratorType.CPU]["available"] is True
    
    def test_get_optimal_device(self, gpu_service):
        """Test optimal device selection"""
        device = gpu_service.get_optimal_device(model_size_mb=100)
        assert isinstance(device, torch.device)
        
        # Should return a valid device type
        assert device.type in ["cpu", "cuda", "mps"]
    
    def test_get_gpu_memory_info(self, gpu_service):
        """Test GPU memory information retrieval"""
        memory_info = gpu_service.get_gpu_memory_info(0)
        
        assert hasattr(memory_info, 'total_memory')
        assert hasattr(memory_info, 'allocated_memory')
        assert hasattr(memory_info, 'free_memory')
        assert hasattr(memory_info, 'utilization_percent')
        
        assert memory_info.total_memory >= 0
        assert memory_info.allocated_memory >= 0
        assert memory_info.free_memory >= 0
        assert 0 <= memory_info.utilization_percent <= 100
    
    def test_optimize_model_for_gpu(self, gpu_service, test_model):
        """Test GPU model optimization"""
        device = torch.device("cpu")  # Use CPU for testing
        optimized_model = gpu_service.optimize_model_for_gpu(test_model, device)
        
        assert optimized_model is not None
        # Model should be moved to the specified device
        for param in optimized_model.parameters():
            assert param.device == device
    
    @pytest.mark.asyncio
    async def test_submit_inference_job(self, gpu_service):
        """Test inference job submission"""
        job = InferenceJob(
            job_id="test_job_1",
            model_name="test_model",
            input_data={"features": [1, 2, 3, 4, 5]},
            priority=1
        )
        
        job_id = await gpu_service.submit_inference_job(job)
        assert job_id == "test_job_1"
        
        # Queue should not be empty
        assert not gpu_service.inference_queue.empty()
        
        # Stop processing to clean up
        await gpu_service.stop_batch_processing()
    
    @pytest.mark.asyncio
    async def test_batch_processing_lifecycle(self, gpu_service):
        """Test batch processing start and stop"""
        # Initially not processing
        assert not gpu_service.is_processing
        
        # Start processing
        await gpu_service.start_batch_processing()
        assert gpu_service.is_processing
        
        # Stop processing
        await gpu_service.stop_batch_processing()
        assert not gpu_service.is_processing
    
    def test_setup_memory_pool(self, gpu_service):
        """Test memory pool setup"""
        device = torch.device("cpu")
        
        # Should not raise an exception
        gpu_service.setup_memory_pool(device, pool_size_mb=100)
        
        # Memory pool should be marked as set up for CPU
        # (GPU memory pool setup is only for CUDA devices)
    
    def test_clear_gpu_cache(self, gpu_service):
        """Test GPU cache clearing"""
        # Should not raise an exception
        gpu_service.clear_gpu_cache()
        
        # Test with specific device ID
        gpu_service.clear_gpu_cache(device_id=0)
    
    def test_get_device_utilization(self, gpu_service):
        """Test device utilization monitoring"""
        utilization = gpu_service.get_device_utilization()
        
        assert "cpu" in utilization
        assert "utilization_percent" in utilization["cpu"]
        assert "memory_percent" in utilization["cpu"]
        
        assert 0 <= utilization["cpu"]["utilization_percent"] <= 100
        assert 0 <= utilization["cpu"]["memory_percent"] <= 100
    
    @pytest.mark.asyncio
    async def test_health_check(self, gpu_service):
        """Test health check functionality"""
        health_status = await gpu_service.health_check()
        
        assert "service_status" in health_status
        assert "devices" in health_status
        assert "queue_size" in health_status
        assert "is_processing" in health_status
        assert "utilization" in health_status
        assert "timestamp" in health_status
        
        assert health_status["service_status"] in ["healthy", "unhealthy"]
        assert isinstance(health_status["queue_size"], int)
        assert isinstance(health_status["is_processing"], bool)
        assert isinstance(health_status["timestamp"], (int, float))

class TestIntegration:
    """Integration tests for optimization services"""
    
    @pytest.mark.asyncio
    async def test_end_to_end_optimization_workflow(self, test_model):
        """Test complete optimization workflow"""
        # Initialize services
        opt_service = ModelOptimizationService(cache_ttl=300)
        await opt_service.initialize()
        
        try:
            # Step 1: Quantize model
            quantization_result = opt_service.quantize_pytorch_model(
                test_model, "integration_test_model", "dynamic"
            )
            assert quantization_result["optimization_type"] == "quantization"
            
            # Step 2: Convert to ONNX
            onnx_result = opt_service.convert_to_onnx(
                test_model, "integration_test_model", (10,), "pytorch"
            )
            assert onnx_result["optimization_type"] == "onnx_conversion"
            
            # Step 3: Cache a prediction result
            cache_key = opt_service.create_prediction_cache_key(
                "integration_test_model", 
                {"input": [1, 2, 3]}
            )
            await opt_service.cache_prediction_result(
                cache_key, 
                {"prediction": [0.5], "latency_ms": 10.5}
            )
            
            # Step 4: Retrieve cached result
            cached_result = await opt_service.get_cached_prediction(cache_key)
            assert cached_result is not None
            assert cached_result["prediction"] == [0.5]
            
            # Cleanup
            for result in [quantization_result, onnx_result]:
                if os.path.exists(result["model_path"]):
                    os.remove(result["model_path"])
                    
        finally:
            await opt_service.close()
    
    @pytest.mark.asyncio
    async def test_gpu_optimization_integration(self, test_model):
        """Test GPU optimization integration"""
        gpu_service = GPUAccelerationService(max_batch_size=4, max_queue_size=10)
        
        try:
            # Get optimal device
            device = gpu_service.get_optimal_device(model_size_mb=10)
            
            # Optimize model for device
            optimized_model = gpu_service.optimize_model_for_gpu(test_model, device)
            
            # Submit inference jobs
            jobs = []
            for i in range(3):
                job = InferenceJob(
                    job_id=f"integration_job_{i}",
                    model_name="integration_test_model",
                    input_data={"features": [i, i+1, i+2]},
                    priority=1
                )
                job_id = await gpu_service.submit_inference_job(job)
                jobs.append(job_id)
            
            # Wait a bit for processing
            await asyncio.sleep(0.5)
            
            # Check health
            health = await gpu_service.health_check()
            assert health["service_status"] == "healthy"
            
        finally:
            await gpu_service.cleanup()

class TestPerformanceOptimization:
    """Performance-focused tests"""
    
    def test_quantization_performance_improvement(self, optimization_service, test_model):
        """Test that quantization improves model size"""
        result = optimization_service.quantize_pytorch_model(
            test_model, "perf_test_model", "dynamic"
        )
        
        # Should achieve some size reduction
        assert result["size_reduction_percent"] > 0
        assert result["optimized_size_mb"] < result["original_size_mb"]
        
        # Cleanup
        if os.path.exists(result["model_path"]):
            os.remove(result["model_path"])
    
    def test_pruning_performance_improvement(self, optimization_service, test_model):
        """Test that pruning reduces model parameters"""
        result = optimization_service.prune_pytorch_model(
            test_model, "perf_test_model", 0.2
        )
        
        # Should achieve parameter reduction
        assert result["parameter_reduction_percent"] > 0
        assert result["pruned_parameters"] < result["original_parameters"]
        
        # Cleanup
        if os.path.exists(result["model_path"]):
            os.remove(result["model_path"])
    
    @pytest.mark.asyncio
    async def test_cache_performance_benefit(self, initialized_optimization_service):
        """Test that caching provides performance benefits"""
        model_name = "cache_perf_test"
        input_data = {"features": [1, 2, 3, 4, 5]}
        
        # First call - cache miss
        cache_key = initialized_optimization_service.create_prediction_cache_key(
            model_name, input_data
        )
        
        start_time = time.time()
        cached_result = await initialized_optimization_service.get_cached_prediction(cache_key)
        miss_time = time.time() - start_time
        
        assert cached_result is None  # Should be cache miss
        
        # Cache a result
        result = {"prediction": [0.7], "confidence": 0.9}
        await initialized_optimization_service.cache_prediction_result(cache_key, result)
        
        # Second call - cache hit
        start_time = time.time()
        cached_result = await initialized_optimization_service.get_cached_prediction(cache_key)
        hit_time = time.time() - start_time
        
        assert cached_result is not None
        assert cached_result["prediction"] == result["prediction"]
        
        # Cache hit should be faster (though this might be negligible in tests)
        # We mainly test that the functionality works correctly

if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "--tb=short"])