import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Car, ChevronRight, Fuel, Gauge, Image as ImageIcon, Plus, RefreshCw, Search, ShieldCheck, Wrench, X } from 'lucide-react';
import type { Vehicle, VehicleDigitalTwin } from '@carhire/types';
import { apiClient, type ApiResponse } from '../../lib/api-client';
import { permits, type AccessPortal } from '../../lib/access-context';

type Props = { portal: AccessPortal; onNavigate: (section: string) => void };
type Tab = 'overview'|'ownership'|'availability'|'compliance'|'maintenance'|'inspections'|'media'|'history';
type Related = { owners:any[]; maintenance:any[]; schedules:any[]; due:any[]; compliance:any[]; readiness:any; inspections:any[]; damage:any[] };

const lifecycle = ['DRAFT','PENDING_VERIFICATION','ACTIVE','SUSPENDED','INACTIVE','SOLD','RETIRED'];
const availability = ['AVAILABLE','RESERVED','ON_RENT','MAINTENANCE','BLOCKED'];
const fallbackCategories = ['SUV','Sedan','4x4 Offroad','Luxury','Hatchback','Van/Bus'];
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';

function unwrap<T>(result:ApiResponse<T>):T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}
function text(v:any){ return v === null || v === undefined || v === '' ? '—' : String(v); }
function date(v:any){ return v ? new Date(v).toLocaleDateString() : '—'; }
function statusClass(status:string) {
  if (['ACTIVE','AVAILABLE','VALID','VERIFIED','COMPLETED'].includes(status)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (['RESERVED','PENDING','PENDING_VERIFICATION','SCHEDULED'].includes(status)) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (['ON_RENT','IN_PROGRESS'].includes(status)) return 'bg-blue-50 text-blue-700 border-blue-200';
  if (['SUSPENDED','BLOCKED','EXPIRED','REJECTED','RETIRED'].includes(status)) return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}
function Badge({children}:{children:any}) {
  const s=String(children||'UNKNOWN');
  return <span className={'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold '+statusClass(s)}>{s.replaceAll('_',' ')}</span>;
}
function Kpi({label,value}:{label:string;value:any}) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>;
}
function Field({label,children}:{label:string;children:React.ReactNode}) {
  return <label className="space-y-1 text-xs font-semibold text-slate-600"><span>{label}</span>{children}</label>;
}

