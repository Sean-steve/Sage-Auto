// ============================================================================
// CAR HIRE OS — PLATFORM TENANTS CONTROLLER (Sprint 37: TEN-001..005)
// Routes for multi-tenant fleet operator administration under /api/v1/platform/tenants
// ============================================================================

import { Router, Request, Response } from "express";
import { PLATFORM_PERMISSIONS } from "@carhire/constants";
import type { PlatformTenantLifecycleService } from "../application/services/platform-tenant-lifecycle.service";
import type { PlatformAuthorizationService } from "../../authorization/application/services/platform-authorization.service";
import { createRequirePlatformPermissionGuard } from "../../authorization/presentation/guards/platform-permission.guard";

export function createPlatformTenantsController(
  tenantLifecycleService: PlatformTenantLifecycleService,
  platformAuthService: PlatformAuthorizationService
): Router {
  const router = Router();

  // 1. GET /api/v1/platform/tenants - List all tenants with fleet & sub summaries
  router.get(
    "/",
    createRequirePlatformPermissionGuard(platformAuthService, PLATFORM_PERMISSIONS.PLATFORM_TENANT_READ),
    async (req: Request, res: Response) => {
      try {
        const { status, country, search } = req.query as {
          status?: string;
          country?: string;
          search?: string;
        };
        const summaries = await tenantLifecycleService.listTenantSummaries(
          req.platformContext!,
          { status, country, search }
        );
        res.json({ data: summaries, total: summaries.length });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  // 2. GET /api/v1/platform/tenants/:id - Single tenant detailed profile
  router.get(
    "/:id",
    createRequirePlatformPermissionGuard(platformAuthService, PLATFORM_PERMISSIONS.PLATFORM_TENANT_READ),
    async (req: Request, res: Response) => {
      try {
        const detail = await tenantLifecycleService.getTenantDetail(
          req.platformContext!,
          req.params.id
        );
        res.json({ data: detail });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  // 3. POST /api/v1/platform/tenants/provision - Provision new tenant company
  router.post(
    "/provision",
    createRequirePlatformPermissionGuard(platformAuthService, PLATFORM_PERMISSIONS.PLATFORM_TENANT_PROVISION),
    async (req: Request, res: Response) => {
      try {
        const result = await tenantLifecycleService.provisionTenant(
          req.platformContext!,
          req.body
        );
        res.status(201).json({
          data: result,
          message: `Tenant '${result.tenant.name}' provisioned successfully`,
        });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  // 4. POST /api/v1/platform/tenants/:id/suspend - Suspend tenant workspace
  router.post(
    "/:id/suspend",
    createRequirePlatformPermissionGuard(platformAuthService, PLATFORM_PERMISSIONS.PLATFORM_TENANT_SUSPEND),
    async (req: Request, res: Response) => {
      try {
        const { reason, category } = req.body;
        const tenant = await tenantLifecycleService.suspendTenant(
          req.platformContext!,
          req.params.id,
          reason || "Suspended by platform operator",
          category
        );
        res.json({
          data: tenant,
          message: `Tenant '${tenant.name}' has been suspended`,
        });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  // 5. POST /api/v1/platform/tenants/:id/reactivate - Reactivate suspended tenant workspace
  router.post(
    "/:id/reactivate",
    createRequirePlatformPermissionGuard(platformAuthService, PLATFORM_PERMISSIONS.PLATFORM_TENANT_SUSPEND),
    async (req: Request, res: Response) => {
      try {
        const { reason } = req.body;
        const tenant = await tenantLifecycleService.reactivateTenant(
          req.platformContext!,
          req.params.id,
          reason || "Reactivated by platform operator"
        );
        res.json({
          data: tenant,
          message: `Tenant '${tenant.name}' has been reactivated`,
        });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  // 6. POST /api/v1/platform/tenants/:id/offboard - Decommission tenant workspace
  router.post(
    "/:id/offboard",
    createRequirePlatformPermissionGuard(platformAuthService, PLATFORM_PERMISSIONS.PLATFORM_TENANT_SUSPEND),
    async (req: Request, res: Response) => {
      try {
        const { reason } = req.body;
        const tenant = await tenantLifecycleService.offboardTenant(
          req.platformContext!,
          req.params.id,
          reason || "Offboarded and decommissioned"
        );
        res.json({
          data: tenant,
          message: `Tenant '${tenant.name}' has been decommissioned`,
        });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  return router;
}
