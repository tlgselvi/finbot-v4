#!/bin/bash
# FinBot v4 - Blue-Green Deployment Script
# Zero-downtime deployment with automatic rollback

set -e

# Default values
NAMESPACE="production"
TIMEOUT="300s"
HEALTH_CHECK_RETRIES=10
HEALTH_CHECK_INTERVAL=30

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

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --image-api IMAGE       API container image"
    echo "  --image-web IMAGE       Web container image"
    echo "  --image-admin IMAGE     Admin container image"
    echo "  --namespace NAMESPACE   Kubernetes namespace (default: production)"
    echo "  --timeout TIMEOUT       Deployment timeout (default: 300s)"
    echo "  --dry-run               Show what would be deployed without executing"
    echo "  --rollback              Rollback to previous version"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --image-api ghcr.io/finbot/api:v1.0.0 --image-web ghcr.io/finbot/web:v1.0.0"
    echo "  $0 --rollback --namespace production"
}

# Function to check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    # Check namespace exists
    if ! kubectl get namespace $NAMESPACE &> /dev/null; then
        log_error "Namespace $NAMESPACE does not exist"
        exit 1
    fi
    
    log_success "Prerequisites check completed"
}

# Function to get current deployment color
get_current_color() {
    local service=$1
    local current_color=$(kubectl get service $service -n $NAMESPACE -o jsonpath='{.spec.selector.color}' 2>/dev/null || echo "")
    
    if [ -z "$current_color" ]; then
        echo "blue"  # Default to blue if no color is set
    else
        echo "$current_color"
    fi
}

# Function to get next deployment color
get_next_color() {
    local current_color=$1
    if [ "$current_color" = "blue" ]; then
        echo "green"
    else
        echo "blue"
    fi
}

# Function to create deployment manifest
create_deployment_manifest() {
    local service=$1
    local image=$2
    local color=$3
    
    cat <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $service-$color
  namespace: $NAMESPACE
  labels:
    app: $service
    color: $color
    version: $(echo $image | cut -d':' -f2)
spec:
  replicas: 3
  selector:
    matchLabels:
      app: $service
      color: $color
  template:
    metadata:
      labels:
        app: $service
        color: $color
        version: $(echo $image | cut -d':' -f2)
    spec:
      serviceAccountName: finbot-$NAMESPACE
      securityContext:
        runAsNonRoot: true
        runAsUser: 65534
        fsGroup: 65534
      containers:
      - name: $service
        image: $image
        ports:
        - containerPort: $(get_service_port $service)
          name: http
        env:
        - name: NODE_ENV
          value: "$NAMESPACE"
        - name: COLOR
          value: "$color"
        - name: VERSION
          value: "$(echo $image | cut -d':' -f2)"
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: http
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        resources:
          requests:
            cpu: $(get_service_cpu_request $service)
            memory: $(get_service_memory_request $service)
          limits:
            cpu: $(get_service_cpu_limit $service)
            memory: $(get_service_memory_limit $service)
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop:
            - ALL
          readOnlyRootFilesystem: true
          runAsNonRoot: true
          runAsUser: 65534
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchLabels:
                  app: $service
              topologyKey: kubernetes.io/hostname
EOF
}

# Function to get service port
get_service_port() {
    local service=$1
    case $service in
        "finbot-api") echo "3001" ;;
        "finbot-web") echo "80" ;;
        "finbot-admin") echo "80" ;;
        *) echo "80" ;;
    esac
}

# Function to get service resource requests/limits
get_service_cpu_request() {
    local service=$1
    case $service in
        "finbot-api") echo "500m" ;;
        "finbot-web") echo "100m" ;;
        "finbot-admin") echo "100m" ;;
        *) echo "100m" ;;
    esac
}

get_service_memory_request() {
    local service=$1
    case $service in
        "finbot-api") echo "512Mi" ;;
        "finbot-web") echo "128Mi" ;;
        "finbot-admin") echo "128Mi" ;;
        *) echo "128Mi" ;;
    esac
}

get_service_cpu_limit() {
    local service=$1
    case $service in
        "finbot-api") echo "2000m" ;;
        "finbot-web") echo "500m" ;;
        "finbot-admin") echo "500m" ;;
        *) echo "500m" ;;
    esac
}

