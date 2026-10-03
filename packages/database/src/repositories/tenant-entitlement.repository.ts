import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — TENANT ENTITLEMENT REPOSITORY (ENT-001)
// ============================================================================

import type { TenantEntitlement } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";

export interface ITenantEntitlementRepository {
  findById(id: string, tx?: TransactionContext): Promise<TenantEntitlement | null>;
  findByTenantId(tenantId: string, tx?: TransactionContext): Promise<TenantEntitlement[]>;
  findByTenantAndFeatureKey(tenantId: string, featureKey: string, tx?: TransactionContext): Promise<TenantEntitlement | null>;
  upsert(entitlement: TenantEntitlement, tx?: TransactionContext): Promise<TenantEntitlement>;
  deleteByTenantId(tenantId: string, tx?: TransactionContext): Promise<void>;
  listAll(tx?: TransactionContext): Promise<TenantEntitlement[]>;
}

export class TenantEntitlementRepository implements ITenantEntitlementRepository {
  private static store = createRecordStore<string, TenantEntitlement>("tenant-entitlement.repository:store");

  async findById(id: string): Promise<TenantEntitlement | null> {
    const item = TenantEntitlementRepository.store.get(id);
    return item ? { ...item } : null;
  }

  async findByTenantId(tenantId: string): Promise<TenantEntitlement[]> {
    return Array.from(TenantEntitlementRepository.store.values())
      .filter((te) => te.tenantId === tenantId)
      .map((te) => ({ ...te }));
  }

  async findByTenantAndFeatureKey(tenantId: string, featureKey: string): Promise<TenantEntitlement | null> {
    for (const te of TenantEntitlementRepository.store.values()) {
      if (te.tenantId === tenantId && te.featureKey === featureKey) {
        return { ...te };
      }
    }
    return null;
  }

  async upsert(entitlement: TenantEntitlement): Promise<TenantEntitlement> {
    const existing = await this.findByTenantAndFeatureKey(entitlement.tenantId, entitlement.featureKey);
    const now = new Date().toISOString();

    if (existing) {
      const updated: TenantEntitlement = {
        ...existing,
        ...entitlement,
        id: existing.id,
        version: (existing.version ?? 1) + 1,
        updatedAt: now,
      };
      TenantEntitlementRepository.store.set(existing.id, updated);
      return { ...updated };
    }

    const id = entitlement.id || `te-${entitlement.tenantId}-${entitlement.featureKey.replace(/\./g, "-")}`;
    const newRecord: TenantEntitlement = {
      ...entitlement,
      id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    TenantEntitlementRepository.store.set(id, newRecord);
    return { ...newRecord };
  }

  async deleteByTenantId(tenantId: string): Promise<void> {
    for (const [id, te] of TenantEntitlementRepository.store.entries()) {
      if (te.tenantId === tenantId) {
        TenantEntitlementRepository.store.delete(id);
      }
    }
  }

  async listAll(): Promise<TenantEntitlement[]> {
    return Array.from(TenantEntitlementRepository.store.values()).map((te) => ({ ...te }));
  }
}
