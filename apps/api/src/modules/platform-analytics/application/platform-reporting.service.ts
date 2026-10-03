// ============================================================================
// CAR HIRE OS — PLATFORM REPORTING SERVICE (Sprint 35: DOM-003, DEV-004)
// Execution engine for canonical Platform SaaS Intelligence Reports
// ============================================================================

import type {
  PlatformReportType,
  PlatformReportFilter,
  PlatformReportExecutionRecord,
  PlatformSavedReportRecord,
} from "@carhire/types";
import {
  PlatformReportRepository,
  SubscriptionRepository,
  PlanRepository,
  TenantRepository,
  SaaSBillingInvoiceRepository,
  MrrMovementRepository,
  VehicleRepository,
} from "@carhire/database";
import { PlatformReportRegistry } from "../domain/platform-report-registry";
import { PlatformMetricsService } from "./platform-metrics.service";
import { PlatformCohortService } from "./platform-cohort.service";

export interface PlatformReportingServiceDeps {
  reportRepo?: PlatformReportRepository;
  metricsService?: PlatformMetricsService;
  cohortService?: PlatformCohortService;
  subscriptionRepo?: SubscriptionRepository;
  subRepo?: SubscriptionRepository;
  planRepo?: PlanRepository;
  tenantRepo?: TenantRepository;
  invoiceRepo?: SaaSBillingInvoiceRepository;
  movementRepo?: MrrMovementRepository;
  vehicleRepo?: VehicleRepository;
}

const DEFAULT_COLUMNS: Record<string, { key: string; label: string }[]> = {
  MRR_WATERFALL: [
    { key: "id", label: "Movement ID" },
    { key: "occurredAt", label: "Date" },
    { key: "tenantId", label: "Tenant ID" },
    { key: "movementType", label: "Movement Type" },
    { key: "mrrDelta", label: "MRR Delta" },
    { key: "newMrr", label: "New MRR" },
    { key: "currency", label: "Currency" },
    { key: "reason", label: "Reason" },
  ],
  BILLING_HEALTH_AGING: [
    { key: "bucket", label: "Aging Bucket" },
    { key: "label", label: "Bucket Description" },
    { key: "invoiceCount", label: "Invoice Count" },
    { key: "totalAmount", label: "Total Past Due Amount" },
    { key: "currency", label: "Currency" },
  ],
  BILLING_COLLECTION_AGING: [
    { key: "bucket", label: "Aging Bucket" },
    { key: "label", label: "Bucket Description" },
    { key: "invoiceCount", label: "Invoice Count" },
    { key: "totalAmount", label: "Total Past Due Amount" },
    { key: "currency", label: "Currency" },
  ],
  PLAN_PERFORMANCE: [
    { key: "planCode", label: "Plan Code" },
    { key: "planName", label: "Plan Name" },
    { key: "monthlyPrice", label: "Monthly Price" },
    { key: "subscriberCount", label: "Subscribers" },
    { key: "totalMrrContribution", label: "MRR Contribution" },
    { key: "arpu", label: "ARPU" },
  ],
  SUBSCRIPTION_COHORTS: [
    { key: "cohortMonth", label: "Cohort Month" },
    { key: "initialSubscribers", label: "Initial Subscribers" },
    { key: "initialMrr", label: "Initial MRR" },
    { key: "currency", label: "Currency" },
  ],
  ENTITLEMENT_ADOPTION: [
    { key: "entitlementKey", label: "Entitlement" },
    { key: "quotaAllotted", label: "Quota Allotted" },
    { key: "quotaUsed", label: "Quota Used" },
    { key: "utilizationRate", label: "Utilization %" },
  ],
  CHURN_ANALYSIS: [
    { key: "churnMonth", label: "Month" },
    { key: "churnedTenants", label: "Churned Tenants" },
    { key: "churnedMrr", label: "Churned MRR" },
    { key: "churnRate", label: "Logo Churn Rate %" },
  ],
  PLATFORM_REVENUE_RECONCILIATION: [
    { key: "category", label: "Financial Category" },
    { key: "amount", label: "Amount" },
    { key: "currency", label: "Currency" },
  ],
  EXECUTIVE_SAAS_OVERVIEW: [
    { key: "planCode", label: "Plan Code" },
    { key: "planName", label: "Plan Name" },
    { key: "subscriberCount", label: "Subscribers" },
    { key: "totalMrrContribution", label: "MRR" },
  ],
};

