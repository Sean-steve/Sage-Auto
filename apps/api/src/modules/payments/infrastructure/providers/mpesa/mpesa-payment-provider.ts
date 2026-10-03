// ============================================================================
// CAR HIRE OS — M-PESA DARAJA PAYMENT PROVIDER ADAPTER (Sprint 23)
// Production Infrastructure Adapter Fulfilling the Canonical IPaymentProvider Contract
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
  StkCallbackPayload,
  StkCallbackMetadataItem,
} from "@carhire/types";
import { MpesaConfigProvider } from "./mpesa-config";
import { MpesaAuthService } from "./mpesa-auth.service";
import { MpesaPhoneNormalizer } from "./mpesa-phone-normalizer";
import { MpesaSecurityService } from "./mpesa-security.service";
import { MpesaDarajaClient } from "./mpesa-daraja-client";

export class MpesaPaymentProvider implements IPaymentProvider {
  public readonly name: PaymentProviderName = "MPESA_DARAJA";
  public readonly capabilities: ProviderCapability[] = [
    "INBOUND_PAYMENT",
    "OUTBOUND_PAYMENT",
    "REFUND",
    "STATUS_QUERY",
    "WEBHOOK",
    "PAYOUT",
  ];

  public readonly configProvider: MpesaConfigProvider;
  public readonly authService: MpesaAuthService;
  public readonly darajaClient: MpesaDarajaClient;

  constructor(
    configProvider?: MpesaConfigProvider,
    authService?: MpesaAuthService,
    darajaClient?: MpesaDarajaClient
  ) {
    this.configProvider = configProvider || new MpesaConfigProvider();
    this.authService = authService || new MpesaAuthService(this.configProvider);
    this.darajaClient = darajaClient || new MpesaDarajaClient(this.configProvider, this.authService);
  }

  // --------------------------------------------------------------------------
  // 1. INITIALIZE PAYMENT (Lipa Na M-Pesa STK Push)
  // --------------------------------------------------------------------------

  async initializePayment(input: InitializePaymentInput): Promise<InitializePaymentResult> {
    if (!input.customerPhone) {
      throw new Error("Customer phone number is required for M-Pesa STK Push");
    }

    const normalizedPhone = MpesaPhoneNormalizer.normalize(input.customerPhone);
    const amountFloat = parseFloat(input.amount);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      throw new Error("M-Pesa payment amount must be greater than zero");
    }

    // Safaricom STK Push requires whole integer KES
    const wholeAmount = Math.max(1, Math.round(amountFloat));

    const config = this.configProvider.getConfig();
    const timestamp = MpesaSecurityService.generateTimestamp();
    const password = MpesaSecurityService.generateStkPassword(config.shortcode, config.passkey, timestamp);

    const accountRef = (input.metadata?.accountReference as string) || input.intentReference.slice(0, 12);
    const transactionDesc = (input.metadata?.transactionDesc as string) || `CarHire ${input.purpose}`;

    const response = await this.darajaClient.initiateStkPush({
      BusinessShortCode: config.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: wholeAmount,
      PartyA: normalizedPhone,
      PartyB: config.shortcode,
      PhoneNumber: normalizedPhone,
      CallBackURL: config.callbackUrl || "https://api.carhireos.local/api/v1/payments/webhooks/MPESA_DARAJA",
      AccountReference: accountRef,
      TransactionDesc: transactionDesc,
    });

