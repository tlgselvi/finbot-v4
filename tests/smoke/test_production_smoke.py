"""
Smoke tests for production ML Analytics deployment.
These tests verify basic functionality after deployment.
"""

import pytest
import asyncio
from datetime import datetime
from typing import Dict, Any

import httpx


@pytest.mark.smoke
class TestProductionSmoke:
    """Smoke tests for production deployment."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Set up smoke test environment."""
        # Use staging URL by default, can be overridden
        self.base_url = pytest.config.getoption("--staging-url", "https://staging-ml-api.finbot.com")
        self.headers = {
            "Content-Type": "application/json",
            "X-API-Key": "smoke-test-api-key",
            "User-Agent": "FinBot-SmokeTest/1.0"
        }
    
    @pytest.mark.asyncio
    async def test_health_endpoints(self):
        """Test that all health endpoints are responding."""
        health_endpoints = [
            "/health",
            "/ready",
            "/api/ml/performance/health"
        ]
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            for endpoint in health_endpoints:
                try:
                    response = await client.get(f"{self.base_url}{endpoint}")
                    assert response.status_code == 200, f"Health endpoint {endpoint} failed"
                    
                    data = response.json()
                    assert "status" in data or "healthy" in response.text.lower()
                    
                except httpx.RequestError as e:
                    pytest.fail(f"Health endpoint {endpoint} not accessible: {e}")
    
    @pytest.mark.asyncio
    async def test_anomaly_detection_basic(self):
        """Test basic anomaly detection functionality."""
        test_transaction = {
            "transaction": {
                "id": "smoke_test_txn_001",
                "user_id": "smoke_test_user",
                "amount": 150.00,
                "merchant": "Test Merchant",
                "category": "groceries",
                "timestamp": datetime.now().isoformat(),
                "location": "Test City, CA"
            }
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/api/ml/anomaly/detect",
                json=test_transaction,
                headers=self.headers
            )
            
            assert response.status_code == 200, f"Anomaly detection failed: {response.status_code}"
            
            data = response.json()
            assert data["success"] is True
            assert "anomaly_detection" in data
            assert "is_anomaly" in data["anomaly_detection"]
            assert "anomaly_score" in data["anomaly_detection"]
    
    @pytest.mark.asyncio
    async def test_risk_assessment_basic(self):
        """Test basic risk assessment functionality."""
        test_request = {
            "user_id": "smoke_test_user",
            "financial_data": {
                "monthly_income": 5000,
                "monthly_expenses": 3500,
                "debt_to_income_ratio": 0.3,
                "credit_score": 700,
                "savings_balance": 10000
            },
            "assessment_type": "loan_approval"
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/api/ml/risk/assess",
                json=test_request,
                headers=self.headers
            )
            
            assert response.status_code == 200, f"Risk assessment failed: {response.status_code}"
            
            data = response.json()
            assert data["success"] is True
            assert "risk_assessment" in data
            assert "overall_risk_score" in data["risk_assessment"]
            assert "risk_level" in data["risk_assessment"]
    
    @pytest.mark.asyncio
    async def test_budget_optimization_basic(self):
        """Test basic budget optimization functionality."""
        test_request = {
            "user_id": "smoke_test_user",
            "current_budget": {
                "housing": 1500,
                "food": 600,
                "transportation": 400,
                "entertainment": 200,
                "savings": 800
            },
            "goals": [
                {
                    "type": "emergency_fund",
                    "target_amount": 15000,
                    "target_date": "2025-12-31"
                }
            ]
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/api/ml/budget/optimize",
                json=test_request,
                headers=self.headers
            )
            
            assert response.status_code == 200, f"Budget optimization failed: {response.status_code}"
            
            data = response.json()
            assert data["success"] is True
            assert "optimization" in data
            assert "optimized_budget" in data["optimization"]
    
    @pytest.mark.asyncio
    async def test_goal_analysis_basic(self):
        """Test basic goal analysis functionality."""
        test_request = {
            "user_id": "smoke_test_user",
            "goal": {
                "id": "smoke_test_goal",
                "type": "savings",
                "target_amount": 20000,
                "current_amount": 5000,
                "target_date": "2025-06-30",
                "monthly_contribution": 800
            }
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/api/ml/goals/analyze",
                json=test_request,
                headers=self.headers
            )
            
            assert response.status_code == 200, f"Goal analysis failed: {response.status_code}"
            
            data = response.json()
            assert data["success"] is True
            assert "goal_analysis" in data
            assert "progress_percentage" in data["goal_analysis"]
            assert "on_track" in data["goal_analysis"]
    
    @pytest.mark.asyncio
    async def test_insights_generation_basic(self):
        """Test basic insights generation functionality."""
        test_request = {
            "user_id": "smoke_test_user",
            "insight_types": ["spending_patterns", "savings_opportunities"],
            "time_period": {
                "start_date": "2024-01-01",
                "end_date": "2024-01-31"
            }
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/api/ml/insights/generate",
                json=test_request,
                headers=self.headers
            )
            
            assert response.status_code == 200, f"Insights generation failed: {response.status_code}"
            
            data = response.json()
            assert data["success"] is True
            assert "insights" in data
    
    @pytest.mark.asyncio
    async def test_approval_recommendation_basic(self):
        """Test basic approval recommendation functionality."""
        test_request = {
            "approval": {
                "type": "loan",
                "amount": 15000,
                "purpose": "debt_consolidation",
                "term_months": 36
            },
            "user_context": {
                "user_id": "smoke_test_user",
                "credit_score": 700,
                "monthly_income": 5000,
                "debt_to_income_ratio": 0.3
            }
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/api/ml/approval/recommend",
                json=test_request,
                headers=self.headers
            )
            
            assert response.status_code == 200, f"Approval recommendation failed: {response.status_code}"
            
            data = response.json()
            assert data["success"] is True
            assert "recommendation" in data
            assert "decision" in data["recommendation"]
    
    @pytest.mark.asyncio
    async def test_performance_metrics_basic(self):
        """Test basic performance metrics functionality."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.base_url}/api/ml/performance/metrics?time_range=1h",
                headers=self.headers
            )
            
            assert response.status_code == 200, f"Performance metrics failed: {response.status_code}"
            
            data = response.json()
            assert "metrics" in data or "success" in data
    
    @pytest.mark.asyncio
    async def test_model_info_basic(self):
        """Test basic model information functionality."""
        models_to_test = [
            "anomaly-detection-v1",
            "risk-assessment-v1",
            "budget-optimization-v1"
        ]
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            for model_id in models_to_test:
                response = await client.get(
                    f"{self.base_url}/api/ml/models/{model_id}/info",
                    headers=self.headers
                )
                
                # Model might not exist, so 404 is acceptable
                assert response.status_code in [200, 404], f"Model info request failed: {response.status_code}"
                
                if response.status_code == 200:
                    data = response.json()
                    assert "model" in data or "success" in data
    
    @pytest.mark.asyncio
    async def test_batch_processing_basic(self):
        """Test basic batch processing functionality."""
        test_transactions = [
            {
                "id": f"smoke_batch_txn_{i}",
                "user_id": "smoke_test_user",
                "amount": 50.0 + i * 10,
                "merchant": f"Test Merchant {i}",
                "category": "groceries",
                "timestamp": datetime.now().isoformat()
            }
            for i in range(5)
        ]
        
        test_request = {"transactions": test_transactions}
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{self.base_url}/api/ml/anomaly/batch",
                json=test_request,
                headers=self.headers
            )
            
            assert response.status_code == 200, f"Batch processing failed: {response.status_code}"
            
            data = response.json()
            assert data["success"] is True
            assert "results" in data
            assert "summary" in data
    
    @pytest.mark.asyncio
    async def test_error_handling(self):
        """Test error handling for invalid requests."""
        # Test invalid transaction data
        invalid_transaction = {
            "transaction": {
                "id": "invalid_txn",
                "user_id": "",  # Invalid empty user_id
                "amount": -100,  # Invalid negative amount
                "merchant": "",
                "category": "invalid_category"
            }
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/api/ml/anomaly/detect",
                json=invalid_transaction,
                headers=self.headers
            )
            
            # Should return 400 Bad Request
            assert response.status_code == 400, "Invalid request should return 400"
            
            data = response.json()
            assert data["success"] is False
            assert "error" in data
    
    @pytest.mark.asyncio
    async def test_authentication_required(self):
        """Test that authentication is required for protected endpoints."""
        # Test without API key
        headers_no_auth = {"Content-Type": "application/json"}
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.base_url}/api/ml/performance/metrics",
                headers=headers_no_auth
            )
            
            # Should require authentication
            assert response.status_code in [401, 403], "Should require authentication"
    
    @pytest.mark.asyncio
    async def test_rate_limiting(self):
        """Test rate limiting functionality."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Make multiple rapid requests
            tasks = []
            for i in range(20):
                task = client.get(f"{self.base_url}/health", headers=self.headers)
                tasks.append(task)
            
            responses = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Check if any requests were rate limited
            rate_limited_count = 0
            successful_count = 0
            
            for response in responses:
                if isinstance(response, httpx.Response):
                    if response.status_code == 429:  # Too Many Requests
                        rate_limited_count += 1
                    elif response.status_code == 200:
                        successful_count += 1
            
            # At least some requests should succeed
            assert successful_count > 0, "No requests succeeded"
            
            # Rate limiting might or might not be enabled
            if rate_limited_count > 0:
                print(f"Rate limiting detected: {rate_limited_count} requests limited")


