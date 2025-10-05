/**
 * GraphQL Query Cache and Memoization Module
 * Provides caching for queries, responses, and schema introspection
 */

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  hits: number;
}

export interface CacheOptions {
  maxSize?: number;
  maxAge?: number; // in milliseconds
  enabled?: boolean;
}

export class GraphQLCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly maxAge: number;
  private readonly enabled: boolean;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize || 1000;
    this.maxAge = options.maxAge || 5 * 60 * 1000; // 5 minutes default
    this.enabled = options.enabled !== false;
  }

  /**
   * Generate cache key from query and variables
   */
  private generateKey(
    query: string,
    variables?: Record<string, unknown>,
  ): string {
    const variablesStr = variables
      ? JSON.stringify(this.sortObject(variables))
      : "";
    return `${query}:${variablesStr}`;
  }

  /**
   * Sort object keys for consistent cache key generation
   */
  private sortObject(obj: Record<string, unknown>): Record<string, unknown> {
    return Object.keys(obj)
      .sort()
      .reduce(
        (result, key) => {
          const value = obj[key];
          result[key] =
            value && typeof value === "object" && !Array.isArray(value)
              ? this.sortObject(value as Record<string, unknown>)
              : value;
          return result;
        },
        {} as Record<string, unknown>,
      );
  }

  /**
   * Check if cache entry is still valid
   */
  private isValid(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp < this.maxAge;
  }

  /**
   * Evict oldest entries when cache is full
   */
  private evictOldest(): void {
    if (this.cache.size < this.maxSize) return;

    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Get cached value
   */
  get(query: string, variables?: Record<string, unknown>): T | null {
    if (!this.enabled) return null;

    const key = this.generateKey(query, variables);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (!this.isValid(entry)) {
      this.cache.delete(key);
      return null;
    }

    entry.hits++;
    return entry.value;
  }

  /**
   * Set cached value
   */
  set(query: string, value: T, variables?: Record<string, unknown>): void {
    if (!this.enabled) return;

    this.evictOldest();

    const key = this.generateKey(query, variables);
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * Check if value exists in cache
   */
  has(query: string, variables?: Record<string, unknown>): boolean {
    if (!this.enabled) return false;

    const key = this.generateKey(query, variables);
    const entry = this.cache.get(key);

    if (!entry) return false;

    if (!this.isValid(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    maxAge: number;
    entries: Array<{ key: string; hits: number; age: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      hits: entry.hits,
      age: now - entry.timestamp,
    }));

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      maxAge: this.maxAge,
      entries,
    };
  }
}

/**
 * Request options cache for optimizing variable substitution
 */
export class RequestOptionsCache {
  private cache = new Map<string, Record<string, unknown>>();

  /**
   * Cache parsed request options
   */
  set(key: string, options: Record<string, unknown>): void {
    this.cache.set(key, options);
  }

  /**
   * Get cached request options
   */
  get(key: string): Record<string, unknown> | null {
    return this.cache.get(key) || null;
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Schema introspection cache
 */
export class SchemaCache extends GraphQLCache<any> {
  constructor() {
    // Schema rarely changes, so longer TTL
    super({
      maxSize: 100,
      maxAge: 60 * 60 * 1000, // 1 hour
    });
  }
}

// Export singleton instances
export const responseCache = new GraphQLCache({
  maxSize: 1000,
  maxAge: 5 * 60 * 1000, // 5 minutes
});

export const schemaCache = new SchemaCache();

export const requestOptionsCache = new RequestOptionsCache();
