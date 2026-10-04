import React,{useEffect,useMemo,useState} from "react";
import {Car,CheckCircle2,CreditCard,FileSpreadsheet,Mail,Percent,Phone,Plus,WalletCards,X} from "lucide-react";
import {useApp} from "../lib/store";
import {apiClient} from "../lib/api-client";

const input="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500";
function money(n:any,c="KES"){return `${c} ${Number(n||0).toLocaleString()}`;}
function date(v?:string){if(!v)return "—";const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleDateString():"—";}
function human(v?:string){return String(v||"").replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());}

export const VehicleOwnersView:React.FC=()=>{
  const {restoration,vehicleOwners,vehicleOwnerships,vehicles,activeTenant,activeTenantId,setIsNewOwnerOpen,setSelectedOwnerId,setCurrentView,showNotification}=useApp();
  const [ownerships,setOwnerships]=useState<any[]>(vehicleOwnerships);
  const [liveOwners,setLiveOwners]=useState<any[]>([]);
  const [liveVehicles,setLiveVehicles]=useState<any[]>([]);
  const [managingOwnerId,setManagingOwnerId]=useState<string|null>(null);

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      const [ownerResponse,vehicleResponse]=await Promise.all([
        apiClient.vehicleOwners.listOwners(),
        apiClient.fleet.listVehicles({limit:1000}),
      ]);
      if(cancelled)return;
      const ownerRows=!ownerResponse.error?(ownerResponse.data as any[]||[]):vehicleOwners.filter(o=>o.tenantId===activeTenantId);
      const vehicleRows=!vehicleResponse.error?(vehicleResponse.data as any[]||[]):vehicles.filter(v=>v.tenantId===activeTenantId);
      setLiveOwners(ownerRows);setLiveVehicles(vehicleRows);
      const histories=await Promise.all(vehicleRows.filter((v:any)=>v.ownerId).map(async(v:any)=>{
        const response=await apiClient.vehicleOwners.getOwnershipHistory(v.id);
        return response.error?[]:(response.data as any[]||[]);
      }));
      if(!cancelled)setOwnerships(histories.flat().length?histories.flat():vehicleOwnerships);
    })().catch(()=>{if(!cancelled){setLiveOwners(vehicleOwners.filter(o=>o.tenantId===activeTenantId));setLiveVehicles(vehicles.filter(v=>v.tenantId===activeTenantId));setOwnerships(vehicleOwnerships);}});
    return()=>{cancelled=true;};
  },[activeTenantId,vehicleOwners.length,vehicles.length]);

  const tenantVehicles=(liveVehicles.length?liveVehicles:vehicles.filter(v=>v.tenantId===activeTenantId));
  const rawOwners=(liveOwners.length?liveOwners:vehicleOwners.filter(o=>o.tenantId===activeTenantId));
  const tenantOwners=useMemo(()=>{
    const groups=new Map<string,any>();
    for(const owner of rawOwners){
      const key=(owner.email||"").trim().toLowerCase()||String(owner.phone||"").replace(/[^0-9]/g,"")||owner.id;
      const existing=groups.get(key);
      if(!existing)groups.set(key,{...owner,_aliasIds:[owner.id]});
      else existing._aliasIds.push(owner.id);
    }
    return [...groups.values()];
  },[rawOwners]);
  const aliasIds=(owner:any)=>owner._aliasIds||[owner.id];
  const activeForOwner=(owner:any)=>ownerships.filter((o:any)=>aliasIds(owner).includes(o.ownerId)&&o.isActive);

  return <div id="vehicle-owners-view" className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-600">Owner economics</p><h1 className="mt-1 text-2xl font-black text-slate-950">Vehicle Owners & Revenue Agreements</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Every owner sees the active commercial terms for each attached vehicle. Revenue share is vehicle-agreement specific—there is no hidden global “default” percentage that silently overrides a vehicle contract.</p></div><button disabled={restoration} onClick={()=>setIsNewOwnerOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"><Plus size={16}/>Add Vehicle Owner</button></header>

    <section className="grid gap-3 sm:grid-cols-3"><Metric label="Registered owners" value={tenantOwners.length}/><Metric label="Active agreements" value={ownerships.filter((o:any)=>o.tenantId===activeTenantId&&o.isActive).length}/><Metric label="Partner vehicles" value={tenantVehicles.filter(v=>Boolean(v.ownerId)).length}/></section>

    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{tenantOwners.map(owner=>{
      const ownedVehicles=tenantVehicles.filter(v=>aliasIds(owner).includes(v.ownerId));
      const agreements=activeForOwner(owner);
      const primary=agreements[0];
      return <article key={owner.id} className="flex flex-col justify-between rounded-3xl border bg-white p-5 shadow-sm">
        <div>
          <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-sm font-black text-emerald-700">{owner.name.slice(0,2).toUpperCase()}</div><div className="min-w-0"><h2 className="truncate font-black text-slate-950">{owner.name}</h2><p className="truncate text-xs text-slate-500">{owner.companyName||human(owner.ownerType)||"Vehicle owner"}</p></div></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">{owner.status}</span></div>
          <div className="mt-4 space-y-2 text-xs text-slate-600"><Contact icon={<Mail size={14}/>} value={owner.email}/><Contact icon={<Phone size={14}/>} value={owner.phone}/>{owner.payoutBank&&<Contact icon={<CreditCard size={14}/>} value={`${owner.payoutBank} · ${owner.payoutAccountNumber||"Account on file"}`}/>}</div>

          <div className="mt-5 rounded-2xl bg-slate-950 p-4 text-white"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.15em] text-slate-400">Current owner agreement</p><p className="mt-1 text-lg font-black">{primary?`${Number(primary.revenueSharePercent||0).toLocaleString()}% owner share`:"No revenue-share agreement"}</p></div><Percent size={20} className="text-emerald-300"/></div><p className="mt-3 text-xs leading-5 text-slate-300">{primary?.termsSnapshot||"This owner has no active external revenue agreement. Attach a vehicle agreement to define owner economics."}</p>{primary&&<div className="mt-3 flex flex-wrap gap-2 text-[10px]"><span className="rounded-full bg-white/10 px-2 py-1">Deductions {primary.allowableExpenseDeductions?"allowed":"not allowed"}</span>{primary.fixedMonthlyPayout!=null&&<span className="rounded-full bg-white/10 px-2 py-1">Fixed {money(primary.fixedMonthlyPayout,activeTenant.currency||"KES")}</span>}</div>}</div>

          <div className="mt-5"><div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">Attached vehicles</p><span className="text-xs font-black">{ownedVehicles.length}</span></div><div className="mt-2 space-y-2">{ownedVehicles.length?ownedVehicles.map(v=>{const a=agreements.find((x:any)=>x.vehicleId===v.id);return <div key={v.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"><div><p className="font-mono text-xs font-black">{v.registrationPlate}</p><p className="text-[10px] text-slate-500">{v.make} {v.model}</p></div><span className="text-xs font-black text-emerald-700">{a?`${a.revenueSharePercent}%`:"No terms"}</span></div>}):<p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">No vehicles are currently attached to this owner.</p>}</div></div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-2 border-t pt-4"><button disabled={restoration} onClick={()=>{setSelectedOwnerId(owner.id);setCurrentView("settlements");}} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700"><FileSpreadsheet size={14}/>Statements</button><button disabled={restoration||!ownedVehicles.length} onClick={()=>setManagingOwnerId(owner.id)} className="rounded-xl border px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Manage Terms</button></div>
      </article>;
    })}</div>

    {!tenantOwners.length&&<div className="rounded-3xl border border-dashed bg-white p-12 text-center"><WalletCards className="mx-auto text-slate-300"/><h2 className="mt-3 font-black">No vehicle owners registered</h2><p className="mt-1 text-sm text-slate-500">Add an owner when a vehicle is investor-owned, leased, managed or under a revenue-share agreement.</p></div>}

    {managingOwnerId&&<TermsModal owner={tenantOwners.find(o=>o.id===managingOwnerId)} vehicles={tenantVehicles.filter(v=>aliasIds(tenantOwners.find(o=>o.id===managingOwnerId)||{id:managingOwnerId}).includes(v.ownerId))} ownerships={ownerships} currency={activeTenant.currency||"KES"} onClose={()=>setManagingOwnerId(null)} onSaved={(agreement:any)=>{setOwnerships(prev=>[agreement,...prev.map((o:any)=>o.vehicleId===agreement.vehicleId&&o.id!==agreement.id?{...o,isActive:false}:o)]);showNotification("Owner agreement terms updated.");}}/>}
  </div>;
};