    return {
      providerReference: response.CheckoutRequestID,
      providerRequestReference: response.MerchantRequestID,
      checkoutUrl: undefined, // STK push sends prompt to customer handset directly
      status: "PENDING_CALLBACK",
      rawResponse: response as unknown as Record<string, unknown>,
    };
  }

  // --------------------------------------------------------------------------
  // 2. GET PAYMENT STATUS (STK Query / Daraja Status API)
  // --------------------------------------------------------------------------

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<ProviderPaymentStatusResult> {
    const config = this.configProvider.getConfig();
    const timestamp = MpesaSecurityService.generateTimestamp();
    const password = MpesaSecurityService.generateStkPassword(config.shortcode, config.passkey, timestamp);

    const checkoutRequestId = input.providerReference || input.intentReference;

    const queryResponse = await this.darajaClient.queryStkStatus({
      BusinessShortCode: config.shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    });

    const resultCode = Number(queryResponse.ResultCode);

    if (resultCode === 0) {
      return {
        status: "SUCCEEDED",
        providerTransactionId: `TXN_${checkoutRequestId}`,
        paidAt: new Date().toISOString(),
        rawResponse: queryResponse as unknown as Record<string, unknown>,
      };
    }

    if (resultCode === 1032) {
      return {
        status: "FAILED",
        failureCode: "USER_CANCELLED",
        failureReason: "Payment cancelled by customer on their handset",
        rawResponse: queryResponse as unknown as Record<string, unknown>,
      };
    }

    if (resultCode === 1037) {
      return {
        status: "FAILED",
        failureCode: "STK_TIMEOUT",
        failureReason: "STK push timed out (no response from customer mobile)",
        rawResponse: queryResponse as unknown as Record<string, unknown>,
      };
    }

    return {
      status: "FAILED",
      failureCode: `RESULT_CODE_${resultCode}`,
      failureReason: queryResponse.ResultDesc || "Payment failed or rejected by M-Pesa",
      rawResponse: queryResponse as unknown as Record<string, unknown>,
    };
  }

  // --------------------------------------------------------------------------
  // 3. VERIFY PAYMENT (Server-Authoritative Query)
  // --------------------------------------------------------------------------

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const statusResult = await this.getPaymentStatus({
      tenantId: input.tenantId,
      attemptId: input.attemptId,
      intentReference: input.intentReference,
      providerReference: input.providerReference,
    });

    if (statusResult.status === "SUCCEEDED") {
      return {
        verified: true,
        providerTransactionId: statusResult.providerTransactionId || `TXN_${input.providerReference}`,
        amount: statusResult.amountPaid || "0.0000",
        currency: statusResult.currency || "KES",
        paidAt: statusResult.paidAt || new Date().toISOString(),
        payerReference: statusResult.payerReference || "M-Pesa Payer",
        verificationSource: "STATUS_QUERY",
        rawPayload: statusResult.rawResponse,
      };
    }

    return {
      verified: false,
      providerTransactionId: "",
      amount: "0.0000",
      currency: "KES",
      paidAt: new Date().toISOString(),
      verificationSource: "STATUS_QUERY",
      rawPayload: statusResult.rawResponse,
    };
  }

  // --------------------------------------------------------------------------
  // 4. REFUND PAYMENT (M-Pesa Reversal / Disbursal)
  // --------------------------------------------------------------------------

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    const config = this.configProvider.getConfig();
    const amountFloat = parseFloat(input.refundAmount);
    const wholeAmount = Math.max(1, Math.round(amountFloat));

    try {
      const reversalRes = await this.darajaClient.initiateReversal({
        Initiator: config.initiatorName || "testapi",
        SecurityCredential: config.securityCredential || "TEST_CRED",
        CommandID: "TransactionReversal",
        TransactionID: input.providerTransactionId,
        Amount: wholeAmount,
        ReceiverParty: config.shortcode,
        RecieverIdentifierType: "11",
        ResultURL: config.b2cResultUrl || "https://api.carhireos.local/webhooks/mpesa",
        QueueTimeOutURL: config.b2cQueueTimeoutUrl || "https://api.carhireos.local/webhooks/mpesa",
        Remarks: input.reason.slice(0, 50),
      });

      return {
        success: true,
        providerRefundReference: reversalRes.ConversationID,
        status: "COMPLETED",
        completedAt: new Date().toISOString(),
        rawResponse: reversalRes as unknown as Record<string, unknown>,
      };
    } catch (err: any) {
      return {
        success: false,
        providerRefundReference: "",
        status: "FAILED",
        failureReason: err.message || "M-Pesa reversal rejected",
      };
    }
  }

  // --------------------------------------------------------------------------
  // 5. EXECUTE PAYOUT (M-Pesa B2C Disbursal for Owner Settlements)
  // --------------------------------------------------------------------------

  async executePayout(input: ExecutePayoutInput): Promise<ExecutePayoutResult> {
    const config = this.configProvider.getConfig();
    const recipientPhone = MpesaPhoneNormalizer.normalize(input.recipientAccountOrPhone);
    const amountFloat = parseFloat(input.amount);
    const wholeAmount = Math.max(1, Math.round(amountFloat));

    try {
      const b2cResponse = await this.darajaClient.initiateB2cPayment({
        InitiatorName: config.initiatorName || "testapi",
        SecurityCredential: config.securityCredential || "TEST_CRED",
        CommandID: "BusinessPayment",
        Amount: wholeAmount,
        PartyA: config.shortcode,
        PartyB: recipientPhone,
        Remarks: `Owner Settlement ${input.payableId.slice(0, 10)}`,
        QueueTimeOutURL: config.b2cQueueTimeoutUrl || "https://api.carhireos.local/webhooks/mpesa",
        ResultURL: config.b2cResultUrl || "https://api.carhireos.local/webhooks/mpesa",
      });

      if (b2cResponse.ResponseCode !== "0") {
        return {
          success: false,
          providerTransactionId: "",
          status: "FAILED",
          failureReason: b2cResponse.ResponseDescription || "B2C request rejected by Daraja",
        };
      }

      return {
        success: true,
        providerTransactionId: b2cResponse.ConversationID,
        providerReference: b2cResponse.OriginatorConversationID,
        status: "COMPLETED",
        disbursedAt: new Date().toISOString(),
        rawResponse: b2cResponse as unknown as Record<string, unknown>,
      };
    } catch (err: any) {
      return {
        success: false,
        providerTransactionId: "",
        status: "FAILED",
        failureReason: err.message || "M-Pesa B2C Payout failed",
      };
    }
  }

  // --------------------------------------------------------------------------
  // 6. ZERO-TRUST CALLBACK VERIFICATION
  // --------------------------------------------------------------------------

  verifyWebhookSignature(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string | Buffer
  ): boolean {
    const config = this.configProvider.getConfig();
    return MpesaSecurityService.verifyCallbackAuthenticity(
      headers,
      rawBody,
      config.webhookSharedSecret
    );
  }

  // --------------------------------------------------------------------------
  // 7. PARSE WEBHOOK PAYLOAD (STK Push, C2B, B2C)
  // --------------------------------------------------------------------------

  parseWebhookPayload(
    payload: Record<string, unknown>,
    _headers?: Record<string, unknown>
  ): ParsedWebhookEvent {
    // A. STK PUSH CALLBACK: { Body: { stkCallback: { ... } } }
    const body = payload.Body as any;
    if (body?.stkCallback) {
      const cb = body.stkCallback;
      const checkoutRequestId: string = cb.CheckoutRequestID;
      const resultCode: number = Number(cb.ResultCode);
      const resultDesc: string = cb.ResultDesc;

      let mpesaReceiptNumber: string | undefined;
      let amount: number | undefined;
      let phoneNumber: string | undefined;
      let transactionDate: string | undefined;

      if (resultCode === 0 && cb.CallbackMetadata?.Item) {
        const items = cb.CallbackMetadata.Item as StkCallbackMetadataItem[];
        for (const item of items) {
          if (item.Name === "MpesaReceiptNumber") {
            mpesaReceiptNumber = String(item.Value);
          } else if (item.Name === "Amount") {
            amount = Number(item.Value);
          } else if (item.Name === "PhoneNumber") {
            phoneNumber = String(item.Value);
          } else if (item.Name === "TransactionDate") {
            transactionDate = String(item.Value);
          }
        }
      }

      const isSuccess = resultCode === 0;

      return {
        isValid: true,
        eventType: "MPESA_STK_CALLBACK",
        providerEventId: checkoutRequestId || `EVT_${Date.now()}`,
        intentReference: checkoutRequestId,
        providerReference: checkoutRequestId,
        providerTransactionId: mpesaReceiptNumber || `TXN_${checkoutRequestId}`,
        amount: amount !== undefined ? amount.toFixed(4) : undefined,
        currency: "KES",
        status: isSuccess ? "SUCCEEDED" : "FAILED",
        payerReference: phoneNumber,
        failureReason: isSuccess ? undefined : resultDesc,
        occurredAt: transactionDate || new Date().toISOString(),
        rawPayload: payload,
      };
    }

    // B. C2B CONFIRMATION: { TransID, TransAmount, BillRefNumber, MSISDN, ... }
    if (payload.TransID && payload.BillRefNumber) {
      const transId = String(payload.TransID);
      const amount = String(payload.TransAmount);
      const billRef = String(payload.BillRefNumber);
      const msisdn = String(payload.MSISDN || "");

      return {
        isValid: true,
        eventType: "MPESA_C2B_CONFIRMATION",
        providerEventId: transId,
        intentReference: billRef,
        providerReference: billRef,
        providerTransactionId: transId,
        amount: parseFloat(amount).toFixed(4),
        currency: "KES",
        status: "SUCCEEDED",
        payerReference: msisdn,
        occurredAt: (payload.TransTime as string) || new Date().toISOString(),
        rawPayload: payload,
      };
    }

    // C. B2C RESULT: { Result: { TransactionID, ConversationID, ResultCode, ... } }
    const b2cResult = payload.Result as any;
    if (b2cResult) {
      const txId: string = b2cResult.TransactionID || b2cResult.ConversationID;
      const conversationId: string = b2cResult.ConversationID;
      const resultCode: number = Number(b2cResult.ResultCode);
      const resultDesc: string = b2cResult.ResultDesc;

      return {
        isValid: true,
        eventType: "MPESA_B2C_RESULT",
        providerEventId: txId || conversationId,
        intentReference: conversationId,
        providerReference: conversationId,
        providerTransactionId: txId,
        currency: "KES",
        status: resultCode === 0 ? "SUCCEEDED" : "FAILED",
        failureReason: resultCode === 0 ? undefined : resultDesc,
        occurredAt: new Date().toISOString(),
        rawPayload: payload,
      };
    }

    // Fallback generic event parser
    return {
      isValid: true,
      eventType: (payload.eventType as string) || "MPESA_GENERIC",
      providerEventId: (payload.eventId as string) || `EVT_${Date.now()}`,
      status: "PENDING",
      occurredAt: new Date().toISOString(),
      rawPayload: payload,
    };
  }
}
