#!/bin/bash

# Game Gauge API - Quick Setup Script
# This script helps you get started quickly

set -e  # Exit on error

echo "🎮 Game Gauge API - Quick Setup"
echo "================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+ first."
    exit 1
fi

echo "✅ Node.js $(node --version) detected"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "⚠️  Docker is not installed. You'll need it to run PostgreSQL locally."
    echo "   Install from: https://www.docker.com/get-started"
    exit 1
fi

echo "✅ Docker detected"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "📝 Creating .env file..."
    cp .env.example .env
    
    # Generate a random JWT secret
    JWT_SECRET=$(openssl rand -base64 32)
    
    # Update .env with generated secret
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/your-super-secret-jwt-key-change-this/$JWT_SECRET/" .env
    else
        # Linux
        sed -i "s/your-super-secret-jwt-key-change-this/$JWT_SECRET/" .env
    fi
    
    echo "✅ .env created with random JWT secret"
else
    echo "✅ .env already exists"
fi

# Start Docker containers
echo ""
echo "🐳 Starting PostgreSQL with Docker..."
docker-compose up -d

echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 3

# Run migrations
echo ""
echo "🗄️  Running database migrations..."
npm run prisma:migrate

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start the dev server:    npm run dev"
echo "  2. View database:            npm run prisma:studio"
echo "  3. Test API:                 curl http://localhost:3000/health"
echo ""
echo "📚 Check README.md for API documentation and examples"
echo ""
