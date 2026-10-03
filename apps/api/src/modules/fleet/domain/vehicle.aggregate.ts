// ============================================================================
// CAR HIRE OS — VEHICLE AGGREGATE ROOT & STATE MACHINES (DOM-001, DOM-003)
// Enforces lifecycle, availability, and telemetry domain invariants
// ============================================================================

import type {
  Vehicle,
  VehicleLifecycleStatus,
  VehicleAvailabilityStatus,
} from "@carhire/types";
import {
  VehicleInvalidStatusTransitionError,
  VehicleNotOperationalError,
} from "./errors/vehicle.errors";

export class VehicleAggregate {
  // Lifecycle transition matrix
  private static readonly VALID_LIFECYCLE_TRANSITIONS: Record<
    VehicleLifecycleStatus,
    VehicleLifecycleStatus[]
  > = {
    DRAFT: ["PENDING_VERIFICATION", "ACTIVE", "INACTIVE"],
    PENDING_VERIFICATION: ["ACTIVE", "DRAFT", "INACTIVE", "SUSPENDED"],
    ACTIVE: ["SUSPENDED", "INACTIVE", "SOLD", "RETIRED", "OPERATIONAL"],
    OPERATIONAL: ["SUSPENDED", "INACTIVE", "SOLD", "RETIRED", "ACTIVE"],
    SUSPENDED: ["ACTIVE", "OPERATIONAL", "INACTIVE", "RETIRED", "SOLD"],
    INACTIVE: ["DRAFT", "PENDING_VERIFICATION", "ACTIVE", "RETIRED", "SOLD"],
    SOLD: [], // Terminal
    RETIRED: ["SOLD"], // Terminal except sale
  };

  // Availability transition matrix
  private static readonly VALID_AVAILABILITY_TRANSITIONS: Record<
    VehicleAvailabilityStatus,
    VehicleAvailabilityStatus[]
  > = {
    AVAILABLE: ["RESERVED", "ON_RENT", "MAINTENANCE", "BLOCKED"],
    RESERVED: ["AVAILABLE", "ON_RENT", "BLOCKED"],
    ON_RENT: ["AVAILABLE", "MAINTENANCE", "BLOCKED"],
    MAINTENANCE: ["AVAILABLE", "BLOCKED"],
    BLOCKED: ["AVAILABLE", "MAINTENANCE"],
  };

  public static validateLifecycleTransition(
    current: VehicleLifecycleStatus,
    next: VehicleLifecycleStatus
  ): void {
    if (current === next) return;

    const allowed = this.VALID_LIFECYCLE_TRANSITIONS[current] || [];
    if (!allowed.includes(next)) {
      throw new VehicleInvalidStatusTransitionError(
        current,
        next,
        `Cannot transition vehicle from ${current} to ${next}`
      );
    }
  }

  public static validateAvailabilityTransition(
    current: VehicleAvailabilityStatus,
    next: VehicleAvailabilityStatus,
    lifecycle: VehicleLifecycleStatus
  ): void {
    // A vehicle that is not ACTIVE or OPERATIONAL cannot be marked AVAILABLE, ON_RENT, or RESERVED
    if ((next === "AVAILABLE" || next === "ON_RENT" || next === "RESERVED") &&
        lifecycle !== "ACTIVE" && lifecycle !== "OPERATIONAL") {
      throw new VehicleNotOperationalError(
        "N/A",
        `Cannot set availability to ${next} while vehicle lifecycle status is ${lifecycle}`
      );
    }

    if (current === next) return;

    const allowed = this.VALID_AVAILABILITY_TRANSITIONS[current] || [];
    if (!allowed.includes(next)) {
      throw new VehicleInvalidStatusTransitionError(
        current,
        next,
        `Cannot transition vehicle availability from ${current} to ${next}`
      );
    }
  }

  public static validateTelemetryUpdate(
    currentOdometer: number,
    newOdometer: number,
    isManualAuditOverride: boolean = false
  ): void {
    if (!isManualAuditOverride && newOdometer < currentOdometer) {
      throw new Error(
        `Mileage cannot decrease from ${currentOdometer} to ${newOdometer} without an authorized audit override.`
      );
    }
  }
}
