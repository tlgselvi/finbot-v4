"""
Functional Tests for Inference Service
Simple functional validation without external dependencies
"""

import asyncio
import time
import json
from datetime import datetime
from services.prediction_service import (
    PredictionService, PredictionRequest, BatchPredictionRequest,
    PredictionType, PredictionCache, ModelRouter
)

async def test_prediction_cache():
    """Test prediction cache functionality"""
    print("💾 Testing Prediction Cache...")
    
    cache = PredictionCache(max_memory_cache=10)
    await cache.initialize()
    
    # Test cache key generation
    request1 = PredictionRequest(
        request_id="test1",
        user_id="user123",
        prediction_type=PredictionType.SPENDING_FORECAST,
        features={"income": 5000}
    )
    
    request2 = PredictionRequest(
        request_id="test2",
        user_id="user123", 
        prediction_type=PredictionType.SPENDING_FORECAST,
        features={"income": 5000}  # Same features
    )
    
    key1 = cache._generate_cache_key(request1)
    key2 = cache._generate_cache_key(request2)
    
    assert key1 == key2, "Same features should generate same cache key"
    print("   ✅ Cache key generation works correctly")
    
    # Test cache miss
    cached_response = await cache.get(request1)
    assert cached_response is None, "Should be cache miss initially"
    print("   ✅ Cache miss detection works")
    
    # Test cache stats
    stats = cache.get_stats()
    assert stats['cache_misses'] == 1, "Should record cache miss"
    print("   ✅ Cache statistics tracking works")
    
    print("   ✅ Prediction cache tests passed")

def test_model_router():
    """Test model router functionality"""
    print("🔀 Testing Model Router...")
    
    router = ModelRouter()
    
    # Test model registration
    router.register_model("test-model", "http://localhost:8001", "1.0.0")
    
    assert "test-model" in router.model_endpoints
    assert router.health_status["test-model"] is True
    print("   ✅ Model registration works")
    
    # Test endpoint routing
    router.register_model("spending-predictor", "http://localhost:8001", "1.0.0")
    endpoint = router.get_model_endpoint(PredictionType.SPENDING_FORECAST)
    assert endpoint == "http://localhost:8001"
    print("   ✅ Model endpoint routing works")
    
    # Test health status
    router.update_health_status("spending-predictor", False)
    endpoint = router.get_model_endpoint(PredictionType.SPENDING_FORECAST)
    assert endpoint is None, "Should not route to unhealthy model"
    print("   ✅ Health status management works")
    
    # Test performance recording
    router.record_performance("test-model", 50.0, True)
    metrics = router.performance_metrics["test-model"]
    assert len(metrics) == 1
    assert metrics[0]["latency_ms"] == 50.0
    print("   ✅ Performance recording works")
    
    print("   ✅ Model router tests passed")

async def test_prediction_service():
    """Test prediction service functionality"""
    print("🎯 Testing Prediction Service...")
    
    service = PredictionService()
    success = await service.initialize()
    
    assert success, "Service should initialize successfully"
    assert service.is_initialized, "Service should be marked as initialized"
    print("   ✅ Service initialization works")
    
    # Test single prediction
    request = PredictionRequest(
        request_id="test_prediction",
        user_id="user123",
        prediction_type=PredictionType.SPENDING_FORECAST,
        features={"income": 5000, "age": 30}
    )
    
    start_time = time.time()
    response = await service.predict(request)
    end_time = time.time()
    
    assert response.request_id == "test_prediction"
    assert response.user_id == "user123"
    assert response.prediction_type == PredictionType.SPENDING_FORECAST
    assert "predictions" in response.__dict__
    assert response.processing_time_ms > 0
    
    latency_ms = (end_time - start_time) * 1000
    print(f"   ✅ Single prediction works (latency: {latency_ms:.2f}ms)")
    
    # Test batch prediction
    requests = []
    for i in range(5):
        req = PredictionRequest(
            request_id=f"batch_test_{i}",
            user_id=f"user_{i}",
            prediction_type=PredictionType.ANOMALY_DETECTION,
            features={"transaction_amount": 100 + i * 10}
        )
        requests.append(req)
    
    batch_request = BatchPredictionRequest(
        batch_id="test_batch",
        requests=requests
    )
    
    batch_responses = await service.predict_batch(batch_request)
    
    assert len(batch_responses) == 5
    for response in batch_responses:
        assert response.prediction_type == PredictionType.ANOMALY_DETECTION
    
    print("   ✅ Batch prediction works")
    
    # Test caching
    cached_request = PredictionRequest(
        request_id="cache_test",
        user_id="user123",
        prediction_type=PredictionType.SPENDING_FORECAST,
        features={"income": 5000, "age": 30},  # Same as first request
        cache_ttl=300
    )
    
    cached_response = await service.predict(cached_request)
    assert cached_response.cached is True, "Should be cache hit"
    print("   ✅ Prediction caching works")
    
    # Test service status
    status = service.get_service_status()
    assert status["service_status"] == "healthy"
    assert "metrics" in status
    assert "cache_stats" in status
    print("   ✅ Service status reporting works")
    
    await service.cleanup()
    print("   ✅ Prediction service tests passed")

