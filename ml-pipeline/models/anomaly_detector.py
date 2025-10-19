"""
Anomaly Detection System
Implements unsupervised learning models for detecting unusual spending patterns
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler, RobustScaler
from sklearn.cluster import DBSCAN
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score
import joblib
import logging
from typing import Dict, List, Tuple, Optional, Any
from datetime import datetime, timedelta
import json

logger = logging.getLogger(__name__)

class AnomalyDetector:
    """
    Advanced anomaly detection system for financial transactions
    Uses multiple algorithms for robust anomaly detection
    """
    
    def __init__(self, config: Optional[Dict] = None):
        self.config = config or self._get_default_config()
        self.models = {}
        self.scalers = {}
        self.feature_columns = []
        self.is_trained = False
        
    def _get_default_config(self) -> Dict:
        """Get default configuration for anomaly detection"""
        return {
            'isolation_forest': {
                'contamination': 0.1,
                'n_estimators': 100,
                'max_samples': 'auto',
                'random_state': 42
            },
            'dbscan': {
                'eps': 0.5,
                'min_samples': 5,
                'metric': 'euclidean'
            },
            'pca': {
                'n_components': 0.95,
                'random_state': 42
            },
            'thresholds': {
                'anomaly_score': 0.7,
                'confidence_threshold': 0.8,
                'alert_threshold': 0.9
            },
            'feature_engineering': {
                'time_windows': [7, 14, 30, 90],
                'statistical_features': True,
                'temporal_features': True,
                'category_features': True
            }
        }
    
    def extract_features(self, transactions: pd.DataFrame, user_id: str) -> pd.DataFrame:
        """
        Extract comprehensive features for anomaly detection
        
        Args:
            transactions: DataFrame with transaction data
            user_id: User identifier
            
        Returns:
            DataFrame with engineered features
        """
        try:
            # Ensure required columns exist
            required_cols = ['amount', 'category', 'timestamp', 'description']
            for col in required_cols:
                if col not in transactions.columns:
                    raise ValueError(f"Missing required column: {col}")
            
            # Convert timestamp to datetime
            transactions['timestamp'] = pd.to_datetime(transactions['timestamp'])
            transactions = transactions.sort_values('timestamp')
            
            features_list = []
            
            # Process each transaction
            for idx, transaction in transactions.iterrows():
                features = self._extract_transaction_features(
                    transaction, transactions, idx
                )
                features_list.append(features)
            
            features_df = pd.DataFrame(features_list)
            
            # Store feature columns for later use
            self.feature_columns = features_df.columns.tolist()
            
            logger.info(f"Extracted {len(features_df.columns)} features for {len(features_df)} transactions")
            
            return features_df
            
        except Exception as e:
            logger.error(f"Feature extraction error: {str(e)}")
            raise
    
    def _extract_transaction_features(self, transaction: pd.Series, 
                                    all_transactions: pd.DataFrame, 
                                    current_idx: int) -> Dict:
        """Extract features for a single transaction"""
        
        features = {}
        current_time = transaction['timestamp']
        
        # Basic transaction features
        features['amount'] = float(transaction['amount'])
        features['amount_log'] = np.log1p(abs(transaction['amount']))
        features['is_debit'] = 1 if transaction['amount'] < 0 else 0
        
        # Temporal features
        features['hour'] = current_time.hour
        features['day_of_week'] = current_time.weekday()
        features['day_of_month'] = current_time.day
        features['month'] = current_time.month
        features['is_weekend'] = 1 if current_time.weekday() >= 5 else 0
        features['is_month_end'] = 1 if current_time.day >= 28 else 0
        
        # Historical context features
        historical_data = all_transactions[
            all_transactions['timestamp'] < current_time
        ].copy()
        
        if len(historical_data) > 0:
            # Amount-based features
            features.update(self._get_amount_features(transaction, historical_data))
            
            # Category-based features
            features.update(self._get_category_features(transaction, historical_data))
            
            # Temporal pattern features
            features.update(self._get_temporal_features(transaction, historical_data))
            
            # Frequency features
            features.update(self._get_frequency_features(transaction, historical_data))
        else:
            # Default values for first transaction
            features.update(self._get_default_features())
        
        return features
    
    def _get_amount_features(self, transaction: pd.Series, 
                           historical_data: pd.DataFrame) -> Dict:
        """Extract amount-based features"""
        features = {}
        amount = abs(transaction['amount'])
        
        # Historical amount statistics
        hist_amounts = historical_data['amount'].abs()
        
        if len(hist_amounts) > 0:
            features['amount_vs_mean'] = amount / (hist_amounts.mean() + 1e-8)
            features['amount_vs_median'] = amount / (hist_amounts.median() + 1e-8)
            features['amount_vs_std'] = (amount - hist_amounts.mean()) / (hist_amounts.std() + 1e-8)
            features['amount_percentile'] = (hist_amounts <= amount).mean()
            features['amount_vs_max'] = amount / (hist_amounts.max() + 1e-8)
            
            # Recent vs historical comparison
            recent_data = historical_data.tail(30)  # Last 30 transactions
            if len(recent_data) > 0:
                recent_amounts = recent_data['amount'].abs()
                features['amount_vs_recent_mean'] = amount / (recent_amounts.mean() + 1e-8)
                features['amount_vs_recent_std'] = (amount - recent_amounts.mean()) / (recent_amounts.std() + 1e-8)
        
        return features
    
    def _get_category_features(self, transaction: pd.Series, 
                             historical_data: pd.DataFrame) -> Dict:
        """Extract category-based features"""
        features = {}
        category = transaction['category']
        
        # Category frequency
        category_counts = historical_data['category'].value_counts()
        features['category_frequency'] = category_counts.get(category, 0)
        features['category_frequency_norm'] = features['category_frequency'] / len(historical_data)
        
        # Category amount patterns
        category_data = historical_data[historical_data['category'] == category]
        if len(category_data) > 0:
            cat_amounts = category_data['amount'].abs()
            amount = abs(transaction['amount'])
            
            features['amount_vs_category_mean'] = amount / (cat_amounts.mean() + 1e-8)
            features['amount_vs_category_std'] = (amount - cat_amounts.mean()) / (cat_amounts.std() + 1e-8)
            features['category_amount_percentile'] = (cat_amounts <= amount).mean()
        else:
            features['amount_vs_category_mean'] = 1.0
            features['amount_vs_category_std'] = 0.0
            features['category_amount_percentile'] = 0.5
        
        # Time since last transaction in category
        if len(category_data) > 0:
            last_category_time = category_data['timestamp'].max()
            time_diff = (transaction['timestamp'] - last_category_time).total_seconds() / 3600  # hours
            features['hours_since_last_category'] = time_diff
        else:
            features['hours_since_last_category'] = 999999  # Large number for new categories
        
        return features
    
    def _get_temporal_features(self, transaction: pd.Series, 
                             historical_data: pd.DataFrame) -> Dict:
        """Extract temporal pattern features"""
        features = {}
        current_time = transaction['timestamp']
        
        # Time-based patterns
        for window_days in [1, 7, 30]:
            window_start = current_time - timedelta(days=window_days)
            window_data = historical_data[
                historical_data['timestamp'] >= window_start
            ]
            
            if len(window_data) > 0:
                features[f'transactions_last_{window_days}d'] = len(window_data)
                features[f'amount_last_{window_days}d'] = window_data['amount'].abs().sum()
                features[f'avg_amount_last_{window_days}d'] = window_data['amount'].abs().mean()
            else:
                features[f'transactions_last_{window_days}d'] = 0
                features[f'amount_last_{window_days}d'] = 0
                features[f'avg_amount_last_{window_days}d'] = 0
        
        # Time since last transaction
        if len(historical_data) > 0:
            last_transaction_time = historical_data['timestamp'].max()
            time_diff = (current_time - last_transaction_time).total_seconds() / 3600  # hours
            features['hours_since_last_transaction'] = time_diff
        else:
            features['hours_since_last_transaction'] = 0
        
        return features
    
    def _get_frequency_features(self, transaction: pd.Series, 
                              historical_data: pd.DataFrame) -> Dict:
        """Extract frequency-based features"""
        features = {}
        
        # Transaction frequency patterns
        if len(historical_data) > 0:
            # Daily transaction patterns
            daily_counts = historical_data.groupby(
                historical_data['timestamp'].dt.date
            ).size()
            
            features['avg_daily_transactions'] = daily_counts.mean()
            features['std_daily_transactions'] = daily_counts.std()
            
            # Hourly patterns
            hourly_counts = historical_data.groupby(
                historical_data['timestamp'].dt.hour
            ).size()
            
            current_hour = transaction['timestamp'].hour
            features['transactions_this_hour_historical'] = hourly_counts.get(current_hour, 0)
            features['avg_transactions_per_hour'] = hourly_counts.mean()
        
        return features
    
    def _get_default_features(self) -> Dict:
        """Get default feature values for first transaction"""
        return {
            'amount_vs_mean': 1.0,
            'amount_vs_median': 1.0,
            'amount_vs_std': 0.0,
            'amount_percentile': 0.5,
            'amount_vs_max': 1.0,
            'amount_vs_recent_mean': 1.0,
            'amount_vs_recent_std': 0.0,
            'category_frequency': 0,
            'category_frequency_norm': 0.0,
            'amount_vs_category_mean': 1.0,
            'amount_vs_category_std': 0.0,
            'category_amount_percentile': 0.5,
            'hours_since_last_category': 999999,
            'transactions_last_1d': 0,
            'amount_last_1d': 0,
            'avg_amount_last_1d': 0,
            'transactions_last_7d': 0,
            'amount_last_7d': 0,
            'avg_amount_last_7d': 0,
            'transactions_last_30d': 0,
            'amount_last_30d': 0,
            'avg_amount_last_30d': 0,
            'hours_since_last_transaction': 0,
            'avg_daily_transactions': 0,
            'std_daily_transactions': 0,
            'transactions_this_hour_historical': 0,
            'avg_transactions_per_hour': 0
        }
    
    def train(self, features: pd.DataFrame) -> Dict:
        """
        Train anomaly detection models
        
        Args:
            features: DataFrame with engineered features
            
        Returns:
            Training results and metrics
        """
        try:
            logger.info(f"Training anomaly detection models on {len(features)} samples")
            
            # Handle missing values
            features_clean = features.fillna(0)
            
            # Feature scaling
            self.scalers['robust'] = RobustScaler()
            self.scalers['standard'] = StandardScaler()
            
            features_robust = self.scalers['robust'].fit_transform(features_clean)
            features_standard = self.scalers['standard'].fit_transform(features_clean)
            
            # Train Isolation Forest
            self.models['isolation_forest'] = IsolationForest(
                **self.config['isolation_forest']
            )
            self.models['isolation_forest'].fit(features_robust)
            
            # Train DBSCAN for clustering-based anomaly detection
            self.models['dbscan'] = DBSCAN(**self.config['dbscan'])
            dbscan_labels = self.models['dbscan'].fit_predict(features_standard)
            
            # Train PCA for dimensionality reduction and reconstruction error
            self.models['pca'] = PCA(**self.config['pca'])
            features_pca = self.models['pca'].fit_transform(features_standard)
            
            # Calculate training metrics
            metrics = self._calculate_training_metrics(
                features_clean, features_robust, features_standard, 
                features_pca, dbscan_labels
            )
            
            self.is_trained = True
            
            logger.info("Anomaly detection models trained successfully")
            return {
                'success': True,
                'metrics': metrics,
                'n_features': len(self.feature_columns),
                'n_samples': len(features)
            }
            
        except Exception as e:
            logger.error(f"Training error: {str(e)}")
            raise
    
    def _calculate_training_metrics(self, features: pd.DataFrame, 
                                  features_robust: np.ndarray,
                                  features_standard: np.ndarray,
                                  features_pca: np.ndarray,
                                  dbscan_labels: np.ndarray) -> Dict:
        """Calculate training metrics"""
        
        metrics = {}
        
        # Isolation Forest metrics
        if_scores = self.models['isolation_forest'].decision_function(features_robust)
        if_predictions = self.models['isolation_forest'].predict(features_robust)
        
        metrics['isolation_forest'] = {
            'anomaly_rate': (if_predictions == -1).mean(),
            'mean_anomaly_score': if_scores.mean(),
            'std_anomaly_score': if_scores.std()
        }
        
        # DBSCAN metrics
        n_clusters = len(set(dbscan_labels)) - (1 if -1 in dbscan_labels else 0)
        n_noise = list(dbscan_labels).count(-1)
        
        metrics['dbscan'] = {
            'n_clusters': n_clusters,
            'n_noise_points': n_noise,
            'noise_rate': n_noise / len(dbscan_labels) if len(dbscan_labels) > 0 else 0
        }
        
        if n_clusters > 1:
            # Calculate silhouette score (excluding noise points)
            mask = dbscan_labels != -1
            if mask.sum() > 1:
                silhouette_avg = silhouette_score(
                    features_standard[mask], dbscan_labels[mask]
                )
                metrics['dbscan']['silhouette_score'] = silhouette_avg
        
        # PCA metrics
        explained_variance_ratio = self.models['pca'].explained_variance_ratio_
        metrics['pca'] = {
            'n_components': len(explained_variance_ratio),
            'explained_variance_ratio': explained_variance_ratio.sum(),
            'reconstruction_error_mean': np.mean(
                np.sum((features_standard - 
                       self.models['pca'].inverse_transform(features_pca))**2, axis=1)
            )
        }
        
        return metrics
    
    def predict(self, features: pd.DataFrame) -> Dict:
        """
        Predict anomalies for new transactions
        
        Args:
            features: DataFrame with engineered features
            
        Returns:
            Anomaly predictions and scores
        """
        try:
            if not self.is_trained:
                raise ValueError("Models must be trained before prediction")
            
            # Handle missing values
            features_clean = features.fillna(0)
            
            # Scale features
            features_robust = self.scalers['robust'].transform(features_clean)
            features_standard = self.scalers['standard'].transform(features_clean)
            
            # Get predictions from all models
            predictions = {}
            
            # Isolation Forest predictions
            if_scores = self.models['isolation_forest'].decision_function(features_robust)
            if_predictions = self.models['isolation_forest'].predict(features_robust)
            
            predictions['isolation_forest'] = {
                'anomaly_scores': if_scores.tolist(),
                'is_anomaly': (if_predictions == -1).tolist(),
                'confidence': np.abs(if_scores).tolist()
            }
            
            # DBSCAN predictions (distance to nearest cluster)
            dbscan_labels = self.models['dbscan'].fit_predict(features_standard)
            dbscan_anomalies = (dbscan_labels == -1).tolist()
            
            predictions['dbscan'] = {
                'is_anomaly': dbscan_anomalies,
                'cluster_labels': dbscan_labels.tolist()
            }
            
            # PCA reconstruction error
            features_pca = self.models['pca'].transform(features_standard)
            features_reconstructed = self.models['pca'].inverse_transform(features_pca)
            reconstruction_errors = np.sum(
                (features_standard - features_reconstructed)**2, axis=1
            )
            
            # Normalize reconstruction errors to [0, 1]
            error_threshold = np.percentile(reconstruction_errors, 95)
            pca_anomaly_scores = np.minimum(reconstruction_errors / error_threshold, 1.0)
            pca_anomalies = (reconstruction_errors > error_threshold).tolist()
            
            predictions['pca'] = {
                'anomaly_scores': pca_anomaly_scores.tolist(),
                'is_anomaly': pca_anomalies,
                'reconstruction_errors': reconstruction_errors.tolist()
            }
            
            # Ensemble predictions
            ensemble_scores = self._calculate_ensemble_scores(predictions)
            
            predictions['ensemble'] = {
                'anomaly_scores': ensemble_scores.tolist(),
                'is_anomaly': (ensemble_scores > self.config['thresholds']['anomaly_score']).tolist(),
                'confidence': np.minimum(ensemble_scores * 2, 1.0).tolist()
            }
            
            return {
                'success': True,
                'predictions': predictions,
                'n_samples': len(features)
            }
            
        except Exception as e:
            logger.error(f"Prediction error: {str(e)}")
            raise
    
    def _calculate_ensemble_scores(self, predictions: Dict) -> np.ndarray:
        """Calculate ensemble anomaly scores"""
        
        # Normalize scores to [0, 1] range
        if_scores = np.array(predictions['isolation_forest']['anomaly_scores'])
        if_scores_norm = (if_scores - if_scores.min()) / (if_scores.max() - if_scores.min() + 1e-8)
        if_scores_norm = 1 - if_scores_norm  # Invert so higher = more anomalous
        
        pca_scores = np.array(predictions['pca']['anomaly_scores'])
        
        dbscan_scores = np.array(predictions['dbscan']['is_anomaly'], dtype=float)
        
        # Weighted ensemble
        weights = {
            'isolation_forest': 0.5,
            'pca': 0.3,
            'dbscan': 0.2
        }
        
        ensemble_scores = (
            weights['isolation_forest'] * if_scores_norm +
            weights['pca'] * pca_scores +
            weights['dbscan'] * dbscan_scores
        )
        
        return ensemble_scores
    
    def detect_real_time_anomalies(self, transaction_data: Dict, 
                                 user_history: pd.DataFrame) -> Dict:
        """
        Real-time anomaly detection for a single transaction
        
        Args:
            transaction_data: Single transaction data
            user_history: Historical transactions for the user
            
        Returns:
            Anomaly detection results
        """
        try:
            # Convert single transaction to DataFrame
            transaction_df = pd.DataFrame([transaction_data])
            
            # Combine with history for feature extraction
            combined_data = pd.concat([user_history, transaction_df], ignore_index=True)
            
            # Extract features for the new transaction only
            features = self.extract_features(combined_data, transaction_data.get('user_id'))
            new_transaction_features = features.tail(1)
            
            # Predict anomaly
            prediction_result = self.predict(new_transaction_features)
            
            # Extract results for the single transaction
            ensemble_pred = prediction_result['predictions']['ensemble']
            anomaly_score = ensemble_pred['anomaly_scores'][0]
            is_anomaly = ensemble_pred['is_anomaly'][0]
            confidence = ensemble_pred['confidence'][0]
            
            # Determine alert level
            alert_level = self._determine_alert_level(anomaly_score, confidence)
            
            # Generate explanation
            explanation = self._generate_anomaly_explanation(
                transaction_data, new_transaction_features.iloc[0], 
                prediction_result['predictions']
            )
            
            return {
                'success': True,
                'transaction_id': transaction_data.get('id'),
                'is_anomaly': is_anomaly,
                'anomaly_score': anomaly_score,
                'confidence': confidence,
                'alert_level': alert_level,
                'explanation': explanation,
                'timestamp': datetime.now().isoformat(),
                'should_alert': anomaly_score > self.config['thresholds']['alert_threshold']
            }
            
        except Exception as e:
            logger.error(f"Real-time anomaly detection error: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'transaction_id': transaction_data.get('id')
            }
    
    def _determine_alert_level(self, anomaly_score: float, confidence: float) -> str:
        """Determine alert level based on score and confidence"""
        
        if anomaly_score > 0.9 and confidence > 0.8:
            return 'critical'
        elif anomaly_score > 0.7 and confidence > 0.6:
            return 'high'
        elif anomaly_score > 0.5 and confidence > 0.4:
            return 'medium'
        else:
            return 'low'
    
    def _generate_anomaly_explanation(self, transaction_data: Dict, 
                                    features: pd.Series, 
                                    predictions: Dict) -> Dict:
        """Generate human-readable explanation for anomaly"""
        
        explanations = []
        
        # Amount-based explanations
        if features.get('amount_vs_mean', 1) > 3:
            explanations.append(
                f"Transaction amount (${abs(transaction_data['amount']):.2f}) is "
                f"{features['amount_vs_mean']:.1f}x higher than your average"
            )
        
        if features.get('amount_vs_category_mean', 1) > 2:
            explanations.append(
                f"Amount is {features['amount_vs_category_mean']:.1f}x higher than "
                f"your average for {transaction_data['category']} category"
            )
        
        # Timing-based explanations
        if features.get('hours_since_last_transaction', 0) > 168:  # 1 week
            explanations.append(
                f"First transaction in {features['hours_since_last_transaction']/24:.1f} days"
            )
        
        # Category-based explanations
        if features.get('category_frequency', 0) == 0:
            explanations.append(
                f"First transaction in {transaction_data['category']} category"
            )
        
        # Model-specific explanations
        model_flags = []
        if predictions['isolation_forest']['is_anomaly'][0]:
            model_flags.append('Isolation Forest')
        if predictions['dbscan']['is_anomaly'][0]:
            model_flags.append('Clustering Analysis')
        if predictions['pca']['is_anomaly'][0]:
            model_flags.append('Pattern Analysis')
        
        return {
            'reasons': explanations,
            'detected_by_models': model_flags,
            'primary_factors': self._get_primary_factors(features),
            'recommendation': self._get_recommendation(transaction_data, features)
        }
    
    def _get_primary_factors(self, features: pd.Series) -> List[str]:
        """Get primary factors contributing to anomaly"""
        factors = []
        
        # Check various feature thresholds
        if features.get('amount_vs_mean', 1) > 2:
            factors.append('unusual_amount')
        if features.get('hours_since_last_category', 0) > 720:  # 30 days
            factors.append('rare_category')
        if features.get('transactions_last_7d', 0) == 0:
            factors.append('unusual_timing')
        
        return factors
    
    def _get_recommendation(self, transaction_data: Dict, features: pd.Series) -> str:
        """Get recommendation based on anomaly type"""
        
        amount = abs(transaction_data['amount'])
        
        if features.get('amount_vs_mean', 1) > 3:
            return f"Large transaction detected. Verify this ${amount:.2f} transaction is legitimate."
        elif features.get('category_frequency', 0) == 0:
            return f"New spending category detected. Review if {transaction_data['category']} aligns with your budget."
        elif features.get('hours_since_last_transaction', 0) > 168:
            return "Unusual transaction timing. Ensure this transaction is authorized."
        else:
            return "Transaction pattern differs from your usual behavior. Please verify if this is expected."
    
    def save_model(self, filepath: str) -> bool:
        """Save trained models to file"""
        try:
            model_data = {
                'models': self.models,
                'scalers': self.scalers,
                'config': self.config,
                'feature_columns': self.feature_columns,
                'is_trained': self.is_trained,
                'version': '1.0',
                'timestamp': datetime.now().isoformat()
            }
            
            joblib.dump(model_data, filepath)
            logger.info(f"Models saved to {filepath}")
            return True
            
        except Exception as e:
            logger.error(f"Error saving models: {str(e)}")
            return False
    
    def load_model(self, filepath: str) -> bool:
        """Load trained models from file"""
        try:
            model_data = joblib.load(filepath)
            
            self.models = model_data['models']
            self.scalers = model_data['scalers']
            self.config = model_data['config']
            self.feature_columns = model_data['feature_columns']
            self.is_trained = model_data['is_trained']
            
            logger.info(f"Models loaded from {filepath}")
            return True
            
        except Exception as e:
            logger.error(f"Error loading models: {str(e)}")
            return False
    
    def get_model_info(self) -> Dict:
        """Get information about trained models"""
        return {
            'is_trained': self.is_trained,
            'n_features': len(self.feature_columns),
            'feature_columns': self.feature_columns,
            'models': list(self.models.keys()),
            'config': self.config
        }