import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft, CalendarDays, CheckCircle2, ChevronRight, Clock3, Loader2,
  Lock, Plus, RefreshCw, Search, ShieldAlert, X
} from "lucide-react";
import { apiClient, type ApiResponse } from "../lib/api-client";
import { permits, type AccessPortal } from "../lib/access-context";
import { useApp } from "../lib/store";

type Props={portal:AccessPortal};
type Tab="timeline"|"search"|"allocations"|"holds"|"blocks"|"check";

const inputClass="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400";
const primary="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondary="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const danger="inline-flex items-center justify-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50";

async function unwrap<T>(response:ApiResponse<T>|Promise<ApiResponse<T>>):Promise<T>{
  const resolved=await response;if(resolved.error)throw new Error(resolved.error.message);return resolved.data as T;
}
function human(value?:string|null){return value?value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase()):"—";}
function dateTime(value?:string|null){if(!value)return "—";const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString():"—";}
function localInput(value?:string|Date|null){const d=value instanceof Date?value:value?new Date(value):null;if(!d||!Number.isFinite(d.getTime()))return "";const p=(n:number)=>String(n).padStart(2,"0");return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes());}
function iso(v:string){return new Date(v).toISOString();}
function statusClass(value?:string){
  if(["ACTIVE","CONFIRMED","AVAILABLE"].includes(value||""))return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if(["HELD","PENDING","SCHEDULED"].includes(value||""))return "border-amber-200 bg-amber-50 text-amber-700";
  if(["RELEASED","EXPIRED","CANCELLED","CONVERTED"].includes(value||""))return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-blue-200 bg-blue-50 text-blue-700";
}
function Status({value}:{value?:string}){return <span className={"inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide "+statusClass(value)}>{human(value)}</span>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="grid gap-1 text-xs font-semibold text-slate-600"><span>{label}</span>{children}</label>;}
function friendlyAvailabilityError(text:string,vehicles:any[]=[]){
  const raw=String(text||"Availability operation failed.");
  const vehicle=vehicles.find(v=>raw.includes(v.id));
  const name=vehicle?`${vehicle.registrationPlate} · ${vehicle.make} ${vehicle.model}`:"The selected vehicle";
  const overlap=raw.match(/overlapping\s+([A-Z_]+)\s+allocation\s+\([^)]*\)\s+from\s+([^\s]+)\s+to\s+([^\s.]+)/i);
  if(overlap)return `${name} already has ${human(overlap[1]).toLowerCase()} activity from ${dateTime(overlap[2])} to ${dateTime(overlap[3])}. Choose another vehicle or time window.`;
  if(/hold.*expired/i.test(raw))return "That temporary hold has expired. Create a new hold before continuing.";
  if(/non-operational/i.test(raw))return `${name} is not currently available for allocation. Check its Fleet status or choose another vehicle.`;
  return raw
    .replace(/Vehicle\s+[0-9a-f]{8}-[0-9a-f-]{27,}/gi,name)
    .replace(/\(alloc_[^)]+\)/gi,"")
    .replace(/hld_tok_[a-z0-9_\-]+/gi,"temporary hold")
    .replace(/\s{2,}/g," ")
    .trim();
}
function ErrorBox({text}:{text:string}){return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{text}</div>;}
function Notice({text}:{text:string}){return <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{text}</div>;}
function Metric({label,value}:{label:string;value:any}){return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>;}
function Info({label,value}:{label:string;value:any}){return <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-medium text-slate-800">{value===null||value===undefined||value===""?"—":String(value)}</p></div>;}
function Modal({title,subtitle,onClose,children}:{title:string;subtitle?:string;onClose:()=>void;children:React.ReactNode}){return <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true"><div className="ml-auto flex h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-3xl"><header className="flex items-start justify-between border-b p-5 sm:p-6"><div><h2 className="text-xl font-bold">{title}</h2>{subtitle&&<p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div><button onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-slate-100"><X size={19}/></button></header><div className="flex-1 overflow-y-auto p-5 sm:p-6">{children}</div></div></div>;}

export function AvailabilityExperienceView({portal}:Props){
  const {navigateSection}=useApp();
  const can=(p:string)=>permits(portal,p);
  const [tab,setTab]=useState<Tab>("timeline");
  const [vehicles,setVehicles]=useState<any[]>([]);
  const [categories,setCategories]=useState<any[]>([]);
  const [customers,setCustomers]=useState<any[]>([]);
  const [allocations,setAllocations]=useState<any[]>([]);
  const [holds,setHolds]=useState<any[]>([]);
  const [blocks,setBlocks]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [days,setDays]=useState(14);
  const [windowStart,setWindowStart]=useState(()=>new Date().toISOString().slice(0,10));
  const [selectedVehicle,setSelectedVehicle]=useState("");
  const [calendar,setCalendar]=useState<any>(null);
  const [calendarLoading,setCalendarLoading]=useState(false);
  const [createAllocation,setCreateAllocation]=useState(false);
  const [createHold,setCreateHold]=useState(false);
  const [createBlock,setCreateBlock]=useState(false);
  const [confirmHold,setConfirmHold]=useState<any>(null);
  const [substitute,setSubstitute]=useState<any>(null);
  const [release,setRelease]=useState<{kind:"allocation"|"block";record:any}|null>(null);
  const refreshSeq=useRef(0),calendarSeq=useRef(0);
  const refreshInFlight=useRef<Promise<void>|null>(null);
  const initialAvailabilityLoaded=useRef(false);

  const window=useMemo(()=>{
    const start=new Date(windowStart+"T00:00:00");
    const end=new Date(start);end.setDate(end.getDate()+days);
    return {start:start.toISOString(),end:end.toISOString()};
  },[windowStart,days]);

  async function loadReferenceData(){
    const result=await Promise.all([
      can("vehicle.read")?apiClient.fleet.listVehicles({limit:100}):Promise.resolve({data:[] as any[],error:undefined}),
      can("vehicle.read")?apiClient.fleet.getCategories():Promise.resolve({data:[] as any[],error:undefined}),
      can("customer.read")?apiClient.customers.listCustomers({limit:100}):Promise.resolve({data:[] as any[],error:undefined}),
    ]);
    setVehicles(result[0].error?[]:result[0].data||[]);
    setCategories(result[1].error?[]:result[1].data||[]);
    setCustomers(result[2].error?[]:result[2].data||[]);
  }

  function refresh(options:{showLoading?:boolean}={}){
    if(refreshInFlight.current)return refreshInFlight.current;
    const request=++refreshSeq.current;
    const shouldShowLoading=options.showLoading??!initialAvailabilityLoaded.current;
    if(shouldShowLoading)setLoading(true);
    setError("");
    const work=(async()=>{
      try{
        const queries={from:window.start,to:window.end};
        const result=await Promise.all([
          apiClient.availability.listAllocations(queries),
          apiClient.availability.listHolds(queries),
          apiClient.availability.listBlocks(queries),
        ]);
        if(request!==refreshSeq.current)return;
        for(const response of result)if(response.error)throw new Error(response.error.message);
        const now=Date.now();
        setAllocations((result[0].data||[]).map((a:any)=>a.status==="HELD"&&a.holdExpiresAt&&Number.isFinite(Date.parse(a.holdExpiresAt))&&Date.parse(a.holdExpiresAt)<=now?{...a,status:"EXPIRED"}:a));
        setHolds((result[1].data||[]).map((h:any)=>h.status==="PENDING"&&h.expiresAt&&Number.isFinite(Date.parse(h.expiresAt))&&Date.parse(h.expiresAt)<=now?{...h,status:"EXPIRED"}:h));
        setBlocks(result[2].data||[]);
        initialAvailabilityLoaded.current=true;
      }catch(e:any){
        if(request===refreshSeq.current)setError(e.message||"Unable to load Availability.");
      }finally{
        if(request===refreshSeq.current)setLoading(false);
      }
    })();
    const tracked=work.finally(()=>{if(refreshInFlight.current===tracked)refreshInFlight.current=null;});
    refreshInFlight.current=tracked;
    return tracked;
  }

  useEffect(()=>{void loadReferenceData().catch((e:any)=>setError(e.message||"Unable to load Availability reference data."));},[portal.id]);
  useEffect(()=>{
    const timer=globalThis.setTimeout(()=>{void refresh({showLoading:!initialAvailabilityLoaded.current});},180);
    return()=>globalThis.clearTimeout(timer);
  },[portal.id,window.start,window.end]);

  async function loadCalendar(vehicleId=selectedVehicle){
    if(!vehicleId){setCalendar(null);return;}
    const request=++calendarSeq.current;setCalendarLoading(true);setError("");
    try{const data=await unwrap(apiClient.availability.getVehicleCalendar(vehicleId,window.start,window.end));if(request===calendarSeq.current)setCalendar(data);}
    catch(e:any){if(request===calendarSeq.current)setError(e.message||"Unable to load Vehicle calendar.");}
    finally{if(request===calendarSeq.current)setCalendarLoading(false);}
  }
  useEffect(()=>{
    const timer=globalThis.setTimeout(()=>{if(selectedVehicle)void loadCalendar(selectedVehicle);else {calendarSeq.current++;setCalendar(null);setCalendarLoading(false);}},180);
    return()=>globalThis.clearTimeout(timer);
  },[selectedVehicle,window.start,window.end]);
  useEffect(()=>{
    const now=Date.now();
    const pending=holds
      .map((hold:any)=>({hold,expiresAt:Date.parse(hold.expiresAt)}))
      .filter(({hold,expiresAt})=>hold.status==="PENDING"&&Number.isFinite(expiresAt)&&expiresAt>now+250);
    if(!pending.length)return;
    const next=Math.min(...pending.map(item=>item.expiresAt));
    const delay=Math.min(2147483000,Math.max(500,next-now+500));
    const timer=globalThis.setTimeout(()=>{
      const expiredAt=Date.now();
      const expiredAllocationIds=new Set<string>();
      setHolds(current=>current.map((hold:any)=>{
        const expiresAt=Date.parse(hold.expiresAt);
        if(hold.status==="PENDING"&&Number.isFinite(expiresAt)&&expiresAt<=expiredAt){
          if(hold.allocationId)expiredAllocationIds.add(hold.allocationId);
          return {...hold,status:"EXPIRED"};
        }
        return hold;
      }));
      setAllocations(current=>current.map((allocation:any)=>{
        const expiresAt=allocation.holdExpiresAt?Date.parse(allocation.holdExpiresAt):NaN;
        return allocation.status==="HELD"&&Number.isFinite(expiresAt)&&expiresAt<=expiredAt
          ? {...allocation,status:"EXPIRED"}
          : allocation;
      }));
      setCalendar((current:any)=>{
        if(!current?.entries)return current;
        return {...current,entries:current.entries.map((entry:any)=>expiredAllocationIds.has(entry.id)?{...entry,status:"EXPIRED",isBlocking:false}:entry)};
      });
    },delay);
    return()=>globalThis.clearTimeout(timer);
  },[holds]);

  async function mutate(work:()=>Promise<ApiResponse<any>>,message:string){
    setError("");setNotice("");
    try{await unwrap(work());setNotice(message);await refresh({showLoading:false});if(selectedVehicle)await loadCalendar(selectedVehicle);}
    catch(e:any){setError(e.message||"Availability operation failed.");throw e;}
  }

  const activeAllocations=allocations.filter(a=>["HELD","CONFIRMED","ACTIVE"].includes(a.status)).length;
  const pendingHolds=holds.filter(h=>h.status==="PENDING").length;
  const activeBlocks=blocks.filter(b=>["ACTIVE","SCHEDULED"].includes(b.status)).length;
  const tabs:{id:Tab;label:string;show:boolean;icon:React.ReactNode}[]=[
    {id:"timeline",label:"Dispatch Timeline",show:can("availability.read"),icon:<CalendarDays size={16}/>},
    {id:"search",label:"Candidate Search",show:can("availability.read"),icon:<Search size={16}/>},
    {id:"allocations",label:"Allocations",show:can("availability.read"),icon:<Lock size={16}/>},
    {id:"holds",label:"Temporary Holds",show:can("availability.read"),icon:<Clock3 size={16}/>},
    {id:"blocks",label:"Vehicle Blocks",show:can("availability.read"),icon:<ShieldAlert size={16}/>},
    {id:"check",label:"Conflict Check",show:can("availability.read"),icon:<CheckCircle2 size={16}/>},
  ];

  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Dispatch control</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Availability & Allocation</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">Server-authoritative interval checks, holds, blocks and dispatch allocations. Empty calendar space is never treated as proof of availability.</p></div><div className="flex flex-wrap gap-2"><button onClick={()=>void refresh({showLoading:false})} className={secondary}><RefreshCw size={16}/>Refresh</button>{can("allocation.create")&&<button onClick={()=>setCreateHold(true)} className={primary}><Clock3 size={16}/>Create hold</button>}</div></header>

    {error&&<ErrorBox text={error}/>}
    {notice&&<Notice text={notice}/>}
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Blocking allocations" value={activeAllocations}/><Metric label="Pending holds" value={pendingHolds}/><Metric label="Active/scheduled blocks" value={activeBlocks}/><Metric label="Window days" value={days}/></section>

    <div className="overflow-x-auto"><nav className="flex min-w-max gap-1 rounded-2xl border bg-white p-1.5 shadow-sm">{tabs.filter(t=>t.show).map(item=><button key={item.id} onClick={()=>setTab(item.id)} className={"inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold "+(tab===item.id?"bg-slate-950 text-white":"text-slate-600 hover:bg-slate-50")}>{item.icon}{item.label}{item.id==="holds"&&<span className="opacity-70">{pendingHolds}</span>}{item.id==="blocks"&&<span className="opacity-70">{activeBlocks}</span>}</button>)}</nav></div>

    {loading?<div className="grid place-items-center rounded-2xl border bg-white p-20 text-slate-500"><Loader2 className="mb-3 animate-spin"/>Loading dispatch state…</div>:<>
      {tab==="timeline"&&<TimelinePanel vehicles={vehicles} allocations={allocations} blocks={blocks} window={window} days={days} setDays={setDays} windowStart={windowStart} setWindowStart={setWindowStart} selectedVehicle={selectedVehicle} setSelectedVehicle={setSelectedVehicle} calendar={calendar} calendarLoading={calendarLoading}/>}
      {tab==="search"&&<SearchPanel portal={portal} vehicles={vehicles} categories={categories} customers={customers} onHoldCreated={async()=>{setNotice("Temporary Hold created.");await refresh({showLoading:false});}} onOpenBookings={()=>navigateSection("bookings")}/>}
      {tab==="allocations"&&<AllocationsPanel allocations={allocations} vehicles={vehicles} canCreate={can("allocation.create")} canManage={can("allocation.manage")} onCreate={()=>setCreateAllocation(true)} onRelease={record=>setRelease({kind:"allocation",record})} onSubstitute={setSubstitute}/>}
      {tab==="holds"&&<HoldsPanel holds={holds} vehicles={vehicles} customers={customers} canCreate={can("allocation.create")} onCreate={()=>setCreateHold(true)} onRelease={hold=>void mutate(()=>apiClient.availability.releaseHold(hold.id),"Hold released.")} onConfirm={setConfirmHold}/>}
      {tab==="blocks"&&<BlocksPanel blocks={blocks} vehicles={vehicles} canCreate={can("vehicle_block.create")} canManage={can("vehicle_block.manage")} onCreate={()=>setCreateBlock(true)} onRelease={record=>setRelease({kind:"block",record})}/>}
      {tab==="check"&&<CheckPanel vehicles={vehicles} categories={categories}/>}
    </>}

    {createAllocation&&<AllocationForm vehicles={vehicles} onClose={()=>setCreateAllocation(false)} onSave={async dto=>{try{await unwrap(apiClient.availability.createAllocation(dto));setCreateAllocation(false);setNotice("Allocation created.");await refresh({showLoading:false});}catch(e:any){setError(friendlyAvailabilityError(e.message,vehicles));}}}/>}
    {createHold&&<HoldForm vehicles={vehicles} customers={customers} onClose={()=>setCreateHold(false)} onSave={async dto=>{try{await unwrap(apiClient.availability.createHold(dto));setCreateHold(false);setNotice("Temporary Hold created.");await refresh({showLoading:false});}catch(e:any){setError(friendlyAvailabilityError(e.message,vehicles));}}}/>}
    {createBlock&&<BlockForm vehicles={vehicles} onClose={()=>setCreateBlock(false)} onSave={async dto=>{try{await unwrap(apiClient.availability.createBlock(dto));setCreateBlock(false);setNotice("Vehicle Block created.");await refresh({showLoading:false});}catch(e:any){setError(friendlyAvailabilityError(e.message,vehicles));}}}/>}
    {confirmHold&&<ConfirmHoldModal hold={confirmHold} onClose={()=>setConfirmHold(null)} onSave={async dto=>{try{await unwrap(apiClient.availability.confirmHold(dto));setConfirmHold(null);setNotice("Hold converted to confirmed allocation.");await refresh({showLoading:false});}catch(e:any){setError(friendlyAvailabilityError(e.message,vehicles));}}}/>}
    {substitute&&<SubstituteModal allocation={substitute} vehicles={vehicles} onClose={()=>setSubstitute(null)} onSave={async newVehicleId=>{try{await unwrap(apiClient.availability.substituteAllocation(substitute.id,newVehicleId));setSubstitute(null);setNotice("Vehicle substituted without changing the allocation interval.");await refresh({showLoading:false});}catch(e:any){setError(friendlyAvailabilityError(e.message,vehicles));}}}/>}
    {release&&<ReleaseModal kind={release.kind} onClose={()=>setRelease(null)} onSave={async reason=>{try{if(release.kind==="allocation")await unwrap(apiClient.availability.releaseAllocation(release.record.id,reason));else await unwrap(apiClient.availability.releaseBlock(release.record.id,reason));const releasedKind=release.kind;setRelease(null);setNotice(human(releasedKind)+" released.");await refresh({showLoading:false});}catch(e:any){setError(friendlyAvailabilityError(e.message,vehicles));}}}/>}
  </div>;
}

function TimelinePanel({vehicles,allocations,blocks,window,days,setDays,windowStart,setWindowStart,selectedVehicle,setSelectedVehicle,calendar,calendarLoading}:{vehicles:any[];allocations:any[];blocks:any[];window:{start:string;end:string};days:number;setDays:(v:number)=>void;windowStart:string;setWindowStart:(v:string)=>void;selectedVehicle:string;setSelectedVehicle:(v:string)=>void;calendar:any;calendarLoading:boolean}){
  const allEvents=[
    ...allocations.map(a=>({...a,eventType:a.status==="HELD"?"HOLD":"ALLOCATION",subType:a.allocationType,isBlocking:["HELD","CONFIRMED","ACTIVE"].includes(a.status)})),
    ...blocks.map(b=>({...b,eventType:"BLOCK",subType:b.blockType,isBlocking:["ACTIVE","SCHEDULED"].includes(b.status)})),
  ];
  const visibleVehicles=selectedVehicle?vehicles.filter(v=>v.id===selectedVehicle):vehicles;
  return <div className="space-y-5"><section className="rounded-2xl border bg-white p-4 shadow-sm"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Window start"><input type="date" value={windowStart} onChange={e=>setWindowStart(e.target.value)} className={inputClass}/></Field><Field label="Window size"><select value={days} onChange={e=>setDays(Number(e.target.value))} className={inputClass}><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></Field><Field label="Vehicle filter"><select value={selectedVehicle} onChange={e=>setSelectedVehicle(e.target.value)} className={inputClass}><option value="">All vehicles</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.registrationPlate} · {v.make} {v.model}</option>)}</select></Field><div className="flex items-end text-xs text-slate-500">{dateTime(window.start)} → {dateTime(window.end)}</div></div></section>
    <section className="rounded-2xl border bg-white shadow-sm"><div className="border-b p-5"><h3 className="font-bold">Fleet dispatch timeline</h3><p className="mt-1 text-xs text-slate-500">Every fleet vehicle is shown. Filter to one car when you need its detailed calendar. A blank row means no recorded blocking event in this window, not a final availability guarantee.</p></div>{!visibleVehicles.length?<div className="p-10 text-center text-sm text-slate-500">No fleet vehicles match this filter.</div>:<div className="divide-y">{visibleVehicles.map(v=>{const events=allEvents.filter(e=>e.vehicleId===v.id).sort((a,b)=>new Date(a.startsAt).getTime()-new Date(b.startsAt).getTime());return <div key={v.id} className="grid gap-3 p-4 lg:grid-cols-[260px_1fr]"><div><p className="font-semibold">{v.registrationPlate} · {v.make} {v.model}</p><div className="mt-1 flex flex-wrap gap-2"><Status value={v.availabilityStatus}/><span className="text-xs text-slate-400">{events.length} event{events.length===1?"":"s"}</span></div></div><div>{!events.length?<div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">No allocation, hold or vehicle block recorded in this window.</div>:<div className="space-y-2">{events.map(event=><div key={event.eventType+event.id} className="grid gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-[140px_1fr_auto] md:items-center"><div className="text-xs font-semibold">{human(event.eventType)} · {human(event.subType)}</div><div className="text-xs text-slate-600">{dateTime(event.startsAt)} → {dateTime(event.endsAt)}<p className="mt-0.5 text-slate-400">{event.reason||event.summary||"Operational reservation"}</p></div><div className="flex gap-2"><Status value={event.status}/>{event.isBlocking&&<span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">Blocking</span>}</div></div>)}</div>}</div></div>})}</div>}</section>
    {selectedVehicle&&<section className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-bold">Detailed vehicle calendar</h3>{calendarLoading?<p className="mt-3 text-sm text-slate-500">Loading calendar…</p>:!calendar?.entries?.length?<p className="mt-3 text-sm text-slate-500">No calendar entries in the selected window. Use Candidate Search or Conflict Check before committing a reservation.</p>:<div className="mt-4 space-y-2">{calendar.entries.map((entry:any)=><div key={entry.type+entry.id} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold">{entry.type} · {human(entry.subType)}</p><p className="text-xs text-slate-500">{dateTime(entry.startsAt)} → {dateTime(entry.endsAt)} · {entry.summary}</p></div><div className="flex gap-2"><Status value={entry.status}/>{entry.isBlocking&&<span className="text-xs font-semibold text-rose-700">Blocking</span>}</div></div>)}</div>}</section>}
  </div>;
}

