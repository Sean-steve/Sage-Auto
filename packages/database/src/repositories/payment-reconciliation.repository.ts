import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — PAYMENT RECONCILIATION REPOSITORY (Sprint 22: DEV-009, DATA-002)
// Repository for Tracking Payment & Ledger Reconciliation Discrepancies
// ============================================================================

import type { PaymentReconciliationIssue, ReconciliationIssueType } from "@carhire/types";
import { CrossTenantViolationError, RecordNotFoundError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IPaymentReconciliationRepository {
  create(
    data: Omit<PaymentReconciliationIssue, "id" | "detectedAt">,
    tx?: TransactionContext
  ): Promise<PaymentReconciliationIssue>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<PaymentReconciliationIssue | null>;
  listByTenant(
    tenantId: string,
    resolved?: boolean,
    issueType?: ReconciliationIssueType,
    tx?: TransactionContext
  ): Promise<PaymentReconciliationIssue[]>;
  resolveIssue(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<PaymentReconciliationIssue>;
  clearResolved(tenantId: string, tx?: TransactionContext): Promise<number>;
}

export class PaymentReconciliationRepository implements IPaymentReconciliationRepository {
  private static store = createRecordStore<string, PaymentReconciliationIssue>("payment-reconciliation.repository:store");

  static clear() {
    this.store.clear();
  }

  async create(
    data: Omit<PaymentReconciliationIssue, "id" | "detectedAt">
  ): Promise<PaymentReconciliationIssue> {
    const issue: PaymentReconciliationIssue = {
      ...data,
      id: crypto.randomUUID(),
      detectedAt: new Date().toISOString(),
    };
    PaymentReconciliationRepository.store.set(issue.id, issue);
    return { ...issue };
  }

  async findById(id: string, tenantId?: string): Promise<PaymentReconciliationIssue | null> {
    const issue = PaymentReconciliationRepository.store.get(id);
    if (!issue) return null;
    if (tenantId && issue.tenantId !== tenantId) {
      throw new CrossTenantViolationError(issue.tenantId, tenantId);
    }
    return { ...issue };
  }

  async listByTenant(
    tenantId: string,
    resolved?: boolean,
    issueType?: ReconciliationIssueType
  ): Promise<PaymentReconciliationIssue[]> {
    const results: PaymentReconciliationIssue[] = [];
    for (const issue of PaymentReconciliationRepository.store.values()) {
      if (issue.tenantId !== tenantId) continue;
      if (resolved !== undefined && issue.resolved !== resolved) continue;
      if (issueType && issue.issueType !== issueType) continue;
      results.push({ ...issue });
    }
    return results.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  }

  async resolveIssue(id: string, tenantId: string): Promise<PaymentReconciliationIssue> {
    const existing = PaymentReconciliationRepository.store.get(id);
    if (!existing) {
      throw new RecordNotFoundError("PaymentReconciliationIssue", id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(existing.tenantId, tenantId);
    }

    const updated: PaymentReconciliationIssue = {
      ...existing,
      resolved: true,
      resolvedAt: new Date().toISOString(),
    };

    PaymentReconciliationRepository.store.set(id, updated);
    return { ...updated };
  }

  async clearResolved(tenantId: string): Promise<number> {
    let count = 0;
    for (const [id, issue] of PaymentReconciliationRepository.store.entries()) {
      if (issue.tenantId === tenantId && issue.resolved) {
        PaymentReconciliationRepository.store.delete(id);
        count++;
      }
    }
    return count;
  }
}
