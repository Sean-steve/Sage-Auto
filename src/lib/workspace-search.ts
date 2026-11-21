import { apiClient } from "./api-client";
import { permits, type AccessPortal } from "./access-context";

export type WorkspaceSearchKind = "MODULE" | "VEHICLE" | "CUSTOMER" | "DRIVER" | "BOOKING" | "RENTAL";
type SearchableKind = Exclude<WorkspaceSearchKind, "MODULE">;
export type WorkspaceSearchItem = {
  kind: WorkspaceSearchKind;
  id: string;
  section: string;
  title: string;
  subtitle: string;
};
export type WorkspaceSearchResponse = { items: WorkspaceSearchItem[]; unavailable: string[] };

// Search through each domain's existing server-filtered, tenant-guarded and
// permission-guarded list endpoint. Never download a complete tenant dataset
// or use the legacy browser store as a search authority.
type SearchApi = Pick<typeof apiClient, "fleet" | "customers" | "drivers" | "bookings" | "rentals">;

function safe(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function searchSources(portal: AccessPortal): SearchableKind[] {
  const allowed = (section: string, permission: string) =>
    portal.kind === "tenant" && !!portal.tenantId &&
    portal.sections.some(item => item.id === section) && permits(portal, permission);
  return [
    ...(allowed("fleet", "vehicle.read") ? ["VEHICLE" as const] : []),
    ...(allowed("customers", "customer.read") ? ["CUSTOMER" as const] : []),
    ...(allowed("customers", "driver.read") ? ["DRIVER" as const] : []),
    ...(allowed("bookings", "booking.read") ? ["BOOKING" as const] : []),
    ...(allowed("rentals", "rental.read") ? ["RENTAL" as const] : []),
  ];
}

export async function searchWorkspaceRecords(
  portal: AccessPortal,
  query: string,
  client: SearchApi = apiClient,
): Promise<WorkspaceSearchResponse> {
  const q = query.trim();
  if (q.length < 2 || q.length > 100) return { items: [], unavailable: [] };
  const sources = searchSources(portal);
  const options = { search: q, limit: 6 };
  const requests: Record<Exclude<WorkspaceSearchKind, "MODULE">, () => Promise<any>> = {
    VEHICLE: () => client.fleet.listVehicles({ ...options, page: 1 }),
    CUSTOMER: () => client.customers.listCustomers({ ...options, page: 1 }),
    DRIVER: () => client.drivers.listDrivers({ ...options, page: 1 }),
    BOOKING: () => client.bookings.listBookings({ ...options, offset: 0 }),
    RENTAL: () => client.rentals.listRentals({ ...options, offset: 0 }),
  };
  const results = await Promise.all(sources.map(async kind => {
    try {
      const response = await requests[kind]();
      if (response.error || !Array.isArray(response.data)) throw new Error("Search unavailable");
      return { kind, rows: response.data as any[] };
    } catch {
      return { kind, rows: null };
    }
  }));
  const items: WorkspaceSearchItem[] = [];
  const unavailable: string[] = [];
  for (const result of results) {
    if (!result.rows) {
      unavailable.push(result.kind.toLowerCase());
      continue;
    }
    for (const record of result.rows.slice(0, 6)) {
      if (!safe(record.id)) continue;
      const kind = result.kind;
      const section = kind === "VEHICLE" ? "fleet" :
        kind === "CUSTOMER" || kind === "DRIVER" ? "customers" :
        kind === "BOOKING" ? "bookings" : "rentals";
      const title = kind === "VEHICLE" ? safe(record.registrationPlate) :
        kind === "CUSTOMER" || kind === "DRIVER" ? safe(record.fullName) :
        kind === "BOOKING" ? safe(record.bookingNumber) : safe(record.rentalNumber);
      if (!title) continue;
      const subtitle = kind === "VEHICLE"
        ? [safe(record.make), safe(record.model)].filter(Boolean).join(" ")
        : kind === "CUSTOMER" ? safe(record.customerNumber)
        : kind === "DRIVER" ? safe(record.driverNumber)
        : kind === "BOOKING" ? safe(record.status).replaceAll("_", " ")
        : safe(record.state).replaceAll("_", " ");
      items.push({ kind, section, id: record.id, title, subtitle });
    }
  }
  return { items, unavailable };
}
