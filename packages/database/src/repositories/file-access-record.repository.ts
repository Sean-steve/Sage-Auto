import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — FILE ACCESS RECORD REPOSITORY (SEC-002, SEC-006, AUD-001)
// Zero-trust audit logging of file metadata reads, download ticket grants & accesses
// ============================================================================

import { FileAccessRecord, FileResourceType } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";
import { CrossTenantViolationError } from "../errors";

export interface CreateFileAccessRecordInput {
  id?: string;
  tenantId: string;
  fileId: string;
  actorId: string;
  actorType?: "USER" | "SUPPORT" | "SYSTEM" | "CUSTOMER" | "OWNER";
  accessType: "METADATA_READ" | "DOWNLOAD_URL_ISSUED" | "DIRECT_DOWNLOAD";
  resourceType?: FileResourceType;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface IFileAccessRecordRepository {
  create(input: CreateFileAccessRecordInput, tx?: TransactionContext): Promise<FileAccessRecord>;
  listByFileId(fileId: string, tenantId?: string, limit?: number, tx?: TransactionContext): Promise<FileAccessRecord[]>;
  listByActor(actorId: string, tenantId?: string, limit?: number, tx?: TransactionContext): Promise<FileAccessRecord[]>;
}

export class FileAccessRecordRepository implements IFileAccessRecordRepository {
  private static store = createRecordStore<string, FileAccessRecord>("file-access-record.repository:store");

  public static clear(): void {
    FileAccessRecordRepository.store.clear();
  }

  async create(input: CreateFileAccessRecordInput, _tx?: TransactionContext): Promise<FileAccessRecord> {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const record: FileAccessRecord = {
      id,
      tenantId: input.tenantId,
      fileId: input.fileId,
      actorId: input.actorId,
      actorType: input.actorType || "USER",
      accessType: input.accessType,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: now,
    };

    FileAccessRecordRepository.store.set(id, record);
    return { ...record };
  }

  async listByFileId(fileId: string, tenantId?: string, limit = 50, _tx?: TransactionContext): Promise<FileAccessRecord[]> {
    const records: FileAccessRecord[] = [];
    for (const record of FileAccessRecordRepository.store.values()) {
      if (record.fileId === fileId) {
        if (tenantId && record.tenantId !== tenantId) {
          throw new CrossTenantViolationError(record.tenantId, tenantId);
        }
        records.push({ ...record });
      }
    }

    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return records.slice(0, limit);
  }

  async listByActor(actorId: string, tenantId?: string, limit = 50, _tx?: TransactionContext): Promise<FileAccessRecord[]> {
    const records: FileAccessRecord[] = [];
    for (const record of FileAccessRecordRepository.store.values()) {
      if (record.actorId === actorId) {
        if (tenantId && record.tenantId !== tenantId) {
          throw new CrossTenantViolationError(record.tenantId, tenantId);
        }
        records.push({ ...record });
      }
    }

    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return records.slice(0, limit);
  }
}
