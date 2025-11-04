# Testing Quick Start Guide

Quick guide to run tests for the DOM AST parser.

## 🚀 Quick Start (3 steps)

### Step 1: Install Dependencies

```bash
npm install --save-dev vitest @vitest/ui @vitest/coverage-v8
```

### Step 2: Update package.json

Add/update test scripts:

```json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:dom": "vitest src/tracking/__tests__/domAST.test.ts"
  }
}
```

### Step 3: Run Tests

```bash
# Run all tests
npm test

# Or run DOM AST tests specifically
npm run test:dom
```

## 📺 Visual Test Runner

```bash
# Open visual test UI in browser
npm run test:ui
```

This opens a browser interface where you can:
- See all tests visually
- Run individual tests
- See test results in real-time
- Debug failing tests
- View coverage

## 📊 Coverage Report

```bash
# Generate coverage report
npm run test:coverage
```

Opens an HTML report showing:
- Line coverage
- Branch coverage
- Function coverage
- Uncovered lines

## 🔍 Common Commands

```bash
# Watch mode (auto-rerun on file changes)
npm run test:watch

# Run specific test file
npx vitest src/tracking/__tests__/domAST.test.ts

# Run specific test by name
npx vitest -t "should parse a simple HTML page"

# Run specific test suite
npx vitest -t "parsePage"

# Run with verbose output
npx vitest --reporter=verbose

# Run in CI mode (single run, no watch)
npx vitest run
```

## 📝 Test Structure

```
src/tracking/__tests__/
├── domAST.test.ts          # 65+ test cases
└── README.md               # Detailed documentation

docs/
└── DOMAST_TEST_SUMMARY.md  # Test summary & guide

vitest.config.ts             # Test configuration
```

## ✅ Verify Installation

Run this command to verify everything is set up:

```bash
npx vitest --version
```

Should output: `vitest/x.x.x`

## 🎯 Example Test Run

```bash
$ npm test

 ✓ src/tracking/__tests__/domAST.test.ts (65 tests)
   ✓ DOMParser
     ✓ parsePage (12 tests)
       ✓ should parse a simple HTML page
       ✓ should detect page title correctly
       ✓ should parse heading hierarchy
       ...
     ✓ Main Content Detection (5 tests)
       ✓ should detect semantic main tag
       ✓ should detect article tag
       ...
     ✓ Edge Cases (13 tests)
       ✓ should handle empty page
       ✓ should handle special characters
       ...

 Test Files  1 passed (1)
      Tests  65 passed (65)
   Duration  2.45s
```

## 🐛 Troubleshooting

### Issue: "Cannot find module 'vitest'"

**Solution**:
```bash
npm install --save-dev vitest
```

### Issue: Tests timeout

**Solution**: Already configured in `vitest.config.ts` with 30s timeout.

If still timing out, increase in the config:
```typescript
test: {
  testTimeout: 60000,  // 60 seconds
}
```

### Issue: Playwright not installed

**Solution**:
```bash
npm install playwright-crx
```

### Issue: Tests fail in CI

**Solution**: Ensure headless mode is enabled (already configured):
```typescript
browser = await chromium.launch({ headless: true });
```

## 📚 More Information

- **Detailed Test Documentation**: `src/tracking/__tests__/README.md`
- **Test Summary**: `docs/DOMAST_TEST_SUMMARY.md`
- **Test File**: `src/tracking/__tests__/domAST.test.ts`

## 💡 Tips

1. **Use Watch Mode** during development:
   ```bash
   npm run test:watch
   ```

2. **Use UI Mode** for visual debugging:
   ```bash
   npm run test:ui
   ```

3. **Focus on Failed Tests**:
   ```bash
   npx vitest --reporter=verbose | grep FAIL
   ```

4. **Run Tests Before Commit**:
   ```bash
   npm test && git commit
   ```

## 🎉 That's It!

You're ready to run tests. Start with:

```bash
npm test
```

Happy testing! 🚀
