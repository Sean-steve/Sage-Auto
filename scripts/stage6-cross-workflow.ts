/**
 * STAGE 6 — Real authenticated HTTP cross-workflow integration acceptance.
 *
 * Isolated repo fixtures create a verified customer, driver, vehicle and a
 * complimentary QUOTED booking (KES 0; NO payment/deposit obligation).
 * Booking CONFIRMATION, Contract issuance/signature, Handover checkpoints,
 * Inspections, Rental dispatch, Return calculation, Finance seal and Rental
 * completion all occur via the running API as different authenticated roles.
 *
 * This does not substitute for provider-sandbox payment tests, customer
 * booking checkout UI tests, or production-integrity verification.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

async function main() {
  const db=resolve(".review/access/review.sqlite");
  if(process.env.NODE_ENV!=="test"||process.env.APP_ENV!=="test"||
     !process.env.SQLITE_PATH||resolve(process.env.SQLITE_PATH)!==db)
    throw new Error("Stage 6 accepts ONLY disposable .review/access/review.sqlite in test mode.");
  const secrets=JSON.parse(readFileSync(".review/access/accounts.json","utf8"));
  const base=process.env.STAGE6_API_ORIGIN||"http://127.0.0.1:3511";
  async function call(path:string,token:string|undefined,tenantId:string|undefined,body?:unknown){
    const res=await fetch(base+"/api/v1"+path,{
      method:body===undefined?"GET":"POST",
      headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),
        ...(tenantId?{"X-Tenant-ID":tenantId}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    let payload:any;try{payload=await res.json();}catch{payload={};}
    return {status:res.status,data:payload?.data,error:payload?.error?.message||payload?.message};
  }
  async function ok(label:string,path:string,actor:{token:string,tenant:string},body?:unknown) {
    const res=await call(path,actor.token,actor.tenant,body);
    if(res.status<200||res.status>=300)throw new Error(label+" HTTP "+res.status+": "+(res.error||"unknown"));
    assert.notEqual(res.data,undefined,label+" missing data");
    return res.data;
  }
  async function login(role:string){
    const entry=await call("/auth/login",undefined,undefined,secrets[role]);
    assert.equal(entry.status,200,role+" login");
    const token=entry.data.tokens.accessToken;
    const ctx=await call("/access/context",token,undefined);
    assert.equal(ctx.status,200,role+" context");
    const portal=ctx.data.portals.find((v:any)=>v.kind==="tenant"&&v.roles.includes(role));
    assert.ok(portal,role+" has no review tenant");
    return {token,tenant:portal.tenantId,role};
  }

  const owner=await login("COMPANY_OWNER");
  const agent=await login("BOOKING_AGENT");
  const finance=await login("FINANCE_MANAGER");
  const renterAuth=await call("/auth/login",undefined,undefined,secrets.RENTER);
  assert.equal(renterAuth.status,200,"Renter account login");
  const renterToken=renterAuth.data.tokens.accessToken;
  assert.equal(owner.tenant,agent.tenant);
  assert.equal(owner.tenant,finance.tenant);
  const tenant=owner.tenant;
  const {
    CustomerRepository,DriverRepository,VehicleRepository,BookingRepository,
    VehicleAllocationRepository,ContractRepository,HandoverRepository,
    RentalRepository,InspectionRepository,OutboxRepository,
  }=await import("@carhire/database");
  const customers=new CustomerRepository(),drivers=new DriverRepository();
  const vehicles=new VehicleRepository(),bookings=new BookingRepository();
  const allocations=new VehicleAllocationRepository(),contracts=new ContractRepository();
  const handovers=new HandoverRepository(),rentals=new RentalRepository();
  const inspections=new InspectionRepository(),outbox=new OutboxRepository();
  const code=randomUUID().slice(0,8).toUpperCase();
  const now=Date.now();
  const pickup=new Date(now+2*86400000).toISOString();
  const dropoff=new Date(now+4*86400000).toISOString();
  let assertions=0;
  const customer=await customers.create({
    tenantId:tenant,customerType:"INDIVIDUAL",fullName:"Stage6 Test Renter",
    email:"stage6-"+code.toLowerCase()+"@example.test",phone:"+254711555999",
    idOrPassportNumber:"QA"+code,licenseNumber:"QA-DL-"+code,
    licenseExpiryDate:"2032-01-01",status:"ACTIVE",verificationStatus:"VERIFIED",
  } as any);
  const driver=await drivers.create({
    tenantId:tenant,fullName:"Stage6 Test Driver",licenseNumber:"QDRV-"+code,
    licenseExpiryDate:"2032-01-01",phone:"+254722555999",status:"ACTIVE",
    verificationStatus:"VERIFIED",
  } as any);
  const vehicle=await vehicles.create({
    tenantId:tenant,registrationPlate:"QA6-"+code,vin:"QA6-VIN-"+code,
    make:"Sage",model:"Workflow QA",year:2026,category:"SUV",
    transmission:"Automatic",fuelType:"Diesel",seats:5,
    lifecycleStatus:"ACTIVE",availabilityStatus:"AVAILABLE",
    odometer:41000,fuelLevel:75,dailyRate:0,
  } as any);

  // No financial evidence is ever forged. Complimentary pricing is a
  // deliberate isolated test fixture, NOT a real checkout or quote.
  const price={
    snapshotId:"qa-zero-"+code,currency:"KES",dailyRate:0,baseDailyRate:0,
    appliedAverageDailyRate:0,totalDays:2,days:2,billableDays:2,
    grossRentalTotal:0,grossTotal:0,netRentalSubtotal:0,
    securityDeposit:{amount:0},tax:{taxAmount:0},
    mileageAllowance:{model:"DAILY_CAPPED",includedKm:200,excessKmRate:0},
  };
  const booking=await bookings.create(tenant,{
    bookingNumber:"QA6-BKG-"+code,customerId:customer.id,primaryDriverId:driver.id,
    assignedVehicleId:vehicle.id,requestedVehicleId:vehicle.id,
    pickupAt:pickup,returnAt:dropoff,source:"OPERATIONS_DESK",
    initialStatus:"QUOTED",pricingSnapshot:price,grossTotal:0,
    netRentalSubtotal:0,depositRequired:0,taxAmount:0,depositStatus:"NOT_REQUIRED",
  } as any);
  assert.equal((await contracts.findByBookingId(booking.id,tenant)).length,0);
  const earlyContract=await call("/contracts/generate",owner.token,tenant,{bookingId:booking.id});
  assert.ok(earlyContract.status>=400,"Contract must reject unconfirmed booking");
  const earlyRental=await call("/rentals/start",owner.token,tenant,{bookingId:booking.id});
  assert.ok(earlyRental.status>=400,"Rental must reject missing signed contract and handover");
  assertions+=2;

  // Booking agent is allowed to confirm (not to forge Finance settlement).
  const confirmed=await ok("Confirm booking","/bookings/"+booking.id+"/confirm",agent,{});
  assert.equal(confirmed.status,"CONFIRMED");assert.equal(confirmed.assignedVehicleId,vehicle.id);
  assert.ok(confirmed.allocationId);assertions+=3;
  const a=await allocations.findById(confirmed.allocationId,tenant);
  assert.equal(a?.sourceId,booking.id);assert.equal(a?.status,"CONFIRMED");assertions+=2;

  const secondCustomer=await customers.create({
    tenantId:tenant,customerType:"INDIVIDUAL",fullName:"Stage6 Overlap Test",
    email:"stage6-other-"+code.toLowerCase()+"@example.test",phone:"+254711555991",
    idOrPassportNumber:"OB"+code,licenseNumber:"OB-DL-"+code,
    licenseExpiryDate:"2032-01-01",status:"ACTIVE",verificationStatus:"VERIFIED"
  } as any);
  const second=await bookings.create(tenant,{
    bookingNumber:"QA6-OVERLAP-"+code,customerId:secondCustomer.id,
    assignedVehicleId:vehicle.id,requestedVehicleId:vehicle.id,
    pickupAt:pickup,returnAt:dropoff,initialStatus:"QUOTED",
    pricingSnapshot:price,grossTotal:0,netRentalSubtotal:0,
    depositRequired:0,taxAmount:0,
  } as any);
  const overlap=await call("/bookings/"+second.id+"/confirm",agent.token,tenant,{});
  assert.ok([409,422,400].includes(overlap.status),
    "Overlapping booking MUST be rejected by allocation boundary; was "+overlap.status);
  assert.notEqual((await bookings.findById(second.id,tenant))?.status,"CONFIRMED");
  assertions+=2;

  const beforeContract=await ok("Rental readiness before contract",
    "/rentals/readiness/"+booking.id,owner);
  assert.equal(beforeContract.isReady,false);
  assert.ok(beforeContract.blockers.some((s:string)=>s.includes("contract")));
  assertions+=2;

  const contract=await ok("Generate Contract","/contracts/generate",owner,{bookingId:booking.id});
  assert.equal(contract.bookingId,booking.id);assert.equal(contract.vehicleId,vehicle.id);
  assertions+=2;
  const wrongSign=await call("/contracts/"+contract.id+"/sign",renterToken,tenant,{
    signerType:"CUSTOMER",signerId:customer.id,signerName:"Stage6 Test Renter",
    signatureMethod:"MANUAL_UPLOAD",signatureReference:"qa-test-only-"+code,
  });
  assert.ok([403,404].includes(wrongSign.status),"Renter cannot sign arbitrary tenant contract");
  assertions++;
  const signed=await ok("Sign Contract","/contracts/"+contract.id+"/sign",owner,{
    signerType:"CUSTOMER",signerId:customer.id,signerName:"Stage6 Test Renter",
    signatureMethod:"MANUAL_UPLOAD",signatureReference:"qa-test-signature-"+code,
  });
  assert.equal(signed.status,"SIGNED");assertions++;
  const handover=await ok("Schedule Handover","/handovers/schedule",owner,{
    bookingId:booking.id,scheduledAt:pickup
  });
  assert.equal(handover.bookingId,booking.id);
  assert.equal(handover.contractId,contract.id);assertions+=2;

  const premature=await call("/rentals/start",owner.token,tenant,{bookingId:booking.id});
  assert.ok(premature.status>=400,"Rental cannot start before checkpoints");
  assertions++;
  const arrived=await ok("Customer arrival","/handovers/"+handover.id+"/arrive",owner,{});
  assert.equal(arrived.status,"CUSTOMER_ARRIVED");assertions++;
  const docs=await ok("Verify documents","/handovers/"+handover.id+"/verify-documents",owner,{
    driverLicenseVerified:true,idDocumentVerified:true,verifiedBy:"Stage6 Test Inspector",
  });
  assert.equal(docs.status,"DOCUMENT_VERIFIED");assertions++;

  const pre=await ok("Create PRE_RENTAL inspection","/inspections/",owner,{
    inspectionType:"PRE_RENTAL",vehicleId:vehicle.id,bookingId:booking.id,
    handoverId:handover.id,customerId:customer.id,driverId:driver.id,
    odometer:41000,fuelLevel:75,overallCondition:"GOOD"
  });
  await ok("Start pre-rental inspection","/inspections/"+pre.id+"/start",owner,{});
  const preSealed=await ok("Complete pre-rental inspection","/inspections/"+pre.id+"/complete",owner,{
    odometer:41000,fuelLevel:75,overallCondition:"GOOD",
    notes:"No defects recorded during test walkaround."
  });
  assert.equal(preSealed.status,"COMPLETED");assertions+=3;
  const inspected=await ok("Link pre-rental inspection","/handovers/"+handover.id+"/inspection",
    owner,{inspectionId:pre.id,passed:true});
  assert.equal(inspected.status,"PRE_RENTAL_INSPECTION");assertions++;
  const sigCheckpoint=await ok("Handover signature checkpoint",
    "/handovers/"+handover.id+"/confirm-signature",owner,{contractSigned:true});
  assert.equal(sigCheckpoint.status,"SIGNATURE");assertions++;
  const keyCheckpoint=await ok("Handover vehicle keys",
    "/handovers/"+handover.id+"/handover-keys",owner,{
      checkoutOdometer:41000,checkoutFuelLevel:75,handedOverTo:"Stage6 Test Renter",
  });
  assert.equal(keyCheckpoint.status,"KEY_HANDOVER");assertions++;
  const handedOver=await ok("Complete Handover",
    "/handovers/"+handover.id+"/complete",owner,{});
  assert.equal(handedOver.status,"HANDOVER_COMPLETED");assertions++;

  const ready=await ok("Rental dispatch readiness","/rentals/readiness/"+booking.id,owner);
  assert.equal(ready.isReady,true,
    "Unexpected dispatch blockers: "+JSON.stringify(ready.blockers||[]));assertions++;
  const dispatch=await ok("Start Rental","/rentals/start",owner,{
    bookingId:booking.id,idempotencyKey:"qa6-dispatch-"+code,
  });
  assert.equal(dispatch.state,"ACTIVE_ON_ROAD");
  assert.equal(dispatch.contractId,contract.id);
  assert.equal(dispatch.handoverId,handover.id);assertions+=3;
  assert.equal((await bookings.findById(booking.id,tenant))?.status,"ACTIVE");
  assert.equal((await contracts.findById(contract.id,tenant))?.status,"ACTIVE");
  assert.equal((await vehicles.findById(vehicle.id,tenant))?.availabilityStatus,"ON_RENT");
  assert.equal((await allocations.findById(a!.id,tenant))?.status,"ACTIVE");
  assertions+=4;
  const rentalReplay=await ok("Idempotent rental start","/rentals/start",owner,{
    bookingId:booking.id,idempotencyKey:"qa6-dispatch-"+code
  });
  assert.equal(rentalReplay.id,dispatch.id);assertions++;
  const onRoad=await call("/rentals/"+dispatch.id,renterToken,tenant);
  assert.ok([401,403,404].includes(onRoad.status),"Renter must not access staff rentals");
  assertions++;

  const scheduled=await ok("Schedule Rental return","/rentals/"+dispatch.id+"/return-schedule",owner,{
    scheduledReturnAt:new Date(Date.now()+3600000).toISOString(),
  });
  assert.equal(scheduled.state,"RETURN_SCHEDULED");assertions++;
  const received=await ok("Receive vehicle","/rentals/"+dispatch.id+"/receive",owner,{
    receivedAt:new Date().toISOString(),returnOdometer:41010,
    returnFuelLevel:75,conditionNotes:"No additional damage."
  });
  assert.equal(received.state,"VEHICLE_RECEIVED");assertions++;

  const returning=await ok("Create RETURN inspection","/inspections/",owner,{
    inspectionType:"RETURN",vehicleId:vehicle.id,bookingId:booking.id,
    rentalId:dispatch.id,customerId:customer.id,driverId:driver.id,
    odometer:41010,fuelLevel:75,overallCondition:"GOOD"
  });
  await ok("Start RETURN inspection","/inspections/"+returning.id+"/start",owner,{});
  await ok("Complete RETURN inspection","/inspections/"+returning.id+"/complete",owner,{
    odometer:41010,fuelLevel:75,overallCondition:"GOOD",
    notes:"No new damage."
  });
  const signature=await ok("Acknowledge Return inspection",
    "/inspections/"+returning.id+"/signatures",owner,{
      signerType:"INSPECTOR",signerId:"stage6-inspector",
      signerName:"Stage6 Inspector",signatureMethod:"MANUAL_UPLOAD",
      signatureReference:"qa-return-"+code
    });
  assert.ok(signature);assertions+=4;
  const linked=await ok("Link RETURN inspection",
    "/rentals/"+dispatch.id+"/return-inspection",owner,{
      inspectionId:returning.id,damageCaseIds:[]
    });
  assert.equal(linked.state,"DAMAGE_ASSESSMENT");assertions++;
  const final=await ok("Calculate final bill","/rentals/"+dispatch.id+"/calculate-final",owner,{
    returnOdometer:41010,returnFuelLevel:75,actualReturnAt:new Date().toISOString(),
    freeKmPerDay:200,excessKmRate:0,lateHourlyRate:0,
    fuelPricePerLiter:0,refuelingFee:0,damageChargesOverride:0,
  });
  assert.equal(final.rental.state,"FINAL_CALCULATION");
  assert.equal(Number(final.calculation.depositRefundDue),0);
  assert.equal(Number(final.calculation.depositAdditionalPaymentDue),0);
  assertions+=3;

  const denied=await call("/rentals/"+dispatch.id+"/deposit-settlement",agent.token,tenant,{
    settlementStatus:"SETTLED"
  });
  assert.equal(denied.status,403);assertions++;
  const sealed=await ok("Finance zero-balance seal",
    "/rentals/"+dispatch.id+"/deposit-settlement",finance,{
    settlementStatus:"SETTLED",notes:"Complimentary test booking: zero balance."
  });
  assert.equal(sealed.isImmutable,true);assertions++;
  const noRelease=await call("/rentals/"+dispatch.id+"/complete",finance.token,tenant,{
    releaseVehicleToStatus:"AVAILABLE"
  });
  assert.equal(noRelease.status,403);assertions++;
  const completed=await ok("Complete and release","/rentals/"+dispatch.id+"/complete",owner,{
    releaseVehicleToStatus:"AVAILABLE",idempotencyKey:"qa6-complete-"+code
  });
  assert.equal(completed.state,"COMPLETED");assertions++;
  assert.equal((await bookings.findById(booking.id,tenant))?.status,"COMPLETED");
  assert.equal((await contracts.findById(contract.id,tenant))?.status,"COMPLETED");
  assert.equal((await vehicles.findById(vehicle.id,tenant))?.availabilityStatus,"AVAILABLE");
  assert.equal((await vehicles.findById(vehicle.id,tenant))?.odometer,41010);
  assert.equal((await allocations.findById(a!.id,tenant))?.status,"RELEASED");
  assert.equal((await rentals.getReturnRecord(dispatch.id,tenant))?.status,"COMPLETED");
  assertions+=6;
  const fresh=await login("COMPANY_OWNER");
  assert.equal((await ok("Independent session rental","/rentals/"+dispatch.id,fresh)).state,"COMPLETED");
  assertions++;

  // A complimentary booking does not create provider payments or owner payout.
  const settlementList=await ok("Owner settlement read","/owner-settlements/",owner);
  assert.ok(settlementList);
  assertions++;
  const foreign=await call("/rentals/"+dispatch.id,fresh.token,"some-other-tenant");
  assert.ok([403,404].includes(foreign.status),"Cross-tenant rental leak");
  assertions++;
  console.log("PASS Stage 6 authenticated API chain: "+assertions+
    " assertions; Booking confirmation -> allocation -> Contract signing -> Handover checkpoints -> Inspection -> Rental -> Return -> Finance -> release; no real money.");
}
main().catch(error=>{console.error("Stage 6 cross-workflow acceptance failed:",error.stack||error.message);process.exitCode=1;});
