// ============================================================================
// CAR HIRE OS — SUBSCRIPTIONS MODULE
// ============================================================================

import { Router } from "express";
import {
  SubscriptionRepository,
  SubscriptionStatusHistoryRepository,
  PlanRepository,
  TenantRepository,
  AuditRepository,
  OutboxRepository,
} from "@carhire/database";
import { PLATFORM_PERMISSIONS, TENANT_PERMISSIONS } from "@carhire/constants";
import { SubscriptionService } from "./application/subscription.service";
import { PlanService } from "./application/plan.service";
import { SaasMetricsService } from "./application/metrics.service";
import { PlatformSubscriptionController } from "./presentation/platform-subscription.controller";
import { TenantSubscriptionController } from "./presentation/tenant-subscription.controller";
import type { RequestHandler } from "express";

export interface IGuardWrapper {
  require?: (perm: string) => RequestHandler;
  requirePlatformPermission?: (perm: string) => RequestHandler;
}

export class SubscriptionsModule {
  public readonly platformRouter: Router;
  public readonly tenantRouter: Router;
  public readonly subscriptionService: SubscriptionService;
  public readonly planService: PlanService;
  public readonly metricsService: SaasMetricsService;

  constructor(
    platformAuthGuard?: IGuardWrapper | ((permission: string) => RequestHandler),
    permissionGuard?: IGuardWrapper | ((permission: string) => RequestHandler)
  ) {
    const subRepo = new SubscriptionRepository();
    const historyRepo = new SubscriptionStatusHistoryRepository();
    const planRepo = new PlanRepository();
    const tenantRepo = new TenantRepository();
    const auditRepo = new AuditRepository();
    const outboxRepo = new OutboxRepository();

    this.subscriptionService = new SubscriptionService(
      subRepo,
      historyRepo,
      planRepo,
      tenantRepo,
      auditRepo,
      outboxRepo
    );
    this.planService = new PlanService(planRepo, auditRepo, outboxRepo);
    this.metricsService = new SaasMetricsService(subRepo, planRepo, tenantRepo);

    const platformCtrl = new PlatformSubscriptionController(
      this.subscriptionService,
      this.planService,
      this.metricsService
    );
    const tenantCtrl = new TenantSubscriptionController(
      this.subscriptionService,
      this.planService
    );

    const resolvePlatformGuard = (perm: string): RequestHandler => {
      if (!platformAuthGuard) return (_req, _res, next) => next();
      if (typeof platformAuthGuard === "function") return platformAuthGuard(perm);
      if (platformAuthGuard.requirePlatformPermission) return platformAuthGuard.requirePlatformPermission(perm);
      if (platformAuthGuard.require) return platformAuthGuard.require(perm);
      return (_req, _res, next) => next();
    };

    const resolveTenantGuard = (perm: string): RequestHandler => {
      if (!permissionGuard) return (_req, _res, next) => next();
      if (typeof permissionGuard === "function") return permissionGuard(perm);
      if (permissionGuard.require) return permissionGuard.require(perm);
      return (_req, _res, next) => next();
    };

    // Platform Router
    this.platformRouter = Router();
    const requirePlatformPlanRead = resolvePlatformGuard(PLATFORM_PERMISSIONS.PLATFORM_PLAN_READ);
    const requirePlatformPlanManage = resolvePlatformGuard(PLATFORM_PERMISSIONS.PLATFORM_PLAN_MANAGE);
    const requirePlatformSubRead = resolvePlatformGuard(PLATFORM_PERMISSIONS.PLATFORM_SUBSCRIPTION_READ);
    const requirePlatformSubManage = resolvePlatformGuard(PLATFORM_PERMISSIONS.PLATFORM_BILLING_MANAGE);

    // Metrics Overview
    this.platformRouter.get("/metrics/overview", requirePlatformSubRead, platformCtrl.getMetricsOverview);

    // Subscriptions
    this.platformRouter.get("/subscriptions", requirePlatformSubRead, platformCtrl.listSubscriptions);
    this.platformRouter.get("/subscriptions/:id", requirePlatformSubRead, platformCtrl.getSubscriptionById);
    this.platformRouter.get("/subscriptions/:id/history", requirePlatformSubRead, platformCtrl.getStatusHistory);
    this.platformRouter.post("/subscriptions/:id/transition", requirePlatformSubManage, platformCtrl.transitionStatus);
    this.platformRouter.post("/subscriptions/:id/suspend", requirePlatformSubManage, platformCtrl.suspendSubscription);
    this.platformRouter.post("/subscriptions/:id/reactivate", requirePlatformSubManage, platformCtrl.reactivateSubscription);

    // Plans
    this.platformRouter.get("/plans", requirePlatformPlanRead, platformCtrl.listPlans);
    this.platformRouter.post("/plans", requirePlatformPlanManage, platformCtrl.createPlan);
    this.platformRouter.put("/plans/:id", requirePlatformPlanManage, platformCtrl.updatePlan);
    this.platformRouter.post("/plans/:id/archive", requirePlatformPlanManage, platformCtrl.archivePlan);

    // Tenant Router
    this.tenantRouter = Router();
    const requireTenantSubRead = resolveTenantGuard(TENANT_PERMISSIONS.SUBSCRIPTION_READ);
    const requireTenantSubUpgrade = resolveTenantGuard(TENANT_PERMISSIONS.SUBSCRIPTION_UPGRADE);
    const requireTenantSubCancel = resolveTenantGuard(TENANT_PERMISSIONS.SUBSCRIPTION_CANCEL);

    this.tenantRouter.get("/", requireTenantSubRead, tenantCtrl.getCurrentSubscription);
    this.tenantRouter.get("/access-context", requireTenantSubRead, tenantCtrl.getAccessContext);
    this.tenantRouter.get("/plans", tenantCtrl.listPublicPlans);
    this.tenantRouter.get("/history", requireTenantSubRead, tenantCtrl.getStatusHistory);
    this.tenantRouter.post("/change-plan", requireTenantSubUpgrade, tenantCtrl.changePlan);
    this.tenantRouter.post("/cancel", requireTenantSubCancel, tenantCtrl.cancelSubscription);
  }
}
