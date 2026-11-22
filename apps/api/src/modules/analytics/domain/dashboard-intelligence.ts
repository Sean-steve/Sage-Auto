/**
 * UX-D3 analytics building blocks. Financial events are bucketed by their
 * authoritative dates; invoice issue dates never stand in for posted revenue.
 */
import type { JournalEntry, JournalTransaction, Payment, OperationalInvoice, TimeSeriesPoint, Booking } from "@carhire/types";

export type DashboardSeriesQuality = "VERIFIED" | "UNAVAILABLE";
export type PeriodSeries = {
  postedRevenue: TimeSeriesPoint[];
  cashCollections: TimeSeriesPoint[];
  grossInvoiced: TimeSeriesPoint[];
  bookingVolume: TimeSeriesPoint[];
  postedRevenueTotal: number;
  verifiedReceiptsTotal: number;
  grossInvoicedTotal: number;
  incompletePostedJournals: number;
};

export const VERIFIED_PAYMENT_STATES = new Set([
  "VERIFIED", "PARTIALLY_ALLOCATED", "ALLOCATED", "PARTIALLY_REFUNDED", "REFUNDED",
]);

function numberOf(value: string | number | null | undefined): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error("Invalid monetary amount in authoritative record");
  return amount;
}

export function localDayKey(value: string | Date, timezone = "Africa/Nairobi"): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid analytics event timestamp");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (key: string) => parts.find(part => part.type === key)?.value || "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

export function periodDayKeys(from: string, to: string, timezone: string, maxDays = 366): string[] {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("Analytics period must be a valid forward interval");
  }
  // The service uses [from,to). Days from the end instant are excluded.
  const first = localDayKey(new Date(start), timezone);
  const last = localDayKey(new Date(end - 1), timezone);
  const cursor = new Date(first + "T00:00:00.000Z");
  const finish = new Date(last + "T00:00:00.000Z");
  const count = Math.round((finish.getTime() - cursor.getTime()) / 86400000) + 1;
  if (count < 1 || count > maxDays) {
    throw Object.assign(new Error("Historical chart supports at most " + maxDays + " calendar days"), { statusCode: 422 });
  }
  const days: string[] = [];
  for (let i = 0; i < count; i++) {
    days.push(new Date(cursor.getTime() + i * 86400000).toISOString().slice(0, 10));
  }
  return days;
}

function seriesFor(days: string[], totals: Map<string, number>, currency?: string): TimeSeriesPoint[] {
  return days.map(day => ({
    timestamp: day + "T00:00:00.000Z",
    label: day,
    value: Math.round((totals.get(day) || 0) * 100) / 100,
    ...(currency ? { currency } : {}),
  }));
}

function sumInto(map: Map<string, number>, day: string, value: number): void {
  map.set(day, (map.get(day) || 0) + value);
}

export function buildAuthoritativePeriodSeries(args: {
  tenantId: string;
  from: string;
  to: string;
  timezone: string;
  currency: string;
  journals: JournalTransaction[];
  entries: JournalEntry[];
  payments: Payment[];
  invoices: OperationalInvoice[];
  bookings: Booking[];
}): PeriodSeries {
  const { tenantId, from, to, timezone, currency, journals, entries, payments, invoices, bookings } = args;
  const days = periodDayKeys(from, to, timezone);
  const validDays = new Set(days);
  const postedRevenue = new Map<string, number>();
  const cashCollections = new Map<string, number>();
  const grossInvoiced = new Map<string, number>();
  const bookingVolume = new Map<string, number>();
  const headers = new Map(journals.filter(tx => tx.tenantId === tenantId && tx.currency === currency)
    .map(tx => [tx.id, tx]));
  let incompletePostedJournals = 0;

  for (const entry of entries) {
    const header = headers.get(entry.transactionId);
    if (!header || entry.tenantId !== tenantId) continue;
    // Reversed original journals must remain in the original period, while
    // their separately posted reversal offsets them in the reversal period.
    if (header.status !== "POSTED" && header.status !== "REVERSED") continue;
    if (!entry.accountCode.startsWith("4")) continue;
    if (!header.postedAt) {
      incompletePostedJournals++;
      continue;
    }
    const at = new Date(header.postedAt).getTime();
    if (!Number.isFinite(at) || at < new Date(from).getTime() || at >= new Date(to).getTime()) continue;
    const day = localDayKey(header.postedAt, timezone);
    if (!validDays.has(day)) continue;
    const signed = (entry.direction === "CREDIT" ? 1 : -1) * numberOf(entry.amount);
    sumInto(postedRevenue, day, signed);
  }

  for (const payment of payments) {
    if (payment.tenantId !== tenantId || payment.currency !== currency || payment.direction !== "INBOUND" ||
      !VERIFIED_PAYMENT_STATES.has(payment.status) || !payment.verifiedAt) continue;
    const at = new Date(payment.verifiedAt).getTime();
    if (!Number.isFinite(at) || at < new Date(from).getTime() || at >= new Date(to).getTime()) continue;
    const day = localDayKey(payment.verifiedAt, timezone);
    if (validDays.has(day)) sumInto(cashCollections, day, numberOf(payment.amount));
  }

  for (const invoice of invoices) {
    if (invoice.tenantId !== tenantId || invoice.currency !== currency || !["ISSUED", "PARTIALLY_PAID", "PAID"].includes(invoice.status)) continue;
    // An issueDate is a business date (YYYY-MM-DD), not a payment timestamp.
    const day = invoice.issueDate?.slice(0, 10);
    if (day && validDays.has(day)) sumInto(grossInvoiced, day, numberOf(invoice.total));
  }

  for (const booking of bookings) {
    if (booking.tenantId !== tenantId || !booking.createdAt) continue;
    const at = new Date(booking.createdAt).getTime();
    if (!Number.isFinite(at) || at < new Date(from).getTime() || at >= new Date(to).getTime()) continue;
    const day = localDayKey(booking.createdAt, timezone);
    if (validDays.has(day)) sumInto(bookingVolume, day, 1);
  }

  const sum = (map: Map<string, number>) => Math.round(
    Array.from(map.values()).reduce((a, b) => a + b, 0) * 100
  ) / 100;
  return {
    postedRevenue: seriesFor(days, postedRevenue, currency),
    cashCollections: seriesFor(days, cashCollections, currency),
    grossInvoiced: seriesFor(days, grossInvoiced, currency),
    bookingVolume: seriesFor(days, bookingVolume),
    postedRevenueTotal: sum(postedRevenue),
    verifiedReceiptsTotal: sum(cashCollections),
    grossInvoicedTotal: sum(grossInvoiced),
    incompletePostedJournals,
  };
}

// Finance permissions must be decided before returning the DTO. A caller
// must have each specific underlying domain right to receive a full executive
// report, including its ledger/revenue, invoicing and customer payment data.
export function canReadExecutiveFinance(permissions: string[]): boolean {
  const can = (key: string) => permissions.includes("*") || permissions.includes(key);
  return ["vehicle.read", "booking.read", "rental.read", "invoice.read", "payment.read", "ledger.read"]
    .every(can);
}
