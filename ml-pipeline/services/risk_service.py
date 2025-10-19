"""
Risk Assessment Service
Provides comprehensive financial risk assessment and monitoring
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import json
import os
from models.risk_assessor import RiskAssessor, RiskAssessment, RiskLevel, RiskCategory
from utils.database import DatabaseManager
from utils.notifications import NotificationManager

logger = logging.getLogger(__name__)

class RiskAssessmentService:
    """
    Service for comprehensive financial risk assessment
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._get_default_config()
        self.risk_assessor = RiskAssessor(self.config.get('assessor_config'))
        self.db_manager = DatabaseManager()
        self.notification_manager = NotificationManager()
        self.is_initialized = False
        
    def _get_default_config(self) -> Dict:
        """Get default service configuration"""
        return {
            'database_url': os.getenv('DATABASE_URL', 'postgresql://localhost:5432/finbot'),
            'assessment_settings': {
                'auto_assessment_interval_days': 7,
                'risk_change_threshold': 10.0,  # Alert if risk score changes by 10+ points
                'high_risk_alert_threshold': 70.0,
                'critical_risk_alert_threshold': 85.0
            },
            'cache_settings': {
                'assessment_cache_hours': 24,
                'user_data_cache_hours': 6
            },
            'model_settings': {
                'model_path': '/app/models/risk_assessor.joblib',
                'retrain_interval_days': 30
            }
        }
    
    async def initialize(self) -> bool:
        """Initialize the risk assessment service"""
        try:
            # Initialize database manager
            if self.db_manager:
                await self.db_manager.initialize(self.config['database_url'])
                await self._create_risk_tables()
            
            # Initialize notification manager
            await self.notification_manager.initialize()
            
            # Load or initialize risk assessment model
            await self._initialize_model()
            
            self.is_initialized = True
            logger.info("Risk assessment service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Risk service initialization error: {str(e)}")
            return False
    
    async def _create_risk_tables(self) -> None:
        """Create necessary database tables for risk assessment"""
        try:
            create_queries = [
                """
                CREATE TABLE IF NOT EXISTS risk_assessments (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL,
                    overall_score DECIMAL(5,2) NOT NULL,
                    overall_level VARCHAR(20) NOT NULL,
                    risk_factors JSONB NOT NULL,
                    emergency_fund_target DECIMAL(12,2),
                    emergency_fund_current DECIMAL(12,2),
                    emergency_fund_months DECIMAL(5,2),
                    debt_to_income_ratio DECIMAL(5,4),
                    liquidity_ratio DECIMAL(5,2),
                    spending_volatility DECIMAL(5,4),
                    income_stability DECIMAL(5,4),
                    recommendations JSONB,
                    assessment_date TIMESTAMP DEFAULT NOW(),
                    created_at TIMESTAMP DEFAULT NOW()
                );
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_risk_assessments_user_id 
                ON risk_assessments(user_id);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_risk_assessments_date 
                ON risk_assessments(assessment_date);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_risk_assessments_score 
                ON risk_assessments(overall_score);
                """,
                """
                CREATE TABLE IF NOT EXISTS risk_alerts (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL,
                    risk_category VARCHAR(50) NOT NULL,
                    alert_type VARCHAR(50) NOT NULL,
                    current_score DECIMAL(5,2),
                    previous_score DECIMAL(5,2),
                    threshold_exceeded BOOLEAN DEFAULT FALSE,
                    message TEXT,
                    recommendations JSONB,
                    alert_sent BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT NOW()
                );
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_risk_alerts_user_id 
                ON risk_alerts(user_id);
                """
            ]
            
            for query in create_queries:
                await self.db_manager.execute_query(query)
            
            logger.info("Risk assessment tables created successfully")
            
        except Exception as e:
            logger.error(f"Error creating risk tables: {str(e)}")
            raise
    
    async def _initialize_model(self) -> None:
        """Initialize or load the risk assessment model"""
        try:
            model_path = self.config['model_settings']['model_path']
            
            # Try to load existing model
            if os.path.exists(model_path):
                if self.risk_assessor.load_model(model_path):
                    logger.info("Loaded existing risk assessment model")
                    return
            
            # Initialize new model (no training needed for rule-based system)
            self.risk_assessor.is_trained = True
            logger.info("Initialized new risk assessment model")
            
        except Exception as e:
            logger.error(f"Model initialization error: {str(e)}")
            raise
    
    async def assess_user_risk(self, user_id: str, force_refresh: bool = False) -> Dict:
        """
        Perform comprehensive risk assessment for a user
        
        Args:
            user_id: User identifier
            force_refresh: Force new assessment even if cached
            
        Returns:
            Risk assessment results
        """
        try:
            if not self.is_initialized:
                raise ValueError("Service not initialized")
            
            # Check for cached assessment
            if not force_refresh:
                cached_assessment = await self._get_cached_assessment(user_id)
                if cached_assessment:
                    return cached_assessment
            
            # Get user's financial data
            financial_data = await self._get_user_financial_data(user_id)
            
            if not financial_data:
                return {
                    'success': False,
                    'error': 'Insufficient financial data for assessment'
                }
            
            # Perform risk assessment
            assessment = self.risk_assessor.assess_risk(financial_data)
            
            # Store assessment in database
            await self._store_assessment(user_id, assessment)
            
            # Check for risk alerts
            await self._check_risk_alerts(user_id, assessment)
            
            # Format response
            result = {
                'success': True,
                'user_id': user_id,
                'assessment': {
                    'overall_score': assessment.overall_score,
                    'overall_level': assessment.overall_level.value,
                    'risk_factors': [
                        {
                            'category': factor.category.value,
                            'name': factor.name,
                            'score': factor.score,
                            'level': factor.level.value,
                            'description': factor.description,
                            'impact': factor.impact,
                            'recommendation': factor.recommendation,
                            'urgency': factor.urgency
                        }
                        for factor in assessment.risk_factors
                    ],
                    'emergency_fund': {
                        'target': assessment.emergency_fund_target,
                        'current': assessment.emergency_fund_current,
                        'months_coverage': assessment.emergency_fund_months,
                        'adequacy': 'adequate' if assessment.emergency_fund_months >= 6 else 'insufficient'
                    },
                    'key_metrics': {
                        'debt_to_income_ratio': assessment.debt_to_income_ratio,
                        'liquidity_ratio': assessment.liquidity_ratio,
                        'spending_volatility': assessment.spending_volatility,
                        'income_stability': assessment.income_stability
                    },
                    'recommendations': assessment.recommendations
                },
                'timestamp': assessment.timestamp.isoformat()
            }
            
            logger.info(f"Risk assessment completed for user {user_id}: {assessment.overall_score:.1f} ({assessment.overall_level.value})")
            
            return result
            
        except Exception as e:
            logger.error(f"Risk assessment error for user {user_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'user_id': user_id
            }
    
    async def _get_user_financial_data(self, user_id: str) -> Optional[Dict]:
        """Get comprehensive financial data for a user"""
        try:
            # Get basic financial profile
            profile_query = """
            SELECT 
                monthly_income,
                monthly_expenses,
                savings_balance,
                total_debt,
                monthly_debt_payments,
                emergency_fund,
                credit_score,
                credit_utilization,
                employment_type,
                employment_duration_months
            FROM user_financial_profiles 
            WHERE user_id = :user_id
            """
            
            profile_result = await self.db_manager.execute_query(
                profile_query, {'user_id': user_id}
            )
            
            if not profile_result:
                logger.warning(f"No financial profile found for user {user_id}")
                return None
            
            profile = profile_result[0]
            
            # Get transaction history (last 12 months)
            transactions_query = """
            SELECT amount, category, description, timestamp, merchant_name
            FROM transactions 
            WHERE user_id = :user_id 
                AND timestamp >= NOW() - INTERVAL '12 months'
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
            
            # Get income history
            income_query = """
            SELECT amount, income_date
            FROM user_income_history 
            WHERE user_id = :user_id 
                AND income_date >= NOW() - INTERVAL '12 months'
            ORDER BY income_date DESC
            """
            
            income_history = await self.db_manager.execute_query(
                income_query, {'user_id': user_id}
            )
            
            # Get emergency fund history
            emergency_fund_query = """
            SELECT amount, record_date
            FROM emergency_fund_history 
            WHERE user_id = :user_id 
                AND record_date >= NOW() - INTERVAL '12 months'
            ORDER BY record_date DESC
            """
            
            emergency_fund_history = await self.db_manager.execute_query(
                emergency_fund_query, {'user_id': user_id}
            )
            
            # Compile financial data
            financial_data = {
                'user_id': user_id,
                'monthly_income': float(profile.get('monthly_income', 0)),
                'monthly_expenses': float(profile.get('monthly_expenses', 0)),
                'savings_balance': float(profile.get('savings_balance', 0)),
                'total_debt': float(profile.get('total_debt', 0)),
                'monthly_debt_payments': float(profile.get('monthly_debt_payments', 0)),
                'emergency_fund': float(profile.get('emergency_fund', 0)),
                'credit_score': int(profile.get('credit_score', 650)),
                'credit_utilization': float(profile.get('credit_utilization', 0.3)),
                'employment_type': profile.get('employment_type', 'full_time'),
                'employment_duration_months': int(profile.get('employment_duration_months', 12)),
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
                'income_history': [
                    {
                        'amount': float(i['amount']),
                        'date': i['income_date'].isoformat() if i['income_date'] else None
                    }
                    for i in income_history
                ],
                'emergency_fund_history': [
                    {
                        'amount': float(e['amount']),
                        'date': e['record_date'].isoformat() if e['record_date'] else None
                    }
                    for e in emergency_fund_history
                ]
            }
            
            # Calculate derived metrics
            financial_data['liquid_assets'] = financial_data['savings_balance'] + financial_data['emergency_fund']
            financial_data['total_assets'] = financial_data['liquid_assets']  # Simplified
            financial_data['credit_history_months'] = 60  # Default assumption
            
            return financial_data
            
        except Exception as e:
            logger.error(f"Error getting financial data for user {user_id}: {str(e)}")
            return None
    
    async def _get_cached_assessment(self, user_id: str) -> Optional[Dict]:
        """Get cached risk assessment if available and fresh"""
        try:
            cache_hours = self.config['cache_settings']['assessment_cache_hours']
            cutoff_time = datetime.now() - timedelta(hours=cache_hours)
            
            query = """
            SELECT * FROM risk_assessments 
            WHERE user_id = :user_id 
                AND assessment_date >= :cutoff_time
            ORDER BY assessment_date DESC 
            LIMIT 1
            """
            
            result = await self.db_manager.execute_query(
                query, {'user_id': user_id, 'cutoff_time': cutoff_time}
            )
            
            if result:
                assessment = result[0]
                return {
                    'success': True,
                    'user_id': user_id,
                    'assessment': {
                        'overall_score': float(assessment['overall_score']),
                        'overall_level': assessment['overall_level'],
                        'risk_factors': assessment['risk_factors'],
                        'emergency_fund': {
                            'target': float(assessment['emergency_fund_target'] or 0),
                            'current': float(assessment['emergency_fund_current'] or 0),
                            'months_coverage': float(assessment['emergency_fund_months'] or 0)
                        },
                        'key_metrics': {
                            'debt_to_income_ratio': float(assessment['debt_to_income_ratio'] or 0),
                            'liquidity_ratio': float(assessment['liquidity_ratio'] or 0),
                            'spending_volatility': float(assessment['spending_volatility'] or 0),
                            'income_stability': float(assessment['income_stability'] or 1.0)
                        },
                        'recommendations': assessment['recommendations']
                    },
                    'timestamp': assessment['assessment_date'].isoformat(),
                    'cached': True
                }
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting cached assessment: {str(e)}")
            return None
    
    async def _store_assessment(self, user_id: str, assessment: RiskAssessment) -> None:
        """Store risk assessment in database"""
        try:
            insert_query = """
            INSERT INTO risk_assessments 
            (user_id, overall_score, overall_level, risk_factors, 
             emergency_fund_target, emergency_fund_current, emergency_fund_months,
             debt_to_income_ratio, liquidity_ratio, spending_volatility, 
             income_stability, recommendations, assessment_date)
            VALUES 
            (:user_id, :overall_score, :overall_level, :risk_factors,
             :emergency_fund_target, :emergency_fund_current, :emergency_fund_months,
             :debt_to_income_ratio, :liquidity_ratio, :spending_volatility,
             :income_stability, :recommendations, :assessment_date)
            """
            
            # Convert risk factors to JSON
            risk_factors_json = [
                {
                    'category': factor.category.value,
                    'name': factor.name,
                    'score': factor.score,
                    'level': factor.level.value,
                    'description': factor.description,
                    'impact': factor.impact,
                    'recommendation': factor.recommendation,
                    'urgency': factor.urgency
                }
                for factor in assessment.risk_factors
            ]
            
            params = {
                'user_id': user_id,
                'overall_score': assessment.overall_score,
                'overall_level': assessment.overall_level.value,
                'risk_factors': json.dumps(risk_factors_json),
                'emergency_fund_target': assessment.emergency_fund_target,
                'emergency_fund_current': assessment.emergency_fund_current,
                'emergency_fund_months': assessment.emergency_fund_months,
                'debt_to_income_ratio': assessment.debt_to_income_ratio,
                'liquidity_ratio': assessment.liquidity_ratio,
                'spending_volatility': assessment.spending_volatility,
                'income_stability': assessment.income_stability,
                'recommendations': json.dumps(assessment.recommendations),
                'assessment_date': assessment.timestamp
            }
            
            await self.db_manager.execute_query(insert_query, params)
            
        except Exception as e:
            logger.error(f"Error storing assessment: {str(e)}")
    
    async def _check_risk_alerts(self, user_id: str, assessment: RiskAssessment) -> None:
        """Check for risk alerts and send notifications"""
        try:
            # Get previous assessment for comparison
            previous_query = """
            SELECT overall_score, overall_level 
            FROM risk_assessments 
            WHERE user_id = :user_id 
                AND assessment_date < :current_date
            ORDER BY assessment_date DESC 
            LIMIT 1
            """
            
            previous_result = await self.db_manager.execute_query(
                previous_query, {
                    'user_id': user_id, 
                    'current_date': assessment.timestamp
                }
            )
            
            alerts_to_send = []
            
            # Check for high/critical risk levels
            if assessment.overall_score >= self.config['assessment_settings']['critical_risk_alert_threshold']:
                alerts_to_send.append({
                    'type': 'critical_risk',
                    'message': f"Critical financial risk detected (Score: {assessment.overall_score:.1f})",
                    'urgency': 'high'
                })
            elif assessment.overall_score >= self.config['assessment_settings']['high_risk_alert_threshold']:
                alerts_to_send.append({
                    'type': 'high_risk',
                    'message': f"High financial risk detected (Score: {assessment.overall_score:.1f})",
                    'urgency': 'medium'
                })
            
            # Check for significant risk score changes
            if previous_result:
                previous_score = float(previous_result[0]['overall_score'])
                score_change = assessment.overall_score - previous_score
                
                if abs(score_change) >= self.config['assessment_settings']['risk_change_threshold']:
                    direction = "increased" if score_change > 0 else "decreased"
                    alerts_to_send.append({
                        'type': 'risk_change',
                        'message': f"Risk score {direction} by {abs(score_change):.1f} points",
                        'urgency': 'medium' if score_change > 0 else 'low'
                    })
            
            # Check for specific high-risk factors
            for factor in assessment.risk_factors:
                if factor.level == RiskLevel.CRITICAL and factor.urgency >= 4:
                    alerts_to_send.append({
                        'type': 'critical_factor',
                        'message': f"Critical {factor.category.value} risk: {factor.description}",
                        'urgency': 'high',
                        'recommendation': factor.recommendation
                    })
            
            # Send alerts
            for alert in alerts_to_send:
                await self._send_risk_alert(user_id, alert, assessment)
            
        except Exception as e:
            logger.error(f"Error checking risk alerts: {str(e)}")
    
    async def _send_risk_alert(self, user_id: str, alert: Dict, assessment: RiskAssessment) -> None:
        """Send risk alert notification"""
        try:
            alert_data = {
                'user_id': user_id,
                'alert_type': 'risk_assessment',
                'alert_level': alert['urgency'],
                'title': f"🚨 Financial Risk Alert",
                'message': alert['message'],
                'risk_score': assessment.overall_score,
                'risk_level': assessment.overall_level.value,
                'recommendations': assessment.recommendations[:3],  # Top 3
                'timestamp': datetime.now().isoformat()
            }
            
            # Send notification
            await self.notification_manager.send_anomaly_alert(alert_data)
            
            # Store alert record
            await self._store_risk_alert(user_id, alert, assessment)
            
            logger.info(f"Risk alert sent to user {user_id}: {alert['type']}")
            
        except Exception as e:
            logger.error(f"Error sending risk alert: {str(e)}")
    
    async def _store_risk_alert(self, user_id: str, alert: Dict, assessment: RiskAssessment) -> None:
        """Store risk alert in database"""
        try:
            insert_query = """
            INSERT INTO risk_alerts 
            (user_id, risk_category, alert_type, current_score, message, 
             recommendations, alert_sent)
            VALUES 
            (:user_id, :risk_category, :alert_type, :current_score, :message,
             :recommendations, :alert_sent)
            """
            
            params = {
                'user_id': user_id,
                'risk_category': 'overall',
                'alert_type': alert['type'],
                'current_score': assessment.overall_score,
                'message': alert['message'],
                'recommendations': json.dumps(assessment.recommendations),
                'alert_sent': True
            }
            
            await self.db_manager.execute_query(insert_query, params)
            
        except Exception as e:
            logger.error(f"Error storing risk alert: {str(e)}")
    
    async def get_risk_history(self, user_id: str, days_back: int = 90) -> Dict:
        """
        Get risk assessment history for a user
        
        Args:
            user_id: User identifier
            days_back: Days to look back
            
        Returns:
            Risk history data
        """
        try:
            query = """
            SELECT 
                overall_score,
                overall_level,
                emergency_fund_months,
                debt_to_income_ratio,
                liquidity_ratio,
                spending_volatility,
                income_stability,
                assessment_date
            FROM risk_assessments 
            WHERE user_id = :user_id 
                AND assessment_date >= NOW() - INTERVAL ':days_back days'
            ORDER BY assessment_date ASC
            """
            
            result = await self.db_manager.execute_query(
                query, {'user_id': user_id, 'days_back': days_back}
            )
            
            if not result:
                return {
                    'success': True,
                    'user_id': user_id,
                    'history': [],
                    'summary': {
                        'total_assessments': 0,
                        'average_score': 0,
                        'trend': 'stable'
                    }
                }
            
            # Process history data
            history = []
            scores = []
            
            for record in result:
                history.append({
                    'date': record['assessment_date'].isoformat(),
                    'overall_score': float(record['overall_score']),
                    'overall_level': record['overall_level'],
                    'emergency_fund_months': float(record['emergency_fund_months'] or 0),
                    'debt_to_income_ratio': float(record['debt_to_income_ratio'] or 0),
                    'liquidity_ratio': float(record['liquidity_ratio'] or 0),
                    'spending_volatility': float(record['spending_volatility'] or 0),
                    'income_stability': float(record['income_stability'] or 1.0)
                })
                scores.append(float(record['overall_score']))
            
            # Calculate summary statistics
            avg_score = np.mean(scores)
            trend = 'stable'
            
            if len(scores) >= 2:
                # Simple trend calculation
                recent_avg = np.mean(scores[-3:]) if len(scores) >= 3 else scores[-1]
                older_avg = np.mean(scores[:-3]) if len(scores) >= 6 else scores[0]
                
                if recent_avg > older_avg + 5:
                    trend = 'improving'  # Lower scores are better
                elif recent_avg < older_avg - 5:
                    trend = 'worsening'
            
            return {
                'success': True,
                'user_id': user_id,
                'history': history,
                'summary': {
                    'total_assessments': len(history),
                    'average_score': avg_score,
                    'current_score': scores[-1] if scores else 0,
                    'trend': trend,
                    'best_score': min(scores) if scores else 0,
                    'worst_score': max(scores) if scores else 0
                }
            }
            
        except Exception as e:
            logger.error(f"Error getting risk history: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def get_risk_recommendations(self, user_id: str) -> Dict:
        """
        Get personalized risk mitigation recommendations
        
        Args:
            user_id: User identifier
            
        Returns:
            Personalized recommendations
        """
        try:
            # Get latest assessment
            latest_query = """
            SELECT risk_factors, recommendations, overall_score
            FROM risk_assessments 
            WHERE user_id = :user_id 
            ORDER BY assessment_date DESC 
            LIMIT 1
            """
            
            result = await self.db_manager.execute_query(
                latest_query, {'user_id': user_id}
            )
            
            if not result:
                return {
                    'success': False,
                    'error': 'No risk assessment found for user'
                }
            
            assessment = result[0]
            risk_factors = json.loads(assessment['risk_factors'])
            general_recommendations = json.loads(assessment['recommendations'])
            
            # Categorize recommendations by priority and category
            categorized_recommendations = {
                'immediate_actions': [],
                'short_term_goals': [],
                'long_term_planning': [],
                'emergency_preparedness': []
            }
            
            # Process risk factors for specific recommendations
            for factor in risk_factors:
                if factor['urgency'] >= 4:  # High urgency
                    categorized_recommendations['immediate_actions'].append({
                        'category': factor['category'],
                        'action': factor['recommendation'],
                        'impact': factor['impact'],
                        'urgency': factor['urgency']
                    })
                elif factor['urgency'] >= 2:
                    categorized_recommendations['short_term_goals'].append({
                        'category': factor['category'],
                        'action': factor['recommendation'],
                        'impact': factor['impact'],
                        'urgency': factor['urgency']
                    })
                else:
                    categorized_recommendations['long_term_planning'].append({
                        'category': factor['category'],
                        'action': factor['recommendation'],
                        'impact': factor['impact'],
                        'urgency': factor['urgency']
                    })
            
            # Add emergency preparedness recommendations
            emergency_fund_factor = next(
                (f for f in risk_factors if f['category'] == 'emergency_fund'), None
            )
            
            if emergency_fund_factor and emergency_fund_factor['score'] > 50:
                categorized_recommendations['emergency_preparedness'].append({
                    'category': 'emergency_fund',
                    'action': 'Build emergency fund to 6+ months of expenses',
                    'impact': 'Critical financial safety net',
                    'urgency': 5
                })
            
            return {
                'success': True,
                'user_id': user_id,
                'overall_risk_score': float(assessment['overall_score']),
                'recommendations': categorized_recommendations,
                'general_advice': general_recommendations,
                'priority_order': [
                    'immediate_actions',
                    'emergency_preparedness', 
                    'short_term_goals',
                    'long_term_planning'
                ]
            }
            
        except Exception as e:
            logger.error(f"Error getting risk recommendations: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def cleanup(self) -> None:
        """Cleanup service resources"""
        try:
            if self.db_manager:
                await self.db_manager.cleanup()
            
            if self.notification_manager:
                await self.notification_manager.cleanup()
            
            logger.info("Risk assessment service cleaned up")
            
        except Exception as e:
            logger.error(f"Cleanup error: {str(e)}")