@pytest.mark.smoke
@pytest.mark.critical
class TestCriticalFunctionality:
    """Critical smoke tests that must pass for system to be considered healthy."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Set up critical test environment."""
        self.base_url = pytest.config.getoption("--staging-url", "https://staging-ml-api.finbot.com")
        self.headers = {
            "Content-Type": "application/json",
            "X-API-Key": "critical-smoke-test-key"
        }
    
    @pytest.mark.asyncio
    async def test_system_availability(self):
        """Test that the system is available and responding."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{self.base_url}/health")
            assert response.status_code == 200, "System not available"
    
    @pytest.mark.asyncio
    async def test_core_ml_pipeline_functional(self):
        """Test that core ML pipeline is functional."""
        # Test the most critical ML functionality
        test_transaction = {
            "transaction": {
                "id": "critical_test_001",
                "user_id": "critical_test_user",
                "amount": 100.00,
                "merchant": "Critical Test",
                "category": "test",
                "timestamp": datetime.now().isoformat()
            }
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{self.base_url}/api/ml/anomaly/detect",
                json=test_transaction,
                headers=self.headers
            )
            
            assert response.status_code == 200, "Core ML pipeline not functional"
            data = response.json()
            assert data["success"] is True, "ML pipeline returned error"
    
    @pytest.mark.asyncio
    async def test_database_connectivity(self):
        """Test database connectivity through API."""
        # This would test an endpoint that requires database access
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.base_url}/api/ml/users/test_user/profile",
                headers=self.headers
            )
            
            # 200 (found) or 404 (not found) are both acceptable
            # 500 would indicate database connectivity issues
            assert response.status_code != 500, "Database connectivity issues detected"
    
    @pytest.mark.asyncio
    async def test_cache_functionality(self):
        """Test cache functionality through repeated requests."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Make the same request twice
            request_data = {
                "user_id": "cache_test_user",
                "financial_data": {
                    "monthly_income": 5000,
                    "credit_score": 700
                },
                "assessment_type": "quick"
            }
            
            # First request
            response1 = await client.post(
                f"{self.base_url}/api/ml/risk/assess",
                json=request_data,
                headers=self.headers
            )
            
            # Second request (should be faster if cached)
            response2 = await client.post(
                f"{self.base_url}/api/ml/risk/assess",
                json=request_data,
                headers=self.headers
            )
            
            assert response1.status_code == 200, "First request failed"
            assert response2.status_code == 200, "Second request failed"
            
            # Both should return the same result
            data1 = response1.json()
            data2 = response2.json()
            assert data1["success"] == data2["success"], "Inconsistent responses"


def pytest_configure(config):
    """Configure pytest for smoke tests."""
    config.addinivalue_line("markers", "smoke: mark test as a smoke test")
    config.addinivalue_line("markers", "critical: mark test as critical functionality")


def pytest_addoption(parser):
    """Add command line options for smoke tests."""
    parser.addoption(
        "--staging-url",
        action="store",
        default="https://staging-ml-api.finbot.com",
        help="Staging URL for smoke tests"
    )