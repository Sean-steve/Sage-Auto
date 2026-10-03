// ============================================================================
// CAR HIRE OS — ENTITLEMENT SERVICE (ENT-001 §3, §8, §10)
// Production-Grade Authoritative Entitlement & Limit Engine
// ============================================================================

import type {
  EntitlementDecision,
  CreateEntitlementOverrideDto,
  CreateEntitlementRestrictionDto,
  EntitlementOverride,
  EntitlementRestriction,
  Feature,
  PlanFeature,
  Subscription,
} from "@carhire/types";
import {
  FeatureRepository,
  PlanFeatureRepository,
  TenantEntitlementRepository,
  EntitlementOverrideRepository,
  EntitlementRestrictionRepository,
  EntitlementUsageRepository,
  SubscriptionRepository,
  PlanRepository,
  AuditRepository,
  OutboxRepository,
  RecordNotFoundError,
} from "@carhire/database";
import { EntitlementPrecedenceEvaluator } from "../domain/entitlement-precedence.evaluator";
import { EntitlementCacheService } from "./entitlement-cache.service";
import { UsageTrackerService } from "./usage-tracker.service";

export class EntitlementService {
  constructor(
    private readonly featureRepo: FeatureRepository = new FeatureRepository(),
    private readonly planFeatureRepo: PlanFeatureRepository = new PlanFeatureRepository(),
    private readonly tenantEntitlementRepo: TenantEntitlementRepository = new TenantEntitlementRepository(),
    private readonly overrideRepo: EntitlementOverrideRepository = new EntitlementOverrideRepository(),
    private readonly restrictionRepo: EntitlementRestrictionRepository = new EntitlementRestrictionRepository(),
    private readonly usageRepo: EntitlementUsageRepository = new EntitlementUsageRepository(),
    private readonly subRepo: SubscriptionRepository = new SubscriptionRepository(),
    private readonly planRepo: PlanRepository = new PlanRepository(),
    private readonly auditRepo: AuditRepository = new AuditRepository(),
    private readonly outboxRepo: OutboxRepository = new OutboxRepository(),
    private readonly cacheService: EntitlementCacheService = new EntitlementCacheService(),
    private readonly usageTracker: UsageTrackerService = new UsageTrackerService(usageRepo)
  ) {}

  /**
   * Fast boolean entitlement check: "Is this tenant currently entitled to use this capability?"
   */
  async can(tenantId: string, featureKey: string): Promise<boolean> {
    const decision = await this.check(tenantId, featureKey, 1);
    return decision.allowed;
  }

  /**
   * Authoritative check with structured decision, remaining limits, and denial codes.
   */
  async check(tenantId: string, featureKey: string, requiredQuantity: number = 1): Promise<EntitlementDecision> {
    // 1. Check Fast Cache (only if quantity == 1, or evaluate fresh)
    const cached = this.cacheService.get(tenantId, featureKey);
    if (cached && requiredQuantity === 1) {
      return cached;
    }

    // 2. Authoritative Database Evaluation
    const feature = await this.featureRepo.findByKey(featureKey);
    if (!feature) {
      return {
        allowed: false,
        feature: featureKey,
        code: "FEATURE_NOT_INCLUDED",
        reason: "FEATURE_NOT_INCLUDED",
        limit: 0,
        isUnlimited: false,
        usage: 0,
        currentUsage: 0,
        remaining: 0,
        message: `Feature '${featureKey}' is not registered in the system.`,
      };
    }

    const subscription = await this.subRepo.findByTenantId(tenantId);
    const platformRestriction = await this.restrictionRepo.findActivePlatformRestriction(featureKey);
    const tenantRestriction = await this.restrictionRepo.findActiveTenantRestriction(tenantId, featureKey);
    const adminOverride = await this.overrideRepo.findActiveByTenantAndFeatureKey(tenantId, featureKey);

    let planFeature: PlanFeature | null = null;
    if (subscription?.planId) {
      planFeature = await this.planFeatureRepo.findByPlanAndFeatureKey(subscription.planId, featureKey);
    }

    // Fetch current tracked usage
    const currentUsage = await this.usageTracker.getUsage(tenantId, featureKey);

    // Evaluate Domain Precedence Matrix
    const decision = EntitlementPrecedenceEvaluator.evaluate({
      tenantId,
      feature,
      subscription,
      platformRestriction,
      tenantRestriction,
      adminOverride,
      planFeature,
      currentUsage,
    });

    // Check if additional requested quantity exceeds remaining
    if (decision.allowed && !decision.isUnlimited && decision.limit !== null && decision.limit !== undefined) {
      if (currentUsage + requiredQuantity > decision.limit) {
        decision.allowed = false;
        decision.code = feature.type === "USAGE_LIMIT" ? "USAGE_EXCEEDED" : "LIMIT_REACHED";
        decision.reason = decision.code;
        decision.message = `Requested capacity (${requiredQuantity}) exceeds remaining capacity (${decision.remaining}).`;
      }
    }

    // Cache the result for subsequent evaluations
    this.cacheService.set(tenantId, featureKey, decision);

    return decision;
  }

