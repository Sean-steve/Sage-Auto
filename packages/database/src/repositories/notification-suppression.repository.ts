import { createRecordStore } from "../record-store";
import {
  NotificationSuppressionRecord,
  NotificationChannel,
  SuppressionReason,
} from "@car-hire-os/types";

export interface INotificationSuppressionRepository {
  isSuppressed(
    tenantId: string,
    channel: NotificationChannel,
    recipient: string
  ): Promise<{ isSuppressed: boolean; reason?: SuppressionReason }>;
  suppress(record: NotificationSuppressionRecord): Promise<NotificationSuppressionRecord>;
  removeSuppression(
    tenantId: string | null,
    channel: NotificationChannel,
    recipient: string
  ): Promise<boolean>;
  list(tenantId: string): Promise<NotificationSuppressionRecord[]>;
  clear(): void;
}

export class InMemoryNotificationSuppressionRepository implements INotificationSuppressionRepository {
  private suppressions: Map<string, NotificationSuppressionRecord> = createRecordStore("notification-suppression.repository:suppressions");

  private normalizeRecipient(recipient: string): string {
    return recipient.trim().toLowerCase();
  }

  async isSuppressed(
    tenantId: string,
    channel: NotificationChannel,
    recipient: string
  ): Promise<{ isSuppressed: boolean; reason?: SuppressionReason }> {
    const norm = this.normalizeRecipient(recipient);

    // 1. Check tenant-specific suppression
    for (const s of this.suppressions.values()) {
      if (
        (s.tenantId === tenantId || s.tenantId === null) &&
        s.channel === channel &&
        this.normalizeRecipient(s.recipient) === norm
      ) {
        return { isSuppressed: true, reason: s.reason };
      }
    }
    return { isSuppressed: false };
  }

  async suppress(record: NotificationSuppressionRecord): Promise<NotificationSuppressionRecord> {
    const clone: NotificationSuppressionRecord = JSON.parse(JSON.stringify(record));
    clone.recipient = this.normalizeRecipient(clone.recipient);
    if (!clone.createdAt) {
      clone.createdAt = new Date().toISOString();
    }
    this.suppressions.set(clone.id, clone);
    return JSON.parse(JSON.stringify(clone));
  }

  async removeSuppression(
    tenantId: string | null,
    channel: NotificationChannel,
    recipient: string
  ): Promise<boolean> {
    const norm = this.normalizeRecipient(recipient);
    for (const [id, s] of this.suppressions.entries()) {
      const tenantMatch = tenantId ? s.tenantId === tenantId : s.tenantId === null;
      if (tenantMatch && s.channel === channel && this.normalizeRecipient(s.recipient) === norm) {
        return this.suppressions.delete(id);
      }
    }
    return false;
  }

  async list(tenantId: string): Promise<NotificationSuppressionRecord[]> {
    const matches = Array.from(this.suppressions.values()).filter(
      (s) => s.tenantId === tenantId || s.tenantId === null
    );
    return matches.map((m) => JSON.parse(JSON.stringify(m)));
  }

  clear(): void {
    this.suppressions.clear();
  }
}
