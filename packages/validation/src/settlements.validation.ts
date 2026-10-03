// ============================================================================
// CAR HIRE OS — OWNER SETTLEMENTS VALIDATION SCHEMAS (Sprint 21)
// Zod Schemas for Settlement Periods, Batches, Calculations, Disputes & Payouts
// ============================================================================

import { z } from "zod";

export const CreateSettlementPeriodSchema = z.object({
  periodType: z.enum(["WEEKLY", "BI_WEEKLY", "MONTHLY", "CUSTOM"]).default("MONTHLY"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
  description: z.string().optional(),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date must be on or after start date",
  path: ["endDate"],
});

export const CalculateSettlementSchema = z.object({
  ownerId: z.string().min(1, "Owner ID is required"),
  periodId: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
  notes: z.string().optional(),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date must be on or after start date",
  path: ["endDate"],
});

export const GenerateSettlementBatchSchema = z.object({
  periodId: z.string().min(1, "Period ID is required"),
  idempotencyKey: z.string().min(1, "Idempotency key is required"),
});

export const ApproveSettlementSchema = z.object({
  notes: z.string().optional(),
});

export const DisputeSettlementSchema = z.object({
  reason: z.string().min(5, "Dispute reason must be at least 5 characters"),
});

export const ResolveDisputeSchema = z.object({
  resolutionNotes: z.string().min(5, "Resolution notes are required"),
  adjustments: z.array(z.object({
    type: z.enum(["CREDIT_ADJUSTMENT", "DEBIT_ADJUSTMENT", "DISPUTE_SETTLEMENT", "CARRYOVER_DEDUCTION", "HOLD"]),
    amount: z.string().min(1, "Adjustment amount is required"),
    reason: z.string().min(3, "Adjustment reason is required"),
  })).optional(),
});

export const AddSettlementAdjustmentSchema = z.object({
  type: z.enum(["CREDIT_ADJUSTMENT", "DEBIT_ADJUSTMENT", "DISPUTE_SETTLEMENT", "CARRYOVER_DEDUCTION", "HOLD"]),
  amount: z.string().min(1, "Adjustment amount is required"),
  reason: z.string().min(3, "Adjustment reason is required"),
});

export const ExecutePayoutSchema = z.object({
  payoutReference: z.string().min(3, "Payout reference is required"),
  payoutMethod: z.enum(["BANK_TRANSFER", "MPESA_PAYBILL", "MPESA_B2C", "MANUAL_CHECK", "INTERNAL_TRANSFER"]).default("BANK_TRANSFER"),
  destinationBank: z.string().optional(),
  destinationAccount: z.string().optional(),
  destinationMpesaNumber: z.string().optional(),
  taxWithholdingAmount: z.string().optional(),
});
