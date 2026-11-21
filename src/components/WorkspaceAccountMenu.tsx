import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftRight, ChevronRight, KeyRound, LogOut, Settings2, ShieldCheck, UserRound, X } from "lucide-react";
import type { AccessContext, AccessPortal } from "../lib/access-context";
import { apiClient } from "../lib/api-client";

type Session = {
  id: string;
  createdAt?: string;
  lastUsedAt?: string;
  deviceLabel?: string;
  isCurrent?: boolean;
};

export function WorkspaceAccountMenu({
  context, portal, onSection, onSwitch, onSignOut,
}: {
  context: AccessContext;
  portal: AccessPortal;
  onSection: (id: string) => void;
  onSwitch: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<"profile" | "security" | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const menu = useRef<HTMLDivElement>(null);
  const initials = context.user.fullName.split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "?";
  const role = portal.roles.map(item => item.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, char => char.toUpperCase())).join(" · ");

  useEffect(() => {
    const dismiss = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); setPanel(null); }
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  async function loadSessions() {
    setLoading(true);
    setError("");
    const response = await apiClient.auth.getSessions();
    if (response.error) {
      setError(response.error.message || "Unable to load sessions.");
      setSessions([]);
    } else {
      setSessions(Array.isArray(response.data?.sessions) ? response.data.sessions : []);
    }
    setLoading(false);
  }

  function openPanel(kind: "profile" | "security") {
    setOpen(false);
    setPanel(kind);
    if (kind === "security") void loadSessions();
  }

  async function revokeSession(id: string) {
    setBusyId(id);
    setError("");
    const response = await apiClient.auth.revokeSession(id);
    if (response.error) setError(response.error.message || "Could not revoke session.");
    else await loadSessions();
    setBusyId("");
  }

  return <div className="relative" ref={menu}>
    <button type="button" aria-label="Open my account menu" aria-haspopup="menu"
      aria-expanded={open} onClick={() => setOpen(value => !value)}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-black text-white ring-offset-2 transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-emerald-600">
      {initials}
    </button>
    {open && <div role="menu" aria-label="My account"
      className="absolute right-0 top-12 z-[65] w-[min(320px,calc(100vw-30px))] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
      <div className="border-b border-slate-100 px-3 py-3">
        <div className="truncate text-sm font-bold text-slate-950">{context.user.fullName}</div>
        <div className="mt-1 truncate text-xs text-slate-500">{context.user.email}</div>
        <div className="mt-2 text-xs font-semibold text-emerald-700">{role}</div>
        {context.user.emailVerified && <div className="mt-2 flex items-center gap-1 text-xs text-emerald-700"><ShieldCheck size={13}/> Email verified</div>}
      </div>
      <div className="py-1">
        <button role="menuitem" type="button" onClick={() => openPanel("profile")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"><UserRound size={16}/>My profile<ChevronRight className="ml-auto" size={15}/></button>
        <button role="menuitem" type="button" onClick={() => openPanel("security")} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"><KeyRound size={16}/>Security & sessions<ChevronRight className="ml-auto" size={15}/></button>
        {portal.sections.some(item => item.id === "settings") && <button role="menuitem" type="button" onClick={() => { setOpen(false); onSection("settings"); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"><Settings2 size={16}/>Company settings<ChevronRight className="ml-auto" size={15}/></button>}
        <button role="menuitem" type="button" onClick={() => { setOpen(false); onSwitch(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"><ArrowLeftRight size={16}/>Switch workspace</button>
      </div>
      <div className="border-t border-slate-100 pt-1">
        <button role="menuitem" type="button" onClick={() => { setOpen(false); onSignOut(); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50"><LogOut size={16}/>Sign out</button>
      </div>
    </div>}
    {panel && createPortal(<div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setPanel(null); }}>
      <section role="dialog" aria-modal="true" aria-label={panel === "profile" ? "My profile" : "Security and sessions"}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <header className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold text-slate-950">{panel === "profile" ? "My profile" : "Security & sessions"}</h2>
          <button type="button" aria-label="Close account panel" onClick={() => setPanel(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button>
        </header>
        {panel === "profile" ? <dl className="space-y-4">
          <div><dt className="text-xs font-medium text-slate-500">Full name</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{context.user.fullName}</dd></div>
          <div><dt className="text-xs font-medium text-slate-500">Email</dt><dd className="mt-1 break-all text-sm font-semibold text-slate-900">{context.user.email}</dd></div>
          <div><dt className="text-xs font-medium text-slate-500">Current role</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{role}</dd></div>
          <div><dt className="text-xs font-medium text-slate-500">Company</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{portal.name}</dd></div>
          <div><dt className="text-xs font-medium text-slate-500">Email verification</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{context.user.emailVerified ? "Verified" : "Not verified"}</dd></div>
          <p className="text-xs text-slate-500">Your account details are provided by the authenticated Sage Auto identity service.</p>
        </dl> : <div>
          <p className="mb-3 text-xs text-slate-500">Active sessions associated with your account. You may revoke other sessions.</p>
          {loading && <p role="status" className="text-sm text-slate-500">Loading sessions…</p>}
          {error && <p role="alert" className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {!loading && !sessions.length && !error && <p className="text-sm text-slate-500">No active sessions returned.</p>}
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {sessions.map(session => <div key={session.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{session.deviceLabel || "Signed-in device"} {session.isCurrent ? "· Current" : ""}</p>
                <p className="mt-1 text-xs text-slate-500">{session.lastUsedAt ? "Last used " + new Date(session.lastUsedAt).toLocaleString() : "Active session"}</p></div>
              {!session.isCurrent && <button type="button" disabled={busyId === session.id} onClick={() => void revokeSession(session.id)}
                className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Revoke</button>}
            </div>)}
          </div>
        </div>}
      </section>
    </div>, document.body)}
  </div>;
}
