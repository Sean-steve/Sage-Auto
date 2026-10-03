// ============================================================================
// CAR HIRE OS — PLATFORM METRICS SERVICE (Sprint 35: DOM-003, DEV-004)
// Authoritative engine for SaaS subscription intelligence, normalized MRR/ARR,
// retention rates, ARPU, LTV, and quota telemetry
// ============================================================================

import type {
  PlatformMetricKey,
  PlatformKpiOverview,
  PlanPerformanceMetric,
  BillingHealthSummary,
  ArAgingBucket,
} from "@carhire/types";
import {
  SubscriptionRepository,
  PlanRepository,
  TenantRepository,
  SaaSBillingInvoiceRepository,
  VehicleRepository,
  TenantMembershipRepository,
  MrrMovementRepository,
  PlatformSnapshotRepository,
} from "@carhire/database";
import { PlatformMetricRegistry } from "../domain/platform-metric-registry";

export interface PlatformMetricsServiceDeps {
  subscriptionRepo?: SubscriptionRepository;
  planRepo?: PlanRepository;
  tenantRepo?: TenantRepository;
  invoiceRepo?: SaaSBillingInvoiceRepository;
  vehicleRepo?: VehicleRepository;
  membershipRepo?: TenantMembershipRepository;
  movementRepo?: MrrMovementRepository;
  snapshotRepo?: PlatformSnapshotRepository;
}

export class PlatformMetricsService {
  private subscriptionRepo: SubscriptionRepository;
  private planRepo: PlanRepository;
  private tenantRepo: TenantRepository;
  private invoiceRepo: SaaSBillingInvoiceRepository;
  private vehicleRepo: VehicleRepository;
  private membershipRepo: TenantMembershipRepository;
  private movementRepo: MrrMovementRepository;
  private snapshotRepo: PlatformSnapshotRepository;

  constructor(
    depsOrSubRepo?: PlatformMetricsServiceDeps | SubscriptionRepository,
    planRepo?: PlanRepository,
    tenantRepo?: TenantRepository,
    invoiceRepo?: SaaSBillingInvoiceRepository,
    vehicleRepo?: VehicleRepository,
    membershipRepo?: TenantMembershipRepository,
    movementRepo?: MrrMovementRepository,
    snapshotRepo?: PlatformSnapshotRepository
  ) {
    if (depsOrSubRepo && typeof (depsOrSubRepo as any).getAll !== "function" && typeof (depsOrSubRepo as any).listAll !== "function") {
      const deps = depsOrSubRepo as PlatformMetricsServiceDeps;
      this.subscriptionRepo = deps.subscriptionRepo || new SubscriptionRepository();
      this.planRepo = deps.planRepo || new PlanRepository();
      this.tenantRepo = deps.tenantRepo || new TenantRepository();
      this.invoiceRepo = deps.invoiceRepo || new SaaSBillingInvoiceRepository();
      this.vehicleRepo = deps.vehicleRepo || new VehicleRepository();
      this.membershipRepo = deps.membershipRepo || new TenantMembershipRepository();
      this.movementRepo = deps.movementRepo || new MrrMovementRepository();
      this.snapshotRepo = deps.snapshotRepo || new PlatformSnapshotRepository();
    } else {
      this.subscriptionRepo = (depsOrSubRepo as SubscriptionRepository) || new SubscriptionRepository();
      this.planRepo = planRepo || new PlanRepository();
      this.tenantRepo = tenantRepo || new TenantRepository();
      this.invoiceRepo = invoiceRepo || new SaaSBillingInvoiceRepository();
      this.vehicleRepo = vehicleRepo || new VehicleRepository();
      this.membershipRepo = membershipRepo || new TenantMembershipRepository();
      this.movementRepo = movementRepo || new MrrMovementRepository();
      this.snapshotRepo = snapshotRepo || new PlatformSnapshotRepository();
    }
  }

