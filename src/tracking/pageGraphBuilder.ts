import type { Page } from "playwright-crx";
import { UndirectedGraph, UndirectedNode } from './knowledgeGraph';
import { CachedPageContent } from './contentCacheService';
import { EmbeddingService } from './embeddingService';
import { logWithTimestamp } from '../background/utils';

/**
 * Build a knowledge graph from page content
 * Nodes represent sections, edges represent structural relationships
 */
export async function buildPageContentGraph(
  content: CachedPageContent,
  embeddingService?: EmbeddingService
): Promise<UndirectedGraph> {
  const embService = embeddingService || EmbeddingService.getInstance();

  // Create embedding function
  const embeddingFn = async (texts: string[]) => {
    return await embService.createEmbeddings(texts);
  };

  const graph = new UndirectedGraph(embeddingFn);

  // Create nodes for each section
  const sectionNodes: UndirectedNode[] = [];

  for (const section of content.sections) {
    const node = new UndirectedNode(
      section.content,
      `heading-${section.level}`,
      null,
      {
        heading: section.heading,
        url: content.url,
        xpath: section.xpath,
        position: section.position,
        wordCount: section.wordCount
      }
    );

    sectionNodes.push(node);
    await graph.addNode(node);
  }

  // Create edges based on document structure
  // Connect sections based on heading hierarchy and proximity
  for (let i = 0; i < sectionNodes.length; i++) {
    const currentSection = content.sections[i];
    const currentNode = sectionNodes[i];

    // Connect to parent section (previous section with lower heading level)
    for (let j = i - 1; j >= 0; j--) {
      const prevSection = content.sections[j];
      const prevNode = sectionNodes[j];

      if (prevSection.level < currentSection.level) {
        // This is a parent section
        await graph.addNode(currentNode, prevNode);
        break;
      }
    }

    // Connect to next section (sibling or child)
    if (i < sectionNodes.length - 1) {
      const nextSection = content.sections[i + 1];
      const nextNode = sectionNodes[i + 1];

      // Connect if same level (sibling) or next level down (child)
      if (nextSection.level >= currentSection.level) {
        await graph.addNode(currentNode, nextNode);
      }
    }
  }

  logWithTimestamp(
    `Built page content graph with ${graph.size()} nodes for ${content.url}`,
    'log'
  );

  return graph;
}

/**
 * Extract key concepts from page content
 */
export function extractConcepts(content: CachedPageContent): Array<{
  text: string;
  context: string;
  section: string;
}> {
  const concepts: Array<{
    text: string;
    context: string;
    section: string;
  }> = [];

  // Extract concepts from headings (these are usually key topics)
  for (const section of content.sections) {
    if (section.heading && section.heading !== 'Main Content') {
      concepts.push({
        text: section.heading,
        context: section.content.substring(0, 200),
        section: section.heading
      });
    }

    // Extract potential concepts from content
    // Look for capitalized phrases, technical terms, etc.
    const words = section.content.split(/\s+/);
    const potentialConcepts: string[] = [];

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // Look for capitalized words (potential proper nouns/concepts)
      if (/^[A-Z][a-z]+/.test(word)) {
        // Check if followed by more capitalized words (multi-word concept)
        let concept = word;
        let j = i + 1;

        while (j < words.length && /^[A-Z][a-z]+/.test(words[j])) {
          concept += ' ' + words[j];
          j++;
        }

        if (concept.split(' ').length >= 2 || concept.length > 4) {
          potentialConcepts.push(concept);
          i = j - 1; // Skip the words we already processed
        }
      }
    }

    // Add unique concepts
    const uniqueConcepts = [...new Set(potentialConcepts)];

    for (const concept of uniqueConcepts) {
      // Get context around the concept
      const index = section.content.indexOf(concept);
      const contextStart = Math.max(0, index - 50);
      const contextEnd = Math.min(section.content.length, index + concept.length + 50);
      const context = section.content.substring(contextStart, contextEnd);

      concepts.push({
        text: concept,
        context,
        section: section.heading
      });
    }
  }

  return concepts;
}

/**
 * Build multi-page knowledge graph
 * Connects concepts across multiple pages
 */
export class MultiPageKnowledgeGraph {
  private graph: UndirectedGraph;
  private embeddingService: EmbeddingService;
  private conceptSimilarityThreshold = 0.95;

  constructor(embeddingService?: EmbeddingService) {
    this.embeddingService = embeddingService || EmbeddingService.getInstance();

    const embeddingFn = async (texts: string[]) => {
      return await this.embeddingService.createEmbeddings(texts);
    };

    this.graph = new UndirectedGraph(embeddingFn);
  }

  /**
   * Add a page to the knowledge graph
   */
  async addPage(content: CachedPageContent): Promise<void> {
    const concepts = extractConcepts(content);

    for (const concept of concepts) {
      const node = new UndirectedNode(
        concept.text,
        'concept',
        null,
        {
          url: content.url,
          context: concept.context,
          section: concept.section,
          timestamp: content.metadata.extractedAt
        }
      );

      // Check if this concept already exists (across pages)
      const existing = await this.graph.semanticSearch(
        concept.text,
        this.conceptSimilarityThreshold,
        1
      );

      if (existing.length > 0) {
        // Link to existing concept (cross-page connection)
        await this.graph.addNode(node, existing[0]);
      } else {
        // New concept
        await this.graph.addNode(node);
      }
    }

    logWithTimestamp(
      `Added ${concepts.length} concepts from ${content.url} to multi-page graph`,
      'log'
    );
  }

  /**
   * Find all pages that mention a concept
   */
  async findRelatedPages(query: string): Promise<string[]> {
    const nodes = await this.graph.semanticSearch(query, 0.7, 20);

    const urls = new Set(
      nodes.map(n => (n.appendix as any)?.url).filter(Boolean)
    );

    return Array.from(urls);
  }

  /**
   * Find path between two concepts
   */
  async findConceptPath(concept1: string, concept2: string): Promise<string[]> {
    const node1 = await this.graph.getNodeByContent(concept1);
    const node2 = await this.graph.getNodeByContent(concept2);

    if (!node1 || !node2) {
      return [];
    }

    // Get nodes within 5 steps of node1
    const path = await this.graph.getNodesWithinSteps(node1, 5);

    if (path.some(n => n.id === node2.id)) {
      return path.map(n => n.content);
    }

    return [];
  }

  /**
   * Get the underlying graph
   */
  getGraph(): UndirectedGraph {
    return this.graph;
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    totalConcepts: number;
    totalPages: number;
    avgConceptsPerPage: number;
  } {
    const nodes = this.graph.getAllNodes() as UndirectedNode[];
    const urls = new Set(
      nodes.map(n => (n.appendix as any)?.url).filter(Boolean)
    );

    return {
      totalConcepts: nodes.length,
      totalPages: urls.size,
      avgConceptsPerPage: urls.size > 0 ? nodes.length / urls.size : 0
    };
  }
}

// Singleton instance for multi-page knowledge graph
let multiPageGraphInstance: MultiPageKnowledgeGraph | null = null;

/**
 * Get singleton instance of multi-page knowledge graph
 */
export function getMultiPageGraph(): MultiPageKnowledgeGraph {
  if (!multiPageGraphInstance) {
    multiPageGraphInstance = new MultiPageKnowledgeGraph();
  }
  return multiPageGraphInstance;
}