  /**
   * Alias for check()
   */
  async get(tenantId: string, featureKey: string): Promise<EntitlementDecision> {
    return this.check(tenantId, featureKey, 1);
  }

  /**
   * Evaluates all registered system features for a tenant and returns a dictionary of decisions.
   */
  async getAll(tenantId: string): Promise<Record<string, EntitlementDecision>> {
    const features = await this.featureRepo.listAll();
    const results: Record<string, EntitlementDecision> = {};

    for (const feature of features) {
      results[feature.key] = await this.check(tenantId, feature.key, 1);
    }

    return results;
  }

  async getLimit(tenantId: string, featureKey: string): Promise<{ limit: number | null; isUnlimited: boolean }> {
    const decision = await this.check(tenantId, featureKey, 1);
    return {
      limit: decision.limit ?? null,
      isUnlimited: decision.isUnlimited ?? false,
    };
  }

  async getUsage(tenantId: string, featureKey: string): Promise<number> {
    return this.usageTracker.getUsage(tenantId, featureKey);
  }

  async getRemaining(tenantId: string, featureKey: string): Promise<number | null> {
    const decision = await this.check(tenantId, featureKey, 1);
    return decision.remaining ?? null;
  }

  /**
   * Concurrency-safe limit enforcement & atomic reservation.
   * Atomically checks limit and reserves quantity in one step.
   */
  async reserveCapacity(
    tenantId: string,
    featureKey: string,
    quantity: number = 1
  ): Promise<EntitlementDecision> {
    // 1. Resolve authoritative limit ceiling for tenant
    const baseDecision = await this.check(tenantId, featureKey, 0);

    if (!baseDecision.allowed) {
      return baseDecision;
    }

    // If unlimited, simply increment counter and return allowed
    if (baseDecision.isUnlimited || baseDecision.limit === null || baseDecision.limit === undefined) {
      await this.usageTracker.reserveCapacity(tenantId, featureKey, quantity, null);
      this.cacheService.invalidate(tenantId, featureKey);
      return {
        ...baseDecision,
        allowed: true,
        usage: (baseDecision.currentUsage ?? 0) + quantity,
        currentUsage: (baseDecision.currentUsage ?? 0) + quantity,
        remaining: null,
      };
    }

    // 2. Perform atomic capacity reservation with ceiling enforcement
    const reservation = await this.usageTracker.reserveCapacity(
      tenantId,
      featureKey,
      quantity,
      baseDecision.limit
    );

    this.cacheService.invalidate(tenantId, featureKey);

    if (!reservation.success) {
      return {
        allowed: false,
        feature: featureKey,
        code: "LIMIT_REACHED",
        reason: "LIMIT_REACHED",
        limit: baseDecision.limit,
        isUnlimited: false,
        usage: reservation.usage,
        currentUsage: reservation.usage,
        remaining: 0,
        message: `Capacity limit reached (${reservation.usage}/${baseDecision.limit}). Unable to reserve ${quantity} additional unit(s).`,
        upgradeRecommended: true,
      };
    }

    return {
      allowed: true,
      feature: featureKey,
      limit: baseDecision.limit,
      isUnlimited: false,
      usage: reservation.usage,
      currentUsage: reservation.usage,
      remaining: reservation.remaining,
      source: baseDecision.source,
    };
  }

  /**
   * Release reserved capacity (e.g. on vehicle deletion or member removal).
   */
  async releaseCapacity(tenantId: string, featureKey: string, quantity: number = 1): Promise<number> {
    const updated = await this.usageTracker.releaseCapacity(tenantId, featureKey, quantity);
    this.cacheService.invalidate(tenantId, featureKey);
    return updated;
  }

  /**
   * Reconciles usage counter against authoritative database entity count.
   */
  async reconcileUsage(tenantId: string, featureKey: string, actualCount: number): Promise<void> {
    await this.usageTracker.reconcileUsage(tenantId, featureKey, actualCount);
    this.cacheService.invalidate(tenantId, featureKey);
  }

