import { Router, Request, Response, NextFunction } from "express";
import { TenantWebsiteService } from "../application/tenant-website.service";
import { TENANT_PERMISSIONS } from "@car-hire-os/constants";

export function createTenantWebsiteController(
  websiteService: TenantWebsiteService,
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  const guard = (perm: string) =>
    permissionGuard
      ? permissionGuard(perm)
      : (_req: Request, _res: Response, next: NextFunction) => next();

  const getActorId = (req: Request): string => {
    const auth = (req as any).auth;
    const user = (req as any).user;
    const userId = auth?.userId || user?.id || user?.sub;
    if (!userId) {
      const err: any = new Error("Unauthorized: Valid authentication required.");
      err.statusCode = 401;
      throw err;
    }
    return userId;
  };

  const getTenantId = (req: Request): string => {
    const ctx = (req as any).tenantContext;
    const tenantId = ctx?.tenantId;
    if (!tenantId) {
      const err: any = new Error("Forbidden: Missing or unverified tenant context.");
      err.statusCode = 403;
      throw err;
    }
    return tenantId;
  };

  // 1. Get Tenant Website Config
  router.get("/", guard(TENANT_PERMISSIONS.WEBSITE_READ), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const site = await websiteService.getWebsite(tenantId);
      res.json({ success: true, data: site });
    } catch (err) {
      next(err);
    }
  });

  // 2. Initialize Website
  router.post("/init", guard(TENANT_PERMISSIONS.WEBSITE_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const { subdomain, branding } = req.body;
      const site = await websiteService.initializeWebsite(tenantId, subdomain, branding);
      res.status(201).json({ success: true, data: site });
    } catch (err) {
      next(err);
    }
  });

  // 3. Update Branding
  router.put("/branding", guard(TENANT_PERMISSIONS.WEBSITE_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const site = await websiteService.updateBranding(tenantId, req.body.branding || req.body);
      res.json({ success: true, data: site });
    } catch (err) {
      next(err);
    }
  });

  // 4. Update Navigation
  router.put("/navigation", guard(TENANT_PERMISSIONS.WEBSITE_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const site = await websiteService.updateNavigation(tenantId, req.body.navigation || req.body);
      res.json({ success: true, data: site });
    } catch (err) {
      next(err);
    }
  });

  // 5. Pages Management
  router.get("/pages", guard(TENANT_PERMISSIONS.WEBSITE_READ), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const pages = await websiteService.listPages(tenantId);
      res.json({ success: true, data: pages });
    } catch (err) {
      next(err);
    }
  });

  router.post("/pages", guard(TENANT_PERMISSIONS.WEBSITE_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const page = await websiteService.createPage(tenantId, req.body);
      res.status(201).json({ success: true, data: page });
    } catch (err) {
      next(err);
    }
  });

  router.get("/pages/:pageId", guard(TENANT_PERMISSIONS.WEBSITE_READ), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const page = await websiteService.getPage(tenantId, req.params.pageId);
      res.json({ success: true, data: page });
    } catch (err) {
      next(err);
    }
  });

  router.put("/pages/:pageId", guard(TENANT_PERMISSIONS.WEBSITE_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const page = await websiteService.updatePage(tenantId, req.params.pageId, req.body);
      res.json({ success: true, data: page });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/pages/:pageId", guard(TENANT_PERMISSIONS.WEBSITE_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      await websiteService.deletePage(tenantId, req.params.pageId);
      res.json({ success: true, message: "Page deleted successfully" });
    } catch (err) {
      next(err);
    }
  });

  // 6. Publishing & Maintenance
  router.post("/publish", guard(TENANT_PERMISSIONS.WEBSITE_PUBLISH), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const actorId = getActorId(req);
      const snapshot = await websiteService.publishWebsite(tenantId, actorId, req.body.changeSummary);
      res.json({ success: true, data: snapshot });
    } catch (err) {
      next(err);
    }
  });

  router.post("/unpublish", guard(TENANT_PERMISSIONS.WEBSITE_PUBLISH), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const site = await websiteService.unpublishWebsite(tenantId);
      res.json({ success: true, data: site });
    } catch (err) {
      next(err);
    }
  });

  router.post("/maintenance", guard(TENANT_PERMISSIONS.WEBSITE_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const { enabled, maintenanceMessage } = req.body;
      const site = await websiteService.toggleMaintenanceMode(tenantId, enabled, maintenanceMessage);
      res.json({ success: true, data: site });
    } catch (err) {
      next(err);
    }
  });

  router.post("/rollback", guard(TENANT_PERMISSIONS.WEBSITE_PUBLISH), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const actorId = getActorId(req);
      const { targetVersionNumber } = req.body;
      const snapshot = await websiteService.rollbackWebsite(tenantId, targetVersionNumber, actorId);
      res.json({ success: true, data: snapshot });
    } catch (err) {
      next(err);
    }
  });

  router.get("/snapshots", guard(TENANT_PERMISSIONS.WEBSITE_READ), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const snapshots = await websiteService.listSnapshots(tenantId);
      res.json({ success: true, data: snapshots });
    } catch (err) {
      next(err);
    }
  });

  // 7. Domain Management
  router.get("/domains", guard(TENANT_PERMISSIONS.WEBSITE_READ), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const domains = await websiteService.listDomains(tenantId);
      res.json({ success: true, data: domains });
    } catch (err) {
      next(err);
    }
  });

  router.post("/domains", guard(TENANT_PERMISSIONS.WEBSITE_DOMAIN_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const { hostname } = req.body;
      const domain = await websiteService.registerDomain(tenantId, hostname);
      res.status(201).json({ success: true, data: domain });
    } catch (err) {
      next(err);
    }
  });

  router.post("/domains/:domainId/verify", guard(TENANT_PERMISSIONS.WEBSITE_DOMAIN_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      const { simulateSuccess = true } = req.body;
      const domain = await websiteService.verifyDomain(tenantId, req.params.domainId, simulateSuccess);
      res.json({ success: true, data: domain });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/domains/:domainId", guard(TENANT_PERMISSIONS.WEBSITE_DOMAIN_MANAGE), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = getTenantId(req);
      await websiteService.removeDomain(tenantId, req.params.domainId);
      res.json({ success: true, message: "Custom domain removed successfully" });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
