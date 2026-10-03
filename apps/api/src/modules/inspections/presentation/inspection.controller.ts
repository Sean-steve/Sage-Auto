// ============================================================================
// CAR HIRE OS — INSPECTIONS & DAMAGE CONTROLLER (DOM-003 §21-22, DEV-006, DEV-007)
// Bounded Context: Vehicle Inspection Audits & Damage Cases API
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { TENANT_PERMISSIONS } from "@carhire/constants";
import { InspectionService, ActorContext } from "../application/inspection.service";
import type {
  CreateInspectionDto,
  StartInspectionDto,
  RecordInspectionResponsesDto,
  RecordDamageObservationDto,
  AddInspectionEvidenceDto,
  CompleteInspectionDto,
  VoidInspectionDto,
  CorrectInspectionDto,
  AcknowledgeInspectionDto,
  CreateInspectionTemplateDto,
  CreateDamageCaseDto,
  UpdateDamageCaseDto,
  InspectionType,
  InspectionStatus,
  DamageCaseStatus,
  DamageSeverity,
  BodyZone,
} from "@carhire/types";

function getTenantId(req: Request): string {
  const tid = (req as any).tenantContext?.tenantId || (req as any).tenantId;
  if (!tid) {
    const err: any = new Error("Forbidden: Missing or unverified tenant context.");
    err.statusCode = 403;
    throw err;
  }
  return tid;
}

