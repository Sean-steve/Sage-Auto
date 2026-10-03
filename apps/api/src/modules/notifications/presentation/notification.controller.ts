// ============================================================================
// CAR HIRE OS — NOTIFICATION CONTROLLER (DEV-012, SPRINT 32)
// Admin communication dashboard, templates, preferences, suppressions & webhooks
// ============================================================================

import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import {
  SendNotificationIntentDto,
  NotificationFilterParams,
  NotificationChannel,
  NotificationCategory,
  SuppressionReason,
} from "@car-hire-os/types";
import { NotificationOrchestratorService } from "../application/services/notification-orchestrator.service";
import {
  INotificationTemplateRepository,
  ICommunicationPreferenceRepository,
  INotificationSuppressionRepository,
  INotificationRepository,
  INotificationReceiptRepository,
} from "@car-hire-os/database";
import { ProviderRegistryService } from "../infrastructure/providers/provider-registry.service";

function getTenantId(req: Request): string {
  const ctx = (req as any).tenantContext;
  const tid = ctx?.tenantId || (req as any).tenantId;
  if (!tid) {
    const err: any = new Error("Forbidden: Missing or unverified tenant context.");
    err.statusCode = 403;
    throw err;
  }
  return String(tid);
}

export function createNotificationController(
  orchestrator: NotificationOrchestratorService,
  notificationRepo: INotificationRepository,
  receiptRepo: INotificationReceiptRepository,
  templateRepo: INotificationTemplateRepository,
  preferenceRepo: ICommunicationPreferenceRepository,
  suppressionRepo: INotificationSuppressionRepository,
  providerRegistry: ProviderRegistryService
): Router {
  const router = Router();

  // 1. Send Notification Intent (Ad-hoc or programmatic send)
  router.post("/send", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const body = req.body || {};

      const dto: SendNotificationIntentDto = {
        tenantId,
        channel: body.channel || "EMAIL",
        category: body.category || "TRANSACTIONAL",
        priority: body.priority || "NORMAL",
        recipient: body.recipient,
        recipientName: body.recipientName,
        recipientPartyType: body.recipientPartyType,
        recipientPartyId: body.recipientPartyId,
        subject: body.subject,
        body: body.body,
        renderedHtml: body.renderedHtml,
        templateKey: body.templateKey,
        variables: body.variables,
        metadata: body.metadata,
        correlationId: body.correlationId,
        causationEventId: body.causationEventId,
        scheduledFor: body.scheduledFor,
      };

      if (!dto.recipient) {
        res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "recipient is required" } });
        return;
      }

      const result = await orchestrator.sendNotificationIntent(dto);
      res.status(result.isDuplicate ? 200 : 201).json(result);
    } catch (err: any) {
      res.status(500).json({ error: { code: "SEND_FAILED", message: err.message } });
    }
  });

  // 2. Notification Audit Logs (with search, channel/category/status filters & pagination)
  router.get("/", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const query = req.query;

      const filter: NotificationFilterParams = {
        tenantId,
        channel: query.channel as NotificationChannel,
        category: query.category as NotificationCategory,
        status: query.status as any,
        recipient: query.recipient as string,
        templateKey: query.templateKey as string,
        search: query.search as string,
        startDate: query.startDate as string,
        endDate: query.endDate as string,
        limit: query.limit ? Number(query.limit) : 50,
        offset: query.offset ? Number(query.offset) : 0,
      };

      const result = await notificationRepo.findMany(filter);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: { code: "FETCH_FAILED", message: err.message } });
    }
  });

  // 3. Stats & Delivery Analytics
  router.get("/stats", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const stats = await orchestrator.getStats(tenantId);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: { code: "STATS_FAILED", message: err.message } });
    }
  });

  // 4. Notification Detail
  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const notification = await notificationRepo.findByTenantAndId(tenantId, req.params.id);
      if (!notification) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Notification not found" } });
        return;
      }
      res.json(notification);
    } catch (err: any) {
      res.status(500).json({ error: { code: "FETCH_FAILED", message: err.message } });
    }
  });

  // 5. Receipts for a Notification
  router.get("/:id/receipts", async (req: Request, res: Response) => {
    try {
      const receipts = await receiptRepo.findByNotificationId(req.params.id);
      res.json(receipts);
    } catch (err: any) {
      res.status(500).json({ error: { code: "RECEIPTS_FAILED", message: err.message } });
    }
  });

  // 6. Retry Failed Notification
  router.post("/:id/retry", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const updated = await orchestrator.retryNotification(tenantId, req.params.id);
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: { code: "RETRY_FAILED", message: err.message } });
    }
  });

  // 7. List Templates (Tenant overrides merged with system defaults)
  router.get("/templates/all", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const templates = await templateRepo.listByTenant(tenantId);
      res.json(templates);
    } catch (err: any) {
      res.status(500).json({ error: { code: "TEMPLATES_FAILED", message: err.message } });
    }
  });

  // 8. Create or Update Template Override
  router.post("/templates", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const body = req.body;

      if (!body.key || !body.name || !body.channel || !body.bodyTemplate) {
        res.status(400).json({
          error: { code: "VALIDATION_FAILED", message: "key, name, channel, and bodyTemplate are required" },
        });
        return;
      }

      const existing = await templateRepo.findByKeyAndChannel(tenantId, body.key, body.channel);
      const templateRecord = {
        id: existing?.id || body.id || randomUUID(),
        tenantId,
        key: body.key,
        name: body.name,
        category: body.category || "TRANSACTIONAL",
        channel: body.channel,
        subjectTemplate: body.subjectTemplate,
        bodyTemplate: body.bodyTemplate,
        htmlTemplate: body.htmlTemplate,
        variablesSchema: body.variablesSchema || [],
        description: body.description,
        isSystemDefault: false,
        isActive: body.isActive !== undefined ? body.isActive : true,
        version: existing ? existing.version + 1 : 1,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const saved = await templateRepo.save(templateRecord);
      res.status(existing ? 200 : 201).json(saved);
    } catch (err: any) {
      res.status(500).json({ error: { code: "SAVE_TEMPLATE_FAILED", message: err.message } });
    }
  });

  // 9. Delete Template Override (Reverts back to system default)
  router.delete("/templates/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const tpl = await templateRepo.findById(req.params.id);
      if (!tpl || tpl.tenantId !== tenantId) {
        res.status(404).json({ error: { code: "NOT_FOUND", message: "Tenant template override not found" } });
        return;
      }
      await templateRepo.delete(tpl.id);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: { code: "DELETE_FAILED", message: err.message } });
    }
  });

  // 10. Communication Preferences by Party
  router.get("/preferences/:partyId", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const prefs = await preferenceRepo.listByParty(tenantId, req.params.partyId);
      res.json(prefs);
    } catch (err: any) {
      res.status(500).json({ error: { code: "PREFERENCES_FAILED", message: err.message } });
    }
  });

  // 11. Update Communication Preference
  router.put("/preferences/:partyId", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const partyId = req.params.partyId;
      const { channel, category, optedIn, recipient, partyType, source } = req.body;

      if (!channel || !category || optedIn === undefined) {
        res.status(400).json({
          error: { code: "VALIDATION_FAILED", message: "channel, category, and optedIn are required" },
        });
        return;
      }

      const existing = await preferenceRepo.findByPartyAndChannel(tenantId, partyId, channel, category);
      const record = {
        id: existing?.id || randomUUID(),
        tenantId,
        partyType: partyType || existing?.partyType || "CUSTOMER",
        partyId,
        recipient: recipient || existing?.recipient || "",
        channel,
        category,
        optedIn: Boolean(optedIn),
        source: source || "ADMIN_CONSOLE",
        updatedAt: new Date().toISOString(),
      };

      const saved = await preferenceRepo.save(record);
      res.json(saved);
    } catch (err: any) {
      res.status(500).json({ error: { code: "PREF_UPDATE_FAILED", message: err.message } });
    }
  });

  // 12. List Suppressions
  router.get("/suppressions/all", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const list = await suppressionRepo.list(tenantId);
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: { code: "SUPPRESSIONS_FAILED", message: err.message } });
    }
  });

  // 13. Add Suppression Manually
  router.post("/suppressions", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { channel, recipient, reason, notes } = req.body;

      if (!channel || !recipient || !reason) {
        res.status(400).json({
          error: { code: "VALIDATION_FAILED", message: "channel, recipient, and reason are required" },
        });
        return;
      }

      const saved = await suppressionRepo.suppress({
        id: randomUUID(),
        tenantId,
        channel,
        recipient,
        reason: reason as SuppressionReason,
        notes,
        createdAt: new Date().toISOString(),
      });

      res.status(201).json(saved);
    } catch (err: any) {
      res.status(500).json({ error: { code: "SUPPRESSION_FAILED", message: err.message } });
    }
  });

  // 14. Remove Suppression
  router.delete("/suppressions/:channel/:recipient", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const { channel, recipient } = req.params;
      const removed = await suppressionRepo.removeSuppression(
        tenantId,
        channel as NotificationChannel,
        decodeURIComponent(recipient)
      );
      res.json({ removed });
    } catch (err: any) {
      res.status(500).json({ error: { code: "DELETE_FAILED", message: err.message } });
    }
  });

  // 15. Provider Webhook Ingest (Public callback for SendGrid, Twilio, Meta, etc.)
  router.post("/webhooks/:provider", async (req: Request, res: Response) => {
    try {
      const provider = req.params.provider.toUpperCase();
      const sigHeader = req.headers["x-twilio-signature"] || req.headers["x-hub-signature-256"];
      const signature = Array.isArray(sigHeader) ? sigHeader[0] : (sigHeader as string | undefined);
      const receipt = await orchestrator.processDeliveryReceipt({
        provider,
        rawPayload: req.body,
        signature,
      });

      res.status(200).json({ status: "acknowledged", receiptId: receipt?.id });
    } catch (err: any) {
      res.status(400).json({ error: { code: "WEBHOOK_FAILED", message: err.message } });
    }
  });

  return router;
}
