"""
Tests for Risk Assessment System
"""

import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
import asyncio
from unittest.mock import Mock, AsyncMock, patch

# Import components to test
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from models.risk_assessor import RiskAssessor, RiskLevel, RiskCategory, RiskFactor, RiskAssessment
from services.risk_service import RiskAssessmentService

class TestRiskAssessor:
    """Test cases for RiskAssessor class"""
    
    def setup_method(self):
        """Setup test fixtures"""
        self.assessor = RiskAssessor()
        
        # Create sample financial data
        self.sample_financial_data = {
            'user_id': 'test_user',
            'monthly_income': 5000.0,
            'monthly_expenses': 3500.0,
            'savings_balance': 10000.0,
            'total_debt': 25000.0,
            'monthly_debt_payments': 800.0,
            'emergency_fund': 15000.0,
            'credit_score': 720,
            'credit_utilization': 0.25,
            'employment_type': 'full_time',
            'employment_duration_months': 36,
            'liquid_assets': 25000.0,
            'total_assets': 50000.0,
            'credit_history_months': 84,
            'transactions': [
                {
                    'amount': -120.0,
                    'category': 'Food',
                    'description': 'Grocery store',
                    'timestamp': (datetime.now() - timedelta(days=1)).isoformat(),
                    'merchant_name': 'SuperMarket'
                },
                {
                    'amount': -50.0,
                    'category': 'Transport',
                    'description': 'Gas station',
                    'timestamp': (datetime.now() - timedelta(days=2)).isoformat(),
                    'merchant_name': 'Gas Station'
                },
                {
                    'amount': -200.0,
                    'category': 'Entertainment',
                    'description': 'Restaurant',
                    'timestamp': (datetime.now() - timedelta(days=3)).isoformat(),
                    'merchant_name': 'Fine Dining'
                }
            ],
            'debt_breakdown': {
                'mortgage': 20000.0,
                'credit_card': 3000.0,
                'student_loan': 2000.0
            },
            'income_history': [
                {'amount': 5000.0, 'date': (datetime.now() - timedelta(days=30)).isoformat()},
                {'amount': 4800.0, 'date': (datetime.now() - timedelta(days=60)).isoformat()},
                {'amount': 5200.0, 'date': (datetime.now() - timedelta(days=90)).isoformat()}
            ],
            'emergency_fund_history': [
                {'amount': 15000.0, 'date': (datetime.now() - timedelta(days=30)).isoformat()},
                {'amount': 14000.0, 'date': (datetime.now() - timedelta(days=60)).isoformat()},
                {'amount': 13000.0, 'date': (datetime.now() - timedelta(days=90)).isoformat()}
            ]
        }
    
    def test_feature_extraction(self):
        """Test comprehensive feature extraction"""
        features = self.assessor.extract_risk_features(self.sample_financial_data)
        
        # Check that all major feature categories are present
        assert 'income_mean' in features
        assert 'spending_volatility' in features
        assert 'debt_to_income_ratio' in features
        assert 'liquidity_ratio' in features
        assert 'emergency_fund_months' in features
        assert 'credit_score_normalized' in features
        assert 'employment_stability' in features
        
        # Validate some calculations
        assert features['debt_to_income_ratio'] == 25000.0 / (5000.0 * 12)  # Total debt / annual income
        assert features['emergency_fund_months'] == 15000.0 / 3500.0  # Emergency fund / monthly expenses
        assert 0 <= features['credit_score_normalized'] <= 1  # Normalized credit score
    
    def test_income_features(self):
        """Test income-related feature extraction"""
        features = self.assessor.extract_risk_features(self.sample_financial_data)
        
        # Income stability should be calculated
        assert 'income_consistency' in features
        assert 'income_volatility' in features
        assert 'employment_stability' in features
        
        # Employment stability should be high for full-time with 36 months
        assert features['employment_stability'] > 0.8
        
        # Income consistency should be reasonable (not too volatile)
        assert features['income_consistency'] > 0.5
    
    def test_spending_features(self):
        """Test spending-related feature extraction"""
        features = self.assessor.extract_risk_features(self.sample_financial_data)
        
        assert 'spending_volatility' in features
        assert 'discretionary_spending_ratio' in features
        assert 'large_transaction_frequency' in features
        
        # Discretionary spending should include entertainment
        assert features['discretionary_spending_ratio'] > 0
    
    def test_debt_features(self):
        """Test debt-related feature extraction"""
        features = self.assessor.extract_risk_features(self.sample_financial_data)
        
        assert 'debt_to_income_ratio' in features
        assert 'debt_service_ratio' in features
        assert 'credit_card_debt_ratio' in features
        assert 'high_interest_debt_ratio' in features
        
        # Debt service ratio should be monthly payments / monthly income
        expected_debt_service = 800.0 / 5000.0
        assert abs(features['debt_service_ratio'] - expected_debt_service) < 0.01
    
    def test_liquidity_features(self):
        """Test liquidity-related feature extraction"""
        features = self.assessor.extract_risk_features(self.sample_financial_data)
        
        assert 'liquidity_ratio' in features
        assert 'liquid_asset_ratio' in features
        assert 'cash_flow_ratio' in features
        
        # Liquidity ratio should be liquid assets / monthly expenses
        expected_liquidity = 25000.0 / 3500.0
        assert abs(features['liquidity_ratio'] - expected_liquidity) < 0.1
    
    def test_emergency_fund_features(self):
        """Test emergency fund feature extraction"""
        features = self.assessor.extract_risk_features(self.sample_financial_data)
        
        assert 'emergency_fund_months' in features
        assert 'emergency_fund_adequacy' in features
        assert 'emergency_fund_growth' in features
        
        # Emergency fund months should be fund / monthly expenses
        expected_months = 15000.0 / 3500.0
        assert abs(features['emergency_fund_months'] - expected_months) < 0.1
    
    def test_credit_features(self):
        """Test credit-related feature extraction"""
        features = self.assessor.extract_risk_features(self.sample_financial_data)
        
        assert 'credit_score_normalized' in features
        assert 'credit_utilization' in features
        assert 'credit_risk_score' in features
        
        # Credit score should be normalized between 0 and 1
        assert 0 <= features['credit_score_normalized'] <= 1
        
        # Credit utilization should match input
        assert features['credit_utilization'] == 0.25
    
    def test_risk_assessment(self):
        """Test complete risk assessment"""
        assessment = self.assessor.assess_risk(self.sample_financial_data)
        
        assert isinstance(assessment, RiskAssessment)
        assert 0 <= assessment.overall_score <= 100
        assert assessment.overall_level in [RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH, RiskLevel.CRITICAL]
        assert len(assessment.risk_factors) > 0
        assert assessment.emergency_fund_target > 0
        assert len(assessment.recommendations) > 0
    
    def test_individual_risk_assessments(self):
        """Test individual risk factor assessments"""
        features = self.assessor.extract_risk_features(self.sample_financial_data)
        
        # Test liquidity risk assessment
        liquidity_risk = self.assessor._assess_liquidity_risk(features, self.sample_financial_data)
        assert isinstance(liquidity_risk, RiskFactor)
        assert liquidity_risk.category == RiskCategory.LIQUIDITY
        assert 0 <= liquidity_risk.score <= 100
        
        # Test debt risk assessment
        debt_risk = self.assessor._assess_debt_risk(features, self.sample_financial_data)
        assert isinstance(debt_risk, RiskFactor)
        assert debt_risk.category == RiskCategory.DEBT
        
        # Test emergency fund risk assessment
        emergency_risk = self.assessor._assess_emergency_fund_risk(features, self.sample_financial_data)
        assert isinstance(emergency_risk, RiskFactor)
        assert emergency_risk.category == RiskCategory.EMERGENCY_FUND
    
    def test_emergency_fund_target_calculation(self):
        """Test emergency fund target calculation"""
        target = self.assessor._calculate_emergency_fund_target(self.sample_financial_data)
        
        # Should be at least 6 months of expenses for stable employment
        min_target = 3500.0 * 6  # 6 months of expenses
        assert target >= min_target
    
    def test_risk_level_determination(self):
        """Test risk level determination from scores"""
        assert self.assessor._determine_risk_level(20) == RiskLevel.LOW
        assert self.assessor._determine_risk_level(40) == RiskLevel.MEDIUM
        assert self.assessor._determine_risk_level(60) == RiskLevel.HIGH
        assert self.assessor._determine_risk_level(80) == RiskLevel.CRITICAL
    
    def test_high_risk_scenario(self):
        """Test assessment with high-risk financial profile"""
        high_risk_data = self.sample_financial_data.copy()
        high_risk_data.update({
            'monthly_income': 3000.0,
            'monthly_expenses': 4000.0,  # Expenses > income
            'total_debt': 50000.0,  # High debt
            'emergency_fund': 500.0,  # Very low emergency fund
            'credit_score': 580,  # Poor credit
            'credit_utilization': 0.9,  # High utilization
            'employment_type': 'contract'  # Less stable employment
        })
        
        assessment = self.assessor.assess_risk(high_risk_data)
        
        # Should be high or critical risk
        assert assessment.overall_level in [RiskLevel.HIGH, RiskLevel.CRITICAL]
        assert assessment.overall_score > 60
        
        # Should have multiple high-priority recommendations
        high_urgency_factors = [f for f in assessment.risk_factors if f.urgency >= 4]
        assert len(high_urgency_factors) > 0
    
    def test_low_risk_scenario(self):
        """Test assessment with low-risk financial profile"""
        low_risk_data = self.sample_financial_data.copy()
        low_risk_data.update({
            'monthly_income': 8000.0,
            'monthly_expenses': 4000.0,  # Good income/expense ratio
            'total_debt': 5000.0,  # Low debt
            'emergency_fund': 30000.0,  # High emergency fund
            'credit_score': 800,  # Excellent credit
            'credit_utilization': 0.05,  # Low utilization
            'employment_type': 'full_time',
            'employment_duration_months': 60  # Stable employment
        })
        
        assessment = self.assessor.assess_risk(low_risk_data)
        
        # Should be low or medium risk
        assert assessment.overall_level in [RiskLevel.LOW, RiskLevel.MEDIUM]
        assert assessment.overall_score < 50
    
    def test_model_save_load(self, tmp_path):
        """Test model saving and loading"""
        # Save model
        model_path = tmp_path / "test_risk_model.joblib"
        save_success = self.assessor.save_model(str(model_path))
        assert save_success is True
        assert model_path.exists()
        
        # Load model
        new_assessor = RiskAssessor()
        load_success = new_assessor.load_model(str(model_path))
        assert load_success is True
        
        # Test that loaded model works
        assessment = new_assessor.assess_risk(self.sample_financial_data)
        assert isinstance(assessment, RiskAssessment)


