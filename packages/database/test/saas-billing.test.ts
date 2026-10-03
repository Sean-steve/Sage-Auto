// ============================================================================
// CAR HIRE OS — SPRINT 6 SAAS BILLING & CONTROL PLANE AUTOMATED TEST SUITE
// ============================================================================

import {
  PlanRepository,
  SubscriptionRepository,
  SubscriptionStatusHistoryRepository,
  BillingAccountRepository,
  SaaSBillingInvoiceRepository,
  SaaSPaymentRecordRepository,
  TenantRepository,
  AuditRepository,
  OutboxRepository,
} from "../src/index";
import { PlanService } from "../../../apps/api/src/modules/subscriptions/application/plan.service";
import { SubscriptionService } from "../../../apps/api/src/modules/subscriptions/application/subscription.service";
import { SaasMetricsService } from "../../../apps/api/src/modules/subscriptions/application/metrics.service";
import { BillingService } from "../../../apps/api/src/modules/billing/application/billing.service";
import { BillingJobsService } from "../../../apps/api/src/modules/billing/application/billing-jobs.service";
import { BillingMoney } from "../../../apps/api/src/modules/billing/domain/billing-money";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  }
}

async function expectRejects(
  fn: () => Promise<unknown> | unknown,
  pattern: RegExp,
  message: string
) {
  try {
    await fn();
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  } catch (err: any) {
    const errMessage = err instanceof Error ? err.message : String(err);
    if (!pattern.test(errMessage)) {
      throw err;
    }
  }
}

