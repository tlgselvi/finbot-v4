"""
Comprehensive Test Suite for Inference Service
Performance, load, and integration tests for ML model serving
"""

import pytest
import asyncio
import time
import json
import uuid
import statistics
from typing import Dict, List, Any
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, AsyncMock
import concurrent.futures

# Import services to test
from services.prediction_service import (
    PredictionService, PredictionRequest, BatchPredictionRequest,
    PredictionType, PredictionCache, ModelRouter
)

class TestPredictionCache:
    """Test prediction caching functionality"""
    
    @pytest.fixture
    async def cache(self):
        """Create cache instance for testing"""
        cache = PredictionCache(max_memory_cache=100)
        await cache.initialize()
        return cache
    
    @pytest.mark.asyncio
    async def test_cache_initialization(self, cache):
        """Test cache initialization"""
        assert cache.memory_cache is not None
        assert cache.max_memory_cache == 100
        assert cache.cache_stats['hits'] == 0
        assert cache.cache_stats['misses'] == 0
    
    @pytest.mark.asyncio
    async def test_cache_key_generation(self, cache):
        """Test cache key generation consistency"""
        request1 = PredictionRequest(
            request_id="test1",
            user_id="user123",
            prediction_type=PredictionType.SPENDING_FORECAST,
            features={"income": 5000, "age": 30}
        )
        
        request2 = PredictionRequest(
            request_id="test2",  # Different request ID
            user_id="user123",
            prediction_type=PredictionType.SPENDING_FORECAST,
            features={"income": 5000, "age": 30}  # Same features
        )
        
        key1 = cache._generate_cache_key(request1)
        key2 = cache._generate_cache_key(request2)
        
        # Same features should generate same cache key
        assert key1 == key2
        
        # Different features should generate different keys
        request3 = PredictionRequest(
            request_id="test3",
            user_id="user123",
            prediction_type=PredictionType.SPENDING_FORECAST,
            features={"income": 6000, "age": 30}  # Different income
        )
        
        key3 = cache._generate_cache_key(request3)
        assert key1 != key3
    
    @pytest.mark.asyncio
    async def test_cache_set_and_get(self, cache):
        """Test cache set and get operations"""
        from services.prediction_service import PredictionResponse
        
        request = PredictionRequest(
            request_id="cache_test",
            user_id="user123",
            prediction_type=PredictionType.SPENDING_FORECAST,
            features={"income": 5000},
            cache_ttl=300
        )
        
        response = PredictionResponse(
            request_id="cache_test",
            user_id="user123",
            prediction_type=PredictionType.SPENDING_FORECAST,
            predictions={"forecast": 1500},
            confidence_scores={"confidence": 0.85},
            model_info={"model_id": "test_model"},
            processing_time_ms=50.0
        )
        
        # Cache miss initially
        cached_response = await cache.get(request)
        assert cached_response is None
        assert cache.cache_stats['misses'] == 1
        
        # Set cache
        await cache.set(request, response)
        
        # Cache hit
        cached_response = await cache.get(request)
        assert cached_response is not None
        assert cached_response.predictions == response.predictions
        assert cache.cache_stats['hits'] == 1
    
    @pytest.mark.asyncio
    async def test_cache_expiration(self, cache):
        """Test cache expiration functionality"""
        from services.prediction_service import PredictionResponse
        
        request = PredictionRequest(
            request_id="expire_test",
            user_id="user123",
            prediction_type=PredictionType.SPENDING_FORECAST,
            features={"income": 5000},
            cache_ttl=1  # 1 second TTL
        )
        
        response = PredictionResponse(
            request_id="expire_test",
            user_id="user123",
            prediction_type=PredictionType.SPENDING_FORECAST,
            predictions={"forecast": 1500},
            confidence_scores={"confidence": 0.85},
            model_info={"model_id": "test_model"},
            processing_time_ms=50.0
        )
        
        # Set cache with short TTL
        await cache.set(request, response)
        
        # Should be cached immediately
        cached_response = await cache.get(request)
        assert cached_response is not None
        
        # Wait for expiration
        await asyncio.sleep(1.1)
        
        # Should be expired now
        cached_response = await cache.get(request)
        assert cached_response is None
    
    @pytest.mark.asyncio
    async def test_cache_lru_eviction(self, cache):
        """Test LRU cache eviction"""
        from services.prediction_service import PredictionResponse
        
        # Fill cache beyond capacity
        for i in range(cache.max_memory_cache + 10):
            request = PredictionRequest(
                request_id=f"lru_test_{i}",
                user_id="user123",
                prediction_type=PredictionType.SPENDING_FORECAST,
                features={"income": 5000 + i},  # Different features
                cache_ttl=300
            )
            
            response = PredictionResponse(
                request_id=f"lru_test_{i}",
                user_id="user123",
                prediction_type=PredictionType.SPENDING_FORECAST,
                predictions={"forecast": 1500 + i},
                confidence_scores={"confidence": 0.85},
                model_info={"model_id": "test_model"},
                processing_time_ms=50.0
            )
            
            await cache.set(request, response)
        
        # Cache should not exceed max size
        assert len(cache.memory_cache) <= cache.max_memory_cache

