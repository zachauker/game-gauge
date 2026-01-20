# Game Gauge API

Backend API for Game Gauge - A video game tracking, rating, and review platform similar to Goodreads but for games.

## Tech Stack

- **Runtime:** Node.js 20+ with TypeScript
- **Framework:** Express.js
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** JWT
- **Validation:** Zod
- **Logging:** Winston

## Features (Current & Planned)

### Implemented ✅
- User authentication (register, login, JWT)
- Environment validation
- Error handling with custom error classes
- Request logging
- Database schema for users, games, reviews, ratings, and lists
- Layered architecture (controllers → services → repositories)

### Coming Soon 🚧
- Game CRUD operations
- Review system
- Rating system
- Custom game lists (wishlist, favorites, etc.)
- External API integration (IGDB for game metadata)
- Search and filtering
- User profiles
- Social features

## Project Structure

```
src/
├── config/              # Configuration (env, database)
├── controllers/         # HTTP request handlers
├── services/           # Business logic
├── repositories/       # Data access layer
├── middleware/         # Express middleware
├── routes/             # API routes
├── utils/              # Utility functions
├── validators/         # Zod validation schemas
└── types/              # TypeScript type definitions
```

## Getting Started

### Prerequisites

- Node.js 20 or higher
- Docker and Docker Compose (for local database)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/zachauker/game-gauge.git
   cd game-gauge/game-gauge-api
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and update the following:
   ```env
   JWT_SECRET=your-super-secret-key-at-least-32-characters-long
   # Other values can stay as defaults for local development
   ```

4. **Start the PostgreSQL database**
   ```bash
   docker-compose up -d
   ```
   
   Verify it's running:
   ```bash
   docker ps
   ```

5. **Run database migrations**
   ```bash
   npm run prisma:migrate
   ```

6. **Start the development server**
   ```bash
   npm run dev
   ```
   
   The API will be available at `http://localhost:3000`

### Testing the API

**Health Check:**
```bash
curl http://localhost:3000/health
```

**Register a new user:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "password": "Test1234",
    "firstName": "Test",
    "lastName": "User"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test1234"
  }'
```

**Get current user (requires token):**
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Development Commands

```bash
# Start dev server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test
npm run test:watch

# Database commands
npm run prisma:migrate     # Create and run migrations
npm run prisma:studio      # Open Prisma Studio (database GUI)
npm run prisma:generate    # Regenerate Prisma Client

# Code quality
npm run lint              # Run ESLint
npm run lint:fix          # Fix ESLint errors
npm run format            # Format with Prettier
```

## Database Management

**View database in browser:**
```bash
npm run prisma:studio
```

**Create a new migration:**
```bash
npx prisma migrate dev --name your_migration_name
```

**Reset database (⚠️ destroys all data):**
```bash
npx prisma migrate reset
```

## API Documentation

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "username",
  "password": "Password123",
  "firstName": "John",     // optional
  "lastName": "Doe"        // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "username": "username",
      "createdAt": "2024-01-01T00:00:00.000Z",
      ...
    },
    "token": "eyJhbGc..."
  }
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Password123"
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer {token}
```

### Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE"
  }
}
```

**Validation Error:**
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "field": "email",
        "message": "Invalid email address"
      }
    ]
  }
}
```

## Architecture Patterns

### Layered Architecture

**Controllers** (HTTP Layer)
- Handle HTTP requests and responses
- Validate input with Zod
- Call services
- No business logic

**Services** (Business Logic Layer)
- Contain all business rules
- Orchestrate repositories
- Handle complex operations
- Return domain objects

**Repositories** (Data Access Layer)
- Direct database interaction
- CRUD operations
- Prisma queries
- Return database models

### Error Handling

Custom error classes for different scenarios:
- `BadRequestError` (400)
- `UnauthorizedError` (401)
- `ForbiddenError` (403)
- `NotFoundError` (404)
- `ConflictError` (409)
- `ValidationError` (422)
- `InternalServerError` (500)

## Comparison to Laravel/ASP.NET

If you're coming from Laravel or ASP.NET, here are the parallels:

| Laravel/ASP.NET | Node.js/Express |
|-----------------|-----------------|
| Routes | Routes |
| Controllers | Controllers |
| Services | Services |
| Models/Eloquent | Prisma Models |
| Middleware | Middleware |
| Form Requests | Zod Schemas |
| .env | .env |
| Artisan | npm scripts |
| php artisan migrate | npx prisma migrate |

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

## Deployment

### Environment Variables (Production)

Ensure these are set:
```env
NODE_ENV=production
DATABASE_URL=your_production_database_url
JWT_SECRET=your_very_secure_secret_key
CORS_ORIGIN=https://yourdomain.com
```

### Recommended Platforms

- **Railway** - Easy deployment, great for PostgreSQL
- **Render** - Simple setup, free tier available
- **DigitalOcean App Platform** - More control
- **AWS ECS/Fargate** - Enterprise scale

## Contributing

1. Create a feature branch
2. Make your changes
3. Write/update tests
4. Run linter and tests
5. Submit a pull request

## License

MIT

## Next Steps

1. [ ] Implement game CRUD endpoints
2. [ ] Add review system
3. [ ] Implement rating functionality
4. [ ] Create custom lists feature
5. [ ] Integrate IGDB API for game metadata
6. [ ] Add search and filtering
7. [ ] Implement pagination
8. [ ] Add caching with Redis
9. [ ] Set up automated testing
10. [ ] Deploy to production
