// ============================================================================
// CAR HIRE OS — ENTITLEMENT GUARD (ENT-001 §9, ARCH-004, DEV-007)
// Server-Authoritative HTTP Middleware for Feature & Limit Enforcement
// ============================================================================

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ERROR_CODES } from "@carhire/constants";
import { EntitlementService } from "../../application/entitlement.service";

export interface AuthenticatedTenantRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles?: string[];
  };
  tenantId?: string;
}

export function createEntitlementGuard(
  entitlementService: EntitlementService,
  featureKey: string,
  requiredQuantity: number = 1
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const authReq = req as AuthenticatedTenantRequest;
    const tenantId = req.tenantContext?.tenantId || authReq.tenantId;

    if (!tenantId) {
      res.status(403).json({
        error: {
          code: ERROR_CODES.TENANT_REQUIRED,
          message: "Verified tenant context required for entitlement evaluation.",
          requestId,
        },
      });
      return;
    }

    try {
      const decision = await entitlementService.check(tenantId, featureKey, requiredQuantity);

      if (!decision.allowed) {
        const httpStatus = 403;

        res.status(httpStatus).json({
          error: {
            code: decision.code || ERROR_CODES.FEATURE_NOT_INCLUDED,
            message: decision.message || `Tenant is not entitled to use feature '${featureKey}'.`,
            details: {
              feature: featureKey,
              reason: decision.reason || decision.code,
              limit: decision.limit,
              usage: decision.currentUsage,
              remaining: decision.remaining,
              source: decision.source,
              upgradeRecommended: decision.upgradeRecommended,
            },
            requestId,
          },
        });
        return;
      }

      // Feature is allowed, proceed to next handler
      next();
    } catch (err: any) {
      res.status(500).json({
        error: {
          code: "ENTITLEMENT_EVALUATION_ERROR",
          message: err.message || "Failed to evaluate entitlement.",
          requestId,
        },
      });
    }
  };
}

