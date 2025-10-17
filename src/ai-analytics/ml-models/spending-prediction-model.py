"""
Spending Prediction Model for FinBot AI Analytics
Implements time series forecasting for user spending patterns
"""

import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
import joblib
import logging
from datetime import datetime, timedelta
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import warnings
warnings.filterwarnings('ignore')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SpendingPredictionModel:
    """
    Advanced spending prediction model using ensemble methods and deep learning
    """
    
    def __init__(self, config=None):
        self.config = config or {
            'sequence_length': 30,  # Days of history to use
            'prediction_horizon': 7,  # Days to predict ahead
            'lstm_units': 64,
            'dense_units': 32,
            'dropout_rate': 0.2,
            'learning_rate': 0.001,
            'batch_size': 32,
            'epochs': 100,
            'validation_split': 0.2,
            'early_stopping_patience': 10
        }
        
        # Model components
        self.lstm_model = None
        self.ensemble_model = None
        self.category_models = {}
        
        # Preprocessing components
        self.amount_scaler = StandardScaler()
        self.feature_scaler = StandardScaler()
        self.category_encoder = LabelEncoder()
        
        # Model metadata
        self.is_trained = False
        self.training_history = {}
        self.feature_importance = {}
        self.model_version = "1.0"
        
    def prepare_features(self, df):
        """
        Prepare features for model training and prediction
        """
        logger.info("Preparing features for spending prediction")
        
        # Ensure datetime index
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp'])
            df = df.set_index('timestamp')
        
        # Sort by timestamp
        df = df.sort_index()
        
        # Basic temporal features
        df['hour'] = df.index.hour
        df['day_of_week'] = df.index.dayofweek
        df['day_of_month'] = df.index.day
        df['month'] = df.index.month
        df['quarter'] = df.index.quarter
        df['is_weekend'] = df.index.dayofweek.isin([5, 6]).astype(int)
        df['is_month_end'] = (df.index.day > 25).astype(int)
        df['is_payday'] = ((df.index.day == 15) | (df.index.day > 28)).astype(int)
        
        # Cyclical encoding for temporal features
        df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
        df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
        df['day_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
        df['day_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
        df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
        df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
        
        # Spending behavior features
        df['daily_spending'] = df.groupby(df.index.date)['amount'].transform('sum')
        df['daily_transaction_count'] = df.groupby(df.index.date)['amount'].transform('count')
        df['avg_transaction_amount'] = df['daily_spending'] / df['daily_transaction_count']
        
        # Rolling statistics (7, 14, 30 days)
        for window in [7, 14, 30]:
            df[f'spending_ma_{window}d'] = df['daily_spending'].rolling(window=window, min_periods=1).mean()
            df[f'spending_std_{window}d'] = df['daily_spending'].rolling(window=window, min_periods=1).std()
            df[f'transaction_count_ma_{window}d'] = df['daily_transaction_count'].rolling(window=window, min_periods=1).mean()
        
        # Lag features
        for lag in [1, 3, 7, 14]:
            df[f'spending_lag_{lag}d'] = df['daily_spending'].shift(lag)
            df[f'transaction_count_lag_{lag}d'] = df['daily_transaction_count'].shift(lag)
        
        # Category-based features
        if 'category' in df.columns:
            # Category spending ratios
            category_spending = df.groupby(['category', df.index.date])['amount'].sum().unstack(level=0, fill_value=0)
            total_daily_spending = category_spending.sum(axis=1)
            
            for category in category_spending.columns:
                df[f'category_{category}_ratio'] = (category_spending[category] / total_daily_spending).fillna(0)
                df[f'category_{category}_ma_7d'] = df[f'category_{category}_ratio'].rolling(window=7, min_periods=1).mean()
        
        # Merchant-based features
        if 'merchant' in df.columns:
            df['unique_merchants_daily'] = df.groupby(df.index.date)['merchant'].transform('nunique')
            df['merchant_frequency'] = df.groupby('merchant')['amount'].transform('count')
            df['merchant_avg_amount'] = df.groupby('merchant')['amount'].transform('mean')
        
        # Economic indicators (mock - in production, integrate with external APIs)
        df['economic_indicator'] = np.sin(2 * np.pi * df.index.dayofyear / 365.25) * 0.1 + 1.0
        
        # Seasonal decomposition features
        df['trend'] = df['daily_spending'].rolling(window=30, min_periods=1).mean()
        df['seasonal'] = df['daily_spending'] - df['trend']
        df['spending_volatility'] = df['daily_spending'].rolling(window=14, min_periods=1).std()
        
        return df
    
    def create_sequences(self, data, target_col='daily_spending'):
        """
        Create sequences for LSTM training
        """
        sequences = []
        targets = []
        
        # Select feature columns (exclude target and non-numeric columns)
        feature_cols = [col for col in data.columns if col != target_col and data[col].dtype in ['float64', 'int64']]
        
        for i in range(self.config['sequence_length'], len(data) - self.config['prediction_horizon'] + 1):
            # Input sequence
            seq = data[feature_cols].iloc[i-self.config['sequence_length']:i].values
            sequences.append(seq)
            
            # Target (next N days of spending)
            target = data[target_col].iloc[i:i+self.config['prediction_horizon']].values
            targets.append(target)
        
        return np.array(sequences), np.array(targets), feature_cols
    
    def build_lstm_model(self, input_shape, output_shape):
        """
        Build LSTM model for time series prediction
        """
        model = keras.Sequential([
            layers.LSTM(
                self.config['lstm_units'], 
                return_sequences=True, 
                input_shape=input_shape,
                dropout=self.config['dropout_rate']
            ),
            layers.LSTM(
                self.config['lstm_units'] // 2, 
                return_sequences=False,
                dropout=self.config['dropout_rate']
            ),
            layers.Dense(self.config['dense_units'], activation='relu'),
            layers.Dropout(self.config['dropout_rate']),
            layers.Dense(self.config['dense_units'] // 2, activation='relu'),
            layers.Dense(output_shape, activation='linear')
        ])
        
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=self.config['learning_rate']),
            loss='mse',
            metrics=['mae']
        )
        
        return model
    
    def build_ensemble_model(self):
        """
        Build ensemble model combining multiple algorithms
        """
        models = {
            'random_forest': RandomForestRegressor(
                n_estimators=100,
                max_depth=10,
                random_state=42,
                n_jobs=-1
            ),
            'gradient_boosting': GradientBoostingRegressor(
                n_estimators=100,
                max_depth=6,
                learning_rate=0.1,
                random_state=42
            )
        }
        
        return models
    
    def train(self, df, user_id=None):
        """
        Train the spending prediction model
        """
        logger.info(f"Training spending prediction model for user: {user_id or 'global'}")
        
        try:
            # Prepare features
            df_processed = self.prepare_features(df.copy())
            
            # Remove rows with NaN values
            df_processed = df_processed.dropna()
            
            if len(df_processed) < self.config['sequence_length'] + self.config['prediction_horizon']:
                raise ValueError("Insufficient data for training")
            
            # Create sequences for LSTM
            X_seq, y_seq, feature_cols = self.create_sequences(df_processed)
            
            if len(X_seq) == 0:
                raise ValueError("No sequences could be created from the data")
            
            # Split data
            split_idx = int(len(X_seq) * (1 - self.config['validation_split']))
            X_train_seq, X_val_seq = X_seq[:split_idx], X_seq[split_idx:]
            y_train_seq, y_val_seq = y_seq[:split_idx], y_seq[split_idx:]
            
            # Scale features
            X_train_scaled = self.feature_scaler.fit_transform(
                X_train_seq.reshape(-1, X_train_seq.shape[-1])
            ).reshape(X_train_seq.shape)
            
            X_val_scaled = self.feature_scaler.transform(
                X_val_seq.reshape(-1, X_val_seq.shape[-1])
            ).reshape(X_val_seq.shape)
            
            # Scale targets
            y_train_scaled = self.amount_scaler.fit_transform(y_train_seq)
            y_val_scaled = self.amount_scaler.transform(y_val_seq)
            
            # Build and train LSTM model
            self.lstm_model = self.build_lstm_model(
                input_shape=(X_train_scaled.shape[1], X_train_scaled.shape[2]),
                output_shape=y_train_scaled.shape[1]
            )
            
            # Callbacks
            callbacks = [
                keras.callbacks.EarlyStopping(
                    patience=self.config['early_stopping_patience'],
                    restore_best_weights=True
                ),
                keras.callbacks.ReduceLROnPlateau(
                    factor=0.5,
                    patience=5,
                    min_lr=1e-6
                )
            ]
            
            # Train LSTM
            history = self.lstm_model.fit(
                X_train_scaled, y_train_scaled,
                validation_data=(X_val_scaled, y_val_scaled),
                epochs=self.config['epochs'],
                batch_size=self.config['batch_size'],
                callbacks=callbacks,
                verbose=1
            )
            
            self.training_history['lstm'] = history.history
            
            # Prepare data for ensemble models
            # Use aggregated daily features
            daily_features = df_processed.groupby(df_processed.index.date).agg({
                'daily_spending': 'first',
                'daily_transaction_count': 'first',
                'avg_transaction_amount': 'first',
                'is_weekend': 'first',
                'is_month_end': 'first',
                'is_payday': 'first',
                'hour_sin': 'mean',
                'hour_cos': 'mean',
                'day_sin': 'first',
                'day_cos': 'first',
                'month_sin': 'first',
                'month_cos': 'first'
            }).dropna()
            
            # Add lag features for ensemble
            for lag in [1, 3, 7]:
                daily_features[f'spending_lag_{lag}'] = daily_features['daily_spending'].shift(lag)
            
            daily_features = daily_features.dropna()
            
            if len(daily_features) > 30:  # Minimum data for ensemble
                # Prepare ensemble training data
                ensemble_features = [col for col in daily_features.columns if col != 'daily_spending']
                X_ensemble = daily_features[ensemble_features].values
                y_ensemble = daily_features['daily_spending'].values
                
                # Scale ensemble features
                X_ensemble_scaled = StandardScaler().fit_transform(X_ensemble)
                
                # Train ensemble models
                self.ensemble_model = self.build_ensemble_model()
                
                for name, model in self.ensemble_model.items():
                    model.fit(X_ensemble_scaled, y_ensemble)
                    
                    # Calculate feature importance
                    if hasattr(model, 'feature_importances_'):
                        self.feature_importance[name] = dict(zip(
                            ensemble_features, 
                            model.feature_importances_
                        ))
            
            # Train category-specific models
            if 'category' in df.columns:
                self.train_category_models(df_processed)
            
            self.is_trained = True
            logger.info("Model training completed successfully")
            
            return {
                'status': 'success',
                'lstm_loss': history.history['loss'][-1],
                'lstm_val_loss': history.history['val_loss'][-1],
                'feature_importance': self.feature_importance,
                'training_samples': len(X_train_seq)
            }
            
        except Exception as e:
            logger.error(f"Model training failed: {str(e)}")
            raise
    
    def train_category_models(self, df):
        """
        Train category-specific spending models
        """
        categories = df['category'].unique()
        
        for category in categories:
            try:
                category_data = df[df['category'] == category].copy()
                
                if len(category_data) < 50:  # Minimum samples for category model
                    continue
                
                # Aggregate by day for category
                daily_category = category_data.groupby(category_data.index.date).agg({
                    'amount': 'sum',
                    'is_weekend': 'first',
                    'month': 'first',
                    'day_of_week': 'first'
                })
                
                if len(daily_category) < 30:
                    continue
                
                # Simple features for category model
                X_cat = daily_category[['is_weekend', 'month', 'day_of_week']].values
                y_cat = daily_category['amount'].values
                
                # Train simple model for category
                model = RandomForestRegressor(n_estimators=50, random_state=42)
                model.fit(X_cat, y_cat)
                
                self.category_models[category] = {
                    'model': model,
                    'scaler': StandardScaler().fit(X_cat)
                }
                
            except Exception as e:
                logger.warning(f"Failed to train model for category {category}: {str(e)}")
    
    def predict(self, df, user_id=None, prediction_days=7):
        """
        Make spending predictions
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before making predictions")
        
        logger.info(f"Making spending predictions for user: {user_id or 'global'}")
        
        try:
            # Prepare features
            df_processed = self.prepare_features(df.copy())
            df_processed = df_processed.dropna()
            
            predictions = {}
            
            # LSTM predictions
            if self.lstm_model is not None and len(df_processed) >= self.config['sequence_length']:
                lstm_pred = self._predict_lstm(df_processed, prediction_days)
                predictions['lstm'] = lstm_pred
            
            # Ensemble predictions
            if self.ensemble_model is not None:
                ensemble_pred = self._predict_ensemble(df_processed, prediction_days)
                predictions['ensemble'] = ensemble_pred
            
            # Category predictions
            if self.category_models and 'category' in df.columns:
                category_pred = self._predict_categories(df_processed, prediction_days)
                predictions['categories'] = category_pred
            
            # Combine predictions
            final_prediction = self._combine_predictions(predictions, prediction_days)
            
            return {
                'predictions': final_prediction,
                'individual_models': predictions,
                'confidence_intervals': self._calculate_confidence_intervals(predictions),
                'prediction_metadata': {
                    'model_version': self.model_version,
                    'prediction_date': datetime.now().isoformat(),
                    'user_id': user_id,
                    'prediction_horizon': prediction_days
                }
            }
            
        except Exception as e:
            logger.error(f"Prediction failed: {str(e)}")
            raise
    
    def _predict_lstm(self, df, prediction_days):
        """
        Make predictions using LSTM model
        """
        # Get last sequence
        feature_cols = [col for col in df.columns if col != 'daily_spending' and df[col].dtype in ['float64', 'int64']]
        last_sequence = df[feature_cols].tail(self.config['sequence_length']).values
        
        # Scale features
        last_sequence_scaled = self.feature_scaler.transform(
            last_sequence.reshape(-1, last_sequence.shape[-1])
        ).reshape(1, last_sequence.shape[0], last_sequence.shape[1])
        
        # Predict
        prediction_scaled = self.lstm_model.predict(last_sequence_scaled, verbose=0)
        
        # Inverse scale
        prediction = self.amount_scaler.inverse_transform(prediction_scaled)[0]
        
        # Extend prediction if needed
        if len(prediction) < prediction_days:
            # Simple extension using last predicted value
            last_value = prediction[-1]
            extension = [last_value] * (prediction_days - len(prediction))
            prediction = np.concatenate([prediction, extension])
        
        return prediction[:prediction_days]
    
    def _predict_ensemble(self, df, prediction_days):
        """
        Make predictions using ensemble models
        """
        # Get latest daily features
        daily_features = df.groupby(df.index.date).agg({
            'daily_spending': 'first',
            'daily_transaction_count': 'first',
            'avg_transaction_amount': 'first',
            'is_weekend': 'first',
            'is_month_end': 'first',
            'is_payday': 'first',
            'hour_sin': 'mean',
            'hour_cos': 'mean',
            'day_sin': 'first',
            'day_cos': 'first',
            'month_sin': 'first',
            'month_cos': 'first'
        }).tail(1)
        
        predictions = []
        
        for model_name, model in self.ensemble_model.items():
            # Simple prediction (would be enhanced with proper feature engineering)
            base_features = daily_features.iloc[0][['is_weekend', 'is_month_end', 'is_payday', 
                                                   'hour_sin', 'hour_cos', 'day_sin', 'day_cos',
                                                   'month_sin', 'month_cos']].values.reshape(1, -1)
            
            pred = model.predict(base_features)[0]
            
            # Extend prediction
            daily_pred = [pred] * prediction_days
            predictions.append(daily_pred)
        
        # Average ensemble predictions
        return np.mean(predictions, axis=0)
    
    def _predict_categories(self, df, prediction_days):
        """
        Make category-specific predictions
        """
        category_predictions = {}
        
        for category, model_info in self.category_models.items():
            try:
                # Simple feature extraction for category prediction
                features = np.array([[0, datetime.now().month, datetime.now().weekday()]])  # is_weekend, month, day_of_week
                
                pred = model_info['model'].predict(features)[0]
                category_predictions[category] = [pred] * prediction_days
                
            except Exception as e:
                logger.warning(f"Category prediction failed for {category}: {str(e)}")
        
        return category_predictions
    
    def _combine_predictions(self, predictions, prediction_days):
        """
        Combine predictions from different models
        """
        if not predictions:
            return [0.0] * prediction_days
        
        # Weights for different models
        weights = {
            'lstm': 0.5,
            'ensemble': 0.3,
            'categories': 0.2
        }
        
        combined = np.zeros(prediction_days)
        total_weight = 0
        
        for model_type, pred in predictions.items():
            if model_type in weights:
                if model_type == 'categories':
                    # Sum category predictions
                    category_sum = np.sum(list(pred.values()), axis=0)
                    combined += weights[model_type] * category_sum
                else:
                    combined += weights[model_type] * np.array(pred)
                total_weight += weights[model_type]
        
        if total_weight > 0:
            combined /= total_weight
        
        return combined.tolist()
    
    def _calculate_confidence_intervals(self, predictions, confidence=0.95):
        """
        Calculate confidence intervals for predictions
        """
        if not predictions:
            return None
        
        # Simple confidence interval calculation
        # In production, this would use more sophisticated methods
        all_predictions = []
        
        for model_type, pred in predictions.items():
            if model_type == 'categories':
                all_predictions.extend(list(pred.values()))
            else:
                all_predictions.append(pred)
        
        if not all_predictions:
            return None
        
        predictions_array = np.array(all_predictions)
        std = np.std(predictions_array, axis=0)
        mean = np.mean(predictions_array, axis=0)
        
        # Assuming normal distribution
        z_score = 1.96 if confidence == 0.95 else 2.576  # 95% or 99%
        
        lower_bound = mean - z_score * std
        upper_bound = mean + z_score * std
        
        return {
            'lower_bound': lower_bound.tolist(),
            'upper_bound': upper_bound.tolist(),
            'confidence_level': confidence
        }
    
    def evaluate(self, df, user_id=None):
        """
        Evaluate model performance
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before evaluation")
        
        logger.info(f"Evaluating model for user: {user_id or 'global'}")
        
        try:
            # Prepare test data
            df_processed = self.prepare_features(df.copy())
            df_processed = df_processed.dropna()
            
            # Create sequences
            X_seq, y_seq, _ = self.create_sequences(df_processed)
            
            if len(X_seq) == 0:
                return {'error': 'Insufficient data for evaluation'}
            
            # Scale data
            X_scaled = self.feature_scaler.transform(
                X_seq.reshape(-1, X_seq.shape[-1])
            ).reshape(X_seq.shape)
            
            y_scaled = self.amount_scaler.transform(y_seq)
            
            # LSTM evaluation
            lstm_pred_scaled = self.lstm_model.predict(X_scaled, verbose=0)
            lstm_pred = self.amount_scaler.inverse_transform(lstm_pred_scaled)
            
            # Calculate metrics
            mae = mean_absolute_error(y_seq.flatten(), lstm_pred.flatten())
            mse = mean_squared_error(y_seq.flatten(), lstm_pred.flatten())
            rmse = np.sqrt(mse)
            r2 = r2_score(y_seq.flatten(), lstm_pred.flatten())
            
            # Calculate MAPE (Mean Absolute Percentage Error)
            mape = np.mean(np.abs((y_seq.flatten() - lstm_pred.flatten()) / (y_seq.flatten() + 1e-8))) * 100
            
            return {
                'mae': float(mae),
                'mse': float(mse),
                'rmse': float(rmse),
                'r2': float(r2),
                'mape': float(mape),
                'evaluation_samples': len(X_seq),
                'model_version': self.model_version
            }
            
        except Exception as e:
            logger.error(f"Model evaluation failed: {str(e)}")
            return {'error': str(e)}
    
    def save_model(self, filepath):
        """
        Save trained model to disk
        """
        if not self.is_trained:
            raise ValueError("No trained model to save")
        
        model_data = {
            'config': self.config,
            'is_trained': self.is_trained,
            'training_history': self.training_history,
            'feature_importance': self.feature_importance,
            'model_version': self.model_version,
            'amount_scaler': self.amount_scaler,
            'feature_scaler': self.feature_scaler,
            'category_encoder': self.category_encoder,
            'category_models': self.category_models
        }
        
        # Save LSTM model separately
        if self.lstm_model:
            self.lstm_model.save(f"{filepath}_lstm.h5")
        
        # Save ensemble models
        if self.ensemble_model:
            joblib.dump(self.ensemble_model, f"{filepath}_ensemble.pkl")
        
        # Save other components
        joblib.dump(model_data, f"{filepath}_metadata.pkl")
        
        logger.info(f"Model saved to {filepath}")
    
    def load_model(self, filepath):
        """
        Load trained model from disk
        """
        try:
            # Load metadata
            model_data = joblib.load(f"{filepath}_metadata.pkl")
            
            self.config = model_data['config']
            self.is_trained = model_data['is_trained']
            self.training_history = model_data['training_history']
            self.feature_importance = model_data['feature_importance']
            self.model_version = model_data['model_version']
            self.amount_scaler = model_data['amount_scaler']
            self.feature_scaler = model_data['feature_scaler']
            self.category_encoder = model_data['category_encoder']
            self.category_models = model_data['category_models']
            
            # Load LSTM model
            try:
                self.lstm_model = keras.models.load_model(f"{filepath}_lstm.h5")
            except:
                logger.warning("Could not load LSTM model")
            
            # Load ensemble models
            try:
                self.ensemble_model = joblib.load(f"{filepath}_ensemble.pkl")
            except:
                logger.warning("Could not load ensemble models")
            
            logger.info(f"Model loaded from {filepath}")
            
        except Exception as e:
            logger.error(f"Failed to load model: {str(e)}")
            raise
    
    def get_model_info(self):
        """
        Get model information and statistics
        """
        return {
            'model_version': self.model_version,
            'is_trained': self.is_trained,
            'config': self.config,
            'feature_importance': self.feature_importance,
            'training_history': self.training_history,
            'has_lstm': self.lstm_model is not None,
            'has_ensemble': self.ensemble_model is not None,
            'category_models': list(self.category_models.keys()) if self.category_models else []
        }

# Example usage and testing
if __name__ == "__main__":
    # Generate sample data for testing
    np.random.seed(42)
    
    dates = pd.date_range(start='2023-01-01', end='2024-01-01', freq='H')
    n_samples = len(dates)
    
    # Generate realistic spending patterns
    base_spending = 50 + 30 * np.sin(2 * np.pi * np.arange(n_samples) / (24 * 7))  # Weekly pattern
    noise = np.random.normal(0, 10, n_samples)
    amounts = np.maximum(0, base_spending + noise)
    
    # Add some high-value transactions
    high_value_mask = np.random.random(n_samples) < 0.05
    amounts[high_value_mask] *= 5
    
    sample_data = pd.DataFrame({
        'timestamp': dates,
        'amount': amounts,
        'category': np.random.choice(['food', 'transportation', 'shopping', 'entertainment'], n_samples),
        'merchant': np.random.choice(['Merchant_A', 'Merchant_B', 'Merchant_C'], n_samples),
        'user_id': 'test_user_123'
    })
    
    # Test the model
    model = SpendingPredictionModel()
    
    # Train
    print("Training model...")
    train_result = model.train(sample_data, user_id='test_user_123')
    print(f"Training result: {train_result}")
    
    # Predict
    print("Making predictions...")
    predictions = model.predict(sample_data.tail(100), user_id='test_user_123', prediction_days=7)
    print(f"Predictions: {predictions['predictions']}")
    
    # Evaluate
    print("Evaluating model...")
    evaluation = model.evaluate(sample_data.tail(200), user_id='test_user_123')
    print(f"Evaluation metrics: {evaluation}")
    
    # Model info
    print("Model info:")
    print(model.get_model_info())