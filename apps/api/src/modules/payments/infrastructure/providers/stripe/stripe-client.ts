// ============================================================================
// CAR HIRE OS — SPRINT 24: STRIPE CLIENT & RESILIENT TRANSPORT ADAPTER
// Stripe API Protocol Engine with Idempotency, 3DS & In-Memory Offline Simulator
// ============================================================================

import type {
  StripeCheckoutSessionOptions,
  StripeCheckoutSessionResponse,
  StripePaymentIntentOptions,
  StripePaymentIntentResponse,
  StripeRefundOptions,
  StripeRefundResponse,
} from "@carhire/types";
import { StripeConfigProvider } from "./stripe-config";

export interface StripeClientOptions {
  configProvider: StripeConfigProvider;
  useOfflineSimulator?: boolean;
}

export class StripeClient {
  private configProvider: StripeConfigProvider;
  private useOfflineSimulator: boolean;

  // In-memory test store for checkout sessions, intents and refunds
  private static mockSessions = new Map<string, StripeCheckoutSessionResponse>();
  private static mockPaymentIntents = new Map<string, StripePaymentIntentResponse>();
  private static mockRefunds = new Map<string, StripeRefundResponse>();

  constructor(options: StripeClientOptions) {
    this.configProvider = options.configProvider;
    // Default to offline simulator if no live network key or running in test/sandbox
    this.useOfflineSimulator =
      options.useOfflineSimulator ??
      (!process.env.STRIPE_SECRET_KEY || process.env.NODE_ENV === "test" || !this.configProvider.isProduction());
  }

  // Helper for test suites to inspect or preset mocks
  static resetMocks(): void {
    StripeClient.mockSessions.clear();
    StripeClient.mockPaymentIntents.clear();
    StripeClient.mockRefunds.clear();
  }

  static setMockSession(session: StripeCheckoutSessionResponse): void {
    StripeClient.mockSessions.set(session.id, session);
  }

  static setMockPaymentIntent(pi: StripePaymentIntentResponse): void {
    StripeClient.mockPaymentIntents.set(pi.id, pi);
  }

