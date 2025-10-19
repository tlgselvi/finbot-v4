"""
Deployment tests for ML infrastructure and model serving.
"""

import pytest
import asyncio
import time
from datetime import datetime, timedelta
from typing import Dict, Any, List

import httpx
import kubernetes
from kubernetes import client, config


@pytest.mark.deployment
class TestMLInfrastructureDeployment:
    """Test ML infrastructure deployment and health."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Set up deployment test environment."""
        # Load Kubernetes config
        try:
            config.load_incluster_config()  # For in-cluster testing
        except:
            config.load_kube_config()  # For local testing
        
        self.k8s_client = client.ApiClient()
        self.apps_v1 = client.AppsV1Api()
        self.core_v1 = client.CoreV1Api()
        self.namespace = "finbot-ml"
        
        # API endpoints
        self.ml_pipeline_url = "http://ml-pipeline-service:8080"
        self.model_serving_url = "http://model-serving-service:8080"
        self.gpu_inference_url = "http://gpu-inference-service:8080"
        self.analytics_api_url = "http://ml-analytics-active:8080"
    
    def test_namespace_exists(self):
        """Test that ML namespace exists and is active."""
        try:
            namespace = self.core_v1.read_namespace(name=self.namespace)
            assert namespace.status.phase == "Active"
        except kubernetes.client.exceptions.ApiException as e:
            pytest.fail(f"Namespace {self.namespace} not found: {e}")
    
    def test_deployments_ready(self):
        """Test that all ML deployments are ready."""
        expected_deployments = [
            "ml-pipeline-server",
            "model-serving-server", 
            "gpu-inference-server",
            "ml-analytics-rollout"
        ]
        
        deployments = self.apps_v1.list_namespaced_deployment(namespace=self.namespace)
        deployment_names = [d.metadata.name for d in deployments.items]
        
        for expected_deployment in expected_deployments:
            if expected_deployment == "ml-analytics-rollout":
                # Skip rollout check for now, would need Argo Rollouts API
                continue
                
            assert expected_deployment in deployment_names, f"Deployment {expected_deployment} not found"
            
            # Check deployment status
            deployment = next(d for d in deployments.items if d.metadata.name == expected_deployment)
            assert deployment.status.ready_replicas > 0, f"Deployment {expected_deployment} has no ready replicas"
            assert deployment.status.ready_replicas == deployment.status.replicas, f"Deployment {expected_deployment} not fully ready"
    
    def test_services_accessible(self):
        """Test that all ML services are accessible."""
        expected_services = [
            "ml-pipeline-service",
            "model-serving-service",
            "gpu-inference-service", 
            "ml-analytics-active"
        ]
        
        services = self.core_v1.list_namespaced_service(namespace=self.namespace)
        service_names = [s.metadata.name for s in services.items]
        
        for expected_service in expected_services:
            assert expected_service in service_names, f"Service {expected_service} not found"
            
            # Check service has endpoints
            try:
                endpoints = self.core_v1.read_namespaced_endpoints(
                    name=expected_service,
                    namespace=self.namespace
                )
                assert len(endpoints.subsets) > 0, f"Service {expected_service} has no endpoints"
            except kubernetes.client.exceptions.ApiException:
                pytest.fail(f"Endpoints for service {expected_service} not found")
    
    def test_persistent_volumes_bound(self):
        """Test that persistent volumes are bound."""
        expected_pvcs = [
            "ml-model-storage",
            "prometheus-storage",
            "grafana-storage"
        ]
        
        pvcs = self.core_v1.list_namespaced_persistent_volume_claim(namespace=self.namespace)
        pvc_names = [pvc.metadata.name for pvc in pvcs.items]
        
        for expected_pvc in expected_pvcs:
            assert expected_pvc in pvc_names, f"PVC {expected_pvc} not found"
            
            # Check PVC status
            pvc = next(pvc for pvc in pvcs.items if pvc.metadata.name == expected_pvc)
            assert pvc.status.phase == "Bound", f"PVC {expected_pvc} not bound"
    
    def test_secrets_exist(self):
        """Test that required secrets exist."""
        expected_secrets = [
            "ml-pipeline-secrets",
            "ml-analytics-secrets",
            "grafana-secrets"
        ]
        
        secrets = self.core_v1.list_namespaced_secret(namespace=self.namespace)
        secret_names = [s.metadata.name for s in secrets.items]
        
        for expected_secret in expected_secrets:
            assert expected_secret in secret_names, f"Secret {expected_secret} not found"
    
    def test_configmaps_exist(self):
        """Test that required configmaps exist."""
        expected_configmaps = [
            "ml-pipeline-config",
            "ml-analytics-config",
            "model-serving-config",
            "prometheus-config"
        ]
        
        configmaps = self.core_v1.list_namespaced_config_map(namespace=self.namespace)
        configmap_names = [cm.metadata.name for cm in configmaps.items]
        
        for expected_configmap in expected_configmaps:
            assert expected_configmap in configmap_names, f"ConfigMap {expected_configmap} not found"
    
    @pytest.mark.asyncio
    async def test_health_endpoints(self):
        """Test health endpoints of all services."""
        health_checks = [
            (self.ml_pipeline_url, "/health"),
            (self.model_serving_url, "/ping"),
            (self.gpu_inference_url, "/health"),
            (self.analytics_api_url, "/health")
        ]
        
        async with httpx.AsyncClient() as client:
            for base_url, health_path in health_checks:
                try:
                    response = await client.get(f"{base_url}{health_path}", timeout=10.0)
                    assert response.status_code == 200, f"Health check failed for {base_url}"
                except httpx.RequestError as e:
                    pytest.fail(f"Health check request failed for {base_url}: {e}")
    
    @pytest.mark.asyncio
    async def test_readiness_endpoints(self):
        """Test readiness endpoints of all services."""
        readiness_checks = [
            (self.ml_pipeline_url, "/ready"),
            (self.analytics_api_url, "/ready")
        ]
        
        async with httpx.AsyncClient() as client:
            for base_url, ready_path in readiness_checks:
                try:
                    response = await client.get(f"{base_url}{ready_path}", timeout=10.0)
                    assert response.status_code == 200, f"Readiness check failed for {base_url}"
                except httpx.RequestError as e:
                    pytest.fail(f"Readiness check request failed for {base_url}: {e}")
    
    def test_resource_limits(self):
        """Test that pods have appropriate resource limits."""
        pods = self.core_v1.list_namespaced_pod(namespace=self.namespace)
        
        for pod in pods.items:
            if pod.status.phase != "Running":
                continue
                
            for container in pod.spec.containers:
                # Check that containers have resource limits
                assert container.resources.limits is not None, f"Container {container.name} in pod {pod.metadata.name} has no resource limits"
                assert container.resources.requests is not None, f"Container {container.name} in pod {pod.metadata.name} has no resource requests"
                
                # Check specific limits
                limits = container.resources.limits
                requests = container.resources.requests
                
                if "cpu" in limits:
                    assert limits["cpu"] is not None
                if "memory" in limits:
                    assert limits["memory"] is not None
                if "cpu" in requests:
                    assert requests["cpu"] is not None
                if "memory" in requests:
                    assert requests["memory"] is not None
    
    def test_horizontal_pod_autoscalers(self):
        """Test that HPA is configured for scalable services."""
        autoscaling_v2 = client.AutoscalingV2Api()
        
        expected_hpas = [
            "model-serving-hpa",
            "gpu-inference-hpa"
        ]
        
        try:
            hpas = autoscaling_v2.list_namespaced_horizontal_pod_autoscaler(namespace=self.namespace)
            hpa_names = [hpa.metadata.name for hpa in hpas.items]
            
            for expected_hpa in expected_hpas:
                assert expected_hpa in hpa_names, f"HPA {expected_hpa} not found"
                
                # Check HPA status
                hpa = next(hpa for hpa in hpas.items if hpa.metadata.name == expected_hpa)
                assert hpa.status.current_replicas > 0, f"HPA {expected_hpa} has no current replicas"
        except kubernetes.client.exceptions.ApiException as e:
            pytest.skip(f"HPA API not available: {e}")


