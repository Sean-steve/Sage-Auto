// ============================================================================
// CAR HIRE OS — CUSTOMER AGGREGATE ROOT & STATE MACHINE (DOM-001, DOM-003)
// Individual, VIP & Corporate Customer Domain Invariants & KYC Lifecycle
// ============================================================================

import type {
  Customer,
  CustomerStatus,
  VerificationStatus,
} from "@carhire/types";
import {
  CustomerInvalidStatusTransitionError,
  CustomerInvalidVerificationTransitionError,
  CustomerBlockedError,
} from "./errors/customer.errors";

export class CustomerAggregate {
  // Lifecycle transition matrix
  private static readonly VALID_STATUS_TRANSITIONS: Record<
    CustomerStatus,
    CustomerStatus[]
  > = {
    ACTIVE: ["RESTRICTED", "BLOCKED", "INACTIVE"],
    RESTRICTED: ["ACTIVE", "BLOCKED", "INACTIVE"],
    BLOCKED: ["ACTIVE", "RESTRICTED", "INACTIVE"],
    INACTIVE: ["ACTIVE", "RESTRICTED", "BLOCKED"],
  };

  // KYC verification transition matrix
  private static readonly VALID_VERIFICATION_TRANSITIONS: Record<
    VerificationStatus,
    VerificationStatus[]
  > = {
    UNVERIFIED: ["PENDING_VERIFICATION", "VERIFIED", "REJECTED"],
    PENDING_VERIFICATION: ["VERIFIED", "REJECTED", "UNVERIFIED"],
    VERIFIED: ["REJECTED", "PENDING_VERIFICATION", "UNVERIFIED"],
    REJECTED: ["PENDING_VERIFICATION", "UNVERIFIED"],
  };

  public static validateStatusTransition(
    current: CustomerStatus,
    next: CustomerStatus,
    reason?: string
  ): void {
    if (current === next) return;

    const allowed = this.VALID_STATUS_TRANSITIONS[current] || [];
    if (!allowed.includes(next)) {
      throw new CustomerInvalidStatusTransitionError(current, next, reason);
    }
  }

  public static validateVerificationTransition(
    current: VerificationStatus,
    next: VerificationStatus
  ): void {
    if (current === next) return;

    const allowed = this.VALID_VERIFICATION_TRANSITIONS[current] || [];
    if (!allowed.includes(next)) {
      throw new CustomerInvalidVerificationTransitionError(current, next);
    }
  }

  public static assertEligibleForRental(customer: Customer): void {
    if (customer.status === "BLOCKED") {
      throw new CustomerBlockedError(
        customer.customerNumber,
        customer.notes || "Customer is on the tenant security blacklist"
      );
    }

    if (customer.status === "INACTIVE") {
      throw new Error(`Customer ${customer.customerNumber} is INACTIVE and cannot initiate rentals.`);
    }

    // License expiry check
    if (customer.licenseExpiryDate) {
      const expiry = new Date(customer.licenseExpiryDate).getTime();
      const now = Date.now();
      if (expiry < now) {
        throw new Error(
          `Customer ${customer.customerNumber} driving license expired on ${customer.licenseExpiryDate}`
        );
      }
    }
  }
}
