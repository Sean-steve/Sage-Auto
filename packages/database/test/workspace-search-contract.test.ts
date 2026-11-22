import assert from "node:assert/strict";

// The shared api-client initializes browser storage when imported. Give the
// isolated Node contract test a minimal browser-compatible storage adapter.
const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => { values.clear(); },
  },
});

async function run() {
  const { searchSources, searchWorkspaceRecords } = await import("../../../src/lib/workspace-search");
  const portal: any = {
    id: "tenant-a",
    tenantId: "tenant-a",
    kind: "tenant",
    roles: ["COMPANY_OWNER"],
    permissions: ["vehicle.read", "customer.read", "driver.read", "booking.read", "rental.read", "invoice.read", "payment.read"],
    sections: ["fleet", "customers", "bookings", "rentals", "finance"].map(id => ({ id, label: id })),
  };
  const calls: string[] = [];
  const client: any = {
    fleet: { listVehicles: async (query: any) => {
      calls.push("fleet:" + query.search);
      assert.equal(query.limit, 6);
      return { data: [
        { id: "vehicle-a", tenantId: "tenant-a", registrationPlate: "KDA 123A", make: "Toyota", model: "Vitz", vin: "private-vin" },
        { id: "vehicle-b", tenantId: "tenant-b", registrationPlate: "KBB 999B", make: "Ford", model: "Ranger" },
      ] };
    } },
    customers: { listCustomers: async (query: any) => {
      calls.push("customer:" + query.search);
      return { data: [{ id: "customer-a", tenantId: "tenant-a", fullName: "Mumbi W", customerNumber: "CUS-001", idOrPassportNumber: "SECRET" }] };
    } },
    drivers: { listDrivers: async (query: any) => {
      calls.push("driver:" + query.search);
      return { data: [{ id: "driver-a", tenantId: "tenant-a", fullName: "Jane D", driverNumber: "DRV-001", licenseNumber: "SECRET" }] };
    } },
    bookings: { listBookings: async (query: any) => {
      calls.push("booking:" + query.search);
      return { data: [{ id: "booking-a", tenantId: "tenant-a", bookingNumber: "BK-100", status: "CONFIRMED" }] };
    } },
    rentals: { listRentals: async (query: any) => {
      calls.push("rental:" + query.search);
      return { data: [{ id: "rental-a", tenantId: "tenant-a", rentalNumber: "RNT-001", state: "ACTIVE_ON_ROAD" }] };
    } },
    finance: { getInvoices: async (query: any) => {
      calls.push("invoice:" + query.search);
      return { data: [{ id: "invoice-a", tenantId: "tenant-a", invoiceNumber: "INV-001", status: "ISSUED", billingSnapshot: { customerName: "Mumbi W" } }] };
    } },
    payments: { listPayments: async (query: any) => {
      calls.push("payment:" + query.search);
      return { data: [{ id: "payment-a", tenantId: "tenant-a", paymentNumber: "PMT-001", status: "VERIFIED", payerReference: "PRIVATE" }] };
    } },
  };

  assert.deepEqual(searchSources(portal), ["VEHICLE", "CUSTOMER", "DRIVER", "BOOKING", "RENTAL", "INVOICE", "PAYMENT"]);
  const full = await searchWorkspaceRecords(portal, "KDA", client);
  assert.equal(full.items.length, 7, "Only one in-tenant hit per searched domain is visible");
  assert.equal(full.unavailable.length, 0);
  assert.equal(full.items.find((hit: any) => hit.kind === "VEHICLE")?.title, "KDA 123A");
  assert.equal(full.items.find((hit: any) => hit.kind === "INVOICE")?.section, "finance");
  assert.equal(full.items.find((hit: any) => hit.kind === "PAYMENT")?.section, "finance");
  assert.equal(full.items.find((hit: any) => hit.kind === "CUSTOMER")?.section, "customers");
  assert.equal(full.items.some((hit: any) => hit.id === "vehicle-b"), false, "Foreign tenant vehicle must never surface");
  assert.equal(JSON.stringify(full).includes("SECRET"), false, "Search results must exclude raw identity data");
  assert.equal(JSON.stringify(full).includes("PRIVATE"), false, "Search results must exclude raw payment PII");
  assert.equal(calls.length, 7);

  // Account with only operational access: no request goes to finance or customers.
  calls.length = 0;
  const limited = { ...portal, permissions: ["vehicle.read", "booking.read"], sections: portal.sections };
  const filtered = await searchWorkspaceRecords(limited, "BK-", client);
  assert.deepEqual(filtered.items.map((hit: any) => hit.kind), ["VEHICLE", "BOOKING"]);
  assert.deepEqual(calls, ["fleet:BK-", "booking:BK-"]);

  calls.length = 0;
  const short = await searchWorkspaceRecords(portal, "B", client);
  assert.deepEqual(short.items, []);
  assert.equal(calls.length, 0, "Short search must not query records");

  calls.length = 0;
  const outsider = { ...portal, kind: "renter" };
  assert.deepEqual(searchSources(outsider), [], "Renter context cannot query company search");
  assert.deepEqual((await searchWorkspaceRecords(outsider, "BK-", client)).items, []);
  assert.equal(calls.length, 0);

  const withFailure: any = {
    ...client,
    bookings: { listBookings: async () => ({ error: { message: "unavailable" } }) },
  };
  const partial = await searchWorkspaceRecords(limited, "test", withFailure);
  assert.deepEqual(partial.unavailable, ["booking"], "Errors must be distinguishable from empty matches");
  assert.equal(partial.items.some((hit: any) => hit.kind === "VEHICLE"), true);

  console.log("UX-D1 search contract PASS — multi-domain search, tenant isolation, role scope and partial failures");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