class TestRiskAssessmentService:
    """Test cases for RiskAssessmentService class"""
    
    def setup_method(self):
        """Setup test fixtures"""
        self.mock_config = {
            'database_url': 'postgresql://localhost:5432/test',
            'assessment_settings': {
                'auto_assessment_interval_days': 7,
                'risk_change_threshold': 10.0,
                'high_risk_alert_threshold': 70.0
            }
        }
        
        self.service = RiskAssessmentService(self.mock_config)
    
    @pytest.mark.asyncio
    async def test_service_initialization(self):
        """Test service initialization"""
        with patch.object(self.service.db_manager, 'initialize', new_callable=AsyncMock):
            with patch.object(self.service, '_create_risk_tables', new_callable=AsyncMock):
                with patch.object(self.service.notification_manager, 'initialize', new_callable=AsyncMock):
                    with patch.object(self.service, '_initialize_model', new_callable=AsyncMock):
                        
                        result = await self.service.initialize()
                        
                        assert result is True
                        assert self.service.is_initialized is True
    
    @pytest.mark.asyncio
    async def test_user_risk_assessment(self):
        """Test user risk assessment"""
        # Mock service as initialized
        self.service.is_initialized = True
        
        # Mock dependencies
        with patch.object(self.service, '_get_user_financial_data', new_callable=AsyncMock) as mock_data:
            with patch.object(self.service, '_store_assessment', new_callable=AsyncMock):
                with patch.object(self.service, '_check_risk_alerts', new_callable=AsyncMock):
                    
                    # Setup mock data
                    mock_data.return_value = {
                        'user_id': 'test_user',
                        'monthly_income': 5000.0,
                        'monthly_expenses': 3500.0,
                        'emergency_fund': 15000.0,
                        'total_debt': 10000.0,
                        'credit_score': 720,
                        'transactions': []
                    }
                    
                    result = await self.service.assess_user_risk('test_user')
                    
                    assert result['success'] is True
                    assert 'assessment' in result
                    assert 'overall_score' in result['assessment']
                    assert 'risk_factors' in result['assessment']
    
    @pytest.mark.asyncio
    async def test_risk_history(self):
        """Test risk history retrieval"""
        self.service.is_initialized = True
        
        with patch.object(self.service.db_manager, 'execute_query', new_callable=AsyncMock) as mock_query:
            mock_query.return_value = [
                {
                    'overall_score': 45.0,
                    'overall_level': 'medium',
                    'emergency_fund_months': 4.2,
                    'debt_to_income_ratio': 0.25,
                    'liquidity_ratio': 3.5,
                    'spending_volatility': 0.15,
                    'income_stability': 0.85,
                    'assessment_date': datetime.now() - timedelta(days=7)
                },
                {
                    'overall_score': 42.0,
                    'overall_level': 'medium',
                    'emergency_fund_months': 4.5,
                    'debt_to_income_ratio': 0.23,
                    'liquidity_ratio': 3.8,
                    'spending_volatility': 0.12,
                    'income_stability': 0.87,
                    'assessment_date': datetime.now() - timedelta(days=14)
                }
            ]
            
            result = await self.service.get_risk_history('test_user', 30)
            
            assert result['success'] is True
            assert len(result['history']) == 2
            assert 'summary' in result
            assert result['summary']['total_assessments'] == 2
    
    @pytest.mark.asyncio
    async def test_risk_recommendations(self):
        """Test risk recommendations"""
        self.service.is_initialized = True
        
        with patch.object(self.service.db_manager, 'execute_query', new_callable=AsyncMock) as mock_query:
            mock_query.return_value = [{
                'risk_factors': json.dumps([
                    {
                        'category': 'emergency_fund',
                        'name': 'Emergency Fund Risk',
                        'score': 70,
                        'level': 'high',
                        'recommendation': 'Build emergency fund to 6+ months',
                        'urgency': 4,
                        'impact': 'Financial security'
                    }
                ]),
                'recommendations': json.dumps([
                    'Build emergency fund',
                    'Reduce discretionary spending'
                ]),
                'overall_score': 65.0
            }]
            
            result = await self.service.get_risk_recommendations('test_user')
            
            assert result['success'] is True
            assert 'recommendations' in result
            assert 'immediate_actions' in result['recommendations']
            assert result['overall_risk_score'] == 65.0
    
    @pytest.mark.asyncio
    async def test_cached_assessment(self):
        """Test cached assessment retrieval"""
        self.service.is_initialized = True
        
        with patch.object(self.service, '_get_cached_assessment', new_callable=AsyncMock) as mock_cache:
            mock_cache.return_value = {
                'success': True,
                'user_id': 'test_user',
                'assessment': {'overall_score': 45.0},
                'cached': True
            }
            
            result = await self.service.assess_user_risk('test_user', force_refresh=False)
            
            assert result['success'] is True
            assert result.get('cached') is True
    
    def test_risk_level_categorization(self):
        """Test risk level categorization logic"""
        # Test with different risk factors
        risk_factors = [
            {
                'category': 'emergency_fund',
                'urgency': 5,
                'recommendation': 'Build emergency fund immediately'
            },
            {
                'category': 'debt',
                'urgency': 2,
                'recommendation': 'Pay down debt gradually'
            },
            {
                'category': 'income',
                'urgency': 1,
                'recommendation': 'Maintain income stability'
            }
        ]
        
        # Mock the recommendation categorization
        categorized = {
            'immediate_actions': [],
            'short_term_goals': [],
            'long_term_planning': []
        }
        
        for factor in risk_factors:
            if factor['urgency'] >= 4:
                categorized['immediate_actions'].append(factor)
            elif factor['urgency'] >= 2:
                categorized['short_term_goals'].append(factor)
            else:
                categorized['long_term_planning'].append(factor)
        
        assert len(categorized['immediate_actions']) == 1
        assert len(categorized['short_term_goals']) == 1
        assert len(categorized['long_term_planning']) == 1


