import { logWithTimestamp } from '../background/utils';

/**
 * Cached page content with metadata
 */
export interface CachedPageContent {
  url: string;
  title: string;
  fullText: string;
  sections: PageSection[];
  metadata: {
    extractedAt: number;
    pageHash: string;
    wordCount: number;
    hasHeadings: boolean;
  };
}

/**
 * Page section with structure information
 */
export interface PageSection {
  heading: string;
  level: number;
  content: string;
  xpath: string;
  position: number;
  wordCount: number;
}

/**
 * Cache entry with TTL
 */
interface CacheEntry {
  data: CachedPageContent;
  expiresAt: number;
}

/**
 * ContentCacheService - Manages caching of extracted page content
 * Provides in-memory caching with TTL and IndexedDB persistence
 */
export class ContentCacheService {
  private static instance: ContentCacheService | null = null;
  private memoryCache: Map<string, CacheEntry>;
  private readonly dbName = "BrowserBeeContentCache";
  private readonly dbVersion = 1;
  private readonly storeName = "pageContent";
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes
  private db: IDBDatabase | null = null;

  private constructor() {
    this.memoryCache = new Map();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ContentCacheService {
    if (!ContentCacheService.instance) {
      ContentCacheService.instance = new ContentCacheService();
    }
    return ContentCacheService.instance;
  }

  /**
   * Initialize IndexedDB
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        logWithTimestamp("Failed to open content cache database", "error");
        reject(new Error("Failed to open content cache database"));
      };

      request.onsuccess = () => {
        this.db = request.result;
        logWithTimestamp("Content cache database opened successfully");
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, {
            keyPath: "pageHash",
          });
          store.createIndex("url", "url", { unique: false });
          store.createIndex("expiresAt", "expiresAt", { unique: false });
        }

        logWithTimestamp("Content cache schema created");
      };
    });
  }

  /**
   * Generate hash for URL
   */
  hashUrl(url: string): string {
    // Simple hash function - in production, use crypto.subtle.digest
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `page_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Get cached content by URL
   */
  async get(url: string): Promise<CachedPageContent | null> {
    const pageHash = this.hashUrl(url);

    // Check memory cache first
    const memEntry = this.memoryCache.get(pageHash);
    if (memEntry) {
      if (Date.now() < memEntry.expiresAt) {
        logWithTimestamp(`[Cache HIT - Memory] ${url}`, 'log');
        return memEntry.data;
      } else {
        // Expired
        this.memoryCache.delete(pageHash);
      }
    }

    // Check IndexedDB
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve) => {
        const request = store.get(pageHash);

        request.onsuccess = () => {
          const entry = request.result as CacheEntry | undefined;

          if (entry && Date.now() < entry.expiresAt) {
            // Cache hit - restore to memory
            this.memoryCache.set(pageHash, entry);
            logWithTimestamp(`[Cache HIT - IndexedDB] ${url}`, 'log');
            resolve(entry.data);
          } else {
            // Expired or not found
            if (entry) {
              this.delete(url); // Clean up expired entry
            }
            logWithTimestamp(`[Cache MISS] ${url}`, 'log');
            resolve(null);
          }
        };

        request.onerror = () => {
          logWithTimestamp(`Error reading cache for ${url}`, 'error');
          resolve(null);
        };
      });
    } catch (error) {
      logWithTimestamp(`Cache read error: ${error}`, 'error');
      return null;
    }
  }

  /**
   * Set cached content for URL
   */
  async set(
    url: string,
    content: CachedPageContent,
    ttl: number = this.defaultTTL
  ): Promise<void> {
    const pageHash = this.hashUrl(url);
    const expiresAt = Date.now() + ttl;

    const entry: CacheEntry = {
      data: content,
      expiresAt,
    };

    // Store in memory cache
    this.memoryCache.set(pageHash, entry);

    // Store in IndexedDB
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.put({
          pageHash,
          url,
          ...entry,
        });

        request.onsuccess = () => {
          logWithTimestamp(`[Cache STORED] ${url} (expires in ${ttl / 1000}s)`, 'log');
          resolve();
        };

        request.onerror = () => {
          logWithTimestamp(`Failed to store cache for ${url}`, 'error');
          reject(new Error("Failed to store cache"));
        };
      });
    } catch (error) {
      logWithTimestamp(`Cache write error: ${error}`, 'error');
    }
  }

  /**
   * Delete cached content for URL
   */
  async delete(url: string): Promise<void> {
    const pageHash = this.hashUrl(url);

    // Remove from memory cache
    this.memoryCache.delete(pageHash);

    // Remove from IndexedDB
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve) => {
        const request = store.delete(pageHash);

        request.onsuccess = () => {
          logWithTimestamp(`[Cache DELETED] ${url}`, 'log');
          resolve();
        };

        request.onerror = () => {
          logWithTimestamp(`Failed to delete cache for ${url}`, 'error');
          resolve(); // Don't fail on delete errors
        };
      });
    } catch (error) {
      logWithTimestamp(`Cache delete error: ${error}`, 'error');
    }
  }

  /**
   * Clear all expired entries
   */
  async clearExpired(): Promise<number> {
    const now = Date.now();
    let deletedCount = 0;

    // Clear from memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now >= entry.expiresAt) {
        this.memoryCache.delete(key);
        deletedCount++;
      }
    }

    // Clear from IndexedDB
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);
      const index = store.index("expiresAt");

      return new Promise((resolve) => {
        const request = index.openCursor();

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

          if (cursor) {
            const entry = cursor.value as CacheEntry;
            if (now >= entry.expiresAt) {
              cursor.delete();
              deletedCount++;
            }
            cursor.continue();
          } else {
            logWithTimestamp(`[Cache CLEANUP] Deleted ${deletedCount} expired entries`, 'log');
            resolve(deletedCount);
          }
        };

        request.onerror = () => {
          logWithTimestamp('Error during cache cleanup', 'error');
          resolve(deletedCount);
        };
      });
    } catch (error) {
      logWithTimestamp(`Cache cleanup error: ${error}`, 'error');
      return deletedCount;
    }
  }

  /**
   * Clear all cached content
   */
  async clear(): Promise<void> {
    // Clear memory cache
    this.memoryCache.clear();

    // Clear IndexedDB
    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve) => {
        const request = store.clear();

        request.onsuccess = () => {
          logWithTimestamp('[Cache CLEARED] All cache entries deleted', 'log');
          resolve();
        };

        request.onerror = () => {
          logWithTimestamp('Error clearing cache', 'error');
          resolve();
        };
      });
    } catch (error) {
      logWithTimestamp(`Cache clear error: ${error}`, 'error');
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    memoryCacheSize: number;
    dbCacheSize: number;
    totalSize: number;
  }> {
    const memoryCacheSize = this.memoryCache.size;

    try {
      const db = await this.initDB();
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve) => {
        const request = store.count();

        request.onsuccess = () => {
          const dbCacheSize = request.result;
          resolve({
            memoryCacheSize,
            dbCacheSize,
            totalSize: memoryCacheSize + dbCacheSize,
          });
        };

        request.onerror = () => {
          resolve({
            memoryCacheSize,
            dbCacheSize: 0,
            totalSize: memoryCacheSize,
          });
        };
      });
    } catch (error) {
      return {
        memoryCacheSize,
        dbCacheSize: 0,
        totalSize: memoryCacheSize,
      };
    }
  }

  /**
   * Check if content is stale (older than threshold)
   */
  isStale(content: CachedPageContent, threshold: number = this.defaultTTL): boolean {
    const age = Date.now() - content.metadata.extractedAt;
    return age > threshold;
  }
}
