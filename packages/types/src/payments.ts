// ============================================================================
// CAR HIRE OS — SPRINT 22: PAYMENT ABSTRACTION BOUNDED CONTEXT TYPES
// Provider-Independent Payment Engine, Attempts, Verification, Allocations,
// Refunds, Payouts, Reconciliation & Double-Entry Ledger Integration Contracts
// ============================================================================

import type { FinancialPostingSource } from "./finance";

// ----------------------------------------------------------------------------
// 1. PAYMENT ENUMS & DIRECTIONAL CONCEPTS
// ----------------------------------------------------------------------------

export type PaymentDirection = "INBOUND" | "OUTBOUND";

export type PaymentPurpose =
  | "CUSTOMER_INVOICE"
  | "RENTAL_DEPOSIT"
  | "CUSTOMER_REFUND"
  | "OWNER_SETTLEMENT"
  | "EXPENSE_PAYMENT"
  | "SAAS_SUBSCRIPTION";

export type PaymentAttemptStatus =
  | "INITIATED"
  | "PENDING_CALLBACK"
  | "PENDING_REDIRECT"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED";

export type PaymentStatus =
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "PARTIALLY_ALLOCATED"
  | "ALLOCATED"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "VOIDED"
  | "DISPUTED";

export type PaymentAllocationSourceType =
  | "CUSTOMER_INVOICE"
  | "RENTAL_DEPOSIT"
  | "EXPENSE_PAYMENT"
  | "SAAS_SUBSCRIPTION";

export type RefundStatus =
  | "PENDING"
  | "APPROVED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type PaymentProviderName =
  | "FAKE_PROVIDER"
  | "MPESA_DARAJA"
  | "STRIPE_CARD"
  | "MANUAL_RECORD";

export type ProviderCapability =
  | "INBOUND_PAYMENT"
  | "OUTBOUND_PAYMENT"
  | "REFUND"
  | "STATUS_QUERY"
  | "WEBHOOK"
  | "PAYOUT";

export type PaymentVerificationSource =
  | "WEBHOOK"
  | "STATUS_QUERY"
  | "MANUAL_APPROVAL"
  | "MOCK_VERIFIED";

export type ReconciliationIssueType =
  | "UNALLOCATED_PAYMENT"
  | "OLD_PENDING_ATTEMPT"
  | "UNVERIFIED_PAID_INVOICE"
  | "DUPLICATE_PROVIDER_REFERENCE"
  | "PENDING_REFUND_TIMEOUT"
  | "PROVIDER_ORPHAN_TRANSACTION";

export type ReconciliationSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// ----------------------------------------------------------------------------
// 2. PAYMENT ATTEMPT (Initiation, Gateway Request & Callback Tracking)
// ----------------------------------------------------------------------------

export interface PaymentAttempt {
  id: string;
  tenantId?: string; // Nullable only in platform context
  paymentIntentReference: string; // Unique idempotency reference
  provider: PaymentProviderName;
  purpose?: PaymentPurpose;
  direction?: PaymentDirection;
  amount: string | number; // NUMERIC(19,4) string or legacy number
  currency: string; // ISO 4217 (e.g. 'KES')
  status: PaymentAttemptStatus;
  targetId?: string; // ID of invoice, rental, deposit, payable
  customerId?: string;
  providerReference?: string;
  providerRequestReference?: string;
  providerTransactionId?: string;
  checkoutUrl?: string;
  requestedAt: string;
  expiresAt?: string;
  completedAt?: string;
  failureCode?: string;
  failureReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  version: number;
  // Legacy prototype compatibility
  paymentId?: string;
  obligationId?: string;
  rawPayloadSnapshot?: string;
  timestamp?: string;
}

// ----------------------------------------------------------------------------
// 3. PAYMENT (Authoritative Verified Financial Fact)
// ----------------------------------------------------------------------------

export interface PaymentSourceContext {
  customerId?: string;
  invoiceId?: string;
  rentalId?: string;
  bookingId?: string;
  payableId?: string;
  billRefNumber?: string;
  notes?: string;
}

