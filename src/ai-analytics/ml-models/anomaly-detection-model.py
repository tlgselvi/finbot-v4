"""
Anomaly Detection Model for Financial Transactions
Implements unsupervised learning for spending anomaly detection
"""

import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from sklearn.ensemble import IsolationForest
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler, RobustScaler
from sklearn.decomposition import PCA
from sklearn.metrics import classification_report, confusion_matrix
import joblib
import logging
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AnomalyDetectionModel:
    """
    Advanced anomaly detection system using multiple algorithms
    """
    
    def __init__(self, config=None):
        self.config = config or {
            'isolation_forest': {
                'contamination': 0.1,  # Expected proportion of anomalies
                'n_estimators': 100,
                'max_samples': 'auto',
                'random_state': 42
            },
            'autoencoder': {
                'encoding_dim': 32,
                'hidden_layers': [64, 32, 16],
                'dropout_rate': 0.2,
                'learning_rate': 0.001,
                'epochs': 100,
                'batch_size': 32,
                'validation_split': 0.2
            },
            'dbscan': {
                'eps': 0.5,
                'min_samples': 5,
                'metric': 'euclidean'
            },
            'ensemble': {
                'voting_threshold': 0.6,  # Fraction of models that must agree
                'weights': {
                    'isolation_forest': 0.4,
                    'autoencoder': 0.4,
                    'dbscan': 0.2
                }
            },
            'feature_engineering': {
                'use_temporal_features': True,
                'use_behavioral_features': True,
                'use_statistical_features': True,
                'lookback_days': 30
            }
        }
        
        # Model components
        self.isolation_forest = None
        self.autoencoder = None
        self.dbscan = None
        
        # Preprocessing components
        self.scaler = RobustScaler()  # More robust to outliers
        self.pca = PCA(n_components=0.95)  # Keep 95% of variance
        
        # Model metadata
        self.is_trained = False
        self.feature_names = []
        self.anomaly_threshold = 0.5
        self.model_version = "1.0"
        self.training_stats = {}
        
    def prepare_features(self, df):
        """
        Prepare comprehensive features for anomaly detection
        """
        logger.info("Preparing features for anomaly detection")
        
        # Ensure datetime index
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp'])
            df = df.set_index('timestamp')
        
        df = df.sort_index()
        
        # Basic transaction features
        features_df = pd.DataFrame(index=df.index)
        features_df['amount'] = df['amount']
        features_df['amount_log'] = np.log1p(df['amount'])  # Log transform for skewed data
        
        # Temporal features
        if self.config['feature_engineering']['use_temporal_features']:
            features_df['hour'] = df.index.hour
            features_df['day_of_week'] = df.index.dayofweek
            features_df['day_of_month'] = df.index.day
            features_df['month'] = df.index.month
            features_df['is_weekend'] = df.index.dayofweek.isin([5, 6]).astype(int)
            features_df['is_business_hours'] = ((df.index.hour >= 9) & (df.index.hour <= 17)).astype(int)
            features_df['is_late_night'] = ((df.index.hour >= 22) | (df.index.hour <= 5)).astype(int)
            
            # Cyclical encoding
            features_df['hour_sin'] = np.sin(2 * np.pi * df.index.hour / 24)
            features_df['hour_cos'] = np.cos(2 * np.pi * df.index.hour / 24)
            features_df['day_sin'] = np.sin(2 * np.pi * df.index.dayofweek / 7)
            features_df['day_cos'] = np.cos(2 * np.pi * df.index.dayofweek / 7)
        
        # Behavioral features
        if self.config['feature_engineering']['use_behavioral_features']:
            # User-specific features (if user_id available)
            if 'user_id' in df.columns:
                user_stats = df.groupby('user_id')['amount'].agg(['mean', 'std', 'count']).add_prefix('user_')
                features_df = features_df.join(user_stats, on='user_id', how='left')
            
            # Category features
            if 'category' in df.columns:
                # Category frequency
                category_counts = df['category'].value_counts()
                features_df['category_frequency'] = df['category'].map(category_counts)
                
                # One-hot encode top categories
                top_categories = category_counts.head(10).index
                for cat in top_categories:
                    features_df[f'category_{cat}'] = (df['category'] == cat).astype(int)
            
            # Merchant features
            if 'merchant' in df.columns:
                merchant_counts = df['merchant'].value_counts()
                features_df['merchant_frequency'] = df['merchant'].map(merchant_counts)
                features_df['is_new_merchant'] = (features_df['merchant_frequency'] == 1).astype(int)
        
        # Statistical features
        if self.config['feature_engineering']['use_statistical_features']:
            lookback = self.config['feature_engineering']['lookback_days']
            
            # Rolling statistics
            for window in [7, 14, 30]:
                if window <= lookback:
                    features_df[f'amount_mean_{window}d'] = df['amount'].rolling(f'{window}D').mean()
                    features_df[f'amount_std_{window}d'] = df['amount'].rolling(f'{window}D').std()
                    features_df[f'amount_median_{window}d'] = df['amount'].rolling(f'{window}D').median()
                    features_df[f'transaction_count_{window}d'] = df['amount'].rolling(f'{window}D').count()
            
            # Z-scores (how many standard deviations from mean)
            features_df['amount_zscore_7d'] = (
                (df['amount'] - features_df['amount_mean_7d']) / 
                (features_df['amount_std_7d'] + 1e-8)
            )
            
            features_df['amount_zscore_30d'] = (
                (df['amount'] - features_df['amount_mean_30d']) / 
                (features_df['amount_std_30d'] + 1e-8)
            )
            
            # Percentile features
            features_df['amount_percentile_7d'] = df['amount'].rolling('7D').rank(pct=True)
            features_df['amount_percentile_30d'] = df['amount'].rolling('30D').rank(pct=True)
            
            # Velocity features (transaction frequency)
            features_df['transactions_last_hour'] = df['amount'].rolling('1H').count()
            features_df['transactions_last_day'] = df['amount'].rolling('1D').count()
            
            # Time since last transaction
            features_df['time_since_last_transaction'] = df.index.to_series().diff().dt.total_seconds() / 3600  # hours
        
        # Location features (if available)
        if 'location' in df.columns:
            # Distance from home (would need user's home location)
            # For now, just flag international transactions
            features_df['is_international'] = df.get('is_international', 0)
        
        # Advanced features
        # Transaction amount categories
        features_df['amount_category'] = pd.cut(
            df['amount'], 
            bins=[0, 10, 50, 200, 1000, float('inf')], 
            labels=['micro', 'small', 'medium', 'large', 'very_large']
        ).cat.codes
        
        # Round number detection (potential test transactions)
        features_df['is_round_amount'] = (df['amount'] % 1 == 0).astype(int)
        features_df['is_very_round'] = (df['amount'] % 10 == 0).astype(int)
        
        # Sequence features (patterns in consecutive transactions)
        features_df['amount_diff'] = df['amount'].diff()
        features_df['amount_pct_change'] = df['amount'].pct_change()
        
        # Remove rows with too many NaN values
        features_df = features_df.dropna(thresh=len(features_df.columns) * 0.7)
        
        # Fill remaining NaN values
        features_df = features_df.fillna(features_df.median())
        
        return features_df
    
    def train(self, df, user_id=None):
        """
        Train the anomaly detection models
        """
        logger.info(f"Training anomaly detection model for user: {user_id or 'global'}")
        
        try:
            # Prepare features
            features_df = self.prepare_features(df.copy())
            
            if len(features_df) < 100:
                raise ValueError("Insufficient data for training (minimum 100 samples required)")
            
            # Store feature names
            self.feature_names = list(features_df.columns)
            
            # Scale features
            X_scaled = self.scaler.fit_transform(features_df)
            
            # Apply PCA for dimensionality reduction
            X_pca = self.pca.fit_transform(X_scaled)
            
            # Train Isolation Forest
            logger.info("Training Isolation Forest...")
            self.isolation_forest = IsolationForest(**self.config['isolation_forest'])
            self.isolation_forest.fit(X_scaled)
            
            # Train Autoencoder
            logger.info("Training Autoencoder...")
            self.autoencoder = self._build_autoencoder(X_pca.shape[1])
            
            # Prepare autoencoder training data
            history = self.autoencoder.fit(
                X_pca, X_pca,
                epochs=self.config['autoencoder']['epochs'],
                batch_size=self.config['autoencoder']['batch_size'],
                validation_split=self.config['autoencoder']['validation_split'],
                verbose=0,
                callbacks=[
                    keras.callbacks.EarlyStopping(patience=10, restore_best_weights=True),
                    keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=5)
                ]
            )
            
            # Calculate reconstruction threshold
            reconstructions = self.autoencoder.predict(X_pca, verbose=0)
            reconstruction_errors = np.mean(np.square(X_pca - reconstructions), axis=1)
            self.anomaly_threshold = np.percentile(reconstruction_errors, 95)  # 95th percentile
            
            # Train DBSCAN
            logger.info("Training DBSCAN...")
            self.dbscan = DBSCAN(**self.config['dbscan'])
            dbscan_labels = self.dbscan.fit_predict(X_pca)
            
            # Calculate training statistics
            isolation_anomalies = (self.isolation_forest.predict(X_scaled) == -1).sum()
            autoencoder_anomalies = (reconstruction_errors > self.anomaly_threshold).sum()
            dbscan_anomalies = (dbscan_labels == -1).sum()
            
            self.training_stats = {
                'total_samples': len(features_df),
                'features_count': len(self.feature_names),
                'pca_components': X_pca.shape[1],
                'isolation_forest_anomalies': int(isolation_anomalies),
                'autoencoder_anomalies': int(autoencoder_anomalies),
                'dbscan_anomalies': int(dbscan_anomalies),
                'autoencoder_loss': float(history.history['loss'][-1]),
                'anomaly_threshold': float(self.anomaly_threshold)
            }
            
            self.is_trained = True
            logger.info("Anomaly detection model training completed successfully")
            
            return {
                'status': 'success',
                'training_stats': self.training_stats,
                'feature_names': self.feature_names
            }
            
        except Exception as e:
            logger.error(f"Anomaly detection model training failed: {str(e)}")
            raise
    
    def _build_autoencoder(self, input_dim):
        """
        Build autoencoder neural network
        """
        # Encoder
        input_layer = layers.Input(shape=(input_dim,))
        
        encoded = input_layer
        for units in self.config['autoencoder']['hidden_layers']:
            encoded = layers.Dense(units, activation='relu')(encoded)
            encoded = layers.Dropout(self.config['autoencoder']['dropout_rate'])(encoded)
        
        # Bottleneck
        encoded = layers.Dense(self.config['autoencoder']['encoding_dim'], activation='relu')(encoded)
        
        # Decoder
        decoded = encoded
        for units in reversed(self.config['autoencoder']['hidden_layers']):
            decoded = layers.Dense(units, activation='relu')(decoded)
            decoded = layers.Dropout(self.config['autoencoder']['dropout_rate'])(decoded)
        
        # Output layer
        decoded = layers.Dense(input_dim, activation='linear')(decoded)
        
        # Create model
        autoencoder = keras.Model(input_layer, decoded)
        autoencoder.compile(
            optimizer=keras.optimizers.Adam(learning_rate=self.config['autoencoder']['learning_rate']),
            loss='mse'
        )
        
        return autoencoder
    
    def predict(self, df, user_id=None):
        """
        Detect anomalies in new data
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before making predictions")
        
        logger.info(f"Detecting anomalies for user: {user_id or 'global'}")
        
        try:
            # Prepare features
            features_df = self.prepare_features(df.copy())
            
            if len(features_df) == 0:
                return {
                    'anomalies': [],
                    'anomaly_scores': [],
                    'predictions': []
                }
            
            # Ensure feature consistency
            for feature in self.feature_names:
                if feature not in features_df.columns:
                    features_df[feature] = 0
            
            features_df = features_df[self.feature_names]
            
            # Scale features
            X_scaled = self.scaler.transform(features_df)
            X_pca = self.pca.transform(X_scaled)
            
            # Get predictions from each model
            predictions = {}
            
            # Isolation Forest
            if_predictions = self.isolation_forest.predict(X_scaled)
            if_scores = self.isolation_forest.decision_function(X_scaled)
            predictions['isolation_forest'] = {
                'anomalies': (if_predictions == -1),
                'scores': if_scores
            }
            
            # Autoencoder
            reconstructions = self.autoencoder.predict(X_pca, verbose=0)
            reconstruction_errors = np.mean(np.square(X_pca - reconstructions), axis=1)
            ae_anomalies = reconstruction_errors > self.anomaly_threshold
            predictions['autoencoder'] = {
                'anomalies': ae_anomalies,
                'scores': reconstruction_errors
            }
            
            # DBSCAN (predict using nearest cluster)
            dbscan_predictions = self._predict_dbscan(X_pca)
            predictions['dbscan'] = {
                'anomalies': dbscan_predictions == -1,
                'scores': np.where(dbscan_predictions == -1, 1.0, 0.0)
            }
            
            # Ensemble prediction
            ensemble_scores, ensemble_anomalies = self._ensemble_predict(predictions)
            
            # Create detailed results
            results = []
            for i, (idx, row) in enumerate(features_df.iterrows()):
                result = {
                    'timestamp': idx,
                    'is_anomaly': bool(ensemble_anomalies[i]),
                    'anomaly_score': float(ensemble_scores[i]),
                    'individual_predictions': {
                        'isolation_forest': {
                            'is_anomaly': bool(predictions['isolation_forest']['anomalies'][i]),
                            'score': float(predictions['isolation_forest']['scores'][i])
                        },
                        'autoencoder': {
                            'is_anomaly': bool(predictions['autoencoder']['anomalies'][i]),
                            'score': float(predictions['autoencoder']['scores'][i])
                        },
                        'dbscan': {
                            'is_anomaly': bool(predictions['dbscan']['anomalies'][i]),
                            'score': float(predictions['dbscan']['scores'][i])
                        }
                    },
                    'features': row.to_dict()
                }
                results.append(result)
            
            # Summary statistics
            anomaly_count = int(ensemble_anomalies.sum())
            anomaly_rate = float(anomaly_count / len(results)) if len(results) > 0 else 0
            
            return {
                'predictions': results,
                'summary': {
                    'total_transactions': len(results),
                    'anomalies_detected': anomaly_count,
                    'anomaly_rate': anomaly_rate,
                    'model_agreement': self._calculate_model_agreement(predictions)
                },
                'model_info': {
                    'model_version': self.model_version,
                    'prediction_timestamp': datetime.now().isoformat(),
                    'user_id': user_id
                }
            }
            
        except Exception as e:
            logger.error(f"Anomaly detection failed: {str(e)}")
            raise
    
    def _predict_dbscan(self, X):
        """
        Predict using DBSCAN (assign to nearest cluster or mark as anomaly)
        """
        # For DBSCAN, we need to use a different approach for new data
        # Since DBSCAN doesn't have a predict method, we'll use distance to existing clusters
        
        if not hasattr(self.dbscan, 'components_'):
            # If no core samples, mark all as anomalies
            return np.full(len(X), -1)
        
        # Calculate distances to core samples
        from sklearn.metrics.pairwise import pairwise_distances
        
        distances = pairwise_distances(X, self.dbscan.components_)
        min_distances = np.min(distances, axis=1)
        
        # Use eps threshold to determine anomalies
        predictions = np.where(min_distances <= self.config['dbscan']['eps'], 0, -1)
        
        return predictions
    
    def _ensemble_predict(self, predictions):
        """
        Combine predictions from multiple models
        """
        weights = self.config['ensemble']['weights']
        threshold = self.config['ensemble']['voting_threshold']
        
        # Normalize scores to [0, 1] range
        normalized_scores = {}
        
        # Isolation Forest: transform decision function to [0, 1]
        if_scores = predictions['isolation_forest']['scores']
        if_min, if_max = if_scores.min(), if_scores.max()
        if if_max > if_min:
            normalized_scores['isolation_forest'] = (if_scores - if_min) / (if_max - if_min)
        else:
            normalized_scores['isolation_forest'] = np.zeros_like(if_scores)
        
        # Autoencoder: normalize reconstruction errors
        ae_scores = predictions['autoencoder']['scores']
        ae_max = max(ae_scores.max(), self.anomaly_threshold)
        normalized_scores['autoencoder'] = np.clip(ae_scores / ae_max, 0, 1)
        
        # DBSCAN: already binary
        normalized_scores['dbscan'] = predictions['dbscan']['scores']
        
        # Weighted ensemble
        ensemble_scores = (
            weights['isolation_forest'] * normalized_scores['isolation_forest'] +
            weights['autoencoder'] * normalized_scores['autoencoder'] +
            weights['dbscan'] * normalized_scores['dbscan']
        )
        
        # Voting-based anomaly detection
        votes = (
            predictions['isolation_forest']['anomalies'].astype(int) +
            predictions['autoencoder']['anomalies'].astype(int) +
            predictions['dbscan']['anomalies'].astype(int)
        )
        
        ensemble_anomalies = votes >= (len(weights) * threshold)
        
        return ensemble_scores, ensemble_anomalies
    
    def _calculate_model_agreement(self, predictions):
        """
        Calculate agreement between different models
        """
        if_anomalies = predictions['isolation_forest']['anomalies']
        ae_anomalies = predictions['autoencoder']['anomalies']
        db_anomalies = predictions['dbscan']['anomalies']
        
        # Pairwise agreement
        if_ae_agreement = np.mean(if_anomalies == ae_anomalies)
        if_db_agreement = np.mean(if_anomalies == db_anomalies)
        ae_db_agreement = np.mean(ae_anomalies == db_anomalies)
        
        # Overall agreement (all three models agree)
        all_agree = np.mean((if_anomalies == ae_anomalies) & (ae_anomalies == db_anomalies))
        
        return {
            'isolation_forest_autoencoder': float(if_ae_agreement),
            'isolation_forest_dbscan': float(if_db_agreement),
            'autoencoder_dbscan': float(ae_db_agreement),
            'all_models': float(all_agree)
        }
    
    def explain_anomaly(self, transaction_features, top_n=5):
        """
        Explain why a transaction was flagged as anomalous
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before explaining anomalies")
        
        # Calculate feature importance for this specific transaction
        feature_contributions = {}
        
        for i, feature_name in enumerate(self.feature_names):
            if feature_name in transaction_features:
                value = transaction_features[feature_name]
                
                # Calculate how much this feature deviates from normal
                # This is a simplified explanation - could be enhanced
                feature_contributions[feature_name] = abs(value)
        
        # Sort by contribution
        sorted_features = sorted(
            feature_contributions.items(), 
            key=lambda x: x[1], 
            reverse=True
        )[:top_n]
        
        return {
            'top_contributing_features': sorted_features,
            'explanation': f"Top {top_n} features contributing to anomaly detection",
            'feature_values': {k: transaction_features.get(k, 0) for k, _ in sorted_features}
        }
    
    def update_threshold(self, new_threshold):
        """
        Update anomaly detection threshold
        """
        self.anomaly_threshold = new_threshold
        logger.info(f"Updated anomaly threshold to {new_threshold}")
    
    def get_model_info(self):
        """
        Get model information and statistics
        """
        return {
            'model_version': self.model_version,
            'is_trained': self.is_trained,
            'config': self.config,
            'training_stats': self.training_stats,
            'feature_names': self.feature_names,
            'anomaly_threshold': self.anomaly_threshold,
            'models': {
                'isolation_forest': self.isolation_forest is not None,
                'autoencoder': self.autoencoder is not None,
                'dbscan': self.dbscan is not None
            }
        }
    
    def save_model(self, filepath):
        """
        Save trained model to disk
        """
        if not self.is_trained:
            raise ValueError("No trained model to save")
        
        model_data = {
            'config': self.config,
            'is_trained': self.is_trained,
            'feature_names': self.feature_names,
            'anomaly_threshold': self.anomaly_threshold,
            'model_version': self.model_version,
            'training_stats': self.training_stats,
            'scaler': self.scaler,
            'pca': self.pca,
            'isolation_forest': self.isolation_forest,
            'dbscan': self.dbscan
        }
        
        # Save autoencoder separately
        if self.autoencoder:
            self.autoencoder.save(f"{filepath}_autoencoder.h5")
        
        # Save other components
        joblib.dump(model_data, f"{filepath}_anomaly_detection.pkl")
        
        logger.info(f"Anomaly detection model saved to {filepath}")
    
    def load_model(self, filepath):
        """
        Load trained model from disk
        """
        try:
            # Load main components
            model_data = joblib.load(f"{filepath}_anomaly_detection.pkl")
            
            self.config = model_data['config']
            self.is_trained = model_data['is_trained']
            self.feature_names = model_data['feature_names']
            self.anomaly_threshold = model_data['anomaly_threshold']
            self.model_version = model_data['model_version']
            self.training_stats = model_data['training_stats']
            self.scaler = model_data['scaler']
            self.pca = model_data['pca']
            self.isolation_forest = model_data['isolation_forest']
            self.dbscan = model_data['dbscan']
            
            # Load autoencoder
            try:
                self.autoencoder = keras.models.load_model(f"{filepath}_autoencoder.h5")
            except:
                logger.warning("Could not load autoencoder model")
            
            logger.info(f"Anomaly detection model loaded from {filepath}")
            
        except Exception as e:
            logger.error(f"Failed to load model: {str(e)}")
            raise

