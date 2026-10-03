import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — JOURNAL ENTRY REPOSITORY (Sprint 20: DOM-003 §35-40)
// Immutable Double-Entry Ledger Lines with Dimensional Attribution
// ============================================================================

import type { JournalEntry } from "@carhire/types";
import { CrossTenantViolationError } from "../errors";

export interface ListJournalEntriesFilter {
  accountId?: string;
  accountCode?: string;
  startDate?: string;
  endDate?: string;
  vehicleId?: string;
  customerId?: string;
  corporateAccountId?: string;
  rentalId?: string;
  bookingId?: string;
  vehicleOwnerId?: string;
}

export interface IJournalEntryRepository {
  findByTransactionId(transactionId: string, tenantId?: string): Promise<JournalEntry[]>;
  findByAccount(accountId: string, tenantId: string, filter?: ListJournalEntriesFilter): Promise<JournalEntry[]>;
  listByTenant(tenantId: string, filter?: ListJournalEntriesFilter): Promise<JournalEntry[]>;
  createMany(
    entries: Array<Omit<JournalEntry, "id" | "createdAt"> & { id?: string }>,
  ): Promise<JournalEntry[]>;
}

export class JournalEntryRepository implements IJournalEntryRepository {
  private static store = createRecordStore<string, JournalEntry>("journal-entry.repository:store");

  static clear(): void {
    JournalEntryRepository.store.clear();
  }

  async findByTransactionId(transactionId: string, tenantId?: string): Promise<JournalEntry[]> {
    const lines = Array.from(JournalEntryRepository.store.values()).filter(
      (e) => e.transactionId === transactionId
    );
    if (tenantId) {
      for (const line of lines) {
        if (line.tenantId !== tenantId) {
          throw new CrossTenantViolationError(line.tenantId, tenantId);
        }
      }
    }
    return lines.sort((a, b) => a.sortOrder - b.sortOrder).map((l) => ({ ...l }));
  }

  async findByAccount(
    accountId: string,
    tenantId: string,
    filter?: ListJournalEntriesFilter
  ): Promise<JournalEntry[]> {
    let lines = Array.from(JournalEntryRepository.store.values()).filter(
      (e) => e.tenantId === tenantId && (e.accountId === accountId || (filter?.accountCode && e.accountCode === filter.accountCode))
    );

    if (filter?.vehicleId) {
      lines = lines.filter((e) => e.vehicleId === filter.vehicleId);
    }
    if (filter?.customerId) {
      lines = lines.filter((e) => e.customerId === filter.customerId);
    }
    if (filter?.corporateAccountId) {
      lines = lines.filter((e) => e.corporateAccountId === filter.corporateAccountId);
    }
    if (filter?.rentalId) {
      lines = lines.filter((e) => e.rentalId === filter.rentalId);
    }
    if (filter?.bookingId) {
      lines = lines.filter((e) => e.bookingId === filter.bookingId);
    }
    if (filter?.vehicleOwnerId) {
      lines = lines.filter((e) => e.vehicleOwnerId === filter.vehicleOwnerId);
    }

    return lines.sort((a, b) => a.sortOrder - b.sortOrder).map((l) => ({ ...l }));
  }

  async listByTenant(
    tenantId: string,
    filter?: ListJournalEntriesFilter
  ): Promise<JournalEntry[]> {
    let lines = Array.from(JournalEntryRepository.store.values()).filter(
      (e) => e.tenantId === tenantId
    );

    if (filter?.accountId) {
      lines = lines.filter((e) => e.accountId === filter.accountId);
    }
    if (filter?.accountCode) {
      lines = lines.filter((e) => e.accountCode === filter.accountCode);
    }
    if (filter?.vehicleId) {
      lines = lines.filter((e) => e.vehicleId === filter.vehicleId);
    }
    if (filter?.customerId) {
      lines = lines.filter((e) => e.customerId === filter.customerId);
    }
    if (filter?.corporateAccountId) {
      lines = lines.filter((e) => e.corporateAccountId === filter.corporateAccountId);
    }
    if (filter?.rentalId) {
      lines = lines.filter((e) => e.rentalId === filter.rentalId);
    }
    if (filter?.vehicleOwnerId) {
      lines = lines.filter((e) => e.vehicleOwnerId === filter.vehicleOwnerId);
    }

    return lines.sort((a, b) => a.sortOrder - b.sortOrder).map((l) => ({ ...l }));
  }

  async createMany(
    entries: Array<Omit<JournalEntry, "id" | "createdAt"> & { id?: string }>
  ): Promise<JournalEntry[]> {
    const now = new Date().toISOString();
    const created: JournalEntry[] = [];

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const id = e.id || `ent_${Math.random().toString(36).substring(2, 11)}`;
      const entry: JournalEntry = {
        id,
        transactionId: e.transactionId,
        tenantId: e.tenantId,
        accountId: e.accountId,
        accountCode: e.accountCode,
        accountName: e.accountName,
        direction: e.direction,
        amount: e.amount,
        memo: e.memo,
        vehicleId: e.vehicleId,
        customerId: e.customerId,
        corporateAccountId: e.corporateAccountId,
        rentalId: e.rentalId,
        bookingId: e.bookingId,
        vehicleOwnerId: e.vehicleOwnerId,
        sortOrder: e.sortOrder ?? i + 1,
        createdAt: now,
      };

      JournalEntryRepository.store.set(id, entry);
      created.push({ ...entry });
    }

    return created;
  }
}
