// ============================================================================
// CAR HIRE OS — PLATFORM SAAS ANALYTICS & SUBSCRIPTION INTELLIGENCE TYPES (Sprint 35)
// Bounded Context: Platform SaaS Analytics, Metric Registry, MRR/ARR Engine,
// Churn, Cohorts, Plan Performance, Billing Health & Reporting
// ============================================================================

// ----------------------------------------------------------------------------
// 1. PLATFORM METRIC KEYS & REGISTRY TYPES
// ----------------------------------------------------------------------------

export type PlatformMetricKey =
  // Recurring Revenue & Run Rate
  | "SAAS_MRR_TOTAL"
  | "SAAS_ARR_TOTAL"
  | "SAAS_MRR_NEW"
  | "SAAS_MRR_EXPANSION"
  | "SAAS_MRR_CONTRACTION"
  | "SAAS_MRR_CHURN"
  | "SAAS_MRR_REACTIVATION"
  | "SAAS_MRR_NET_DELTA"
  | "SAAS_ARPU"
  | "SAAS_LTV"
  // Subscriber Counts & Distribution
  | "SAAS_TOTAL_TENANTS"
  | "SAAS_ACTIVE_PAID_TENANTS"
  | "SAAS_TRIAL_TENANTS"
  | "SAAS_RENEWAL_DUE_TENANTS"
  | "SAAS_GRACE_PERIOD_TENANTS"
  | "SAAS_SUSPENDED_TENANTS"
  | "SAAS_CANCELLED_TENANTS"
  // Retention & Churn Rates
  | "SAAS_LOGO_CHURN_RATE"
  | "SAAS_GROSS_REVENUE_CHURN_RATE"
  | "SAAS_NET_REVENUE_RETENTION"
  | "SAAS_TRIAL_CONVERSION_RATE"
  | "SAAS_AVERAGE_TIME_TO_CONVERT_DAYS"
  // Billing Health & Invoicing
  | "SAAS_INVOICED_REVENUE"
  | "SAAS_COLLECTED_CASH"
  | "SAAS_OUTSTANDING_AR"
  | "SAAS_OVERDUE_INVOICES_COUNT"
  | "SAAS_PAYMENT_FAILURE_RATE"
  | "SAAS_DSO_DAYS"
  // Entitlement & Quota Adoption
  | "SAAS_FLEET_CAPACITY_QUOTA_TOTAL"
  | "SAAS_FLEET_CAPACITY_USED"
  | "SAAS_FLEET_UTILIZATION_PERCENT"
  | "SAAS_SEATS_QUOTA_TOTAL"
  | "SAAS_SEATS_USED"
  | "SAAS_ADVANCED_FEATURE_ADOPTION_RATE";

export type PlatformMetricCategory =
  | "REVENUE"
  | "SUBSCRIBERS"
  | "CHURN_RETENTION"
  | "BILLING_HEALTH"
  | "ENTITLEMENT_USAGE";

export type PlatformMetricGrain = "DAILY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";

export type PlatformAggregationType =
  | "SUM"
  | "AVG"
  | "COUNT"
  | "SNAPSHOT_LATEST"
  | "RATE"
  | "RATIO";

export interface PlatformMetricDefinition {
  key: PlatformMetricKey;
  name: string;
  category: PlatformMetricCategory;
  description: string;
  formula: string;
  sourceDomain: string;
  unit: "CURRENCY" | "COUNT" | "PERCENT" | "PERCENTAGE" | "DAYS" | "RATIO";
  grain: PlatformMetricGrain;
  aggregationType: PlatformAggregationType;
  version: string;
  currencyDependent: boolean;
  isActive: boolean;
}

// ----------------------------------------------------------------------------
// 2. MRR MOVEMENT TYPES (WATERFALL ACCOUNTING)
// ----------------------------------------------------------------------------

export type MrrMovementType =
  | "NEW"
  | "EXPANSION"
  | "CONTRACTION"
  | "CHURN"
  | "REACTIVATION";

