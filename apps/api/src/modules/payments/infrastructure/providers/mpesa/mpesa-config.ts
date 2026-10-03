// ============================================================================
// CAR HIRE OS — M-PESA CONFIGURATION & RUNTIME RESOLUTION (Sprint 23)
// Secure Runtime Configuration Supporting Strict Sandbox vs Production Separation
// ============================================================================

import type { MpesaConfig, MpesaEnvironment } from "@carhire/types";

export interface ResolvedMpesaEndpoints {
  authUrl: string;
  stkPushUrl: string;
  stkQueryUrl: string;
  c2bRegisterUrl: string;
  c2bSimulateUrl: string;
  b2cPaymentUrl: string;
  transactionStatusUrl: string;
  accountBalanceUrl: string;
  reversalUrl: string;
}

export const DARAJA_SANDBOX_BASE_URL = "https://sandbox.safaricom.co.ke";
export const DARAJA_PRODUCTION_BASE_URL = "https://api.safaricom.co.ke";

export function getMpesaEndpoints(environment: MpesaEnvironment): ResolvedMpesaEndpoints {
  const baseUrl = environment === "PRODUCTION" ? DARAJA_PRODUCTION_BASE_URL : DARAJA_SANDBOX_BASE_URL;
  return {
    authUrl: `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    stkPushUrl: `${baseUrl}/mpesa/stkpush/v1/processrequest`,
    stkQueryUrl: `${baseUrl}/mpesa/stkpushquery/v1/query`,
    c2bRegisterUrl: `${baseUrl}/mpesa/c2b/v1/registerurl`,
    c2bSimulateUrl: `${baseUrl}/mpesa/c2b/v1/simulate`,
    b2cPaymentUrl: `${baseUrl}/mpesa/b2c/v1/paymentrequest`,
    transactionStatusUrl: `${baseUrl}/mpesa/transactionstatus/v1/query`,
    accountBalanceUrl: `${baseUrl}/mpesa/accountbalance/v1/query`,
    reversalUrl: `${baseUrl}/mpesa/reversal/v1/request`,
  };
}

export class MpesaConfigProvider {
  private config: MpesaConfig;

  private static isProductionLikeEnvironment(): boolean {
    const envName = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
    return envName === "production" || envName === "staging";
  }

  private static isPlaceholderValue(value?: string): boolean {
    if (!value) return true;
    return /^(TEST_|DEV_|MOCK_|PLACEHOLDER_|DEFAULT_)/i.test(value) || value.includes("testapi") || value.includes("local") && value.includes("api.carhireos.local");
  }

  constructor(initialConfig?: Partial<MpesaConfig>) {
    // Determine environment explicitly from environment variable, never implicitly from NODE_ENV
    const envString = (process.env.MPESA_ENVIRONMENT || "").toUpperCase();
    const environment: MpesaEnvironment =
      initialConfig?.environment || (envString === "PRODUCTION" ? "PRODUCTION" : "SANDBOX");

    const consumerKey = initialConfig?.consumerKey ?? process.env.MPESA_CONSUMER_KEY ?? "TEST_CONSUMER_KEY";
    const consumerSecret = initialConfig?.consumerSecret ?? process.env.MPESA_CONSUMER_SECRET ?? "TEST_CONSUMER_SECRET";
    const passkey = initialConfig?.passkey ?? process.env.MPESA_PASSKEY ?? "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
    const shortcode = initialConfig?.shortcode ?? process.env.MPESA_SHORTCODE ?? "174379";
    const initiatorName = initialConfig?.initiatorName ?? process.env.MPESA_INITIATOR_NAME ?? "testapi";
    const securityCredential = initialConfig?.securityCredential ?? process.env.MPESA_SECURITY_CREDENTIAL ?? "TEST_CREDENTIAL";
    const callbackUrl = initialConfig?.callbackUrl ?? process.env.MPESA_CALLBACK_URL ?? "https://api.carhireos.local/api/v1/payments/webhooks/MPESA_DARAJA";
    const b2cResultUrl = initialConfig?.b2cResultUrl ?? process.env.MPESA_B2C_RESULT_URL ?? "https://api.carhireos.local/api/v1/payments/webhooks/MPESA_DARAJA";
    const b2cQueueTimeoutUrl = initialConfig?.b2cQueueTimeoutUrl ?? process.env.MPESA_B2C_TIMEOUT_URL ?? "https://api.carhireos.local/api/v1/payments/webhooks/MPESA_DARAJA";
    const c2bValidationUrl = initialConfig?.c2bValidationUrl ?? process.env.MPESA_C2B_VALIDATION_URL ?? "https://api.carhireos.local/api/v1/payments/mpesa/c2b/validation";
    const c2bConfirmationUrl = initialConfig?.c2bConfirmationUrl ?? process.env.MPESA_C2B_CONFIRMATION_URL ?? "https://api.carhireos.local/api/v1/payments/mpesa/c2b/confirmation";
    const webhookSharedSecret = initialConfig?.webhookSharedSecret ?? process.env.MPESA_WEBHOOK_SECRET ?? "mpesa_shared_webhook_secret_2026";

    const isProductionLike = environment === "PRODUCTION" || MpesaConfigProvider.isProductionLikeEnvironment();

    if (isProductionLike) {
      const forbidden = [
        ["consumerKey", consumerKey],
        ["consumerSecret", consumerSecret],
        ["passkey", passkey],
        ["shortcode", shortcode],
        ["initiatorName", initiatorName],
        ["securityCredential", securityCredential],
        ["webhookSharedSecret", webhookSharedSecret],
      ].filter(([, value]) => MpesaConfigProvider.isPlaceholderValue(String(value)))
        .map(([key]) => key);

      if (forbidden.length > 0) {
        throw new Error(
          `Production/staging M-Pesa configuration requires explicit non-placeholder values for: ${forbidden.join(", ")}.`
        );
      }
    }

    this.config = {
      environment,
      consumerKey,
      consumerSecret,
      passkey,
      shortcode,
      initiatorName,
      securityCredential,
      callbackUrl,
      b2cResultUrl,
      b2cQueueTimeoutUrl,
      c2bValidationUrl,
      c2bConfirmationUrl,
      webhookSharedSecret,
      timeoutMs: initialConfig?.timeoutMs ?? 30000,
    };
  }

  getConfig(): MpesaConfig {
    return { ...this.config };
  }

  getEndpoints(): ResolvedMpesaEndpoints {
    return getMpesaEndpoints(this.config.environment);
  }

  updateConfig(updates: Partial<MpesaConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Safe non-sensitive representation for logging and telemetry.
   * Strips all secrets, passkeys, and tokens.
   */
  toSafeLogObject(): Record<string, unknown> {
    return {
      environment: this.config.environment,
      shortcode: this.config.shortcode,
      initiatorName: this.config.initiatorName,
      consumerKeyMasked: this.config.consumerKey ? `${this.config.consumerKey.slice(0, 4)}****` : undefined,
      callbackUrl: this.config.callbackUrl,
    };
  }
}
