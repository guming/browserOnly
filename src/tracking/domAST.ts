import type { Page } from "playwright-crx";
import { logWithTimestamp } from '../background/utils';

/**
 * DOM Node in the AST
 */
export interface DOMNode {
  type: NodeType;
  tag: string;
  level?: number;         // For headings: 1-6
  text: string;
  children: DOMNode[];
  metadata: {
    xpath: string;
    importance: number;   // 0-1, calculated by semantic analyzer
    wordCount: number;
    depth: number;
    isMainContent: boolean;
    rect?: {              // Bounding box for visual importance
      width: number;
      height: number;
      area: number;
    };
  };
}

/**
 * Node types in the DOM AST
 */
export type NodeType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'list-item'
  | 'table'
  | 'code'
  | 'blockquote'
  | 'link'
  | 'emphasis'
  | 'strong'
  | 'image'
  | 'container'
  | 'text';

/**
 * Page AST structure
 */
export interface PageAST {
  url: string;
  title: string;
  mainContent: DOMNode[];
  supplementary: DOMNode[];
  navigation: DOMNode[];
  metadata: PageMetadata;
}

/**
 * Page-level metadata
 */
export interface PageMetadata {
  totalWords: number;
  estimatedReadingTime: number; // in minutes
  contentDensity: number;        // text/html ratio
  structureScore: number;        // how well-structured (0-1)
  mainContentArea: {
    selector: string;
    confidence: number;          // 0-1, how confident we are
  };
}

/**
 * DOM AST Parser
 * Parses page DOM into structured AST with semantic information
 */
export class DOMParser {
  /**
   * Parse page DOM into AST
   */
  static async parsePage(page: Page): Promise<PageAST> {
    const startTime = Date.now();

    const ast = await page.evaluate(() => {
      // ========== Helper Functions (run in browser context) ==========

      /**
       * Get XPath for an element
       */
      function getXPath(element: Element): string {
        if (!element || element === document.body) {
          return '//body';
        }

        const segments: string[] = [];
        let current: Element | null = element;

        while (current && current !== document.body) {
          let index = 1;
          let sibling = current.previousElementSibling;

          while (sibling) {
            if (sibling.tagName === current.tagName) index++;
            sibling = sibling.previousElementSibling;
          }

          const tagName = current.tagName.toLowerCase();
          segments.unshift(`${tagName}[${index}]`);
          current = current.parentElement;
        }

        return '//' + segments.join('/');
      }

      /**
       * Count words in text
       */
      function countWords(text: string): number {
        return text.trim().split(/\s+/).filter(Boolean).length;
      }

      /**
       * Extract text from element (immediate text nodes only)
       */
      function extractText(element: Element): string {
        const texts: string[] = [];

        Array.from(element.childNodes).forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent?.trim();
            if (text) texts.push(text);
          }
        });

        return texts.join(' ');
      }

      /**
       * Get all text including descendants
       */
      function getAllText(element: Element): string {
        return element.textContent?.trim() || '';
      }

      /**
       * Calculate content density score for an element
       */
      function calculateContentScore(element: Element): number {
        const text = element.textContent || '';
        const html = element.innerHTML;

        if (!html || !text) return 0;

        // Text to HTML ratio
        const density = text.length / html.length;

        // Paragraph count
        const paragraphs = element.querySelectorAll('p').length;

        // Heading count
        const headings = element.querySelectorAll('h1,h2,h3,h4,h5,h6').length;

        // Link density (too many links = navigation)
        const links = element.querySelectorAll('a').length;
        const linkPenalty = links > 10 ? 0.5 : 1.0;

        return (density * 100 + paragraphs * 10 + headings * 5) * linkPenalty;
      }

