import { KnowledgeMetaData, Document } from './knowledgeMetaData';
import { logWithTimestamp } from '../background/utils';

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same dimension");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Calculate cosine distance (1 - similarity)
 * Used by RD-Agent's scipy.spatial.distance.cosine
 */
export function cosineDistance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
}

/**
 * Row in the vector dataframe
 */
interface VectorRow {
  id: string;
  label: string;
  content: string;
  trunk: string;
  embedding: number[];
}

/**
 * VectorBase - Abstract base class for vector storage
 * Equivalent to RD-Agent's VectorBase
 */
export abstract class VectorBase {
  /**
   * Add document(s) to the vector store
   */
  abstract add(document: Document | Document[]): Promise<void>;

  /**
   * Search for similar documents
   */
  abstract search(
    content: string,
    topK?: number | null,
    similarityThreshold?: number,
    constraintLabels?: string[] | null
  ): Promise<[Document[], number[]]>;

  /**
   * Get the size/shape of the vector store
   */
  abstract shape(): [number, number];

  /**
   * Clear all data
   */
  abstract clear(): void;
}

/**
 * In-memory VectorBase implementation using array (similar to Pandas DataFrame)
 * Equivalent to RD-Agent's PDVectorBase
 */
export class MemoryVectorBase extends VectorBase {
  private vectorData: VectorRow[];

  constructor() {
    super();
    this.vectorData = [];
  }

  /**
   * Get shape of the vector store [rows, columns]
   */
  shape(): [number, number] {
    return [this.vectorData.length, 5]; // 5 columns: id, label, content, trunk, embedding
  }

  /**
   * Add document(s) to the vector store
   * Each document can have multiple rows (one for full content + one per trunk)
   */
  async add(document: Document | Document[]): Promise<void> {
    if (Array.isArray(document)) {
      // Add multiple documents
      for (const doc of document) {
        await this.add(doc);
      }
      return;
    }

    // Ensure document has embedding
    if (document.embedding === null) {
      logWithTimestamp(`Document ${document.id} has no embedding, skipping`, 'warn');
      return;
    }

    // Add main document row
    const mainRow: VectorRow = {
      id: document.id,
      label: document.label,
      content: document.content,
      trunk: document.content,
      embedding: document.embedding,
    };
    this.vectorData.push(mainRow);

    // Add trunk rows if they exist
    if (document.trunks.length > 0 && document.trunksEmbedding.length > 0) {
      for (let i = 0; i < document.trunks.length; i++) {
        const trunkRow: VectorRow = {
          id: document.id,
          label: document.label,
          content: document.content,
          trunk: document.trunks[i],
          embedding: document.trunksEmbedding[i],
        };
        this.vectorData.push(trunkRow);
      }
    }

    logWithTimestamp(
      `Added document ${document.id} with ${1 + document.trunks.length} rows`,
      'log'
    );
  }

  /**
   * Search for similar documents using cosine similarity
   * Returns both documents and their similarity scores
   */
  async search(
    content: string,
    topK: number | null = null,
    similarityThreshold: number = 0.0,
    constraintLabels: string[] | null = null
  ): Promise<[Document[], number[]]> {
    if (this.vectorData.length === 0) {
      return [[], []];
    }

    // Create a temporary document for the query
    const queryDoc = new KnowledgeMetaData(content);

    // Note: In real usage, you need to create embedding for queryDoc
    // This is a placeholder - the caller should ensure the embedding exists
    if (queryDoc.embedding === null) {
      logWithTimestamp('Query document has no embedding', 'warn');
      return [[], []];
    }

    // Filter by labels if specified
    let filteredData = this.vectorData;
    if (constraintLabels !== null && constraintLabels.length > 0) {
      filteredData = this.vectorData.filter(row =>
        constraintLabels.includes(row.label)
      );
    }

    if (filteredData.length === 0) {
      return [[], []];
    }

    // Calculate similarities (using 1 - cosine_distance like RD-Agent)
    const similarities = filteredData.map(row => {
      return 1 - cosineDistance(row.embedding, queryDoc.embedding!);
    });

    // Filter by threshold and create index-value pairs
    const indexedSimilarities = similarities
      .map((score, index) => ({ index, score }))
      .filter(item => item.score > similarityThreshold);

    // Sort by score descending
    indexedSimilarities.sort((a, b) => b.score - a.score);

    // Take top-k if specified
    const topResults = topK !== null
      ? indexedSimilarities.slice(0, topK)
      : indexedSimilarities;

    // Build result documents
    const docs: Document[] = [];
    const scores: number[] = [];

    for (const { index, score } of topResults) {
      const row = filteredData[index];

      // Create document from row
      const doc = new KnowledgeMetaData();
      doc.fromDict({
        id: row.id,
        label: row.label,
        content: row.content,
        embedding: row.embedding,
      });

      docs.push(doc);
      scores.push(score);
    }

    return [docs, scores];
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.vectorData = [];
    logWithTimestamp('VectorBase cleared', 'log');
  }

  /**
   * Get all documents (for debugging/inspection)
   */
  getAllRows(): VectorRow[] {
    return [...this.vectorData];
  }

  /**
   * Get unique document IDs
   */
  getUniqueDocumentIds(): string[] {
    const ids = new Set(this.vectorData.map(row => row.id));
    return Array.from(ids);
  }

  /**
   * Get all unique labels
   */
  getUniqueLabels(): string[] {
    const labels = new Set(this.vectorData.map(row => row.label));
    return Array.from(labels);
  }

  /**
   * Remove a document by ID
   */
  removeDocument(docId: string): void {
    this.vectorData = this.vectorData.filter(row => row.id !== docId);
    logWithTimestamp(`Removed document ${docId}`, 'log');
  }

  /**
   * Get document by ID (returns first matching row)
   */
  getDocumentById(docId: string): Document | null {
    const row = this.vectorData.find(r => r.id === docId);
    if (!row) return null;

    const doc = new KnowledgeMetaData();
    doc.fromDict({
      id: row.id,
      label: row.label,
      content: row.content,
      embedding: row.embedding,
    });

    return doc;
  }

  /**
   * Count documents (unique IDs)
   */
  countDocuments(): number {
    return this.getUniqueDocumentIds().length;
  }

  /**
   * Export data for persistence
   */
  exportData(): VectorRow[] {
    return this.vectorData.map(row => ({ ...row }));
  }

  /**
   * Import data from persistence
   */
  importData(data: VectorRow[]): void {
    this.vectorData = data.map(row => ({ ...row }));
    logWithTimestamp(`Imported ${data.length} rows`, 'log');
  }
}

/**
 * Helper function to create embeddings with a provided function
 * This mimics the embedding creation pattern in RD-Agent
 */
export async function createEmbedding(
  content: string | string[],
  embeddingFn: (texts: string[]) => Promise<number[][]>
): Promise<number[] | number[][]> {
  if (typeof content === 'string') {
    const embeddings = await embeddingFn([content]);
    return embeddings[0];
  } else {
    return await embeddingFn(content);
  }
}
