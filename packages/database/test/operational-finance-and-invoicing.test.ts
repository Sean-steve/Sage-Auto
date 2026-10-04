// ============================================================================
// CAR HIRE OS — SPRINT 19 TEST SUITE: OPERATIONAL FINANCE & INVOICING
// Verification of Invoices, Line Items, Taxes, Deposits, Credit Notes & Expenses
// Conforms to DOM-003 §28-34, strict NUMERIC(19,4) Decimal Standard & Tenant Isolation
// ============================================================================

import assert from "node:assert";
import {
  OperationalInvoiceRepository,
  CreditNoteRepository,
  ExpenseRepository,
  DepositPositionRepository,
  RefundObligationRepository,
  RentalRepository,
  CustomerRepository,
  CorporateAccountRepository,
  MaintenanceRepository,
  AuditRepository,
  OutboxRepository,
  CrossTenantViolationError,
  CreditNoteExceedsInvoiceTotalError,
  CreditNoteInvoiceNotIssuedError,
  OperationalExpenseFourEyesApprovalViolationError,
  OperationalInvoiceInvalidStateTransitionError,
} from "../src/index";

import { FinanceService } from "../../../apps/api/src/modules/finance/application/finance.service";
import { InvoiceStateMachine } from "../../../apps/api/src/modules/finance/domain/invoice-state-machine";

