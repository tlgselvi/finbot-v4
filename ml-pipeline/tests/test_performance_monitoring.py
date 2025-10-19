"""
Performance and Monitoring Tests

Comprehensive test suite for ML model performance, monitoring systems,
and scalability under load conditions.
"""

import pytest
import asyncio
import time
import json
import numpy as np
import concurrent.futures
from typing import List, Dict, Any
import aiohttp
import psutil
from datetime import datetime, timedelta
import statistics
import threading
from unittest.mock import Mock, patch, AsyncMock

# Import services to test
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from services.monitoring_service import MLMonitoringService
from services.auto_scaling_service import AutoScalingService
from services.automated_retraining_service import AutomatedRetrainingService
from services.resource_optimization_service import ResourceOptimizationService

class PerformanceTestResults:
    """Container for performance test results"""
    
    def __init__(self):
        self.latencies = []
        self.throughput_measurements = []
        self.error_rates = []
        self.resource_usage = []
        self.start_time = None
        self.end_time = None
    
    def add_measurement(self, latency: float, success: bool, resource_usage: Dict[str, float]):
        """Add a performance measurement"""
        self.latencies.append(latency)
        self.error_rates.append(0 if success else 1)
        self.resource_usage.append(resource_usage)
    
    def calculate_statistics(self) -> Dict[str, Any]:
        """Calculate performance statistics"""
        if not self.latencies:
            return {}
        
        return {
            "avg_latency_ms": statistics.mean(self.latencies),
            "p50_latency_ms": statistics.median(self.latencies),
            "p95_latency_ms": np.percentile(self.latencies, 95),
            "p99_latency_ms": np.percentile(self.latencies, 99),
            "max_latency_ms": max(self.latencies),
            "min_latency_ms": min(self.latencies),
            "total_requests": len(self.latencies),
            "error_rate": statistics.mean(self.error_rates),
            "success_rate": 1 - statistics.mean(self.error_rates),
            "duration_seconds": (self.end_time - self.start_time).total_seconds() if self.start_time and self.end_time else 0,
            "throughput_rps": len(self.latencies) / ((self.end_time - self.start_time).total_seconds()) if self.start_time and self.end_time else 0
        }

