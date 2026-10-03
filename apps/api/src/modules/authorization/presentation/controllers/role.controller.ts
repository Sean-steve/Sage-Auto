// ============================================================================
// CAR HIRE OS — ROLE MANAGEMENT CONTROLLER (DEV-005 §37, DEV-007)
// REST endpoints for tenant role CRUD, permission discovery, and member assignments.
// ============================================================================

import { Router, Request, Response } from "express";
import { ALL_PERMISSION_DEFINITIONS, TENANT_PERMISSIONS } from "@carhire/constants";
import type { RoleManagementService } from "../../application/services/role-management.service";
import type { AuthorizationService } from "../../application/services/authorization.service";
import { createRequirePermissionGuard } from "../guards/require-permission.guard";

export function createRoleController(
  roleManagementService: RoleManagementService,
  authzService: AuthorizationService
): Router {
  const router = Router();

  // 1. GET /api/v1/permissions - List available tenant permissions metadata
  router.get(
    "/permissions",
    createRequirePermissionGuard(authzService, TENANT_PERMISSIONS.ROLE_READ),
    async (req: Request, res: Response) => {
      const tenantPerms = ALL_PERMISSION_DEFINITIONS.filter((p) => p.scope === "TENANT");
      res.json({
        data: tenantPerms,
        total: tenantPerms.length,
      });
    }
  );

  // 2. GET /api/v1/roles - List system and custom roles for tenant
  router.get(
    "/roles",
    createRequirePermissionGuard(authzService, TENANT_PERMISSIONS.ROLE_READ),
    async (req: Request, res: Response) => {
      const roles = await roleManagementService.listRoles(req.tenantContext!);
      res.json({
        data: roles,
        total: roles.length,
      });
    }
  );

  // 3. GET /api/v1/roles/:id - Get role details
  router.get(
    "/roles/:id",
    createRequirePermissionGuard(authzService, TENANT_PERMISSIONS.ROLE_READ),
    async (req: Request, res: Response) => {
      try {
        const role = await roleManagementService.getRole(req.tenantContext!, req.params.id);
        res.json({ data: role });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  // 4. POST /api/v1/roles - Create custom role
  router.post(
    "/roles",
    createRequirePermissionGuard(authzService, TENANT_PERMISSIONS.ROLE_CREATE),
    async (req: Request, res: Response) => {
      try {
        const role = await roleManagementService.createCustomRole(req.tenantContext!, req.body);
        res.status(201).json({ data: role });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  // 5. PATCH /api/v1/roles/:id - Update custom role
  router.patch(
    "/roles/:id",
    createRequirePermissionGuard(authzService, TENANT_PERMISSIONS.ROLE_UPDATE),
    async (req: Request, res: Response) => {
      try {
        const role = await roleManagementService.updateRole(req.tenantContext!, req.params.id, req.body);
        res.json({ data: role });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  // 6. DELETE /api/v1/roles/:id - Delete custom role
  router.delete(
    "/roles/:id",
    createRequirePermissionGuard(authzService, TENANT_PERMISSIONS.ROLE_DELETE),
    async (req: Request, res: Response) => {
      try {
        await roleManagementService.deleteRole(req.tenantContext!, req.params.id);
        res.json({ success: true, message: "Role deleted successfully" });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  // 7. POST /api/v1/memberships/:membershipId/roles - Assign role to member
  router.post(
    "/memberships/:membershipId/roles",
    createRequirePermissionGuard(authzService, TENANT_PERMISSIONS.ROLE_ASSIGN),
    async (req: Request, res: Response) => {
      try {
        await roleManagementService.assignRoleToMember(
          req.tenantContext!,
          req.params.membershipId,
          req.body.roleId
        );
        res.status(201).json({ success: true, message: "Role assigned to membership successfully" });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  // 8. DELETE /api/v1/memberships/:membershipId/roles/:roleId - Remove role from member
  router.delete(
    "/memberships/:membershipId/roles/:roleId",
    createRequirePermissionGuard(authzService, TENANT_PERMISSIONS.ROLE_ASSIGN),
    async (req: Request, res: Response) => {
      try {
        await roleManagementService.removeRoleFromMember(
          req.tenantContext!,
          req.params.membershipId,
          req.params.roleId
        );
        res.json({ success: true, message: "Role removed from membership successfully" });
      } catch (err: any) {
        res.status(err.statusCode || 500).json({
          error: { code: err.code || "INTERNAL_ERROR", message: err.message },
        });
      }
    }
  );

  return router;
}
