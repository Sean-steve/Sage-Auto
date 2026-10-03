import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — OPERATIONAL INVOICE REPOSITORY (Sprint 19: DOM-003 §28-34)
// Production-grade repository for Tenant Operational Invoices & Line Items
// ============================================================================

import type {
  OperationalInvoice,
  OperationalInvoiceLine,
  OperationalInvoiceStatus,
  OperationalInvoiceStatusHistory,
} from "@carhire/types";
import {
  OperationalInvoiceNotFoundError,
  CrossTenantViolationError,
  FinanceConcurrencyConflictError,
  OperationalInvoiceImmutableError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface ListInvoicesFilter {
  customerId?: string;
  corporateAccountId?: string;
  rentalId?: string;
  status?: OperationalInvoiceStatus;
  overdueOnly?: boolean;
}

export interface IOperationalInvoiceRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<OperationalInvoice | null>;
  findByInvoiceNumber(invoiceNumber: string, tenantId?: string, tx?: TransactionContext): Promise<OperationalInvoice | null>;
  findByRentalId(rentalId: string, tenantId: string, tx?: TransactionContext): Promise<OperationalInvoice | null>;
  listByTenant(tenantId: string, filter?: ListInvoicesFilter, tx?: TransactionContext): Promise<OperationalInvoice[]>;
  create(
    data: Omit<OperationalInvoice, "id" | "invoiceNumber" | "version" | "createdAt" | "updatedAt"> & {
      invoiceNumber?: string;
    },
    tx?: TransactionContext
  ): Promise<OperationalInvoice>;
  update(
    id: string,
    tenantId: string,
    updates: Partial<OperationalInvoice>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<OperationalInvoice>;
  recordStatusTransition(
    id: string,
    tenantId: string,
    fromStatus: OperationalInvoiceStatus,
    toStatus: OperationalInvoiceStatus,
    actorUserId: string,
    reason?: string,
    tx?: TransactionContext
  ): Promise<OperationalInvoiceStatusHistory>;
  getStatusHistory(id: string, tenantId: string, tx?: TransactionContext): Promise<OperationalInvoiceStatusHistory[]>;
}

export class OperationalInvoiceRepository implements IOperationalInvoiceRepository {
  private static store = createRecordStore<string, OperationalInvoice>("operational-invoice.repository:store");
  private static historyStore = createRecordStore<string, OperationalInvoiceStatusHistory[]>("operational-invoice.repository:historyStore");
  private static counter = 1000;

  static clear() {
    this.store.clear();
    this.historyStore.clear();
    this.counter = 1000;
  }

  private generateInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const seq = (++OperationalInvoiceRepository.counter).toString().padStart(6, "0");
    return `INV-${year}-${seq}`;
  }

  async findById(id: string, tenantId?: string): Promise<OperationalInvoice | null> {
    const inv = OperationalInvoiceRepository.store.get(id);
    if (!inv) return null;
    if (tenantId && inv.tenantId !== tenantId) {
      throw new CrossTenantViolationError(inv.tenantId, tenantId);
    }
    return JSON.parse(JSON.stringify(inv));
  }

  async findByInvoiceNumber(invoiceNumber: string, tenantId?: string): Promise<OperationalInvoice | null> {
    for (const inv of OperationalInvoiceRepository.store.values()) {
      if (inv.invoiceNumber === invoiceNumber) {
        if (tenantId && inv.tenantId !== tenantId) {
          throw new CrossTenantViolationError(inv.tenantId, tenantId);
        }
        return JSON.parse(JSON.stringify(inv));
      }
    }
    return null;
  }

  async findByRentalId(rentalId: string, tenantId: string): Promise<OperationalInvoice | null> {
    for (const inv of OperationalInvoiceRepository.store.values()) {
      if (inv.rentalId === rentalId && inv.tenantId === tenantId) {
        return JSON.parse(JSON.stringify(inv));
      }
    }
    return null;
  }

  async listByTenant(tenantId: string, filter?: ListInvoicesFilter): Promise<OperationalInvoice[]> {
    const now = new Date().toISOString().split("T")[0];
    const results: OperationalInvoice[] = [];

    for (const inv of OperationalInvoiceRepository.store.values()) {
      if (inv.tenantId !== tenantId) continue;
      if (filter?.customerId && inv.customerId !== filter.customerId) continue;
      if (filter?.corporateAccountId && inv.corporateAccountId !== filter.corporateAccountId) continue;
      if (filter?.rentalId && inv.rentalId !== filter.rentalId) continue;
      if (filter?.status && inv.status !== filter.status) continue;
      if (filter?.overdueOnly) {
        const isOverdue =
          inv.status !== "PAID" &&
          inv.status !== "VOIDED" &&
          inv.dueDate < now &&
          parseFloat(inv.amountOutstanding) > 0;
        if (!isOverdue) continue;
      }
      results.push(JSON.parse(JSON.stringify(inv)));
    }

    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async create(
    data: Omit<OperationalInvoice, "id" | "invoiceNumber" | "version" | "createdAt" | "updatedAt"> & {
      invoiceNumber?: string;
    }
  ): Promise<OperationalInvoice> {
    const id = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const invoiceNumber = data.invoiceNumber || this.generateInvoiceNumber();

    const lineItems: OperationalInvoiceLine[] = (data.lineItems || []).map((item, idx) => ({
      ...item,
      id: item.id || `line_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      invoiceId: id,
      sortOrder: item.sortOrder !== undefined ? item.sortOrder : idx,
    }));

    const invoice: OperationalInvoice = {
      ...data,
      id,
      invoiceNumber,
      lineItems,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    OperationalInvoiceRepository.store.set(id, JSON.parse(JSON.stringify(invoice)));
    return JSON.parse(JSON.stringify(invoice));
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<OperationalInvoice>,
    expectedVersion?: number
  ): Promise<OperationalInvoice> {
    const existing = OperationalInvoiceRepository.store.get(id);
    if (!existing) {
      throw new OperationalInvoiceNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(existing.tenantId, tenantId);
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new FinanceConcurrencyConflictError("OperationalInvoice", id, expectedVersion, existing.version);
    }

    const updated: OperationalInvoice = {
      ...existing,
      ...updates,
      id: existing.id,
      tenantId: existing.tenantId,
      invoiceNumber: existing.invoiceNumber,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    OperationalInvoiceRepository.store.set(id, JSON.parse(JSON.stringify(updated)));
    return JSON.parse(JSON.stringify(updated));
  }

  async recordStatusTransition(
    id: string,
    tenantId: string,
    fromStatus: OperationalInvoiceStatus,
    toStatus: OperationalInvoiceStatus,
    actorUserId: string,
    reason?: string
  ): Promise<OperationalInvoiceStatusHistory> {
    const history: OperationalInvoiceStatusHistory = {
      id: `invh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      invoiceId: id,
      tenantId,
      fromStatus,
      toStatus,
      actorUserId,
      reason,
      timestamp: new Date().toISOString(),
    };

    const list = OperationalInvoiceRepository.historyStore.get(id) || [];
    list.push(history);
    OperationalInvoiceRepository.historyStore.set(id, list);

    return history;
  }

  async getStatusHistory(id: string, tenantId: string): Promise<OperationalInvoiceStatusHistory[]> {
    const inv = await this.findById(id, tenantId);
    if (!inv) {
      throw new OperationalInvoiceNotFoundError(id);
    }
    const list = OperationalInvoiceRepository.historyStore.get(id) || [];
    return JSON.parse(JSON.stringify(list));
  }
}
