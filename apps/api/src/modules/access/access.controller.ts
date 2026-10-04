import { Router } from 'express';
import { z } from 'zod';
import { TenantRepository, BookingRepository, VehicleRepository, CustomerRepository, RentalRepository, InspectionRepository, UserRepository, AuditRepository, DriverRepository, VehicleOwnerRepository, VehicleOwnershipRepository, OwnerSettlementRepository } from '@carhire/database';
import { PLATFORM_ROLES, TENANT_SYSTEM_ROLES } from '@carhire/constants';
import { withRecordTransaction } from '../../../../../packages/database/src/record-store';
import { AccessService, fail } from './access.service';
import type { IdentityModule } from '../identity/identity.module';
import type { DevelopmentEmailDeliveryAdapter } from '../identity/application/services/email-delivery.service';
const profile=z.object({intent:z.enum(['company','renter']).optional(),site:z.string().regex(/^[a-z0-9-]+$/).max(100).optional(),companyName:z.string().trim().min(2).max(120).optional(),phone:z.string().trim().max(30).optional()}).strict();
const invitation=z.object({scope:z.enum(['platform','tenant']),tenantId:z.string().min(1).optional(),email:z.string().email(),role:z.string(),linkedRecordId:z.string().optional()}).strict();
export function accessController(service:AccessService,identity:IdentityModule): Router {
  const router=Router();
  const run=(handler:(req:any)=>Promise<any>|any)=>(req:any,res:any,next:any)=>Promise.resolve().then(()=>handler(req)).then(async data=>{
    if(req.auth && !['GET','HEAD'].includes(req.method)) await new AuditRepository().record({tenantId:req.body.tenantId||'platform-control-plane',actorId:req.auth.userId,actorType:'USER',action:`ACCESS_${req.method}_${req.path}`,resourceType:'Access',resourceId:req.params.id||req.auth.userId,metadata:{}});
    res.json({data});
  }).catch(next);
  router.get('/invitation',run(req=>{const i=service.inspect(z.string().min(32).parse(req.query.token));return {email:i.email,role:i.role,expiresAt:i.expiresAt};}));
  router.use(identity.authGuard);
  router.get('/context',run(req=>service.context(req.auth.userId)));
  router.put('/profile',run(req=>service.saveProfile(req.auth.userId,profile.parse(req.body))));
  router.post('/complete',run(req=>service.complete(req.auth.userId)));
  router.post('/bootstrap',run(req=>service.bootstrap(req.auth.userId,z.string().min(32).max(256).parse(req.body.secret))));
  router.get('/invitations',run(req=>service.listInvitations(req.auth.userId,z.enum(['platform','tenant']).parse(req.query.scope),req.query.tenantId)));
  router.post('/invitations',run(req=>service.invite(req.auth.userId,invitation.parse(req.body))));
  router.post('/invitations/:id/:action',run(req=>service.changeInvitation(req.auth.userId,req.params.id,z.enum(['revoke','resend']).parse(req.params.action))));
  router.post('/accept',run(req=>service.accept(req.auth.userId,z.string().min(32).max(128).parse(req.body.token))));
  router.get('/roles',run(async req=>{
    const scope=z.enum(['platform','tenant']).parse(req.query.scope);
    const portal=await service.canInvite(req.auth.userId,scope,req.query.tenantId);
    return Object.values(scope==='platform'?PLATFORM_ROLES:TENANT_SYSTEM_ROLES).filter(r=>r.code!=='PLATFORM_OWNER'&&(r.code!=='COMPANY_OWNER'||portal.roles.includes('COMPANY_OWNER'))).map(r=>({code:r.code,name:r.name}));
  }));
  router.get('/link-options',run(async req=>{
    const tenantId=z.string().min(1).parse(req.query.tenantId);
    await service.canInvite(req.auth.userId,'tenant',tenantId);
    const [drivers,owners]=await Promise.all([new DriverRepository().findAll(tenantId,{limit:1000}),new VehicleOwnerRepository().findAll(tenantId,{limit:1000})]);
    return [...drivers.drivers.map(d=>({id:d.id,name:d.fullName,role:'DRIVER'})),...owners.owners.map(o=>({id:o.id,name:o.name,role:'VEHICLE_OWNER'}))];
  }));
  router.get('/team',run(async req=>{
    const scope=z.enum(['platform','tenant']).parse(req.query.scope);await service.canInvite(req.auth.userId,scope,req.query.tenantId);
    const rows=scope==='platform'?await service.authorization.platformMembershipRepository.listAll():await service.memberships.listByTenantId(req.query.tenantId);
    return Promise.all(rows.map(async row=>{const user=await service.users.findById(row.userId);return {id:row.id,email:user?.email,name:user?.fullName,role:row.role,status:row.status,editable:row.userId!==req.auth.userId&&!['COMPANY_OWNER','PLATFORM_OWNER'].includes(row.role),linkedRecordId:scope==='tenant'?service.links.get(`${row.userId}:${req.query.tenantId}:${row.role}`)?.recordId:undefined};}));
  }));
  router.patch('/team/:id',run(async req=>withRecordTransaction(async()=>{
    const dto=z.object({scope:z.enum(['platform','tenant']),tenantId:z.string().optional(),status:z.enum(['ACTIVE','SUSPENDED']).optional(),role:z.string().optional(),linkedRecordId:z.string().min(1).nullable().optional()}).strict().parse(req.body);
    if(!dto.role&&!dto.status&&dto.linkedRecordId===undefined) return fail('Select a role or membership status');
    const actor=await service.canInvite(req.auth.userId,dto.scope,dto.tenantId,dto.role);
    if(dto.scope==='platform') {
      if(dto.linkedRecordId!==undefined) return fail('Platform staff cannot have company record links');
      const target=await service.authorization.platformMembershipRepository.findById(req.params.id);
      if(!target) return fail('Member not found',404);
      if(target.role==='PLATFORM_OWNER'||target.userId===req.auth.userId) return fail('Owner and self-access changes require a separate ownership process',403);
      if(dto.role) {
        for(const role of await service.authorization.platformRoleRepository.getRolesForStaff(target.id)) await service.authorization.platformRoleRepository.removeRoleFromStaff(target.id,role.id);
        await service.authorization.platformRoleRepository.assignRoleToStaff(target.id,dto.role,req.auth.userId);
      }
      return service.authorization.platformMembershipRepository.update(target.id,{...(dto.role?{role:dto.role as any}:{}),...(dto.status?{status:dto.status}:{})});
    }
    const target=await service.memberships.findById(req.params.id);
    if(!target||target.tenantId!==dto.tenantId) return fail('Member not found',404);
    const owner=await service.authorization.membershipRoleRepository.isMembershipOwner(dto.tenantId!,target.id);
    if(owner||target.role==='COMPANY_OWNER'||target.userId===req.auth.userId) return fail('Owner and self-access changes require a separate ownership process',403);
    const nextRole=dto.role||target.role||'';
    await service.validateLink(dto.tenantId!,nextRole,dto.linkedRecordId);
    if(dto.role) {
      await service.authorization.membershipRoleRepository.removeAllRolesForMembership(dto.tenantId!,target.id);
      await service.authorization.membershipRoleRepository.assignRole(dto.tenantId!,target.id,`sys-role-${dto.role.toLowerCase()}`,req.auth.userId);
      await service.memberships.updateRole(target.id,dto.role);
    }
    if(dto.role&&dto.role!==target.role) {
      // Old personal links must never silently return when a role is reassigned.
      for(const role of ['DRIVER','VEHICLE_OWNER']) service.links.delete(`${target.userId}:${dto.tenantId}:${role}`);
    }
    if(dto.linkedRecordId!==undefined) {
      const key=`${target.userId}:${dto.tenantId}:${nextRole}`;
      if(dto.linkedRecordId===null) service.links.delete(key);
      else service.links.set(key,{userId:target.userId,tenantId:dto.tenantId!,kind:nextRole as 'DRIVER'|'VEHICLE_OWNER',recordId:dto.linkedRecordId});
    }
    if(dto.status) await service.memberships.updateStatus(target.id,dto.status);
    return {updated:true};
  })));
  router.get('/support/:id/records',run(async req=>{
    const portal=await service.portal(req.auth.userId,'platform');
    if(!portal.permissions.includes('*')&&!portal.permissions.includes('platform.support.session_start')) return fail('Support access required',403);
    const session=await service.authorization.supportSessionRepository.findById(req.params.id);
    if(!session) return fail('Support session not found',403);
    await service.authorization.supportAccessService.validateSupportSession(session.id,session.targetTenantId,req.auth.userId);
    const tenant=await service.tenants.findById(session.targetTenantId);
    if(!tenant||tenant.status!=='ACTIVE') return fail('Company is not active',403);
    await new AuditRepository().record({tenantId:tenant.id,actorId:req.auth.userId,actorType:'SUPPORT',action:'SUPPORT_RECORDS_VIEWED',resourceType:'SupportAccessSession',resourceId:session.id,metadata:{}});
    return {company:tenant.name,rows:(await new VehicleRepository().findAll(tenant.id)).vehicles.map(v=>({registration:v.registrationPlate,name:`${v.make} ${v.model}`,status:v.availabilityStatus}))};
  }));
  router.get('/records',run(async req=>{
    const portal=await service.portal(req.auth.userId,String(req.query.portal||''));
    const section=String(req.query.section||'');
    if(!portal.sections.some((s:any)=>s.id===section)) return fail('You do not have access to this section',403);
    const tenantId=portal.tenantId;
    let rows:any[]=[];
    if(section==='companies') rows=(await new TenantRepository().listAll()).map(t=>({id:t.id,name:t.name,status:t.status}));
    else if(section==='fleet') rows=(await new VehicleRepository().findAll(tenantId)).vehicles.map(v=>({id:v.id,registration:v.registrationPlate,name:`${v.make} ${v.model}`,status:v.availabilityStatus}));
    else if(section==='bookings') rows=(await new BookingRepository().findMany(tenantId)).items.map(b=>({id:b.id,reference:b.bookingNumber,status:b.status}));
    else if(section==='customers') rows=(await new CustomerRepository().findAll(tenantId)).customers.map(c=>({id:c.id,name:c.fullName,email:c.email,status:c.status}));
    else if(section==='myBookings') {
      const link=service.links.get(`${req.auth.userId}:${tenantId}:RENTER`);
      if(link?.recordId) {
        const bookingRepo=new BookingRepository(),vehicleRepo=new VehicleRepository(),rentalRepo=new RentalRepository();
        const bookings=(await bookingRepo.findMany(tenantId,{customerId:link.recordId})).items;
        rows=await Promise.all(bookings.map(async b=>{
          const history=await bookingRepo.getStatusHistory(b.id,tenantId);
          const vehicleId=b.assignedVehicleId||b.requestedVehicleId||undefined;
          const vehicle=vehicleId?await vehicleRepo.findById(vehicleId,tenantId):null;
          const rental=await rentalRepo.findByBookingId(b.id,tenantId);
          const progressStatus=rental?.state||(rental as any)?.status||b.status;
          return {
            id:b.id,
            reference:b.bookingNumber,
            status:b.status,
            progressStatus,
            pickup:b.pickupAt,
            return:b.returnAt,
            pickupLocation:b.pickupLocationName||'Main Station',
            returnLocation:b.returnLocationName||b.pickupLocationName||'Main Station',
            vehicle:vehicle?{id:vehicle.id,registration:vehicle.registrationPlate,name:`${vehicle.make} ${vehicle.model}`,imageUrl:vehicle.imageUrl||null}:null,
            amount:b.grossTotal||b.pricingSnapshot?.grossRentalTotal||0,
            currency:b.currency||b.pricingSnapshot?.currency||'KES',
            rental:rental?{id:rental.id,reference:rental.rentalNumber,status:rental.state||(rental as any).status,scheduledReturnAt:(rental as any).scheduledReturnAt||(rental as any).scheduledReturn}:null,
            history:history.map((h:any)=>({fromStatus:h.fromStatus||null,toStatus:h.toStatus,reason:h.reason||null,occurredAt:h.occurredAt||h.createdAt||null})),
            notifications:history.slice().reverse().slice(0,6).map((h:any)=>({
              title:String(h.toStatus||'Booking update').replaceAll('_',' '),
              message:h.reason||`Your booking moved to ${String(h.toStatus||'the next stage').replaceAll('_',' ').toLowerCase()}.`,
              occurredAt:h.occurredAt||h.createdAt||null,
            })),
          };
        }));
      }
    } else if(section==='myVehicles') {
      const link=service.links.get(`${req.auth.userId}:${tenantId}:VEHICLE_OWNER`);
      if(link?.recordId) {
        const vehicles=(await new VehicleRepository().findAll(tenantId,{ownerId:link.recordId})).vehicles;
        const ownershipRepo=new VehicleOwnershipRepository();
        rows=await Promise.all(vehicles.map(async v=>{
          const agreement=await ownershipRepo.findActiveByVehicleId(v.id,tenantId);
          return {
            id:v.id,
            registration:v.registrationPlate,
            name:`${v.make} ${v.model}`,
            status:v.availabilityStatus,
            ownerShare:agreement?`${agreement.revenueSharePercent}%`:'No active agreement',
            fixedMonthlyPayout:agreement?.fixedMonthlyPayout??null,
            expenseDeductions:agreement?.allowableExpenseDeductions?'Allowed':'Not allowed',
            agreementTerms:agreement?.termsSnapshot||'No owner-visible agreement summary recorded',
            agreementEffectiveFrom:agreement?.startDate||null,
          };
        }));
      }
    } else if(section==='mySettlements') {
      const link=service.links.get(`${req.auth.userId}:${tenantId}:VEHICLE_OWNER`);
      if(link?.recordId) {
        const settlements=await new OwnerSettlementRepository().listByTenant(tenantId,{ownerId:link.recordId});
        rows=settlements.map((s:any)=>({
          id:s.id,
          reference:s.settlementNumber,
          period:`${s.periodStart} → ${s.periodEnd}`,
          status:s.status,
          grossRevenue:s.grossRevenue??s.totalRentalRevenue??0,
          ownerShare:s.ownerShareAmount??s.ownerGrossShare??0,
          deductions:s.totalDeductions??0,
          netPayable:s.netPayable??s.netAmountPayable??0,
          paymentStatus:s.payable?.status||s.paymentStatus||'PENDING',
        }));
      }
    } else if(section==='myTrips'||section==='myInspections') {
      const link=service.links.get(`${req.auth.userId}:${tenantId}:DRIVER`);
      if(link?.recordId) {
        const rentals=(await new RentalRepository().findMany(tenantId,{limit:1000})).items.filter((r:any)=>r.driverId===link.recordId||r.primaryDriverId===link.recordId);
        if(section==='myTrips') rows=rentals.map((r:any)=>({id:r.id,reference:r.rentalNumber,status:r.state}));
        else for(const rental of rentals) rows.push(...(await new InspectionRepository().findByRentalId(rental.id,tenantId)).map((i:any)=>({id:i.id,status:i.status,type:i.type})));
      }
    } else if(section==='profile') rows=[{name:(await service.user(req.auth.userId)).fullName,email:(await service.user(req.auth.userId)).email,phone:service.accounts.get(req.auth.userId)?.phone||''}];
    else return {available:false,rows:[],message:'Your access is configured. This workflow will be connected in the next business-module milestone.'};
    return {available:true,rows};
  }));
  // Explicit claim; merely knowing a reference never grants access. The account
  // must control the verified email saved on that guest customer record.
  router.post('/claim-booking',run(async req=>{
    const user=await service.user(req.auth.userId,true);
    const dto=z.object({portal:z.string(),reference:z.string().min(3).max(100)}).parse(req.body);
    const portal=await service.portal(user.id,dto.portal);
    if(portal.kind!=='renter') return fail('Renter portal required',403);
    const booking=await new BookingRepository().findByBookingNumber(dto.reference,portal.tenantId);
    const customer=booking?await new CustomerRepository().findById(booking.customerId,portal.tenantId):null;
    if(!customer||customer.email.toLowerCase().trim()!==user.email.toLowerCase().trim()) return fail('Booking ownership could not be verified',403);
    const key=`${user.id}:${portal.tenantId}:RENTER`,link=service.links.get(key)!;
    service.links.set(key,{...link,recordId:customer.id});return {claimed:true};
  }));
  if(process.env.ACCESS_REVIEW_MODE==='true' && !['production','staging'].includes(process.env.NODE_ENV||'')) {
    router.get('/review-mail',run(async req=>{
      const user=await service.user(req.auth.userId);
      const mail=(identity.emailDelivery as DevelopmentEmailDeliveryAdapter).getCapturedEmails?.()||[];
      return mail.filter(m=>m.to.toLowerCase()===user.email.toLowerCase());
    }));
  }
  router.use((err:any,_req:any,res:any,_next:any)=>res.status(err.statusCode|| (err.name==='ZodError'?400:500)).json({error:{message:err.statusCode||err.name==='ZodError'?err.message:'This request could not be completed. Please retry or contact your administrator.'}}));
  return router;
}
