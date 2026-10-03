import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — JOURNAL TRANSACTION REPOSITORY (Sprint 20: DOM-003 §35-40)
// Production-grade Multi-Tenant Double-Entry Journal Headers & Immutability
// ============================================================================

import type {
  JournalTransaction,
  JournalSourceType,
  JournalTransactionStatus,
  ListJournalsFilter,
} from "@carhire/types";
import {
  JournalTransactionNotFoundError,
  CrossTenantViolationError,
  JournalAlreadyPostedError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IJournalTransactionRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<JournalTransaction | null>;
  findByTransactionNumber(transactionNumber: string, tenantId?: string, tx?: TransactionContext): Promise<JournalTransaction | null>;
  findByIdempotencyKey(key: string, tenantId: string, tx?: TransactionContext): Promise<JournalTransaction | null>;
  findBySource(
    sourceType: JournalSourceType,
    sourceId: string,
    tenantId: string,
    eventType?: string,
    tx?: TransactionContext
  ): Promise<JournalTransaction | null>;
  listByTenant(tenantId: string, filter?: ListJournalsFilter, tx?: TransactionContext): Promise<JournalTransaction[]>;
  create(
    data: Omit<JournalTransaction, "id" | "transactionNumber" | "version" | "createdAt" | "updatedAt"> & {
      id?: string;
      transactionNumber?: string;
    },
    tx?: TransactionContext
  ): Promise<JournalTransaction>;
  update(
    id: string,
    tenantId: string,
    updates: Partial<JournalTransaction>,
    tx?: TransactionContext
  ): Promise<JournalTransaction>;
  nextTransactionNumber(tenantId: string, tx?: TransactionContext): Promise<string>;
}

export class JournalTransactionRepository implements IJournalTransactionRepository {
  private static store = createRecordStore<string, JournalTransaction>("journal-transaction.repository:store");
  private static sequences = createRecordStore<string, number>("journal-transaction.repository:sequences");

  static clear(): void {
    JournalTransactionRepository.store.clear();
    JournalTransactionRepository.sequences.clear();
  }

