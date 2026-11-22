import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BOOKING_REGISTER_STALE_MS, PENDING_BOOKING_POLL_MS,
  shouldRefreshBookingRegister, isPendingFinancialBooking, shouldPollPendingBooking,
} from "../../../src/lib/booking-refresh-policy";

const now=Date.UTC(2026,10,23,8,0,0);
const check=(lastSuccessfulAt:number,visibility:"visible"|"hidden"="visible",inFlight=false)=>
  shouldRefreshBookingRegister({visibility,lastSuccessfulAt,now,inFlight});
assert.equal(BOOKING_REGISTER_STALE_MS,60_000);
assert.ok(PENDING_BOOKING_POLL_MS>=30_000);
assert.equal(check(now-10_000),false,"Fresh booking register must stay steady");
assert.equal(check(now-BOOKING_REGISTER_STALE_MS+1),false,"Do not refresh before staleness cutoff");
assert.equal(check(now-BOOKING_REGISTER_STALE_MS),true,"Refresh a visible stale view");
assert.equal(check(0),true,"Unverified register can be refreshed");
assert.equal(check(now-180_000,"hidden"),false,"Hidden tabs cannot refresh");
assert.equal(check(now-180_000,"visible",true),false,"Overlapping requests are rejected");

assert.equal(isPendingFinancialBooking({status:"AWAITING_PAYMENT"}),true);
assert.equal(isPendingFinancialBooking({status:"CONFIRMED",paymentStatus:"REQUESTED"}),true);
assert.equal(isPendingFinancialBooking({status:"CONFIRMED",depositStatus:"PENDING"}),true);
assert.equal(isPendingFinancialBooking({status:"CONFIRMED",paymentStatus:"FULLY_PAID",depositStatus:"HELD"}),false);
assert.equal(isPendingFinancialBooking({status:"COMPLETED",depositStatus:"REQUESTED"}),false);
assert.equal(isPendingFinancialBooking(null),false);
assert.equal(shouldPollPendingBooking({status:"AWAITING_PAYMENT"},"visible","book-1",false),true);
assert.equal(shouldPollPendingBooking({status:"AWAITING_PAYMENT"},"hidden","book-1",false),false);
assert.equal(shouldPollPendingBooking({status:"AWAITING_PAYMENT"},"visible","",false),false);
assert.equal(shouldPollPendingBooking({status:"AWAITING_PAYMENT"},"visible","book-1",true),false);

const booking=readFileSync("src/components/BookingExperienceView.tsx","utf8");
assert.ok(!booking.includes("},5000)"),"Five-second booking register polling must not return");
assert.ok(!booking.includes("}, 5000)"),"No five-second booking interval");
assert.match(booking,/window\.addEventListener\("focus"/);
assert.match(booking,/document\.addEventListener\("visibilitychange"/);
assert.match(booking,/setBackgroundRefreshing\(true\)/);
assert.match(booking,/No bookings yet\./);
assert.match(booking,/No bookings match these filters\./);
assert.match(booking,/Bookings are temporarily unavailable\./);
assert.match(booking,/Clear filters/);

const company=readFileSync("src/components/RestoredWorkspace.tsx","utf8");
assert.ok(!company.includes('className="sage-page-context'),"Duplicate company banner must stay removed");
assert.match(company,/Company workspace/);
const platform=readFileSync("src/components/platform/PlatformOwnerWorkspace.tsx","utf8");
assert.ok(!platform.includes("<h1>{currentTitle}</h1>"),"Dynamic platform title belongs to its page, not global toolbar");
const renter=readFileSync("src/components/RenterAccount.tsx","utf8");
assert.match(renter,/document\.visibilityState/,"Renter tracking must pause while hidden");
assert.match(renter,/background=false/,"Quiet renter checks must not show blocking loaders");
assert.match(renter,/\["COMPLETED","CANCELLED","REJECTED","EXPIRED","NO_SHOW"\]/,
  "Terminal renter bookings do not need background monitoring");
const owner=readFileSync("src/components/owner/VehicleOwnerWorkspace.tsx","utf8");
assert.ok(!owner.includes("<h1>{heading}</h1>"),"Dynamic vehicle owner heading belongs to the body panel");
console.log("UX-H1 PASS: stable empty booking register, visibility and in-flight throttles, targeted financial polling, distinct states, unified cross-portal headers.");