export default function FleetExperience({portal,onNavigate}:Props) {
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [total,setTotal]=useState(0);
  const [categories,setCategories]=useState<any[]>([]);
  const [related,setRelated]=useState<Related>({owners:[],maintenance:[],schedules:[],due:[],compliance:[],readiness:null,inspections:[],damage:[]});
  const [loading,setLoading]=useState(true);
  const [profileLoading,setProfileLoading]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [search,setSearch]=useState('');
  const [life,setLife]=useState('');
  const [avail,setAvail]=useState('');
  const [category,setCategory]=useState('');
  const [selectedId,setSelectedId]=useState('');
  const [twin,setTwin]=useState<VehicleDigitalTwin|null>(null);
  const [tab,setTab]=useState<Tab>('overview');
  const [formMode,setFormMode]=useState<'create'|'edit'|null>(null);
  const [busy,setBusy]=useState(false);
  const seq=useRef(0);

  const can=(permission:string)=>permits(portal,permission);
  const canNav=(section:string)=>portal.sections.some(item=>item.id===section);

  async function loadVehicles() {
    const request=++seq.current;
    setLoading(true); setError('');
    try {
      const result=await apiClient.fleet.listVehicles({
        ...(search.trim()?{search:search.trim()}:{}),
        ...(life?{lifecycleStatus:life}:{}),
        ...(avail?{availabilityStatus:avail}:{}),
        ...(category?{category}:{}),
        limit:100,
      });
      if(request!==seq.current)return;
      setVehicles(unwrap<any[]>(result) as Vehicle[]);
      setTotal(result.meta?.total ?? result.data?.length ?? 0);
    } catch(e:any) {
      if(request===seq.current)setError(e.message);
    } finally {
      if(request===seq.current)setLoading(false);
    }
  }

  async function loadReferenceData() {
    const cats=await apiClient.fleet.getCategories();
    if(!cats.error)setCategories(cats.data||[]);
    if(can('vehicle_owner.read')) {
      const owners=await apiClient.vehicleOwners.listOwners();
      if(!owners.error)setRelated(prev=>({...prev,owners:owners.data||[]}));
    }
  }

  async function loadProfile(id:string) {
    const request=++seq.current;
    setSelectedId(id); setTab('overview'); setProfileLoading(true); setError('');
    try {
      const profile=unwrap<VehicleDigitalTwin>(await apiClient.fleet.getDigitalTwin(id));
      const reads=await Promise.all([
        can('vehicle_owner.read') ? apiClient.vehicleOwners.listOwners() : Promise.resolve({data:[]} as any),
        can('maintenance.read') ? apiClient.maintenance.listWorkOrders({vehicleId:id}) : Promise.resolve({data:[]} as any),
        can('maintenance.read') ? apiClient.get('/maintenance/schedules?vehicleId='+encodeURIComponent(id)) : Promise.resolve({data:[]} as any),
        can('maintenance.read') ? apiClient.get('/maintenance/due-evaluations?vehicleId='+encodeURIComponent(id)) : Promise.resolve({data:[]} as any),
        can('compliance.read') ? apiClient.compliance.listRecords({subjectType:'VEHICLE',subjectId:id}) : Promise.resolve({data:[]} as any),
        can('compliance.read') ? apiClient.compliance.getVehicleReadiness(id) : Promise.resolve({data:null} as any),
        can('inspection.read') ? apiClient.inspections.listInspections({vehicleId:id}) : Promise.resolve({data:[]} as any),
        can('inspection.read') ? apiClient.inspections.listDamageCases({vehicleId:id}) : Promise.resolve({data:[]} as any),
      ]);
      if(request!==seq.current)return;
      setTwin(profile);
      setRelated({
        owners:reads[0].error?[]:reads[0].data||[],
        maintenance:reads[1].error?[]:reads[1].data||[],
        schedules:reads[2].error?[]:reads[2].data||[],
        due:reads[3].error?[]:reads[3].data||[],
        compliance:reads[4].error?[]:reads[4].data||[],
        readiness:reads[5].error?null:reads[5].data,
        inspections:reads[6].error?[]:reads[6].data||[],
        damage:reads[7].error?[]:reads[7].data||[],
      });
    } catch(e:any){ if(request===seq.current)setError(e.message); }
    finally{ if(request===seq.current)setProfileLoading(false); }
  }

  useEffect(()=>{void loadReferenceData();},[portal.id]);
  useEffect(()=>{const t=setTimeout(()=>void loadVehicles(),search?250:0);return()=>clearTimeout(t);},[portal.id,search,life,avail,category]);
  useEffect(()=>()=>{seq.current++;},[portal.id]);

  const stats=useMemo(()=>({
    available:vehicles.filter(v=>v.availabilityStatus==='AVAILABLE').length,
    reserved:vehicles.filter(v=>v.availabilityStatus==='RESERVED').length,
    onRent:vehicles.filter(v=>v.availabilityStatus==='ON_RENT').length,
    attention:vehicles.filter(v=>['MAINTENANCE','BLOCKED'].includes(v.availabilityStatus)||v.lifecycleStatus!=='ACTIVE').length,
  }),[vehicles]);

  async function mutate(work:()=>Promise<ApiResponse<any>>,success:string,refresh=true) {
    setBusy(true); setError(''); setNotice('');
    try {
      unwrap(await work());
      setNotice(success);
      await loadVehicles();
      if(refresh&&selectedId)await loadProfile(selectedId);
    } catch(e:any){ setError(e.message); }
    finally{ setBusy(false); }
  }

  const categoryOptions=categories.length?categories.map(c=>c.code||c.name):fallbackCategories;

  return <div className="min-h-full bg-slate-50">
    <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600">Fleet operations</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Fleet Asset Inventory</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Vehicle identity, ownership, readiness and operating state from the Sage-Auto backend.</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={()=>void loadVehicles()} className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold text-slate-700"><RefreshCw size={16}/>Refresh</button>{can('vehicle.create')&&<button onClick={()=>setFormMode('create')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm"><Plus size={16}/>Register vehicle</button>}</div>
      </header>

      {(error||notice)&&<div role={error?'alert':'status'} className={'rounded-xl border px-4 py-3 text-sm '+(error?'border-rose-200 bg-rose-50 text-rose-800':'border-emerald-200 bg-emerald-50 text-emerald-800')}>{error||notice}</div>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Kpi label="Fleet records" value={total}/><Kpi label="Available" value={stats.available}/><Kpi label="Reserved" value={stats.reserved}/><Kpi label="On rent" value={stats.onRent}/><Kpi label="Needs attention" value={stats.attention}/></section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="relative xl:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search registration, make, model or VIN" className={inputClass+' pl-9'}/></label>
        <select value={life} onChange={e=>setLife(e.target.value)} className={inputClass}><option value="">All lifecycle states</option>{lifecycle.map(s=><option key={s}>{s}</option>)}</select>
        <select value={avail} onChange={e=>setAvail(e.target.value)} className={inputClass}><option value="">All availability</option>{availability.map(s=><option key={s}>{s}</option>)}</select>
        <select value={category} onChange={e=>setCategory(e.target.value)} className={inputClass}><option value="">All categories</option>{categoryOptions.map((s:any)=><option key={s}>{s}</option>)}</select>
      </div></section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading?<p className="p-10 text-center text-sm text-slate-500" role="status">Loading fleet from Sage-Auto…</p>:!vehicles.length?<div className="p-12 text-center"><Car className="mx-auto h-10 w-10 text-slate-300"/><h2 className="mt-3 font-bold text-slate-900">No vehicles match this view</h2><p className="mt-1 text-sm text-slate-500">{search||life||avail||category?'Clear filters to see the rest of the fleet.':'Register the first vehicle to start this workspace.'}</p></div>:<>
          <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">Vehicle</th><th className="px-4 py-3">Lifecycle</th><th className="px-4 py-3">Availability</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Odometer</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{vehicles.map(v=><tr key={v.id} className="hover:bg-slate-50/70"><td className="px-5 py-4"><div className="flex items-center gap-3">{v.imageUrl?<img src={v.imageUrl} alt="" className="h-11 w-16 rounded-lg object-cover"/>:<div className="flex h-11 w-16 items-center justify-center rounded-lg bg-slate-100"><Car size={20}/></div>}<div><strong>{v.registrationPlate}</strong><p className="text-xs text-slate-500">{v.year} {v.make} {v.model} · {v.category}</p></div></div></td><td className="px-4 py-4"><Badge>{v.lifecycleStatus}</Badge></td><td className="px-4 py-4"><Badge>{v.availabilityStatus}</Badge></td><td className="px-4 py-4 text-slate-600">{text(v.currentLocation)}</td><td className="px-4 py-4 font-mono text-xs">{v.odometer.toLocaleString()} km</td><td className="px-4 py-4"><button onClick={()=>void loadProfile(v.id)} className="inline-flex items-center gap-1 font-semibold text-emerald-700">Asset profile<ChevronRight size={15}/></button></td></tr>)}</tbody></table></div>
          <div className="divide-y md:hidden">{vehicles.map(v=><button key={v.id} onClick={()=>void loadProfile(v.id)} className="block w-full p-4 text-left"><div className="flex gap-3">{v.imageUrl?<img src={v.imageUrl} alt="" className="h-20 w-24 rounded-xl object-cover"/>:<div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-xl bg-slate-100"><Car/></div>}<div className="min-w-0 flex-1"><strong>{v.registrationPlate}</strong><p className="truncate text-xs text-slate-500">{v.year} {v.make} {v.model}</p><div className="mt-2 flex flex-wrap gap-1"><Badge>{v.lifecycleStatus}</Badge><Badge>{v.availabilityStatus}</Badge></div><p className="mt-2 text-xs text-slate-500">{text(v.currentLocation)} · {v.odometer.toLocaleString()} km</p></div><ChevronRight size={17}/></div></button>)}</div>
        </>}
      </section>
    </div>

    {formMode&&<VehicleForm mode={formMode} vehicle={formMode==='edit'?twin?.vehicle:null} categories={categoryOptions} owners={related.owners} busy={busy} onClose={()=>setFormMode(null)} onSubmit={async dto=>{
      if(formMode==='create')await mutate(()=>apiClient.fleet.createVehicle(dto),'Vehicle registered.',false);
      else if(twin)await mutate(()=>apiClient.fleet.updateVehicle(twin.vehicle.id,{...dto,expectedVersion:twin.vehicle.version}),'Vehicle updated.');
      setFormMode(null);
    }}/>}

    {selectedId&&<AssetProfile twin={twin} related={related} loading={profileLoading} tab={tab} setTab={setTab} busy={busy} can={can} canNav={canNav} onNavigate={onNavigate} onClose={()=>{setSelectedId('');setTwin(null);}} onEdit={()=>setFormMode('edit')} onRefresh={()=>void loadProfile(selectedId)} onMutation={mutate}/>}
  </div>;
}

function VehicleForm({mode,vehicle,categories,owners,busy,onClose,onSubmit}:{mode:'create'|'edit';vehicle:any;categories:any[];owners:any[];busy:boolean;onClose:()=>void;onSubmit:(dto:any)=>Promise<void>}) {
  const [features,setFeatures]=useState((vehicle?.features||[]).join(', '));
  return <div className="fixed inset-0 z-50 bg-slate-950/45 sm:p-6" role="dialog" aria-modal="true"><div className="ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl sm:rounded-2xl">
    <header className="flex items-start justify-between border-b p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-600">{mode==='create'?'Fleet registration':'Asset update'}</p><h2 className="text-xl font-bold">{mode==='create'?'Register vehicle':'Edit '+vehicle?.registrationPlate}</h2></div><button onClick={onClose} aria-label="Close"><X/></button></header>
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));const dto:any={
      ...(mode==='create'?{registrationPlate:String(d.registrationPlate).trim().toUpperCase()}:{}),
      make:String(d.make).trim(),model:String(d.model).trim(),year:Number(d.year),category:String(d.category),dailyRate:Number(d.dailyRate),
      color:String(d.color||'')||undefined,vin:String(d.vin||'')||undefined,odometer:Number(d.odometer||0),fuelLevel:Number(d.fuelLevel||100),
      transmission:String(d.transmission),seats:Number(d.seats||5),fuelType:String(d.fuelType),features:features.split(',').map(x=>x.trim()).filter(Boolean),
      imageUrl:String(d.imageUrl||'')||undefined,currentLocation:String(d.currentLocation||'')||undefined,isPublishedToWebsite:d.isPublishedToWebsite==='on',
      insuranceExpiryDate:String(d.insuranceExpiryDate||'')||undefined,inspectionExpiryDate:String(d.inspectionExpiryDate||'')||undefined,
      allowedDailyKm:Number(d.allowedDailyKm||250),excessKmRate:Number(d.excessKmRate||0),
      ...(mode==='create'&&d.ownerId?{ownerId:String(d.ownerId),ownershipType:String(d.ownershipType),revenueSharePercent:Number(d.revenueSharePercent||75)}:{})
    };void onSubmit(dto);}}>
      <div className="grid flex-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
        {mode==='create'&&<Field label="Registration plate *"><input required name="registrationPlate" className={inputClass}/></Field>}
        <Field label="Make *"><input required name="make" defaultValue={vehicle?.make} className={inputClass}/></Field>
        <Field label="Model *"><input required name="model" defaultValue={vehicle?.model} className={inputClass}/></Field>
        <Field label="Year *"><input required min="1950" max="2100" type="number" name="year" defaultValue={vehicle?.year||new Date().getFullYear()} className={inputClass}/></Field>
        <Field label="Category *"><select required name="category" defaultValue={vehicle?.category||categories[0]} className={inputClass}>{categories.map(c=><option key={c}>{c}</option>)}</select></Field>
        <Field label="Daily rate *"><input required min="0" step="0.01" type="number" name="dailyRate" defaultValue={vehicle?.dailyRate||0} className={inputClass}/></Field>
        <Field label="Transmission"><select name="transmission" defaultValue={vehicle?.transmission||'Automatic'} className={inputClass}><option>Automatic</option><option>Manual</option></select></Field>
        <Field label="Fuel type"><select name="fuelType" defaultValue={vehicle?.fuelType||'Petrol'} className={inputClass}><option>Petrol</option><option>Diesel</option><option>Hybrid</option><option>Electric</option></select></Field>
        <Field label="Seats"><input type="number" min="1" name="seats" defaultValue={vehicle?.seats||5} className={inputClass}/></Field>
        <Field label="Color"><input name="color" defaultValue={vehicle?.color||''} className={inputClass}/></Field>
        <Field label="VIN"><input name="vin" defaultValue={vehicle?.vin||''} className={inputClass}/></Field>
        <Field label="Current location"><input name="currentLocation" defaultValue={vehicle?.currentLocation||''} className={inputClass}/></Field>
        <Field label="Odometer (km)"><input type="number" min="0" name="odometer" defaultValue={vehicle?.odometer||0} className={inputClass}/></Field>
        <Field label="Fuel level %"><input type="number" min="0" max="100" name="fuelLevel" defaultValue={vehicle?.fuelLevel??100} className={inputClass}/></Field>
        <Field label="Daily km allowance"><input type="number" min="0" name="allowedDailyKm" defaultValue={vehicle?.allowedDailyKm||250} className={inputClass}/></Field>
        <Field label="Excess km rate"><input type="number" min="0" step="0.01" name="excessKmRate" defaultValue={vehicle?.excessKmRate||0} className={inputClass}/></Field>
        <Field label="Insurance expiry"><input type="date" name="insuranceExpiryDate" defaultValue={vehicle?.insuranceExpiryDate?.slice?.(0,10)||''} className={inputClass}/></Field>
        <Field label="Inspection expiry"><input type="date" name="inspectionExpiryDate" defaultValue={vehicle?.inspectionExpiryDate?.slice?.(0,10)||''} className={inputClass}/></Field>
        <Field label="Primary image URL"><input type="url" name="imageUrl" defaultValue={vehicle?.imageUrl||''} className={inputClass}/></Field>
        <Field label="Features (comma separated)"><input value={features} onChange={e=>setFeatures(e.target.value)} className={inputClass}/></Field>
        {mode==='create'&&owners.length>0&&<><Field label="Vehicle owner"><select name="ownerId" className={inputClass}><option value="">Company / assign later</option>{owners.map(o=><option value={o.id} key={o.id}>{o.name}</option>)}</select></Field><Field label="Ownership type"><select name="ownershipType" defaultValue="THIRD_PARTY_OWNED" className={inputClass}><option>COMPANY_OWNED</option><option>THIRD_PARTY_OWNED</option><option>LEASED</option><option>MANAGED</option><option>PARTNERSHIP</option></select></Field><Field label="Owner revenue share %"><input type="number" min="0" max="100" step="0.01" name="revenueSharePercent" defaultValue="75" className={inputClass}/></Field></>}
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" name="isPublishedToWebsite" defaultChecked={vehicle?.isPublishedToWebsite??true}/>Publish vehicle to website</label>
      </div>
      <footer className="flex justify-end gap-2 border-t p-4"><button type="button" onClick={onClose} className="rounded-xl border px-4 py-2 text-sm font-semibold">Cancel</button><button disabled={busy} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy?'Saving…':mode==='create'?'Register vehicle':'Save changes'}</button></footer>
    </form>
  </div></div>;
}

