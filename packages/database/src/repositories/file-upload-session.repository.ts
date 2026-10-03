import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — FILE UPLOAD SESSION REPOSITORY (SEC-002, DEV-004, BRS-001)
// Pre-signed upload ticket tracking, size limits, and idempotency guarantees
// ============================================================================

import { FileUploadSession, FileResourceType, FileResourceRole, FileClassification } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";
import { CrossTenantViolationError } from "../errors";

export interface CreateFileUploadSessionInput {
  id?: string;
  tenantId: string;
  fileId: string;
  resourceType: FileResourceType;
  resourceId: string;
  resourceRole: FileResourceRole;
  classification?: FileClassification;
  originalFilename: string;
  declaredContentType: string;
  maxSizeBytes: number;
  reservedBytes: number;
  objectKey: string;
  uploadUrl: string;
  uploadMethod?: "PUT" | "POST";
  actorId: string;
  expiresAt: string;
  idempotencyKey?: string;
}

export interface IFileUploadSessionRepository {
  create(input: CreateFileUploadSessionInput, tx?: TransactionContext): Promise<FileUploadSession>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<FileUploadSession | null>;
  findByFileId(fileId: string, tenantId?: string, tx?: TransactionContext): Promise<FileUploadSession | null>;
  findByIdempotencyKey(idempotencyKey: string, tenantId: string, tx?: TransactionContext): Promise<FileUploadSession | null>;
  markFinalized(id: string, finalizedAt?: string, tx?: TransactionContext): Promise<FileUploadSession>;
  markCancelled(id: string, cancelledAt?: string, tx?: TransactionContext): Promise<FileUploadSession>;
  findExpiredSessions(cutoffIso: string, tx?: TransactionContext): Promise<FileUploadSession[]>;
}

export class FileUploadSessionRepository implements IFileUploadSessionRepository {
  private static store = createRecordStore<string, FileUploadSession>("file-upload-session.repository:store");

  public static clear(): void {
    FileUploadSessionRepository.store.clear();
  }

  async create(input: CreateFileUploadSessionInput, _tx?: TransactionContext): Promise<FileUploadSession> {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const session: FileUploadSession = {
      id,
      tenantId: input.tenantId,
      fileId: input.fileId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      resourceRole: input.resourceRole,
      classification: input.classification || "PRIVATE",
      originalFilename: input.originalFilename,
      declaredContentType: input.declaredContentType,
      maxSizeBytes: input.maxSizeBytes,
      reservedBytes: input.reservedBytes,
      objectKey: input.objectKey,
      uploadUrl: input.uploadUrl,
      uploadMethod: input.uploadMethod || "PUT",
      status: "INITIATED",
      expiresAt: input.expiresAt,
      createdAt: now,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
    };

    FileUploadSessionRepository.store.set(id, session);
    return { ...session };
  }

  async findById(id: string, tenantId?: string, _tx?: TransactionContext): Promise<FileUploadSession | null> {
    const session = FileUploadSessionRepository.store.get(id);
    if (!session) return null;

    if (tenantId && session.tenantId !== tenantId) {
      throw new CrossTenantViolationError(session.tenantId, tenantId);
    }

    return { ...session };
  }

  async findByFileId(fileId: string, tenantId?: string, _tx?: TransactionContext): Promise<FileUploadSession | null> {
    for (const session of FileUploadSessionRepository.store.values()) {
      if (session.fileId === fileId) {
        if (tenantId && session.tenantId !== tenantId) {
          throw new CrossTenantViolationError(session.tenantId, tenantId);
        }
        return { ...session };
      }
    }
    return null;
  }

  async findByIdempotencyKey(idempotencyKey: string, tenantId: string, _tx?: TransactionContext): Promise<FileUploadSession | null> {
    for (const session of FileUploadSessionRepository.store.values()) {
      if (session.tenantId === tenantId && session.idempotencyKey === idempotencyKey) {
        return { ...session };
      }
    }
    return null;
  }

  async markFinalized(id: string, finalizedAt?: string, _tx?: TransactionContext): Promise<FileUploadSession> {
    const session = FileUploadSessionRepository.store.get(id);
    if (!session) throw new Error(`Upload session not found with ID ${id}`);

    const updated: FileUploadSession = {
      ...session,
      status: "FINALIZED",
      finalizedAt: finalizedAt || new Date().toISOString(),
    };

    FileUploadSessionRepository.store.set(id, updated);
    return { ...updated };
  }

  async markCancelled(id: string, cancelledAt?: string, _tx?: TransactionContext): Promise<FileUploadSession> {
    const session = FileUploadSessionRepository.store.get(id);
    if (!session) throw new Error(`Upload session not found with ID ${id}`);

    const updated: FileUploadSession = {
      ...session,
      status: "CANCELLED",
      cancelledAt: cancelledAt || new Date().toISOString(),
    };

    FileUploadSessionRepository.store.set(id, updated);
    return { ...updated };
  }

  async findExpiredSessions(cutoffIso: string, _tx?: TransactionContext): Promise<FileUploadSession[]> {
    const cutoffTime = new Date(cutoffIso).getTime();
    return Array.from(FileUploadSessionRepository.store.values())
      .filter((s) => s.status === "INITIATED" && new Date(s.expiresAt).getTime() < cutoffTime)
      .map((s) => ({ ...s }));
  }
}
