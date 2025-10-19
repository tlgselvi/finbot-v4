"""
Test Suite for Prediction API Endpoints
Integration and API testing for ML prediction service
"""

import pytest
import asyncio
import json
import uuid
from typing import Dict, Any
from datetime import datetime
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, AsyncMock

# Import API to test
from api.prediction_api import app, get_prediction_service
from services.prediction_service import PredictionService, PredictionType

class TestPredictionAPI:
    """Test prediction API endpoints"""
    
    @pytest.fixture
    def client(self):
        """Create test client"""
        return TestClient(app)
    
    @pytest.fixture
    async def mock_service(self):
        """Create mock prediction service"""
        service = Mock(spec=PredictionService)
        service.is_initialized = True
        
        # Mock predict method
        async def mock_predict(request):
            from services.prediction_service import PredictionResponse
            return PredictionResponse(
                request_id=request.request_id,
                user_id=request.user_id,
                prediction_type=request.prediction_type,
                predictions={"test_prediction": 123.45},
                confidence_scores={"confidence": 0.85},
                model_info={"model_id": "test_model", "version": "1.0.0"},
                processing_time_ms=25.0,
                cached=False
            )
        
        service.predict = AsyncMock(side_effect=mock_predict)
        
        # Mock batch predict method
        async def mock_predict_batch(batch_request):
            responses = []
            for req in batch_request.requests:
                response = await mock_predict(req)
                responses.append(response)
            return responses
        
        service.predict_batch = AsyncMock(side_effect=mock_predict_batch)
        
        # Mock service status
        service.get_service_status.return_value = {
            "service_status": "healthy",
            "metrics": {
                "total_requests": 100,
                "successful_predictions": 95,
                "failed_predictions": 5,
                "average_latency_ms": 45.2,
                "cache_hit_rate": 0
            },
            "cache_stats": {
                "total_requests": 100,
                "cache_hits": 30,
                "cache_misses": 70,
                "hit_rate_percent": 30.0,
                "memory_cache_size": 25
            },
            "model_status": {
                "spending-predictor": {
                    "healthy": True,
                    "endpoint": "http://localhost:8001",
                    "version": "1.0.0"
                }
            },
            "performance": {
                "total_requests": 100,
                "success_rate": 95.0,
                "average_latency_ms": 45.2,
                "cache_hit_rate": 30.0
            }
        }
        
        # Mock cache stats
        service.cache = Mock()
        service.cache.get_stats.return_value = {
            "total_requests": 100,
            "cache_hits": 30,
            "cache_misses": 70,
            "hit_rate_percent": 30.0,
            "memory_cache_size": 25
        }
        
        return service
    
    def test_health_check(self, client):
        """Test health check endpoint"""
        response = client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
        assert data["service"] == "prediction-api"
    
    def test_get_prediction_types(self, client):
        """Test prediction types endpoint"""
        response = client.get("/predict/types")
        
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) == 5  # Number of prediction types
        
        # Check structure
        for item in data:
            assert "type" in item
            assert "name" in item
            assert "description" in item
        
        # Check specific types exist
        types = [item["type"] for item in data]
        assert "spending_forecast" in types
        assert "anomaly_detection" in types
        assert "risk_assessment" in types
    
    def test_single_prediction_success(self, client, mock_service):
        """Test successful single prediction"""
        # Override dependency
        app.dependency_overrides[get_prediction_service] = lambda: mock_service
        
        request_data = {
            "user_id": "user123",
            "prediction_type": "spending_forecast",
            "features": {
                "income": 5000,
                "age": 30,
                "historical_spending": [1200, 1300, 1250]
            },
            "cache_ttl": 300,
            "priority": "normal"
        }
        
        response = client.post("/predict", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Check response structure
        assert "request_id" in data
        assert data["user_id"] == "user123"
        assert data["prediction_type"] == "spending_forecast"
        assert "predictions" in data
        assert "confidence_scores" in data
        assert "model_info" in data
        assert "processing_time_ms" in data
        assert "cached" in data
        assert "timestamp" in data
        
        # Verify service was called
        mock_service.predict.assert_called_once()
        
        # Clean up
        app.dependency_overrides.clear()
    
    def test_single_prediction_validation_error(self, client):
        """Test single prediction with validation errors"""
        # Missing required fields
        request_data = {
            "user_id": "user123"
            # Missing prediction_type and features
        }
        
        response = client.post("/predict", json=request_data)
        assert response.status_code == 422  # Validation error
    
    def test_single_prediction_invalid_type(self, client):
        """Test single prediction with invalid prediction type"""
        request_data = {
            "user_id": "user123",
            "prediction_type": "invalid_type",
            "features": {"income": 5000}
        }
        
        response = client.post("/predict", json=request_data)
        assert response.status_code == 422  # Validation error
    
    def test_batch_prediction_success(self, client, mock_service):
        """Test successful batch prediction"""
        app.dependency_overrides[get_prediction_service] = lambda: mock_service
        
        request_data = {
            "requests": [
                {
                    "user_id": "user1",
                    "prediction_type": "spending_forecast",
                    "features": {"income": 5000, "age": 30}
                },
                {
                    "user_id": "user2",
                    "prediction_type": "anomaly_detection",
                    "features": {"transaction_amount": 500}
                }
            ],
            "max_parallel": 5,
            "timeout_seconds": 60
        }
        
        response = client.post("/predict/batch", json=request_data)
        
        assert response.status_code == 200
        data = response.json()
        
        # Check response structure
        assert "batch_id" in data
        assert data["total_requests"] == 2
        assert "successful_predictions" in data
        assert "failed_predictions" in data
        assert "processing_time_ms" in data
        assert "results" in data
        assert len(data["results"]) == 2
        
        # Verify service was called
        mock_service.predict_batch.assert_called_once()
        
        app.dependency_overrides.clear()
    
    def test_batch_prediction_validation_error(self, client):
        """Test batch prediction with validation errors"""
        # Empty requests list
        request_data = {
            "requests": []
        }
        
        response = client.post("/predict/batch", json=request_data)
        assert response.status_code == 422  # Validation error
        
        # Too many requests
        request_data = {
            "requests": [
                {
                    "user_id": f"user{i}",
                    "prediction_type": "spending_forecast",
                    "features": {"income": 5000}
                }
                for i in range(1001)  # Exceeds limit
            ]
        }
        
        response = client.post("/predict/batch", json=request_data)
        assert response.status_code == 422  # Validation error
    
    def test_service_status(self, client, mock_service):
        """Test service status endpoint"""
        app.dependency_overrides[get_prediction_service] = lambda: mock_service
        
        response = client.get("/status")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check response structure
        assert data["service_status"] == "healthy"
        assert "metrics" in data
        assert "cache_stats" in data
        assert "model_status" in data
        assert "performance" in data
        
        app.dependency_overrides.clear()
    
    def test_model_info(self, client, mock_service):
        """Test model info endpoint"""
        app.dependency_overrides[get_prediction_service] = lambda: mock_service
        
        response = client.get("/models")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "models" in data
        assert "total_models" in data
        assert "healthy_models" in data
        
        app.dependency_overrides.clear()
    
    def test_cache_stats(self, client, mock_service):
        """Test cache stats endpoint"""
        app.dependency_overrides[get_prediction_service] = lambda: mock_service
        
        response = client.get("/cache/stats")
        
        assert response.status_code == 200
        data = response.json()
        
        assert "total_requests" in data
        assert "cache_hits" in data
        assert "cache_misses" in data
        assert "hit_rate_percent" in data
        
        app.dependency_overrides.clear()
    
    def test_cache_clear(self, client, mock_service):
        """Test cache clear endpoint"""
        app.dependency_overrides[get_prediction_service] = lambda: mock_service
        
        # Mock cache clear operations
        mock_service.cache.memory_cache = Mock()
        mock_service.cache.memory_cache.clear = Mock()
        mock_service.cache.redis_client = Mock()
        mock_service.cache.redis_client.flushdb = AsyncMock()
        mock_service.cache._lock = Mock()
        mock_service.cache._lock.__enter__ = Mock()
        mock_service.cache._lock.__exit__ = Mock()
        
        response = client.delete("/cache/clear")
        
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Cache cleared successfully"
        
        app.dependency_overrides.clear()
    
    def test_metrics_endpoint(self, client, mock_service):
        """Test metrics endpoint"""
        app.dependency_overrides[get_prediction_service] = lambda: mock_service
        
        response = client.get("/metrics")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should include all metrics from service status
        assert "total_requests" in data
        assert "cache_stats" in data
        assert "model_health" in data
        assert "performance_summary" in data
        
        app.dependency_overrides.clear()
    
    def test_service_unavailable(self, client):
        """Test behavior when service is unavailable"""
        # Override with unavailable service
        def get_unavailable_service():
            raise Exception("Service unavailable")
        
        app.dependency_overrides[get_prediction_service] = get_unavailable_service
        
        response = client.get("/status")
        assert response.status_code == 503  # Service unavailable
        
        app.dependency_overrides.clear()

class TestAPIPerformance:
    """Performance tests for API endpoints"""
    
    @pytest.fixture
    def client(self):
        return TestClient(app)
    
    @pytest.fixture
    async def fast_mock_service(self):
        """Create fast mock service for performance testing"""
        service = Mock(spec=PredictionService)
        service.is_initialized = True
        
        async def fast_predict(request):
            from services.prediction_service import PredictionResponse
            return PredictionResponse(
                request_id=request.request_id,
                user_id=request.user_id,
                prediction_type=request.prediction_type,
                predictions={"fast_prediction": 42.0},
                confidence_scores={"confidence": 0.9},
                model_info={"model_id": "fast_model"},
                processing_time_ms=1.0,  # Very fast
                cached=True
            )
        
        service.predict = AsyncMock(side_effect=fast_predict)
        return service
    
    def test_api_latency(self, client, fast_mock_service):
        """Test API endpoint latency"""
        app.dependency_overrides[get_prediction_service] = lambda: fast_mock_service
        
        request_data = {
            "user_id": "user123",
            "prediction_type": "spending_forecast",
            "features": {"income": 5000}
        }
        
        import time
        
        # Warmup
        for _ in range(5):
            client.post("/predict", json=request_data)
        
        # Measure latency
        latencies = []
        for _ in range(20):
            start_time = time.time()
            response = client.post("/predict", json=request_data)
            end_time = time.time()
            
            assert response.status_code == 200
            latency_ms = (end_time - start_time) * 1000
            latencies.append(latency_ms)
        
        avg_latency = sum(latencies) / len(latencies)
        max_latency = max(latencies)
        
        # API overhead should be minimal
        assert avg_latency < 50  # <50ms average including service call
        assert max_latency < 100  # <100ms maximum
        
        app.dependency_overrides.clear()
    
    def test_concurrent_api_requests(self, client, fast_mock_service):
        """Test concurrent API request handling"""
        app.dependency_overrides[get_prediction_service] = lambda: fast_mock_service
        
        import concurrent.futures
        import time
        
        def make_request(i):
            request_data = {
                "user_id": f"user{i}",
                "prediction_type": "anomaly_detection",
                "features": {"transaction_amount": 100 + i}
            }
            return client.post("/predict", json=request_data)
        
        num_requests = 50
        
        start_time = time.time()
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(make_request, i) for i in range(num_requests)]
            responses = [future.result() for future in concurrent.futures.as_completed(futures)]
        
        end_time = time.time()
        
        # Verify all requests succeeded
        assert len(responses) == num_requests
        for response in responses:
            assert response.status_code == 200
        
        # Performance check
        total_time = end_time - start_time
        throughput = num_requests / total_time
        
        assert throughput > 20  # >20 req/sec through API
        
        app.dependency_overrides.clear()

