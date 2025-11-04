import type { PageAST, DOMNode } from './domAST';
import { SemanticAnalyzer } from './semanticAnalyzer';
import { logWithTimestamp } from '../background/utils';

/**
 * Extraction options
 */
export interface ExtractionOptions {
  maxChars?: number;              // Maximum output length (default: 20000)
  minImportance?: number;         // Minimum importance threshold (default: 0.5)
  includeStructure?: boolean;     // Preserve heading hierarchy (default: false)
  priorityOrder?: 'importance' | 'dom-order' | 'mixed';  // Sort order (default: 'mixed')
  mainContentOnly?: boolean;      // Extract only main content (default: false)
  sections?: string[];            // Specific sections to extract
  adaptiveChunking?: boolean;     // Smart chunking to avoid mid-sentence cuts (default: true)
}

/**
 * Extraction result
 */
export interface ExtractionResult {
  content: string;
  metadata: {
    charsExtracted: number;
    nodesIncluded: number;
    sectionsIncluded: number;
    truncated: boolean;
    truncationInfo?: string;
  };
}

/**
 * AST Content Extractor
 * Intelligently extracts content from DOM AST
 */
export class ASTContentExtractor {
  /**
   * Extract content from analyzed AST
   */
  static extract(ast: PageAST, options: ExtractionOptions = {}): ExtractionResult {
    const startTime = Date.now();

    // Apply defaults
    const opts = {
      maxChars: 20000,
      minImportance: 0.5,
      includeStructure: false,
      priorityOrder: 'mixed' as const,
      mainContentOnly: false,
      sections: undefined,
      adaptiveChunking: true,
      ...options,
    };

    // Ensure AST is analyzed
    const analyzedAST = this.ensureAnalyzed(ast);

    // Collect nodes based on options
    let nodes = this.collectNodes(analyzedAST, opts);

    // Filter by importance
    nodes = nodes.filter(n => n.metadata.importance >= opts.minImportance);

    // Sort nodes
    nodes = this.sortNodes(nodes, opts.priorityOrder);

    // Extract content
    const result = opts.includeStructure
      ? this.buildStructuredOutput(nodes, opts.maxChars, opts.adaptiveChunking)
      : this.buildFlatOutput(nodes, opts.maxChars, opts.adaptiveChunking);

    const elapsed = Date.now() - startTime;
    logWithTimestamp(
      `Extracted ${result.metadata.charsExtracted} chars from ${result.metadata.nodesIncluded} nodes in ${elapsed}ms`,
      'log'
    );

    return result;
  }

  /**
   * Ensure AST has been analyzed (importance scores calculated)
   */
  private static ensureAnalyzed(ast: PageAST): PageAST {
    // Check if already analyzed (any node has non-default importance)
    const hasAnalysis = ast.mainContent.some(
      n => n.metadata.importance !== 0.5
    );

    if (!hasAnalysis) {
      return SemanticAnalyzer.analyze(ast);
    }

    return ast;
  }

  /**
   * Collect nodes from AST based on options
   */
  private static collectNodes(ast: PageAST, options: ExtractionOptions): DOMNode[] {
    const nodes: DOMNode[] = [];

    const collect = (nodeList: DOMNode[]) => {
      nodeList.forEach(node => {
        // Filter by sections if specified
        if (options.sections && node.type === 'heading') {
          const matchesSection = options.sections.some(section =>
            node.text.toLowerCase().includes(section.toLowerCase())
          );
          if (!matchesSection && node.children.length === 0) {
            return; // Skip this heading if it doesn't match
          }
        }

        nodes.push(node);
        collect(node.children);
      });
    };

    // Collect from main content
    collect(ast.mainContent);

    // Collect from supplementary if not main-only
    if (!options.mainContentOnly) {
      collect(ast.supplementary);
    }

    return nodes;
  }

