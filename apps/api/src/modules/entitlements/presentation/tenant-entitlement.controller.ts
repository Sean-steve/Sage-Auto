// ============================================================================
// CAR HIRE OS — TENANT ENTITLEMENT CONTROLLER (ENT-001 §10)
// Tenant-Facing Authoritative Capability & Capacity Ingestion APIs
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { EntitlementService } from "../application/entitlement.service";
import { UsageTrackerService } from "../application/usage-tracker.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";
import type { RequestHandler } from "express";

export class TenantEntitlementController {
  public readonly router: Router;

  constructor(
    private readonly entitlementService: EntitlementService,
    private readonly usageTracker: UsageTrackerService,
    private readonly permissionGuard?: (perm: string) => RequestHandler
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private guard(perm: string): RequestHandler {
    if (this.permissionGuard) {
      return this.permissionGuard(perm);
    }
    return (_req, _res, next) => next();
  }

  private getTenantId(req: Request): string {
    const ctx = (req as any).tenantContext;
    const tenantId = ctx?.tenantId;
    if (!tenantId) {
      const err: any = new Error("Forbidden: Missing or unverified tenant context.");
      err.statusCode = 403;
      throw err;
    }
    return tenantId;
  }

  private setupRoutes() {
    /**
     * GET /effective
     * Returns full authoritative capability snapshot with remaining capacities for the tenant.
     * Used by the frontend client for dynamic UI feature gating and upgrade CTA rendering.
     */
    this.router.get(
      "/effective",
      this.guard(TENANT_PERMISSIONS.ENTITLEMENT_READ),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const tenantId = this.getTenantId(req);
          const entitlements = await this.entitlementService.getAll(tenantId);
          res.json({ success: true, data: entitlements });
        } catch (err) {
          next(err);
        }
      }
    );

    /**
     * GET /check/:featureKey
     * Checks entitlement for a specific feature with optional required quantity.
     */
    this.router.get(
      "/check/:featureKey",
      this.guard(TENANT_PERMISSIONS.ENTITLEMENT_READ),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const tenantId = this.getTenantId(req);
          const quantity = req.query.quantity ? Number(req.query.quantity) : 1;
          const decision = await this.entitlementService.check(
            tenantId,
            req.params.featureKey,
            quantity
          );
          res.json({ success: true, data: decision });
        } catch (err) {
          next(err);
        }
      }
    );

    /**
     * POST /reserve
     * Concurrency-safe atomic capacity reservation.
     */
    this.router.post(
      "/reserve",
      this.guard(TENANT_PERMISSIONS.ENTITLEMENT_READ),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const tenantId = this.getTenantId(req);
          const { featureKey, quantity = 1 } = req.body;

          if (!featureKey) {
            res.status(400).json({ success: false, message: "featureKey is required." });
            return;
          }

          const decision = await this.entitlementService.reserveCapacity(
            tenantId,
            featureKey,
            Number(quantity)
          );

          if (!decision.allowed) {
            res.status(403).json({
              success: false,
              error: "Capacity Limit Exceeded",
              data: decision,
            });
            return;
          }

          res.json({ success: true, data: decision });
        } catch (err) {
          next(err);
        }
      }
    );

    /**
     * GET /usage
     * Returns metered and counted usage records for the tenant.
     */
    this.router.get(
      "/usage",
      this.guard(TENANT_PERMISSIONS.ENTITLEMENT_READ),
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          const tenantId = this.getTenantId(req);
          const usageList = await this.usageTracker.listTenantUsage(tenantId);
          res.json({ success: true, data: usageList });
        } catch (err) {
          next(err);
        }
      }
    );
  }
}