function SearchPanel({portal,vehicles,categories,customers,onHoldCreated,onOpenBookings}:{portal:AccessPortal;vehicles:any[];categories:any[];customers:any[];onHoldCreated:()=>Promise<void>;onOpenBookings:()=>void}){
  const can=(p:string)=>permits(portal,p);
  const now=new Date();const start=new Date(now.getTime()+2*86400000);const end=new Date(now.getTime()+6*86400000);
  const [results,setResults]=useState<any[]|null>(null),[context,setContext]=useState<any>(null),[loading,setLoading]=useState(false),[error,setError]=useState(""),[holding,setHolding]=useState("");
  const seq=useRef(0);
  async function search(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const request=++seq.current;setLoading(true);setError("");setResults(null);const d=new FormData(e.currentTarget);const payload:any={pickupAt:iso(String(d.get("pickupAt"))),returnAt:iso(String(d.get("returnAt"))),turnaroundMinutes:Number(d.get("turnaroundMinutes")||0),limit:100};const category=String(d.get("vehicleCategoryId")||"");if(category)payload.vehicleCategoryId=category;const features=String(d.get("features")||"").split(",").map(x=>x.trim()).filter(Boolean);if(features.length)payload.features=features;try{const data:any=await unwrap(apiClient.availability.searchAvailableVehicles(payload));if(request!==seq.current)return;setResults(data.vehicles||[]);setContext({...payload,customerId:String(d.get("customerId")||"")||undefined});}catch(err:any){if(request===seq.current)setError(friendlyAvailabilityError(err.message,vehicles));}finally{if(request===seq.current)setLoading(false);}}
  async function hold(vehicle:any){if(!context)return;setHolding(vehicle.id);setError("");try{await unwrap(apiClient.availability.createHold({vehicleId:vehicle.id,startsAt:context.pickupAt,endsAt:context.returnAt,ttlMinutes:15,customerId:context.customerId,reason:"Held from Availability candidate search"}));await onHoldCreated();setResults(current=>current?.filter(v=>v.id!==vehicle.id)||null);}catch(e:any){setError(friendlyAvailabilityError(e.message,[vehicle]));}finally{setHolding("");}}
  useEffect(()=>()=>{seq.current++;},[portal.id]);
  return <div className="space-y-5"><form onSubmit={search} className="rounded-2xl border bg-white p-5 shadow-sm"><div><h3 className="font-bold">Candidate search</h3><p className="mt-1 text-xs text-slate-500">The server filters lifecycle, overlapping allocations, unexpired Holds and Vehicle Blocks.</p></div>{error&&<div className="mt-4"><ErrorBox text={error}/></div>}<div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Pickup *"><input required name="pickupAt" type="datetime-local" defaultValue={localInput(start)} className={inputClass}/></Field><Field label="Return *"><input required name="returnAt" type="datetime-local" defaultValue={localInput(end)} className={inputClass}/></Field><Field label="Category"><select name="vehicleCategoryId" className={inputClass}><option value="">All categories</option>{categories.map(c=><option key={c.id} value={c.code||c.name||c.id}>{c.name||c.code}</option>)}</select></Field><Field label="Turnaround buffer"><select name="turnaroundMinutes" defaultValue="60" className={inputClass}><option value="0">0 min</option><option value="30">30 min</option><option value="60">60 min</option><option value="120">120 min</option></select></Field>{can("customer.read")&&<Field label="Customer for Hold"><select name="customerId" className={inputClass}><option value="">No Customer link</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select></Field>}<Field label="Required features"><input name="features" placeholder="e.g. Bluetooth, 4WD" className={inputClass}/></Field></div><div className="mt-4 flex justify-end"><button disabled={loading} className={primary}>{loading?<Loader2 size={15} className="animate-spin"/>:<Search size={15}/>}Search server availability</button></div></form>
    {results!==null&&<section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="font-bold">{results.length} candidate{results.length===1?"":"s"}</h3><p className="text-xs text-slate-500">A candidate remains unreserved until a Hold or Allocation succeeds.</p></div></div>{!results.length?<p className="mt-5 text-sm text-slate-500">No eligible Vehicle is available for that requested interval.</p>:<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{results.map(v=><div key={v.id} className="rounded-2xl border p-4"><div className="flex justify-between gap-3"><div><p className="font-bold">{v.registrationNumber}</p><p className="text-sm text-slate-600">{v.make} {v.model} · {v.year}</p></div><Status value="AVAILABLE"/></div><div className="mt-4 grid grid-cols-2 gap-3"><Info label="Category" value={v.categoryName||v.vehicleCategoryId}/><Info label="Reference daily" value={v.dailyRate||"—"}/><Info label="Fuel" value={human(v.fuelType)}/><Info label="Transmission" value={human(v.transmission)}/></div><div className="mt-4 flex flex-wrap gap-2">{can("allocation.create")&&<button disabled={holding===v.id} onClick={()=>void hold(v)} className={primary}>{holding===v.id?<Loader2 size={14} className="animate-spin"/>:<Clock3 size={14}/>}Hold 15 min</button>}{portal.sections.some(s=>s.id==="bookings")&&<button onClick={onOpenBookings} className={secondary}>Open Bookings<ChevronRight size={14}/></button>}</div></div>)}</div>}<p className="mt-4 text-[11px] text-slate-500">Opening Bookings does not persist this candidate as a Booking yet. That handoff will be connected during Booking reconstruction.</p></section>}
  </div>;
}

