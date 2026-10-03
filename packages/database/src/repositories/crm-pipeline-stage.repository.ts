import { createRecordStore } from "../record-store";
import {
  CrmPipelineStageRecord,
} from "@car-hire-os/types";

export interface ICrmPipelineStageRepository {
  findById(id: string): Promise<CrmPipelineStageRecord | null>;
  findByCode(tenantId: string, code: string): Promise<CrmPipelineStageRecord | null>;
  findMany(tenantId: string): Promise<CrmPipelineStageRecord[]>;
  save(stage: CrmPipelineStageRecord): Promise<CrmPipelineStageRecord>;
  initializeDefaults(tenantId: string): Promise<CrmPipelineStageRecord[]>;
  clear(): void;
}

export const DEFAULT_PIPELINE_STAGES = [
  { name: "New Enquiry", code: "NEW_ENQUIRY", orderIndex: 1, isWonStage: false, isLostStage: false, colorHex: "#3b82f6", slaHours: 2 },
  { name: "Contacted", code: "CONTACTED", orderIndex: 2, isWonStage: false, isLostStage: false, colorHex: "#8b5cf6", slaHours: 12 },
  { name: "Requirements Qualified", code: "QUALIFIED", orderIndex: 3, isWonStage: false, isLostStage: false, colorHex: "#06b6d4", slaHours: 24 },
  { name: "Sales Quote Sent", code: "QUOTE_SENT", orderIndex: 4, isWonStage: false, isLostStage: false, colorHex: "#f59e0b", slaHours: 48 },
  { name: "Negotiation / Review", code: "NEGOTIATING", orderIndex: 5, isWonStage: false, isLostStage: false, colorHex: "#ec4899", slaHours: 72 },
  { name: "Converted (Won)", code: "WON", orderIndex: 6, isWonStage: true, isLostStage: false, colorHex: "#10b981" },
  { name: "Lost / Closed", code: "LOST", orderIndex: 7, isWonStage: false, isLostStage: true, colorHex: "#ef4444" },
];

export class InMemoryCrmPipelineStageRepository implements ICrmPipelineStageRepository {
  private stages: Map<string, CrmPipelineStageRecord> = createRecordStore("crm-pipeline-stage.repository:stages");

  async findById(id: string): Promise<CrmPipelineStageRecord | null> {
    const item = this.stages.get(id);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  async findByCode(tenantId: string, code: string): Promise<CrmPipelineStageRecord | null> {
    for (const item of this.stages.values()) {
      if (item.tenantId === tenantId && item.code === code) {
        return JSON.parse(JSON.stringify(item));
      }
    }
    return null;
  }

  async findMany(tenantId: string): Promise<CrmPipelineStageRecord[]> {
    const list = Array.from(this.stages.values())
      .filter((s) => s.tenantId === tenantId)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    if (list.length === 0) {
      return this.initializeDefaults(tenantId);
    }
    return list.map((s) => JSON.parse(JSON.stringify(s)));
  }

  async save(stage: CrmPipelineStageRecord): Promise<CrmPipelineStageRecord> {
    const clone: CrmPipelineStageRecord = JSON.parse(JSON.stringify(stage));
    if (!clone.id) {
      clone.id = `stage-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    }
    clone.updatedAt = new Date().toISOString();
    if (!clone.createdAt) {
      clone.createdAt = clone.updatedAt;
    }

    this.stages.set(clone.id, clone);
    return JSON.parse(JSON.stringify(clone));
  }

  async initializeDefaults(tenantId: string): Promise<CrmPipelineStageRecord[]> {
    const created: CrmPipelineStageRecord[] = [];
    for (const def of DEFAULT_PIPELINE_STAGES) {
      const existing = await this.findByCode(tenantId, def.code);
      if (!existing) {
        const item = await this.save({
          id: `stage-${def.code.toLowerCase()}-${tenantId.substring(0, 8)}`,
          tenantId,
          name: def.name,
          code: def.code,
          orderIndex: def.orderIndex,
          isWonStage: def.isWonStage,
          isLostStage: def.isLostStage,
          colorHex: def.colorHex,
          slaHours: def.slaHours,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        created.push(item);
      } else {
        created.push(existing);
      }
    }
    return created;
  }

  clear(): void {
    this.stages.clear();
  }
}

export { InMemoryCrmPipelineStageRepository as CrmPipelineStageRepository };

