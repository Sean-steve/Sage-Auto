// ============================================================================
// CAR HIRE OS — OWNER SETTLEMENTS BOUNDED CONTEXT TYPES (Sprint 21: DOM-003 §41-45)
// Owner Settlement Periods, Calculation Batches, Statements, Line Items,
// Revenue Sharing, Deductions, Disputes, Payables & Vehicle Profitability
// ============================================================================

import type { Money } from "./money";

export type OwnerSettlementPeriodType = "WEEKLY" | "BI_WEEKLY" | "MONTHLY" | "CUSTOM";
export type OwnerSettlementPeriodStatus = "OPEN" | "SETTLING" | "CLOSED" | "LOCKED";
export type OwnerSettlementBatchStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type OwnerSettlementStatus =
  | "PENDING"
  | "CALCULATED"
  | "APPROVED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "DISPUTED";

export type SettlementStatus = OwnerSettlementStatus;
export type OwnerSettlementStatement = OwnerSettlement;

export interface SettlementItem {
  id: string;
  rentalId: string;
  vehicleId: string;
  rentalNumber: string;
  grossRentalRevenue: number;
  ownerRevenueSharePercent: number;
  ownerRevenueGross: number;
  deductedExpenses: number;
  netPayableToOwner: number;
}

export type SettlementExpenseAllocationType = "OWNER_BORNE" | "OPERATOR_BORNE" | "SHARED";
export type SettlementAdjustmentType =
  | "CREDIT_ADJUSTMENT"
  | "DEBIT_ADJUSTMENT"
  | "DISPUTE_SETTLEMENT"
  | "CARRYOVER_DEDUCTION"
  | "HOLD";

export type SettlementPayoutMethod =
  | "BANK_TRANSFER"
  | "MPESA_PAYBILL"
  | "MPESA_B2C"
  | "MANUAL_CHECK"
  | "INTERNAL_TRANSFER";

export type SettlementPayableStatus =
  | "PENDING"
  | "QUEUED"
  | "PROCESSING"
  | "PAID"
  | "FAILED"
  | "CANCELLED";