function AllocationsPanel({allocations,vehicles,canCreate,canManage,onCreate,onRelease,onSubstitute}:{allocations:any[];vehicles:any[];canCreate:boolean;canManage:boolean;onCreate:()=>void;onRelease:(r:any)=>void;onSubstitute:(r:any)=>void}){
  const name=(id:string)=>{const v=vehicles.find(x=>x.id===id);return v?(v.registrationPlate+" · "+v.make+" "+v.model):id;};
  return <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold">Allocation registry</h3><p className="mt-1 text-xs text-slate-500">Committed booking, rental or operational interval claims. A temporary Hold is a separate expiring pre-reservation and is shown under Temporary Holds.</p></div>{canCreate&&<button onClick={onCreate} className={primary}><Plus size={14}/>Create allocation</button>}</div><div className="mt-5 space-y-3">{!allocations.length?<p className="text-sm text-slate-500">No allocations overlap this dispatch window.</p>:allocations.map(a=><div key={a.id} className="rounded-2xl border p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-bold">{name(a.vehicleId)}</p><p className="mt-1 text-xs text-slate-500">{human(a.allocationType)} · {a.sourceType||"No source"} {a.sourceId||""}</p></div><div className="flex flex-wrap items-center gap-2"><Status value={a.status}/>{canManage&&["HELD","CONFIRMED","ACTIVE"].includes(a.status)&&<><button onClick={()=>onSubstitute(a)} className={secondary}><ArrowRightLeft size={14}/>Substitute</button><button onClick={()=>onRelease(a)} className={danger}>Release</button></>}</div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Info label="Starts" value={dateTime(a.startsAt)}/><Info label="Ends" value={dateTime(a.endsAt)}/><Info label="Buffer" value={(a.bufferMinutes||0)+" min"}/><Info label="Version" value={"v"+a.version}/></div>{a.reason&&<p className="mt-3 text-xs text-slate-500">{a.reason}</p>}</div>)}</div></section>;
}

