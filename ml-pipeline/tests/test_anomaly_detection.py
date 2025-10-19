"""
Tests for Anomaly Detection System
"""

import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
import asyncio
from unittest.mock import Mock, AsyncMock, patch

# Import components to test
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from models.anomaly_detector import AnomalyDetector
from services.anomaly_service import AnomalyDetectionService

class TestAnomalyDetector:
    """Test cases for AnomalyDetector class"""
    
    def setup_method(self):
        """Setup test fixtures"""
        self.detector = AnomalyDetector()
        
        # Create sample transaction data
        self.sample_transactions = pd.DataFrame([
            {
                'id': '1',
                'amount': -50.0,
                'category': 'Food',
                'description': 'Restaurant',
                'timestamp': datetime.now() - timedelta(days=30),
                'merchant_name': 'Test Restaurant'
            },
            {
                'id': '2',
                'amount': -25.0,
                'category': 'Food',
                'description': 'Grocery',
                'timestamp': datetime.now() - timedelta(days=29),
                'merchant_name': 'Test Grocery'
            },
            {
                'id': '3',
                'amount': -100.0,
                'category': 'Transport',
                'description': 'Gas',
                'timestamp': datetime.now() - timedelta(days=28),
                'merchant_name': 'Gas Station'
            },
            {
                'id': '4',
                'amount': -500.0,  # Anomalous amount
                'category': 'Food',
                'description': 'Expensive Restaurant',
                'timestamp': datetime.now() - timedelta(days=1),
                'merchant_name': 'Luxury Restaurant'
            }
        ])
    
    def test_feature_extraction(self):
        """Test feature extraction from transactions"""
        features = self.detector.extract_features(self.sample_transactions, 'test_user')
        
        assert isinstance(features, pd.DataFrame)
        assert len(features) == len(self.sample_transactions)
        assert 'amount' in features.columns
        assert 'amount_log' in features.columns
        assert 'is_debit' in features.columns
        assert 'hour' in features.columns
        assert 'day_of_week' in features.columns
    
    def test_amount_features(self):
        """Test amount-based feature extraction"""
        features = self.detector.extract_features(self.sample_transactions, 'test_user')
        
        # Check that amount features are calculated correctly
        last_transaction_features = features.iloc[-1]
        
        # The last transaction (500) should have high amount_vs_mean
        assert last_transaction_features['amount_vs_mean'] > 2.0
        assert last_transaction_features['amount'] == 500.0
        assert last_transaction_features['is_debit'] == 1
    
    def test_temporal_features(self):
        """Test temporal feature extraction"""
        features = self.detector.extract_features(self.sample_transactions, 'test_user')
        
        # Check temporal features exist
        assert 'transactions_last_1d' in features.columns
        assert 'transactions_last_7d' in features.columns
        assert 'transactions_last_30d' in features.columns
        assert 'hours_since_last_transaction' in features.columns
    
    def test_category_features(self):
        """Test category-based feature extraction"""
        features = self.detector.extract_features(self.sample_transactions, 'test_user')
        
        # Check category features
        assert 'category_frequency' in features.columns
        assert 'amount_vs_category_mean' in features.columns
        assert 'hours_since_last_category' in features.columns
        
        # Last transaction should have category frequency > 0 (Food category appears multiple times)
        last_features = features.iloc[-1]
        assert last_features['category_frequency'] > 0
    
    def test_model_training(self):
        """Test model training process"""
        features = self.detector.extract_features(self.sample_transactions, 'test_user')
        
        # Train the model
        training_result = self.detector.train(features)
        
        assert training_result['success'] is True
        assert 'metrics' in training_result
        assert self.detector.is_trained is True
        assert 'isolation_forest' in self.detector.models
        assert 'dbscan' in self.detector.models
        assert 'pca' in self.detector.models
    
    def test_anomaly_prediction(self):
        """Test anomaly prediction"""
        features = self.detector.extract_features(self.sample_transactions, 'test_user')
        
        # Train the model first
        self.detector.train(features)
        
        # Predict on the same data
        prediction_result = self.detector.predict(features)
        
        assert prediction_result['success'] is True
        assert 'predictions' in prediction_result
        assert 'ensemble' in prediction_result['predictions']
        
        ensemble_pred = prediction_result['predictions']['ensemble']
        assert len(ensemble_pred['anomaly_scores']) == len(features)
        assert len(ensemble_pred['is_anomaly']) == len(features)
        
        # The last transaction (expensive one) should likely be flagged as anomaly
        last_anomaly_score = ensemble_pred['anomaly_scores'][-1]
        assert last_anomaly_score > 0.3  # Should have elevated anomaly score
    
    def test_real_time_detection(self):
        """Test real-time anomaly detection for single transaction"""
        # Prepare historical data (first 3 transactions)
        history = self.sample_transactions.iloc[:-1].copy()
        
        # Train on historical data
        features = self.detector.extract_features(history, 'test_user')
        self.detector.train(features)
        
        # Test new transaction (the expensive one)
        new_transaction = {
            'id': '4',
            'user_id': 'test_user',
            'amount': -500.0,
            'category': 'Food',
            'description': 'Expensive Restaurant',
            'timestamp': datetime.now().isoformat(),
            'merchant_name': 'Luxury Restaurant'
        }
        
        result = self.detector.detect_real_time_anomalies(new_transaction, history)
        
        assert result['success'] is True
        assert 'is_anomaly' in result
        assert 'anomaly_score' in result
        assert 'confidence' in result
        assert 'explanation' in result
        
        # This should be detected as anomaly due to high amount
        assert result['anomaly_score'] > 0.5
    
    def test_model_save_load(self, tmp_path):
        """Test model saving and loading"""
        features = self.detector.extract_features(self.sample_transactions, 'test_user')
        self.detector.train(features)
        
        # Save model
        model_path = tmp_path / "test_model.joblib"
        save_success = self.detector.save_model(str(model_path))
        assert save_success is True
        assert model_path.exists()
        
        # Create new detector and load model
        new_detector = AnomalyDetector()
        load_success = new_detector.load_model(str(model_path))
        assert load_success is True
        assert new_detector.is_trained is True
        
        # Test that loaded model works
        prediction_result = new_detector.predict(features)
        assert prediction_result['success'] is True
    
    def test_explanation_generation(self):
        """Test anomaly explanation generation"""
        history = self.sample_transactions.iloc[:-1].copy()
        features = self.detector.extract_features(history, 'test_user')
        self.detector.train(features)
        
        # Test with high-amount transaction
        expensive_transaction = {
            'id': '5',
            'user_id': 'test_user',
            'amount': -1000.0,  # Very high amount
            'category': 'Food',
            'description': 'Very Expensive Restaurant',
            'timestamp': datetime.now().isoformat(),
            'merchant_name': 'Ultra Luxury Restaurant'
        }
        
        result = self.detector.detect_real_time_anomalies(expensive_transaction, history)
        
        explanation = result['explanation']
        assert 'reasons' in explanation
        assert 'detected_by_models' in explanation
        assert 'recommendation' in explanation
        
        # Should mention high amount
        reasons_text = ' '.join(explanation['reasons'])
        assert 'amount' in reasons_text.lower() or 'higher' in reasons_text.lower()


