"""
Integration tests for Analytics Services
Tests the interaction between Budget, Goal, and Insight services
"""

import pytest
import pytest_asyncio
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch
import json

from services.budget_service import BudgetOptimizationService
from services.goal_service import GoalTrackingService
from services.insight_service import InsightGenerationService

class TestAnalyticsIntegration:
    """Integration test cases for Analytics Services"""
    
    @pytest_asyncio.fixture
    async def analytics_services(self):
        """Create integrated analytics services for testing"""
        # Create services with shared config
        config = {
            'database_url': 'postgresql://test:test@localhost:5432/test_finbot',
            'budget_settings': {
                'auto_optimization_interval_days': 30,
                'budget_alert_threshold': 0.9,
                'overspend_alert_threshold': 1.1
            },
            'goal_settings': {
                'auto_milestone_creation': True,
                'milestone_frequency_months': 3,
                'achievement_celebration': True
            },
            'insight_settings': {
                'min_confidence_threshold': 0.6,
                'max_insights_per_category': 5,
                'insight_validity_days': 7
            }
        }
        
        budget_service = BudgetOptimizationService(config)
        goal_service = GoalTrackingService(config)
        insight_service = InsightGenerationService(config)
        
        # Mock all database managers
        for service in [budget_service, goal_service, insight_service]:
            service.db_manager = AsyncMock()
            service.db_manager.initialize = AsyncMock(return_value=True)
            service.db_manager.execute_query = AsyncMock()
            service.db_manager.execute_insert = AsyncMock()
            service.db_manager.execute_update = AsyncMock()
            
            service.notification_manager = AsyncMock()
            service.notification_manager.initialize = AsyncMock(return_value=True)
            
            await service.initialize()
        
        return {
            'budget': budget_service,
            'goal': goal_service,
            'insight': insight_service
        }
    
    @pytest.fixture
    def comprehensive_user_data(self):
        """Comprehensive user data for integration testing"""
        return {
            'user_id': 'test-user-123',
            'financial_profile': {
                'monthly_income': 6000.0,
                'monthly_expenses': 4200.0,
                'savings_balance': 25000.0,
                'total_debt': 8000.0,
                'emergency_fund': 5000.0
            },
            'transactions': [
                {
                    'amount': -1200.0,
                    'category': 'housing',
                    'description': 'Rent payment',
                    'timestamp': (datetime.now() - timedelta(days=1)).isoformat()
                },
                {
                    'amount': -450.0,
                    'category': 'groceries',
                    'description': 'Weekly shopping',
                    'timestamp': (datetime.now() - timedelta(days=2)).isoformat()
                },
                {
                    'amount': -80.0,
                    'category': 'entertainment',
                    'description': 'Dinner out',
                    'timestamp': (datetime.now() - timedelta(days=3)).isoformat()
                }
            ],
            'goals': [
                {
                    'id': 'goal-1',
                    'name': 'Emergency Fund',
                    'goal_type': 'emergency_fund',
                    'target_amount': 15000.0,
                    'current_amount': 5000.0,
                    'priority': 'critical',
                    'monthly_contribution': 500.0,
                    'auto_contribute': True
                },
                {
                    'id': 'goal-2',
                    'name': 'Vacation Fund',
                    'goal_type': 'travel',
                    'target_amount': 5000.0,
                    'current_amount': 1200.0,
                    'priority': 'medium',
                    'monthly_contribution': 300.0,
                    'auto_contribute': True
                }
            ],
            'budget': {
                'housing': 1200.0,
                'groceries': 400.0,
                'entertainment': 200.0,
                'transportation': 300.0,
                'utilities': 150.0
            }
        }
    
    @pytest.mark.asyncio
    async def test_goal_aware_budget_optimization_flow(self, analytics_services, comprehensive_user_data):
        """Test complete goal-aware budget optimization flow"""
        budget_service = analytics_services['budget']
        goal_service = analytics_services['goal']
        
        # Mock goal service to return user goals
        goal_service.get_user_goals = AsyncMock(return_value={
            'success': True,
            'goals': comprehensive_user_data['goals']
        })
        
        # Mock budget optimization
        budget_service._get_user_financial_data = AsyncMock(
            return_value=comprehensive_user_data['financial_profile']
        )
        budget_service.optimize_user_budget = AsyncMock(return_value={
            'success': True,
            'budget_plan': {
                'total_income': 6000.0,
                'total_allocated': 4500.0,
                'allocations': [
                    {'category': 'housing', 'recommended_amount': 1200.0}
                ]
            }
        })
        budget_service._generate_goal_budget_insights = AsyncMock(return_value=[
            "✅ Balanced approach: 13.3% of income toward goals"
        ])
        
        # Execute goal-aware budget optimization
        result = await budget_service.optimize_budget_with_goals('test-user-123')
        
        assert result['success'] is True
        assert 'goal_integration' in result
        assert result['goal_integration']['active_goals'] == 2
        assert result['goal_integration']['total_goal_contributions'] == 800.0  # 500 + 300
        
        # Verify goal allocations were added
        goal_allocations = result['goal_integration']['goal_allocations']
        assert len(goal_allocations) == 2
        
        emergency_fund_alloc = next(
            (alloc for alloc in goal_allocations if 'Emergency Fund' in alloc['category']),
            None
        )
        assert emergency_fund_alloc is not None
        assert emergency_fund_alloc['recommended_amount'] == 500.0
    
    @pytest.mark.asyncio
    async def test_budget_goal_insight_generation_flow(self, analytics_services, comprehensive_user_data):
        """Test insight generation based on budget and goal data"""
        budget_service = analytics_services['budget']
        goal_service = analytics_services['goal']
        insight_service = analytics_services['insight']
        
        # Mock services to return comprehensive data
        budget_service.get_user_budget = AsyncMock(return_value={
            'success': True,
            'budget_plan': {
                'total_income': 6000.0,
                'total_allocated': 4500.0,
                'allocations': comprehensive_user_data['budget']
            }
        })
        
        goal_service.get_user_goals = AsyncMock(return_value={
            'success': True,
            'goals': comprehensive_user_data['goals']
        })
        
        # Mock insight generation with budget and goal context
        insight_service._get_user_financial_data = AsyncMock(return_value={
            **comprehensive_user_data['financial_profile'],
            'budget': comprehensive_user_data['budget'],
            'financial_goals': comprehensive_user_data['goals'],
            'transactions': comprehensive_user_data['transactions']
        })
        
        # Mock insight generator to return relevant insights
        mock_insights = [
            {
                'id': 'insight-1',
                'type': 'goal_progress',
                'title': 'Emergency Fund Progress',
                'description': 'You\'re 33% toward your emergency fund goal',
                'priority': 'medium',
                'confidence': 0.9,
                'actionable': True,
                'recommendations': ['Increase monthly contribution to reach goal faster'],
                'data_points': {'goal_id': 'goal-1', 'progress_percent': 33.3}
            },
            {
                'id': 'insight-2',
                'type': 'budget_optimization',
                'title': 'Budget Reallocation Opportunity',
                'description': 'Consider reallocating entertainment budget to goals',
                'priority': 'high',
                'confidence': 0.8,
                'actionable': True,
                'recommendations': ['Reduce entertainment spending by $50/month'],
                'data_points': {'category': 'entertainment', 'potential_savings': 50.0}
            }
        ]
        
        insight_service.insight_generator = Mock()
        insight_service.insight_generator.generate_insights = Mock(return_value=mock_insights)
        insight_service._store_insights = AsyncMock()
        insight_service._send_insight_notifications = AsyncMock()
        
        # Generate insights
        result = await insight_service.generate_user_insights('test-user-123')
        
        assert result['success'] is True
        assert len(result['insights']) == 2
        
        # Verify goal-related insight
        goal_insight = next(
            (insight for insight in result['insights'] if insight['type'] == 'goal_progress'),
            None
        )
        assert goal_insight is not None
        assert 'Emergency Fund' in goal_insight['title']
        
        # Verify budget-related insight
        budget_insight = next(
            (insight for insight in result['insights'] if insight['type'] == 'budget_optimization'),
            None
        )
        assert budget_insight is not None
        assert 'entertainment' in budget_insight['description']
    
    @pytest.mark.asyncio
    async def test_goal_progress_budget_adjustment_flow(self, analytics_services, comprehensive_user_data):
        """Test budget adjustment based on goal progress"""
        budget_service = analytics_services['budget']
        goal_service = analytics_services['goal']
        
        # Simulate goal progress update
        goal_service._get_goal_by_id = AsyncMock(return_value={
            'id': 'goal-1',
            'user_id': 'test-user-123',
            'name': 'Emergency Fund',
            'current_amount': 5000.0,
            'target_amount': 15000.0,
            'target_date': datetime.now() + timedelta(days=300)
        })
        
        goal_service._update_goal_amount = AsyncMock()
        goal_service._record_progress_tracking = AsyncMock(return_value={
            'progress_percent': 40.0,  # Increased from 33.3%
            'on_track': True
        })
        goal_service._check_milestone_completions = AsyncMock(return_value=[])
        goal_service._generate_progress_insights = AsyncMock(return_value=[
            "Great progress! You're 40% complete"
        ])
        
        # Update goal progress
        progress_result = await goal_service.update_goal_progress('goal-1', 1000.0)
        
        assert progress_result['success'] is True
        assert progress_result['new_amount'] == 6000.0
        assert progress_result['progress_percent'] == 40.0
        
        # Now test budget adjustment based on improved goal progress
        budget_service.evaluate_budget_performance = AsyncMock(return_value={
            'success': True,
            'performance': {
                'overall_performance': 85.0,
                'recommendations': ['Consider increasing goal contributions']
            }
        })
        budget_service.get_user_budget = AsyncMock(return_value={'success': True})
        
        adjustment_result = await budget_service.suggest_budget_adjustments('test-user-123')
        
        assert adjustment_result['success'] is True
        assert 'adjustment_recommendations' in adjustment_result
    
    @pytest.mark.asyncio
    async def test_cross_service_data_consistency(self, analytics_services, comprehensive_user_data):
        """Test data consistency across services"""
        budget_service = analytics_services['budget']
        goal_service = analytics_services['goal']
        insight_service = analytics_services['insight']
        
        user_id = 'test-user-123'
        
        # Mock consistent financial data across services
        consistent_financial_data = {
            'user_id': user_id,
            'monthly_income': 6000.0,
            'monthly_expenses': 4200.0,
            'savings_balance': 25000.0,
            'total_debt': 8000.0,
            'emergency_fund': 5000.0
        }
        
        # All services should return consistent financial data
        budget_service._get_user_financial_data = AsyncMock(return_value=consistent_financial_data)
        goal_service._get_user_financial_context = AsyncMock(return_value=consistent_financial_data)
        insight_service._get_user_financial_data = AsyncMock(return_value=consistent_financial_data)
        
        # Test data retrieval from each service
        budget_data = await budget_service._get_user_financial_data(user_id)
        goal_data = await goal_service._get_user_financial_context(user_id)
        insight_data = await insight_service._get_user_financial_data(user_id)
        
        # Verify consistency
        assert budget_data['monthly_income'] == goal_data['monthly_income'] == insight_data['monthly_income']
        assert budget_data['monthly_expenses'] == goal_data['monthly_expenses'] == insight_data['monthly_expenses']
        assert budget_data['emergency_fund'] == goal_data['emergency_fund'] == insight_data['emergency_fund']
    
    @pytest.mark.asyncio
    async def test_notification_coordination(self, analytics_services):
        """Test coordinated notifications across services"""
        budget_service = analytics_services['budget']
        goal_service = analytics_services['goal']
        insight_service = analytics_services['insight']
        
        # Test that services don't send duplicate notifications
        user_id = 'test-user-123'
        
        # Simulate budget alert
        await budget_service.notification_manager.send_anomaly_alert({
            'user_id': user_id,
            'alert_type': 'budget_alert',
            'title': 'Budget Alert'
        })
        
        # Simulate goal notification
        await goal_service.notification_manager.send_goal_notification({
            'user_id': user_id,
            'notification_type': 'goal_progress',
            'title': 'Goal Progress'
        })
        
        # Simulate insight notification
        await insight_service.notification_manager.send_insight_notification({
            'user_id': user_id,
            'notification_type': 'new_insights',
            'title': 'New Insights'
        })
        
        # Verify each service sent its notification
        budget_service.notification_manager.send_anomaly_alert.assert_called_once()
        goal_service.notification_manager.send_goal_notification.assert_called_once()
        insight_service.notification_manager.send_insight_notification.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_error_handling_across_services(self, analytics_services):
        """Test error handling and graceful degradation"""
        budget_service = analytics_services['budget']
        goal_service = analytics_services['goal']
        
        # Simulate goal service failure
        goal_service.get_user_goals = AsyncMock(return_value={
            'success': False,
            'error': 'Database connection failed'
        })
        
        # Budget service should gracefully handle goal service failure
        budget_service.optimize_user_budget = AsyncMock(return_value={
            'success': True,
            'budget_plan': {'total_income': 6000.0}
        })
        
        result = await budget_service.optimize_budget_with_goals('test-user-123')
        
        # Should fallback to regular budget optimization
        assert result['success'] is True
        budget_service.optimize_user_budget.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_performance_under_load(self, analytics_services):
        """Test service performance with multiple concurrent requests"""
        budget_service = analytics_services['budget']
        goal_service = analytics_services['goal']
        insight_service = analytics_services['insight']
        
        # Mock fast responses
        budget_service._get_user_financial_data = AsyncMock(return_value={'user_id': 'test'})
        goal_service._get_user_financial_context = AsyncMock(return_value={'user_id': 'test'})
        insight_service._get_user_financial_data = AsyncMock(return_value={'user_id': 'test'})
        
        # Simulate concurrent requests
        tasks = []
        for i in range(10):
            user_id = f'user-{i}'
            tasks.extend([
                budget_service._get_user_financial_data(user_id),
                goal_service._get_user_financial_context(user_id),
                insight_service._get_user_financial_data(user_id)
            ])
        
        # Execute all tasks concurrently
        start_time = datetime.now()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        end_time = datetime.now()
        
        # Verify all requests completed successfully
        assert len(results) == 30  # 10 users * 3 services
        assert all(isinstance(result, dict) for result in results)
        
        # Performance should be reasonable (less than 1 second for mocked calls)
        execution_time = (end_time - start_time).total_seconds()
        assert execution_time < 1.0
    
    @pytest.mark.asyncio
    async def test_service_cleanup_coordination(self, analytics_services):
        """Test coordinated cleanup across services"""
        budget_service = analytics_services['budget']
        goal_service = analytics_services['goal']
        insight_service = analytics_services['insight']
        
        # Cleanup all services
        await budget_service.cleanup()
        await goal_service.cleanup()
        await insight_service.cleanup()
        
        # Verify cleanup was called for each service
        budget_service.db_manager.cleanup.assert_called_once()
        goal_service.db_manager.cleanup.assert_called_once()
        insight_service.db_manager.cleanup.assert_called_once()

if __name__ == '__main__':
    pytest.main([__file__])