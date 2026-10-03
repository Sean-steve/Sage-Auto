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

  // List allocations for dispatch/operations
  router.get(
    "/allocations",
    guard("availability.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const status = req.query.status
          ? String(req.query.status).split(",").filter(Boolean)
          : undefined;
        const allocations = await availabilityService.listAllocations(tenantId, {
          vehicleId: req.query.vehicleId ? String(req.query.vehicleId) : undefined,
          status: status as any,
          from: req.query.from ? String(req.query.from) : undefined,
          to: req.query.to ? String(req.query.to) : undefined,
          allocationType: req.query.allocationType ? String(req.query.allocationType) as any : undefined,
          sourceType: req.query.sourceType ? String(req.query.sourceType) : undefined,
          sourceId: req.query.sourceId ? String(req.query.sourceId) : undefined,
        });
        res.json({ success: true, data: allocations, total: allocations.length });
      } catch (err) {
        next(err);
      }
    }
  );

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

  // List temporary holds
  router.get(
    "/holds",
    guard("availability.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const status = req.query.status
          ? String(req.query.status).split(",").filter(Boolean)
          : undefined;
        const holds = await availabilityService.listHolds(tenantId, {
          vehicleId: req.query.vehicleId ? String(req.query.vehicleId) : undefined,
          status: status as any,
          from: req.query.from ? String(req.query.from) : undefined,
          to: req.query.to ? String(req.query.to) : undefined,
          customerId: req.query.customerId ? String(req.query.customerId) : undefined,
          bookingDraftId: req.query.bookingDraftId ? String(req.query.bookingDraftId) : undefined,
        });
        res.json({ success: true, data: holds, total: holds.length });
      } catch (err) {
        next(err);
      }
    }
  );

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

  // List vehicle blocks
  router.get(
    "/blocks",
    guard("availability.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const status = req.query.status
          ? String(req.query.status).split(",").filter(Boolean)
          : undefined;
        const blocks = await availabilityService.listVehicleBlocks(tenantId, {
          vehicleId: req.query.vehicleId ? String(req.query.vehicleId) : undefined,
          status: status as any,
          from: req.query.from ? String(req.query.from) : undefined,
          to: req.query.to ? String(req.query.to) : undefined,
          blockType: req.query.blockType ? String(req.query.blockType) as any : undefined,
        });
        res.json({ success: true, data: blocks, total: blocks.length });
      } catch (err) {
        next(err);
      }
    }
  );

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
