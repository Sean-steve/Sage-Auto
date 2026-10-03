import {
  CrmActivityRecord,
} from "@car-hire-os/types";

export interface ICrmActivityRepository {
  findById(id: string): Promise<CrmActivityRecord | null>;
  findByEntity(tenantId: string, entityType: "LEAD" | "SALES_QUOTE", entityId: string): Promise<CrmActivityRecord[]>;
  save(activity: CrmActivityRecord): Promise<CrmActivityRecord>;
  clear(): void;
}

export class InMemoryCrmActivityRepository implements ICrmActivityRepository {
  private activities: CrmActivityRecord[] = [];

  async findById(id: string): Promise<CrmActivityRecord | null> {
    const item = this.activities.find((a) => a.id === id);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  async findByEntity(
    tenantId: string,
    entityType: "LEAD" | "SALES_QUOTE",
    entityId: string
  ): Promise<CrmActivityRecord[]> {
    return this.activities
      .filter(
        (a) => a.tenantId === tenantId && a.entityType === entityType && a.entityId === entityId
      )
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .map((a) => JSON.parse(JSON.stringify(a)));
  }

  async save(activity: CrmActivityRecord): Promise<CrmActivityRecord> {
    const clone: CrmActivityRecord = JSON.parse(JSON.stringify(activity));
    if (!clone.id) {
      clone.id = `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    }
    if (!clone.createdAt) {
      clone.createdAt = new Date().toISOString();
    }
    if (!clone.occurredAt) {
      clone.occurredAt = clone.createdAt;
    }

    this.activities.push(clone);
    return JSON.parse(JSON.stringify(clone));
  }

  clear(): void {
    this.activities = [];
  }
}

export { InMemoryCrmActivityRepository as CrmActivityRepository };

