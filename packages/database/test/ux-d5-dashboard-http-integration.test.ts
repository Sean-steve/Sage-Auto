import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * UX-D5 live Express HTTP boundary certification.
 * Isolated test DB is SQLite; this does NOT certify PostgreSQL authority.
 * No demo money, browser store, fake dashboard DTO or production credentials.
 */
async function main() {
  const folder=mkdtempSync(join(tmpdir(),"sage-ux-d5-api-"));
  Object.assign(process.env,{
    SQLITE_PATH:join(folder,"records.sqlite"),
    NODE_ENV:"test",APP_ENV:"test",REDIS_SIMULATED:"true",
    ACCESS_REVIEW_MODE:"true",
    PLATFORM_SETUP_TOKEN:"isolated-d5-test-token-32-characters",
    OWNER_PAYOUT_ENCRYPTION_KEY:"D5OnboardingTestKey_2026-NeverUseInProduction",
  });
  const {createApiApp}=await import("../../../apps/api/src/app.module");
  const app=createApiApp();
  const server=app.listen(0,"127.0.0.1");
  await new Promise<void>((resolve,reject)=>{server.once("listening",resolve);server.once("error",reject);});
  const base="http://127.0.0.1:"+(server.address() as any).port+"/api/v1";
  type Actor={token:string;id:string;email:string};
  async function request(path:string,actor?:Actor,body?:any,method="GET",expected=200,tenantId?:string):Promise<any> {
    const response=await fetch(base+path,{
      method,
      headers:{"Content-Type":"application/json",
        ...(actor?{Authorization:"Bearer "+actor.token}:{}),
        ...(tenantId?{"X-Tenant-ID":tenantId}:{})},
      body:body===undefined?undefined:JSON.stringify(body),
    });
    let result:any;
    try {result=await response.json();} catch {result={};}
    assert.equal(response.status,expected,method+" "+path+": "+JSON.stringify(result).slice(0,600));
    return result;
  }
  async function account(tag:string):Promise<Actor>{
    const email="ux-d5-"+tag+"@example.test",password="UXD5Test#2026SecurePass";
    const reg=await request("/auth/register",undefined,{email,password,fullName:tag+" Test"},"POST",201);
    const logged=await request("/auth/login",undefined,{email,password},"POST");
    const actor:Actor={email,id:reg.data.user.id,token:logged.data.tokens.accessToken};
    const mail=await request("/access/review-mail",actor);
    const code=(mail.data as any[]).find(x=>x.type==="EMAIL_VERIFICATION")?.token;
    assert.ok(code,"An isolated verification code must exist");
    await request("/auth/verify-email",undefined,{token:code},"POST");
    return actor;
  }
  async function company(actor:Actor,label:string):Promise<string>{
    await request("/access/profile",actor,{intent:"company",companyName:label},"PUT");
    const completed=await request("/access/complete",actor,{},"POST");
    const portal=completed.data.portals.find((item:any)=>item.roles.includes("COMPANY_OWNER"));
    assert.ok(portal,"Company owner portal is required");
    return portal.tenantId;
  }

  try {
    const ownerA=await account("owner-a"),ownerB=await account("owner-b");
    const tenantA=await company(ownerA,"UX D5 Alpha Rentals");
    const tenantB=await company(ownerB,"UX D5 Beta Rentals");
    assert.notEqual(tenantA,tenantB);

    const setupA=await request("/tenant/setup-status",ownerA,undefined,"GET",200,tenantA);
    assert.equal(setupA.data.tenantId,tenantA);
    assert.equal(setupA.data.state,"NOT_STARTED");
    assert.equal(setupA.data.visibleOnOverview,true);
    assert.equal(setupA.data.steps.length,6);
    await request("/tenant/setup-status",undefined,undefined,"GET",401,tenantA);
    await request("/tenant/setup-status",ownerA,undefined,"GET",403,tenantB);

    const hidden=await request("/tenant/setup-status/visibility",ownerA,{action:"DISMISS"},"POST",200,tenantA);
    assert.equal(hidden.data.state,"DISMISSED");
    assert.equal(hidden.data.visibleOnOverview,false);
    assert.equal((await request("/tenant/setup-status",ownerA,undefined,"GET",200,tenantA)).data.visibleOnOverview,false);
    assert.equal((await request("/tenant/setup-status",ownerB,undefined,"GET",200,tenantB)).data.visibleOnOverview,true);
    const restored=await request("/tenant/setup-status/visibility",ownerA,{action:"RESTORE"},"POST",200,tenantA);
    assert.equal(restored.data.visibleOnOverview,true);
    assert.equal(restored.data.state,"NOT_STARTED");

    // A full owner can view only the reporting data from their own tenant.
    const a=await request("/analytics/dashboard?preset=THIS_MONTH",ownerA,undefined,"GET",200,tenantA);
    assert.equal(a.data.tenantId,tenantA,"Dashboard envelope and tenant must match");
    assert.equal(a.data.chartAvailability.utilization,"UNAVAILABLE",
      "Missing fleet capacity history cannot appear as a fabricated utilization chart");
    assert.deepEqual(a.data.utilizationChart,[]);
    assert.ok(Array.isArray(a.data.revenueChart));
    assert.ok(Array.isArray(a.data.bookingVolumeChart));
    const b=await request("/analytics/dashboard?preset=THIS_MONTH",ownerB,undefined,"GET",200,tenantB);
    assert.equal(b.data.tenantId,tenantB);
    await request("/analytics/dashboard?preset=THIS_MONTH",ownerA,undefined,"GET",403,tenantB);
    await request("/analytics/dashboard",undefined,undefined,"GET",401,tenantA);

    // A limited staff member must never access executive money or setup state.
    const agent=await account("booking-agent");
    await request("/access/invitations",ownerA,{
      scope:"tenant",tenantId:tenantA,email:agent.email,role:"BOOKING_AGENT",
    },"POST",200,tenantA);
    const invitations=await request("/access/review-mail",agent);
    const invite=(invitations.data as any[]).filter(x=>x.type==="INVITATION").at(-1)?.token;
    assert.ok(invite,"A separate staff invitation must be generated");
    await request("/access/accept",agent,{token:invite},"POST");
    const context=await request("/access/context",agent);
    assert.ok(context.data.portals.some((p:any)=>p.tenantId===tenantA));
    await request("/tenant/setup-status",agent,undefined,"GET",403,tenantA);
    await request("/analytics/dashboard",agent,undefined,"GET",403,tenantA);
    await request("/analytics/metrics/FINANCE_POSTED_REVENUE",agent,undefined,"GET",403,tenantA);
    await request("/analytics/metrics/batch",agent,{keys:["BOOKING_TOTAL_COUNT","FINANCE_POSTED_REVENUE"]},"POST",403,tenantA);
    await request("/reports/catalogue",agent,undefined,"GET",403,tenantA);

    console.log("UX-D5 LIVE HTTP PASS: auth, setup persistence, isolated tenants, trusted dashboard envelope, restricted finance metrics, batch rejection and no fictional utilization");
  } finally {
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    rmSync(folder,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
