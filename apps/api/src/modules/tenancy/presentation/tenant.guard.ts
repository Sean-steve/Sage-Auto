import { InMemoryPlatformMembershipRepository, InMemoryPlatformRoleRepository } from "@carhire/database";
// ============================================================================
// CAR HIRE OS — TENANT CONTEXT GUARD & MIDDLEWARE (DEV-004, DEV-007)
// Validates untrusted X-Tenant-ID header and injects trusted TenantContext.
// ============================================================================

import { Request, Response, NextFunction } from "express";
import { ERROR_CODES } from "@carhire/constants";
import type { TrustedTenantContext } from "../application/context/tenant-context.interface";
import type { TenantContextResolverService } from "../application/context/tenant-context-resolver.service";

declare global {
  namespace Express {
    interface Request {
      tenantContext?: TrustedTenantContext;
    }
  }
}

export function createTenantGuard(resolverService: TenantContextResolverService) {
  return async function requireTenantContext(req: Request, res: Response, next: NextFunction): Promise<void> {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();

    if (!req.auth || !req.auth.userId) {
      res.status(401).json({
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: "Authentication required before establishing tenant context.",
          requestId,
        },
      });
      return;
    }

    const untrustedTenantId = req.headers["x-tenant-id"] as string | undefined;

    if (!untrustedTenantId || untrustedTenantId.trim() === "") {
      res.status(400).json({
        error: {
          code: ERROR_CODES.TENANT_REQUIRED,
          message: "Missing 'X-Tenant-ID' request header. A valid tenant context is required for this operation.",
          requestId,
        },
      });
      return;
    }

    try {
      const supportSessionId = (req.headers["x-support-session-id"] as string) || undefined;
      if(supportSessionId) {
        const staff=await new InMemoryPlatformMembershipRepository().findByUserId(req.auth.userId);
        const permissions=staff?await new InMemoryPlatformRoleRepository().getPermissionsForStaff(staff.id):[];
        if(!staff || staff.status!=='ACTIVE' || !permissions.includes('platform.support.session_start')) throw Object.assign(new Error('Current support permission required'),{statusCode:403});
        if(!['GET','HEAD'].includes(req.method)) throw Object.assign(new Error('Support sessions are read-only'),{statusCode:403});
      }


      const context = await resolverService.resolveContext(req.auth.userId, untrustedTenantId, {
        supportAccessSessionId: supportSessionId,
        platformBypass: false,
      });

      req.tenantContext = context;
      (req as any).tenantId = context.tenantId;
      (req as any).tenant = {
        id: context.tenantId,
        slug: context.tenantSlug,
        name: context.tenantName,
        status: context.tenantStatus,
        currency: context.currency,
        timezone: context.timezone,
      };
      next();
    } catch (err: any) {
      const statusCode = err.statusCode || 403;
      const code = err.code || ERROR_CODES.TENANT_ACCESS_DENIED;

      res.status(statusCode).json({
        error: {
          code,
          message: err.message || "Failed to resolve tenant context",
          requestId,
        },
      });
    }
  };
}
