import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight, Banknote, BookOpenCheck, Building2, CalendarRange, CarFront, ChevronLeft,
  ClipboardCheck, Gauge, Globe2, LayoutDashboard, LogOut, Menu, ReceiptText, Settings2,
  Tags, UsersRound, WalletCards, Wrench, Sun, Moon, ChevronRight
} from "lucide-react";
import { AppProvider, useApp } from "../lib/store";
import { WorkspaceSearch } from "./WorkspaceSearch";
import { WorkspaceAccountMenu } from "./WorkspaceAccountMenu";
import { WorkspaceSetupGuide } from "./WorkspaceSetupGuide";
import type { WorkspaceSearchItem } from "../lib/workspace-search";
import type { AccessContext, AccessPortal } from "../lib/access-context";
import { FleetExperienceView } from "./FleetExperienceView";
import { CustomersDriversExperienceView } from "./CustomersDriversExperienceView";
import { PricingExperienceView } from "./PricingExperienceView";
import { AvailabilityExperienceView } from "./AvailabilityExperienceView";
import { BookingExperienceView } from "./BookingExperienceView";
import { ContractHandoverExperienceView } from "./ContractHandoverExperienceView";
import { CompanyOverviewView } from "./CompanyOverviewView";
import { TeamWorkspaceView } from "./TeamWorkspaceView";
import { InspectionModal } from "./modals/InspectionModal";
import { MaintenanceWorkOrderModal } from "./modals/MaintenanceWorkOrderModal";
import { NewWorkOrderModal } from "./modals/NewWorkOrderModal";
import { NewScheduleModal } from "./modals/NewScheduleModal";
import { NewProviderModal } from "./modals/NewProviderModal";
import { NewOwnerModal } from "./modals/NewOwnerModal";

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
  compliance:ShieldCheck,owners:Building2,pricing:Tags,finance:WalletCards,settlements:Banknote,website:Globe2,team:UsersRound,settings:Settings2
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
  team:"Membership, roles, invitations and record-scoped access",
  settings:"Company configuration and governance"
};
const groupDefs=[
  {label:"Command",ids:["overview"]},
  {label:"Operations",ids:["bookings","handover","availability","rentals","returns"]},
  {label:"Fleet & people",ids:["fleet","customers","inspections","maintenance","compliance","owners"]},
  {label:"Commercial",ids:["pricing","finance","settlements"]},
  {label:"Workspace",ids:["website","team","settings"]},
];

function WorkspaceScreen({section,portal,focusedRecord}:{section:string;portal:AccessPortal;focusedRecord:WorkspaceSearchItem|null}) {
  const focusRecordId=focusedRecord?.section===section?focusedRecord.id:undefined;
  const {workspaceLoading,workspaceError}=useApp();
  if(section==="overview") return <div className="sage-module"><CompanyOverviewView portal={portal}/></div>;
  if(section==="fleet") return <div className="sage-module"><FleetExperienceView portal={portal} focusRecordId={focusRecordId}/></div>;
  if(section==="customers") return <div className="sage-module"><CustomersDriversExperienceView portal={portal} focusRecordId={focusRecordId} focusKind={focusedRecord?.kind}/></div>;
  if(section==="pricing") return <div className="sage-module"><PricingExperienceView portal={portal}/></div>;
  if(section==="availability") return <div className="sage-module"><AvailabilityExperienceView portal={portal}/></div>;
  if(section==="bookings") return <div className="sage-module"><BookingExperienceView portal={portal} focusRecordId={focusRecordId}/></div>;
  if(section==="handover") return <div className="sage-module"><ContractHandoverExperienceView portal={portal}/></div>;
  if(section==="team") return <div className="sage-module"><TeamWorkspaceView portal={portal}/></div>;
  const views:Record<string,React.ElementType>={
    rentals:RentalsView,returns:ReturnFinalCalculationView,inspections:InspectionsView,maintenance:MaintenanceView,
    compliance:ComplianceView,owners:VehicleOwnersView,finance:FinanceView,settlements:SettlementsView,
    website:PublicWebsiteView,settings:WorkspaceSettingsView
  };
  const View=views[section];
  if(!View)return <div className="p-8 text-sm text-slate-500">This workspace section is not available for this role.</div>;
  return <div className="sage-module">
    {workspaceError&&<div role="alert" className="m-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:m-6">{workspaceError}</div>}
    {workspaceLoading&&["inspections","maintenance","compliance","owners","settings"].includes(section)&&<div className="px-6 pt-5 text-xs font-semibold text-slate-400">Syncing workspace records…</div>}
    <Suspense fallback={<div className="grid min-h-[50vh] place-items-center p-8"><div className="w-full max-w-4xl space-y-4"><div className="sage-skeleton h-7 w-48">Loading</div><div className="grid gap-3 sm:grid-cols-3"><div className="sage-skeleton h-24">Loading</div><div className="sage-skeleton h-24">Loading</div><div className="sage-skeleton h-24">Loading</div></div><div className="sage-skeleton h-72">Loading</div></div></div>}>{section==="rentals"?<RentalsView focusRecordId={focusRecordId}/>:section==="finance"?<FinanceView focusRecordId={focusRecordId} focusKind={focusedRecord?.kind}/>:section==="settings"?<><div className="mx-auto max-w-[1500px] px-4 pt-6 sm:px-6"><WorkspaceSetupGuide portal={portal} mode="settings"/></div><View/></>:<View/>}</Suspense>
  </div>;
}

