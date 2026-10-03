import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — REPORT EXECUTION REPOSITORY (Sprint 34: DOM-003, DEV-009)
// Asynchronous report generation, export jobs and status tracking
// ============================================================================

import type { ReportExecution, ReportExecutionStatus } from "@carhire/types";
import { ReportExecutionNotFoundError, CrossTenantViolationError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IReportExecutionRepository {
  create(data: Omit<ReportExecution, "id" | "requestedAt">, tx?: TransactionContext): Promise<ReportExecution>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<ReportExecution | null>;
  updateStatus(
    id: string,
    tenantId: string,
    status: ReportExecutionStatus,
    extra?: {
      fileId?: string;
      downloadUrl?: string;
      rowCount?: number;
      fileSize?: number;
      error?: string;
      completedAt?: string;
      dataAsOf?: string;
    },
    tx?: TransactionContext
  ): Promise<ReportExecution>;
  update(
    id: string,
    tenantId: string,
    updates: Partial<Omit<ReportExecution, "id" | "tenantId">>,
    tx?: TransactionContext
  ): Promise<ReportExecution>;
  listByTenant(
    tenantId: string,
    filter?: { status?: ReportExecutionStatus; limit?: number },
    tx?: TransactionContext
  ): Promise<ReportExecution[]>;
}

export class ReportExecutionRepository implements IReportExecutionRepository {
  private static store = createRecordStore<string, ReportExecution>("report-execution.repository:store");
  private static counter = 1000;

  static clear(): void {
    ReportExecutionRepository.store.clear();
    ReportExecutionRepository.counter = 1000;
  }

  async create(
    data: Omit<ReportExecution, "id" | "requestedAt">,
    _tx?: TransactionContext
  ): Promise<ReportExecution> {
    const id = `rex-${Date.now()}-${(++ReportExecutionRepository.counter).toString().padStart(5, "0")}`;
    const execution: ReportExecution = {
      ...data,
      id,
      requestedAt: new Date().toISOString(),
    };
    ReportExecutionRepository.store.set(id, execution);
    return { ...execution };
  }

  async findById(id: string, tenantId?: string, _tx?: TransactionContext): Promise<ReportExecution | null> {
    const execution = ReportExecutionRepository.store.get(id);
    if (!execution) return null;
    if (tenantId && execution.tenantId !== tenantId) {
      throw new CrossTenantViolationError(execution.tenantId, tenantId);
    }
    return { ...execution };
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: ReportExecutionStatus,
    extra?: {
      fileId?: string;
      downloadUrl?: string;
      rowCount?: number;
      fileSize?: number;
      error?: string;
      completedAt?: string;
      dataAsOf?: string;
    },
    _tx?: TransactionContext
  ): Promise<ReportExecution> {
    const execution = await this.findById(id, tenantId);
    if (!execution) {
      throw new ReportExecutionNotFoundError(id, tenantId);
    }

    const updated: ReportExecution = {
      ...execution,
      status,
      ...(extra?.fileId !== undefined && { fileId: extra.fileId }),
      ...(extra?.downloadUrl !== undefined && { downloadUrl: extra.downloadUrl }),
      ...(extra?.rowCount !== undefined && { rowCount: extra.rowCount }),
      ...(extra?.fileSize !== undefined && { fileSize: extra.fileSize }),
      ...(extra?.error !== undefined && { error: extra.error }),
      ...(extra?.completedAt !== undefined && { completedAt: extra.completedAt }),
      ...(extra?.dataAsOf !== undefined && { dataAsOf: extra.dataAsOf }),
      ...(status === "RUNNING" && !execution.startedAt && { startedAt: new Date().toISOString() }),
    };

    ReportExecutionRepository.store.set(id, updated);
    return { ...updated };
  }

  async update(
    id: string,
    tenantId: string,
    updates: Partial<Omit<ReportExecution, "id" | "tenantId">>,
    _tx?: TransactionContext
  ): Promise<ReportExecution> {
    const execution = await this.findById(id, tenantId);
    if (!execution) {
      throw new ReportExecutionNotFoundError(id, tenantId);
    }
    const updated: ReportExecution = {
      ...execution,
      ...updates,
    };
    ReportExecutionRepository.store.set(id, updated);
    return { ...updated };
  }

  async listByTenant(
    tenantId: string,
    filter?: { status?: ReportExecutionStatus; limit?: number },
    _tx?: TransactionContext
  ): Promise<ReportExecution[]> {
    let items = Array.from(ReportExecutionRepository.store.values()).filter(
      (e) => e.tenantId === tenantId
    );

    if (filter?.status) {
      items = items.filter((e) => e.status === filter.status);
    }

    items.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());

    if (filter?.limit) {
      items = items.slice(0, filter.limit);
    }

    return items.map((e) => ({ ...e }));
  }
}