async function runTestSuite() {
  console.log("==================================================================");
  console.log("CAR HIRE OS — SPRINT 6 SAAS BILLING & CONTROL PLANE TEST SUITE");
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

  // Repositories
  const planRepo = new PlanRepository();
  const subRepo = new SubscriptionRepository();
  const historyRepo = new SubscriptionStatusHistoryRepository();
  const billingAccountRepo = new BillingAccountRepository();
  const invoiceRepo = new SaaSBillingInvoiceRepository();
  const paymentRepo = new SaaSPaymentRecordRepository();
  const tenantRepo = new TenantRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();

  // Initialize seed plans
  PlanRepository.initializeSeed();

  // Services
  const planService = new PlanService(planRepo, auditRepo, outboxRepo);
  const subService = new SubscriptionService(
    subRepo,
    historyRepo,
    planRepo,
    tenantRepo,
    auditRepo,
    outboxRepo
  );
  const metricsService = new SaasMetricsService(subRepo, planRepo, tenantRepo);
  const billingService = new BillingService(
    invoiceRepo,
    paymentRepo,
    billingAccountRepo,
    subRepo,
    planRepo,
    auditRepo,
    outboxRepo
  );
  const jobsService = new BillingJobsService(
    subRepo,
    subService,
    billingService,
    invoiceRepo,
    planRepo
  );

  // Setup test tenant
  const tenant1 = await tenantRepo.create({
    name: "Safari Elite Safaris",
    slug: "safari-elite",
    status: "ACTIVE",
    planId: "plan-growth",
    currency: "KES",
  });

  const previousAppEnv = process.env.APP_ENV;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.APP_ENV = "production";
  process.env.NODE_ENV = "production";

  try {
    const invoice = await invoiceRepo.create({
      tenantId: tenant1.id,
      subscriptionId: "sub-production-guard",
      status: "OPEN",
      currency: "KES",
      subtotal: 1000,
      tax: 0,
      discount: 0,
      total: 1000,
      amountPaid: 0,
      amountDue: 1000,
      issuedAt: new Date().toISOString(),
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      lineItems: [{
        description: "Production guard invoice",
        quantity: 1,
        unitPrice: 1000,
        amount: 1000,
        referenceType: "SUBSCRIPTION_BASE",
        referenceId: "sub-production-guard",
      }],
    });

    await expectRejects(
      () =>
        billingService.recordPayment(
          {
            invoiceId: invoice.id,
            amount: 1000,
            currency: "KES",
            providerReference: "production-guard-reference",
          },
          { id: "staff-finance-1", type: "PLATFORM_STAFF" }
        ),
      /Production.*explicit.*provider|DEVELOPMENT_MOCK.*forbidden|DEVELOPMENT_MOCK.*production/i,
      "Production must reject implicit DEVELOPMENT_MOCK payment provider fallback"
    );
  } finally {
    process.env.APP_ENV = previousAppEnv;
    process.env.NODE_ENV = previousNodeEnv;
  }

  const tenant2 = await tenantRepo.create({
    name: "Nairobi Luxury Drives",
    slug: "nairobi-luxury",
    status: "ACTIVE",
    planId: "plan-starter",
    currency: "KES",
  });

  // TEST 1: Plans Repository & Service
  await test("Plan Listing and Seed Data Initialization", async () => {
    const plans = await planService.listAllPlans();
    assert(plans.length >= 3, "Expected at least 3 seed plans (Starter, Growth, Enterprise)");

    const growthPlan = await planService.getPlanByCode("GROWTH");
    assert(!!growthPlan, "Growth plan must exist");
    assert(growthPlan?.price === 6500, "Growth monthly price must be 6500");
    assert(growthPlan?.maxVehicles === 25, "Growth maxVehicles must be 25");
    assert(growthPlan?.allowDoubleEntryLedger === true, "Growth allows ledger");
  });

  await test("Plan Creation and Unique Code Validation", async () => {
    const customPlan = await planService.createPlan({
      code: "CUSTOM_FLEET",
      name: "Custom Fleet Scaler",
      currency: "KES",
      price: 12000,
      billingInterval: "MONTHLY",
      maxVehicles: 50,
      maxMembers: 20,
    });
    assert(customPlan.code === "CUSTOM_FLEET", "Custom plan code created");

    let duplicateFailed = false;
    try {
      await planService.createPlan({
        code: "CUSTOM_FLEET",
        name: "Duplicate Plan",
        currency: "KES",
        price: 10000,
        billingInterval: "MONTHLY",
      });
    } catch {
      duplicateFailed = true;
    }
    assert(duplicateFailed, "Must prevent duplicate plan code");
  });

  // TEST 2: Subscription Lifecycle & Concurrency
  let testSubId = "";
  await test("Subscription Provisioning in TRIAL State with History Recording", async () => {
    const sub = await subService.createSubscription({
      tenantId: tenant1.id,
      planId: "plan-growth",
      startAsTrial: true,
    });
    testSubId = sub.id;

    assert(sub.status === "TRIAL", "New subscription should start in TRIAL");
    assert(sub.version === 1, "Initial version should be 1");
    assert(!!sub.trialEndsAt, "Trial end date must be populated");

    const history = await subService.getStatusHistory(sub.id);
    assert(history.length === 1, "Must have 1 history record");
    assert(history[0].newStatus === "TRIAL", "History shows TRIAL");
  });

  await test("Single Active Subscription per Tenant Invariant", async () => {
    let duplicateSubBlocked = false;
    try {
      await subService.createSubscription({
        tenantId: tenant1.id,
        planId: "plan-starter",
      });
    } catch {
      duplicateSubBlocked = true;
    }
    assert(duplicateSubBlocked, "Must block creating second active subscription for same tenant");
  });

  await test("Subscription Activation and Version Increment", async () => {
    const sub = await subService.getSubscriptionById(testSubId);
    assert(!!sub, "Subscription must exist");

    const activated = await subService.transitionStatus(testSubId, {
      newStatus: "ACTIVE",
      reason: "Tenant converted from trial",
      actorType: "PLATFORM_STAFF",
      actorId: "admin-1",
      expectedVersion: sub!.version,
    });

    assert(activated.status === "ACTIVE", "Status must be ACTIVE");
    assert(activated.version === (sub?.version ?? 0) + 1, "Version must increment");

    const history = await subService.getStatusHistory(testSubId);
    assert(history.length === 2, "History must record transition");
    assert(history.some((h) => h.newStatus === "ACTIVE" && h.previousStatus === "TRIAL"), "History contains ACTIVE transition");
  });

  await test("Optimistic Concurrency Conflict Detection", async () => {
    const sub = await subService.getSubscriptionById(testSubId);
    assert(!!sub, "Subscription must exist");

    let conflictCaught = false;
    try {
      // Intentionally pass an outdated expectedVersion
      await subService.transitionStatus(testSubId, {
        newStatus: "SUSPENDED",
        reason: "Test stale update",
        actorType: "PLATFORM_STAFF",
        expectedVersion: (sub?.version || 2) - 1,
      });
    } catch (err: any) {
      conflictCaught = true;
      assert(err.name === "ConcurrencyConflictError" || err.code === "CONCURRENCY_CONFLICT", "Must throw ConcurrencyConflictError");
    }
    assert(conflictCaught, "Must catch optimistic concurrency conflict");
  });

  // TEST 3: Plan Changes (Upgrade/Downgrade)
  await test("Plan Upgrade and History Tracking", async () => {
    const updated = await subService.changePlan(testSubId, {
      newPlanId: "plan-enterprise",
      billingInterval: "YEARLY",
      reason: "Tenant requested upgrade to Enterprise Pro (Annual)",
    });

    assert(updated.planId === "plan-enterprise", "Plan updated to Enterprise");
    assert(updated.billingInterval === "YEARLY", "Interval updated to YEARLY");
    assert(updated.amount === 150000, "Annual amount is 150,000");

    const tenantRecord = await tenantRepo.findById(tenant1.id);
    assert(tenantRecord?.planId === "plan-enterprise", "Tenant planId synchronized");
  });

  // TEST 4: SaaS Billing Invoices & Decimal Precision
  let invoiceId = "";
  await test("SaaS Billing Invoice Generation & Line Item Math", async () => {
    const invoice = await billingService.createSubscriptionInvoice({
      tenantId: tenant1.id,
      subscriptionId: testSubId,
      description: "Car Hire OS Enterprise Pro (Annual Subscription)",
      amount: 150000.0,
      currency: "KES",
      tax: 24000.0, // 16% VAT
      discount: 5000.0, // Promotional discount
      dueInDays: 14,
    });
    invoiceId = invoice.id;

    assert(invoice.invoiceNumber.startsWith("SAAS-INV-"), "Invoice number format SAAS-INV-");
    assert(invoice.subtotal === 150000.0, "Subtotal is 150,000");
    assert(invoice.tax === 24000.0, "Tax is 24,000");
    assert(invoice.discount === 5000.0, "Discount is 5,000");
    assert(invoice.total === 169000.0, "Total is 169,000 (150k + 24k - 5k)");
    assert(invoice.status === "OPEN", "Initial invoice status is OPEN");
    assert(invoice.lineItems?.length === 1, "Line items present");
  });

  await test("Billing Money 4-Decimal Precision Operations", () => {
    const a = 1234.5678;
    const b = 8765.4321;
    const sum = BillingMoney.add(a, b);
    assert(sum === 9999.9999, "Addition 4-decimal precision");

    const tax = BillingMoney.calculateTax(10000.0, 16.0);
    assert(tax === 1600.0, "16% VAT calculation");
  });

  // TEST 5: SaaS Payment Recording (Platform & Dev Mock)
  await test("Manual Platform Payment Recording and Invoice Settlement", async () => {
    const { invoice, payment } = await billingService.recordPayment(
      {
        invoiceId,
        amount: 169000.0,
        currency: "KES",
        provider: "MANUAL_BANK",
        providerReference: "NCBA-EFT-994821",
        notes: "Direct bank wire received and verified by finance",
      },
      { id: "staff-finance-1", type: "PLATFORM_STAFF" }
    );

    assert(payment.status === "SUCCEEDED", "Payment recorded as SUCCEEDED");
    assert(payment.provider === "MANUAL_BANK", "Provider is MANUAL_BANK");
    assert(invoice.status === "PAID", "Invoice status updated to PAID");
    assert(invoice.amountPaid === 169000.0, "Amount paid is 169,000");
    assert(invoice.amountDue === 0, "Amount due is 0");
    assert(!!invoice.paidAt, "paidAt timestamp set");
  });

  // TEST 6: SaaS Control Plane MRR / ARR Metrics Calculation
  await test("MRR and ARR Calculation with Normalized Annual Billing", async () => {
    // tenant1 is Enterprise Annual: 150,000 / 12 = 12,500 MRR
    // Let's create sub for tenant2 on Starter Monthly: 2,500 MRR
    await subService.createSubscription({
      tenantId: tenant2.id,
      planId: "plan-starter",
      startAsTrial: false,
    });

    const overview = await metricsService.calculateOverview();
    assert(overview.totalTenants >= 2, "At least 2 tenants");
    assert(overview.activeSubscriptions >= 2, "At least 2 active subscriptions");
    // Expected MRR = 12,500 + 2,500 = 15,000
    assert(overview.mrr === 15000, `Expected MRR of 15,000, got ${overview.mrr}`);
    assert(overview.arr === 180000, `Expected ARR of 180,000, got ${overview.arr}`);
  });

  // TEST 7: Background Billing Jobs (Renewal, Grace Period, Suspension)
  await test("Background Renewal, Grace Period, and Suspension Evaluators", async () => {
    const renewalCount = await jobsService.processRenewalDueSubscriptions();
    const pastDueCount = await jobsService.processPastDueSubscriptions();
    const graceCount = await jobsService.processGracePeriodExpirations();

    assert(typeof renewalCount === "number", "Renewal count is number");
    assert(typeof pastDueCount === "number", "Past due count is number");
    assert(typeof graceCount === "number", "Grace count is number");
  });

  // TEST 8: Data Preservation & Tenant Isolation on Suspension
  await test("Data Preservation Invariant: Suspension Does Not Delete Tenant Data", async () => {
    const sub = await subService.getSubscriptionById(testSubId);
    assert(!!sub, "Sub exists");

    const suspended = await subService.transitionStatus(testSubId, {
      newStatus: "SUSPENDED",
      reason: "Compliance audit block",
      actorType: "PLATFORM_STAFF",
    });
    assert(suspended.status === "SUSPENDED", "Sub suspended");

    // Tenant record must still exist with all metadata intact
    const tenant = await tenantRepo.findById(tenant1.id);
    assert(!!tenant, "Tenant record must be preserved");
    assert(tenant?.name === "Safari Elite Safaris", "Tenant name preserved");

    // Invoices and payments must remain intact
    const invoices = await billingService.listInvoicesByTenant(tenant1.id);
    assert(invoices.length > 0, "Invoices must be preserved");
  });

  console.log("------------------------------------------------------------------");
  console.log(`SAAS BILLING TESTS SUMMARY: ${passed}/${total} PASSED`);
  console.log("------------------------------------------------------------------");

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Fatal error in test runner:", err);
  process.exit(1);
});