function TermsModal({owner,vehicles,ownerships,currency,onClose,onSaved}:{owner:any;vehicles:any[];ownerships:any[];currency:string;onClose:()=>void;onSaved:(a:any)=>void}){
  const [vehicleId,setVehicleId]=useState(vehicles[0]?.id||""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const current=useMemo(()=>ownerships.find((o:any)=>o.vehicleId===vehicleId&&o.isActive),[ownerships,vehicleId]);
  const [share,setShare]=useState(""),[fixed,setFixed]=useState(""),[deductions,setDeductions]=useState(true),[effective,setEffective]=useState(""),[terms,setTerms]=useState(""),[notes,setNotes]=useState("");
  useEffect(()=>{setShare(String(current?.revenueSharePercent??""));setFixed(current?.fixedMonthlyPayout!=null?String(current.fixedMonthlyPayout):"");setDeductions(current?.allowableExpenseDeductions??true);setEffective(new Date().toISOString().slice(0,10));setTerms(current?.termsSnapshot||"");setNotes(current?.notes||"");setError("");},[vehicleId,current?.id]);

  async function submit(e:React.FormEvent){e.preventDefault();if(!current)return;setBusy(true);setError("");try{const response=await apiClient.vehicleOwners.renegotiateTerms({vehicleId,revenueSharePercent:Number(share),fixedMonthlyPayout:fixed?Number(fixed):undefined,allowableExpenseDeductions:deductions,effectiveDate:effective?new Date(effective+"T00:00:00").toISOString():undefined,termsSnapshot:terms.trim()||undefined,notes:notes.trim()||undefined});if(response.error)throw new Error(response.error.message);onSaved(response.data);onClose();}catch(e:any){setError(e.message||"Agreement could not be updated.");}finally{setBusy(false);}}

  return <div className="fixed inset-0 z-50 bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="mx-auto flex h-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><header className="flex items-start justify-between border-b p-5 sm:p-6"><div><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-600">Commercial agreement</p><h2 className="mt-1 text-xl font-black">Manage terms · {owner?.name}</h2><p className="mt-1 text-sm text-slate-500">Terms are versioned by creating a new effective agreement; the previous vehicle agreement remains in history.</p></div><button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100"><X size={18}/></button></header><div className="flex-1 overflow-y-auto p-5 sm:p-6">
      {error&&<div role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      <form onSubmit={submit} className="grid gap-5">
        <label className="text-sm font-bold">Vehicle agreement<select value={vehicleId} onChange={e=>setVehicleId(e.target.value)} className={input}>{vehicles.map(v=><option key={v.id} value={v.id}>{v.registrationPlate} · {v.make} {v.model}</option>)}</select></label>
        {current?<><section className="grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-4"><Info label="Current owner share" value={`${current.revenueSharePercent}%`}/><Info label="Fixed payout" value={current.fixedMonthlyPayout!=null?money(current.fixedMonthlyPayout,currency):"None"}/><Info label="Deductions" value={current.allowableExpenseDeductions?"Allowed":"Not allowed"}/><Info label="Effective since" value={date(current.startDate)}/></section><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Owner revenue share %<input required min="0" max="100" step="0.01" type="number" value={share} onChange={e=>setShare(e.target.value)} className={input}/></label><label className="text-sm font-bold">Fixed monthly payout ({currency})<input min="0" step="0.01" type="number" value={fixed} onChange={e=>setFixed(e.target.value)} className={input}/></label><label className="text-sm font-bold">New terms effective from<input type="date" value={effective} onChange={e=>setEffective(e.target.value)} className={input}/></label><label className="flex items-center gap-3 self-end rounded-xl border p-3 text-sm font-bold"><input type="checkbox" checked={deductions} onChange={e=>setDeductions(e.target.checked)} className="h-4 w-4"/>Allow operating-expense deductions before owner payout</label></div><label className="text-sm font-bold">Owner-visible agreement terms<textarea required rows={5} value={terms} onChange={e=>setTerms(e.target.value)} placeholder="Describe the revenue split, deductible expenses, payout timing and any special commercial terms." className={input}/><span className="mt-1 block text-xs font-normal text-slate-400">This is the human-readable agreement summary shown with the vehicle’s active revenue terms.</span></label><label className="text-sm font-bold">Internal notes<textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} className={input}/></label><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl border px-4 py-2.5 text-sm font-bold">Cancel</button><button disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white"><CheckCircle2 size={15}/>{busy?"Saving…":"Save new agreement version"}</button></div></>:<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">This vehicle has no active ownership agreement to renegotiate. Assign its first ownership agreement from the vehicle’s Fleet → Ownership tab.</div>}
      </form>
    </div></div></div>;
}
function Metric({label,value}:{label:string;value:number}){return <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>;}
function Contact({icon,value}:{icon:React.ReactNode;value?:string}){return <div className="flex items-center gap-2">{icon}<span className="truncate">{value||"—"}</span></div>;}
function Info({label,value}:{label:string;value:string}){return <div><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-bold text-slate-800">{value}</p></div>;}
