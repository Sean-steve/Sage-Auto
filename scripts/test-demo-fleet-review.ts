/** Integration check: review:api must expose its persisted demo inventory via real HTTP. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const base=process.env.SAGE_REVIEW_API||"http://127.0.0.1:3511/api/v1";
const accounts=JSON.parse(readFileSync(".review/access/accounts.json","utf8"));
const login=await fetch(base+"/auth/login",{method:"POST",
  headers:{"Content-Type":"application/json"},body:JSON.stringify(accounts.COMPANY_OWNER)});
assert.equal(login.status,200,"Isolated review Company Owner login");
const loginJson:any=await login.json();
const token=loginJson.data.tokens.accessToken;
const headers={Authorization:"Bearer "+token};
const context=await fetch(base+"/access/context",{headers});
assert.equal(context.status,200);
const who:any=await context.json();
const tenant=who.data.portals.find((p:any)=>p.kind==="tenant"&&p.roles.includes("COMPANY_OWNER"));
assert.ok(tenant);
const response=await fetch(base+"/fleet/vehicles?limit=100",{headers:{
  ...headers,"X-Tenant-ID":tenant.tenantId||tenant.id
}});
assert.equal(response.status,200,"Owner can see server-backed Fleet");
const body:any=await response.json();
const demo=(body.data as any[]).filter(v=>v.registrationPlate.startsWith("DEMO-"));
assert.equal(demo.length,26,"Review workspace must expose all 26 persisted demo vehicles");
assert.equal(new Set(demo.map(v=>v.category)).size,6,"Review fleet has six classes");
assert.ok(demo.every(v=>v.lifecycleStatus==="ACTIVE"&&v.availabilityStatus==="AVAILABLE"));
assert.ok(demo.every(v=>v.isPublishedToWebsite===false));
assert.ok(demo.every(v=>v.tenantId===(tenant.tenantId||tenant.id)),"No cross-tenant data leakage");
const rentalsRes=await fetch(base+"/rentals",{headers:{
  ...headers,"X-Tenant-ID":tenant.tenantId||tenant.id
}});
assert.equal(rentalsRes.status,200);
const rentals:any=await rentalsRes.json();
assert.ok((rentals.data as any[]).every(r=>!demo.some(v=>v.id===r.vehicleId)),
  "Sample Fleet inventory must not fabricate actual operational rentals.");
console.log("PASS: authenticated review API serves all 26 demo cars in 6 classes without synthetic rentals.");
