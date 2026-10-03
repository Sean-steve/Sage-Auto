// ============================================================================
// CAR HIRE OS — CORPORATE ACCOUNTS CONTROLLER (DEV-004, DOM-001, SEC-005)
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { CorporateAccountsService } from "../application/corporate-accounts.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";

export function createCorporateAccountsController(
  corporateService: CorporateAccountsService,
  permissionGuard: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();

  const getTenantId = (req: Request): string => {
    const tid = (req as any).tenantContext?.tenantId || (req as any).tenantId;
    if (!tid) {
      const err: any = new Error("Forbidden: Missing or unverified tenant context.");
      err.statusCode = 403;
      throw err;
    }
    return tid;
  };

  const getActorId = (req: Request): string => {
    const auth = (req as any).auth;
    const user = (req as any).user;
    const actorId = auth?.userId || user?.id || user?.sub;
    if (!actorId) {
      const err: any = new Error("Unauthorized: Valid authentication required.");
      err.statusCode = 401;
      throw err;
    }
    return actorId;
  };

  // List Corporate Accounts
  router.get(
    "/",
    permissionGuard(TENANT_PERMISSIONS.CUSTOMER_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const result = await corporateService.listAccounts(tenantId, req.query);
        res.json({ success: true, data: result.accounts, total: result.total });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get Account Details
  router.get(
    "/:id",
    permissionGuard(TENANT_PERMISSIONS.CUSTOMER_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const account = await corporateService.getAccount(req.params.id, tenantId);
        const authorizedDrivers = await corporateService.listAuthorizedDrivers(req.params.id, tenantId);
        res.json({ success: true, data: { ...account, authorizedDrivers } });
      } catch (err) {
        next(err);
      }
    }
  );

  // Create Corporate Account
  router.post(
    "/",
    permissionGuard(TENANT_PERMISSIONS.CUSTOMER_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const account = await corporateService.createAccount(tenantId, req.body, actorId);
        res.status(201).json({ success: true, data: account });
      } catch (err) {
        next(err);
      }
    }
  );

  // Update Corporate Account
  router.put(
    "/:id",
    permissionGuard(TENANT_PERMISSIONS.CUSTOMER_UPDATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const updated = await corporateService.updateAccount(req.params.id, tenantId, req.body, actorId);
        res.json({ success: true, data: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  // Authorize Driver for Corporate Account
  router.post(
    "/:id/authorized-drivers",
    permissionGuard(TENANT_PERMISSIONS.CUSTOMER_UPDATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const entry = await corporateService.authorizeDriver(req.params.id, tenantId, req.body, actorId);
        res.status(201).json({ success: true, data: entry });
      } catch (err) {
        next(err);
      }
    }
  );

  // Revoke Authorized Driver
  router.delete(
    "/:id/authorized-drivers/:authId",
    permissionGuard(TENANT_PERMISSIONS.CUSTOMER_UPDATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        await corporateService.revokeAuthorizedDriver(req.params.id, req.params.authId, tenantId, actorId);
        res.json({ success: true });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
