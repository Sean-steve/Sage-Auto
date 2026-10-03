// ============================================================================
// CAR HIRE OS — MRR MOVEMENT SERVICE (Sprint 35: DOM-003, DEV-004)
// Waterfall MRR accounting engine: NEW, EXPANSION, CONTRACTION, CHURN, REACTIVATION
// ============================================================================

import type { MrrMovementRecord, MrrMovementType } from "@carhire/types";
import { MrrMovementRepository } from "@carhire/database";
import { PlatformMetricsService } from "./platform-metrics.service";

export interface RecordMovementParams {
  tenantId: string;
  tenantName: string;
  subscriptionId: string;
  previousStatus?: string;
  newStatus: string;
  previousAmount?: number;
  newAmount: number;
  previousPlanCode?: string;
  newPlanCode?: string;
  billingInterval?: "MONTHLY" | "ANNUAL";
  currency?: string;
  reason?: string;
  occurredAt?: string;
}

export interface MrrMovementServiceDeps {
  movementRepo?: MrrMovementRepository;
  metricsService?: PlatformMetricsService;
  subRepo?: any;
  planRepo?: any;
}

export interface DirectRecordMovementParams {
  tenantId: string;
  tenantName?: string;
  subscriptionId: string;
  movementType: MrrMovementType | "NEW_SUBSCRIPTION";
  previousPlanId?: string | null;
  newPlanId?: string | null;
  previousPlanCode?: string;
  newPlanCode?: string;
  previousMrr: number;
  newMrr: number;
  mrrDelta?: number;
  currency: string;
  billingInterval?: "MONTHLY" | "ANNUAL";
  reason?: string;
  occurredAt?: string;
}

export class MrrMovementService {
  private movementRepo: MrrMovementRepository;
  private metricsService: PlatformMetricsService;

  constructor(
    depsOrMovementRepo?: MrrMovementServiceDeps | MrrMovementRepository,
    metricsService?: PlatformMetricsService
  ) {
    if (depsOrMovementRepo && typeof (depsOrMovementRepo as any).recordMovement !== "function") {
      const deps = depsOrMovementRepo as MrrMovementServiceDeps;
      this.movementRepo = deps.movementRepo || new MrrMovementRepository();
      this.metricsService = deps.metricsService || new PlatformMetricsService();
    } else {
      this.movementRepo = (depsOrMovementRepo as MrrMovementRepository) || new MrrMovementRepository();
      this.metricsService = metricsService || new PlatformMetricsService();
    }
  }

  /**
   * Records a movement directly with explicit previous and new MRR values.
   */
  async recordMovement(params: DirectRecordMovementParams): Promise<MrrMovementRecord> {
    const rawType = params.movementType === "NEW_SUBSCRIPTION" ? "NEW" : params.movementType;
    const delta = params.mrrDelta !== undefined ? params.mrrDelta : (params.newMrr - params.previousMrr);
    const now = params.occurredAt || new Date().toISOString();

    return this.movementRepo.recordMovement({
      tenantId: params.tenantId,
      tenantName: params.tenantName || params.tenantId,
      subscriptionId: params.subscriptionId,
      movementType: rawType as MrrMovementType,
      previousMrr: Math.round(params.previousMrr * 100) / 100,
      newMrr: Math.round(params.newMrr * 100) / 100,
      mrrDelta: Math.round(delta * 100) / 100,
      currency: params.currency.toUpperCase(),
      previousPlanCode: params.previousPlanCode,
      newPlanCode: params.newPlanCode,
      billingInterval: params.billingInterval || "MONTHLY",
      reason: params.reason,
      occurredAt: now,
    });
  }

  /**
   * Evaluates and records the appropriate MRR movement for a subscription transition.
   */
  async recordSubscriptionTransition(params: RecordMovementParams): Promise<MrrMovementRecord | null> {
    const currency = (params.currency || "KES").toUpperCase();
    const interval = params.billingInterval || "MONTHLY";
    const isAnnual = interval === "ANNUAL";
    const now = params.occurredAt || new Date().toISOString();

    const oldEffective = params.previousAmount !== undefined
      ? (isAnnual ? params.previousAmount / 12 : params.previousAmount)
      : 0;

    const newEffective = isAnnual ? params.newAmount / 12 : params.newAmount;

    let movementType: MrrMovementType | null = null;
    let mrrDelta = 0;

    const oldStatus = params.previousStatus?.toUpperCase();
    const newStatus = params.newStatus.toUpperCase();

    const wasActive = ["ACTIVE", "RENEWAL_DUE", "GRACE_PERIOD"].includes(oldStatus || "");
    const isActive = ["ACTIVE", "RENEWAL_DUE", "GRACE_PERIOD"].includes(newStatus);

    if (!wasActive && isActive) {
      if (oldStatus === "CANCELLED" || oldStatus === "SUSPENDED" || oldStatus === "EXPIRED") {
        movementType = "REACTIVATION";
        mrrDelta = newEffective;
      } else {
        // From TRIAL or Initial Signup
        movementType = "NEW";
        mrrDelta = newEffective;
      }
    } else if (wasActive && !isActive) {
      // Churned / Suspended / Cancelled
      movementType = "CHURN";
      mrrDelta = -oldEffective;
    } else if (wasActive && isActive) {
      // Plan change or price adjustment
      if (newEffective > oldEffective) {
        movementType = "EXPANSION";
        mrrDelta = newEffective - oldEffective;
      } else if (newEffective < oldEffective) {
        movementType = "CONTRACTION";
        mrrDelta = newEffective - oldEffective; // negative value
      } else {
        // No change in revenue
        return null;
      }
    } else {
      // Neither was active nor is active (e.g. TRIAL -> SUSPENDED or TRIAL -> CANCELLED)
      return null;
    }

    const record = await this.movementRepo.recordMovement({
      tenantId: params.tenantId,
      tenantName: params.tenantName,
      subscriptionId: params.subscriptionId,
      movementType,
      previousMrr: Math.round(oldEffective * 100) / 100,
      newMrr: Math.round(newEffective * 100) / 100,
      mrrDelta: Math.round(mrrDelta * 100) / 100,
      currency,
      previousPlanCode: params.previousPlanCode,
      newPlanCode: params.newPlanCode,
      billingInterval: interval,
      reason: params.reason,
      occurredAt: now,
    });

    return record;
  }

  /**
   * Retrieves periodic waterfall summary of movements.
   */
  async getMovementWaterfall(from: string, to: string, currency = "KES") {
    const delta = await this.movementRepo.getNetMrrDeltaForPeriod(from, to, currency);
    const movements = await this.movementRepo.getMovements({ from, to, currency });

    return {
      periodFrom: from,
      periodTo: to,
      currency: currency.toUpperCase(),
      summary: delta,
      movements,
    };
  }
}