function Shell({context,portal,section,onSection,onSwitch,onSignOut}:{context:AccessContext;portal:AccessPortal;section:string;onSection:(s:string)=>void;onSwitch:()=>void;onSignOut:()=>void}) {
  const [mobileOpen,setMobileOpen]=useState(false);
  const [focusedRecord,setFocusedRecord]=useState<WorkspaceSearchItem|null>(null);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>localStorage.getItem("sage_sidebar_collapsed")==="1");
  const [theme,setTheme]=useState<"light"|"dark">(()=>{
    const saved=localStorage.getItem("sage_theme");
    if(saved==="dark"||saved==="light")return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches?"dark":"light";
  });
  const permitted=new Set(portal.sections.map(s=>s.id));
  const groups=useMemo(()=>groupDefs.map(group=>({...group,ids:group.ids.filter(id=>permitted.has(id))})).filter(group=>group.ids.length),[portal.id,portal.sections.map(s=>s.id).join("|")]);

  useEffect(()=>{localStorage.setItem("sage_sidebar_collapsed",sidebarCollapsed?"1":"0");},[sidebarCollapsed]);
  useEffect(()=>{localStorage.setItem("sage_theme",theme);},[theme]);
  useEffect(()=>{if(focusedRecord&&focusedRecord.section!==section)setFocusedRecord(null);},[section,focusedRecord]);

  useEffect(()=>{
    const handler=(event:Event)=>{
      const detail=(event as CustomEvent).detail;
      const id=detail?.section;
      if(!id||!permitted.has(id))return;
      const record=detail?.record as Partial<WorkspaceSearchItem>|undefined;
      const allowedKinds:Record<string,string>={VEHICLE:"fleet",CUSTOMER:"customers",DRIVER:"customers",BOOKING:"bookings",RENTAL:"rentals",INVOICE:"finance",PAYMENT:"finance"};
      if(record?.kind&&allowedKinds[record.kind]===id&&typeof record.id==="string"&&record.id.length<160){
        setFocusedRecord({kind:record.kind,id:record.id,section:id,title:String(record.title||""),subtitle:String(record.subtitle||"")});
      }else setFocusedRecord(null);
      onSection(id);
    };
    window.addEventListener("sage:navigate",handler);return()=>window.removeEventListener("sage:navigate",handler);
  },[portal.id,portal.sections.map(s=>s.id).join("|")]);

  const select=(id:string)=>{setFocusedRecord(null);onSection(id);setMobileOpen(false);};
  const openSearchResult=(result:WorkspaceSearchItem)=>{
    if(!portal.sections.some(item=>item.id===result.section))return;
    setFocusedRecord(result.kind==="MODULE"?null:result);
    onSection(result.section);
    setMobileOpen(false);
  };
  const roles=portal.roles.map(r=>r.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())).join(" · ");
  const title=portal.sections.find(s=>s.id===section)?.label||section;
  const Sidebar=()=> <aside className="sage-sidebar flex h-full flex-col text-white">
    <div className={`border-b border-white/10 ${sidebarCollapsed?"px-3 py-4":"px-5 py-5"}`}>
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400 font-black text-slate-950">S</span>{!sidebarCollapsed&&<div className="min-w-0"><div className="text-sm font-black tracking-tight">Sage Auto</div><div className="truncate text-[11px] text-slate-400">{portal.name}</div></div>}</div>
      {!sidebarCollapsed&&<div className="mt-4 rounded-xl border border-white/10 bg-white/[.04] p-3"><div className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-300">Workspace</div><div className="mt-1 truncate text-xs font-semibold text-slate-200">{roles}</div></div>}
    </div>
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Company workspace navigation">
      {groups.map(group=><div key={group.label} className="mb-5">{!sidebarCollapsed&&<div className="px-3 pb-2 text-[9px] font-black uppercase tracking-[.2em] text-slate-500">{group.label}</div>}<div className="space-y-1">{group.ids.map(id=>{const item=portal.sections.find(s=>s.id===id)!;const Icon=icons[id]||ReceiptText;const active=id===section;return <button title={sidebarCollapsed?item.label:undefined} key={id} onClick={()=>select(id)} aria-current={active?"page":undefined} className={`sage-nav-item flex w-full items-center ${sidebarCollapsed?"justify-center px-2":"gap-3 px-3"} py-2.5 text-left text-xs font-semibold transition ${active?"text-slate-950":"text-slate-300"}`}><Icon size={16}/>{!sidebarCollapsed&&<span className="min-w-0 truncate">{item.label}</span>}</button>})}</div></div>)}
    </nav>
    <div className="border-t border-white/10 p-3">
      <button title={sidebarCollapsed?"Expand sidebar":"Collapse sidebar"} onClick={()=>setSidebarCollapsed(v=>!v)} className={`hidden w-full items-center ${sidebarCollapsed?"justify-center":"gap-3"} rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/[.06] lg:flex`}>{sidebarCollapsed?<ChevronRight size={16}/>:<ChevronLeft size={16}/>} {!sidebarCollapsed&&"Collapse sidebar"}</button>
      <button title={sidebarCollapsed?"Switch workspace":undefined} onClick={onSwitch} className={`flex w-full items-center ${sidebarCollapsed?"justify-center":"gap-3"} rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/[.06]`}><ChevronLeft size={16}/>{!sidebarCollapsed&&"Switch workspace"}</button>
      <button title={sidebarCollapsed?"Sign out":undefined} onClick={onSignOut} className={`mt-1 flex w-full items-center ${sidebarCollapsed?"justify-center":"gap-3"} rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-300 hover:bg-rose-500/10 hover:text-rose-200`}><LogOut size={16}/>{!sidebarCollapsed&&"Sign out"}</button>
    </div>
  </aside>;

  return <div className="saas-workspace min-h-dvh text-slate-900" data-density="comfortable" data-theme={theme}>
    <div className={`fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 lg:block ${sidebarCollapsed?"w-[76px]":"w-[272px]"}`}><Sidebar/></div>
    {mobileOpen&&<div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Close navigation" className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={()=>setMobileOpen(false)}/><div className="relative h-full w-[86vw] max-w-[310px] shadow-2xl"><Sidebar/></div></div>}
    <div className={`min-w-0 transition-[padding] duration-200 ${sidebarCollapsed?"lg:pl-[76px]":"lg:pl-[272px]"}`}>
      <header className="sage-topbar sticky top-0 z-30 flex items-center gap-3 border-b bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:gap-5 lg:px-8">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <button onClick={()=>setMobileOpen(true)} aria-label="Open navigation" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 lg:hidden"><Menu size={18}/></button>
          <div className="min-w-0"><div className="max-w-[170px] truncate text-[11px] font-bold uppercase tracking-[.16em] text-slate-400 xl:max-w-[235px]">{portal.name}</div><div className="truncate text-base font-black tracking-tight text-slate-950">{title}</div></div>
        </div>
        <div className="flex min-w-0 flex-1 justify-center">
          <WorkspaceSearch key={portal.id+portal.permissions.join("|")} portal={portal} descriptions={descriptions} onSelect={openSearchResult}/>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button title={theme==="dark"?"Use light mode":"Use dark mode"} aria-label={theme==="dark"?"Use light mode":"Use dark mode"} onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">{theme==="dark"?<Sun size={15}/>:<Moon size={15}/>}</button>
          {context.user.emailVerified&&<span className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 xl:inline-flex">Email verified</span>}
          <WorkspaceAccountMenu context={context} portal={portal} onSection={select} onSwitch={onSwitch} onSignOut={onSignOut}/>
        </div>
      </header>
      {section!=="overview"&&<div className="sage-page-context border-b bg-white px-4 sm:px-6 lg:px-8"><div className="mx-auto max-w-[1500px]"><div className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-600">Company workspace</div><div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-black tracking-[-.025em] text-slate-950">{title}</h1><p className="mt-1 text-sm text-slate-500">{descriptions[section]||"Operational workspace"}</p></div></div></div></div>}
      <main className="min-w-0 overflow-x-hidden"><WorkspaceScreen key={section} section={section} portal={portal} focusedRecord={focusedRecord}/></main>

    </div>
  </div>;
}

export function RestoredWorkspace(props:{context:AccessContext;portal:AccessPortal;section:string;onSection:(s:string)=>void;onSwitch:()=>void;onSignOut:()=>void}) {
  if(!props.portal.sections.some(s=>s.id===props.section))return <p role="alert" className="p-6">This section is not permitted.</p>;
  return <AppProvider access={{context:props.context,portal:props.portal,section:props.section,onSection:props.onSection}}>
    <Shell {...props}/>
    <InspectionModal/>
    <MaintenanceWorkOrderModal/>
    <NewWorkOrderModal/>
    <NewScheduleModal/>
    <NewProviderModal/>
    <NewOwnerModal/>
  </AppProvider>;
}
