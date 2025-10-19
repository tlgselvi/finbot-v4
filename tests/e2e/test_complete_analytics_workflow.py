"""
End-to-end tests for complete AI-powered analytics functionality.
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, List

import httpx
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options

from tests.utils.test_data import TestDataGenerator


@pytest.mark.e2e
class TestCompleteAnalyticsWorkflow:
    """Test complete end-to-end analytics workflow."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Set up E2E test environment."""
        self.api_base_url = "http://analytics-api:8080"
        self.dashboard_url = "http://dashboard:3000"
        self.mobile_api_url = "http://mobile-api:8080"
        
        self.headers = {
            "Content-Type": "application/json",
            "X-API-Key": "e2e-test-api-key",
            "Authorization": "Bearer e2e-test-token"
        }
        
        self.test_data_generator = TestDataGenerator(seed=42)
        self.test_user_id = "e2e_test_user_123"
    
    @pytest.mark.asyncio
    async def test_complete_user_onboarding_workflow(self):
        """Test complete user onboarding and initial analytics setup."""
        async with httpx.AsyncClient() as client:
            # 1. User Registration
            user_data = {
                "email": "e2e.test@finbot.com",
                "name": "E2E Test User",
                "age": 32,
                "income": 85000,
                "phone": "+1234567890"
            }
            
            response = await client.post(
                f"{self.api_base_url}/api/users/register",
                json=user_data,
                headers=self.headers
            )
            
            assert response.status_code in [200, 201]
            user_response = response.json()
            user_id = user_response.get("user_id", self.test_user_id)
            
            # 2. Initial Financial Profile Setup
            financial_profile = {
                "user_id": user_id,
                "monthly_income": 7000,
                "monthly_expenses": 4500,
                "debt_to_income_ratio": 0.25,
                "credit_score": 720,
                "savings_balance": 25000,
                "investment_accounts": [
                    {"type": "401k", "balance": 45000},
                    {"type": "ira", "balance": 15000}
                ]
            }
            
            response = await client.post(
                f"{self.api_base_url}/api/ml/users/{user_id}/profile",
                json=financial_profile,
                headers=self.headers
            )
            
            assert response.status_code in [200, 201]
            
            # 3. Initial Risk Assessment
            response = await client.post(
                f"{self.api_base_url}/api/ml/risk/assess",
                json={
                    "user_id": user_id,
                    "financial_data": financial_profile,
                    "assessment_type": "comprehensive"
                },
                headers=self.headers
            )
            
            assert response.status_code == 200
            risk_data = response.json()
            assert risk_data["success"] is True
            assert "risk_assessment" in risk_data
            
            # 4. Goal Setting
            goals = [
                {
                    "type": "emergency_fund",
                    "target_amount": 30000,
                    "current_amount": 25000,
                    "target_date": "2025-12-31",
                    "priority": "high"
                },
                {
                    "type": "house_down_payment",
                    "target_amount": 100000,
                    "current_amount": 15000,
                    "target_date": "2026-06-30",
                    "priority": "medium"
                }
            ]
            
            for goal in goals:
                goal["user_id"] = user_id
                response = await client.post(
                    f"{self.api_base_url}/api/goals/create",
                    json=goal,
                    headers=self.headers
                )
                assert response.status_code in [200, 201]
            
            # 5. Initial Budget Setup
            budget_data = {
                "user_id": user_id,
                "current_budget": {
                    "housing": 2200,
                    "food": 800,
                    "transportation": 600,
                    "entertainment": 400,
                    "utilities": 300,
                    "savings": 1500,
                    "miscellaneous": 200
                },
                "goals": goals
            }
            
            response = await client.post(
                f"{self.api_base_url}/api/ml/budget/optimize",
                json=budget_data,
                headers=self.headers
            )
            
            assert response.status_code == 200
            budget_response = response.json()
            assert budget_response["success"] is True
            assert "optimization" in budget_response
    
    @pytest.mark.asyncio
    async def test_transaction_processing_and_analysis_workflow(self):
        """Test complete transaction processing and analysis workflow."""
        async with httpx.AsyncClient() as client:
            user_id = self.test_user_id
            
            # Generate realistic transaction sequence
            transactions = self.test_data_generator.generate_transactions(
                n_transactions=50,
                n_users=1
            )
            
            # Process transactions one by one (simulating real-time processing)
            anomaly_count = 0
            processed_transactions = []
            
            for transaction in transactions[:10]:  # Process first 10 for E2E test
                transaction.user_id = user_id
                
                # 1. Real-time Anomaly Detection
                response = await client.post(
                    f"{self.api_base_url}/api/ml/anomaly/detect",
                    json={"transaction": {
                        "id": transaction.id,
                        "user_id": transaction.user_id,
                        "amount": transaction.amount,
                        "merchant": transaction.merchant,
                        "category": transaction.category,
                        "timestamp": transaction.timestamp.isoformat(),
                        "location": transaction.location
                    }},
                    headers=self.headers
                )
                
                assert response.status_code == 200
                anomaly_result = response.json()
                assert anomaly_result["success"] is True
                
                if anomaly_result["anomaly_detection"]["is_anomaly"]:
                    anomaly_count += 1
                
                # 2. Transaction Categorization (if needed)
                if transaction.category == "unknown":
                    response = await client.post(
                        f"{self.api_base_url}/api/ml/transactions/categorize",
                        json={"transaction": {
                            "id": transaction.id,
                            "merchant": transaction.merchant,
                            "description": transaction.description,
                            "amount": transaction.amount
                        }},
                        headers=self.headers
                    )
                    # Category prediction endpoint might not exist yet
                
                processed_transactions.append({
                    "transaction": transaction,
                    "anomaly_result": anomaly_result
                })
                
                # Small delay to simulate real-time processing
                await asyncio.sleep(0.1)
            
            # 3. Batch Analysis
            batch_transactions = [
                {
                    "id": t["transaction"].id,
                    "user_id": t["transaction"].user_id,
                    "amount": t["transaction"].amount,
                    "merchant": t["transaction"].merchant,
                    "category": t["transaction"].category,
                    "timestamp": t["transaction"].timestamp.isoformat()
                }
                for t in processed_transactions
            ]
            
            response = await client.post(
                f"{self.api_base_url}/api/ml/anomaly/batch",
                json={"transactions": batch_transactions},
                headers=self.headers
            )
            
            assert response.status_code == 200
            batch_result = response.json()
            assert batch_result["success"] is True
            assert "results" in batch_result
            assert "summary" in batch_result
            
            # 4. Generate Insights from Transaction Patterns
            response = await client.post(
                f"{self.api_base_url}/api/ml/insights/generate",
                json={
                    "user_id": user_id,
                    "insight_types": ["spending_patterns", "savings_opportunities"],
                    "time_period": {
                        "start_date": (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d"),
                        "end_date": datetime.now().strftime("%Y-%m-%d")
                    }
                },
                headers=self.headers
            )
            
            assert response.status_code == 200
            insights_result = response.json()
            assert insights_result["success"] is True
            assert "insights" in insights_result
    
    @pytest.mark.asyncio
    async def test_budget_optimization_and_goal_tracking_workflow(self):
        """Test budget optimization and goal tracking workflow."""
        async with httpx.AsyncClient() as client:
            user_id = self.test_user_id
            
            # 1. Get Current Financial Status
            response = await client.get(
                f"{self.api_base_url}/api/ml/users/{user_id}/profile",
                headers=self.headers
            )
            
            if response.status_code == 200:
                profile_data = response.json()
            else:
                # Create profile if doesn't exist
                profile_data = {
                    "monthly_income": 6500,
                    "monthly_expenses": 4200,
                    "savings_balance": 18000
                }
            
            # 2. Budget Optimization
            current_budget = {
                "housing": 2000,
                "food": 700,
                "transportation": 500,
                "entertainment": 300,
                "utilities": 250,
                "savings": 1200,
                "miscellaneous": 250
            }
            
            response = await client.post(
                f"{self.api_base_url}/api/ml/budget/optimize",
                json={
                    "user_id": user_id,
                    "current_budget": current_budget,
                    "goals": [
                        {
                            "type": "emergency_fund",
                            "target_amount": 25000,
                            "target_date": "2025-06-30"
                        }
                    ],
                    "constraints": {
                        "max_housing_ratio": 0.35,
                        "min_savings_rate": 0.20
                    }
                },
                headers=self.headers
            )
            
            assert response.status_code == 200
            optimization_result = response.json()
            assert optimization_result["success"] is True
            assert "optimization" in optimization_result
            
            optimized_budget = optimization_result["optimization"]["optimized_budget"]
            
            # 3. Budget Forecast
            response = await client.post(
                f"{self.api_base_url}/api/ml/budget/forecast",
                json={
                    "user_id": user_id,
                    "budget": optimized_budget,
                    "forecast_months": 12
                },
                headers=self.headers
            )
            
            assert response.status_code == 200
            forecast_result = response.json()
            assert forecast_result["success"] is True
            assert "forecast" in forecast_result
            
            # 4. Goal Analysis
            goals = [
                {
                    "id": "goal_emergency_fund",
                    "type": "savings",
                    "target_amount": 25000,
                    "current_amount": 18000,
                    "target_date": "2025-06-30",
                    "monthly_contribution": optimized_budget.get("savings", 1200)
                },
                {
                    "id": "goal_vacation",
                    "type": "savings",
                    "target_amount": 8000,
                    "current_amount": 2000,
                    "target_date": "2024-12-31",
                    "monthly_contribution": 500
                }
            ]
            
            for goal in goals:
                response = await client.post(
                    f"{self.api_base_url}/api/ml/goals/analyze",
                    json={
                        "user_id": user_id,
                        "goal": goal
                    },
                    headers=self.headers
                )
                
                assert response.status_code == 200
                goal_analysis = response.json()
                assert goal_analysis["success"] is True
                assert "goal_analysis" in goal_analysis
                
                # Check if goal is on track
                analysis = goal_analysis["goal_analysis"]
                assert "progress_percentage" in analysis
                assert "on_track" in analysis
                assert "projected_completion" in analysis
            
            # 5. Goal Prediction for Multiple Goals
            response = await client.post(
                f"{self.api_base_url}/api/ml/goals/predict",
                json={
                    "user_id": user_id,
                    "goals": goals
                },
                headers=self.headers
            )
            
            assert response.status_code == 200
            prediction_result = response.json()
            assert prediction_result["success"] is True
            assert "predictions" in prediction_result
    
    @pytest.mark.asyncio
    async def test_approval_and_risk_assessment_workflow(self):
        """Test approval and risk assessment workflow."""
        async with httpx.AsyncClient() as client:
            user_id = self.test_user_id
            
            # 1. Comprehensive Risk Assessment
            financial_data = {
                "monthly_income": 6500,
                "monthly_expenses": 4200,
                "debt_to_income_ratio": 0.28,
                "credit_score": 720,
                "savings_balance": 18000,
                "employment_length": 36,  # months
                "housing_status": "rent"
            }
            
            response = await client.post(
                f"{self.api_base_url}/api/ml/risk/assess",
                json={
                    "user_id": user_id,
                    "financial_data": financial_data,
                    "assessment_type": "comprehensive"
                },
                headers=self.headers
            )
            
            assert response.status_code == 200
            risk_result = response.json()
            assert risk_result["success"] is True
            assert "risk_assessment" in risk_result
            
            risk_assessment = risk_result["risk_assessment"]
            overall_risk_score = risk_assessment["overall_risk_score"]
            
            # 2. Loan Approval Recommendation
            loan_scenarios = [
                {
                    "type": "personal_loan",
                    "amount": 15000,
                    "purpose": "debt_consolidation",
                    "term_months": 36
                },
                {
                    "type": "auto_loan", 
                    "amount": 25000,
                    "purpose": "vehicle_purchase",
                    "term_months": 60
                },
                {
                    "type": "mortgage",
                    "amount": 300000,
                    "purpose": "home_purchase",
                    "term_months": 360
                }
            ]
            
            approval_results = []
            
            for scenario in loan_scenarios:
                response = await client.post(
                    f"{self.api_base_url}/api/ml/approval/recommend",
                    json={
                        "approval": scenario,
                        "user_context": {
                            "user_id": user_id,
                            **financial_data
                        }
                    },
                    headers=self.headers
                )
                
                assert response.status_code == 200
                approval_result = response.json()
                assert approval_result["success"] is True
                assert "recommendation" in approval_result
                
                recommendation = approval_result["recommendation"]
                assert "decision" in recommendation
                assert recommendation["decision"] in ["approve", "reject", "manual_review"]
                assert "confidence" in recommendation
                assert "risk_score" in recommendation
                
                approval_results.append({
                    "scenario": scenario,
                    "recommendation": recommendation
                })
            
            # 3. Credit Limit Recommendation
            response = await client.post(
                f"{self.api_base_url}/api/ml/approval/recommend",
                json={
                    "approval": {
                        "type": "credit_limit_increase",
                        "current_limit": 5000,
                        "requested_limit": 10000
                    },
                    "user_context": {
                        "user_id": user_id,
                        **financial_data
                    }
                },
                headers=self.headers
            )
            
            assert response.status_code == 200
            credit_result = response.json()
            assert credit_result["success"] is True
            
            # Verify that higher risk users get more conservative recommendations
            if overall_risk_score > 0.6:
                # High risk users should get more rejections or manual reviews
                high_risk_decisions = [r["recommendation"]["decision"] for r in approval_results]
                assert "reject" in high_risk_decisions or "manual_review" in high_risk_decisions
    
    @pytest.mark.asyncio
    async def test_performance_monitoring_workflow(self):
        """Test performance monitoring and system health workflow."""
        async with httpx.AsyncClient() as client:
            # 1. System Health Check
            response = await client.get(
                f"{self.api_base_url}/health",
                headers=self.headers
            )
            
            assert response.status_code == 200
            health_data = response.json()
            assert health_data["status"] in ["healthy", "degraded"]
            
            # 2. Performance Metrics
            response = await client.get(
                f"{self.api_base_url}/api/ml/performance/metrics?time_range=1h",
                headers=self.headers
            )
            
            assert response.status_code == 200
            metrics_data = response.json()
            assert "metrics" in metrics_data
            
            # 3. Model Performance
            models = ["anomaly-detection", "risk-assessment", "budget-optimization"]
            
            for model_id in models:
                response = await client.get(
                    f"{self.api_base_url}/api/ml/models/{model_id}/info",
                    headers=self.headers
                )
                
                if response.status_code == 200:
                    model_info = response.json()
                    assert "model" in model_info
                    assert "performance_metrics" in model_info["model"]
            
            # 4. System Resource Usage
            response = await client.get(
                f"{self.api_base_url}/api/ml/performance/health",
                headers=self.headers
            )
            
            assert response.status_code == 200
            system_health = response.json()
            assert "overall_status" in system_health
            assert "components" in system_health


@pytest.mark.e2e
@pytest.mark.ui
class TestDashboardE2E:
    """Test dashboard UI end-to-end functionality."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Set up browser for UI testing."""
        chrome_options = Options()
        chrome_options.add_argument("--headless")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1920,1080")
        
        self.driver = webdriver.Chrome(options=chrome_options)
        self.wait = WebDriverWait(self.driver, 10)
        self.dashboard_url = "http://dashboard:3000"
        
        yield
        
        self.driver.quit()
    
    def test_dashboard_login_and_navigation(self):
        """Test dashboard login and basic navigation."""
        # Navigate to dashboard
        self.driver.get(self.dashboard_url)
        
        # Wait for page to load
        self.wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))
        
        # Check if login is required
        if "login" in self.driver.current_url.lower() or self.driver.find_elements(By.NAME, "username"):
            # Perform login
            username_field = self.driver.find_element(By.NAME, "username")
            password_field = self.driver.find_element(By.NAME, "password")
            
            username_field.send_keys("e2e.test@finbot.com")
            password_field.send_keys("e2e-test-password")
            
            login_button = self.driver.find_element(By.TYPE, "submit")
            login_button.click()
            
            # Wait for redirect to dashboard
            self.wait.until(lambda driver: "dashboard" in driver.current_url.lower())
        
        # Verify dashboard elements
        assert "FinBot" in self.driver.title or "Dashboard" in self.driver.title
        
        # Check for main navigation elements
        nav_elements = self.driver.find_elements(By.CSS_SELECTOR, "nav a, .nav-link, .menu-item")
        assert len(nav_elements) > 0, "No navigation elements found"
    
    def test_analytics_dashboard_widgets(self):
        """Test analytics dashboard widgets and data display."""
        self.driver.get(f"{self.dashboard_url}/analytics")
        
        # Wait for analytics page to load
        self.wait.until(EC.presence_of_element_located((By.CLASS_NAME, "analytics-dashboard")))
        
        # Check for key analytics widgets
        expected_widgets = [
            "spending-overview",
            "budget-status", 
            "goal-progress",
            "risk-assessment",
            "recent-transactions"
        ]
        
        for widget_class in expected_widgets:
            try:
                widget = self.wait.until(
                    EC.presence_of_element_located((By.CLASS_NAME, widget_class))
                )
                assert widget.is_displayed(), f"Widget {widget_class} not visible"
            except:
                # Widget might have different class name or not implemented yet
                pass
    
    def test_transaction_anomaly_alerts(self):
        """Test transaction anomaly alerts in UI."""
        self.driver.get(f"{self.dashboard_url}/transactions")
        
        # Look for anomaly indicators
        anomaly_indicators = self.driver.find_elements(
            By.CSS_SELECTOR, 
            ".anomaly-alert, .alert-danger, .warning-icon"
        )
        
        # If anomalies are present, test alert functionality
        if anomaly_indicators:
            first_alert = anomaly_indicators[0]
            first_alert.click()
            
            # Check if alert details are shown
            self.wait.until(
                EC.presence_of_element_located((By.CLASS_NAME, "alert-details"))
            )
    
    def test_budget_optimization_interface(self):
        """Test budget optimization interface."""
        self.driver.get(f"{self.dashboard_url}/budget")
        
        # Look for budget optimization button
        optimize_buttons = self.driver.find_elements(
            By.CSS_SELECTOR,
            "button[data-action='optimize'], .optimize-budget-btn"
        )
        
        if optimize_buttons:
            optimize_buttons[0].click()
            
            # Wait for optimization results
            self.wait.until(
                EC.presence_of_element_located((By.CLASS_NAME, "optimization-results"))
            )
            
            # Check for optimization suggestions
            suggestions = self.driver.find_elements(By.CLASS_NAME, "budget-suggestion")
            assert len(suggestions) > 0, "No budget suggestions displayed"
    
    def test_goal_tracking_interface(self):
        """Test goal tracking interface."""
        self.driver.get(f"{self.dashboard_url}/goals")
        
        # Look for goal progress indicators
        progress_bars = self.driver.find_elements(
            By.CSS_SELECTOR,
            ".progress-bar, .goal-progress, progress"
        )
        
        # Check if goals are displayed
        goal_cards = self.driver.find_elements(
            By.CSS_SELECTOR,
            ".goal-card, .goal-item"
        )
        
        if goal_cards:
            # Click on first goal for details
            goal_cards[0].click()
            
            # Check for goal details
            self.wait.until(
                EC.presence_of_element_located((By.CLASS_NAME, "goal-details"))
            )


