import { createRecordStore } from "../record-store";
import { NotificationReceiptRecord } from "@car-hire-os/types";

export interface INotificationReceiptRepository {
  findById(id: string): Promise<NotificationReceiptRecord | null>;
  findByNotificationId(notificationId: string): Promise<NotificationReceiptRecord[]>;
  findByProviderMessageId(providerMessageId: string): Promise<NotificationReceiptRecord[]>;
  save(receipt: NotificationReceiptRecord): Promise<NotificationReceiptRecord>;
  listByTenantId(tenantId: string, limit?: number): Promise<NotificationReceiptRecord[]>;
  clear(): void;
}

export class InMemoryNotificationReceiptRepository implements INotificationReceiptRepository {
  private receipts: Map<string, NotificationReceiptRecord> = createRecordStore("notification-receipt.repository:receipts");

  async findById(id: string): Promise<NotificationReceiptRecord | null> {
    const r = this.receipts.get(id);
    return r ? JSON.parse(JSON.stringify(r)) : null;
  }

  async findByNotificationId(notificationId: string): Promise<NotificationReceiptRecord[]> {
    const matches = Array.from(this.receipts.values()).filter(
      (r) => r.notificationId === notificationId
    );
    return matches.map((m) => JSON.parse(JSON.stringify(m)));
  }

  async findByProviderMessageId(providerMessageId: string): Promise<NotificationReceiptRecord[]> {
    const matches = Array.from(this.receipts.values()).filter(
      (r) => r.providerMessageId === providerMessageId
    );
    return matches.map((m) => JSON.parse(JSON.stringify(m)));
  }

  async save(receipt: NotificationReceiptRecord): Promise<NotificationReceiptRecord> {
    const clone: NotificationReceiptRecord = JSON.parse(JSON.stringify(receipt));
    if (!clone.createdAt) {
      clone.createdAt = new Date().toISOString();
    }
    this.receipts.set(clone.id, clone);
    return JSON.parse(JSON.stringify(clone));
  }

  async listByTenantId(tenantId: string, limit = 50): Promise<NotificationReceiptRecord[]> {
    const matches = Array.from(this.receipts.values())
      .filter((r) => r.tenantId === tenantId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
    return matches.map((m) => JSON.parse(JSON.stringify(m)));
  }

  clear(): void {
    this.receipts.clear();
  }
}
