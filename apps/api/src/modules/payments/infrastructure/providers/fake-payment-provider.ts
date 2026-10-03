// ============================================================================
// CAR HIRE OS — FAKE PAYMENT PROVIDER ADAPTER (Sprint 22: DEV-009, DATA-002)
// In-Memory Test Adapter Supporting Deterministic Simulation of All Payment Lifecycles
// ============================================================================

import type {
  IPaymentProvider,
  PaymentProviderName,
  ProviderCapability,
  InitializePaymentInput,
  InitializePaymentResult,
  GetPaymentStatusInput,
  ProviderPaymentStatusResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
  RefundPaymentInput,
  RefundPaymentResult,
  ExecutePayoutInput,
  ExecutePayoutResult,
  ParsedWebhookEvent,
} from "@carhire/types";

export type FakeBehaviorMode =
  | "AUTO_SUCCESS"
  | "AUTO_FAIL"
  | "REQUIRE_MANUAL_WEBHOOK"
  | "TIMEOUT";

export interface FakeBehaviorConfig {
  mode: FakeBehaviorMode;
  failureCode?: string;
  failureReason?: string;
  secretKey?: string;
}

export class FakePaymentProvider implements IPaymentProvider {
  public readonly name: PaymentProviderName = "FAKE_PROVIDER";
  public readonly capabilities: ProviderCapability[] = [
    "INBOUND_PAYMENT",
    "OUTBOUND_PAYMENT",
    "REFUND",
    "STATUS_QUERY",
    "WEBHOOK",
    "PAYOUT",
  ];

  private config: FakeBehaviorConfig = {
    mode: "AUTO_SUCCESS",
    secretKey: "test_fake_webhook_secret",
  };

  private intentStore = new Map<
    string,
    {
      input: InitializePaymentInput;
      providerRef: string;
      providerTxId: string;
      status: "INITIATED" | "SUCCEEDED" | "FAILED";
      paidAt?: string;
    }
  >();

