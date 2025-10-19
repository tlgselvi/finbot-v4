"""
Comprehensive tests for Insight Generation Service
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch
import json

from services.insight_service import InsightGenerationService
from models.insight_generator import FinancialInsight, InsightType, InsightPriority

class TestInsightGenerationService:
    """Test cases for Insight Generation Service"""
    
    @pytest.fixture
    async def insight_service(self):
        """Create insight service instance for testing"""
        config = {
            'database_url': 'postgresql://test:test@localhost:5432/test_finbot',
            'insight_settings': {
                'min_confidence_threshold': 0.6,
                'max_insights_per_category': 5,
                'insight_validity_days': 7,
                'trend_analysis_days': 90,
                'comparison_periods': [30, 90, 365]
            },
            'thresholds': {
                'spending_increase_alert': 0.20,
                'savings_opportunity_min': 50.0,
                'budget_variance_alert': 0.15,
                'trend_significance': 0.10
            }
        }
        
        service = InsightGenerationService(config)
        
        # Mock database manager
        service.db_manager = AsyncMock()
        service.db_manager.initialize = AsyncMock(return_value=True)
        service.db_manager.execute_query = AsyncMock()
        
        # Mock notification manager
        service.notification_manager = AsyncMock()
        service.notification_manager.initialize = AsyncMock(return_value=True)
        service.notification_manager.send_insight_notification = AsyncMock()
        
        # Mock insight generator
        service.insight_generator = Mock()
        
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
                    'timestamp': (datetime.now() - timedelta(days=1)).isoformat(),
                    'merchant_name': 'Local Store'
                },
                {
                    'amount': -800.0,
                    'category': 'rent',
                    'description': 'Monthly rent',
                    'timestamp': (datetime.now() - timedelta(days=2)).isoformat(),
                    'merchant_name': 'Property Management'
                },
                {
                    'amount': -50.0,
                    'category': 'entertainment',
                    'description': 'Movie tickets',
                    'timestamp': (datetime.now() - timedelta(days=3)).isoformat(),
                    'merchant_name': 'Cinema'
                }
            ],
            'budget': {
                'groceries': 500.0,
                'rent': 800.0,
                'entertainment': 200.0
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
    def sample_insights(self):
        """Sample insights for testing"""
        return [
            FinancialInsight(
                id='insight-1',
                type=InsightType.SPENDING_PATTERN,
                title='High Grocery Spending',
                description='Your grocery spending is 20% above average',
                priority=InsightPriority.MEDIUM,
                confidence=0.85,
                impact_score=65,
                actionable=True,
                recommendations=[
                    'Consider meal planning to reduce grocery costs',
                    'Look for sales and use coupons',
                    'Buy generic brands when possible'
                ],
                data_points={
                    'category': 'groceries',
                    'current_spending': 600.0,
                    'average_spending': 500.0,
                    'variance_percent': 20.0
                },
                timestamp=datetime.now(),
                category='spending',
                tags=['groceries', 'overspending']
            ),
            FinancialInsight(
                id='insight-2',
                type=InsightType.SAVINGS_OPPORTUNITY,
                title='Subscription Optimization',
                description='You could save $75/month by optimizing subscriptions',
                priority=InsightPriority.HIGH,
                confidence=0.9,
                impact_score=80,
                actionable=True,
                recommendations=[
                    'Cancel unused streaming services',
                    'Switch to annual plans for discounts',
                    'Share family plans where possible'
                ],
                data_points={
                    'potential_savings': 75.0,
                    'subscription_count': 8,
                    'unused_subscriptions': 3
                },
                timestamp=datetime.now(),
                category='savings',
                tags=['subscriptions', 'optimization']
            )
        ]
    
    @pytest.mark.asyncio
    async def test_service_initialization(self, insight_service):
        """Test service initialization"""
        assert insight_service.is_initialized is True
        assert insight_service.db_manager is not None
        assert insight_service.notification_manager is not None
        assert insight_service.insight_generator is not None
    
    @pytest.mark.asyncio
    async def test_generate_user_insights_success(self, insight_service, sample_financial_data, sample_insights):
        """Test successful insight generation"""
        # Mock database and generator responses
        insight_service._get_user_financial_data = AsyncMock(return_value=sample_financial_data)
        insight_service.insight_generator.generate_insights = Mock(return_value=sample_insights)
        insight_service._store_insights = AsyncMock()
        insight_service._send_insight_notifications = AsyncMock()
        
        result = await insight_service.generate_user_insights('test-user-123')
        
        assert result['success'] is True
        assert result['user_id'] == 'test-user-123'
        assert len(result['insights']) == 2
        assert result['insights'][0]['type'] == 'spending_pattern'
        assert result['insights'][1]['type'] == 'savings_opportunity'
        
        # Verify methods were called
        insight_service._store_insights.assert_called_once()
        insight_service._send_insight_notifications.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_generate_user_insights_insufficient_data(self, insight_service):
        """Test insight generation with insufficient data"""
        insight_service._get_user_financial_data = AsyncMock(return_value=None)
        
        result = await insight_service.generate_user_insights('test-user-123')
        
        assert result['success'] is False
        assert 'Insufficient financial data' in result['error']
    
    @pytest.mark.asyncio
    async def test_get_user_insights_success(self, insight_service):
        """Test getting user insights"""
        # Mock database response
        mock_insights_data = [
            {
                'id': 'insight-1',
                'type': 'spending_pattern',
                'title': 'High Grocery Spending',
                'description': 'Your grocery spending is above average',
                'priority': 'medium',
                'confidence': 0.85,
                'impact_score': 65,
                'actionable': True,
                'recommendations': json.dumps([
                    'Consider meal planning',
                    'Look for sales'
                ]),
                'data_points': json.dumps({
                    'category': 'groceries',
                    'variance_percent': 20.0
                }),
                'category': 'spending',
                'tags': json.dumps(['groceries', 'overspending']),
                'created_at': datetime.now(),
                'valid_until': datetime.now() + timedelta(days=7)
            }
        ]
        
        insight_service.db_manager.execute_query.return_value = mock_insights_data
        
        result = await insight_service.get_user_insights('test-user-123')
        
        assert result['success'] is True
        assert len(result['insights']) == 1
        assert result['insights'][0]['title'] == 'High Grocery Spending'
        assert result['insights'][0]['actionable'] is True
    
    @pytest.mark.asyncio
    async def test_get_user_insights_with_filters(self, insight_service):
        """Test getting user insights with filters"""
        mock_insights_data = []
        insight_service.db_manager.execute_query.return_value = mock_insights_data
        
        result = await insight_service.get_user_insights(
            'test-user-123',
            insight_type='spending_pattern',
            category='spending',
            limit=10
        )
        
        assert result['success'] is True
        assert len(result['insights']) == 0
        
        # Verify query was called with filters
        call_args = insight_service.db_manager.execute_query.call_args
        query = call_args[0][0]
        params = call_args[0][1]
        
        assert 'type = :insight_type' in query
        assert 'category = :category' in query
        assert 'LIMIT :limit' in query
        assert params['insight_type'] == 'spending_pattern'
        assert params['category'] == 'spending'
        assert params['limit'] == 10
    
    @pytest.mark.asyncio
    async def test_update_insight_feedback(self, insight_service):
        """Test updating insight feedback"""
        insight_service.db_manager.execute_update.return_value = 1
        
        result = await insight_service.update_insight_feedback(
            'insight-123',
            'helpful',
            'This insight helped me save money'
        )
        
        assert result['success'] is True
        assert result['insight_id'] == 'insight-123'
        
        # Verify database update was called
        call_args = insight_service.db_manager.execute_update.call_args
        query = call_args[0][0]
        params = call_args[0][1]
        
        assert 'UPDATE financial_insights' in query
        assert params['feedback_type'] == 'helpful'
        assert params['feedback_notes'] == 'This insight helped me save money'
    
    @pytest.mark.asyncio
    async def test_dismiss_insight(self, insight_service):
        """Test dismissing an insight"""
        insight_service.db_manager.execute_update.return_value = 1
        
        result = await insight_service.dismiss_insight('insight-123', 'not_relevant')
        
        assert result['success'] is True
        assert result['insight_id'] == 'insight-123'
        
        # Verify database update was called
        call_args = insight_service.db_manager.execute_update.call_args
        query = call_args[0][0]
        params = call_args[0][1]
        
        assert 'UPDATE financial_insights' in query
        assert params['dismissed'] == True
        assert params['dismissal_reason'] == 'not_relevant'
    
    @pytest.mark.asyncio
    async def test_get_insight_analytics(self, insight_service):
        """Test getting insight analytics"""
        # Mock database response
        mock_analytics_data = [
            {
                'total_insights': 25,
                'actionable_insights': 20,
                'high_priority_insights': 5,
                'avg_confidence': 0.82,
                'feedback_positive': 15,
                'feedback_negative': 3,
                'dismissed_insights': 2
            }
        ]
        
        insight_service.db_manager.execute_query.return_value = mock_analytics_data
        
        result = await insight_service.get_insight_analytics('test-user-123', days=30)
        
        assert result['success'] is True
        assert result['analytics']['total_insights'] == 25
        assert result['analytics']['actionable_insights'] == 20
        assert result['analytics']['effectiveness_rate'] == 75.0  # 15/20 positive feedback
    
    @pytest.mark.asyncio
    async def test_store_insights(self, insight_service, sample_insights):
        """Test storing insights in database"""
        await insight_service._store_insights(sample_insights)
        
        # Verify database insert was called for each insight
        assert insight_service.db_manager.execute_query.call_count == len(sample_insights)
        
        # Check first insert call
        call_args = insight_service.db_manager.execute_query.call_args_list[0]
        query = call_args[0][0]
        params = call_args[0][1]
        
        assert 'INSERT INTO financial_insights' in query
        assert params['type'] == 'spending_pattern'
        assert params['title'] == 'High Grocery Spending'
    
    @pytest.mark.asyncio
    async def test_send_insight_notifications(self, insight_service, sample_insights):
        """Test sending insight notifications"""
        # Filter to high priority insights only
        high_priority_insights = [i for i in sample_insights if i.priority == InsightPriority.HIGH]
        
        await insight_service._send_insight_notifications('test-user-123', high_priority_insights)
        
        # Should send notification for high priority insight
        insight_service.notification_manager.send_insight_notification.assert_called_once()
        
        call_args = insight_service.notification_manager.send_insight_notification.call_args
        notification_data = call_args[0][0]
        
        assert notification_data['user_id'] == 'test-user-123'
        assert notification_data['notification_type'] == 'new_insights'
        assert len(notification_data['insights']) == 1
    
    @pytest.mark.asyncio
    async def test_get_user_financial_data(self, insight_service):
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
        
        budget_data = [
            {'category': 'groceries', 'budget_amount': 500.0}
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
        insight_service.db_manager.execute_query.side_effect = [
            profile_data,
            transactions_data,
            budget_data,
            goals_data
        ]
        
        result = await insight_service._get_user_financial_data('test-user-123')
        
        assert result is not None
        assert result['user_id'] == 'test-user-123'
        assert result['monthly_income'] == 5000.0
        assert len(result['transactions']) == 1
        assert result['budget']['groceries'] == 500.0
        assert len(result['financial_goals']) == 1
    
    def test_filter_insights_by_confidence(self, insight_service, sample_insights):
        """Test filtering insights by confidence threshold"""
        # Set confidence threshold to 0.9
        insight_service.config['insight_settings']['min_confidence_threshold'] = 0.9
        
        filtered_insights = insight_service._filter_insights_by_confidence(sample_insights)
        
        # Only the second insight has confidence >= 0.9
        assert len(filtered_insights) == 1
        assert filtered_insights[0].confidence == 0.9
    
    def test_rank_insights_by_priority(self, insight_service, sample_insights):
        """Test ranking insights by priority and impact"""
        ranked_insights = insight_service._rank_insights_by_priority(sample_insights)
        
        # High priority insight should come first
        assert ranked_insights[0].priority == InsightPriority.HIGH
        assert ranked_insights[1].priority == InsightPriority.MEDIUM
    
    def test_categorize_insights(self, insight_service, sample_insights):
        """Test categorizing insights by type"""
        categorized = insight_service._categorize_insights(sample_insights)
        
        assert 'spending_pattern' in categorized
        assert 'savings_opportunity' in categorized
        assert len(categorized['spending_pattern']) == 1
        assert len(categorized['savings_opportunity']) == 1
    
    @pytest.mark.asyncio
    async def test_cleanup_expired_insights(self, insight_service):
        """Test cleanup of expired insights"""
        insight_service.db_manager.execute_update.return_value = 5
        
        result = await insight_service.cleanup_expired_insights()
        
        assert result['success'] is True
        assert result['cleaned_up_count'] == 5
        
        # Verify cleanup query was called
        call_args = insight_service.db_manager.execute_update.call_args
        query = call_args[0][0]
        
        assert 'UPDATE financial_insights' in query
        assert 'valid_until < NOW()' in query
    
    @pytest.mark.asyncio
    async def test_get_trending_insights(self, insight_service):
        """Test getting trending insights across users"""
        # Mock database response
        mock_trending_data = [
            {
                'insight_type': 'savings_opportunity',
                'insight_count': 150,
                'avg_impact_score': 75.5,
                'common_recommendations': json.dumps([
                    'Cancel unused subscriptions',
                    'Switch to generic brands'
                ])
            },
            {
                'insight_type': 'spending_pattern',
                'insight_count': 120,
                'avg_impact_score': 65.2,
                'common_recommendations': json.dumps([
                    'Reduce dining out',
                    'Set spending limits'
                ])
            }
        ]
        
        insight_service.db_manager.execute_query.return_value = mock_trending_data
        
        result = await insight_service.get_trending_insights(days=30, limit=10)
        
        assert result['success'] is True
        assert len(result['trending_insights']) == 2
        assert result['trending_insights'][0]['insight_type'] == 'savings_opportunity'
        assert result['trending_insights'][0]['insight_count'] == 150
    
    @pytest.mark.asyncio
    async def test_cleanup(self, insight_service):
        """Test service cleanup"""
        await insight_service.cleanup()
        
        insight_service.db_manager.cleanup.assert_called_once()
        insight_service.notification_manager.cleanup.assert_called_once()

if __name__ == '__main__':
    pytest.main([__file__])