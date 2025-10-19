# Changelog

All notable changes to FinBot v4 will be documented in this file.

## [4.0.1] - 2024-10-19

### 🔧 Fixed
- **Backend Port Conflict**: Changed backend port from 8000 to 8001 to resolve conflicts
- **API Integration**: Fixed frontend-backend communication issues
- **Environment Configuration**: Added proper environment variable setup

### ✨ Added
- **Centralized API Client**: Created `src/utils/api.ts` for unified API management
- **Next.js API Routes**: Added proxy routes for dashboard and insights
- **Health Check Integration**: Implemented comprehensive service health monitoring
- **ML Service Integration**: Connected frontend with ML prediction services

### 🚀 Improved
- **Dashboard Performance**: Optimized data fetching with proper error handling
- **Development Experience**: Streamlined local development setup
- **Service Communication**: Enhanced inter-service communication reliability

### 📊 Current Status
- **Completion**: 85% of core features implemented
- **Services Running**: 5/5 services operational
- **API Endpoints**: 8+ endpoints active and tested

### 🔗 Service URLs
- Frontend: http://localhost:3000
- Backend API: http://localhost:8001
- ML Service: http://localhost:8080
- Database: PostgreSQL on 5432
- Cache: Redis on 6379

---

## [4.0.0] - 2024-10-18

### 🎉 Initial Release
- **Core Infrastructure**: Database schema, Redis caching, Docker setup
- **ML Pipeline**: Anomaly detection, risk assessment, budget optimization
- **Goal Tracking**: AI-assisted financial goal management system
- **Frontend Dashboard**: React-based analytics interface
- **Backend Services**: Express.js API with TypeScript
- **Security**: JWT authentication, encryption, audit logging

### 🏗️ Architecture
- Microservices architecture with Docker
- PostgreSQL + Redis data layer
- Python ML services with FastAPI
- Next.js frontend with TailwindCSS
- Comprehensive monitoring and logging