  /**
   * Sort nodes based on priority order
   */
  private static sortNodes(
    nodes: DOMNode[],
    order: 'importance' | 'dom-order' | 'mixed'
  ): DOMNode[] {
    if (order === 'dom-order') {
      return nodes; // Already in DOM order
    }

    if (order === 'importance') {
      return [...nodes].sort((a, b) =>
        b.metadata.importance - a.metadata.importance
      );
    }

    // Mixed: high importance first, then DOM order within same importance band
    return [...nodes].sort((a, b) => {
      const importanceDiff = b.metadata.importance - a.metadata.importance;
      // If importance difference is significant (>0.2), sort by importance
      if (Math.abs(importanceDiff) > 0.2) {
        return importanceDiff;
      }
      // Otherwise keep DOM order (stable sort)
      return 0;
    });
  }

  /**
   * Build structured output preserving hierarchy
   */
  private static buildStructuredOutput(
    nodes: DOMNode[],
    maxChars: number,
    adaptiveChunking: boolean
  ): ExtractionResult {
    const lines: string[] = [];
    let charCount = 0;
    let nodesIncluded = 0;
    let sectionsIncluded = 0;
    let truncated = false;
    let currentSection = '';

    for (const node of nodes) {
      const formatted = this.formatNode(node);
      const lineLength = formatted.length + 1; // +1 for newline

      // Check if we can fit this node
      if (charCount + lineLength > maxChars) {
        // Try adaptive truncation
        if (adaptiveChunking && charCount < maxChars * 0.95) {
          const remaining = maxChars - charCount;
          const truncatedText = this.truncateGracefully(formatted, remaining);
          if (truncatedText.length > 50) {
            lines.push(truncatedText);
            charCount += truncatedText.length + 1;
            nodesIncluded++;
          }
        }
        truncated = true;
        break;
      }

      lines.push(formatted);
      charCount += lineLength;
      nodesIncluded++;

      if (node.type === 'heading') {
        sectionsIncluded++;
        currentSection = node.text;
      }
    }

    const content = lines.join('\n');

    let truncationInfo: string | undefined;
    if (truncated) {
      const remaining = nodes.length - nodesIncluded;
      truncationInfo = `Content truncated after ${sectionsIncluded} sections. ${remaining} more nodes available.`;
      if (currentSection) {
        truncationInfo += ` Last section: "${currentSection}"`;
      }
    }

    return {
      content,
      metadata: {
        charsExtracted: charCount,
        nodesIncluded,
        sectionsIncluded,
        truncated,
        truncationInfo,
      },
    };
  }

  /**
   * Build flat output without structure
   */
  private static buildFlatOutput(
    nodes: DOMNode[],
    maxChars: number,
    adaptiveChunking: boolean
  ): ExtractionResult {
    const lines: string[] = [];
    let charCount = 0;
    let nodesIncluded = 0;
    let sectionsIncluded = 0;
    let truncated = false;

    for (const node of nodes) {
      // Skip container nodes that have no direct text
      if (node.type === 'container' && node.text.trim() === '') {
        continue;
      }

      const text = node.text.trim();
      if (!text) continue;

      const lineLength = text.length + 1;

      if (charCount + lineLength > maxChars) {
        if (adaptiveChunking && charCount < maxChars * 0.95) {
          const remaining = maxChars - charCount;
          const truncatedText = this.truncateGracefully(text, remaining);
          if (truncatedText.length > 50) {
            lines.push(truncatedText);
            charCount += truncatedText.length + 1;
            nodesIncluded++;
          }
        }
        truncated = true;
        break;
      }

      lines.push(text);
      charCount += lineLength;
      nodesIncluded++;

      if (node.type === 'heading') {
        sectionsIncluded++;
      }
    }

    const content = lines.join('\n');

    let truncationInfo: string | undefined;
    if (truncated) {
      const remaining = nodes.length - nodesIncluded;
      truncationInfo = `Content truncated. ${remaining} more nodes available. Use structured mode or increase max chars.`;
    }

    return {
      content,
      metadata: {
        charsExtracted: charCount,
        nodesIncluded,
        sectionsIncluded,
        truncated,
        truncationInfo,
      },
    };
  }

  /**
   * Format node based on its type
   */
  private static formatNode(node: DOMNode): string {
    switch (node.type) {
      case 'heading':
        return '\n' + '#'.repeat(node.level || 1) + ' ' + node.text + '\n';

      case 'paragraph':
        return node.text;

      case 'list':
        // List container, let list items handle formatting
        return '';

      case 'list-item':
        return '• ' + node.text;

      case 'code':
        return '```\n' + node.text + '\n```';

      case 'blockquote':
        return '> ' + node.text;

      case 'table':
        return '[Table: ' + node.metadata.wordCount + ' words]';

      case 'link':
        return node.text; // Just the text, not the URL

      case 'emphasis':
      case 'strong':
        return node.text;

      case 'image':
        return '[Image]';

      default:
        return node.text;
    }
  }

