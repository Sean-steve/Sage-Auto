// ============================================================================
// CAR HIRE OS — BOOKING DOMAIN EVENTS (DEV-004, DEV-006, BRS-001)
// Bounded Context: Bookings & Reservations
// ============================================================================

import type { Booking, BookingStatus, PricingSnapshot, VehicleSubstitution } from "@carhire/types";

export interface BookingEventBase {
  eventId: string;
  eventType: string;
  aggregateId: string;
  aggregateType: "Booking";
  tenantId: string;
  occurredAt: string;
  actorId: string;
  actorType: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT";
}

export interface BookingCreatedEvent extends BookingEventBase {
  eventType: "BookingCreated";
  payload: {
    bookingId: string;
    bookingNumber: string;
    customerId: string;
    corporateAccountId?: string | null;
    primaryDriverId?: string | null;
    agentId?: string | null;
    requestedVehicleId?: string | null;
    assignedVehicleId?: string | null;
    pickupAt: string;
    returnAt: string;
    pickupLocation: string;
    returnLocation: string;
    source: string;
    initialStatus: BookingStatus;
    grossTotal: number;
    currency: string;
  };
}

export interface BookingQuotedEvent extends BookingEventBase {
  eventType: "BookingQuoted";
  payload: {
    bookingId: string;
    bookingNumber: string;
    pricingSnapshot: PricingSnapshot;
    grossTotal: number;
    currency: string;
  };
}

export interface BookingAwaitingPaymentEvent extends BookingEventBase {
  eventType: "BookingAwaitingPayment";
  payload: {
    bookingId: string;
    bookingNumber: string;
    grossTotal: number;
    depositRequired: number;
    currency: string;
  };
}

export interface BookingConfirmedEvent extends BookingEventBase {
  eventType: "BookingConfirmed";
  payload: {
    bookingId: string;
    bookingNumber: string;
    assignedVehicleId: string;
    allocationId: string;
    pickupAt: string;
    returnAt: string;
    customerId: string;
    primaryDriverId?: string | null;
    grossTotal: number;
    depositRequired: number;
  };
}

export interface BookingActivatedEvent extends BookingEventBase {
  eventType: "BookingActivated";
  payload: {
    bookingId: string;
    bookingNumber: string;
    rentalId?: string;
    assignedVehicleId: string;
    activatedAt: string;
  };
}

export interface BookingCompletedEvent extends BookingEventBase {
  eventType: "BookingCompleted";
  payload: {
    bookingId: string;
    bookingNumber: string;
    completedAt: string;
  };
}

export interface BookingCancelledEvent extends BookingEventBase {
  eventType: "BookingCancelled";
  payload: {
    bookingId: string;
    bookingNumber: string;
    reason: string;
    cancellationFeeCharged?: number;
    releasedAllocationId?: string | null;
  };
}

export interface BookingRejectedEvent extends BookingEventBase {
  eventType: "BookingRejected";
  payload: {
    bookingId: string;
    bookingNumber: string;
    reason: string;
  };
}

export interface BookingExpiredEvent extends BookingEventBase {
  eventType: "BookingExpired";
  payload: {
    bookingId: string;
    bookingNumber: string;
    reason?: string;
  };
}

export interface BookingMarkedNoShowEvent extends BookingEventBase {
  eventType: "BookingMarkedNoShow";
  payload: {
    bookingId: string;
    bookingNumber: string;
    reason?: string;
    penaltyFeeCharged?: number;
  };
}

export interface BookingVehicleSubstitutedEvent extends BookingEventBase {
  eventType: "BookingVehicleSubstituted";
  payload: {
    bookingId: string;
    bookingNumber: string;
    substitution: VehicleSubstitution;
    newAllocationId?: string;
  };
}

export interface BookingDatesAmendedEvent extends BookingEventBase {
  eventType: "BookingDatesAmended";
  payload: {
    bookingId: string;
    bookingNumber: string;
    oldPickupAt: string;
    oldReturnAt: string;
    newPickupAt: string;
    newReturnAt: string;
    pricingRecalculated: boolean;
  };
}

export type BookingDomainEvent =
  | BookingCreatedEvent
  | BookingQuotedEvent
  | BookingAwaitingPaymentEvent
  | BookingConfirmedEvent
  | BookingActivatedEvent
  | BookingCompletedEvent
  | BookingCancelledEvent
  | BookingRejectedEvent
  | BookingExpiredEvent
  | BookingMarkedNoShowEvent
  | BookingVehicleSubstitutedEvent
  | BookingDatesAmendedEvent;
