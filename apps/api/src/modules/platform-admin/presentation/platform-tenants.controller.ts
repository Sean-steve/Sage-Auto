// ============================================================================
// CAR HIRE OS — PLATFORM TENANTS CONTROLLER (Sprint 37: TEN-001..005)
// Routes for multi-tenant fleet operator administration under /api/v1/platform/tenants
// ============================================================================

import { Router, Request, Response } from "express";
import { PLATFORM_PERMISSIONS } from "@carhire/constants";
import type { PlatformTenantLifecycleService } from "../application/services/platform-tenant-lifecycle.service";
import type { PlatformAuthorizationService } from "../../authorization/application/services/platform-authorization.service";
import type { AccessService } from "../../access/access.service";
import { createRequirePlatformPermissionGuard } from "../../authorization/presentation/guards/platform-permission.guard";

export function createPlatformTenantsController(
  tenantLifecycleService: PlatformTenantLifecycleService,
  platformAuthService: PlatformAuthorizationService,
  accessService?: AccessService
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
        const ownerInvitation=accessService
          ? await accessService.getProvisionedOwnerInvitation(req.platformContext!.userId,req.params.id)
          : {status:"NOT_CONFIGURED"};
        res.json({ data: {...detail,ownerInvitation} });
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
        // Tenant creation and owner activation are separate durable steps.
        // Delivery failure never rolls back or duplicates a saved tenant.
        let ownerInvitation:{status:"SENT"|"DELIVERY_FAILED"|"NOT_CONFIGURED";id?:string;message?:string}={status:"NOT_CONFIGURED"};
        if(accessService) {
          try {
            const invited=await accessService.inviteProvisionedOwner(
              req.platformContext!.userId,result.tenant.id,req.body.ownerEmail
            );
            ownerInvitation={status:"SENT",id:invited.id};
          } catch(error:any) {
            ownerInvitation={status:"DELIVERY_FAILED",message:"Company saved, but the first owner invitation could not be delivered. Retry from company details."};
          }
        }
        res.status(201).json({
          data:{...result,ownerInvitation},
          message:ownerInvitation.status==="SENT"
            ? `Tenant '${result.tenant.name}' provisioned; owner invitation requested`
            : `Tenant '${result.tenant.name}' provisioned; owner activation requires attention`,
        });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  // Retry the first-owner invitation for the originally nominated email.
  router.post(
    "/:id/owner-invitation/retry",
    createRequirePlatformPermissionGuard(platformAuthService, PLATFORM_PERMISSIONS.PLATFORM_TENANT_PROVISION),
    async (req:Request,res:Response) => {
      if(!accessService) {res.status(503).json({error:{code:"OWNER_INVITATION_UNAVAILABLE",message:"Owner onboarding service is not configured"}});return;}
      try {
        const invited=await accessService.retryProvisionedOwnerInvitation(req.platformContext!.userId,req.params.id);
        res.json({data:{id:invited.id,status:invited.status,delivery:invited.delivery}});
      } catch(err:any) {
        res.status(err.statusCode||500).json({error:{code:err.code||"OWNER_INVITATION_FAILED",message:err.message}});
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
