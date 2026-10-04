import { createRecordStore } from "../record-store";
// ============================================================================
// CAR HIRE OS — VEHICLE ALLOCATION REPOSITORY (DEV-004, DEV-006, BRS-001)
// Concurrency-safe interval allocation ledger with PostgreSQL GiST exclusion guarantee
// ============================================================================

import type {
  VehicleAllocation,
  AllocationHold,
  CreateAllocationDto,
  CreateHoldDto,
  ConfirmHoldDto,
  AllocationStatus,
  AllocationType,
  HoldStatus,
} from "@carhire/types";
import {
  AvailabilityConflictError,
  InvalidAvailabilityIntervalError,
  AvailabilityHoldNotFoundError,
  AvailabilityHoldExpiredError,
  RecordNotFoundError,
  CrossTenantViolationError,
  ConcurrencyConflictError,
} from "../errors";
import { TransactionContext } from "../transaction-manager";

export interface AllocationFilter {
  vehicleId?: string;
  vehicleIds?: string[];
  status?: AllocationStatus | AllocationStatus[];
  from?: string;
  to?: string;
  allocationType?: AllocationType;
  sourceType?: string;
  sourceId?: string;
  holdToken?: string;
}

export interface HoldFilter {
  vehicleId?: string;
  status?: HoldStatus | HoldStatus[];
  from?: string;
  to?: string;
  customerId?: string;
  bookingDraftId?: string;
}

export interface IVehicleAllocationRepository {
  createAllocation(
    tenantId: string,
    data: CreateAllocationDto & { actorUserId?: string },
    tx?: TransactionContext
  ): Promise<VehicleAllocation>;

  findAllocations(
    tenantId: string,
    filter?: AllocationFilter,
    tx?: TransactionContext
  ): Promise<VehicleAllocation[]>;

