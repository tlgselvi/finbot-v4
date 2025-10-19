"""
Monitoring and Alerting Tests

Test suite for monitoring system alerts, metrics collection,
and notification systems.
"""

import pytest
import asyncio
import json
import time
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, AsyncMock
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from services.monitoring_service import MLMonitoringService, AlertSeverity, Alert

class TestAlertingSystem:
    """Test alerting and notification functionality"""
    
    @pytest.fixture
    async def monitoring_service(self):
        """Create monitoring service for testing"""
        service = MLMonitoringService(redis_url="redis://localhost:6379/1")
        await service.initialize()
        yield service
        await service.close()
    
    @pytest.mark.asyncio
    async def test_alert_generation(self, monitoring_service):
        """Test alert generation for various conditions"""
        
        # Test high GPU utilization alert
        monitoring_service.update_gpu_metrics("0", "Test GPU", 95.0, 90.0)
        await monitoring_service.check_alert_conditions()
        
        # Verify alert was generated
        gpu_alerts = [alert for alert in monitoring_service.alerts 
                     if "GPU" in alert.message and alert.severity == AlertSeverity.WARNING]
        assert len(gpu_alerts) > 0, "Should generate GPU utilization alert"
        
        # Test alert content
        alert = gpu_alerts[0]
        assert alert.name == "HighGPUUtilization"
        assert "95.0%" in alert.message
        assert alert.labels["gpu_id"] == "0"
    
    @pytest.mark.asyncio
    async def test_alert_severity_levels(self, monitoring_service):
        """Test different alert severity levels"""
        
        # Create alerts of different severities
        critical_alert = Alert(
            name="CriticalTest",
            severity=AlertSeverity.CRITICAL,
            message="Critical test alert",
            labels={"service": "test"},
            timestamp=datetime.now()
        )
        
        warning_alert = Alert(
            name="WarningTest", 
            severity=AlertSeverity.WARNING,
            message="Warning test alert",
            labels={"service": "test"},
            timestamp=datetime.now()
        )
        
        info_alert = Alert(
            name="InfoTest",
            severity=AlertSeverity.INFO,
            message="Info test alert", 
            labels={"service": "test"},
            timestamp=datetime.now()
        )
        
        # Send alerts
        await monitoring_service._send_alert(critical_alert)
        await monitoring_service._send_alert(warning_alert)
        await monitoring_service._send_alert(info_alert)
        
        # Verify alerts were stored
        assert len(monitoring_service.alerts) >= 3
        
        # Check alert summary
        summary = await monitoring_service.get_alert_summary()
        assert summary["critical_alerts"] >= 1
        assert summary["warning_alerts"] >= 1
        assert summary["info_alerts"] >= 1
    
    @pytest.mark.asyncio
    async def test_alert_deduplication(self, monitoring_service):
        """Test that duplicate alerts are handled properly"""
        
        # Send same alert multiple times
        for i in range(5):
            monitoring_service.update_gpu_metrics("0", "Test GPU", 95.0, 90.0)
            await monitoring_service.check_alert_conditions()
            await asyncio.sleep(0.1)
        
        # Should not create excessive duplicate alerts
        gpu_alerts = [alert for alert in monitoring_service.alerts if "GPU" in alert.message]
        
        # Allow some duplicates but not excessive
        assert len(gpu_alerts) <= 10, "Should not create excessive duplicate alerts"
    
    @pytest.mark.asyncio
    async def test_alert_resolution(self, monitoring_service):
        """Test alert resolution when conditions improve"""
        
        # Generate alert condition
        monitoring_service.update_gpu_metrics("0", "Test GPU", 95.0, 90.0)
        await monitoring_service.check_alert_conditions()
        
        initial_alert_count = len(monitoring_service.alerts)
        
        # Improve conditions
        monitoring_service.update_gpu_metrics("0", "Test GPU", 50.0, 40.0)
        await monitoring_service.check_alert_conditions()
        
        # Verify no new alerts generated for good conditions
        new_alert_count = len(monitoring_service.alerts)
        
        # Should not generate alerts for good conditions
        recent_alerts = [alert for alert in monitoring_service.alerts 
                        if (datetime.now() - alert.timestamp).total_seconds() < 1]
        gpu_alerts_recent = [alert for alert in recent_alerts if "GPU" in alert.message]
        
        assert len(gpu_alerts_recent) == 0, "Should not generate alerts for good GPU utilization"