export class PlatformReportingService {
  private reportRepo: PlatformReportRepository;
  private metricsService: PlatformMetricsService;
  private cohortService: PlatformCohortService;
  private subscriptionRepo: SubscriptionRepository;
  private planRepo: PlanRepository;
  private tenantRepo: TenantRepository;
  private invoiceRepo: SaaSBillingInvoiceRepository;
  private movementRepo: MrrMovementRepository;

  constructor(
    depsOrReportRepo?: PlatformReportingServiceDeps | PlatformReportRepository,
    metricsService?: PlatformMetricsService,
    cohortService?: PlatformCohortService,
    subscriptionRepo?: SubscriptionRepository,
    planRepo?: PlanRepository,
    tenantRepo?: TenantRepository,
    invoiceRepo?: SaaSBillingInvoiceRepository,
    movementRepo?: MrrMovementRepository
  ) {
    if (depsOrReportRepo && typeof (depsOrReportRepo as any).createExecution !== "function") {
      const deps = depsOrReportRepo as PlatformReportingServiceDeps;
      this.reportRepo = deps.reportRepo || new PlatformReportRepository();
      this.metricsService = deps.metricsService || new PlatformMetricsService();
      this.cohortService = deps.cohortService || new PlatformCohortService();
      this.subscriptionRepo = deps.subscriptionRepo || deps.subRepo || new SubscriptionRepository();
      this.planRepo = deps.planRepo || new PlanRepository();
      this.tenantRepo = deps.tenantRepo || new TenantRepository();
      this.invoiceRepo = deps.invoiceRepo || new SaaSBillingInvoiceRepository();
      this.movementRepo = deps.movementRepo || new MrrMovementRepository();
    } else {
      this.reportRepo = (depsOrReportRepo as PlatformReportRepository) || new PlatformReportRepository();
      this.metricsService = metricsService || new PlatformMetricsService();
      this.cohortService = cohortService || new PlatformCohortService();
      this.subscriptionRepo = subscriptionRepo || new SubscriptionRepository();
      this.planRepo = planRepo || new PlanRepository();
      this.tenantRepo = tenantRepo || new TenantRepository();
      this.invoiceRepo = invoiceRepo || new SaaSBillingInvoiceRepository();
      this.movementRepo = movementRepo || new MrrMovementRepository();
    }
  }

