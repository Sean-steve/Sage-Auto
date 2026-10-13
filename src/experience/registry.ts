import type { AccessPortal } from "../lib/access-context";
export type WorkspaceGroup="Command"|"Operations"|"Fleet & people"|"Commercial"|"Workspace";
export type WorkspaceModule={id:string;group:WorkspaceGroup;description:string};
export const MODULES:readonly WorkspaceModule[]=[
["overview","Command","Live operational command center"],
["bookings","Operations","Reservation lifecycle and confirmation"],
["handover","Operations","Contracts, inspection and key release"],
["availability","Operations","Allocations, holds, blocks and fleet calendar"],
["rentals","Operations","Active on-road rental operations"],
["returns","Operations","Vehicle receipt and final calculation"],
["fleet","Fleet & people","Vehicles, ownership and asset truth"],
["customers","Fleet & people","Customers, drivers and corporate relationships"],
["inspections","Fleet & people","Condition evidence and damage records"],
["maintenance","Fleet & people","Service, schedules and vehicle downtime"],
["compliance","Fleet & people","Regulatory documents and readiness"],
["owners","Fleet & people","Vehicle owners and sharing agreements"],
["pricing","Commercial","Rate plans, rules, fees and promotions"],
["finance","Commercial","Invoices, payments, deposits and reconciliation"],
["settlements","Commercial","Owner earnings, approvals and payouts"],
["website","Workspace","Rental website and publishing"],
["team","Workspace","Membership, roles and invitations"],
["settings","Workspace","Company configuration and governance"],
].map(([id,group,description])=>({id,group:group as WorkspaceGroup,description}));
const order:readonly WorkspaceGroup[]=["Command","Operations","Fleet & people","Commercial","Workspace"];
const catalog=new Map(MODULES.map(x=>[x.id,x]));
export const mayOpen=(portal:Pick<AccessPortal,"sections">,id:string)=>portal.sections.some(s=>s.id===id);
export const describe=(id:string)=>catalog.get(id)?.description||"Permitted workspace capability";
export function navigation(portal:Pick<AccessPortal,"sections">){
 const granted=new Set(portal.sections.map(s=>s.id));
 const groups:{label:string;ids:string[]}[]=order.map(label=>({label,ids:MODULES.filter(m=>m.group===label&&granted.has(m.id)).map(m=>m.id)})).filter(g=>g.ids.length>0);
 const unknown=portal.sections.filter(s=>!catalog.has(s.id)).map(s=>s.id);
 if(unknown.length)groups.push({label:"Additional modules",ids:unknown});
 return groups;
}
export function commands(portal:Pick<AccessPortal,"sections">,query:string){
 const q=query.trim().toLowerCase();
 return portal.sections.filter(s=>!q||[s.id,s.label,describe(s.id)].some(v=>v.toLowerCase().includes(q))).map(s=>({...s,description:describe(s.id)}));
}
