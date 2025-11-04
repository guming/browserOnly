import type { PageAST, DOMNode } from './domAST';
import { logWithTimestamp } from '../background/utils';

/**
 * Importance scores for different HTML tags
 * Higher score = more important content
 */
const TAG_IMPORTANCE: Record<string, number> = {
  // High importance - main content
  'h1': 1.0,
  'h2': 0.9,
  'h3': 0.8,
  'h4': 0.75,
  'h5': 0.7,
  'h6': 0.65,
  'article': 0.95,
  'main': 1.0,
  'p': 0.7,
  'blockquote': 0.7,
  'pre': 0.75,
  'code': 0.7,
  'table': 0.6,

  // Medium importance
  'li': 0.6,
  'dd': 0.6,
  'dt': 0.65,
  'figcaption': 0.65,

  // Low importance - usually navigation/metadata
  'nav': 0.3,
  'header': 0.35,
  'footer': 0.3,
  'aside': 0.4,
  'a': 0.4,

  // Very low importance
  'button': 0.2,
  'input': 0.2,
  'select': 0.2,
  'label': 0.25,

  // Default for unknown tags
  'div': 0.5,
  'section': 0.6,
  'span': 0.5,
};

/**
 * Keywords that indicate important sections
 */
const KEY_SECTION_TERMS = [
  // Documentation
  'installation', 'getting started', 'quick start', 'setup',
  'configuration', 'usage', 'api', 'reference',

  // Commercial
  'pricing', 'features', 'benefits', 'advantages',

  // Technical
  'documentation', 'guide', 'tutorial', 'example',
  'requirements', 'dependencies',

  // Support
  'faq', 'troubleshooting', 'common issues', 'help',

  // Overview
  'overview', 'introduction', 'about', 'summary',
];

/**
 * Context for semantic analysis
 */
interface AnalysisContext {
  isMainContent: boolean;
  parentImportance: number;
  sectionDepth: number;
  isFirstInSection: boolean;
  hasKeyTerms: boolean;
}

/**
 * Semantic Analyzer
 * Analyzes DOM AST and calculates importance scores for each node
 */
export class SemanticAnalyzer {
  /**
   * Analyze page AST and calculate importance scores
   */
  static analyze(ast: PageAST): PageAST {
    const startTime = Date.now();

    // Analyze main content (high priority)
    this.analyzeSection(ast.mainContent, {
      isMainContent: true,
      parentImportance: 1.0,
      sectionDepth: 0,
      isFirstInSection: true,
      hasKeyTerms: false,
    });

    // Analyze supplementary content (medium priority)
    this.analyzeSection(ast.supplementary, {
      isMainContent: false,
      parentImportance: 0.6,
      sectionDepth: 0,
      isFirstInSection: true,
      hasKeyTerms: false,
    });

    // Analyze navigation (low priority)
    this.analyzeSection(ast.navigation, {
      isMainContent: false,
      parentImportance: 0.3,
      sectionDepth: 0,
      isFirstInSection: true,
      hasKeyTerms: false,
    });

    const elapsed = Date.now() - startTime;
    logWithTimestamp(`Semantic analysis completed in ${elapsed}ms`, 'log');

    return ast;
  }

  /**
   * Analyze a section of nodes
   */
  private static analyzeSection(nodes: DOMNode[], context: AnalysisContext): void {
    nodes.forEach((node, index) => {
      // Calculate importance for this node
      const importance = this.calculateImportance(node, {
        ...context,
        isFirstInSection: index === 0,
      });

      node.metadata.importance = importance;

      // Update context for children
      const childContext: AnalysisContext = {
        isMainContent: context.isMainContent && node.metadata.isMainContent,
        parentImportance: importance,
        sectionDepth: node.type === 'heading' ? context.sectionDepth + 1 : context.sectionDepth,
        isFirstInSection: false,
        hasKeyTerms: this.hasKeyTerms(node.text),
      };

      // Recursively analyze children
      if (node.children.length > 0) {
        this.analyzeSection(node.children, childContext);
      }
    });
  }