function AssetProfile({twin,related,loading,tab,setTab,busy,can,canNav,onNavigate,onClose,onEdit,onRefresh,onMutation}:{twin:VehicleDigitalTwin|null;related:Related;loading:boolean;tab:Tab;setTab:(tab:Tab)=>void;busy:boolean;can:(p:string)=>boolean;canNav:(s:string)=>boolean;onNavigate:(s:string)=>void;onClose:()=>void;onEdit:()=>void;onRefresh:()=>void;onMutation:(work:()=>Promise<ApiResponse<any>>,success:string,refresh?:boolean)=>Promise<void>}) {
  if(!twin&&loading)return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40"><div className="rounded-2xl bg-white p-6 shadow-xl">Loading asset profile…</div></div>;
  if(!twin)return null;
  const v=twin.vehicle;
  const tabs:Tab[]=['overview','ownership','availability','compliance','maintenance','inspections','media','history'];
  return <div className="fixed inset-0 z-50 bg-slate-950/45 sm:p-4" role="dialog" aria-modal="true"><div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl sm:rounded-2xl">
    <header className="border-b bg-slate-950 p-5 text-white"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 gap-4">{v.imageUrl?<img src={v.imageUrl} alt="" className="h-20 w-28 rounded-xl object-cover"/>:<div className="flex h-20 w-28 items-center justify-center rounded-xl bg-slate-800"><Car/></div>}<div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wider text-emerald-400">Vehicle asset profile</p><h2 className="truncate text-2xl font-bold">{v.registrationPlate} · {v.make} {v.model}</h2><p className="mt-1 text-sm text-slate-300">{v.year} · {v.category} · {text(v.currentLocation)}</p><div className="mt-2 flex flex-wrap gap-2"><Badge>{v.lifecycleStatus}</Badge><Badge>{v.availabilityStatus}</Badge></div></div></div><div className="flex gap-2">{can('vehicle.update')&&<button onClick={onEdit} className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold">Edit</button>}<button onClick={onRefresh} className="rounded-lg border border-slate-700 p-2" aria-label="Refresh"><RefreshCw size={17}/></button><button onClick={onClose} className="rounded-lg border border-slate-700 p-2" aria-label="Close"><X size={18}/></button></div></div></header>
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b bg-white p-2">{tabs.map(item=><button key={item} onClick={()=>setTab(item)} className={'whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold capitalize '+(tab===item?'bg-slate-900 text-white':'text-slate-600 hover:bg-slate-100')}>{item}</button>)}</nav>
    <main className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6">
      {loading&&<p role="status" className="mb-3 text-xs text-slate-500">Refreshing server state…</p>}
      {tab==='overview'&&<Overview twin={twin}/>}
      {tab==='ownership'&&<Ownership twin={twin} owners={related.owners} busy={busy} canManage={can('vehicle_ownership.manage')} onAssign={dto=>onMutation(()=>apiClient.vehicleOwners.assignOwnership(dto),'Ownership agreement assigned.')}/>}
      {tab==='availability'&&<AvailabilityPanel twin={twin} busy={busy} canChange={can('vehicle.status_override')} canOpenEngine={canNav('availability')} onOpenEngine={()=>onNavigate('availability')} onLifecycle={(state,reason)=>onMutation(()=>apiClient.fleet.changeLifecycleStatus(v.id,{status:state,reason,expectedVersion:v.version}),'Lifecycle updated.')} onAvailability={(state,reason)=>onMutation(()=>apiClient.fleet.changeAvailabilityStatus(v.id,{status:state,reason,expectedVersion:v.version}),'Availability updated.')} onMileage={n=>onMutation(()=>apiClient.fleet.recordMileage(v.id,{recordedMileage:n,source:'MANUAL_AUDIT'}),'Mileage recorded.')} onFuel={n=>onMutation(()=>apiClient.fleet.recordFuel(v.id,{fuelLevel:n,source:'MANUAL_AUDIT'}),'Fuel level recorded.')}/>}
      {tab==='compliance'&&<RelatedList title="Compliance readiness" icon={<ShieldCheck size={18}/>} items={related.compliance} summary={related.readiness} empty="No compliance records for this vehicle." action={canNav('compliance')?()=>onNavigate('compliance'):undefined} actionLabel="Open Compliance"/>}
      {tab==='maintenance'&&<MaintenancePanel items={related.maintenance} schedules={related.schedules} due={related.due} action={canNav('maintenance')?()=>onNavigate('maintenance'):undefined}/>}
      {tab==='inspections'&&<InspectionPanel items={related.inspections} damage={related.damage} action={canNav('inspections')?()=>onNavigate('inspections'):undefined}/>}
      {tab==='media'&&<MediaPanel twin={twin} busy={busy} canUpdate={can('vehicle.update')} onUpdateImage={url=>onMutation(()=>apiClient.fleet.updateVehicle(v.id,{imageUrl:url,expectedVersion:v.version}),'Primary image updated.')} onAddDocument={dto=>onMutation(()=>apiClient.fleet.addDocument(v.id,dto),'Vehicle document added.')}/>}
      {tab==='history'&&<HistoryPanel twin={twin}/>}
    </main>
  </div></div>;
}

function Overview({twin}:{twin:VehicleDigitalTwin}) {
  const v=twin.vehicle;
  const fields=[['VIN',v.vin],['Transmission',v.transmission],['Fuel type',v.fuelType],['Seats',v.seats],['Color',v.color],['Odometer',v.odometer.toLocaleString()+' km'],['Fuel level',v.fuelLevel+'%'],['Daily rate',v.dailyRate],['Daily km allowance',v.allowedDailyKm],['Excess km rate',v.excessKmRate],['Insurance expiry',date(v.insuranceExpiryDate)],['Inspection expiry',date(v.inspectionExpiryDate)],['Website',v.isPublishedToWebsite?'Published':'Not published'],['Current owner',twin.currentOwnership?.owner?.name||'Company / unassigned']];
  return <div className="grid gap-4 lg:grid-cols-3"><section className="rounded-2xl border bg-white p-5 lg:col-span-2"><h3 className="font-bold">Asset details</h3><dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">{fields.map(([key,val])=><div key={String(key)}><dt className="text-xs font-semibold text-slate-500">{key}</dt><dd className="mt-1 text-sm font-medium text-slate-900">{text(val)}</dd></div>)}</dl></section><section className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Operating history</h3><div className="mt-4 space-y-3"><Kpi label="Rentals" value={twin.stats.totalRentals}/><Kpi label="Days on rent" value={twin.stats.totalDaysOnRent}/><Kpi label="Revenue" value={twin.stats.totalRevenue===null?'Not available':twin.stats.totalRevenue}/><Kpi label="Utilization" value={twin.stats.utilizationRatePercent===null?'Not available':String(twin.stats.utilizationRatePercent)+'%'}/></div></section></div>;
}

function Ownership({twin,owners,busy,canManage,onAssign}:{twin:VehicleDigitalTwin;owners:any[];busy:boolean;canManage:boolean;onAssign:(dto:any)=>Promise<void>}) {
  return <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Current agreement</h3>{twin.currentOwnership?<div className="mt-4 space-y-2 text-sm"><p><strong>{twin.currentOwnership.owner?.name||'Owner'}</strong></p><p>{twin.currentOwnership.ownershipType.replaceAll('_',' ')}</p><p>Revenue share: {twin.currentOwnership.revenueSharePercent}%</p><p className="text-slate-500">{text(twin.currentOwnership.termsSnapshot)}</p></div>:<p className="mt-4 text-sm text-slate-500">No active third-party ownership agreement.</p>}</section><section className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Assign ownership</h3>{!canManage?<p className="mt-3 text-sm text-slate-500">Your role can view ownership but cannot manage agreements.</p>:!owners.length?<p className="mt-3 text-sm text-slate-500">No vehicle owners are available. Add an owner first.</p>:<form className="mt-4 grid gap-3" onSubmit={e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));void onAssign({vehicleId:twin.vehicle.id,ownerId:d.ownerId,ownershipType:d.ownershipType,revenueSharePercent:Number(d.revenueSharePercent),allowableExpenseDeductions:d.deduct==='on',termsSnapshot:d.termsSnapshot||undefined});}}><select required name="ownerId" className={inputClass}><option value="">Choose owner</option>{owners.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select><select name="ownershipType" defaultValue="THIRD_PARTY_OWNED" className={inputClass}><option>COMPANY_OWNED</option><option>THIRD_PARTY_OWNED</option><option>LEASED</option><option>MANAGED</option><option>PARTNERSHIP</option></select><input name="revenueSharePercent" type="number" min="0" max="100" step="0.01" defaultValue="75" className={inputClass}/><textarea name="termsSnapshot" placeholder="Commercial terms snapshot" className={inputClass}/><label className="flex gap-2 text-sm"><input type="checkbox" name="deduct" defaultChecked/>Allow agreed expense deductions</label><button disabled={busy} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Assign agreement</button></form>}</section><section className="rounded-2xl border bg-white p-5 lg:col-span-2"><h3 className="font-bold">Ownership history</h3><div className="mt-3 space-y-2">{!twin.ownershipHistory.length?<p className="text-sm text-slate-500">No historical agreements.</p>:twin.ownershipHistory.map(item=><div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"><span>{item.owner?.name||item.ownerId} · {item.ownershipType.replaceAll('_',' ')}</span><span>{item.revenueSharePercent}% · {date(item.startDate)} → {item.endDate?date(item.endDate):'Current'}</span></div>)}</div></section></div>;
}

function AvailabilityPanel({twin,busy,canChange,canOpenEngine,onOpenEngine,onLifecycle,onAvailability,onMileage,onFuel}:{twin:VehicleDigitalTwin;busy:boolean;canChange:boolean;canOpenEngine:boolean;onOpenEngine:()=>void;onLifecycle:(s:string,r:string)=>Promise<void>;onAvailability:(s:string,r:string)=>Promise<void>;onMileage:(n:number)=>Promise<void>;onFuel:(n:number)=>Promise<void>}) {
  const [reason,setReason]=useState('');
  return <div className="space-y-4"><section className="grid gap-4 lg:grid-cols-3"><div className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Current state</h3><div className="mt-3 flex gap-2"><Badge>{twin.vehicle.lifecycleStatus}</Badge><Badge>{twin.vehicle.availabilityStatus}</Badge></div>{canOpenEngine&&<button onClick={onOpenEngine} className="mt-4 text-sm font-bold text-emerald-700">Open full Availability Engine →</button>}</div>{canChange&&<><form onSubmit={e=>{e.preventDefault();void onLifecycle(String(new FormData(e.currentTarget).get('state')),reason||'Fleet asset profile update');}} className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Lifecycle</h3><select name="state" defaultValue={twin.vehicle.lifecycleStatus} className={inputClass+' mt-3'}>{lifecycle.map(s=><option key={s}>{s}</option>)}</select><button disabled={busy} className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">Apply lifecycle</button></form><form onSubmit={e=>{e.preventDefault();void onAvailability(String(new FormData(e.currentTarget).get('state')),reason||'Fleet asset profile update');}} className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Availability</h3><select name="state" defaultValue={twin.vehicle.availabilityStatus} className={inputClass+' mt-3'}>{availability.map(s=><option key={s}>{s}</option>)}</select><button disabled={busy} className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Apply availability</button></form></>}</section>{canChange&&<Field label="Reason for state change"><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Recorded in status history" className={inputClass}/></Field>}<section className="grid gap-4 lg:grid-cols-2"><form onSubmit={e=>{e.preventDefault();void onMileage(Number(new FormData(e.currentTarget).get('value')));}} className="rounded-2xl border bg-white p-5"><h3 className="flex items-center gap-2 font-bold"><Gauge size={17}/>Record odometer</h3><input name="value" type="number" min={twin.vehicle.odometer} defaultValue={twin.vehicle.odometer} className={inputClass+' mt-3'}/><button disabled={busy} className="mt-3 rounded-lg border px-3 py-2 text-xs font-bold">Record mileage</button></form><form onSubmit={e=>{e.preventDefault();void onFuel(Number(new FormData(e.currentTarget).get('value')));}} className="rounded-2xl border bg-white p-5"><h3 className="flex items-center gap-2 font-bold"><Fuel size={17}/>Record fuel</h3><input name="value" type="number" min="0" max="100" defaultValue={twin.vehicle.fuelLevel} className={inputClass+' mt-3'}/><button disabled={busy} className="mt-3 rounded-lg border px-3 py-2 text-xs font-bold">Record fuel level</button></form></section></div>;
}

function RelatedList({title,icon,items,empty,summary,action,actionLabel}:{title:string;icon:React.ReactNode;items:any[];empty:string;summary?:any;action?:()=>void;actionLabel?:string}) {
 return <div className="space-y-4"><section className="rounded-2xl border bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 font-bold">{icon}{title}</h3>{summary&&<p className="mt-2 text-sm text-slate-600">{summary.ready===true?'Ready':summary.ready===false?'Not ready':text(summary.status||summary.overallStatus||'Readiness evaluated')}</p>}</div>{action&&<button onClick={action} className="text-sm font-bold text-emerald-700">{actionLabel} →</button>}</div></section><section className="rounded-2xl border bg-white p-5">{!items.length?<p className="text-sm text-slate-500">{empty}</p>:<div className="space-y-2">{items.map((item:any,index)=><div key={item.id||index} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.requirementCode||item.documentType||item.code||item.id}</strong><Badge>{item.verificationStatus||item.status||'RECORDED'}</Badge></div><p className="mt-1 text-xs text-slate-500">Expiry: {date(item.expiresAt||item.expiryDate||item.validUntil)}</p></div>)}</div>}</section></div>;
}
function MaintenancePanel({items,schedules,due,action}:{items:any[];schedules:any[];due:any[];action?:()=>void}) {
 return <div className="space-y-4"><section className="flex items-center justify-between rounded-2xl border bg-white p-5"><div><h3 className="flex items-center gap-2 font-bold"><Wrench size={18}/>Maintenance</h3><p className="mt-1 text-sm text-slate-500">{items.length} work orders · {schedules.length} schedules</p></div>{action&&<button onClick={action} className="text-sm font-bold text-emerald-700">Open Maintenance →</button>}</section><section className="rounded-2xl border bg-white p-5">{!items.length?<p className="text-sm text-slate-500">No work orders for this vehicle.</p>:<div className="space-y-2">{items.map((item:any,index)=><div key={item.id||index} className="flex flex-wrap justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"><span>{item.workOrderNumber||item.maintenanceType||item.serviceType||'Maintenance'}</span><Badge>{item.status}</Badge></div>)}</div>}</section>{due.length>0&&<section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{due.length} maintenance due evaluation(s) require review.</section>}</div>;
}
function InspectionPanel({items,damage,action}:{items:any[];damage:any[];action?:()=>void}) {
 return <div className="space-y-4"><section className="flex items-center justify-between rounded-2xl border bg-white p-5"><div><h3 className="font-bold">Inspections & damage</h3><p className="mt-1 text-sm text-slate-500">{items.length} inspections · {damage.length} damage cases</p></div>{action&&<button onClick={action} className="text-sm font-bold text-emerald-700">Open Inspections →</button>}</section><section className="rounded-2xl border bg-white p-5">{!items.length?<p className="text-sm text-slate-500">No inspections recorded.</p>:<div className="space-y-2">{items.map((item:any,index)=><div key={item.id||index} className="flex flex-wrap justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"><span>{item.inspectionType||'Inspection'} · {date(item.completedAt||item.createdAt)}</span><Badge>{item.status}</Badge></div>)}</div>}</section>{damage.length>0&&<section className="rounded-2xl border bg-white p-5"><h4 className="font-bold">Damage cases</h4><div className="mt-3 space-y-2">{damage.map((item:any,index)=><div key={item.id||index} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-2"><span>{item.damageCaseNumber||item.bodyZone||'Damage case'}</span><Badge>{item.status}</Badge></div><p className="text-xs text-slate-500">{text(item.severity)}</p></div>)}</div></section>}</div>;
}

function MediaPanel({twin,busy,canUpdate,onUpdateImage,onAddDocument}:{twin:VehicleDigitalTwin;busy:boolean;canUpdate:boolean;onUpdateImage:(url:string)=>Promise<void>;onAddDocument:(dto:any)=>Promise<void>}) {
 return <div className="grid gap-4 lg:grid-cols-2"><section className="rounded-2xl border bg-white p-5"><h3 className="flex items-center gap-2 font-bold"><ImageIcon size={18}/>Primary image</h3>{twin.vehicle.imageUrl?<img src={twin.vehicle.imageUrl} alt="" className="mt-4 h-52 w-full rounded-xl object-cover"/>:<div className="mt-4 flex h-52 items-center justify-center rounded-xl bg-slate-100 text-slate-400">No primary image</div>}{canUpdate&&<form className="mt-3 flex gap-2" onSubmit={e=>{e.preventDefault();void onUpdateImage(String(new FormData(e.currentTarget).get('url')));}}><input name="url" type="url" required defaultValue={twin.vehicle.imageUrl} placeholder="https://…" className={inputClass}/><button disabled={busy} className="rounded-xl border px-3 text-xs font-bold">Save</button></form>}</section><section className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Vehicle documents</h3><div className="mt-3 space-y-2">{!twin.documents.length?<p className="text-sm text-slate-500">No Fleet documents attached.</p>:twin.documents.map(doc=><div key={doc.id} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-2"><strong>{doc.documentType.replaceAll('_',' ')}</strong><Badge>{doc.verificationStatus}</Badge></div><p className="mt-1 text-xs text-slate-500">{text(doc.documentNumber)} · Exp {date(doc.expiresAt)}</p>{doc.fileUrl&&<a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-emerald-700">Open document</a>}</div>)}</div>{canUpdate&&<form className="mt-4 grid gap-2" onSubmit={e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));void onAddDocument({documentType:d.documentType,documentNumber:d.documentNumber||undefined,fileName:d.fileName||undefined,fileUrl:d.fileUrl||undefined,expiresAt:d.expiresAt||undefined,status:'VALID',verificationStatus:'PENDING'});e.currentTarget.reset();}}><select name="documentType" className={inputClass}><option>INSURANCE_CERTIFICATE</option><option>NTSA_INSPECTION</option><option>PSV_LICENSE</option><option>LOGBOOK_TITLE</option><option>LEASE_AGREEMENT</option><option>SERVICE_RECORD</option><option>OTHER</option></select><input name="documentNumber" placeholder="Document number" className={inputClass}/><input name="fileName" placeholder="File label" className={inputClass}/><input name="fileUrl" type="url" placeholder="Secure document URL (if already uploaded)" className={inputClass}/><input name="expiresAt" type="date" className={inputClass}/><button disabled={busy} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white">Add document metadata</button><p className="text-[11px] text-slate-500">Binary upload remains governed by the secure File/Media pipeline; this does not bypass quarantine or scanning.</p></form>}</section></div>;
}

