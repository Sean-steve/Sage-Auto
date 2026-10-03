import { mkdirSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';

async function main() {
  if(['production','staging'].includes(process.env.NODE_ENV||'') || process.env.SQLITE_PATH) throw new Error('Review setup refuses production/staging or an externally supplied database.');
  const dir=resolve('.review/access');mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
  const credentialsPath=join(dir,'accounts.json');
  const credentials:Record<string,{email:string;password:string}>=existsSync(credentialsPath)?JSON.parse(readFileSync(credentialsPath,'utf8')):{};
  const save=()=>writeFileSync(credentialsPath,JSON.stringify(credentials,null,2),{mode:0o600});
  Object.assign(process.env,{NODE_ENV:'test',APP_ENV:'test',ACCESS_REVIEW_MODE:'true',REDIS_SIMULATED:'true',SQLITE_PATH:join(dir,'review.sqlite'),PLATFORM_SETUP_TOKEN:randomBytes(32).toString('hex')});
  const {createApiApp}=await import('../apps/api/src/app.module');
  const {PLATFORM_ROLES,TENANT_SYSTEM_ROLES}=await import('@carhire/constants');
  const app=createApiApp();const port=Number(process.env.ACCESS_REVIEW_PORT||3511);const server=app.listen(port,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const base=`http://127.0.0.1:${port}/api/v1`;
  async function request(path:string,token?:string,body?:any,method=body?'POST':'GET') {
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const result=await response.json();if(!response.ok)throw new Error(`${path}: ${result.error?.message||result.message||response.status}`);return result.data;
  }
  async function account(role:string) {
    const fresh=!credentials[role];
    if(fresh){credentials[role]={email:`${role.toLowerCase()}@review.example.test`,password:`Rv!9${randomBytes(18).toString('base64url')}`};save();}
    const identity=credentials[role];
    if(fresh)await request('/auth/register',undefined,{...identity,fullName:role.replaceAll('_',' ') });
    const login=await request('/auth/login',undefined,identity),token=login.tokens.accessToken;
    let context=await request('/access/context',token);
    if(!context.user.emailVerified) {
      await request('/auth/resend-verification',undefined,{email:identity.email});
      const mail=await request('/access/review-mail',token),code=mail.filter((m:any)=>m.type==='EMAIL_VERIFICATION').at(-1).token;
      await request('/auth/verify-email',undefined,{token:code});context=await request('/access/context',token);
    }
    return {token,context,...identity};
  }
  const platform=await account('PLATFORM_OWNER');
  if(!platform.context.portals.some((p:any)=>p.kind==='platform')) await request('/access/bootstrap',platform.token,{secret:process.env.PLATFORM_SETUP_TOKEN});
  const company=await account('COMPANY_OWNER');
  if(!company.context.portals.some((p:any)=>p.kind==='tenant')) {
    await request('/access/profile',company.token,{intent:'company',companyName:'Role Review Workspace'},'PUT');
    company.context=await request('/access/complete',company.token,{});
  }
  const tenantId=company.context.portals.find((p:any)=>p.kind==='tenant').id;
  for(const role of [...Object.keys(PLATFORM_ROLES).filter(r=>r!=='PLATFORM_OWNER'),...Object.keys(TENANT_SYSTEM_ROLES).filter(r=>r!=='COMPANY_OWNER')]) {
    const member=await account(role);
    if(member.context.portals.some((p:any)=>p.roles.includes(role)))continue;
    const isPlatform=Boolean(PLATFORM_ROLES[role]);
    await request('/access/invitations',isPlatform?platform.token:company.token,{scope:isPlatform?'platform':'tenant',...(isPlatform?{}:{tenantId}),email:member.email,role});
    const mail=await request('/access/review-mail',member.token),token=mail.filter((m:any)=>m.type==='INVITATION').at(-1).token;
    await request('/access/accept',member.token,{token});
  }
  const renter=await account('RENTER');
  if(!renter.context.portals.some((p:any)=>p.kind==='renter')) {
    await request('/access/profile',renter.token,{intent:'renter',site:'role-review-workspace',phone:'+254700000000'},'PUT');
    await request('/access/complete',renter.token,{});
  }
  const lines=['# Isolated role review access','','Open http://localhost:3510/','', 'These accounts are for the isolated review database only. Do not reuse these passwords elsewhere.','','| Role | Email | Password |','|---|---|---|',...Object.entries(credentials).map(([role,value])=>`| ${role} | ${value.email} | ${value.password} |`)];
  writeFileSync(join(dir,'ACCESS.md'),lines.join('\n')+'\n',{mode:0o600});
  console.log(`READY: 20 role accounts. Private access instructions: ${join(dir,'ACCESS.md')}`);
  console.log(`Review API listens on 127.0.0.1:${port}; real application data was not used.`);
}
main().catch(e=>{console.error(e.message);process.exit(1);});
