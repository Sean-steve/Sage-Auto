import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — REFUND OBLIGATION REPOSITORY (Sprint 19: DOM-003 §28-34)
// Repository for Customer Refund Obligations (Source Facts)
// ============================================================================

import type { RefundObligation, RefundObligationStatus } from "@carhire/types";
import {
  RefundObligationNotFoundError,
  CrossTenantViolationError,
  FinanceConcurrencyConflictError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface ListRefundObligationsFilter {
  customerId?: string;
  rentalId?: string;
  invoiceId?: string;
  depositPositionId?: string;
  status?: RefundObligationStatus;
}

export interface IRefundObligationRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<RefundObligation | null>;
  findByDepositPositionId(depositPositionId: string, tenantId: string, tx?: TransactionContext): Promise<RefundObligation[]>;
  listByTenant(tenantId: string, filter?: ListRefundObligationsFilter, tx?: TransactionContext): Promise<RefundObligation[]>;
  create(
    data: Omit<RefundObligation, "id" | "version" | "createdAt" | "updatedAt">,
    tx?: TransactionContext
  ): Promise<RefundObligation>;
  update(
    id: string,
    tenantId: string,
    updates: Partial<RefundObligation>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<RefundObligation>;
}

export class RefundObligationRepository implements IRefundObligationRepository {
  private static store = createRecordStore<string, RefundObligation>("refund-obligation.repository:store");

  static clear() {
    this.store.clear();
  }

  async findById(id: string, tenantId?: string): Promise<RefundObligation | null> {
    const ref = RefundObligationRepository.store.get(id);
    if (!ref) return null;
    if (tenantId && ref.tenantId !== tenantId) {
      throw new CrossTenantViolationError(ref.tenantId, tenantId);
    }
    return JSON.parse(JSON.stringify(ref));
  }

  async findByDepositPositionId(depositPositionId: string, tenantId: string): Promise<RefundObligation[]> {
    const results: RefundObligation[] = [];
    for (const ref of RefundObligationRepository.store.values()) {
      if (ref.tenantId === tenantId && ref.depositPositionId === depositPositionId) {
        results.push(JSON.parse(JSON.stringify(ref)));
      }
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async listByTenant(tenantId: string, filter?: ListRefundObligationsFilter): Promise<RefundObligation[]> {
    const results: RefundObligation[] = [];
    for (const ref of RefundObligationRepository.store.values()) {
      if (ref.tenantId !== tenantId) continue;
      if (filter?.customerId && ref.customerId !== filter.customerId) continue;
      if (filter?.rentalId && ref.rentalId !== filter.rentalId) continue;
      if (filter?.invoiceId && ref.invoiceId !== filter.invoiceId) continue;
      if (filter?.depositPositionId && ref.depositPositionId !== filter.depositPositionId) continue;
      if (filter?.status && ref.status !== filter.status) continue;
      results.push(JSON.parse(JSON.stringify(ref)));
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async create(
    data: Omit<RefundObligation, "id" | "version" | "createdAt" | "updatedAt">
  ): Promise<RefundObligation> {
    const id = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const obligation: RefundObligation = {
      ...data,
      id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    RefundObligationRepository.store.set(id, JSON.parse(JSON.stringify(obligation)));
    return JSON.parse(JSON.stringify(obligation));
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<RefundObligation>,
    expectedVersion?: number
  ): Promise<RefundObligation> {
    const existing = RefundObligationRepository.store.get(id);
    if (!existing) {
      throw new RefundObligationNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(existing.tenantId, tenantId);
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new FinanceConcurrencyConflictError("RefundObligation", id, expectedVersion, existing.version);
    }

    const updated: RefundObligation = {
      ...existing,
      ...updates,
      id: existing.id,
      tenantId: existing.tenantId,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    RefundObligationRepository.store.set(id, JSON.parse(JSON.stringify(updated)));
    return JSON.parse(JSON.stringify(updated));
  }
}
