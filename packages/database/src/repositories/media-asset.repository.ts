import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — MEDIA ASSET REPOSITORY (ARCH-001, DATA-001, DATA-002 §12, SEC-001)
// Enterprise media asset entity linked to immutable source file
// ============================================================================

import {
  MediaAssetRecord,
  MediaAssetStatus,
  FileClassification,
  MediaType,
} from "@carhire/types";
import { TransactionContext } from "../transaction-manager";
import { CrossTenantViolationError } from "../errors";

export interface CreateMediaAssetInput {
  id?: string;
  tenantId: string;
  sourceFileId: string;
  mediaType?: MediaType;
  classification?: FileClassification;
  status?: MediaAssetStatus;
  processingProfile: string;
  profileVersion?: number;
  dominantColor?: string;
  blurHash?: string;
  width?: number;
  height?: number;
  exifStripped?: boolean;
}

export interface UpdateMediaAssetInput {
  status?: MediaAssetStatus;
  dominantColor?: string;
  blurHash?: string;
  width?: number;
  height?: number;
  exifStripped?: boolean;
  profileVersion?: number;
  deletedAt?: string;
}

export interface IMediaAssetRepository {
  create(input: CreateMediaAssetInput, tx?: TransactionContext): Promise<MediaAssetRecord>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<MediaAssetRecord | null>;
  findBySourceFileId(
    sourceFileId: string,
    profileName?: string,
    tenantId?: string,
    tx?: TransactionContext
  ): Promise<MediaAssetRecord | null>;
  update(id: string, input: UpdateMediaAssetInput, tenantId?: string, tx?: TransactionContext): Promise<MediaAssetRecord>;
  delete(id: string, tenantId?: string, tx?: TransactionContext): Promise<boolean>;
  listByTenant(
    tenantId: string,
    options?: {
      status?: MediaAssetStatus;
      profile?: string;
      limit?: number;
      offset?: number;
    },
    tx?: TransactionContext
  ): Promise<{ items: MediaAssetRecord[]; total: number }>;
}

export class MediaAssetRepository implements IMediaAssetRepository {
  private static store = createRecordStore<string, MediaAssetRecord>("media-asset.repository:store");

  public static clear(): void {
    MediaAssetRepository.store.clear();
  }

  async create(input: CreateMediaAssetInput, _tx?: TransactionContext): Promise<MediaAssetRecord> {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();

    const record: MediaAssetRecord = {
      id,
      tenantId: input.tenantId,
      sourceFileId: input.sourceFileId,
      mediaType: input.mediaType || "IMAGE",
      classification: input.classification || "PRIVATE",
      status: input.status || "PENDING",
      processingProfile: input.processingProfile,
      profileVersion: input.profileVersion || 1,
      dominantColor: input.dominantColor,
      blurHash: input.blurHash,
      width: input.width,
      height: input.height,
      exifStripped: input.exifStripped ?? true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    MediaAssetRepository.store.set(id, record);
    return { ...record };
  }

  async findById(id: string, tenantId?: string, _tx?: TransactionContext): Promise<MediaAssetRecord | null> {
    const asset = MediaAssetRepository.store.get(id);
    if (!asset) return null;

    if (tenantId && asset.tenantId !== tenantId) {
      throw new CrossTenantViolationError(asset.tenantId, tenantId);
    }

    return { ...asset };
  }

  async findBySourceFileId(
    sourceFileId: string,
    profileNameOrTenantId?: string,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<MediaAssetRecord | null> {
    for (const asset of MediaAssetRepository.store.values()) {
      if (asset.sourceFileId === sourceFileId) {
        if (profileNameOrTenantId && asset.tenantId === profileNameOrTenantId && !tenantId) {
          return { ...asset };
        }
        if (!profileNameOrTenantId || asset.processingProfile === profileNameOrTenantId) {
          if (tenantId && asset.tenantId !== tenantId) {
            throw new CrossTenantViolationError(asset.tenantId, tenantId);
          }
          return { ...asset };
        }
      }
    }
    return null;
  }

  async update(
    id: string,
    input: UpdateMediaAssetInput,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<MediaAssetRecord> {
    const asset = await this.findById(id, tenantId);
    if (!asset) {
      throw new Error(`MediaAsset with ID ${id} not found.`);
    }

    const updated: MediaAssetRecord = {
      ...asset,
      status: input.status !== undefined ? input.status : asset.status,
      dominantColor: input.dominantColor !== undefined ? input.dominantColor : asset.dominantColor,
      blurHash: input.blurHash !== undefined ? input.blurHash : asset.blurHash,
      width: input.width !== undefined ? input.width : asset.width,
      height: input.height !== undefined ? input.height : asset.height,
      exifStripped: input.exifStripped !== undefined ? input.exifStripped : asset.exifStripped,
      profileVersion: input.profileVersion !== undefined ? input.profileVersion : asset.profileVersion,
      deletedAt: input.deletedAt !== undefined ? input.deletedAt : asset.deletedAt,
      version: asset.version + 1,
      updatedAt: new Date().toISOString(),
    };

    MediaAssetRepository.store.set(id, updated);
    return { ...updated };
  }

  async delete(id: string, tenantId?: string, _tx?: TransactionContext): Promise<boolean> {
    const asset = await this.findById(id, tenantId);
    if (!asset) return false;

    return MediaAssetRepository.store.delete(id);
  }

  async listByTenant(
    tenantId: string,
    options?: {
      status?: MediaAssetStatus;
      profile?: string;
      limit?: number;
      offset?: number;
    },
    _tx?: TransactionContext
  ): Promise<{ items: MediaAssetRecord[]; total: number }> {
    const all = Array.from(MediaAssetRepository.store.values()).filter(
      (a) => a.tenantId === tenantId
    );

    let filtered = all;
    if (options?.status) {
      filtered = filtered.filter((a) => a.status === options.status);
    }
    if (options?.profile) {
      filtered = filtered.filter((a) => a.processingProfile === options.profile);
    }

    const offset = options?.offset || 0;
    const limit = options?.limit || 50;
    const items = filtered.slice(offset, offset + limit).map((a) => ({ ...a }));

    return { items, total: filtered.length };
  }
}
