// ============================================================================
// CAR HIRE OS — NOTIFICATION ORCHESTRATOR SERVICE (DEV-012, SPRINT 32)
// Core orchestration: Intent creation, suppression, preferences, templates & delivery
// ============================================================================

import { createHash, randomUUID } from "crypto";
import {
  NotificationRecord,
  NotificationReceiptRecord,
  NotificationChannel,
  NotificationCategory,
  NotificationStatus,
  SendNotificationIntentDto,
  NotificationFilterParams,
  NotificationStatsDto,
  ProviderSendResult,
  ProviderWebhookPayload,
  NotificationTemplateRecord,
} from "@car-hire-os/types";
import {
  INotificationRepository,
  INotificationReceiptRepository,
  INotificationTemplateRepository,
  ICommunicationPreferenceRepository,
  INotificationSuppressionRepository,
  ITenantRepository,
  ITenantWebsiteRepository,
  IWebsiteDomainRepository,
} from "@car-hire-os/database";
import { EVENT_TYPES, DomainEventEnvelope } from "@carhire/contracts";
import { IEventBus } from "../../../../infrastructure/events/event-bus";
import { NotificationEntity } from "../../domain/notification.entity";
import { TemplateEngine } from "../../domain/template-engine";
import { DEFAULT_NOTIFICATION_TEMPLATES } from "../../domain/default-templates";
import { ProviderRegistryService } from "../../infrastructure/providers/provider-registry.service";
import { ProviderSendRequest } from "../../domain/ports/notification-provider.port";

export interface OrchestrationResult {
  notification: NotificationRecord;
  providerResult?: ProviderSendResult;
  suppressed?: boolean;
  suppressionReason?: string;
  isDuplicate?: boolean;
}

export class NotificationOrchestratorService {
  constructor(
    private readonly notificationRepo: INotificationRepository,
    private readonly receiptRepo: INotificationReceiptRepository,
    private readonly templateRepo: INotificationTemplateRepository,
    private readonly preferenceRepo: ICommunicationPreferenceRepository,
    private readonly suppressionRepo: INotificationSuppressionRepository,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly eventBus?: IEventBus,
    private readonly tenantRepo?: ITenantRepository,
    private readonly websiteRepo?: ITenantWebsiteRepository,
    private readonly domainRepo?: IWebsiteDomainRepository
  ) {}

