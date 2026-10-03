import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — STORAGE RECONCILIATION REPOSITORY (DATA-002 §12, SEC-001)
// Discrepancy, orphan object, and storage consistency tracking
// ============================================================================

import { StorageReconciliationIssue } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";
import { CrossTenantViolationError } from "../errors";

export interface CreateStorageReconciliationIssueInput {
  id?: string;
  tenantId: string;
  fileId?: string;
  objectKey: string;
  issueType:
    | "MISSING_OBJECT"
    | "ORPHAN_OBJECT"
    | "STUCK_PENDING"
    | "STUCK_QUARANTINED"
    | "CHECKSUM_MISMATCH"
    | "SIZE_MISMATCH";
  details?: Record<string, any>;
}

export interface IStorageReconciliationRepository {
  create(input: CreateStorageReconciliationIssueInput, tx?: TransactionContext): Promise<StorageReconciliationIssue>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<StorageReconciliationIssue | null>;
  listByTenant(
    tenantId: string,
    status?: "DETECTED" | "RESOLVED" | "IGNORED",
    tx?: TransactionContext
  ): Promise<StorageReconciliationIssue[]>;
  resolve(id: string, tenantId?: string, tx?: TransactionContext): Promise<StorageReconciliationIssue>;
  ignore(id: string, tenantId?: string, tx?: TransactionContext): Promise<StorageReconciliationIssue>;
}

export class StorageReconciliationRepository implements IStorageReconciliationRepository {
  private static store = createRecordStore<string, StorageReconciliationIssue>("storage-reconciliation.repository:store");

  public static clear(): void {
    StorageReconciliationRepository.store.clear();
  }

  async create(input: CreateStorageReconciliationIssueInput, _tx?: TransactionContext): Promise<StorageReconciliationIssue> {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const issue: StorageReconciliationIssue = {
      id,
      tenantId: input.tenantId,
      fileId: input.fileId,
      objectKey: input.objectKey,
      issueType: input.issueType,
      status: "DETECTED",
      details: input.details,
      detectedAt: now,
    };

    StorageReconciliationRepository.store.set(id, issue);
    return { ...issue };
  }

  async findById(id: string, tenantId?: string, _tx?: TransactionContext): Promise<StorageReconciliationIssue | null> {
    const issue = StorageReconciliationRepository.store.get(id);
    if (!issue) return null;

    if (tenantId && issue.tenantId !== tenantId) {
      throw new CrossTenantViolationError(issue.tenantId, tenantId);
    }

    return { ...issue };
  }

  async listByTenant(
    tenantId: string,
    status?: "DETECTED" | "RESOLVED" | "IGNORED",
    _tx?: TransactionContext
  ): Promise<StorageReconciliationIssue[]> {
    return Array.from(StorageReconciliationRepository.store.values())
      .filter((i) => i.tenantId === tenantId && (!status || i.status === status))
      .map((i) => ({ ...i }));
  }

  async resolve(id: string, tenantId?: string, _tx?: TransactionContext): Promise<StorageReconciliationIssue> {
    const issue = await this.findById(id, tenantId);
    if (!issue) throw new Error(`Reconciliation issue not found with ID ${id}`);

    const updated: StorageReconciliationIssue = {
      ...issue,
      status: "RESOLVED",
      resolvedAt: new Date().toISOString(),
    };

    StorageReconciliationRepository.store.set(id, updated);
    return { ...updated };
  }

  async ignore(id: string, tenantId?: string, _tx?: TransactionContext): Promise<StorageReconciliationIssue> {
    const issue = await this.findById(id, tenantId);
    if (!issue) throw new Error(`Reconciliation issue not found with ID ${id}`);

    const updated: StorageReconciliationIssue = {
      ...issue,
      status: "IGNORED",
    };

    StorageReconciliationRepository.store.set(id, updated);
    return { ...updated };
  }
}
