"""
Scalability Tests

Test suite for system scalability under high demand,
resource limits, and concurrent operations.
"""

import pytest
import asyncio
import time
import psutil
import threading
import concurrent.futures
from datetime import datetime
import statistics
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from services.auto_scaling_service import AutoScalingService
from services.monitoring_service import MLMonitoringService
from services.resource_optimization_service import ResourceOptimizationService

class ScalabilityTestResults:
    """Container for scalability test results"""
    
    def __init__(self):
        self.response_times = []
        self.memory_usage = []
        self.cpu_usage = []
        self.error_count = 0
        self.success_count = 0
        self.start_time = None
        self.end_time = None
    
    def add_result(self, response_time: float, success: bool, memory_mb: float, cpu_percent: float):
        """Add a test result"""
        self.response_times.append(response_time)
        self.memory_usage.append(memory_mb)
        self.cpu_usage.append(cpu_percent)
        
        if success:
            self.success_count += 1
        else:
            self.error_count += 1
    
    def get_statistics(self):
        """Get test statistics"""
        if not self.response_times:
            return {}
        
        total_operations = self.success_count + self.error_count
        duration = (self.end_time - self.start_time).total_seconds() if self.start_time and self.end_time else 0
        
        return {
            "total_operations": total_operations,
            "success_rate": self.success_count / total_operations if total_operations > 0 else 0,
            "error_rate": self.error_count / total_operations if total_operations > 0 else 0,
            "avg_response_time": statistics.mean(self.response_times),
            "p95_response_time": statistics.quantiles(self.response_times, n=20)[18] if len(self.response_times) > 20 else max(self.response_times),
            "max_response_time": max(self.response_times),
            "min_response_time": min(self.response_times),
            "avg_memory_mb": statistics.mean(self.memory_usage),
            "max_memory_mb": max(self.memory_usage),
            "avg_cpu_percent": statistics.mean(self.cpu_usage),
            "max_cpu_percent": max(self.cpu_usage),
            "throughput_ops_per_sec": total_operations / duration if duration > 0 else 0,
            "duration_seconds": duration
        }

