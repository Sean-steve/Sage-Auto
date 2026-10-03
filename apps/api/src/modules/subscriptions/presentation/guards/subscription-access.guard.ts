// ============================================================================
// CAR HIRE OS — SUBSCRIPTION ACCESS GUARD (Sprint 8: ENT-001, ARCH-004, DEV-007)
// Express Middleware for Systemic Subscription State & Access Policy Enforcement
// ============================================================================

import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { OperationCategory } from "@carhire/types";
import { ERROR_CODES } from "@carhire/constants";
import { SubscriptionAccessPolicy } from "../../domain/subscription-access-policy";
import type { SubscriptionService } from "../../application/subscription.service";

export function createRequireSubscriptionAccessGuard(
  subscriptionService: SubscriptionService,
  operationCategory: OperationCategory
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const tenantId = req.tenantContext?.tenantId;

    if (!tenantId) {
      res.status(403).json({
        error: {
          code: ERROR_CODES.TENANT_REQUIRED,
          message: "Verified tenant context required for subscription policy evaluation.",
          requestId,
        },
      });
      return;
    }

    try {
      // 1. Fetch Tenant's Active Subscription from Authoritative Service / Database
      const subscription = await subscriptionService.getSubscriptionByTenantId(tenantId);

      // 2. Evaluate Centralized Policy
      const decision = SubscriptionAccessPolicy.evaluate(subscription, operationCategory);

      if (!decision.allowed) {
        const httpStatus = decision.requiresPayment ? 403 : 403;

        res.status(httpStatus).json({
          error: {
            code: decision.code || ERROR_CODES.SUBSCRIPTION_INACTIVE,
            message: decision.message || "This operation is restricted under the current subscription status.",
            details: {
              subscriptionStatus: decision.subscriptionStatus,
              accessMode: decision.accessMode,
              operationCategory: decision.operationCategory,
              allowedOperations: decision.allowedOperations,
              restrictedOperations: decision.restrictedOperations,
              requiresPayment: decision.requiresPayment,
              requiresUpgrade: decision.requiresUpgrade,
            },
            requestId,
          },
        });
        return;
      }

      // 3. Subscription allows operation -> Proceed to next stage in pipeline
      next();
    } catch (err: any) {
      // Fail closed with safe error
      res.status(500).json({
        error: {
          code: "SUBSCRIPTION_EVALUATION_ERROR",
          message: "Failed to evaluate workspace subscription policy.",
          requestId,
        },
      });
    }
  };
}