  /**
   * Calculates normalized monthly recurring revenue (MRR) for a single subscription
   * using immutable commercial snapshot terms.
   */
  calculateSubscriptionMrr(sub: any, plan?: any): number {
    const status = sub.status || sub.state;
    // Non-revenue contributing statuses
    if (["TRIAL", "SUSPENDED", "CANCELLED", "EXPIRED"].includes(status)) {
      return 0;
    }

    const interval = (sub.billingCycle || sub.billingInterval || "MONTHLY").toUpperCase();
    
    // Use snapshot amount if present; fallback to plan pricing
    let contractedAmount = sub.amount;
    if (contractedAmount === undefined || contractedAmount === null) {
      contractedAmount = (interval === "ANNUAL" || interval === "YEARLY") ? (plan?.annualPrice || 0) : (plan?.monthlyPrice || 0);
    }

    if (interval === "ANNUAL" || interval === "YEARLY") {
      return contractedAmount / 12;
    }
    if (interval === "QUARTERLY") {
      return contractedAmount / 3;
    }
    if (interval === "WEEKLY") {
      return (contractedAmount / 7) * (365 / 12);
    }
    return contractedAmount;
  }

  /**
   * Calculates active total MRR across all qualifying tenant subscriptions for a currency.
   */
  async calculateTotalMrr(currency = "KES"): Promise<number> {
    const subs = await this.subscriptionRepo.getAll();
    const plans = await this.planRepo.getAll();
    const planMap = new Map<string, any>(plans.map((p) => [p.id, p]));
    const targetCur = currency.toUpperCase();

    let totalMrr = 0;
    for (const sub of subs) {
      const subCur = (sub.currency || "KES").toUpperCase();
      if (subCur !== targetCur) continue;

      const plan = planMap.get(sub.planId);
      totalMrr += this.calculateSubscriptionMrr(sub, plan);
    }

    return Math.round(totalMrr * 100) / 100;
  }

