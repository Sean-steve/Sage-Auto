import { apiClient } from "../../lib/api-client";
import type { AccessPortal } from "../../lib/access-context";

/**
 * Platform control-plane transport. No local fallback, demo snapshots or
 * tenant-app state is allowed as a source of platform financial truth.
 */
export function platformCan(portal: AccessPortal, permission: string): boolean {
  return portal.kind === "platform" &&
    (portal.permissions.includes("*") || portal.permissions.includes(permission));
}

export async function platformRequest(path: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET", body?: unknown): Promise<any> {
  if (!path.startsWith("/platform/") && !path.startsWith("/access/")) {
    throw new Error("A platform workspace cannot call a tenant business endpoint.");
  }
  const response = await apiClient.request(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.error) throw new Error(response.error.message || "The server rejected this request.");
  // Most platform APIs return {data}, while analytics APIs return an unwrapped DTO.
  return response.data === undefined ? response : response.data;
}

export type PlatformDataKey = "tenants" | "subscriptions" | "plans" | "invoices" |
  "payments" | "analytics" | "movements" | "cohorts" | "billingHealth" |
  "features" | "queues" | "deadLetters" | "audit" | "config";

export type PlatformDataset = {
  values: Partial<Record<PlatformDataKey, any>>;
  errors: Partial<Record<PlatformDataKey, string>>;
};

type Resource = { key: PlatformDataKey; path: string; permission: string };

const resources: Record<string, Resource[]> = {
  overview: [
    { key: "tenants", path: "/platform/tenants", permission: "platform.tenant.read" },
    { key: "subscriptions", path: "/platform/subscriptions", permission: "platform.subscription.read" },
    { key: "analytics", path: "/platform/analytics/overview", permission: "platform.analytics.read" },
  ],
  companies: [
    { key: "tenants", path: "/platform/tenants", permission: "platform.tenant.read" },
    { key: "plans", path: "/platform/plans", permission: "platform.plan.read" },
  ],
  plans: [
    { key: "plans", path: "/platform/plans", permission: "platform.plan.read" },
    { key: "subscriptions", path: "/platform/subscriptions", permission: "platform.subscription.read" },
  ],
  platformBilling: [
    { key: "invoices", path: "/platform/billing/invoices", permission: "platform.billing.read" },
    { key: "payments", path: "/platform/billing/payments", permission: "platform.billing.read" },
  ],
  platformAnalytics: [
    { key: "analytics", path: "/platform/analytics/overview", permission: "platform.analytics.read" },
    { key: "movements", path: "/platform/analytics/mrr-movements", permission: "platform.analytics.read" },
    { key: "cohorts", path: "/platform/analytics/cohorts", permission: "platform.analytics.read" },
    { key: "billingHealth", path: "/platform/analytics/billing-health", permission: "platform.analytics.read" },
  ],
  platformEntitlements: [
    { key: "features", path: "/platform/features", permission: "platform.feature.read" },
    { key: "plans", path: "/platform/plans", permission: "platform.plan.read" },
  ],
  platformJobs: [
    { key: "queues", path: "/platform/operations/jobs/queues", permission: "platform.job.read" },
    { key: "deadLetters", path: "/platform/operations/jobs/dlq", permission: "platform.job.read" },
  ],
  platformAudit: [
    { key: "audit", path: "/platform/operations/audit", permission: "platform.audit.read" },
  ],
  platformSettings: [
    { key: "config", path: "/platform/operations/config", permission: "platform.config.manage" },
  ],
};

export async function loadPlatformPanel(section: string, portal: AccessPortal): Promise<PlatformDataset> {
  const selected = (resources[section] || []).filter(resource => platformCan(portal, resource.permission));
  const settled = await Promise.allSettled(selected.map(resource => platformRequest(resource.path)));
  const result: PlatformDataset = { values: {}, errors: {} };
  settled.forEach((response, index) => {
    const key = selected[index].key;
    if (response.status === "fulfilled") result.values[key] = response.value;
    else result.errors[key] = response.reason instanceof Error ? response.reason.message : "Unable to load verified records.";
  });
  return result;
}

export function platformRows(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

export function displayValue(value: any): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return Array.isArray(value) ? value.map(displayValue).join(", ") : "View details";
  return String(value);
}

export function displayMoney(value: any, currency?: string): string {
  if (typeof value !== "number" || !Number.isFinite(value) || !currency) return "Not available";
  return new Intl.NumberFormat("en-KE", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

export function flattenMetrics(data: any): Array<{ label: string; value: string }> {
  if (!data || typeof data !== "object") return [];
  const pairs: Array<{ label: string; value: string }> = [];
  for (const [key, raw] of Object.entries(data)) {
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "number" || typeof raw === "string" || typeof raw === "boolean") {
      pairs.push({ label: key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " "), value: displayValue(raw) });
    }
  }
  return pairs;
}