      /**
       * Detect main content area using multiple heuristics
       */
      function detectMainContent(): Element {
        // Strategy 1: Semantic HTML5 tags
        const semanticMain = document.querySelector('main, article, [role="main"]');
        if (semanticMain && calculateContentScore(semanticMain) > 50) {
          return semanticMain;
        }

        // Strategy 2: ID-based detection
        const idCandidates = [
          '#content', '#main-content', '#main', '#article',
          '#primary', '#page-content', '.content', '.main'
        ];

        for (const selector of idCandidates) {
          const element = document.querySelector(selector);
          if (element && calculateContentScore(element) > 50) {
            return element;
          }
        }

        // Strategy 3: Content density heuristic
        const candidates = Array.from(
          document.querySelectorAll('div, section, article')
        ).filter(el => {
          // Must be visible
          if ((el as HTMLElement).offsetParent === null) return false;
          // Must have substantial content
          const text = el.textContent || '';
          return text.length > 100;
        });

        if (candidates.length === 0) {
          return document.body;
        }

        // Find element with highest content score
        const best = candidates.reduce((best, current) => {
          const score = calculateContentScore(current);
          const bestScore = calculateContentScore(best);
          return score > bestScore ? current : best;
        });

        return best;
      }

      /**
       * Determine node type from tag
       */
      function getNodeType(tag: string): NodeType {
        if (/^h[1-6]$/.test(tag)) return 'heading';
        if (tag === 'p') return 'paragraph';
        if (tag === 'ul' || tag === 'ol') return 'list';
        if (tag === 'li') return 'list-item';
        if (tag === 'table') return 'table';
        if (tag === 'pre' || tag === 'code') return 'code';
        if (tag === 'blockquote') return 'blockquote';
        if (tag === 'a') return 'link';
        if (tag === 'em' || tag === 'i') return 'emphasis';
        if (tag === 'strong' || tag === 'b') return 'strong';
        if (tag === 'img') return 'image';
        return 'container';
      }

      /**
       * Get heading level (1-6)
       */
      function getHeadingLevel(tag: string): number | undefined {
        const match = tag.match(/^h([1-6])$/);
        return match ? parseInt(match[1]) : undefined;
      }

      /**
       * Check if element is visible
       */
      function isVisible(element: Element): boolean {
        return (element as HTMLElement).offsetParent !== null;
      }

      /**
       * Parse a DOM element into AST node
       */
      function parseNode(element: Element, depth: number, isMainContent: boolean): DOMNode | null {
        // Skip invisible elements
        if (!isVisible(element)) return null;

        const tag = element.tagName.toLowerCase();

        // Skip non-content tags
        if (['script', 'style', 'noscript', 'svg', 'iframe'].includes(tag)) {
          return null;
        }

        const type = getNodeType(tag);
        const text = extractText(element);
        const allText = getAllText(element);
        const wordCount = countWords(allText);

        // Skip elements with no text content
        if (wordCount === 0 && !['img', 'table'].includes(tag)) {
          return null;
        }

        // Get bounding rect for visual importance
        const rect = element.getBoundingClientRect();

        // Parse children
        const children: DOMNode[] = [];
        Array.from(element.children).forEach(child => {
          const childNode = parseNode(child, depth + 1, isMainContent);
          if (childNode) children.push(childNode);
        });

        return {
          type,
          tag,
          level: getHeadingLevel(tag),
          text: allText,
          children,
          metadata: {
            xpath: getXPath(element),
            importance: 0.5, // Will be calculated by semantic analyzer
            wordCount,
            depth,
            isMainContent,
            rect: {
              width: rect.width,
              height: rect.height,
              area: rect.width * rect.height,
            },
          },
        };
      }

      /**
       * Parse a section of the DOM
       */
      function parseSection(root: Element, isMainContent: boolean): DOMNode[] {
        const nodes: DOMNode[] = [];

        Array.from(root.children).forEach(child => {
          const node = parseNode(child, 0, isMainContent);
          if (node) nodes.push(node);
        });

        return nodes;
      }

      /**
       * Detect navigation elements
       */
      function detectNavigation(): Element[] {
        const navElements: Element[] = [];

        // Semantic navigation
        document.querySelectorAll('nav, [role="navigation"]').forEach(el => {
          navElements.push(el);
        });

        // Common nav classes/ids
        document.querySelectorAll('[class*="nav"], [id*="nav"], [class*="menu"], [id*="menu"]').forEach(el => {
          if (!navElements.includes(el)) {
            navElements.push(el);
          }
        });

        return navElements;
      }