  /**
   * Evaluates a single registered platform metric key.
   */
  async evaluateMetric(key: PlatformMetricKey, currency = "KES"): Promise<number> {
    const def = PlatformMetricRegistry.get(key);
    if (!def) {
      throw new Error(`Metric '${key}' is not registered in PlatformMetricRegistry`);
    }

    const subs = await this.subscriptionRepo.getAll();
    const plans = await this.planRepo.getAll();
    const planMap = new Map<string, any>(plans.map((p) => [p.id, p]));
    const targetCur = currency.toUpperCase();
    const filteredSubs = subs.filter((s) => (s.currency || "KES").toUpperCase() === targetCur);

    switch (key) {
      case "SAAS_MRR_TOTAL":
        return this.calculateTotalMrr(currency);

      case "SAAS_ARR_TOTAL": {
        const mrr = await this.calculateTotalMrr(currency);
        return Math.round(mrr * 12 * 100) / 100;
      }

      case "SAAS_TOTAL_TENANTS": {
        const tenants = await this.tenantRepo.getAll();
        return tenants.length;
      }

      case "SAAS_ACTIVE_PAID_TENANTS": {
        return filteredSubs.filter((s) => {
          const status = s.status || (s as any).state;
          const plan = planMap.get(s.planId);
          const isPaid = (s.amount || plan?.monthlyPrice || 0) > 0;
          return ["ACTIVE", "RENEWAL_DUE", "GRACE_PERIOD"].includes(status) && isPaid;
        }).length;
      }

      case "SAAS_TRIAL_TENANTS": {
        return filteredSubs.filter((s) => (s.status || (s as any).state) === "TRIAL").length;
      }

      case "SAAS_RENEWAL_DUE_TENANTS": {
        return filteredSubs.filter((s) => (s.status || (s as any).state) === "RENEWAL_DUE").length;
      }

      case "SAAS_GRACE_PERIOD_TENANTS": {
        return filteredSubs.filter((s) => (s.status || (s as any).state) === "GRACE_PERIOD").length;
      }

      case "SAAS_SUSPENDED_TENANTS": {
        return filteredSubs.filter((s) => (s.status || (s as any).state) === "SUSPENDED").length;
      }

      case "SAAS_CANCELLED_TENANTS": {
        return filteredSubs.filter((s) => ["CANCELLED", "EXPIRED"].includes(s.status || (s as any).state)).length;
      }

      case "SAAS_ARPU": {
        const mrr = await this.calculateTotalMrr(currency);
        const activePaid = await this.evaluateMetric("SAAS_ACTIVE_PAID_TENANTS", currency);
        return activePaid > 0 ? Math.round((mrr / activePaid) * 100) / 100 : 0;
      }

      case "SAAS_INVOICED_REVENUE": {
        const invoices = await this.invoiceRepo.getAll();
        const relevant = invoices.filter((i) => (i.currency || "KES").toUpperCase() === targetCur && i.status !== "VOID");
        const total = relevant.reduce((sum, i) => sum + (i.total || 0), 0);
        return Math.round(total * 100) / 100;
      }

      case "SAAS_COLLECTED_CASH": {
        const invoices = await this.invoiceRepo.getAll();
        const relevant = invoices.filter((i) => (i.currency || "KES").toUpperCase() === targetCur);
        const total = relevant.reduce((sum, i) => sum + (i.amountPaid || 0), 0);
        return Math.round(total * 100) / 100;
      }

      case "SAAS_OUTSTANDING_AR": {
        const invoices = await this.invoiceRepo.getAll();
        const relevant = invoices.filter((i) => (i.currency || "KES").toUpperCase() === targetCur && ["OPEN", "OVERDUE"].includes(i.status));
        const total = relevant.reduce((sum, i) => sum + (i.amountDue || 0), 0);
        return Math.round(total * 100) / 100;
      }

      case "SAAS_OVERDUE_INVOICES_COUNT": {
        const invoices = await this.invoiceRepo.getAll();
        const now = new Date().toISOString();
        return invoices.filter((i) => (i.currency || "KES").toUpperCase() === targetCur && i.status === "OPEN" && i.dueAt && i.dueAt < now).length;
      }

      case "SAAS_FLEET_CAPACITY_QUOTA_TOTAL": {
        let total = 0;
        for (const sub of filteredSubs) {
          const status = sub.status || (sub as any).state;
          if (["ACTIVE", "RENEWAL_DUE", "GRACE_PERIOD"].includes(status)) {
            const plan = planMap.get(sub.planId);
            total += plan?.maxVehicles || 0;
          }
        }
        return total;
      }

      case "SAAS_FLEET_CAPACITY_USED": {
        const vehicles = await this.vehicleRepo.getAll();
        return vehicles.length;
      }

      case "SAAS_FLEET_UTILIZATION_PERCENT": {
        const quota = await this.evaluateMetric("SAAS_FLEET_CAPACITY_QUOTA_TOTAL", currency);
        const used = await this.evaluateMetric("SAAS_FLEET_CAPACITY_USED", currency);
        return quota > 0 ? Math.round((used / quota) * 1000) / 10 : 0;
      }

      case "SAAS_SEATS_QUOTA_TOTAL": {
        let total = 0;
        for (const sub of filteredSubs) {
          const status = sub.status || (sub as any).state;
          if (["ACTIVE", "RENEWAL_DUE", "GRACE_PERIOD"].includes(status)) {
            const plan = planMap.get(sub.planId);
            total += plan?.maxMembers || 0;
          }
        }
        return total;
      }

      case "SAAS_SEATS_USED": {
        const members = await this.membershipRepo.getAll();
        return members.filter((m) => m.status === "ACTIVE").length;
      }

      case "SAAS_LOGO_CHURN_RATE": {
        const cancelled = await this.evaluateMetric("SAAS_CANCELLED_TENANTS", currency);
        const activePaid = await this.evaluateMetric("SAAS_ACTIVE_PAID_TENANTS", currency);
        const totalBase = activePaid + cancelled;
        return totalBase > 0 ? Math.round((cancelled / totalBase) * 1000) / 10 : 0;
      }

      case "SAAS_NET_REVENUE_RETENTION": {
        // Evaluate based on MRR movement delta
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const endOfMonth = now.toISOString();
        const delta = await this.movementRepo.getNetMrrDeltaForPeriod(startOfMonth, endOfMonth, currency);
        const currentMrr = await this.calculateTotalMrr(currency);
        const startingMrr = currentMrr - delta.netMrrDelta;
        if (startingMrr <= 0) return 100;
        const nrr = ((startingMrr + delta.expansionMrr - delta.contractionMrr - delta.churnMrr) / startingMrr) * 100;
        return Math.round(nrr * 10) / 10;
      }

      default:
        return 0;
    }
  }

