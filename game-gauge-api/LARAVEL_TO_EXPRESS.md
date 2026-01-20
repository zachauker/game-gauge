# Laravel → Node.js/Express Migration Guide

Coming from Laravel? This guide will help you understand the Node.js/Express equivalents.

## Core Concepts Comparison

### Project Structure

**Laravel:**
```
app/
├── Http/
│   ├── Controllers/
│   ├── Middleware/
│   └── Requests/
├── Models/
├── Services/
└── Repositories/
```

**Express (Our Structure):**
```
src/
├── controllers/      # Same as Laravel Controllers
├── middleware/       # Same as Laravel Middleware
├── validators/       # Like Laravel Form Requests
├── services/        # Same as Laravel Services
└── repositories/    # Same as Laravel Repositories
```

### Routing

**Laravel:**
```php
Route::post('/auth/register', [AuthController::class, 'register']);
Route::get('/auth/me', [AuthController::class, 'me'])->middleware('auth');
```

**Express:**
```typescript
router.post('/auth/register', authController.register.bind(authController));
router.get('/auth/me', authenticate, authController.me.bind(authController));
```

### Controllers

**Laravel:**
```php
class AuthController extends Controller
{
    public function register(Request $request)
    {
        $validated = $request->validate([...]);
        $user = $this->authService->register($validated);
        return response()->json($user, 201);
    }
}
```

**Express:**
```typescript
class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const data = registerSchema.parse(req.body);
      const user = await authService.register(data);
      res.status(201).json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }
}
```

### Validation

**Laravel (Form Request):**
```php
class RegisterRequest extends FormRequest
{
    public function rules()
    {
        return [
            'email' => 'required|email|unique:users',
            'password' => 'required|min:8',
        ];
    }
}
```

**Express (Zod):**
```typescript
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// Usage
const data = registerSchema.parse(req.body);
```

### Models & Database

**Laravel (Eloquent):**
```php
class User extends Model
{
    public function reviews()
    {
        return $this->hasMany(Review::class);
    }
}

// Query
$user = User::where('email', $email)->first();
$users = User::with('reviews')->get();
```

**Express (Prisma):**
```typescript
// Schema defines relationships
// prisma/schema.prisma
model User {
  id      String   @id @default(uuid())
  email   String   @unique
  reviews Review[]
}

// Query
const user = await prisma.user.findUnique({ where: { email } });
const users = await prisma.user.findMany({ include: { reviews: true } });
```

### Middleware

**Laravel:**
```php
class AuthMiddleware
{
    public function handle($request, Closure $next)
    {
        if (!Auth::check()) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }
        return $next($request);
    }
}
```

**Express:**
```typescript
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.substring(7);
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    next(new UnauthorizedError('Invalid token'));
  }
};
```

### Dependency Injection

**Laravel:**
```php
class AuthController extends Controller
{
    public function __construct(
        private AuthService $authService
    ) {}
}

// Or method injection
public function register(Request $request, AuthService $authService)
{
    // ...
}
```

**Express (Manual):**
```typescript
class AuthController {
  constructor(private authService: AuthService) {}
}

// Or use singleton pattern
const authService = new AuthService();
const authController = new AuthController(authService);
```

### Error Handling

**Laravel:**
```php
throw new ValidationException('Invalid data');
// Automatically becomes 422 response

throw new AuthorizationException('Unauthorized');
// Automatically becomes 403 response
```

**Express:**
```typescript
throw new ValidationError('Invalid data');
// Caught by error middleware, becomes 422 response

throw new UnauthorizedError('Invalid token');
// Caught by error middleware, becomes 401 response
```

### Environment Variables

**Laravel (.env):**
```env
APP_ENV=local
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
```

**Express (.env):**
```env
NODE_ENV=development
DATABASE_URL=postgresql://...
```

**Laravel (config/database.php):**
```php
'default' => env('DB_CONNECTION', 'mysql'),
```

**Express (config/env.ts):**
```typescript
export const env = {
  DATABASE_URL: process.env.DATABASE_URL,
};
```

### Database Migrations

**Laravel:**
```bash
php artisan make:migration create_users_table
php artisan migrate
php artisan migrate:rollback
```

**Prisma:**
```bash
npx prisma migrate dev --name create_users_table
# No manual rollback - just reset database if needed
npx prisma migrate reset
```

### Database Seeding

**Laravel:**
```php
class UserSeeder extends Seeder
{
    public function run()
    {
        User::factory(10)->create();
    }
}

// Run: php artisan db:seed
```

