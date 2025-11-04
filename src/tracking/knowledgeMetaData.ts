import { v5 as uuidv5 } from 'uuid';
import { logWithTimestamp } from '../background/utils';

// UUID namespace for deterministic ID generation
const KNOWLEDGE_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace

/**
 * KnowledgeMetaData - Base class for knowledge nodes
 * Equivalent to RD-Agent's KnowledgeMetaData/Document class
 */
export class KnowledgeMetaData {
  public id: string;
  public content: string;
  public label: string;
  public embedding: number[] | null;
  public trunks: string[];
  public trunksEmbedding: number[][];

  constructor(
    content: string = "",
    label: string = "",
    embedding: number[] | null = null,
    identity?: string
  ) {
    this.content = content;
    this.label = label;
    this.embedding = embedding;
    this.trunks = [];
    this.trunksEmbedding = [];

    // Generate deterministic UUID based on content
    if (identity !== undefined) {
      this.id = identity;
    } else {
      this.id = uuidv5(content, KNOWLEDGE_NAMESPACE);
    }
  }

  /**
   * Split content into chunks/trunks for better processing
   * Similar to RD-Agent's split_into_trunk
   */
  splitIntoTrunks(size: number = 1000, overlap: number = 0): void {
    const chunks: string[] = [];
    const step = size - overlap;

    for (let i = 0; i < this.content.length; i += step) {
      const chunk = this.content.slice(i, i + size);
      chunks.push(chunk);
    }

    this.trunks = chunks;
    logWithTimestamp(`Split content into ${chunks.length} trunks`, 'log');
  }

  /**
   * Create embedding for the content
   * Note: This is a placeholder - actual embedding generation should be implemented
   * by the LLM provider (OpenAI, etc.)
   */
  async createEmbedding(embeddingFn?: (text: string) => Promise<number[]>): Promise<void> {
    if (this.embedding !== null) {
      return; // Already has embedding
    }

    if (!embeddingFn) {
      logWithTimestamp('No embedding function provided', 'warn');
      return;
    }

    try {
      this.embedding = await embeddingFn(this.content);
      logWithTimestamp(`Created embedding for content (dim: ${this.embedding.length})`, 'log');
    } catch (error) {
      logWithTimestamp(`Error creating embedding: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Create embeddings for all trunks
   */
  async createTrunksEmbeddings(embeddingFn: (texts: string[]) => Promise<number[][]>): Promise<void> {
    if (this.trunks.length === 0) {
      logWithTimestamp('No trunks to create embeddings for', 'warn');
      return;
    }

    try {
      this.trunksEmbedding = await embeddingFn(this.trunks);
      logWithTimestamp(`Created embeddings for ${this.trunks.length} trunks`, 'log');
    } catch (error) {
      logWithTimestamp(`Error creating trunk embeddings: ${error}`, 'error');
      throw error;
    }
  }

  /**
   * Create from a dictionary/object
   */
  fromDict(data: Partial<KnowledgeMetaData>): KnowledgeMetaData {
    Object.assign(this, data);
    return this;
  }

  /**
   * Convert to plain object for serialization
   */
  toDict(): Record<string, unknown> {
    return {
      id: this.id,
      content: this.content,
      label: this.label,
      embedding: this.embedding,
      trunks: this.trunks,
      trunksEmbedding: this.trunksEmbedding,
    };
  }

  toString(): string {
    return `KnowledgeMetaData(id=${this.id}, label=${this.label}, content=${this.content.substring(0, 100)}...)`;
  }

  repr(): string {
    return this.toString();
  }
}

// Export as Document alias (like RD-Agent)
export type Document = KnowledgeMetaData;

/**
 * Helper function to convert contents to documents with embeddings
 */
export async function contentsToDocuments(
  contents: string[],
  label: string = "",
  embeddingFn?: (texts: string[]) => Promise<number[][]>
): Promise<Document[]> {
  if (!embeddingFn) {
    // Create documents without embeddings
    return contents.map(content => new KnowledgeMetaData(content, label));
  }

  // Batch create embeddings (size 16 like RD-Agent)
  const batchSize = 16;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < contents.length; i += batchSize) {
    const batch = contents.slice(i, i + batchSize);
    const embeddings = await embeddingFn(batch);
    allEmbeddings.push(...embeddings);
  }

  // Create documents with embeddings
  return contents.map((content, index) =>
    new KnowledgeMetaData(content, label, allEmbeddings[index])
  );
}
