# DOM AST Tests

Comprehensive test suite for the DOM AST parser (`domAST.ts`).

## Test Coverage

### Core Functionality
- ✅ **Basic Parsing** - Parse simple HTML pages
- ✅ **Heading Hierarchy** - H1-H6 detection and level tracking
- ✅ **Node Types** - All node type identification (heading, paragraph, list, code, etc.)
- ✅ **Text Extraction** - Accurate text content extraction
- ✅ **Word Counting** - Correct word count calculation
- ✅ **Element Visibility** - Skip hidden elements (display:none, visibility:hidden)
- ✅ **Script/Style Filtering** - Ignore non-content elements
- ✅ **Nested Elements** - Handle deep nesting with depth tracking
- ✅ **Bounding Box** - Record visual size information

### Main Content Detection
- ✅ **Semantic Tags** - Detect `<main>`, `<article>`, `[role="main"]`
- ✅ **Content Density** - Heuristic-based detection
- ✅ **Navigation Detection** - Identify nav elements
- ✅ **Supplementary Content** - Detect sidebars and aside elements

### Page Metadata
- ✅ **Word Count** - Total page word count
- ✅ **Reading Time** - Estimated reading time (200 wpm)
- ✅ **Content Density** - Text/HTML ratio
- ✅ **Structure Score** - Document structure quality (0-1)

### Statistics
- ✅ **Node Counts** - Total, main content, by type
- ✅ **Average Depth** - DOM nesting depth
- ✅ **Serialization** - JSON serialization/deserialization

### Edge Cases
- ✅ **Empty Pages** - Handle pages with no content
- ✅ **Whitespace Only** - Pages with only whitespace
- ✅ **Deep Nesting** - 20+ levels of nesting
- ✅ **Special Characters** - HTML entities, Unicode, emojis
- ✅ **Malformed HTML** - Graceful handling of invalid HTML
- ✅ **Navigation-Only** - Pages with only nav elements
- ✅ **Large Pages** - 1000+ elements (performance test)
- ✅ **Tables** - Table detection and parsing
- ✅ **Code Blocks** - Pre/code element handling

### Real-world Scenarios
- ✅ **Blog Posts** - Article with header, nav, aside, footer
- ✅ **Documentation** - API docs with code examples
- ✅ **E-commerce** - Product pages with features, specs, pricing

## Running Tests

### Prerequisites

```bash
# Install dependencies (if not already installed)
npm install --save-dev vitest @vitest/ui playwright-crx
```

### Run All Tests

```bash
# Using npm scripts
npm test

# Or directly with vitest
npx vitest

# Watch mode
npx vitest --watch

# UI mode
npx vitest --ui
```

### Run Specific Test File

```bash
npx vitest src/tracking/__tests__/domAST.test.ts
```

### Run with Coverage

```bash
npx vitest --coverage
```

### Run Specific Test Suite

```bash
# Run only "parsePage" tests
npx vitest -t "parsePage"

# Run only "Main Content Detection" tests
npx vitest -t "Main Content Detection"
```

## Test Structure

```
src/tracking/__tests__/
├── domAST.test.ts          # Main test file (900+ lines)
└── README.md               # This file
```

## Test Patterns

### Basic Test Template

```typescript
it('should [behavior description]', async () => {
  // Arrange: Set up test page
  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <body>
        <h1>Test Content</h1>
      </body>
    </html>
  `);

  // Act: Parse the page
  const ast = await DOMParser.parsePage(page);

  // Assert: Verify results
  expect(ast).toBeDefined();
  expect(ast.title).toBe('Expected Title');
});
```

### Testing Node Presence

```typescript
const hasHeading = ast.mainContent.some(
  n => n.type === 'heading' && n.text.includes('Expected Text')
);
expect(hasHeading).toBe(true);
```

### Testing Deep Nesting

```typescript
const findDeepNode = (nodes: DOMNode[]): DOMNode | null => {
  for (const node of nodes) {
    if (node.text.includes('Target')) return node;
    const found = findDeepNode(node.children);
    if (found) return found;
  }
  return null;
};

const deepNode = findDeepNode(ast.mainContent);
expect(deepNode).toBeDefined();
```

## Performance Benchmarks

| Test Case | Expected Time | Status |
|-----------|--------------|--------|
| Simple page (10 elements) | < 100ms | ✅ Pass |
| Medium page (100 elements) | < 300ms | ✅ Pass |
| Large page (1000 elements) | < 2000ms | ✅ Pass |
| Deep nesting (20 levels) | < 200ms | ✅ Pass |

## Common Issues

### Issue: Timeout Errors

**Symptom**: Tests fail with timeout errors

**Solution**: Increase timeout in vitest.config.ts:
```typescript
test: {
  testTimeout: 30000,  // 30 seconds
  hookTimeout: 30000,
}
```

### Issue: Playwright Installation

**Symptom**: `playwright-crx` not found

**Solution**:
```bash
npm install playwright-crx
```

### Issue: Browser Launch Fails

**Symptom**: Cannot launch browser in test environment

**Solution**: Ensure headless mode is enabled:
```typescript
browser = await chromium.launch({ headless: true });
```

## Adding New Tests

### 1. Create Test Case

```typescript
it('should handle [new scenario]', async () => {
  await page.setContent(`...`);
  const ast = await DOMParser.parsePage(page);
  expect(ast).toBeDefined();
  // Add assertions
});
```

### 2. Follow Naming Convention

- Use descriptive test names starting with "should"
- Group related tests in `describe` blocks
- Use clear assertion messages

### 3. Test Both Success and Failure Cases

```typescript
// Success case
it('should parse valid HTML', async () => {
  // ...
});

// Edge case
it('should handle empty page', async () => {
  // ...
});

// Error case
it('should gracefully handle malformed HTML', async () => {
  // ...
});
```

## Coverage Goals

- **Line Coverage**: > 90%
- **Branch Coverage**: > 85%
- **Function Coverage**: > 95%

Current coverage:
```bash
npx vitest --coverage
```

## CI/CD Integration

Add to your CI pipeline:

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v2
        with:
          files: ./coverage/coverage-final.json
```

## Debugging Tests

### Enable Verbose Logging

```typescript
// Add to test file
import { logWithTimestamp } from '../../background/utils';

beforeEach(() => {
  // Enable debug logging
});
```

### Use Playwright Inspector

```typescript
browser = await chromium.launch({
  headless: false,  // Show browser
  slowMo: 100,      // Slow down operations
});
```

### Take Screenshots on Failure

```typescript
afterEach(async () => {
  if (testFailed) {
    await page.screenshot({
      path: `test-failure-${Date.now()}.png`
    });
  }
});
```

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Always close browser in `afterEach`
3. **Assertions**: Use specific assertions, avoid generic checks
4. **Readability**: Use clear variable names and comments
5. **Performance**: Keep tests fast (< 1s per test if possible)
6. **Coverage**: Aim for high coverage but focus on critical paths

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright API](https://playwright.dev/docs/api/class-playwright)
- [DOM Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

## Contributing

When adding new tests:

1. Follow existing patterns
2. Add tests for both success and edge cases
3. Update this README if adding new test categories
4. Ensure all tests pass before committing
5. Maintain or improve coverage percentage

## License

Same as parent project (Apache-2.0)
