import React, { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Bell, Building2, CheckCircle2,
  ChevronRight, CircleAlert, Clock3, CreditCard, FileClock, FileText, GitBranch,
  Layers3, LockKeyhole, Menu, Plus, RefreshCw, Search, Settings2, ShieldCheck,
  ShieldAlert, Users, Wallet, X,
} from "lucide-react";
import type { AccessContext, AccessPortal } from "../../lib/access-context";
import {
  displayMoney, displayValue, flattenMetrics, loadPlatformPanel, platformCan,
  platformRequest, platformRows, type PlatformDataset,
} from "./PlatformControlData";
import "./platform-owner.css";

type Props = {
  context: AccessContext;
  portal: AccessPortal;
  section: string;
  onSection: (section: string) => void;
  onSwitch: () => void;
  onSignOut: () => void;
  team: React.ReactNode;
  support: React.ReactNode;
};

type Action = {
  kind: "suspendTenant" | "reactivateTenant" | "offboardTenant" |
    "suspendSubscription" | "reactivateSubscription" | "archivePlan" | "retryDeadLetter";
  id: string;
  name: string;
  permission: string;
  version?: number;
};

const GROUPS = [
  { title: "Overview", items: ["overview", "platformAnalytics"] },
  { title: "Commercial", items: ["companies", "plans", "platformBilling", "platformEntitlements"] },
  { title: "Operations", items: ["platformIntegrations", "platformJobs", "platformIncidents", "platformNotifications"] },
  { title: "Governance", items: ["team", "support", "platformAudit", "platformCompliance", "platformSettings"] },
];
const ICONS: Record<string, React.ReactNode> = {
  overview: <Activity />, platformAnalytics: <BarChart3 />, companies: <Building2 />,
  plans: <Layers3 />, platformBilling: <CreditCard />, platformEntitlements: <ShieldCheck />,
  platformIntegrations: <GitBranch />, platformJobs: <Clock3 />, platformIncidents: <ShieldAlert />,
  platformNotifications: <Bell />, team: <Users />, support: <ShieldCheck />,
  platformAudit: <FileClock />, platformCompliance: <LockKeyhole />, platformSettings: <Settings2 />,
};
const tabs: Record<string, Array<{ id: string; label: string }>> = {
  companies: [{ id: "list", label: "Companies" }, { id: "provision", label: "New workspace" }],
  plans: [{ id: "subscriptions", label: "Subscriptions" }, { id: "catalog", label: "Plan catalog" }],
  platformBilling: [{ id: "invoices", label: "Subscription invoices" }, { id: "payments", label: "Receipts" }],
  platformAnalytics: [
    { id: "overview", label: "Performance" }, { id: "movements", label: "MRR movement" },
    { id: "cohorts", label: "Cohorts" }, { id: "billing", label: "Collections" },
  ],
  platformEntitlements: [{ id: "features", label: "Feature registry" }, { id: "plan", label: "Plan entitlements" }],
  platformJobs: [{ id: "queues", label: "Outbox" }, { id: "dlq", label: "Dead-letter queue" }],
};

