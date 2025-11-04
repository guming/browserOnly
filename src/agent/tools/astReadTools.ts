import type { Page } from "playwright-crx";
import { DynamicTool } from "langchain/tools";
import { DOMParser } from "../../tracking/domAST";
import { ASTContentExtractor } from "../../tracking/astContentExtractor";
import { SemanticAnalyzer } from "../../tracking/semanticAnalyzer";
import { ASTCacheService } from "../../tracking/astCacheService";
import { withActivePage } from "./utils";

type ToolFactory = (page: Page) => DynamicTool;

// Get cache service singleton
const astCache = ASTCacheService.getInstance();

/**
 * Parse page with caching
 * Checks cache first, only parses if not cached or expired
 */
async function parsePageWithCache(page: Page) {
  const url = page.url();

  // Check cache first
  const cachedAST = await astCache.get(url);
  if (cachedAST) {
    return cachedAST;
  }

  // Cache miss - parse page
  const ast = await DOMParser.parsePage(page);

  // Store in cache (3 minute TTL by default)
  await astCache.set(url, ast);

  return ast;
}

/**
 * Parse options from input string
 */
function parseASTReadOptions(input: string) {
  const options = {
    structured: false,
    mainOnly: false,
    minImportance: 0.5,
    maxChars: 20000,
    sections: undefined as string[] | undefined,
    priority: 'mixed' as 'importance' | 'dom-order' | 'mixed',
  };

  if (!input || input.trim() === '') {
    return options;
  }

  input.split(',').forEach(part => {
    const trimmed = part.trim();

    if (trimmed === 'structured') {
      options.structured = true;
    } else if (trimmed === 'main-only') {
      options.mainOnly = true;
    } else if (trimmed.startsWith('importance=')) {
      const val = parseFloat(trimmed.substring('importance='.length));
      if (!isNaN(val)) options.minImportance = val;
    } else if (trimmed.startsWith('max=')) {
      const val = parseInt(trimmed.substring('max='.length));
      if (!isNaN(val)) options.maxChars = val;
    } else if (trimmed.startsWith('sections=')) {
      const sectionsStr = trimmed.substring('sections='.length);
      options.sections = sectionsStr.split(';').map(s => s.trim());
    } else if (trimmed.startsWith('priority=')) {
      const val = trimmed.substring('priority='.length);
      if (val === 'importance' || val === 'dom-order' || val === 'mixed') {
        options.priority = val;
      }
    }
  });

  return options;
}

/**
 * Enhanced browser_read_text using AST analysis
 *
 * This tool parses the page DOM into an Abstract Syntax Tree (AST),
 * analyzes semantic importance of each element, and intelligently
 * extracts content based on priority.
 */
export const browserReadTextAST: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "browser_read_text_ast",
    description: `
Extract visible text from the page using AST (Abstract Syntax Tree) analysis.
Intelligently identifies and prioritizes important content.

Options (comma-separated):
  • structured - Preserve heading hierarchy and document structure
  • main-only - Extract only main content area (skip nav/footer)
  • importance=N - Minimum importance score 0.0-1.0 (default: 0.5)
  • max=N - Maximum characters to extract (default: 20000)
  • sections=name1;name2 - Extract specific sections only
  • priority=importance|dom-order|mixed - Sorting order (default: mixed)

Examples:
  (empty) - Default: extract all content, mixed priority
  structured - Preserve document structure with headings
  main-only,structured - Main content with structure
  importance=0.7,max=10000 - High-importance content, max 10k chars
  sections=Pricing;Features - Extract only Pricing and Features sections
  priority=importance,structured - Highest importance first, structured

Benefits over standard browser_read_text:
  ✓ Semantic understanding - Prioritizes important content
  ✓ Structure preservation - Maintains heading hierarchy
  ✓ Smart truncation - Avoids cutting mid-sentence
  ✓ Section filtering - Extract specific parts
  ✓ Content-aware - Skips navigation/boilerplate
`,
    func: async (input: string) => {
      try {
        return await withActivePage(page, async (activePage: Page) => {
          const options = parseASTReadOptions(input);

          // Step 1: Parse page into AST (with caching)
          const ast = await parsePageWithCache(activePage);

          // Step 2: Extract content with options
          const result = ASTContentExtractor.extract(ast, {
            maxChars: options.maxChars,
            minImportance: options.minImportance,
            includeStructure: options.structured,
            mainContentOnly: options.mainOnly,
            sections: options.sections,
            priorityOrder: options.priority,
            adaptiveChunking: true,
          });

          // Step 3: Build output with metadata
          let output = result.content;

          if (result.metadata.truncated && result.metadata.truncationInfo) {
            output += '\n\n--- ' + result.metadata.truncationInfo + ' ---';
          }

          return output;
        });
      } catch (err) {
        return `Error extracting text with AST: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });

/**
 * Get page overview with section names
 */
export const browserGetOverview: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "browser_get_overview",
    description: `
Get a quick overview of the page structure without reading full content.

Returns:
  • Page title and URL
  • Total word count and estimated reading time
  • Structure quality score
  • List of main sections (H1, H2 headings)

Use this when you want to understand page structure before reading full content.
Very fast (~50-100ms).
`,
    func: async () => {
      try {
        return await withActivePage(page, async (activePage: Page) => {
          const ast = await parsePageWithCache(activePage);
          return ASTContentExtractor.getOverview(ast);
        });
      } catch (err) {
        return `Error getting overview: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });

