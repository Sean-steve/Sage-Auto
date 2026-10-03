// ============================================================================
// CAR HIRE OS — RENTAL PRESENTATION CONTROLLER (DOM-003 §19-20, DEV-007)
// Bounded Context: Rentals & On-Road Fleet Dispatches
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { RentalService, RentalActor } from "../application/rental.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";
import {
  CreateRentalFromBookingDto,
  RentalListQueryDto,
} from "@carhire/types";

export function createRentalController(
  rentalService: RentalService,
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  const guard = (perm: string) =>
    permissionGuard
      ? permissionGuard(perm)
      : (_req: Request, _res: Response, next: NextFunction) => next();

  const getActor = (req: Request): RentalActor => {
    const auth = (req as any).auth;
    const user = (req as any).user;
    const userId = auth?.userId || user?.id || user?.sub;
    if (!userId) {
      const err: any = new Error("Unauthorized: Valid authentication required.");
      err.statusCode = 401;
      throw err;
    }
    return {
      userId,
      actorType: "USER",
      name: user?.fullName || user?.name,
    };
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

  // --------------------------------------------------------------------------
  // Evaluate Rental Readiness from Booking
  // --------------------------------------------------------------------------
  router.get(
    "/readiness/:bookingId",
    guard(TENANT_PERMISSIONS.RENTAL_READ || "rental.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const bookingId = req.params.bookingId;
        const readiness = await rentalService.evaluateReadiness(tenantId, bookingId);
        res.json({ success: true, data: readiness });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Start / Dispatch Rental
  // --------------------------------------------------------------------------
  router.post(
    "/start",
    guard(TENANT_PERMISSIONS.RENTAL_START || "rental.start"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto = req.body as CreateRentalFromBookingDto;
        const actor = getActor(req);
        const rental = await rentalService.startRental(tenantId, dto, actor);
        res.status(201).json({ success: true, data: rental });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Get Rental by ID
  // --------------------------------------------------------------------------
  router.get(
    "/:id",
    guard(TENANT_PERMISSIONS.RENTAL_READ || "rental.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const rental = await rentalService.getRentalById(tenantId, req.params.id);
        res.json({ success: true, data: rental });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Get Rental Start Snapshot
  // --------------------------------------------------------------------------
  router.get(
    "/:id/start-snapshot",
    guard(TENANT_PERMISSIONS.RENTAL_READ || "rental.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const snapshot = await rentalService.getRentalStartSnapshot(tenantId, req.params.id);
        res.json({ success: true, data: snapshot });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // List Rentals
  // --------------------------------------------------------------------------
  router.get(
    "/",
    guard(TENANT_PERMISSIONS.RENTAL_READ || "rental.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const query: RentalListQueryDto = {
          status: req.query.status as any,
          bookingId: req.query.bookingId as string,
          customerId: req.query.customerId as string,
          vehicleId: req.query.vehicleId as string,
          search: req.query.search as string,
          limit: req.query.limit ? Number(req.query.limit) : undefined,
          offset: req.query.offset ? Number(req.query.offset) : undefined,
        };
        const result = await rentalService.listRentals(tenantId, query);
        res.json({ success: true, data: result.items, total: result.total });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // SPRINT 16: RENTAL EXTENSION ENDPOINTS
  // --------------------------------------------------------------------------
  router.post(
    "/:id/extensions",
    guard(TENANT_PERMISSIONS.RENTAL_EXTEND || "rental.extend"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const rentalId = req.params.id;
        const dto = req.body;
        const actor = getActor(req);
        const extension = await rentalService.requestExtension(tenantId, rentalId, dto, actor);
        res.status(201).json({ success: true, data: extension });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/extensions/:extensionId/approve",
    guard(TENANT_PERMISSIONS.RENTAL_EXTEND || "rental.extend"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const rentalId = req.params.id;
        const extensionId = req.params.extensionId;
        const dto = req.body;
        const actor = getActor(req);
        const rental = await rentalService.approveExtension(tenantId, rentalId, extensionId, dto, actor);
        res.json({ success: true, data: rental });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/extensions/:extensionId/reject",
    guard(TENANT_PERMISSIONS.RENTAL_EXTEND || "rental.extend"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const rentalId = req.params.id;
        const extensionId = req.params.extensionId;
        const dto = req.body;
        const actor = getActor(req);
        const extension = await rentalService.rejectExtension(tenantId, rentalId, extensionId, dto, actor);
        res.json({ success: true, data: extension });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/:id/extensions",
    guard(TENANT_PERMISSIONS.RENTAL_READ || "rental.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const extensions = await rentalService.getRentalExtensions(tenantId, req.params.id);
        res.json({ success: true, data: extensions });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // RENTAL INCIDENT OPERATIONS
  // --------------------------------------------------------------------------
  router.post(
    "/:id/incidents",
    guard(TENANT_PERMISSIONS.RENTAL_INCIDENT_REPORT || "rental.incident_report"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const incident = await rentalService.recordIncident(tenantId, req.params.id, req.body, actor);
        res.status(201).json({ success: true, data: incident });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/:id/incidents",
    guard(TENANT_PERMISSIONS.RENTAL_READ || "rental.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const incidents = await rentalService.getRentalIncidents(tenantId, req.params.id);
        res.json({ success: true, data: incidents });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // SPRINT 16: RETURN WORKFLOW & VEHICLE RECEIPT ENDPOINTS
  // --------------------------------------------------------------------------
  router.post(
    "/:id/return-schedule",
    guard(TENANT_PERMISSIONS.RENTAL_UPDATE || "rental.update"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const rentalId = req.params.id;
        const dto = req.body;
        const actor = getActor(req);
        const rental = await rentalService.scheduleReturn(tenantId, rentalId, dto, actor);
        res.json({ success: true, data: rental });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/receive",
    guard(TENANT_PERMISSIONS.RENTAL_COMPLETE || "rental.complete"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const rentalId = req.params.id;
        const dto = req.body;
        const actor = getActor(req);
        const rental = await rentalService.receiveReturnedVehicle(tenantId, rentalId, dto, actor);
        res.json({ success: true, data: rental });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/return-inspection",
    guard(TENANT_PERMISSIONS.RENTAL_COMPLETE || "rental.complete"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const rentalId = req.params.id;
        const dto = req.body;
        const actor = getActor(req);
        const rental = await rentalService.linkReturnInspection(tenantId, rentalId, dto, actor);
        res.json({ success: true, data: rental });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/:id/return-record",
    guard(TENANT_PERMISSIONS.RENTAL_READ || "rental.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const record = await rentalService.getRentalReturnRecord(tenantId, req.params.id);
        res.json({ success: true, data: record });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // SPRINT 16: FINAL CALCULATION & DEPOSIT RECONCILIATION ENDPOINTS
  // --------------------------------------------------------------------------
  router.post(
    "/:id/calculate-final",
    guard(TENANT_PERMISSIONS.RENTAL_COMPLETE || "rental.complete"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const rentalId = req.params.id;
        const dto = req.body;
        const actor = getActor(req);
        const result = await rentalService.calculateFinalRental(tenantId, rentalId, dto, actor);
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/:id/final-calculation",
    guard(TENANT_PERMISSIONS.RENTAL_READ || "rental.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const calculation = await rentalService.getRentalFinalCalculation(tenantId, req.params.id);
        res.json({ success: true, data: calculation });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/deposit-settlement",
    guard(TENANT_PERMISSIONS.RENTAL_COMPLETE || "rental.complete"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const rentalId = req.params.id;
        const dto = req.body;
        const actor = getActor(req);
        const calculation = await rentalService.processDepositSettlement(tenantId, rentalId, dto, actor);
        res.json({ success: true, data: calculation });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // SPRINT 16: RENTAL COMPLETION ENDPOINT
  // --------------------------------------------------------------------------
  router.post(
    "/:id/complete",
    guard(TENANT_PERMISSIONS.RENTAL_COMPLETE || "rental.complete"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const rentalId = req.params.id;
        const dto = req.body;
        const actor = getActor(req);
        const rental = await rentalService.completeRental(tenantId, rentalId, dto, actor);
        res.json({ success: true, data: rental });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
