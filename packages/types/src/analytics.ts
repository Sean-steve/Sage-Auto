// ============================================================================
// CAR HIRE OS — ANALYTICS & REPORTING TYPES (Sprint 34)
// Bounded Context: Tenant Analytics, Metric Registry, Operational KPIs,
// Financial Reports, Projections, Async Exports & Reconciliation
// ============================================================================

// ----------------------------------------------------------------------------
// 1. METRIC KEYS & REGISTRY TYPES
// ----------------------------------------------------------------------------

export type MetricKey =
  // Fleet & Utilization
  | "FLEET_TOTAL_VEHICLES"
  | "FLEET_ACTIVE_VEHICLES"
  | "FLEET_AVAILABLE_VEHICLES"
  | "FLEET_ON_RENT_VEHICLES"
  | "FLEET_MAINTENANCE_VEHICLES"
  | "FLEET_UTILIZATION_RATE"
  | "FLEET_DOWNTIME_HOURS"
  // Bookings & Reservations
  | "BOOKING_TOTAL_COUNT"
  | "BOOKING_CONFIRMED_COUNT"
  | "BOOKING_COMPLETED_COUNT"
  | "BOOKING_CANCELLED_COUNT"
  | "BOOKING_NO_SHOW_COUNT"
  | "BOOKING_TOTAL_VALUE"
  | "BOOKING_AVERAGE_VALUE"
  | "BOOKING_CANCELLATION_RATE"
  | "BOOKING_NO_SHOW_RATE"
  | "BOOKING_LEAD_TIME_HOURS"
  // Rentals
  | "RENTAL_TOTAL_COUNT"
  | "RENTAL_ACTIVE_COUNT"
  | "RENTAL_COMPLETED_COUNT"
  | "RENTAL_AVERAGE_DURATION_DAYS"
  | "RENTAL_EXTENSIONS_COUNT"
  | "RENTAL_LATE_RETURN_COUNT"
  // Financial & Ledger (Authoritative)
  | "FINANCE_GROSS_INVOICED"
  | "FINANCE_TAX_INVOICED"
  | "FINANCE_DISCOUNT_TOTAL"
  | "FINANCE_NET_INVOICED_REVENUE"
  | "FINANCE_POSTED_REVENUE"
  | "FINANCE_CASH_RECEIPTS"
  | "FINANCE_TOTAL_EXPENSES"
  | "FINANCE_OUTSTANDING_RECEIVABLES"
  | "FINANCE_DEPOSITS_HELD"
  | "FINANCE_REFUNDS_COMPLETED"
  | "FINANCE_TRIAL_BALANCE_DEBITS"
  | "FINANCE_TRIAL_BALANCE_CREDITS"
  | "FINANCE_TRIAL_BALANCE_RECONCILED"
  // Vehicle Profitability
  | "VEHICLE_REVENUE"
  | "VEHICLE_COSTS"
  | "VEHICLE_NET_PROFIT"
  // Owner Settlements
  | "OWNER_SETTLEMENT_TOTAL_PAYABLE"
  | "OWNER_SETTLEMENT_PAID"
  | "OWNER_SETTLEMENT_PENDING"
  // Maintenance & Compliance
  | "MAINTENANCE_TOTAL_COST"
  | "MAINTENANCE_WORK_ORDERS_COUNT"
  | "COMPLIANCE_VALID_COUNT"
  | "COMPLIANCE_EXPIRING_COUNT"
  | "COMPLIANCE_EXPIRED_COUNT"
  // Customers & Corporate
  | "CUSTOMER_TOTAL_COUNT"
  | "CUSTOMER_NEW_COUNT"
  | "CUSTOMER_REPEAT_COUNT"
  | "CORPORATE_ACCOUNT_COUNT"
  // CRM Funnel
  | "CRM_LEAD_TOTAL_COUNT"
  | "CRM_LEAD_QUALIFIED_COUNT"
  | "CRM_LEAD_CONVERTED_COUNT"
  | "CRM_LEAD_CONVERSION_RATE"
  | "CRM_QUOTE_TOTAL_COUNT"
  | "CRM_QUOTE_SENT_COUNT"
  | "CRM_QUOTE_ACCEPTED_COUNT"
  | "CRM_QUOTE_CONVERSION_RATE"
  | "CRM_TOTAL_PIPELINE_VALUE";

export type MetricUnit =
  | "COUNT"
  | "CURRENCY"
  | "PERCENTAGE"
  | "DURATION"
  | "DISTANCE"
  | "RATIO"
  | "BOOLEAN";

export type MetricCurrencyBehavior =
  | "SINGLE_CURRENCY"
  | "GROUPED_BY_CURRENCY"
  | "NOT_APPLICABLE";

export type MetricTimeBasis =
  | "BOOKING_CREATED"
  | "BOOKING_PICKUP"
  | "RENTAL_START"
  | "RENTAL_COMPLETED"
  | "INVOICE_DATE"
  | "PAYMENT_VERIFIED"
  | "JOURNAL_POSTED"
  | "LEAD_CREATED"
  | "SETTLEMENT_APPROVED"
  | "CURRENT_SNAPSHOT";

