"""
Insight Generation Service
Provides intelligent financial insights and recommendations
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import json
import os
from models.insight_generator import InsightGenerator, FinancialInsight, InsightType, InsightPriority
from utils.database import DatabaseManager

# Mock notification manager for now
class NotificationManager:
    async def initialize(self):
        return True
    
    async def send_insight_notification(self, data):
        logger.info(f"Insight notification: {data.get('title', 'No title')}")
    
    async def cleanup(self):
        pass

logger = logging.getLogger(__name__)

class InsightGenerationService:
    """
    Service for generating and managing financial insights
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._get_default_config()
        self.insight_generator = InsightGenerator(self.config.get('generator_config'))
        self.db_manager = DatabaseManager()
        self.notification_manager = NotificationManager()
        self.is_initialized = False
        
    def _get_default_config(self) -> Dict:
        """Get default service configuration"""
        return {
            'database_url': os.getenv('DATABASE_URL', 'postgresql://localhost:5432/finbot'),
            'insight_settings': {
                'auto_generation_interval_hours': 24,
                'max_insights_per_user': 10,
                'insight_retention_days': 30,
                'notification_threshold': 'medium'  # minimum priority for notifications
            },
            'cache_settings': {
                'insight_cache_hours': 6,
                'user_data_cache_hours': 2
            }
        }
    
    async def initialize(self) -> bool:
        """Initialize the insight generation service"""
        try:
            # Initialize database manager
            if self.db_manager:
                await self.db_manager.initialize(self.config['database_url'])
                await self._create_insight_tables()
            
            # Initialize notification manager
            await self.notification_manager.initialize()
            
            self.is_initialized = True
            logger.info("Insight generation service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Insight service initialization error: {str(e)}")
            return False
    
    async def _create_insight_tables(self) -> None:
        """Create necessary database tables for insights"""
        try:
            create_queries = [
                """
                CREATE TABLE IF NOT EXISTS financial_insights (
                    id VARCHAR(255) PRIMARY KEY,
                    user_id UUID NOT NULL,
                    type VARCHAR(50) NOT NULL,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    priority VARCHAR(20) NOT NULL,
                    confidence DECIMAL(3,2),
                    impact_score DECIMAL(5,2),
                    actionable BOOLEAN DEFAULT TRUE,
                    recommendations JSONB,
                    data_points JSONB,
                    category VARCHAR(50),
                    tags JSONB,
                    valid_until TIMESTAMP,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_financial_insights_user_id 
                ON financial_insights(user_id);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_financial_insights_type 
                ON financial_insights(type);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_financial_insights_priority 
                ON financial_insights(priority);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_financial_insights_created_at 
                ON financial_insights(created_at);
                """,
                """
                CREATE TABLE IF NOT EXISTS insight_interactions (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    insight_id VARCHAR(255) NOT NULL REFERENCES financial_insights(id),
                    user_id UUID NOT NULL,
                    interaction_type VARCHAR(50) NOT NULL,
                    interaction_data JSONB,
                    created_at TIMESTAMP DEFAULT NOW()
                );
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_insight_interactions_insight_id 
                ON insight_interactions(insight_id);
                """,
                """
                CREATE INDEX IF NOT EXISTS idx_insight_interactions_user_id 
                ON insight_interactions(user_id);
                """
            ]
            
            for query in create_queries:
                await self.db_manager.execute_query(query)
            
            logger.info("Insight tables created successfully")
            
        except Exception as e:
            logger.error(f"Error creating insight tables: {str(e)}")
            raise
    
    async def generate_user_insights(self, user_id: str, 
                                   force_refresh: bool = False) -> Dict:
        """
        Generate comprehensive insights for a user
        
        Args:
            user_id: User identifier
            force_refresh: Force new generation even if cached
            
        Returns:
            Generated insights and metadata
        """
        try:
            if not self.is_initialized:
                raise ValueError("Service not initialized")
            
            # Check for cached insights
            if not force_refresh:
                cached_insights = await self._get_cached_insights(user_id)
                if cached_insights:
                    return cached_insights
            
            # Get user's financial data
            financial_data = await self._get_user_financial_data(user_id)
            user_preferences = await self._get_user_preferences(user_id)
            
            if not financial_data:
                return {
                    'success': False,
                    'error': 'Insufficient financial data for insight generation'
                }
            
            # Generate insights
            insights = self.insight_generator.generate_insights(
                financial_data, user_preferences
            )
            
            # Store insights in database
            await self._store_insights(user_id, insights)
            
            # Send notifications for high-priority insights
            await self._handle_insight_notifications(user_id, insights)
            
            # Format response
            result = {
                'success': True,
                'user_id': user_id,
                'insights': [
                    {
                        'id': insight.id,
                        'type': insight.type.value,
                        'title': insight.title,
                        'description': insight.description,
                        'priority': insight.priority.value,
                        'confidence': insight.confidence,
                        'impact_score': insight.impact_score,
                        'actionable': insight.actionable,
                        'recommendations': insight.recommendations,
                        'data_points': insight.data_points,
                        'category': insight.category,
                        'tags': insight.tags or [],
                        'valid_until': insight.valid_until.isoformat() if insight.valid_until else None,
                        'created_at': insight.timestamp.isoformat()
                    }
                    for insight in insights
                ],
                'summary': self.insight_generator.get_insight_summary(insights),
                'personalized_recommendations': self.insight_generator.generate_personalized_recommendations(
                    insights, financial_data
                ),
                'timestamp': datetime.now().isoformat()
            }
            
            logger.info(f"Generated {len(insights)} insights for user {user_id}")
            return result
            
        except Exception as e:
            logger.error(f"Insight generation error for user {user_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'user_id': user_id
            }
    
    async def _get_user_financial_data(self, user_id: str) -> Optional[Dict]:
        """Get comprehensive financial data for insight generation"""
        try:
            # Get basic financial profile
            profile_query = """
            SELECT 
                monthly_income,
                monthly_expenses,
                savings_balance,
                total_debt,
                emergency_fund,
                savings_rate
            FROM user_financial_profiles 
            WHERE user_id = :user_id
            """
            
            profile_result = await self.db_manager.execute_query(
                profile_query, {'user_id': user_id}
            )
            
            if not profile_result:
                return None
            
            profile = profile_result[0]
            
            # Get recent transactions (last 6 months)
            transactions_query = """
            SELECT amount, category, description, timestamp, merchant_name
            FROM transactions 
            WHERE user_id = :user_id 
                AND timestamp >= NOW() - INTERVAL '6 months'
            ORDER BY timestamp DESC
            """
            
            transactions = await self.db_manager.execute_query(
                transactions_query, {'user_id': user_id}
            )
            
            # Get budget data
            budget_query = """
            SELECT category, budget_amount
            FROM user_budgets 
            WHERE user_id = :user_id AND is_active = true
            """
            
            budgets = await self.db_manager.execute_query(
                budget_query, {'user_id': user_id}
            )
            
            budget_data = {}
            for budget in budgets:
                budget_data[budget['category']] = float(budget['budget_amount'])
            
            # Get financial goals
            goals_query = """
            SELECT id, name, type, target_amount, current_amount, target_date
            FROM financial_goals 
            WHERE user_id = :user_id AND status = 'active'
            """
            
            goals = await self.db_manager.execute_query(
                goals_query, {'user_id': user_id}
            )
            
            # Get peer comparison data (if available)
            peer_query = """
            SELECT average_spending, average_savings_rate
            FROM peer_comparison_data 
            WHERE demographic_group = (
                SELECT demographic_group FROM users WHERE id = :user_id
            )
            """
            
            peer_data = await self.db_manager.execute_query(
                peer_query, {'user_id': user_id}
            )
            
            # Compile financial data
            financial_data = {
                'user_id': user_id,
                'monthly_income': float(profile.get('monthly_income', 0)),
                'monthly_expenses': float(profile.get('monthly_expenses', 0)),
                'savings_balance': float(profile.get('savings_balance', 0)),
                'total_debt': float(profile.get('total_debt', 0)),
                'emergency_fund': float(profile.get('emergency_fund', 0)),
                'savings_rate': float(profile.get('savings_rate', 0)),
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
                'budget': budget_data,
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
            
            # Add peer comparison if available
            if peer_data:
                financial_data['peer_comparison'] = {
                    'average_spending': float(peer_data[0]['average_spending']),
                    'average_savings_rate': float(peer_data[0]['average_savings_rate'])
                }
            
            return financial_data
            
        except Exception as e:
            logger.error(f"Error getting financial data for user {user_id}: {str(e)}")
            return None
    
    async def _get_user_preferences(self, user_id: str) -> Optional[Dict]:
        """Get user preferences for insight generation"""
        try:
            query = """
            SELECT insight_preferences
            FROM user_preferences 
            WHERE user_id = :user_id
            """
            
            result = await self.db_manager.execute_query(
                query, {'user_id': user_id}
            )
            
            if result and result[0]['insight_preferences']:
                return json.loads(result[0]['insight_preferences'])
            
            return {}
            
        except Exception as e:
            logger.error(f"Error getting user preferences: {str(e)}")
            return {}
    
    async def _get_cached_insights(self, user_id: str) -> Optional[Dict]:
        """Get cached insights if available and fresh"""
        try:
            cache_hours = self.config['cache_settings']['insight_cache_hours']
            cutoff_time = datetime.now() - timedelta(hours=cache_hours)
            
            query = """
            SELECT * FROM financial_insights 
            WHERE user_id = :user_id 
                AND created_at >= :cutoff_time
                AND (valid_until IS NULL OR valid_until > NOW())
            ORDER BY priority DESC, impact_score DESC, created_at DESC
            """
            
            result = await self.db_manager.execute_query(
                query, {'user_id': user_id, 'cutoff_time': cutoff_time}
            )
            
            if result:
                insights = []
                for row in result:
                    insights.append({
                        'id': row['id'],
                        'type': row['type'],
                        'title': row['title'],
                        'description': row['description'],
                        'priority': row['priority'],
                        'confidence': float(row['confidence']),
                        'impact_score': float(row['impact_score']),
                        'actionable': row['actionable'],
                        'recommendations': row['recommendations'],
                        'data_points': row['data_points'],
                        'category': row['category'],
                        'tags': row['tags'] or [],
                        'valid_until': row['valid_until'].isoformat() if row['valid_until'] else None,
                        'created_at': row['created_at'].isoformat()
                    })
                
                return {
                    'success': True,
                    'user_id': user_id,
                    'insights': insights,
                    'timestamp': datetime.now().isoformat(),
                    'cached': True
                }
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting cached insights: {str(e)}")
            return None
    
    async def _store_insights(self, user_id: str, insights: List[FinancialInsight]) -> None:
        """Store generated insights in database"""
        try:
            # First, mark old insights as expired
            expire_query = """
            UPDATE financial_insights 
            SET valid_until = NOW() 
            WHERE user_id = :user_id 
                AND (valid_until IS NULL OR valid_until > NOW())
            """
            
            await self.db_manager.execute_query(expire_query, {'user_id': user_id})
            
            # Insert new insights
            for insight in insights:
                insert_query = """
                INSERT INTO financial_insights 
                (id, user_id, type, title, description, priority, confidence, 
                 impact_score, actionable, recommendations, data_points, 
                 category, tags, valid_until, created_at)
                VALUES 
                (:id, :user_id, :type, :title, :description, :priority, :confidence,
                 :impact_score, :actionable, :recommendations, :data_points,
                 :category, :tags, :valid_until, :created_at)
                """
                
                params = {
                    'id': insight.id,
                    'user_id': user_id,
                    'type': insight.type.value,
                    'title': insight.title,
                    'description': insight.description,
                    'priority': insight.priority.value,
                    'confidence': insight.confidence,
                    'impact_score': insight.impact_score,
                    'actionable': insight.actionable,
                    'recommendations': json.dumps(insight.recommendations),
                    'data_points': json.dumps(insight.data_points),
                    'category': insight.category,
                    'tags': json.dumps(insight.tags or []),
                    'valid_until': insight.valid_until,
                    'created_at': insight.timestamp
                }
                
                await self.db_manager.execute_query(insert_query, params)
            
        except Exception as e:
            logger.error(f"Error storing insights: {str(e)}")
    
    async def _handle_insight_notifications(self, user_id: str, 
                                          insights: List[FinancialInsight]) -> None:
        """Handle notifications for high-priority insights"""
        try:
            notification_threshold = self.config['insight_settings']['notification_threshold']
            priority_order = ['low', 'medium', 'high', 'critical']
            min_priority_index = priority_order.index(notification_threshold)
            
            high_priority_insights = [
                insight for insight in insights 
                if priority_order.index(insight.priority.value) >= min_priority_index
            ]
            
            if not high_priority_insights:
                return
            
            # Create notification for top insight
            top_insight = high_priority_insights[0]
            
            notification_data = {
                'user_id': user_id,
                'alert_type': 'financial_insight',
                'alert_level': top_insight.priority.value,
                'title': f"💡 {top_insight.title}",
                'message': top_insight.description,
                'insight_type': top_insight.type.value,
                'recommendations': top_insight.recommendations[:3],  # Top 3
                'actionable': top_insight.actionable,
                'timestamp': datetime.now().isoformat()
            }
            
            await self.notification_manager.send_anomaly_alert(notification_data)
            
            logger.info(f"Insight notification sent to user {user_id}: {top_insight.title}")
            
        except Exception as e:
            logger.error(f"Error handling insight notifications: {str(e)}")
    
    async def get_user_insights(self, user_id: str, 
                              insight_type: Optional[str] = None,
                              priority: Optional[str] = None,
                              limit: int = 10) -> Dict:
        """
        Get stored insights for a user with filtering
        
        Args:
            user_id: User identifier
            insight_type: Filter by insight type
            priority: Filter by priority level
            limit: Maximum number of insights to return
            
        Returns:
            Filtered insights
        """
        try:
            # Build query with filters
            where_conditions = ["user_id = :user_id", "(valid_until IS NULL OR valid_until > NOW())"]
            params = {'user_id': user_id}
            
            if insight_type:
                where_conditions.append("type = :insight_type")
                params['insight_type'] = insight_type
            
            if priority:
                where_conditions.append("priority = :priority")
                params['priority'] = priority
            
            query = f"""
            SELECT * FROM financial_insights 
            WHERE {' AND '.join(where_conditions)}
            ORDER BY priority DESC, impact_score DESC, created_at DESC
            LIMIT :limit
            """
            params['limit'] = limit
            
            result = await self.db_manager.execute_query(query, params)
            
            insights = []
            for row in result:
                insights.append({
                    'id': row['id'],
                    'type': row['type'],
                    'title': row['title'],
                    'description': row['description'],
                    'priority': row['priority'],
                    'confidence': float(row['confidence']),
                    'impact_score': float(row['impact_score']),
                    'actionable': row['actionable'],
                    'recommendations': row['recommendations'],
                    'data_points': row['data_points'],
                    'category': row['category'],
                    'tags': row['tags'] or [],
                    'valid_until': row['valid_until'].isoformat() if row['valid_until'] else None,
                    'created_at': row['created_at'].isoformat()
                })
            
            return {
                'success': True,
                'user_id': user_id,
                'insights': insights,
                'filters': {
                    'type': insight_type,
                    'priority': priority,
                    'limit': limit
                },
                'total_count': len(insights)
            }
            
        except Exception as e:
            logger.error(f"Error getting user insights: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def record_insight_interaction(self, insight_id: str, user_id: str,
                                       interaction_type: str, 
                                       interaction_data: Optional[Dict] = None) -> Dict:
        """
        Record user interaction with an insight
        
        Args:
            insight_id: Insight identifier
            user_id: User identifier
            interaction_type: Type of interaction (viewed, dismissed, acted_upon, etc.)
            interaction_data: Additional interaction data
            
        Returns:
            Interaction recording result
        """
        try:
            insert_query = """
            INSERT INTO insight_interactions 
            (insight_id, user_id, interaction_type, interaction_data)
            VALUES 
            (:insight_id, :user_id, :interaction_type, :interaction_data)
            """
            
            params = {
                'insight_id': insight_id,
                'user_id': user_id,
                'interaction_type': interaction_type,
                'interaction_data': json.dumps(interaction_data or {})
            }
            
            await self.db_manager.execute_query(insert_query, params)
            
            return {
                'success': True,
                'insight_id': insight_id,
                'interaction_type': interaction_type
            }
            
        except Exception as e:
            logger.error(f"Error recording insight interaction: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def get_insight_analytics(self, user_id: Optional[str] = None,
                                  days_back: int = 30) -> Dict:
        """
        Get analytics on insight generation and user interactions
        
        Args:
            user_id: Specific user or None for all users
            days_back: Days to look back
            
        Returns:
            Insight analytics
        """
        try:
            # Base query conditions
            where_conditions = ["created_at >= NOW() - INTERVAL ':days_back days'"]
            params = {'days_back': days_back}
            
            if user_id:
                where_conditions.append("user_id = :user_id")
                params['user_id'] = user_id
            
            # Get insight statistics
            stats_query = f"""
            SELECT 
                COUNT(*) as total_insights,
                AVG(confidence) as avg_confidence,
                AVG(impact_score) as avg_impact,
                COUNT(CASE WHEN actionable THEN 1 END) as actionable_count,
                type,
                priority
            FROM financial_insights 
            WHERE {' AND '.join(where_conditions)}
            GROUP BY type, priority
            """
            
            stats_result = await self.db_manager.execute_query(stats_query, params)
            
            # Get interaction statistics
            interaction_query = f"""
            SELECT 
                interaction_type,
                COUNT(*) as interaction_count
            FROM insight_interactions ii
            JOIN financial_insights fi ON ii.insight_id = fi.id
            WHERE fi.created_at >= NOW() - INTERVAL ':days_back days'
            {f"AND ii.user_id = :user_id" if user_id else ""}
            GROUP BY interaction_type
            """
            
            interaction_result = await self.db_manager.execute_query(interaction_query, params)
            
            # Process results
            type_stats = {}
            priority_stats = {}
            total_insights = 0
            total_confidence = 0
            total_impact = 0
            actionable_total = 0
            
            for row in stats_result:
                insight_type = row['type']
                priority = row['priority']
                count = row['total_insights']
                
                total_insights += count
                total_confidence += float(row['avg_confidence']) * count
                total_impact += float(row['avg_impact']) * count
                actionable_total += row['actionable_count']
                
                if insight_type not in type_stats:
                    type_stats[insight_type] = 0
                type_stats[insight_type] += count
                
                if priority not in priority_stats:
                    priority_stats[priority] = 0
                priority_stats[priority] += count
            
            interaction_stats = {}
            for row in interaction_result:
                interaction_stats[row['interaction_type']] = row['interaction_count']
            
            return {
                'success': True,
                'period_days': days_back,
                'user_id': user_id,
                'insight_statistics': {
                    'total_insights': total_insights,
                    'average_confidence': total_confidence / total_insights if total_insights > 0 else 0,
                    'average_impact': total_impact / total_insights if total_insights > 0 else 0,
                    'actionable_percentage': (actionable_total / total_insights * 100) if total_insights > 0 else 0,
                    'by_type': type_stats,
                    'by_priority': priority_stats
                },
                'interaction_statistics': interaction_stats,
                'engagement_rate': sum(interaction_stats.values()) / total_insights if total_insights > 0 else 0
            }
            
        except Exception as e:
            logger.error(f"Error getting insight analytics: {str(e)}")
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
            
            logger.info("Insight generation service cleaned up")
            
        except Exception as e:
            logger.error(f"Cleanup error: {str(e)}")