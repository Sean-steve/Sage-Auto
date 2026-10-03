// ============================================================================
// CAR HIRE OS — PAYMENT APPLICATION SERVICE (Sprint 22: DEV-009, DATA-002)
// Provider-Independent Payment Engine, Verification, Allocation, Refunds & Ledger Contracts
// ============================================================================

import type {
  Payment,
  PaymentAttempt,
  PaymentAllocation,
  Refund,
  PaymentReconciliationIssue,
  InitiatePaymentAttemptDto,
  RecordGovernedManualPaymentDto,
  AllocatePaymentDto,
  RequestRefundDto,
  ExecuteOwnerPayoutDto,
  ListPaymentsFilter,
  ListPaymentAttemptsFilter,
  ListRefundsFilter,
  PaymentActor,
  OwnerSettlementPayable,
  OperationalInvoice,
  DepositPosition,
  OperationalInvoiceStatus,
  ParsedWebhookEvent,
} from "@carhire/types";
import {
  IPaymentAttemptRepository,
  IPaymentRepository,
  IPaymentAllocationRepository,
  IRefundRepository,
  IPaymentReconciliationRepository,
  IWebhookRepository,
  IOperationalInvoiceRepository,
  IDepositPositionRepository,
  IBookingRepository,
  IOwnerSettlementRepository,
  IAuditRepository,
  IOutboxRepository,
  PaymentNotFoundError,
  PaymentAttemptNotFoundError,
  PaymentVerificationFailedError,
  PaymentCurrencyMismatchError,
  RefundNotFoundError,
  InvalidWebhookSignatureError,
  OperationalInvoiceNotFoundError,
  DepositPositionNotFoundError,
  SettlementPayableNotFoundError,
  SettlementAlreadyPaidError,
  ClientPaymentEvidenceRejectedError,
} from "@carhire/database";
import { PaymentStateMachine } from "../domain/payment-state-machine";
import { PaymentPostingContractFactory } from "../domain/posting-contract.factory";
import { PaymentProviderRegistry } from "../infrastructure/providers/provider-registry";

function to4Dec(val: string | number | undefined): string {
  if (val === undefined || val === null) return "0.0000";
  const num = typeof val === "number" ? val : parseFloat(val);
  return isNaN(num) ? "0.0000" : num.toFixed(4);
}

export class PaymentService {
  private isProductionLike(): boolean {
    const envName = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
    return envName === "production" || envName === "staging";
  }

  constructor(
    private readonly attemptRepo: IPaymentAttemptRepository,
    private readonly paymentRepo: IPaymentRepository,
    private readonly allocationRepo: IPaymentAllocationRepository,
    private readonly refundRepo: IRefundRepository,
    private readonly reconciliationRepo: IPaymentReconciliationRepository,
    private readonly providerRegistry: PaymentProviderRegistry,
    private readonly webhookRepo?: IWebhookRepository,
    private readonly invoiceRepo?: IOperationalInvoiceRepository,
    private readonly depositPositionRepo?: IDepositPositionRepository,
    private readonly settlementRepo?: IOwnerSettlementRepository,
    private readonly auditRepo?: IAuditRepository,
    private readonly outboxRepo?: IOutboxRepository,
    private readonly bookingRepo?: IBookingRepository
  ) {}

  // --------------------------------------------------------------------------
  // 1. PAYMENT ATTEMPTS (Lifecycle & Provider Initialization)
  // --------------------------------------------------------------------------