async function runSprint19FinanceTestSuite() {
  console.log("----------------------------------------------------------------");
  console.log("RUNNING SPRINT 19 TEST SUITE: OPERATIONAL FINANCE & INVOICING");
  console.log("----------------------------------------------------------------");

  // Clear stores
  OperationalInvoiceRepository.clear();
  CreditNoteRepository.clear();
  ExpenseRepository.clear();
  DepositPositionRepository.clear();
  RefundObligationRepository.clear();
  CustomerRepository.clear();

  const invoiceRepo = new OperationalInvoiceRepository();
  const creditNoteRepo = new CreditNoteRepository();
  const expenseRepo = new ExpenseRepository();
  const depositPositionRepo = new DepositPositionRepository();
  const refundObligationRepo = new RefundObligationRepository();
  const rentalRepo = new RentalRepository();
  const customerRepo = new CustomerRepository();
  const corporateAccountRepo = new CorporateAccountRepository();
  const maintenanceRepo = new MaintenanceRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();

  const financeService = new FinanceService(
    invoiceRepo,
    creditNoteRepo,
    expenseRepo,
    depositPositionRepo,
    refundObligationRepo,
    rentalRepo,
    customerRepo,
    corporateAccountRepo,
    maintenanceRepo,
    auditRepo,
    outboxRepo
  );

  const tenantA = "tenant_nairobi_rentals";
  const tenantB = "tenant_mombasa_safaris";

  const staffUser1 = { userId: "usr_finance_mgr_1", tenantId: tenantA };
  const staffUser2 = { userId: "usr_finance_mgr_2", tenantId: tenantA };
  const tenantBUser = { userId: "usr_mombasa_staff", tenantId: tenantB };

  // Setup seed customer
  const customerA = await customerRepo.create({
    tenantId: tenantA,
    fullName: "Juma Kimani",
    email: "juma.kimani@example.com",
    phone: "+254711223344",
    idOrPassportNumber: "ID-9928374",
    licenseNumber: "DL-9928374",
    licenseExpiryDate: "2028-12-31",
    customerType: "INDIVIDUAL",
    status: "ACTIVE",
    verificationStatus: "VERIFIED",
    address: "Waiyaki Way, Nairobi",
    city: "Nairobi",
    country: "Kenya",
  });

  // --------------------------------------------------------------------------
  // TEST 1: Tenant Isolation & Cross-Tenant Access Safeguard
  // --------------------------------------------------------------------------
  console.log("\n[TEST 1] Tenant isolation and cross-tenant access enforcement...");

  const draftInvoiceTenantA = await financeService.createInvoice(
    tenantA,
    {
      customerId: customerA.id,
      dueDate: "2026-09-30",
      lineItems: [
        {
          lineType: "CUSTOM_FEE",
          description: "Administrative Processing Fee",
          quantity: 1,
          unitPrice: 5000,
          taxRate: 0.16,
        },
      ],
    },
    staffUser1
  );

  assert.strictEqual(draftInvoiceTenantA.tenantId, tenantA);
  assert.strictEqual(draftInvoiceTenantA.status, "DRAFT");
  assert.strictEqual(draftInvoiceTenantA.subtotal, "5000.0000");
  assert.strictEqual(draftInvoiceTenantA.taxTotal, "800.0000");
  assert.strictEqual(draftInvoiceTenantA.total, "5800.0000");

  // Attempt to access or issue Tenant A's invoice as Tenant B
  await assert.rejects(
    async () => {
      await financeService.issueInvoice(tenantB, draftInvoiceTenantA.id, {}, tenantBUser);
    },
    (err: unknown) => err instanceof CrossTenantViolationError
  );

  console.log("✓ Cross-tenant access successfully prevented with CrossTenantViolationError.");

  // --------------------------------------------------------------------------
  // TEST 2: Strict NUMERIC(19,4) Decimal Precision & Tax Snapshots
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Strict NUMERIC(19,4) precision, VAT (16%) calculation & Line Item snapshots...");

  const precisionInvoice = await financeService.createInvoice(
    tenantA,
    {
      customerId: customerA.id,
      dueDate: "2026-10-15",
      lineItems: [
        {
          lineType: "RENTAL_BASE",
          description: "4 Days Vehicle Hire @ 7,333.3333",
          quantity: 4,
          unitPrice: 7333.3333,
          taxRate: 0.16,
        },
        {
          lineType: "EXCESS_MILEAGE",
          description: "42.5 km excess mileage @ 45.5000",
          quantity: 42.5,
          unitPrice: 45.5,
          taxRate: 0.16,
        },
        {
          lineType: "FUEL_DEFICIT",
          description: "Fuel refill deficit (15.2 L @ 210.0000) - Tax Exempt",
          quantity: 15.2,
          unitPrice: 210,
          taxRate: 0,
        },
      ],
    },
    staffUser1
  );

  // Math verification:
  // Base: 4 * 7333.3333 = 29333.3332. Tax: 29333.3332 * 0.16 = 4693.333312
  // Mileage: 42.5 * 45.5 = 1933.75. Tax: 1933.75 * 0.16 = 309.4
  // Fuel: 15.2 * 210 = 3192.00. Tax: 0
  // Total Subtotal: 29333.3332 + 1933.75 + 3192.00 = 34459.0832
  // Total Tax: 4693.333312 + 309.4 = 5002.733312 -> 5002.7333
  // Total: 34459.0832 + 5002.7333 = 39461.8165

  assert.strictEqual(precisionInvoice.lineItems.length, 3);
  assert.strictEqual(precisionInvoice.subtotal, "34459.0832");
  assert.strictEqual(precisionInvoice.taxTotal, "5002.7333");
  assert.strictEqual(precisionInvoice.total, "39461.8165");
  assert.strictEqual(precisionInvoice.amountOutstanding, "39461.8165");

  console.log("✓ Subtotal, VAT and Gross amounts calculated with exact NUMERIC(19,4) precision.");

  // --------------------------------------------------------------------------
  // TEST 3: Invoice Lifecycle State Transitions & Immutability
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Invoice lifecycle state machine & document immutability...");

  // Cannot skip directly from DRAFT to PAID
  assert.throws(() => {
    InvoiceStateMachine.validateTransition("DRAFT", "PAID");
  }, OperationalInvoiceInvalidStateTransitionError);

  // Formally issue the precision invoice
  const issuedInvoice = await financeService.issueInvoice(tenantA, precisionInvoice.id, { notes: "Sent via email" }, staffUser1);
  assert.strictEqual(issuedInvoice.status, "ISSUED");
  assert.ok(issuedInvoice.issuedAt);

  // Assert immutability: once ISSUED, cannot mutate core source facts directly
  assert.throws(() => {
    InvoiceStateMachine.assertMutable(issuedInvoice.id, issuedInvoice.status);
  });

  // Record a partial payment
  const partiallyPaid = await financeService.recordManualPayment(
    tenantA,
    {
      invoiceId: issuedInvoice.id,
      amount: "15000.0000",
      paymentMethod: "BANK_TRANSFER",
      transactionReference: "FT-2026-99120",
    },
    staffUser1
  );

  assert.strictEqual(partiallyPaid.status, "PARTIALLY_PAID");
  assert.strictEqual(partiallyPaid.amountPaid, "15000.0000");
  assert.strictEqual(partiallyPaid.amountOutstanding, "24461.8165");

  // Record final remaining payment
  const fullyPaid = await financeService.recordManualPayment(
    tenantA,
    {
      invoiceId: issuedInvoice.id,
      amount: "24461.8165",
      paymentMethod: "MPESA",
      transactionReference: "QWE9918237",
    },
    staffUser1
  );

  assert.strictEqual(fullyPaid.status, "PAID");
  assert.strictEqual(fullyPaid.amountPaid, "39461.8165");
  assert.strictEqual(fullyPaid.amountOutstanding, "0.0000");
  assert.ok(fullyPaid.paidAt);

  console.log("✓ State transitions (DRAFT -> ISSUED -> PARTIALLY_PAID -> PAID) and immutability enforced.");

  // --------------------------------------------------------------------------
  // TEST 4: Authoritative Rental Invoice Generation with Deposit Reconciliation
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Authoritative rental outcome ingestion with held deposit reconciliation...");

  // Seed a completed rental in rental repository
  const rental1 = await rentalRepo.create(tenantA, {
    rentalNumber: "RNT-2026-00088",
    bookingId: "bkg_test_88",
    contractId: "ctr_test_88",
    handoverId: "hnd_test_88",
    customerId: customerA.id,
    primaryDriverId: "drv_test_88",
    vehicleId: "veh_test_88",
    status: "COMPLETED",
    pricingSnapshot: {
      currency: "KES",
      dailyRate: 10000,
      totalDays: 3,
      baseRentalAmount: 30000,
      excessMileageRate: 50,
      fuelPricePerLiter: 200,
      surcharges: 0,
      discounts: [],
      taxRate: 0.16,
      taxTotal: 4800,
      grossTotal: 34800,
      estimatedDeposit: 20000,
      snapshotDate: "2026-09-01T00:00:00Z",
    } as any,
  });

  // Seed start snapshot with 20,000 security deposit requirement
  await rentalRepo.saveStartSnapshot(tenantA, {
    rentalId: rental1.id,
    tenantId: tenantA,
    actualVehicleId: "veh_test_88",
    driverId: "drv_test_88",
    startedAt: "2026-09-01T08:00:00Z",
    scheduledReturnAt: "2026-09-04T08:00:00Z",
    startOdometer: 15000,
    startFuelLevel: 100,
    contractVersion: 1,
    depositRequirement: 20000,
    pricingSnapshot: {
      currency: "KES",
      dailyRate: 10000,
      totalDays: 3,
      baseRentalAmount: 30000,
      excessMileageRate: 50,
      fuelPricePerLiter: 200,
      surcharges: 0,
      discounts: [],
      taxRate: 0.16,
      taxTotal: 4800,
      grossTotal: 34800,
      estimatedDeposit: 20000,
      snapshotDate: "2026-09-01T00:00:00Z",
    } as any,
  });

  // Seed final return calculation with excess mileage and refueling fee
  await rentalRepo.saveFinalCalculation(tenantA, {
    tenantId: tenantA,
    rentalId: rental1.id,
    bookingId: rental1.bookingId,
    startOdometer: 15000,
    returnOdometer: 15050,
    totalDistanceKm: 50,
    allowedDistanceKm: 0,
    excessDistanceKm: 50,
    excessKmRate: 50,
    excessKmCharge: 2500,
    startFuelLevel: 100,
    returnFuelLevel: 80,
    fuelDeficitPercent: 20,
    fuelDeficitLitres: 10,
    fuelPricePerUnit: 150,
    fuelDeficitCharge: 1500,
    fuelRefuelingFee: 0,
    scheduledReturnAt: "2026-09-04T08:00:00Z",
    actualReturnAt: "2026-09-04T08:00:00Z",
    lateReturnDurationHours: 0,
    gracePeriodHours: 1,
    billableLateHours: 0,
    lateReturnFee: 0,
    damageCaseIds: [],
    totalDamageCharge: 0,
    totalAdditionalFees: 500,
    baseRentalAmount: 30000,
    extensionsTotalAmount: 0,
    grossFinalTotal: 39780,
    totalTaxAmount: 5280,
    netFinalTotal: 34500,
    depositHeldAmount: 20000,
    depositDeductionsTotal: 20000,
    depositRefundDue: 0,
    depositAdditionalPaymentDue: 19780,
    depositSettlementStatus: "SETTLED",
    isImmutable: true,
    lineItems: [
      { code: "BASE_RENTAL", label: "Base Rental Charge", quantity: 3, unitPrice: 10000, totalAmount: 30000, taxAmount: 4800, category: "BASE_RENTAL" },
      { code: "EXCESS_MILEAGE", label: "Excess Mileage (50km)", quantity: 50, unitPrice: 50, totalAmount: 2500, taxAmount: 400, category: "EXCESS_MILEAGE" },
      { code: "FUEL_DEFICIT", label: "Fuel Tank Deficit", quantity: 1, unitPrice: 1500, totalAmount: 1500, taxAmount: 0, category: "FUEL_DEFICIT" },
      { code: "REFUELING_SURCHARGE", label: "Refueling Surcharge Fee", quantity: 1, unitPrice: 500, totalAmount: 500, taxAmount: 80, category: "ADDITIONAL_FEE" },
    ],
  });

  // Deposit requirement is not payment evidence. Seed the actual received/held
  // liability explicitly before applying it to the invoice.
  await depositPositionRepo.create({
    tenantId: tenantA,
    rentalId: rental1.id,
    bookingId: rental1.bookingId,
    customerId: rental1.customerId,
    currency: "KES",
    requiredAmount: "20000.0000",
    receivedAmount: "20000.0000",
    heldAmount: "20000.0000",
    appliedAmount: "0.0000",
    refundDueAmount: "0.0000",
    refundedAmount: "0.0000",
    forfeitedAmount: "0.0000",
    status: "HELD",
    notes: "Verified deposit receipt seeded for finance regression",
  });

  // Generate Authoritative Rental Invoice with deposit deduction
  const rentalInvoice = await financeService.generateRentalInvoice(
    tenantA,
    {
      rentalId: rental1.id,
      applyDepositDeduction: true,
    },
    staffUser1
  );

  // Total invoice gross: 30000 + 4800 + 2500 + 400 + 1500 + 500 + 80 = 39,780.0000
  // Security deposit held was 20,000.0000.
  // Reconciliation: Entire 20,000 deposit applied to invoice.
  // Outstanding invoice balance: 39,780 - 20,000 = 19,780.0000.
  // Status: PARTIALLY_PAID

  assert.strictEqual(rentalInvoice.rentalId, rental1.id);
  assert.strictEqual(rentalInvoice.total, "39780.0000");
  assert.strictEqual(rentalInvoice.amountPaid, "20000.0000");
  assert.strictEqual(rentalInvoice.amountOutstanding, "19780.0000");
  assert.strictEqual(rentalInvoice.status, "PARTIALLY_PAID");

  // Check deposit position status
  const depositPos = await depositPositionRepo.findByRentalId(rental1.id, tenantA);
  assert.ok(depositPos);
  assert.strictEqual(depositPos.requiredAmount, "20000.0000");
  assert.strictEqual(depositPos.receivedAmount, "20000.0000");
  assert.strictEqual(depositPos.heldAmount, "0.0000");
  assert.strictEqual(depositPos.appliedAmount, "20000.0000");
  assert.strictEqual(depositPos.status, "APPLIED");

  // Idempotency: Calling generateRentalInvoice again returns the identical invoice
  const reIngest = await financeService.generateRentalInvoice(
    tenantA,
    { rentalId: rental1.id },
    staffUser1
  );
  assert.strictEqual(reIngest.id, rentalInvoice.id);

  // A deposit requirement without a recorded DepositPosition must never be
  // converted into received cash or reduce the customer receivable.
  const rentalWithoutDeposit = await rentalRepo.create(tenantA, {
    rentalNumber: "RNT-2026-00089",
    bookingId: "bkg_test_89",
    contractId: "ctr_test_89",
    handoverId: "hnd_test_89",
    customerId: customerA.id,
    primaryDriverId: "drv_test_89",
    vehicleId: "veh_test_89",
    status: "COMPLETED",
    pricingSnapshot: {
      currency: "KES",
      dailyRate: 5000,
      totalDays: 2,
      baseRentalAmount: 10000,
      excessMileageRate: 0,
      fuelPricePerLiter: 0,
      surcharges: 0,
      discounts: [],
      taxRate: 0.16,
      taxTotal: 1600,
      grossTotal: 11600,
      estimatedDeposit: 15000,
      snapshotDate: "2026-09-05T00:00:00Z",
    } as any,
  });
  await rentalRepo.saveStartSnapshot(tenantA, {
    rentalId: rentalWithoutDeposit.id,
    tenantId: tenantA,
    actualVehicleId: "veh_test_89",
    driverId: "drv_test_89",
    startedAt: "2026-09-05T08:00:00Z",
    scheduledReturnAt: "2026-09-07T08:00:00Z",
    startOdometer: 1000,
    startFuelLevel: 100,
    contractVersion: 1,
    depositRequirement: 15000,
    pricingSnapshot: {
      currency: "KES",
      dailyRate: 5000,
      totalDays: 2,
      baseRentalAmount: 10000,
      excessMileageRate: 0,
      fuelPricePerLiter: 0,
      surcharges: 0,
      discounts: [],
      taxRate: 0.16,
      taxTotal: 1600,
      grossTotal: 11600,
      estimatedDeposit: 15000,
      snapshotDate: "2026-09-05T00:00:00Z",
    } as any,
  });

  const noDepositInvoice = await financeService.generateRentalInvoice(
    tenantA,
    { rentalId: rentalWithoutDeposit.id, applyDepositDeduction: true },
    staffUser1
  );
  assert.strictEqual(noDepositInvoice.amountPaid, "0.0000");
  assert.strictEqual(noDepositInvoice.amountOutstanding, noDepositInvoice.total);
  assert.strictEqual(await depositPositionRepo.findByRentalId(rentalWithoutDeposit.id, tenantA), null);

  const activeRental = await rentalRepo.create(tenantA, {
    rentalNumber: "RNT-2026-00090",
    bookingId: "bkg_test_90",
    contractId: "ctr_test_90",
    handoverId: "hnd_test_90",
    customerId: customerA.id,
    primaryDriverId: "drv_test_90",
    vehicleId: "veh_test_90",
    status: "ACTIVE_ON_ROAD",
    pricingSnapshot: (await rentalRepo.getStartSnapshot(rentalWithoutDeposit.id, tenantA))!.pricingSnapshot,
  });
  await assert.rejects(
    () => financeService.generateRentalInvoice(tenantA, { rentalId: activeRental.id }, staffUser1),
    /must complete the Return & Final Calculation lifecycle/i
  );

  console.log("✓ Rental invoice generation requires completed Return truth and never invents deposit receipts.");

  // --------------------------------------------------------------------------
  // TEST 5: Credit Note Reversal & Capping Invariant
  // --------------------------------------------------------------------------
  console.log("\n[TEST 5] Credit notes, cap enforcement & receivable reduction...");

  // Invoice rentalInvoice has grossTotal 39,780.0000.
  // Attempt to create a credit note exceeding total (e.g. 45,000)
  await assert.rejects(
    async () => {
      await financeService.createCreditNote(
        tenantA,
        {
          invoiceId: rentalInvoice.id,
          reason: "Incorrect mileage billing",
          lines: [
            {
              description: "Excess credit",
              quantity: 1,
              unitPrice: 40000,
              taxRate: 0.16,
            },
          ],
        },
        staffUser1
      );
    },
    (err: unknown) => err instanceof CreditNoteExceedsInvoiceTotalError
  );

  // Create valid credit note for the excess mileage portion (2,500 net + 400 tax = 2,900)
  const creditNote1 = await financeService.createCreditNote(
    tenantA,
    {
      invoiceId: rentalInvoice.id,
      reason: "Waived excess mileage charges due to branch diversion",
      lines: [
        {
          description: "Credit for excess mileage charge",
          quantity: 1,
          unitPrice: 2500,
          taxRate: 0.16,
        },
      ],
    },
    staffUser1
  );

  assert.strictEqual(creditNote1.status, "DRAFT");
  assert.strictEqual(creditNote1.subtotal, "2500.0000");
  assert.strictEqual(creditNote1.taxTotal, "400.0000");
  assert.strictEqual(creditNote1.total, "2900.0000");

  // Formally issue the credit note
  const issuedCreditNote = await financeService.issueCreditNote(tenantA, creditNote1.id, staffUser1);
  assert.strictEqual(issuedCreditNote.status, "ISSUED");

  // Verify invoice amounts adjusted
  // Outstanding was 19,780.0000 - 2,900.0000 = 16,880.0000
  const adjustedInvoice = await invoiceRepo.findById(rentalInvoice.id, tenantA);
  assert.ok(adjustedInvoice);
  assert.strictEqual(adjustedInvoice.amountCredited, "2900.0000");
  assert.strictEqual(adjustedInvoice.amountOutstanding, "16880.0000");

  console.log("✓ Credit note created, cap verified, issued, and invoice receivables reduced.");

  // --------------------------------------------------------------------------
  // TEST 6: Operating Expenses & Four-Eyes Control Enforcement
  // --------------------------------------------------------------------------
  console.log("\n[TEST 6] Operating expenses & four-eyes approval control...");

  // Staff User 1 creates an expense draft for vehicle maintenance parts
  const expense1 = await financeService.createExpense(
    tenantA,
    {
      category: "FUEL",
      vehicleId: "veh_test_88",
      payeeName: "TotalEnergies Westlands",
      description: "Emergency fleet top-up fuel",
      expenseDate: "2026-09-02",
      netAmount: 8500,
      taxAmount: 0,
      notes: "Receipt #TT-9921",
    },
    staffUser1
  );

  assert.strictEqual(expense1.status, "DRAFT");
  assert.strictEqual(expense1.createdBy, staffUser1.userId);
  assert.strictEqual(expense1.grossAmount, "8500.0000");

  // Submit expense
  const submittedExpense = await financeService.submitExpense(tenantA, expense1.id, staffUser1);
  assert.strictEqual(submittedExpense.status, "SUBMITTED");

  // Four-Eyes Violation: Staff User 1 (creator) tries to approve their own expense
  await assert.rejects(
    async () => {
      await financeService.approveExpense(tenantA, submittedExpense.id, {}, staffUser1);
    },
    (err: unknown) => err instanceof OperationalExpenseFourEyesApprovalViolationError
  );

  // Distinct Staff User 2 approves the expense
  const approvedExpense = await financeService.approveExpense(tenantA, submittedExpense.id, {}, staffUser2);
  assert.strictEqual(approvedExpense.status, "APPROVED");
  assert.strictEqual(approvedExpense.approvedBy, staffUser2.userId);
  assert.ok(approvedExpense.approvedAt);

  console.log("✓ Operating expense four-eyes approval control verified (self-approval blocked).");

  // --------------------------------------------------------------------------
  // TEST 7: Completed Maintenance Work Order Ingestion
  // --------------------------------------------------------------------------
  console.log("\n[TEST 7] Maintenance work order financial cost ingestion...");

  // Seed completed maintenance work order in maintenance repository
  const createdWO = await maintenanceRepo.create(tenantA, {
    maintenanceNumber: "MNT-2026-00045",
    vehicleId: "veh_test_88",
    garageId: "gar_toyota_kenya",
    garageName: "Toyota Kenya Authorized Service Center",
    maintenanceType: "ROUTINE_SERVICE",
    priority: "NORMAL",
    reason: "Scheduled periodic 50,000 km routine maintenance",
    scheduledStartAt: "2026-08-20T08:00:00Z",
    estimatedCost: 22000,
    requestedBy: staffUser1.userId,
  });

  const workOrder = await maintenanceRepo.update(createdWO.id, tenantA, {
    status: "COMPLETED",
    actualCost: 24500,
    actualCompletedAt: "2026-08-22T14:30:00Z",
  });

  const maintenanceExpense = await financeService.ingestMaintenanceExpense(
    tenantA,
    {
      maintenanceWorkOrderId: workOrder.id,
      vehicleOwnerId: "own_investor_01",
      ownerDeductible: true,
    },
    staffUser1
  );

  assert.strictEqual(maintenanceExpense.category, "MAINTENANCE");
  assert.strictEqual(maintenanceExpense.maintenanceId, workOrder.id);
  assert.strictEqual(maintenanceExpense.vehicleOwnerId, "own_investor_01");
  assert.strictEqual(maintenanceExpense.grossAmount, "24500.0000");
  assert.strictEqual(maintenanceExpense.status, "APPROVED");

  // Idempotency: Re-ingesting returns identical expense
  const duplicateMnt = await financeService.ingestMaintenanceExpense(
    tenantA,
    { maintenanceWorkOrderId: workOrder.id },
    staffUser1
  );
  assert.strictEqual(duplicateMnt.id, maintenanceExpense.id);

  console.log("✓ Completed maintenance work order ingested into verified operational expense.");

  // --------------------------------------------------------------------------
  // TEST 8: Customer & Tenant Receivables Read Models & Summaries
  // --------------------------------------------------------------------------
  console.log("\n[TEST 8] Customer receivables & tenant operational finance summary...");

  const customerReceivables = await financeService.getCustomerReceivables(tenantA, customerA.id);
  assert.strictEqual(customerReceivables.customerId, customerA.id);
  assert.ok(parseFloat(customerReceivables.totalInvoiced) > 0);
  assert.ok(parseFloat(customerReceivables.totalPaid) > 0);
  assert.ok(parseFloat(customerReceivables.totalCredited) > 0);
  assert.ok(parseFloat(customerReceivables.totalOutstanding) > 0);

  const tenantSummary = await financeService.getOperationalFinanceSummary(tenantA);
  assert.strictEqual(tenantSummary.tenantId, tenantA);
  assert.ok(parseFloat(tenantSummary.totalInvoiced) > 0);
  assert.ok(parseFloat(tenantSummary.totalCollected) > 0);
  assert.ok(parseFloat(tenantSummary.totalReceivables) > 0);
  assert.ok(parseFloat(tenantSummary.approvedExpenses) > 0);

  console.log("✓ Customer and tenant receivables summaries aggregated correctly.");

  // --------------------------------------------------------------------------
  // TEST 9: Sprint 21 Owner Settlement Interface Read Models
  // --------------------------------------------------------------------------
  console.log("\n[TEST 9] Sprint 21 Owner Settlement interface read models...");

  const revenueComponents = await financeService.getSettledRentalRevenueComponents(tenantA, rental1.id);
  assert.ok(revenueComponents);
  assert.strictEqual(revenueComponents.rentalId, rental1.id);
  assert.strictEqual(revenueComponents.vehicleId, "veh_test_88");
  assert.ok(parseFloat(revenueComponents.baseRentalGross) > 0);
  assert.ok(parseFloat(revenueComponents.excessMileageGross) > 0);
  assert.ok(parseFloat(revenueComponents.fuelDeficitGross) > 0);

  const eligibleExpenses = await financeService.getEligibleVehicleExpenses(tenantA, "veh_test_88");
  assert.ok(eligibleExpenses.length >= 2);
  const maintenanceComp = eligibleExpenses.find((e) => e.category === "MAINTENANCE");
  assert.ok(maintenanceComp);
  assert.strictEqual(maintenanceComp.isOwnerDeductible, true);

  console.log("✓ Sprint 21 Owner Settlement interface read models verified.");

  console.log("================================================================");
  console.log("ALL SPRINT 19 OPERATIONAL FINANCE & INVOICING TESTS PASSED!");
  console.log("================================================================");
}

runSprint19FinanceTestSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
