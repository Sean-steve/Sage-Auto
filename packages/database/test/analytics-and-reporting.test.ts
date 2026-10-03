// ============================================================================
// CAR HIRE OS — SPRINT 34 INTEGRATION TEST SUITE:
// TENANT ANALYTICS, OPERATIONAL KPI ENGINE, FINANCIAL REPORTING, FLEET PERFORMANCE,
// SALES FUNNELS, EXPORTS & REPORTING READ MODELS
// ============================================================================

import { strict as assert } from "node:assert";
import {
  VehicleRepository,
  BookingRepository,
  RentalRepository,
  PaymentRepository,
  OperationalInvoiceRepository,
  JournalEntryRepository,
  JournalTransactionRepository,
  LeadRepository,
  SalesQuoteRepository,
  MaintenanceRepository,
  ComplianceRecordRepository,
  CustomerRepository,
  CorporateAccountRepository,
  DepositPositionRepository,
  RefundRepository,
  OwnerSettlementRepository,
  ReportExecutionRepository,
  SavedReportRepository,
  ReportScheduleRepository,
  ReportingProjectionRepository,
} from "../src/index";
import { MetricsService } from "../../../apps/api/src/modules/analytics/application/metrics.service";
import { DashboardService } from "../../../apps/api/src/modules/analytics/application/dashboard.service";
import { ReportingService } from "../../../apps/api/src/modules/analytics/application/reporting.service";
import { ReportExportService } from "../../../apps/api/src/modules/analytics/application/report-export.service";
import { ReportScheduleService } from "../../../apps/api/src/modules/analytics/application/report-schedule.service";
import { ReportingProjectionService } from "../../../apps/api/src/modules/analytics/application/projection.service";
import { ReconciliationService } from "../../../apps/api/src/modules/analytics/application/reconciliation.service";
import { BackfillService } from "../../../apps/api/src/modules/analytics/application/backfill.service";
import { MetricRegistry } from "../../../apps/api/src/modules/analytics/domain/metric-registry";
import { ReportRegistry } from "../../../apps/api/src/modules/analytics/domain/report-registry";
import { CsvSanitizer, sanitizeCsvValue, sanitizeCsvRow } from "../../../apps/api/src/modules/analytics/domain/csv-sanitizer";

