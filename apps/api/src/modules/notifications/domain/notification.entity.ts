// ============================================================================
// CAR HIRE OS — NOTIFICATION AGGREGATE ROOT (DEV-012, SPRINT 32)
// Encapsulates notification state lifecycle, invariant validation & history
// ============================================================================

import {
  NotificationRecord,
  NotificationChannel,
  NotificationCategory,
  NotificationStatus,
  NotificationPriority,
  PartyType,
} from "@car-hire-os/types";

export class NotificationEntity {
  private props: NotificationRecord;

  constructor(props: NotificationRecord) {
    this.validate(props);
    this.props = { ...props };
  }

  private validate(props: NotificationRecord): void {
    if (!props.id) throw new Error("Notification must have an ID");
    if (!props.tenantId) throw new Error("Notification must belong to a tenant");
    if (!props.recipient) throw new Error("Notification recipient cannot be empty");
    if (!props.body && !props.templateKey) {
      throw new Error("Notification must specify either body or templateKey");
    }
    if (!props.idempotencyKey) throw new Error("Notification must have an idempotency key");
  }

  public get toRecord(): NotificationRecord {
    return JSON.parse(JSON.stringify(this.props));
  }

  public get id(): string {
    return this.props.id;
  }

  public get tenantId(): string {
    return this.props.tenantId;
  }

  public get status(): NotificationStatus {
    return this.props.status;
  }

  public get channel(): NotificationChannel {
    return this.props.channel;
  }

  public get category(): NotificationCategory {
    return this.props.category;
  }

  public get recipient(): string {
    return this.props.recipient;
  }

  public get attempts(): number {
    return this.props.attempts;
  }

  public get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }

  public markQueued(): void {
    if (this.props.status !== "PENDING") {
      throw new Error(`Cannot queue notification from status: ${this.props.status}`);
    }
    this.props.status = "QUEUED";
    this.props.updatedAt = new Date().toISOString();
  }

  public markSending(): void {
    if (this.props.status !== "QUEUED" && this.props.status !== "PENDING" && this.props.status !== "FAILED") {
      throw new Error(`Cannot transition to SENDING from status: ${this.props.status}`);
    }
    this.props.status = "SENDING";
    this.props.attempts += 1;
    this.props.updatedAt = new Date().toISOString();
  }

  public markProviderAccepted(provider: string, providerMessageId: string): void {
    this.props.status = "PROVIDER_ACCEPTED";
    this.props.provider = provider;
    this.props.providerMessageId = providerMessageId;
    this.props.sentAt = new Date().toISOString();
    this.props.updatedAt = this.props.sentAt;
  }

  public markDelivered(timestamp?: string): void {
    this.props.status = "DELIVERED";
    this.props.deliveredAt = timestamp || new Date().toISOString();
    this.props.updatedAt = this.props.deliveredAt;
  }

  public markFailed(error: string, isTerminal = false): void {
    this.props.lastError = error;
    this.props.failedAt = new Date().toISOString();
    this.props.updatedAt = this.props.failedAt;

    if (isTerminal || this.props.attempts >= this.props.maxAttempts) {
      this.props.status = "FAILED";
    } else {
      // Return to QUEUED for exponential backoff retry
      this.props.status = "QUEUED";
    }
  }

  public markBounced(reason?: string): void {
    this.props.status = "BOUNCED";
    this.props.lastError = reason || "Recipient mailbox bounced or phone rejected";
    this.props.failedAt = new Date().toISOString();
    this.props.updatedAt = this.props.failedAt;
  }

  public markSuppressed(reason: string): void {
    this.props.status = "SUPPRESSED";
    this.props.lastError = `Suppressed: ${reason}`;
    this.props.updatedAt = new Date().toISOString();
  }

  public static create(params: {
    id: string;
    tenantId: string;
    channel: NotificationChannel;
    category: NotificationCategory;
    priority?: NotificationPriority;
    recipient: string;
    recipientName?: string;
    recipientPartyType?: PartyType;
    recipientPartyId?: string;
    subject?: string;
    body: string;
    renderedHtml?: string;
    templateId?: string;
    templateKey?: string;
    templateVersion?: number;
    variables?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    idempotencyKey: string;
    correlationId?: string;
    causationEventId?: string;
    maxAttempts?: number;
    scheduledFor?: string;
  }): NotificationEntity {
    const now = new Date().toISOString();
    const record: NotificationRecord = {
      id: params.id,
      tenantId: params.tenantId,
      channel: params.channel,
      category: params.category,
      status: "PENDING",
      priority: params.priority || "NORMAL",
      recipient: params.recipient.trim(),
      recipientName: params.recipientName,
      recipientPartyType: params.recipientPartyType,
      recipientPartyId: params.recipientPartyId,
      subject: params.subject,
      body: params.body,
      renderedHtml: params.renderedHtml,
      templateId: params.templateId,
      templateKey: params.templateKey,
      templateVersion: params.templateVersion || 1,
      variables: params.variables || {},
      metadata: params.metadata || {},
      idempotencyKey: params.idempotencyKey,
      correlationId: params.correlationId,
      causationEventId: params.causationEventId,
      attempts: 0,
      maxAttempts: params.maxAttempts || 3,
      scheduledFor: params.scheduledFor,
      createdAt: now,
      updatedAt: now,
    };

    return new NotificationEntity(record);
  }
}
