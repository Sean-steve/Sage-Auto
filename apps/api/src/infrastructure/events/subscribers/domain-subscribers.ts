// ============================================================================
// CAR HIRE OS — CANONICAL DOMAIN EVENT SUBSCRIBERS (DEV-010, BRS-002)
// Cross-domain asynchronous choreography: Payments -> Ledger, Rentals -> Fleet, Inspections -> Maintenance
// ============================================================================

import {
  DomainEventEnvelope,
  EVENT_TYPES,
  PaymentSucceededEventData,
  RentalReturnedEventData,
  InspectionCompletedEventData,
  InvoiceIssuedEventData,
} from "@carhire/contracts";
import { IEventSubscriber } from "../event-bus";

/**
 * 1. GENERAL LEDGER SUBSCRIBER
 * Automatically posts double-entry journal entries upon revenue, payment, and return events.
 */
export class GeneralLedgerEventSubscriber implements IEventSubscriber {
  public readonly consumerName = "GeneralLedger.AutoPostingConsumer";
  public readonly eventTypes = [
    EVENT_TYPES.PAYMENT_SUCCEEDED,
    EVENT_TYPES.BILLING_INVOICE_ISSUED,
    EVENT_TYPES.RENTAL_RETURNED,
    EVENT_TYPES.SETTLEMENT_PAYOUT_COMPLETED,
  ] as const;

  public postedJournals: Array<{
    eventId: string;
    eventType: string;
    reference: string;
    amount?: number;
    timestamp: string;
  }> = [];

  public async handle(event: DomainEventEnvelope): Promise<void> {
    switch (event.eventType) {
      case EVENT_TYPES.PAYMENT_SUCCEEDED: {
        const data = event.data as PaymentSucceededEventData;
        this.postedJournals.push({
          eventId: event.eventId,
          eventType: event.eventType,
          reference: `JRN-PAY-${data.paymentNumber || data.paymentId}`,
          amount: data.amount,
          timestamp: new Date().toISOString(),
        });
        break;
      }
      case EVENT_TYPES.BILLING_INVOICE_ISSUED: {
        const data = event.data as InvoiceIssuedEventData;
        this.postedJournals.push({
          eventId: event.eventId,
          eventType: event.eventType,
          reference: `JRN-INV-${data.invoiceNumber || data.invoiceId}`,
          amount: data.totalAmount,
          timestamp: new Date().toISOString(),
        });
        break;
      }
      default: {
        this.postedJournals.push({
          eventId: event.eventId,
          eventType: event.eventType,
          reference: `JRN-${event.aggregate.type}-${event.aggregate.id}`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}

/**
 * 2. FLEET LIFECYCLE SUBSCRIBER
 * Listens for rental returns to update vehicle odometer and trigger turn-around inspections.
 */
export class FleetLifecycleEventSubscriber implements IEventSubscriber {
  public readonly consumerName = "FleetLifecycle.VehicleTurnaroundConsumer";
  public readonly eventTypes = [EVENT_TYPES.RENTAL_RETURNED] as const;

  public vehicleUpdates: Array<{
    vehicleId: string;
    newOdometer: number;
    fuelLevel: number;
    status: string;
  }> = [];

  public async handle(event: DomainEventEnvelope<RentalReturnedEventData>): Promise<void> {
    const data = event.data;
    this.vehicleUpdates.push({
      vehicleId: data.vehicleId,
      newOdometer: data.returnOdometer,
      fuelLevel: data.returnFuelLevel,
      status: "PENDING_INSPECTION",
    });
  }
}

/**
 * 3. MAINTENANCE & DAMAGE SUBSCRIBER
 * Listens for completed inspections: if damage is detected, flags vehicle for maintenance.
 */
export class MaintenanceInspectionSubscriber implements IEventSubscriber {
  public readonly consumerName = "Maintenance.InspectionDamageConsumer";
  public readonly eventTypes = [EVENT_TYPES.INSPECTION_COMPLETED] as const;

  public maintenanceWorkOrders: Array<{
    vehicleId: string;
    inspectionId: string;
    reason: string;
    priority: "HIGH" | "ROUTINE";
  }> = [];

  public async handle(event: DomainEventEnvelope<InspectionCompletedEventData>): Promise<void> {
    const data = event.data;
    if (data.hasDamage || data.damageCount > 0) {
      this.maintenanceWorkOrders.push({
        vehicleId: data.vehicleId,
        inspectionId: data.inspectionId,
        reason: `Inspection reported ${data.damageCount} damage items.`,
        priority: "HIGH",
      });
    }
  }
}

/**
 * 4. INVOICE AUTO-ALLOCATION SUBSCRIBER
 * Listens for successful customer payments and applies them to open invoices.
 */
export class InvoicePaymentAllocationSubscriber implements IEventSubscriber {
  public readonly consumerName = "Billing.PaymentAllocationConsumer";
  public readonly eventTypes = [EVENT_TYPES.PAYMENT_SUCCEEDED] as const;

  public allocatedPayments: Array<{
    paymentId: string;
    obligationId?: string;
    amount: number;
    allocatedAt: string;
  }> = [];

  public async handle(event: DomainEventEnvelope<PaymentSucceededEventData>): Promise<void> {
    const data = event.data;
    this.allocatedPayments.push({
      paymentId: data.paymentId,
      obligationId: data.obligationId,
      amount: data.amount,
      allocatedAt: new Date().toISOString(),
    });
  }
}
