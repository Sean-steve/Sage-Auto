import React,{useEffect,useMemo,useState} from "react";
import {ArrowRight,CalendarDays,Car,Check,ChevronRight,Clock3,MapPin,Menu,ShieldCheck,Star,UsersRound,X} from "lucide-react";

async function publicRequest(path:string,body?:unknown){
  const response=await fetch(`/api/v1/public/${path}`,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error?.message||result.error||result.message||"Unable to load the website.");
  return result.data;
}
function stripHtml(v?:string){return String(v||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();}
function dateTime(v?:string){if(!v)return "—";const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString():"—";}

export default function TenantPublicSite({slug}:{slug:string}){
  const [site,setSite]=useState<any>(null),[page,setPage]=useState<any>(null),[allCars,setAllCars]=useState<any[]>([]),[cars,setCars]=useState<any[]>([]);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false),[quote,setQuote]=useState<any>(null),[voucher,setVoucher]=useState<any>(null);
  const [vehicleId,setVehicleId]=useState(""),[pickupAt,setPickup]=useState(""),[returnAt,setReturn]=useState(""),[menuOpen,setMenuOpen]=useState(false);
  const [key,setKey]=useState(()=>crypto.randomUUID()),[availabilitySearched,setAvailabilitySearched]=useState(false);
  const base=`/site/${encodeURIComponent(slug)}`;
  const rawPath=decodeURIComponent(location.pathname.slice(base.length))||"/";
  const pageSlug=rawPath==="/account"?"/":rawPath;
  const query=`site=${encodeURIComponent(slug)}`;

  useEffect(()=>{let cancelled=false;(async()=>{
    setError("");
    const resolved=await publicRequest(`website/resolve?subdomain=${encodeURIComponent(slug)}`);
    if(resolved.isMaintenanceMode)throw new Error(resolved.maintenanceMessage||"This rental website is temporarily unavailable.");
    const [content,vehicles]=await Promise.all([
      publicRequest(`website/pages${pageSlug==="/"?"/":pageSlug}?tenantId=${encodeURIComponent(resolved.tenantId)}`),
      publicRequest(`booking/vehicles?${query}`)
    ]);
    if(!cancelled){setSite(resolved);setPage(content);setAllCars(vehicles);setCars(vehicles);}
  })().catch(e=>!cancelled&&setError(e.message));return()=>{cancelled=true;};},[slug,pageSlug]);

  useEffect(()=>{setQuote(null);setVoucher(null);setKey(crypto.randomUUID());},[vehicleId,pickupAt,returnAt]);

  const branding=site?.branding||{};
  const businessName=branding.businessName||slug.replace(/-/g," ").replace(/\b\w/g,(c:string)=>c.toUpperCase());
  const visibleBlocks=(page?.contentBlocks||[]).filter((b:any)=>b.data?.enabled!==false).sort((a:any,b:any)=>a.sortOrder-b.sortOrder);
  const featuredCars=useMemo(()=>cars.slice(0,6),[cars]);
  const style={
    "--brand-primary":branding.primaryColor||"#059669",
    "--brand-secondary":branding.secondaryColor||"#0f172a",
    "--brand-accent":branding.accentColor||"#f59e0b",
    "--brand-bg":branding.backgroundColor||"#f8fafc",
  } as React.CSSProperties;

  const dates=(data?:FormData)=>{
    const p=new Date(String(data?.get("pickupAt")||pickupAt)),r=new Date(String(data?.get("returnAt")||returnAt));
    if(!Number.isFinite(p.getTime())||!Number.isFinite(r.getTime())||r<=p)throw new Error("Choose a valid pickup date and a later return date.");
    return {vehicleId:String(data?.get("vehicleId")||vehicleId),pickupAt:p.toISOString(),returnAt:r.toISOString()};
  };

  async function searchAvailability(e?:React.FormEvent){
    e?.preventDefault();setBusy(true);setError("");setQuote(null);setVoucher(null);
    try{
      const d=dates();
      const result=await publicRequest(`booking/availability?${query}&pickupAt=${encodeURIComponent(d.pickupAt)}&returnAt=${encodeURIComponent(d.returnAt)}`);
      setCars(result.availableVehicles||[]);setAvailabilitySearched(true);
      if(vehicleId&&!(result.availableVehicles||[]).some((v:any)=>v.id===vehicleId))setVehicleId("");
      document.getElementById("fleet")?.scrollIntoView({behavior:"smooth"});
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  }

  async function submitBooking(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError("");const data=new FormData(e.currentTarget);
    try{
      if(!quote)setQuote(await publicRequest(`booking/quote?${query}`,dates(data)));
      else{
        const guest=Object.fromEntries(["fullName","email","phone","idOrPassportNumber","licenseNumber","licenseExpiryDate"].map(name=>[name,data.get(name)]));
        const next=await publicRequest(`booking/checkout?${query}`,{...dates(data),guest,paymentMethod:"PAY_LATER",idempotencyKey:key});
        setVoucher(next);
        localStorage.setItem(`sage-auto:renter:${slug}`,JSON.stringify({bookingReference:next.bookingReference,email:String(guest.email||"")}));
      }
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  }

  function chooseCar(id:string){setVehicleId(id);setQuote(null);document.getElementById("booking")?.scrollIntoView({behavior:"smooth"});}

  if(error&&!site)return <div className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white"><div className="max-w-lg text-center"><h1 className="text-3xl font-black">Website unavailable</h1><p className="mt-3 text-slate-300">{error}</p></div></div>;

  return <div style={style} className="min-h-screen bg-[var(--brand-bg)] text-slate-950">
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-4">
        <a href={base} className="flex min-w-0 items-center gap-3">{branding.logoUrl?<img src={branding.logoUrl} alt="" className="h-9 w-auto max-w-[140px] object-contain"/>:<div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--brand-secondary)] text-sm font-black text-white">{businessName.slice(0,2).toUpperCase()}</div>}<span className="truncate text-lg font-black">{businessName}</span></a>
        <nav className="hidden items-center gap-6 text-sm font-semibold lg:flex" aria-label="Website navigation">{(site?.activePages||[]).sort((a:any,b:any)=>a.displayOrder-b.displayOrder).map((p:any)=><a key={p.id} href={`${base}${p.slug==="/"?"" :p.slug}`} className="text-slate-600 transition hover:text-slate-950">{p.title}</a>)}</nav>
        <div className="hidden items-center gap-2 sm:flex"><a href={`${base}/account`} className="rounded-xl px-3 py-2 text-sm font-bold text-slate-700">My booking</a><a href={`${base}/fleet#booking`} className="rounded-xl bg-[var(--brand-primary)] px-4 py-2.5 text-sm font-black text-white">Book a car</a></div>
        <button onClick={()=>setMenuOpen(v=>!v)} className="rounded-xl border p-2 lg:hidden" aria-label="Toggle menu">{menuOpen?<X size={20}/>:<Menu size={20}/>}</button>
      </div>
      {menuOpen&&<div className="border-t bg-white px-5 py-4 lg:hidden"><div className="grid gap-2">{(site?.activePages||[]).sort((a:any,b:any)=>a.displayOrder-b.displayOrder).map((p:any)=><a key={p.id} href={`${base}${p.slug==="/"?"" :p.slug}`} className="rounded-xl px-3 py-2 font-semibold hover:bg-slate-50">{p.title}</a>)}<a href={`${base}/account`} className="rounded-xl px-3 py-2 font-semibold">My booking</a><a href={`${base}/fleet#booking`} className="rounded-xl bg-[var(--brand-primary)] px-3 py-2 font-black text-white">Book a car</a></div></div>}
    </header>

    <main>
      {error&&<div role="alert" className="mx-auto mt-5 max-w-7xl px-5"><div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div></div>}
      {!site&&!error&&<div className="mx-auto max-w-7xl px-5 py-20 text-center text-slate-500">Loading website…</div>}
      {site&&visibleBlocks.map((block:any)=><Block key={block.id} block={block} cars={featuredCars} base={base} chooseCar={chooseCar} pickupAt={pickupAt} returnAt={returnAt} setPickup={setPickup} setReturn={setReturn} searchAvailability={searchAvailability} busy={busy}/>)}

      {site&&(pageSlug==="/"||pageSlug==="/fleet")&&<section id="fleet" className="mx-auto max-w-7xl px-5 py-14 sm:py-20">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-[var(--brand-primary)]">{availabilitySearched?"Available for your dates":"Live fleet"}</p><h2 className="mt-2 text-3xl font-black sm:text-4xl">{availabilitySearched?"Cars you can book":"Choose your next drive"}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{availabilitySearched?"These vehicles are clear of bookings, temporary holds and operational blocks for the full requested window.":"Published operational vehicles remain visible here even when temporarily held for another time window. Choose dates to see what is actually free for your trip."}</p></div>{availabilitySearched&&<button onClick={()=>{setCars(allCars);setAvailabilitySearched(false);}} className="rounded-xl border bg-white px-4 py-2 text-sm font-bold">Show full catalogue</button>}</div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{cars.map(car=><VehicleCard key={car.id} car={car} chooseCar={chooseCar}/>)}</div>
        {!cars.length&&<div className="rounded-3xl border border-dashed bg-white p-10 text-center"><Car className="mx-auto text-slate-300"/><h3 className="mt-3 font-black">No vehicle is free for those dates</h3><p className="mt-1 text-sm text-slate-500">Try a different time window or contact the rental team for alternatives.</p></div>}
      </section>}

      {site&&(pageSlug==="/"||pageSlug==="/fleet")&&<section id="booking" className="border-y bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[.8fr_1.2fr] lg:py-20">
          <div><p className="text-xs font-black uppercase tracking-[.18em] text-[var(--brand-primary)]">Online reservation</p><h2 className="mt-2 text-3xl font-black">Book and follow the whole journey</h2><p className="mt-3 text-sm leading-6 text-slate-500">Choose your dates, select an available vehicle and submit your details. Your renter account is created from the reservation so you can follow confirmation and rental-stage updates.</p><div className="mt-6 space-y-3 text-sm"><Benefit icon={<CalendarDays size={17}/>} text="Live availability checks include bookings and temporary holds"/><Benefit icon={<ShieldCheck size={17}/>} text="Server-calculated price and deposit"/><Benefit icon={<Clock3 size={17}/>} text="Booking progress appears in your renter account"/></div></div>
          <div className="rounded-3xl border bg-slate-50 p-5 sm:p-7">
            {voucher?<div role="status" className="space-y-5"><div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check size={22}/></div><div><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-600">Reservation received</p><h3 className="mt-1 text-2xl font-black">{voucher.bookingReference}</h3><p className="mt-2 text-sm text-slate-600">Your renter account is ready. Use the same booking email to see confirmation, handover and rental updates.</p></div><div className="rounded-2xl bg-white p-4 text-sm"><p><strong>{voucher.vehicle?.make} {voucher.vehicle?.model}</strong></p><p className="mt-1 text-slate-500">{dateTime(voucher.schedule?.pickupAt)} → {dateTime(voucher.schedule?.returnAt)}</p></div><a href={`${base}/account`} className="inline-flex items-center gap-2 rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-black text-white">Open my renter account<ArrowRight size={16}/></a></div>:
            <form onSubmit={submitBooking} className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold sm:col-span-2">Vehicle<select name="vehicleId" required className="mt-1 block w-full rounded-xl border bg-white p-3" value={vehicleId} onChange={e=>setVehicleId(e.target.value)}><option value="">Choose an available vehicle</option>{cars.map(car=><option key={car.id} value={car.id}>{car.make} {car.model} · {car.currency} {Number(car.dailyRate||0).toLocaleString()}/day</option>)}</select></label>
              <label className="text-sm font-semibold">Pickup<input required type="datetime-local" name="pickupAt" className="mt-1 block w-full rounded-xl border bg-white p-3" value={pickupAt} onChange={e=>setPickup(e.target.value)}/></label>
              <label className="text-sm font-semibold">Return<input required type="datetime-local" name="returnAt" className="mt-1 block w-full rounded-xl border bg-white p-3" value={returnAt} onChange={e=>setReturn(e.target.value)}/></label>
              {!quote&&<button type="button" disabled={busy||!pickupAt||!returnAt} onClick={()=>void searchAvailability()} className="rounded-xl border bg-white px-4 py-3 text-sm font-bold sm:col-span-2">Check these dates across the fleet</button>}
              {quote&&<><div className="rounded-xl bg-emerald-50 p-4 text-sm sm:col-span-2"><p className="font-black">Quote: {quote.currency} {Number(quote.grossRentalTotal||0).toLocaleString()}</p><p className="mt-1 text-xs text-emerald-800">Security deposit: {quote.currency} {Number(quote.securityDeposit?.amount||0).toLocaleString()}</p></div>{([["fullName","Full name","text"],["email","Email","email"],["phone","Phone","tel"],["idOrPassportNumber","ID / passport number","text"],["licenseNumber","Driving licence number","text"],["licenseExpiryDate","Licence expiry","date"]] as const).map(([name,label,type])=><label key={name} className="text-sm font-semibold">{label}<input required name={name} type={type} className="mt-1 block w-full rounded-xl border bg-white p-3"/></label>)}</>}
              <button disabled={busy||!vehicleId} className="rounded-xl bg-[var(--brand-primary)] px-5 py-3 font-black text-white sm:col-span-2">{busy?"Working…":quote?"Submit booking":"Get authoritative quote"}</button>
            </form>}
          </div>
        </div>
      </section>}
    </main>

    <footer className="bg-[var(--brand-secondary)] text-white"><div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 md:grid-cols-[1.2fr_1fr_1fr]"><div><h2 className="text-xl font-black">{businessName}</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-300">A simpler way to discover vehicles, request a booking and follow your rental from reservation to completion.</p></div><div><p className="text-xs font-black uppercase tracking-[.15em] text-slate-400">Explore</p><div className="mt-3 grid gap-2 text-sm">{(site?.activePages||[]).slice(0,5).map((p:any)=><a key={p.id} href={`${base}${p.slug==="/"?"" :p.slug}`} className="text-slate-300 hover:text-white">{p.title}</a>)}</div></div><div><p className="text-xs font-black uppercase tracking-[.15em] text-slate-400">Your rental</p><div className="mt-3 grid gap-2 text-sm"><a href={`${base}/fleet#booking`} className="text-slate-300 hover:text-white">Book a car</a><a href={`${base}/account`} className="text-slate-300 hover:text-white">My booking</a></div></div></div></footer>
  </div>;
}

function Block({block,cars,base,chooseCar,pickupAt,returnAt,setPickup,setReturn,searchAvailability,busy}:{block:any;cars:any[];base:string;chooseCar:(id:string)=>void;pickupAt:string;returnAt:string;setPickup:(v:string)=>void;setReturn:(v:string)=>void;searchAvailability:(e?:React.FormEvent)=>Promise<void>;busy:boolean}){
  const d=block.data||{};
  if(block.type==="HERO")return <section className="bg-[var(--brand-secondary)] text-white"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[1.1fr_.9fr] lg:py-24"><div><span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-emerald-200">{d.badge||"Book online"}</span><h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">{d.headline||"Find the right car for every journey"}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">{d.subheadline||"Browse live vehicles and request your rental dates."}</p><div className="mt-7 flex flex-wrap gap-3"><a href={`${base}${d.primaryCtaLink||"/fleet"}`} className="rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-black">{d.primaryCtaLabel||"Browse fleet"}</a><a href={`${base}/account`} className="rounded-xl border border-white/20 px-5 py-3 text-sm font-bold">Track my booking</a></div></div>{d.showSearchWidget!==false&&<form onSubmit={searchAvailability} className="self-end rounded-3xl bg-white p-5 text-slate-950 shadow-2xl sm:p-6"><p className="font-black">Check what is available</p><p className="mt-1 text-xs text-slate-500">Temporary holds and existing bookings are checked for your exact dates.</p><label className="mt-4 block text-xs font-bold">Pickup<input required type="datetime-local" value={pickupAt} onChange={e=>setPickup(e.target.value)} className="mt-1 block w-full rounded-xl border p-3"/></label><label className="mt-3 block text-xs font-bold">Return<input required type="datetime-local" value={returnAt} onChange={e=>setReturn(e.target.value)} className="mt-1 block w-full rounded-xl border p-3"/></label><button disabled={busy} className="mt-4 w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-black text-white">{busy?"Checking…":"Find available cars"}</button></form>}</div></section>;
  if(block.type==="FEATURE_GRID")return <section className="mx-auto max-w-7xl px-5 py-14"><div className="grid gap-4 md:grid-cols-3">{(d.items||[]).map((item:any,i:number)=><div key={i} className="rounded-3xl border bg-white p-6 shadow-sm"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-[var(--brand-primary)]"><ShieldCheck size={19}/></div><h2 className="mt-4 text-lg font-black">{item.title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p></div>)}</div></section>;
  if(block.type==="VEHICLE_SHOWCASE")return <section className="mx-auto max-w-7xl px-5 py-14"><div className="mb-6"><p className="text-xs font-black uppercase tracking-[.18em] text-[var(--brand-primary)]">{d.customBadge||"Featured fleet"}</p><h2 className="mt-2 text-3xl font-black">{block.title||"Vehicles for every journey"}</h2></div><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{cars.slice(0,Number(d.limit||6)).map(car=><VehicleCard key={car.id} car={car} chooseCar={chooseCar}/>)}</div></section>;
  if(block.type==="TEXT_IMAGE")return <section className="mx-auto max-w-7xl px-5 py-14"><div className={"grid gap-8 rounded-3xl border bg-white p-6 shadow-sm lg:grid-cols-2 lg:p-8 "+(d.imageAlignment==="LEFT"?"":"")}><div className={d.imageAlignment==="LEFT"?"lg:order-2":""}><p className="text-xs font-black uppercase tracking-[.16em] text-[var(--brand-primary)]">{block.title||"About us"}</p><p className="mt-3 text-base leading-7 text-slate-600">{stripHtml(d.richText)}</p>{d.ctaLabel&&<a href={`${base}${d.ctaLink||"/fleet"}`} className="mt-5 inline-flex items-center gap-2 font-black text-[var(--brand-primary)]">{d.ctaLabel}<ArrowRight size={15}/></a>}</div><div className={"overflow-hidden rounded-2xl bg-slate-100 "+(d.imageAlignment==="LEFT"?"lg:order-1":"")}>{d.imageUrl?<img src={d.imageUrl} alt="" className="h-full min-h-64 w-full object-cover"/>:<div className="grid min-h-64 place-items-center text-slate-300"><Car size={48}/></div>}</div></div></section>;
  if(block.type==="TESTIMONIALS")return <section className="bg-white"><div className="mx-auto max-w-7xl px-5 py-14"><h2 className="text-3xl font-black">{block.title||"What renters say"}</h2><div className="mt-6 grid gap-4 md:grid-cols-3">{(d.testimonials||[]).map((t:any,i:number)=><blockquote key={i} className="rounded-3xl border p-5"><div className="flex gap-1 text-amber-500">{Array.from({length:Math.max(1,Math.min(5,Number(t.rating||5)))}).map((_,n)=><Star key={n} size={14} fill="currentColor"/>)}</div><p className="mt-4 text-sm leading-6 text-slate-600">“{t.quote}”</p><footer className="mt-4 text-sm font-black">{t.author}</footer></blockquote>)}</div></div></section>;
  if(block.type==="FAQ")return <section className="mx-auto max-w-4xl px-5 py-14"><h2 className="text-center text-3xl font-black">{block.title||"Questions before you book"}</h2><div className="mt-6 space-y-3">{(d.faqs||[]).map((f:any,i:number)=><details key={i} className="rounded-2xl border bg-white p-5"><summary className="cursor-pointer font-black">{f.question}</summary><p className="mt-3 text-sm leading-6 text-slate-600">{f.answer}</p></details>)}</div></section>;
  if(block.type==="CALL_TO_ACTION")return <section className="mx-auto max-w-7xl px-5 py-14"><div className="rounded-3xl bg-[var(--brand-secondary)] p-7 text-white sm:p-10"><p className="text-xs font-black uppercase tracking-[.16em] text-emerald-300">{d.accentBadge||"Your next drive"}</p><h2 className="mt-2 text-3xl font-black">{d.headline||"Ready to book?"}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{d.description}</p><a href={`${base}${d.buttonLink||"/fleet"}`} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-black">{d.buttonLabel||"Browse vehicles"}<ChevronRight size={16}/></a></div></section>;
  if(block.type==="CONTACT_INFO")return <section className="mx-auto max-w-7xl px-5 py-14"><div className="rounded-3xl border bg-white p-6 sm:p-8"><h2 className="text-2xl font-black">{block.title||"Contact & pickup information"}</h2><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Contact icon={<MapPin size={17}/>} label="Address" value={d.address}/><Contact icon={<UsersRound size={17}/>} label="Phone" value={d.phone}/><Contact icon={<Clock3 size={17}/>} label="Hours" value={d.operatingHours}/><Contact icon={<Car size={17}/>} label="Email" value={d.email}/></div></div></section>;
  return null;
}

function VehicleCard({car,chooseCar}:{car:any;chooseCar:(id:string)=>void}){return <article className="group overflow-hidden rounded-3xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><div className="relative aspect-[16/10] bg-slate-100">{car.primaryImageUrl?<img src={car.primaryImageUrl} alt={`${car.make} ${car.model}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"/>:<div className="grid h-full place-items-center text-slate-300"><Car size={44}/></div>}<span className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-[10px] font-black uppercase tracking-wide">{car.categoryName||car.category}</span></div><div className="p-5"><div className="flex items-start justify-between gap-4"><div><h3 className="text-xl font-black">{car.make} {car.model}</h3><p className="mt-1 text-xs text-slate-500">{car.year} · {car.seatingCapacity||car.seats||5} seats · {car.transmission}</p></div><div className="text-right"><p className="font-black">{car.currency} {Number(car.dailyRate||0).toLocaleString()}</p><p className="text-[10px] text-slate-400">per day</p></div></div><div className="mt-4 flex flex-wrap gap-1.5">{(car.features||[]).slice(0,3).map((f:string)=><span key={f} className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-500">{f}</span>)}</div><button onClick={()=>chooseCar(car.id)} className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white">Choose this vehicle</button></div></article>;}
function Benefit({icon,text}:{icon:React.ReactNode;text:string}){return <div className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-[var(--brand-primary)]">{icon}</span><span className="text-slate-600">{text}</span></div>;}
function Contact({icon,label,value}:{icon:React.ReactNode;label:string;value?:string}){return <div className="flex gap-3"><span className="mt-1 text-[var(--brand-primary)]">{icon}</span><div><p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold">{value||"Contact the rental team"}</p></div></div>;}
