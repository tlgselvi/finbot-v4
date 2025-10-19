#!/bin/sh
set -e

echo "🚀 Starting FinBot Backend..."

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until pg_isready -h postgres -p 5432 -U finbot; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "✅ PostgreSQL is ready!"

# Wait for Redis to be ready
echo "⏳ Waiting for Redis to be ready..."
until redis-cli -h redis ping; do
  echo "Redis is unavailable - sleeping"
  sleep 2
done

echo "✅ Redis is ready!"

# Run database migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy || {
  echo "⚠️  Migration failed, trying to create and migrate..."
  npx prisma migrate dev --name init || {
    echo "❌ Migration failed completely"
    exit 1
  }
}

# Generate Prisma client (in case schema changed)
echo "🔧 Generating Prisma client..."
npx prisma generate

# Seed database if needed
echo "🌱 Seeding database..."
npm run db:seed || echo "⚠️  Seeding failed or already done"

echo "✅ Database setup completed!"

# Execute the main command
exec "$@"