import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — PAYMENT ALLOCATION REPOSITORY (Sprint 22: DEV-009, DATA-002)
// Immutable Allocation Records Binding Verified Payments to Invoices & Deposits
// ============================================================================

import type { PaymentAllocation, PaymentAllocationSourceType } from "@carhire/types";
import { CrossTenantViolationError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IPaymentAllocationRepository {
  create(
    data: Omit<PaymentAllocation, "id" | "createdAt">,
    tx?: TransactionContext
  ): Promise<PaymentAllocation>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<PaymentAllocation | null>;
  findByPaymentId(paymentId: string, tenantId: string, tx?: TransactionContext): Promise<PaymentAllocation[]>;
  findBySource(
    sourceType: PaymentAllocationSourceType,
    sourceId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<PaymentAllocation[]>;
  listByTenant(tenantId: string, tx?: TransactionContext): Promise<PaymentAllocation[]>;
}

export class PaymentAllocationRepository implements IPaymentAllocationRepository {
  private static store = createRecordStore<string, PaymentAllocation>("payment-allocation.repository:store");

  static clear() {
    this.store.clear();
  }

  async create(data: Omit<PaymentAllocation, "id" | "createdAt">): Promise<PaymentAllocation> {
    const allocation: PaymentAllocation = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    PaymentAllocationRepository.store.set(allocation.id, allocation);
    return { ...allocation };
  }

  async findById(id: string, tenantId?: string): Promise<PaymentAllocation | null> {
    const alloc = PaymentAllocationRepository.store.get(id);
    if (!alloc) return null;
    if (tenantId && alloc.tenantId !== tenantId) {
      throw new CrossTenantViolationError(alloc.tenantId, tenantId);
    }
    return { ...alloc };
  }

  async findByPaymentId(paymentId: string, tenantId: string): Promise<PaymentAllocation[]> {
    const results: PaymentAllocation[] = [];
    for (const alloc of PaymentAllocationRepository.store.values()) {
      if (alloc.tenantId === tenantId && alloc.paymentId === paymentId) {
        results.push({ ...alloc });
      }
    }
    return results.sort((a, b) => new Date(a.allocatedAt).getTime() - new Date(b.allocatedAt).getTime());
  }

  async findBySource(
    sourceType: PaymentAllocationSourceType,
    sourceId: string,
    tenantId: string
  ): Promise<PaymentAllocation[]> {
    const results: PaymentAllocation[] = [];
    for (const alloc of PaymentAllocationRepository.store.values()) {
      if (alloc.tenantId === tenantId && alloc.sourceType === sourceType && alloc.sourceId === sourceId) {
        results.push({ ...alloc });
      }
    }
    return results.sort((a, b) => new Date(a.allocatedAt).getTime() - new Date(b.allocatedAt).getTime());
  }

  async listByTenant(tenantId: string): Promise<PaymentAllocation[]> {
    const results: PaymentAllocation[] = [];
    for (const alloc of PaymentAllocationRepository.store.values()) {
      if (alloc.tenantId === tenantId) {
        results.push({ ...alloc });
      }
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}