function HoldsPanel({holds,vehicles,customers,canCreate,onCreate,onRelease,onConfirm}:{holds:any[];vehicles:any[];customers:any[];canCreate:boolean;onCreate:()=>void;onRelease:(h:any)=>void;onConfirm:(h:any)=>void}){
  const vehicle=(id:string)=>{const v=vehicles.find(x=>x.id===id);return v?(v.registrationPlate+" · "+v.make+" "+v.model):"Vehicle";};const customer=(id?:string)=>customers.find(x=>x.id===id)?.fullName||"—";
  const ordered=[...holds].sort((a,b)=>{
    const rank=(h:any)=>h.status==="PENDING"?0:h.status==="CONFIRMED"?1:2;
    return rank(a)-rank(b)||new Date(a.expiresAt||a.startsAt).getTime()-new Date(b.expiresAt||b.startsAt).getTime();
  });
  return <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><h3 className="font-bold">Temporary Holds</h3><p className="mt-1 text-xs text-slate-500">Active holds are shown first. Pending holds block their interval and automatically stop blocking when their TTL expires.</p></div>{canCreate&&<button onClick={onCreate} className={primary}><Plus size={14}/>Create Hold</button>}</div><div className="mt-5 space-y-3">{!ordered.length?<p className="text-sm text-slate-500">No Holds overlap this dispatch window.</p>:ordered.map(h=><div key={h.id} className={"rounded-2xl border p-4 "+(h.status==="PENDING"?"border-amber-200 bg-amber-50/40":"")}><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-bold">{vehicle(h.vehicleId)}</p><p className="mt-1 text-xs text-slate-500">{h.status==="PENDING"?"Temporarily reserved until "+dateTime(h.expiresAt):human(h.status)}</p></div><div className="flex flex-wrap gap-2"><Status value={h.status}/>{canCreate&&h.status==="PENDING"&&<><button onClick={()=>onConfirm(h)} className={secondary}>Confirm reservation</button><button onClick={()=>onRelease(h)} className={danger}>Release</button></>}</div></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Info label="Rental interval" value={dateTime(h.startsAt)+" → "+dateTime(h.endsAt)}/><Info label="Hold expires" value={dateTime(h.expiresAt)}/><Info label="Customer" value={customer(h.customerId)}/><Info label="Booking draft" value={h.bookingDraftId?"Linked":"Not linked"}/></div></div>)}</div></section>;
}

function BlocksPanel({blocks,vehicles,canCreate,canManage,onCreate,onRelease}:{blocks:any[];vehicles:any[];canCreate:boolean;canManage:boolean;onCreate:()=>void;onRelease:(b:any)=>void}){
  const vehicle=(id:string)=>{const v=vehicles.find(x=>x.id===id);return v?(v.registrationPlate+" · "+v.make+" "+v.model):id;};
  return <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><h3 className="font-bold">Vehicle Blocks</h3><p className="mt-1 text-xs text-slate-500">Maintenance, accident, compliance and administrative exclusions.</p></div>{canCreate&&<button onClick={onCreate} className={primary}><Plus size={14}/>Create block</button>}</div><div className="mt-5 grid gap-3 md:grid-cols-2">{!blocks.length?<p className="text-sm text-slate-500">No blocks overlap this dispatch window.</p>:blocks.map(b=><div key={b.id} className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-bold">{vehicle(b.vehicleId)}</p><p className="text-xs text-slate-500">{human(b.blockType)}</p></div><Status value={b.status}/></div><p className="mt-3 text-sm">{b.reason}</p><p className="mt-2 text-xs text-slate-500">{dateTime(b.startsAt)} → {dateTime(b.endsAt)}</p>{b.notes&&<p className="mt-2 text-xs text-slate-400">{b.notes}</p>}{canManage&&["ACTIVE","SCHEDULED"].includes(b.status)&&<button onClick={()=>onRelease(b)} className={danger+" mt-4"}>Release block</button>}</div>)}</div></section>;
}

function CheckPanel({vehicles,categories}:{vehicles:any[];categories:any[]}){
  const now=new Date(),start=new Date(now.getTime()+86400000),end=new Date(now.getTime()+3*86400000);const [result,setResult]=useState<any>(null),[error,setError]=useState(""),[loading,setLoading]=useState(false),seq=useRef(0);
  const vehicleName=(id?:string)=>{const v=vehicles.find(x=>x.id===id);return v?`${v.registrationPlate} · ${v.make} ${v.model}`:"Fleet search";};
  async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const request=++seq.current;setLoading(true);setError("");setResult(null);const d=new FormData(e.currentTarget);const payload:any={pickupAt:iso(String(d.get("pickupAt"))),returnAt:iso(String(d.get("returnAt"))),turnaroundMinutes:Number(d.get("turnaroundMinutes")||0)};const vehicleId=String(d.get("vehicleId")||"");const category=String(d.get("vehicleCategoryId")||"");if(vehicleId)payload.vehicleId=vehicleId;if(category)payload.vehicleCategoryId=category;try{const data=await unwrap(apiClient.availability.checkAvailability(payload));if(request===seq.current)setResult(data);}catch(err:any){if(request===seq.current)setError(err.message);}finally{if(request===seq.current)setLoading(false);}}
  return <div className="grid gap-5 lg:grid-cols-2"><form onSubmit={submit} className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-bold">Check a rental window</h3><p className="mt-1 text-xs text-slate-500">Check one vehicle, a category, or the whole fleet before making a reservation.</p>{error&&<div className="mt-4"><ErrorBox text={error}/></div>}<div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Vehicle"><select name="vehicleId" className={inputClass}><option value="">Let Sage Auto find one</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.registrationPlate} · {v.make} {v.model}</option>)}</select></Field><Field label="Category"><select name="vehicleCategoryId" className={inputClass}><option value="">Any category</option>{categories.map(c=><option key={c.id} value={c.code||c.name||c.id}>{c.name||c.code}</option>)}</select></Field><Field label="Pickup *"><input required name="pickupAt" type="datetime-local" defaultValue={localInput(start)} className={inputClass}/></Field><Field label="Return *"><input required name="returnAt" type="datetime-local" defaultValue={localInput(end)} className={inputClass}/></Field><Field label="Turnaround buffer"><input name="turnaroundMinutes" type="number" min="0" defaultValue="60" className={inputClass}/></Field></div><button disabled={loading} className={primary+" mt-4"}>{loading?<Loader2 size={14} className="animate-spin"/>:<CheckCircle2 size={14}/>}Check availability</button></form><section className="rounded-2xl border bg-white p-5 shadow-sm">{!result?<div className="grid min-h-[260px] place-items-center text-center text-sm text-slate-500">Choose a time window and check availability.</div>:<div className="space-y-5"><div className={"rounded-2xl border p-5 "+(result.available?"border-emerald-200 bg-emerald-50":"border-rose-200 bg-rose-50")}><div className="flex items-center gap-3">{result.available?<CheckCircle2 className="text-emerald-700"/>:<AlertTriangle className="text-rose-700"/>}<div><p className={"font-bold "+(result.available?"text-emerald-900":"text-rose-900")}>{result.available?"Available for this trip":"Not available for this trip"}</p><p className={"mt-1 text-sm "+(result.available?"text-emerald-800":"text-rose-800")}>{result.available?"Sage Auto found capacity for the requested dates. You can continue to reservation or allocation.":result.conflictingType==="TEMPORARY_HOLD"?"This vehicle is temporarily reserved for another checkout. Try an alternative vehicle or wait for the hold to expire.":result.conflictingType==="MAINTENANCE"?"This vehicle is blocked for maintenance during part of the requested window.":result.conflictingType?"This vehicle already has a reservation or operational block during part of the requested window.":"No eligible vehicle is currently available for the complete requested window."}</p></div></div></div><div className="grid gap-3 sm:grid-cols-2"><Info label="Vehicle" value={vehicleName(result.vehicleId)}/><Info label="Requested trip" value={dateTime(result.requestedInterval?.startsAt)+" → "+dateTime(result.requestedInterval?.endsAt)}/>{result.effectiveInterval&&<Info label="Protected operating window" value={dateTime(result.effectiveInterval.startsAt)+" → "+dateTime(result.effectiveInterval.endsAt)}/>} {!result.available&&result.conflictingType&&<Info label="Reason" value={human(result.conflictingType)}/>}</div>{result.alternativeVehicleIds?.length>0&&<div><p className="text-xs font-bold text-slate-700">Available alternatives</p><div className="mt-2 flex flex-wrap gap-2">{result.alternativeVehicleIds.slice(0,8).map((id:string)=><span key={id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{vehicleName(id)}</span>)}</div></div>}</div>}</section></div>;
}

function AllocationForm({vehicles,onClose,onSave}:{vehicles:any[];onClose:()=>void;onSave:(dto:any)=>Promise<void>}){const now=new Date(),start=new Date(now.getTime()+86400000),end=new Date(now.getTime()+2*86400000);const [busy,setBusy]=useState(false),[error,setError]=useState("");async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const d=new FormData(e.currentTarget);try{await onSave({vehicleId:d.get("vehicleId"),allocationType:d.get("allocationType"),startsAt:iso(String(d.get("startsAt"))),endsAt:iso(String(d.get("endsAt"))),sourceType:String(d.get("sourceType")||"").trim()||undefined,sourceId:String(d.get("sourceId")||"").trim()||undefined,turnaroundMinutes:Number(d.get("turnaroundMinutes")||0),reason:String(d.get("reason")||"").trim()||undefined,notes:String(d.get("notes")||"").trim()||undefined});}catch(err:any){setError(err.message);}finally{setBusy(false);}}return <Modal title="Create allocation" subtitle="Creates a committed interval claim. It is not temporary and stays reserved until its interval ends or an authorized user releases it. Use Temporary Hold for a short TTL reservation." onClose={onClose}>{error&&<ErrorBox text={error}/>}<form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2"><VehicleField vehicles={vehicles}/><Field label="Allocation type"><select name="allocationType" className={inputClass}>{["BOOKING","RENTAL","MAINTENANCE","EXCLUSIVE_RESERVATION"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Starts *"><input required name="startsAt" type="datetime-local" defaultValue={localInput(start)} className={inputClass}/></Field><Field label="Ends *"><input required name="endsAt" type="datetime-local" defaultValue={localInput(end)} className={inputClass}/></Field><Field label="Related record type"><select name="sourceType" className={inputClass}><option value="">No related record</option><option value="BOOKING">Booking</option><option value="RENTAL">Rental</option><option value="MAINTENANCE_WORK_ORDER">Maintenance work order</option><option value="ADMINISTRATIVE">Administrative reservation</option></select></Field><Field label="Related booking / work-order reference"><input name="sourceId" placeholder="Optional reference" className={inputClass}/></Field><Field label="Turnaround minutes"><input name="turnaroundMinutes" type="number" min="0" defaultValue="0" className={inputClass}/></Field><Field label="Reason"><input name="reason" className={inputClass}/></Field><Field label="Notes"><textarea name="notes" className={inputClass}/></Field><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className={secondary}>Cancel</button><button disabled={busy} className={primary}>Create allocation</button></div></form></Modal>;}