function extractActor(req: Request): ActorContext {
  const auth = (req as any).auth;
  const user = (req as any).user;
  const membership = (req as any).membership;
  const userId = auth?.userId || user?.id || user?.sub;
  if (!userId) {
    const err: any = new Error("Unauthorized: Valid authentication required.");
    err.statusCode = 401;
    throw err;
  }
  return {
    userId,
    membershipId: membership?.id || `mbr_${userId}`,
    actorType: "USER",
    ipAddress: (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress,
    userAgent: req.headers["user-agent"],
  };
}

export function createInspectionController(
  inspectionService: InspectionService,
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  const allow = (perm: string) => (permissionGuard ? permissionGuard(perm) : (_req: Request, _res: Response, next: NextFunction) => next());

  // --------------------------------------------------------------------------
  // TEMPLATES
  // --------------------------------------------------------------------------

  router.get(
    "/templates",
    allow(TENANT_PERMISSIONS.INSPECTION_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const templates = await inspectionService.listTemplates(tenantId);
        res.status(200).json({ data: templates, total: templates.length });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/templates/:idOrCode",
    allow(TENANT_PERMISSIONS.INSPECTION_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const template = await inspectionService.getTemplate(tenantId, req.params.idOrCode);
        res.status(200).json({ data: template });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/templates",
    allow(TENANT_PERMISSIONS.INSPECTION_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto: CreateInspectionTemplateDto = req.body;
        const template = await inspectionService.createTemplate(tenantId, dto);
        res.status(201).json({ data: template });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // INSPECTIONS
  // --------------------------------------------------------------------------

  router.get(
    "/",
    allow(TENANT_PERMISSIONS.INSPECTION_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const query = {
          inspectionType: req.query.inspectionType as InspectionType,
          status: req.query.status as InspectionStatus,
          vehicleId: req.query.vehicleId as string,
          rentalId: req.query.rentalId as string,
          bookingId: req.query.bookingId as string,
          search: req.query.search as string,
          limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
          offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
        };
        const result = await inspectionService.listInspections(tenantId, query);
        res.status(200).json({ data: result.items, total: result.total });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/",
    allow(TENANT_PERMISSIONS.INSPECTION_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto: CreateInspectionDto = req.body;
        const actor = extractActor(req);
        const inspection = await inspectionService.createInspection(tenantId, dto, actor);
        res.status(201).json({ data: inspection });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/:id",
    allow(TENANT_PERMISSIONS.INSPECTION_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const inspection = await inspectionService.getInspection(tenantId, req.params.id);
        res.status(200).json({ data: inspection });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/start",
    allow(TENANT_PERMISSIONS.INSPECTION_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto: StartInspectionDto = req.body;
        const actor = extractActor(req);
        const inspection = await inspectionService.startInspection(tenantId, req.params.id, dto, actor);
        res.status(200).json({ data: inspection });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/responses",
    allow(TENANT_PERMISSIONS.INSPECTION_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto: RecordInspectionResponsesDto = req.body;
        const actor = extractActor(req);
        const inspection = await inspectionService.recordResponses(tenantId, req.params.id, dto, actor);
        res.status(200).json({ data: inspection });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/damages",
    allow(TENANT_PERMISSIONS.DAMAGE_RECORD),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto: RecordDamageObservationDto = req.body;
        const actor = extractActor(req);
        const observation = await inspectionService.recordDamageObservation(tenantId, req.params.id, dto, actor);
        res.status(201).json({ data: observation });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/evidence",
    allow(TENANT_PERMISSIONS.INSPECTION_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto: AddInspectionEvidenceDto = req.body;
        const actor = extractActor(req);
        const evidence = await inspectionService.addEvidence(tenantId, req.params.id, dto, actor);
        res.status(201).json({ data: evidence });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/signatures",
    allow(TENANT_PERMISSIONS.INSPECTION_SIGN),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto: AcknowledgeInspectionDto = req.body;
        const actor = extractActor(req);
        const ack = await inspectionService.addAcknowledgement(tenantId, req.params.id, dto, actor);
        res.status(201).json({ data: ack });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/:id/readiness",
    allow(TENANT_PERMISSIONS.INSPECTION_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const readiness = await inspectionService.checkReadiness(tenantId, req.params.id);
        res.status(200).json({ data: readiness });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/complete",
    allow(TENANT_PERMISSIONS.INSPECTION_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto: CompleteInspectionDto = req.body;
        const actor = extractActor(req);
        const inspection = await inspectionService.completeInspection(tenantId, req.params.id, dto, actor);
        res.status(200).json({ data: inspection });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/void",
    allow(TENANT_PERMISSIONS.INSPECTION_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto: VoidInspectionDto = req.body;
        const actor = extractActor(req);
        const inspection = await inspectionService.voidInspection(tenantId, req.params.id, dto, actor);
        res.status(200).json({ data: inspection });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/:id/correct",
    allow(TENANT_PERMISSIONS.INSPECTION_CREATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto: CorrectInspectionDto = req.body;
        const actor = extractActor(req);
        const correction = await inspectionService.correctInspection(tenantId, req.params.id, dto, actor);
        res.status(200).json({ data: correction });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/compare",
    allow(TENANT_PERMISSIONS.INSPECTION_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const { baselineId, returnId } = req.body;
        const actor = extractActor(req);
        const comparison = await inspectionService.compareInspections(tenantId, baselineId, returnId, actor);
        res.status(200).json({ data: comparison });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/rentals/:rentalId/comparison",
    allow(TENANT_PERMISSIONS.INSPECTION_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const comparison = await inspectionService.getComparisonByRental(tenantId, req.params.rentalId);
        res.status(200).json({ data: comparison });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // DAMAGE CASES
  // --------------------------------------------------------------------------

  router.get(
    "/damage-cases/list",
    allow(TENANT_PERMISSIONS.DAMAGE_READ || TENANT_PERMISSIONS.INSPECTION_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const query = {
          vehicleId: req.query.vehicleId as string,
          rentalId: req.query.rentalId as string,
          status: req.query.status as DamageCaseStatus,
          severity: req.query.severity as DamageSeverity,
          bodyZone: req.query.bodyZone as BodyZone,
          search: req.query.search as string,
          limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
          offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
        };
        const result = await inspectionService.listDamageCases(tenantId, query);
        res.status(200).json({ data: result.items, total: result.total });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/damage-cases/:id",
    allow(TENANT_PERMISSIONS.DAMAGE_READ || TENANT_PERMISSIONS.INSPECTION_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const damageCase = await inspectionService.getDamageCase(tenantId, req.params.id);
        res.status(200).json({ data: damageCase });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/damage-cases",
    allow(TENANT_PERMISSIONS.DAMAGE_RECORD),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto: CreateDamageCaseDto = req.body;
        const actor = extractActor(req);
        const damageCase = await inspectionService.createDamageCase(tenantId, dto, actor);
        res.status(201).json({ data: damageCase });
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    "/damage-cases/:id",
    allow(TENANT_PERMISSIONS.DAMAGE_ASSESS),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const dto: UpdateDamageCaseDto = req.body;
        const actor = extractActor(req);
        const damageCase = await inspectionService.updateDamageCase(tenantId, req.params.id, dto, actor);
        res.status(200).json({ data: damageCase });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