class TestMetricsCollection:
    """Test metrics collection functionality"""
    
    @pytest.fixture
    async def monitoring_service(self):
        """Create monitoring service for testing"""
        service = MLMonitoringService(redis_url="redis://localhost:6379/1")
        await service.initialize()
        yield service
        await service.close()
    
    @pytest.mark.asyncio
    async def test_model_metrics_collection(self, monitoring_service):
        """Test collection of model performance metrics"""
        
        model_name = "test_model"
        
        # Record various model metrics
        monitoring_service.record_model_request(model_name, "v1", "predict")
        monitoring_service.record_inference_time(model_name, 0.150)
        monitoring_service.update_model_accuracy(model_name, 0.85)
        monitoring_service.record_prediction_confidence(model_name, 0.92)
        monitoring_service.record_model_error(model_name, "v1", "timeout")
        
        # Get metrics
        metrics_text = monitoring_service.get_metrics()
        
        # Verify all metrics are present
        assert f'model_name="{model_name}"' in metrics_text
        assert "ml_model_requests_total" in metrics_text
        assert "ml_model_inference_duration_seconds" in metrics_text
        assert "ml_model_accuracy" in metrics_text
        assert "ml_prediction_confidence" in metrics_text
        assert "ml_model_errors_total" in metrics_text
    
    @pytest.mark.asyncio
    async def test_system_metrics_collection(self, monitoring_service):
        """Test system-level metrics collection"""
        
        # Collect system metrics
        await monitoring_service.collect_system_metrics()
        
        # Get metrics
        metrics_text = monitoring_service.get_metrics()
        
        # Should have GPU metrics if available
        if "gpu_utilization_percent" in metrics_text:
            assert "gpu_memory_used_percent" in metrics_text
        
        # Should have cache metrics if Redis available
        if monitoring_service.redis_client:
            assert "ml_cache_hit_rate" in metrics_text or "cache" in metrics_text.lower()
    
    @pytest.mark.asyncio
    async def test_business_metrics_collection(self, monitoring_service):
        """Test business metrics collection"""
        
        # Update business metrics
        monitoring_service.update_business_metrics(
            anomaly_rate=0.05,
            engagement_rate=0.75
        )
        
        # Get metrics
        metrics_text = monitoring_service.get_metrics()
        
        # Verify business metrics
        assert "ml_anomaly_detection_rate" in metrics_text
        assert "ml_insight_engagement_rate" in metrics_text
    
    @pytest.mark.asyncio
    async def test_data_quality_metrics(self, monitoring_service):
        """Test data quality metrics collection"""
        
        # Record data quality issues
        monitoring_service.record_data_quality_issue("missing_values", "transactions")
        monitoring_service.update_feature_missing_rate("user_age", 0.15)
        monitoring_service.update_data_freshness("transactions", time.time())
        
        # Get metrics
        metrics_text = monitoring_service.get_metrics()
        
        # Verify data quality metrics
        assert "ml_data_quality_issues_total" in metrics_text
        assert "ml_feature_missing_rate" in metrics_text
        assert "ml_data_last_updated_timestamp" in metrics_text
    
    @pytest.mark.asyncio
    async def test_training_metrics_collection(self, monitoring_service):
        """Test training-related metrics collection"""
        
        # Record training metrics
        monitoring_service.record_training_duration("test_model", 3600, "full")
        monitoring_service.record_model_loading_failure("test_model", "memory_error")
        monitoring_service.update_training_pipeline_status("daily_retrain", True)
        
        # Get metrics
        metrics_text = monitoring_service.get_metrics()
        
        # Verify training metrics
        assert "ml_training_duration_seconds" in metrics_text
        assert "ml_model_loading_failures_total" in metrics_text
        assert "ml_training_pipeline_status" in metrics_text

