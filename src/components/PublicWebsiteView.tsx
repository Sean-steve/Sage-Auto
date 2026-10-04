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
  const base={id,type,sortOrder:0,title:"",data:{enabled:true}} as any;
  if(type==="HERO")base.data={enabled:true,badge:"",headline:"",subheadline:"",imageUrl:"",primaryCtaLabel:"",primaryCtaLink:"",secondaryCtaLabel:"",secondaryCtaLink:"",showSearchWidget:true};
  if(type==="FEATURE_GRID")base.data={enabled:true,description:"",items:[],columns:3};
  if(type==="VEHICLE_SHOWCASE")base.data={enabled:true,categoryFilter:"ALL",limit:6,layout:"GRID_3",customBadge:"",description:""};
  if(type==="TEXT_IMAGE")base.data={enabled:true,richText:"",imageUrl:"",imageAlignment:"RIGHT",ctaLabel:"",ctaLink:""};
  if(type==="TESTIMONIALS")base.data={enabled:true,description:"",layout:"GRID",testimonials:[]};
  if(type==="FAQ")base.data={enabled:true,description:"",faqs:[]};
  if(type==="CALL_TO_ACTION")base.data={enabled:true,headline:"",description:"",buttonLabel:"",buttonLink:"",accentBadge:""};
  if(type==="CONTACT_INFO")base.data={enabled:true,phone:"",email:"",address:"",operatingHours:"",whatsapp:""};
  return base;
}

