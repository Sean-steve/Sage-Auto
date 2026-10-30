import {createCipheriv,createDecipheriv,createHash,randomBytes,randomInt,timingSafeEqual} from "node:crypto";
import {z} from "zod";
import {AuditRepository,VehicleOwnerRepository,VehicleOwnershipRepository} from "@carhire/database";
import {createRecordStore,withRecordTransaction} from "../../../../../packages/database/src/record-store";
import type {AccessService} from "./access.service";
import {fail} from "./access.service";

const requestSchema=z.discriminatedUnion("kind",[
  z.object({portal:z.string().min(1),kind:z.literal("MPESA"),mpesaNumber:z.string().regex(/^\+?\d{10,15}$/)}).strict(),
  z.object({portal:z.string().min(1),kind:z.literal("BANK"),bank:z.string().trim().min(2).max(100),accountNumber:z.string().trim().min(5).max(40).regex(/^[A-Za-z0-9\-/]+$/)}).strict(),
]);
export const confirmPayoutSchema=z.object({portal:z.string().min(1),code:z.string().regex(/^\d{6}$/)}).strict();
export const signAgreementSchema=z.object({
  portal:z.string().min(1),
  typedName:z.string().trim().min(2).max(140),
  consent:z.literal(true),
  termsHash:z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
type PayoutChange={tenantId:string;ownerId:string;userId:string;codeHash:string;payload:string;expiresAt:string;attempts:number;sentAt:string};
type AgreementSignature={id:string;tenantId:string;ownerId:string;agreementId:string;userId:string;typedName:string;termsHash:string;agreementVersion:number;acceptedAt:string;consentStatement:string;ipAddress?:string;userAgent?:string};
const payoutChanges=createRecordStore<string,PayoutChange>("access:owner-payout-changes");
const signatures=createRecordStore<string,AgreementSignature>("access:owner-agreement-signatures");
const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
const keyFor=(userId:string,tenantId:string)=>`${tenantId}:${userId}`;
const nameNorm=(name:string)=>name.trim().replace(/\s+/g," ").toLocaleLowerCase("en");

function secret():Buffer {
  const key=process.env.OWNER_PAYOUT_ENCRYPTION_KEY;
  if(!key||key.length<32||/dev|change.me|example|test-secret/i.test(key)) {
    return fail("Owner payout-change encryption is not configured. Set OWNER_PAYOUT_ENCRYPTION_KEY to a unique 32+ character secret.",503);
  }
  return createHash("sha256").update(key).digest();
}
function encrypt(value:unknown):string {
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",secret(),iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
  return [iv,cipher.getAuthTag(),data].map(v=>v.toString("base64url")).join(".");
}
function decrypt(value:string):any {
  const [iv,tag,encrypted]=value.split(".");
  const d=createDecipheriv("aes-256-gcm",secret(),Buffer.from(iv,"base64url"));
  d.setAuthTag(Buffer.from(tag,"base64url"));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(encrypted,"base64url")),d.final()]).toString("utf8"));
}
export function agreementDigest(agreement:{
  id:string;tenantId:string;ownerId:string;vehicleId:string;ownershipType:string;
  revenueSharePercent:number;fixedMonthlyPayout?:number;allowableExpenseDeductions:boolean;
  termsSnapshot?:string;startDate:string;endDate?:string;version?:number;
}) {
  return sha(JSON.stringify({
    id:agreement.id,tenantId:agreement.tenantId,ownerId:agreement.ownerId,vehicleId:agreement.vehicleId,
    type:agreement.ownershipType,share:agreement.revenueSharePercent,
    fixed:agreement.fixedMonthlyPayout??null,deductions:agreement.allowableExpenseDeductions,
    terms:agreement.termsSnapshot||"",start:agreement.startDate,end:agreement.endDate||null,version:agreement.version||1,
  }));
}
export class OwnerProtectedActions {
  constructor(private readonly access:AccessService){}
  private async owner(userId:string,tenantId:string){return this.access.vehicleOwnerSelf(userId,tenantId);}
  async signaturesFor(userId:string,portal:string) {
    const {owner,tenantId}=await this.owner(userId,portal);
    return [...signatures.values()].filter(s=>s.ownerId===owner.id&&s.tenantId===tenantId)
      .map(({agreementId,termsHash,typedName,acceptedAt,agreementVersion})=>({agreementId,termsHash,typedName,acceptedAt,agreementVersion}));
  }
  async sign(userId:string,agreementId:string,body:unknown,ipAddress?:string,userAgent?:string) {
    const data=signAgreementSchema.parse(body);
    return withRecordTransaction(async()=>{
      const {owner,tenantId}=await this.owner(userId,data.portal);
      const agreement=await new VehicleOwnershipRepository().findById(agreementId,tenantId);
      if(!agreement||agreement.ownerId!==owner.id) return fail("Agreement is not linked to this owner",403);
      if(!agreement.isActive||agreement.endDate)return fail("Only current agreements may be accepted",409);
      if(!agreement.termsSnapshot?.trim())return fail("Agreement terms are not documented; contact the rental company",409);
      if(nameNorm(data.typedName)!==nameNorm(owner.name))return fail("Typed legal name must match your registered owner name",403);
      const hash=agreementDigest(agreement);
      if(hash!==data.termsHash)return fail("Agreement has changed. Review the latest terms before signing.",409);
      const key=`${tenantId}:${agreementId}:${owner.id}`;
      const existing=signatures.get(key);
      if(existing){
        if(existing.termsHash!==hash)return fail("A previously accepted agreement changed; request a new agreement version",409);
        return {agreementId,acceptedAt:existing.acceptedAt,typedName:existing.typedName,termsHash:existing.termsHash,alreadyAccepted:true};
      }
      const signature:AgreementSignature={
        id:crypto.randomUUID(),tenantId,ownerId:owner.id,agreementId,userId,
        typedName:data.typedName,termsHash:hash,agreementVersion:agreement.version||1,
        acceptedAt:new Date().toISOString(),
        consentStatement:"I have reviewed and accept the disclosed ownership agreement terms, and intend my typed name to be my electronic signature.",
        ipAddress,userAgent,
      };
      signatures.set(key,signature);
      await new AuditRepository().record({
        tenantId,actorId:userId,actorType:"USER",action:"OWNER_AGREEMENT_SIGNED",
        resourceType:"VehicleOwnership",resourceId:agreementId,
        metadata:{ownerId:owner.id,termsHash:hash,agreementVersion:agreement.version||1},
      });
      return {agreementId,acceptedAt:signature.acceptedAt,typedName:signature.typedName,termsHash:hash,alreadyAccepted:false};
    });
  }