async function runSprint34TestSuite() {
  console.log("======================================================================");
  console.log("RUNNING SPRINT 34: TENANT ANALYTICS & REPORTING PLATFORM TEST SUITE");
  console.log("======================================================================");

  const tenantAId = "11111111-1111-1111-1111-111111111111";
  const tenantBId = "22222222-2222-2222-2222-222222222222";
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // Initialize Repositories
  const vehicleRepo = new VehicleRepository();
  const bookingRepo = new BookingRepository();
  const rentalRepo = new RentalRepository();
  const paymentRepo = new PaymentRepository();
  const invoiceRepo = new OperationalInvoiceRepository();
  const journalEntryRepo = new JournalEntryRepository();
  const journalTxRepo = new JournalTransactionRepository();
  const leadRepo = new LeadRepository();
  const quoteRepo = new SalesQuoteRepository();
  const maintenanceRepo = new MaintenanceRepository();
  const complianceRepo = new ComplianceRecordRepository();
  const customerRepo = new CustomerRepository();
  const corporateRepo = new CorporateAccountRepository();
  const depositRepo = new DepositPositionRepository();
  const refundRepo = new RefundRepository();
  const settlementRepo = new OwnerSettlementRepository();

  const reportExecutionRepo = new ReportExecutionRepository();
  const savedReportRepo = new SavedReportRepository();
  const reportScheduleRepo = new ReportScheduleRepository();
  const projectionRepo = new ReportingProjectionRepository();

  // Clear static stores
  VehicleRepository.clear();
  BookingRepository.clear();
  RentalRepository.clear();
  PaymentRepository.clear();
  OperationalInvoiceRepository.clear();
  JournalEntryRepository.clear();
  JournalTransactionRepository.clear();
  CustomerRepository.clear();
  CorporateAccountRepository.clear();

  // Initialize Application Services
  const metricsService = new MetricsService(
    vehicleRepo,
    bookingRepo,
    rentalRepo,
    paymentRepo,
    invoiceRepo,
    journalEntryRepo,
    journalTxRepo,
    leadRepo,
    quoteRepo,
    maintenanceRepo,
    complianceRepo,
    customerRepo,
    corporateRepo,
    depositRepo,
    refundRepo,
    settlementRepo
  );

  const dashboardService = new DashboardService(
    metricsService,
    vehicleRepo,
    bookingRepo,
    rentalRepo,
    paymentRepo,
    invoiceRepo,
    leadRepo,
    quoteRepo,
    complianceRepo,
    journalEntryRepo
  );

  const reportingService = new ReportingService(
    vehicleRepo,
    bookingRepo,
    rentalRepo,
    invoiceRepo,
    paymentRepo,
    journalEntryRepo,
    settlementRepo,
    maintenanceRepo,
    complianceRepo,
    leadRepo,
    customerRepo
  );

  const reportExportService = new ReportExportService(
    reportExecutionRepo,
    reportingService
  );

  const scheduleService = new ReportScheduleService(
    reportScheduleRepo,
    reportExportService
  );

  const projectionService = new ReportingProjectionService(projectionRepo);

  const reconciliationService = new ReconciliationService(
    journalEntryRepo,
    paymentRepo,
    invoiceRepo,
    settlementRepo
  );

  const backfillService = new BackfillService(
    projectionRepo,
    vehicleRepo,
    bookingRepo,
    rentalRepo,
    invoiceRepo,
    paymentRepo
  );

  // --------------------------------------------------------------------------
  // Seed Tenant A Operational Data
  // --------------------------------------------------------------------------
  console.log("▶ Seeding Tenant A Operational & Financial Data...");

  // 1. Vehicles
  const v1 = await vehicleRepo.create({
    tenantId: tenantAId,
    registrationPlate: "KDA-101A",
    vin: "VIN11111111111111",
    make: "Toyota",
    model: "Prado TX",
    year: 2023,
    color: "Pearl White",
    fuelType: "DIESEL",
    transmission: "AUTOMATIC",
    seatingCapacity: 7,
    initialOdometer: 15000,
    currentOdometer: 18500,
    engineCapacityCc: 2800,
    ownershipType: "COMPANY_OWNED",
    lifecycleStatus: "ACTIVE",
    category: "SUV",
  } as any);

  const v2 = await vehicleRepo.create({
    tenantId: tenantAId,
    registrationPlate: "KDB-202B",
    vin: "VIN22222222222222",
    make: "Toyota",
    model: "RAV4",
    year: 2024,
    color: "Silver",
    fuelType: "PETROL",
    transmission: "AUTOMATIC",
    seatingCapacity: 5,
    initialOdometer: 8000,
    currentOdometer: 11000,
    ownershipType: "PARTNER_OWNED",
    lifecycleStatus: "ACTIVE",
    category: "Crossover",
  } as any);

  // Mark v1 as ON_RENT
  await vehicleRepo.update(v1.id, tenantAId, { availabilityStatus: "ON_RENT" });

  // 2. Customers
  const cust1 = await customerRepo.create({
    tenantId: tenantAId,
    fullName: "Amina Mwangi",
    email: "amina.mwangi@example.com",
    phone: "+254711223344",
    idOrPassportNumber: "ID98765432",
    licenseNumber: "DL-998877",
    customerType: "INDIVIDUAL",
  } as any);

  // 3. Bookings
  const b1 = await bookingRepo.create(tenantAId, {
    bookingNumber: "BKG-2026-001001",
    customerId: cust1.id,
    requestedVehicleCategoryId: "SUV",
    pickupLocationId: "LOC-NBO-01",
    returnLocationId: "LOC-NBO-01",
    pickupAt: "2026-09-01T08:00:00Z",
    returnAt: "2026-09-07T18:00:00Z",
    pricingSnapshot: {} as any,
    grossTotal: 75000,
    netRentalSubtotal: 65000,
    depositRequired: 20000,
    taxAmount: 10000,
    initialStatus: "CONFIRMED",
  });

  // 4. Rentals
  const r1 = await rentalRepo.create(tenantAId, {
    rentalNumber: "RNT-2026-001001",
    bookingId: b1.id,
    contractId: "CTR-2026-001001",
    handoverId: "HND-2026-001001",
    customerId: cust1.id,
    primaryDriverId: cust1.id,
    vehicleId: v1.id,
    status: "ACTIVE",
    scheduledStart: "2026-09-01T08:00:00Z",
    scheduledReturnAt: "2026-09-07T18:00:00Z",
    actualStart: "2026-09-01T08:30:00Z",
    checkoutOdometer: 15000,
    checkoutFuelLevel: 100,
    pricingSnapshot: {} as any,
  } as any);

  // 5. Invoices
  const inv1 = await invoiceRepo.create({
    tenantId: tenantAId,
    invoiceNumber: "INV-2026-001001",
    customerId: cust1.id,
    rentalId: r1.id,
    status: "PAID",
    issueDate: "2026-09-01",
    dueDate: "2026-09-07",
    currency: "KES",
    subtotal: "65000.00",
    taxTotal: "10000.00",
    discountTotal: "0.00",
    total: "75000.00",
    amountPaid: "75000.00",
    amountOutstanding: "0.00",
    amountCredited: "0.00",
    lineItems: [],
    billingSnapshot: { customerName: cust1.fullName, customerEmail: cust1.email },
  });

  const inv2Open = await invoiceRepo.create({
    tenantId: tenantAId,
    invoiceNumber: "INV-2026-001002",
    customerId: cust1.id,
    status: "ISSUED",
    issueDate: "2026-08-01",
    dueDate: "2026-08-15",
    currency: "KES",
    subtotal: "40000.00",
    taxTotal: "6400.00",
    discountTotal: "0.00",
    total: "46400.00",
    amountPaid: "0.00",
    amountOutstanding: "46400.00",
    amountCredited: "0.00",
    lineItems: [],
    billingSnapshot: { customerName: cust1.fullName, customerEmail: cust1.email },
  });

  // 6. Payments
  await paymentRepo.create({
    tenantId: tenantAId,
    paymentMethod: "MPESA",
    amount: "75000.00",
    currency: "KES",
    status: "VERIFIED",
    payerReference: cust1.fullName,
    provider: "MPESA_C2B",
    providerTransactionId: "NLJ893KJD9",
    paidAt: "2026-09-01T09:00:00Z",
  } as any);

  // 7. Balanced General Ledger Lines
  await journalEntryRepo.createMany([
    {
      tenantId: tenantAId,
      transactionId: "TX-GL-001",
      accountId: "ACC-1010",
      accountCode: "1010",
      accountName: "Cash and Bank Accounts",
      direction: "DEBIT",
      amount: "75000.00",
      sortOrder: 1,
    },
    {
      tenantId: tenantAId,
      transactionId: "TX-GL-001",
      accountId: "ACC-4010",
      accountCode: "4010",
      accountName: "Rental Fleet Revenue",
      direction: "CREDIT",
      amount: "65000.00",
      sortOrder: 2,
    },
    {
      tenantId: tenantAId,
      transactionId: "TX-GL-001",
      accountId: "ACC-2020",
      accountCode: "2020",
      accountName: "Output VAT Payable",
      direction: "CREDIT",
      amount: "10000.00",
      sortOrder: 3,
    },
  ]);

  // 8. Maintenance Work Order
  const wo = await maintenanceRepo.create(tenantAId, {
    vehicleId: v2.id,
    workOrderNumber: "WO-2026-0001",
    maintenanceType: "PREVENTATIVE",
    priority: "MEDIUM",
    reason: "Scheduled 10,000 km Service",
    garageId: "GARAGE-CENTRAL",
    requestedBy: "usr_fleet_mgr_01",
    actualCost: 12500,
    estimatedCost: 12500,
    currency: "KES",
    tasks: [],
  } as any);

  // Update status to COMPLETED with actualCost and completedAt
  await maintenanceRepo.update(wo.id, tenantAId, {
    status: "COMPLETED",
    actualCost: 12500,
    completedAt: "2026-09-05T14:00:00Z",
  } as any);

  // 9. Compliance Record
  await complianceRepo.create({
    tenantId: tenantAId,
    requirementId: "REQ-INS-01",
    requirementCode: "COMMERCIAL_INSURANCE",
    subjectType: "VEHICLE",
    subjectId: v1.id,
    status: "VALID",
    verificationStatus: "VERIFIED",
    validFrom: "2026-01-01",
    expiresAt: "2026-12-31",
    identifierNumber: "INS-POL-2026-99",
  } as any);

  // 10. CRM Lead
  await leadRepo.save({
    id: "lead-001",
    tenantId: tenantAId,
    leadNumber: "LEAD-2026-0001",
    type: "INDIVIDUAL",
    status: "QUALIFIED",
    firstName: "Juma",
    lastName: "Ochieng",
    email: "juma.ochieng@safari.com",
    source: "WEBSITE_ENQUIRY",
    estimatedValue: 120000,
    currency: "KES",
    confidenceScore: 80,
    marketingConsent: true,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  console.log("  ✓ Operational dataset seeded successfully.");

  // ==========================================================================
  // Test 1: Metric Registry Catalogue
  // ==========================================================================
  console.log("\n▶ Test 1: Metric Registry Catalogue & Formal Definitions...");
  const registryDefinitions = MetricRegistry.getAll();
  assert.ok(registryDefinitions.length >= 25, "Metric registry should expose comprehensive catalog of KPIs");

  const utilDef = MetricRegistry.get("FLEET_UTILIZATION_RATE");
  assert.ok(utilDef, "FLEET_UTILIZATION_RATE must exist");
  assert.equal(utilDef.sourceDomain, "FLEET");
  assert.equal(utilDef.unit, "PERCENTAGE");
  assert.ok(utilDef.description.length > 10);
  assert.ok(utilDef.formula.length > 5);

  const fleetMetrics = MetricRegistry.getByDomain("FLEET");
  assert.ok(fleetMetrics.length >= 4, "Should have multiple fleet metrics");

  const financeMetrics = MetricRegistry.getByDomain("FINANCE");
  assert.ok(financeMetrics.some((m) => m.key === "FINANCE_GROSS_INVOICED"), "FINANCE_GROSS_INVOICED exists in FINANCE domain");
  console.log(`  ✓ [PASS] 1. Metric registry validated (${registryDefinitions.length} KPIs registered).`);

  // ==========================================================================
  // Test 2: KPI Engine & Metric Evaluation
  // ==========================================================================
  console.log("\n▶ Test 2: KPI Engine & Time Window Metric Evaluation...");
  const utilMetric = await metricsService.evaluateMetric(tenantAId, {
    key: "FLEET_UTILIZATION_RATE",
    from: "2026-09-01",
    to: "2026-09-30",
  });
  assert.equal(utilMetric.key, "FLEET_UTILIZATION_RATE");
  assert.equal(utilMetric.unit, "PERCENTAGE");
  // 1 out of 2 active vehicles is ON_RENT = 50%
  assert.equal(utilMetric.value, 50);

  const invMetric = await metricsService.evaluateMetric(tenantAId, {
    key: "FINANCE_GROSS_INVOICED",
    from: "2026-09-01",
    to: "2026-09-30",
  });
  assert.ok((invMetric.value as number) > 0, "FINANCE_GROSS_INVOICED calculated based on invoices");

  // Test batch evaluation
  const [totalFleetSize, activeFleet, fleetOnRent] = await Promise.all([
    metricsService.evaluateMetric(tenantAId, { key: "FLEET_TOTAL_VEHICLES" }),
    metricsService.evaluateMetric(tenantAId, { key: "FLEET_ACTIVE_VEHICLES" }),
    metricsService.evaluateMetric(tenantAId, { key: "FLEET_ON_RENT_VEHICLES" }),
  ]);
  assert.equal(totalFleetSize.value, 2);
  assert.equal(activeFleet.value, 2);
  assert.equal(fleetOnRent.value, 1);
  console.log("  ✓ [PASS] 2. Single and batch KPI evaluation verified with correct mathematical values.");

  // ==========================================================================
  // Test 3: Executive & Operational Dashboards
  // ==========================================================================
  console.log("\n▶ Test 3: Executive Dashboard Overview Aggregation...");
  const overview = await dashboardService.getDashboardOverview(tenantAId);
  assert.ok(overview.headlineKpis.utilizationRate !== undefined, "Dashboard provides primary executive KPI cards");
  assert.equal(overview.fleetStatus.total, 2);
  assert.equal(overview.fleetStatus.onRent, 1);
  assert.equal(overview.fleetStatus.available, 1);
  assert.ok(overview.recentActivity.length >= 1, "Recent operational activities populated");
  console.log("  ✓ [PASS] 3. Executive Dashboard aggregates cross-domain status accurately.");

  // ==========================================================================
  // Test 4: Report Catalogue & Canonical Report Definitions
  // ==========================================================================
  console.log("\n▶ Test 4: Report Catalogue Registry...");
  const reportDefs = ReportRegistry.getAll();
  assert.equal(reportDefs.length, 14, "Canonical catalogue must contain all 14 required reports");

  const fleetRepDef = ReportRegistry.get("REPORT_FLEET_PERFORMANCE");
  assert.ok(fleetRepDef);
  assert.equal(fleetRepDef.category, "FLEET");
  const columnKeys = fleetRepDef.columns.map((c) => c.key);
  assert.ok(columnKeys.includes("category"));
  assert.ok(columnKeys.includes("utilizationRate"));
  console.log("  ✓ [PASS] 4. Report Catalogue verified with 14 canonical business reports.");

  // ==========================================================================
  // Test 5: Report Query Engine & Summaries
  // ==========================================================================
  console.log("\n▶ Test 5: Report Query Execution (Fleet, Revenue, Aging)...");

  // Fleet performance report
  const fleetReport = await reportingService.executeReport(tenantAId, "REPORT_FLEET_PERFORMANCE", {
    from: "2026-09-01",
    to: "2026-09-30",
  });
  assert.equal(fleetReport.reportKey, "REPORT_FLEET_PERFORMANCE");
  assert.ok(fleetReport.rows.length >= 2, "Includes rows for categories");
  assert.equal(fleetReport.summary.totalFleetSize, 2);

  // Revenue & Billing report
  const revReport = await reportingService.executeReport(tenantAId, "REPORT_REVENUE_BILLING", {
    from: "2026-09-01",
    to: "2026-09-30",
  });
  assert.equal(revReport.rows.length, 1, "Includes paid invoice 1");
  assert.equal(revReport.summary.grossTotalInvoiced, 75000);

  // Receivables Aging report
  const agingReport = await reportingService.executeReport(tenantAId, "REPORT_RECEIVABLES_AGING");
  assert.equal(agingReport.rows.length, 1, "Contains open invoice 2");
  assert.equal(agingReport.summary.totalOutstandingReceivables, 46400);
  assert.equal(agingReport.reconciliation?.status, "RECONCILED");
  console.log("  ✓ [PASS] 5. Report query engine executed with domain aggregations and summaries.");

  // ==========================================================================
  // Test 6: General Ledger Double-Entry Equilibrium & Reconciliation
  // ==========================================================================
  console.log("\n▶ Test 6: General Ledger Reconciliation & Equilibrium Detection...");
  const glReport = await reportingService.executeReport(tenantAId, "REPORT_GENERAL_LEDGER");
  assert.equal(glReport.summary.totalLines, 3);
  assert.equal(glReport.summary.totalDebits, 75000);
  assert.equal(glReport.summary.totalCredits, 75000);
  assert.equal(glReport.summary.isBalanced, true);
  assert.equal(glReport.reconciliation?.status, "RECONCILED");

  const trialBalance = await reportingService.executeReport(tenantAId, "REPORT_TRIAL_BALANCE");
  assert.equal(trialBalance.summary.equilibrium, true);
  assert.equal(trialBalance.reconciliation?.status, "RECONCILED");

  // Verify ReconciliationService
  const reconStatus = await reconciliationService.runAudit(tenantAId);
  assert.equal(reconStatus.overallStatus, "RECONCILED");
  assert.equal(reconStatus.checks.generalLedgerEquilibrium.status, "PASS");
  console.log("  ✓ [PASS] 6. Double-entry ledger equilibrium strictly confirmed.");

  // ==========================================================================
  // Test 7: CSV Formula Injection Defense
  // ==========================================================================
  console.log("\n▶ Test 7: CSV Formula Injection Defense (DEV-009)...");
  // Malicious strings starting with =, +, -, @, tab, newline
  const dangerousValues = [
    "=CMD|' /C calc'!A0",
    "+123456789",
    "-2+5+cmd",
    "@SUM(A1:A10)",
    "\tmalicious_tab",
  ];

  for (const dangerous of dangerousValues) {
    const sanitized = CsvSanitizer.sanitizeCell(dangerous);
    assert.ok(
      sanitized.startsWith("'"),
      `Sanitized value for [${dangerous}] must be safely prefixed with single quote: got [${sanitized}]`
    );
  }

  // Safe strings should not be unnecessarily prefixed
  const safeText = "Standard Fleet Toyota Prado";
  assert.equal(CsvSanitizer.sanitizeCell(safeText), "Standard Fleet Toyota Prado");

  console.log("  ✓ [PASS] 7. CSV formula injection defense strictly neutralizes active spreadsheet exploits.");

  // ==========================================================================
  // Test 8: Asynchronous Report Export Processing & Artifact Persistence
  // ==========================================================================
  console.log("\n▶ Test 8: Report Export Engine (CSV & XLSX Generation)...");
  const exportReq = await reportExportService.requestReportExport(
    tenantAId,
    "REPORT_FLEET_PERFORMANCE",
    "CSV",
    { from: "2026-09-01", to: "2026-09-30" },
    "usr_fleet_mgr_01"
  );

  assert.ok(exportReq.id);
  assert.equal(exportReq.format, "CSV");

  // Allow async worker tick to complete
  await new Promise((r) => setTimeout(r, 100));

  const completedExport = await reportExportService.getExecution(exportReq.id, tenantAId);
  assert.ok(completedExport);
  assert.equal(completedExport.status, "COMPLETED");
  assert.ok((completedExport.rowCount || 0) >= 2);
  assert.ok((completedExport.fileSize || 0) > 0);
  assert.ok(completedExport.rawContent, "rawContent must be persisted in export execution");
  assert.ok(completedExport.rawContent.includes("Vehicle Category"));

  // Verify XLSX/spreadsheet-compatible export
  const xlsxExportReq = await reportExportService.requestReportExport(
    tenantAId,
    "REPORT_REVENUE_BILLING",
    "XLSX",
    { from: "2026-09-01", to: "2026-09-30" },
    "usr_fin_dir_01"
  );
  await new Promise((r) => setTimeout(r, 100));

  const completedXlsxExport = await reportExportService.getExecution(xlsxExportReq.id, tenantAId);
  assert.ok(completedXlsxExport);
  assert.equal(completedXlsxExport.status, "COMPLETED");
  assert.equal(completedXlsxExport.format, "XLSX");
  assert.equal(completedXlsxExport.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  console.log("  ✓ [PASS] 8. Asynchronous export processing, CSV & XLSX artifacts verified.");

  // ==========================================================================
  // Test 9: Saved Reports CRUD
  // ==========================================================================
  console.log("\n▶ Test 9: Saved Report Views & Filter Configurations...");
  const saved = await savedReportRepo.create({
    tenantId: tenantAId,
    reportKey: "REPORT_FLEET_PERFORMANCE",
    name: "Monthly Executive Fleet View",
    description: "Filtered by active SUVs and crossovers",
    filters: { filters: { category: "SUV" } },
    isShared: false,
    createdBy: "usr_fleet_mgr_01",
  });

  assert.equal(saved.name, "Monthly Executive Fleet View");
  assert.equal(saved.tenantId, tenantAId);

  const listSaved = await savedReportRepo.listByTenant(tenantAId);
  assert.equal(listSaved.length, 1);
  assert.equal(listSaved[0].id, saved.id);

  await savedReportRepo.delete(saved.id, tenantAId);
  const afterDelete = await savedReportRepo.listByTenant(tenantAId);
  assert.equal(afterDelete.length, 0);
  console.log("  ✓ [PASS] 9. Custom saved report presets created, queried, and removed.");

  // ==========================================================================
  // Test 10: Scheduled Reports & Automated Triggers
  // ==========================================================================
  console.log("\n▶ Test 10: Automated Report Scheduling...");
  const schedule = await scheduleService.createSchedule(tenantAId, {
    reportKey: "REPORT_REVENUE_BILLING",
    frequency: "WEEKLY",
    format: "CSV",
    recipientEmails: ["finance.lead@carhire.com"],
    filterSnapshot: { currency: "KES" },
    createdById: "usr_fin_dir_01",
  });

  assert.equal(schedule.frequency, "WEEKLY");
  assert.equal(schedule.recipients[0], "finance.lead@carhire.com");
  assert.equal(schedule.enabled, true);

  const schedules = await scheduleService.listSchedules(tenantAId);
  assert.equal(schedules.length, 1);

  // Trigger due schedules processing
  const processedCount = await scheduleService.processDueSchedules(new Date(Date.now() + 86400000 * 8).toISOString());
  assert.ok(processedCount >= 1, "Due schedule was processed");
  console.log("  ✓ [PASS] 10. Report schedules configured and triggered.");

  // ==========================================================================
  // Test 11: Idempotent Event Projection Handling
  // ==========================================================================
  console.log("\n▶ Test 11: Real-time Domain Event Projection...");
  await projectionService.handleDomainEvent({
    id: "evt-bkg-101",
    type: "booking.created",
    tenantId: tenantAId,
    occurredAt: "2026-09-01T10:00:00Z",
    data: { bookingId: b1.id, grossTotal: 75000 },
  });

  const projSnapshots = await projectionRepo.getDailySnapshots(tenantAId, "2026-09-01", "2026-09-01");
  assert.ok(projSnapshots.length > 0, "Projection record must be created for date");
  assert.equal(projSnapshots[0].bookingCreatedCount, 1);
  assert.equal(projSnapshots[0].bookingContractualValue, 75000);

  // Idempotent retry: applying same event again does not duplicate counters
  const reprocessed = await projectionService.handleDomainEvent({
    id: "evt-bkg-101",
    type: "booking.created",
    tenantId: tenantAId,
    occurredAt: "2026-09-01T10:00:00Z",
    data: { bookingId: b1.id, grossTotal: 75000 },
  });
  assert.equal(reprocessed, false, "Duplicate event must be recognized and skipped idempotently");

  const projRetry = await projectionRepo.getDailySnapshots(tenantAId, "2026-09-01", "2026-09-01");
  assert.equal(projRetry[0].bookingCreatedCount, 1, "Projection must be idempotent against duplicated event deliveries");
  console.log("  ✓ [PASS] 11. Real-time domain event projections process idempotently.");

  // ==========================================================================
  // Test 12: Source-of-Truth Historical Backfill
  // ==========================================================================
  console.log("\n▶ Test 12: Read-Model Historical Backfill...");
  const backfillResult = await backfillService.runBackfill(tenantAId, "2026-09-01", "2026-09-30");
  assert.equal(backfillResult.status, "COMPLETED");
  assert.ok(backfillResult.daysProcessed >= 1);
  console.log(`  ✓ [PASS] 12. Historical backfill executed successfully (${backfillResult.daysProcessed} daily projections calculated).`);

  // ==========================================================================
  // Test 13: Strict Multi-Tenant Isolation
  // ==========================================================================
  console.log("\n▶ Test 13: Multi-Tenant Data Isolation Enforcement...");
  // Tenant B attempts to query Tenant A metrics
  const tenantBMetrics = await metricsService.evaluateMetric(tenantBId, {
    key: "FLEET_TOTAL_VEHICLES",
    from: "2026-09-01",
    to: "2026-09-30",
  });
  assert.equal(tenantBMetrics.value, 0, "Tenant B must see 0 vehicles in their fleet");

  // Tenant B queries revenue report
  const tenantBReport = await reportingService.executeReport(tenantBId, "REPORT_REVENUE_BILLING", {
    from: "2026-09-01",
    to: "2026-09-30",
  });
  assert.equal(tenantBReport.rows.length, 0, "Tenant B must see 0 invoices");
  assert.equal(tenantBReport.summary.grossTotalInvoiced, 0);

  // Tenant B attempts to access Tenant A export execution
  const tenantBExecutions = await reportExportService.listExecutions(tenantBId);
  assert.equal(tenantBExecutions.length, 0, "Tenant B must not see Tenant A export executions");

  console.log("  ✓ [PASS] 13. Multi-tenant boundary isolation strictly enforced across all analytics queries.");

  console.log("======================================================================");
  console.log("🎉 ALL SPRINT 34 TENANT ANALYTICS & REPORTING TESTS PASSED! (13/13)");
  console.log("======================================================================");
}

runSprint34TestSuite().catch((err) => {
  console.error("❌ Sprint 34 Test Suite Failed:", err);
  process.exit(1);
});
