import React,{useEffect,useMemo,useState} from "react";
import {ArrowDown,ArrowUp,Eye,EyeOff,ExternalLink,Globe2,LayoutTemplate,Palette,Plus,Save,Trash2} from "lucide-react";
import {useApp} from "../lib/store";
import {apiClient} from "../lib/api-client";

const input="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-500";
const sectionCatalog=[
  ["HERO","Hero / booking introduction"],
  ["FEATURE_GRID","Why choose us / benefits"],
  ["VEHICLE_SHOWCASE","Fleet showcase"],
  ["TEXT_IMAGE","Story / service information"],
  ["TESTIMONIALS","Customer testimonials"],
  ["FAQ","Frequently asked questions"],
  ["CALL_TO_ACTION","Booking call to action"],
  ["CONTACT_INFO","Contact & opening hours"],
] as const;

function makeBlock(type:string){
  const id=`blk-${crypto.randomUUID().slice(0,8)}`;
  const base={id,type,sortOrder:0,title:sectionCatalog.find(x=>x[0]===type)?.[1]||type,data:{enabled:true}} as any;
  if(type==="HERO")base.data={enabled:true,badge:"Drive with confidence",headline:"Find the right car for every journey",subheadline:"Transparent pricing, live availability and a smoother rental experience.",primaryCtaLabel:"Browse fleet",primaryCtaLink:"/fleet",showSearchWidget:true};
  if(type==="FEATURE_GRID")base.data={enabled:true,items:[{icon:"ShieldCheck",title:"Clear rental terms",description:"Know the price, deposit and booking status before pickup."},{icon:"Clock",title:"Fast booking",description:"Choose your dates and send your request online."},{icon:"Car",title:"Quality fleet",description:"Browse published, operational vehicles from the live fleet."}],columns:3};
  if(type==="VEHICLE_SHOWCASE")base.data={enabled:true,categoryFilter:"ALL",limit:6,layout:"GRID_3",customBadge:"Available fleet"};
  if(type==="TEXT_IMAGE")base.data={enabled:true,richText:"<p>Tell customers what makes your rental company different, where you operate, and the experience they can expect.</p>",imageAlignment:"RIGHT"};
  if(type==="TESTIMONIALS")base.data={enabled:true,testimonials:[{quote:"Great service and a smooth pickup experience.",author:"Customer",rating:5}]};
  if(type==="FAQ")base.data={enabled:true,faqs:[{question:"What do I need to rent a car?",answer:"Bring a valid driving licence and the identification requested during booking."},{question:"When is my booking confirmed?",answer:"Your renter account updates as the rental team reviews and confirms the reservation."}]};
  if(type==="CALL_TO_ACTION")base.data={enabled:true,headline:"Ready to book your next drive?",description:"Choose your vehicle and dates, then follow the booking from your renter account.",buttonLabel:"Browse vehicles",buttonLink:"/fleet"};
  if(type==="CONTACT_INFO")base.data={enabled:true,phone:"",email:"",address:"",operatingHours:""};
  return base;
}

