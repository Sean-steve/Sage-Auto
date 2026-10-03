// ============================================================================
// CAR HIRE OS — SPRINT 19: OPERATIONAL FINANCE BOUNDED CONTEXT TYPES
// Canonical Tenant Business Finance, Invoicing, Receivables, Expenses & Liabilities
// ============================================================================

import type { Money } from "./money";

// ----------------------------------------------------------------------------
// 1. INVOICE AGGREGATE & LINE TYPES
// ----------------------------------------------------------------------------

export type OperationalInvoiceStatus =
  | "DRAFT"
  | "ISSUED"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "VOIDED";

export type OperationalInvoiceLineType =
  | "RENTAL_BASE"
  | "RENTAL_EXTENSION"
  | "EXCESS_MILEAGE"
  | "FUEL_DEFICIT"
  | "REFUELING_FEE"
  | "LATE_RETURN"
  | "DAMAGE_CHARGE"
  | "CLEANING_FEE"
  | "TOLL_CHARGE"
  | "TRAFFIC_FINE"
  | "DELIVERY_COLLECTION"
  | "CUSTOM_FEE"
  | "DISCOUNT";

export interface OperationalInvoiceLine {
  id: string;
  invoiceId: string;
  lineType: OperationalInvoiceLineType;
  description: string;
  quantity: number;
  unitPrice: string; // NUMERIC(19,4) string
  netAmount: string; // NUMERIC(19,4) string
  taxRate: string; // NUMERIC(7,4) string e.g. "0.1600"
  taxAmount: string; // NUMERIC(19,4) string
  grossAmount: string; // NUMERIC(19,4) string
  sourceType?: "RENTAL" | "BOOKING" | "MAINTENANCE" | "DAMAGE" | "MANUAL";
  sourceId?: string;
  sortOrder: number;
}

export interface OperationalInvoiceBillingSnapshot {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerTaxId?: string;
  customerAddress?: string;
  corporateAccountName?: string;
  corporateRegistrationNumber?: string;
}