class LoadTestRunner:
    """Runner for load testing ML services"""
    
    def __init__(self, base_url: str = "http://localhost:8080"):
        self.base_url = base_url
        self.session = None
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def make_prediction_request(self, model_name: str, input_data: Dict[str, Any]) -> tuple[float, bool]:
        """Make a single prediction request and measure latency"""
        start_time = time.time()
        
        try:
            async with self.session.post(
                f"{self.base_url}/api/ml/predict",
                json={"model_name": model_name, "input_data": input_data},
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                await response.json()
                latency = (time.time() - start_time) * 1000  # Convert to milliseconds
                return latency, response.status == 200
        except Exception as e:
            latency = (time.time() - start_time) * 1000
            return latency, False
    
    async def run_load_test(self, model_name: str, concurrent_users: int, 
                          duration_seconds: int, input_data: Dict[str, Any]) -> PerformanceTestResults:
        """Run a load test with specified parameters"""
        results = PerformanceTestResults()
        results.start_time = datetime.now()
        
        # Create semaphore to limit concurrent requests
        semaphore = asyncio.Semaphore(concurrent_users)
        
        async def make_request():
            async with semaphore:
                latency, success = await self.make_prediction_request(model_name, input_data)
                
                # Collect resource usage
                resource_usage = {
                    "cpu_percent": psutil.cpu_percent(),
                    "memory_percent": psutil.virtual_memory().percent,
                    "timestamp": time.time()
                }
                
                results.add_measurement(latency, success, resource_usage)
        
        # Run requests for specified duration
        end_time = time.time() + duration_seconds
        tasks = []
        
        while time.time() < end_time:
            task = asyncio.create_task(make_request())
            tasks.append(task)
            
            # Small delay to control request rate
            await asyncio.sleep(0.01)
        
        # Wait for all requests to complete
        await asyncio.gather(*tasks, return_exceptions=True)
        
        results.end_time = datetime.now()
        return results

@pytest.fixture
async def monitoring_service():
    """Create and initialize monitoring service"""
    service = MLMonitoringService(redis_url="redis://localhost:6379/1")
    await service.initialize()
    yield service
    await service.close()

@pytest.fixture
async def auto_scaling_service():
    """Create and initialize auto-scaling service"""
    service = AutoScalingService(redis_url="redis://localhost:6379/1")
    await service.initialize()
    yield service
    await service.close()

@pytest.fixture
async def load_test_runner():
    """Create load test runner"""
    async with LoadTestRunner() as runner:
        yield runner

class TestMLModelPerformance:
    """Test ML model inference performance under load"""
    
    @pytest.mark.asyncio
    async def test_single_model_latency(self, load_test_runner):
        """Test latency for single model predictions"""
        model_name = "spending_predictor"
        input_data = {
            "user_id": "test_user",
            "features": [100.0, 50.0, 25.0, 75.0, 200.0]
        }
        
        # Make 100 sequential requests
        latencies = []
        for _ in range(100):
            latency, success = await load_test_runner.make_prediction_request(model_name, input_data)
            assert success, "Prediction request should succeed"
            latencies.append(latency)
        
        # Analyze results
        avg_latency = statistics.mean(latencies)
        p95_latency = np.percentile(latencies, 95)
        
        # Performance assertions
        assert avg_latency < 500, f"Average latency ({avg_latency:.2f}ms) should be under 500ms"
        assert p95_latency < 1000, f"P95 latency ({p95_latency:.2f}ms) should be under 1000ms"
        assert all(l < 5000 for l in latencies), "No request should take more than 5 seconds"
    
    @pytest.mark.asyncio
    async def test_concurrent_load_performance(self, load_test_runner):
        """Test performance under concurrent load"""
        model_name = "anomaly_detector"
        input_data = {
            "transaction": {
                "amount": 150.0,
                "category": "groceries",
                "merchant": "test_store"
            }
        }
        
        # Test with increasing concurrent users
        concurrent_users_list = [1, 5, 10, 20]
        results = {}
        
        for concurrent_users in concurrent_users_list:
            print(f"Testing with {concurrent_users} concurrent users...")
            
            test_results = await load_test_runner.run_load_test(
                model_name=model_name,
                concurrent_users=concurrent_users,
                duration_seconds=30,
                input_data=input_data
            )
            
            stats = test_results.calculate_statistics()
            results[concurrent_users] = stats
            
            # Performance assertions
            assert stats["error_rate"] < 0.05, f"Error rate ({stats['error_rate']:.3f}) should be under 5%"
            assert stats["avg_latency_ms"] < 2000, f"Average latency should be under 2000ms"
            assert stats["throughput_rps"] > 1, "Throughput should be at least 1 RPS"
        
        # Check that performance degrades gracefully with load
        for i in range(1, len(concurrent_users_list)):
            prev_users = concurrent_users_list[i-1]
            curr_users = concurrent_users_list[i]
            
            prev_latency = results[prev_users]["avg_latency_ms"]
            curr_latency = results[curr_users]["avg_latency_ms"]
            
            # Latency should not increase more than 3x
            assert curr_latency < prev_latency * 3, f"Latency degradation too severe: {prev_latency:.2f}ms -> {curr_latency:.2f}ms"
    
    @pytest.mark.asyncio
    async def test_sustained_load_performance(self, load_test_runner):
        """Test performance under sustained load"""
        model_name = "risk_assessor"
        input_data = {
            "user_id": "test_user",
            "financial_data": {
                "income": 5000,
                "expenses": 3500,
                "savings": 1500
            }
        }
        
        # Run sustained load test for 2 minutes
        results = await load_test_runner.run_load_test(
            model_name=model_name,
            concurrent_users=10,
            duration_seconds=120,
            input_data=input_data
        )
        
        stats = results.calculate_statistics()
        
        # Performance assertions for sustained load
        assert stats["error_rate"] < 0.02, f"Error rate ({stats['error_rate']:.3f}) should be under 2% for sustained load"
        assert stats["avg_latency_ms"] < 1500, f"Average latency should be under 1500ms for sustained load"
        assert stats["throughput_rps"] > 5, "Sustained throughput should be at least 5 RPS"
        assert stats["total_requests"] > 500, "Should handle at least 500 requests in 2 minutes"
    
    @pytest.mark.asyncio
    async def test_memory_usage_under_load(self, load_test_runner):
        """Test memory usage patterns under load"""
        model_name = "budget_optimizer"
        input_data = {
            "user_id": "test_user",
            "budget_data": {
                "categories": ["food", "transport", "entertainment"],
                "amounts": [800, 300, 200]
            }
        }
        
        # Monitor memory before load test
        initial_memory = psutil.virtual_memory().percent
        
        # Run load test
        results = await load_test_runner.run_load_test(
            model_name=model_name,
            concurrent_users=15,
            duration_seconds=60,
            input_data=input_data
        )
        
        # Analyze memory usage during test
        memory_usages = [r["memory_percent"] for r in results.resource_usage]
        max_memory = max(memory_usages)
        avg_memory = statistics.mean(memory_usages)
        
        # Memory usage assertions
        assert max_memory < 90, f"Memory usage ({max_memory:.1f}%) should not exceed 90%"
        assert avg_memory - initial_memory < 30, f"Memory increase ({avg_memory - initial_memory:.1f}%) should be reasonable"
        
        # Check for memory leaks (memory should not continuously increase)
        if len(memory_usages) > 10:
            first_half = memory_usages[:len(memory_usages)//2]
            second_half = memory_usages[len(memory_usages)//2:]
            
            first_avg = statistics.mean(first_half)
            second_avg = statistics.mean(second_half)
            
            memory_increase = second_avg - first_avg
            assert memory_increase < 10, f"Potential memory leak detected: {memory_increase:.1f}% increase"

class TestMonitoringSystem:
    """Test monitoring system functionality"""
    
    @pytest.mark.asyncio
    async def test_metrics_collection(self, monitoring_service):
        """Test that metrics are collected correctly"""
        # Record some test metrics
        monitoring_service.record_model_request("test_model", "v1", "predict")
        monitoring_service.record_inference_time("test_model", 0.150)  # 150ms
        monitoring_service.update_model_accuracy("test_model", 0.85)
        monitoring_service.record_prediction_confidence("test_model", 0.92)
        
        # Get metrics in Prometheus format
        metrics_text = monitoring_service.get_metrics()
        
        # Verify metrics are present
        assert "ml_model_requests_total" in metrics_text
        assert "ml_model_inference_duration_seconds" in metrics_text
        assert "ml_model_accuracy" in metrics_text
        assert "ml_prediction_confidence" in metrics_text
        
        # Verify metric values
        assert 'model_name="test_model"' in metrics_text
        assert 'version="v1"' in metrics_text
    
    @pytest.mark.asyncio
    async def test_system_metrics_collection(self, monitoring_service):
        """Test system-level metrics collection"""
        await monitoring_service.collect_system_metrics()
        
        # Verify system metrics are collected
        metrics_text = monitoring_service.get_metrics()
        
        # Should have cache metrics if Redis is available
        if monitoring_service.redis_client:
            assert "ml_cache_hit_rate" in metrics_text
    
    @pytest.mark.asyncio
    async def test_alert_generation(self, monitoring_service):
        """Test alert generation functionality"""
        # Simulate high GPU utilization
        monitoring_service.update_gpu_metrics("0", "Test GPU", 95.0, 90.0)
        
        # Check alert conditions
        await monitoring_service.check_alert_conditions()
        
        # Verify alerts were generated
        assert len(monitoring_service.alerts) > 0
        
        # Check alert content
        recent_alerts = [alert for alert in monitoring_service.alerts 
                        if (datetime.now() - alert.timestamp).total_seconds() < 60]
        assert len(recent_alerts) > 0
    
    @pytest.mark.asyncio
    async def test_monitoring_loop_performance(self, monitoring_service):
        """Test monitoring loop performance"""
        # Start monitoring
        monitoring_task = asyncio.create_task(monitoring_service.start_monitoring(interval=1))
        
        # Let it run for a few seconds
        await asyncio.sleep(5)
        
        # Stop monitoring
        monitoring_service.stop_monitoring()
        
        # Wait for task to complete
        try:
            await asyncio.wait_for(monitoring_task, timeout=2)
        except asyncio.TimeoutError:
            monitoring_task.cancel()
        
        # Verify monitoring ran without errors
        assert not monitoring_service.is_monitoring
    
    @pytest.mark.asyncio
    async def test_metrics_performance_under_load(self, monitoring_service):
        """Test metrics collection performance under high load"""
        
        def record_metrics_batch():
            """Record a batch of metrics"""
            for i in range(100):
                monitoring_service.record_model_request(f"model_{i % 5}", "v1", "predict")
                monitoring_service.record_inference_time(f"model_{i % 5}", 0.1 + (i % 10) * 0.01)
                monitoring_service.record_prediction_confidence(f"model_{i % 5}", 0.8 + (i % 20) * 0.01)
        
        # Measure time to record metrics
        start_time = time.time()
        
        # Use thread pool to simulate concurrent metric recording
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(record_metrics_batch) for _ in range(10)]
            concurrent.futures.wait(futures)
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Performance assertions
        assert duration < 5.0, f"Metrics recording took too long: {duration:.2f}s"
        
        # Verify metrics were recorded
        metrics_text = monitoring_service.get_metrics()
        assert "ml_model_requests_total" in metrics_text

class TestAutoScalingPerformance:
    """Test auto-scaling system performance"""
    
    @pytest.mark.asyncio
    async def test_scaling_decision_performance(self, auto_scaling_service):
        """Test performance of scaling decisions"""
        
        # Measure time to make scaling decisions
        start_time = time.time()
        
        for _ in range(100):
            await auto_scaling_service.process_scaling_rules()
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Performance assertions
        assert duration < 10.0, f"Scaling decisions took too long: {duration:.2f}s"
        avg_decision_time = duration / 100
        assert avg_decision_time < 0.1, f"Average decision time too high: {avg_decision_time:.3f}s"
    
    @pytest.mark.asyncio
    async def test_metrics_collection_performance(self, auto_scaling_service):
        """Test performance of metrics collection"""
        
        services = ["service1", "service2", "service3", "service4", "service5"]
        
        start_time = time.time()
        
        # Collect metrics for multiple services
        for service_name in services:
            await auto_scaling_service.collect_metrics(service_name)
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Performance assertions
        assert duration < 5.0, f"Metrics collection took too long: {duration:.2f}s"
        avg_collection_time = duration / len(services)
        assert avg_collection_time < 1.0, f"Average collection time too high: {avg_collection_time:.3f}s"
    
    @pytest.mark.asyncio
    async def test_scaling_predictions_performance(self, auto_scaling_service):
        """Test performance of scaling predictions"""
        
        start_time = time.time()
        
        # Generate predictions for next 24 hours
        predictions = await auto_scaling_service.predict_scaling_needs(24)
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Performance assertions
        assert duration < 2.0, f"Scaling predictions took too long: {duration:.2f}s"
        assert isinstance(predictions, dict), "Predictions should be returned as dictionary"
        assert len(predictions) > 0, "Should generate predictions for configured services"

class TestScalabilityLimits:
    """Test system scalability limits"""
    
    @pytest.mark.asyncio
    async def test_concurrent_monitoring_services(self):
        """Test multiple monitoring services running concurrently"""
        
        services = []
        tasks = []
        
        try:
            # Create multiple monitoring services
            for i in range(5):
                service = MLMonitoringService(redis_url=f"redis://localhost:6379/{i+2}")
                await service.initialize()
                services.append(service)
                
                # Start monitoring task
                task = asyncio.create_task(service.start_monitoring(interval=0.5))
                tasks.append(task)
            
            # Let them run concurrently
            await asyncio.sleep(3)
            
            # Stop all services
            for service in services:
                service.stop_monitoring()
            
            # Wait for tasks to complete
            for task in tasks:
                try:
                    await asyncio.wait_for(task, timeout=2)
                except asyncio.TimeoutError:
                    task.cancel()
            
            # Verify all services ran without major issues
            assert len(services) == 5
            
        finally:
            # Cleanup
            for service in services:
                await service.close()
    
    @pytest.mark.asyncio
    async def test_high_frequency_metric_recording(self, monitoring_service):
        """Test high-frequency metric recording"""
        
        # Record metrics at high frequency
        start_time = time.time()
        
        async def record_metrics_continuously():
            for i in range(1000):
                monitoring_service.record_model_request("high_freq_model", "v1", "predict")
                monitoring_service.record_inference_time("high_freq_model", 0.05)
                
                # Small delay to prevent overwhelming
                if i % 100 == 0:
                    await asyncio.sleep(0.001)
        
        await record_metrics_continuously()
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Performance assertions
        assert duration < 5.0, f"High-frequency recording took too long: {duration:.2f}s"
        
        # Verify metrics were recorded
        metrics_text = monitoring_service.get_metrics()
        assert "ml_model_requests_total" in metrics_text
    
    @pytest.mark.asyncio
    async def test_memory_usage_scalability(self):
        """Test memory usage with large number of metrics"""
        
        # Monitor initial memory
        initial_memory = psutil.Process().memory_info().rss / 1024 / 1024  # MB
        
        # Create service and record many metrics
        service = MLMonitoringService(redis_url="redis://localhost:6379/10")
        await service.initialize()
        
        try:
            # Record large number of metrics
            for i in range(10000):
                service.record_model_request(f"model_{i % 100}", "v1", "predict")
                service.record_inference_time(f"model_{i % 100}", 0.1)
                service.update_model_accuracy(f"model_{i % 100}", 0.85)
            
            # Check memory usage
            current_memory = psutil.Process().memory_info().rss / 1024 / 1024  # MB
            memory_increase = current_memory - initial_memory
            
            # Memory usage should be reasonable
            assert memory_increase < 500, f"Memory usage increased too much: {memory_increase:.1f}MB"
            
        finally:
            await service.close()

class TestEndToEndPerformance:
    """End-to-end performance tests"""
    
    @pytest.mark.asyncio
    async def test_full_pipeline_performance(self, load_test_runner, monitoring_service):
        """Test performance of full ML pipeline"""
        
        # Start monitoring
        monitoring_task = asyncio.create_task(monitoring_service.start_monitoring(interval=2))
        
        try:
            # Run load test while monitoring
            results = await load_test_runner.run_load_test(
                model_name="spending_predictor",
                concurrent_users=8,
                duration_seconds=30,
                input_data={"user_id": "test", "features": [1, 2, 3, 4, 5]}
            )
            
            stats = results.calculate_statistics()
            
            # Performance assertions
            assert stats["error_rate"] < 0.03, "Error rate should be under 3%"
            assert stats["avg_latency_ms"] < 1000, "Average latency should be under 1000ms"
            assert stats["throughput_rps"] > 3, "Throughput should be at least 3 RPS"
            
            # Verify monitoring collected metrics
            await asyncio.sleep(2)  # Let monitoring collect some data
            metrics_text = monitoring_service.get_metrics()
            assert len(metrics_text) > 0, "Monitoring should collect metrics"
            
        finally:
            # Stop monitoring
            monitoring_service.stop_monitoring()
            try:
                await asyncio.wait_for(monitoring_task, timeout=2)
            except asyncio.TimeoutError:
                monitoring_task.cancel()

if __name__ == "__main__":
    # Run performance tests
    pytest.main([__file__, "-v", "--tb=short", "-x"])