export const PublicWebsiteView:React.FC=()=>{
  const {activeTenant}=useApp();
  const [site,setSite]=useState<any>(null),[pages,setPages]=useState<any[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [slug,setSlug]=useState(activeTenant.slug||""),[selected,setSelected]=useState("");
  const [tab,setTab]=useState<"content"|"branding">("content");

  async function request(path:string,body?:unknown,method=body!==undefined?"POST":"GET"){
    const result=await apiClient.request(`/website${path}`,{method,...(body!==undefined?{body:JSON.stringify(body)}:{})});
    if(result.error)throw new Error(result.error.message);
    return result.data;
  }
  async function load(){
    setError("");
    const result=await apiClient.get("/website");
    if(result.error){if(result.error.code!=="HTTP_404"&&!result.error.code.includes("NOT_FOUND"))setError(result.error.message);return;}
    setSite(result.data);setSlug((result.data as any).subdomain);
    const next=await request("/pages");
    setPages(next||[]);
    setSelected(current=>current&&next.some((p:any)=>p.id===current)?current:(next.find((p:any)=>p.slug==="/")?.id||next[0]?.id||""));
  }
  useEffect(()=>{setSite(null);setPages([]);setSelected("");void load().catch(e=>setError(e.message));},[activeTenant.id]);
  async function act(fn:()=>Promise<void>){setBusy(true);setError("");try{await fn();await load();}catch(e:any){setError(e.message);}finally{setBusy(false);}}
  const url=site?`${location.origin}/site/${site.subdomain}`:"";
  const selectedPage=pages.find(p=>p.id===selected);

  if(!site)return <div className="mx-auto max-w-4xl p-6 sm:p-8"><div className="rounded-3xl border bg-white p-6 shadow-sm sm:p-8"><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-600">Public storefront</p><h1 className="mt-2 text-3xl font-black">Launch your rental website</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Your website connects directly to Fleet, live Availability and public booking. You control the sections and publish only when ready.</p>{error&&<p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<form onSubmit={e=>{e.preventDefault();void act(async()=>{await request("/init",{subdomain:slug});});}} className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]"><label className="text-sm font-semibold">Website address<input required pattern="[a-z0-9-]{2,80}" value={slug} onChange={e=>setSlug(e.target.value)} className={input}/><span className="mt-1 block text-xs font-normal text-slate-400">{location.origin}/site/{slug}</span></label><button disabled={busy} className="self-end rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">{busy?"Creating…":"Create website"}</button></form></div></div>;

  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-600">Storefront studio</p><h1 className="mt-1 text-3xl font-black">Public website</h1><p className="mt-2 max-w-3xl text-sm text-slate-500">Choose which sections appear, edit the customer-facing copy and publish a complete website connected to your live fleet and online booking.</p></div>
      <div className="flex flex-wrap gap-2">{site.status==="PUBLISHED"&&<a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-bold"><ExternalLink size={15}/>Open live website</a>}<button disabled={busy} onClick={()=>void act(async()=>{await request("/publish",{changeSummary:"Website content and section configuration updated"});})} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white">Publish changes</button></div>
    </header>

    {error&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}

    <section className="grid gap-3 sm:grid-cols-3">
      <Metric icon={<Globe2 size={17}/>} label="Website status" value={site.status}/>
      <Metric icon={<LayoutTemplate size={17}/>} label="Published pages" value={String(pages.filter(p=>p.status==="PUBLISHED").length)}/>
      <Metric icon={<Eye size={17}/>} label="Published version" value={String(site.publishedVersion||0)}/>
    </section>

    <div className="flex gap-2 border-b pb-3"><button onClick={()=>setTab("content")} className={"rounded-xl px-4 py-2 text-sm font-bold "+(tab==="content"?"bg-slate-950 text-white":"bg-white text-slate-600")}>Page content & sections</button><button onClick={()=>setTab("branding")} className={"rounded-xl px-4 py-2 text-sm font-bold "+(tab==="branding"?"bg-slate-950 text-white":"bg-white text-slate-600")}>Branding</button></div>

    {tab==="content"&&<div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="h-fit rounded-3xl border bg-white p-4 shadow-sm"><p className="px-2 text-xs font-black uppercase tracking-[.15em] text-slate-400">Pages</p><div className="mt-3 space-y-1">{pages.slice().sort((a,b)=>a.displayOrder-b.displayOrder).map(page=><button key={page.id} onClick={()=>setSelected(page.id)} className={"w-full rounded-xl px-3 py-3 text-left "+(selected===page.id?"bg-slate-950 text-white":"hover:bg-slate-50")}><div className="flex items-center justify-between gap-2"><span className="text-sm font-bold">{page.title}</span><span className="text-[10px] opacity-60">{page.status}</span></div><p className="mt-1 text-xs opacity-60">{page.slug}</p></button>)}</div></aside>
      <main>{selectedPage?<PageEditor key={selectedPage.id} page={selectedPage} busy={busy} save={(blocks,status)=>void act(async()=>{await request(`/pages/${selectedPage.id}`,{contentBlocks:blocks,status},"PUT");})}/>:<div className="rounded-3xl border bg-white p-10 text-center text-slate-500">Select a page to edit.</div>}</main>
    </div>}

    {tab==="branding"&&<BrandingEditor site={site} busy={busy} save={branding=>void act(async()=>{await request("/branding",{branding},"PUT");})}/>}

    <section className="rounded-3xl border bg-slate-950 p-5 text-white sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-emerald-300">Publishing</p><h2 className="mt-1 text-xl font-black">{site.status==="PUBLISHED"?"Your website is live":"Your website is still a draft"}</h2><p className="mt-1 text-sm text-slate-300">Saving changes updates the draft. Publish when you want customers to see the new version.</p></div>{site.status==="PUBLISHED"&&<button disabled={busy} onClick={()=>void act(async()=>{await request("/unpublish",{});})} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold">Take site offline</button>}</div></section>
  </div>;
};

function PageEditor({page,busy,save}:{page:any;busy:boolean;save:(blocks:any[],status:string)=>void}){
  const [blocks,setBlocks]=useState<any[]>(page.contentBlocks||[]);
  const [status,setStatus]=useState(page.status||"PUBLISHED");
  useEffect(()=>{setBlocks(page.contentBlocks||[]);setStatus(page.status||"PUBLISHED");},[page.id,page.version]);

  function normalize(next:any[]){return next.map((b,i)=>({...b,sortOrder:i}));}
  function move(i:number,dir:-1|1){const j=i+dir;if(j<0||j>=blocks.length)return;setBlocks(prev=>{const n=[...prev];[n[i],n[j]]=[n[j],n[i]];return normalize(n);});}
  function setData(i:number,key:string,value:any){setBlocks(prev=>prev.map((b,n)=>n===i?{...b,data:{...b.data,[key]:value}}:b));}
  function add(type:string){setBlocks(prev=>normalize([...prev,makeBlock(type)]));}

  return <div className="space-y-5">
    <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.15em] text-emerald-600">Editing page</p><h2 className="mt-1 text-2xl font-black">{page.title}</h2><p className="mt-1 text-sm text-slate-500">{page.slug} · Turn sections on/off, reorder them, or add a new section below.</p></div><label className="text-xs font-bold text-slate-500">Page visibility<select value={status} onChange={e=>setStatus(e.target.value)} className={input}><option value="PUBLISHED">Visible on website</option><option value="DRAFT">Hidden / draft</option><option value="ARCHIVED">Archived</option></select></label></div></section>

    <div className="space-y-3">{blocks.map((block,i)=><section key={block.id} className={"rounded-3xl border bg-white p-5 shadow-sm "+(block.data?.enabled===false?"opacity-60":"")}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-slate-400">{block.type.replaceAll("_"," ")}</p><h3 className="mt-1 font-black">{block.title||"Website section"}</h3></div><div className="flex gap-1"><button title="Move up" type="button" onClick={()=>move(i,-1)} className="rounded-lg border p-2"><ArrowUp size={14}/></button><button title="Move down" type="button" onClick={()=>move(i,1)} className="rounded-lg border p-2"><ArrowDown size={14}/></button><button type="button" onClick={()=>setData(i,"enabled",block.data?.enabled===false)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-bold">{block.data?.enabled===false?<><Eye size={14}/>Show</>:<><EyeOff size={14}/>Hide</>}</button><button type="button" onClick={()=>setBlocks(prev=>normalize(prev.filter((_,n)=>n!==i)))} className="rounded-lg border border-rose-200 p-2 text-rose-600"><Trash2 size={14}/></button></div></div><BlockFields block={block} setData={(key,value)=>setData(i,key,value)}/></section>)}</div>

    <section className="rounded-3xl border border-dashed bg-white p-5"><h3 className="font-black">Add website section</h3><p className="mt-1 text-sm text-slate-500">Build out a full site without code. New sections are added to this page and can be hidden later.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{sectionCatalog.map(([type,label])=><button type="button" key={type} onClick={()=>add(type)} className="flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-semibold hover:border-emerald-300 hover:bg-emerald-50"><Plus size={15}/>{label}</button>)}</div></section>

    <div className="sticky bottom-4 flex justify-end"><button disabled={busy} onClick={()=>save(normalize(blocks),status)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg"><Save size={16}/>{busy?"Saving…":"Save page settings"}</button></div>
  </div>;
}

function BlockFields({block,setData}:{block:any;setData:(key:string,value:any)=>void}){
  const d=block.data||{};
  const fields:string[]=block.type==="HERO"?["badge","headline","subheadline","primaryCtaLabel","primaryCtaLink","imageUrl"]:block.type==="TEXT_IMAGE"?["richText","imageUrl","ctaLabel","ctaLink"]:block.type==="CALL_TO_ACTION"?["headline","description","buttonLabel","buttonLink","accentBadge"]:block.type==="CONTACT_INFO"?["phone","email","address","operatingHours","whatsapp"]:block.type==="VEHICLE_SHOWCASE"?["categoryFilter","customBadge"]: [];
  return <div className="mt-4 grid gap-3 sm:grid-cols-2">{fields.map(key=><label key={key} className={"text-xs font-bold text-slate-500 "+(["subheadline","richText","description","address","operatingHours"].includes(key)?"sm:col-span-2":"")}>{key.replace(/([A-Z])/g," $1").replace(/^./,c=>c.toUpperCase())}{["subheadline","richText","description","address","operatingHours"].includes(key)?<textarea rows={3} value={String(d[key]||"")} onChange={e=>setData(key,e.target.value)} className={input}/>:<input value={String(d[key]||"")} onChange={e=>setData(key,e.target.value)} className={input}/>}</label>)}{block.type==="FEATURE_GRID"&&<ListSummary title="Benefit cards" count={d.items?.length||0}/>} {block.type==="FAQ"&&<ListSummary title="FAQ entries" count={d.faqs?.length||0}/>} {block.type==="TESTIMONIALS"&&<ListSummary title="Testimonials" count={d.testimonials?.length||0}/>}</div>;
}
function ListSummary({title,count}:{title:string;count:number}){return <div className="sm:col-span-2 rounded-xl bg-slate-50 p-3 text-sm"><strong>{title}</strong><span className="ml-2 text-slate-500">{count} configured. Defaults are rendered on the public site; structured item editing can be expanded later without changing the section contract.</span></div>;}

function BrandingEditor({site,busy,save}:{site:any;busy:boolean;save:(b:any)=>void}){
  const [branding,setBranding]=useState<any>(site.branding||{});
  useEffect(()=>setBranding(site.branding||{}),[site.updatedAt]);
  const set=(k:string,v:any)=>setBranding((b:any)=>({...b,[k]:v}));
  return <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7"><div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Palette size={20}/></div><div><h2 className="text-xl font-black">Brand appearance</h2><p className="mt-1 text-sm text-slate-500">These values drive the public storefront theme.</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{["primaryColor","secondaryColor","accentColor","backgroundColor"].map(k=><label key={k} className="text-xs font-bold text-slate-500">{k.replace(/([A-Z])/g," $1")}<div className="mt-1 flex gap-2"><input type="color" value={branding[k]||"#ffffff"} onChange={e=>set(k,e.target.value)} className="h-11 w-12 rounded border p-1"/><input value={branding[k]||""} onChange={e=>set(k,e.target.value)} className="min-w-0 flex-1 rounded-xl border px-3"/></div></label>)}<label className="text-xs font-bold text-slate-500 sm:col-span-2">Logo URL<input value={branding.logoUrl||""} onChange={e=>set("logoUrl",e.target.value)} className={input}/></label><label className="text-xs font-bold text-slate-500">Heading font<select value={branding.fontHeading||"Outfit"} onChange={e=>set("fontHeading",e.target.value)} className={input}><option>Outfit</option><option>Plus Jakarta Sans</option><option>Inter</option><option>Montserrat</option><option>Playfair Display</option></select></label></div><button disabled={busy} onClick={()=>save(branding)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white"><Save size={16}/>Save branding</button></section>;
}
function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-slate-400">{icon}<span className="text-xs font-bold uppercase tracking-wide">{label}</span></div><p className="mt-2 text-xl font-black">{value}</p></div>;}
