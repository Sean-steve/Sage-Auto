// ============================================================================
// CAR HIRE OS — SPRINT 23 VERIFICATION SUITE
// M-Pesa Integration: STK Push, Callbacks, C2B, B2C, Security & Reconciliation
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
} from "../src/index";
import { PaymentService } from "../../../apps/api/src/modules/payments/application/payment.service";
import { PaymentProviderRegistry } from "../../../apps/api/src/modules/payments/infrastructure/providers/provider-registry";
import {
  MpesaPaymentProvider,
  MpesaConfigProvider,
  MpesaPhoneNormalizer,
  MpesaSecurityService,
  MpesaAuthService,
  MpesaDarajaClient,
  InvalidMpesaPhoneNumberError,
} from "../../../apps/api/src/modules/payments/infrastructure/providers/mpesa/index";

async function runMpesaSuite() {
  console.log("----------------------------------------------------------------------");
  console.log("RUNNING SPRINT 23: M-PESA DARAJA & PAYMENT LIFECYCLE TEST SUITE");
  console.log("----------------------------------------------------------------------\n");

  const tenantId = "tenant_ke_nairobi_01";
  const actor = { userId: "user_finance_ops", tenantId, role: "FINANCE_ADMIN" };

  // --------------------------------------------------------------------------
  // TEST 1: Environment Separation & Safe Redaction
  // --------------------------------------------------------------------------
  console.log("TEST 1: Sandbox vs Production Environment Separation & Redaction");
  const sandboxConfig = new MpesaConfigProvider({ environment: "SANDBOX" });
  assert.strictEqual(sandboxConfig.getConfig().environment, "SANDBOX");
  assert.ok(sandboxConfig.getEndpoints().stkPushUrl.includes("sandbox.safaricom.co.ke"));

  const prodConfig = new MpesaConfigProvider({
    environment: "PRODUCTION",
    consumerKey: "prod_consumer_key_123",
    consumerSecret: "prod_consumer_secret_456",
    passkey: "prod-passkey-32-chars-long-enough-123456",
    shortcode: "600000",
    initiatorName: "prod_api_user",
    securityCredential: "prod_security_credential_abcdefg",
    webhookSharedSecret: "prod-webhook-secret-32-chars-long-abcde",
  });
  assert.strictEqual(prodConfig.getConfig().environment, "PRODUCTION");
  assert.ok(prodConfig.getEndpoints().stkPushUrl.includes("api.safaricom.co.ke"));

  assert.throws(
    () =>
      new MpesaConfigProvider({
        environment: "PRODUCTION",
        consumerKey: "TEST_CONSUMER_KEY",
        consumerSecret: "TEST_CONSUMER_SECRET",
        passkey: "testpasskey",
        shortcode: "174379",
        initiatorName: "testapi",
        securityCredential: "TEST_CREDENTIAL",
        webhookSharedSecret: "test-webhook-secret",
      }),
    /Production\/staging M-Pesa configuration requires explicit non-placeholder values/i,
    "Production should reject placeholder M-Pesa credentials"
  );

  const safeLog = sandboxConfig.toSafeLogObject();
  assert.strictEqual((safeLog as any).passkey, undefined, "Passkey must NEVER appear in logs");
  assert.strictEqual((safeLog as any).consumerSecret, undefined, "Consumer secret must NEVER appear in logs");
  console.log("  ✓ Strict environment separation and credential redaction verified\n");

  // --------------------------------------------------------------------------
  // TEST 2: Phone Number Normalization & Validation
  // --------------------------------------------------------------------------
  console.log("TEST 2: Kenyan Phone Number Normalization (Safaricom MSISDN)");
  assert.strictEqual(MpesaPhoneNormalizer.normalize("+254712345678"), "254712345678");
  assert.strictEqual(MpesaPhoneNormalizer.normalize("0712345678"), "254712345678");
  assert.strictEqual(MpesaPhoneNormalizer.normalize("254712345678"), "254712345678");
  assert.strictEqual(MpesaPhoneNormalizer.normalize("0110123456"), "254110123456");
  assert.strictEqual(MpesaPhoneNormalizer.normalize("+254 712-345-678"), "254712345678");
  assert.strictEqual(MpesaPhoneNormalizer.mask("+254712345678"), "2547****5678");

  assert.throws(
    () => MpesaPhoneNormalizer.normalize("0812345678"),
    (err: any) => err instanceof InvalidMpesaPhoneNumberError,
    "Non-Kenyan or non-supported mobile prefix must be rejected"
  );
  assert.throws(
    () => MpesaPhoneNormalizer.normalize("+1234567890"),
    (err: any) => err instanceof InvalidMpesaPhoneNumberError,
    "International non-Kenyan phone must be rejected"
  );
  console.log("  ✓ MSISDN normalization and strict prefix validation verified\n");

  // --------------------------------------------------------------------------
  // TEST 3: Cryptographic Password & Security Credential Generation
  // --------------------------------------------------------------------------
  console.log("TEST 3: Security Service: Passkey Password & Timestamp");
  const timestamp = MpesaSecurityService.generateTimestamp(new Date("2026-09-06T15:30:45Z"));
  assert.strictEqual(timestamp, "20260906153045");

  const password = MpesaSecurityService.generateStkPassword("174379", "testpasskey", timestamp);
  const expectedPassword = Buffer.from("174379testpasskey20260906153045").toString("base64");
  assert.strictEqual(password, expectedPassword);

  const securityCred = MpesaSecurityService.generateSecurityCredential("TestPassword123");
  assert.ok(securityCred.length > 0, "Security credential generated");
  console.log("  ✓ Timestamp formatting and STK password generation verified\n");

  // --------------------------------------------------------------------------
  // TEST 4: OAuth Token Caching & Deduplication
  // --------------------------------------------------------------------------
  console.log("TEST 4: Daraja OAuth Token Caching & Thundering Herd Prevention");
  const authConfig = new MpesaConfigProvider({ consumerKey: "TEST_KEY_123", consumerSecret: "TEST_SECRET_456" });
  const authService = new MpesaAuthService(authConfig);

  // Parallel token fetches should coalesce into single request
  const [token1, token2] = await Promise.all([
    authService.getAccessToken(),
    authService.getAccessToken(),
  ]);
  assert.strictEqual(token1, token2, "Parallel token calls must share single in-flight promise");
  assert.ok(token1.includes("mock_daraja_token"));
  console.log("  ✓ Token cache and in-flight mutex deduplication verified\n");

  // --------------------------------------------------------------------------
  // SETUP FULL APPLICATION FOR DOMAIN INTEGRATION TESTS
  // --------------------------------------------------------------------------
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

  const sharedSecret = "mpesa_secure_token_secret_xyz";
  const mpesaConfig = new MpesaConfigProvider({
    environment: "SANDBOX",
    consumerKey: "TEST_CONSUMER_KEY",
    consumerSecret: "TEST_CONSUMER_SECRET",
    shortcode: "174379",
    passkey: "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919",
    webhookSharedSecret: sharedSecret,
  });
  const mpesaAuth = new MpesaAuthService(mpesaConfig);
  const mpesaClient = new MpesaDarajaClient(mpesaConfig, mpesaAuth);
  const mpesaProvider = new MpesaPaymentProvider(mpesaConfig, mpesaAuth, mpesaClient);

  const registry = new PaymentProviderRegistry();
  registry.register(mpesaProvider);

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
  // TEST 5: STK Push Initiation (Lipa Na M-Pesa Online)
  // --------------------------------------------------------------------------
  console.log("TEST 5: STK Push Initiation (Attempt Created in PENDING_CALLBACK)");
  const invoice = await invoiceRepo.create({
    tenantId,
    invoiceNumber: "INV-2026-0001",
    customerId: "cust_safari_001",
    billingSnapshot: { customerName: "Safari Explorer", customerEmail: "safari@example.com" },
    status: "ISSUED",
    subtotal: "8500.0000",
    taxTotal: "0.0000",
    discountTotal: "0.0000",
    total: "8500.0000",
    amountPaid: "0.0000",
    amountOutstanding: "8500.0000",
    amountCredited: "0.0000",
    currency: "KES",
    issueDate: "2026-09-01",
    dueDate: "2026-09-15",
    lineItems: [],
  });

  const stkAttempt = await paymentService.initiatePaymentAttempt(
    tenantId,
    {
      purpose: "CUSTOMER_INVOICE",
      amount: "8500.0000",
      currency: "KES",
      provider: "MPESA_DARAJA",
      customerId: "cust_safari_001",
      customerPhone: "+254712345678",
      targetId: invoice.id,
      metadata: { accountReference: "INV001" },
    },
    actor
  );

  assert.ok(stkAttempt.id, "Payment attempt should have an ID");
  assert.strictEqual(stkAttempt.status, "PENDING_CALLBACK", "STK push must be PENDING_CALLBACK");
  assert.strictEqual(stkAttempt.amount, "8500.0000");
  assert.ok(stkAttempt.providerReference?.startsWith("ws_CO_"), "providerReference should be CheckoutRequestID");
  assert.ok(stkAttempt.providerRequestReference?.startsWith("MR_"), "providerRequestReference should be MerchantRequestID");

  // Verify server-authoritative rule: NO Payment record exists yet
  const paymentsBeforeCallback = await paymentRepo.listByTenant(tenantId);
  assert.strictEqual(paymentsBeforeCallback.length, 0, "No payment record must exist before callback");
  console.log("  ✓ STK push initiated; attempt stored in PENDING_CALLBACK; zero premature payments\n");

  // --------------------------------------------------------------------------
  // TEST 6: Zero-Trust Callback Security Validation
  // --------------------------------------------------------------------------
  console.log("TEST 6: Zero-Trust Callback Security (Tampered Signature / Secret Rejection)");
  const checkoutId = stkAttempt.providerReference!;
  const fakeCallbackPayload = {
    Body: {
      stkCallback: {
        MerchantRequestID: stkAttempt.providerRequestReference!,
        CheckoutRequestID: checkoutId,
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully.",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: 8500 },
            { Name: "MpesaReceiptNumber", Value: "QGH88219901" },
            { Name: "TransactionDate", Value: 20260906154500 },
            { Name: "PhoneNumber", Value: 254712345678 },
          ],
        },
      },
    },
  };

  // 1. Invalid secret token -> rejected
  await assert.rejects(
    async () => {
      await paymentService.handleWebhook(
        "MPESA_DARAJA",
        { "x-safaricom-token": "WRONG_TOKEN" },
        fakeCallbackPayload
      );
    },
    (err: any) => err.name === "InvalidWebhookSignatureError",
    "Invalid callback token must throw InvalidWebhookSignatureError"
  );
  console.log("  ✓ Unauthenticated / tampered callback strictly rejected\n");

  // --------------------------------------------------------------------------
  // TEST 7: Authoritative Callback Ingestion & Payment Creation
  // --------------------------------------------------------------------------
  console.log("TEST 7: Authoritative STK Callback Processing & Payment Creation");
  const validHeaders = { "x-safaricom-token": sharedSecret, "x-tenant-id": tenantId };

  const callbackResult = await paymentService.handleWebhook(
    "MPESA_DARAJA",
    validHeaders,
    fakeCallbackPayload
  );

  assert.strictEqual(callbackResult.status, "PROCESSED", "Status should be PROCESSED on successful callback");
  assert.ok(callbackResult.payment, "Authoritative Payment record must be returned");
  assert.strictEqual(callbackResult.payment?.providerTransactionId, "QGH88219901", "Transaction ID must be MpesaReceiptNumber");
  assert.strictEqual(callbackResult.payment?.amount, "8500.0000");
  assert.strictEqual(callbackResult.payment?.status, "VERIFIED");
  assert.strictEqual(callbackResult.payment?.provider, "MPESA_DARAJA");

  // Verify auto-allocation took place
  const refreshedPmt = await paymentRepo.findById(callbackResult.payment!.id, tenantId);
  assert.strictEqual(refreshedPmt?.allocatedAmount, "8500.0000");
  const updatedInvoice = await invoiceRepo.findById(invoice.id, tenantId);
  assert.strictEqual(updatedInvoice?.status, "PAID");
  assert.strictEqual(updatedInvoice?.amountPaid, "8500.0000");

  // Verify attempt updated to SUCCEEDED
  const updatedAttempt = await attemptRepo.findById(stkAttempt.id, tenantId);
  assert.strictEqual(updatedAttempt?.status, "SUCCEEDED", "PaymentAttempt must transition to SUCCEEDED");
  console.log("  ✓ Authoritative Payment created with MpesaReceiptNumber; PaymentAttempt set to SUCCEEDED\n");

  // --------------------------------------------------------------------------
  // TEST 8: Callback Idempotency & Duplicate Replay Protection
  // --------------------------------------------------------------------------
  console.log("TEST 8: Callback Idempotency & Replay Protection");
  const replayResult = await paymentService.handleWebhook(
    "MPESA_DARAJA",
    validHeaders,
    fakeCallbackPayload
  );
  assert.ok(
    replayResult.status === "ALREADY_PROCESSED" || replayResult.status === "ALREADY_RECORDED",
    "Replay callback must return idempotent status"
  );

  // Ensure total payments count remains 1 (no duplicate payment)
  const allPayments = await paymentRepo.listByTenant(tenantId);
  assert.strictEqual(allPayments.length, 1, "Duplicate callback must NOT create a duplicate payment record");
  console.log("  ✓ Duplicate callback safely de-duplicated without secondary ledger entry\n");

  // --------------------------------------------------------------------------
  // TEST 9: STK Push User Cancellation (ResultCode 1032)
  // --------------------------------------------------------------------------
  console.log("TEST 9: Customer Cancellation Handling (ResultCode 1032)");
  const cancelAttempt = await paymentService.initiatePaymentAttempt(
    tenantId,
    {
      purpose: "CUSTOMER_INVOICE",
      amount: "3000.0000",
      currency: "KES",
      provider: "MPESA_DARAJA",
      customerPhone: "+254712345678",
    },
    actor
  );

  const cancelCallbackPayload = {
    Body: {
      stkCallback: {
        MerchantRequestID: cancelAttempt.providerRequestReference!,
        CheckoutRequestID: cancelAttempt.providerReference!,
        ResultCode: 1032,
        ResultDesc: "Request cancelled by user",
      },
    },
  };

  const cancelResult = await paymentService.handleWebhook(
    "MPESA_DARAJA",
    validHeaders,
    cancelCallbackPayload
  );

  assert.strictEqual(cancelResult.status, "ATTEMPT_FAILED");
  const failedAttempt = await attemptRepo.findById(cancelAttempt.id, tenantId);
  assert.strictEqual(failedAttempt?.status, "FAILED");
  assert.ok(failedAttempt?.failureReason?.includes("cancelled"), "Failure reason should record cancellation");

  // Verify no payment was created
  const paymentsAfterCancel = await paymentRepo.listByTenant(tenantId);
  assert.strictEqual(paymentsAfterCancel.length, 1, "No payment record created for cancelled attempt");
  console.log("  ✓ Customer cancellation updated attempt to FAILED without financial recording\n");

  // --------------------------------------------------------------------------
  // TEST 10: STK Push Timeout Handling (ResultCode 1037)
  // --------------------------------------------------------------------------
  console.log("TEST 10: Customer Prompt Timeout Handling (ResultCode 1037)");
  const timeoutAttempt = await paymentService.initiatePaymentAttempt(
    tenantId,
    {
      purpose: "CUSTOMER_INVOICE",
      amount: "4500.0000",
      currency: "KES",
      provider: "MPESA_DARAJA",
      customerPhone: "+254712345678",
    },
    actor
  );

  const timeoutCallbackPayload = {
    Body: {
      stkCallback: {
        MerchantRequestID: timeoutAttempt.providerRequestReference!,
        CheckoutRequestID: timeoutAttempt.providerReference!,
        ResultCode: 1037,
        ResultDesc: "DS timeout user cannot be reached",
      },
    },
  };

  await paymentService.handleWebhook("MPESA_DARAJA", validHeaders, timeoutCallbackPayload);
  const timedOutAttempt = await attemptRepo.findById(timeoutAttempt.id, tenantId);
  assert.strictEqual(timedOutAttempt?.status, "FAILED");
  console.log("  ✓ USSD prompt timeout mapped to FAILED attempt state\n");

  // --------------------------------------------------------------------------
  // TEST 11: Direct C2B Paybill Ingestion (Confirmation Flow)
  // --------------------------------------------------------------------------
  console.log("TEST 11: Direct C2B Paybill Confirmation Flow");
  const c2bPayload = {
    TransactionType: "Pay Bill",
    TransID: "QGH99120011",
    TransTime: "20260906160000",
    TransAmount: "12000.00",
    BusinessShortCode: "174379",
    BillRefNumber: "INV-2026-999",
    MSISDN: "254712345678",
    FirstName: "Wanjiku",
    LastName: "Kariuki",
  };

  const c2bResult = await paymentService.handleWebhook("MPESA_DARAJA", validHeaders, c2bPayload);
  assert.ok(c2bResult.payment, "Direct C2B confirmation must create a payment");
  assert.strictEqual(c2bResult.payment?.providerTransactionId, "QGH99120011");
  assert.strictEqual(c2bResult.payment?.amount, "12000.0000");
  assert.strictEqual(c2bResult.payment?.unallocatedAmount, "12000.0000");
  console.log("  ✓ Direct C2B confirmation ingested as verified unallocated payment\n");

  // --------------------------------------------------------------------------
  // TEST 12: B2C Owner Settlement Payout Execution
  // --------------------------------------------------------------------------
  console.log("TEST 12: B2C Vehicle Owner Settlement Payout Execution");
  const mpesaSettlement = await settlementRepo.create({
    tenantId,
    settlementNumber: "SET-2026-MPESA-002",
    ownerId: "owner_serena_holdings",
    ownerName: "Serena Holdings Fleet Account",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    currency: "KES",
    status: "APPROVED",
    calculatedAt: "2026-09-01T08:00:00Z",
    calculatedBy: "user_finance_calculator",
    approvedAt: "2026-09-01T09:00:00Z",
    approvedBy: "user_finance_approver",
    totalDeductions: "0.0000",
    netPayoutAmount: "45000.0000",
  });

  const payable = await settlementRepo.createPayable({
    tenantId,
    payableNumber: "PAY-2026-0002",
    settlementId: mpesaSettlement.id,
    ownerId: "owner_serena_holdings",
    recipientName: "Serena Holdings Fleet Account",
    destinationMpesaNumber: "+254722000111",
    amount: "45000.0000",
    taxWithholdingAmount: "0.0000",
    netDisbursementAmount: "45000.0000",
    currency: "KES",
    payoutMethod: "MPESA_B2C",
    status: "PENDING",
    createdBy: actor.userId,
    retryCount: 0,
  });

  const payoutResult = await paymentService.executeOwnerPayout(
    tenantId,
    {
      settlementPayableId: payable.id,
      provider: "MPESA_DARAJA",
      notes: "Monthly fleet payout via M-Pesa B2C",
    },
    actor
  );

  assert.strictEqual(payoutResult.payable.status, "PAID");
  assert.strictEqual(payoutResult.payment.purpose, "OWNER_SETTLEMENT");
  assert.strictEqual(payoutResult.payment.direction, "OUTBOUND");
  assert.strictEqual(payoutResult.payment.amount, "45000.0000");
  assert.strictEqual(payoutResult.payment.provider, "MPESA_DARAJA");
  assert.ok(payoutResult.payment.providerTransactionId.startsWith("AG_"), "ConversationID stored as transaction ID");
  const sealedMpesaSettlement = await settlementRepo.findById(mpesaSettlement.id, tenantId);
  assert.strictEqual(sealedMpesaSettlement?.status, "PAID");
  console.log("  ✓ B2C payout disbursed to vehicle owner; payable and settlement transitioned to PAID\n");

  // --------------------------------------------------------------------------
  // TEST 13: M-Pesa Reversal & Refund Execution
  // --------------------------------------------------------------------------
  console.log("TEST 13: M-Pesa Reversal & Refund Flow");
  // Use the verified C2B payment
  const origPayment = c2bResult.payment!;
  const refund = await paymentService.requestRefund(
    tenantId,
    {
      paymentId: origPayment.id,
      amount: "4000.0000",
      reason: "Customer partial deposit return",
    },
    actor
  );

  const executedRefund = await paymentService.approveAndExecuteRefund(
    tenantId,
    refund.id,
    { userId: "user_finance_refund_approver", tenantId, role: "FINANCE_ADMIN" }
  );
  assert.strictEqual(executedRefund.status, "COMPLETED");
  assert.ok(executedRefund.providerRefundReference?.startsWith("REV_"), "Reversal conversation ID captured");

  const refreshedPayment = await paymentRepo.findById(origPayment.id, tenantId);
  assert.strictEqual(refreshedPayment?.status, "PARTIALLY_REFUNDED");
  assert.strictEqual(refreshedPayment?.refundedAmount, "4000.0000");
  console.log("  ✓ M-Pesa reversal refund executed and original payment updated to PARTIALLY_REFUNDED\n");

  // --------------------------------------------------------------------------
  // TEST 14: Payment Reconciliation Scanner for M-Pesa
  // --------------------------------------------------------------------------
  console.log("TEST 14: Reconciliation Scanner (Unallocated C2B Payments & Stale Attempts)");
  const issues = await paymentService.runReconciliationScan(tenantId);
  assert.ok(Array.isArray(issues));
  console.log(`  ✓ Reconciliation scan completed, tracking ${issues.length} operational issues\n`);

  console.log("======================================================================");
  console.log("ALL SPRINT 23 M-PESA DARAJA & PAYMENT TESTS PASSED PERFECTLY (14/14)!");
  console.log("======================================================================\n");
}

runMpesaSuite().catch((err) => {
  console.error("FATAL ERROR IN SPRINT 23 TEST SUITE:", err);
  process.exit(1);
});