get_service_memory_limit() {
    local service=$1
    case $service in
        "finbot-api") echo "2Gi" ;;
        "finbot-web") echo "512Mi" ;;
        "finbot-admin") echo "512Mi" ;;
        *) echo "512Mi" ;;
    esac
}

# Function to deploy service
deploy_service() {
    local service=$1
    local image=$2
    local color=$3
    
    log_info "Deploying $service with color $color..."
    
    # Create deployment manifest
    create_deployment_manifest $service $image $color | kubectl apply -f -
    
    # Wait for deployment to be ready
    log_info "Waiting for $service-$color deployment to be ready..."
    kubectl rollout status deployment/$service-$color -n $NAMESPACE --timeout=$TIMEOUT
    
    # Verify pods are running
    local ready_pods=$(kubectl get deployment $service-$color -n $NAMESPACE -o jsonpath='{.status.readyReplicas}')
    local desired_pods=$(kubectl get deployment $service-$color -n $NAMESPACE -o jsonpath='{.spec.replicas}')
    
    if [ "$ready_pods" != "$desired_pods" ]; then
        log_error "$service-$color deployment failed: $ready_pods/$desired_pods pods ready"
        return 1
    fi
    
    log_success "$service-$color deployment completed successfully"
}

# Function to run health checks
run_health_checks() {
    local service=$1
    local color=$2
    
    log_info "Running health checks for $service-$color..."
    
    # Get a pod from the deployment
    local pod=$(kubectl get pods -n $NAMESPACE -l app=$service,color=$color -o jsonpath='{.items[0].metadata.name}')
    
    if [ -z "$pod" ]; then
        log_error "No pods found for $service-$color"
        return 1
    fi
    
    # Run health checks
    for i in $(seq 1 $HEALTH_CHECK_RETRIES); do
        log_info "Health check attempt $i/$HEALTH_CHECK_RETRIES for $service-$color..."
        
        if kubectl exec $pod -n $NAMESPACE -- curl -f http://localhost:$(get_service_port $service)/health; then
            log_success "Health check passed for $service-$color"
            return 0
        fi
        
        if [ $i -lt $HEALTH_CHECK_RETRIES ]; then
            log_warning "Health check failed, retrying in ${HEALTH_CHECK_INTERVAL}s..."
            sleep $HEALTH_CHECK_INTERVAL
        fi
    done
    
    log_error "Health checks failed for $service-$color after $HEALTH_CHECK_RETRIES attempts"
    return 1
}

# Function to switch traffic
switch_traffic() {
    local service=$1
    local new_color=$2
    
    log_info "Switching traffic for $service to $new_color..."
    
    # Update service selector
    kubectl patch service $service -n $NAMESPACE -p '{"spec":{"selector":{"color":"'$new_color'"}}}'
    
    # Verify service is pointing to new deployment
    local current_selector=$(kubectl get service $service -n $NAMESPACE -o jsonpath='{.spec.selector.color}')
    if [ "$current_selector" != "$new_color" ]; then
        log_error "Failed to switch traffic for $service to $new_color"
        return 1
    fi
    
    log_success "Traffic switched for $service to $new_color"
}

# Function to cleanup old deployment
cleanup_old_deployment() {
    local service=$1
    local old_color=$2
    
    log_info "Cleaning up old deployment $service-$old_color..."
    
    # Scale down old deployment
    kubectl scale deployment $service-$old_color -n $NAMESPACE --replicas=0
    
    # Wait a bit before deleting
    sleep 30
    
    # Delete old deployment
    kubectl delete deployment $service-$old_color -n $NAMESPACE --ignore-not-found
    
    log_success "Cleaned up old deployment $service-$old_color"
}

# Function to rollback deployment
rollback_deployment() {
    local service=$1
    local current_color=$2
    local previous_color=$3
    
    log_warning "Rolling back $service from $current_color to $previous_color..."
    
    # Switch traffic back
    switch_traffic $service $previous_color
    
    # Cleanup failed deployment
    cleanup_old_deployment $service $current_color
    
    log_success "Rollback completed for $service"
}