async def test_performance_characteristics():
    """Test basic performance characteristics"""
    print("⚡ Testing Performance Characteristics...")
    
    service = PredictionService()
    await service.initialize()
    
    # Test concurrent predictions
    num_concurrent = 20
    
    async def make_prediction(i):
        request = PredictionRequest(
            request_id=f"perf_test_{i}",
            user_id=f"user_{i}",
            prediction_type=PredictionType.ANOMALY_DETECTION,
            features={"transaction_amount": 100 + i}
        )
        start = time.time()
        response = await service.predict(request)
        end = time.time()
        return (end - start) * 1000  # latency in ms
    
    start_time = time.time()
    
    tasks = [make_prediction(i) for i in range(num_concurrent)]
    latencies = await asyncio.gather(*tasks)
    
    end_time = time.time()
    
    total_time = end_time - start_time
    throughput = num_concurrent / total_time
    avg_latency = sum(latencies) / len(latencies)
    max_latency = max(latencies)
    
    print(f"   ✅ Concurrent processing: {num_concurrent} requests")
    print(f"      - Throughput: {throughput:.1f} req/sec")
    print(f"      - Average latency: {avg_latency:.2f}ms")
    print(f"      - Maximum latency: {max_latency:.2f}ms")
    
    # Performance assertions
    assert throughput > 10, f"Throughput too low: {throughput} req/sec"
    assert avg_latency < 200, f"Average latency too high: {avg_latency}ms"
    
    # Test cache performance
    cache_request = PredictionRequest(
        request_id="cache_perf_test",
        user_id="cache_user",
        prediction_type=PredictionType.SPENDING_FORECAST,
        features={"income": 5000}
    )
    
    # Prime cache
    await service.predict(cache_request)
    
    # Test cache hit performance
    cache_latencies = []
    for i in range(10):
        cache_request.request_id = f"cache_perf_{i}"
        start = time.time()
        response = await service.predict(cache_request)
        end = time.time()
        
        if response.cached:
            cache_latencies.append((end - start) * 1000)
    
    if cache_latencies:
        avg_cache_latency = sum(cache_latencies) / len(cache_latencies)
        print(f"   ✅ Cache performance: {avg_cache_latency:.2f}ms average")
        assert avg_cache_latency < 50, f"Cache latency too high: {avg_cache_latency}ms"
    
    await service.cleanup()
    print("   ✅ Performance characteristics tests passed")

async def test_error_handling():
    """Test error handling scenarios"""
    print("🚨 Testing Error Handling...")
    
    service = PredictionService()
    await service.initialize()
    
    # Test with empty features
    empty_request = PredictionRequest(
        request_id="empty_test",
        user_id="user123",
        prediction_type=PredictionType.SPENDING_FORECAST,
        features={}
    )
    
    response = await service.predict(empty_request)
    assert response.request_id == "empty_test"
    print("   ✅ Empty features handled gracefully")
    
    # Test with invalid user ID
    invalid_request = PredictionRequest(
        request_id="invalid_test",
        user_id="",
        prediction_type=PredictionType.ANOMALY_DETECTION,
        features={"transaction_amount": 100}
    )
    
    response = await service.predict(invalid_request)
    assert response.request_id == "invalid_test"
    print("   ✅ Invalid user ID handled gracefully")
    
    # Test batch with mixed valid/invalid requests
    mixed_requests = [
        PredictionRequest(
            request_id="valid_1",
            user_id="user1",
            prediction_type=PredictionType.SPENDING_FORECAST,
            features={"income": 5000}
        ),
        PredictionRequest(
            request_id="invalid_1",
            user_id="user2",
            prediction_type=PredictionType.SPENDING_FORECAST,
            features={}  # Empty features
        )
    ]
    
    batch_request = BatchPredictionRequest(
        batch_id="mixed_batch",
        requests=mixed_requests
    )
    
    batch_responses = await service.predict_batch(batch_request)
    assert len(batch_responses) == 2
    print("   ✅ Mixed valid/invalid batch handled gracefully")
    
    await service.cleanup()
    print("   ✅ Error handling tests passed")

async def test_different_prediction_types():
    """Test all prediction types"""
    print("🎯 Testing Different Prediction Types...")
    
    service = PredictionService()
    await service.initialize()
    
    test_cases = [
        (PredictionType.SPENDING_FORECAST, {"income": 5000, "age": 30}),
        (PredictionType.ANOMALY_DETECTION, {"transaction_amount": 500}),
        (PredictionType.RISK_ASSESSMENT, {"credit_score": 720}),
        (PredictionType.BUDGET_OPTIMIZATION, {"income": 4000}),
        (PredictionType.GOAL_PREDICTION, {"goal_amount": 10000})
    ]
    
    for pred_type, features in test_cases:
        request = PredictionRequest(
            request_id=f"type_test_{pred_type.value}",
            user_id="test_user",
            prediction_type=pred_type,
            features=features
        )
        
        response = await service.predict(request)
        assert response.prediction_type == pred_type
        print(f"   ✅ {pred_type.value} prediction works")
    
    await service.cleanup()
    print("   ✅ All prediction types tested successfully")

async def run_functional_tests():
    """Run all functional tests"""
    
    print("🧪 Inference Service Functional Tests")
    print("=" * 60)
    print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    start_time = time.time()
    
    try:
        # Run test suites
        await test_prediction_cache()
        test_model_router()
        await test_prediction_service()
        await test_performance_characteristics()
        await test_error_handling()
        await test_different_prediction_types()
        
        end_time = time.time()
        
        print(f"\\n🎉 All Functional Tests Passed!")
        print(f"   Total execution time: {end_time - start_time:.2f} seconds")
        print(f"   Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Summary
        print(f"\\n📊 Test Summary:")
        print(f"   ✅ Prediction Cache: All tests passed")
        print(f"   ✅ Model Router: All tests passed")
        print(f"   ✅ Prediction Service: All tests passed")
        print(f"   ✅ Performance: All tests passed")
        print(f"   ✅ Error Handling: All tests passed")
        print(f"   ✅ Prediction Types: All tests passed")
        
        print(f"\\n🚀 Service is ready for production deployment!")
        
        return True
        
    except Exception as e:
        print(f"\\n❌ Test failed: {str(e)}")
        return False

if __name__ == "__main__":
    success = asyncio.run(run_functional_tests())
    exit(0 if success else 1)