function Table({ columns, rows, empty = "No saved records found.", onSelect }: {
  columns: Array<{ label: string; value: (row: any) => React.ReactNode }>;
  rows: any[];
  empty?: string;
  onSelect?: (row: any) => void;
}) {
  return <div className="platform-table-wrap">
    <table><thead><tr>{columns.map((column, i) => <th key={i} scope="col">{column.label}</th>)}{onSelect && <th scope="col">View</th>}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={row.id || row.invoiceNumber || row.code || i}>
        {columns.map((column, j) => <td key={j}>{column.value(row)}</td>)}
        {onSelect && <td><button className="platform-inline" onClick={() => onSelect(row)}>Details <ChevronRight size={14}/></button></td>}
      </tr>)}</tbody>
    </table>
    {!rows.length && <div className="platform-empty">{empty}</div>}
  </div>;
}
function Badge({ value }: { value: unknown }) {
  const label = displayValue(value);
  const tone = /ACTIVE|VERIFIED|PAID|COMPLETE|PUBLISHED/i.test(label) ? "success" :
    /SUSPEND|ERROR|FAIL|CANCEL|EXPIRE|DEAD/i.test(label) ? "danger" : "neutral";
  return <span className={"platform-badge " + tone}>{label}</span>;
}
function Panel({ title, subtitle, children, action }: {
  title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return <section className="platform-panel"><header className="platform-panel-head">
    <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}
  </header>{children}</section>;
}
function Unavailable({ title, reason }: { title: string; reason: string }) {
  return <Panel title={title}><div className="platform-state">
    <CircleAlert size={24}/><h3>Not connected to an authoritative service</h3><p>{reason}</p>
    <p>No example records, transactions, or system-health statuses are shown here.</p>
  </div></Panel>;
}
function FactCards({ facts }: { facts: Array<{ label: string; value: string; context?: string }> }) {
  return <div className="platform-facts">{facts.map(f => <div className="platform-fact" key={f.label}>
    <span>{f.label}</span><strong>{f.value}</strong>{f.context && <small>{f.context}</small>}
  </div>)}</div>;
}
function Feed({ data, empty }: { data: any; empty?: string }) {
  const rows = platformRows(data);
  if (!rows.length && data && typeof data === "object" && !Array.isArray(data)) {
    const pairs = flattenMetrics(data);
    if (pairs.length) return <dl className="platform-kv">{pairs.map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>;
  }
  return <Table rows={rows} empty={empty} columns={[
    { label: "Reference", value: r => displayValue(r.name || r.key || r.id || r.period || r.tenantName) },
    { label: "Details", value: r => displayValue(r.description || r.status || r.amount || r.value || r.count) },
    { label: "State", value: r => r.status ? <Badge value={r.status}/> : "—" },
  ]}/>;
}

export function PlatformOwnerWorkspace({ context, portal, section, onSection, onSwitch, onSignOut, team, support }: Props) {
  const [dataset, setDataset] = useState<PlatformDataset>({ values: {}, errors: {} });
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState("");
  const [query, setQuery] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [tenantDetail, setTenantDetail] = useState<any>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [planFeatures, setPlanFeatures] = useState<any>(null);
  const [planFeaturesError, setPlanFeaturesError] = useState("");
  const [newPlan, setNewPlan] = useState(false);

  const allowed = useMemo(() => new Set(portal.sections.map(s => s.id)), [portal.sections]);
  const activeTab = tab || tabs[section]?.[0]?.id || "";
  useEffect(() => { setTab(""); setQuery(""); setTenantDetail(null); setFailure(""); setMessage(""); }, [section]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setDataset({ values: {}, errors: {} });
    void loadPlatformPanel(section, portal).then(data => { if (live) setDataset(data); })
      .catch(error => { if (live) setFailure(error.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [section, portal.id, portal.permissions.join("|"), revision]);

  useEffect(() => {
    let live = true;
    setPlanFeatures(null);setPlanFeaturesError("");
    if (section === "platformEntitlements" && selectedPlan && activeTab === "plan" &&
      platformCan(portal, "platform.plan.read")) {
      void platformRequest("/platform/plans/" + encodeURIComponent(selectedPlan) + "/features")
        .then(data => { if (live) setPlanFeatures(data); })
        .catch(e => { if (live) setPlanFeaturesError(e.message); });
    }
    return () => { live = false; };
  }, [section, selectedPlan, activeTab, revision]);

  async function selectTenant(row: any) {
    if (!platformCan(portal, "platform.tenant.read")) return;
    setTenantDetail(null); setDetailError(""); setDetailLoading(true);
    try { setTenantDetail(await platformRequest("/platform/tenants/" + encodeURIComponent(row.id))); }
    catch (error: any) { setDetailError(error.message); }
    finally { setDetailLoading(false); }
  }

  async function write(path: string, body: unknown, permission: string, method: "POST" | "PUT" = "POST") {
    if (!platformCan(portal, permission)) throw new Error("Your platform role does not allow this operation.");
    const result = await platformRequest(path, method, body);
    setRevision(v => v + 1);
    return result;
  }

  async function execute(work: () => Promise<void>, success: string) {
    setBusy(true); setFailure(""); setMessage("");
    try { await work(); setMessage(success); }
    catch (error: any) { setFailure(error.message || "The change was not saved."); }
    finally { setBusy(false); }
  }

  async function confirmAction() {
    if (!action) return;
    const requiresReason = !["archivePlan", "retryDeadLetter"].includes(action.kind);
    if (requiresReason && reason.trim().length < 8) return;
    if (action.kind === "offboardTenant" && confirmation !== action.name) return;
    const request = action;
    const command = {
      suspendTenant: { url: "/platform/tenants/" + encodeURIComponent(request.id) + "/suspend", body: { reason: reason.trim() } },
      reactivateTenant: { url: "/platform/tenants/" + encodeURIComponent(request.id) + "/reactivate", body: { reason: reason.trim() } },
      offboardTenant: { url: "/platform/tenants/" + encodeURIComponent(request.id) + "/offboard", body: { reason: reason.trim() } },
      suspendSubscription: { url: "/platform/subscriptions/" + encodeURIComponent(request.id) + "/suspend", body: { reason: reason.trim(), expectedVersion: request.version } },
      reactivateSubscription: { url: "/platform/subscriptions/" + encodeURIComponent(request.id) + "/reactivate", body: { reason: reason.trim(), expectedVersion: request.version } },
      archivePlan: { url: "/platform/plans/" + encodeURIComponent(request.id) + "/archive", body: {} },
      retryDeadLetter: { url: "/platform/operations/jobs/dlq/" + encodeURIComponent(request.id) + "/retry", body: {} },
    }[request.kind];
    await execute(async () => {
      await write(command.url, command.body, request.permission);
      setAction(null); setReason(""); setConfirmation(""); setTenantDetail(null);
    }, "The server accepted the action. Updated records have been requested.");
  }

  const v = dataset.values;
  const errors = Object.entries(dataset.errors).filter(([, value]) => Boolean(value));
  const tenants = platformRows(v.tenants);
  const subscriptions = platformRows(v.subscriptions);
  const plans = platformRows(v.plans);
  const invoices = platformRows(v.invoices);
  const payments = platformRows(v.payments);
  const features = platformRows(v.features);
  const deadLetters = platformRows(v.deadLetters);
  const audit = platformRows(v.audit);
  const matches = (items: any[]) => items.filter(item => JSON.stringify(item).toLowerCase().includes(query.toLowerCase()));
  const readOnly = (title: string, reason: string) => <Unavailable title={title} reason={reason}/>;
  const command = (kind: Action["kind"], id: string, name: string, permission: string, version?: number) => {
    if (platformCan(portal, permission)) {
      setAction({ kind, id, name, permission, version }); setReason(""); setConfirmation(""); setFailure("");
    }
  };

  function content(): React.ReactNode {
    if (section === "team") return team;
    if (section === "support") return support;
    if (loading) return <div className="platform-loading" role="status"><RefreshCw size={18}/> Reading authoritative platform records…</div>;

    if (section === "overview") {
      return <div className="platform-stack">
        <FactCards facts={[
          { label: "Companies registered", value: v.tenants ? String(tenants.length) : "Unavailable", context: "Live tenant registry" },
          { label: "Active companies", value: v.tenants ? String(tenants.filter(t => t.status === "ACTIVE").length) : "Unavailable" },
          { label: "Active subscriptions", value: v.subscriptions ? String(subscriptions.filter(s => (s.status || s.state) === "ACTIVE").length) : "Unavailable", context: "SaaS subscriptions only" },
          { label: "Analytics", value: v.analytics ? "Connected" : "Unavailable", context: "Canonical analytics service" },
        ]}/>
        {v.analytics && <Panel title="SaaS performance" subtitle="Reported by the platform analytics service. Rental-company turnover is separate."><Feed data={v.analytics} empty="No recorded SaaS metrics."/></Panel>}
        <Panel title="Workspace shortcuts" subtitle="Continue with the next operational task.">
          <div className="platform-shortcuts">{portal.sections.filter(s => ["companies", "plans", "platformBilling", "platformJobs", "platformAudit"].includes(s.id)).map(s =>
            <button key={s.id} onClick={() => onSection(s.id)}>{ICONS[s.id]}<span>{s.label}</span><ArrowRight size={16}/></button>
          )}</div>
        </Panel>
      </div>;
    }
    if (section === "companies") {
      return <div className="platform-stack">
        {activeTab === "list" && <>
          <Panel title="Company directory" subtitle="Real tenant records. Subscription amounts are not inferred from vehicle rentals."
            action={<input aria-label="Search companies" placeholder="Search companies…" value={query} onChange={e => setQuery(e.target.value)}/>}>
            <Table rows={matches(tenants)} onSelect={row => void selectTenant(row)} columns={[
              { label: "Company", value: row => <div><strong>{row.name}</strong><small>{row.slug}</small></div> },
              { label: "Status", value: row => <Badge value={row.status}/> },
              { label: "Plan", value: row => row.planName || "—" },
              { label: "Fleet", value: row => displayValue(row.fleetCount) },
              { label: "Subscriptions", value: row => <Badge value={row.subscriptionStatus}/> },
            ]}/>
          </Panel>
          {detailLoading && <div role="status" className="platform-loading">Loading company details…</div>}
          {detailError && <div role="alert" className="platform-error">{detailError}</div>}
          {tenantDetail && <Panel title={tenantDetail.tenant?.name || "Company details"} subtitle="Tenant-scoped operational summary, accessed using platform authorization.">
            <dl className="platform-kv">
              {Object.entries({
                "Company": tenantDetail.tenant?.name,
                "Country": tenantDetail.tenant?.country,
                "Currency": tenantDetail.tenant?.currency,
                "Plan": tenantDetail.plan?.name,
                "Subscription": tenantDetail.subscription?.status || tenantDetail.subscription?.state,
                "Total vehicles": tenantDetail.fleetSummary?.total,
                "Active bookings": tenantDetail.bookingsSummary?.active,
                "First owner invitation": tenantDetail.ownerInvitation?.status,
                "Invitation delivery": tenantDetail.ownerInvitation?.delivery,
              }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{displayValue(value)}</dd></div>)}
            </dl>
            <div className="platform-action-row">
              {tenantDetail.tenant?.status === "ACTIVE" &&
                <button onClick={() => command("suspendTenant", tenantDetail.tenant.id, tenantDetail.tenant.name, "platform.tenant.suspend")} className="platform-danger">Suspend company</button>}
              {tenantDetail.tenant?.status === "SUSPENDED" &&
                <button onClick={() => command("reactivateTenant", tenantDetail.tenant.id, tenantDetail.tenant.name, "platform.tenant.suspend")} className="platform-primary">Reactivate company</button>}
              {tenantDetail.tenant?.status !== "DECOMMISSIONED" &&
                <button onClick={() => command("offboardTenant", tenantDetail.tenant.id, tenantDetail.tenant.name, "platform.tenant.suspend")} className="platform-outline">Offboard company</button>}
              {platformCan(portal, "platform.tenant.provision") && tenantDetail.ownerInvitation?.status === "PENDING" && <button className="platform-outline" disabled={busy} onClick={() => void execute(async () => {
                await write("/platform/tenants/" + encodeURIComponent(tenantDetail.tenant.id) + "/owner-invitation/retry", {}, "platform.tenant.provision");
              }, "Initial company-owner invitation sent again. The invitation must still be accepted.")}>Retry first-owner invitation</button>}
            </div>
          </Panel>}
        </>}
        {activeTab === "provision" && <Panel title="Provision a rental company" subtitle="The backend provisions the company and subscription, then requests an invitation for the nominated first owner.">
          <div className="platform-warning"><CircleAlert size={18}/> The invitation does not automatically grant access. The nominated owner must verify their account and accept the invitation before the workspace is active for them.</div>
          {platformCan(portal, "platform.tenant.provision") ? <form className="platform-form" onSubmit={event => {
            event.preventDefault();
            const form = event.currentTarget; const formData = Object.fromEntries(new FormData(form));
            void execute(async () => {
              const result = await write("/platform/tenants/provision", { ...formData, name: String(formData.name).trim(), slug: String(formData.slug).trim().toLowerCase() }, "platform.tenant.provision");
              form.reset(); setTab("list");
              if(result.ownerInvitation?.status !== "SENT") {
                throw new Error("Company workspace was saved, but the owner invitation was not sent. Open the company details and retry delivery.");
              }
            }, "Company saved. Invitation sent to the nominated owner; activation requires that person to accept it.");
          }}>
            <label>Company name<input name="name" required minLength={2}/></label>
            <label>Workspace slug<input name="slug" required pattern="[a-z0-9-]+" title="Use lowercase letters, numbers and hyphens."/></label>
            <label>Owner name<input name="ownerName" required/></label>
            <label>Owner email<input name="ownerEmail" type="email" required/></label>
            <label>Country code<input name="country" defaultValue="KE" required maxLength={2}/></label>
            <label>Billing currency<input name="currency" defaultValue="KES" required minLength={3} maxLength={3}/></label>
            <label>Plan<select name="planId"><option value="">Use backend starter plan</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <button className="platform-primary" disabled={busy}>Provision saved workspace</button>
          </form> : <p>You do not have permission to provision companies.</p>}
        </Panel>}
      </div>;
    }
    if (section === "plans") {
      return <div className="platform-stack">
        {activeTab === "subscriptions" && <Panel title="Subscriptions" subtitle="The canonical subscription state machine owns transitions.">
          <Table rows={matches(subscriptions)} columns={[
            { label: "Company", value: s => tenants.find(t => t.id === s.tenantId)?.name || s.tenantId },
            { label: "State", value: s => <Badge value={s.status || s.state}/> },
            { label: "Plan", value: s => plans.find(p => p.id === s.planId)?.name || s.planId },
            { label: "Charge", value: s => displayMoney(s.amount, s.currency) },
            { label: "Period end", value: s => s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : "—" },
            { label: "Action", value: s => platformCan(portal, "platform.subscription.update") && (s.status || s.state) === "ACTIVE" ?
              <button className="platform-inline" onClick={() => command("suspendSubscription", s.id, s.id, "platform.subscription.update", s.version)}>Suspend</button> :
              platformCan(portal, "platform.subscription.update") && (s.status || s.state) === "SUSPENDED" ?
              <button className="platform-inline" onClick={() => command("reactivateSubscription", s.id, s.id, "platform.subscription.update", s.version)}>Reactivate</button> : "—" },
          ]}/>
        </Panel>}
        {activeTab === "catalog" && <Panel title="Subscription plans" action={platformCan(portal, "platform.plan.create") ?
          <button className="platform-primary" onClick={() => setNewPlan(p => !p)}><Plus size={16}/> {newPlan ? "Close form" : "Add plan"}</button> : null}>
          {newPlan && <form className="platform-form" onSubmit={event => {
            event.preventDefault(); const form = event.currentTarget;
            const data = Object.fromEntries(new FormData(form));
            void execute(async () => {
              await write("/platform/plans", { code: String(data.code).toUpperCase(), name: data.name, currency: String(data.currency).toUpperCase(),
                price: Number(data.price), billingInterval: data.billingInterval,
                maxVehicles: Number(data.maxVehicles), maxMembers: Number(data.maxMembers) }, "platform.plan.create");
              form.reset(); setNewPlan(false);
            }, "Plan saved by the platform subscription service.");
          }}>
            <label>Plan code<input name="code" required pattern="[A-Za-z0-9_-]+"/></label>
            <label>Name<input name="name" required/></label>
            <label>Currency<input name="currency" defaultValue="KES" required minLength={3} maxLength={3}/></label>
            <label>Price<input name="price" type="number" required min="0" step="0.01"/></label>
            <label>Billing interval<select name="billingInterval"><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option></select></label>
            <label>Vehicle limit<input name="maxVehicles" type="number" min="0" required defaultValue={10}/></label>
            <label>Team limit<input name="maxMembers" type="number" min="0" required defaultValue={5}/></label>
            <button className="platform-primary" disabled={busy}>Create plan</button>
          </form>}
          <Table rows={plans} columns={[
            { label: "Plan", value: p => <div><strong>{p.name}</strong><small>{p.code}</small></div> },
            { label: "Price", value: p => displayMoney(p.price ?? p.monthlyPrice, p.currency) },
            { label: "Vehicles", value: p => displayValue(p.maxVehicles) },
            { label: "Members", value: p => displayValue(p.maxMembers) },
            { label: "Status", value: p => <Badge value={p.status || (p.isPublic ? "Published" : "Private")}/> },
            { label: "Action", value: p => platformCan(portal, "platform.plan.archive") ?
              <button className="platform-inline" onClick={() => command("archivePlan", p.id, p.name, "platform.plan.archive")}>Archive</button> : "—" },
          ]}/>
        </Panel>}
      </div>;
    }
    if (section === "platformBilling") {
      return <Panel title={activeTab === "invoices" ? "SaaS subscription invoices" : "Recorded SaaS receipts"}
        subtitle="These financial records exclude tenant rental charges, security deposits and vehicle-owner payouts.">
        {activeTab === "invoices" ?
          <Table rows={invoices} columns={[
            { label: "Invoice", value: r => r.invoiceNumber || r.id },
            { label: "Company", value: r => r.tenantId },
            { label: "Total", value: r => displayMoney(r.total, r.currency) },
            { label: "Balance", value: r => displayMoney(r.amountDue, r.currency) },
            { label: "Status", value: r => <Badge value={r.status}/> },
            { label: "Due", value: r => r.dueAt ? new Date(r.dueAt).toLocaleDateString() : "—" },
          ]}/> :
          <Table rows={payments} columns={[
            { label: "Reference", value: r => r.providerReference || r.id },
            { label: "Invoice", value: r => r.invoiceId || "—" },
            { label: "Amount", value: r => displayMoney(r.amount, r.currency) },
            { label: "Provider", value: r => r.provider || "—" },
            { label: "Status", value: r => <Badge value={r.status || "Recorded"}/> },
          ]}/>}
        <p className="platform-fine-print">Payment recording is intentionally not available in this workspace until receipt verification and four-eyes controls are certified. No button can mark an invoice paid by itself.</p>
      </Panel>;
    }
    if (section === "platformAnalytics") {
      const entry: any = { overview: v.analytics, movements: v.movements, cohorts: v.cohorts, billing: v.billingHealth }[activeTab];
      return <Panel title={{ overview: "SaaS executive metrics", movements: "MRR changes", cohorts: "Cohort retention", billing: "SaaS collection health" }[activeTab] || "Platform analytics"}
        subtitle="Values are read from the server's platform analytics service; currencies are not mixed.">
        <Feed data={entry} empty="No canonical records for this report."/>
      </Panel>;
    }
    if (section === "platformEntitlements") {
      return <div className="platform-stack">
        {activeTab === "features" && <Panel title="Feature registry" subtitle="Read-only view of registered SaaS capabilities.">
          <Table rows={features} columns={[
            { label: "Feature", value: f => <div><strong>{f.name}</strong><small>{f.key}</small></div> },
            { label: "Category", value: f => displayValue(f.category) },
            { label: "Type", value: f => displayValue(f.type) },
            { label: "State", value: f => <Badge value={f.status}/> },
          ]}/>
        </Panel>}
        {activeTab === "plan" && <Panel title="Plan entitlements" subtitle="Effective feature grants reported by the backend; no local overrides.">
          <label className="platform-small-label">Select plan<select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)}>
            <option value="">Choose a plan</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
          {planFeaturesError && <div role="alert" className="platform-error">{planFeaturesError}</div>}
          {selectedPlan && !planFeatures && !planFeaturesError && <div role="status">Loading plan grants…</div>}
          {planFeatures && <Feed data={planFeatures} empty="No grants configured for this plan."/>}
        </Panel>}
      </div>;
    }
    if (section === "platformJobs") {
      return <Panel title={activeTab === "queues" ? "Transactional outbox" : "Dead-letter investigation"}
        subtitle="Only the transactional-outbox counters are confirmed to come from the repository. Billing and notification queue samples are excluded.">
        {activeTab === "queues" ? <>
          <FactCards facts={[
            { label: "Pending", value: v.queues?.aggregated ? displayValue(v.queues.aggregated.pending) : "Unavailable" },
            { label: "Published", value: v.queues?.aggregated ? displayValue(v.queues.aggregated.published) : "Unavailable" },
            { label: "Failed", value: v.queues?.aggregated ? displayValue(v.queues.aggregated.failed) : "Unavailable" },
            { label: "Dead-letter", value: v.queues?.aggregated ? displayValue(v.queues.aggregated.deadLetter) : "Unavailable" },
          ]}/>
          <p className="platform-fine-print">This is outbox-repository telemetry, not a live BullMQ health certification.</p>
        </> :
          <Table rows={deadLetters} columns={[
            { label: "Event", value: r => r.eventType || r.id },
            { label: "State", value: r => <Badge value={r.status}/> },
            { label: "Occurred", value: r => displayValue(r.occurredAt) },
            { label: "Action", value: r => platformCan(portal, "platform.job.retry") ?
              <button className="platform-inline" onClick={() => command("retryDeadLetter", r.id, r.eventType || r.id, "platform.job.retry")}>Retry</button> : "—" },
          ]}/>}
      </Panel>;
    }
    if (section === "platformAudit") {
      return <Panel title="Platform security and activity history" subtitle="Backend audit entries, not an inferred activity feed.">
        <Table rows={audit} columns={[
          { label: "Time", value: r => r.createdAt || r.occurredAt || "—" },
          { label: "Action", value: r => r.action || "—" },
          { label: "Actor", value: r => r.actorId || "—" },
          { label: "Resource", value: r => [r.resourceType, r.resourceId].filter(Boolean).join(" · ") || "—" },
        ]}/>
      </Panel>;
    }
    if (section === "platformSettings") {
      return <Panel title="Global configuration" subtitle="Current server-process configuration only. Persistence after restart is not yet guaranteed.">
        {v.config ? <dl className="platform-kv">{Object.entries(v.config).filter(([key]) => !/secret|token|key|password|passkey/i.test(key)).map(([key, value]) =>
          <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{displayValue(value)}</dd></div>
        )}</dl> : <p>No configuration returned by the service.</p>}
        <p className="platform-fine-print">Editing is disabled until configuration persistence, schema validation, rollback and audit verification are complete.</p>
      </Panel>;
    }
    if (section === "platformIntegrations") return readOnly("Integrations and custom domains", "The existing operations endpoint returns illustrative provider and SSL statuses. Authoritative provider probes and persisted domain verification must be connected before operational health can be displayed.");
    if (section === "platformIncidents") return readOnly("Incident command center", "A governed incident registration, escalation and resolution service has not been verified. Queue errors must not be represented as formal incidents.");
    if (section === "platformNotifications") return readOnly("Platform notifications", "No certified platform-scoped notification-feed contract is available. Tenant notifications are not interchangeable with platform alerts.");
    if (section === "platformCompliance") return readOnly("Platform policies and compliance", "A secured platform policy register, evidence lifecycle and authorization contract still need backend verification.");
    return <Unavailable title="Unavailable workspace" reason="This role does not have a connected platform screen for the requested section."/>;
  }

  const currentTitle = portal.sections.find(s => s.id === section)?.label || "Platform control center";
  return <div className="platform-portal">
    <button className="platform-mobile-toggle" onClick={() => setMobileMenu(v => !v)} aria-label="Toggle platform navigation"><Menu size={20}/> Navigation</button>
    <aside className={"platform-sidebar " + (mobileMenu ? "open" : "")}>
      <div className="platform-brand"><span className="platform-brand-mark">S</span><div><strong>Sage Auto</strong><small>SaaS Control Center</small></div></div>
      <nav aria-label="Platform navigation">{GROUPS.map(group => {
        const items = group.items.filter(item => allowed.has(item));
        if (!items.length) return null;
        return <section key={group.title}><p>{group.title}</p>{items.map(item =>
          <button key={item} aria-current={section === item ? "page" : undefined} onClick={() => { onSection(item); setMobileMenu(false); }}>
            {ICONS[item]}<span>{portal.sections.find(s => s.id === item)?.label || item}</span>
          </button>
        )}</section>;
      })}</nav>
      <button className="platform-switch" onClick={onSwitch}><ArrowLeft size={17}/> Switch workspace</button>
    </aside>
    <main className="platform-main">
      <header className="platform-toolbar"><div><span className="platform-overline">SAGE AUTO / CONTROL PLANE</span><h1>{currentTitle}</h1><p>Platform operations · {context.user.fullName}</p></div>
        <div className="platform-toolbar-actions"><span className="platform-role"><ShieldCheck size={15}/>{portal.roles.join(", ")}</span>
          <button aria-label="Refresh platform records" onClick={() => setRevision(r => r + 1)}><RefreshCw size={17}/></button>
          <button onClick={onSignOut} className="platform-signout">Sign out <ArrowRight size={15}/></button>
        </div>
      </header>
      <div className="platform-content">
        {tabs[section] && <div role="tablist" aria-label={currentTitle + " views"} className="platform-tabs">
          {tabs[section].map(item => <button key={item.id} role="tab" aria-selected={activeTab === item.id}
            onClick={() => setTab(item.id)}>{item.label}</button>)}
        </div>}
        {failure && <div role="alert" className="platform-error">{failure}</div>}
        {message && <div role="status" className="platform-success"><CheckCircle2 size={17}/>{message}</div>}
        {errors.map(([key, value]) => <div role="alert" className="platform-error" key={key}>{key}: {value}</div>)}
        {content()}
      </div>
    </main>
    {action && <div className="platform-modal-backdrop" role="presentation" onClick={() => { if (!busy) setAction(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="platform-dialog-title" className="platform-modal" onClick={event => event.stopPropagation()}>
        <header><h2 id="platform-dialog-title">Confirm {action.kind.replace(/([A-Z])/g, " $1").toLowerCase()}</h2><button aria-label="Close dialog" disabled={busy} onClick={() => setAction(null)}><X size={20}/></button></header>
        <p>Target: <strong>{action.name}</strong>. The action will be checked by the server against your authenticated platform role. Only supported audit fields are recorded.</p>
        {action.kind === "offboardTenant" && <div className="platform-warning">Offboarding can decommission a company workspace. Confirm the commercial and data-retention implications first.</div>}
        {!["archivePlan", "retryDeadLetter"].includes(action.kind) && <label>Business reason (minimum 8 characters)<textarea value={reason} minLength={8} required onChange={event => setReason(event.target.value)} placeholder="Explain why this action is necessary…"/></label>}
        {action.kind === "offboardTenant" && <label>Type the company's full name to confirm<input value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder={action.name}/></label>}
        <div className="platform-action-row"><button disabled={busy} className="platform-outline" onClick={() => setAction(null)}>Cancel</button>
          <button disabled={busy || (!["archivePlan", "retryDeadLetter"].includes(action.kind) && reason.trim().length < 8) || (action.kind === "offboardTenant" && confirmation !== action.name)} className="platform-primary" onClick={() => void confirmAction()}>{busy ? "Submitting…" : "Submit audited command"}</button>
        </div>
      </section>
    </div>}
  </div>;
}
