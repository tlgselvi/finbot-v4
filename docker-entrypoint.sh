#!/bin/sh
set -e

echo "🚀 Starting FinBot AI Financial Analytics..."

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
until nc -z postgres 5432; do
  echo "Database is unavailable - sleeping"
  sleep 1
done
echo "✅ Database is ready!"

# Wait for Redis to be ready
echo "⏳ Waiting for Redis connection..."
until nc -z redis 6379; do
  echo "Redis is unavailable - sleeping"
  sleep 1
done
echo "✅ Redis is ready!"

# Run database migrations
echo "🔄 Running database migrations..."
cd /app/backend && npm run migrate

# Start ML service in background
echo "🤖 Starting ML service..."
cd /app/ml-pipeline && python app.py &

# Start backend API in background
echo "🔧 Starting backend API..."
cd /app/backend && npm start &

# Start frontend
echo "🌐 Starting frontend..."
cd /app/frontend && npm start

# Keep container running
wait