class TestModelRouter:
    """Test model routing functionality"""
    
    @pytest.fixture
    def router(self):
        """Create router instance for testing"""
        return ModelRouter()
    
    def test_model_registration(self, router):
        """Test model registration"""
        router.register_model("test-model", "http://localhost:8001", "1.0.0", 1.0)
        
        assert "test-model" in router.model_endpoints
        assert router.model_endpoints["test-model"]["endpoint"] == "http://localhost:8001"
        assert router.model_endpoints["test-model"]["version"] == "1.0.0"
        assert router.health_status["test-model"] is True
    
    def test_model_endpoint_routing(self, router):
        """Test model endpoint routing"""
        # Register models for different prediction types
        router.register_model("spending-predictor", "http://localhost:8001", "1.0.0")
        router.register_model("anomaly-detector", "http://localhost:8002", "1.0.0")
        
        # Test routing
        endpoint = router.get_model_endpoint(PredictionType.SPENDING_FORECAST)
        assert endpoint == "http://localhost:8001"
        
        endpoint = router.get_model_endpoint(PredictionType.ANOMALY_DETECTION)
        assert endpoint == "http://localhost:8002"
        
        # Test non-existent model
        endpoint = router.get_model_endpoint(PredictionType.RISK_ASSESSMENT)
        assert endpoint is None
    
    def test_health_status_management(self, router):
        """Test model health status management"""
        router.register_model("test-model", "http://localhost:8001", "1.0.0")
        
        # Initially healthy
        assert router.health_status["test-model"] is True
        endpoint = router.get_model_endpoint(PredictionType.SPENDING_FORECAST)
        assert endpoint is not None
        
        # Mark unhealthy
        router.update_health_status("test-model", False)
        assert router.health_status["test-model"] is False
        
        # Should not route to unhealthy model
        endpoint = router.get_model_endpoint(PredictionType.SPENDING_FORECAST)
        assert endpoint is None
    
    def test_performance_recording(self, router):
        """Test performance metrics recording"""
        router.register_model("test-model", "http://localhost:8001", "1.0.0")
        
        # Record some performance metrics
        router.record_performance("test-model", 50.0, True)
        router.record_performance("test-model", 75.0, True)
        router.record_performance("test-model", 100.0, False)
        
        metrics = router.performance_metrics["test-model"]
        assert len(metrics) == 3
        assert metrics[0]["latency_ms"] == 50.0
        assert metrics[0]["success"] is True
        assert metrics[2]["success"] is False

