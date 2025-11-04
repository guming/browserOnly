/**
 * Type definitions for Vector Database functionality
 *
 * This file defines the core types used throughout the vector database system.
 */

/**
 * Vector document stored in the database
 */
export interface VectorDocument {
  /** Auto-generated database ID */
  id?: number;
  /** Name of the collection this document belongs to */
  collectionName: string;
  /** Unique identifier for the document within the collection */
  documentId: string;
  /** Text content of the document */
  content: string;
  /** Vector embedding of the document */
  embedding: number[];
  /** Optional metadata associated with the document */
  metadata?: Record<string, unknown>;
  /** Timestamp when the document was created */
  createdAt: number;
  /** Timestamp when the document was last updated */
  updatedAt: number;
}

/**
 * Collection metadata
 */
export interface VectorCollection {
  /** Unique name of the collection */
  name: string;
  /** Dimension of embeddings in this collection (e.g., 384, 768, 1536) */
  dimension: number;
  /** Number of documents in the collection */
  documentCount: number;
  /** Timestamp when the collection was created */
  createdAt: number;
  /** Timestamp when the collection was last updated */
  updatedAt: number;
}

/**
 * Search result with similarity score
 */
export interface SearchResult {
  /** Unique identifier of the document */
  documentId: string;
  /** Text content of the document */
  content: string;
  /** Optional metadata associated with the document */
  metadata?: Record<string, unknown>;
  /** Cosine similarity score (0-1, higher is more similar) */
  score: number;
}

/**
 * Parameters for creating a vector collection
 */
export interface CreateCollectionParams {
  /** Name of the collection to create */
  collectionName: string;
  /** Dimension of embeddings that will be stored */
  dimension: number;
}

/**
 * Parameters for storing a vector document
 */
export interface StoreVectorParams {
  /** Name of the collection to store in */
  collectionName: string;
  /** Unique identifier for the document */
  documentId: string;
  /** Text content of the document */
  content: string;
  /** Vector embedding (must match collection dimension) */
  embedding: number[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for searching vectors
 */
export interface SearchVectorParams {
  /** Name of the collection to search in */
  collectionName: string;
  /** Query embedding vector */
  queryEmbedding: number[];
  /** Number of results to return (default: 5) */
  topK?: number;
  /** Minimum similarity score threshold (default: 0.0) */
  minScore?: number;
}

/**
 * Parameters for getting a specific document
 */
export interface GetDocumentParams {
  /** Name of the collection */
  collectionName: string;
  /** ID of the document to retrieve */
  documentId: string;
}

/**
 * Parameters for deleting a document
 */
export interface DeleteDocumentParams {
  /** Name of the collection */
  collectionName: string;
  /** ID of the document to delete */
  documentId: string;
}

/**
 * Embedding provider interface
 * Can be extended to support different embedding models
 */
export interface EmbeddingProvider {
  /** Name of the embedding provider (e.g., "openai", "sentence-transformers") */
  providerName: string;
  /** Dimension of embeddings produced by this provider */
  dimension: number;
  /** Generate embedding for a single text */
  embed(text: string): Promise<number[]>;
  /** Generate embeddings for multiple texts */
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * Common embedding model dimensions
 */
export enum EmbeddingDimension {
  /** Sentence Transformers mini models */
  MINI_LM = 384,
  /** Sentence Transformers base models */
  BASE = 768,
  /** OpenAI text-embedding-ada-002 */
  OPENAI_ADA = 1536,
  /** OpenAI text-embedding-3-small */
  OPENAI_SMALL = 1536,
  /** OpenAI text-embedding-3-large */
  OPENAI_LARGE = 3072,
  /** Cohere embed models */
  COHERE_SMALL = 1024,
  /** Cohere embed models large */
  COHERE_LARGE = 4096,
}

/**
 * Vector database statistics
 */
export interface VectorDatabaseStats {
  /** Total number of collections */
  totalCollections: number;
  /** Total number of documents across all collections */
  totalDocuments: number;
  /** Estimated storage size in bytes */
  estimatedSize: number;
  /** List of all collections with their stats */
  collections: Array<{
    name: string;
    dimension: number;
    documentCount: number;
  }>;
}

/**
 * Error types for vector database operations
 */
export enum VectorDatabaseErrorType {
  COLLECTION_NOT_FOUND = "COLLECTION_NOT_FOUND",
  COLLECTION_ALREADY_EXISTS = "COLLECTION_ALREADY_EXISTS",
  DOCUMENT_NOT_FOUND = "DOCUMENT_NOT_FOUND",
  DIMENSION_MISMATCH = "DIMENSION_MISMATCH",
  INVALID_EMBEDDING = "INVALID_EMBEDDING",
  STORAGE_ERROR = "STORAGE_ERROR",
  INVALID_PARAMETERS = "INVALID_PARAMETERS",
}

/**
 * Custom error class for vector database operations
 */
export class VectorDatabaseError extends Error {
  constructor(
    public type: VectorDatabaseErrorType,
    message: string
  ) {
    super(message);
    this.name = "VectorDatabaseError";
  }
}