  /**
   * Initializes default system notification templates
   */
  public async initializeDefaultTemplates(): Promise<void> {
    const templatesWithTimestamps: NotificationTemplateRecord[] = DEFAULT_NOTIFICATION_TEMPLATES.map(
      (tpl) => ({
        ...tpl,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );
    await this.templateRepo.seedDefaultTemplates(templatesWithTimestamps);
  }

  /**
   * Computes a deterministic idempotency key for at-least-once delivery protection
   */
  public generateIdempotencyKey(params: {
    tenantId: string;
    channel: NotificationChannel;
    recipient: string;
    templateKey?: string;
    correlationId?: string;
    causationEventId?: string;
  }): string {
    const raw = `${params.tenantId}:${params.channel}:${params.recipient.toLowerCase().trim()}:${params.templateKey || "raw"}:${params.correlationId || params.causationEventId || "default"}`;
    return createHash("sha256").update(raw).digest("hex");
  }

  /**
   * Resolves canonical website base URL according to website domain architecture
   */
  public async resolveCanonicalWebsiteBaseUrl(tenantId: string): Promise<string> {
    try {
      if (this.websiteRepo && this.domainRepo) {
        const website = await this.websiteRepo.findByTenantId(tenantId);
        if (website) {
          const domains = await this.domainRepo.listByWebsiteId(website.id);
          const primaryDomain = domains.find(
            (d) => d.isPrimary && (d.verificationStatus === "VERIFIED" || Boolean(d.verifiedAt))
          );
          if (primaryDomain) {
            return `https://${primaryDomain.hostname}`;
          }
          if (website.subdomain) {
            return `https://${website.subdomain}.carhireos.com`;
          }
        }
      }
      if (this.tenantRepo) {
        const tenant = await this.tenantRepo.findById(tenantId);
        if (tenant?.slug) {
          return `https://${tenant.slug}.carhireos.com`;
        }
      }
    } catch {
      // Safe fallback
    }
    return "https://app.carhireos.com";
  }

  /**
   * Evaluates policy and dispatches a notification intent
   */
  public async sendNotificationIntent(dto: SendNotificationIntentDto): Promise<OrchestrationResult> {
    const tenantId = dto.tenantId;
    const channel = dto.channel;
    const category = dto.category;
    const recipient = dto.recipient.trim();

    // 1. Check Idempotency first
    const idempotencyKey = this.generateIdempotencyKey({
      tenantId,
      channel,
      recipient,
      templateKey: dto.templateKey,
      correlationId: dto.correlationId,
      causationEventId: dto.causationEventId,
    });

    const existing = await this.notificationRepo.findByIdempotencyKey(tenantId, idempotencyKey);
    if (existing) {
      return {
        notification: existing,
        isDuplicate: true,
      };
    }

    // 2. Check Suppression List (Bounces, Unsubscribes, Manual Blocks)
    const suppressionCheck = await this.suppressionRepo.isSuppressed(tenantId, channel, recipient);
    if (suppressionCheck.isSuppressed) {
      const entity = NotificationEntity.create({
        id: randomUUID(),
        tenantId,
        channel,
        category,
        priority: dto.priority,
        recipient,
        recipientName: dto.recipientName,
        recipientPartyType: dto.recipientPartyType,
        recipientPartyId: dto.recipientPartyId,
        subject: dto.subject,
        body: dto.body || `[Suppressed: ${suppressionCheck.reason}]`,
        templateKey: dto.templateKey,
        variables: dto.variables,
        metadata: dto.metadata,
        idempotencyKey,
        correlationId: dto.correlationId,
        causationEventId: dto.causationEventId,
      });

      entity.markSuppressed(suppressionCheck.reason || "RECIPIENT_SUPPRESSED");
      const saved = await this.notificationRepo.save(entity.toRecord);

      await this.publishEvent(EVENT_TYPES.NOTIFICATION_SUPPRESSED, {
        tenantId,
        channel,
        recipient,
        category,
        reason: suppressionCheck.reason || "RECIPIENT_SUPPRESSED",
      });

      return {
        notification: saved,
        suppressed: true,
        suppressionReason: suppressionCheck.reason,
      };
    }

    // 3. Check Recipient Communication Preferences
    if (dto.recipientPartyId) {
      const isOptedIn = await this.preferenceRepo.isOptedIn(
        tenantId,
        dto.recipientPartyId,
        channel,
        category
      );

      if (!isOptedIn) {
        const entity = NotificationEntity.create({
          id: randomUUID(),
          tenantId,
          channel,
          category,
          priority: dto.priority,
          recipient,
          recipientName: dto.recipientName,
          recipientPartyType: dto.recipientPartyType,
          recipientPartyId: dto.recipientPartyId,
          subject: dto.subject,
          body: dto.body || `[Opted Out by Recipient Preference]`,
          templateKey: dto.templateKey,
          variables: dto.variables,
          metadata: dto.metadata,
          idempotencyKey,
          correlationId: dto.correlationId,
          causationEventId: dto.causationEventId,
        });

        entity.markSuppressed("PREFERENCE_OPT_OUT");
        const saved = await this.notificationRepo.save(entity.toRecord);

        await this.publishEvent(EVENT_TYPES.NOTIFICATION_SUPPRESSED, {
          tenantId,
          channel,
          recipient,
          category,
          reason: "PREFERENCE_OPT_OUT",
        });

        return {
          notification: saved,
          suppressed: true,
          suppressionReason: "PREFERENCE_OPT_OUT",
        };
      }
    }

    // 4. Resolve Template and Variables
    let renderedSubject = dto.subject;
    let renderedBody = dto.body || "";
    let renderedHtml = dto.renderedHtml;
    let templateId: string | undefined;
    let templateVersion = 1;

    // Inject canonical website URL and tenant info into variables
    const baseUrl = await this.resolveCanonicalWebsiteBaseUrl(tenantId);
    const enrichedVariables: Record<string, unknown> = {
      ...dto.variables,
      portalUrl: dto.variables?.portalUrl || `${baseUrl}/portal`,
      contractUrl: dto.variables?.contractUrl || `${baseUrl}/portal/contract`,
      checkoutUrl: dto.variables?.checkoutUrl || `${baseUrl}/checkout`,
      inspectionUrl: dto.variables?.inspectionUrl || `${baseUrl}/portal/inspection`,
      complianceUrl: dto.variables?.complianceUrl || `${baseUrl}/admin/compliance`,
    };

    if (dto.templateKey) {
      const template = await this.templateRepo.resolveEffectiveTemplate(
        tenantId,
        dto.templateKey,
        channel
      );

      if (template) {
        templateId = template.id;
        templateVersion = template.version;

        if (template.subjectTemplate) {
          renderedSubject = TemplateEngine.render(template.subjectTemplate, enrichedVariables);
        }
        renderedBody = TemplateEngine.render(template.bodyTemplate, enrichedVariables);
        if (template.htmlTemplate) {
          renderedHtml = TemplateEngine.render(template.htmlTemplate, enrichedVariables, {
            escapeHtml: false, // HTML templates contain markup, tokens are escaped inside
          });
        }
      }
    } else {
      if (renderedSubject) {
        renderedSubject = TemplateEngine.render(renderedSubject, enrichedVariables);
      }
      renderedBody = TemplateEngine.render(renderedBody, enrichedVariables);
      if (renderedHtml) {
        renderedHtml = TemplateEngine.render(renderedHtml, enrichedVariables, { escapeHtml: false });
      }
    }

    // 5. Create Notification Record in PENDING state
    const entity = NotificationEntity.create({
      id: randomUUID(),
      tenantId,
      channel,
      category,
      priority: dto.priority,
      recipient,
      recipientName: dto.recipientName,
      recipientPartyType: dto.recipientPartyType,
      recipientPartyId: dto.recipientPartyId,
      subject: renderedSubject,
      body: renderedBody,
      renderedHtml,
      templateId,
      templateKey: dto.templateKey,
      templateVersion,
      variables: enrichedVariables,
      metadata: dto.metadata,
      idempotencyKey,
      correlationId: dto.correlationId,
      causationEventId: dto.causationEventId,
      scheduledFor: dto.scheduledFor,
    });

    entity.markQueued();
    let saved = await this.notificationRepo.save(entity.toRecord);

    await this.publishEvent(EVENT_TYPES.NOTIFICATION_CREATED, {
      notificationId: saved.id,
      tenantId: saved.tenantId,
      channel: saved.channel,
      category: saved.category,
      recipient: saved.recipient,
      templateKey: saved.templateKey,
      idempotencyKey: saved.idempotencyKey,
      correlationId: saved.correlationId,
    });

    // 6. Asynchronous Dispatch to Provider
    entity.markSending();
    saved = await this.notificationRepo.save(entity.toRecord);

    const provider = await this.providerRegistry.resolveProvider(tenantId, channel);

    const sendRequest: ProviderSendRequest = {
      notificationId: saved.id,
      tenantId: saved.tenantId,
      channel: saved.channel,
      category: saved.category,
      recipient: saved.recipient,
      recipientName: saved.recipientName,
      subject: saved.subject,
      body: saved.body,
      renderedHtml: saved.renderedHtml,
      idempotencyKey: saved.idempotencyKey,
      metadata: saved.metadata,
    };

    let providerResult: ProviderSendResult;
    try {
      providerResult = await provider.send(sendRequest);

      if (providerResult.success && providerResult.providerMessageId) {
        entity.markProviderAccepted(providerResult.provider, providerResult.providerMessageId);
        saved = await this.notificationRepo.save(entity.toRecord);

        await this.publishEvent(EVENT_TYPES.NOTIFICATION_SENT, {
          notificationId: saved.id,
          tenantId: saved.tenantId,
          channel: saved.channel,
          recipient: saved.recipient,
          provider: providerResult.provider,
          providerMessageId: providerResult.providerMessageId,
          attempts: saved.attempts,
          sentAt: saved.sentAt || new Date().toISOString(),
        });
      } else {
        entity.markFailed(providerResult.error || "Provider rejected delivery request");
        saved = await this.notificationRepo.save(entity.toRecord);

        await this.publishEvent(EVENT_TYPES.NOTIFICATION_FAILED, {
          notificationId: saved.id,
          tenantId: saved.tenantId,
          channel: saved.channel,
          recipient: saved.recipient,
          error: saved.lastError || "Unknown provider error",
          attempts: saved.attempts,
          isTerminal: saved.status === "FAILED",
        });
      }
    } catch (err: any) {
      entity.markFailed(err.message || "Exception during provider transport");
      saved = await this.notificationRepo.save(entity.toRecord);

      await this.publishEvent(EVENT_TYPES.NOTIFICATION_FAILED, {
        notificationId: saved.id,
        tenantId: saved.tenantId,
        channel: saved.channel,
        recipient: saved.recipient,
        error: saved.lastError || "Transport exception",
        attempts: saved.attempts,
        isTerminal: saved.status === "FAILED",
      });

      providerResult = {
        success: false,
        provider: provider.name,
        status: "FAILED",
        error: err.message,
      };
    }

    return {
      notification: saved,
      providerResult,
    };
  }

  /**
   * Processes an incoming delivery receipt or webhook callback from a provider
   */
  public async processDeliveryReceipt(
    payload: ProviderWebhookPayload
  ): Promise<NotificationReceiptRecord | null> {
    const provider = this.providerRegistry.getProviderByName(payload.provider) ||
      this.providerRegistry.getMockProvider();

    const parsed = await provider.parseWebhook(payload);
    if (!parsed || !parsed.providerMessageId) {
      return null;
    }

    const notification = await this.notificationRepo.findByProviderMessageId(parsed.providerMessageId);
    if (!notification) {
      return null;
    }

    // Record receipt audit
    const receipt: NotificationReceiptRecord = {
      id: randomUUID(),
      notificationId: notification.id,
      tenantId: notification.tenantId,
      channel: notification.channel,
      provider: parsed.provider,
      providerMessageId: parsed.providerMessageId,
      status: parsed.status,
      eventType: parsed.eventType,
      rawPayload: parsed.rawPayload,
      timestamp: parsed.timestamp,
      createdAt: new Date().toISOString(),
    };

    const savedReceipt = await this.receiptRepo.save(receipt);

    // Update notification status
    const entity = new NotificationEntity(notification);
    if (parsed.status === "DELIVERED") {
      entity.markDelivered(parsed.timestamp);
      await this.notificationRepo.save(entity.toRecord);

      await this.publishEvent(EVENT_TYPES.NOTIFICATION_DELIVERED, {
        notificationId: notification.id,
        tenantId: notification.tenantId,
        channel: notification.channel,
        recipient: notification.recipient,
        provider: parsed.provider,
        providerMessageId: parsed.providerMessageId,
        deliveredAt: parsed.timestamp,
      });
    } else if (parsed.status === "BOUNCED") {
      entity.markBounced("Provider reported bounce/drop");
      await this.notificationRepo.save(entity.toRecord);

      // Automatically suppress hard bounces
      await this.suppressionRepo.suppress({
        id: randomUUID(),
        tenantId: notification.tenantId,
        channel: notification.channel,
        recipient: notification.recipient,
        reason: "HARD_BOUNCE",
        notes: `Automatic suppression from provider bounce receipt (${parsed.provider})`,
        createdAt: new Date().toISOString(),
      });

      await this.publishEvent(EVENT_TYPES.NOTIFICATION_BOUNCED, {
        notificationId: notification.id,
        tenantId: notification.tenantId,
        channel: notification.channel,
        recipient: notification.recipient,
        provider: parsed.provider,
        providerMessageId: parsed.providerMessageId,
      });
    }

    return savedReceipt;
  }

  /**
   * Retries a failed notification
   */
  public async retryNotification(tenantId: string, notificationId: string): Promise<NotificationRecord> {
    const notification = await this.notificationRepo.findByTenantAndId(tenantId, notificationId);
    if (!notification) {
      throw new Error(`Notification not found: ${notificationId}`);
    }

    if (notification.status !== "FAILED" && notification.status !== "QUEUED") {
      throw new Error(`Cannot retry notification in status: ${notification.status}`);
    }

    const entity = new NotificationEntity(notification);
    entity.markSending();
    let saved = await this.notificationRepo.save(entity.toRecord);

    const provider = await this.providerRegistry.resolveProvider(tenantId, saved.channel);

    const sendRequest: ProviderSendRequest = {
      notificationId: saved.id,
      tenantId: saved.tenantId,
      channel: saved.channel,
      category: saved.category,
      recipient: saved.recipient,
      recipientName: saved.recipientName,
      subject: saved.subject,
      body: saved.body,
      renderedHtml: saved.renderedHtml,
      idempotencyKey: `${saved.idempotencyKey}:retry:${saved.attempts}`,
      metadata: saved.metadata,
    };

    try {
      const result = await provider.send(sendRequest);
      if (result.success && result.providerMessageId) {
        entity.markProviderAccepted(result.provider, result.providerMessageId);
        saved = await this.notificationRepo.save(entity.toRecord);

        await this.publishEvent(EVENT_TYPES.NOTIFICATION_SENT, {
          notificationId: saved.id,
          tenantId: saved.tenantId,
          channel: saved.channel,
          recipient: saved.recipient,
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          attempts: saved.attempts,
          sentAt: saved.sentAt || new Date().toISOString(),
        });
      } else {
        entity.markFailed(result.error || "Retry failed");
        saved = await this.notificationRepo.save(entity.toRecord);
      }
    } catch (err: any) {
      entity.markFailed(err.message || "Retry exception");
      saved = await this.notificationRepo.save(entity.toRecord);
    }

    return saved;
  }

  /**
   * Helper to safely publish domain events
   */
  private async publishEvent<T = any>(eventType: string, data: T): Promise<void> {
    if (!this.eventBus) return;

    const envelope: DomainEventEnvelope<T> = {
      eventId: randomUUID(),
      eventType,
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      source: "carhire.notifications",
      correlationId: randomUUID(),
      aggregate: {
        type: "Notification",
        id: (data as any)?.notificationId || randomUUID(),
      },
      actor: {
        type: "SYSTEM",
      },
      data,
    };

    try {
      await this.eventBus.publish(envelope);
    } catch (err) {
      console.error(`[NotificationOrchestrator] Failed to publish event ${eventType}:`, err);
    }
  }

  public async getDeliveryLogs(filter: NotificationFilterParams): Promise<{ items: NotificationRecord[]; total: number }> {
    return this.notificationRepo.findMany(filter);
  }

  public async getStats(tenantId: string): Promise<NotificationStatsDto> {
    return this.notificationRepo.getStats(tenantId);
  }
}
