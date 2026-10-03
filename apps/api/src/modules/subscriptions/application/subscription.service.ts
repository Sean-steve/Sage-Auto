// ============================================================================
// CAR HIRE OS — SUBSCRIPTION APPLICATION SERVICE (SaaS Control Plane)
// ============================================================================

import type {
  Subscription,
  SubscriptionStatus,
  CreateSubscriptionDto,
  ChangePlanDto,
} from "@carhire/types";
import {
  ISubscriptionRepository,
  SubscriptionRepository,
  ISubscriptionStatusHistoryRepository,
  SubscriptionStatusHistoryRepository,
  IPlanRepository,
  PlanRepository,
  ITenantRepository,
  TenantRepository,
  IAuditRepository,
  AuditRepository,
  IOutboxRepository,
  OutboxRepository,
  RecordNotFoundError,
} from "@carhire/database";
import { SubscriptionStateMachine } from "../domain/subscription-state-machine";

export interface StateTransitionCommand {
  newStatus: SubscriptionStatus;
  reason: string;
  actorType: "PLATFORM_STAFF" | "USER" | "SYSTEM";
  actorId?: string;
  expectedVersion?: number;
  metadata?: Record<string, unknown>;
}

export class SubscriptionService {
  constructor(
    private subscriptionRepo: ISubscriptionRepository = new SubscriptionRepository(),
    private historyRepo: ISubscriptionStatusHistoryRepository = new SubscriptionStatusHistoryRepository(),
    private planRepo: IPlanRepository = new PlanRepository(),
    private tenantRepo: ITenantRepository = new TenantRepository(),
    private auditRepo: IAuditRepository = new AuditRepository(),
    private outboxRepo: IOutboxRepository = new OutboxRepository()
  ) {}

  async getSubscriptionById(id: string): Promise<Subscription | null> {
    return this.subscriptionRepo.findById(id);
  }

  async getSubscriptionByTenantId(tenantId: string): Promise<Subscription | null> {
    return this.subscriptionRepo.findByTenantId(tenantId);
  }

  async listAllSubscriptions(): Promise<Subscription[]> {
    return this.subscriptionRepo.listAll();
  }

  async getStatusHistory(subscriptionId: string) {
    return this.historyRepo.listBySubscriptionId(subscriptionId);
  }

  async getTenantStatusHistory(tenantId: string) {
    return this.historyRepo.listByTenantId(tenantId);
  }