export const PublicWebsiteView:React.FC=()=>{
  const {activeTenant}=useApp();
  const [site,setSite]=useState<any>(null),[pages,setPages]=useState<any[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [slug,setSlug]=useState(activeTenant.slug||""),[selected,setSelected]=useState("");
  const [tab,setTab]=useState<"content"|"branding">("content");

  async function request(path:string,body?:unknown,method=body!==undefined?'POST':'GET') {
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
      <main>{selectedPage?<PageEditor key={selectedPage.id} page={selectedPage} pages={pages} busy={busy} save={(blocks,status)=>void act(async()=>{await request(`/pages/${selectedPage.id}`,{contentBlocks:blocks,status},"PUT");})}/>:<div className="rounded-3xl border bg-white p-10 text-center text-slate-500">Select a page to edit.</div>}</main>
    </div>}

    {tab==="branding"&&<BrandingEditor site={site} busy={busy} save={branding=>void act(async()=>{await request("/branding",{branding},"PUT");})}/>}

    <section className="rounded-3xl border bg-slate-950 p-5 text-white sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-emerald-300">Publishing</p><h2 className="mt-1 text-xl font-black">{site.status==="PUBLISHED"?"Your website is live":"Your website is still a draft"}</h2><p className="mt-1 text-sm text-slate-300">Saving changes updates the draft. Publish when you want customers to see the new version.</p></div>{site.status==="PUBLISHED"&&<button disabled={busy} onClick={()=>void act(async()=>{await request("/unpublish",{});})} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold">Take site offline</button>}</div></section>
  </div>;
};

function PageEditor({page,pages,busy,save}:{page:any;pages:any[];busy:boolean;save:(blocks:any[],status:string)=>void}){
  const [blocks,setBlocks]=useState<any[]>(page.contentBlocks||[]);
  const [status,setStatus]=useState(page.status||"PUBLISHED");
  useEffect(()=>{setBlocks(page.contentBlocks||[]);setStatus(page.status||"PUBLISHED");},[page.id,page.version]);

  function normalize(next:any[]){return next.map((b,i)=>({...b,sortOrder:i}));}
  function move(i:number,dir:-1|1){const j=i+dir;if(j<0||j>=blocks.length)return;setBlocks(prev=>{const n=[...prev];[n[i],n[j]]=[n[j],n[i]];return normalize(n);});}
  function setData(i:number,key:string,value:any){setBlocks(prev=>prev.map((b,n)=>n===i?{...b,data:{...b.data,[key]:value}}:b));}
  function setTitle(i:number,value:string){setBlocks(prev=>prev.map((b,n)=>n===i?{...b,title:value}:b));}
  function add(type:string){setBlocks(prev=>normalize([...prev,makeBlock(type)]));}

  return <div className="space-y-5">
    <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.15em] text-emerald-600">Editing page</p><h2 className="mt-1 text-2xl font-black">{page.title}</h2><p className="mt-1 text-sm text-slate-500">{page.slug} · Every section below is tenant-controlled. Add only the sections and content you want customers to see.</p></div><label className="text-xs font-bold text-slate-500">Page visibility<select value={status} onChange={e=>setStatus(e.target.value)} className={input}><option value="PUBLISHED">Visible on website</option><option value="DRAFT">Hidden / draft</option><option value="ARCHIVED">Archived</option></select></label></div></section>

    <div className="space-y-3">{blocks.map((block,i)=><section key={block.id} className={"rounded-3xl border bg-white p-5 shadow-sm "+(block.data?.enabled===false?"opacity-60":"")}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-slate-400">{block.type.replaceAll("_"," ")}</p><h3 className="mt-1 font-black">{block.title||sectionCatalog.find(x=>x[0]===block.type)?.[1]||"Website section"}</h3></div><div className="flex gap-1"><button title="Move up" type="button" onClick={()=>move(i,-1)} className="rounded-lg border p-2"><ArrowUp size={14}/></button><button title="Move down" type="button" onClick={()=>move(i,1)} className="rounded-lg border p-2"><ArrowDown size={14}/></button><button type="button" onClick={()=>setData(i,"enabled",block.data?.enabled===false)} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-bold">{block.data?.enabled===false?<><Eye size={14}/>Show</>:<><EyeOff size={14}/>Hide</>}</button><button type="button" onClick={()=>setBlocks(prev=>normalize(prev.filter((_,n)=>n!==i)))} className="rounded-lg border border-rose-200 p-2 text-rose-600"><Trash2 size={14}/></button></div></div><BlockFields block={block} pages={pages} setTitle={value=>setTitle(i,value)} setData={(key,value)=>setData(i,key,value)}/></section>)}</div>

    <section className="rounded-3xl border border-dashed bg-white p-5"><h3 className="font-black">Add website section</h3><p className="mt-1 text-sm text-slate-500">New sections start blank. Add the section, then configure its content, cards, links and layout yourself.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{sectionCatalog.map(([type,label])=><button type="button" key={type} onClick={()=>add(type)} className="flex items-center gap-2 rounded-xl border px-3 py-3 text-left text-sm font-semibold hover:border-emerald-300 hover:bg-emerald-50"><Plus size={15}/>{label}</button>)}</div></section>

    <div className="sticky bottom-4 flex justify-end"><button disabled={busy} onClick={()=>save(normalize(blocks),status)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg"><Save size={16}/>{busy?"Saving…":"Save page settings"}</button></div>
  </div>;
}

function destinationOptions(pages:any[]){
  const options=[
    {value:"",label:"No link"},
    {value:"/",label:"Home"},
    {value:"/fleet",label:"Fleet catalogue"},
    {value:"/fleet#booking",label:"Booking form"},
    {value:"/account",label:"Renter account"},
    {value:"/track",label:"Track a booking"},
  ];
  const seen=new Set(options.map(x=>x.value));
  for(const page of pages.slice().sort((a,b)=>(a.displayOrder||0)-(b.displayOrder||0))){
    const value=String(page.slug||"");
    if(value&&!seen.has(value)){options.push({value,label:page.title||value});seen.add(value);}
  }
  return options;
}

function DestinationField({label,value,pages,onChange}:{label:string;value:string;pages:any[];onChange:(value:string)=>void}){
  const options=destinationOptions(pages);
  return <label className="text-xs font-bold text-slate-500">{label}<select value={value||""} onChange={e=>onChange(e.target.value)} className={input}>{options.map(option=><option key={option.value||"none"} value={option.value}>{option.label}</option>)}</select></label>;
}

function BlockFields({block,pages,setTitle,setData}:{block:any;pages:any[];setTitle:(value:string)=>void;setData:(key:string,value:any)=>void}){
  const d=block.data||{};
  const rows=(key:string)=>Array.isArray(d[key])?d[key]:[];
  const updateRow=(key:string,index:number,patch:any)=>setData(key,rows(key).map((row:any,i:number)=>i===index?{...row,...patch}:row));
  const removeRow=(key:string,index:number)=>setData(key,rows(key).filter((_:any,i:number)=>i!==index));
  const commonTitle=<label className="text-xs font-bold text-slate-500 sm:col-span-2">Section title<input value={String(block.title||"")} onChange={e=>setTitle(e.target.value)} placeholder="Optional customer-facing heading" className={input}/></label>;

  if(block.type==="HERO")return <div className="mt-4 grid gap-3 sm:grid-cols-2">
    <label className="text-xs font-bold text-slate-500">Eyebrow / badge<input value={d.badge||""} onChange={e=>setData("badge",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500">Headline<input value={d.headline||""} onChange={e=>setData("headline",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500 sm:col-span-2">Subheadline<textarea rows={3} value={d.subheadline||""} onChange={e=>setData("subheadline",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500 sm:col-span-2">Background / supporting image URL<input value={d.imageUrl||""} onChange={e=>setData("imageUrl",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500">Primary button label<input value={d.primaryCtaLabel||""} onChange={e=>setData("primaryCtaLabel",e.target.value)} className={input}/></label>
    <DestinationField label="Primary button destination" value={d.primaryCtaLink||""} pages={pages} onChange={value=>setData("primaryCtaLink",value)}/>
    <label className="text-xs font-bold text-slate-500">Secondary button label<input value={d.secondaryCtaLabel||""} onChange={e=>setData("secondaryCtaLabel",e.target.value)} className={input}/></label>
    <DestinationField label="Secondary button destination" value={d.secondaryCtaLink||""} pages={pages} onChange={value=>setData("secondaryCtaLink",value)}/>
    <label className="flex items-center gap-2 rounded-xl border p-3 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={d.showSearchWidget!==false} onChange={e=>setData("showSearchWidget",e.target.checked)}/>Show live availability search in hero</label>
  </div>;

  if(block.type==="FEATURE_GRID"){
    const items=rows("items");
    return <div className="mt-4 grid gap-3 sm:grid-cols-2">{commonTitle}
      <label className="text-xs font-bold text-slate-500 sm:col-span-2">Section description<textarea rows={2} value={d.description||""} onChange={e=>setData("description",e.target.value)} className={input}/></label>
      <label className="text-xs font-bold text-slate-500">Desktop columns<select value={Number(d.columns||3)} onChange={e=>setData("columns",Number(e.target.value))} className={input}><option value={2}>2 cards</option><option value={3}>3 cards</option><option value={4}>4 cards</option></select></label>
      <div className="sm:col-span-2 space-y-3">{items.map((item:any,index:number)=><div key={index} className="grid gap-3 rounded-2xl border bg-slate-50 p-4 sm:grid-cols-2"><label className="text-xs font-bold text-slate-500">Card title<input value={item.title||""} onChange={e=>updateRow("items",index,{title:e.target.value})} className={input}/></label><label className="text-xs font-bold text-slate-500">Icon<select value={item.icon||"ShieldCheck"} onChange={e=>updateRow("items",index,{icon:e.target.value})} className={input}><option>ShieldCheck</option><option>Clock</option><option>Car</option><option>Star</option><option>MapPin</option></select></label><label className="text-xs font-bold text-slate-500 sm:col-span-2">Description<textarea rows={2} value={item.description||""} onChange={e=>updateRow("items",index,{description:e.target.value})} className={input}/></label><button type="button" onClick={()=>removeRow("items",index)} className="justify-self-start text-xs font-bold text-rose-600">Remove card</button></div>)}</div>
      <button type="button" onClick={()=>setData("items",[...items,{icon:"ShieldCheck",title:"",description:""}])} className="sm:col-span-2 inline-flex w-fit items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold"><Plus size={14}/>Add benefit card</button>
    </div>;
  }

  if(block.type==="VEHICLE_SHOWCASE")return <div className="mt-4 grid gap-3 sm:grid-cols-2">{commonTitle}
    <label className="text-xs font-bold text-slate-500">Eyebrow / badge<input value={d.customBadge||""} onChange={e=>setData("customBadge",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500">Category filter<input value={d.categoryFilter||"ALL"} onChange={e=>setData("categoryFilter",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500 sm:col-span-2">Section description<textarea rows={2} value={d.description||""} onChange={e=>setData("description",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500">Vehicles shown<input type="number" min={1} max={24} value={Number(d.limit||6)} onChange={e=>setData("limit",Number(e.target.value))} className={input}/></label>
    <label className="text-xs font-bold text-slate-500">Layout<select value={d.layout||"GRID_3"} onChange={e=>setData("layout",e.target.value)} className={input}><option value="GRID_2">2-column grid</option><option value="GRID_3">3-column grid</option><option value="GRID_4">4-column grid</option><option value="CAROUSEL">Horizontal carousel</option></select></label>
  </div>;

  if(block.type==="TEXT_IMAGE")return <div className="mt-4 grid gap-3 sm:grid-cols-2">{commonTitle}
    <label className="text-xs font-bold text-slate-500 sm:col-span-2">Content<textarea rows={5} value={d.richText||""} onChange={e=>setData("richText",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500">Image URL<input value={d.imageUrl||""} onChange={e=>setData("imageUrl",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500">Image position<select value={d.imageAlignment||"RIGHT"} onChange={e=>setData("imageAlignment",e.target.value)} className={input}><option value="RIGHT">Right</option><option value="LEFT">Left</option></select></label>
    <label className="text-xs font-bold text-slate-500">Button label<input value={d.ctaLabel||""} onChange={e=>setData("ctaLabel",e.target.value)} className={input}/></label>
    <DestinationField label="Button destination" value={d.ctaLink||""} pages={pages} onChange={value=>setData("ctaLink",value)}/>
  </div>;

  if(block.type==="TESTIMONIALS"){
    const items=rows("testimonials");
    return <div className="mt-4 grid gap-3 sm:grid-cols-2">{commonTitle}
      <label className="text-xs font-bold text-slate-500 sm:col-span-2">Section description<textarea rows={2} value={d.description||""} onChange={e=>setData("description",e.target.value)} className={input}/></label>
      <label className="text-xs font-bold text-slate-500">Card layout<select value={d.layout||"GRID"} onChange={e=>setData("layout",e.target.value)} className={input}><option value="GRID">Responsive grid</option><option value="CAROUSEL">Horizontal carousel</option></select></label>
      <div className="sm:col-span-2 space-y-3">{items.map((item:any,index:number)=><div key={index} className="grid gap-3 rounded-2xl border bg-slate-50 p-4 sm:grid-cols-2"><label className="text-xs font-bold text-slate-500 sm:col-span-2">Review<textarea rows={3} value={item.quote||""} onChange={e=>updateRow("testimonials",index,{quote:e.target.value})} className={input}/></label><label className="text-xs font-bold text-slate-500">Customer name<input value={item.author||""} onChange={e=>updateRow("testimonials",index,{author:e.target.value})} className={input}/></label><label className="text-xs font-bold text-slate-500">Role / context<input value={item.role||""} onChange={e=>updateRow("testimonials",index,{role:e.target.value})} className={input}/></label><label className="text-xs font-bold text-slate-500">Rating<select value={Number(item.rating||5)} onChange={e=>updateRow("testimonials",index,{rating:Number(e.target.value)})} className={input}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} stars</option>)}</select></label><label className="text-xs font-bold text-slate-500">Avatar URL<input value={item.avatarUrl||""} onChange={e=>updateRow("testimonials",index,{avatarUrl:e.target.value})} className={input}/></label><button type="button" onClick={()=>removeRow("testimonials",index)} className="justify-self-start text-xs font-bold text-rose-600">Remove testimonial</button></div>)}</div>
      <button type="button" onClick={()=>setData("testimonials",[...items,{quote:"",author:"",role:"",rating:5,avatarUrl:""}])} className="sm:col-span-2 inline-flex w-fit items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold"><Plus size={14}/>Add testimonial</button>
    </div>;
  }

  if(block.type==="FAQ"){
    const items=rows("faqs");
    return <div className="mt-4 grid gap-3 sm:grid-cols-2">{commonTitle}
      <label className="text-xs font-bold text-slate-500 sm:col-span-2">Section description<textarea rows={2} value={d.description||""} onChange={e=>setData("description",e.target.value)} className={input}/></label>
      <div className="sm:col-span-2 space-y-3">{items.map((item:any,index:number)=><div key={index} className="grid gap-3 rounded-2xl border bg-slate-50 p-4"><label className="text-xs font-bold text-slate-500">Question<input value={item.question||""} onChange={e=>updateRow("faqs",index,{question:e.target.value})} className={input}/></label><label className="text-xs font-bold text-slate-500">Answer<textarea rows={3} value={item.answer||""} onChange={e=>updateRow("faqs",index,{answer:e.target.value})} className={input}/></label><button type="button" onClick={()=>removeRow("faqs",index)} className="justify-self-start text-xs font-bold text-rose-600">Remove FAQ</button></div>)}</div>
      <button type="button" onClick={()=>setData("faqs",[...items,{question:"",answer:""}])} className="sm:col-span-2 inline-flex w-fit items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold"><Plus size={14}/>Add FAQ</button>
    </div>;
  }

  if(block.type==="CALL_TO_ACTION")return <div className="mt-4 grid gap-3 sm:grid-cols-2">{commonTitle}
    <label className="text-xs font-bold text-slate-500">Eyebrow / badge<input value={d.accentBadge||""} onChange={e=>setData("accentBadge",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500">Headline<input value={d.headline||""} onChange={e=>setData("headline",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500 sm:col-span-2">Description<textarea rows={3} value={d.description||""} onChange={e=>setData("description",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500">Button label<input value={d.buttonLabel||""} onChange={e=>setData("buttonLabel",e.target.value)} className={input}/></label>
    <DestinationField label="Button destination" value={d.buttonLink||""} pages={pages} onChange={value=>setData("buttonLink",value)}/>
  </div>;

  if(block.type==="CONTACT_INFO")return <div className="mt-4 grid gap-3 sm:grid-cols-2">{commonTitle}
    <label className="text-xs font-bold text-slate-500">Phone<input value={d.phone||""} onChange={e=>setData("phone",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500">Email<input value={d.email||""} onChange={e=>setData("email",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500 sm:col-span-2">Address<textarea rows={2} value={d.address||""} onChange={e=>setData("address",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500 sm:col-span-2">Opening hours<textarea rows={2} value={d.operatingHours||""} onChange={e=>setData("operatingHours",e.target.value)} className={input}/></label>
    <label className="text-xs font-bold text-slate-500">WhatsApp<input value={d.whatsapp||""} onChange={e=>setData("whatsapp",e.target.value)} className={input}/></label>
  </div>;

  return <div className="mt-4">{commonTitle}</div>;
}

function BrandingEditor({site,busy,save}:{site:any;busy:boolean;save:(b:any)=>void}){
  const [branding,setBranding]=useState<any>(site.branding||{});
  useEffect(()=>setBranding(site.branding||{}),[site.updatedAt]);
  const set=(k:string,v:any)=>setBranding((b:any)=>({...b,[k]:v}));
  return <section className="rounded-3xl border bg-white p-5 shadow-sm sm:p-7"><div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Palette size={20}/></div><div><h2 className="text-xl font-black">Brand appearance</h2><p className="mt-1 text-sm text-slate-500">These values drive the public storefront theme.</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{["primaryColor","secondaryColor","accentColor","backgroundColor"].map(k=><label key={k} className="text-xs font-bold text-slate-500">{k.replace(/([A-Z])/g," $1")}<div className="mt-1 flex gap-2"><input type="color" value={branding[k]||"#ffffff"} onChange={e=>set(k,e.target.value)} className="h-11 w-12 rounded border p-1"/><input value={branding[k]||""} onChange={e=>set(k,e.target.value)} className="min-w-0 flex-1 rounded-xl border px-3"/></div></label>)}<label className="text-xs font-bold text-slate-500 sm:col-span-2">Logo URL<input value={branding.logoUrl||""} onChange={e=>set("logoUrl",e.target.value)} className={input}/></label><label className="text-xs font-bold text-slate-500">Heading font<select value={branding.fontHeading||"Outfit"} onChange={e=>set("fontHeading",e.target.value)} className={input}><option>Outfit</option><option>Plus Jakarta Sans</option><option>Inter</option><option>Montserrat</option><option>Playfair Display</option></select></label></div><button disabled={busy} onClick={()=>save(branding)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white"><Save size={16}/>Save branding</button></section>;
}
function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-slate-400">{icon}<span className="text-xs font-bold uppercase tracking-wide">{label}</span></div><p className="mt-2 text-xl font-black">{value}</p></div>;}
