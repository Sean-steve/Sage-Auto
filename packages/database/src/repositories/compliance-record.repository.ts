import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — COMPLIANCE RECORD PERSISTENCE REPOSITORY (DEV-006, DEV-009, DOM-003 §21-24)
// Compliance Records & Operational Evidence Persistence
// ============================================================================

import type {
  ComplianceRecord,
  ComplianceRecordHistoryItem,
  ComplianceRecordStatus,
  ComplianceSubjectType,
  ComplianceVerificationStatus,
} from "@carhire/types";
import { RecordNotFoundError, CrossTenantViolationError, ConcurrencyConflictError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IComplianceRecordRepository {
  findById(id: string, tenantId: string, tx?: TransactionContext): Promise<ComplianceRecord | null>;
  findBySubject(
    subjectType: ComplianceSubjectType,
    subjectId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<ComplianceRecord[]>;
  findByRequirement(
    requirementCode: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<ComplianceRecord[]>;
  list(
    tenantId: string,
    filters?: {
      subjectType?: ComplianceSubjectType;
      subjectId?: string;
      requirementCode?: string;
      status?: ComplianceRecordStatus;
      verificationStatus?: ComplianceVerificationStatus;
    },
    tx?: TransactionContext
  ): Promise<ComplianceRecord[]>;
  listByTenant(tenantId: string, tx?: TransactionContext): Promise<ComplianceRecord[]>;
  findActiveRecordsForSubject(
    subjectType: ComplianceSubjectType,
    subjectId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<ComplianceRecord[]>;
  create(
    data: Omit<ComplianceRecord, "id" | "createdAt" | "updatedAt" | "version">,
    tx?: TransactionContext
  ): Promise<ComplianceRecord>;
  update(
    id: string,
    tenantId: string,
    data: Partial<ComplianceRecord>,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<ComplianceRecord>;
  delete(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;
  addHistory(
    item: Omit<ComplianceRecordHistoryItem, "id" | "createdAt">,
    tx?: TransactionContext
  ): Promise<ComplianceRecordHistoryItem>;
  getHistory(recordId: string, tenantId: string, tx?: TransactionContext): Promise<ComplianceRecordHistoryItem[]>;
}

export function maskIdentifierNumber(val?: string): string | undefined {
  if (!val) return undefined;
  const trimmed = val.trim();
  if (trimmed.length <= 4) return "****";
  const lastFour = trimmed.slice(-4);
  const prefix = trimmed.slice(0, Math.min(2, trimmed.length - 4));
  return `${prefix}****${lastFour}`;
}

export class ComplianceRecordRepository implements IComplianceRecordRepository {
  private static store = createRecordStore<string, ComplianceRecord>("compliance-record.repository:store");
  private static historyStore: ComplianceRecordHistoryItem[] = [];

  async findById(id: string, tenantId: string): Promise<ComplianceRecord | null> {
    const item = ComplianceRecordRepository.store.get(id);
    if (!item) return null;
    if (item.tenantId !== tenantId) {
      throw new CrossTenantViolationError(item.tenantId, tenantId);
    }
    return { ...item };
  }

  async findBySubject(
    subjectType: ComplianceSubjectType,
    subjectId: string,
    tenantId: string
  ): Promise<ComplianceRecord[]> {
    return Array.from(ComplianceRecordRepository.store.values())
      .filter((r) => r.tenantId === tenantId && r.subjectType === subjectType && r.subjectId === subjectId)
      .sort((a, b) => new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime())
      .map((r) => ({ ...r }));
  }

  async findByRequirement(requirementCode: string, tenantId: string): Promise<ComplianceRecord[]> {
    return Array.from(ComplianceRecordRepository.store.values())
      .filter((r) => r.tenantId === tenantId && r.requirementCode === requirementCode)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((r) => ({ ...r }));
  }

  async list(
    tenantId: string,
    filters?: {
      subjectType?: ComplianceSubjectType;
      subjectId?: string;
      requirementCode?: string;
      status?: ComplianceRecordStatus;
      verificationStatus?: ComplianceVerificationStatus;
    }
  ): Promise<ComplianceRecord[]> {
    let items = Array.from(ComplianceRecordRepository.store.values()).filter((r) => r.tenantId === tenantId);
    if (filters?.subjectType) {
      items = items.filter((r) => r.subjectType === filters.subjectType);
    }
    if (filters?.subjectId) {
      items = items.filter((r) => r.subjectId === filters.subjectId);
    }
    if (filters?.requirementCode) {
      items = items.filter((r) => r.requirementCode === filters.requirementCode);
    }
    if (filters?.status) {
      items = items.filter((r) => r.status === filters.status);
    }
    if (filters?.verificationStatus) {
      items = items.filter((r) => r.verificationStatus === filters.verificationStatus);
    }
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((r) => ({ ...r }));
  }

  async listByTenant(tenantId: string): Promise<ComplianceRecord[]> {
    return this.list(tenantId);
  }

  async findActiveRecordsForSubject(
    subjectType: ComplianceSubjectType,
    subjectId: string,
    tenantId: string
  ): Promise<ComplianceRecord[]> {
    return Array.from(ComplianceRecordRepository.store.values())
      .filter(
        (r) =>
          r.tenantId === tenantId &&
          r.subjectType === subjectType &&
          r.subjectId === subjectId &&
          r.verificationStatus === "VERIFIED" &&
          (r.status === "VALID" || r.status === "DUE_SOON")
      )
      .map((r) => ({ ...r }));
  }

  async create(
    data: Omit<ComplianceRecord, "id" | "createdAt" | "updatedAt" | "version">
  ): Promise<ComplianceRecord> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const masked = data.maskedIdentifier ?? maskIdentifierNumber(data.identifierNumber);

    const item: ComplianceRecord = {
      ...data,
      id,
      maskedIdentifier: masked,
      status: data.status || "PENDING",
      verificationStatus: data.verificationStatus || "UNVERIFIED",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    ComplianceRecordRepository.store.set(id, item);

    await this.addHistory({
      tenantId: item.tenantId,
      recordId: item.id,
      action: "CREATED",
      newStatus: item.status,
      newVerificationStatus: item.verificationStatus,
      metadata: { requirementCode: item.requirementCode, subjectId: item.subjectId },
    });

    return { ...item };
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<ComplianceRecord>,
    expectedVersion?: number
  ): Promise<ComplianceRecord> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new RecordNotFoundError("compliance_records", id);
    }
    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Optimistic concurrency violation: Expected compliance record version ${expectedVersion} but found ${existing.version}.`
      );
    }

    const masked = data.identifierNumber
      ? maskIdentifierNumber(data.identifierNumber)
      : existing.maskedIdentifier;

    const updated: ComplianceRecord = {
      ...existing,
      ...data,
      maskedIdentifier: masked,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    ComplianceRecordRepository.store.set(id, updated);
    return { ...updated };
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return;
    ComplianceRecordRepository.store.delete(id);
  }

  async addHistory(
    item: Omit<ComplianceRecordHistoryItem, "id" | "createdAt">
  ): Promise<ComplianceRecordHistoryItem> {
    const record: ComplianceRecordHistoryItem = {
      ...item,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    ComplianceRecordRepository.historyStore.push(record);
    return { ...record };
  }

  async getHistory(recordId: string, tenantId: string): Promise<ComplianceRecordHistoryItem[]> {
    return ComplianceRecordRepository.historyStore
      .filter((h) => h.tenantId === tenantId && h.recordId === recordId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((h) => ({ ...h }));
  }

  static _reset(): void {
    ComplianceRecordRepository.store.clear();
    ComplianceRecordRepository.historyStore = [];
  }
}
