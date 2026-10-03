import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
async function main(){
 const dir=mkdtempSync(join(tmpdir(),'carhire-runtime-'));
 process.env.SQLITE_PATH=join(dir,'db.sqlite');process.env.REDIS_SIMULATED='true';process.env.NODE_ENV='test';process.env.ACCESS_REVIEW_MODE='true';
 const {createApiApp}=await import('../../../apps/api/src/app.module');
 const app=createApiApp();const server=app.listen(Number(process.env.BROWSER_TEST_PORT||0),'127.0.0.1');
 await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 const base=`http://127.0.0.1:${(server.address() as any).port}/api/v1`;let token='',tenant='';
 async function request(path:string,body?:any,method=body?'POST':'GET'){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(tenant?{'X-Tenant-ID':tenant}:{})},body:body?JSON.stringify(body):undefined});const result=await r.json();assert.ok(r.ok,`${path}: ${r.status} ${JSON.stringify(result)}`);return result.data;}
 try{
  await request('/auth/register',{email:'flow@example.test',password:'StrongPass2026!Test',fullName:'Flow test'});
  const login=await request('/auth/login',{email:'flow@example.test',password:'StrongPass2026!Test'});token=login.tokens.accessToken;
  const mail=await request('/access/review-mail');
  await request('/auth/verify-email',{token:mail.find((m:any)=>m.type==='EMAIL_VERIFICATION').token});
  const workspace=await request('/tenants',{name:'Flow rentals',slug:'flow-rentals'});tenant=workspace.tenant.id;
  const car=await request('/fleet/vehicles',{registrationPlate:'FLOW 123',make:'Toyota',model:'Corolla',year:2020,category:'SEDAN',dailyRate:3500});
  const customer=await request('/customers',{fullName:'Saved customer',email:'saved@example.test',phone:'+254700111222',idOrPassportNumber:'SAVED123',licenseNumber:'SAVEDLICENSE',licenseExpiryDate:'2030-01-01',customerType:'INDIVIDUAL'});
assert.equal(customer.verificationStatus,'UNVERIFIED');
await request(`/customers/${customer.id}`,{fullName:'Updated customer'},'PUT');
await request(`/customers/${customer.id}/status`,{status:'BLOCKED',reason:'Test status persistence'},'PATCH');
const savedCustomers=await request('/customers');
assert.ok(savedCustomers.some((c:any)=>c.id===customer.id&&c.fullName==='Updated customer'&&c.status==='BLOCKED'));
await request(`/fleet/vehicles/${car.id}`,{dailyRate:3600},'PATCH');
assert.ok((await request('/fleet/vehicles')).some((v:any)=>v.id===car.id&&v.dailyRate===3600));
await request('/website/init',{subdomain:'flow-rentals'});await request('/website/publish',{});
  const operatorToken=token,tenantId=tenant;
  token='';tenant='';
  const vehicles=await request('/public/booking/vehicles?site=flow-rentals');assert.ok(vehicles.some((v:any)=>v.id===car.id),'Created car must be visible publicly');
  const pickupAt=new Date(Date.now()+2*86400000).toISOString(),returnAt=new Date(Date.now()+5*86400000).toISOString();
  const quote=await request('/public/booking/quote?site=flow-rentals',{vehicleId:car.id,pickupAt,returnAt});
  assert.ok(quote.grossRentalTotal>0);
  const checkout={vehicleId:car.id,pickupAt,returnAt,guest:{fullName:'Guest customer',email:'guest@example.test',phone:'+254700123456',idOrPassportNumber:'TEST123456',licenseNumber:'LICENSE123',licenseExpiryDate:'2030-01-01'},paymentMethod:'PAY_LATER',idempotencyKey:'runtime-checkout-unique'};
  const voucher=await request('/public/booking/checkout?site=flow-rentals',checkout);
  assert.ok(voucher.bookingReference);assert.equal(voucher.pricing.isPaid,false);
  assert.equal((await request('/public/booking/checkout?site=flow-rentals',checkout)).bookingId,voucher.bookingId);
  token=operatorToken;tenant=tenantId;
  const bookings=await request('/bookings');assert.ok(bookings.some((b:any)=>b.id===voucher.bookingId),'Public booking must appear in admin');
  if(process.env.BROWSER_TEST_PORT) { console.log('Browser test ready at port '+process.env.BROWSER_TEST_PORT); await new Promise<void>(resolve=>process.once('SIGTERM',resolve)); }
  await request('/website/unpublish',{});token='';tenant='';
  assert.equal((await fetch(base+'/public/booking/vehicles?site=flow-rentals')).status,404);
  console.log('PASS: public quote, checkout, retry, admin booking list and unpublish.');
  console.log('PASS: register → login → workspace → fleet → publish → anonymous website discovery');
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true});}
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1);});
