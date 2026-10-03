// ============================================================================
// CAR HIRE OS — SPRINT 35 PLATFORM SAAS ANALYTICS AUTOMATED TEST SUITE
// ============================================================================

import {
  PlanRepository,
  SubscriptionRepository,
  TenantRepository,
  TenantMembershipRepository,
  VehicleRepository,
  SaaSBillingInvoiceRepository,
  PlatformSnapshotRepository,
  MrrMovementRepository,
  PlatformCohortRepository,
  PlatformReportRepository,
} from "../src/index";

import { PlatformMetricRegistry } from "../../../apps/api/src/modules/platform-analytics/domain/platform-metric-registry";
import { PlatformReportRegistry } from "../../../apps/api/src/modules/platform-analytics/domain/platform-report-registry";
import { PlatformMetricsService } from "../../../apps/api/src/modules/platform-analytics/application/platform-metrics.service";
import { MrrMovementService } from "../../../apps/api/src/modules/platform-analytics/application/mrr-movement.service";
import { PlatformProjectionService } from "../../../apps/api/src/modules/platform-analytics/application/platform-projection.service";
import { PlatformCohortService } from "../../../apps/api/src/modules/platform-analytics/application/platform-cohort.service";
import { PlatformReportingService } from "../../../apps/api/src/modules/platform-analytics/application/platform-reporting.service";
import { PlatformExportService } from "../../../apps/api/src/modules/platform-analytics/application/platform-export.service";
import { PlatformReconciliationService } from "../../../apps/api/src/modules/platform-analytics/application/platform-reconciliation.service";
import { PlatformBackfillService } from "../../../apps/api/src/modules/platform-analytics/application/platform-backfill.service";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`TEST ASSERTION FAILED: ${message}`);
  }
}

