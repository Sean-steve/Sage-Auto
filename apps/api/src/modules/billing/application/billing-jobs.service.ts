// ============================================================================
// CAR HIRE OS — BILLING JOBS & AUTOMATION SERVICE (Control Plane Workers)
// ============================================================================

import {
  ISubscriptionRepository,
  SubscriptionRepository,
  ISaaSBillingInvoiceRepository,
  SaaSBillingInvoiceRepository,
  IPlanRepository,
  PlanRepository,
} from "@carhire/database";
import { SubscriptionService } from "../../subscriptions/application/subscription.service";
import { BillingService } from "./billing.service";

export class BillingJobsService {
  constructor(
    private subscriptionRepo: ISubscriptionRepository = new SubscriptionRepository(),
    private subscriptionService: SubscriptionService = new SubscriptionService(),
    private billingService: BillingService = new BillingService(),
    private invoiceRepo: ISaaSBillingInvoiceRepository = new SaaSBillingInvoiceRepository(),
    private planRepo: IPlanRepository = new PlanRepository()
  ) {}

  /**
   * Evaluates active subscriptions nearing expiration (within 3 days)
   * Transitions them to RENEWAL_DUE and generates renewal invoice if not already generated.
   */
  async processRenewalDueSubscriptions(): Promise<number> {
    const subscriptions = await this.subscriptionRepo.listAll();
    const now = new Date().getTime();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    let processed = 0;

    for (const sub of subscriptions) {
      if (sub.status === "ACTIVE" && sub.autoRenew) {
        const periodEndMs = new Date(sub.currentPeriodEnd).getTime();
        if (periodEndMs - now <= threeDaysMs) {
          // Transition to RENEWAL_DUE
          await this.subscriptionService.transitionStatus(sub.id, {
            newStatus: "RENEWAL_DUE",
            reason: "Subscription period ending within 3 days",
            actorType: "SYSTEM",
          });

          // Generate renewal invoice
          const plan = await this.planRepo.findById(sub.planId);
          await this.billingService.createSubscriptionInvoice({
            tenantId: sub.tenantId,
            subscriptionId: sub.id,
            description: `Renewal Invoice: ${plan?.name || sub.planId} (${sub.billingInterval || "MONTHLY"})`,
            amount: sub.amount,
            currency: sub.currency,
            billingPeriodStart: sub.currentPeriodEnd,
            billingPeriodEnd: new Date(
              new Date(sub.currentPeriodEnd).getTime() + (sub.billingInterval === "YEARLY" ? 365 : 30) * 24 * 60 * 60 * 1000
            ).toISOString(),
            dueInDays: 7,
          });

          processed++;
        }
      }
    }

    return processed;
  }

  /**
   * Evaluates subscriptions past their period end without renewal payment
   * Transitions RENEWAL_DUE to PAST_DUE or GRACE_PERIOD.
   */
  async processPastDueSubscriptions(): Promise<number> {
    const subscriptions = await this.subscriptionRepo.listAll();
    const now = new Date().getTime();
    let processed = 0;

    for (const sub of subscriptions) {
      if (sub.status === "RENEWAL_DUE") {
        const periodEndMs = new Date(sub.currentPeriodEnd).getTime();
        if (now > periodEndMs) {
          // Enter grace period
          await this.subscriptionService.transitionStatus(sub.id, {
            newStatus: "GRACE_PERIOD",
            reason: "Current billing period elapsed without renewal payment. 7-day grace period initiated.",
            actorType: "SYSTEM",
          });
          processed++;
        }
      }
    }

    return processed;
  }

  /**
   * Evaluates expired grace periods and suspends tenants.
   */
  async processGracePeriodExpirations(): Promise<number> {
    const subscriptions = await this.subscriptionRepo.listAll();
    const now = new Date().getTime();
    let processed = 0;

    for (const sub of subscriptions) {
      if (sub.status === "GRACE_PERIOD" && sub.graceEndsAt) {
        const graceEndMs = new Date(sub.graceEndsAt).getTime();
        if (now > graceEndMs) {
          await this.subscriptionService.transitionStatus(sub.id, {
            newStatus: "SUSPENDED",
            reason: "Grace period expired without settlement. Platform access suspended.",
            actorType: "SYSTEM",
          });
          processed++;
        }
      }
    }

    return processed;
  }
}