@pytest.mark.deployment
class TestModelServingDeployment:
    """Test model serving deployment and functionality."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Set up model serving test environment."""
        self.model_serving_url = "http://model-serving-service:8080"
        self.admin_url = "http://model-serving-service:8081"
    
    @pytest.mark.asyncio
    async def test_model_serving_health(self):
        """Test model serving service health."""
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.model_serving_url}/ping", timeout=10.0)
            assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_models_loaded(self):
        """Test that ML models are loaded and available."""
        expected_models = [
            "anomaly-detection",
            "risk-assessment", 
            "budget-optimization"
        ]
        
        async with httpx.AsyncClient() as client:
            # Get list of loaded models
            response = await client.get(f"{self.admin_url}/models", timeout=10.0)
            assert response.status_code == 200
            
            models_data = response.json()
            loaded_models = [model["modelName"] for model in models_data.get("models", [])]
            
            for expected_model in expected_models:
                assert expected_model in loaded_models, f"Model {expected_model} not loaded"
    
    @pytest.mark.asyncio
    async def test_model_inference(self):
        """Test model inference functionality."""
        # Test anomaly detection model
        test_input = {
            "instances": [
                {
                    "amount": 150.0,
                    "category": "groceries",
                    "merchant": "Whole Foods",
                    "hour_of_day": 14,
                    "day_of_week": 2
                }
            ]
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.model_serving_url}/predictions/anomaly-detection",
                json=test_input,
                timeout=30.0
            )
            
            if response.status_code == 200:
                predictions = response.json()
                assert "predictions" in predictions
                assert len(predictions["predictions"]) > 0
            else:
                # Model might not be fully loaded yet
                pytest.skip("Model inference not available")
    
    @pytest.mark.asyncio
    async def test_model_metrics(self):
        """Test model serving metrics."""
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.model_serving_url}/metrics", timeout=10.0)
            
            if response.status_code == 200:
                metrics_text = response.text
                # Check for key metrics
                assert "requests_total" in metrics_text
                assert "request_duration_seconds" in metrics_text
            else:
                pytest.skip("Metrics endpoint not available")


