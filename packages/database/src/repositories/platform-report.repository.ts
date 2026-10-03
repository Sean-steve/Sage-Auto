import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — PLATFORM REPORT REPOSITORY (Sprint 35)
// Tracks executions and presets for Platform SaaS Analytics Reports
// ============================================================================

import type {
  PlatformReportExecutionRecord,
  PlatformSavedReportRecord,
  PlatformReportType,
  PlatformReportFilter,
} from "@carhire/types";
import { TransactionContext } from "../transaction-manager";

export interface IPlatformReportRepository {
  createExecution(
    data: Omit<PlatformReportExecutionRecord, "id" | "createdAt">,
    tx?: TransactionContext
  ): Promise<PlatformReportExecutionRecord>;
  getExecutions(params?: {
    reportType?: PlatformReportType;
    limit?: number;
  }, tx?: TransactionContext): Promise<PlatformReportExecutionRecord[]>;
  getExecutionById(id: string, tx?: TransactionContext): Promise<PlatformReportExecutionRecord | null>;
  saveReport(
    data: Omit<PlatformSavedReportRecord, "id" | "createdAt" | "updatedAt">,
    tx?: TransactionContext
  ): Promise<PlatformSavedReportRecord>;
  getSavedReports(tx?: TransactionContext): Promise<PlatformSavedReportRecord[]>;
  getSavedReportById(id: string, tx?: TransactionContext): Promise<PlatformSavedReportRecord | null>;
  deleteSavedReport(id: string, tx?: TransactionContext): Promise<boolean>;
  clear(): void;
}

export class PlatformReportRepository implements IPlatformReportRepository {
  private static executions: PlatformReportExecutionRecord[] = [];
  private static savedReports = createRecordStore<string, PlatformSavedReportRecord>("platform-report.repository:savedReports");

  static clear(): void {
    PlatformReportRepository.executions = [];
    PlatformReportRepository.savedReports.clear();
  }

  clear(): void {
    PlatformReportRepository.executions = [];
    PlatformReportRepository.savedReports.clear();
  }

  async createExecution(
    data: Omit<PlatformReportExecutionRecord, "id" | "createdAt">,
    _tx?: TransactionContext
  ): Promise<PlatformReportExecutionRecord> {
    const id = `pexec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const record: PlatformReportExecutionRecord = {
      ...data,
      id,
      createdAt: now,
    };

    PlatformReportRepository.executions.push(record);
    return { ...record };
  }

  async getExecutions(
    params?: { reportType?: PlatformReportType; limit?: number },
    _tx?: TransactionContext
  ): Promise<PlatformReportExecutionRecord[]> {
    let list = [...PlatformReportRepository.executions];

    if (params?.reportType) {
      list = list.filter((e) => e.reportType === params.reportType);
    }

    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (params?.limit && params.limit > 0) {
      list = list.slice(0, params.limit);
    }

    return list.map((e) => ({ ...e }));
  }

  async getExecutionById(
    id: string,
    _tx?: TransactionContext
  ): Promise<PlatformReportExecutionRecord | null> {
    const found = PlatformReportRepository.executions.find((e) => e.id === id);
    return found ? { ...found } : null;
  }

  async saveReport(
    data: Omit<PlatformSavedReportRecord, "id" | "createdAt" | "updatedAt">,
    _tx?: TransactionContext
  ): Promise<PlatformSavedReportRecord> {
    const id = `psaved-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const record: PlatformSavedReportRecord = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };

    PlatformReportRepository.savedReports.set(id, record);
    return { ...record };
  }

  async getSavedReports(_tx?: TransactionContext): Promise<PlatformSavedReportRecord[]> {
    return Array.from(PlatformReportRepository.savedReports.values()).map((r) => ({ ...r }));
  }

  async getSavedReportById(
    id: string,
    _tx?: TransactionContext
  ): Promise<PlatformSavedReportRecord | null> {
    const found = PlatformReportRepository.savedReports.get(id);
    return found ? { ...found } : null;
  }

  async deleteSavedReport(id: string, _tx?: TransactionContext): Promise<boolean> {
    return PlatformReportRepository.savedReports.delete(id);
  }
}
