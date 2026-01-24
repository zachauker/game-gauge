#!/bin/bash

echo "🔄 Pushing schema to database (Development Mode)..."
echo ""
echo "This will:"
echo "  1. Push your Prisma schema to the database"
echo "  2. Generate the Prisma client with all types"
echo ""
echo "Use this for:"
echo "  ✅ Development/testing"
echo "  ✅ First-time setup"
echo "  ✅ When migrations are broken"
echo ""
echo "⚠️  This may reset your database!"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "❌ Cancelled."
    exit 1
fi

# Push schema directly to database
echo "📤 Pushing schema..."
npx prisma db push --accept-data-loss

# Generate Prisma client
echo "⚙️  Generating Prisma client..."
npx prisma generate

echo ""
echo "✅ Schema pushed successfully!"
echo ""
echo "Your database now has:"
echo "  ✅ All tables (User, Game, Review, Rating, GameList, etc.)"
echo "  ✅ Review enhancements (spoilers, helpful votes)"
echo "  ✅ All indexes and relations"
echo ""
echo "Next steps:"
echo "  1. Run tests: npm test"
echo "  2. Start server: npm run dev"
