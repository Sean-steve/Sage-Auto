import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — ENTITLEMENT OVERRIDE REPOSITORY (ENT-001)
// Auditable Admin Overrides for Tenant Capability Exceptions
// ============================================================================

import type { EntitlementOverride, CreateEntitlementOverrideDto } from "@carhire/types";
import { RecordNotFoundError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IEntitlementOverrideRepository {
  findById(id: string, tx?: TransactionContext): Promise<EntitlementOverride | null>;
  findByTenantId(tenantId: string, tx?: TransactionContext): Promise<EntitlementOverride[]>;
  findActiveByTenantAndFeatureKey(tenantId: string, featureKey: string, now?: Date, tx?: TransactionContext): Promise<EntitlementOverride | null>;
  create(tenantId: string, actorId: string, dto: CreateEntitlementOverrideDto, tx?: TransactionContext): Promise<EntitlementOverride>;
  revoke(id: string, tx?: TransactionContext): Promise<EntitlementOverride>;
  listAll(tx?: TransactionContext): Promise<EntitlementOverride[]>;
}

export class EntitlementOverrideRepository implements IEntitlementOverrideRepository {
  private static store = createRecordStore<string, EntitlementOverride>("entitlement-override.repository:store");

  async findById(id: string): Promise<EntitlementOverride | null> {
    const item = EntitlementOverrideRepository.store.get(id);
    return item ? { ...item } : null;
  }

  async findByTenantId(tenantId: string): Promise<EntitlementOverride[]> {
    return Array.from(EntitlementOverrideRepository.store.values())
      .filter((o) => o.tenantId === tenantId)
      .map((o) => ({ ...o }));
  }

  async findActiveByTenantAndFeatureKey(
    tenantId: string,
    featureKey: string,
    now: Date = new Date()
  ): Promise<EntitlementOverride | null> {
    const nowIso = now.toISOString();
    for (const o of EntitlementOverrideRepository.store.values()) {
      if (
        o.tenantId === tenantId &&
        o.featureKey === featureKey &&
        o.status === "ACTIVE"
      ) {
        // Check effective dates
        if (o.effectiveFrom && o.effectiveFrom > nowIso) {
          continue;
        }
        if (o.effectiveTo && o.effectiveTo < nowIso) {
          continue;
        }
        return { ...o };
      }
    }
    return null;
  }

  async create(
    tenantId: string,
    actorId: string,
    dto: CreateEntitlementOverrideDto
  ): Promise<EntitlementOverride> {
    const now = new Date().toISOString();
    const id = `ovr-${tenantId}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    // If an existing active override exists for this tenant & feature, revoke it first
    for (const [existingId, o] of EntitlementOverrideRepository.store.entries()) {
      if (o.tenantId === tenantId && o.featureKey === dto.featureKey && o.status === "ACTIVE") {
        EntitlementOverrideRepository.store.set(existingId, {
          ...o,
          status: "REVOKED",
          updatedAt: now,
        });
      }
    }

    const newOverride: EntitlementOverride = {
      id,
      tenantId,
      featureId: `feat-${dto.featureKey.replace(/\./g, "-")}`,
      featureKey: dto.featureKey,
      enabled: dto.enabled ?? true,
      limitValue: dto.limitValue ?? null,
      isUnlimited: dto.isUnlimited ?? false,
      reason: dto.reason,
      createdBy: actorId,
      status: "ACTIVE",
      effectiveFrom: dto.effectiveFrom || now,
      effectiveTo: dto.effectiveTo || null,
      createdAt: now,
      updatedAt: now,
    };

    EntitlementOverrideRepository.store.set(id, newOverride);
    return { ...newOverride };
  }

  async revoke(id: string): Promise<EntitlementOverride> {
    const existing = EntitlementOverrideRepository.store.get(id);
    if (!existing) {
      throw new RecordNotFoundError("EntitlementOverride", id);
    }
    const updated: EntitlementOverride = {
      ...existing,
      status: "REVOKED",
      updatedAt: new Date().toISOString(),
    };
    EntitlementOverrideRepository.store.set(id, updated);
    return { ...updated };
  }

  async listAll(): Promise<EntitlementOverride[]> {
    return Array.from(EntitlementOverrideRepository.store.values()).map((o) => ({ ...o }));
  }
}