  setBehavior(config: Partial<FakeBehaviorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  reset(): void {
    this.config = {
      mode: "AUTO_SUCCESS",
      secretKey: "test_fake_webhook_secret",
    };
    this.intentStore.clear();
  }

  async initializePayment(input: InitializePaymentInput): Promise<InitializePaymentResult> {
    const providerRef = `FAKE_REF_${crypto.randomUUID().slice(0, 8)}`;
    const providerTxId = `TXN_${crypto.randomUUID().slice(0, 12).toUpperCase()}`;

    let status: "INITIATED" | "SUCCEEDED" | "FAILED" = "INITIATED";
    if (this.config.mode === "AUTO_SUCCESS") {
      status = "SUCCEEDED";
    } else if (this.config.mode === "AUTO_FAIL") {
      status = "FAILED";
    }

    this.intentStore.set(input.intentReference, {
      input,
      providerRef,
      providerTxId,
      status,
      paidAt: status === "SUCCEEDED" ? new Date().toISOString() : undefined,
    });

    return {
      providerReference: providerRef,
      providerRequestReference: `REQ_${crypto.randomUUID().slice(0, 8)}`,
      checkoutUrl: `https://payments.carhireos.local/checkout/${input.intentReference}`,
      status:
        this.config.mode === "AUTO_SUCCESS"
          ? "SUCCEEDED"
          : this.config.mode === "AUTO_FAIL"
          ? "FAILED"
          : "PENDING_CALLBACK",
      rawResponse: { providerRef, providerTxId, mode: this.config.mode },
    };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<ProviderPaymentStatusResult> {
    const record = this.intentStore.get(input.intentReference);
    if (!record) {
      return {
        status: "FAILED",
        failureCode: "NOT_FOUND",
        failureReason: "Payment intent not found at provider",
      };
    }

    if (record.status === "SUCCEEDED") {
      return {
        status: "SUCCEEDED",
        providerTransactionId: record.providerTxId,
        amountPaid: record.input.amount,
        currency: record.input.currency,
        payerReference: record.input.customerPhone || record.input.customerEmail || "Test Payer",
        paidAt: record.paidAt || new Date().toISOString(),
        rawResponse: { status: "SUCCEEDED", txId: record.providerTxId },
      };
    }

    if (record.status === "FAILED") {
      return {
        status: "FAILED",
        failureCode: this.config.failureCode || "PROVIDER_DECLINED",
        failureReason: this.config.failureReason || "Transaction declined by simulated provider",
      };
    }

    return {
      status: "PENDING_CALLBACK",
      rawResponse: { status: "PENDING_CALLBACK" },
    };
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const record = this.intentStore.get(input.intentReference);
    if (!record) {
      return {
        verified: false,
        providerTransactionId: "",
        amount: "0.0000",
        currency: "KES",
        paidAt: new Date().toISOString(),
        verificationSource: "STATUS_QUERY",
      };
    }

    if (record.status === "SUCCEEDED" || this.config.mode === "AUTO_SUCCESS") {
      record.status = "SUCCEEDED";
      if (!record.paidAt) record.paidAt = new Date().toISOString();
      return {
        verified: true,
        providerTransactionId: record.providerTxId,
        amount: record.input.amount,
        currency: record.input.currency,
        paidAt: record.paidAt,
        payerReference: record.input.customerPhone || record.input.customerEmail || "Verified Payer",
        verificationSource: "STATUS_QUERY",
        rawPayload: { simulated: true, mode: this.config.mode },
      };
    }

    return {
      verified: false,
      providerTransactionId: record.providerTxId,
      amount: record.input.amount,
      currency: record.input.currency,
      paidAt: new Date().toISOString(),
      verificationSource: "STATUS_QUERY",
      rawPayload: { error: this.config.failureReason || "Payment unconfirmed at provider" },
    };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    if (this.config.mode === "AUTO_FAIL") {
      return {
        success: false,
        providerRefundReference: "",
        status: "FAILED",
        failureReason: this.config.failureReason || "Refund rejected by simulated provider",
      };
    }

    const providerRefundReference = `REFUND_TX_${crypto.randomUUID().slice(0, 10).toUpperCase()}`;
    return {
      success: true,
      providerRefundReference,
      status: "COMPLETED",
      completedAt: new Date().toISOString(),
      rawResponse: { originalTx: input.providerTransactionId, refundRef: providerRefundReference },
    };
  }

  async executePayout(input: ExecutePayoutInput): Promise<ExecutePayoutResult> {
    if (this.config.mode === "AUTO_FAIL") {
      return {
        success: false,
        providerTransactionId: "",
        status: "FAILED",
        failureReason: this.config.failureReason || "Payout rejected by provider clearing house",
      };
    }

    const providerTransactionId = `PAYOUT_TX_${crypto.randomUUID().slice(0, 10).toUpperCase()}`;
    return {
      success: true,
      providerTransactionId,
      providerReference: `PAYOUT_REF_${crypto.randomUUID().slice(0, 8)}`,
      status: "COMPLETED",
      disbursedAt: new Date().toISOString(),
      rawResponse: { recipient: input.recipientName, account: input.recipientAccountOrPhone },
    };
  }

  verifyWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string | Buffer
  ): boolean {
    const signature = headers["x-provider-signature"] || headers["x-fake-signature"];
    if (!signature) return false;
    // For test provider, accept "test_signature" or valid secret check
    return signature === "test_valid_signature" || signature === this.config.secretKey;
  }

  parseWebhookPayload(
    payload: Record<string, unknown>,
    _headers?: Record<string, unknown>
  ): ParsedWebhookEvent {
    const eventType = (payload.eventType as string) || "PAYMENT_RESULT";
    const providerEventId =
      (payload.eventId as string) || (payload.providerEventId as string) || `EVT_${crypto.randomUUID()}`;
    const intentReference = payload.intentReference as string | undefined;
    const providerTransactionId =
      (payload.providerTransactionId as string) || (payload.transactionId as string) || `TXN_${crypto.randomUUID().slice(0, 8)}`;
    const status = payload.status === "FAILED" ? "FAILED" : "SUCCEEDED";
    const amount = payload.amount !== undefined ? String(payload.amount) : undefined;
    const currency = (payload.currency as string) || "KES";
    const payerReference = payload.payerReference as string | undefined;
    const failureReason = payload.failureReason as string | undefined;

    return {
      isValid: true,
      eventType,
      providerEventId,
      intentReference,
      providerTransactionId,
      amount,
      currency,
      status,
      payerReference,
      failureReason,
      occurredAt: (payload.occurredAt as string) || new Date().toISOString(),
      rawPayload: payload,
    };
  }

  /**
   * Helper for tests: simulates an incoming callback by updating internal status
   */
  markIntentResult(intentReference: string, status: "SUCCEEDED" | "FAILED", txId?: string): void {
    const record = this.intentStore.get(intentReference);
    if (record) {
      record.status = status;
      if (txId) record.providerTxId = txId;
      if (status === "SUCCEEDED") record.paidAt = new Date().toISOString();
    }
  }
}