class TestAutoScalingScalability:
    """Test auto-scaling system scalability"""
    
    @pytest.fixture
    async def auto_scaling_service(self):
        """Create auto-scaling service for testing"""
        service = AutoScalingService(redis_url="redis://localhost:6379/1")
        await service.initialize()
        yield service
        await service.close()
    
    @pytest.mark.asyncio
    async def test_concurrent_scaling_decisions(self, auto_scaling_service):
        """Test concurrent scaling decision making"""
        
        results = ScalabilityTestResults()
        results.start_time = datetime.now()
        
        async def make_scaling_decision(service_id):
            """Make a scaling decision for a service"""
            start_time = time.time()
            
            try:
                # Simulate scaling decision process
                await auto_scaling_service.process_scaling_rules()
                
                response_time = time.time() - start_time
                memory_mb = psutil.Process().memory_info().rss / 1024 / 1024
                cpu_percent = psutil.cpu_percent()
                
                results.add_result(response_time, True, memory_mb, cpu_percent)
                
            except Exception as e:
                response_time = time.time() - start_time
                memory_mb = psutil.Process().memory_info().rss / 1024 / 1024
                cpu_percent = psutil.cpu_percent()
                
                results.add_result(response_time, False, memory_mb, cpu_percent)
        
        # Run concurrent scaling decisions
        tasks = [make_scaling_decision(i) for i in range(50)]
        await asyncio.gather(*tasks, return_exceptions=True)
        
        results.end_time = datetime.now()
        stats = results.get_statistics()
        
        # Scalability assertions
        assert stats["success_rate"] > 0.95, f"Success rate too low: {stats['success_rate']:.3f}"
        assert stats["avg_response_time"] < 1.0, f"Average response time too high: {stats['avg_response_time']:.3f}s"
        assert stats["max_memory_mb"] < 1000, f"Memory usage too high: {stats['max_memory_mb']:.1f}MB"
        assert stats["throughput_ops_per_sec"] > 10, f"Throughput too low: {stats['throughput_ops_per_sec']:.1f} ops/sec"
    
    @pytest.mark.asyncio
    async def test_scaling_with_many_services(self, auto_scaling_service):
        """Test scaling decisions with many services"""
        
        # Add many scaling rules
        from services.auto_scaling_service import ScalingRule
        
        for i in range(20):
            rule = ScalingRule(
                name=f"test_service_{i}",
                service_name=f"test_service_{i}",
                metric_name="cpu_utilization",
                threshold_up=70.0,
                threshold_down=30.0,
                scale_up_factor=1.5,
                scale_down_factor=0.7,
                min_replicas=1,
                max_replicas=10,
                cooldown_period=60
            )
            await auto_scaling_service.add_scaling_rule(rule)
        
        # Test scaling decisions for all services
        start_time = time.time()
        
        await auto_scaling_service.process_scaling_rules()
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Should handle many services efficiently
        assert duration < 5.0, f"Processing many services took too long: {duration:.2f}s"
        
        # Verify all rules are present
        rules = auto_scaling_service.get_scaling_rules()
        assert len(rules) >= 20, "Should have added all scaling rules"
    
    @pytest.mark.asyncio
    async def test_prediction_scalability(self, auto_scaling_service):
        """Test scaling prediction scalability"""
        
        # Test predictions for different time horizons
        horizons = [1, 6, 12, 24, 48, 72]
        
        for horizon in horizons:
            start_time = time.time()
            
            predictions = await auto_scaling_service.predict_scaling_needs(horizon)
            
            end_time = time.time()
            duration = end_time - start_time
            
            # Predictions should be fast regardless of horizon
            assert duration < 2.0, f"Predictions for {horizon}h took too long: {duration:.2f}s"
            assert isinstance(predictions, dict), "Should return predictions dictionary"
    
    @pytest.mark.asyncio
    async def test_cost_optimization_scalability(self, auto_scaling_service):
        """Test cost optimization scalability"""
        
        start_time = time.time()
        
        # Run cost optimization multiple times
        for _ in range(10):
            optimizations = await auto_scaling_service.optimize_costs()
            assert isinstance(optimizations, dict), "Should return optimizations"
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Should handle multiple optimization requests efficiently
        assert duration < 10.0, f"Cost optimization took too long: {duration:.2f}s"

