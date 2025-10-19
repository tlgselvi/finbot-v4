#!/bin/bash

# FinBot ML Infrastructure Deployment Script
# This script deploys the complete ML infrastructure to Kubernetes

set -e

# Configuration
NAMESPACE="finbot-ml"
STAGING_NAMESPACE="finbot-ml-staging"
KUBECTL_CONTEXT=${KUBECTL_CONTEXT:-"production"}
DRY_RUN=${DRY_RUN:-false}
SKIP_SECRETS=${SKIP_SECRETS:-false}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check Helm
    if ! command -v helm &> /dev/null; then
        log_error "Helm is not installed or not in PATH"
        exit 1
    fi
    
    # Check Argo Rollouts CLI
    if ! command -v kubectl-argo-rollouts &> /dev/null; then
        log_warning "Argo Rollouts CLI not found. Installing..."
        curl -LO https://github.com/argoproj/argo-rollouts/releases/latest/download/kubectl-argo-rollouts-linux-amd64
        chmod +x ./kubectl-argo-rollouts-linux-amd64
        sudo mv ./kubectl-argo-rollouts-linux-amd64 /usr/local/bin/kubectl-argo-rollouts
    fi
    
    # Check cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    log_success "Prerequisites check completed"
}

# Install required operators and CRDs
install_operators() {
    log_info "Installing required operators and CRDs..."
    
    # Install Argo Rollouts
    kubectl create namespace argo-rollouts --dry-run=client -o yaml | kubectl apply -f -
    kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
    
    # Install Prometheus Operator
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update
    
    # Install NVIDIA GPU Operator (if GPUs are available)
    if kubectl get nodes -o json | jq -r '.items[].status.capacity | select(."nvidia.com/gpu") | ."nvidia.com/gpu"' | grep -q .; then
        log_info "GPU nodes detected, installing NVIDIA GPU Operator..."
        helm repo add nvidia https://nvidia.github.io/gpu-operator
        helm repo update
        helm upgrade --install gpu-operator nvidia/gpu-operator \
            --namespace gpu-operator-resources \
            --create-namespace \
            --set driver.enabled=true
    fi
    
    log_success "Operators installation completed"
}

# Create namespaces
create_namespaces() {
    log_info "Creating namespaces..."
    
    if [ "$DRY_RUN" = "true" ]; then
        kubectl apply --dry-run=client -f ../k8s/namespace.yaml
    else
        kubectl apply -f ../k8s/namespace.yaml
    fi
    
    log_success "Namespaces created"
}

# Deploy secrets and storage
deploy_secrets_storage() {
    if [ "$SKIP_SECRETS" = "true" ]; then
        log_warning "Skipping secrets deployment (SKIP_SECRETS=true)"
        return
    fi
    
    log_info "Deploying secrets and storage..."
    
    # Check if secrets already exist
    if kubectl get secret ml-pipeline-secrets -n $NAMESPACE &> /dev/null; then
        log_warning "Secrets already exist, skipping creation"
    else
        if [ "$DRY_RUN" = "true" ]; then
            kubectl apply --dry-run=client -f ../k8s/storage-secrets.yaml
        else
            kubectl apply -f ../k8s/storage-secrets.yaml
        fi
    fi
    
    log_success "Secrets and storage deployed"
}

# Deploy ML pipeline infrastructure
deploy_ml_pipeline() {
    log_info "Deploying ML pipeline infrastructure..."
    
    if [ "$DRY_RUN" = "true" ]; then
        kubectl apply --dry-run=client -f ../k8s/ml-pipeline-deployment.yaml
    else
        kubectl apply -f ../k8s/ml-pipeline-deployment.yaml
    fi
    
    # Wait for deployment to be ready
    if [ "$DRY_RUN" = "false" ]; then
        kubectl rollout status deployment/ml-pipeline-server -n $NAMESPACE --timeout=300s
    fi
    
    log_success "ML pipeline infrastructure deployed"
}

# Deploy model serving infrastructure
deploy_model_serving() {
    log_info "Deploying model serving infrastructure..."
    
    if [ "$DRY_RUN" = "true" ]; then
        kubectl apply --dry-run=client -f ../k8s/model-serving-deployment.yaml
    else
        kubectl apply -f ../k8s/model-serving-deployment.yaml
    fi
    
    # Wait for deployment to be ready
    if [ "$DRY_RUN" = "false" ]; then
        kubectl rollout status deployment/model-serving-server -n $NAMESPACE --timeout=300s
    fi
    
    log_success "Model serving infrastructure deployed"
}

# Deploy GPU inference infrastructure
deploy_gpu_inference() {
    log_info "Deploying GPU inference infrastructure..."
    
    # Check if GPU nodes are available
    if ! kubectl get nodes -o json | jq -r '.items[].status.capacity | select(."nvidia.com/gpu") | ."nvidia.com/gpu"' | grep -q .; then
        log_warning "No GPU nodes detected, skipping GPU inference deployment"
        return
    fi
    
    if [ "$DRY_RUN" = "true" ]; then
        kubectl apply --dry-run=client -f ../k8s/gpu-inference-deployment.yaml
    else
        kubectl apply -f ../k8s/gpu-inference-deployment.yaml
    fi
    
    # Wait for deployment to be ready
    if [ "$DRY_RUN" = "false" ]; then
        kubectl rollout status deployment/gpu-inference-server -n $NAMESPACE --timeout=300s
    fi
    
    log_success "GPU inference infrastructure deployed"
}