# Example usage and testing
if __name__ == "__main__":
    # Generate sample data for testing
    np.random.seed(42)
    
    # Normal transactions
    dates = pd.date_range(start='2023-01-01', end='2024-01-01', freq='H')
    n_normal = int(len(dates) * 0.95)  # 95% normal transactions
    n_anomalies = len(dates) - n_normal  # 5% anomalies
    
    # Normal transaction amounts (log-normal distribution)
    normal_amounts = np.random.lognormal(mean=3, sigma=1, size=n_normal)
    normal_amounts = np.clip(normal_amounts, 1, 1000)  # Clip to reasonable range
    
    # Anomalous transactions (much higher amounts or unusual patterns)
    anomaly_amounts = np.concatenate([
        np.random.uniform(2000, 10000, n_anomalies // 2),  # High amounts
        np.random.uniform(0.01, 0.1, n_anomalies // 2)     # Very low amounts
    ])
    
    # Combine and shuffle
    all_amounts = np.concatenate([normal_amounts, anomaly_amounts])
    all_dates = dates[:len(all_amounts)]
    
    # Create labels (1 for anomaly, 0 for normal)
    labels = np.concatenate([
        np.zeros(n_normal),
        np.ones(n_anomalies)
    ])
    
    # Shuffle data
    shuffle_idx = np.random.permutation(len(all_amounts))
    all_amounts = all_amounts[shuffle_idx]
    all_dates = all_dates[shuffle_idx]
    labels = labels[shuffle_idx]
    
    sample_data = pd.DataFrame({
        'timestamp': all_dates,
        'amount': all_amounts,
        'category': np.random.choice(['food', 'transportation', 'shopping', 'entertainment'], len(all_amounts)),
        'merchant': np.random.choice(['Merchant_A', 'Merchant_B', 'Merchant_C'], len(all_amounts)),
        'user_id': 'test_user_123',
        'is_anomaly_true': labels  # Ground truth for evaluation
    })
    
    # Test the model
    model = AnomalyDetectionModel()
    
    # Train (use only normal data for unsupervised training)
    train_data = sample_data[sample_data['is_anomaly_true'] == 0].copy()
    print("Training anomaly detection model...")
    train_result = model.train(train_data, user_id='test_user_123')
    print(f"Training result: {train_result}")
    
    # Test on all data
    print("Detecting anomalies...")
    predictions = model.predict(sample_data, user_id='test_user_123')
    print(f"Summary: {predictions['summary']}")
    
    # Evaluate performance
    predicted_anomalies = [p['is_anomaly'] for p in predictions['predictions']]
    true_anomalies = sample_data['is_anomaly_true'].values
    
    from sklearn.metrics import precision_score, recall_score, f1_score
    
    precision = precision_score(true_anomalies, predicted_anomalies)
    recall = recall_score(true_anomalies, predicted_anomalies)
    f1 = f1_score(true_anomalies, predicted_anomalies)
    
    print(f"Performance - Precision: {precision:.3f}, Recall: {recall:.3f}, F1: {f1:.3f}")
    
    # Model info
    print("Model info:")
    print(model.get_model_info())