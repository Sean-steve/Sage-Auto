import assert from 'node:assert/strict';
import { BookingRepository, PaymentAttemptRepository, PaymentRepository, PaymentAllocationRepository, RefundRepository, PaymentReconciliationRepository, WebhookRepository, OperationalInvoiceRepository, DepositPositionRepository, OwnerSettlementRepository, AuditRepository, OutboxRepository } from '../src/index';
import { PaymentService } from '../../../apps/api/src/modules/payments/application/payment.service';
import { PaymentProviderRegistry } from '../../../apps/api/src/modules/payments/infrastructure/providers/provider-registry';
import { RentalService } from '../../../apps/api/src/modules/rentals/application/rental.service';

async function main() {
const tenantId = 'dispatch-regression';
const actor = { tenantId, userId: 'finance-test', role: 'COMPANY_OWNER' };
const bookings = new BookingRepository();
const deposits = new DepositPositionRepository();
const payments = new PaymentRepository();
const service = new PaymentService(new PaymentAttemptRepository(), payments,
  new PaymentAllocationRepository(), new RefundRepository(), new PaymentReconciliationRepository(),
  new PaymentProviderRegistry(), new WebhookRepository(), new OperationalInvoiceRepository(), deposits,
  new OwnerSettlementRepository(), new AuditRepository(), new OutboxRepository(), bookings);

const booking = await bookings.create(tenantId, {
  customerId: 'customer-test', source: 'WALK_IN', pickupAt: '2027-01-01T09:00:00Z',
  returnAt: '2027-01-03T09:00:00Z', currency: 'KES', grossTotal: 1000,
  depositRequired: 500,
} as any);

async function receive(amount: string, reference: string) {
  return service.recordGovernedManualPayment(tenantId, {
    purpose: 'RENTAL_DEPOSIT', targetId: booking.id, amount, currency: 'KES',
    providerTransactionId: reference,
  } as any, actor);
}
const first = await receive('200', 'deposit-instalment-one');
assert.equal(Number(first.unallocatedAmount), 0);
assert.equal(Number((await deposits.findByBookingId(booking.id, tenantId))?.heldAmount), 200);
assert.equal((await bookings.findById(booking.id, tenantId))?.depositStatus, 'REQUESTED');
await receive('300', 'deposit-instalment-two');
assert.equal(Number((await deposits.findByBookingId(booking.id, tenantId))?.heldAmount), 500);
assert.equal((await bookings.findById(booking.id, tenantId))?.depositStatus, 'HELD');
assert.equal(Number((await bookings.findById(booking.id, tenantId))?.amountPaid), 0, 'A deposit must not pay rental charges');

// Completed handovers remain discoverable even when readiness fails; the UI
// receives the actual blockers rather than an empty dispatch queue.
const blocked = { isReady: false, blockers: ['Security deposit is not funded'] };
const rentalContext: any = {
  bookingRepo: { findMany: async (tenant: string) => { assert.equal(tenant, tenantId); return { items: [booking] }; } },
  rentalRepo: { findByBookingId: async () => null },
  handoverRepo: { findByBookingId: async () => [{ id: 'handover-test', status: 'HANDOVER_COMPLETED', createdAt: '2027-01-01' }] },
  vehicleRepo: { findById: async () => null },
  evaluateReadiness: async () => blocked,
};
const queue = await RentalService.prototype.listDispatchReady.call(rentalContext, tenantId);
assert.equal(queue.length, 1);
assert.deepEqual(queue[0].readiness, blocked);
rentalContext.rentalRepo.findByBookingId = async () => ({ id: 'already-dispatched' });
assert.deepEqual(await RentalService.prototype.listDispatchReady.call(rentalContext, tenantId), []);
console.log('PASS: split deposits fund dispatch evidence; blocked handovers stay visible; dispatched bookings are excluded.');

}
main().catch(error => { console.error(error); process.exitCode = 1; });