class TestAnomalyDetectionService:
    """Test cases for AnomalyDetectionService class"""
    
    def setup_method(self):
        """Setup test fixtures"""
        # Mock configuration
        self.mock_config = {
            'redis_url': 'redis://localhost:6379',
            'database_url': 'postgresql://localhost:5432/test',
            'alert_settings': {
                'enable_real_time_alerts': True,
                'max_alerts_per_hour': 10
            },
            'model_settings': {
                'min_training_samples': 10,
                'model_path': '/tmp/test_model.joblib'
            }
        }
        
        self.service = AnomalyDetectionService(self.mock_config)
    
    @pytest.mark.asyncio
    async def test_service_initialization(self):
        """Test service initialization"""
        with patch.object(self.service, '_initialize_model', new_callable=AsyncMock):
            with patch('redis.asyncio.from_url') as mock_redis:
                with patch.object(self.service.db_manager, 'initialize', new_callable=AsyncMock):
                    with patch.object(self.service.notification_manager, 'initialize', new_callable=AsyncMock):
                        
                        # Mock Redis ping
                        mock_redis_instance = AsyncMock()
                        mock_redis.return_value = mock_redis_instance
                        mock_redis_instance.ping = AsyncMock()
                        
                        result = await self.service.initialize()
                        
                        assert result is True
                        assert self.service.is_initialized is True
    
    @pytest.mark.asyncio
    async def test_transaction_anomaly_detection(self):
        """Test transaction anomaly detection"""
        # Mock service as initialized
        self.service.is_initialized = True
        self.service.detector.is_trained = True
        
        # Mock dependencies
        with patch.object(self.service, '_get_user_history', new_callable=AsyncMock) as mock_history:
            with patch.object(self.service.detector, 'detect_real_time_anomalies') as mock_detect:
                with patch.object(self.service, '_cache_detection_result', new_callable=AsyncMock):
                    with patch.object(self.service, '_store_detection_result', new_callable=AsyncMock):
                        
                        # Setup mocks
                        mock_history.return_value = pd.DataFrame()
                        mock_detect.return_value = {
                            'success': True,
                            'is_anomaly': True,
                            'anomaly_score': 0.8,
                            'confidence': 0.9,
                            'should_alert': True
                        }
                        
                        # Test transaction
                        transaction_data = {
                            'id': 'test_tx_1',
                            'user_id': 'test_user',
                            'amount': -500.0,
                            'category': 'Food',
                            'description': 'Expensive meal',
                            'timestamp': datetime.now().isoformat()
                        }
                        
                        result = await self.service.detect_transaction_anomaly(transaction_data)
                        
                        assert result['success'] is True
                        assert result['is_anomaly'] is True
                        assert result['anomaly_score'] == 0.8
    
    @pytest.mark.asyncio
    async def test_batch_anomaly_detection(self):
        """Test batch anomaly detection"""
        self.service.is_initialized = True
        
        with patch.object(self.service, '_get_recent_transactions', new_callable=AsyncMock) as mock_recent:
            with patch.object(self.service, 'detect_transaction_anomaly', new_callable=AsyncMock) as mock_detect:
                with patch.object(self.service, '_is_already_processed', new_callable=AsyncMock) as mock_processed:
                    
                    # Setup mocks
                    mock_recent.return_value = pd.DataFrame([
                        {
                            'id': 'tx1',
                            'user_id': 'user1',
                            'amount': -100,
                            'category': 'Food',
                            'description': 'Normal meal',
                            'timestamp': datetime.now()
                        },
                        {
                            'id': 'tx2',
                            'user_id': 'user1',
                            'amount': -500,
                            'category': 'Food',
                            'description': 'Expensive meal',
                            'timestamp': datetime.now()
                        }
                    ])
                    
                    mock_processed.return_value = False
                    mock_detect.side_effect = [
                        {'success': True, 'is_anomaly': False, 'anomaly_score': 0.2},
                        {'success': True, 'is_anomaly': True, 'anomaly_score': 0.8}
                    ]
                    
                    result = await self.service.batch_detect_anomalies('user1', 24)
                    
                    assert result['success'] is True
                    assert result['processed'] == 2
                    assert result['anomalies_detected'] == 1
    
    @pytest.mark.asyncio
    async def test_anomaly_statistics(self):
        """Test anomaly statistics retrieval"""
        self.service.is_initialized = True
        
        with patch.object(self.service.db_manager, 'execute_query', new_callable=AsyncMock) as mock_query:
            mock_query.return_value = [{
                'total_detections': 100,
                'anomaly_count': 15,
                'avg_anomaly_score': 0.25,
                'max_anomaly_score': 0.95,
                'active_days': 20
            }]
            
            result = await self.service.get_anomaly_statistics('test_user', 30)
            
            assert result['success'] is True
            assert result['total_transactions_analyzed'] == 100
            assert result['anomalies_detected'] == 15
            assert result['anomaly_rate'] == 0.15
            assert result['average_anomaly_score'] == 0.25
    
    @pytest.mark.asyncio
    async def test_alert_rate_limiting(self):
        """Test alert rate limiting functionality"""
        self.service.is_initialized = True
        
        # Mock Redis client
        mock_redis = AsyncMock()
        self.service.redis_client = mock_redis
        
        # Test within rate limit
        mock_redis.get.return_value = '5'  # 5 alerts sent
        result = await self.service._check_alert_rate_limit('test_user')
        assert result is True
        
        # Test exceeding rate limit
        mock_redis.get.return_value = '15'  # 15 alerts sent (exceeds limit of 10)
        result = await self.service._check_alert_rate_limit('test_user')
        assert result is False
    
    def test_alert_message_creation(self):
        """Test alert message creation"""
        transaction_data = {
            'amount': -250.0,
            'category': 'Food',
            'merchant_name': 'Expensive Restaurant'
        }
        
        detection_result = {
            'explanation': {
                'reasons': ['Transaction amount is 3.5x higher than your average']
            }
        }
        
        message = self.service._create_alert_message(transaction_data, detection_result)
        
        assert 'unusual transaction' in message.lower()
        assert '$250.00' in message
        assert 'Food' in message
        assert 'verify' in message.lower()


