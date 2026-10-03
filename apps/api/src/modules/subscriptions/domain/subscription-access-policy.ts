// ============================================================================
// CAR HIRE OS — SUBSCRIPTION ACCESS POLICY (Sprint 8: ENT-001, ARCH-004, DEV-005)
// Centralized, Server-Authoritative Commercial Lifecycle Access Policy
// ============================================================================

import type {
  Subscription,
  SubscriptionStatus,
  OperationCategory,
  TenantAccessMode,
  SubscriptionAccessDecision,
} from "@carhire/types";
import { ERROR_CODES } from "@carhire/constants";

export interface EvaluationOptions {
  now?: Date;
  isPlatformSupportActor?: boolean;
}

export class SubscriptionAccessPolicy {
  /**
   * Derives the effective TenantAccessMode from a subscription entity and current time.
   */
  public static deriveAccessMode(
    subscription: Subscription | null,
    options?: EvaluationOptions
  ): TenantAccessMode {
    if (!subscription) {
      return "SUSPENDED";
    }

    const status = (subscription.status || subscription.state || "INACTIVE").toUpperCase() as SubscriptionStatus;
    const now = options?.now || new Date();

    switch (status) {
      case "TRIAL":
      case "ACTIVE":
        return "FULL";

      case "RENEWAL_DUE":
      case "PAST_DUE":
        return "WARNING";

      case "GRACE_PERIOD":
        return "RESTRICTED";

      case "SUSPENDED":
      case "EXPIRED":
        return "SUSPENDED";

      case "CANCELLED": {
        if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd) {
          const periodEnd = new Date(subscription.currentPeriodEnd);
          if (now <= periodEnd) {
            return "WARNING";
          }
        }
        return "SUSPENDED";
      }

      default:
        return "SUSPENDED";
    }
  }

  /**
   * Lists all permitted operation categories for a given subscription status and access mode.
   */
  public static getAllowedOperations(
    subscription: Subscription | null,
    options?: EvaluationOptions
  ): OperationCategory[] {
    const mode = this.deriveAccessMode(subscription, options);

    switch (mode) {
      case "FULL":
        return [
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
        ];

      case "WARNING":
        return [
          "READ_EXISTING_DATA",
          "CREATE_NEW_RESOURCE",
          "UPDATE_EXISTING_RESOURCE",
          "COMPLETE_EXISTING_RENTAL",
          "MANAGE_EXISTING_BOOKING",
          "BILLING_ACCESS",
          "SUBSCRIPTION_MANAGEMENT",
          "DATA_EXPORT",
          "PUBLIC_BOOKING",
          "PLATFORM_SUPPORT_ACTION",
          // DELETE_RESOURCE may be permitted under warning if required
          "DELETE_RESOURCE",
        ];

      case "RESTRICTED":
        // Grace period: read data, manage existing in-flight operations, billing and export permitted;
        // prohibited: new commercial creations and public bookings.
        return [
          "READ_EXISTING_DATA",
          "UPDATE_EXISTING_RESOURCE",
          "COMPLETE_EXISTING_RENTAL",
          "MANAGE_EXISTING_BOOKING",
          "BILLING_ACCESS",
          "SUBSCRIPTION_MANAGEMENT",
          "DATA_EXPORT",
          "PLATFORM_SUPPORT_ACTION",
        ];

      case "SUSPENDED":
        // Suspended: strictly preserve recovery, billing, data export, support, and closing in-flight rentals.
        return [
          "READ_EXISTING_DATA",
          "COMPLETE_EXISTING_RENTAL",
          "BILLING_ACCESS",
          "SUBSCRIPTION_MANAGEMENT",
          "DATA_EXPORT",
          "PLATFORM_SUPPORT_ACTION",
        ];

      default:
        return ["BILLING_ACCESS", "SUBSCRIPTION_MANAGEMENT"];
    }
  }

  /**
   * Authoritatively evaluates whether an operation category is allowed under the tenant's subscription.
   */
  public static evaluate(
    subscription: Subscription | null,
    operationCategory: OperationCategory,
    options?: EvaluationOptions
  ): SubscriptionAccessDecision {
    const now = options?.now || new Date();
    const accessMode = this.deriveAccessMode(subscription, { now });
    const status: SubscriptionStatus = subscription
      ? ((subscription.status || subscription.state || "INACTIVE").toUpperCase() as SubscriptionStatus)
      : ("EXPIRED" as SubscriptionStatus);

    const allowedOperations = this.getAllowedOperations(subscription, { now });
    const allOperations: OperationCategory[] = [
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
    ];
    const restrictedOperations = allOperations.filter((op) => !allowedOperations.includes(op));

    // Recovery pathways: BILLING_ACCESS and SUBSCRIPTION_MANAGEMENT are ALWAYS allowed for authenticated users
    if (
      operationCategory === "BILLING_ACCESS" ||
      operationCategory === "SUBSCRIPTION_MANAGEMENT" ||
      operationCategory === "DATA_EXPORT"
    ) {
      return {
        allowed: true,
        subscriptionStatus: status,
        accessMode,
        operationCategory,
        allowedOperations,
        restrictedOperations,
        requiresPayment: status === "PAST_DUE" || status === "GRACE_PERIOD" || status === "SUSPENDED",
        requiresUpgrade: status === "EXPIRED" || status === "CANCELLED",
      };
    }

    // Platform Support actions: requires verified support impersonation flag or allowed state
    if (operationCategory === "PLATFORM_SUPPORT_ACTION") {
      if (options?.isPlatformSupportActor) {
        return {
          allowed: true,
          subscriptionStatus: status,
          accessMode,
          operationCategory,
          allowedOperations,
          restrictedOperations,
          requiresPayment: false,
          requiresUpgrade: false,
          effectiveAt: now.toISOString(),
        };
      }
      if (accessMode === "SUSPENDED") {
        return {
          allowed: false,
          subscriptionStatus: status,
          accessMode,
          operationCategory,
          code: ERROR_CODES.SUBSCRIPTION_SUSPENDED,
          message: "Platform support access requires verified platform staff impersonation session.",
          allowedOperations,
          restrictedOperations,
          requiresPayment: true,
          requiresUpgrade: false,
          effectiveAt: now.toISOString(),
        };
      }
    }

    if (!subscription) {
      return {
        allowed: false,
        subscriptionStatus: "EXPIRED",
        accessMode: "SUSPENDED",
        operationCategory,
        code: ERROR_CODES.SUBSCRIPTION_INACTIVE,
        message: "No active workspace subscription found. Please select a plan to activate your workspace.",
        allowedOperations,
        restrictedOperations,
        requiresPayment: true,
        requiresUpgrade: true,
      };
    }

    // Check if category is in allowed list
    const isAllowed = allowedOperations.includes(operationCategory);

    if (isAllowed) {
      return {
        allowed: true,
        subscriptionStatus: status,
        accessMode,
        operationCategory,
        allowedOperations,
        restrictedOperations,
      };
    }

    // Determine specific denial code and friendly safe message
    let denialCode: string = ERROR_CODES.SUBSCRIPTION_INACTIVE;
    let message: string = "This operation is restricted under the current subscription state.";

    if (status === "SUSPENDED") {
      denialCode = ERROR_CODES.SUBSCRIPTION_SUSPENDED;
      message = "Workspace subscription is suspended. New operations are disabled. Please reactivate your subscription in Billing.";
    } else if (status === "GRACE_PERIOD") {
      denialCode = ERROR_CODES.SUBSCRIPTION_GRACE_RESTRICTION;
      message = "Workspace is in a grace period following missed payment. New resource creation is disabled until billing is settled.";
    } else if (status === "EXPIRED") {
      denialCode = ERROR_CODES.SUBSCRIPTION_EXPIRED;
      message = "Workspace subscription has expired. Please renew your plan to restore full operations.";
    } else if (status === "CANCELLED") {
      denialCode = ERROR_CODES.SUBSCRIPTION_INACTIVE;
      message = "Workspace subscription has been cancelled. Please reactivate your subscription to resume operations.";
    } else if (operationCategory === "PUBLIC_BOOKING") {
      denialCode = ERROR_CODES.PUBLIC_BOOKING_DISABLED;
      message = "Public online booking is unavailable due to tenant subscription status.";
    }

    return {
      allowed: false,
      subscriptionStatus: status,
      accessMode,
      operationCategory,
      code: denialCode,
      message,
      allowedOperations,
      restrictedOperations,
      requiresPayment: status === "PAST_DUE" || status === "GRACE_PERIOD" || status === "SUSPENDED",
      requiresUpgrade: status === "EXPIRED" || status === "CANCELLED",
    };
  }

  /**
   * Helper to build frontend-safe status banners.
   */
  public static getStatusBanner(
    subscription: Subscription | null,
    options?: EvaluationOptions
  ): {
    type: "WARNING" | "RESTRICTED" | "SUSPENDED" | "EXPIRED";
    title: string;
    message: string;
    actionUrl: string;
    actionLabel: string;
  } | null {
    if (!subscription) {
      return {
        type: "SUSPENDED",
        title: "Subscription Required",
        message: "Your workspace has no active subscription. Choose a plan to unlock all features.",
        actionUrl: "/billing",
        actionLabel: "Choose Plan",
      };
    }

    const status = (subscription.status || subscription.state || "").toUpperCase() as SubscriptionStatus;
    const now = options?.now || new Date();

    switch (status) {
      case "RENEWAL_DUE":
        return {
          type: "WARNING",
          title: "Subscription Renewal Due",
          message: `Your subscription renewal is due on ${subscription.renewalDueAt ? new Date(subscription.renewalDueAt).toLocaleDateString() : "soon"}. Please confirm payment to prevent service interruption.`,
          actionUrl: "/billing",
          actionLabel: "Review Invoice",
        };

      case "PAST_DUE":
        return {
          type: "WARNING",
          title: "Payment Past Due",
          message: "Your latest subscription payment attempt was unsuccessful. Please update your payment method to avoid restricted mode.",
          actionUrl: "/billing",
          actionLabel: "Pay Now",
        };

      case "GRACE_PERIOD":
        return {
          type: "RESTRICTED",
          title: "Grace Period Active — Restricted Mode",
          message: `Your workspace is currently in restricted mode. New vehicle and booking creations are paused until overdue invoices are cleared (Grace ends ${subscription.graceEndsAt || subscription.gracePeriodEndsAt ? new Date(subscription.graceEndsAt || subscription.gracePeriodEndsAt!).toLocaleDateString() : "soon"}).`,
          actionUrl: "/billing",
          actionLabel: "Settle Invoices",
        };

      case "SUSPENDED":
        return {
          type: "SUSPENDED",
          title: "Workspace Suspended",
          message: "Workspace operations are currently suspended. Your data is safely preserved. To resume operations, reactivate your subscription.",
          actionUrl: "/billing",
          actionLabel: "Reactivate Subscription",
        };

      case "CANCELLED": {
        if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd) {
          const periodEnd = new Date(subscription.currentPeriodEnd);
          if (now <= periodEnd) {
            return {
              type: "WARNING",
              title: "Cancellation Scheduled",
              message: `Your subscription is scheduled to end on ${periodEnd.toLocaleDateString()}. You retain full access until then.`,
              actionUrl: "/billing",
              actionLabel: "Resume Subscription",
            };
          }
        }
        return {
          type: "SUSPENDED",
          title: "Subscription Cancelled",
          message: "Your subscription has ended. Your data is safely preserved. Reactivate anytime to resume operations.",
          actionUrl: "/billing",
          actionLabel: "Reactivate",
        };
      }

      case "EXPIRED":
        return {
          type: "EXPIRED",
          title: "Subscription Expired",
          message: "Your trial or subscription period has ended. All business records remain preserved. Choose a plan to restore write access.",
          actionUrl: "/billing",
          actionLabel: "Renew Plan",
        };

      case "ACTIVE":
      case "TRIAL":
      default:
        return null;
    }
  }
}