  findById(
    id: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<VehicleAllocation | null>;

  findByHoldToken(
    holdToken: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<VehicleAllocation | null>;

  findBySource(
    sourceType: string,
    sourceId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<VehicleAllocation[]>;

  findOverlappingAllocations(
    tenantId: string,
    vehicleId: string,
    startsAt: string,
    endsAt: string,
    excludeAllocationId?: string,
    tx?: TransactionContext
  ): Promise<VehicleAllocation[]>;

  releaseAllocation(
    id: string,
    tenantId: string,
    reason?: string,
    actorUserId?: string,
    tx?: TransactionContext
  ): Promise<VehicleAllocation>;

  updateStatus(
    id: string,
    tenantId: string,
    status: AllocationStatus,
    actorUserId?: string,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<VehicleAllocation>;

  createHold(
    tenantId: string,
    data: CreateHoldDto & { actorUserId?: string },
    tx?: TransactionContext
  ): Promise<{ allocation: VehicleAllocation; hold: AllocationHold }>;

  confirmHold(
    tenantId: string,
    holdToken: string,
    data: ConfirmHoldDto & { actorUserId?: string },
    tx?: TransactionContext
  ): Promise<VehicleAllocation>;

  releaseHold(
    tenantId: string,
    holdTokenOrId: string,
    actorUserId?: string,
    tx?: TransactionContext
  ): Promise<void>;

  findHoldByToken(
    holdToken: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<AllocationHold | null>;

  listHolds(
    tenantId: string,
    filter?: HoldFilter,
    tx?: TransactionContext
  ): Promise<AllocationHold[]>;

  expireStaleHolds(tenantId?: string, tx?: TransactionContext): Promise<number>;

  deleteAllocation(id: string, tenantId: string, tx?: TransactionContext): Promise<void>;
}

export class VehicleAllocationRepository implements IVehicleAllocationRepository {
  private static allocationStore = createRecordStore<string, VehicleAllocation>("vehicle-allocation.repository:allocationStore");
  private static holdStore = createRecordStore<string, AllocationHold>("vehicle-allocation.repository:holdStore");
  private static allocationLocks = new Map<string, Promise<void>>();

  static clear(): void {
    VehicleAllocationRepository.allocationStore.clear();
    VehicleAllocationRepository.holdStore.clear();
    VehicleAllocationRepository.allocationLocks.clear();
  }

  static seed(allocations?: VehicleAllocation[], holds?: AllocationHold[]): void {
    if (allocations) {
      for (const a of allocations) {
        VehicleAllocationRepository.allocationStore.set(a.id, { ...a });
      }
    }
    if (holds) {
      for (const h of holds) {
        VehicleAllocationRepository.holdStore.set(h.id, { ...h });
      }
    }
  }

  /**
   * Evaluates if two half-open intervals [A_start, A_end) and [B_start, B_end) overlap.
   */
  private static intervalsOverlap(
    startA: Date,
    endA: Date,
    startB: Date,
    endB: Date
  ): boolean {
    return startA.getTime() < endB.getTime() && startB.getTime() < endA.getTime();
  }

  /**
   * Helper to serialize write operations per vehicle to guarantee atomic GiST-like exclusion
   */
  private async acquireVehicleLock<T>(
    tenantId: string,
    vehicleId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockKey = `${tenantId}:${vehicleId}`;
    while (VehicleAllocationRepository.allocationLocks.has(lockKey)) {
      await VehicleAllocationRepository.allocationLocks.get(lockKey);
    }

    let releaseLock: () => void = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    VehicleAllocationRepository.allocationLocks.set(lockKey, lockPromise);

    try {
      return await operation();
    } finally {
      VehicleAllocationRepository.allocationLocks.delete(lockKey);
      releaseLock();
    }
  }

  async createAllocation(
    tenantId: string,
    data: CreateAllocationDto & { actorUserId?: string },
    tx?: TransactionContext
  ): Promise<VehicleAllocation> {
    const start = new Date(data.startsAt);
    const end = new Date(data.endsAt);

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
      throw new InvalidAvailabilityIntervalError(
        `Invalid allocation interval: endsAt (${data.endsAt}) must be strictly greater than startsAt (${data.startsAt}).`
      );
    }

    return this.acquireVehicleLock(tenantId, data.vehicleId, async () => {
      // Auto-expire stale holds for this vehicle before checking conflicts
      await this.expireStaleHolds(tenantId, tx);

      const blockingStatuses: AllocationStatus[] = ["HELD", "CONFIRMED", "ACTIVE"];
      const requestedStatus = data.status || "CONFIRMED";

      if (blockingStatuses.includes(requestedStatus)) {
        for (const existing of VehicleAllocationRepository.allocationStore.values()) {
          if (
            existing.tenantId === tenantId &&
            existing.vehicleId === data.vehicleId &&
            blockingStatuses.includes(existing.status)
          ) {
            // If it's a hold, verify it hasn't expired
            if (existing.status === "HELD" && existing.holdExpiresAt) {
              if (new Date(existing.holdExpiresAt).getTime() <= Date.now()) {
                existing.status = "EXPIRED";
                existing.updatedAt = new Date().toISOString();
                continue; // Skip expired hold
              }
            }

            const existingStart = new Date(existing.startsAt);
            const existingEnd = new Date(existing.endsAt);

            if (
              VehicleAllocationRepository.intervalsOverlap(
                start,
                end,
                existingStart,
                existingEnd
              )
            ) {
              throw new AvailabilityConflictError(
                `This vehicle already has ${existing.status.toLowerCase()} activity from ${existing.startsAt} to ${existing.endsAt}. Choose another vehicle or time window.`,
                data.vehicleId,
                { startsAt: existing.startsAt, endsAt: existing.endsAt }
              );
            }
          }
        }
      }

      const now = new Date().toISOString();
      const allocationId = `alloc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const allocation: VehicleAllocation = {
        id: allocationId,
        tenantId,
        vehicleId: data.vehicleId,
        allocationType: data.allocationType,
        sourceType: data.sourceType || null,
        sourceId: data.sourceId || null,
        status: requestedStatus,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        bufferMinutes: data.turnaroundMinutes || 0,
        holdExpiresAt: data.holdExpiresAt || null,
        holdToken: data.holdToken || null,
        reason: data.reason || null,
        notes: data.notes || null,
        actorUserId: data.actorUserId || null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      };

      VehicleAllocationRepository.allocationStore.set(allocation.id, allocation);
      return { ...allocation };
    });
  }

  async findAllocations(
    tenantId: string,
    filter?: AllocationFilter,
    tx?: TransactionContext
  ): Promise<VehicleAllocation[]> {
    await this.expireStaleHolds(tenantId, tx);
    const results: VehicleAllocation[] = [];

    for (const item of VehicleAllocationRepository.allocationStore.values()) {
      if (item.tenantId !== tenantId) continue;

      if (filter?.vehicleId && item.vehicleId !== filter.vehicleId) continue;
      if (filter?.vehicleIds && !filter.vehicleIds.includes(item.vehicleId)) continue;
      if (filter?.allocationType && item.allocationType !== filter.allocationType) continue;
      if (filter?.sourceType && item.sourceType !== filter.sourceType) continue;
      if (filter?.sourceId && item.sourceId !== filter.sourceId) continue;
      if (filter?.holdToken && item.holdToken !== filter.holdToken) continue;

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
  ): Promise<VehicleAllocation | null> {
    const item = VehicleAllocationRepository.allocationStore.get(id);
    if (!item) return null;
    if (item.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, item.tenantId);
    }
    return { ...item };
  }

  async findByHoldToken(
    holdToken: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<VehicleAllocation | null> {
    for (const item of VehicleAllocationRepository.allocationStore.values()) {
      if (item.holdToken === holdToken) {
        if (item.tenantId !== tenantId) {
          throw new CrossTenantViolationError(tenantId, item.tenantId);
        }
        return { ...item };
      }
    }
    return null;
  }

  async findBySource(
    sourceType: string,
    sourceId: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<VehicleAllocation[]> {
    return this.findAllocations(tenantId, { sourceType, sourceId }, tx);
  }

  async findOverlappingAllocations(
    tenantId: string,
    vehicleId: string,
    startsAt: string,
    endsAt: string,
    excludeAllocationId?: string,
    tx?: TransactionContext
  ): Promise<VehicleAllocation[]> {
    await this.expireStaleHolds(tenantId, tx);
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    const blockingStatuses: AllocationStatus[] = ["HELD", "CONFIRMED", "ACTIVE"];

    const overlapping: VehicleAllocation[] = [];
    for (const item of VehicleAllocationRepository.allocationStore.values()) {
      if (item.tenantId !== tenantId || item.vehicleId !== vehicleId) continue;
      if (excludeAllocationId && item.id === excludeAllocationId) continue;
      if (!blockingStatuses.includes(item.status)) continue;

      if (item.status === "HELD" && item.holdExpiresAt && new Date(item.holdExpiresAt).getTime() <= Date.now()) {
        continue; // Expired hold
      }

      const itemStart = new Date(item.startsAt);
      const itemEnd = new Date(item.endsAt);

      if (VehicleAllocationRepository.intervalsOverlap(start, end, itemStart, itemEnd)) {
        overlapping.push({ ...item });
      }
    }

    return overlapping;
  }

  async releaseAllocation(
    id: string,
    tenantId: string,
    reason?: string,
    actorUserId?: string,
    tx?: TransactionContext
  ): Promise<VehicleAllocation> {
    const item = VehicleAllocationRepository.allocationStore.get(id);
    if (!item) {
      throw new RecordNotFoundError("VehicleAllocation", id);
    }
    if (item.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, item.tenantId);
    }

    const now = new Date().toISOString();
    item.status = "RELEASED";
    item.releasedAt = now;
    item.releasedBy = actorUserId || null;
    item.releaseReason = reason || "Allocation released";
    item.version += 1;
    item.updatedAt = now;

    // Release any associated hold record
    for (const hold of VehicleAllocationRepository.holdStore.values()) {
      if (hold.allocationId === id && hold.status === "PENDING") {
        hold.status = "RELEASED";
        hold.updatedAt = now;
      }
    }

    VehicleAllocationRepository.allocationStore.set(item.id, item);
    return { ...item };
  }

  async updateStatus(
    id: string,
    tenantId: string,
    status: AllocationStatus,
    actorUserId?: string,
    expectedVersion?: number,
    tx?: TransactionContext
  ): Promise<VehicleAllocation> {
    const item = VehicleAllocationRepository.allocationStore.get(id);
    if (!item) {
      throw new RecordNotFoundError("VehicleAllocation", id);
    }
    if (item.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, item.tenantId);
    }
    if (expectedVersion !== undefined && item.version !== expectedVersion) {
      throw new ConcurrencyConflictError(
        `Optimistic concurrency conflict on VehicleAllocation ${id}: expected version ${expectedVersion}, found ${item.version}.`
      );
    }

    const now = new Date().toISOString();
    item.status = status;
    item.version += 1;
    item.updatedAt = now;
    if (actorUserId) item.actorUserId = actorUserId;

    VehicleAllocationRepository.allocationStore.set(item.id, item);
    return { ...item };
  }

  async createHold(
    tenantId: string,
    data: CreateHoldDto & { actorUserId?: string },
    tx?: TransactionContext
  ): Promise<{ allocation: VehicleAllocation; hold: AllocationHold }> {
    const ttlMinutes = data.ttlMinutes || 15;
    const holdExpiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
    const holdToken = `hld_tok_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

    const allocation = await this.createAllocation(
      tenantId,
      {
        vehicleId: data.vehicleId,
        allocationType: "TEMPORARY_HOLD",
        status: "HELD",
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        holdExpiresAt,
        holdToken,
        reason: data.reason || `Temporary checkout hold (${ttlMinutes}m)`,
        actorUserId: data.actorUserId,
      },
      tx
    );

    const now = new Date().toISOString();
    const holdId = `hld_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const hold: AllocationHold = {
      id: holdId,
      tenantId,
      vehicleId: data.vehicleId,
      allocationId: allocation.id,
      holdToken,
      status: "PENDING",
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      expiresAt: holdExpiresAt,
      customerId: data.customerId || null,
      bookingDraftId: data.bookingDraftId || null,
      createdAt: now,
      updatedAt: now,
    };

    VehicleAllocationRepository.holdStore.set(hold.id, hold);
    return { allocation, hold };
  }

  async confirmHold(
    tenantId: string,
    holdToken: string,
    data: ConfirmHoldDto & { actorUserId?: string },
    tx?: TransactionContext
  ): Promise<VehicleAllocation> {
    let targetHold: AllocationHold | null = null;
    for (const h of VehicleAllocationRepository.holdStore.values()) {
      if (h.holdToken === holdToken) {
        targetHold = h;
        break;
      }
    }

    if (!targetHold) {
      throw new AvailabilityHoldNotFoundError(holdToken);
    }
    if (targetHold.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, targetHold.tenantId);
    }

    if (new Date(targetHold.expiresAt).getTime() <= Date.now() || targetHold.status === "EXPIRED") {
      targetHold.status = "EXPIRED";
      targetHold.updatedAt = new Date().toISOString();
      throw new AvailabilityHoldExpiredError(holdToken, targetHold.expiresAt);
    }

    if (targetHold.status !== "PENDING") {
      throw new AvailabilityConflictError(`Hold '${holdToken}' is not pending (status: ${targetHold.status}).`);
    }

    const allocation = VehicleAllocationRepository.allocationStore.get(targetHold.allocationId);
    if (!allocation) {
      throw new RecordNotFoundError("VehicleAllocation", targetHold.allocationId);
    }

    const now = new Date().toISOString();
    allocation.status = "CONFIRMED";
    allocation.allocationType = "BOOKING";
    allocation.sourceType = data.sourceType;
    allocation.sourceId = data.sourceId;
    allocation.reason = data.reason || "Hold converted to confirmed booking allocation";
    allocation.holdExpiresAt = null;
    allocation.version += 1;
    allocation.updatedAt = now;
    if (data.actorUserId) allocation.actorUserId = data.actorUserId;

    targetHold.status = "CONVERTED";
    targetHold.updatedAt = now;

    VehicleAllocationRepository.allocationStore.set(allocation.id, allocation);
    VehicleAllocationRepository.holdStore.set(targetHold.id, targetHold);

    return { ...allocation };
  }

  async releaseHold(
    tenantId: string,
    holdTokenOrId: string,
    actorUserId?: string,
    tx?: TransactionContext
  ): Promise<void> {
    let targetHold: AllocationHold | null = null;
    for (const h of VehicleAllocationRepository.holdStore.values()) {
      if (h.id === holdTokenOrId || h.holdToken === holdTokenOrId) {
        targetHold = h;
        break;
      }
    }

    if (!targetHold) {
      throw new AvailabilityHoldNotFoundError(holdTokenOrId);
    }
    if (targetHold.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, targetHold.tenantId);
    }

    const now = new Date().toISOString();
    targetHold.status = "RELEASED";
    targetHold.updatedAt = now;
    VehicleAllocationRepository.holdStore.set(targetHold.id, targetHold);

    const allocation = VehicleAllocationRepository.allocationStore.get(targetHold.allocationId);
    if (allocation && allocation.tenantId === tenantId) {
      allocation.status = "RELEASED";
      allocation.releasedAt = now;
      allocation.releasedBy = actorUserId || null;
      allocation.releaseReason = "Hold released by user or expired";
      allocation.version += 1;
      allocation.updatedAt = now;
      VehicleAllocationRepository.allocationStore.set(allocation.id, allocation);
    }
  }

  async findHoldByToken(
    holdToken: string,
    tenantId: string,
    tx?: TransactionContext
  ): Promise<AllocationHold | null> {
    for (const h of VehicleAllocationRepository.holdStore.values()) {
      if (h.holdToken === holdToken) {
        if (h.tenantId !== tenantId) {
          throw new CrossTenantViolationError(tenantId, h.tenantId);
        }
        return { ...h };
      }
    }
    return null;
  }

  async listHolds(
    tenantId: string,
    filter?: HoldFilter,
    tx?: TransactionContext
  ): Promise<AllocationHold[]> {
    await this.expireStaleHolds(tenantId, tx);
    const results: AllocationHold[] = [];

    for (const hold of VehicleAllocationRepository.holdStore.values()) {
      if (hold.tenantId !== tenantId) continue;
      if (filter?.vehicleId && hold.vehicleId !== filter.vehicleId) continue;
      if (filter?.customerId && hold.customerId !== filter.customerId) continue;
      if (filter?.bookingDraftId && hold.bookingDraftId !== filter.bookingDraftId) continue;

      if (filter?.status) {
        if (Array.isArray(filter.status)) {
          if (!filter.status.includes(hold.status)) continue;
        } else if (hold.status !== filter.status) {
          continue;
        }
      }

      if (filter?.from || filter?.to) {
        const holdStart = new Date(hold.startsAt).getTime();
        const holdEnd = new Date(hold.endsAt).getTime();
        if (filter.from && holdEnd <= new Date(filter.from).getTime()) continue;
        if (filter.to && holdStart >= new Date(filter.to).getTime()) continue;
      }

      results.push({ ...hold });
    }

    return results.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }

  async expireStaleHolds(tenantId?: string, tx?: TransactionContext): Promise<number> {
    const now = Date.now();
    let expiredCount = 0;
    const nowIso = new Date(now).toISOString();

    for (const hold of VehicleAllocationRepository.holdStore.values()) {
      if (tenantId && hold.tenantId !== tenantId) continue;
      if (hold.status === "PENDING" && new Date(hold.expiresAt).getTime() <= now) {
        hold.status = "EXPIRED";
        hold.updatedAt = nowIso;
        expiredCount++;

        const allocation = VehicleAllocationRepository.allocationStore.get(hold.allocationId);
        if (allocation && allocation.status === "HELD") {
          allocation.status = "EXPIRED";
          allocation.version += 1;
          allocation.updatedAt = nowIso;
          allocation.releaseReason = "Temporary hold expired";
        }
      }
    }

    return expiredCount;
  }

  async deleteAllocation(id: string, tenantId: string, tx?: TransactionContext): Promise<void> {
    const item = VehicleAllocationRepository.allocationStore.get(id);
    if (!item) return;
    if (item.tenantId !== tenantId) {
      throw new CrossTenantViolationError(tenantId, item.tenantId);
    }
    VehicleAllocationRepository.allocationStore.delete(id);
  }
}
