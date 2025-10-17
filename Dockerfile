# Simplified Dockerfile for FinBot AI Financial Analytics
FROM node:18-alpine

# Install Python for ML services
RUN apk add --no-cache python3 py3-pip curl

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy all source code
COPY . .

# Install backend dependencies
WORKDIR /app/backend
RUN npm install --legacy-peer-deps

# Install ML dependencies
WORKDIR /app/ml-pipeline
RUN pip install --no-cache-dir -r requirements.txt

# Back to root
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S finbot -u 1001 && \
    chown -R finbot:nodejs /app

USER finbot

# Expose ports
EXPOSE 3000 8000 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start all services
CMD ["sh", "-c", "cd /app/ml-pipeline && python app.py & cd /app/backend && npm start & cd /app && npm run dev"]