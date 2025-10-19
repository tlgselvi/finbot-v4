# AI Financial Analytics Makefile

.PHONY: help install build test docker-build docker-push deploy clean

# Default target
help:
	@echo "AI Financial Analytics - Available Commands:"
	@echo "==========================================="
	@echo "install          Install dependencies"
	@echo "build            Build the application"
	@echo "test             Run all tests"
	@echo "test-unit        Run unit tests"
	@echo "test-integration Run integration tests"
	@echo "test-e2e         Run E2E tests"
	@echo "docker-build     Build Docker images"
	@echo "docker-push      Push Docker images to registry"
	@echo "docker-run       Run with Docker Compose"
	@echo "deploy           Full deployment process"
	@echo "clean            Clean up build artifacts and Docker images"
	@echo "lint             Run linting"
	@echo "format           Format code"
	@echo "type-check       Run TypeScript type checking"

# Development commands
install:
	npm ci
	cd backend && npm ci

build:
	npm run build
	cd backend && npm run build

lint:
	npm run lint
	cd backend && npm run lint

format:
	npm run format
	cd backend && npm run format

type-check:
	npm run type-check
	cd backend && npm run type-check

# Testing commands
test: test-unit test-integration

test-unit:
	npm run test:unit
	cd backend && npm run test:unit

test-integration:
	npm run test:integration
	cd backend && npm run test:integration

test-e2e:
	npm run test:e2e

test-coverage:
	npm run test:coverage
	cd backend && npm run test:coverage

# Docker commands
docker-build:
	docker build -t ai-financial-analytics:latest .
	docker build -t ai-financial-analytics-backend:latest ./backend

docker-push:
	docker push ghcr.io/ai-financial-analytics:latest
	docker push ghcr.io/ai-financial-analytics-backend:latest

docker-run:
	docker-compose up -d

docker-stop:
	docker-compose down

docker-logs:
	docker-compose logs -f

# Deployment commands
deploy:
	chmod +x scripts/deploy.sh
	./scripts/deploy.sh

deploy-version:
	@read -p "Enter version: " version; \
	chmod +x scripts/deploy.sh; \
	./scripts/deploy.sh $$version

# Git commands
git-push:
	git add .
	@read -p "Enter commit message: " msg; \
	git commit -m "$$msg"
	git push origin main

git-tag:
	@read -p "Enter tag version: " version; \
	git tag -a "v$$version" -m "Release version $$version"; \
	git push origin "v$$version"

# Cleanup commands
clean:
	rm -rf node_modules
	rm -rf backend/node_modules
	rm -rf .next
	rm -rf backend/dist
	rm -rf coverage
	rm -rf test-results
	docker system prune -f
	docker image prune -f

clean-all: clean
	docker-compose down -v
	docker system prune -a -f

# Development server
dev:
	npm run dev

dev-backend:
	cd backend && npm run dev

dev-full:
	docker-compose -f docker-compose.dev.yml up

# Production commands
prod-build:
	NODE_ENV=production npm run build
	cd backend && NODE_ENV=production npm run build

prod-start:
	NODE_ENV=production npm start

# Monitoring
logs:
	docker-compose logs -f

status:
	docker-compose ps

health:
	curl -f http://localhost:3000/api/health || exit 1
	curl -f http://localhost:5000/health || exit 1

# Database commands
db-migrate:
	cd backend && npm run migrate

db-seed:
	cd backend && npm run seed

db-reset:
	cd backend && npm run db:reset

# Security
security-scan:
	npm audit
	cd backend && npm audit
	docker run --rm -v $(PWD):/app aquasec/trivy fs /app

# Performance
perf-test:
	npm run test:performance

load-test:
	npm run test:load