// ============================================================================
// CAR HIRE OS — SUBSCRIPTION STATE MACHINE (Sprint 6 Canonical Lifecycle)
// States: TRIAL, ACTIVE, RENEWAL_DUE, PAST_DUE, GRACE_PERIOD, SUSPENDED, CANCELLED, EXPIRED
// ============================================================================

import type { SubscriptionStatus } from "@carhire/types";
import { ERROR_CODES } from "@carhire/constants";

export class InvalidSubscriptionTransitionError extends Error {
  public readonly code = ERROR_CODES.INVALID_STATE_TRANSITION;
  public readonly fromState: SubscriptionStatus;
  public readonly toState: SubscriptionStatus;

  constructor(fromState: SubscriptionStatus, toState: SubscriptionStatus, reason?: string) {
    super(
      `Invalid subscription transition from ${fromState} to ${toState}${reason ? `: ${reason}` : ""}`
    );
    this.name = "InvalidSubscriptionTransitionError";
    this.fromState = fromState;
    this.toState = toState;
  }
}

export class SubscriptionStateMachine {
  // Allowed transitions map
  private static readonly ALLOWED_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
    TRIAL: ["ACTIVE", "EXPIRED", "CANCELLED", "SUSPENDED"],
    ACTIVE: ["RENEWAL_DUE", "PAST_DUE", "GRACE_PERIOD", "SUSPENDED", "CANCELLED", "ACTIVE"],
    RENEWAL_DUE: ["ACTIVE", "PAST_DUE", "GRACE_PERIOD", "SUSPENDED", "CANCELLED"],
    PAST_DUE: ["ACTIVE", "GRACE_PERIOD", "SUSPENDED", "CANCELLED", "EXPIRED"],
    GRACE_PERIOD: ["ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED"],
    SUSPENDED: ["ACTIVE", "CANCELLED", "EXPIRED"],
    CANCELLED: ["ACTIVE", "TRIAL"],
    EXPIRED: ["ACTIVE", "TRIAL"],
  };

  public static canTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
    if (from === to) return true;
    const allowed = this.ALLOWED_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  public static validateTransition(
    from: SubscriptionStatus,
    to: SubscriptionStatus,
    reason?: string
  ): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidSubscriptionTransitionError(from, to, reason);
    }
  }

  public static isAccessAllowed(status: SubscriptionStatus): boolean {
    // Tenants can access active operational software during TRIAL, ACTIVE, RENEWAL_DUE, and GRACE_PERIOD (with banner)
    return status === "TRIAL" || status === "ACTIVE" || status === "RENEWAL_DUE" || status === "GRACE_PERIOD";
  }

  public static isSuspendedOrBlocked(status: SubscriptionStatus): boolean {
    return status === "SUSPENDED" || status === "CANCELLED" || status === "EXPIRED" || status === "PAST_DUE";
  }
}