function HoldForm({vehicles,customers,onClose,onSave}:{vehicles:any[];customers:any[];onClose:()=>void;onSave:(dto:any)=>Promise<void>}){const now=new Date(),start=new Date(now.getTime()+86400000),end=new Date(now.getTime()+2*86400000);const [busy,setBusy]=useState(false),[error,setError]=useState("");async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const d=new FormData(e.currentTarget);try{await onSave({vehicleId:d.get("vehicleId"),startsAt:iso(String(d.get("startsAt"))),endsAt:iso(String(d.get("endsAt"))),ttlMinutes:Number(d.get("ttlMinutes")||15),customerId:d.get("customerId")||undefined,bookingDraftId:String(d.get("bookingDraftId")||"").trim()||undefined,reason:String(d.get("reason")||"").trim()||undefined});}catch(err:any){setError(err.message);}finally{setBusy(false);}}return <Modal title="Create temporary Hold" subtitle="The server issues the Hold ID, token and expiry." onClose={onClose}>{error&&<ErrorBox text={error}/>}<form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2"><VehicleField vehicles={vehicles}/><Field label="TTL minutes"><input name="ttlMinutes" type="number" min="1" defaultValue="15" className={inputClass}/></Field><Field label="Starts *"><input required name="startsAt" type="datetime-local" defaultValue={localInput(start)} className={inputClass}/></Field><Field label="Ends *"><input required name="endsAt" type="datetime-local" defaultValue={localInput(end)} className={inputClass}/></Field>{customers.length>0&&<Field label="Customer"><select name="customerId" className={inputClass}><option value="">No Customer link</option>{customers.map(c=><option key={c.id} value={c.id}>{c.fullName}</option>)}</select></Field>}<Field label="Existing Booking draft ID"><input name="bookingDraftId" placeholder="Optional canonical reference" className={inputClass}/></Field><Field label="Reason"><input name="reason" className={inputClass}/></Field><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className={secondary}>Cancel</button><button disabled={busy} className={primary}>Create Hold</button></div></form></Modal>;}

