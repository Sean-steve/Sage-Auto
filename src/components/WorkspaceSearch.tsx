import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CarFront, CalendarDays, ChevronRight, Search, UserRound, X } from "lucide-react";
import type { AccessPortal } from "../lib/access-context";
import {
  searchWorkspaceRecords,
  type WorkspaceSearchItem,
  type WorkspaceSearchKind,
} from "../lib/workspace-search";

const labelByKind: Record<WorkspaceSearchKind, string> = {
  MODULE: "Workspace",
  VEHICLE: "Vehicles",
  CUSTOMER: "Customers",
  DRIVER: "Drivers",
  BOOKING: "Bookings",
  RENTAL: "Rentals",
  INVOICE: "Invoices",
  PAYMENT: "Payments",
};
const groupOrder: WorkspaceSearchKind[] = ["MODULE", "VEHICLE", "CUSTOMER", "DRIVER", "BOOKING", "RENTAL", "INVOICE", "PAYMENT"];

export function WorkspaceSearch({
  portal,
  descriptions,
  onSelect,
}: {
  portal: AccessPortal;
  descriptions: Record<string, string>;
  onSelect: (result: WorkspaceSearchItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<WorkspaceSearchItem[]>([]);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const sequence = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();

  const modules = useMemo<WorkspaceSearchItem[]>(() => portal.sections
    .filter(section => !q || section.label.toLowerCase().includes(q) ||
      (descriptions[section.id] || "").toLowerCase().includes(q))
    .map(section => ({
      kind: "MODULE",
      id: section.id,
      section: section.id,
      title: section.label,
      subtitle: descriptions[section.id] || "Open workspace",
    })), [portal.sections, descriptions, q]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(current => !current);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    const id = ++sequence.current;
    setActive(0);
    if (!open || q.length < 2) {
      setRecords([]);
      setUnavailable([]);
      setLoading(false);
      return;
    }
    setRecords([]);
    setUnavailable([]);
    setLoading(true);
    const timeout = window.setTimeout(() => {
      void searchWorkspaceRecords(portal, q).then(result => {
        if (sequence.current !== id) return;
        setRecords(result.items);
        setUnavailable(result.unavailable);
      }).catch(() => {
        if (sequence.current === id) setUnavailable(["records"]);
      }).finally(() => {
        if (sequence.current === id) setLoading(false);
      });
    }, 275);
    return () => {
      sequence.current++;
      window.clearTimeout(timeout);
    };
  }, [portal.id, portal.permissions.join("|"), open, q]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const visible = [
    ...modules,
    ...(q.length >= 2 ? records : []),
  ];
  const choose = (result: WorkspaceSearchItem) => {
    if (!portal.sections.some(section => section.id === result.section)) return;
    onSelect(result);
    setOpen(false);
    setQuery("");
    setRecords([]);
    setActive(0);
  };
  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(current => Math.min(Math.max(visible.length - 1, 0), current + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(current => Math.max(0, current - 1));
    }
    if (event.key === "Enter" && visible[active]) {
      event.preventDefault();
      choose(visible[active]);
    }
  };

  return <>
    <button type="button" onClick={() => setOpen(true)}
      aria-label="Search vehicles, customers, bookings, rentals and finance records"
      className="flex h-9 min-w-0 max-w-[410px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-xs font-medium text-slate-500 transition hover:border-emerald-300 hover:bg-white focus-visible:outline-2 focus-visible:outline-emerald-600">
      <Search size={16} className="shrink-0 text-emerald-700" aria-hidden="true"/>
      <span className="hidden truncate sm:inline">Search vehicles, bookings, payments…</span>
      <span className="hidden flex-1 sm:inline"/>
      <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 lg:inline">Ctrl K</kbd>
    </button>
    {open && <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/60 px-3 pt-[7vh] backdrop-blur-sm sm:px-6"
      onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label="Search Sage Auto"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-4">
          <Search size={19} className="shrink-0 text-emerald-700" aria-hidden="true"/>
          <input ref={input} autoFocus value={query} maxLength={100}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            aria-label="Search company records and modules"
            placeholder="Registration, customer, booking, invoice, payment…"
            className="h-14 min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-950 outline-none"/>
          <button type="button" onClick={() => setOpen(false)}
            aria-label="Close search" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={17}/>
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto p-2" aria-live="polite">
          {groupOrder.map(kind => {
            const items = visible.filter(result => result.kind === kind);
            if (!items.length) return null;
            return <div key={kind} className="mb-2">
              <div className="px-3 py-2 text-[10px] font-black uppercase tracking-[.16em] text-slate-500">{labelByKind[kind]}</div>
              {items.map(result => {
                const index = visible.indexOf(result);
                const Icon = result.kind === "VEHICLE" ? CarFront :
                  result.kind === "CUSTOMER" || result.kind === "DRIVER" ? UserRound :
                  result.kind === "BOOKING" || result.kind === "RENTAL" || result.kind === "INVOICE" || result.kind === "PAYMENT" ? CalendarDays : ArrowRight;
                return <button key={result.kind + ":" + result.id} type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(result)}
                  className={"flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition " +
                    (active === index ? "bg-emerald-50" : "hover:bg-slate-50")}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-emerald-700"><Icon size={16}/></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-slate-900">{result.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{result.subtitle}</span></span>
                  <ChevronRight className="text-slate-400" size={16}/>
                </button>;
              })}
            </div>;
          })}
          {loading && <p className="px-4 py-3 text-sm text-slate-500" role="status">Searching permitted records…</p>}
          {unavailable.length > 0 && <p className="mx-2 my-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800" role="status">
            Some search categories are currently unavailable. Other results may still be shown.
          </p>}
          {!loading && !visible.length && <p className="px-4 py-10 text-center text-sm text-slate-500">
            {q.length < 2 ? "Start typing to search this workspace." : "No matching permitted records or modules."}
          </p>}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] text-slate-500">
          <span>Tenant-scoped, permission-aware results</span>
          <span>↑ ↓ Navigate · Enter Open · Esc Close</span>
        </div>
      </section>
    </div>}
  </>;
}