  async createSubscription(
    dto: CreateSubscriptionDto,
    actor?: { id: string; email?: string; type?: "PLATFORM_STAFF" | "USER" | "SYSTEM" }
  ): Promise<Subscription> {
    const plan = await this.planRepo.findById(dto.planId);
    if (!plan) {
      throw new RecordNotFoundError("Plan", dto.planId);
    }

    const tenant = await this.tenantRepo.findById(dto.tenantId);
    if (!tenant) {
      throw new RecordNotFoundError("Tenant", dto.tenantId);
    }

    const now = new Date();
    const interval = dto.billingInterval || plan.billingInterval || "MONTHLY";
    const amount = interval === "YEARLY" || interval === "ANNUAL" ? plan.annualPrice : plan.monthlyPrice;

    const startAsTrial = dto.startAsTrial !== undefined ? dto.startAsTrial : (plan.trialDurationDays ?? 0) > 0;
    const initialStatus: SubscriptionStatus = startAsTrial ? "TRIAL" : "ACTIVE";

    const periodStartDate = now.toISOString();
    const periodEndDate = new Date(
      now.getTime() + (interval === "YEARLY" || interval === "ANNUAL" ? 365 : 30) * 24 * 60 * 60 * 1000
    ).toISOString();

    const trialEndsAt = startAsTrial
      ? new Date(now.getTime() + (plan.trialDurationDays || 14) * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    const created = await this.subscriptionRepo.create({
      tenantId: dto.tenantId,
      planId: dto.planId,
      status: initialStatus,
      state: initialStatus,
      startedAt: periodStartDate,
      trialEndsAt,
      currentPeriodStart: periodStartDate,
      currentPeriodEnd: periodEndDate,
      renewalDueAt: new Date(new Date(periodEndDate).getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      billingInterval: interval,
      billingCycle: interval === "YEARLY" ? "ANNUAL" : "MONTHLY",
      amount,
      currency: plan.currency,
      autoRenew: dto.autoRenew ?? true,
    });

    // Record initial status in history
    await this.historyRepo.record({
      subscriptionId: created.id,
      tenantId: created.tenantId,
      newStatus: initialStatus,
      reason: "Initial subscription provisioning",
      actorType: actor?.type || "SYSTEM",
      actorId: actor?.id,
    });

    // Audit and outbox
    await this.auditRepo.record({
      tenantId: created.tenantId,
      actorType: actor?.type || "SYSTEM",
      actorId: actor?.id || "system",
      action: "SUBSCRIPTION_PROVISIONED",
      resourceType: "saas_subscriptions",
      resourceId: created.id,
      metadata: { planId: created.planId, status: created.status },
    });

    await this.outboxRepo.publish({
      eventType: "SUBSCRIPTION_CREATED",
      aggregateType: "Subscription",
      aggregateId: created.id,
      tenantId: created.tenantId,
      payload: { subscriptionId: created.id, status: created.status, planId: created.planId },
    });

    return created;
  }

  async transitionStatus(
    subscriptionId: string,
    command: StateTransitionCommand
  ): Promise<Subscription> {
    const sub = await this.subscriptionRepo.findById(subscriptionId);
    if (!sub) {
      throw new RecordNotFoundError("Subscription", subscriptionId);
    }

    const currentStatus = sub.status || sub.state || "ACTIVE";

    // Validate state machine rule
    SubscriptionStateMachine.validateTransition(currentStatus, command.newStatus, command.reason);

    const updates: Partial<Subscription> = {
      status: command.newStatus,
      state: command.newStatus,
    };

    const now = new Date().toISOString();

    if (command.newStatus === "CANCELLED") {
      updates.cancelledAt = now;
      updates.endedAt = now;
      updates.autoRenew = false;
    } else if (command.newStatus === "EXPIRED") {
      updates.endedAt = now;
      updates.autoRenew = false;
    } else if (command.newStatus === "GRACE_PERIOD") {
      // 7 days default grace period
      updates.graceEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      updates.gracePeriodEndsAt = updates.graceEndsAt;
    } else if (command.newStatus === "ACTIVE") {
      // If reactivating or converting, clear grace / end markers
      updates.graceEndsAt = undefined;
      updates.gracePeriodEndsAt = undefined;
    }

    const updated = await this.subscriptionRepo.update(
      subscriptionId,
      updates,
      command.expectedVersion !== undefined ? command.expectedVersion : (sub.version ?? 1)
    );

    // Record in immutable history
    await this.historyRepo.record({
      subscriptionId: updated.id,
      tenantId: updated.tenantId,
      previousStatus: currentStatus,
      newStatus: command.newStatus,
      reason: command.reason,
      actorType: command.actorType,
      actorId: command.actorId,
      metadata: command.metadata,
    });

    // Audit log
    await this.auditRepo.record({
      tenantId: updated.tenantId,
      actorType: command.actorType,
      actorId: command.actorId || "system",
      action: `SUBSCRIPTION_STATUS_${command.newStatus}`,
      resourceType: "saas_subscriptions",
      resourceId: updated.id,
      metadata: {
        previousStatus: currentStatus,
        newStatus: command.newStatus,
        reason: command.reason,
      },
    });

    // Outbox event
    await this.outboxRepo.publish({
      eventType: `SUBSCRIPTION_${command.newStatus}`,
      aggregateType: "Subscription",
      aggregateId: updated.id,
      tenantId: updated.tenantId,
      payload: {
        subscriptionId: updated.id,
        previousStatus: sub.status,
        newStatus: command.newStatus,
        reason: command.reason,
      },
    });

    return updated;
  }

  async changePlan(
    subscriptionId: string,
    dto: ChangePlanDto,
    actor?: { id: string; email?: string; type?: "PLATFORM_STAFF" | "USER" | "SYSTEM" }
  ): Promise<Subscription> {
    const sub = await this.subscriptionRepo.findById(subscriptionId);
    if (!sub) {
      throw new RecordNotFoundError("Subscription", subscriptionId);
    }

    const newPlan = await this.planRepo.findById(dto.newPlanId);
    if (!newPlan) {
      throw new RecordNotFoundError("Plan", dto.newPlanId);
    }

    const interval = dto.billingInterval || sub.billingInterval || newPlan.billingInterval || "MONTHLY";
    const amount = interval === "YEARLY" || interval === "ANNUAL" ? newPlan.annualPrice : newPlan.monthlyPrice;

    const previousPlanId = sub.planId;
    const updated = await this.subscriptionRepo.update(subscriptionId, {
      planId: dto.newPlanId,
      billingInterval: interval,
      billingCycle: interval === "YEARLY" ? "ANNUAL" : "MONTHLY",
      amount,
      currency: newPlan.currency,
    });

    // Also update tenant record planId
    await this.tenantRepo.update(sub.tenantId, { planId: dto.newPlanId });

    // History record
    await this.historyRepo.record({
      subscriptionId: updated.id,
      tenantId: updated.tenantId,
      previousStatus: sub.status || sub.state || "ACTIVE",
      newStatus: updated.status || updated.state || "ACTIVE",
      reason: dto.reason || `Plan changed from ${previousPlanId} to ${dto.newPlanId}`,
      actorType: actor?.type || "USER",
      actorId: actor?.id,
      metadata: { previousPlanId, newPlanId: dto.newPlanId },
    });

    await this.auditRepo.record({
      tenantId: updated.tenantId,
      actorType: actor?.type || "USER",
      actorId: actor?.id || "user",
      action: "SUBSCRIPTION_PLAN_CHANGED",
      resourceType: "saas_subscriptions",
      resourceId: updated.id,
      metadata: { previousPlanId, newPlanId: dto.newPlanId },
    });

    await this.outboxRepo.publish({
      eventType: "SUBSCRIPTION_PLAN_CHANGED",
      aggregateType: "Subscription",
      aggregateId: updated.id,
      tenantId: updated.tenantId,
      payload: { subscriptionId: updated.id, previousPlanId, newPlanId: dto.newPlanId },
    });

    return updated;
  }
}
