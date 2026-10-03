import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — MEDIA DERIVATIVE REPOSITORY (ARCH-001, DATA-001, DATA-002 §12, SEC-001)
// Transformed media derivatives persistence (thumbnails, responsive variants, WebP, AVIF)
// ============================================================================

import {
  MediaDerivativeRecord,
  MediaDerivativeStatus,
  MediaDerivativeFormat,
} from "@carhire/types";
import { TransactionContext } from "../transaction-manager";
import { CrossTenantViolationError } from "../errors";

export interface CreateMediaDerivativeInput {
  id?: string;
  tenantId: string;
  mediaAssetId: string;
  sourceFileId: string;
  profileName: string;
  profileVersion?: number;
  variantName: string;
  format: MediaDerivativeFormat;
  width: number;
  height: number;
  sizeBytes: number;
  objectKey: string;
  storageBucket: string;
  storageProvider?: string;
  checksum: string;
  contentType: string;
  quality: number;
  status?: MediaDerivativeStatus;
  isPublic?: boolean;
}

export interface UpdateMediaDerivativeInput {
  status?: MediaDerivativeStatus;
  availableAt?: string;
  supersededAt?: string;
  deletedAt?: string;
}

export interface IMediaDerivativeRepository {
  create(input: CreateMediaDerivativeInput, tx?: TransactionContext): Promise<MediaDerivativeRecord>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<MediaDerivativeRecord | null>;
  findByUniqueKey(
    tenantId: string,
    sourceFileId: string,
    profileName: string,
    profileVersion: number,
    variantName: string,
    tx?: TransactionContext
  ): Promise<MediaDerivativeRecord | null>;
  listByAssetId(
    mediaAssetId: string,
    tenantId?: string,
    tx?: TransactionContext
  ): Promise<MediaDerivativeRecord[]>;
  listBySourceFileId(
    sourceFileId: string,
    profileName?: string,
    tenantId?: string,
    tx?: TransactionContext
  ): Promise<MediaDerivativeRecord[]>;
  update(
    id: string,
    input: UpdateMediaDerivativeInput,
    tenantId?: string,
    tx?: TransactionContext
  ): Promise<MediaDerivativeRecord>;
  delete(id: string, tenantId?: string, tx?: TransactionContext): Promise<boolean>;
  markSuperseded(
    tenantId: string,
    sourceFileId: string,
    profileName: string,
    newVersion: number,
    tx?: TransactionContext
  ): Promise<number>;
  findByTenant(tenantId: string, tx?: TransactionContext): Promise<MediaDerivativeRecord[]>;
  getAll(tx?: TransactionContext): Promise<MediaDerivativeRecord[]>;
}

export class MediaDerivativeRepository implements IMediaDerivativeRepository {
  private static store = createRecordStore<string, MediaDerivativeRecord>("media-derivative.repository:store");

  public static clear(): void {
    MediaDerivativeRepository.store.clear();
  }

  async create(input: CreateMediaDerivativeInput, _tx?: TransactionContext): Promise<MediaDerivativeRecord> {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();

    // Check unique constraint: (tenantId, sourceFileId, profileName, profileVersion, variantName)
    const existing = await this.findByUniqueKey(
      input.tenantId,
      input.sourceFileId,
      input.profileName,
      input.profileVersion || 1,
      input.variantName
    );

    if (existing) {
      // Idempotent upsert/update
      const updated: MediaDerivativeRecord = {
        ...existing,
        mediaAssetId: input.mediaAssetId,
        width: input.width,
        height: input.height,
        sizeBytes: input.sizeBytes,
        objectKey: input.objectKey,
        storageBucket: input.storageBucket,
        storageProvider: input.storageProvider || "s3",
        checksum: input.checksum,
        contentType: input.contentType,
        quality: input.quality,
        status: input.status || "AVAILABLE",
        isPublic: input.isPublic ?? false,
        version: existing.version + 1,
        availableAt: now,
      };
      MediaDerivativeRepository.store.set(existing.id, updated);
      return { ...updated };
    }

    const record: MediaDerivativeRecord = {
      id,
      tenantId: input.tenantId,
      mediaAssetId: input.mediaAssetId,
      sourceFileId: input.sourceFileId,
      profileName: input.profileName,
      profileVersion: input.profileVersion || 1,
      variantName: input.variantName,
      format: input.format,
      width: input.width,
      height: input.height,
      sizeBytes: input.sizeBytes,
      objectKey: input.objectKey,
      storageBucket: input.storageBucket,
      storageProvider: input.storageProvider || "s3",
      checksum: input.checksum,
      contentType: input.contentType,
      quality: input.quality,
      status: input.status || "AVAILABLE",
      isPublic: input.isPublic ?? false,
      version: 1,
      createdAt: now,
      availableAt: now,
    };

    MediaDerivativeRepository.store.set(id, record);
    return { ...record };
  }

