"""
Risk Assessment Model for Financial Transactions
Kapsamlı finansal risk değerlendirme ve portföy analizi sistemi
"""

import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from sklearn.ensemble import RandomForestClassifier, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, mean_squared_error, r2_score
import joblib
import logging
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

# Logging yapılandırması
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RiskAssessmentModel:
    """
    Gelişmiş finansal risk değerlendirme modeli
    - Kredi riski analizi
    - Portföy risk değerlendirmesi
    - Acil durum fonu optimizasyonu
    - Yatırım risk profili belirleme
    """
    
    def __init__(self, config=None):
        self.config = config or {
            'risk_categories': ['very_low', 'low', 'medium', 'high', 'very_high'],
            'credit_score_model': {
                'n_estimators': 100,
                'max_depth': 10,
                'random_state': 42
            },
            'portfolio_risk_model': {
                'hidden_layers': [128, 64, 32],
                'dropout_rate': 0.3,
                'learning_rate': 0.001,
                'epochs': 100,
                'batch_size': 32
            },
            'emergency_fund_model': {
                'n_estimators': 150,
                'max_depth': 8,
                'learning_rate': 0.1,
                'random_state': 42
            },
            'risk_thresholds': {
                'very_low': 0.2,
                'low': 0.4,
                'medium': 0.6,
                'high': 0.8,
                'very_high': 1.0
            }
        }
        
        # Model bileşenleri
        self.credit_risk_model = None
        self.portfolio_risk_model = None
        self.emergency_fund_model = None
        self.investment_risk_model = None
        
        # Ön işleme bileşenleri
        self.scaler = StandardScaler()
        self.label_encoder = LabelEncoder()
        
        # Model metadata
        self.is_trained = False
        self.feature_names = []
        self.model_version = "1.0"
        self.training_stats = {}
        
    def prepare_risk_features(self, df):
        """
        Risk değerlendirmesi için kapsamlı özellik hazırlama
        """
        logger.info("Risk değerlendirmesi için özellikler hazırlanıyor")
        
        # Temel finansal özellikler
        features_df = pd.DataFrame(index=df.index)
        
        # Gelir ve harcama özellikleri
        if 'income' in df.columns:
            features_df['monthly_income'] = df['income']
            features_df['income_log'] = np.log1p(df['income'])
        
        if 'expenses' in df.columns:
            features_df['monthly_expenses'] = df['expenses']
            features_df['expense_ratio'] = df['expenses'] / (df.get('income', 1) + 1e-8)
        
        # Borç özellikleri
        if 'debt' in df.columns:
            features_df['total_debt'] = df['debt']
            features_df['debt_to_income'] = df['debt'] / (df.get('income', 1) + 1e-8)
            features_df['debt_log'] = np.log1p(df['debt'])
        
        # Varlık özellikleri
        if 'assets' in df.columns:
            features_df['total_assets'] = df['assets']
            features_df['net_worth'] = df['assets'] - df.get('debt', 0)
            features_df['asset_to_debt'] = df['assets'] / (df.get('debt', 1) + 1e-8)
        
        # Kredi geçmişi özellikleri
        if 'credit_score' in df.columns:
            features_df['credit_score'] = df['credit_score']
            features_df['credit_score_normalized'] = df['credit_score'] / 850.0  # FICO skoru normalize
        
        if 'payment_history' in df.columns:
            features_df['payment_history_score'] = df['payment_history']
            features_df['has_late_payments'] = (df['payment_history'] < 0.9).astype(int)
        
        # Harcama davranışı özellikleri
        if 'spending_volatility' in df.columns:
            features_df['spending_volatility'] = df['spending_volatility']
            features_df['is_volatile_spender'] = (df['spending_volatility'] > 0.3).astype(int)
        
        # İstihdam özellikleri
        if 'employment_status' in df.columns:
            employment_encoded = pd.get_dummies(df['employment_status'], prefix='employment')
            features_df = pd.concat([features_df, employment_encoded], axis=1)
        
        if 'employment_duration' in df.columns:
            features_df['employment_duration'] = df['employment_duration']
            features_df['employment_stability'] = np.minimum(df['employment_duration'] / 60, 1.0)  # 5 yıl max
        
        # Yaş ve demografik özellikler
        if 'age' in df.columns:
            features_df['age'] = df['age']
            features_df['age_group'] = pd.cut(df['age'], bins=[0, 25, 35, 50, 65, 100], 
                                            labels=['young', 'adult', 'middle', 'senior', 'elderly']).cat.codes
            features_df['is_young'] = (df['age'] < 30).astype(int)
            features_df['is_senior'] = (df['age'] > 60).astype(int)
        
        # Coğrafi risk faktörleri
        if 'location' in df.columns:
            # Basit coğrafi risk skorlaması
            high_risk_locations = ['high_risk_area_1', 'high_risk_area_2']
            features_df['location_risk'] = df['location'].isin(high_risk_locations).astype(int)
        
        # Finansal davranış özellikleri
        if 'savings_rate' in df.columns:
            features_df['savings_rate'] = df['savings_rate']
            features_df['has_emergency_fund'] = (df['savings_rate'] > 0.1).astype(int)
        
        # Yatırım portföyü özellikleri
        if 'investment_portfolio' in df.columns:
            features_df['portfolio_value'] = df['investment_portfolio']
            features_df['portfolio_to_income'] = df['investment_portfolio'] / (df.get('income', 1) + 1e-8)
        
        if 'portfolio_diversity' in df.columns:
            features_df['portfolio_diversity'] = df['portfolio_diversity']
            features_df['is_diversified'] = (df['portfolio_diversity'] > 0.7).astype(int)
        
        # Makroekonomik faktörler
        features_df['economic_indicator'] = np.sin(2 * np.pi * np.arange(len(df)) / 365.25) * 0.1 + 1.0
        features_df['market_volatility'] = np.random.normal(0.15, 0.05, len(df))  # Mock market volatility
        
        # Türetilmiş risk göstergeleri
        features_df['liquidity_ratio'] = features_df.get('total_assets', 0) / (features_df.get('monthly_expenses', 1) + 1e-8)
        features_df['financial_stress_score'] = (
            features_df.get('debt_to_income', 0) * 0.4 +
            features_df.get('expense_ratio', 0) * 0.3 +
            (1 - features_df.get('employment_stability', 1)) * 0.3
        )
        
        # NaN değerleri doldur
        features_df = features_df.fillna(features_df.median())
        
        return features_df
    
    def train_credit_risk_model(self, df):
        """
        Kredi riski değerlendirme modelini eğit
        """
        logger.info("Kredi riski modeli eğitiliyor...")
        
        features_df = self.prepare_risk_features(df)
        
        # Kredi riski hedef değişkeni oluştur (gerçek uygulamada mevcut olacak)
        if 'default_risk' not in df.columns:
            # Mock kredi riski skorları oluştur
            risk_score = (
                features_df.get('debt_to_income', 0) * 0.3 +
                (1 - features_df.get('credit_score_normalized', 0.7)) * 0.4 +
                features_df.get('financial_stress_score', 0) * 0.3
            )
            df['default_risk'] = (risk_score > 0.6).astype(int)
        
        # Özellik seçimi
        feature_cols = [col for col in features_df.columns if features_df[col].dtype in ['float64', 'int64']]
        X = features_df[feature_cols]
        y = df['default_risk']
        
        # Eğitim/test ayrımı
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
        
        # Model eğitimi
        self.credit_risk_model = RandomForestClassifier(**self.config['credit_score_model'])
        self.credit_risk_model.fit(X_train, y_train)
        
        # Değerlendirme
        train_score = self.credit_risk_model.score(X_train, y_train)
        test_score = self.credit_risk_model.score(X_test, y_test)
        
        # Özellik önem derecesi
        feature_importance = dict(zip(feature_cols, self.credit_risk_model.feature_importances_))
        
        return {
            'train_accuracy': train_score,
            'test_accuracy': test_score,
            'feature_importance': feature_importance,
            'feature_count': len(feature_cols)
        }
    
    def train_portfolio_risk_model(self, df):
        """
        Portföy riski değerlendirme modelini eğit
        """
        logger.info("Portföy riski modeli eğitiliyor...")
        
        features_df = self.prepare_risk_features(df)
        
        # Portföy riski hedef değişkeni (VaR - Value at Risk)
        if 'portfolio_var' not in df.columns:
            # Mock portföy VaR değerleri oluştur
            base_var = 0.05  # %5 temel VaR
            volatility_factor = features_df.get('market_volatility', 0.15)
            diversity_factor = 1 - features_df.get('portfolio_diversity', 0.7)
            
            df['portfolio_var'] = base_var * (1 + volatility_factor + diversity_factor)
        
        # Özellik seçimi
        feature_cols = [col for col in features_df.columns if features_df[col].dtype in ['float64', 'int64']]
        X = features_df[feature_cols]
        y = df['portfolio_var']
        
        # Veri ölçeklendirme
        X_scaled = self.scaler.fit_transform(X)
        
        # Eğitim/test ayrımı
        X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)
        
        # Neural network modeli oluştur
        self.portfolio_risk_model = self._build_portfolio_risk_nn(X_train.shape[1])
        
        # Model eğitimi
        history = self.portfolio_risk_model.fit(
            X_train, y_train,
            validation_data=(X_test, y_test),
            epochs=self.config['portfolio_risk_model']['epochs'],
            batch_size=self.config['portfolio_risk_model']['batch_size'],
            verbose=0,
            callbacks=[
                keras.callbacks.EarlyStopping(patience=10, restore_best_weights=True),
                keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=5)
            ]
        )
        
        # Değerlendirme
        train_predictions = self.portfolio_risk_model.predict(X_train, verbose=0)
        test_predictions = self.portfolio_risk_model.predict(X_test, verbose=0)
        
        train_mse = mean_squared_error(y_train, train_predictions)
        test_mse = mean_squared_error(y_test, test_predictions)
        test_r2 = r2_score(y_test, test_predictions)
        
        return {
            'train_mse': train_mse,
            'test_mse': test_mse,
            'test_r2': test_r2,
            'final_loss': history.history['loss'][-1],
            'feature_count': len(feature_cols)
        }
    
    def train_emergency_fund_model(self, df):
        """
        Acil durum fonu optimizasyon modelini eğit
        """
        logger.info("Acil durum fonu modeli eğitiliyor...")
        
        features_df = self.prepare_risk_features(df)
        
        # Optimal acil durum fonu hedef değişkeni
        if 'optimal_emergency_fund' not in df.columns:
            # 3-6 ay arası harcama tutarı (risk profiline göre)
            monthly_expenses = features_df.get('monthly_expenses', 3000)
            risk_multiplier = 3 + features_df.get('financial_stress_score', 0) * 3  # 3-6 ay arası
            
            df['optimal_emergency_fund'] = monthly_expenses * risk_multiplier
        
        # Özellik seçimi
        feature_cols = [col for col in features_df.columns if features_df[col].dtype in ['float64', 'int64']]
        X = features_df[feature_cols]
        y = df['optimal_emergency_fund']
        
        # Eğitim/test ayrımı
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        # Gradient Boosting modeli
        self.emergency_fund_model = GradientBoostingRegressor(**self.config['emergency_fund_model'])
        self.emergency_fund_model.fit(X_train, y_train)
        
        # Değerlendirme
        train_score = self.emergency_fund_model.score(X_train, y_train)
        test_score = self.emergency_fund_model.score(X_test, y_test)
        
        test_predictions = self.emergency_fund_model.predict(X_test)
        test_mse = mean_squared_error(y_test, test_predictions)
        
        return {
            'train_r2': train_score,
            'test_r2': test_score,
            'test_mse': test_mse,
            'feature_count': len(feature_cols)
        }
    
    def _build_portfolio_risk_nn(self, input_dim):
        """
        Portföy riski için neural network oluştur
        """
        model = keras.Sequential()
        
        # Input layer
        model.add(layers.Dense(
            self.config['portfolio_risk_model']['hidden_layers'][0],
            activation='relu',
            input_shape=(input_dim,)
        ))
        model.add(layers.Dropout(self.config['portfolio_risk_model']['dropout_rate']))
        
        # Hidden layers
        for units in self.config['portfolio_risk_model']['hidden_layers'][1:]:
            model.add(layers.Dense(units, activation='relu'))
            model.add(layers.Dropout(self.config['portfolio_risk_model']['dropout_rate']))
        
        # Output layer
        model.add(layers.Dense(1, activation='linear'))
        
        # Compile
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=self.config['portfolio_risk_model']['learning_rate']),
            loss='mse',
            metrics=['mae']
        )
        
        return model
    
    def train(self, df, user_id=None):
        """
        Tüm risk değerlendirme modellerini eğit
        """
        logger.info(f"Risk değerlendirme modelleri eğitiliyor - Kullanıcı: {user_id or 'global'}")
        
        try:
            if len(df) < 100:
                raise ValueError("Eğitim için yetersiz veri (minimum 100 örnek gerekli)")
            
            # Kredi riski modeli
            credit_results = self.train_credit_risk_model(df.copy())
            
            # Portföy riski modeli
            portfolio_results = self.train_portfolio_risk_model(df.copy())
            
            # Acil durum fonu modeli
            emergency_results = self.train_emergency_fund_model(df.copy())
            
            # Özellik isimlerini sakla
            features_df = self.prepare_risk_features(df)
            self.feature_names = [col for col in features_df.columns if features_df[col].dtype in ['float64', 'int64']]
            
            # Eğitim istatistikleri
            self.training_stats = {
                'credit_risk': credit_results,
                'portfolio_risk': portfolio_results,
                'emergency_fund': emergency_results,
                'total_samples': len(df),
                'feature_count': len(self.feature_names),
                'training_date': datetime.now().isoformat()
            }
            
            self.is_trained = True
            logger.info("Risk değerlendirme modelleri başarıyla eğitildi")
            
            return {
                'status': 'success',
                'training_stats': self.training_stats,
                'models_trained': ['credit_risk', 'portfolio_risk', 'emergency_fund']
            }
            
        except Exception as e:
            logger.error(f"Risk modeli eğitimi başarısız: {str(e)}")
            raise
    
    def assess_risk(self, user_data, assessment_type='comprehensive'):
        """
        Kapsamlı risk değerlendirmesi yap
        """
        if not self.is_trained:
            raise ValueError("Model eğitilmeden risk değerlendirmesi yapılamaz")
        
        logger.info(f"Risk değerlendirmesi yapılıyor - Tip: {assessment_type}")
        
        try:
            # Kullanıcı verilerini DataFrame'e dönüştür
            if isinstance(user_data, dict):
                df = pd.DataFrame([user_data])
            else:
                df = user_data.copy()
            
            # Özellikleri hazırla
            features_df = self.prepare_risk_features(df)
            
            # Özellik tutarlılığını sağla
            for feature in self.feature_names:
                if feature not in features_df.columns:
                    features_df[feature] = 0
            
            features_df = features_df[self.feature_names]
            
            results = {}
            
            # Kredi riski değerlendirmesi
            if assessment_type in ['comprehensive', 'credit']:
                credit_risk_prob = self.credit_risk_model.predict_proba(features_df)[0]
                results['credit_risk'] = {
                    'risk_probability': float(credit_risk_prob[1]),  # Default riski olasılığı
                    'risk_category': self._categorize_risk(credit_risk_prob[1]),
                    'confidence': float(max(credit_risk_prob))
                }
            
            # Portföy riski değerlendirmesi
            if assessment_type in ['comprehensive', 'portfolio']:
                X_scaled = self.scaler.transform(features_df)
                portfolio_var = self.portfolio_risk_model.predict(X_scaled, verbose=0)[0][0]
                results['portfolio_risk'] = {
                    'value_at_risk': float(portfolio_var),
                    'risk_category': self._categorize_portfolio_risk(portfolio_var),
                    'risk_percentage': float(portfolio_var * 100)
                }
            
            # Acil durum fonu önerisi
            if assessment_type in ['comprehensive', 'emergency_fund']:
                optimal_fund = self.emergency_fund_model.predict(features_df)[0]
                current_savings = user_data.get('savings', 0) if isinstance(user_data, dict) else df['savings'].iloc[0] if 'savings' in df.columns else 0
                
                results['emergency_fund'] = {
                    'recommended_amount': float(optimal_fund),
                    'current_amount': float(current_savings),
                    'shortfall': float(max(0, optimal_fund - current_savings)),
                    'adequacy_ratio': float(current_savings / optimal_fund) if optimal_fund > 0 else 1.0
                }
            
            # Genel risk profili
            if assessment_type == 'comprehensive':
                overall_risk = self._calculate_overall_risk(results)
                results['overall_assessment'] = overall_risk
            
            # Risk önerileri
            results['recommendations'] = self._generate_risk_recommendations(results, user_data)
            
            return {
                'assessment': results,
                'assessment_type': assessment_type,
                'timestamp': datetime.now().isoformat(),
                'model_version': self.model_version
            }
            
        except Exception as e:
            logger.error(f"Risk değerlendirmesi başarısız: {str(e)}")
            raise
    
    def _categorize_risk(self, risk_score):
        """Risk skorunu kategoriye dönüştür"""
        thresholds = self.config['risk_thresholds']
        
        if risk_score <= thresholds['very_low']:
            return 'very_low'
        elif risk_score <= thresholds['low']:
            return 'low'
        elif risk_score <= thresholds['medium']:
            return 'medium'
        elif risk_score <= thresholds['high']:
            return 'high'
        else:
            return 'very_high'
    
    def _categorize_portfolio_risk(self, var_score):
        """Portföy VaR skorunu kategoriye dönüştür"""
        if var_score <= 0.05:
            return 'low'
        elif var_score <= 0.10:
            return 'medium'
        elif var_score <= 0.20:
            return 'high'
        else:
            return 'very_high'
    
    def _calculate_overall_risk(self, results):
        """Genel risk profilini hesapla"""
        risk_scores = []
        
        if 'credit_risk' in results:
            risk_scores.append(results['credit_risk']['risk_probability'])
        
        if 'portfolio_risk' in results:
            risk_scores.append(results['portfolio_risk']['value_at_risk'])
        
        if 'emergency_fund' in results:
            # Acil durum fonu yetersizliği riski
            adequacy = results['emergency_fund']['adequacy_ratio']
            emergency_risk = max(0, 1 - adequacy)
            risk_scores.append(emergency_risk)
        
        overall_score = np.mean(risk_scores) if risk_scores else 0
        
        return {
            'overall_risk_score': float(overall_score),
            'risk_category': self._categorize_risk(overall_score),
            'risk_factors': len(risk_scores)
        }
    
    def _generate_risk_recommendations(self, results, user_data):
        """Risk değerlendirmesine göre öneriler oluştur"""
        recommendations = []
        
        # Kredi riski önerileri
        if 'credit_risk' in results:
            credit_risk = results['credit_risk']
            if credit_risk['risk_category'] in ['high', 'very_high']:
                recommendations.append({
                    'type': 'credit_improvement',
                    'priority': 'high',
                    'message': 'Kredi skorunuzu iyileştirmek için borçlarınızı azaltın ve ödemelerinizi zamanında yapın.',
                    'action_items': [
                        'Mevcut borçları konsolide edin',
                        'Kredi kartı kullanımını azaltın',
                        'Otomatik ödeme talimatı verin'
                    ]
                })
        
        # Portföy riski önerileri
        if 'portfolio_risk' in results:
            portfolio_risk = results['portfolio_risk']
            if portfolio_risk['risk_category'] in ['high', 'very_high']:
                recommendations.append({
                    'type': 'portfolio_diversification',
                    'priority': 'medium',
                    'message': 'Portföyünüzü çeşitlendirerek riski azaltabilirsiniz.',
                    'action_items': [
                        'Farklı sektörlere yatırım yapın',
                        'Tahvil oranını artırın',
                        'Uluslararası çeşitlendirme düşünün'
                    ]
                })
        
        # Acil durum fonu önerileri
        if 'emergency_fund' in results:
            emergency = results['emergency_fund']
            if emergency['adequacy_ratio'] < 0.8:
                recommendations.append({
                    'type': 'emergency_fund',
                    'priority': 'high',
                    'message': f"Acil durum fonunuz yetersiz. {emergency['shortfall']:.0f} TL daha biriktirmeniz öneriliyor.",
                    'action_items': [
                        'Aylık otomatik tasarruf planı oluşturun',
                        'Gereksiz harcamaları azaltın',
                        'Ek gelir kaynakları araştırın'
                    ]
                })
        
        return recommendations
    
    def get_model_info(self):
        """Model bilgilerini getir"""
        return {
            'model_version': self.model_version,
            'is_trained': self.is_trained,
            'config': self.config,
            'training_stats': self.training_stats,
            'feature_count': len(self.feature_names),
            'models': {
                'credit_risk': self.credit_risk_model is not None,
                'portfolio_risk': self.portfolio_risk_model is not None,
                'emergency_fund': self.emergency_fund_model is not None
            }
        }
    
    def save_model(self, filepath):
        """Eğitilmiş modeli kaydet"""
        if not self.is_trained:
            raise ValueError("Kaydedilecek eğitilmiş model yok")
        
        model_data = {
            'config': self.config,
            'is_trained': self.is_trained,
            'feature_names': self.feature_names,
            'model_version': self.model_version,
            'training_stats': self.training_stats,
            'scaler': self.scaler,
            'label_encoder': self.label_encoder,
            'credit_risk_model': self.credit_risk_model,
            'emergency_fund_model': self.emergency_fund_model
        }
        
        # Neural network'ü ayrı kaydet
        if self.portfolio_risk_model:
            self.portfolio_risk_model.save(f"{filepath}_portfolio_risk.h5")
        
        # Diğer bileşenleri kaydet
        joblib.dump(model_data, f"{filepath}_risk_assessment.pkl")
        
        logger.info(f"Risk değerlendirme modeli kaydedildi: {filepath}")
    
    def load_model(self, filepath):
        """Kaydedilmiş modeli yükle"""
        try:
            # Ana bileşenleri yükle
            model_data = joblib.load(f"{filepath}_risk_assessment.pkl")
            
            self.config = model_data['config']
            self.is_trained = model_data['is_trained']
            self.feature_names = model_data['feature_names']
            self.model_version = model_data['model_version']
            self.training_stats = model_data['training_stats']
            self.scaler = model_data['scaler']
            self.label_encoder = model_data['label_encoder']
            self.credit_risk_model = model_data['credit_risk_model']
            self.emergency_fund_model = model_data['emergency_fund_model']
            
            # Neural network'ü yükle
            try:
                self.portfolio_risk_model = keras.models.load_model(f"{filepath}_portfolio_risk.h5")
            except:
                logger.warning("Portföy riski modeli yüklenemedi")
            
            logger.info(f"Risk değerlendirme modeli yüklendi: {filepath}")
            
        except Exception as e:
            logger.error(f"Model yükleme başarısız: {str(e)}")
            raise

