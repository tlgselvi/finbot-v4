"""
Goal Tracking and Planning Service
AI-assisted financial goal setting, tracking, and achievement planning
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from enum import Enum
import json
import os
from utils.database import DatabaseManager

# Mock notification manager for now
class NotificationManager:
    async def initialize(self):
        return True
    
    async def send_goal_notification(self, data):
        logger.info(f"Goal notification: {data.get('title', 'No title')}")
    
    async def cleanup(self):
        pass

logger = logging.getLogger(__name__)

class GoalType(Enum):
    """Financial goal types"""
    SAVINGS = "savings"
    DEBT_PAYOFF = "debt_payoff"
    INVESTMENT = "investment"
    EMERGENCY_FUND = "emergency_fund"
    PURCHASE = "purchase"
    RETIREMENT = "retirement"
    EDUCATION = "education"
    TRAVEL = "travel"
    HOME_PURCHASE = "home_purchase"
    BUSINESS = "business"

class GoalStatus(Enum):
    """Goal status types"""
    ACTIVE = "active"
    COMPLETED = "completed"
    PAUSED = "paused"
    CANCELLED = "cancelled"
    OVERDUE = "overdue"

class GoalPriority(Enum):
    """Goal priority levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class MilestoneStatus(Enum):
    """Milestone status types"""
    PENDING = "pending"
    COMPLETED = "completed"
    OVERDUE = "overdue"

class FinancialGoal:
    """Financial goal data model"""
    
    def __init__(self, user_id: str, name: str, goal_type: GoalType,
                 target_amount: float, current_amount: float = 0.0,
                 target_date: Optional[datetime] = None,
                 priority: GoalPriority = GoalPriority.MEDIUM,
                 description: Optional[str] = None,
                 category: Optional[str] = None,
                 auto_contribute: bool = False,
                 monthly_contribution: float = 0.0,
                 goal_id: Optional[str] = None):
        
        self.id = goal_id
        self.user_id = user_id
        self.name = name
        self.goal_type = goal_type
        self.target_amount = target_amount
        self.current_amount = current_amount
        self.target_date = target_date
        self.priority = priority
        self.description = description
        self.category = category
        self.auto_contribute = auto_contribute
        self.monthly_contribution = monthly_contribution
        self.status = GoalStatus.ACTIVE
        self.created_at = datetime.now()
        self.updated_at = datetime.now()
        self.milestones = []

class GoalMilestone:
    """Goal milestone data model"""
    
    def __init__(self, goal_id: str, name: str, target_amount: float,
                 target_date: Optional[datetime] = None,
                 description: Optional[str] = None,
                 milestone_id: Optional[str] = None):
        
        self.id = milestone_id
        self.goal_id = goal_id
        self.name = name
        self.target_amount = target_amount
        self.target_date = target_date
        self.description = description
        self.status = MilestoneStatus.PENDING
        self.completed_at = None
        self.created_at = datetime.now()

