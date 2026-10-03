import { InMemoryPlatformMembershipRepository } from "@carhire/database";
// ============================================================================
// CAR HIRE OS — PLATFORM PERMISSION GUARD (DEV-005 §9, §21)
// Protects platform control-plane endpoints.
// ============================================================================

import { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "@carhire/constants";
import type { PlatformAuthorizationService } from "../../application/services/platform-authorization.service";
import type { PlatformAuthorizationContext } from "@carhire/types";

declare global {
  namespace Express {
    interface Request {
      platformContext?: PlatformAuthorizationContext;
    }
  }
}

export function createRequirePlatformPermissionGuard(
  platformAuthService: PlatformAuthorizationService,
  requiredPlatformPermission: string
) {
  return async function requirePlatformPermission(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();

    if (!req.auth || !req.auth.userId) {
      res.status(401).json({
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: "Platform authentication required.",
          requestId,
        },
      });
      return;
    }

    if (!req.auth.isPlatformStaff) {
      res.status(403).json({
        error: {
          code: ERROR_CODES.PLATFORM_PERMISSION_DENIED,
          message: "Caller is not a registered platform staff member.",
          requestId,
        },
      });
      return;
    }

    try {
      // Resolve platform context
      const membership = await new InMemoryPlatformMembershipRepository().findByUserId(req.auth.userId);
      if (!membership || membership.status !== "ACTIVE") throw Object.assign(new Error("Active platform membership required"), {statusCode:403});
      const platformMembershipId = membership.id;
      const platformContext = await platformAuthService.resolvePlatformPermissions(
        platformMembershipId,
        req.auth.userId,
        requestId
      );

      platformAuthService.require(platformContext, requiredPlatformPermission);
      req.platformContext = platformContext;
      next();
    } catch (err: any) {
      const statusCode = err.statusCode || 403;
      const code = err.code || ERROR_CODES.PLATFORM_PERMISSION_DENIED;

      res.status(statusCode).json({
        error: {
          code,
          message: err.message || `Platform permission denied: '${requiredPlatformPermission}' required.`,
          requestId,
          details: err.details,
        },
      });
    }
  };
}