# Deploy blue-green deployment infrastructure
deploy_blue_green() {
    log_info "Deploying blue-green deployment infrastructure..."
    
    if [ "$DRY_RUN" = "true" ]; then
        kubectl apply --dry-run=client -f ../k8s/blue-green-deployment.yaml
    else
        kubectl apply -f ../k8s/blue-green-deployment.yaml
    fi
    
    # Wait for rollout to be ready
    if [ "$DRY_RUN" = "false" ]; then
        kubectl argo rollouts get rollout ml-analytics-rollout -n $NAMESPACE --watch --timeout=300s
    fi
    
    log_success "Blue-green deployment infrastructure deployed"
}

# Deploy monitoring stack
deploy_monitoring() {
    log_info "Deploying monitoring stack..."
    
    if [ "$DRY_RUN" = "true" ]; then
        kubectl apply --dry-run=client -f ../k8s/monitoring-stack.yaml
    else
        kubectl apply -f ../k8s/monitoring-stack.yaml
    fi
    
    # Wait for deployments to be ready
    if [ "$DRY_RUN" = "false" ]; then
        kubectl rollout status deployment/prometheus -n $NAMESPACE --timeout=300s
        kubectl rollout status deployment/grafana -n $NAMESPACE --timeout=300s
    fi
    
    log_success "Monitoring stack deployed"
}

# Deploy Kubeflow pipelines
deploy_kubeflow_pipelines() {
    log_info "Deploying Kubeflow pipelines..."
    
    if [ "$DRY_RUN" = "true" ]; then
        kubectl apply --dry-run=client -f ../k8s/kubeflow-pipeline.yaml
    else
        kubectl apply -f ../k8s/kubeflow-pipeline.yaml
    fi
    
    log_success "Kubeflow pipelines deployed"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check all deployments
    log_info "Checking deployment status..."
    kubectl get deployments -n $NAMESPACE
    
    # Check services
    log_info "Checking services..."
    kubectl get services -n $NAMESPACE
    
    # Check rollouts
    log_info "Checking rollouts..."
    kubectl argo rollouts list rollouts -n $NAMESPACE
    
    # Check persistent volumes
    log_info "Checking persistent volumes..."
    kubectl get pvc -n $NAMESPACE
    
    # Run health checks
    log_info "Running health checks..."
    
    # Check ML pipeline health
    if kubectl get service ml-pipeline-service -n $NAMESPACE &> /dev/null; then
        kubectl port-forward service/ml-pipeline-service 8080:8080 -n $NAMESPACE &
        PF_PID=$!
        sleep 5
        
        if curl -f http://localhost:8080/health &> /dev/null; then
            log_success "ML pipeline health check passed"
        else
            log_warning "ML pipeline health check failed"
        fi
        
        kill $PF_PID 2>/dev/null || true
    fi
    
    log_success "Deployment verification completed"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up port-forwards..."
    pkill -f "kubectl port-forward" 2>/dev/null || true
}

# Main deployment function
main() {
    log_info "Starting FinBot ML Infrastructure deployment..."
    log_info "Target namespace: $NAMESPACE"
    log_info "Kubectl context: $(kubectl config current-context)"
    log_info "Dry run: $DRY_RUN"
    
    # Set trap for cleanup
    trap cleanup EXIT
    
    # Execute deployment steps
    check_prerequisites
    install_operators
    create_namespaces
    deploy_secrets_storage
    deploy_ml_pipeline
    deploy_model_serving
    deploy_gpu_inference
    deploy_monitoring
    deploy_blue_green
    deploy_kubeflow_pipelines
    
    if [ "$DRY_RUN" = "false" ]; then
        verify_deployment
    fi
    
    log_success "FinBot ML Infrastructure deployment completed successfully!"
    
    # Print access information
    echo ""
    log_info "Access Information:"
    echo "  Grafana Dashboard: kubectl port-forward service/grafana-service 3000:3000 -n $NAMESPACE"
    echo "  Prometheus: kubectl port-forward service/prometheus-service 9090:9090 -n $NAMESPACE"
    echo "  ML Analytics API: kubectl port-forward service/ml-analytics-active 8080:8080 -n $NAMESPACE"
    echo ""
    log_info "To check rollout status: kubectl argo rollouts get rollout ml-analytics-rollout -n $NAMESPACE"
    log_info "To promote blue-green deployment: kubectl argo rollouts promote ml-analytics-rollout -n $NAMESPACE"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --skip-secrets)
            SKIP_SECRETS=true
            shift
            ;;
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        --context)
            KUBECTL_CONTEXT="$2"
            kubectl config use-context "$KUBECTL_CONTEXT"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --dry-run          Perform a dry run without making changes"
            echo "  --skip-secrets     Skip secrets deployment"
            echo "  --namespace NAME   Target namespace (default: finbot-ml)"
            echo "  --context NAME     Kubectl context to use"
            echo "  --help             Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main function
main