# Örnek kullanım ve test
if __name__ == "__main__":
    # Test verisi oluştur
    np.random.seed(42)
    
    n_samples = 1000
    
    # Gerçekçi finansal veriler oluştur
    sample_data = pd.DataFrame({
        'income': np.random.lognormal(mean=10, sigma=0.5, size=n_samples),  # Aylık gelir
        'expenses': np.random.lognormal(mean=9, sigma=0.4, size=n_samples),  # Aylık harcama
        'debt': np.random.lognormal(mean=8, sigma=0.8, size=n_samples),  # Toplam borç
        'assets': np.random.lognormal(mean=11, sigma=0.7, size=n_samples),  # Toplam varlık
        'credit_score': np.random.normal(700, 100, n_samples).clip(300, 850),  # Kredi skoru
        'payment_history': np.random.beta(9, 1, n_samples),  # Ödeme geçmişi (0-1)
        'spending_volatility': np.random.beta(2, 5, n_samples),  # Harcama volatilitesi
        'employment_status': np.random.choice(['employed', 'self_employed', 'unemployed'], n_samples, p=[0.7, 0.2, 0.1]),
        'employment_duration': np.random.exponential(36, n_samples),  # Ay cinsinden
        'age': np.random.normal(40, 15, n_samples).clip(18, 80),
        'savings_rate': np.random.beta(2, 8, n_samples),  # Tasarruf oranı
        'investment_portfolio': np.random.lognormal(mean=9, sigma=1, size=n_samples),
        'portfolio_diversity': np.random.beta(3, 2, n_samples),  # Portföy çeşitliliği
        'user_id': [f'user_{i}' for i in range(n_samples)]
    })
    
    # Modeli test et
    model = RiskAssessmentModel()
    
    # Eğit
    print("Risk değerlendirme modeli eğitiliyor...")
    train_result = model.train(sample_data)
    print(f"Eğitim sonucu: {train_result}")
    
    # Test kullanıcısı için risk değerlendirmesi
    test_user = {
        'income': 5000,
        'expenses': 3500,
        'debt': 15000,
        'assets': 50000,
        'credit_score': 650,
        'payment_history': 0.85,
        'spending_volatility': 0.3,
        'employment_status': 'employed',
        'employment_duration': 24,
        'age': 35,
        'savings_rate': 0.15,
        'investment_portfolio': 25000,
        'portfolio_diversity': 0.6,
        'savings': 8000
    }
    
    print("Risk değerlendirmesi yapılıyor...")
    risk_assessment = model.assess_risk(test_user)
    print(f"Risk değerlendirmesi: {risk_assessment}")
    
    # Model bilgileri
    print("Model bilgileri:")
    print(model.get_model_info())