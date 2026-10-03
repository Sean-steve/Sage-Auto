import React, { useState } from "react";
import {
  Settings,
  Building2,
  Users,
  Shield,
  CreditCard,
  FileText,
  Clock,
  Key,
  CheckCircle2,
  Lock,
  Save,
  Globe,
  Radio,
} from "lucide-react";
import { useApp } from "../lib/store";

export const WorkspaceSettingsView: React.FC = () => {
  const { restoration } = useApp();
  const {
    activeTenant,
    tenants,
    memberships,
    users,
    auditRecords,
    activeTenantId,
    updateTenantSettings,
    activePlan,
  } = useApp();

  const [activeTab, setActiveTab] = useState<"PROFILE" | "BILLING" | "PAYMENTS" | "TEAM" | "AUDIT">("PROFILE");
  const {
    activeSubscription,
    plans = [],
    changeTenantPlan,
    updateSubscriptionState,
    showNotification,
    accessMode,
  } = useApp();

  const [isChangePlanModalOpen, setIsChangePlanModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(activePlan?.id || "plan-growth");

  // Form states for tenant profile
  const [name, setName] = useState(activeTenant?.name || "");
  const [tagline, setTagline] = useState(activeTenant?.tagline || "");
  const [currency, setCurrency] = useState(activeTenant?.currency || "KES");
  const [timezone, setTimezone] = useState(activeTenant?.timezone || "Africa/Nairobi");
  const [vatPin, setVatPin] = useState("");
  const [vatRate, setVatRate] = useState((activeTenant?.taxRatePercent ?? "").toString());

  // M-Pesa Daraja Settings
  const [paybill, setPaybill] = useState(activeTenant?.mpesaPaybill || "");
  const [mpesaEnv, setMpesaEnv] = useState<"SANDBOX" | "PRODUCTION">(
    activeTenant?.mpesaSandbox ? "SANDBOX" : "PRODUCTION"
  );
  const [consumerKey, setConsumerKey] = useState("");
  const [passkey, setPasskey] = useState("");

  const tenantMemberships = (memberships || []).filter((m) => m.tenantId === activeTenantId);
  const tenantAuditLogs = (auditRecords || []).filter((l) => l.tenantId === activeTenantId);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateTenantSettings({
      name,
      tagline,
      currency,
      timezone,
      taxRatePercent: parseFloat(vatRate) || 16,
      mpesaPaybill: paybill,
      mpesaSandbox: mpesaEnv === "SANDBOX",
      mpesaPasskey: passkey,
    });
  };

  return (
    <div id="workspace-settings-view" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Workspace Configuration & Security</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              Tenant ID: {activeTenant.id}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Operational tax policies, Safaricom M-Pesa API credentials, team RBAC roles, and immutable domain audit logs.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab("PROFILE")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "PROFILE"
              ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
          }`}
        >
          Company & Tax Profile
        </button>
        <button
          onClick={() => setActiveTab("BILLING")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "BILLING"
              ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
          }`}
        >
          Subscription & SaaS Billing
        </button>
        <button
          onClick={() => setActiveTab("PAYMENTS")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "PAYMENTS"
              ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
          }`}
        >
          M-Pesa Daraja Gateway API
        </button>
        <button
          onClick={() => setActiveTab("TEAM")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "TEAM"
              ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
          }`}
        >
          Team & RBAC Roles
        </button>
        <button
          onClick={() => setActiveTab("AUDIT")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "AUDIT"
              ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
          }`}
        >
          Domain Audit Logs
        </button>
      </div>

      {/* Tab: Profile */}
      {activeTab === "PROFILE" && (
        <form onSubmitCapture={restoration ? e => {e.preventDefault();e.stopPropagation();} : undefined} onSubmit={handleSaveProfile} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs max-w-2xl space-y-4 text-xs">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">General Organization Settings</h2>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Company / Legal Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Tagline / Brand Slogan</label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Base Currency</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">IANA Timezone</label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">KRA VAT PIN</label>
              <input
                type="text"
                value={vatPin}
                onChange={(e) => setVatPin(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">VAT Rate (%)</label>
              <input
                type="number"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <button disabled={restoration} aria-describedby="restoration-actions-note"
            type="submit"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </form>
      )}

      {/* Tab: SaaS Subscription & Platform Billing */}
      {activeTab === "BILLING" && (
        <div className="space-y-6">
          {/* Subscription Overview Card */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Commercial SaaS Subscription</h2>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                      activeSubscription?.state === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                        : activeSubscription?.state === "TRIAL"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                        : activeSubscription?.state === "GRACE_PERIOD" || activeSubscription?.state === "PAST_DUE" || activeSubscription?.state === "RENEWAL_DUE"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                    }`}
                  >
                    {activeSubscription?.state || "ACTIVE"}
                  </span>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    Mode: {accessMode || "FULL"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Platform tier: <strong>{activePlan?.name}</strong> • Machine Code: <code>{activePlan?.code}</code>
                </p>
              </div>

              <div className="flex items-center gap-2">
                {(activeSubscription?.state === "PAST_DUE" ||
                  activeSubscription?.state === "GRACE_PERIOD" ||
                  activeSubscription?.state === "SUSPENDED" ||
                  activeSubscription?.state === "EXPIRED" ||
                  activeSubscription?.state === "CANCELLED") && (
                  <button disabled={restoration} aria-describedby="restoration-actions-note"
                    onClick={() => {
                      if (activeSubscription && updateSubscriptionState) {
                        updateSubscriptionState(activeSubscription.id, "ACTIVE", "Payment settled via self-service billing recovery");
                        showNotification("Payment processed successfully. Subscription restored to ACTIVE.", "success");
                      }
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Settle & Reactivate</span>
                  </button>
                )}

                <button disabled={restoration} aria-describedby="restoration-actions-note"
                  onClick={() => setIsChangePlanModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-xs"
                >
                  Change SaaS Plan
                </button>
              </div>
            </div>

            {/* Quota & Billing Term Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-xs">
                <span className="text-slate-400">Subscription Price:</span>
                <p className="text-base font-extrabold text-slate-900 dark:text-white mt-1">
                  KES {activePlan?.monthlyPrice.toLocaleString()} <span className="text-xs font-normal text-slate-400">/ mo</span>
                </p>
                <span className="text-[11px] text-slate-400">Billed monthly via M-Pesa / Wire</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-xs">
                <span className="text-slate-400">Vehicle Fleet Limit:</span>
                <p className="text-base font-extrabold text-slate-900 dark:text-white mt-1">
                  {activePlan?.maxVehicles} Vehicles Allowed
                </p>
                <span className="text-[11px] text-emerald-600 font-medium">ENT-001 Policy Enforced</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-xs">
                <span className="text-slate-400">Next Billing Renewal:</span>
                <p className="text-base font-extrabold text-slate-900 dark:text-white mt-1">
                  {activeSubscription?.currentPeriodEnd ? new Date(activeSubscription.currentPeriodEnd).toLocaleDateString() : "N/A"}
                </p>
                <span className="text-[11px] text-slate-400">Auto-renewal status not verified</span>
              </div>
            </div>
          </div>

          {/* SaaS Billing Invoices Table */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Platform Billing Invoices & Receipts</h3>
            <div className="border border-slate-100 dark:border-slate-700 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 font-semibold uppercase text-[10px]">
                  <tr>
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Plan Period</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                  <tr><td colSpan={5} className="p-4">Billing records are not connected to this screen yet.</td></tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* Change Plan Modal */}
      {isChangePlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Change Workspace Subscription Plan</h3>
            <p className="text-xs text-slate-500">
              Upgrading or downgrading adjusts fleet vehicle caps and feature capabilities immediately.
            </p>

            <div className="space-y-3">
              {plans.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPlanId(p.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-colors flex items-center justify-between text-xs ${
                    selectedPlanId === p.id
                      ? "border-purple-600 bg-purple-50 dark:bg-purple-950/40"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40"
                  }`}
                >
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white">{p.name}</span>
                    <p className="text-slate-500 text-[11px]">Up to {p.maxVehicles} Vehicles • {p.maxMembers} Staff Members</p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-slate-900 dark:text-white">KES {p.monthlyPrice.toLocaleString()}/mo</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button disabled={restoration} aria-describedby="restoration-actions-note"
                type="button"
                onClick={() => setIsChangePlanModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button disabled={restoration} aria-describedby="restoration-actions-note"
                type="button"
                onClick={() => {
                  changeTenantPlan(selectedPlanId);
                  setIsChangePlanModalOpen(false);
                }}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs"
              >
                Confirm Plan Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Payments Gateway */}
      {activeTab === "PAYMENTS" && (
        <form onSubmitCapture={restoration ? e => {e.preventDefault();e.stopPropagation();} : undefined} onSubmit={handleSaveProfile} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs max-w-2xl space-y-4 text-xs">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Safaricom M-Pesa Daraja 2.0 API</h2>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Environment Mode</label>
            <select
              value={mpesaEnv}
              onChange={(e) => setMpesaEnv(e.target.value as any)}
              className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
            >
              <option value="SANDBOX">Safaricom Sandbox Testbed (174379)</option>
              <option value="PRODUCTION">Live Production Paybill / Till Number</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Business Shortcode / Paybill</label>
              <input
                type="text"
                value={paybill}
                onChange={(e) => setPaybill(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Consumer Key</label>
              <input
                type="password"
                value={consumerKey}
                onChange={(e) => setConsumerKey(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Online Passkey (Base64 Encrypted)</label>
            <input
              type="password"
              value={passkey}
              onChange={(e) => setPasskey(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono"
            />
          </div>

          <button disabled={restoration} aria-describedby="restoration-actions-note"
            type="submit"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>Update API Credentials</span>
          </button>
        </form>
      )}

      {/* Tab: Team & RBAC */}
      {activeTab === "TEAM" && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Active Team Members & Assigned Roles</h2>
            <span className="text-xs text-slate-400 font-mono">RBAC-001 Enforced</span>
          </div>

          <div className="space-y-3">
            {tenantMemberships.map((m) => {
              const u = (users || []).find((user) => user.id === m.userId);

              return (
                <div
                  key={m.id}
                  className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs">
                      {u?.fullName.substring(0, 2).toUpperCase() || "US"}
                    </div>
                    <div>
                      <h3 className="font-bold text-xs text-slate-900 dark:text-white">{u?.fullName || "User"}</h3>
                      <p className="text-xs text-slate-500">{u?.email || ""}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-xs font-semibold">
                      {m.roleName || "Workspace Admin"}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Joined: {new Date(m.joinedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Immutable Domain Audit Logs */}
      {activeTab === "AUDIT" && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Tenant Security & Operational Audit Trail</h2>
            <span className="text-xs text-slate-400 font-mono">DATA-005 Append-Only</span>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {tenantAuditLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{log.action}</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 text-[11px]">
                  <span>Entity: {log.resourceType} #{log.resourceId}</span>
                  <span>Actor: {log.actorEmail} ({log.actorType})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
