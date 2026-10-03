// ============================================================================
// CAR HIRE OS — PLATFORM ENTITLEMENT CONTROLLER (ENT-001 §10)
// Platform Control Plane APIs for Feature Registry, Plan Mappings, Overrides & Restrictions
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { EntitlementService } from "../application/entitlement.service";
import { FeatureRegistryService } from "../application/feature-registry.service";
import { PLATFORM_PERMISSIONS } from "@carhire/constants";
import type { RequestHandler } from "express";

export class PlatformEntitlementController {
  public readonly router: Router;

  constructor(
    private readonly entitlementService: EntitlementService,
    private readonly featureRegistry: FeatureRegistryService,
    private readonly platformGuard?: (perm: string) => RequestHandler
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private guard(perm: string): RequestHandler {
    if (this.platformGuard) {
      return this.platformGuard(perm);
    }
    return (_req, _res, next) => next();
  }

  private setupRoutes() {
    // ------------------------------------------------------------------------
    // Feature Registry Management
    // ------------------------------------------------------------------------
    this.router.get(
      "/features",
      this.guard(PLATFORM_PERMISSIONS.PLATFORM_FEATURE_READ),
      async (_req: Request, res: Response, next: NextFunction) => {
        try {
          const features = await this.featureRegistry.listFeatures();
          res.json({ success: true, data: features });
        } catch (err) {
          next(err);
        }
      }
    );

    this.router.post(
      "/features",
      this.guard(PLATFORM_PERMISSIONS.PLATFORM_FEATURE_MANAGE),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const feature = await this.featureRegistry.registerFeature(req.body);
          res.status(201).json({ success: true, data: feature });
        } catch (err) {
          next(err);
        }
      }
    );

    this.router.put(
      "/features/:id",
      this.guard(PLATFORM_PERMISSIONS.PLATFORM_FEATURE_MANAGE),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const updated = await this.featureRegistry.updateFeature(req.params.id, req.body);
          res.json({ success: true, data: updated });
        } catch (err) {
          next(err);
        }
      }
    );

    // ------------------------------------------------------------------------
    // Plan Feature Matrix Configuration
    // ------------------------------------------------------------------------
    this.router.get(
      "/plans/:planId/features",
      this.guard(PLATFORM_PERMISSIONS.PLATFORM_PLAN_READ),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const planFeatures = await this.featureRegistry.getPlanFeatures(req.params.planId);
          res.json({ success: true, data: planFeatures });
        } catch (err) {
          next(err);
        }
      }
    );

    this.router.put(
      "/plans/:planId/features",
      this.guard(PLATFORM_PERMISSIONS.PLATFORM_PLAN_UPDATE),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const configured = await this.featureRegistry.configurePlanFeature(req.params.planId, req.body);
          res.json({ success: true, data: configured });
        } catch (err) {
          next(err);
        }
      }
    );

    // ------------------------------------------------------------------------
    // Tenant Overrides
    // ------------------------------------------------------------------------
    this.router.post(
      "/tenants/:tenantId/overrides",
      this.guard(PLATFORM_PERMISSIONS.PLATFORM_ENTITLEMENT_OVERRIDE),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const actorId = (req as any).user?.id || "PLATFORM_ADMIN";
          const override = await this.entitlementService.override(
            req.params.tenantId,
            actorId,
            req.body
          );
          res.status(201).json({ success: true, data: override });
        } catch (err) {
          next(err);
        }
      }
    );

    this.router.delete(
      "/overrides/:id",
      this.guard(PLATFORM_PERMISSIONS.PLATFORM_ENTITLEMENT_OVERRIDE),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const actorId = (req as any).user?.id || "PLATFORM_ADMIN";
          const revoked = await this.entitlementService.revokeOverride(req.params.id, actorId);
          res.json({ success: true, data: revoked });
        } catch (err) {
          next(err);
        }
      }
    );

    // ------------------------------------------------------------------------
    // Platform & Tenant Restrictions
    // ------------------------------------------------------------------------
    this.router.post(
      "/restrictions",
      this.guard(PLATFORM_PERMISSIONS.PLATFORM_ENTITLEMENT_RESTRICT),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const actorId = (req as any).user?.id || "PLATFORM_SECURITY";
          const restriction = await this.entitlementService.restrict(req.body, actorId);
          res.status(201).json({ success: true, data: restriction });
        } catch (err) {
          next(err);
        }
      }
    );

    this.router.delete(
      "/restrictions/:id",
      this.guard(PLATFORM_PERMISSIONS.PLATFORM_ENTITLEMENT_RESTRICT),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const actorId = (req as any).user?.id || "PLATFORM_SECURITY";
          const lifted = await this.entitlementService.liftRestriction(req.params.id, actorId);
          res.json({ success: true, data: lifted });
        } catch (err) {
          next(err);
        }
      }
    );
  }
}
