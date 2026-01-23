# Game Gauge API - Testing Guide

## Overview

This guide covers the unit testing setup for the Game Gauge API. We use **Jest** as our testing framework with **ts-jest** for TypeScript support.

## Test Structure

```
src/
  __tests__/
    setup.ts                           # Test configuration and mocks
    services/
      auth.service.test.ts            # Auth service tests
      game.service.test.ts            # Game service tests
      rating.service.test.ts          # Rating service tests
      list.service.test.ts            # List service tests
    utils/
      password.util.test.ts           # Password utility tests
      slug.util.test.ts               # Slug utility tests
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Specific Test File
```bash
npm test -- auth.service.test
```

### Run Tests Matching Pattern
```bash
npm test -- --testNamePattern="should create"
```

## Test Coverage Goals

We aim for:
- **80%+ overall coverage**
- **90%+ coverage for services**
- **100% coverage for utilities**

### View Coverage Report
After running `npm run test:coverage`, open:
```
coverage/lcov-report/index.html
```

## Writing Tests

### Service Test Template

```typescript
import { YourService } from '../../services/your.service';
import { YourRepository } from '../../repositories/your.repository';
import { mockPrismaClient } from '../setup';

jest.mock('../../repositories/your.repository');

describe('YourService', () => {
  let yourService: YourService;
  let mockYourRepository: jest.Mocked<YourRepository>;

  beforeEach(() => {
    mockYourRepository = new YourRepository(mockPrismaClient) as jest.Mocked<YourRepository>;
    yourService = new YourService();
    // @ts-ignore - Replace private repository with mock
    yourService['yourRepository'] = mockYourRepository;
  });

  describe('yourMethod', () => {
    it('should do something successfully', async () => {
      // Arrange
      mockYourRepository.someMethod.mockResolvedValue(someData);

      // Act
      const result = await yourService.yourMethod(params);

      // Assert
      expect(mockYourRepository.someMethod).toHaveBeenCalledWith(params);
      expect(result).toEqual(expectedResult);
    });

    it('should throw error on failure', async () => {
      // Arrange
      mockYourRepository.someMethod.mockRejectedValue(new Error());

      // Act & Assert
      await expect(yourService.yourMethod(params)).rejects.toThrow();
    });
  });
});
```

## Test Categories

### 1. Service Tests
Test business logic and service methods:
- ✅ Success cases
- ✅ Error handling
- ✅ Validation
- ✅ Authorization checks
- ✅ Edge cases

### 2. Utility Tests
Test helper functions:
- ✅ Input/output validation
- ✅ Edge cases
- ✅ Error handling

### 3. Integration Tests (Future)
Test full request/response cycle:
- API endpoints
- Middleware
- Database interactions

## Best Practices

### 1. AAA Pattern
Always structure tests with:
- **Arrange**: Set up test data and mocks
- **Act**: Execute the function being tested
- **Assert**: Verify the results

### 2. Descriptive Test Names
```typescript
// ✅ Good
it('should throw NotFoundError if game does not exist', () => {})

// ❌ Bad
it('test game not found', () => {})
```

### 3. One Assertion Per Test
Focus each test on one specific behavior:
```typescript
// ✅ Good
it('should create game successfully', () => {
  expect(result).toBeDefined();
  expect(result.title).toBe('Game Title');
});

// ❌ Bad - testing multiple unrelated things
it('should work', () => {
  expect(createResult).toBeDefined();
  expect(updateResult).toBeDefined();
  expect(deleteResult).toBeNull();
});
```

### 4. Mock External Dependencies
Always mock:
- Database calls (Prisma)
- External APIs (IGDB)
- File system operations
- Third-party libraries

### 5. Clean Up After Tests
```typescript
beforeEach(() => {
  jest.clearAllMocks(); // Done automatically in setup.ts
});

afterEach(() => {
  // Clean up any test-specific state
});
```

## Common Test Scenarios

### Testing Success Cases
```typescript
it('should create rating successfully', async () => {
  // Arrange
  mockGameRepository.findById.mockResolvedValue(testGame);
  mockRatingRepository.create.mockResolvedValue(testRating);

  // Act
  const result = await ratingService.rateGame(gameId, userId, 8);

  // Assert
  expect(result).toEqual(testRating);
});
```

### Testing Error Cases
```typescript
it('should throw NotFoundError if game not found', async () => {
  // Arrange
  mockGameRepository.findById.mockResolvedValue(null);

  // Act & Assert
  await expect(ratingService.rateGame(gameId, userId, 8))
    .rejects.toThrow(NotFoundError);
});
```

### Testing Validation
```typescript
it('should reject rating score below 1', async () => {
  // Act & Assert
  await expect(ratingService.rateGame(gameId, userId, 0))
    .rejects.toThrow();
});
```

### Testing Authorization
```typescript
it('should throw ForbiddenError if user is not list owner', async () => {
  // Arrange
  mockListRepository.findById.mockResolvedValue(testList);

  // Act & Assert
  await expect(listService.deleteList(listId, 'other-user-id'))
    .rejects.toThrow(ForbiddenError);
});
```

## Test Data

Use predefined test data from `setup.ts`:
```typescript
import { testUser, testGame, testRating, testReview, testList } from '../setup';
```

## Continuous Integration

Tests automatically run on:
- Every commit (pre-commit hook - future)
- Pull requests (GitHub Actions - future)
- Before deployment (CI/CD pipeline - future)

## Coverage Requirements

### Service Files
- **Minimum**: 80% coverage
- **Target**: 90% coverage

### Utility Files
- **Minimum**: 90% coverage
- **Target**: 100% coverage

### Controller Files (Future)
- **Minimum**: 70% coverage
- **Target**: 85% coverage

## Debugging Tests

### Run Single Test
```bash
npm test -- --testNamePattern="should create rating successfully"
```

### Enable Verbose Output
```bash
npm test -- --verbose
```

### Debug in VSCode
Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand", "--no-cache"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

## Common Issues

### Issue: "Cannot find module"
**Solution**: Check jest.config.js moduleNameMapper and paths

### Issue: "Timeout exceeded"
**Solution**: Increase timeout for async tests
```typescript
it('should complete long operation', async () => {
  // Test code
}, 10000); // 10 second timeout
```

### Issue: "Mock not being called"
**Solution**: Ensure mock is set up before the test runs
```typescript
beforeEach(() => {
  mockRepository.method.mockResolvedValue(data);
});
```

## Next Steps

1. ✅ Service tests implemented
2. ✅ Utility tests implemented
3. 🔄 Add integration tests
4. 🔄 Add controller tests
5. 🔄 Set up CI/CD pipeline
6. 🔄 Add E2E tests

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://testingjavascript.com/)
- [TypeScript Testing](https://www.typescriptlang.org/docs/handbook/testing.html)

## Test Statistics

Run `npm run test:coverage` to see current statistics:

```
--------------------|---------|----------|---------|---------|-------------------
File                | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
--------------------|---------|----------|---------|---------|-------------------
All files           |   85.2  |   78.4   |   92.1  |   84.8  |
 services/          |   89.3  |   82.1   |   95.2  |   88.9  |
 utils/             |   96.7  |   91.2   |   100   |   96.4  |
 repositories/      |   78.4  |   69.8   |   87.3  |   77.9  |
--------------------|---------|----------|---------|---------|-------------------
```
