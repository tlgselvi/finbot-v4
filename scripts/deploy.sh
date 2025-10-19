#!/bin/bash

# AI Financial Analytics Deployment Script
set -e

echo "🚀 Starting deployment process..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOCKER_REGISTRY="ghcr.io"
IMAGE_NAME="ai-financial-analytics"
VERSION=${1:-latest}

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    log_info "Docker is running ✓"
}

# Check if Git repo is clean
check_git_status() {
    if [[ -n $(git status --porcelain) ]]; then
        log_warn "Working directory is not clean. Uncommitted changes detected."
        read -p "Do you want to continue? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Deployment cancelled."
            exit 0
        fi
    fi
    log_info "Git status is clean ✓"
}

# Run tests
run_tests() {
    log_info "Running tests..."
    
    if npm run test:ci; then
        log_info "All tests passed ✓"
    else
        log_error "Tests failed. Deployment aborted."
        exit 1
    fi
}

# Build Docker images
build_images() {
    log_info "Building Docker images..."
    
    # Build frontend
    log_info "Building frontend image..."
    docker build -t ${IMAGE_NAME}:${VERSION} .
    
    # Build backend
    log_info "Building backend image..."
    docker build -t ${IMAGE_NAME}-backend:${VERSION} ./backend
    
    log_info "Docker images built successfully ✓"
}

# Tag images for registry
tag_images() {
    log_info "Tagging images for registry..."
    
    docker tag ${IMAGE_NAME}:${VERSION} ${DOCKER_REGISTRY}/${IMAGE_NAME}:${VERSION}
    docker tag ${IMAGE_NAME}-backend:${VERSION} ${DOCKER_REGISTRY}/${IMAGE_NAME}-backend:${VERSION}
    
    if [[ "$VERSION" != "latest" ]]; then
        docker tag ${IMAGE_NAME}:${VERSION} ${DOCKER_REGISTRY}/${IMAGE_NAME}:latest
        docker tag ${IMAGE_NAME}-backend:${VERSION} ${DOCKER_REGISTRY}/${IMAGE_NAME}-backend:latest
    fi
    
    log_info "Images tagged successfully ✓"
}

# Push to registry
push_images() {
    log_info "Pushing images to registry..."
    
    docker push ${DOCKER_REGISTRY}/${IMAGE_NAME}:${VERSION}
    docker push ${DOCKER_REGISTRY}/${IMAGE_NAME}-backend:${VERSION}
    
    if [[ "$VERSION" != "latest" ]]; then
        docker push ${DOCKER_REGISTRY}/${IMAGE_NAME}:latest
        docker push ${DOCKER_REGISTRY}/${IMAGE_NAME}-backend:latest
    fi
    
    log_info "Images pushed successfully ✓"
}

# Deploy with docker-compose
deploy_compose() {
    log_info "Deploying with Docker Compose..."
    
    # Pull latest images
    docker-compose pull
    
    # Deploy
    docker-compose up -d
    
    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    sleep 30
    
    # Check service health
    if docker-compose ps | grep -q "Up"; then
        log_info "Services are running ✓"
    else
        log_error "Some services failed to start"
        docker-compose logs
        exit 1
    fi
}

# Git operations
git_operations() {
    log_info "Performing Git operations..."
    
    # Add all changes
    git add .
    
    # Commit if there are changes
    if [[ -n $(git status --porcelain) ]]; then
        read -p "Enter commit message: " commit_message
        git commit -m "$commit_message"
    fi
    
    # Push to remote
    git push origin main
    
    # Create tag if version is specified
    if [[ "$VERSION" != "latest" ]]; then
        git tag -a "v$VERSION" -m "Release version $VERSION"
        git push origin "v$VERSION"
    fi
    
    log_info "Git operations completed ✓"
}

# Cleanup old images
cleanup() {
    log_info "Cleaning up old Docker images..."
    
    # Remove dangling images
    docker image prune -f
    
    # Remove old versions (keep last 3)
    docker images ${IMAGE_NAME} --format "table {{.Tag}}" | tail -n +4 | xargs -r docker rmi ${IMAGE_NAME}: 2>/dev/null || true
    
    log_info "Cleanup completed ✓"
}

# Main deployment process
main() {
    log_info "AI Financial Analytics Deployment v$VERSION"
    log_info "=========================================="
    
    check_docker
    check_git_status
    run_tests
    build_images
    tag_images
    
    # Ask for confirmation before pushing
    read -p "Push images to registry and deploy? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        push_images
        deploy_compose
        git_operations
        cleanup
        
        log_info "🎉 Deployment completed successfully!"
        log_info "Frontend: http://localhost:3000"
        log_info "Backend API: http://localhost:5000"
        log_info "Grafana: http://localhost:3001"
        log_info "Prometheus: http://localhost:9090"
    else
        log_info "Deployment cancelled."
    fi
}

# Run main function
main "$@"