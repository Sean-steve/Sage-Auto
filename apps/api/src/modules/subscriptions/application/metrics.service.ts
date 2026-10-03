// ============================================================================
// CAR HIRE OS — SAAS CONTROL PLANE METRICS SERVICE (MRR, ARR, Sub Breakdown)
// ============================================================================

import {
  ISubscriptionRepository,
  SubscriptionRepository,
  IPlanRepository,
  PlanRepository,
  ITenantRepository,
  TenantRepository,
} from "@carhire/database";

export interface SaasMetricsOverview {
  totalTenants: number;
  activeSubscriptions: number;
  trialSubscriptions: number;
  pastDueSubscriptions: number;
  gracePeriodSubscriptions: number;
  suspendedSubscriptions: number;
  cancelledSubscriptions: number;
  mrr: number; // Monthly Recurring Revenue
  arr: number; // Annualized Recurring Revenue
  currency: string;
  planBreakdown: Record<string, { count: number; name: string; mrr: number }>;
}

export class SaasMetricsService {
  constructor(
    private subscriptionRepo: ISubscriptionRepository = new SubscriptionRepository(),
    private planRepo: IPlanRepository = new PlanRepository(),
    private tenantRepo: ITenantRepository = new TenantRepository()
  ) {}

  async calculateOverview(): Promise<SaasMetricsOverview> {
    const tenants = await this.tenantRepo.listAll();
    const subscriptions = await this.subscriptionRepo.listAll();
    const plans = await this.planRepo.listAll();

    const planMap = new Map(plans.map((p) => [p.id, p]));

    let mrrTotal = 0;
    let activeSubs = 0;
    let trialSubs = 0;
    let pastDueSubs = 0;
    let graceSubs = 0;
    let suspendedSubs = 0;
    let cancelledSubs = 0;

    const planBreakdown: Record<string, { count: number; name: string; mrr: number }> = {};
    plans.forEach((p) => {
      planBreakdown[p.id] = { count: 0, name: p.name, mrr: 0 };
    });

    for (const sub of subscriptions) {
      const plan = planMap.get(sub.planId);
      const planName = plan?.name || sub.planId;

      if (!planBreakdown[sub.planId]) {
        planBreakdown[sub.planId] = { count: 0, name: planName, mrr: 0 };
      }

      // Count state
      switch (sub.status) {
        case "ACTIVE":
          activeSubs++;
          break;
        case "TRIAL":
          trialSubs++;
          break;
        case "RENEWAL_DUE":
          activeSubs++;
          break;
        case "PAST_DUE":
          pastDueSubs++;
          break;
        case "GRACE_PERIOD":
          graceSubs++;
          break;
        case "SUSPENDED":
          suspendedSubs++;
          break;
        case "CANCELLED":
        case "EXPIRED":
          cancelledSubs++;
          break;
      }

      // Revenue-generating statuses: ACTIVE, RENEWAL_DUE, GRACE_PERIOD
      if (sub.status === "ACTIVE" || sub.status === "RENEWAL_DUE" || sub.status === "GRACE_PERIOD") {
        const isAnnual = sub.billingInterval === "YEARLY" || sub.billingCycle === "ANNUAL";
        const normalizedMonthlyAmount = isAnnual ? sub.amount / 12 : sub.amount;

        mrrTotal += normalizedMonthlyAmount;
        planBreakdown[sub.planId].count++;
        planBreakdown[sub.planId].mrr += normalizedMonthlyAmount;
      }
    }

    return {
      totalTenants: tenants.length,
      activeSubscriptions: activeSubs,
      trialSubscriptions: trialSubs,
      pastDueSubscriptions: pastDueSubs,
      gracePeriodSubscriptions: graceSubs,
      suspendedSubscriptions: suspendedSubs,
      cancelledSubscriptions: cancelledSubs,
      mrr: Math.round(mrrTotal * 100) / 100,
      arr: Math.round(mrrTotal * 12 * 100) / 100,
      currency: "KES",
      planBreakdown,
    };
  }
}
