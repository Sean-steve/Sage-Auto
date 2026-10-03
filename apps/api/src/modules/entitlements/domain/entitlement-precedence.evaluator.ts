// ============================================================================
// CAR HIRE OS — ENTITLEMENT PRECEDENCE EVALUATOR (ENT-001 §3-5)
// Pure Domain Precedence Resolution Engine
// ============================================================================

import type {
  Feature,
  PlanFeature,
  EntitlementOverride,
  EntitlementRestriction,
  Subscription,
  EntitlementDecision,
  EntitlementDenialCode,
} from "@carhire/types";

export interface PrecedenceEvaluationContext {
  tenantId: string;
  feature: Feature;
  subscription: Subscription | null;
  platformRestriction: EntitlementRestriction | null;
  tenantRestriction: EntitlementRestriction | null;
  adminOverride: EntitlementOverride | null;
  planFeature: PlanFeature | null;
  currentUsage?: number;
}

export class EntitlementPrecedenceEvaluator {
  /**
   * Resolves the authoritative entitlement decision following the strict precedence hierarchy:
   * 1. Subscription Lifecycle Gate (SUSPENDED / INACTIVE / EXPIRED)
   * 2. Platform-Level Restriction (Overrides everything)
   * 3. Tenant-Level Restriction
   * 4. Admin Override (Active exception grant/limit)
   * 5. Plan Feature Grant (Authoritative subscription tier mapping)
   * 6. Default Feature Definition Fallback
   */
  static evaluate(ctx: PrecedenceEvaluationContext): EntitlementDecision {
    const {
      feature,
      subscription,
      platformRestriction,
      tenantRestriction,
      adminOverride,
      planFeature,
      currentUsage = 0,
    } = ctx;

    const featureKey = feature.key;

    // ------------------------------------------------------------------------
    // 1. Subscription Status Gate
    // ------------------------------------------------------------------------
    if (!subscription) {
      return {
        allowed: false,
        feature: featureKey,
        code: "SUBSCRIPTION_INACTIVE",
        reason: "SUBSCRIPTION_INACTIVE",
        limit: 0,
        isUnlimited: false,
        usage: currentUsage,
        currentUsage,
        remaining: 0,
        message: "No active subscription found for tenant.",
        upgradeRecommended: true,
      };
    }

    const subStatus = (subscription.status || subscription.state || "").toUpperCase();

    if (subStatus === "SUSPENDED") {
      return {
        allowed: false,
        feature: featureKey,
        code: "SUBSCRIPTION_SUSPENDED",
        reason: "SUBSCRIPTION_SUSPENDED",
        limit: 0,
        isUnlimited: false,
        usage: currentUsage,
        currentUsage,
        remaining: 0,
        message: "Workspace subscription is currently suspended.",
        upgradeRecommended: false,
      };
    }

    if (subStatus === "EXPIRED" || subStatus === "CANCELLED" || subStatus === "INACTIVE") {
      return {
        allowed: false,
        feature: featureKey,
        code: "SUBSCRIPTION_INACTIVE",
        reason: "SUBSCRIPTION_INACTIVE",
        limit: 0,
        isUnlimited: false,
        usage: currentUsage,
        currentUsage,
        remaining: 0,
        message: "Subscription is inactive, cancelled, or expired.",
        upgradeRecommended: true,
      };
    }

    // ------------------------------------------------------------------------
    // 2. Platform Restriction Precedence (Highest Operational Authority)
    // ------------------------------------------------------------------------
    if (platformRestriction && platformRestriction.status === "ACTIVE") {
      if (platformRestriction.restrictionType === "BLOCK") {
        return {
          allowed: false,
          feature: featureKey,
          code: "PLATFORM_RESTRICTED",
          reason: "PLATFORM_RESTRICTED",
          source: "PLATFORM_RESTRICTION",
          limit: 0,
          isUnlimited: false,
          usage: currentUsage,
          currentUsage,
          remaining: 0,
          message: `Platform policy restriction enforced: ${platformRestriction.reason}`,
          upgradeRecommended: false,
        };
      } else if (platformRestriction.restrictionType === "FORCE_LIMIT") {
        const forcedLimit = platformRestriction.enforcedLimit ?? 0;
        const remaining = Math.max(0, forcedLimit - currentUsage);
        const allowed = currentUsage < forcedLimit;
        return {
          allowed,
          feature: featureKey,
          code: allowed ? undefined : "LIMIT_REACHED",
          reason: allowed ? undefined : "LIMIT_REACHED",
          source: "PLATFORM_RESTRICTION",
          limit: forcedLimit,
          isUnlimited: false,
          usage: currentUsage,
          currentUsage,
          remaining,
          message: allowed ? undefined : `Platform limit ceiling reached (${currentUsage}/${forcedLimit}).`,
        };
      }
    }

    // ------------------------------------------------------------------------
    // 3. Tenant Restriction Precedence
    // ------------------------------------------------------------------------
    if (tenantRestriction && tenantRestriction.status === "ACTIVE") {
      if (tenantRestriction.restrictionType === "BLOCK") {
        return {
          allowed: false,
          feature: featureKey,
          code: "TENANT_RESTRICTED",
          reason: "TENANT_RESTRICTED",
          source: "TENANT_RESTRICTION",
          limit: 0,
          isUnlimited: false,
          usage: currentUsage,
          currentUsage,
          remaining: 0,
          message: `Tenant restriction applied: ${tenantRestriction.reason}`,
          upgradeRecommended: false,
        };
      } else if (tenantRestriction.restrictionType === "FORCE_LIMIT") {
        const enforcedLimit = tenantRestriction.enforcedLimit ?? 0;
        const remaining = Math.max(0, enforcedLimit - currentUsage);
        const allowed = currentUsage < enforcedLimit;
        return {
          allowed,
          feature: featureKey,
          code: allowed ? undefined : "LIMIT_REACHED",
          reason: allowed ? undefined : "LIMIT_REACHED",
          source: "TENANT_RESTRICTION",
          limit: enforcedLimit,
          isUnlimited: false,
          usage: currentUsage,
          currentUsage,
          remaining,
          message: allowed ? undefined : `Tenant restricted limit reached (${currentUsage}/${enforcedLimit}).`,
        };
      }
    }

    // ------------------------------------------------------------------------
    // 4. Admin Override Precedence
    // ------------------------------------------------------------------------
    if (adminOverride && adminOverride.status === "ACTIVE") {
      if (!adminOverride.enabled) {
        return {
          allowed: false,
          feature: featureKey,
          code: "ENTITLEMENT_DISABLED",
          reason: "ENTITLEMENT_DISABLED",
          source: "OVERRIDE",
          limit: 0,
          isUnlimited: false,
          usage: currentUsage,
          currentUsage,
          remaining: 0,
          message: `Feature disabled by administrative override: ${adminOverride.reason}`,
        };
      }

      if (adminOverride.isUnlimited) {
        return {
          allowed: true,
          feature: featureKey,
          source: "OVERRIDE",
          limit: null,
          isUnlimited: true,
          usage: currentUsage,
          currentUsage,
          remaining: null,
        };
      }

      if (adminOverride.limitValue !== null && adminOverride.limitValue !== undefined) {
        const limit = Number(adminOverride.limitValue);
        const remaining = Math.max(0, limit - currentUsage);
        const allowed = currentUsage < limit;
        return {
          allowed,
          feature: featureKey,
          code: allowed ? undefined : (feature.type === "USAGE_LIMIT" ? "USAGE_EXCEEDED" : "LIMIT_REACHED"),
          reason: allowed ? undefined : (feature.type === "USAGE_LIMIT" ? "USAGE_EXCEEDED" : "LIMIT_REACHED"),
          source: "OVERRIDE",
          limit,
          isUnlimited: false,
          usage: currentUsage,
          currentUsage,
          remaining,
          message: allowed ? undefined : `Administrative override limit reached (${currentUsage}/${limit}).`,
        };
      }

      // Boolean override grant
      return {
        allowed: true,
        feature: featureKey,
        source: "OVERRIDE",
        limit: null,
        isUnlimited: false,
        usage: currentUsage,
        currentUsage,
        remaining: null,
      };
    }

    // ------------------------------------------------------------------------
    // 5. Plan Feature Grant (Authoritative Plan Mapping)
    // ------------------------------------------------------------------------
    if (planFeature) {
      if (!planFeature.enabled) {
        return {
          allowed: false,
          feature: featureKey,
          code: "FEATURE_NOT_INCLUDED",
          reason: "FEATURE_NOT_INCLUDED",
          source: "PLAN",
          limit: 0,
          isUnlimited: false,
          usage: currentUsage,
          currentUsage,
          remaining: 0,
          message: `Feature '${feature.name}' is not included in current plan.`,
          upgradeRecommended: true,
        };
      }

      if (planFeature.isUnlimited) {
        return {
          allowed: true,
          feature: featureKey,
          source: "PLAN",
          limit: null,
          isUnlimited: true,
          usage: currentUsage,
          currentUsage,
          remaining: null,
        };
      }

      if (planFeature.limitValue !== null && planFeature.limitValue !== undefined) {
        const limit = Number(planFeature.limitValue);
        const remaining = Math.max(0, limit - currentUsage);
        const allowed = currentUsage < limit;
        return {
          allowed,
          feature: featureKey,
          code: allowed ? undefined : (feature.type === "USAGE_LIMIT" ? "USAGE_EXCEEDED" : "LIMIT_REACHED"),
          reason: allowed ? undefined : (feature.type === "USAGE_LIMIT" ? "USAGE_EXCEEDED" : "LIMIT_REACHED"),
          source: "PLAN",
          limit,
          isUnlimited: false,
          usage: currentUsage,
          currentUsage,
          remaining,
          message: allowed ? undefined : `Plan capacity limit reached (${currentUsage}/${limit}).`,
          upgradeRecommended: !allowed,
        };
      }

      // Boolean grant from plan
      return {
        allowed: true,
        feature: featureKey,
        source: "PLAN",
        limit: null,
        isUnlimited: false,
        usage: currentUsage,
        currentUsage,
        remaining: null,
      };
    }

    // ------------------------------------------------------------------------
    // 6. Default Feature Definition Fallback
    // ------------------------------------------------------------------------
    const defaultVal = feature.defaultValue;
    const isBoolDefault = typeof defaultVal === "boolean" ? defaultVal : false;
    const isNumDefault = typeof defaultVal === "number" ? defaultVal : null;

    if (feature.type === "NUMERIC_LIMIT" || feature.type === "USAGE_LIMIT") {
      const limit = isNumDefault ?? 0;
      const remaining = Math.max(0, limit - currentUsage);
      const allowed = currentUsage < limit;
      return {
        allowed,
        feature: featureKey,
        code: allowed ? undefined : "LIMIT_REACHED",
        reason: allowed ? undefined : "LIMIT_REACHED",
        source: "DEFAULT",
        limit,
        isUnlimited: false,
        usage: currentUsage,
        currentUsage,
        remaining,
        upgradeRecommended: !allowed,
      };
    }

    return {
      allowed: isBoolDefault,
      feature: featureKey,
      code: isBoolDefault ? undefined : "FEATURE_NOT_INCLUDED",
      reason: isBoolDefault ? undefined : "FEATURE_NOT_INCLUDED",
      source: "DEFAULT",
      limit: null,
      isUnlimited: false,
      usage: currentUsage,
      currentUsage,
      remaining: null,
      upgradeRecommended: !isBoolDefault,
    };
  }
}
