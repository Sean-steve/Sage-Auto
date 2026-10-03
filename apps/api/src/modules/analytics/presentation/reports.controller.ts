// ============================================================================
// CAR HIRE OS — REPORTS CONTROLLER (Sprint 34: DOM-003, DEV-009)
// Presentation controller for report queries, export jobs, saved templates & schedules
// ============================================================================

import { Request, Response } from "express";
import { ReportingService } from "../application/reporting.service";
import { ReportExportService } from "../application/report-export.service";
import { ReportScheduleService } from "../application/report-schedule.service";
import { SavedReportRepository } from "@carhire/database";
import { ReportRegistry } from "../domain/report-registry";
import type { ReportKey, ReportFormat, PeriodPreset } from "@carhire/types";

export function createReportsController(
  reportingService: ReportingService,
  exportService: ReportExportService,
  scheduleService: ReportScheduleService,
  savedReportRepo: SavedReportRepository = new SavedReportRepository()
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

  return {
    async getCatalogue(req: Request, res: Response): Promise<void> {
      try {
        const category = req.query.category as string;
        const reports = category
          ? ReportRegistry.getByCategory(category)
          : ReportRegistry.getAll();
        res.json({ reports });
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },

    async getReportDefinition(req: Request, res: Response): Promise<void> {
      try {
        const key = req.params.key as ReportKey;
        const definition = ReportRegistry.get(key);
        if (!definition) {
          res.status(404).json({ error: { message: `Report not found: ${key}` } });
          return;
        }
        res.json(definition);
      } catch (err: any) {
        res.status(400).json({ error: { message: err.message } });
      }
    },

    async queryReport(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const key = req.params.key as ReportKey;
        const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
        const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 50;

        const result = await reportingService.executeReport(tenantId, key, {
          from: req.query.from as string,
          to: req.query.to as string,
          preset: req.query.preset as PeriodPreset,
          page,
          pageSize,
          sortBy: req.query.sortBy as string,
          sortOrder: req.query.sortOrder as "asc" | "desc",
          currency: req.query.currency as string,
        });

        res.json(result);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async exportReport(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const key = req.params.key as ReportKey;
        const format = (req.body.format || "CSV").toUpperCase() as ReportFormat;
        const actorId = getActorId(req);

        const execution = await exportService.requestReportExport(
          tenantId,
          key,
          format,
          req.body.params || {},
          actorId
        );

        res.status(202).json(execution);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async listExecutions(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const executions = await exportService.listExecutions(tenantId);
        res.json({ executions });
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async getExecution(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const execution = await exportService.getExecution(req.params.id, tenantId);
        if (!execution) {
          res.status(404).json({ error: { message: "Report execution not found" } });
          return;
        }
        res.json(execution);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async downloadExecution(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const execution = await exportService.getExecution(req.params.id, tenantId);
        if (!execution || execution.status !== "COMPLETED") {
          res.status(404).json({ error: { message: "Report artifact not available for download" } });
          return;
        }

        const filename = `${execution.reportKey.toLowerCase()}-${execution.id}.${execution.format.toLowerCase()}`;
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Type", execution.mimeType || "text/csv");
        res.send(execution.rawContent || "");
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    // --- Saved Reports ---
    async listSavedReports(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const saved = await savedReportRepo.listByTenant(tenantId);
        res.json({ savedReports: saved });
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async createSavedReport(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const created = await savedReportRepo.create({
          tenantId,
          name: req.body.name,
          reportKey: req.body.reportKey,
          filters: req.body.filters || req.body.filterSnapshot || {},
          isShared: Boolean(req.body.isShared),
          createdBy: actorId,
        });
        res.status(201).json(created);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async deleteSavedReport(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        await savedReportRepo.delete(req.params.id, tenantId);
        res.json({ success: true });
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    // --- Report Schedules ---
    async listSchedules(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const schedules = await scheduleService.listSchedules(tenantId);
        res.json({ schedules });
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async createSchedule(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const schedule = await scheduleService.createSchedule(tenantId, {
          reportKey: req.body.reportKey,
          frequency: req.body.frequency,
          format: req.body.format || "CSV",
          recipientEmails: req.body.recipientEmails || [],
          filterSnapshot: req.body.filterSnapshot || req.body.filters,
          createdById: actorId,
        });
        res.status(201).json(schedule);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async deleteSchedule(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        await scheduleService.deleteSchedule(req.params.id, tenantId);
        res.json({ success: true });
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },
  };
}
