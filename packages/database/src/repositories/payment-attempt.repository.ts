import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — PAYMENT ATTEMPT REPOSITORY (Sprint 22: DEV-009, DATA-002)
// Repository for Tracking Payment Intents, Gateway Requests, and Status
// ============================================================================

import type { PaymentAttempt, ListPaymentAttemptsFilter } from "@carhire/types";
import {
  PaymentAttemptNotFoundError,
  CrossTenantViolationError,
  ConcurrencyConflictError,
  UniqueConstraintViolationError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IPaymentAttemptRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<PaymentAttempt | null>;
  findByIntentReference(reference: string, tenantId?: string, tx?: TransactionContext): Promise<PaymentAttempt | null>;
  findByProviderReference(provider: string, reference: string, tx?: TransactionContext): Promise<PaymentAttempt | null>;
  listByTenant(tenantId: string, filter?: ListPaymentAttemptsFilter, tx?: TransactionContext): Promise<PaymentAttempt[]>;
  create(
    data: Omit<PaymentAttempt, "id" | "version" | "createdAt" | "updatedAt">,
    tx?: TransactionContext
  ): Promise<PaymentAttempt>;
  update(
    id: string,
    updates: Partial<PaymentAttempt>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<PaymentAttempt>;
}

export class PaymentAttemptRepository implements IPaymentAttemptRepository {
  private static store = createRecordStore<string, PaymentAttempt>("payment-attempt.repository:store");

  static clear() {
    this.store.clear();
  }

  async findById(id: string, tenantId?: string): Promise<PaymentAttempt | null> {
    const attempt = PaymentAttemptRepository.store.get(id);
    if (!attempt) return null;
    if (tenantId && attempt.tenantId && attempt.tenantId !== tenantId) {
      throw new CrossTenantViolationError(attempt.tenantId, tenantId);
    }
    return { ...attempt };
  }

  async findByIntentReference(reference: string, tenantId?: string): Promise<PaymentAttempt | null> {
    for (const attempt of PaymentAttemptRepository.store.values()) {
      if (attempt.paymentIntentReference === reference) {
        if (tenantId && attempt.tenantId && attempt.tenantId !== tenantId) {
          throw new CrossTenantViolationError(attempt.tenantId, tenantId);
        }
        return { ...attempt };
      }
    }
    return null;
  }

  async findByProviderReference(provider: string, reference: string): Promise<PaymentAttempt | null> {
    for (const attempt of PaymentAttemptRepository.store.values()) {
      if (
        attempt.provider === provider &&
        (attempt.providerReference === reference || attempt.providerRequestReference === reference)
      ) {
        return { ...attempt };
      }
    }
    return null;
  }

  async listByTenant(tenantId: string, filter?: ListPaymentAttemptsFilter): Promise<PaymentAttempt[]> {
    const results: PaymentAttempt[] = [];
    for (const attempt of PaymentAttemptRepository.store.values()) {
      if (attempt.tenantId && attempt.tenantId !== tenantId) continue;
      if (filter?.purpose && attempt.purpose !== filter.purpose) continue;
      if (filter?.status && attempt.status !== filter.status) continue;
      if (filter?.customerId && attempt.customerId !== filter.customerId) continue;
      if (filter?.provider && attempt.provider !== filter.provider) continue;
      results.push({ ...attempt });
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async create(
    data: Omit<PaymentAttempt, "id" | "version" | "createdAt" | "updatedAt">
  ): Promise<PaymentAttempt> {
    for (const existing of PaymentAttemptRepository.store.values()) {
      if (
        existing.paymentIntentReference === data.paymentIntentReference &&
        (!data.tenantId || existing.tenantId === data.tenantId)
      ) {
        throw new UniqueConstraintViolationError("paymentIntentReference", data.paymentIntentReference);
      }
    }

    const now = new Date().toISOString();
    const attempt: PaymentAttempt = {
      ...data,
      id: crypto.randomUUID(),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    PaymentAttemptRepository.store.set(attempt.id, attempt);
    return { ...attempt };
  }

  async update(
    id: string,
    updates: Partial<PaymentAttempt>,
    expectedVersion?: number
  ): Promise<PaymentAttempt> {
    const existing = PaymentAttemptRepository.store.get(id);
    if (!existing) {
      throw new PaymentAttemptNotFoundError(id);
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Optimistic lock failure on PaymentAttempt ${id}: expected v${expectedVersion}, got v${existing.version}`
      );
    }

    const now = new Date().toISOString();
    const updated: PaymentAttempt = {
      ...existing,
      ...updates,
      id: existing.id,
      tenantId: existing.tenantId,
      version: existing.version + 1,
      updatedAt: now,
    };

    PaymentAttemptRepository.store.set(id, updated);
    return { ...updated };
  }
}
