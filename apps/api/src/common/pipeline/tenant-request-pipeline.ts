// ============================================================================
// CAR HIRE OS — CANONICAL TENANT REQUEST PIPELINE (Sprint 8: DEV-005, DEV-006, DEV-007, ENT-001)
// Unified Request Pipeline combining:
// Request ID -> Auth -> Session -> Tenant -> Membership -> RBAC -> Subscription -> Entitlement -> Resource Policy
// ============================================================================

import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { OperationCategory } from "@carhire/types";
import { ERROR_CODES } from "@carhire/constants";
import type { AuthorizationService } from "../../modules/authorization/application/services/authorization.service";
import type { ResourcePolicy } from "../../modules/authorization/domain/policies/resource-policy.interface";
import type { SubscriptionService } from "../../modules/subscriptions/application/subscription.service";
import { SubscriptionAccessPolicy } from "../../modules/subscriptions/domain/subscription-access-policy";
import type { EntitlementService } from "../../modules/entitlements/application/entitlement.service";

export interface PipelineGuardConfig {
  permission?: string;
  operationCategory?: OperationCategory;
  entitlementFeature?: string;
  entitlementQuantity?: number;
  resourceResolver?: (req: Request) => any;
  resourcePolicy?: ResourcePolicy<any, any>;
  allowPlatformSupportOverride?: boolean;
}

export interface PipelineServices {
  authzService?: AuthorizationService;
  subscriptionService?: SubscriptionService;
  entitlementService?: EntitlementService;
}

/**
 * Creates an authoritative composite guard for a protected tenant route.
 * Evaluates each layer in order, failing closed with structured errors.
 */
export function createTenantPipelineGuard(
  services: PipelineServices,
  config: PipelineGuardConfig
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
    const tenantContext = req.tenantContext;

    // 1. Stage: Tenant Context Validation
    if (!tenantContext || !tenantContext.tenantId) {
      res.status(403).json({
        error: {
          code: ERROR_CODES.INVALID_TENANT_CONTEXT,
          message: "Trusted tenant context is required for this operation.",
          requestId,
        },
      });
      return;
    }

    const tenantId = tenantContext.tenantId;

    try {
      // 2. Stage: RBAC Permission Check
      if (config.permission && services.authzService) {
        const resource = config.resourceResolver ? config.resourceResolver(req) : undefined;
        try {
          await services.authzService.require(
            tenantContext,
            config.permission,
            resource,
            config.resourcePolicy
          );
        } catch (err: any) {
          res.status(403).json({
            error: {
              code: err.code || ERROR_CODES.PERMISSION_DENIED,
              message: err.message || `RBAC Permission denied: '${config.permission}' required.`,
              details: err.details,
              requestId,
            },
          });
          return;
        }
      }

      // 3. Stage: Subscription State & Access Policy Evaluation
      if (config.operationCategory && services.subscriptionService) {
        const subscription = await services.subscriptionService.getSubscriptionByTenantId(tenantId);
        const subDecision = SubscriptionAccessPolicy.evaluate(subscription, config.operationCategory);

        if (!subDecision.allowed) {
          res.status(403).json({
            error: {
              code: subDecision.code || ERROR_CODES.SUBSCRIPTION_INACTIVE,
              message: subDecision.message || "This operation is restricted under the current subscription state.",
              details: {
                subscriptionStatus: subDecision.subscriptionStatus,
                accessMode: subDecision.accessMode,
                operationCategory: subDecision.operationCategory,
                allowedOperations: subDecision.allowedOperations,
                restrictedOperations: subDecision.restrictedOperations,
                requiresPayment: subDecision.requiresPayment,
                requiresUpgrade: subDecision.requiresUpgrade,
              },
              requestId,
            },
          });
          return;
        }
      }

      // 4. Stage: Entitlement Precedence & Capacity Limit Evaluation
      if (config.entitlementFeature && services.entitlementService) {
        const quantity = config.entitlementQuantity || 1;
        const entDecision = await services.entitlementService.check(
          tenantId,
          config.entitlementFeature,
          quantity
        );

        if (!entDecision.allowed) {
          res.status(403).json({
            error: {
              code: entDecision.code || ERROR_CODES.FEATURE_NOT_INCLUDED,
              message: entDecision.message || `Tenant is not entitled to use feature '${config.entitlementFeature}'.`,
              details: {
                feature: config.entitlementFeature,
                reason: entDecision.reason || entDecision.code,
                limit: entDecision.limit,
                usage: entDecision.currentUsage,
                remaining: entDecision.remaining,
                source: entDecision.source,
                upgradeRecommended: entDecision.upgradeRecommended,
              },
              requestId,
            },
          });
          return;
        }
      }

      // All guard stages passed -> proceed to Controller / Application Command
      next();
    } catch (err: any) {
      res.status(500).json({
        error: {
          code: "REQUEST_PIPELINE_ERROR",
          message: err.message || "An unexpected error occurred during request pipeline evaluation.",
          requestId,
        },
      });
    }
  };
}
