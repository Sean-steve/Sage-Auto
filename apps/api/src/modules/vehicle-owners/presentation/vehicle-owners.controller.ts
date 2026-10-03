// ============================================================================
// CAR HIRE OS — VEHICLE OWNERS HTTP CONTROLLER (DEV-004, DOM-001)
// REST endpoints for asset investors and commercial revenue-share agreements
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { VehicleOwnersService } from "../application/vehicle-owners.service";
import type { RequestHandler } from "express";

export function createVehicleOwnersController(
  ownersService: VehicleOwnersService,
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

  const getActor = (req: Request, defaultRoleName = "Finance Director"): { actorId: string; actorName: string } => {
    const auth = (req as any).auth;
    const user = (req as any).user;
    const actorId = auth?.userId || user?.id || user?.sub;
    if (!actorId) {
      const err: any = new Error("Unauthorized: Valid authentication required.");
      err.statusCode = 401;
      throw err;
    }
    const actorName = user?.fullName || user?.name || defaultRoleName;
    return { actorId, actorName };
  };

  // GET /api/v1/vehicle-owners - List Owners
  router.get(
    "/",
    guard("vehicle_owner.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { status, ownershipType, search, page, limit } = req.query;

        const result = await ownersService.listOwners(tenantId, {
          status: status as any,
          ownershipType: ownershipType as any,
          search: search as string,
          page: page ? parseInt(page as string, 10) : 1,
          limit: limit ? parseInt(limit as string, 10) : 50,
        });

        res.json({
          status: "success",
          data: result.owners,
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

  // POST /api/v1/vehicle-owners - Create Owner
  router.post(
    "/",
    guard("vehicle_owner.create"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req, "Finance Director");

        const owner = await ownersService.createOwner(
          tenantId,
          req.body,
          actorId,
          actorName
        );

        res.status(201).json({
          status: "success",
          data: owner,
          message: `Vehicle owner ${owner.name} registered successfully.`,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/v1/vehicle-owners/:id - Get Owner
  router.get(
    "/:id",
    guard("vehicle_owner.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const owner = await ownersService.getOwner(tenantId, req.params.id);
        res.json({ status: "success", data: owner });
      } catch (err) {
        next(err);
      }
    }
  );

  // PATCH /api/v1/vehicle-owners/:id - Update Owner
  router.patch(
    "/:id",
    guard("vehicle_owner.update"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req, "Finance Director");

        const updated = await ownersService.updateOwner(
          tenantId,
          req.params.id,
          req.body,
          actorId,
          actorName
        );

        res.json({
          status: "success",
          data: updated,
          message: "Vehicle owner details updated.",
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/v1/vehicle-owners/:id/vehicles - Get Vehicles for Owner
  router.get(
    "/:id/vehicles",
    guard("vehicle_owner.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const vehicles = await ownersService.getOwnerVehicles(tenantId, req.params.id);
        res.json({ status: "success", data: vehicles });
      } catch (err) {
        next(err);
      }
    }
  );

  // DELETE /api/v1/vehicle-owners/:id - Delete Owner
  router.delete(
    "/:id",
    guard("vehicle_owner.delete"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req, "Director");

        await ownersService.deleteOwner(tenantId, req.params.id, actorId, actorName);
        res.json({ status: "success", message: "Vehicle owner deleted successfully." });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/v1/vehicle-owners/ownerships/assign - Assign Ownership
  router.post(
    "/ownerships/assign",
    guard("vehicle_ownership.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req, "Fleet Director");

        const ownership = await ownersService.assignOwnership(
          tenantId,
          req.body,
          actorId,
          actorName
        );

        res.status(201).json({
          status: "success",
          data: ownership,
          message: "Ownership agreement established successfully.",
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/v1/vehicle-owners/ownerships/transfer - Transfer Ownership
  router.post(
    "/ownerships/transfer",
    guard("vehicle_ownership.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req, "Fleet Director");

        const ownership = await ownersService.transferOwnership(
          tenantId,
          req.body.vehicleId,
          req.body,
          actorId,
          actorName
        );

        res.json({
          status: "success",
          data: ownership,
          message: "Ownership transferred successfully.",
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/v1/vehicle-owners/ownerships/change-terms - Renegotiate Terms
  router.post(
    "/ownerships/change-terms",
    guard("vehicle_ownership.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { actorId, actorName } = getActor(req, "Fleet Director");

        const ownership = await ownersService.changeAgreement(
          tenantId,
          req.body.vehicleId,
          req.body,
          actorId,
          actorName
        );

        res.json({
          status: "success",
          data: ownership,
          message: "Agreement terms updated successfully.",
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/v1/vehicle-owners/ownerships/vehicle/:vehicleId/history - History
  router.get(
    "/ownerships/vehicle/:vehicleId/history",
    guard("vehicle_owner.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const history = await ownersService.getOwnershipHistory(tenantId, req.params.vehicleId);
        res.json({ status: "success", data: history });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
