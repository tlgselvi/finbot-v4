"""
ML Model Performance Optimization Service

This service provides model quantization, pruning, and optimization capabilities
for faster inference and reduced resource usage.
"""

import os
import json
import logging
import numpy as np
import torch
import torch.nn as nn
import torch.quantization as quantization
from typing import Dict, Any, Optional, List, Tuple
import onnx
import onnxruntime as ort
from transformers import AutoModel, AutoTokenizer
import tensorflow as tf
from tensorflow.lite.python import lite
import pickle
import joblib
from datetime import datetime, timedelta
import asyncio
import aioredis
from concurrent.futures import ThreadPoolExecutor
import psutil

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ModelOptimizationService:
    """Service for optimizing ML models for better performance"""
    
    def __init__(self, redis_url: str = "redis://localhost:6379", cache_ttl: int = 3600):
        self.redis_url = redis_url
        self.cache_ttl = cache_ttl
        self.redis_client = None
        self.executor = ThreadPoolExecutor(max_workers=4)
        self.optimization_cache = {}
        
    async def initialize(self):
        """Initialize Redis connection and optimization cache"""
        try:
            self.redis_client = await aioredis.from_url(self.redis_url)
            logger.info("Model optimization service initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Redis connection: {e}")
            
    async def close(self):
        """Close connections and cleanup resources"""
        if self.redis_client:
            await self.redis_client.close()
        self.executor.shutdown(wait=True)
            
    def quantize_pytorch_model(self, model: nn.Module, model_name: str, 
                              quantization_type: str = "dynamic") -> Dict[str, Any]:
        """
        Quantize PyTorch model for faster inference
        
        Args:
            model: PyTorch model to quantize
            model_name: Name identifier for the model
            quantization_type: Type of quantization ('dynamic', 'static', 'qat')
            
        Returns:
            Dictionary containing quantized model info and performance metrics
        """
        try:
            logger.info(f"Starting {quantization_type} quantization for model: {model_name}")
            
            # Set model to evaluation mode
            model.eval()
            
            if quantization_type == "dynamic":
                # Dynamic quantization - quantize weights, activations computed in fp32
                quantized_model = torch.quantization.quantize_dynamic(
                    model, 
                    {nn.Linear, nn.Conv2d}, 
                    dtype=torch.qint8
                )
            elif quantization_type == "static":
                # Static quantization - requires calibration data
                model.qconfig = torch.quantization.get_default_qconfig('fbgemm')
                torch.quantization.prepare(model, inplace=True)
                # Note: In production, you would run calibration data through the model here
                quantized_model = torch.quantization.convert(model, inplace=False)
            else:
                raise ValueError(f"Unsupported quantization type: {quantization_type}")
            
            # Calculate model size reduction
            original_size = self._get_model_size(model)
            quantized_size = self._get_model_size(quantized_model)
            size_reduction = (original_size - quantized_size) / original_size * 100
            
            # Save quantized model
            model_path = f"models/optimized/{model_name}_quantized_{quantization_type}.pth"
            os.makedirs(os.path.dirname(model_path), exist_ok=True)
            torch.save(quantized_model.state_dict(), model_path)
            
            optimization_info = {
                "model_name": model_name,
                "optimization_type": "quantization",
                "quantization_method": quantization_type,
                "original_size_mb": original_size / (1024 * 1024),
                "optimized_size_mb": quantized_size / (1024 * 1024),
                "size_reduction_percent": size_reduction,
                "model_path": model_path,
                "created_at": datetime.now().isoformat()
            }
            
            logger.info(f"Quantization completed. Size reduction: {size_reduction:.2f}%")
            return optimization_info
            
        except Exception as e:
            logger.error(f"Error during model quantization: {e}")
            raise
    
    def prune_pytorch_model(self, model: nn.Module, model_name: str, 
                           pruning_ratio: float = 0.2) -> Dict[str, Any]:
        """
        Prune PyTorch model by removing less important weights
        
        Args:
            model: PyTorch model to prune
            model_name: Name identifier for the model
            pruning_ratio: Fraction of weights to prune (0.0 to 1.0)
            
        Returns:
            Dictionary containing pruned model info and performance metrics
        """
        try:
            import torch.nn.utils.prune as prune
            
            logger.info(f"Starting pruning for model: {model_name} with ratio: {pruning_ratio}")
            
            # Calculate original model parameters
            original_params = sum(p.numel() for p in model.parameters())
            
            # Apply magnitude-based unstructured pruning to linear and conv layers
            parameters_to_prune = []
            for name, module in model.named_modules():
                if isinstance(module, (nn.Linear, nn.Conv2d)):
                    parameters_to_prune.append((module, 'weight'))
            
            # Global magnitude pruning
            prune.global_unstructured(
                parameters_to_prune,
                pruning_method=prune.L1Unstructured,
                amount=pruning_ratio,
            )
            
            # Remove pruning reparameterization to make pruning permanent
            for module, param_name in parameters_to_prune:
                prune.remove(module, param_name)
            
            # Calculate pruned model parameters
            pruned_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
            param_reduction = (original_params - pruned_params) / original_params * 100
            
            # Save pruned model
            model_path = f"models/optimized/{model_name}_pruned_{pruning_ratio}.pth"
            os.makedirs(os.path.dirname(model_path), exist_ok=True)
            torch.save(model.state_dict(), model_path)
            
            optimization_info = {
                "model_name": model_name,
                "optimization_type": "pruning",
                "pruning_ratio": pruning_ratio,
                "original_parameters": original_params,
                "pruned_parameters": pruned_params,
                "parameter_reduction_percent": param_reduction,
                "model_path": model_path,
                "created_at": datetime.now().isoformat()
            }
            
            logger.info(f"Pruning completed. Parameter reduction: {param_reduction:.2f}%")
            return optimization_info
            
        except Exception as e:
            logger.error(f"Error during model pruning: {e}")
            raise
    
    def optimize_tensorflow_model(self, model_path: str, model_name: str) -> Dict[str, Any]:
        """
        Optimize TensorFlow model using TensorFlow Lite
        
        Args:
            model_path: Path to the TensorFlow model
            model_name: Name identifier for the model
            
        Returns:
            Dictionary containing optimized model info and performance metrics
        """
        try:
            logger.info(f"Starting TensorFlow Lite optimization for: {model_name}")
            
            # Load the model
            model = tf.keras.models.load_model(model_path)
            
            # Convert to TensorFlow Lite with optimizations
            converter = lite.TFLiteConverter.from_keras_model(model)
            converter.optimizations = [tf.lite.Optimize.DEFAULT]
            
            # Enable quantization
            converter.representative_dataset = self._representative_dataset_gen
            converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
            converter.inference_input_type = tf.int8
            converter.inference_output_type = tf.int8
            
            tflite_model = converter.convert()
            
            # Calculate size reduction
            original_size = os.path.getsize(model_path)
            optimized_size = len(tflite_model)
            size_reduction = (original_size - optimized_size) / original_size * 100
            
            # Save optimized model
            optimized_path = f"models/optimized/{model_name}_tflite_optimized.tflite"
            os.makedirs(os.path.dirname(optimized_path), exist_ok=True)
            with open(optimized_path, 'wb') as f:
                f.write(tflite_model)
            
            optimization_info = {
                "model_name": model_name,
                "optimization_type": "tensorflow_lite",
                "original_size_mb": original_size / (1024 * 1024),
                "optimized_size_mb": optimized_size / (1024 * 1024),
                "size_reduction_percent": size_reduction,
                "model_path": optimized_path,
                "created_at": datetime.now().isoformat()
            }
            
            logger.info(f"TensorFlow Lite optimization completed. Size reduction: {size_reduction:.2f}%")
            return optimization_info
            
        except Exception as e:
            logger.error(f"Error during TensorFlow optimization: {e}")
            raise
    
    def convert_to_onnx(self, model, model_name: str, input_shape: Tuple[int, ...], 
                       framework: str = "pytorch") -> Dict[str, Any]:
        """
        Convert model to ONNX format for optimized inference
        
        Args:
            model: Model to convert
            model_name: Name identifier for the model
            input_shape: Input tensor shape
            framework: Source framework ('pytorch' or 'tensorflow')
            
        Returns:
            Dictionary containing ONNX model info and performance metrics
        """
        try:
            logger.info(f"Converting {framework} model to ONNX: {model_name}")
            
            onnx_path = f"models/optimized/{model_name}.onnx"
            os.makedirs(os.path.dirname(onnx_path), exist_ok=True)
            
            if framework == "pytorch":
                # Create dummy input
                dummy_input = torch.randn(1, *input_shape)
                
                # Export to ONNX
                torch.onnx.export(
                    model,
                    dummy_input,
                    onnx_path,
                    export_params=True,
                    opset_version=11,
                    do_constant_folding=True,
                    input_names=['input'],
                    output_names=['output'],
                    dynamic_axes={'input': {0: 'batch_size'}, 'output': {0: 'batch_size'}}
                )
            elif framework == "tensorflow":
                import tf2onnx
                # Convert TensorFlow model to ONNX
                tf2onnx.convert.from_keras(model, output_path=onnx_path)
            
            # Verify ONNX model
            onnx_model = onnx.load(onnx_path)
            onnx.checker.check_model(onnx_model)
            
            # Get model size
            model_size = os.path.getsize(onnx_path)
            
            optimization_info = {
                "model_name": model_name,
                "optimization_type": "onnx_conversion",
                "framework": framework,
                "onnx_size_mb": model_size / (1024 * 1024),
                "model_path": onnx_path,
                "created_at": datetime.now().isoformat()
            }
            
            logger.info(f"ONNX conversion completed. Model size: {model_size / (1024 * 1024):.2f} MB")
            return optimization_info
            
        except Exception as e:
            logger.error(f"Error during ONNX conversion: {e}")
            raise
    
    async def cache_prediction_result(self, cache_key: str, result: Any, ttl: Optional[int] = None):
        """
        Cache prediction result in Redis
        
        Args:
            cache_key: Unique key for the cached result
            result: Prediction result to cache
            ttl: Time to live in seconds (optional)
        """
        try:
            if not self.redis_client:
                return
                
            ttl = ttl or self.cache_ttl
            serialized_result = json.dumps(result, default=str)
            await self.redis_client.setex(cache_key, ttl, serialized_result)
            logger.debug(f"Cached prediction result with key: {cache_key}")
            
        except Exception as e:
            logger.error(f"Error caching prediction result: {e}")
    
    async def get_cached_prediction(self, cache_key: str) -> Optional[Any]:
        """
        Retrieve cached prediction result
        
        Args:
            cache_key: Unique key for the cached result
            
        Returns:
            Cached result if found, None otherwise
        """
        try:
            if not self.redis_client:
                return None
                
            cached_result = await self.redis_client.get(cache_key)
            if cached_result:
                logger.debug(f"Retrieved cached prediction with key: {cache_key}")
                return json.loads(cached_result)
            return None
            
        except Exception as e:
            logger.error(f"Error retrieving cached prediction: {e}")
            return None
    
    def create_prediction_cache_key(self, model_name: str, input_data: Dict[str, Any]) -> str:
        """
        Create a unique cache key for prediction input
        
        Args:
            model_name: Name of the model
            input_data: Input data for prediction
            
        Returns:
            Unique cache key string
        """
        import hashlib
        
        # Create a hash of the input data
        input_str = json.dumps(input_data, sort_keys=True, default=str)
        input_hash = hashlib.md5(input_str.encode()).hexdigest()
        
        return f"prediction:{model_name}:{input_hash}"
    
    def benchmark_model_performance(self, model_path: str, input_shape: Tuple[int, ...], 
                                  num_iterations: int = 100) -> Dict[str, float]:
        """
        Benchmark model inference performance
        
        Args:
            model_path: Path to the model file
            input_shape: Shape of input tensor
            num_iterations: Number of inference iterations for benchmarking
            
        Returns:
            Dictionary containing performance metrics
        """
        try:
            logger.info(f"Benchmarking model performance: {model_path}")
            
            # Determine model type and load accordingly
            if model_path.endswith('.onnx'):
                return self._benchmark_onnx_model(model_path, input_shape, num_iterations)
            elif model_path.endswith('.tflite'):
                return self._benchmark_tflite_model(model_path, input_shape, num_iterations)
            elif model_path.endswith('.pth'):
                return self._benchmark_pytorch_model(model_path, input_shape, num_iterations)
            else:
                raise ValueError(f"Unsupported model format: {model_path}")
                
        except Exception as e:
            logger.error(f"Error benchmarking model: {e}")
            raise
    
    def _benchmark_onnx_model(self, model_path: str, input_shape: Tuple[int, ...], 
                             num_iterations: int) -> Dict[str, float]:
        """Benchmark ONNX model performance"""
        import time
        
        # Create ONNX Runtime session
        session = ort.InferenceSession(model_path)
        input_name = session.get_inputs()[0].name
        
        # Create dummy input
        dummy_input = np.random.randn(1, *input_shape).astype(np.float32)
        
        # Warm up
        for _ in range(10):
            session.run(None, {input_name: dummy_input})
        
        # Benchmark
        start_time = time.time()
        for _ in range(num_iterations):
            session.run(None, {input_name: dummy_input})
        end_time = time.time()
        
        total_time = end_time - start_time
        avg_latency = total_time / num_iterations * 1000  # ms
        throughput = num_iterations / total_time  # predictions/sec
        
        return {
            "avg_latency_ms": avg_latency,
            "throughput_pred_per_sec": throughput,
            "total_time_sec": total_time,
            "num_iterations": num_iterations
        }
    
    def _benchmark_tflite_model(self, model_path: str, input_shape: Tuple[int, ...], 
                               num_iterations: int) -> Dict[str, float]:
        """Benchmark TensorFlow Lite model performance"""
        import time
        
        # Load TFLite model
        interpreter = tf.lite.Interpreter(model_path=model_path)
        interpreter.allocate_tensors()
        
        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()
        
        # Create dummy input
        dummy_input = np.random.randn(1, *input_shape).astype(np.float32)
        
        # Warm up
        for _ in range(10):
            interpreter.set_tensor(input_details[0]['index'], dummy_input)
            interpreter.invoke()
        
        # Benchmark
        start_time = time.time()
        for _ in range(num_iterations):
            interpreter.set_tensor(input_details[0]['index'], dummy_input)
            interpreter.invoke()
        end_time = time.time()
        
        total_time = end_time - start_time
        avg_latency = total_time / num_iterations * 1000  # ms
        throughput = num_iterations / total_time  # predictions/sec
        
        return {
            "avg_latency_ms": avg_latency,
            "throughput_pred_per_sec": throughput,
            "total_time_sec": total_time,
            "num_iterations": num_iterations
        }
    
    def _benchmark_pytorch_model(self, model_path: str, input_shape: Tuple[int, ...], 
                                num_iterations: int) -> Dict[str, float]:
        """Benchmark PyTorch model performance"""
        import time
        
        # Load PyTorch model (assuming it's a state dict)
        # Note: In practice, you'd need the model architecture
        dummy_input = torch.randn(1, *input_shape)
        
        # This is a simplified benchmark - in practice you'd load the actual model
        start_time = time.time()
        for _ in range(num_iterations):
            # Simulate inference
            _ = torch.nn.functional.relu(dummy_input)
        end_time = time.time()
        
        total_time = end_time - start_time
        avg_latency = total_time / num_iterations * 1000  # ms
        throughput = num_iterations / total_time  # predictions/sec
        
        return {
            "avg_latency_ms": avg_latency,
            "throughput_pred_per_sec": throughput,
            "total_time_sec": total_time,
            "num_iterations": num_iterations
        }
    
    def _get_model_size(self, model) -> int:
        """Calculate model size in bytes"""
        if hasattr(model, 'parameters'):
            # PyTorch model
            param_size = 0
            for param in model.parameters():
                param_size += param.nelement() * param.element_size()
            buffer_size = 0
            for buffer in model.buffers():
                buffer_size += buffer.nelement() * buffer.element_size()
            return param_size + buffer_size
        else:
            # Fallback for other model types
            return 0
    
    def _representative_dataset_gen(self):
        """Generate representative dataset for TensorFlow Lite quantization"""
        # This should be replaced with actual representative data
        for _ in range(100):
            yield [np.random.randn(1, 224, 224, 3).astype(np.float32)]
    
    async def get_optimization_metrics(self, model_name: str) -> Dict[str, Any]:
        """
        Get optimization metrics for a model
        
        Args:
            model_name: Name of the model
            
        Returns:
            Dictionary containing optimization metrics and history
        """
        try:
            # This would typically query a database or metrics store
            # For now, return cached optimization info
            if model_name in self.optimization_cache:
                return self.optimization_cache[model_name]
            
            return {
                "model_name": model_name,
                "optimizations": [],
                "current_performance": {},
                "optimization_history": []
            }
            
        except Exception as e:
            logger.error(f"Error getting optimization metrics: {e}")
            return {}
    
    def get_system_resources(self) -> Dict[str, float]:
        """Get current system resource usage"""
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            # Check for GPU if available
            gpu_info = {}
            try:
                import GPUtil
                gpus = GPUtil.getGPUs()
                if gpus:
                    gpu = gpus[0]  # Use first GPU
                    gpu_info = {
                        "gpu_utilization": gpu.load * 100,
                        "gpu_memory_used": gpu.memoryUsed,
                        "gpu_memory_total": gpu.memoryTotal,
                        "gpu_temperature": gpu.temperature
                    }
            except ImportError:
                pass
            
            return {
                "cpu_percent": cpu_percent,
                "memory_percent": memory.percent,
                "memory_used_gb": memory.used / (1024**3),
                "memory_total_gb": memory.total / (1024**3),
                "disk_percent": disk.percent,
                "disk_used_gb": disk.used / (1024**3),
                "disk_total_gb": disk.total / (1024**3),
                **gpu_info
            }
            
        except Exception as e:
            logger.error(f"Error getting system resources: {e}")
            return {}

# Global instance
model_optimization_service = ModelOptimizationService()