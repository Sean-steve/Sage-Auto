import React, {useEffect,useState} from 'react';
import {useApp} from '../lib/store';
import {apiClient} from '../lib/api-client';

export const PublicWebsiteView:React.FC=()=>{
  const {activeTenant}=useApp();
  const [site,setSite]=useState<any>(null),[pages,setPages]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [slug,setSlug]=useState(activeTenant.slug||''),[selected,setSelected]=useState(''),[content,setContent]=useState('');
  async function request(path:string,body?:unknown,method=body!==undefined?'POST':'GET') {
    const result=await apiClient.request(`/website${path}`,{method,...(body!==undefined?{body:JSON.stringify(body)}:{})});
    if(result.error)throw new Error(result.error.message);
    return result.data;
  }
  async function load(){const result=await apiClient.get('/website');if(result.error){if(result.error.code!=='HTTP_404'&&!result.error.code.includes('NOT_FOUND'))setError(result.error.message);return;}setSite(result.data);setSlug(result.data.subdomain);setPages(await request('/pages'));}
  useEffect(()=>{setSite(null);setPages([]);load().catch(e=>setError(e.message));},[activeTenant.id]);
  async function act(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();await load();}catch(e:any){setError(e.message);}finally{setBusy(false);}}
  const url=site?`${location.origin}/site/${site.subdomain}`:'';
  return <div className="mx-auto max-w-5xl space-y-6 p-8"><h1 className="text-3xl font-bold">Your public website</h1>
    <p>Publish a complete website with your fleet and online booking. Submitted bookings appear in Bookings.</p>
    {error&&<p role="alert" className="rounded bg-red-100 p-4 text-red-900">{error}</p>}
    {!site?<form onSubmit={e=>{e.preventDefault();act(async()=>{await request('/init',{subdomain:slug});});}} className="space-y-4 rounded-xl border p-6"><label>Website address<input required pattern="[a-z0-9-]{2,80}" value={slug} onChange={e=>setSlug(e.target.value)} className="ml-3 rounded border p-2"/></label><p>{location.origin}/site/{slug}</p><button disabled={busy} className="rounded bg-emerald-700 px-5 py-3 text-white">Create website</button></form>:<>
      <section className="space-y-4 rounded-xl border bg-white p-6 text-slate-900"><p>Status: <strong>{site.status}</strong></p>{site.status==='PUBLISHED'?<a href={url} target="_blank" rel="noreferrer" className="break-all font-semibold text-emerald-700 underline">Visit live website · {url}</a>:<div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This website is not public yet. Publish the current draft before opening the public URL.</div>}<p>This address works on the same host as your application. Custom domains need DNS and hosting configuration.</p><div className="flex gap-3"><button disabled={busy} onClick={()=>act(async()=>{await request('/publish',{});})} className="rounded bg-emerald-700 px-5 py-3 text-white">Publish changes</button><button disabled={busy||site.status!=='PUBLISHED'} onClick={()=>act(async()=>{await request('/unpublish',{});})} className="rounded border px-5 py-3 disabled:opacity-50">Unpublish</button></div></section>
      <section className="space-y-4 rounded-xl border p-6"><h2 className="text-xl font-semibold">Page content</h2><label className="block">Page<select value={selected} onChange={e=>{setSelected(e.target.value);const page=pages.find(p=>p.id===e.target.value);setContent(JSON.stringify(page?.contentBlocks||[],null,2));}} className="ml-3 rounded border p-2 text-slate-900"><option value="">Select a page</option>{pages.map(page=><option key={page.id} value={page.id}>{page.title}</option>)}</select></label>
      {selected&&<PageEditor page={pages.find(p=>p.id===selected)} busy={busy} save={blocks=>act(async()=>{await request(`/pages/${selected}`,{contentBlocks:blocks},'PUT');})}/>}
      <p>Save your page edits, then publish changes to make them visible to visitors.</p></section>
    </>}
  </div>;
};
function PageEditor({page,busy,save}:{page:any,busy:boolean,save:(blocks:any[])=>void}){
  const [blocks,setBlocks]=useState<any[]>(page?.contentBlocks||[]);
  useEffect(()=>setBlocks(page?.contentBlocks||[]),[page]);
  return <form onSubmit={e=>{e.preventDefault();save(blocks);}} className="space-y-4">{blocks.map((block,i)=><fieldset key={block.id} className="space-y-3"><legend className="font-semibold">{block.title}</legend>{Object.entries(block.data||{}).filter(([key,value])=>typeof value==='string'&&['headline','subheadline','richText','phone','email','address','operatingHours'].includes(key)).map(([key,value])=><label key={key} className="block">{{richText:'Text',operatingHours:'Opening hours',subheadline:'Introduction'}[key]||key}<textarea value={String(value)} onChange={e=>setBlocks(prev=>prev.map((b,n)=>n===i?{...b,data:{...b.data,[key]:e.target.value}}:b))} className="mt-1 block w-full rounded border p-3 text-slate-900"/></label>)}</fieldset>)}<button disabled={busy} className="rounded bg-slate-800 px-5 py-3 text-white">Save page</button></form>;
}