**Prisma:**
```typescript
// prisma/seed.ts
async function main() {
  await prisma.user.create({
    data: { ... },
  });
}

// Run: npm run prisma:seed
```

### Authentication

**Laravel:**
```php
// Built-in with Sanctum/Passport
Auth::attempt(['email' => $email, 'password' => $password]);
Auth::user();
Auth::logout();
```

**Express (Manual JWT):**
```typescript
// You implement it yourself
const token = generateToken({ userId: user.id });
const payload = verifyToken(token);
// No built-in session management
```

### Testing

**Laravel:**
```php
public function test_user_can_register()
{
    $response = $this->postJson('/api/register', [
        'email' => 'test@example.com',
        'password' => 'password',
    ]);

    $response->assertStatus(201);
}
```

**Express (Jest + Supertest):**
```typescript
test('user can register', async () => {
  const response = await request(app)
    .post('/api/register')
    .send({
      email: 'test@example.com',
      password: 'password',
    });

  expect(response.status).toBe(201);
});
```

### Async/Await

Both Laravel and Node.js use similar patterns:

**Laravel:**
```php
public async function getUser(string $id)
{
    return await User::find($id);
}
```

**Express:**
```typescript
async getUser(id: string) {
  return await prisma.user.findUnique({ where: { id } });
}
```

## Key Differences

### 1. Type Safety

- **Laravel:** Runtime type checking with validation
- **TypeScript:** Compile-time type checking + runtime validation

### 2. Package Management

- **Laravel:** Composer (`composer install`)
- **Node.js:** npm/yarn (`npm install`)

### 3. ORM Syntax

- **Eloquent:** More magic, active record pattern
- **Prisma:** More explicit, data mapper pattern

### 4. Middleware Order

- **Laravel:** Global middleware in `Kernel.php`, route middleware defined separately
- **Express:** Middleware order matters, defined in app setup

### 5. Error Handling

- **Laravel:** Exceptions handled by `Handler.php`
- **Express:** Error middleware catches all errors

## Command Cheat Sheet

| Task | Laravel | Express |
|------|---------|---------|
| Start dev server | `php artisan serve` | `npm run dev` |
| Run migrations | `php artisan migrate` | `npm run prisma:migrate` |
| Create migration | `php artisan make:migration` | `npx prisma migrate dev --name` |
| View database | TablePlus/Sequel Pro | `npm run prisma:studio` |
| Run tests | `php artisan test` | `npm test` |
| Clear cache | `php artisan cache:clear` | No cache by default |
| Install package | `composer require pkg` | `npm install pkg` |

## Pro Tips for Laravel Developers

1. **Use `async/await` everywhere** - It's like Laravel's async but mandatory for DB operations

2. **Error handling is manual** - You need to wrap everything in try/catch

3. **No built-in auth** - You implement JWT yourself (good learning!)

4. **Middleware order matters** - Unlike Laravel where it's more declarative

5. **No automatic serialization** - You manually exclude fields (like password)

6. **TypeScript is your friend** - It catches errors that would be runtime in PHP

7. **Prisma Studio is amazing** - Better than Laravel's tinker for quick DB browsing

8. **No facades** - Everything is explicit imports (actually clearer!)

## Common Gotchas

1. **Forgetting `await`:**
   ```typescript
   // ❌ Wrong
   const user = prisma.user.findUnique(...);
   
   // ✅ Correct
   const user = await prisma.user.findUnique(...);
   ```

2. **Not binding controller methods:**
   ```typescript
   // ❌ Wrong - loses 'this' context
   router.get('/me', authController.getCurrentUser);
   
   // ✅ Correct
   router.get('/me', authController.getCurrentUser.bind(authController));
   ```

3. **Forgetting next() in middleware:**
   ```typescript
   // ❌ Wrong - request hangs
   export const middleware = (req, res, next) => {
     console.log('logging');
   };
   
   // ✅ Correct
   export const middleware = (req, res, next) => {
     console.log('logging');
     next();
   };
   ```

## You'll Love

- TypeScript's type safety
- Prisma's developer experience
- Simpler deployment (single binary)
- NPM's huge ecosystem
- Faster development cycles

## You'll Miss

- Artisan commands (but npm scripts are similar)
- Eloquent's magic (Prisma is more explicit)
- Built-in auth scaffolding
- Blade templating (but you're doing API-only anyway)

## Bottom Line

If you know Laravel, you already understand 80% of this stack. The patterns are the same, just different syntax!
