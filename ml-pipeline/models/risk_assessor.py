"""
Risk Assessment System
Implements comprehensive financial risk scoring and assessment models
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler, RobustScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import joblib
import logging
from typing import Dict, List, Tuple, Optional, Any
from datetime import datetime, timedelta
import json
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class RiskLevel(Enum):
    """Risk level categories"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class RiskCategory(Enum):
    """Risk category types"""
    LIQUIDITY = "liquidity"
    DEBT = "debt"
    INCOME = "income"
    SPENDING = "spending"
    EMERGENCY_FUND = "emergency_fund"
    INVESTMENT = "investment"
    CREDIT = "credit"

@dataclass
class RiskFactor:
    """Individual risk factor"""
    category: RiskCategory
    name: str
    score: float  # 0-100
    level: RiskLevel
    description: str
    impact: str
    recommendation: str
    urgency: int  # 1-5, 5 being most urgent

@dataclass
class RiskAssessment:
    """Complete risk assessment result"""
    overall_score: float  # 0-100
    overall_level: RiskLevel
    risk_factors: List[RiskFactor]
    emergency_fund_target: float
    emergency_fund_current: float
    emergency_fund_months: float
    debt_to_income_ratio: float
    liquidity_ratio: float
    spending_volatility: float
    income_stability: float
    recommendations: List[str]
    timestamp: datetime

