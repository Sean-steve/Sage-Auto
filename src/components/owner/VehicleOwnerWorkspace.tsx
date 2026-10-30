import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight, BadgeCheck, CalendarClock, CarFront,
  CircleAlert, ClipboardCheck, FileText, Handshake, LayoutDashboard,
  LogOut, Menu, RefreshCw, ScrollText, ShieldCheck, Wallet, X,
  CircleDollarSign, Building2, UserRound, FolderOpen, MessageCircle,
} from "lucide-react";
import type { AccessContext, AccessPortal } from "../../lib/access-context";
import { apiClient } from "../../lib/api-client";
import "./vehicle-owner.css";

type Props = {
  context: AccessContext;
  portal: AccessPortal;
  section: string;
  onSection: (section: string) => void;
  onSwitch: () => void;
  onSignOut: () => void;
};

const ICONS: Record<string, React.ReactNode> = {
  ownerOverview:<LayoutDashboard/>,myVehicles:<CarFront/>,ownerPerformance:<Activity/>,
  ownerCondition:<ClipboardCheck/>,ownerAgreements:<Handshake/>,ownerAgreementDetails:<ScrollText/>,
  mySettlements:<Wallet/>,ownerStatements:<FileText/>,ownerPayouts:<CircleDollarSign/>,
  ownerDisputes:<MessageCircle/>,ownerDocuments:<FolderOpen/>,ownerAccount:<UserRound/>,
  ownerOperators:<Building2/>,
};
const ENDPOINTS: Record<string,string|null> = {
  ownerOverview:"overview",myVehicles:"vehicles",ownerPerformance:"rentals",
  ownerCondition:"condition",ownerAgreements:"agreements",ownerAgreementDetails:"agreements",
  mySettlements:"settlements",ownerStatements:"settlements",ownerPayouts:"settlements",
  ownerDisputes:"settlements",ownerDocuments:null,ownerAccount:"profile",
  ownerOperators:"operators",
};
const GROUPS = [
  {title:"YOUR SPACE",ids:["ownerOverview","myVehicles","ownerPerformance","ownerCondition"]},
  {title:"OWNERSHIP",ids:["ownerAgreements","ownerAgreementDetails","ownerDocuments"]},
  {title:"MONEY & STATEMENTS",ids:["mySettlements","ownerStatements","ownerPayouts","ownerDisputes"]},
  {title:"ACCOUNT",ids:["ownerAccount","ownerOperators"]},
];
function money(value:unknown,currency:unknown) {
  if((typeof value!=="string"&&typeof value!=="number")||typeof currency!=="string")return "Not recorded";
  const amount=Number(value);if(!Number.isFinite(amount))return "Not recorded";
  try{return new Intl.NumberFormat("en-KE",{style:"currency",currency,maximumFractionDigits:2}).format(amount);}
  catch{return String(value)+" "+currency;}
}
function friendly(v:unknown) {
  if(v===undefined||v===null||v==="")return "—";
  if(typeof v==="boolean")return v?"Yes":"No";
  if(typeof v==="object")return "View statement";
  return String(v);
}
function date(v:unknown) {
  if(!v)return "—";const d=new Date(String(v));
  return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("en-KE",{day:"numeric",month:"short",year:"numeric"});
}
function pill(v:unknown) {
  const state=String(v||"NOT RECORDED").toUpperCase();
  const tone=/^(ACTIVE|AVAILABLE|PAID|COMPLETED|VERIFIED)$/.test(state)?"good":
    /(DISPUTED|CANCELLED|FAILED|EXPIRED|SUSPENDED)/.test(state)?"risk":"neutral";
  return <span className={"owner-pill "+tone}>{state.replaceAll("_"," ")}</span>;
}
function Panel({title,subtitle,children,actions}:{title:string;subtitle?:string;children:React.ReactNode;actions?:React.ReactNode}) {
  return <section className="owner-panel"><header><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{actions}</header>{children}</section>;
}
function Table({records,columns,empty="No saved records to show."}:{
  records:any[];columns:Array<{label:string;render:(v:any)=>React.ReactNode}>;empty?:string
}) {
  return <div className="owner-overflow">{records.length?<table><thead><tr>{columns.map((c,i)=><th scope="col" key={i}>{c.label}</th>)}</tr></thead><tbody>
    {records.map((record,i)=><tr key={record.id||i}>{columns.map((c,j)=><td key={j}>{c.render(record)}</td>)}</tr>)}
  </tbody></table>:<div className="owner-empty">{empty}</div>}</div>;
}
async function ownerGet<T>(path:string,portal:string):Promise<T> {
  const resp=await apiClient.get<T>("/access/owner/"+path+"?"+new URLSearchParams({portal}));
  if(resp.error)throw new Error(resp.error.message);
  return resp.data as T;
}
async function ownerPost<T>(path:string,body:unknown):Promise<T> {
  const resp=await apiClient.post<T>("/access/owner/"+path,body);
  if(resp.error)throw new Error(resp.error.message);
  return resp.data as T;
}
const PAYMENT_TOOLTIP="An approved settlement is not proof of payment. Only a verified paid payable counts as disbursed.";