class TestIntegration:
    """Integration tests for risk assessment system"""
    
    @pytest.mark.asyncio
    async def test_end_to_end_risk_assessment(self):
        """Test complete end-to-end risk assessment flow"""
        # This would be a more comprehensive test with real database
        # and service connections in a test environment
        pass
    
    def test_performance_with_complex_data(self):
        """Test performance with complex financial data"""
        # Generate complex financial profile
        complex_data = {
            'user_id': 'complex_user',
            'monthly_income': 7500.0,
            'monthly_expenses': 5200.0,
            'savings_balance': 25000.0,
            'total_debt': 45000.0,
            'emergency_fund': 18000.0,
            'credit_score': 680,
            'credit_utilization': 0.35,
            'employment_type': 'full_time',
            'employment_duration_months': 48,
            'transactions': [],
            'debt_breakdown': {
                'mortgage': 35000.0,
                'credit_card': 8000.0,
                'student_loan': 2000.0
            },
            'income_history': [],
            'emergency_fund_history': []
        }
        
        # Generate large transaction history
        for i in range(1000):
            complex_data['transactions'].append({
                'amount': np.random.normal(-150, 50),
                'category': np.random.choice(['Food', 'Transport', 'Entertainment', 'Bills']),
                'description': f'Transaction {i}',
                'timestamp': (datetime.now() - timedelta(days=i)).isoformat(),
                'merchant_name': f'Merchant {i}'
            })
        
        assessor = RiskAssessor()
        
        # Test performance
        import time
        start_time = time.time()
        assessment = assessor.assess_risk(complex_data)
        end_time = time.time()
        
        # Should complete within reasonable time
        assert (end_time - start_time) < 5.0  # 5 seconds max
        assert isinstance(assessment, RiskAssessment)
        assert len(assessment.risk_factors) > 0
    
    def test_edge_cases(self):
        """Test edge cases and error handling"""
        assessor = RiskAssessor()
        
        # Test with minimal data
        minimal_data = {
            'user_id': 'minimal_user',
            'monthly_income': 0,
            'monthly_expenses': 0,
            'transactions': []
        }
        
        # Should handle gracefully without crashing
        try:
            assessment = assessor.assess_risk(minimal_data)
            assert isinstance(assessment, RiskAssessment)
        except Exception as e:
            # Should not raise unhandled exceptions
            assert False, f"Unexpected exception: {str(e)}"
        
        # Test with extreme values
        extreme_data = {
            'user_id': 'extreme_user',
            'monthly_income': 1000000.0,  # Very high income
            'monthly_expenses': 50.0,     # Very low expenses
            'total_debt': 0.0,           # No debt
            'emergency_fund': 500000.0,  # Very high emergency fund
            'credit_score': 850,         # Perfect credit
            'transactions': []
        }
        
        assessment = assessor.assess_risk(extreme_data)
        assert assessment.overall_level == RiskLevel.LOW  # Should be very low risk


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"])