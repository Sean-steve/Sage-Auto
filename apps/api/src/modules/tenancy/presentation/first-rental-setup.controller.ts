import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { AuditRepository, withRecordTransaction } from "@carhire/database";
import { FirstRentalSetupService } from "../application/services/first-rental-setup.service";

const visibilitySchema = z.object({
  action: z.enum(["DISMISS", "RESTORE"]),
}).strict();

/**
 * Mounted behind authGuard + tenantGuard at /api/v1/tenant/setup-status.
 * The X-Tenant-ID request header is not trusted here: only tenantContext,
 * resolved from the authenticated membership, is used.
 */
export function createFirstRentalSetupRouter(service = new FirstRentalSetupService()): Router {
  const router = Router();
  const auditors = new AuditRepository();

  function requireCompanyManager(req: Request, res: Response, next: NextFunction) {
    if (!req.auth?.userId || !req.tenantContext?.tenantId) {
      res.status(403).json({ error: { code: "TENANT_ACCESS_DENIED", message: "Verified company context required." } });
      return;
    }
    const roles = req.tenantContext.roles || [];
    if (!roles.some(role => role === "COMPANY_OWNER" || role === "TENANT_ADMIN")) {
      res.status(403).json({ error: { code: "INSUFFICIENT_PERMISSION", message: "Company owner or tenant administrator access required." } });
      return;
    }
    next();
  }

  router.use(requireCompanyManager);

  router.get("/", async (req, res, next) => {
    try {
      res.json({ data: await service.getStatus(req.tenantContext!.tenantId) });
    } catch (error) { next(error); }
  });

  router.post("/visibility", async (req, res, next) => {
    try {
      const { action } = visibilitySchema.parse(req.body);
      const tenantId = req.tenantContext!.tenantId;
      const changed = await withRecordTransaction(async () => {
        const didChange = service.changeVisibility(tenantId, action);
        if (didChange) {
          await auditors.record({
            tenantId, actorType: "USER", actorId: req.auth!.userId,
            action: action === "DISMISS" ? "tenant.first_rental_setup.dismissed" : "tenant.first_rental_setup.restored",
            resourceType: "TenantFirstRentalSetup", resourceId: tenantId,
            metadata: { action },
          });
        }
        return didChange;
      });
      // An idempotent repeat must not produce duplicate audit entries.
      res.json({ data: { ...(await service.getStatus(tenantId)), changed } });
    } catch (error) { next(error); }
  });

  return router;
}
