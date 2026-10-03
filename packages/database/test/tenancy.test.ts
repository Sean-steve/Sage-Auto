// ============================================================================
// CAR HIRE OS — SPRINT 4 TENANCY, MEMBERSHIP & RLS AUTOMATED TEST SUITE
// Validates:
// 1. Transactional tenant provisioning with settings, owner membership, outbox & audit
// 2. Slug validation, normalization, and uniqueness enforcement
// 3. Untrusted X-Tenant-ID validation, fail-closed isolation, and TrustedTenantContext
// 4. PostgreSQL transaction-scoped RLS enforcement (SET LOCAL app.current_tenant_id)
// 5. Connection pool leakage prevention
// 6. Multi-tenant user switching and cross-tenant access denial
// 7. Suspended tenant & inactive membership enforcement
// ============================================================================

import { ERROR_CODES } from "@carhire/constants";
import {
  TenantRepository,
  TenantSettingsRepository,
  TenantMembershipRepository,
  UserRepository,
  AuditRepository,
  OutboxRepository,
  TransactionManager,
  TenantContextMissingError,
} from "../src/index";
import { TenantSlug } from "../../../apps/api/src/modules/tenancy/domain/tenant-slug.vo";
import { TenantProvisioningService } from "../../../apps/api/src/modules/tenancy/application/services/tenant-provisioning.service";
import { TenancyService } from "../../../apps/api/src/modules/tenancy/application/services/tenancy.service";
import { TenantContextResolverService } from "../../../apps/api/src/modules/tenancy/application/context/tenant-context-resolver.service";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  }
}

