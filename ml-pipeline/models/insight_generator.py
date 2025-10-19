"""
Insight Generation Engine
Generates intelligent financial insights and recommendations
"""

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
import logging
from typing import Dict, List, Tuple, Optional, Any
from datetime import datetime, timedelta
import json
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class InsightType(Enum):
    """Types of financial insights"""
    SPENDING_PATTERN = "spending_pattern"
    BUDGET_OPTIMIZATION = "budget_optimization"
    SAVINGS_OPPORTUNITY = "savings_opportunity"
    RISK_ALERT = "risk_alert"
    GOAL_PROGRESS = "goal_progress"
    ANOMALY_DETECTION = "anomaly_detection"
    TREND_ANALYSIS = "trend_analysis"
    COMPARISON = "comparison"

class InsightPriority(Enum):
    """Priority levels for insights"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

@dataclass
class FinancialInsight:
    """Individual financial insight"""
    id: str
    type: InsightType
    title: str
    description: str
    priority: InsightPriority
    confidence: float  # 0-1
    impact_score: float  # 0-100
    actionable: bool
    recommendations: List[str]
    data_points: Dict[str, Any]
    timestamp: datetime
    valid_until: Optional[datetime] = None
    category: Optional[str] = None
    tags: List[str] = None

class InsightGenerator:
    """
    Intelligent financial insight generation system
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._get_default_config()
        self.is_initialized = False
        
    def _get_default_config(self) -> Dict:
        """Get default configuration"""
        return {
            'insight_settings': {
                'min_confidence_threshold': 0.6,
                'max_insights_per_category': 5,
                'insight_validity_days': 7,
                'trend_analysis_days': 90,
                'comparison_periods': [30, 90, 365]
            },
            'thresholds': {
                'spending_increase_alert': 0.20,  # 20% increase
                'savings_opportunity_min': 50.0,  # $50 minimum
                'budget_variance_alert': 0.15,   # 15% over budget
                'trend_significance': 0.10       # 10% trend change
            }
        }
    
    def generate_insights(self, financial_data: Dict, 
                         user_preferences: Optional[Dict] = None) -> List[FinancialInsight]:
        """
        Generate comprehensive financial insights
        
        Args:
            financial_data: User's financial data
            user_preferences: User preferences for insights
            
        Returns:
            List of generated insights
        """
        try:
            insights = []
            
            # Generate different types of insights
            insights.extend(self._generate_spending_insights(financial_data))
            insights.extend(self._generate_budget_insights(financial_data))
            insights.extend(self._generate_savings_insights(financial_data))
            insights.extend(self._generate_trend_insights(financial_data))
            insights.extend(self._generate_comparison_insights(financial_data))
            insights.extend(self._generate_goal_insights(financial_data))
            
            # Filter and rank insights
            insights = self._filter_insights(insights, user_preferences)
            insights = self._rank_insights(insights)
            
            logger.info(f"Generated {len(insights)} financial insights")
            return insights
            
        except Exception as e:
            logger.error(f"Insight generation error: {str(e)}")
            return [] 
   
    def _generate_spending_insights(self, financial_data: Dict) -> List[FinancialInsight]:
        """Generate spending pattern insights"""
        insights = []
        transactions = financial_data.get('transactions', [])
        
        if not transactions:
            return insights
        
        df = pd.DataFrame(transactions)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df['amount'] = df['amount'].abs()
        
        # Category spending analysis
        category_spending = df.groupby('category')['amount'].agg(['sum', 'count', 'mean']).reset_index()
        category_spending = category_spending.sort_values('sum', ascending=False)
        
        # Top spending categories
        if len(category_spending) > 0:
            top_category = category_spending.iloc[0]
            total_spending = category_spending['sum'].sum()
            category_percentage = (top_category['sum'] / total_spending) * 100
            
            if category_percentage > 30:  # More than 30% in one category
                insights.append(FinancialInsight(
                    id=f"spending_concentration_{datetime.now().timestamp()}",
                    type=InsightType.SPENDING_PATTERN,
                    title=f"High Concentration in {top_category['category']}",
                    description=f"You're spending {category_percentage:.1f}% of your budget on {top_category['category']} (${top_category['sum']:.2f})",
                    priority=InsightPriority.MEDIUM,
                    confidence=0.9,
                    impact_score=60,
                    actionable=True,
                    recommendations=[
                        f"Review your {top_category['category']} expenses for optimization opportunities",
                        "Consider setting a specific budget limit for this category",
                        "Look for alternatives or ways to reduce costs in this area"
                    ],
                    data_points={
                        'category': top_category['category'],
                        'amount': float(top_category['sum']),
                        'percentage': category_percentage,
                        'transaction_count': int(top_category['count'])
                    },
                    timestamp=datetime.now(),
                    valid_until=datetime.now() + timedelta(days=7),
                    category='spending',
                    tags=['category_analysis', 'budget_concentration']
                ))
        
        # Unusual spending patterns
        monthly_spending = df.groupby(df['timestamp'].dt.to_period('M'))['amount'].sum()
        if len(monthly_spending) >= 2:
            recent_month = monthly_spending.iloc[-1]
            previous_month = monthly_spending.iloc[-2]
            change_percent = ((recent_month - previous_month) / previous_month) * 100
            
            if abs(change_percent) > 20:  # 20% change
                direction = "increased" if change_percent > 0 else "decreased"
                priority = InsightPriority.HIGH if change_percent > 0 else InsightPriority.MEDIUM
                
                insights.append(FinancialInsight(
                    id=f"spending_change_{datetime.now().timestamp()}",
                    type=InsightType.SPENDING_PATTERN,
                    title=f"Spending {direction.title()} by {abs(change_percent):.1f}%",
                    description=f"Your spending {direction} from ${previous_month:.2f} to ${recent_month:.2f} this month",
                    priority=priority,
                    confidence=0.85,
                    impact_score=70 if change_percent > 0 else 40,
                    actionable=True,
                    recommendations=[
                        f"Review what caused the spending {direction.lower()}",
                        "Analyze category-wise changes to identify the main drivers",
                        "Adjust your budget if this represents a permanent change"
                    ],
                    data_points={
                        'previous_amount': float(previous_month),
                        'current_amount': float(recent_month),
                        'change_percent': change_percent,
                        'change_amount': float(recent_month - previous_month)
                    },
                    timestamp=datetime.now(),
                    category='spending',
                    tags=['monthly_comparison', 'spending_trend']
                ))
        
        return insights
    
    def _generate_budget_insights(self, financial_data: Dict) -> List[FinancialInsight]:
        """Generate budget-related insights"""
        insights = []
        
        monthly_income = financial_data.get('monthly_income', 0)
        monthly_expenses = financial_data.get('monthly_expenses', 0)
        budget_data = financial_data.get('budget', {})
        
        if not budget_data:
            return insights
        
        # Budget vs actual analysis
        for category, budget_amount in budget_data.items():
            actual_spending = self._get_category_spending(financial_data, category)
            
            if actual_spending > budget_amount * 1.1:  # 10% over budget
                over_amount = actual_spending - budget_amount
                over_percent = (over_amount / budget_amount) * 100
                
                insights.append(FinancialInsight(
                    id=f"budget_overrun_{category}_{datetime.now().timestamp()}",
                    type=InsightType.BUDGET_OPTIMIZATION,
                    title=f"Over Budget in {category}",
                    description=f"You've exceeded your {category} budget by ${over_amount:.2f} ({over_percent:.1f}%)",
                    priority=InsightPriority.HIGH,
                    confidence=0.95,
                    impact_score=80,
                    actionable=True,
                    recommendations=[
                        f"Review recent {category} expenses to identify overspending causes",
                        f"Consider increasing your {category} budget if this is a permanent change",
                        f"Look for ways to reduce {category} expenses for the rest of the month"
                    ],
                    data_points={
                        'category': category,
                        'budget_amount': budget_amount,
                        'actual_amount': actual_spending,
                        'over_amount': over_amount,
                        'over_percent': over_percent
                    },
                    timestamp=datetime.now(),
                    category='budget',
                    tags=['budget_variance', 'overspending']
                ))
        
        # Overall budget health
        total_budget = sum(budget_data.values())
        budget_utilization = (monthly_expenses / total_budget) * 100 if total_budget > 0 else 0
        
        if budget_utilization > 90:
            insights.append(FinancialInsight(
                id=f"budget_utilization_{datetime.now().timestamp()}",
                type=InsightType.BUDGET_OPTIMIZATION,
                title="High Budget Utilization",
                description=f"You've used {budget_utilization:.1f}% of your total budget",
                priority=InsightPriority.MEDIUM,
                confidence=0.9,
                impact_score=60,
                actionable=True,
                recommendations=[
                    "Monitor remaining budget categories closely",
                    "Consider reducing discretionary spending",
                    "Review if budget allocations need adjustment"
                ],
                data_points={
                    'utilization_percent': budget_utilization,
                    'total_budget': total_budget,
                    'total_spent': monthly_expenses
                },
                timestamp=datetime.now(),
                category='budget',
                tags=['budget_health', 'utilization']
            ))
        
        return insights
    
    def _generate_savings_insights(self, financial_data: Dict) -> List[FinancialInsight]:
        """Generate savings opportunity insights"""
        insights = []
        
        monthly_income = financial_data.get('monthly_income', 0)
        monthly_expenses = financial_data.get('monthly_expenses', 0)
        savings_rate = financial_data.get('savings_rate', 0)
        
        # Savings rate analysis
        if monthly_income > 0:
            current_savings = monthly_income - monthly_expenses
            current_savings_rate = (current_savings / monthly_income) * 100
            
            if current_savings_rate < 10:  # Less than 10% savings rate
                target_savings = monthly_income * 0.20  # 20% target
                additional_savings_needed = target_savings - current_savings
                
                insights.append(FinancialInsight(
                    id=f"savings_rate_{datetime.now().timestamp()}",
                    type=InsightType.SAVINGS_OPPORTUNITY,
                    title="Low Savings Rate Detected",
                    description=f"Your current savings rate is {current_savings_rate:.1f}%. Aim for 20% to build wealth faster.",
                    priority=InsightPriority.HIGH,
                    confidence=0.9,
                    impact_score=85,
                    actionable=True,
                    recommendations=[
                        f"Try to save an additional ${additional_savings_needed:.2f} per month",
                        "Review discretionary expenses for reduction opportunities",
                        "Consider automating savings to make it easier",
                        "Look into high-yield savings accounts for better returns"
                    ],
                    data_points={
                        'current_savings_rate': current_savings_rate,
                        'target_savings_rate': 20.0,
                        'current_savings': current_savings,
                        'additional_needed': additional_savings_needed
                    },
                    timestamp=datetime.now(),
                    category='savings',
                    tags=['savings_rate', 'wealth_building']
                ))
        
        # Subscription optimization
        transactions = financial_data.get('transactions', [])
        subscription_savings = self._identify_subscription_opportunities(transactions)
        
        if subscription_savings > 50:  # More than $50 potential savings
            insights.append(FinancialInsight(
                id=f"subscription_savings_{datetime.now().timestamp()}",
                type=InsightType.SAVINGS_OPPORTUNITY,
                title="Subscription Optimization Opportunity",
                description=f"You could save up to ${subscription_savings:.2f}/month by optimizing subscriptions",
                priority=InsightPriority.MEDIUM,
                confidence=0.75,
                impact_score=60,
                actionable=True,
                recommendations=[
                    "Review all active subscriptions and cancel unused ones",
                    "Look for annual payment discounts on subscriptions you keep",
                    "Consider sharing family plans where possible",
                    "Evaluate if you're getting value from premium tiers"
                ],
                data_points={
                    'potential_savings': subscription_savings,
                    'annual_savings': subscription_savings * 12
                },
                timestamp=datetime.now(),
                category='savings',
                tags=['subscriptions', 'recurring_expenses']
            ))
        
        return insights    

    def _generate_trend_insights(self, financial_data: Dict) -> List[FinancialInsight]:
        """Generate trend analysis insights"""
        insights = []
        transactions = financial_data.get('transactions', [])
        
        if not transactions:
            return insights
        
        df = pd.DataFrame(transactions)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df['amount'] = df['amount'].abs()
        
        # Monthly trend analysis
        monthly_data = df.groupby(df['timestamp'].dt.to_period('M'))['amount'].sum()
        
        if len(monthly_data) >= 3:
            # Calculate trend using linear regression
            x = np.arange(len(monthly_data))
            y = monthly_data.values
            
            # Simple linear regression
            n = len(x)
            slope = (n * np.sum(x * y) - np.sum(x) * np.sum(y)) / (n * np.sum(x**2) - np.sum(x)**2)
            
            # Determine trend significance
            trend_percent = (slope / np.mean(y)) * 100 if np.mean(y) > 0 else 0
            
            if abs(trend_percent) > 5:  # 5% monthly trend
                direction = "increasing" if trend_percent > 0 else "decreasing"
                priority = InsightPriority.HIGH if trend_percent > 0 else InsightPriority.MEDIUM
                
                insights.append(FinancialInsight(
                    id=f"spending_trend_{datetime.now().timestamp()}",
                    type=InsightType.TREND_ANALYSIS,
                    title=f"Spending Trend: {direction.title()}",
                    description=f"Your spending has been {direction} by {abs(trend_percent):.1f}% per month over the last {len(monthly_data)} months",
                    priority=priority,
                    confidence=0.8,
                    impact_score=70 if trend_percent > 0 else 50,
                    actionable=True,
                    recommendations=[
                        f"Monitor this {direction} trend closely",
                        "Identify the main categories driving this trend",
                        "Adjust your budget planning accordingly" if trend_percent > 0 else "Consider if this reduction is sustainable"
                    ],
                    data_points={
                        'trend_percent_monthly': trend_percent,
                        'trend_direction': direction,
                        'months_analyzed': len(monthly_data),
                        'recent_amount': float(monthly_data.iloc[-1]),
                        'oldest_amount': float(monthly_data.iloc[0])
                    },
                    timestamp=datetime.now(),
                    category='trends',
                    tags=['monthly_trend', 'spending_pattern']
                ))
        
        # Category trend analysis
        for category in df['category'].unique():
            category_data = df[df['category'] == category]
            category_monthly = category_data.groupby(category_data['timestamp'].dt.to_period('M'))['amount'].sum()
            
            if len(category_monthly) >= 3:
                x = np.arange(len(category_monthly))
                y = category_monthly.values
                
                n = len(x)
                slope = (n * np.sum(x * y) - np.sum(x) * np.sum(y)) / (n * np.sum(x**2) - np.sum(x)**2)
                trend_percent = (slope / np.mean(y)) * 100 if np.mean(y) > 0 else 0
                
                if abs(trend_percent) > 10:  # 10% category trend
                    direction = "increasing" if trend_percent > 0 else "decreasing"
                    
                    insights.append(FinancialInsight(
                        id=f"category_trend_{category}_{datetime.now().timestamp()}",
                        type=InsightType.TREND_ANALYSIS,
                        title=f"{category} Spending {direction.title()}",
                        description=f"Your {category} spending has been {direction} by {abs(trend_percent):.1f}% per month",
                        priority=InsightPriority.MEDIUM,
                        confidence=0.75,
                        impact_score=60,
                        actionable=True,
                        recommendations=[
                            f"Review what's driving the {direction} trend in {category}",
                            f"Consider if this {category} trend aligns with your priorities",
                            f"Adjust your {category} budget if needed"
                        ],
                        data_points={
                            'category': category,
                            'trend_percent_monthly': trend_percent,
                            'trend_direction': direction,
                            'recent_amount': float(category_monthly.iloc[-1]),
                            'oldest_amount': float(category_monthly.iloc[0])
                        },
                        timestamp=datetime.now(),
                        category='trends',
                        tags=['category_trend', category.lower()]
                    ))
        
        return insights
    
    def _generate_comparison_insights(self, financial_data: Dict) -> List[FinancialInsight]:
        """Generate comparison insights"""
        insights = []
        
        # Peer comparison (if available)
        peer_data = financial_data.get('peer_comparison', {})
        if peer_data:
            user_spending = financial_data.get('monthly_expenses', 0)
            peer_average = peer_data.get('average_spending', 0)
            
            if peer_average > 0:
                difference_percent = ((user_spending - peer_average) / peer_average) * 100
                
                if abs(difference_percent) > 15:  # 15% difference from peers
                    comparison = "higher" if difference_percent > 0 else "lower"
                    priority = InsightPriority.MEDIUM
                    
                    insights.append(FinancialInsight(
                        id=f"peer_comparison_{datetime.now().timestamp()}",
                        type=InsightType.COMPARISON,
                        title=f"Spending {comparison.title()} Than Peers",
                        description=f"Your spending is {abs(difference_percent):.1f}% {comparison} than similar users (${user_spending:.2f} vs ${peer_average:.2f})",
                        priority=priority,
                        confidence=0.7,
                        impact_score=50,
                        actionable=True,
                        recommendations=[
                            f"Your spending is {comparison} than peers in your demographic",
                            "Consider if this aligns with your financial goals",
                            "Review category-wise spending for optimization opportunities" if difference_percent > 0 else "Great job keeping expenses controlled!"
                        ],
                        data_points={
                            'user_spending': user_spending,
                            'peer_average': peer_average,
                            'difference_percent': difference_percent,
                            'comparison': comparison
                        },
                        timestamp=datetime.now(),
                        category='comparison',
                        tags=['peer_comparison', 'benchmarking']
                    ))
        
        # Year-over-year comparison
        transactions = financial_data.get('transactions', [])
        if transactions:
            yoy_insight = self._generate_yoy_comparison(transactions)
            if yoy_insight:
                insights.append(yoy_insight)
        
        return insights
    
    def _generate_goal_insights(self, financial_data: Dict) -> List[FinancialInsight]:
        """Generate goal progress insights"""
        insights = []
        goals = financial_data.get('financial_goals', [])
        
        for goal in goals:
            goal_type = goal.get('type', 'savings')
            target_amount = goal.get('target_amount', 0)
            current_amount = goal.get('current_amount', 0)
            target_date = goal.get('target_date')
            
            if target_date:
                target_date = pd.to_datetime(target_date)
                days_remaining = (target_date - datetime.now()).days
                
                if days_remaining > 0:
                    progress_percent = (current_amount / target_amount) * 100 if target_amount > 0 else 0
                    required_monthly = (target_amount - current_amount) / (days_remaining / 30.44) if days_remaining > 0 else 0
                    
                    # Goal progress analysis
                    if progress_percent < 50 and days_remaining < 180:  # Less than 50% with 6 months left
                        insights.append(FinancialInsight(
                            id=f"goal_behind_{goal.get('id', 'unknown')}_{datetime.now().timestamp()}",
                            type=InsightType.GOAL_PROGRESS,
                            title=f"Behind on {goal.get('name', 'Goal')}",
                            description=f"You're {progress_percent:.1f}% toward your goal with {days_remaining} days remaining. Need ${required_monthly:.2f}/month to catch up.",
                            priority=InsightPriority.HIGH,
                            confidence=0.9,
                            impact_score=80,
                            actionable=True,
                            recommendations=[
                                f"Increase monthly contributions to ${required_monthly:.2f}",
                                "Review and reduce discretionary spending",
                                "Consider extending the goal timeline if needed",
                                "Look for additional income sources"
                            ],
                            data_points={
                                'goal_name': goal.get('name'),
                                'progress_percent': progress_percent,
                                'current_amount': current_amount,
                                'target_amount': target_amount,
                                'days_remaining': days_remaining,
                                'required_monthly': required_monthly
                            },
                            timestamp=datetime.now(),
                            category='goals',
                            tags=['goal_progress', goal_type]
                        ))
                    elif progress_percent > 80:  # Ahead of schedule
                        insights.append(FinancialInsight(
                            id=f"goal_ahead_{goal.get('id', 'unknown')}_{datetime.now().timestamp()}",
                            type=InsightType.GOAL_PROGRESS,
                            title=f"Ahead on {goal.get('name', 'Goal')}",
                            description=f"Great progress! You're {progress_percent:.1f}% toward your goal with {days_remaining} days remaining.",
                            priority=InsightPriority.LOW,
                            confidence=0.9,
                            impact_score=30,
                            actionable=True,
                            recommendations=[
                                "Consider increasing your goal target",
                                "Start planning your next financial goal",
                                "Maintain your current savings rate"
                            ],
                            data_points={
                                'goal_name': goal.get('name'),
                                'progress_percent': progress_percent,
                                'current_amount': current_amount,
                                'target_amount': target_amount,
                                'days_remaining': days_remaining
                            },
                            timestamp=datetime.now(),
                            category='goals',
                            tags=['goal_progress', goal_type, 'ahead_of_schedule']
                        ))
        
        return insights  
  
    def _get_category_spending(self, financial_data: Dict, category: str) -> float:
        """Get total spending for a specific category"""
        transactions = financial_data.get('transactions', [])
        category_total = 0.0
        
        for transaction in transactions:
            if transaction.get('category') == category:
                category_total += abs(transaction.get('amount', 0))
        
        return category_total
    
    def _identify_subscription_opportunities(self, transactions: List[Dict]) -> float:
        """Identify potential subscription savings"""
        subscription_keywords = [
            'netflix', 'spotify', 'amazon prime', 'hulu', 'disney',
            'subscription', 'monthly', 'annual', 'premium', 'pro',
            'gym', 'fitness', 'streaming', 'music', 'video'
        ]
        
        potential_savings = 0.0
        subscription_amounts = []
        
        for transaction in transactions:
            description = transaction.get('description', '').lower()
            merchant = transaction.get('merchant_name', '').lower()
            
            for keyword in subscription_keywords:
                if keyword in description or keyword in merchant:
                    amount = abs(transaction.get('amount', 0))
                    subscription_amounts.append(amount)
                    break
        
        if subscription_amounts:
            # Estimate potential savings as 20% of subscription spending
            total_subscriptions = sum(subscription_amounts)
            potential_savings = total_subscriptions * 0.2
        
        return potential_savings
    
    def _generate_yoy_comparison(self, transactions: List[Dict]) -> Optional[FinancialInsight]:
        """Generate year-over-year comparison insight"""
        df = pd.DataFrame(transactions)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df['amount'] = df['amount'].abs()
        
        current_year = datetime.now().year
        previous_year = current_year - 1
        
        current_year_data = df[df['timestamp'].dt.year == current_year]
        previous_year_data = df[df['timestamp'].dt.year == previous_year]
        
        if len(current_year_data) > 0 and len(previous_year_data) > 0:
            current_total = current_year_data['amount'].sum()
            previous_total = previous_year_data['amount'].sum()
            
            # Normalize by months to account for partial year
            current_months = current_year_data['timestamp'].dt.month.nunique()
            previous_months = previous_year_data['timestamp'].dt.month.nunique()
            
            current_monthly_avg = current_total / current_months if current_months > 0 else 0
            previous_monthly_avg = previous_total / previous_months if previous_months > 0 else 0
            
            if previous_monthly_avg > 0:
                yoy_change = ((current_monthly_avg - previous_monthly_avg) / previous_monthly_avg) * 100
                
                if abs(yoy_change) > 10:  # 10% year-over-year change
                    direction = "increased" if yoy_change > 0 else "decreased"
                    priority = InsightPriority.MEDIUM
                    
                    return FinancialInsight(
                        id=f"yoy_comparison_{datetime.now().timestamp()}",
                        type=InsightType.COMPARISON,
                        title=f"Year-over-Year Spending {direction.title()}",
                        description=f"Your monthly spending has {direction} by {abs(yoy_change):.1f}% compared to last year (${current_monthly_avg:.2f} vs ${previous_monthly_avg:.2f})",
                        priority=priority,
                        confidence=0.8,
                        impact_score=60,
                        actionable=True,
                        recommendations=[
                            f"Analyze what caused the {direction} in spending",
                            "Review category-wise changes for insights",
                            "Adjust your budget planning for the trend" if yoy_change > 0 else "Great job reducing expenses year-over-year!"
                        ],
                        data_points={
                            'current_monthly_avg': current_monthly_avg,
                            'previous_monthly_avg': previous_monthly_avg,
                            'yoy_change_percent': yoy_change,
                            'direction': direction
                        },
                        timestamp=datetime.now(),
                        category='comparison',
                        tags=['year_over_year', 'annual_comparison']
                    )
        
        return None
    
    def _filter_insights(self, insights: List[FinancialInsight], 
                        user_preferences: Optional[Dict] = None) -> List[FinancialInsight]:
        """Filter insights based on confidence and preferences"""
        filtered_insights = []
        
        min_confidence = self.config['insight_settings']['min_confidence_threshold']
        
        for insight in insights:
            # Filter by confidence
            if insight.confidence < min_confidence:
                continue
            
            # Filter by user preferences
            if user_preferences:
                excluded_types = user_preferences.get('excluded_insight_types', [])
                if insight.type.value in excluded_types:
                    continue
                
                min_priority = user_preferences.get('min_priority', 'low')
                priority_order = ['low', 'medium', 'high', 'critical']
                if priority_order.index(insight.priority.value) < priority_order.index(min_priority):
                    continue
            
            filtered_insights.append(insight)
        
        return filtered_insights
    
    def _rank_insights(self, insights: List[FinancialInsight]) -> List[FinancialInsight]:
        """Rank insights by priority and impact"""
        priority_weights = {
            InsightPriority.CRITICAL: 4,
            InsightPriority.HIGH: 3,
            InsightPriority.MEDIUM: 2,
            InsightPriority.LOW: 1
        }
        
        def insight_score(insight):
            priority_score = priority_weights.get(insight.priority, 1)
            return (priority_score * 100) + insight.impact_score + (insight.confidence * 50)
        
        # Sort by score (highest first)
        ranked_insights = sorted(insights, key=insight_score, reverse=True)
        
        # Limit insights per category
        max_per_category = self.config['insight_settings']['max_insights_per_category']
        category_counts = {}
        final_insights = []
        
        for insight in ranked_insights:
            category = insight.category or 'general'
            if category_counts.get(category, 0) < max_per_category:
                final_insights.append(insight)
                category_counts[category] = category_counts.get(category, 0) + 1
        
        return final_insights
    
    def generate_personalized_recommendations(self, insights: List[FinancialInsight], 
                                           user_profile: Dict) -> List[str]:
        """Generate personalized recommendations based on insights and user profile"""
        recommendations = []
        
        # Extract recommendations from high-priority insights
        high_priority_insights = [i for i in insights if i.priority in [InsightPriority.HIGH, InsightPriority.CRITICAL]]
        
        for insight in high_priority_insights[:3]:  # Top 3 high-priority insights
            recommendations.extend(insight.recommendations[:2])  # Top 2 recommendations per insight
        
        # Add personalized recommendations based on user profile
        risk_tolerance = user_profile.get('risk_tolerance', 'medium')
        financial_goals = user_profile.get('financial_goals', [])
        
        if risk_tolerance == 'conservative':
            recommendations.append("Focus on building emergency fund before investing")
            recommendations.append("Consider low-risk savings accounts for short-term goals")
        elif risk_tolerance == 'aggressive':
            recommendations.append("Consider increasing investment contributions")
            recommendations.append("Look into growth-oriented investment options")
        
        # Goal-specific recommendations
        for goal in financial_goals:
            if goal.get('type') == 'retirement':
                recommendations.append("Maximize employer 401(k) matching if available")
            elif goal.get('type') == 'house':
                recommendations.append("Consider a dedicated house fund savings account")
        
        # Remove duplicates and limit
        unique_recommendations = list(dict.fromkeys(recommendations))
        return unique_recommendations[:8]  # Limit to 8 recommendations
    
    def get_insight_summary(self, insights: List[FinancialInsight]) -> Dict:
        """Get summary statistics of generated insights"""
        if not insights:
            return {
                'total_insights': 0,
                'by_priority': {},
                'by_type': {},
                'actionable_count': 0,
                'average_confidence': 0,
                'average_impact': 0
            }
        
        priority_counts = {}
        type_counts = {}
        actionable_count = 0
        total_confidence = 0
        total_impact = 0
        
        for insight in insights:
            # Count by priority
            priority = insight.priority.value
            priority_counts[priority] = priority_counts.get(priority, 0) + 1
            
            # Count by type
            insight_type = insight.type.value
            type_counts[insight_type] = type_counts.get(insight_type, 0) + 1
            
            # Count actionable insights
            if insight.actionable:
                actionable_count += 1
            
            # Sum for averages
            total_confidence += insight.confidence
            total_impact += insight.impact_score
        
        return {
            'total_insights': len(insights),
            'by_priority': priority_counts,
            'by_type': type_counts,
            'actionable_count': actionable_count,
            'average_confidence': total_confidence / len(insights),
            'average_impact': total_impact / len(insights)
        }