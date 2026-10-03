// ============================================================================
// CAR HIRE OS — WHATSAPP NOTIFICATION PROVIDER (DEV-012, SPRINT 32)
// Meta WhatsApp Cloud API Provider Adapter
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
import { SmsNotificationProvider } from "./sms.provider";

export class WhatsAppNotificationProvider implements INotificationProvider {
  public readonly name = "WHATSAPP_PROVIDER";
  public readonly supportedChannels: readonly NotificationChannel[] = ["WHATSAPP"];

  private sentMessages: Array<{
    id: string;
    to: string;
    body: string;
    providerMessageId: string;
    sentAt: string;
  }> = [];

  async send(request: ProviderSendRequest): Promise<ProviderSendResult> {
    const normalizedPhone = SmsNotificationProvider.normalizePhoneNumber(request.recipient);
    const providerMessageId = `wamid.HBgL${Date.now()}${Math.random().toString(36).substring(2, 9)}`;

    this.sentMessages.push({
      id: request.notificationId,
      to: normalizedPhone,
      body: request.body,
      providerMessageId,
      sentAt: new Date().toISOString(),
    });

    return {
      success: true,
      provider: "WHATSAPP_CLOUD",
      providerMessageId,
      status: "PROVIDER_ACCEPTED",
      rawResponse: {
        messaging_product: "whatsapp",
        contacts: [{ input: normalizedPhone, wa_id: normalizedPhone.replace("+", "") }],
        messages: [{ id: providerMessageId }],
      },
    };
  }

  async parseWebhook(payload: ProviderWebhookPayload): Promise<ParsedWebhookReceipt | null> {
    const raw = payload.rawPayload || {};
    // WhatsApp Cloud API sends entry[0].changes[0].value.statuses[0]
    let messageId = "";
    let statusStr = "delivered";
    let timestamp = new Date().toISOString();

    try {
      const entry = (raw.entry as any[])?.[0];
      const change = entry?.changes?.[0];
      const statusObj = change?.value?.statuses?.[0];

      if (statusObj) {
        messageId = statusObj.id;
        statusStr = statusObj.status;
        if (statusObj.timestamp) {
          timestamp = new Date(Number(statusObj.timestamp) * 1000).toISOString();
        }
      } else {
        messageId = String(raw.messageId || raw.providerMessageId || "");
        statusStr = String(raw.status || "delivered");
      }
    } catch {
      messageId = String(raw.messageId || raw.providerMessageId || "");
    }

    if (!messageId) return null;

    let status: NotificationStatus = "PROVIDER_ACCEPTED";
    if (statusStr === "delivered" || statusStr === "read") status = "DELIVERED";
    else if (statusStr === "failed") status = "FAILED";
    else if (statusStr === "sent") status = "PROVIDER_ACCEPTED";

    return {
      provider: "WHATSAPP_CLOUD",
      providerMessageId: messageId,
      status,
      eventType: statusStr,
      rawPayload: raw,
      timestamp,
    };
  }

  public getSentMessages() {
    return [...this.sentMessages];
  }

  public clear() {
    this.sentMessages = [];
  }
}
