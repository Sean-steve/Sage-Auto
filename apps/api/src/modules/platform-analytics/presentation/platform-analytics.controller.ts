// ============================================================================
// CAR HIRE OS — PLATFORM ANALYTICS CONTROLLER (Sprint 35: DOM-003, DEV-004)
// Presentation controller for Platform SaaS Analytics, Subscriptions & MRR Intelligence
// Protected by PlatformMembership / PLATFORM_SUPERADMIN authorization
// ============================================================================

import { Request, Response } from "express";
import { PlatformMetricsService } from "../application/platform-metrics.service";
import { MrrMovementService } from "../application/mrr-movement.service";
import { PlatformCohortService } from "../application/platform-cohort.service";
import { PlatformReportingService } from "../application/platform-reporting.service";
import { PlatformExportService } from "../application/platform-export.service";
import { PlatformReconciliationService } from "../application/platform-reconciliation.service";
import { PlatformBackfillService } from "../application/platform-backfill.service";
import { PlatformMetricRegistry } from "../domain/platform-metric-registry";
import { PlatformReportRegistry } from "../domain/platform-report-registry";
import type { PlatformMetricKey, PlatformReportType } from "@carhire/types";

export function createPlatformAnalyticsController(
  metricsService: PlatformMetricsService = new PlatformMetricsService(),
  movementService: MrrMovementService = new MrrMovementService(),
  cohortService: PlatformCohortService = new PlatformCohortService(),
  reportingService: PlatformReportingService = new PlatformReportingService(),
  exportService: PlatformExportService = new PlatformExportService(),
  reconciliationService: PlatformReconciliationService = new PlatformReconciliationService(),
  backfillService: PlatformBackfillService = new PlatformBackfillService()
) {
  return {
    /**
     * GET /api/v1/platform/analytics/overview
     * Returns the comprehensive executive SaaS overview & live KPI ribbon.
     */
    async getExecutiveOverview(req: Request, res: Response): Promise<void> {
      try {
        const currency = (req.query.currency as string) || "KES";
        const overview = await metricsService.getExecutiveOverview(currency);
        res.json(overview);
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },

    /**
     * GET /api/v1/platform/analytics/metrics
     * Lists all registered canonical platform metric definitions.
     */
    async listMetricDefinitions(req: Request, res: Response): Promise<void> {
      try {
        const category = req.query.category as string;
        const metrics = category
          ? PlatformMetricRegistry.getByCategory(category)
          : PlatformMetricRegistry.getAll();
        res.json({ count: metrics.length, metrics });
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },

    /**
     * GET /api/v1/platform/analytics/metrics/:key
     * Evaluates a single platform metric value.
     */
    async getMetric(req: Request, res: Response): Promise<void> {
      try {
        const key = req.params.key as PlatformMetricKey;
        const currency = (req.query.currency as string) || "KES";
        const value = await metricsService.evaluateMetric(key, currency);
        res.json({ key, currency: currency.toUpperCase(), value });
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },

    /**
     * GET /api/v1/platform/analytics/mrr-movements
     * Returns MRR waterfall movement dynamics (New, Expansion, Contraction, Churn, Reactivation).
     */
    async getMrrMovements(req: Request, res: Response): Promise<void> {
      try {
        const currency = (req.query.currency as string) || "KES";
        const from = (req.query.from as string) || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const to = (req.query.to as string) || new Date().toISOString().split("T")[0];
        const waterfall = await movementService.getMovementWaterfall(from, to, currency);
        res.json(waterfall);
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },

    /**
     * GET /api/v1/platform/analytics/cohorts
     * Returns subscription acquisition and NRR retention cohort matrices.
     */
    async getCohorts(req: Request, res: Response): Promise<void> {
      try {
        const currency = (req.query.currency as string) || "KES";
        const cohorts = await cohortService.getCohorts(currency);
        res.json({ count: cohorts.length, cohorts });
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },

    /**
     * GET /api/v1/platform/analytics/plans
     * Returns plan tier performance, monetization distribution, and vehicle quota usage.
     */
    async getPlanPerformance(req: Request, res: Response): Promise<void> {
      try {
        const currency = (req.query.currency as string) || "KES";
        const plans = await metricsService.getPlanPerformance(currency);
        res.json({ count: plans.length, plans });
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },

    /**
     * GET /api/v1/platform/analytics/billing-health
     * Returns SaaS billing collection efficiency, AR aging buckets, and dunning counts.
     */
    async getBillingHealth(req: Request, res: Response): Promise<void> {
      try {
        const currency = (req.query.currency as string) || "KES";
        const health = await metricsService.getBillingHealth(currency);
        res.json(health);
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },

    /**
     * GET /api/v1/platform/analytics/reports
     * Lists all registered canonical platform reports.
     */
    async listReports(_req: Request, res: Response): Promise<void> {
      try {
        const reports = PlatformReportRegistry.getAll();
        res.json({ count: reports.length, reports });
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },

    /**
     * POST /api/v1/platform/analytics/reports/execute
     * Executes a canonical platform report.
     */
    async executeReport(req: Request, res: Response): Promise<void> {
      try {
        const { reportType, filters } = req.body;
        const actorId = (req as any).user?.id || (req as any).actorId || "platform-analyst";
        const execution = await reportingService.executeReport(reportType as PlatformReportType, filters || {}, actorId);
        res.json(execution);
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },

    /**
     * POST /api/v1/platform/analytics/reports/export
     * Exports report results into sanitized CSV or JSON with OWASP formula injection protection.
     */
    async exportReport(req: Request, res: Response): Promise<void> {
      try {
        const { reportType, filters, format } = req.body;
        const actorId = (req as any).user?.id || (req as any).actorId || "platform-analyst";
        const execution = await reportingService.executeReport(reportType as PlatformReportType, filters || {}, actorId);

        if (format === "CSV") {
          const csvText = exportService.exportToCsv(execution);
          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader("Content-Disposition", `attachment; filename="${reportType.toLowerCase()}_export.csv"`);
          res.send(csvText);
        } else {
          res.setHeader("Content-Type", "application/json");
          res.send(exportService.exportToJson(execution));
        }
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },

    /**
     * POST /api/v1/platform/analytics/reconcile
     * Executes mathematical equilibrium reconciliation across subscriptions, billing, and cash.
     */
    async reconcile(req: Request, res: Response): Promise<void> {
      try {
        const currency = (req.body.currency as string) || (req.query.currency as string) || "KES";
        const result = await reconciliationService.reconcile(currency);
        res.json(result);
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },

    /**
     * POST /api/v1/platform/analytics/backfill
     * Idempotently backfills daily snapshot projections for historical dates.
     */
    async backfill(req: Request, res: Response): Promise<void> {
      try {
        const days = Number(req.body.days || req.query.days || 30);
        const currency = (req.body.currency as string) || (req.query.currency as string) || "KES";
        const result = await backfillService.backfillDays(days, currency);
        res.json(result);
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },
  };
}