export type MetricFreshnessMode =
  | "REAL_TIME"
  | "NEAR_REAL_TIME"
  | "SCHEDULED"
  | "END_OF_DAY";

export type MetricSourceDomain =
  | "FLEET"
  | "BOOKINGS"
  | "RENTALS"
  | "FINANCE"
  | "LEDGER"
  | "OWNER_SETTLEMENTS"
  | "MAINTENANCE"
  | "COMPLIANCE"
  | "CUSTOMERS"
  | "CRM";

export interface MetricDefinition {
  key: MetricKey;
  displayName: string;
  description: string;
  sourceDomain: MetricSourceDomain;
  formula: string;
  unit: MetricUnit;
  currencyBehavior: MetricCurrencyBehavior;
  timeBasis: MetricTimeBasis;
  filterDimensions: string[];
  freshnessMode: MetricFreshnessMode;
  permissionRequired: string;
  version: number;
}

export interface MetricValueResult {
  key: MetricKey;
  displayName: string;
  value: number | boolean;
  unit: MetricUnit;
  currency?: string;
  byCurrency?: Record<string, number>;
  period: { from: string; to: string };
  previousPeriodValue?: number | boolean;
  changePercentage?: number | null; // null if prior period is zero and cannot compute meaningful percentage
  dataAsOf: string;
  freshness: MetricFreshnessMode;
}

// ----------------------------------------------------------------------------
// 2. PERIOD PRESETS & DATE INTERVALS
// ----------------------------------------------------------------------------

export type PeriodPreset =
  | "TODAY"
  | "YESTERDAY"
  | "THIS_WEEK"
  | "LAST_WEEK"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "THIS_QUARTER"
  | "THIS_YEAR"
  | "CUSTOM";

export interface DateInterval {
  from: string; // ISO 8601 UTC
  to: string;   // ISO 8601 UTC
  preset?: PeriodPreset;
  timezone?: string;
}

// ----------------------------------------------------------------------------
// 3. DASHBOARD OVERVIEW AGGREGATE
// ----------------------------------------------------------------------------

export interface TimeSeriesPoint {
  timestamp: string;
  label: string;
  value: number;
  currency?: string;
}

export interface FleetStatusBreakdown {
  total: number;
  available: number;
  onRent: number;
  reserved: number;
  maintenance: number;
  blocked: number;
  utilizationRate: number;
}

export interface CrmFunnelSummary {
  newLeads: number;
  qualifiedLeads: number;
  quotesSent: number;
  quotesAccepted: number;
  conversionRate: number;
  pipelineValue: number;
}

export interface FinancialSummaryKpis {
  currency: string;
  grossInvoiced: number;
  netRevenue: number;
  postedRevenue: number;
  cashReceipts: number;
  outstandingReceivables: number;
  trialBalanceReconciled: boolean;
}

export interface TenantDashboardOverviewDto {
  tenantId: string;
  period: { from: string; to: string; preset?: PeriodPreset };
  tenantTimezone: string;
  currency: string;
  dataAsOf: string;
  headlineKpis: {
    utilizationRate: MetricValueResult;
    activeRentals: MetricValueResult;
    cashCollections: MetricValueResult;
    postedRevenue: MetricValueResult;
    availableVehicles: MetricValueResult;
    urgentComplianceCount: MetricValueResult;
    pendingHandovers: MetricValueResult;
    newLeads: MetricValueResult;
  };
  fleetStatus: FleetStatusBreakdown;
  crmFunnel: CrmFunnelSummary;
  financialSummary: FinancialSummaryKpis;
  revenueChart: TimeSeriesPoint[];
  utilizationChart: TimeSeriesPoint[];
  recentActivity: Array<{
    id: string;
    type: "BOOKING" | "RENTAL" | "PAYMENT" | "LEAD" | "COMPLIANCE";
    title: string;
    timestamp: string;
    status: string;
    amount?: number;
    currency?: string;
  }>;
}

// ----------------------------------------------------------------------------
// 4. REPORT DEFINITIONS & REPORT QUERY ENGINE
// ----------------------------------------------------------------------------

export type ReportKey =
  | "REPORT_FLEET_PERFORMANCE"
  | "REPORT_VEHICLE_UTILIZATION"
  | "REPORT_BOOKING_LIFECYCLE"
  | "REPORT_RENTAL_OPERATIONS"
  | "REPORT_REVENUE_BILLING"
  | "REPORT_CASH_RECEIPTS"
  | "REPORT_GENERAL_LEDGER"
  | "REPORT_TRIAL_BALANCE"
  | "REPORT_RECEIVABLES_AGING"
  | "REPORT_VEHICLE_PROFITABILITY"
  | "REPORT_OWNER_SETTLEMENTS"
  | "REPORT_MAINTENANCE_COSTS"
  | "REPORT_COMPLIANCE_STATUS"
  | "REPORT_CRM_FUNNEL";

