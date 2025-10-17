# Multi-stage Dockerfile for FinBot AI Financial Analytics

# Stage 1: Build frontend
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files
COPY package*.json ./
COPY yarn.lock* ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY public/ ./public/
COPY next.config.js ./
COPY tailwind.config.js ./
COPY tsconfig.json ./

# Build frontend
RUN npm run build

# Stage 2: Build backend
FROM node:18-alpine AS backend-builder

WORKDIR /app/backend

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY backend/src/ ./src/
COPY backend/tsconfig.json ./

# Build backend
RUN npm run build

# Stage 3: Python ML services
FROM python:3.9-slim AS ml-builder

WORKDIR /app/ml

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY ml-pipeline/requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy ML source code
COPY ml-pipeline/ ./

# Stage 4: Production image
FROM node:18-alpine AS production

# Install Python for ML services
RUN apk add --no-cache python3 py3-pip

# Create app directory
WORKDIR /app

# Copy built frontend
COPY --from=frontend-builder /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder /app/frontend/public ./frontend/public
COPY --from=frontend-builder /app/frontend/package.json ./frontend/
COPY --from=frontend-builder /app/frontend/node_modules ./frontend/node_modules

# Copy built backend
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/package.json ./backend/
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules

# Copy ML services
COPY --from=ml-builder /app/ml ./ml-pipeline

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S finbot -u 1001

# Set ownership
RUN chown -R finbot:nodejs /app
USER finbot

# Expose ports
EXPOSE 3000 8000 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Start script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "start"]