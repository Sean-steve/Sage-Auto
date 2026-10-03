// ============================================================================
// CAR HIRE OS — SPRINT 2 PERSISTENCE FOUNDATION AUTOMATED TEST SUITE
// Validates schema constraints, monetary precision, transaction isolation,
// outbox atomicity, idempotency, and error translations
// ============================================================================

import {
  createMoney,
  addMoney,
  subtractMoney,
  multiplyMoney,
  divideMoney,
  toScaledBigInt,
  fromScaledBigInt,
  formatMoney,
} from "@carhire/utils";
import {
  TransactionManager,
  TenantRepository,
  UserRepository,
  OutboxRepository,
  IdempotencyRepository,
  WebhookRepository,
  AuditRepository,
  DatabaseHealthService,
  UniqueConstraintViolationError,
  RecordNotFoundError,
  TenantContextMissingError,
  mapDatabaseError,
} from "../src/index";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  }
}

async function runTestSuite() {
  console.log("==================================================================");
  console.log("CAR HIRE OS — SPRINT 2 PERSISTENCE TEST SUITE");
  console.log("==================================================================");

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(err);
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: MONETARY PRECISION & NUMERIC(19,4) ARITHMETIC
  // --------------------------------------------------------------------------
  await test("1. Monetary arithmetic avoids IEEE 754 floating point distortion", () => {
    // 0.1 + 0.2 in standard JavaScript float gives 0.30000000000000004
    const m1 = createMoney("0.1000", "KES");
    const m2 = createMoney("0.2000", "KES");
    const sum = addMoney(m1, m2);
    assert(sum.amount === "0.3000", `Sum should be exact "0.3000", got "${sum.amount}"`);

    // Verify 4-decimal precision multiplication (e.g. 3.5 days @ 2500.50 KES)
    const rate = createMoney("2500.5000", "KES");
    const totalWithVat = multiplyMoney(rate, 1.16); // 16% VAT
    assert(totalWithVat.currency === "KES", "Currency preserved");
    assert(totalWithVat.scale === 4, "Scale is 4 decimal places");

    // Subtraction
    const diff = subtractMoney(m2, m1);
    assert(diff.amount === "0.1000", `Diff should be "0.1000", got "${diff.amount}"`);
  });

  // --------------------------------------------------------------------------
  // TEST 2: RLS TENANT TRANSACTION CONTEXT ISOLATION
  // --------------------------------------------------------------------------
  await test("2. TransactionManager binds tenant context and rejects empty tenant IDs", async () => {
    const tenantId = crypto.randomUUID();
    let executedInContext = false;

    await TransactionManager.withTenantTransaction(tenantId, async (tx) => {
      assert(tx.isTransaction === true, "Transaction context must be active");
      assert(tx.tenantId === tenantId, "Transaction tenantId must match");
      executedInContext = true;
    });

    assert(executedInContext, "Tenant transaction callback executed");

    // Empty tenant ID check
    let threw = false;
    try {
      await TransactionManager.withTenantTransaction("", async () => {});
    } catch (err) {
      threw = err instanceof TenantContextMissingError;
    }
    assert(threw, "Empty tenantId must throw TenantContextMissingError");
  });

  // --------------------------------------------------------------------------
  // TEST 3: USER & UNIQUE NORMALIZED EMAIL CONSTRAINT
  // --------------------------------------------------------------------------
  await test("3. UserRepository enforces unique normalized email constraint", async () => {
    const userRepo = new UserRepository();
    const testEmail = `operator-${Date.now()}@example.com`;

    const user = await userRepo.create({
      email: testEmail,
      normalizedEmail: testEmail.toLowerCase(),
      fullName: "Test Fleet Operator",
      phone: "+254712345678",
      status: "ACTIVE",
      isPlatformStaff: false,
    });

    assert(user.id.length > 0, "User ID generated");

    // Duplicate creation must fail with UniqueConstraintViolationError
    let threwDuplicate = false;
    try {
      await userRepo.create({
        email: testEmail.toUpperCase(),
        normalizedEmail: testEmail.toLowerCase(),
        fullName: "Duplicate Operator",
        phone: "+254712345679",
        status: "ACTIVE",
        isPlatformStaff: false,
      });
    } catch (err) {
      threwDuplicate = err instanceof UniqueConstraintViolationError;
    }
    assert(threwDuplicate, "Duplicate email must throw UniqueConstraintViolationError");
  });

  // --------------------------------------------------------------------------
  // TEST 4: TENANT & TENANT SETTINGS REPOSITORY
  // --------------------------------------------------------------------------
  await test("4. TenantRepository persists tenant, settings, and prevents duplicate slug", async () => {
    const tenantRepo = new TenantRepository();
    const slug = `test-tenant-${Date.now()}`;

    const tenant = await tenantRepo.create({
      name: "Test Tenant Co",
      slug,
      status: "ACTIVE",
      currency: "KES",
      planId: "plan-growth",
      defaultCurrency: "KES",
      currencySymbol: "KSh",
      timezone: "Africa/Nairobi",
      countryCode: "KE",
    });

    assert(tenant.slug === slug, "Slug persisted");

    // Update settings
    const settings = await tenantRepo.updateSettings(tenant.id, {
      vatRatePercent: 16.0,
      excessKmRate: 30.0,
    });

    assert(settings.tenantId === tenant.id, "Settings tenantId matches");
    assert(settings.excessKmRate === 30.0, "Excess km rate updated");

    // Duplicate slug check
    let threwSlug = false;
    try {
      await tenantRepo.create({
        name: "Conflicting Tenant",
        slug,
        status: "ACTIVE",
        currency: "KES",
        planId: "plan-growth",
        defaultCurrency: "KES",
        currencySymbol: "KSh",
        timezone: "Africa/Nairobi",
        countryCode: "KE",
      });
    } catch (err) {
      threwSlug = err instanceof UniqueConstraintViolationError;
    }
    assert(threwSlug, "Duplicate slug must throw UniqueConstraintViolationError");
  });

  // --------------------------------------------------------------------------
  // TEST 5: TENANT MEMBERSHIP UNIQUE CONSTRAINT
  // --------------------------------------------------------------------------
  await test("5. TenantMembership enforces UNIQUE(tenant_id, user_id)", async () => {
    const userRepo = new UserRepository();
    const tId = crypto.randomUUID();
    const uId = crypto.randomUUID();

    await userRepo.createMembership({
      tenantId: tId,
      userId: uId,
      role: "TENANT_OPERATOR",
      status: "ACTIVE",
    });

    let threwDuplicateMembership = false;
    try {
      await userRepo.createMembership({
        tenantId: tId,
        userId: uId,
        role: "TENANT_ADMIN",
        status: "ACTIVE",
      });
    } catch (err) {
      threwDuplicateMembership = err instanceof UniqueConstraintViolationError;
    }
    assert(threwDuplicateMembership, "Duplicate membership must throw UniqueConstraintViolationError");
  });

  // --------------------------------------------------------------------------
  // TEST 6: TRANSACTIONAL OUTBOX REPOSITORY
  // --------------------------------------------------------------------------
  await test("6. OutboxRepository creates, batches, and processes events", async () => {
    const outboxRepo = new OutboxRepository();
    const aggId = crypto.randomUUID();

    const event = await outboxRepo.create({
      eventType: "RENTAL_CREATED",
      eventVersion: "v1",
      aggregateType: "Rental",
      aggregateId: aggId,
      payload: { rentalId: aggId, amount: "15000.0000" },
      occurredAt: new Date().toISOString(),
      status: "PENDING",
      availableAt: new Date().toISOString(),
    });

    assert(event.status === "PENDING", "Outbox starts PENDING");

    const batch = await outboxRepo.fetchPendingBatch(10);
    assert(batch.some((e) => e.id === event.id), "Pending event returned in batch");

    await outboxRepo.markProcessed(event.id);
    const postBatch = await outboxRepo.fetchPendingBatch(10);
    assert(!postBatch.some((e) => e.id === event.id), "Processed event removed from pending batch");
  });

  // --------------------------------------------------------------------------
  // TEST 7: IDEMPOTENCY KEY REPOSITORY & COLLISION HANDLING
  // --------------------------------------------------------------------------
  await test("7. IdempotencyRepository prevents concurrent duplicate executions", async () => {
    const idemRepo = new IdempotencyRepository();
    const key = `req-test-${Date.now()}`;
    const scope = "POST::/api/v1/rentals";
    const expiresAt = new Date(Date.now() + 86400000).toISOString();

    const record = await idemRepo.createPending(key, scope, "hash-123", expiresAt);
    assert(record.status === "PENDING", "Idempotency key begins PENDING");

    let threwDuplicateIdem = false;
    try {
      await idemRepo.createPending(key, scope, "hash-123", expiresAt);
    } catch (err) {
      threwDuplicateIdem = err instanceof UniqueConstraintViolationError;
    }
    assert(threwDuplicateIdem, "Duplicate idempotency key must throw UniqueConstraintViolationError");

    await idemRepo.complete(key, scope, 201, { id: "rental-1" });
    const completed = await idemRepo.find(key, scope);
    assert(completed?.status === "COMPLETED", "Status updated to COMPLETED");
    assert(completed?.responseStatus === 201, "Response status 201 saved");
  });

  // --------------------------------------------------------------------------
  // TEST 8: WEBHOOK EVENT PERSISTENCE & DEDUPLICATION
  // --------------------------------------------------------------------------
  await test("8. WebhookRepository enforces UNIQUE(provider, provider_event_id)", async () => {
    const webhookRepo = new WebhookRepository();
    const eventId = `evt_mpesa_${Date.now()}`;

    const receipt = await webhookRepo.recordReceipt({
      provider: "MPESA",
      providerEventId: eventId,
      eventType: "C2B_PAYMENT_CONFIRMATION",
      payload: { TransID: eventId, TransAmount: "5000.00" },
    });

    assert(receipt.status === "RECEIVED", "Receipt status is RECEIVED");

    let threwDuplicateWebhook = false;
    try {
      await webhookRepo.recordReceipt({
        provider: "MPESA",
        providerEventId: eventId,
        eventType: "C2B_PAYMENT_CONFIRMATION",
        payload: { TransID: eventId, TransAmount: "5000.00" },
      });
    } catch (err) {
      threwDuplicateWebhook = err instanceof UniqueConstraintViolationError;
    }
    assert(threwDuplicateWebhook, "Duplicate webhook providerEventId throws UniqueConstraintViolationError");
  });

  // --------------------------------------------------------------------------
  // TEST 9: AUDIT LOG APPEND-ONLY INTEGRITY
  // --------------------------------------------------------------------------
  await test("9. AuditRepository appends immutable audit events", async () => {
    const auditRepo = new AuditRepository();
    const resId = crypto.randomUUID();

    const record = await auditRepo.append({
      actorType: "USER",
      actorId: crypto.randomUUID(),
      action: "VEHICLE_STATUS_UPDATED",
      resourceType: "Vehicle",
      resourceId: resId,
      afterSnapshot: { status: "RENTED" },
    });

    assert(record.id.length > 0, "Audit ID generated");

    const auditTrail = await auditRepo.findByResource("Vehicle", resId);
    assert(auditTrail.length === 1, "Audit record found by resource");
    assert(auditTrail[0].action === "VEHICLE_STATUS_UPDATED", "Action verified");
  });

  // --------------------------------------------------------------------------
  // TEST 10: DATABASE ERROR MAPPING
  // --------------------------------------------------------------------------
  await test("10. mapDatabaseError translates raw errors into safe domain exceptions", () => {
    const p2002Error = { code: "P2002", meta: { target: ["email"] } };
    const mapped = mapDatabaseError(p2002Error);
    assert(mapped instanceof UniqueConstraintViolationError, "P2002 maps to UniqueConstraintViolationError");
    assert(mapped.code === "UNIQUE_CONSTRAINT_VIOLATION", "Code matches UNIQUE_CONSTRAINT_VIOLATION");
  });

  // --------------------------------------------------------------------------
  // TEST 11: DATABASE READINESS PROBE
  // --------------------------------------------------------------------------
  await test("11. DatabaseHealthService reports readiness with latency metric", async () => {
    const health = await DatabaseHealthService.checkReadiness();
    assert(health.isReady === Boolean(process.env.SQLITE_PATH), "Readiness requires a configured, reachable database");
    assert(health.provider === "sqlite", "Provider is sqlite");
    assert(health.latencyMs >= 0, "Latency metric present");
  });

  console.log("==================================================================");
  console.log(`TEST RUN COMPLETE: ${passed}/${total} PASSED`);
  console.log("==================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
