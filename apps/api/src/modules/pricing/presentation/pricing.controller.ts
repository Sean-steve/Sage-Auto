// ============================================================================
// CAR HIRE OS — PRICING & RATE ENGINE CONTROLLER (DEV-006, DEV-007, BRS-001)
// REST API Endpoints with Tenant Scoping & Granular RBAC Permissions
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { TENANT_PERMISSIONS } from "@carhire/constants";
import { PricingService } from "../application/pricing.service";

export function createPricingController(
  pricingService: PricingService,
  permissionGuard: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();

  // Helper to extract actor from authenticated context
  const getActor = (req: Request): string => {
    const auth = (req as any).auth;
    const user = (req as any).user;
    const userId = auth?.userId || user?.userId || user?.id || user?.sub;
    if (!userId) {
      const err: any = new Error("Unauthorized: Valid authentication required.");
      err.statusCode = 401;
      throw err;
    }
    return userId;
  };

  const getTenantId = (req: Request): string => {
    const ctx = (req as any).tenantContext;
    const tid = ctx?.tenantId || (req as any).tenantId;
    if (!tid) {
      const err: any = new Error("Forbidden: Missing or unverified tenant context.");
      err.statusCode = 403;
      throw err;
    }
    return String(tid);
  };

  // --------------------------------------------------------------------------
  // Rate Plans Endpoints
  // --------------------------------------------------------------------------

  // List all rate plans for tenant
  router.get(
    "/rate-plans",
    permissionGuard(TENANT_PERMISSIONS.PRICING_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const plans = await pricingService.listRatePlans(tenantId);
        res.json({ success: true, data: plans });
      } catch (err) {
        next(err);
      }
    }
  );

  // Create new rate plan
  router.post(
    "/rate-plans",
    permissionGuard(TENANT_PERMISSIONS.PRICING_RATE_PLAN_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const plan = await pricingService.createRatePlan(tenantId, req.body, getActor(req));
        res.status(201).json({ success: true, data: plan });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get rate plan by ID
  router.get(
    "/rate-plans/:id",
    permissionGuard(TENANT_PERMISSIONS.PRICING_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const plan = await pricingService.getRatePlanById(tenantId, req.params.id);
        if (!plan) {
          return res.status(404).json({ success: false, error: "Rate plan not found" });
        }
        res.json({ success: true, data: plan });
      } catch (err) {
        next(err);
      }
    }
  );

  // Update rate plan
  router.patch(
    "/rate-plans/:id",
    permissionGuard(TENANT_PERMISSIONS.PRICING_RATE_PLAN_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const expectedVersion = req.body.expectedVersion
          ? Number(req.body.expectedVersion)
          : undefined;
        const plan = await pricingService.updateRatePlan(
          tenantId,
          req.params.id,
          req.body,
          expectedVersion,
          getActor(req)
        );
        res.json({ success: true, data: plan });
      } catch (err) {
        next(err);
      }
    }
  );

  // Activate rate plan
  router.post(
    "/rate-plans/:id/activate",
    permissionGuard(TENANT_PERMISSIONS.PRICING_RATE_PLAN_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const plan = await pricingService.activateRatePlan(tenantId, req.params.id, getActor(req));
        res.json({ success: true, data: plan });
      } catch (err) {
        next(err);
      }
    }
  );

  // Archive rate plan
  router.post(
    "/rate-plans/:id/archive",
    permissionGuard(TENANT_PERMISSIONS.PRICING_RATE_PLAN_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const plan = await pricingService.archiveRatePlan(tenantId, req.params.id, getActor(req));
        res.json({ success: true, data: plan });
      } catch (err) {
        next(err);
      }
    }
  );

  // Set / Replace rates for plan
  router.post(
    "/rate-plans/:id/rates",
    permissionGuard(TENANT_PERMISSIONS.PRICING_RATE_PLAN_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const rates = Array.isArray(req.body) ? req.body : req.body.rates || [req.body];
        const updated = await pricingService.setRates(
          tenantId,
          req.params.id,
          rates,
          getActor(req)
        );
        res.json({ success: true, data: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get rates for plan
  router.get(
    "/rate-plans/:id/rates",
    permissionGuard(TENANT_PERMISSIONS.PRICING_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const rates = await pricingService.getRates(tenantId, req.params.id);
        res.json({ success: true, data: rates });
      } catch (err) {
        next(err);
      }
    }
  );

  // Assign rate plan
  router.post(
    "/rate-plans/:id/assignments",
    permissionGuard(TENANT_PERMISSIONS.PRICING_RATE_PLAN_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const assignment = await pricingService.assignPlan(
          tenantId,
          req.params.id,
          req.body,
          getActor(req)
        );
        res.status(201).json({ success: true, data: assignment });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get assignments for plan
  router.get(
    "/rate-plans/:id/assignments",
    permissionGuard(TENANT_PERMISSIONS.PRICING_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const assignments = await pricingService.getAssignments(tenantId, req.params.id);
        res.json({ success: true, data: assignments });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Seasonal Rules & Duration Tiers
  // --------------------------------------------------------------------------

  router.post(
    "/rate-plans/:id/seasonal-rules",
    permissionGuard(TENANT_PERMISSIONS.PRICING_RATE_PLAN_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const rule = await pricingService.createSeasonalRule(
          tenantId,
          req.params.id,
          req.body,
          getActor(req)
        );
        res.status(201).json({ success: true, data: rule });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/rate-plans/:id/seasonal-rules",
    permissionGuard(TENANT_PERMISSIONS.PRICING_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const rules = await pricingService.listSeasonalRules(tenantId, req.params.id);
        res.json({ success: true, data: rules });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/seasonal-rules/:id",
    permissionGuard(TENANT_PERMISSIONS.PRICING_RATE_PLAN_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        await pricingService.deleteSeasonalRule(tenantId, req.params.id, getActor(req));
        res.json({ success: true });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/rate-plans/:id/duration-tiers",
    permissionGuard(TENANT_PERMISSIONS.PRICING_RATE_PLAN_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const tier = await pricingService.createDurationTier(tenantId, req.params.id, req.body);
        res.status(201).json({ success: true, data: tier });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/rate-plans/:id/duration-tiers",
    permissionGuard(TENANT_PERMISSIONS.PRICING_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const tiers = await pricingService.listDurationTiers(tenantId, req.params.id);
        res.json({ success: true, data: tiers });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/duration-tiers/:id",
    permissionGuard(TENANT_PERMISSIONS.PRICING_RATE_PLAN_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        await pricingService.deleteDurationTier(tenantId, req.params.id, getActor(req));
        res.json({ success: true });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Ancillary Fees
  // --------------------------------------------------------------------------

  router.get(
    "/fees",
    permissionGuard(TENANT_PERMISSIONS.PRICING_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const fees = await pricingService.listFeeRules(tenantId);
        res.json({ success: true, data: fees });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/fees",
    permissionGuard(TENANT_PERMISSIONS.PRICING_RATE_PLAN_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const fee = await pricingService.createFeeRule(tenantId, req.body, getActor(req));
        res.status(201).json({ success: true, data: fee });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/fees/:id",
    permissionGuard(TENANT_PERMISSIONS.PRICING_RATE_PLAN_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        await pricingService.deleteFeeRule(tenantId, req.params.id, getActor(req));
        res.json({ success: true });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Promo Codes
  // --------------------------------------------------------------------------

  router.get(
    "/promo-codes",
    permissionGuard(TENANT_PERMISSIONS.PRICING_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const promos = await pricingService.listPromoCodes(tenantId);
        res.json({ success: true, data: promos });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/promo-codes",
    permissionGuard(TENANT_PERMISSIONS.PRICING_PROMO_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const promo = await pricingService.createPromoCode(tenantId, req.body, getActor(req));
        res.status(201).json({ success: true, data: promo });
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    "/promo-codes/:id/status",
    permissionGuard(TENANT_PERMISSIONS.PRICING_PROMO_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const promo = await pricingService.updatePromoStatus(
          tenantId,
          req.params.id,
          req.body.status,
          getActor(req)
        );
        res.json({ success: true, data: promo });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Quote / Price Calculation (Instant Real-time Quote Engine)
  // --------------------------------------------------------------------------

  router.post(
    "/calculate",
    permissionGuard(TENANT_PERMISSIONS.PRICING_CALCULATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const result = await pricingService.calculatePrice(tenantId, req.body);
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