export interface OwnerSettlementPeriod {
  id: string;
  tenantId: string;
  periodNumber: string;
  periodType: OwnerSettlementPeriodType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: OwnerSettlementPeriodStatus;
  description?: string;
  settlementCount: number;
  totalGrossRevenue: string; // NUMERIC(19,4)
  totalOwnerPayout: string; // NUMERIC(19,4)
  totalOperatorRevenue: string; // NUMERIC(19,4)
  totalDeductions: string; // NUMERIC(19,4)
  closedAt?: string;
  closedBy?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerSettlementBatch {
  id: string;
  tenantId: string;
  batchNumber: string;
  periodId: string;
  status: OwnerSettlementBatchStatus;
  idempotencyKey: string;
  totalSettlements: number;
  totalEligibleRevenue: string;
  totalOwnerShare: string;
  totalOperatorShare: string;
  totalDeductions: string;
  totalNetPayout: string;
  currency: string;
  initiatedBy: string;
  completedAt?: string;
  errorMessage?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerSettlementTermsSnapshot {
  ownershipId: string;
  vehicleId?: string;
  ownershipType: string; // 'THIRD_PARTY_OWNED', 'MANAGED', 'LEASED', 'COMPANY_OWNED'
  revenueSharePercent: number; // e.g. 75.0000
  fixedMonthlyPayout?: string;
  allowableExpenseDeductions: boolean;
  termsVersion?: number;
  termsSnapshot?: string;
  agreementStartDate: string;
  agreementEndDate?: string;
}

export interface OwnerSettlementRentalLine {
  id: string;
  settlementId: string;
  rentalId: string;
  contractId?: string;
  bookingId?: string;
  vehicleId: string;
  vehiclePlate: string;
  rentalNumber: string;
  rentalStartDate: string;
  rentalEndDate: string;
  eligibleDays: number;
  /** Authoritative Finance source supporting this settlement line. */
  invoiceId?: string;
  invoiceNumber?: string;
  financeSourceSettled?: boolean;
  baseRentalRevenue: string; // NUMERIC(19,4)
  excessMileageRevenue: string; // NUMERIC(19,4)
  totalRentalRevenue: string; // NUMERIC(19,4)
  nonShareableRevenue: string; // NUMERIC(19,4) excluded (fines, damages, fuel deficit)
  ownershipId: string;
  revenueSharePercent: number; // from historical terms active during rental
  ownerShareAmount: string; // NUMERIC(19,4)
  operatorShareAmount: string; // NUMERIC(19,4)
  sortOrder?: number;
}

export interface OwnerSettlementExpenseLine {
  id: string;
  settlementId: string;
  expenseId: string;
  maintenanceId?: string;
  vehicleId: string;
  vehiclePlate: string;
  category: string;
  description: string;
  expenseDate: string;
  grossAmount: string; // NUMERIC(19,4)
  allocationType: SettlementExpenseAllocationType;
  ownerSharePercent: number; // 100 for OWNER_BORNE, 0 for OPERATOR_BORNE, or custom/split
  ownerDeductionAmount: string; // NUMERIC(19,4)
  operatorBorneAmount: string; // NUMERIC(19,4)
  sortOrder?: number;
}

export interface OwnerSettlementAdjustmentLine {
  id: string;
  settlementId: string;
  type: SettlementAdjustmentType;
  amount: string; // NUMERIC(19,4)
  currency: string;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface OwnerSettlementPayable {
  id: string;
  tenantId: string;
  settlementId: string;
  ownerId: string;
  payableNumber: string;
  currency: string;
  amount: string;
  recipientName: string;
  payoutMethod: SettlementPayoutMethod;
  destinationBank?: string;
  destinationAccount?: string;
  destinationMpesaNumber?: string;
  taxWithholdingAmount: string;
  netDisbursementAmount: string;
  status: SettlementPayableStatus;
  externalPayoutReference?: string;
  failureReason?: string;
  retryCount: number;
  payoutInitiatedAt?: string;
  payoutCompletedAt?: string;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerSettlement {
  id: string;
  tenantId: string;
  settlementNumber: string;
  ownerId: string;
  ownerName?: string;
  periodId?: string;
  batchId?: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  currency: string;
  status: OwnerSettlementStatus;

  // Financial Standard: NUMERIC(19,4) strings & prototype compatibility
  totalEligibleRentalRevenue?: string;
  totalExcludedRevenue?: string;
  grossRevenue?: string;
  ownerGrossRevenueShare?: string;
  operatorGrossRevenueShare?: string;
  totalOwnerBorneExpenses?: string;
  totalSharedExpenses?: string;
  totalDeductions: string | number;
  totalAdjustments?: string;
  netPayoutAmount: string | number;
  operatorNetRevenue?: string;
  carriedForwardBalance?: string;

  // Frozen historical terms used by the calculation. termsSnapshot remains
  // the compatibility/primary view; termsSnapshots preserves every distinct
  // ownership agreement represented by source lines.
  termsSnapshot?: OwnerSettlementTermsSnapshot;
  termsSnapshots?: OwnerSettlementTermsSnapshot[];

  // Lifecycle & Audit
  calculatedAt: string;
  calculatedBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  disputedAt?: string;
  disputedBy?: string;
  disputeReason?: string;
  disputeResolvedAt?: string;
  disputeResolutionNotes?: string;
  paymentPendingAt?: string;
  paidAt?: string;
  payoutReference?: string;
  payoutMethod?: string;
  notes?: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;

  // Nested lines (loaded on detail query)
  rentalLines?: OwnerSettlementRentalLine[];
  expenseLines?: OwnerSettlementExpenseLine[];
  adjustmentLines?: OwnerSettlementAdjustmentLine[];
  payable?: OwnerSettlementPayable;

  // Prototype compatibility properties
  items?: Array<{
    id: string;
    rentalId: string;
    vehicleId: string;
    rentalNumber: string;
    grossRentalRevenue: number;
    ownerRevenueSharePercent: number;
    ownerRevenueGross: number;
    deductedExpenses: number;
    netPayableToOwner: number;
  }>;
  totalGrossRevenue?: number;
  totalOwnerShare?: number;
}

// ----------------------------------------------------------------------------
// READ MODELS
// ----------------------------------------------------------------------------

export interface OwnerSettlementStatementReadModel {
  settlementNumber: string;
  statementDate: string;
  period: {
    startDate: string;
    endDate: string;
  };
  owner: {
    id: string;
    name: string;
    companyName?: string;
    email: string;
    phone: string;
    taxPin?: string;
    payoutBank?: string;
    payoutAccountNumber?: string;
    payoutMpesaNumber?: string;
  };
  commercialTerms: OwnerSettlementTermsSnapshot;
  commercialTermsHistory?: OwnerSettlementTermsSnapshot[];
  currency: string;
  financialSummary: {
    totalEligibleRentalRevenue: string;
    totalExcludedRevenue: string;
    grossRevenue: string;
    ownerGrossShare: string;
    operatorGrossShare: string;
    totalDeductions: string;
    totalAdjustments: string;
    netPayoutAmount: string;
  };
  rentalBreakdown: OwnerSettlementRentalLine[];
  expenseDeductions: OwnerSettlementExpenseLine[];
  adjustments: OwnerSettlementAdjustmentLine[];
  vehicleBreakdown?: Array<{
    vehicleId: string;
    registrationPlate: string;
    eligibleRevenue: string;
    ownerGrossShare: string;
    deductions: string;
    netContribution: string;
  }>;
  paymentStatus: {
    status: OwnerSettlementStatus;
    approvedAt?: string;
    paidAt?: string;
    payoutReference?: string;
    payoutMethod?: string;
  };
}

export interface VehicleProfitabilityMetric {
  vehicleId: string;
  registrationPlate: string;
  makeModel: string;
  ownerId: string;
  ownerName: string;
  periodStart: string;
  periodEnd: string;
  rentalDays: number;
  totalRentalRevenue: string; // NUMERIC(19,4)
  ownerPayoutAmount: string; // NUMERIC(19,4)
  maintenanceExpenses: string; // NUMERIC(19,4)
  fuelAndOtherExpenses: string; // NUMERIC(19,4)
  operatorGrossMargin: string; // totalRentalRevenue - ownerPayoutAmount
  operatorNetProfit: string; // operatorGrossMargin - operatorBorneExpenses
  utilizationRatePercent: number; // (rentalDays / totalDaysInPeriod) * 100
}

export interface ListOwnerSettlementsFilter {
  ownerId?: string;
  periodId?: string;
  batchId?: string;
  status?: OwnerSettlementStatus;
  fromDate?: string;
  toDate?: string;
}

export interface ListOwnerSettlementPeriodsFilter {
  status?: OwnerSettlementPeriodStatus;
  periodType?: OwnerSettlementPeriodType;
  year?: number;
}

export interface VehicleProfitabilityItem {
  vehicleId: string;
  registrationPlate: string;
  make: string;
  model: string;
  ownershipType: string;
  ownerName: string;
  grossRentalRevenue: string;
  ownerPayouts: string;
  maintenanceExpenses: string;
  otherExpenses: string;
  netProfit: string;
  profitMarginPercent: number;
  rentalDays: number;
  utilizationRate: number;
  currency: string;
}

export interface VehicleProfitabilityReportReadModel {
  periodStart: string;
  periodEnd: string;
  currency: string;
  items: VehicleProfitabilityItem[];
  summary: {
    totalVehicles: number;
    totalGrossRentalRevenue: string;
    totalOwnerPayouts: string;
    totalMaintenanceExpenses: string;
    totalOtherExpenses: string;
    totalNetProfit: string;
    averageProfitMarginPercent: number;
  };
}

export interface VehicleProfitabilityQueryDto {
  startDate: string;
  endDate: string;
  vehicleId?: string;
}

export type SettlementPayable = OwnerSettlementPayable;
export type ListSettlementPayablesFilter = { ownerId?: string; settlementId?: string; status?: string };