/**
 * Get specific section from page
 */
export const browserGetSection: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "browser_get_section",
    description: `
Extract a specific section from the page by section name.

Input: Section name (e.g., "Pricing", "Installation", "Features")

Returns: The complete section with all subsections and content.

Example:
  Input: "Pricing"
  Output: Complete pricing section with all details

This is more efficient than reading the entire page when you need specific information.
`,
    func: async (sectionName: string) => {
      try {
        return await withActivePage(page, async (activePage: Page) => {
          const ast = await parsePageWithCache(activePage);
          const section = ASTContentExtractor.getSection(ast, sectionName);

          if (!section) {
            return `Section "${sectionName}" not found. Available sections:\n` +
              ASTContentExtractor.getOverview(ast);
          }

          return section.content;
        });
      } catch (err) {
        return `Error getting section: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });

/**
 * Get page summary (title + first paragraph of each section)
 */
export const browserGetPageSummaryAST: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "browser_get_summary_ast",
    description: `
Get a concise summary of the page:
  • Page title
  • First paragraph of each major section

Input: Optional max length in characters (default: 500)

This provides a quick understanding of page content without reading everything.
Faster and more informative than just reading the first 500 chars.
`,
    func: async (input: string) => {
      try {
        return await withActivePage(page, async (activePage: Page) => {
          const maxLength = input ? parseInt(input) : 500;
          const ast = await parsePageWithCache(activePage);
          return ASTContentExtractor.getSummary(ast, maxLength);
        });
      } catch (err) {
        return `Error getting summary: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });

/**
 * Get AST analysis statistics
 */