class RiskAssessor:
    """
    Comprehensive financial risk assessment system
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._get_default_config()
        self.models = {}
        self.scalers = {}
        self.feature_columns = []
        self.is_trained = False
        
    def _get_default_config(self) -> Dict:
        """Get default configuration for risk assessment"""
        return {
            'risk_weights': {
                'liquidity': 0.25,
                'debt': 0.20,
                'income': 0.20,
                'spending': 0.15,
                'emergency_fund': 0.15,
                'credit': 0.05
            },
            'thresholds': {
                'emergency_fund_months': {
                    'low': 6.0,
                    'medium': 3.0,
                    'high': 1.0
                },
                'debt_to_income': {
                    'low': 0.20,
                    'medium': 0.36,
                    'high': 0.50
                },
                'liquidity_ratio': {
                    'low': 0.30,
                    'medium': 0.15,
                    'high': 0.05
                },
                'spending_volatility': {
                    'low': 0.15,
                    'medium': 0.25,
                    'high': 0.40
                },
                'income_stability': {
                    'low': 0.90,
                    'medium': 0.75,
                    'high': 0.60
                }
            },
            'model_params': {
                'random_forest': {
                    'n_estimators': 100,
                    'max_depth': 10,
                    'random_state': 42
                },
                'gradient_boosting': {
                    'n_estimators': 100,
                    'learning_rate': 0.1,
                    'max_depth': 6,
                    'random_state': 42
                }
            }
        }
    
    def extract_risk_features(self, financial_data: Dict) -> Dict:
        """
        Extract comprehensive risk features from financial data
        
        Args:
            financial_data: Dictionary containing user's financial information
            
        Returns:
            Dictionary of extracted risk features
        """
        try:
            features = {}
            
            # Basic financial metrics
            income = financial_data.get('monthly_income', 0)
            expenses = financial_data.get('monthly_expenses', 0)
            savings = financial_data.get('savings_balance', 0)
            debt = financial_data.get('total_debt', 0)
            credit_score = financial_data.get('credit_score', 650)
            
            # Transaction history
            transactions = financial_data.get('transactions', [])
            
            # Income features
            features.update(self._extract_income_features(financial_data))
            
            # Spending features
            features.update(self._extract_spending_features(transactions))
            
            # Debt features
            features.update(self._extract_debt_features(financial_data))
            
            # Liquidity features
            features.update(self._extract_liquidity_features(financial_data))
            
            # Emergency fund features
            features.update(self._extract_emergency_fund_features(financial_data))
            
            # Credit features
            features.update(self._extract_credit_features(financial_data))
            
            # Behavioral features
            features.update(self._extract_behavioral_features(transactions))
            
            logger.info(f"Extracted {len(features)} risk features")
            return features
            
        except Exception as e:
            logger.error(f"Risk feature extraction error: {str(e)}")
            raise
    
    def _extract_income_features(self, financial_data: Dict) -> Dict:
        """Extract income-related risk features"""
        features = {}
        
        income_history = financial_data.get('income_history', [])
        current_income = financial_data.get('monthly_income', 0)
        
        if len(income_history) > 0:
            incomes = [entry['amount'] for entry in income_history]
            
            # Income stability metrics
            features['income_mean'] = np.mean(incomes)
            features['income_std'] = np.std(incomes)
            features['income_cv'] = features['income_std'] / (features['income_mean'] + 1e-8)
            features['income_trend'] = self._calculate_trend(incomes)
            features['income_volatility'] = features['income_cv']
            
            # Income growth
            if len(incomes) >= 2:
                features['income_growth_rate'] = (incomes[-1] - incomes[0]) / (incomes[0] + 1e-8)
            else:
                features['income_growth_rate'] = 0.0
            
            # Income consistency
            features['income_consistency'] = 1.0 - min(features['income_cv'], 1.0)
        else:
            # Default values when no history
            features.update({
                'income_mean': current_income,
                'income_std': 0.0,
                'income_cv': 0.0,
                'income_trend': 0.0,
                'income_volatility': 0.0,
                'income_growth_rate': 0.0,
                'income_consistency': 1.0
            })
        
        # Employment stability
        employment_type = financial_data.get('employment_type', 'unknown')
        employment_duration = financial_data.get('employment_duration_months', 12)
        
        features['employment_stability'] = self._calculate_employment_stability(
            employment_type, employment_duration
        )
        
        return features
    
    def _extract_spending_features(self, transactions: List[Dict]) -> Dict:
        """Extract spending-related risk features"""
        features = {}
        
        if len(transactions) == 0:
            return {
                'spending_volatility': 0.0,
                'spending_trend': 0.0,
                'discretionary_spending_ratio': 0.5,
                'spending_consistency': 1.0,
                'large_transaction_frequency': 0.0
            }
        
        # Convert to DataFrame for easier analysis
        df = pd.DataFrame(transactions)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df['amount'] = df['amount'].abs()  # Use absolute values
        
        # Monthly spending aggregation
        monthly_spending = df.groupby(df['timestamp'].dt.to_period('M'))['amount'].sum()
        
        if len(monthly_spending) > 0:
            # Spending volatility
            features['spending_volatility'] = monthly_spending.std() / (monthly_spending.mean() + 1e-8)
            features['spending_trend'] = self._calculate_trend(monthly_spending.values)
            features['spending_consistency'] = 1.0 - min(features['spending_volatility'], 1.0)
        else:
            features['spending_volatility'] = 0.0
            features['spending_trend'] = 0.0
            features['spending_consistency'] = 1.0
        
        # Category analysis
        category_spending = df.groupby('category')['amount'].sum()
        total_spending = category_spending.sum()
        
        # Discretionary vs essential spending
        discretionary_categories = ['Entertainment', 'Dining', 'Shopping', 'Travel']
        essential_categories = ['Groceries', 'Utilities', 'Rent', 'Insurance', 'Healthcare']
        
        discretionary_spending = sum(
            category_spending.get(cat, 0) for cat in discretionary_categories
        )
        
        features['discretionary_spending_ratio'] = (
            discretionary_spending / (total_spending + 1e-8)
        )
        
        # Large transaction analysis
        median_amount = df['amount'].median()
        large_transactions = df[df['amount'] > median_amount * 3]
        features['large_transaction_frequency'] = len(large_transactions) / len(df)
        
        return features
    
    def _extract_debt_features(self, financial_data: Dict) -> Dict:
        """Extract debt-related risk features"""
        features = {}
        
        total_debt = financial_data.get('total_debt', 0)
        monthly_income = financial_data.get('monthly_income', 1)
        monthly_debt_payments = financial_data.get('monthly_debt_payments', 0)
        
        # Debt ratios
        features['debt_to_income_ratio'] = total_debt / (monthly_income * 12 + 1e-8)
        features['debt_service_ratio'] = monthly_debt_payments / (monthly_income + 1e-8)
        
        # Debt composition
        debt_breakdown = financial_data.get('debt_breakdown', {})
        total_debt_breakdown = sum(debt_breakdown.values()) or 1
        
        features['credit_card_debt_ratio'] = debt_breakdown.get('credit_card', 0) / total_debt_breakdown
        features['mortgage_debt_ratio'] = debt_breakdown.get('mortgage', 0) / total_debt_breakdown
        features['student_loan_ratio'] = debt_breakdown.get('student_loan', 0) / total_debt_breakdown
        features['other_debt_ratio'] = debt_breakdown.get('other', 0) / total_debt_breakdown
        
        # High-interest debt
        high_interest_debt = debt_breakdown.get('credit_card', 0) + debt_breakdown.get('other', 0)
        features['high_interest_debt_ratio'] = high_interest_debt / (total_debt + 1e-8)
        
        return features
    
    def _extract_liquidity_features(self, financial_data: Dict) -> Dict:
        """Extract liquidity-related risk features"""
        features = {}
        
        liquid_assets = financial_data.get('liquid_assets', 0)  # Cash + savings
        monthly_expenses = financial_data.get('monthly_expenses', 1)
        total_assets = financial_data.get('total_assets', liquid_assets)
        
        # Liquidity ratios
        features['liquidity_ratio'] = liquid_assets / (monthly_expenses + 1e-8)
        features['liquid_asset_ratio'] = liquid_assets / (total_assets + 1e-8)
        
        # Cash flow
        monthly_income = financial_data.get('monthly_income', 0)
        features['cash_flow_ratio'] = (monthly_income - monthly_expenses) / (monthly_income + 1e-8)
        
        return features
    
    def _extract_emergency_fund_features(self, financial_data: Dict) -> Dict:
        """Extract emergency fund related features"""
        features = {}
        
        emergency_fund = financial_data.get('emergency_fund', 0)
        monthly_expenses = financial_data.get('monthly_expenses', 1)
        
        # Emergency fund coverage
        features['emergency_fund_months'] = emergency_fund / (monthly_expenses + 1e-8)
        features['emergency_fund_adequacy'] = min(features['emergency_fund_months'] / 6.0, 1.0)
        
        # Emergency fund growth
        emergency_fund_history = financial_data.get('emergency_fund_history', [])
        if len(emergency_fund_history) >= 2:
            amounts = [entry['amount'] for entry in emergency_fund_history]
            features['emergency_fund_growth'] = self._calculate_trend(amounts)
        else:
            features['emergency_fund_growth'] = 0.0
        
        return features
    
    def _extract_credit_features(self, financial_data: Dict) -> Dict:
        """Extract credit-related risk features"""
        features = {}
        
        credit_score = financial_data.get('credit_score', 650)
        credit_utilization = financial_data.get('credit_utilization', 0.3)
        credit_history_length = financial_data.get('credit_history_months', 60)
        
        # Normalize credit score (300-850 range)
        features['credit_score_normalized'] = (credit_score - 300) / 550
        features['credit_utilization'] = credit_utilization
        features['credit_history_years'] = credit_history_length / 12
        
        # Credit risk score
        features['credit_risk_score'] = self._calculate_credit_risk(
            credit_score, credit_utilization, credit_history_length
        )
        
        return features
    
    def _extract_behavioral_features(self, transactions: List[Dict]) -> Dict:
        """Extract behavioral risk features"""
        features = {}
        
        if len(transactions) == 0:
            return {
                'impulse_spending_score': 0.0,
                'weekend_spending_ratio': 0.3,
                'late_night_spending_ratio': 0.1,
                'subscription_spending_ratio': 0.1
            }
        
        df = pd.DataFrame(transactions)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df['amount'] = df['amount'].abs()
        
        # Impulse spending (small, frequent transactions)
        small_transactions = df[df['amount'] < df['amount'].quantile(0.25)]
        features['impulse_spending_score'] = len(small_transactions) / len(df)
        
        # Weekend spending
        df['is_weekend'] = df['timestamp'].dt.weekday >= 5
        weekend_spending = df[df['is_weekend']]['amount'].sum()
        total_spending = df['amount'].sum()
        features['weekend_spending_ratio'] = weekend_spending / (total_spending + 1e-8)
        
        # Late night spending (potential impulse)
        df['hour'] = df['timestamp'].dt.hour
        late_night_spending = df[df['hour'].between(22, 6)]['amount'].sum()
        features['late_night_spending_ratio'] = late_night_spending / (total_spending + 1e-8)
        
        # Subscription/recurring spending
        recurring_keywords = ['subscription', 'monthly', 'netflix', 'spotify', 'gym']
        recurring_mask = df['description'].str.lower().str.contains('|'.join(recurring_keywords), na=False)
        recurring_spending = df[recurring_mask]['amount'].sum()
        features['subscription_spending_ratio'] = recurring_spending / (total_spending + 1e-8)
        
        return features
    
    def _calculate_trend(self, values: List[float]) -> float:
        """Calculate trend using linear regression slope"""
        if len(values) < 2:
            return 0.0
        
        x = np.arange(len(values))
        y = np.array(values)
        
        # Simple linear regression
        n = len(values)
        slope = (n * np.sum(x * y) - np.sum(x) * np.sum(y)) / (n * np.sum(x**2) - np.sum(x)**2 + 1e-8)
        
        # Normalize slope
        mean_y = np.mean(y)
        return slope / (mean_y + 1e-8)
    
    def _calculate_employment_stability(self, employment_type: str, duration_months: int) -> float:
        """Calculate employment stability score"""
        type_scores = {
            'full_time': 1.0,
            'part_time': 0.7,
            'contract': 0.5,
            'freelance': 0.4,
            'unemployed': 0.0,
            'unknown': 0.5
        }
        
        base_score = type_scores.get(employment_type.lower(), 0.5)
        
        # Duration bonus (max 2 years for full bonus)
        duration_bonus = min(duration_months / 24, 1.0) * 0.3
        
        return min(base_score + duration_bonus, 1.0)
    
    def _calculate_credit_risk(self, credit_score: int, utilization: float, history_months: int) -> float:
        """Calculate credit risk score"""
        # Credit score component (0-1, higher is better)
        score_component = (credit_score - 300) / 550
        
        # Utilization component (0-1, lower is better)
        utilization_component = 1.0 - min(utilization, 1.0)
        
        # History component (0-1, longer is better)
        history_component = min(history_months / 120, 1.0)  # 10 years max
        
        # Weighted average
        credit_health = (score_component * 0.5 + utilization_component * 0.3 + history_component * 0.2)
        
        # Convert to risk (inverse of health)
        return 1.0 - credit_health
    
    def assess_risk(self, financial_data: Dict) -> RiskAssessment:
        """
        Perform comprehensive risk assessment
        
        Args:
            financial_data: User's financial data
            
        Returns:
            Complete risk assessment
        """
        try:
            # Extract features
            features = self.extract_risk_features(financial_data)
            
            # Calculate individual risk factors
            risk_factors = []
            
            # Liquidity risk
            liquidity_risk = self._assess_liquidity_risk(features, financial_data)
            risk_factors.append(liquidity_risk)
            
            # Debt risk
            debt_risk = self._assess_debt_risk(features, financial_data)
            risk_factors.append(debt_risk)
            
            # Income risk
            income_risk = self._assess_income_risk(features, financial_data)
            risk_factors.append(income_risk)
            
            # Spending risk
            spending_risk = self._assess_spending_risk(features, financial_data)
            risk_factors.append(spending_risk)
            
            # Emergency fund risk
            emergency_fund_risk = self._assess_emergency_fund_risk(features, financial_data)
            risk_factors.append(emergency_fund_risk)
            
            # Credit risk
            credit_risk = self._assess_credit_risk(features, financial_data)
            risk_factors.append(credit_risk)
            
            # Calculate overall risk score
            overall_score = self._calculate_overall_risk_score(risk_factors)
            overall_level = self._determine_risk_level(overall_score)
            
            # Calculate emergency fund target
            emergency_fund_target = self._calculate_emergency_fund_target(financial_data)
            
            # Generate recommendations
            recommendations = self._generate_risk_recommendations(risk_factors, financial_data)
            
            return RiskAssessment(
                overall_score=overall_score,
                overall_level=overall_level,
                risk_factors=risk_factors,
                emergency_fund_target=emergency_fund_target,
                emergency_fund_current=financial_data.get('emergency_fund', 0),
                emergency_fund_months=features.get('emergency_fund_months', 0),
                debt_to_income_ratio=features.get('debt_to_income_ratio', 0),
                liquidity_ratio=features.get('liquidity_ratio', 0),
                spending_volatility=features.get('spending_volatility', 0),
                income_stability=features.get('income_consistency', 1.0),
                recommendations=recommendations,
                timestamp=datetime.now()
            )
            
        except Exception as e:
            logger.error(f"Risk assessment error: {str(e)}")
            raise
    
    def _assess_liquidity_risk(self, features: Dict, financial_data: Dict) -> RiskFactor:
        """Assess liquidity risk"""
        liquidity_ratio = features.get('liquidity_ratio', 0)
        thresholds = self.config['thresholds']['liquidity_ratio']
        
        if liquidity_ratio >= thresholds['low']:
            level = RiskLevel.LOW
            score = 20
            description = f"Good liquidity with {liquidity_ratio:.1f} months of expenses covered"
            recommendation = "Maintain current liquidity levels"
            urgency = 1
        elif liquidity_ratio >= thresholds['medium']:
            level = RiskLevel.MEDIUM
            score = 50
            description = f"Moderate liquidity with {liquidity_ratio:.1f} months of expenses covered"
            recommendation = "Consider increasing liquid savings to 6+ months of expenses"
            urgency = 2
        elif liquidity_ratio >= thresholds['high']:
            level = RiskLevel.HIGH
            score = 75
            description = f"Low liquidity with only {liquidity_ratio:.1f} months of expenses covered"
            recommendation = "Prioritize building liquid savings immediately"
            urgency = 4
        else:
            level = RiskLevel.CRITICAL
            score = 90
            description = f"Critical liquidity shortage with {liquidity_ratio:.1f} months coverage"
            recommendation = "Emergency: Build liquid savings as top priority"
            urgency = 5
        
        return RiskFactor(
            category=RiskCategory.LIQUIDITY,
            name="Liquidity Risk",
            score=score,
            level=level,
            description=description,
            impact="Ability to handle unexpected expenses",
            recommendation=recommendation,
            urgency=urgency
        )
    
    def _assess_debt_risk(self, features: Dict, financial_data: Dict) -> RiskFactor:
        """Assess debt risk"""
        debt_to_income = features.get('debt_to_income_ratio', 0)
        thresholds = self.config['thresholds']['debt_to_income']
        
        if debt_to_income <= thresholds['low']:
            level = RiskLevel.LOW
            score = 15
            description = f"Healthy debt level at {debt_to_income:.1%} of annual income"
            recommendation = "Maintain current debt management practices"
            urgency = 1
        elif debt_to_income <= thresholds['medium']:
            level = RiskLevel.MEDIUM
            score = 45
            description = f"Moderate debt burden at {debt_to_income:.1%} of annual income"
            recommendation = "Focus on paying down high-interest debt"
            urgency = 2
        elif debt_to_income <= thresholds['high']:
            level = RiskLevel.HIGH
            score = 70
            description = f"High debt burden at {debt_to_income:.1%} of annual income"
            recommendation = "Aggressive debt reduction plan needed"
            urgency = 4
        else:
            level = RiskLevel.CRITICAL
            score = 85
            description = f"Excessive debt burden at {debt_to_income:.1%} of annual income"
            recommendation = "Consider debt consolidation or professional help"
            urgency = 5
        
        return RiskFactor(
            category=RiskCategory.DEBT,
            name="Debt Risk",
            score=score,
            level=level,
            description=description,
            impact="Financial flexibility and cash flow",
            recommendation=recommendation,
            urgency=urgency
        )
    
    def _assess_income_risk(self, features: Dict, financial_data: Dict) -> RiskFactor:
        """Assess income risk"""
        income_stability = features.get('income_consistency', 1.0)
        employment_stability = features.get('employment_stability', 0.5)
        
        # Combined stability score
        combined_stability = (income_stability + employment_stability) / 2
        
        if combined_stability >= 0.8:
            level = RiskLevel.LOW
            score = 20
            description = f"Stable income with {combined_stability:.1%} consistency"
            recommendation = "Continue building diverse income sources"
            urgency = 1
        elif combined_stability >= 0.6:
            level = RiskLevel.MEDIUM
            score = 45
            description = f"Moderate income stability at {combined_stability:.1%}"
            recommendation = "Consider building emergency fund and skill development"
            urgency = 2
        elif combined_stability >= 0.4:
            level = RiskLevel.HIGH
            score = 70
            description = f"Unstable income with {combined_stability:.1%} consistency"
            recommendation = "Focus on income stabilization and emergency planning"
            urgency = 4
        else:
            level = RiskLevel.CRITICAL
            score = 85
            description = f"Very unstable income at {combined_stability:.1%} consistency"
            recommendation = "Urgent: Secure stable income source"
            urgency = 5
        
        return RiskFactor(
            category=RiskCategory.INCOME,
            name="Income Risk",
            score=score,
            level=level,
            description=description,
            impact="Ability to meet financial obligations",
            recommendation=recommendation,
            urgency=urgency
        )
    
    def _assess_spending_risk(self, features: Dict, financial_data: Dict) -> RiskFactor:
        """Assess spending risk"""
        spending_volatility = features.get('spending_volatility', 0)
        discretionary_ratio = features.get('discretionary_spending_ratio', 0.3)
        
        # Combined spending risk
        volatility_risk = min(spending_volatility / 0.4, 1.0)  # Normalize to 0-1
        discretionary_risk = max((discretionary_ratio - 0.3) / 0.3, 0)  # Risk if >30%
        
        combined_risk = (volatility_risk + discretionary_risk) / 2
        
        if combined_risk <= 0.3:
            level = RiskLevel.LOW
            score = 25
            description = f"Controlled spending with {spending_volatility:.1%} volatility"
            recommendation = "Maintain current spending discipline"
            urgency = 1
        elif combined_risk <= 0.5:
            level = RiskLevel.MEDIUM
            score = 50
            description = f"Moderate spending volatility at {spending_volatility:.1%}"
            recommendation = "Create detailed budget and track discretionary spending"
            urgency = 2
        elif combined_risk <= 0.7:
            level = RiskLevel.HIGH
            score = 75
            description = f"High spending volatility at {spending_volatility:.1%}"
            recommendation = "Implement strict budgeting and reduce discretionary expenses"
            urgency = 3
        else:
            level = RiskLevel.CRITICAL
            score = 90
            description = f"Erratic spending patterns with {spending_volatility:.1%} volatility"
            recommendation = "Emergency spending controls needed"
            urgency = 4
        
        return RiskFactor(
            category=RiskCategory.SPENDING,
            name="Spending Risk",
            score=score,
            level=level,
            description=description,
            impact="Budget control and financial planning",
            recommendation=recommendation,
            urgency=urgency
        )
    
    def _assess_emergency_fund_risk(self, features: Dict, financial_data: Dict) -> RiskFactor:
        """Assess emergency fund risk"""
        emergency_months = features.get('emergency_fund_months', 0)
        thresholds = self.config['thresholds']['emergency_fund_months']
        
        if emergency_months >= thresholds['low']:
            level = RiskLevel.LOW
            score = 10
            description = f"Adequate emergency fund covering {emergency_months:.1f} months"
            recommendation = "Maintain and grow emergency fund with inflation"
            urgency = 1
        elif emergency_months >= thresholds['medium']:
            level = RiskLevel.MEDIUM
            score = 40
            description = f"Partial emergency fund covering {emergency_months:.1f} months"
            recommendation = "Build emergency fund to 6+ months of expenses"
            urgency = 2
        elif emergency_months >= thresholds['high']:
            level = RiskLevel.HIGH
            score = 70
            description = f"Insufficient emergency fund at {emergency_months:.1f} months"
            recommendation = "Prioritize emergency fund building"
            urgency = 4
        else:
            level = RiskLevel.CRITICAL
            score = 85
            description = f"No emergency fund - {emergency_months:.1f} months coverage"
            recommendation = "Start emergency fund immediately"
            urgency = 5
        
        return RiskFactor(
            category=RiskCategory.EMERGENCY_FUND,
            name="Emergency Fund Risk",
            score=score,
            level=level,
            description=description,
            impact="Protection against financial emergencies",
            recommendation=recommendation,
            urgency=urgency
        )
    
    def _assess_credit_risk(self, features: Dict, financial_data: Dict) -> RiskFactor:
        """Assess credit risk"""
        credit_score = financial_data.get('credit_score', 650)
        credit_utilization = features.get('credit_utilization', 0.3)
        
        # Credit risk based on score and utilization
        if credit_score >= 750 and credit_utilization <= 0.1:
            level = RiskLevel.LOW
            score = 15
            description = f"Excellent credit: {credit_score} score, {credit_utilization:.1%} utilization"
            recommendation = "Maintain excellent credit habits"
            urgency = 1
        elif credit_score >= 700 and credit_utilization <= 0.3:
            level = RiskLevel.MEDIUM
            score = 35
            description = f"Good credit: {credit_score} score, {credit_utilization:.1%} utilization"
            recommendation = "Work on reducing credit utilization below 10%"
            urgency = 2
        elif credit_score >= 600:
            level = RiskLevel.HIGH
            score = 65
            description = f"Fair credit: {credit_score} score, {credit_utilization:.1%} utilization"
            recommendation = "Focus on improving credit score and reducing utilization"
            urgency = 3
        else:
            level = RiskLevel.CRITICAL
            score = 80
            description = f"Poor credit: {credit_score} score, {credit_utilization:.1%} utilization"
            recommendation = "Urgent credit repair needed"
            urgency = 4
        
        return RiskFactor(
            category=RiskCategory.CREDIT,
            name="Credit Risk",
            score=score,
            level=level,
            description=description,
            impact="Access to credit and borrowing costs",
            recommendation=recommendation,
            urgency=urgency
        )
    
    def _calculate_overall_risk_score(self, risk_factors: List[RiskFactor]) -> float:
        """Calculate weighted overall risk score"""
        weights = self.config['risk_weights']
        total_score = 0.0
        total_weight = 0.0
        
        for factor in risk_factors:
            weight = weights.get(factor.category.value, 0.1)
            total_score += factor.score * weight
            total_weight += weight
        
        return total_score / (total_weight + 1e-8)
    
    def _determine_risk_level(self, score: float) -> RiskLevel:
        """Determine risk level from score"""
        if score <= 30:
            return RiskLevel.LOW
        elif score <= 50:
            return RiskLevel.MEDIUM
        elif score <= 75:
            return RiskLevel.HIGH
        else:
            return RiskLevel.CRITICAL
    
    def _calculate_emergency_fund_target(self, financial_data: Dict) -> float:
        """Calculate optimal emergency fund target"""
        monthly_expenses = financial_data.get('monthly_expenses', 0)
        income_stability = financial_data.get('income_consistency', 0.8)
        employment_type = financial_data.get('employment_type', 'full_time')
        
        # Base target: 6 months
        base_months = 6.0
        
        # Adjust based on income stability
        if income_stability < 0.7:
            base_months += 3.0  # 9 months for unstable income
        elif income_stability < 0.8:
            base_months += 1.5  # 7.5 months
        
        # Adjust based on employment type
        employment_adjustments = {
            'freelance': 3.0,
            'contract': 2.0,
            'part_time': 1.0,
            'full_time': 0.0
        }
        
        adjustment = employment_adjustments.get(employment_type.lower(), 1.0)
        target_months = base_months + adjustment
        
        return monthly_expenses * target_months
    
    def _generate_risk_recommendations(self, risk_factors: List[RiskFactor], 
                                     financial_data: Dict) -> List[str]:
        """Generate prioritized recommendations"""
        recommendations = []
        
        # Sort by urgency and score
        sorted_factors = sorted(risk_factors, key=lambda x: (x.urgency, x.score), reverse=True)
        
        # Add top 3 most urgent recommendations
        for factor in sorted_factors[:3]:
            if factor.level in [RiskLevel.HIGH, RiskLevel.CRITICAL]:
                recommendations.append(f"{factor.category.value.title()}: {factor.recommendation}")
        
        # Add general recommendations based on overall profile
        overall_score = self._calculate_overall_risk_score(risk_factors)
        
        if overall_score > 60:
            recommendations.append("Consider consulting with a financial advisor for comprehensive planning")
        
        if financial_data.get('emergency_fund', 0) < financial_data.get('monthly_expenses', 0) * 3:
            recommendations.append("Build emergency fund to at least 3-6 months of expenses")
        
        return recommendations[:5]  # Limit to top 5 recommendations
    
    def save_model(self, filepath: str) -> bool:
        """Save risk assessment model"""
        try:
            model_data = {
                'config': self.config,
                'feature_columns': self.feature_columns,
                'is_trained': self.is_trained,
                'version': '1.0',
                'timestamp': datetime.now().isoformat()
            }
            
            joblib.dump(model_data, filepath)
            logger.info(f"Risk assessment model saved to {filepath}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving model: {str(e)}")
            return False
    
    def load_model(self, filepath: str) -> bool:
        """Load risk assessment model"""
        try:
            model_data = joblib.load(filepath)
            
            self.config = model_data['config']
            self.feature_columns = model_data['feature_columns']
            self.is_trained = model_data['is_trained']
            
            logger.info(f"Risk assessment model loaded from {filepath}")
            return True
            
        except Exception as e:
            logger.error(f"Error loading model: {str(e)}")
            return False
    
    def get_model_info(self) -> Dict:
        """Get model information"""
        return {
            'is_trained': self.is_trained,
            'feature_columns': self.feature_columns,
            'config': self.config,
            'risk_categories': [cat.value for cat in RiskCategory],
            'risk_levels': [level.value for level in RiskLevel]
        }