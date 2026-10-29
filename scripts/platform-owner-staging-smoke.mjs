/**
 * Read-only staging acceptance for the real hosted API. Fails closed when
 * environment credentials or the endpoint are absent. No mutations, mock
 * tokens, local fixtures, or production data writes.
 *
 * Required:
 * SAGE_STAGING_API_URL=https://staging.example.tld
 * SAGE_STAGING_PLATFORM_OWNER_TOKEN
 * SAGE_STAGING_COMPANY_OWNER_TOKEN
 * SAGE_STAGING_BILLING_ADMIN_TOKEN
 */
const required = ["SAGE_STAGING_API_URL","SAGE_STAGING_PLATFORM_OWNER_TOKEN","SAGE_STAGING_COMPANY_OWNER_TOKEN","SAGE_STAGING_BILLING_ADMIN_TOKEN"];
const missing = required.filter(k=>!process.env[k]);
if (missing.length) {
  console.error("BLOCKED: staging evidence missing required inputs: "+missing.join(", "));
  process.exit(1);
}
const origin = new URL(process.env.SAGE_STAGING_API_URL);
if (origin.protocol !== "https:" || origin.username || origin.password) {
  throw new Error("Staging must use an authenticated HTTPS origin.");
}
const token = {
  platform: process.env.SAGE_STAGING_PLATFORM_OWNER_TOKEN,
  tenant: process.env.SAGE_STAGING_COMPANY_OWNER_TOKEN,
  billing: process.env.SAGE_STAGING_BILLING_ADMIN_TOKEN,
};
async function verify(path,who,expected) {
  const ctrl = new AbortController();
  const timeout=setTimeout(()=>ctrl.abort(),20000);
  try {
    const res=await fetch(new URL("/api/v1"+path,origin),{
      headers:{accept:"application/json",...(who?{authorization:"Bearer "+token[who]}:{})},
      signal:ctrl.signal,cache:"no-store",redirect:"error"
    });
    if(res.status!==expected) throw new Error(path+" ["+(who||"public")+"] expected HTTP "+expected+" but received "+res.status);
    let body=null;
    if (res.status===200) {
      body=await res.json();
      if(body?.error || body?.success===false) throw new Error(path+" returned business error despite HTTP 200");
    }
    console.log("PASS",path,who||"public",res.status);
    return body?.data??body;
  } finally {clearTimeout(timeout);}
}
function confirmPortal(context,kind,role){
  const data=context?.portals || context?.data?.portals;
  if(!Array.isArray(data)||!data.some(p=>p.kind===kind && p.roles?.includes(role)))throw new Error(role+" platform context mismatch");
}
const admin=await verify("/access/context","platform",200);
confirmPortal(admin,"platform","PLATFORM_OWNER");
const company=await verify("/access/context","tenant",200);
confirmPortal(company,"tenant","COMPANY_OWNER");
const billing=await verify("/access/context","billing",200);
confirmPortal(billing,"platform","BILLING_ADMIN");
await verify("/platform/tenants","platform",200);
await verify("/platform/subscriptions","platform",200);
await verify("/platform/billing/invoices","platform",200);
await verify("/platform/billing/payments","platform",200);
await verify("/platform/analytics/overview","platform",200);
await verify("/platform/operations/jobs/queues","platform",200);
await verify("/platform/operations/audit","platform",200);
await verify("/platform/tenants","tenant",403);
await verify("/platform/analytics/overview","tenant",403);
await verify("/platform/billing/invoices","tenant",403);
await verify("/platform/operations/config","tenant",403);
await verify("/platform/operations/config","billing",403);
await verify("/platform/billing/invoices","billing",200);
await verify("/platform/tenants",null,401);
console.log("PASS: authenticated staging role isolation and source-backed platform GET routes.");