function BlockForm({vehicles,onClose,onSave}:{vehicles:any[];onClose:()=>void;onSave:(dto:any)=>Promise<void>}){const now=new Date(),start=new Date(now.getTime()+3600000),end=new Date(now.getTime()+86400000);const [busy,setBusy]=useState(false),[error,setError]=useState("");async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const d=new FormData(e.currentTarget);try{await onSave({vehicleId:d.get("vehicleId"),blockType:d.get("blockType"),startsAt:iso(String(d.get("startsAt"))),endsAt:iso(String(d.get("endsAt"))),reason:String(d.get("reason")||"").trim(),notes:String(d.get("notes")||"").trim()||undefined});}catch(err:any){setError(err.message);}finally{setBusy(false);}}return <Modal title="Create Vehicle Block" subtitle="Creates a blocking record plus its backing allocation." onClose={onClose}>{error&&<ErrorBox text={error}/>}<form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2"><VehicleField vehicles={vehicles}/><Field label="Block type"><select name="blockType" className={inputClass}>{["MAINTENANCE","ACCIDENT","IMPOUND","COMPLIANCE","OPERATIONAL","PRIVATE_USE","CLEANING","ADMINISTRATIVE"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Starts *"><input required name="startsAt" type="datetime-local" defaultValue={localInput(start)} className={inputClass}/></Field><Field label="Ends *"><input required name="endsAt" type="datetime-local" defaultValue={localInput(end)} className={inputClass}/></Field><Field label="Reason *"><input required name="reason" className={inputClass}/></Field><Field label="Notes"><textarea name="notes" className={inputClass}/></Field><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={onClose} className={secondary}>Cancel</button><button disabled={busy} className={primary}>Create block</button></div></form></Modal>;}

