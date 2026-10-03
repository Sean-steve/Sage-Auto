// ============================================================================
// CAR HIRE OS — PLATFORM PROJECTION SERVICE (Sprint 35: DOM-003, DEV-004)
// Generates and manages daily platform SaaS snapshots and real-time read projections
// ============================================================================

import type { PlatformDailySnapshotRecord } from "@carhire/types";
import {
  PlatformSnapshotRepository,
  MrrMovementRepository,
  SubscriptionRepository,
  TenantRepository,
  PlanRepository,
  SaaSBillingInvoiceRepository,
  VehicleRepository,
} from "@carhire/database";
import { PlatformMetricsService } from "./platform-metrics.service";

export interface PlatformProjectionServiceDeps {
  snapshotRepo?: PlatformSnapshotRepository;
  movementRepo?: MrrMovementRepository;
  metricsService?: PlatformMetricsService;
  subscriptionRepo?: SubscriptionRepository;
  tenantRepo?: TenantRepository;
  planRepo?: PlanRepository;
  invoiceRepo?: SaaSBillingInvoiceRepository;
  vehicleRepo?: VehicleRepository;
}

export class PlatformProjectionService {
  private snapshotRepo: PlatformSnapshotRepository;
  private movementRepo: MrrMovementRepository;
  private metricsService: PlatformMetricsService;
  private subscriptionRepo: SubscriptionRepository;
  private tenantRepo: TenantRepository;
  private planRepo: PlanRepository;
  private invoiceRepo: SaaSBillingInvoiceRepository;
  private vehicleRepo: VehicleRepository;

  constructor(
    depsOrSnapshotRepo?: PlatformProjectionServiceDeps | PlatformSnapshotRepository,
    movementRepo?: MrrMovementRepository,
    metricsService?: PlatformMetricsService,
    subscriptionRepo?: SubscriptionRepository,
    tenantRepo?: TenantRepository,
    planRepo?: PlanRepository,
    invoiceRepo?: SaaSBillingInvoiceRepository,
    vehicleRepo?: VehicleRepository
  ) {
    if (depsOrSnapshotRepo && typeof (depsOrSnapshotRepo as any).findByDate !== "function") {
      const deps = depsOrSnapshotRepo as PlatformProjectionServiceDeps;
      this.snapshotRepo = deps.snapshotRepo || new PlatformSnapshotRepository();
      this.movementRepo = deps.movementRepo || new MrrMovementRepository();
      this.metricsService = deps.metricsService || new PlatformMetricsService();
      this.subscriptionRepo = deps.subscriptionRepo || new SubscriptionRepository();
      this.tenantRepo = deps.tenantRepo || new TenantRepository();
      this.planRepo = deps.planRepo || new PlanRepository();
      this.invoiceRepo = deps.invoiceRepo || new SaaSBillingInvoiceRepository();
      this.vehicleRepo = deps.vehicleRepo || new VehicleRepository();
    } else {
      this.snapshotRepo = (depsOrSnapshotRepo as PlatformSnapshotRepository) || new PlatformSnapshotRepository();
      this.movementRepo = movementRepo || new MrrMovementRepository();
      this.metricsService = metricsService || new PlatformMetricsService();
      this.subscriptionRepo = subscriptionRepo || new SubscriptionRepository();
      this.tenantRepo = tenantRepo || new TenantRepository();
      this.planRepo = planRepo || new PlanRepository();
      this.invoiceRepo = invoiceRepo || new SaaSBillingInvoiceRepository();
      this.vehicleRepo = vehicleRepo || new VehicleRepository();
    }
  }

  /**
   * Alias for generateDailySnapshot to support varied caller conventions.
   */
  async takeDailySnapshot(dateString?: string, currency = "KES"): Promise<PlatformDailySnapshotRecord> {
    return this.generateDailySnapshot(dateString, currency);
  }

