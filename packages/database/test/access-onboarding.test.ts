import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
async function main() {
  const dir=mkdtempSync(join(tmpdir(),'carhire-access-'));
  Object.assign(process.env,{SQLITE_PATH:join(dir,'test.sqlite'),NODE_ENV:'test',REDIS_SIMULATED:'true',ACCESS_REVIEW_MODE:'true',PLATFORM_SETUP_TOKEN:'isolated-test-setup-key-with-32-characters'});
  const {createApiApp}=await import('../../../apps/api/src/app.module');
  const {PLATFORM_ROLES,TENANT_SYSTEM_ROLES}=await import('@carhire/constants');
  const {createRecordStore}=await import('../src/record-store');
  const app=createApiApp();const server=app.listen(0,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const base=`http://127.0.0.1:${(server.address() as any).port}/api/v1`;
  type Actor={token:string;email:string;id:string};
  async function req(path:string,actor?:Actor,body?:any,method=body?'POST':'GET',status=200,tenantId?:string) {
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(actor?{Authorization:`Bearer ${actor.token}`} :{}),...(tenantId?{'X-Tenant-ID':tenantId}:{})},body:body?JSON.stringify(body):undefined});
    const data=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(data)}`);return data.data;
  }
  async function account(name:string,verify=true):Promise<Actor> {
    const email=`${name.toLowerCase()}@example.test`,password='AccessReview2026!Secure';
    const reg=await req('/auth/register',undefined,{fullName:name.replaceAll('_',' '),email,password},'POST',201);
    const login=await req('/auth/login',undefined,{email,password});const actor={email,id:reg.user.id,token:login.tokens.accessToken};
    if(verify){const mail=await req('/access/review-mail',actor);await req('/auth/verify-email',undefined,{token:mail.find((m:any)=>m.type==='EMAIL_VERIFICATION').token});}
    return actor;
  }
  async function invite(owner:Actor,member:Actor,role:string,tenantId?:string) {
    const created=await req('/access/invitations',owner,{scope:tenantId?'tenant':'platform',...(tenantId?{tenantId}:{}),role,email:member.email});
    const mail=await req('/access/review-mail',member);const token=mail.filter((m:any)=>m.type==='INVITATION').at(-1).token;
    await req('/access/accept',member,{token});return {created,token};
  }
  try {
    const unverified=await account('Unverified',false);
    await req('/access/profile',unverified,{intent:'company',companyName:'Interrupted Company'},'PUT');
    await req('/access/complete',unverified,{},'POST',403);
    assert.equal((await req('/access/context',unverified)).onboarding.companyName,'Interrupted Company');
    const owner=await account('Company_Owner');
    await req('/access/profile',owner,{intent:'company',companyName:'Access Review Rentals'},'PUT');
    const {InMemoryTenantMembershipRoleRepository,InMemoryPlatformRoleRepository}=await import('@carhire/database');
    const assignCompanyRole=InMemoryTenantMembershipRoleRepository.prototype.assignRole;
    InMemoryTenantMembershipRoleRepository.prototype.assignRole=async()=>{throw new Error('Injected membership write failure');};
    try {await req('/access/complete',owner,{},'POST',500);} finally {InMemoryTenantMembershipRoleRepository.prototype.assignRole=assignCompanyRole;}
    assert.equal((await req('/access/context',owner)).portals.length,0,'failed provisioning must roll back workspace and membership');
    let context=await req('/access/complete',owner,{});const tenantId=context.portals[0].id;
    await req('/access/complete',owner,{});assert.equal((await req('/access/context',owner)).portals.length,1);
    const platform=await account('Platform_Owner');
    const assignPlatformRole=InMemoryPlatformRoleRepository.prototype.assignRoleToStaff;
    InMemoryPlatformRoleRepository.prototype.assignRoleToStaff=async()=>{throw new Error('Injected owner role failure');};
    try {await req('/access/bootstrap',platform,{secret:process.env.PLATFORM_SETUP_TOKEN},'POST',500);} finally {InMemoryPlatformRoleRepository.prototype.assignRoleToStaff=assignPlatformRole;}
    assert.equal((await req('/access/context',platform)).portals.length,0);
    await req('/access/bootstrap',platform,{secret:process.env.PLATFORM_SETUP_TOKEN});
    await req('/access/bootstrap',owner,{secret:process.env.PLATFORM_SETUP_TOKEN},'POST',409);
    const actors:Record<string,Actor>={COMPANY_OWNER:owner,PLATFORM_OWNER:platform};
    for(const role of Object.keys(PLATFORM_ROLES).filter(r=>r!=='PLATFORM_OWNER')) {const actor=await account(role);actors[role]=actor;await invite(platform,actor,role);}
    for(const role of Object.keys(TENANT_SYSTEM_ROLES).filter(r=>r!=='COMPANY_OWNER')) {const actor=await account(role);actors[role]=actor;await invite(owner,actor,role,tenantId);}
    createRecordStore<string,any>('tenant-website.repository:websites').set('test-site',{id:'test-site',tenantId,subdomain:'renter-public-alias',status:'PUBLISHED'});
    const renter=await account('Renter');actors.RENTER=renter;await req('/access/profile',renter,{intent:'renter',site:'renter-public-alias',phone:'+254700000001'},'PUT');await req('/access/complete',renter,{});
    assert.equal((await req('/access/context',renter)).portals[0].site,'renter-public-alias');
    for(const [role,actor] of Object.entries(actors)) {
      const c=await req('/access/context',actor);assert.ok(c.portals.some((p:any)=>p.roles.includes(role)),role+' portal');
      const portal=c.portals.find((p:any)=>p.roles.includes(role));assert.ok(portal.sections.length>0,role+' sections');
      await req(`/access/records?portal=${encodeURIComponent(portal.id)}&section=not-allowed`,actor,undefined,'GET',403);
    }
    await req('/access/invitations',actors.TENANT_ADMIN,{scope:'tenant',tenantId,email:'denied@example.test',role:'COMPANY_OWNER'},'POST',403);
    await req('/access/invitations',actors.PLATFORM_ADMIN,{scope:'platform',email:'denied@example.test',role:'PLATFORM_OWNER'},'POST',403);
    await req('/access/invitations',owner,{scope:'platform',email:'denied@example.test',role:'BILLING_ADMIN'},'POST',403);
    await req('/fleet/vehicles',renter,undefined,'GET',403,tenantId);
    await req('/fleet/vehicles',actors.DRIVER,undefined,'GET',403,tenantId);
    await req('/fleet/vehicles',actors.VEHICLE_OWNER,undefined,'GET',403,tenantId);
    const another=await account('Other_Owner');await req('/access/profile',another,{intent:'company',companyName:'Other Company'},'PUT');const otherContext=await req('/access/complete',another,{});
    await req(`/access/records?portal=${otherContext.portals[0].id}&section=fleet`,owner,undefined,'GET',403);
    const team=await req(`/access/team?scope=tenant&tenantId=${tenantId}`,owner);const agent=team.find((m:any)=>m.email===actors.BOOKING_AGENT.email);
    await req(`/access/team/${agent.id}`,owner,{scope:'tenant',tenantId,status:'SUSPENDED'},'PATCH');
    assert.equal((await req('/access/context',actors.BOOKING_AGENT)).portals.length,0);
    await req('/bookings',actors.BOOKING_AGENT,undefined,'GET',403,tenantId);
    // Existing tokens must observe role changes immediately.
    await req(`/access/team/${agent.id}`,owner,{scope:'tenant',tenantId,status:'ACTIVE',role:'DRIVER'},'PATCH');
    assert.deepEqual((await req('/access/context',actors.BOOKING_AGENT)).portals[0].roles,['DRIVER']);
    await req('/fleet/vehicles',actors.BOOKING_AGENT,undefined,'GET',403,tenantId);
    // Replacing an invitation invalidates its previous secret.
    const replacement=await account('Replacement_Member');
    const sent=await req('/access/invitations',owner,{scope:'tenant',tenantId,role:'BOOKING_AGENT',email:replacement.email});
    const firstToken=(await req('/access/review-mail',replacement)).filter((m:any)=>m.type==='INVITATION').at(-1).token;
    await req(`/access/invitations/${sent.id}/resend`,owner,{});
    await req('/access/accept',replacement,{token:firstToken},'POST',410);
    const secondToken=(await req('/access/review-mail',replacement)).filter((m:any)=>m.type==='INVITATION').at(-1).token;

    // Fixtures live only in this test's temporary database, never in review or real data.
    const links=createRecordStore<string,any>('access:links');
    for(const role of ['DRIVER','VEHICLE_OWNER']) links.set(`${actors[role].id}:${tenantId}:${role}`,{userId:actors[role].id,tenantId,kind:role,recordId:'linked-person'});
    const vehicles=createRecordStore<string,any>('vehicle.repository:vehicleStore');
    const rentals=createRecordStore<string,any>('rental.repository:rentalStore');
    const inspections=createRecordStore<string,any>('inspection.repository:inspectionStore');
    const bookings=createRecordStore<string,any>('booking.repository:bookingStore');
    const customers=createRecordStore<string,any>('customer.repository:customerStore');
    for(const [id,company,person] of [['own',tenantId,'linked-person'],['other',tenantId,'other-person'],['foreign',otherContext.portals[0].id,'linked-person']]) {
      vehicles.set(id,{id,tenantId:company,ownerId:person,registrationPlate:id,make:'Test',model:'Fixture',createdAt:new Date().toISOString()});
      rentals.set(id,{id,tenantId:company,driverId:person,rentalNumber:id,state:'ACTIVE',createdAt:new Date().toISOString()});
      inspections.set(id,{id,tenantId:company,rentalId:id,status:'DRAFT',type:'CHECK_OUT'});
      customers.set(id,{id,tenantId:company,email:id==='other'?'different@example.test':renter.email,fullName:id});
      bookings.set(id,{id,tenantId:company,customerId:id,bookingNumber:`REF-${id}`,status:'CONFIRMED',createdAt:new Date().toISOString()});
    }
    for(const [role,section] of [['DRIVER','myTrips'],['DRIVER','myInspections'],['VEHICLE_OWNER','myVehicles']]) {
      const data=await req(`/access/records?portal=${tenantId}&section=${section}`,actors[role]);
      assert.deepEqual(data.rows.map((r:any)=>r.id),['own'],`${role} ${section} linked-only records`);
    }
    const driverTeam=team.find((m:any)=>m.email===actors.DRIVER.email);
    const driverStore=createRecordStore<string,any>('driver.repository:driverStore');
    driverStore.set('linked-person',{id:'linked-person',tenantId,fullName:'Linked test driver'});
    driverStore.set('foreign-driver',{id:'foreign-driver',tenantId:otherContext.portals[0].id,fullName:'Other company driver'});
    await req(`/access/team/${driverTeam.id}`,owner,{scope:'tenant',tenantId,linkedRecordId:'foreign-driver'},'PATCH',404);
    await req(`/access/team/${driverTeam.id}`,actors.DRIVER,{scope:'tenant',tenantId,linkedRecordId:'linked-person'},'PATCH',403);
    await req(`/access/team/${driverTeam.id}`,another,{scope:'tenant',tenantId:otherContext.portals[0].id,linkedRecordId:'linked-person'},'PATCH',404);
    await req(`/access/team/${driverTeam.id}`,owner,{scope:'tenant',tenantId,linkedRecordId:null},'PATCH');
    assert.equal((await req(`/access/records?portal=${tenantId}&section=myTrips`,actors.DRIVER)).rows.length,0);
    await req(`/access/team/${driverTeam.id}`,owner,{scope:'tenant',tenantId,linkedRecordId:'linked-person'},'PATCH');
    assert.equal((await req(`/access/records?portal=${tenantId}&section=myTrips`,actors.DRIVER)).rows.length,1);
    await req(`/access/team/${driverTeam.id}`,owner,{scope:'tenant',tenantId,role:'BOOKING_AGENT'},'PATCH');
    await req(`/access/team/${driverTeam.id}`,owner,{scope:'tenant',tenantId,role:'DRIVER'},'PATCH');
    assert.equal((await req(`/access/records?portal=${tenantId}&section=myTrips`,actors.DRIVER)).rows.length,0,'old personal access must not return after role reassignment');
    const support=actors.SUPPORT_ADMIN;
    const supportSession=await req('/platform/support/sessions',support,{targetTenantId:tenantId,reason:'Review isolated fleet records',durationMinutes:15},'POST',201);
    assert.equal((await req(`/access/support/${supportSession.id}/records`,support)).rows.length,2);
    await req(`/access/support/${supportSession.id}/records`,actors.PLATFORM_ADMIN,undefined,'GET',403);
    await req(`/access/support/${supportSession.id}/records`,owner,undefined,'GET',403);
    const supportStore=createRecordStore<string,any>('support-access-session.repository:sessions');
    const savedSupport=supportStore.get(supportSession.id);
    supportStore.set(supportSession.id,{...savedSupport,expiresAt:new Date(Date.now()-1000).toISOString()});
    await req(`/access/support/${supportSession.id}/records`,support,undefined,'GET',403);
    supportStore.set(supportSession.id,savedSupport);
    await req(`/platform/support/sessions/${supportSession.id}/end`,support,{});
    await req(`/access/support/${supportSession.id}/records`,support,undefined,'GET',403);
    const liveSupport=await req('/platform/support/sessions',support,{targetTenantId:tenantId,reason:'Test removal of support access',durationMinutes:15},'POST',201);
    const platformTeam=await req('/access/team?scope=platform',platform);
    const supportMember=platformTeam.find((m:any)=>m.email===support.email);
    await req(`/access/team/${supportMember.id}`,platform,{scope:'platform',status:'SUSPENDED'},'PATCH');
    await req(`/access/support/${liveSupport.id}/records`,support,undefined,'GET',403);
    await req(`/platform/support/sessions/${liveSupport.id}/end`,support,{},'POST',403);
    const renterPortal=`renter:${tenantId}`;
    assert.equal((await req(`/access/records?portal=${renterPortal}&section=myBookings`,renter)).rows.length,0);
    await req('/access/claim-booking',renter,{portal:renterPortal,reference:'REF-other'},'POST',403);
    await req('/access/claim-booking',renter,{portal:renterPortal,reference:'REF-foreign'},'POST',403);
    await req('/access/claim-booking',renter,{portal:renterPortal,reference:'REF-own'});
    assert.deepEqual((await req(`/access/records?portal=${renterPortal}&section=myBookings`,renter)).rows.map((r:any)=>r.id),['own']);
    const invitations=createRecordStore<string,any>('access:invitations');
    const saved=invitations.get(sent.id);
    invitations.set(sent.id,{...saved,expiresAt:new Date(Date.now()-1000).toISOString()});
    await req('/access/accept',replacement,{token:secondToken},'POST',410);
    invitations.set(sent.id,saved);
    InMemoryTenantMembershipRoleRepository.prototype.assignRole=async()=>{throw new Error('Injected invitation role failure');};
    try {await req('/access/accept',replacement,{token:secondToken},'POST',500);} finally {InMemoryTenantMembershipRoleRepository.prototype.assignRole=assignCompanyRole;}
    assert.equal((await req('/access/context',replacement)).portals.length,0,'failed invitation must not leave a partial membership');
    const simultaneous=await Promise.all([0,1].map(async()=>{
      const response=await fetch(base+'/access/accept',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${replacement.token}`},body:JSON.stringify({token:secondToken})});
      await response.json();return response.status;
    }));
    assert.equal(simultaneous.filter(status=>status===200).length,1);
    assert.ok(simultaneous.every(status=>[200,409,410].includes(status)));
    assert.equal((await req('/access/context',replacement)).portals.length,1);
    await req('/access/bootstrap',owner,{secret:'é'.repeat(process.env.PLATFORM_SETUP_TOKEN!.length)},'POST',403);
    const pending=await account('Pending_Member');const invitation=await req('/access/invitations',owner,{scope:'tenant',tenantId,role:'BOOKING_AGENT',email:pending.email});
    const messages=await req('/access/review-mail',pending),token=messages.filter((m:any)=>m.type==='INVITATION').at(-1).token;
    await req('/access/accept',another,{token},'POST',403);
    await req(`/access/invitations/${invitation.id}/revoke`,owner,{});await req('/access/accept',pending,{token},'POST',410);
    const accepted=await invite(owner,pending,'BOOKING_AGENT',tenantId);await req('/access/accept',pending,{token:accepted.token},'POST',410);
    await req('/auth/register',undefined,{fullName:'Duplicate',email:'  COMPANY_OWNER@EXAMPLE.TEST  ',password:'AccessReview2026!Secure'},'POST',409);
    const relogin=await req('/auth/login',undefined,{email:owner.email,password:'AccessReview2026!Secure'});
    assert.equal(relogin.user.id,owner.id);
    await req('/auth/forgot-password',undefined,{email:replacement.email});
    const reset=(await req('/access/review-mail',replacement)).filter((m:any)=>m.type==='PASSWORD_RESET').at(-1).token;
    await req('/auth/reset-password',undefined,{token:reset,newPassword:'ReplacementPassword2026!'});
    await req('/access/context',replacement,undefined,'GET',401);
    await req('/auth/login',undefined,{email:replacement.email,password:'AccessReview2026!Secure'},'POST',401);
    const resetLogin=await req('/auth/login',undefined,{email:replacement.email,password:'ReplacementPassword2026!'});
    assert.equal(resetLogin.user.id,replacement.id);
    await req('/auth/logout',pending,{});await req('/access/context',pending,undefined,'GET',401);
    // A delayed email response must not resurrect a revoked invitation.
    const {AccessService}=await import('../../../apps/api/src/modules/access/access.service');
    let finishDelivery!:()=>void;
    const deliveryDone=new Promise<void>(resolve=>{finishDelivery=resolve;});
    const deliveryService=Object.assign(Object.create(AccessService.prototype),{invitations:new Map(),email:{sendInvitationEmail:()=>deliveryDone}});
    const delayed=deliveryService.deliver({id:'delayed',email:'test@example.test',status:'PENDING'});
    deliveryService.invitations.set('delayed',{...deliveryService.invitations.get('delayed'),status:'REVOKED'});
    finishDelivery();await delayed;
    assert.equal(deliveryService.invitations.get('delayed').status,'REVOKED');
    console.log('PASS: all 20 roles, verified onboarding, invitations, one-time setup, tenant isolation, restricted portals, suspension and logout.');
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true});}
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error.message);process.exit(1);});
