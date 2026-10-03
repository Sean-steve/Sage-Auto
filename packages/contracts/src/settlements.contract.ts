// ============================================================================
// CAR HIRE OS — OWNER SETTLEMENTS CONTRACTS (Sprint 21: DOM-003 §41-45)
// Request and Response DTOs for Settlement Periods, Batches, Calculations,
// Approvals, Disputes, Payables, and Statements
// ============================================================================

import type {
  OwnerSettlement,
  OwnerSettlementPeriod,
  OwnerSettlementBatch,
  OwnerSettlementPayable,
  OwnerSettlementStatementReadModel,
  VehicleProfitabilityMetric,
  OwnerSettlementPeriodType,
  SettlementAdjustmentType,
  SettlementPayoutMethod,
} from "@carhire/types";

export interface CreateSettlementPeriodDto {
  periodType: OwnerSettlementPeriodType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  name?: string;
  description?: string;
}

export interface CalculateSettlementDto {
  ownerId: string;
  periodId?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  periodStart?: string;
  periodEnd?: string;
  notes?: string;
}

export interface GenerateSettlementBatchDto {
  periodId: string;
  idempotencyKey: string;
  ownerIds?: string[];
}

export interface ApproveSettlementDto {
  settlementId?: string;
  notes?: string;
  approvalNotes?: string;
  payoutMethod?: SettlementPayoutMethod;
}

export interface DisputeSettlementDto {
  settlementId?: string;
  reason?: string;
  disputeReason?: string;
}

export interface ResolveDisputeDto {
  settlementId?: string;
  resolutionNotes?: string;
  disputeResolutionNotes?: string;
  approveImmediately?: boolean;
  adjustmentAmount?: string;
  adjustmentType?: SettlementAdjustmentType;
  adjustmentReason?: string;
  adjustments?: Array<{
    type: SettlementAdjustmentType;
    amount: string; // NUMERIC(19,4)
    reason: string;
  }>;
}

export interface AddSettlementAdjustmentDto {
  settlementId?: string;
  type?: SettlementAdjustmentType;
  adjustmentType?: SettlementAdjustmentType;
  amount: string;
  reason: string;
  referenceRentalId?: string;
}

export interface ExecutePayoutDto {
  settlementId?: string;
  payoutReference: string;
  payoutMethod?: SettlementPayoutMethod;
  notes?: string;
  destinationBank?: string;
  destinationAccount?: string;
  destinationMpesaNumber?: string;
  taxWithholdingAmount?: string;
}

export type CreateOwnerSettlementPeriodDto = CreateSettlementPeriodDto;
export type CalculateOwnerSettlementDto = CalculateSettlementDto;
export type ApproveOwnerSettlementDto = ApproveSettlementDto;
export type DisputeOwnerSettlementDto = DisputeSettlementDto;
export type ResolveSettlementDisputeDto = ResolveDisputeDto;
export type ExecuteSettlementPayoutDto = ExecutePayoutDto;

export interface OwnerSettlementListResponse {
  success: boolean;
  data: OwnerSettlement[];
  count: number;
}

export interface OwnerSettlementDetailResponse {
  success: boolean;
  data: OwnerSettlement;
}

export interface OwnerSettlementPeriodResponse {
  success: boolean;
  data: OwnerSettlementPeriod;
}

export interface OwnerSettlementBatchResponse {
  success: boolean;
  data: OwnerSettlementBatch;
  settlements: OwnerSettlement[];
}

export interface OwnerSettlementStatementResponse {
  success: boolean;
  data: OwnerSettlementStatementReadModel;
}

export interface VehicleProfitabilityResponse {
  success: boolean;
  data: VehicleProfitabilityMetric[];
}
