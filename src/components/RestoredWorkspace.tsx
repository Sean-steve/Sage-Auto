import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight, Banknote, BookOpenCheck, Building2, CalendarRange, CarFront, ChevronLeft,
  ClipboardCheck, Gauge, Globe2, LayoutDashboard, LogOut, Menu, ReceiptText, Settings2,
  ShieldCheck, Tags, UsersRound, WalletCards, Wrench, X
} from "lucide-react";
import { AppProvider, useApp } from "../lib/store";
import type { AccessContext, AccessPortal } from "../lib/access-context";
import { FleetExperienceView } from "./FleetExperienceView";
import { CustomersDriversExperienceView } from "./CustomersDriversExperienceView";
import { PricingExperienceView } from "./PricingExperienceView";
import { AvailabilityExperienceView } from "./AvailabilityExperienceView";
import { BookingExperienceView } from "./BookingExperienceView";
import { ContractHandoverExperienceView } from "./ContractHandoverExperienceView";
import { CompanyOverviewView } from "./CompanyOverviewView";

const RentalsView=lazy(()=>import("./RentalsView").then(m=>({default:m.RentalsView})));
const ReturnFinalCalculationView=lazy(()=>import("./ReturnFinalCalculationView").then(m=>({default:m.ReturnFinalCalculationView})));
const InspectionsView=lazy(()=>import("./InspectionsView").then(m=>({default:m.InspectionsView})));
const MaintenanceView=lazy(()=>import("./MaintenanceView").then(m=>({default:m.MaintenanceView})));
const ComplianceView=lazy(()=>import("./ComplianceView").then(m=>({default:m.ComplianceView})));
const VehicleOwnersView=lazy(()=>import("./VehicleOwnersView").then(m=>({default:m.VehicleOwnersView})));
const FinanceView=lazy(()=>import("./FinanceView").then(m=>({default:m.FinanceView})));
const SettlementsView=lazy(()=>import("./SettlementsView").then(m=>({default:m.SettlementsView})));
const PublicWebsiteView=lazy(()=>import("./PublicWebsiteView").then(m=>({default:m.PublicWebsiteView})));
const WorkspaceSettingsView=lazy(()=>import("./WorkspaceSettingsView").then(m=>({default:m.WorkspaceSettingsView})));

const icons:Record<string,React.ElementType>={
  overview:LayoutDashboard,fleet:CarFront,bookings:BookOpenCheck,handover:ClipboardCheck,availability:CalendarRange,
  customers:UsersRound,rentals:Gauge,returns:ArrowLeftRight,inspections:ClipboardCheck,maintenance:Wrench,
  compliance:ShieldCheck,owners:Building2,pricing:Tags,finance:WalletCards,settlements:Banknote,website:Globe2,settings:Settings2
};
const descriptions:Record<string,string>={
  overview:"Live operational command center",
  fleet:"Vehicles, ownership, availability and asset truth",
  bookings:"Reservation lifecycle, pricing snapshots and confirmation",
  handover:"Contracts, driver readiness, inspection and key release",
  availability:"Allocations, holds, blocks and fleet calendar",
  customers:"Customers, drivers and corporate relationships",
  rentals:"Active on-road rental operations",
  returns:"Vehicle receipt, inspection and final calculation",
  inspections:"Condition evidence and damage records",
  maintenance:"Service work, schedules and vehicle downtime",
  compliance:"Regulatory documents and operational readiness",
  owners:"Vehicle ownership agreements and revenue-share context",
  pricing:"Rate plans, rules, fees and promotions",
  finance:"Invoices, payments, deposits, expenses and reconciliation",
  settlements:"Owner earnings, approvals and provider payouts",
  website:"Public storefront and online-booking content",
  settings:"Company configuration and governance"
};
const groupDefs=[
  {label:"Command",ids:["overview"]},
  {label:"Operations",ids:["bookings","handover","availability","rentals","returns"]},
  {label:"Fleet & people",ids:["fleet","customers","inspections","maintenance","compliance","owners"]},
  {label:"Commercial",ids:["pricing","finance","settlements"]},
  {label:"Workspace",ids:["website","settings"]},
];

function WorkspaceScreen({section,portal}:{section:string;portal:AccessPortal}) {
  const {workspaceLoading,workspaceError}=useApp();
  if(section==="overview") return <CompanyOverviewView portal={portal}/>;
  if(section==="fleet") return <FleetExperienceView portal={portal}/>;
  if(section==="customers") return <CustomersDriversExperienceView portal={portal}/>;
  if(section==="pricing") return <PricingExperienceView portal={portal}/>;
  if(section==="availability") return <AvailabilityExperienceView portal={portal}/>;
  if(section==="bookings") return <BookingExperienceView portal={portal}/>;
  if(section==="handover") return <ContractHandoverExperienceView portal={portal}/>;
  const views:Record<string,React.ElementType>={
    rentals:RentalsView,returns:ReturnFinalCalculationView,inspections:InspectionsView,maintenance:MaintenanceView,
    compliance:ComplianceView,owners:VehicleOwnersView,finance:FinanceView,settlements:SettlementsView,
    website:PublicWebsiteView,settings:WorkspaceSettingsView
  };
  const View=views[section];
  if(!View)return <div className="p-8 text-sm text-slate-500">This workspace section is not available for this role.</div>;
  return <>
    {workspaceError&&<div role="alert" className="m-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:m-6">{workspaceError}</div>}
    {workspaceLoading&&["inspections","maintenance","compliance","owners","settings"].includes(section)&&<div className="px-6 pt-5 text-xs font-semibold text-slate-400">Syncing workspace records…</div>}
    <Suspense fallback={<div className="grid min-h-[50vh] place-items-center text-sm font-semibold text-slate-400">Opening {section}…</div>}><View/></Suspense>
  </>;
}

