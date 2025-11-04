import type { Page } from "playwright-crx";
import { DynamicTool } from "langchain/tools";
import { ToolFactory } from "./types";
import { truncate, MAX_RETURN_CHARS, withActivePage } from "./utils";
import { ContentCacheService, CachedPageContent } from '../../tracking/contentCacheService';
import { extractStructuredContent, extractMainContent, getPageSummary } from '../../tracking/contentExtractor';
import { VectorService } from '../../tracking/vectorService';
import { EmbeddingService } from '../../tracking/embeddingService';
import { logWithTimestamp } from '../../background/utils';

/**
 * Parse options from input string
 */
function parseReadTextOptions(input: string): {
  query?: string;
  useCache: boolean;
  maxSections?: number;
  minSimilarity?: number;
  forceRefresh: boolean;
} {
  const options = {
    useCache: true,
    forceRefresh: false,
  } as ReturnType<typeof parseReadTextOptions>;

  if (!input || input.trim() === '') {
    return options;
  }

  // Parse comma-separated options
  input.split(',').forEach(part => {
    const trimmed = part.trim();

    if (trimmed === 'nocache') {
      options.useCache = false;
    } else if (trimmed === 'refresh') {
      options.forceRefresh = true;
    } else if (trimmed.startsWith('query=')) {
      options.query = trimmed.substring('query='.length);
    } else if (trimmed.startsWith('limit=')) {
      options.maxSections = parseInt(trimmed.substring('limit='.length), 10);
    } else if (trimmed.startsWith('similarity=')) {
      options.minSimilarity = parseFloat(trimmed.substring('similarity='.length));
    } else if (!trimmed.includes('=')) {
      // Treat as query if no '=' sign
      options.query = trimmed;
    }
  });

  return options;
}

/**
 * Enhanced browser_read_text with caching and semantic search
 */
export const browserReadTextEnhanced: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "browser_read_text_enhanced",
    description:
      "Enhanced text extraction with semantic search and caching. Much faster than browser_read_text on repeated calls.\n" +
      "Options (comma-separated):\n" +
      "  • query=<text> - semantic search for specific content\n" +
      "  • limit=<n> - return top N sections (default 3)\n" +
      "  • similarity=<0-1> - minimum similarity score (default 0.5)\n" +
      "  • nocache - force fresh extraction\n" +
      "  • refresh - refresh cache\n" +
      "Examples:\n" +
      "  • 'pricing' - search for pricing information\n" +
      "  • 'query=installation,limit=5' - get top 5 sections about installation\n" +
      "  • 'nocache' - force fresh extraction",

    func: async (input: string) => {
      try {
        return await withActivePage(page, async (activePage) => {
          const options = parseReadTextOptions(input);
          const url = await activePage.url();
          const cacheService = ContentCacheService.getInstance();
          const vectorService = VectorService.getInstance();
          const embeddingService = EmbeddingService.getInstance();

          // === STEP 1: Check Cache ===
          if (options.useCache && !options.forceRefresh) {
            const cached = await cacheService.get(url);

            if (cached && !cacheService.isStale(cached)) {
              logWithTimestamp(`[Cache HIT] ${url}`, 'log');

              // If query provided, search in cached content
              if (options.query) {
                return await searchCachedContent(
                  cached,
                  options.query,
                  options.maxSections || 3,
                  options.minSimilarity || 0.5,
                  vectorService,
                  embeddingService
                );
              }

              // Return full cached text
              return truncate(cached.fullText, MAX_RETURN_CHARS);
            }
          }

          logWithTimestamp(`[Cache MISS] ${url}`, 'log');

          // === STEP 2: Extract Fresh Content ===
          const content = await extractStructuredContent(activePage);

          // === STEP 3: Store in Vector Database ===
          const pageHash = cacheService.hashUrl(url);
          const collectionName = `page_${pageHash}`;

          try {
            // Create collection if it doesn't exist
            const collections = await vectorService.listCollections();
            const exists = collections.some(c => c.name === collectionName);

            if (!exists) {
              await vectorService.createCollection(
                collectionName,
                embeddingService.getDimension()
              );
            } else if (options.forceRefresh) {
              // Clear existing collection
              await vectorService.deleteCollection(collectionName);
              await vectorService.createCollection(
                collectionName,
                embeddingService.getDimension()
              );
            }

            // Store sections with embeddings
            await storeSectionsWithEmbeddings(
              content,
              collectionName,
              url,
              vectorService,
              embeddingService
            );

          } catch (error) {
            logWithTimestamp(`Error storing in vector DB: ${error}`, 'warn');
            // Continue without vector storage
          }

          // === STEP 4: Cache Content ===
          content.metadata.pageHash = pageHash;
          await cacheService.set(url, content);

          // === STEP 5: Return Results ===
          if (options.query) {
            return await searchCachedContent(
              content,
              options.query,
              options.maxSections || 3,
              options.minSimilarity || 0.5,
              vectorService,
              embeddingService
            );
          }

          return truncate(content.fullText, MAX_RETURN_CHARS);
        });
      } catch (error) {
        return `Error in enhanced read: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

/**
 * Store page sections with embeddings
 */
async function storeSectionsWithEmbeddings(
  content: CachedPageContent,
  collectionName: string,
  url: string,
  vectorService: VectorService,
  embeddingService: EmbeddingService
): Promise<void> {
  for (const section of content.sections) {
    try {
      // Create embedding for section
      const embedding = await embeddingService.createEmbedding(section.content);

      // Store in vector database
      await vectorService.storeDocument(
        collectionName,
        `${section.position}_${section.heading}`,
        section.content,
        embedding,
        {
          heading: section.heading,
          level: section.level,
          url: url,
          xpath: section.xpath,
          position: section.position,
          wordCount: section.wordCount
        }
      );
    } catch (error) {
      logWithTimestamp(`Error storing section ${section.heading}: ${error}`, 'warn');
      // Continue with other sections
    }
  }

  logWithTimestamp(
    `Stored ${content.sections.length} sections in collection ${collectionName}`,
    'log'
  );
}

/**
 * Search cached content using semantic similarity
 */
async function searchCachedContent(
  content: CachedPageContent,
  query: string,
  topK: number,
  minSimilarity: number,
  vectorService: VectorService,
  embeddingService: EmbeddingService
): Promise<string> {
  const pageHash = content.metadata.pageHash;
  const collectionName = `page_${pageHash}`;

  try {
    // Create query embedding
    const queryEmbedding = await embeddingService.createEmbedding(query);

    // Search in vector database
    const results = await vectorService.searchSimilar(
      collectionName,
      queryEmbedding,
      topK,
      minSimilarity
    );

    if (results.length === 0) {
      return `No content found matching query: "${query}"\n\n` +
             `Try lowering the similarity threshold or use different keywords.`;
    }

    // Format results
    const formatted = results.map((r, idx) => {
      const heading = r.metadata?.heading || 'Section';
      const relevance = (r.score * 100).toFixed(1);
      return `## ${idx + 1}. ${heading} (Relevance: ${relevance}%)\n\n${r.content}`;
    });

    const output = `Found ${results.length} relevant sections for query: "${query}"\n\n` +
                   `---\n\n${formatted.join('\n\n---\n\n')}`;

    return truncate(output, MAX_RETURN_CHARS);

  } catch (error) {
    // Fallback to simple text search
    logWithTimestamp(`Vector search failed, using fallback: ${error}`, 'warn');

    const matchingSections = content.sections.filter(section =>
      section.content.toLowerCase().includes(query.toLowerCase()) ||
      section.heading.toLowerCase().includes(query.toLowerCase())
    );

    if (matchingSections.length === 0) {
      return `No sections found matching query: "${query}"`;
    }

    const formatted = matchingSections.slice(0, topK).map((section, idx) => {
      return `## ${idx + 1}. ${section.heading}\n\n${section.content}`;
    });

    return truncate(formatted.join('\n\n---\n\n'), MAX_RETURN_CHARS);
  }
}

