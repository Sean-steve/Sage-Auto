// ============================================================================
// CAR HIRE OS — SPRINT 8: SUBSCRIPTION ENFORCEMENT & RESTRICTED MODE TEST MATRIX
// Verifies: SubscriptionAccessPolicy, createTenantPipelineGuard, Access Modes,
// Operation Categories, Write-Path Protection, Recovery Routes, and Data Preservation
// ============================================================================

import {
  SubscriptionAccessPolicy,
} from "../../../apps/api/src/modules/subscriptions/domain/subscription-access-policy";
import {
  createTenantPipelineGuard,
} from "../../../apps/api/src/common/pipeline/tenant-request-pipeline";
import {
  TenantAccessMode,
  OperationCategory,
  SubscriptionState,
  Subscription,
  SubscriptionAccessDecision,
} from "@carhire/types";
import {
  OPERATION_CATEGORIES,
  TENANT_ACCESS_MODES,
} from "@carhire/constants";

let passed = 0;
let total = 0;

function assert(condition: boolean, message: string) {
  total++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(message);
  }
  passed++;
  console.log(`✅ PASS: ${message}`);
}

async function test(name: string, fn: () => Promise<void> | void) {
  console.log(`\n▶ TEST: ${name}`);
  try {
    await fn();
  } catch (err: any) {
    console.error(`💥 ERROR in ${name}:`, err.message);
    throw err;
  }
}