function Shell({context,portal,section,onSection,onSwitch,onSignOut}:{context:AccessContext;portal:AccessPortal;section:string;onSection:(s:string)=>void;onSwitch:()=>void;onSignOut:()=>void}) {
  const [mobileOpen,setMobileOpen]=useState(false);
  const permitted=new Set(portal.sections.map(s=>s.id));
  const groups=useMemo(()=>groupDefs.map(group=>({...group,ids:group.ids.filter(id=>permitted.has(id))})).filter(group=>group.ids.length),[portal.id,portal.sections.map(s=>s.id).join("|")]);

  useEffect(()=>{
    const handler=(event:Event)=>{const id=(event as CustomEvent).detail?.section;if(id&&permitted.has(id))onSection(id);};
    window.addEventListener("sage:navigate",handler);return()=>window.removeEventListener("sage:navigate",handler);
  },[portal.id,portal.sections.map(s=>s.id).join("|")]);

  const select=(id:string)=>{onSection(id);setMobileOpen(false);};
  const roles=portal.roles.map(r=>r.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())).join(" · ");
  const title=portal.sections.find(s=>s.id===section)?.label||section;
  const Sidebar=()=> <aside className="flex h-full flex-col bg-[#0a1220] text-white">
    <div className="border-b border-white/10 px-5 py-5">
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400 font-black text-slate-950">S</span><div className="min-w-0"><div className="text-sm font-black tracking-tight">Sage Auto</div><div className="truncate text-[11px] text-slate-400">{portal.name}</div></div></div>
      <div className="mt-4 rounded-xl border border-white/10 bg-white/[.04] p-3"><div className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-300">Workspace</div><div className="mt-1 truncate text-xs font-semibold text-slate-200">{roles}</div></div>
    </div>
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Company workspace navigation">
      {groups.map(group=><div key={group.label} className="mb-5"><div className="px-3 pb-2 text-[9px] font-black uppercase tracking-[.2em] text-slate-500">{group.label}</div><div className="space-y-1">{group.ids.map(id=>{const item=portal.sections.find(s=>s.id===id)!;const Icon=icons[id]||ReceiptText;const active=id===section;return <button key={id} onClick={()=>select(id)} aria-current={active?"page":undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${active?"bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-950/20":"text-slate-300 hover:bg-white/[.06] hover:text-white"}`}><Icon size={16}/><span className="min-w-0 truncate">{item.label}</span></button>})}</div></div>)}
    </nav>
    <div className="border-t border-white/10 p-3">
      <button onClick={onSwitch} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/[.06]"><ChevronLeft size={16}/>Switch workspace</button>
      <button onClick={onSignOut} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-rose-500/10 hover:text-rose-200"><LogOut size={16}/>Sign out</button>
    </div>
  </aside>;

  return <div className="saas-workspace min-h-dvh bg-[#f5f7fb] text-slate-900">
    <div className="fixed inset-y-0 left-0 z-40 hidden w-[272px] lg:block"><Sidebar/></div>
    {mobileOpen&&<div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Close navigation" className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={()=>setMobileOpen(false)}/><div className="relative h-full w-[86vw] max-w-[310px] shadow-2xl"><Sidebar/></div></div>}
    <div className="min-w-0 lg:pl-[272px]">
      <header className="sticky top-0 z-30 flex min-h-[72px] items-center justify-between gap-4 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3"><button onClick={()=>setMobileOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 lg:hidden"><Menu size={18}/></button><div className="min-w-0"><div className="truncate text-[11px] font-bold uppercase tracking-[.16em] text-slate-400">{portal.name}</div><div className="truncate text-base font-black tracking-tight text-slate-950">{title}</div></div></div>
        <div className="flex items-center gap-2"><span className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 sm:flex"><ShieldCheck size={13}/>Verified account</span><div className="grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-xs font-black text-white">{context.user.fullName.split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase()}</div></div>
      </header>
      {section!=="overview"&&<div className="border-b border-slate-200/70 bg-white px-4 py-4 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1500px]"><div className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-600">Company workspace</div><div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-black tracking-[-.025em] text-slate-950">{title}</h1><p className="mt-1 text-sm text-slate-500">{descriptions[section]||"Operational workspace"}</p></div></div></div></div>}
      <main className="min-w-0 overflow-x-hidden"><WorkspaceScreen key={section} section={section} portal={portal}/></main>
    </div>
  </div>;
}

export function RestoredWorkspace(props:{context:AccessContext;portal:AccessPortal;section:string;onSection:(s:string)=>void;onSwitch:()=>void;onSignOut:()=>void}) {
  if(!props.portal.sections.some(s=>s.id===props.section))return <p role="alert" className="p-6">This section is not permitted.</p>;
  return <AppProvider access={{context:props.context,portal:props.portal,section:props.section,onSection:props.onSection}}><Shell {...props}/></AppProvider>;
}
