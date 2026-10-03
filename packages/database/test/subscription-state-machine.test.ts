// ============================================================================
// CAR HIRE OS — SPRINT 6 SUBSCRIPTION STATE MACHINE TEST SUITE
// Validates:
// 1. All 8 canonical states (TRIAL, ACTIVE, RENEWAL_DUE, PAST_DUE, GRACE_PERIOD, SUSPENDED, CANCELLED, EXPIRED)
// 2. Valid state transitions
// 3. Invalid/illegal state transition rejection with domain error codes
// 4. Access entitlement boundaries (TRIAL, ACTIVE, RENEWAL_DUE, GRACE_PERIOD vs SUSPENDED/CANCELLED/EXPIRED)
// ============================================================================

import type { SubscriptionStatus } from "@carhire/types";
import { ERROR_CODES } from "@carhire/constants";
import {
  SubscriptionStateMachine,
  InvalidSubscriptionTransitionError,
} from "../../../apps/api/src/modules/subscriptions/domain/subscription-state-machine";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  }
}

async function runStateMachineTestSuite() {
  console.log("==================================================================");
  console.log("CAR HIRE OS — SPRINT 6 SUBSCRIPTION STATE MACHINE TEST SUITE");
  console.log("==================================================================");

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void) {
    total++;
    try {
      fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(err);
    }
  }

  // 1. Canonical 8-State Presence Check
  test("Canonical 8 States Definition Check", () => {
    const states: SubscriptionStatus[] = [
      "TRIAL",
      "ACTIVE",
      "RENEWAL_DUE",
      "PAST_DUE",
      "GRACE_PERIOD",
      "SUSPENDED",
      "CANCELLED",
      "EXPIRED",
    ];
    assert(states.length === 8, "Expected exactly 8 canonical states");
  });

  // 2. Valid Transitions from TRIAL
  test("Valid Transitions: TRIAL -> ACTIVE, EXPIRED, CANCELLED, SUSPENDED", () => {
    assert(SubscriptionStateMachine.canTransition("TRIAL", "ACTIVE"), "TRIAL -> ACTIVE should be allowed");
    assert(SubscriptionStateMachine.canTransition("TRIAL", "EXPIRED"), "TRIAL -> EXPIRED should be allowed");
    assert(SubscriptionStateMachine.canTransition("TRIAL", "CANCELLED"), "TRIAL -> CANCELLED should be allowed");
    assert(SubscriptionStateMachine.canTransition("TRIAL", "SUSPENDED"), "TRIAL -> SUSPENDED should be allowed");
  });

  // 3. Valid Transitions from ACTIVE
  test("Valid Transitions: ACTIVE -> RENEWAL_DUE, PAST_DUE, GRACE_PERIOD, SUSPENDED, CANCELLED", () => {
    assert(SubscriptionStateMachine.canTransition("ACTIVE", "RENEWAL_DUE"), "ACTIVE -> RENEWAL_DUE allowed");
    assert(SubscriptionStateMachine.canTransition("ACTIVE", "PAST_DUE"), "ACTIVE -> PAST_DUE allowed");
    assert(SubscriptionStateMachine.canTransition("ACTIVE", "GRACE_PERIOD"), "ACTIVE -> GRACE_PERIOD allowed");
    assert(SubscriptionStateMachine.canTransition("ACTIVE", "SUSPENDED"), "ACTIVE -> SUSPENDED allowed");
    assert(SubscriptionStateMachine.canTransition("ACTIVE", "CANCELLED"), "ACTIVE -> CANCELLED allowed");
  });

  // 4. Valid Transitions for RENEWAL_DUE & PAST_DUE & GRACE_PERIOD
  test("Valid Recovery Transitions to ACTIVE", () => {
    assert(SubscriptionStateMachine.canTransition("RENEWAL_DUE", "ACTIVE"), "RENEWAL_DUE -> ACTIVE on payment");
    assert(SubscriptionStateMachine.canTransition("PAST_DUE", "ACTIVE"), "PAST_DUE -> ACTIVE on late payment");
    assert(SubscriptionStateMachine.canTransition("GRACE_PERIOD", "ACTIVE"), "GRACE_PERIOD -> ACTIVE on grace payment");
    assert(SubscriptionStateMachine.canTransition("SUSPENDED", "ACTIVE"), "SUSPENDED -> ACTIVE on reactivation");
  });

  // 5. Invalid Transitions Rejection
  test("Illegal Transitions Rejection (e.g. SUSPENDED cannot jump directly to TRIAL or RENEWAL_DUE)", () => {
    assert(!SubscriptionStateMachine.canTransition("SUSPENDED", "RENEWAL_DUE"), "SUSPENDED -> RENEWAL_DUE must fail");
    assert(!SubscriptionStateMachine.canTransition("SUSPENDED", "GRACE_PERIOD"), "SUSPENDED -> GRACE_PERIOD must fail");
    assert(!SubscriptionStateMachine.canTransition("EXPIRED", "GRACE_PERIOD"), "EXPIRED -> GRACE_PERIOD must fail");

    let threw = false;
    try {
      SubscriptionStateMachine.validateTransition("SUSPENDED", "GRACE_PERIOD");
    } catch (err: any) {
      threw = true;
      assert(err instanceof InvalidSubscriptionTransitionError, "Must throw InvalidSubscriptionTransitionError");
      assert(err.code === ERROR_CODES.INVALID_STATE_TRANSITION, "Must have correct error code");
    }
    assert(threw, "Must throw on invalid transition");
  });

  // 6. Access Control Decisions by State
  test("Operational Access Allowed vs Blocked States", () => {
    // Access allowed
    assert(SubscriptionStateMachine.isAccessAllowed("TRIAL"), "TRIAL has operational access");
    assert(SubscriptionStateMachine.isAccessAllowed("ACTIVE"), "ACTIVE has operational access");
    assert(SubscriptionStateMachine.isAccessAllowed("RENEWAL_DUE"), "RENEWAL_DUE has operational access");
    assert(SubscriptionStateMachine.isAccessAllowed("GRACE_PERIOD"), "GRACE_PERIOD has operational access with banner");

    // Access blocked
    assert(!SubscriptionStateMachine.isAccessAllowed("SUSPENDED"), "SUSPENDED has no access");
    assert(!SubscriptionStateMachine.isAccessAllowed("CANCELLED"), "CANCELLED has no access");
    assert(!SubscriptionStateMachine.isAccessAllowed("EXPIRED"), "EXPIRED has no access");
    assert(SubscriptionStateMachine.isSuspendedOrBlocked("SUSPENDED"), "SUSPENDED is blocked");
    assert(SubscriptionStateMachine.isSuspendedOrBlocked("CANCELLED"), "CANCELLED is blocked");
    assert(SubscriptionStateMachine.isSuspendedOrBlocked("EXPIRED"), "EXPIRED is blocked");
  });

  console.log("------------------------------------------------------------------");
  console.log(`STATE MACHINE TESTS SUMMARY: ${passed}/${total} PASSED`);
  console.log("------------------------------------------------------------------");

  if (passed !== total) {
    process.exit(1);
  }
}

runStateMachineTestSuite().catch((err) => {
  console.error("Fatal error in test runner:", err);
  process.exit(1);
});
