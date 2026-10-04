import React,{useEffect,useMemo,useState} from "react";
import {ArrowLeft,CalendarDays,Car,CheckCircle2,Clock3,RefreshCw,ShieldCheck} from "lucide-react";

async function publicRequest(path:string,body?:unknown){
  const response=await fetch(`/api/v1/public/${path}`,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload.error?.message||payload.error||payload.message||"Unable to load your booking.");
  return payload.data;
}
function human(v?:string){return String(v||"").replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());}
function dateTime(v?:string){if(!v)return "—";const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString():"—";}
function money(n:any,c="KES"){return `${c} ${Number(n||0).toLocaleString()}`;}

const stageOrder=["PENDING_CONFIRMATION","QUOTED","AWAITING_PAYMENT","CONFIRMED","ACTIVE","COMPLETED"];
const stageLabels=["Request received","Price & review","Payment","Confirmed","Vehicle collected","Completed"];

export default function RenterAccount({slug}:{slug:string}){
  const storageKey=`sage-auto:renter:${slug}`;
  const [site,setSite]=useState<any>(null),[booking,setBooking]=useState<any>(null);
  const [bookingReference,setBookingReference]=useState(""),[email,setEmail]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[lastUpdated,setLastUpdated]=useState<string>("");
  const base=`/site/${encodeURIComponent(slug)}`;

  useEffect(()=>{let active=true;publicRequest(`website/resolve?subdomain=${encodeURIComponent(slug)}`).then(data=>active&&setSite(data)).catch(()=>{});try{const saved=JSON.parse(localStorage.getItem(storageKey)||"null");if(saved?.bookingReference&&saved?.email){setBookingReference(saved.bookingReference);setEmail(saved.email);void load(saved.bookingReference,saved.email,false);}}catch{}return()=>{active=false;};},[slug]);

  async function load(ref=bookingReference,mail=email,remember=true){
    if(!ref.trim()||!mail.trim())return;
    setBusy(true);setError("");
    try{
      const data=await publicRequest(`booking/account/booking?site=${encodeURIComponent(slug)}`,{bookingReference:ref.trim(),email:mail.trim()});
      setBooking(data);setLastUpdated(new Date().toISOString());
      if(remember)localStorage.setItem(storageKey,JSON.stringify({bookingReference:ref.trim(),email:mail.trim()}));
    }catch(e:any){setBooking(null);setError(e.message||"We could not find that booking.");}
    finally{setBusy(false);}
  }

  useEffect(()=>{
    if(!booking||!bookingReference||!email)return;
    const timer=window.setInterval(()=>void load(bookingReference,email,false),30000);
    return()=>window.clearInterval(timer);
  },[booking?.bookingId,bookingReference,email]);

  const currentIndex=useMemo(()=>{
    const status=String(booking?.status||"");
    const exact=stageOrder.indexOf(status);
    if(exact>=0)return exact;
    if(["CANCELLED","REJECTED","EXPIRED","NO_SHOW"].includes(status))return 0;
    return 0;
  },[booking?.status]);

  const branding=site?.branding||{};
  const businessName=branding.businessName||slug.replace(/-/g," ").replace(/\b\w/g,(c:string)=>c.toUpperCase());

  return <div className="min-h-screen bg-slate-50 text-slate-950">
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-600">Booking tracker</p><h1 className="text-xl font-black">{businessName}</h1></div>
        <a href={base} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold"><ArrowLeft size={16}/>Back to website</a>
      </div>
    </header>

    <main className="mx-auto max-w-6xl space-y-6 px-5 py-8">
      {!booking&&<section className="mx-auto max-w-xl rounded-3xl border bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6"><h2 className="text-2xl font-black">Track your rental journey</h2><p className="mt-2 text-sm leading-6 text-slate-500">Use the booking reference and email from your reservation. This tracker shows confirmation and rental-stage updates. For a persistent verified profile across bookings, use your renter account.</p></div>
        {error&&<div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
        <form onSubmit={e=>{e.preventDefault();void load();}} className="grid gap-4">
          <label className="grid gap-1 text-sm font-semibold">Booking reference<input required value={bookingReference} onChange={e=>setBookingReference(e.target.value)} placeholder="BKG-2026-000123" className="rounded-xl border px-3 py-3 font-mono"/></label>
          <label className="grid gap-1 text-sm font-semibold">Booking email<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" className="rounded-xl border px-3 py-3"/></label>
          <button disabled={busy} className="rounded-xl bg-slate-950 px-5 py-3 font-bold text-white disabled:opacity-60">{busy?"Opening account…":"Track my booking"}</button>
        </form>
      </section>}

      {booking&&<>
        <section className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-300">Booking {booking.bookingReference}</p><h2 className="mt-2 text-3xl font-black">{human(booking.status)}</h2><p className="mt-2 text-sm text-slate-300">{booking.vehicle?.make} {booking.vehicle?.model} · {dateTime(booking.schedule?.pickupAt)}</p></div>
            <div className="flex flex-wrap gap-2"><button onClick={()=>void load(bookingReference,email,false)} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold"><RefreshCw size={15} className={busy?"animate-spin":""}/>Refresh</button><button onClick={()=>{localStorage.removeItem(storageKey);setBooking(null);setError("");}} className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950">Switch booking</button></div>
          </div>
        </section>

        <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-start justify-between gap-4"><div><h3 className="text-lg font-black">Rental progress</h3><p className="mt-1 text-sm text-slate-500">Updates appear here as your rental company processes the reservation.</p></div>{lastUpdated&&<span className="text-xs text-slate-400">Updated {dateTime(lastUpdated)}</span>}</div>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{stageLabels.map((label,i)=><div key={label} className={"rounded-2xl border p-3 "+(i<=currentIndex?"border-emerald-200 bg-emerald-50":"border-slate-200 bg-slate-50")}><div className={"mb-2 grid h-7 w-7 place-items-center rounded-full text-xs font-black "+(i<=currentIndex?"bg-emerald-600 text-white":"bg-slate-200 text-slate-500")}>{i<currentIndex?<CheckCircle2 size={15}/>:i+1}</div><p className="text-xs font-bold">{label}</p></div>)}</div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7">
            <h3 className="text-lg font-black">Latest notifications</h3>
            <div className="mt-4 space-y-3">{(booking.timeline||[]).length?(booking.timeline||[]).slice().reverse().map((item:any)=><div key={item.id} className="flex gap-3 rounded-2xl bg-slate-50 p-4"><div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Clock3 size={15}/></div><div><p className="font-bold">{item.title}</p><p className="mt-1 text-sm text-slate-600">{item.message}</p><p className="mt-2 text-xs text-slate-400">{dateTime(item.occurredAt)}</p></div></div>):<p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Your booking has been received. Further rental-stage updates will appear here.</p>}</div>
          </div>
          <div className="space-y-5">
            <section className="rounded-3xl border bg-white p-5 shadow-sm"><h3 className="font-black">Trip details</h3><div className="mt-4 space-y-3 text-sm"><Row icon={<Car size={16}/>} label="Vehicle" value={`${booking.vehicle?.make||""} ${booking.vehicle?.model||""}`}/><Row icon={<CalendarDays size={16}/>} label="Pickup" value={dateTime(booking.schedule?.pickupAt)}/><Row icon={<CalendarDays size={16}/>} label="Return" value={dateTime(booking.schedule?.returnAt)}/><Row icon={<ShieldCheck size={16}/>} label="Payment" value={booking.pricing?.isPaid?"Paid":"Not yet marked paid"}/></div></section>
            <section className="rounded-3xl border bg-white p-5 shadow-sm"><h3 className="font-black">Price summary</h3><div className="mt-4 space-y-2 text-sm"><Price label="Rental total" value={money(booking.pricing?.grossTotal,booking.pricing?.currency)}/><Price label="Security deposit" value={money(booking.pricing?.depositAmount,booking.pricing?.currency)}/></div></section>
          </div>
        </section>
      </>}
    </main>
  </div>;
}
function Row({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="flex items-start gap-3"><span className="mt-0.5 text-slate-400">{icon}</span><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 font-semibold">{value||"—"}</p></div></div>;}
function Price({label,value}:{label:string;value:string}){return <div className="flex items-center justify-between gap-4 border-b py-2 last:border-0"><span className="text-slate-500">{label}</span><strong>{value}</strong></div>;}
