import React, { useEffect, useState } from 'react';

async function publicRequest(path: string, body?: unknown) {
  const response = await fetch(`/api/v1/public/${path}`, body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || result.error || result.message || 'Unable to load the website.');
  return result.data;
}

export default function TenantPublicSite({slug}: {slug:string}) {
  const [site,setSite]=useState<any>(null), [page,setPage]=useState<any>(null), [cars,setCars]=useState<any[]>([]);
  const [error,setError]=useState(''), [busy,setBusy]=useState(false), [quote,setQuote]=useState<any>(null), [voucher,setVoucher]=useState<any>(null);
  const [vehicleId,setVehicleId]=useState(''), [pickupAt,setPickup]=useState(''), [returnAt,setReturn]=useState('');
  const [key,setKey]=useState(() => crypto.randomUUID());
  const base=`/site/${encodeURIComponent(slug)}`;
  const pageSlug=decodeURIComponent(location.pathname.slice(base.length)) || '/';
  const query=`site=${encodeURIComponent(slug)}`;
  useEffect(()=>{let cancelled=false; (async()=>{
    const resolved=await publicRequest(`website/resolve?subdomain=${encodeURIComponent(slug)}`);
    const [content,vehicles]=await Promise.all([
      publicRequest(`website/pages${pageSlug==='/'?'/':pageSlug}?tenantId=${encodeURIComponent(resolved.tenantId)}`),
      publicRequest(`booking/vehicles?${query}`)
    ]);
    if (!cancelled) {setSite(resolved);setPage(content);setCars(vehicles);}
  })().catch(e=>!cancelled&&setError(e.message));return()=>{cancelled=true;};},[slug,pageSlug]);
  useEffect(()=>{setQuote(null);setVoucher(null);setKey(crypto.randomUUID());},[vehicleId,pickupAt,returnAt]);
  const dates=(data:FormData)=>{
    const pickup=new Date(String(data.get('pickupAt'))), dropoff=new Date(String(data.get('returnAt')));
    if (!Number.isFinite(pickup.getTime()) || !Number.isFinite(dropoff.getTime()) || dropoff <= pickup)
      throw new Error('Choose a valid pickup date and a later return date.');
    return {vehicleId:String(data.get('vehicleId')),pickupAt:pickup.toISOString(),returnAt:dropoff.toISOString()};
  };
  async function submit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setError('');
    const data=new FormData(e.currentTarget);
    try {
      if (!quote) setQuote(await publicRequest(`booking/quote?${query}`,dates(data)));
      else {
        const guest=Object.fromEntries(['fullName','email','phone','idOrPassportNumber','licenseNumber','licenseExpiryDate'].map(name=>[name,data.get(name)]));
        setVoucher(await publicRequest(`booking/checkout?${query}`,{...dates(data),guest,paymentMethod:'PAY_LATER',idempotencyKey:key}));
      }
    } catch(e:any){setError(e.message);} finally {setBusy(false);}
  }
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white p-6"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
      <a href={base} className="text-xl font-bold">{site?.branding?.businessName || slug.replace(/-/g,' ')}</a>
      <a href={`/site/${slug}/account`} className="underline">My account</a><nav aria-label="Website navigation" className="flex flex-wrap gap-5">{(site?.activePages || []).map((p:any)=><a key={p.id} href={`${base}${p.slug==='/'?'':p.slug}`}>{p.title}</a>)}<a href={`${base}/fleet#booking`}>Book a car</a></nav>
    </div></header>
    <main className="mx-auto max-w-6xl space-y-10 p-6 py-12">
      {error&&<p role="alert" className="rounded bg-red-50 p-4 text-red-800">{error}</p>}
      {!site&&!error&&<p>Loading website…</p>}
      {page&&<><h1 className="text-4xl font-bold">{page.title}</h1>{page.contentBlocks?.filter((b:any)=>b.type!=='VEHICLE_SHOWCASE').map((block:any)=><section key={block.id} className="space-y-3">
        <h2 className="text-2xl font-semibold">{block.data?.headline || block.title}</h2>
        <p>{block.data?.subheadline || block.data?.richText?.replace(/<[^>]*>/g,'')}</p>
        {block.type==='CONTACT_INFO'&&<address className="not-italic">{['phone','email','address','operatingHours'].map(field=><p key={field}>{block.data?.[field]}</p>)}</address>}
      </section>)}</>}
      {site&&(pageSlug==='/'||pageSlug==='/fleet')&&<>
        <section className="grid gap-6 md:grid-cols-3" aria-label="Our fleet">{cars.map(car=><article key={car.id} className="overflow-hidden rounded-2xl border bg-white">
          {car.primaryImageUrl&&<img src={car.primaryImageUrl} alt={`${car.make} ${car.model}`} className="h-48 w-full object-cover"/>}
          <div className="space-y-3 p-5"><h2 className="text-xl font-semibold">{car.make} {car.model}</h2><p>{car.year} · {car.seatingCapacity} seats · {car.transmission}</p><p>{car.currency} {car.dailyRate?.toLocaleString()} / day</p><button className="rounded bg-emerald-700 px-4 py-2 text-white" onClick={()=>{setVehicleId(car.id);document.getElementById('booking')?.scrollIntoView({behavior:'smooth'});}}>Choose dates</button></div>
        </article>)}</section>
        {!cars.length&&<p>No vehicles are currently published.</p>}
        <section id="booking" className="rounded-2xl border bg-white p-6"><h2 className="mb-5 text-2xl font-bold">Request a booking</h2>
          {voucher?<div role="status"><h3 className="text-xl font-bold">Booking received: {voucher.bookingReference}</h3><p>Status: {voucher.status.replace(/_/g,' ')}. Payment has not been collected. Keep this reference when contacting the rental team.</p></div>:<form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            <label>Vehicle<select name="vehicleId" required className="mt-1 block w-full rounded border p-3" value={vehicleId} onChange={e=>setVehicleId(e.target.value)}><option value="">Choose a vehicle</option>{cars.map(car=><option key={car.id} value={car.id}>{car.make} {car.model}</option>)}</select></label>
            <label>Pickup<input required type="datetime-local" name="pickupAt" className="mt-1 block w-full rounded border p-3" value={pickupAt} onChange={e=>setPickup(e.target.value)}/></label>
            <label>Return<input required type="datetime-local" name="returnAt" className="mt-1 block w-full rounded border p-3" value={returnAt} onChange={e=>setReturn(e.target.value)}/></label>
            {quote&&<><p className="self-center font-semibold">Total: {quote.currency} {quote.grossRentalTotal?.toLocaleString()} · Security deposit: {quote.securityDeposit?.amount?.toLocaleString()}</p>
              {([['fullName','Full name','text'],['email','Email','email'],['phone','Phone','tel'],['idOrPassportNumber','ID / passport number','text'],['licenseNumber','Driving licence number','text'],['licenseExpiryDate','Licence expiry','date']] as const).map(([name,label,type])=><label key={name}>{label}<input required name={name} type={type} className="mt-1 block w-full rounded border p-3"/></label>)}
              <p>Bookings are subject to availability and confirmation by the rental team.</p></>}
            <button disabled={busy} className="rounded bg-emerald-700 p-3 font-semibold text-white disabled:opacity-50">{busy?'Please wait…':quote?'Submit booking':'Get quote'}</button>
          </form>}
        </section>
      </>}
    </main><footer className="border-t p-6 text-center">{slug.replace(/-/g,' ')} · Car rental</footer>
  </div>;
}
