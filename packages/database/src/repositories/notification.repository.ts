import { createRecordStore } from "../record-store";
import {
  NotificationRecord,
  NotificationFilterParams,
  NotificationStatsDto,
  NotificationCategory,
} from "@car-hire-os/types";

export interface INotificationRepository {
  findById(id: string): Promise<NotificationRecord | null>;
  findByTenantAndId(tenantId: string, id: string): Promise<NotificationRecord | null>;
  findByIdempotencyKey(tenantId: string, key: string): Promise<NotificationRecord | null>;
  findByProviderMessageId(providerMessageId: string): Promise<NotificationRecord | null>;
  save(notification: NotificationRecord): Promise<NotificationRecord>;
  findMany(filter: NotificationFilterParams): Promise<{ items: NotificationRecord[]; total: number }>;
  findPendingAndQueued(limit?: number): Promise<NotificationRecord[]>;
  findFailedForRetry(maxAttempts: number, limit?: number): Promise<NotificationRecord[]>;
  getStats(tenantId: string): Promise<NotificationStatsDto>;
  clear(): void;
}

export class InMemoryNotificationRepository implements INotificationRepository {
  private notifications: Map<string, NotificationRecord> = createRecordStore("notification.repository:notifications");

  async findById(id: string): Promise<NotificationRecord | null> {
    const item = this.notifications.get(id);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  async findByTenantAndId(tenantId: string, id: string): Promise<NotificationRecord | null> {
    const item = this.notifications.get(id);
    if (item && item.tenantId === tenantId) {
      return JSON.parse(JSON.stringify(item));
    }
    return null;
  }

  async findByIdempotencyKey(tenantId: string, key: string): Promise<NotificationRecord | null> {
    for (const item of this.notifications.values()) {
      if (item.tenantId === tenantId && item.idempotencyKey === key) {
        return JSON.parse(JSON.stringify(item));
      }
    }
    return null;
  }

  async findByProviderMessageId(providerMessageId: string): Promise<NotificationRecord | null> {
    for (const item of this.notifications.values()) {
      if (item.providerMessageId === providerMessageId) {
        return JSON.parse(JSON.stringify(item));
      }
    }
    return null;
  }

  async save(notification: NotificationRecord): Promise<NotificationRecord> {
    const clone: NotificationRecord = JSON.parse(JSON.stringify(notification));
    clone.updatedAt = new Date().toISOString();
    if (!clone.createdAt) {
      clone.createdAt = clone.updatedAt;
    }
    this.notifications.set(clone.id, clone);
    return JSON.parse(JSON.stringify(clone));
  }

  async findMany(filter: NotificationFilterParams): Promise<{ items: NotificationRecord[]; total: number }> {
    let result = Array.from(this.notifications.values()).filter((n) => n.tenantId === filter.tenantId);

    if (filter.channel) {
      result = result.filter((n) => n.channel === filter.channel);
    }
    if (filter.category) {
      result = result.filter((n) => n.category === filter.category);
    }
    if (filter.status) {
      result = result.filter((n) => n.status === filter.status);
    }
    if (filter.recipient) {
      const q = filter.recipient.toLowerCase();
      result = result.filter((n) => n.recipient.toLowerCase().includes(q));
    }
    if (filter.templateKey) {
      result = result.filter((n) => n.templateKey === filter.templateKey);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (n) =>
          n.recipient.toLowerCase().includes(q) ||
          (n.subject && n.subject.toLowerCase().includes(q)) ||
          n.body.toLowerCase().includes(q) ||
          (n.providerMessageId && n.providerMessageId.toLowerCase().includes(q))
      );
    }
    if (filter.startDate) {
      result = result.filter((n) => n.createdAt >= filter.startDate!);
    }
    if (filter.endDate) {
      result = result.filter((n) => n.createdAt <= filter.endDate!);
    }

    // Sort descending by createdAt
    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = result.length;
    const offset = filter.offset || 0;
    const limit = filter.limit || 50;
    const items = result.slice(offset, offset + limit).map((i) => JSON.parse(JSON.stringify(i)));

    return { items, total };
  }

  async findPendingAndQueued(limit = 100): Promise<NotificationRecord[]> {
    const list = Array.from(this.notifications.values())
      .filter((n) => n.status === "PENDING" || n.status === "QUEUED")
      .slice(0, limit);
    return list.map((i) => JSON.parse(JSON.stringify(i)));
  }

  async findFailedForRetry(maxAttempts = 3, limit = 50): Promise<NotificationRecord[]> {
    const list = Array.from(this.notifications.values())
      .filter((n) => n.status === "FAILED" && n.attempts < maxAttempts)
      .slice(0, limit);
    return list.map((i) => JSON.parse(JSON.stringify(i)));
  }

  async getStats(tenantId: string): Promise<NotificationStatsDto> {
    const items = Array.from(this.notifications.values()).filter((n) => n.tenantId === tenantId);
    let totalSent = 0;
    let totalDelivered = 0;
    let totalFailed = 0;
    let totalSuppressed = 0;

    const byChannel = {
      email: { sent: 0, delivered: 0, failed: 0 },
      sms: { sent: 0, delivered: 0, failed: 0 },
      whatsapp: { sent: 0, delivered: 0, failed: 0 },
    };

    const byCategory: Record<NotificationCategory, number> = {
      TRANSACTIONAL: 0,
      OPERATIONAL: 0,
      SECURITY: 0,
      MARKETING: 0,
    };

    for (const n of items) {
      byCategory[n.category] = (byCategory[n.category] || 0) + 1;

      const ch = n.channel.toLowerCase() as "email" | "sms" | "whatsapp";
      if (n.status === "PROVIDER_ACCEPTED" || n.status === "DELIVERED") {
        totalSent++;
        if (byChannel[ch]) byChannel[ch].sent++;
      }
      if (n.status === "DELIVERED") {
        totalDelivered++;
        if (byChannel[ch]) byChannel[ch].delivered++;
      }
      if (n.status === "FAILED" || n.status === "BOUNCED" || n.status === "REJECTED") {
        totalFailed++;
        if (byChannel[ch]) byChannel[ch].failed++;
      }
      if (n.status === "SUPPRESSED") {
        totalSuppressed++;
      }
    }

    const deliveryRatePercent =
      totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 100;

    return {
      totalSent,
      totalDelivered,
      totalFailed,
      totalSuppressed,
      deliveryRatePercent,
      byChannel,
      byCategory,
    };
  }

  clear(): void {
    this.notifications.clear();
  }
}
