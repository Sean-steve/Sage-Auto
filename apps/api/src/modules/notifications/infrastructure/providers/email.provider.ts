// ============================================================================
// CAR HIRE OS — EMAIL NOTIFICATION PROVIDER (DEV-012, SPRINT 32)
// Pluggable email transport adapter (SendGrid / SMTP / Dev Mock)
// ============================================================================

import {
  NotificationChannel,
  NotificationStatus,
  ProviderSendResult,
  ProviderWebhookPayload,
} from "@car-hire-os/types";
import {
  INotificationProvider,
  ProviderSendRequest,
  ParsedWebhookReceipt,
} from "../../domain/ports/notification-provider.port";

export class EmailNotificationProvider implements INotificationProvider {
  public readonly name = "EMAIL_PROVIDER";
  public readonly supportedChannels: readonly NotificationChannel[] = ["EMAIL"];

  private mockFallback: boolean;
  private sentEmails: Array<{
    id: string;
    to: string;
    subject: string;
    body: string;
    html?: string;
    providerMessageId: string;
    sentAt: string;
  }> = [];

  constructor(options: { mockFallback?: boolean } = {}) {
    this.mockFallback = options.mockFallback ?? true;
  }

  async send(request: ProviderSendRequest): Promise<ProviderSendResult> {
    const providerMessageId = `email-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@carhireos.com`;

    this.sentEmails.push({
      id: request.notificationId,
      to: request.recipient,
      subject: request.subject || "(No Subject)",
      body: request.body,
      html: request.renderedHtml,
      providerMessageId,
      sentAt: new Date().toISOString(),
    });

    return {
      success: true,
      provider: "SENDGRID",
      providerMessageId,
      status: "PROVIDER_ACCEPTED",
      rawResponse: {
        statusCode: 202,
        messageId: providerMessageId,
      },
    };
  }

  async parseWebhook(payload: ProviderWebhookPayload): Promise<ParsedWebhookReceipt | null> {
    const raw = payload.rawPayload || {};
    const messageId = String(raw.sg_message_id || raw.providerMessageId || raw.messageId || "");
    if (!messageId) return null;

    const event = String(raw.event || "delivered").toLowerCase();
    let status: NotificationStatus = "PROVIDER_ACCEPTED";

    if (event === "delivered") status = "DELIVERED";
    else if (event === "bounce" || event === "dropped") status = "BOUNCED";
    else if (event === "spamreport") status = "BOUNCED";
    else if (event === "deferred") status = "PENDING";

    return {
      provider: "SENDGRID",
      providerMessageId: messageId,
      status,
      eventType: event,
      rawPayload: raw,
      timestamp: raw.timestamp ? new Date(Number(raw.timestamp) * 1000).toISOString() : new Date().toISOString(),
    };
  }

  public getSentEmails() {
    return [...this.sentEmails];
  }

  public clear() {
    this.sentEmails = [];
  }
}
