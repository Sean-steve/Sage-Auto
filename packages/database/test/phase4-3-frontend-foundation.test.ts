import assert from "node:assert/strict";
import { MODULES, mayOpen, navigation, commands } from "../../../src/experience/registry";
import { laneOf, labelStatus, sortedBookings } from "../../../src/experience/booking-queue";
const portal={sections:[{id:"overview",label:"Overview"},{id:"bookings",label:"Bookings"},{id:"original-only",label:"Original-only"}]};
assert.equal(MODULES.length,18);
assert.equal(mayOpen(portal,"finance"),false);
assert.equal(mayOpen(portal,"bookings"),true);
assert.deepEqual(navigation(portal).at(-1),{label:"Additional modules",ids:["original-only"]});
assert.equal(commands(portal,"original").length,1);
assert.equal(commands(portal,"finance").length,0);
assert.equal(laneOf("AWAITING_PAYMENT"),"review");
assert.equal(labelStatus("PENDING_CONFIRMATION"),"Pending Confirmation");
const bookings=[{id:"b1",status:"CONFIRMED",pickupAt:"2026-10-16T14:00:00Z"},{id:"b2",status:"AWAITING_PAYMENT",pickupAt:"2026-10-16T09:00:00Z"}];
assert.equal(sortedBookings(bookings)[0].id,"b2");
assert.equal(sortedBookings(bookings,"pickup").length,1);
assert.equal(bookings[0].id,"b1","Projection never mutates API records");
console.log("Phase 4.3 navigation and workboard contract: PASS");

const tokens=new Map<string,string>();
Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{
 getItem:(k:string)=>tokens.get(k)??null,
 setItem:(k:string,v:string)=>{tokens.set(k,v);},
 removeItem:(k:string)=>{tokens.delete(k);},
 clear:()=>tokens.clear(),
}});
async function runTenantContract(){
const {apiClient}=await import("../../../src/lib/api-client");
const {requireWorkspace,workspaceRead,workspaceCommand}=await import("../../../src/experience/gateway");
const tenant={id:"tenant-portal",kind:"tenant",tenantId:"company-1",permissions:["booking.read"],roles:["BOOKING_AGENT"],name:"Company",sections:[{id:"bookings",label:"Bookings"}]};
apiClient.setTenantId("company-1");
apiClient.setToken("integration-test-token");
assert.doesNotThrow(()=>requireWorkspace(tenant,"booking.read","bookings"));
assert.throws(()=>requireWorkspace({...tenant,tenantId:"company-2"},"booking.read","bookings"),/Select your company workspace/);
assert.throws(()=>requireWorkspace({...tenant,permissions:[]},"booking.read","bookings"),/permission/);
assert.throws(()=>requireWorkspace(tenant,"booking.read","finance"),/permission/);
await assert.rejects(()=>workspaceCommand(tenant,"booking.create","/bookings",{}),/permission/);
await assert.rejects(()=>workspaceRead(tenant,"booking.read","https://example.com","bookings"),/internal API/);
const originalFetch=globalThis.fetch;
let requested="";
let headerTenant="",headerAuth="";
try{
 globalThis.fetch=async (url:RequestInfo|URL,opts?:RequestInit)=>{
  requested=String(url);
  const headers=opts?.headers as Record<string,string>;
  headerTenant=headers["X-Tenant-ID"];
  headerAuth=headers.Authorization;
  return new Response(JSON.stringify({data:[{bookingNumber:"SAGE-001"}]}),{status:200,headers:{"content-type":"application/json"}});
 };
 const result=await workspaceRead<{bookingNumber:string}[]>(tenant,"booking.read","/bookings","bookings");
 assert.equal(requested,"/api/v1/bookings");
 assert.equal(headerTenant,"company-1");
 assert.equal(headerAuth,"Bearer integration-test-token");
 assert.equal(result.data?.[0].bookingNumber,"SAGE-001");
}finally{globalThis.fetch=originalFetch;apiClient.setToken(null);apiClient.clearTenantId();}
console.log("Phase 4.3 tenant/permission boundaries and request headers: PASS");

}
void runTenantContract().catch(e=>{console.error(e);process.exitCode=1;});
