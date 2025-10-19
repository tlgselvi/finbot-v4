"""
Budget Optimization Service
Provides intelligent budget planning and optimization
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import json
import os
from models.budget_optimizer import BudgetOptimizer, BudgetPlan, OptimizationGoal, BudgetAllocation
from utils.database import DatabaseManager
from services.goal_service import GoalTrackingService

# Mock notification manager for now
class NotificationManager:
    async def initialize(self):
        return True
    
    async def send_anomaly_alert(self, data):
        logger.info(f"Budget alert: {data.get('title', 'No title')}")
    
    async def cleanup(self):
        pass

logger = logging.getLogger(__name__)

class BudgetOptimizationService:
    """
    Service for budget optimization and management
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._get_default_config()
        self.budget_optimizer = BudgetOptimizer(self.config.get('optimizer_config'))
        self.db_manager = DatabaseManager()
        self.notification_manager = NotificationManager()
        self.goal_service = GoalTrackingService(config)
        self.is_initialized = False
        
    def _get_default_config(self) -> Dict:
        """Get default service configuration"""
        return {
            'database_url': os.getenv('DATABASE_URL', 'postgresql://localhost:5432/finbot'),
            'budget_settings': {
                'auto_optimization_interval_days': 30,
                'budget_alert_threshold': 0.9,  # Alert at 90% of budget
                'overspend_alert_threshold': 1.1,  # Alert at 110% of budget
                'performance_evaluation_days': 30
            },
            'notification_settings': {
                'enable_budget_alerts': True,
                'enable_overspend_alerts': True,
                'enable_optimization_suggestions': True
            }
        }
    
    async def initialize(self) -> bool:
        """Initialize the budget optimization service"""
        try:
            # Initialize database manager
            if self.db_manager:
                await self.db_manager.initialize(self.config['database_url'])
                await self._create_budget_tables()
            
            # Initialize notification manager
            await self.notification_manager.initialize()
            
            # Initialize goal service
            await self.goal_service.initialize()
            
            self.is_initialized = True
            logger.info("Budget optimization service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Budget service initialization error: {str(e)}")
            return False
    
    async def _create_budget_tables(self) -> None:
        """Create necessary database tables for budget optimization"""
        try:
            create_queries = [
                """
                CREATE TABLE IF NOT EXISTS budget_plans (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL,
                    total_income DECIMAL(12,2) NOT NULL,
                    total_allocated DECIMAL(12,2) NOT NULL,
                    savings_rate DECIMAL(5,4),
                    emergency_fund_allocation DECIMAL(12,2),
                    debt_payment_allocation DECIMAL(12,2),
                    optimization_goal VARCHAR(50),
                    risk_score DECIMAL(5,2),
                    confidence DECIMAL(3,2),
                    allocations JSONB NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    valid_until TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT NOW()
                );
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_budget_plans_user_id 
                ON budget_plans(user_id);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_budget_plans_active 
                ON budget_plans(is_active);
                """,
                """
                CREATE TABLE IF NOT EXISTS budget_performance (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    budget_plan_id UUID NOT NULL REFERENCES budget_plans(id),
                    user_id UUID NOT NULL,
                    evaluation_period_start DATE NOT NULL,
                    evaluation_period_end DATE NOT NULL,
                    overall_performance DECIMAL(3,2),
                    budget_adherence_score DECIMAL(3,2),
                    category_performance JSONB,
                    overspend_categories JSONB,
                    underspend_categories JSONB,
                    recommendations JSONB,
                    created_at TIMESTAMP DEFAULT NOW()
                );
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_budget_performance_user_id 
                ON budget_performance(user_id);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_budget_performance_period 
                ON budget_performance(evaluation_period_start, evaluation_period_end);
                """,
                """
                CREATE TABLE IF NOT EXISTS budget_alerts (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL,
                    budget_plan_id UUID REFERENCES budget_plans(id),
                    alert_type VARCHAR(50) NOT NULL,
                    category VARCHAR(100),
                    current_amount DECIMAL(12,2),
                    budget_amount DECIMAL(12,2),
                    threshold_percent DECIMAL(5,2),
                    message TEXT,
                    alert_sent BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT NOW()
                );
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_budget_alerts_user_id 
                ON budget_alerts(user_id);
                """
            ]
            
            for query in create_queries:
                await self.db_manager.execute_query(query)
            
            logger.info("Budget optimization tables created successfully")
            
        except Exception as e:
            logger.error(f"Error creating budget tables: {str(e)}")
            raise   
 
    async def optimize_user_budget(self, user_id: str,
                                 optimization_goal: str = "balance_lifestyle",
                                 constraints: Optional[Dict] = None) -> Dict:
        """
        Generate optimized budget plan for a user
        
        Args:
            user_id: User identifier
            optimization_goal: Optimization strategy
            constraints: Custom constraints
            
        Returns:
            Optimized budget plan
        """
        try:
            if not self.is_initialized:
                raise ValueError("Service not initialized")
            
            # Get user's financial data
            financial_data = await self._get_user_financial_data(user_id)
            
            if not financial_data:
                return {
                    'success': False,
                    'error': 'Insufficient financial data for budget optimization'
                }
            
            # Convert optimization goal
            try:
                goal_enum = OptimizationGoal(optimization_goal)
            except ValueError:
                goal_enum = OptimizationGoal.BALANCE_LIFESTYLE
            
            # Generate optimized budget
            budget_plan = self.budget_optimizer.optimize_budget(
                financial_data, goal_enum, constraints
            )
            
            # Store budget plan in database
            await self._store_budget_plan(budget_plan)
            
            # Deactivate previous budget plans
            await self._deactivate_previous_plans(user_id, budget_plan.created_at)
            
            # Format response
            result = {
                'success': True,
                'user_id': user_id,
                'budget_plan': {
                    'total_income': budget_plan.total_income,
                    'total_allocated': budget_plan.total_allocated,
                    'savings_rate': budget_plan.savings_rate,
                    'emergency_fund_allocation': budget_plan.emergency_fund_allocation,
                    'debt_payment_allocation': budget_plan.debt_payment_allocation,
                    'optimization_goal': budget_plan.optimization_goal.value,
                    'risk_score': budget_plan.risk_score,
                    'confidence': budget_plan.confidence,
                    'allocations': [
                        {
                            'category': alloc.category,
                            'subcategory': alloc.subcategory,
                            'current_amount': alloc.current_amount,
                            'recommended_amount': alloc.recommended_amount,
                            'min_amount': alloc.min_amount,
                            'max_amount': alloc.max_amount,
                            'category_type': alloc.category_type.value,
                            'priority': alloc.priority,
                            'justification': alloc.justification,
                            'optimization_potential': alloc.optimization_potential,
                            'confidence': alloc.confidence
                        }
                        for alloc in budget_plan.allocations
                    ],
                    'created_at': budget_plan.created_at.isoformat(),
                    'valid_until': budget_plan.valid_until.isoformat()
                }
            }
            
            logger.info(f"Budget optimization completed for user {user_id}")
            return result
            
        except Exception as e:
            logger.error(f"Budget optimization error for user {user_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'user_id': user_id
            }
    
    async def _get_user_financial_data(self, user_id: str) -> Optional[Dict]:
        """Get comprehensive financial data for budget optimization"""
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
            
            # Get recent transactions (last 3 months)
            transactions_query = """
            SELECT amount, category, description, timestamp, merchant_name
            FROM transactions 
            WHERE user_id = :user_id 
                AND timestamp >= NOW() - INTERVAL '3 months'
            ORDER BY timestamp DESC
            """
            
            transactions = await self.db_manager.execute_query(
                transactions_query, {'user_id': user_id}
            )
            
            # Get debt breakdown
            debt_query = """
            SELECT debt_type, balance
            FROM user_debts 
            WHERE user_id = :user_id AND balance > 0
            """
            
            debts = await self.db_manager.execute_query(
                debt_query, {'user_id': user_id}
            )
            
            debt_breakdown = {}
            for debt in debts:
                debt_breakdown[debt['debt_type']] = float(debt['balance'])
            
            # Get financial goals
            goals_query = """
            SELECT id, name, type, target_amount, current_amount, target_date
            FROM financial_goals 
            WHERE user_id = :user_id AND status = 'active'
            """
            
            goals = await self.db_manager.execute_query(
                goals_query, {'user_id': user_id}
            )
            
            # Compile financial data
            financial_data = {
                'user_id': user_id,
                'monthly_income': float(profile.get('monthly_income', 0)),
                'monthly_expenses': float(profile.get('monthly_expenses', 0)),
                'savings_balance': float(profile.get('savings_balance', 0)),
                'total_debt': float(profile.get('total_debt', 0)),
                'emergency_fund': float(profile.get('emergency_fund', 0)),
                'transactions': [
                    {
                        'amount': float(t['amount']),
                        'category': t['category'],
                        'description': t['description'],
                        'timestamp': t['timestamp'].isoformat() if t['timestamp'] else None,
                        'merchant_name': t['merchant_name']
                    }
                    for t in transactions
                ],
                'debt_breakdown': debt_breakdown,
                'financial_goals': [
                    {
                        'id': str(g['id']),
                        'name': g['name'],
                        'type': g['type'],
                        'target_amount': float(g['target_amount']),
                        'current_amount': float(g['current_amount']),
                        'target_date': g['target_date'].isoformat() if g['target_date'] else None
                    }
                    for g in goals
                ]
            }
            
            return financial_data
            
        except Exception as e:
            logger.error(f"Error getting financial data for user {user_id}: {str(e)}")
            return None
    
    async def _store_budget_plan(self, budget_plan: BudgetPlan) -> None:
        """Store budget plan in database"""
        try:
            # Convert allocations to JSON
            allocations_json = [
                {
                    'category': alloc.category,
                    'subcategory': alloc.subcategory,
                    'current_amount': alloc.current_amount,
                    'recommended_amount': alloc.recommended_amount,
                    'min_amount': alloc.min_amount,
                    'max_amount': alloc.max_amount,
                    'category_type': alloc.category_type.value,
                    'priority': alloc.priority,
                    'justification': alloc.justification,
                    'optimization_potential': alloc.optimization_potential,
                    'confidence': alloc.confidence
                }
                for alloc in budget_plan.allocations
            ]
            
            insert_query = """
            INSERT INTO budget_plans 
            (user_id, total_income, total_allocated, savings_rate, 
             emergency_fund_allocation, debt_payment_allocation, optimization_goal,
             risk_score, confidence, allocations, created_at, valid_until)
            VALUES 
            (:user_id, :total_income, :total_allocated, :savings_rate,
             :emergency_fund_allocation, :debt_payment_allocation, :optimization_goal,
             :risk_score, :confidence, :allocations, :created_at, :valid_until)
            """
            
            params = {
                'user_id': budget_plan.user_id,
                'total_income': budget_plan.total_income,
                'total_allocated': budget_plan.total_allocated,
                'savings_rate': budget_plan.savings_rate,
                'emergency_fund_allocation': budget_plan.emergency_fund_allocation,
                'debt_payment_allocation': budget_plan.debt_payment_allocation,
                'optimization_goal': budget_plan.optimization_goal.value,
                'risk_score': budget_plan.risk_score,
                'confidence': budget_plan.confidence,
                'allocations': json.dumps(allocations_json),
                'created_at': budget_plan.created_at,
                'valid_until': budget_plan.valid_until
            }
            
            await self.db_manager.execute_query(insert_query, params)
            
        except Exception as e:
            logger.error(f"Error storing budget plan: {str(e)}")
    
    async def _deactivate_previous_plans(self, user_id: str, current_date: datetime) -> None:
        """Deactivate previous budget plans for user"""
        try:
            update_query = """
            UPDATE budget_plans 
            SET is_active = FALSE, updated_at = :current_date
            WHERE user_id = :user_id 
                AND is_active = TRUE 
                AND created_at < :current_date
            """
            
            await self.db_manager.execute_query(
                update_query, 
                {'user_id': user_id, 'current_date': current_date}
            )
            
        except Exception as e:
            logger.error(f"Error deactivating previous plans: {str(e)}")
    
    async def get_user_budget(self, user_id: str) -> Dict:
        """
        Get current active budget plan for a user
        
        Args:
            user_id: User identifier
            
        Returns:
            Current budget plan
        """
        try:
            query = """
            SELECT * FROM budget_plans 
            WHERE user_id = :user_id 
                AND is_active = TRUE 
                AND (valid_until IS NULL OR valid_until > NOW())
            ORDER BY created_at DESC 
            LIMIT 1
            """
            
            result = await self.db_manager.execute_query(
                query, {'user_id': user_id}
            )
            
            if not result:
                return {
                    'success': False,
                    'error': 'No active budget plan found'
                }
            
            budget_data = result[0]
            allocations = json.loads(budget_data['allocations'])
            
            return {
                'success': True,
                'user_id': user_id,
                'budget_plan': {
                    'id': str(budget_data['id']),
                    'total_income': float(budget_data['total_income']),
                    'total_allocated': float(budget_data['total_allocated']),
                    'savings_rate': float(budget_data['savings_rate'] or 0),
                    'emergency_fund_allocation': float(budget_data['emergency_fund_allocation'] or 0),
                    'debt_payment_allocation': float(budget_data['debt_payment_allocation'] or 0),
                    'optimization_goal': budget_data['optimization_goal'],
                    'risk_score': float(budget_data['risk_score'] or 0),
                    'confidence': float(budget_data['confidence'] or 0),
                    'allocations': allocations,
                    'created_at': budget_data['created_at'].isoformat(),
                    'valid_until': budget_data['valid_until'].isoformat() if budget_data['valid_until'] else None
                }
            }
            
        except Exception as e:
            logger.error(f"Error getting user budget: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def evaluate_budget_performance(self, user_id: str, 
                                        period_days: int = 30) -> Dict:
        """
        Evaluate budget performance for a user
        
        Args:
            user_id: User identifier
            period_days: Evaluation period in days
            
        Returns:
            Budget performance evaluation
        """
        try:
            # Get current budget plan
            budget_result = await self.get_user_budget(user_id)
            
            if not budget_result.get('success'):
                return budget_result
            
            budget_plan_data = budget_result['budget_plan']
            
            # Get actual spending for the period
            end_date = datetime.now().date()
            start_date = end_date - timedelta(days=period_days)
            
            spending_query = """
            SELECT category, SUM(ABS(amount)) as total_amount
            FROM transactions 
            WHERE user_id = :user_id 
                AND DATE(timestamp) BETWEEN :start_date AND :end_date
                AND amount < 0
            GROUP BY category
            """
            
            spending_result = await self.db_manager.execute_query(
                spending_query, {
                    'user_id': user_id,
                    'start_date': start_date,
                    'end_date': end_date
                }
            )
            
            actual_spending = {}
            for row in spending_result:
                actual_spending[row['category']] = float(row['total_amount'])
            
            # Reconstruct budget plan object for evaluation
            allocations = []
            for alloc_data in budget_plan_data['allocations']:
                allocation = BudgetAllocation(
                    category=alloc_data['category'],
                    subcategory=alloc_data.get('subcategory'),
                    current_amount=alloc_data['current_amount'],
                    recommended_amount=alloc_data['recommended_amount'],
                    min_amount=alloc_data['min_amount'],
                    max_amount=alloc_data['max_amount'],
                    category_type=alloc_data['category_type'],
                    priority=alloc_data['priority'],
                    justification=alloc_data['justification'],
                    optimization_potential=alloc_data['optimization_potential'],
                    confidence=alloc_data['confidence']
                )
                allocations.append(allocation)
            
            budget_plan = BudgetPlan(
                user_id=user_id,
                total_income=budget_plan_data['total_income'],
                total_allocated=budget_plan_data['total_allocated'],
                allocations=allocations,
                savings_rate=budget_plan_data['savings_rate'],
                emergency_fund_allocation=budget_plan_data['emergency_fund_allocation'],
                debt_payment_allocation=budget_plan_data['debt_payment_allocation'],
                optimization_goal=OptimizationGoal(budget_plan_data['optimization_goal']),
                risk_score=budget_plan_data['risk_score'],
                confidence=budget_plan_data['confidence'],
                created_at=datetime.fromisoformat(budget_plan_data['created_at']),
                valid_until=datetime.fromisoformat(budget_plan_data['valid_until']) if budget_plan_data['valid_until'] else datetime.now() + timedelta(days=30)
            )
            
            # Evaluate performance
            performance_results = self.budget_optimizer.evaluate_budget_performance(
                budget_plan, actual_spending, period_days
            )
            
            # Store performance results
            await self._store_performance_results(
                budget_plan_data['id'], user_id, start_date, end_date, performance_results
            )
            
            # Check for alerts
            await self._check_budget_alerts(user_id, budget_plan, actual_spending)
            
            return {
                'success': True,
                'user_id': user_id,
                'evaluation_period': {
                    'start_date': start_date.isoformat(),
                    'end_date': end_date.isoformat(),
                    'days': period_days
                },
                'performance': performance_results
            }
            
        except Exception as e:
            logger.error(f"Budget performance evaluation error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _store_performance_results(self, budget_plan_id: str, user_id: str,
                                       start_date: datetime.date, end_date: datetime.date,
                                       performance_results: Dict) -> None:
        """Store budget performance results"""
        try:
            insert_query = """
            INSERT INTO budget_performance 
            (budget_plan_id, user_id, evaluation_period_start, evaluation_period_end,
             overall_performance, budget_adherence_score, category_performance,
             overspend_categories, underspend_categories, recommendations)
            VALUES 
            (:budget_plan_id, :user_id, :start_date, :end_date,
             :overall_performance, :budget_adherence_score, :category_performance,
             :overspend_categories, :underspend_categories, :recommendations)
            """
            
            params = {
                'budget_plan_id': budget_plan_id,
                'user_id': user_id,
                'start_date': start_date,
                'end_date': end_date,
                'overall_performance': performance_results.get('overall_performance', 0),
                'budget_adherence_score': performance_results.get('budget_adherence_score', 0),
                'category_performance': json.dumps(performance_results.get('category_performance', {})),
                'overspend_categories': json.dumps(performance_results.get('overspend_categories', [])),
                'underspend_categories': json.dumps(performance_results.get('underspend_categories', [])),
                'recommendations': json.dumps(performance_results.get('recommendations', []))
            }
            
            await self.db_manager.execute_query(insert_query, params)
            
        except Exception as e:
            logger.error(f"Error storing performance results: {str(e)}")
    
    async def _check_budget_alerts(self, user_id: str, budget_plan: BudgetPlan,
                                 actual_spending: Dict) -> None:
        """Check for budget alerts and send notifications"""
        try:
            alerts_to_send = []
            
            # Check each category for overspending
            for allocation in budget_plan.allocations:
                category = allocation.category
                budgeted = allocation.recommended_amount
                actual = actual_spending.get(category, 0)
                
                if budgeted > 0:
                    usage_percent = actual / budgeted
                    
                    # Budget warning alert (90% threshold)
                    if usage_percent >= self.config['budget_settings']['budget_alert_threshold']:
                        alerts_to_send.append({
                            'type': 'budget_warning',
                            'category': category,
                            'current_amount': actual,
                            'budget_amount': budgeted,
                            'usage_percent': usage_percent * 100,
                            'message': f"You've used {usage_percent:.0%} of your {category} budget (${actual:.2f} of ${budgeted:.2f})"
                        })
                    
                    # Overspend alert (110% threshold)
                    elif usage_percent >= self.config['budget_settings']['overspend_alert_threshold']:
                        overspend_amount = actual - budgeted
                        alerts_to_send.append({
                            'type': 'overspend_alert',
                            'category': category,
                            'current_amount': actual,
                            'budget_amount': budgeted,
                            'overspend_amount': overspend_amount,
                            'message': f"You've exceeded your {category} budget by ${overspend_amount:.2f}"
                        })
            
            # Send alerts
            for alert in alerts_to_send:
                await self._send_budget_alert(user_id, alert, budget_plan)
            
        except Exception as e:
            logger.error(f"Error checking budget alerts: {str(e)}")
    
    async def _send_budget_alert(self, user_id: str, alert: Dict, budget_plan: BudgetPlan) -> None:
        """Send budget alert notification"""
        try:
            alert_data = {
                'user_id': user_id,
                'alert_type': 'budget_alert',
                'alert_level': 'high' if alert['type'] == 'overspend_alert' else 'medium',
                'title': f"💰 Budget Alert: {alert['category']}",
                'message': alert['message'],
                'category': alert['category'],
                'budget_amount': alert['budget_amount'],
                'current_amount': alert['current_amount'],
                'timestamp': datetime.now().isoformat()
            }
            
            # Add specific recommendations based on alert type
            if alert['type'] == 'overspend_alert':
                alert_data['recommendations'] = [
                    f"Review recent {alert['category']} expenses",
                    f"Consider reducing {alert['category']} spending for the rest of the month",
                    "Look for alternative options to stay within budget"
                ]
            else:
                alert_data['recommendations'] = [
                    f"Monitor {alert['category']} spending closely",
                    "Consider if any upcoming expenses can be postponed",
                    "Review if this category needs budget adjustment"
                ]
            
            await self.notification_manager.send_anomaly_alert(alert_data)
            
            # Store alert record
            await self._store_budget_alert(user_id, alert, budget_plan)
            
            logger.info(f"Budget alert sent to user {user_id}: {alert['type']} for {alert['category']}")
            
        except Exception as e:
            logger.error(f"Error sending budget alert: {str(e)}")
    
    async def _store_budget_alert(self, user_id: str, alert: Dict, budget_plan: BudgetPlan) -> None:
        """Store budget alert in database"""
        try:
            insert_query = """
            INSERT INTO budget_alerts 
            (user_id, alert_type, category, current_amount, budget_amount, 
             threshold_percent, message, alert_sent)
            VALUES 
            (:user_id, :alert_type, :category, :current_amount, :budget_amount,
             :threshold_percent, :message, :alert_sent)
            """
            
            params = {
                'user_id': user_id,
                'alert_type': alert['type'],
                'category': alert['category'],
                'current_amount': alert['current_amount'],
                'budget_amount': alert['budget_amount'],
                'threshold_percent': alert.get('usage_percent', 0),
                'message': alert['message'],
                'alert_sent': True
            }
            
            await self.db_manager.execute_query(insert_query, params)
            
        except Exception as e:
            logger.error(f"Error storing budget alert: {str(e)}")
    
    async def suggest_budget_adjustments(self, user_id: str) -> Dict:
        """
        Suggest budget adjustments based on recent performance
        
        Args:
            user_id: User identifier
            
        Returns:
            Suggested budget adjustments
        """
        try:
            # Get recent performance evaluation
            performance_result = await self.evaluate_budget_performance(user_id)
            
            if not performance_result.get('success'):
                return performance_result
            
            # Get current budget
            budget_result = await self.get_user_budget(user_id)
            
            if not budget_result.get('success'):
                return budget_result
            
            # Generate adjusted budget plan
            # This would use the budget optimizer's suggest_budget_adjustments method
            # For now, return the performance-based recommendations
            
            return {
                'success': True,
                'user_id': user_id,
                'current_performance': performance_result['performance'],
                'adjustment_recommendations': performance_result['performance'].get('recommendations', []),
                'suggested_changes': self._generate_adjustment_suggestions(
                    performance_result['performance']
                )
            }
            
        except Exception as e:
            logger.error(f"Budget adjustment suggestion error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def _generate_adjustment_suggestions(self, performance_data: Dict) -> List[Dict]:
        """Generate specific budget adjustment suggestions"""
        suggestions = []
        
        # Overspending adjustments
        for overspend in performance_data.get('overspend_categories', []):
            category = overspend['category']
            overspend_percent = overspend['overspend_percent']
            
            if overspend_percent > 20:
                suggestions.append({
                    'type': 'increase_budget',
                    'category': category,
                    'current_variance': overspend_percent,
                    'suggested_increase_percent': min(overspend_percent * 0.5, 25),
                    'rationale': f"Consistent overspending in {category} suggests budget is too restrictive"
                })
        
        # Underspending adjustments
        for underspend in performance_data.get('underspend_categories', []):
            category = underspend['category']
            underspend_percent = underspend['underspend_percent']
            
            if underspend_percent > 15:
                suggestions.append({
                    'type': 'decrease_budget',
                    'category': category,
                    'current_variance': -underspend_percent,
                    'suggested_decrease_percent': min(underspend_percent * 0.3, 15),
                    'rationale': f"Consistent underspending in {category} allows for budget reallocation"
                })
        
        return suggestions
    
    async def cleanup(self) -> None:
        """Cleanup service resources"""
        try:
            if self.db_manager:
                await self.db_manager.cleanup()
            
            if self.notification_manager:
                await self.notification_manager.cleanup()
            
            logger.info("Budget optimization service cleaned up")
            
        except Exception as e:
            logger.error(f"Cleanup error: {str(e)}")
    
    async def optimize_budget_with_goals(self, user_id: str,
                                       optimization_goal: str = "balance_lifestyle",
                                       constraints: Optional[Dict] = None) -> Dict:
        """
        Generate optimized budget plan considering user's financial goals
        
        Args:
            user_id: User identifier
            optimization_goal: Optimization strategy
            constraints: Custom constraints
            
        Returns:
            Goal-aware optimized budget plan
        """
        try:
            if not self.is_initialized:
                raise ValueError("Service not initialized")
            
            # Get user's financial goals
            goals_result = await self.goal_service.get_user_goals(user_id, include_completed=False)
            
            if not goals_result.get('success'):
                # Fallback to regular budget optimization
                return await self.optimize_user_budget(user_id, optimization_goal, constraints)
            
            user_goals = goals_result.get('goals', [])
            
            # Calculate total monthly goal contributions needed
            total_goal_contributions = sum(
                goal.get('monthly_contribution', 0) for goal in user_goals 
                if goal.get('auto_contribute', False)
            )
            
            # Get regular budget optimization
            budget_result = await self.optimize_user_budget(user_id, optimization_goal, constraints)
            
            if not budget_result.get('success'):
                return budget_result
            
            # Enhance budget with goal considerations
            enhanced_budget = budget_result['budget_plan'].copy()
            
            # Add goal-specific allocations
            goal_allocations = []
            for goal in user_goals:
                if goal.get('auto_contribute', False) and goal.get('monthly_contribution', 0) > 0:
                    goal_allocations.append({
                        'category': f"Goal: {goal['name']}",
                        'subcategory': goal['goal_type'],
                        'current_amount': 0,
                        'recommended_amount': goal['monthly_contribution'],
                        'min_amount': goal['monthly_contribution'] * 0.5,
                        'max_amount': goal['monthly_contribution'] * 1.5,
                        'category_type': 'savings',
                        'priority': self._map_goal_priority_to_budget_priority(goal.get('priority', 'medium')),
                        'justification': f"Automatic contribution toward {goal['name']} goal",
                        'optimization_potential': 0.1,
                        'confidence': 0.9,
                        'goal_id': goal['id'],
                        'goal_progress': goal.get('progress_percent', 0)
                    })
            
            # Add goal allocations to budget
            enhanced_budget['allocations'].extend(goal_allocations)
            enhanced_budget['total_allocated'] += total_goal_contributions
            
            # Recalculate savings rate
            if enhanced_budget['total_income'] > 0:
                enhanced_budget['savings_rate'] = (
                    enhanced_budget.get('emergency_fund_allocation', 0) + 
                    total_goal_contributions
                ) / enhanced_budget['total_income']
            
            # Add goal insights
            goal_insights = await self._generate_goal_budget_insights(user_goals, enhanced_budget)
            
            result = budget_result.copy()
            result['budget_plan'] = enhanced_budget
            result['goal_integration'] = {
                'active_goals': len(user_goals),
                'total_goal_contributions': total_goal_contributions,
                'goal_allocations': goal_allocations,
                'goal_insights': goal_insights
            }
            
            logger.info(f"Goal-aware budget optimization completed for user {user_id}")
            return result
            
        except Exception as e:
            logger.error(f"Goal-aware budget optimization error for user {user_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'user_id': user_id
            }
    
    def _map_goal_priority_to_budget_priority(self, goal_priority: str) -> int:
        """Map goal priority to budget allocation priority"""
        priority_mapping = {
            'critical': 1,
            'high': 2,
            'medium': 3,
            'low': 4
        }
        return priority_mapping.get(goal_priority, 3)
    
    async def _generate_goal_budget_insights(self, goals: List[Dict], budget: Dict) -> List[str]:
        """Generate insights about goal integration with budget"""
        insights = []
        
        try:
            total_income = budget.get('total_income', 0)
            total_goal_contributions = sum(
                goal.get('monthly_contribution', 0) for goal in goals 
                if goal.get('auto_contribute', False)
            )
            
            if total_income > 0:
                goal_percentage = (total_goal_contributions / total_income) * 100
                
                if goal_percentage > 30:
                    insights.append(f"⚠️ Goal contributions ({goal_percentage:.1f}% of income) may be too aggressive")
                elif goal_percentage > 20:
                    insights.append(f"💪 Strong goal commitment: {goal_percentage:.1f}% of income toward goals")
                elif goal_percentage > 10:
                    insights.append(f"✅ Balanced approach: {goal_percentage:.1f}% of income toward goals")
                else:
                    insights.append(f"📈 Consider increasing goal contributions from {goal_percentage:.1f}%")
            
            # Goal-specific insights
            high_priority_goals = [g for g in goals if g.get('priority') in ['critical', 'high']]
            if len(high_priority_goals) > 3:
                insights.append("🎯 Consider focusing on fewer high-priority goals for better success")
            
            # Progress insights
            behind_goals = [g for g in goals if g.get('progress_percent', 0) < 25 and 
                          (datetime.now() - datetime.fromisoformat(g['created_at'])).days > 90]
            if behind_goals:
                insights.append(f"⏰ {len(behind_goals)} goals may need increased contributions or timeline adjustment")
            
            return insights
            
        except Exception as e:
            logger.error(f"Goal budget insights error: {str(e)}")
            return []