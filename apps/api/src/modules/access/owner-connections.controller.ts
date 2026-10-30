import {Router} from "express";
import {z} from "zod";
import {VehicleOwnerRepository,VehicleOwnershipRepository} from "@carhire/database";
import {AccessService,fail} from "./access.service";
import {OwnerProtectedActions,agreementDigest} from "./owner-protected-actions";

const query=z.object({
  portal:z.string().min(1),
  page:z.coerce.number().int().min(1).default(1),
  limit:z.coerce.number().int().min(1).max(100).default(50),
}).strict();

/**
 * Operator-facing partner connection status. Never route external Vehicle
 * Owners through this endpoint and never provide beneficiary account details.
 * All fields are derived from the same canonical owner, agreement, signature
 * and tenant membership stores used by the personal Vehicle Owner portal.
 */
export function createOwnerConnectionsController(access:AccessService):Router {
  const router=Router();
  const signatures=new OwnerProtectedActions(access);
  router.get("/",async(req:any,res:any,next:any)=>{
    try{
      const input=query.parse(req.query);
      const portal=await access.portal(req.auth.userId,input.portal);
      const permission=portal.permissions.includes("*")||portal.permissions.includes("vehicle_owner.read");
      if(portal.kind!=="tenant"||portal.tenantId!==input.portal||
        !permission||portal.roles.includes("VEHICLE_OWNER")){
        return fail("Rental company vehicle-owner read permission required",403);
      }
      const tenantId=portal.tenantId;
      const {owners,total}=await new VehicleOwnerRepository().findAll(tenantId,{page:input.page,limit:input.limit});
      const memberships=await access.memberships.listByTenantId(tenantId);
      const ownershipRepo=new VehicleOwnershipRepository();
      const items=await Promise.all(owners.map(async owner=>{
        const linked=[...access.links.values()].filter(link=>
          link.tenantId===tenantId&&link.kind==="VEHICLE_OWNER"&&link.recordId===owner.id
        );
        const activeLinked=linked.some(link=>memberships.some(member=>
          member.userId===link.userId&&member.role==="VEHICLE_OWNER"&&member.status==="ACTIVE"
        ));
        const agreements=await ownershipRepo.findByOwnerId(owner.id,tenantId);
        const receipts=signatures.signaturesForOperator(tenantId,owner.id);
        const current=agreements.filter(a=>a.isActive&&!a.endDate);
        const signed=current.filter(a=>receipts.some(receipt=>
          receipt.agreementId===a.id&&receipt.termsHash===agreementDigest(a)
        ));
        const stale=current.filter(a=>receipts.some(receipt=>
          receipt.agreementId===a.id&&receipt.termsHash!==agreementDigest(a)
        ));
        return {
          id:owner.id,ownerStatus:owner.status,
          portalConnection:activeLinked?"ACTIVE":"NOT_CONNECTED",
          activeAgreements:current.length,signedAgreements:signed.length,
          unsignedAgreements:current.length-signed.length,
          staleAgreementAcceptances:stale.length,
          payoutMethodConfigured:Boolean(owner.payoutMpesaNumber||(owner.payoutBank&&owner.payoutAccountNumber)),
          agreements:current.map(a=>{
            const hash=agreementDigest(a);
            const receipt=receipts.find(r=>r.agreementId===a.id);
            return {id:a.id,vehicleId:a.vehicleId,
              signatureStatus:receipt?.termsHash===hash?"SIGNED":receipt?"STALE_TERMS":"AWAITING_OWNER",
              signedAt:receipt?.termsHash===hash?receipt.acceptedAt:null,
              termsHash:hash};
          }),
        };
      }));
      return res.json({data:{items,total,page:input.page,limit:input.limit,
        hasMore:input.page*input.limit<total}});
    }catch(error){return next(error);}
  });
  return router;
}
