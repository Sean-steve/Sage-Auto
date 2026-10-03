// ============================================================================
// CAR HIRE OS — PLATFORM RECONCILIATION SERVICE (Sprint 35: DOM-003, DEV-004)
// Mathematical equilibrium audit between active subscriptions, MRR projections,
// SaaS billing invoices, and settled platform cash
// ============================================================================

import {
  SubscriptionRepository,
  PlanRepository,
  SaaSBillingInvoiceRepository,
} from "@carhire/database";
import { PlatformMetricsService } from "./platform-metrics.service";

export interface PlatformReconciliationResult {
  reconciled: boolean;
  currency: string;
  calculatedMrr: number;
  subscriptionTotalMrr?: number;
  sumOfIndividualSubMrrs: number;
  mrrEquilibriumDiscrepancy: number;
  totalInvoicedRevenue: number;
  totalCollectedCash: number;
  totalOutstandingAr: number;
  invoiceArDiscrepancy: number;
  activePaidSubscriptionsCount: number;
  openInvoicesCount: number;
  auditIssues: string[];
  discrepancies?: string[];
  auditedAt: string;
}

export interface PlatformReconciliationServiceDeps {
  subscriptionRepo?: SubscriptionRepository;
  subRepo?: SubscriptionRepository;
  planRepo?: PlanRepository;
  invoiceRepo?: SaaSBillingInvoiceRepository;
  metricsService?: PlatformMetricsService;
  movementRepo?: any;
}

export class PlatformReconciliationService {
  private subscriptionRepo: SubscriptionRepository;
  private planRepo: PlanRepository;
  private invoiceRepo: SaaSBillingInvoiceRepository;
  private metricsService: PlatformMetricsService;

  constructor(
    depsOrSubRepo?: PlatformReconciliationServiceDeps | SubscriptionRepository,
    planRepo?: PlanRepository,
    invoiceRepo?: SaaSBillingInvoiceRepository,
    metricsService?: PlatformMetricsService
  ) {
    if (depsOrSubRepo && typeof (depsOrSubRepo as any).getAll !== "function") {
      const deps = depsOrSubRepo as PlatformReconciliationServiceDeps;
      this.subscriptionRepo = deps.subscriptionRepo || deps.subRepo || new SubscriptionRepository();
      this.planRepo = deps.planRepo || new PlanRepository();
      this.invoiceRepo = deps.invoiceRepo || new SaaSBillingInvoiceRepository();
      this.metricsService = deps.metricsService || new PlatformMetricsService();
    } else {
      this.subscriptionRepo = (depsOrSubRepo as SubscriptionRepository) || new SubscriptionRepository();
      this.planRepo = planRepo || new PlanRepository();
      this.invoiceRepo = invoiceRepo || new SaaSBillingInvoiceRepository();
      this.metricsService = metricsService || new PlatformMetricsService();
    }
  }

  /**
   * Performs an authoritative reconciliation audit of platform SaaS financial metrics.
   */
  async reconcile(currency = "KES"): Promise<PlatformReconciliationResult> {
    const targetCur = currency.toUpperCase();
    const subs = await this.subscriptionRepo.getAll();
    const plans = await this.planRepo.getAll();
    const invoices = await this.invoiceRepo.getAll();
    const planMap = new Map(plans.map((p) => [p.id, p]));

    const auditIssues: string[] = [];

    // 1. Reconcile Global MRR vs Sum of Individual Subscriptions
    const calculatedGlobalMrr = await this.metricsService.calculateTotalMrr(targetCur);

    let sumIndividualMrr = 0;
    let activePaidCount = 0;

    for (const sub of subs) {
      if ((sub.currency || "KES").toUpperCase() !== targetCur) continue;
      const status = sub.status || (sub as any).state;
      if (["ACTIVE", "RENEWAL_DUE", "GRACE_PERIOD"].includes(status)) {
        const plan = planMap.get(sub.planId);
        const subMrr = this.metricsService.calculateSubscriptionMrr(sub, plan);
        sumIndividualMrr += subMrr;
        if (subMrr > 0) activePaidCount++;
      }
    }

    sumIndividualMrr = Math.round(sumIndividualMrr * 100) / 100;
    const mrrDiscrepancy = Math.abs(calculatedGlobalMrr - sumIndividualMrr);

    if (mrrDiscrepancy > 0.01) {
      auditIssues.push(
        `MRR Equilibrium failure: Global MRR (${calculatedGlobalMrr}) differs from sum of active subscriptions (${sumIndividualMrr}) by ${mrrDiscrepancy}`
      );
    }

    // 2. Reconcile Invoicing Equilibrium: Total Invoiced == Total Collected + Outstanding AR
    const relevantInvoices = invoices.filter(
      (i) => (i.currency || "KES").toUpperCase() === targetCur && i.status !== "VOID"
    );

    const totalInvoiced = relevantInvoices.reduce((s, i) => s + (i.total || 0), 0);
    const totalCollected = relevantInvoices.reduce((s, i) => s + (i.amountPaid || 0), 0);
    const totalAr = relevantInvoices.reduce((s, i) => s + (i.amountDue || 0), 0);
    const openInvoicesCount = relevantInvoices.filter((i) => i.status === "OPEN" || i.status === "OVERDUE").length;

    const invoiceDiscrepancy = Math.abs(totalInvoiced - (totalCollected + totalAr));
    if (invoiceDiscrepancy > 0.01) {
      auditIssues.push(
        `Invoicing Equilibrium failure: Total Invoiced (${totalInvoiced}) does not equal Collected (${totalCollected}) + AR (${totalAr})`
      );
    }

    const reconciled = auditIssues.length === 0;

    return {
      reconciled,
      currency: targetCur,
      calculatedMrr: calculatedGlobalMrr,
      subscriptionTotalMrr: calculatedGlobalMrr,
      sumOfIndividualSubMrrs: sumIndividualMrr,
      mrrEquilibriumDiscrepancy: Math.round(mrrDiscrepancy * 100) / 100,
      totalInvoicedRevenue: Math.round(totalInvoiced * 100) / 100,
      totalCollectedCash: Math.round(totalCollected * 100) / 100,
      totalOutstandingAr: Math.round(totalAr * 100) / 100,
      invoiceArDiscrepancy: Math.round(invoiceDiscrepancy * 100) / 100,
      activePaidSubscriptionsCount: activePaidCount,
      openInvoicesCount,
      auditIssues,
      discrepancies: auditIssues,
      auditedAt: new Date().toISOString(),
    };
  }
}
