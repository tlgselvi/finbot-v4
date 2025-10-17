"""
Feast Feature Store Configuration for FinBot AI Analytics
Defines feature definitions, data sources, and serving configurations
"""

from datetime import timedelta
from feast import Entity, Feature, FeatureView, FileSource, ValueType
from feast.data_source import DataSource
from feast.infra.offline_stores.contrib.postgres_offline_store.postgres_source import PostgreSQLSource
from feast.infra.online_stores.redis import RedisOnlineStoreConfig
from feast.repo_config import RepoConfig
import os

# Feature Store Configuration
def get_feast_config():
    """Get Feast repository configuration"""
    return RepoConfig(
        registry="postgresql://finbot:password@localhost:5432/feast_registry",
        project="finbot_ai_analytics",
        provider="local",
        offline_store={
            "type": "postgres",
            "host": os.getenv("POSTGRES_HOST", "localhost"),
            "port": int(os.getenv("POSTGRES_PORT", "5432")),
            "database": os.getenv("POSTGRES_DB", "finbot"),
            "user": os.getenv("POSTGRES_USER", "finbot"),
            "password": os.getenv("POSTGRES_PASSWORD", "password"),
        },
        online_store=RedisOnlineStoreConfig(
            connection_string=os.getenv("REDIS_URL", "redis://localhost:6379")
        ),
        entity_key_serialization_version=2,
    )

# Entities
user_entity = Entity(
    name="user",
    value_type=ValueType.STRING,
    description="User identifier for financial analytics"
)

transaction_entity = Entity(
    name="transaction",
    value_type=ValueType.STRING,
    description="Transaction identifier"
)

merchant_entity = Entity(
    name="merchant",
    value_type=ValueType.STRING,
    description="Merchant identifier"
)

# Data Sources
transactions_source = PostgreSQLSource(
    name="transactions_source",
    query="""
        SELECT 
            user_id,
            transaction_id,
            merchant,
            amount,
            category,
            timestamp,
            location_lat,
            location_lng,
            is_weekend,
            is_business_hours,
            hour_of_day,
            day_of_week,
            month,
            amount_category,
            is_international
        FROM processed_transactions
    """,
    timestamp_field="timestamp",
)

user_spending_patterns_source = PostgreSQLSource(
    name="user_spending_patterns_source",
    query="""
        SELECT 
            user_id,
            avg_transaction_amount,
            monthly_spending_total,
            transaction_frequency,
            most_frequent_category,
            most_frequent_merchant,
            spending_variance,
            last_transaction_date,
            created_at as timestamp
        FROM user_spending_patterns
    """,
    timestamp_field="timestamp",
)

merchant_statistics_source = PostgreSQLSource(
    name="merchant_statistics_source",
    query="""
        SELECT 
            merchant,
            avg_transaction_amount,
            transaction_count,
            unique_users,
            category,
            popularity_score,
            risk_score,
            created_at as timestamp
        FROM merchant_statistics
    """,
    timestamp_field="timestamp",
)

# Feature Views

# Transaction Features
transaction_features = FeatureView(
    name="transaction_features",
    entities=["user", "transaction"],
    ttl=timedelta(days=1),
    features=[
        Feature(name="amount", dtype=ValueType.DOUBLE),
        Feature(name="category", dtype=ValueType.STRING),
        Feature(name="merchant", dtype=ValueType.STRING),
        Feature(name="location_lat", dtype=ValueType.DOUBLE),
        Feature(name="location_lng", dtype=ValueType.DOUBLE),
        Feature(name="is_weekend", dtype=ValueType.BOOL),
        Feature(name="is_business_hours", dtype=ValueType.BOOL),
        Feature(name="hour_of_day", dtype=ValueType.INT32),
        Feature(name="day_of_week", dtype=ValueType.INT32),
        Feature(name="month", dtype=ValueType.INT32),
        Feature(name="amount_category", dtype=ValueType.STRING),
        Feature(name="is_international", dtype=ValueType.BOOL),
    ],
    online=True,
    source=transactions_source,
    tags={"team": "ai_analytics", "type": "transaction"}
)

# User Spending Pattern Features
user_spending_features = FeatureView(
    name="user_spending_features",
    entities=["user"],
    ttl=timedelta(hours=6),  # Updated every 6 hours
    features=[
        Feature(name="avg_transaction_amount", dtype=ValueType.DOUBLE),
        Feature(name="monthly_spending_total", dtype=ValueType.DOUBLE),
        Feature(name="transaction_frequency", dtype=ValueType.DOUBLE),
        Feature(name="most_frequent_category", dtype=ValueType.STRING),
        Feature(name="most_frequent_merchant", dtype=ValueType.STRING),
        Feature(name="spending_variance", dtype=ValueType.DOUBLE),
        Feature(name="days_since_last_transaction", dtype=ValueType.INT32),
    ],
    online=True,
    source=user_spending_patterns_source,
    tags={"team": "ai_analytics", "type": "user_behavior"}
)

# Merchant Statistics Features
merchant_features = FeatureView(
    name="merchant_features",
    entities=["merchant"],
    ttl=timedelta(days=7),  # Updated weekly
    features=[
        Feature(name="merchant_avg_amount", dtype=ValueType.DOUBLE),
        Feature(name="merchant_transaction_count", dtype=ValueType.INT64),
        Feature(name="merchant_unique_users", dtype=ValueType.INT64),
        Feature(name="merchant_category", dtype=ValueType.STRING),
        Feature(name="merchant_popularity_score", dtype=ValueType.DOUBLE),
        Feature(name="merchant_risk_score", dtype=ValueType.DOUBLE),
    ],
    online=True,
    source=merchant_statistics_source,
    tags={"team": "ai_analytics", "type": "merchant_data"}
)

