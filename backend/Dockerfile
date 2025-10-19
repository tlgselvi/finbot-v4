# FinBot Backend API Dockerfile
FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm cache clean --force

# Development dependencies for building
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Install dev dependencies for TypeScript build
RUN npm ci
RUN npm run build 2>/dev/null || echo "No build script found, using ts-node"

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8001

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

# Install ts-node for production (since we're using TypeScript directly)
RUN npm install -g ts-node typescript

# Create logs directory
RUN mkdir -p logs && chown nodejs:nodejs logs

USER nodejs

EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8001/health || exit 1

CMD ["npm", "run", "dev"]