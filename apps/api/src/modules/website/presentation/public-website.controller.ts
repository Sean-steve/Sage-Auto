import { Router, Request, Response, NextFunction } from "express";
import { PublicWebsiteService } from "../application/public-website.service";

export function createPublicWebsiteController(
  publicWebsiteService: PublicWebsiteService
): Router {
  const router = Router();

  // 1. Resolve Storefront by Host or Query
  router.get("/resolve", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const host =
        (req.query.host as string) ||
        (req.query.subdomain as string) ||
        (req.headers["x-forwarded-host"] as string) ||
        req.headers.host ||
        "apex";
      const resolved = await publicWebsiteService.resolveByHost(host);
      res.json({ success: true, data: resolved });
    } catch (err) {
      next(err);
    }
  });

  // 2. Get Published Page Content
  router.get("/pages/:slug(*)", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req.query.tenantId as string) || (req.headers["x-tenant-id"] as string);
      if (!tenantId) {
        return res.status(400).json({ error: "Missing required tenantId query or header" });
      }
      const rawSlug = req.params.slug || "/";
      const page = await publicWebsiteService.getPublishedPage(tenantId, rawSlug);
      res.json({ success: true, data: page });
    } catch (err) {
      next(err);
    }
  });

  // 3. Public Vehicle Catalogue (Rentable Only)
  router.get("/catalogue", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req.query.tenantId as string) || (req.headers["x-tenant-id"] as string);
      if (!tenantId) {
        return res.status(400).json({ error: "Missing required tenantId query or header" });
      }
      const category = req.query.category as string | undefined;
      const vehicles = await publicWebsiteService.getPublicCatalogue(tenantId, category);
      res.json({ success: true, data: vehicles });
    } catch (err) {
      next(err);
    }
  });

  // 4. Sitemap.xml
  router.get("/sitemap.xml", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req.query.tenantId as string) || (req.headers["x-tenant-id"] as string);
      if (!tenantId) {
        return res.status(400).type("text/plain").send("Missing tenantId");
      }
      const host = (req.headers.host as string) || "https://carhireos.com";
      const sitemap = await publicWebsiteService.generateSitemapXml(tenantId, `https://${host}`);
      res.type("application/xml").send(sitemap);
    } catch (err) {
      next(err);
    }
  });

  // 5. Robots.txt
  router.get("/robots.txt", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req.query.tenantId as string) || (req.headers["x-tenant-id"] as string);
      if (!tenantId) {
        return res.type("text/plain").send("User-agent: *\nDisallow: /");
      }
      const host = (req.headers.host as string) || "https://carhireos.com";
      const robots = await publicWebsiteService.generateRobotsTxt(tenantId, `https://${host}`);
      res.type("text/plain").send(robots);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
