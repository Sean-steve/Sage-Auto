// ============================================================================
// CAR HIRE OS — PLATFORM SUBSCRIPTION CONTROLLER (Control Plane Admin)
// ============================================================================

import { Request, Response } from "express";
import { ERROR_CODES } from "@carhire/constants";
import { SubscriptionService } from "../application/subscription.service";
import { PlanService } from "../application/plan.service";
import { SaasMetricsService } from "../application/metrics.service";

export class PlatformSubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly planService: PlanService,
    private readonly metricsService: SaasMetricsService
  ) {}

  listSubscriptions = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const subs = await this.subscriptionService.listAllSubscriptions();
      res.status(200).json({
        data: subs,
        meta: { total: subs.length, requestId },
      });
    } catch (err: any) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message, requestId },
      });
    }
  };

  getSubscriptionById = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const sub = await this.subscriptionService.getSubscriptionById(req.params.id);
      if (!sub) {
        res.status(404).json({
          error: { code: ERROR_CODES.SUBSCRIPTION_NOT_FOUND, message: "Subscription not found", requestId },
        });
        return;
      }
      res.status(200).json({ data: sub, meta: { requestId } });
    } catch (err: any) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message, requestId },
      });
    }
  };

  transitionStatus = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const { newStatus, reason, expectedVersion } = req.body;

    if (!newStatus || !reason) {
      res.status(400).json({
        error: { code: "INVALID_REQUEST", message: "newStatus and reason are required", requestId },
      });
      return;
    }

    try {
      const actorId = req.auth?.userId || "platform-staff";
      const updated = await this.subscriptionService.transitionStatus(req.params.id, {
        newStatus,
        reason,
        actorType: "PLATFORM_STAFF",
        actorId,
        expectedVersion,
      });

      res.status(200).json({ data: updated, meta: { requestId } });
    } catch (err: any) {
      const statusCode = err.name === "InvalidSubscriptionTransitionError" ? 400 : 500;
      res.status(statusCode).json({
        error: { code: err.code || "STATE_TRANSITION_FAILED", message: err.message, requestId },
      });
    }
  };

  suspendSubscription = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const { reason, expectedVersion } = req.body;

    try {
      const actorId = req.auth?.userId || "platform-staff";
      const updated = await this.subscriptionService.transitionStatus(req.params.id, {
        newStatus: "SUSPENDED",
        reason: reason || "Suspended by platform administrator",
        actorType: "PLATFORM_STAFF",
        actorId,
        expectedVersion,
      });

      res.status(200).json({ data: updated, meta: { requestId } });
    } catch (err: any) {
      res.status(400).json({
        error: { code: err.code || "SUSPENSION_FAILED", message: err.message, requestId },
      });
    }
  };

  reactivateSubscription = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const { reason, expectedVersion } = req.body;

    try {
      const actorId = req.auth?.userId || "platform-staff";
      const updated = await this.subscriptionService.transitionStatus(req.params.id, {
        newStatus: "ACTIVE",
        reason: reason || "Reactivated by platform administrator",
        actorType: "PLATFORM_STAFF",
        actorId,
        expectedVersion,
      });

      res.status(200).json({ data: updated, meta: { requestId } });
    } catch (err: any) {
      res.status(400).json({
        error: { code: err.code || "REACTIVATION_FAILED", message: err.message, requestId },
      });
    }
  };

  getStatusHistory = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const history = await this.subscriptionService.getStatusHistory(req.params.id);
      res.status(200).json({
        data: history,
        meta: { total: history.length, requestId },
      });
    } catch (err: any) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message, requestId },
      });
    }
  };

  getMetricsOverview = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const overview = await this.metricsService.calculateOverview();
      res.status(200).json({ data: overview, meta: { requestId } });
    } catch (err: any) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message, requestId },
      });
    }
  };

  listPlans = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const plans = await this.planService.listAllPlans();
      res.status(200).json({ data: plans, meta: { total: plans.length, requestId } });
    } catch (err: any) {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: err.message, requestId },
      });
    }
  };

  createPlan = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const actorId = req.auth?.userId || "platform-staff";
      const plan = await this.planService.createPlan(req.body, { id: actorId });
      res.status(201).json({ data: plan, meta: { requestId } });
    } catch (err: any) {
      res.status(400).json({
        error: { code: err.code || "PLAN_CREATION_FAILED", message: err.message, requestId },
      });
    }
  };

  updatePlan = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const actorId = req.auth?.userId || "platform-staff";
      const plan = await this.planService.updatePlan(req.params.id, req.body, { id: actorId });
      res.status(200).json({ data: plan, meta: { requestId } });
    } catch (err: any) {
      res.status(400).json({
        error: { code: err.code || "PLAN_UPDATE_FAILED", message: err.message, requestId },
      });
    }
  };

  archivePlan = async (req: Request, res: Response): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    try {
      const actorId = req.auth?.userId || "platform-staff";
      const plan = await this.planService.archivePlan(req.params.id, { id: actorId });
      res.status(200).json({ data: plan, meta: { requestId } });
    } catch (err: any) {
      res.status(400).json({
        error: { code: err.code || "PLAN_ARCHIVE_FAILED", message: err.message, requestId },
      });
    }
  };
}
