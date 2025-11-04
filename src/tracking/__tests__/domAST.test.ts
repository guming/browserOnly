import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chromium, Browser, BrowserContext, Page } from 'playwright-crx';
import { DOMParser, PageAST, DOMNode, NodeType } from '../domAST';

describe('DOMParser', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeEach(async () => {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    await page.close();
    await context.close();
    await browser.close();
  });

  describe('parsePage', () => {
    it('should parse a simple HTML page', async () => {
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

      expect(ast).toBeDefined();
      expect(ast.url).toContain('about:blank');
      expect(ast.title).toBe('Test Page');
      expect(ast.mainContent).toBeDefined();
      expect(Array.isArray(ast.mainContent)).toBe(true);
    });

    it('should detect page title correctly', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <head><title>My Awesome Page</title></head>
          <body><p>Content</p></body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);
      expect(ast.title).toBe('My Awesome Page');
    });

    it('should parse heading hierarchy', async () => {
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

      expect(headings.length).toBeGreaterThanOrEqual(3);

      // Check heading levels
      const h1 = headings.find(h => h.level === 1);
      const h2s = headings.filter(h => h.level === 2);
      const h3 = headings.find(h => h.level === 3);

      expect(h1).toBeDefined();
      expect(h1?.text).toContain('Main Title');
      expect(h2s.length).toBeGreaterThanOrEqual(2);
      expect(h3).toBeDefined();
    });

    it('should identify different node types', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <h1>Heading</h1>
            <p>Paragraph</p>
            <ul>
              <li>List item 1</li>
              <li>List item 2</li>
            </ul>
            <blockquote>Quote</blockquote>
            <code>Code snippet</code>
            <a href="#">Link</a>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      const collectTypes = (nodes: DOMNode[]): Set<NodeType> => {
        const types = new Set<NodeType>();
        nodes.forEach(node => {
          types.add(node.type);
          collectTypes(node.children).forEach(t => types.add(t));
        });
        return types;
      };

      const types = collectTypes(ast.mainContent);

      expect(types.has('heading')).toBe(true);
      expect(types.has('paragraph')).toBe(true);
      expect(types.has('list')).toBe(true);
      expect(types.has('list-item')).toBe(true);
    });

    it('should extract text content correctly', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <h1>Test Heading</h1>
            <p>This is a test paragraph with some content.</p>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      const hasHeading = ast.mainContent.some(
        n => n.type === 'heading' && n.text.includes('Test Heading')
      );
      const hasParagraph = ast.mainContent.some(
        n => n.type === 'paragraph' && n.text.includes('test paragraph')
      );

      expect(hasHeading).toBe(true);
      expect(hasParagraph).toBe(true);
    });

    it('should calculate word counts', async () => {
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
      expect(paragraph).toBeDefined();
      expect(paragraph?.metadata.wordCount).toBe(7);
    });

    it('should skip invisible elements', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <p>Visible paragraph</p>
            <p style="display: none;">Hidden paragraph</p>
            <div style="visibility: hidden;">
              <p>Also hidden</p>
            </div>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      const allText = ast.mainContent
        .map(n => n.text)
        .join(' ')
        .toLowerCase();

      expect(allText).toContain('visible');
      expect(allText).not.toContain('hidden');
    });

    it('should skip script and style tags', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <head>
            <style>body { color: red; }</style>
          </head>
          <body>
            <p>Visible content</p>
            <script>console.log('test');</script>
            <noscript>No script message</noscript>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      const allText = ast.mainContent
        .map(n => n.text)
        .join(' ')
        .toLowerCase();

      expect(allText).toContain('visible');
      expect(allText).not.toContain('console.log');
      expect(allText).not.toContain('color: red');
    });

    it('should handle nested elements', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <div>
              <div>
                <div>
                  <p>Deeply nested paragraph</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      const findDeepNode = (nodes: DOMNode[]): DOMNode | null => {
        for (const node of nodes) {
          if (node.text.includes('Deeply nested')) {
            return node;
          }
          const found = findDeepNode(node.children);
          if (found) return found;
        }
        return null;
      };

      const deepNode = findDeepNode(ast.mainContent);
      expect(deepNode).toBeDefined();
      expect(deepNode?.metadata.depth).toBeGreaterThan(0);
    });

    it('should record bounding box information', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <div style="width: 200px; height: 100px;">
              <p>Test content</p>
            </div>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      const node = ast.mainContent.find(n => n.text.includes('Test content'));
      expect(node?.metadata.rect).toBeDefined();
      expect(node?.metadata.rect?.width).toBeGreaterThan(0);
      expect(node?.metadata.rect?.height).toBeGreaterThan(0);
      expect(node?.metadata.rect?.area).toBeGreaterThan(0);
    });
  });

  describe('Main Content Detection', () => {
    it('should detect semantic main tag', async () => {
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

      expect(ast.metadata.mainContentArea.selector).toContain('main');
      expect(ast.metadata.mainContentArea.confidence).toBeGreaterThan(0.5);

      // Main content should be marked correctly
      const mainNodes = ast.mainContent.filter(n => n.metadata.isMainContent);
      expect(mainNodes.length).toBeGreaterThan(0);
    });

    it('should detect article tag', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <header>Header</header>
            <article>
              <h1>Article Title</h1>
              <p>Article content goes here.</p>
            </article>
            <aside>Sidebar</aside>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      expect(ast.metadata.mainContentArea.selector).toContain('article');
    });

    it('should fall back to content density heuristic', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <div id="header">
              <a href="#">Link 1</a>
              <a href="#">Link 2</a>
            </div>
            <div id="content">
              <h1>Rich Content Area</h1>
              <p>This div has a lot of text content and multiple paragraphs.</p>
              <p>It should be detected as the main content area.</p>
              <p>The content density algorithm should identify this.</p>
            </div>
            <div id="sidebar">
              <a href="#">Ad 1</a>
              <a href="#">Ad 2</a>
            </div>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      // The content div should have highest density
      expect(ast.metadata.mainContentArea.confidence).toBeGreaterThan(0);
    });

    it('should identify navigation elements', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <nav>
              <a href="#">Home</a>
              <a href="#">About</a>
            </nav>
            <main>
              <p>Main content</p>
            </main>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      expect(ast.navigation).toBeDefined();
      expect(ast.navigation.length).toBeGreaterThan(0);
    });

    it('should identify supplementary content', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <main>
              <p>Main content</p>
            </main>
            <aside>
              <p>Sidebar content</p>
            </aside>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      expect(ast.supplementary).toBeDefined();
      // Aside content should be in supplementary
      expect(ast.supplementary.length).toBeGreaterThan(0);
    });
  });

  describe('Page Metadata', () => {
    it('should calculate total word count', async () => {
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

      expect(ast.metadata.totalWords).toBe(9);
    });

    it('should estimate reading time', async () => {
      // Create content with ~400 words (should be ~2 minutes at 200 wpm)
      const words = Array(400).fill('word').join(' ');
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body><p>${words}</p></body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      expect(ast.metadata.estimatedReadingTime).toBe(2);
    });

    it('should calculate content density', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <p>Text content</p>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      expect(ast.metadata.contentDensity).toBeGreaterThan(0);
      expect(ast.metadata.contentDensity).toBeLessThanOrEqual(1);
    });

    it('should score document structure', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <h1>Main Title</h1>
            <h2>Section 1</h2>
            <p>Content 1</p>
            <p>Content 2</p>
            <h2>Section 2</h2>
            <p>Content 3</p>
            <p>Content 4</p>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      // Good structure: single H1, multiple H2s, good text/heading ratio
      expect(ast.metadata.structureScore).toBeGreaterThan(0.5);
    });

    it('should penalize poor structure', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <h1>Title 1</h1>
            <h1>Title 2</h1>
            <h1>Title 3</h1>
            <p>One paragraph</p>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      // Poor structure: multiple H1s, few paragraphs
      expect(ast.metadata.structureScore).toBeLessThan(0.5);
    });
  });

  describe('getStats', () => {
    it('should return correct node statistics', async () => {
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

      expect(stats.totalNodes).toBeGreaterThan(0);
      expect(stats.headingCount).toBe(2);
      expect(stats.paragraphCount).toBe(2);
      expect(stats.listCount).toBeGreaterThanOrEqual(1);
      expect(stats.avgDepth).toBeGreaterThanOrEqual(0);
    });

    it('should count main content nodes', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <main>
              <h1>Main</h1>
              <p>Content</p>
            </main>
            <aside>
              <p>Sidebar</p>
            </aside>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);
      const stats = DOMParser.getStats(ast);

      expect(stats.mainContentNodes).toBeGreaterThan(0);
      expect(stats.mainContentNodes).toBeLessThanOrEqual(stats.totalNodes);
    });
  });

  describe('serialize', () => {
    it('should serialize AST to JSON', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <h1>Test</h1>
            <p>Content</p>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);
      const json = DOMParser.serialize(ast);

      expect(json).toBeDefined();
      expect(typeof json).toBe('string');

      // Should be valid JSON
      const parsed = JSON.parse(json);
      expect(parsed.title).toBe('Test');
      expect(parsed.mainContent).toBeDefined();
    });

    it('should preserve all AST properties in serialization', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <head><title>Serialize Test</title></head>
          <body>
            <h1>Heading</h1>
            <p>Paragraph</p>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);
      const json = DOMParser.serialize(ast);
      const parsed = JSON.parse(json) as PageAST;

      expect(parsed.url).toBeDefined();
      expect(parsed.title).toBe('Serialize Test');
      expect(parsed.mainContent).toBeDefined();
      expect(parsed.supplementary).toBeDefined();
      expect(parsed.navigation).toBeDefined();
      expect(parsed.metadata).toBeDefined();
      expect(parsed.metadata.totalWords).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty page', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body></body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      expect(ast).toBeDefined();
      expect(ast.mainContent).toBeDefined();
      expect(ast.metadata.totalWords).toBe(0);
    });

    it('should handle page with only whitespace', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <p>   </p>
            <div>     </div>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      expect(ast.metadata.totalWords).toBe(0);
    });

    it('should handle very deep nesting', async () => {
      let html = '<body>';
      for (let i = 0; i < 20; i++) {
        html += '<div>';
      }
      html += '<p>Deep content</p>';
      for (let i = 0; i < 20; i++) {
        html += '</div>';
      }
      html += '</body>';

      await page.setContent(`
        <!DOCTYPE html>
        <html>${html}</html>
      `);

      const ast = await DOMParser.parsePage(page);

      const findDeepest = (nodes: DOMNode[], maxDepth = 0): number => {
        let max = maxDepth;
        nodes.forEach(node => {
          max = Math.max(max, node.metadata.depth);
          if (node.children.length > 0) {
            max = Math.max(max, findDeepest(node.children, max));
          }
        });
        return max;
      };

      const maxDepth = findDeepest(ast.mainContent);
      expect(maxDepth).toBeGreaterThan(10);
    });

    it('should handle special characters', async () => {
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

      const allText = ast.mainContent
        .map(n => n.text)
        .join(' ');

      expect(allText).toContain('Special chars');
      expect(allText).toContain('Unicode');
      expect(allText).toContain('你好世界');
    });

    it('should handle malformed HTML gracefully', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <p>Unclosed paragraph
            <div>Overlapping tags</p></div>
            <p>Normal paragraph</p>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      // Should not throw, should still extract content
      expect(ast).toBeDefined();
      expect(ast.mainContent.length).toBeGreaterThan(0);
    });

    it('should handle pages with only navigation', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <nav>
              <a href="#">Link 1</a>
              <a href="#">Link 2</a>
              <a href="#">Link 3</a>
            </nav>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      expect(ast).toBeDefined();
      expect(ast.navigation.length).toBeGreaterThan(0);
    });

    it('should handle large pages efficiently', async () => {
      // Generate a large page with 1000 paragraphs
      const paragraphs = Array(1000)
        .fill(0)
        .map((_, i) => `<p>Paragraph ${i}: Some content here.</p>`)
        .join('');

      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>${paragraphs}</body>
        </html>
      `);

      const startTime = Date.now();
      const ast = await DOMParser.parsePage(page);
      const elapsed = Date.now() - startTime;

      expect(ast).toBeDefined();
      expect(ast.metadata.totalWords).toBeGreaterThan(5000);
      // Should complete in reasonable time (< 2 seconds)
      expect(elapsed).toBeLessThan(2000);
    });

    it('should handle tables', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <table>
              <tr>
                <th>Header 1</th>
                <th>Header 2</th>
              </tr>
              <tr>
                <td>Data 1</td>
                <td>Data 2</td>
              </tr>
            </table>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      const hasTable = ast.mainContent.some(n => n.type === 'table');
      expect(hasTable).toBe(true);
    });

    it('should handle code blocks', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <body>
            <pre><code>function test() {
  return true;
}</code></pre>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      const hasCode = ast.mainContent.some(n => n.type === 'code' || n.tag === 'pre');
      expect(hasCode).toBe(true);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle blog post structure', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <head><title>Blog Post Title</title></head>
          <body>
            <header>
              <nav>
                <a href="/">Home</a>
                <a href="/about">About</a>
              </nav>
            </header>
            <article>
              <h1>Blog Post Title</h1>
              <p class="meta">By Author Name | January 1, 2024</p>
              <p>Introduction paragraph...</p>
              <h2>Section 1</h2>
              <p>Section 1 content...</p>
              <h2>Section 2</h2>
              <p>Section 2 content...</p>
              <h2>Conclusion</h2>
              <p>Conclusion paragraph...</p>
            </article>
            <aside>
              <h3>Related Posts</h3>
              <ul>
                <li><a href="#">Post 1</a></li>
                <li><a href="#">Post 2</a></li>
              </ul>
            </aside>
            <footer>
              <p>Copyright 2024</p>
            </footer>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      expect(ast.title).toBe('Blog Post Title');
      expect(ast.mainContent.length).toBeGreaterThan(0);
      expect(ast.navigation.length).toBeGreaterThan(0);
      expect(ast.supplementary.length).toBeGreaterThan(0);

      const stats = DOMParser.getStats(ast);
      expect(stats.headingCount).toBeGreaterThanOrEqual(4);
    });

    it('should handle documentation page', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <head><title>API Documentation</title></head>
          <body>
            <nav class="sidebar">
              <ul>
                <li><a href="#getting-started">Getting Started</a></li>
                <li><a href="#api-reference">API Reference</a></li>
              </ul>
            </nav>
            <main>
              <h1>API Documentation</h1>
              <h2 id="getting-started">Getting Started</h2>
              <p>Installation instructions...</p>
              <pre><code>npm install package</code></pre>
              <h2 id="api-reference">API Reference</h2>
              <h3>Method 1</h3>
              <p>Description of method 1...</p>
              <h3>Method 2</h3>
              <p>Description of method 2...</p>
            </main>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      expect(ast.title).toBe('API Documentation');

      const stats = DOMParser.getStats(ast);
      expect(stats.headingCount).toBeGreaterThanOrEqual(5);

      // Should have code blocks
      const hasCode = ast.mainContent.some(n =>
        n.type === 'code' || n.tag === 'pre'
      );
      expect(hasCode).toBe(true);
    });

    it('should handle e-commerce product page', async () => {
      await page.setContent(`
        <!DOCTYPE html>
        <html>
          <head><title>Product Name - Store</title></head>
          <body>
            <header>
              <nav>
                <a href="/">Home</a>
                <a href="/products">Products</a>
              </nav>
            </header>
            <main>
              <h1>Product Name</h1>
              <p class="price">$99.99</p>
              <h2>Description</h2>
              <p>Product description goes here...</p>
              <h2>Features</h2>
              <ul>
                <li>Feature 1</li>
                <li>Feature 2</li>
                <li>Feature 3</li>
              </ul>
              <h2>Specifications</h2>
              <table>
                <tr><td>Size</td><td>Large</td></tr>
                <tr><td>Weight</td><td>5kg</td></tr>
              </table>
            </main>
            <aside>
              <h3>Related Products</h3>
            </aside>
          </body>
        </html>
      `);

      const ast = await DOMParser.parsePage(page);

      expect(ast.title).toContain('Product Name');

      const stats = DOMParser.getStats(ast);
      expect(stats.listCount).toBeGreaterThanOrEqual(1);

      // Should detect features section
      const hasFeatures = ast.mainContent.some(n =>
        n.text.toLowerCase().includes('features')
      );
      expect(hasFeatures).toBe(true);
    });
  });
});
