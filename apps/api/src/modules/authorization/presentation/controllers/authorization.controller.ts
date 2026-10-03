// ============================================================================
// CAR HIRE OS — AUTHORIZATION ME CONTROLLER (DEV-005 §43, DEV-007)
// Exposes server-authoritative effective permissions and roles to frontend.
// ============================================================================

import { Router, Request, Response } from "express";
import type { AuthorizationService } from "../../application/services/authorization.service";

export function createAuthorizationController(authzService: AuthorizationService): Router {
  const router = Router();

  /**
   * GET /api/v1/authorization/me
   * Returns current active membership effective permissions and assigned roles.
   */
  router.get("/authorization/me", async (req: Request, res: Response) => {
    if (!req.tenantContext) {
      res.status(403).json({
        error: { code: "TENANT_REQUIRED", message: "Tenant context is required to resolve authorization profile." },
      });
      return;
    }

    const { tenantId, membershipId, userId } = req.tenantContext;
    const isPlatformStaff = Boolean(req.auth?.isPlatformStaff);

    const authz = await authzService.getEffectiveAuthorization(tenantId, membershipId, userId, isPlatformStaff);
    res.json({ data: authz });
  });

  return router;
}
