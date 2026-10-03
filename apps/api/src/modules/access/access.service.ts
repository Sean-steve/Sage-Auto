import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRecordStore, claimRecord, withRecordTransaction } from '../../../../../packages/database/src/record-store';
import { UserRepository, TenantRepository, TenantMembershipRepository, InMemoryPlatformMembershipRepository, BookingRepository, CustomerRepository, VehicleRepository, DriverRepository, VehicleOwnerRepository, CrossTenantViolationError, InMemoryTenantWebsiteRepository } from '@carhire/database';
import { TENANT_SYSTEM_ROLES, PLATFORM_ROLES, accessSections } from '@carhire/constants';
import type { AuthorizationModule } from '../authorization/authorization.module';
import type { TenancyModule } from '../tenancy/tenancy.module';
import type { IEmailDeliveryPort } from '../identity/domain/ports';

export const fail = (message:string,statusCode=400):never => {throw Object.assign(new Error(message),{statusCode});};
const now=()=>new Date().toISOString();
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export type AccountState={intent?:'company'|'renter';site?:string;name?:string;companyName?:string;phone?:string;completedAt?:string};
type Invitation={id:string;scope:'platform'|'tenant';tenantId?:string;email:string;role:string;linkedRecordId?:string;createdBy:string;tokenHash:string;expiresAt:string;status:'PENDING'|'ACCEPTED'|'REVOKED';delivery:'PENDING'|'SENT'|'FAILED';acceptedBy?:string};
type Link={userId:string;tenantId:string;kind:'RENTER'|'DRIVER'|'VEHICLE_OWNER';recordId?:string;phone?:string};
export class AccessService {
  readonly accounts=createRecordStore<string,AccountState>('access:accounts');
  readonly invitations=createRecordStore<string,Invitation>('access:invitations');
  readonly links=createRecordStore<string,Link>('access:links');
  readonly users=new UserRepository(); readonly tenants=new TenantRepository(); readonly memberships=new TenantMembershipRepository();
  constructor(readonly authorization:AuthorizationModule,readonly tenancy:TenancyModule,readonly email:IEmailDeliveryPort) {}
  async user(id:string,verified=false) {
    const user=await this.users.findById(id);
    if(!user || user.status!=='ACTIVE') return fail('Active account required',401);
    if(verified && !user.emailVerified && !user.emailVerifiedAt) return fail('Verify your email before continuing',403);
    return user;
  }
  async context(userId:string) {
    const user=await this.user(userId); const portals:any[]=[];
    const platform=await this.authorization.platformMembershipRepository.findByUserId(userId);
    if(platform?.status==='ACTIVE' && user.isPlatformStaff) {
      const roles=await this.authorization.platformRoleRepository.getRolesForStaff(platform.id);
      const permissions=await this.authorization.platformRoleRepository.getPermissionsForStaff(platform.id);
      portals.push({id:'platform',kind:'platform',name:'Car Hire OS',roles:roles.map(r=>r.code),permissions,sections:accessSections(roles.map(r=>r.code),permissions)});
    }
    for(const membership of await this.memberships.listByUserId(userId)) {
      if(membership.status!=='ACTIVE') continue;
      try {
        const context=await this.tenancy.resolverService.resolveContext(userId,membership.tenantId);
        portals.push({id:membership.tenantId,kind:'tenant',name:context.tenantName,tenantId:membership.tenantId,roles:context.roles,permissions:context.permissions,sections:accessSections(context.roles,context.permissions)});
      } catch { /* An inactive company is never an accessible portal. */ }
    }
    for(const link of this.links.values()) if(link.userId===userId && link.kind==='RENTER') {
      const tenant=await this.tenants.findById(link.tenantId);
      const website=await new InMemoryTenantWebsiteRepository().findByTenantId(link.tenantId);
      if(tenant?.status==='ACTIVE') portals.push({id:`renter:${tenant.id}`,tenantId:tenant.id,kind:'renter',site:website?.subdomain||tenant.slug,name:tenant.name,roles:['RENTER'],permissions:[],sections:accessSections(['RENTER'],[])});
    }
    return {reviewMode:process.env.ACCESS_REVIEW_MODE==='true' && !['production','staging'].includes(process.env.NODE_ENV||''),user:{id:user.id,email:user.email,fullName:user.fullName,emailVerified:Boolean(user.emailVerified||user.emailVerifiedAt)},onboarding:this.accounts.get(userId)||{},portals};
  }
  async portal(userId:string,id:string) {
    await this.user(userId,true);
    return (await this.context(userId)).portals.find(p=>p.id===id) || fail('This portal is not available to your account',403);
  }
  async saveProfile(userId:string,data:AccountState) {
    await this.user(userId);
    const saved={...this.accounts.get(userId),...data}; this.accounts.set(userId,saved); return saved;
  }
  async complete(userId:string) {
    return withRecordTransaction(()=>this.completeRecords(userId));
  }
  private async completeRecords(userId:string) {
    const user=await this.user(userId,true), state=this.accounts.get(userId)||{};
    if(state.intent==='renter') {
      const website=await new InMemoryTenantWebsiteRepository().findBySubdomain(state.site||'');
      const tenant=website?await this.tenants.findById(website.tenantId):await this.tenants.findBySlug(state.site||'');
      if(!tenant || tenant.status!=='ACTIVE') return fail('Rental company not found',404);
      const key=`${userId}:${tenant.id}:RENTER`;
      if(!this.links.has(key)) this.links.set(key,{userId,tenantId:tenant.id,kind:'RENTER',phone:state.phone});
    } else if(state.intent==='company') {
      // A retry resumes the existing owned workspace instead of provisioning another.
      const existing=(await this.memberships.listByUserId(userId)).find(m=>m.role==='COMPANY_OWNER'&&m.status==='ACTIVE');
      if(!existing) await this.tenancy.provisioningService.provisionTenant(userId,{name:state.companyName||'',slug:(state.companyName||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')});
    } else return fail('Choose a company or renter account first');
    this.accounts.set(userId,{...state,completedAt:now()}); return this.context(userId);
  }
  async canInvite(userId:string,scope:'platform'|'tenant',tenantId?:string,role?:string) {
    const portal=await this.portal(userId,scope==='platform'?'platform':tenantId||'');
    if(scope==='platform') {
      if(!portal.roles.some((r:string)=>['PLATFORM_OWNER','PLATFORM_ADMIN'].includes(r))) return fail('Staff administration access required',403);
      if(role==='PLATFORM_OWNER') return fail('Platform ownership cannot be granted by invitation',403);
      if(role && !PLATFORM_ROLES[role]) return fail('Unknown platform role');
    } else {
      if(!portal.roles.some((r:string)=>['COMPANY_OWNER','TENANT_ADMIN'].includes(r))) return fail('Company administrator access required',403);
      if(role && !TENANT_SYSTEM_ROLES[role]) return fail('Unknown company role');
      if(role==='COMPANY_OWNER' && !portal.roles.includes('COMPANY_OWNER')) return fail('Only a company owner can invite another owner',403);
    }
    return portal;
  }
  async validateLink(tenantId:string,role:string,recordId?:string|null) {
    if(!recordId) return;
    if(!['DRIVER','VEHICLE_OWNER'].includes(role)) return fail('Only drivers and vehicle owners can have a linked record');
    let record;
    try {record=role==='DRIVER'?await new DriverRepository().findById(recordId,tenantId):await new VehicleOwnerRepository().findById(recordId,tenantId);}
    catch(error) {if(error instanceof CrossTenantViolationError) return fail('Linked record not found in this company',404);throw error;}
    if(!record) return fail('Linked record not found in this company',404);
  }
  async invite(userId:string,data:{scope:'platform'|'tenant';tenantId?:string;email:string;role:string;linkedRecordId?:string}) {
    await this.canInvite(userId,data.scope,data.tenantId,data.role);
    await this.validateLink(data.tenantId||'',data.role,data.linkedRecordId);
    const invitation:Invitation={...data,email:data.email.trim().toLowerCase(),id:crypto.randomUUID(),createdBy:userId,tokenHash:'',expiresAt:now(),status:'PENDING',delivery:'PENDING'};
    this.invitations.set(invitation.id,invitation); return this.deliver(invitation);
  }
  async deliver(invitation:Invitation) {
    const token=randomBytes(32).toString('hex');
    const updated={...invitation,tokenHash:digest(token),expiresAt:new Date(Date.now()+72*3600000).toISOString(),delivery:'PENDING' as const};
    this.invitations.set(updated.id,updated);
    try {
      await this.email.sendInvitationEmail(updated.email,token);
      const current=this.invitations.get(updated.id);
      if(current?.tokenHash===updated.tokenHash) this.invitations.set(updated.id,{...current,delivery:'SENT'});
    } catch(error) {const current=this.invitations.get(updated.id);if(current?.tokenHash===updated.tokenHash) this.invitations.set(updated.id,{...current,delivery:'FAILED'});throw error;}
    return this.safe(this.invitations.get(updated.id)!);
  }
  safe(invitation:Invitation) {const {tokenHash,...safe}=invitation;return safe;}
  async listInvitations(userId:string,scope:'platform'|'tenant',tenantId?:string) {
    await this.canInvite(userId,scope,tenantId);
    return [...this.invitations.values()].filter(i=>i.scope===scope&&i.tenantId===tenantId).map(i=>this.safe(i));
  }
  async changeInvitation(userId:string,id:string,action:'revoke'|'resend') {
    let invitation=this.invitations.get(id) || fail('Invitation not found',404);
    await this.canInvite(userId,invitation.scope,invitation.tenantId,invitation.role);
    invitation=this.invitations.get(id) || fail('Invitation not found',404);
    if(invitation.status!=='PENDING') return fail('Invitation is no longer pending',409);
    if(action==='resend') return this.deliver(invitation);
    this.invitations.set(id,{...invitation,status:'REVOKED'});return {status:'REVOKED'};
  }
  inspect(token:string) {
    const invitation=[...this.invitations.values()].find(i=>i.tokenHash===digest(token));
    if(!invitation||invitation.status!=='PENDING'||Date.parse(invitation.expiresAt)<=Date.now()) return fail('Invitation is invalid or expired',410);
    return invitation;
  }
  async accept(userId:string,token:string) {
    return withRecordTransaction(()=>this.acceptRecords(userId,token));
  }
  private async acceptRecords(userId:string,token:string) {
    const user=await this.user(userId,true); const invitation=this.inspect(token);
    if(user.email.trim().toLowerCase()!==invitation.email) return fail('Sign in with the invited email address',403);
    // Recheck the inviter: revoked administrators cannot leave live privilege grants.
    await this.canInvite(invitation.createdBy,invitation.scope,invitation.tenantId,invitation.role);
    // Re-read after authorization awaits: revoke/resend may have invalidated this token.
    this.inspect(token);
    const existing=invitation.scope==='platform'
      ? await this.authorization.platformMembershipRepository.findByUserId(userId)
      : await this.memberships.findByTenantAndUser(invitation.tenantId!,userId);
    if(existing) return fail('This user already has a membership in this workspace',409);
    this.inspect(token);
    if(!claimRecord('access:invitation-claims',invitation.tokenHash,{userId})) return fail('Invitation already used; contact the administrator if onboarding was interrupted',409);
    if(invitation.scope==='platform') {
      const membership=await this.authorization.platformMembershipRepository.create({userId,role:invitation.role as any,status:'ACTIVE',email:user.email,name:user.fullName,permissions:[]});
      await this.authorization.platformRoleRepository.assignRoleToStaff(membership.id,invitation.role,invitation.createdBy);
      await this.users.setPlatformStaff(userId,true);
    } else {
      const tenantId=invitation.tenantId!;
      const membership=await this.memberships.create({userId,tenantId,role:invitation.role,status:'ACTIVE'});
      await this.authorization.membershipRoleRepository.assignRole(tenantId,membership.id,`sys-role-${invitation.role.toLowerCase()}`,invitation.createdBy);
      if(['DRIVER','VEHICLE_OWNER'].includes(invitation.role)) this.links.set(`${userId}:${tenantId}:${invitation.role}`,{userId,tenantId,kind:invitation.role as Link['kind'],recordId:invitation.linkedRecordId});
    }
    this.invitations.set(invitation.id,{...invitation,status:'ACCEPTED',acceptedBy:userId});return this.context(userId);
  }
  async bootstrap(userId:string,secret:string) {
    return withRecordTransaction(()=>this.bootstrapRecords(userId,secret));
  }
  private async bootstrapRecords(userId:string,secret:string) {
    const user=await this.user(userId,true),expected=process.env.PLATFORM_SETUP_TOKEN;
    if(!expected||expected.length<32||Buffer.byteLength(secret)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(secret),Buffer.from(expected))) return fail('Platform setup is unavailable or the setup key is invalid',403);
    if((await this.authorization.platformMembershipRepository.listAll()).some(m=>m.role==='PLATFORM_OWNER'&&m.status==='ACTIVE')) return fail('Platform ownership is already established',409);
    if(!claimRecord('access:setup','platform-owner',{userId})) return fail('Platform setup has already been claimed',409);
    const membership=await this.authorization.platformMembershipRepository.create({userId,role:'PLATFORM_OWNER',status:'ACTIVE',email:user.email,name:user.fullName,permissions:[]});
    await this.authorization.platformRoleRepository.assignRoleToStaff(membership.id,'PLATFORM_OWNER',userId);
    await this.users.setPlatformStaff(userId,true);return this.context(userId);
  }
}
