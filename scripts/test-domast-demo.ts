/**
 * DOM AST Test Demonstration
 *
 * This script demonstrates the testing approach for domAST.ts
 * Run with: npx ts-node scripts/test-domast-demo.ts
 */

import { chromium } from 'playwright-crx';
import { DOMParser } from '../src/tracking/domAST.ts';

async function runTests() {
  console.log('🚀 Starting DOM AST Test Demonstration\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  // Helper function to run a test
  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (error) {
      console.log(`❌ FAIL: ${name}`);
      console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  // Test 1: Parse simple HTML page
  await test('should parse a simple HTML page', async () => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>Test Page</title></head>
        <body>
          <h1>Welcome</h1>
          <p>This is a test paragraph.</p>
        </body>
      </html>
    `);

    const ast = await DOMParser.parsePage(page);

    if (!ast) throw new Error('AST is undefined');
    if (ast.title !== 'Test Page') throw new Error(`Expected title 'Test Page', got '${ast.title}'`);
    if (!Array.isArray(ast.mainContent)) throw new Error('mainContent is not an array');
  });

  // Test 2: Detect page title correctly
  await test('should detect page title correctly', async () => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>My Awesome Page</title></head>
        <body><p>Content</p></body>
      </html>
    `);

    const ast = await DOMParser.parsePage(page);
    if (ast.title !== 'My Awesome Page') {
      throw new Error(`Expected 'My Awesome Page', got '${ast.title}'`);
    }
  });

  // Test 3: Parse heading hierarchy
  await test('should parse heading hierarchy', async () => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Main Title</h1>
          <h2>Section 1</h2>
          <p>Content 1</p>
          <h2>Section 2</h2>
          <p>Content 2</p>
          <h3>Subsection 2.1</h3>
          <p>Content 2.1</p>
        </body>
      </html>
    `);

    const ast = await DOMParser.parsePage(page);

    // Find all heading nodes
    const headings = ast.mainContent.filter(n => n.type === 'heading');

    if (headings.length < 3) {
      throw new Error(`Expected at least 3 headings, found ${headings.length}`);
    }

    const h1 = headings.find(h => h.level === 1);
    if (!h1 || !h1.text.includes('Main Title')) {
      throw new Error('H1 heading not found or incorrect');
    }
  });

  // Test 4: Calculate word counts
  await test('should calculate word counts', async () => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <p>This paragraph has exactly seven words in it.</p>
        </body>
      </html>
    `);

    const ast = await DOMParser.parsePage(page);

    const paragraph = ast.mainContent.find(n => n.type === 'paragraph');
    if (!paragraph) throw new Error('Paragraph not found');
    if (paragraph.metadata.wordCount !== 7) {
      throw new Error(`Expected 7 words, got ${paragraph.metadata.wordCount}`);
    }
  });

  // Test 5: Skip invisible elements
  await test('should skip invisible elements', async () => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <p>Visible paragraph</p>
          <p style="display: none;">Hidden paragraph</p>
        </body>
      </html>
    `);

    const ast = await DOMParser.parsePage(page);

    const allText = ast.mainContent
      .map(n => n.text)
      .join(' ')
      .toLowerCase();

    if (!allText.includes('visible')) {
      throw new Error('Visible text not found');
    }
    if (allText.includes('hidden')) {
      throw new Error('Hidden text should not be included');
    }
  });

  // Test 6: Detect semantic main tag
  await test('should detect semantic main tag', async () => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <nav>Navigation</nav>
          <main>
            <h1>Main Content</h1>
            <p>This is the main content area.</p>
          </main>
          <footer>Footer</footer>
        </body>
      </html>
    `);

    const ast = await DOMParser.parsePage(page);

    if (!ast.metadata.mainContentArea.selector.includes('main')) {
      throw new Error('Main tag not detected');
    }
    if (ast.metadata.mainContentArea.confidence <= 0.5) {
      throw new Error(`Confidence too low: ${ast.metadata.mainContentArea.confidence}`);
    }
  });

  // Test 7: Calculate total word count
  await test('should calculate total word count', async () => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <p>This has five words here.</p>
          <p>And this has four words.</p>
        </body>
      </html>
    `);

    const ast = await DOMParser.parsePage(page);

    if (ast.metadata.totalWords !== 9) {
      throw new Error(`Expected 9 words, got ${ast.metadata.totalWords}`);
    }
  });

  // Test 8: Handle empty page
  await test('should handle empty page', async () => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body></body>
      </html>
    `);

    const ast = await DOMParser.parsePage(page);

    if (!ast) throw new Error('AST is undefined');
    if (!Array.isArray(ast.mainContent)) throw new Error('mainContent is not an array');
    if (ast.metadata.totalWords !== 0) {
      throw new Error(`Expected 0 words, got ${ast.metadata.totalWords}`);
    }
  });

  // Test 9: Handle special characters
  await test('should handle special characters', async () => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <p>Special chars: &lt;&gt;&amp;&quot;&#39;</p>
          <p>Unicode: 你好世界 🌍</p>
        </body>
      </html>
    `);

    const ast = await DOMParser.parsePage(page);

    const allText = ast.mainContent.map(n => n.text).join(' ');

    if (!allText.includes('Special chars')) {
      throw new Error('Special chars text not found');
    }
    if (!allText.includes('你好世界')) {
      throw new Error('Unicode text not found');
    }
  });

  // Test 10: Get statistics
  await test('should return correct node statistics', async () => {
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <body>
          <h1>Title</h1>
          <h2>Subtitle</h2>
          <p>Paragraph 1</p>
          <p>Paragraph 2</p>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
        </body>
      </html>
    `);

    const ast = await DOMParser.parsePage(page);
    const stats = DOMParser.getStats(ast);

    if (stats.totalNodes <= 0) throw new Error('No nodes found');
    if (stats.headingCount !== 2) throw new Error(`Expected 2 headings, got ${stats.headingCount}`);
    if (stats.paragraphCount !== 2) throw new Error(`Expected 2 paragraphs, got ${stats.paragraphCount}`);
  });

  await page.close();
  await context.close();
  await browser.close();

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Results:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Total: ${passed + failed}`);
  console.log(`   🎯 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('='.repeat(50));

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