class TestPredictionService:
    """Test prediction service functionality"""
    
    @pytest.fixture
    async def service(self):
        """Create service instance for testing"""
        config = {
            'cache': {
                'redis_url': 'redis://localhost:6379',
                'max_memory_cache': 100,
                'default_ttl': 300
            },
            'performance': {
                'max_workers': 5,
                'max_queue_size': 100,
                'request_timeout': 30,
                'batch_size': 10,
                'batch_timeout': 5
            },
            'models': {
                'health_check_interval': 60,
                'max_retries': 3,
                'circuit_breaker_threshold': 5
            }
        }
        
        service = PredictionService(config)
        await service.initialize()
        return service
    
    @pytest.mark.asyncio
    async def test_service_initialization(self, service):
        """Test service initialization"""
        assert service.is_initialized is True
        assert len(service.model_router.model_endpoints) > 0
        assert service.cache is not None
    
    @pytest.mark.asyncio
    async def test_single_prediction(self, service):
        """Test single prediction functionality"""
        request = PredictionRequest(
            request_id="test_single",
            user_id="user123",
            prediction_type=PredictionType.SPENDING_FORECAST,
            features={
                "income": 5000,
                "age": 30,
                "historical_spending": [1200, 1300, 1250]
            }
        )
        
        response = await service.predict(request)
        
        assert response.request_id == "test_single"
        assert response.user_id == "user123"
        assert response.prediction_type == PredictionType.SPENDING_FORECAST
        assert "predictions" in response.__dict__
        assert response.processing_time_ms > 0
    
    @pytest.mark.asyncio
    async def test_batch_prediction(self, service):
        """Test batch prediction functionality"""
        requests = []
        for i in range(5):
            request = PredictionRequest(
                request_id=f"batch_test_{i}",
                user_id=f"user_{i}",
                prediction_type=PredictionType.ANOMALY_DETECTION,
                features={
                    "transaction_amount": 100 + i * 10,
                    "merchant_category": "food"
                }
            )
            requests.append(request)
        
        batch_request = BatchPredictionRequest(
            batch_id="test_batch",
            requests=requests,
            max_parallel=3
        )
        
        responses = await service.predict_batch(batch_request)
        
        assert len(responses) == 5
        for response in responses:
            assert response.prediction_type == PredictionType.ANOMALY_DETECTION
            assert response.processing_time_ms >= 0
    
    @pytest.mark.asyncio
    async def test_prediction_caching(self, service):
        """Test prediction caching behavior"""
        request = PredictionRequest(
            request_id="cache_test_1",
            user_id="user123",
            prediction_type=PredictionType.SPENDING_FORECAST,
            features={"income": 5000, "age": 30},
            cache_ttl=300
        )
        
        # First request - cache miss
        response1 = await service.predict(request)
        assert response1.cached is False
        
        # Second request with same features - cache hit
        request.request_id = "cache_test_2"
        response2 = await service.predict(request)
        assert response2.cached is True
        
        # Responses should be identical except for caching flag
        assert response1.predictions == response2.predictions
    
    @pytest.mark.asyncio
    async def test_error_handling(self, service):
        """Test error handling in predictions"""
        # Test with invalid features
        request = PredictionRequest(
            request_id="error_test",
            user_id="user123",
            prediction_type=PredictionType.SPENDING_FORECAST,
            features={}  # Empty features
        )
        
        response = await service.predict(request)
        
        # Should handle gracefully and return response
        assert response.request_id == "error_test"
        assert response.processing_time_ms >= 0
    
    @pytest.mark.asyncio
    async def test_service_status(self, service):
        """Test service status reporting"""
        status = service.get_service_status()
        
        assert "service_status" in status
        assert "metrics" in status
        assert "cache_stats" in status
        assert "model_status" in status
        assert "performance" in status
        
        assert status["service_status"] == "healthy"
        assert isinstance(status["metrics"]["total_requests"], int)