function HistoryPanel({twin}:{twin:VehicleDigitalTwin}) {
 return <div className="grid gap-4 lg:grid-cols-3"><section className="rounded-2xl border bg-white p-5 lg:col-span-2"><h3 className="font-bold">Status history</h3><div className="mt-3 space-y-2">{!twin.statusHistory.length?<p className="text-sm text-slate-500">No status transitions recorded.</p>:twin.statusHistory.map(item=><div key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{item.previousLifecycleStatus} → {item.newLifecycleStatus}</span><span>{item.previousAvailabilityStatus} → {item.newAvailabilityStatus}</span></div><p className="mt-1 text-xs text-slate-500">{date(item.timestamp)} · {text(item.actorName)} · {text(item.reason)}</p></div>)}</div></section><section className="space-y-4"><div className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Mileage</h3><div className="mt-3 space-y-2">{twin.recentMileage.slice(0,6).map(item=><p key={item.id} className="text-sm">{item.recordedMileage.toLocaleString()} km <span className="text-xs text-slate-500">· {date(item.recordedAt)}</span></p>)}</div></div><div className="rounded-2xl border bg-white p-5"><h3 className="font-bold">Fuel</h3><div className="mt-3 space-y-2">{twin.recentFuel.slice(0,6).map(item=><p key={item.id} className="text-sm">{item.fuelLevelPercent}% <span className="text-xs text-slate-500">· {date(item.recordedAt)}</span></p>)}</div></div></section></div>;
}
