import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Fuel,
  Gauge,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { useApp } from "../lib/store";
import { apiClient } from "../lib/api-client";

function human(value?:string|null){return value?value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase()):"—";}
function dateTime(value?:string|null){if(!value)return "—";const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString():"—";}
function statusClass(status?:string){return status==="COMPLETED"?"bg-emerald-100 text-emerald-800":status==="IN_PROGRESS"?"bg-blue-100 text-blue-800":status==="VOIDED"?"bg-rose-100 text-rose-800":"bg-slate-100 text-slate-700";}

export const InspectionsView: React.FC = () => {
  const {
    vehicles,
    customers,
    drivers,
    activeTenant,
    setIsInspectionModalOpen,
    setInspectionTarget,
  } = useApp();
  const [inspections,setInspections]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [selected,setSelected]=useState<any|null>(null);
  const [detailLoading,setDetailLoading]=useState(false);

  const vehicleById=useMemo(()=>new Map(vehicles.map((v:any)=>[v.id,v])),[vehicles]);
  const customerById=useMemo(()=>new Map(customers.map((v:any)=>[v.id,v])),[customers]);
  const driverById=useMemo(()=>new Map(drivers.map((v:any)=>[v.id,v])),[drivers]);

  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{
      const result=await apiClient.inspections.listInspections({limit:100});
      if(result.error)throw new Error(result.error.message);
      setInspections(result.data||[]);
    }catch(e:any){setError(e.message||"Unable to load inspections.");}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{void load();const handler=()=>void load();window.addEventListener("sage:inspection-saved",handler);return()=>window.removeEventListener("sage:inspection-saved",handler);},[load]);

  async function openReport(id:string){
    setDetailLoading(true);setError("");
    try{
      const result=await apiClient.inspections.getInspection(id);
      if(result.error)throw new Error(result.error.message);
      setSelected(result.data);
    }catch(e:any){setError(e.message||"Unable to load inspection report.");}
    finally{setDetailLoading(false);}
  }

  function launch(){
    setInspectionTarget(null);
    setIsInspectionModalOpen(true);
  }

  return <div id="inspections-view" className="mx-auto max-w-7xl space-y-6 p-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Vehicle condition</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Inspections & condition reports</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">Pre-rental inspections are completed before key handover. Return inspections are completed immediately after the vehicle is received and before damage/final-charge assessment.</p>
      </div>
      <button onClick={launch} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16}/>Launch inspection</button>
    </header>

    {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}

    {loading?<div className="grid place-items-center rounded-2xl border bg-white p-20 text-slate-500"><Loader2 className="mb-3 animate-spin"/>Loading inspection records…</div>:
    !inspections.length?<div className="grid place-items-center rounded-2xl border border-dashed bg-white p-20 text-center"><ClipboardCheck className="text-slate-300"/><h2 className="mt-3 font-bold">No inspection reports yet</h2><p className="mt-1 text-sm text-slate-500">Create a pre-rental inspection before Handover or a return inspection after receiving a rental.</p></div>:
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{inspections.map((insp:any)=>{
      const vehicle:any=vehicleById.get(insp.vehicleId);
      const customer:any=customerById.get(insp.customerId);
      const driver:any=driverById.get(insp.driverId);
      const defects=insp.damageObservations||[];
      return <article key={insp.id} className="flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-sm">
        <div>
          <div className="flex items-start justify-between gap-3"><div><span className={"rounded-full px-2 py-1 text-[10px] font-bold "+statusClass(insp.status)}>{human(insp.status)}</span><h3 className="mt-2 font-bold">{vehicle?`${vehicle.registrationPlate} · ${vehicle.make} ${vehicle.model}`:insp.vehicleId}</h3><p className="mt-1 text-xs text-slate-500">{human(insp.inspectionType)} · {insp.inspectionNumber}</p></div><p className="text-[11px] text-slate-400">{dateTime(insp.completedAt||insp.createdAt)}</p></div>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs"><p><Gauge className="mr-1 inline h-3.5 w-3.5"/>{Number(insp.odometer||0).toLocaleString()} km</p><p><Fuel className="mr-1 inline h-3.5 w-3.5"/>{insp.fuelLevel}% fuel</p></div>
          <div className="mt-4 space-y-1 text-xs"><p><span className="text-slate-500">Customer:</span> <strong>{customer?.fullName||"Not linked"}</strong></p><p><span className="text-slate-500">Driver:</span> <strong>{driver?.fullName||customer?.fullName||"Not linked"}</strong></p><p><span className="text-slate-500">Defects:</span> <strong>{defects.length}</strong></p></div>
          {defects.length>0&&<div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="flex items-center gap-1 text-xs font-bold text-amber-900"><AlertTriangle size={13}/>{defects.length} defect{defects.length===1?"":"s"} recorded</p></div>}
        </div>
        <button disabled={detailLoading} onClick={()=>void openReport(insp.id)} className="mt-5 inline-flex items-center justify-between border-t pt-4 text-sm font-semibold text-emerald-700"><span>View full report</span><ChevronRight size={16}/></button>
      </article>;
    })}</div>}

    {selected&&<InspectionReportModal inspection={selected} vehicle={vehicleById.get(selected.vehicleId)} customer={customerById.get(selected.customerId)} driver={driverById.get(selected.driverId)} currencySymbol={activeTenant.currencySymbol||activeTenant.currency||"KES"} onClose={()=>setSelected(null)}/>}
  </div>;
};