async function runTestSuite() {
  console.log("==================================================================");
  console.log("CAR HIRE OS — SPRINT 4 TENANCY & RLS TEST SUITE");
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

  const tenantRepo = new TenantRepository();
  const settingsRepo = new TenantSettingsRepository();
  const membershipRepo = new TenantMembershipRepository();
  const userRepo = new UserRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();

  const provisioningService = new TenantProvisioningService(
    tenantRepo,
    settingsRepo,
    membershipRepo,
    auditRepo,
    outboxRepo
  );

  const tenancyService = new TenancyService(
    tenantRepo,
    settingsRepo,
    membershipRepo,
    auditRepo,
    outboxRepo
  );

  const resolverService = new TenantContextResolverService(
    tenantRepo,
    membershipRepo
  );

  // Setup test user identities
  const userA = await userRepo.create({
    email: "alice@automeru.co.ke",
    normalizedEmail: "alice@automeru.co.ke",
    fullName: "Alice Meru",
    status: "ACTIVE",
    isPlatformStaff: false,
  });

  const userB = await userRepo.create({
    email: "brian@savannahdrive.co.ke",
    normalizedEmail: "brian@savannahdrive.co.ke",
    fullName: "Brian Savannah",
    status: "ACTIVE",
    isPlatformStaff: false,
  });

  const platformAdmin = await userRepo.create({
    email: "admin@carhireos.internal",
    normalizedEmail: "admin@carhireos.internal",
    fullName: "Staff Ops",
    status: "ACTIVE",
    isPlatformStaff: true,
  });

  // --------------------------------------------------------------------------
  // TEST 1: TENANT SLUG VALUE OBJECT VALIDATION
  // --------------------------------------------------------------------------
  await test("1. TenantSlug VO: Validates alphanumeric hyphenated slugs and normalization", () => {
    const validSlug = new TenantSlug("nairobi-premium-fleet");
    assert(validSlug.getValue() === "nairobi-premium-fleet", "Slug value must match input");

    const normalized = new TenantSlug("  MOMBASA-COASTAL-CARS  ");
    assert(normalized.getValue() === "mombasa-coastal-cars", "Slug must be trimmed and lowercased");

    const generated = TenantSlug.fromName("Safari & Safari 4x4 Ltd!");
    assert(generated.getValue() === "safari-safari-4x4-ltd", "Slug generation from name must strip invalid characters");

    // Invalid slug assertions
    let caughtTooShort = false;
    try {
      new TenantSlug("ab");
    } catch {
      caughtTooShort = true;
    }
    assert(caughtTooShort, "Slugs shorter than 3 characters must be rejected");

    let caughtConsecutiveDashes = false;
    try {
      new TenantSlug("invalid--double-dash");
    } catch {
      caughtConsecutiveDashes = true;
    }
    assert(caughtConsecutiveDashes, "Slugs with consecutive dashes must be rejected");
  });

  // --------------------------------------------------------------------------
  // TEST 2: TRANSACTIONAL TENANT PROVISIONING
  // --------------------------------------------------------------------------
  let tenant1Id = "";
  let tenant2Id = "";

  await test("2. Tenant Provisioning: Atomically provisions Tenant, Settings, Owner Membership, Outbox & Audit", async () => {
    const res = await provisioningService.provisionTenant(userA.id, {
      name: "Apex Luxury Rentals Nairobi",
      slug: "apex-luxury-nairobi",
      defaultCurrency: "KES",
      currencySymbol: "KSh",
      timezone: "Africa/Nairobi",
      countryCode: "KE",
      initialSettings: {
        vatRatePercent: 16,
        allowedDailyKm: 300,
        excessKmRate: 35,
        depositDefaultAmount: 50000,
      },
    });

    tenant1Id = res.tenant.id;
    assert(res.tenant.slug === "apex-luxury-nairobi", "Tenant must be persisted with normalized slug");
    assert(res.tenant.status === "ACTIVE", "New tenant status must default to ACTIVE");

    // Settings verification
    assert(res.settings.tenantId === res.tenant.id, "Settings must reference new tenant ID");
    assert(Number(res.settings.allowedDailyKm) === 300, "Settings allowedDailyKm must match DTO");
    assert(Number(res.settings.vatRatePercent) === 16, "Settings VAT rate must match statutory default");

    // Membership verification
    assert(res.membership.userId === userA.id, "Creator must be granted membership");
    assert(
      res.membership.role === "COMPANY_OWNER" || res.membership.role === "TENANT_OWNER",
      "Creator role must be COMPANY_OWNER / TENANT_OWNER"
    );
    assert(res.membership.status === "ACTIVE", "Membership status must be ACTIVE");

    // Outbox verification
    const pendingOutbox = await outboxRepo.findPending(10);
    const provisionEvent = pendingOutbox.find(
      (e) => e.eventType === "TenantProvisioned" && e.aggregateId === res.tenant.id
    );
    assert(!!provisionEvent, "Outbox event TenantProvisioned must be recorded");

    // Audit verification
    const auditLogs = await auditRepo.listByTenant(res.tenant.id);
    const auditRecord = auditLogs.find((a) => a.action === "tenant.provision");
    assert(!!auditRecord, "Audit log record for tenant.provision must be saved");
  });

  // --------------------------------------------------------------------------
  // TEST 3: PROVISION SECOND TENANT & SLUG CONFLICT REJECTION
  // --------------------------------------------------------------------------
  await test("3. Tenant Provisioning: Enforces unique slug constraint and rejects duplicates", async () => {
    // Provision second tenant for User B
    const res2 = await provisioningService.provisionTenant(userB.id, {
      name: "Savannah Offroad 4x4",
      slug: "savannah-offroad-4x4",
      defaultCurrency: "USD",
      currencySymbol: "$",
    });
    tenant2Id = res2.tenant.id;

    // Attempt to register duplicate slug
    let caughtConflict = false;
    try {
      await provisioningService.provisionTenant(userA.id, {
        name: "Apex Duplicate Branch",
        slug: "apex-luxury-nairobi", // already taken by tenant 1
      });
    } catch (err: any) {
      caughtConflict = err.code === ERROR_CODES.TENANT_SLUG_CONFLICT;
    }
    assert(caughtConflict, "Duplicate slug provisioning must be rejected with TENANT_SLUG_CONFLICT");
  });

  // --------------------------------------------------------------------------
  // TEST 4: UNTRUSTED X-TENANT-ID CONTEXT RESOLUTION & ACCESS VALIDATION
  // --------------------------------------------------------------------------
  await test("4. TenantContext Resolver: Strict authorization & validation of untrusted tenant header", async () => {
    // 4a. Valid access by authorized owner
    const contextA = await resolverService.resolveContext(userA.id, tenant1Id);
    assert(contextA.tenantId === tenant1Id, "Resolved context must match tenant ID");
    assert(contextA.userId === userA.id, "Resolved context must match user ID");
    assert(
      contextA.role === "COMPANY_OWNER" || contextA.role === "TENANT_OWNER",
      "Resolved context role must match active membership"
    );
    assert(contextA.isPlatformBypass === false, "Standard user context must not have platform bypass");

    // 4b. Cross-tenant unauthorized access attempt by User A into Tenant 2 (User B's tenant)
    let caughtCrossTenant = false;
    try {
      await resolverService.resolveContext(userA.id, tenant2Id);
    } catch (err: any) {
      caughtCrossTenant = err.code === ERROR_CODES.TENANT_ACCESS_DENIED;
    }
    assert(caughtCrossTenant, "Cross-tenant access without membership must be rejected with TENANT_ACCESS_DENIED");

    // 4c. Missing Tenant ID header
    let caughtMissing = false;
    try {
      await resolverService.resolveContext(userA.id, "");
    } catch (err: any) {
      caughtMissing = err.code === ERROR_CODES.TENANT_REQUIRED;
    }
    assert(caughtMissing, "Missing tenant ID must be rejected with TENANT_REQUIRED");

    // 4d. Non-existent Tenant ID
    let caughtNotFound = false;
    try {
      await resolverService.resolveContext(userA.id, crypto.randomUUID());
    } catch (err: any) {
      caughtNotFound = err.code === ERROR_CODES.TENANT_NOT_FOUND;
    }
    assert(caughtNotFound, "Non-existent tenant ID must be rejected with TENANT_NOT_FOUND");
  });

  // --------------------------------------------------------------------------
  // TEST 5: MULTI-TENANT MEMBERSHIP GRANT & CONTEXT SWITCHING
  // --------------------------------------------------------------------------
  await test("5. Multi-Tenant Memberships: Granting cross-membership and seamless tenant switching", async () => {
    // Grant User A membership to Tenant 2 as TENANT_DISPATCHER
    const granted = await tenancyService.grantMembership(
      tenant2Id,
      userA.id,
      "TENANT_DISPATCHER",
      userB.id
    );
    assert(granted.status === "ACTIVE", "Granted membership must be ACTIVE");

    // User A should now list both tenants
    const userATenants = await tenancyService.listUserTenants(userA.id);
    assert(userATenants.length === 2, "User A must have active memberships in 2 tenants");
    assert(userATenants.some((t) => t.tenantId === tenant1Id), "User A must list Tenant 1");
    assert(userATenants.some((t) => t.tenantId === tenant2Id), "User A must list Tenant 2");

    // User A can now resolve Tenant 2 context
    const contextAInTenant2 = await resolverService.resolveContext(userA.id, tenant2Id);
    assert(contextAInTenant2.tenantId === tenant2Id, "User A must resolve Tenant 2 context");
    assert(contextAInTenant2.role === "TENANT_DISPATCHER", "User A must have role TENANT_DISPATCHER in Tenant 2");
  });

  // --------------------------------------------------------------------------
  // TEST 6: MEMBERSHIP REVOCATION & INACTIVE STATUS ENFORCEMENT
  // --------------------------------------------------------------------------
  await test("6. Membership Inactivity: Revoked membership immediately blocks context resolution", async () => {
    const userAMembershipInTenant2 = (await membershipRepo.findByTenantAndUser(tenant2Id, userA.id))!;
    await tenancyService.revokeMembership(userAMembershipInTenant2.id, userB.id);

    let caughtRevoked = false;
    try {
      await resolverService.resolveContext(userA.id, tenant2Id);
    } catch (err: any) {
      caughtRevoked = err.code === ERROR_CODES.TENANT_MEMBERSHIP_INACTIVE;
    }
    assert(caughtRevoked, "Revoked membership must fail context resolution with TENANT_MEMBERSHIP_INACTIVE");
  });

  // --------------------------------------------------------------------------
  // TEST 7: TENANT SUSPENSION & FAIL-CLOSED EXECUTION
  // --------------------------------------------------------------------------
  await test("7. Tenant Suspension: Suspended tenant rejects standard access but allows platform admin bypass", async () => {
    // Suspend Tenant 1
    await tenancyService.updateTenantStatus(tenant1Id, "SUSPENDED", platformAdmin.id);

    // Standard user access must fail
    let caughtSuspended = false;
    try {
      await resolverService.resolveContext(userA.id, tenant1Id);
    } catch (err: any) {
      caughtSuspended = err.code === ERROR_CODES.TENANT_SUSPENDED;
    }
    assert(caughtSuspended, "Access to suspended tenant must be blocked with TENANT_SUSPENDED");

    // Platform admin bypass access
    const adminContext = await resolverService.resolveContext(platformAdmin.id, tenant1Id, {
      platformBypass: true,
    });
    assert(adminContext.isPlatformBypass === true, "Platform bypass context must be established for superadmin");

    // Reactivate Tenant 1
    await tenancyService.updateTenantStatus(tenant1Id, "ACTIVE", platformAdmin.id);
    const reactivatedContext = await resolverService.resolveContext(userA.id, tenant1Id);
    assert(reactivatedContext.tenantStatus === "ACTIVE", "Reactivated tenant must allow access again");
  });

  // --------------------------------------------------------------------------
  // TEST 8: RLS TRANSACTION-SCOPED ISOLATION & CONNECTION POOL LEAKAGE PREVENTION
  // --------------------------------------------------------------------------
  await test("8. TransactionManager RLS: SET LOCAL app.current_tenant_id ensures strict transaction scoping", async () => {
    // 8a. Valid tenant-scoped transaction
    let capturedTxTenantId = "";
    await TransactionManager.withTenantTransaction(tenant1Id, async (tx) => {
      capturedTxTenantId = tx.tenantId || "";
      assert(tx.isTransaction === true, "Must execute within an active transaction block");
      assert(tx.tenantId === tenant1Id, "Transaction context must reflect tenant1 ID");
    });
    assert(capturedTxTenantId === tenant1Id, "Tenant transaction execution must succeed");

    // 8b. Reject empty tenant ID
    let caughtEmptyTenant = false;
    try {
      await TransactionManager.withTenantTransaction("", async () => {});
    } catch (err) {
      caughtEmptyTenant = err instanceof TenantContextMissingError;
    }
    assert(caughtEmptyTenant, "withTenantTransaction must reject empty/missing tenant ID");

    // 8c. Connection pool reuse simulation: Sequential transactions with different tenants
    const executionOrder: string[] = [];
    await TransactionManager.withTenantTransaction(tenant1Id, async (tx) => {
      executionOrder.push(`start-${tx.tenantId}`);
    });
    await TransactionManager.withTenantTransaction(tenant2Id, async (tx) => {
      executionOrder.push(`start-${tx.tenantId}`);
    });
    assert(executionOrder[0] === `start-${tenant1Id}`, "First transaction must run in Tenant 1");
    assert(executionOrder[1] === `start-${tenant2Id}`, "Second transaction must run in Tenant 2 without leakage");
  });

  console.log("==================================================================");
  console.log(`SPRINT 4 TENANCY TEST RUN COMPLETE: ${passed}/${total} PASSED`);
  console.log("==================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR IN SPRINT 4 TEST SUITE:", err);
  process.exit(1);
});