export interface Payment {
  id: string;
  tenantId: string;
  paymentNumber: string; // e.g. PMT-2026-000001
  attemptId?: string;
  purpose: PaymentPurpose;
  direction: PaymentDirection;
  amount: string; // NUMERIC(19,4) string
  currency: string;
  allocatedAmount: string; // NUMERIC(19,4) string
  unallocatedAmount: string; // NUMERIC(19,4) string
  refundedAmount: string; // NUMERIC(19,4) string
  provider: PaymentProviderName;
  providerTransactionId: string;
  providerReference?: string;
  status: PaymentStatus;
  paidAt: string;
  verifiedAt: string;
  payerReference?: string; // e.g. phone number, masked card, account
  payeeReference?: string;
  sourceContext?: PaymentSourceContext;
  verificationSource: PaymentVerificationSource;
  rawVerificationData?: Record<string, unknown>;
  postedToLedger: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// ----------------------------------------------------------------------------
// 4. PAYMENT ALLOCATION (Binding Verified Payment to Obligations)
// ----------------------------------------------------------------------------

export interface PaymentAllocation {
  id: string;
  tenantId: string;
  paymentId: string;
  sourceType: PaymentAllocationSourceType;
  sourceId: string;
  amount: string; // NUMERIC(19,4) string
  currency: string;
  notes?: string;
  allocatedAt: string;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// 5. REFUND (Outbound Money Movement Back to Customer / Source)
// ----------------------------------------------------------------------------

export interface Refund {
  id: string;
  tenantId: string;
  refundNumber: string; // e.g. REF-2026-000001
  originalPaymentId: string;
  sourceObligationType: "CUSTOMER_REFUND" | "RENTAL_DEPOSIT" | "CUSTOMER_INVOICE";
  sourceObligationId?: string;
  customerId?: string;
  amount: string; // NUMERIC(19,4) string
  currency: string;
  status: RefundStatus;
  reason: string;
  requestedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  providerRefundReference?: string;
  completedAt?: string;
  failureReason?: string;
  postedToLedger: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// ----------------------------------------------------------------------------
// 6. PAYMENT RECONCILIATION ISSUE
// ----------------------------------------------------------------------------

export interface PaymentReconciliationIssue {
  id: string;
  tenantId: string;
  issueType: ReconciliationIssueType;
  severity: ReconciliationSeverity;
  entityType: "PAYMENT" | "PAYMENT_ATTEMPT" | "REFUND" | "INVOICE";
  entityId: string;
  description: string;
  detectedAt: string;
  resolved: boolean;
  resolvedAt?: string;
  metadata?: Record<string, unknown>;
}

// ----------------------------------------------------------------------------
// 7. PROVIDER ABSTRACTION INTERFACES & CONTRACTS
// ----------------------------------------------------------------------------

export interface InitializePaymentInput {
  attemptId: string;
  tenantId: string;
  intentReference: string;
  purpose: PaymentPurpose;
  direction: PaymentDirection;
  amount: string; // NUMERIC(19,4)
  currency: string;
  customerId?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerName?: string;
  callbackUrl?: string;
  returnUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface InitializePaymentResult {
  providerReference: string;
  providerRequestReference?: string;
  checkoutUrl?: string;
  status: PaymentAttemptStatus;
  rawResponse?: Record<string, unknown>;
}

export interface GetPaymentStatusInput {
  attemptId: string;
  providerReference?: string;
  providerRequestReference?: string;
  intentReference: string;
  tenantId: string;
}

export interface ProviderPaymentStatusResult {
  status: PaymentAttemptStatus;
  providerTransactionId?: string;
  amountPaid?: string;
  currency?: string;
  payerReference?: string;
  paidAt?: string;
  failureCode?: string;
  failureReason?: string;
  rawResponse?: Record<string, unknown>;
}

export interface VerifyPaymentInput {
  tenantId: string;
  attemptId: string;
  intentReference: string;
  providerReference?: string;
}

export interface VerifyPaymentResult {
  verified: boolean;
  providerTransactionId: string;
  amount: string;
  currency: string;
  paidAt: string;
  payerReference?: string;
  verificationSource: PaymentVerificationSource;
  rawPayload?: Record<string, unknown>;
}

export interface RefundPaymentInput {
  tenantId: string;
  originalPaymentId: string;
  providerTransactionId: string;
  refundAmount: string;
  currency: string;
  reason: string;
  idempotencyKey: string;
}

export interface RefundPaymentResult {
  success: boolean;
  providerRefundReference: string;
  status: RefundStatus;
  completedAt?: string;
  failureReason?: string;
  rawResponse?: Record<string, unknown>;
}

export interface ExecutePayoutInput {
  tenantId: string;
  payableId: string;
  recipientName: string;
  recipientAccountOrPhone: string;
  amount: string;
  currency: string;
  payoutMethod: string;
  idempotencyKey: string;
}

export interface ExecutePayoutResult {
  success: boolean;
  providerTransactionId: string;
  providerReference?: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  disbursedAt?: string;
  failureReason?: string;
  rawResponse?: Record<string, unknown>;
}

export interface ParsedWebhookEvent {
  isValid: boolean;
  eventType: string;
  providerEventId: string;
  intentReference?: string;
  providerTransactionId?: string;
  providerReference?: string;
  amount?: string;
  currency?: string;
  status: "SUCCEEDED" | "FAILED" | "PENDING";
  payerReference?: string;
  failureReason?: string;
  occurredAt: string;
  rawPayload: Record<string, unknown>;
}

export interface IPaymentProvider {
  readonly name: PaymentProviderName;
  readonly capabilities: ProviderCapability[];

