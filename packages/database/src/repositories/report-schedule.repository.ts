import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — REPORT SCHEDULE REPOSITORY (Sprint 34: DOM-003, DEV-009)
// Multi-tenant automated reporting schedule registry
// ============================================================================

import type { ReportSchedule } from "@carhire/types";
import { ReportScheduleNotFoundError, CrossTenantViolationError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IReportScheduleRepository {
  create(data: Omit<ReportSchedule, "id" | "createdAt" | "updatedAt">, tx?: TransactionContext): Promise<ReportSchedule>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<ReportSchedule | null>;
  update(
    id: string,
    tenantId: string,
    data: Partial<Omit<ReportSchedule, "id" | "tenantId" | "createdAt">>,
    tx?: TransactionContext
  ): Promise<ReportSchedule>;
  delete(id: string, tenantId: string, tx?: TransactionContext): Promise<boolean>;
  listByTenant(tenantId: string, tx?: TransactionContext): Promise<ReportSchedule[]>;
  listDueSchedules(asOf: string): Promise<ReportSchedule[]>;
}

export class ReportScheduleRepository implements IReportScheduleRepository {
  private static store = createRecordStore<string, ReportSchedule>("report-schedule.repository:store");
  private static counter = 1000;

  static clear(): void {
    ReportScheduleRepository.store.clear();
    ReportScheduleRepository.counter = 1000;
  }

  async create(
    data: Omit<ReportSchedule, "id" | "createdAt" | "updatedAt">,
    _tx?: TransactionContext
  ): Promise<ReportSchedule> {
    const id = `rsch-${Date.now()}-${(++ReportScheduleRepository.counter).toString().padStart(4, "0")}`;
    const now = new Date().toISOString();
    const schedule: ReportSchedule = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    ReportScheduleRepository.store.set(id, schedule);
    return { ...schedule };
  }

  async findById(id: string, tenantId?: string, _tx?: TransactionContext): Promise<ReportSchedule | null> {
    const schedule = ReportScheduleRepository.store.get(id);
    if (!schedule) return null;
    if (tenantId && schedule.tenantId !== tenantId) {
      throw new CrossTenantViolationError(schedule.tenantId, tenantId);
    }
    return { ...schedule };
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<Omit<ReportSchedule, "id" | "tenantId" | "createdAt">>,
    _tx?: TransactionContext
  ): Promise<ReportSchedule> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new ReportScheduleNotFoundError(id, tenantId);
    }

    const updated: ReportSchedule = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    ReportScheduleRepository.store.set(id, updated);
    return { ...updated };
  }

  async delete(id: string, tenantId: string, _tx?: TransactionContext): Promise<boolean> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new ReportScheduleNotFoundError(id, tenantId);
    }
    return ReportScheduleRepository.store.delete(id);
  }

  async listByTenant(tenantId: string, _tx?: TransactionContext): Promise<ReportSchedule[]> {
    return Array.from(ReportScheduleRepository.store.values())
      .filter((s) => s.tenantId === tenantId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((s) => ({ ...s }));
  }

  async listDueSchedules(asOf: string): Promise<ReportSchedule[]> {
    const asOfTime = new Date(asOf).getTime();
    return Array.from(ReportScheduleRepository.store.values())
      .filter((s) => s.enabled && s.nextRunAt && new Date(s.nextRunAt).getTime() <= asOfTime)
      .map((s) => ({ ...s }));
  }
}