  async initiatePaymentAttempt(
    tenantId: string,
    dto: InitiatePaymentAttemptDto,
    actor: PaymentActor
  ): Promise<PaymentAttempt> {
    const amountNum = parseFloat(dto.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error("Payment amount must be greater than zero");
    }

    if (this.isProductionLike() && (!dto.provider || dto.provider === "FAKE_PROVIDER")) {
      throw new Error(
        "Production and staging require an explicit payment provider; FAKE_PROVIDER is forbidden."
      );
    }

    const providerName = dto.provider || "FAKE_PROVIDER";
    const provider = this.providerRegistry.get(providerName);
    const currency = (dto.currency || "KES").toUpperCase();
    const intentReference =
      dto.idempotencyKey || `pi_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;

    const existingAttempt = await this.attemptRepo.findByIntentReference(intentReference, tenantId);
    if (existingAttempt) {
      return existingAttempt;
    }

    const attempt = await this.attemptRepo.create({
      tenantId,
      paymentIntentReference: intentReference,
      provider: provider.name,
      purpose: dto.purpose,
      direction: dto.direction || "INBOUND",
      amount: to4Dec(amountNum),
      currency,
      status: "INITIATED",
      targetId: dto.targetId,
      customerId: dto.customerId,
      requestedAt: new Date().toISOString(),
      metadata: dto.metadata,
    });

    try {
      const initResult = await provider.initializePayment({
        attemptId: attempt.id,
        tenantId,
        intentReference: attempt.paymentIntentReference,
        purpose: attempt.purpose || "CUSTOMER_INVOICE",
        direction: attempt.direction || "INBOUND",
        amount: typeof attempt.amount === "number" ? attempt.amount.toFixed(4) : attempt.amount,
        currency: attempt.currency,
        customerId: dto.customerId,
        customerPhone: dto.customerPhone,
        customerEmail: dto.customerEmail,
        customerName: dto.customerName,
        callbackUrl: dto.callbackUrl,
        returnUrl: dto.returnUrl,
        metadata: dto.metadata,
      });

      const updatedAttempt = await this.attemptRepo.update(
        attempt.id,
        {
          providerReference: initResult.providerReference,
          providerRequestReference: initResult.providerRequestReference,
          checkoutUrl: initResult.checkoutUrl,
          status: initResult.status,
        },
        attempt.version
      );

      await this.auditRepo?.create({
        tenantId,
        actorUserId: actor.userId,
        actorType: "USER",
        action: "PAYMENT_ATTEMPT_INITIATED",
        resourceType: "PAYMENT_ATTEMPT",
        resourceId: attempt.id,
        description: `Initiated payment attempt of ${attempt.amount} ${currency} via ${provider.name}`,
        payload: { attemptId: attempt.id, intentReference, provider: provider.name },
      });

      return updatedAttempt;
    } catch (err: any) {
      const failed = await this.attemptRepo.update(
        attempt.id,
        {
          status: "FAILED",
          failureReason: err.message || "Failed to initialize with payment provider",
        },
        attempt.version
      );
      return failed;
    }
  }

  // --------------------------------------------------------------------------
  // 2. AUTHORITATIVE SERVER-SIDE VERIFICATION (CRITICAL PAYMENT RULE)
  // --------------------------------------------------------------------------

  /**
   * Authoritatively verifies an attempt with the provider.
   * Browser/client responses alone are REJECTED as authoritative evidence.
   */
  async verifyPaymentAttempt(
    tenantId: string,
    attemptId: string,
    actor: PaymentActor,
    clientEvidenceAttempt?: boolean
  ): Promise<Payment> {
    if (clientEvidenceAttempt) {
      throw new ClientPaymentEvidenceRejectedError(
        "A client or browser notification is not authoritative payment evidence. Server-side provider verification is required."
      );
    }

    const attempt = await this.attemptRepo.findById(attemptId, tenantId);
    if (!attempt) {
      throw new PaymentAttemptNotFoundError(attemptId);
    }

    // If payment already verified and exists for this attempt, return it
    const existingPayment = await this.paymentRepo.findByAttemptId(attempt.id, tenantId);
    if (existingPayment) {
      return existingPayment;
    }

    const provider = this.providerRegistry.get(attempt.provider);
    const verifyResult = await provider.verifyPayment({
      tenantId,
      attemptId: attempt.id,
      intentReference: attempt.paymentIntentReference,
      providerReference: attempt.providerReference,
    });

    if (!verifyResult.verified) {
      await this.attemptRepo.update(attempt.id, {
        status: "FAILED",
        failureReason: "Provider status check confirmed payment unverified",
      });
      throw new PaymentVerificationFailedError(
        `Provider '${attempt.provider}' did not verify payment for intent '${attempt.paymentIntentReference}'`
      );
    }

    // Check duplicate provider transaction
    const dupPayment = await this.paymentRepo.findByProviderTransaction(
      attempt.provider,
      verifyResult.providerTransactionId,
      tenantId
    );
    if (dupPayment) {
      return dupPayment;
    }

    const now = new Date().toISOString();
    const verifiedAmount = to4Dec(verifyResult.amount || attempt.amount);

    const payment = await this.paymentRepo.create({
      tenantId,
      attemptId: attempt.id,
      purpose: attempt.purpose || "CUSTOMER_INVOICE",
      direction: attempt.direction || "INBOUND",
      amount: verifiedAmount,
      currency: verifyResult.currency || attempt.currency,
      allocatedAmount: "0.0000",
      unallocatedAmount: verifiedAmount,
      refundedAmount: "0.0000",
      provider: attempt.provider,
      providerTransactionId: verifyResult.providerTransactionId,
      providerReference: attempt.providerReference,
      status: "VERIFIED",
      paidAt: verifyResult.paidAt || now,
      verifiedAt: now,
      payerReference: verifyResult.payerReference || attempt.customerId,
      sourceContext: {
        customerId: attempt.customerId,
        invoiceId: attempt.purpose === "CUSTOMER_INVOICE" ? attempt.targetId : undefined,
        rentalId: attempt.purpose === "RENTAL_DEPOSIT" ? attempt.targetId : undefined,
      },
      verificationSource: verifyResult.verificationSource || "STATUS_QUERY",
      rawVerificationData: verifyResult.rawPayload,
      postedToLedger: false,
    });

    await this.attemptRepo.update(attempt.id, {
      status: "SUCCEEDED",
      completedAt: now,
    });

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "PAYMENT_VERIFIED",
      resourceType: "PAYMENT",
      resourceId: payment.id,
      description: `Authoritative verification confirmed payment ${payment.paymentNumber} (${payment.amount} ${payment.currency})`,
      payload: { paymentId: payment.id, providerTx: payment.providerTransactionId },
    });

    // Auto-allocate if targetId was specified
    if (attempt.targetId) {
      try {
        if (attempt.purpose === "CUSTOMER_INVOICE") {
          await this.allocatePayment(
            tenantId,
            {
              paymentId: payment.id,
              sourceType: "CUSTOMER_INVOICE",
              sourceId: attempt.targetId,
              amount: payment.amount,
            },
            actor
          );
        } else if (attempt.purpose === "RENTAL_DEPOSIT") {
          await this.allocatePayment(
            tenantId,
            {
              paymentId: payment.id,
              sourceType: "RENTAL_DEPOSIT",
              sourceId: attempt.targetId,
              amount: payment.amount,
            },
            actor
          );
        }
      } catch (allocErr) {
        // Log error but payment remains safely recorded as verified and unallocated
        console.error("Auto-allocation failed; payment remains unallocated:", allocErr);
      }
    }

    return (await this.paymentRepo.findById(payment.id, tenantId)) || payment;
  }

  // --------------------------------------------------------------------------
  // 3. IDEMPOTENT WEBHOOK HANDLING (DEV-009, DATA-002 §12)
  // --------------------------------------------------------------------------

  async handleWebhook(
    providerName: string,
    headers: Record<string, string | string[] | undefined>,
    payload: Record<string, unknown>,
    rawBody?: string
  ): Promise<{ status: string; payment?: Payment; attempt?: PaymentAttempt }> {
    const provider = this.providerRegistry.get(providerName as any);

    // 1. Signature Verification
    const isValidSig = provider.verifyWebhookSignature(headers, rawBody || JSON.stringify(payload));
    if (!isValidSig) {
      throw new InvalidWebhookSignatureError(providerName);
    }

    // 2. Parse payload
    const parsed: ParsedWebhookEvent = provider.parseWebhookPayload(payload, headers);

    // 3. Idempotent receipt recording
    if (this.webhookRepo) {
      try {
        await this.webhookRepo.recordReceipt({
          provider: providerName,
          providerEventId: parsed.providerEventId,
          eventType: parsed.eventType,
          payload,
          headers: headers as Record<string, unknown>,
        });
      } catch (err: any) {
        if (err.code === "UNIQUE_CONSTRAINT_VIOLATION") {
          // Already processed; return idempotent OK
          return { status: "ALREADY_PROCESSED" };
        }
        throw err;
      }
    }

    // 4. Locate PaymentAttempt by intentReference or providerReference
    let attempt: PaymentAttempt | null = null;
    if (parsed.intentReference) {
      attempt = await this.attemptRepo.findByIntentReference(parsed.intentReference);
    }
    if (!attempt && parsed.providerReference) {
      attempt = await this.attemptRepo.findByProviderReference(providerName, parsed.providerReference);
    }

    if (!attempt) {
      if (parsed.eventType === "MPESA_C2B_CONFIRMATION" && parsed.amount) {
        const tenantId = (parsed as any).tenantId || (headers["x-tenant-id"] as string);
        if (!tenantId) {
          throw new Error("Cannot process unsolicited C2B confirmation: Tenant context could not be determined.");
        }
        const verifiedAmount = to4Dec(parsed.amount);
        const now = new Date().toISOString();

        const existingPayment = await this.paymentRepo.findByProviderTransaction(
          providerName,
          parsed.providerTransactionId || `TXN_${parsed.providerEventId}`,
          tenantId
        );
        if (existingPayment) {
          return { status: "ALREADY_RECORDED", payment: existingPayment };
        }

        const payment = await this.paymentRepo.create({
          tenantId,
          purpose: "CUSTOMER_INVOICE",
          direction: "INBOUND",
          amount: verifiedAmount,
          currency: parsed.currency || "KES",
          allocatedAmount: "0.0000",
          unallocatedAmount: verifiedAmount,
          refundedAmount: "0.0000",
          provider: provider.name,
          providerTransactionId: parsed.providerTransactionId || `TXN_${parsed.providerEventId}`,
          providerReference: parsed.providerReference,
          status: "VERIFIED",
          paidAt: parsed.occurredAt || now,
          verifiedAt: now,
          payerReference: parsed.payerReference,
          sourceContext: {
            billRefNumber: parsed.intentReference,
          },
          verificationSource: "WEBHOOK",
          rawVerificationData: payload,
          postedToLedger: false,
        });

        if (this.webhookRepo) {
          const rec = await this.webhookRepo.findByProviderEvent(providerName, parsed.providerEventId);
          if (rec) await this.webhookRepo.markProcessed(rec.id);
        }

        return { status: "PAYMENT_RECORDED", payment };
      }

      return { status: "IGNORED_UNKNOWN_INTENT" };
    }

    const tenantId = attempt.tenantId || "SYSTEM";

    // 5. Handle Failure Callback
    if (parsed.status === "FAILED") {
      const updated = await this.attemptRepo.update(attempt.id, {
        status: "FAILED",
        failureReason: parsed.failureReason || "Webhook reported failed payment",
      });
      return { status: "ATTEMPT_FAILED", attempt: updated };
    }

    // 6. Handle Success Callback -> Create Authoritative Payment
    const existingPayment = await this.paymentRepo.findByProviderTransaction(
      providerName,
      parsed.providerTransactionId || `TXN_${parsed.providerEventId}`,
      tenantId
    );

    if (existingPayment) {
      return { status: "ALREADY_RECORDED", payment: existingPayment };
    }

    const now = new Date().toISOString();
    const verifiedAmount = to4Dec(parsed.amount || attempt.amount);

    const payment = await this.paymentRepo.create({
      tenantId,
      attemptId: attempt.id,
      purpose: attempt.purpose || "CUSTOMER_INVOICE",
      direction: attempt.direction || "INBOUND",
      amount: verifiedAmount,
      currency: parsed.currency || attempt.currency,
      allocatedAmount: "0.0000",
      unallocatedAmount: verifiedAmount,
      refundedAmount: "0.0000",
      provider: provider.name,
      providerTransactionId: parsed.providerTransactionId || `TXN_${parsed.providerEventId}`,
      providerReference: attempt.providerReference,
      status: "VERIFIED",
      paidAt: parsed.occurredAt || now,
      verifiedAt: now,
      payerReference: parsed.payerReference || attempt.customerId,
      sourceContext: {
        customerId: attempt.customerId,
        invoiceId: attempt.purpose === "CUSTOMER_INVOICE" ? attempt.targetId : undefined,
        rentalId: attempt.purpose === "RENTAL_DEPOSIT" ? attempt.targetId : undefined,
      },
      verificationSource: "WEBHOOK",
      rawVerificationData: payload,
      postedToLedger: false,
    });

    await this.attemptRepo.update(attempt.id, {
      status: "SUCCEEDED",
      completedAt: now,
    });

    if (this.webhookRepo) {
      const rec = await this.webhookRepo.findByProviderEvent(providerName, parsed.providerEventId);
      if (rec) await this.webhookRepo.markProcessed(rec.id);
    }

    // Auto-allocate if target was specified
    if (attempt.targetId) {
      try {
        const actor: PaymentActor = { userId: "WEBHOOK_PROCESSOR", tenantId };
        if (attempt.purpose === "CUSTOMER_INVOICE") {
          await this.allocatePayment(
            tenantId,
            {
              paymentId: payment.id,
              sourceType: "CUSTOMER_INVOICE",
              sourceId: attempt.targetId,
              amount: payment.amount,
            },
            actor
          );
        } else if (attempt.purpose === "RENTAL_DEPOSIT") {
          await this.allocatePayment(
            tenantId,
            {
              paymentId: payment.id,
              sourceType: "RENTAL_DEPOSIT",
              sourceId: attempt.targetId,
              amount: payment.amount,
            },
            actor
          );
        }
      } catch (err) {
        console.error("Webhook auto-allocation failed; payment remains unallocated:", err);
      }
    }

    return { status: "PROCESSED", payment, attempt };
  }

  // --------------------------------------------------------------------------
  // 4. GOVERNED MANUAL / OFFLINE PAYMENT RECORDING
  // --------------------------------------------------------------------------

  async recordGovernedManualPayment(
    tenantId: string,
    dto: RecordGovernedManualPaymentDto,
    actor: PaymentActor
  ): Promise<Payment> {
    const amountNum = parseFloat(dto.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error("Payment amount must be greater than zero");
    }

    const currency = (dto.currency || "KES").toUpperCase();
    const now = new Date().toISOString();
    const formattedAmount = to4Dec(amountNum);

    const payment = await this.paymentRepo.create({
      tenantId,
      purpose: dto.purpose,
      direction: "INBOUND",
      amount: formattedAmount,
      currency,
      allocatedAmount: "0.0000",
      unallocatedAmount: formattedAmount,
      refundedAmount: "0.0000",
      provider: "MANUAL_RECORD",
      providerTransactionId: dto.providerTransactionId,
      status: "VERIFIED",
      paidAt: dto.paidAt || now,
      verifiedAt: now,
      payerReference: dto.payerReference,
      sourceContext: {
        customerId: dto.customerId,
        invoiceId: dto.purpose === "CUSTOMER_INVOICE" ? dto.targetId : undefined,
        notes: dto.notes,
      },
      verificationSource: "MANUAL_APPROVAL",
      rawVerificationData: dto.metadata,
      postedToLedger: false,
    });

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "MANUAL_PAYMENT_RECORDED",
      resourceType: "PAYMENT",
      resourceId: payment.id,
      description: `Manual payment of ${formattedAmount} ${currency} recorded by ${actor.userId} (Ref: ${dto.providerTransactionId})`,
      payload: { paymentId: payment.id, amount: formattedAmount, ref: dto.providerTransactionId },
    });

    if (dto.targetId) {
      try {
        if (dto.purpose === "CUSTOMER_INVOICE") {
          await this.allocatePayment(
            tenantId,
            {
              paymentId: payment.id,
              sourceType: "CUSTOMER_INVOICE",
              sourceId: dto.targetId,
              amount: payment.amount,
            },
            actor
          );
        } else if (dto.purpose === "RENTAL_DEPOSIT") {
          await this.allocatePayment(
            tenantId,
            {
              paymentId: payment.id,
              sourceType: "RENTAL_DEPOSIT",
              sourceId: dto.targetId,
              amount: payment.amount,
            },
            actor
          );
        }
      } catch (allocationError) {
        // Money was genuinely recorded. Never roll the Payment fact back because
        // an obligation binding failed; reconciliation can safely resolve it.
        console.error("Manual payment recorded but auto-allocation failed:", allocationError);
      }
    }

    return (await this.paymentRepo.findById(payment.id, tenantId)) || payment;
  }

  // --------------------------------------------------------------------------
  // 5. PAYMENT ALLOCATIONS (To Invoices & Rental Deposits)
  // --------------------------------------------------------------------------

  async allocatePayment(
    tenantId: string,
    dto: AllocatePaymentDto,
    actor: PaymentActor
  ): Promise<PaymentAllocation> {
    const payment = await this.paymentRepo.findById(dto.paymentId, tenantId);
    if (!payment) {
      throw new PaymentNotFoundError(dto.paymentId);
    }

    const { newAllocated, newUnallocated, newStatus } =
      PaymentStateMachine.computeAllocationOutcome(
        payment.amount,
        payment.allocatedAmount,
        dto.amount,
        payment.id
      );

    const allocationAmount = to4Dec(dto.amount);
    let postingContract: any = null;

    // A. ALLOCATE TO CUSTOMER INVOICE (Sprint 19 Finance public interface)
    if (dto.sourceType === "CUSTOMER_INVOICE") {
      if (!this.invoiceRepo) {
        throw new Error("OperationalInvoiceRepository is not configured in PaymentService");
      }

      const invoice = await this.invoiceRepo.findById(dto.sourceId, tenantId);
      if (!invoice) {
        throw new OperationalInvoiceNotFoundError(dto.sourceId);
      }

      if (invoice.currency !== payment.currency) {
        throw new PaymentCurrencyMismatchError(invoice.currency, payment.currency);
      }

      const outstanding = parseFloat(invoice.amountOutstanding);
      if (parseFloat(allocationAmount) > outstanding + 0.0001) {
        throw new Error(
          `Allocation ${allocationAmount} ${payment.currency} exceeds invoice outstanding balance ${invoice.amountOutstanding}.`
        );
      }

      const newPaid = parseFloat(invoice.amountPaid) + parseFloat(allocationAmount);
      const grossTotal = parseFloat(invoice.total);
      const credited = parseFloat(invoice.amountCredited);
      const newOutstanding = Math.max(0, grossTotal - credited - newPaid);

      const resultingStatus: OperationalInvoiceStatus =
        newOutstanding <= 0.0001 ? "PAID" : "PARTIALLY_PAID";

      const updatedInvoice = await this.invoiceRepo.update(
        invoice.id,
        tenantId,
        {
          amountPaid: to4Dec(newPaid),
          amountOutstanding: to4Dec(newOutstanding),
          status: resultingStatus,
          paidAt: resultingStatus === "PAID" ? new Date().toISOString() : invoice.paidAt,
        },
        invoice.version
      );

      await this.invoiceRepo.recordStatusTransition(
        invoice.id,
        tenantId,
        invoice.status,
        resultingStatus,
        actor.userId,
        `Payment ${payment.paymentNumber} allocated: ${allocationAmount} ${payment.currency}`
      );

      const allocation = await this.allocationRepo.create({
        tenantId,
        paymentId: payment.id,
        sourceType: "CUSTOMER_INVOICE",
        sourceId: invoice.id,
        amount: allocationAmount,
        currency: payment.currency,
        notes: dto.notes,
        allocatedAt: new Date().toISOString(),
      });

      await this.paymentRepo.update(
        payment.id,
        tenantId,
        {
          allocatedAmount: newAllocated,
          unallocatedAmount: newUnallocated,
          status: newStatus,
        },
        payment.version
      );

      postingContract = PaymentPostingContractFactory.createInvoicePaymentPostingContract(
        payment,
        allocation,
        updatedInvoice.invoiceNumber
      );

      await this.outboxRepo?.publish({
        tenantId,
        eventType: "payment.allocated.invoice",
        aggregateType: "PAYMENT",
        aggregateId: payment.id,
        payload: {
          paymentId: payment.id,
          allocationId: allocation.id,
          invoiceId: invoice.id,
          amount: allocationAmount,
          postingContract,
        },
      });

      return allocation;
    }

    // B. ALLOCATE TO RENTAL DEPOSIT POSITION (Sprint 19 Finance DepositPosition)
    if (dto.sourceType === "RENTAL_DEPOSIT") {
      if (!this.depositPositionRepo) {
        throw new Error("DepositPositionRepository is not configured in PaymentService");
      }

      let deposit = await this.depositPositionRepo.findById(dto.sourceId, tenantId);
      if (!deposit) deposit = await this.depositPositionRepo.findByRentalId(dto.sourceId, tenantId);
      if (!deposit) deposit = await this.depositPositionRepo.findByBookingId(dto.sourceId, tenantId);

      let booking: any = null;
      if (!deposit && this.bookingRepo) {
        booking = await this.bookingRepo.findById(dto.sourceId, tenantId);
        if (booking && Number(booking.depositRequired || 0) > 0) {
          deposit = await this.depositPositionRepo.create({
            tenantId,
            bookingId: booking.id,
            customerId: booking.customerId,
            currency: (booking.currency || payment.currency).toUpperCase(),
            requiredAmount: to4Dec(booking.depositRequired),
            receivedAmount: "0.0000",
            heldAmount: "0.0000",
            appliedAmount: "0.0000",
            refundDueAmount: "0.0000",
            refundedAmount: "0.0000",
            forfeitedAmount: "0.0000",
            status: "REQUIRED",
            notes: `Security deposit position for booking ${booking.bookingNumber}`,
          });
        }
      }

      if (!deposit) {
        throw new DepositPositionNotFoundError(dto.sourceId);
      }
      if (deposit.currency !== payment.currency) {
        throw new PaymentCurrencyMismatchError(deposit.currency, payment.currency);
      }

      if (!booking && deposit.bookingId && this.bookingRepo) {
        booking = await this.bookingRepo.findById(deposit.bookingId, tenantId);
      }

      const newReceived = parseFloat(deposit.receivedAmount) + parseFloat(allocationAmount);
      const newHeld = parseFloat(deposit.heldAmount) + parseFloat(allocationAmount);
      const required = parseFloat(deposit.requiredAmount);
      if (newReceived > required + 0.0001) {
        throw new Error(
          `Deposit allocation would exceed required amount ${deposit.requiredAmount} ${deposit.currency}.`
        );
      }
      const funded = newReceived + 0.0001 >= required;
      deposit = await this.depositPositionRepo.update(
        deposit.id,
        tenantId,
        {
          receivedAmount: to4Dec(newReceived),
          heldAmount: to4Dec(newHeld),
          status: funded ? "HELD" : "REQUIRED",
        },
        deposit.version
      );

      if (booking && this.bookingRepo) {
        await this.bookingRepo.update(
          booking.id,
          tenantId,
          { depositStatus: funded ? "HELD" : "REQUESTED" },
          booking.version
        );
      }

      const allocation = await this.allocationRepo.create({
        tenantId,
        paymentId: payment.id,
        sourceType: "RENTAL_DEPOSIT",
        sourceId: deposit.id,
        amount: allocationAmount,
        currency: payment.currency,
        notes: dto.notes,
        allocatedAt: new Date().toISOString(),
      });

      await this.paymentRepo.update(
        payment.id,
        tenantId,
        {
          allocatedAmount: newAllocated,
          unallocatedAmount: newUnallocated,
          status: newStatus,
          sourceContext: {
            ...(payment.sourceContext || {}),
            customerId: deposit.customerId,
            bookingId: deposit.bookingId,
            rentalId: deposit.rentalId,
          },
        },
        payment.version
      );

      postingContract = PaymentPostingContractFactory.createDepositPaymentPostingContract(
        payment,
        allocation,
        deposit.rentalId || deposit.bookingId || dto.sourceId
      );

      await this.outboxRepo?.publish({
        tenantId,
        eventType: "payment.allocated.deposit",
        aggregateType: "PAYMENT",
        aggregateId: payment.id,
        payload: {
          paymentId: payment.id,
          allocationId: allocation.id,
          depositId: deposit?.id || dto.sourceId,
          amount: allocationAmount,
          postingContract,
        },
      });

      return allocation;
    }

    // Generic fallback allocation
    const allocation = await this.allocationRepo.create({
      tenantId,
      paymentId: payment.id,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      amount: allocationAmount,
      currency: payment.currency,
      notes: dto.notes,
      allocatedAt: new Date().toISOString(),
    });

    await this.paymentRepo.update(
      payment.id,
      tenantId,
      {
        allocatedAmount: newAllocated,
        unallocatedAmount: newUnallocated,
        status: newStatus,
      },
      payment.version
    );

    return allocation;
  }

  // --------------------------------------------------------------------------
  // 6. REFUNDS (Cap Enforcement & Provider Execution)
  // --------------------------------------------------------------------------

  async requestRefund(
    tenantId: string,
    dto: RequestRefundDto,
    actor: PaymentActor
  ): Promise<Refund> {
    const payment = await this.paymentRepo.findById(dto.paymentId, tenantId);
    if (!payment) {
      throw new PaymentNotFoundError(dto.paymentId);
    }

    const { newRefunded } = PaymentStateMachine.computeRefundOutcome(
      payment.amount,
      payment.refundedAmount,
      dto.amount,
      payment.id
    );

    const refund = await this.refundRepo.create({
      tenantId,
      originalPaymentId: payment.id,
      sourceObligationType: dto.sourceObligationType || "CUSTOMER_REFUND",
      sourceObligationId: dto.sourceObligationId,
      customerId: payment.sourceContext?.customerId,
      amount: to4Dec(dto.amount),
      currency: payment.currency,
      status: "PENDING",
      reason: dto.reason,
      requestedAt: new Date().toISOString(),
      requestedBy: actor.userId,
      postedToLedger: false,
    });

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "REFUND_REQUESTED",
      resourceType: "REFUND",
      resourceId: refund.id,
      description: `Refund ${refund.refundNumber} requested for ${refund.amount} ${refund.currency}`,
      payload: { refundId: refund.id, paymentId: payment.id, amount: refund.amount },
    });

    return refund;
  }

  async approveAndExecuteRefund(
    tenantId: string,
    refundId: string,
    actor: PaymentActor
  ): Promise<Refund> {
    const refund = await this.refundRepo.findById(refundId, tenantId);
    if (!refund) {
      throw new RefundNotFoundError(refundId);
    }

    if (refund.requestedBy && refund.requestedBy === actor.userId) {
      const err: any = new Error("Refund approval requires a different authorized user from the requester.");
      err.code = "SEPARATION_OF_DUTIES";
      err.statusCode = 409;
      throw err;
    }

    const payment = await this.paymentRepo.findById(refund.originalPaymentId, tenantId);
    if (!payment) {
      throw new PaymentNotFoundError(refund.originalPaymentId);
    }

    const provider = this.providerRegistry.get(payment.provider);
    const refundResult = await provider.refundPayment({
      tenantId,
      originalPaymentId: payment.id,
      providerTransactionId: payment.providerTransactionId,
      refundAmount: refund.amount,
      currency: refund.currency,
      reason: refund.reason,
      idempotencyKey: `refund_${refund.id}`,
    });

    if (!refundResult.success) {
      await this.refundRepo.update(
        refund.id,
        tenantId,
        {
          status: "FAILED",
          failureReason: refundResult.failureReason || "Provider failed to disburse refund",
        },
        refund.version
      );
      throw new Error(`Refund disbursement failed: ${refundResult.failureReason}`);
    }

    const now = new Date().toISOString();
    const updatedRefund = await this.refundRepo.update(
      refund.id,
      tenantId,
      {
        status: "COMPLETED",
        approvedAt: now,
        approvedBy: actor.userId,
        providerRefundReference: refundResult.providerRefundReference,
        completedAt: refundResult.completedAt || now,
      },
      refund.version
    );

    const { newRefunded, newStatus } = PaymentStateMachine.computeRefundOutcome(
      payment.amount,
      payment.refundedAmount,
      refund.amount,
      payment.id
    );

    await this.paymentRepo.update(
      payment.id,
      tenantId,
      {
        refundedAmount: newRefunded,
        status: newStatus,
      },
      payment.version
    );

    const postingContract = PaymentPostingContractFactory.createRefundDisbursedPostingContract(
      updatedRefund,
      payment
    );

    await this.outboxRepo?.publish({
      tenantId,
      eventType: "payment.refund.disbursed",
      aggregateType: "REFUND",
      aggregateId: updatedRefund.id,
      payload: {
        refundId: updatedRefund.id,
        refundNumber: updatedRefund.refundNumber,
        amount: updatedRefund.amount,
        postingContract,
      },
    });

    return updatedRefund;
  }

  // --------------------------------------------------------------------------
  // 7. OWNER SETTLEMENT PAYOUT EXECUTION (Sprint 21 Integration)
  // --------------------------------------------------------------------------

  async executeOwnerPayout(
    tenantId: string,
    dto: ExecuteOwnerPayoutDto,
    actor: PaymentActor
  ): Promise<{ payment: Payment; payable: OwnerSettlementPayable }> {
    if (!this.settlementRepo) {
      throw new Error("OwnerSettlementRepository is not configured in PaymentService");
    }

    const payable = await this.settlementRepo.findPayableById(dto.settlementPayableId, tenantId);
    if (!payable) {
      throw new SettlementPayableNotFoundError(dto.settlementPayableId);
    }

    if (payable.status === "PAID") {
      throw new SettlementAlreadyPaidError(payable.payableNumber);
    }

    const settlement = await this.settlementRepo.findById(payable.settlementId, tenantId);
    if (!settlement) {
      throw new Error(`Settlement ${payable.settlementId} backing payable ${payable.payableNumber} was not found.`);
    }
    if (!["APPROVED", "PAYMENT_PENDING"].includes(settlement.status)) {
      throw new Error(
        `Settlement ${settlement.settlementNumber} must be APPROVED before provider payout; current status is ${settlement.status}.`
      );
    }
    if (settlement.approvedBy && settlement.approvedBy === actor.userId) {
      const err: any = new Error("Owner payout execution requires a different authorized user from the settlement approver.");
      err.code = "SEPARATION_OF_DUTIES";
      err.statusCode = 409;
      throw err;
    }

    if (this.isProductionLike() && (!dto.provider || dto.provider === "FAKE_PROVIDER")) {
      throw new Error(
        "Production and staging require an explicit payment provider; FAKE_PROVIDER is forbidden."
      );
    }

    const providerName = dto.provider || "FAKE_PROVIDER";
    const provider = this.providerRegistry.get(providerName);

    await this.settlementRepo.updatePayableStatus(payable.id, tenantId, "PROCESSING");
    if (settlement.status !== "PAYMENT_PENDING") {
      await this.settlementRepo.update(settlement.id, tenantId, {
        status: "PAYMENT_PENDING",
        paymentPendingAt: new Date().toISOString(),
      });
    }

    const payoutResult = await provider.executePayout({
      tenantId,
      payableId: payable.id,
      recipientName: payable.recipientName,
      recipientAccountOrPhone:
        payable.destinationMpesaNumber || payable.destinationAccount || "DEFAULT_ACCOUNT",
      amount: payable.netDisbursementAmount,
      currency: payable.currency,
      payoutMethod: payable.payoutMethod,
      idempotencyKey: dto.idempotencyKey || `payout_${payable.id}`,
    });

    if (!payoutResult.success) {
      await this.settlementRepo.updatePayableStatus(payable.id, tenantId, "FAILED");
      await this.settlementRepo.update(settlement.id, tenantId, { status: "APPROVED" });
      throw new Error(`Owner settlement payout failed: ${payoutResult.failureReason}`);
    }

    const now = new Date().toISOString();
    const payment = await this.paymentRepo.create({
      tenantId,
      purpose: "OWNER_SETTLEMENT",
      direction: "OUTBOUND",
      amount: to4Dec(payable.netDisbursementAmount),
      currency: payable.currency,
      allocatedAmount: to4Dec(payable.netDisbursementAmount),
      unallocatedAmount: "0.0000",
      refundedAmount: "0.0000",
      provider: provider.name,
      providerTransactionId: payoutResult.providerTransactionId,
      providerReference: payoutResult.providerReference,
      status: "ALLOCATED",
      paidAt: payoutResult.disbursedAt || now,
      verifiedAt: now,
      payeeReference: payable.recipientName,
      sourceContext: {
        payableId: payable.id,
        notes: dto.notes,
      },
      verificationSource: "MOCK_VERIFIED",
      postedToLedger: false,
    });

    const updatedPayable = await this.settlementRepo.updatePayableStatus(
      payable.id,
      tenantId,
      "PAID",
      payment.paymentNumber,
      now
    );

    await this.settlementRepo.update(settlement.id, tenantId, {
      status: "PAID",
      paidAt: payoutResult.disbursedAt || now,
      payoutReference: payoutResult.providerTransactionId || payment.paymentNumber,
      payoutMethod: payable.payoutMethod,
    });

    await this.auditRepo?.create({
      tenantId,
      actorUserId: actor.userId,
      actorType: "USER",
      action: "OWNER_SETTLEMENT_PAYOUT_EXECUTED",
      resourceType: "OWNER_SETTLEMENT",
      resourceId: settlement.id,
      description: `Executed provider payout for ${settlement.settlementNumber} (${payment.amount} ${payment.currency})`,
      payload: {
        settlementId: settlement.id,
        payableId: payable.id,
        paymentId: payment.id,
        provider: payment.provider,
        providerTransactionId: payment.providerTransactionId,
      },
    });

    const postingContract = PaymentPostingContractFactory.createOwnerPayoutPostingContract(
      payment,
      payable.payableNumber,
      payable.ownerId
    );

    await this.outboxRepo?.publish({
      tenantId,
      eventType: "payment.payout.owner_settlement",
      aggregateType: "PAYMENT",
      aggregateId: payment.id,
      payload: {
        paymentId: payment.id,
        payableId: payable.id,
        settlementId: settlement.id,
        amount: payment.amount,
        postingContract,
      },
    });

    return { payment, payable: updatedPayable };
  }

  // --------------------------------------------------------------------------
  // 8. PAYMENT RECONCILIATION SCANNER
  // --------------------------------------------------------------------------

  async runReconciliationScan(tenantId: string): Promise<PaymentReconciliationIssue[]> {
    const issues: PaymentReconciliationIssue[] = [];
    const payments = await this.paymentRepo.listByTenant(tenantId);
    const attempts = await this.attemptRepo.listByTenant(tenantId);
    const now = Date.now();

    // 1. Detect unallocated verified payments
    for (const p of payments) {
      if (p.status === "VERIFIED" && parseFloat(p.unallocatedAmount) > 0.0001) {
        const ageMs = now - new Date(p.createdAt).getTime();
        if (ageMs > 1000 * 60) {
          // > 1 minute old
          const issue = await this.reconciliationRepo.create({
            tenantId,
            issueType: "UNALLOCATED_PAYMENT",
            severity: "MEDIUM",
            entityType: "PAYMENT",
            entityId: p.id,
            description: `Payment ${p.paymentNumber} has unallocated balance of ${p.unallocatedAmount} ${p.currency}`,
            resolved: false,
            metadata: { paymentNumber: p.paymentNumber, unallocated: p.unallocatedAmount },
          });
          issues.push(issue);
        }
      }
    }

    // 2. Detect stale pending attempts
    for (const a of attempts) {
      if (a.status === "INITIATED" || a.status === "PENDING_CALLBACK") {
        const ageMs = now - new Date(a.createdAt).getTime();
        if (ageMs > 1000 * 60 * 60 * 24) {
          // > 24 hours old
          const issue = await this.reconciliationRepo.create({
            tenantId,
            issueType: "OLD_PENDING_ATTEMPT",
            severity: "LOW",
            entityType: "PAYMENT_ATTEMPT",
            entityId: a.id,
            description: `Payment attempt ${a.id} has been pending for over 24 hours without callback`,
            resolved: false,
            metadata: { intentRef: a.paymentIntentReference, requestedAt: a.requestedAt },
          });
          issues.push(issue);
        }
      }
    }

    return issues;
  }

  // --------------------------------------------------------------------------
  // 9. QUERY METHODS
  // --------------------------------------------------------------------------

  async getPayment(tenantId: string, paymentId: string): Promise<Payment | null> {
    return this.paymentRepo.findById(paymentId, tenantId);
  }

  async listPayments(tenantId: string, filter?: ListPaymentsFilter): Promise<Payment[]> {
    return this.paymentRepo.listByTenant(tenantId, filter);
  }

  async getPaymentAttempt(tenantId: string, attemptId: string): Promise<PaymentAttempt | null> {
    return this.attemptRepo.findById(attemptId, tenantId);
  }

  async listPaymentAttempts(tenantId: string, filter?: ListPaymentAttemptsFilter): Promise<PaymentAttempt[]> {
    return this.attemptRepo.listByTenant(tenantId, filter);
  }

  async listAllocations(tenantId: string, paymentId?: string): Promise<PaymentAllocation[]> {
    if (paymentId) {
      return this.allocationRepo.findByPaymentId(paymentId, tenantId);
    }
    return this.allocationRepo.listByTenant(tenantId);
  }

  async listRefunds(tenantId: string, filter?: ListRefundsFilter): Promise<Refund[]> {
    return this.refundRepo.listByTenant(tenantId, filter);
  }

  async listReconciliationIssues(tenantId: string, resolved?: boolean): Promise<PaymentReconciliationIssue[]> {
    return this.reconciliationRepo.listByTenant(tenantId, resolved);
  }

  async resolveReconciliationIssue(
    tenantId: string,
    issueId: string
  ): Promise<PaymentReconciliationIssue> {
    return this.reconciliationRepo.resolveIssue(issueId, tenantId);
  }
}