# Real-time Features (computed on-demand)
user_realtime_features = FeatureView(
    name="user_realtime_features",
    entities=["user"],
    ttl=timedelta(minutes=5),  # Very short TTL for real-time data
    features=[
        Feature(name="transactions_last_hour", dtype=ValueType.INT32),
        Feature(name="spending_last_hour", dtype=ValueType.DOUBLE),
        Feature(name="transactions_today", dtype=ValueType.INT32),
        Feature(name="spending_today", dtype=ValueType.DOUBLE),
        Feature(name="unusual_activity_score", dtype=ValueType.DOUBLE),
    ],
    online=True,
    source=PostgreSQLSource(
        name="user_realtime_source",
        query="""
            SELECT 
                user_id,
                transactions_last_hour,
                spending_last_hour,
                transactions_today,
                spending_today,
                unusual_activity_score,
                created_at as timestamp
            FROM user_realtime_metrics
        """,
        timestamp_field="timestamp",
    ),
    tags={"team": "ai_analytics", "type": "realtime"}
)

# Aggregated Features for ML Models
user_ml_features = FeatureView(
    name="user_ml_features",
    entities=["user"],
    ttl=timedelta(hours=12),
    features=[
        # Spending behavior features
        Feature(name="avg_daily_spending", dtype=ValueType.DOUBLE),
        Feature(name="spending_trend_7d", dtype=ValueType.DOUBLE),
        Feature(name="spending_trend_30d", dtype=ValueType.DOUBLE),
        Feature(name="spending_volatility", dtype=ValueType.DOUBLE),
        
        # Category preferences
        Feature(name="food_spending_ratio", dtype=ValueType.DOUBLE),
        Feature(name="entertainment_spending_ratio", dtype=ValueType.DOUBLE),
        Feature(name="shopping_spending_ratio", dtype=ValueType.DOUBLE),
        Feature(name="transportation_spending_ratio", dtype=ValueType.DOUBLE),
        
        # Temporal patterns
        Feature(name="weekend_spending_ratio", dtype=ValueType.DOUBLE),
        Feature(name="evening_spending_ratio", dtype=ValueType.DOUBLE),
        Feature(name="business_hours_ratio", dtype=ValueType.DOUBLE),
        
        # Risk indicators
        Feature(name="high_value_transaction_ratio", dtype=ValueType.DOUBLE),
        Feature(name="international_transaction_ratio", dtype=ValueType.DOUBLE),
        Feature(name="new_merchant_ratio", dtype=ValueType.DOUBLE),
        
        # Seasonal features
        Feature(name="monthly_spending_seasonality", dtype=ValueType.DOUBLE),
        Feature(name="weekly_spending_pattern", dtype=ValueType.DOUBLE),
    ],
    online=True,
    source=PostgreSQLSource(
        name="user_ml_source",
        query="""
            SELECT 
                user_id,
                avg_daily_spending,
                spending_trend_7d,
                spending_trend_30d,
                spending_volatility,
                food_spending_ratio,
                entertainment_spending_ratio,
                shopping_spending_ratio,
                transportation_spending_ratio,
                weekend_spending_ratio,
                evening_spending_ratio,
                business_hours_ratio,
                high_value_transaction_ratio,
                international_transaction_ratio,
                new_merchant_ratio,
                monthly_spending_seasonality,
                weekly_spending_pattern,
                created_at as timestamp
            FROM user_ml_features
        """,
        timestamp_field="timestamp",
    ),
    tags={"team": "ai_analytics", "type": "ml_features"}
)

# Feature Services (for model serving)
from feast import FeatureService

# Spending prediction model features
spending_prediction_fs = FeatureService(
    name="spending_prediction_v1",
    features=[
        user_spending_features,
        user_ml_features,
        user_realtime_features,
    ],
    tags={"model": "spending_prediction", "version": "v1"}
)

# Anomaly detection model features
anomaly_detection_fs = FeatureService(
    name="anomaly_detection_v1",
    features=[
        transaction_features,
        user_spending_features,
        merchant_features,
        user_realtime_features,
    ],
    tags={"model": "anomaly_detection", "version": "v1"}
)

# Risk assessment model features
risk_assessment_fs = FeatureService(
    name="risk_assessment_v1",
    features=[
        transaction_features,
        user_ml_features,
        merchant_features,
    ],
    tags={"model": "risk_assessment", "version": "v1"}
)

# Budget optimization model features
budget_optimization_fs = FeatureService(
    name="budget_optimization_v1",
    features=[
        user_spending_features,
        user_ml_features,
    ],
    tags={"model": "budget_optimization", "version": "v1"}
)

# Export all feature definitions
__all__ = [
    "get_feast_config",
    "user_entity",
    "transaction_entity", 
    "merchant_entity",
    "transaction_features",
    "user_spending_features",
    "merchant_features",
    "user_realtime_features",
    "user_ml_features",
    "spending_prediction_fs",
    "anomaly_detection_fs",
    "risk_assessment_fs",
    "budget_optimization_fs"
]