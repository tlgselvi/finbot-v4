#!/bin/bash

# FinBot v4 - Infrastructure Test Runner
# Comprehensive infrastructure testing script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
KUBECTL_CMD="kubectl"
ISTIOCTL_CMD="istioctl"
TEST_NAMESPACE="infrastructure-tests"
LOG_FILE="infrastructure-tests.log"

echo -e "${BLUE}🚀 Starting FinBot v4 Infrastructure Tests${NC}"
echo "=================================================="

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    if [ "$status" = "SUCCESS" ]; then
        echo -e "${GREEN}✅ $message${NC}"
    elif [ "$status" = "ERROR" ]; then
        echo -e "${RED}❌ $message${NC}"
    elif [ "$status" = "WARNING" ]; then
        echo -e "${YELLOW}⚠️  $message${NC}"
    else
        echo -e "${BLUE}ℹ️  $message${NC}"
    fi
}

# Function to check prerequisites
check_prerequisites() {
    print_status "INFO" "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v $KUBECTL_CMD &> /dev/null; then
        print_status "ERROR" "kubectl not found. Please install kubectl."
        exit 1
    fi
    
    # Check istioctl
    if ! command -v $ISTIOCTL_CMD &> /dev/null; then
        print_status "WARNING" "istioctl not found. Istio tests will be skipped."
        ISTIOCTL_CMD=""
    fi
    
    # Check cluster connectivity
    if ! $KUBECTL_CMD cluster-info &> /dev/null; then
        print_status "ERROR" "Cannot connect to Kubernetes cluster."
        exit 1
    fi
    
    print_status "SUCCESS" "Prerequisites check completed"
}

# Function to test cluster health
test_cluster_health() {
    print_status "INFO" "Testing cluster health..."
    
    # Test API server
    if $KUBECTL_CMD get --raw='/healthz' | grep -q "ok"; then
        print_status "SUCCESS" "API server is healthy"
    else
        print_status "ERROR" "API server health check failed"
        return 1
    fi
    
    # Test node status
    local not_ready_nodes=$($KUBECTL_CMD get nodes --no-headers | grep -v "Ready" | wc -l)
    if [ "$not_ready_nodes" -eq 0 ]; then
        print_status "SUCCESS" "All nodes are ready"
    else
        print_status "ERROR" "$not_ready_nodes nodes are not ready"
        return 1
    fi
    
    # Test system pods
    local failing_pods=$($KUBECTL_CMD get pods -n kube-system --no-headers | grep -v "Running\|Completed" | wc -l)
    if [ "$failing_pods" -eq 0 ]; then
        print_status "SUCCESS" "All system pods are running"
    else
        print_status "WARNING" "$failing_pods system pods are not running properly"
    fi
    
    return 0
}

# Function to test namespaces
test_namespaces() {
    print_status "INFO" "Testing namespace configuration..."
    
    local required_namespaces=("production" "staging" "monitoring" "database" "cache" "security" "istio-system")
    local missing_namespaces=0
    
    for ns in "${required_namespaces[@]}"; do
        if $KUBECTL_CMD get namespace "$ns" &> /dev/null; then
            print_status "SUCCESS" "Namespace $ns exists"
        else
            print_status "ERROR" "Namespace $ns is missing"
            ((missing_namespaces++))
        fi
    done
    
    # Test resource quotas
    local quotas=$($KUBECTL_CMD get resourcequotas --all-namespaces --no-headers | wc -l)
    if [ "$quotas" -gt 0 ]; then
        print_status "SUCCESS" "$quotas resource quotas configured"
    else
        print_status "WARNING" "No resource quotas found"
    fi
    
    # Test limit ranges
    local limits=$($KUBECTL_CMD get limitranges --all-namespaces --no-headers | wc -l)
    if [ "$limits" -gt 0 ]; then
        print_status "SUCCESS" "$limits limit ranges configured"
    else
        print_status "WARNING" "No limit ranges found"
    fi
    
    return $missing_namespaces
}

