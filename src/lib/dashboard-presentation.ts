import type { PeriodPreset, TimeSeriesPoint, TenantDashboardOverviewDto } from "@carhire/types";
import type { AccessPortal } from "./access-context";

export const EXECUTIVE_DASHBOARD_PERMISSIONS = [
  "analytics.read", "vehicle.read", "booking.read", "rental.read",
  "invoice.read", "payment.read", "ledger.read", "crm.lead.read", "crm.quote.read",
] as const;

export type FinancialSeriesKey = "postedRevenue" | "cashCollections" | "grossInvoiced";
export type BucketGranularity = "day" | "week" | "month";
export type ChartPoint = { key: string; label: string; value: number };

export const FINANCE_SERIES: Record<FinancialSeriesKey, {
  title: string; summary: string; color: string; source: string;
}> = {
  postedRevenue: {
    title: "Posted revenue", color: "#0f766e",
    summary: "Revenue credited to posted general ledger journals.",
    source: "Posted journal transactions · posting date",
  },
  cashCollections: {
    title: "Cash received", color: "#2563eb",
    summary: "Gross verified incoming payments; deposits may be refundable.",
    source: "Verified inbound payment records · verification date",
  },
  grossInvoiced: {
    title: "Gross invoiced", color: "#e09a25",
    summary: "Issued invoice totals; not necessarily paid or earned.",
    source: "Issued customer invoices · issue date",
  },
};

export const PERIOD_OPTIONS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "TODAY", label: "Today" },
  { value: "THIS_WEEK", label: "This week" },
  { value: "THIS_MONTH", label: "This month" },
  { value: "LAST_MONTH", label: "Last month" },
  { value: "THIS_QUARTER", label: "This quarter" },
  { value: "THIS_YEAR", label: "This year" },
  { value: "CUSTOM", label: "Custom range" },
];

export function hasDashboardRights(portal: AccessPortal): boolean {
  if (portal.kind !== "tenant" || !portal.tenantId) return false;
  const permissions = new Set(portal.permissions);
  return EXECUTIVE_DASHBOARD_PERMISSIONS.every(key => permissions.has("*") || permissions.has(key));
}

export function canRead(portal: AccessPortal, key: string): boolean {
  return portal.permissions.includes("*") || portal.permissions.includes(key);
}

export function currencyText(value: number | null | undefined, currency: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "Unavailable";
  try {
    return new Intl.NumberFormat("en-KE", {
      style: "currency", currency, maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return value.toLocaleString("en-KE", { maximumFractionDigits: 0 }) + " " + currency;
  }
}

export function compactNumber(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "Unavailable" : new Intl.NumberFormat("en-KE", { maximumFractionDigits: 1 }).format(value);
}

export function percentage(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "Unavailable"
    : new Intl.NumberFormat("en-KE", { maximumFractionDigits: 1 }).format(value) + "%";
}

function weekStart(isoDay: string): string {
  const day = new Date(isoDay + "T00:00:00Z");
  const mondayOffset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - mondayOffset);
  return day.toISOString().slice(0, 10);
}

export function granularityFor(points: TimeSeriesPoint[], preferred: BucketGranularity | "auto" = "auto"): BucketGranularity {
  if (preferred !== "auto") return preferred;
  return points.length > 130 ? "month" : points.length > 36 ? "week" : "day";
}

/**
 * D3 supplies tenant-local YYYY-MM-DD labels. Group these date keys rather
 * than reparsing UTC-midnight timestamps as the user's browser timezone.
 * All datasets must first be filtered to one currency by the API.
 */
export function bucketSeries(points: TimeSeriesPoint[], preferred: BucketGranularity | "auto" = "auto"): ChartPoint[] {
  const resolution = granularityFor(points, preferred);
  const buckets = new Map<string, number>();
  for (const point of points) {
    const localDate = /^\d{4}-\d{2}-\d{2}$/.test(point.label)
      ? point.label : point.timestamp.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) continue;
    if (!Number.isFinite(point.value)) throw new Error("Analytics contains an invalid value");
    const key = resolution === "month" ? localDate.slice(0, 7)
      : resolution === "week" ? weekStart(localDate) : localDate;
    buckets.set(key, (buckets.get(key) || 0) + point.value);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => {
    const label = resolution === "month"
      ? new Date(key + "-01T00:00:00Z").toLocaleDateString("en-KE", { month: "short", year: "numeric", timeZone: "UTC" })
      : new Date(key + "T00:00:00Z").toLocaleDateString("en-KE", {
        month: "short", day: "numeric", timeZone: "UTC",
      });
    return { key, label, value: Math.round(value * 100) / 100 };
  });
}

export function bookingsForPeriod(overview: TenantDashboardOverviewDto): number | null {
  const available = overview.chartAvailability?.bookingVolume;
  if (available === "UNAVAILABLE" || !overview.bookingVolumeChart) return null;
  return overview.bookingVolumeChart.reduce((sum, point) => sum + point.value, 0);
}

export function financialSeriesFor(
  overview: TenantDashboardOverviewDto, key: FinancialSeriesKey,
): TimeSeriesPoint[] | null {
  const availability = overview.chartAvailability?.[key];
  if (availability !== "VERIFIED") return null;
  return key === "postedRevenue" ? overview.revenueChart
    : key === "cashCollections" ? overview.cashCollectionsChart || null
    : overview.grossInvoicedChart || null;
}

export function allFinanceSeriesAvailable(overview: TenantDashboardOverviewDto): boolean {
  return (["postedRevenue", "cashCollections", "grossInvoiced"] as const)
    .every(key => financialSeriesFor(overview, key) !== null);
}

export function dashboardValidForTenant(
  overview: TenantDashboardOverviewDto | undefined,
  portal: AccessPortal,
): overview is TenantDashboardOverviewDto {
  return !!overview && !!portal.tenantId && overview.tenantId === portal.tenantId &&
    /^[A-Z]{3}$/.test(overview.currency) &&
    !!overview.financialSummary && !!overview.headlineKpis &&
    !!overview.fleetStatus && !!overview.period;
}
