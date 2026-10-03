// ============================================================================
// CAR HIRE OS — SPRINT 22 VERIFICATION SUITE
// Payment Abstraction, Attempts, Verification, Allocation, Refunds & Provider Contracts
// ============================================================================

import assert from "node:assert";
import {
  PaymentAttemptRepository,
  PaymentRepository,
  PaymentAllocationRepository,
  RefundRepository,
  PaymentReconciliationRepository,
  WebhookRepository,
  OperationalInvoiceRepository,
  DepositPositionRepository,
  OwnerSettlementRepository,
  AuditRepository,
  OutboxRepository,
  PaymentAllocationExceededError,
  RefundExceedsPaymentError,
  InvalidWebhookSignatureError,
  ClientPaymentEvidenceRejectedError,
  SettlementAlreadyPaidError,
} from "../src/index";
import { PaymentService } from "../../../apps/api/src/modules/payments/application/payment.service";
import { PaymentProviderRegistry } from "../../../apps/api/src/modules/payments/infrastructure/providers/provider-registry";
import { FakePaymentProvider } from "../../../apps/api/src/modules/payments/infrastructure/providers/fake-payment-provider";

async function runPaymentSuite() {
  console.log("----------------------------------------------------------------------");
  console.log("RUNNING SPRINT 22: PAYMENT ABSTRACTION & PROVIDER CONTRACTS TEST SUITE");
  console.log("----------------------------------------------------------------------\n");

  const tenantId = "tenant_ke_nairobi_01";
  const actor = { userId: "user_finance_ops", tenantId, role: "FINANCE_ADMIN" };

  // Setup repos & service
  PaymentAttemptRepository.clear();
  PaymentRepository.clear();
  PaymentAllocationRepository.clear();
  RefundRepository.clear();
  PaymentReconciliationRepository.clear();

  const attemptRepo = new PaymentAttemptRepository();
  const paymentRepo = new PaymentRepository();
  const allocationRepo = new PaymentAllocationRepository();
  const refundRepo = new RefundRepository();
  const reconciliationRepo = new PaymentReconciliationRepository();
  const webhookRepo = new WebhookRepository();
  const invoiceRepo = new OperationalInvoiceRepository();
  const depositPositionRepo = new DepositPositionRepository();
  const settlementRepo = new OwnerSettlementRepository();
  const auditRepo = new AuditRepository();
  const outboxRepo = new OutboxRepository();

  const registry = new PaymentProviderRegistry();
  const fakeProvider = new FakePaymentProvider();
  registry.register(fakeProvider);

  const paymentService = new PaymentService(
    attemptRepo,
    paymentRepo,
    allocationRepo,
    refundRepo,
    reconciliationRepo,
    registry,
    webhookRepo,
    invoiceRepo,
    depositPositionRepo,
    settlementRepo,
    auditRepo,
    outboxRepo
  );

  // PRODUCTION FAIL-CLOSED: fake provider defaults are forbidden outside dev/test.
  const previousAppEnv = process.env.APP_ENV;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.APP_ENV = "production";
  process.env.NODE_ENV = "production";
  assert.throws(
    () => registry.get("FAKE_PROVIDER"),
    /Production.*explicit.*provider|FAKE_PROVIDER.*production/i,
    "Production must reject the fake provider fallback"
  );

  await assert.rejects(
    () =>
      paymentService.initiatePaymentAttempt(
        tenantId,
        {
          purpose: "CUSTOMER_INVOICE",
          amount: "15000.0000",
          currency: "KES",
          customerId: "cust_production_guard_01",
        },
        actor
      ),
    /Production.*explicit.*provider|FAKE_PROVIDER.*production/i,
    "Production must reject implicit fake provider fallback in the service layer"
  );

  process.env.APP_ENV = previousAppEnv;
  process.env.NODE_ENV = previousNodeEnv;

  // --------------------------------------------------------------------------
  // TEST 1: PaymentAttempt Initiation vs Authoritative Payment Separation
  // --------------------------------------------------------------------------
  console.log("TEST 1: PaymentAttempt Initiation (Intent != Payment)");
  const attempt = await paymentService.initiatePaymentAttempt(
    tenantId,
    {
      purpose: "CUSTOMER_INVOICE",
      amount: "15000.0000",
      currency: "KES",
      provider: "FAKE_PROVIDER",
      customerId: "cust_safari_adventures",
      customerPhone: "+254712345678",
      metadata: { rentalAgreement: "RA-2026-001" },
    },
    actor
  );

  assert.ok(attempt.id, "Attempt should have an id");
  assert.strictEqual(attempt.amount, "15000.0000");
  assert.strictEqual(attempt.status, "SUCCEEDED"); // fakeProvider default auto-success initializes to succeeded
  assert.ok(attempt.providerReference, "Attempt should have providerReference");

  // Verify that NO authoritative Payment record exists merely from attempt initiation
  const paymentsBeforeVerify = await paymentRepo.listByTenant(tenantId);
  assert.strictEqual(
    paymentsBeforeVerify.length,
    0,
    "No authoritative Payment should exist before server-side verification"
  );
  console.log("  ✓ PaymentAttempt initiated without creating an premature Payment record");

  // --------------------------------------------------------------------------
  // TEST 2: Client/Browser Claimed Success Is REJECTED as Evidence
  // --------------------------------------------------------------------------
  console.log("\nTEST 2: Browser/Client Claimed Success Is REJECTED");
  try {
    await paymentService.verifyPaymentAttempt(tenantId, attempt.id, actor, true);
    assert.fail("Should have thrown ClientPaymentEvidenceRejectedError");
  } catch (err: any) {
    assert.strictEqual(
      err.name,
      "ClientPaymentEvidenceRejectedError",
      "Must reject client-only payment claim"
    );
  }
  console.log("  ✓ Client payment claim strictly rejected (Server-authoritative requirement enforced)");

  // --------------------------------------------------------------------------
  // TEST 3: Authoritative Server-Side Verification
  // --------------------------------------------------------------------------
  console.log("\nTEST 3: Authoritative Server-Side Provider Verification");
  const verifiedPayment = await paymentService.verifyPaymentAttempt(tenantId, attempt.id, actor);

  assert.ok(verifiedPayment.id, "Payment should have an id");
  assert.ok(verifiedPayment.paymentNumber.startsWith("PMT-"), "Payment number format");
  assert.strictEqual(verifiedPayment.status, "VERIFIED");
  assert.strictEqual(verifiedPayment.amount, "15000.0000");
  assert.strictEqual(verifiedPayment.allocatedAmount, "0.0000");
  assert.strictEqual(verifiedPayment.unallocatedAmount, "15000.0000");
  assert.strictEqual(verifiedPayment.verificationSource, "STATUS_QUERY");

  // Duplicate verification returns existing payment idempotently
  const reVerifiedPayment = await paymentService.verifyPaymentAttempt(tenantId, attempt.id, actor);
  assert.strictEqual(reVerifiedPayment.id, verifiedPayment.id, "Idempotent re-verification");
  console.log("  ✓ Authoritative Payment created in status VERIFIED; re-verification is idempotent");

  // --------------------------------------------------------------------------
  // TEST 4: Idempotent Webhook Processing & Signature Protection
  // --------------------------------------------------------------------------
  console.log("\nTEST 4: Webhook Ingestion, Signature Verification & Idempotency");

  // Attempt 2 for webhook test
  fakeProvider.setBehavior({ mode: "REQUIRE_MANUAL_WEBHOOK" });
  const attempt2 = await paymentService.initiatePaymentAttempt(
    tenantId,
    {
      purpose: "CUSTOMER_INVOICE",
      amount: "8500.0000",
      currency: "KES",
      provider: "FAKE_PROVIDER",
      customerId: "cust_coastal_trips",
    },
    actor
  );
  assert.strictEqual(attempt2.status, "PENDING_CALLBACK");

  // Tampered / missing signature must fail
  try {
    await paymentService.handleWebhook(
      "FAKE_PROVIDER",
      { "x-provider-signature": "tampered_signature" },
      { intentReference: attempt2.paymentIntentReference, status: "SUCCEEDED" }
    );
    assert.fail("Should have thrown InvalidWebhookSignatureError");
  } catch (err: any) {
    assert.strictEqual(err.name, "InvalidWebhookSignatureError");
  }
  console.log("  ✓ Tampered webhook signature rejected");

  // Valid signature callback
  const webhookResult = await paymentService.handleWebhook(
    "FAKE_PROVIDER",
    { "x-provider-signature": "test_valid_signature" },
    {
      eventId: "evt_hook_99182",
      intentReference: attempt2.paymentIntentReference,
      status: "SUCCEEDED",
      amount: "8500.0000",
      currency: "KES",
      providerTransactionId: "TXN_HOOK_8831",
      payerReference: "+254799001122",
    }
  );

  assert.strictEqual(webhookResult.status, "PROCESSED");
  assert.ok(webhookResult.payment, "Webhook should produce verified payment");
  assert.strictEqual(webhookResult.payment?.status, "VERIFIED");
  assert.strictEqual(webhookResult.payment?.verificationSource, "WEBHOOK");

  // Webhook replay: must return already processed or already recorded
  const replayResult = await paymentService.handleWebhook(
    "FAKE_PROVIDER",
    { "x-provider-signature": "test_valid_signature" },
    {
      eventId: "evt_hook_99182",
      intentReference: attempt2.paymentIntentReference,
      status: "SUCCEEDED",
      amount: "8500.0000",
      currency: "KES",
      providerTransactionId: "TXN_HOOK_8831",
    }
  );
  assert.ok(
    replayResult.status === "ALREADY_PROCESSED" || replayResult.status === "ALREADY_RECORDED",
    "Webhook replay handled idempotently"
  );
  console.log("  ✓ Webhook verified, payment created, and replay attack protected");

  // --------------------------------------------------------------------------
  // TEST 5: Governed Manual Payment Recording
  // --------------------------------------------------------------------------
  console.log("\nTEST 5: Governed Manual Offline Payment Recording");
  const manualPayment = await paymentService.recordGovernedManualPayment(
    tenantId,
    {
      purpose: "CUSTOMER_INVOICE",
      amount: "20000.0000",
      currency: "KES",
      providerTransactionId: "BANK_REF_99812",
      payerReference: "Direct Wire from ABC Corp",
      customerId: "cust_abc_corp",
      notes: "Verified bank wire on statement page 3",
    },
    actor
  );

  assert.strictEqual(manualPayment.provider, "MANUAL_RECORD");
  assert.strictEqual(manualPayment.verificationSource, "MANUAL_APPROVAL");
  assert.strictEqual(manualPayment.status, "VERIFIED");
  console.log("  ✓ Governed manual payment recorded with full auditability");

  // --------------------------------------------------------------------------
  // TEST 6: Payment Allocation Engine & Ledger Posting Contracts
  // --------------------------------------------------------------------------
  console.log("\nTEST 6: Payment Allocation Engine (Invoices & Deposits)");

  // Create an operational invoice in Finance
  const invoice = await invoiceRepo.create({
    tenantId,
    invoiceNumber: "INV-2026-0001",
    customerId: "cust_safari_adventures",
    billingSnapshot: { customerName: "John Explorer", customerEmail: "john@safari.local" },
    status: "ISSUED",
    subtotal: "15000.0000",
    taxTotal: "0.0000",
    discountTotal: "0.0000",
    total: "15000.0000",
    amountPaid: "0.0000",
    amountOutstanding: "15000.0000",
    amountCredited: "0.0000",
    currency: "KES",
    issueDate: "2026-09-01",
    dueDate: "2026-09-15",
    lineItems: [],
  });

  // Partial allocation: allocate 10000 out of 15000
  const alloc1 = await paymentService.allocatePayment(
    tenantId,
    {
      paymentId: verifiedPayment.id,
      sourceType: "CUSTOMER_INVOICE",
      sourceId: invoice.id,
      amount: "10000.0000",
    },
    actor
  );

  assert.strictEqual(alloc1.amount, "10000.0000");

  const updatedPmt1 = await paymentRepo.findById(verifiedPayment.id, tenantId);
  assert.strictEqual(updatedPmt1?.status, "PARTIALLY_ALLOCATED");
  assert.strictEqual(updatedPmt1?.allocatedAmount, "10000.0000");
  assert.strictEqual(updatedPmt1?.unallocatedAmount, "5000.0000");

  const updatedInv1 = await invoiceRepo.findById(invoice.id, tenantId);
  assert.strictEqual(updatedInv1?.status, "PARTIALLY_PAID");
  assert.strictEqual(updatedInv1?.amountPaid, "10000.0000");
  assert.strictEqual(updatedInv1?.amountOutstanding, "5000.0000");
  console.log("  ✓ Partial allocation succeeded; invoice updated to PARTIALLY_PAID");

  // Over-allocation attempt: try to allocate 6000 when only 5000 is unallocated
  try {
    await paymentService.allocatePayment(
      tenantId,
      {
        paymentId: verifiedPayment.id,
        sourceType: "CUSTOMER_INVOICE",
        sourceId: invoice.id,
        amount: "6000.0000",
      },
      actor
    );
    assert.fail("Should have thrown PaymentAllocationExceededError");
  } catch (err: any) {
    assert.strictEqual(err.name, "PaymentAllocationExceededError");
  }
  console.log("  ✓ Over-allocation beyond unallocated amount rejected");

  // Remaining allocation: allocate remaining 5000
  await paymentService.allocatePayment(
    tenantId,
    {
      paymentId: verifiedPayment.id,
      sourceType: "CUSTOMER_INVOICE",
      sourceId: invoice.id,
      amount: "5000.0000",
    },
    actor
  );

  const fullyAllocatedPmt = await paymentRepo.findById(verifiedPayment.id, tenantId);
  assert.strictEqual(fullyAllocatedPmt?.status, "ALLOCATED");
  assert.strictEqual(fullyAllocatedPmt?.unallocatedAmount, "0.0000");

  const fullyPaidInv = await invoiceRepo.findById(invoice.id, tenantId);
  assert.strictEqual(fullyPaidInv?.status, "PAID");
  assert.strictEqual(fullyPaidInv?.amountOutstanding, "0.0000");
  console.log("  ✓ Full allocation completed; payment ALLOCATED and invoice PAID");

  // --------------------------------------------------------------------------
  // TEST 7: Refund Lifecycle, Cap, Four-Eyes & Provider Boundary
  // --------------------------------------------------------------------------
  console.log("\nTEST 7: Refund Request & Execution (Cap Enforced)");

  const manualRefundReq = await paymentService.requestRefund(
    tenantId,
    { paymentId: manualPayment.id, amount: "5000.0000", reason: "Manual bank payment refund requires offline confirmation" },
    actor
  );
  const refundApprover = { userId: "usr-finance-approver", actorType: "USER" as const, name: "Finance Approver" };
  await assert.rejects(
    () => paymentService.approveAndExecuteRefund(tenantId, manualRefundReq.id, refundApprover),
    (err: any) => err?.code === "MANUAL_REFUND_REQUIRES_OFFLINE_CONFIRMATION"
  );
  console.log("  ✓ Manual/offline refund cannot be auto-disbursed through a provider adapter");

  const refundReq = await paymentService.requestRefund(
    tenantId,
    { paymentId: verifiedPayment.id, amount: "5000.0000", reason: "Customer cancelled extra days in advance" },
    actor
  );
  assert.strictEqual(refundReq.status, "PENDING");
  assert.strictEqual(refundReq.amount, "5000.0000");
  assert.strictEqual(refundReq.requestedBy, actor.userId);

  await assert.rejects(
    () => paymentService.requestRefund(
      tenantId,
      { paymentId: verifiedPayment.id, amount: "25000.0000", reason: "Excess refund test" },
      actor
    ),
    (err: any) => err?.name === "RefundExceedsPaymentError"
  );
  console.log("  ✓ Refund exceeding payment balance strictly rejected");

  await assert.rejects(
    () => paymentService.approveAndExecuteRefund(tenantId, refundReq.id, actor),
    (err: any) => err?.code === "SEPARATION_OF_DUTIES"
  );
  console.log("  ✓ Refund requester cannot self-approve");

  const executedRefund = await paymentService.approveAndExecuteRefund(tenantId, refundReq.id, refundApprover);
  assert.strictEqual(executedRefund.status, "COMPLETED");
  assert.ok(executedRefund.providerRefundReference, "Provider refund ref assigned");
  const updatedProviderPmt = await paymentRepo.findById(verifiedPayment.id, tenantId);
  assert.strictEqual(updatedProviderPmt?.refundedAmount, "5000.0000");
  assert.strictEqual(updatedProviderPmt?.status, "PARTIALLY_REFUNDED");
  console.log("  ✓ Provider refund approved by a second user and payment updated");

  // TEST 8: Vehicle Owner Settlement Payout Execution (Sprint 21 Integration)
  // --------------------------------------------------------------------------
  console.log("\nTEST 8: Owner Settlement Payout Execution");

  // Create the approved settlement backing the payable. Payments must not
  // disburse an orphan payable or bypass settlement approval.
  const approvedSettlement = await settlementRepo.create({
    tenantId,
    settlementNumber: "SET-2026-PAYOUT-001",
    ownerId: "owner_james_kariuki",
    ownerName: "James Kariuki",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    currency: "KES",
    status: "APPROVED",
    calculatedAt: "2026-09-01T08:00:00Z",
    calculatedBy: "user_finance_calculator",
    approvedAt: "2026-09-01T09:00:00Z",
    approvedBy: "user_finance_approver",
    totalDeductions: "2250.0000",
    netPayoutAmount: "42750.0000",
  });

  const payable = await settlementRepo.createPayable({
    tenantId,
    payableNumber: "PAY-2026-0001",
    settlementId: approvedSettlement.id,
    ownerId: "owner_james_kariuki",
    recipientName: "James Kariuki",
    destinationMpesaNumber: "+254722334455",
    amount: "45000.0000",
    taxWithholdingAmount: "2250.0000",
    netDisbursementAmount: "42750.0000",
    currency: "KES",
    payoutMethod: "MPESA_B2C",
    status: "PENDING",
    createdBy: actor.userId,
    retryCount: 0,
  });

  await assert.rejects(
    () =>
      paymentService.executeOwnerPayout(
        tenantId,
        {
          settlementPayableId: payable.id,
          provider: "FAKE_PROVIDER",
          notes: "Self-approval payout must be rejected",
        },
        { userId: "user_finance_approver", tenantId, role: "FINANCE_ADMIN" }
      ),
    (err: any) => err?.code === "SEPARATION_OF_DUTIES"
  );
  console.log("  ✓ Settlement approver cannot execute the same payout");

  const payoutResult = await paymentService.executeOwnerPayout(
    tenantId,
    {
      settlementPayableId: payable.id,
      provider: "FAKE_PROVIDER",
      notes: "Monthly vehicle revenue payout",
    },
    actor
  );

  assert.strictEqual(payoutResult.payment.purpose, "OWNER_SETTLEMENT");
  assert.strictEqual(payoutResult.payment.direction, "OUTBOUND");
  assert.strictEqual(payoutResult.payment.amount, "42750.0000");
  assert.strictEqual(payoutResult.payment.status, "ALLOCATED");
  assert.strictEqual(payoutResult.payable.status, "PAID");
  const paidSettlement = await settlementRepo.findById(approvedSettlement.id, tenantId);
  assert.strictEqual(paidSettlement?.status, "PAID");
  assert.ok(paidSettlement?.payoutReference, "Provider payout reference must seal the settlement");
  console.log("  ✓ Provider payout sealed both payable and settlement PAID");

  // Payout on already paid payable must fail
  try {
    await paymentService.executeOwnerPayout(
      tenantId,
      { settlementPayableId: payable.id, provider: "FAKE_PROVIDER" },
      actor
    );
    assert.fail("Should have thrown SettlementAlreadyPaidError");
  } catch (err: any) {
    assert.strictEqual(err.name, "SettlementAlreadyPaidError");
  }
  console.log("  ✓ Owner settlement payout executed; payable status is PAID");

  // --------------------------------------------------------------------------
  // TEST 9: Reconciliation Scanner
  // --------------------------------------------------------------------------
  console.log("\nTEST 9: Reconciliation Scanner & Discrepancy Tracking");
  // webhookResult.payment (8500 KES) is unallocated; let's age it slightly
  const unallocPmt = webhookResult.payment;
  if (unallocPmt) {
    const olderDate = new Date(Date.now() - 1000 * 120).toISOString(); // 2 min ago
    await paymentRepo.update(unallocPmt.id, tenantId, { createdAt: olderDate });
  }

  const scanIssues = await paymentService.runReconciliationScan(tenantId);
  assert.ok(scanIssues.length >= 1, "Should detect at least 1 unallocated payment issue");
  const unallocIssue = scanIssues.find((i) => i.issueType === "UNALLOCATED_PAYMENT");
  assert.ok(unallocIssue, "Should detect UNALLOCATED_PAYMENT issue");

  // Resolve issue
  const resolved = await paymentService.resolveReconciliationIssue(tenantId, unallocIssue.id);
  assert.strictEqual(resolved.resolved, true);
  console.log("  ✓ Reconciliation scan detected unallocated payment and resolved issue");

  console.log("\n======================================================================");
  console.log("ALL SPRINT 22 PAYMENT & PROVIDER CONTRACT TESTS PASSED PERFECTLY!");
  console.log("======================================================================\n");
}

runPaymentSuite().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
