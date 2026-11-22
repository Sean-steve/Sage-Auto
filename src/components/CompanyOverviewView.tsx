import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CalendarCheck2,
  CarFront, CheckCircle2, ChevronDown, CircleDollarSign, Clock3, CreditCard,
  LockKeyhole, ShieldCheck, Sparkles, TrendingUp, WalletCards,
} from "lucide-react";
import type { TenantDashboardOverviewDto, PeriodPreset } from "@carhire/types";
import { apiClient } from "../lib/api-client";
import { WorkspaceSetupGuide } from "./WorkspaceSetupGuide";
import {
  bookingsForPeriod, canRead, compactNumber, currencyText, dashboardValidForTenant,
  hasDashboardRights, percentage, PERIOD_OPTIONS,
} from "../lib/dashboard-presentation";
import {
  BookingVolumeChart, ChartUnavailable, FinanceTrendChart, FleetDistributionChart,
} from "./dashboard/ExecutiveCharts";
import type { AccessPortal } from "../lib/access-context";

type SummaryState = {
  analytics: TenantDashboardOverviewDto | null;
  analyticsError: string | null;
  recentBookings: Array<Record<string, any>> | null;
  bookingsError: string | null;
  overdueCount: number | null;
  rentalsError: string | null;
  refreshedAt: string | null;
};
const emptySummary: SummaryState = {
  analytics: null, analyticsError: null, recentBookings: null, bookingsError: null,
  overdueCount: null, rentalsError: null, refreshedAt: null,
};
const human = (value: unknown) => String(value || "Unknown").replaceAll("_", " ").toLowerCase()
  .replace(/\b\w/g, char => char.toUpperCase());
const pointNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function MetricCard({
  title, value, caption, icon: Icon, section, onNavigate, change, tone = "emerald", loading = false,
}: {
  title: string; value: string; caption: string; icon: React.ElementType;
  section?: string; onNavigate?: (id: string) => void; change?: number | null;
  tone?: "emerald" | "blue" | "amber" | "violet"; loading?: boolean;
}) {
  const classes: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
  };
  const content = <>
    <div className="flex items-center justify-between gap-2">
      <span className={"grid h-10 w-10 place-items-center rounded-xl " + classes[tone]}><Icon size={19}/></span>
      {section && <ArrowUpRight size={16} className="text-slate-300 transition group-hover:text-emerald-700"/>}
    </div>
    <div className="mt-5 min-h-9 text-[clamp(1.35rem,2vw,1.85rem)] font-black tracking-tight text-slate-950">
      {loading ? <span className="inline-block h-8 w-32 animate-pulse rounded-lg bg-slate-100" aria-label="Loading"/> : value}
    </div>
    <p className="mt-2 text-sm font-bold text-slate-700">{title}</p>
    <div className="mt-2 flex min-h-5 flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
      {typeof change === "number" && Number.isFinite(change) && <span
        className={"inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold " +
          (change >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
        {change >= 0 ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
        {Math.abs(change).toFixed(1)}%
      </span>}
      <span>{caption}</span>
    </div>
  </>;
  const style = "group min-w-0 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-emerald-200 hover:shadow-md";
  if (section && onNavigate) return <button type="button" onClick={() => onNavigate(section)} className={style}>{content}</button>;
  return <article className={style}>{content}</article>;
}

function PeriodControl({
  preset, setPreset, from, to, setFrom, setTo,
}: {
  preset: PeriodPreset; setPreset: (x: PeriodPreset) => void;
  from: string; to: string; setFrom: (x: string) => void; setTo: (x: string) => void;
}) {
  return <div className="flex flex-wrap items-center gap-2">
    <label className="relative inline-flex items-center gap-2">
      <span className="sr-only">Reporting period</span>
      <select value={preset} onChange={e => setPreset(e.target.value as PeriodPreset)}
        className="h-10 min-w-[140px] appearance-none rounded-xl border border-white/20 bg-white/10 pl-4 pr-9 text-xs font-bold text-white outline-none transition focus-visible:outline-2 focus-visible:outline-emerald-400">
        {PERIOD_OPTIONS.map(option => <option key={option.value} value={option.value} className="text-slate-900">{option.label}</option>)}
      </select><ChevronDown size={14} className="pointer-events-none absolute right-3 text-white"/>
    </label>
    {preset === "CUSTOM" && <>
      <label className="text-[11px] font-semibold text-slate-300">From
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="ml-2 h-10 rounded-xl border border-white/20 bg-white px-2 text-xs font-semibold text-slate-900"/>
      </label>
      <label className="text-[11px] font-semibold text-slate-300">To
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="ml-2 h-10 rounded-xl border border-white/20 bg-white px-2 text-xs font-semibold text-slate-900"/>
      </label>
    </>}
  </div>;
}

export function CompanyOverviewView({ portal }: {portal: AccessPortal}) {
  const [preset, setPreset] = useState<PeriodPreset>("THIS_MONTH");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [summary, setSummary] = useState<SummaryState>(emptySummary);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const portalKey = portal.id + ":" + portal.tenantId + ":" + portal.permissions.join("|");
  const fullDashboard = hasDashboardRights(portal);
  const mayBookings = canRead(portal, "booking.read");
  const mayRentals = canRead(portal, "rental.read");
  const hasSection = (section: string) => portal.sections.some(s => s.id === section);
  const navigate = (section: string) => {
    if (hasSection(section)) window.dispatchEvent(new CustomEvent("sage:navigate", { detail: { section } }));
  };
  const openBooking = (booking: Record<string,any>) => {
    if (!hasSection("bookings") || !canRead(portal,"booking.read") || typeof booking.id !== "string") return;
    window.dispatchEvent(new CustomEvent("sage:navigate", {detail: {
      section: "bookings", record: {kind: "BOOKING", id: booking.id, title: booking.bookingNumber || "Booking", subtitle: "Recent booking"},
    }}));
  };
  const customValid = preset !== "CUSTOM" || (
    !!customFrom && !!customTo && customFrom <= customTo &&
    (new Date(customTo + "T00:00:00Z").getTime() - new Date(customFrom + "T00:00:00Z").getTime()) / 86400000 < 366
  );

  const load = useCallback(async (silent = false) => {
    const callId = ++seq.current;
    if (!silent) {
      setLoading(true);
      setSummary(emptySummary);
    }
    const request = preset === "CUSTOM"
      ? { preset, from: customFrom, to: customTo }
      : { preset };
    const jobs = await Promise.all([
      fullDashboard ? apiClient.analytics.getDashboard(request) : Promise.resolve({error:{
        code: "ACCESS_DENIED", message: "Your role does not include all executive analytics permissions.",
      }}),
      mayBookings ? apiClient.bookings.listBookings({ limit: 5, offset: 0 }) : Promise.resolve(null),
      mayRentals ? apiClient.rentals.listRentals({ status: "OVERDUE", limit: 1, offset: 0 }) : Promise.resolve(null),
    ].map(p => Promise.resolve(p).catch((e: unknown) => ({
      error: {code:"NETWORK_ERROR",message:e instanceof Error?e.message:"Unable to contact service"},
    }))));
    if (seq.current !== callId) return;
    const [analyticsResponse, bookingsResponse, rentalsResponse] = jobs as any[];
    const analytics = dashboardValidForTenant(analyticsResponse?.data, portal) ? analyticsResponse.data : null;
    setSummary({
      analytics,
      analyticsError: analytics
        ? null : analyticsResponse?.error?.message || "The executive analytics service returned an invalid or mismatched company response.",
      recentBookings: bookingsResponse && !bookingsResponse.error && Array.isArray(bookingsResponse.data)
        ? bookingsResponse.data.slice(0, 5) : null,
      bookingsError: mayBookings ? bookingsResponse?.error?.message ||
        (!Array.isArray(bookingsResponse?.data) ? "Recent booking records could not be verified." : null) : null,
      overdueCount: rentalsResponse && !rentalsResponse.error
        ? (typeof rentalsResponse.meta?.total === "number" ? rentalsResponse.meta.total :
          typeof rentalsResponse.total === "number" ? rentalsResponse.total : null) : null,
      rentalsError: mayRentals ? rentalsResponse?.error?.message ||
        (typeof rentalsResponse?.meta?.total !== "number" && typeof rentalsResponse?.total !== "number"
          ? "Overdue rental total is unavailable." : null) : null,
      refreshedAt: new Date().toISOString(),
    });
    setLoading(false);
  }, [portalKey, preset, customFrom, customTo, customValid]);

  useEffect(() => {
    if (!customValid) {
      ++seq.current;
      setSummary(emptySummary);
      setLoading(false);
      return;
    }
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(true); };
    const timer = window.setInterval(refresh, 90_000);
    window.addEventListener("focus", refresh);
    return () => {
      ++seq.current;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load, customValid]);

  const analytics = summary.analytics;
  const money = (value: number | null | undefined) =>
    analytics ? currencyText(value, analytics.currency) : "Unavailable";
  const grossInvoiced = analytics?.financialSummary.grossInvoiced ?? null;
  const revenue = analytics?.financialSummary.postedRevenue ?? null;
  const collections = analytics?.financialSummary.cashReceipts ?? null;
  const receivables = analytics?.financialSummary.outstandingReceivables ?? null;
  const activeRentals = analytics ? pointNumber(analytics.headlineKpis.activeRentals.value) : null;
  const pendingHandovers = analytics ? pointNumber(analytics.headlineKpis.pendingHandovers.value) : null;
  const utilization = analytics ? pointNumber(analytics.headlineKpis.utilizationRate.value) : null;
  const periodBookings = analytics ? bookingsForPeriod(analytics) : null;
  const fleetTotal = analytics?.fleetStatus.total ?? null;
  const fleetAvailable = analytics?.fleetStatus.available ?? null;

  const attention = useMemo(() => {
    const items: Array<{id:string; title:string; description:string; color:string}> = [];
    if (summary.overdueCount !== null && summary.overdueCount > 0) items.push({
      id: "rentals", color: "rose", title: summary.overdueCount + " overdue rental(s)",
      description: "Review rental returns and customer follow-up.",
    });
    if (analytics && receivables !== null && receivables > 0) items.push({
      id: "finance", color: "amber", title: money(receivables) + " outstanding",
      description: "Review customer receivables and verified payment allocations.",
    });
    if (pendingHandovers !== null && pendingHandovers > 0) items.push({
      id: "handover", color: "amber", title: pendingHandovers + " handover(s) in progress",
      description: "Continue contract, inspection and key release checkpoints.",
    });
    if (fleetTotal !== null && fleetTotal > 0 && fleetAvailable === 0) items.push({
      id: "availability", color: "amber", title: "No vehicles currently available",
      description: "Review confirmed allocations, availability and maintenance holds.",
    });
    return items;
  }, [analytics, summary.overdueCount, receivables, pendingHandovers, fleetTotal, fleetAvailable]);

  const canDeclareClear = !!analytics && (!mayRentals || summary.overdueCount !== null);

  return <div className="mx-auto max-w-[1560px] space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="relative overflow-hidden rounded-[26px] bg-slate-950 p-6 text-white shadow-xl shadow-slate-900/10 sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-44 h-80 w-96 rounded-full bg-emerald-600/20 blur-[60px]"/>
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 right-28 h-72 w-96 rounded-full bg-blue-500/15 blur-[70px]"/>
      <div className="relative flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.2em] text-emerald-300"><Sparkles size={13}/>Sage Auto intelligence</div>
          <h1 className="mt-4 text-3xl font-black tracking-[-.045em] sm:text-4xl">Your business, at a glance.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">Follow your revenue, fleet performance, rental activity and the decisions that need attention.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5"><ShieldCheck size={13}/>Company-scoped records</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
              <Clock3 size={13}/>{summary.refreshedAt && !loading
                ? "Updated " + new Date(summary.refreshedAt).toLocaleTimeString("en-KE",{hour:"2-digit",minute:"2-digit"})
                : "Checking live data"}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end xl:flex-col xl:items-end">
          <PeriodControl preset={preset} setPreset={setPreset} from={customFrom} to={customTo} setFrom={setCustomFrom} setTo={setCustomTo}/>
          {hasSection("bookings") && <button type="button" onClick={() => navigate("bookings")}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 text-xs font-black text-slate-950 transition hover:bg-emerald-300">
            Open bookings <ArrowRight size={15}/>
          </button>}
        </div>
      </div>
    </header>

    {!customValid && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      Select a valid custom date range of 366 days or fewer, with the start date before the end date.
    </div>}

    {summary.analyticsError && !loading && <div role="alert"
      className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
      {fullDashboard ? <AlertTriangle size={19} className="shrink-0"/> : <LockKeyhole size={19} className="shrink-0"/>}
      <div><strong>{fullDashboard ? "Executive analytics temporarily unavailable" : "Executive analytics restricted for this role"}</strong>
        <p className="mt-1 text-xs leading-5">{summary.analyticsError} No financial amount will be estimated from browser data.</p></div>
    </div>}

    <section aria-label="Executive performance indicators">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">Performance scorecard</p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Financial and operational pulse</h2></div>
        <span className="text-[11px] font-medium text-slate-500">Financial activity follows selected period · Receivables and fleet are current</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard title="Posted revenue" value={money(revenue)} caption="Earned · ledger-posted" icon={TrendingUp}
          section={hasSection("finance")?"finance":undefined} onNavigate={navigate} tone="emerald" loading={loading}
          change={pointNumber(analytics?.headlineKpis.postedRevenue.changePercentage)}/>
        <MetricCard title="Cash received" value={money(collections)} caption="Verified inbound funds" icon={CircleDollarSign}
          section={hasSection("finance")?"finance":undefined} onNavigate={navigate} tone="blue" loading={loading}
          change={pointNumber(analytics?.headlineKpis.cashCollections.changePercentage)}/>
        <MetricCard title="Receivables" value={money(receivables)} caption="Current unpaid invoices" icon={CreditCard}
          section={hasSection("finance")?"finance":undefined} onNavigate={navigate} tone="amber" loading={loading}/>
        <MetricCard title="Active rentals" value={compactNumber(activeRentals)} caption="Live rental snapshot" icon={Clock3}
          section={hasSection("rentals")?"rentals":undefined} onNavigate={navigate} tone="violet" loading={loading}/>
        <MetricCard title="Fleet utilization" value={percentage(utilization)} caption="Currently on rent" icon={CarFront}
          section={hasSection("fleet")?"fleet":undefined} onNavigate={navigate} tone="blue" loading={loading}/>
        <MetricCard title="New bookings" value={compactNumber(periodBookings)} caption="Created in selected period" icon={CalendarCheck2}
          section={hasSection("bookings")?"bookings":undefined} onNavigate={navigate} tone="emerald" loading={loading}/>
      </div>
    </section>

    <WorkspaceSetupGuide portal={portal} mode="overview"/>

    <section className="grid min-w-0 gap-5 xl:grid-cols-[1.35fr_.88fr]">
      {analytics ? <FinanceTrendChart key={analytics.tenantId+analytics.period.from+analytics.period.to} overview={analytics}/>
        : <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 text-lg font-black text-slate-950">Revenue and collections</h2>
          <ChartUnavailable title={loading?"Loading financial intelligence":"Financial chart unavailable"}
            detail={loading?"Retrieving posted journals and verified payment history.":"This view requires verified executive analytics and finance permissions."} restricted={!fullDashboard}/></div>}
      {analytics ? <FleetDistributionChart overview={analytics}/>
        : <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 text-lg font-black text-slate-950">Fleet status</h2>
          <ChartUnavailable title="Fleet intelligence unavailable" detail="The authorized fleet analytics snapshot is not available."/></div>}
    </section>

    <section className="grid min-w-0 gap-5 xl:grid-cols-[1.35fr_.88fr]">
      {analytics ? <BookingVolumeChart overview={analytics}/>
        : <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 text-lg font-black text-slate-950">Booking trends</h2>
          <ChartUnavailable title="Booking trends unavailable" detail="Reporting history has not been verified for this company."/></div>}
      <section aria-label="Operations needing attention" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3"><div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-amber-700"><ShieldCheck size={15}/>Operations</div>
          <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Needs attention</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Verified signals with direct access to the relevant workflow.</p>
        </div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{attention.length}</span></div>
        <div className="mt-5 space-y-3">
          {loading && <p role="status" className="animate-pulse py-6 text-sm text-slate-500">Checking company activity…</p>}
          {!loading && attention.length === 0 && (canDeclareClear
            ? <div className="flex gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={18} className="shrink-0"/>
                <div><strong>No tracked exceptions detected.</strong><p className="mt-1 text-xs leading-5">Current receivables, handover, rental and fleet checks were reviewed. Other operational checks may still be required.</p></div>
              </div>
            : <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Attention status is incomplete. Some operational or financial data could not be verified.</div>)}
          {!loading && attention.map(item => <button type="button" key={item.title} disabled={!hasSection(item.id)}
            onClick={() => navigate(item.id)} className="flex w-full items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/40 px-4 py-3 text-left transition hover:border-amber-400 disabled:cursor-default">
            <span><span className="block text-sm font-bold text-slate-900">{item.title}</span><span className="mt-1 block text-xs leading-5 text-slate-600">{item.description}</span></span>
            <ArrowRight size={15} className="mt-1 shrink-0 text-amber-700"/>
          </button>)}
          {!loading && (summary.rentalsError || summary.bookingsError) && <p className="text-xs text-amber-700">
            Some operational data is unavailable. Figures are not estimated.
          </p>}
        </div>
      </section>
    </section>

    <section className="grid gap-5 xl:grid-cols-[1.35fr_.88fr]">
      <section aria-label="Recent bookings" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-700">Reservation activity</p>
          <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Recent bookings</h2></div>
          {hasSection("bookings")&&<button type="button" onClick={()=>navigate("bookings")} className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline">View all <ArrowRight size={14}/></button>}
        </div>
        <div className="mt-4 divide-y divide-slate-100">
          {loading ? <p role="status" className="py-10 text-sm text-slate-500">Loading reservations…</p>
            : summary.recentBookings === null ? <p className="py-9 text-sm text-slate-500">{mayBookings?"Recent bookings are currently unavailable.":"Booking access is restricted for this role."}</p>
            : !summary.recentBookings.length ? <p className="py-10 text-sm text-slate-500">No booking records yet. Use the booking workspace to create one.</p>
            : summary.recentBookings.map(booking=><button type="button" key={booking.id} disabled={!hasSection("bookings")}
                onClick={()=>openBooking(booking)}
                className="grid w-full gap-2 py-4 text-left transition hover:bg-slate-50 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
                <span><span className="block font-mono text-xs font-black text-slate-950">{booking.bookingNumber||"Reservation"}</span>
                  <span className="mt-1 block text-xs text-slate-500">{booking.customerName||"Customer reservation"}</span></span>
                <span className="text-xs text-slate-500">{booking.pickupAt?new Date(booking.pickupAt).toLocaleDateString("en-KE",{day:"numeric",month:"short",year:"numeric"}):"Pickup pending"}</span>
                <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">{human(booking.status)}</span>
              </button>)}
        </div>
      </section>
      <section aria-label="Workspace shortcuts" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-[10px] font-black uppercase tracking-[.18em] text-slate-500">Navigate</p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">Quick actions</h2>
        <p className="mt-1 text-xs text-slate-500">Everything you need, one action away.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {([
            ["availability","Availability",CalendarCheck2],
            ["returns","Returns",CheckCircle2],
            ["finance","Finance",WalletCards],
            ["fleet","Fleet",CarFront],
            ["settlements","Settlements",CircleDollarSign],
            ["bookings","Bookings",CalendarCheck2],
          ] as const).filter(([id])=>hasSection(id)).map(([id,label,Icon])=><button type="button" key={id}
            onClick={()=>navigate(id)}
            className="group flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-xs font-bold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50">
            <span className="flex items-center gap-2"><Icon size={16} className="text-emerald-700"/>{label}</span>
            <ArrowUpRight size={13} className="text-slate-400 group-hover:text-emerald-600"/>
          </button>)}
        </div>
        {analytics && <div className="mt-5 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Reporting context</p>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            {human(analytics.period.preset)} · {analytics.currency}<br/>
            {grossInvoiced !== null && "Gross invoiced: " + money(grossInvoiced)}
          </p>
          {analytics.chartAvailability?.utilization === "UNAVAILABLE" && <p className="mt-2 text-xs leading-5 text-amber-700">
            Historical utilization is not yet certified. Current fleet status remains available.
          </p>}
        </div>}
      </section>
    </section>
  </div>;
}
