// ============================================================================
// CAR HIRE OS — SPRINT 5 AUTHORIZATION & RBAC AUTOMATED TEST SUITE
// Validates:
// 1. Canonical Permission Registry & Metadata Invariants
// 2. System Roles & Seed Permissions
// 3. Custom Tenant Roles CRUD & Privilege Escalation Prevention
// 4. Multi-Role Union & Effective Permission Calculation
// 5. High-Performance Caching, Invalidation & Fail-Safe Fallback
// 6. P0 Security Invariant: Last-Owner Protection
// 7. P0 Security Invariant: Platform & Tenant Authorization Decoupling
// 8. Audited Support-Access Session Lifecycle
// 9. Contextual Resource Policies (ABAC) for Fleet, Bookings & Settlements
// 10. Audit Logging & Outbox Transactional Integrity
// ============================================================================

import {
  TENANT_PERMISSIONS,
  PLATFORM_PERMISSIONS,
  ALL_PERMISSION_DEFINITIONS,
  TENANT_SYSTEM_ROLES,
  PLATFORM_ROLES,
  ERROR_CODES,
} from "@carhire/constants";

import {
  TenantRepository,
  TenantMembershipRepository,
  AuditRepository,
  OutboxRepository,
  RoleRepository,
  TenantMembershipRoleRepository,
  PlatformRoleRepository,
  SupportAccessSessionRepository,
} from "../src/index";

import { AuthorizationService } from "../../../apps/api/src/modules/authorization/application/services/authorization.service";
import { RoleManagementService } from "../../../apps/api/src/modules/authorization/application/services/role-management.service";
import { PlatformAuthorizationService } from "../../../apps/api/src/modules/authorization/application/services/platform-authorization.service";
import { SupportAccessService } from "../../../apps/api/src/modules/authorization/application/services/support-access.service";
import { InMemoryAuthorizationCacheService } from "../../../apps/api/src/modules/authorization/application/cache/authorization-cache.service";
import { TenantContextResolverService } from "../../../apps/api/src/modules/tenancy/application/context/tenant-context-resolver.service";
import {
  VehicleResourcePolicy,
  BookingResourcePolicy,
  SettlementResourcePolicy,
  UserProfileResourcePolicy,
} from "../../../apps/api/src/modules/authorization/domain/policies/domain-policies";
import type { TrustedTenantContext } from "../../../apps/api/src/modules/tenancy/application/context/tenant-context.interface";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  }
}

