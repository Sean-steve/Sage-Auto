// ============================================================================
// CAR HIRE OS — AUTHORIZATION CACHE SERVICE (DEV-005 §32-34)
// High-performance permission cache with Redis/In-Memory abstraction.
// Invariant: Optimization only; Database is authoritative; Never fails open.
// ============================================================================

export interface CachedAuthorization {
  roles: string[];
  permissions: string[];
  isOwner: boolean;
  cachedAt: number;
  version: number;
}

export interface IAuthorizationCacheService {
  get(tenantId: string, membershipId: string): Promise<CachedAuthorization | null>;
  set(tenantId: string, membershipId: string, data: CachedAuthorization, ttlSeconds?: number): Promise<void>;
  invalidate(tenantId: string, membershipId: string): Promise<void>;
  invalidateTenant(tenantId: string): Promise<void>;
  simulateFailure(shouldFail: boolean): void;
}

export class InMemoryAuthorizationCacheService implements IAuthorizationCacheService {
  private cache: Map<string, { data: CachedAuthorization; expiresAt: number }> = new Map();
  private simulatedOutage = false;

  private makeKey(tenantId: string, membershipId: string): string {
    return `authz:${tenantId}:${membershipId}`;
  }

  simulateFailure(shouldFail: boolean): void {
    this.simulatedOutage = shouldFail;
  }

  async get(tenantId: string, membershipId: string): Promise<CachedAuthorization | null> {
    if (this.simulatedOutage) {
      throw new Error("Redis cluster connection timeout (Simulated Cache Outage)");
    }

    const key = this.makeKey(tenantId, membershipId);
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return { ...entry.data, roles: [...entry.data.roles], permissions: [...entry.data.permissions] };
  }

  async set(
    tenantId: string,
    membershipId: string,
    data: CachedAuthorization,
    ttlSeconds = 300
  ): Promise<void> {
    if (this.simulatedOutage) {
      // Cache outage shouldn't crash set operations in fallback mode, but can log warning
      return;
    }

    const key = this.makeKey(tenantId, membershipId);
    this.cache.set(key, {
      data: { ...data, roles: [...data.roles], permissions: [...data.permissions] },
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async invalidate(tenantId: string, membershipId: string): Promise<void> {
    const key = this.makeKey(tenantId, membershipId);
    this.cache.delete(key);
  }

  async invalidateTenant(tenantId: string): Promise<void> {
    const prefix = `authz:${tenantId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}
