import { createRecordStore } from "../record-store";
import {
  LeadRecord,
  LeadFilterParams,
} from "@car-hire-os/types";

export interface ILeadRepository {
  findById(id: string): Promise<LeadRecord | null>;
  findByTenantAndId(tenantId: string, id: string): Promise<LeadRecord | null>;
  findByLeadNumber(tenantId: string, leadNumber: string): Promise<LeadRecord | null>;
  findMany(filter: LeadFilterParams): Promise<{ items: LeadRecord[]; total: number }>;
  listByTenant(tenantId: string): Promise<LeadRecord[]>;
  list(tenantId: string): Promise<LeadRecord[]>;
  save(lead: LeadRecord): Promise<LeadRecord>;
  delete(tenantId: string, id: string): Promise<boolean>;
  countByStatus(tenantId: string): Promise<Record<string, number>>;
  clear(): void;
}

export class InMemoryLeadRepository implements ILeadRepository {
  private leads: Map<string, LeadRecord> = createRecordStore("lead.repository:leads");
  private sequenceCounter: number = 1000;

  async findById(id: string): Promise<LeadRecord | null> {
    const item = this.leads.get(id);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  async findByTenantAndId(tenantId: string, id: string): Promise<LeadRecord | null> {
    const item = this.leads.get(id);
    if (item && item.tenantId === tenantId) {
      return JSON.parse(JSON.stringify(item));
    }
    return null;
  }

  async findByLeadNumber(tenantId: string, leadNumber: string): Promise<LeadRecord | null> {
    for (const item of this.leads.values()) {
      if (item.tenantId === tenantId && item.leadNumber === leadNumber) {
        return JSON.parse(JSON.stringify(item));
      }
    }
    return null;
  }

  async findMany(filter: LeadFilterParams): Promise<{ items: LeadRecord[]; total: number }> {
    let result = Array.from(this.leads.values()).filter((l) => l.tenantId === filter.tenantId);

    if (filter.status) {
      result = result.filter((l) => l.status === filter.status);
    }
    if (filter.stageId) {
      result = result.filter((l) => l.stageId === filter.stageId);
    }
    if (filter.assignedUserId) {
      result = result.filter((l) => l.assignedUserId === filter.assignedUserId);
    }
    if (filter.type) {
      result = result.filter((l) => l.type === filter.type);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (l) =>
          l.leadNumber.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q) ||
          (l.firstName && l.firstName.toLowerCase().includes(q)) ||
          (l.lastName && l.lastName.toLowerCase().includes(q)) ||
          (l.companyName && l.companyName.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = result.length;
    const offset = filter.offset || 0;
    const limit = filter.limit || 50;
    const items = result.slice(offset, offset + limit).map((i) => JSON.parse(JSON.stringify(i)));

    return { items, total };
  }

  async listByTenant(tenantId: string): Promise<LeadRecord[]> {
    const res = await this.findMany({ tenantId, limit: 1000 });
    return res.items;
  }

  async list(tenantId: string): Promise<LeadRecord[]> {
    return this.listByTenant(tenantId);
  }

  async save(lead: LeadRecord): Promise<LeadRecord> {
    const clone: LeadRecord = JSON.parse(JSON.stringify(lead));
    if (!clone.id) {
      clone.id = `lead-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    }
    if (!clone.leadNumber) {
      this.sequenceCounter += 1;
      clone.leadNumber = `LEAD-${this.sequenceCounter}`;
    }
    clone.updatedAt = new Date().toISOString();
    if (!clone.createdAt) {
      clone.createdAt = clone.updatedAt;
    }
    if (!clone.version) {
      clone.version = 1;
    }

    this.leads.set(clone.id, clone);
    return JSON.parse(JSON.stringify(clone));
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const item = this.leads.get(id);
    if (item && item.tenantId === tenantId) {
      return this.leads.delete(id);
    }
    return false;
  }

  async countByStatus(tenantId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const item of this.leads.values()) {
      if (item.tenantId === tenantId) {
        counts[item.status] = (counts[item.status] || 0) + 1;
      }
    }
    return counts;
  }

  clear(): void {
    this.leads.clear();
  }
}

export { InMemoryLeadRepository as LeadRepository };

