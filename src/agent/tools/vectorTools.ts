import type { Page } from "playwright-crx";
import { logWithTimestamp } from '../../background/utils';
import { VectorService } from '../../tracking/vectorService';

/**
 * Create a new vector collection
 *
 * Input format: JSON with collectionName and dimension
 * Example: {"collectionName": "my_documents", "dimension": 384}
 */
export function createVectorCollection(page: Page) {
  return {
    name: "vector_create_collection",
    description: "Create a new vector collection to store embeddings. You must specify the collection name and embedding dimension (e.g., 384 for sentence transformers, 1536 for OpenAI embeddings). Use this before storing any vectors.",
    func: async (input: string): Promise<string> => {
      try {
        const inputObj = JSON.parse(input);
        const { collectionName, dimension } = inputObj;

        if (!collectionName || !dimension) {
          return "Error: Missing required fields. Please provide collectionName and dimension.";
        }

        if (typeof dimension !== 'number' || dimension <= 0) {
          return "Error: Dimension must be a positive number.";
        }

        const vectorService = VectorService.getInstance();
        await vectorService.createCollection(collectionName, dimension);

        return `Vector collection '${collectionName}' created successfully with dimension ${dimension}.`;
      } catch (error) {
        logWithTimestamp(`Error creating vector collection: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error creating vector collection: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * List all vector collections
 */
export function listVectorCollections(page: Page) {
  return {
    name: "vector_list_collections",
    description: "List all vector collections with their metadata (name, dimension, document count, timestamps). Use this to see what collections are available.",
    func: async (): Promise<string> => {
      try {
        const vectorService = VectorService.getInstance();
        const collections = await vectorService.listCollections();

        if (collections.length === 0) {
          return "No vector collections found.";
        }

        return JSON.stringify(collections.map(c => ({
          name: c.name,
          dimension: c.dimension,
          documentCount: c.documentCount,
          createdAt: new Date(c.createdAt).toISOString(),
          updatedAt: new Date(c.updatedAt).toISOString()
        })), null, 2);
      } catch (error) {
        logWithTimestamp(`Error listing vector collections: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error listing vector collections: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * Delete a vector collection and all its documents
 *
 * Input: collection name as a string
 */
export function deleteVectorCollection(page: Page) {
  return {
    name: "vector_delete_collection",
    description: "Delete a vector collection and all its documents. This operation is irreversible. Input should be the collection name as a string.",
    func: async (input: string): Promise<string> => {
      try {
        const collectionName = input.trim();

        if (!collectionName) {
          return "Error: Please provide a collection name.";
        }

        const vectorService = VectorService.getInstance();
        await vectorService.deleteCollection(collectionName);

        return `Vector collection '${collectionName}' and all its documents deleted successfully.`;
      } catch (error) {
        logWithTimestamp(`Error deleting vector collection: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error deleting vector collection: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * Store a document with its embedding vector
 *
 * Input format: JSON with collectionName, documentId, content, embedding, and optional metadata
 * Example: {
 *   "collectionName": "my_docs",
 *   "documentId": "doc123",
 *   "content": "This is the document text",
 *   "embedding": [0.1, 0.2, 0.3, ...],
 *   "metadata": {"source": "web", "url": "https://example.com"}
 * }
 */
export function storeVector(page: Page) {
  return {
    name: "vector_store",
    description: "Store a document with its embedding vector in a collection. Requires collectionName, documentId, content (text), embedding (array of numbers), and optional metadata (object). If a document with the same ID exists, it will be updated.",
    func: async (input: string): Promise<string> => {
      try {
        const inputObj = JSON.parse(input);
        const { collectionName, documentId, content, embedding, metadata } = inputObj;

        if (!collectionName || !documentId || !content || !embedding) {
          return "Error: Missing required fields. Please provide collectionName, documentId, content, and embedding.";
        }

        if (!Array.isArray(embedding)) {
          return "Error: Embedding must be an array of numbers.";
        }

        if (embedding.some(val => typeof val !== 'number')) {
          return "Error: All embedding values must be numbers.";
        }

        const vectorService = VectorService.getInstance();
        const id = await vectorService.storeDocument(
          collectionName,
          documentId,
          content,
          embedding,
          metadata
        );

        return `Document '${documentId}' stored successfully in collection '${collectionName}' with ID ${id}.`;
      } catch (error) {
        logWithTimestamp(`Error storing vector: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error storing vector: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * Search for similar documents using vector similarity
 *
 * Input format: JSON with collectionName, queryEmbedding, topK (optional, default 5), and minScore (optional, default 0.0)
 * Example: {
 *   "collectionName": "my_docs",
 *   "queryEmbedding": [0.1, 0.2, 0.3, ...],
 *   "topK": 10,
 *   "minScore": 0.5
 * }
 */
export function searchVectors(page: Page) {
  return {
    name: "vector_search",
    description: "Search for similar documents using cosine similarity. Requires collectionName and queryEmbedding (array of numbers). Optional: topK (number of results, default 5) and minScore (minimum similarity score 0-1, default 0.0). Returns documents with similarity scores.",
    func: async (input: string): Promise<string> => {
      try {
        const inputObj = JSON.parse(input);
        const { collectionName, queryEmbedding, topK, minScore } = inputObj;

        console.log('vector_search',queryEmbedding, inputObj)

        if (!collectionName || !queryEmbedding) {
          return "Error: Missing required fields. Please provide collectionName and queryEmbedding.";
        }

        if (!Array.isArray(queryEmbedding)) {
          return "Error: queryEmbedding must be an array of numbers.";
        }

        if (queryEmbedding.some(val => typeof val !== 'number')) {
          return "Error: All queryEmbedding values must be numbers.";
        }

        const k = topK || 5;
        const threshold = minScore || 0.0;

        const vectorService = VectorService.getInstance();
        const results = await vectorService.searchSimilar(
          collectionName,
          queryEmbedding,
          k,
          threshold
        );

        if (results.length === 0) {
          return `No similar documents found in collection '${collectionName}'.`;
        }

        return JSON.stringify(results.map(r => ({
          documentId: r.documentId,
          content: r.content,
          score: r.score.toFixed(4),
          metadata: r.metadata
        })), null, 2);
      } catch (error) {
        logWithTimestamp(`Error searching vectors: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error searching vectors: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * Get a specific document by ID
 *
 * Input format: JSON with collectionName and documentId
 * Example: {"collectionName": "my_docs", "documentId": "doc123"}
 */
export function getVectorDocument(page: Page) {
  return {
    name: "vector_get_document",
    description: "Retrieve a specific document by its ID from a collection. Requires collectionName and documentId. Returns the full document including content, embedding, and metadata.",
    func: async (input: string): Promise<string> => {
      try {
        const inputObj = JSON.parse(input);
        const { collectionName, documentId } = inputObj;

        if (!collectionName || !documentId) {
          return "Error: Missing required fields. Please provide collectionName and documentId.";
        }

        const vectorService = VectorService.getInstance();
        const document = await vectorService.getDocument(collectionName, documentId);

        if (!document) {
          return `Document '${documentId}' not found in collection '${collectionName}'.`;
        }

        return JSON.stringify({
          documentId: document.documentId,
          content: document.content,
          metadata: document.metadata,
          embeddingDimension: document.embedding.length,
          createdAt: new Date(document.createdAt).toISOString(),
          updatedAt: new Date(document.updatedAt).toISOString()
        }, null, 2);
      } catch (error) {
        logWithTimestamp(`Error getting document: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error getting document: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * Delete a specific document from a collection
 *
 * Input format: JSON with collectionName and documentId
 * Example: {"collectionName": "my_docs", "documentId": "doc123"}
 */
export function deleteVectorDocument(page: Page) {
  return {
    name: "vector_delete_document",
    description: "Delete a specific document from a collection. Requires collectionName and documentId. This operation is irreversible.",
    func: async (input: string): Promise<string> => {
      try {
        const inputObj = JSON.parse(input);
        const { collectionName, documentId } = inputObj;

        if (!collectionName || !documentId) {
          return "Error: Missing required fields. Please provide collectionName and documentId.";
        }

        const vectorService = VectorService.getInstance();
        await vectorService.deleteDocument(collectionName, documentId);

        return `Document '${documentId}' deleted successfully from collection '${collectionName}'.`;
      } catch (error) {
        logWithTimestamp(`Error deleting document: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error deleting document: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * List all documents in a collection
 *
 * Input: collection name as a string
 */
export function listVectorDocuments(page: Page) {
  return {
    name: "vector_list_documents",
    description: "List all documents in a collection with their metadata (excluding full embeddings for brevity). Input should be the collection name as a string.",
    func: async (input: string): Promise<string> => {
      try {
        const collectionName = input.trim();

        if (!collectionName) {
          return "Error: Please provide a collection name.";
        }

        const vectorService = VectorService.getInstance();
        const documents = await vectorService.getDocumentsByCollection(collectionName);

        if (documents.length === 0) {
          return `No documents found in collection '${collectionName}'.`;
        }

        return JSON.stringify(documents.map(doc => ({
          documentId: doc.documentId,
          content: doc.content.substring(0, 100) + (doc.content.length > 100 ? '...' : ''),
          metadata: doc.metadata,
          embeddingDimension: doc.embedding.length,
          createdAt: new Date(doc.createdAt).toISOString(),
          updatedAt: new Date(doc.updatedAt).toISOString()
        })), null, 2);
      } catch (error) {
        logWithTimestamp(`Error listing documents: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error listing documents: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}

/**
 * Clear all vector data (collections and documents)
 */
export function clearAllVectorData(page: Page) {
  return {
    name: "vector_clear_all",
    description: "Clear all vector collections and documents from the database. This operation is irreversible and should be used with extreme caution. No input required.",
    func: async (): Promise<string> => {
      try {
        const vectorService = VectorService.getInstance();
        await vectorService.clearAll();

        return "All vector data cleared successfully.";
      } catch (error) {
        logWithTimestamp(`Error clearing vector data: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return `Error clearing vector data: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  };
}
