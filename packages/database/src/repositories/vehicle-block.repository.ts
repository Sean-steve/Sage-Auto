import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — VEHICLE AVAILABILITY BLOCK REPOSITORY (DEV-004, DEV-006, BRS-001)
// Manages Maintenance, Compliance, Impound, Accident, and Administrative Blocks
// ============================================================================

import type {
  VehicleBlock,
  CreateVehicleBlockDto,
  VehicleBlockType,
  VehicleBlockStatus,
} from "@carhire/types";
import {
  InvalidAvailabilityIntervalError,
  VehicleBlockNotFoundError,
  RecordNotFoundError,
  CrossTenantViolationError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface VehicleBlockFilter {
  vehicleId?: string;
  vehicleIds?: string[];
  blockType?: VehicleBlockType;
  status?: VehicleBlockStatus | VehicleBlockStatus[];
  from?: string;
  to?: string;
}

export interface IVehicleBlockRepository {
  createBlock(
    tenantId: string,
    data: CreateVehicleBlockDto & { actorUserId?: string; allocationId?: string },
    tx?: TransactionContext
  ): Promise<VehicleBlock>;

  listBlocks(
    tenantId: string,
    filter?: VehicleBlockFilter,
    tx?: TransactionContext
  ): Promise<VehicleBlock[]>;

  findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<VehicleBlock | null>;

  releaseBlock(
    id: string,
    tenantId: string,
    reason?: string,
    actorUserId?: string,
    tx?: TransactionContext
  ): Promise<VehicleBlock>;

  findOverlappingBlocks(
    tenantId: string,
    vehicleId: string,
    startsAt: string,
    endsAt: string,
    tx?: TransactionContext
  ): Promise<VehicleBlock[]>;

  deleteBlock(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;
}

export class VehicleBlockRepository implements IVehicleBlockRepository {
  private static blockStore = createRecordStore<string, VehicleBlock>("vehicle-block.repository:blockStore");

  static clear(): void {
    VehicleBlockRepository.blockStore.clear();
  }

  static seed(blocks?: VehicleBlock[]): void {
    if (blocks) {
      for (const b of blocks) {
        VehicleBlockRepository.blockStore.set(b.id, { ...b });
      }
    }
  }

  private static intervalsOverlap(
    startA: Date,
    endA: Date,
    startB: Date,
    endB: Date
  ): boolean {
    return startA.getTime() < endB.getTime() && startB.getTime() < endA.getTime();
  }

  async createBlock(
    tenantId: string,
    data: CreateVehicleBlockDto & { actorUserId?: string; allocationId?: string },
    tx?: TransactionContext
  ): Promise<VehicleBlock> {
    const start = new Date(data.startsAt);
    const end = new Date(data.endsAt);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
      throw new InvalidAvailabilityIntervalError(
        `Invalid block interval: endsAt (${data.endsAt}) must be strictly greater than startsAt (${data.startsAt}).`
      );
    }

    const now = new Date().toISOString();
    const id = `blk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const block: VehicleBlock = {
      id,
      tenantId,
      vehicleId: data.vehicleId,
      blockType: data.blockType,
      status: "ACTIVE",
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      reason: data.reason,
      notes: data.notes || null,
      actorUserId: data.actorUserId || null,
      allocationId: data.allocationId || null,
      createdAt: now,
      updatedAt: now,
    };

    VehicleBlockRepository.blockStore.set(block.id, block);
    return { ...block };
  }

  async listBlocks(
    tenantId: string,
    filter?: VehicleBlockFilter,
    tx?: TransactionContext
  ): Promise<VehicleBlock[]> {
    const results: VehicleBlock[] = [];

    for (const item of VehicleBlockRepository.blockStore.values()) {
      if (item.tenantId !== tenantId) continue;

      if (filter?.vehicleId && item.vehicleId !== filter.vehicleId) continue;
      if (filter?.vehicleIds && !filter.vehicleIds.includes(item.vehicleId)) continue;
      if (filter?.blockType && item.blockType !== filter.blockType) continue;

      if (filter?.status) {
        if (Array.isArray(filter.status)) {
          if (!filter.status.includes(item.status)) continue;
        } else if (item.status !== filter.status) {
          continue;
        }
      }

      if (filter?.from || filter?.to) {
        const itemStart = new Date(item.startsAt).getTime();
        const itemEnd = new Date(item.endsAt).getTime();
        if (filter.from && itemEnd <= new Date(filter.from).getTime()) continue;
        if (filter.to && itemStart >= new Date(filter.to).getTime()) continue;
      }

      results.push({ ...item });
    }

    return results.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }

  async findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<VehicleBlock | null> {
    const item = VehicleBlockRepository.blockStore.get(id);
    if (!item) return null;
    if (item.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, item.tenantId);
    }
    return { ...item };
  }

  async releaseBlock(
    id: string,
    tenantId: string,
    reason?: string,
    actorUserId?: string,
    tx?: TransactionContext
  ): Promise<VehicleBlock> {
    const item = VehicleBlockRepository.blockStore.get(id);
    if (!item) {
      throw new VehicleBlockNotFoundError(id);
    }
    if (item.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, item.tenantId);
    }

    const now = new Date().toISOString();
    item.status = "RELEASED";
    item.releasedAt = now;
    item.releasedBy = actorUserId || null;
    item.releaseReason = reason || "Block manually released";
    item.updatedAt = now;

    VehicleBlockRepository.blockStore.set(item.id, item);
    return { ...item };
  }

  async findOverlappingBlocks(
    tenantId: string,
    vehicleId: string,
    startsAt: string,
    endsAt: string,
    tx?: TransactionContext
  ): Promise<VehicleBlock[]> {
    const start = new Date(startsAt);
    const end = new Date(endsAt);

    const overlapping: VehicleBlock[] = [];
    for (const item of VehicleBlockRepository.blockStore.values()) {
      if (item.tenantId !== tenantId || item.vehicleId !== vehicleId) continue;
      if (item.status !== "ACTIVE" && item.status !== "SCHEDULED") continue;

      const itemStart = new Date(item.startsAt);
      const itemEnd = new Date(item.endsAt);

      if (VehicleBlockRepository.intervalsOverlap(start, end, itemStart, itemEnd)) {
        overlapping.push({ ...item });
      }
    }

    return overlapping;
  }

  async deleteBlock(id: string, tenantId: string, tx?: TransactionContext): Promise<void> {
    const item = VehicleBlockRepository.blockStore.get(id);
    if (!item) return;
    if (item.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, item.tenantId);
    }
    VehicleBlockRepository.blockStore.delete(id);
  }

  async findByVehicleId(vehicleId: string, tenantId: string): Promise<VehicleBlock[]> {
    return this.listBlocks(tenantId, { vehicleId });
  }

  async create(data: any): Promise<VehicleBlock> {
    const startsAt = data.startsAt || data.blockedFrom || new Date().toISOString();
    const endsAt = data.endsAt || data.blockedUntil || "2099-12-31T23:59:59.999Z";
    return this.createBlock(data.tenantId, {
      vehicleId: data.vehicleId,
      blockType: data.blockType || "COMPLIANCE",
      startsAt,
      endsAt,
      reason: data.reason || "Operational block",
      notes: data.notes,
    });
  }

  async update(id: string, tenantId: string, data: any): Promise<VehicleBlock> {
    const block = VehicleBlockRepository.blockStore.get(id);
    if (!block) throw new VehicleBlockNotFoundError(id);
    if (block.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, block.tenantId);
    }
    const updated = {
      ...block,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    VehicleBlockRepository.blockStore.set(id, updated);
    return { ...updated };
  }
}
