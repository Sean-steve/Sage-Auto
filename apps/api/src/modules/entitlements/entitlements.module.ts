// ============================================================================
// CAR HIRE OS — ENTITLEMENTS MODULE (ENT-001)
// ============================================================================

import { Router } from "express";
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
} from "@carhire/database";
import { EntitlementService } from "./application/entitlement.service";
import { FeatureRegistryService } from "./application/feature-registry.service";
import { UsageTrackerService } from "./application/usage-tracker.service";
import { EntitlementCacheService } from "./application/entitlement-cache.service";
import { PlatformEntitlementController } from "./presentation/platform-entitlement.controller";
import { TenantEntitlementController } from "./presentation/tenant-entitlement.controller";
import { createEntitlementGuard } from "./presentation/guards/entitlement.guard";
import type { RequestHandler } from "express";

export class EntitlementsModule {
  public readonly platformRouter: Router;
  public readonly tenantRouter: Router;
  public readonly entitlementService: EntitlementService;
  public readonly featureRegistryService: FeatureRegistryService;
  public readonly usageTrackerService: UsageTrackerService;
  public readonly cacheService: EntitlementCacheService;

  public get entitlementEngine() {
    return {
      hasFeature: async (tenantId: string, featureKey: string): Promise<boolean> => {
        return this.entitlementService.can(tenantId, featureKey);
      },
    };
  }

  constructor(
    platformAuthGuard?: (perm: string) => RequestHandler,
    permissionGuard?: (perm: string) => RequestHandler
  ) {
    const featureRepo = new FeatureRepository();
    const planFeatureRepo = new PlanFeatureRepository();
    const tenantEntitlementRepo = new TenantEntitlementRepository();
    const overrideRepo = new EntitlementOverrideRepository();
    const restrictionRepo = new EntitlementRestrictionRepository();
    const usageRepo = new EntitlementUsageRepository();
    const subRepo = new SubscriptionRepository();
    const planRepo = new PlanRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();

    this.cacheService = new EntitlementCacheService(60);
    this.usageTrackerService = new UsageTrackerService(usageRepo);
    this.featureRegistryService = new FeatureRegistryService(
      featureRepo,
      planFeatureRepo,
      planRepo
    );

    this.entitlementService = new EntitlementService(
      featureRepo,
      planFeatureRepo,
      tenantEntitlementRepo,
      overrideRepo,
      restrictionRepo,
      usageRepo,
      subRepo,
      planRepo,
      auditRepo,
      outboxRepo,
      this.cacheService,
      this.usageTrackerService
    );

    const platformController = new PlatformEntitlementController(
      this.entitlementService,
      this.featureRegistryService,
      platformAuthGuard
    );

    const tenantController = new TenantEntitlementController(
      this.entitlementService,
      this.usageTrackerService,
      permissionGuard
    );

    this.platformRouter = platformController.router;
    this.tenantRouter = tenantController.router;
  }

  public createGuard(featureKey: string, requiredQuantity: number = 1): RequestHandler {
    return createEntitlementGuard(this.entitlementService, featureKey, requiredQuantity);
  }
}
