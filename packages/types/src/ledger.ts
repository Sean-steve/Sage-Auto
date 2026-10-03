// ============================================================================
// CAR HIRE OS — SPRINT 20: DOUBLE-ENTRY GENERAL LEDGER BOUNDED CONTEXT TYPES
// Canonical Multi-Tenant Chart of Accounts, Balanced Journals, Posting & Audit Read Models
// ============================================================================

// ----------------------------------------------------------------------------
// 1. ACCOUNT CLASSIFICATIONS & ENUMS
// ----------------------------------------------------------------------------

export type LedgerAccountClassification =
  | "ASSET"
  | "LIABILITY"
  | "EQUITY"
  | "REVENUE"
  | "EXPENSE";

export type LedgerAccountSubType =
  | "CURRENT_ASSET"
  | "FIXED_ASSET"
  | "RESTRICTED_CASH"
  | "CURRENT_LIABILITY"
  | "LONG_TERM_LIABILITY"
  | "EQUITY"
  | "OPERATING_REVENUE"
  | "OTHER_REVENUE"
  | "OPERATING_EXPENSE"
  | "FINANCIAL_EXPENSE";

export type LedgerNormalBalance = "DEBIT" | "CREDIT";

export type LedgerAccountStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";

// ----------------------------------------------------------------------------
// 2. LEDGER ACCOUNT AGGREGATE
// ----------------------------------------------------------------------------

export interface LedgerAccount {
  id: string;
  tenantId: string;
  accountCode: string; // e.g. "1100", "4010"
  name: string; // e.g. "Accounts Receivable"
  classification: LedgerAccountClassification;
  subType: LedgerAccountSubType;
  normalBalance: LedgerNormalBalance;
  currency: string; // ISO 4217 e.g. "KES", "USD"
  isSystemAccount: boolean;
  status: LedgerAccountStatus;
  currentBalance: string; // NUMERIC(19,4) string: positive if adhering to normal balance
  debitBalance: string; // Cumulative total debits NUMERIC(19,4)
  creditBalance: string; // Cumulative total credits NUMERIC(19,4)
  description?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// 3. JOURNAL TRANSACTION & ENTRY LINE AGGREGATES
// ----------------------------------------------------------------------------

export type JournalTransactionStatus = "DRAFT" | "POSTED" | "REVERSED";

export type JournalSourceType =
  | "OPERATIONAL_INVOICE"
  | "CREDIT_NOTE"
  | "OPERATIONAL_EXPENSE"
  | "DEPOSIT_POSITION"
  | "REFUND_OBLIGATION"
  | "PAYMENT_RECORD"
  | "OWNER_SETTLEMENT"
  | "OWNER_PAYOUT"
  | "MANUAL_ADJUSTMENT"
  | "SYSTEM_REVERSAL"
  | "YEAR_END_CLOSING";

export interface JournalEntry {
  id: string;
  transactionId: string;
  tenantId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  direction: "DEBIT" | "CREDIT";
  amount: string; // NUMERIC(19,4) positive scaled decimal string
  memo?: string;
  vehicleId?: string;
  customerId?: string;
  corporateAccountId?: string;
  rentalId?: string;
  bookingId?: string;
  vehicleOwnerId?: string;
  sortOrder: number;
  createdAt: string;
}

export interface JournalTransaction {
  id: string;
  tenantId: string;
  transactionNumber: string; // e.g. "JRN-2026-000001"
  status: JournalTransactionStatus;
  transactionDate: string; // ISO Date YYYY-MM-DD
  postedAt?: string;
  sourceType: JournalSourceType;
  sourceId?: string;
  sourceNumber?: string;
  eventType?: string;
  currency: string;
  totalDebit: string; // NUMERIC(19,4) string
  totalCredit: string; // NUMERIC(19,4) string
  description: string;
  reversalOfJournalId?: string;
  reversedByJournalId?: string;
  idempotencyKey?: string;
  postedByUserId: string;
  entries: JournalEntry[];
  metadata?: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// 4. TRIAL BALANCE & GENERAL LEDGER READ MODELS
// ----------------------------------------------------------------------------

export interface TrialBalanceAccountRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  classification: LedgerAccountClassification;
  normalBalance: LedgerNormalBalance;
  debitTotal: string; // NUMERIC(19,4)
  creditTotal: string; // NUMERIC(19,4)
  netDebit: string; // NUMERIC(19,4) debit column value
  netCredit: string; // NUMERIC(19,4) credit column value
  netBalance: string; // NUMERIC(19,4)
}

export interface TrialBalanceReport {
  tenantId: string;
  asOfDate: string;
  currency: string;
  accounts: TrialBalanceAccountRow[];
  totalDebits: string; // NUMERIC(19,4)
  totalCredits: string; // NUMERIC(19,4)
  imbalanceAmount: string; // NUMERIC(19,4)
  isBalanced: boolean;
}

export interface GeneralLedgerLine {
  entryId: string;
  transactionId: string;
  transactionNumber: string;
  transactionDate: string;
  sourceType: JournalSourceType;
  sourceNumber?: string;
  memo?: string;
  direction: "DEBIT" | "CREDIT";
  debit: string;
  credit: string;
  runningBalance: string;
  vehicleId?: string;
  customerId?: string;
  rentalId?: string;
}

export interface GeneralLedgerAccountStatement {
  tenantId: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  classification: LedgerAccountClassification;
  normalBalance: LedgerNormalBalance;
  currency: string;
  periodFrom?: string;
  periodTo?: string;
  openingBalance: string;
  totalDebits: string;
  totalCredits: string;
  closingBalance: string;
  lines: GeneralLedgerLine[];
}

// ----------------------------------------------------------------------------
// 5. APPLICATION DTOS & FILTERS
// ----------------------------------------------------------------------------

export interface CreateLedgerAccountDto {
  accountCode: string;
  name: string;
  classification: LedgerAccountClassification;
  subType: LedgerAccountSubType;
  normalBalance?: LedgerNormalBalance;
  currency?: string;
  description?: string;
}

export interface UpdateLedgerAccountDto {
  name?: string;
  description?: string;
  status?: LedgerAccountStatus;
}

export interface PostJournalEntryInput {
  accountId?: string;
  accountCode?: string;
  direction: "DEBIT" | "CREDIT";
  amount: string | number;
  memo?: string;
  vehicleId?: string;
  customerId?: string;
  corporateAccountId?: string;
  rentalId?: string;
  bookingId?: string;
  vehicleOwnerId?: string;
}

export interface PostManualJournalDto {
  transactionDate?: string;
  currency?: string;
  description: string;
  idempotencyKey?: string;
  entries: PostJournalEntryInput[];
  metadata?: Record<string, unknown>;
}

export interface ReverseJournalDto {
  reason: string;
  reversalDate?: string;
}

export interface ListLedgerAccountsFilter {
  classification?: LedgerAccountClassification;
  status?: LedgerAccountStatus;
  search?: string;
}

export interface ListJournalsFilter {
  sourceType?: JournalSourceType;
  status?: JournalTransactionStatus;
  startDate?: string;
  endDate?: string;
  accountId?: string;
  vehicleId?: string;
  customerId?: string;
  search?: string;
}

export interface TrialBalanceQueryDto {
  asOfDate?: string;
}

export interface GeneralLedgerQueryDto {
  accountId: string;
  startDate?: string;
  endDate?: string;
  vehicleId?: string;
  customerId?: string;
}
