import type { MetricKey, ReportKey } from "@carhire/types";
import type { Request } from "express";

export function hasAnalyticRights(permissions: readonly string[], required: readonly string[]): boolean {
  return required.every(permission => permissions.includes("*") || permissions.includes(permission));
}

export function requiredPermissionsForMetric(key: MetricKey): string[] {
  const rights = ["analytics.read"];
  if (key === "FINANCE_POSTED_REVENUE" || key.startsWith("FINANCE_TRIAL_BALANCE_")) {
    return [...rights, "ledger.read"];
  }
  if (key === "FINANCE_CASH_RECEIPTS") return [...rights, "payment.read"];
  if (key === "FINANCE_TOTAL_EXPENSES") return [...rights, "expense.read"];
  if (key === "FINANCE_REFUNDS_COMPLETED") return [...rights, "refund.read"];
  if (key === "FINANCE_DEPOSITS_HELD") return [...rights, "deposit.read"];
  if (key.startsWith("FINANCE_")) return [...rights, "invoice.read"];
  if (key.startsWith("FLEET_")) return [...rights, "vehicle.read"];
  if (key.startsWith("BOOKING_")) return [...rights, "booking.read"];
  if (key.startsWith("RENTAL_") || key.startsWith("HANDOVER_")) return [...rights, "rental.read"];
  if (key.startsWith("VEHICLE_")) return [...rights, "vehicle.read", "invoice.read"];
  if (key.startsWith("OWNER_")) return [...rights, "settlement.read"];
  if (key.startsWith("MAINTENANCE_")) return [...rights, "maintenance.read"];
  if (key.startsWith("COMPLIANCE_")) return [...rights, "compliance.read"];
  if (key.startsWith("CUSTOMER_")) return [...rights, "customer.read"];
  if (key.startsWith("CORPORATE_")) return [...rights, "corporate_account.read"];
  if (key.startsWith("CRM_QUOTE_")) return [...rights, "crm.quote.read"];
  if (key.startsWith("CRM_")) return [...rights, "crm.lead.read"];
  // New unclassified metrics must be explicitly mapped, never public by default.
  return [...rights, "__unmapped_metric__"];
}

export const FULL_EXECUTIVE_DASHBOARD_RIGHTS = [
  "analytics.read", "vehicle.read", "booking.read", "rental.read",
  "invoice.read", "payment.read", "ledger.read", "crm.lead.read", "crm.quote.read",
] as const;

export function requireAnalyticsPermissions(req: Request, required: readonly string[]): void {
  if (!req.auth?.userId || !req.tenantContext?.tenantId) {
    throw Object.assign(new Error("Verified company analytics context required"), { statusCode: 403 });
  }
  if (!hasAnalyticRights(req.tenantContext.permissions || [], required)) {
    throw Object.assign(new Error("Insufficient permissions for these analytics fields"), { statusCode: 403 });
  }
}


/** Metric-registry labels such as "reports:view" are descriptive legacy codes,
 * not enforceable tenant permissions. Every report is mapped explicitly. */
export function requiredPermissionsForReport(key: ReportKey): string[] {
  const rights = ["report.read"];
  switch (key) {
    case "REPORT_FLEET_PERFORMANCE":
    case "REPORT_VEHICLE_UTILIZATION":
      return [...rights, "vehicle.read", "invoice.read"];
    case "REPORT_BOOKING_LIFECYCLE": return [...rights, "booking.read"];
    case "REPORT_RENTAL_OPERATIONS": return [...rights, "rental.read"];
    case "REPORT_REVENUE_BILLING":
    case "REPORT_RECEIVABLES_AGING": return [...rights, "invoice.read"];
    case "REPORT_CASH_RECEIPTS": return [...rights, "payment.read"];
    case "REPORT_GENERAL_LEDGER":
    case "REPORT_TRIAL_BALANCE": return [...rights, "ledger.read"];
    case "REPORT_VEHICLE_PROFITABILITY":
      return [...rights, "vehicle.read", "invoice.read", "expense.read", "settlement.read"];
    case "REPORT_OWNER_SETTLEMENTS": return [...rights, "settlement.read"];
    case "REPORT_MAINTENANCE_COSTS": return [...rights, "maintenance.read", "expense.read"];
    case "REPORT_COMPLIANCE_STATUS": return [...rights, "compliance.read"];
    case "REPORT_CRM_FUNNEL": return [...rights, "crm.lead.read", "crm.quote.read"];
    default: return [...rights, "__unmapped_report__"];
  }
}
