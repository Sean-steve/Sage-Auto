import React, { useState } from "react";
import {
  Server,
  Building2,
  Zap,
  Shield,
  CreditCard,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Users,
  Car,
  Lock,
  Unlock,
  Play,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useApp } from "@/lib/store";
import type { SubscriptionState, FeatureKey } from "@carhire/types";

export const SaaSControlPlaneView: React.FC = () => {
  const {
    tenants = [],
    subscriptions = [],
    plans = [],
    activeTenantId,
    setActiveTenantId,
    updateSubscriptionState,
    switchSubscriptionPlan,
    checkEntitlement,
    isSupportAccessActive,
    startSupportAccess,
    endSupportAccess,
    auditRecords = [],
    vehicles = [],
  } = useApp();

  const [testFeatureKey, setTestFeatureKey] = useState<FeatureKey>("fleet.vehicle.create");

  // SaaS wide metrics
  const totalTenants = (tenants || []).length;
  const totalFleetAssets = (vehicles || []).length;
  const totalMRR = (subscriptions || []).reduce((acc, sub) => {
    const plan = (plans || []).find((p) => p.id === sub.planId);
    return acc + (sub.state === "ACTIVE" ? plan?.monthlyPrice || 0 : 0);
  }, 0);

  const supportSessions = (auditRecords || []).filter((a) => a.resourceType === "SupportSession");

  const entitlementResult = checkEntitlement(testFeatureKey);

  return (
    <div id="saas-control-plane-view" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">SaaS Platform Control Plane</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300 font-bold">
              SUPER ADMIN / MULTI-TENANT ENGINE
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Cross-tenant billing lifecycle, plan quotas, ENT-001 entitlement policy evaluation, and DEV-004 support impersonation sessions.
          </p>
        </div>

        {/* Support Mode Status */}
        {isSupportAccessActive ? (
          <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 px-4 py-2 rounded-xl text-xs">
            <span className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-amber-600" /> Impersonation Active
            </span>
            <button
              onClick={endSupportAccess}
              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs"
            >
              Terminate Session
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              const reason = prompt("Enter support session audit justification:", "Resolving customer billing inquiry");
              if (reason) startSupportAccess(reason);
            }}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5"
          >
            <Shield className="w-4 h-4" />
            <span>Launch Audited Support Session</span>
          </button>
        )}
      </div>

      {/* Global Platform KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Total B2B Tenants</span>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{totalTenants}</p>
          <span className="text-[11px] text-slate-400">Multi-tenant isolated databases</span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Platform Recurring Revenue (MRR)</span>
          <p className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-1">
            KES {totalMRR.toLocaleString()} <span className="text-xs text-slate-400 font-normal">/ month</span>
          </p>
          <span className="text-[11px] text-emerald-600 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" /> Stripe Billing Webhooks Synced
          </span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Total Managed Vehicles</span>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{totalFleetAssets}</p>
          <span className="text-[11px] text-slate-400">Across all platform operators</span>
        </div>
      </div>

      {/* Main Content: Tenant Subscriptions & Entitlement Tester */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Tenant Subscription Directory */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Tenant Subscriptions & Quota Controls</h2>

          <div className="space-y-4">
            {tenants.map((t) => {
              const sub = subscriptions.find((s) => s.tenantId === t.id);
              const plan = plans.find((p) => p.id === sub?.planId);
              const tenantCarCount = vehicles.filter((v) => v.tenantId === t.id).length;
              const isCurrent = t.id === activeTenantId;

              return (
                <div
                  key={t.id}
                  className={`bg-white dark:bg-slate-800 rounded-2xl border p-5 shadow-xs space-y-4 ${
                    isCurrent ? "border-purple-300 dark:border-purple-800 ring-1 ring-purple-500/20" : "border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t.name}</h3>
                        {isCurrent && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                            Active Scope
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {t.city}, {t.country} • Currency: {t.currency} • Subdomain: {t.slug}
                      </p>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase self-start sm:self-auto ${
                        sub?.state === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : sub?.state === "TRIAL" || sub?.state === "GRACE_PERIOD"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          : sub?.state === "RENEWAL_DUE" || sub?.state === "PAST_DUE"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                      }`}
                    >
                      {sub?.state || "TRIAL"}
                    </span>
                  </div>

                  {/* Plan & Usage Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 text-xs">
                    <div>
                      <span className="text-slate-400">Current Plan:</span>
                      <p className="font-bold text-slate-800 dark:text-slate-200">
                        {plan?.name} ({plan?.currency} {plan?.monthlyPrice.toLocaleString()}/mo)
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Vehicle Quota:</span>
                      <p className="font-bold text-slate-800 dark:text-slate-200">
                        {tenantCarCount} / {plan?.maxVehicles} Used
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Next Billing Date:</span>
                      <p className="font-bold text-slate-800 dark:text-slate-200">
                        {sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : "N/A"}
                      </p>
                    </div>
                  </div>

                  {/* Control Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2">
                      <select
                        value={sub?.planId}
                        onChange={(e) => {
                          if (sub) switchSubscriptionPlan(sub.id, e.target.value);
                        }}
                        className="text-xs p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 border-0 text-slate-800 dark:text-slate-200"
                      >
                        {plans.map((p) => (
                          <option key={p.id} value={p.id}>
                            Change Plan to: {p.name}
                          </option>
                        ))}
                      </select>

                      <select
                        value={sub?.state}
                        onChange={(e) => {
                          if (sub) updateSubscriptionState(sub.id, e.target.value as SubscriptionState);
                        }}
                        className="text-xs p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 border-0 text-slate-800 dark:text-slate-200"
                      >
                        <option value="TRIAL">TRIAL</option>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="RENEWAL_DUE">RENEWAL DUE</option>
                        <option value="PAST_DUE">PAST DUE</option>
                        <option value="GRACE_PERIOD">GRACE PERIOD</option>
                        <option value="SUSPENDED">SUSPENDED</option>
                        <option value="CANCELLED">CANCELLED</option>
                        <option value="EXPIRED">EXPIRED</option>
                      </select>
                    </div>

                    {!isCurrent && (
                      <button
                        onClick={() => setActiveTenantId(t.id)}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold"
                      >
                        Switch To This Workspace
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 1 Col: Live ENT-001 Entitlement Engine Evaluator */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-purple-600" />
              <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                ENT-001 Policy Evaluator
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Test dynamic runtime entitlement decisions for the currently selected workspace.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Feature Key to Evaluate:
                </label>
                <select
                  value={testFeatureKey}
                  onChange={(e) => setTestFeatureKey(e.target.value as FeatureKey)}
                  className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                >
                  <option value="fleet.vehicle.create">fleet.vehicle.create (Vehicle Limit)</option>
                  <option value="analytics.advanced">analytics.advanced (Reports)</option>
                  <option value="custom_domain">custom_domain (White-label DNS)</option>
                  <option value="api_access">api_access (REST API Keys)</option>
                  <option value="multi_branch">multi_branch (Multiple Locations)</option>
                </select>
              </div>

              {/* Decision Result Card */}
              <div
                className={`p-4 rounded-xl border space-y-2 ${
                  entitlementResult.allowed
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800"
                    : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">Decision Status:</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      entitlementResult.allowed
                        ? "bg-emerald-600 text-white"
                        : "bg-rose-600 text-white"
                    }`}
                  >
                    {entitlementResult.allowed ? "PERMITTED" : "BLOCKED"}
                  </span>
                </div>

                <div className="text-[11px] space-y-1">
                  <p>Reason: <span className="font-medium">{entitlementResult.reason}</span></p>
                  {entitlementResult.limit !== undefined && (
                    <p>Current Usage: <span className="font-mono font-bold">{entitlementResult.currentUsage} / {entitlementResult.limit}</span></p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Support Access Session Log (DEV-004 §6) */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-600" />
              <h3 className="font-bold text-xs text-slate-900 dark:text-white">Support Impersonation Log</h3>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {supportSessions.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">No support sessions recorded.</p>
              ) : (
                supportSessions.map((log) => (
                  <div key={log.id} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 text-[11px] space-y-0.5">
                    <div className="flex justify-between font-semibold">
                      <span>{log.actorEmail}</span>
                      <span className="text-slate-400">{new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <p className="text-slate-500">Reason: "{log.details?.reason || log.action}"</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
