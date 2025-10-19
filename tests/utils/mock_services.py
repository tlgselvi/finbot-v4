"""
Mock services for testing FinBot ML Analytics.
"""

import asyncio
import json
import random
from typing import Dict, Any, List, Optional
from unittest.mock import Mock, AsyncMock
from datetime import datetime, timedelta

import pandas as pd
import numpy as np


class MockMLServices:
    """Mock ML services for testing."""
    
    def __init__(self):
        """Initialize mock ML services."""
        self.anomaly_detection_model = Mock()
        self.risk_assessment_model = Mock()
        self.budget_optimization_model = Mock()
        self.goal_tracking_model = Mock()
        
        self._setup_mock_behaviors()
    
    def _setup_mock_behaviors(self):
        """Set up mock behaviors for ML models."""
        # Anomaly Detection Model
        self.anomaly_detection_model.predict.side_effect = self._mock_anomaly_detection
        self.anomaly_detection_model.predict_batch.side_effect = self._mock_anomaly_detection_batch
        
        # Risk Assessment Model
        self.risk_assessment_model.predict.side_effect = self._mock_risk_assessment
        self.risk_assessment_model.predict_batch.side_effect = self._mock_risk_assessment_batch
        
        # Budget Optimization Model
        self.budget_optimization_model.predict.side_effect = self._mock_budget_optimization
        self.budget_optimization_model.predict_batch.side_effect = self._mock_budget_optimization_batch
        
        # Goal Tracking Model
        self.goal_tracking_model.predict.side_effect = self._mock_goal_tracking
        self.goal_tracking_model.predict_batch.side_effect = self._mock_goal_tracking_batch
    
    def _mock_anomaly_detection(self, transaction_data: Dict[str, Any]) -> Dict[str, Any]:
        """Mock anomaly detection prediction."""
        amount = transaction_data.get("amount", 0)
        category = transaction_data.get("category", "unknown")
        
        # Simple rule-based mock logic
        is_anomaly = False
        anomaly_score = random.uniform(0.0, 0.3)
        
        # High amounts are more likely to be anomalies
        if amount > 1000:
            is_anomaly = random.random() < 0.3
            anomaly_score = random.uniform(0.6, 0.9)
        elif amount > 500:
            is_anomaly = random.random() < 0.1
            anomaly_score = random.uniform(0.3, 0.7)
        
        # Certain categories have different thresholds
        if category in ["rent", "utilities"] and amount > 2000:
            is_anomaly = random.random() < 0.5
            anomaly_score = random.uniform(0.7, 0.95)
        
        alert_level = "low"
        if anomaly_score > 0.8:
            alert_level = "critical"
        elif anomaly_score > 0.6:
            alert_level = "high"
        elif anomaly_score > 0.4:
            alert_level = "medium"
        
        factors = []
        if amount > 1000:
            factors.append("Unusually high transaction amount")
        if category == "unknown":
            factors.append("Unknown merchant category")
        
        return {
            "is_anomaly": is_anomaly,
            "anomaly_score": round(anomaly_score, 3),
            "alert_level": alert_level,
            "explanation": f"Transaction analysis for {category} category",
            "factors": factors,
            "confidence": random.uniform(0.8, 0.95)
        }
    
    def _mock_anomaly_detection_batch(self, transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Mock batch anomaly detection prediction."""
        return [self._mock_anomaly_detection(txn) for txn in transactions]
    
    def _mock_risk_assessment(self, financial_data: Dict[str, Any]) -> Dict[str, Any]:
        """Mock risk assessment prediction."""
        monthly_income = financial_data.get("monthly_income", 5000)
        debt_to_income = financial_data.get("debt_to_income_ratio", 0.3)
        credit_score = financial_data.get("credit_score", 700)
        
        # Simple risk calculation
        risk_score = 0.0
        
        # Income factor
        if monthly_income < 3000:
            risk_score += 0.3
        elif monthly_income < 5000:
            risk_score += 0.1
        
        # Debt factor
        risk_score += debt_to_income * 0.5
        
        # Credit score factor
        if credit_score < 600:
            risk_score += 0.4
        elif credit_score < 700:
            risk_score += 0.2
        
        risk_score = min(1.0, risk_score)
        
        # Determine risk level
        if risk_score < 0.2:
            risk_level = "very_low"
        elif risk_score < 0.4:
            risk_level = "low"
        elif risk_score < 0.6:
            risk_level = "medium"
        elif risk_score < 0.8:
            risk_level = "high"
        else:
            risk_level = "very_high"
        
        risk_factors = []
        if monthly_income < 3000:
            risk_factors.append({
                "factor": "low_income",
                "score": 0.3,
                "impact": "negative"
            })
        if debt_to_income > 0.4:
            risk_factors.append({
                "factor": "high_debt_ratio",
                "score": debt_to_income * 0.5,
                "impact": "negative"
            })
        if credit_score > 750:
            risk_factors.append({
                "factor": "excellent_credit",
                "score": 0.1,
                "impact": "positive"
            })
        
        recommendations = []
        if risk_score > 0.6:
            recommendations.append("Consider debt consolidation")
            recommendations.append("Build emergency fund")
        if credit_score < 700:
            recommendations.append("Focus on improving credit score")
        
        return {
            "overall_risk_score": round(risk_score, 3),
            "risk_level": risk_level,
            "risk_factors": risk_factors,
            "recommendations": recommendations,
            "confidence": random.uniform(0.85, 0.95)
        }
    
    def _mock_risk_assessment_batch(self, financial_profiles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Mock batch risk assessment prediction."""
        return [self._mock_risk_assessment(profile) for profile in financial_profiles]
    
    def _mock_budget_optimization(self, budget_data: Dict[str, Any]) -> Dict[str, Any]:
        """Mock budget optimization prediction."""
        current_budget = budget_data.get("current_budget", {})
        goals = budget_data.get("goals", [])
        constraints = budget_data.get("constraints", {})
        
        # Simple optimization logic
        optimized_budget = current_budget.copy()
        total_income = sum(current_budget.values())
        
        # Apply some optimization rules
        if "entertainment" in optimized_budget and optimized_budget["entertainment"] > total_income * 0.1:
            reduction = optimized_budget["entertainment"] * 0.2
            optimized_budget["entertainment"] -= reduction
            optimized_budget["savings"] = optimized_budget.get("savings", 0) + reduction
        
        if "dining" in optimized_budget and optimized_budget["dining"] > total_income * 0.15:
            reduction = optimized_budget["dining"] * 0.15
            optimized_budget["dining"] -= reduction
            optimized_budget["savings"] = optimized_budget.get("savings", 0) + reduction
        
        # Calculate improvements
        improvements = []
        for category, amount in optimized_budget.items():
            original_amount = current_budget.get(category, 0)
            if amount != original_amount:
                improvements.append({
                    "category": category,
                    "current_amount": original_amount,
                    "recommended_amount": amount,
                    "reasoning": f"Optimized {category} allocation"
                })
        
        projected_savings = optimized_budget.get("savings", 0) - current_budget.get("savings", 0)
        
        return {
            "optimized_budget": optimized_budget,
            "improvements": improvements,
            "projected_savings": round(projected_savings, 2),
            "confidence": random.uniform(0.88, 0.95)
        }
    
    def _mock_budget_optimization_batch(self, budget_requests: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Mock batch budget optimization prediction."""
        return [self._mock_budget_optimization(request) for request in budget_requests]
    
    def _mock_goal_tracking(self, goal_data: Dict[str, Any]) -> Dict[str, Any]:
        """Mock goal tracking prediction."""
        goal = goal_data.get("goal", {})
        target_amount = goal.get("target_amount", 10000)
        current_amount = goal.get("current_amount", 0)
        target_date = goal.get("target_date", "2024-12-31")
        monthly_contribution = goal.get("monthly_contribution", 500)
        
        # Calculate progress
        progress_percentage = (current_amount / target_amount) * 100 if target_amount > 0 else 0
        
        # Calculate if on track
        target_datetime = datetime.strptime(target_date, "%Y-%m-%d")
        months_remaining = max(1, (target_datetime - datetime.now()).days / 30)
        required_monthly = (target_amount - current_amount) / months_remaining
        
        on_track = monthly_contribution >= required_monthly * 0.9
        
        # Project completion date
        if monthly_contribution > 0:
            months_to_completion = (target_amount - current_amount) / monthly_contribution
            projected_completion = (datetime.now() + timedelta(days=months_to_completion * 30)).strftime("%Y-%m-%d")
        else:
            projected_completion = "Unknown"
        
        recommendations = []
        if not on_track:
            recommendations.append(f"Increase monthly contribution to ${required_monthly:.2f}")
        if progress_percentage > 80:
            recommendations.append("You're doing great! Keep up the momentum")
        
        risk_factors = []
        if monthly_contribution == 0:
            risk_factors.append("No regular contributions detected")
        if months_remaining < 6 and progress_percentage < 50:
            risk_factors.append("Limited time remaining to reach goal")
        
        return {
            "progress_percentage": round(progress_percentage, 1),
            "on_track": on_track,
            "projected_completion": projected_completion,
            "required_monthly_contribution": round(required_monthly, 2),
            "recommendations": recommendations,
            "risk_factors": risk_factors
        }
    
    def _mock_goal_tracking_batch(self, goal_requests: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Mock batch goal tracking prediction."""
        return [self._mock_goal_tracking(request) for request in goal_requests]


class MockFeatureStore:
    """Mock feature store for testing."""
    
    def __init__(self):
        """Initialize mock feature store."""
        self.features_data = {}
        self.feature_definitions = {}
    
    async def get_features(
        self, 
        user_ids: List[str], 
        feature_names: List[str]
    ) -> pd.DataFrame:
        """Mock get features from feature store."""
        # Generate mock feature data
        data = []
        for user_id in user_ids:
            feature_row = {"user_id": user_id}
            for feature_name in feature_names:
                if feature_name == "avg_monthly_spending":
                    feature_row[feature_name] = random.uniform(1000, 5000)
                elif feature_name == "spending_volatility":
                    feature_row[feature_name] = random.uniform(0.1, 0.5)
                elif feature_name == "credit_score":
                    feature_row[feature_name] = random.randint(300, 850)
                elif feature_name == "debt_to_income_ratio":
                    feature_row[feature_name] = random.uniform(0.1, 0.6)
                else:
                    feature_row[feature_name] = random.uniform(0, 1)
            data.append(feature_row)
        
        return pd.DataFrame(data)
    
    async def store_features(
        self, 
        features_df: pd.DataFrame, 
        feature_names: List[str]
    ) -> bool:
        """Mock store features to feature store."""
        # Simulate storing features
        await asyncio.sleep(0.1)  # Simulate async operation
        return True
    
    async def get_feature_definitions(self) -> Dict[str, Any]:
        """Mock get feature definitions."""
        return {
            "avg_monthly_spending": {
                "type": "float",
                "description": "Average monthly spending amount"
            },
            "spending_volatility": {
                "type": "float", 
                "description": "Volatility in spending patterns"
            },
            "credit_score": {
                "type": "int",
                "description": "User credit score"
            }
        }


class MockDatabaseService:
    """Mock database service for testing."""
    
    def __init__(self):
        """Initialize mock database service."""
        self.data = {
            "users": [],
            "transactions": [],
            "financial_profiles": [],
            "ml_predictions": []
        }
    
    async def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Mock get user from database."""
        for user in self.data["users"]:
            if user["id"] == user_id:
                return user
        return None
    
    async def get_transactions(
        self, 
        user_id: str, 
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Mock get transactions from database."""
        transactions = [
            txn for txn in self.data["transactions"] 
            if txn["user_id"] == user_id
        ]
        
        if start_date:
            transactions = [
                txn for txn in transactions 
                if datetime.fromisoformat(txn["timestamp"]) >= start_date
            ]
        
        if end_date:
            transactions = [
                txn for txn in transactions 
                if datetime.fromisoformat(txn["timestamp"]) <= end_date
            ]
        
        return transactions[:limit]
    
    async def store_prediction(
        self, 
        user_id: str, 
        model_type: str, 
        prediction: Dict[str, Any]
    ) -> bool:
        """Mock store ML prediction to database."""
        prediction_record = {
            "id": f"pred_{len(self.data['ml_predictions'])}",
            "user_id": user_id,
            "model_type": model_type,
            "prediction": prediction,
            "timestamp": datetime.now().isoformat()
        }
        self.data["ml_predictions"].append(prediction_record)
        return True


class MockCacheService:
    """Mock cache service for testing."""
    
    def __init__(self):
        """Initialize mock cache service."""
        self.cache_data = {}
    
    async def get(self, key: str) -> Optional[Any]:
        """Mock get from cache."""
        return self.cache_data.get(key)
    
    async def set(
        self, 
        key: str, 
        value: Any, 
        ttl: int = 3600
    ) -> bool:
        """Mock set to cache."""
        self.cache_data[key] = value
        return True
    
    async def delete(self, key: str) -> bool:
        """Mock delete from cache."""
        if key in self.cache_data:
            del self.cache_data[key]
            return True
        return False
    
    async def exists(self, key: str) -> bool:
        """Mock check if key exists in cache."""
        return key in self.cache_data


class MockAPIClient:
    """Mock API client for testing external services."""
    
    def __init__(self):
        """Initialize mock API client."""
        self.responses = {}
        self.request_history = []
    
    def set_response(self, endpoint: str, response: Dict[str, Any]):
        """Set mock response for endpoint."""
        self.responses[endpoint] = response
    
    async def get(self, endpoint: str, **kwargs) -> Dict[str, Any]:
        """Mock GET request."""
        self.request_history.append({"method": "GET", "endpoint": endpoint, "kwargs": kwargs})
        return self.responses.get(endpoint, {"error": "Not mocked"})
    
    async def post(self, endpoint: str, data: Dict[str, Any], **kwargs) -> Dict[str, Any]:
        """Mock POST request."""
        self.request_history.append({
            "method": "POST", 
            "endpoint": endpoint, 
            "data": data, 
            "kwargs": kwargs
        })
        return self.responses.get(endpoint, {"success": True})
    
    def get_request_history(self) -> List[Dict[str, Any]]:
        """Get history of mock requests."""
        return self.request_history.copy()
    
    def clear_history(self):
        """Clear request history."""
        self.request_history.clear()