      /**
       * Detect supplementary content (sidebars, etc.)
       */
      function detectSupplementary(mainContent: Element): Element[] {
        const supplementary: Element[] = [];

        // Semantic aside
        document.querySelectorAll('aside, [role="complementary"]').forEach(el => {
          if (!mainContent.contains(el)) {
            supplementary.push(el);
          }
        });

        // Common sidebar classes
        document.querySelectorAll('[class*="sidebar"], [class*="aside"], [id*="sidebar"]').forEach(el => {
          if (!mainContent.contains(el) && !supplementary.includes(el)) {
            supplementary.push(el);
          }
        });

        return supplementary;
      }

      /**
       * Calculate page metadata
       */
      function calculatePageMetadata(mainContent: Element): PageMetadata {
        const bodyText = document.body.textContent || '';
        const bodyHTML = document.body.innerHTML;

        const totalWords = countWords(bodyText);
        const readingTime = Math.ceil(totalWords / 200); // Average reading speed

        const contentDensity = bodyText.length / bodyHTML.length;

        // Structure score based on heading hierarchy
        const h1Count = document.querySelectorAll('h1').length;
        const h2Count = document.querySelectorAll('h2').length;
        const h3Count = document.querySelectorAll('h3').length;
        const pCount = document.querySelectorAll('p').length;

        let structureScore = 0;
        if (h1Count === 1) structureScore += 0.3; // Good: single H1
        if (h2Count > 0) structureScore += 0.3;   // Has sections
        if (h3Count > 0) structureScore += 0.2;   // Has subsections
        if (pCount > h2Count * 2) structureScore += 0.2; // Good text/heading ratio

        return {
          totalWords,
          estimatedReadingTime: readingTime,
          contentDensity,
          structureScore,
          mainContentArea: {
            selector: getXPath(mainContent),
            confidence: calculateContentScore(mainContent) / 100,
          },
        };
      }

      // ========== Main Execution ==========

      const mainContent = detectMainContent();
      const navElements = detectNavigation();
      const suppElements = detectSupplementary(mainContent);

      return {
        url: window.location.href,
        title: document.title,
        mainContent: parseSection(mainContent, true),
        supplementary: suppElements.flatMap(el => parseSection(el, false)),
        navigation: navElements.flatMap(el => parseSection(el, false)),
        metadata: calculatePageMetadata(mainContent),
      } as PageAST;
    }) as PageAST;

    const elapsed = Date.now() - startTime;
    logWithTimestamp(`Parsed page AST in ${elapsed}ms: ${ast.metadata.totalWords} words, structure score ${ast.metadata.structureScore.toFixed(2)}`, 'log');

    return ast;
  }

  /**
   * Serialize AST to JSON (for debugging/storage)
   */
  static serialize(ast: PageAST): string {
    return JSON.stringify(ast, null, 2);
  }

  /**
   * Get AST statistics
   */
  static getStats(ast: PageAST): {
    totalNodes: number;
    mainContentNodes: number;
    headingCount: number;
    paragraphCount: number;
    listCount: number;
    avgDepth: number;
  } {
    let totalNodes = 0;
    let mainContentNodes = 0;
    let headingCount = 0;
    let paragraphCount = 0;
    let listCount = 0;
    let totalDepth = 0;

    const traverse = (nodes: DOMNode[]) => {
      nodes.forEach(node => {
        totalNodes++;
        totalDepth += node.metadata.depth;

        if (node.metadata.isMainContent) mainContentNodes++;
        if (node.type === 'heading') headingCount++;
        if (node.type === 'paragraph') paragraphCount++;
        if (node.type === 'list') listCount++;

        traverse(node.children);
      });
    };

    traverse(ast.mainContent);
    traverse(ast.supplementary);
    traverse(ast.navigation);

    return {
      totalNodes,
      mainContentNodes,
      headingCount,
      paragraphCount,
      listCount,
      avgDepth: totalNodes > 0 ? totalDepth / totalNodes : 0,
    };
  }
}