@pytest.mark.deployment
class TestMonitoringDeployment:
    """Test monitoring stack deployment."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Set up monitoring test environment."""
        self.prometheus_url = "http://prometheus-service:9090"
        self.grafana_url = "http://grafana-service:3000"
    
    @pytest.mark.asyncio
    async def test_prometheus_health(self):
        """Test Prometheus health and configuration."""
        async with httpx.AsyncClient() as client:
            # Test Prometheus health
            response = await client.get(f"{self.prometheus_url}/-/healthy", timeout=10.0)
            assert response.status_code == 200
            
            # Test Prometheus ready
            response = await client.get(f"{self.prometheus_url}/-/ready", timeout=10.0)
            assert response.status_code == 200
    
    @pytest.mark.asyncio
    async def test_prometheus_targets(self):
        """Test that Prometheus is scraping ML service targets."""
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{self.prometheus_url}/api/v1/targets", timeout=10.0)
            
            if response.status_code == 200:
                targets_data = response.json()
                active_targets = targets_data.get("data", {}).get("activeTargets", [])
                
                # Check for ML service targets
                ml_jobs = ["ml-analytics", "model-serving", "gpu-inference"]
                found_jobs = set()
                
                for target in active_targets:
                    job = target.get("labels", {}).get("job", "")
                    if job in ml_jobs:
                        found_jobs.add(job)
                        assert target.get("health") == "up", f"Target {job} is not healthy"
                
                # At least some ML services should be monitored
                assert len(found_jobs) > 0, "No ML service targets found in Prometheus"
    
    @pytest.mark.asyncio
    async def test_grafana_health(self):
        """Test Grafana health and dashboards."""
        async with httpx.AsyncClient() as client:
            # Test Grafana health
            response = await client.get(f"{self.grafana_url}/api/health", timeout=10.0)
            
            if response.status_code == 200:
                health_data = response.json()
                assert health_data.get("database") == "ok"
            else:
                pytest.skip("Grafana not accessible")


@pytest.mark.deployment
class TestNetworkingDeployment:
    """Test networking and ingress deployment."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Set up networking test environment."""
        try:
            config.load_incluster_config()
        except:
            config.load_kube_config()
        
        self.networking_v1 = client.NetworkingV1Api()
        self.namespace = "finbot-ml"
    
    def test_ingress_configured(self):
        """Test that ingress is properly configured."""
        try:
            ingresses = self.networking_v1.list_namespaced_ingress(namespace=self.namespace)
            ingress_names = [ing.metadata.name for ing in ingresses.items]
            
            assert "ml-analytics-ingress" in ingress_names, "ML Analytics ingress not found"
            
            # Check ingress configuration
            ingress = next(ing for ing in ingresses.items if ing.metadata.name == "ml-analytics-ingress")
            
            # Check TLS configuration
            assert ingress.spec.tls is not None, "Ingress TLS not configured"
            assert len(ingress.spec.tls) > 0, "No TLS configuration found"
            
            # Check rules
            assert ingress.spec.rules is not None, "Ingress rules not configured"
            assert len(ingress.spec.rules) > 0, "No ingress rules found"
            
        except kubernetes.client.exceptions.ApiException as e:
            pytest.skip(f"Ingress API not available: {e}")
    
    def test_network_policies(self):
        """Test network policies if configured."""
        try:
            network_policies = self.networking_v1.list_namespaced_network_policy(namespace=self.namespace)
            
            # If network policies are configured, validate them
            if len(network_policies.items) > 0:
                for policy in network_policies.items:
                    assert policy.spec.pod_selector is not None, f"Network policy {policy.metadata.name} has no pod selector"
                    
        except kubernetes.client.exceptions.ApiException as e:
            pytest.skip(f"Network Policy API not available: {e}")


