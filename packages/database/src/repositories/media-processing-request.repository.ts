import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — MEDIA PROCESSING REQUEST REPOSITORY (ARCH-001, DATA-001, DEV-011)
// Lifecycle tracking and idempotency for asynchronous media processing jobs
// ============================================================================

import {
  MediaProcessingRequestRecord,
  MediaProcessingRequestStatus,
} from "@carhire/types";
import { TransactionContext } from "../transaction-manager";
import { CrossTenantViolationError } from "../errors";

export interface CreateMediaProcessingRequestInput {
  id?: string;
  tenantId: string;
  sourceFileId: string;
  mediaAssetId?: string;
  profileName: string;
  profileVersion?: number;
  requestedVariants?: string[];
  maxAttempts?: number;
}

export interface UpdateMediaProcessingRequestInput {
  status?: MediaProcessingRequestStatus;
  mediaAssetId?: string;
  attempts?: number;
  errorMessage?: string;
  errorCode?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface IMediaProcessingRequestRepository {
  create(input: CreateMediaProcessingRequestInput, tx?: TransactionContext): Promise<MediaProcessingRequestRecord>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<MediaProcessingRequestRecord | null>;
  findLatestBySourceFile(
    sourceFileId: string,
    profileName: string,
    tenantId?: string,
    tx?: TransactionContext
  ): Promise<MediaProcessingRequestRecord | null>;
  update(
    id: string,
    input: UpdateMediaProcessingRequestInput,
    tenantId?: string,
    tx?: TransactionContext
  ): Promise<MediaProcessingRequestRecord>;
  findPending(limit?: number, tenantId?: string, tx?: TransactionContext): Promise<MediaProcessingRequestRecord[]>;
  listPendingOlderThan(cutoffIso: string, tx?: TransactionContext): Promise<MediaProcessingRequestRecord[]>;
  listStuckProcessingOlderThan(cutoffIso: string, tx?: TransactionContext): Promise<MediaProcessingRequestRecord[]>;
}

export class MediaProcessingRequestRepository implements IMediaProcessingRequestRepository {
  private static store = createRecordStore<string, MediaProcessingRequestRecord>("media-processing-request.repository:store");

  public static clear(): void {
    MediaProcessingRequestRepository.store.clear();
  }

  async create(
    input: CreateMediaProcessingRequestInput,
    _tx?: TransactionContext
  ): Promise<MediaProcessingRequestRecord> {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const record: MediaProcessingRequestRecord = {
      id,
      tenantId: input.tenantId,
      sourceFileId: input.sourceFileId,
      mediaAssetId: input.mediaAssetId,
      profileName: input.profileName,
      profileVersion: input.profileVersion || 1,
      requestedVariants: input.requestedVariants || [],
      status: "PENDING",
      attempts: 0,
      maxAttempts: input.maxAttempts || 3,
      createdAt: now,
      updatedAt: now,
    };

    MediaProcessingRequestRepository.store.set(id, record);
    return { ...record };
  }

  async findById(
    id: string,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<MediaProcessingRequestRecord | null> {
    const item = MediaProcessingRequestRepository.store.get(id);
    if (!item) return null;

    if (tenantId && item.tenantId !== tenantId) {
      throw new CrossTenantViolationError(item.tenantId, tenantId);
    }

    return { ...item };
  }

  async findLatestBySourceFile(
    sourceFileId: string,
    profileName: string,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<MediaProcessingRequestRecord | null> {
    const matching: MediaProcessingRequestRecord[] = [];
    for (const item of MediaProcessingRequestRepository.store.values()) {
      if (item.sourceFileId === sourceFileId && item.profileName === profileName) {
        if (tenantId && item.tenantId !== tenantId) {
          throw new CrossTenantViolationError(item.tenantId, tenantId);
        }
        matching.push(item);
      }
    }

    if (matching.length === 0) return null;
    matching.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { ...matching[0] };
  }

  async update(
    id: string,
    input: UpdateMediaProcessingRequestInput,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<MediaProcessingRequestRecord> {
    const item = await this.findById(id, tenantId);
    if (!item) {
      throw new Error(`MediaProcessingRequest with ID ${id} not found.`);
    }

    const updated: MediaProcessingRequestRecord = {
      ...item,
      status: input.status !== undefined ? input.status : item.status,
      mediaAssetId: input.mediaAssetId !== undefined ? input.mediaAssetId : item.mediaAssetId,
      attempts: input.attempts !== undefined ? input.attempts : item.attempts,
      errorMessage: input.errorMessage !== undefined ? input.errorMessage : item.errorMessage,
      errorCode: input.errorCode !== undefined ? input.errorCode : item.errorCode,
      startedAt: input.startedAt !== undefined ? input.startedAt : item.startedAt,
      completedAt: input.completedAt !== undefined ? input.completedAt : item.completedAt,
      updatedAt: new Date().toISOString(),
    };

    MediaProcessingRequestRepository.store.set(id, updated);
    return { ...updated };
  }

  async findPending(
    limit = 50,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<MediaProcessingRequestRecord[]> {
    const results: MediaProcessingRequestRecord[] = [];
    for (const item of MediaProcessingRequestRepository.store.values()) {
      if (item.status === "PENDING" && (!tenantId || item.tenantId === tenantId)) {
        results.push({ ...item });
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  async listPendingOlderThan(cutoffIso: string, _tx?: TransactionContext): Promise<MediaProcessingRequestRecord[]> {
    const cutoffTime = new Date(cutoffIso).getTime();
    const results: MediaProcessingRequestRecord[] = [];
    for (const item of MediaProcessingRequestRepository.store.values()) {
      if (item.status === "PENDING" && new Date(item.createdAt).getTime() < cutoffTime) {
        results.push({ ...item });
      }
    }
    return results;
  }

  async listStuckProcessingOlderThan(
    cutoffIso: string,
    _tx?: TransactionContext
  ): Promise<MediaProcessingRequestRecord[]> {
    const cutoffTime = new Date(cutoffIso).getTime();
    const results: MediaProcessingRequestRecord[] = [];
    for (const item of MediaProcessingRequestRepository.store.values()) {
      if (
        item.status === "PROCESSING" &&
        item.startedAt &&
        new Date(item.startedAt).getTime() < cutoffTime
      ) {
        results.push({ ...item });
      }
    }
    return results;
  }
}