# Function to test RBAC
test_rbac() {
    print_status "INFO" "Testing RBAC configuration..."
    
    # Test service accounts
    local service_accounts=("finbot-production" "finbot-staging" "finbot-database" "finbot-cache" "finbot-monitoring")
    local missing_sa=0
    
    for sa in "${service_accounts[@]}"; do
        local namespace="production"
        case $sa in
            *staging*) namespace="staging" ;;
            *database*) namespace="database" ;;
            *cache*) namespace="cache" ;;
            *monitoring*) namespace="monitoring" ;;
        esac
        
        if $KUBECTL_CMD get serviceaccount "$sa" -n "$namespace" &> /dev/null; then
            print_status "SUCCESS" "Service account $sa exists in $namespace"
        else
            print_status "ERROR" "Service account $sa missing in $namespace"
            ((missing_sa++))
        fi
    done
    
    # Test cluster roles
    local cluster_roles=$($KUBECTL_CMD get clusterroles | grep -c "finbot" || echo "0")
    if [ "$cluster_roles" -gt 0 ]; then
        print_status "SUCCESS" "$cluster_roles FinBot cluster roles found"
    else
        print_status "WARNING" "No FinBot cluster roles found"
    fi
    
    return $missing_sa
}

# Function to test Istio
test_istio() {
    if [ -z "$ISTIOCTL_CMD" ]; then
        print_status "WARNING" "Skipping Istio tests (istioctl not available)"
        return 0
    fi
    
    print_status "INFO" "Testing Istio service mesh..."
    
    # Test Istio installation
    if $KUBECTL_CMD get namespace istio-system &> /dev/null; then
        print_status "SUCCESS" "Istio system namespace exists"
    else
        print_status "ERROR" "Istio system namespace missing"
        return 1
    fi
    
    # Test Istiod
    local istiod_pods=$($KUBECTL_CMD get pods -n istio-system -l app=istiod --no-headers | grep "Running" | wc -l)
    if [ "$istiod_pods" -ge 3 ]; then
        print_status "SUCCESS" "$istiod_pods Istiod replicas running (HA configured)"
    elif [ "$istiod_pods" -gt 0 ]; then
        print_status "WARNING" "$istiod_pods Istiod replicas running (not HA)"
    else
        print_status "ERROR" "No Istiod pods running"
        return 1
    fi
    
    # Test ingress gateway
    local ingress_pods=$($KUBECTL_CMD get pods -n istio-system -l app=istio-ingressgateway --no-headers | grep "Running" | wc -l)
    if [ "$ingress_pods" -ge 3 ]; then
        print_status "SUCCESS" "$ingress_pods ingress gateway replicas running (HA configured)"
    elif [ "$ingress_pods" -gt 0 ]; then
        print_status "WARNING" "$ingress_pods ingress gateway replicas running (not HA)"
    else
        print_status "ERROR" "No ingress gateway pods running"
        return 1
    fi
    
    # Test sidecar injection
    local injection_enabled=$($KUBECTL_CMD get namespace production -o jsonpath='{.metadata.labels.istio-injection}' 2>/dev/null || echo "")
    if [ "$injection_enabled" = "enabled" ]; then
        print_status "SUCCESS" "Sidecar injection enabled for production namespace"
    else
        print_status "WARNING" "Sidecar injection not enabled for production namespace"
    fi
    
    # Test mTLS configuration
    local peer_auth=$($KUBECTL_CMD get peerauthentication -n istio-system --no-headers | wc -l)
    if [ "$peer_auth" -gt 0 ]; then
        print_status "SUCCESS" "mTLS peer authentication configured"
    else
        print_status "WARNING" "No mTLS peer authentication found"
    fi
    
    return 0
}

# Function to test networking
test_networking() {
    print_status "INFO" "Testing networking configuration..."
    
    # Test CNI (Calico)
    local calico_pods=$($KUBECTL_CMD get pods -n kube-system -l k8s-app=calico-node --no-headers | grep "Running" | wc -l)
    if [ "$calico_pods" -gt 0 ]; then
        print_status "SUCCESS" "$calico_pods Calico nodes running"
    else
        print_status "ERROR" "No Calico nodes found"
        return 1
    fi
    
    # Test network policies
    local net_policies=$($KUBECTL_CMD get networkpolicies --all-namespaces --no-headers | wc -l)
    if [ "$net_policies" -gt 0 ]; then
        print_status "SUCCESS" "$net_policies network policies configured"
    else
        print_status "WARNING" "No network policies found"
    fi
    
    # Test DNS resolution
    if $KUBECTL_CMD run test-dns --image=busybox --rm -i --restart=Never -- nslookup kubernetes.default.svc.cluster.local &> /dev/null; then
        print_status "SUCCESS" "DNS resolution working"
    else
        print_status "ERROR" "DNS resolution failed"
        return 1
    fi
    
    return 0
}

