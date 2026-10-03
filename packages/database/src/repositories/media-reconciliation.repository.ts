import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — MEDIA RECONCILIATION REPOSITORY (DATA-002 §12, SEC-001)
// Discrepancy, orphan derivative object, and storage consistency tracking
// ============================================================================

import { MediaReconciliationIssueRecord } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";
import { CrossTenantViolationError } from "../errors";

export interface CreateMediaReconciliationIssueInput {
  id?: string;
  tenantId: string;
  mediaAssetId?: string;
  mediaDerivativeId?: string;
  objectKey: string;
  issueType:
    | "ORPHAN_DERIVATIVE_OBJECT"
    | "MISSING_DERIVATIVE_OBJECT"
    | "STUCK_PROCESSING_REQUEST"
    | "PROFILE_VERSION_INCOMPLETE";
  details?: Record<string, unknown>;
}

export interface IMediaReconciliationRepository {
  create(input: CreateMediaReconciliationIssueInput, tx?: TransactionContext): Promise<MediaReconciliationIssueRecord>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<MediaReconciliationIssueRecord | null>;
  listByTenant(
    tenantId: string,
    status?: "DETECTED" | "RESOLVED" | "DISMISSED",
    tx?: TransactionContext
  ): Promise<MediaReconciliationIssueRecord[]>;
  resolve(id: string, tenantId?: string, tx?: TransactionContext): Promise<MediaReconciliationIssueRecord>;
  dismiss(id: string, tenantId?: string, tx?: TransactionContext): Promise<MediaReconciliationIssueRecord>;
}

export class MediaReconciliationRepository implements IMediaReconciliationRepository {
  private static store = createRecordStore<string, MediaReconciliationIssueRecord>("media-reconciliation.repository:store");

  public static clear(): void {
    MediaReconciliationRepository.store.clear();
  }

  async create(
    input: CreateMediaReconciliationIssueInput,
    _tx?: TransactionContext
  ): Promise<MediaReconciliationIssueRecord> {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const record: MediaReconciliationIssueRecord = {
      id,
      tenantId: input.tenantId,
      mediaAssetId: input.mediaAssetId,
      mediaDerivativeId: input.mediaDerivativeId,
      objectKey: input.objectKey,
      issueType: input.issueType,
      status: "DETECTED",
      details: input.details,
      detectedAt: now,
    };

    MediaReconciliationRepository.store.set(id, record);
    return { ...record };
  }

  async findById(
    id: string,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<MediaReconciliationIssueRecord | null> {
    const item = MediaReconciliationRepository.store.get(id);
    if (!item) return null;

    if (tenantId && item.tenantId !== tenantId) {
      throw new CrossTenantViolationError(item.tenantId, tenantId);
    }

    return { ...item };
  }

  async listByTenant(
    tenantId: string,
    status?: "DETECTED" | "RESOLVED" | "DISMISSED",
    _tx?: TransactionContext
  ): Promise<MediaReconciliationIssueRecord[]> {
    const results: MediaReconciliationIssueRecord[] = [];
    for (const item of MediaReconciliationRepository.store.values()) {
      if (item.tenantId === tenantId) {
        if (status && item.status !== status) continue;
        results.push({ ...item });
      }
    }
    return results;
  }

  async resolve(
    id: string,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<MediaReconciliationIssueRecord> {
    const item = await this.findById(id, tenantId);
    if (!item) {
      throw new Error(`MediaReconciliationIssue with ID ${id} not found.`);
    }

    const updated: MediaReconciliationIssueRecord = {
      ...item,
      status: "RESOLVED",
      resolvedAt: new Date().toISOString(),
    };

    MediaReconciliationRepository.store.set(id, updated);
    return { ...updated };
  }

  async dismiss(
    id: string,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<MediaReconciliationIssueRecord> {
    const item = await this.findById(id, tenantId);
    if (!item) {
      throw new Error(`MediaReconciliationIssue with ID ${id} not found.`);
    }

    const updated: MediaReconciliationIssueRecord = {
      ...item,
      status: "DISMISSED",
      resolvedAt: new Date().toISOString(),
    };

    MediaReconciliationRepository.store.set(id, updated);
    return { ...updated };
  }
}