export interface OperationalInvoice {
  id: string;
  tenantId: string;
  invoiceNumber: string; // e.g. INV-2026-000001
  customerId: string;
  corporateAccountId?: string;
  rentalId?: string;
  bookingId?: string;
  currency: string; // ISO 4217 e.g. "KES"
  status: OperationalInvoiceStatus;
  issueDate: string; // ISO Date YYYY-MM-DD
  dueDate: string; // ISO Date YYYY-MM-DD
  subtotal: string; // NUMERIC(19,4) string (net of tax & discount)
  discountTotal: string; // NUMERIC(19,4) string
  taxTotal: string; // NUMERIC(19,4) string
  total: string; // NUMERIC(19,4) string (gross total)
  amountPaid: string; // NUMERIC(19,4) string
  amountCredited: string; // NUMERIC(19,4) string (total from issued credit notes)
  amountOutstanding: string; // NUMERIC(19,4) string (total - amountPaid - amountCredited)
  notes?: string;
  billingSnapshot: OperationalInvoiceBillingSnapshot;
  lineItems: OperationalInvoiceLine[];
  issuedAt?: string;
  paidAt?: string;
  voidedAt?: string;
  voidReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface OperationalInvoiceStatusHistory {
  id: string;
  invoiceId: string;
  tenantId: string;
  fromStatus: OperationalInvoiceStatus;
  toStatus: OperationalInvoiceStatus;
  actorUserId: string;
  reason?: string;
  timestamp: string;
}

// ----------------------------------------------------------------------------
// 2. CREDIT NOTE AGGREGATE TYPES
// ----------------------------------------------------------------------------

export type CreditNoteStatus = "DRAFT" | "ISSUED" | "VOIDED";

export interface CreditNoteLine {
  id: string;
  creditNoteId: string;
  invoiceLineId?: string;
  description: string;
  quantity: number;
  unitPrice: string; // NUMERIC(19,4)
  netAmount: string; // NUMERIC(19,4)
  taxRate: string; // NUMERIC(7,4)
  taxAmount: string; // NUMERIC(19,4)
  grossAmount: string; // NUMERIC(19,4)
}

export interface CreditNote {
  id: string;
  tenantId: string;
  creditNoteNumber: string; // e.g. CRN-2026-000001
  invoiceId: string;
  customerId: string;
  rentalId?: string;
  currency: string;
  status: CreditNoteStatus;
  issueDate: string;
  reason: string;
  subtotal: string;
  taxTotal: string;
  total: string;
  lines: CreditNoteLine[];
  issuedAt?: string;
  voidedAt?: string;
  voidReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// 3. OPERATING EXPENSE AGGREGATE TYPES
// ----------------------------------------------------------------------------

export type ExpenseStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "VOIDED";

export type ExpenseCategoryCode =
  | "MAINTENANCE"
  | "FUEL"
  | "CLEANING"
  | "PARKING"
  | "TOLL"
  | "INSURANCE"
  | "LICENSING"
  | "OFFICE"
  | "DRIVER"
  | "MARKETING"
  | "OTHER";

export interface ExpenseCategory {
  id: string;
  tenantId: string;
  code: ExpenseCategoryCode;
  name: string;
  description?: string;
  isTaxDeductible: boolean;
  requiresVehicleAttribution: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface OperationalExpense {
  id: string;
  tenantId: string;
  expenseNumber: string; // e.g. EXP-2026-000001
  category: ExpenseCategoryCode;
  categoryId?: string;
  vehicleId?: string;
  rentalId?: string;
  maintenanceId?: string; // Reference to maintenance work order if ingested
  vehicleOwnerId?: string; // For Sprint 21 vehicle owner settlement attribution
  supplierId?: string;
  payeeName?: string;
  description: string;
  expenseDate: string; // ISO Date YYYY-MM-DD
  currency: string;
  netAmount: string; // NUMERIC(19,4)
  taxAmount: string; // NUMERIC(19,4)
  grossAmount: string; // NUMERIC(19,4)
  status: ExpenseStatus;
  receiptFileReference?: string;
  notes?: string;
  ownerDeductible?: boolean; // True if chargeable against owner share in Sprint 21
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  voidedAt?: string;
  voidReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// 4. DEPOSIT POSITION & REFUND OBLIGATION TYPES (Liabilities / Source Facts)
// ----------------------------------------------------------------------------

export type DepositPositionStatus =
  | "REQUIRED"
  | "HELD"
  | "APPLIED"
  | "PARTIALLY_REFUNDED"
  | "REFUND_DUE"
  | "REFUNDED"
  | "FORFEITED";

export interface DepositPosition {
  id: string;
  tenantId: string;
  rentalId?: string;
  bookingId?: string;
  customerId: string;
  currency: string;
  requiredAmount: string; // NUMERIC(19,4)
  receivedAmount: string; // NUMERIC(19,4)
  heldAmount: string; // Remaining liability held
  appliedAmount: string; // Amount applied against final rental invoice
  refundDueAmount: string; // Amount calculated due back to customer
  refundedAmount: string; // Amount actually disbursed/refunded
  forfeitedAmount: string; // Amount forfeited due to policy breach
  status: DepositPositionStatus;
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type RefundObligationStatus =
  | "PENDING"
  | "APPROVED"
  | "PROCESSING"
  | "COMPLETED"
  | "CANCELLED";

export interface RefundObligation {
  id: string;
  tenantId: string;
  rentalId?: string;
  invoiceId?: string;
  depositPositionId?: string;
  customerId: string;
  currency: string;
  amount: string; // NUMERIC(19,4)
  reason: string;
  status: RefundObligationStatus;
  approvedBy?: string;
  approvedAt?: string;
  completedAt?: string;
  externalReference?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// 5. FINANCIAL ADJUSTMENT TYPES
// ----------------------------------------------------------------------------

export type FinancialAdjustmentType =
  | "DEBIT_ADJUSTMENT"
  | "WRITE_OFF"
  | "DISPUTE_HOLD";

export interface FinancialAdjustment {
  id: string;
  tenantId: string;
  invoiceId: string;
  type: FinancialAdjustmentType;
  amount: string; // NUMERIC(19,4)
  currency: string;
  reason: string;
  approvedBy: string;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// 6. READ MODELS: RECEIVABLES & CORPORATE BALANCES
// ----------------------------------------------------------------------------

export interface CustomerReceivablesSummary {
  customerId: string;
  tenantId: string;
  currency: string;
  totalInvoiced: string;
  totalPaid: string;
  totalCredited: string;
  totalOutstanding: string;
  totalOverdue: string;
  invoiceCount: number;
  overdueCount: number;
  oldestOverdueDays: number;
}

export interface CorporateReceivablesSummary {
  corporateAccountId: string;
  tenantId: string;
  currency: string;
  corporateName: string;
  totalInvoiced: string;
  totalPaid: string;
  totalCredited: string;
  totalOutstanding: string;
  totalOverdue: string;
  invoiceCount: number;
  overdueCount: number;
  creditLimit?: string;
  creditRemaining?: string;
}

export interface OperationalFinanceSummary {
  tenantId: string;
  currency: string;
  totalInvoiced: string;
  totalCollected: string;
  totalReceivables: string;
  totalOverdue: string;
  totalExpenses: string;
  approvedExpenses: string;
  pendingExpenses: string;
  totalDepositsHeld: string;
  totalRefundsDue: string;
}

// ----------------------------------------------------------------------------
// 7. SPRINT 20 POSTING CONTRACT & SPRINT 21 SETTLEMENT CONTRACTS
// ----------------------------------------------------------------------------

export interface FinancialPostingLine {
  classification:
    | "ACCOUNTS_RECEIVABLE"
    | "RENTAL_REVENUE"
    | "INCIDENTAL_REVENUE"
    | "DAMAGE_RECOVERY_REVENUE"
    | "OUTPUT_VAT"
    | "DEPOSIT_LIABILITY"
    | "REFUND_PAYABLE"
    | "OPERATING_EXPENSE"
    | "CASH_OR_BANK"
    | "OWNER_REVENUE_SHARE_EXPENSE"
    | "OWNER_SETTLEMENT_CLEARING"
    | "EXPENSE_RECOVERY";
  amount: string; // NUMERIC(19,4)
  direction: "DEBIT" | "CREDIT";
  memo?: string;
  vehicleId?: string;
  customerId?: string;
}

export interface FinancialPostingSource {
  sourceType:
    | "OPERATIONAL_INVOICE"
    | "CREDIT_NOTE"
    | "OPERATIONAL_EXPENSE"
    | "DEPOSIT_POSITION"
    | "REFUND_OBLIGATION"
    | "FINANCIAL_ADJUSTMENT"
    | "OWNER_SETTLEMENT"
    | "OWNER_PAYOUT"
    | "PAYMENT_RECORD";
  sourceId: string;
  tenantId: string;
  eventType: string; // e.g. "invoice.issued", "expense.approved"
  eventNumber: string;
  effectiveDate: string;
  currency: string;
  lines: FinancialPostingLine[];
  metadata?: Record<string, unknown>;
  postedToLedger: boolean;
}

export interface SettledRentalRevenueComponent {
  rentalId: string;
  vehicleId: string;
  baseRentalGross: string;
  extensionsGross: string;
  excessMileageGross: string;
  fuelDeficitGross: string;
  damageChargesGross: string;
  totalGross: string;
  totalTax: string;
  currency: string;
  invoiceId: string;
  invoiceNumber: string;
  isPaidOrSettled: boolean;
}

export interface EligibleVehicleExpenseComponent {
  expenseId: string;
  expenseNumber: string;
  vehicleId: string;
  category: ExpenseCategoryCode;
  grossAmount: string;
  currency: string;
  isOwnerDeductible: boolean;
  maintenanceId?: string;
}

// ----------------------------------------------------------------------------
// 8. APPLICATION DTOS
// ----------------------------------------------------------------------------

export interface CreateInvoiceDto {
  customerId: string;
  corporateAccountId?: string;
  rentalId?: string;
  bookingId?: string;
  currency?: string;
  issueDate?: string;
  dueDate: string;
  notes?: string;
  billingSnapshot?: OperationalInvoiceBillingSnapshot;
  lineItems: Array<{
    lineType: OperationalInvoiceLineType;
    description: string;
    quantity: number;
    unitPrice: string | number;
    taxRate?: string | number;
    sourceType?: "RENTAL" | "BOOKING" | "MAINTENANCE" | "DAMAGE" | "MANUAL";
    sourceId?: string;
  }>;
}

export interface GenerateRentalInvoiceDto {
  rentalId: string;
  dueDate?: string;
  notes?: string;
  applyDepositDeduction?: boolean;
}

export interface IssueInvoiceDto {
  notes?: string;
}

export interface VoidInvoiceDto {
  reason: string;
}

export interface CreateCreditNoteDto {
  invoiceId: string;
  reason: string;
  lines: Array<{
    invoiceLineId?: string;
    description: string;
    quantity: number;
    unitPrice: string | number;
    taxRate?: string | number;
  }>;
}

export interface CreateExpenseDto {
  category: ExpenseCategoryCode;
  description: string;
  expenseDate: string;
  netAmount: string | number;
  taxAmount?: string | number;
  currency?: string;
  vehicleId?: string;
  rentalId?: string;
  maintenanceId?: string;
  vehicleOwnerId?: string;
  supplierId?: string;
  payeeName?: string;
  receiptFileReference?: string;
  notes?: string;
  ownerDeductible?: boolean;
}

export interface ApproveExpenseDto {
  notes?: string;
}

export interface RejectExpenseDto {
  reason: string;
}

export interface IngestMaintenanceExpenseDto {
  maintenanceWorkOrderId: string;
  vehicleOwnerId?: string;
  ownerDeductible?: boolean;
}

export interface CreateDepositPositionDto {
  rentalId?: string;
  bookingId?: string;
  customerId: string;
  currency?: string;
  requiredAmount: string | number;
  /**
   * Deprecated as an input authority. Deposit receipt must be represented by a
   * verified Payment allocated to this position, not by creating the liability.
   */
  receivedAmount?: string | number;
  notes?: string;
}

export interface ApplyDepositToInvoiceDto {
  depositPositionId: string;
  invoiceId: string;
  amountToApply: string | number;
}

export interface CreateRefundObligationDto {
  depositPositionId?: string;
  rentalId?: string;
  invoiceId?: string;
  customerId: string;
  amount: string | number;
  currency?: string;
  reason: string;
}

export interface RecordManualPaymentDto {
  invoiceId: string;
  amount: string | number;
  paymentMethod: "MPESA" | "BANK_TRANSFER" | "CASH" | "CARD";
  transactionReference: string;
  paidAt?: string;
  notes?: string;
}
