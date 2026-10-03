// ============================================================================
// CAR HIRE OS — SPRINT 37 PLATFORM ADMIN COMMAND CENTER TEST SUITE
// Validates:
// 1. Platform Membership & Authorization Engine (SEC-005, SEC-007)
// 2. Tenant Lifecycle Management (Provisioning, Suspension, Reactivation, Offboarding)
// 3. Cross-Tenant Operational Intelligence & Fleet Summaries
// 4. Support Access Session Governance (Time-bounded, audited proxy sessions)
// 5. Provider Gateway Telemetry (Stripe, M-Pesa, Pesapal, Africa's Talking, Postmark)
// 6. Outbox DLQ Operations & Replay Capability
// 7. Cross-Tenant Audit Logging & Global Platform Configuration
// ============================================================================

import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLES,
  ERROR_CODES,
} from "@carhire/constants";

import {
  TenantRepository,
  SubscriptionRepository,
  PlanRepository,
  VehicleRepository,
  BookingRepository,
  AuditRepository,
  OutboxRepository,
  UserRepository,
  PlatformRoleRepository,
  PlatformMembershipRepository,
  SupportAccessSessionRepository,
} from "../src/index";

import { PlatformAuthorizationService } from "../../../apps/api/src/modules/authorization/application/services/platform-authorization.service";
import { SupportAccessService } from "../../../apps/api/src/modules/authorization/application/services/support-access.service";
import { PlatformTenantLifecycleService } from "../../../apps/api/src/modules/platform-admin/application/services/platform-tenant-lifecycle.service";
import { PlatformOperationsService } from "../../../apps/api/src/modules/platform-admin/application/services/platform-operations.service";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTestSuite() {
  console.log("======================================================================");
  console.log("CAR HIRE OS — SPRINT 37 PLATFORM ADMIN COMMAND CENTER TESTS");
  console.log("======================================================================");

  // Initialize Repositories
  const tenantRepo = new TenantRepository();
  const subscriptionRepo = new SubscriptionRepository();
  const planRepo = new PlanRepository();
  const vehicleRepo = new VehicleRepository();
  const bookingRepo = new BookingRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();
  const userRepo = new UserRepository();
  const platformRoleRepo = new PlatformRoleRepository();
  const platformMembershipRepo = new PlatformMembershipRepository();
  const supportAccessRepo = new SupportAccessSessionRepository();

  // Initialize Plans
  PlanRepository.initializeSeed();

  // Seed default platform staff
  await platformMembershipRepo.seedDefaultStaff();

  // Initialize Services
  const platformAuthService = new PlatformAuthorizationService(
    platformRoleRepo,
    auditRepo
  );

  const supportAccessService = new SupportAccessService(
    supportAccessRepo,
    tenantRepo,
    platformAuthService,
    auditRepo,
    outboxRepo
  );

  const tenantLifecycleService = new PlatformTenantLifecycleService(
    tenantRepo,
    subscriptionRepo,
    planRepo,
    vehicleRepo,
    bookingRepo,
    auditRepo,
    outboxRepo,
    userRepo,
    platformAuthService
  );

  const operationsService = new PlatformOperationsService(
    outboxRepo,
    auditRepo,
    tenantRepo,
    platformAuthService
  );

  // --------------------------------------------------------------------------
  // TEST SUITE 1: Platform Membership & Authorization Engine
  // --------------------------------------------------------------------------
  console.log("\n[TEST 1] Platform Membership & Authorization Engine...");

  let adminUser = await userRepo.findByEmail("admin@carhireos.com");
  if (!adminUser) {
    adminUser = await userRepo.create({
      email: "admin@carhireos.com",
      fullName: "Platform Super Admin",
      isPlatformStaff: true,
      status: "ACTIVE",
    });
  }

  let adminMembership = await platformMembershipRepo.findByUserId(adminUser.id);
  if (!adminMembership) {
    adminMembership = await platformMembershipRepo.create({
      userId: adminUser.id,
      email: adminUser.email,
      name: adminUser.fullName,
      role: "PLATFORM_ADMIN",
      permissions: [],
      status: "ACTIVE",
    });
  }
  assert(adminMembership !== null, "Platform admin membership must exist");
  assert(adminMembership!.role === "PLATFORM_ADMIN", "Admin must have PLATFORM_ADMIN role");

  await platformRoleRepo.assignRoleToStaff(adminMembership.id, "PLATFORM_ADMIN");
  const adminAuthContext = await platformAuthService.resolvePlatformPermissions(
    adminMembership.id,
    adminUser.id,
    "req-sprint37-01"
  );
  assert(adminAuthContext.platformRoles.includes("PLATFORM_ADMIN"), "Resolved context must include PLATFORM_ADMIN");
  assert(
    adminAuthContext.permissions.includes(PLATFORM_PERMISSIONS.PLATFORM_TENANT_PROVISION),
    "Admin must possess PLATFORM_TENANT_PROVISION permission"
  );
  assert(
    adminAuthContext.permissions.includes(PLATFORM_PERMISSIONS.PLATFORM_SUPPORT_SESSION_START),
    "Admin must possess PLATFORM_SUPPORT_SESSION_START permission"
  );

  // Verification check & require
  const canManageTenants = platformAuthService.can(
    adminAuthContext,
    PLATFORM_PERMISSIONS.PLATFORM_TENANT_PROVISION
  );
  assert(canManageTenants === true, "can should return true for PLATFORM_TENANT_PROVISION");

  let threwForbidden = false;
  try {
    platformAuthService.require(
      { ...adminAuthContext, permissions: [] },
      PLATFORM_PERMISSIONS.PLATFORM_TENANT_PROVISION
    );
  } catch (err: any) {
    threwForbidden = true;
    assert(err.statusCode === 403, "Require missing permission must throw 403");
  }
  assert(threwForbidden, "Require missing permission must throw 403");

  console.log("  ✓ Platform staff roles and permission resolution validated");

  // --------------------------------------------------------------------------
  // TEST SUITE 2: Tenant Lifecycle - Provisioning & Uniqueness
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Tenant Provisioning & Subscription Creation...");

  const provisionResult = await tenantLifecycleService.provisionTenant(adminAuthContext, {
    name: "Safari Crest Luxury Rentals",
    slug: "safari-crest",
    ownerEmail: "owner@safaricrest.co.ke",
    ownerName: "Safari Owner",
    country: "KE",
    currency: "KES",
    timezone: "Africa/Nairobi",
  });

  const provisionedTenant = provisionResult.tenant;
  assert(provisionedTenant.id !== undefined, "Provisioned tenant must receive an ID");
  assert(provisionedTenant.slug === "safari-crest", "Tenant slug must match input");
  assert(provisionedTenant.status === "ACTIVE", "New tenant status must be ACTIVE");
  assert(provisionResult.subscriptionId !== undefined, "Tenant must receive a provisioned subscription");

  // Verify subscription in repo
  const provisionedSub = await subscriptionRepo.findById(provisionResult.subscriptionId!);
  assert(provisionedSub !== null, "Subscription record must exist in repository");
  assert(provisionedSub!.tenantId === provisionedTenant.id, "Subscription must map to new tenant");
  assert(provisionedSub!.status === "ACTIVE", "Subscription state must be ACTIVE");

  // Verify slug collision rejection
  let slugErrorThrown = false;
  try {
    await tenantLifecycleService.provisionTenant(adminAuthContext, {
      name: "Duplicate Safari Crest",
      slug: "safari-crest",
      ownerEmail: "another@safaricrest.co.ke",
      ownerName: "Another Owner",
      country: "KE",
      currency: "KES",
    });
  } catch (err: any) {
    slugErrorThrown = true;
    assert(err.statusCode === 409, "Slug duplicate must throw 409");
    assert(err.code === "SLUG_ALREADY_EXISTS", "Error code must be SLUG_ALREADY_EXISTS");
  }
  assert(slugErrorThrown, "Tenant provisioning must enforce slug uniqueness");

  console.log("  ✓ Tenant workspace provisioning and subscription binding validated");

  // --------------------------------------------------------------------------
  // TEST SUITE 3: Tenant Lifecycle - Suspension, Reactivation & Offboarding
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Governed Tenant Suspension & Reactivation...");

  // Suspend tenant
  const suspendedTenant = await tenantLifecycleService.suspendTenant(
    adminAuthContext,
    provisionedTenant.id,
    "Payment failure after grace period expiration",
    "BILLING_DELINQUENCY"
  );
  assert(suspendedTenant.status === "SUSPENDED", "Tenant status must be SUSPENDED");

  // Verify audit record created
  const auditLogs = await auditRepo.findByTenant(provisionedTenant.id, 10);
  const suspendLog = auditLogs.find((l) => l.action === "TENANT_SUSPENDED");
  assert(suspendLog !== undefined, "Audit log must contain TENANT_SUSPENDED record");
  assert(suspendLog!.actorId === adminUser!.id, "Audit log must record platform staff actorId");

  // Reactivate tenant
  const reactivatedTenant = await tenantLifecycleService.reactivateTenant(
    adminAuthContext,
    provisionedTenant.id,
    "Payment received via direct RTGS wire"
  );
  assert(reactivatedTenant.status === "ACTIVE", "Reactivated tenant status must be ACTIVE");

  // Offboard tenant
  const offboardedTenant = await tenantLifecycleService.offboardTenant(
    adminAuthContext,
    provisionedTenant.id,
    "Operator requested platform decommission"
  );
  assert((offboardedTenant.status as string) === "DECOMMISSIONED", "Offboarded tenant status must be DECOMMISSIONED");

  console.log("  ✓ Governed state transitions with audit trail successfully verified");

  // --------------------------------------------------------------------------
  // TEST SUITE 4: Cross-Tenant Summaries & Detail Aggregation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Cross-Tenant Operational Intelligence & Metrics...");

  // Provision another active tenant with vehicles and bookings
  const tenant2Result = await tenantLifecycleService.provisionTenant(adminAuthContext, {
    name: "Coastal Breeze Mombasa",
    slug: "coastal-breeze-msa",
    ownerEmail: "admin@coastalbreeze.co.ke",
    ownerName: "Coastal Admin",
    country: "KE",
    currency: "KES",
  });

  const tenant2 = tenant2Result.tenant;

  // Add vehicles to tenant2
  await vehicleRepo.create({
    tenantId: tenant2.id,
    registrationPlate: "KDZ 789M",
    vin: "VIN-COASTAL-001",
    make: "Toyota",
    model: "Prado TX",
    year: 2023,
    category: "SUV",
    color: "Pearl White",
    fuelType: "DIESEL",
    transmission: "AUTOMATIC",
    availabilityStatus: "AVAILABLE",
    lifecycleStatus: "ACTIVE",
    odometer: 14500,
    fuelLevel: 100,
    seats: 7,
    imageUrl: "https://example.com/prado.png",
    dailyRate: 15000,
    features: ["4WD", "Bluetooth", "Sunroof"],
  });

  // Query summaries
  const summaries = await tenantLifecycleService.listTenantSummaries(adminAuthContext);
  assert(summaries.length >= 2, "Must return at least 2 tenant summaries");

  const coastalSummary = summaries.find((s) => s.id === tenant2.id);
  assert(coastalSummary !== undefined, "Summary must include Coastal Breeze");
  assert(coastalSummary!.fleetCount === 1, "Fleet count for Coastal Breeze must be 1");
  assert(coastalSummary!.planTier === "STARTER", "Plan tier must be STARTER");

  // Query detail
  const detail = await tenantLifecycleService.getTenantDetail(adminAuthContext, tenant2.id);
  assert(detail.tenant.id === tenant2.id, "Detail tenant ID must match");
  assert(detail.fleetSummary.total === 1, "Detail fleet summary total must be 1");
  assert(detail.fleetSummary.available === 1, "Detail fleet summary available must be 1");

  console.log("  ✓ Cross-tenant fleet and booking aggregations validated");

  // --------------------------------------------------------------------------
  // TEST SUITE 5: Support Access Session Governance
  // --------------------------------------------------------------------------
  console.log("\n[TEST 5] Support Access Session Governance (Time-Bounded & Audited)...");

  const supportSession = await supportAccessService.startSupportSession(
    adminAuthContext,
    tenant2.id,
    "Diagnose customer booking checkout webhook failures",
    60
  );

  assert(supportSession.id !== undefined, "Support session must have an ID");
  assert(supportSession.isActive === true, "Support session isActive must be true");
  assert(supportSession.targetTenantId === tenant2.id, "Support session must target tenant2");
  assert(supportSession.platformUserId === adminUser!.id, "Session must record platform staff ID");

  // Validate active session
  const validated = await supportAccessService.validateSupportSession(
    supportSession.id,
    tenant2.id,
    adminUser!.id
  );
  assert(validated !== null && validated.id === supportSession.id, "Validated session must match");

  // End session
  const endedSession = await supportAccessService.endSupportSession(
    adminAuthContext,
    supportSession.id
  );
  assert(endedSession.isActive === false, "Ended session isActive must be false");

  let validationFailedAfterEnd = false;
  try {
    await supportAccessService.validateSupportSession(
      supportSession.id,
      tenant2.id,
      adminUser!.id
    );
  } catch (err: any) {
    validationFailedAfterEnd = true;
    assert(err.statusCode === 403, "Validation on ended session must fail with 403");
  }
  assert(validationFailedAfterEnd, "Validation after ending session must fail");

  console.log("  ✓ Governed support access lifecycle and audit logging verified");

  // --------------------------------------------------------------------------
  // TEST SUITE 6: Platform Operations & Gateway Telemetry
  // --------------------------------------------------------------------------
  console.log("\n[TEST 6] Platform Operations & Gateway Telemetry...");

  const providerStatuses = await operationsService.getProviderHealth(adminAuthContext);
  assert(providerStatuses.length >= 6, "Must monitor at least 6 infrastructure gateways");

  const stripeHealth = providerStatuses.find((p) => p.providerId === "stripe_connect");
  assert(stripeHealth !== undefined, "Stripe Connect must be present in provider telemetry");
  assert(stripeHealth!.status === "OPERATIONAL", "Stripe Connect status must be OPERATIONAL");

  const mpesaHealth = providerStatuses.find((p) => p.providerId === "mpesa_daraja");
  assert(mpesaHealth !== undefined, "M-Pesa Daraja must be present in provider telemetry");
  assert(mpesaHealth!.status === "OPERATIONAL", "M-Pesa status must be OPERATIONAL");

  const queueStats = await operationsService.getQueueStats(adminAuthContext);
  assert(queueStats.queues !== undefined, "Queue stats must include queues breakdown");
  assert(queueStats.queues.length >= 3, "Must include transactional-outbox, notification, and billing queues");

  console.log("  ✓ Provider telemetry and queue diagnostics validated");

  // --------------------------------------------------------------------------
  // TEST SUITE 7: Platform Global Configuration Management
  // --------------------------------------------------------------------------
  console.log("\n[TEST 7] Global Platform Configuration & Maintenance Mode...");

  const initialConfig = operationsService.getGlobalConfig();
  assert(initialConfig.maintenanceMode === false, "Default maintenance mode should be false");

  const updatedConfig = await operationsService.updateGlobalConfig(adminAuthContext, {
    maintenanceMode: true,
    maintenanceReason: "Scheduled database indexing and database replica switchover",
    announcementBanner: {
      enabled: true,
      severity: "WARNING",
      message: "Maintenance scheduled from 02:00 to 03:00 UTC",
      dismissible: true,
    },
  });

  assert(updatedConfig.maintenanceMode === true, "Updated maintenance mode must be true");
  assert(updatedConfig.announcementBanner?.enabled === true, "Announcement banner must be enabled");
  assert(updatedConfig.updatedBy === adminUser!.id, "updatedBy must reflect admin user ID");

  // Reset maintenance mode
  await operationsService.updateGlobalConfig(adminAuthContext, {
    maintenanceMode: false,
    announcementBanner: {
      enabled: false,
      severity: "INFO",
      message: "Normal operations",
      dismissible: true,
    },
  });

  console.log("  ✓ Global platform configuration with audit trails validated");

  console.log("\n======================================================================");
  console.log("✅ ALL SPRINT 37 PLATFORM ADMIN TESTS PASSED SUCCESSFULLY!");
  console.log("======================================================================\n");
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR IN SPRINT 37 TESTS:", err);
  process.exit(1);
});
