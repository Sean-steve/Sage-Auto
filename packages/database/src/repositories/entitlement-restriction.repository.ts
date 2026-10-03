import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — ENTITLEMENT RESTRICTION REPOSITORY (ENT-001)
// Platform & Tenant-Level Capability Restrictions
// ============================================================================

import type { EntitlementRestriction, CreateEntitlementRestrictionDto } from "@carhire/types";
import { RecordNotFoundError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IEntitlementRestrictionRepository {
  findById(id: string, tx?: TransactionContext): Promise<EntitlementRestriction | null>;
  findActivePlatformRestriction(featureKey: string, now?: Date, tx?: TransactionContext): Promise<EntitlementRestriction | null>;
  findActiveTenantRestriction(tenantId: string, featureKey: string, now?: Date, tx?: TransactionContext): Promise<EntitlementRestriction | null>;
  listActive(scope?: "PLATFORM" | "TENANT", tenantId?: string, tx?: TransactionContext): Promise<EntitlementRestriction[]>;
  create(dto: CreateEntitlementRestrictionDto, actorId: string, tx?: TransactionContext): Promise<EntitlementRestriction>;
  lift(id: string, tx?: TransactionContext): Promise<EntitlementRestriction>;
  listAll(tx?: TransactionContext): Promise<EntitlementRestriction[]>;
}

export class EntitlementRestrictionRepository implements IEntitlementRestrictionRepository {
  private static store = createRecordStore<string, EntitlementRestriction>("entitlement-restriction.repository:store");

  async findById(id: string): Promise<EntitlementRestriction | null> {
    const item = EntitlementRestrictionRepository.store.get(id);
    return item ? { ...item } : null;
  }

  async findActivePlatformRestriction(
    featureKey: string,
    now: Date = new Date()
  ): Promise<EntitlementRestriction | null> {
    const nowIso = now.toISOString();
    for (const r of EntitlementRestrictionRepository.store.values()) {
      if (r.scope === "PLATFORM" && r.featureKey === featureKey && r.status === "ACTIVE") {
        if (r.effectiveFrom && r.effectiveFrom > nowIso) continue;
        if (r.effectiveTo && r.effectiveTo < nowIso) continue;
        return { ...r };
      }
    }
    return null;
  }

  async findActiveTenantRestriction(
    tenantId: string,
    featureKey: string,
    now: Date = new Date()
  ): Promise<EntitlementRestriction | null> {
    const nowIso = now.toISOString();
    for (const r of EntitlementRestrictionRepository.store.values()) {
      if (
        r.scope === "TENANT" &&
        r.tenantId === tenantId &&
        r.featureKey === featureKey &&
        r.status === "ACTIVE"
      ) {
        if (r.effectiveFrom && r.effectiveFrom > nowIso) continue;
        if (r.effectiveTo && r.effectiveTo < nowIso) continue;
        return { ...r };
      }
    }
    return null;
  }

  async listActive(
    scope?: "PLATFORM" | "TENANT",
    tenantId?: string
  ): Promise<EntitlementRestriction[]> {
    const nowIso = new Date().toISOString();
    return Array.from(EntitlementRestrictionRepository.store.values()).filter((r) => {
      if (r.status !== "ACTIVE") return false;
      if (r.effectiveFrom && r.effectiveFrom > nowIso) return false;
      if (r.effectiveTo && r.effectiveTo < nowIso) return false;
      if (scope && r.scope !== scope) return false;
      if (tenantId && r.tenantId !== tenantId) return false;
      return true;
    }).map((r) => ({ ...r }));
  }

  async create(
    dto: CreateEntitlementRestrictionDto,
    actorId: string
  ): Promise<EntitlementRestriction> {
    const now = new Date().toISOString();
    const id = `rst-${dto.scope.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;

    const newRestriction: EntitlementRestriction = {
      id,
      tenantId: dto.tenantId,
      scope: dto.scope,
      featureKey: dto.featureKey,
      restrictionType: dto.restrictionType || "BLOCK",
      enforcedLimit: dto.enforcedLimit ?? null,
      reason: dto.reason,
      imposedBy: actorId,
      status: "ACTIVE",
      effectiveFrom: dto.effectiveFrom || now,
      effectiveTo: dto.effectiveTo || null,
      createdAt: now,
      updatedAt: now,
    };

    EntitlementRestrictionRepository.store.set(id, newRestriction);
    return { ...newRestriction };
  }

  async lift(id: string): Promise<EntitlementRestriction> {
    const existing = EntitlementRestrictionRepository.store.get(id);
    if (!existing) {
      throw new RecordNotFoundError("EntitlementRestriction", id);
    }
    const updated: EntitlementRestriction = {
      ...existing,
      status: "LIFTED",
      updatedAt: new Date().toISOString(),
    };
    EntitlementRestrictionRepository.store.set(id, updated);
    return { ...updated };
  }

  async listAll(): Promise<EntitlementRestriction[]> {
    return Array.from(EntitlementRestrictionRepository.store.values()).map((r) => ({ ...r }));
  }
}
