// ============================================================================
// CAR HIRE OS — DOMAINS PRESENTATION CONTROLLERS (ARCH-001, TEN-001, DEV-008)
// Tenant-Admin Domain Management & Public Host Resolution Endpoints
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { PERMISSIONS } from "@car-hire-os/constants";
import { DomainService } from "../application/domain.service";
import { HostResolutionService } from "../application/host-resolution.service";
import { WebsiteDomainError } from "../../website/domain/website.errors";
import { DomainRoutingError } from "../domain/domain.errors";

// Helper to resolve tenant ID securely from authenticated session
function getTenantId(req: Request): string {
  const tenantId = (req as any).tenantContext?.tenantId || (req as any).tenantId || (req as any).user?.tenantId;
  if (!tenantId) {
    throw new DomainRoutingError("Authenticated tenant context is required.", "TENANT_REQUIRED", 401);
  }
  return tenantId;
}

// Global error mapper for domain routes
function handleDomainError(err: any, res: Response): void {
  if (err instanceof WebsiteDomainError || err instanceof DomainRoutingError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: err.message || "An unexpected error occurred in domain management.",
    },
  });
}

/**
 * Creates Tenant Admin Domain Controller
 * Mounted at `/api/v1/tenant/domains`
 */
export function createTenantDomainController(
  domainService: DomainService,
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  const guard = permissionGuard || ((_perm: string) => (_req: Request, _res: Response, next: NextFunction) => next());

  // GET / - List all domains for website
  router.get(
    "/",
    guard(PERMISSIONS.WEBSITE_DOMAIN_READ || "website.domain.read"),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const websiteId = req.query.websiteId as string;
        if (!websiteId) {
          return res.status(400).json({ error: { code: "WEBSITE_ID_REQUIRED", message: "Query param websiteId is required." } });
        }
        const domains = await domainService.listDomains(tenantId, websiteId);
        return res.json({ data: domains });
      } catch (err) {
        return handleDomainError(err, res);
      }
    }
  );

  // POST / - Register a new custom domain
  router.post(
    "/",
    guard(PERMISSIONS.WEBSITE_DOMAIN_MANAGE || "website.domain.manage"),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const { websiteId, hostname } = req.body;
        if (!websiteId || !hostname) {
          return res.status(400).json({
            error: {
              code: "VALIDATION_FAILED",
              message: "Fields 'websiteId' and 'hostname' are required.",
            },
          });
        }
        const domain = await domainService.registerCustomDomain(tenantId, websiteId, hostname);
        return res.status(201).json({ data: domain });
      } catch (err) {
        return handleDomainError(err, res);
      }
    }
  );

  // POST /:domainId/verify - Trigger DNS verification
  router.post(
    "/:domainId/verify",
    guard(PERMISSIONS.WEBSITE_DOMAIN_MANAGE || "website.domain.manage"),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const { domainId } = req.params;
        const { simulate, simulateSuccess, failureReason } = req.body || {};
        const verified = await domainService.verifyCustomDomain(tenantId, domainId, {
          simulate,
          simulateSuccess,
          failureReason,
        });
        return res.json({ data: verified });
      } catch (err) {
        return handleDomainError(err, res);
      }
    }
  );

  // POST /:domainId/set-primary - Set domain as primary
  router.post(
    "/:domainId/set-primary",
    guard(PERMISSIONS.WEBSITE_DOMAIN_MANAGE || "website.domain.manage"),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const { domainId } = req.params;
        const updated = await domainService.setPrimaryDomain(tenantId, domainId);
        return res.json({ data: updated });
      } catch (err) {
        return handleDomainError(err, res);
      }
    }
  );

  // DELETE /:domainId - Remove custom domain
  router.delete(
    "/:domainId",
    guard(PERMISSIONS.WEBSITE_DOMAIN_MANAGE || "website.domain.manage"),
    async (req: Request, res: Response) => {
      try {
        const tenantId = getTenantId(req);
        const { domainId } = req.params;
        await domainService.removeDomain(tenantId, domainId);
        return res.json({ success: true, message: "Custom domain successfully removed." });
      } catch (err) {
        return handleDomainError(err, res);
      }
    }
  );

  return router;
}

/**
 * Creates Public Host Resolution Controller
 * Mounted at `/api/v1/public/domains`
 */
export function createPublicResolutionController(
  hostResolutionService: HostResolutionService
): Router {
  const router = Router();

  // GET /resolve - Resolves incoming request Host header to PublicWebsiteContext
  router.get("/resolve", async (req: Request, res: Response) => {
    try {
      // Prioritize query param 'host' for testing/debugging, otherwise use actual request headers
      const hostParam = req.query.host as string;
      const context = await hostResolutionService.resolve(
        hostParam
          ? hostParam
          : {
              headers: req.headers as Record<string, string | string[] | undefined>,
              ip: req.ip,
            }
      );
      return res.json({ data: context });
    } catch (err) {
      return handleDomainError(err, res);
    }
  });

  // GET /health - Edge health check for routing
  router.get("/health", (_req: Request, res: Response) => {
    return res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  return router;
}