class TestAPIErrorHandling:
    """Test API error handling and edge cases"""
    
    @pytest.fixture
    def client(self):
        return TestClient(app)
    
    def test_malformed_json(self, client):
        """Test handling of malformed JSON"""
        response = client.post(
            "/predict",
            data="invalid json",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 422
    
    def test_missing_content_type(self, client):
        """Test handling of missing content type"""
        response = client.post("/predict", data='{"test": "data"}')
        # FastAPI should handle this gracefully
        assert response.status_code in [422, 400]
    
    def test_oversized_request(self, client):
        """Test handling of oversized requests"""
        # Create very large request
        large_features = {f"feature_{i}": [j for j in range(1000)] for i in range(100)}
        
        request_data = {
            "user_id": "user123",
            "prediction_type": "spending_forecast",
            "features": large_features
        }
        
        response = client.post("/predict", json=request_data)
        # Should handle large requests (or reject appropriately)
        assert response.status_code in [200, 413, 422]
    
    def test_invalid_http_methods(self, client):
        """Test invalid HTTP methods"""
        # GET on POST endpoint
        response = client.get("/predict")
        assert response.status_code == 405  # Method not allowed
        
        # PUT on POST endpoint
        response = client.put("/predict")
        assert response.status_code == 405
    
    def test_nonexistent_endpoints(self, client):
        """Test nonexistent endpoints"""
        response = client.get("/nonexistent")
        assert response.status_code == 404
        
        response = client.post("/predict/nonexistent")
        assert response.status_code == 404
    
    def test_service_exception_handling(self, client):
        """Test handling of service exceptions"""
        def get_failing_service():
            service = Mock(spec=PredictionService)
            service.is_initialized = True
            service.predict = AsyncMock(side_effect=Exception("Service error"))
            return service
        
        app.dependency_overrides[get_prediction_service] = get_failing_service
        
        request_data = {
            "user_id": "user123",
            "prediction_type": "spending_forecast",
            "features": {"income": 5000}
        }
        
        response = client.post("/predict", json=request_data)
        assert response.status_code == 500
        
        data = response.json()
        assert "error" in data
        
        app.dependency_overrides.clear()

class TestAPIDocumentation:
    """Test API documentation and OpenAPI spec"""
    
    @pytest.fixture
    def client(self):
        return TestClient(app)
    
    def test_openapi_spec(self, client):
        """Test OpenAPI specification generation"""
        response = client.get("/openapi.json")
        assert response.status_code == 200
        
        spec = response.json()
        assert "openapi" in spec
        assert "info" in spec
        assert "paths" in spec
        
        # Check key endpoints are documented
        paths = spec["paths"]
        assert "/predict" in paths
        assert "/predict/batch" in paths
        assert "/health" in paths
        assert "/status" in paths
    
    def test_docs_endpoint(self, client):
        """Test documentation endpoint"""
        response = client.get("/docs")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
    
    def test_redoc_endpoint(self, client):
        """Test ReDoc documentation endpoint"""
        response = client.get("/redoc")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]

# Integration tests
class TestAPIIntegration:
    """Integration tests with real service components"""
    
    @pytest.mark.integration
    def test_full_prediction_flow(self):
        """Test complete prediction flow with real service"""
        # This would test with actual service instance
        # Skipped in unit tests, run separately for integration testing
        pass
    
    @pytest.mark.integration
    def test_api_with_real_cache(self):
        """Test API with real cache backend"""
        # This would test with actual Redis/cache
        # Skipped in unit tests
        pass
    
    @pytest.mark.integration
    def test_api_with_model_endpoints(self):
        """Test API with real model endpoints"""
        # This would test with actual ML model services
        # Skipped in unit tests
        pass

if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v", "--tb=short"])