class TestMonitoringScalability:
    """Test monitoring system scalability"""
    
    @pytest.fixture
    async def monitoring_service(self):
        """Create monitoring service for testing"""
        service = MLMonitoringService(redis_url="redis://localhost:6379/1")
        await service.initialize()
        yield service
        await service.close()
    
    @pytest.mark.asyncio
    async def test_high_frequency_metrics(self, monitoring_service):
        """Test high-frequency metrics collection"""
        
        results = ScalabilityTestResults()
        results.start_time = datetime.now()
        
        # Record metrics at high frequency
        for i in range(5000):
            start_time = time.time()
            
            try:
                monitoring_service.record_model_request(f"model_{i % 10}", "v1", "predict")
                monitoring_service.record_inference_time(f"model_{i % 10}", 0.1)
                monitoring_service.update_model_accuracy(f"model_{i % 10}", 0.85)
                
                response_time = time.time() - start_time
                memory_mb = psutil.Process().memory_info().rss / 1024 / 1024
                cpu_percent = psutil.cpu_percent()
                
                results.add_result(response_time, True, memory_mb, cpu_percent)
                
            except Exception as e:
                response_time = time.time() - start_time
                memory_mb = psutil.Process().memory_info().rss / 1024 / 1024
                cpu_percent = psutil.cpu_percent()
                
                results.add_result(response_time, False, memory_mb, cpu_percent)
        
        results.end_time = datetime.now()
        stats = results.get_statistics()
        
        # High-frequency metrics assertions
        assert stats["success_rate"] > 0.99, f"Success rate too low: {stats['success_rate']:.3f}"
        assert stats["avg_response_time"] < 0.001, f"Average response time too high: {stats['avg_response_time']:.6f}s"
        assert stats["throughput_ops_per_sec"] > 1000, f"Throughput too low: {stats['throughput_ops_per_sec']:.1f} ops/sec"
    
    @pytest.mark.asyncio
    async def test_concurrent_metric_collection(self, monitoring_service):
        """Test concurrent metric collection from multiple threads"""
        
        results = ScalabilityTestResults()
        results.start_time = datetime.now()
        
        def record_metrics_thread(thread_id):
            """Record metrics from a thread"""
            for i in range(500):
                start_time = time.time()
                
                try:
                    monitoring_service.record_model_request(f"thread_{thread_id}_model", "v1", "predict")
                    monitoring_service.record_inference_time(f"thread_{thread_id}_model", 0.1)
                    
                    response_time = time.time() - start_time
                    memory_mb = psutil.Process().memory_info().rss / 1024 / 1024
                    cpu_percent = psutil.cpu_percent()
                    
                    results.add_result(response_time, True, memory_mb, cpu_percent)
                    
                except Exception as e:
                    response_time = time.time() - start_time
                    memory_mb = psutil.Process().memory_info().rss / 1024 / 1024
                    cpu_percent = psutil.cpu_percent()
                    
                    results.add_result(response_time, False, memory_mb, cpu_percent)
        
        # Run concurrent threads
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(record_metrics_thread, i) for i in range(10)]
            concurrent.futures.wait(futures)
        
        results.end_time = datetime.now()
        stats = results.get_statistics()
        
        # Concurrent metrics assertions
        assert stats["success_rate"] > 0.95, f"Success rate too low: {stats['success_rate']:.3f}"
        assert stats["avg_response_time"] < 0.01, f"Average response time too high: {stats['avg_response_time']:.6f}s"
        assert stats["total_operations"] == 5000, "Should have processed all operations"
    
    @pytest.mark.asyncio
    async def test_memory_usage_stability(self, monitoring_service):
        """Test memory usage stability under load"""
        
        # Record initial memory
        initial_memory = psutil.Process().memory_info().rss / 1024 / 1024
        
        # Record large number of metrics
        for batch in range(10):
            for i in range(1000):
                monitoring_service.record_model_request(f"memory_test_{i % 50}", "v1", "predict")
                monitoring_service.record_inference_time(f"memory_test_{i % 50}", 0.1)
            
            # Check memory after each batch
            current_memory = psutil.Process().memory_info().rss / 1024 / 1024
            memory_increase = current_memory - initial_memory
            
            # Memory should not grow excessively
            assert memory_increase < 200, f"Memory usage increased too much: {memory_increase:.1f}MB after batch {batch}"
        
        # Final memory check
        final_memory = psutil.Process().memory_info().rss / 1024 / 1024
        total_increase = final_memory - initial_memory
        
        assert total_increase < 300, f"Total memory increase too high: {total_increase:.1f}MB"

