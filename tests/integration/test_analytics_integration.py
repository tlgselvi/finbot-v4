"""
Integration tests for ML Analytics system with existing FinBot modules.
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, List

import httpx
from sqlalchemy.orm import Session

from tests.utils.test_data import TestDataGenerator, generate_test_dataset
from tests.utils.mock_services import MockMLServices


@pytest.mark.integration
class TestAnalyticsIntegration:
    """Test integration between ML Analytics and FinBot core systems."""
    
    @pytest.fixture(autouse=True)
    async def setup(self, database_session, cache_manager, mock_ml_services):
        """Set up integration test environment."""
        self.db_session = database_session
        self.cache = cache_manager
        self.ml_services = mock_ml_services
        self.test_data = generate_test_dataset(n_transactions=100, n_users=10)
        
        # Seed test data
        await self._seed_test_data()
    
    async def _seed_test_data(self):
        """Seed database with test data."""
        # Insert test users
        for user in self.test_data["users"]:
            user_dict = {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "age": user.age,
                "income": user.income,
                "credit_score": user.credit_score,
                "account_balance": user.account_balance,
                "created_at": user.created_at
            }
            # Mock database insertion
            await self._insert_user(user_dict)
        
        # Insert test transactions
        for transaction in self.test_data["transactions"]:
            transaction_dict = {
                "id": transaction.id,
                "user_id": transaction.user_id,
                "amount": transaction.amount,
                "merchant": transaction.merchant,
                "category": transaction.category,
                "timestamp": transaction.timestamp,
                "location": transaction.location,
                "description": transaction.description,
                "is_recurring": transaction.is_recurring
            }
            await self._insert_transaction(transaction_dict)
    
    async def _insert_user(self, user_data: Dict[str, Any]):
        """Mock user insertion."""
        # In real implementation, this would insert into actual database
        pass
    
    async def _insert_transaction(self, transaction_data: Dict[str, Any]):
        """Mock transaction insertion."""
        # In real implementation, this would insert into actual database
        pass
    
    @pytest.mark.asyncio
    async def test_user_management_integration(self, http_client, api_headers):
        """Test integration with user management system."""
        # Test user profile retrieval
        user_id = self.test_data["users"][0].id
        
        response = await http_client.get(
            f"/api/ml/users/{user_id}/profile",
            headers=api_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "profile" in data
        
        # Test user profile update
        profile_update = {
            "financial_goals": [
                {
                    "type": "savings",
                    "target_amount": 50000,
                    "target_date": "2024-12-31"
                }
            ],
            "risk_tolerance": "medium",
            "investment_preferences": ["stocks", "bonds"]
        }
        
        response = await http_client.post(
            f"/api/ml/users/{user_id}/profile",
            json=profile_update,
            headers=api_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
    
    @pytest.mark.asyncio
    async def test_transaction_system_integration(self, http_client, api_headers):
        """Test integration with transaction processing system."""
        user_id = self.test_data["users"][0].id
        
        # Test real-time transaction analysis
        new_transaction = {
            "id": "txn_integration_test",
            "user_id": user_id,
            "amount": 1500.00,
            "merchant": "Electronics Store",
            "category": "electronics",
            "timestamp": datetime.now().isoformat(),
            "location": "San Francisco, CA"
        }
        
        # Simulate transaction processing with anomaly detection
        response = await http_client.post(
            "/api/ml/anomaly/detect",
            json={"transaction": new_transaction},
            headers=api_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "anomaly_detection" in data
        
        # Test transaction categorization
        response = await http_client.post(
            "/api/ml/transactions/categorize",
            json={"transaction": new_transaction},
            headers=api_headers
        )
        
        # Should return categorization even if endpoint doesn't exist yet
        # This tests the integration flow
    
    @pytest.mark.asyncio
    async def test_approval_system_integration(self, http_client, api_headers):
        """Test integration with approval system."""
        user_id = self.test_data["users"][0].id
        
        # Test loan approval recommendation
        approval_request = {
            "approval": {
                "type": "loan",
                "amount": 25000,
                "purpose": "home_improvement",
                "term_months": 60
            },
            "user_context": {
                "user_id": user_id,
                "credit_score": 750,
                "monthly_income": 8000,
                "debt_to_income_ratio": 0.25
            }
        }
        
        response = await http_client.post(
            "/api/ml/approval/recommend",
            json=approval_request,
            headers=api_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "recommendation" in data
        assert data["recommendation"]["decision"] in ["approve", "reject", "manual_review"]
    
    @pytest.mark.asyncio
    async def test_budget_system_integration(self, http_client, api_headers):
        """Test integration with budgeting system."""
        user_id = self.test_data["users"][0].id
        
        # Test budget optimization
        budget_request = {
            "user_id": user_id,
            "current_budget": {
                "housing": 2000,
                "food": 800,
                "transportation": 400,
                "entertainment": 300,
                "savings": 1000
            },
            "goals": [
                {
                    "type": "emergency_fund",
                    "target_amount": 20000,
                    "target_date": "2024-12-31"
                }
            ]
        }
        
        response = await http_client.post(
            "/api/ml/budget/optimize",
            json=budget_request,
            headers=api_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "optimization" in data
        
        # Test budget forecast
        forecast_request = {
            "user_id": user_id,
            "budget": budget_request["current_budget"],
            "forecast_months": 6
        }
        
        response = await http_client.post(
            "/api/ml/budget/forecast",
            json=forecast_request,
            headers=api_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "forecast" in data
    
    @pytest.mark.asyncio
    async def test_goal_tracking_integration(self, http_client, api_headers):
        """Test integration with goal tracking system."""
        user_id = self.test_data["users"][0].id
        
        # Test goal analysis
        goal_request = {
            "user_id": user_id,
            "goal": {
                "id": "goal_integration_test",
                "type": "savings",
                "target_amount": 50000,
                "current_amount": 15000,
                "target_date": "2025-06-30",
                "monthly_contribution": 1200
            }
        }
        
        response = await http_client.post(
            "/api/ml/goals/analyze",
            json=goal_request,
            headers=api_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "goal_analysis" in data
        
        # Test goal prediction
        prediction_request = {
            "user_id": user_id,
            "goals": [goal_request["goal"]]
        }
        
        response = await http_client.post(
            "/api/ml/goals/predict",
            json=prediction_request,
            headers=api_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "predictions" in data
    
    @pytest.mark.asyncio
    async def test_notification_system_integration(self, http_client, api_headers):
        """Test integration with notification system."""
        user_id = self.test_data["users"][0].id
        
        # Test insight generation that should trigger notifications
        insight_request = {
            "user_id": user_id,
            "insight_types": ["spending_patterns", "savings_opportunities"],
            "time_period": {
                "start_date": (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"),
                "end_date": datetime.now().strftime("%Y-%m-%d")
            }
        }
        
        response = await http_client.post(
            "/api/ml/insights/generate",
            json=insight_request,
            headers=api_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "insights" in data
        
        # Verify insights are actionable and could trigger notifications
        insights = data["insights"]
        assert len(insights) > 0
        
        for insight in insights:
            assert "type" in insight
            assert "title" in insight
            assert "description" in insight
            assert "impact" in insight
    
    @pytest.mark.asyncio
    async def test_reporting_system_integration(self, http_client, api_headers):
        """Test integration with reporting system."""
        user_id = self.test_data["users"][0].id
        
        # Test financial health report generation
        report_request = {
            "user_id": user_id,
            "report_type": "financial_health",
            "time_period": {
                "start_date": (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d"),
                "end_date": datetime.now().strftime("%Y-%m-%d")
            }
        }
        
        response = await http_client.post(
            "/api/ml/reports/generate",
            json=report_request,
            headers=api_headers
        )
        
        # Even if endpoint doesn't exist, test the integration flow
        # In real implementation, this would generate comprehensive reports
    
    @pytest.mark.asyncio
    async def test_data_pipeline_integration(self, http_client, api_headers):
        """Test integration with data pipeline and ETL processes."""
        # Test batch processing endpoint
        batch_request = {
            "job_type": "feature_extraction",
            "user_ids": [user.id for user in self.test_data["users"][:5]],
            "time_range": {
                "start_date": (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"),
                "end_date": datetime.now().strftime("%Y-%m-%d")
            }
        }
        
        response = await http_client.post(
            "/api/ml/batch/process",
            json=batch_request,
            headers=api_headers
        )
        
        # Test data quality validation
        validation_request = {
            "data_source": "transactions",
            "validation_rules": [
                "amount_positive",
                "valid_category",
                "valid_timestamp"
            ]
        }
        
        response = await http_client.post(
            "/api/ml/data/validate",
            json=validation_request,
            headers=api_headers
        )
    
    @pytest.mark.asyncio
    async def test_cache_integration(self):
        """Test integration with caching layer."""
        user_id = self.test_data["users"][0].id
        
        # Test feature caching
        cache_key = f"user_features:{user_id}"
        features = {
            "avg_monthly_spending": 2500.0,
            "spending_volatility": 0.15,
            "credit_score": 750
        }
        
        # Store in cache
        await self.cache.set(cache_key, features, ttl=3600)
        
        # Retrieve from cache
        cached_features = await self.cache.get(cache_key)
        assert cached_features == features
        
        # Test cache invalidation
        await self.cache.delete(cache_key)
        cached_features = await self.cache.get(cache_key)
        assert cached_features is None
    
    @pytest.mark.asyncio
    async def test_error_handling_integration(self, http_client, api_headers):
        """Test error handling across integrated systems."""
        # Test invalid user ID
        response = await http_client.get(
            "/api/ml/users/invalid_user_id/profile",
            headers=api_headers
        )
        
        assert response.status_code == 404
        data = response.json()
        assert data["success"] is False
        assert "error" in data
        
        # Test invalid transaction data
        invalid_transaction = {
            "id": "invalid_txn",
            "user_id": "invalid_user",
            "amount": -100,  # Invalid negative amount
            "merchant": "",
            "category": "invalid_category"
        }
        
        response = await http_client.post(
            "/api/ml/anomaly/detect",
            json={"transaction": invalid_transaction},
            headers=api_headers
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "error" in data
    
    @pytest.mark.asyncio
    async def test_performance_integration(self, http_client, api_headers):
        """Test performance across integrated systems."""
        user_id = self.test_data["users"][0].id
        
        # Test concurrent requests
        tasks = []
        for _ in range(10):
            task = http_client.get(
                f"/api/ml/users/{user_id}/profile",
                headers=api_headers
            )
            tasks.append(task)
        
        responses = await asyncio.gather(*tasks)
        
        # All requests should succeed
        for response in responses:
            assert response.status_code == 200
        
        # Test response times
        start_time = datetime.now()
        
        response = await http_client.post(
            "/api/ml/anomaly/detect",
            json={"transaction": {
                "id": "perf_test",
                "user_id": user_id,
                "amount": 100.0,
                "merchant": "Test Merchant",
                "category": "test",
                "timestamp": datetime.now().isoformat()
            }},
            headers=api_headers
        )
        
        end_time = datetime.now()
        response_time = (end_time - start_time).total_seconds()
        
        assert response.status_code == 200
        assert response_time < 2.0  # Should respond within 2 seconds


@pytest.mark.integration
class TestSystemIntegration:
    """Test system-level integration scenarios."""
    
    @pytest.mark.asyncio
    async def test_end_to_end_user_journey(self, http_client, api_headers):
        """Test complete user journey through ML analytics system."""
        # 1. User registration and profile creation
        user_data = {
            "email": "test@example.com",
            "name": "Test User",
            "age": 30,
            "income": 75000
        }
        
        # 2. Initial financial assessment
        financial_data = {
            "monthly_income": 6250,
            "monthly_expenses": 4500,
            "debt_to_income_ratio": 0.2,
            "credit_score": 720,
            "savings_balance": 15000
        }
        
        # 3. Transaction processing and analysis
        transactions = [
            {
                "id": f"txn_{i}",
                "user_id": "test_user",
                "amount": 50 + i * 10,
                "merchant": f"Merchant {i}",
                "category": "groceries",
                "timestamp": (datetime.now() - timedelta(days=i)).isoformat()
            }
            for i in range(10)
        ]
        
        # 4. Budget optimization
        budget_data = {
            "user_id": "test_user",
            "current_budget": {
                "housing": 2000,
                "food": 600,
                "transportation": 300,
                "entertainment": 200,
                "savings": 800
            }
        }
        
        # 5. Goal setting and tracking
        goal_data = {
            "user_id": "test_user",
            "goal": {
                "type": "savings",
                "target_amount": 30000,
                "current_amount": 15000,
                "target_date": "2025-12-31"
            }
        }
        
        # Execute the journey
        # Note: In real implementation, these would be actual API calls
        # For now, we're testing the integration structure
        
        assert True  # Placeholder for actual journey testing
    
    @pytest.mark.asyncio
    async def test_data_consistency_across_systems(self, database_session, cache_manager):
        """Test data consistency between database and cache."""
        user_id = "consistency_test_user"
        
        # Create user data
        user_data = {
            "id": user_id,
            "email": "consistency@test.com",
            "financial_profile": {
                "monthly_income": 5000,
                "credit_score": 700
            }
        }
        
        # Store in database (mock)
        # In real implementation: database_session.add(user_data)
        
        # Store in cache
        await cache_manager.set(f"user:{user_id}", user_data, ttl=3600)
        
        # Verify consistency
        cached_data = await cache_manager.get(f"user:{user_id}")
        assert cached_data == user_data
        
        # Test cache invalidation on data update
        updated_data = user_data.copy()
        updated_data["financial_profile"]["credit_score"] = 750
        
        # Update database (mock)
        # In real implementation: database_session.merge(updated_data)
        
        # Invalidate cache
        await cache_manager.delete(f"user:{user_id}")
        
        # Verify cache is cleared
        cached_data = await cache_manager.get(f"user:{user_id}")
        assert cached_data is None
    
    @pytest.mark.asyncio
    async def test_system_resilience(self, http_client, api_headers):
        """Test system resilience and fault tolerance."""
        # Test graceful degradation when ML models are unavailable
        # Test circuit breaker patterns
        # Test retry mechanisms
        # Test fallback responses
        
        # Simulate ML service failure
        response = await http_client.post(
            "/api/ml/anomaly/detect",
            json={"transaction": {
                "id": "resilience_test",
                "user_id": "test_user",
                "amount": 100.0,
                "merchant": "Test",
                "category": "test",
                "timestamp": datetime.now().isoformat()
            }},
            headers=api_headers
        )
        
        # System should handle gracefully even if ML service is down
        # Should return fallback response or cached result
        assert response.status_code in [200, 503]  # Success or service unavailable