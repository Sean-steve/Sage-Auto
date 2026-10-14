/**
 * Sage Auto Stage 7 — isolated provider-simulator integration, NEVER money.
 * Runs only with .review/access/review.sqlite, APP_ENV=NODE_ENV=test.
 * This does not certify real Daraja, Stripe, bank, callback secrets or ledger.
 */
import assert from "node:assert/strict";
import {resolve} from "node:path";
import {randomUUID} from "node:crypto";
// The repository package is CommonJS under tsx in review CI; resolve its
// exports dynamically, as the Stage 6 acceptance runner does.
import {PaymentService} from "../apps/api/src/modules/payments/application/payment.service";
import {PaymentProviderRegistry} from "../apps/api/src/modules/payments/infrastructure/providers/provider-registry";
import {FakePaymentProvider} from "../apps/api/src/modules/payments/infrastructure/providers/fake-payment-provider";
import {RentalService} from "../apps/api/src/modules/rentals/application/rental.service";

async function main(){
  if(process.env.APP_ENV!=="test"||process.env.NODE_ENV!=="test"||
    !process.env.SQLITE_PATH ||
    resolve(process.env.SQLITE_PATH)!==resolve(".review/access/review.sqlite"))
    throw new Error("Stage 7 accepts ONLY the disposable review SQLite database in test mode.");
  const {
    PaymentAttemptRepository,PaymentRepository,PaymentAllocationRepository,
    RefundRepository,PaymentReconciliationRepository,WebhookRepository,
    OperationalInvoiceRepository,DepositPositionRepository,
    OwnerSettlementRepository,BookingRepository,RentalRepository,
    AuditRepository,OutboxRepository,
  }=await import("@carhire/database");
  const tenant="stage7-financial-"+randomUUID().slice(0,8);
  const approver={tenantId:tenant,userId:"stage7-finance-approver",role:"FINANCE_ADMIN"};
  const requester={tenantId:tenant,userId:"stage7-requests",role:"FINANCE_ADMIN"};
  const executor={tenantId:tenant,userId:"stage7-payout-executor",role:"COMPANY_OWNER"};
  const attempts=new PaymentAttemptRepository(),payments=new PaymentRepository(),
    allocations=new PaymentAllocationRepository(),refunds=new RefundRepository(),
    reconciliation=new PaymentReconciliationRepository(),webhooks=new WebhookRepository(),
    invoices=new OperationalInvoiceRepository(),deposits=new DepositPositionRepository(),
    owners=new OwnerSettlementRepository(),bookings=new BookingRepository(),
    rentals=new RentalRepository();
  const registry=new PaymentProviderRegistry(),provider=new FakePaymentProvider();
  registry.register(provider);
  const service=new PaymentService(attempts,payments,allocations,refunds,reconciliation,registry,
    webhooks,invoices,deposits,owners,new AuditRepository(),new OutboxRepository(),bookings);
  let checks=0;
  const match=(v:any,expect:any,label:string)=>{assert.deepEqual(v,expect,label);checks++};
  async function rejected(label:string,fn:()=>Promise<unknown>,predicate?:(error:any)=>boolean){
    await assert.rejects(fn,(e:any)=>{
      if(predicate)return predicate(e);
      return !!e;
    },label);checks++;
  }
  const mkAttempt=(purpose:"CUSTOMER_INVOICE"|"RENTAL_DEPOSIT",amount:string,targetId:string)=>
    service.initiatePaymentAttempt(tenant,{
      purpose,amount,currency:"KES",provider:"FAKE_PROVIDER",targetId,
      customerId:"stage7-customer",idempotencyKey:"stage7-attempt-"+randomUUID(),
    },requester);
  const callback=(attempt:any,amount:string,opts:any={})=>
    service.handleWebhook("FAKE_PROVIDER",
      {"x-provider-signature":opts.signature||"test_valid_signature"},{
        eventId:opts.eventId||"stage7-event-"+randomUUID(),
        intentReference:attempt.paymentIntentReference,
        providerTransactionId:opts.providerTransactionId||"stage7-tx-"+randomUUID(),
        status:"SUCCEEDED",amount,currency:opts.currency||"KES",
      });

  // A. Real Finance invoice, provider intent and signed simulator callback.
  const invoice=await invoices.create({
    tenantId:tenant,invoiceNumber:"S7-INV-"+randomUUID().slice(0,7),
    customerId:"stage7-customer",billingSnapshot:{customerName:"Stage 7 Simulated"},
    status:"ISSUED",subtotal:"15000.0000",taxTotal:"0.0000",
    discountTotal:"0.0000",total:"15000.0000",
    amountPaid:"0.0000",amountOutstanding:"15000.0000",amountCredited:"0.0000",
    currency:"KES",issueDate:"2026-10-14",dueDate:"2026-10-21",lineItems:[],
  } as any);
  provider.setBehavior({mode:"REQUIRE_MANUAL_WEBHOOK"});
  const attempt=await mkAttempt("CUSTOMER_INVOICE","15000.0000",invoice.id);
  match(attempt.status,"PENDING_CALLBACK","Callback-dependent provider intent");
  match((await payments.listByTenant(tenant)).length,0,"Initiation must not mint money");
  await rejected("Browser claim is not payment evidence",
    ()=>service.verifyPaymentAttempt(tenant,attempt.id,requester,true),
    (e:any)=>e.name==="ClientPaymentEvidenceRejectedError");
  await rejected("Bad signature cannot mint money",
    ()=>callback(attempt,"15000.0000",{signature:"tampered"}),
    (e:any)=>e.name==="InvalidWebhookSignatureError");
  await rejected("Underpayment cannot be accepted as full payment",
    ()=>callback(attempt,"14000.0000"),(e:any)=>e.name==="PaymentVerificationFailedError");
  await rejected("Wrong currency cannot mint KES money",
    ()=>callback(attempt,"15000.0000",{currency:"USD"}),
    (e:any)=>e.name==="PaymentVerificationFailedError");
  match((await payments.listByTenant(tenant)).length,0,"Mismatched callbacks leave no Payment");
  const eventId="stage7-valid-"+randomUUID(),txn="stage7-invoice-"+randomUUID();
  const response=await callback(attempt,"15000.0000",{eventId,providerTransactionId:txn});
  match(response.status,"PROCESSED","Verified callback processed");
  const payment=response.payment!;
  match(payment.amount,"15000.0000","Verified exact invoice amount");
  match((await invoices.findById(invoice.id,tenant))?.status,"PAID","Invoice must settle");
  match((await invoices.findById(invoice.id,tenant))?.amountOutstanding,"0.0000","No invoice balance remains");
  match((await allocations.findByPaymentId(payment.id,tenant)).length,1,"Exactly one invoice allocation");
  const duplicated=await callback(attempt,"15000.0000",{eventId,providerTransactionId:txn});
  match(duplicated.status,"ALREADY_PROCESSED","Webhook receipt idempotency");
  match((await payments.listByTenant(tenant)).length,1,"Webhook replay cannot duplicate Payment");

  // B. Verified deposit must fund a durable, booking-linked deposit position.
  const booking=await bookings.create(tenant,{
    bookingNumber:"S7-BOOK-"+randomUUID().slice(0,8),
    customerId:"stage7-customer",pickupAt:"2026-10-15T09:00:00Z",
    returnAt:"2026-10-17T09:00:00Z",pricingSnapshot:{
      snapshotId:"s7-zero-rental",currency:"KES",grossRentalTotal:0,
      netRentalSubtotal:0,securityDeposit:{amount:7000},
    },
    grossTotal:0,depositRequired:7000,depositStatus:"REQUESTED",initialStatus:"QUOTED",
  } as any);
  const depositAttempt=await mkAttempt("RENTAL_DEPOSIT","7000.0000",booking.id);
  match((await bookings.findById(booking.id,tenant))?.depositStatus,"REQUESTED",
    "Deposit intent does not confer possession");
  const depositResult=await callback(depositAttempt,"7000.0000");
  match(depositResult.status,"PROCESSED","Provider-verified deposit callback");
  const held=await deposits.findByBookingId(booking.id,tenant);
  assert.ok(held);checks++;
  match(held!.heldAmount,"7000.0000","Durable hold matches real simulated provider evidence");
  match((await bookings.findById(booking.id,tenant))?.depositStatus,"HELD",
    "Booking deposit becomes HELD only on allocation");

  // C. Refund reservation, 4-eyes, provider failure and replay safety.
  await rejected("Missing deposit obligation must never be refundable",
    ()=>service.requestRefund(tenant,{
      paymentId:depositResult.payment!.id,amount:"100.0000",reason:"Wrong deposit",
      sourceObligationType:"RENTAL_DEPOSIT",sourceObligationId:"not-a-real-position",
    },requester),e=>/backed|linked/.test(String(e.message)));
  const unlinked=await deposits.create({
    tenantId:tenant,bookingId:"different-booking",customerId:"different-customer",
    currency:"KES",requiredAmount:"7000.0000",receivedAmount:"7000.0000",
    heldAmount:"7000.0000",appliedAmount:"0.0000",refundDueAmount:"7000.0000",
    refundedAmount:"0.0000",forfeitedAmount:"0.0000",status:"HELD",
  } as any);
  await rejected("Another customer's funded deposit must never be a refund source",
    ()=>service.requestRefund(tenant,{
      paymentId:depositResult.payment!.id,amount:"100.0000",reason:"Source substitution",
      sourceObligationType:"RENTAL_DEPOSIT",sourceObligationId:unlinked.id,
    },requester),e=>/backed/.test(String(e.message)));
  const depositRefund=await service.requestRefund(tenant,{
    paymentId:depositResult.payment!.id,amount:"7000.0000",reason:"Test deposit released",
    sourceObligationType:"RENTAL_DEPOSIT",sourceObligationId:held!.id,
  },requester);
  match(depositRefund.status,"PENDING","Deposit refund requested");
  await rejected("Two outstanding refunds cannot exceed money",
    ()=>service.requestRefund(tenant,{
      paymentId:depositResult.payment!.id,amount:"100.0000",reason:"Double refund",
    },requester),(e:any)=>e.name==="RefundExceedsPaymentError");
  await rejected("Requester cannot self-approve refund",
    ()=>service.approveAndExecuteRefund(tenant,depositRefund.id,requester),
    (e:any)=>e.code==="SEPARATION_OF_DUTIES");
  provider.setBehavior({mode:"AUTO_SUCCESS"});
  const executed=await service.approveAndExecuteRefund(tenant,depositRefund.id,approver);
  match(executed.status,"COMPLETED","Provider simulator confirms disbursement");
  assert.ok(executed.providerRefundReference);checks++;
  const replay=await service.approveAndExecuteRefund(tenant,depositRefund.id,approver);
  match(replay.providerRefundReference,executed.providerRefundReference,
    "Retry must reuse original refund without provider call");
  match((await payments.findById(depositResult.payment!.id,tenant))?.refundedAmount,
    "7000.0000","Original Payment refunded once");
  await rejected("Fully refunded payment cannot refund again",
    ()=>service.requestRefund(tenant,{
      paymentId:depositResult.payment!.id,amount:"1.0000",reason:"Improper refund",
    },requester),(e:any)=>e.name==="RefundExceedsPaymentError");

  // D. Link the real completed refund to a different module's Rental closure.
  const rental=await rentals.create(tenant,{
    rentalNumber:"S7-RENTAL-"+randomUUID().slice(0,6),
    bookingId:booking.id,contractId:"stage7-contract",handoverId:"stage7-handover",
    customerId:booking.customerId,vehicleId:"stage7-vehicle",
    primaryDriverId:"stage7-driver",status:"FINAL_CALCULATION",
    scheduledStart:"2026-10-15T09:00:00Z",scheduledReturnAt:"2026-10-17T09:00:00Z",
    checkoutOdometer:20000,checkoutFuelLevel:85,
    pricingSnapshot:{currency:"KES",grossRentalTotal:0,billableDays:2,days:2},
  } as any);
  await rentals.update(rental.id,tenant,{returnOdometer:20030,returnFuelLevel:85});
  await deposits.update(held!.id,tenant,{rentalId:rental.id},held!.version);
  await rentals.saveFinalCalculation(tenant,{
    tenantId:tenant,rentalId:rental.id,bookingId:booking.id,
    startOdometer:20000,returnOdometer:20030,totalDistanceKm:30,
    allowedDistanceKm:250,excessDistanceKm:0,excessKmRate:0,excessKmCharge:0,
    startFuelLevel:85,returnFuelLevel:85,fuelDeficitPercent:0,fuelDeficitLitres:0,
    fuelPricePerUnit:0,fuelDeficitCharge:0,fuelRefuelingFee:0,
    scheduledReturnAt:"2026-10-17T09:00:00Z",actualReturnAt:"2026-10-17T09:00:00Z",
    lateReturnDurationHours:0,gracePeriodHours:1,billableLateHours:0,lateReturnFee:0,
    damageCaseIds:[],totalDamageCharge:0,totalAdditionalFees:0,baseRentalAmount:0,
    extensionsTotalAmount:0,grossFinalTotal:0,totalTaxAmount:0,netFinalTotal:0,
    depositHeldAmount:7000,depositDeductionsTotal:0,depositRefundDue:7000,
    depositAdditionalPaymentDue:0,depositSettlementStatus:"PENDING",isImmutable:false,
    lineItems:[],
  } as any);
  const financeService=new RentalService();
  await rejected("Refund cannot bind to unrelated rental",()=>financeService.processDepositSettlement(
    tenant,"stage7-nonexistent",{settlementStatus:"REFUNDED",refundId:executed.id} as any,
    {userId:approver.userId,actorType:"USER"} as any));
  const sealed=await financeService.processDepositSettlement(tenant,rental.id,{
    settlementStatus:"REFUNDED",refundId:executed.id,refundAmount:7000,
  } as any,{userId:approver.userId,actorType:"USER"} as any);
  match(sealed.isImmutable,true,"Real provider-refund evidence seals rental Finance");
  match(sealed.depositSettlementStatus,"REFUNDED","Refund-backed closure");

  // E. Owner settlement payable must be approved and in scope. Four-eyes
  // payout execution and immutable money amounts are mandatory.
  const makeOwner=async(status="APPROVED",amount="42750.0000",destination="+254700123456")=>{
    const settlement=await owners.create({
      tenantId:tenant,ownerId:"stage7-owner",ownerName:"Stage 7 Test Owner",
      periodStart:"2026-10-01",periodEnd:"2026-10-31",currency:"KES",
      status,calculatedAt:"2026-10-31T09:00:00Z",
      calculatedBy:"stage7-calculator",approvedAt:"2026-10-31T10:00:00Z",
      approvedBy:approver.userId,totalDeductions:"2250.0000",
      netPayoutAmount:"42750.0000",
    } as any);
    const payable=await owners.createPayable({
      tenantId:tenant,settlementId:settlement.id,ownerId:"stage7-owner",
      payableNumber:"S7-PAY-"+randomUUID().slice(0,7),
      currency:"KES",amount:"45000.0000",recipientName:"Stage 7 Test Owner",
      payoutMethod:"MPESA_B2C",destinationMpesaNumber:destination||undefined,
      taxWithholdingAmount:"2250.0000",netDisbursementAmount:amount,
      status:"PENDING",retryCount:0,createdBy:"stage7-finance",
    } as any);
    return {settlement,payable};
  };
  const unapproved=await makeOwner("CALCULATED");
  await rejected("No payout for unapproved settlement",
    ()=>service.executeOwnerPayout(tenant,{
      settlementPayableId:unapproved.payable.id,provider:"FAKE_PROVIDER",
    },executor));
  const unbacked=await makeOwner("APPROVED","999999.0000");
  await rejected("Payable cannot exceed frozen approved settlement",
    ()=>service.executeOwnerPayout(tenant,{
      settlementPayableId:unbacked.payable.id,provider:"FAKE_PROVIDER",
    },executor));
  const missing=await makeOwner("APPROVED","42750.0000","");
  await rejected("No payout without explicit destination",
    ()=>service.executeOwnerPayout(tenant,{
      settlementPayableId:missing.payable.id,provider:"FAKE_PROVIDER",
    },executor));
  const actual=await makeOwner();
  await rejected("Settlement approver cannot execute payout",
    ()=>service.executeOwnerPayout(tenant,{
      settlementPayableId:actual.payable.id,provider:"FAKE_PROVIDER",
    },approver),(e:any)=>e.code==="SEPARATION_OF_DUTIES");
  provider.setBehavior({mode:"AUTO_FAIL"});
  await rejected("Failed simulated provider does not pay settlement",
    ()=>service.executeOwnerPayout(tenant,{
      settlementPayableId:actual.payable.id,provider:"FAKE_PROVIDER",
    },executor));
  match((await owners.findPayableById(actual.payable.id,tenant))?.status,
    "FAILED","Failed payout remains unreleased");
  match((await owners.findById(actual.settlement.id,tenant))?.status,
    "APPROVED","Provider failure restores approval for reconciliation");
  provider.setBehavior({mode:"AUTO_SUCCESS"});
  const paid=await service.executeOwnerPayout(tenant,{
    settlementPayableId:actual.payable.id,provider:"FAKE_PROVIDER",
    idempotencyKey:"stage7-owner-pay-"+actual.payable.id,
  },executor);
  match(paid.payable.status,"PAID","Owner payable sealed by simulated provider");
  match(paid.payment.direction,"OUTBOUND","Owner payout is outbound payment");
  match(paid.payment.amount,"42750.0000","Owner money equals frozen liability");
  match((await owners.findById(actual.settlement.id,tenant))?.status,"PAID",
    "Owner settlement reflects payout");
  await rejected("Retry cannot pay owner twice",()=>service.executeOwnerPayout(tenant,{
    settlementPayableId:actual.payable.id,provider:"FAKE_PROVIDER",
  },executor),(e:any)=>e.name==="SettlementAlreadyPaidError");

  // F. Reconciliation and forbidden production simulator.
  const issues=await service.runReconciliationScan(tenant);
  assert.ok(Array.isArray(issues));checks++;
  const all=await payments.listByTenant(tenant);
  match(all.filter(x=>x.purpose==="OWNER_SETTLEMENT").length,1,
    "Exactly one owner payout Payment exists");
  match(all.filter(x=>x.purpose==="RENTAL_DEPOSIT").length,1,
    "Exactly one provider-verified deposit Payment exists");
  const prev=process.env.APP_ENV;
  try {
    process.env.APP_ENV="production";
    assert.throws(()=>registry.get("FAKE_PROVIDER"),
      /Production and staging require an explicit payment provider/,
      "FAKE_PROVIDER must fail closed in production");
    checks++;
  }finally{process.env.APP_ENV=prev;}

  console.log("PASS Stage 7 SIMULATED financial integration: "+checks+
    " assertions across verified invoices, webhook security, deposits, refund liability, Rental Finance seal, owner payout and reconciliation. NO real money moved.");
}
main().catch(e=>{console.error("Stage 7 financial integration failed:",e.stack||e.message);process.exitCode=1;});
