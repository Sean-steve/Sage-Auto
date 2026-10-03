import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — TENANT PERSISTENCE REPOSITORY (DEV-004, DATA-002)
// ============================================================================

import type { Tenant, TenantSetting } from "@carhire/types";
import { UniqueConstraintViolationError, RecordNotFoundError } from "../errors";
import { TransactionContext } from "../transaction-manager";
import { TenantSettingsRepository } from "./tenant-settings.repository";

export interface ITenantRepository {
  findById(id: string, tx?: TransactionContext): Promise<Tenant | null>;
  findBySlug(slug: string, tx?: TransactionContext): Promise<Tenant | null>;
  listAll(tx?: TransactionContext): Promise<Tenant[]>;
  getAll(tx?: TransactionContext): Promise<Tenant[]>;
  create(tenant: Omit<Tenant, "id" | "createdAt" | "updatedAt">, tx?: TransactionContext): Promise<Tenant>;
  update(id: string, updates: Partial<Tenant>, tx?: TransactionContext): Promise<Tenant>;
  softDelete(id: string, tx?: TransactionContext): Promise<Tenant>;
  updateSettings(tenantId: string, settings: Partial<TenantSetting>, tx?: TransactionContext): Promise<TenantSetting>;
}

export class TenantRepository implements ITenantRepository {
  private static store = createRecordStore<string, Tenant>("tenant.repository:store");
  private settingsRepo = new TenantSettingsRepository();

  static initializeSeed(seedTenants: Tenant[]) {
    seedTenants.forEach((t) => {
      this.store.set(t.id, { ...t });
    });
  }

  async findById(id: string): Promise<Tenant | null> {
    const t = TenantRepository.store.get(id);
    return t ? { ...t } : null;
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const normalized = slug.trim().toLowerCase();
    for (const tenant of TenantRepository.store.values()) {
      if (tenant.slug.toLowerCase() === normalized && !tenant.deletedAt) {
        return { ...tenant };
      }
    }
    return null;
  }

  async listAll(): Promise<Tenant[]> {
    const list: Tenant[] = [];
    for (const tenant of TenantRepository.store.values()) {
      if (!tenant.deletedAt) {
        list.push({ ...tenant });
      }
    }
    return list;
  }

  async getAll(): Promise<Tenant[]> {
    return this.listAll();
  }

  async create(data: Omit<Tenant, "id" | "createdAt" | "updatedAt">): Promise<Tenant> {
    const existing = await this.findBySlug(data.slug);
    if (existing) {
      throw new UniqueConstraintViolationError("slug", data.slug);
    }

    const now = new Date().toISOString();
    const newTenant: Tenant = {
      ...data,
      planId: data.planId || "plan-growth",
      currency: data.currency || "KES",
      id: crypto.randomUUID(),
      status: data.status || "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    TenantRepository.store.set(newTenant.id, newTenant);
    return { ...newTenant };
  }

  async update(id: string, updates: Partial<Tenant>): Promise<Tenant> {
    const tenant = await this.findById(id);
    if (!tenant) {
      throw new RecordNotFoundError("Tenant", id);
    }

    if (updates.slug && updates.slug !== tenant.slug) {
      const existingSlug = await this.findBySlug(updates.slug);
      if (existingSlug && existingSlug.id !== id) {
        throw new UniqueConstraintViolationError("slug", updates.slug);
      }
    }

    const updated: Tenant = {
      ...tenant,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    TenantRepository.store.set(id, updated);
    return { ...updated };
  }

  async softDelete(id: string): Promise<Tenant> {
    const tenant = await this.findById(id);
    if (!tenant) {
      throw new RecordNotFoundError("Tenant", id);
    }

    const deleted: Tenant = {
      ...tenant,
      status: "CANCELLED",
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    TenantRepository.store.set(id, deleted);
    return { ...deleted };
  }

  async updateSettings(tenantId: string, settings: Partial<TenantSetting>): Promise<TenantSetting> {
    return this.settingsRepo.upsert(tenantId, settings);
  }
}