# Function to test autoscaling
test_autoscaling() {
    print_status "INFO" "Testing autoscaling configuration..."
    
    # Test metrics server
    local metrics_pods=$($KUBECTL_CMD get pods -n kube-system -l k8s-app=metrics-server --no-headers | grep "Running" | wc -l)
    if [ "$metrics_pods" -gt 0 ]; then
        print_status "SUCCESS" "Metrics server is running"
    else
        print_status "ERROR" "Metrics server not found"
        return 1
    fi
    
    # Test cluster autoscaler
    if $KUBECTL_CMD get deployment cluster-autoscaler -n kube-system &> /dev/null; then
        local ca_ready=$($KUBECTL_CMD get deployment cluster-autoscaler -n kube-system -o jsonpath='{.status.readyReplicas}')
        if [ "$ca_ready" -gt 0 ]; then
            print_status "SUCCESS" "Cluster autoscaler is ready"
        else
            print_status "WARNING" "Cluster autoscaler deployment exists but not ready"
        fi
    else
        print_status "WARNING" "Cluster autoscaler not found"
    fi
    
    # Test node problem detector
    if $KUBECTL_CMD get daemonset node-problem-detector -n kube-system &> /dev/null; then
        local npd_ready=$($KUBECTL_CMD get daemonset node-problem-detector -n kube-system -o jsonpath='{.status.numberReady}')
        if [ "$npd_ready" -gt 0 ]; then
            print_status "SUCCESS" "$npd_ready node problem detector pods ready"
        else
            print_status "WARNING" "Node problem detector exists but not ready"
        fi
    else
        print_status "WARNING" "Node problem detector not found"
    fi
    
    return 0
}

# Function to run connectivity tests
test_connectivity() {
    print_status "INFO" "Running connectivity tests..."
    
    # Create test namespace
    $KUBECTL_CMD create namespace $TEST_NAMESPACE --dry-run=client -o yaml | $KUBECTL_CMD apply -f -
    
    # Test pod-to-pod connectivity
    $KUBECTL_CMD run test-client --image=busybox -n $TEST_NAMESPACE --rm -i --restart=Never -- /bin/sh -c "
        echo 'Testing pod-to-pod connectivity...'
        nslookup kubernetes.default.svc.cluster.local
        echo 'Connectivity test completed'
    " &> /dev/null
    
    if [ $? -eq 0 ]; then
        print_status "SUCCESS" "Pod-to-pod connectivity working"
    else
        print_status "ERROR" "Pod-to-pod connectivity failed"
    fi
    
    # Cleanup test namespace
    $KUBECTL_CMD delete namespace $TEST_NAMESPACE --ignore-not-found=true
    
    return 0
}

# Function to generate test report
generate_report() {
    local total_tests=$1
    local failed_tests=$2
    local success_rate=$(( (total_tests - failed_tests) * 100 / total_tests ))
    
    echo ""
    echo "=================================================="
    print_status "INFO" "Infrastructure Test Report"
    echo "=================================================="
    echo "Total Tests: $total_tests"
    echo "Passed: $((total_tests - failed_tests))"
    echo "Failed: $failed_tests"
    echo "Success Rate: ${success_rate}%"
    echo ""
    
    if [ $failed_tests -eq 0 ]; then
        print_status "SUCCESS" "All infrastructure tests passed!"
        return 0
    else
        print_status "ERROR" "$failed_tests tests failed. Please check the issues above."
        return 1
    fi
}

# Main execution
main() {
    local failed_tests=0
    local total_tests=7
    
    # Redirect output to log file as well
    exec > >(tee -a $LOG_FILE)
    exec 2>&1
    
    echo "Infrastructure test started at: $(date)"
    echo ""
    
    check_prerequisites
    
    # Run all tests
    test_cluster_health || ((failed_tests++))
    test_namespaces || ((failed_tests++))
    test_rbac || ((failed_tests++))
    test_istio || ((failed_tests++))
    test_networking || ((failed_tests++))
    test_autoscaling || ((failed_tests++))
    test_connectivity || ((failed_tests++))
    
    # Generate report
    generate_report $total_tests $failed_tests
    local exit_code=$?
    
    echo ""
    echo "Infrastructure test completed at: $(date)"
    echo "Log file: $LOG_FILE"
    
    exit $exit_code
}

# Run main function
main "$@"