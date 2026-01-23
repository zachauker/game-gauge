# Fixing TypeScript Errors in Tests

## The Issue

The tests were written assuming repositories take a Prisma client as a constructor parameter, but they actually use the imported `prisma` instance directly.

## Solution

Mock the `prisma` instance from `../config/database` instead of trying to inject it.

## Step-by-Step Fix

### 1. The setup file is already correct

`src/__tests__/setup.ts` now mocks the database module properly.

### 2. Fix each test file

For each test file, replace the repository mocking pattern:

**BEFORE (Incorrect):**
```typescript
import { mockPrismaClient } from '../setup';

beforeEach(() => {
  mockUserRepository = new UserRepository(mockPrismaClient) as jest.Mocked<UserRepository>;
  authService = new AuthService();
  authService['userRepository'] = mockUserRepository;
});
```

**AFTER (Correct):**
```typescript
import { prisma } from '../../config/database';

beforeEach(() => {
  authService = new AuthService();
  // Mock prisma directly - no need to inject repository
});

it('should do something', async () => {
  // Mock prisma methods directly
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(testUser);
  
  // ... rest of test
});
```

### 3. Example: Fixed AuthService Test

```typescript
import { AuthService } from '../../services/auth.service';
import { hashPassword, comparePasswords } from '../../utils/password.util';
import { generateToken } from '../../utils/jwt.util';
import { testUser } from '../setup';
import { prisma } from '../../config/database';

jest.mock('../../utils/password.util');
jest.mock('../../utils/jwt.util');

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  it('should register successfully', async () => {
    // Mock prisma directly
    (prisma.user.findUnique as jest.Mock)
      .mockResolvedValueOnce(null) // email check
      .mockResolvedValueOnce(null); // username check
    (hashPassword as jest.Mock).mockResolvedValue('hashed');
    (prisma.user.create as jest.Mock).mockResolvedValue(testUser);
    (generateToken as jest.Mock).mockReturnValue('token');

    const result = await authService.register({
      email: 'test@example.com',
      username: 'test',
      password: 'Password123',
    });

    expect(result).toHaveProperty('token');
  });
});
```

### 4. Pattern for Each Service

**RatingService:**
```typescript
(prisma.game.findUnique as jest.Mock).mockResolvedValue(testGame);
(prisma.rating.findFirst as jest.Mock).mockResolvedValue(null);
(prisma.rating.create as jest.Mock).mockResolvedValue(testRating);
```

**GameService:**
```typescript
(prisma.game.findUnique as jest.Mock).mockResolvedValue(null); // for slug check
(prisma.game.create as jest.Mock).mockResolvedValue(testGame);
```

**ListService:**
```typescript
(prisma.gameList.findUnique as jest.Mock).mockResolvedValue(testList);
(prisma.game.findUnique as jest.Mock).mockResolvedValue(testGame);
(prisma.gameListItem.create as jest.Mock).mockResolvedValue({...});
```

### 5. Quick Find & Replace

In each test file:

**Find:**
```typescript
mockUserRepository = new UserRepository(mockPrismaClient) as jest.Mocked<UserRepository>;
```

**Replace with:**
```typescript
// Remove this line - we mock prisma directly
```

**Then update test assertions to mock prisma:**
```typescript
// Before
mockUserRepository.findByEmail.mockResolvedValue(testUser);

// After  
(prisma.user.findUnique as jest.Mock).mockResolvedValue(testUser);
```

### 6. Complete Example Files to Copy

I've created a fixed version of auth.service.test.ts here:
`src/__tests__/services/auth.service.test.fixed.ts`

You can:
1. Review the fixed file
2. Apply the same pattern to other test files
3. Or just copy the fixed file over the original

### 7. Running Tests After Fixes

```bash
# Install if needed (already in package.json)
npm install

# Run tests
npm test

# With coverage
npm run test:coverage
```

### 8. Expected Working Pattern

```typescript
describe('SomeService', () => {
  let service: SomeService;

  beforeEach(() => {
    service = new SomeService();
    // That's it! No repository injection needed
  });

  it('should work', async () => {
    // Mock prisma calls
    (prisma.model.method as jest.Mock).mockResolvedValue(data);
    
    // Call service
    const result = await service.someMethod();
    
    // Assert
    expect(result).toBeDefined();
    expect(prisma.model.method).toHaveBeenCalled();
  });
});
```

## Why This Works

1. The `setup.ts` file mocks `../config/database` module
2. When repositories import `prisma`, they get the mocked version
3. We can mock individual prisma methods in each test
4. No need to inject or replace repository instances

## Common TypeScript Errors & Fixes

### Error: "Expected 0 arguments but got 1"
**Cause:** Trying to pass prisma client to repository constructor
**Fix:** Remove the argument: `new UserRepository()` (not needed anyway)

### Error: "Cannot find name 'mockPrismaClient'"
**Cause:** Importing removed mock object
**Fix:** Remove import, use `prisma` from setup instead

### Error: "Property 'mockResolvedValue' does not exist"
**Cause:** TypeScript doesn't know it's a mock
**Fix:** Cast to jest.Mock: `(prisma.user.create as jest.Mock)`

## Testing the Fix

After updating the files, run:

```bash
npm test -- --no-coverage --verbose
```

You should see:
```
PASS  src/__tests__/services/auth.service.test.ts
✓ should successfully register a new user
✓ should throw ConflictError if email already exists
...
```

If you see TypeScript errors, the pattern wasn't applied correctly to that file.
