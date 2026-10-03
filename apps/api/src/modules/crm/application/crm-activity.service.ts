// ============================================================================
// CAR HIRE OS — CRM ACTIVITY SERVICE (Sprint 33)
// ============================================================================

import {
  CrmActivityRecord,
  CrmActivityType,
} from "@car-hire-os/types";
import {
  ICrmActivityRepository,
  IOutboxRepository,
} from "@car-hire-os/database";
import { EVENT_TYPES } from "@car-hire-os/contracts";

export interface LogActivityDto {
  tenantId: string;
  entityType: "LEAD" | "SALES_QUOTE";
  entityId: string;
  type: CrmActivityType;
  title: string;
  description: string;
  performedBy: string;
  metadata?: Record<string, unknown>;
}

export class CrmActivityService {
  constructor(
    private readonly activityRepo: ICrmActivityRepository,
    private readonly outboxRepo?: IOutboxRepository
  ) {}

  async logActivity(dto: LogActivityDto): Promise<CrmActivityRecord> {
    const activity = await this.activityRepo.save({
      id: "",
      tenantId: dto.tenantId,
      entityType: dto.entityType,
      entityId: dto.entityId,
      type: dto.type,
      title: dto.title,
      description: dto.description,
      performedBy: dto.performedBy,
      occurredAt: new Date().toISOString(),
      metadata: dto.metadata || {},
      createdAt: "",
    });

    if (this.outboxRepo) {
      await this.outboxRepo.publish({
        tenantId: dto.tenantId,
        eventType: EVENT_TYPES.CRM_ACTIVITY_CREATED,
        aggregateType: dto.entityType,
        aggregateId: dto.entityId,
        payload: {
          activityId: activity.id,
          type: activity.type,
          title: activity.title,
          performedBy: activity.performedBy,
        },
      });
    }

    return activity;
  }

  async getTimeline(
    tenantId: string,
    entityType: "LEAD" | "SALES_QUOTE",
    entityId: string
  ): Promise<CrmActivityRecord[]> {
    return this.activityRepo.findByEntity(tenantId, entityType, entityId);
  }
}