  /**
   * Generates or updates a frozen daily snapshot for a specified date and currency.
   */
  async generateDailySnapshot(dateString?: string, currency = "KES"): Promise<PlatformDailySnapshotRecord> {
    const today = dateString || new Date().toISOString().split("T")[0];
    const targetCur = currency.toUpperCase();

    const totalMrr = await this.metricsService.calculateTotalMrr(targetCur);
    const totalArr = Math.round(totalMrr * 12 * 100) / 100;

    const totalTenants = await this.metricsService.evaluateMetric("SAAS_TOTAL_TENANTS", targetCur);
    const activePaid = await this.metricsService.evaluateMetric("SAAS_ACTIVE_PAID_TENANTS", targetCur);
    const trial = await this.metricsService.evaluateMetric("SAAS_TRIAL_TENANTS", targetCur);
    const renewalDue = await this.metricsService.evaluateMetric("SAAS_RENEWAL_DUE_TENANTS", targetCur);
    const gracePeriod = await this.metricsService.evaluateMetric("SAAS_GRACE_PERIOD_TENANTS", targetCur);
    const suspended = await this.metricsService.evaluateMetric("SAAS_SUSPENDED_TENANTS", targetCur);
    const cancelled = await this.metricsService.evaluateMetric("SAAS_CANCELLED_TENANTS", targetCur);

    // Delta for the day
    const dayStart = `${today}T00:00:00.000Z`;
    const dayEnd = `${today}T23:59:59.999Z`;
    const delta = await this.movementRepo.getNetMrrDeltaForPeriod(dayStart, dayEnd, targetCur);

    const arpu = activePaid > 0 ? Math.round((totalMrr / activePaid) * 100) / 100 : 0;
    const logoChurn = await this.metricsService.evaluateMetric("SAAS_LOGO_CHURN_RATE", targetCur);
    const nrr = await this.metricsService.evaluateMetric("SAAS_NET_REVENUE_RETENTION", targetCur);

    const totalInvoiced = await this.metricsService.evaluateMetric("SAAS_INVOICED_REVENUE", targetCur);
    const totalCollected = await this.metricsService.evaluateMetric("SAAS_COLLECTED_CASH", targetCur);
    const outstandingAr = await this.metricsService.evaluateMetric("SAAS_OUTSTANDING_AR", targetCur);
    const overdueCount = await this.metricsService.evaluateMetric("SAAS_OVERDUE_INVOICES_COUNT", targetCur);

    const fleetQuota = await this.metricsService.evaluateMetric("SAAS_FLEET_CAPACITY_QUOTA_TOTAL", targetCur);
    const fleetUsed = await this.metricsService.evaluateMetric("SAAS_FLEET_CAPACITY_USED", targetCur);
    const fleetUtil = await this.metricsService.evaluateMetric("SAAS_FLEET_UTILIZATION_PERCENT", targetCur);

    const snapshot = await this.snapshotRepo.upsertDailySnapshot({
      snapshotDate: today,
      currency: targetCur,
      totalTenants,
      activePaidTenants: activePaid,
      trialTenants: trial,
      renewalDueTenants: renewalDue,
      gracePeriodTenants: gracePeriod,
      suspendedTenants: suspended,
      cancelledTenants: cancelled,
      totalMrr,
      totalArr,
      newMrr: delta.newMrr,
      expansionMrr: delta.expansionMrr,
      contractionMrr: delta.contractionMrr,
      churnMrr: delta.churnMrr,
      reactivationMrr: delta.reactivationMrr,
      netMrrDelta: delta.netMrrDelta,
      arpu,
      logoChurnRate: logoChurn,
      netRevenueRetention: nrr,
      trialConversionRate: 25.0, // baseline rate
      totalInvoiced,
      totalCollected,
      outstandingAr,
      overdueInvoicesCount: overdueCount,
      paymentFailureRate: 0.0,
      totalFleetCapacityAllotted: fleetQuota,
      totalFleetCapacityUsed: fleetUsed,
      fleetCapacityUtilizationRate: fleetUtil,
    });

    return snapshot;
  }

  /**
   * Retrieves snapshots for a date range.
   */
  async getDailySnapshots(from: string, to: string, currency = "KES"): Promise<PlatformDailySnapshotRecord[]> {
    return this.snapshotRepo.getDailySnapshots(from, to, currency);
  }
}
