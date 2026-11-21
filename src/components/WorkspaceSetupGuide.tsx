import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowRight, Check, CheckCircle2, ChevronDown, ChevronUp,
  ClipboardCheck, Eye, EyeOff, Loader2, ShieldCheck,
} from "lucide-react";
import type { AccessPortal } from "../lib/access-context";
import { firstRentalSetupApi, type FirstRentalStatus } from "../lib/first-rental-setup";

type SetupMode = "overview" | "settings";

export function WorkspaceSetupGuide({ portal, mode }: { portal: AccessPortal; mode: SetupMode }) {
  const [status, setStatus] = useState<FirstRentalStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(mode === "overview");
  const canManage = portal.kind === "tenant" && Boolean(portal.tenantId) &&
    portal.roles.includes("COMPANY_OWNER");

  const refresh = useCallback(async (silent = false) => {
    if (!canManage) return;
    if (!silent) setLoading(true);
    const response = await firstRentalSetupApi.getStatus();
    if (response.error) setError(response.error.message || "Unable to load first-rental setup.");
    else if (response.data?.tenantId === portal.tenantId) {
      setStatus(response.data);
      setError("");
    } else setError("Company setup could not be verified.");
    setLoading(false);
  }, [canManage, portal.tenantId]);

  useEffect(() => {
    if (!canManage) return;
    void refresh();
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(true); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("sage:setup-updated", onFocus);
    const interval = window.setInterval(onFocus, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("sage:setup-updated", onFocus);
      window.clearInterval(interval);
    };
  }, [refresh, canManage]);

  async function setVisibility(action: "DISMISS" | "RESTORE") {
    if (!canManage || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await firstRentalSetupApi.updateVisibility(action);
      if (response.error || response.data?.tenantId !== portal.tenantId) {
        throw new Error(response.error?.message || "Unable to update workspace setup.");
      }
      setStatus(response.data);
      window.dispatchEvent(new Event("sage:setup-updated"));
    } catch (caught: any) {
      setError(caught.message || "Unable to update setup visibility.");
    } finally { setBusy(false); }
  }

  const navigate = (section: string) => {
    if (portal.sections.some(item => item.id === section)) {
      window.dispatchEvent(new CustomEvent("sage:navigate", { detail: { section } }));
    }
  };

  if (!canManage) return null;
  if (mode === "overview" && status && !status.visibleOnOverview) return null;

  if (loading && !status) return <div role="status" className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
    <Loader2 size={16} className="mr-2 inline animate-spin"/>Checking your workspace setup…
  </div>;

  if (!status) return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
    Setup status is temporarily unavailable. Your existing booking and rental workflows remain accessible.
    <button type="button" onClick={() => void refresh()} className="ml-3 font-bold underline">Retry</button>
  </div>;

  const complete = status.state === "COMPLETED";
  const dismissed = status.state === "DISMISSED";
  const progress = status.totalCount ? Math.round((status.completedCount / status.totalCount) * 100) : 0;

  return <section aria-label="First rental workspace setup" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.14em] text-emerald-700">
          {complete ? <CheckCircle2 size={15}/> : <ClipboardCheck size={15}/>}
          {mode === "overview" ? "New workspace setup" : "Workspace setup guide"}
        </div>
        <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950">
          {complete ? "Your first rental is underway" : "Prepare your first rental"}
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          {complete
            ? "A completed handover is recorded. Setup stays hidden on Overview, but you can review the guide here."
            : "Use these shortcuts for your first rental. Progress comes from saved company records, not manual ticks."}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs font-bold text-slate-600">
            {complete ? "First handover completed" : status.completedCount + " of " + status.totalCount + " steps observed"}
          </span>
          {!complete && <div role="progressbar" aria-label="First rental setup progress" aria-valuenow={status.completedCount}
            aria-valuemin={0} aria-valuemax={status.totalCount}
            className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
            <span style={{ width: String(progress) + "%" }} className="block h-full rounded-full bg-emerald-500"/>
          </div>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {mode === "overview" ? <button type="button" disabled={busy}
          onClick={() => void setVisibility("DISMISS")}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <EyeOff size={15}/>Hide guide
        </button> : <>
          {!complete && (dismissed ? <button type="button" disabled={busy}
            onClick={() => void setVisibility("RESTORE")}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
            <Eye size={15}/>Show on Overview
          </button> : <button type="button" disabled={busy}
            onClick={() => void setVisibility("DISMISS")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <EyeOff size={15}/>Hide from Overview
          </button>)}
          <button type="button" onClick={() => setExpanded(open => !open)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
            {expanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
            {expanded ? "Collapse guide" : "Review guide"}
          </button>
        </>}
      </div>
    </div>

    {error && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}

    {expanded && <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {status.steps.map(step => {
        const permitted = portal.sections.some(item => item.id === step.section);
        return <div key={step.id} className={"group rounded-xl border p-4 " +
          (step.complete ? "border-emerald-100 bg-emerald-50/50" : "border-slate-200 bg-white")}>
          <div className="flex items-start justify-between gap-2">
            <span className={"grid h-7 w-7 shrink-0 place-items-center rounded-lg " +
              (step.complete ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500")}>
              {step.complete ? <Check size={16}/> : <ArrowRight size={14}/>}
            </span>
            <span className={"text-[10px] font-bold uppercase tracking-wide " +
              (step.complete ? "text-emerald-700" : "text-slate-400")}>
              {step.complete ? "Observed" : "Next step"}
            </span>
          </div>
          <h3 className="mt-3 text-sm font-bold text-slate-900">{step.label}</h3>
          <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{step.description}</p>
          {permitted ? <button type="button" onClick={() => navigate(step.section)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline">
            {step.complete ? "Review records" : "Open workspace"} <ArrowRight size={13}/>
          </button> : <span className="mt-3 inline-flex items-center gap-1 text-xs text-slate-400">
            <ShieldCheck size={13}/>Ask an authorized teammate
          </span>}
        </div>;
      })}
    </div>}
    {mode === "settings" && <p className="mt-4 text-xs text-slate-500">
      Hiding this guide affects the company, not just your browser. It does not bypass payment, contract, inspection or driver-verification checks.
    </p>}
  </section>;
}
