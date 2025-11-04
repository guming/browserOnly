import { logWithTimestamp } from '../background/utils';
import type { PageAST } from './domAST';

/**
 * Cache entry with TTL
 */
interface ASTCacheEntry {
  data: PageAST;
  expiresAt: number;
  url: string;
}

/**
 * ASTCacheService - Manages caching of parsed DOM AST
 * Provides in-memory caching with TTL for expensive AST parsing operations
 */
export class ASTCacheService {
  private static instance: ASTCacheService | null = null;
  private memoryCache: Map<string, ASTCacheEntry>;
  private readonly defaultTTL = 3 * 60 * 1000; // 3 minutes (AST parsing is expensive, cache longer)
  private readonly maxCacheSize = 50; // Maximum number of cached ASTs

  private constructor() {
    this.memoryCache = new Map();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ASTCacheService {
    if (!ASTCacheService.instance) {
      ASTCacheService.instance = new ASTCacheService();
    }
    return ASTCacheService.instance;
  }

  /**
   * Generate cache key from URL and content hash
   */
  private getCacheKey(url: string, contentHash?: string): string {
    // Use URL and optional content hash for cache key
    const base = url.split('#')[0].split('?')[0]; // Remove hash and query params
    return contentHash ? `${base}:${contentHash}` : base;
  }

  /**
   * Generate simple content hash from page HTML
   */
  private async generateContentHash(html: string): Promise<string> {
    // Simple hash - for better performance, could use crypto.subtle.digest
    let hash = 0;
    const sampleSize = Math.min(html.length, 10000); // Sample first 10k chars
    for (let i = 0; i < sampleSize; i++) {
      const char = html.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get cached AST by URL
   */
  async get(url: string, currentContentHash?: string): Promise<PageAST | null> {
    const cacheKey = this.getCacheKey(url, currentContentHash);

    // Check memory cache
    const entry = this.memoryCache.get(cacheKey);
    if (entry) {
      if (Date.now() < entry.expiresAt) {
        logWithTimestamp(`[AST Cache HIT] ${url}`, 'log');
        return entry.data;
      } else {
        // Expired
        this.memoryCache.delete(cacheKey);
        logWithTimestamp(`[AST Cache EXPIRED] ${url}`, 'log');
      }
    }

    // Try without content hash if provided
    if (currentContentHash) {
      const baseKey = this.getCacheKey(url);
      const baseEntry = this.memoryCache.get(baseKey);
      if (baseEntry && Date.now() < baseEntry.expiresAt) {
        logWithTimestamp(`[AST Cache HIT - Base URL] ${url}`, 'log');
        return baseEntry.data;
      }
    }

    logWithTimestamp(`[AST Cache MISS] ${url}`, 'log');
    return null;
  }

  /**
   * Set cached AST for URL
   */
  async set(
    url: string,
    ast: PageAST,
    contentHash?: string,
    ttl: number = this.defaultTTL
  ): Promise<void> {
    const cacheKey = this.getCacheKey(url, contentHash);
    const expiresAt = Date.now() + ttl;

    const entry: ASTCacheEntry = {
      data: ast,
      expiresAt,
      url,
    };

    // Enforce max cache size (LRU eviction)
    if (this.memoryCache.size >= this.maxCacheSize) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey) {
        this.memoryCache.delete(firstKey);
        logWithTimestamp(`[AST Cache EVICTED] ${firstKey} (max size reached)`, 'log');
      }
    }

    // Store in memory cache
    this.memoryCache.set(cacheKey, entry);
    logWithTimestamp(
      `[AST Cache STORED] ${url} (expires in ${ttl / 1000}s, size: ${this.memoryCache.size})`,
      'log'
    );
  }

  /**
   * Delete cached AST for URL
   */
  delete(url: string): void {
    const baseKey = this.getCacheKey(url);

    // Delete all entries for this URL (base + any content hash variants)
    const keysToDelete: string[] = [];
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.url === url || key.startsWith(baseKey)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.memoryCache.delete(key);
      logWithTimestamp(`[AST Cache DELETED] ${key}`, 'log');
    });
  }

  /**
   * Clear all expired entries
   */
  clearExpired(): number {
    const now = Date.now();
    let deletedCount = 0;

    for (const [key, entry] of this.memoryCache.entries()) {
      if (now >= entry.expiresAt) {
        this.memoryCache.delete(key);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logWithTimestamp(`[AST Cache CLEANUP] Deleted ${deletedCount} expired entries`, 'log');
    }

    return deletedCount;
  }

  /**
   * Clear all cached ASTs
   */
  clear(): void {
    const size = this.memoryCache.size;
    this.memoryCache.clear();
    logWithTimestamp(`[AST Cache CLEARED] Deleted ${size} entries`, 'log');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    entries: Array<{ url: string; expiresIn: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.memoryCache.values()).map(entry => ({
      url: entry.url,
      expiresIn: Math.max(0, Math.round((entry.expiresAt - now) / 1000)),
    }));

    return {
      size: this.memoryCache.size,
      maxSize: this.maxCacheSize,
      entries,
    };
  }

  /**
   * Check if AST is cached for URL
   */
  has(url: string): boolean {
    const baseKey = this.getCacheKey(url);
    return Array.from(this.memoryCache.keys()).some(key =>
      key === baseKey || key.startsWith(`${baseKey}:`)
    );
  }
}
