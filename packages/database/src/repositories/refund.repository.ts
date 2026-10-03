import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — REFUND REPOSITORY (Sprint 22: DEV-009, DATA-002)
// Repository for Authoritative Refunds Linked to Verified Payments
// ============================================================================

import type { Refund, ListRefundsFilter } from "@carhire/types";
import {
  RefundNotFoundError,
  CrossTenantViolationError,
  ConcurrencyConflictError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IRefundRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<Refund | null>;
  findByRefundNumber(number: string, tenantId?: string, tx?: TransactionContext): Promise<Refund | null>;
  findByOriginalPaymentId(paymentId: string, tenantId: string, tx?: TransactionContext): Promise<Refund[]>;
  listByTenant(tenantId: string, filter?: ListRefundsFilter, tx?: TransactionContext): Promise<Refund[]>;
  create(
    data: Omit<Refund, "id" | "refundNumber" | "version" | "createdAt" | "updatedAt">,
    tx?: TransactionContext
  ): Promise<Refund>;
  update(
    id: string,
    tenantId: string,
    updates: Partial<Refund>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<Refund>;
}

export class RefundRepository implements IRefundRepository {
  private static store = createRecordStore<string, Refund>("refund.repository:store");
  private static counter = 1000;

  static clear() {
    this.store.clear();
    this.counter = 1000;
  }

  private generateRefundNumber(): string {
    const year = new Date().getFullYear();
    const num = ++RefundRepository.counter;
    return `REF-${year}-${String(num).padStart(6, "0")}`;
  }

  async findById(id: string, tenantId?: string): Promise<Refund | null> {
    const refund = RefundRepository.store.get(id);
    if (!refund) return null;
    if (tenantId && refund.tenantId !== tenantId) {
      throw new CrossTenantViolationError(refund.tenantId, tenantId);
    }
    return { ...refund };
  }

  async findByRefundNumber(number: string, tenantId?: string): Promise<Refund | null> {
    for (const refund of RefundRepository.store.values()) {
      if (refund.refundNumber === number) {
        if (tenantId && refund.tenantId !== tenantId) {
          throw new CrossTenantViolationError(refund.tenantId, tenantId);
        }
        return { ...refund };
      }
    }
    return null;
  }

  async findByOriginalPaymentId(paymentId: string, tenantId: string): Promise<Refund[]> {
    const results: Refund[] = [];
    for (const refund of RefundRepository.store.values()) {
      if (refund.tenantId === tenantId && refund.originalPaymentId === paymentId) {
        results.push({ ...refund });
      }
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async listByTenant(tenantId: string, filter?: ListRefundsFilter): Promise<Refund[]> {
    const results: Refund[] = [];
    for (const refund of RefundRepository.store.values()) {
      if (refund.tenantId !== tenantId) continue;
      if (filter?.originalPaymentId && refund.originalPaymentId !== filter.originalPaymentId) continue;
      if (filter?.customerId && refund.customerId !== filter.customerId) continue;
      if (filter?.status && refund.status !== filter.status) continue;
      results.push({ ...refund });
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async create(
    data: Omit<Refund, "id" | "refundNumber" | "version" | "createdAt" | "updatedAt">
  ): Promise<Refund> {
    const now = new Date().toISOString();
    const refund: Refund = {
      ...data,
      id: crypto.randomUUID(),
      refundNumber: this.generateRefundNumber(),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    RefundRepository.store.set(refund.id, refund);
    return { ...refund };
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<Refund>,
    expectedVersion?: number
  ): Promise<Refund> {
    const existing = RefundRepository.store.get(id);
    if (!existing) {
      throw new RefundNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(existing.tenantId, tenantId);
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Optimistic lock failure on Refund ${id}: expected v${expectedVersion}, got v${existing.version}`
      );
    }

    const now = new Date().toISOString();
    const updated: Refund = {
      ...existing,
      ...updates,
      id: existing.id,
      tenantId: existing.tenantId,
      version: existing.version + 1,
      updatedAt: now,
    };

    RefundRepository.store.set(id, updated);
    return { ...updated };
  }
}
