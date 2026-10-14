/**
 * Real API/SQLite fleet-entry acceptance. Isolated review accounts only.
 * Never touches production databases, invents active rentals, or publishes cars.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {randomUUID} from "node:crypto";

async function main(){
  if(process.env.NODE_ENV!=="test" || process.env.APP_ENV!=="test" ||
     resolve(process.env.SQLITE_PATH||"")!==resolve(".review/access/review.sqlite"))
    throw new Error("Fleet intake acceptance is restricted to isolated review SQLite.");
  const accounts=JSON.parse(readFileSync(".review/access/accounts.json","utf8"));
  const origin="http://127.0.0.1:3511/api/v1";
  async function send(path:string,token?:string,tenantId?:string,body?:unknown) {
    const res=await fetch(origin+path,{
      method:body===undefined?"GET":"POST",
      headers:{"Content-Type":"application/json",...(token?{Authorization:"Bearer "+token}:{}),
        ...(tenantId?{"X-Tenant-ID":tenantId}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    const data=await res.json() as any;
    return {status:res.status,data:data.data,error:data.error?.message||""};
  }
  const login=await send("/auth/login",undefined,undefined,accounts.COMPANY_OWNER);
  assert.equal(login.status,200);const token=login.data.tokens.accessToken;
  const context=await send("/access/context",token);
  assert.equal(context.status,200);
  const portal=context.data.portals.find((p:any)=>p.kind==="tenant" && p.roles.includes("COMPANY_OWNER"));
  assert.ok(portal);const tenantId=portal.tenantId;
  const before=await send("/fleet/vehicles?limit=100",token,tenantId);
  assert.equal(before.status,200);const beforeIds=new Set(before.data.map((v:any)=>v.id));
  const existing=await send("/fleet/registration-entries",token,tenantId);
  assert.equal(existing.status,200);assert.equal(existing.data.length,0);
  const batchKey="test-"+randomUUID();
  const first=await send("/fleet/registration-entries",token,tenantId,{count:5,idempotencyKey:batchKey});
  assert.equal(first.status,201);assert.equal(first.data.length,5);
  assert.ok(first.data.every((row:any)=>row.status==="UNREGISTERED"&&!row.vehicleId));
  const retry=await send("/fleet/registration-entries",token,tenantId,{count:5,idempotencyKey:batchKey});
  assert.equal(retry.status,201);
  assert.deepEqual(first.data.map((row:any)=>row.id),retry.data.map((row:any)=>row.id));
  const mismatch=await send("/fleet/registration-entries",token,tenantId,{count:6,idempotencyKey:batchKey});
  assert.equal(mismatch.status,409,"Idempotency cannot silently create a different batch.");
  const invalidCount=await send("/fleet/registration-entries",token,tenantId,{count:101,idempotencyKey:"test-"+randomUUID()});
  assert.equal(invalidCount.status,400);
  const afterCreate=await send("/fleet/vehicles?limit=100",token,tenantId);
  assert.equal(afterCreate.data.length,before.data.length,
    "Blank Fleet entries must not fabricate operational Vehicles.");
  const invalid=await send("/fleet/registration-entries/"+first.data[0].id+"/register",token,tenantId,{});
  assert.equal(invalid.status,400,"Real identity fields are required before registration.");
  const renterLogin=await send("/auth/login",undefined,undefined,accounts.RENTER);
  assert.equal(renterLogin.status,200);
  const denied=await send("/fleet/registration-entries",renterLogin.data.tokens.accessToken,tenantId);
  assert.equal(denied.status,403,"Renter cannot browse internal registration drafts.");
  const plate="QA-ENTRY-"+randomUUID().slice(0,7).toUpperCase();
  const vehicle=await send("/fleet/registration-entries/"+first.data[0].id+"/register",token,tenantId,{
    registrationPlate:plate,make:"QA Real Entry",model:"Verification",year:2025,
    category:"SUV",dailyRate:5000,transmission:"AUTOMATIC",seats:5,
    fuelType:"PETROL",odometer:0,fuelLevel:90,isPublishedToWebsite:true,
  });
  assert.equal(vehicle.status,201,vehicle.error);
  assert.equal(vehicle.data.registrationPlate,plate);
  assert.equal(vehicle.data.isPublishedToWebsite,false,"Fleet entries must not auto-publish to public customers.");
  assert.equal(vehicle.data.availabilityStatus,"AVAILABLE");
  const repeated=await send("/fleet/registration-entries/"+first.data[0].id+"/register",token,tenantId,{
    registrationPlate:"QA-REPEAT",make:"QA",model:"Repeat",year:2025,category:"SUV",dailyRate:5000,
  });
  assert.equal(repeated.status,409,"A registered entry cannot create another asset.");
  const remaining=await send("/fleet/registration-entries",token,tenantId);
  assert.equal(remaining.data.filter((row:any)=>row.status==="REGISTERED").length,1);
  assert.equal(remaining.data.filter((row:any)=>row.status==="UNREGISTERED").length,4);
  const after=await send("/fleet/vehicles?limit=100",token,tenantId);
  assert.equal(after.data.filter((v:any)=>!beforeIds.has(v.id)).length,1,
    "Only the completed registration can create a Vehicle.");
  const checked=await send("/fleet/vehicles/"+vehicle.data.id,token,tenantId);
  assert.equal(checked.status,200);
  assert.equal(checked.data.make,"QA Real Entry");
  console.log("PASS fleet entries: 5 persistent drafts, retry-safe, permission-scoped, non-rentable until canonical registration.");
}
main().catch(error=>{console.error("Fleet entry acceptance:",error.stack||error);process.exitCode=1;});
