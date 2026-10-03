import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, MailPlus, RefreshCw, ShieldCheck, UserRoundCog, UsersRound } from "lucide-react";
import { apiClient } from "../lib/api-client";
import type { AccessPortal } from "../lib/access-context";

async function call(path:string, body?:any, method?:string) {
  const result=await apiClient.request(`/access${path}`,{
    method:method||(body?"POST":"GET"),
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),
  });
  if(result.error) throw new Error(result.error.message);
  return result.data as any;
}
const roleName=(value:string)=>value.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());

export function TeamWorkspaceView({portal}:{portal:AccessPortal}) {
  const [roles,setRoles]=useState<any[]>([]);
  const [members,setMembers]=useState<any[]>([]);
  const [invitations,setInvitations]=useState<any[]>([]);
  const [links,setLinks]=useState<any[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [inviteRole,setInviteRole]=useState("BOOKING_AGENT");
  const params=useMemo(()=>new URLSearchParams({scope:"tenant",tenantId:portal.tenantId||""}).toString(),[portal.tenantId]);

  const load=useCallback(async()=>{
    const [r,m,i,l]=await Promise.all([
      call(`/roles?${params}`),
      call(`/team?${params}`),
      call(`/invitations?${params}`),
      call(`/link-options?tenantId=${encodeURIComponent(portal.tenantId||"")}`),
    ]);
    setRoles(r||[]);setMembers(m||[]);setInvitations(i||[]);setLinks(l||[]);
  },[params,portal.tenantId]);

  useEffect(()=>{void load().catch(e=>setError(e.message));},[load]);

  async function act(work:()=>Promise<any>,message?:string){
    setBusy(true);setError("");setNotice("");
    try{await work();if(message)setNotice(message);await load();}
    catch(e:any){setError(e.message||"The team change could not be completed.");}
    finally{setBusy(false);}
  }

  async function updateMember(member:any,patch:any){
    await act(()=>call(`/team/${member.id}`,{scope:"tenant",tenantId:portal.tenantId,...patch},"PATCH"),"Team access updated.");
  }

  const activeMembers=members.filter(m=>m.status==="ACTIVE").length;
  const pending=invitations.filter(i=>i.status==="PENDING").length;

  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
    <section className="grid gap-3 sm:grid-cols-3">
      {[["Active team",activeMembers,UsersRound],["Pending invites",pending,MailPlus],["Available roles",roles.length,ShieldCheck]].map(([label,value,Icon]:any)=><div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon size={18}/></span><span className="text-2xl font-black text-slate-950">{value}</span></div><div className="mt-4 text-xs font-bold uppercase tracking-[.14em] text-slate-400">{label}</div></div>)}
    </section>

    {error&&<div role="alert" className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertTriangle size={18}/><span>{error}</span></div>}
    {notice&&<div role="status" className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={18}/><span>{notice}</span></div>}

    <div className="grid gap-6 xl:grid-cols-[.85fr_1.4fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.18em] text-emerald-600">Access administration</p><h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Invite a teammate</h2><p className="mt-2 text-sm leading-6 text-slate-500">Every person uses their own identity. Assign the minimum role they need.</p></div><MailPlus className="text-slate-300"/></div>
        <form className="mt-5 space-y-4" onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const data=Object.fromEntries(new FormData(form));void act(async()=>{await call("/invitations",{scope:"tenant",tenantId:portal.tenantId,email:data.email,role:data.role,...(data.recordId?{linkedRecordId:data.recordId}:{})});form.reset();setInviteRole("BOOKING_AGENT");},"Invitation created.");}}>
          <label className="block text-xs font-bold text-slate-600">Email address<input name="email" type="email" required className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"/></label>
          <label className="block text-xs font-bold text-slate-600">Role<select name="role" value={inviteRole} onChange={e=>setInviteRole(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none focus:border-emerald-500">{roles.map(r=><option key={r.code} value={r.code}>{r.name||roleName(r.code)}</option>)}</select></label>
          {["DRIVER","VEHICLE_OWNER"].includes(inviteRole)&&<label className="block text-xs font-bold text-slate-600">Linked operational record<select name="recordId" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900"><option value="">Link later</option>{links.filter(x=>x.role===inviteRole).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><span className="mt-2 block text-[11px] font-normal leading-5 text-slate-400">Personal Driver and Vehicle Owner portals remain record-scoped.</span></label>}
          <button disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"><MailPlus size={16}/>{busy?"Working…":"Send invitation"}</button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6"><div><p className="text-xs font-black uppercase tracking-[.18em] text-slate-400">Membership</p><h2 className="mt-1 text-xl font-black text-slate-950">Team members</h2></div><button onClick={()=>void act(load)} disabled={busy} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw size={16} className={busy?"animate-spin":""}/></button></div>
        <div className="divide-y divide-slate-100">
          {!members.length?<div className="p-8 text-sm text-slate-400">No team members yet.</div>:members.map(member=><div key={member.id} className="grid gap-4 p-5 sm:grid-cols-[1.2fr_1fr_auto] sm:items-center sm:px-6">
            <div className="min-w-0"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600"><UserRoundCog size={16}/></span><div className="min-w-0"><div className="truncate text-sm font-bold text-slate-900">{member.name||member.email}</div><div className="truncate text-xs text-slate-400">{member.email}</div></div></div></div>
            <div>{member.editable?<select disabled={busy} value={member.role} onChange={e=>void updateMember(member,{role:e.target.value})} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700">{roles.map(r=><option key={r.code} value={r.code}>{r.name||roleName(r.code)}</option>)}</select>:<span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600">{roleName(member.role)}</span>}</div>
            <div className="flex items-center justify-between gap-3 sm:justify-end"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${member.status==="ACTIVE"?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-700"}`}>{member.status}</span>{member.editable&&<button disabled={busy} onClick={()=>void updateMember(member,{status:member.status==="ACTIVE"?"SUSPENDED":"ACTIVE"})} className="text-xs font-bold text-slate-600 hover:text-slate-950">{member.status==="ACTIVE"?"Suspend":"Restore"}</button>}</div>
          </div>)}
        </div>
      </section>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6"><p className="text-xs font-black uppercase tracking-[.18em] text-slate-400">Invitation queue</p><h2 className="mt-1 text-lg font-black text-slate-950">Pending & historical invitations</h2></div>
      <div className="divide-y divide-slate-100">{!invitations.length?<div className="p-8 text-sm text-slate-400">No invitations yet.</div>:invitations.map(inv=><div key={inv.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><div className="text-sm font-bold text-slate-900">{inv.email}</div><div className="mt-1 text-xs text-slate-400">{roleName(inv.role)} · {inv.delivery||"Delivery pending"} · Expires {new Date(inv.expiresAt).toLocaleString()}</div></div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">{inv.status}</span>{inv.status==="PENDING"&&<><button disabled={busy} onClick={()=>void act(()=>call(`/invitations/${inv.id}/resend`,{}),"Invitation resent.")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">Resend</button><button disabled={busy} onClick={()=>void act(()=>call(`/invitations/${inv.id}/revoke`,{}),"Invitation revoked.")} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">Revoke</button></>}</div></div>)}</div>
    </section>
  </div>;
}
