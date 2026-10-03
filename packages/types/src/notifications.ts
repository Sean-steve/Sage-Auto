// ============================================================================
// CAR HIRE OS — NOTIFICATIONS & COMMUNICATION TYPES (DEV-012, SPRINT 32)
// Multi-channel communication orchestration, templates, delivery receipts & preferences
// ============================================================================

export type NotificationChannel = "EMAIL" | "SMS" | "WHATSAPP";

export type NotificationCategory =
  | "TRANSACTIONAL"
  | "OPERATIONAL"
  | "SECURITY"
  | "MARKETING";

export type NotificationStatus =
  | "PENDING"
  | "QUEUED"
  | "SENDING"
  | "PROVIDER_ACCEPTED"
  | "DELIVERED"
  | "FAILED"
  | "BOUNCED"
  | "REJECTED"
  | "SUPPRESSED";

export type NotificationPriority = "HIGH" | "NORMAL" | "LOW";

export type SuppressionReason =
  | "UNSUBSCRIBED"
  | "HARD_BOUNCE"
  | "SPAM_COMPLAINT"
  | "MANUAL_BLOCK";

export type PartyType = "CUSTOMER" | "DRIVER" | "OWNER" | "USER" | "SYSTEM";

export interface NotificationRecord {
  id: string;
  tenantId: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  status: NotificationStatus;
  priority: NotificationPriority;
  recipient: string; // email address or E.164 phone number
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
  provider?: string;
  providerMessageId?: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  sentAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  scheduledFor?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationReceiptRecord {
  id: string;
  notificationId: string;
  tenantId: string;
  channel: NotificationChannel;
  provider: string;
  providerMessageId: string;
  status: NotificationStatus;
  eventType?: string; // e.g., "delivered", "bounce", "open", "click"
  rawPayload: Record<string, unknown>;
  timestamp: string;
  createdAt: string;
}

export interface NotificationTemplateRecord {
  id: string;
  tenantId: string | null; // null represents platform/system default
  key: string; // e.g. "booking.confirmation"
  name: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  subjectTemplate?: string;
  bodyTemplate: string;
  htmlTemplate?: string;
  variablesSchema: Array<{
    name: string;
    description: string;
    required: boolean;
    defaultValue?: string;
  }>;
  description?: string;
  isSystemDefault: boolean;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationPreferenceRecord {
  id: string;
  tenantId: string;
  partyType: PartyType;
  partyId: string;
  recipient: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  optedIn: boolean;
  source?: string;
  updatedAt: string;
}

export interface NotificationSuppressionRecord {
  id: string;
  tenantId: string | null; // null represents global platform-wide suppression
  channel: NotificationChannel;
  recipient: string; // normalized email or E.164 phone
  reason: SuppressionReason;
  notes?: string;
  createdAt: string;
}

export interface NotificationProviderConfigRecord {
  id: string;
  tenantId: string;
  channel: NotificationChannel;
  providerName: string; // e.g. "SENDGRID", "TWILIO", "AFRICASTALKING", "WHATSAPP_CLOUD"
  isEnabled: boolean;
  isDefault: boolean;
  senderIdentifier?: string; // e.g. "support@autopecsage.com" or "+254712345678" or "CarHireOS"
  senderName?: string;
  credentialsMasked?: Record<string, string>; // non-secret settings or masked values
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// DTOs and Presentation Contracts
// ----------------------------------------------------------------------------

export interface SendNotificationIntentDto {
  tenantId: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  priority?: NotificationPriority;
  recipient: string;
  recipientName?: string;
  recipientPartyType?: PartyType;
  recipientPartyId?: string;
  templateKey?: string;
  subject?: string;
  body?: string;
  renderedHtml?: string;
  variables?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  causationEventId?: string;
  scheduledFor?: string;
}

export interface NotificationFilterParams {
  tenantId: string;
  channel?: NotificationChannel;
  category?: NotificationCategory;
  status?: NotificationStatus;
  recipient?: string;
  templateKey?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface NotificationStatsDto {
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalSuppressed: number;
  deliveryRatePercent: number;
  byChannel: {
    email: { sent: number; delivered: number; failed: number };
    sms: { sent: number; delivered: number; failed: number };
    whatsapp: { sent: number; delivered: number; failed: number };
  };
  byCategory: Record<NotificationCategory, number>;
}

export interface RenderTemplateResult {
  subject?: string;
  body: string;
  renderedHtml?: string;
}

export interface ProviderSendResult {
  success: boolean;
  provider: string;
  providerMessageId?: string;
  status: NotificationStatus;
  error?: string;
  rawResponse?: Record<string, unknown>;
}

export interface ProviderWebhookPayload {
  provider: string;
  rawPayload: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  signature?: string;
}