function InspectionReportModal({inspection,vehicle,customer,driver,currencySymbol,onClose}:{inspection:any;vehicle:any;customer:any;driver:any;currencySymbol:string;onClose:()=>void}){
  const damages=inspection.damageObservations||[];
  return <div className="fixed inset-0 z-50 bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
    <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-600">Certified condition report</p><h2 className="mt-1 text-xl font-bold">{inspection.inspectionNumber} · {human(inspection.inspectionType)}</h2><p className="mt-1 text-sm text-slate-500">{vehicle?`${vehicle.registrationPlate} · ${vehicle.make} ${vehicle.model}`:inspection.vehicleId}</p></div><button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100"><X size={19}/></button></header>
      <main className="flex-1 space-y-6 overflow-y-auto p-5">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><ReportMetric label="Status" value={human(inspection.status)}/><ReportMetric label="Odometer" value={Number(inspection.odometer||0).toLocaleString()+" km"}/><ReportMetric label="Fuel" value={(inspection.fuelLevel??0)+"%"}/><ReportMetric label="Condition" value={human(inspection.overallCondition)}/></section>
        <section className="rounded-2xl border p-5"><h3 className="font-bold">People & rental context</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><ReportMetric label="Customer" value={customer?.fullName||inspection.customerId||"Not linked"}/><ReportMetric label="Primary driver" value={driver?.fullName||inspection.driverId||"Not linked"}/><ReportMetric label="Booking" value={inspection.bookingId||"Not linked"}/><ReportMetric label="Rental" value={inspection.rentalId||"Not linked"}/></div></section>
        <section className="rounded-2xl border p-5"><div className="flex items-center justify-between"><h3 className="font-bold">Defects & damage observations</h3><span className="text-sm font-semibold">{damages.length}</span></div>{!damages.length?<p className="mt-3 text-sm text-slate-500">No defects were recorded.</p>:<div className="mt-4 space-y-3">{damages.map((d:any)=><div key={d.id} className="rounded-xl bg-rose-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-rose-900">{human(d.bodyZone)} · {human(d.damageType)}</p><p className="mt-1 text-sm text-rose-800">{d.description}</p></div><span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-rose-700">{human(d.severity)}</span></div><p className="mt-2 text-xs text-rose-700">Estimated repair: {currencySymbol} {Number(d.estimatedCost||d.estimatedRepairCost||0).toLocaleString()} · {d.preExisting?"Pre-existing":"Observed during rental/return"}</p></div>)}</div>}</section>
        <section className="rounded-2xl border p-5"><h3 className="font-bold">Checklist</h3>{!(inspection.responses||[]).length?<p className="mt-3 text-sm text-slate-500">No checklist responses were stored.</p>:<div className="mt-4 grid gap-2 sm:grid-cols-2">{inspection.responses.map((r:any)=><div key={r.id||r.itemCode} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs"><span>{human(r.itemCode)}</span><span className={r.condition==="GOOD"?"font-bold text-emerald-700":"font-bold text-amber-700"}>{human(r.condition)||String(r.responseValue)}</span></div>)}</div>}</section>
        <section className="rounded-2xl border p-5"><h3 className="font-bold">Audit details</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><ReportMetric label="Started" value={dateTime(inspection.startedAt)}/><ReportMetric label="Completed" value={dateTime(inspection.completedAt)}/><ReportMetric label="Notes" value={inspection.notes||"—"}/><ReportMetric label="Record version" value={"v"+inspection.version}/></div></section>
      </main>
      <footer className="flex items-center justify-between border-t p-5"><p className="flex items-center gap-2 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14}/>Server-backed inspection record</p><button onClick={onClose} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Close report</button></footer>
    </div>
  </div>;
}
function ReportMetric({label,value}:{label:string;value:any}){return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{value??"—"}</p></div>;}
