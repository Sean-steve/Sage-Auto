// ============================================================================
// CAR HIRE OS — METRICS APPLICATION SERVICE (Sprint 34: DOM-003, DEV-009)
// Evaluates canonical metrics against authoritative operational & financial domains
// ============================================================================

import type {
  MetricKey,
  MetricValueResult,
  PeriodPreset,
} from "@carhire/types";
import {
  VehicleRepository,
  BookingRepository,
  RentalRepository,
  PaymentRepository,
  OperationalInvoiceRepository,
  JournalEntryRepository,
  JournalTransactionRepository,
  LeadRepository,
  SalesQuoteRepository,
  MaintenanceRepository,
  ComplianceRecordRepository,
  CustomerRepository,
  CorporateAccountRepository,
  DepositPositionRepository,
  RefundRepository,
  OwnerSettlementRepository,
} from "@carhire/database";
import { MetricRegistry } from "../domain/metric-registry";
import { TemporalWindowResolver } from "../domain/temporal-window";

export interface MetricQueryParams {
  key: MetricKey;
  from?: string;
  to?: string;
  preset?: PeriodPreset;
  currency?: string;
  timezone?: string;
  filters?: Record<string, unknown>;
}

function isDateInWindow(dateStr: string | undefined | null, from: string, to: string): boolean {
  if (!dateStr) return false;
  const time = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00.000Z` : dateStr).getTime();
  if (isNaN(time)) return false;
  const fromTime = new Date(from).getTime();
  const toTime = new Date(to).getTime();
  return time >= fromTime && time <= toTime;
}

export class MetricsService {
  constructor(
    private readonly vehicleRepo: VehicleRepository = new VehicleRepository(),
    private readonly bookingRepo: BookingRepository = new BookingRepository(),
    private readonly rentalRepo: RentalRepository = new RentalRepository(),
    private readonly paymentRepo: PaymentRepository = new PaymentRepository(),
    private readonly invoiceRepo: OperationalInvoiceRepository = new OperationalInvoiceRepository(),
    private readonly journalEntryRepo: JournalEntryRepository = new JournalEntryRepository(),
    private readonly journalTxRepo: JournalTransactionRepository = new JournalTransactionRepository(),
    private readonly leadRepo: LeadRepository = new LeadRepository(),
    private readonly quoteRepo: SalesQuoteRepository = new SalesQuoteRepository(),
    private readonly maintenanceRepo: MaintenanceRepository = new MaintenanceRepository(),
    private readonly complianceRepo: ComplianceRecordRepository = new ComplianceRecordRepository(),
    private readonly customerRepo: CustomerRepository = new CustomerRepository(),
    private readonly corporateRepo: CorporateAccountRepository = new CorporateAccountRepository(),
    private readonly depositRepo: DepositPositionRepository = new DepositPositionRepository(),
    private readonly refundRepo: RefundRepository = new RefundRepository(),
    private readonly settlementRepo: OwnerSettlementRepository = new OwnerSettlementRepository()
  ) {}

  /**
   * Evaluates a single metric for a tenant over the requested temporal window
   */
  async evaluateMetric(
    tenantId: string,
    params: MetricQueryParams
  ): Promise<MetricValueResult> {
    const definition = MetricRegistry.get(params.key);
    if (!definition) {
      throw new Error(`Metric definition not found for key: ${params.key}`);
    }

    const window = TemporalWindowResolver.resolve({
      from: params.from,
      to: params.to,
      preset: params.preset,
      timezone: params.timezone,
    });

    // Evaluate current window
    const currentValue = await this.computeRawMetric(
      tenantId,
      params.key,
      window.from,
      window.to,
      params.currency,
      params.filters
    );

    // Evaluate previous period for comparison (if numeric)
    let priorValue: number | boolean | undefined;
    let changePercentage: number | null = null;

    if (typeof currentValue.value === "number") {
      const priorResult = await this.computeRawMetric(
        tenantId,
        params.key,
        window.previousPeriod.from,
        window.previousPeriod.to,
        params.currency,
        params.filters
      );
      if (typeof priorResult.value === "number") {
        priorValue = priorResult.value;
        changePercentage = TemporalWindowResolver.calculateChangePercentage(
          currentValue.value,
          priorResult.value
        );
      }
    }

    return {
      key: params.key,
      displayName: definition.displayName,
      value: currentValue.value,
      unit: definition.unit,
      currency: params.currency || "KES",
      byCurrency: currentValue.byCurrency,
      period: { from: window.from, to: window.to },
      previousPeriodValue: priorValue,
      changePercentage,
      dataAsOf: new Date().toISOString(),
      freshness: definition.freshnessMode,
    };
  }

  /**
   * Internal router to evaluate specific metric formulas
   */
  private async computeRawMetric(
    tenantId: string,
    key: MetricKey,
    from: string,
    to: string,
    currency?: string,
    filters?: Record<string, unknown>
  ): Promise<{ value: number | boolean; byCurrency?: Record<string, number> }> {
    switch (key) {
      // Fleet & Utilization
      case "FLEET_TOTAL_VEHICLES": {
        const vehicles = await this.vehicleRepo.list(tenantId);
        return { value: vehicles.length };
      }
      case "FLEET_ACTIVE_VEHICLES": {
        const vehicles = await this.vehicleRepo.list(tenantId);
        return { value: vehicles.filter((v: any) => (v.lifecycleStatus || v.status) === "ACTIVE").length };
      }
      case "FLEET_AVAILABLE_VEHICLES": {
        const vehicles = await this.vehicleRepo.list(tenantId);
        return {
          value: vehicles.filter(
            (v: any) => (v.lifecycleStatus || v.status) === "ACTIVE" && v.availabilityStatus === "AVAILABLE"
          ).length,
        };
      }
      case "FLEET_ON_RENT_VEHICLES": {
        const vehicles = await this.vehicleRepo.list(tenantId);
        return {
          value: vehicles.filter(
            (v: any) => (v.lifecycleStatus || v.status) === "ACTIVE" && v.availabilityStatus === "ON_RENT"
          ).length,
        };
      }
      case "FLEET_MAINTENANCE_VEHICLES": {
        const vehicles = await this.vehicleRepo.list(tenantId);
        return {
          value: vehicles.filter(
            (v: any) => (v.lifecycleStatus || v.status) === "ACTIVE" && v.availabilityStatus === "MAINTENANCE"
          ).length,
        };
      }
      case "FLEET_UTILIZATION_RATE": {
        const vehicles = await this.vehicleRepo.list(tenantId);
        const active = vehicles.filter((v: any) => (v.lifecycleStatus || v.status) === "ACTIVE");
        if (active.length === 0) return { value: 0 };
        const onRent = active.filter((v) => v.availabilityStatus === "ON_RENT").length;
        return { value: Math.round((onRent / active.length) * 1000) / 10 };
      }
      case "FLEET_DOWNTIME_HOURS": {
        const maintenance = await this.maintenanceRepo.listByTenant(tenantId);
        const hours = maintenance.reduce((sum, m) => sum + ((m as any).actualDurationHours || 0), 0);
        return { value: hours };
      }

      // Bookings & Reservations
      case "BOOKING_TOTAL_COUNT": {
        const { items } = await this.bookingRepo.findMany(tenantId);
        const inWindow = items.filter(
          (b) => b.createdAt >= from && b.createdAt <= to
        );
        return { value: inWindow.length };
      }
      case "BOOKING_CONFIRMED_COUNT": {
        const { items } = await this.bookingRepo.findMany(tenantId);
        const inWindow = items.filter(
          (b) => b.createdAt >= from && b.createdAt <= to && b.status === "CONFIRMED"
        );
        return { value: inWindow.length };
      }
      case "BOOKING_COMPLETED_COUNT": {
        const { items } = await this.bookingRepo.findMany(tenantId);
        const inWindow = items.filter(
          (b) => b.createdAt >= from && b.createdAt <= to && b.status === "COMPLETED"
        );
        return { value: inWindow.length };
      }
      case "BOOKING_CANCELLED_COUNT": {
        const { items } = await this.bookingRepo.findMany(tenantId);
        const inWindow = items.filter(
          (b) => b.createdAt >= from && b.createdAt <= to && b.status === "CANCELLED"
        );
        return { value: inWindow.length };
      }
      case "BOOKING_NO_SHOW_COUNT": {
        const { items } = await this.bookingRepo.findMany(tenantId);
        const inWindow = items.filter(
          (b) => b.createdAt >= from && b.createdAt <= to && b.status === "NO_SHOW"
        );
        return { value: inWindow.length };
      }
      case "BOOKING_TOTAL_VALUE": {
        const { items } = await this.bookingRepo.findMany(tenantId);
        const inWindow = items.filter(
          (b) => b.createdAt >= from && b.createdAt <= to
        );
        const byCurrency: Record<string, number> = {};
        for (const b of inWindow) {
          const c = b.currency || "KES";
          byCurrency[c] = (byCurrency[c] || 0) + (b.grossTotal || 0);
        }
        const targetCurr = currency || Object.keys(byCurrency)[0] || "KES";
        return { value: byCurrency[targetCurr] || 0, byCurrency };
      }
      case "BOOKING_AVERAGE_VALUE": {
        const { items } = await this.bookingRepo.findMany(tenantId);
        const inWindow = items.filter(
          (b) => b.createdAt >= from && b.createdAt <= to
        );
        if (inWindow.length === 0) return { value: 0 };
        const byCurrency: Record<string, number> = {};
        const countByCurrency: Record<string, number> = {};
        for (const b of inWindow) {
          const c = b.currency || "KES";
          byCurrency[c] = (byCurrency[c] || 0) + (b.grossTotal || 0);
          countByCurrency[c] = (countByCurrency[c] || 0) + 1;
        }
        const targetCurr = currency || Object.keys(byCurrency)[0] || "KES";
        const count = countByCurrency[targetCurr] || 1;
        const avg = Math.round(((byCurrency[targetCurr] || 0) / count) * 100) / 100;
        return { value: avg, byCurrency };
      }
      case "BOOKING_CANCELLATION_RATE": {
        const { items } = await this.bookingRepo.findMany(tenantId);
        const inWindow = items.filter(
          (b) => b.createdAt >= from && b.createdAt <= to
        );
        if (inWindow.length === 0) return { value: 0 };
        const cancelled = inWindow.filter((b) => b.status === "CANCELLED").length;
        return { value: Math.round((cancelled / inWindow.length) * 1000) / 10 };
      }
      case "BOOKING_NO_SHOW_RATE": {
        const { items } = await this.bookingRepo.findMany(tenantId);
        const inWindow = items.filter(
          (b) => b.createdAt >= from && b.createdAt <= to
        );
        const eligible = inWindow.filter(
          (b) => b.status === "CONFIRMED" || b.status === "COMPLETED" || b.status === "NO_SHOW"
        );
        if (eligible.length === 0) return { value: 0 };
        const noShows = inWindow.filter((b) => b.status === "NO_SHOW").length;
        return { value: Math.round((noShows / eligible.length) * 1000) / 10 };
      }
      case "BOOKING_LEAD_TIME_HOURS": {
        const { items } = await this.bookingRepo.findMany(tenantId);
        const inWindow = items.filter(
          (b) => b.createdAt >= from && b.createdAt <= to && (b.pickupAt || (b as any).pickupDateTime)
        );
        if (inWindow.length === 0) return { value: 0 };
        const totalLeadMs = inWindow.reduce((acc, b) => {
          const pickupTime = b.pickupAt || (b as any).pickupDateTime;
          const diff = new Date(pickupTime).getTime() - new Date(b.createdAt).getTime();
          return acc + Math.max(0, diff);
        }, 0);
        const avgHours = Math.round((totalLeadMs / (inWindow.length * 3600000)) * 10) / 10;
        return { value: avgHours };
      }

      // Rentals
      case "RENTAL_TOTAL_COUNT": {
        const rentals = await this.rentalRepo.listByTenant(tenantId);
        const inWindow = rentals.filter((r) => r.createdAt >= from && r.createdAt <= to);
        return { value: inWindow.length };
      }
      case "RENTAL_ACTIVE_COUNT": {
        const rentals = await this.rentalRepo.listByTenant(tenantId);
        return { value: rentals.filter((r) => r.state === "ACTIVE_ON_ROAD" || (r.state as any) === "ACTIVE").length };
      }
      case "RENTAL_COMPLETED_COUNT": {
        const rentals = await this.rentalRepo.listByTenant(tenantId);
        const inWindow = rentals.filter(
          (r) => (r.state === "COMPLETED" || r.state === "RETURN_COMPLETED" || (r.state as any) === "RETURNED") &&
            r.actualEnd && r.actualEnd >= from && r.actualEnd <= to
        );
        return { value: inWindow.length };
      }
      case "RENTAL_AVERAGE_DURATION_DAYS": {
        const rentals = await this.rentalRepo.listByTenant(tenantId);
        const completed = rentals.filter(
          (r) => (r.state === "COMPLETED" || r.state === "RETURN_COMPLETED" || (r.state as any) === "RETURNED") &&
            r.actualEnd && r.actualEnd >= from && r.actualEnd <= to
        );
        if (completed.length === 0) return { value: 0 };
        const totalMs = completed.reduce((acc, r) => {
          const start = new Date(r.actualStart || r.scheduledStart).getTime();
          const end = new Date(r.actualEnd!).getTime();
          return acc + Math.max(0, end - start);
        }, 0);
        const days = Math.round((totalMs / (completed.length * 86400000)) * 10) / 10;
        return { value: days };
      }
      case "RENTAL_EXTENSIONS_COUNT": {
        const rentals = await this.rentalRepo.listByTenant(tenantId);
        const count = rentals.reduce((sum, r) => sum + ((r as any).extensionCount || (r as any).extensions?.length || 0), 0);
        return { value: count };
      }
      case "RENTAL_LATE_RETURN_COUNT": {
        const rentals = await this.rentalRepo.listByTenant(tenantId);
        const completed = rentals.filter(
          (r) => r.state === "COMPLETED" && r.actualEnd && r.actualEnd >= from && r.actualEnd <= to
        );
        const lateCount = completed.filter((r) => {
          if (!r.actualEnd || !r.scheduledEnd) return false;
          const scheduled = new Date(r.scheduledEnd).getTime();
          const actual = new Date(r.actualEnd).getTime();
          return actual > scheduled + 3600000; // 1 hour grace
        }).length;
        return { value: lateCount };
      }

      // Financial & Ledger (Authoritative)
      case "FINANCE_GROSS_INVOICED": {
        const invoices = await this.invoiceRepo.listByTenant(tenantId);
        const valid = invoices.filter(
          (i) => isDateInWindow(i.issueDate, from, to) && (i.status === "ISSUED" || i.status === "PAID" || i.status === "PARTIALLY_PAID")
        );
        const byCurrency: Record<string, number> = {};
        for (const inv of valid) {
          const c = inv.currency || "KES";
          const totalVal = parseFloat(String(inv.total ?? (inv as any).totalAmount ?? "0"));
          byCurrency[c] = (byCurrency[c] || 0) + totalVal;
        }
        const targetCurr = currency || Object.keys(byCurrency)[0] || "KES";
        return { value: byCurrency[targetCurr] || 0, byCurrency };
      }
      case "FINANCE_TAX_INVOICED": {
        const invoices = await this.invoiceRepo.listByTenant(tenantId);
        const valid = invoices.filter(
          (i) => isDateInWindow(i.issueDate, from, to) && (i.status === "ISSUED" || i.status === "PAID" || i.status === "PARTIALLY_PAID")
        );
        const byCurrency: Record<string, number> = {};
        for (const inv of valid) {
          const c = inv.currency || "KES";
          const taxVal = parseFloat(String(inv.taxTotal ?? (inv as any).taxAmount ?? "0"));
          byCurrency[c] = (byCurrency[c] || 0) + taxVal;
        }
        const targetCurr = currency || Object.keys(byCurrency)[0] || "KES";
        return { value: byCurrency[targetCurr] || 0, byCurrency };
      }
      case "FINANCE_DISCOUNT_TOTAL": {
        const invoices = await this.invoiceRepo.listByTenant(tenantId);
        const valid = invoices.filter(
          (i) => isDateInWindow(i.issueDate, from, to) && (i.status === "ISSUED" || i.status === "PAID" || i.status === "PARTIALLY_PAID")
        );
        const byCurrency: Record<string, number> = {};
        for (const inv of valid) {
          const c = inv.currency || "KES";
          const discVal = parseFloat(String(inv.discountTotal ?? (inv as any).discountAmount ?? "0"));
          byCurrency[c] = (byCurrency[c] || 0) + discVal;
        }
        const targetCurr = currency || Object.keys(byCurrency)[0] || "KES";
        return { value: byCurrency[targetCurr] || 0, byCurrency };
      }
      case "FINANCE_NET_INVOICED_REVENUE": {
        const invoices = await this.invoiceRepo.listByTenant(tenantId);
        const valid = invoices.filter(
          (i) => isDateInWindow(i.issueDate, from, to) && (i.status === "ISSUED" || i.status === "PAID" || i.status === "PARTIALLY_PAID")
        );
        const byCurrency: Record<string, number> = {};
        for (const inv of valid) {
          const c = inv.currency || "KES";
          const subtotal = parseFloat(String(inv.subtotal ?? "0"));
          const disc = parseFloat(String(inv.discountTotal ?? (inv as any).discountAmount ?? "0"));
          const net = subtotal - disc;
          byCurrency[c] = (byCurrency[c] || 0) + net;
        }
        const targetCurr = currency || Object.keys(byCurrency)[0] || "KES";
        return { value: byCurrency[targetCurr] || 0, byCurrency };
      }
      case "FINANCE_POSTED_REVENUE": {
        // Authoritative: Ledger entries for REVENUE accounts on POSTED transactions
        const entries = await this.journalEntryRepo.listByTenant(tenantId);
        const byCurrency: Record<string, number> = {};
        for (const e of entries) {
          if (e.accountCode && e.accountCode.startsWith("4")) { // Account 4xxx = REVENUE
            const c = (e as any).currency || "KES";
            const amt = parseFloat(String((e as any).amount || 0));
            const debit = (e as any).direction === "DEBIT" ? amt : parseFloat(String((e as any).debit || 0));
            const credit = (e as any).direction === "CREDIT" ? amt : parseFloat(String((e as any).credit || 0));
            const netCredit = credit - debit;
            byCurrency[c] = (byCurrency[c] || 0) + netCredit;
          }
        }
        const targetCurr = currency || Object.keys(byCurrency)[0] || "KES";
        return { value: byCurrency[targetCurr] || 0, byCurrency };
      }
      case "FINANCE_CASH_RECEIPTS": {
        // Authoritative: verified COMPLETED payments
        const payments = await this.paymentRepo.listByTenant(tenantId);
        const valid = payments.filter((p) => p.status === "VERIFIED" || p.status === "ALLOCATED" || (p.status as any) === "COMPLETED");
        const byCurrency: Record<string, number> = {};
        for (const p of valid) {
          const c = p.currency || "KES";
          byCurrency[c] = (byCurrency[c] || 0) + parseFloat(String(p.amount || 0));
        }
        const targetCurr = currency || Object.keys(byCurrency)[0] || "KES";
        return { value: byCurrency[targetCurr] || 0, byCurrency };
      }
      case "FINANCE_TOTAL_EXPENSES": {
        const entries = await this.journalEntryRepo.listByTenant(tenantId);
        const byCurrency: Record<string, number> = {};
        for (const e of entries) {
          if (e.accountCode && (e.accountCode.startsWith("5") || e.accountCode.startsWith("6"))) { // 5xxx/6xxx = EXPENSE
            const c = (e as any).currency || "KES";
            const amt = parseFloat(String((e as any).amount || 0));
            const debit = (e as any).direction === "DEBIT" ? amt : parseFloat(String((e as any).debit || 0));
            const credit = (e as any).direction === "CREDIT" ? amt : parseFloat(String((e as any).credit || 0));
            const netDebit = debit - credit;
            byCurrency[c] = (byCurrency[c] || 0) + netDebit;
          }
        }
        const targetCurr = currency || Object.keys(byCurrency)[0] || "KES";
        return { value: byCurrency[targetCurr] || 0, byCurrency };
      }
      case "FINANCE_OUTSTANDING_RECEIVABLES": {
        const invoices = await this.invoiceRepo.listByTenant(tenantId);
        const open = invoices.filter(
          (i) => i.status === "ISSUED" || i.status === "PARTIALLY_PAID"
        );
        const byCurrency: Record<string, number> = {};
        for (const inv of open) {
          const c = inv.currency || "KES";
          const bal = parseFloat(String(inv.amountOutstanding ?? (inv as any).balanceRemaining ?? inv.total ?? "0"));
          byCurrency[c] = (byCurrency[c] || 0) + bal;
        }
        const targetCurr = currency || Object.keys(byCurrency)[0] || "KES";
        return { value: byCurrency[targetCurr] || 0, byCurrency };
      }
      case "FINANCE_DEPOSITS_HELD": {
        const deposits = await this.depositRepo.listByTenant(tenantId);
        const held = deposits.filter((d) => d.status === "HELD");
        const byCurrency: Record<string, number> = {};
        for (const d of held) {
          const c = d.currency || "KES";
          byCurrency[c] = (byCurrency[c] || 0) + parseFloat(String(d.heldAmount || d.receivedAmount || (d as any).amount || 0));
        }
        const targetCurr = currency || Object.keys(byCurrency)[0] || "KES";
        return { value: byCurrency[targetCurr] || 0, byCurrency };
      }
      case "FINANCE_REFUNDS_COMPLETED": {
        const refunds = await this.refundRepo.listByTenant(tenantId);
        const completed = refunds.filter((r) => r.status === "COMPLETED");
        const byCurrency: Record<string, number> = {};
        for (const r of completed) {
          const c = r.currency || "KES";
          byCurrency[c] = (byCurrency[c] || 0) + parseFloat(String(r.amount || 0));
        }
        const targetCurr = currency || Object.keys(byCurrency)[0] || "KES";
        return { value: byCurrency[targetCurr] || 0, byCurrency };
      }
      case "FINANCE_TRIAL_BALANCE_DEBITS": {
        const entries = await this.journalEntryRepo.listByTenant(tenantId);
        const byCurrency: Record<string, number> = {};
        for (const e of entries) {
          const c = (e as any).currency || "KES";
          const amt = parseFloat(String((e as any).amount || 0));
          const debit = (e as any).direction === "DEBIT" ? amt : parseFloat(String((e as any).debit || 0));
          byCurrency[c] = (byCurrency[c] || 0) + debit;
        }
        const targetCurr = currency || Object.keys(byCurrency)[0] || "KES";
        return { value: byCurrency[targetCurr] || 0, byCurrency };
      }
      case "FINANCE_TRIAL_BALANCE_CREDITS": {
        const entries = await this.journalEntryRepo.listByTenant(tenantId);
        const byCurrency: Record<string, number> = {};
        for (const e of entries) {
          const c = (e as any).currency || "KES";
          const amt = parseFloat(String((e as any).amount || 0));
          const credit = (e as any).direction === "CREDIT" ? amt : parseFloat(String((e as any).credit || 0));
          byCurrency[c] = (byCurrency[c] || 0) + credit;
        }
        const targetCurr = currency || Object.keys(byCurrency)[0] || "KES";
        return { value: byCurrency[targetCurr] || 0, byCurrency };
      }
      case "FINANCE_TRIAL_BALANCE_RECONCILED": {
        const entries = await this.journalEntryRepo.listByTenant(tenantId);
        let totalDebits = 0;
        let totalCredits = 0;
        for (const e of entries) {
          const amt = parseFloat(String((e as any).amount || 0));
          const debit = (e as any).direction === "DEBIT" ? amt : parseFloat(String((e as any).debit || 0));
          const credit = (e as any).direction === "CREDIT" ? amt : parseFloat(String((e as any).credit || 0));
          totalDebits += debit;
          totalCredits += credit;
        }
        return { value: Math.abs(totalDebits - totalCredits) < 0.01 };
      }

      // Owner Settlements
      case "OWNER_SETTLEMENT_TOTAL_PAYABLE": {
        const periods = await this.settlementRepo.listPeriods(tenantId);
        const total = periods.reduce((sum, p) => sum + (p.totalPayout || 0), 0);
        return { value: total };
      }
      case "OWNER_SETTLEMENT_PAID": {
        const periods = await this.settlementRepo.listPeriods(tenantId);
        const paid = periods
          .filter((p) => p.status === "SETTLED" || p.status === "CLOSED")
          .reduce((sum, p) => sum + (p.totalPayout || 0), 0);
        return { value: paid };
      }
      case "OWNER_SETTLEMENT_PENDING": {
        const periods = await this.settlementRepo.listPeriods(tenantId);
        const pending = periods
          .filter((p) => p.status === "DRAFT" || p.status === "CALCULATED" || p.status === "APPROVED")
          .reduce((sum, p) => sum + (p.totalPayout || 0), 0);
        return { value: pending };
      }

      // Maintenance & Compliance
      case "MAINTENANCE_TOTAL_COST": {
        const maintenance = await this.maintenanceRepo.listByTenant(tenantId);
        const completed = maintenance.filter((m) => m.status === "COMPLETED");
        const total = completed.reduce((sum, m) => sum + (m.actualCost || m.estimatedCost || (m as any).totalCost || 0), 0);
        return { value: total };
      }
      case "MAINTENANCE_WORK_ORDERS_COUNT": {
        const maintenance = await this.maintenanceRepo.listByTenant(tenantId);
        return { value: maintenance.length };
      }
      case "COMPLIANCE_VALID_COUNT": {
        const records = await this.complianceRepo.listByTenant(tenantId);
        return { value: records.filter((r) => r.status === "VALID" || (r as any).expiryState === "VALID").length };
      }
      case "COMPLIANCE_EXPIRING_COUNT": {
        const records = await this.complianceRepo.listByTenant(tenantId);
        return {
          value: records.filter(
            (r) => r.status === "DUE_SOON" || (r as any).expiryState === "EXPIRING_SOON" || (r as any).expiryState === "URGENT"
          ).length,
        };
      }
      case "COMPLIANCE_EXPIRED_COUNT": {
        const records = await this.complianceRepo.listByTenant(tenantId);
        return { value: records.filter((r) => r.status === "EXPIRED" || (r as any).expiryState === "EXPIRED").length };
      }

      // Customers & Corporate
      case "CUSTOMER_TOTAL_COUNT": {
        const customers = await this.customerRepo.list(tenantId);
        return { value: customers.length };
      }
      case "CUSTOMER_NEW_COUNT": {
        const customers = await this.customerRepo.list(tenantId);
        const inWindow = customers.filter(
          (c) => c.createdAt >= from && c.createdAt <= to
        );
        return { value: inWindow.length };
      }
      case "CUSTOMER_REPEAT_COUNT": {
        const customers = await this.customerRepo.list(tenantId);
        return { value: customers.filter((c) => (c.totalRentalsCount || (c as any).completedBookingsCount || 0) >= 2).length };
      }
      case "CORPORATE_ACCOUNT_COUNT": {
        const accounts = await this.corporateRepo.list(tenantId);
        return { value: accounts.filter((a) => a.status === "ACTIVE").length };
      }

      // CRM Funnel
      case "CRM_LEAD_TOTAL_COUNT": {
        const leads = await this.leadRepo.listByTenant(tenantId);
        const inWindow = leads.filter((l) => l.createdAt >= from && l.createdAt <= to);
        return { value: inWindow.length };
      }
      case "CRM_LEAD_QUALIFIED_COUNT": {
        const leads = await this.leadRepo.listByTenant(tenantId);
        return { value: leads.filter((l) => l.status === "QUALIFIED").length };
      }
      case "CRM_LEAD_CONVERTED_COUNT": {
        const leads = await this.leadRepo.listByTenant(tenantId);
        return { value: leads.filter((l) => l.status === "CONVERTED" || (l.status as any) === "WON").length };
      }
      case "CRM_LEAD_CONVERSION_RATE": {
        const leads = await this.leadRepo.listByTenant(tenantId);
        if (leads.length === 0) return { value: 0 };
        const won = leads.filter((l) => l.status === "CONVERTED" || (l.status as any) === "WON").length;
        return { value: Math.round((won / leads.length) * 1000) / 10 };
      }
      case "CRM_QUOTE_TOTAL_COUNT": {
        const quotes = await this.quoteRepo.listByTenant(tenantId);
        const inWindow = quotes.filter((q) => q.createdAt >= from && q.createdAt <= to);
        return { value: inWindow.length };
      }
      case "CRM_QUOTE_SENT_COUNT": {
        const quotes = await this.quoteRepo.listByTenant(tenantId);
        return { value: quotes.filter((q) => q.status === "SENT").length };
      }
      case "CRM_QUOTE_ACCEPTED_COUNT": {
        const quotes = await this.quoteRepo.listByTenant(tenantId);
        return { value: quotes.filter((q) => q.status === "ACCEPTED").length };
      }
      case "CRM_QUOTE_CONVERSION_RATE": {
        const quotes = await this.quoteRepo.listByTenant(tenantId);
        const eligible = quotes.filter(
          (q) => q.status === "SENT" || q.status === "ACCEPTED" || q.status === "REJECTED"
        );
        if (eligible.length === 0) return { value: 0 };
        const accepted = quotes.filter((q) => q.status === "ACCEPTED").length;
        return { value: Math.round((accepted / eligible.length) * 1000) / 10 };
      }
      case "CRM_TOTAL_PIPELINE_VALUE": {
        const quotes = await this.quoteRepo.listByTenant(tenantId);
        const open = quotes.filter((q) => q.status === "DRAFT" || q.status === "SENT");
        const byCurrency: Record<string, number> = {};
        for (const q of open) {
          const c = q.currency || "KES";
          byCurrency[c] = (byCurrency[c] || 0) + (q.grandTotal || (q as any).grossTotal || 0);
        }
        const targetCurr = currency || Object.keys(byCurrency)[0] || "KES";
        return { value: byCurrency[targetCurr] || 0, byCurrency };
      }

      default:
        return { value: 0 };
    }
  }
}