  /**
   * Creates a Stripe Checkout Session (Provider-Hosted Card & 3DS Checkout).
   */
  async createCheckoutSession(
    options: StripeCheckoutSessionOptions
  ): Promise<StripeCheckoutSessionResponse> {
    if (this.useOfflineSimulator) {
      const sessionId = `cs_test_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const paymentIntentId = `pi_test_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const session: StripeCheckoutSessionResponse = {
        id: sessionId,
        object: "checkout.session",
        status: "open",
        payment_status: "unpaid",
        payment_intent: paymentIntentId,
        url: `https://checkout.stripe.com/c/pay/${sessionId}`,
        amount_total: options.amount,
        currency: options.currency.toLowerCase(),
        client_reference_id: options.intentReference,
        metadata: {
          attemptId: options.attemptId,
          tenantId: options.tenantId,
          intentReference: options.intentReference,
          ...options.metadata,
        },
        customer_details: {
          email: options.customerEmail,
          name: options.customerName,
        },
      };

      // Also create matching PaymentIntent in mock
      const chargeId = `ch_test_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const paymentIntent: StripePaymentIntentResponse = {
        id: paymentIntentId,
        object: "payment_intent",
        status: "requires_payment_method",
        amount: options.amount,
        amount_received: 0,
        currency: options.currency.toLowerCase(),
        latest_charge: chargeId,
        charges: {
          data: [
            {
              id: chargeId,
              paid: false,
              refunded: false,
              amount_refunded: 0,
              payment_method_details: {
                card: {
                  brand: "visa",
                  last4: "4242",
                  exp_month: 12,
                  exp_year: 2028,
                  funding: "credit",
                  country: "US",
                  three_d_secure: {
                    authenticated: true,
                  },
                },
              },
            },
          ],
        },
        metadata: session.metadata,
      };

      StripeClient.mockSessions.set(sessionId, session);
      StripeClient.mockPaymentIntents.set(paymentIntentId, paymentIntent);

      return session;
    }

    // Live HTTP call
    const params = new URLSearchParams({
      "payment_method_types[0]": "card",
      mode: "payment",
      success_url: options.successUrl,
      cancel_url: options.cancelUrl,
      client_reference_id: options.intentReference,
      "line_items[0][price_data][currency]": options.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": options.amount.toString(),
      "line_items[0][price_data][product_data][name]": options.description || `Payment ${options.intentReference}`,
      "line_items[0][quantity]": "1",
    });

    if (options.customerEmail) {
      params.append("customer_email", options.customerEmail);
    }
    if (options.metadata) {
      for (const [key, val] of Object.entries(options.metadata)) {
        params.append(`metadata[${key}]`, val);
      }
    }

    const res = await this.executePost("/checkout/sessions", params);
    return res as unknown as StripeCheckoutSessionResponse;
  }

  /**
   * Retrieves an existing Stripe Checkout Session.
   */
  async getCheckoutSession(sessionId: string): Promise<StripeCheckoutSessionResponse> {
    if (this.useOfflineSimulator) {
      const session = StripeClient.mockSessions.get(sessionId);
      if (!session) {
        throw new Error(`Stripe Checkout Session '${sessionId}' not found in simulator`);
      }
      return session;
    }

    const res = await this.executeGet(`/checkout/sessions/${sessionId}`);
    return res as unknown as StripeCheckoutSessionResponse;
  }

  /**
   * Creates or confirms a Stripe PaymentIntent directly.
   */
  async createPaymentIntent(
    options: StripePaymentIntentOptions
  ): Promise<StripePaymentIntentResponse> {
    if (this.useOfflineSimulator) {
      const intentId = `pi_test_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const chargeId = `ch_test_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const intent: StripePaymentIntentResponse = {
        id: intentId,
        object: "payment_intent",
        status: options.confirm ? "succeeded" : "requires_payment_method",
        amount: options.amount,
        amount_received: options.confirm ? options.amount : 0,
        currency: options.currency.toLowerCase(),
        latest_charge: chargeId,
        charges: {
          data: [
            {
              id: chargeId,
              paid: !!options.confirm,
              refunded: false,
              amount_refunded: 0,
              payment_method_details: {
                card: {
                  brand: "visa",
                  last4: "4242",
                  exp_month: 12,
                  exp_year: 2028,
                  funding: "credit",
                  country: "US",
                  three_d_secure: {
                    authenticated: true,
                  },
                },
              },
            },
          ],
        },
        metadata: options.metadata,
      };

      StripeClient.mockPaymentIntents.set(intentId, intent);
      return intent;
    }

    const params = new URLSearchParams({
      amount: options.amount.toString(),
      currency: options.currency.toLowerCase(),
      description: options.description || `Payment ${options.intentReference}`,
    });

    if (options.paymentMethodId) {
      params.append("payment_method", options.paymentMethodId);
    }
    if (options.confirm) {
      params.append("confirm", "true");
    }
    if (options.returnUrl) {
      params.append("return_url", options.returnUrl);
    }
    if (options.metadata) {
      for (const [key, val] of Object.entries(options.metadata)) {
        params.append(`metadata[${key}]`, val);
      }
    }

    const res = await this.executePost("/payment_intents", params);
    return res as unknown as StripePaymentIntentResponse;
  }

  /**
   * Retrieves a Stripe PaymentIntent by ID.
   */
  async getPaymentIntent(paymentIntentId: string): Promise<StripePaymentIntentResponse> {
    if (this.useOfflineSimulator) {
      const pi = StripeClient.mockPaymentIntents.get(paymentIntentId);
      if (!pi) {
        throw new Error(`Stripe PaymentIntent '${paymentIntentId}' not found in simulator`);
      }
      return pi;
    }

    const res = await this.executeGet(`/payment_intents/${paymentIntentId}`);
    return res as unknown as StripePaymentIntentResponse;
  }

  /**
   * Executes a Refund via Stripe Refund API with Idempotency Key.
   */
  async refundPayment(options: StripeRefundOptions): Promise<StripeRefundResponse> {
    if (this.useOfflineSimulator) {
      const refundId = `re_test_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const pi = StripeClient.mockPaymentIntents.get(options.paymentIntentId);
      const refundAmount = options.amount ?? pi?.amount ?? 1000;
      const currency = pi?.currency ?? "usd";

      const refund: StripeRefundResponse = {
        id: refundId,
        object: "refund",
        amount: refundAmount,
        currency,
        payment_intent: options.paymentIntentId,
        status: "succeeded",
        created: Math.floor(Date.now() / 1000),
        metadata: options.metadata,
      };

      StripeClient.mockRefunds.set(refundId, refund);

      // Update mock payment intent charge state
      if (pi && pi.charges?.data?.[0]) {
        const ch = pi.charges.data[0];
        ch.amount_refunded = (ch.amount_refunded || 0) + refundAmount;
        ch.refunded = ch.amount_refunded >= ch.amount_refunded;
      }

      return refund;
    }

    const params = new URLSearchParams({
      payment_intent: options.paymentIntentId,
    });
    if (options.amount) {
      params.append("amount", options.amount.toString());
    }
    if (options.reason) {
      params.append("reason", options.reason);
    }
    if (options.metadata) {
      for (const [key, val] of Object.entries(options.metadata)) {
        params.append(`metadata[${key}]`, val);
      }
    }

    const res = await this.executePost("/refunds", params, options.idempotencyKey);
    return res as unknown as StripeRefundResponse;
  }

  // --------------------------------------------------------------------------
  // Private HTTP Execution Helpers
  // --------------------------------------------------------------------------

  private async executeGet(path: string): Promise<Record<string, unknown>> {
    const config = this.configProvider.getConfig();
    const url = `${this.configProvider.getBaseUrl()}${path}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Stripe-Version": config.apiVersion || "2024-06-20",
      },
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(`Stripe API error: ${body.error ? JSON.stringify(body.error) : res.statusText}`);
    }
    return body;
  }

  private async executePost(
    path: string,
    params: URLSearchParams,
    idempotencyKey?: string
  ): Promise<Record<string, unknown>> {
    const config = this.configProvider.getConfig();
    const url = `${this.configProvider.getBaseUrl()}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": config.apiVersion || "2024-06-20",
    };
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: params.toString(),
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(`Stripe API error: ${body.error ? JSON.stringify(body.error) : res.statusText}`);
    }
    return body;
  }
}