  async nextTransactionNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const key = `${tenantId}:${year}`;
    const seq = (JournalTransactionRepository.sequences.get(key) || 0) + 1;
    JournalTransactionRepository.sequences.set(key, seq);
    const padded = String(seq).padStart(6, "0");
    return `JRN-${year}-${padded}`;
  }

  async findById(id: string, tenantId?: string): Promise<JournalTransaction | null> {
    const tx = JournalTransactionRepository.store.get(id);
    if (!tx) return null;
    if (tenantId && tx.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tx.tenantId, tenantId);
    }
    return { ...tx, entries: tx.entries ? [...tx.entries] : [] };
  }

  async findByTransactionNumber(
    transactionNumber: string,
    tenantId?: string
  ): Promise<JournalTransaction | null> {
    for (const tx of JournalTransactionRepository.store.values()) {
      if (tx.transactionNumber === transactionNumber) {
        if (tenantId && tx.tenantId !== tenantId) {
          throw new CrossTenantViolationError(tx.tenantId, tenantId);
        }
        return { ...tx, entries: tx.entries ? [...tx.entries] : [] };
      }
    }
    return null;
  }

  async findByIdempotencyKey(
    key: string,
    tenantId: string
  ): Promise<JournalTransaction | null> {
    for (const tx of JournalTransactionRepository.store.values()) {
      if (tx.tenantId === tenantId && tx.idempotencyKey === key) {
        return { ...tx, entries: tx.entries ? [...tx.entries] : [] };
      }
    }
    return null;
  }

  async findBySource(
    sourceType: JournalSourceType,
    sourceId: string,
    tenantId: string,
    eventType?: string
  ): Promise<JournalTransaction | null> {
    for (const tx of JournalTransactionRepository.store.values()) {
      if (
        tx.tenantId === tenantId &&
        tx.sourceType === sourceType &&
        tx.sourceId === sourceId &&
        (!eventType || tx.eventType === eventType)
      ) {
        return { ...tx, entries: tx.entries ? [...tx.entries] : [] };
      }
    }
    return null;
  }

  async listByTenant(
    tenantId: string,
    filter?: ListJournalsFilter
  ): Promise<JournalTransaction[]> {
    let items = Array.from(JournalTransactionRepository.store.values()).filter(
      (tx) => tx.tenantId === tenantId
    );

    if (filter?.sourceType) {
      items = items.filter((tx) => tx.sourceType === filter.sourceType);
    }
    if (filter?.status) {
      items = items.filter((tx) => tx.status === filter.status);
    }
    if (filter?.startDate) {
      items = items.filter((tx) => tx.transactionDate >= filter.startDate!);
    }
    if (filter?.endDate) {
      items = items.filter((tx) => tx.transactionDate <= filter.endDate!);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      items = items.filter(
        (tx) =>
          tx.transactionNumber.toLowerCase().includes(q) ||
          tx.description.toLowerCase().includes(q) ||
          (tx.sourceNumber && tx.sourceNumber.toLowerCase().includes(q))
      );
    }

    return items
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.transactionNumber.localeCompare(a.transactionNumber))
      .map((tx) => ({ ...tx, entries: tx.entries ? [...tx.entries] : [] }));
  }

  async create(
    data: Omit<JournalTransaction, "id" | "transactionNumber" | "version" | "createdAt" | "updatedAt"> & {
      id?: string;
      transactionNumber?: string;
    }
  ): Promise<JournalTransaction> {
    const id = data.id || `jrn_${Math.random().toString(36).substring(2, 11)}`;
    const transactionNumber = data.transactionNumber || (await this.nextTransactionNumber(data.tenantId));
    const now = new Date().toISOString();

    const transaction: JournalTransaction = {
      id,
      tenantId: data.tenantId,
      transactionNumber,
      status: data.status,
      transactionDate: data.transactionDate,
      postedAt: data.status === "POSTED" ? (data.postedAt || now) : undefined,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      sourceNumber: data.sourceNumber,
      eventType: data.eventType,
      currency: data.currency,
      totalDebit: data.totalDebit,
      totalCredit: data.totalCredit,
      description: data.description,
      reversalOfJournalId: data.reversalOfJournalId,
      reversedByJournalId: data.reversedByJournalId,
      idempotencyKey: data.idempotencyKey,
      postedByUserId: data.postedByUserId,
      entries: data.entries ? [...data.entries] : [],
      metadata: data.metadata,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    JournalTransactionRepository.store.set(id, transaction);
    return { ...transaction, entries: [...transaction.entries] };
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<JournalTransaction>
  ): Promise<JournalTransaction> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new JournalTransactionNotFoundError(id);
    }

    // Invariant: Once posted, a journal transaction is immutable, except for status transition to REVERSED with reversedByJournalId
    if (existing.status === "POSTED") {
      const allowedKeys = ["status", "reversedByJournalId", "updatedAt"];
      const attemptKeys = Object.keys(updates).filter((k) => (updates as any)[k] !== (existing as any)[k]);
      const unauthorizedKeys = attemptKeys.filter((k) => !allowedKeys.includes(k));
      if (unauthorizedKeys.length > 0) {
        throw new JournalAlreadyPostedError(id);
      }
    }

    const updated: JournalTransaction = {
      ...existing,
      ...updates,
      id: existing.id,
      tenantId: existing.tenantId,
      transactionNumber: existing.transactionNumber,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    JournalTransactionRepository.store.set(id, updated);
    return { ...updated, entries: updated.entries ? [...updated.entries] : [] };
  }

  async listAll(): Promise<JournalTransaction[]> {
    return Array.from(JournalTransactionRepository.store.values()).map((tx) => ({
      ...tx,
      entries: tx.entries ? [...tx.entries] : [],
    }));
  }
}
