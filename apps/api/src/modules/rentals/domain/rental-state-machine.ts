// ============================================================================
// CAR HIRE OS — RENTAL STATE MACHINE (DOM-003 §19-20, DEV-006, BRS-001)
// Canonical state transitions and on-road lifecycle invariants
// ============================================================================

import type { RentalState } from "@carhire/types";
import { RentalInvalidStateTransitionError } from "@carhire/database";

export class RentalStateMachine {
  private static readonly ALLOWED_TRANSITIONS: Record<RentalState, RentalState[]> = {
    SCHEDULED_HANDOVER: ["ACTIVE_ON_ROAD"],
    ACTIVE_ON_ROAD: ["RETURN_SCHEDULED", "OVERDUE", "TERMINATED_EARLY"],
    OVERDUE: ["RETURN_SCHEDULED", "TERMINATED_EARLY"],
    RETURN_SCHEDULED: ["VEHICLE_RECEIVED", "ACTIVE_ON_ROAD"],
    VEHICLE_RECEIVED: ["RETURN_INSPECTION_PENDING", "INSPECTION", "DAMAGE_ASSESSMENT"],
    RETURN_INSPECTION_PENDING: ["INSPECTION", "DAMAGE_ASSESSMENT"],
    INSPECTION: ["DAMAGE_ASSESSMENT"],
    DAMAGE_ASSESSMENT: ["FINAL_CALCULATION"],
    FINAL_CALCULATION: ["FINAL_SETTLEMENT_PENDING", "DEPOSIT_PROCESSING"],
    FINAL_SETTLEMENT_PENDING: ["DEPOSIT_PROCESSING"],
    DEPOSIT_PROCESSING: ["COMPLETED", "RETURN_COMPLETED"],
    TERMINATED_EARLY: ["RETURN_SCHEDULED"],
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
