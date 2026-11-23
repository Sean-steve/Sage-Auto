import { createRecordStore } from "../record-store";
import { NotificationProviderConfigRecord, NotificationChannel, } from "@car-hire-os/types";
export interface INotificationProviderConfigRepository {
    findByTenantAndChannel(tenantId: string, channel: NotificationChannel): Promise<NotificationProviderConfigRecord | null>;
    listByTenant(tenantId: string): Promise<NotificationProviderConfigRecord[]>;
    save(config: NotificationProviderConfigRecord): Promise<NotificationProviderConfigRecord>;
    delete(id: string): Promise<boolean>;
    clear(): void;
}
export class InMemoryNotificationProviderConfigRepository implements INotificationProviderConfigRepository {
    private configs: ReturnType<typeof createRecordStore<string, NotificationProviderConfigRecord>> = createRecordStore("notification-provider-config.repository:configs");
    async findByTenantAndChannel(tenantId: string, channel: NotificationChannel): Promise<NotificationProviderConfigRecord | null> {
        for (const c of (await this.configs.values())) {
            if (c.tenantId === tenantId && c.channel === channel && c.isEnabled) {
                return JSON.parse(JSON.stringify(c));
            }
        }
        return null;
    }
    async listByTenant(tenantId: string): Promise<NotificationProviderConfigRecord[]> {
        const list = Array.from((await this.configs.values())).filter((c) => c.tenantId === tenantId);
        return list.map((c) => JSON.parse(JSON.stringify(c)));
    }
    async save(config: NotificationProviderConfigRecord): Promise<NotificationProviderConfigRecord> {
        const clone: NotificationProviderConfigRecord = JSON.parse(JSON.stringify(config));
        clone.updatedAt = new Date().toISOString();
        if (!clone.createdAt) {
            clone.createdAt = clone.updatedAt;
        }
        (await this.configs.set(clone.id, clone));
        return JSON.parse(JSON.stringify(clone));
    }
    async delete(id: string): Promise<boolean> {
        return (await this.configs.delete(id));
    }
    async clear(): Promise<void> {
        (await this.configs.clear());
    }
}
