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
} from "@carhire/database";
import { MetricsService } from "./metrics.service";
import { TemporalWindowResolver } from "../domain/temporal-window";

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
    private readonly journalEntryRepo: JournalEntryRepository = new JournalEntryRepository()
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
    const totalVehicles = vehicles.length;
    const available = vehicles.filter((v: any) => (v.lifecycleStatus || v.status) === "ACTIVE" && v.availabilityStatus === "AVAILABLE").length;
    const onRent = vehicles.filter((v: any) => (v.lifecycleStatus || v.status) === "ACTIVE" && v.availabilityStatus === "ON_RENT").length;
    const reserved = vehicles.filter((v: any) => (v.lifecycleStatus || v.status) === "ACTIVE" && v.availabilityStatus === "RESERVED").length;
    const maintenance = vehicles.filter((v: any) => (v.lifecycleStatus || v.status) === "ACTIVE" && v.availabilityStatus === "MAINTENANCE").length;
    const blocked = vehicles.filter((v: any) => (v.lifecycleStatus || v.status) === "ACTIVE" && v.availabilityStatus === "BLOCKED").length;
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
      .filter((q) => q.status === "DRAFT" || q.status === "SENT")
      .reduce((sum, q) => sum + ((q as any).grossTotal || (q as any).total || 0), 0);
    const leadConversionRate = inWindowLeads.length > 0 ? Math.round((wonLeads / inWindowLeads.length) * 1000) / 10 : 0;

    // 4. Fetch Financial Summary with Trial Balance Check
    const invoices = await this.invoiceRepo.listByTenant(tenantId);
    const inWindowInvoices = invoices.filter(
      (i) => i.issueDate >= window.from && i.issueDate <= window.to && (i.status === "ISSUED" || i.status === "PAID" || i.status === "PARTIALLY_PAID")
    );
    const grossInvoiced = inWindowInvoices.reduce((sum, i) => sum + parseFloat(i.total || "0"), 0);
    const netRevenue = inWindowInvoices.reduce((sum, i) => sum + (parseFloat(i.subtotal || "0") - parseFloat(i.discountTotal || "0")), 0);

    const openInvoices = invoices.filter((i) => i.status === "ISSUED" || i.status === "PARTIALLY_PAID");
    const outstandingReceivables = openInvoices.reduce((sum, i) => sum + parseFloat(i.amountOutstanding || "0"), 0);

    const journalEntries = await this.journalEntryRepo.listByTenant(tenantId);
    let totalDebits = 0;
    let totalCredits = 0;
    for (const entry of journalEntries) {
      const amt = parseFloat(entry.amount || "0");
      if (entry.direction === "DEBIT") {
        totalDebits += amt;
      } else if (entry.direction === "CREDIT") {
        totalCredits += amt;
      }
    }
    const trialBalanceReconciled = Math.abs(totalDebits - totalCredits) < 0.01;

    // 5. Generate Time-Series Chart Data (Bucketed across the window)
    const { revenueChart, utilizationChart } = this.generateTimeSeriesBuckets(
      window.from,
      window.to,
      currency,
      invoices.map((inv) => ({
        issueDate: inv.issueDate,
        totalAmount: parseFloat(inv.total || "0"),
        currency: inv.currency,
      })),
      currentUtil
    );

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
        grossInvoiced,
        netRevenue,
        postedRevenue: typeof postedRevenue.value === "number" ? postedRevenue.value : 0,
        cashReceipts: typeof cashCollections.value === "number" ? cashCollections.value : 0,
        outstandingReceivables,
        trialBalanceReconciled,
      },
      revenueChart,
      utilizationChart,
      recentActivity,
    };
  }

  private generateTimeSeriesBuckets(
    from: string,
    to: string,
    currency: string,
    invoices: Array<{ issueDate: string; totalAmount: number; currency?: string }>,
    currentUtil: number
  ): { revenueChart: TimeSeriesPoint[]; utilizationChart: TimeSeriesPoint[] } {
    const startDate = new Date(from);
    const endDate = new Date(to);
    const dayCount = Math.max(1, Math.min(30, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000)));

    const revenueChart: TimeSeriesPoint[] = [];
    const utilizationChart: TimeSeriesPoint[] = [];

    for (let i = 0; i < dayCount; i++) {
      const bucketDate = new Date(startDate.getTime() + i * 86400000);
      const dateStr = bucketDate.toISOString().split("T")[0];
      const label = bucketDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      const dayRevenue = invoices
        .filter((inv) => inv.issueDate && inv.issueDate.startsWith(dateStr))
        .reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

      revenueChart.push({
        timestamp: bucketDate.toISOString(),
        label,
        value: dayRevenue,
        currency,
      });

      utilizationChart.push({
        timestamp: bucketDate.toISOString(),
        label,
        value: currentUtil,
      });
    }

    return { revenueChart, utilizationChart };
  }
}
