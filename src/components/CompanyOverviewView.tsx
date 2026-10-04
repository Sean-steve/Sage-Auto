import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, CalendarCheck2, CarFront, CheckCircle2, CircleDollarSign,
  Clock3, RefreshCw, ShieldCheck, Sparkles, TrendingUp, WalletCards
} from "lucide-react";
import { apiClient } from "../lib/api-client";
import type { AccessPortal } from "../lib/access-context";

const activeRentalStates=new Set(["ACTIVE_ON_ROAD","OVERDUE","RETURN_SCHEDULED","VEHICLE_RECEIVED","RETURN_INSPECTION_PENDING","INSPECTION","DAMAGE_ASSESSMENT","FINAL_CALCULATION","FINAL_SETTLEMENT_PENDING","DEPOSIT_PROCESSING"]);
const money=(value:any,currency="KES")=>new Intl.NumberFormat("en-KE",{style:"currency",currency,maximumFractionDigits:0}).format(Number(value||0));
const human=(value:any)=>String(value||"—").replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

export function CompanyOverviewView({portal}:{portal:AccessPortal}) {
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [state,setState]=useState<any>({
    fleetTotal:0,available:0,bookingsTotal:0,activeRentals:0,overdue:0,
    collected:0,receivables:0,currency:"KES",bookings:[],rentals:[]
  });
  const can=(p:string)=>portal.permissions.includes("*")||portal.permissions.includes(p);
  const hasSection=(id:string)=>portal.sections.some(s=>s.id===id);

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const jobs:any[]=[
        apiClient.fleet.listVehicles({page:1,limit:1}),
        apiClient.fleet.listVehicles({availabilityStatus:"AVAILABLE",page:1,limit:1}),
        apiClient.bookings.listBookings({page:1,limit:8}),
        apiClient.rentals.listRentals({limit:100}),
        can("finance.read")||can("invoice.read")?apiClient.finance.getSummary():Promise.resolve({data:null}),
      ];
      const [fleet,available,bookings,rentals,finance]=await Promise.all(jobs);
      const firstError=[fleet,available,bookings,rentals,finance].find((r:any)=>r?.error)?.error;
      if(firstError) throw new Error(firstError.message||"The command center could not be loaded.");
      const bookingRows=Array.isArray(bookings.data)?bookings.data:[];
      const rentalRows=Array.isArray(rentals.data)?rentals.data:[];
      const financeData=finance.data||{};
      setState({
        fleetTotal:fleet.meta?.total??(Array.isArray(fleet.data)?fleet.data.length:0),
        available:available.meta?.total??(Array.isArray(available.data)?available.data.length:0),
        bookingsTotal:bookings.meta?.total??bookingRows.length,
        activeRentals:rentalRows.filter((r:any)=>activeRentalStates.has(r.state)).length,
        overdue:rentalRows.filter((r:any)=>r.state==="OVERDUE").length,
        collected:Number(financeData.totalCollected||0),
        receivables:Number(financeData.totalReceivables||financeData.outstandingAmount||0),
        currency:financeData.currency||"KES",
        bookings:bookingRows.slice(0,5),
        rentals:rentalRows.filter((r:any)=>activeRentalStates.has(r.state)).slice(0,5),
      });
    } catch(e:any){setError(e.message||"Unable to load company command center.");}
    finally{setLoading(false);}
  },[portal.id,portal.permissions.join("|")]);

  useEffect(()=>{void load();},[load]);

  const attention=useMemo(()=>[
    ...(state.overdue?[{tone:"rose",title:`${state.overdue} overdue rental${state.overdue===1?"":"s"}`,detail:"Open Rentals to coordinate return and escalation.",section:"rentals"}]:[]),
    ...(state.receivables>0?[{tone:"amber",title:`${money(state.receivables,state.currency)} outstanding`,detail:"Receivables require collection or reconciliation.",section:"finance"}]:[]),
    ...(state.available===0&&state.fleetTotal>0?[{tone:"amber",title:"No vehicles currently available",detail:"Review Availability, maintenance holds and allocations.",section:"availability"}]:[]),
  ],[state]);

  const go=(id:string)=>{if(hasSection(id)) window.dispatchEvent(new CustomEvent("sage:navigate",{detail:{section:id}}));};

  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-3xl">
          <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-emerald-700"><Sparkles size={13}/>Operational command center</div>
          <h1 className="text-2xl font-black tracking-[-0.03em] text-slate-950 sm:text-3xl">What needs your attention today?</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Live fleet, booking, rental and finance signals with direct routes into the authoritative workflow.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw size={15} className={loading?"animate-spin":""}/>Refresh</button>
          {hasSection("bookings")&&<button onClick={()=>go("bookings")} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800">Open bookings<ArrowRight size={15}/></button>}
        </div>
      </div>
    </section>

    {error&&<div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertTriangle size={18}/><div><strong>Some live signals could not be loaded.</strong><p className="mt-1">{error}</p></div></div>}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        {label:"Fleet",value:state.fleetTotal,sub:`${state.available} available now`,icon:CarFront,section:"fleet"},
        {label:"Bookings",value:state.bookingsTotal,sub:"Reservation dossiers",icon:CalendarCheck2,section:"bookings"},
        {label:"Active rentals",value:state.activeRentals,sub:state.overdue?`${state.overdue} overdue`:"No overdue rentals",icon:Clock3,section:"rentals"},
        {label:"Collected",value:money(state.collected,state.currency),sub:`${money(state.receivables,state.currency)} receivable`,icon:CircleDollarSign,section:"finance"},
      ].map(item=>{const Icon=item.icon;return <button key={item.label} onClick={()=>go(item.section)} disabled={!hasSection(item.section)} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50/60 disabled:cursor-default">
        <div className="flex items-start justify-between"><span className="text-slate-400 group-hover:text-emerald-700"><Icon size={19}/></span><ArrowRight size={16} className="text-slate-300 group-hover:text-emerald-600"/></div>
        <div className="mt-5 text-2xl font-black tracking-tight text-slate-950">{loading?"—":item.value}</div>
        <div className="mt-1 text-sm font-semibold text-slate-600">{item.label}</div>
        <div className="mt-1 text-xs text-slate-400">{item.sub}</div>
      </button>})}
    </section>

    <div className="grid gap-6 xl:grid-cols-[1.35fr_.9fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-600">Reservations</p><h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Recent bookings</h2></div>{hasSection("bookings")&&<button onClick={()=>go("bookings")} className="text-sm font-bold text-emerald-700">View all</button>}</div>
        <div className="mt-5 divide-y divide-slate-100">
          {loading?<div className="py-10 text-sm text-slate-400">Loading live bookings…</div>:!state.bookings.length?<div className="py-10 text-sm text-slate-400">No booking records yet.</div>:state.bookings.map((b:any)=><button key={b.id} onClick={()=>go("bookings")} className="grid w-full gap-2 py-4 text-left sm:grid-cols-[1.1fr_1fr_auto] sm:items-center">
            <div><div className="font-mono text-xs font-bold text-slate-900">{b.bookingNumber||b.id}</div><div className="mt-1 text-xs text-slate-500">{b.customerName||b.customerId||"Customer"}</div></div>
            <div className="text-xs text-slate-500">{b.pickupAt?new Date(b.pickupAt).toLocaleString():"Pickup pending"}</div>
            <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">{human(b.status)}</span>
          </button>)}
        </div>
      </section>

      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-600"/><h2 className="text-lg font-black text-slate-950">Needs attention</h2></div>
          <div className="mt-4 space-y-3">
            {!attention.length?<div className="flex gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={18}/><div><strong>Operations look clear.</strong><p className="mt-1 text-xs text-emerald-700">No overdue rentals or visible finance exceptions in the current snapshot.</p></div></div>:attention.map((a:any)=><button key={a.title} onClick={()=>go(a.section)} className="w-full rounded-xl border border-slate-200 p-4 text-left hover:border-amber-300"><div className="font-bold text-slate-900">{a.title}</div><div className="mt-1 text-xs leading-5 text-slate-500">{a.detail}</div></button>)}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-slate-400">Quick routes</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[["availability","Availability",TrendingUp],["returns","Returns",CheckCircle2],["finance","Finance",WalletCards],["settlements","Settlements",CircleDollarSign]].filter(([id])=>hasSection(String(id))).map(([id,label,Icon]:any)=><button key={id} onClick={()=>go(id)} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-left text-xs font-bold text-slate-700 hover:bg-slate-100"><Icon size={15}/>{label}</button>)}
          </div>
        </section>
      </div>
    </div>
  </div>;
}
