import React from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const STAGES = ["Bookings","Payment","Handover","Rentals","Returns","Finance","Settlements"] as const;
type Stage = typeof STAGES[number];

export function WorkflowNextStep({
  current,next,description,onNext,canNext=true,
}:{
  current:Stage;next:Stage;description:string;onNext:()=>void;canNext?:boolean;
}){
  return <section aria-label="Rental workflow next step"
    className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm dark:border-emerald-900 dark:bg-slate-900">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.12em] text-emerald-700">
          <CheckCircle2 size={13}/>Connected rental workflow
        </p>
        <h2 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
          {current} <ArrowRight size={14} className="mx-1 inline text-emerald-700"/> {next}
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      {canNext&&<button type="button" onClick={onNext}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800">
        Open {next}<ArrowRight size={14}/>
      </button>}
    </div>
    <p className="mt-3 border-t border-slate-100 pt-3 text-[10px] leading-5 text-slate-400 dark:border-slate-800">
      {STAGES.join("  →  ")} · All payment, document, inspection and allocation gates remain enforced.
    </p>
  </section>;
}
