// ============================================================================
// CAR HIRE OS — PLATFORM REPORT REGISTRY (Sprint 35)
// Canonical catalogue of authoritative Platform SaaS Intelligence Reports
// ============================================================================

import type { PlatformReportDefinition, PlatformReportType } from "@carhire/types";

export class PlatformReportRegistry {
  private static readonly REPORTS: Map<PlatformReportType, PlatformReportDefinition> = new Map([
    [
      "EXECUTIVE_SAAS_OVERVIEW",
      {
        type: "EXECUTIVE_SAAS_OVERVIEW",
        title: "Executive SaaS Overview & Run Rate",
        category: "GROWTH",
        description: "High-level summary of active subscriptions, total MRR, ARR, churn rate, NRR, and ARPU",
        allowedExportFormats: ["CSV", "XLSX", "JSON"],
        defaultDateRange: "LAST_30_DAYS",
      },
    ],
    [
      "MRR_WATERFALL",
      {
        type: "MRR_WATERFALL",
        title: "MRR Movement & Waterfall Accounting",
        category: "FINANCIAL",
        description: "Decomposition of periodic MRR change into New, Expansion, Contraction, Churn, and Reactivation components",
        allowedExportFormats: ["CSV", "XLSX", "JSON"],
        defaultDateRange: "LAST_90_DAYS",
      },
    ],
    [
      "SUBSCRIPTION_COHORTS",
      {
        type: "SUBSCRIPTION_COHORTS",
        title: "Subscription Acquisition & Net Revenue Retention Cohorts",
        category: "GROWTH",
        description: "Monthly acquisition cohort analysis showing logo retention and Net Revenue Retention (NRR) decay over 12 months",
        allowedExportFormats: ["CSV", "XLSX", "JSON"],
        defaultDateRange: "LAST_12_MONTHS",
      },
    ],
    [
      "PLAN_PERFORMANCE",
      {
        type: "PLAN_PERFORMANCE",
        title: "Plan Tier Distribution & Monetization Efficiency",
        category: "GROWTH",
        description: "Performance by subscription tier (Growth, Pro, Enterprise) including subscriber counts, MRR contribution, and ARPU",
        allowedExportFormats: ["CSV", "XLSX", "JSON"],
        defaultDateRange: "ALL_TIME",
      },
    ],
    [
      "BILLING_HEALTH_AGING",
      {
        type: "BILLING_HEALTH_AGING",
        title: "SaaS Billing Health, Dunning & AR Aging",
        category: "FINANCIAL",
        description: "Platform subscription invoice collection rates, overdue aging buckets, failed automated transactions, and DSO",
        allowedExportFormats: ["CSV", "XLSX", "JSON"],
        defaultDateRange: "LAST_90_DAYS",
      },
    ],
    [
      "ENTITLEMENT_ADOPTION",
      {
        type: "ENTITLEMENT_ADOPTION",
        title: "Platform Entitlement & Quota Adoption Telemetry",
        category: "OPERATIONAL",
        description: "Tenant utilization of contracted fleet capacity, staff member seats, and premium feature entitlements",
        allowedExportFormats: ["CSV", "XLSX", "JSON"],
        defaultDateRange: "LAST_30_DAYS",
      },
    ],
    [
      "CHURN_ANALYSIS",
      {
        type: "CHURN_ANALYSIS",
        title: "Comprehensive Logo & Revenue Churn Analysis",
        category: "GROWTH",
        description: "Detailed breakdown of subscriber attrition, voluntary vs. involuntary churn, reasons, and gross revenue churn rate",
        allowedExportFormats: ["CSV", "XLSX", "JSON"],
        defaultDateRange: "LAST_12_MONTHS",
      },
    ],
    [
      "PLATFORM_REVENUE_RECONCILIATION",
      {
        type: "PLATFORM_REVENUE_RECONCILIATION",
        title: "Platform Revenue & Gateway Ledger Reconciliation",
        category: "FINANCIAL",
        description: "Reconciliation between calculated SaaS subscription MRR, issued SaaS billing invoices, and settled Stripe/M-Pesa cash",
        allowedExportFormats: ["CSV", "XLSX", "JSON"],
        defaultDateRange: "LAST_30_DAYS",
      },
    ],
  ]);

  static getAll(): PlatformReportDefinition[] {
    return Array.from(this.REPORTS.values());
  }

  static get(type: PlatformReportType | string): PlatformReportDefinition | undefined {
    if (type === "BILLING_COLLECTION_AGING") {
      return this.REPORTS.get("BILLING_HEALTH_AGING");
    }
    return this.REPORTS.get(type as PlatformReportType);
  }

  static count(): number {
    return this.REPORTS.size;
  }
}