  /**
   * Creates an administrative override for a tenant feature.
   */
  async override(
    tenantId: string,
    actorId: string,
    dto: CreateEntitlementOverrideDto
  ): Promise<EntitlementOverride> {
    const result = await this.overrideRepo.create(tenantId, actorId, dto);

    // Invalidate Cache for this tenant
    this.cacheService.invalidate(tenantId, dto.featureKey);

    // Audit Trail
    await this.auditRepo.create({
      actorId,
      actorType: "PLATFORM_STAFF",
      tenantId,
      action: "PLATFORM_ENTITLEMENT_OVERRIDE_CREATED",
      resourceType: "ENTITLEMENT_OVERRIDE",
      resourceId: result.id,
      metadata: { ...dto },
    });

    // Outbox Event
    await this.outboxRepo.create({
      eventType: "entitlement.override_created",
      aggregateType: "TenantEntitlement",
      aggregateId: tenantId,
      payload: { ...result },
      status: "PENDING",
      eventVersion: "1.0",
      occurredAt: new Date().toISOString(),
      availableAt: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Revokes an existing administrative override.
   */
  async revokeOverride(overrideId: string, actorId: string = "SYSTEM"): Promise<EntitlementOverride> {
    const result = await this.overrideRepo.revoke(overrideId);
    this.cacheService.invalidate(result.tenantId, result.featureKey);

    await this.auditRepo.create({
      actorId,
      actorType: "PLATFORM_STAFF",
      tenantId: result.tenantId,
      action: "PLATFORM_ENTITLEMENT_OVERRIDE_REVOKED",
      resourceType: "ENTITLEMENT_OVERRIDE",
      resourceId: result.id,
      metadata: { featureKey: result.featureKey },
    });

    await this.outboxRepo.create({
      eventType: "entitlement.override_revoked",
      aggregateType: "TenantEntitlement",
      aggregateId: result.tenantId,
      payload: { ...result },
      status: "PENDING",
      eventVersion: "1.0",
      occurredAt: new Date().toISOString(),
      availableAt: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Applies a platform or tenant capability restriction.
   */
  async restrict(
    dto: CreateEntitlementRestrictionDto,
    actorId: string
  ): Promise<EntitlementRestriction> {
    const result = await this.restrictionRepo.create(dto, actorId);

    if (dto.scope === "PLATFORM") {
      this.cacheService.invalidateGlobal();
    } else if (dto.tenantId) {
      this.cacheService.invalidate(dto.tenantId, dto.featureKey);
    }

    await this.auditRepo.create({
      actorId,
      actorType: "PLATFORM_STAFF",
      tenantId: dto.tenantId || "PLATFORM",
      action: "PLATFORM_ENTITLEMENT_RESTRICTION_APPLIED",
      resourceType: "ENTITLEMENT_RESTRICTION",
      resourceId: result.id,
      metadata: { ...dto },
    });

    await this.outboxRepo.create({
      eventType: "entitlement.restriction_applied",
      aggregateType: "EntitlementRestriction",
      aggregateId: result.id,
      payload: { ...result },
      status: "PENDING",
      eventVersion: "1.0",
      occurredAt: new Date().toISOString(),
      availableAt: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Lifts an active restriction.
   */
  async liftRestriction(restrictionId: string, actorId: string = "SYSTEM"): Promise<EntitlementRestriction> {
    const result = await this.restrictionRepo.lift(restrictionId);

    if (result.scope === "PLATFORM") {
      this.cacheService.invalidateGlobal();
    } else if (result.tenantId) {
      this.cacheService.invalidate(result.tenantId, result.featureKey);
    }

    await this.auditRepo.create({
      actorId,
      actorType: "PLATFORM_STAFF",
      tenantId: result.tenantId || "PLATFORM",
      action: "PLATFORM_ENTITLEMENT_RESTRICTION_LIFTED",
      resourceType: "ENTITLEMENT_RESTRICTION",
      resourceId: result.id,
      metadata: { featureKey: result.featureKey, scope: result.scope },
    });

    await this.outboxRepo.create({
      eventType: "entitlement.restriction_lifted",
      aggregateType: "EntitlementRestriction",
      aggregateId: result.id,
      payload: { ...result },
      status: "PENDING",
      eventVersion: "1.0",
      occurredAt: new Date().toISOString(),
      availableAt: new Date().toISOString(),
    });

    return result;
  }

  /**
   * Proactively recalculates and refreshes all entitlements for a tenant (e.g. on plan change).
   */
  async recalculate(tenantId: string): Promise<Record<string, EntitlementDecision>> {
    this.cacheService.invalidate(tenantId);
    return this.getAll(tenantId);
  }
}
