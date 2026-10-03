// ============================================================================
// CAR HIRE OS — PLATFORM AUTHORIZATION CONTROLLER (DEV-005 §9, §22, §37)
// Dedicated control-plane routes under /api/v1/platform/...
// ============================================================================

import { Router, Request, Response } from "express";
import { z } from "zod";
import { PLATFORM_PERMISSIONS } from "@carhire/constants";
import type { PlatformAuthorizationService } from "../../application/services/platform-authorization.service";
import type { SupportAccessService } from "../../application/services/support-access.service";
import type { IPlatformMembershipRepository } from "@carhire/database";
import { withRecordTransaction } from "@carhire/database";
import { createRequirePlatformPermissionGuard } from "../guards/platform-permission.guard";

export function createPlatformAuthorizationController(
  platformAuthService: PlatformAuthorizationService,
  supportAccessService: SupportAccessService,
  platformMembershipRepo?: IPlatformMembershipRepository
): Router {
  const router = Router();

  // 1. GET /api/v1/platform/roles - List all platform roles
  router.get(
    "/roles",
    createRequirePlatformPermissionGuard(platformAuthService, PLATFORM_PERMISSIONS.PLATFORM_USER_READ),
    async (req: Request, res: Response) => {
      const roles = await platformAuthService.listRoles(req.platformContext!);
      res.json({ data: roles, total: roles.length });
    }
  );

  // 2. GET /api/v1/platform/support/sessions - List support sessions
  router.get(
    "/support/sessions",
    createRequirePlatformPermissionGuard(platformAuthService, PLATFORM_PERMISSIONS.PLATFORM_SUPPORT_ACCESS),
    async (req: Request, res: Response) => {
      const tenantId = req.query.tenantId as string | undefined;
      const sessions = await supportAccessService.listSessions(req.platformContext!, tenantId);
      res.json({ data: sessions, total: sessions.length });
    }
  );

  // 3. POST /api/v1/platform/support/sessions - Start audited support session
  router.post(
    "/support/sessions",
    createRequirePlatformPermissionGuard(platformAuthService, PLATFORM_PERMISSIONS.PLATFORM_SUPPORT_SESSION_START),
    async (req: Request, res: Response) => {
      try {
        const { targetTenantId, reason, durationMinutes } = z.object({targetTenantId:z.string().min(1),reason:z.string().trim().min(5).max(1000),durationMinutes:z.number().int().min(1).max(120).optional()}).strict().parse(req.body);
        const session = await withRecordTransaction(()=>supportAccessService.startSupportSession(
          req.platformContext!,
          targetTenantId,
          reason,
          durationMinutes
        ));
        res.status(201).json({ data: session, message: "Support access session initiated successfully" });
      } catch (err: any) {
        res.status(err.statusCode || (err.name==='ZodError'?400:500)).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  // 4. POST /api/v1/platform/support/sessions/:id/end - End active support session
  router.post(
    "/support/sessions/:id/end",
    createRequirePlatformPermissionGuard(platformAuthService, PLATFORM_PERMISSIONS.PLATFORM_SUPPORT_SESSION_END),
    async (req: Request, res: Response) => {
      try {
        const session = await withRecordTransaction(()=>supportAccessService.endSupportSession(req.platformContext!, req.params.id));
        res.json({ data: session, message: "Support access session terminated" });
      } catch (err: any) {
        res.status(err.statusCode || (err.name==='ZodError'?400:500)).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  // 5. GET /api/v1/platform/staff - List platform staff members
  router.get(
    "/staff",
    createRequirePlatformPermissionGuard(platformAuthService, PLATFORM_PERMISSIONS.PLATFORM_USER_READ),
    async (req: Request, res: Response) => {
      if (!platformMembershipRepo) {
        return res.json({ data: [], total: 0 });
      }
      const staff = await platformMembershipRepo.listAll();
      res.json({ data: staff, total: staff.length });
    }
  );

  // 6. POST /api/v1/platform/staff - Invite/create platform staff member
  router.post(
    "/staff",
    createRequirePlatformPermissionGuard(platformAuthService, PLATFORM_PERMISSIONS.PLATFORM_USER_MANAGE),
    async (req: Request, res: Response) => {
      if (!platformMembershipRepo) {
        return res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "Staff repo not available" } });
      }
      try {
        const { userId, email, name, role } = req.body;
        if (!userId || !role) {
          return res.status(400).json({ error: { code: "INVALID_INPUT", message: "userId and role are required" } });
        }
        const created = await platformMembershipRepo.create({
          userId,
          email,
          name,
          role,
          permissions: [],
        });
        res.status(201).json({ data: created, message: "Platform staff member created successfully" });
      } catch (err: any) {
        res.status(err.statusCode || (err.name==='ZodError'?400:500)).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  // 7. PUT /api/v1/platform/staff/:id/roles - Assign role to platform staff
  router.put(
    "/staff/:id/roles",
    createRequirePlatformPermissionGuard(platformAuthService, PLATFORM_PERMISSIONS.PLATFORM_USER_MANAGE),
    async (req: Request, res: Response) => {
      try {
        const { role } = req.body;
        await platformAuthService.assignPlatformRole(req.platformContext!, req.params.id, role);
        if (platformMembershipRepo) {
          await platformMembershipRepo.update(req.params.id, { role });
        }
        res.json({ message: `Role '${role}' assigned successfully to staff '${req.params.id}'` });
      } catch (err: any) {
        res.status(err.statusCode || (err.name==='ZodError'?400:500)).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  // 8. DELETE /api/v1/platform/staff/:id/roles/:role - Remove role from platform staff
  router.delete(
    "/staff/:id/roles/:role",
    createRequirePlatformPermissionGuard(platformAuthService, PLATFORM_PERMISSIONS.PLATFORM_USER_MANAGE),
    async (req: Request, res: Response) => {
      try {
        await platformAuthService.removePlatformRole(req.platformContext!, req.params.id, req.params.role);
        res.json({ message: `Role '${req.params.role}' removed from staff '${req.params.id}'` });
      } catch (err: any) {
        res.status(err.statusCode || (err.name==='ZodError'?400:500)).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  return router;
}
