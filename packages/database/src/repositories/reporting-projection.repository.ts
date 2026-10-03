import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — REPORTING PROJECTION REPOSITORY (Sprint 34: DOM-003, DATA-002)
// High-performance read model for pre-aggregated daily operational analytics
// ============================================================================

import type { ReportingDailySnapshot } from "@carhire/types";
import { CrossTenantViolationError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IReportingProjectionRepository {
  upsertDailySnapshot(
    snapshot: Omit<ReportingDailySnapshot, "id" | "updatedAt">,
    tx?: TransactionContext
  ): Promise<ReportingDailySnapshot>;
  getDailySnapshots(
    tenantId: string,
    from: string, // YYYY-MM-DD
    to: string,   // YYYY-MM-DD
    currency?: string,
    tx?: TransactionContext
  ): Promise<ReportingDailySnapshot[]>;
  getLatestSnapshot(
    tenantId: string,
    tx?: TransactionContext
  ): Promise<ReportingDailySnapshot | null>;
  deleteByTenant(tenantId: string, tx?: TransactionContext): Promise<void>;
}

export class ReportingProjectionRepository implements IReportingProjectionRepository {
  private static store = createRecordStore<string, ReportingDailySnapshot>("reporting-projection.repository:store");

  static clear(): void {
    ReportingProjectionRepository.store.clear();
  }

  private getKey(tenantId: string, date: string, currency: string): string {
    return `${tenantId}:${date}:${currency.toUpperCase()}`;
  }

  async upsertDailySnapshot(
    data: Omit<ReportingDailySnapshot, "id" | "updatedAt">,
    _tx?: TransactionContext
  ): Promise<ReportingDailySnapshot> {
    const key = this.getKey(data.tenantId, data.date, data.currency);
    const existing = ReportingProjectionRepository.store.get(key);
    const id = existing?.id || `rds-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const snapshot: ReportingDailySnapshot = {
      ...data,
      id,
      updatedAt: now,
    };

    ReportingProjectionRepository.store.set(key, snapshot);
    return { ...snapshot };
  }

  async getDailySnapshots(
    tenantId: string,
    from: string,
    to: string,
    currency?: string,
    _tx?: TransactionContext
  ): Promise<ReportingDailySnapshot[]> {
    const items = Array.from(ReportingProjectionRepository.store.values()).filter(
      (s) => {
        if (s.tenantId !== tenantId) return false;
        if (currency && s.currency.toUpperCase() !== currency.toUpperCase()) return false;
        return s.date >= from && s.date <= to;
      }
    );

    return items
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => ({ ...s }));
  }

  async getLatestSnapshot(
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<ReportingDailySnapshot | null> {
    const tenantItems = Array.from(ReportingProjectionRepository.store.values())
      .filter((s) => s.tenantId === tenantId)
      .sort((a, b) => b.date.localeCompare(a.date));

    return tenantItems.length > 0 ? { ...tenantItems[0] } : null;
  }

  async deleteByTenant(tenantId: string, _tx?: TransactionContext): Promise<void> {
    for (const [key, val] of ReportingProjectionRepository.store.entries()) {
      if (val.tenantId === tenantId) {
        ReportingProjectionRepository.store.delete(key);
      }
    }
  }
}
