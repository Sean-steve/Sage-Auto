import { createRecordStore } from "../record-store";
import {
  CrmTaskRecord,
  CrmTaskStatus,
} from "@car-hire-os/types";

export interface ICrmTaskRepository {
  findById(id: string): Promise<CrmTaskRecord | null>;
  findByTenantAndId(tenantId: string, id: string): Promise<CrmTaskRecord | null>;
  findByEntity(tenantId: string, entityType: "LEAD" | "SALES_QUOTE", entityId: string): Promise<CrmTaskRecord[]>;
  findByUser(tenantId: string, userId: string, status?: CrmTaskStatus): Promise<CrmTaskRecord[]>;
  save(task: CrmTaskRecord): Promise<CrmTaskRecord>;
  delete(tenantId: string, id: string): Promise<boolean>;
  clear(): void;
}

export class InMemoryCrmTaskRepository implements ICrmTaskRepository {
  private tasks: Map<string, CrmTaskRecord> = createRecordStore("crm-task.repository:tasks");

  async findById(id: string): Promise<CrmTaskRecord | null> {
    const item = this.tasks.get(id);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  async findByTenantAndId(tenantId: string, id: string): Promise<CrmTaskRecord | null> {
    const item = this.tasks.get(id);
    if (item && item.tenantId === tenantId) {
      return JSON.parse(JSON.stringify(item));
    }
    return null;
  }

  async findByEntity(
    tenantId: string,
    entityType: "LEAD" | "SALES_QUOTE",
    entityId: string
  ): Promise<CrmTaskRecord[]> {
    return Array.from(this.tasks.values())
      .filter((t) => t.tenantId === tenantId && t.entityType === entityType && t.entityId === entityId)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .map((t) => JSON.parse(JSON.stringify(t)));
  }

  async findByUser(tenantId: string, userId: string, status?: CrmTaskStatus): Promise<CrmTaskRecord[]> {
    return Array.from(this.tasks.values())
      .filter((t) => {
        if (t.tenantId !== tenantId) return false;
        if (t.assignedUserId !== userId) return false;
        if (status && t.status !== status) return false;
        return true;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .map((t) => JSON.parse(JSON.stringify(t)));
  }

  async save(task: CrmTaskRecord): Promise<CrmTaskRecord> {
    const clone: CrmTaskRecord = JSON.parse(JSON.stringify(task));
    if (!clone.id) {
      clone.id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    }
    clone.updatedAt = new Date().toISOString();
    if (!clone.createdAt) {
      clone.createdAt = clone.updatedAt;
    }

    this.tasks.set(clone.id, clone);
    return JSON.parse(JSON.stringify(clone));
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const item = this.tasks.get(id);
    if (item && item.tenantId === tenantId) {
      return this.tasks.delete(id);
    }
    return false;
  }

  clear(): void {
    this.tasks.clear();
  }
}

export { InMemoryCrmTaskRepository as CrmTaskRepository };