class TestPerformanceAndLoad:
    """Performance and load testing"""
    
    @pytest.fixture
    async def service(self):
        """Create optimized service for performance testing"""
        config = {
            'performance': {
                'max_workers': 20,
                'max_queue_size': 1000,
                'request_timeout': 10
            },
            'cache': {
                'max_memory_cache': 1000
            }
        }
        
        service = PredictionService(config)
        await service.initialize()
        return service
    
    @pytest.mark.asyncio
    async def test_concurrent_predictions(self, service):
        """Test concurrent prediction handling"""
        num_requests = 50
        
        async def make_prediction(i):
            request = PredictionRequest(
                request_id=f"concurrent_{i}",
                user_id=f"user_{i % 10}",
                prediction_type=PredictionType.ANOMALY_DETECTION,
                features={"transaction_amount": 100 + i}
            )
            return await service.predict(request)
        
        start_time = time.time()
        
        # Execute concurrent predictions
        tasks = [make_prediction(i) for i in range(num_requests)]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Verify results
        successful_responses = [r for r in responses if not isinstance(r, Exception)]
        assert len(successful_responses) == num_requests
        
        # Performance assertions
        throughput = num_requests / total_time
        assert throughput > 100  # Should handle >100 req/sec
        
        avg_latency = total_time / num_requests * 1000  # ms
        assert avg_latency < 100  # Should be <100ms average
    
    @pytest.mark.asyncio
    async def test_cache_performance(self, service):
        """Test cache performance under load"""
        # Create requests that will hit cache
        base_request = PredictionRequest(
            request_id="cache_perf_base",
            user_id="user123",
            prediction_type=PredictionType.SPENDING_FORECAST,
            features={"income": 5000, "age": 30}
        )
        
        # Prime the cache
        await service.predict(base_request)
        
        # Test cache hit performance
        num_cache_requests = 100
        
        async def make_cached_request(i):
            request = PredictionRequest(
                request_id=f"cache_perf_{i}",
                user_id="user123",
                prediction_type=PredictionType.SPENDING_FORECAST,
                features={"income": 5000, "age": 30}  # Same features
            )
            return await service.predict(request)
        
        start_time = time.time()
        
        tasks = [make_cached_request(i) for i in range(num_cache_requests)]
        responses = await asyncio.gather(*tasks)
        
        end_time = time.time()
        
        # All should be cache hits
        cache_hits = sum(1 for r in responses if r.cached)
        assert cache_hits == num_cache_requests
        
        # Cache performance should be very fast
        avg_cache_latency = (end_time - start_time) / num_cache_requests * 1000
        assert avg_cache_latency < 10  # <10ms for cache hits
    
    @pytest.mark.asyncio
    async def test_batch_performance(self, service):
        """Test batch processing performance"""
        batch_sizes = [10, 50, 100]
        
        for batch_size in batch_sizes:
            requests = []
            for i in range(batch_size):
                request = PredictionRequest(
                    request_id=f"batch_perf_{batch_size}_{i}",
                    user_id=f"user_{i}",
                    prediction_type=PredictionType.ANOMALY_DETECTION,
                    features={"transaction_amount": 100 + i}
                )
                requests.append(request)
            
            batch_request = BatchPredictionRequest(
                batch_id=f"perf_batch_{batch_size}",
                requests=requests,
                max_parallel=10
            )
            
            start_time = time.time()
            responses = await service.predict_batch(batch_request)
            end_time = time.time()
            
            batch_time = end_time - start_time
            throughput = batch_size / batch_time
            
            # Performance assertions
            assert len(responses) == batch_size
            assert throughput > 50  # >50 req/sec for batches
            assert batch_time < batch_size * 0.1  # <100ms per request
    
    @pytest.mark.asyncio
    async def test_memory_usage(self, service):
        """Test memory usage under load"""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        # Generate load
        num_requests = 200
        
        async def make_request(i):
            request = PredictionRequest(
                request_id=f"memory_test_{i}",
                user_id=f"user_{i}",
                prediction_type=PredictionType.SPENDING_FORECAST,
                features={
                    "income": 5000 + i,
                    "age": 25 + (i % 40),
                    "spending_history": [1000 + j for j in range(10)]
                }
            )
            return await service.predict(request)
        
        tasks = [make_request(i) for i in range(num_requests)]
        await asyncio.gather(*tasks)
        
        final_memory = process.memory_info().rss / 1024 / 1024  # MB
        memory_increase = final_memory - initial_memory
        
        # Memory increase should be reasonable
        assert memory_increase < 100  # <100MB increase for 200 requests
    
    @pytest.mark.asyncio
    async def test_latency_distribution(self, service):
        """Test latency distribution and percentiles"""
        num_requests = 100
        latencies = []
        
        for i in range(num_requests):
            request = PredictionRequest(
                request_id=f"latency_test_{i}",
                user_id=f"user_{i}",
                prediction_type=PredictionType.ANOMALY_DETECTION,
                features={"transaction_amount": 100 + i}
            )
            
            start_time = time.time()
            await service.predict(request)
            end_time = time.time()
            
            latency_ms = (end_time - start_time) * 1000
            latencies.append(latency_ms)
        
        # Calculate percentiles
        p50 = statistics.median(latencies)
        p95 = statistics.quantiles(latencies, n=20)[18]  # 95th percentile
        p99 = statistics.quantiles(latencies, n=100)[98]  # 99th percentile
        
        # Latency assertions
        assert p50 < 50   # 50th percentile < 50ms
        assert p95 < 100  # 95th percentile < 100ms
        assert p99 < 200  # 99th percentile < 200ms