# Function to perform blue-green deployment
blue_green_deploy() {
    local services=("finbot-api" "finbot-web" "finbot-admin")
    local images=("$IMAGE_API" "$IMAGE_WEB" "$IMAGE_ADMIN")
    local deployed_services=()
    local failed_service=""
    
    log_info "Starting blue-green deployment..."
    
    # Deploy all services to new color
    for i in "${!services[@]}"; do
        local service="${services[$i]}"
        local image="${images[$i]}"
        
        if [ -z "$image" ]; then
            log_warning "No image specified for $service, skipping..."
            continue
        fi
        
        local current_color=$(get_current_color $service)
        local next_color=$(get_next_color $current_color)
        
        log_info "Deploying $service: $current_color -> $next_color"
        
        if deploy_service $service $image $next_color; then
            if run_health_checks $service $next_color; then
                deployed_services+=("$service:$current_color:$next_color")
                log_success "$service deployment successful"
            else
                failed_service=$service
                log_error "$service health checks failed"
                break
            fi
        else
            failed_service=$service
            log_error "$service deployment failed"
            break
        fi
    done
    
    # If any service failed, rollback all
    if [ -n "$failed_service" ]; then
        log_error "Deployment failed at $failed_service, rolling back all services..."
        
        for deployed in "${deployed_services[@]}"; do
            IFS=':' read -r service current_color next_color <<< "$deployed"
            rollback_deployment $service $next_color $current_color
        done
        
        return 1
    fi
    
    # Switch traffic for all services
    log_info "All deployments successful, switching traffic..."
    
    for deployed in "${deployed_services[@]}"; do
        IFS=':' read -r service current_color next_color <<< "$deployed"
        
        if switch_traffic $service $next_color; then
            log_success "Traffic switched for $service"
        else
            log_error "Failed to switch traffic for $service"
            return 1
        fi
    done
    
    # Wait for traffic to stabilize
    log_info "Waiting for traffic to stabilize..."
    sleep 60
    
    # Final health checks
    log_info "Running final health checks..."
    for deployed in "${deployed_services[@]}"; do
        IFS=':' read -r service current_color next_color <<< "$deployed"
        
        if ! run_health_checks $service $next_color; then
            log_error "Final health check failed for $service, rolling back..."
            rollback_deployment $service $next_color $current_color
            return 1
        fi
    done
    
    # Cleanup old deployments
    log_info "Cleaning up old deployments..."
    for deployed in "${deployed_services[@]}"; do
        IFS=':' read -r service current_color next_color <<< "$deployed"
        cleanup_old_deployment $service $current_color
    done
    
    log_success "Blue-green deployment completed successfully!"
    return 0
}

# Function to perform rollback
perform_rollback() {
    local services=("finbot-api" "finbot-web" "finbot-admin")
    
    log_warning "Starting rollback process..."
    
    for service in "${services[@]}"; do
        local current_color=$(get_current_color $service)
        local previous_color=$(get_next_color $current_color)
        
        # Check if previous deployment exists
        if kubectl get deployment $service-$previous_color -n $NAMESPACE &> /dev/null; then
            log_info "Rolling back $service from $current_color to $previous_color"
            
            # Scale up previous deployment
            kubectl scale deployment $service-$previous_color -n $NAMESPACE --replicas=3
            kubectl rollout status deployment/$service-$previous_color -n $NAMESPACE --timeout=$TIMEOUT
            
            # Switch traffic
            switch_traffic $service $previous_color
            
            # Cleanup current deployment
            cleanup_old_deployment $service $current_color
            
            log_success "Rollback completed for $service"
        else
            log_warning "No previous deployment found for $service"
        fi
    done
    
    log_success "Rollback process completed!"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --image-api)
            IMAGE_API="$2"
            shift 2
            ;;
        --image-web)
            IMAGE_WEB="$2"
            shift 2
            ;;
        --image-admin)
            IMAGE_ADMIN="$2"
            shift 2
            ;;
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --rollback)
            ROLLBACK=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main execution
main() {
    check_prerequisites
    
    if [ "$ROLLBACK" = true ]; then
        perform_rollback
    elif [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would deploy the following:"
        [ -n "$IMAGE_API" ] && log_info "  API: $IMAGE_API"
        [ -n "$IMAGE_WEB" ] && log_info "  Web: $IMAGE_WEB"
        [ -n "$IMAGE_ADMIN" ] && log_info "  Admin: $IMAGE_ADMIN"
        log_info "  Namespace: $NAMESPACE"
    else
        if [ -z "$IMAGE_API" ] && [ -z "$IMAGE_WEB" ] && [ -z "$IMAGE_ADMIN" ]; then
            log_error "At least one image must be specified"
            show_usage
            exit 1
        fi
        
        blue_green_deploy
    fi
}

# Execute main function
main "$@"