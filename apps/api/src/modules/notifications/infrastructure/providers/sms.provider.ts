// ============================================================================
// CAR HIRE OS — SMS NOTIFICATION PROVIDER (DEV-012, SPRINT 32)
// Pluggable SMS transport adapter (Twilio / Africa's Talking / Dev Mock)
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

export interface SmsSegmentationInfo {
  isUnicode: boolean;
  charCount: number;
  segmentCount: number;
  maxSingleSegment: number;
}

export class SmsNotificationProvider implements INotificationProvider {
  public readonly name = "SMS_PROVIDER";
  public readonly supportedChannels: readonly NotificationChannel[] = ["SMS"];

  private sentSms: Array<{
    id: string;
    to: string;
    body: string;
    providerMessageId: string;
    segments: number;
    sentAt: string;
  }> = [];

  /**
   * Calculates SMS segmentation according to GSM 03.38 standard
   */
  public static calculateSegmentation(text: string): SmsSegmentationInfo {
    // Check if string contains any character outside GSM 7-bit standard
    const gsm7Regex = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1BÆæßÉ !"#¤%&'()*+,\-.\/0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà^{}\\[~\]|€]*$/;
    const isUnicode = !gsm7Regex.test(text);

    const charCount = text.length;
    let segmentCount = 1;
    let maxSingleSegment = isUnicode ? 70 : 160;

    if (isUnicode) {
      if (charCount > 70) {
        segmentCount = Math.ceil(charCount / 67);
      }
    } else {
      if (charCount > 160) {
        segmentCount = Math.ceil(charCount / 153);
      }
    }

    return {
      isUnicode,
      charCount,
      segmentCount,
      maxSingleSegment,
    };
  }

  /**
   * Normalizes recipient phone to E.164 standard format
   */
  public static normalizePhoneNumber(phone: string, defaultCountryPrefix = "+254"): string {
    const cleaned = phone.replace(/[^0-9+]/g, "");
    if (cleaned.startsWith("+")) {
      return cleaned;
    }
    if (cleaned.startsWith("0")) {
      return defaultCountryPrefix + cleaned.substring(1);
    }
    if (cleaned.startsWith("254")) {
      return "+" + cleaned;
    }
    return defaultCountryPrefix + cleaned;
  }

  async send(request: ProviderSendRequest): Promise<ProviderSendResult> {
    const normalizedPhone = SmsNotificationProvider.normalizePhoneNumber(request.recipient);
    const segmentation = SmsNotificationProvider.calculateSegmentation(request.body);
    const providerMessageId = `sms-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    this.sentSms.push({
      id: request.notificationId,
      to: normalizedPhone,
      body: request.body,
      providerMessageId,
      segments: segmentation.segmentCount,
      sentAt: new Date().toISOString(),
    });

    return {
      success: true,
      provider: "TWILIO",
      providerMessageId,
      status: "PROVIDER_ACCEPTED",
      rawResponse: {
        sid: providerMessageId,
        to: normalizedPhone,
        segments: segmentation.segmentCount,
      },
    };
  }

  async parseWebhook(payload: ProviderWebhookPayload): Promise<ParsedWebhookReceipt | null> {
    const raw = payload.rawPayload || {};
    const messageId = String(raw.MessageSid || raw.SmsSid || raw.providerMessageId || raw.id || "");
    if (!messageId) return null;

    const messageStatus = String(raw.MessageStatus || raw.SmsStatus || "delivered").toLowerCase();
    let status: NotificationStatus = "PROVIDER_ACCEPTED";

    if (messageStatus === "delivered") status = "DELIVERED";
    else if (messageStatus === "undelivered" || messageStatus === "failed") status = "FAILED";
    else if (messageStatus === "sent") status = "PROVIDER_ACCEPTED";

    return {
      provider: "TWILIO",
      providerMessageId: messageId,
      status,
      eventType: messageStatus,
      rawPayload: raw,
      timestamp: new Date().toISOString(),
    };
  }

  public getSentSms() {
    return [...this.sentSms];
  }

  public clear() {
    this.sentSms = [];
  }
}
