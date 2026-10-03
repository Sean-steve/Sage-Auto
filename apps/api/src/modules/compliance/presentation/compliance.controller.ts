// ============================================================================
// CAR HIRE OS — COMPLIANCE PRESENTATION CONTROLLER (DEV-006, DEV-009)
// HTTP Endpoints for Regulatory Requirements, Verification & Readiness
// ============================================================================

import { Router, Request, Response } from "express";
import { ComplianceService } from "../application/compliance.service";
import { ComplianceReadinessService } from "../application/compliance-readiness.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";

export function createComplianceController(
  complianceService: ComplianceService,
  readinessService: ComplianceReadinessService,
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: any) => void
): Router {
  const router = Router();
  const guard = permissionGuard || (() => (req: Request, res: Response, next: any) => next());

  const getTenantId = (req: Request): string => {
    const tenantId = (req as any).tenantContext?.tenantId || (req as any).tenantId;
    if (!tenantId) {
      const err: any = new Error("Forbidden: Missing or unverified tenant context.");
      err.statusCode = 403;
      throw err;
    }
    return tenantId;
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

  // --------------------------------------------------------------------------
  // DASHBOARD SUMMARY & READINESS QUERIES
  // --------------------------------------------------------------------------

  router.get(
    "/summary",
    guard(TENANT_PERMISSIONS.COMPLIANCE_READ),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const summary = await readinessService.getDashboardSummary(tenantId);
        res.json({ success: true, data: summary });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/readiness/vehicle/:id",
    guard(TENANT_PERMISSIONS.COMPLIANCE_READ),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const vehicleId = req.params.id;
        const context = (req.query.context as any) || "RENTAL_START";
        const interval =
          req.query.start && req.query.end
            ? { start: req.query.start as string, end: req.query.end as string }
            : undefined;

        const result = await readinessService.evaluateVehicle(tenantId, vehicleId, context, interval);
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/readiness/driver/:id",
    guard(TENANT_PERMISSIONS.COMPLIANCE_READ),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const driverId = req.params.id;
        const context = (req.query.context as any) || "RENTAL_START";
        const interval =
          req.query.start && req.query.end
            ? { start: req.query.start as string, end: req.query.end as string }
            : undefined;

        const result = await readinessService.evaluateDriver(tenantId, driverId, context, interval);
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/readiness/rental-start",
    guard(TENANT_PERMISSIONS.COMPLIANCE_READ),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const { vehicleId, driverId, customerId, interval } = req.body;
        const result = await readinessService.evaluateRentalStart(tenantId, {
          vehicleId,
          driverId,
          customerId,
          interval,
        });
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // REQUIREMENTS CATALOG
  // --------------------------------------------------------------------------

  router.get(
    "/requirements",
    guard(TENANT_PERMISSIONS.COMPLIANCE_READ),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const subjectType = req.query.subjectType as any;
        const activeOnly = req.query.activeOnly === "true";
        const requirements = await complianceService.listRequirements(tenantId, subjectType, activeOnly);
        res.json({ success: true, data: requirements });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/requirements",
    guard(TENANT_PERMISSIONS.COMPLIANCE_UPLOAD),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const requirement = await complianceService.createRequirement(tenantId, req.body, actorId);
        res.status(201).json({ success: true, data: requirement });
      } catch (err) {
        next(err);
      }
    }
  );

  router.put(
    "/requirements/:id",
    guard(TENANT_PERMISSIONS.COMPLIANCE_UPLOAD),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const requirement = await complianceService.updateRequirement(tenantId, req.params.id, req.body, actorId);
        res.json({ success: true, data: requirement });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // COMPLIANCE RECORDS LIFECYCLE
  // --------------------------------------------------------------------------

  router.get(
    "/records",
    guard(TENANT_PERMISSIONS.COMPLIANCE_READ),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const filters = {
          subjectType: req.query.subjectType as any,
          subjectId: req.query.subjectId as string,
          requirementCode: req.query.requirementCode as string,
          status: req.query.status as any,
          verificationStatus: req.query.verificationStatus as any,
        };
        const records = await complianceService.listRecords(tenantId, filters);
        res.json({ success: true, data: records });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/records",
    guard(TENANT_PERMISSIONS.COMPLIANCE_UPLOAD),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const record = await complianceService.submitRecord(tenantId, req.body, actorId);
        res.status(201).json({ success: true, data: record });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/records/:id",
    guard(TENANT_PERMISSIONS.COMPLIANCE_READ),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const record = await complianceService.getRecordById(tenantId, req.params.id);
        if (!record) {
          res.status(404).json({ success: false, error: "Compliance record not found" });
          return;
        }
        res.json({ success: true, data: record });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/records/:id/history",
    guard(TENANT_PERMISSIONS.COMPLIANCE_READ),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const history = await complianceService.getRecordHistory(tenantId, req.params.id);
        res.json({ success: true, data: history });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/records/:id/verify",
    guard(TENANT_PERMISSIONS.COMPLIANCE_VERIFY),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const record = await complianceService.verifyRecord(tenantId, req.params.id, req.body, actorId);
        res.json({ success: true, data: record });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/records/:id/reject",
    guard(TENANT_PERMISSIONS.COMPLIANCE_VERIFY),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const record = await complianceService.rejectRecord(tenantId, req.params.id, req.body, actorId);
        res.json({ success: true, data: record });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/records/:id/revoke",
    guard(TENANT_PERMISSIONS.COMPLIANCE_VERIFY),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const record = await complianceService.revokeRecord(tenantId, req.params.id, req.body, actorId);
        res.json({ success: true, data: record });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/records/:id/renew",
    guard(TENANT_PERMISSIONS.COMPLIANCE_UPLOAD),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const record = await complianceService.renewRecord(tenantId, req.params.id, req.body, actorId);
        res.status(201).json({ success: true, data: record });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // ISSUES & EMERGENCY OVERRIDES
  // --------------------------------------------------------------------------

  router.get(
    "/issues",
    guard(TENANT_PERMISSIONS.COMPLIANCE_READ),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const filters = {
          subjectType: req.query.subjectType as any,
          subjectId: req.query.subjectId as string,
          requirementCode: req.query.requirementCode as string,
          status: req.query.status as any,
          severity: req.query.severity as any,
        };
        const issues = await complianceService.listIssues(tenantId, filters);
        res.json({ success: true, data: issues });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/issues/:id/resolve",
    guard(TENANT_PERMISSIONS.COMPLIANCE_VERIFY),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const { resolutionNotes } = req.body;
        const issue = await complianceService.resolveIssue(tenantId, req.params.id, resolutionNotes, actorId);
        res.json({ success: true, data: issue });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/overrides",
    guard(TENANT_PERMISSIONS.COMPLIANCE_OVERRIDE),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const { subjectType, subjectId, requirementCode, ...dto } = req.body;
        const override = await complianceService.createOverride(
          tenantId,
          subjectType,
          subjectId,
          requirementCode,
          dto,
          actorId
        );
        res.status(201).json({ success: true, data: override });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    "/overrides",
    guard(TENANT_PERMISSIONS.COMPLIANCE_READ),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const overrides = await complianceService.listOverrides(tenantId);
        res.json({ success: true, data: overrides });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    "/overrides/:id",
    guard(TENANT_PERMISSIONS.COMPLIANCE_OVERRIDE),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        await complianceService.deleteOverride(tenantId, req.params.id, actorId);
        res.json({ success: true, message: "Compliance override revoked" });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    "/evaluate-sweep",
    guard(TENANT_PERMISSIONS.COMPLIANCE_VERIFY),
    async (req: Request, res: Response, next: any) => {
      try {
        const tenantId = getTenantId(req);
        const result = await complianceService.evaluateTenantCompliance(tenantId);
        res.json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
