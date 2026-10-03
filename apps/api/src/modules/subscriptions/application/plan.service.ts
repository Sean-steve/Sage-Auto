// ============================================================================
// CAR HIRE OS — PLAN SERVICE (Application Service)
// ============================================================================

import type { Plan, CreatePlanDto, UpdatePlanDto } from "@carhire/types";
import { IPlanRepository, PlanRepository } from "@carhire/database";
import { IAuditRepository, AuditRepository } from "@carhire/database";
import { IOutboxRepository, OutboxRepository } from "@carhire/database";

export class PlanService {
  constructor(
    private planRepo: IPlanRepository = new PlanRepository(),
    private auditRepo: IAuditRepository = new AuditRepository(),
    private outboxRepo: IOutboxRepository = new OutboxRepository()
  ) {}

  async listAllPlans(): Promise<Plan[]> {
    return this.planRepo.listAll();
  }

  async listActivePublicPlans(): Promise<Plan[]> {
    const plans = await this.planRepo.listActive();
    return plans.filter((p) => p.isPublic);
  }

  async getPlanById(id: string): Promise<Plan | null> {
    return this.planRepo.findById(id);
  }

  async getPlanByCode(code: string): Promise<Plan | null> {
    return this.planRepo.findByCode(code);
  }

  async createPlan(
    dto: CreatePlanDto,
    actor?: { id: string; email?: string }
  ): Promise<Plan> {
    const plan = await this.planRepo.create(dto);

    if (actor) {
      await this.auditRepo.record({
        tenantId: "platform",
        actorType: "PLATFORM_STAFF",
        actorId: actor.id,
        action: "PLATFORM_PLAN_CREATED",
        resourceType: "saas_plans",
        resourceId: plan.id,
        metadata: { code: plan.code, price: plan.price },
      });
    }

    await this.outboxRepo.publish({
      eventType: "SAAS_PLAN_CREATED",
      aggregateType: "Plan",
      aggregateId: plan.id,
      tenantId: "platform",
      payload: { planId: plan.id, code: plan.code },
    });

    return plan;
  }

  async updatePlan(
    id: string,
    updates: UpdatePlanDto,
    actor?: { id: string; email?: string }
  ): Promise<Plan> {
    const updated = await this.planRepo.update(id, updates);

    if (actor) {
      await this.auditRepo.record({
        tenantId: "platform",
        actorType: "PLATFORM_STAFF",
        actorId: actor.id,
        action: "PLATFORM_PLAN_UPDATED",
        resourceType: "saas_plans",
        resourceId: updated.id,
        metadata: { updates },
      });
    }

    return updated;
  }

  async archivePlan(
    id: string,
    actor?: { id: string; email?: string }
  ): Promise<Plan> {
    const archived = await this.planRepo.archive(id);

    if (actor) {
      await this.auditRepo.record({
        tenantId: "platform",
        actorType: "PLATFORM_STAFF",
        actorId: actor.id,
        action: "PLATFORM_PLAN_ARCHIVED",
        resourceType: "saas_plans",
        resourceId: archived.id,
        metadata: { code: archived.code },
      });
    }

    return archived;
  }
}
