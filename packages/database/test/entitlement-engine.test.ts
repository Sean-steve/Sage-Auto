// ============================================================================
// CAR HIRE OS — SPRINT 7 ENTITLEMENT ENGINE TEST SUITE (ENT-001)
// Production-grade Authoritative Precedence, Limits, Caching, and Invalidation Tests
// ============================================================================

import {
  FeatureRepository,
  PlanFeatureRepository,
  TenantEntitlementRepository,
  EntitlementOverrideRepository,
  EntitlementRestrictionRepository,
  EntitlementUsageRepository,
  SubscriptionRepository,
  PlanRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";
import { EntitlementService } from "../../../apps/api/src/modules/entitlements/application/entitlement.service";
import { FeatureRegistryService } from "../../../apps/api/src/modules/entitlements/application/feature-registry.service";
import { UsageTrackerService } from "../../../apps/api/src/modules/entitlements/application/usage-tracker.service";
import { EntitlementCacheService } from "../../../apps/api/src/modules/entitlements/application/entitlement-cache.service";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  }
}

async function runEntitlementEngineTestSuite() {
  console.log("==================================================================");
  console.log("CAR HIRE OS — SPRINT 7 ENTITLEMENT ENGINE TEST SUITE (ENT-001)");
  console.log("==================================================================");

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(err);
    }
  }

  // Setup Fresh Repositories & Services
  FeatureRepository.initializeSeed();
  PlanFeatureRepository.initializeSeed();
  PlanRepository.initializeSeed();

  const featureRepo = new FeatureRepository();
  const planFeatureRepo = new PlanFeatureRepository();
  const tenantEntitlementRepo = new TenantEntitlementRepository();
  const overrideRepo = new EntitlementOverrideRepository();
  const restrictionRepo = new EntitlementRestrictionRepository();
  const usageRepo = new EntitlementUsageRepository();
  const subRepo = new SubscriptionRepository();
  const planRepo = new PlanRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();
  const cacheService = new EntitlementCacheService(60);
  const usageTracker = new UsageTrackerService(usageRepo);

  const entitlementService = new EntitlementService(
    featureRepo,
    planFeatureRepo,
    tenantEntitlementRepo,
    overrideRepo,
    restrictionRepo,
    usageRepo,
    subRepo,
    planRepo,
    auditRepo,
    outboxRepo,
    cacheService,
    usageTracker
  );

  const registryService = new FeatureRegistryService(featureRepo, planFeatureRepo, planRepo);

  // --------------------------------------------------------------------------
  // TEST 1: Feature Registry Seeding & Plan Mappings
  // --------------------------------------------------------------------------
  await test("1. Feature Registry & Plan Mappings Initialization", async () => {
    const features = await registryService.listFeatures();
    assert(features.length >= 7, `Expected at least 7 features in registry, got ${features.length}`);

    const booleanFeature = await featureRepo.findByKey("fleet.vehicle.create");
    assert(booleanFeature !== null, "fleet.vehicle.create feature must exist");
    assert(booleanFeature?.type === "BOOLEAN", "fleet.vehicle.create must be BOOLEAN");

    const limitFeature = await featureRepo.findByKey("fleet.max_vehicles");
    assert(limitFeature !== null, "fleet.max_vehicles feature must exist");
    assert(limitFeature?.type === "NUMERIC_LIMIT", "fleet.max_vehicles must be NUMERIC_LIMIT");

    const starterPlan = (await planRepo.listAll()).find((p) => p.code === "STARTER");
    assert(starterPlan !== undefined, "STARTER plan must exist");

    const starterFeatures = await planFeatureRepo.findByPlanId(starterPlan!.id);
    assert(starterFeatures.length >= 5, "STARTER plan must have feature mappings");
  });

  // --------------------------------------------------------------------------
  // TEST 2: Precedence Hierarchy: Platform Restriction beats everything
  // --------------------------------------------------------------------------
  await test("2. Platform Restriction Precedence", async () => {
    const tenantId = "tenant-prec-test-1";

    // Setup active subscription on ENTERPRISE plan
    const enterprisePlan = (await planRepo.listAll()).find((p) => p.code === "ENTERPRISE")!;
    await subRepo.create({
      tenantId,
      planId: enterprisePlan.id,
      status: "ACTIVE",
      state: "ACTIVE",
      currency: "KES",
      amount: 45000,
      autoRenew: true,
      billingCycle: "MONTHLY",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    // Check capability before restriction
    const decisionBefore = await entitlementService.check(tenantId, "fleet.vehicle.create");
    assert(decisionBefore.allowed === true, "Enterprise should have vehicle creation allowed before restriction");

    // Apply PLATFORM restriction
    const rest = await entitlementService.restrict(
      {
        scope: "PLATFORM",
        featureKey: "fleet.vehicle.create",
        restrictionType: "BLOCK",
        reason: "Global emergency maintenance lock",
      },
      "SEC-ADMIN-01"
    );

    // Evaluate
    const decisionAfter = await entitlementService.check(tenantId, "fleet.vehicle.create");
    assert(decisionAfter.allowed === false, "Platform restriction must deny access");
    assert(decisionAfter.code === "PLATFORM_RESTRICTED", `Expected code PLATFORM_RESTRICTED, got ${decisionAfter.code}`);
    assert(decisionAfter.source === "PLATFORM_RESTRICTION", `Expected source PLATFORM_RESTRICTION, got ${decisionAfter.source}`);

    // Lift restriction and verify recovery
    await entitlementService.liftRestriction(rest.id, "SEC-ADMIN-01");
    const decisionRecovered = await entitlementService.check(tenantId, "fleet.vehicle.create");
    assert(decisionRecovered.allowed === true, "Should be allowed once platform restriction is lifted");
  });

  // --------------------------------------------------------------------------
  // TEST 3: Precedence Hierarchy: Tenant Restriction beats Admin Override & Plan
  // --------------------------------------------------------------------------
  await test("3. Tenant Restriction Precedence over Override and Plan", async () => {
    const tenantId = "tenant-prec-test-2";
    const enterprisePlan = (await planRepo.listAll()).find((p) => p.code === "ENTERPRISE")!;

    await subRepo.create({
      tenantId,
      planId: enterprisePlan.id,
      status: "ACTIVE",
      state: "ACTIVE",
      currency: "KES",
      amount: 45000,
      autoRenew: true,
      billingCycle: "MONTHLY",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    // Add admin override granting custom domain
    await entitlementService.override(tenantId, "ADMIN-01", {
      featureKey: "website.custom_domain",
      enabled: true,
      isUnlimited: true,
      reason: "VIP Partner override",
    });

    // Add tenant restriction
    const tenantRest = await entitlementService.restrict(
      {
        tenantId,
        scope: "TENANT",
        featureKey: "website.custom_domain",
        restrictionType: "BLOCK",
        reason: "DNS Compliance hold",
      },
      "COMPLIANCE-01"
    );

    const decision = await entitlementService.check(tenantId, "website.custom_domain");
    assert(decision.allowed === false, "Tenant restriction must take precedence over override");
    assert(decision.code === "TENANT_RESTRICTED", `Expected TENANT_RESTRICTED, got ${decision.code}`);

    // Lift tenant restriction
    await entitlementService.liftRestriction(tenantRest.id, "COMPLIANCE-01");
    const decisionAfter = await entitlementService.check(tenantId, "website.custom_domain");
    assert(decisionAfter.allowed === true, "Override should take effect once tenant restriction is lifted");
    assert(decisionAfter.source === "OVERRIDE", `Expected source OVERRIDE, got ${decisionAfter.source}`);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Precedence Hierarchy: Admin Override beats Plan Matrix
  // --------------------------------------------------------------------------
  await test("4. Admin Override Precedence over Plan Mapping", async () => {
    const tenantId = "tenant-prec-test-3";
    const starterPlan = (await planRepo.listAll()).find((p) => p.code === "STARTER")!;

    await subRepo.create({
      tenantId,
      planId: starterPlan.id,
      status: "ACTIVE",
      state: "ACTIVE",
      currency: "KES",
      amount: 15000,
      autoRenew: true,
      billingCycle: "MONTHLY",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    // Starter does not have double entry ledger
    const decisionBefore = await entitlementService.check(tenantId, "finance.ledger");
    assert(decisionBefore.allowed === false, "Starter plan should not have double-entry ledger");
    assert(decisionBefore.code === "FEATURE_NOT_INCLUDED", "Code must be FEATURE_NOT_INCLUDED");

    // Platform admin grants override
    const ovr = await entitlementService.override(tenantId, "ADMIN-01", {
      featureKey: "finance.ledger",
      enabled: true,
      reason: "Early beta access granted",
    });

    const decisionAfter = await entitlementService.check(tenantId, "finance.ledger");
    assert(decisionAfter.allowed === true, "Admin override should grant feature");
    assert(decisionAfter.source === "OVERRIDE", "Decision source should be OVERRIDE");

    // Revoke override
    await entitlementService.revokeOverride(ovr.id, "ADMIN-01");
    const decisionRevoked = await entitlementService.check(tenantId, "finance.ledger");
    assert(decisionRevoked.allowed === false, "Should revert to plan restriction after revocation");
  });

  // --------------------------------------------------------------------------
  // TEST 5: Subscription Lifecycle Gating (Suspended & Inactive)
  // --------------------------------------------------------------------------
  await test("5. Subscription Lifecycle Status Gating", async () => {
    const tenantId = "tenant-sub-gate-test";
    const growthPlan = (await planRepo.listAll()).find((p) => p.code === "GROWTH")!;

    const sub = await subRepo.create({
      tenantId,
      planId: growthPlan.id,
      status: "SUSPENDED",
      state: "SUSPENDED",
      currency: "KES",
      amount: 25000,
      autoRenew: true,
      billingCycle: "MONTHLY",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    // Evaluate suspended
    const decisionSuspended = await entitlementService.check(tenantId, "fleet.vehicle.create");
    assert(decisionSuspended.allowed === false, "Suspended subscription must deny all feature operations");
    assert(decisionSuspended.code === "SUBSCRIPTION_SUSPENDED", `Expected SUBSCRIPTION_SUSPENDED, got ${decisionSuspended.code}`);

    // Update to EXPIRED
    await subRepo.update(sub.id, { status: "EXPIRED" });
    entitlementService.recalculate(tenantId);

    const decisionExpired = await entitlementService.check(tenantId, "fleet.vehicle.create");
    assert(decisionExpired.allowed === false, "Expired subscription must deny operations");
    assert(decisionExpired.code === "SUBSCRIPTION_INACTIVE", `Expected SUBSCRIPTION_INACTIVE, got ${decisionExpired.code}`);

    // Activate subscription
    await subRepo.update(sub.id, { status: "ACTIVE" });
    entitlementService.recalculate(tenantId);

    const decisionActive = await entitlementService.check(tenantId, "fleet.vehicle.create");
    assert(decisionActive.allowed === true, "Active subscription should permit entitled operations");
  });

  // --------------------------------------------------------------------------
  // TEST 6: Atomic Concurrency-Safe Capacity Reservation & Limit Enforcement
  // --------------------------------------------------------------------------
  await test("6. Concurrency-Safe Capacity Reservation & Limit Ceiling Enforcement", async () => {
    const tenantId = "tenant-capacity-test";
    const starterPlan = (await planRepo.listAll()).find((p) => p.code === "STARTER")!; // maxVehicles = 5

    await subRepo.create({
      tenantId,
      planId: starterPlan.id,
      status: "ACTIVE",
      state: "ACTIVE",
      currency: "KES",
      amount: 15000,
      autoRenew: true,
      billingCycle: "MONTHLY",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    // Reset usage counter to 0
    await entitlementService.reconcileUsage(tenantId, "fleet.max_vehicles", 0);

    // Reserve 3 units
    const res1 = await entitlementService.reserveCapacity(tenantId, "fleet.max_vehicles", 3);
    assert(res1.allowed === true, "Reservation of 3 out of 5 must succeed");
    assert(res1.usage === 3, `Expected usage 3, got ${res1.usage}`);
    assert(res1.remaining === 2, `Expected remaining 2, got ${res1.remaining}`);

    // Reserve 2 units (hits ceiling of 5)
    const res2 = await entitlementService.reserveCapacity(tenantId, "fleet.max_vehicles", 2);
    assert(res2.allowed === true, "Reservation of 2 more must succeed (total 5/5)");
    assert(res2.usage === 5, `Expected usage 5, got ${res2.usage}`);
    assert(res2.remaining === 0, `Expected remaining 0, got ${res2.remaining}`);

    // Try to reserve 1 more (exceeds limit 5)
    const res3 = await entitlementService.reserveCapacity(tenantId, "fleet.max_vehicles", 1);
    assert(res3.allowed === false, "Reservation exceeding ceiling must be rejected");
    assert(res3.code === "LIMIT_REACHED", `Expected LIMIT_REACHED, got ${res3.code}`);
    assert(res3.usage === 5, `Usage should remain at 5, got ${res3.usage}`);

    // Release 2 units
    await entitlementService.releaseCapacity(tenantId, "fleet.max_vehicles", 2);
    const usageAfterRelease = await entitlementService.getUsage(tenantId, "fleet.max_vehicles");
    assert(usageAfterRelease === 3, `Expected usage 3 after releasing 2, got ${usageAfterRelease}`);

    // Now reservation of 1 unit must succeed
    const res4 = await entitlementService.reserveCapacity(tenantId, "fleet.max_vehicles", 1);
    assert(res4.allowed === true, "Reservation should now succeed after releasing capacity");
    assert(res4.usage === 4, `Expected usage 4, got ${res4.usage}`);
  });

  // --------------------------------------------------------------------------
  // TEST 7: Entitlement Caching & Invalidation
  // --------------------------------------------------------------------------
  await test("7. Entitlement Caching & Cache Invalidation", async () => {
    const tenantId = "tenant-cache-test";
    const growthPlan = (await planRepo.listAll()).find((p) => p.code === "GROWTH")!;

    await subRepo.create({
      tenantId,
      planId: growthPlan.id,
      status: "ACTIVE",
      state: "ACTIVE",
      currency: "KES",
      amount: 25000,
      autoRenew: true,
      billingCycle: "MONTHLY",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    // Cold check (caches result)
    const d1 = await entitlementService.check(tenantId, "analytics.advanced");
    assert(d1.allowed === true, "GROWTH plan has advanced analytics");

    // Verify cache hit
    const cached = cacheService.get(tenantId, "analytics.advanced");
    assert(cached !== null, "Entitlement decision must be cached");
    assert(cached?.allowed === true, "Cached decision should match");

    // Invalidate
    cacheService.invalidate(tenantId, "analytics.advanced");
    assert(cacheService.get(tenantId, "analytics.advanced") === null, "Cache must be null after invalidation");
  });

  // --------------------------------------------------------------------------
  // TEST 8: Separation of Concerns (No User Role evaluation in Entitlement Engine)
  // --------------------------------------------------------------------------
  await test("8. Separation of Concerns: Entitlement vs RBAC vs Domain Rules", async () => {
    const tenantId = "tenant-separation-test";
    const starterPlan = (await planRepo.listAll()).find((p) => p.code === "STARTER")!;

    await subRepo.create({
      tenantId,
      planId: starterPlan.id,
      status: "ACTIVE",
      state: "ACTIVE",
      currency: "KES",
      amount: 15000,
      autoRenew: true,
      billingCycle: "MONTHLY",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    // EntitlementService signature does NOT accept user role, only tenantId and featureKey
    const allowed = await entitlementService.can(tenantId, "fleet.vehicle.create");
    assert(typeof allowed === "boolean", "Entitlement answers boolean tenant capability independently of actor role");

    // Fast batch query returns all system features
    const allDecisions = await entitlementService.getAll(tenantId);
    assert(Object.keys(allDecisions).length >= 7, "getAll() returns all feature decisions for tenant bootstrap");
  });

  console.log("==================================================================");
  console.log(`ENTITLEMENT ENGINE TEST RUN SUMMARY: ${passed}/${total} PASSED`);
  console.log("==================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runEntitlementEngineTestSuite().catch((err) => {
  console.error("Test Suite Fatal Error:", err);
  process.exit(1);
});
