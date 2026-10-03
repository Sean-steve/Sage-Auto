// ============================================================================
// CAR HIRE OS — HANDOVER PRESENTATION CONTROLLER (DOM-003 §18, DEV-007)
// Bounded Context: Vehicle Handover & Physical Dispatch Checklist
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { HandoverService, HandoverActor } from "../application/handover.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";
import {
  ScheduleHandoverDto,
  RecordCustomerArrivalDto,
  VerifyHandoverDocumentsDto,
  CompleteInspectionCheckpointDto,
  ConfirmSignatureCheckpointDto,
  HandoverKeysDto,
  CompleteHandoverDto,
  HandoverListQueryDto,
} from "@carhire/types";

export function createHandoverController(
  handoverService: HandoverService,
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  const guard = (perm: string) =>
    permissionGuard
      ? permissionGuard(perm)
      : (_req: Request, _res: Response, next: NextFunction) => next();

  const getActor = (req: Request): HandoverActor => {
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
  // Schedule Handover Workflow
  // --------------------------------------------------------------------------
  router.post(
    "/schedule",
    guard(TENANT_PERMISSIONS.RENTAL_START || "rental.start"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto = req.body as ScheduleHandoverDto;
        const actor = getActor(req);
        const handover = await handoverService.scheduleHandover(tenantId, dto, actor);
        res.status(201).json({ success: true, data: handover });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Checkpoint 1: Record Customer Arrival
  // --------------------------------------------------------------------------
  router.post(
    "/:id/arrive",
    guard(TENANT_PERMISSIONS.RENTAL_START || "rental.start"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const handoverId = req.params.id;
        const dto = req.body as RecordCustomerArrivalDto;
        const actor = getActor(req);
        const handover = await handoverService.recordCustomerArrival(tenantId, handoverId, dto, actor);
        res.json({ success: true, data: handover });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Checkpoint 2: Verify Documents (License & ID)
  // --------------------------------------------------------------------------
  router.post(
    "/:id/verify-documents",
    guard(TENANT_PERMISSIONS.RENTAL_START || "rental.start"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const handoverId = req.params.id;
        const dto = req.body as VerifyHandoverDocumentsDto;
        const actor = getActor(req);
        const handover = await handoverService.verifyDocuments(tenantId, handoverId, dto, actor);
        res.json({ success: true, data: handover });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Checkpoint 3: Complete Pre-Rental Inspection
  // --------------------------------------------------------------------------
  router.post(
    "/:id/inspection",
    guard(TENANT_PERMISSIONS.INSPECTION_CREATE || "inspection.create"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const handoverId = req.params.id;
        const dto = req.body as CompleteInspectionCheckpointDto;
        const actor = getActor(req);
        const handover = await handoverService.completeInspectionCheckpoint(tenantId, handoverId, dto, actor);
        res.json({ success: true, data: handover });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Checkpoint 4: Confirm Signature
  // --------------------------------------------------------------------------
  router.post(
    "/:id/confirm-signature",
    guard(TENANT_PERMISSIONS.CONTRACT_SIGN || "contract.sign"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const handoverId = req.params.id;
        const dto = req.body as ConfirmSignatureCheckpointDto;
        const actor = getActor(req);
        const handover = await handoverService.confirmSignatureCheckpoint(tenantId, handoverId, dto, actor);
        res.json({ success: true, data: handover });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Checkpoint 5: Key Handover
  // --------------------------------------------------------------------------
  router.post(
    "/:id/handover-keys",
    guard(TENANT_PERMISSIONS.RENTAL_START || "rental.start"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const handoverId = req.params.id;
        const dto = req.body as HandoverKeysDto;
        const actor = getActor(req);
        const handover = await handoverService.handoverKeys(tenantId, handoverId, dto, actor);
        res.json({ success: true, data: handover });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Finalize / Complete Handover
  // --------------------------------------------------------------------------
  router.post(
    "/:id/complete",
    guard(TENANT_PERMISSIONS.RENTAL_START || "rental.start"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const handoverId = req.params.id;
        const dto = req.body as CompleteHandoverDto;
        const actor = getActor(req);
        const handover = await handoverService.completeHandover(tenantId, handoverId, dto, actor);
        res.json({ success: true, data: handover });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Get Handover by ID
  // --------------------------------------------------------------------------
  router.get(
    "/:id",
    guard(TENANT_PERMISSIONS.RENTAL_READ || "rental.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const handover = await handoverService.getHandoverById(tenantId, req.params.id);
        res.json({ success: true, data: handover });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // List Handovers
  // --------------------------------------------------------------------------
  router.get(
    "/",
    guard(TENANT_PERMISSIONS.RENTAL_READ || "rental.read"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const query: HandoverListQueryDto = {
          status: req.query.status as any,
          bookingId: req.query.bookingId as string,
          vehicleId: req.query.vehicleId as string,
          customerId: req.query.customerId as string,
          scheduledDate: req.query.scheduledDate as string,
          search: req.query.search as string,
          limit: req.query.limit ? Number(req.query.limit) : undefined,
          offset: req.query.offset ? Number(req.query.offset) : undefined,
        };
        const result = await handoverService.listHandovers(tenantId, query);
        res.json({ success: true, data: result.items, total: result.total });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
