// ============================================================================
// CAR HIRE OS — AVAILABILITY ENGINE DOMAIN CALCULATOR (DEV-004, DOM-001)
// Pure, deterministic business logic for fleet availability evaluation
// ============================================================================

import type {
  Vehicle,
  VehicleAllocation,
  VehicleBlock,
  VehicleAvailabilityCalendarResponse,
  VehicleAvailabilityCalendarEntry,
  AllocationStatus,
} from "@carhire/types";
import { TimeInterval } from "./time-interval";

export class AvailabilityEngine {
  /**
   * Evaluates if a vehicle's lifecycle & operational status permits allocation
   */
  static isVehicleOperable(vehicle: {
    status?: string;
    lifecycleStatus?: string;
    operationalStatus?: string;
  }): boolean {
    const status = (vehicle.lifecycleStatus || vehicle.status || "").toUpperCase();
    const operStatus = (vehicle.operationalStatus || "").toUpperCase();

    const allowedStatuses = ["ACTIVE", "AVAILABLE", "OPERATIONAL", "MAINTENANCE_DUE", "READY_FOR_DISPATCH"];
    const blockedStatuses = [
      "DECOMMISSIONED",
      "WRITTEN_OFF",
      "STOLEN",
      "IMPOUNDED",
      "RETIRED",
      "SUSPENDED",
      "ARCHIVED",
      "INACTIVE",
      "MAINTENANCE",
      "UNDER_MAINTENANCE",
      "GROUNDED",
      "DAMAGED",
    ];

    if (blockedStatuses.includes(status) || blockedStatuses.includes(operStatus)) {
      return false;
    }

    if (allowedStatuses.includes(status) || allowedStatuses.includes(operStatus)) {
      return true;
    }

    // Default to true if active
    return status !== "INACTIVE" && status !== "DECOMMISSIONED";
  }

  /**
   * Checks if an interval conflicts with any active allocations or blocks
   */
  static checkIntervalConflict(
    targetInterval: TimeInterval,
    allocations: VehicleAllocation[],
    blocks: VehicleBlock[],
    excludeAllocationId?: string
  ): {
    hasConflict: boolean;
    conflictingAllocation?: VehicleAllocation;
    conflictingBlock?: VehicleBlock;
    reason?: string;
  } {
    const blockingStatuses: AllocationStatus[] = ["HELD", "CONFIRMED", "ACTIVE"];
    const now = Date.now();

    // 1. Check allocations
    for (const alloc of allocations) {
      if (excludeAllocationId && alloc.id === excludeAllocationId) continue;
      if (!blockingStatuses.includes(alloc.status)) continue;

      // Skip expired holds
      if (alloc.status === "HELD" && alloc.holdExpiresAt) {
        if (new Date(alloc.holdExpiresAt).getTime() <= now) {
          continue;
        }
      }

      try {
        const allocInterval = new TimeInterval(alloc.startsAt, alloc.endsAt);
        if (targetInterval.overlaps(allocInterval)) {
          return {
            hasConflict: true,
            conflictingAllocation: alloc,
            reason: `Conflicting ${alloc.status} allocation (${alloc.id}) from ${alloc.startsAt} to ${alloc.endsAt}`,
          };
        }
      } catch {
        // Ignore corrupted legacy intervals
      }
    }

    // 2. Check blocks (e.g. maintenance, accident, compliance)
    for (const block of blocks) {
      if (block.status !== "ACTIVE" && block.status !== "SCHEDULED") continue;

      try {
        const blockInterval = new TimeInterval(block.startsAt, block.endsAt);
        if (targetInterval.overlaps(blockInterval)) {
          return {
            hasConflict: true,
            conflictingBlock: block,
            reason: `Conflicting active block (${block.blockType}: ${block.reason}) from ${block.startsAt} to ${block.endsAt}`,
          };
        }
      } catch {
        // Ignore invalid block intervals
      }
    }

    return { hasConflict: false };
  }

  /**
   * Generates a timeline calendar summary for a specific vehicle and time window
   */
  static generateCalendarSummary(
    vehicleId: string,
    window: TimeInterval,
    allocations: VehicleAllocation[],
    blocks: VehicleBlock[]
  ): VehicleAvailabilityCalendarResponse {
    const entries: VehicleAvailabilityCalendarEntry[] = [];

    for (const a of allocations) {
      if (a.vehicleId !== vehicleId) continue;
      try {
        const itemInterval = new TimeInterval(a.startsAt, a.endsAt);
        if (window.overlaps(itemInterval)) {
          const isBlocking =
            ["HELD", "CONFIRMED", "ACTIVE"].includes(a.status) &&
            !(a.status === "HELD" && a.holdExpiresAt && new Date(a.holdExpiresAt).getTime() <= Date.now());

          entries.push({
            id: a.id,
            type: a.status === "HELD" ? "HOLD" : "ALLOCATION",
            subType: a.allocationType,
            status: a.status,
            startsAt: a.startsAt,
            endsAt: a.endsAt,
            isBlocking,
            sourceId: a.sourceId,
            summary: a.reason || `${a.allocationType} (${a.status})`,
          });
        }
      } catch {
        // Skip
      }
    }

    for (const b of blocks) {
      if (b.vehicleId !== vehicleId) continue;
      try {
        const itemInterval = new TimeInterval(b.startsAt, b.endsAt);
        if (window.overlaps(itemInterval)) {
          entries.push({
            id: b.id,
            type: "BLOCK",
            subType: b.blockType,
            status: b.status,
            startsAt: b.startsAt,
            endsAt: b.endsAt,
            isBlocking: b.status === "ACTIVE" || b.status === "SCHEDULED",
            sourceId: b.allocationId,
            summary: `${b.blockType}: ${b.reason}`,
          });
        }
      } catch {
        // Skip
      }
    }

    entries.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    return {
      vehicleId,
      windowStartsAt: window.startsAtIso,
      windowEndsAt: window.endsAtIso,
      entries,
      totalEntries: entries.length,
    };
  }
}
