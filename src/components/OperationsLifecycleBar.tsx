import React from "react";
import { CalendarRange, ChevronRight } from "lucide-react";
import { useApp } from "../lib/store";

type StageId = "bookings" | "handover" | "rentals" | "returns";

const stages: Array<{ id: StageId; label: string; description: string }> = [
  { id: "bookings", label: "Bookings", description: "Confirm the reservation and allocation" },
  { id: "handover", label: "Contract & Handover", description: "Contract, checks, inspection and key release" },
  { id: "rentals", label: "Rentals", description: "Dispatch and active on-road control" },
  { id: "returns", label: "Returns & Final Calculation", description: "Receive, inspect, calculate and close" },
];

export function OperationsLifecycleBar({ current }: { current: StageId }) {
  const { navigateSection } = useApp();
  const currentIndex = stages.findIndex((stage) => stage.id === current);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-emerald-600">Operations lifecycle</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            One rental journey. Availability supports every stage but is not a required step between them.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigateSection("availability")}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <CalendarRange size={14} />
          Availability control
        </button>
      </div>

      <div className="mt-4 grid gap-2 lg:grid-cols-4">
        {stages.map((stage, index) => {
          const active = stage.id === current;
          const completed = index < currentIndex;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => navigateSection(stage.id)}
              aria-current={active ? "step" : undefined}
              className={
                "group rounded-xl border p-3 text-left transition " +
                (active
                  ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                  : completed
                    ? "border-slate-200 bg-slate-50 hover:border-emerald-200 dark:border-slate-700 dark:bg-slate-800"
                    : "border-slate-200 bg-white hover:border-emerald-200 dark:border-slate-800 dark:bg-slate-900")
              }
            >
              <div className="flex items-start gap-3">
                <span
                  className={
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black " +
                    (active
                      ? "bg-emerald-600 text-white"
                      : completed
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300")
                  }
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-xs font-black text-slate-900 dark:text-white">
                    {stage.label}
                    {index < stages.length - 1 && <ChevronRight className="h-3 w-3 text-slate-300" />}
                  </span>
                  <span className="mt-1 block text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                    {stage.description}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
