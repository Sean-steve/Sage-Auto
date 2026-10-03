import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — TENANT MEMBERSHIP PERSISTENCE REPOSITORY (DEV-004, DATA-002 §6)
// ============================================================================

import type { TenantMembership, MembershipStatus } from "@carhire/types";
import { UniqueConstraintViolationError, RecordNotFoundError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface ITenantMembershipRepository {
  findById(id: string, tx?: TransactionContext): Promise<TenantMembership | null>;
  findByTenantAndUser(tenantId: string, userId: string, tx?: TransactionContext): Promise<TenantMembership | null>;
  listByUserId(userId: string, tx?: TransactionContext): Promise<TenantMembership[]>;
  listByTenantId(tenantId: string, tx?: TransactionContext): Promise<TenantMembership[]>;
  listAll(tx?: TransactionContext): Promise<TenantMembership[]>;
  getAll(tx?: TransactionContext): Promise<TenantMembership[]>;
  create(
    membership: Omit<TenantMembership, "id" | "joinedAt" | "createdAt" | "updatedAt">,
    tx?: TransactionContext
  ): Promise<TenantMembership>;
  updateStatus(id: string, status: MembershipStatus, tx?: TransactionContext): Promise<TenantMembership>;
  delete(id: string, tx?: TransactionContext): Promise<boolean>;
}

export class TenantMembershipRepository implements ITenantMembershipRepository {
  private static store = createRecordStore<string, TenantMembership>("tenant-membership.repository:store");

  static initializeSeed(seedMemberships: TenantMembership[]) {
    seedMemberships.forEach((m) => {
      this.store.set(m.id, { ...m });
    });
  }

  async findById(id: string): Promise<TenantMembership | null> {
    return TenantMembershipRepository.store.get(id) || null;
  }

  async findByTenantAndUser(tenantId: string, userId: string): Promise<TenantMembership | null> {
    for (const m of TenantMembershipRepository.store.values()) {
      if (m.tenantId === tenantId && m.userId === userId) {
        return m;
      }
    }
    return null;
  }

  async listByUserId(userId: string): Promise<TenantMembership[]> {
    const results: TenantMembership[] = [];
    for (const m of TenantMembershipRepository.store.values()) {
      if (m.userId === userId) {
        results.push({ ...m });
      }
    }
    return results;
  }

  async listByTenantId(tenantId: string): Promise<TenantMembership[]> {
    const results: TenantMembership[] = [];
    for (const m of TenantMembershipRepository.store.values()) {
      if (m.tenantId === tenantId) {
        results.push({ ...m });
      }
    }
    return results;
  }

  async listAll(_tx?: TransactionContext): Promise<TenantMembership[]> {
    return Array.from(TenantMembershipRepository.store.values()).map((m) => ({ ...m }));
  }

  async getAll(tx?: TransactionContext): Promise<TenantMembership[]> {
    return this.listAll(tx);
  }

  async create(
    data: Omit<TenantMembership, "id" | "joinedAt" | "createdAt" | "updatedAt">
  ): Promise<TenantMembership> {
    const existing = await this.findByTenantAndUser(data.tenantId, data.userId);
    if (existing) {
      throw new UniqueConstraintViolationError("tenant_memberships_tenant_user", `${data.tenantId}:${data.userId}`);
    }

    const now = new Date().toISOString();
    const newMembership: TenantMembership = {
      id: crypto.randomUUID(),
      tenantId: data.tenantId,
      userId: data.userId,
      role: data.role || "TENANT_OPERATOR",
      roleId: data.roleId,
      roleName: data.roleName,
      status: data.status || "ACTIVE",
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    TenantMembershipRepository.store.set(newMembership.id, newMembership);
    return newMembership;
  }

  async updateRole(id:string, role:string):Promise<void> {
    const membership=await this.findById(id);
    if(!membership) throw new RecordNotFoundError('TenantMembership',id);
    TenantMembershipRepository.store.set(id,{...membership,role,updatedAt:new Date().toISOString()});
  }
  async updateStatus(id: string, status: MembershipStatus): Promise<TenantMembership> {
    const membership = await this.findById(id);
    if (!membership) {
      throw new RecordNotFoundError("TenantMembership", id);
    }

    const updated: TenantMembership = {
      ...membership,
      status,
      updatedAt: new Date().toISOString(),
    };

    TenantMembershipRepository.store.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return TenantMembershipRepository.store.delete(id);
  }
}
