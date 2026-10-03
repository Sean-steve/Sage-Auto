// ============================================================================
// CAR HIRE OS — PAYMENT PROVIDER REGISTRY (Sprint 22: DEV-009)
// Registry Resolving Payment Providers By Canonical Provider Name
// ============================================================================

import type { IPaymentProvider, PaymentProviderName } from "@carhire/types";
import { MpesaPaymentProvider } from "./mpesa/mpesa-payment-provider";
import { StripeCardPaymentProvider } from "./stripe/stripe-card-provider";

export class PaymentProviderRegistry {
  private providers = new Map<PaymentProviderName, IPaymentProvider>();

  constructor() {
    // Register production-grade payment providers only
    this.register(new MpesaPaymentProvider());
    this.register(new StripeCardPaymentProvider());
  }

  private isProductionLike(): boolean {
    const envName = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
    return envName === "production" || envName === "staging";
  }

  register(provider: IPaymentProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: PaymentProviderName): IPaymentProvider {
    if (this.isProductionLike() && name === "FAKE_PROVIDER") {
      throw new Error(
        "Production and staging require an explicit payment provider; FAKE_PROVIDER is forbidden."
      );
    }

    const provider = this.providers.get(name);
    if (!provider) {
      if (this.isProductionLike()) {
        throw new Error(
          `Payment provider '${name}' is not registered in production; explicit provider configuration is required.`
        );
      }

      // In development/testing, we could optionally fall back to a test provider if needed
      // For now, we require explicit configuration in development
      throw new Error(`Payment provider '${name}' is not registered`);
    }
    return provider;
  }

  has(name: PaymentProviderName): boolean {
    return this.providers.has(name);
  }

  listRegistered(): PaymentProviderName[] {
    return Array.from(this.providers.keys());
  }
}