export const browserGetASTStats: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "browser_get_ast_stats",
    description: `
Get detailed AST analysis statistics for the page:
  • Total nodes in DOM AST
  • Content type distribution (headings, paragraphs, lists, etc.)
  • Importance score distribution
  • Structure quality metrics

Useful for understanding page complexity and content composition.
`,
    func: async () => {
      try {
        return await withActivePage(page, async (activePage: Page) => {
          const ast = await parsePageWithCache(activePage);
          const analyzedAST = SemanticAnalyzer.analyze(ast);

          const basicStats = DOMParser.getStats(analyzedAST);
          const importanceStats = SemanticAnalyzer.getImportanceStats(analyzedAST);

          const output = [
            '=== Page AST Statistics ===\n',
            `Total nodes: ${basicStats.totalNodes}`,
            `Main content nodes: ${basicStats.mainContentNodes}`,
            `Headings: ${basicStats.headingCount}`,
            `Paragraphs: ${basicStats.paragraphCount}`,
            `Lists: ${basicStats.listCount}`,
            `Average depth: ${basicStats.avgDepth.toFixed(1)}`,
            '',
            '=== Content Importance Distribution ===',
            `Average importance: ${importanceStats.avg.toFixed(3)}`,
            `Range: ${importanceStats.min.toFixed(3)} - ${importanceStats.max.toFixed(3)}`,
            `Median: ${importanceStats.median.toFixed(3)}`,
            '',
            'Distribution:',
            `  Very High (0.9-1.0): ${importanceStats.distribution.veryHigh} nodes`,
            `  High (0.7-0.9): ${importanceStats.distribution.high} nodes`,
            `  Medium (0.5-0.7): ${importanceStats.distribution.medium} nodes`,
            `  Low (0.3-0.5): ${importanceStats.distribution.low} nodes`,
            `  Very Low (0-0.3): ${importanceStats.distribution.veryLow} nodes`,
            '',
            '=== Page Metadata ===',
            `Total words: ${analyzedAST.metadata.totalWords}`,
            `Reading time: ~${analyzedAST.metadata.estimatedReadingTime} minutes`,
            `Content density: ${(analyzedAST.metadata.contentDensity * 100).toFixed(1)}%`,
            `Structure score: ${(analyzedAST.metadata.structureScore * 100).toFixed(0)}%`,
            `Main content confidence: ${(analyzedAST.metadata.mainContentArea.confidence * 100).toFixed(0)}%`,
          ];

          return output.join('\n');
        });
      } catch (err) {
        return `Error getting AST stats: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });

/**
 * Get top N most important nodes
 */
export const browserGetTopContent: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "browser_get_top_content",
    description: `
Get the top N most important content nodes from the page.

Input: Optional number N (default: 10)

Returns the N most important pieces of content based on semantic analysis,
regardless of their position in the page.

Useful for quickly extracting key information from long pages.
`,
    func: async (input: string) => {
      try {
        return await withActivePage(page, async (activePage: Page) => {
          const topN = input ? parseInt(input) : 10;
          const ast = await parsePageWithCache(activePage);
          const analyzedAST = SemanticAnalyzer.analyze(ast);

          const topNodes = SemanticAnalyzer.getTopNodes(analyzedAST, topN);

          const output: string[] = [`=== Top ${topN} Most Important Content ===\n`];

          topNodes.forEach((node, index) => {
            output.push(`${index + 1}. [${node.type}] (importance: ${node.metadata.importance.toFixed(3)})`);
            output.push(`   ${node.text.substring(0, 200)}${node.text.length > 200 ? '...' : ''}`);
            output.push('');
          });

          return output.join('\n');
        });
      } catch (err) {
        return `Error getting top content: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });

/**
 * Manage AST cache (clear, stats, etc.)
 */
export const browserManageASTCache: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "browser_manage_ast_cache",
    description: `
Manage the AST parsing cache for performance optimization.

Commands:
  • stats - Show cache statistics
  • clear - Clear all cached ASTs
  • clear-expired - Remove only expired entries
  • info - Display cache configuration

The AST cache stores parsed page structures for 3 minutes to avoid
expensive re-parsing on repeated reads. Cache is automatically managed
but you can manually control it if needed.
`,
    func: async (command: string) => {
      try {
        const cmd = command.trim().toLowerCase();

        switch (cmd) {
          case 'stats': {
            const stats = astCache.getStats();
            const output = [
              '=== AST Cache Statistics ===\n',
              `Cached pages: ${stats.size}/${stats.maxSize}`,
              `Memory usage: ~${Math.round(stats.size * 50)}KB estimated`,
              '',
              'Cached URLs:',
            ];

            stats.entries.forEach((entry, i) => {
              output.push(`  ${i + 1}. ${entry.url} (expires in ${entry.expiresIn}s)`);
            });

            return output.join('\n');
          }

          case 'clear': {
            astCache.clear();
            return 'AST cache cleared successfully. All cached pages removed.';
          }

          case 'clear-expired': {
            const deletedCount = astCache.clearExpired();
            return `Cleared ${deletedCount} expired cache entries.`;
          }

          case 'info': {
            const stats = astCache.getStats();
            return [
              '=== AST Cache Configuration ===\n',
              `TTL (Time To Live): 3 minutes`,
              `Max cache size: ${stats.maxSize} pages`,
              `Current size: ${stats.size} pages`,
              `Storage: In-memory (fast, session-scoped)`,
              '',
              'Cache is automatically managed:',
              '  • Entries expire after 3 minutes',
              '  • LRU eviction when max size reached',
              '  • Cache cleared on page navigation',
            ].join('\n');
          }

          default:
            return `Unknown command: "${command}". Available commands: stats, clear, clear-expired, info`;
        }
      } catch (err) {
        return `Error managing cache: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });
