// ============================================================================
// CAR HIRE OS — SAAS PAYMENT RECORD REPOSITORY
// ============================================================================

import type { SaaSPaymentRecord, RecordSaaSPaymentDto } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";

export interface ISaaSPaymentRecordRepository {
  record(
    data: Omit<SaaSPaymentRecord, "id" | "createdAt">,
    tx?: TransactionContext
  ): Promise<SaaSPaymentRecord>;
  listByInvoiceId(
    invoiceId: string,
    tx?: TransactionContext
  ): Promise<SaaSPaymentRecord[]>;
  listByTenantId(
    tenantId: string,
    tx?: TransactionContext
  ): Promise<SaaSPaymentRecord[]>;
  listAll(tx?: TransactionContext): Promise<SaaSPaymentRecord[]>;
}

export class SaaSPaymentRecordRepository implements ISaaSPaymentRecordRepository {
  private static store: SaaSPaymentRecord[] = [];

  static initializeSeed(seedPayments?: SaaSPaymentRecord[]) {
    if (seedPayments) {
      this.store = [...seedPayments];
    }
  }

  async record(
    data: Omit<SaaSPaymentRecord, "id" | "createdAt">
  ): Promise<SaaSPaymentRecord> {
    const payment: SaaSPaymentRecord = {
      ...data,
      id: `saas-pay-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
    };

    SaaSPaymentRecordRepository.store.push(payment);
    return { ...payment };
  }

  async listByInvoiceId(invoiceId: string): Promise<SaaSPaymentRecord[]> {
    return SaaSPaymentRecordRepository.store
      .filter((p) => p.invoiceId === invoiceId)
      .map((p) => ({ ...p }))
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  }

  async listByTenantId(tenantId: string): Promise<SaaSPaymentRecord[]> {
    return SaaSPaymentRecordRepository.store
      .filter((p) => p.tenantId === tenantId)
      .map((p) => ({ ...p }))
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  }

  async listAll(): Promise<SaaSPaymentRecord[]> {
    return SaaSPaymentRecordRepository.store
      .map((p) => ({ ...p }))
      .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime());
  }

  static clearStore() {
    this.store = [];
  }
}
