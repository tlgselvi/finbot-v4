"""
Performance tests for FinBot ML Analytics API using Locust.
"""

import json
import random
from datetime import datetime, timedelta
from typing import Dict, Any

from locust import HttpUser, task, between


class MLAnalyticsUser(HttpUser):
    """Simulate user behavior for ML Analytics API."""
    
    wait_time = between(1, 3)  # Wait 1-3 seconds between requests
    
    def on_start(self):
        """Initialize user session."""
        self.api_key = "test-api-key"
        self.headers = {
            "Content-Type": "application/json",
            "X-API-Key": self.api_key,
            "Authorization": "Bearer test-token"
        }
        
        # Generate test user data
        self.user_id = f"user_{random.randint(1000, 9999)}"
        self.test_data = self._generate_test_data()
    
    def _generate_test_data(self) -> Dict[str, Any]:
        """Generate test data for API requests."""
        return {
            "transaction": {
                "id": f"txn_{random.randint(100000, 999999)}",
                "user_id": self.user_id,
                "amount": round(random.uniform(10, 1000), 2),
                "merchant": random.choice([
                    "Starbucks", "Amazon", "Walmart", "Target", "McDonald's"
                ]),
                "category": random.choice([
                    "restaurants", "shopping", "groceries", "entertainment", "gas"
                ]),
                "timestamp": datetime.now().isoformat(),
                "location": "San Francisco, CA"
            },
            "financial_data": {
                "monthly_income": random.uniform(3000, 10000),
                "monthly_expenses": random.uniform(2000, 8000),
                "debt_to_income_ratio": random.uniform(0.1, 0.5),
                "credit_score": random.randint(300, 850),
                "savings_balance": random.uniform(1000, 50000)
            },
            "budget": {
                "housing": random.uniform(1000, 3000),
                "food": random.uniform(400, 1000),
                "transportation": random.uniform(200, 800),
                "entertainment": random.uniform(100, 500),
                "savings": random.uniform(500, 2000)
            },
            "goal": {
                "id": f"goal_{random.randint(1000, 9999)}",
                "type": "savings",
                "target_amount": random.uniform(10000, 100000),
                "current_amount": random.uniform(1000, 50000),
                "target_date": (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d"),
                "monthly_contribution": random.uniform(200, 1500)
            }
        }
    
    @task(10)
    def health_check(self):
        """Test health check endpoint."""
        with self.client.get("/health", headers=self.headers, catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Health check failed: {response.status_code}")
    
    @task(20)
    def anomaly_detection(self):
        """Test anomaly detection endpoint."""
        payload = {
            "transaction": self.test_data["transaction"]
        }
        
        with self.client.post(
            "/api/ml/anomaly/detect",
            json=payload,
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code == 200:
                try:
                    data = response.json()
                    if "anomaly_detection" in data:
                        response.success()
                    else:
                        response.failure("Invalid response format")
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
            else:
                response.failure(f"Anomaly detection failed: {response.status_code}")
    
    @task(15)
    def risk_assessment(self):
        """Test risk assessment endpoint."""
        payload = {
            "user_id": self.user_id,
            "financial_data": self.test_data["financial_data"],
            "assessment_type": "loan_approval"
        }
        
        with self.client.post(
            "/api/ml/risk/assess",
            json=payload,
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code == 200:
                try:
                    data = response.json()
                    if "risk_assessment" in data:
                        response.success()
                    else:
                        response.failure("Invalid response format")
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
            else:
                response.failure(f"Risk assessment failed: {response.status_code}")
    
    @task(12)
    def budget_optimization(self):
        """Test budget optimization endpoint."""
        payload = {
            "user_id": self.user_id,
            "current_budget": self.test_data["budget"],
            "goals": [self.test_data["goal"]],
            "constraints": {
                "max_housing_ratio": 0.3,
                "min_savings_rate": 0.2
            }
        }
        
        with self.client.post(
            "/api/ml/budget/optimize",
            json=payload,
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code == 200:
                try:
                    data = response.json()
                    if "optimization" in data:
                        response.success()
                    else:
                        response.failure("Invalid response format")
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
            else:
                response.failure(f"Budget optimization failed: {response.status_code}")
    
    @task(10)
    def goal_analysis(self):
        """Test goal analysis endpoint."""
        payload = {
            "user_id": self.user_id,
            "goal": self.test_data["goal"]
        }
        
        with self.client.post(
            "/api/ml/goals/analyze",
            json=payload,
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code == 200:
                try:
                    data = response.json()
                    if "goal_analysis" in data:
                        response.success()
                    else:
                        response.failure("Invalid response format")
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
            else:
                response.failure(f"Goal analysis failed: {response.status_code}")
    
    @task(8)
    def insights_generation(self):
        """Test insights generation endpoint."""
        payload = {
            "user_id": self.user_id,
            "insight_types": ["spending_patterns", "savings_opportunities"],
            "time_period": {
                "start_date": (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"),
                "end_date": datetime.now().strftime("%Y-%m-%d")
            }
        }
        
        with self.client.post(
            "/api/ml/insights/generate",
            json=payload,
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code == 200:
                try:
                    data = response.json()
                    if "insights" in data:
                        response.success()
                    else:
                        response.failure("Invalid response format")
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
            else:
                response.failure(f"Insights generation failed: {response.status_code}")
    
    @task(5)
    def batch_anomaly_detection(self):
        """Test batch anomaly detection endpoint."""
        # Generate multiple transactions
        transactions = []
        for _ in range(random.randint(5, 20)):
            transaction = self.test_data["transaction"].copy()
            transaction["id"] = f"txn_{random.randint(100000, 999999)}"
            transaction["amount"] = round(random.uniform(10, 1000), 2)
            transactions.append(transaction)
        
        payload = {"transactions": transactions}
        
        with self.client.post(
            "/api/ml/anomaly/batch",
            json=payload,
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code == 200:
                try:
                    data = response.json()
                    if "results" in data and "summary" in data:
                        response.success()
                    else:
                        response.failure("Invalid response format")
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
            else:
                response.failure(f"Batch anomaly detection failed: {response.status_code}")
    
    @task(3)
    def performance_metrics(self):
        """Test performance metrics endpoint."""
        with self.client.get(
            "/api/ml/performance/metrics?time_range=1h",
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code == 200:
                try:
                    data = response.json()
                    if "metrics" in data:
                        response.success()
                    else:
                        response.failure("Invalid response format")
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
            else:
                response.failure(f"Performance metrics failed: {response.status_code}")
    
    @task(2)
    def model_info(self):
        """Test model information endpoint."""
        model_id = random.choice([
            "anomaly-detection-v1",
            "risk-assessment-v1", 
            "budget-optimization-v1"
        ])
        
        with self.client.get(
            f"/api/ml/models/{model_id}/info",
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code == 200:
                try:
                    data = response.json()
                    if "model" in data:
                        response.success()
                    else:
                        response.failure("Invalid response format")
                except json.JSONDecodeError:
                    response.failure("Invalid JSON response")
            elif response.status_code == 404:
                # Model not found is acceptable
                response.success()
            else:
                response.failure(f"Model info failed: {response.status_code}")


class HighLoadUser(MLAnalyticsUser):
    """High-load user for stress testing."""
    
    wait_time = between(0.1, 0.5)  # Much faster requests
    
    @task(30)
    def rapid_anomaly_detection(self):
        """Rapid fire anomaly detection requests."""
        self.anomaly_detection()
    
    @task(20)
    def rapid_risk_assessment(self):
        """Rapid fire risk assessment requests."""
        self.risk_assessment()


class BurstUser(MLAnalyticsUser):
    """Burst user for spike testing."""
    
    wait_time = between(0, 0.1)  # Very fast requests
    
    def on_start(self):
        """Initialize burst user."""
        super().on_start()
        self.request_count = 0
        self.max_requests = random.randint(50, 100)
    
    @task
    def burst_requests(self):
        """Send burst of requests."""
        if self.request_count < self.max_requests:
            # Randomly choose an endpoint
            endpoints = [
                self.anomaly_detection,
                self.risk_assessment,
                self.budget_optimization,
                self.goal_analysis
            ]
            random.choice(endpoints)()
            self.request_count += 1
        else:
            # Stop after burst
            self.stop(force=True)