  /**
   * Compiles the Plan Performance distribution breakdown across all active plan tiers.
   */
  async getPlanPerformance(currency = "KES"): Promise<PlanPerformanceMetric[]> {
    const plans = await this.planRepo.getAll();
    const subs = await this.subscriptionRepo.getAll();
    const vehicles = await this.vehicleRepo.getAll();
    const targetCur = currency.toUpperCase();

    const totalPlatformMrr = await this.calculateTotalMrr(currency);
    const activePaidCount = await this.evaluateMetric("SAAS_ACTIVE_PAID_TENANTS", currency);

    const metrics: PlanPerformanceMetric[] = [];

    for (const plan of plans) {
      const planSubs = subs.filter((s) => s.planId === plan.id && (s.currency || "KES").toUpperCase() === targetCur);
      const activeSubs = planSubs.filter((s) => ["ACTIVE", "RENEWAL_DUE", "GRACE_PERIOD"].includes(s.status || (s as any).state));

      let tierMrr = 0;
      for (const sub of activeSubs) {
        tierMrr += this.calculateSubscriptionMrr(sub, plan);
      }

      const subscriberCount = activeSubs.length;
      const subscriberShare = activePaidCount > 0 ? (subscriberCount / activePaidCount) * 100 : 0;
      const mrrShare = totalPlatformMrr > 0 ? (tierMrr / totalPlatformMrr) * 100 : 0;
      const arpu = subscriberCount > 0 ? tierMrr / subscriberCount : 0;

      // Fleet utilization for this tier
      const tenantIds = new Set(activeSubs.map((s) => s.tenantId));
      const tierVehicles = vehicles.filter((v) => tenantIds.has(v.tenantId)).length;
      const totalAllotted = subscriberCount * (plan.maxVehicles || 1);
      const capacityUtil = totalAllotted > 0 ? (tierVehicles / totalAllotted) * 100 : 0;

      metrics.push({
        planId: plan.id,
        planCode: plan.code,
        planName: plan.name,
        monthlyPrice: plan.monthlyPrice,
        annualPrice: plan.annualPrice,
        subscriberCount,
        subscriberSharePercent: Math.round(subscriberShare * 10) / 10,
        totalMrrContribution: Math.round(tierMrr * 100) / 100,
        mrrSharePercent: Math.round(mrrShare * 10) / 10,
        arpu: Math.round(arpu * 100) / 100,
        averageFleetCapacity: plan.maxVehicles,
        fleetCapacityUtilization: Math.round(capacityUtil * 10) / 10,
        upgradesToThisPlan: 0,
        downgradesFromThisPlan: 0,
      });
    }

    return metrics;
  }