class TestIntegration:
    """Integration tests with external dependencies"""
    
    @pytest.mark.asyncio
    async def test_model_endpoint_integration(self):
        """Test integration with model endpoints"""
        service = PredictionService()
        await service.initialize()
        
        # Test that service can handle model endpoint failures gracefully
        with patch.object(service, '_make_model_prediction', side_effect=Exception("Model unavailable")):
            request = PredictionRequest(
                request_id="integration_test",
                user_id="user123",
                prediction_type=PredictionType.SPENDING_FORECAST,
                features={"income": 5000}
            )
            
            response = await service.predict(request)
            
            # Should handle error gracefully
            assert "error" in response.predictions
            assert response.processing_time_ms >= 0
    
    @pytest.mark.asyncio
    async def test_cache_backend_failure(self):
        """Test behavior when cache backend fails"""
        service = PredictionService()
        
        # Mock cache failure
        with patch.object(service.cache, 'get', side_effect=Exception("Cache unavailable")):
            with patch.object(service.cache, 'set', side_effect=Exception("Cache unavailable")):
                await service.initialize()
                
                request = PredictionRequest(
                    request_id="cache_failure_test",
                    user_id="user123",
                    prediction_type=PredictionType.ANOMALY_DETECTION,
                    features={"transaction_amount": 500}
                )
                
                response = await service.predict(request)
                
                # Should work without cache
                assert response.request_id == "cache_failure_test"
                assert response.cached is False

# Test configuration
@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests"""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()

# Performance benchmarks
class TestBenchmarks:
    """Benchmark tests for performance validation"""
    
    @pytest.mark.benchmark
    @pytest.mark.asyncio
    async def test_single_prediction_benchmark(self):
        """Benchmark single prediction performance"""
        service = PredictionService()
        await service.initialize()
        
        request = PredictionRequest(
            request_id="benchmark_single",
            user_id="user123",
            prediction_type=PredictionType.SPENDING_FORECAST,
            features={"income": 5000, "age": 30}
        )
        
        # Warmup
        for _ in range(10):
            await service.predict(request)
        
        # Benchmark
        num_iterations = 100
        start_time = time.time()
        
        for i in range(num_iterations):
            request.request_id = f"benchmark_{i}"
            await service.predict(request)
        
        end_time = time.time()
        
        avg_latency = (end_time - start_time) / num_iterations * 1000
        throughput = num_iterations / (end_time - start_time)
        
        print(f"\\nSingle Prediction Benchmark:")
        print(f"  Average Latency: {avg_latency:.2f}ms")
        print(f"  Throughput: {throughput:.1f} req/sec")
        
        # Performance targets
        assert avg_latency < 50  # <50ms average
        assert throughput > 100  # >100 req/sec
    
    @pytest.mark.benchmark
    @pytest.mark.asyncio
    async def test_concurrent_benchmark(self):
        """Benchmark concurrent prediction performance"""
        service = PredictionService()
        await service.initialize()
        
        concurrency_levels = [10, 50, 100]
        
        for concurrency in concurrency_levels:
            async def make_concurrent_request(i):
                request = PredictionRequest(
                    request_id=f"concurrent_bench_{i}",
                    user_id=f"user_{i}",
                    prediction_type=PredictionType.ANOMALY_DETECTION,
                    features={"transaction_amount": 100 + i}
                )
                return await service.predict(request)
            
            start_time = time.time()
            
            tasks = [make_concurrent_request(i) for i in range(concurrency)]
            responses = await asyncio.gather(*tasks)
            
            end_time = time.time()
            
            total_time = end_time - start_time
            throughput = concurrency / total_time
            avg_latency = total_time / concurrency * 1000
            
            print(f"\\nConcurrent Benchmark ({concurrency} requests):")
            print(f"  Total Time: {total_time:.2f}s")
            print(f"  Throughput: {throughput:.1f} req/sec")
            print(f"  Average Latency: {avg_latency:.2f}ms")
            
            # Performance targets scale with concurrency
            assert throughput > 50  # Minimum throughput
            assert avg_latency < 200  # Maximum latency

if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "--tb=short"])