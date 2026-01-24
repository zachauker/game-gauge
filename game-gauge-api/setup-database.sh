#!/bin/bash

echo "🔄 Setting up Game Gauge database from scratch..."

# Check if database is empty or if we should reset
echo ""
echo "⚠️  WARNING: This will reset your database!"
echo "All existing data will be lost."
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "❌ Cancelled."
    exit 1
fi

# Step 1: Reset database
echo "🗑️  Resetting database..."
npx prisma migrate reset --force --skip-seed

# Step 2: Generate Prisma client
echo "⚙️  Generating Prisma client..."
npx prisma generate

# Step 3: Run migrations
echo "📦 Running migrations..."
npx prisma migrate deploy

echo ""
echo "✅ Database setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start the server: npm run dev"
echo "  2. Run tests: npm test"
