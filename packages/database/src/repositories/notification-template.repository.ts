import { createRecordStore } from "../record-store";
import {
  NotificationTemplateRecord,
  NotificationChannel,
} from "@car-hire-os/types";

export interface INotificationTemplateRepository {
  findById(id: string): Promise<NotificationTemplateRecord | null>;
  findByKeyAndChannel(
    tenantId: string | null,
    key: string,
    channel: NotificationChannel
  ): Promise<NotificationTemplateRecord | null>;
  resolveEffectiveTemplate(
    tenantId: string,
    key: string,
    channel: NotificationChannel
  ): Promise<NotificationTemplateRecord | null>;
  listByTenant(tenantId: string): Promise<NotificationTemplateRecord[]>;
  listSystemDefaults(): Promise<NotificationTemplateRecord[]>;
  save(template: NotificationTemplateRecord): Promise<NotificationTemplateRecord>;
  delete(id: string): Promise<boolean>;
  seedDefaultTemplates(templates: NotificationTemplateRecord[]): Promise<void>;
  clear(): void;
}

export class InMemoryNotificationTemplateRepository implements INotificationTemplateRepository {
  private templates: Map<string, NotificationTemplateRecord> = createRecordStore("notification-template.repository:templates");

  async findById(id: string): Promise<NotificationTemplateRecord | null> {
    const t = this.templates.get(id);
    return t ? JSON.parse(JSON.stringify(t)) : null;
  }

  async findByKeyAndChannel(
    tenantId: string | null,
    key: string,
    channel: NotificationChannel
  ): Promise<NotificationTemplateRecord | null> {
    for (const t of this.templates.values()) {
      const matchTenant = tenantId ? t.tenantId === tenantId : t.tenantId === null;
      if (matchTenant && t.key === key && t.channel === channel) {
        return JSON.parse(JSON.stringify(t));
      }
    }
    return null;
  }

  async resolveEffectiveTemplate(
    tenantId: string,
    key: string,
    channel: NotificationChannel
  ): Promise<NotificationTemplateRecord | null> {
    // 1. Tenant-specific override
    for (const t of this.templates.values()) {
      if (t.tenantId === tenantId && t.key === key && t.channel === channel && t.isActive) {
        return JSON.parse(JSON.stringify(t));
      }
    }
    // 2. Fallback to System Default (tenantId === null)
    for (const t of this.templates.values()) {
      if (t.tenantId === null && t.key === key && t.channel === channel && t.isActive) {
        return JSON.parse(JSON.stringify(t));
      }
    }
    return null;
  }

  async listByTenant(tenantId: string): Promise<NotificationTemplateRecord[]> {
    // Returns system defaults merged with tenant overrides
    const systemDefaults = Array.from(this.templates.values()).filter((t) => t.tenantId === null);
    const tenantOverrides = Array.from(this.templates.values()).filter((t) => t.tenantId === tenantId);

    const map = new Map<string, NotificationTemplateRecord>();
    for (const s of systemDefaults) {
      map.set(`${s.key}:${s.channel}`, s);
    }
    for (const o of tenantOverrides) {
      map.set(`${o.key}:${o.channel}`, o);
    }

    return Array.from(map.values()).map((t) => JSON.parse(JSON.stringify(t)));
  }

  async listSystemDefaults(): Promise<NotificationTemplateRecord[]> {
    const items = Array.from(this.templates.values()).filter((t) => t.tenantId === null);
    return items.map((t) => JSON.parse(JSON.stringify(t)));
  }

  async save(template: NotificationTemplateRecord): Promise<NotificationTemplateRecord> {
    const clone: NotificationTemplateRecord = JSON.parse(JSON.stringify(template));
    clone.updatedAt = new Date().toISOString();
    if (!clone.createdAt) {
      clone.createdAt = clone.updatedAt;
    }
    this.templates.set(clone.id, clone);
    return JSON.parse(JSON.stringify(clone));
  }

  async delete(id: string): Promise<boolean> {
    return this.templates.delete(id);
  }

  async seedDefaultTemplates(templates: NotificationTemplateRecord[]): Promise<void> {
    for (const t of templates) {
      const existing = await this.findByKeyAndChannel(null, t.key, t.channel);
      if (!existing) {
        await this.save(t);
      }
    }
  }

  clear(): void {
    this.templates.clear();
  }
}