  initializePayment(input: InitializePaymentInput): Promise<InitializePaymentResult>;
  getPaymentStatus(input: GetPaymentStatusInput): Promise<ProviderPaymentStatusResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  executePayout(input: ExecutePayoutInput): Promise<ExecutePayoutResult>;
  verifyWebhookSignature(headers: Record<string, string | string[] | undefined>, rawBody: string | Buffer): boolean;
  parseWebhookPayload(payload: Record<string, unknown>, headers?: Record<string, unknown>): ParsedWebhookEvent;
}

// ----------------------------------------------------------------------------
// 8. DTOs & ACTOR TYPES
// ----------------------------------------------------------------------------

export interface PaymentActor {
  userId: string;
  tenantId: string;
  role?: string;
  isPlatformAdmin?: boolean;
}

export interface InitiatePaymentAttemptDto {
  purpose: PaymentPurpose;
  direction?: PaymentDirection; // Defaults to INBOUND
  amount: string; // NUMERIC(19,4)
  currency?: string; // Defaults to 'KES'
  provider?: PaymentProviderName; // Defaults to FAKE_PROVIDER or tenant default
  targetId?: string; // invoiceId, rentalId, depositId, etc.
  customerId?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerName?: string;
  callbackUrl?: string;
  returnUrl?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface RecordGovernedManualPaymentDto {
  purpose: PaymentPurpose;
  amount: string; // NUMERIC(19,4)
  currency: string;
  targetId?: string; // invoiceId, depositPositionId, etc.
  customerId?: string;
  payerReference: string; // e.g. "Cash Receipt #8821" or "Bank Ref FT202611"
  providerTransactionId: string;
  paidAt?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface AllocatePaymentDto {
  paymentId: string;
  sourceType: PaymentAllocationSourceType;
  sourceId: string; // invoiceId, depositPositionId, etc.
  amount: string; // NUMERIC(19,4)
  notes?: string;
}

export interface RequestRefundDto {
  paymentId: string;
  amount: string; // NUMERIC(19,4)
  reason: string;
  sourceObligationType?: "CUSTOMER_REFUND" | "RENTAL_DEPOSIT" | "CUSTOMER_INVOICE";
  sourceObligationId?: string;
  idempotencyKey?: string;
}

export interface ExecuteOwnerPayoutDto {
  settlementPayableId: string;
  provider?: PaymentProviderName;
  idempotencyKey?: string;
  notes?: string;
}

export interface ListPaymentsFilter {
  customerId?: string;
  purpose?: PaymentPurpose;
  status?: PaymentStatus;
  direction?: PaymentDirection;
  provider?: PaymentProviderName;
  fromDate?: string;
  toDate?: string;
}

export interface ListPaymentAttemptsFilter {
  purpose?: PaymentPurpose;
  status?: PaymentAttemptStatus;
  customerId?: string;
  provider?: PaymentProviderName;
}

export interface ListRefundsFilter {
  originalPaymentId?: string;
  customerId?: string;
  status?: RefundStatus;
}
