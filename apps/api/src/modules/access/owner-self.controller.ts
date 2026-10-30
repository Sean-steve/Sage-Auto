import { Router } from "express";
import { z } from "zod";
import {
  VehicleRepository, VehicleOwnershipRepository, RentalRepository,
  InspectionRepository, OwnerSettlementRepository, VehicleDocumentRepository, VehicleOwnerRepository,
} from "@carhire/database";
import type { AccessService } from "./access.service";
import {OwnerProtectedActions,agreementDigest} from "./owner-protected-actions";
import {fail} from "./access.service";
import type {FileAccessService} from "../files/application/services/file-access.service";
import {FileRepository} from "@carhire/database";
import type { OwnerSettlementsService } from "../owner-settlements/application/owner-settlements.service";

const portalQuery = z.object({ portal: z.string().min(1) });
const pageQuery=z.object({
  portal:z.string().min(1),offset:z.coerce.number().int().min(0).default(0),limit:z.coerce.number().int().min(1).max(100).default(25)
});
const disputeBody = z.object({
  portal: z.string().min(1),
  reason: z.string().trim().min(8).max(1000),
}).strict();

/**
 * Owner-specific, read-first facade registered under authenticated /access.
 * Does not pass through the generic tenant-wide router and never grants
 * access to fleet, company finance, settlement approval or payment mutation.
 */
