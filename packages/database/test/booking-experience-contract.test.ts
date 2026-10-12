import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RESTORATION_SCREEN_CONNECTIONS } from '../../../src/lib/access-context';

const view=readFileSync('src/components/BookingExperienceView.tsx','utf8');
const legacy=readFileSync('src/components/BookingsView.tsx','utf8');
const restored=readFileSync('src/components/RestoredWorkspace.tsx','utf8');
const client=readFileSync('src/lib/api-client.ts','utf8');
const bookingService=readFileSync('apps/api/src/modules/bookings/application/booking.service.ts','utf8');
const pricingService=readFileSync('apps/api/src/modules/pricing/application/pricing.service.ts','utf8');
const stateMachine=readFileSync('apps/api/src/modules/bookings/domain/booking-state-machine.ts','utf8');
const contracts=readFileSync('docs/BOOKING_EXPERIENCE_CONTRACTS.md','utf8');
const runtimeEnv=readFileSync('apps/api/src/runtime-env.ts','utf8');
const localPaymentJob=readFileSync('apps/worker/src/jobs/local-payment-simulation.job.ts','utf8');
const scheduler=readFileSync('apps/worker/src/infrastructure/scheduler/canonical-scheduler.ts','utf8');

assert.equal(RESTORATION_SCREEN_CONNECTIONS.bookings.status,'PARTIAL');
assert.equal(RESTORATION_SCREEN_CONNECTIONS.bookings.mutationsEnabled,true);
assert.match(restored,/BookingExperienceView/,'restored Bookings route must use reconstructed Booking experience');

for (const call of [
  'apiClient.bookings.listBookings',
  'apiClient.bookings.getBooking',
  'apiClient.bookings.previewQuote',
  'apiClient.bookings.createBooking',
  'apiClient.bookings.updateDraft',
  'apiClient.bookings.quoteBooking',
  'apiClient.bookings.requestPayment',
  'apiClient.bookings.confirmBooking',
  'apiClient.bookings.cancelBooking',
  'apiClient.bookings.rejectBooking',
  'apiClient.bookings.expireBooking',
  'apiClient.bookings.markNoShow',
  'apiClient.bookings.amendDates',
  'apiClient.bookings.substituteVehicle',
  'apiClient.bookings.getHandoverReadiness',
]) assert.ok(view.includes(call), 'Booking experience must use '+call);

for (const permission of [
  'booking.read','booking.create','booking.update','booking.confirm','booking.cancel','booking.substitute_vehicle'
]) assert.ok(view.includes(permission), 'Booking UI must account for '+permission);

assert.match(client,/previewQuote:\s*\(dto: any\) => this\.post\('\/bookings\/quote'/);
assert.match(client,/amendDates:\s*\(id: string, dto: any\) => this\.post\(`\/bookings\/\$\{id\}\/amend-dates`/);
assert.match(client,/substituteVehicle:\s*\(id: string, dto: any\) => this\.post\(`\/bookings\/\$\{id\}\/substitute-vehicle`/);
assert.doesNotMatch(client,/\/bookings\/\$\{id\}\/reschedule/,'nonexistent reschedule route must not remain');
assert.doesNotMatch(client,/\/bookings\/\$\{id\}\/substitute`/,'nonexistent substitute route must not remain');

assert.match(bookingService,/ratePlanId:\s*dto\.ratePlanId \|\| undefined/,'Booking quote bridge must preserve explicit Rate Plan');
assert.match(bookingService,/selectedFeeCodes:\s*dto\.requestedFeeCodes \|\| undefined/,'Booking quote bridge must preserve requested fee codes');
assert.match(pricingService,/if \(normalizedRequest\.ratePlanId\)/,'Pricing Engine must honor explicit Rate Plan selection after category normalization');
assert.match(pricingService,/getRateForCategoryOrVehicle\(/,'explicit Rate Plan must still resolve a matching rate line');
assert.match(pricingService,/findByCode\(categoryInput/,'Booking category codes must normalize to canonical Pricing category IDs');
assert.match(pricingService,/BOOKING_PRICING_RATE_REQUIRED/,'missing booking rates must return an actionable domain error instead of a generic 500');
assert.match(pricingService,/fleetCategoryCode/,'category-only booking pricing must be able to fall back to a configured fleet vehicle daily rate');
assert.match(bookingService,/if \(BookingStateMachine\.isTerminal\(booking\.status\)\)/,'Booking substitution must reject every canonical terminal state including NO_SHOW');
assert.match(stateMachine,/NO_SHOW/);

assert.doesNotMatch(view,/createRentalFromBooking|setIsMpesaModalOpen|setIsNewBookingOpen|setSelectedBookingId|\bconfirmBooking\s*,\s*\bcancelBooking|\brejectBooking\s*,/,'reconstructed Booking UI must not use legacy local Booking lifecycle or direct Rental creation');
assert.ok(legacy.includes('createRentalFromBooking'),'legacy reference should retain evidence of the direct Booking-to-Rental behavior being replaced');
assert.match(view,/idempotencyKey/,'Booking creation must be retry-idempotent');
assert.match(view,/expectedVersion:detail\.version/,'lifecycle commands must carry server version where supported');
assert.match(view,/This screen does not create a Rental/,'Booking-to-Handover boundary must remain truthful');
assert.match(view,/overflow-x-auto|sm:grid-cols|md:grid-cols/,'Booking experience must remain responsive');

assert.match(runtimeEnv,/dotenv\/config/,'API and worker runtime must load root .env before evaluating local worker flags');
assert.match(scheduler,/LOCAL_PAYMENT_WORKER_ENABLED === "true"/,'local payment schedule must remain explicitly opt-in');
assert.match(localPaymentJob,/paymentStatus !== "FULLY_PAID"/,'local worker must project payment before confirmation');
assert.match(localPaymentJob,/confirmBooking\(/,'local worker must use the canonical Booking confirmation command');
assert.match(view,/window\.setInterval/,'Bookings screen must refresh background worker payment/status changes automatically');

for (let i=1;i<=27;i++){const id='BOOKING-'+String(i).padStart(3,'0');assert.ok(contracts.includes(id),'Missing Booking contract '+id);}

console.log('PASS: Booking is server-backed, state-machine governed, Pricing/Availability integrated and Rental-boundary safe.');
