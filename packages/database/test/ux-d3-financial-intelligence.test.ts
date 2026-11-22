import { strict as assert } from "node:assert";
import {
  buildAuthoritativePeriodSeries, periodDayKeys, localDayKey,
} from "../../../apps/api/src/modules/analytics/domain/dashboard-intelligence";
import { TemporalWindowResolver } from "../../../apps/api/src/modules/analytics/domain/temporal-window";
import {
  FULL_EXECUTIVE_DASHBOARD_RIGHTS, hasAnalyticRights,
  requiredPermissionsForMetric, requireAnalyticsPermissions,
} from "../../../apps/api/src/modules/analytics/presentation/analytics-access";

async function main() {
  const period = TemporalWindowResolver.resolve({
    preset: "CUSTOM", from: "2026-11-20", to: "2026-11-21",
    timezone: "Africa/Nairobi",
  });
  assert.equal(period.from, "2026-11-19T21:00:00.000Z");
  assert.equal(period.to, "2026-11-21T21:00:00.000Z");
  assert.deepEqual(periodDayKeys(period.from, period.to, "Africa/Nairobi"), [
    "2026-11-20", "2026-11-21",
  ]);
  assert.equal(localDayKey("2026-11-19T22:15:00Z", "Africa/Nairobi"), "2026-11-20");
  assert.equal(period.previousPeriod.to, period.from);
  assert.equal(
    new Date(period.previousPeriod.to).getTime() - new Date(period.previousPeriod.from).getTime(),
    new Date(period.to).getTime() - new Date(period.from).getTime()
  );
  assert.equal(TemporalWindowResolver.calculateChangePercentage(100, 0), null);
  assert.throws(() => periodDayKeys(period.to, period.from, "Africa/Nairobi"), /forward interval/);

  const header = (id: string, tenantId: string, status: string, postedAt: string | undefined, currency = "KES") =>
    ({ id, tenantId, currency, status, postedAt, transactionDate: "2026-11-20" } as any);
  const entry = (transactionId: string, amount: string, direction: string, accountCode = "4000", tenantId = "tenant-A") =>
    ({ transactionId, tenantId, direction, amount, accountCode } as any);
  const payment = (id: string, amount: string, verifiedAt: string | undefined, status = "VERIFIED", tenantId = "tenant-A", direction = "INBOUND") =>
    ({ id, tenantId, amount, verifiedAt, currency: "KES", status, direction } as any);
  const invoice = (id: string, total: string, issueDate: string, status: string, tenantId = "tenant-A") =>
    ({ id, tenantId, total, issueDate, currency: "KES", status } as any);
  const booking = (id: string, createdAt: string, tenantId = "tenant-A") =>
    ({ id, tenantId, createdAt } as any);

  const chart = buildAuthoritativePeriodSeries({
    tenantId: "tenant-A", from: period.from, to: period.to,
    timezone: "Africa/Nairobi", currency: "KES",
    journals: [
      header("j-post", "tenant-A", "POSTED", "2026-11-20T10:00:00Z"),
      header("j-reversed", "tenant-A", "REVERSED", "2026-11-20T11:00:00Z"),
      header("j-reversal", "tenant-A", "POSTED", "2026-11-21T11:00:00Z"),
      header("j-draft", "tenant-A", "DRAFT", undefined),
      header("j-other", "tenant-B", "POSTED", "2026-11-20T10:00:00Z"),
      header("j-usd", "tenant-A", "POSTED", "2026-11-20T10:00:00Z", "USD"),
    ],
    entries: [
      entry("j-post", "1000", "CREDIT"),
      entry("j-post", "200", "DEBIT"),
      entry("j-reversed", "300", "CREDIT"),
      entry("j-reversal", "300", "DEBIT"),
      entry("j-draft", "9000", "CREDIT"),
      entry("j-other", "700", "CREDIT", "4000", "tenant-B"),
      entry("j-usd", "400", "CREDIT"),
      entry("j-post", "999", "CREDIT", "1100"),
    ],
    payments: [
      payment("p1", "500", "2026-11-20T10:00:00Z"),
      payment("p2", "200", "2026-11-21T10:00:00Z", "PARTIALLY_ALLOCATED"),
      payment("p3", "600", undefined, "PENDING_VERIFICATION"),
      payment("p4", "700", "2026-11-20T10:00:00Z", "VERIFIED", "tenant-B"),
      payment("p5", "400", "2026-11-20T10:00:00Z", "VERIFIED", "tenant-A", "OUTBOUND"),
    ],
    invoices: [
      invoice("i1", "1500", "2026-11-20", "ISSUED"),
      invoice("i2", "9999", "2026-11-20", "DRAFT"),
      invoice("i3", "9000", "2026-11-20", "ISSUED", "tenant-B"),
    ],
    bookings: [
      booking("b1", "2026-11-20T11:00:00Z"),
      booking("b2", "2026-11-21T11:00:00Z"),
      booking("b3", "2026-11-20T11:00:00Z", "tenant-B"),
    ],
  });

  assert.deepEqual(chart.postedRevenue.map(row => row.value), [1100, -300]);
  assert.equal(chart.postedRevenueTotal, 800);
  assert.deepEqual(chart.cashCollections.map(row => row.value), [500, 200]);
  assert.equal(chart.verifiedReceiptsTotal, 700);
  assert.deepEqual(chart.grossInvoiced.map(row => row.value), [1500, 0]);
  assert.deepEqual(chart.bookingVolume.map(row => row.value), [1, 1]);
  assert.equal(chart.incompletePostedJournals, 0);

  const ownerPermissions = [...FULL_EXECUTIVE_DASHBOARD_RIGHTS];
  assert.equal(hasAnalyticRights(ownerPermissions, FULL_EXECUTIVE_DASHBOARD_RIGHTS), true);
  assert.equal(hasAnalyticRights(["analytics.read", "vehicle.read"], FULL_EXECUTIVE_DASHBOARD_RIGHTS), false);
  assert.deepEqual(requiredPermissionsForMetric("FINANCE_POSTED_REVENUE"), ["analytics.read", "ledger.read"]);
  assert.deepEqual(requiredPermissionsForMetric("FINANCE_CASH_RECEIPTS"), ["analytics.read", "payment.read"]);
  assert.deepEqual(requiredPermissionsForMetric("FLEET_UTILIZATION_RATE"), ["analytics.read", "vehicle.read"]);
  assert.throws(() => requireAnalyticsPermissions({
    auth: {userId:"user-A"},
    tenantContext: {tenantId:"tenant-A", permissions:["analytics.read", "vehicle.read"]},
  } as any, FULL_EXECUTIVE_DASHBOARD_RIGHTS), /Insufficient permissions/);
  requireAnalyticsPermissions({
    auth: {userId:"user-A"},
    tenantContext: {tenantId:"tenant-A", permissions:ownerPermissions},
  } as any, FULL_EXECUTIVE_DASHBOARD_RIGHTS);

  console.log("UX-D3 PASS: tenant-local windows, posted ledger provenance, receipt dates, invoice separation, permissions, isolation");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
