// ============================================================================
// CAR HIRE OS — PLATFORM COHORT SERVICE (Sprint 35: DOM-003, DEV-004)
// Generates subscriber acquisition and Net Revenue Retention (NRR) cohort matrices
// ============================================================================

import type { PlatformCohortRecord, CohortMonthMetric } from "@carhire/types";
import {
  PlatformCohortRepository,
  SubscriptionRepository,
  TenantRepository,
  PlanRepository,
} from "@carhire/database";
import { PlatformMetricsService } from "./platform-metrics.service";

export interface PlatformCohortServiceDeps {
  cohortRepo?: PlatformCohortRepository;
  subscriptionRepo?: SubscriptionRepository;
  subRepo?: SubscriptionRepository;
  tenantRepo?: TenantRepository;
  planRepo?: PlanRepository;
  metricsService?: PlatformMetricsService;
}

export class PlatformCohortService {
  private cohortRepo: PlatformCohortRepository;
  private subscriptionRepo: SubscriptionRepository;
  private tenantRepo: TenantRepository;
  private planRepo: PlanRepository;
  private metricsService: PlatformMetricsService;

  constructor(
    depsOrCohortRepo?: PlatformCohortServiceDeps | PlatformCohortRepository,
    subscriptionRepo?: SubscriptionRepository,
    tenantRepo?: TenantRepository,
    planRepo?: PlanRepository,
    metricsService?: PlatformMetricsService
  ) {
    if (depsOrCohortRepo && typeof (depsOrCohortRepo as any).getAllCohorts !== "function") {
      const deps = depsOrCohortRepo as PlatformCohortServiceDeps;
      this.cohortRepo = deps.cohortRepo || new PlatformCohortRepository();
      this.subscriptionRepo = deps.subscriptionRepo || deps.subRepo || new SubscriptionRepository();
      this.tenantRepo = deps.tenantRepo || new TenantRepository();
      this.planRepo = deps.planRepo || new PlanRepository();
      this.metricsService = deps.metricsService || new PlatformMetricsService();
    } else {
      this.cohortRepo = (depsOrCohortRepo as PlatformCohortRepository) || new PlatformCohortRepository();
      this.subscriptionRepo = subscriptionRepo || new SubscriptionRepository();
      this.tenantRepo = tenantRepo || new TenantRepository();
      this.planRepo = planRepo || new PlanRepository();
      this.metricsService = metricsService || new PlatformMetricsService();
    }
  }

  /**
   * Alias for recomputeCohorts to support diverse caller naming conventions.
   */
  async generateCohorts(currency = "KES"): Promise<PlatformCohortRecord[]> {
    return this.recomputeCohorts(currency);
  }

  /**
   * Recomputes and updates cohort matrices across all subscription history.
   */
  async recomputeCohorts(currency = "KES"): Promise<PlatformCohortRecord[]> {
    const subs = await this.subscriptionRepo.getAll();
    const plans = await this.planRepo.getAll();
    const planMap = new Map(plans.map((p) => [p.id, p]));
    const targetCur = currency.toUpperCase();

    // Group subscriptions by acquisition cohort (month of initial subscription or tenant createdAt)
    const cohortGroups = new Map<string, any[]>();

    for (const sub of subs) {
      if ((sub.currency || "KES").toUpperCase() !== targetCur) continue;
      const createdAt = sub.createdAt || new Date().toISOString();
      const cohortMonth = createdAt.substring(0, 7); // YYYY-MM

      if (!cohortGroups.has(cohortMonth)) {
        cohortGroups.set(cohortMonth, []);
      }
      cohortGroups.get(cohortMonth)!.push(sub);
    }

    const results: PlatformCohortRecord[] = [];

    for (const [cohortMonth, cohortSubs] of cohortGroups.entries()) {
      const initialSubscribers = cohortSubs.length;
      let initialMrr = 0;

      for (const sub of cohortSubs) {
        const plan = planMap.get(sub.planId);
        initialMrr += this.metricsService.calculateSubscriptionMrr(sub, plan);
      }

      // Generate periods: 0 (acquisition month), up to 12 months
      const periods: CohortMonthMetric[] = [];
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const [cohortYearNum, cohortMonthNum] = cohortMonth.split("-").map(Number);

      const monthsElapsed = Math.max(
        0,
        (currentYear - cohortYearNum) * 12 + (currentMonth - cohortMonthNum)
      );

      const maxPeriods = Math.min(12, monthsElapsed);

      for (let p = 0; p <= maxPeriods; p++) {
        if (p === 0) {
          const p0: CohortMonthMetric = {
            periodMonth: 0,
            activeSubscribers: initialSubscribers,
            retentionRate: 100,
            mrrRetained: Math.round(initialMrr * 100) / 100,
            netRevenueRetention: 100,
          };
          (p0 as any).periodIndex = 0;
          periods.push(p0);
        } else {
          // For active subscriptions in current state
          let activeInPeriod = 0;
          let mrrInPeriod = 0;

          for (const sub of cohortSubs) {
            const status = sub.status || (sub as any).state;
            if (["ACTIVE", "RENEWAL_DUE", "GRACE_PERIOD"].includes(status)) {
              activeInPeriod++;
              const plan = planMap.get(sub.planId);
              mrrInPeriod += this.metricsService.calculateSubscriptionMrr(sub, plan);
            }
          }

          const retentionRate = initialSubscribers > 0 ? (activeInPeriod / initialSubscribers) * 100 : 0;
          const nrr = initialMrr > 0 ? (mrrInPeriod / initialMrr) * 100 : 0;

          const pm: CohortMonthMetric = {
            periodMonth: p,
            activeSubscribers: activeInPeriod,
            retentionRate: Math.round(retentionRate * 10) / 10,
            mrrRetained: Math.round(mrrInPeriod * 100) / 100,
            netRevenueRetention: Math.round(nrr * 10) / 10,
          };
          (pm as any).periodIndex = p;
          periods.push(pm);
        }
      }

      const cohortRecord = await this.cohortRepo.upsertCohort({
        cohortMonth,
        initialSubscribers,
        initialMrr: Math.round(initialMrr * 100) / 100,
        currency: targetCur,
        periods,
      });

      (cohortRecord as any).initialTenantCount = initialSubscribers;
      (cohortRecord as any).retentionPeriods = periods;

      results.push(cohortRecord);
    }

    return results.sort((a, b) => a.cohortMonth.localeCompare(b.cohortMonth));
  }

  /**
   * Retrieves all computed cohorts for a given currency.
   */
  async getCohorts(currency = "KES"): Promise<PlatformCohortRecord[]> {
    const cohorts = await this.cohortRepo.getAllCohorts(currency);
    if (cohorts.length === 0) {
      return this.recomputeCohorts(currency);
    }
    return cohorts;
  }
}
