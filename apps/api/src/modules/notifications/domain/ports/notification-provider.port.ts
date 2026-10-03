// ============================================================================
// CAR HIRE OS — NOTIFICATION PROVIDER PORT (DEV-012, SPRINT 32)
// Provider-agnostic contract for multi-channel communication infrastructure
// ============================================================================

import {
  NotificationChannel,
  NotificationCategory,
  NotificationStatus,
  ProviderSendResult,
  ProviderWebhookPayload,
} from "@car-hire-os/types";

export interface ProviderSendRequest {
  notificationId: string;
  tenantId: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  recipient: string;
  recipientName?: string;
  subject?: string;
  body: string;
  renderedHtml?: string;
  idempotencyKey: string;
  senderIdentifier?: string;
  senderName?: string;
  metadata?: Record<string, unknown>;
}

export interface ParsedWebhookReceipt {
  provider: string;
  providerMessageId: string;
  status: NotificationStatus;
  eventType: string;
  rawPayload: Record<string, unknown>;
  timestamp: string;
}

export interface INotificationProvider {
  readonly name: string;
  readonly supportedChannels: readonly NotificationChannel[];

  send(request: ProviderSendRequest): Promise<ProviderSendResult>;
  parseWebhook(payload: ProviderWebhookPayload): Promise<ParsedWebhookReceipt | null>;
}
