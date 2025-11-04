import { logWithTimestamp } from '../background/utils';

/**
 * Vector document stored in the database
 */
export interface VectorDocument {
  id?: number;
  collectionName: string;
  documentId: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/**
 * Collection metadata
 */
export interface VectorCollection {
  name: string;
  dimension: number;
  documentCount: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Search result with similarity score
 */
export interface SearchResult {
  documentId: string;
  content: string;
  metadata?: Record<string, unknown>;
  score: number;
}

/**
 * VectorService - Manages vector storage and similarity search using IndexedDB
 * This service provides a custom vector database implementation for browser automation.
 */
export class VectorService {
  private static instance: VectorService | null = null;
  private db: IDBDatabase | null = null;
  private readonly dbName = "BrowserBeeVectorDB";
  private readonly dbVersion = 1;
  private readonly documentsStore = "documents";
  private readonly collectionsStore = "collections";

  private constructor() {}

  /**
   * Get singleton instance of VectorService
   */
  public static getInstance(): VectorService {
    if (!VectorService.instance) {
      VectorService.instance = new VectorService();
    }
    return VectorService.instance;
  }

  /**
   * Initialize the IndexedDB database
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        logWithTimestamp("Failed to open vector database", "error");
        reject(new Error("Failed to open vector database"));
      };

      request.onsuccess = () => {
        this.db = request.result;
        logWithTimestamp("Vector database opened successfully");
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create documents store
        if (!db.objectStoreNames.contains(this.documentsStore)) {
          const documentsStore = db.createObjectStore(this.documentsStore, {
            keyPath: "id",
            autoIncrement: true,
          });
          documentsStore.createIndex("collectionName", "collectionName", { unique: false });
          documentsStore.createIndex("documentId", "documentId", { unique: false });
          documentsStore.createIndex("collectionDocId", ["collectionName", "documentId"], { unique: true });
        }

        // Create collections store
        if (!db.objectStoreNames.contains(this.collectionsStore)) {
          db.createObjectStore(this.collectionsStore, {
            keyPath: "name",
          });
        }

        logWithTimestamp("Vector database schema created");
      };
    });
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
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
   * Create or update a collection
   */
  async createCollection(name: string, dimension: number): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction([this.collectionsStore], "readwrite");
    const store = transaction.objectStore(this.collectionsStore);

    const collection: VectorCollection = {
      name,
      dimension,
      documentCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const request = store.put(collection);

      request.onsuccess = () => {
        logWithTimestamp(`Collection '${name}' created successfully`);
        resolve();
      };

      request.onerror = () => {
        logWithTimestamp(`Failed to create collection '${name}'`, "error");
        reject(new Error(`Failed to create collection '${name}'`));
      };
    });
  }