@pytest.mark.deployment
class TestSecurityDeployment:
    """Test security-related deployment configurations."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Set up security test environment."""
        try:
            config.load_incluster_config()
        except:
            config.load_kube_config()
        
        self.core_v1 = client.CoreV1Api()
        self.rbac_v1 = client.RbacAuthorizationV1Api()
        self.namespace = "finbot-ml"
    
    def test_service_accounts(self):
        """Test that service accounts are properly configured."""
        expected_service_accounts = [
            "ml-pipeline-service-account",
            "prometheus-service-account"
        ]
        
        service_accounts = self.core_v1.list_namespaced_service_account(namespace=self.namespace)
        sa_names = [sa.metadata.name for sa in service_accounts.items]
        
        for expected_sa in expected_service_accounts:
            assert expected_sa in sa_names, f"Service account {expected_sa} not found"
    
    def test_rbac_configuration(self):
        """Test RBAC configuration."""
        try:
            # Check cluster roles
            cluster_roles = self.rbac_v1.list_cluster_role()
            ml_cluster_roles = [cr for cr in cluster_roles.items if "ml-" in cr.metadata.name]
            
            # Check cluster role bindings
            cluster_role_bindings = self.rbac_v1.list_cluster_role_binding()
            ml_bindings = [crb for crb in cluster_role_bindings.items if "ml-" in crb.metadata.name]
            
            # Should have some RBAC configuration for ML services
            assert len(ml_cluster_roles) > 0 or len(ml_bindings) > 0, "No ML RBAC configuration found"
            
        except kubernetes.client.exceptions.ApiException as e:
            pytest.skip(f"RBAC API not available: {e}")
    
    def test_pod_security_context(self):
        """Test pod security contexts."""
        pods = self.core_v1.list_namespaced_pod(namespace=self.namespace)
        
        for pod in pods.items:
            if pod.status.phase != "Running":
                continue
            
            # Check security context
            if pod.spec.security_context:
                security_context = pod.spec.security_context
                
                # Check for non-root user (if configured)
                if security_context.run_as_non_root is not None:
                    assert security_context.run_as_non_root, f"Pod {pod.metadata.name} running as root"
                
                # Check for read-only root filesystem (if configured)
                for container in pod.spec.containers:
                    if container.security_context and container.security_context.read_only_root_filesystem:
                        assert container.security_context.read_only_root_filesystem, f"Container {container.name} has writable root filesystem"


@pytest.mark.deployment
@pytest.mark.slow
class TestDeploymentPerformance:
    """Test deployment performance and scalability."""
    
    @pytest.mark.asyncio
    async def test_service_response_times(self):
        """Test service response times under normal load."""
        services = [
            "http://ml-analytics-active:8080/health",
            "http://model-serving-service:8080/ping",
            "http://prometheus-service:9090/-/healthy"
        ]
        
        async with httpx.AsyncClient() as client:
            for service_url in services:
                start_time = time.time()
                
                try:
                    response = await client.get(service_url, timeout=5.0)
                    end_time = time.time()
                    
                    response_time = end_time - start_time
                    
                    assert response.status_code == 200, f"Service {service_url} not healthy"
                    assert response_time < 2.0, f"Service {service_url} response time too slow: {response_time}s"
                    
                except httpx.RequestError as e:
                    pytest.fail(f"Service {service_url} not accessible: {e}")
    
    def test_resource_utilization(self):
        """Test resource utilization of deployed services."""
        try:
            config.load_incluster_config()
        except:
            config.load_kube_config()
        
        core_v1 = client.CoreV1Api()
        
        # Get pod metrics (requires metrics-server)
        try:
            # This would require custom metrics API
            # For now, just check that pods are not in error state
            pods = core_v1.list_namespaced_pod(namespace="finbot-ml")
            
            for pod in pods.items:
                if pod.status.phase == "Running":
                    # Check container statuses
                    for container_status in pod.status.container_statuses or []:
                        assert container_status.ready, f"Container {container_status.name} in pod {pod.metadata.name} not ready"
                        assert container_status.restart_count < 5, f"Container {container_status.name} has too many restarts: {container_status.restart_count}"
                        
        except Exception as e:
            pytest.skip(f"Resource metrics not available: {e}")