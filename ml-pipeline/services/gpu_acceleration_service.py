"""
GPU Acceleration Service

This service provides GPU acceleration capabilities for compute-intensive ML models,
including CUDA optimization, memory management, and distributed inference.
"""

import os
import logging
import asyncio
import torch
import torch.nn as nn
import torch.cuda as cuda
from typing import Dict, Any, Optional, List, Union
import numpy as np
from concurrent.futures import ThreadPoolExecutor
import queue
import threading
import time
from dataclasses import dataclass
from enum import Enum
import psutil

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AcceleratorType(Enum):
    """Types of hardware accelerators"""
    CPU = "cpu"
    CUDA = "cuda"
    MPS = "mps"  # Apple Metal Performance Shaders
    TENSORRT = "tensorrt"

@dataclass
class GPUMemoryInfo:
    """GPU memory information"""
    total_memory: int
    allocated_memory: int
    cached_memory: int
    free_memory: int
    utilization_percent: float

@dataclass
class InferenceJob:
    """Inference job for GPU processing"""
    job_id: str
    model_name: str
    input_data: Any
    priority: int = 1
    created_at: float = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = time.time()

class GPUAccelerationService:
    """Service for GPU acceleration and optimization"""
    
    def __init__(self, max_batch_size: int = 32, max_queue_size: int = 1000):
        self.max_batch_size = max_batch_size
        self.max_queue_size = max_queue_size
        self.device_info = {}
        self.inference_queue = queue.PriorityQueue(maxsize=max_queue_size)
        self.batch_processor = None
        self.is_processing = False
        self.executor = ThreadPoolExecutor(max_workers=4)
        self.model_cache = {}
        self.memory_pool = {}
        
        # Initialize GPU detection
        self._detect_available_devices()
        
    def _detect_available_devices(self):
        """Detect available GPU devices and their capabilities"""
        try:
            # Check CUDA availability
            if torch.cuda.is_available():
                cuda_devices = []
                for i in range(torch.cuda.device_count()):
                    device_props = torch.cuda.get_device_properties(i)
                    cuda_devices.append({
                        "device_id": i,
                        "name": device_props.name,
                        "total_memory": device_props.total_memory,
                        "major": device_props.major,
                        "minor": device_props.minor,
                        "multi_processor_count": device_props.multi_processor_count,
                        "compute_capability": f"{device_props.major}.{device_props.minor}"
                    })
                
                self.device_info[AcceleratorType.CUDA] = {
                    "available": True,
                    "devices": cuda_devices,
                    "driver_version": torch.version.cuda
                }
                logger.info(f"CUDA available with {len(cuda_devices)} devices")
            else:
                self.device_info[AcceleratorType.CUDA] = {"available": False}
                logger.info("CUDA not available")
            
            # Check MPS (Apple Silicon) availability
            if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                self.device_info[AcceleratorType.MPS] = {
                    "available": True,
                    "devices": [{"device_id": 0, "name": "Apple GPU"}]
                }
                logger.info("MPS (Apple GPU) available")
            else:
                self.device_info[AcceleratorType.MPS] = {"available": False}
            
            # CPU is always available
            self.device_info[AcceleratorType.CPU] = {
                "available": True,
                "devices": [{"device_id": 0, "name": "CPU", "cores": psutil.cpu_count()}]
            }
            
        except Exception as e:
            logger.error(f"Error detecting GPU devices: {e}")
            # Fallback to CPU only
            self.device_info = {
                AcceleratorType.CPU: {
                    "available": True,
                    "devices": [{"device_id": 0, "name": "CPU"}]
                }
            }
    
    def get_optimal_device(self, model_size_mb: float = 0) -> torch.device:
        """
        Get the optimal device for inference based on model size and availability
        
        Args:
            model_size_mb: Estimated model size in MB
            
        Returns:
            Optimal torch device for inference
        """
        try:
            # Prefer CUDA if available and model fits in memory
            if self.device_info[AcceleratorType.CUDA]["available"]:
                for device in self.device_info[AcceleratorType.CUDA]["devices"]:
                    available_memory = self.get_gpu_memory_info(device["device_id"]).free_memory
                    if model_size_mb * 1024 * 1024 < available_memory * 0.8:  # Use 80% of available memory
                        return torch.device(f"cuda:{device['device_id']}")
            
            # Fallback to MPS if available (Apple Silicon)
            if self.device_info[AcceleratorType.MPS]["available"]:
                return torch.device("mps")
            
            # Fallback to CPU
            return torch.device("cpu")
            
        except Exception as e:
            logger.error(f"Error selecting optimal device: {e}")
            return torch.device("cpu")
    
    def get_gpu_memory_info(self, device_id: int = 0) -> GPUMemoryInfo:
        """
        Get GPU memory information
        
        Args:
            device_id: GPU device ID
            
        Returns:
            GPUMemoryInfo object with memory statistics
        """
        try:
            if not torch.cuda.is_available():
                return GPUMemoryInfo(0, 0, 0, 0, 0.0)
            
            torch.cuda.set_device(device_id)
            total_memory = torch.cuda.get_device_properties(device_id).total_memory
            allocated_memory = torch.cuda.memory_allocated(device_id)
            cached_memory = torch.cuda.memory_reserved(device_id)
            free_memory = total_memory - allocated_memory
            utilization_percent = (allocated_memory / total_memory) * 100
            
            return GPUMemoryInfo(
                total_memory=total_memory,
                allocated_memory=allocated_memory,
                cached_memory=cached_memory,
                free_memory=free_memory,
                utilization_percent=utilization_percent
            )
            
        except Exception as e:
            logger.error(f"Error getting GPU memory info: {e}")
            return GPUMemoryInfo(0, 0, 0, 0, 0.0)
    
    def optimize_model_for_gpu(self, model: nn.Module, device: torch.device) -> nn.Module:
        """
        Optimize model for GPU inference
        
        Args:
            model: PyTorch model to optimize
            device: Target device
            
        Returns:
            Optimized model
        """
        try:
            logger.info(f"Optimizing model for device: {device}")
            
            # Move model to device
            model = model.to(device)
            
            # Set to evaluation mode
            model.eval()
            
            # Enable CUDA optimizations if available
            if device.type == "cuda":
                # Enable cuDNN benchmark for consistent input sizes
                torch.backends.cudnn.benchmark = True
                torch.backends.cudnn.deterministic = False
                
                # Try to compile model with TorchScript for optimization
                try:
                    model = torch.jit.script(model)
                    logger.info("Model compiled with TorchScript")
                except Exception as e:
                    logger.warning(f"TorchScript compilation failed: {e}")
            
            # Enable mixed precision if supported
            if device.type == "cuda" and torch.cuda.get_device_capability(device.index)[0] >= 7:
                model = model.half()  # Convert to FP16
                logger.info("Enabled FP16 mixed precision")
            
            return model
            
        except Exception as e:
            logger.error(f"Error optimizing model for GPU: {e}")
            return model
    
    async def submit_inference_job(self, job: InferenceJob) -> str:
        """
        Submit an inference job to the GPU processing queue
        
        Args:
            job: InferenceJob to process
            
        Returns:
            Job ID for tracking
        """
        try:
            if self.inference_queue.full():
                raise RuntimeError("Inference queue is full")
            
            # Priority queue uses tuple (priority, job)
            self.inference_queue.put((job.priority, job))
            logger.debug(f"Submitted inference job: {job.job_id}")
            
            # Start batch processor if not running
            if not self.is_processing:
                await self.start_batch_processing()
            
            return job.job_id
            
        except Exception as e:
            logger.error(f"Error submitting inference job: {e}")
            raise
    
    async def start_batch_processing(self):
        """Start the batch processing loop for inference jobs"""
        if self.is_processing:
            return
        
        self.is_processing = True
        self.batch_processor = asyncio.create_task(self._batch_processing_loop())
        logger.info("Started GPU batch processing")
    
    async def stop_batch_processing(self):
        """Stop the batch processing loop"""
        self.is_processing = False
        if self.batch_processor:
            self.batch_processor.cancel()
            try:
                await self.batch_processor
            except asyncio.CancelledError:
                pass
        logger.info("Stopped GPU batch processing")
    
    async def _batch_processing_loop(self):
        """Main batch processing loop"""
        try:
            while self.is_processing:
                batch_jobs = []
                
                # Collect jobs for batching (wait up to 100ms for batch to fill)
                start_time = time.time()
                while (len(batch_jobs) < self.max_batch_size and 
                       time.time() - start_time < 0.1 and
                       not self.inference_queue.empty()):
                    
                    try:
                        priority, job = self.inference_queue.get_nowait()
                        batch_jobs.append(job)
                    except queue.Empty:
                        break
                
                if batch_jobs:
                    await self._process_batch(batch_jobs)
                else:
                    # No jobs available, sleep briefly
                    await asyncio.sleep(0.01)
                    
        except asyncio.CancelledError:
            logger.info("Batch processing loop cancelled")
        except Exception as e:
            logger.error(f"Error in batch processing loop: {e}")
    
    async def _process_batch(self, jobs: List[InferenceJob]):
        """
        Process a batch of inference jobs
        
        Args:
            jobs: List of InferenceJob objects to process
        """
        try:
            logger.debug(f"Processing batch of {len(jobs)} jobs")
            
            # Group jobs by model for efficient batching
            model_groups = {}
            for job in jobs:
                if job.model_name not in model_groups:
                    model_groups[job.model_name] = []
                model_groups[job.model_name].append(job)
            
            # Process each model group
            for model_name, model_jobs in model_groups.items():
                await self._process_model_batch(model_name, model_jobs)
                
        except Exception as e:
            logger.error(f"Error processing batch: {e}")
    
    async def _process_model_batch(self, model_name: str, jobs: List[InferenceJob]):
        """
        Process a batch of jobs for a specific model
        
        Args:
            model_name: Name of the model
            jobs: List of jobs for this model
        """
        try:
            # Load model if not cached
            if model_name not in self.model_cache:
                # This would load the actual model - simplified for example
                logger.info(f"Loading model: {model_name}")
                # model = self._load_model(model_name)
                # self.model_cache[model_name] = model
            
            # Batch the input data
            batch_inputs = [job.input_data for job in jobs]
            
            # Run inference (simplified - would use actual model)
            results = await self._run_batch_inference(model_name, batch_inputs)
            
            # Process results (would typically store in database or send to clients)
            for job, result in zip(jobs, results):
                logger.debug(f"Completed job {job.job_id} with result shape: {np.array(result).shape}")
                
        except Exception as e:
            logger.error(f"Error processing model batch for {model_name}: {e}")
    
    async def _run_batch_inference(self, model_name: str, batch_inputs: List[Any]) -> List[Any]:
        """
        Run batch inference on GPU
        
        Args:
            model_name: Name of the model
            batch_inputs: List of input data
            
        Returns:
            List of inference results
        """
        try:
            # This is a simplified example - would use actual model inference
            loop = asyncio.get_event_loop()
            
            def _inference():
                # Simulate GPU inference
                time.sleep(0.01)  # Simulate processing time
                return [np.random.randn(10) for _ in batch_inputs]
            
            results = await loop.run_in_executor(self.executor, _inference)
            return results
            
        except Exception as e:
            logger.error(f"Error running batch inference: {e}")
            return [None] * len(batch_inputs)
    
    def enable_tensorrt_optimization(self, model_path: str, input_shape: tuple) -> str:
        """
        Enable TensorRT optimization for NVIDIA GPUs
        
        Args:
            model_path: Path to the ONNX model
            input_shape: Input tensor shape
            
        Returns:
            Path to optimized TensorRT engine
        """
        try:
            import tensorrt as trt
            
            logger.info(f"Optimizing model with TensorRT: {model_path}")
            
            # Create TensorRT logger and builder
            TRT_LOGGER = trt.Logger(trt.Logger.WARNING)
            builder = trt.Builder(TRT_LOGGER)
            
            # Create network and parser
            network = builder.create_network(1 << int(trt.NetworkDefinitionCreationFlag.EXPLICIT_BATCH))
            parser = trt.OnnxParser(network, TRT_LOGGER)
            
            # Parse ONNX model
            with open(model_path, 'rb') as model_file:
                if not parser.parse(model_file.read()):
                    for error in range(parser.num_errors):
                        logger.error(f"TensorRT parsing error: {parser.get_error(error)}")
                    raise RuntimeError("Failed to parse ONNX model")
            
            # Configure builder
            config = builder.create_builder_config()
            config.max_workspace_size = 1 << 30  # 1GB
            
            # Enable FP16 precision if supported
            if builder.platform_has_fast_fp16:
                config.set_flag(trt.BuilderFlag.FP16)
                logger.info("Enabled FP16 precision for TensorRT")
            
            # Build engine
            engine = builder.build_engine(network, config)
            if not engine:
                raise RuntimeError("Failed to build TensorRT engine")
            
            # Save engine
            engine_path = model_path.replace('.onnx', '_tensorrt.engine')
            with open(engine_path, 'wb') as f:
                f.write(engine.serialize())
            
            logger.info(f"TensorRT optimization completed: {engine_path}")
            return engine_path
            
        except ImportError:
            logger.warning("TensorRT not available, skipping optimization")
            return model_path
        except Exception as e:
            logger.error(f"Error with TensorRT optimization: {e}")
            return model_path
    
    def setup_memory_pool(self, device: torch.device, pool_size_mb: int = 1024):
        """
        Set up GPU memory pool for efficient memory management
        
        Args:
            device: Target device
            pool_size_mb: Memory pool size in MB
        """
        try:
            if device.type == "cuda":
                # Set memory fraction to avoid OOM
                torch.cuda.set_per_process_memory_fraction(0.8, device.index)
                
                # Enable memory pool
                torch.cuda.empty_cache()
                
                # Pre-allocate memory pool
                pool_size_bytes = pool_size_mb * 1024 * 1024
                dummy_tensor = torch.empty(pool_size_bytes // 4, dtype=torch.float32, device=device)
                del dummy_tensor
                torch.cuda.empty_cache()
                
                self.memory_pool[device] = True
                logger.info(f"Set up memory pool for {device} with {pool_size_mb}MB")
                
        except Exception as e:
            logger.error(f"Error setting up memory pool: {e}")
    
    def clear_gpu_cache(self, device_id: Optional[int] = None):
        """
        Clear GPU memory cache
        
        Args:
            device_id: Specific GPU device ID, or None for all devices
        """
        try:
            if torch.cuda.is_available():
                if device_id is not None:
                    torch.cuda.set_device(device_id)
                    torch.cuda.empty_cache()
                    logger.info(f"Cleared GPU cache for device {device_id}")
                else:
                    for i in range(torch.cuda.device_count()):
                        torch.cuda.set_device(i)
                        torch.cuda.empty_cache()
                    logger.info("Cleared GPU cache for all devices")
                    
        except Exception as e:
            logger.error(f"Error clearing GPU cache: {e}")
    
    def get_device_utilization(self) -> Dict[str, Any]:
        """
        Get current device utilization statistics
        
        Returns:
            Dictionary containing utilization metrics for all devices
        """
        try:
            utilization = {}
            
            # CPU utilization
            utilization["cpu"] = {
                "utilization_percent": psutil.cpu_percent(interval=1),
                "memory_percent": psutil.virtual_memory().percent
            }
            
            # GPU utilization
            if torch.cuda.is_available():
                gpu_stats = []
                for i in range(torch.cuda.device_count()):
                    memory_info = self.get_gpu_memory_info(i)
                    gpu_stats.append({
                        "device_id": i,
                        "name": torch.cuda.get_device_name(i),
                        "memory_utilization_percent": memory_info.utilization_percent,
                        "memory_allocated_mb": memory_info.allocated_memory / (1024 * 1024),
                        "memory_total_mb": memory_info.total_memory / (1024 * 1024)
                    })
                utilization["gpu"] = gpu_stats
            
            return utilization
            
        except Exception as e:
            logger.error(f"Error getting device utilization: {e}")
            return {}
    
    async def health_check(self) -> Dict[str, Any]:
        """
        Perform health check on GPU acceleration service
        
        Returns:
            Health status and metrics
        """
        try:
            health_status = {
                "service_status": "healthy",
                "devices": self.device_info,
                "queue_size": self.inference_queue.qsize(),
                "is_processing": self.is_processing,
                "utilization": self.get_device_utilization(),
                "timestamp": time.time()
            }
            
            # Check for any issues
            if self.inference_queue.qsize() > self.max_queue_size * 0.9:
                health_status["warnings"] = ["Inference queue nearly full"]
            
            return health_status
            
        except Exception as e:
            logger.error(f"Error in health check: {e}")
            return {
                "service_status": "unhealthy",
                "error": str(e),
                "timestamp": time.time()
            }
    
    async def cleanup(self):
        """Cleanup resources and stop processing"""
        try:
            await self.stop_batch_processing()
            self.clear_gpu_cache()
            self.executor.shutdown(wait=True)
            logger.info("GPU acceleration service cleanup completed")
            
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

# Global instance
gpu_acceleration_service = GPUAccelerationService()