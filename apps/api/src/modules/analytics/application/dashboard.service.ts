// ============================================================================
// CAR HIRE OS — DASHBOARD APPLICATION SERVICE (Sprint 34: DOM-003, UX-004)
// High-performance aggregated executive overview for tenant operations
// ============================================================================

import type {
  TenantDashboardOverviewDto,
  PeriodPreset,
  TimeSeriesPoint,
} from "@carhire/types";
import {
  VehicleRepository,
  BookingRepository,
  RentalRepository,
  PaymentRepository,
  OperationalInvoiceRepository,
  LeadRepository,
  SalesQuoteRepository,
  ComplianceRecordRepository,
  JournalEntryRepository,
  JournalTransactionRepository,
} from "@carhire/database";
import { MetricsService } from "./metrics.service";
import { TemporalWindowResolver } from "../domain/temporal-window";
import { buildAuthoritativePeriodSeries, localDayKey } from "../domain/dashboard-intelligence";

export class DashboardService {
  constructor(
    private readonly metricsService: MetricsService = new MetricsService(),
    private readonly vehicleRepo: VehicleRepository = new VehicleRepository(),
    private readonly bookingRepo: BookingRepository = new BookingRepository(),
    private readonly rentalRepo: RentalRepository = new RentalRepository(),
    private readonly paymentRepo: PaymentRepository = new PaymentRepository(),
    private readonly invoiceRepo: OperationalInvoiceRepository = new OperationalInvoiceRepository(),
    private readonly leadRepo: LeadRepository = new LeadRepository(),
    private readonly quoteRepo: SalesQuoteRepository = new SalesQuoteRepository(),
    private readonly complianceRepo: ComplianceRecordRepository = new ComplianceRecordRepository(),
    private readonly journalEntryRepo: JournalEntryRepository = new JournalEntryRepository(),
    private readonly journalTxRepo: JournalTransactionRepository = new JournalTransactionRepository()
  ) {}

