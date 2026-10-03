// ============================================================================
// CAR HIRE OS — DRIVERS CONTROLLER (DEV-004, DOM-001, SEC-005)
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { DriversService } from "../application/drivers.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";

export function createDriversController(
  driversService: DriversService,
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

  const getActor = (req: Request): { actorId: string; actorName: string } => {
    const auth = (req as any).auth;
    const user = (req as any).user;
    const actorId = auth?.userId || user?.id || user?.sub;
    if (!actorId) {
      const err: any = new Error("Unauthorized: Valid authentication required.");
      err.statusCode = 401;
      throw err;
    }
    const actorName = user?.fullName || user?.name || "Operations Staff";
    return { actorId, actorName };
  };

  // List Drivers
  router.get(
    "/",
    permissionGuard(TENANT_PERMISSIONS.DRIVER_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const result = await driversService.listDrivers(tenantId, req.query);
        res.json({ success: true, data: result.drivers, total: result.total });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get Driver by ID
  router.get(
    "/:id",
    permissionGuard(TENANT_PERMISSIONS.DRIVER_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const details = await driversService.getDriverDetails(req.params.id, tenantId);
        res.json({ success: true, data: details });
      } catch (err) {
        next(err);
      }
    }
  );

  // Create Driver
  router.post(
    "/",
    permissionGuard(TENANT_PERMISSIONS.DRIVER_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req);
        const driver = await driversService.createDriver(tenantId, req.body, actorId, actorName);
        res.status(201).json({ success: true, data: driver });
      } catch (err) {
        next(err);
      }
    }
  );

  // Update Driver
  router.put(
    "/:id",
    permissionGuard(TENANT_PERMISSIONS.DRIVER_UPDATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId } = getActor(req);
        const updated = await driversService.updateDriver(req.params.id, tenantId, req.body, actorId);
        res.json({ success: true, data: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  // Change Driver Status
  router.patch(
    "/:id/status",
    permissionGuard(TENANT_PERMISSIONS.DRIVER_UPDATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req);
        const updated = await driversService.changeStatus(req.params.id, tenantId, req.body, actorId, actorName);
        res.json({ success: true, data: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  // Verify Driver
  router.patch(
    "/:id/verify",
    permissionGuard(TENANT_PERMISSIONS.DRIVER_UPDATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId } = getActor(req);
        const updated = await driversService.verifyDriver(req.params.id, tenantId, req.body, actorId);
        res.json({ success: true, data: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