  /**
   * Get collection metadata
   */
  async getCollection(name: string): Promise<VectorCollection | null> {
    const db = await this.initDB();
    const transaction = db.transaction([this.collectionsStore], "readonly");
    const store = transaction.objectStore(this.collectionsStore);

    return new Promise((resolve, reject) => {
      const request = store.get(name);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get collection '${name}'`));
      };
    });
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<VectorCollection[]> {
    const db = await this.initDB();
    const transaction = db.transaction([this.collectionsStore], "readonly");
    const store = transaction.objectStore(this.collectionsStore);

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error("Failed to list collections"));
      };
    });
  }

  /**
   * Delete a collection and all its documents
   */
  async deleteCollection(name: string): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction([this.collectionsStore, this.documentsStore], "readwrite");
    const collectionsStore = transaction.objectStore(this.collectionsStore);
    const documentsStore = transaction.objectStore(this.documentsStore);

    // Delete all documents in the collection
    const index = documentsStore.index("collectionName");
    const range = IDBKeyRange.only(name);

    return new Promise((resolve, reject) => {
      const documentRequest = index.openCursor(range);
      const documentsToDelete: IDBValidKey[] = [];

      documentRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          documentsToDelete.push(cursor.primaryKey);
          cursor.continue();
        } else {
          // Delete all documents
          documentsToDelete.forEach((key) => documentsStore.delete(key));

          // Delete the collection
          const collectionRequest = collectionsStore.delete(name);

          collectionRequest.onsuccess = () => {
            logWithTimestamp(`Collection '${name}' and ${documentsToDelete.length} documents deleted`);
            resolve();
          };

          collectionRequest.onerror = () => {
            reject(new Error(`Failed to delete collection '${name}'`));
          };
        }
      };

      documentRequest.onerror = () => {
        reject(new Error(`Failed to delete documents from collection '${name}'`));
      };
    });
  }

  /**
   * Store or update a document with its embedding
   */
  async storeDocument(
    collectionName: string,
    documentId: string,
    content: string,
    embedding: number[],
    metadata?: Record<string, unknown>
  ): Promise<number> {
    const db = await this.initDB();

    // Check if collection exists and validate dimension
    const collection = await this.getCollection(collectionName);
    if (!collection) {
      throw new Error(`Collection '${collectionName}' does not exist. Create it first.`);
    }

    if (embedding.length !== collection.dimension) {
      throw new Error(
        `Embedding dimension (${embedding.length}) does not match collection dimension (${collection.dimension})`
      );
    }

    const transaction = db.transaction([this.documentsStore, this.collectionsStore], "readwrite");
    const documentsStore = transaction.objectStore(this.documentsStore);
    const collectionsStore = transaction.objectStore(this.collectionsStore);

    // Check if document already exists
    const index = documentsStore.index("collectionDocId");
    const existingRequest = index.get([collectionName, documentId]);

    return new Promise((resolve, reject) => {
      existingRequest.onsuccess = () => {
        const existing = existingRequest.result;
        const now = Date.now();

        const document: VectorDocument = {
          collectionName,
          documentId,
          content,
          embedding,
          metadata,
          createdAt: existing ? existing.createdAt : now,
          updatedAt: now,
        };

        if (existing) {
          document.id = existing.id;
        }

        const storeRequest = documentsStore.put(document);

        storeRequest.onsuccess = () => {
          // Update collection document count if new document
          if (!existing) {
            const collectionRequest = collectionsStore.get(collectionName);
            collectionRequest.onsuccess = () => {
              const coll = collectionRequest.result as VectorCollection;
              coll.documentCount += 1;
              coll.updatedAt = now;
              collectionsStore.put(coll);
            };
          }

          const id = storeRequest.result as number;
          logWithTimestamp(`Document '${documentId}' stored in collection '${collectionName}'`);
          resolve(id);
        };

        storeRequest.onerror = () => {
          reject(new Error(`Failed to store document '${documentId}'`));
        };
      };

      existingRequest.onerror = () => {
        reject(new Error(`Failed to check existing document '${documentId}'`));
      };
    });
  }

  /**
   * Search for similar documents using cosine similarity
   */
  async searchSimilar(
    collectionName: string,
    queryEmbedding: number[],
    topK: number = 5,
    minScore: number = 0.0
  ): Promise<SearchResult[]> {
    const db = await this.initDB();

    // Validate collection
    const collection = await this.getCollection(collectionName);
    if (!collection) {
      throw new Error(`Collection '${collectionName}' does not exist`);
    }

    if (queryEmbedding.length !== collection.dimension) {
      throw new Error(
        `Query embedding dimension (${queryEmbedding.length}) does not match collection dimension (${collection.dimension})`
      );
    }

    const transaction = db.transaction([this.documentsStore], "readonly");
    const store = transaction.objectStore(this.documentsStore);
    const index = store.index("collectionName");
    const range = IDBKeyRange.only(collectionName);

    return new Promise((resolve, reject) => {
      const request = index.getAll(range);

      request.onsuccess = () => {
        const documents = request.result as VectorDocument[];

        // Calculate similarity scores
        const results: SearchResult[] = documents
          .map((doc) => ({
            documentId: doc.documentId,
            content: doc.content,
            metadata: doc.metadata,
            score: this.cosineSimilarity(queryEmbedding, doc.embedding),
          }))
          .filter((result) => result.score >= minScore)
          .sort((a, b) => b.score - a.score)
          .slice(0, topK);

        logWithTimestamp(`Found ${results.length} similar documents in collection '${collectionName}'`);
        resolve(results);
      };

      request.onerror = () => {
        reject(new Error(`Failed to search in collection '${collectionName}'`));
      };
    });
  }

  /**
   * Get a specific document by ID
   */
  async getDocument(collectionName: string, documentId: string): Promise<VectorDocument | null> {
    const db = await this.initDB();
    const transaction = db.transaction([this.documentsStore], "readonly");
    const store = transaction.objectStore(this.documentsStore);
    const index = store.index("collectionDocId");

    return new Promise((resolve, reject) => {
      const request = index.get([collectionName, documentId]);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get document '${documentId}'`));
      };
    });
  }

  /**
   * Delete a specific document
   */
  async deleteDocument(collectionName: string, documentId: string): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction([this.documentsStore, this.collectionsStore], "readwrite");
    const documentsStore = transaction.objectStore(this.documentsStore);
    const collectionsStore = transaction.objectStore(this.collectionsStore);
    const index = documentsStore.index("collectionDocId");

    return new Promise((resolve, reject) => {
      const request = index.getKey([collectionName, documentId]);

      request.onsuccess = () => {
        const key = request.result;
        if (!key) {
          reject(new Error(`Document '${documentId}' not found in collection '${collectionName}'`));
          return;
        }

        const deleteRequest = documentsStore.delete(key);

        deleteRequest.onsuccess = () => {
          // Update collection document count
          const collectionRequest = collectionsStore.get(collectionName);
          collectionRequest.onsuccess = () => {
            const coll = collectionRequest.result as VectorCollection;
            coll.documentCount = Math.max(0, coll.documentCount - 1);
            coll.updatedAt = Date.now();
            collectionsStore.put(coll);
          };

          logWithTimestamp(`Document '${documentId}' deleted from collection '${collectionName}'`);
          resolve();
        };

        deleteRequest.onerror = () => {
          reject(new Error(`Failed to delete document '${documentId}'`));
        };
      };

      request.onerror = () => {
        reject(new Error(`Failed to find document '${documentId}'`));
      };
    });
  }

  /**
   * Get all documents in a collection
   */
  async getDocumentsByCollection(collectionName: string): Promise<VectorDocument[]> {
    const db = await this.initDB();
    const transaction = db.transaction([this.documentsStore], "readonly");
    const store = transaction.objectStore(this.documentsStore);
    const index = store.index("collectionName");
    const range = IDBKeyRange.only(collectionName);

    return new Promise((resolve, reject) => {
      const request = index.getAll(range);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get documents from collection '${collectionName}'`));
      };
    });
  }

  /**
   * Clear all data from the database
   */
  async clearAll(): Promise<void> {
    const db = await this.initDB();
    const transaction = db.transaction([this.documentsStore, this.collectionsStore], "readwrite");
    const documentsStore = transaction.objectStore(this.documentsStore);
    const collectionsStore = transaction.objectStore(this.collectionsStore);

    return new Promise((resolve, reject) => {
      const documentsRequest = documentsStore.clear();
      const collectionsRequest = collectionsStore.clear();

      let completed = 0;
      const checkComplete = () => {
        completed++;
        if (completed === 2) {
          logWithTimestamp("All vector database data cleared");
          resolve();
        }
      };

      documentsRequest.onsuccess = checkComplete;
      collectionsRequest.onsuccess = checkComplete;

      documentsRequest.onerror = () => reject(new Error("Failed to clear documents"));
      collectionsRequest.onerror = () => reject(new Error("Failed to clear collections"));
    });
  }
}