export interface MrrMovementRecord {
  id: string;
  tenantId: string;
  tenantName: string;
  subscriptionId: string;
  movementType: MrrMovementType;
  previousMrr: number;
  newMrr: number;
  mrrDelta: number;
  currency: string;
  previousPlanCode?: string;
  newPlanCode?: string;
  billingInterval: "MONTHLY" | "ANNUAL";
  reason?: string;
  occurredAt: string;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// 3. DAILY PLATFORM SNAPSHOT & HISTORICAL PROJECTIONS
// ----------------------------------------------------------------------------

export interface PlatformDailySnapshotRecord {
  id: string;
  snapshotDate: string; // YYYY-MM-DD
  currency: string;
  // Subscribers
  totalTenants: number;
  activePaidTenants: number;
  trialTenants: number;
  renewalDueTenants: number;
  gracePeriodTenants: number;
  suspendedTenants: number;
  cancelledTenants: number;
  // MRR & ARR
  totalMrr: number;
  totalArr: number;
  newMrr: number;
  expansionMrr: number;
  contractionMrr: number;
  churnMrr: number;
  reactivationMrr: number;
  netMrrDelta: number;
  arpu: number;
  // Rates
  logoChurnRate: number;
  netRevenueRetention: number;
  trialConversionRate: number;
  // Billing Health
  totalInvoiced: number;
  totalCollected: number;
  outstandingAr: number;
  overdueInvoicesCount: number;
  paymentFailureRate: number;
  // Entitlements
  totalFleetCapacityAllotted: number;
  totalFleetCapacityUsed: number;
  fleetCapacityUtilizationRate: number;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// 4. COHORT RETENTION TYPES
// ----------------------------------------------------------------------------

export interface CohortMonthMetric {
  periodMonth: number; // 0, 1, 2, ... 12
  periodIndex?: number;
  activeSubscribers: number;
  retentionRate: number; // percentage (e.g., 92.5)
  mrrRetained: number;
  netRevenueRetention: number; // percentage (e.g., 105.0)
}

export interface PlatformCohortRecord {
  id: string;
  cohortMonth: string; // YYYY-MM
  initialSubscribers: number;
  initialTenantCount?: number;
  initialMrr: number;
  currency: string;
  periods: CohortMonthMetric[];
  retentionPeriods?: CohortMonthMetric[];
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// 5. PLAN PERFORMANCE & QUOTA DISTRIBUTION
// ----------------------------------------------------------------------------

export interface PlanPerformanceMetric {
  planId: string;
  planCode: string;
  planName: string;
  monthlyPrice: number;
  annualPrice: number;
  subscriberCount: number;
  subscriberSharePercent: number;
  totalMrrContribution: number;
  mrrSharePercent: number;
  arpu: number;
  averageFleetCapacity: number;
  fleetCapacityUtilization: number;
  upgradesToThisPlan: number;
  downgradesFromThisPlan: number;
}

// ----------------------------------------------------------------------------
// 6. BILLING HEALTH & AR AGING
// ----------------------------------------------------------------------------

export interface ArAgingBucket {
  bucket: "CURRENT" | "1_15_DAYS" | "16_30_DAYS" | "31_60_DAYS" | "60_PLUS_DAYS" | "1-15d" | "16-30d" | "31-60d" | "60+d";
  label: string;
  invoiceCount: number;
  totalAmount: number;
  currency: string;
}

export interface BillingHealthSummary {
  totalInvoiced: number;
  totalCollected: number;
  collectionRate: number;
  outstandingAr: number;
  agingBuckets: ArAgingBucket[];
  recentFailedPaymentsCount: number;
  dunningAccountsCount: number;
}

// ----------------------------------------------------------------------------
// 7. PLATFORM REPORT TYPES & REGISTRY
// ----------------------------------------------------------------------------

export type PlatformReportType =
  | "MRR_WATERFALL"
  | "SUBSCRIPTION_COHORTS"
  | "PLAN_PERFORMANCE"
  | "BILLING_HEALTH_AGING"
  | "BILLING_COLLECTION_AGING"
  | "ENTITLEMENT_ADOPTION"
  | "CHURN_ANALYSIS"
  | "PLATFORM_REVENUE_RECONCILIATION"
  | "EXECUTIVE_SAAS_OVERVIEW";

export interface PlatformReportDefinition {
  type: PlatformReportType;
  title: string;
  category: "FINANCIAL" | "GROWTH" | "OPERATIONAL";
  description: string;
  allowedExportFormats: ("CSV" | "XLSX" | "JSON")[];
  defaultDateRange: "LAST_30_DAYS" | "LAST_90_DAYS" | "LAST_12_MONTHS" | "YEAR_TO_DATE" | "ALL_TIME";
}

export interface PlatformReportFilter {
  startDate?: string;
  endDate?: string;
  currency?: string;
  planCode?: string;
  status?: string;
  limit?: number;
  offset?: number;
  page?: number;
  pageSize?: number;
}

export interface PlatformReportExecutionRecord {
  id: string;
  reportType: PlatformReportType;
  reportKey?: string;
  executedBy: string; // platform actor ID
  filters: PlatformReportFilter;
  executionTimeMs: number;
  rowCount: number;
  summary: Record<string, any>;
  data: any[];
  columns?: any[];
  rows?: any[];
  createdAt: string;
}

export interface PlatformSavedReportRecord {
  id: string;
  name: string;
  description?: string;
  reportType: PlatformReportType;
  filters: PlatformReportFilter;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// 8. EXECUTIVE SAAS OVERVIEW DTO (PRIMARY DASHBOARD PAYLOAD)
// ----------------------------------------------------------------------------

export interface PlatformKpiOverview {
  mrrTotal: number;
  arrTotal: number;
  activePaidTenants: number;
  trialTenants: number;
  renewalDueTenants: number;
  gracePeriodTenants: number;
  suspendedTenants: number;
  churnedTenants: number;
  mrrNewMonthToDate: number;
  mrrExpansionMonthToDate: number;
  mrrContractionMonthToDate: number;
  mrrChurnMonthToDate: number;
  netMrrDeltaMonthToDate: number;
  netRevenueRetention: number;
  logoChurnRate: number;
  arpu: number;
  currency: string;
  recentMovements: MrrMovementRecord[];
  planDistribution: PlanPerformanceMetric[];
  billingHealth: BillingHealthSummary;
  historicalSnapshots: PlatformDailySnapshotRecord[];
  asOf: string;
}
