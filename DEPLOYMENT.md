# 🚀 FinBot v4 Deployment Guide

## 📋 Prerequisites

- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+
- Git

## 🏃‍♂️ Quick Start (Development)

### 1. Clone Repository
```bash
git clone https://github.com/tlgselvi/finbot-v4.git
cd finbot-v4
```

### 2. Install Dependencies
```bash
# Frontend dependencies
npm install

# Backend dependencies
cd backend && npm install && cd ..
```

### 3. Environment Setup
```bash
# Copy environment files
cp backend/.env.example backend/.env
cp .env.local.example .env.local

# Update database credentials in backend/.env if needed
```

### 4. Start Infrastructure Services
```bash
# Start PostgreSQL and Redis
docker-compose -f docker-compose.dev.yml up -d

# Wait for services to be ready (30 seconds)
sleep 30
```

### 5. Database Setup
```bash
cd backend

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed database
npx prisma db seed

cd ..
```

### 6. Start Application Services
```bash
# Terminal 1: Start Backend (Port 8001)
cd backend && npm run dev

# Terminal 2: Start Frontend (Port 3000)
npm run dev

# Terminal 3: ML Service is already running via Docker (Port 8080)
```

## ✅ Verification

### Health Checks
```bash
# Backend API
curl http://localhost:8001/health

# ML Service
curl http://localhost:8080/health

# Frontend
curl http://localhost:3000

# Dashboard API
curl http://localhost:3000/api/dashboard
```

### Expected Responses
- **Backend Health**: `{"status":"OK","service":"FinBot Backend API",...}`
- **ML Health**: `{"status":"OK","service":"FinBot ML Service",...}`
- **Dashboard**: `{"success":true,"data":{...}}`

## 🐳 Docker Development

### Full Docker Setup
```bash
# Build and start all services
docker-compose up --build

# Services will be available on:
# - Frontend: http://localhost:3000
# - Backend: http://localhost:8001
# - ML Service: http://localhost:8080
```

## 🔧 Troubleshooting

### Port Conflicts
```bash
# Check what's using ports
netstat -ano | findstr :3000
netstat -ano | findstr :8001
netstat -ano | findstr :8080

# Kill processes if needed
taskkill /PID <process_id> /F
```

### Database Issues
```bash
# Reset database
cd backend
npx prisma migrate reset
npx prisma db seed
```

### Service Dependencies
```bash
# Check Docker services
docker ps

# Restart infrastructure
docker-compose -f docker-compose.dev.yml restart
```

## 📊 Service Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   ML Service    │
│   (Next.js)     │◄──►│   (Express)     │◄──►│   (FastAPI)     │
│   Port: 3000    │    │   Port: 8001    │    │   Port: 8080    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 ▼
                    ┌─────────────────┐    ┌─────────────────┐
                    │   PostgreSQL    │    │     Redis       │
                    │   Port: 5432    │    │   Port: 6379    │
                    └─────────────────┘    └─────────────────┘
```

## 🔐 Security Notes

- Change default passwords in production
- Use environment variables for secrets
- Enable HTTPS in production
- Configure proper CORS settings
- Set up proper authentication

## 📈 Monitoring

### Health Endpoints
- Backend: `GET /health`
- ML Service: `GET /health`
- Database: Included in backend health check
- Redis: Included in backend health check

### Logs
```bash
# Backend logs
cd backend && npm run dev

# Docker logs
docker-compose logs -f

# Specific service logs
docker logs finbot-postgres-dev
docker logs finbot-redis-dev
docker logs finbot-ml-service-dev
```

## 🚀 Production Deployment

### Environment Variables
```bash
# Production environment
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@prod-db:5432/finbot
REDIS_URL=redis://prod-redis:6379
JWT_SECRET=your-super-secure-jwt-secret
```

### Build Commands
```bash
# Frontend build
npm run build

# Backend build
cd backend && npm run build

# Docker production build
docker-compose -f docker-compose.production.yml up --build
```

---

## 📞 Support

- **Issues**: GitHub Issues
- **Documentation**: README-finbot-v4.md
- **Changelog**: CHANGELOG.md