class TestMonitoringPerformance:
    """Test monitoring system performance"""
    
    @pytest.fixture
    async def monitoring_service(self):
        """Create monitoring service for testing"""
        service = MLMonitoringService(redis_url="redis://localhost:6379/1")
        await service.initialize()
        yield service
        await service.close()
    
    @pytest.mark.asyncio
    async def test_high_volume_metrics(self, monitoring_service):
        """Test handling high volume of metrics"""
        
        start_time = time.time()
        
        # Record large number of metrics
        for i in range(1000):
            monitoring_service.record_model_request(f"model_{i % 10}", "v1", "predict")
            monitoring_service.record_inference_time(f"model_{i % 10}", 0.1 + (i % 100) * 0.001)
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Should handle high volume efficiently
        assert duration < 2.0, f"High volume metrics took too long: {duration:.2f}s"
        
        # Verify metrics were recorded
        metrics_text = monitoring_service.get_metrics()
        assert "ml_model_requests_total" in metrics_text
    
    @pytest.mark.asyncio
    async def test_concurrent_metrics_recording(self, monitoring_service):
        """Test concurrent metrics recording"""
        
        async def record_metrics_batch(batch_id):
            """Record a batch of metrics"""
            for i in range(100):
                monitoring_service.record_model_request(f"model_{batch_id}", "v1", "predict")
                monitoring_service.record_inference_time(f"model_{batch_id}", 0.1)
                await asyncio.sleep(0.001)  # Small delay
        
        start_time = time.time()
        
        # Run concurrent metric recording
        tasks = [record_metrics_batch(i) for i in range(5)]
        await asyncio.gather(*tasks)
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Should handle concurrent access efficiently
        assert duration < 5.0, f"Concurrent metrics took too long: {duration:.2f}s"
        
        # Verify all metrics were recorded
        metrics_text = monitoring_service.get_metrics()
        assert "ml_model_requests_total" in metrics_text
    
    @pytest.mark.asyncio
    async def test_monitoring_loop_stability(self, monitoring_service):
        """Test monitoring loop stability over time"""
        
        # Start monitoring
        monitoring_task = asyncio.create_task(monitoring_service.start_monitoring(interval=0.1))
        
        # Let it run and record metrics during monitoring
        for i in range(50):
            monitoring_service.record_model_request("stability_test", "v1", "predict")
            monitoring_service.record_inference_time("stability_test", 0.1)
            await asyncio.sleep(0.05)
        
        # Stop monitoring
        monitoring_service.stop_monitoring()
        
        # Wait for monitoring to stop
        try:
            await asyncio.wait_for(monitoring_task, timeout=2)
        except asyncio.TimeoutError:
            monitoring_task.cancel()
        
        # Verify monitoring completed without errors
        assert not monitoring_service.is_monitoring
        
        # Verify metrics were collected during monitoring
        metrics_text = monitoring_service.get_metrics()
        assert "stability_test" in metrics_text

class TestAlertIntegration:
    """Test alert system integration"""
    
    @pytest.fixture
    async def monitoring_service(self):
        """Create monitoring service for testing"""
        service = MLMonitoringService(redis_url="redis://localhost:6379/1")
        await service.initialize()
        yield service
        await service.close()
    
    @pytest.mark.asyncio
    async def test_redis_alert_storage(self, monitoring_service):
        """Test alert storage in Redis"""
        
        if not monitoring_service.redis_client:
            pytest.skip("Redis not available")
        
        # Create test alert
        alert = Alert(
            name="RedisTest",
            severity=AlertSeverity.WARNING,
            message="Redis integration test",
            labels={"test": "true"},
            timestamp=datetime.now()
        )
        
        # Send alert
        await monitoring_service._send_alert(alert)
        
        # Verify alert was stored in Redis
        alerts_data = await monitoring_service.redis_client.lrange("ml_alerts", 0, -1)
        assert len(alerts_data) > 0
        
        # Verify alert content
        stored_alert = json.loads(alerts_data[0])
        assert stored_alert["name"] == "RedisTest"
        assert stored_alert["severity"] == "warning"
    
    @pytest.mark.asyncio
    async def test_alert_summary_accuracy(self, monitoring_service):
        """Test accuracy of alert summary"""
        
        # Clear existing alerts
        monitoring_service.alerts = []
        
        # Create alerts of different severities
        alerts = [
            Alert("Critical1", AlertSeverity.CRITICAL, "Critical test 1", {}, datetime.now()),
            Alert("Critical2", AlertSeverity.CRITICAL, "Critical test 2", {}, datetime.now()),
            Alert("Warning1", AlertSeverity.WARNING, "Warning test 1", {}, datetime.now()),
            Alert("Info1", AlertSeverity.INFO, "Info test 1", {}, datetime.now()),
        ]
        
        # Send all alerts
        for alert in alerts:
            await monitoring_service._send_alert(alert)
        
        # Get summary
        summary = await monitoring_service.get_alert_summary()
        
        # Verify summary accuracy
        assert summary["critical_alerts"] == 2
        assert summary["warning_alerts"] == 1
        assert summary["info_alerts"] == 1
        assert summary["total_alerts"] == 4
    
    @pytest.mark.asyncio
    async def test_health_status_reporting(self, monitoring_service):
        """Test health status reporting"""
        
        # Get health status
        health = await monitoring_service.get_health_status()
        
        # Verify health status structure
        assert "service_status" in health
        assert "redis_connected" in health
        assert "metrics_collected" in health
        assert "alerts_count" in health
        assert "last_check" in health
        
        # Verify health status values
        assert health["service_status"] in ["healthy", "unhealthy"]
        assert isinstance(health["redis_connected"], bool)
        assert isinstance(health["metrics_collected"], int)
        assert isinstance(health["alerts_count"], int)

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])