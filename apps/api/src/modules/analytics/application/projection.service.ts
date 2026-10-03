// ============================================================================
// CAR HIRE OS — REPORTING PROJECTION SERVICE (Sprint 34: DOM-003, DATA-002)
// Event-driven projection handler maintaining ReportingDailySnapshot read models
// ============================================================================

import type { ReportingDailySnapshot } from "@carhire/types";
import { ReportingProjectionRepository } from "@carhire/database";

export interface DomainEventPayload {
  id: string;
  type: string;
  tenantId: string;
  occurredAt: string;
  data: Record<string, any>;
}

export class ReportingProjectionService {
  private static readonly CONSUMER_ID = "ReportingProjectionService";
  private static readonly processedEvents = new Set<string>();

  constructor(
    private readonly projectionRepo: ReportingProjectionRepository = new ReportingProjectionRepository()
  ) {}

  /**
   * Resets idempotent event tracking (for test suite isolation)
   */
  public static clear(): void {
    ReportingProjectionService.processedEvents.clear();
  }

  /**
   * Idempotently projects domain events into daily reporting snapshot read models
   */
  async handleDomainEvent(event: DomainEventPayload): Promise<boolean> {
    const dedupeKey = `${ReportingProjectionService.CONSUMER_ID}:${event.tenantId}:${event.id}`;
    if (ReportingProjectionService.processedEvents.has(dedupeKey)) {
      // Event already processed idempotently
      return false;
    }

    const date = (event.occurredAt || new Date().toISOString()).split("T")[0];
    const currency = event.data?.currency || "KES";

    // Retrieve or seed current snapshot for tenant and date
    const existingSnapshots = await this.projectionRepo.getDailySnapshots(
      event.tenantId,
      date,
      date,
      currency
    );

    const snapshot: Omit<ReportingDailySnapshot, "id" | "updatedAt"> = existingSnapshots[0]
      ? { ...existingSnapshots[0] }
      : {
          tenantId: event.tenantId,
          date,
          currency,
          totalVehicles: 0,
          activeVehicles: 0,
          availableVehicles: 0,
          onRentVehicles: 0,
          maintenanceVehicles: 0,
          utilizationRate: 0,
          bookingCreatedCount: 0,
          bookingConfirmedCount: 0,
          bookingCancelledCount: 0,
          bookingContractualValue: 0,
          rentalsStarted: 0,
          rentalsCompleted: 0,
          rentalDaysBilled: 0,
          grossInvoiced: 0,
          taxInvoiced: 0,
          discountTotal: 0,
          netInvoicedRevenue: 0,
          postedRevenue: 0,
          cashReceipts: 0,
          totalExpenses: 0,
          leadsCreated: 0,
          leadsConverted: 0,
          quotesCreated: 0,
          quotesAccepted: 0,
          lastAppliedEventId: event.id,
        };

    // Apply incremental domain projection deltas
    switch (event.type) {
      case "booking.created": {
        snapshot.bookingCreatedCount += 1;
        snapshot.bookingContractualValue += event.data?.grossTotal || 0;
        break;
      }
      case "booking.confirmed": {
        snapshot.bookingConfirmedCount += 1;
        break;
      }
      case "booking.cancelled": {
        snapshot.bookingCancelledCount += 1;
        break;
      }
      case "rental.dispatched": {
        snapshot.rentalsStarted += 1;
        snapshot.onRentVehicles += 1;
        if (snapshot.availableVehicles > 0) snapshot.availableVehicles -= 1;
        break;
      }
      case "rental.returned": {
        snapshot.rentalsCompleted += 1;
        if (snapshot.onRentVehicles > 0) snapshot.onRentVehicles -= 1;
        snapshot.availableVehicles += 1;
        break;
      }
      case "invoice.issued": {
        snapshot.grossInvoiced += event.data?.totalAmount || 0;
        snapshot.netInvoicedRevenue += (event.data?.subtotal || 0) - (event.data?.discountAmount || 0);
        break;
      }
      case "payment.completed": {
        snapshot.cashReceipts += event.data?.amount || 0;
        break;
      }
      case "ledger.posted": {
        if (event.data?.accountType === "REVENUE") {
          snapshot.postedRevenue += (event.data?.credit || 0) - (event.data?.debit || 0);
        }
        break;
      }
      default:
        break;
    }

    // Recalculate utilization percentage
    if (snapshot.activeVehicles > 0) {
      snapshot.utilizationRate = Math.round((snapshot.onRentVehicles / snapshot.activeVehicles) * 1000) / 10;
    }

    await this.projectionRepo.upsertDailySnapshot(snapshot);
    ReportingProjectionService.processedEvents.add(dedupeKey);
    return true;
  }
}
