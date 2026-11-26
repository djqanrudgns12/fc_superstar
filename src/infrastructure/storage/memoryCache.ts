/* ================================================================
   L1 IN-MEMORY CACHE
   Zero-I/O hot read cache with TTL, size cap, and version invalidation.
   ================================================================ */

import type { CacheStats } from './types';

interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
  version: number;
}

export class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private version = 0;
  private hits = 0;
  private misses = 0;
  private readonly maxEntries: number;

  constructor(maxEntries = 128) {
    this.maxEntries = maxEntries;
  }

  public get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (entry.version !== this.version) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }

    // Refresh LRU order
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits++;
    return entry.value as T;
  }

  public set<T>(key: string, value: T, ttlMs?: number): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      // Evict oldest entry (Map preserves insertion order)
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }

    this.store.set(key, {
      value,
      expiresAt: ttlMs !== undefined ? Date.now() + ttlMs : null,
      version: this.version,
    });
  }

  public getOrCompute<T>(key: string, compute: () => T, ttlMs?: number): T {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }
    const computed = compute();
    this.set(key, computed, ttlMs);
    return computed;
  }

  /** Invalidates all cached values atomically on any state mutation */
  public invalidateAll(): void {
    this.version++;
    this.store.clear();
  }

  public resetMetrics(): void {
    this.hits = 0;
    this.misses = 0;
  }

  public getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      entries: this.store.size,
      hitRate: total > 0 ? Math.round((this.hits / total) * 100) : 100,
    };
  }
}
