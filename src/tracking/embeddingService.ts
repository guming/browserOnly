import { logWithTimestamp } from '../background/utils';

/**
 * Embedding provider interface
 * This can be implemented by different embedding services
 */
export interface EmbeddingProvider {
  createEmbedding(text: string): Promise<number[]>;
  createEmbeddings(texts: string[]): Promise<number[][]>;
  getDimension(): number;
}

/**
 * Mock embedding provider for development/testing
 * Generates random embeddings
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  private dimension: number;

  constructor(dimension: number = 384) {
    this.dimension = dimension;
  }

  async createEmbedding(text: string): Promise<number[]> {
    // Generate deterministic random embedding based on text hash
    const hash = this.hashString(text);
    const random = this.seededRandom(hash);

    const embedding = Array(this.dimension)
      .fill(0)
      .map(() => random() * 2 - 1); // Values between -1 and 1

    // Normalize
    return this.normalize(embedding);
  }

  async createEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.createEmbedding(text)));
  }

  getDimension(): number {
    return this.dimension;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private seededRandom(seed: number): () => number {
    let value = seed;
    return () => {
      value = (value * 9301 + 49297) % 233280;
      return value / 233280;
    };
  }

  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map(val => val / (magnitude || 1));
  }
}

/**
 * EmbeddingService - Manages embedding creation with caching
 */
export class EmbeddingService {
  private static instance: EmbeddingService | null = null;
  private provider: EmbeddingProvider | null = null;
  private cache: Map<string, number[]>;
  private readonly maxCacheSize = 1000;

  private constructor() {
    this.cache = new Map();
    // Use mock provider by default
    this.provider = new MockEmbeddingProvider();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  /**
   * Set embedding provider
   */
  setProvider(provider: EmbeddingProvider): void {
    this.provider = provider;
    this.cache.clear(); // Clear cache when provider changes
    logWithTimestamp(`Embedding provider set to ${provider.constructor.name}`, 'log');
  }

  /**
   * Get current provider
   */
  getProvider(): EmbeddingProvider | null {
    return this.provider;
  }

  /**
   * Create embedding for single text with caching
   */
  async createEmbedding(text: string): Promise<number[]> {
    if (!this.provider) {
      throw new Error('No embedding provider set');
    }

    // Check cache
    const cacheKey = this.getCacheKey(text);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    // Create new embedding
    const embedding = await this.provider.createEmbedding(text);

    // Store in cache
    this.cacheEmbedding(cacheKey, embedding);

    return embedding;
  }

  /**
   * Create embeddings for multiple texts
   */
  async createEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.provider) {
      throw new Error('No embedding provider set');
    }

    const results: number[][] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      const cacheKey = this.getCacheKey(texts[i]);
      const cached = this.cache.get(cacheKey);

      if (cached) {
        results[i] = cached;
      } else {
        uncachedTexts.push(texts[i]);
        uncachedIndices.push(i);
      }
    }

    // Create embeddings for uncached texts
    if (uncachedTexts.length > 0) {
      const newEmbeddings = await this.provider.createEmbeddings(uncachedTexts);

      // Store in cache and results
      for (let i = 0; i < uncachedTexts.length; i++) {
        const embedding = newEmbeddings[i];
        const originalIndex = uncachedIndices[i];
        const cacheKey = this.getCacheKey(uncachedTexts[i]);

        this.cacheEmbedding(cacheKey, embedding);
        results[originalIndex] = embedding;
      }
    }

    return results;
  }

  /**
   * Get embedding dimension
   */
  getDimension(): number {
    if (!this.provider) {
      return 384; // Default dimension
    }
    return this.provider.getDimension();
  }

  /**
   * Clear embedding cache
   */
  clearCache(): void {
    this.cache.clear();
    logWithTimestamp('Embedding cache cleared', 'log');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; hitRate?: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
    };
  }

  /**
   * Generate cache key for text
   */
  private getCacheKey(text: string): string {
    // Use first 100 chars as cache key (simple approach)
    // In production, use a proper hash function
    return text.substring(0, 100);
  }

  /**
   * Store embedding in cache with LRU eviction
   */
  private cacheEmbedding(key: string, embedding: number[]): void {
    // Simple LRU: if cache is full, remove oldest entry
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, embedding);
  }
}

/**
 * Helper function to create embedding service instance
 */
export function getEmbeddingService(): EmbeddingService {
  return EmbeddingService.getInstance();
}
