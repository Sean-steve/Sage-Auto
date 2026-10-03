import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — PAYMENT REPOSITORY (Sprint 22: DEV-009, DATA-002)
// Repository for Authoritative Verified Financial Payment Facts
// ============================================================================

import type { Payment, ListPaymentsFilter } from "@carhire/types";
import {
  PaymentNotFoundError,
  CrossTenantViolationError,
  ConcurrencyConflictError,
  DuplicateProviderTransactionError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IPaymentRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<Payment | null>;
  findByPaymentNumber(number: string, tenantId?: string, tx?: TransactionContext): Promise<Payment | null>;
  findByProviderTransaction(
    provider: string,
    transactionId: string,
    tenantId?: string,
    tx?: TransactionContext
  ): Promise<Payment | null>;
  findByAttemptId(attemptId: string, tenantId?: string, tx?: TransactionContext): Promise<Payment | null>;
  listByTenant(tenantId: string, filter?: ListPaymentsFilter, tx?: TransactionContext): Promise<Payment[]>;
  create(
    data: Omit<Payment, "id" | "paymentNumber" | "version" | "createdAt" | "updatedAt">,
    tx?: TransactionContext
  ): Promise<Payment>;
  update(
    id: string,
    tenantId: string,
    updates: Partial<Payment>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<Payment>;
}

export class PaymentRepository implements IPaymentRepository {
  private static store = createRecordStore<string, Payment>("payment.repository:store");
  private static counter = 1000;

  static clear() {
    this.store.clear();
    this.counter = 1000;
  }

  private generatePaymentNumber(): string {
    const year = new Date().getFullYear();
    const num = ++PaymentRepository.counter;
    return `PMT-${year}-${String(num).padStart(6, "0")}`;
  }

  async findById(id: string, tenantId?: string): Promise<Payment | null> {
    const payment = PaymentRepository.store.get(id);
    if (!payment) return null;
    if (tenantId && payment.tenantId !== tenantId) {
      throw new CrossTenantViolationError(payment.tenantId, tenantId);
    }
    return { ...payment };
  }

  async findByPaymentNumber(number: string, tenantId?: string): Promise<Payment | null> {
    for (const payment of PaymentRepository.store.values()) {
      if (payment.paymentNumber === number) {
        if (tenantId && payment.tenantId !== tenantId) {
          throw new CrossTenantViolationError(payment.tenantId, tenantId);
        }
        return { ...payment };
      }
    }
    return null;
  }

  async findByProviderTransaction(
    provider: string,
    transactionId: string,
    tenantId?: string
  ): Promise<Payment | null> {
    for (const payment of PaymentRepository.store.values()) {
      if (
        payment.provider === provider &&
        payment.providerTransactionId.toLowerCase() === transactionId.toLowerCase()
      ) {
        if (tenantId && payment.tenantId !== tenantId) {
          throw new CrossTenantViolationError(payment.tenantId, tenantId);
        }
        return { ...payment };
      }
    }
    return null;
  }

  async findByAttemptId(attemptId: string, tenantId?: string): Promise<Payment | null> {
    for (const payment of PaymentRepository.store.values()) {
      if (payment.attemptId === attemptId) {
        if (tenantId && payment.tenantId !== tenantId) {
          throw new CrossTenantViolationError(payment.tenantId, tenantId);
        }
        return { ...payment };
      }
    }
    return null;
  }

  async listByTenant(tenantId: string, filter?: ListPaymentsFilter): Promise<Payment[]> {
    const results: Payment[] = [];
    for (const payment of PaymentRepository.store.values()) {
      if (payment.tenantId !== tenantId) continue;
      if (filter?.purpose && payment.purpose !== filter.purpose) continue;
      if (filter?.status && payment.status !== filter.status) continue;
      if (filter?.direction && payment.direction !== filter.direction) continue;
      if (filter?.provider && payment.provider !== filter.provider) continue;
      if (filter?.customerId && payment.sourceContext?.customerId !== filter.customerId) continue;
      if (filter?.fromDate && payment.paidAt < filter.fromDate) continue;
      if (filter?.toDate && payment.paidAt > filter.toDate) continue;
      results.push({ ...payment });
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async create(
    data: Omit<Payment, "id" | "paymentNumber" | "version" | "createdAt" | "updatedAt">
  ): Promise<Payment> {
    // Unique check on (tenantId, provider, providerTransactionId)
    for (const existing of PaymentRepository.store.values()) {
      if (
        existing.tenantId === data.tenantId &&
        existing.provider === data.provider &&
        existing.providerTransactionId.toLowerCase() === data.providerTransactionId.toLowerCase()
      ) {
        throw new DuplicateProviderTransactionError(data.provider, data.providerTransactionId);
      }
    }

    const now = new Date().toISOString();
    const payment: Payment = {
      ...data,
      id: crypto.randomUUID(),
      paymentNumber: this.generatePaymentNumber(),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    PaymentRepository.store.set(payment.id, payment);
    return { ...payment };
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<Payment>,
    expectedVersion?: number
  ): Promise<Payment> {
    const existing = PaymentRepository.store.get(id);
    if (!existing) {
      throw new PaymentNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(existing.tenantId, tenantId);
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Optimistic lock failure on Payment ${id}: expected v${expectedVersion}, got v${existing.version}`
      );
    }

    const now = new Date().toISOString();
    const updated: Payment = {
      ...existing,
      ...updates,
      id: existing.id,
      tenantId: existing.tenantId,
      version: existing.version + 1,
      updatedAt: now,
    };

    PaymentRepository.store.set(id, updated);
    return { ...updated };
  }
}