/**
 * Get page summary (title + first few sections)
 */
export const browserGetPageSummary: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "browser_get_summary",
    description: "Get a quick summary of the page (title + first few sections). Faster than reading full text.",
    func: async (maxLength: string = "500") => {
      try {
        return await withActivePage(page, async (activePage) => {
          const length = parseInt(maxLength, 10) || 500;
          const summary = await getPageSummary(activePage, length);
          return summary;
        });
      } catch (error) {
        return `Error getting summary: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

/**
 * Extract only main content (skip navigation, headers, footers)
 */
export const browserReadMainContent: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "browser_read_main",
    description: "Extract only the main content of the page, skipping navigation, headers, and footers. More focused than browser_read_text.",
    func: async () => {
      try {
        return await withActivePage(page, async (activePage) => {
          const mainContent = await extractMainContent(activePage);
          return truncate(mainContent, MAX_RETURN_CHARS);
        });
      } catch (error) {
        return `Error reading main content: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

/**
 * Get cache statistics
 */
export const browserGetCacheStats: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "browser_cache_stats",
    description: "Get statistics about the content cache (hit rate, size, etc.)",
    func: async () => {
      try {
        const cacheService = ContentCacheService.getInstance();
        const stats = await cacheService.getStats();

        return JSON.stringify({
          memoryCacheSize: stats.memoryCacheSize,
          dbCacheSize: stats.dbCacheSize,
          totalCachedPages: stats.totalSize,
          message: `${stats.totalSize} pages cached (${stats.memoryCacheSize} in memory, ${stats.dbCacheSize} in DB)`
        }, null, 2);
      } catch (error) {
        return `Error getting cache stats: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

/**
 * Clear content cache
 */
export const browserClearCache: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "browser_clear_cache",
    description: "Clear all cached page content. Use when you want to force fresh extraction.",
    func: async () => {
      try {
        const cacheService = ContentCacheService.getInstance();
        await cacheService.clear();
        return "Content cache cleared successfully.";
      } catch (error) {
        return `Error clearing cache: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });
