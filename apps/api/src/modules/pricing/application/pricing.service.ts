// ============================================================================
// CAR HIRE OS — PRICING APPLICATION SERVICE (DEV-006, DEV-007, BRS-001)
// Orchestrates Rate Plans, Effective Resolution, Quotes, Promos, and Audit Tracing
// ============================================================================

import type {
  RatePlan,
  RatePlanRate,
  RatePlanAssignment,
  SeasonalRateRule,
  DurationTierRule,
  PricingFeeRule,
  PromoCode,
  PromoCodeStatus,
  PricingRequest,
  PricingResult,
  CreateRatePlanDto,
  UpdateRatePlanDto,
  SetRatePlanRatesDto,
  CreateSeasonalRateDto,
  CreateDurationTierDto,
  CreatePricingFeeDto,
  CreatePromoCodeDto,
  AssignRatePlanDto,
} from "@carhire/types";
import {
  VehicleRepository,
  RatePlanRepository,
  PromoCodeRepository,
  PricingRuleRepository,
  TenantSettingsRepository,
  CorporateAccountRepository,
  VehicleCategoryRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";
import { RateCalculator } from "../domain/rate-calculator";

export class PricingService {
  private readonly ratePlanRepo: RatePlanRepository;
  private readonly promoRepo: PromoCodeRepository;
  private readonly ruleRepo: PricingRuleRepository;
  private readonly tenantSettingsRepo: TenantSettingsRepository;
  private readonly corporateAccountRepo: CorporateAccountRepository;
  private readonly vehicleCategoryRepo: VehicleCategoryRepository;
  private readonly auditRepo: AuditRepository;
  private readonly outboxRepo: OutboxRepository;

  constructor(
    ratePlanRepo?: RatePlanRepository,
    promoRepo?: PromoCodeRepository,
    ruleRepo?: PricingRuleRepository,
    tenantSettingsRepo?: TenantSettingsRepository,
    corporateAccountRepo?: CorporateAccountRepository,
    vehicleCategoryRepo?: VehicleCategoryRepository,
    auditRepo?: AuditRepository,
    outboxRepo?: OutboxRepository
  ) {
    this.ratePlanRepo = ratePlanRepo ?? new RatePlanRepository();
    this.promoRepo = promoRepo ?? new PromoCodeRepository();
    this.ruleRepo = ruleRepo ?? new PricingRuleRepository();
    this.tenantSettingsRepo = tenantSettingsRepo ?? new TenantSettingsRepository();
    this.corporateAccountRepo = corporateAccountRepo ?? new CorporateAccountRepository();
    this.vehicleCategoryRepo = vehicleCategoryRepo ?? new VehicleCategoryRepository();
    this.auditRepo = auditRepo ?? new AuditRepository();
    this.outboxRepo = outboxRepo ?? new OutboxRepository();
  }

  // --------------------------------------------------------------------------
  // Rate Plans CRUD
  // --------------------------------------------------------------------------

  async createRatePlan(
    tenantId: string,
    data: CreateRatePlanDto,
    actorUserId: string = "system"
  ): Promise<RatePlan> {
    const plan = await this.ratePlanRepo.createRatePlan(tenantId, data);

    await this.auditRepo.record({
      tenantId,
      actorType: actorUserId === "system" ? "SYSTEM" : "USER",
      actorId: actorUserId,
      action: "pricing.rate_plan.created",
      resourceType: "RatePlan",
      resourceId: plan.id,
      metadata: { code: plan.code, name: plan.name, currency: plan.currency },
    });

    await this.outboxRepo.publish({
      tenantId,
      eventType: "pricing.rate_plan.created",
      aggregateType: "RatePlan",
      aggregateId: plan.id,
      payload: { ratePlanId: plan.id, code: plan.code, status: plan.status },
    });

    return plan;
  }

  async getRatePlanById(tenantId: string, id: string): Promise<RatePlan | null> {
    return this.ratePlanRepo.findById(id, tenantId);
  }

  async listRatePlans(tenantId: string): Promise<RatePlan[]> {
    return this.ratePlanRepo.findAll(tenantId);
  }

  async updateRatePlan(
    tenantId: string,
    id: string,
    data: UpdateRatePlanDto,
    expectedVersion?: number,
    actorUserId: string = "system"
  ): Promise<RatePlan> {
    const plan = await this.ratePlanRepo.updateRatePlan(
      id,
      tenantId,
      data,
      expectedVersion
    );

    await this.auditRepo.record({
      tenantId,
      actorType: actorUserId === "system" ? "SYSTEM" : "USER",
      actorId: actorUserId,
      action: "pricing.rate_plan.updated",
      resourceType: "RatePlan",
      resourceId: plan.id,
      metadata: { version: plan.version, changes: data as Record<string, unknown> },
    });

    return plan;
  }

  async activateRatePlan(
    tenantId: string,
    id: string,
    actorUserId: string = "system"
  ): Promise<RatePlan> {
    const plan = await this.ratePlanRepo.activateRatePlan(id, tenantId);

    await this.auditRepo.record({
      tenantId,
      actorType: actorUserId === "system" ? "SYSTEM" : "USER",
      actorId: actorUserId,
      action: "pricing.rate_plan.activated",
      resourceType: "RatePlan",
      resourceId: plan.id,
      metadata: { status: plan.status, version: plan.version },
    });

    return plan;
  }

  async publishRatePlan(
    tenantId: string,
    id: string,
    actorUserId: string = "system"
  ): Promise<RatePlan> {
    return this.activateRatePlan(tenantId, id, actorUserId);
  }

  async archiveRatePlan(
    tenantId: string,
    id: string,
    actorUserId: string = "system"
  ): Promise<RatePlan> {
    const plan = await this.ratePlanRepo.archiveRatePlan(id, tenantId);

    await this.auditRepo.record({
      tenantId,
      actorType: actorUserId === "system" ? "SYSTEM" : "USER",
      actorId: actorUserId,
      action: "pricing.rate_plan.archived",
      resourceType: "RatePlan",
      resourceId: plan.id,
      metadata: { status: plan.status },
    });

    return plan;
  }

  async setRates(
    tenantId: string,
    ratePlanId: string,
    rates: SetRatePlanRatesDto[],
    actorUserId: string = "system"
  ): Promise<RatePlanRate[]> {
    const updatedRates = await this.ratePlanRepo.setRates(ratePlanId, tenantId, rates);

    await this.auditRepo.record({
      tenantId,
      actorType: actorUserId === "system" ? "SYSTEM" : "USER",
      actorId: actorUserId,
      action: "pricing.rates.updated",
      resourceType: "RatePlan",
      resourceId: ratePlanId,
      metadata: { count: rates.length },
    });

    return updatedRates;
  }

  async setRatePlanRate(
    tenantId: string,
    ratePlanId: string,
    rate: SetRatePlanRatesDto,
    actorUserId: string = "system"
  ): Promise<RatePlanRate> {
    const updatedRates = await this.setRates(tenantId, ratePlanId, [rate], actorUserId);
    return updatedRates[0];
  }

  async getRates(tenantId: string, ratePlanId: string): Promise<RatePlanRate[]> {
    return this.ratePlanRepo.getRatesForPlan(ratePlanId, tenantId);
  }

  async assignPlan(
    tenantId: string,
    ratePlanId: string,
    data: AssignRatePlanDto,
    actorUserId: string = "system"
  ): Promise<RatePlanAssignment> {
    const assignment = await this.ratePlanRepo.assignPlan(tenantId, ratePlanId, data);

    await this.auditRepo.record({
      tenantId,
      actorType: actorUserId === "system" ? "SYSTEM" : "USER",
      actorId: actorUserId,
      action: "pricing.plan.assigned",
      resourceType: "RatePlanAssignment",
      resourceId: assignment.id,
      metadata: { ratePlanId, targetType: data.targetType, targetId: data.targetId },
    });

    return assignment;
  }

  async getAssignments(tenantId: string, ratePlanId: string): Promise<RatePlanAssignment[]> {
    return this.ratePlanRepo.getAssignmentsForPlan(ratePlanId, tenantId);
  }

  // --------------------------------------------------------------------------
  // Seasonal Rules & Duration Tiers & Ancillary Fees
  // --------------------------------------------------------------------------

  async createSeasonalRule(
    tenantId: string,
    ratePlanId: string,
    data: CreateSeasonalRateDto,
    actorUserId: string = "system"
  ): Promise<SeasonalRateRule> {
    const rule = await this.ruleRepo.createSeasonalRule(tenantId, ratePlanId, data);
    await this.auditRepo.record({
      tenantId,
      actorType: actorUserId === "system" ? "SYSTEM" : "USER",
      actorId: actorUserId,
      action: "pricing.seasonal_rule.created",
      resourceType: "SeasonalRateRule",
      resourceId: rule.id,
      metadata: { ratePlanId, multiplier: data.multiplier, name: data.name },
    });
    return rule;
  }

  async listSeasonalRules(tenantId: string, ratePlanId?: string): Promise<SeasonalRateRule[]> {
    return this.ruleRepo.listSeasonalRules(tenantId, ratePlanId);
  }

  async deleteSeasonalRule(
    tenantId: string,
    id: string,
    actorUserId: string = "system"
  ): Promise<void> {
    await this.ruleRepo.deleteSeasonalRule(id, tenantId);
    await this.auditRepo.record({
      tenantId,
      actorType: actorUserId === "system" ? "SYSTEM" : "USER",
      actorId: actorUserId,
      action: "pricing.seasonal_rule.deleted",
      resourceType: "SeasonalRateRule",
      resourceId: id,
    });
  }

  async createDurationTier(
    tenantId: string,
    ratePlanId: string,
    data: CreateDurationTierDto
  ): Promise<DurationTierRule> {
    return this.ruleRepo.createDurationTier(tenantId, ratePlanId, data);
  }

  async listDurationTiers(tenantId: string, ratePlanId: string): Promise<DurationTierRule[]> {
    return this.ruleRepo.listDurationTiers(tenantId, ratePlanId);
  }

  async deleteDurationTier(
    tenantId: string,
    id: string,
    actorUserId: string = "system"
  ): Promise<void> {
    await this.ruleRepo.deleteDurationTier(id, tenantId);
    await this.auditRepo.record({
      tenantId,
      actorType: actorUserId === "system" ? "SYSTEM" : "USER",
      actorId: actorUserId,
      action: "pricing.duration_tier.deleted",
      resourceType: "DurationTierRule",
      resourceId: id,
    });
  }

  async createFeeRule(
    tenantId: string,
    data: CreatePricingFeeDto,
    actorUserId: string = "system"
  ): Promise<PricingFeeRule> {
    const fee = await this.ruleRepo.createFeeRule(tenantId, data);
    await this.auditRepo.record({
      tenantId,
      actorType: actorUserId === "system" ? "SYSTEM" : "USER",
      actorId: actorUserId,
      action: "pricing.fee_rule.created",
      resourceType: "PricingFeeRule",
      resourceId: fee.id,
      metadata: { code: fee.code, amount: fee.amount },
    });
    return fee;
  }

  async listFeeRules(tenantId: string, ratePlanId?: string | null): Promise<PricingFeeRule[]> {
    return this.ruleRepo.listFeeRules(tenantId, ratePlanId);
  }

  async deleteFeeRule(
    tenantId: string,
    id: string,
    actorUserId: string = "system"
  ): Promise<void> {
    await this.ruleRepo.deleteFeeRule(id, tenantId);
    await this.auditRepo.record({
      tenantId,
      actorType: actorUserId === "system" ? "SYSTEM" : "USER",
      actorId: actorUserId,
      action: "pricing.fee_rule.deleted",
      resourceType: "PricingFeeRule",
      resourceId: id,
    });
  }

  // --------------------------------------------------------------------------
  // Promo Codes
  // --------------------------------------------------------------------------

  async createPromoCode(
    tenantId: string,
    data: CreatePromoCodeDto,
    actorUserId: string = "system"
  ): Promise<PromoCode> {
    const promo = await this.promoRepo.create(tenantId, data);
    await this.auditRepo.record({
      tenantId,
      actorType: actorUserId === "system" ? "SYSTEM" : "USER",
      actorId: actorUserId,
      action: "pricing.promo_code.created",
      resourceType: "PromoCode",
      resourceId: promo.id,
      metadata: { code: promo.code, discountValue: promo.discountValue },
    });
    return promo;
  }

  async listPromoCodes(tenantId: string): Promise<PromoCode[]> {
    return this.promoRepo.findAll(tenantId);
  }

  async getPromoCode(tenantId: string, code: string): Promise<PromoCode | null> {
    return this.promoRepo.findByCode(code, tenantId);
  }

  async updatePromoStatus(
    tenantId: string,
    id: string,
    status: PromoCodeStatus,
    actorUserId: string = "system"
  ): Promise<PromoCode> {
    if (!["ACTIVE", "DISABLED", "INACTIVE"].includes(status)) {
      const err: any = new Error("Promo status may only be set to ACTIVE, DISABLED, or INACTIVE manually.");
      err.statusCode = 400;
      throw err;
    }
    const promo = await this.promoRepo.update(id, tenantId, { status });
    await this.auditRepo.record({
      tenantId,
      actorType: actorUserId === "system" ? "SYSTEM" : "USER",
      actorId: actorUserId,
      action: "pricing.promo_code.status_changed",
      resourceType: "PromoCode",
      resourceId: id,
      metadata: { status },
    });
    await this.outboxRepo.publish({
      tenantId,
      eventType: "pricing.promo_code.status_changed",
      aggregateType: "PromoCode",
      aggregateId: id,
      payload: { promoCodeId: id, code: promo.code, status },
    });
    return promo;
  }

  async recordPromoUsage(tenantId: string, code: string): Promise<PromoCode> {
    return this.promoRepo.recordUsage(code, tenantId);
  }

  async incrementPromoUsage(tenantId: string, promoId: string): Promise<PromoCode | null> {
    const promo = await this.promoRepo.findById(promoId, tenantId);
    if (!promo) return null;
    return this.promoRepo.recordUsage(promo.code, tenantId);
  }

  // --------------------------------------------------------------------------
  // Core Price Calculation Engine & Snapshot Generation
  // --------------------------------------------------------------------------

  async calculateQuote(request: PricingRequest & { tenantId: string }): Promise<PricingResult> {
    return this.calculatePrice(request.tenantId, request);
  }

  async calculatePrice(tenantId: string, request: PricingRequest): Promise<PricingResult> {
    // 1. Resolve explicit or effective rate plan
    let matchedPlan: RatePlan;
    let matchedRate: RatePlanRate;

    if (request.ratePlanId) {
      const explicitPlan = await this.ratePlanRepo.findById(request.ratePlanId, tenantId);
      if (!explicitPlan) {
        throw new Error(`Rate plan '${request.ratePlanId}' was not found for this tenant.`);
      }

      const evalTime = new Date(request.pickupDateTime).getTime();
      const effectiveFrom = new Date(explicitPlan.effectiveFrom).getTime();
      const effectiveTo = explicitPlan.effectiveTo ? new Date(explicitPlan.effectiveTo).getTime() : null;
      if (
        explicitPlan.status !== "ACTIVE" ||
        evalTime < effectiveFrom ||
        (effectiveTo !== null && evalTime > effectiveTo)
      ) {
        throw new Error(`Rate plan '${explicitPlan.code}' is not active/effective for the requested pickup time.`);
      }

      const explicitRate = await this.ratePlanRepo.getRateForCategoryOrVehicle(
        explicitPlan.id,
        tenantId,
        request.vehicleCategoryId,
        request.vehicleId
      );
      if (!explicitRate) {
        throw new Error(`Rate plan '${explicitPlan.code}' has no matching Vehicle/Category/general rate for this quote.`);
      }
      matchedPlan = explicitPlan;
      matchedRate = explicitRate;
    } else {
      const effectiveMatch = await this.ratePlanRepo.findEffectiveRatePlan(tenantId, {
        vehicleId: request.vehicleId,
        vehicleCategoryId: request.vehicleCategoryId,
        corporateAccountId: request.corporateAccountId,
        customerId: request.customerId,
        agentId: request.agentId,
        dateTime: request.pickupDateTime,
      });

      if (effectiveMatch) {
        matchedPlan = effectiveMatch.plan;
        matchedRate = effectiveMatch.matchedRate;
      } else {
      const vehicle = request.vehicleId ? await new VehicleRepository().findById(request.vehicleId, tenantId) : null;
      if (!vehicle || !Number.isFinite(vehicle.dailyRate) || vehicle.dailyRate <= 0) throw new Error("Configure a vehicle daily rate or a matching rate plan before booking.");
      const settings = await this.tenantSettingsRepo.findByTenantId(tenantId);
      // Use the saved vehicle price when no separate rate plan is configured.
      matchedPlan = {
        id: `rp-default-${tenantId}`,
        tenantId,
        code: "STANDARD_DEFAULT",
        name: "Standard Default Rate Plan",
        status: "ACTIVE",
        currency: request.currency || "KES",
        priority: 1,
        isDefault: true,
        effectiveFrom: new Date("2026-01-01").toISOString(),
        effectiveTo: null,
        taxInclusive: false,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      matchedRate = {
        id: `rpr-default-${tenantId}`,
        tenantId,
        ratePlanId: matchedPlan.id,
        vehicleCategoryId: request.vehicleCategoryId || null,
        vehicleId: request.vehicleId || null,
        dailyRate: vehicle.dailyRate,
        weeklyDailyRate: vehicle.dailyRate,
        monthlyDailyRate: vehicle.dailyRate,
        weekendDailyRate: vehicle.dailyRate,
        mileageAllowanceModel: "DAILY_CAPPED",
        includedKmPerDay: vehicle.allowedDailyKm ?? settings?.allowedDailyKm ?? 0,
        excessKmRate: vehicle.excessKmRate ?? settings?.excessKmRate ?? 0,
        depositAmount: settings?.depositDefaultAmount ?? 0,
        depositModel: "FIXED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      }
    }

    // 2. Resolve Corporate Account discount if specified
    let corporateDiscountPercent = 0;
    if (request.corporateAccountId) {
      const corpAccount = await this.corporateAccountRepo.findById(
        request.corporateAccountId,
        tenantId
      );
      if (corpAccount && corpAccount.discountRatePercent) {
        corporateDiscountPercent = corpAccount.discountRatePercent;
      }
    }

    // 3. Resolve Seasonal Rules and Duration Tiers
    const seasonalRules = await this.ruleRepo.listSeasonalRules(tenantId, matchedPlan.id);
    const durationTiers = await this.ruleRepo.listDurationTiers(tenantId, matchedPlan.id);
    const availableFees = await this.ruleRepo.listFeeRules(tenantId, matchedPlan.id);

    // 4. Resolve Promo Code
    let promoCode: PromoCode | null = null;
    if (request.promoCode) {
      promoCode = await this.promoRepo.findByCode(request.promoCode, tenantId);
    }

    // 5. Resolve Tax Rate
    const settings = await this.tenantSettingsRepo.findByTenantId(tenantId);
    const taxRatePercent = settings?.vatRatePercent ?? 16;

    // 6. Execute pure calculation
    const result = RateCalculator.calculate({
      request,
      ratePlan: matchedPlan,
      rateLine: matchedRate,
      seasonalRules,
      durationTiers,
      availableFees,
      promoCode,
      corporateDiscountPercent,
      taxRatePercent,
    });

    // 7. Audit quotation trace
    await this.auditRepo.record({
      tenantId,
      actorType: "SYSTEM",
      actorId: "system",
      action: "pricing.quote.calculated",
      resourceType: "PricingSnapshot",
      resourceId: result.pricingSnapshot.snapshotId,
      metadata: {
        ratePlanCode: matchedPlan.code,
        billableDays: result.rentalDuration.billableDays,
        grossTotal: result.grossRentalTotal,
        currency: result.currency,
      },
    });

    return result;
  }
}