async function runTestSuite() {
  console.log("==================================================================");
  console.log("CAR HIRE OS — SPRINT 35 PLATFORM SAAS ANALYTICS TEST SUITE");
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
  const planRepo = new PlanRepository();
  const subRepo = new SubscriptionRepository();
  const tenantRepo = new TenantRepository();
  const membershipRepo = new TenantMembershipRepository();
  const vehicleRepo = new VehicleRepository();
  const invoiceRepo = new SaaSBillingInvoiceRepository();

  const snapshotRepo = new PlatformSnapshotRepository();
  const movementRepo = new MrrMovementRepository();
  const cohortRepo = new PlatformCohortRepository();
  const reportRepo = new PlatformReportRepository();

  // Instantiate Services
  const metricsService = new PlatformMetricsService({
    subscriptionRepo: subRepo,
    planRepo,
    tenantRepo,
    invoiceRepo,
    vehicleRepo,
    membershipRepo,
    snapshotRepo,
    movementRepo,
  });

  const movementService = new MrrMovementService({
    movementRepo,
    subRepo,
    planRepo,
  });

  const projectionService = new PlatformProjectionService({
    snapshotRepo,
    metricsService,
    movementRepo,
  });

  const cohortService = new PlatformCohortService({
    cohortRepo,
    subRepo,
    planRepo,
  });

  const reportingService = new PlatformReportingService({
    reportRepo,
    metricsService,
    movementRepo,
    subRepo,
    planRepo,
    invoiceRepo,
    vehicleRepo,
    cohortService,
  });

  const exportService = new PlatformExportService({
    reportingService,
    movementRepo,
    subRepo,
    planRepo,
  });

  const reconciliationService = new PlatformReconciliationService({
    subscriptionRepo: subRepo,
    planRepo,
    invoiceRepo,
    movementRepo,
  });

  const backfillService = new PlatformBackfillService({
    projectionService,
    snapshotRepo,
  });

  // ==========================================================================
  // Test 1: Platform Metric Registry & Canonical Definitions
  // ==========================================================================
  await test("1. Metric Registry exposes canonical SaaS platform definitions with correct categories", () => {
    const allMetrics = PlatformMetricRegistry.getAll();
    assert(allMetrics.length >= 20, `Expected at least 20 registered metrics, found ${allMetrics.length}`);

    const mrrDef = PlatformMetricRegistry.get("SAAS_MRR_TOTAL");
    assert(!!mrrDef, "SAAS_MRR_TOTAL metric must be registered");
    assert(mrrDef!.category === "REVENUE", "SAAS_MRR_TOTAL must belong to REVENUE category");
    assert(mrrDef!.unit === "CURRENCY", "SAAS_MRR_TOTAL must have CURRENCY unit");
    assert(mrrDef!.formula.includes("sum(MRR)"), "SAAS_MRR_TOTAL formula should document normalization");

    const arrDef = PlatformMetricRegistry.get("SAAS_ARR_TOTAL");
    assert(!!arrDef, "SAAS_ARR_TOTAL metric must be registered");
    assert(arrDef!.formula.includes("MRR * 12"), "ARR formula must be MRR * 12");

    const nrrDef = PlatformMetricRegistry.get("SAAS_NET_REVENUE_RETENTION");
    assert(!!nrrDef, "SAAS_NET_REVENUE_RETENTION metric must be registered");
    assert(nrrDef!.unit === "PERCENTAGE", "NRR must have PERCENTAGE unit");

    const revenueMetrics = PlatformMetricRegistry.getByCategory("REVENUE");
    assert(revenueMetrics.length >= 8, "Expected at least 8 revenue metrics");

    const tenantMetrics = PlatformMetricRegistry.getByCategory("TENANTS");
    assert(tenantMetrics.length >= 6, "Expected at least 6 tenant status metrics");
  });

  // ==========================================================================
  // Test 2: Normalized MRR Calculation Logic
  // ==========================================================================
  await test("2. Canonical MRR Normalization works across all billing intervals", () => {
    // Monthly: 10,000 -> 10,000
    const mrrMonthly = metricsService.calculateSubscriptionMrr(
      { amount: 10000, billingInterval: "MONTHLY" } as any,
      undefined
    );
    assert(mrrMonthly === 10000, `Expected 10000 for monthly, got ${mrrMonthly}`);

    // Annual: 120,000 -> 10,000
    const mrrAnnual = metricsService.calculateSubscriptionMrr(
      { amount: 120000, billingInterval: "ANNUAL" } as any,
      undefined
    );
    assert(mrrAnnual === 10000, `Expected 10000 for annual, got ${mrrAnnual}`);

    // Quarterly: 30,000 -> 10,000
    const mrrQuarterly = metricsService.calculateSubscriptionMrr(
      { amount: 30000, billingInterval: "QUARTERLY" } as any,
      undefined
    );
    assert(mrrQuarterly === 10000, `Expected 10000 for quarterly, got ${mrrQuarterly}`);

    // Weekly: 2,100 -> (2100 / 7) * (365 / 12) = 300 * 30.41666 = 9125
    const mrrWeekly = metricsService.calculateSubscriptionMrr(
      { amount: 2100, billingInterval: "WEEKLY" } as any,
      undefined
    );
    assert(Math.round(mrrWeekly) === 9125, `Expected 9125 for weekly, got ${mrrWeekly}`);
  });

  // ==========================================================================
  // Test 3: Setup Platform Seed Data (Plans, Tenants, Subscriptions)
  // ==========================================================================
  let tenant1Id = "tenant-sprint35-alpha";
  let tenant2Id = "tenant-sprint35-beta";
  let tenant3Id = "tenant-sprint35-gamma";

  let planStarterId = "plan-starter-tier";
  let planProId = "plan-pro-tier";

  await test("3. Setup platform tenants and subscription commercial baseline", async () => {
    // Seed Plans
    await planRepo.create({
      code: "STARTER_S35",
      name: "Starter Fleet Tier",
      description: "Up to 5 vehicles",
      currency: "KES",
      price: 5000,
      billingInterval: "MONTHLY",
      sortOrder: 1,
      maxVehicles: 5,
      maxMembers: 3,
    });
    const starter = await planRepo.findByCode("STARTER_S35");
    assert(!!starter, "Starter plan must exist");
    planStarterId = starter!.id;

    await planRepo.create({
      code: "PRO_S35",
      name: "Professional Fleet Tier",
      description: "Up to 25 vehicles",
      currency: "KES",
      price: 15000,
      billingInterval: "MONTHLY",
      sortOrder: 2,
      maxVehicles: 25,
      maxMembers: 10,
    });
    const pro = await planRepo.findByCode("PRO_S35");
    assert(!!pro, "Pro plan must exist");
    planProId = pro!.id;

    // Seed Tenants
    await tenantRepo.create({
      slug: "alpha-rentals",
      name: "Alpha Rentals Ltd",
      status: "ACTIVE",
      currency: "KES",
      planId: planStarterId,
    });
    const t1 = await tenantRepo.findBySlug("alpha-rentals");
    assert(!!t1, "Tenant 1 must exist");
    tenant1Id = t1!.id;

    await tenantRepo.create({
      slug: "beta-hire",
      name: "Beta Hire Ltd",
      status: "ACTIVE",
      currency: "KES",
      planId: planProId,
    });
    const t2 = await tenantRepo.findBySlug("beta-hire");
    assert(!!t2, "Tenant 2 must exist");
    tenant2Id = t2!.id;

    await tenantRepo.create({
      slug: "gamma-safaris",
      name: "Gamma Safaris Ltd",
      status: "ACTIVE",
      currency: "KES",
      planId: planStarterId,
    });
    const t3 = await tenantRepo.findBySlug("gamma-safaris");
    assert(!!t3, "Tenant 3 must exist");
    tenant3Id = t3!.id;

    // Seed Initial Subscriptions
    // Tenant 1 on Starter (5,000 KES/mo)
    await subRepo.create({
      tenantId: tenant1Id,
      planId: planStarterId,
      status: "ACTIVE",
      state: "ACTIVE",
      billingInterval: "MONTHLY",
      billingCycle: "MONTHLY",
      autoRenew: true,
      currency: "KES",
      amount: 5000,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    // Tenant 2 on Pro (15,000 KES/mo)
    await subRepo.create({
      tenantId: tenant2Id,
      planId: planProId,
      status: "ACTIVE",
      state: "ACTIVE",
      billingInterval: "MONTHLY",
      billingCycle: "MONTHLY",
      autoRenew: true,
      currency: "KES",
      amount: 15000,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    });

    // Tenant 3 in Trial (0 KES/mo)
    await subRepo.create({
      tenantId: tenant3Id,
      planId: planStarterId,
      status: "TRIAL",
      state: "TRIAL",
      billingInterval: "MONTHLY",
      billingCycle: "MONTHLY",
      autoRenew: true,
      currency: "KES",
      amount: 5000,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: new Date(Date.now() + 14 * 86400000).toISOString(),
    });
  });

  // ==========================================================================
  // Test 4: MRR Movement Recording & Transition Classifications
  // ==========================================================================
  await test("4. MRR Movement Service correctly records NEW, EXPANSION, CONTRACTION, and CHURN", async () => {
    // 1. Initial New Subscriptions
    const mov1 = await movementService.recordMovement({
      tenantId: tenant1Id,
      subscriptionId: "sub-alpha",
      movementType: "NEW_SUBSCRIPTION",
      previousPlanId: null,
      newPlanId: planStarterId,
      previousMrr: 0,
      newMrr: 5000,
      currency: "KES",
      reason: "Initial paid sign-up",
    });
    assert(mov1.mrrDelta === 5000, "New subscription delta must be +5000");

    const mov2 = await movementService.recordMovement({
      tenantId: tenant2Id,
      subscriptionId: "sub-beta",
      movementType: "NEW_SUBSCRIPTION",
      previousPlanId: null,
      newPlanId: planProId,
      previousMrr: 0,
      newMrr: 15000,
      currency: "KES",
      reason: "Initial paid sign-up",
    });
    assert(mov2.mrrDelta === 15000, "New subscription delta must be +15000");

    // 2. Tenant 1 upgrades from Starter (5,000) to Pro (15,000) -> EXPANSION
    const movExpansion = await movementService.recordMovement({
      tenantId: tenant1Id,
      subscriptionId: "sub-alpha",
      movementType: "EXPANSION",
      previousPlanId: planStarterId,
      newPlanId: planProId,
      previousMrr: 5000,
      newMrr: 15000,
      currency: "KES",
      reason: "Fleet expansion upgrade",
    });
    assert(movExpansion.mrrDelta === 10000, "Expansion delta must be +10000");

    // 3. Tenant 1 downgrades back to Starter (5,000) -> CONTRACTION
    const movContraction = await movementService.recordMovement({
      tenantId: tenant1Id,
      subscriptionId: "sub-alpha",
      movementType: "CONTRACTION",
      previousPlanId: planProId,
      newPlanId: planStarterId,
      previousMrr: 15000,
      newMrr: 5000,
      currency: "KES",
      reason: "Seasonal fleet size reduction",
    });
    assert(movContraction.mrrDelta === -10000, "Contraction delta must be -10000");

    // 4. Tenant 2 churns -> CHURN
    const movChurn = await movementService.recordMovement({
      tenantId: tenant2Id,
      subscriptionId: "sub-beta",
      movementType: "CHURN",
      previousPlanId: planProId,
      newPlanId: null,
      previousMrr: 15000,
      newMrr: 0,
      currency: "KES",
      reason: "Customer cancelled subscription",
    });
    assert(movChurn.mrrDelta === -15000, "Churn delta must be -15000");

    // Check waterfall net delta
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const waterfall = await movementRepo.getNetMrrDeltaForPeriod(startOfMonth, endOfMonth, "KES");
    assert(waterfall.newMrr === 20000, `Expected new MRR = 20,000, got ${waterfall.newMrr}`);
    assert(waterfall.expansionMrr === 10000, `Expected expansion MRR = 10,000, got ${waterfall.expansionMrr}`);
    assert(waterfall.contractionMrr === 10000, `Expected contraction MRR = 10,000, got ${waterfall.contractionMrr}`);
    assert(waterfall.churnMrr === 15000, `Expected churn MRR = 15,000, got ${waterfall.churnMrr}`);
    assert(waterfall.netMrrDelta === 5000, `Expected net delta = 5,000 (20k + 10k - 10k - 15k), got ${waterfall.netMrrDelta}`);
  });

  // ==========================================================================
  // Test 5: Multi-Currency Isolation
  // ==========================================================================
  await test("5. Multi-Currency Isolation prevents mixing USD and KES totals", async () => {
    // Record a USD movement
    await movementService.recordMovement({
      tenantId: "tenant-us-01",
      subscriptionId: "sub-us-01",
      movementType: "NEW_SUBSCRIPTION",
      previousPlanId: null,
      newPlanId: "plan-us-pro",
      previousMrr: 0,
      newMrr: 199,
      currency: "USD",
      reason: "US expansion client",
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    const usdDelta = await movementRepo.getNetMrrDeltaForPeriod(startOfMonth, endOfMonth, "USD");
    assert(usdDelta.newMrr === 199, `USD new MRR must be 199, got ${usdDelta.newMrr}`);

    const kesDelta = await movementRepo.getNetMrrDeltaForPeriod(startOfMonth, endOfMonth, "KES");
    assert(kesDelta.newMrr === 20000, `KES new MRR must remain unchanged at 20000, got ${kesDelta.newMrr}`);
  });

  // ==========================================================================
  // Test 6: Executive SaaS KPI Overview & Aggregation
  // ==========================================================================
  await test("6. Executive SaaS KPI Overview generates correct MRR, ARR, ARPU and tenant counts", async () => {
    const overview = await metricsService.getExecutiveOverview("KES");
    assert(overview.currency === "KES", "Currency must be KES");
    assert(overview.mrrTotal >= 5000, `MRR Total should reflect active subscriptions, got ${overview.mrrTotal}`);
    assert(overview.arrTotal === overview.mrrTotal * 12, `ARR Total must equal MRR * 12, got ${overview.arrTotal}`);
    assert(overview.activePaidTenants >= 1, "Must report active paid tenants");
    assert(overview.trialTenants >= 1, "Must report trial tenants");
    assert(overview.planDistribution.length >= 2, "Must report plan performance distribution");
  });

  // ==========================================================================
  // Test 7: Billing Health & Aging Buckets
  // ==========================================================================
  await test("7. Billing Health accurately compiles collection rate, outstanding AR, and aging buckets", async () => {
    // Seed SaaS Invoices
    const now = new Date();
    await invoiceRepo.create({
      tenantId: tenant1Id,
      subscriptionId: "sub-alpha",
      currency: "KES",
      subtotal: 5000,
      tax: 800,
      total: 5800,
      amountPaid: 5800,
      amountDue: 0,
      status: "PAID",
      issuedAt: now.toISOString(),
      dueAt: now.toISOString(),
    });

    await invoiceRepo.create({
      tenantId: tenant2Id,
      subscriptionId: "sub-beta",
      currency: "KES",
      subtotal: 15000,
      tax: 2400,
      total: 17400,
      amountPaid: 0,
      amountDue: 17400,
      status: "OPEN",
      issuedAt: new Date(Date.now() - 20 * 86400000).toISOString(),
      dueAt: new Date(Date.now() - 10 * 86400000).toISOString(), // 10 days overdue -> bucket 1-15d
    });

    const health = await metricsService.getBillingHealth("KES");
    assert(health.totalInvoiced === 23200, `Expected total invoiced = 23200, got ${health.totalInvoiced}`);
    assert(health.totalCollected === 5800, `Expected total collected = 5800, got ${health.totalCollected}`);
    assert(health.outstandingAr === 17400, `Expected outstanding AR = 17400, got ${health.outstandingAr}`);
    assert(health.collectionRate === 25, `Expected collection rate = 25%, got ${health.collectionRate}%`);

    // Aging Bucket check
    const bucket1to15 = health.agingBuckets.find((b) => b.bucket === "1-15d");
    assert(!!bucket1to15 && bucket1to15.invoiceCount === 1, "1-15d aging bucket should have 1 invoice");
    assert(bucket1to15!.totalAmount === 17400, "1-15d aging bucket amount should be 17400");
  });

  // ==========================================================================
  // Test 8: Platform Projections & Daily Snapshots
  // ==========================================================================
  await test("8. Platform Projection Service takes daily snapshots and guarantees idempotency", async () => {
    const today = new Date().toISOString().split("T")[0];

    const snapshot = await projectionService.takeDailySnapshot(today, "KES");
    assert(snapshot.snapshotDate === today, `Snapshot date must match ${today}`);
    assert(snapshot.currency === "KES", "Snapshot currency must be KES");
    assert(snapshot.activePaidTenants >= 1, "Snapshot must record active paid tenants");

    // Take snapshot again for the same date -> should update idempotently, not duplicate
    const updatedSnapshot = await projectionService.takeDailySnapshot(today, "KES");
    assert(updatedSnapshot.id === snapshot.id, "Re-running snapshot for same date must update existing record");

    const retrieved = await snapshotRepo.findByDate(today, "KES");
    assert(!!retrieved, "Snapshot must be retrievable by date");
    assert(retrieved!.id === snapshot.id, "Retrieved ID must match original snapshot ID");
  });

  // ==========================================================================
  // Test 9: Cohort Retention & Churn Analysis
  // ==========================================================================
  await test("9. Platform Cohort Service generates acquisition cohorts with retention matrix", async () => {
    const cohorts = await cohortService.generateCohorts();
    assert(Array.isArray(cohorts), "Cohorts result must be an array");

    if (cohorts.length > 0) {
      const first = cohorts[0];
      assert(typeof first.cohortMonth === "string", "Cohort month must be string YYYY-MM");
      assert(first.initialTenantCount! >= 1, "Cohort initial tenant count must be >= 1");
      assert(first.retentionPeriods!.length >= 1, "Retention periods array must have entries");
      assert(first.retentionPeriods![0].periodIndex === 0, "Period index 0 must exist");
      assert(first.retentionPeriods![0].retentionRate === 100, "Period index 0 retention rate is 100%");
    }
  });

  // ==========================================================================
  // Test 10: Canonical Platform Reports & Query Engine
  // ==========================================================================
  await test("10. Canonical Platform Reports execute with pagination, sorting, and schema definitions", async () => {
    const registeredReports = PlatformReportRegistry.getAll();
    assert(registeredReports.length >= 6, `Expected at least 6 canonical reports, found ${registeredReports.length}`);

    // Execute MRR Waterfall report
    const waterfallResult = await reportingService.executeReport("MRR_WATERFALL", {
      currency: "KES",
      limit: 10,
    });
    assert(waterfallResult.reportKey === "MRR_WATERFALL", "Report key must be MRR_WATERFALL");
    assert(waterfallResult.columns!.length >= 7, "MRR_WATERFALL must have all schema columns");
    assert(Array.isArray(waterfallResult.rows), "Rows must be an array");

    // Execute Billing Collection Aging report
    const agingResult = await reportingService.executeReport("BILLING_COLLECTION_AGING", {
      currency: "KES",
    });
    assert(agingResult.reportKey === "BILLING_COLLECTION_AGING", "Report key must be BILLING_COLLECTION_AGING");
    assert(agingResult.rows!.length >= 5, "Must have rows for each aging bucket");

    // Execute Plan Performance report
    const planResult = await reportingService.executeReport("PLAN_PERFORMANCE", {
      currency: "KES",
    });
    assert(planResult.reportKey === "PLAN_PERFORMANCE", "Report key must be PLAN_PERFORMANCE");
    assert(planResult.rows!.length >= 2, "Must have rows for Starter and Pro plans");
  });

  // ==========================================================================
  // Test 11: Export Engine & CSV Injection Sanitization (OWASP)
  // ==========================================================================
  await test("11. Platform Export Service generates sanitized CSV preventing formula injection", async () => {
    // Record a movement with a potentially malicious formula in reason
    await movementService.recordMovement({
      tenantId: tenant1Id,
      subscriptionId: "sub-malicious",
      movementType: "NEW_SUBSCRIPTION",
      previousPlanId: null,
      newPlanId: planStarterId,
      previousMrr: 0,
      newMrr: 5000,
      currency: "KES",
      reason: "=cmd|' /C calc'!A0", // DDE injection attempt
    });

    const csvContent = await exportService.exportReportCsv("MRR_WATERFALL", { currency: "KES" });
    assert(typeof csvContent === "string", "CSV content must be string");
    assert(csvContent.includes("Movement ID"), "CSV should include header columns");
    // Ensure the formula injection has been neutralized with leading single quote
    assert(!csvContent.includes(",=cmd|"), "Formula injection must not start unquoted with =");
    assert(csvContent.includes("'=cmd|"), "Formula injection must be safely prefixed with single quote");
  });

  // ==========================================================================
  // Test 12: Reconciliation & Data Integrity Audit
  // ==========================================================================
  await test("12. Platform Reconciliation Service audits SaaS subscriptions against MRR movements and invoices", async () => {
    const reconciliation = await reconciliationService.reconcile("KES");
    assert(reconciliation.currency === "KES", "Reconciliation currency must be KES");
    assert(typeof reconciliation.subscriptionTotalMrr === "number", "Total MRR must be number");
    assert(typeof reconciliation.reconciled === "boolean", "Reconciled status must be boolean");
    assert(Array.isArray(reconciliation.discrepancies), "Discrepancies must be an array");
  });

  // ==========================================================================
  // Test 13: Historical Backfill
  // ==========================================================================
  await test("13. Platform Backfill Service backfills historical daily snapshots", async () => {
    const fromDate = "2026-09-01";
    const toDate = "2026-09-03";

    const backfillResult = await backfillService.runBackfill(fromDate, toDate, "KES");
    assert(backfillResult.daysProcessed === 3, `Expected 3 days processed, got ${backfillResult.daysProcessed}`);
    assert(backfillResult.snapshotsCreated >= 1, "Snapshots should have been created/updated");

    const s1 = await snapshotRepo.findByDate("2026-09-01", "KES");
    const s2 = await snapshotRepo.findByDate("2026-09-02", "KES");
    const s3 = await snapshotRepo.findByDate("2026-09-03", "KES");

    assert(!!s1 && !!s2 && !!s3, "Snapshots for all backfilled days must exist");
  });

  // ==========================================================================
  // Final Test Results Summary
  // ==========================================================================
  console.log("==================================================================");
  console.log(`SPRINT 35 TEST SUITE RESULTS: ${passed}/${total} PASSED`);
  console.log("==================================================================");

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("FATAL ERROR IN SPRINT 35 TEST SUITE:", err);
  process.exit(1);
});
