// ============================================================================
// CAR HIRE OS — BOOKING STATE MACHINE (DOM-003 §14-16, DEV-006, BRS-001)
// Canonical state transitions, guard conditions, and immutable lifecycle invariants
// ============================================================================

import type { BookingStatus } from "@carhire/types";
import { BookingInvalidStateTransitionError } from "@carhire/database";

export interface StateTransitionGuardContext {
  hasAssignedVehicle?: boolean;
  hasCustomer?: boolean;
  hasValidDates?: boolean;
  hasPricingSnapshot?: boolean;
  hasAllocationOrHold?: boolean;
  paymentVerified?: boolean;
  depositVerified?: boolean;
}

export class BookingStateMachine {
  /**
   * Explicit adjacency matrix of all legal booking state transitions
   */
  private static readonly ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
    DRAFT: ["PENDING", "PENDING_CONFIRMATION", "QUOTED", "CANCELLED"],
    PENDING: ["QUOTED", "REJECTED", "CANCELLED", "PENDING_CONFIRMATION"],
    PENDING_CONFIRMATION: ["CONFIRMED", "AWAITING_PAYMENT", "REJECTED", "CANCELLED", "EXPIRED"],
    QUOTED: ["AWAITING_PAYMENT", "CONFIRMED", "EXPIRED", "CANCELLED", "REJECTED"],
    AWAITING_PAYMENT: ["CONFIRMED", "PENDING_CONFIRMATION", "EXPIRED", "CANCELLED", "REJECTED"],
    CONFIRMED: ["ACTIVE", "CANCELLED", "NO_SHOW"],
    ACTIVE: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
    REJECTED: [],
    EXPIRED: [],
    NO_SHOW: [],
  };

  /**
   * Terminal states where no further standard transitions can occur
   */
  public static readonly TERMINAL_STATES: ReadonlySet<BookingStatus> = new Set([
    "COMPLETED",
    "CANCELLED",
    "REJECTED",
    "EXPIRED",
    "NO_SHOW",
  ]);

  /**
   * States where a physical vehicle allocation hold or booking allocation is strictly required
   */
  public static readonly ALLOCATION_REQUIRED_STATES: ReadonlySet<BookingStatus> = new Set([
    "CONFIRMED",
    "ACTIVE",
  ]);

  /**
   * Verifies whether transitioning from `currentStatus` to `targetStatus` is legally allowed
   */
  public static canTransition(currentStatus: BookingStatus, targetStatus: BookingStatus): boolean {
    if (currentStatus === targetStatus) return false;
    const allowed = this.ALLOWED_TRANSITIONS[currentStatus] || [];
    return allowed.includes(targetStatus);
  }

  /**
   * Asserts that a state transition is legal, throwing a typed domain error if invalid
   */
  public static assertCanTransition(
    currentStatus: BookingStatus,
    targetStatus: BookingStatus,
    guardContext?: StateTransitionGuardContext
  ): void {
    if (!this.canTransition(currentStatus, targetStatus)) {
      throw new BookingInvalidStateTransitionError(
        currentStatus,
        targetStatus,
        `Transition from ${currentStatus} to ${targetStatus} is not permitted by canonical state machine.`
      );
    }

    // Specific business guard validations
    if (targetStatus === "QUOTED" && guardContext) {
      if (guardContext.hasValidDates === false) {
        throw new BookingInvalidStateTransitionError(
          currentStatus,
          targetStatus,
          "Cannot transition to QUOTED: pickup and return dates must be valid."
        );
      }
    }

    if (targetStatus === "CONFIRMED" && guardContext) {
      if (guardContext.hasAssignedVehicle === false) {
        throw new BookingInvalidStateTransitionError(
          currentStatus,
          targetStatus,
          "Cannot confirm booking without an assigned vehicle."
        );
      }
      if (guardContext.hasPricingSnapshot === false) {
        throw new BookingInvalidStateTransitionError(
          currentStatus,
          targetStatus,
          "Cannot confirm booking without a frozen pricing snapshot."
        );
      }
    }
  }

  /**
   * Returns list of legal next statuses from current status
   */
  public static getNextAllowedStatuses(currentStatus: BookingStatus): BookingStatus[] {
    return [...(this.ALLOWED_TRANSITIONS[currentStatus] || [])];
  }

  /**
   * Checks if status is terminal
   */
  public static isTerminal(status: BookingStatus): boolean {
    return this.TERMINAL_STATES.has(status);
  }
}