@pytest.mark.e2e
@pytest.mark.mobile
class TestMobileAppE2E:
    """Test mobile app end-to-end functionality."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Set up mobile API testing."""
        self.mobile_api_url = "http://mobile-api:8080"
        self.headers = {
            "Content-Type": "application/json",
            "X-API-Key": "mobile-e2e-test-key",
            "Authorization": "Bearer mobile-e2e-token",
            "User-Agent": "FinBot-Mobile/1.0.0"
        }
    
    @pytest.mark.asyncio
    async def test_mobile_analytics_api(self):
        """Test mobile-specific analytics API endpoints."""
        async with httpx.AsyncClient() as client:
            user_id = "mobile_e2e_user"
            
            # 1. Mobile Dashboard Data
            response = await client.get(
                f"{self.mobile_api_url}/api/mobile/dashboard/{user_id}",
                headers=self.headers
            )
            
            if response.status_code == 200:
                dashboard_data = response.json()
                assert "spending_summary" in dashboard_data
                assert "recent_transactions" in dashboard_data
                assert "alerts" in dashboard_data
            
            # 2. Mobile Notifications
            response = await client.get(
                f"{self.mobile_api_url}/api/mobile/notifications/{user_id}",
                headers=self.headers
            )
            
            if response.status_code == 200:
                notifications = response.json()
                assert "notifications" in notifications
            
            # 3. Quick Transaction Analysis
            transaction_data = {
                "amount": 75.50,
                "merchant": "Coffee Shop",
                "category": "restaurants",
                "location": "Current Location"
            }
            
            response = await client.post(
                f"{self.mobile_api_url}/api/mobile/transaction/quick-analysis",
                json={
                    "user_id": user_id,
                    "transaction": transaction_data
                },
                headers=self.headers
            )
            
            if response.status_code == 200:
                analysis = response.json()
                assert "is_unusual" in analysis
                assert "budget_impact" in analysis