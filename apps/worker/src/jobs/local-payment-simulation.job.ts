// ============================================================================
// SAGE AUTO — LOCAL PAYMENT SIMULATION WORKER
// Development-only helper for exercising the real Booking confirmation lifecycle.
// Never enabled in staging or production.
// ============================================================================

import type { CommandJobPayload } from "@carhire/contracts";
import { BookingRepository, TenantRepository } from "@carhire/database";
import { BookingService } from "../../../api/src/modules/bookings/application/booking.service";

export interface LocalPaymentSimulationJobData {
  tenantId?: string;
  autoConfirm?: boolean;
  settleDeposit?: boolean;
  maxBookings?: number;
}

export interface LocalPaymentSimulationResult {
  scanned: number;
  paid: number;
  depositsHeld: number;
  confirmed: number;
  skipped: number;
  failed: number;
  failures: Array<{ bookingNumber: string; message: string }>;
  status: "completed" | "disabled";
}

function isProductionLike(): boolean {
  const env = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();
  return env === "production" || env === "staging";
}

function isEnabled(): boolean {
  return process.env.LOCAL_PAYMENT_WORKER_ENABLED === "true";
}

export async function processLocalPaymentSimulation(
  data: LocalPaymentSimulationJobData = {}
): Promise<LocalPaymentSimulationResult> {
  if (isProductionLike()) {
    throw new Error("Local payment simulation is forbidden in staging and production.");
  }
  if (!isEnabled()) {
    return {
      scanned: 0,
      paid: 0,
      depositsHeld: 0,
      confirmed: 0,
      skipped: 0,
      failed: 0,
      failures: [],
      status: "disabled",
    };
  }

  const tenantRepo = new TenantRepository();
  const bookingRepo = new BookingRepository();
  const bookingService = new BookingService();
  const autoConfirm = data.autoConfirm ?? process.env.LOCAL_PAYMENT_WORKER_AUTO_CONFIRM !== "false";
  const settleDeposit = data.settleDeposit ?? process.env.LOCAL_PAYMENT_WORKER_SETTLE_DEPOSIT !== "false";
  const maxBookings = Math.max(1, data.maxBookings ?? Number(process.env.LOCAL_PAYMENT_WORKER_BATCH_SIZE || 25));
  const tenants = data.tenantId
    ? [data.tenantId]
    : (await tenantRepo.listAll()).filter((tenant) => !tenant.deletedAt).map((tenant) => tenant.id);

  const result: LocalPaymentSimulationResult = {
    scanned: 0,
    paid: 0,
    depositsHeld: 0,
    confirmed: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    status: "completed",
  };

  for (const tenantId of tenants) {
    if (result.scanned >= maxBookings) break;

    const candidates = new Map<string, any>();
    for (const status of ["PENDING_CONFIRMATION", "AWAITING_PAYMENT", "QUOTED", "CONFIRMED"] as const) {
      const page = await bookingRepo.findMany(tenantId, { status: status as any, limit: maxBookings });
      for (const booking of page.items) candidates.set(booking.id, booking);
    }

    for (const original of candidates.values()) {
      if (result.scanned >= maxBookings) break;
      result.scanned++;

      try {
        let booking = await bookingService.getBooking(tenantId, original.id);
        const actor = {
          userId: "local-payment-worker",
          actorType: "SYSTEM" as const,
          name: "Local Payment Worker",
        };

        if (booking.paymentStatus !== "FULLY_PAID") {
          const grossTotal = Number(booking.grossTotal || 0);
          const alreadyPaid = Number(booking.amountPaid || 0);
          const remaining = Math.max(0, grossTotal - alreadyPaid);

          if (remaining > 0.0001) {
            booking = await bookingService.simulatePayment(
              tenantId,
              booking.id,
              {
                amount: remaining,
                paymentType: "RENTAL_CHARGE",
                paymentMethod: "CASH",
                transactionReference: `LOCAL-${booking.bookingNumber}-${Date.now()}`,
              },
              actor
            );
            result.paid++;
          } else {
            booking = await bookingRepo.update(
              booking.id,
              tenantId,
              { paymentStatus: "FULLY_PAID" },
              booking.version
            );
            result.paid++;
          }
        }

        if (
          settleDeposit &&
          Number(booking.depositRequired || 0) > 0 &&
          booking.depositStatus !== "HELD"
        ) {
          booking = await bookingService.simulatePayment(
            tenantId,
            booking.id,
            {
              amount: Number(booking.depositRequired),
              paymentType: "SECURITY_DEPOSIT",
              paymentMethod: "CASH",
              transactionReference: `LOCAL-DEPOSIT-${booking.bookingNumber}-${Date.now()}`,
            },
            actor
          );
          result.depositsHeld++;
        }

        if (
          autoConfirm &&
          booking.status !== "CONFIRMED" &&
          booking.paymentStatus === "FULLY_PAID" &&
          ["PENDING_CONFIRMATION", "AWAITING_PAYMENT", "QUOTED"].includes(booking.status)
        ) {
          booking = await bookingService.confirmBooking(
            tenantId,
            booking.id,
            {
              reason: "Local payment worker confirmed fully-paid development booking",
              expectedVersion: booking.version,
            },
            actor
          );
          result.confirmed++;
        } else if (
          booking.paymentStatus === "FULLY_PAID" &&
          (Number(booking.depositRequired || 0) === 0 || booking.depositStatus === "HELD") &&
          booking.status === "CONFIRMED"
        ) {
          result.skipped++;
        }
      } catch (error: any) {
        result.failed++;
        result.failures.push({
          bookingNumber: original.bookingNumber || original.id,
          message: error?.message || String(error),
        });
      }
    }
  }

  if (result.scanned > 0) {
    console.log(
      `[Worker:LocalPayment] scanned=${result.scanned} paid=${result.paid} deposits=${result.depositsHeld} confirmed=${result.confirmed} failed=${result.failed}`
    );
  }

  return result;
}

export async function handleSimulateLocalPaymentsCommand(
  command: CommandJobPayload<LocalPaymentSimulationJobData>
): Promise<LocalPaymentSimulationResult> {
  return processLocalPaymentSimulation({
    ...command.data,
    tenantId: command.tenantId || command.data?.tenantId,
  });
}