async function runTestSuite() {
  console.log("==================================================================");
  console.log("CAR HIRE OS — SPRINT 5 AUTHORIZATION & RBAC TEST SUITE");
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

  // Instantiate Repositories
  const tenantRepo = new TenantRepository();
  const membershipRepo = new TenantMembershipRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();
  const roleRepo = new RoleRepository();
  const membershipRoleRepo = new TenantMembershipRoleRepository(roleRepo);
  const platformRoleRepo = new PlatformRoleRepository();
  const supportSessionRepo = new SupportAccessSessionRepository();
  const cacheService = new InMemoryAuthorizationCacheService();

  // Instantiate Services
  const authzService = new AuthorizationService(roleRepo, membershipRoleRepo, cacheService);
  const roleMgmtService = new RoleManagementService(
    roleRepo,
    membershipRoleRepo,
    membershipRepo,
    auditRepo,
    outboxRepo,
    cacheService
  );
  const platformAuthService = new PlatformAuthorizationService(platformRoleRepo, auditRepo);
  const supportAccessService = new SupportAccessService(
    supportSessionRepo,
    tenantRepo,
    platformAuthService,
    auditRepo,
    outboxRepo
  );
  const tenantResolverService = new TenantContextResolverService(
    tenantRepo,
    membershipRepo,
    authzService
  );

  // Setup Test Fixtures
  const tenantA = await tenantRepo.create({
    name: "Great Rift Car Hire",
    slug: "great-rift",
    status: "ACTIVE",
    planId: "plan-growth",
    currency: "KES",
  });

  const tenantB = await tenantRepo.create({
    name: "Kilimanjaro Motors",
    slug: "kilimanjaro",
    status: "ACTIVE",
    planId: "plan-starter",
    currency: "USD",
  });

  const ownerMembership = await membershipRepo.create({
    tenantId: tenantA.id,
    userId: "usr-owner-rift",
    role: "COMPANY_OWNER",
    status: "ACTIVE",
  });

  const agentMembership = await membershipRepo.create({
    tenantId: tenantA.id,
    userId: "usr-agent-rift",
    role: "BOOKING_AGENT",
    status: "ACTIVE",
  });

  // Assign seed system roles to memberships
  const companyOwnerRole = await roleRepo.findByCode("COMPANY_OWNER");
  const bookingAgentRole = await roleRepo.findByCode("BOOKING_AGENT");
  const driverManagerRole = await roleRepo.findByCode("DRIVER_MANAGER");
  const fleetManagerRole = await roleRepo.findByCode("FLEET_MANAGER");

  assert(Boolean(companyOwnerRole), "COMPANY_OWNER role must be seeded");
  assert(Boolean(bookingAgentRole), "BOOKING_AGENT role must be seeded");

  await membershipRoleRepo.assignRole(tenantA.id, ownerMembership.id, companyOwnerRole!.id);
  await membershipRoleRepo.assignRole(tenantA.id, agentMembership.id, bookingAgentRole!.id);

  const ownerContext: TrustedTenantContext = {
    tenantId: tenantA.id,
    membershipId: ownerMembership.id,
    userId: "usr-owner-rift",
    role: "COMPANY_OWNER",
    roles: ["COMPANY_OWNER"],
    permissions: Object.values(TENANT_PERMISSIONS),
    tenantStatus: "ACTIVE",
    tenantSlug: tenantA.slug,
    tenantName: tenantA.name,
    currency: "KES",
    timezone: "Africa/Nairobi",
    isPlatformBypass: false,
    resolvedAt: new Date().toISOString(),
  };

  // ==========================================================================
  // 1. CANONICAL PERMISSION REGISTRY
  // ==========================================================================
  await test("1. Canonical Permission Registry validates structure & metadata", () => {
    assert(ALL_PERMISSION_DEFINITIONS.length > 50, "Should define comprehensive permission metadata");
    for (const p of ALL_PERMISSION_DEFINITIONS) {
      assert(p.key.includes("."), `Permission key '${p.key}' must follow canonical resource.action format`);
      assert(["TENANT", "PLATFORM"].includes(p.scope), `Scope must be TENANT or PLATFORM: ${p.key}`);
      assert(["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(p.riskLevel), `Risk level defined: ${p.key}`);
    }
  });

  // ==========================================================================
  // 2. SYSTEM ROLES & SEED PERMISSIONS
  // ==========================================================================
  await test("2. System roles have deterministic permissions and owner protection flag", async () => {
    const owner = await roleRepo.findByCode("COMPANY_OWNER");
    assert(owner !== null, "COMPANY_OWNER must exist");
    assert(owner!.isOwnerRole === true, "COMPANY_OWNER must be flagged as owner role");
    assert(owner!.permissions.includes(TENANT_PERMISSIONS.TENANT_SETTINGS_UPDATE), "Owner has settings permission");

    const agent = await roleRepo.findByCode("BOOKING_AGENT");
    assert(agent !== null, "BOOKING_AGENT must exist");
    assert(agent!.permissions.includes(TENANT_PERMISSIONS.BOOKING_CREATE), "Agent can create booking");
    assert(!agent!.permissions.includes(TENANT_PERMISSIONS.VEHICLE_DELETE), "Agent CANNOT delete vehicle");

    const manager = await roleRepo.findByCode("MANAGER");
    const fleetManager = await roleRepo.findByCode("FLEET_MANAGER");
    const bookingManager = await roleRepo.findByCode("BOOKING_MANAGER");
    const financeManager = await roleRepo.findByCode("FINANCE_MANAGER");
    const accountant = await roleRepo.findByCode("ACCOUNTANT");
    const customerService = await roleRepo.findByCode("CUSTOMER_SERVICE");

    assert(manager!.permissions.includes(TENANT_PERMISSIONS.RENTAL_RETURN_SCHEDULE), "Manager can schedule a rental return");
    assert(manager!.permissions.includes(TENANT_PERMISSIONS.RENTAL_RETURN_RECEIVE), "Manager can receive a returned vehicle");
    assert(manager!.permissions.includes(TENANT_PERMISSIONS.RENTAL_RETURN_INSPECTION_LINK), "Manager can advance sealed return inspection");
    assert(manager!.permissions.includes(TENANT_PERMISSIONS.RENTAL_FINAL_CALCULATE), "Manager can generate final calculation");
    assert(manager!.permissions.includes(TENANT_PERMISSIONS.RENTAL_FINAL_COMPLETE), "Manager can close settled rental");
    assert(!manager!.permissions.includes(TENANT_PERMISSIONS.RENTAL_FINAL_SETTLE), "Manager cannot seal financial settlement by default");

    assert(fleetManager!.permissions.includes(TENANT_PERMISSIONS.RENTAL_RETURN_RECEIVE), "Fleet Manager can receive vehicle");
    assert(fleetManager!.permissions.includes(TENANT_PERMISSIONS.RENTAL_RETURN_INSPECTION_LINK), "Fleet Manager can own return inspection progression");
    assert(!fleetManager!.permissions.includes(TENANT_PERMISSIONS.RENTAL_FINAL_SETTLE), "Fleet Manager cannot settle customer balances");

    assert(bookingManager!.permissions.includes(TENANT_PERMISSIONS.RENTAL_RETURN_SCHEDULE), "Booking Manager can schedule return");
    assert(bookingManager!.permissions.includes(TENANT_PERMISSIONS.RENTAL_RETURN_RECEIVE), "Booking Manager can receive return");
    assert(agent!.permissions.includes(TENANT_PERMISSIONS.RENTAL_RETURN_RECEIVE), "Booking Agent can perform front-desk vehicle receipt");
    assert(!agent!.permissions.includes(TENANT_PERMISSIONS.RENTAL_FINAL_CALCULATE), "Booking Agent cannot calculate final charges");

    assert(financeManager!.permissions.includes(TENANT_PERMISSIONS.RENTAL_FINAL_CALCULATE), "Finance Manager can calculate final charges");
    assert(financeManager!.permissions.includes(TENANT_PERMISSIONS.RENTAL_FINAL_SETTLE), "Finance Manager can seal final settlement");
    assert(!financeManager!.permissions.includes(TENANT_PERMISSIONS.RENTAL_RETURN_RECEIVE), "Finance Manager does not receive vehicles");

    assert(accountant!.permissions.includes(TENANT_PERMISSIONS.RENTAL_FINAL_CALCULATE), "Accountant can prepare final calculation");
    assert(!accountant!.permissions.includes(TENANT_PERMISSIONS.RENTAL_FINAL_SETTLE), "Accountant cannot seal settlement by default");
    assert(!customerService!.permissions.includes(TENANT_PERMISSIONS.RENTAL_FINAL_SETTLE), "Customer Service remains read/support only for settlement");
  });

  // ==========================================================================
  // 3. MULTI-ROLE ASSIGNMENT & PERMISSION UNION
  // ==========================================================================
  await test("3. Multi-role assignment evaluates union of permissions", async () => {
    // Agent initially has BOOKING_AGENT permissions
    let effective = await authzService.resolveEffectivePermissions(tenantA.id, agentMembership.id);
    assert(effective.permissions.includes(TENANT_PERMISSIONS.BOOKING_CREATE), "Has booking.create");
    assert(!effective.permissions.includes(TENANT_PERMISSIONS.DRIVER_ASSIGN), "Does not have driver.assign yet");

    // Assign DRIVER_MANAGER role to agent
    await roleMgmtService.assignRoleToMember(ownerContext, agentMembership.id, driverManagerRole!.id);

    // Re-resolve
    effective = await authzService.resolveEffectivePermissions(tenantA.id, agentMembership.id);
    assert(effective.permissions.includes(TENANT_PERMISSIONS.BOOKING_CREATE), "Retains booking.create");
    assert(effective.permissions.includes(TENANT_PERMISSIONS.DRIVER_ASSIGN), "Now has driver.assign");
    assert(effective.permissions.includes(TENANT_PERMISSIONS.DRIVER_CREATE), "Now has driver.create");
  });

  // ==========================================================================
  // 4. CUSTOM TENANT ROLES & PRIVILEGE ESCALATION PREVENTION
  // ==========================================================================
  await test("4. Custom tenant roles allow custom permission sets but block platform permissions", async () => {
    // 1. Valid custom role
    const customRole = await roleMgmtService.createCustomRole(ownerContext, {
      name: "Airport Dispatch Officer",
      description: "Handles airport fleet staging and checkouts",
      permissions: [
        TENANT_PERMISSIONS.VEHICLE_READ,
        TENANT_PERMISSIONS.BOOKING_READ,
        TENANT_PERMISSIONS.RENTAL_START,
        TENANT_PERMISSIONS.INSPECTION_CREATE,
      ],
    });
    assert(customRole.id.startsWith("custom-role-"), "Custom role ID format valid");
    assert(customRole.isSystem === false, "Custom role is marked non-system");

    // 2. Privilege Escalation Prevention: Attempting to add PLATFORM permission to a tenant custom role
    let blocked = false;
    try {
      await roleMgmtService.createCustomRole(ownerContext, {
        name: "Malicious Escalate Role",
        description: "Attempting platform backdoor",
        permissions: [TENANT_PERMISSIONS.VEHICLE_READ, PLATFORM_PERMISSIONS.PLATFORM_TENANT_DELETE as any],
      });
    } catch (err: any) {
      blocked = true;
      assert(err.code === ERROR_CODES.INVALID_PERMISSION, `Must reject with INVALID_PERMISSION, got ${err.code}`);
    }
    assert(blocked, "Privilege escalation attempt must be blocked");
  });

  // ==========================================================================
  // 5. CACHING, INVALIDATION & FAIL-SAFE REDIS OUTAGE FALLBACK
  // ==========================================================================
  await test("5. Authorization cache invalidates on changes and falls back safely on Redis outage", async () => {
    // 1. Seed cache
    await authzService.resolveEffectivePermissions(tenantA.id, agentMembership.id);
    const cached = await cacheService.get(tenantA.id, agentMembership.id);
    assert(cached !== null, "Permissions must be cached");

    // 2. Assign Fleet Manager role -> Invalidation
    await roleMgmtService.assignRoleToMember(ownerContext, agentMembership.id, fleetManagerRole!.id);
    const cachedAfterAssign = await cacheService.get(tenantA.id, agentMembership.id);
    assert(cachedAfterAssign === null, "Cache must be invalidated upon role assignment");

    // 3. Re-resolve and verify fleet permissions present
    const updated = await authzService.resolveEffectivePermissions(tenantA.id, agentMembership.id);
    assert(updated.permissions.includes(TENANT_PERMISSIONS.VEHICLE_DELETE), "Has vehicle.delete from Fleet Manager");

    // 4. Simulate Cache Outage (Fail-Safe Database Fallback)
    cacheService.simulateFailure(true);
    const fallbackAuth = await authzService.resolveEffectivePermissions(tenantA.id, ownerMembership.id);
    assert(fallbackAuth.isOwner === true, "Database fallback resolved isOwner correctly");
    assert(fallbackAuth.permissions.includes(TENANT_PERMISSIONS.TENANT_SETTINGS_UPDATE), "Fallback resolved permissions");
    cacheService.simulateFailure(false);
  });

  // ==========================================================================
  // 6. P0 SECURITY INVARIANT: LAST-OWNER PROTECTION
  // ==========================================================================
  await test("6. Last-Owner Protection Invariant: Active tenant cannot be left without an active Owner", async () => {
    // tenantA currently has exactly 1 owner (ownerMembership)
    let demoteBlocked = false;
    try {
      await roleMgmtService.removeRoleFromMember(ownerContext, ownerMembership.id, companyOwnerRole!.id);
    } catch (err: any) {
      demoteBlocked = true;
      assert(err.code === ERROR_CODES.LAST_OWNER_REQUIRED, `Expected LAST_OWNER_REQUIRED, got ${err.code}`);
    }
    assert(demoteBlocked, "Demoting the sole owner must be blocked");

    // Add a second owner
    const secondOwner = await membershipRepo.create({
      tenantId: tenantA.id,
      userId: "usr-owner-rift-2",
      role: "COMPANY_OWNER",
      status: "ACTIVE",
    });
    await membershipRoleRepo.assignRole(tenantA.id, secondOwner.id, companyOwnerRole!.id);

    // Now removing first owner should succeed (since second owner remains)
    await roleMgmtService.removeRoleFromMember(ownerContext, ownerMembership.id, companyOwnerRole!.id);
    const owner1HasOwnerRole = await membershipRoleRepo.isMembershipOwner(tenantA.id, ownerMembership.id);
    assert(!owner1HasOwnerRole, "First owner demoted successfully");

    // Attempting to demote second owner now must fail (as they are the last owner)
    let secondDemoteBlocked = false;
    try {
      await roleMgmtService.removeRoleFromMember(ownerContext, secondOwner.id, companyOwnerRole!.id);
    } catch (err: any) {
      secondDemoteBlocked = true;
      assert(err.code === ERROR_CODES.LAST_OWNER_REQUIRED, "Last remaining owner protected");
    }
    assert(secondDemoteBlocked, "Second owner demotion blocked by Last-Owner protection");
  });

  // ==========================================================================
  // 7. P0 SECURITY INVARIANT: PLATFORM & TENANT DECOUPLING
  // ==========================================================================
  await test("7. Platform roles cannot access tenant endpoints without audited SupportAccessSession", async () => {
    const platformStaffUserId = "usr-platform-staff-1";
    const platformMembershipId = "pm-staff-1";

    await platformRoleRepo.assignRoleToStaff(platformMembershipId, "SUPPORT_ADMIN");
    const platformCtx = await platformAuthService.resolvePlatformPermissions(
      platformMembershipId,
      platformStaffUserId,
      "req-plt-test"
    );

    assert(platformAuthService.can(platformCtx, PLATFORM_PERMISSIONS.PLATFORM_SUPPORT_SESSION_START), "Staff has support perm");

    // Without a SupportAccessSession, resolving TenantContext for staff fails
    let tenantAccessBlocked = false;
    try {
      await tenantResolverService.resolveContext(platformStaffUserId, tenantA.id);
    } catch (err: any) {
      tenantAccessBlocked = true;
      assert(err.code === ERROR_CODES.TENANT_ACCESS_DENIED, "Access denied without membership");
    }
    assert(tenantAccessBlocked, "Platform staff cannot access tenant context without membership or support session");
  });

  // ==========================================================================
  // 8. AUDITED SUPPORT ACCESS SESSION LIFECYCLE
  // ==========================================================================
  await test("8. Support access session lifecycle: start, validate, expiry, and termination", async () => {
    const platformStaffUserId = "usr-support-hero";
    const platformMembershipId = "pm-support-hero";
    await platformRoleRepo.assignRoleToStaff(platformMembershipId, "SUPPORT_ADMIN");

    const platformCtx = await platformAuthService.resolvePlatformPermissions(
      platformMembershipId,
      platformStaffUserId,
      "req-sup-lifecycle"
    );

    // 1. Start session
    const session = await supportAccessService.startSupportSession(
      platformCtx,
      tenantA.id,
      "Investigating GPS telematics sync dropouts for fleet asset #108",
      15
    );
    assert(session.isActive === true, "Session is active");
    assert(session.targetTenantId === tenantA.id, "Target tenant matches");

    // 2. Validate session
    const validated = await supportAccessService.validateSupportSession(
      session.id,
      tenantA.id,
      platformStaffUserId
    );
    assert(validated.id === session.id, "Validation successful");

    // 3. Resolve context with bypass
    const resolvedContext = await tenantResolverService.resolveContext(
      platformStaffUserId,
      tenantA.id,
      { platformBypass: true }
    );
    assert(resolvedContext.isPlatformBypass === true, "Platform bypass resolved");

    // 4. Terminate session
    await supportAccessService.endSupportSession(platformCtx, session.id);

    // 5. Verify subsequent validation rejected
    let revalidateFailed = false;
    try {
      await supportAccessService.validateSupportSession(session.id, tenantA.id, platformStaffUserId);
    } catch (err: any) {
      revalidateFailed = true;
      assert(err.code === ERROR_CODES.SUPPORT_SESSION_EXPIRED, "Session expired/ended rejected");
    }
    assert(revalidateFailed, "Ended support session cannot be reused");
  });

  // ==========================================================================
  // 9. RESOURCE-LEVEL POLICIES (ABAC)
  // ==========================================================================
  await test("9. Resource-level policies evaluate vehicle ownership and tenant boundaries", async () => {
    const vehPolicy = new VehicleResourcePolicy();
    const bookPolicy = new BookingResourcePolicy();
    const stlPolicy = new SettlementResourcePolicy();

    // Vehicles
    const vehicleInTenantA: any = { id: "v-1", tenantId: tenantA.id, ownerId: "usr-investor-1" };
    const vehicleInTenantB: any = { id: "v-2", tenantId: tenantB.id, ownerId: "usr-investor-1" };

    const investorContext: TrustedTenantContext = {
      tenantId: tenantA.id,
      membershipId: "mem-investor",
      userId: "usr-investor-1",
      role: "VEHICLE_OWNER",
      roles: ["VEHICLE_OWNER"],
      permissions: [TENANT_PERMISSIONS.SETTLEMENT_READ], // no global vehicle.read
      tenantStatus: "ACTIVE",
      tenantSlug: tenantA.slug,
      tenantName: tenantA.name,
      currency: "KES",
      timezone: "Africa/Nairobi",
      isPlatformBypass: false,
      resolvedAt: new Date().toISOString(),
    };

    // Investor can read their own vehicle in tenantA
    assert(vehPolicy.canRead(investorContext, vehicleInTenantA) === true, "Investor reads own vehicle");
    // Investor CANNOT read vehicle in tenantB (Strict Tenant Isolation)
    assert(vehPolicy.canRead(investorContext, vehicleInTenantB) === false, "Cross-tenant vehicle blocked");

    // Investor CANNOT delete vehicle
    assert(vehPolicy.canDelete(investorContext, vehicleInTenantA) === false, "Investor cannot delete vehicle");

    // Settlements
    const ownSettlement: any = { id: "stl-1", tenantId: tenantA.id, ownerId: "usr-investor-1", netPayout: 50000 };
    assert(stlPolicy.canRead(investorContext, ownSettlement) === true, "Investor reads own statement");
    assert(stlPolicy.canUpdate(investorContext, ownSettlement) === false, "Investor CANNOT approve own payout");
  });

  // ==========================================================================
  // 10. AUDIT TRAILS & OUTBOX EVENT PERSISTENCE
  // ==========================================================================
  await test("10. Authorization modifications record immutable audit trails and outbox messages", async () => {
    const auditEntries = await auditRepo.findByTenant(tenantA.id);
    assert(auditEntries.length > 0, "Audit logs recorded for authorization changes");

    const outboxMessages = await outboxRepo.findPending();
    assert(outboxMessages.length > 0, "Outbox events created for downstream eventual consistency");
  });

  console.log("==================================================================");
  console.log(`SPRINT 5 AUTHORIZATION TESTS COMPLETE: ${passed}/${total} PASSED`);
  console.log("==================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
