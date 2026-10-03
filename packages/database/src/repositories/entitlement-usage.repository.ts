import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — ENTITLEMENT USAGE REPOSITORY (ENT-001)
// Concurrency-Safe Metered and Capacity Usage Tracking
// ============================================================================

import type { EntitlementUsage } from "@carhire/types";
import { ConcurrencyConflictError, RecordNotFoundError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IEntitlementUsageRepository {
  findByTenantAndFeature(
    tenantId: string,
    featureKey: string,
    periodKey?: string,
    tx?: TransactionContext
  ): Promise<EntitlementUsage | null>;
  increment(
    tenantId: string,
    featureKey: string,
    amount?: number,
    periodKey?: string,
    maxLimit?: number | null,
    tx?: TransactionContext
  ): Promise<{ usage: EntitlementUsage; allowed: boolean }>;
  decrement(
    tenantId: string,
    featureKey: string,
    amount?: number,
    periodKey?: string,
    tx?: TransactionContext
  ): Promise<EntitlementUsage>;
  record(
    tenantId: string,
    featureKey: string,
    exactValue: number,
    periodKey?: string,
    tx?: TransactionContext
  ): Promise<EntitlementUsage>;
  reconcile(
    tenantId: string,
    featureKey: string,
    authoritativeCount: number,
    periodKey?: string,
    tx?: TransactionContext
  ): Promise<EntitlementUsage>;
  listByTenant(tenantId: string, tx?: TransactionContext): Promise<EntitlementUsage[]>;
}

export class EntitlementUsageRepository implements IEntitlementUsageRepository {
  private static store = createRecordStore<string, EntitlementUsage>("entitlement-usage.repository:store");
  private static locks = new Map<string, Promise<void>>();

  private static getCompositeKey(tenantId: string, featureKey: string, periodKey: string = "CURRENT"): string {
    return `${tenantId}::${featureKey}::${periodKey}`;
  }

  // Mutex lock for atomic operations per tenant+feature in memory
  private async acquireLock(key: string): Promise<() => void> {
    while (EntitlementUsageRepository.locks.has(key)) {
      await EntitlementUsageRepository.locks.get(key);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    EntitlementUsageRepository.locks.set(key, lockPromise);
    return () => {
      EntitlementUsageRepository.locks.delete(key);
      resolveLock();
    };
  }

  async findByTenantAndFeature(
    tenantId: string,
    featureKey: string,
    periodKey: string = "CURRENT"
  ): Promise<EntitlementUsage | null> {
    const key = EntitlementUsageRepository.getCompositeKey(tenantId, featureKey, periodKey);
    const item = EntitlementUsageRepository.store.get(key);
    return item ? { ...item } : null;
  }

  async increment(
    tenantId: string,
    featureKey: string,
    amount: number = 1,
    periodKey: string = "CURRENT",
    maxLimit?: number | null
  ): Promise<{ usage: EntitlementUsage; allowed: boolean }> {
    const compositeKey = EntitlementUsageRepository.getCompositeKey(tenantId, featureKey, periodKey);
    const release = await this.acquireLock(compositeKey);

    try {
      const now = new Date().toISOString();
      const existing = EntitlementUsageRepository.store.get(compositeKey);
      const currentUsage = existing ? existing.currentUsage : 0;

      // Limit checking during atomic increment if limit provided
      if (maxLimit !== undefined && maxLimit !== null) {
        if (currentUsage + amount > maxLimit) {
          const unchangedUsage: EntitlementUsage = existing || {
            id: `use-${tenantId}-${Date.now().toString(36)}`,
            tenantId,
            featureKey,
            periodKey,
            periodStart: now,
            currentUsage: 0,
            lastIncrementAt: now,
            version: 1,
            createdAt: now,
            updatedAt: now,
          };
          return { usage: { ...unchangedUsage }, allowed: false };
        }
      }

      const newUsageAmount = currentUsage + amount;
      let record: EntitlementUsage;

      if (existing) {
        record = {
          ...existing,
          currentUsage: newUsageAmount,
          lastIncrementAt: now,
          version: (existing.version ?? 1) + 1,
          updatedAt: now,
        };
      } else {
        record = {
          id: `use-${tenantId}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          tenantId,
          featureKey,
          periodKey,
          periodStart: now,
          currentUsage: newUsageAmount,
          lastIncrementAt: now,
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
      }

      EntitlementUsageRepository.store.set(compositeKey, record);
      return { usage: { ...record }, allowed: true };
    } finally {
      release();
    }
  }

  async decrement(
    tenantId: string,
    featureKey: string,
    amount: number = 1,
    periodKey: string = "CURRENT"
  ): Promise<EntitlementUsage> {
    const compositeKey = EntitlementUsageRepository.getCompositeKey(tenantId, featureKey, periodKey);
    const release = await this.acquireLock(compositeKey);

    try {
      const now = new Date().toISOString();
      const existing = EntitlementUsageRepository.store.get(compositeKey);
      const currentUsage = existing ? existing.currentUsage : 0;
      const newUsageAmount = Math.max(0, currentUsage - amount);

      const record: EntitlementUsage = existing
        ? {
            ...existing,
            currentUsage: newUsageAmount,
            version: (existing.version ?? 1) + 1,
            updatedAt: now,
          }
        : {
            id: `use-${tenantId}-${Date.now().toString(36)}`,
            tenantId,
            featureKey,
            periodKey,
            periodStart: now,
            currentUsage: newUsageAmount,
            lastIncrementAt: now,
            version: 1,
            createdAt: now,
            updatedAt: now,
          };

      EntitlementUsageRepository.store.set(compositeKey, record);
      return { ...record };
    } finally {
      release();
    }
  }

  async record(
    tenantId: string,
    featureKey: string,
    exactValue: number,
    periodKey: string = "CURRENT"
  ): Promise<EntitlementUsage> {
    const compositeKey = EntitlementUsageRepository.getCompositeKey(tenantId, featureKey, periodKey);
    const release = await this.acquireLock(compositeKey);

    try {
      const now = new Date().toISOString();
      const existing = EntitlementUsageRepository.store.get(compositeKey);

      const record: EntitlementUsage = existing
        ? {
            ...existing,
            currentUsage: exactValue,
            lastIncrementAt: now,
            version: (existing.version ?? 1) + 1,
            updatedAt: now,
          }
        : {
            id: `use-${tenantId}-${Date.now().toString(36)}`,
            tenantId,
            featureKey,
            periodKey,
            periodStart: now,
            currentUsage: exactValue,
            lastIncrementAt: now,
            version: 1,
            createdAt: now,
            updatedAt: now,
          };

      EntitlementUsageRepository.store.set(compositeKey, record);
      return { ...record };
    } finally {
      release();
    }
  }

  async reconcile(
    tenantId: string,
    featureKey: string,
    authoritativeCount: number,
    periodKey: string = "CURRENT"
  ): Promise<EntitlementUsage> {
    return this.record(tenantId, featureKey, authoritativeCount, periodKey);
  }

  async listByTenant(tenantId: string): Promise<EntitlementUsage[]> {
    return Array.from(EntitlementUsageRepository.store.values())
      .filter((u) => u.tenantId === tenantId)
      .map((u) => ({ ...u }));
  }
}
