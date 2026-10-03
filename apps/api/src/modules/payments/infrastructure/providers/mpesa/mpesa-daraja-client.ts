// ============================================================================
// CAR HIRE OS — M-PESA DARAJA API CLIENT (Sprint 23)
// HTTP Transport for STK Push, Query, B2C Disbursals, Reversals & C2B
// Includes Deterministic Local Simulation Engine for Robust Test Execution
// ============================================================================

import type {
  StkPushRequestPayload,
  StkPushResponse,
  StkQueryRequestPayload,
  StkQueryResponse,
  B2CPaymentRequestPayload,
  B2CPaymentResponse,
  TransactionStatusQueryPayload,
  ReversalRequestPayload,
  C2BValidationResponse,
} from "@carhire/types";
import { MpesaConfigProvider } from "./mpesa-config";
import { MpesaAuthService } from "./mpesa-auth.service";

export interface MpesaSimulationConfig {
  stkResultCode: number; // 0 = success, 1032 = cancelled, 1037 = timeout
  stkResultDesc?: string;
  b2cResultCode: number;
  b2cResultDesc?: string;
  simulateNetworkError?: boolean;
}

export class MpesaDarajaClient {
  private simulationConfig: MpesaSimulationConfig = {
    stkResultCode: 0,
    stkResultDesc: "The service request is processed successfully.",
    b2cResultCode: 0,
    b2cResultDesc: "The service request is processed successfully.",
  };

  private activeStkRequests = new Map<
    string,
    {
      payload: StkPushRequestPayload;
      merchantRequestId: string;
      checkoutRequestId: string;
      status: "PENDING" | "SUCCEEDED" | "FAILED";
      resultCode: number;
      resultDesc: string;
      mpesaReceiptNumber?: string;
      createdAt: number;
    }
  >();

  constructor(
    private readonly configProvider: MpesaConfigProvider,
    private readonly authService: MpesaAuthService
  ) {}

  setSimulationConfig(config: Partial<MpesaSimulationConfig>): void {
    this.simulationConfig = { ...this.simulationConfig, ...config };
  }

  // --------------------------------------------------------------------------
  // 1. STK PUSH (LIPA NA M-PESA ONLINE)
  // --------------------------------------------------------------------------

  async initiateStkPush(payload: StkPushRequestPayload): Promise<StkPushResponse> {
    if (this.simulationConfig.simulateNetworkError) {
      throw new Error("Simulated Safaricom network outage (ECONNRESET)");
    }

    const config = this.configProvider.getConfig();
    const token = await this.authService.getAccessToken();

    // If consumerKey is TEST_* or network is offline, perform deterministic simulation
    if (config.consumerKey.startsWith("TEST_") || process.env.NODE_ENV === "test") {
      const merchantRequestId = `MR_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const checkoutRequestId = `ws_CO_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      const isSuccess = this.simulationConfig.stkResultCode === 0;
      const receiptNumber = isSuccess
        ? `QGH${Math.floor(10000000 + Math.random() * 90000000)}`
        : undefined;

      this.activeStkRequests.set(checkoutRequestId, {
        payload,
        merchantRequestId,
        checkoutRequestId,
        status: isSuccess ? "SUCCEEDED" : "FAILED",
        resultCode: this.simulationConfig.stkResultCode,
        resultDesc:
          this.simulationConfig.stkResultDesc ||
          (isSuccess ? "Success" : `Failed with code ${this.simulationConfig.stkResultCode}`),
        mpesaReceiptNumber: receiptNumber,
        createdAt: Date.now(),
      });

      return {
        MerchantRequestID: merchantRequestId,
        CheckoutRequestID: checkoutRequestId,
        ResponseCode: "0",
        ResponseDescription: "Success. Request accepted for processing",
        CustomerMessage: "Success. Request accepted for processing",
      };
    }

    // Live HTTP call
    const endpoints = this.configProvider.getEndpoints();
    const response = await fetch(endpoints.stkPushUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Daraja STK Push failed HTTP ${response.status}: ${errText}`);
    }

    return (await response.json()) as StkPushResponse;
  }

  // --------------------------------------------------------------------------
  // 2. STK STATUS QUERY
  // --------------------------------------------------------------------------

  async queryStkStatus(payload: StkQueryRequestPayload): Promise<StkQueryResponse> {
    const config = this.configProvider.getConfig();

    if (config.consumerKey.startsWith("TEST_") || process.env.NODE_ENV === "test") {
      const tracked = this.activeStkRequests.get(payload.CheckoutRequestID);
      if (tracked) {
        return {
          ResponseCode: "0",
          ResponseDescription: "The service request has been accepted successfully",
          MerchantRequestID: tracked.merchantRequestId,
          CheckoutRequestID: tracked.checkoutRequestId,
          ResultCode: tracked.resultCode,
          ResultDesc: tracked.resultDesc,
        };
      }

      // Default simulated query response
      return {
        ResponseCode: "0",
        ResponseDescription: "The service request has been accepted successfully",
        MerchantRequestID: `MR_${Date.now()}`,
        CheckoutRequestID: payload.CheckoutRequestID,
        ResultCode: this.simulationConfig.stkResultCode,
        ResultDesc: this.simulationConfig.stkResultDesc || "The service request is processed successfully.",
      };
    }

    const token = await this.authService.getAccessToken();
    const endpoints = this.configProvider.getEndpoints();
    const response = await fetch(endpoints.stkQueryUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Daraja STK Query failed HTTP ${response.status}: ${errText}`);
    }

