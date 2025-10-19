#!/bin/bash

# FinBot ML Analytics Test Runner Script
# This script runs different types of tests for the ML analytics system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
TEST_TYPE="all"
ENVIRONMENT="test"
COVERAGE=false
PARALLEL=false
VERBOSE=false
GENERATE_DATA=false
CLEANUP=true

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Run FinBot ML Analytics tests

OPTIONS:
    -t, --type TYPE         Test type: unit, integration, e2e, performance, smoke, all (default: all)
    -e, --environment ENV   Environment: test, staging, production (default: test)
    -c, --coverage          Generate coverage report
    -p, --parallel          Run tests in parallel
    -v, --verbose           Verbose output
    -g, --generate-data     Generate test data before running tests
    -n, --no-cleanup        Don't cleanup after tests
    -h, --help              Show this help message

EXAMPLES:
    $0 --type unit --coverage
    $0 --type integration --environment staging
    $0 --type e2e --verbose
    $0 --type smoke --environment production
    $0 --generate-data --type all --coverage

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--type)
            TEST_TYPE="$2"
            shift 2
            ;;
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -c|--coverage)
            COVERAGE=true
            shift
            ;;
        -p|--parallel)
            PARALLEL=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -g|--generate-data)
            GENERATE_DATA=true
            shift
            ;;
        -n|--no-cleanup)
            CLEANUP=false
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate test type
case $TEST_TYPE in
    unit|integration|e2e|performance|smoke|all)
        ;;
    *)
        print_error "Invalid test type: $TEST_TYPE"
        show_usage
        exit 1
        ;;
esac

# Set environment variables
export ENVIRONMENT=$ENVIRONMENT
export PYTHONPATH="${PYTHONPATH}:$(pwd)/src:$(pwd)/tests"

print_info "Starting FinBot ML Analytics tests"
print_info "Test type: $TEST_TYPE"
print_info "Environment: $ENVIRONMENT"
print_info "Coverage: $COVERAGE"
print_info "Parallel: $PARALLEL"

# Generate test data if requested
if [ "$GENERATE_DATA" = true ]; then
    print_info "Generating test data..."
    python scripts/generate_test_data.py \
        --users 100 \
        --transactions 1000 \
        --output-dir data/test \
        --include-features
    print_success "Test data generated"
fi

# Set up test environment
setup_test_environment() {
    print_info "Setting up test environment..."
    
    # Create necessary directories
    mkdir -p logs
    mkdir -p reports
    mkdir -p htmlcov
    
    # Set environment variables for testing
    export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/test_ml_db"
    export REDIS_URL="redis://localhost:6379/1"
    export LOG_LEVEL="DEBUG"
    export ML_MODEL_PATH="models/test"
    
    # Start test services if needed
    if [ "$ENVIRONMENT" = "test" ]; then
        print_info "Starting test services..."
        docker-compose -f docker-compose.test.yml up -d --wait
    fi
}

# Run unit tests
run_unit_tests() {
    print_info "Running unit tests..."
    
    local pytest_args="tests/unit/"
    
    if [ "$COVERAGE" = true ]; then
        pytest_args="$pytest_args --cov=src --cov-report=html --cov-report=xml --cov-report=term-missing"
    fi
    
    if [ "$PARALLEL" = true ]; then
        pytest_args="$pytest_args -n auto"
    fi
    
    if [ "$VERBOSE" = true ]; then
        pytest_args="$pytest_args -v"
    fi
    
    pytest $pytest_args --junitxml=reports/unit-tests.xml
    
    if [ $? -eq 0 ]; then
        print_success "Unit tests passed"
    else
        print_error "Unit tests failed"
        return 1
    fi
}

# Run integration tests
run_integration_tests() {
    print_info "Running integration tests..."
    
    local pytest_args="tests/integration/"
    
    if [ "$VERBOSE" = true ]; then
        pytest_args="$pytest_args -v"
    fi
    
    pytest $pytest_args --junitxml=reports/integration-tests.xml
    
    if [ $? -eq 0 ]; then
        print_success "Integration tests passed"
    else
        print_error "Integration tests failed"
        return 1
    fi
}

