// ============================================================================
// CAR HIRE OS — ANALYTICS & REPORTING MODULE (Sprint 34: DOM-003, DEV-009)
// Bounded Context: Tenant Analytics, Metric Registry, KPI Engine, Financial Reports
// ============================================================================

import { Router } from "express";
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
  ReportExecutionRepository,
  SavedReportRepository,
  ReportScheduleRepository,
  ReportingProjectionRepository,
} from "@carhire/database";
import { MetricsService } from "./application/metrics.service";
import { DashboardService } from "./application/dashboard.service";
import { ReportingService } from "./application/reporting.service";
import { ReportExportService } from "./application/report-export.service";
import { ReportingProjectionService } from "./application/projection.service";
import { ReconciliationService } from "./application/reconciliation.service";
import { BackfillService } from "./application/backfill.service";
import { ReportScheduleService } from "./application/report-schedule.service";
import { createAnalyticsController } from "./presentation/analytics.controller";
import { createReportsController } from "./presentation/reports.controller";
import { EventBus } from "../../infrastructure/events/event-bus";

export interface AnalyticsModuleOptions {
  eventBus?: EventBus;
}

export class AnalyticsModule {
  public readonly metricsService: MetricsService;
  public readonly dashboardService: DashboardService;
  public readonly reportingService: ReportingService;
  public readonly reportExportService: ReportExportService;
  public readonly projectionService: ReportingProjectionService;
  public readonly reconciliationService: ReconciliationService;
  public readonly backfillService: BackfillService;
  public readonly scheduleService: ReportScheduleService;

  public readonly analyticsRouter: Router;
  public readonly reportsRouter: Router;

  constructor(options: AnalyticsModuleOptions = {}) {
    // Repositories
    const vehicleRepo = new VehicleRepository();
    const bookingRepo = new BookingRepository();
    const rentalRepo = new RentalRepository();
    const paymentRepo = new PaymentRepository();
    const invoiceRepo = new OperationalInvoiceRepository();
    const journalEntryRepo = new JournalEntryRepository();
    const journalTxRepo = new JournalTransactionRepository();
    const leadRepo = new LeadRepository();
    const quoteRepo = new SalesQuoteRepository();
    const maintenanceRepo = new MaintenanceRepository();
    const complianceRepo = new ComplianceRecordRepository();
    const customerRepo = new CustomerRepository();
    const corporateRepo = new CorporateAccountRepository();
    const depositRepo = new DepositPositionRepository();
    const refundRepo = new RefundRepository();
    const settlementRepo = new OwnerSettlementRepository();

    const reportExecutionRepo = new ReportExecutionRepository();
    const savedReportRepo = new SavedReportRepository();
    const reportScheduleRepo = new ReportScheduleRepository();
    const projectionRepo = new ReportingProjectionRepository();

    // Application Services
    this.metricsService = new MetricsService(
      vehicleRepo,
      bookingRepo,
      rentalRepo,
      paymentRepo,
      invoiceRepo,
      journalEntryRepo,
      journalTxRepo,
      leadRepo,
      quoteRepo,
      maintenanceRepo,
      complianceRepo,
      customerRepo,
      corporateRepo,
      depositRepo,
      refundRepo,
      settlementRepo
    );

    this.dashboardService = new DashboardService(
      this.metricsService,
      vehicleRepo,
      bookingRepo,
      rentalRepo,
      paymentRepo,
      invoiceRepo,
      leadRepo,
      quoteRepo,
      complianceRepo,
      journalEntryRepo
    );

    this.reportingService = new ReportingService(
      vehicleRepo,
      bookingRepo,
      rentalRepo,
      invoiceRepo,
      paymentRepo,
      journalEntryRepo,
      settlementRepo,
      maintenanceRepo,
      complianceRepo,
      leadRepo,
      customerRepo
    );

    this.reportExportService = new ReportExportService(
      reportExecutionRepo,
      this.reportingService
    );

    this.projectionService = new ReportingProjectionService(projectionRepo);

    this.reconciliationService = new ReconciliationService(
      journalEntryRepo,
      paymentRepo,
      invoiceRepo,
      settlementRepo
    );

    this.backfillService = new BackfillService(
      projectionRepo,
      vehicleRepo,
      bookingRepo,
      rentalRepo,
      invoiceRepo,
      paymentRepo
    );

    this.scheduleService = new ReportScheduleService(
      reportScheduleRepo,
      this.reportExportService
    );

    // Event Bus Subscription for Projection
    if (options.eventBus) {
      options.eventBus.subscribe({
        consumerName: "TenantReportingProjectionSubscriber",
        eventTypes: [
          "booking.created",
          "booking.confirmed",
          "booking.cancelled",
          "rental.dispatched",
          "rental.returned",
          "invoice.issued",
          "payment.completed",
          "ledger.posted",
        ],
        handle: async (event) => {
          if (!event.tenantId) return;
          await this.projectionService.handleDomainEvent({
            id: event.eventId || `evt-${Date.now()}`,
            type: event.eventType,
            tenantId: event.tenantId,
            occurredAt: event.occurredAt || new Date().toISOString(),
            data: event.data || {},
          });
        },
      });
    }

    // Controllers
    const analyticsController = createAnalyticsController(
      this.dashboardService,
      this.metricsService,
      this.reconciliationService,
      this.backfillService
    );

    const reportsController = createReportsController(
      this.reportingService,
      this.reportExportService,
      this.scheduleService,
      savedReportRepo
    );

    // Express Routers
    this.analyticsRouter = Router();
    this.analyticsRouter.get("/dashboard", (req, res) => analyticsController.getDashboardOverview(req, res));
    this.analyticsRouter.get("/metrics", (req, res) => analyticsController.listMetricDefinitions(req, res));
    this.analyticsRouter.get("/metrics/:key", (req, res) => analyticsController.getMetric(req, res));
    this.analyticsRouter.post("/metrics/batch", (req, res) => analyticsController.evaluateBatchMetrics(req, res));
    this.analyticsRouter.get("/reconciliation", (req, res) => analyticsController.getFinancialReconciliation(req, res));
    this.analyticsRouter.post("/backfill", (req, res) => analyticsController.runBackfill(req, res));

    this.reportsRouter = Router();
    this.reportsRouter.get("/catalogue", (req, res) => reportsController.getCatalogue(req, res));
    this.reportsRouter.get("/catalogue/:key", (req, res) => reportsController.getReportDefinition(req, res));
    this.reportsRouter.get("/query/:key", (req, res) => reportsController.queryReport(req, res));
    this.reportsRouter.post("/export/:key", (req, res) => reportsController.exportReport(req, res));
    this.reportsRouter.get("/executions", (req, res) => reportsController.listExecutions(req, res));
    this.reportsRouter.get("/executions/:id", (req, res) => reportsController.getExecution(req, res));
    this.reportsRouter.get("/executions/:id/download", (req, res) => reportsController.downloadExecution(req, res));
    this.reportsRouter.get("/saved", (req, res) => reportsController.listSavedReports(req, res));
    this.reportsRouter.post("/saved", (req, res) => reportsController.createSavedReport(req, res));
    this.reportsRouter.delete("/saved/:id", (req, res) => reportsController.deleteSavedReport(req, res));
    this.reportsRouter.get("/schedules", (req, res) => reportsController.listSchedules(req, res));
    this.reportsRouter.post("/schedules", (req, res) => reportsController.createSchedule(req, res));
    this.reportsRouter.delete("/schedules/:id", (req, res) => reportsController.deleteSchedule(req, res));
  }
}
