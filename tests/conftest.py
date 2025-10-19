"""
Global pytest configuration and fixtures for FinBot ML Analytics tests.
"""

import asyncio
import os
import pytest
import tempfile
import shutil
from typing import Generator, Dict, Any
from unittest.mock import Mock, patch

import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import redis
import httpx

from src.ml.models.base import BaseModel
from src.analytics.database import Database
from src.analytics.cache import CacheManager
from src.ml.feature_store import FeatureStore
from tests.utils.test_data import TestDataGenerator
from tests.utils.mock_services import MockMLServices


# Test configuration
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", 
    "postgresql://postgres:postgres@localhost:5432/test_ml_db"
)
TEST_REDIS_URL = os.getenv("TEST_REDIS_URL", "redis://localhost:6379/1")
TEST_API_BASE_URL = os.getenv("TEST_API_BASE_URL", "http://localhost:8080")


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session")
def test_database_url():
    """Provide test database URL."""
    return TEST_DATABASE_URL


@pytest.fixture(scope="session")
def test_redis_url():
    """Provide test Redis URL."""
    return TEST_REDIS_URL


@pytest.fixture(scope="session")
def test_api_base_url():
    """Provide test API base URL."""
    return TEST_API_BASE_URL


@pytest.fixture(scope="session")
def database_engine(test_database_url):
    """Create database engine for testing."""
    engine = create_engine(test_database_url, echo=False)
    yield engine
    engine.dispose()


@pytest.fixture(scope="function")
def database_session(database_engine):
    """Create database session for testing."""
    Session = sessionmaker(bind=database_engine)
    session = Session()
    
    # Start transaction
    transaction = session.begin()
    
    yield session
    
    # Rollback transaction
    transaction.rollback()
    session.close()


@pytest.fixture(scope="function")
def database(database_session):
    """Create Database instance for testing."""
    db = Database()
    db._session = database_session
    yield db


@pytest.fixture(scope="function")
def redis_client(test_redis_url):
    """Create Redis client for testing."""
    client = redis.from_url(test_redis_url)
    
    # Clear test database
    client.flushdb()
    
    yield client
    
    # Clean up
    client.flushdb()
    client.close()


@pytest.fixture(scope="function")
def cache_manager(redis_client):
    """Create CacheManager instance for testing."""
    cache = CacheManager(redis_client=redis_client)
    yield cache


@pytest.fixture(scope="function")
def temp_directory():
    """Create temporary directory for testing."""
    temp_dir = tempfile.mkdtemp()
    yield temp_dir
    shutil.rmtree(temp_dir)


@pytest.fixture(scope="function")
def temp_model_directory(temp_directory):
    """Create temporary model directory for testing."""
    model_dir = os.path.join(temp_directory, "models")
    os.makedirs(model_dir, exist_ok=True)
    yield model_dir


@pytest.fixture(scope="function")
def temp_data_directory(temp_directory):
    """Create temporary data directory for testing."""
    data_dir = os.path.join(temp_directory, "data")
    os.makedirs(data_dir, exist_ok=True)
    yield data_dir


@pytest.fixture(scope="session")
def test_data_generator():
    """Create test data generator."""
    return TestDataGenerator()


@pytest.fixture(scope="function")
def sample_transaction_data(test_data_generator):
    """Generate sample transaction data for testing."""
    return test_data_generator.generate_transactions(n_transactions=1000)


@pytest.fixture(scope="function")
def sample_user_data(test_data_generator):
    """Generate sample user data for testing."""
    return test_data_generator.generate_users(n_users=100)


@pytest.fixture(scope="function")
def sample_financial_data(test_data_generator):
    """Generate sample financial data for testing."""
    return test_data_generator.generate_financial_profiles(n_profiles=50)


@pytest.fixture(scope="function")
def sample_ml_features(test_data_generator):
    """Generate sample ML features for testing."""
    return test_data_generator.generate_ml_features(n_samples=500)


@pytest.fixture(scope="function")
def mock_ml_models():
    """Create mock ML models for testing."""
    models = {
        "anomaly_detection": Mock(spec=BaseModel),
        "risk_assessment": Mock(spec=BaseModel),
        "budget_optimization": Mock(spec=BaseModel),
        "goal_tracking": Mock(spec=BaseModel)
    }
    
    # Configure mock behaviors
    models["anomaly_detection"].predict.return_value = {
        "is_anomaly": False,
        "anomaly_score": 0.1,
        "confidence": 0.95
    }
    
    models["risk_assessment"].predict.return_value = {
        "risk_score": 0.3,
        "risk_level": "low",
        "confidence": 0.88
    }
    
    models["budget_optimization"].predict.return_value = {
        "optimized_budget": {"housing": 2000, "food": 800, "savings": 1200},
        "projected_savings": 200,
        "confidence": 0.92
    }
    
    models["goal_tracking"].predict.return_value = {
        "progress_percentage": 65,
        "on_track": True,
        "projected_completion": "2024-12-31"
    }
    
    return models