  /**
   * Compiles Billing Health, collection rate, and AR aging buckets.
   */
  async getBillingHealth(currency = "KES"): Promise<BillingHealthSummary> {
    const invoices = await this.invoiceRepo.getAll();
    const targetCur = currency.toUpperCase();
    const relevant = invoices.filter((i) => (i.currency || "KES").toUpperCase() === targetCur && i.status !== "VOID");

    const totalInvoiced = relevant.reduce((sum, i) => sum + (i.total || 0), 0);
    const totalCollected = relevant.reduce((sum, i) => sum + (i.amountPaid || 0), 0);
    const outstandingAr = relevant.reduce((sum, i) => sum + (i.amountDue || 0), 0);
    const collectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 100;

    // Aging analysis
    const now = Date.now();
    const agingBuckets: ArAgingBucket[] = [
      { bucket: "CURRENT", label: "Current (Not Overdue)", invoiceCount: 0, totalAmount: 0, currency: targetCur },
      { bucket: "1-15d", label: "1-15 Days Past Due", invoiceCount: 0, totalAmount: 0, currency: targetCur },
      { bucket: "16-30d", label: "16-30 Days Past Due", invoiceCount: 0, totalAmount: 0, currency: targetCur },
      { bucket: "31-60d", label: "31-60 Days Past Due", invoiceCount: 0, totalAmount: 0, currency: targetCur },
      { bucket: "60+d", label: "60+ Days Past Due", invoiceCount: 0, totalAmount: 0, currency: targetCur },
    ];

    for (const inv of relevant) {
      const amountDue = inv.amountDue ?? 0;
      if (amountDue <= 0) continue;

      const dueTime = inv.dueAt ? new Date(inv.dueAt).getTime() : now;
      const daysOverdue = Math.floor((now - dueTime) / (1000 * 60 * 60 * 24));

      if (daysOverdue <= 0) {
        agingBuckets[0].invoiceCount++;
        agingBuckets[0].totalAmount += amountDue;
      } else if (daysOverdue <= 15) {
        agingBuckets[1].invoiceCount++;
        agingBuckets[1].totalAmount += amountDue;
      } else if (daysOverdue <= 30) {
        agingBuckets[2].invoiceCount++;
        agingBuckets[2].totalAmount += amountDue;
      } else if (daysOverdue <= 60) {
        agingBuckets[3].invoiceCount++;
        agingBuckets[3].totalAmount += amountDue;
      } else {
        agingBuckets[4].invoiceCount++;
        agingBuckets[4].totalAmount += amountDue;
      }
    }

    return {
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      totalCollected: Math.round(totalCollected * 100) / 100,
      collectionRate: Math.round(collectionRate * 10) / 10,
      outstandingAr: Math.round(outstandingAr * 100) / 100,
      agingBuckets,
      recentFailedPaymentsCount: 0,
      dunningAccountsCount: relevant.filter((i) => i.status === "OPEN" && (i.amountDue ?? 0) > 0).length,
    };
  }

  /**
   * Compiles the primary executive SaaS overview payload.
   */
  async getExecutiveOverview(currency = "KES"): Promise<PlatformKpiOverview> {
    const totalMrr = await this.calculateTotalMrr(currency);
    const totalArr = Math.round(totalMrr * 12 * 100) / 100;
    const activePaid = await this.evaluateMetric("SAAS_ACTIVE_PAID_TENANTS", currency);
    const trial = await this.evaluateMetric("SAAS_TRIAL_TENANTS", currency);
    const renewalDue = await this.evaluateMetric("SAAS_RENEWAL_DUE_TENANTS", currency);
    const gracePeriod = await this.evaluateMetric("SAAS_GRACE_PERIOD_TENANTS", currency);
    const suspended = await this.evaluateMetric("SAAS_SUSPENDED_TENANTS", currency);
    const churned = await this.evaluateMetric("SAAS_CANCELLED_TENANTS", currency);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = now.toISOString();
    const delta = await this.movementRepo.getNetMrrDeltaForPeriod(startOfMonth, endOfMonth, currency);

    const nrr = await this.evaluateMetric("SAAS_NET_REVENUE_RETENTION", currency);
    const logoChurn = await this.evaluateMetric("SAAS_LOGO_CHURN_RATE", currency);
    const arpu = activePaid > 0 ? Math.round((totalMrr / activePaid) * 100) / 100 : 0;

    const recentMovements = await this.movementRepo.getMovements({ currency, limit: 10 });
    const planDistribution = await this.getPlanPerformance(currency);
    const billingHealth = await this.getBillingHealth(currency);
    const historicalSnapshots = await this.snapshotRepo.getAll();

    return {
      mrrTotal: totalMrr,
      arrTotal: totalArr,
      activePaidTenants: activePaid,
      trialTenants: trial,
      renewalDueTenants: renewalDue,
      gracePeriodTenants: gracePeriod,
      suspendedTenants: suspended,
      churnedTenants: churned,
      mrrNewMonthToDate: delta.newMrr,
      mrrExpansionMonthToDate: delta.expansionMrr,
      mrrContractionMonthToDate: delta.contractionMrr,
      mrrChurnMonthToDate: delta.churnMrr,
      netMrrDeltaMonthToDate: delta.netMrrDelta,
      netRevenueRetention: nrr,
      logoChurnRate: logoChurn,
      arpu,
      currency: currency.toUpperCase(),
      recentMovements,
      planDistribution,
      billingHealth,
      historicalSnapshots,
      asOf: now.toISOString(),
    };
  }
}
