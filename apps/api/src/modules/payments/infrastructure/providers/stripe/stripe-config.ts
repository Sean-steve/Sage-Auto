// ============================================================================
// CAR HIRE OS — SPRINT 24: STRIPE CARD CONFIGURATION PROVIDER
// Environment-Aware Stripe Keys, Endpoint Configuration & Secret Redaction
// ============================================================================

import type { StripeConfig } from "@carhire/types";

export interface StripeConfigOptions extends Partial<StripeConfig> {
  defaultCurrency?: string;
}

export class StripeConfigProvider {
  private config: StripeConfig;
  private defaultCurrency: string;

  constructor(options?: StripeConfigOptions) {
    const deploymentEnvironment = (
      process.env.APP_ENV || process.env.NODE_ENV || "development"
    ).toLowerCase();
    const isProductionLike = deploymentEnvironment === "production" || deploymentEnvironment === "staging";
    const env = (
      options?.environment ||
      process.env.STRIPE_ENVIRONMENT ||
      (isProductionLike ? "PRODUCTION" : "TEST")
    ).toUpperCase() as
      | "TEST"
      | "PRODUCTION";

    if (isProductionLike && env !== "PRODUCTION") {
      throw new Error("Production and staging require STRIPE_ENVIRONMENT=PRODUCTION.");
    }

    const publishableKey = options?.publishableKey || process.env.STRIPE_PUBLISHABLE_KEY;
    const secretKey = options?.secretKey || process.env.STRIPE_SECRET_KEY;
    const webhookSecret = options?.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;

    if (env === "PRODUCTION") {
      const hasPlaceholder = (value: string | undefined): boolean =>
        !value ||
        /canonical|placeholder|test_|dev_|dummy|example/i.test(value);

      if (hasPlaceholder(publishableKey) || hasPlaceholder(secretKey) || hasPlaceholder(webhookSecret)) {
        throw new Error(
          "Production Stripe configuration requires explicit non-placeholder publishable, secret, and webhook credentials."
        );
      }
    }

    this.config = {
      environment: env,
      publishableKey: publishableKey || "pk_test_carhire_canonical",
      secretKey: secretKey || "sk_test_carhire_canonical",
      webhookSecret: webhookSecret || "whsec_test_stripe_webhook_secret_canonical",
      apiVersion: options?.apiVersion || "2024-06-20",
      timeoutMs: options?.timeoutMs || 15000,
      maxNetworkRetries: options?.maxNetworkRetries ?? 2,
    };

    this.defaultCurrency = (options?.defaultCurrency || process.env.STRIPE_DEFAULT_CURRENCY || "USD").toUpperCase();
  }

  getConfig(): Readonly<StripeConfig> {
    return Object.freeze({ ...this.config });
  }

  getDefaultCurrency(): string {
    return this.defaultCurrency;
  }

  isProduction(): boolean {
    return this.config.environment === "PRODUCTION";
  }

  getBaseUrl(): string {
    return "https://api.stripe.com/v1";
  }

  /**
   * Returns a sanitized view of configuration for audit/logging.
   * Strips secret keys and webhook secrets to prevent leakage.
   */
  toSafeLogObject(): Record<string, unknown> {
    return {
      environment: this.config.environment,
      publishableKey: this.config.publishableKey.slice(0, 8) + "...",
      apiVersion: this.config.apiVersion,
      timeoutMs: this.config.timeoutMs,
      defaultCurrency: this.defaultCurrency,
    };
  }
}
