// ============================================================================
// CAR HIRE OS — AVAILABILITY HTTP CONTROLLER (DEV-006, DEV-007, BRS-001)
// REST API endpoints with tenant scoping and RBAC protection
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import type { RequestHandler } from "express";
import { AvailabilityService } from "../application/availability.service";

export function createAvailabilityController(
  availabilityService: AvailabilityService,
  permissionGuard?: (perm: string) => RequestHandler
): Router {
  const router = Router();
  const guard = permissionGuard || (() => (_req: Request, _res: Response, next: NextFunction) => next());

  const getActor = (req: Request): string => {
    const auth = (req as any).auth;
    const user = (req as any).user;
    const userId = auth?.userId || user?.userId || user?.id || user?.sub;
    if (!userId) {
      const err: any = new Error("Unauthorized: Valid authentication required.");
      err.statusCode = 401;
      throw err;
    }
    return userId;
  };

  const getTenantId = (req: Request): string => {
    const ctx = (req as any).tenantContext;
    const tid = ctx?.tenantId || (req as any).tenantId;
    if (!tid) {
      const err: any = new Error("Forbidden: Missing or unverified tenant context.");
      err.statusCode = 403;
      throw err;
    }
    return String(tid);
  };

  // --------------------------------------------------------------------------
  // Availability Query & Candidate Search
  // --------------------------------------------------------------------------

  // Check specific vehicle or category availability
  router.post(
    "/check",
    guard("availability.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const result = await availabilityService.checkVehicleAvailability(tenantId, req.body);
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // Search available candidate vehicles across fleet
  router.post(
    "/search",
    guard("availability.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const result = await availabilityService.searchAvailableVehicles(tenantId, req.body);
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Allocations Endpoints
  // --------------------------------------------------------------------------

  // Create an allocation
  router.post(
    "/allocations",
    guard("allocation.create"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const allocation = await availabilityService.createAllocation(
          tenantId,
          req.body,
          getActor(req)
        );
        res.status(201).json({ success: true, data: allocation });
      } catch (err) {
        next(err);
      }
    }
  );

  // Release an allocation
  router.post(
    "/allocations/:id/release",
    guard("allocation.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const allocation = await availabilityService.releaseAllocation(
          tenantId,
          req.params.id,
          req.body.reason,
          getActor(req)
        );
        res.json({ success: true, data: allocation });
      } catch (err) {
        next(err);
      }
    }
  );

  // Substitute an allocated vehicle
  router.post(
    "/allocations/:id/substitute",
    guard("allocation.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const result = await availabilityService.substituteVehicle(
          tenantId,
          req.params.id,
          req.body.newVehicleId,
          getActor(req)
        );
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Temporary Holds Endpoints
  // --------------------------------------------------------------------------

  // Create checkout hold
  router.post(
    "/holds",
    guard("allocation.create"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const result = await availabilityService.createHold(
          tenantId,
          req.body,
          getActor(req)
        );
        res.status(201).json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // Confirm checkout hold into booking allocation
  router.post(
    "/holds/confirm",
    guard("allocation.create"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const allocation = await availabilityService.confirmHold(
          tenantId,
          req.body.holdToken,
          req.body,
          getActor(req)
        );
        res.json({ success: true, data: allocation });
      } catch (err) {
        next(err);
      }
    }
  );

  // Release checkout hold
  router.post(
    "/holds/:idOrToken/release",
    guard("allocation.create"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        await availabilityService.releaseHold(
          tenantId,
          req.params.idOrToken,
          getActor(req)
        );
        res.json({ success: true, message: "Hold successfully released." });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Vehicle Blocks Endpoints (Maintenance, Impound, Compliance, Admin)
  // --------------------------------------------------------------------------

  // Create vehicle block
  router.post(
    "/blocks",
    guard("vehicle_block.create"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const block = await availabilityService.createVehicleBlock(
          tenantId,
          req.body,
          getActor(req)
        );
        res.status(201).json({ success: true, data: block });
      } catch (err) {
        next(err);
      }
    }
  );

  // Release vehicle block
  router.post(
    "/blocks/:id/release",
    guard("vehicle_block.manage"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const block = await availabilityService.releaseVehicleBlock(
          tenantId,
          req.params.id,
          req.body.reason,
          getActor(req)
        );
        res.json({ success: true, data: block });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Vehicle Availability Calendar
  // --------------------------------------------------------------------------

  // Get calendar summary for a vehicle
  router.get(
    "/calendar/:vehicleId",
    guard("availability.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { start, end } = req.query;
        if (!start || !end) {
          res.status(400).json({ error: "Query parameters 'start' and 'end' are required ISO timestamps." });
          return;
        }
        const calendar = await availabilityService.getVehicleCalendar(
          tenantId,
          req.params.vehicleId,
          String(start),
          String(end)
        );
        res.json({ success: true, data: calendar });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