# Run E2E tests
run_e2e_tests() {
    print_info "Running E2E tests..."
    
    # Start full application stack
    if [ "$ENVIRONMENT" = "test" ]; then
        print_info "Starting E2E test environment..."
        docker-compose -f docker-compose.e2e.yml up -d --wait
        sleep 30  # Wait for services to be ready
    fi
    
    # Run Python E2E tests
    local pytest_args="tests/e2e/"
    
    if [ "$VERBOSE" = true ]; then
        pytest_args="$pytest_args -v"
    fi
    
    pytest $pytest_args --junitxml=reports/e2e-tests.xml
    
    # Run Playwright tests
    if command -v npx &> /dev/null; then
        print_info "Running Playwright tests..."
        npx playwright test tests/e2e/playwright/ --reporter=junit --output-dir=reports/playwright
    else
        print_warning "Playwright not available, skipping UI tests"
    fi
    
    if [ $? -eq 0 ]; then
        print_success "E2E tests passed"
    else
        print_error "E2E tests failed"
        return 1
    fi
}

# Run performance tests
run_performance_tests() {
    print_info "Running performance tests..."
    
    # Start test services
    if [ "$ENVIRONMENT" = "test" ]; then
        docker-compose -f docker-compose.test.yml up -d --wait
        sleep 10
    fi
    
    # Run Locust performance tests
    if command -v locust &> /dev/null; then
        print_info "Running Locust performance tests..."
        locust -f tests/performance/locustfile.py \
            --host http://localhost:8080 \
            --users 50 \
            --spawn-rate 5 \
            --run-time 2m \
            --html reports/performance-report.html \
            --headless
    else
        print_warning "Locust not available, running pytest performance tests only"
    fi
    
    # Run pytest performance tests
    pytest tests/performance/ -m performance --junitxml=reports/performance-tests.xml
    
    if [ $? -eq 0 ]; then
        print_success "Performance tests passed"
    else
        print_error "Performance tests failed"
        return 1
    fi
}

# Run smoke tests
run_smoke_tests() {
    print_info "Running smoke tests..."
    
    local staging_url="http://localhost:8080"
    
    if [ "$ENVIRONMENT" = "staging" ]; then
        staging_url="https://staging-ml-api.finbot.com"
    elif [ "$ENVIRONMENT" = "production" ]; then
        staging_url="https://ml-api.finbot.com"
    fi
    
    local pytest_args="tests/smoke/ --staging-url=$staging_url"
    
    if [ "$VERBOSE" = true ]; then
        pytest_args="$pytest_args -v"
    fi
    
    pytest $pytest_args --junitxml=reports/smoke-tests.xml
    
    if [ $? -eq 0 ]; then
        print_success "Smoke tests passed"
    else
        print_error "Smoke tests failed"
        return 1
    fi
}

# Cleanup function
cleanup_test_environment() {
    if [ "$CLEANUP" = true ]; then
        print_info "Cleaning up test environment..."
        
        # Stop Docker services
        docker-compose -f docker-compose.test.yml down -v 2>/dev/null || true
        docker-compose -f docker-compose.e2e.yml down -v 2>/dev/null || true
        
        # Clean up temporary files
        find . -name "*.pyc" -delete 2>/dev/null || true
        find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
        
        print_success "Cleanup completed"
    fi
}

# Set up trap for cleanup
trap cleanup_test_environment EXIT

# Main execution
main() {
    setup_test_environment
    
    local exit_code=0
    
    case $TEST_TYPE in
        unit)
            run_unit_tests || exit_code=1
            ;;
        integration)
            run_integration_tests || exit_code=1
            ;;
        e2e)
            run_e2e_tests || exit_code=1
            ;;
        performance)
            run_performance_tests || exit_code=1
            ;;
        smoke)
            run_smoke_tests || exit_code=1
            ;;
        all)
            run_unit_tests || exit_code=1
            run_integration_tests || exit_code=1
            run_e2e_tests || exit_code=1
            run_performance_tests || exit_code=1
            run_smoke_tests || exit_code=1
            ;;
    esac
    
    # Generate test report summary
    if [ -d "reports" ]; then
        print_info "Generating test report summary..."
        
        echo "# Test Results Summary" > reports/summary.md
        echo "Generated: $(date)" >> reports/summary.md
        echo "" >> reports/summary.md
        
        for report in reports/*.xml; do
            if [ -f "$report" ]; then
                echo "- $(basename "$report"): Generated" >> reports/summary.md
            fi
        done
        
        if [ "$COVERAGE" = true ] && [ -f "coverage.xml" ]; then
            echo "- Coverage report: Available in htmlcov/" >> reports/summary.md
        fi
    fi
    
    if [ $exit_code -eq 0 ]; then
        print_success "All tests completed successfully!"
    else
        print_error "Some tests failed. Check the reports for details."
    fi
    
    return $exit_code
}

# Run main function
main