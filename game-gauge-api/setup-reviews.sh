#!/bin/bash

echo "🔄 Setting up review enhancements..."

# Step 1: Run the migration
echo "📦 Running database migration..."
npx prisma migrate deploy

# Step 2: Generate Prisma client
echo "⚙️  Generating Prisma client..."
npx prisma generate

echo "✅ Done! The Prisma client has been updated with review enhancements."
echo ""
echo "You can now run your tests:"
echo "  npm test"