  async requestPayoutChange(userId:string,input:unknown) {
    const data=requestSchema.parse(input);
    const {owner,tenantId}=await this.owner(userId,data.portal);
    const user=await this.access.user(userId,true);
    const id=keyFor(userId,tenantId);
    const pending=payoutChanges.get(id);
    if(pending && new Date(pending.sentAt).getTime()>Date.now()-60_000) return fail("A verification email was recently requested. Try again shortly.",429);
    const code=String(randomInt(0,1000000)).padStart(6,"0");
    const candidate=data.kind==="MPESA"?{kind:"MPESA",mpesaNumber:data.mpesaNumber}:
      {kind:"BANK",bank:data.bank,accountNumber:data.accountNumber};
    const payload=encrypt(candidate);
    const record:PayoutChange={
      tenantId,ownerId:owner.id,userId,payload,codeHash:sha(`${id}:${code}`),
      expiresAt:new Date(Date.now()+10*60_000).toISOString(),attempts:0,sentAt:new Date().toISOString()
    };
    payoutChanges.set(id,record);
    try {await this.access.email.sendOwnerPayoutVerificationEmail(user.email,code);}
    catch {payoutChanges.delete(id);return fail("Verification email could not be delivered. Your payout method was not changed.",503);}
    await new AuditRepository().record({
      tenantId,actorId:userId,actorType:"USER",action:"OWNER_PAYOUT_CHANGE_REQUESTED",
      resourceType:"VehicleOwner",resourceId:owner.id,metadata:{kind:data.kind,expiresAt:record.expiresAt}
    });
    return {verificationSent:true,expiresAt:record.expiresAt,recipient:"Your verified account email",destinationType:data.kind};
  }

  async confirmPayoutChange(userId:string,input:unknown) {
    const data=confirmPayoutSchema.parse(input);
    return withRecordTransaction(async()=>{
      const {owner,tenantId}=await this.owner(userId,data.portal);
      const id=keyFor(userId,tenantId),pending=payoutChanges.get(id);
      if(!pending||pending.ownerId!==owner.id)return fail("No active payout destination verification request",409);
      if(Date.now()>Date.parse(pending.expiresAt)){payoutChanges.delete(id);return fail("Verification code expired. Request a new code.",410);}
      if(pending.attempts>=5)return fail("Verification attempts exceeded. Request a new code.",429);
      const expected=Buffer.from(pending.codeHash,"hex"),actual=Buffer.from(sha(`${id}:${data.code}`),"hex");
      if(!timingSafeEqual(expected,actual)){
        payoutChanges.set(id,{...pending,attempts:pending.attempts+1});
        return fail("Invalid verification code",403);
      }
      const change=decrypt(pending.payload);
      const updates=change.kind==="MPESA"
        ? {payoutMpesaNumber:change.mpesaNumber,payoutBank:undefined,payoutAccountNumber:undefined}
        : {payoutBank:change.bank,payoutAccountNumber:change.accountNumber,payoutMpesaNumber:undefined};
      await new VehicleOwnerRepository().update(owner.id,tenantId,updates,owner.version);
      payoutChanges.delete(id);
      await new AuditRepository().record({
        tenantId,actorId:userId,actorType:"USER",action:"OWNER_PAYOUT_DESTINATION_VERIFIED",
        resourceType:"VehicleOwner",resourceId:owner.id,
        metadata:{destinationType:change.kind,verifiedAt:new Date().toISOString()},
      });
      return {verified:true,destinationType:change.kind};
    });
  }
}
