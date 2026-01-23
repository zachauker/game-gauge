# Quick Start: Running Tests

## First Time Setup

```bash
# Install dependencies (if not already done)
npm install
```

## Run Tests

### Run all tests
```bash
npm test
```

### Run with coverage report
```bash
npm run test:coverage
```

### Watch mode (runs tests on file changes)
```bash
npm run test:watch
```

## View Results

After running tests with coverage:
```bash
# View coverage in terminal
npm run test:coverage

# Open HTML report in browser
open coverage/lcov-report/index.html
```

## Expected Output

You should see output like:
```
PASS  src/__tests__/services/auth.service.test.ts
PASS  src/__tests__/services/game.service.test.ts
PASS  src/__tests__/services/rating.service.test.ts
PASS  src/__tests__/services/list.service.test.ts
PASS  src/__tests__/utils/password.util.test.ts
PASS  src/__tests__/utils/slug.util.test.ts

Test Suites: 6 passed, 6 total
Tests:       52 passed, 52 total
Snapshots:   0 total
Time:        3.245 s
```

## Test Coverage Goals

✅ Services: 85%+ coverage
✅ Utilities: 95%+ coverage
✅ Overall: 80%+ coverage

See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for comprehensive testing documentation.
