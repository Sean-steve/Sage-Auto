import React, { useMemo, useState } from "react";
import { BarChart3, CalendarDays, ChartNoAxesCombined, CircleHelp, LockKeyhole } from "lucide-react";
import type { TenantDashboardOverviewDto, TimeSeriesPoint } from "@carhire/types";
import { bucketSeries, compactNumber, currencyText, FINANCE_SERIES, financialSeriesFor, type FinancialSeriesKey } from "../../lib/dashboard-presentation";

const W = 760, H = 250, L = 57, R = 16, T = 18, B = 33;
const plotW = W - L - R, plotH = H - T - B;
const axis = (n: number) => new Intl.NumberFormat("en-KE", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const xLine = (i: number, n: number) => L + (n === 1 ? plotW / 2 : i * plotW / (n - 1));
const yLine = (v: number, min: number, max: number) => T + (max - v) / Math.max(max - min, 1) * plotH;

export function ChartUnavailable({ title, detail, restricted = false }: {title:string;detail:string;restricted?:boolean}) {
  const Icon = restricted ? LockKeyhole : CircleHelp;
  return <div role="status" className="flex min-h-[210px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
    <Icon size={23} className="text-slate-400"/>
    <p className="mt-3 text-sm font-bold text-slate-700">{title}</p>
    <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{detail}</p>
  </div>;
}
function AxisLines({min,max}:{min:number;max:number}) {
  return <>{Array.from({length:5}, (_,i)=>{
    const value=min+(max-min)*(4-i)/4, y=yLine(value,min,max);
    return <g key={i}><line x1={L} x2={W-R} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray={i===4?"0":"3 6"}/>
      <text x={L-8} y={y+4} textAnchor="end" fontSize="11" fill="#64748b">{axis(value)}</text></g>;
  })}</>;
}
function DateLabels({buckets,bar=false}:{buckets:{key:string;label:string}[];bar?:boolean}) {
  const indices=[0,Math.floor((buckets.length-1)/2),buckets.length-1].filter((v,i,a)=>a.indexOf(v)===i);
  return <>{indices.map(i=><text key={i} x={bar?L+(i+.5)*plotW/buckets.length:xLine(i,buckets.length)}
    y={H-7} fontSize="11" textAnchor="middle" fill="#64748b">{buckets[i].label}</text>)}</>;
}
function AccessibleData({caption,points}:{caption:string;points:{key:string;label:string;value:number}[]}) {
  return <table className="sr-only"><caption>{caption}</caption><thead><tr><th>Period</th><th>Value</th></tr></thead>
    <tbody>{points.map(p=><tr key={p.key}><td>{p.label}</td><td>{p.value}</td></tr>)}</tbody></table>;
}

export function FinanceTrendChart({overview}:{overview:TenantDashboardOverviewDto}) {
  const [metric,setMetric]=useState<FinancialSeriesKey>("postedRevenue");
  const [active,setActive]=useState<number|null>(null);
  const source=financialSeriesFor(overview,metric);
  const buckets=useMemo(()=>source?bucketSeries(source):[],[source]);
  const min=Math.min(0,...buckets.map(p=>p.value));
  const max=Math.max(1,...buckets.map(p=>p.value));
  const detail=FINANCE_SERIES[metric];
  const plotted=buckets.map((p,i)=>xLine(i,buckets.length).toFixed(2)+","+yLine(p.value,min,max).toFixed(2)).join(" ");
  return <section aria-label="Financial trends" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-emerald-700"><ChartNoAxesCombined size={15}/>Financial intelligence</div>
        <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Revenue and collections</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">Select a series. Issued invoices, banked cash and earned revenue are different business facts.</p></div>
      <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">{overview.currency}</span>
    </header>
    <div role="group" aria-label="Financial chart metric" className="mt-5 flex flex-wrap gap-2">
      {(["postedRevenue","cashCollections","grossInvoiced"] as const).map(key=>
        <button key={key} type="button" onClick={()=>{setMetric(key);setActive(null);}} aria-pressed={metric===key}
          className={"inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-emerald-600 "+
            (metric===key?"border-slate-900 bg-slate-900 text-white":"border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-400")}>
          <span className="h-2 w-2 rounded-full" style={{background:FINANCE_SERIES[key].color}}/>{FINANCE_SERIES[key].title}
        </button>)}
    </div>
    <p className="mt-3 text-xs text-slate-500">{detail.summary}</p>
    {source===null ? <div className="mt-4"><ChartUnavailable title="Financial series unavailable" detail="This historical dataset has not been verified by the analytics service; it will not be replaced with invented data."/></div>
      : !buckets.length ? <div className="mt-4"><ChartUnavailable title="No reporting buckets" detail="There are no dated analytics buckets to display. Select a different period."/></div>
      : <div className="mt-3">
          <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <p className="text-xl font-black tracking-tight text-slate-950">{currencyText(buckets.reduce((sum,p)=>sum+p.value,0),overview.currency)}<span className="ml-2 text-xs font-medium text-slate-500">in period</span></p>
            <span aria-live="polite" className="text-xs font-semibold text-slate-600">{active===null?"Focus or hover for detail":buckets[active].label+": "+currencyText(buckets[active].value,overview.currency)}</span>
          </div>
          <svg viewBox={"0 0 "+W+" "+H} role="img" aria-label={detail.title+" time series"} className="block h-auto w-full">
            <AxisLines min={min} max={max}/>
            {buckets.length>1&&<polyline points={plotted} fill="none" stroke={detail.color} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round"/>}
            {buckets.map((p,i)=><circle key={p.key} cx={xLine(i,buckets.length)} cy={yLine(p.value,min,max)}
              r={active===i?6:Math.max(2,5-buckets.length/25)} fill={detail.color} stroke="#fff" strokeWidth={2}
              tabIndex={0} aria-label={p.label+": "+currencyText(p.value,overview.currency)}
              onMouseEnter={()=>setActive(i)} onMouseLeave={()=>setActive(null)}
              onFocus={()=>setActive(i)} onBlur={()=>setActive(null)}
              className="cursor-crosshair outline-none focus:stroke-slate-900"/>)}
            <DateLabels buckets={buckets}/>
          </svg>
          <div className="flex flex-wrap justify-between gap-2 text-[11px] text-slate-500"><span>Source: {detail.source}</span><span>Automatically grouped by day, week or month</span></div>
          <AccessibleData caption={detail.title+" by period"} points={buckets}/>
        </div>}
  </section>;
}

export function BookingVolumeChart({overview}:{overview:TenantDashboardOverviewDto}) {
  const [active,setActive]=useState<number|null>(null);
  const verified=overview.chartAvailability?.bookingVolume==="VERIFIED"&&Array.isArray(overview.bookingVolumeChart);
  const source:TimeSeriesPoint[]=verified?overview.bookingVolumeChart!:[];
  const buckets=useMemo(()=>bucketSeries(source),[source]);
  const max=Math.max(1,...buckets.map(p=>p.value));
  const cellW=plotW/Math.max(1,buckets.length),barW=Math.min(32,Math.max(4,cellW*.67));
  return <section aria-label="Booking trends" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <header className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-blue-700"><CalendarDays size={15}/>Demand</div>
      <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Booking trends</h2>
      <p className="mt-1 text-xs text-slate-500">Bookings created during the selected reporting period.</p></div><BarChart3 size={22} className="text-slate-400"/></header>
    {!verified ? <div className="mt-4"><ChartUnavailable title="Booking trends unavailable" detail="The backend has not verified this booking series."/></div>
      : !buckets.length ? <div className="mt-4"><ChartUnavailable title="No booking buckets" detail="No dated booking series was returned for this period."/></div>
      : <>
        <p className="mt-4 text-2xl font-black tracking-tight text-slate-950">{compactNumber(buckets.reduce((a,p)=>a+p.value,0))}<span className="ml-2 text-xs font-medium text-slate-500">bookings</span></p>
        <p aria-live="polite" className="mt-1 min-h-5 text-xs text-slate-500">{active===null?"Focus or hover a bar for its count":buckets[active].label+": "+buckets[active].value+" bookings"}</p>
        <svg viewBox={"0 0 "+W+" "+H} role="img" aria-label="Bookings created by reporting period" className="block h-auto w-full">
          <AxisLines min={0} max={max}/>
          {buckets.map((p,i)=>{const y=yLine(p.value,0,max);return <rect key={p.key}
            x={L+(i+.5)*cellW-barW/2} y={y} width={barW} height={Math.max(2,H-B-y)}
            rx={Math.min(4,barW/3)} fill={active===i?"#1e40af":"#60a5fa"}
            tabIndex={0} aria-label={p.label+": "+p.value+" bookings"}
            onMouseEnter={()=>setActive(i)} onMouseLeave={()=>setActive(null)}
            onFocus={()=>setActive(i)} onBlur={()=>setActive(null)}
            className="cursor-crosshair focus:outline-2 focus:outline-emerald-600"/>;})}
          <DateLabels buckets={buckets} bar/>
        </svg>
        <p className="text-[11px] text-slate-500">Source: tenant booking records · createdAt</p>
        <AccessibleData caption="New bookings by period" points={buckets}/>
      </>}
  </section>;
}

const shades:Record<string,string>={available:"#16a34a",onRent:"#2563eb",reserved:"#8b5cf6",maintenance:"#f59e0b",blocked:"#ef4444",other:"#cbd5e1"};
export function FleetDistributionChart({overview}:{overview:TenantDashboardOverviewDto}) {
  const fleet=overview.fleetStatus;
  const total=Math.max(0,fleet.total);
  const slices=[
    {key:"available",label:"Available",value:fleet.available},
    {key:"onRent",label:"On rent",value:fleet.onRent},
    {key:"reserved",label:"Reserved",value:fleet.reserved},
    {key:"maintenance",label:"Maintenance",value:fleet.maintenance},
    {key:"blocked",label:"Blocked",value:fleet.blocked},
  ];
  const counted=slices.reduce((v,x)=>v+x.value,0);
  if(counted<total)slices.push({key:"other",label:"Other active",value:total-counted});
  const perimeter=2*Math.PI*57;
  let offset=0;
  return <section aria-label="Fleet distribution" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">Fleet intelligence</div>
    <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Fleet status</h2>
    <p className="mt-1 text-xs text-slate-500">Current active vehicles. Not a historical utilization chart.</p>
    {!total?<div className="mt-5"><ChartUnavailable title="No active vehicles" detail="The fleet endpoint currently reports no active vehicles."/></div>
      : <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row">
        <div className="relative h-44 w-44 shrink-0">
          <svg viewBox="0 0 160 160" role="img" aria-label={slices.map(s=>s.label+": "+s.value).join(", ")} className="h-full w-full">
            <circle cx="80" cy="80" r="57" fill="none" stroke="#f1f5f9" strokeWidth="16"/>
            {slices.filter(s=>s.value>0).map(s=>{const span=s.value/total*perimeter;
              const arc=<circle key={s.key} cx="80" cy="80" r="57" fill="none" stroke={shades[s.key]} strokeWidth="16"
                strokeDasharray={span+" "+(perimeter-span)} strokeDashoffset={-offset} transform="rotate(-90 80 80)"/>;
              offset+=span;return arc;
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-3xl font-black text-slate-950">{compactNumber(total)}</span><span className="text-[11px] text-slate-500">active vehicles</span></div>
        </div>
        <div className="grid w-full flex-1 grid-cols-2 gap-3 sm:grid-cols-1">
          {slices.map(s=><div key={s.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 text-slate-600"><i className="h-2.5 w-2.5 rounded-full" style={{background:shades[s.key]}}/>{s.label}</span><strong className="text-slate-900">{compactNumber(s.value)}</strong>
          </div>)}
        </div>
      </div>}
    {total>0&&<p className="mt-5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">Current utilization: {fleet.utilizationRate.toFixed(1)}%. Historical fleet capacity is not yet certified.</p>}
  </section>;
}
