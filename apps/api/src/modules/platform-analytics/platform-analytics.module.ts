// ============================================================================
// CAR HIRE OS — PLATFORM ANALYTICS MODULE (Sprint 35: DOM-003, DEV-004)
// High-performance bounded context for Platform SaaS Analytics, MRR Intelligence,
// Cohort Matrix Decomposition, and Systemic Telemetry
// ============================================================================

import { Router } from "express";
import {
  SubscriptionRepository,
  PlanRepository,
  TenantRepository,
  SaaSBillingInvoiceRepository,
  VehicleRepository,
  TenantMembershipRepository,
  PlatformSnapshotRepository,
  MrrMovementRepository,
  PlatformCohortRepository,
  PlatformReportRepository,
} from "@carhire/database";
import { PlatformMetricsService } from "./application/platform-metrics.service";
import { MrrMovementService } from "./application/mrr-movement.service";
import { PlatformCohortService } from "./application/platform-cohort.service";
import { PlatformReportingService } from "./application/platform-reporting.service";
import { PlatformExportService } from "./application/platform-export.service";
import { PlatformProjectionService } from "./application/platform-projection.service";
import { PlatformBackfillService } from "./application/platform-backfill.service";
import { PlatformReconciliationService } from "./application/platform-reconciliation.service";
import { createPlatformAnalyticsController } from "./presentation/platform-analytics.controller";
import { EventBus } from "../../infrastructure/events/event-bus";

export interface PlatformAnalyticsModuleOptions {
  eventBus?: EventBus;
}

export class PlatformAnalyticsModule {
  public readonly metricsService: PlatformMetricsService;
  public readonly movementService: MrrMovementService;
  public readonly cohortService: PlatformCohortService;
  public readonly reportingService: PlatformReportingService;
  public readonly exportService: PlatformExportService;
  public readonly projectionService: PlatformProjectionService;
  public readonly backfillService: PlatformBackfillService;
  public readonly reconciliationService: PlatformReconciliationService;
  public readonly router: Router;

  constructor(options: PlatformAnalyticsModuleOptions = {}) {
    const subscriptionRepo = new SubscriptionRepository();
    const planRepo = new PlanRepository();
    const tenantRepo = new TenantRepository();
    const invoiceRepo = new SaaSBillingInvoiceRepository();
    const vehicleRepo = new VehicleRepository();
    const membershipRepo = new TenantMembershipRepository();

    const snapshotRepo = new PlatformSnapshotRepository();
    const movementRepo = new MrrMovementRepository();
    const cohortRepo = new PlatformCohortRepository();
    const reportRepo = new PlatformReportRepository();

    this.metricsService = new PlatformMetricsService(
      subscriptionRepo,
      planRepo,
      tenantRepo,
      invoiceRepo,
      vehicleRepo,
      membershipRepo,
      movementRepo,
      snapshotRepo
    );

    this.movementService = new MrrMovementService(movementRepo, this.metricsService);

    this.cohortService = new PlatformCohortService(
      cohortRepo,
      subscriptionRepo,
      tenantRepo,
      planRepo,
      this.metricsService
    );

    this.reportingService = new PlatformReportingService(
      reportRepo,
      this.metricsService,
      this.cohortService,
      subscriptionRepo,
      planRepo,
      tenantRepo,
      invoiceRepo,
      movementRepo
    );

    this.exportService = new PlatformExportService();

    this.projectionService = new PlatformProjectionService(
      snapshotRepo,
      movementRepo,
      this.metricsService,
      subscriptionRepo,
      tenantRepo,
      planRepo,
      invoiceRepo,
      vehicleRepo
    );

    this.backfillService = new PlatformBackfillService(
      this.projectionService,
      this.cohortService
    );

    this.reconciliationService = new PlatformReconciliationService(
      subscriptionRepo,
      planRepo,
      invoiceRepo,
      this.metricsService
    );

    // Event Bus Integration for Automatic MRR Movement & Daily Projection Updates
    if (options.eventBus) {
      options.eventBus.subscribe({
        consumerName: "PlatformAnalyticsSubscriber",
        eventTypes: [
          "subscription.created",
          "subscription.activated",
          "subscription.renewed",
          "subscription.plan_changed",
          "subscription.cancelled",
          "subscription.suspended",
          "saas_invoice.paid",
          "tenant.created",
        ],
        handle: async (event) => {
          const eventName = event.eventType;
          try {
            if (eventName.startsWith("subscription.")) {
              const data = event.data || {};
              await this.movementService.recordSubscriptionTransition({
                tenantId: event.tenantId || data.tenantId || "platform",
                tenantName: data.tenantName || `Tenant ${event.tenantId}`,
                subscriptionId: data.subscriptionId || event.aggregate?.id || event.eventId,
                previousStatus: data.previousStatus,
                newStatus: data.newStatus || data.status || "ACTIVE",
                previousAmount: data.previousAmount,
                newAmount: data.amount || data.newAmount || 0,
                previousPlanCode: data.previousPlanCode,
                newPlanCode: data.planCode || data.newPlanCode,
                billingInterval: data.billingInterval || data.billingCycle || "MONTHLY",
                currency: data.currency || "KES",
                reason: data.reason || eventName,
                occurredAt: event.occurredAt || new Date().toISOString(),
              });
            }

            // Refresh snapshot for today
            await this.projectionService.generateDailySnapshot(undefined, event.data?.currency || "KES");
          } catch (err) {
            console.error(`Error processing platform analytics event ${eventName}:`, err);
          }
        },
      });
    }

    // Presentation Layer Routing
    const controller = createPlatformAnalyticsController(
      this.metricsService,
      this.movementService,
      this.cohortService,
      this.reportingService,
      this.exportService,
      this.reconciliationService,
      this.backfillService
    );

    this.router = Router();
    this.router.get("/overview", (req, res) => controller.getExecutiveOverview(req, res));
    this.router.get("/metrics", (req, res) => controller.listMetricDefinitions(req, res));
    this.router.get("/metrics/:key", (req, res) => controller.getMetric(req, res));
    this.router.get("/mrr-movements", (req, res) => controller.getMrrMovements(req, res));
    this.router.get("/cohorts", (req, res) => controller.getCohorts(req, res));
    this.router.get("/plans", (req, res) => controller.getPlanPerformance(req, res));
    this.router.get("/billing-health", (req, res) => controller.getBillingHealth(req, res));
    this.router.get("/reports", (req, res) => controller.listReports(req, res));
    this.router.post("/reports/execute", (req, res) => controller.executeReport(req, res));
    this.router.post("/reports/export", (req, res) => controller.exportReport(req, res));
    this.router.post("/reconcile", (req, res) => controller.reconcile(req, res));
    this.router.post("/backfill", (req, res) => controller.backfill(req, res));
  }
}