class TestIntegration:
    """Integration tests for the complete anomaly detection system"""
    
    @pytest.mark.asyncio
    async def test_end_to_end_anomaly_detection(self):
        """Test complete end-to-end anomaly detection flow"""
        # This would be a more comprehensive test with real database
        # and Redis connections in a test environment
        pass
    
    def test_performance_with_large_dataset(self):
        """Test performance with large transaction dataset"""
        # Generate large dataset
        n_transactions = 10000
        dates = pd.date_range(start='2023-01-01', periods=n_transactions, freq='H')
        
        large_dataset = pd.DataFrame({
            'id': [f'tx_{i}' for i in range(n_transactions)],
            'amount': np.random.normal(-50, 20, n_transactions),
            'category': np.random.choice(['Food', 'Transport', 'Shopping', 'Bills'], n_transactions),
            'description': ['Transaction'] * n_transactions,
            'timestamp': dates,
            'merchant_name': ['Merchant'] * n_transactions
        })
        
        # Add some anomalies
        anomaly_indices = np.random.choice(n_transactions, 100, replace=False)
        large_dataset.loc[anomaly_indices, 'amount'] *= 5  # Make them 5x larger
        
        detector = AnomalyDetector()
        
        # Test feature extraction performance
        import time
        start_time = time.time()
        features = detector.extract_features(large_dataset, 'test_user')
        feature_time = time.time() - start_time
        
        assert len(features) == n_transactions
        assert feature_time < 60  # Should complete within 1 minute
        
        # Test training performance
        start_time = time.time()
        training_result = detector.train(features)
        training_time = time.time() - start_time
        
        assert training_result['success'] is True
        assert training_time < 120  # Should complete within 2 minutes
        
        # Test prediction performance
        start_time = time.time()
        prediction_result = detector.predict(features)
        prediction_time = time.time() - start_time
        
        assert prediction_result['success'] is True
        assert prediction_time < 30  # Should complete within 30 seconds


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"])