function VehicleField({vehicles}:{vehicles:any[]}){return vehicles.length?<Field label="Vehicle *"><select required name="vehicleId" className={inputClass}><option value="">Choose Vehicle</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.registrationPlate} · {v.make} {v.model}</option>)}</select></Field>:<Field label="Vehicle ID *"><input required name="vehicleId" placeholder="Canonical Vehicle ID" className={inputClass}/></Field>;}

function ConfirmHoldModal({hold,onClose,onSave}:{hold:any;onClose:()=>void;onSave:(dto:any)=>Promise<void>}){const [busy,setBusy]=useState(false),[error,setError]=useState("");async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const d=new FormData(e.currentTarget);try{await onSave({holdToken:hold.holdToken,sourceType:String(d.get("sourceType")||"").trim(),sourceId:String(d.get("sourceId")||"").trim(),reason:String(d.get("reason")||"").trim()||undefined});}catch(err:any){setError(err.message);}finally{setBusy(false);}}return <Modal title="Confirm temporary Hold" subtitle="Link this hold to the real booking or operational record it belongs to." onClose={onClose}>{error&&<ErrorBox text={error}/>}<form onSubmit={submit} className="mt-4 grid gap-3"><Field label="Source type *"><input required name="sourceType" defaultValue="BOOKING" className={inputClass}/></Field><Field label="Linked booking / work reference *"><input required name="sourceId" placeholder="Use the existing booking or work-order reference" className={inputClass}/></Field><Field label="Reason"><input name="reason" className={inputClass}/></Field><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondary}>Cancel</button><button disabled={busy} className={primary}>Confirm Hold</button></div></form></Modal>;}