  /**
   * Compiles the authoritative executive tenant dashboard summary
   */
  async getDashboardOverview(
    tenantId: string,
    options: {
      from?: string;
      to?: string;
      preset?: PeriodPreset;
      currency?: string;
      timezone?: string;
    } = {}
  ): Promise<TenantDashboardOverviewDto> {
    const tz = options.timezone || "Africa/Nairobi";
    const window = TemporalWindowResolver.resolve({
      from: options.from,
      to: options.to,
      preset: options.preset,
      timezone: tz,
    });
    const currency = options.currency || "KES";
    if (!/^[A-Z]{3}$/.test(currency)) throw Object.assign(new Error("Invalid dashboard currency"), { statusCode: 422 });

    // 1. Fetch Headline KPIs concurrently
    const [
      utilizationRate,
      activeRentals,
      cashCollections,
      postedRevenue,
      availableVehicles,
      urgentComplianceCount,
      newLeads,
      pendingBookings,
    ] = await Promise.all([
      this.metricsService.evaluateMetric(tenantId, {
        key: "FLEET_UTILIZATION_RATE",
        preset: window.preset,
        from: window.from,
        to: window.to,
        currency,
        timezone: tz,
      }),
      this.metricsService.evaluateMetric(tenantId, {
        key: "RENTAL_ACTIVE_COUNT",
        preset: window.preset,
        from: window.from,
        to: window.to,
        currency,
        timezone: tz,
      }),
      this.metricsService.evaluateMetric(tenantId, {
        key: "FINANCE_CASH_RECEIPTS",
        preset: window.preset,
        from: window.from,
        to: window.to,
        currency,
        timezone: tz,
      }),
      this.metricsService.evaluateMetric(tenantId, {
        key: "FINANCE_POSTED_REVENUE",
        preset: window.preset,
        from: window.from,
        to: window.to,
        currency,
        timezone: tz,
      }),
      this.metricsService.evaluateMetric(tenantId, {
        key: "FLEET_AVAILABLE_VEHICLES",
        preset: window.preset,
        from: window.from,
        to: window.to,
        currency,
        timezone: tz,
      }),
      this.metricsService.evaluateMetric(tenantId, {
        key: "COMPLIANCE_EXPIRING_COUNT",
        preset: window.preset,
        from: window.from,
        to: window.to,
        currency,
        timezone: tz,
      }),
      this.metricsService.evaluateMetric(tenantId, {
        key: "CRM_LEAD_TOTAL_COUNT",
        preset: window.preset,
        from: window.from,
        to: window.to,
        currency,
        timezone: tz,
      }),
      this.metricsService.evaluateMetric(tenantId, {
        key: "BOOKING_CONFIRMED_COUNT",
        preset: window.preset,
        from: window.from,
        to: window.to,
        currency,
        timezone: tz,
      }),
    ]);

    // 2. Fetch Fleet Status breakdown
    const vehicles = await this.vehicleRepo.list(tenantId);
    const activeVehicles = vehicles.filter((v: any) => (v.lifecycleStatus || v.status) === "ACTIVE");
    const totalVehicles = activeVehicles.length;
    const available = activeVehicles.filter(v => v.availabilityStatus === "AVAILABLE").length;
    const onRent = activeVehicles.filter(v => v.availabilityStatus === "ON_RENT").length;
    const reserved = activeVehicles.filter(v => v.availabilityStatus === "RESERVED").length;
    const maintenance = activeVehicles.filter(v => v.availabilityStatus === "MAINTENANCE").length;
    const blocked = activeVehicles.filter(v => v.availabilityStatus === "BLOCKED").length;
    const currentUtil = totalVehicles > 0 ? Math.round((onRent / totalVehicles) * 1000) / 10 : 0;

    // 3. Fetch CRM Funnel summary
    const leads = await this.leadRepo.listByTenant(tenantId);
    const quotes = await this.quoteRepo.listByTenant(tenantId);
    const inWindowLeads = leads.filter((l) => l.createdAt >= window.from && l.createdAt <= window.to);
    const qualifiedLeads = inWindowLeads.filter((l) => l.status === "QUALIFIED").length;
    const wonLeads = inWindowLeads.filter((l) => l.status === "CONVERTED" || (l.status as any) === "WON").length;
    const inWindowQuotes = quotes.filter((q) => q.createdAt >= window.from && q.createdAt <= window.to);
    const quotesSent = inWindowQuotes.filter((q) => q.status === "SENT").length;
    const quotesAccepted = inWindowQuotes.filter((q) => q.status === "ACCEPTED").length;
    const pipelineValue = quotes
      .filter((q) => q.currency === currency && (q.status === "DRAFT" || q.status === "SENT"))
      .reduce((sum, q) => sum + Number(q.grandTotal || 0), 0);
    const leadConversionRate = inWindowLeads.length > 0 ? Math.round((wonLeads / inWindowLeads.length) * 1000) / 10 : 0;

    // 4. Period financial facts come from their own authoritative dates.
    // Invoice issuance != verified collection != posted ledger revenue.
    const [invoices, journalEntries, journalTransactions, receipts, bookingRecords] = await Promise.all([
      this.invoiceRepo.listByTenant(tenantId),
      this.journalEntryRepo.listByTenant(tenantId),
      this.journalTxRepo.listByTenant(tenantId),
      this.paymentRepo.listByTenant(tenantId),
      this.loadAllBookings(tenantId),
    ]);
    const businessStart = localDayKey(window.from, tz);
    const businessEnd = localDayKey(new Date(new Date(window.to).getTime() - 1), tz);
    const inWindowInvoices = invoices.filter(i =>
      i.currency === currency && i.issueDate >= businessStart && i.issueDate <= businessEnd &&
      ["ISSUED", "PAID", "PARTIALLY_PAID"].includes(i.status)
    );
    const netRevenue = inWindowInvoices.reduce(
      (sum, i) => sum + Number(i.subtotal || 0) - Number(i.discountTotal || 0), 0
    );
    const outstandingReceivables = invoices
      .filter(i => i.currency === currency && ["ISSUED", "PARTIALLY_PAID"].includes(i.status))
      .reduce((sum, i) => sum + Number(i.amountOutstanding || 0), 0);
    const financialSeries = buildAuthoritativePeriodSeries({
      tenantId, from: window.from, to: window.to, timezone: tz, currency,
      journals: journalTransactions, entries: journalEntries,
      payments: receipts, invoices, bookings: bookingRecords,
    });
    if (financialSeries.incompletePostedJournals) {
      throw Object.assign(new Error("Posted revenue journal provenance is incomplete; analytics unavailable until reconciled"), { statusCode: 409 });
    }
    const postedHeaders = new Map(journalTransactions
      .filter(j => j.currency === currency && (j.status === "POSTED" || j.status === "REVERSED"))
      .map(j => [j.id, j]));
    let totalDebits = 0;
    let totalCredits = 0;
    for (const entry of journalEntries) {
      if (!postedHeaders.has(entry.transactionId)) continue;
      const amount = Number(entry.amount);
      if (!Number.isFinite(amount)) throw new Error("Invalid ledger amount in trial balance");
      if (entry.direction === "DEBIT") totalDebits += amount;
      else totalCredits += amount;
    }
    const trialBalanceReconciled = Math.abs(totalDebits - totalCredits) < 0.01;

    // Present fleet status cannot prove historic eligible fleet-day capacity.
    // An unknown historical series must NOT be fabricated with today's rate.
    const revenueChart = financialSeries.postedRevenue;
    const utilizationChart: TimeSeriesPoint[] = [];

    // 6. Recent Activity unified stream
    const { items: recentBookings } = await this.bookingRepo.findMany(tenantId, { limit: 5 });
    const recentRentals = await this.rentalRepo.listByTenant(tenantId);
    const recentPayments = await this.paymentRepo.listByTenant(tenantId);

    const recentActivity = [
      ...recentBookings.slice(0, 3).map((b) => ({
        id: b.id,
        type: "BOOKING" as const,
        title: `Reservation #${b.bookingNumber} (${b.requestedVehicleCategoryId || (b as any).category || ""})`,
        timestamp: b.createdAt,
        status: b.status,
        amount: b.grossTotal,
        currency: b.currency,
      })),
      ...recentRentals.slice(0, 3).map((r) => ({
        id: r.id,
        type: "RENTAL" as const,
        title: `Rental #${r.rentalNumber} ${r.state.replace(/_/g, " ")}`,
        timestamp: r.actualStart || r.scheduledStart || r.createdAt,
        status: r.state,
      })),
      ...recentPayments.slice(0, 3).map((p) => ({
        id: p.id,
        type: "PAYMENT" as const,
        title: `Payment ${p.paymentNumber} via ${p.provider || ""}`,
        timestamp: p.paidAt || p.createdAt,
        status: p.status,
        amount: parseFloat(String(p.amount || 0)),
        currency: p.currency,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 6);

    return {
      tenantId,
      period: { from: window.from, to: window.to, preset: window.preset },
      tenantTimezone: tz,
      currency,
      dataAsOf: new Date().toISOString(),
      headlineKpis: {
        utilizationRate,
        activeRentals,
        cashCollections,
        postedRevenue,
        availableVehicles,
        urgentComplianceCount,
        pendingHandovers: pendingBookings,
        newLeads,
      },
      fleetStatus: {
        total: totalVehicles,
        available,
        onRent,
        reserved,
        maintenance,
        blocked,
        utilizationRate: currentUtil,
      },
      crmFunnel: {
        newLeads: inWindowLeads.length,
        qualifiedLeads,
        quotesSent,
        quotesAccepted,
        conversionRate: leadConversionRate,
        pipelineValue,
      },
      financialSummary: {
        currency,
        grossInvoiced: financialSeries.grossInvoicedTotal,
        netRevenue,
        netInvoicedRevenue: netRevenue,
        postedRevenue: typeof postedRevenue.value === "number" ? postedRevenue.value : 0,
        cashReceipts: typeof cashCollections.value === "number" ? cashCollections.value : 0,
        outstandingReceivables,
        trialBalanceReconciled,
      },
      revenueChart,
      cashCollectionsChart: financialSeries.cashCollections,
      grossInvoicedChart: financialSeries.grossInvoiced,
      bookingVolumeChart: financialSeries.bookingVolume,
      utilizationChart,
      chartAvailability: {
        postedRevenue: financialSeries.incompletePostedJournals ? "UNAVAILABLE" : "VERIFIED",
        cashCollections: "VERIFIED",
        grossInvoiced: "VERIFIED",
        bookingVolume: "VERIFIED",
        utilization: "UNAVAILABLE",
        utilizationReason: "Historical eligible fleet-day denominators are not yet certified.",
      },
      recentActivity,
    };
  }

  private async loadAllBookings(tenantId: string) {
    const size = 250;
    const rows: Awaited<ReturnType<BookingRepository["findMany"]>>["items"] = [];
    let offset = 0;
    while (true) {
      const page = await this.bookingRepo.findMany(tenantId, { offset, limit: size });
      rows.push(...page.items);
      offset += page.items.length;
      if (!page.items.length || offset >= page.total) return rows;
    }
  }
}