  /**
   * Calculate importance score for a node
   */
  private static calculateImportance(node: DOMNode, context: AnalysisContext): number {
    // Start with base importance from tag
    let importance = TAG_IMPORTANCE[node.tag] || 0.5;

    // === Context Modifiers ===

    // 1. Main content boost
    if (context.isMainContent) {
      importance *= 1.5;
    }

    // 2. First in section boost
    if (context.isFirstInSection) {
      importance *= 1.1;
    }

    // 3. Parent importance inheritance
    // Children inherit some of parent's importance
    importance = importance * 0.8 + context.parentImportance * 0.2;

    // === Content-based Modifiers ===

    // 4. Word count boost (substantial content)
    if (node.metadata.wordCount > 100) {
      importance *= 1.3;
    } else if (node.metadata.wordCount > 50) {
      importance *= 1.15;
    } else if (node.metadata.wordCount < 10 && node.type !== 'heading') {
      importance *= 0.8;
    }

    // 5. Key section terms boost
    if (context.hasKeyTerms || this.hasKeyTerms(node.text)) {
      importance *= 1.25;
    }

    // 6. Heading level boost
    if (node.type === 'heading' && node.level) {
      // H1 > H2 > H3, etc.
      const levelBoost = 1.0 + (7 - node.level) * 0.1;
      importance *= levelBoost;
    }

    // === Penalty Modifiers ===

    // 7. Deep nesting penalty
    if (node.metadata.depth > 6) {
      importance *= 0.7;
    } else if (node.metadata.depth > 4) {
      importance *= 0.85;
    }

    // 8. Section depth penalty (deeply nested sections less important)
    if (context.sectionDepth > 4) {
      importance *= 0.8;
    }

    // 9. Visual size penalty (very small elements less important)
    if (node.metadata.rect && node.metadata.rect.area < 100) {
      importance *= 0.7;
    }

    // 10. Link density penalty
    // If text is mostly links, it's probably navigation
    if (this.isLinkHeavy(node)) {
      importance *= 0.5;
    }

    // === Special Cases ===

    // 11. Code blocks get consistent importance
    if (node.type === 'code' || node.tag === 'pre') {
      importance = Math.max(importance, 0.75);
    }

    // 12. Lists get slight boost if in main content
    if (node.type === 'list' && context.isMainContent) {
      importance *= 1.1;
    }

    // 13. Tables need context - could be data or layout
    if (node.type === 'table') {
      if (context.isMainContent && node.metadata.wordCount > 50) {
        importance *= 1.2; // Data table
      } else {
        importance *= 0.8; // Probably layout table
      }
    }

    // Normalize to 0-1 range
    return Math.min(Math.max(importance, 0), 1.0);
  }

  /**
   * Check if text contains key section terms
   */
  private static hasKeyTerms(text: string): boolean {
    const lowerText = text.toLowerCase();
    return KEY_SECTION_TERMS.some(term => lowerText.includes(term));
  }

  /**
   * Check if node is link-heavy (probably navigation)
   */
  private static isLinkHeavy(node: DOMNode): boolean {
    const linkNodes = this.countNodesByType(node, 'link');
    const totalNodes = this.countTotalNodes(node);

    // If more than 50% of nodes are links, it's link-heavy
    return totalNodes > 0 && (linkNodes / totalNodes) > 0.5;
  }

  /**
   * Count nodes of a specific type
   */
  private static countNodesByType(node: DOMNode, type: string): number {
    let count = node.type === type ? 1 : 0;
    node.children.forEach(child => {
      count += this.countNodesByType(child, type);
    });
    return count;
  }

  /**
   * Count total nodes in subtree
   */
  private static countTotalNodes(node: DOMNode): number {
    let count = 1;
    node.children.forEach(child => {
      count += this.countTotalNodes(child);
    });
    return count;
  }

  /**
   * Get top N most important nodes from AST
   */
  static getTopNodes(ast: PageAST, n: number = 10): DOMNode[] {
    const allNodes: DOMNode[] = [];

    const collect = (nodes: DOMNode[]) => {
      nodes.forEach(node => {
        allNodes.push(node);
        collect(node.children);
      });
    };

    collect(ast.mainContent);
    collect(ast.supplementary);

    // Sort by importance
    allNodes.sort((a, b) => b.metadata.importance - a.metadata.importance);

    return allNodes.slice(0, n);
  }

  /**
   * Get nodes by minimum importance threshold
   */
  static getNodesByImportance(ast: PageAST, minImportance: number): DOMNode[] {
    const nodes: DOMNode[] = [];

    const collect = (nodeList: DOMNode[]) => {
      nodeList.forEach(node => {
        if (node.metadata.importance >= minImportance) {
          nodes.push(node);
        }
        collect(node.children);
      });
    };

    collect(ast.mainContent);
    collect(ast.supplementary);

    return nodes;
  }

  /**
   * Get importance distribution statistics
   */
  static getImportanceStats(ast: PageAST): {
    avg: number;
    min: number;
    max: number;
    median: number;
    distribution: {
      veryLow: number;    // 0-0.3
      low: number;        // 0.3-0.5
      medium: number;     // 0.5-0.7
      high: number;       // 0.7-0.9
      veryHigh: number;   // 0.9-1.0
    };
  } {
    const scores: number[] = [];

    const collect = (nodes: DOMNode[]) => {
      nodes.forEach(node => {
        scores.push(node.metadata.importance);
        collect(node.children);
      });
    };

    collect(ast.mainContent);
    collect(ast.supplementary);
    collect(ast.navigation);

    if (scores.length === 0) {
      return {
        avg: 0,
        min: 0,
        max: 0,
        median: 0,
        distribution: {
          veryLow: 0,
          low: 0,
          medium: 0,
          high: 0,
          veryHigh: 0,
        },
      };
    }

    scores.sort((a, b) => a - b);

    const sum = scores.reduce((acc, val) => acc + val, 0);
    const avg = sum / scores.length;
    const min = scores[0];
    const max = scores[scores.length - 1];
    const median = scores[Math.floor(scores.length / 2)];

    const distribution = {
      veryLow: scores.filter(s => s < 0.3).length,
      low: scores.filter(s => s >= 0.3 && s < 0.5).length,
      medium: scores.filter(s => s >= 0.5 && s < 0.7).length,
      high: scores.filter(s => s >= 0.7 && s < 0.9).length,
      veryHigh: scores.filter(s => s >= 0.9).length,
    };

    return { avg, min, max, median, distribution };
  }
}