async function runEnforcementTestSuite() {
  console.log("==================================================================");
  console.log("CAR HIRE OS — SPRINT 8 ENFORCEMENT & RESTRICTED MODE TEST SUITE");
  console.log("==================================================================");

  // --------------------------------------------------------------------------
  // TEST 1: Access Mode Derivation from Subscription States
  // --------------------------------------------------------------------------
  await test("1. Canonical Access Mode Derivation", () => {
    // ACTIVE & TRIAL -> FULL
    assert(
      SubscriptionAccessPolicy.deriveAccessMode({ status: "ACTIVE" } as any) === "FULL",
      "ACTIVE subscription must yield FULL access mode"
    );
    assert(
      SubscriptionAccessPolicy.deriveAccessMode({ status: "TRIAL" } as any) === "FULL",
      "TRIAL subscription must yield FULL access mode"
    );

    // RENEWAL_DUE & PAST_DUE -> WARNING
    assert(
      SubscriptionAccessPolicy.deriveAccessMode({ status: "RENEWAL_DUE" } as any) === "WARNING",
      "RENEWAL_DUE subscription must yield WARNING access mode"
    );
    assert(
      SubscriptionAccessPolicy.deriveAccessMode({ status: "PAST_DUE" } as any) === "WARNING",
      "PAST_DUE subscription must yield WARNING access mode"
    );

    // GRACE_PERIOD -> RESTRICTED
    assert(
      SubscriptionAccessPolicy.deriveAccessMode({ status: "GRACE_PERIOD" } as any) === "RESTRICTED",
      "GRACE_PERIOD subscription must yield RESTRICTED access mode"
    );

    // SUSPENDED & EXPIRED -> SUSPENDED
    assert(
      SubscriptionAccessPolicy.deriveAccessMode({ status: "SUSPENDED" } as any) === "SUSPENDED",
      "SUSPENDED subscription must yield SUSPENDED access mode"
    );
    assert(
      SubscriptionAccessPolicy.deriveAccessMode({ status: "EXPIRED" } as any) === "SUSPENDED",
      "EXPIRED subscription must yield SUSPENDED access mode"
    );
    assert(
      SubscriptionAccessPolicy.deriveAccessMode(null) === "SUSPENDED",
      "Null subscription must yield SUSPENDED access mode (fail-closed)"
    );

    // CANCELLED before period end vs after period end
    const futureDate = new Date(Date.now() + 10 * 86400000).toISOString();
    const pastDate = new Date(Date.now() - 10 * 86400000).toISOString();

    assert(
      SubscriptionAccessPolicy.deriveAccessMode({
        status: "CANCELLED",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: futureDate,
      } as any) === "WARNING",
      "CANCELLED subscription before periodEnd must yield WARNING access mode"
    );

    assert(
      SubscriptionAccessPolicy.deriveAccessMode({
        status: "CANCELLED",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: pastDate,
      } as any) === "SUSPENDED",
      "CANCELLED subscription after periodEnd must yield SUSPENDED access mode"
    );
  });

  // --------------------------------------------------------------------------
  // TEST 2: Operation Category Matrix & Write-Path Protection
  // --------------------------------------------------------------------------
  await test("2. Operation Category Access Matrix across Access Modes", () => {
    const fullSub = { id: "sub-1", status: "ACTIVE" } as any;
    const warningSub = { id: "sub-2", status: "PAST_DUE" } as any;
    const restrictedSub = { id: "sub-3", status: "GRACE_PERIOD" } as any;
    const suspendedSub = { id: "sub-4", status: "SUSPENDED" } as any;

    // FULL Mode checks
    assert(SubscriptionAccessPolicy.evaluate(fullSub, "CREATE_NEW_RESOURCE").allowed === true, "FULL: CREATE_NEW_RESOURCE allowed");
    assert(SubscriptionAccessPolicy.evaluate(fullSub, "PUBLIC_BOOKING").allowed === true, "FULL: PUBLIC_BOOKING allowed");
    assert(SubscriptionAccessPolicy.evaluate(fullSub, "BILLING_ACCESS").allowed === true, "FULL: BILLING_ACCESS allowed");

    // WARNING Mode checks (non-blocking banner, write paths remain open)
    assert(SubscriptionAccessPolicy.evaluate(warningSub, "CREATE_NEW_RESOURCE").allowed === true, "WARNING: CREATE_NEW_RESOURCE allowed");
    assert(SubscriptionAccessPolicy.evaluate(warningSub, "PUBLIC_BOOKING").allowed === true, "WARNING: PUBLIC_BOOKING allowed");

    // RESTRICTED Mode (Grace Period) checks
    const restCreate = SubscriptionAccessPolicy.evaluate(restrictedSub, "CREATE_NEW_RESOURCE");
    assert(restCreate.allowed === false, "RESTRICTED: CREATE_NEW_RESOURCE must be blocked");
    assert(restCreate.code === "SUBSCRIPTION_GRACE_RESTRICTION", "RESTRICTED: code must be SUBSCRIPTION_GRACE_RESTRICTION");

    const restPublic = SubscriptionAccessPolicy.evaluate(restrictedSub, "PUBLIC_BOOKING");
    assert(restPublic.allowed === false, "RESTRICTED: PUBLIC_BOOKING must be blocked");

    assert(SubscriptionAccessPolicy.evaluate(restrictedSub, "UPDATE_EXISTING_RESOURCE").allowed === true, "RESTRICTED: UPDATE_EXISTING_RESOURCE allowed");
    assert(SubscriptionAccessPolicy.evaluate(restrictedSub, "COMPLETE_EXISTING_RENTAL").allowed === true, "RESTRICTED: COMPLETE_EXISTING_RENTAL allowed");
    assert(SubscriptionAccessPolicy.evaluate(restrictedSub, "MANAGE_EXISTING_BOOKING").allowed === true, "RESTRICTED: MANAGE_EXISTING_BOOKING allowed");
    assert(SubscriptionAccessPolicy.evaluate(restrictedSub, "BILLING_ACCESS").allowed === true, "RESTRICTED: BILLING_ACCESS allowed");

    // SUSPENDED Mode checks
    const suspCreate = SubscriptionAccessPolicy.evaluate(suspendedSub, "CREATE_NEW_RESOURCE");
    assert(suspCreate.allowed === false, "SUSPENDED: CREATE_NEW_RESOURCE blocked");
    assert(suspCreate.code === "SUBSCRIPTION_SUSPENDED", "SUSPENDED: code must be SUBSCRIPTION_SUSPENDED");

    const suspUpdate = SubscriptionAccessPolicy.evaluate(suspendedSub, "UPDATE_EXISTING_RESOURCE");
    assert(suspUpdate.allowed === false, "SUSPENDED: UPDATE_EXISTING_RESOURCE blocked");

    // Existing active rentals can still be safely returned/completed even during suspension
    assert(SubscriptionAccessPolicy.evaluate(suspendedSub, "COMPLETE_EXISTING_RENTAL").allowed === true, "SUSPENDED: COMPLETE_EXISTING_RENTAL allowed (operational safety)");
    assert(SubscriptionAccessPolicy.evaluate(suspendedSub, "READ_EXISTING_DATA").allowed === true, "SUSPENDED: READ_EXISTING_DATA allowed (data visibility)");
    assert(SubscriptionAccessPolicy.evaluate(suspendedSub, "DATA_EXPORT").allowed === true, "SUSPENDED: DATA_EXPORT allowed (no data hostage)");
    assert(SubscriptionAccessPolicy.evaluate(suspendedSub, "BILLING_ACCESS").allowed === true, "SUSPENDED: BILLING_ACCESS allowed (recovery route)");
    assert(SubscriptionAccessPolicy.evaluate(suspendedSub, "SUBSCRIPTION_MANAGEMENT").allowed === true, "SUSPENDED: SUBSCRIPTION_MANAGEMENT allowed (recovery route)");
  });

  // --------------------------------------------------------------------------
  // TEST 3: Always-Reachable Billing & Recovery Invariant
  // --------------------------------------------------------------------------
  await test("3. Self-Service Recovery Invariant (Billing is NEVER blocked)", () => {
    const allStates: SubscriptionState[] = [
      "TRIAL",
      "ACTIVE",
      "RENEWAL_DUE",
      "PAST_DUE",
      "GRACE_PERIOD",
      "SUSPENDED",
      "CANCELLED",
      "EXPIRED",
    ];

    for (const st of allStates) {
      const sub = { id: `sub-${st}`, status: st } as any;
      const billingDec = SubscriptionAccessPolicy.evaluate(sub, "BILLING_ACCESS");
      assert(
        billingDec.allowed === true,
        `BILLING_ACCESS must be unconditionally ALLOWED in state ${st}`
      );

      const subMgmtDec = SubscriptionAccessPolicy.evaluate(sub, "SUBSCRIPTION_MANAGEMENT");
      assert(
        subMgmtDec.allowed === true,
        `SUBSCRIPTION_MANAGEMENT must be unconditionally ALLOWED in state ${st}`
      );

      const exportDec = SubscriptionAccessPolicy.evaluate(sub, "DATA_EXPORT");
      assert(
        exportDec.allowed === true,
        `DATA_EXPORT must be unconditionally ALLOWED in state ${st}`
      );
    }
  });

  // --------------------------------------------------------------------------
  // TEST 4: Platform Support Impersonation Bypass Gating
  // --------------------------------------------------------------------------
  await test("4. Platform Support Impersonation Bypass", () => {
    const suspendedSub = { id: "sub-susp", status: "SUSPENDED" } as any;

    // Normal tenant execution of support action
    const normalDec = SubscriptionAccessPolicy.evaluate(suspendedSub, "PLATFORM_SUPPORT_ACTION", { isPlatformSupportActor: false });
    assert(normalDec.allowed === false, "Without support flag, PLATFORM_SUPPORT_ACTION should be blocked when suspended");

    // Support impersonation active
    const supportDec = SubscriptionAccessPolicy.evaluate(suspendedSub, "PLATFORM_SUPPORT_ACTION", { isPlatformSupportActor: true });
    assert(supportDec.allowed === true, "With support flag active, PLATFORM_SUPPORT_ACTION must be allowed for recovery");
  });

  // --------------------------------------------------------------------------
  // TEST 5: Pipeline Standardized JSON Error Envelope via Composite Guard
  // --------------------------------------------------------------------------
  await test("5. Composite Pipeline Guard Execution and Structured Error Delivery", async () => {
    let statusSet = 0;
    let jsonBody: any = null;
    let nextCalled = false;

    const mockRes: any = {
      status: (s: number) => {
        statusSet = s;
        return mockRes;
      },
      json: (j: any) => {
        jsonBody = j;
        return mockRes;
      },
    };

    const mockReq: any = {
      tenantContext: { tenantId: "tenant-susp-1" },
      currentUser: { id: "user-1", email: "user@test.com" },
      headers: { "x-request-id": "req-sprint8-test-999" },
    };

    const mockNext = () => {
      nextCalled = true;
    };

    const mockSubscriptionService: any = {
      getSubscriptionByTenantId: async () => ({
        id: "sub-1",
        status: "SUSPENDED",
      }),
    };

    // Instantiate pipeline guard for a write operation
    const guard = createTenantPipelineGuard(
      { subscriptionService: mockSubscriptionService },
      { operationCategory: "CREATE_NEW_RESOURCE" }
    );

    await guard(mockReq, mockRes, mockNext);

    assert(nextCalled === false, "Pipeline must stop and not call next() when subscription is suspended");
    assert(statusSet === 403, "Pipeline must return HTTP 403 Forbidden");
    assert(jsonBody !== null, "JSON error body must be returned");
    assert(jsonBody.error.code === "SUBSCRIPTION_SUSPENDED", "Error code must be SUBSCRIPTION_SUSPENDED");
    assert(jsonBody.error.requestId === "req-sprint8-test-999", "requestId must propagate in error envelope");
    assert(jsonBody.error.details.accessMode === "SUSPENDED", "details must contain accessMode");
  });

  // --------------------------------------------------------------------------
  // TEST 6: Status Banner Derivation
  // --------------------------------------------------------------------------
  await test("6. Status Banner Generation", () => {
    // ACTIVE -> banner is null
    const activeBanner = SubscriptionAccessPolicy.getStatusBanner({ status: "ACTIVE" } as any);
    assert(activeBanner === null, "ACTIVE subscription should not produce a warning banner");

    // PAST_DUE -> WARNING banner
    const pastDueBanner = SubscriptionAccessPolicy.getStatusBanner({ status: "PAST_DUE" } as any);
    assert(pastDueBanner !== null, "PAST_DUE subscription must produce a banner");
    assert(pastDueBanner?.type === "WARNING", "PAST_DUE banner type must be WARNING");

    // GRACE_PERIOD -> RESTRICTED banner
    const graceBanner = SubscriptionAccessPolicy.getStatusBanner({
      status: "GRACE_PERIOD",
      gracePeriodEndsAt: new Date(Date.now() + 3 * 86400000).toISOString(),
    } as any);
    assert(graceBanner !== null, "GRACE_PERIOD subscription must produce a banner");
    assert(graceBanner?.type === "RESTRICTED", "GRACE_PERIOD banner type must be RESTRICTED");

    // SUSPENDED -> SUSPENDED banner
    const suspBanner = SubscriptionAccessPolicy.getStatusBanner({ status: "SUSPENDED" } as any);
    assert(suspBanner !== null, "SUSPENDED subscription must produce a banner");
    assert(suspBanner?.type === "SUSPENDED", "SUSPENDED banner type must be SUSPENDED");
  });

  console.log("\n==================================================================");
  console.log(`ENFORCEMENT TEST RUN SUMMARY: ${passed}/${total} PASSED`);
  console.log("==================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runEnforcementTestSuite();
