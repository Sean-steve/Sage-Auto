import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — COMPLIANCE ISSUE REPOSITORY (DEV-006, DEV-009, DOM-003 §21-24)
// Operational Blocker & Compliance Remediation Persistence
// ============================================================================

import type {
  ComplianceIssue,
  ComplianceIssueSeverity,
  ComplianceIssueStatus,
  ComplianceSubjectType,
} from "@carhire/types";
import { RecordNotFoundError, CrossTenantViolationError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IComplianceIssueRepository {
  findById(id: string, tenantId: string, tx?: TransactionContext): Promise<ComplianceIssue | null>;
  findBySubject(
    subjectType: ComplianceSubjectType,
    subjectId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<ComplianceIssue[]>;
  findOpenBlockingIssues(
    subjectType: ComplianceSubjectType,
    subjectId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<ComplianceIssue[]>;
  list(
    tenantId: string,
    filters?: {
      subjectType?: ComplianceSubjectType;
      subjectId?: string;
      requirementCode?: string;
      status?: ComplianceIssueStatus;
      severity?: ComplianceIssueSeverity;
    },
    tx?: TransactionContext
  ): Promise<ComplianceIssue[]>;
  create(
    data: Omit<ComplianceIssue, "id" | "createdAt" | "updatedAt" | "version">,
    tx?: TransactionContext
  ): Promise<ComplianceIssue>;
  update(
    id: string,
    tenantId: string,
    data: Partial<ComplianceIssue>,
    tx?: TransactionContext
  ): Promise<ComplianceIssue>;
  delete(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;
}

export class ComplianceIssueRepository implements IComplianceIssueRepository {
  private static store = createRecordStore<string, ComplianceIssue>("compliance-issue.repository:store");

  async findById(id: string, tenantId: string): Promise<ComplianceIssue | null> {
    const item = ComplianceIssueRepository.store.get(id);
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
  ): Promise<ComplianceIssue[]> {
    return Array.from(ComplianceIssueRepository.store.values())
      .filter((i) => i.tenantId === tenantId && i.subjectType === subjectType && i.subjectId === subjectId)
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
      .map((i) => ({ ...i }));
  }

  async findOpenBlockingIssues(
    subjectType: ComplianceSubjectType,
    subjectId: string,
    tenantId: string
  ): Promise<ComplianceIssue[]> {
    return Array.from(ComplianceIssueRepository.store.values())
      .filter(
        (i) =>
          i.tenantId === tenantId &&
          i.subjectType === subjectType &&
          i.subjectId === subjectId &&
          (i.status === "OPEN" || i.status === "IN_REMEDIATION") &&
          i.blockingPolicy !== "WARNING_ONLY"
      )
      .map((i) => ({ ...i }));
  }

  async list(
    tenantId: string,
    filters?: {
      subjectType?: ComplianceSubjectType;
      subjectId?: string;
      requirementCode?: string;
      status?: ComplianceIssueStatus;
      severity?: ComplianceIssueSeverity;
    }
  ): Promise<ComplianceIssue[]> {
    let items = Array.from(ComplianceIssueRepository.store.values()).filter((i) => i.tenantId === tenantId);
    if (filters?.subjectType) {
      items = items.filter((i) => i.subjectType === filters.subjectType);
    }
    if (filters?.subjectId) {
      items = items.filter((i) => i.subjectId === filters.subjectId);
    }
    if (filters?.requirementCode) {
      items = items.filter((i) => i.requirementCode === filters.requirementCode);
    }
    if (filters?.status) {
      items = items.filter((i) => i.status === filters.status);
    }
    if (filters?.severity) {
      items = items.filter((i) => i.severity === filters.severity);
    }
    return items.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()).map((i) => ({ ...i }));
  }

  async create(
    data: Omit<ComplianceIssue, "id" | "createdAt" | "updatedAt" | "version">
  ): Promise<ComplianceIssue> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const item: ComplianceIssue = {
      ...data,
      id,
      status: data.status || "OPEN",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    ComplianceIssueRepository.store.set(id, item);
    return { ...item };
  }

  async update(id: string, tenantId: string, data: Partial<ComplianceIssue>): Promise<ComplianceIssue> {
    const existing = await this.findById(id, tenantId);
    if (!existing) {
      throw new RecordNotFoundError("compliance_issues", id);
    }
    const updated: ComplianceIssue = {
      ...existing,
      ...data,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };
    ComplianceIssueRepository.store.set(id, updated);
    return { ...updated };
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return;
    ComplianceIssueRepository.store.delete(id);
  }

  static _reset(): void {
    ComplianceIssueRepository.store.clear();
  }
}
