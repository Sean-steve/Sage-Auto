import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — COMPLIANCE OVERRIDE REPOSITORY (DEV-006, DEV-009, DOM-003 §21-24)
// Emergency Operational Overrides & Audit Persistence
// ============================================================================

import type {
  ComplianceOperationContext,
  ComplianceOverride,
  ComplianceSubjectType,
} from "@carhire/types";
import { RecordNotFoundError, CrossTenantViolationError } from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface IComplianceOverrideRepository {
  findById(id: string, tenantId: string, tx?: TransactionContext): Promise<ComplianceOverride | null>;
  findBySubject(
    subjectType: ComplianceSubjectType,
    subjectId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<ComplianceOverride[]>;
  findActiveOverride(
    subjectType: ComplianceSubjectType,
    subjectId: string,
    requirementCode: string,
    operationContext: ComplianceOperationContext,
    tenantId: string,
    asOfDate: Date,
    tx?: TransactionContext
  ): Promise<ComplianceOverride | null>;
  list(tenantId: string, tx?: TransactionContext): Promise<ComplianceOverride[]>;
  create(data: Omit<ComplianceOverride, "id" | "createdAt">, tx?: TransactionContext): Promise<ComplianceOverride>;
  delete(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;
}

export class ComplianceOverrideRepository implements IComplianceOverrideRepository {
  private static store = createRecordStore<string, ComplianceOverride>("compliance-override.repository:store");

  async findById(id: string, tenantId: string): Promise<ComplianceOverride | null> {
    const item = ComplianceOverrideRepository.store.get(id);
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
  ): Promise<ComplianceOverride[]> {
    return Array.from(ComplianceOverrideRepository.store.values())
      .filter((o) => o.tenantId === tenantId && o.subjectType === subjectType && o.subjectId === subjectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((o) => ({ ...o }));
  }

  async findActiveOverride(
    subjectType: ComplianceSubjectType,
    subjectId: string,
    requirementCode: string,
    operationContext: ComplianceOperationContext,
    tenantId: string,
    asOfDate: Date
  ): Promise<ComplianceOverride | null> {
    const asOfTime = asOfDate.getTime();
    const matches = Array.from(ComplianceOverrideRepository.store.values()).filter(
      (o) =>
        o.tenantId === tenantId &&
        o.subjectType === subjectType &&
        o.subjectId === subjectId &&
        o.requirementCode === requirementCode &&
        o.operationContext === operationContext &&
        new Date(o.validUntil).getTime() > asOfTime
    );

    if (matches.length === 0) return null;
    matches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { ...matches[0] };
  }

  async list(tenantId: string): Promise<ComplianceOverride[]> {
    return Array.from(ComplianceOverrideRepository.store.values())
      .filter((o) => o.tenantId === tenantId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((o) => ({ ...o }));
  }

  async create(data: Omit<ComplianceOverride, "id" | "createdAt">): Promise<ComplianceOverride> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const item: ComplianceOverride = {
      ...data,
      id,
      createdAt: now,
    };
    ComplianceOverrideRepository.store.set(id, item);
    return { ...item };
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const existing = await this.findById(id, tenantId);
    if (!existing) return;
    ComplianceOverrideRepository.store.delete(id);
  }

  static _reset(): void {
    ComplianceOverrideRepository.store.clear();
  }
}
