import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, BadgeCheck, CalendarClock, Car, CheckCircle2, ChevronRight,
  ClipboardCheck, FileSignature, FileText, KeyRound, Loader2, PenLine, Plus,
  RefreshCw, Search, Send, ShieldCheck, UserRound, X
} from "lucide-react";
import { apiClient, type ApiResponse } from "../lib/api-client";
import { permits, type AccessPortal } from "../lib/access-context";
import { useApp } from "../lib/store";

type Props={portal:AccessPortal};
type WorkspaceTab="contracts"|"handovers";
type ContractAction="send"|"sign"|"amend";
type HandoverAction="arrive"|"documents"|"inspection"|"signature"|"keys"|"complete";

const inputClass="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400";
const primary="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";
const secondary="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const danger="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50";

async function unwrap<T>(response:ApiResponse<T>|Promise<ApiResponse<T>>):Promise<T>{
  const resolved=await response;
  if(resolved.error)throw new Error(resolved.error.message);
  return resolved.data as T;
}
function human(value?:string|null){return value?value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase()):"—";}
function dateTime(value?:string|null){if(!value)return "—";const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString():"—";}
function localInput(value?:string|null){if(!value)return "";const d=new Date(value);if(!Number.isFinite(d.getTime()))return "";const p=(n:number)=>String(n).padStart(2,"0");return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+"T"+p(d.getHours())+":"+p(d.getMinutes());}
function iso(value:string){return new Date(value).toISOString();}
function money(value:any,currency="KES"){const n=Number(value);if(!Number.isFinite(n))return "—";try{return new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:2}).format(n);}catch{return currency+" "+n.toLocaleString();}}
function statusClass(value?:string){
  if(["SIGNED","ACTIVE","COMPLETED","HANDOVER_COMPLETED"].includes(value||""))return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if(["GENERATED","SENT","SCHEDULED","CUSTOMER_ARRIVED","DOCUMENT_VERIFIED","PRE_RENTAL_INSPECTION","SIGNATURE","KEY_HANDOVER"].includes(value||""))return "border-amber-200 bg-amber-50 text-amber-700";
  if(["ARCHIVED"].includes(value||""))return "border-slate-300 bg-slate-100 text-slate-600";
  return "border-slate-200 bg-slate-100 text-slate-600";
}
function Status({value}:{value?:string}){return <span className={"inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide "+statusClass(value)}>{human(value)}</span>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="grid gap-1 text-xs font-semibold text-slate-600"><span>{label}</span>{children}</label>;}
function Info({label,value}:{label:string;value:any}){return <div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-medium text-slate-800">{value===null||value===undefined||value===""?"—":String(value)}</p></div>;}
function ErrorBox({text}:{text:string}){return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{text}</div>;}
function Notice({text}:{text:string}){return <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{text}</div>;}
function Modal({title,subtitle,onClose,children,max="max-w-5xl"}:{title:string;subtitle?:string;onClose:()=>void;children:React.ReactNode;max?:string}){return <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true"><div className={"ml-auto flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:rounded-3xl "+max}><header className="flex items-start justify-between border-b p-5 sm:p-6"><div><h2 className="text-xl font-bold">{title}</h2>{subtitle&&<p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div><button onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-slate-100"><X size={19}/></button></header><div className="flex-1 overflow-y-auto p-5 sm:p-6">{children}</div></div></div>;}

export function ContractHandoverExperienceView({portal}:Props){
  const {navigateSection}=useApp();
  const can=(p:string)=>permits(portal,p);
  const [tab,setTab]=useState<WorkspaceTab>("contracts");
  const [contracts,setContracts]=useState<any[]>([]);
  const [handovers,setHandovers]=useState<any[]>([]);
  const [bookings,setBookings]=useState<any[]>([]);
  const [customers,setCustomers]=useState<any[]>([]);
  const [drivers,setDrivers]=useState<any[]>([]);
  const [vehicles,setVehicles]=useState<any[]>([]);
  const [inspections,setInspections]=useState<any[]>([]);
  const [contractStatus,setContractStatus]=useState("ALL");
  const [handoverStatus,setHandoverStatus]=useState("ALL");
  const [searchInput,setSearchInput]=useState("");
  const [search,setSearch]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [selectedContractId,setSelectedContractId]=useState("");
  const [selectedHandoverId,setSelectedHandoverId]=useState("");
  const [contractDetail,setContractDetail]=useState<any>(null);
  const [handoverDetail,setHandoverDetail]=useState<any>(null);
  const [rentalReadiness,setRentalReadiness]=useState<any>(null);
  const [generateOpen,setGenerateOpen]=useState(false);
  const [scheduleOpen,setScheduleOpen]=useState(false);
  const [contractAction,setContractAction]=useState<ContractAction|null>(null);
  const [handoverAction,setHandoverAction]=useState<HandoverAction|null>(null);
  const seq=useRef(0);

  async function loadSupporting(){
    const request=++seq.current;
    const tasks:Promise<any>[]=[
      can("booking.read")?apiClient.bookings.listBookings({limit:100,sortBy:"createdAt",sortOrder:"desc"}):Promise.resolve({data:[]}),
      can("customer.read")?apiClient.customers.listCustomers({limit:100}):Promise.resolve({data:[]}),
      can("driver.read")?apiClient.drivers.listDrivers({limit:100}):Promise.resolve({data:[]}),
      can("vehicle.read")?apiClient.fleet.listVehicles({limit:100}):Promise.resolve({data:[]}),
      can("inspection.read")?apiClient.inspections.listInspections({inspectionType:"PRE_RENTAL",status:"COMPLETED",limit:100}):Promise.resolve({data:[]}),
    ];
    const r=await Promise.all(tasks);
    if(request!==seq.current)return;
    setBookings(r[0].error?[]:r[0].data||[]);
    setCustomers(r[1].error?[]:r[1].data||[]);
    setDrivers(r[2].error?[]:r[2].data||[]);
    setVehicles(r[3].error?[]:r[3].data||[]);
    setInspections(r[4].error?[]:r[4].data||[]);
  }

  async function loadContracts(){
    const request=++seq.current;setLoading(true);setError("");
    try{
      const params:any={limit:100};
      if(contractStatus!=="ALL")params.status=contractStatus;
      if(search)params.search=search;
      const res=await apiClient.contracts.listContracts(params);
      if(request!==seq.current)return;
      if(res.error)throw new Error(res.error.message);
      setContracts(res.data||[]);
    }catch(e:any){if(request===seq.current)setError(e.message||"Unable to load Contracts.");}
    finally{if(request===seq.current)setLoading(false);}
  }

  async function loadHandovers(){
    const request=++seq.current;setLoading(true);setError("");
    try{
      const params:any={limit:100};
      if(handoverStatus!=="ALL")params.status=handoverStatus;
      if(search)params.search=search;
      const res=await apiClient.handovers.listHandovers(params);
      if(request!==seq.current)return;
      if(res.error)throw new Error(res.error.message);
      setHandovers(res.data||[]);
    }catch(e:any){if(request===seq.current)setError(e.message||"Unable to load Handovers.");}
    finally{if(request===seq.current)setLoading(false);}
  }

  async function loadContractDetail(id:string){
    if(!id){setContractDetail(null);return;}
    const request=++seq.current;setError("");
    try{const data:any=await unwrap(apiClient.contracts.getContract(id));if(request!==seq.current)return;setContractDetail(data);}
    catch(e:any){if(request===seq.current)setError(e.message||"Unable to load Contract.");}
  }

  async function loadHandoverDetail(id:string){
    if(!id){setHandoverDetail(null);setRentalReadiness(null);return;}
    const request=++seq.current;setError("");setRentalReadiness(null);
    try{
      const data:any=await unwrap(apiClient.handovers.getHandover(id));
      if(request!==seq.current)return;
      setHandoverDetail(data);
      if(can("rental.read")){
        const rr=await apiClient.rentals.getReadiness(data.bookingId);
        if(request===seq.current&&!rr.error)setRentalReadiness(rr.data);
      }
    }catch(e:any){if(request===seq.current)setError(e.message||"Unable to load Handover.");}
  }

  useEffect(()=>{void loadSupporting();void loadContracts();void loadHandovers();return()=>{seq.current++;};},[portal.id]);
  useEffect(()=>{if(tab==="contracts")void loadContracts();else void loadHandovers();},[tab,contractStatus,handoverStatus,search]);
  useEffect(()=>{setSelectedContractId("");setSelectedHandoverId("");setContractDetail(null);setHandoverDetail(null);setRentalReadiness(null);setGenerateOpen(false);setScheduleOpen(false);setContractAction(null);setHandoverAction(null);},[portal.id]);

  async function refreshAll(){
    await Promise.all([loadSupporting(),loadContracts(),loadHandovers()]);
    if(selectedContractId)await loadContractDetail(selectedContractId);
    if(selectedHandoverId)await loadHandoverDetail(selectedHandoverId);
  }

  const bookingName=(id?:string|null)=>{const b=bookings.find(x=>x.id===id);return b?b.bookingNumber:(id||"—");};
  const customerName=(id?:string|null)=>{const c=customers.find(x=>x.id===id);return c?.fullName||id||"—";};
  const driverName=(id?:string|null)=>{const d=drivers.find(x=>x.id===id);return d?.fullName||id||"—";};
  const vehicleName=(id?:string|null)=>{const v=vehicles.find(x=>x.id===id);return v?(v.registrationPlate+" · "+v.make+" "+v.model):(id||"—");};

  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Legal & physical dispatch gate</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Contract & Handover</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">Turn a confirmed Booking into signed legal evidence, complete the physical dispatch checkpoints, then hand the verified record to Rental Operations.</p></div><div className="flex flex-wrap gap-2"><button onClick={()=>void refreshAll()} className={secondary}><RefreshCw size={16}/>Refresh</button>{can("contract.generate")&&<button onClick={()=>setGenerateOpen(true)} className={primary}><FileText size={16}/>Generate Contract</button>}{can("rental.start")&&<button onClick={()=>setScheduleOpen(true)} className={secondary}><CalendarClock size={16}/>Schedule Handover</button>}</div></header>
    {error&&<ErrorBox text={error}/>}
    {notice&&<Notice text={notice}/>}
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Contracts" value={contracts.length}/><Metric label="Signed" value={contracts.filter(x=>x.status==="SIGNED").length}/><Metric label="Active handovers" value={handovers.filter(x=>x.status!=="HANDOVER_COMPLETED").length}/><Metric label="Completed handovers" value={handovers.filter(x=>x.status==="HANDOVER_COMPLETED").length}/></section>

    <div className="overflow-x-auto"><div className="inline-flex min-w-max rounded-xl border bg-white p-1 shadow-sm"><button onClick={()=>setTab("contracts")} className={"rounded-lg px-4 py-2 text-sm font-semibold "+(tab==="contracts"?"bg-slate-950 text-white":"text-slate-600")}>Contracts</button><button onClick={()=>setTab("handovers")} className={"rounded-lg px-4 py-2 text-sm font-semibold "+(tab==="handovers"?"bg-slate-950 text-white":"text-slate-600")}>Handovers</button></div></div>

    <section className="rounded-2xl border bg-white p-4 shadow-sm"><form onSubmit={e=>{e.preventDefault();setSearch(searchInput.trim());}} className="grid gap-3 md:grid-cols-[1fr_220px_auto]"><Field label="Search"><div className="relative"><Search size={15} className="absolute left-3 top-3 text-slate-400"/><input value={searchInput} onChange={e=>setSearchInput(e.target.value)} placeholder={tab==="contracts"?"Contract number, customer, Vehicle…":"Handover number or notes…"} className={inputClass+" pl-9"}/></div></Field>{tab==="contracts"?<Field label="Contract status"><select value={contractStatus} onChange={e=>setContractStatus(e.target.value)} className={inputClass}><option>ALL</option>{["DRAFT","GENERATED","SENT","SIGNED","ACTIVE","COMPLETED","ARCHIVED"].map(x=><option key={x}>{x}</option>)}</select></Field>:<Field label="Handover status"><select value={handoverStatus} onChange={e=>setHandoverStatus(e.target.value)} className={inputClass}><option>ALL</option>{["SCHEDULED","CUSTOMER_ARRIVED","DOCUMENT_VERIFIED","PRE_RENTAL_INSPECTION","SIGNATURE","KEY_HANDOVER","HANDOVER_COMPLETED"].map(x=><option key={x}>{x}</option>)}</select></Field>}<div className="flex items-end"><button className={secondary+" w-full"}>Apply search</button></div></form></section>

    {loading?<div className="grid place-items-center rounded-2xl border bg-white p-20 text-slate-500"><Loader2 className="mb-3 animate-spin"/>Loading {tab}…</div>:tab==="contracts"?<ContractRegister contracts={contracts} bookingName={bookingName} customerName={customerName} vehicleName={vehicleName} onOpen={id=>{setSelectedContractId(id);void loadContractDetail(id);}}/>:<HandoverRegister handovers={handovers} bookingName={bookingName} customerName={customerName} vehicleName={vehicleName} onOpen={id=>{setSelectedHandoverId(id);void loadHandoverDetail(id);}}/>}

    {selectedContractId&&contractDetail&&<Modal title={contractDetail.contractNumber} subtitle={"Contract dossier · version "+contractDetail.contractVersion+" · aggregate v"+contractDetail.version} onClose={()=>{setSelectedContractId("");setContractDetail(null);}} max="max-w-6xl"><ContractDossier contract={contractDetail} bookingName={bookingName} customerName={customerName} driverName={driverName} vehicleName={vehicleName} portal={portal} onAction={setContractAction} onSchedule={()=>{setScheduleOpen(true);}}/></Modal>}
    {selectedHandoverId&&handoverDetail&&<Modal title={handoverDetail.handoverNumber} subtitle={"Physical dispatch dossier · aggregate v"+handoverDetail.version} onClose={()=>{setSelectedHandoverId("");setHandoverDetail(null);setRentalReadiness(null);}} max="max-w-6xl"><HandoverDossier handover={handoverDetail} contract={contracts.find(c=>c.id===handoverDetail.contractId)} bookingName={bookingName} customerName={customerName} driverName={driverName} vehicleName={vehicleName} readiness={rentalReadiness} portal={portal} onAction={setHandoverAction} onOpenRental={()=>navigateSection("rentals")} onOpenInspection={()=>navigateSection("inspections")}/></Modal>}

    {generateOpen&&<GenerateContractModal bookings={bookings} contracts={contracts} onClose={()=>setGenerateOpen(false)} onDone={async contract=>{setGenerateOpen(false);setNotice("Contract "+contract.contractNumber+" generated from the confirmed Booking.");await loadContracts();setSelectedContractId(contract.id);await loadContractDetail(contract.id);}}/>}
    {scheduleOpen&&<ScheduleHandoverModal bookings={bookings} contracts={contracts} handovers={handovers} onClose={()=>setScheduleOpen(false)} onDone={async h=>{setScheduleOpen(false);setNotice("Handover "+h.handoverNumber+" scheduled.");setTab("handovers");await loadHandovers();setSelectedHandoverId(h.id);await loadHandoverDetail(h.id);}}/>}
    {contractAction&&contractDetail&&<ContractActionModal action={contractAction} contract={contractDetail} onClose={()=>setContractAction(null)} onDone={async msg=>{setContractAction(null);setNotice(msg);await loadContracts();await loadContractDetail(contractDetail.id);}}/>}
    {handoverAction&&handoverDetail&&<HandoverActionModal action={handoverAction} handover={handoverDetail} inspections={inspections.filter(i=>i.bookingId===handoverDetail.bookingId&&i.vehicleId===handoverDetail.vehicleId&&i.inspectionType==="PRE_RENTAL"&&i.status==="COMPLETED")} onClose={()=>setHandoverAction(null)} onDone={async msg=>{setHandoverAction(null);setNotice(msg);await loadHandovers();await loadHandoverDetail(handoverDetail.id);}}/>}
  </div>;
}

function Metric({label,value}:{label:string;value:any}){return <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>;}

function ContractRegister({contracts,bookingName,customerName,vehicleName,onOpen}:{contracts:any[];bookingName:(id?:string)=>string;customerName:(id?:string)=>string;vehicleName:(id?:string)=>string;onOpen:(id:string)=>void}){
  if(!contracts.length)return <div className="rounded-2xl border border-dashed bg-white p-14 text-center text-sm text-slate-500">No Contracts match the current server filters.</div>;
  return <div className="grid gap-3">{contracts.map(c=><button key={c.id} onClick={()=>onOpen(c.id)} className="grid w-full gap-4 rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-bold">{c.contractNumber}</span><Status value={c.status}/><span className="text-[10px] font-semibold text-slate-400">Contract v{c.contractVersion}</span></div><p className="mt-2 text-sm font-semibold text-slate-700">{customerName(c.customerId)}</p><p className="text-xs text-slate-500">{vehicleName(c.vehicleId)}</p></div><div><Info label="Booking" value={bookingName(c.bookingId)}/><Info label="Template" value={c.templateVersion}/></div><div><Info label="Generated" value={dateTime(c.generatedAt||c.createdAt)}/><Info label="Signed" value={dateTime(c.signedAt)}/></div><ChevronRight className="hidden text-slate-300 md:block"/></button>)}</div>;
}

function HandoverRegister({handovers,bookingName,customerName,vehicleName,onOpen}:{handovers:any[];bookingName:(id?:string)=>string;customerName:(id?:string)=>string;vehicleName:(id?:string)=>string;onOpen:(id:string)=>void}){
  if(!handovers.length)return <div className="rounded-2xl border border-dashed bg-white p-14 text-center text-sm text-slate-500">No Handovers match the current server filters.</div>;
  return <div className="grid gap-3">{handovers.map(h=><button key={h.id} onClick={()=>onOpen(h.id)} className="grid w-full gap-4 rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-emerald-300 hover:shadow-md md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-bold">{h.handoverNumber}</span><Status value={h.status}/></div><p className="mt-2 text-sm font-semibold text-slate-700">{customerName(h.customerId)}</p><p className="text-xs text-slate-500">{vehicleName(h.vehicleId)}</p></div><div><Info label="Booking" value={bookingName(h.bookingId)}/><Info label="Scheduled" value={dateTime(h.scheduledAt)}/></div><div><Info label="Odometer" value={(h.checkoutOdometer??0)+" km"}/><Info label="Fuel" value={(h.checkoutFuelLevel??0)+"%"}/></div><ChevronRight className="hidden text-slate-300 md:block"/></button>)}</div>;
}

function ContractDossier({contract,bookingName,customerName,driverName,vehicleName,portal,onAction,onSchedule}:{contract:any;bookingName:(id?:string)=>string;customerName:(id?:string)=>string;driverName:(id?:string)=>string;vehicleName:(id?:string)=>string;portal:AccessPortal;onAction:(a:ContractAction)=>void;onSchedule:()=>void}){
  const can=(p:string)=>permits(portal,p);
  const terms=contract.termsSnapshot||{};
  const pricing=contract.pricingSnapshot||{};
  const currentSignature=(contract.signatures||[]).some((s:any)=>s.contractVersion===contract.contractVersion);
  const mutable=!["ACTIVE","COMPLETED","ARCHIVED"].includes(contract.status);
  return <div className="space-y-5">
    <div className="flex flex-col gap-3 rounded-2xl bg-slate-950 p-5 text-white lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-lg font-bold">{contract.contractNumber}</span><Status value={contract.status}/><span className="text-xs text-slate-400">Legal version {contract.contractVersion}</span></div><p className="mt-2 text-sm text-slate-300">{customerName(contract.customerId)} · {vehicleName(contract.vehicleId)}</p></div><div className="text-left lg:text-right"><p className="text-xs text-slate-400">Agreed gross total</p><p className="text-2xl font-bold">{money(terms.grossTotal,terms.currency||pricing.currency||"KES")}</p><p className="text-xs text-slate-400">Template {contract.templateVersion}</p></div></div>

    <section className="grid gap-4 rounded-2xl border p-5 sm:grid-cols-2 lg:grid-cols-4"><Info label="Booking" value={bookingName(contract.bookingId)}/><Info label="Customer" value={customerName(contract.customerId)}/><Info label="Primary Driver" value={driverName(contract.primaryDriverId)}/><Info label="Vehicle" value={vehicleName(contract.vehicleId)}/><Info label="Generated" value={dateTime(contract.generatedAt||contract.createdAt)}/><Info label="Sent" value={dateTime(contract.sentAt)}/><Info label="Signed" value={dateTime(contract.signedAt)}/><Info label="Current signature" value={currentSignature?"Recorded":"Missing"}/></section>

    <section className="rounded-2xl border p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><h3 className="font-bold">Contract commands</h3><p className="mt-1 text-xs text-slate-500">Dispatch is recorded as an intent/event; external delivery is not claimed without provider evidence.</p></div><div className="flex flex-wrap gap-2">{can("contract.generate")&&["GENERATED","SENT","SIGNED"].includes(contract.status)&&<button onClick={()=>onAction("send")} className={secondary}><Send size={14}/>Record dispatch</button>}{can("contract.sign")&&["GENERATED","SENT","SIGNED"].includes(contract.status)&&<button onClick={()=>onAction("sign")} className={primary}><FileSignature size={14}/>Record signature</button>}{can("contract.generate")&&mutable&&<button onClick={()=>onAction("amend")} className={secondary}><PenLine size={14}/>Amend/version</button>}{can("rental.start")&&["GENERATED","SENT","SIGNED"].includes(contract.status)&&<button onClick={onSchedule} className={secondary}><CalendarClock size={14}/>Schedule Handover</button>}</div></div></section>

    <section className="grid gap-5 xl:grid-cols-2"><div className="rounded-2xl border p-5"><h3 className="font-bold">Terms snapshot</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><Info label="Customer" value={terms.customerFullName}/><Info label="Driver" value={terms.primaryDriverFullName}/><Info label="Pickup" value={dateTime(terms.pickupAt)}/><Info label="Return" value={dateTime(terms.returnAt)}/><Info label="Pickup location" value={terms.pickupLocation}/><Info label="Return location" value={terms.returnLocation}/><Info label="Daily rate" value={money(terms.baseDailyRate,terms.currency||"KES")}/><Info label="Billable days" value={terms.billableDays}/><Info label="Deposit" value={money(terms.depositAmount,terms.currency||"KES")}/><Info label="Tax" value={money(terms.taxAmount,terms.currency||"KES")}/><Info label="Free km/day" value={terms.freeKmPerDay}/><Info label="Excess km rate" value={money(terms.excessKmRate,terms.currency||"KES")}/><Info label="Governing law" value={terms.governingLaw}/><Info label="CDW included" value={terms.cdwCoverIncluded?"Yes":"No"}/></div>{terms.specialTerms?.length>0&&<div className="mt-4"><p className="text-xs font-bold text-slate-500">Special terms</p><ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-slate-600">{terms.specialTerms.map((t:string,i:number)=><li key={i}>{t}</li>)}</ol></div>}</div><div className="rounded-2xl border p-5"><h3 className="font-bold">Frozen PricingSnapshot</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><Info label="Snapshot ID" value={pricing.snapshotId}/><Info label="Rate Plan" value={(pricing.ratePlanName||"")+" · "+(pricing.ratePlanCode||"")}/><Info label="Plan version" value={pricing.ratePlanVersion}/><Info label="Base rental" value={money(pricing.baseRentalAmount,pricing.currency||terms.currency||"KES")}/><Info label="Gross total" value={money(pricing.grossRentalTotal,pricing.currency||terms.currency||"KES")}/><Info label="Security deposit" value={money(pricing.securityDeposit?.amount,pricing.currency||terms.currency||"KES")}/></div></div></section>

    <section className="grid gap-5 xl:grid-cols-2"><History title="Signatures" rows={contract.signatures||[]} render={(s:any)=><div><div className="flex flex-wrap items-center gap-2"><BadgeCheck size={15} className={s.contractVersion===contract.contractVersion?"text-emerald-600":"text-slate-400"}/><span className="text-sm font-semibold">{s.signerName}</span><span className="text-[10px] text-slate-400">{human(s.signerType)} · {human(s.signatureMethod)} · Contract v{s.contractVersion}</span></div><p className="mt-1 text-xs text-slate-500">Ref: {s.signatureReference} · {dateTime(s.signedAt)}</p></div>}/><History title="Status history" rows={contract.statusHistory||[]} render={(row:any)=><div><div className="flex items-center gap-2"><Status value={row.toStatus}/><span className="text-xs text-slate-500">{human(row.fromStatus)} → {human(row.toStatus)}</span></div><p className="mt-1 text-xs text-slate-500">{row.reason||"No reason"} · {dateTime(row.occurredAt)}</p></div>}/></section>
    <History title="Contract version history" rows={contract.versions||[]} render={(v:any)=><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm font-semibold">Legal version {v.version}{v.isCurrent?" · Current":""}</span><span className="text-xs text-slate-500">{v.changeReason||"Initial version"} · {dateTime(v.createdAt)}</span></div>}/>
  </div>;
}

const HANDOVER_STEPS=["SCHEDULED","CUSTOMER_ARRIVED","DOCUMENT_VERIFIED","PRE_RENTAL_INSPECTION","SIGNATURE","KEY_HANDOVER","HANDOVER_COMPLETED"];
function HandoverDossier({handover,contract,bookingName,customerName,driverName,vehicleName,readiness,portal,onAction,onOpenRental,onOpenInspection}:{handover:any;contract:any;bookingName:(id?:string)=>string;customerName:(id?:string)=>string;driverName:(id?:string)=>string;vehicleName:(id?:string)=>string;readiness:any;portal:AccessPortal;onAction:(a:HandoverAction)=>void;onOpenRental:()=>void;onOpenInspection:()=>void}){
  const can=(p:string)=>permits(portal,p);
  const index=HANDOVER_STEPS.indexOf(handover.status);
  const nextAction:HandoverAction|undefined=handover.status==="SCHEDULED"?"arrive":handover.status==="CUSTOMER_ARRIVED"?"documents":handover.status==="DOCUMENT_VERIFIED"?"inspection":handover.status==="PRE_RENTAL_INSPECTION"?"signature":handover.status==="SIGNATURE"?"keys":handover.status==="KEY_HANDOVER"?"complete":undefined;
  const nextPerm=nextAction==="inspection"?"inspection.create":nextAction==="signature"?"contract.sign":"rental.start";
  return <div className="space-y-5">
    <div className="rounded-2xl bg-slate-950 p-5 text-white"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-lg font-bold">{handover.handoverNumber}</span><Status value={handover.status}/></div><p className="mt-2 text-sm text-slate-300">{customerName(handover.customerId)} · {vehicleName(handover.vehicleId)}</p></div><div className="text-left lg:text-right"><p className="text-xs text-slate-400">Scheduled dispatch</p><p className="text-base font-bold">{dateTime(handover.scheduledAt)}</p><p className="text-xs text-slate-400">Booking {bookingName(handover.bookingId)}</p></div></div></div>

    <div className="overflow-x-auto"><div className="flex min-w-[850px] gap-2">{HANDOVER_STEPS.map((step,i)=><div key={step} className={"flex-1 rounded-xl border p-3 "+(i<=index?"border-emerald-200 bg-emerald-50":"border-slate-200 bg-slate-50")}><p className="text-[10px] font-bold uppercase text-slate-500">Step {i+1}</p><p className={"mt-1 text-xs font-semibold "+(i<=index?"text-emerald-800":"text-slate-500")}>{human(step)}</p></div>)}</div></div>

    <section className="grid gap-4 rounded-2xl border p-5 sm:grid-cols-2 lg:grid-cols-4"><Info label="Contract" value={contract?.contractNumber||handover.contractId}/><Info label="Customer" value={customerName(handover.customerId)}/><Info label="Primary Driver" value={driverName(handover.primaryDriverId)}/><Info label="Vehicle" value={vehicleName(handover.vehicleId)}/><Info label="Inspection" value={handover.inspectionId}/><Info label="Checkout odometer" value={(handover.checkoutOdometer??0)+" km"}/><Info label="Checkout fuel" value={(handover.checkoutFuelLevel??0)+"%"}/><Info label="Completed" value={dateTime(handover.completedAt)}/></section>

    <section className="rounded-2xl border p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><h3 className="font-bold">Physical checkpoint command</h3><p className="mt-1 text-xs text-slate-500">Only the exact next server checkpoint is exposed; no checkpoint can be skipped.</p></div><div className="flex flex-wrap gap-2">{nextAction&&can(nextPerm)&&<button onClick={()=>onAction(nextAction)} className={primary}><ClipboardCheck size={14}/>{nextLabel(nextAction)}</button>}{handover.status==="DOCUMENT_VERIFIED"&&portal.sections.some(s=>s.id==="inspections")&&<button onClick={onOpenInspection} className={secondary}>Open Inspection workspace</button>}{handover.status==="HANDOVER_COMPLETED"&&portal.sections.some(s=>s.id==="rentals")&&<button onClick={onOpenRental} className={secondary}>Open Rental Operations<ChevronRight size={14}/></button>}</div></div></section>

    <section className="grid gap-5 xl:grid-cols-2"><div className="rounded-2xl border p-5"><h3 className="font-bold">Checkpoint evidence</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><Info label="Customer arrived" value={dateTime(handover.customerArrivedAt)}/><Info label="Documents verified" value={dateTime(handover.documentsVerifiedAt)}/><Info label="Inspection completed" value={dateTime(handover.inspectionCompletedAt)}/><Info label="Signature checkpoint" value={dateTime(handover.signatureCompletedAt)}/><Info label="Keys handed over" value={dateTime(handover.keyHandedOverAt)}/><Info label="Notes" value={handover.notes}/></div></div><RentalReadiness readiness={readiness}/></section>
    <History title="Handover status history" rows={handover.statusHistory||[]} render={(row:any)=><div><div className="flex items-center gap-2"><Status value={row.toStatus}/><span className="text-xs text-slate-500">{human(row.fromStatus)} → {human(row.toStatus)}</span></div><p className="mt-1 text-xs text-slate-500">{row.reason||"No reason"} · {dateTime(row.occurredAt)}</p></div>}/>
  </div>;
}
function nextLabel(a:HandoverAction){return a==="arrive"?"Record Customer Arrival":a==="documents"?"Verify Documents":a==="inspection"?"Attach Completed Inspection":a==="signature"?"Verify Current Contract Signature":a==="keys"?"Record Key Handover":"Complete Handover";}

function RentalReadiness({readiness}:{readiness:any}){return <section className="rounded-2xl border p-5"><h3 className="font-bold">Rental-start readiness</h3><p className="mt-1 text-xs text-slate-500">Read-only boundary check. Rental creation remains in Rental Operations.</p>{!readiness?<p className="mt-4 text-sm text-slate-500">Readiness is unavailable or not permitted.</p>:<div className="mt-4 space-y-3"><div className={"rounded-xl p-3 text-sm font-semibold "+(readiness.isReady?"bg-emerald-50 text-emerald-800":"bg-amber-50 text-amber-800")}>{readiness.isReady?"Ready for Rental Operations":"Rental-start blockers remain"}</div><div className="grid gap-2 sm:grid-cols-2"><Ready label="Documents verified" value={readiness.documentsVerified}/><Ready label="Inspection completed" value={readiness.inspectionCompleted}/><Ready label="Contract signed" value={readiness.contractSigned}/><Ready label="Vehicle operational" value={readiness.vehicleOperational}/><Ready label="Allocation valid" value={readiness.allocationValid}/></div>{readiness.blockers?.length>0&&<div><p className="text-xs font-bold text-rose-700">Blockers</p><ul className="mt-1 list-disc pl-5 text-xs text-rose-700">{readiness.blockers.map((b:string,i:number)=><li key={i}>{b}</li>)}</ul></div>}{readiness.warnings?.length>0&&<div><p className="text-xs font-bold text-amber-700">Warnings</p><ul className="mt-1 list-disc pl-5 text-xs text-amber-700">{readiness.warnings.map((b:string,i:number)=><li key={i}>{b}</li>)}</ul></div>}</div>}</section>;}
function Ready({label,value}:{label:string;value:boolean}){return <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs"><span>{label}</span><span className={value?"font-bold text-emerald-700":"font-bold text-rose-700"}>{value?"Ready":"Blocked"}</span></div>;}
function History({title,rows,render}:{title:string;rows:any[];render:(row:any)=>React.ReactNode}){return <section className="rounded-2xl border p-5"><h3 className="font-bold">{title}</h3>{!rows.length?<p className="mt-3 text-sm text-slate-500">No records.</p>:<div className="mt-4 space-y-2">{rows.map((row,i)=><div key={row.id||i} className="rounded-xl bg-slate-50 p-3">{render(row)}</div>)}</div>}</section>;}

function GenerateContractModal({bookings,contracts,onClose,onDone}:{bookings:any[];contracts:any[];onClose:()=>void;onDone:(c:any)=>Promise<void>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [idempotencyKey]=useState(()=>typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():"contract-"+Date.now()+"-"+Math.random().toString(36).slice(2));
  const currentBookingIds=new Set(contracts.filter(c=>c.status!=="ARCHIVED").map(c=>c.bookingId));
  const eligible=bookings.filter(b=>b.status==="CONFIRMED"&&b.pricingSnapshot&&b.assignedVehicleId&&!currentBookingIds.has(b.id));
  async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const d=new FormData(e.currentTarget);const special=String(d.get("specialTerms")||"").split("\n").map(x=>x.trim()).filter(Boolean);try{const c:any=await unwrap(apiClient.contracts.generateContract({bookingId:String(d.get("bookingId")),templateVersion:String(d.get("templateVersion")||"1.0.0"),specialTerms:special.length?special:undefined,idempotencyKey}));await onDone(c);}catch(err:any){setError(err.message);}finally{setBusy(false);}}
  return <Modal title="Generate Contract" subtitle="Only confirmed Bookings with a frozen PricingSnapshot and assigned Vehicle are eligible." onClose={onClose}>{error&&<ErrorBox text={error}/>}<form onSubmit={submit} className="mt-4 grid gap-4"><Field label="Confirmed Booking *"><select required name="bookingId" className={inputClass}><option value="">Choose Booking</option>{eligible.map(b=><option key={b.id} value={b.id}>{b.bookingNumber} · {dateTime(b.pickupAt)} · {money(b.grossTotal,b.currency||b.pricingSnapshot?.currency||"KES")}</option>)}</select></Field><Field label="Template version"><input name="templateVersion" defaultValue="1.0.0" className={inputClass}/></Field><Field label="Special terms (one per line)"><textarea name="specialTerms" rows={6} className={inputClass} placeholder="Leave blank to use the server's standard terms."/></Field><p className="text-[11px] text-slate-400">Idempotency key: <span className="font-mono">{idempotencyKey}</span></p><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondary}>Cancel</button><button disabled={busy||!eligible.length} className={primary}><FileText size={14}/>Generate Contract</button></div>{!eligible.length&&<p className="text-xs text-amber-700">No confirmed Booking currently satisfies Contract-generation eligibility.</p>}</form></Modal>;
}

function ScheduleHandoverModal({bookings,contracts,handovers,onClose,onDone}:{bookings:any[];contracts:any[];handovers:any[];onClose:()=>void;onDone:(h:any)=>Promise<void>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [idempotencyKey]=useState(()=>typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():"handover-"+Date.now()+"-"+Math.random().toString(36).slice(2));
  const activeBookingIds=new Set(handovers.filter(h=>h.status!=="HANDOVER_COMPLETED").map(h=>h.bookingId));
  const contractByBooking=new Map(contracts.filter(c=>!["ACTIVE","COMPLETED","ARCHIVED"].includes(c.status)).sort((a,b)=>b.contractVersion-a.contractVersion).map(c=>[c.bookingId,c]));
  const eligible=bookings.filter(b=>b.status==="CONFIRMED"&&b.assignedVehicleId&&contractByBooking.has(b.id)&&!activeBookingIds.has(b.id));
  async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const d=new FormData(e.currentTarget);try{const h:any=await unwrap(apiClient.handovers.schedule({bookingId:String(d.get("bookingId")),scheduledAt:d.get("scheduledAt")?iso(String(d.get("scheduledAt"))):undefined,notes:String(d.get("notes")||"").trim()||undefined,idempotencyKey}));await onDone(h);}catch(err:any){setError(err.message);}finally{setBusy(false);}}
  return <Modal title="Schedule physical Handover" subtitle="The server anchors Handover to the current non-terminal Contract and confirmed assigned Vehicle." onClose={onClose}>{error&&<ErrorBox text={error}/>}<form onSubmit={submit} className="mt-4 grid gap-4"><Field label="Booking *"><select required name="bookingId" className={inputClass}><option value="">Choose Booking</option>{eligible.map(b=><option key={b.id} value={b.id}>{b.bookingNumber} · Contract {contractByBooking.get(b.id)?.contractNumber}</option>)}</select></Field><Field label="Scheduled time"><input name="scheduledAt" type="datetime-local" className={inputClass}/></Field><Field label="Notes"><textarea name="notes" className={inputClass}/></Field><p className="text-[11px] text-slate-400">Idempotency key: <span className="font-mono">{idempotencyKey}</span></p><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondary}>Cancel</button><button disabled={busy||!eligible.length} className={primary}><CalendarClock size={14}/>Schedule Handover</button></div>{!eligible.length&&<p className="text-xs text-amber-700">No confirmed Booking currently has an eligible current Contract without an active Handover.</p>}</form></Modal>;
}

function ContractActionModal({action,contract,onClose,onDone}:{action:ContractAction;contract:any;onClose:()=>void;onDone:(msg:string)=>Promise<void>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const d=new FormData(e.currentTarget);try{
    if(action==="send"){const method=String(d.get("deliveryMethod"));await unwrap(apiClient.contracts.sendContract(contract.id,{deliveryMethod:method,recipientEmail:String(d.get("recipientEmail")||"").trim()||undefined,recipientPhone:String(d.get("recipientPhone")||"").trim()||undefined}));await onDone("Contract dispatch was recorded/requested. This does not by itself prove external provider delivery.");}
    if(action==="sign"){await unwrap(apiClient.contracts.signContract(contract.id,{signerType:String(d.get("signerType")),signerId:String(d.get("signerId")),signerName:String(d.get("signerName")),signatureMethod:String(d.get("signatureMethod")),signatureReference:String(d.get("signatureReference")),expectedVersion:contract.version}));await onDone("Signature evidence recorded against Contract version "+contract.contractVersion+".");}
    if(action==="amend"){const terms:any={};for(const key of ["pickupLocation","returnLocation","governingLaw"]){const v=String(d.get(key)||"").trim();if(v)terms[key]=v;}const special=String(d.get("specialTerms")||"").split("\n").map(x=>x.trim()).filter(Boolean);if(special.length)terms.specialTerms=special;await unwrap(apiClient.contracts.amendContract(contract.id,{changeReason:String(d.get("changeReason")),termsSnapshot:terms,expectedVersion:contract.version}));await onDone("Contract amended to a new legal version. The new version must be dispatched/signed again.");}
  }catch(err:any){setError(err.message);}finally{setBusy(false);}}
  return <Modal title={action==="send"?"Record Contract dispatch":action==="sign"?"Record Contract signature":"Amend Contract version"} subtitle={action==="send"?"This records dispatch intent/event; external delivery requires downstream provider evidence.":action==="sign"?"Signature evidence is bound to the current Contract version and optimistic aggregate version.":"Signed evidence from the prior legal version does not authorize the amended version."} onClose={onClose}>{error&&<ErrorBox text={error}/>}<form onSubmit={submit} className="mt-4 grid gap-4">{action==="send"&&<><Field label="Delivery method"><select name="deliveryMethod" className={inputClass}>{["EMAIL","SMS","WHATSAPP","IN_PERSON"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Recipient email"><input name="recipientEmail" type="email" className={inputClass}/></Field><Field label="Recipient phone"><input name="recipientPhone" className={inputClass}/></Field></>}{action==="sign"&&<><Field label="Signer type"><select name="signerType" className={inputClass}>{["CUSTOMER","PRIMARY_DRIVER","OPERATOR","CORPORATE_REP","GUARANTOR"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Signer ID *"><input required name="signerId" className={inputClass}/></Field><Field label="Signer name *"><input required name="signerName" className={inputClass}/></Field><Field label="Signature method"><select name="signatureMethod" className={inputClass}>{["ELECTRONIC_OTP","DRAWN_CANVAS","BIOMETRIC","MANUAL_UPLOAD"].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Signature reference *"><input required name="signatureReference" className={inputClass} placeholder="Verified provider/file/reference ID"/></Field></>}{action==="amend"&&<><Field label="Change reason *"><textarea required name="changeReason" className={inputClass}/></Field><Field label="Pickup location override"><input name="pickupLocation" defaultValue={contract.termsSnapshot?.pickupLocation||""} className={inputClass}/></Field><Field label="Return location override"><input name="returnLocation" defaultValue={contract.termsSnapshot?.returnLocation||""} className={inputClass}/></Field><Field label="Governing law override"><input name="governingLaw" defaultValue={contract.termsSnapshot?.governingLaw||""} className={inputClass}/></Field><Field label="Special terms (one per line)"><textarea name="specialTerms" rows={6} defaultValue={(contract.termsSnapshot?.specialTerms||[]).join("\n")} className={inputClass}/></Field></>}<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondary}>Cancel</button><button disabled={busy} className={action==="amend"?secondary:primary}>{action==="send"?<Send size={14}/>:action==="sign"?<FileSignature size={14}/>:<PenLine size={14}/>}Confirm</button></div></form></Modal>;
}

function HandoverActionModal({action,handover,inspections,onClose,onDone}:{action:HandoverAction;handover:any;inspections:any[];onClose:()=>void;onDone:(msg:string)=>Promise<void>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const d=new FormData(e.currentTarget);try{
    if(action==="arrive"){await unwrap(apiClient.handovers.recordArrival(handover.id,{arrivedAt:d.get("arrivedAt")?iso(String(d.get("arrivedAt"))):undefined,notes:String(d.get("notes")||"").trim()||undefined,expectedVersion:handover.version}));await onDone("Customer arrival recorded.");}
    if(action==="documents"){await unwrap(apiClient.handovers.verifyDocuments(handover.id,{driverLicenseVerified:d.get("driverLicenseVerified")==="on",idDocumentVerified:d.get("idDocumentVerified")==="on",verifiedBy:String(d.get("verifiedBy")),notes:String(d.get("notes")||"").trim()||undefined,expectedVersion:handover.version}));await onDone("Driver licence and identity-document verification recorded.");}
    if(action==="inspection"){const inspection=inspections.find(i=>i.id===String(d.get("inspectionId")));if(!inspection)throw new Error("Choose a completed PRE_RENTAL Inspection for this Booking and Vehicle.");await unwrap(apiClient.handovers.completeInspection(handover.id,{inspectionId:inspection.id,odometer:inspection.odometer,fuelLevel:inspection.fuelLevel,passed:true,notes:String(d.get("notes")||"").trim()||undefined,expectedVersion:handover.version}));await onDone("Completed PRE_RENTAL Inspection attached as the Handover checkpoint authority.");}
    if(action==="signature"){await unwrap(apiClient.handovers.confirmSignature(handover.id,{contractSigned:d.get("contractSigned")==="on",signatureReference:String(d.get("signatureReference")||"").trim()||undefined,notes:String(d.get("notes")||"").trim()||undefined,expectedVersion:handover.version}));await onDone("Current Contract-version signature verified by the server.");}
    if(action==="keys"){await unwrap(apiClient.handovers.handoverKeys(handover.id,{checkoutOdometer:Number(d.get("checkoutOdometer")),checkoutFuelLevel:Number(d.get("checkoutFuelLevel")),handedOverTo:String(d.get("handedOverTo")),keyTagNumber:String(d.get("keyTagNumber")||"").trim()||undefined,notes:String(d.get("notes")||"").trim()||undefined,expectedVersion:handover.version}));await onDone("Physical key handover and dispatch readings recorded.");}
    if(action==="complete"){await unwrap(apiClient.handovers.complete(handover.id,{notes:String(d.get("notes")||"").trim()||undefined,expectedVersion:handover.version}));await onDone("Handover completed. Rental has not been started; Rental Operations remains the next boundary.");}
  }catch(err:any){setError(err.message);}finally{setBusy(false);}}
  return <Modal title={nextLabel(action)} subtitle="This advances exactly one canonical Handover checkpoint. Skipping checkpoints is not permitted." onClose={onClose}>{error&&<ErrorBox text={error}/>}<form onSubmit={submit} className="mt-4 grid gap-4">{action==="arrive"&&<><Field label="Arrival time"><input name="arrivedAt" type="datetime-local" defaultValue={localInput(new Date().toISOString())} className={inputClass}/></Field><Field label="Notes"><textarea name="notes" className={inputClass}/></Field></>}{action==="documents"&&<><label className="flex items-center gap-2 text-sm"><input required type="checkbox" name="driverLicenseVerified"/>Driver licence physically verified</label><label className="flex items-center gap-2 text-sm"><input required type="checkbox" name="idDocumentVerified"/>National ID / passport physically verified</label><Field label="Verified by *"><input required name="verifiedBy" className={inputClass}/></Field><Field label="Notes"><textarea name="notes" className={inputClass}/></Field></>}{action==="inspection"&&<><Field label="Completed PRE_RENTAL Inspection *"><select required name="inspectionId" className={inputClass}><option value="">Choose Inspection</option>{inspections.map(i=><option key={i.id} value={i.id}>{i.inspectionNumber} · {i.odometer} km · {i.fuelLevel}%</option>)}</select></Field><p className="text-xs text-slate-500">The server re-reads the Inspection and uses its stored odometer/fuel; this form cannot override those readings.</p><Field label="Notes"><textarea name="notes" className={inputClass}/></Field>{!inspections.length&&<p className="text-xs text-amber-700">No completed PRE_RENTAL Inspection exists for this Booking/Vehicle. Complete it in the Inspection workspace first.</p>}</>}{action==="signature"&&<><label className="flex items-center gap-2 text-sm"><input required type="checkbox" name="contractSigned"/>I am asking the server to verify the current Contract version is actually signed</label><Field label="Signature reference (optional note)"><input name="signatureReference" className={inputClass}/></Field><Field label="Notes"><textarea name="notes" className={inputClass}/></Field></>}{action==="keys"&&<><Field label="Checkout odometer *"><input required name="checkoutOdometer" type="number" min={handover.checkoutOdometer||0} defaultValue={handover.checkoutOdometer||0} className={inputClass}/></Field><Field label="Checkout fuel % *"><input required name="checkoutFuelLevel" type="number" min="0" max="100" defaultValue={handover.checkoutFuelLevel??100} className={inputClass}/></Field><Field label="Handed over to *"><input required name="handedOverTo" className={inputClass}/></Field><Field label="Key tag number"><input name="keyTagNumber" className={inputClass}/></Field><Field label="Notes"><textarea name="notes" className={inputClass}/></Field></>}{action==="complete"&&<><div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><p className="font-semibold">Final dispatch snapshot</p><p className="mt-1">Odometer: {handover.checkoutOdometer} km · Fuel: {handover.checkoutFuelLevel}%</p><p className="mt-2 text-xs">Completion preserves these verified key-handover readings. It does not create a Rental.</p></div><Field label="Completion notes"><textarea name="notes" className={inputClass}/></Field></>}<div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondary}>Cancel</button><button disabled={busy||(action==="inspection"&&!inspections.length)} className={primary}><CheckCircle2 size={14}/>Advance checkpoint</button></div></form></Modal>;
}
