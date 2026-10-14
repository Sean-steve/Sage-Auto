// ============================================================================
// SAGE AUTO — LOCAL PAYMENT SIMULATION WORKER
// Development-only helper for exercising the real Booking confirmation lifecycle.
// Never enabled in staging or production.
// ============================================================================

import type { CommandJobPayload } from "@carhire/contracts";
import {
  BookingRepository, TenantRepository, PaymentAttemptRepository, PaymentRepository,
  PaymentAllocationRepository, RefundRepository, PaymentReconciliationRepository,
  WebhookRepository, OperationalInvoiceRepository, DepositPositionRepository,
  OwnerSettlementRepository, AuditRepository, OutboxRepository,
} from "@carhire/database";
import { PaymentService } from "../../../api/src/modules/payments/application/payment.service";
import { PaymentProviderRegistry } from "../../../api/src/modules/payments/infrastructure/providers/provider-registry";
import { FakePaymentProvider } from "../../../api/src/modules/payments/infrastructure/providers/fake-payment-provider";
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
  return ["NODE_ENV", "APP_ENV"].some(key =>
    ["production","staging"].includes((process.env[key] || "").toLowerCase())
  );
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
  const providerRegistry = new PaymentProviderRegistry();
  // The fake provider is deliberately registered ONLY inside the opted-in,
  // dev/test-only worker; production payment modules never gain a fake fallback.
  const fakeProvider = new FakePaymentProvider();
  providerRegistry.register(fakeProvider);
  const paymentService = new PaymentService(
    new PaymentAttemptRepository(), new PaymentRepository(),
    new PaymentAllocationRepository(), new RefundRepository(),
    new PaymentReconciliationRepository(), providerRegistry,
    new WebhookRepository(), new OperationalInvoiceRepository(),
    new DepositPositionRepository(), new OwnerSettlementRepository(),
    new AuditRepository(), new OutboxRepository(), bookingRepo
  );
  const depositRepo = new DepositPositionRepository();
  const paymentRepo = new PaymentRepository();
  const attemptRepo = new PaymentAttemptRepository();

  // Retry-safe local provider flow. Never infer settlement from a booking flag:
  // verification creates the Payment and canonical allocation funds deposits.
  async function settleLocalObligation(
    tenantId: string, booking: any, purpose: "CUSTOMER_INVOICE" | "RENTAL_DEPOSIT",
    amount: number
  ): Promise<void> {
    const key = `sage-local:${tenantId}:${booking.id}:${purpose}:${amount.toFixed(4)}`;
    const actor = {userId:"local-payment-worker",tenantId};
    let attempt = await attemptRepo.findByIntentReference(key,tenantId);
    if (!attempt) {
      attempt = await paymentService.initiatePaymentAttempt(tenantId,{
        provider:"FAKE_PROVIDER",purpose,targetId:booking.id,
        amount:amount.toFixed(4),currency:booking.currency || "KES",
        customerId:booking.customerId,idempotencyKey:key,
        metadata:{localSimulation:true,source:"development-worker"},
      },actor);
    }
    let payment = await paymentRepo.findByAttemptId(attempt.id,tenantId);
    if (!payment) {
      // The in-memory adapter must have a corresponding intent even when the
      // worker restarted after storing a durable attempt. Rebuild the exact
      // test intent instead of fabricating a provider callback.
      const simulated = await fakeProvider.initializePayment({
        attemptId:attempt.id,tenantId,intentReference:attempt.paymentIntentReference,
        purpose,direction:"INBOUND",amount:attempt.amount,
        currency:attempt.currency,customerId:booking.customerId,
        metadata:{localSimulation:true},
      });
      if(simulated.status!=="SUCCEEDED")
        throw new Error("Local test provider did not confirm the simulated payment.");
      payment = await paymentService.verifyPaymentAttempt(tenantId,attempt.id,actor);
    }
    if (purpose==="RENTAL_DEPOSIT") {
      const position = await depositRepo.findByBookingId(booking.id,tenantId);
      const held = Number(position?.heldAmount || 0);
      const remaining = Number(booking.depositRequired || 0)-held;
      if (remaining>0.0001) {
        const unallocated=Number(payment.unallocatedAmount || 0);
        if(unallocated+0.0001<remaining)
          throw new Error("Simulated deposit payment is already allocated elsewhere; cannot fund this booking.");
        await paymentService.allocatePayment(tenantId,{
          paymentId:payment.id,sourceType:"RENTAL_DEPOSIT",
          sourceId:booking.id,amount:remaining.toFixed(4),
          notes:"Local-only verified fake-provider deposit allocation",
        },actor);
      }
      const finalPosition=await depositRepo.findByBookingId(booking.id,tenantId);
      if(Number(finalPosition?.heldAmount||0)+0.0001<Number(booking.depositRequired||0))
        throw new Error("Rental deposit is still not fully allocated.");
    } else {
      // Booking projection is idempotently applied by verifyPaymentAttempt.
      // If verification completed but projection failed, do not mint or
      // double-count a second payment; emit a clear manual-reconciliation error.
      const updated=await bookingRepo.findById(booking.id,tenantId);
      if(Number(updated?.amountPaid||0)+0.0001<Number(booking.grossTotal||0))
        throw new Error("Verified local rental charge requires Booking payment reconciliation.");
    }
  }
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
          const remaining = Math.max(0,Number(booking.grossTotal||0)-Number(booking.amountPaid||0));
          if(remaining>0.0001){
            await settleLocalObligation(tenantId,booking,"CUSTOMER_INVOICE",remaining);
            result.paid++;
          } else {
            booking = await bookingRepo.update(booking.id,tenantId,{
              paymentStatus:"FULLY_PAID",
            },booking.version);
          }
          booking=await bookingService.getBooking(tenantId,booking.id);
        }

        // A legacy booking status HELD is not proof of a funded deposit. The
        // authoritative DepositPosition must exist and cover the full amount.
        const required=Number(booking.depositRequired||0);
        const currentPosition=required>0?await depositRepo.findByBookingId(booking.id,tenantId):null;
        const gap=Math.max(0,required-Number(currentPosition?.heldAmount||0));
        if(settleDeposit && gap>0.0001){
          await settleLocalObligation(tenantId,booking,"RENTAL_DEPOSIT",gap);
          result.depositsHeld++;
        }
        booking=await bookingService.getBooking(tenantId,booking.id);

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
        console.error(`[Worker:LocalPayment] ${original.bookingNumber}: ${error?.message||error}`);
        result.failed++;
        result.failures.push({
          bookingNumber: original.bookingNumber || original.id,
          message: error?.message || String(error),
        });
      }
    }
  }

  if (result.scanned === 0) console.log("[Worker:LocalPayment] No eligible bookings found in the local SQLite database.");
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
