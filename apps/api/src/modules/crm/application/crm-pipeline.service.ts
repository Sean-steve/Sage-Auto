// ============================================================================
// CAR HIRE OS — CRM PIPELINE SERVICE (Sprint 33)
// ============================================================================

import {
  CrmPipelineStageRecord,
} from "@car-hire-os/types";
import {
  ICrmPipelineStageRepository,
  ILeadRepository,
} from "@car-hire-os/database";

export interface PipelineStageSummary {
  stage: CrmPipelineStageRecord;
  leadCount: number;
  totalEstimatedValue: number;
}

export class CrmPipelineService {
  constructor(
    private readonly stageRepo: ICrmPipelineStageRepository,
    private readonly leadRepo: ILeadRepository
  ) {}

  async getStages(tenantId: string): Promise<CrmPipelineStageRecord[]> {
    return this.stageRepo.findMany(tenantId);
  }

  async getPipelineSummary(tenantId: string): Promise<PipelineStageSummary[]> {
    const stages = await this.stageRepo.findMany(tenantId);
    const { items: allLeads } = await this.leadRepo.findMany({ tenantId, limit: 1000 });

    return stages.map((stage) => {
      const stageLeads = allLeads.filter(
        (l) => l.stageId === stage.id || (!l.stageId && stage.code === "NEW_ENQUIRY")
      );
      const totalEstimatedValue = stageLeads.reduce((sum, l) => sum + (l.estimatedValue || 0), 0);
      return {
        stage,
        leadCount: stageLeads.length,
        totalEstimatedValue,
      };
    });
  }

  async updateStageOrder(
    tenantId: string,
    stageIdsInOrder: string[]
  ): Promise<CrmPipelineStageRecord[]> {
    const stages = await this.stageRepo.findMany(tenantId);
    const updated: CrmPipelineStageRecord[] = [];

    for (let i = 0; i < stageIdsInOrder.length; i++) {
      const stage = stages.find((s) => s.id === stageIdsInOrder[i]);
      if (stage) {
        stage.orderIndex = i + 1;
        const s = await this.stageRepo.save(stage);
        updated.push(s);
      }
    }

    return updated;
  }
}
