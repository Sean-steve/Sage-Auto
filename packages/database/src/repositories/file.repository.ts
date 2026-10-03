import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — FILE REPOSITORY (ARCH-001, DATA-001, DATA-002 §12, SEC-001)
// Enterprise immutable file metadata, storage reference, and lifecycle persistence
// ============================================================================

import { FileRecord, FileStatus, FileScanStatus, FileClassification } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";
import { CrossTenantViolationError } from "../errors";

export interface CreateFileInput {
  id?: string;
  tenantId: string;
  storageProvider?: string;
  bucket: string;
  objectKey: string;
  originalFilename: string;
  sanitizedFilename?: string;
  contentType?: string;
  mimeType?: string;
  category?: string;
  detectedContentType?: string;
  sizeBytes: number;
  checksumAlgorithm?: string;
  checksum?: string;
  checksumSha256?: string;
  classification?: FileClassification;
  status?: FileStatus;
  scanStatus?: FileScanStatus;
  uploadedBy: string;
}

export interface UpdateFileInput {
  sizeBytes?: number;
  detectedContentType?: string;
  checksum?: string;
  status?: FileStatus;
  scanStatus?: FileScanStatus;
  finalizedAt?: string;
  scannedAt?: string;
  archivedAt?: string;
  deletedAt?: string;
}

export interface IFileRepository {
  create(input: CreateFileInput, tx?: TransactionContext): Promise<FileRecord>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<FileRecord | null>;
  findByObjectKey(objectKey: string, tenantId?: string, tx?: TransactionContext): Promise<FileRecord | null>;
  update(id: string, input: UpdateFileInput, tenantId?: string, tx?: TransactionContext): Promise<FileRecord>;
  delete(id: string, tenantId?: string, tx?: TransactionContext): Promise<boolean>;
  listByTenant(
    tenantId: string,
    options?: {
      status?: FileStatus;
      classification?: FileClassification;
      limit?: number;
      offset?: number;
    },
    tx?: TransactionContext
  ): Promise<{ items: FileRecord[]; total: number }>;
  findPendingUploadsOlderThan(cutoffIso: string, tx?: TransactionContext): Promise<FileRecord[]>;
  findQuarantinedOlderThan(cutoffIso: string, tx?: TransactionContext): Promise<FileRecord[]>;
  findSoftDeletedOlderThan(cutoffIso: string, tx?: TransactionContext): Promise<FileRecord[]>;
  getTenantStorageUsage(tenantId: string, tx?: TransactionContext): Promise<{ totalBytes: number; fileCount: number }>;
}

export class FileRepository implements IFileRepository {
  private static store = createRecordStore<string, FileRecord>("file.repository:store");

  public static clear(): void {
    FileRepository.store.clear();
  }

  async create(input: CreateFileInput, _tx?: TransactionContext): Promise<FileRecord> {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const record: FileRecord = {
      id,
      tenantId: input.tenantId,
      storageProvider: input.storageProvider || "s3",
      bucket: input.bucket,
      objectKey: input.objectKey,
      originalFilename: input.originalFilename,
      sanitizedFilename: input.sanitizedFilename || input.originalFilename,
      contentType: input.contentType || input.mimeType || "application/octet-stream",
      detectedContentType: input.detectedContentType,
      sizeBytes: input.sizeBytes,
      checksumAlgorithm: input.checksumAlgorithm || "sha256",
      checksum: input.checksum || input.checksumSha256 || "",
      classification: input.classification || "PRIVATE",
      status: input.status || "PENDING_UPLOAD",
      scanStatus: input.scanStatus || "PENDING",
      uploadedBy: input.uploadedBy,
      createdAt: now,
      version: 1,
    };

    FileRepository.store.set(id, record);
    return { ...record };
  }

  async findById(id: string, tenantId?: string, _tx?: TransactionContext): Promise<FileRecord | null> {
    const file = FileRepository.store.get(id);
    if (!file) return null;

    if (tenantId && file.tenantId !== tenantId) {
      throw new CrossTenantViolationError(file.tenantId, tenantId);
    }

    return { ...file };
  }

  async findByObjectKey(objectKey: string, tenantId?: string, _tx?: TransactionContext): Promise<FileRecord | null> {
    for (const file of FileRepository.store.values()) {
      if (file.objectKey === objectKey) {
        if (tenantId && file.tenantId !== tenantId) {
          throw new CrossTenantViolationError(file.tenantId, tenantId);
        }
        return { ...file };
      }
    }
    return null;
  }

  async update(id: string, input: UpdateFileInput, tenantId?: string, _tx?: TransactionContext): Promise<FileRecord> {
    const file = await this.findById(id, tenantId);
    if (!file) {
      throw new Error(`File not found with ID ${id}`);
    }

    const updated: FileRecord = {
      ...file,
      ...input,
      version: file.version + 1,
    };

    FileRepository.store.set(id, updated);
    return { ...updated };
  }

  async delete(id: string, tenantId?: string, _tx?: TransactionContext): Promise<boolean> {
    const file = await this.findById(id, tenantId);
    if (!file) return false;

    return FileRepository.store.delete(id);
  }

  async listByTenant(
    tenantId: string,
    options?: {
      status?: FileStatus;
      classification?: FileClassification;
      limit?: number;
      offset?: number;
    },
    _tx?: TransactionContext
  ): Promise<{ items: FileRecord[]; total: number }> {
    let items = Array.from(FileRepository.store.values()).filter(
      (f) => f.tenantId === tenantId && !f.deletedAt
    );

    if (options?.status) {
      items = items.filter((f) => f.status === options.status);
    }
    if (options?.classification) {
      items = items.filter((f) => f.classification === options.classification);
    }

    const total = items.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;
    const paginated = items.slice(offset, offset + limit);

    return { items: paginated.map((f) => ({ ...f })), total };
  }

  async findPendingUploadsOlderThan(cutoffIso: string, _tx?: TransactionContext): Promise<FileRecord[]> {
    const cutoffTime = new Date(cutoffIso).getTime();
    return Array.from(FileRepository.store.values())
      .filter((f) => f.status === "PENDING_UPLOAD" && new Date(f.createdAt).getTime() < cutoffTime)
      .map((f) => ({ ...f }));
  }

  async findQuarantinedOlderThan(cutoffIso: string, _tx?: TransactionContext): Promise<FileRecord[]> {
    const cutoffTime = new Date(cutoffIso).getTime();
    return Array.from(FileRepository.store.values())
      .filter((f) => f.status === "QUARANTINED" && new Date(f.createdAt).getTime() < cutoffTime)
      .map((f) => ({ ...f }));
  }

  async findSoftDeletedOlderThan(cutoffIso: string, _tx?: TransactionContext): Promise<FileRecord[]> {
    const cutoffTime = new Date(cutoffIso).getTime();
    return Array.from(FileRepository.store.values())
      .filter((f) => !!f.deletedAt && new Date(f.deletedAt).getTime() < cutoffTime)
      .map((f) => ({ ...f }));
  }

  async getTenantStorageUsage(tenantId: string, _tx?: TransactionContext): Promise<{ totalBytes: number; fileCount: number }> {
    const tenantFiles = Array.from(FileRepository.store.values()).filter(
      (f) => f.tenantId === tenantId && !f.deletedAt && f.status !== "REJECTED"
    );

    const totalBytes = tenantFiles.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);
    return { totalBytes, fileCount: tenantFiles.length };
  }
}
