import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — PLATFORM SNAPSHOT REPOSITORY (Sprint 35)
// High-performance read model for pre-aggregated daily platform SaaS metrics
// ============================================================================

import type { PlatformDailySnapshotRecord } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";

export interface IPlatformSnapshotRepository {
  upsertDailySnapshot(
    snapshot: Omit<PlatformDailySnapshotRecord, "id" | "createdAt" | "updatedAt">,
    tx?: TransactionContext
  ): Promise<PlatformDailySnapshotRecord>;
  getDailySnapshots(
    from: string, // YYYY-MM-DD
    to: string,   // YYYY-MM-DD
    currency?: string,
    tx?: TransactionContext
  ): Promise<PlatformDailySnapshotRecord[]>;
  getLatestSnapshot(
    currency?: string,
    tx?: TransactionContext
  ): Promise<PlatformDailySnapshotRecord | null>;
  findByDate(
    date: string,
    currency?: string,
    tx?: TransactionContext
  ): Promise<PlatformDailySnapshotRecord | null>;
  getAll(tx?: TransactionContext): Promise<PlatformDailySnapshotRecord[]>;
  deleteByDate(date: string, currency?: string, tx?: TransactionContext): Promise<void>;
  clear(): void;
}

export class PlatformSnapshotRepository implements IPlatformSnapshotRepository {
  private static store = createRecordStore<string, PlatformDailySnapshotRecord>("platform-snapshot.repository:store");

  static clear(): void {
    PlatformSnapshotRepository.store.clear();
  }

  clear(): void {
    PlatformSnapshotRepository.store.clear();
  }

  private getKey(date: string, currency: string): string {
    return `${date}:${currency.toUpperCase()}`;
  }

  async findByDate(
    date: string,
    currency = "KES",
    _tx?: TransactionContext
  ): Promise<PlatformDailySnapshotRecord | null> {
    const key = this.getKey(date, currency);
    return PlatformSnapshotRepository.store.get(key) || null;
  }

  async upsertDailySnapshot(
    data: Omit<PlatformDailySnapshotRecord, "id" | "createdAt" | "updatedAt">,
    _tx?: TransactionContext
  ): Promise<PlatformDailySnapshotRecord> {
    const currency = data.currency || "KES";
    const key = this.getKey(data.snapshotDate, currency);
    const existing = PlatformSnapshotRepository.store.get(key);
    const id = existing?.id || `psnap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const snapshot: PlatformDailySnapshotRecord = {
      ...data,
      id,
      currency,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    PlatformSnapshotRepository.store.set(key, snapshot);
    return { ...snapshot };
  }

  async getDailySnapshots(
    from: string,
    to: string,
    currency = "KES",
    _tx?: TransactionContext
  ): Promise<PlatformDailySnapshotRecord[]> {
    const results: PlatformDailySnapshotRecord[] = [];
    const targetCurrency = currency.toUpperCase();

    for (const record of PlatformSnapshotRepository.store.values()) {
      if (
        record.currency.toUpperCase() === targetCurrency &&
        record.snapshotDate >= from &&
        record.snapshotDate <= to
      ) {
        results.push({ ...record });
      }
    }

    return results.sort((a, b) => a.snapshotDate.localeCompare(b.snapshotDate));
  }

  async getLatestSnapshot(
    currency = "KES",
    _tx?: TransactionContext
  ): Promise<PlatformDailySnapshotRecord | null> {
    const targetCurrency = currency.toUpperCase();
    let latest: PlatformDailySnapshotRecord | null = null;

    for (const record of PlatformSnapshotRepository.store.values()) {
      if (record.currency.toUpperCase() === targetCurrency) {
        if (!latest || record.snapshotDate > latest.snapshotDate) {
          latest = record;
        }
      }
    }

    return latest ? { ...latest } : null;
  }

  async getAll(_tx?: TransactionContext): Promise<PlatformDailySnapshotRecord[]> {
    return Array.from(PlatformSnapshotRepository.store.values()).map((r) => ({ ...r }));
  }

  async deleteByDate(date: string, currency = "KES", _tx?: TransactionContext): Promise<void> {
    const key = this.getKey(date, currency);
    PlatformSnapshotRepository.store.delete(key);
  }
}
