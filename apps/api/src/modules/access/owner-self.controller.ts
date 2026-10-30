import { Router } from "express";
import { z } from "zod";
import {
  VehicleRepository, VehicleOwnershipRepository, RentalRepository,
  InspectionRepository, OwnerSettlementRepository,
} from "@carhire/database";
import type { AccessService } from "./access.service";
import type { OwnerSettlementsService } from "../owner-settlements/application/owner-settlements.service";

const portalQuery = z.object({ portal: z.string().min(1) });
const disputeBody = z.object({
  portal: z.string().min(1),
  reason: z.string().trim().min(8).max(1000),
}).strict();

/**
 * Owner-specific, read-first facade registered under authenticated /access.
 * Does not pass through the generic tenant-wide router and never grants
 * access to fleet, company finance, settlement approval or payment mutation.
 */
export function createOwnerSelfController(access: AccessService, settlements: OwnerSettlementsService) {
  const router = Router();
  type Request = any;
  const run = (handler:(req:Request)=>Promise<unknown>) => (req:Request,res:any,next:any) =>
    Promise.resolve().then(()=>handler(req)).then(data=>res.json({data})).catch(next);
  const resolve = async (req:Request,tenantId:string) =>
    access.vehicleOwnerSelf(req.auth.userId,tenantId);
  const fromQuery = (req:Request) => portalQuery.parse(req.query).portal;

  async function ownerAssets(tenantId:string, ownerId:string) {
    const ownershipRepo = new VehicleOwnershipRepository();
    const ownerships = await ownershipRepo.findByOwnerId(ownerId,tenantId);
    const ownedVehicleIds = new Set(ownerships.filter(o=>o.isActive).map(o=>o.vehicleId));
    const fleet = (await new VehicleRepository().findAll(tenantId,{ownerId})).vehicles;
    const cars = new Map(fleet.filter(v=>ownedVehicleIds.has(v.id)).map(v=>[v.id,v]));
    // A valid historical agreement does not grant access to another owner's
    // currently allocated vehicle. Current owner-linked fleet is the boundary.
    return {ownerships,vehicles:[...cars.values()]};
  }

  async function ownerSettlements(tenantId:string,ownerId:string) {
    const rows = await settlements.listMySettlements(tenantId,{userId:"owner-read-model",ownerRecordId:ownerId});
    const repo = new OwnerSettlementRepository();
    return Promise.all(rows.map(async s=>{
      const payable = await repo.findPayableBySettlementId(s.id,tenantId);
      return {
        id:s.id,reference:s.settlementNumber,periodStart:s.periodStart,periodEnd:s.periodEnd,
        status:s.status,currency:s.currency,eligibleRevenue:s.totalEligibleRentalRevenue,
        grossRevenue:s.grossRevenue,ownerGrossShare:s.ownerGrossRevenueShare,
        deductions:s.totalDeductions,netPayable:s.netPayoutAmount,
        payableStatus:payable?.status||null,paidAt:payable?.payoutCompletedAt||null,
        disputedAt:s.disputedAt||null,disputeReason:s.disputeReason||null,
      };
    }));
  }

  router.get("/overview",run(async req=>{
    const {tenantId,owner,tenant}=await resolve(req,fromQuery(req));
    const {vehicles}=await ownerAssets(tenantId,owner.id);
    const payments=await ownerSettlements(tenantId,owner.id);
    return {
      company:{id:tenant.id,name:tenant.name,currency:tenant.currency},
      owner:{name:owner.name,status:owner.status},
      fleetCount:vehicles.length,
      available:vehicles.filter(v=>v.availabilityStatus==="AVAILABLE").length,
      settlementCount:payments.length,
      unpaidSettlementCount:payments.filter(s=>s.payableStatus!=="PAID").length,
      lastSettlements:payments.slice(0,5),
      note:"Amounts and payment authority come from the settlement ledger, never rental estimates.",
    };
  }));

  router.get("/vehicles",run(async req=>{
    const {tenantId,owner}=await resolve(req,fromQuery(req));
    const {vehicles,ownerships}=await ownerAssets(tenantId,owner.id);
    return vehicles.map(v=>{
      const o=ownerships.find(x=>x.isActive&&x.vehicleId===v.id);
      return {
        id:v.id,registration:v.registrationPlate,name:`${v.make} ${v.model}`,
        status:v.availabilityStatus,ownershipType:o?.ownershipType,
        revenueSharePercent:o?.revenueSharePercent,agreementStart:o?.startDate,
        fixedMonthlyPayout:o?.fixedMonthlyPayout,
      };
    });
  }));

  router.get("/agreements",run(async req=>{
    const {tenantId,owner}=await resolve(req,fromQuery(req));
    const ownerships=await new VehicleOwnershipRepository().findByOwnerId(owner.id,tenantId);
    return Promise.all(ownerships.map(async o=>{
      const v=await new VehicleRepository().findById(o.vehicleId,tenantId);
      return {
        id:o.id,vehicleId:o.vehicleId,vehicle:v?`${v.make} ${v.model}`:"Vehicle no longer available",
        registration:v?.registrationPlate,ownershipType:o.ownershipType,
        revenueSharePercent:o.revenueSharePercent,fixedMonthlyPayout:o.fixedMonthlyPayout,
        deductionsAllowed:o.allowableExpenseDeductions,startDate:o.startDate,
        endDate:o.endDate,active:o.isActive,termsSnapshot:o.termsSnapshot||null,
      };
    }));
  }));

  router.get("/rentals",run(async req=>{
    const {tenantId,owner}=await resolve(req,fromQuery(req));
    const {vehicles}=await ownerAssets(tenantId,owner.id);
    const vehicleMap=new Map(vehicles.map(v=>[v.id,v.registrationPlate]));
    if(!vehicleMap.size)return [];
    // Until scoped rental repository pagination is available, never imply
    // the result is a complete historical performance ledger.
    const results=await new RentalRepository().findMany(tenantId,{limit:1000});
    return results.items.filter(r=>vehicleMap.has(r.vehicleId)).map(r=>({
      id:r.id,reference:r.rentalNumber,registration:vehicleMap.get(r.vehicleId),
      status:r.state,scheduledStart:r.scheduledStart,scheduledEnd:r.scheduledEnd,
      actualStart:r.actualStart||null,actualEnd:r.actualEnd||null,
    }));
  }));

  router.get("/condition",run(async req=>{
    const {tenantId,owner}=await resolve(req,fromQuery(req));
    const {vehicles}=await ownerAssets(tenantId,owner.id);
    const vehicleMap=new Map(vehicles.map(v=>[v.id,v.registrationPlate]));
    if(!vehicleMap.size)return [];
    const rentals=(await new RentalRepository().findMany(tenantId,{limit:1000})).items.filter(r=>vehicleMap.has(r.vehicleId));
    const inspectionRepo=new InspectionRepository();
    const result:any[]=[];
    for(const rental of rentals)for(const inspection of await inspectionRepo.findByRentalId(rental.id,tenantId)) {
      result.push({
        id:inspection.id,reference:rental.rentalNumber,registration:vehicleMap.get(rental.vehicleId),
        status:inspection.status,type:inspection.inspectionType,createdAt:inspection.createdAt,
      });
    }
    return result;
  }));

  router.get("/settlements",run(async req=>{
    const {tenantId,owner}=await resolve(req,fromQuery(req));
    return ownerSettlements(tenantId,owner.id);
  }));

  router.get("/settlements/:id/statement",run(async req=>{
    const {tenantId,owner}=await resolve(req,fromQuery(req));
    const statement=await settlements.getMyStatement(tenantId,req.params.id,{
      userId:req.auth.userId,ownerRecordId:owner.id,
    });
    // Only expose account-safe information. The owner is not offered raw
    // destination bank details, identity numbers or tax identifiers.
    const {id,name,companyName,email,phone}=statement.owner;
    return {...statement,owner:{id,name,companyName,email,phone}};
  }));

  router.post("/settlements/:id/dispute",run(async req=>{
    const input=disputeBody.parse(req.body);
    const {tenantId,owner}=await resolve(req,input.portal);
    const updated=await settlements.disputeMySettlement(tenantId,req.params.id,input.reason,{
      userId:req.auth.userId,ownerRecordId:owner.id,
    });
    return {id:updated.id,reference:updated.settlementNumber,status:updated.status,disputedAt:updated.disputedAt};
  }));

  router.get("/profile",run(async req=>{
    const {tenantId,owner,tenant}=await resolve(req,fromQuery(req));
    return {company:tenant.name,ownerName:owner.name,email:owner.email,
      phone:owner.phone,status:owner.status,ownerType:owner.ownerType,
      payoutMethodConfigured:Boolean(owner.payoutBank||owner.payoutMpesaNumber),
      payoutMethodEditingAvailable:false,
      note:"Contact the rental company to verify or update payout destination details."};
  }));

  router.get("/operators",run(async req=>{
    const {tenantId,owner,tenant}=await resolve(req,fromQuery(req));
    const invited=[...access.invitations.values()].filter(i=>i.scope==="tenant"&&i.tenantId===tenantId&&
      i.email===owner.email.toLowerCase()&&i.role==="VEHICLE_OWNER");
    return {company:tenant.name,companyId:tenant.id,connected:true,
      invitations:invited.map(i=>({status:i.status,delivery:i.delivery,expiresAt:i.expiresAt}))};
  }));

  return router;
}
