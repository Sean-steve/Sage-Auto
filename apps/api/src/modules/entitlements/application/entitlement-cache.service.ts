// ============================================================================
// CAR HIRE OS — ENTITLEMENT CACHE SERVICE (ENT-001 §7)
// High-Performance Entitlement Cache with Proactive Invalidation
// ============================================================================

import type { EntitlementDecision } from "@carhire/types";

interface CacheEntry {
  decision: EntitlementDecision;
  expiresAt: number;
}

export class EntitlementCacheService {
  private cache = new Map<string, CacheEntry>();
  private defaultTtlMs: number;

  constructor(defaultTtlSeconds: number = 60) {
    this.defaultTtlMs = defaultTtlSeconds * 1000;
  }

  private buildKey(tenantId: string, featureKey: string): string {
    return `ent:${tenantId}:${featureKey}`;
  }

  get(tenantId: string, featureKey: string): EntitlementDecision | null {
    try {
      const key = this.buildKey(tenantId, featureKey);
      const entry = this.cache.get(key);
      if (!entry) return null;

      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        return null;
      }

      return { ...entry.decision };
    } catch {
      // In the event of cache error, return null to force DB evaluation (never fail open)
      return null;
    }
  }

  set(tenantId: string, featureKey: string, decision: EntitlementDecision, ttlSeconds?: number): void {
    try {
      const key = this.buildKey(tenantId, featureKey);
      const ttl = (ttlSeconds !== undefined ? ttlSeconds * 1000 : this.defaultTtlMs);
      this.cache.set(key, {
        decision: { ...decision },
        expiresAt: Date.now() + ttl,
      });
    } catch {
      // Cache set failure is non-fatal
    }
  }

  invalidate(tenantId: string, featureKey?: string): void {
    try {
      if (featureKey) {
        this.cache.delete(this.buildKey(tenantId, featureKey));
      } else {
        // Invalidate all keys for tenant
        const prefix = `ent:${tenantId}:`;
        for (const k of this.cache.keys()) {
          if (k.startsWith(prefix)) {
            this.cache.delete(k);
          }
        }
      }
    } catch {
      // Invalidate failure is handled
    }
  }

  invalidateGlobal(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}
