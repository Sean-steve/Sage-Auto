// ============================================================================
// CAR HIRE OS — DRIVER AGGREGATE ROOT & STATE MACHINE (DOM-001, DOM-003)
// Commercial, Chauffeur & Designated Driver Invariants & Duty Cycles
// ============================================================================

import type { Driver, DriverStatus, DriverVerificationStatus } from "@carhire/types";
import {
  DriverInvalidStatusTransitionError,
  DriverLicenseExpiredError,
} from "./errors/driver.errors";

export class DriverAggregate {
  // Duty & lifecycle transition matrix
  private static readonly VALID_STATUS_TRANSITIONS: Record<
    DriverStatus,
    DriverStatus[]
  > = {
    ACTIVE: ["SUSPENDED", "OFF_DUTY", "ON_TRIP", "BLACKLISTED"],
    OFF_DUTY: ["ACTIVE", "SUSPENDED", "BLACKLISTED"],
    ON_TRIP: ["ACTIVE", "OFF_DUTY", "SUSPENDED", "BLACKLISTED"],
    SUSPENDED: ["ACTIVE", "OFF_DUTY", "BLACKLISTED"],
    BLACKLISTED: ["ACTIVE", "SUSPENDED"],
  };

  public static validateStatusTransition(
    current: DriverStatus,
    next: DriverStatus,
    reason?: string
  ): void {
    if (current === next) return;

    const allowed = this.VALID_STATUS_TRANSITIONS[current] || [];
    if (!allowed.includes(next)) {
      throw new DriverInvalidStatusTransitionError(current, next, reason);
    }
  }

  public static assertEligibleForTrip(driver: Driver): void {
    if (driver.status === "BLACKLISTED" || driver.status === "SUSPENDED") {
      throw new Error(`Driver ${driver.driverNumber} is ${driver.status} and cannot be assigned to trips.`);
    }

    if (driver.licenseExpiryDate) {
      const expiry = new Date(driver.licenseExpiryDate).getTime();
      const now = Date.now();
      if (expiry < now) {
        throw new DriverLicenseExpiredError(driver.driverNumber, driver.licenseExpiryDate);
      }
    }
  }
}
