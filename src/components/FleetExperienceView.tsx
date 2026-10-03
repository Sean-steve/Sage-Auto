import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Car,
  ChevronRight,
  ClipboardCheck,
  Fuel,
  Gauge,
  Globe2,
  History,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { apiClient, type ApiResponse } from "../lib/api-client";
import { permits, type AccessPortal } from "../lib/access-context";
import { useApp } from "../lib/store";

type FleetExperienceProps = {
  portal: AccessPortal;
};

type Summary = {
  total: number;
  available: number;
  onRent: number;
  maintenance: number;
  blocked: number;
};

const lifecycleStates = ["DRAFT","PENDING_VERIFICATION","ACTIVE","SUSPENDED","INACTIVE","SOLD","RETIRED"];
const availabilityStates = ["AVAILABLE","RESERVED","ON_RENT","MAINTENANCE","BLOCKED"];
const categories = ["SUV","4x4 Offroad","Luxury","Sedan","Van/Bus"];
const docTypes = ["INSURANCE_CERTIFICATE","NTSA_INSPECTION","PSV_LICENSE","LOGBOOK_TITLE","LEASE_AGREEMENT","SERVICE_RECORD","OTHER"];

function human(value?: string | null) {
  return value ? value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()) : "—";
}
function date(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString() : "—";
}
function number(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function statusClass(value?: string) {
  if (value === "AVAILABLE" || value === "ACTIVE" || value === "VALID" || value === "VERIFIED" || value === "COMPLETED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (value === "ON_RENT" || value === "RESERVED" || value === "IN_PROGRESS") return "bg-blue-50 text-blue-700 border-blue-200";
  if (value === "MAINTENANCE" || value === "EXPIRING_SOON" || value === "PENDING" || value === "SCHEDULED") return "bg-amber-50 text-amber-700 border-amber-200";
  if (value === "BLOCKED" || value === "EXPIRED" || value === "REJECTED" || value === "SUSPENDED") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}
function Badge({value}:{value?:string}) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${statusClass(value)}`}>{human(value)}</span>;
}
function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <label className="grid gap-1 text-xs font-medium text-slate-600">{label}{children}</label>;
}
const inputClass="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400";
const buttonPrimary="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";
const buttonSecondary="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

async function unwrap<T>(response: ApiResponse<T>): Promise<T> {
  if (response.error) throw new Error(response.error.message);
  return response.data as T;
}

export function FleetExperienceView({portal}:FleetExperienceProps) {
  const { navigateSection } = useApp();
  const can = (permission:string) => permits(portal, permission);
  const [vehicles,setVehicles]=useState<any[]>([]);
  const [owners,setOwners]=useState<any[]>([]);
  const [summary,setSummary]=useState<Summary>({total:0,available:0,onRent:0,maintenance:0,blocked:0});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [lifecycle,setLifecycle]=useState("");
  const [availability,setAvailability]=useState("");
  const [category,setCategory]=useState("");
  const [owner,setOwner]=useState("");
  const [createOpen,setCreateOpen]=useState(false);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const requestSeq=useRef(0);

  const query = useMemo(()=>({
    ...(search.trim()?{search:search.trim()}:{}),
    ...(lifecycle?{lifecycleStatus:lifecycle}:{}),
    ...(availability?{availabilityStatus:availability}:{}),
    ...(category?{category}:{}),
    ...(owner?{ownerId:owner}:{}),
    page:1,
    limit:100,
  }),[search,lifecycle,availability,category,owner]);

  async function refresh() {
    const seq=++requestSeq.current;
    setLoading(true);setError("");
    try {
      const requests=[
        apiClient.fleet.listVehicles(query),
        apiClient.fleet.listVehicles({page:1,limit:1}),
        apiClient.fleet.listVehicles({availabilityStatus:"AVAILABLE",page:1,limit:1}),
        apiClient.fleet.listVehicles({availabilityStatus:"ON_RENT",page:1,limit:1}),
        apiClient.fleet.listVehicles({availabilityStatus:"MAINTENANCE",page:1,limit:1}),
        apiClient.fleet.listVehicles({availabilityStatus:"BLOCKED",page:1,limit:1}),
      ];
      const [list,total,availableNow,onRentNow,maintenanceNow,blockedNow]=await Promise.all(requests);
      if(seq!==requestSeq.current)return;
      if(list.error) throw new Error(list.error.message);
      setVehicles(list.data||[]);
      setSummary({
        total:total.meta?.total||0,
        available:availableNow.meta?.total||0,
        onRent:onRentNow.meta?.total||0,
        maintenance:maintenanceNow.meta?.total||0,
        blocked:blockedNow.meta?.total||0,
      });
      if(can("vehicle_owner.read")){
        const o=await apiClient.vehicleOwners.listOwners();
        if(seq===requestSeq.current&&!o.error)setOwners((o.data as any[])||[]);
      } else setOwners([]);
    } catch(e:any) {
      if(seq===requestSeq.current)setError(e.message||"Unable to load fleet.");
    } finally {
      if(seq===requestSeq.current)setLoading(false);
    }
  }

  useEffect(()=>{const timer=setTimeout(()=>void refresh(),search?250:0);return()=>{clearTimeout(timer);requestSeq.current++;};},[portal.id,JSON.stringify(query)]);

  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Fleet operations</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Fleet Asset Inventory</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">Every rentable asset, its operational state, ownership, readiness and history from the server-backed fleet record.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={()=>void refresh()} className={buttonSecondary}><RefreshCw size={16}/>Refresh</button>
        {can("vehicle.create")&&<button onClick={()=>setCreateOpen(true)} className={buttonPrimary}><Plus size={16}/>Register vehicle</button>}
      </div>
    </header>

    <section className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Fleet summary">
      <Metric label="Fleet records" value={summary.total} />
      <Metric label="Available" value={summary.available} tone="emerald"/>
      <Metric label="On rent" value={summary.onRent} tone="blue"/>
      <Metric label="Maintenance" value={summary.maintenance} tone="amber"/>
      <Metric label="Blocked" value={summary.blocked} tone="rose"/>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="relative lg:col-span-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} className={`${inputClass} pl-9`} placeholder="Plate, make, model, VIN"/>
        </label>
        <select value={lifecycle} onChange={e=>setLifecycle(e.target.value)} className={inputClass}><option value="">All lifecycle states</option>{lifecycleStates.map(s=><option key={s} value={s}>{human(s)}</option>)}</select>
        <select value={availability} onChange={e=>setAvailability(e.target.value)} className={inputClass}><option value="">All availability</option>{availabilityStates.map(s=><option key={s} value={s}>{human(s)}</option>)}</select>
        <select value={category} onChange={e=>setCategory(e.target.value)} className={inputClass}><option value="">All categories</option>{categories.map(s=><option key={s}>{s}</option>)}</select>
        {can("vehicle_owner.read")?<select value={owner} onChange={e=>setOwner(e.target.value)} className={inputClass}><option value="">All owners</option>{owners.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select>:<div className="hidden lg:block"/>}
      </div>
    </section>

    {error&&<div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><div><strong>Fleet could not be loaded.</strong><p>{error}</p></div></div>}

    {loading?<div className="grid place-items-center rounded-2xl border border-slate-200 bg-white p-16 text-slate-500"><Loader2 className="mb-3 h-6 w-6 animate-spin"/>Loading fleet…</div>:
      !vehicles.length?<EmptyFleet canCreate={can("vehicle.create")} onCreate={()=>setCreateOpen(true)}/>:
      <FleetList vehicles={vehicles} owners={owners} onOpen={setSelectedId}/>}

    {createOpen&&<RegisterVehicleDialog portal={portal} owners={owners} onClose={()=>setCreateOpen(false)} onCreated={async(id)=>{setCreateOpen(false);await refresh();setSelectedId(id);}}/>}
    {selectedId&&<AssetProfile vehicleId={selectedId} portal={portal} owners={owners} onClose={()=>setSelectedId(null)} onChanged={refresh} navigate={navigateSection}/>}
  </div>;
}

function Metric({label,value,tone="slate"}:{label:string;value:number;tone?:string}) {
  const tones:any={slate:"text-slate-900",emerald:"text-emerald-700",blue:"text-blue-700",amber:"text-amber-700",rose:"text-rose-700"};
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</p></div>;
}

function EmptyFleet({canCreate,onCreate}:{canCreate:boolean;onCreate:()=>void}) {
  return <div className="grid place-items-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center">
    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Car/></div>
    <h2 className="mt-4 text-lg font-bold text-slate-900">No vehicles match this view</h2>
    <p className="mt-2 max-w-md text-sm text-slate-500">Adjust the filters or register the first vehicle in this workspace.</p>
    {canCreate&&<button className={`${buttonPrimary} mt-5`} onClick={onCreate}><Plus size={16}/>Register vehicle</button>}
  </div>;
}

function FleetList({vehicles,owners,onOpen}:{vehicles:any[];owners:any[];onOpen:(id:string)=>void}) {
  const ownerName=(id?:string)=>owners.find(o=>o.id===id)?.name;
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Vehicle</th><th className="px-4 py-3">Lifecycle</th><th className="px-4 py-3">Availability</th><th className="px-4 py-3">Ownership</th><th className="px-4 py-3">Odometer / Fuel</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Web</th><th className="px-4 py-3"/></tr></thead>
        <tbody className="divide-y divide-slate-100">{vehicles.map(v=><tr key={v.id} className="transition hover:bg-slate-50/70">
          <td className="px-5 py-4"><div className="flex items-center gap-3">{v.imageUrl?<img src={v.imageUrl} alt="" className="h-12 w-16 rounded-xl object-cover"/>:<div className="grid h-12 w-16 place-items-center rounded-xl bg-slate-100 text-slate-400"><Car size={20}/></div>}<div><p className="font-bold text-slate-900">{v.make} {v.model}</p><p className="font-mono text-xs text-slate-500">{v.registrationPlate} · {v.year} · {v.category}</p></div></div></td>
          <td className="px-4 py-4"><Badge value={v.lifecycleStatus}/></td>
          <td className="px-4 py-4"><Badge value={v.availabilityStatus}/></td>
          <td className="px-4 py-4"><p className="font-medium text-slate-700">{ownerName(v.ownerId)||"Internal fleet"}</p><p className="text-xs text-slate-400">{v.ownerId?"External/linked owner":"Company controlled"}</p></td>
          <td className="px-4 py-4"><p>{number(v.odometer).toLocaleString()} km</p><p className="text-xs text-slate-400">{number(v.fuelLevel)}% fuel</p></td>
          <td className="px-4 py-4 text-slate-600">{v.currentLocation||"—"}</td>
          <td className="px-4 py-4">{v.isPublishedToWebsite?<Globe2 className="h-4 w-4 text-emerald-600"/>:<span className="text-xs text-slate-400">Private</span>}</td>
          <td className="px-4 py-4"><button onClick={()=>onOpen(v.id)} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-800">Asset profile<ChevronRight size={15}/></button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="grid gap-3 p-3 md:hidden">{vehicles.map(v=><article key={v.id} className="rounded-2xl border border-slate-200 p-4">
      <div className="flex gap-3">{v.imageUrl?<img src={v.imageUrl} alt="" className="h-16 w-20 rounded-xl object-cover"/>:<div className="grid h-16 w-20 shrink-0 place-items-center rounded-xl bg-slate-100"><Car/></div>}<div className="min-w-0 flex-1"><h3 className="truncate font-bold text-slate-900">{v.make} {v.model}</h3><p className="font-mono text-xs text-slate-500">{v.registrationPlate} · {v.year}</p><div className="mt-2 flex flex-wrap gap-1.5"><Badge value={v.lifecycleStatus}/><Badge value={v.availabilityStatus}/></div></div></div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500"><p><Gauge className="mr-1 inline h-3.5 w-3.5"/>{number(v.odometer).toLocaleString()} km</p><p><Fuel className="mr-1 inline h-3.5 w-3.5"/>{number(v.fuelLevel)}%</p><p className="truncate"><UserRound className="mr-1 inline h-3.5 w-3.5"/>{ownerName(v.ownerId)||"Internal fleet"}</p><p className="truncate"><MapPin className="mr-1 inline h-3.5 w-3.5"/>{v.currentLocation||"—"}</p></div>
      <button onClick={()=>onOpen(v.id)} className={`${buttonSecondary} mt-4 w-full`}>Open asset profile<ChevronRight size={15}/></button>
    </article>)}</div>
  </section>;
}

function RegisterVehicleDialog({portal,owners,onClose,onCreated}:{portal:AccessPortal;owners:any[];onClose:()=>void;onCreated:(id:string)=>void|Promise<void>}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError("");
    const d=new FormData(e.currentTarget);
    const ownerId=String(d.get("ownerId")||"");
    const payload:any={
      registrationPlate:String(d.get("registrationPlate")||"").trim().toUpperCase(),
      make:String(d.get("make")||"").trim(),
      model:String(d.get("model")||"").trim(),
      year:number(d.get("year")),
      category:String(d.get("category")||"SUV"),
      color:String(d.get("color")||"").trim()||undefined,
      vin:String(d.get("vin")||"").trim().toUpperCase()||undefined,
      odometer:number(d.get("odometer")),
      fuelLevel:number(d.get("fuelLevel"),100),
      dailyRate:number(d.get("dailyRate")),
      transmission:String(d.get("transmission")||"AUTOMATIC"),
      seats:number(d.get("seats"),5),
      fuelType:String(d.get("fuelType")||"PETROL"),
      features:String(d.get("features")||"").split(",").map(s=>s.trim()).filter(Boolean),
      imageUrl:String(d.get("imageUrl")||"").trim(),
      currentLocation:String(d.get("currentLocation")||"").trim()||undefined,
      isPublishedToWebsite:d.get("isPublishedToWebsite")==="on",
      insuranceExpiryDate:String(d.get("insuranceExpiryDate")||"")||undefined,
      inspectionExpiryDate:String(d.get("inspectionExpiryDate")||"")||undefined,
      allowedDailyKm:number(d.get("allowedDailyKm"),250),
      excessKmRate:number(d.get("excessKmRate")),
      ...(ownerId?{ownerId,ownershipType:String(d.get("ownershipType")||"THIRD_PARTY_OWNED"),revenueSharePercent:number(d.get("revenueSharePercent"),75)}:{}),
    };
    try{const created:any=await unwrap(apiClient.fleet.createVehicle(payload));await onCreated(created.id);}
    catch(err:any){setError(err.message||"Vehicle could not be registered.");}
    finally{setBusy(false);}
  }
  return <Modal title="Register fleet vehicle" subtitle="Create the server-backed asset first; lifecycle and availability are commissioned by FleetService." onClose={onClose}>
    {error&&<ErrorBox text={error}/>}
    <form onSubmit={submit} className="grid gap-5">
      <FormSection title="Vehicle identity"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="Registration plate *"><input required name="registrationPlate" className={inputClass}/></Field><Field label="Make *"><input required name="make" className={inputClass}/></Field><Field label="Model *"><input required name="model" className={inputClass}/></Field><Field label="Year *"><input required name="year" type="number" min="1980" max="2100" defaultValue={new Date().getFullYear()} className={inputClass}/></Field><Field label="VIN / chassis"><input name="vin" className={inputClass}/></Field><Field label="Color"><input name="color" className={inputClass}/></Field></div></FormSection>
      <FormSection title="Operational & commercial"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="Category *"><select name="category" className={inputClass}>{categories.map(c=><option key={c}>{c}</option>)}</select></Field><Field label="Transmission"><select name="transmission" className={inputClass}><option>AUTOMATIC</option><option>MANUAL</option></select></Field><Field label="Fuel type"><select name="fuelType" className={inputClass}><option>PETROL</option><option>DIESEL</option><option>HYBRID</option><option>ELECTRIC</option></select></Field><Field label="Seats"><input name="seats" type="number" min="1" defaultValue="5" className={inputClass}/></Field><Field label="Current odometer (km)"><input name="odometer" type="number" min="0" defaultValue="0" className={inputClass}/></Field><Field label="Fuel level %"><input name="fuelLevel" type="number" min="0" max="100" defaultValue="100" className={inputClass}/></Field><Field label="Fleet daily-rate reference *"><input required name="dailyRate" type="number" min="0" step="0.01" className={inputClass}/></Field><Field label="Allowed daily km"><input name="allowedDailyKm" type="number" min="0" defaultValue="250" className={inputClass}/></Field><Field label="Excess km rate"><input name="excessKmRate" type="number" min="0" step="0.01" defaultValue="0" className={inputClass}/></Field><Field label="Current location"><input name="currentLocation" className={inputClass}/></Field><Field label="Features (comma separated)"><input name="features" className={inputClass} placeholder="AC, Bluetooth, 4WD"/></Field></div><p className="mt-3 text-xs text-slate-400">Booking prices remain authoritative through the Pricing Engine; this rate is Fleet metadata/reference.</p></FormSection>
      {permits(portal,"vehicle_owner.read")&&<FormSection title="Ownership"><div className="grid gap-3 sm:grid-cols-3"><Field label="Owner"><select name="ownerId" className={inputClass}><option value="">Internal fleet</option>{owners.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></Field><Field label="Ownership type"><select name="ownershipType" className={inputClass}><option>THIRD_PARTY_OWNED</option><option>LEASED</option><option>MANAGED</option><option>PARTNERSHIP</option></select></Field><Field label="Owner revenue share %"><input name="revenueSharePercent" type="number" min="0" max="100" step="0.01" defaultValue="75" className={inputClass}/></Field></div></FormSection>}
      <FormSection title="Readiness & media"><div className="grid gap-3 sm:grid-cols-2"><Field label="Insurance expiry"><input name="insuranceExpiryDate" type="date" className={inputClass}/></Field><Field label="Inspection expiry"><input name="inspectionExpiryDate" type="date" className={inputClass}/></Field><Field label="Primary image URL"><input name="imageUrl" type="url" className={inputClass}/></Field><label className="flex items-center gap-2 pt-6 text-sm text-slate-700"><input name="isPublishedToWebsite" type="checkbox" defaultChecked/> Publish to website catalogue</label></div></FormSection>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} className={buttonSecondary}>Cancel</button><button disabled={busy} className={buttonPrimary}>{busy?<Loader2 className="animate-spin" size={16}/>:<Plus size={16}/>}Register vehicle</button></div>
    </form>
  </Modal>;
}

function AssetProfile({vehicleId,portal,owners,onClose,onChanged,navigate}:{vehicleId:string;portal:AccessPortal;owners:any[];onClose:()=>void;onChanged:()=>Promise<void>|void;navigate:(section:string)=>void}) {
  const can=(p:string)=>permits(portal,p);
  const [twin,setTwin]=useState<any>(null);
  const [maintenance,setMaintenance]=useState<any[]|null>(null);
  const [compliance,setCompliance]=useState<any[]|null>(null);
  const [readiness,setReadiness]=useState<any>(null);
  const [inspections,setInspections]=useState<any[]|null>(null);
  const [damages,setDamages]=useState<any[]|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [tab,setTab]=useState("overview");
  const [editOpen,setEditOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [actionError,setActionError]=useState("");
  const loadSeq=useRef(0);

  async function load(){
    const seq=++loadSeq.current;setLoading(true);setError("");
    try{
      const main=await unwrap<any>(apiClient.fleet.getDigitalTwin(vehicleId));
      if(seq!==loadSeq.current)return;
      setTwin(main);
      const jobs:Promise<void>[]=[];
      if(can("maintenance.read"))jobs.push((async()=>{const r=await apiClient.maintenance.listWorkOrders({vehicleId});if(seq===loadSeq.current)setMaintenance(r.error?[]:(r.data||[]));})());
      else setMaintenance(null);
      if(can("compliance.read"))jobs.push((async()=>{const [records,ready]=await Promise.all([apiClient.compliance.listRecords({subjectType:"VEHICLE",subjectId:vehicleId}),apiClient.compliance.getVehicleReadiness(vehicleId)]);if(seq===loadSeq.current){setCompliance(records.error?[]:(records.data||[]));setReadiness(ready.error?null:ready.data);}})());
      else {setCompliance(null);setReadiness(null);}
      if(can("inspection.read"))jobs.push((async()=>{const [insp,dmg]=await Promise.all([apiClient.inspections.listInspections({vehicleId,limit:50}),apiClient.inspections.listDamageCases({vehicleId,limit:50})]);if(seq===loadSeq.current){setInspections(insp.error?[]:(insp.data||[]));setDamages(dmg.error?[]:(dmg.data||[]));}})());
      else {setInspections(null);setDamages(null);}
      await Promise.all(jobs);
    }catch(e:any){if(seq===loadSeq.current)setError(e.message||"Unable to load vehicle profile.");}
    finally{if(seq===loadSeq.current)setLoading(false);}
  }
  useEffect(()=>{void load();return()=>{loadSeq.current++;};},[vehicleId,portal.id]);

  async function mutate(work:()=>Promise<ApiResponse<any>>){
    setBusy(true);setActionError("");
    try{const response=await work();if(response.error)throw new Error(response.error.message);await load();await onChanged();}
    catch(e:any){setActionError(e.message||"Action failed.");}
    finally{setBusy(false);}
  }
  if(loading&&!twin)return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 backdrop-blur-sm"><div className="rounded-2xl bg-white p-6 shadow-xl"><Loader2 className="mx-auto animate-spin text-emerald-600"/>Loading asset profile…</div></div>;
  if(error&&!twin)return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"><div className="max-w-md rounded-2xl bg-white p-6"><ErrorBox text={error}/><button className={`${buttonSecondary} mt-4`} onClick={onClose}>Close</button></div></div>;
  const v=twin?.vehicle;if(!v)return null;
  const tabs=[
    ["overview","Overview"],
    ...(can("vehicle_owner.read")?[["ownership","Ownership"]]:[]),
    ["availability","Availability & status"],
    ...(can("compliance.read")?[["compliance","Compliance"]]:[]),
    ...(can("maintenance.read")?[["maintenance","Maintenance"]]:[]),
    ...(can("inspection.read")?[["inspections","Inspections & damage"]]:[]),
    ["media","Media"],
    ["history","History"],
  ];
  return <div className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-label="Vehicle asset profile">
    <div className="ml-auto flex h-full w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-3xl">
      <div className="relative border-b border-slate-200 bg-slate-950 px-5 py-5 text-white sm:px-7">
        <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="Close asset profile"><X size={18}/></button>
        <div className="flex items-center gap-4 pr-12">{v.imageUrl?<img src={v.imageUrl} alt="" className="h-20 w-28 rounded-2xl object-cover ring-1 ring-white/15"/>:<div className="grid h-20 w-28 place-items-center rounded-2xl bg-white/10"><Car/></div>}<div><div className="mb-2 flex flex-wrap gap-2"><Badge value={v.lifecycleStatus}/><Badge value={v.availabilityStatus}/></div><h2 className="text-2xl font-bold">{v.make} {v.model}</h2><p className="font-mono text-sm text-slate-300">{v.registrationPlate} · {v.year} · {v.category}</p></div></div>
      </div>
      <div className="overflow-x-auto border-b border-slate-200 px-3 sm:px-6"><div className="flex min-w-max gap-1 py-2">{tabs.map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab===id?"bg-slate-900 text-white":"text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>{label}</button>)}</div></div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {actionError&&<div className="mb-4"><ErrorBox text={actionError}/></div>}
        {tab==="overview"&&<OverviewTab twin={twin} canUpdate={can("vehicle.update")} onEdit={()=>setEditOpen(true)}/>}
        {tab==="ownership"&&<OwnershipTab twin={twin} owners={owners} canManage={can("vehicle_ownership.manage")} busy={busy} mutate={mutate}/>}
        {tab==="availability"&&<AvailabilityTab vehicle={v} canOverride={can("vehicle.status_override")} canUpdate={can("vehicle.update")} busy={busy} mutate={mutate} openAvailability={()=>navigate("availability")}/>}
        {tab==="compliance"&&<ComplianceTab twin={twin} records={compliance||[]} readiness={readiness} canAttach={can("vehicle.update")} busy={busy} mutate={mutate} openCompliance={()=>navigate("compliance")}/>}
        {tab==="maintenance"&&<MaintenanceTab rows={maintenance||[]} openMaintenance={()=>navigate("maintenance")}/>}
        {tab==="inspections"&&<InspectionTab inspections={inspections||[]} damages={damages||[]} openInspections={()=>navigate("inspections")}/>}
        {tab==="media"&&<MediaTab vehicle={v} documents={twin.documents||[]} canUpdate={can("vehicle.update")} busy={busy} mutate={mutate}/>}
        {tab==="history"&&<HistoryTab twin={twin}/>}
      </div>
    </div>
    {editOpen&&<EditVehicleDialog vehicle={v} onClose={()=>setEditOpen(false)} onSave={async(payload)=>{await mutate(()=>apiClient.fleet.updateVehicle(v.id,{...payload,expectedVersion:v.version}));setEditOpen(false);}}/>}
  </div>;
}

function OverviewTab({twin,canUpdate,onEdit}:{twin:any;canUpdate:boolean;onEdit:()=>void}) {
  const v=twin.vehicle;return <div className="space-y-5">
    <div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-bold text-slate-900">Asset overview</h3><p className="text-sm text-slate-500">Canonical vehicle identity and current operating telemetry.</p></div>{canUpdate&&<button onClick={onEdit} className={buttonSecondary}>Edit asset</button>}</div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <InfoCard label="VIN / chassis" value={v.vin||"Not recorded"}/><InfoCard label="Odometer" value={`${number(v.odometer).toLocaleString()} km`}/><InfoCard label="Fuel" value={`${number(v.fuelLevel)}%`}/><InfoCard label="Transmission" value={human(v.transmission)}/>
      <InfoCard label="Fuel type" value={human(v.fuelType)}/><InfoCard label="Seats" value={String(v.seats||"—")}/><InfoCard label="Current location" value={v.currentLocation||"Not recorded"}/><InfoCard label="Fleet daily-rate reference" value={number(v.dailyRate).toLocaleString()}/>
      <InfoCard label="Daily km allowance" value={v.allowedDailyKm!=null?`${number(v.allowedDailyKm)} km`:"—"}/><InfoCard label="Excess km reference" value={v.excessKmRate!=null?number(v.excessKmRate).toLocaleString():"—"}/><InfoCard label="Insurance expiry" value={date(v.insuranceExpiryDate)}/><InfoCard label="Inspection expiry" value={date(v.inspectionExpiryDate)}/>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h4 className="font-semibold text-slate-900">Verified operational history</h4><div className="mt-3 grid gap-3 sm:grid-cols-2"><InfoCard label="Rental records" value={String(twin.stats?.totalRentals??0)}/><InfoCard label="Recorded rental days" value={String(twin.stats?.totalDaysOnRent??0)}/></div><p className="mt-3 text-xs text-slate-500">Revenue/utilization are intentionally not shown until a canonical cross-domain metric is available; the previous hard-coded values were removed.</p></div>
  </div>;
}

function OwnershipTab({twin,owners,canManage,busy,mutate}:{twin:any;owners:any[];canManage:boolean;busy:boolean;mutate:(w:()=>Promise<ApiResponse<any>>)=>Promise<void>}) {
  const current=twin.currentOwnership;
  async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const d=new FormData(e.currentTarget);const ownerId=String(d.get("ownerId")||"");if(!ownerId)return;const payload={vehicleId:twin.vehicle.id,ownerId,ownershipType:String(d.get("ownershipType")||"THIRD_PARTY_OWNED"),revenueSharePercent:number(d.get("revenueSharePercent"),75),fixedMonthlyPayout:d.get("fixedMonthlyPayout")?number(d.get("fixedMonthlyPayout")):undefined,allowableExpenseDeductions:d.get("allowableExpenseDeductions")==="on",termsSnapshot:String(d.get("termsSnapshot")||"").trim()||undefined};await mutate(()=>current?apiClient.vehicleOwners.transferOwnership({newOwnerId:ownerId,vehicleId:twin.vehicle.id,...payload}):apiClient.vehicleOwners.assignOwnership(payload));}
  return <div className="space-y-5"><SectionTitle title="Ownership & commercial agreement" subtitle="Current and historical asset ownership remain separate from the Vehicle identity."/>
    <div className="rounded-2xl border border-slate-200 p-4">{current?<><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold text-slate-900">{current.owner?.name||current.ownerId}</p><p className="text-sm text-slate-500">{human(current.ownershipType)} · effective {date(current.startDate)}</p></div><Badge value={current.isActive?"ACTIVE":"INACTIVE"}/></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><InfoCard label="Owner revenue share" value={`${number(current.revenueSharePercent)}%`}/><InfoCard label="Fixed payout" value={current.fixedMonthlyPayout!=null?number(current.fixedMonthlyPayout).toLocaleString():"—"}/><InfoCard label="Expense deductions" value={current.allowableExpenseDeductions?"Allowed":"Not allowed"}/></div>{current.termsSnapshot&&<p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{current.termsSnapshot}</p>}</>:<p className="text-sm text-slate-500">No external ownership agreement is active. The vehicle is treated as an internal fleet asset until an agreement is assigned.</p>}</div>
    {canManage&&<form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h4 className="font-semibold text-slate-900">{current?"Transfer / establish new effective agreement":"Assign ownership agreement"}</h4><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Owner"><select required name="ownerId" className={inputClass}><option value="">Choose owner</option>{owners.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></Field><Field label="Type"><select name="ownershipType" className={inputClass}><option>THIRD_PARTY_OWNED</option><option>LEASED</option><option>MANAGED</option><option>PARTNERSHIP</option></select></Field><Field label="Revenue share %"><input name="revenueSharePercent" type="number" min="0" max="100" step="0.01" defaultValue={current?.revenueSharePercent??75} className={inputClass}/></Field><Field label="Fixed monthly payout"><input name="fixedMonthlyPayout" type="number" min="0" step="0.01" className={inputClass}/></Field></div><div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]"><Field label="Terms snapshot"><input name="termsSnapshot" className={inputClass}/></Field><label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="allowableExpenseDeductions" defaultChecked={current?.allowableExpenseDeductions??true}/> Allow expense deductions</label></div><button disabled={busy} className={`${buttonPrimary} mt-4`}>{busy?<Loader2 className="animate-spin" size={16}/>:<UserRound size={16}/>}Save effective agreement</button></form>}
    <div><h4 className="mb-2 font-semibold text-slate-900">Ownership history</h4>{!twin.ownershipHistory?.length?<p className="text-sm text-slate-500">No historical agreements.</p>:<div className="space-y-2">{twin.ownershipHistory.map((h:any)=><div key={h.id} className="flex flex-wrap justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm"><div><p className="font-semibold">{h.owner?.name||h.ownerId}</p><p className="text-xs text-slate-500">{human(h.ownershipType)} · {date(h.startDate)} → {date(h.endDate)}</p></div><p className="font-medium">{number(h.revenueSharePercent)}%</p></div>)}</div>}</div>
  </div>;
}

function AvailabilityTab({vehicle,canOverride,canUpdate,busy,mutate,openAvailability}:{vehicle:any;canOverride:boolean;canUpdate:boolean;busy:boolean;mutate:(w:()=>Promise<ApiResponse<any>>)=>Promise<void>;openAvailability:()=>void}) {
  return <div className="space-y-5"><SectionTitle title="Availability & asset state" subtitle="Fleet state describes the asset. Reservation interval conflicts remain authoritative in the Availability engine." action={<button className={buttonSecondary} onClick={openAvailability}>Open Availability engine<ChevronRight size={15}/></button>}/>
    <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-medium text-slate-500">Lifecycle</p><div className="mt-2"><Badge value={vehicle.lifecycleStatus}/></div>{canOverride&&<StatusForm title="Change lifecycle" states={lifecycleStates} current={vehicle.lifecycleStatus} busy={busy} onSubmit={(status,reason)=>mutate(()=>apiClient.fleet.changeLifecycleStatus(vehicle.id,{status,reason,expectedVersion:vehicle.version}))}/>}</div><div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-medium text-slate-500">Availability</p><div className="mt-2"><Badge value={vehicle.availabilityStatus}/></div>{canOverride&&<StatusForm title="Override availability" states={availabilityStates} current={vehicle.availabilityStatus} busy={busy} onSubmit={(status,reason)=>mutate(()=>apiClient.fleet.changeAvailabilityStatus(vehicle.id,{status,reason,expectedVersion:vehicle.version}))}/>}</div></div>
    {canUpdate&&<div className="grid gap-4 lg:grid-cols-2"><TelemetryForm title="Record odometer" label="Odometer (km)" current={number(vehicle.odometer)} busy={busy} onSubmit={(value,notes)=>mutate(()=>apiClient.fleet.recordMileage(vehicle.id,{recordedMileage:value,source:"MANUAL_AUDIT",notes}))}/><TelemetryForm title="Record fuel level" label="Fuel level %" current={number(vehicle.fuelLevel)} max={100} busy={busy} onSubmit={(value)=>mutate(()=>apiClient.fleet.recordFuel(vehicle.id,{fuelLevel:value,source:"MANUAL_AUDIT"}))}/></div>}
  </div>;
}

function ComplianceTab({twin,records,readiness,canAttach,busy,mutate,openCompliance}:{twin:any;records:any[];readiness:any;canAttach:boolean;busy:boolean;mutate:(w:()=>Promise<ApiResponse<any>>)=>Promise<void>;openCompliance:()=>void}) {
  async function attach(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const d=new FormData(e.currentTarget);await mutate(()=>apiClient.fleet.addDocument(twin.vehicle.id,{documentType:d.get("documentType"),documentNumber:String(d.get("documentNumber")||"")||undefined,fileUrl:String(d.get("fileUrl")||"")||undefined,fileName:String(d.get("fileName")||"")||undefined,expiresAt:String(d.get("expiresAt")||"")||undefined}));(e.currentTarget as HTMLFormElement).reset();}
  return <div className="space-y-5"><SectionTitle title="Compliance & documents" subtitle="Fleet attachments, regulatory ComplianceRecords and readiness are shown separately." action={<button className={buttonSecondary} onClick={openCompliance}>Open Compliance<ChevronRight size={15}/></button>}/>
    <div className="rounded-2xl border border-slate-200 p-4"><h4 className="font-semibold text-slate-900">Rental-start readiness</h4>{readiness?<pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-slate-950 p-3 text-xs text-slate-200">{JSON.stringify(readiness,null,2)}</pre>:<p className="mt-2 text-sm text-slate-500">No readiness result available.</p>}</div>
    <ListBlock title="Regulatory records" rows={records} render={(r:any)=><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{human(r.requirementCode||r.documentType||"Compliance record")}</p><Badge value={r.status||r.verificationStatus}/></div><p className="text-xs text-slate-500">{r.documentNumber||r.id} · expires {date(r.expiresAt||r.expiryDate)}</p></div>}/>
    <ListBlock title="Fleet documents" rows={twin.documents||[]} render={(d:any)=><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{human(d.documentType)}</p><Badge value={d.status}/><Badge value={d.verificationStatus}/></div><p className="text-xs text-slate-500">{d.documentNumber||d.fileName||"No reference"} · expires {date(d.expiresAt)}</p></div>}/>
    {canAttach&&<form onSubmit={attach} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><h4 className="font-semibold">Attach Fleet document metadata</h4><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Type"><select name="documentType" className={inputClass}>{docTypes.map(t=><option key={t}>{t}</option>)}</select></Field><Field label="Document number"><input name="documentNumber" className={inputClass}/></Field><Field label="File name"><input name="fileName" className={inputClass}/></Field><Field label="File URL/reference"><input name="fileUrl" className={inputClass}/></Field><Field label="Expiry"><input name="expiresAt" type="date" className={inputClass}/></Field></div><button disabled={busy} className={`${buttonPrimary} mt-4`}><ShieldCheck size={16}/>Attach document</button></form>}
  </div>;
}

function MaintenanceTab({rows,openMaintenance}:{rows:any[];openMaintenance:()=>void}) {
  return <div className="space-y-5"><SectionTitle title="Maintenance" subtitle="Vehicle-specific work orders are visible here; execution remains in the Maintenance workspace." action={<button className={buttonSecondary} onClick={openMaintenance}>Open Maintenance<ChevronRight size={15}/></button>}/><ListBlock title="Work orders" rows={rows} render={(r:any)=><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap gap-2"><p className="font-semibold">{r.workOrderNumber||r.title||human(r.maintenanceType)||"Maintenance work order"}</p><Badge value={r.status}/></div><p className="text-xs text-slate-500">{human(r.priority)} · {r.description||r.reason||"No description"}</p></div><p className="text-xs text-slate-500">{date(r.scheduledStart||r.scheduledDate||r.createdAt)}</p></div>}/></div>;
}

function InspectionTab({inspections,damages,openInspections}:{inspections:any[];damages:any[];openInspections:()=>void}) {
  return <div className="space-y-5"><SectionTitle title="Inspections & damage history" subtitle="Condition evidence stays in the Inspection bounded context." action={<button className={buttonSecondary} onClick={openInspections}>Open Inspections<ChevronRight size={15}/></button>}/><ListBlock title="Recent inspections" rows={inspections} render={(r:any)=><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex gap-2"><p className="font-semibold">{r.inspectionNumber||human(r.inspectionType||r.type)||"Inspection"}</p><Badge value={r.status}/></div><p className="text-xs text-slate-500">{date(r.completedAt||r.createdAt)} · {number(r.odometer)} km</p></div></div>}/><ListBlock title="Damage cases" rows={damages} render={(r:any)=><div><div className="flex flex-wrap gap-2"><p className="font-semibold">{r.caseNumber||r.title||"Damage case"}</p><Badge value={r.status}/><Badge value={r.severity}/></div><p className="text-xs text-slate-500">{r.description||r.bodyZone||r.id}</p></div>}/></div>;
}

function MediaTab({vehicle,documents,canUpdate,busy,mutate}:{vehicle:any;documents:any[];canUpdate:boolean;busy:boolean;mutate:(w:()=>Promise<ApiResponse<any>>)=>Promise<void>}) {
  async function save(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const d=new FormData(e.currentTarget);await mutate(()=>apiClient.fleet.updateVehicle(vehicle.id,{imageUrl:String(d.get("imageUrl")||""),expectedVersion:vehicle.version}));}
  return <div className="space-y-5"><SectionTitle title="Media" subtitle="The current Fleet contract persists one primary image plus document/File references; a client-only gallery is intentionally not invented."/><div className="grid gap-5 lg:grid-cols-[320px_1fr]"><div>{vehicle.imageUrl?<img src={vehicle.imageUrl} alt={`${vehicle.make} ${vehicle.model}`} className="aspect-[4/3] w-full rounded-2xl object-cover"/>:<div className="grid aspect-[4/3] place-items-center rounded-2xl bg-slate-100 text-slate-400"><ImageIcon size={32}/></div>}</div><div>{canUpdate&&<form onSubmit={save}><Field label="Primary image URL"><input name="imageUrl" type="url" defaultValue={vehicle.imageUrl||""} className={inputClass}/></Field><button disabled={busy} className={`${buttonPrimary} mt-3`}><ImageIcon size={16}/>Save primary image</button></form>}<div className="mt-5"><p className="mb-2 text-sm font-semibold">Attached Fleet documents</p><p className="text-sm text-slate-500">{documents.length} attachment record{documents.length===1?"":"s"} linked to this vehicle.</p></div></div></div></div>;
}

function HistoryTab({twin}:{twin:any}) {
  return <div className="space-y-6"><SectionTitle title="Vehicle activity history" subtitle="Lifecycle, availability and telemetry history from persisted server records."/><ListBlock title="Status history" rows={twin.statusHistory||[]} render={(r:any)=><div><div className="flex flex-wrap gap-2"><Badge value={r.newLifecycleStatus}/><Badge value={r.newAvailabilityStatus}/></div><p className="mt-1 text-xs text-slate-500">{date(r.timestamp)} · {r.actorName||"System"} · {r.reason||"No reason recorded"}</p></div>}/><ListBlock title="Mileage history" rows={twin.recentMileage||[]} render={(r:any)=><div className="flex justify-between gap-3"><div><p className="font-semibold">{number(r.recordedMileage).toLocaleString()} km</p><p className="text-xs text-slate-500">{human(r.source)} · {r.notes||"No notes"}</p></div><p className="text-xs text-slate-500">{date(r.recordedAt)}</p></div>}/><ListBlock title="Fuel history" rows={twin.recentFuel||[]} render={(r:any)=><div className="flex justify-between gap-3"><div><p className="font-semibold">{number(r.fuelLevelPercent)}%</p><p className="text-xs text-slate-500">{r.source||"Recorded fuel level"}</p></div><p className="text-xs text-slate-500">{date(r.recordedAt)}</p></div>}/></div>;
}

function EditVehicleDialog({vehicle,onClose,onSave}:{vehicle:any;onClose:()=>void;onSave:(payload:any)=>Promise<void>}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError("");const d=new FormData(e.currentTarget);try{await onSave({make:String(d.get("make")),model:String(d.get("model")),year:number(d.get("year")),category:String(d.get("category")),color:String(d.get("color")||"")||undefined,vin:String(d.get("vin")||"").toUpperCase(),dailyRate:number(d.get("dailyRate")),transmission:String(d.get("transmission")),seats:number(d.get("seats")),fuelType:String(d.get("fuelType")),currentLocation:String(d.get("currentLocation")||"")||undefined,isPublishedToWebsite:d.get("isPublishedToWebsite")==="on",insuranceExpiryDate:String(d.get("insuranceExpiryDate")||"")||undefined,inspectionExpiryDate:String(d.get("inspectionExpiryDate")||"")||undefined,allowedDailyKm:number(d.get("allowedDailyKm")),excessKmRate:number(d.get("excessKmRate"))});}catch(e:any){setError(e.message);}finally{setBusy(false);}}
  return <Modal title="Edit vehicle asset" subtitle="Update canonical Fleet fields. Registration identity remains unchanged in this workflow." onClose={onClose}>{error&&<ErrorBox text={error}/>}<form onSubmit={submit} className="grid gap-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="Make"><input name="make" defaultValue={vehicle.make} className={inputClass}/></Field><Field label="Model"><input name="model" defaultValue={vehicle.model} className={inputClass}/></Field><Field label="Year"><input name="year" type="number" defaultValue={vehicle.year} className={inputClass}/></Field><Field label="Category"><select name="category" defaultValue={vehicle.category} className={inputClass}>{categories.map(c=><option key={c}>{c}</option>)}</select></Field><Field label="VIN"><input name="vin" defaultValue={vehicle.vin} className={inputClass}/></Field><Field label="Color"><input name="color" defaultValue={vehicle.color||""} className={inputClass}/></Field><Field label="Daily-rate reference"><input name="dailyRate" type="number" step="0.01" defaultValue={vehicle.dailyRate} className={inputClass}/></Field><Field label="Transmission"><select name="transmission" defaultValue={vehicle.transmission} className={inputClass}><option>AUTOMATIC</option><option>MANUAL</option><option>Automatic</option><option>Manual</option></select></Field><Field label="Seats"><input name="seats" type="number" defaultValue={vehicle.seats} className={inputClass}/></Field><Field label="Fuel type"><select name="fuelType" defaultValue={vehicle.fuelType} className={inputClass}><option>PETROL</option><option>DIESEL</option><option>HYBRID</option><option>ELECTRIC</option><option>Petrol</option><option>Diesel</option><option>Hybrid</option><option>Electric</option></select></Field><Field label="Location"><input name="currentLocation" defaultValue={vehicle.currentLocation||""} className={inputClass}/></Field><Field label="Allowed daily km"><input name="allowedDailyKm" type="number" defaultValue={vehicle.allowedDailyKm||0} className={inputClass}/></Field><Field label="Excess km rate"><input name="excessKmRate" type="number" step="0.01" defaultValue={vehicle.excessKmRate||0} className={inputClass}/></Field><Field label="Insurance expiry"><input name="insuranceExpiryDate" type="date" defaultValue={vehicle.insuranceExpiryDate?.slice(0,10)||""} className={inputClass}/></Field><Field label="Inspection expiry"><input name="inspectionExpiryDate" type="date" defaultValue={vehicle.inspectionExpiryDate?.slice(0,10)||""} className={inputClass}/></Field></div><label className="flex items-center gap-2 text-sm"><input name="isPublishedToWebsite" type="checkbox" defaultChecked={vehicle.isPublishedToWebsite}/> Published to website</label><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={buttonSecondary}>Cancel</button><button disabled={busy} className={buttonPrimary}>{busy?<Loader2 className="animate-spin" size={16}/>:null}Save changes</button></div></form></Modal>;
}

function StatusForm({title,states,current,busy,onSubmit}:{title:string;states:string[];current:string;busy:boolean;onSubmit:(status:string,reason:string)=>Promise<void>}) {
  const [state,setState]=useState(current);const [reason,setReason]=useState("");
  return <form onSubmit={e=>{e.preventDefault();void onSubmit(state,reason);}} className="mt-4 grid gap-2"><p className="text-xs font-semibold text-slate-700">{title}</p><select value={state} onChange={e=>setState(e.target.value)} className={inputClass}>{states.map(s=><option key={s} value={s}>{human(s)}</option>)}</select><input value={reason} onChange={e=>setReason(e.target.value)} className={inputClass} placeholder="Reason / operational note"/><button disabled={busy||state===current} className={buttonSecondary}>Apply server transition</button></form>;
}
function TelemetryForm({title,label,current,max,busy,onSubmit}:{title:string;label:string;current:number;max?:number;busy:boolean;onSubmit:(value:number,notes:string)=>Promise<void>}) {
  const [value,setValue]=useState(String(current));const [notes,setNotes]=useState("");
  return <form onSubmit={e=>{e.preventDefault();void onSubmit(number(value),notes);}} className="rounded-2xl border border-slate-200 p-4"><h4 className="font-semibold">{title}</h4><div className="mt-3 grid gap-2"><Field label={label}><input type="number" min="0" max={max} value={value} onChange={e=>setValue(e.target.value)} className={inputClass}/></Field>{title.includes("odometer")&&<Field label="Notes"><input value={notes} onChange={e=>setNotes(e.target.value)} className={inputClass}/></Field>}<button disabled={busy} className={buttonSecondary}>Record</button></div></form>;
}
function InfoCard({label,value}:{label:string;value:string}) {return <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{value}</p></div>;}
function SectionTitle({title,subtitle,action}:{title:string;subtitle:string;action?:React.ReactNode}) {return <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-lg font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>{action}</div>;}
function FormSection({title,children}:{title:string;children:React.ReactNode}) {return <section className="rounded-2xl border border-slate-200 p-4"><h3 className="mb-3 text-sm font-bold text-slate-900">{title}</h3>{children}</section>;}
function ListBlock({title,rows,render}:{title:string;rows:any[];render:(row:any)=>React.ReactNode}) {return <section><h4 className="mb-2 font-semibold text-slate-900">{title} <span className="text-xs font-normal text-slate-400">({rows.length})</span></h4>{!rows.length?<p className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">No records.</p>:<div className="space-y-2">{rows.map((row:any,i)=><div key={row.id||i} className="rounded-xl border border-slate-200 p-3 text-sm">{render(row)}</div>)}</div>}</section>;}
function ErrorBox({text}:{text:string}) {return <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><span>{text}</span></div>;}
function Modal({title,subtitle,onClose,children}:{title:string;subtitle:string;onClose:()=>void;children:React.ReactNode}) {return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-3 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="max-h-[94vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6"><div><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div><button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X size={18}/></button></div><div className="max-h-[calc(94vh-82px)] overflow-y-auto p-5 sm:p-6">{children}</div></div></div>;}
