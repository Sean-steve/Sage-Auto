import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — VEHICLE MEDIA REPOSITORY (ARCH-001, DATA-001, FLEET-001)
// Join entity linking vehicles to media assets, primary photo selection, and gallery ordering
// ============================================================================

import { VehicleMediaRecord } from "@carhire/types";
import { TransactionContext } from "../transaction-manager";
import { CrossTenantViolationError } from "../errors";

export interface CreateVehicleMediaInput {
  id?: string;
  tenantId: string;
  vehicleId: string;
  mediaAssetId: string;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface IVehicleMediaRepository {
  create(input: CreateVehicleMediaInput, tx?: TransactionContext): Promise<VehicleMediaRecord>;
  findById(id: string, tenantId?: string, tx?: TransactionContext): Promise<VehicleMediaRecord | null>;
  findByVehicleAndAsset(
    vehicleId: string,
    mediaAssetId: string,
    tenantId?: string,
    tx?: TransactionContext
  ): Promise<VehicleMediaRecord | null>;
  listByVehicle(vehicleId: string, tenantId?: string, tx?: TransactionContext): Promise<VehicleMediaRecord[]>;
  getPrimaryForVehicle(vehicleId: string, tenantId?: string, tx?: TransactionContext): Promise<VehicleMediaRecord | null>;
  setPrimary(
    vehicleId: string,
    mediaAssetId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<VehicleMediaRecord>;
  reorder(
    vehicleId: string,
    orderedMediaAssetIds: string[],
    tenantId: string,
    tx?: TransactionContext
  ): Promise<VehicleMediaRecord[]>;
  delete(id: string, tenantId?: string, tx?: TransactionContext): Promise<boolean>;
  deleteByAssetId(mediaAssetId: string, tenantId?: string, tx?: TransactionContext): Promise<boolean>;
}

export class VehicleMediaRepository implements IVehicleMediaRepository {
  private static store = createRecordStore<string, VehicleMediaRecord>("vehicle-media.repository:store");

  public static clear(): void {
    VehicleMediaRepository.store.clear();
  }

  async create(input: CreateVehicleMediaInput, _tx?: TransactionContext): Promise<VehicleMediaRecord> {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();

    // Check if vehicle already has this media asset
    const existing = await this.findByVehicleAndAsset(input.vehicleId, input.mediaAssetId, input.tenantId);
    if (existing) {
      return { ...existing };
    }

    // Check if this should be primary (if isPrimary is true, or if it's the first photo for vehicle)
    const existingPhotos = await this.listByVehicle(input.vehicleId, input.tenantId);
    const shouldBePrimary = input.isPrimary || existingPhotos.length === 0;

    if (shouldBePrimary) {
      // Unset existing primary
      for (const [key, item] of VehicleMediaRepository.store.entries()) {
        if (item.tenantId === input.tenantId && item.vehicleId === input.vehicleId && item.isPrimary) {
          VehicleMediaRepository.store.set(key, { ...item, isPrimary: false, updatedAt: now });
        }
      }
    }

    const sortOrder = input.sortOrder !== undefined ? input.sortOrder : existingPhotos.length;

    const record: VehicleMediaRecord = {
      id,
      tenantId: input.tenantId,
      vehicleId: input.vehicleId,
      mediaAssetId: input.mediaAssetId,
      isPrimary: shouldBePrimary,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };

    VehicleMediaRepository.store.set(id, record);
    return { ...record };
  }

  async findById(id: string, tenantId?: string, _tx?: TransactionContext): Promise<VehicleMediaRecord | null> {
    const item = VehicleMediaRepository.store.get(id);
    if (!item) return null;

    if (tenantId && item.tenantId !== tenantId) {
      throw new CrossTenantViolationError(item.tenantId, tenantId);
    }

    return { ...item };
  }

  async findByVehicleAndAsset(
    arg1: string,
    arg2: string,
    arg3?: string,
    _tx?: TransactionContext
  ): Promise<VehicleMediaRecord | null> {
    for (const item of VehicleMediaRepository.store.values()) {
      if (
        (item.vehicleId === arg1 && item.mediaAssetId === arg2 && (!arg3 || item.tenantId === arg3)) ||
        (item.tenantId === arg1 && item.vehicleId === arg2 && item.mediaAssetId === arg3)
      ) {
        return { ...item };
      }
    }
    return null;
  }

  async listByVehicle(
    arg1: string,
    arg2?: string,
    _tx?: TransactionContext
  ): Promise<VehicleMediaRecord[]> {
    const results: VehicleMediaRecord[] = [];
    for (const item of VehicleMediaRepository.store.values()) {
      if (
        (item.vehicleId === arg1 && (!arg2 || item.tenantId === arg2)) ||
        (item.tenantId === arg1 && item.vehicleId === arg2)
      ) {
        results.push({ ...item });
      }
    }
    results.sort((a, b) => a.sortOrder - b.sortOrder);
    return results;
  }

  async getPrimaryForVehicle(
    vehicleId: string,
    tenantId?: string,
    _tx?: TransactionContext
  ): Promise<VehicleMediaRecord | null> {
    for (const item of VehicleMediaRepository.store.values()) {
      if (item.vehicleId === vehicleId && item.isPrimary) {
        if (tenantId && item.tenantId !== tenantId) {
          throw new CrossTenantViolationError(item.tenantId, tenantId);
        }
        return { ...item };
      }
    }
    return null;
  }

  async setPrimary(
    vehicleId: string,
    mediaAssetId: string,
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<VehicleMediaRecord> {
    const now = new Date().toISOString();
    let target: VehicleMediaRecord | null = null;

    for (const [id, item] of VehicleMediaRepository.store.entries()) {
      if (item.tenantId === tenantId && item.vehicleId === vehicleId) {
        if (item.mediaAssetId === mediaAssetId) {
          target = { ...item, isPrimary: true, updatedAt: now };
          VehicleMediaRepository.store.set(id, target);
        } else if (item.isPrimary) {
          VehicleMediaRepository.store.set(id, { ...item, isPrimary: false, updatedAt: now });
        }
      }
    }

    if (!target) {
      throw new Error(`VehicleMedia association for vehicle ${vehicleId} and asset ${mediaAssetId} not found.`);
    }

    return target;
  }

  async reorder(
    vehicleId: string,
    orderedMediaAssetIds: string[],
    tenantId: string,
    _tx?: TransactionContext
  ): Promise<VehicleMediaRecord[]> {
    const now = new Date().toISOString();
    const updated: VehicleMediaRecord[] = [];

    for (let i = 0; i < orderedMediaAssetIds.length; i++) {
      const assetId = orderedMediaAssetIds[i];
      for (const [id, item] of VehicleMediaRepository.store.entries()) {
        if (item.tenantId === tenantId && item.vehicleId === vehicleId && item.mediaAssetId === assetId) {
          const rec: VehicleMediaRecord = { ...item, sortOrder: i, updatedAt: now };
          VehicleMediaRepository.store.set(id, rec);
          updated.push(rec);
        }
      }
    }

    return updated;
  }

  async delete(id: string, tenantId?: string, _tx?: TransactionContext): Promise<boolean> {
    const item = await this.findById(id, tenantId);
    if (!item) return false;

    return VehicleMediaRepository.store.delete(id);
  }

  async deleteByAssetId(mediaAssetId: string, tenantId?: string, _tx?: TransactionContext): Promise<boolean> {
    let deleted = false;
    for (const [id, item] of VehicleMediaRepository.store.entries()) {
      if (item.mediaAssetId === mediaAssetId) {
        if (tenantId && item.tenantId !== tenantId) {
          throw new CrossTenantViolationError(item.tenantId, tenantId);
        }
        VehicleMediaRepository.store.delete(id);
        deleted = true;
      }
    }
    return deleted;
  }
}
