// ============================================================================
// CAR HIRE OS — DETERMINISTIC TEST HARNESS: PROVIDER FAKES
// Provides zero-external-dependency, deterministic test doubles for all
// external providers (M-Pesa, Card/Stripe, Notifications, DNS, Antivirus).
// ============================================================================

export interface FakePaymentResult {
  success: boolean;
  providerReference: string;
  errorCode?: string;
  errorMessage?: string;
  rawPayload: Record<string, any>;
}

export class MpesaProviderFake {
  private shouldFailNext: boolean = false;
  private failReason?: string;
  public initiatedCalls: Array<{ msisdn: string; amount: number; reference: string }> = [];

  public setSimulateFailure(fail: boolean, reason?: string) {
    this.shouldFailNext = fail;
    this.failReason = reason;
  }

  public async initiateStkPush(params: {
    msisdn: string;
    amount: number;
    accountReference: string;
    transactionDesc: string;
  }): Promise<{ checkoutRequestId: string; responseCode: string; responseDescription: string }> {
    this.initiatedCalls.push({
      msisdn: params.msisdn,
      amount: params.amount,
      reference: params.accountReference,
    });

    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      throw new Error(this.failReason || "Simulated M-Pesa STK push network timeout");
    }

    return {
      checkoutRequestId: `ws_CO_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      responseCode: "0",
      responseDescription: "Success. Request accepted for processing",
    };
  }

  public buildSuccessfulCallbackPayload(checkoutRequestId: string, msisdn: string, amount: number) {
    return {
      Body: {
        stkCallback: {
          MerchantRequestID: "29115-34620561-1",
          CheckoutRequestID: checkoutRequestId,
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: amount },
              { Name: "MpesaReceiptNumber", Value: `QHD${Math.random().toString(36).slice(2, 8).toUpperCase()}` },
              { Name: "TransactionDate", Value: 20260916120000 },
              { Name: "PhoneNumber", Value: Number(msisdn.replace("+", "")) },
            ],
          },
        },
      },
    };
  }
}

export class CardProviderFake {
  private shouldFailNext: boolean = false;
  public charges: Array<{ token: string; amount: number; currency: string }> = [];

  public setSimulateFailure(fail: boolean) {
    this.shouldFailNext = fail;
  }

  public async chargeCard(params: {
    paymentMethodToken: string;
    amount: number;
    currency: string;
  }): Promise<FakePaymentResult> {
    this.charges.push({
      token: params.paymentMethodToken,
      amount: params.amount,
      currency: params.currency,
    });

    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      return {
        success: false,
        providerReference: `ch_err_${Date.now()}`,
        errorCode: "card_declined",
        errorMessage: "Your card was declined due to insufficient funds.",
        rawPayload: { code: "card_declined" },
      };
    }

    return {
      success: true,
      providerReference: `ch_succ_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      rawPayload: { status: "succeeded", captured: true },
    };
  }
}

export class NotificationProviderFake {
  public sentMessages: Array<{
    channel: "EMAIL" | "SMS" | "WHATSAPP";
    recipient: string;
    subject?: string;
    body: string;
  }> = [];

  public async send(message: {
    channel: "EMAIL" | "SMS" | "WHATSAPP";
    recipient: string;
    subject?: string;
    body: string;
  }): Promise<{ messageId: string; status: "SENT" }> {
    this.sentMessages.push(message);
    return {
      messageId: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      status: "SENT",
    };
  }

  public clear() {
    this.sentMessages = [];
  }
}

export class DnsVerificationProviderFake {
  private records: Map<string, string[]> = new Map();

  public setRecord(hostname: string, value: string) {
    const current = this.records.get(hostname) || [];
    current.push(value);
    this.records.set(hostname, current);
  }

  public async resolveTxt(hostname: string): Promise<string[]> {
    return this.records.get(hostname) || [];
  }
}

export class StorageScannerFake {
  public scannedObjects: string[] = [];

  public async scanObject(buffer: Buffer): Promise<{ isClean: boolean; threatName?: string }> {
    const content = buffer.toString("utf8", 0, Math.min(buffer.length, 1024));
    this.scannedObjects.push(content.slice(0, 32));

    if (content.includes("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*")) {
      return { isClean: false, threatName: "EICAR-Test-Signature" };
    }

    return { isClean: true };
  }
}
