// ============================================================================
// CAR HIRE OS — FLEET HTTP CONTROLLER (DEV-004, DOM-001)
// Protected Fleet REST endpoints with RBAC & Entitlement enforcement
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { FleetService } from "../application/fleet.service";
import type { RequestHandler } from "express";

export function createFleetController(
  fleetService: FleetService,
  permissionGuard?: (perm: string) => RequestHandler
): Router {
  const router = Router();
  const guard = permissionGuard || (() => (_req: Request, _res: Response, next: NextFunction) => next());

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
    const actorName = user?.fullName || user?.name || "Operations Manager";
    return { actorId, actorName };
  };

  // GET /api/v1/fleet/vehicles - List Vehicles
  router.get(
    "/vehicles",
    guard("vehicle.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { lifecycleStatus, availabilityStatus, category, ownerId, search, isPublishedToWebsite, page, limit } = req.query;
        
        const result = await fleetService.listVehicles(tenantId, {
          lifecycleStatus: lifecycleStatus as any,
          availabilityStatus: availabilityStatus as any,
          category: category as string,
          ownerId: ownerId as string,
          search: search as string,
          isPublishedToWebsite: isPublishedToWebsite !== undefined ? isPublishedToWebsite === "true" : undefined,
          page: page ? parseInt(page as string, 10) : 1,
          limit: limit ? parseInt(limit as string, 10) : 50,
        });

        res.json({
          status: "success",
          data: result.vehicles,
          meta: {
            total: result.total,
            page: page ? parseInt(page as string, 10) : 1,
            limit: limit ? parseInt(limit as string, 10) : 50,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/v1/fleet/vehicles - Register New Vehicle (Quota checked)
  router.post(
    "/vehicles",
    guard("vehicle.create"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req);

        const vehicle = await fleetService.createVehicle(
          tenantId,
          req.body,
          actorId,
          actorName
        );

        res.status(201).json({
          status: "success",
          data: vehicle,
          message: `Vehicle ${vehicle.registrationPlate} registered successfully.`,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/v1/fleet/vehicles/:id - Get Vehicle
  router.get(
    "/vehicles/:id",
    guard("vehicle.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const vehicle = await fleetService.getVehicle(tenantId, req.params.id);
        res.json({ status: "success", data: vehicle });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/v1/fleet/vehicles/:id/digital-twin - Get Complete Digital Twin
  router.get(
    "/vehicles/:id/digital-twin",
    guard("vehicle.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const twin = await fleetService.getVehicleDigitalTwin(tenantId, req.params.id);
        res.json({ status: "success", data: twin });
      } catch (err) {
        next(err);
      }
    }
  );

  // PATCH /api/v1/fleet/vehicles/:id - Update Vehicle
  router.patch(
    "/vehicles/:id",
    guard("vehicle.update"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req);

        const updated = await fleetService.updateVehicle(
          tenantId,
          req.params.id,
          req.body,
          actorId,
          actorName
        );

        res.json({
          status: "success",
          data: updated,
          message: "Vehicle updated successfully.",
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/v1/fleet/vehicles/:id/lifecycle-status - Change Lifecycle Status
  router.post(
    "/vehicles/:id/lifecycle-status",
    guard("vehicle.status_override"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req);

        const updated = await fleetService.changeLifecycleStatus(
          tenantId,
          req.params.id,
          req.body,
          actorId,
          actorName
        );

        res.json({
          status: "success",
          data: updated,
          message: `Vehicle lifecycle status transitioned to ${updated.lifecycleStatus}.`,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/v1/fleet/vehicles/:id/availability-status - Change Availability Status
  router.post(
    "/vehicles/:id/availability-status",
    guard("vehicle.status_override"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req);

        const updated = await fleetService.changeAvailabilityStatus(
          tenantId,
          req.params.id,
          req.body,
          actorId,
          actorName
        );

        res.json({
          status: "success",
          data: updated,
          message: `Vehicle availability status updated to ${updated.availabilityStatus}.`,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/v1/fleet/vehicles/:id/mileage - Record Mileage
  router.post(
    "/vehicles/:id/mileage",
    guard("vehicle.update"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req);

        const record = await fleetService.recordMileage(
          tenantId,
          req.params.id,
          req.body,
          actorId,
          actorName
        );

        res.status(201).json({
          status: "success",
          data: record,
          message: `Recorded vehicle odometer at ${record.recordedMileage} km.`,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/v1/fleet/vehicles/:id/fuel - Record Fuel Level
  router.post(
    "/vehicles/:id/fuel",
    guard("vehicle.update"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorName } = getActor(req);

        const record = await fleetService.recordFuel(
          tenantId,
          req.params.id,
          req.body.fuelLevel,
          req.body.litersAdded,
          req.body.cost,
          req.body.source,
          actorName
        );

        res.status(201).json({
          status: "success",
          data: record,
          message: `Recorded vehicle fuel level at ${record.fuelLevelPercent}%.`,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET & POST /api/v1/fleet/vehicles/:id/documents - Vehicle Documents
  router.get(
    "/vehicles/:id/documents",
    guard("vehicle.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const docs = await fleetService.listDocuments(tenantId, req.params.id);
        res.json({ status: "success", data: docs });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/vehicles/:id/documents",
    guard("vehicle.update"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId } = getActor(req);

        const doc = await fleetService.addDocument(
          tenantId,
          req.params.id,
          req.body,
          actorId
        );

        res.status(201).json({
          status: "success",
          data: doc,
          message: "Vehicle document attached successfully.",
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/v1/fleet/categories - List Categories
  router.get(
    "/categories",
    guard("vehicle.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const categories = await fleetService.listCategories(tenantId);
        res.json({ status: "success", data: categories });
      } catch (err) {
        next(err);
      }
    }
  );

  // DELETE /api/v1/fleet/vehicles/:id - Delete Vehicle
  router.delete(
    "/vehicles/:id",
    guard("vehicle.delete"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req);

        await fleetService.deleteVehicle(tenantId, req.params.id, actorId, actorName);
        res.json({ status: "success", message: "Vehicle deleted successfully." });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
