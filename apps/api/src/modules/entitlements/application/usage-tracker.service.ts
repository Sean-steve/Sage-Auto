// ============================================================================
// CAR HIRE OS — USAGE TRACKER SERVICE (ENT-001 §6, §11)
// Concurrency-Safe Usage Metering & Limit Enforcement
// ============================================================================

import type { EntitlementUsage } from "@carhire/types";
import { EntitlementUsageRepository } from "@carhire/database";

export class UsageTrackerService {
  constructor(
    private readonly usageRepo: EntitlementUsageRepository = new EntitlementUsageRepository()
  ) {}

  async getUsage(
    tenantId: string,
    featureKey: string,
    periodKey: string = "CURRENT"
  ): Promise<number> {
    const record = await this.usageRepo.findByTenantAndFeature(tenantId, featureKey, periodKey);
    return record ? record.currentUsage : 0;
  }

  /**
   * Concurrency-safe atomic reservation of capacity.
   * If limit is defined, verifies that currentUsage + quantity <= limit before incrementing.
   * If limit would be exceeded, returns { success: false, currentUsage }.
   */
  async reserveCapacity(
    tenantId: string,
    featureKey: string,
    quantity: number = 1,
    limit?: number | null,
    periodKey: string = "CURRENT"
  ): Promise<{ success: boolean; usage: number; remaining?: number | null }> {
    const res = await this.usageRepo.increment(
      tenantId,
      featureKey,
      quantity,
      periodKey,
      limit
    );

    const currentUsage = res.usage.currentUsage;
    const remaining = limit !== undefined && limit !== null ? Math.max(0, limit - currentUsage) : null;

    return {
      success: res.allowed,
      usage: currentUsage,
      remaining,
    };
  }

  async releaseCapacity(
    tenantId: string,
    featureKey: string,
    quantity: number = 1,
    periodKey: string = "CURRENT"
  ): Promise<number> {
    const updated = await this.usageRepo.decrement(tenantId, featureKey, quantity, periodKey);
    return updated.currentUsage;
  }

  async reconcileUsage(
    tenantId: string,
    featureKey: string,
    actualCount: number,
    periodKey: string = "CURRENT"
  ): Promise<EntitlementUsage> {
    return this.usageRepo.reconcile(tenantId, featureKey, actualCount, periodKey);
  }

  async listTenantUsage(tenantId: string): Promise<EntitlementUsage[]> {
    return this.usageRepo.listByTenant(tenantId);
  }
}
