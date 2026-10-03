import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — CREDIT NOTE REPOSITORY (Sprint 19: DOM-003 §28-34)
// Repository for Credit Notes, Reversals & Corrective Source Documents
// ============================================================================

import type { CreditNote, CreditNoteLine, CreditNoteStatus } from "@carhire/types";
import {
  CreditNoteNotFoundError,
  CrossTenantViolationError,
  FinanceConcurrencyConflictError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface ListCreditNotesFilter {
  customerId?: string;
  invoiceId?: string;
  rentalId?: string;
  status?: CreditNoteStatus;
}

export interface ICreditNoteRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<CreditNote | null>;
  findByCreditNoteNumber(creditNoteNumber: string, tenantId?: string, tx?: TransactionContext): Promise<CreditNote | null>;
  listByInvoiceId(invoiceId: string, tenantId: string, tx?: TransactionContext): Promise<CreditNote[]>;
  listByTenant(tenantId: string, filter?: ListCreditNotesFilter, tx?: TransactionContext): Promise<CreditNote[]>;
  create(
    data: Omit<CreditNote, "id" | "creditNoteNumber" | "version" | "createdAt" | "updatedAt"> & {
      creditNoteNumber?: string;
    },
    tx?: TransactionContext
  ): Promise<CreditNote>;
  update(
    id: string,
    tenantId: string,
    updates: Partial<CreditNote>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<CreditNote>;
}

export class CreditNoteRepository implements ICreditNoteRepository {
  private static store = createRecordStore<string, CreditNote>("credit-note.repository:store");
  private static counter = 1000;

  static clear() {
    this.store.clear();
    this.counter = 1000;
  }

  private generateCreditNoteNumber(): string {
    const year = new Date().getFullYear();
    const seq = (++CreditNoteRepository.counter).toString().padStart(6, "0");
    return `CRN-${year}-${seq}`;
  }

  async findById(id: string, tenantId?: string): Promise<CreditNote | null> {
    const crn = CreditNoteRepository.store.get(id);
    if (!crn) return null;
    if (tenantId && crn.tenantId !== tenantId) {
      throw new CrossTenantViolationError(crn.tenantId, tenantId);
    }
    return JSON.parse(JSON.stringify(crn));
  }

  async findByCreditNoteNumber(creditNoteNumber: string, tenantId?: string): Promise<CreditNote | null> {
    for (const crn of CreditNoteRepository.store.values()) {
      if (crn.creditNoteNumber === creditNoteNumber) {
        if (tenantId && crn.tenantId !== tenantId) {
          throw new CrossTenantViolationError(crn.tenantId, tenantId);
        }
        return JSON.parse(JSON.stringify(crn));
      }
    }
    return null;
  }

  async listByInvoiceId(invoiceId: string, tenantId: string): Promise<CreditNote[]> {
    const results: CreditNote[] = [];
    for (const crn of CreditNoteRepository.store.values()) {
      if (crn.tenantId === tenantId && crn.invoiceId === invoiceId) {
        results.push(JSON.parse(JSON.stringify(crn)));
      }
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async listByTenant(tenantId: string, filter?: ListCreditNotesFilter): Promise<CreditNote[]> {
    const results: CreditNote[] = [];
    for (const crn of CreditNoteRepository.store.values()) {
      if (crn.tenantId !== tenantId) continue;
      if (filter?.customerId && crn.customerId !== filter.customerId) continue;
      if (filter?.invoiceId && crn.invoiceId !== filter.invoiceId) continue;
      if (filter?.rentalId && crn.rentalId !== filter.rentalId) continue;
      if (filter?.status && crn.status !== filter.status) continue;
      results.push(JSON.parse(JSON.stringify(crn)));
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async create(
    data: Omit<CreditNote, "id" | "creditNoteNumber" | "version" | "createdAt" | "updatedAt"> & {
      creditNoteNumber?: string;
    }
  ): Promise<CreditNote> {
    const id = `crn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const creditNoteNumber = data.creditNoteNumber || this.generateCreditNoteNumber();

    const lines: CreditNoteLine[] = (data.lines || []).map((line, idx) => ({
      ...line,
      id: line.id || `crnl_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      creditNoteId: id,
    }));

    const creditNote: CreditNote = {
      ...data,
      id,
      creditNoteNumber,
      lines,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    CreditNoteRepository.store.set(id, JSON.parse(JSON.stringify(creditNote)));
    return JSON.parse(JSON.stringify(creditNote));
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<CreditNote>,
    expectedVersion?: number
  ): Promise<CreditNote> {
    const existing = CreditNoteRepository.store.get(id);
    if (!existing) {
      throw new CreditNoteNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(existing.tenantId, tenantId);
    }

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new FinanceConcurrencyConflictError("CreditNote", id, expectedVersion, existing.version);
    }

    const updated: CreditNote = {
      ...existing,
      ...updates,
      id: existing.id,
      tenantId: existing.tenantId,
      creditNoteNumber: existing.creditNoteNumber,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    CreditNoteRepository.store.set(id, JSON.parse(JSON.stringify(updated)));
    return JSON.parse(JSON.stringify(updated));
  }
}
