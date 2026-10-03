// ============================================================================
// CAR HIRE OS — REQUIRE PERMISSION GUARD / MIDDLEWARE (DEV-005 §35, DEV-007)
// Express middleware that validates the caller possesses the required permission.
// ============================================================================

import { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "@carhire/constants";
import type { AuthorizationService } from "../../application/services/authorization.service";
import type { ResourcePolicy } from "../../domain/policies/resource-policy.interface";

export function createRequirePermissionGuard(
  authzService: AuthorizationService,
  requiredPermission: string,
  resourceResolver?: (req: Request) => any,
  policy?: ResourcePolicy<any, any>
) {
  return async function requirePermission(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();

    if (!req.tenantContext) {
      res.status(403).json({
        error: {
          code: ERROR_CODES.INVALID_TENANT_CONTEXT,
          message: "Trusted tenant context is required before checking authorization permissions.",
          requestId,
        },
      });
      return;
    }

    try {
      const resource = resourceResolver ? resourceResolver(req) : undefined;
      await authzService.require(req.tenantContext, requiredPermission, resource, policy);
      next();
    } catch (err: any) {
      const statusCode = err.statusCode || 403;
      const code = err.code || ERROR_CODES.PERMISSION_DENIED;

      res.status(statusCode).json({
        error: {
          code,
          message: err.message || `Permission denied: '${requiredPermission}' required.`,
          requestId,
          details: err.details,
        },
      });
    }
  };
}
