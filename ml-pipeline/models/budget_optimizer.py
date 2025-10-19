"""
Budget Optimization System
Intelligent budget planning and optimization using ML algorithms
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
import logging
from typing import Dict, List, Tuple, Optional, Any
from datetime import datetime, timedelta
import json
from dataclasses import dataclass
from enum import Enum
import math

logger = logging.getLogger(__name__)

class BudgetCategory(Enum):
    """Budget category types"""
    ESSENTIAL = "essential"
    DISCRETIONARY = "discretionary"
    SAVINGS = "savings"
    DEBT = "debt"

class OptimizationGoal(Enum):
    """Budget optimization goals"""
    MAXIMIZE_SAVINGS = "maximize_savings"
    MINIMIZE_RISK = "minimize_risk"
    BALANCE_LIFESTYLE = "balance_lifestyle"
    DEBT_REDUCTION = "debt_reduction"

@dataclass
class BudgetAllocation:
    """Individual budget allocation"""
    category: str
    subcategory: Optional[str]
    current_amount: float
    recommended_amount: float
    min_amount: float
    max_amount: float
    category_type: BudgetCategory
    priority: int  # 1-5, 5 being highest priority
    justification: str
    optimization_potential: float  # Potential savings/optimization
    confidence: float  # 0-1

@dataclass
class BudgetPlan:
    """Complete budget plan"""
    user_id: str
    total_income: float
    total_allocated: float
    allocations: List[BudgetAllocation]
    savings_rate: float
    emergency_fund_allocation: float
    debt_payment_allocation: float
    optimization_goal: OptimizationGoal
    risk_score: float
    confidence: float
    created_at: datetime
    valid_until: datetime

class BudgetOptimizer:
    """
    Intelligent budget optimization system using ML algorithms
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._get_default_config()
        self.models = {}
        self.scalers = {}
        self.is_trained = False
        
    def _get_default_config(self) -> Dict:
        """Get default configuration"""
        return {
            'optimization_settings': {
                'min_savings_rate': 0.10,  # 10% minimum savings
                'max_savings_rate': 0.50,  # 50% maximum savings
                'emergency_fund_months': 6,
                'debt_payment_priority': 0.8,  # High priority for debt payments
                'lifestyle_flexibility': 0.2   # 20% flexibility in discretionary spending
            },
            'category_mappings': {
                'essential': ['Housing', 'Utilities', 'Groceries', 'Transportation', 'Insurance', 'Healthcare'],
                'discretionary': ['Entertainment', 'Dining', 'Shopping', 'Travel', 'Hobbies'],
                'savings': ['Emergency Fund', 'Retirement', 'Investments'],
                'debt': ['Credit Card', 'Student Loan', 'Personal Loan', 'Mortgage']
            },
            'optimization_weights': {
                'savings_maximization': 0.4,
                'risk_minimization': 0.3,
                'lifestyle_balance': 0.2,
                'goal_achievement': 0.1
            },
            'constraints': {
                'housing_max_percent': 0.30,  # 30% max for housing
                'transportation_max_percent': 0.15,  # 15% max for transportation
                'food_max_percent': 0.15,  # 15% max for food
                'discretionary_min_percent': 0.05  # 5% minimum for lifestyle
            }
        }
    
    def optimize_budget(self, financial_data: Dict, 
                       optimization_goal: OptimizationGoal = OptimizationGoal.BALANCE_LIFESTYLE,
                       constraints: Optional[Dict] = None) -> BudgetPlan:
        """
        Generate optimized budget plan
        
        Args:
            financial_data: User's financial data
            optimization_goal: Primary optimization objective
            constraints: Additional constraints
            
        Returns:
            Optimized budget plan
        """
        try:
            # Extract key financial metrics
            monthly_income = financial_data.get('monthly_income', 0)
            current_expenses = financial_data.get('monthly_expenses', 0)
            financial_goals = financial_data.get('financial_goals', [])
            debt_info = financial_data.get('debt_breakdown', {})
            
            if monthly_income <= 0:
                raise ValueError("Invalid income data for budget optimization")
            
            # Analyze spending patterns
            spending_analysis = self._analyze_spending_patterns(financial_data)
            
            # Calculate baseline allocations
            baseline_allocations = self._calculate_baseline_allocations(
                monthly_income, spending_analysis
            )
            
            # Apply optimization based on goal
            optimized_allocations = self._apply_optimization_strategy(
                baseline_allocations, monthly_income, optimization_goal, 
                financial_goals, debt_info, constraints
            )
            
            # Validate and adjust allocations
            final_allocations = self._validate_and_adjust_allocations(
                optimized_allocations, monthly_income
            )
            
            # Calculate metrics
            total_allocated = sum(alloc.recommended_amount for alloc in final_allocations)
            savings_allocation = sum(
                alloc.recommended_amount for alloc in final_allocations 
                if alloc.category_type == BudgetCategory.SAVINGS
            )
            savings_rate = savings_allocation / monthly_income if monthly_income > 0 else 0
            
            emergency_fund_allocation = next(
                (alloc.recommended_amount for alloc in final_allocations 
                 if 'emergency' in alloc.category.lower()), 0
            )
            
            debt_payment_allocation = sum(
                alloc.recommended_amount for alloc in final_allocations 
                if alloc.category_type == BudgetCategory.DEBT
            )
            
            # Calculate risk score
            risk_score = self._calculate_budget_risk_score(
                final_allocations, monthly_income, debt_info
            )
            
            # Calculate overall confidence
            confidence = self._calculate_plan_confidence(
                final_allocations, spending_analysis
            )
            
            return BudgetPlan(
                user_id=financial_data.get('user_id', ''),
                total_income=monthly_income,
                total_allocated=total_allocated,
                allocations=final_allocations,
                savings_rate=savings_rate,
                emergency_fund_allocation=emergency_fund_allocation,
                debt_payment_allocation=debt_payment_allocation,
                optimization_goal=optimization_goal,
                risk_score=risk_score,
                confidence=confidence,
                created_at=datetime.now(),
                valid_until=datetime.now() + timedelta(days=30)
            )
            
        except Exception as e:
            logger.error(f"Budget optimization error: {str(e)}")
            raise 
   
    def _analyze_spending_patterns(self, financial_data: Dict) -> Dict:
        """Analyze historical spending patterns"""
        transactions = financial_data.get('transactions', [])
        
        if not transactions:
            return self._get_default_spending_patterns()
        
        df = pd.DataFrame(transactions)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df['amount'] = df['amount'].abs()
        
        # Category analysis
        category_stats = df.groupby('category')['amount'].agg([
            'sum', 'mean', 'std', 'count'
        ]).reset_index()
        
        # Monthly patterns
        monthly_spending = df.groupby([
            df['timestamp'].dt.to_period('M'), 'category'
        ])['amount'].sum().reset_index()
        
        # Calculate volatility and trends
        analysis = {}
        for category in df['category'].unique():
            cat_data = category_stats[category_stats['category'] == category].iloc[0]
            
            # Get monthly data for this category
            cat_monthly = monthly_spending[
                monthly_spending['category'] == category
            ]['amount'].values
            
            volatility = np.std(cat_monthly) / (np.mean(cat_monthly) + 1e-8) if len(cat_monthly) > 1 else 0
            trend = self._calculate_trend(cat_monthly) if len(cat_monthly) > 2 else 0
            
            analysis[category] = {
                'total_amount': float(cat_data['sum']),
                'average_amount': float(cat_data['mean']),
                'volatility': volatility,
                'trend': trend,
                'frequency': int(cat_data['count']),
                'category_type': self._classify_category(category)
            }
        
        return analysis
    
    def _get_default_spending_patterns(self) -> Dict:
        """Get default spending patterns when no data available"""
        return {
            'Housing': {
                'total_amount': 0,
                'average_amount': 0,
                'volatility': 0.1,
                'trend': 0,
                'frequency': 1,
                'category_type': BudgetCategory.ESSENTIAL
            },
            'Food': {
                'total_amount': 0,
                'average_amount': 0,
                'volatility': 0.2,
                'trend': 0,
                'frequency': 20,
                'category_type': BudgetCategory.ESSENTIAL
            },
            'Transportation': {
                'total_amount': 0,
                'average_amount': 0,
                'volatility': 0.3,
                'trend': 0,
                'frequency': 10,
                'category_type': BudgetCategory.ESSENTIAL
            },
            'Entertainment': {
                'total_amount': 0,
                'average_amount': 0,
                'volatility': 0.5,
                'trend': 0,
                'frequency': 8,
                'category_type': BudgetCategory.DISCRETIONARY
            }
        }
    
    def _classify_category(self, category: str) -> BudgetCategory:
        """Classify spending category"""
        category_lower = category.lower()
        
        for cat_type, categories in self.config['category_mappings'].items():
            if any(cat.lower() in category_lower for cat in categories):
                return BudgetCategory(cat_type)
        
        # Default to discretionary if not found
        return BudgetCategory.DISCRETIONARY
    
    def _calculate_trend(self, values: np.ndarray) -> float:
        """Calculate trend using linear regression"""
        if len(values) < 2:
            return 0.0
        
        x = np.arange(len(values)).reshape(-1, 1)
        y = values
        
        try:
            model = LinearRegression()
            model.fit(x, y)
            # Normalize slope by mean value
            slope = model.coef_[0]
            mean_value = np.mean(y)
            return slope / (mean_value + 1e-8)
        except:
            return 0.0
    
    def _calculate_baseline_allocations(self, monthly_income: float, 
                                      spending_analysis: Dict) -> List[BudgetAllocation]:
        """Calculate baseline budget allocations"""
        allocations = []
        
        # Essential categories with baseline percentages
        essential_baselines = {
            'Housing': 0.25,  # 25% of income
            'Food': 0.12,     # 12% of income
            'Transportation': 0.10,  # 10% of income
            'Utilities': 0.05,       # 5% of income
            'Insurance': 0.04,       # 4% of income
            'Healthcare': 0.03       # 3% of income
        }
        
        # Discretionary categories
        discretionary_baselines = {
            'Entertainment': 0.05,   # 5% of income
            'Dining': 0.04,          # 4% of income
            'Shopping': 0.03,        # 3% of income
            'Travel': 0.02           # 2% of income
        }
        
        # Savings and debt categories
        financial_baselines = {
            'Emergency Fund': 0.10,  # 10% of income
            'Retirement': 0.10,      # 10% of income
            'Debt Payments': 0.05    # 5% of income (minimum)
        }
        
        # Create allocations for essential categories
        for category, percentage in essential_baselines.items():
            current_amount = spending_analysis.get(category, {}).get('total_amount', 0)
            recommended_amount = monthly_income * percentage
            
            allocations.append(BudgetAllocation(
                category=category,
                subcategory=None,
                current_amount=current_amount,
                recommended_amount=recommended_amount,
                min_amount=recommended_amount * 0.7,  # 30% flexibility
                max_amount=recommended_amount * 1.3,
                category_type=BudgetCategory.ESSENTIAL,
                priority=5,  # High priority for essentials
                justification=f"Essential expense - recommended {percentage:.0%} of income",
                optimization_potential=max(0, current_amount - recommended_amount),
                confidence=0.8
            ))
        
        # Create allocations for discretionary categories
        for category, percentage in discretionary_baselines.items():
            current_amount = spending_analysis.get(category, {}).get('total_amount', 0)
            recommended_amount = monthly_income * percentage
            
            allocations.append(BudgetAllocation(
                category=category,
                subcategory=None,
                current_amount=current_amount,
                recommended_amount=recommended_amount,
                min_amount=0,  # Can be reduced to zero
                max_amount=recommended_amount * 2,  # More flexibility
                category_type=BudgetCategory.DISCRETIONARY,
                priority=2,  # Lower priority
                justification=f"Discretionary spending - recommended {percentage:.0%} of income",
                optimization_potential=max(0, current_amount - recommended_amount * 0.5),
                confidence=0.6
            ))
        
        # Create allocations for financial categories
        for category, percentage in financial_baselines.items():
            if 'Emergency' in category:
                category_type = BudgetCategory.SAVINGS
                priority = 4
            elif 'Retirement' in category:
                category_type = BudgetCategory.SAVINGS
                priority = 3
            else:
                category_type = BudgetCategory.DEBT
                priority = 4
            
            recommended_amount = monthly_income * percentage
            
            allocations.append(BudgetAllocation(
                category=category,
                subcategory=None,
                current_amount=0,  # Will be updated based on actual data
                recommended_amount=recommended_amount,
                min_amount=recommended_amount * 0.5,
                max_amount=recommended_amount * 2,
                category_type=category_type,
                priority=priority,
                justification=f"Financial goal - recommended {percentage:.0%} of income",
                optimization_potential=0,
                confidence=0.7
            ))
        
        return allocations
    
    def _apply_optimization_strategy(self, baseline_allocations: List[BudgetAllocation],
                                   monthly_income: float,
                                   optimization_goal: OptimizationGoal,
                                   financial_goals: List[Dict],
                                   debt_info: Dict,
                                   constraints: Optional[Dict] = None) -> List[BudgetAllocation]:
        """Apply optimization strategy based on goal"""
        
        optimized_allocations = baseline_allocations.copy()
        
        if optimization_goal == OptimizationGoal.MAXIMIZE_SAVINGS:
            optimized_allocations = self._optimize_for_savings(
                optimized_allocations, monthly_income
            )
        elif optimization_goal == OptimizationGoal.DEBT_REDUCTION:
            optimized_allocations = self._optimize_for_debt_reduction(
                optimized_allocations, monthly_income, debt_info
            )
        elif optimization_goal == OptimizationGoal.MINIMIZE_RISK:
            optimized_allocations = self._optimize_for_risk_minimization(
                optimized_allocations, monthly_income
            )
        else:  # BALANCE_LIFESTYLE
            optimized_allocations = self._optimize_for_lifestyle_balance(
                optimized_allocations, monthly_income
            )
        
        # Apply financial goals
        optimized_allocations = self._incorporate_financial_goals(
            optimized_allocations, monthly_income, financial_goals
        )
        
        # Apply custom constraints
        if constraints:
            optimized_allocations = self._apply_custom_constraints(
                optimized_allocations, monthly_income, constraints
            )
        
        return optimized_allocations
    
    def _optimize_for_savings(self, allocations: List[BudgetAllocation],
                            monthly_income: float) -> List[BudgetAllocation]:
        """Optimize budget to maximize savings"""
        target_savings_rate = 0.25  # 25% savings rate
        target_savings = monthly_income * target_savings_rate
        
        # Reduce discretionary spending
        discretionary_reduction = 0.3  # 30% reduction
        
        for allocation in allocations:
            if allocation.category_type == BudgetCategory.DISCRETIONARY:
                # Reduce discretionary spending
                new_amount = allocation.recommended_amount * (1 - discretionary_reduction)
                allocation.recommended_amount = max(new_amount, allocation.min_amount)
                allocation.justification += f" (Reduced by {discretionary_reduction:.0%} to maximize savings)"
            
            elif allocation.category_type == BudgetCategory.SAVINGS:
                # Increase savings allocations
                if 'Emergency' in allocation.category:
                    allocation.recommended_amount = monthly_income * 0.15  # 15% for emergency
                elif 'Retirement' in allocation.category:
                    allocation.recommended_amount = monthly_income * 0.15  # 15% for retirement
                
                allocation.justification = "Increased allocation to maximize savings rate"
        
        return allocations
    
    def _optimize_for_debt_reduction(self, allocations: List[BudgetAllocation],
                                   monthly_income: float,
                                   debt_info: Dict) -> List[BudgetAllocation]:
        """Optimize budget for aggressive debt reduction"""
        total_debt = sum(debt_info.values()) if debt_info else 0
        
        if total_debt > 0:
            # Allocate 20% of income to debt payments
            debt_payment_target = monthly_income * 0.20
            
            # Reduce discretionary spending more aggressively
            discretionary_reduction = 0.5  # 50% reduction
            
            for allocation in allocations:
                if allocation.category_type == BudgetCategory.DISCRETIONARY:
                    new_amount = allocation.recommended_amount * (1 - discretionary_reduction)
                    allocation.recommended_amount = max(new_amount, allocation.min_amount)
                    allocation.justification += f" (Reduced by {discretionary_reduction:.0%} for debt reduction)"
                
                elif allocation.category_type == BudgetCategory.DEBT:
                    allocation.recommended_amount = debt_payment_target
                    allocation.priority = 5  # Highest priority
                    allocation.justification = "Aggressive debt reduction strategy"
        
        return allocations
    
    def _optimize_for_risk_minimization(self, allocations: List[BudgetAllocation],
                                      monthly_income: float) -> List[BudgetAllocation]:
        """Optimize budget to minimize financial risk"""
        # Prioritize emergency fund and reduce volatile categories
        
        for allocation in allocations:
            if 'Emergency' in allocation.category:
                # Increase emergency fund to 6 months of expenses
                essential_expenses = sum(
                    alloc.recommended_amount for alloc in allocations
                    if alloc.category_type == BudgetCategory.ESSENTIAL
                )
                allocation.recommended_amount = essential_expenses * 0.5  # 50% of essential expenses monthly
                allocation.priority = 5
                allocation.justification = "Increased emergency fund for risk mitigation"
            
            elif allocation.category_type == BudgetCategory.DISCRETIONARY:
                # Reduce high-volatility discretionary spending
                volatility_reduction = 0.2  # 20% reduction
                new_amount = allocation.recommended_amount * (1 - volatility_reduction)
                allocation.recommended_amount = max(new_amount, allocation.min_amount)
                allocation.justification += f" (Reduced by {volatility_reduction:.0%} to minimize risk)"
        
        return allocations
    
    def _optimize_for_lifestyle_balance(self, allocations: List[BudgetAllocation],
                                      monthly_income: float) -> List[BudgetAllocation]:
        """Optimize budget for balanced lifestyle"""
        # Maintain reasonable discretionary spending while building savings
        
        for allocation in allocations:
            if allocation.category_type == BudgetCategory.DISCRETIONARY:
                # Maintain 80% of baseline discretionary spending
                allocation.recommended_amount *= 0.8
                allocation.justification += " (Balanced approach - maintaining lifestyle)"
            
            elif allocation.category_type == BudgetCategory.SAVINGS:
                # Moderate savings rate
                if 'Emergency' in allocation.category:
                    allocation.recommended_amount = monthly_income * 0.08  # 8%
                elif 'Retirement' in allocation.category:
                    allocation.recommended_amount = monthly_income * 0.12  # 12%
                
                allocation.justification = "Balanced savings approach"
        
        return allocations
    
    def _incorporate_financial_goals(self, allocations: List[BudgetAllocation],
                                   monthly_income: float,
                                   financial_goals: List[Dict]) -> List[BudgetAllocation]:
        """Incorporate specific financial goals into budget"""
        
        for goal in financial_goals:
            goal_type = goal.get('type', '')
            target_amount = goal.get('target_amount', 0)
            current_amount = goal.get('current_amount', 0)
            target_date = goal.get('target_date')
            
            if target_date:
                target_date = pd.to_datetime(target_date)
                months_remaining = max(1, (target_date - datetime.now()).days / 30.44)
                monthly_needed = (target_amount - current_amount) / months_remaining
                
                # Find or create allocation for this goal
                goal_allocation = None
                for allocation in allocations:
                    if goal_type.lower() in allocation.category.lower():
                        goal_allocation = allocation
                        break
                
                if goal_allocation:
                    # Update existing allocation
                    goal_allocation.recommended_amount = max(
                        goal_allocation.recommended_amount,
                        monthly_needed
                    )
                    goal_allocation.justification = f"Adjusted for {goal.get('name', 'goal')} target"
                    goal_allocation.priority = 4
                else:
                    # Create new allocation
                    allocations.append(BudgetAllocation(
                        category=f"{goal_type.title()} Goal",
                        subcategory=goal.get('name'),
                        current_amount=0,
                        recommended_amount=monthly_needed,
                        min_amount=monthly_needed * 0.8,
                        max_amount=monthly_needed * 1.5,
                        category_type=BudgetCategory.SAVINGS,
                        priority=4,
                        justification=f"Monthly allocation for {goal.get('name', 'goal')}",
                        optimization_potential=0,
                        confidence=0.8
                    ))
        
        return allocations 
   
    def _apply_custom_constraints(self, allocations: List[BudgetAllocation],
                                monthly_income: float,
                                constraints: Dict) -> List[BudgetAllocation]:
        """Apply custom user constraints"""
        
        for constraint_category, constraint_value in constraints.items():
            for allocation in allocations:
                if constraint_category.lower() in allocation.category.lower():
                    if isinstance(constraint_value, dict):
                        # Range constraint
                        min_val = constraint_value.get('min', allocation.min_amount)
                        max_val = constraint_value.get('max', allocation.max_amount)
                        allocation.min_amount = min_val
                        allocation.max_amount = max_val
                        allocation.recommended_amount = np.clip(
                            allocation.recommended_amount, min_val, max_val
                        )
                    else:
                        # Fixed amount constraint
                        allocation.recommended_amount = constraint_value
                    
                    allocation.justification += " (User constraint applied)"
        
        return allocations
    
    def _validate_and_adjust_allocations(self, allocations: List[BudgetAllocation],
                                       monthly_income: float) -> List[BudgetAllocation]:
        """Validate and adjust allocations to ensure they sum to income"""
        
        # Calculate total allocation
        total_allocated = sum(alloc.recommended_amount for alloc in allocations)
        
        # If over-allocated, reduce discretionary spending first
        if total_allocated > monthly_income:
            excess = total_allocated - monthly_income
            
            # Get discretionary allocations sorted by priority (lowest first)
            discretionary_allocs = [
                alloc for alloc in allocations 
                if alloc.category_type == BudgetCategory.DISCRETIONARY
            ]
            discretionary_allocs.sort(key=lambda x: x.priority)
            
            # Reduce discretionary spending
            remaining_excess = excess
            for allocation in discretionary_allocs:
                if remaining_excess <= 0:
                    break
                
                max_reduction = allocation.recommended_amount - allocation.min_amount
                reduction = min(remaining_excess, max_reduction)
                allocation.recommended_amount -= reduction
                remaining_excess -= reduction
                
                if reduction > 0:
                    allocation.justification += f" (Reduced by ${reduction:.2f} to balance budget)"
            
            # If still over-allocated, reduce other categories proportionally
            if remaining_excess > 0:
                non_essential_allocs = [
                    alloc for alloc in allocations 
                    if alloc.category_type != BudgetCategory.ESSENTIAL
                ]
                
                total_non_essential = sum(alloc.recommended_amount for alloc in non_essential_allocs)
                
                if total_non_essential > 0:
                    reduction_factor = remaining_excess / total_non_essential
                    
                    for allocation in non_essential_allocs:
                        reduction = allocation.recommended_amount * reduction_factor
                        new_amount = allocation.recommended_amount - reduction
                        allocation.recommended_amount = max(new_amount, allocation.min_amount)
        
        # If under-allocated, increase savings
        elif total_allocated < monthly_income * 0.95:  # Leave 5% buffer
            surplus = monthly_income * 0.95 - total_allocated
            
            # Find savings allocations
            savings_allocs = [
                alloc for alloc in allocations 
                if alloc.category_type == BudgetCategory.SAVINGS
            ]
            
            if savings_allocs:
                # Distribute surplus among savings allocations
                per_allocation_increase = surplus / len(savings_allocs)
                
                for allocation in savings_allocs:
                    allocation.recommended_amount += per_allocation_increase
                    allocation.justification += f" (Increased by ${per_allocation_increase:.2f} from surplus)"
        
        # Ensure all amounts are non-negative and within bounds
        for allocation in allocations:
            allocation.recommended_amount = max(0, allocation.recommended_amount)
            allocation.recommended_amount = np.clip(
                allocation.recommended_amount,
                allocation.min_amount,
                allocation.max_amount
            )
        
        return allocations
    
    def _calculate_budget_risk_score(self, allocations: List[BudgetAllocation],
                                   monthly_income: float,
                                   debt_info: Dict) -> float:
        """Calculate risk score for the budget plan"""
        
        risk_factors = []
        
        # Emergency fund adequacy
        emergency_allocation = next(
            (alloc.recommended_amount for alloc in allocations 
             if 'emergency' in alloc.category.lower()), 0
        )
        essential_expenses = sum(
            alloc.recommended_amount for alloc in allocations
            if alloc.category_type == BudgetCategory.ESSENTIAL
        )
        
        emergency_months = emergency_allocation / (essential_expenses + 1e-8)
        if emergency_months < 3:
            risk_factors.append(0.3)  # High risk
        elif emergency_months < 6:
            risk_factors.append(0.15)  # Medium risk
        else:
            risk_factors.append(0.0)  # Low risk
        
        # Debt-to-income ratio
        total_debt = sum(debt_info.values()) if debt_info else 0
        debt_to_income = total_debt / (monthly_income * 12) if monthly_income > 0 else 0
        
        if debt_to_income > 0.4:
            risk_factors.append(0.25)  # High risk
        elif debt_to_income > 0.2:
            risk_factors.append(0.1)   # Medium risk
        else:
            risk_factors.append(0.0)   # Low risk
        
        # Savings rate
        savings_allocation = sum(
            alloc.recommended_amount for alloc in allocations
            if alloc.category_type == BudgetCategory.SAVINGS
        )
        savings_rate = savings_allocation / monthly_income if monthly_income > 0 else 0
        
        if savings_rate < 0.1:
            risk_factors.append(0.2)   # High risk
        elif savings_rate < 0.15:
            risk_factors.append(0.1)   # Medium risk
        else:
            risk_factors.append(0.0)   # Low risk
        
        # Budget flexibility (discretionary spending)
        discretionary_allocation = sum(
            alloc.recommended_amount for alloc in allocations
            if alloc.category_type == BudgetCategory.DISCRETIONARY
        )
        discretionary_rate = discretionary_allocation / monthly_income if monthly_income > 0 else 0
        
        if discretionary_rate < 0.05:
            risk_factors.append(0.15)  # Too restrictive
        elif discretionary_rate > 0.3:
            risk_factors.append(0.1)   # Too loose
        else:
            risk_factors.append(0.0)   # Balanced
        
        # Calculate overall risk score (0-100, lower is better)
        total_risk = sum(risk_factors)
        return min(total_risk * 100, 100)
    
    def _calculate_plan_confidence(self, allocations: List[BudgetAllocation],
                                 spending_analysis: Dict) -> float:
        """Calculate confidence score for the budget plan"""
        
        confidence_factors = []
        
        # Data availability
        categories_with_data = len(spending_analysis)
        total_categories = len(allocations)
        data_coverage = categories_with_data / total_categories if total_categories > 0 else 0
        confidence_factors.append(data_coverage * 0.3)
        
        # Allocation reasonableness
        reasonable_allocations = 0
        for allocation in allocations:
            category_data = spending_analysis.get(allocation.category, {})
            current_spending = category_data.get('total_amount', 0)
            
            # Check if recommendation is within reasonable range of current spending
            if current_spending > 0:
                ratio = allocation.recommended_amount / current_spending
                if 0.5 <= ratio <= 2.0:  # Within 50%-200% of current spending
                    reasonable_allocations += 1
            else:
                reasonable_allocations += 1  # No data, assume reasonable
        
        reasonableness_score = reasonable_allocations / len(allocations) if allocations else 0
        confidence_factors.append(reasonableness_score * 0.4)
        
        # Budget balance
        total_allocated = sum(alloc.recommended_amount for alloc in allocations)
        # Assuming monthly_income is available in context
        balance_score = 1.0 - abs(total_allocated - 5000) / 5000  # Placeholder calculation
        confidence_factors.append(max(0, balance_score) * 0.3)
        
        return sum(confidence_factors)
    
    def evaluate_budget_performance(self, budget_plan: BudgetPlan,
                                  actual_spending: Dict,
                                  period_days: int = 30) -> Dict:
        """
        Evaluate budget performance against actual spending
        
        Args:
            budget_plan: The budget plan to evaluate
            actual_spending: Actual spending by category
            period_days: Evaluation period in days
            
        Returns:
            Performance evaluation results
        """
        try:
            # Normalize to monthly amounts
            monthly_factor = 30.44 / period_days
            
            performance_results = {
                'overall_performance': 0.0,
                'category_performance': {},
                'budget_adherence_score': 0.0,
                'overspend_categories': [],
                'underspend_categories': [],
                'recommendations': []
            }
            
            total_budget = sum(alloc.recommended_amount for alloc in budget_plan.allocations)
            total_actual = sum(actual_spending.values()) * monthly_factor
            
            # Overall adherence
            overall_variance = abs(total_actual - total_budget) / total_budget if total_budget > 0 else 0
            performance_results['budget_adherence_score'] = max(0, 1 - overall_variance)
            
            # Category-level analysis
            category_scores = []
            
            for allocation in budget_plan.allocations:
                category = allocation.category
                budgeted = allocation.recommended_amount
                actual = actual_spending.get(category, 0) * monthly_factor
                
                if budgeted > 0:
                    variance = (actual - budgeted) / budgeted
                    adherence_score = max(0, 1 - abs(variance))
                    
                    performance_results['category_performance'][category] = {
                        'budgeted': budgeted,
                        'actual': actual,
                        'variance_percent': variance * 100,
                        'adherence_score': adherence_score
                    }
                    
                    category_scores.append(adherence_score)
                    
                    # Identify over/under spending
                    if variance > 0.1:  # 10% overspend
                        performance_results['overspend_categories'].append({
                            'category': category,
                            'overspend_amount': actual - budgeted,
                            'overspend_percent': variance * 100
                        })
                    elif variance < -0.1:  # 10% underspend
                        performance_results['underspend_categories'].append({
                            'category': category,
                            'underspend_amount': budgeted - actual,
                            'underspend_percent': abs(variance) * 100
                        })
            
            # Calculate overall performance
            performance_results['overall_performance'] = np.mean(category_scores) if category_scores else 0
            
            # Generate recommendations
            performance_results['recommendations'] = self._generate_performance_recommendations(
                performance_results, budget_plan
            )
            
            return performance_results
            
        except Exception as e:
            logger.error(f"Budget performance evaluation error: {str(e)}")
            return {'error': str(e)}
    
    def _generate_performance_recommendations(self, performance_results: Dict,
                                           budget_plan: BudgetPlan) -> List[str]:
        """Generate recommendations based on budget performance"""
        recommendations = []
        
        # Overall performance recommendations
        overall_score = performance_results['overall_performance']
        
        if overall_score < 0.7:
            recommendations.append("Consider revising your budget to better match your spending patterns")
        
        # Category-specific recommendations
        for overspend in performance_results['overspend_categories']:
            category = overspend['category']
            percent = overspend['overspend_percent']
            
            if percent > 20:
                recommendations.append(
                    f"Significantly overspent in {category} by {percent:.1f}%. "
                    f"Consider setting up alerts or automatic limits for this category."
                )
            else:
                recommendations.append(
                    f"Slightly overspent in {category} by {percent:.1f}%. "
                    f"Monitor this category more closely next month."
                )
        
        # Underspending recommendations
        total_underspend = sum(
            underspend['underspend_amount'] 
            for underspend in performance_results['underspend_categories']
        )
        
        if total_underspend > budget_plan.total_income * 0.05:  # 5% of income
            recommendations.append(
                f"You underspent by ${total_underspend:.2f}. "
                f"Consider allocating this surplus to savings or debt payments."
            )
        
        # Savings rate recommendations
        if budget_plan.savings_rate < 0.1:
            recommendations.append(
                "Your savings rate is below 10%. Try to increase savings by reducing discretionary spending."
            )
        
        return recommendations
    
    def suggest_budget_adjustments(self, budget_plan: BudgetPlan,
                                 performance_results: Dict) -> BudgetPlan:
        """
        Suggest budget adjustments based on performance
        
        Args:
            budget_plan: Current budget plan
            performance_results: Performance evaluation results
            
        Returns:
            Adjusted budget plan
        """
        try:
            adjusted_allocations = []
            
            for allocation in budget_plan.allocations:
                category = allocation.category
                performance = performance_results['category_performance'].get(category, {})
                
                if performance:
                    variance_percent = performance.get('variance_percent', 0)
                    actual_amount = performance.get('actual', allocation.recommended_amount)
                    
                    # Adjust based on consistent over/under spending
                    if abs(variance_percent) > 15:  # 15% variance threshold
                        # Move 50% towards actual spending
                        adjustment_factor = 0.5
                        new_amount = (
                            allocation.recommended_amount * (1 - adjustment_factor) +
                            actual_amount * adjustment_factor
                        )
                        
                        # Ensure within bounds
                        new_amount = np.clip(new_amount, allocation.min_amount, allocation.max_amount)
                        
                        adjusted_allocation = BudgetAllocation(
                            category=allocation.category,
                            subcategory=allocation.subcategory,
                            current_amount=actual_amount,
                            recommended_amount=new_amount,
                            min_amount=allocation.min_amount,
                            max_amount=allocation.max_amount,
                            category_type=allocation.category_type,
                            priority=allocation.priority,
                            justification=f"Adjusted based on spending pattern (was ${allocation.recommended_amount:.2f})",
                            optimization_potential=allocation.optimization_potential,
                            confidence=min(allocation.confidence + 0.1, 1.0)  # Increase confidence
                        )
                    else:
                        adjusted_allocation = allocation
                else:
                    adjusted_allocation = allocation
                
                adjusted_allocations.append(adjusted_allocation)
            
            # Create new budget plan
            adjusted_plan = BudgetPlan(
                user_id=budget_plan.user_id,
                total_income=budget_plan.total_income,
                total_allocated=sum(alloc.recommended_amount for alloc in adjusted_allocations),
                allocations=adjusted_allocations,
                savings_rate=budget_plan.savings_rate,  # Will be recalculated
                emergency_fund_allocation=budget_plan.emergency_fund_allocation,
                debt_payment_allocation=budget_plan.debt_payment_allocation,
                optimization_goal=budget_plan.optimization_goal,
                risk_score=budget_plan.risk_score,  # Will be recalculated
                confidence=min(budget_plan.confidence + 0.1, 1.0),
                created_at=datetime.now(),
                valid_until=datetime.now() + timedelta(days=30)
            )
            
            return adjusted_plan
            
        except Exception as e:
            logger.error(f"Budget adjustment error: {str(e)}")
            return budget_plan  # Return original plan if adjustment fails