function SubstituteModal({allocation,vehicles,onClose,onSave}:{allocation:any;vehicles:any[];onClose:()=>void;onSave:(id:string)=>Promise<void>}){const [busy,setBusy]=useState(false),[error,setError]=useState("");async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const d=new FormData(e.currentTarget);try{await onSave(String(d.get("vehicleId")));}catch(err:any){setError(err.message);}finally{setBusy(false);}}return <Modal title="Substitute allocated Vehicle" subtitle="The server allocates the replacement for the same interval before releasing the original." onClose={onClose}>{error&&<ErrorBox text={error}/>}<form onSubmit={submit} className="mt-4 grid gap-3"><Field label="Replacement Vehicle *"><select required name="vehicleId" className={inputClass}><option value="">Choose replacement</option>{vehicles.filter(v=>v.id!==allocation.vehicleId).map(v=><option key={v.id} value={v.id}>{v.registrationPlate} · {v.make} {v.model}</option>)}</select></Field><p className="text-xs text-slate-500">Interval: {dateTime(allocation.startsAt)} → {dateTime(allocation.endsAt)}</p><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondary}>Cancel</button><button disabled={busy} className={primary}><ArrowRightLeft size={14}/>Substitute</button></div></form></Modal>;}

function ReleaseModal({kind,onClose,onSave}:{kind:"allocation"|"block";onClose:()=>void;onSave:(reason:string)=>Promise<void>}){const [busy,setBusy]=useState(false),[error,setError]=useState("");async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const d=new FormData(e.currentTarget);try{await onSave(String(d.get("reason")||"").trim());}catch(err:any){setError(err.message);}finally{setBusy(false);}}return <Modal title={"Release "+human(kind)} subtitle="Release retains history; it does not delete the record." onClose={onClose}>{error&&<ErrorBox text={error}/>}<form onSubmit={submit} className="mt-4 grid gap-3"><Field label="Reason *"><textarea required name="reason" className={inputClass}/></Field><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondary}>Cancel</button><button disabled={busy} className={danger}>Release</button></div></form></Modal>;}