  /**
   * Executes a canonical platform report and logs the execution.
   */
  async executeReport(
    reportType: PlatformReportType,
    filters: PlatformReportFilter = {},
    executedBy = "system"
  ): Promise<PlatformReportExecutionRecord> {
    const def = PlatformReportRegistry.get(reportType);
    if (!def) {
      throw new Error(`Report type '${reportType}' is not registered in PlatformReportRegistry`);
    }

    const startTime = Date.now();
    const currency = (filters.currency || "KES").toUpperCase();

    let summary: Record<string, any> = {};
    let data: any[] = [];

    switch (reportType) {
      case "EXECUTIVE_SAAS_OVERVIEW": {
        const overview = await this.metricsService.getExecutiveOverview(currency);
        summary = {
          mrrTotal: overview.mrrTotal,
          arrTotal: overview.arrTotal,
          activePaidTenants: overview.activePaidTenants,
          netRevenueRetention: overview.netRevenueRetention,
          logoChurnRate: overview.logoChurnRate,
          arpu: overview.arpu,
        };
        data = overview.planDistribution;
        break;
      }

      case "MRR_WATERFALL": {
        const from = filters.startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        const to = filters.endDate || new Date().toISOString().split("T")[0];
        const delta = await this.movementRepo.getNetMrrDeltaForPeriod(from, to, currency);
        const movements = await this.movementRepo.getMovements({ from, to, currency });
        summary = delta;
        data = movements;
        break;
      }

      case "SUBSCRIPTION_COHORTS": {
        const cohorts = await this.cohortService.getCohorts(currency);
        summary = {
          cohortCount: cohorts.length,
          averageInitialMrr: cohorts.length > 0 ? cohorts.reduce((s, c) => s + c.initialMrr, 0) / cohorts.length : 0,
        };
        data = cohorts;
        break;
      }

      case "PLAN_PERFORMANCE": {
        const plans = await this.metricsService.getPlanPerformance(currency);
        const totalMrr = plans.reduce((s, p) => s + p.totalMrrContribution, 0);
        summary = {
          tierCount: plans.length,
          totalMrr,
        };
        data = plans;
        break;
      }

      case "BILLING_COLLECTION_AGING" as any:
      case "BILLING_HEALTH_AGING": {
        const health = await this.metricsService.getBillingHealth(currency);
        summary = {
          totalInvoiced: health.totalInvoiced,
          totalCollected: health.totalCollected,
          collectionRate: health.collectionRate,
          outstandingAr: health.outstandingAr,
        };
        data = health.agingBuckets;
        break;
      }

      case "ENTITLEMENT_ADOPTION": {
        const quotaTotal = await this.metricsService.evaluateMetric("SAAS_FLEET_CAPACITY_QUOTA_TOTAL", currency);
        const quotaUsed = await this.metricsService.evaluateMetric("SAAS_FLEET_CAPACITY_USED", currency);
        const seatsTotal = await this.metricsService.evaluateMetric("SAAS_SEATS_QUOTA_TOTAL", currency);
        const seatsUsed = await this.metricsService.evaluateMetric("SAAS_SEATS_USED", currency);
        const utilPercent = await this.metricsService.evaluateMetric("SAAS_FLEET_UTILIZATION_PERCENT", currency);
        summary = {
          quotaTotal,
          quotaUsed,
          fleetUtilizationRate: utilPercent,
          seatsTotal,
          seatsUsed,
        };
        data = [
          { dimension: "Fleet Capacity", quota: quotaTotal, used: quotaUsed, utilizationPercent: utilPercent },
          { dimension: "User Seats", quota: seatsTotal, used: seatsUsed, utilizationPercent: seatsTotal > 0 ? (seatsUsed / seatsTotal) * 100 : 0 },
        ];
        break;
      }

      case "CHURN_ANALYSIS": {
        const logoChurn = await this.metricsService.evaluateMetric("SAAS_LOGO_CHURN_RATE", currency);
        const cancelledCount = await this.metricsService.evaluateMetric("SAAS_CANCELLED_TENANTS", currency);
        const activePaid = await this.metricsService.evaluateMetric("SAAS_ACTIVE_PAID_TENANTS", currency);
        const movements = await this.movementRepo.getMovements({ movementType: "CHURN", currency });
        summary = {
          logoChurnRate: logoChurn,
          churnedTenantsCount: cancelledCount,
          activePaidCount: activePaid,
          churnedMrrTotal: movements.reduce((s, m) => s + Math.abs(m.mrrDelta), 0),
        };
        data = movements;
        break;
      }

      case "PLATFORM_REVENUE_RECONCILIATION": {
        const mrr = await this.metricsService.calculateTotalMrr(currency);
        const invoiced = await this.metricsService.evaluateMetric("SAAS_INVOICED_REVENUE", currency);
        const collected = await this.metricsService.evaluateMetric("SAAS_COLLECTED_CASH", currency);
        const ar = await this.metricsService.evaluateMetric("SAAS_OUTSTANDING_AR", currency);
        summary = {
          currentMrr: mrr,
          totalInvoiced: invoiced,
          totalCollected: collected,
          outstandingAr: ar,
          reconciled: Math.abs(invoiced - (collected + ar)) < 0.01,
        };
        data = [
          { category: "Current Active MRR", amount: mrr, currency },
          { category: "Total Invoiced SaaS Revenue", amount: invoiced, currency },
          { category: "Total Settled Cash Payments", amount: collected, currency },
          { category: "Outstanding Accounts Receivable", amount: ar, currency },
        ];
        break;
      }
    }

    const executionTimeMs = Date.now() - startTime;

    const execution = await this.reportRepo.createExecution({
      reportType,
      executedBy,
      filters,
      executionTimeMs,
      rowCount: data.length,
      summary,
      data,
    });

    (execution as any).reportKey = reportType;
    (execution as any).columns = (def as any).columns || DEFAULT_COLUMNS[reportType] || DEFAULT_COLUMNS["MRR_WATERFALL"];
    (execution as any).rows = data;

    return execution;
  }

  /**
   * Saves a report query configuration preset.
   */
  async saveReportPreset(
    name: string,
    reportType: PlatformReportType,
    filters: PlatformReportFilter,
    createdBy: string,
    description?: string
  ): Promise<PlatformSavedReportRecord> {
    return this.reportRepo.saveReport({
      name,
      description,
      reportType,
      filters,
      createdBy,
    });
  }

  /**
   * Retrieves all saved report presets.
   */
  async getSavedReports(): Promise<PlatformSavedReportRecord[]> {
    return this.reportRepo.getSavedReports();
  }

  /**
   * Deletes a saved report preset.
   */
  async deleteSavedReport(id: string): Promise<boolean> {
    return this.reportRepo.deleteSavedReport(id);
  }
}
