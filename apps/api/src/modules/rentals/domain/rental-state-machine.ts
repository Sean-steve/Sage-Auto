// ============================================================================
// CAR HIRE OS — RENTAL STATE MACHINE (DOM-003 §19-20, DEV-006, BRS-001)
// Canonical state transitions and on-road lifecycle invariants
// ============================================================================

import type { RentalState } from "@carhire/types";
import { RentalInvalidStateTransitionError } from "@carhire/database";

export class RentalStateMachine {
  private static readonly ALLOWED_TRANSITIONS: Record<RentalState, RentalState[]> = {
    SCHEDULED_HANDOVER: ["ACTIVE_ON_ROAD"],
    ACTIVE_ON_ROAD: [
      "RETURN_SCHEDULED",
      "VEHICLE_RECEIVED",
      "RETURN_INSPECTION_PENDING",
      "INSPECTION",
      "FINAL_CALCULATION",
      "FINAL_SETTLEMENT_PENDING",
      "OVERDUE",
      "TERMINATED_EARLY",
      "COMPLETED",
      "RETURN_COMPLETED",
    ],
    OVERDUE: [
      "RETURN_SCHEDULED",
      "VEHICLE_RECEIVED",
      "RETURN_INSPECTION_PENDING",
      "INSPECTION",
      "FINAL_CALCULATION",
      "FINAL_SETTLEMENT_PENDING",
    ],
    RETURN_SCHEDULED: [
      "VEHICLE_RECEIVED",
      "RETURN_INSPECTION_PENDING",
      "INSPECTION",
      "ACTIVE_ON_ROAD",
    ],
    VEHICLE_RECEIVED: [
      "RETURN_INSPECTION_PENDING",
      "INSPECTION",
      "DAMAGE_ASSESSMENT",
      "FINAL_CALCULATION",
      "FINAL_SETTLEMENT_PENDING",
    ],
    RETURN_INSPECTION_PENDING: [
      "INSPECTION",
      "DAMAGE_ASSESSMENT",
      "FINAL_CALCULATION",
      "FINAL_SETTLEMENT_PENDING",
    ],
    INSPECTION: [
      "DAMAGE_ASSESSMENT",
      "FINAL_CALCULATION",
      "FINAL_SETTLEMENT_PENDING",
    ],
    DAMAGE_ASSESSMENT: [
      "FINAL_CALCULATION",
      "FINAL_SETTLEMENT_PENDING",
    ],
    FINAL_CALCULATION: [
      "DEPOSIT_PROCESSING",
      "COMPLETED",
      "RETURN_COMPLETED",
    ],
    FINAL_SETTLEMENT_PENDING: [
      "DEPOSIT_PROCESSING",
      "COMPLETED",
      "RETURN_COMPLETED",
    ],
    DEPOSIT_PROCESSING: [
      "COMPLETED",
      "RETURN_COMPLETED",
    ],
    TERMINATED_EARLY: [
      "FINAL_CALCULATION",
      "FINAL_SETTLEMENT_PENDING",
      "COMPLETED",
      "RETURN_COMPLETED",
    ],
    COMPLETED: [],
    RETURN_COMPLETED: [],
  };

  public static readonly TERMINAL_STATES: ReadonlySet<RentalState> = new Set([
    "COMPLETED",
    "RETURN_COMPLETED",
  ]);

  public static canTransition(currentStatus: RentalState, targetStatus: RentalState): boolean {
    if (currentStatus === targetStatus) return false;
    const allowed = this.ALLOWED_TRANSITIONS[currentStatus] || [];
    return allowed.includes(targetStatus);
  }

  public static validateTransition(
    currentStatus: RentalState,
    targetStatus: RentalState,
    reason?: string
  ): void {
    if (!this.canTransition(currentStatus, targetStatus)) {
      throw new RentalInvalidStateTransitionError(currentStatus, targetStatus, reason);
    }
  }
}
