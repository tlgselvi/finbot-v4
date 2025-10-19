"""
Tests for Goal Tracking Service
"""

import pytest
import pytest_asyncio
import asyncio
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock, patch
import json

from services.goal_service import (
    GoalTrackingService, FinancialGoal, GoalMilestone,
    GoalType, GoalStatus, GoalPriority, MilestoneStatus
)

class TestGoalTrackingService:
    """Test cases for Goal Tracking Service"""
    
    @pytest_asyncio.fixture
    async def goal_service(self):
        """Create goal service instance for testing"""
        config = {
            'database_url': 'postgresql://test:test@localhost:5432/test_finbot',
            'goal_settings': {
                'auto_milestone_creation': True,
                'milestone_frequency_months': 3,
                'progress_check_frequency_days': 7,
                'achievement_celebration': True,
                'strategy_update_frequency_days': 30
            },
            'ai_settings': {
                'enable_smart_recommendations': True,
                'enable_adaptive_planning': True,
                'enable_risk_assessment': True,
                'confidence_threshold': 0.7
            },
            'notification_settings': {
                'enable_progress_updates': True,
                'enable_milestone_alerts': True,
                'enable_strategy_suggestions': True,
                'enable_achievement_celebrations': True
            }
        }
        
        service = GoalTrackingService(config)
        
        # Mock database manager
        service.db_manager = AsyncMock()
        service.db_manager.initialize = AsyncMock(return_value=True)
        service.db_manager.execute_query = AsyncMock()
        service.db_manager.execute_insert = AsyncMock()
        
        # Mock notification manager
        service.notification_manager = AsyncMock()
        service.notification_manager.initialize = AsyncMock(return_value=True)
        service.notification_manager.send_goal_notification = AsyncMock()
        
        await service.initialize()
        return service
    
    @pytest.fixture
    def sample_goal_data(self):
        """Sample goal data for testing"""
        return {
            'user_id': 'test-user-123',
            'name': 'Emergency Fund',
            'goal_type': 'emergency_fund',
            'target_amount': 10000.0,
            'current_amount': 2000.0,
            'target_date': (datetime.now() + timedelta(days=365)).isoformat(),
            'priority': 'high',
            'description': 'Build emergency fund for financial security',
            'category': 'savings',
            'auto_contribute': True,
            'monthly_contribution': 500.0
        }
    
    @pytest.fixture
    def sample_financial_data(self):
        """Sample financial data for testing"""
        return {
            'user_id': 'test-user-123',
            'monthly_income': 5000.0,
            'monthly_expenses': 3500.0,
            'savings_balance': 15000.0,
            'total_debt': 5000.0,
            'emergency_fund': 2000.0
        }
    
    @pytest.mark.asyncio
    async def test_service_initialization(self, goal_service):
        """Test service initialization"""
        assert goal_service.is_initialized is True
        assert goal_service.db_manager is not None
        assert goal_service.notification_manager is not None
    
    @pytest.mark.asyncio
    async def test_create_goal_success(self, goal_service, sample_goal_data, sample_financial_data):
        """Test successful goal creation"""
        # Mock database responses
        goal_service.db_manager.execute_insert.return_value = 'test-goal-id-123'
        goal_service._get_user_financial_context = AsyncMock(return_value=sample_financial_data)
        goal_service._store_milestone = AsyncMock(return_value='milestone-id-123')
        
        result = await goal_service.create_goal(sample_goal_data)
        
        assert result['success'] is True
        assert result['goal']['name'] == 'Emergency Fund'
        assert result['goal']['target_amount'] == 10000.0
        assert result['goal']['goal_type'] == 'emergency_fund'
        assert 'achievement_strategy' in result
        assert result['achievement_strategy']['strategy_type'] == 'ai_optimized'
    
    @pytest.mark.asyncio
    async def test_create_goal_missing_required_field(self, goal_service):
        """Test goal creation with missing required field"""
        incomplete_data = {
            'user_id': 'test-user-123',
            'name': 'Test Goal'
            # Missing goal_type and target_amount
        }
        
        result = await goal_service.create_goal(incomplete_data)
        
        assert result['success'] is False
        assert 'Missing required field' in result['error']
    
    @pytest.mark.asyncio
    async def test_update_goal_progress(self, goal_service):
        """Test goal progress update"""
        # Mock goal data
        mock_goal_data = {
            'id': 'test-goal-123',
            'user_id': 'test-user-123',
            'name': 'Emergency Fund',
            'current_amount': 2000.0,
            'target_amount': 10000.0,
            'target_date': datetime.now() + timedelta(days=300)
        }
        
        goal_service._get_goal_by_id = AsyncMock(return_value=mock_goal_data)
        goal_service._update_goal_amount = AsyncMock()
        goal_service._record_progress_tracking = AsyncMock(return_value={
            'progress_percent': 30.0,
            'days_to_target': 300,
            'on_track': True
        })
        goal_service._check_milestone_completions = AsyncMock(return_value=[])
        goal_service._generate_progress_insights = AsyncMock(return_value=[
            "Great progress! You're 30% complete"
        ])
        
        result = await goal_service.update_goal_progress('test-goal-123', 1000.0, 'manual')
        
        assert result['success'] is True
        assert result['previous_amount'] == 2000.0
        assert result['new_amount'] == 3000.0
        assert result['contribution_amount'] == 1000.0
        assert result['progress_percent'] == 30.0
        assert result['goal_completed'] is False
    
    @pytest.mark.asyncio
    async def test_update_goal_progress_completion(self, goal_service):
        """Test goal completion through progress update"""
        # Mock goal data near completion
        mock_goal_data = {
            'id': 'test-goal-123',
            'user_id': 'test-user-123',
            'name': 'Emergency Fund',
            'current_amount': 9500.0,
            'target_amount': 10000.0,
            'target_date': datetime.now() + timedelta(days=30)
        }
        
        goal_service._get_goal_by_id = AsyncMock(return_value=mock_goal_data)
        goal_service._update_goal_amount = AsyncMock()
        goal_service._record_progress_tracking = AsyncMock(return_value={
            'progress_percent': 100.0,
            'days_to_target': 30,
            'on_track': True
        })
        goal_service._check_milestone_completions = AsyncMock(return_value=[])
        goal_service._complete_goal = AsyncMock()
        goal_service._send_goal_completion_notification = AsyncMock()
        goal_service._generate_progress_insights = AsyncMock(return_value=[
            "🏁 Goal completed! Congratulations!"
        ])
        
        result = await goal_service.update_goal_progress('test-goal-123', 500.0, 'manual')
        
        assert result['success'] is True
        assert result['new_amount'] == 10000.0
        assert result['goal_completed'] is True
        assert result['remaining_amount'] == 0
        
        # Verify completion methods were called
        goal_service._complete_goal.assert_called_once_with('test-goal-123')
        goal_service._send_goal_completion_notification.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_user_goals(self, goal_service):
        """Test getting user goals"""
        # Mock database response
        mock_goals_data = [
            {
                'id': 'goal-1',
                'name': 'Emergency Fund',
                'goal_type': 'emergency_fund',
                'target_amount': 10000.0,
                'current_amount': 3000.0,
                'target_date': datetime.now() + timedelta(days=300),
                'priority': 'high',
                'description': 'Emergency fund',
                'category': 'savings',
                'auto_contribute': True,
                'monthly_contribution': 500.0,
                'status': 'active',
                'created_at': datetime.now(),
                'updated_at': datetime.now(),
                'completed_at': None,
                'achievement_strategy': '{}',
                'completed_milestones': 1,
                'total_milestones': 4
            }
        ]
        
        goal_service.db_manager.execute_query.return_value = mock_goals_data
        goal_service._get_goal_milestones = AsyncMock(return_value=[])
        goal_service._get_recent_progress = AsyncMock(return_value={
            'total_contributions': 1000.0,
            'contribution_count': 2,
            'avg_contribution': 500.0
        })
        
        result = await goal_service.get_user_goals('test-user-123')
        
        assert result['success'] is True
        assert len(result['goals']) == 1
        assert result['goals'][0]['name'] == 'Emergency Fund'
        assert result['goals'][0]['progress_percent'] == 30.0  # 3000/10000 * 100
        assert result['total_goals'] == 1
        assert result['active_goals'] == 1
    
    @pytest.mark.asyncio
    async def test_generate_goal_recommendations(self, goal_service, sample_financial_data):
        """Test AI-powered goal recommendations"""
        goal_service._get_user_financial_context = AsyncMock(return_value=sample_financial_data)
        goal_service.get_user_goals = AsyncMock(return_value={
            'success': True,
            'goals': []  # No existing goals
        })
        
        result = await goal_service.generate_goal_recommendations('test-user-123')
        
        assert result['success'] is True
        assert len(result['recommendations']) > 0
        
        # Should recommend emergency fund first (highest priority)
        emergency_fund_rec = next(
            (rec for rec in result['recommendations'] if rec['goal_type'] == 'emergency_fund'),
            None
        )
        assert emergency_fund_rec is not None
        assert emergency_fund_rec['priority'] == 'critical'
    
    def test_analyze_goal_timeline(self, goal_service, sample_financial_data):
        """Test goal timeline analysis"""
        goal = FinancialGoal(
            user_id='test-user-123',
            name='Test Goal',
            goal_type=GoalType.SAVINGS,
            target_amount=12000.0,
            current_amount=2000.0,
            target_date=datetime.now() + timedelta(days=365)
        )
        
        timeline_analysis = goal_service._analyze_goal_timeline(goal, sample_financial_data)
        
        assert 'feasibility_score' in timeline_analysis
        assert 'recommended_timeline_months' in timeline_analysis
        assert 'required_monthly_contribution' in timeline_analysis
        assert 'success_probability' in timeline_analysis
        assert timeline_analysis['feasibility_score'] > 0
    
    def test_assess_goal_risks(self, goal_service, sample_financial_data):
        """Test goal risk assessment"""
        goal = FinancialGoal(
            user_id='test-user-123',
            name='Test Goal',
            goal_type=GoalType.SAVINGS,
            target_amount=50000.0,  # Large amount
            current_amount=0.0,
            target_date=datetime.now() + timedelta(days=180)  # Short timeline
        )
        
        risk_assessment = goal_service._assess_goal_risks(goal, sample_financial_data)
        
        assert 'risks' in risk_assessment
        assert 'mitigations' in risk_assessment
        assert 'overall_risk_level' in risk_assessment
        assert len(risk_assessment['risks']) > 0  # Should identify risks
    
    def test_generate_milestone_suggestions(self, goal_service):
        """Test milestone generation"""
        goal = FinancialGoal(
            user_id='test-user-123',
            name='Test Goal',
            goal_type=GoalType.SAVINGS,
            target_amount=12000.0,
            current_amount=2000.0
        )
        
        timeline_analysis = {
            'recommended_timeline_months': 12,
            'required_monthly_contribution': 833.33
        }
        
        milestones = goal_service._generate_milestone_suggestions(goal, timeline_analysis)
        
        assert len(milestones) > 0
        assert all('name' in m for m in milestones)
        assert all('target_amount' in m for m in milestones)
        assert all('target_date' in m for m in milestones)
    
    def test_generate_smart_goal_recommendations(self, goal_service, sample_financial_data):
        """Test smart goal recommendation generation"""
        existing_goal_types = []  # No existing goals
        
        recommendations = goal_service._generate_smart_goal_recommendations(
            sample_financial_data, existing_goal_types
        )
        
        assert len(recommendations) > 0
        
        # Should prioritize emergency fund
        emergency_fund_rec = next(
            (rec for rec in recommendations if rec['goal_type'] == 'emergency_fund'),
            None
        )
        assert emergency_fund_rec is not None
        assert emergency_fund_rec['priority'] == 'critical'
        
        # Should include debt payoff (user has debt)
        debt_rec = next(
            (rec for rec in recommendations if rec['goal_type'] == 'debt_payoff'),
            None
        )
        assert debt_rec is not None
        assert debt_rec['priority'] == 'high'

if __name__ == '__main__':
    pytest.main([__file__])