// ============================================================================
// CAR HIRE OS — BOOKING EXPIRY & HOLD RECLAMATION JOB (DEV-011, BRS-003)
// Scans unconfirmed reservations past grace period, releases locks, enqueues outbox event
// ============================================================================

import { CommandJobPayload, EVENT_TYPES } from "@carhire/contracts";
import { BookingRepository, OutboxRepository, VehicleAllocationRepository } from "@carhire/database";

export interface BookingExpiryJobData {
  tenantId?: string;
  gracePeriodMinutes?: number;
  now?: string;
}

export interface BookingExpiryResult {
  scanned: number;
  expiredCount: number;
  releasedHolds: number;
  status: "completed";
}

export async function processBookingExpiry(
  data: BookingExpiryJobData = { gracePeriodMinutes: 30 }
): Promise<BookingExpiryResult> {
  const bookingRepo = new BookingRepository();
  const outboxRepo = new OutboxRepository();
  const allocationRepo = new VehicleAllocationRepository();

  const now = data.now ? new Date(data.now) : new Date();
  const gracePeriodMinutes = data.gracePeriodMinutes ?? 30;
  const cutoffTime = new Date(now.getTime() - gracePeriodMinutes * 60 * 1000);

  let expiredCount = 0;
  let releasedHolds = 0;

  // Search unconfirmed bookings across tenants or specified tenant
  const tenants: string[] = data.tenantId ? [data.tenantId] : Array.from((BookingRepository as any).store?.keys() || []);

  for (const tenantId of tenants) {
    try {
      const { items } = await bookingRepo.findMany(tenantId, {
        status: "DRAFT" as any,
        limit: 100,
      });

      for (const booking of items) {
        const createdAt = new Date(booking.createdAt);
        if (createdAt < cutoffTime && (booking.status === "DRAFT" || (booking as any).status === "PROVISIONAL")) {
          // Update status to EXPIRED / CANCELLED
          await bookingRepo.update(booking.id, tenantId, {
            status: "CANCELLED" as any,
            cancellationReason: `Hold expired after ${gracePeriodMinutes} minutes grace period`,
          });
          try {
            await bookingRepo.appendStatusHistory(tenantId, {
              bookingId: booking.id,
              tenantId,
              fromStatus: booking.status,
              toStatus: "CANCELLED" as any,
              actorType: "SYSTEM",
              actorId: "canonical-scheduler",
              reason: `Hold expired after ${gracePeriodMinutes} minutes grace period`,
              occurredAt: now.toISOString(),
            });
          } catch {
            // Optional history append
          }

          // Release vehicle allocation hold
          if (booking.vehicleId) {
            try {
              const allocations = await allocationRepo.findBySource("BOOKING", booking.id, tenantId);
              for (const alloc of allocations) {
                if (alloc.status === "HELD" || alloc.status === "CONFIRMED") {
                  await allocationRepo.releaseAllocation(alloc.id, tenantId, "Hold expired");
                  releasedHolds++;
                }
              }
            } catch {
              // Non-blocking if allocation was already released
            }
          }

          // Enqueue canonical domain event into transactional outbox
          await outboxRepo.record({
            eventType: EVENT_TYPES.BOOKING_RESERVATION_EXPIRED,
            aggregateType: "Booking",
            aggregateId: booking.id,
            tenantId,
            source: "carhire.worker.booking-expiry",
            correlationId: crypto.randomUUID(),
            payload: {
              bookingId: booking.id,
              bookingNumber: booking.bookingNumber,
              vehicleId: booking.vehicleId,
              expiredAt: now.toISOString(),
              reason: "Hold grace period exceeded",
            },
          });

          expiredCount++;
        }
      }
    } catch (err) {
      console.error(`[Worker:BookingExpiry] Error scanning bookings for tenant ${tenantId}:`, err);
    }
  }

  return {
    scanned: tenants.length,
    expiredCount,
    releasedHolds,
    status: "completed",
  };
}

/**
 * Worker Command Handler invoked by the Background Execution Platform.
 */
export async function handleExpireBookingsCommand(command: CommandJobPayload<BookingExpiryJobData>): Promise<BookingExpiryResult> {
  const data: BookingExpiryJobData = {
    ...command.data,
    tenantId: command.tenantId || command.data?.tenantId,
  };
  return processBookingExpiry(data);
}
