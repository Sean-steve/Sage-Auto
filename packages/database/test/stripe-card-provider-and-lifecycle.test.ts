// ============================================================================
// CAR HIRE OS — SPRINT 24 VERIFICATION SUITE
// Card Payment Provider: Tokenized Checkout, 3DS, Webhooks, Refunds & Reconciliation
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
} from "../src/index";
import { PaymentService } from "../../../apps/api/src/modules/payments/application/payment.service";
import { PaymentProviderRegistry } from "../../../apps/api/src/modules/payments/infrastructure/providers/provider-registry";
import {
  StripeConfigProvider,
  StripeSecurityService,
  StripeClient,
  StripeCardPaymentProvider,
} from "../../../apps/api/src/modules/payments/infrastructure/providers/stripe/index";

async function runStripeCardSuite() {
  console.log("----------------------------------------------------------------------");
  console.log("RUNNING SPRINT 24: CARD PAYMENT PROVIDER & LIFECYCLE TEST SUITE");
  console.log("----------------------------------------------------------------------\n");

  const tenantId = "tenant_us_miami_01";
  const actor = { userId: "user_finance_ops", tenantId, role: "FINANCE_ADMIN" };

  // Reset repositories & simulator state
  PaymentAttemptRepository.clear();
  PaymentRepository.clear();
  PaymentAllocationRepository.clear();
  RefundRepository.clear();
  PaymentReconciliationRepository.clear();
  StripeClient.resetMocks();

  const previousAppEnv = process.env.APP_ENV;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousStripeEnvironment = process.env.STRIPE_ENVIRONMENT;
  const previousStripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const previousStripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const previousStripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.APP_ENV = "production";
  process.env.NODE_ENV = "production";
  delete process.env.STRIPE_ENVIRONMENT;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  assert.throws(
    () => new StripeConfigProvider(),
    /Stripe.*(secret|credential|production)|placeholder/i,
    "Production must reject missing Stripe credentials"
  );
  process.env.APP_ENV = previousAppEnv;
  process.env.NODE_ENV = previousNodeEnv;
  process.env.STRIPE_ENVIRONMENT = previousStripeEnvironment;
  process.env.STRIPE_SECRET_KEY = previousStripeSecretKey;
  process.env.STRIPE_PUBLISHABLE_KEY = previousStripePublishableKey;
  process.env.STRIPE_WEBHOOK_SECRET = previousStripeWebhookSecret;

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

  const configProvider = new StripeConfigProvider({
    environment: "TEST",
    publishableKey: "pk_test_carhire_canonical_testkey",
    secretKey: "sk_test_carhire_canonical_secretkey",
    webhookSecret: "whsec_test_stripe_secret_12345",
  });

  const stripeClient = new StripeClient({ configProvider, useOfflineSimulator: true });
  const stripeProvider = new StripeCardPaymentProvider(configProvider, stripeClient);

  const registry = new PaymentProviderRegistry();
  registry.register(stripeProvider);

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

  // --------------------------------------------------------------------------
  // TEST 1: Environment Configuration, Key Redaction & Secret Safety
  // --------------------------------------------------------------------------
  console.log("TEST 1: Stripe Config Provider, Environment Separation & Secret Redaction");
  assert.strictEqual(configProvider.isProduction(), false);
  assert.strictEqual(configProvider.getConfig().environment, "TEST");
  assert.ok(configProvider.getConfig().secretKey.startsWith("sk_test_"));

  const safeLog = configProvider.toSafeLogObject();
  assert.strictEqual((safeLog as any).secretKey, undefined, "Secret key must NEVER appear in logs");
  assert.strictEqual((safeLog as any).webhookSecret, undefined, "Webhook secret must NEVER appear in logs");
  assert.ok(typeof safeLog.publishableKey === "string");
  console.log("  ✓ Strict environment configuration and secret redaction verified\n");

  // --------------------------------------------------------------------------
  // TEST 2: Security Service: HMAC-SHA256 Signature Verification & Currency Minor Units
  // --------------------------------------------------------------------------
  console.log("TEST 2: Webhook Signature Verification, Timestamp Tolerance & Currency Scaling");
  const testPayload = JSON.stringify({ id: "evt_test_123", type: "checkout.session.completed" });
  const secret = configProvider.getConfig().webhookSecret;

  // Valid signature
  const validHeader = StripeSecurityService.generateTestSignatureHeader(testPayload, secret);
  assert.strictEqual(
    StripeSecurityService.verifyWebhookSignature(validHeader, testPayload, secret),
    true,
    "Valid HMAC-SHA256 signature should pass"
  );

  // Tampered payload
  assert.strictEqual(
    StripeSecurityService.verifyWebhookSignature(validHeader, testPayload + "_tampered", secret),
    false,
    "Tampered payload signature must be rejected"
  );

  // Tampered secret
  assert.strictEqual(
    StripeSecurityService.verifyWebhookSignature(validHeader, testPayload, "whsec_wrong_secret"),
    false,
    "Wrong webhook secret must be rejected"
  );

  // Expired timestamp (> 300s)
  const expiredHeader = StripeSecurityService.generateTestSignatureHeader(
    testPayload,
    secret,
    Math.floor(Date.now() / 1000) - 400
  );
  assert.strictEqual(
    StripeSecurityService.verifyWebhookSignature(expiredHeader, testPayload, secret),
    false,
    "Expired signature timestamp must be rejected to prevent replay attacks"
  );

  // Currency Minor Unit Scaling (ISO 4217)
  assert.strictEqual(StripeSecurityService.toMinorUnits("150.0000", "USD"), 15000);
  assert.strictEqual(StripeSecurityService.fromMinorUnits(15000, "USD"), "150.0000");
  assert.strictEqual(StripeSecurityService.toMinorUnits("2500.0000", "JPY"), 2500); // Zero decimal
  assert.strictEqual(StripeSecurityService.fromMinorUnits(2500, "JPY"), "2500.0000");
  assert.strictEqual(StripeSecurityService.toMinorUnits("50.5000", "KWD"), 50500); // Three decimal
  assert.strictEqual(StripeSecurityService.fromMinorUnits(50500, "KWD"), "50.5000");

  // Card Masking
  const cardMask = StripeSecurityService.formatMaskedCard({
    brand: "VISA",
    last4: "4242",
    expMonth: 12,
    expYear: 2028,
  });
  assert.strictEqual(cardMask, "VISA •••• 4242 (Exp 12/28)");
  console.log("  ✓ HMAC-SHA256 signature verification, replay protection and currency scaling verified\n");

  // --------------------------------------------------------------------------
  // TEST 3: Card PaymentAttempt Initiation & PCI Minimization
  // --------------------------------------------------------------------------
  console.log("TEST 3: Card PaymentAttempt Initiation (Intent != Payment, Status = PENDING_REDIRECT)");
  const attempt = await paymentService.initiatePaymentAttempt(
    tenantId,
    {
      purpose: "CUSTOMER_INVOICE",
      amount: "450.0000",
      currency: "USD",
      provider: "STRIPE_CARD",
      customerId: "cust_john_doe",
      customerEmail: "john.doe@example.com",
      customerName: "John Doe",
      metadata: { bookingId: "BK-2026-99" },
    },
    actor
  );

  assert.ok(attempt.id, "Attempt should have generated an ID");
  assert.strictEqual(attempt.provider, "STRIPE_CARD");
  assert.strictEqual(attempt.status, "PENDING_REDIRECT");
  assert.strictEqual(attempt.amount, "450.0000");
  assert.strictEqual(attempt.currency, "USD");
  assert.ok(attempt.providerReference?.startsWith("cs_test_"), "Should hold Checkout Session reference");
  assert.ok(attempt.checkoutUrl?.includes("checkout.stripe.com"), "Should hold hosted Checkout URL");

  // CRITICAL: Zero authoritative payments created on initiation
  const existingPayments = await paymentRepo.listByTenant(tenantId);
  assert.strictEqual(existingPayments.length, 0, "No Payment record must exist prior to verification");
  console.log("  ✓ PaymentAttempt created in PENDING_REDIRECT; checkoutUrl generated; zero premature payments\n");

  // --------------------------------------------------------------------------
  // TEST 4: Client-Claimed Success Strictly Rejected
  // --------------------------------------------------------------------------
  console.log("TEST 4: Client-Claimed Success Is Strictly Rejected (Zero-Trust Browser Defense)");
  await assert.rejects(
    async () => {
      await paymentService.verifyPaymentAttempt(tenantId, attempt.id, actor, true);
    },
    (err: any) => err instanceof ClientPaymentEvidenceRejectedError,
    "Browser redirect return must be rejected as unauthoritative evidence"
  );
  console.log("  ✓ Browser return strictly rejected without server-side verification\n");

  // --------------------------------------------------------------------------
  // TEST 5: Authoritative Server-Side Provider Verification
  // --------------------------------------------------------------------------
  console.log("TEST 5: Authoritative Server-Side Verification via Stripe Status Query");
  // Simulate user completing card payment with 3DS on hosted checkout
  const session = await stripeClient.getCheckoutSession(attempt.providerReference!);
  session.payment_status = "paid";
  StripeClient.setMockSession(session);

  const verifiedPayment = await paymentService.verifyPaymentAttempt(tenantId, attempt.id, actor);

  assert.ok(verifiedPayment.id, "Verified Payment must have an ID");
  assert.strictEqual(verifiedPayment.status, "VERIFIED");
  assert.strictEqual(verifiedPayment.provider, "STRIPE_CARD");
  assert.strictEqual(verifiedPayment.amount, "450.0000");
  assert.strictEqual(verifiedPayment.unallocatedAmount, "450.0000");
  assert.strictEqual(verifiedPayment.allocatedAmount, "0.0000");
  assert.strictEqual(verifiedPayment.verificationSource, "STATUS_QUERY");
  assert.ok(verifiedPayment.payerReference?.includes("4242"), "Masked card must be recorded");

  // Verify attempt is updated to SUCCEEDED
  const updatedAttempt = await attemptRepo.findById(attempt.id, tenantId);
  assert.strictEqual(updatedAttempt?.status, "SUCCEEDED");

  // Idempotent re-verification
  const reverified = await paymentService.verifyPaymentAttempt(tenantId, attempt.id, actor);
  assert.strictEqual(reverified.id, verifiedPayment.id, "Re-verification must return existing payment");
  console.log("  ✓ Authoritative Payment created in status VERIFIED; attempt updated to SUCCEEDED; re-verify idempotent\n");

  // --------------------------------------------------------------------------
  // TEST 6: Webhook Processing: Ingestion, Signature Verification & Replay Protection
  // --------------------------------------------------------------------------
  console.log("TEST 6: Webhook Ingestion, Signature Validation & Replay Protection");
  const attempt2 = await paymentService.initiatePaymentAttempt(
    tenantId,
    {
      purpose: "CUSTOMER_INVOICE",
      amount: "120.0000",
      currency: "USD",
      provider: "STRIPE_CARD",
      customerId: "cust_jane_smith",
    },
    actor
  );

  const webhookPayload = {
    id: `evt_test_${Date.now()}_webhook_session`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: attempt2.providerReference,
        object: "checkout.session",
        payment_status: "paid",
        payment_intent: `pi_test_${Date.now()}_intent`,
        amount_total: 12000,
        currency: "usd",
        client_reference_id: attempt2.paymentIntentReference,
        customer_details: {
          email: "jane.smith@example.com",
          name: "Jane Smith",
        },
      },
    },
  };

  const rawWebhookBody = JSON.stringify(webhookPayload);
  const webhookHeaders = {
    "stripe-signature": StripeSecurityService.generateTestSignatureHeader(rawWebhookBody, secret),
    "content-type": "application/json",
  };

  // Tampered signature must fail
  assert.strictEqual(
    stripeProvider.verifyWebhookSignature({ "stripe-signature": "t=123,v1=tampered" }, rawWebhookBody),
    false,
    "Tampered signature header must return false"
  );

  await assert.rejects(
    async () => {
      await paymentService.handleWebhook(
        "STRIPE_CARD",
        { "stripe-signature": "t=123,v1=tampered" },
        webhookPayload,
        rawWebhookBody
      );
    },
    (err: any) => err instanceof InvalidWebhookSignatureError,
    "handleWebhook must throw InvalidWebhookSignatureError on tampered signature"
  );

  // Process valid webhook
  const webhookResult = await paymentService.handleWebhook(
    "STRIPE_CARD",
    webhookHeaders,
    webhookPayload,
    rawWebhookBody
  );

  assert.strictEqual(webhookResult.status, "PROCESSED");
  assert.ok(webhookResult.payment);
  assert.strictEqual(webhookResult.payment.status, "VERIFIED");
  assert.strictEqual(webhookResult.payment.amount, "120.0000");
  assert.strictEqual(webhookResult.payment.verificationSource, "WEBHOOK");

  // Replay protection: Submitting the same webhook event again must be idempotently handled
  const replayResult = await paymentService.handleWebhook(
    "STRIPE_CARD",
    webhookHeaders,
    webhookPayload,
    rawWebhookBody
  );
  assert.strictEqual(replayResult.status, "ALREADY_PROCESSED");
  console.log("  ✓ Webhook verified, payment created, and replay attack protected\n");

  // --------------------------------------------------------------------------
  // TEST 7: Direct PaymentIntent Succeeded Webhook Flow
  // --------------------------------------------------------------------------
  console.log("TEST 7: Direct PaymentIntent Succeeded Webhook Event Processing");
  const attempt3 = await paymentService.initiatePaymentAttempt(
    tenantId,
    {
      purpose: "CUSTOMER_INVOICE",
      amount: "75.0000",
      currency: "USD",
      provider: "STRIPE_CARD",
      customerId: "cust_direct_pi",
    },
    actor
  );

  const piWebhookPayload = {
    id: `evt_test_${Date.now()}_pi_success`,
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: `pi_test_${Date.now()}_direct`,
        object: "payment_intent",
        status: "succeeded",
        amount_received: 7500,
        currency: "usd",
        latest_charge: `ch_test_${Date.now()}_charge`,
        charges: {
          data: [
            {
              id: `ch_test_${Date.now()}_charge`,
              paid: true,
              amount_refunded: 0,
              payment_method_details: {
                card: {
                  brand: "mastercard",
                  last4: "8899",
                  exp_month: 8,
                  exp_year: 2027,
                },
              },
            },
          ],
        },
        metadata: {
          intentReference: attempt3.paymentIntentReference,
        },
      },
    },
  };

  const rawPiBody = JSON.stringify(piWebhookPayload);
  const piHeaders = {
    "stripe-signature": StripeSecurityService.generateTestSignatureHeader(rawPiBody, secret),
  };

  const piResult = await paymentService.handleWebhook("STRIPE_CARD", piHeaders, piWebhookPayload, rawPiBody);
  assert.strictEqual(piResult.status, "PROCESSED");
  assert.strictEqual(piResult.payment?.amount, "75.0000");
  assert.ok(piResult.payment?.payerReference?.includes("MASTERCARD •••• 8899"));
  console.log("  ✓ Direct payment_intent.succeeded webhook created verified payment with masked card\n");

  // --------------------------------------------------------------------------
  // TEST 8: Card Decline / Failed PaymentIntent Webhook Handling
  // --------------------------------------------------------------------------
  console.log("TEST 8: Card Decline & Payment Failure Callback Handling");
  const attempt4 = await paymentService.initiatePaymentAttempt(
    tenantId,
    {
      purpose: "CUSTOMER_INVOICE",
      amount: "300.0000",
      currency: "USD",
      provider: "STRIPE_CARD",
    },
    actor
  );

  const failPayload = {
    id: `evt_test_${Date.now()}_pi_fail`,
    type: "payment_intent.payment_failed",
    data: {
      object: {
        id: `pi_test_declined_${Date.now()}`,
        object: "payment_intent",
        last_payment_error: {
          code: "card_declined",
          decline_code: "insufficient_funds",
          message: "Your card has insufficient funds.",
        },
        metadata: {
          intentReference: attempt4.paymentIntentReference,
        },
      },
    },
  };

  const rawFailBody = JSON.stringify(failPayload);
  const failHeaders = {
    "stripe-signature": StripeSecurityService.generateTestSignatureHeader(rawFailBody, secret),
  };

  const failResult = await paymentService.handleWebhook("STRIPE_CARD", failHeaders, failPayload, rawFailBody);
  assert.strictEqual(failResult.status, "ATTEMPT_FAILED");
  assert.strictEqual(failResult.attempt?.status, "FAILED");
  assert.ok(failResult.attempt?.failureReason?.includes("insufficient funds"));

  const pmtCount = (await paymentRepo.listByTenant(tenantId)).filter((p) => p.attemptId === attempt4.id);
  assert.strictEqual(pmtCount.length, 0, "No payment created on declined card");
  console.log("  ✓ Card decline transitioned attempt to FAILED; zero payments created\n");

  // --------------------------------------------------------------------------
  // TEST 9: Auto-Allocation to Operational Invoice
  // --------------------------------------------------------------------------
  console.log("TEST 9: Card Webhook Auto-Allocation to Operational Invoice");
  const invoice = await invoiceRepo.create({
    tenantId,
    customerId: "cust_john_doe",
    billingSnapshot: { customerName: "John Doe", customerEmail: "john.doe@example.com" },
    currency: "USD",
    subtotal: "200.0000",
    taxTotal: "0.0000",
    discountTotal: "0.0000",
    total: "200.0000",
    amountPaid: "0.0000",
    amountCredited: "0.0000",
    amountOutstanding: "200.0000",
    status: "ISSUED",
    issueDate: "2026-09-01",
    dueDate: "2026-09-15",
    lineItems: [],
  });

  const invoiceAttempt = await paymentService.initiatePaymentAttempt(
    tenantId,
    {
      purpose: "CUSTOMER_INVOICE",
      amount: "200.0000",
      currency: "USD",
      provider: "STRIPE_CARD",
      targetId: invoice.id,
      customerId: "cust_john_doe",
    },
    actor
  );

  const invWebhookPayload = {
    id: `evt_test_${Date.now()}_inv_auto_alloc`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: invoiceAttempt.providerReference,
        payment_status: "paid",
        payment_intent: `pi_test_${Date.now()}_inv`,
        amount_total: 20000,
        currency: "usd",
        client_reference_id: invoiceAttempt.paymentIntentReference,
      },
    },
  };

  const rawInvBody = JSON.stringify(invWebhookPayload);
  const invHeaders = {
    "stripe-signature": StripeSecurityService.generateTestSignatureHeader(rawInvBody, secret),
  };

  const invRes = await paymentService.handleWebhook("STRIPE_CARD", invHeaders, invWebhookPayload, rawInvBody);
  assert.strictEqual(invRes.status, "PROCESSED");

  // Verify invoice transitioned to PAID
  const updatedInvoice = await invoiceRepo.findById(invoice.id, tenantId);
  assert.strictEqual(updatedInvoice?.status, "PAID");
  assert.strictEqual(updatedInvoice?.amountOutstanding, "0.0000");
  assert.strictEqual(updatedInvoice?.amountPaid, "200.0000");

  // Verify payment is fully ALLOCATED
  const updatedPmt = await paymentRepo.findById(invRes.payment!.id, tenantId);
  assert.strictEqual(updatedPmt?.status, "ALLOCATED");
  assert.strictEqual(updatedPmt?.allocatedAmount, "200.0000");
  assert.strictEqual(updatedPmt?.unallocatedAmount, "0.0000");
  console.log("  ✓ Card payment verified and auto-allocated; invoice marked PAID\n");

  // --------------------------------------------------------------------------
  // TEST 10: Partial & Full Card Refund Execution
  // --------------------------------------------------------------------------
  console.log("TEST 10: Card Refund Request, Approval & Execution via Stripe Refund API");
  const refundReq = await paymentService.requestRefund(
    tenantId,
    {
      paymentId: verifiedPayment.id,
      amount: "150.0000",
      reason: "Customer shortened rental booking by 1 day",
      sourceObligationType: "CUSTOMER_INVOICE",
    },
    actor
  );

  assert.strictEqual(refundReq.status, "PENDING");
  assert.strictEqual(refundReq.amount, "150.0000");

  // Over-refund exceeding payment balance must be rejected
  await assert.rejects(
    async () => {
      await paymentService.requestRefund(
        tenantId,
        {
          paymentId: verifiedPayment.id,
          amount: "500.0000",
          reason: "Excessive refund amount",
          sourceObligationType: "CUSTOMER_INVOICE",
        },
        actor
      );
    },
    (err: any) => err instanceof RefundExceedsPaymentError,
    "Refund exceeding payment balance must be rejected"
  );

  // Approve and execute refund via Stripe Refund API
  const executedRefund = await paymentService.approveAndExecuteRefund(tenantId, refundReq.id, actor);
  assert.strictEqual(executedRefund.status, "COMPLETED");
  assert.ok(executedRefund.providerRefundReference?.startsWith("re_test_"));

  // Check original payment status updated to PARTIALLY_REFUNDED
  const paymentAfterRefund = await paymentRepo.findById(verifiedPayment.id, tenantId);
  assert.strictEqual(paymentAfterRefund?.status, "PARTIALLY_REFUNDED");
  assert.strictEqual(paymentAfterRefund?.refundedAmount, "150.0000");
  console.log("  ✓ Partial refund executed via Stripe; original payment updated to PARTIALLY_REFUNDED\n");

  // --------------------------------------------------------------------------
  // TEST 11: Vehicle Owner Settlement Payout via Stripe Adapter
  // --------------------------------------------------------------------------
  console.log("TEST 11: Vehicle Owner Settlement Payout Execution");
  const payable = await settlementRepo.createPayable({
    tenantId,
    payableNumber: "PAY-2026-0001",
    settlementId: "settlement_001",
    ownerId: "owner_investor_corp",
    recipientName: "Investor Corp",
    destinationAccount: "acct_stripe_connect_123",
    amount: "1300.0000",
    taxWithholdingAmount: "50.0000",
    netDisbursementAmount: "1250.0000",
    currency: "USD",
    payoutMethod: "BANK_TRANSFER",
    status: "PENDING",
    createdBy: actor.userId,
    retryCount: 0,
  });

  const payoutResult = await paymentService.executeOwnerPayout(
    tenantId,
    {
      settlementPayableId: payable.id,
      provider: "STRIPE_CARD",
      notes: "Monthly vehicle revenue payout",
    },
    actor
  );

  assert.strictEqual(payoutResult.payable.status, "PAID");
  assert.strictEqual(payoutResult.payment.status, "ALLOCATED");
  assert.strictEqual(payoutResult.payment.amount, "1250.0000");
  assert.ok(payoutResult.payment.providerTransactionId?.startsWith("po_test_"));
  console.log("  ✓ Owner settlement payout disbursed via adapter; payable transitioned to PAID\n");

  // --------------------------------------------------------------------------
  // TEST 12: Reconciliation Scanner with Card Discrepancies
  // --------------------------------------------------------------------------
  console.log("TEST 12: Payment Reconciliation Scanner & Discrepancy Detection");
  const scanResult = await paymentService.runReconciliationScan(tenantId);
  assert.ok(Array.isArray(scanResult));
  console.log(`  ✓ Reconciliation scan completed, detected ${scanResult.length} issues\n`);

  // --------------------------------------------------------------------------
  // TEST 13: Full IPaymentProvider Contract Conformance
  // --------------------------------------------------------------------------
  console.log("TEST 13: IPaymentProvider Contract Completeness");
  assert.strictEqual(stripeProvider.name, "STRIPE_CARD");
  assert.ok(stripeProvider.capabilities.includes("INBOUND_PAYMENT"));
  assert.ok(stripeProvider.capabilities.includes("REFUND"));
  assert.ok(stripeProvider.capabilities.includes("STATUS_QUERY"));
  assert.ok(stripeProvider.capabilities.includes("WEBHOOK"));
  assert.ok(stripeProvider.capabilities.includes("PAYOUT"));
  assert.strictEqual(typeof stripeProvider.initializePayment, "function");
  assert.strictEqual(typeof stripeProvider.getPaymentStatus, "function");
  assert.strictEqual(typeof stripeProvider.verifyPayment, "function");
  assert.strictEqual(typeof stripeProvider.refundPayment, "function");
  assert.strictEqual(typeof stripeProvider.executePayout, "function");
  assert.strictEqual(typeof stripeProvider.verifyWebhookSignature, "function");
  assert.strictEqual(typeof stripeProvider.parseWebhookPayload, "function");
  console.log("  ✓ IPaymentProvider complete interface conformance verified\n");

  console.log("======================================================================");
  console.log("ALL SPRINT 24 CARD PAYMENT TESTS PASSED PERFECTLY (13/13)!");
  console.log("======================================================================");
}

runStripeCardSuite().catch((err) => {
  console.error("Sprint 24 Card Test Suite Failed:", err);
  process.exit(1);
});
