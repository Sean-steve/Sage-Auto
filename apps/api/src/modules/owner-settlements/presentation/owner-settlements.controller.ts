// ============================================================================
// CAR HIRE OS — OWNER SETTLEMENTS CONTROLLER (Sprint 21: DOM-003 §41-45)
// REST API Presentation Layer for Periods, Batches, Calculations, Statements & Payouts
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { OwnerSettlementsService, SettlementActor } from "../application/owner-settlements.service";
import { TENANT_PERMISSIONS } from "@carhire/constants";
import {
  CreateSettlementPeriodSchema,
  CalculateSettlementSchema,
  GenerateSettlementBatchSchema,
  ApproveSettlementSchema,
  DisputeSettlementSchema,
  ResolveDisputeSchema,
  AddSettlementAdjustmentSchema,
  ExecutePayoutSchema,
} from "@carhire/validation";

export function createOwnerSettlementsController(
  settlementService: OwnerSettlementsService,
  permissionGuard?: (perm: string) => (req: Request, res: Response, next: NextFunction) => void
): Router {
  const router = Router();
  const guard = (perm: string) =>
    permissionGuard
      ? permissionGuard(perm)
      : (_req: Request, _res: Response, next: NextFunction) => next();

  const getActor = (req: Request): SettlementActor => {
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
      email: user?.email,
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
  // 1. SETTLEMENT PERIODS
  // --------------------------------------------------------------------------

  // List periods
  router.get(
    "/periods",
    guard(TENANT_PERMISSIONS.SETTLEMENT_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const filter = {
          status: req.query.status as any,
          periodType: req.query.periodType as any,
          year: req.query.year ? parseInt(req.query.year as string, 10) : undefined,
        };
        const periods = await settlementService.listPeriods(tenantId, filter);
        res.json({ success: true, data: periods });
      } catch (err) {
        next(err);
      }
    }
  );

  // Create period
  router.post(
    "/periods",
    guard(TENANT_PERMISSIONS.SETTLEMENT_PERIOD_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const validated = CreateSettlementPeriodSchema.parse(req.body);

        const period = await settlementService.createPeriod(
          tenantId,
          {
            periodType: validated.periodType as any,
            name: validated.description,
            startDate: validated.startDate,
            endDate: validated.endDate,
          },
          actor
        );
        res.status(201).json({ success: true, data: period });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get period by ID
  router.get(
    "/periods/:id",
    guard(TENANT_PERMISSIONS.SETTLEMENT_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const period = await settlementService.getPeriod(tenantId, req.params.id);
        res.json({ success: true, data: period });
      } catch (err) {
        next(err);
      }
    }
  );

  // Close period
  router.post(
    "/periods/:id/close",
    guard(TENANT_PERMISSIONS.SETTLEMENT_PERIOD_MANAGE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const period = await settlementService.closePeriod(tenantId, req.params.id, actor);
        res.json({ success: true, data: period });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // 2. SETTLEMENT BATCHES
  // --------------------------------------------------------------------------

  // List batches
  router.get(
    "/batches",
    guard(TENANT_PERMISSIONS.SETTLEMENT_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const periodId = req.query.periodId as string;
        const settlements = await settlementService.listSettlements(tenantId, { periodId });
        res.json({ success: true, data: settlements });
      } catch (err) {
        next(err);
      }
    }
  );

  // Generate batch (idempotent)
  router.post(
    "/batches",
    guard(TENANT_PERMISSIONS.SETTLEMENT_BATCH_GENERATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const validated = GenerateSettlementBatchSchema.parse(req.body);

        const result = await settlementService.generateBatch(
          tenantId,
          {
            periodId: validated.periodId,
            idempotencyKey: validated.idempotencyKey,
          },
          actor
        );
        res.status(201).json({ success: true, data: result });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // 3. SETTLEMENTS & CALCULATION
  // --------------------------------------------------------------------------

  // List settlements
  router.get(
    "/",
    guard(TENANT_PERMISSIONS.SETTLEMENT_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const filter = {
          ownerId: req.query.ownerId as string,
          periodId: req.query.periodId as string,
          batchId: req.query.batchId as string,
          status: req.query.status as any,
          periodStart: req.query.periodStart as string,
          periodEnd: req.query.periodEnd as string,
        };
        const settlements = await settlementService.listSettlements(tenantId, filter);
        res.json({ success: true, data: settlements });
      } catch (err) {
        next(err);
      }
    }
  );

  // Calculate settlement for an owner
  router.post(
    "/calculate",
    guard(TENANT_PERMISSIONS.SETTLEMENT_CALCULATE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const validated = CalculateSettlementSchema.parse(req.body);

        const settlement = await settlementService.calculateSettlement(
          tenantId,
          {
            ownerId: validated.ownerId,
            periodId: validated.periodId,
            periodStart: validated.startDate,
            periodEnd: validated.endDate,
            notes: validated.notes,
          },
          actor
        );
        res.status(201).json({ success: true, data: settlement });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get settlement by ID
  router.get(
    "/:id",
    guard(TENANT_PERMISSIONS.SETTLEMENT_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const settlement = await settlementService.getSettlement(tenantId, req.params.id);
        res.json({ success: true, data: settlement });
      } catch (err) {
        next(err);
      }
    }
  );

  // Get statement read model
  router.get(
    "/:id/statement",
    guard(TENANT_PERMISSIONS.SETTLEMENT_STATEMENT_EXPORT),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const statement = await settlementService.getStatement(tenantId, req.params.id);
        res.json({ success: true, data: statement });
      } catch (err) {
        next(err);
      }
    }
  );

  // Approve settlement
  router.post(
    "/:id/approve",
    guard(TENANT_PERMISSIONS.SETTLEMENT_APPROVE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const validated = ApproveSettlementSchema.parse(req.body);

        const settlement = await settlementService.approveSettlement(
          tenantId,
          req.params.id,
          { approvalNotes: validated.notes },
          actor
        );
        res.json({ success: true, data: settlement });
      } catch (err) {
        next(err);
      }
    }
  );

  // Dispute settlement
  router.post(
    "/:id/dispute",
    guard(TENANT_PERMISSIONS.SETTLEMENT_DISPUTE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const validated = DisputeSettlementSchema.parse(req.body);

        const settlement = await settlementService.disputeSettlement(
          tenantId,
          req.params.id,
          { reason: validated.reason },
          actor
        );
        res.json({ success: true, data: settlement });
      } catch (err) {
        next(err);
      }
    }
  );

  // Resolve dispute
  router.post(
    "/:id/resolve-dispute",
    guard(TENANT_PERMISSIONS.SETTLEMENT_DISPUTE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const validated = ResolveDisputeSchema.parse(req.body);

        const adjustment = validated.adjustments?.[0];
        const settlement = await settlementService.resolveDispute(
          tenantId,
          req.params.id,
          {
            resolutionNotes: validated.resolutionNotes,
            adjustmentAmount: adjustment?.amount,
            adjustmentReason: adjustment?.reason,
            approveImmediately: true,
          },
          actor
        );
        res.json({ success: true, data: settlement });
      } catch (err) {
        next(err);
      }
    }
  );

  // Add adjustment
  router.post(
    "/:id/adjustments",
    guard(TENANT_PERMISSIONS.SETTLEMENT_APPROVE),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const validated = AddSettlementAdjustmentSchema.parse(req.body);

        const settlement = await settlementService.addAdjustment(
          tenantId,
          req.params.id,
          {
            type: validated.type as any,
            amount: validated.amount,
            reason: validated.reason,
          },
          actor
        );
        res.json({ success: true, data: settlement });
      } catch (err) {
        next(err);
      }
    }
  );

  // Execute payout
  router.post(
    "/:id/payout",
    guard(TENANT_PERMISSIONS.SETTLEMENT_PAY),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const actor = getActor(req);
        const validated = ExecutePayoutSchema.parse(req.body);

        const settlement = await settlementService.executePayout(
          tenantId,
          req.params.id,
          {
            payoutReference: validated.payoutReference,
            payoutMethod: validated.payoutMethod as any,
            notes: `Bank: ${validated.destinationBank || "N/A"}, Acc: ${validated.destinationAccount || validated.destinationMpesaNumber || "N/A"}`,
          },
          actor
        );
        res.json({ success: true, data: settlement });
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // 4. PAYABLES & PROFITABILITY REPORTS
  // --------------------------------------------------------------------------

  // List payables
  router.get(
    "/payables/list",
    guard(TENANT_PERMISSIONS.SETTLEMENT_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const filter = {
          ownerId: req.query.ownerId as string,
          settlementId: req.query.settlementId as string,
          status: req.query.status as any,
        };
        const payables = await settlementService.listPayables(tenantId, filter);
        res.json({ success: true, data: payables });
      } catch (err) {
        next(err);
      }
    }
  );

  // Vehicle profitability report
  router.get(
    "/reports/profitability",
    guard(TENANT_PERMISSIONS.SETTLEMENT_READ),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = getTenantId(req);
        const startDate = (req.query.startDate as string) || new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
        const endDate = (req.query.endDate as string) || new Date().toISOString().split("T")[0];
        const vehicleId = req.query.vehicleId as string;

        const report = await settlementService.getVehicleProfitability(tenantId, {
          startDate,
          endDate,
          vehicleId,
        });
        res.json({ success: true, data: report });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
