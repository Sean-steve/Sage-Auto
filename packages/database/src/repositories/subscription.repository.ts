import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — SUBSCRIPTION PERSISTENCE REPOSITORY (SaaS Control Plane)
// ============================================================================

import type {
  Subscription,
  SubscriptionStatus,
  BillingInterval,
  CreateSubscriptionDto,
} from "@carhire/types";
import {
  RecordNotFoundError,
  ConcurrencyConflictError,
  UniqueConstraintViolationError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface ISubscriptionRepository {
  findById(id: string, tx?: TransactionContext): Promise<Subscription | null>;
  findByTenantId(tenantId: string, tx?: TransactionContext): Promise<Subscription | null>;
  listAll(tx?: TransactionContext): Promise<Subscription[]>;
  getAll(tx?: TransactionContext): Promise<Subscription[]>;
  create(
    data: Omit<Subscription, "id" | "version" | "createdAt" | "updatedAt">,
    tx?: TransactionContext
  ): Promise<Subscription>;
  update(
    id: string,
    updates: Partial<Subscription>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<Subscription>;
  delete(id: string, tx?: TransactionContext): Promise<void>;
}

export class SubscriptionRepository implements ISubscriptionRepository {
  private static store = createRecordStore<string, Subscription>("subscription.repository:store");

  static clear(): void {
    SubscriptionRepository.store.clear();
  }

  static initializeSeed(seedSubscriptions?: Subscription[]) {
    if (seedSubscriptions && seedSubscriptions.length > 0) {
      seedSubscriptions.forEach((s) => {
        this.store.set(s.id, {
          ...s,
          status: s.status || s.state,
          state: s.state || s.status,
          version: s.version ?? 1,
        });
      });
    }
  }

  async findById(id: string): Promise<Subscription | null> {
    const sub = SubscriptionRepository.store.get(id);
    return sub ? { ...sub } : null;
  }

  async findByTenantId(tenantId: string): Promise<Subscription | null> {
    // Return the active / primary subscription for the tenant
    for (const sub of SubscriptionRepository.store.values()) {
      if (sub.tenantId === tenantId) {
        return { ...sub };
      }
    }
    return null;
  }

  async listAll(): Promise<Subscription[]> {
    return Array.from(SubscriptionRepository.store.values()).map((s) => ({ ...s }));
  }

  async getAll(): Promise<Subscription[]> {
    return this.listAll();
  }

  async create(
    data: Omit<Subscription, "id" | "version" | "createdAt" | "updatedAt">
  ): Promise<Subscription> {
    // Check if tenant already has an active subscription
    const existing = await this.findByTenantId(data.tenantId);
    if (existing && existing.status !== "CANCELLED" && existing.status !== "EXPIRED") {
      throw new UniqueConstraintViolationError("tenantId", data.tenantId);
    }

    const now = new Date().toISOString();
    const id = `sub-${data.tenantId.replace(/^org-|^tenant-/, "")}-${Date.now()}`;
    const status = data.status || data.state || "TRIAL";

    const newSub: Subscription = {
      ...data,
      id,
      status,
      state: status,
      version: 1,
      billingCycle: data.billingCycle || (data.billingInterval === "YEARLY" ? "ANNUAL" : "MONTHLY"),
      billingInterval: data.billingInterval || (data.billingCycle === "ANNUAL" ? "YEARLY" : "MONTHLY"),
      createdAt: now,
      updatedAt: now,
    };

    SubscriptionRepository.store.set(newSub.id, newSub);
    return { ...newSub };
  }

  async update(
    id: string,
    updates: Partial<Subscription>,
    expectedVersion?: number
  ): Promise<Subscription> {
    const sub = await this.findById(id);
    if (!sub) {
      throw new RecordNotFoundError("Subscription", id);
    }

    if (expectedVersion !== undefined && sub.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Subscription ${id} was modified concurrently. Expected version ${expectedVersion}, found ${sub.version}.`
      );
    }

    const nextStatus = (updates.status || updates.state || sub.status) as SubscriptionStatus;
    const now = new Date().toISOString();

    const updated: Subscription = {
      ...sub,
      ...updates,
      status: nextStatus,
      state: nextStatus,
      version: (sub.version || 1) + 1,
      updatedAt: now,
    };

    SubscriptionRepository.store.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<void> {
    SubscriptionRepository.store.delete(id);
  }

  static clearStore() {
    this.store.clear();
  }
}