  /**
   * Gracefully truncate text at sentence or word boundary
   */
  private static truncateGracefully(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    const truncated = text.substring(0, maxLength);

    // Try to break at sentence boundary
    const sentenceBreakers = ['. ', '.\n', '! ', '!\n', '? ', '?\n'];
    let bestBreak = -1;

    for (const breaker of sentenceBreakers) {
      const pos = truncated.lastIndexOf(breaker);
      if (pos > maxLength * 0.7 && pos > bestBreak) {
        bestBreak = pos + breaker.length;
      }
    }

    if (bestBreak > 0) {
      return truncated.substring(0, bestBreak).trim();
    }

    // Fall back to word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace).trim() + '...';
    }

    // Last resort: hard truncate
    return truncated.trim() + '...';
  }

  /**
   * Get quick summary of the page
   */
  static getSummary(ast: PageAST, maxLength: number = 500): string {
    const summary: string[] = [];
    let length = 0;

    // Add title
    summary.push(`# ${ast.title}\n`);
    length += ast.title.length + 4;

    // Add first paragraph from each major section
    const sections = ast.mainContent.filter(n => n.type === 'heading' && n.level && n.level <= 2);

    for (const section of sections) {
      if (length >= maxLength) break;

      const heading = section.text;
      const firstPara = this.findFirstParagraph(section);

      if (firstPara) {
        const text = `\n## ${heading}\n${firstPara.text.substring(0, 150)}...\n`;
        if (length + text.length <= maxLength) {
          summary.push(text);
          length += text.length;
        }
      }
    }

    return summary.join('');
  }

  /**
   * Find first paragraph in a section
   */
  private static findFirstParagraph(node: DOMNode): DOMNode | null {
    if (node.type === 'paragraph') {
      return node;
    }

    for (const child of node.children) {
      const para = this.findFirstParagraph(child);
      if (para) return para;
    }

    return null;
  }

  /**
   * Get specific section by name
   */
  static getSection(ast: PageAST, sectionName: string): ExtractionResult | null {
    const lowerName = sectionName.toLowerCase();

    // Find matching heading
    const findSection = (nodes: DOMNode[]): DOMNode | null => {
      for (const node of nodes) {
        if (node.type === 'heading' && node.text.toLowerCase().includes(lowerName)) {
          return node;
        }
        const found = findSection(node.children);
        if (found) return found;
      }
      return null;
    };

    const section = findSection(ast.mainContent);
    if (!section) return null;

    // Extract this section and its children
    const nodes = [section, ...this.getAllDescendants(section)];

    return this.buildStructuredOutput(nodes, 50000, true);
  }

  /**
   * Get all descendants of a node
   */
  private static getAllDescendants(node: DOMNode): DOMNode[] {
    const descendants: DOMNode[] = [];

    const collect = (n: DOMNode) => {
      n.children.forEach(child => {
        descendants.push(child);
        collect(child);
      });
    };

    collect(node);
    return descendants;
  }

  /**
   * Get overview with section names
   */
  static getOverview(ast: PageAST): string {
    const overview: string[] = [];

    overview.push(`Page: ${ast.title}`);
    overview.push(`URL: ${ast.url}`);
    overview.push(`Total words: ${ast.metadata.totalWords}`);
    overview.push(`Reading time: ~${ast.metadata.estimatedReadingTime} minutes`);
    overview.push(`Structure score: ${(ast.metadata.structureScore * 100).toFixed(0)}%\n`);

    // List main sections
    const sections = ast.mainContent
      .filter(n => n.type === 'heading' && n.level && n.level <= 2)
      .map(n => `  ${n.level === 1 ? '•' : '  ◦'} ${n.text}`);

    if (sections.length > 0) {
      overview.push('Main sections:');
      overview.push(...sections);
    }

    return overview.join('\n');
  }
}