@pytest.fixture(scope="function")
def mock_feature_store():
    """Create mock feature store for testing."""
    feature_store = Mock(spec=FeatureStore)
    
    # Configure mock behaviors
    feature_store.get_features.return_value = pd.DataFrame({
        "user_id": [1, 2, 3],
        "avg_monthly_spending": [2500.0, 3200.0, 1800.0],
        "spending_volatility": [0.15, 0.22, 0.08],
        "credit_score": [750, 680, 820]
    })
    
    feature_store.store_features.return_value = True
    
    return feature_store


@pytest.fixture(scope="function")
def mock_ml_services():
    """Create mock ML services for testing."""
    return MockMLServices()


@pytest.fixture(scope="function")
async def http_client(test_api_base_url):
    """Create HTTP client for API testing."""
    async with httpx.AsyncClient(base_url=test_api_base_url) as client:
        yield client


@pytest.fixture(scope="function")
def api_headers():
    """Provide API headers for testing."""
    return {
        "Content-Type": "application/json",
        "X-API-Key": "test-api-key",
        "Authorization": "Bearer test-token"
    }


@pytest.fixture(scope="function")
def mock_environment_variables():
    """Mock environment variables for testing."""
    env_vars = {
        "ENVIRONMENT": "test",
        "LOG_LEVEL": "DEBUG",
        "DATABASE_URL": TEST_DATABASE_URL,
        "REDIS_URL": TEST_REDIS_URL,
        "ML_MODEL_PATH": "/tmp/test_models",
        "FEATURE_STORE_URL": "http://localhost:8081",
        "PROMETHEUS_PORT": "9090"
    }
    
    with patch.dict(os.environ, env_vars):
        yield env_vars


@pytest.fixture(scope="function")
def performance_metrics():
    """Provide performance metrics tracking for tests."""
    metrics = {
        "start_time": None,
        "end_time": None,
        "duration": None,
        "memory_usage": None,
        "cpu_usage": None
    }
    
    import time
    import psutil
    
    process = psutil.Process()
    metrics["start_time"] = time.time()
    metrics["memory_usage"] = process.memory_info().rss / 1024 / 1024  # MB
    
    yield metrics
    
    metrics["end_time"] = time.time()
    metrics["duration"] = metrics["end_time"] - metrics["start_time"]


# Pytest hooks
def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "unit: mark test as a unit test"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as an integration test"
    )
    config.addinivalue_line(
        "markers", "e2e: mark test as an end-to-end test"
    )
    config.addinivalue_line(
        "markers", "performance: mark test as a performance test"
    )
    config.addinivalue_line(
        "markers", "ml: mark test as ML-specific"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )
    config.addinivalue_line(
        "markers", "gpu: mark test as requiring GPU"
    )


def pytest_collection_modifyitems(config, items):
    """Modify test collection to add markers based on file paths."""
    for item in items:
        # Add markers based on file path
        if "unit" in str(item.fspath):
            item.add_marker(pytest.mark.unit)
        elif "integration" in str(item.fspath):
            item.add_marker(pytest.mark.integration)
        elif "e2e" in str(item.fspath):
            item.add_marker(pytest.mark.e2e)
        elif "performance" in str(item.fspath):
            item.add_marker(pytest.mark.performance)
        
        # Add ML marker for ML-related tests
        if "ml" in str(item.fspath) or "model" in str(item.fspath):
            item.add_marker(pytest.mark.ml)
        
        # Add slow marker for tests that might take longer
        if any(keyword in item.name.lower() for keyword in ["train", "large", "batch"]):
            item.add_marker(pytest.mark.slow)


@pytest.fixture(autouse=True)
def cleanup_after_test():
    """Cleanup after each test."""
    yield
    
    # Clear any global state
    # Reset singletons if any
    # Clean up temporary files
    pass


# Custom assertions
def assert_model_prediction_format(prediction: Dict[str, Any], model_type: str):
    """Assert that model prediction has correct format."""
    if model_type == "anomaly_detection":
        assert "is_anomaly" in prediction
        assert "anomaly_score" in prediction
        assert "confidence" in prediction
        assert isinstance(prediction["is_anomaly"], bool)
        assert 0 <= prediction["anomaly_score"] <= 1
        assert 0 <= prediction["confidence"] <= 1
    
    elif model_type == "risk_assessment":
        assert "risk_score" in prediction
        assert "risk_level" in prediction
        assert "confidence" in prediction
        assert 0 <= prediction["risk_score"] <= 1
        assert prediction["risk_level"] in ["very_low", "low", "medium", "high", "very_high"]
        assert 0 <= prediction["confidence"] <= 1
    
    elif model_type == "budget_optimization":
        assert "optimized_budget" in prediction
        assert "projected_savings" in prediction
        assert "confidence" in prediction
        assert isinstance(prediction["optimized_budget"], dict)
        assert isinstance(prediction["projected_savings"], (int, float))
        assert 0 <= prediction["confidence"] <= 1


def assert_api_response_format(response, expected_status=200):
    """Assert that API response has correct format."""
    assert response.status_code == expected_status
    
    if expected_status == 200:
        data = response.json()
        assert "success" in data
        assert data["success"] is True
    
    elif expected_status >= 400:
        data = response.json()
        assert "success" in data
        assert data["success"] is False
        assert "error" in data