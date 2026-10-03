// ============================================================================
// CAR HIRE OS — CRM TENANT CONTROLLER (Sprint 33)
// ============================================================================

import { Request, Response } from "express";
import { LeadService } from "../application/lead.service";
import { SalesQuoteService } from "../application/sales-quote.service";
import { CrmActivityService } from "../application/crm-activity.service";
import { CrmTaskService } from "../application/crm-task.service";
import { CrmPipelineService } from "../application/crm-pipeline.service";

export function createCrmController(
  leadService: LeadService,
  quoteService: SalesQuoteService,
  activityService: CrmActivityService,
  taskService: CrmTaskService,
  pipelineService: CrmPipelineService
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
    // --- LEADS ---
    async listLeads(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const result = await leadService.listLeads({
          tenantId,
          status: req.query.status as any,
          stageId: req.query.stageId as string,
          assignedUserId: req.query.assignedUserId as string,
          type: req.query.type as any,
          search: req.query.search as string,
          limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
          offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
        });
        res.json(result);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async getLead(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const lead = await leadService.getLead(tenantId, req.params.id);
        res.json(lead);
      } catch (err: any) {
        res.status(err.statusCode || 404).json({ error: { message: err.message } });
      }
    },

    async createLead(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const lead = await leadService.createLead(tenantId, req.body, actorId);
        res.status(201).json(lead);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async updateLead(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const lead = await leadService.updateLead(tenantId, req.params.id, req.body, actorId);
        res.json(lead);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async assignLead(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const lead = await leadService.assignLead(
          tenantId,
          req.params.id,
          req.body.assignedUserId,
          actorId
        );
        res.json(lead);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async changeLeadStage(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const lead = await leadService.changeStage(
          tenantId,
          req.params.id,
          req.body.stageId,
          actorId
        );
        res.json(lead);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async qualifyLead(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const lead = await leadService.qualifyLead(tenantId, req.params.id, actorId);
        res.json(lead);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async markLeadLost(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const lead = await leadService.markLost(
          tenantId,
          req.params.id,
          req.body.lossReason,
          req.body.lossNotes,
          actorId
        );
        res.json(lead);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async convertLead(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const result = await leadService.convertLead(tenantId, req.params.id, req.body, actorId);
        res.json(result);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    // --- SALES QUOTES ---
    async listQuotes(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const result = await quoteService.listQuotes({
          tenantId,
          leadId: req.query.leadId as string,
          customerId: req.query.customerId as string,
          status: req.query.status as any,
          search: req.query.search as string,
          limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
          offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
        });
        res.json(result);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async getQuote(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const quote = await quoteService.getQuote(tenantId, req.params.id);
        const versions = await quoteService.getVersions(tenantId, req.params.id);
        res.json({ ...quote, versions });
      } catch (err: any) {
        res.status(err.statusCode || 404).json({ error: { message: err.message } });
      }
    },

    async createQuote(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const result = await quoteService.createQuote(tenantId, req.body, actorId);
        res.status(201).json(result);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async createQuoteVersion(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const version = await quoteService.createNewVersion(
          tenantId,
          req.params.id,
          req.body,
          actorId
        );
        res.status(201).json(version);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async sendQuote(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const quote = await quoteService.sendQuote(
          tenantId,
          req.params.id,
          req.body.recipientEmail,
          req.body.recipientPhone,
          actorId
        );
        res.json(quote);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async acceptQuote(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const quote = await quoteService.acceptQuote({ tenantId, quoteId: req.params.id }, actorId);
        res.json(quote);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async convertQuoteToBooking(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const result = await quoteService.convertToBooking(tenantId, req.params.id, actorId);
        res.json(result);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    // --- PIPELINE & STAGES ---
    async getPipelineStages(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const stages = await pipelineService.getStages(tenantId);
        res.json(stages);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async getPipelineSummary(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const summary = await pipelineService.getPipelineSummary(tenantId);
        res.json(summary);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    // --- TASKS ---
    async listTasks(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const { entityType, entityId, userId, status } = req.query;
        if (entityType && entityId) {
          const tasks = await taskService.getTasksByEntity(
            tenantId,
            entityType as any,
            entityId as string
          );
          res.json(tasks);
          return;
        }
        if (userId) {
          const tasks = await taskService.getTasksByUser(tenantId, userId as string, status as any);
          res.json(tasks);
          return;
        }
        const tasks = await taskService.getTasksByUser(
          tenantId,
          (req as any).user?.id || (req as any).auth?.userId || "",
          status as any
        );
        res.json(tasks);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async createTask(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const task = await taskService.createTask({
          tenantId,
          entityType: req.body.entityType,
          entityId: req.body.entityId,
          title: req.body.title,
          description: req.body.description,
          dueDate: req.body.dueDate,
          priority: req.body.priority,
          assignedUserId: req.body.assignedUserId || actorId,
        });
        res.status(201).json(task);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async completeTask(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const task = await taskService.completeTask(tenantId, req.params.id, actorId);
        res.json(task);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    // --- ACTIVITIES ---
    async listActivities(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const { entityType, entityId } = req.query;
        const list = await activityService.getTimeline(
          tenantId,
          entityType as any,
          entityId as string
        );
        res.json(list);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },

    async logActivity(req: Request, res: Response): Promise<void> {
      try {
        const tenantId = getTenantId(req);
        const actorId = getActorId(req);
        const activity = await activityService.logActivity({
          tenantId,
          entityType: req.body.entityType,
          entityId: req.body.entityId,
          type: req.body.type,
          title: req.body.title,
          description: req.body.description,
          performedBy: actorId,
          metadata: req.body.metadata,
        });
        res.status(201).json(activity);
      } catch (err: any) {
        res.status(err.statusCode || 400).json({ error: { message: err.message } });
      }
    },
  };
}
