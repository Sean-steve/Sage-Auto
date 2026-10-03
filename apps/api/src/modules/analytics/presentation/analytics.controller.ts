// ============================================================================
// CAR HIRE OS — ANALYTICS CONTROLLER (Sprint 34: DOM-003, DEV-009)
// Presentation controller for tenant dashboard overview & metric evaluations
// ============================================================================

import { Request, Response } from "express";
import { DashboardService } from "../application/dashboard.service";
import { MetricsService } from "../application/metrics.service";
import { ReconciliationService } from "../application/reconciliation.service";
import { BackfillService } from "../application/backfill.service";
import { MetricRegistry } from "../domain/metric-registry";
import type { MetricKey, PeriodPreset } from "@carhire/types";

export function createAnalyticsController(
  dashboardService: DashboardService,
  metricsService: MetricsService,
  reconciliationService: ReconciliationService,
  backfillService: BackfillService
) {
  const getTenantId = (req: Request): string => {
    const tid = (req as any).tenantContext?.tenantId || (req as any).tenantId;
    if (!tid) {
      const err: any = new Error("Forbidden: Missing or unverified tenant context.");
      err.statusCode = 403;
      throw err;
    }
    return tid;
  };

  return {
    async getDashboardOverview(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const overview = await dashboardService.getDashboardOverview(tenantId, {
          from: req.query.from as string,
          to: req.query.to as string,
          preset: req.query.preset as PeriodPreset,
          currency: req.query.currency as string,
          timezone: req.query.timezone as string,
        });
        res.json(overview);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async listMetricDefinitions(req: Request, res: Response): Promise<void> {
      try {
        const domain = req.query.domain as string;
        const metrics = domain
          ? MetricRegistry.getByDomain(domain)
          : MetricRegistry.getAll();
        res.json({ metrics });
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async getMetric(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const key = req.params.key as MetricKey;
        const result = await metricsService.evaluateMetric(tenantId, {
          key,
          from: req.query.from as string,
          to: req.query.to as string,
          preset: req.query.preset as PeriodPreset,
          currency: req.query.currency as string,
          timezone: req.query.timezone as string,
        });
        res.json(result);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async evaluateBatchMetrics(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const { keys, from, to, preset, currency, timezone } = req.body;
        if (!Array.isArray(keys)) {
          res.status(400).json({ error: { message: "keys array is required" } });
          return;
        }

        const results = await Promise.all(
          keys.map((key: MetricKey) =>
            metricsService.evaluateMetric(tenantId, {
              key,
              from,
              to,
              preset,
              currency,
              timezone,
            })
          )
        );

        res.json({ results });
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async getFinancialReconciliation(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const audit = await reconciliationService.runAudit(tenantId);
        res.json(audit);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async runBackfill(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const { from, to, currency } = req.body;
        if (!from || !to) {
          res.status(400).json({ error: { message: "from and to dates are required" } });
          return;
        }
        const result = await backfillService.runBackfill(tenantId, from, to, currency);
        res.json(result);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },
  };
}