class TestResourceOptimizationScalability:
    """Test resource optimization scalability"""
    
    @pytest.fixture
    async def resource_service(self):
        """Create resource optimization service for testing"""
        service = ResourceOptimizationService(redis_url="redis://localhost:6379/1")
        await service.initialize()
        yield service
        await service.close()
    
    @pytest.mark.asyncio
    async def test_multiple_service_analysis(self, resource_service):
        """Test analysis of multiple services"""
        
        services = [f"service_{i}" for i in range(20)]
        
        start_time = time.time()
        
        # Analyze all services
        for service_name in services:
            usage_data = await resource_service.collect_resource_usage(service_name)
            assert len(usage_data) > 0, f"Should collect usage data for {service_name}"
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Should handle multiple services efficiently
        assert duration < 10.0, f"Multiple service analysis took too long: {duration:.2f}s"
        avg_time_per_service = duration / len(services)
        assert avg_time_per_service < 0.5, f"Average time per service too high: {avg_time_per_service:.3f}s"
    
    @pytest.mark.asyncio
    async def test_recommendation_generation_scalability(self, resource_service):
        """Test recommendation generation scalability"""
        
        services = [f"service_{i}" for i in range(15)]
        
        start_time = time.time()
        
        # Generate recommendations for all services
        all_recommendations = []
        for service_name in services:
            recommendations = await resource_service.generate_optimization_recommendations(service_name)
            all_recommendations.extend(recommendations)
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Should generate recommendations efficiently
        assert duration < 15.0, f"Recommendation generation took too long: {duration:.2f}s"
        assert len(all_recommendations) >= 0, "Should generate some recommendations"
    
    @pytest.mark.asyncio
    async def test_cost_analysis_scalability(self, resource_service):
        """Test cost analysis scalability"""
        
        services = [f"service_{i}" for i in range(10)]
        
        start_time = time.time()
        
        # Perform cost analysis for all services
        cost_analyses = []
        for service_name in services:
            cost_analysis = await resource_service.calculate_cost_analysis(service_name)
            cost_analyses.append(cost_analysis)
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Should perform cost analysis efficiently
        assert duration < 5.0, f"Cost analysis took too long: {duration:.2f}s"
        assert len(cost_analyses) == len(services), "Should analyze all services"
        
        # Verify all analyses are valid
        for analysis in cost_analyses:
            assert analysis.daily_cost_usd >= 0, "Daily cost should be non-negative"
            assert analysis.efficiency_score >= 0, "Efficiency score should be non-negative"

class TestSystemLimits:
    """Test system behavior at limits"""
    
    @pytest.mark.asyncio
    async def test_maximum_concurrent_services(self):
        """Test maximum number of concurrent monitoring services"""
        
        services = []
        
        try:
            # Create many monitoring services
            for i in range(20):
                service = MLMonitoringService(redis_url=f"redis://localhost:6379/{i % 10}")
                await service.initialize()
                services.append(service)
            
            # Start monitoring on all services
            tasks = []
            for service in services:
                task = asyncio.create_task(service.start_monitoring(interval=0.5))
                tasks.append(task)
            
            # Let them run briefly
            await asyncio.sleep(2)
            
            # Stop all services
            for service in services:
                service.stop_monitoring()
            
            # Wait for tasks to complete
            for task in tasks:
                try:
                    await asyncio.wait_for(task, timeout=1)
                except asyncio.TimeoutError:
                    task.cancel()
            
            # Should handle many concurrent services
            assert len(services) == 20, "Should create all services"
            
        finally:
            # Cleanup
            for service in services:
                await service.close()
    
    @pytest.mark.asyncio
    async def test_extreme_load_handling(self):
        """Test system behavior under extreme load"""
        
        service = MLMonitoringService(redis_url="redis://localhost:6379/1")
        await service.initialize()
        
        try:
            # Generate extreme load
            start_time = time.time()
            
            for i in range(10000):
                service.record_model_request(f"extreme_model_{i % 100}", "v1", "predict")
                
                # Check if system is still responsive every 1000 operations
                if i % 1000 == 0:
                    current_time = time.time()
                    elapsed = current_time - start_time
                    
                    # Should not take too long even under extreme load
                    if elapsed > 30:  # 30 seconds timeout
                        break
            
            end_time = time.time()
            total_duration = end_time - start_time
            
            # System should remain responsive under extreme load
            assert total_duration < 60, f"Extreme load handling took too long: {total_duration:.2f}s"
            
            # Verify metrics are still accessible
            metrics_text = service.get_metrics()
            assert len(metrics_text) > 0, "Should still be able to get metrics"
            
        finally:
            await service.close()

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short", "-x"])