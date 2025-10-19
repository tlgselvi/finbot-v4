"""
Anomaly Detection Service
Provides real-time anomaly detection and alerting capabilities
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import redis.asyncio as redis
import json
import os
from models.anomaly_detector import AnomalyDetector
from utils.database import DatabaseManager
from utils.notifications import NotificationManager

logger = logging.getLogger(__name__)

class AnomalyDetectionService:
    """
    Service for real-time anomaly detection and alerting
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._get_default_config()
        self.detector = AnomalyDetector(self.config.get('detector_config'))
        self.db_manager = DatabaseManager()
        self.notification_manager = NotificationManager()
        self.redis_client = None
        self.is_initialized = False
        
    def _get_default_config(self) -> Dict:
        """Get default service configuration"""
        return {
            'redis_url': os.getenv('REDIS_URL', 'redis://localhost:6379'),
            'database_url': os.getenv('DATABASE_URL', 'postgresql://localhost:5432/finbot'),
            'alert_settings': {
                'enable_real_time_alerts': True,
                'alert_delay_hours': 0,  # Immediate alerts
                'batch_processing_interval': 300,  # 5 minutes
                'max_alerts_per_hour': 10
            },
            'model_settings': {
                'retrain_interval_days': 7,
                'min_training_samples': 100,
                'model_path': '/app/models/anomaly_detector.joblib'
            },
            'cache_settings': {
                'user_history_cache_hours': 24,
                'prediction_cache_minutes': 60
            }
        }
    
    async def initialize(self) -> bool:
        """Initialize the anomaly detection service"""
        try:
            # Initialize Redis connection
            self.redis_client = redis.from_url(
                self.config['redis_url'],
                decode_responses=True
            )
            
            # Test Redis connection
            await self.redis_client.ping()
            
            # Initialize database manager
            await self.db_manager.initialize(self.config['database_url'])
            
            # Initialize notification manager
            await self.notification_manager.initialize()
            
            # Load or train anomaly detection model
            await self._initialize_model()
            
            self.is_initialized = True
            logger.info("Anomaly detection service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Service initialization error: {str(e)}")
            return False
    
    async def _initialize_model(self) -> None:
        """Initialize or load the anomaly detection model"""
        try:
            model_path = self.config['model_settings']['model_path']
            
            # Try to load existing model
            if os.path.exists(model_path):
                if self.detector.load_model(model_path):
                    logger.info("Loaded existing anomaly detection model")
                    return
            
            # Train new model if no existing model or loading failed
            logger.info("Training new anomaly detection model")
            await self._train_initial_model()
            
        except Exception as e:
            logger.error(f"Model initialization error: {str(e)}")
            raise
    
    async def _train_initial_model(self) -> None:
        """Train initial anomaly detection model"""
        try:
            # Get training data from database
            training_data = await self._get_training_data()
            
            if len(training_data) < self.config['model_settings']['min_training_samples']:
                logger.warning(f"Insufficient training data: {len(training_data)} samples")
                # Create a basic model with default parameters
                self.detector.is_trained = True
                return
            
            # Extract features and train model
            features = self.detector.extract_features(training_data, 'system')
            training_result = self.detector.train(features)
            
            # Save trained model
            model_path = self.config['model_settings']['model_path']
            os.makedirs(os.path.dirname(model_path), exist_ok=True)
            self.detector.save_model(model_path)
            
            logger.info(f"Model trained successfully: {training_result}")
            
        except Exception as e:
            logger.error(f"Model training error: {str(e)}")
            raise
    
    async def _get_training_data(self, limit: int = 10000) -> pd.DataFrame:
        """Get training data from database"""
        try:
            query = """
            SELECT 
                t.id,
                t.user_id,
                t.amount,
                t.category,
                t.description,
                t.timestamp,
                t.merchant_name
            FROM transactions t
            WHERE t.timestamp >= NOW() - INTERVAL '90 days'
            ORDER BY t.timestamp DESC
            LIMIT :limit
            """
            
            result = await self.db_manager.execute_query(query, {'limit': limit})
            
            if result:
                df = pd.DataFrame(result)
                logger.info(f"Retrieved {len(df)} training samples")
                return df
            else:
                return pd.DataFrame()
                
        except Exception as e:
            logger.error(f"Error getting training data: {str(e)}")
            return pd.DataFrame()
    
    async def detect_transaction_anomaly(self, transaction_data: Dict) -> Dict:
        """
        Detect anomaly for a single transaction
        
        Args:
            transaction_data: Transaction data dictionary
            
        Returns:
            Anomaly detection results
        """
        try:
            if not self.is_initialized:
                raise ValueError("Service not initialized")
            
            user_id = transaction_data.get('user_id')
            if not user_id:
                raise ValueError("Missing user_id in transaction data")
            
            # Get user's transaction history
            user_history = await self._get_user_history(user_id)
            
            # Perform anomaly detection
            detection_result = self.detector.detect_real_time_anomalies(
                transaction_data, user_history
            )
            
            # Cache the result
            await self._cache_detection_result(transaction_data['id'], detection_result)
            
            # Handle alerts if anomaly detected
            if detection_result.get('should_alert', False):
                await self._handle_anomaly_alert(transaction_data, detection_result)
            
            # Store detection result in database
            await self._store_detection_result(transaction_data, detection_result)
            
            return detection_result
            
        except Exception as e:
            logger.error(f"Anomaly detection error: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'transaction_id': transaction_data.get('id')
            }
    
    async def _get_user_history(self, user_id: str, days: int = 90) -> pd.DataFrame:
        """Get user's transaction history"""
        try:
            # Check cache first
            cache_key = f"user_history:{user_id}"
            cached_data = await self.redis_client.get(cache_key)
            
            if cached_data:
                data = json.loads(cached_data)
                df = pd.DataFrame(data)
                logger.debug(f"Retrieved cached history for user {user_id}")
                return df
            
            # Query database
            query = """
            SELECT 
                id, amount, category, description, timestamp, merchant_name
            FROM transactions 
            WHERE user_id = :user_id 
                AND timestamp >= NOW() - INTERVAL ':days days'
            ORDER BY timestamp ASC
            """
            
            result = await self.db_manager.execute_query(
                query, {'user_id': user_id, 'days': days}
            )
            
            if result:
                df = pd.DataFrame(result)
                
                # Cache the result
                cache_ttl = self.config['cache_settings']['user_history_cache_hours'] * 3600
                await self.redis_client.setex(
                    cache_key, cache_ttl, df.to_json(orient='records')
                )
                
                logger.debug(f"Retrieved {len(df)} transactions for user {user_id}")
                return df
            else:
                return pd.DataFrame()
                
        except Exception as e:
            logger.error(f"Error getting user history: {str(e)}")
            return pd.DataFrame()
    
    async def _cache_detection_result(self, transaction_id: str, result: Dict) -> None:
        """Cache detection result"""
        try:
            cache_key = f"anomaly_result:{transaction_id}"
            cache_ttl = self.config['cache_settings']['prediction_cache_minutes'] * 60
            
            await self.redis_client.setex(
                cache_key, cache_ttl, json.dumps(result)
            )
            
        except Exception as e:
            logger.error(f"Error caching detection result: {str(e)}")
    
    async def _handle_anomaly_alert(self, transaction_data: Dict, 
                                  detection_result: Dict) -> None:
        """Handle anomaly alert notification"""
        try:
            user_id = transaction_data['user_id']
            alert_level = detection_result.get('alert_level', 'medium')
            
            # Check rate limiting
            if not await self._check_alert_rate_limit(user_id):
                logger.info(f"Alert rate limit exceeded for user {user_id}")
                return
            
            # Create alert message
            alert_data = {
                'user_id': user_id,
                'transaction_id': transaction_data['id'],
                'alert_type': 'anomaly_detection',
                'alert_level': alert_level,
                'title': 'Unusual Transaction Detected',
                'message': self._create_alert_message(transaction_data, detection_result),
                'anomaly_score': detection_result.get('anomaly_score', 0),
                'confidence': detection_result.get('confidence', 0),
                'explanation': detection_result.get('explanation', {}),
                'timestamp': datetime.now().isoformat()
            }
            
            # Send notification
            await self.notification_manager.send_anomaly_alert(alert_data)
            
            # Update rate limiting counter
            await self._update_alert_rate_limit(user_id)
            
            logger.info(f"Anomaly alert sent for transaction {transaction_data['id']}")
            
        except Exception as e:
            logger.error(f"Error handling anomaly alert: {str(e)}")
    
    def _create_alert_message(self, transaction_data: Dict, 
                            detection_result: Dict) -> str:
        """Create human-readable alert message"""
        
        amount = abs(transaction_data['amount'])
        category = transaction_data.get('category', 'Unknown')
        merchant = transaction_data.get('merchant_name', 'Unknown merchant')
        
        explanation = detection_result.get('explanation', {})
        reasons = explanation.get('reasons', [])
        
        message = f"We detected an unusual transaction of ${amount:.2f} "
        message += f"in {category} category at {merchant}. "
        
        if reasons:
            message += f"Reason: {reasons[0]}. "
        
        message += "Please verify this transaction is legitimate."
        
        return message
    
    async def _check_alert_rate_limit(self, user_id: str) -> bool:
        """Check if user has exceeded alert rate limit"""
        try:
            rate_limit_key = f"alert_rate_limit:{user_id}"
            current_count = await self.redis_client.get(rate_limit_key)
            
            max_alerts = self.config['alert_settings']['max_alerts_per_hour']
            
            if current_count and int(current_count) >= max_alerts:
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error checking alert rate limit: {str(e)}")
            return True  # Allow alert on error
    
    async def _update_alert_rate_limit(self, user_id: str) -> None:
        """Update alert rate limit counter"""
        try:
            rate_limit_key = f"alert_rate_limit:{user_id}"
            
            # Increment counter with 1 hour expiry
            await self.redis_client.incr(rate_limit_key)
            await self.redis_client.expire(rate_limit_key, 3600)  # 1 hour
            
        except Exception as e:
            logger.error(f"Error updating alert rate limit: {str(e)}")
    
    async def _store_detection_result(self, transaction_data: Dict, 
                                    detection_result: Dict) -> None:
        """Store detection result in database"""
        try:
            insert_query = """
            INSERT INTO anomaly_detections 
            (transaction_id, user_id, is_anomaly, anomaly_score, confidence, 
             alert_level, explanation, detection_timestamp)
            VALUES 
            (:transaction_id, :user_id, :is_anomaly, :anomaly_score, :confidence,
             :alert_level, :explanation, :detection_timestamp)
            """
            
            params = {
                'transaction_id': transaction_data['id'],
                'user_id': transaction_data['user_id'],
                'is_anomaly': detection_result.get('is_anomaly', False),
                'anomaly_score': detection_result.get('anomaly_score', 0),
                'confidence': detection_result.get('confidence', 0),
                'alert_level': detection_result.get('alert_level', 'low'),
                'explanation': json.dumps(detection_result.get('explanation', {})),
                'detection_timestamp': datetime.now()
            }
            
            await self.db_manager.execute_query(insert_query, params)
            
        except Exception as e:
            logger.error(f"Error storing detection result: {str(e)}")
    
    async def batch_detect_anomalies(self, user_id: Optional[str] = None, 
                                   hours_back: int = 24) -> Dict:
        """
        Batch process anomaly detection for recent transactions
        
        Args:
            user_id: Specific user ID or None for all users
            hours_back: Hours to look back for transactions
            
        Returns:
            Batch processing results
        """
        try:
            # Get recent transactions
            transactions = await self._get_recent_transactions(user_id, hours_back)
            
            if len(transactions) == 0:
                return {
                    'success': True,
                    'processed': 0,
                    'anomalies_detected': 0
                }
            
            results = []
            anomaly_count = 0
            
            # Process each transaction
            for _, transaction in transactions.iterrows():
                transaction_dict = transaction.to_dict()
                
                # Skip if already processed
                if await self._is_already_processed(transaction_dict['id']):
                    continue
                
                # Detect anomaly
                detection_result = await self.detect_transaction_anomaly(transaction_dict)
                
                if detection_result.get('is_anomaly', False):
                    anomaly_count += 1
                
                results.append({
                    'transaction_id': transaction_dict['id'],
                    'is_anomaly': detection_result.get('is_anomaly', False),
                    'anomaly_score': detection_result.get('anomaly_score', 0)
                })
            
            logger.info(f"Batch processed {len(results)} transactions, "
                       f"found {anomaly_count} anomalies")
            
            return {
                'success': True,
                'processed': len(results),
                'anomalies_detected': anomaly_count,
                'results': results
            }
            
        except Exception as e:
            logger.error(f"Batch anomaly detection error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _get_recent_transactions(self, user_id: Optional[str], 
                                     hours_back: int) -> pd.DataFrame:
        """Get recent transactions for batch processing"""
        try:
            base_query = """
            SELECT id, user_id, amount, category, description, 
                   timestamp, merchant_name
            FROM transactions 
            WHERE timestamp >= NOW() - INTERVAL ':hours_back hours'
            """
            
            if user_id:
                query = base_query + " AND user_id = :user_id"
                params = {'hours_back': hours_back, 'user_id': user_id}
            else:
                query = base_query
                params = {'hours_back': hours_back}
            
            query += " ORDER BY timestamp DESC"
            
            result = await self.db_manager.execute_query(query, params)
            
            if result:
                return pd.DataFrame(result)
            else:
                return pd.DataFrame()
                
        except Exception as e:
            logger.error(f"Error getting recent transactions: {str(e)}")
            return pd.DataFrame()
    
    async def _is_already_processed(self, transaction_id: str) -> bool:
        """Check if transaction has already been processed"""
        try:
            query = """
            SELECT 1 FROM anomaly_detections 
            WHERE transaction_id = :transaction_id
            """
            
            result = await self.db_manager.execute_query(
                query, {'transaction_id': transaction_id}
            )
            
            return len(result) > 0 if result else False
            
        except Exception as e:
            logger.error(f"Error checking if processed: {str(e)}")
            return False
    
    async def retrain_model(self, user_id: Optional[str] = None) -> Dict:
        """
        Retrain the anomaly detection model
        
        Args:
            user_id: Specific user ID or None for global model
            
        Returns:
            Retraining results
        """
        try:
            logger.info("Starting model retraining")
            
            # Get fresh training data
            training_data = await self._get_training_data(limit=50000)
            
            if len(training_data) < self.config['model_settings']['min_training_samples']:
                return {
                    'success': False,
                    'error': f'Insufficient training data: {len(training_data)} samples'
                }
            
            # Create new detector instance
            new_detector = AnomalyDetector(self.config.get('detector_config'))
            
            # Extract features and train
            features = new_detector.extract_features(training_data, 'system')
            training_result = new_detector.train(features)
            
            # Save new model
            model_path = self.config['model_settings']['model_path']
            backup_path = f"{model_path}.backup"
            
            # Backup current model
            if os.path.exists(model_path):
                os.rename(model_path, backup_path)
            
            # Save new model
            if new_detector.save_model(model_path):
                # Replace current detector
                self.detector = new_detector
                
                # Remove backup
                if os.path.exists(backup_path):
                    os.remove(backup_path)
                
                logger.info("Model retrained successfully")
                return {
                    'success': True,
                    'training_samples': len(training_data),
                    'metrics': training_result.get('metrics', {}),
                    'timestamp': datetime.now().isoformat()
                }
            else:
                # Restore backup on failure
                if os.path.exists(backup_path):
                    os.rename(backup_path, model_path)
                
                return {
                    'success': False,
                    'error': 'Failed to save new model'
                }
                
        except Exception as e:
            logger.error(f"Model retraining error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def get_anomaly_statistics(self, user_id: str, 
                                   days_back: int = 30) -> Dict:
        """
        Get anomaly detection statistics for a user
        
        Args:
            user_id: User identifier
            days_back: Days to look back
            
        Returns:
            Anomaly statistics
        """
        try:
            query = """
            SELECT 
                COUNT(*) as total_detections,
                SUM(CASE WHEN is_anomaly THEN 1 ELSE 0 END) as anomaly_count,
                AVG(anomaly_score) as avg_anomaly_score,
                MAX(anomaly_score) as max_anomaly_score,
                COUNT(DISTINCT DATE(detection_timestamp)) as active_days
            FROM anomaly_detections 
            WHERE user_id = :user_id 
                AND detection_timestamp >= NOW() - INTERVAL ':days_back days'
            """
            
            result = await self.db_manager.execute_query(
                query, {'user_id': user_id, 'days_back': days_back}
            )
            
            if result and len(result) > 0:
                stats = result[0]
                
                # Calculate anomaly rate
                total = stats.get('total_detections', 0)
                anomalies = stats.get('anomaly_count', 0)
                anomaly_rate = (anomalies / total) if total > 0 else 0
                
                return {
                    'success': True,
                    'user_id': user_id,
                    'period_days': days_back,
                    'total_transactions_analyzed': total,
                    'anomalies_detected': anomalies,
                    'anomaly_rate': anomaly_rate,
                    'average_anomaly_score': float(stats.get('avg_anomaly_score', 0) or 0),
                    'max_anomaly_score': float(stats.get('max_anomaly_score', 0) or 0),
                    'active_days': stats.get('active_days', 0)
                }
            else:
                return {
                    'success': True,
                    'user_id': user_id,
                    'period_days': days_back,
                    'total_transactions_analyzed': 0,
                    'anomalies_detected': 0,
                    'anomaly_rate': 0,
                    'average_anomaly_score': 0,
                    'max_anomaly_score': 0,
                    'active_days': 0
                }
                
        except Exception as e:
            logger.error(f"Error getting anomaly statistics: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def cleanup(self) -> None:
        """Cleanup service resources"""
        try:
            if self.redis_client:
                await self.redis_client.close()
            
            if self.db_manager:
                await self.db_manager.cleanup()
            
            logger.info("Anomaly detection service cleaned up")
            
        except Exception as e:
            logger.error(f"Cleanup error: {str(e)}")