import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — PLATFORM COHORT REPOSITORY (Sprint 35)
// Stores and queries subscription acquisition cohort matrices
// ============================================================================

import type { PlatformCohortRecord } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";

export interface IPlatformCohortRepository {
  upsertCohort(
    cohort: Omit<PlatformCohortRecord, "id" | "createdAt" | "updatedAt">,
    tx?: TransactionContext
  ): Promise<PlatformCohortRecord>;
  getCohort(cohortMonth: string, currency?: string, tx?: TransactionContext): Promise<PlatformCohortRecord | null>;
  getAllCohorts(currency?: string, tx?: TransactionContext): Promise<PlatformCohortRecord[]>;
  clear(): void;
}

export class PlatformCohortRepository implements IPlatformCohortRepository {
  private static store = createRecordStore<string, PlatformCohortRecord>("platform-cohort.repository:store");

  static clear(): void {
    PlatformCohortRepository.store.clear();
  }

  clear(): void {
    PlatformCohortRepository.store.clear();
  }

  private getKey(cohortMonth: string, currency: string): string {
    return `${cohortMonth}:${currency.toUpperCase()}`;
  }

  async upsertCohort(
    data: Omit<PlatformCohortRecord, "id" | "createdAt" | "updatedAt">,
    _tx?: TransactionContext
  ): Promise<PlatformCohortRecord> {
    const currency = data.currency || "KES";
    const key = this.getKey(data.cohortMonth, currency);
    const existing = PlatformCohortRepository.store.get(key);
    const id = existing?.id || `pcoh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const record: PlatformCohortRecord = {
      ...data,
      id,
      currency,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    PlatformCohortRepository.store.set(key, record);
    return { ...record };
  }

  async getCohort(
    cohortMonth: string,
    currency = "KES",
    _tx?: TransactionContext
  ): Promise<PlatformCohortRecord | null> {
    const key = this.getKey(cohortMonth, currency);
    const found = PlatformCohortRepository.store.get(key);
    return found ? { ...found } : null;
  }

  async getAllCohorts(
    currency = "KES",
    _tx?: TransactionContext
  ): Promise<PlatformCohortRecord[]> {
    const cur = currency.toUpperCase();
    const results: PlatformCohortRecord[] = [];

    for (const record of PlatformCohortRepository.store.values()) {
      if (record.currency.toUpperCase() === cur) {
        results.push({ ...record });
      }
    }

    return results.sort((a, b) => a.cohortMonth.localeCompare(b.cohortMonth));
  }
}
