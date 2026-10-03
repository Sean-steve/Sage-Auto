// ============================================================================
// CAR HIRE OS — SPRINT 24: CARD PAYMENTS & TOKENIZED CHECKOUT CONTRACTS
// Strongly Typed Interfaces for Provider-Safe Card Processing, Tokenization,
// 3DS / SCA, Webhook Verification, Refunds, Disputes & PCI Minimization
// ============================================================================

export type CardBrand =
  | "VISA"
  | "MASTERCARD"
  | "AMEX"
  | "DISCOVER"
  | "JCB"
  | "DINERS_CLUB"
  | "UNIONPAY"
  | "UNKNOWN";

export type CardFundingType = "CREDIT" | "DEBIT" | "PREPAID" | "UNKNOWN";

export type ThreeDSecureStatus =
  | "NOT_REQUIRED"
  | "CHALLENGE_REQUIRED"
  | "AUTHENTICATED"
  | "ATTEMPTED"
  | "REJECTED"
  | "FAILED";

export type CardDeclineCode =
  | "INSUFFICIENT_FUNDS"
  | "CARD_EXPIRED"
  | "INCORRECT_CVC"
  | "INCORRECT_NUMBER"
  | "FRAUD_SUSPECTED"
  | "CARD_DECLINED"
  | "AUTHENTICATION_REQUIRED"
  | "PROCESSING_ERROR"
  | "STOLEN_CARD";

export interface CardMaskedSummary {
  brand: CardBrand;
  last4: string; // Exactly 4 digits e.g. "4242"
  expMonth: number;
  expYear: number;
  funding?: CardFundingType;
  country?: string;
  cardholderName?: string;
  fingerprint?: string;
}

export interface StripeConfig {
  environment: "TEST" | "PRODUCTION";
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
  apiVersion?: string;
  timeoutMs?: number;
  maxNetworkRetries?: number;
}

export interface StripeCheckoutSessionOptions {
  attemptId: string;
  tenantId: string;
  intentReference: string;
  amount: number; // Smallest currency unit (cents)
  currency: string; // Lowercase ISO 4217 (e.g. 'usd', 'kes', 'eur')
  customerEmail?: string;
  customerName?: string;
  successUrl: string;
  cancelUrl: string;
  description?: string;
  metadata?: Record<string, string>;
  captureMethod?: "automatic" | "manual"; // For rental security deposit authorization holds
}

export interface StripePaymentIntentOptions {
  amount: number; // Smallest currency unit
  currency: string;
  intentReference: string;
  paymentMethodId?: string;
  customerId?: string;
  confirm?: boolean;
  captureMethod?: "automatic" | "manual";
  returnUrl?: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface StripeCheckoutSessionResponse {
  id: string; // cs_test_...
  object: "checkout.session";
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid" | "no_payment_required";
  payment_intent?: string; // pi_test_...
  url?: string;
  customer?: string;
  customer_details?: {
    email?: string;
    name?: string;
  };
  amount_total: number;
  currency: string;
  client_reference_id?: string;
  metadata?: Record<string, string>;
}

export interface StripePaymentIntentResponse {
  id: string; // pi_test_...
  object: "payment_intent";
  status:
    | "requires_payment_method"
    | "requires_confirmation"
    | "requires_action"
    | "processing"
    | "requires_capture"
    | "canceled"
    | "succeeded";
  amount: number;
  amount_received: number;
  currency: string;
  client_secret?: string;
  next_action?: {
    type: "redirect_to_url" | "use_stripe_sdk";
    redirect_to_url?: {
      url: string;
      return_url?: string;
    };
  };
  latest_charge?: string; // ch_test_...
  charges?: {
    data: Array<{
      id: string;
      paid: boolean;
      refunded: boolean;
      amount_refunded: number;
      payment_method_details?: {
        card?: {
          brand: string;
          last4: string;
          exp_month: number;
          exp_year: number;
          funding: string;
          country: string;
          three_d_secure?: {
            authenticated: boolean;
          };
        };
      };
    }>;
  };
  last_payment_error?: {
    code: string;
    decline_code?: string;
    message: string;
    type: string;
  };
  metadata?: Record<string, string>;
}

export interface StripeRefundOptions {
  paymentIntentId: string;
  amount?: number; // In cents; if omitted, full refund
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}

export interface StripeRefundResponse {
  id: string; // re_test_...
  object: "refund";
  amount: number;
  currency: string;
  payment_intent: string;
  status: "pending" | "succeeded" | "failed" | "canceled";
  failure_reason?: string;
  created: number;
  metadata?: Record<string, string>;
}

export interface StripeDisputeEventData {
  id: string; // dp_test_...
  object: "dispute";
  amount: number;
  currency: string;
  charge: string;
  payment_intent?: string;
  reason: string;
  status: "needs_response" | "under_review" | "won" | "lost";
  created: number;
}
