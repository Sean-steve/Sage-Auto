/**
 * Stage 4 live authenticated API lifecycle against the disposable review DB.
 * Requires the review API on :3511 and its 20 test accounts.
 *
 * Never accepts an arbitrary database path, never calls a live provider,
 * never seeds fake payment evidence. Proves the valid zero-balance case:
 * Final Calculation -> authorized Finance settlement -> authorized Operations
 * completion -> Booking + Contract + Fleet + Allocation + Return synchronization.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const expected=resolve(".review/access/review.sqlite");
  if (process.env.NODE_ENV !== "test" || process.env.APP_ENV !== "test" ||
      !process.env.SQLITE_PATH || resolve(process.env.SQLITE_PATH)!==expected) {
    throw new Error("Stage 4 live acceptance requires the isolated .review/access/review.sqlite only.");
  }
  const creds=JSON.parse(readFileSync(".review/access/accounts.json","utf8"));
  const base="http://127.0.0.1:3511/api/v1";
  async function call(path:string,token?:string,tenantId?:string,body?:unknown) {
    return fetch(base+path,{
      method:body===undefined?"GET":"POST",
      headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),
        ...(tenantId?{"X-Tenant-ID":tenantId}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
  }
  async function ok(response:Response,label:string):Promise<any>{
    const result=await response.json();
    assert.equal(response.ok,true,label+" failed: "+response.status+" "+(result.error?.message||""));
    return result.data;
  }
  async function actor(role:string) {
    const login=await ok(await call("/auth/login",undefined,undefined,creds[role]),role+" login");
    const token=login.tokens.accessToken;
    const context=await ok(await call("/access/context",token),role+" context");
    return {token,portals:context.portals,user:context.user};
  }

  const company=await actor("COMPANY_OWNER");
  const finance=await actor("FINANCE_MANAGER");
  const bookingAgent=await actor("BOOKING_AGENT");
  const financeTenant=finance.portals.find((p:any)=>p.kind==="tenant"&&p.roles.includes("FINANCE_MANAGER"));
  const companyTenant=company.portals.find((p:any)=>p.kind==="tenant");
  assert.ok(companyTenant && financeTenant);
  const tenantId=companyTenant.tenantId;
  assert.equal(financeTenant.tenantId,tenantId,"Finance actor must belong to the same tenant");
  const { VehicleRepository, BookingRepository, ContractRepository, RentalRepository,
    VehicleAllocationRepository }=await import("@carhire/database");
  const vehicleRepo=new VehicleRepository();
  const bookingRepo=new BookingRepository();
  const contractRepo=new ContractRepository();
  const rentalRepo=new RentalRepository();
  const allocationRepo=new VehicleAllocationRepository();

  const tag=randomUUID().slice(0,8).toUpperCase();
  const vehicle=await vehicleRepo.create({
    tenantId, registrationPlate:"QA-"+tag, vin:"STAGE4-VIN-"+tag,
    make:"Sage",model:"Acceptance Car",category:"SUV",year:2026,
    lifecycleStatus:"ACTIVE",availabilityStatus:"ON_RENT",
    odometer:22000,fuelLevel:80,dailyRate:5000,
    transmission:"Automatic",fuelType:"Diesel",
  } as any);
  const booking=await bookingRepo.create(tenantId,{
    bookingNumber:"QA-BKG-"+tag, customerId:"qa-customer-"+tag,
    vehicleId:vehicle.id,assignedVehicleId:vehicle.id,
    pickupAt:"2026-10-10T10:00:00Z",returnAt:"2026-10-12T10:00:00Z",
    status:"ACTIVE",grossTotal:10000,
  } as any);
  const contract=await contractRepo.create(tenantId,{
    contractNumber:"QA-CTR-"+tag,bookingId:booking.id,
    customerId:booking.customerId,vehicleId:vehicle.id,
    primaryDriverId:"qa-driver-"+tag,status:"ACTIVE",
  } as any);
  const allocation=await allocationRepo.createAllocation(tenantId,{
    vehicleId:vehicle.id,allocationType:"BOOKING",
    sourceType:"BOOKING",sourceId:booking.id,
    startsAt:"2026-10-10T10:00:00Z",endsAt:"2026-10-12T10:00:00Z",
  });
  const rental=await rentalRepo.create(tenantId,{
    rentalNumber:"QA-RENTAL-"+tag,bookingId:booking.id,contractId:contract.id,
    handoverId:"qa-handover-"+tag,customerId:booking.customerId,
    vehicleId:vehicle.id,primaryDriverId:"qa-driver-"+tag,
    status:"FINAL_CALCULATION",
    scheduledStart:"2026-10-10T10:00:00Z",
    scheduledReturnAt:"2026-10-12T10:00:00Z",
    actualStart:"2026-10-10T10:00:00Z",
    actualEnd:"2026-10-12T10:00:00Z",
    checkoutOdometer:22000,checkoutFuelLevel:80,
    returnOdometer:22020,returnFuelLevel:80,
    pricingSnapshot:{currency:"KES",dailyRate:5000,totalDays:2,grossTotal:10000},
  } as any);
  await rentalRepo.saveReturnRecord(tenantId,{
    tenantId,rentalId:rental.id,status:"FINAL_CALCULATION",
    scheduledReturnAt:"2026-10-12T10:00:00Z",
    actualReturnAt:"2026-10-12T10:00:00Z",
    returnOdometer:22020,returnFuelLevel:80,
  } as any);
  await rentalRepo.saveFinalCalculation(tenantId,{
    tenantId,rentalId:rental.id,bookingId:booking.id,
    startOdometer:22000,returnOdometer:22020,totalDistanceKm:20,
    allowedDistanceKm:200,excessDistanceKm:0,excessKmRate:0,excessKmCharge:0,
    startFuelLevel:80,returnFuelLevel:80,fuelDeficitPercent:0,
    fuelDeficitLitres:0,fuelPricePerUnit:0,fuelDeficitCharge:0,fuelRefuelingFee:0,
    scheduledReturnAt:"2026-10-12T10:00:00Z",actualReturnAt:"2026-10-12T10:00:00Z",
    lateReturnDurationHours:0,gracePeriodHours:1,billableLateHours:0,lateReturnFee:0,
    damageCaseIds:[],totalDamageCharge:0,totalAdditionalFees:0,baseRentalAmount:10000,
    extensionsTotalAmount:0,grossFinalTotal:10000,totalTaxAmount:0,netFinalTotal:10000,
    depositHeldAmount:0,depositDeductionsTotal:0,depositRefundDue:0,
    depositAdditionalPaymentDue:0,depositSettlementStatus:"PENDING",
    isImmutable:false,lineItems:[],
  } as any);
  let checks=0;

  // Authorized Finance should see an unsealed saved calculation.
  const current=await ok(await call("/rentals/"+rental.id+"/final-calculation",finance.token,tenantId),
    "Finance calculation read");
  assert.equal(current.isImmutable,false);checks++;
  const wrongTenant=await call("/rentals/"+rental.id+"/final-calculation",finance.token,"another-tenant");
  assert.equal(wrongTenant.status,403,"Cross-tenant facts must be inaccessible");checks++;
  const forbidden=await call("/rentals/"+rental.id+"/deposit-settlement",
    bookingAgent.token,tenantId,{settlementStatus:"SETTLED"});
  assert.equal(forbidden.status,403,"Booking Agent must not finalize settlement");checks++;
  const premature=await call("/rentals/"+rental.id+"/complete",
    company.token,tenantId,{releaseVehicleToStatus:"AVAILABLE"});
  assert.equal(premature.ok,false,"Completion without sealed settlement must fail");checks++;

  const sealed=await ok(await call("/rentals/"+rental.id+"/deposit-settlement",
    finance.token,tenantId,{settlementStatus:"SETTLED",notes:"No remaining customer balance."}),
    "Zero-balance final settlement");
  assert.equal(sealed.isImmutable,true);assert.equal(sealed.depositSettlementStatus,"SETTLED");
  assert.equal((await rentalRepo.findById(rental.id,tenantId))?.state,"DEPOSIT_PROCESSING");
  checks+=2;
  const financeComplete=await call("/rentals/"+rental.id+"/complete",
    finance.token,tenantId,{releaseVehicleToStatus:"AVAILABLE"});
  assert.equal(financeComplete.status,403,"Finance manager cannot finalize vehicle release");
  checks++;
  const completeBody={releaseVehicleToStatus:"AVAILABLE",
    idempotencyKey:"qa-complete-"+tag,notes:"Isolated Stage 4 acceptance"};
  const completed=await ok(await call("/rentals/"+rental.id+"/complete",
    company.token,tenantId,completeBody),"authorized completion");
  assert.equal(completed.state,"COMPLETED");checks++;
  const replay=await ok(await call("/rentals/"+rental.id+"/complete",
    company.token,tenantId,completeBody),"retry");
  assert.equal(replay.id,completed.id);checks++;
  assert.equal((await bookingRepo.findById(booking.id,tenantId))?.status,"COMPLETED");checks++;
  assert.equal((await contractRepo.findById(contract.id,tenantId))?.status,"COMPLETED");checks++;
  assert.equal((await vehicleRepo.findById(vehicle.id,tenantId))?.availabilityStatus,"AVAILABLE");checks++;
  assert.equal((await vehicleRepo.findById(vehicle.id,tenantId))?.odometer,22020);checks++;
  assert.equal((await allocationRepo.findById(allocation.id,tenantId))?.status,"RELEASED");checks++;
  assert.equal((await rentalRepo.getReturnRecord(rental.id,tenantId))?.status,"COMPLETED");checks++;

  // New login/session proves facts are durable, rather than React optimistic state.
  const freshCompany=await actor("COMPANY_OWNER");
  const reloaded=await ok(await call("/rentals/"+rental.id,freshCompany.token,tenantId),
    "new-session completed rental");
  assert.equal(reloaded.state,"COMPLETED");checks++;
  console.log("PASS Stage 4 isolated live API: "+checks+
    " lifecycle, permission, retry and independent-session assertions; no real money moved.");
}
main().catch(error=>{console.error("Stage 4 live acceptance failed:",error.message||error);process.exitCode=1;});