export function createOwnerSelfController(access: AccessService, settlements: OwnerSettlementsService,files:FileAccessService): Router {
  const router = Router();
  const protectedActions=new OwnerProtectedActions(access);
  type Request = any;
  const run = (handler:(req:Request)=>Promise<unknown>) => (req:Request,res:any,next:any) =>
    Promise.resolve().then(()=>handler(req)).then(data=>res.json({data})).catch(next);
  const resolve = async (req:Request,tenantId:string) =>
    access.vehicleOwnerSelf(req.auth.userId,tenantId);
  const fromQuery = (req:Request) => portalQuery.parse(req.query).portal;

  async function ownerAssets(tenantId:string, ownerId:string) {
    const ownershipRepo=new VehicleOwnershipRepository();
    const ownerships=await ownershipRepo.findByOwnerId(ownerId,tenantId);
    const repo=new VehicleRepository(),vehicles=[];
    // Owner-scoped lookup per historic agreement; never truncate at fleet
    // repository default pagination, and never leak reassigned vehicles.
    for(const id of new Set(ownerships.filter(o=>o.isActive).map(o=>o.vehicleId))) {
      const v=await repo.findById(id,tenantId);
      if(v?.ownerId===ownerId)vehicles.push(v);
    }
    return {ownerships,vehicles};
  }
  const pagination=(req:Request)=>pageQuery.parse(req.query);

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
        termsHash:agreementDigest(o),signature:((await protectedActions.signaturesFor(req.auth.userId,tenantId)).find(s=>s.agreementId===o.id))||null,
      };
    }));
  }));

  router.get("/rentals",run(async req=>{
    const {portal,offset,limit}=pagination(req);
    const {tenantId,owner}=await resolve(req,portal);
    const ownerships=await new VehicleOwnershipRepository().findByOwnerId(owner.id,tenantId);
    const results=await new RentalRepository().findOwnerHistory(tenantId,ownerships.map(o=>({
      vehicleId:o.vehicleId,startDate:o.startDate,endDate:o.endDate,
    })),{offset,limit});
    const repo=new VehicleRepository();
    const items=await Promise.all(results.items.map(async r=>{
      const v=await repo.findById(r.vehicleId,tenantId);
      return {
        id:r.id,reference:r.rentalNumber,registration:v?.registrationPlate||"Vehicle retired",
        status:r.state,scheduledStart:r.scheduledStart,scheduledEnd:r.scheduledEnd,
        actualStart:r.actualStart||null,actualEnd:r.actualEnd||null,
      };
    }));
    return {...results,items,offset,limit};
  }));

  router.get("/condition",run(async req=>{
    const {portal,offset,limit}=pagination(req);
    const {tenantId,owner}=await resolve(req,portal);
    const ownerships=await new VehicleOwnershipRepository().findByOwnerId(owner.id,tenantId);
    // Inspection reads are always filtered through historically authorized
    // rental periods rather than the tenant-wide inspection collection.
    const rentals=await new RentalRepository().findOwnerHistory(tenantId,ownerships.map(o=>({
      vehicleId:o.vehicleId,startDate:o.startDate,endDate:o.endDate,
    })),{offset,limit});
    const result:any[]=[];
    const inspectionRepo=new InspectionRepository();
    for(const rental of rentals.items)for(const inspection of await inspectionRepo.findByRentalId(rental.id,tenantId)) {
      const v=await new VehicleRepository().findById(rental.vehicleId,tenantId);
      result.push({id:inspection.id,reference:rental.rentalNumber,registration:v?.registrationPlate||"Vehicle retired",
        status:inspection.status,type:inspection.inspectionType,createdAt:inspection.createdAt});
    }
    return {items:result,totalRentals:rentals.total,hasMore:rentals.hasMore,offset,limit};
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

  // Signed owner acknowledgement is immutable and bound to the exact
  // historical agreement version and terms hash. No operator finance mutation.
  router.post("/agreements/:id/sign",run(async req=>
    protectedActions.sign(req.auth.userId,req.params.id,req.body,req.ip,req.headers["user-agent"])
  ));

  router.get("/documents",run(async req=>{
    const {tenantId,owner}=await resolve(req,fromQuery(req));
    const {vehicles}=await ownerAssets(tenantId,owner.id);
    const documentRepo=new VehicleDocumentRepository(),fileRepo=new FileRepository();
    const permitted=["LOGBOOK_TITLE","LEASE_AGREEMENT","INSURANCE_CERTIFICATE","NTSA_INSPECTION","PSV_LICENSE","SERVICE_RECORD"];
    const rows:any[]=[];
    for(const v of vehicles)for(const doc of await documentRepo.findByVehicleId(v.id,tenantId)){
      if(!permitted.includes(doc.documentType)||doc.verificationStatus!=="VERIFIED"||!doc.fileId)continue;
      const file=await fileRepo.findById(doc.fileId,tenantId);
      if(!file||file.status!=="ACTIVE"||file.scanStatus!=="CLEAN"||file.deletedAt||file.classification!=="PRIVATE")continue;
      rows.push({id:doc.id,documentType:doc.documentType,vehicle:v.registrationPlate,
        filename:file.sanitizedFilename,expiresAt:doc.expiresAt||null,verified:true});
    }
    return rows;
  }));

  router.get("/documents/:id/download",run(async req=>{
    const {tenantId,owner}=await resolve(req,fromQuery(req));
    const doc=await new VehicleDocumentRepository().findById(req.params.id,tenantId);
    if(!doc||!doc.fileId||doc.verificationStatus!=="VERIFIED"||
      !["LOGBOOK_TITLE","LEASE_AGREEMENT","INSURANCE_CERTIFICATE","NTSA_INSPECTION","PSV_LICENSE","SERVICE_RECORD"].includes(doc.documentType)) {
      return fail("Verified owner document not found",404);
    }
    const {vehicles}=await ownerAssets(tenantId,owner.id);
    if(!vehicles.some(v=>v.id===doc.vehicleId))return fail("Owner document not available to this account",403);
    const file=await new FileRepository().findById(doc.fileId,tenantId);
    if(!file||file.status!=="ACTIVE"||file.scanStatus!=="CLEAN"||file.deletedAt||file.classification!=="PRIVATE")
      return fail("Document is not cleared for owner download",403);
    // Recheck linked owner/active membership immediately before issuing a
    // short-lived private object-store URL. Never expose public file URLs.
    await resolve(req,tenantId);
    return files.generateDownloadUrl(tenantId,file.id,{
      id:req.auth.userId,type:"OWNER",ipAddress:req.ip,userAgent:req.headers["user-agent"],
      permissions:[],
    },{disposition:"attachment",expiresInSeconds:60});
  }));

  router.post("/payout/request-change",run(async req=>
    protectedActions.requestPayoutChange(req.auth.userId,req.body)
  ));
  router.post("/payout/verify-change",run(async req=>
    protectedActions.confirmPayoutChange(req.auth.userId,req.body)
  ));

  router.get("/profile",run(async req=>{
    const {tenantId,owner,tenant}=await resolve(req,fromQuery(req));
    return {company:tenant.name,ownerName:owner.name,email:owner.email,
      phone:owner.phone,status:owner.status,ownerType:owner.ownerType,
      payoutMethodConfigured:Boolean(owner.payoutBank||owner.payoutMpesaNumber),
      payoutMethodEditingAvailable:Boolean(process.env.OWNER_PAYOUT_ENCRYPTION_KEY && process.env.OWNER_PAYOUT_ENCRYPTION_KEY.length>=32),
      note:"Payout changes require a short-lived code sent to your verified Sage Auto account email."};
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