export type ReportCategory =
  | "FLEET"
  | "BOOKINGS"
  | "RENTALS"
  | "FINANCE"
  | "CRM"
  | "OPERATIONS";

export interface ReportColumnDefinition {
  key: string;
  header: string;
  type: "string" | "number" | "currency" | "percentage" | "date" | "boolean" | "badge";
  sortable?: boolean;
  align?: "left" | "center" | "right";
  currencyField?: string;
}

export interface ReportDefinition {
  key: ReportKey;
  title: string;
  description: string;
  category: ReportCategory;
  sourceDomain: MetricSourceDomain;
  allowedFilters: string[];
  allowedGroupings: string[];
  allowedSorts: string[];
  columns: ReportColumnDefinition[];
  permissionsRequired: string[];
  supportedExportFormats: Array<"CSV" | "XLSX" | "PDF">;
  freshnessMode: MetricFreshnessMode;
  version: number;
}

export interface ReportQueryParams {
  from?: string;
  to?: string;
  preset?: PeriodPreset;
  currency?: string;
  groupBy?: string;
  filters?: Record<string, unknown>;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface ReportQueryResultDto {
  reportKey: ReportKey;
  title: string;
  filterSnapshot: ReportQueryParams;
  period: { from: string; to: string };
  currency?: string;
  dataAsOf: string;
  summary: Record<string, unknown>;
  columns: ReportColumnDefinition[];
  rows: Array<Record<string, unknown>>;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  reconciliation?: {
    status: "RECONCILED" | "DISCREPANCY" | "NOT_APPLICABLE";
    details?: string;
  };
}

// ----------------------------------------------------------------------------
// 5. ASYNC EXPORT & REPORT EXECUTION
// ----------------------------------------------------------------------------

export type ReportExportFormat = "CSV" | "XLSX" | "PDF";
export type ReportFormat = ReportExportFormat;

export type ReportExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "EXPIRED";

export interface ReportExecution {
  id: string;
  tenantId: string;
  reportKey: ReportKey;
  reportVersion: number;
  format: ReportExportFormat;
  filtersSnapshot: ReportQueryParams;
  requestedBy: string;
  status: ReportExecutionStatus;
  requestedAt: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  dataAsOf?: string;
  fileId?: string;
  downloadUrl?: string;
  rowCount?: number;
  fileSize?: number;
  error?: string;
  rawContent?: string;
  mimeType?: string;
}

// ----------------------------------------------------------------------------
// 6. SCHEDULED & SAVED REPORTS
// ----------------------------------------------------------------------------

export type ReportScheduleFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM_CRON";
export type ScheduleFrequency = ReportScheduleFrequency;

export interface ReportSchedule {
  id: string;
  tenantId: string;
  reportKey: ReportKey;
  format: ReportExportFormat;
  frequency: ReportScheduleFrequency;
  cronExpression?: string;
  recipients: string[];
  filtersSnapshot: ReportQueryParams;
  timezone: string;
  enabled: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedReport {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  reportKey: ReportKey;
  filters: ReportQueryParams;
  isShared: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// 7. REPORTING READ MODELS & PROJECTIONS
// ----------------------------------------------------------------------------

export interface ReportingDailySnapshot {
  id: string;
  tenantId: string;
  date: string; // YYYY-MM-DD
  currency: string;
  // Fleet
  totalVehicles: number;
  activeVehicles: number;
  availableVehicles: number;
  onRentVehicles: number;
  maintenanceVehicles: number;
  utilizationRate: number;
  // Bookings
  bookingCreatedCount: number;
  bookingConfirmedCount: number;
  bookingCancelledCount: number;
  bookingContractualValue: number;
  // Rentals
  rentalsStarted: number;
  rentalsCompleted: number;
  rentalDaysBilled: number;
  // Finance (Authoritative)
  grossInvoiced: number;
  taxInvoiced: number;
  discountTotal: number;
  netInvoicedRevenue: number;
  postedRevenue: number;
  cashReceipts: number;
  totalExpenses: number;
  // CRM
  leadsCreated: number;
  leadsConverted: number;
  quotesCreated: number;
  quotesAccepted: number;
  // Metadata
  lastAppliedEventId?: string;
  updatedAt: string;
}

export interface FinancialReconciliationAuditResult {
  tenantId: string;
  auditedAt: string;
  generalLedger: {
    status: "BALANCED" | "OUT_OF_BALANCE";
    totalDebits: number;
    totalCredits: number;
    discrepancyAmount: number;
  };
  cashCollections: {
    status: "RECONCILED" | "DISCREPANCY";
    verifiedPaymentsSum: number;
    cashReceiptsMetricValue: number;
    difference: number;
  };
  receivablesAging: {
    status: "RECONCILED" | "DISCREPANCY";
    unpaidInvoicesSum: number;
    agingBucketsSum: number;
    difference: number;
  };
  ownerLiabilities: {
    status: "RECONCILED" | "DISCREPANCY";
    approvedSettlementsSum: number;
    ledgerLiabilitySum: number;
    difference: number;
  };
  overallStatus: "CLEAN" | "DISCREPANCY_DETECTED";
}