export function VehicleOwnerWorkspace({context,portal,section,onSection,onSwitch,onSignOut}:Props) {
  const [data,setData]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [feedback,setFeedback]=useState("");
  const [revision,setRevision]=useState(0);
  const [openMenu,setOpenMenu]=useState(false);
  const [selected,setSelected]=useState("");
  const [statement,setStatement]=useState<any>(null);
  const [statementBusy,setStatementBusy]=useState(false);
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [confirmDispute,setConfirmDispute]=useState(false);
  const sections=useMemo(()=>new Map(portal.sections.map(s=>[s.id,s.label])),[portal.sections]);
  const endpoint=ENDPOINTS[section];
  const isOwner=portal.kind==="tenant"&&portal.roles.includes("VEHICLE_OWNER")&&Boolean(portal.tenantId);
  useEffect(()=>{setSelected("");setStatement(null);setFeedback("");setError("");setConfirmDispute(false);},[section,portal.id]);
  useEffect(()=>{
    let live=true;
    setData(null);setError("");setLoading(true);
    if(!isOwner){setError("This account does not have a verified Vehicle Owner workspace.");setLoading(false);return;}
    if(!endpoint){setLoading(false);return;}
    void ownerGet(endpoint,portal.tenantId!).then(result=>{if(live)setData(result);})
      .catch(e=>{if(live)setError(e.message||"Unable to load owner records.");})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false};
  },[section,portal.id,portal.tenantId,endpoint,isOwner,revision]);

  const rows=Array.isArray(data)?data:[];
  const settlements=rows.filter((s:any)=>s.reference&&s.currency);
  const showStatement=async(id:string)=>{
    if(!settlements.some((s:any)=>s.id===id))return;
    setSelected(id);setStatement(null);setStatementBusy(true);setError("");
    try{setStatement(await ownerGet("settlements/"+encodeURIComponent(id)+"/statement",portal.tenantId!));}
    catch(e:any){setError(e.message);}
    finally{setStatementBusy(false);}
  };
  const dispute=async()=>{
    if(!selected||!settlements.some((s:any)=>s.id===selected)||reason.trim().length<8)return;
    setBusy(true);setError("");
    try{
      await ownerPost("settlements/"+encodeURIComponent(selected)+"/dispute",{portal:portal.tenantId,reason:reason.trim()});
      setConfirmDispute(false);setReason("");setFeedback("Dispute submitted to the rental operator. The settlement status is being refreshed.");setRevision(n=>n+1);
    }catch(e:any){setError(e.message||"The dispute was not accepted by the settlement service.");}
    finally{setBusy(false);}
  };
  const heading=sections.get(section)||"Owner portal";
  function content():React.ReactNode {
    if(section==="ownerDocuments")return <Panel title="Owner documents" subtitle="Document permissions must be verified before files can be shared.">
      <div className="owner-placeholder"><FolderOpen size={26}/><h3>Secure documents are not connected yet</h3>
        <p>Agreement and registration documents need owner-specific file access. For now request documents from your rental company. Other company files are not accessible through this portal.</p></div>
    </Panel>;
    if(loading)return <p className="owner-loading" role="status"><RefreshCw size={17}/> Loading verified owner data…</p>;
    if(error&&!data)return <Panel title="Unable to load this workspace"><div className="owner-warning" role="alert">{error}</div>
      <button className="owner-button" onClick={()=>setRevision(n=>n+1)}>Retry</button></Panel>;
    if(section==="ownerOverview"){
      return <div className="owner-stack">
        <div className="owner-stat-grid">{[
          ["Vehicles in your care",data?.fleetCount,"Current active ownership"],
          ["Available vehicles",data?.available,"Currently available for rent"],
          ["Settlement periods",data?.settlementCount,"Recorded settlement batches"],
          ["Not marked paid",data?.unpaidSettlementCount,"Includes draft and pending obligations"],
        ].map(([label,value,desc])=><div className="owner-stat" key={label}><span>{label}</span><strong>{friendly(value)}</strong><small>{desc}</small></div>)}</div>
        <Panel title="Latest settlement activity" subtitle={PAYMENT_TOOLTIP}>
          <Table records={data?.lastSettlements||[]} columns={[
            {label:"Settlement",render:r=>r.reference},
            {label:"Period",render:r=>date(r.periodEnd)},
            {label:"Owner net payable",render:r=>money(r.netPayable,r.currency)},
            {label:"Payout",render:r=>pill(r.payableStatus||"NOT DISBURSED")},
          ]}/>
          <div className="owner-action-row"><button className="owner-button" onClick={()=>onSection("mySettlements")}>Explore earnings <ArrowRight size={15}/></button>
            <button className="owner-secondary" onClick={()=>onSection("myVehicles")}>View your vehicles</button></div>
        </Panel>
      </div>;
    }
    if(section==="myVehicles")return <Panel title="Your vehicles" subtitle="Vehicles with active ownership agreements linked to your account.">
      <Table records={rows} columns={[
        {label:"Vehicle",render:r=><strong>{r.name}</strong>},{label:"Registration",render:r=>r.registration},
        {label:"Availability",render:r=>pill(r.status)},{label:"Your share",render:r=>r.revenueSharePercent==null?"—":r.revenueSharePercent+"%"},
        {label:"Agreement since",render:r=>date(r.agreementStart)},
      ]}/><div className="owner-action-row"><button className="owner-secondary" onClick={()=>onSection("ownerAgreements")}>View ownership agreements <ArrowRight size={15}/></button></div>
    </Panel>;
    if(section==="ownerPerformance")return <Panel title="Vehicle rental activity" subtitle="Rental status only—customer identity and operator-wide financials are private. Up to 1,000 recent company rentals can be inspected.">
      <Table records={rows} columns={[
        {label:"Rental",render:r=>r.reference},{label:"Vehicle",render:r=>r.registration},
        {label:"Status",render:r=>pill(r.status)},{label:"Scheduled start",render:r=>date(r.scheduledStart)},
        {label:"Scheduled return",render:r=>date(r.scheduledEnd)},
      ]}/><div className="owner-action-row"><button className="owner-secondary" onClick={()=>onSection("mySettlements")}>View reconciled earnings</button></div>
    </Panel>;
    if(section==="ownerCondition")return <Panel title="Inspections and vehicle condition" subtitle="Owner-visible inspection status for rentals of your currently linked vehicles.">
      <Table records={rows} columns={[
        {label:"Vehicle",render:r=>r.registration},{label:"Rental",render:r=>r.reference},
        {label:"Inspection type",render:r=>friendly(r.type)},{label:"Status",render:r=>pill(r.status)},
        {label:"Recorded",render:r=>date(r.createdAt)},
      ]}/><p className="owner-footnote">Maintenance reports and damage photos require additional file-access authorization.</p>
    </Panel>;
    if(section==="ownerAgreements"||section==="ownerAgreementDetails")return <div className="owner-stack">
      <Panel title="Commercial ownership agreements" subtitle="Historical commercial terms are preserved; the current share is never substituted for an earlier period.">
        <Table records={rows} columns={[
          {label:"Vehicle",render:r=><strong>{r.vehicle||r.registration}</strong>},
          {label:"Your share",render:r=>r.revenueSharePercent+"%"},
          {label:"Effective",render:r=>date(r.startDate)},{label:"Until",render:r=>date(r.endDate)},
          {label:"Status",render:r=>pill(r.active?"ACTIVE":"HISTORICAL")},
          {label:"Details",render:r=><button className="owner-text-button" onClick={()=>setSelected(r.id)}>Review terms</button>},
        ]}/>
      </Panel>
      {selected&&<Panel title="Agreement terms">{(()=>{const a=rows.find((r:any)=>r.id===selected);return a?
        <dl className="owner-details">{Object.entries({Vehicle:a.vehicle,Registration:a.registration,Type:a.ownershipType,
          "Revenue share":a.revenueSharePercent+"%","Fixed monthly payout":friendly(a.fixedMonthlyPayout),
          "Owner expenses deductible":a.deductionsAllowed?"Yes":"No",Effective:date(a.startDate),
          "End":date(a.endDate),"Terms summary":a.termsSnapshot||"No saved terms summary"}).map(([key,value])=>
            <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>:null;})()}</Panel>}
    </div>;
    if(["mySettlements","ownerStatements","ownerPayouts","ownerDisputes"].includes(section)) {
      const filtered=section==="ownerPayouts"?settlements.filter((r:any)=>r.payableStatus==="PAID"||r.payableStatus==="PROCESSING"):settlements;
      return <div className="owner-stack"><Panel title={section==="mySettlements"?"Owner earnings":section==="ownerStatements"?"Settlement statements":section==="ownerPayouts"?"Verified payouts":"Disputes and requests"}
        subtitle={section==="ownerPayouts"?PAYMENT_TOOLTIP:"Statements use the rental company's settled Finance and approved expense records; not estimates."}>
        <Table records={filtered} columns={[
          {label:"Settlement",render:r=><strong>{r.reference}</strong>},
          {label:"Period",render:r=>date(r.periodStart)+" – "+date(r.periodEnd)},
          {label:"Status",render:r=>pill(r.status)},
          {label:"Owner net",render:r=>money(r.netPayable,r.currency)},
          {label:"Payment",render:r=>pill(r.payableStatus||"NOT DISBURSED")},
          {label:"Actions",render:r=><button className="owner-text-button" onClick={()=>void showStatement(r.id)}>
            View statement <ArrowRight size={13}/></button>},
        ]} empty={section==="ownerPayouts"?"No confirmed or processing payouts have been recorded.":"No settlement records have been saved for your owner account."}/>
        <p className="owner-footnote">{PAYMENT_TOOLTIP}</p>
      </Panel>
      {statementBusy&&<p role="status" className="owner-loading">Loading your verified statement…</p>}
      {statement&&<Panel title={"Statement · "+(statement.settlementNumber||selected)} subtitle="Read-only financial statement from the settlement engine.">
        <dl className="owner-details">
          {Object.entries({Period:date(statement.period?.startDate)+" – "+date(statement.period?.endDate),
            Owner:statement.owner?.name,Operator:statement.operator?.name||portal.name,
            "Statement date":date(statement.statementDate)}).map(([k,val])=><div key={k}><dt>{k}</dt><dd>{friendly(val)}</dd></div>)}
        </dl>
        {Array.isArray(statement.vehicleBreakdown)&&<Table records={statement.vehicleBreakdown} columns={[
          {label:"Vehicle",render:r=>r.registrationPlate},
          {label:"Eligible revenue",render:r=>friendly(r.eligibleRevenue)},
          {label:"Owner share",render:r=>friendly(r.ownerGrossShare)},
          {label:"Deductions",render:r=>friendly(r.deductions)},
        ]}/>}
        <div className="owner-action-row">
          {section==="ownerDisputes"&&<button className="owner-button" onClick={()=>setConfirmDispute(true)}>Raise a dispute</button>}
          <button className="owner-secondary" onClick={()=>{setStatement(null);setSelected("");}}>Close statement</button>
        </div>
      </Panel>}
      {section==="ownerDisputes"&&<Panel title="Dispute a settlement" subtitle="You can only dispute one of your own settlement records. A dispute never triggers a payout.">
        <label className="owner-field">Settlement<select value={selected} onChange={e=>{setSelected(e.target.value);setStatement(null);}}>
          <option value="">Select a settlement</option>{settlements.map((s:any)=><option key={s.id} value={s.id}>{s.reference} · {s.status}</option>)}
        </select></label>
        <label className="owner-field">Explain the issue<textarea minLength={8} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain the invoice or amount requiring a review."/></label>
        <button className="owner-button" disabled={!selected||reason.trim().length<8||busy} onClick={()=>setConfirmDispute(true)}>Submit dispute request</button>
      </Panel>}
      </div>;
    }
    if(section==="ownerAccount")return <Panel title="Owner account" subtitle="Verified identity and payout destination setup status. Sensitive banking details are hidden.">
      <dl className="owner-details">{Object.entries({Name:data?.ownerName,Email:data?.email,Phone:data?.phone,Company:data?.company,
        "Owner profile":data?.status,"Payout destination configured":data?.payoutMethodConfigured?"Yes":"No"}).map(([k,v])=>
        <div key={k}><dt>{k}</dt><dd>{friendly(v)}</dd></div>)}</dl><p className="owner-footnote">To update payout details, contact the operator for verified identity checks. Never send bank passwords or PINs.</p>
    </Panel>;
    if(section==="ownerOperators")return <Panel title="Connected rental companies" subtitle="This workspace is independently authorized for one rental company. Switch portals to view a different operator.">
      <dl className="owner-details"><div><dt>Company</dt><dd>{data?.company}</dd></div><div><dt>Connection</dt><dd>Active owner membership</dd></div></dl>
      <Table records={data?.invitations||[]} columns={[
        {label:"Invitation",render:r=>pill(r.status)},{label:"Delivery",render:r=>pill(r.delivery)},
        {label:"Expiry",render:r=>date(r.expiresAt)},
      ]} empty="No invitation history is recorded for this linked owner."/>
    </Panel>;
    return <Panel title="Owner screen unavailable"><div className="owner-placeholder">No verified source is connected to this owner screen.</div></Panel>;
  }
  return <div className="owner-shell">
    <button className="owner-mobile-nav" onClick={()=>setOpenMenu(x=>!x)} aria-label="Toggle owner navigation"><Menu size={19}/> Menu</button>
    <aside className={"owner-sidebar "+(openMenu?"open":"")}>
      <div className="owner-logo"><span><CarFront/></span><div><strong>Sage Auto</strong><small>VEHICLE OWNER</small></div></div>
      <div className="owner-company"><Building2 size={17}/><span>{portal.name}</span><BadgeCheck size={16}/></div>
      <nav aria-label="Vehicle owner sections">{GROUPS.map(g=><section key={g.title}>
        <p>{g.title}</p>{g.ids.filter(id=>sections.has(id)).map(id=><button key={id} aria-current={section===id?"page":undefined}
          onClick={()=>{onSection(id);setOpenMenu(false);}}>{ICONS[id]}<span>{sections.get(id)}</span></button>)}
      </section>)}</nav>
      <button className="owner-switch" onClick={onSwitch}><ArrowLeft size={16}/> Switch company</button>
    </aside>
    <main className="owner-main">
      <header className="owner-topbar"><div><div className="owner-eyebrow">PARTNER PORTAL / {portal.name}</div><h1>{heading}</h1>
        <p>{context.user.fullName} · Your vehicles, terms and earnings</p></div>
        <div className="owner-tools"><button aria-label="Refresh owner records" onClick={()=>setRevision(n=>n+1)}><RefreshCw size={17}/></button>
          <button onClick={onSignOut}><LogOut size={16}/> Sign out</button></div>
      </header>
      <div className="owner-content">
        {feedback&&<div className="owner-success" role="status"><BadgeCheck size={17}/>{feedback}</div>}
        {error&&data&&<div className="owner-warning" role="alert"><CircleAlert size={17}/>{error}</div>}
        {content()}
        <div className="owner-privacy"><ShieldCheck size={17}/> Your view is restricted to this operator and the owner record linked to your account.</div>
      </div>
    </main>
    {confirmDispute&&<div className="owner-dialog-bg" onClick={()=>{if(!busy)setConfirmDispute(false);}}>
      <div className="owner-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-dispute-title" onClick={e=>e.stopPropagation()}>
        <header><h2 id="owner-dispute-title">Confirm settlement dispute</h2><button onClick={()=>setConfirmDispute(false)} disabled={busy} aria-label="Close"><X size={18}/></button></header>
        <p>The rental operator will review your written request. No money moves or approvals happen automatically.</p>
        <p><strong>Reason:</strong> {reason||"Enter a reason on the disputes tab."}</p>
        <div className="owner-action-row"><button className="owner-secondary" onClick={()=>setConfirmDispute(false)} disabled={busy}>Cancel</button>
          <button className="owner-button" disabled={busy||!selected||reason.trim().length<8} onClick={()=>void dispute()}>{busy?"Submitting…":"Confirm dispute"}</button></div>
      </div>
    </div>}
  </div>;
}