  async findById(id: string, tenantId?: string, _tx?: TransactionContext): Promise<MediaDerivativeRecord | null> {
    const item = MediaDerivativeRepository.store.get(id);
    if (!item) return null;

    if (tenantId && item.tenantId !== tenantId) {
      throw new CrossTenantViolationError(item.tenantId, tenantId);
    }

    return { ...item };
  }

  async findByUniqueKey(
    tenantId: string,
    sourceFileId: string,
    profileName: string,
    profileVersion: number,
    variantName: string,
    _tx?: TransactionContext
  ): Promise<MediaDerivativeRecord | null> {
    for (const item of MediaDerivativeRepository.store.values()) {
      if (
        item.tenantId === tenantId &&
        item.sourceFileId === sourceFileId &&
        item.profileName === profileName &&
        item.profileVersion === profileVersion &&
        item.variantName === variantName
      ) {
        return { ...item };
      }
    }
    return null;
  }

  async listByAssetId(
    mediaAssetId: string,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<MediaDerivativeRecord[]> {
    const results: MediaDerivativeRecord[] = [];
    for (const item of MediaDerivativeRepository.store.values()) {
      if (item.mediaAssetId === mediaAssetId && item.status !== "DELETED") {
        if (tenantId && item.tenantId !== tenantId) {
          throw new CrossTenantViolationError(item.tenantId, tenantId);
        }
        results.push({ ...item });
      }
    }
    return results;
  }

  async listBySourceFileId(
    sourceFileId: string,
    profileName?: string,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<MediaDerivativeRecord[]> {
    const results: MediaDerivativeRecord[] = [];
    for (const item of MediaDerivativeRepository.store.values()) {
      if (item.sourceFileId === sourceFileId && item.status !== "DELETED") {
        if (profileName && item.profileName !== profileName) continue;
        if (tenantId && item.tenantId !== tenantId) {
          throw new CrossTenantViolationError(item.tenantId, tenantId);
        }
        results.push({ ...item });
      }
    }
    return results;
  }

  async update(
    id: string,
    input: UpdateMediaDerivativeInput,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<MediaDerivativeRecord> {
    const item = await this.findById(id, tenantId);
    if (!item) {
      throw new Error(`MediaDerivative with ID ${id} not found.`);
    }

    const updated: MediaDerivativeRecord = {
      ...item,
      status: input.status !== undefined ? input.status : item.status,
      availableAt: input.availableAt !== undefined ? input.availableAt : item.availableAt,
      supersededAt: input.supersededAt !== undefined ? input.supersededAt : item.supersededAt,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : item.deletedAt,
      version: item.version + 1,
    };

    MediaDerivativeRepository.store.set(id, updated);
    return { ...updated };
  }

  async delete(id: string, tenantId?: string, _tx?: TransactionContext): Promise<boolean> {
    const item = await this.findById(id, tenantId);
    if (!item) return false;

    return MediaDerivativeRepository.store.delete(id);
  }

  async markSuperseded(
    tenantId: string,
    sourceFileId: string,
    profileName: string,
    newVersion: number,
    _tx?: TransactionContext
  ): Promise<number> {
    let count = 0;
    const now = new Date().toISOString();
    for (const [id, item] of MediaDerivativeRepository.store.entries()) {
      if (
        item.tenantId === tenantId &&
        item.sourceFileId === sourceFileId &&
        item.profileName === profileName &&
        item.profileVersion < newVersion &&
        item.status === "AVAILABLE"
      ) {
        MediaDerivativeRepository.store.set(id, {
          ...item,
          status: "SUPERSEDED",
          supersededAt: now,
          version: item.version + 1,
        });
        count++;
      }
    }
    return count;
  }

  async findByTenant(tenantId: string, _tx?: TransactionContext): Promise<MediaDerivativeRecord[]> {
    return Array.from(MediaDerivativeRepository.store.values())
      .filter((d) => d.tenantId === tenantId)
      .map((d) => ({ ...d }));
  }

  async getAll(_tx?: TransactionContext): Promise<MediaDerivativeRecord[]> {
    return Array.from(MediaDerivativeRepository.store.values()).map((d) => ({ ...d }));
  }
}
