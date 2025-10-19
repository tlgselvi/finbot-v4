"""
Comprehensive tests for Budget Optimization Service
"""

import pytest
import pytest_asyncio
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch
import json

from services.budget_service import BudgetOptimizationService
from models.budget_optimizer import BudgetPlan, OptimizationGoal, BudgetAllocation, BudgetCategory

class TestBudgetOptimizationService:
    """Test cases for Budget Optimization Service"""
    
    @pytest_asyncio.fixture
    async def budget_service(self):
        """Create budget service instance for testing"""
        config = {
            'database_url': 'postgresql://test:test@localhost:5432/test_finbot',
            'budget_settings': {
                'auto_optimization_interval_days': 30,
                'budget_alert_threshold': 0.9,
                'overspend_alert_threshold': 1.1,
                'performance_evaluation_days': 30
            },
            'notification_settings': {
                'enable_budget_alerts': True,
                'enable_overspend_alerts': True,
                'enable_optimization_suggestions': True
            }
        }
        
        service = BudgetOptimizationService(config)
        
        # Mock database manager
        service.db_manager = AsyncMock()
        service.db_manager.initialize = AsyncMock(return_value=True)
        service.db_manager.execute_query = AsyncMock()
        service.db_manager.execute_insert = AsyncMock()
        
        # Mock notification manager
        service.notification_manager = AsyncMock()
        service.notification_manager.initialize = AsyncMock(return_value=True)
        service.notification_manager.send_anomaly_alert = AsyncMock()
        
        # Mock goal service
        service.goal_service = AsyncMock()
        service.goal_service.initialize = AsyncMock(return_value=True)
        service.goal_service.get_user_goals = AsyncMock()
        
        # Mock budget optimizer
        service.budget_optimizer = Mock()
        
        await service.initialize()
        return service
    
    @pytest.fixture
    def sample_financial_data(self):
        """Sample financial data for testing"""
        return {
            'user_id': 'test-user-123',
            'monthly_income': 5000.0,
            'monthly_expenses': 3500.0,
            'savings_balance': 15000.0,
            'total_debt': 5000.0,
            'emergency_fund': 2000.0,
            'transactions': [
                {
                    'amount': -150.0,
                    'category': 'groceries',
                    'description': 'Supermarket',
                    'timestamp': datetime.now().isoformat(),
                    'merchant_name': 'Local Store'
                },
                {
                    'amount': -800.0,
                    'category': 'rent',
                    'description': 'Monthly rent',
                    'timestamp': datetime.now().isoformat(),
                    'merchant_name': 'Property Management'
                }
            ],
            'debt_breakdown': {
                'credit_card': 3000.0,
                'student_loan': 2000.0
            },
            'financial_goals': [
                {
                    'id': 'goal-1',
                    'name': 'Emergency Fund',
                    'type': 'emergency_fund',
                    'target_amount': 10000.0,
                    'current_amount': 2000.0,
                    'target_date': (datetime.now() + timedelta(days=365)).isoformat()
                }
            ]
        }
    
    @pytest.fixture
    def sample_budget_plan(self):
        """Sample budget plan for testing"""
        allocations = [
            BudgetAllocation(
                category='housing',
                subcategory='rent',
                current_amount=1200.0,
                recommended_amount=1200.0,
                min_amount=1200.0,
                max_amount=1200.0,
                category_type=BudgetCategory.ESSENTIAL,
                priority=1,
                justification='Fixed housing cost',
                optimization_potential=0.0,
                confidence=1.0
            ),
            BudgetAllocation(
                category='food',
                subcategory='groceries',
                current_amount=600.0,
                recommended_amount=500.0,
                min_amount=400.0,
                max_amount=700.0,
                category_type=BudgetCategory.DISCRETIONARY,
                priority=2,
                justification='Optimizable food spending',
                optimization_potential=0.2,
                confidence=0.8
            )
        ]
        
        return BudgetPlan(
            user_id='test-user-123',
            total_income=5000.0,
            total_allocated=4200.0,
            allocations=allocations,
            savings_rate=0.15,
            emergency_fund_allocation=300.0,
            debt_payment_allocation=400.0,
            optimization_goal=OptimizationGoal.BALANCE_LIFESTYLE,
            risk_score=25.0,
            confidence=0.85,
            created_at=datetime.now(),
            valid_until=datetime.now() + timedelta(days=30)
        )
    
    @pytest.mark.asyncio
    async def test_service_initialization(self, budget_service):
        """Test service initialization"""
        assert budget_service.is_initialized is True
        assert budget_service.db_manager is not None
        assert budget_service.notification_manager is not None
        assert budget_service.goal_service is not None
        assert budget_service.budget_optimizer is not None
    
    @pytest.mark.asyncio
    async def test_optimize_user_budget_success(self, budget_service, sample_financial_data, sample_budget_plan):
        """Test successful budget optimization"""
        # Mock database responses
        budget_service._get_user_financial_data = AsyncMock(return_value=sample_financial_data)
        budget_service.budget_optimizer.optimize_budget = Mock(return_value=sample_budget_plan)
        budget_service._store_budget_plan = AsyncMock()
        budget_service._deactivate_previous_plans = AsyncMock()
        
        result = await budget_service.optimize_user_budget('test-user-123', 'balance_lifestyle')
        
        assert result['success'] is True
        assert result['user_id'] == 'test-user-123'
        assert 'budget_plan' in result
        assert result['budget_plan']['total_income'] == 5000.0
        assert result['budget_plan']['optimization_goal'] == 'balance_lifestyle'
        assert len(result['budget_plan']['allocations']) == 2
    
    @pytest.mark.asyncio
    async def test_optimize_user_budget_insufficient_data(self, budget_service):
        """Test budget optimization with insufficient data"""
        budget_service._get_user_financial_data = AsyncMock(return_value=None)
        
        result = await budget_service.optimize_user_budget('test-user-123')
        
        assert result['success'] is False
        assert 'Insufficient financial data' in result['error']
    
    @pytest.mark.asyncio
    async def test_get_user_budget_success(self, budget_service):
        """Test getting user budget"""
        # Mock database response
        mock_budget_data = {
            'id': 'budget-123',
            'total_income': 5000.0,
            'total_allocated': 4200.0,
            'savings_rate': 0.15,
            'emergency_fund_allocation': 300.0,
            'debt_payment_allocation': 400.0,
            'optimization_goal': 'balance_lifestyle',
            'risk_score': 25.0,
            'confidence': 0.85,
            'allocations': json.dumps([
                {
                    'category': 'housing',
                    'recommended_amount': 1200.0,
                    'category_type': 'fixed'
                }
            ]),
            'created_at': datetime.now(),
            'valid_until': datetime.now() + timedelta(days=30)
        }
        
        budget_service.db_manager.execute_query.return_value = [mock_budget_data]
        
        result = await budget_service.get_user_budget('test-user-123')
        
        assert result['success'] is True
        assert result['budget_plan']['total_income'] == 5000.0
        assert len(result['budget_plan']['allocations']) == 1
    
    @pytest.mark.asyncio
    async def test_get_user_budget_not_found(self, budget_service):
        """Test getting user budget when none exists"""
        budget_service.db_manager.execute_query.return_value = []
        
        result = await budget_service.get_user_budget('test-user-123')
        
        assert result['success'] is False
        assert 'No active budget plan found' in result['error']
    
    @pytest.mark.asyncio
    async def test_evaluate_budget_performance(self, budget_service, sample_budget_plan):
        """Test budget performance evaluation"""
        # Mock get_user_budget
        budget_service.get_user_budget = AsyncMock(return_value={
            'success': True,
            'budget_plan': {
                'id': 'budget-123',
                'total_income': 5000.0,
                'total_allocated': 4200.0,
                'savings_rate': 0.15,
                'emergency_fund_allocation': 300.0,
                'debt_payment_allocation': 400.0,
                'optimization_goal': 'balance_lifestyle',
                'risk_score': 25.0,
                'confidence': 0.85,
                'allocations': [
                    {
                        'category': 'housing',
                        'recommended_amount': 1200.0,
                        'category_type': 'fixed',
                        'current_amount': 1200.0,
                        'min_amount': 1200.0,
                        'max_amount': 1200.0,
                        'priority': 1,
                        'justification': 'Fixed cost',
                        'optimization_potential': 0.0,
                        'confidence': 1.0
                    }
                ],
                'created_at': datetime.now().isoformat(),
                'valid_until': (datetime.now() + timedelta(days=30)).isoformat()
            }
        })
        
        # Mock spending data
        budget_service.db_manager.execute_query.return_value = [
            {'category': 'housing', 'total_amount': 1200.0},
            {'category': 'food', 'total_amount': 450.0}
        ]
        
        # Mock performance evaluation
        mock_performance = {
            'overall_performance': 85.0,
            'budget_adherence_score': 90.0,
            'category_performance': {'housing': 100.0, 'food': 90.0},
            'overspend_categories': [],
            'underspend_categories': [{'category': 'food', 'underspend_percent': 10.0}],
            'recommendations': ['Great job staying within budget!']
        }
        
        budget_service.budget_optimizer.evaluate_budget_performance = Mock(return_value=mock_performance)
        budget_service._store_performance_results = AsyncMock()
        budget_service._check_budget_alerts = AsyncMock()
        
        result = await budget_service.evaluate_budget_performance('test-user-123')
        
        assert result['success'] is True
        assert result['performance']['overall_performance'] == 85.0
        assert result['performance']['budget_adherence_score'] == 90.0
    
    @pytest.mark.asyncio
    async def test_optimize_budget_with_goals(self, budget_service, sample_financial_data):
        """Test goal-aware budget optimization"""
        # Mock goal service response
        mock_goals = {
            'success': True,
            'goals': [
                {
                    'id': 'goal-1',
                    'name': 'Emergency Fund',
                    'goal_type': 'emergency_fund',
                    'priority': 'high',
                    'monthly_contribution': 500.0,
                    'auto_contribute': True,
                    'progress_percent': 30.0
                },
                {
                    'id': 'goal-2',
                    'name': 'Vacation',
                    'goal_type': 'travel',
                    'priority': 'medium',
                    'monthly_contribution': 200.0,
                    'auto_contribute': True,
                    'progress_percent': 60.0
                }
            ]
        }
        
        budget_service.goal_service.get_user_goals.return_value = mock_goals
        
        # Mock regular budget optimization
        mock_budget_result = {
            'success': True,
            'budget_plan': {
                'total_income': 5000.0,
                'total_allocated': 3500.0,
                'allocations': [
                    {
                        'category': 'housing',
                        'recommended_amount': 1200.0
                    }
                ]
            }
        }
        
        budget_service.optimize_user_budget = AsyncMock(return_value=mock_budget_result)
        budget_service._generate_goal_budget_insights = AsyncMock(return_value=[
            "✅ Balanced approach: 14.0% of income toward goals"
        ])
        
        result = await budget_service.optimize_budget_with_goals('test-user-123')
        
        assert result['success'] is True
        assert 'goal_integration' in result
        assert result['goal_integration']['active_goals'] == 2
        assert result['goal_integration']['total_goal_contributions'] == 700.0
        assert len(result['goal_integration']['goal_allocations']) == 2
    
    def test_map_goal_priority_to_budget_priority(self, budget_service):
        """Test goal priority mapping"""
        assert budget_service._map_goal_priority_to_budget_priority('critical') == 1
        assert budget_service._map_goal_priority_to_budget_priority('high') == 2
        assert budget_service._map_goal_priority_to_budget_priority('medium') == 3
        assert budget_service._map_goal_priority_to_budget_priority('low') == 4
        assert budget_service._map_goal_priority_to_budget_priority('unknown') == 3
    
    @pytest.mark.asyncio
    async def test_generate_goal_budget_insights(self, budget_service):
        """Test goal budget insights generation"""
        sample_goals = [
            {
                'priority': 'high',
                'monthly_contribution': 500,
                'auto_contribute': True,
                'progress_percent': 30,
                'created_at': (datetime.now() - timedelta(days=120)).isoformat()
            },
            {
                'priority': 'medium',
                'monthly_contribution': 200,
                'auto_contribute': True,
                'progress_percent': 60,
                'created_at': (datetime.now() - timedelta(days=60)).isoformat()
            }
        ]
        
        sample_budget = {
            'total_income': 5000,
            'total_allocated': 4200
        }
        
        insights = await budget_service._generate_goal_budget_insights(sample_goals, sample_budget)
        
        assert len(insights) > 0
        assert any('14.0%' in insight for insight in insights)  # Should mention percentage
    
    @pytest.mark.asyncio
    async def test_suggest_budget_adjustments(self, budget_service):
        """Test budget adjustment suggestions"""
        # Mock performance evaluation
        mock_performance = {
            'success': True,
            'performance': {
                'overall_performance': 75.0,
                'overspend_categories': [
                    {'category': 'food', 'overspend_percent': 25.0}
                ],
                'underspend_categories': [
                    {'category': 'entertainment', 'underspend_percent': 20.0}
                ],
                'recommendations': ['Consider adjusting food budget']
            }
        }
        
        budget_service.evaluate_budget_performance = AsyncMock(return_value=mock_performance)
        budget_service.get_user_budget = AsyncMock(return_value={'success': True})
        
        result = await budget_service.suggest_budget_adjustments('test-user-123')
        
        assert result['success'] is True
        assert 'adjustment_recommendations' in result
        assert 'suggested_changes' in result
    
    def test_generate_adjustment_suggestions(self, budget_service):
        """Test adjustment suggestions generation"""
        performance_data = {
            'overspend_categories': [
                {'category': 'food', 'overspend_percent': 25.0}
            ],
            'underspend_categories': [
                {'category': 'entertainment', 'underspend_percent': 20.0}
            ]
        }
        
        suggestions = budget_service._generate_adjustment_suggestions(performance_data)
        
        assert len(suggestions) == 2
        
        # Check overspend suggestion
        overspend_suggestion = next(s for s in suggestions if s['type'] == 'increase_budget')
        assert overspend_suggestion['category'] == 'food'
        assert overspend_suggestion['current_variance'] == 25.0
        
        # Check underspend suggestion
        underspend_suggestion = next(s for s in suggestions if s['type'] == 'decrease_budget')
        assert underspend_suggestion['category'] == 'entertainment'
        assert underspend_suggestion['current_variance'] == -20.0
    
    @pytest.mark.asyncio
    async def test_check_budget_alerts(self, budget_service, sample_budget_plan):
        """Test budget alert checking"""
        actual_spending = {
            'housing': 1200.0,  # On budget
            'food': 600.0       # Over budget (recommended was 500)
        }
        
        budget_service._send_budget_alert = AsyncMock()
        
        await budget_service._check_budget_alerts('test-user-123', sample_budget_plan, actual_spending)
        
        # Should send alert for food overspending
        budget_service._send_budget_alert.assert_called()
    
    @pytest.mark.asyncio
    async def test_store_budget_plan(self, budget_service, sample_budget_plan):
        """Test budget plan storage"""
        await budget_service._store_budget_plan(sample_budget_plan)
        
        # Verify database insert was called
        budget_service.db_manager.execute_query.assert_called()
        
        # Check that the query contains expected fields
        call_args = budget_service.db_manager.execute_query.call_args
        query = call_args[0][0]
        params = call_args[0][1]
        
        assert 'INSERT INTO budget_plans' in query
        assert params['user_id'] == 'test-user-123'
        assert params['total_income'] == 5000.0
    
    @pytest.mark.asyncio
    async def test_get_user_financial_data(self, budget_service):
        """Test user financial data retrieval"""
        # Mock database responses
        profile_data = [{
            'monthly_income': 5000.0,
            'monthly_expenses': 3500.0,
            'savings_balance': 15000.0,
            'total_debt': 5000.0,
            'emergency_fund': 2000.0
        }]
        
        transactions_data = [
            {
                'amount': -150.0,
                'category': 'groceries',
                'description': 'Store',
                'timestamp': datetime.now(),
                'merchant_name': 'Local Store'
            }
        ]
        
        debts_data = [
            {'debt_type': 'credit_card', 'balance': 3000.0}
        ]
        
        goals_data = [
            {
                'id': 'goal-1',
                'name': 'Emergency Fund',
                'type': 'emergency_fund',
                'target_amount': 10000.0,
                'current_amount': 2000.0,
                'target_date': datetime.now() + timedelta(days=365)
            }
        ]
        
        # Mock sequential database calls
        budget_service.db_manager.execute_query.side_effect = [
            profile_data,
            transactions_data,
            debts_data,
            goals_data
        ]
        
        result = await budget_service._get_user_financial_data('test-user-123')
        
        assert result is not None
        assert result['user_id'] == 'test-user-123'
        assert result['monthly_income'] == 5000.0
        assert len(result['transactions']) == 1
        assert len(result['financial_goals']) == 1
        assert result['debt_breakdown']['credit_card'] == 3000.0
    
    @pytest.mark.asyncio
    async def test_cleanup(self, budget_service):
        """Test service cleanup"""
        await budget_service.cleanup()
        
        budget_service.db_manager.cleanup.assert_called_once()
        budget_service.notification_manager.cleanup.assert_called_once()

if __name__ == '__main__':
    pytest.main([__file__])