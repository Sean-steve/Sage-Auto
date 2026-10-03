import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — OWNER SETTLEMENT PERIOD REPOSITORY (Sprint 21: DOM-003 §41-45)
// Multi-Tenant Repository for Settlement Periods, Calendars, and Status Tracking
// ============================================================================

import type {
  OwnerSettlementPeriod,
  ListOwnerSettlementPeriodsFilter,
  OwnerSettlementPeriodType,
} from "@carhire/types";
import {
  SettlementPeriodNotFoundError,
  CrossTenantViolationError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IOwnerSettlementPeriodRepository {
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<OwnerSettlementPeriod | null>;
  findByPeriodNumber(periodNumber: string, tenantId?: string, tx?: TransactionContext): Promise<OwnerSettlementPeriod | null>;
  findPeriodForDate(date: string, tenantId: string, tx?: TransactionContext): Promise<OwnerSettlementPeriod | null>;
  findOverlappingPeriod(
    startDate: string,
    endDate: string,
    tenantId: string,
    excludeId?: string,
    tx?: TransactionContext
  ): Promise<OwnerSettlementPeriod | null>;
  listByTenant(
    tenantId: string,
    filter?: ListOwnerSettlementPeriodsFilter,
    tx?: TransactionContext
  ): Promise<OwnerSettlementPeriod[]>;
  create(
    data: Omit<OwnerSettlementPeriod, "id" | "periodNumber" | "version" | "createdAt" | "updatedAt"> & {
      id?: string;
      periodNumber?: string;
    },
    tx?: TransactionContext
  ): Promise<OwnerSettlementPeriod>;
  update(
    id: string,
    tenantId: string,
    updates: Partial<OwnerSettlementPeriod>,
    tx?: TransactionContext
  ): Promise<OwnerSettlementPeriod>;
  nextPeriodNumber(tenantId: string, periodType: OwnerSettlementPeriodType, year: number, tx?: TransactionContext): Promise<string>;
}

export class OwnerSettlementPeriodRepository implements IOwnerSettlementPeriodRepository {
  private static store = createRecordStore<string, OwnerSettlementPeriod>("owner-settlement-period.repository:store");
  private static sequences = createRecordStore<string, number>("owner-settlement-period.repository:sequences");

  static clear(): void {
    OwnerSettlementPeriodRepository.store.clear();
    OwnerSettlementPeriodRepository.sequences.clear();
  }

  async nextPeriodNumber(tenantId: string, periodType: OwnerSettlementPeriodType, year: number): Promise<string> {
    const key = `${tenantId}:${year}:${periodType}`;
    const seq = (OwnerSettlementPeriodRepository.sequences.get(key) || 0) + 1;
    OwnerSettlementPeriodRepository.sequences.set(key, seq);
    const prefix = periodType === "MONTHLY" ? "M" : periodType === "WEEKLY" ? "W" : "P";
    return `PER-${year}-${prefix}${String(seq).padStart(2, "0")}`;
  }

  async findById(id: string, tenantId?: string): Promise<OwnerSettlementPeriod | null> {
    const period = OwnerSettlementPeriodRepository.store.get(id);
    if (!period) return null;
    if (tenantId && period.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, period.tenantId);
    }
    return { ...period };
  }

  async findByPeriodNumber(periodNumber: string, tenantId?: string): Promise<OwnerSettlementPeriod | null> {
    for (const period of OwnerSettlementPeriodRepository.store.values()) {
      if (period.periodNumber === periodNumber) {
        if (tenantId && period.tenantId !== tenantId) {
          throw new CrossTenantViolationError(tenantId, period.tenantId);
        }
        return { ...period };
      }
    }
    return null;
  }

  async findPeriodForDate(date: string, tenantId: string): Promise<OwnerSettlementPeriod | null> {
    for (const period of OwnerSettlementPeriodRepository.store.values()) {
      if (period.tenantId === tenantId && period.startDate <= date && period.endDate >= date) {
        return { ...period };
      }
    }
    return null;
  }

  async findOverlappingPeriod(
    startDate: string,
    endDate: string,
    tenantId: string,
    excludeId?: string
  ): Promise<OwnerSettlementPeriod | null> {
    for (const period of OwnerSettlementPeriodRepository.store.values()) {
      if (period.tenantId !== tenantId) continue;
      if (excludeId && period.id === excludeId) continue;

      // Check date overlap: period.startDate <= endDate && period.endDate >= startDate
      if (period.startDate <= endDate && period.endDate >= startDate) {
        return { ...period };
      }
    }
    return null;
  }

  async listByTenant(tenantId: string, filter?: ListOwnerSettlementPeriodsFilter): Promise<OwnerSettlementPeriod[]> {
    const results: OwnerSettlementPeriod[] = [];

    for (const period of OwnerSettlementPeriodRepository.store.values()) {
      if (period.tenantId !== tenantId) continue;
      if (filter?.status && period.status !== filter.status) continue;
      if (filter?.periodType && period.periodType !== filter.periodType) continue;
      if (filter?.year) {
        const pYear = new Date(period.startDate).getFullYear();
        if (pYear !== filter.year) continue;
      }
      results.push({ ...period });
    }

    return results.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }

  async create(
    data: Omit<OwnerSettlementPeriod, "id" | "periodNumber" | "version" | "createdAt" | "updatedAt"> & {
      id?: string;
      periodNumber?: string;
    }
  ): Promise<OwnerSettlementPeriod> {
    const id = data.id || `per_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const year = new Date(data.startDate).getFullYear();
    const periodNumber = data.periodNumber || (await this.nextPeriodNumber(data.tenantId, data.periodType, year));
    const now = new Date().toISOString();

    const period: OwnerSettlementPeriod = {
      ...data,
      id,
      periodNumber,
      settlementCount: data.settlementCount ?? 0,
      totalGrossRevenue: data.totalGrossRevenue ?? "0.0000",
      totalOwnerPayout: data.totalOwnerPayout ?? "0.0000",
      totalOperatorRevenue: data.totalOperatorRevenue ?? "0.0000",
      totalDeductions: data.totalDeductions ?? "0.0000",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    OwnerSettlementPeriodRepository.store.set(id, period);
    return { ...period };
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<OwnerSettlementPeriod>
  ): Promise<OwnerSettlementPeriod> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new SettlementPeriodNotFoundError(id);
    }
    if (existing.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, existing.tenantId);
    }

    const updated: OwnerSettlementPeriod = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    OwnerSettlementPeriodRepository.store.set(id, updated);
    return { ...updated };
  }
}
