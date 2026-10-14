import assert from "node:assert/strict";
import {
  BookingRepository, TenantRepository, DepositPositionRepository,
  PaymentRepository, PaymentAllocationRepository,
} from "@carhire/database";
import { processLocalPaymentSimulation } from "../../../apps/worker/src/jobs/local-payment-simulation.job";

async function main() {
  process.env.NODE_ENV="test";
  process.env.APP_ENV="test";
  process.env.LOCAL_PAYMENT_WORKER_ENABLED="true";
  const tenants=new TenantRepository();
  const tenant=await tenants.create({
    name:"Isolated local payments test",slug:"local-payments-test",
    status:"ACTIVE",currency:"KES",planId:"plan-growth",
  } as any);
  const bookingRepo=new BookingRepository();
  const booking=await bookingRepo.create(tenant.id,{
    customerId:"local-test-customer",source:"WALK_IN",
    pickupAt:"2027-01-01T08:00:00.000Z",returnAt:"2027-01-04T08:00:00.000Z",
    currency:"KES",grossTotal:15000,depositRequired:25000,
    initialStatus:"CONFIRMED",
  } as any);
  const original=await bookingRepo.findById(booking.id,tenant.id);
  assert.equal(original?.depositStatus,"REQUESTED");
  assert.equal((await new DepositPositionRepository().findByBookingId(booking.id,tenant.id))?.heldAmount??"0","0");

  const result=await processLocalPaymentSimulation({tenantId:tenant.id,maxBookings:10});
  assert.equal(result.status,"completed");
  assert.equal(result.failed,0,JSON.stringify(result.failures));
  assert.equal(result.scanned,1);
  assert.equal(result.paid,1);
  assert.equal(result.depositsHeld,1);
  const funded=await bookingRepo.findById(booking.id,tenant.id);
  assert.equal(funded?.paymentStatus,"FULLY_PAID");
  assert.equal(funded?.depositStatus,"HELD");
  assert.equal(Number(funded?.amountPaid),15000);
  const position=await new DepositPositionRepository().findByBookingId(booking.id,tenant.id);
  assert.equal(Number(position?.heldAmount),25000,"Deposit must be backed by Payment allocation");
  assert.equal(Number(position?.receivedAmount),25000);
  const payments=await new PaymentRepository().listByTenant(tenant.id);
  assert.equal(payments.length,2,"Verified rental charge and deposit are different financial obligations");
  assert.ok(payments.every(p=>p.provider==="FAKE_PROVIDER"&&p.verificationSource==="STATUS_QUERY"));
  const allocations=await new PaymentAllocationRepository().listByTenant(tenant.id);
  assert.ok(allocations.some((a:any)=>a.sourceType==="RENTAL_DEPOSIT"&&Number(a.amount)===25000));
  assert.equal(Number((await bookingRepo.findById(booking.id,tenant.id))?.amountPaid),15000,
    "Deposit cannot inflate rental revenue");

  const again=await processLocalPaymentSimulation({tenantId:tenant.id,maxBookings:10});
  assert.equal(again.failed,0,JSON.stringify(again.failures));
  assert.equal(again.paid,0);
  assert.equal(again.depositsHeld,0);
  assert.equal((await new PaymentRepository().listByTenant(tenant.id)).length,2,
    "Scheduler replay must not mint another Payment");

  process.env.LOCAL_PAYMENT_WORKER_ENABLED="false";
  assert.equal((await processLocalPaymentSimulation({tenantId:tenant.id})).status,"disabled");
  process.env.LOCAL_PAYMENT_WORKER_ENABLED="true";
  process.env.APP_ENV="production";
  await assert.rejects(()=>processLocalPaymentSimulation({tenantId:tenant.id}),/forbidden/);
  process.env.APP_ENV="test";
  process.env.NODE_ENV="staging";
  await assert.rejects(()=>processLocalPaymentSimulation({tenantId:tenant.id}),/forbidden/);
  console.log("PASS: fake-provider VERIFIED payments, authoritative deposit allocation, replay and production fail-closed.");
}
main().catch(err=>{console.error("Local payment acceptance failed:",err);process.exitCode=1;});
