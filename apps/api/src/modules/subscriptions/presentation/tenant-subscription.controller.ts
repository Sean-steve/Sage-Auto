// ============================================================================
// CAR HIRE OS — TENANT SUBSCRIPTION CONTROLLER (Self-Service Tenant Scope)
// ============================================================================

import { Request, Response } from "express";
import { ERROR_CODES } from "@carhire/constants";
import { SubscriptionService } from "../application/subscription.service";
import { PlanService } from "../application/plan.service";
import { SubscriptionAccessPolicy } from "../domain/subscription-access-policy";
import type { AccessContextResponse } from "@carhire/types";

export class TenantSubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly planService: PlanService
  ) {}

  /**
   * GET /api/v1/subscriptions/tenant/access-context
   * Returns authoritative access mode, status banners, allowed operation categories,
   * effective limits, and entitlement decisions for the tenant workspace.
   */
  getAccessContext = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const tenantId = req.tenantContext?.tenantId;

    if (!tenantId) {
      res.status(400).json({
        error: { code: ERROR_CODES.TENANT_REQUIRED, message: "Tenant context required", requestId },
      });
      return;
    }

    try {
      const sub = await this.subscriptionService.getSubscriptionByTenantId(tenantId);
      const plan = sub ? await this.planService.getPlanById(sub.planId) : null;
      const accessMode = SubscriptionAccessPolicy.deriveAccessMode(sub);
      const allowedOperations = SubscriptionAccessPolicy.getAllowedOperations(sub);
      const allOps = [
        "READ_EXISTING_DATA",
        "CREATE_NEW_RESOURCE",
        "UPDATE_EXISTING_RESOURCE",
        "DELETE_RESOURCE",
        "COMPLETE_EXISTING_RENTAL",
        "MANAGE_EXISTING_BOOKING",
        "BILLING_ACCESS",
        "SUBSCRIPTION_MANAGEMENT",
        "DATA_EXPORT",
        "PUBLIC_BOOKING",
        "PLATFORM_SUPPORT_ACTION",
      ] as const;
      const restrictedOperations = allOps.filter((op) => !allowedOperations.includes(op as any));
      const statusBanner = SubscriptionAccessPolicy.getStatusBanner(sub);

      const maxVehicles = plan?.maxVehicles ?? 5;
      const maxMembers = plan?.maxMembers ?? 2;
      const isUnlimitedVehicles = plan?.code === "ENTERPRISE_PLUS";

      const responseData: AccessContextResponse = {
        tenantId,
        subscription: sub
          ? {
              id: sub.id,
              planId: sub.planId,
              planCode: plan?.code || "CUSTOM",
              status: (sub.status || sub.state || "ACTIVE") as any,
              currentPeriodEnd: sub.currentPeriodEnd,
              cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
              autoRenew: sub.autoRenew,
            }
          : null,
        accessMode,
        isRestricted: accessMode === "RESTRICTED" || accessMode === "SUSPENDED",
        statusBanner,
        allowedOperations,
        restrictedOperations,
        permissions: req.tenantContext?.permissions || [],
        isOwner: req.tenantContext?.roles?.includes("COMPANY_OWNER") || false,
        entitlements: {},
        limits: {
          maxVehicles: {
            limit: isUnlimitedVehicles ? null : maxVehicles,
            usage: 0,
            remaining: isUnlimitedVehicles ? null : maxVehicles,
            isUnlimited: isUnlimitedVehicles,
          },
          maxMembers: {
            limit: maxMembers,
            usage: 1,
            remaining: Math.max(0, maxMembers - 1),
            isUnlimited: false,
          },
        },
      };

      res.status(200).json({ data: responseData, meta: { requestId } });
    } catch (err: any) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message, requestId },
      });
    }
  };

  getCurrentSubscription = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const tenantId = req.tenantContext?.tenantId;

    if (!tenantId) {
      res.status(400).json({
        error: { code: ERROR_CODES.TENANT_REQUIRED, message: "Tenant context required", requestId },
      });
      return;
    }

    try {
      const sub = await this.subscriptionService.getSubscriptionByTenantId(tenantId);
      const plan = sub ? await this.planService.getPlanById(sub.planId) : null;

      res.status(200).json({
        data: {
          subscription: sub,
          plan,
        },
        meta: { requestId },
      });
    } catch (err: any) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message, requestId },
      });
    }
  };

  listPublicPlans = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const plans = await this.planService.listActivePublicPlans();
      res.status(200).json({ data: plans, meta: { total: plans.length, requestId } });
    } catch (err: any) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message, requestId },
      });
    }
  };

  changePlan = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const tenantId = req.tenantContext?.tenantId;
    const userId = req.auth?.userId;
    const { newPlanId, billingInterval, reason } = req.body;

    if (!tenantId) {
      res.status(400).json({
        error: { code: ERROR_CODES.TENANT_REQUIRED, message: "Tenant context required", requestId },
      });
      return;
    }

    if (!newPlanId) {
      res.status(400).json({
        error: { code: "INVALID_REQUEST", message: "newPlanId is required", requestId },
      });
      return;
    }

    try {
      const sub = await this.subscriptionService.getSubscriptionByTenantId(tenantId);
      if (!sub) {
        res.status(404).json({
          error: { code: ERROR_CODES.SUBSCRIPTION_NOT_FOUND, message: "No active subscription found", requestId },
        });
        return;
      }

      const updated = await this.subscriptionService.changePlan(
        sub.id,
        { newPlanId, billingInterval, reason },
        { id: userId || "tenant-user", type: "USER" }
      );

      res.status(200).json({ data: updated, meta: { requestId } });
    } catch (err: any) {
      res.status(400).json({
        error: { code: err.code || "PLAN_CHANGE_FAILED", message: err.message, requestId },
      });
    }
  };

  cancelSubscription = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const tenantId = req.tenantContext?.tenantId;
    const userId = req.auth?.userId;
    const { reason } = req.body;

    if (!tenantId) {
      res.status(400).json({
        error: { code: ERROR_CODES.TENANT_REQUIRED, message: "Tenant context required", requestId },
      });
      return;
    }

    try {
      const sub = await this.subscriptionService.getSubscriptionByTenantId(tenantId);
      if (!sub) {
        res.status(404).json({
          error: { code: ERROR_CODES.SUBSCRIPTION_NOT_FOUND, message: "No subscription found", requestId },
        });
        return;
      }

      const updated = await this.subscriptionService.transitionStatus(sub.id, {
        newStatus: "CANCELLED",
        reason: reason || "Subscription cancelled by tenant owner",
        actorType: "USER",
        actorId: userId,
      });

      res.status(200).json({ data: updated, meta: { requestId } });
    } catch (err: any) {
      res.status(400).json({
        error: { code: err.code || "CANCELLATION_FAILED", message: err.message, requestId },
      });
    }
  };

  getStatusHistory = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const tenantId = req.tenantContext?.tenantId;

    if (!tenantId) {
      res.status(400).json({
        error: { code: ERROR_CODES.TENANT_REQUIRED, message: "Tenant context required", requestId },
      });
      return;
    }

    try {
      const history = await this.subscriptionService.getTenantStatusHistory(tenantId);
      res.status(200).json({ data: history, meta: { total: history.length, requestId } });
    } catch (err: any) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message, requestId },
      });
    }
  };
}
