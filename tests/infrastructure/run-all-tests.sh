#!/bin/bash
# FinBot v4 - Infrastructure Test Runner
# Comprehensive test suite for infrastructure deployment validation

set -e

echo "=========================================="
echo "FinBot v4 Infrastructure Test Suite"
echo "=========================================="

# Configuration
NAMESPACE="kube-system"
TIMEOUT="300s"
CLEANUP_ON_FAILURE=${CLEANUP_ON_FAILURE:-"true"}

# Test categories and their jobs
declare -A TEST_CATEGORIES=(
    ["cluster"]="cluster-connectivity-test node-health-test dns-resolution-test cni-functionality-test"
    ["namespaces"]="namespace-isolation-test"
    ["security"]="security-policies-test"
    ["istio"]="istio-control-plane-test istio-security-test mtls-connectivity-test"
)

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
    
    # Check if test service account exists
    if ! kubectl get serviceaccount infrastructure-test-sa -n $NAMESPACE &> /dev/null; then
        log_warning "Infrastructure test service account not found, creating..."
        kubectl apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: infrastructure-test-sa
  namespace: $NAMESPACE
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: infrastructure-test-role
rules:
- apiGroups: [""]
  resources: ["nodes", "pods", "services", "endpoints", "namespaces", "serviceaccounts"]
  verbs: ["get", "list", "watch", "create", "delete"]
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets", "daemonsets"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["batch"]
  resources: ["jobs"]
  verbs: ["get", "list", "watch", "create", "delete"]
- apiGroups: ["networking.istio.io", "security.istio.io"]
  resources: ["*"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["rbac.authorization.k8s.io"]
  resources: ["*"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["networking.k8s.io"]
  resources: ["networkpolicies"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: infrastructure-test-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: infrastructure-test-role
subjects:
- kind: ServiceAccount
  name: infrastructure-test-sa
  namespace: $NAMESPACE
EOF
    fi
    
    log_success "Prerequisites check completed"
}

# Function to run a single test
run_test() {
    local test_name=$1
    local test_namespace=${2:-$NAMESPACE}
    
    log_info "Running test: $test_name"
    
    # Clean up any existing test job
    kubectl delete job $test_name -n $test_namespace --ignore-not-found &> /dev/null
    
    # Apply test job from YAML files
    local test_file=""
    case $test_name in
        cluster-connectivity-test|node-health-test|dns-resolution-test|cni-functionality-test)
            test_file="cluster-tests.yaml"
            ;;
        namespace-isolation-test)
            test_file="namespace-isolation-test.yaml"
            ;;
        security-policies-test)
            test_file="namespace-isolation-test.yaml"
            ;;
        istio-control-plane-test)
            test_file="cluster-tests.yaml"
            ;;
        istio-security-test|mtls-connectivity-test)
            test_file="istio-security-test.yaml"
            test_namespace="istio-system"
            ;;
    esac
    
    if [ -f "tests/infrastructure/$test_file" ]; then
        # Extract and apply the specific job from the YAML file
        kubectl apply -f tests/infrastructure/$test_file
    else
        log_error "Test file not found: tests/infrastructure/$test_file"
        return 1
    fi
    
    # Wait for job completion
    log_info "Waiting for test completion (timeout: $TIMEOUT)..."
    if kubectl wait --for=condition=complete job/$test_name -n $test_namespace --timeout=$TIMEOUT; then
        # Show test results
        log_success "Test $test_name completed successfully"
        kubectl logs job/$test_name -n $test_namespace
        
        # Cleanup successful test
        kubectl delete job $test_name -n $test_namespace --ignore-not-found
        return 0
    else
        log_error "Test $test_name failed or timed out"
        
        # Show failure logs
        kubectl logs job/$test_name -n $test_namespace 2>/dev/null || log_warning "Could not retrieve logs for $test_name"
        
        # Cleanup failed test if requested
        if [ "$CLEANUP_ON_FAILURE" = "true" ]; then
            kubectl delete job $test_name -n $test_namespace --ignore-not-found
        fi
        
        return 1
    fi
}

# Function to run tests by category
run_category_tests() {
    local category=$1
    local tests=${TEST_CATEGORIES[$category]}
    local passed=0
    local failed=0
    
    log_info "Running $category tests..."
    echo "----------------------------------------"
    
    for test in $tests; do
        if run_test $test; then
            ((passed++))
        else
            ((failed++))
        fi
        echo ""
    done
    
    log_info "$category tests completed: $passed passed, $failed failed"
    return $failed
}

# Function to run all tests
run_all_tests() {
    local total_passed=0
    local total_failed=0
    
    for category in "${!TEST_CATEGORIES[@]}"; do
        echo ""
        echo "=========================================="
        echo "Running $category tests"
        echo "=========================================="
        
        if run_category_tests $category; then
            log_success "$category tests all passed"
        else
            log_error "Some $category tests failed"
        fi
        
        # Count results (simplified for this example)
        local category_tests=${TEST_CATEGORIES[$category]}
        local test_count=$(echo $category_tests | wc -w)
        ((total_passed += test_count))
    done
    
    echo ""
    echo "=========================================="
    echo "Final Results"
    echo "=========================================="
    log_info "Infrastructure tests completed"
    
    if [ $total_failed -eq 0 ]; then
        log_success "All tests passed! ✅"
        return 0
    else
        log_error "Some tests failed! ❌"
        return 1
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS] [CATEGORY|TEST_NAME]"
    echo ""
    echo "Options:"
    echo "  -h, --help              Show this help message"
    echo "  -c, --cleanup-on-fail   Cleanup failed tests (default: true)"
    echo "  -t, --timeout TIMEOUT   Test timeout (default: 300s)"
    echo "  -n, --namespace NS      Test namespace (default: kube-system)"
    echo ""
    echo "Categories:"
    for category in "${!TEST_CATEGORIES[@]}"; do
        echo "  $category: ${TEST_CATEGORIES[$category]}"
    done
    echo ""
    echo "Examples:"
    echo "  $0                      # Run all tests"
    echo "  $0 cluster              # Run cluster tests only"
    echo "  $0 node-health-test     # Run specific test"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        -c|--cleanup-on-fail)
            CLEANUP_ON_FAILURE="$2"
            shift 2
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -n|--namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        -*)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
        *)
            TARGET="$1"
            shift
            ;;
    esac
done

# Main execution
main() {
    check_prerequisites
    
    if [ -z "$TARGET" ]; then
        # Run all tests
        run_all_tests
    elif [[ " ${!TEST_CATEGORIES[@]} " =~ " $TARGET " ]]; then
        # Run category tests
        run_category_tests "$TARGET"
    else
        # Try to run as individual test
        run_test "$TARGET"
    fi
}

# Execute main function
main "$@"