class GoalTrackingService:
    """
    Service for AI-assisted goal tracking and planning
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._get_default_config()
        self.db_manager = DatabaseManager()
        self.notification_manager = NotificationManager()
        self.is_initialized = False
        
    def _get_default_config(self) -> Dict:
        """Get default service configuration"""
        return {
            'database_url': os.getenv('DATABASE_URL', 'postgresql://localhost:5432/finbot'),
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
    
    async def initialize(self) -> bool:
        """Initialize the goal tracking service"""
        try:
            # Initialize database manager
            if self.db_manager:
                await self.db_manager.initialize(self.config['database_url'])
                await self._create_goal_tables()
            
            # Initialize notification manager
            await self.notification_manager.initialize()
            
            self.is_initialized = True
            logger.info("Goal tracking service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Goal service initialization error: {str(e)}")
            return False    

    async def _create_goal_tables(self) -> None:
        """Create necessary database tables for goal tracking"""
        try:
            create_queries = [
                """
                CREATE TABLE IF NOT EXISTS financial_goals (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    goal_type VARCHAR(50) NOT NULL,
                    target_amount DECIMAL(12,2) NOT NULL,
                    current_amount DECIMAL(12,2) DEFAULT 0.00,
                    target_date DATE,
                    priority VARCHAR(20) DEFAULT 'medium',
                    description TEXT,
                    category VARCHAR(100),
                    auto_contribute BOOLEAN DEFAULT FALSE,
                    monthly_contribution DECIMAL(12,2) DEFAULT 0.00,
                    status VARCHAR(20) DEFAULT 'active',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    completed_at TIMESTAMP,
                    achievement_strategy JSONB,
                    progress_history JSONB DEFAULT '[]'::jsonb
                );
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_financial_goals_user_id 
                ON financial_goals(user_id);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_financial_goals_status 
                ON financial_goals(status);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_financial_goals_type 
                ON financial_goals(goal_type);
                """,
                """
                CREATE TABLE IF NOT EXISTS goal_milestones (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
                    name VARCHAR(255) NOT NULL,
                    target_amount DECIMAL(12,2) NOT NULL,
                    target_date DATE,
                    description TEXT,
                    status VARCHAR(20) DEFAULT 'pending',
                    completed_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT NOW(),
                    order_index INTEGER DEFAULT 0
                );
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal_id 
                ON goal_milestones(goal_id);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_goal_milestones_status 
                ON goal_milestones(status);
                """,
                """
                CREATE TABLE IF NOT EXISTS goal_progress_tracking (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL,
                    previous_amount DECIMAL(12,2) NOT NULL,
                    new_amount DECIMAL(12,2) NOT NULL,
                    contribution_amount DECIMAL(12,2) NOT NULL,
                    contribution_source VARCHAR(100),
                    progress_percent DECIMAL(5,2),
                    days_to_target INTEGER,
                    on_track BOOLEAN,
                    notes TEXT,
                    recorded_at TIMESTAMP DEFAULT NOW()
                );
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_goal_progress_tracking_goal_id 
                ON goal_progress_tracking(goal_id);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_goal_progress_tracking_user_id 
                ON goal_progress_tracking(user_id);
                """,
                """
                CREATE TABLE IF NOT EXISTS goal_strategies (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    goal_id UUID NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
                    user_id UUID NOT NULL,
                    strategy_type VARCHAR(50) NOT NULL,
                    strategy_name VARCHAR(255) NOT NULL,
                    description TEXT,
                    recommended_actions JSONB,
                    expected_impact DECIMAL(5,2),
                    confidence_score DECIMAL(3,2),
                    implementation_difficulty VARCHAR(20),
                    estimated_timeline_days INTEGER,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    last_updated TIMESTAMP DEFAULT NOW()
                );
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_goal_strategies_goal_id 
                ON goal_strategies(goal_id);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_goal_strategies_active 
                ON goal_strategies(is_active);
                """
            ]
            
            for query in create_queries:
                await self.db_manager.execute_query(query)
            
            logger.info("Goal tracking tables created successfully")
            
        except Exception as e:
            logger.error(f"Error creating goal tables: {str(e)}")
            raise
    
    async def create_goal(self, goal_data: Dict) -> Dict:
        """
        Create a new financial goal with AI-assisted planning
        
        Args:
            goal_data: Goal information dictionary
            
        Returns:
            Created goal with AI-generated strategy
        """
        try:
            if not self.is_initialized:
                raise ValueError("Service not initialized")
            
            # Validate required fields
            required_fields = ['user_id', 'name', 'goal_type', 'target_amount']
            for field in required_fields:
                if field not in goal_data:
                    return {
                        'success': False,
                        'error': f'Missing required field: {field}'
                    }
            
            # Create goal object
            goal = FinancialGoal(
                user_id=goal_data['user_id'],
                name=goal_data['name'],
                goal_type=GoalType(goal_data['goal_type']),
                target_amount=float(goal_data['target_amount']),
                current_amount=float(goal_data.get('current_amount', 0)),
                target_date=datetime.fromisoformat(goal_data['target_date']) if goal_data.get('target_date') else None,
                priority=GoalPriority(goal_data.get('priority', 'medium')),
                description=goal_data.get('description'),
                category=goal_data.get('category'),
                auto_contribute=goal_data.get('auto_contribute', False),
                monthly_contribution=float(goal_data.get('monthly_contribution', 0))
            )
            
            # Generate AI-powered achievement strategy
            strategy = await self._generate_achievement_strategy(goal)
            
            # Store goal in database
            goal_id = await self._store_goal(goal, strategy)
            goal.id = goal_id
            
            # Create automatic milestones if enabled
            if self.config['goal_settings']['auto_milestone_creation']:
                milestones = await self._create_automatic_milestones(goal)
                goal.milestones = milestones
            
            # Send welcome notification
            await self._send_goal_creation_notification(goal, strategy)
            
            result = {
                'success': True,
                'goal': {
                    'id': str(goal.id),
                    'user_id': goal.user_id,
                    'name': goal.name,
                    'goal_type': goal.goal_type.value,
                    'target_amount': goal.target_amount,
                    'current_amount': goal.current_amount,
                    'target_date': goal.target_date.isoformat() if goal.target_date else None,
                    'priority': goal.priority.value,
                    'description': goal.description,
                    'category': goal.category,
                    'auto_contribute': goal.auto_contribute,
                    'monthly_contribution': goal.monthly_contribution,
                    'status': goal.status.value,
                    'created_at': goal.created_at.isoformat(),
                    'progress_percent': (goal.current_amount / goal.target_amount * 100) if goal.target_amount > 0 else 0,
                    'milestones': [
                        {
                            'id': str(m.id),
                            'name': m.name,
                            'target_amount': m.target_amount,
                            'target_date': m.target_date.isoformat() if m.target_date else None,
                            'status': m.status.value
                        }
                        for m in goal.milestones
                    ]
                },
                'achievement_strategy': strategy
            }
            
            logger.info(f"Goal created successfully for user {goal.user_id}: {goal.name}")
            return result
            
        except Exception as e:
            logger.error(f"Goal creation error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }   
 
    async def _generate_achievement_strategy(self, goal: FinancialGoal) -> Dict:
        """
        Generate AI-powered achievement strategy for a goal
        
        Args:
            goal: Financial goal object
            
        Returns:
            Achievement strategy with recommendations
        """
        try:
            # Get user's financial data for context
            financial_data = await self._get_user_financial_context(goal.user_id)
            
            if not financial_data:
                # Fallback to basic strategy
                return self._generate_basic_strategy(goal)
            
            # Calculate timeline and feasibility
            timeline_analysis = self._analyze_goal_timeline(goal, financial_data)
            
            # Generate personalized recommendations
            recommendations = self._generate_strategy_recommendations(goal, financial_data, timeline_analysis)
            
            # Assess risks and challenges
            risk_assessment = self._assess_goal_risks(goal, financial_data)
            
            # Create comprehensive strategy
            strategy = {
                'goal_id': str(goal.id) if goal.id else None,
                'strategy_type': 'ai_optimized',
                'feasibility_score': timeline_analysis['feasibility_score'],
                'recommended_timeline': timeline_analysis['recommended_timeline_months'],
                'monthly_target': timeline_analysis['required_monthly_contribution'],
                'confidence_level': timeline_analysis['confidence'],
                'primary_recommendations': recommendations['primary'],
                'alternative_strategies': recommendations['alternatives'],
                'risk_factors': risk_assessment['risks'],
                'mitigation_strategies': risk_assessment['mitigations'],
                'success_probability': timeline_analysis['success_probability'],
                'key_milestones': self._generate_milestone_suggestions(goal, timeline_analysis),
                'optimization_tips': recommendations['optimization_tips'],
                'created_at': datetime.now().isoformat(),
                'last_updated': datetime.now().isoformat()
            }
            
            return strategy
            
        except Exception as e:
            logger.error(f"Strategy generation error: {str(e)}")
            return self._generate_basic_strategy(goal)
    
    def _analyze_goal_timeline(self, goal: FinancialGoal, financial_data: Dict) -> Dict:
        """Analyze goal timeline and feasibility"""
        try:
            monthly_income = financial_data.get('monthly_income', 0)
            monthly_expenses = financial_data.get('monthly_expenses', 0)
            available_monthly = max(0, monthly_income - monthly_expenses)
            
            remaining_amount = goal.target_amount - goal.current_amount
            
            if goal.target_date:
                target_date = goal.target_date
                months_remaining = max(1, (target_date - datetime.now()).days / 30.44)
                required_monthly = remaining_amount / months_remaining
            else:
                # Suggest reasonable timeline based on amount and income
                if available_monthly > 0:
                    months_remaining = max(6, remaining_amount / (available_monthly * 0.2))  # 20% of available income
                    required_monthly = remaining_amount / months_remaining
                    target_date = datetime.now() + timedelta(days=int(months_remaining * 30.44))
                else:
                    months_remaining = 24  # Default 2 years
                    required_monthly = remaining_amount / months_remaining
                    target_date = datetime.now() + timedelta(days=730)
            
            # Calculate feasibility
            feasibility_score = min(100, (available_monthly / required_monthly * 100)) if required_monthly > 0 else 100
            
            # Determine success probability
            if feasibility_score >= 80:
                success_probability = 0.9
                confidence = 0.9
            elif feasibility_score >= 60:
                success_probability = 0.7
                confidence = 0.8
            elif feasibility_score >= 40:
                success_probability = 0.5
                confidence = 0.6
            else:
                success_probability = 0.3
                confidence = 0.4
            
            return {
                'feasibility_score': feasibility_score,
                'recommended_timeline_months': int(months_remaining),
                'required_monthly_contribution': required_monthly,
                'available_monthly_budget': available_monthly,
                'success_probability': success_probability,
                'confidence': confidence,
                'target_date': target_date.isoformat()
            }
            
        except Exception as e:
            logger.error(f"Timeline analysis error: {str(e)}")
            return {
                'feasibility_score': 50,
                'recommended_timeline_months': 12,
                'required_monthly_contribution': remaining_amount / 12,
                'success_probability': 0.5,
                'confidence': 0.5
            }
    
    def _generate_strategy_recommendations(self, goal: FinancialGoal, 
                                         financial_data: Dict, 
                                         timeline_analysis: Dict) -> Dict:
        """Generate personalized strategy recommendations"""
        try:
            primary_recommendations = []
            alternatives = []
            optimization_tips = []
            
            required_monthly = timeline_analysis['required_monthly_contribution']
            available_monthly = timeline_analysis['available_monthly_budget']
            feasibility_score = timeline_analysis['feasibility_score']
            
            # Primary recommendations based on feasibility
            if feasibility_score >= 80:
                primary_recommendations.extend([
                    f"Set up automatic monthly transfer of ${required_monthly:.2f}",
                    f"Your goal is highly achievable with your current income",
                    "Consider increasing contributions to reach your goal faster"
                ])
            elif feasibility_score >= 60:
                primary_recommendations.extend([
                    f"Aim for ${required_monthly:.2f} monthly contributions",
                    "Review discretionary spending for optimization opportunities",
                    "Consider side income to accelerate progress"
                ])
            else:
                primary_recommendations.extend([
                    "Current timeline may be challenging with available budget",
                    f"Consider extending timeline or reducing target to ${available_monthly * timeline_analysis['recommended_timeline_months']:.2f}",
                    "Focus on increasing income or reducing expenses first"
                ])
            
            # Goal-type specific recommendations
            goal_type_recommendations = self._get_goal_type_recommendations(goal.goal_type, financial_data)
            primary_recommendations.extend(goal_type_recommendations)
            
            # Alternative strategies
            if feasibility_score < 70:
                alternatives.extend([
                    {
                        'name': 'Extended Timeline',
                        'description': f'Extend goal timeline to {int(timeline_analysis["recommended_timeline_months"] * 1.5)} months',
                        'monthly_required': required_monthly * 0.67,
                        'success_probability': min(0.9, timeline_analysis['success_probability'] + 0.2)
                    },
                    {
                        'name': 'Reduced Target',
                        'description': f'Reduce target to ${goal.target_amount * 0.8:.2f}',
                        'monthly_required': required_monthly * 0.8,
                        'success_probability': min(0.9, timeline_analysis['success_probability'] + 0.3)
                    }
                ])
            
            # Optimization tips
            optimization_tips.extend([
                "Track progress weekly to stay motivated",
                "Celebrate milestone achievements",
                "Review and adjust strategy monthly",
                "Consider high-yield savings accounts for better returns"
            ])
            
            if goal.goal_type in [GoalType.INVESTMENT, GoalType.RETIREMENT]:
                optimization_tips.append("Consider dollar-cost averaging for investment goals")
            
            return {
                'primary': primary_recommendations,
                'alternatives': alternatives,
                'optimization_tips': optimization_tips
            }
            
        except Exception as e:
            logger.error(f"Recommendation generation error: {str(e)}")
            return {
                'primary': ["Set up regular contributions toward your goal"],
                'alternatives': [],
                'optimization_tips': ["Track progress regularly"]
            }
    
    def _get_goal_type_recommendations(self, goal_type: GoalType, financial_data: Dict) -> List[str]:
        """Get goal-type specific recommendations"""
        recommendations = []
        
        if goal_type == GoalType.EMERGENCY_FUND:
            recommendations.extend([
                "Aim for 3-6 months of expenses as emergency fund",
                "Keep emergency fund in high-yield savings account",
                "Prioritize this goal over other savings goals"
            ])
        elif goal_type == GoalType.DEBT_PAYOFF:
            recommendations.extend([
                "Consider debt avalanche method (highest interest first)",
                "Look into debt consolidation options",
                "Avoid taking on new debt while paying off existing debt"
            ])
        elif goal_type == GoalType.RETIREMENT:
            recommendations.extend([
                "Take advantage of employer 401(k) matching",
                "Consider Roth IRA for tax-free growth",
                "Start as early as possible for compound growth"
            ])
        elif goal_type == GoalType.HOME_PURCHASE:
            recommendations.extend([
                "Save for 20% down payment to avoid PMI",
                "Factor in closing costs (2-5% of home price)",
                "Maintain good credit score for better mortgage rates"
            ])
        elif goal_type == GoalType.INVESTMENT:
            recommendations.extend([
                "Diversify investments across asset classes",
                "Consider low-cost index funds",
                "Invest regularly regardless of market conditions"
            ])
        
        return recommendations
    
    def _assess_goal_risks(self, goal: FinancialGoal, financial_data: Dict) -> Dict:
        """Assess risks and challenges for goal achievement"""
        try:
            risks = []
            mitigations = []
            
            monthly_income = financial_data.get('monthly_income', 0)
            monthly_expenses = financial_data.get('monthly_expenses', 0)
            emergency_fund = financial_data.get('emergency_fund', 0)
            total_debt = financial_data.get('total_debt', 0)
            
            # Income stability risk
            if monthly_income < monthly_expenses * 1.2:
                risks.append({
                    'type': 'income_stability',
                    'level': 'high',
                    'description': 'Limited income buffer may affect consistent contributions'
                })
                mitigations.append('Build emergency fund before aggressive goal contributions')
            
            # Emergency fund risk
            if emergency_fund < monthly_expenses * 3:
                risks.append({
                    'type': 'emergency_fund',
                    'level': 'medium',
                    'description': 'Insufficient emergency fund may force goal interruption'
                })
                mitigations.append('Prioritize emergency fund alongside goal contributions')
            
            # Debt burden risk
            if total_debt > monthly_income * 6:
                risks.append({
                    'type': 'debt_burden',
                    'level': 'high',
                    'description': 'High debt levels may limit available funds for goal'
                })
                mitigations.append('Consider debt payoff strategy before new savings goals')
            
            # Timeline risk
            if goal.target_date and (goal.target_date - datetime.now()).days < 180:
                risks.append({
                    'type': 'timeline',
                    'level': 'medium',
                    'description': 'Short timeline may require aggressive saving'
                })
                mitigations.append('Consider extending timeline or reducing target amount')
            
            # Goal amount risk
            if goal.target_amount > monthly_income * 12:
                risks.append({
                    'type': 'goal_size',
                    'level': 'medium',
                    'description': 'Large goal amount may require long-term commitment'
                })
                mitigations.append('Break down into smaller milestones for motivation')
            
            return {
                'risks': risks,
                'mitigations': mitigations,
                'overall_risk_level': self._calculate_overall_risk_level(risks)
            }
            
        except Exception as e:
            logger.error(f"Risk assessment error: {str(e)}")
            return {
                'risks': [],
                'mitigations': [],
                'overall_risk_level': 'low'
            }
    
    def _calculate_overall_risk_level(self, risks: List[Dict]) -> str:
        """Calculate overall risk level from individual risks"""
        if not risks:
            return 'low'
        
        high_risks = sum(1 for risk in risks if risk['level'] == 'high')
        medium_risks = sum(1 for risk in risks if risk['level'] == 'medium')
        
        if high_risks >= 2:
            return 'high'
        elif high_risks >= 1 or medium_risks >= 3:
            return 'medium'
        else:
            return 'low'
    
    def _generate_milestone_suggestions(self, goal: FinancialGoal, timeline_analysis: Dict) -> List[Dict]:
        """Generate milestone suggestions for the goal"""
        try:
            milestones = []
            target_amount = goal.target_amount
            current_amount = goal.current_amount
            remaining_amount = target_amount - current_amount
            
            timeline_months = timeline_analysis['recommended_timeline_months']
            
            # Create quarterly milestones for goals longer than 6 months
            if timeline_months >= 6:
                milestone_count = min(8, max(2, timeline_months // 3))  # 2-8 milestones
                
                for i in range(1, milestone_count + 1):
                    milestone_percent = i / milestone_count
                    milestone_amount = current_amount + (remaining_amount * milestone_percent)
                    milestone_date = datetime.now() + timedelta(days=int(timeline_months * 30.44 * milestone_percent))
                    
                    milestones.append({
                        'name': f"{milestone_percent:.0%} Progress Milestone",
                        'target_amount': milestone_amount,
                        'target_date': milestone_date.isoformat(),
                        'description': f"Reach ${milestone_amount:.2f} by {milestone_date.strftime('%B %Y')}"
                    })
            else:
                # For shorter goals, create monthly milestones
                for i in range(1, timeline_months + 1):
                    milestone_percent = i / timeline_months
                    milestone_amount = current_amount + (remaining_amount * milestone_percent)
                    milestone_date = datetime.now() + timedelta(days=int(i * 30.44))
                    
                    milestones.append({
                        'name': f"Month {i} Target",
                        'target_amount': milestone_amount,
                        'target_date': milestone_date.isoformat(),
                        'description': f"Reach ${milestone_amount:.2f} by end of month {i}"
                    })
            
            return milestones
            
        except Exception as e:
            logger.error(f"Milestone generation error: {str(e)}")
            return []
    
    async def _create_automatic_milestones(self, goal: FinancialGoal) -> List[GoalMilestone]:
        """Create automatic milestones for a goal"""
        try:
            milestones = []
            
            # Get milestone suggestions from strategy
            financial_data = await self._get_user_financial_context(goal.user_id)
            timeline_analysis = self._analyze_goal_timeline(goal, financial_data or {})
            milestone_suggestions = self._generate_milestone_suggestions(goal, timeline_analysis)
            
            # Create milestone objects and store in database
            for i, suggestion in enumerate(milestone_suggestions):
                milestone = GoalMilestone(
                    goal_id=str(goal.id),
                    name=suggestion['name'],
                    target_amount=suggestion['target_amount'],
                    target_date=datetime.fromisoformat(suggestion['target_date']),
                    description=suggestion['description']
                )
                
                # Store milestone in database
                milestone_id = await self._store_milestone(milestone, i)
                milestone.id = milestone_id
                milestones.append(milestone)
            
            return milestones
            
        except Exception as e:
            logger.error(f"Automatic milestone creation error: {str(e)}")
            return []
    
    async def _store_milestone(self, milestone: GoalMilestone, order_index: int) -> str:
        """Store milestone in database"""
        try:
            insert_query = """
            INSERT INTO goal_milestones 
            (goal_id, name, target_amount, target_date, description, order_index)
            VALUES 
            (:goal_id, :name, :target_amount, :target_date, :description, :order_index)
            RETURNING id
            """
            
            params = {
                'goal_id': milestone.goal_id,
                'name': milestone.name,
                'target_amount': milestone.target_amount,
                'target_date': milestone.target_date,
                'description': milestone.description,
                'order_index': order_index
            }
            
            result = await self.db_manager.execute_insert(insert_query, params)
            return str(result)
            
        except Exception as e:
            logger.error(f"Milestone storage error: {str(e)}")
            raise
    
    def _generate_basic_strategy(self, goal: FinancialGoal) -> Dict:
        """Generate basic fallback strategy"""
        remaining_amount = goal.target_amount - goal.current_amount
        
        if goal.target_date:
            months_remaining = max(1, (goal.target_date - datetime.now()).days / 30.44)
        else:
            months_remaining = 12  # Default 1 year
        
        monthly_required = remaining_amount / months_remaining
        
        return {
            'strategy_type': 'basic',
            'feasibility_score': 70,
            'recommended_timeline_months': int(months_remaining),
            'monthly_target': monthly_required,
            'confidence_level': 0.6,
            'primary_recommendations': [
                f"Save ${monthly_required:.2f} per month to reach your goal",
                "Set up automatic transfers to stay on track",
                "Review progress monthly and adjust as needed"
            ],
            'alternative_strategies': [],
            'risk_factors': [],
            'mitigation_strategies': [],
            'success_probability': 0.7,
            'key_milestones': [],
            'optimization_tips': [
                "Track your progress regularly",
                "Celebrate small wins along the way"
            ],
            'created_at': datetime.now().isoformat()
        }  
  
    async def _store_goal(self, goal: FinancialGoal, strategy: Dict) -> str:
        """Store goal in database"""
        try:
            insert_query = """
            INSERT INTO financial_goals 
            (user_id, name, goal_type, target_amount, current_amount, target_date,
             priority, description, category, auto_contribute, monthly_contribution,
             status, achievement_strategy)
            VALUES 
            (:user_id, :name, :goal_type, :target_amount, :current_amount, :target_date,
             :priority, :description, :category, :auto_contribute, :monthly_contribution,
             :status, :achievement_strategy)
            RETURNING id
            """
            
            params = {
                'user_id': goal.user_id,
                'name': goal.name,
                'goal_type': goal.goal_type.value,
                'target_amount': goal.target_amount,
                'current_amount': goal.current_amount,
                'target_date': goal.target_date,
                'priority': goal.priority.value,
                'description': goal.description,
                'category': goal.category,
                'auto_contribute': goal.auto_contribute,
                'monthly_contribution': goal.monthly_contribution,
                'status': goal.status.value,
                'achievement_strategy': json.dumps(strategy)
            }
            
            result = await self.db_manager.execute_insert(insert_query, params)
            return str(result)
            
        except Exception as e:
            logger.error(f"Goal storage error: {str(e)}")
            raise
    
    async def update_goal_progress(self, goal_id: str, contribution_amount: float,
                                 contribution_source: str = "manual",
                                 notes: Optional[str] = None) -> Dict:
        """
        Update goal progress with new contribution
        
        Args:
            goal_id: Goal identifier
            contribution_amount: Amount contributed
            contribution_source: Source of contribution
            notes: Optional notes
            
        Returns:
            Updated goal progress information
        """
        try:
            if not self.is_initialized:
                raise ValueError("Service not initialized")
            
            # Get current goal
            goal_data = await self._get_goal_by_id(goal_id)
            if not goal_data:
                return {
                    'success': False,
                    'error': 'Goal not found'
                }
            
            # Calculate new amounts
            previous_amount = float(goal_data['current_amount'])
            new_amount = previous_amount + contribution_amount
            target_amount = float(goal_data['target_amount'])
            
            # Update goal in database
            await self._update_goal_amount(goal_id, new_amount)
            
            # Record progress tracking
            progress_data = await self._record_progress_tracking(
                goal_id, goal_data['user_id'], previous_amount, 
                new_amount, contribution_amount, contribution_source, notes
            )
            
            # Check for milestone completions
            completed_milestones = await self._check_milestone_completions(goal_id, new_amount)
            
            # Check if goal is completed
            goal_completed = new_amount >= target_amount
            if goal_completed:
                await self._complete_goal(goal_id)
                await self._send_goal_completion_notification(goal_data, new_amount)
            
            # Generate progress insights
            insights = await self._generate_progress_insights(goal_data, progress_data)
            
            result = {
                'success': True,
                'goal_id': goal_id,
                'previous_amount': previous_amount,
                'new_amount': new_amount,
                'contribution_amount': contribution_amount,
                'progress_percent': (new_amount / target_amount * 100) if target_amount > 0 else 0,
                'remaining_amount': max(0, target_amount - new_amount),
                'goal_completed': goal_completed,
                'completed_milestones': completed_milestones,
                'progress_insights': insights,
                'recorded_at': datetime.now().isoformat()
            }
            
            # Send progress notification
            if not goal_completed:
                await self._send_progress_notification(goal_data, result)
            
            logger.info(f"Goal progress updated: {goal_id}, contribution: ${contribution_amount}")
            return result
            
        except Exception as e:
            logger.error(f"Goal progress update error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def get_user_goals(self, user_id: str, status: Optional[str] = None,
                           include_completed: bool = False) -> Dict:
        """
        Get all goals for a user
        
        Args:
            user_id: User identifier
            status: Filter by status
            include_completed: Include completed goals
            
        Returns:
            User's goals with progress information
        """
        try:
            if not self.is_initialized:
                raise ValueError("Service not initialized")
            
            # Build query based on filters
            where_conditions = ["user_id = :user_id"]
            params = {'user_id': user_id}
            
            if status:
                where_conditions.append("status = :status")
                params['status'] = status
            elif not include_completed:
                where_conditions.append("status != 'completed'")
            
            query = f"""
            SELECT g.*, 
                   COALESCE(
                       (SELECT COUNT(*) FROM goal_milestones m 
                        WHERE m.goal_id = g.id AND m.status = 'completed'), 0
                   ) as completed_milestones,
                   COALESCE(
                       (SELECT COUNT(*) FROM goal_milestones m 
                        WHERE m.goal_id = g.id), 0
                   ) as total_milestones
            FROM financial_goals g
            WHERE {' AND '.join(where_conditions)}
            ORDER BY 
                CASE priority 
                    WHEN 'critical' THEN 1 
                    WHEN 'high' THEN 2 
                    WHEN 'medium' THEN 3 
                    WHEN 'low' THEN 4 
                END,
                created_at DESC
            """
            
            goals_result = await self.db_manager.execute_query(query, params)
            
            goals = []
            for goal_data in goals_result:
                # Get milestones for each goal
                milestones = await self._get_goal_milestones(str(goal_data['id']))
                
                # Calculate progress metrics
                progress_percent = (goal_data['current_amount'] / goal_data['target_amount'] * 100) if goal_data['target_amount'] > 0 else 0
                
                # Get recent progress
                recent_progress = await self._get_recent_progress(str(goal_data['id']), days=30)
                
                goal_info = {
                    'id': str(goal_data['id']),
                    'name': goal_data['name'],
                    'goal_type': goal_data['goal_type'],
                    'target_amount': float(goal_data['target_amount']),
                    'current_amount': float(goal_data['current_amount']),
                    'target_date': goal_data['target_date'].isoformat() if goal_data['target_date'] else None,
                    'priority': goal_data['priority'],
                    'description': goal_data['description'],
                    'category': goal_data['category'],
                    'auto_contribute': goal_data['auto_contribute'],
                    'monthly_contribution': float(goal_data['monthly_contribution']),
                    'status': goal_data['status'],
                    'created_at': goal_data['created_at'].isoformat(),
                    'updated_at': goal_data['updated_at'].isoformat(),
                    'completed_at': goal_data['completed_at'].isoformat() if goal_data['completed_at'] else None,
                    'progress_percent': progress_percent,
                    'remaining_amount': max(0, goal_data['target_amount'] - goal_data['current_amount']),
                    'milestones': milestones,
                    'completed_milestones': goal_data['completed_milestones'],
                    'total_milestones': goal_data['total_milestones'],
                    'recent_progress': recent_progress,
                    'achievement_strategy': json.loads(goal_data['achievement_strategy']) if goal_data['achievement_strategy'] else None
                }
                
                goals.append(goal_info)
            
            return {
                'success': True,
                'user_id': user_id,
                'goals': goals,
                'total_goals': len(goals),
                'active_goals': len([g for g in goals if g['status'] == 'active']),
                'completed_goals': len([g for g in goals if g['status'] == 'completed'])
            }
            
        except Exception as e:
            logger.error(f"Get user goals error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _get_goal_by_id(self, goal_id: str) -> Optional[Dict]:
        """Get goal by ID"""
        try:
            query = "SELECT * FROM financial_goals WHERE id = :goal_id"
            result = await self.db_manager.execute_query(query, {'goal_id': goal_id})
            return result[0] if result else None
        except Exception as e:
            logger.error(f"Get goal by ID error: {str(e)}")
            return None
    
    async def _update_goal_amount(self, goal_id: str, new_amount: float) -> None:
        """Update goal current amount"""
        try:
            update_query = """
            UPDATE financial_goals 
            SET current_amount = :new_amount, updated_at = NOW()
            WHERE id = :goal_id
            """
            await self.db_manager.execute_query(update_query, {
                'goal_id': goal_id,
                'new_amount': new_amount
            })
        except Exception as e:
            logger.error(f"Update goal amount error: {str(e)}")
            raise
    
    async def _record_progress_tracking(self, goal_id: str, user_id: str,
                                      previous_amount: float, new_amount: float,
                                      contribution_amount: float, contribution_source: str,
                                      notes: Optional[str]) -> Dict:
        """Record progress tracking entry"""
        try:
            # Get goal data for calculations
            goal_data = await self._get_goal_by_id(goal_id)
            target_amount = float(goal_data['target_amount'])
            target_date = goal_data['target_date']
            
            # Calculate metrics
            progress_percent = (new_amount / target_amount * 100) if target_amount > 0 else 0
            
            days_to_target = None
            on_track = True
            
            if target_date:
                days_to_target = (target_date - datetime.now().date()).days
                if days_to_target > 0:
                    required_daily = (target_amount - new_amount) / days_to_target
                    current_daily_rate = contribution_amount  # Simplified calculation
                    on_track = current_daily_rate >= required_daily * 0.8  # 80% threshold
            
            insert_query = """
            INSERT INTO goal_progress_tracking 
            (goal_id, user_id, previous_amount, new_amount, contribution_amount,
             contribution_source, progress_percent, days_to_target, on_track, notes)
            VALUES 
            (:goal_id, :user_id, :previous_amount, :new_amount, :contribution_amount,
             :contribution_source, :progress_percent, :days_to_target, :on_track, :notes)
            """
            
            params = {
                'goal_id': goal_id,
                'user_id': user_id,
                'previous_amount': previous_amount,
                'new_amount': new_amount,
                'contribution_amount': contribution_amount,
                'contribution_source': contribution_source,
                'progress_percent': progress_percent,
                'days_to_target': days_to_target,
                'on_track': on_track,
                'notes': notes
            }
            
            await self.db_manager.execute_query(insert_query, params)
            
            return {
                'progress_percent': progress_percent,
                'days_to_target': days_to_target,
                'on_track': on_track
            }
            
        except Exception as e:
            logger.error(f"Progress tracking record error: {str(e)}")
            return {}
    
    async def _check_milestone_completions(self, goal_id: str, current_amount: float) -> List[Dict]:
        """Check and mark completed milestones"""
        try:
            # Get pending milestones that should be completed
            query = """
            SELECT * FROM goal_milestones 
            WHERE goal_id = :goal_id 
                AND status = 'pending' 
                AND target_amount <= :current_amount
            ORDER BY target_amount ASC
            """
            
            milestones = await self.db_manager.execute_query(query, {
                'goal_id': goal_id,
                'current_amount': current_amount
            })
            
            completed_milestones = []
            
            for milestone in milestones:
                # Mark milestone as completed
                update_query = """
                UPDATE goal_milestones 
                SET status = 'completed', completed_at = NOW()
                WHERE id = :milestone_id
                """
                
                await self.db_manager.execute_query(update_query, {
                    'milestone_id': milestone['id']
                })
                
                completed_milestones.append({
                    'id': str(milestone['id']),
                    'name': milestone['name'],
                    'target_amount': float(milestone['target_amount']),
                    'completed_at': datetime.now().isoformat()
                })
                
                # Send milestone completion notification
                await self._send_milestone_completion_notification(milestone, goal_id)
            
            return completed_milestones
            
        except Exception as e:
            logger.error(f"Milestone completion check error: {str(e)}")
            return []
    
    async def _complete_goal(self, goal_id: str) -> None:
        """Mark goal as completed"""
        try:
            update_query = """
            UPDATE financial_goals 
            SET status = 'completed', completed_at = NOW(), updated_at = NOW()
            WHERE id = :goal_id
            """
            await self.db_manager.execute_query(update_query, {'goal_id': goal_id})
        except Exception as e:
            logger.error(f"Goal completion error: {str(e)}")
            raise
    
    async def _get_goal_milestones(self, goal_id: str) -> List[Dict]:
        """Get milestones for a goal"""
        try:
            query = """
            SELECT * FROM goal_milestones 
            WHERE goal_id = :goal_id 
            ORDER BY order_index ASC, target_amount ASC
            """
            
            milestones = await self.db_manager.execute_query(query, {'goal_id': goal_id})
            
            return [
                {
                    'id': str(m['id']),
                    'name': m['name'],
                    'target_amount': float(m['target_amount']),
                    'target_date': m['target_date'].isoformat() if m['target_date'] else None,
                    'description': m['description'],
                    'status': m['status'],
                    'completed_at': m['completed_at'].isoformat() if m['completed_at'] else None,
                    'order_index': m['order_index']
                }
                for m in milestones
            ]
            
        except Exception as e:
            logger.error(f"Get goal milestones error: {str(e)}")
            return []
    
    async def _get_recent_progress(self, goal_id: str, days: int = 30) -> Dict:
        """Get recent progress for a goal"""
        try:
            query = """
            SELECT 
                SUM(contribution_amount) as total_contributions,
                COUNT(*) as contribution_count,
                AVG(contribution_amount) as avg_contribution,
                MAX(recorded_at) as last_contribution_date
            FROM goal_progress_tracking 
            WHERE goal_id = :goal_id 
                AND recorded_at >= NOW() - INTERVAL '%s days'
            """ % days
            
            result = await self.db_manager.execute_query(query, {'goal_id': goal_id})
            
            if result and result[0]['total_contributions']:
                return {
                    'total_contributions': float(result[0]['total_contributions']),
                    'contribution_count': result[0]['contribution_count'],
                    'avg_contribution': float(result[0]['avg_contribution']),
                    'last_contribution_date': result[0]['last_contribution_date'].isoformat() if result[0]['last_contribution_date'] else None,
                    'period_days': days
                }
            else:
                return {
                    'total_contributions': 0,
                    'contribution_count': 0,
                    'avg_contribution': 0,
                    'last_contribution_date': None,
                    'period_days': days
                }
                
        except Exception as e:
            logger.error(f"Get recent progress error: {str(e)}")
            return {}
    
    async def _generate_progress_insights(self, goal_data: Dict, progress_data: Dict) -> List[str]:
        """Generate insights based on progress"""
        insights = []
        
        try:
            progress_percent = progress_data.get('progress_percent', 0)
            on_track = progress_data.get('on_track', True)
            days_to_target = progress_data.get('days_to_target')
            
            # Progress milestone insights
            if progress_percent >= 25 and progress_percent < 30:
                insights.append("🎉 Great start! You've reached 25% of your goal")
            elif progress_percent >= 50 and progress_percent < 55:
                insights.append("🎯 Halfway there! You're making excellent progress")
            elif progress_percent >= 75 and progress_percent < 80:
                insights.append("🚀 Almost there! You're 75% complete")
            elif progress_percent >= 90:
                insights.append("🏁 Final stretch! You're so close to achieving your goal")
            
            # Timeline insights
            if days_to_target:
                if days_to_target < 30 and progress_percent < 90:
                    insights.append("⏰ Less than a month left - consider increasing contributions")
                elif days_to_target < 7 and progress_percent < 95:
                    insights.append("🔥 Final week! Push hard to reach your goal")
            
            # Performance insights
            if not on_track:
                insights.append("📈 Consider adjusting your contribution strategy to stay on track")
            elif on_track and progress_percent > 50:
                insights.append("✅ You're on track! Keep up the great work")
            
            return insights
            
        except Exception as e:
            logger.error(f"Progress insights generation error: {str(e)}")
            return [] 
   
    async def _get_user_financial_context(self, user_id: str) -> Optional[Dict]:
        """Get user's financial context for goal planning"""
        try:
            # Get basic financial profile
            profile_query = """
            SELECT 
                monthly_income,
                monthly_expenses,
                savings_balance,
                total_debt,
                emergency_fund
            FROM user_financial_profiles 
            WHERE user_id = :user_id
            """
            
            profile_result = await self.db_manager.execute_query(
                profile_query, {'user_id': user_id}
            )
            
            if not profile_result:
                return None
            
            profile = profile_result[0]
            
            return {
                'user_id': user_id,
                'monthly_income': float(profile.get('monthly_income', 0)),
                'monthly_expenses': float(profile.get('monthly_expenses', 0)),
                'savings_balance': float(profile.get('savings_balance', 0)),
                'total_debt': float(profile.get('total_debt', 0)),
                'emergency_fund': float(profile.get('emergency_fund', 0))
            }
            
        except Exception as e:
            logger.error(f"Error getting financial context for user {user_id}: {str(e)}")
            return None
    
    async def _send_goal_creation_notification(self, goal: FinancialGoal, strategy: Dict) -> None:
        """Send goal creation notification"""
        try:
            if not self.config['notification_settings']['enable_strategy_suggestions']:
                return
            
            notification_data = {
                'user_id': goal.user_id,
                'notification_type': 'goal_created',
                'title': f"🎯 New Goal Created: {goal.name}",
                'message': f"Your goal to save ${goal.target_amount:.2f} has been created with an AI-optimized strategy!",
                'goal_id': str(goal.id),
                'goal_name': goal.name,
                'target_amount': goal.target_amount,
                'strategy_summary': {
                    'feasibility_score': strategy.get('feasibility_score', 0),
                    'monthly_target': strategy.get('monthly_target', 0),
                    'success_probability': strategy.get('success_probability', 0),
                    'primary_recommendations': strategy.get('primary_recommendations', [])[:3]  # Top 3
                },
                'timestamp': datetime.now().isoformat()
            }
            
            await self.notification_manager.send_goal_notification(notification_data)
            
        except Exception as e:
            logger.error(f"Goal creation notification error: {str(e)}")
    
    async def _send_progress_notification(self, goal_data: Dict, progress_result: Dict) -> None:
        """Send progress update notification"""
        try:
            if not self.config['notification_settings']['enable_progress_updates']:
                return
            
            # Only send notifications for significant progress (every 10% or milestone)
            progress_percent = progress_result['progress_percent']
            
            # Check if this is a significant milestone (every 10%)
            milestone_reached = int(progress_percent) % 10 == 0 and int(progress_percent) > 0
            
            if milestone_reached or progress_result['completed_milestones']:
                notification_data = {
                    'user_id': goal_data['user_id'],
                    'notification_type': 'goal_progress',
                    'title': f"📈 Progress Update: {goal_data['name']}",
                    'message': f"Great job! You're now {progress_percent:.1f}% complete (${progress_result['new_amount']:.2f} of ${goal_data['target_amount']:.2f})",
                    'goal_id': str(goal_data['id']),
                    'progress_percent': progress_percent,
                    'contribution_amount': progress_result['contribution_amount'],
                    'remaining_amount': progress_result['remaining_amount'],
                    'completed_milestones': progress_result['completed_milestones'],
                    'insights': progress_result['progress_insights'],
                    'timestamp': datetime.now().isoformat()
                }
                
                await self.notification_manager.send_goal_notification(notification_data)
            
        except Exception as e:
            logger.error(f"Progress notification error: {str(e)}")
    
    async def _send_milestone_completion_notification(self, milestone: Dict, goal_id: str) -> None:
        """Send milestone completion notification"""
        try:
            if not self.config['notification_settings']['enable_milestone_alerts']:
                return
            
            # Get goal data for context
            goal_data = await self._get_goal_by_id(goal_id)
            
            notification_data = {
                'user_id': goal_data['user_id'],
                'notification_type': 'milestone_completed',
                'title': f"🎉 Milestone Achieved!",
                'message': f"Congratulations! You've completed the '{milestone['name']}' milestone for your {goal_data['name']} goal!",
                'goal_id': goal_id,
                'goal_name': goal_data['name'],
                'milestone_name': milestone['name'],
                'milestone_amount': float(milestone['target_amount']),
                'timestamp': datetime.now().isoformat()
            }
            
            await self.notification_manager.send_goal_notification(notification_data)
            
        except Exception as e:
            logger.error(f"Milestone completion notification error: {str(e)}")
    
    async def _send_goal_completion_notification(self, goal_data: Dict, final_amount: float) -> None:
        """Send goal completion celebration notification"""
        try:
            if not self.config['notification_settings']['enable_achievement_celebrations']:
                return
            
            notification_data = {
                'user_id': goal_data['user_id'],
                'notification_type': 'goal_completed',
                'title': f"🏆 Goal Achieved: {goal_data['name']}!",
                'message': f"Incredible! You've successfully reached your goal of ${goal_data['target_amount']:.2f}! Time to celebrate and set your next goal!",
                'goal_id': str(goal_data['id']),
                'goal_name': goal_data['name'],
                'target_amount': float(goal_data['target_amount']),
                'final_amount': final_amount,
                'completion_date': datetime.now().isoformat(),
                'celebration_message': self._generate_celebration_message(goal_data),
                'next_steps': [
                    "Celebrate your achievement!",
                    "Consider setting a new financial goal",
                    "Review what strategies worked best for future goals"
                ],
                'timestamp': datetime.now().isoformat()
            }
            
            await self.notification_manager.send_goal_notification(notification_data)
            
        except Exception as e:
            logger.error(f"Goal completion notification error: {str(e)}")
    
    def _generate_celebration_message(self, goal_data: Dict) -> str:
        """Generate personalized celebration message"""
        goal_type = goal_data['goal_type']
        
        celebration_messages = {
            'savings': "You've built a solid financial foundation! 💰",
            'emergency_fund': "You're now prepared for life's unexpected moments! 🛡️",
            'debt_payoff': "Freedom from debt - what an amazing achievement! 🎊",
            'investment': "Your future self will thank you for this investment! 📈",
            'retirement': "You're building the retirement of your dreams! 🌅",
            'home_purchase': "You're one step closer to your dream home! 🏠",
            'travel': "Adventure awaits - you've earned this trip! ✈️",
            'education': "Investing in yourself is the best investment! 🎓"
        }
        
        return celebration_messages.get(goal_type, "What an incredible achievement! 🌟")
    
    async def generate_goal_recommendations(self, user_id: str) -> Dict:
        """
        Generate AI-powered goal recommendations for a user
        
        Args:
            user_id: User identifier
            
        Returns:
            Personalized goal recommendations
        """
        try:
            if not self.is_initialized:
                raise ValueError("Service not initialized")
            
            # Get user's financial context
            financial_data = await self._get_user_financial_context(user_id)
            if not financial_data:
                return {
                    'success': False,
                    'error': 'Insufficient financial data for recommendations'
                }
            
            # Get existing goals
            existing_goals = await self.get_user_goals(user_id)
            existing_goal_types = [goal['goal_type'] for goal in existing_goals.get('goals', [])]
            
            # Generate recommendations based on financial profile
            recommendations = self._generate_smart_goal_recommendations(financial_data, existing_goal_types)
            
            return {
                'success': True,
                'user_id': user_id,
                'recommendations': recommendations,
                'financial_context': {
                    'monthly_income': financial_data['monthly_income'],
                    'monthly_expenses': financial_data['monthly_expenses'],
                    'available_monthly': max(0, financial_data['monthly_income'] - financial_data['monthly_expenses']),
                    'emergency_fund_status': financial_data['emergency_fund']
                },
                'generated_at': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Goal recommendations error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _generate_smart_goal_recommendations(self, financial_data: Dict, existing_goal_types: List[str]) -> List[Dict]:
        """Generate smart goal recommendations based on financial profile"""
        recommendations = []
        
        monthly_income = financial_data['monthly_income']
        monthly_expenses = financial_data['monthly_expenses']
        available_monthly = max(0, monthly_income - monthly_expenses)
        emergency_fund = financial_data['emergency_fund']
        total_debt = financial_data['total_debt']
        
        # Emergency fund recommendation (highest priority)
        if 'emergency_fund' not in existing_goal_types and emergency_fund < monthly_expenses * 3:
            target_emergency_fund = monthly_expenses * 6
            recommendations.append({
                'goal_type': 'emergency_fund',
                'priority': 'critical',
                'name': 'Emergency Fund',
                'target_amount': target_emergency_fund,
                'recommended_timeline_months': 12,
                'monthly_contribution': min(available_monthly * 0.3, target_emergency_fund / 12),
                'rationale': 'Emergency fund provides financial security and should be your top priority',
                'benefits': [
                    'Protection against unexpected expenses',
                    'Peace of mind and reduced financial stress',
                    'Avoid going into debt for emergencies'
                ]
            })
        
        # Debt payoff recommendation
        if 'debt_payoff' not in existing_goal_types and total_debt > 0:
            recommendations.append({
                'goal_type': 'debt_payoff',
                'priority': 'high',
                'name': 'Debt Freedom',
                'target_amount': total_debt,
                'recommended_timeline_months': min(36, max(12, total_debt / (available_monthly * 0.4))),
                'monthly_contribution': min(available_monthly * 0.4, total_debt / 24),
                'rationale': 'Eliminating debt frees up money for other financial goals',
                'benefits': [
                    'Save money on interest payments',
                    'Improve credit score',
                    'Increase available income for other goals'
                ]
            })
        
        # Retirement savings recommendation
        if 'retirement' not in existing_goal_types and available_monthly > 500:
            annual_retirement_target = monthly_income * 0.1 * 12  # 10% of annual income
            recommendations.append({
                'goal_type': 'retirement',
                'priority': 'high',
                'name': 'Retirement Savings',
                'target_amount': annual_retirement_target,
                'recommended_timeline_months': 12,
                'monthly_contribution': annual_retirement_target / 12,
                'rationale': 'Starting retirement savings early maximizes compound growth',
                'benefits': [
                    'Compound interest works in your favor',
                    'Tax advantages with retirement accounts',
                    'Financial independence in later years'
                ]
            })
        
        # Investment goal recommendation
        if 'investment' not in existing_goal_types and available_monthly > 300 and emergency_fund >= monthly_expenses * 3:
            investment_target = available_monthly * 0.2 * 12  # 20% of available income annually
            recommendations.append({
                'goal_type': 'investment',
                'priority': 'medium',
                'name': 'Investment Portfolio',
                'target_amount': investment_target,
                'recommended_timeline_months': 12,
                'monthly_contribution': investment_target / 12,
                'rationale': 'Investing helps your money grow faster than traditional savings',
                'benefits': [
                    'Potential for higher returns than savings accounts',
                    'Hedge against inflation',
                    'Build long-term wealth'
                ]
            })
        
        # Home purchase goal (if applicable)
        if 'home_purchase' not in existing_goal_types and monthly_income > 4000:
            home_price_estimate = monthly_income * 36  # 3x annual income rule
            down_payment = home_price_estimate * 0.2
            recommendations.append({
                'goal_type': 'home_purchase',
                'priority': 'medium',
                'name': 'Home Down Payment',
                'target_amount': down_payment,
                'recommended_timeline_months': max(24, down_payment / (available_monthly * 0.3)),
                'monthly_contribution': min(available_monthly * 0.3, down_payment / 36),
                'rationale': 'Homeownership builds equity and provides stability',
                'benefits': [
                    'Build equity instead of paying rent',
                    'Potential tax benefits',
                    'Stability and control over living situation'
                ]
            })
        
        return recommendations[:4]  # Return top 4 recommendations
    
    async def cleanup(self) -> None:
        """Cleanup service resources"""
        try:
            if self.db_manager:
                await self.db_manager.cleanup()
            
            if self.notification_manager:
                await self.notification_manager.cleanup()
            
            logger.info("Goal tracking service cleaned up")
            
        except Exception as e:
            logger.error(f"Cleanup error: {str(e)}")