    return (await response.json()) as StkQueryResponse;
  }

  // --------------------------------------------------------------------------
  // 3. B2C PAYMENT DISBURSAL (Owner Settlement Payouts & Refunds)
  // --------------------------------------------------------------------------

  async initiateB2cPayment(payload: B2CPaymentRequestPayload): Promise<B2CPaymentResponse> {
    const config = this.configProvider.getConfig();

    if (config.consumerKey.startsWith("TEST_") || process.env.NODE_ENV === "test") {
      const conversationId = `AG_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const originatorConversationId = `OC_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

      if (this.simulationConfig.b2cResultCode !== 0) {
        return {
          ConversationID: conversationId,
          OriginatorConversationID: originatorConversationId,
          ResponseCode: "1",
          ResponseDescription: this.simulationConfig.b2cResultDesc || "Simulated B2C rejection",
        };
      }

      return {
        ConversationID: conversationId,
        OriginatorConversationID: originatorConversationId,
        ResponseCode: "0",
        ResponseDescription: "Accept the service request successfully.",
      };
    }

    const token = await this.authService.getAccessToken();
    const endpoints = this.configProvider.getEndpoints();
    const response = await fetch(endpoints.b2cPaymentUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Daraja B2C Payment failed HTTP ${response.status}: ${errText}`);
    }

    return (await response.json()) as B2CPaymentResponse;
  }

  // --------------------------------------------------------------------------
  // 4. TRANSACTION STATUS QUERY
  // --------------------------------------------------------------------------

  async queryTransactionStatus(payload: TransactionStatusQueryPayload): Promise<{ ResponseCode: string; ResponseDescription: string; ConversationID: string }> {
    const config = this.configProvider.getConfig();
    if (config.consumerKey.startsWith("TEST_") || process.env.NODE_ENV === "test") {
      return {
        ResponseCode: "0",
        ResponseDescription: "Accept the service request successfully.",
        ConversationID: `TS_${Date.now()}_${payload.TransactionID}`,
      };
    }

    const token = await this.authService.getAccessToken();
    const endpoints = this.configProvider.getEndpoints();
    const response = await fetch(endpoints.transactionStatusUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Daraja Transaction Status Query failed HTTP ${response.status}: ${errText}`);
    }

    return (await response.json()) as any;
  }

  // --------------------------------------------------------------------------
  // 5. TRANSACTION REVERSAL
  // --------------------------------------------------------------------------

  async initiateReversal(payload: ReversalRequestPayload): Promise<{ ResponseCode: string; ResponseDescription: string; ConversationID: string }> {
    const config = this.configProvider.getConfig();
    if (config.consumerKey.startsWith("TEST_") || process.env.NODE_ENV === "test") {
      return {
        ResponseCode: "0",
        ResponseDescription: "Accept the service request successfully.",
        ConversationID: `REV_${Date.now()}_${payload.TransactionID}`,
      };
    }

    const token = await this.authService.getAccessToken();
    const endpoints = this.configProvider.getEndpoints();
    const response = await fetch(endpoints.reversalUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Daraja Reversal failed HTTP ${response.status}: ${errText}`);
    }

    return (await response.json()) as any;
  }

  /**
   * Helper for tests to inspect tracked STK requests
   */
  getTrackedStkRequest(checkoutRequestId: string) {
    return this.activeStkRequests.get(checkoutRequestId);
  }
}
