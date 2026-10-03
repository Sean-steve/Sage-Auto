// ============================================================================
// CAR HIRE OS — MOCK NOTIFICATION PROVIDER ADAPTER (DEV-012, SPRINT 32)
// In-memory test/dev provider with message capture & receipt simulation
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

export interface CapturedMessage {
  id: string;
  providerMessageId: string;
  request: ProviderSendRequest;
  sentAt: string;
}

export class MockNotificationProvider implements INotificationProvider {
  public readonly name = "MOCK_PROVIDER";
  public readonly supportedChannels: readonly NotificationChannel[] = ["EMAIL", "SMS", "WHATSAPP"];

  private messages: CapturedMessage[] = [];
  private shouldFailNext = false;
  private failureError = "Simulated network timeout connecting to provider gateway";

  public setFailNext(shouldFail: boolean, error?: string): void {
    this.shouldFailNext = shouldFail;
    if (error) this.failureError = error;
  }

  async send(request: ProviderSendRequest): Promise<ProviderSendResult> {
    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      return {
        success: false,
        provider: this.name,
        status: "FAILED",
        error: this.failureError,
      };
    }

    const providerMessageId = `mock-msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const captured: CapturedMessage = {
      id: request.notificationId,
      providerMessageId,
      request: JSON.parse(JSON.stringify(request)),
      sentAt: new Date().toISOString(),
    };

    this.messages.push(captured);

    return {
      success: true,
      provider: this.name,
      providerMessageId,
      status: "PROVIDER_ACCEPTED",
      rawResponse: {
        id: providerMessageId,
        recipient: request.recipient,
        acceptedAt: captured.sentAt,
      },
    };
  }

  async parseWebhook(payload: ProviderWebhookPayload): Promise<ParsedWebhookReceipt | null> {
    const raw = payload.rawPayload || {};
    const messageId = String(raw.messageId || raw.providerMessageId || raw.id || "");
    if (!messageId) return null;

    const event = String(raw.event || raw.status || "delivered").toLowerCase();
    let status: NotificationStatus = "PROVIDER_ACCEPTED";

    if (event === "delivered") status = "DELIVERED";
    else if (event === "bounce" || event === "bounced") status = "BOUNCED";
    else if (event === "failed" || event === "rejected") status = "FAILED";

    return {
      provider: this.name,
      providerMessageId: messageId,
      status,
      eventType: event,
      rawPayload: raw,
      timestamp: raw.timestamp ? String(raw.timestamp) : new Date().toISOString(),
    };
  }

  public getSentMessages(): CapturedMessage[] {
    return [...this.messages];
  }

  public getMessagesForRecipient(recipient: string): CapturedMessage[] {
    const norm = recipient.trim().toLowerCase();
    return this.messages.filter((m) => m.request.recipient.trim().toLowerCase() === norm);
  }

  public getLastMessage(): CapturedMessage | undefined {
    return this.messages[this.messages.length - 1];
  }

  public clear(): void {
    this.messages = [];
    this.shouldFailNext = false;
  }
}
