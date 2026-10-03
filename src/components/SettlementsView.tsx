import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  FileSpreadsheet,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { apiClient } from "../lib/api-client";
import { useApp } from "../lib/store";
import type {
  OwnerSettlement,
  OwnerSettlementPeriod,
  OwnerSettlementBatch,
  OwnerSettlementPayable,
  OwnerSettlementStatementReadModel,
  VehicleProfitabilityReportReadModel,
} from "../types";

type Tab = "SETTLEMENTS" | "PERIODS" | "PAYABLES" | "PROFITABILITY";
type ActionMode =
  | "CALCULATE"
  | "CREATE_PERIOD"
  | "DISPUTE"
  | "RESOLVE_DISPUTE"
  | "ADJUST"
  | "PAYOUT"
  | null;

const n = (value: string | number | undefined) => Number(value || 0);
const label = (value?: string) => (value || "—").replace(/_/g, " ");

const statusClass = (status?: string) => {
  if (status === "PAID" || status === "COMPLETED" || status === "CLOSED")
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";
  if (status === "DISPUTED" || status === "FAILED")
    return "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300";
  if (status === "APPROVED" || status === "PAYMENT_PENDING" || status === "PROCESSING")
    return "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300";
  if (status === "CALCULATED" || status === "SETTLING" || status === "PENDING")
    return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
};

const currentMonth = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const localDate = (d: Date) =>
    [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  return { start: localDate(start), end: localDate(end) };
};

export const SettlementsView: React.FC = () => {
  const {
    activeTenant,
    activeTenantId,
    vehicleOwners,
    selectedOwnerId,
    setSelectedOwnerId,
    restoration,
    hasPermission,
    showNotification,
  } = useApp();

  const selfMode = !hasPermission("settlement.read") && hasPermission("settlement.self.read");
  const [activeTab, setActiveTab] = useState<Tab>("SETTLEMENTS");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [settlements, setSettlements] = useState<OwnerSettlement[]>([]);
  const [periods, setPeriods] = useState<OwnerSettlementPeriod[]>([]);
  const [batches, setBatches] = useState<OwnerSettlementBatch[]>([]);
  const [payables, setPayables] = useState<OwnerSettlementPayable[]>([]);
  const [profitability, setProfitability] = useState<VehicleProfitabilityReportReadModel | null>(null);

  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null);
  const [statement, setStatement] = useState<OwnerSettlementStatementReadModel | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);

  const month = useMemo(() => currentMonth(), []);
  const [calcOwnerId, setCalcOwnerId] = useState("");
  const [calcPeriodId, setCalcPeriodId] = useState("");
  const [calcStart, setCalcStart] = useState(month.start);
  const [calcEnd, setCalcEnd] = useState(month.end);

  const [periodType, setPeriodType] = useState("MONTHLY");
  const [periodStart, setPeriodStart] = useState(month.start);
  const [periodEnd, setPeriodEnd] = useState(month.end);
  const [periodDescription, setPeriodDescription] = useState("");

  const [disputeReason, setDisputeReason] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [adjustmentType, setAdjustmentType] = useState("DEBIT_ADJUSTMENT");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");

  const [payoutProvider, setPayoutProvider] = useState("MPESA_DARAJA");

  const selectedSettlement = settlements.find((item) => item.id === selectedSettlementId) || null;
  const selectedPayable =
    payables.find((item) => item.settlementId === selectedSettlementId && item.status !== "CANCELLED") || null;

  const money = (value: string | number | undefined, currency = activeTenant.currency || "KES") =>
    `${currency} ${n(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      if (selfMode) {
        const mine = await apiClient.ownerSettlements.listMine();
        if (mine.error) throw new Error(mine.error.message);
        setSettlements(Array.isArray(mine.data) ? mine.data : []);
        setPeriods([]);
        setBatches([]);
        setPayables([]);
        setProfitability(null);
        return;
      }

      const jobs = await Promise.all([
        hasPermission("settlement.read") ? apiClient.ownerSettlements.listSettlements() : Promise.resolve({}),
        hasPermission("settlement.read") ? apiClient.ownerSettlements.listPeriods() : Promise.resolve({}),
        hasPermission("settlement.read") ? apiClient.ownerSettlements.listBatches() : Promise.resolve({}),
        hasPermission("settlement.read") ? apiClient.ownerSettlements.listPayables() : Promise.resolve({}),
        hasPermission("settlement.read")
          ? apiClient.ownerSettlements.getProfitability({ startDate: month.start, endDate: month.end })
          : Promise.resolve({}),
      ]);

      const [settlementRes, periodRes, batchRes, payableRes, profitabilityRes] = jobs;
      if (!settlementRes.error && Array.isArray(settlementRes.data)) setSettlements(settlementRes.data);
      if (!periodRes.error && Array.isArray(periodRes.data)) setPeriods(periodRes.data);
      if (!batchRes.error && Array.isArray(batchRes.data)) setBatches(batchRes.data);
      if (!payableRes.error && Array.isArray(payableRes.data)) setPayables(payableRes.data);
      if (!profitabilityRes.error && profitabilityRes.data) setProfitability(profitabilityRes.data);
    } catch (error: any) {
      showNotification(error.message || "Unable to load owner settlements.", "error");
    } finally {
      setLoading(false);
    }
  }, [hasPermission, month.end, month.start, selfMode, showNotification]);

  useEffect(() => {
    void loadAll();
  }, [activeTenantId, loadAll]);

  useEffect(() => {
    if (selectedOwnerId && hasPermission("settlement.calculate")) {
      setCalcOwnerId(selectedOwnerId);
      setActionMode("CALCULATE");
      setSelectedOwnerId(null);
    }
  }, [hasPermission, selectedOwnerId, setSelectedOwnerId]);

  useEffect(() => {
    if (!selectedSettlementId) {
      setStatement(null);
      return;
    }
    const canStatement = selfMode
      ? hasPermission("settlement.self.read")
      : hasPermission("settlement.statement.export");
    if (!canStatement) return;
    const request = selfMode
      ? apiClient.ownerSettlements.getMyStatement(selectedSettlementId)
      : apiClient.ownerSettlements.getStatement(selectedSettlementId);
    void request.then((response) => {
      if (!response.error && response.data) setStatement(response.data as OwnerSettlementStatementReadModel);
    });
  }, [hasPermission, selectedSettlementId, selfMode]);

  const metrics = useMemo(() => {
    const pendingApproval = settlements.filter((s) => s.status === "CALCULATED").length;
    const disputed = settlements.filter((s) => s.status === "DISPUTED").length;
    const approved = settlements.filter((s) => s.status === "APPROVED" || s.status === "PAYMENT_PENDING").length;
    const paid = settlements
      .filter((s) => s.status === "PAID")
      .reduce((sum, s) => sum + n(s.netPayoutAmount), 0);
    const currentPayable = settlements
      .filter((s) => ["APPROVED", "PAYMENT_PENDING"].includes(s.status))
      .reduce((sum, s) => sum + n(s.netPayoutAmount), 0);
    return { pendingApproval, disputed, approved, paid, currentPayable };
  }, [settlements]);

  const refreshSettlement = async (id: string) => {
    const response = await apiClient.ownerSettlements.getSettlement(id);
    if (!response.error && response.data) {
      const settlement = response.data as OwnerSettlement;
      setSettlements((prev) => [settlement, ...prev.filter((item) => item.id !== settlement.id)]);
      return settlement;
    }
    return null;
  };

  const handleCalculate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!calcOwnerId) return;
    setSubmitting(true);
    try {
      const selectedPeriod = periods.find((period) => period.id === calcPeriodId);
      const response = await apiClient.ownerSettlements.calculateSettlement({
        ownerId: calcOwnerId,
        periodId: calcPeriodId || undefined,
        startDate: selectedPeriod?.startDate || calcStart,
        endDate: selectedPeriod?.endDate || calcEnd,
      });
      if (response.error || !response.data) throw new Error(response.error?.message || "Settlement calculation failed.");
      const settlement = response.data as OwnerSettlement;
      setSettlements((prev) => [settlement, ...prev.filter((item) => item.id !== settlement.id)]);
      setSelectedSettlementId(settlement.id);
      setActionMode(null);
      showNotification(`Settlement ${settlement.settlementNumber} calculated from settled Finance facts and historical ownership terms.`);
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to calculate owner settlement.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (settlement: OwnerSettlement) => {
    setSubmitting(true);
    try {
      const response = await apiClient.ownerSettlements.approveSettlement(settlement.id, {
        notes: "Approved after source-line and historical-terms review",
      });
      if (response.error) throw new Error(response.error.message);
      showNotification("Settlement approved. A payable obligation has been created for independent payout execution.");
      await loadAll();
      await refreshSettlement(settlement.id);
    } catch (error: any) {
      showNotification(error.message || "Unable to approve settlement.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDispute = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSettlement) return;
    setSubmitting(true);
    try {
      const response = selfMode
        ? await apiClient.ownerSettlements.disputeMine(selectedSettlement.id, disputeReason.trim())
        : await apiClient.ownerSettlements.disputeSettlement(selectedSettlement.id, disputeReason.trim());
      if (response.error) throw new Error(response.error.message);
      showNotification("Settlement moved into DISPUTED state. Payout is blocked until resolution and independent re-approval.");
      setActionMode(null);
      setDisputeReason("");
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to dispute settlement.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveDispute = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSettlement) return;
    setSubmitting(true);
    try {
      const adjustments =
        adjustmentAmount && adjustmentReason
          ? [{ type: adjustmentType, amount: adjustmentAmount, reason: adjustmentReason }]
          : undefined;
      const response = await apiClient.ownerSettlements.resolveDispute(selectedSettlement.id, {
        resolutionNotes: resolutionNotes.trim(),
        adjustments,
      });
      if (response.error) throw new Error(response.error.message);
      showNotification("Dispute resolved. Settlement returned to CALCULATED and requires independent approval.");
      setActionMode(null);
      setResolutionNotes("");
      setAdjustmentAmount("");
      setAdjustmentReason("");
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to resolve dispute.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjustment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedSettlement) return;
    setSubmitting(true);
    try {
      const response = await apiClient.ownerSettlements.addAdjustment(selectedSettlement.id, {
        type: adjustmentType,
        amount: adjustmentAmount,
        reason: adjustmentReason.trim(),
      });
      if (response.error) throw new Error(response.error.message);
      showNotification("Governed settlement adjustment recorded and calculation refreshed.");
      setActionMode(null);
      setAdjustmentAmount("");
      setAdjustmentReason("");
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to add adjustment.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePeriod = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await apiClient.ownerSettlements.createPeriod({
        periodType,
        startDate: periodStart,
        endDate: periodEnd,
        description: periodDescription.trim() || undefined,
      });
      if (response.error) throw new Error(response.error.message);
      showNotification("Settlement period created.");
      setActionMode(null);
      setPeriodDescription("");
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to create settlement period.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClosePeriod = async (period: OwnerSettlementPeriod) => {
    setSubmitting(true);
    try {
      const response = await apiClient.ownerSettlements.closePeriod(period.id);
      if (response.error) throw new Error(response.error.message);
      showNotification(`Settlement period ${period.periodNumber} closed.`);
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to close period.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateBatch = async (period: OwnerSettlementPeriod) => {
    setSubmitting(true);
    try {
      const response = await apiClient.ownerSettlements.generateBatch({
        periodId: period.id,
        idempotencyKey: `settlement-batch:${activeTenantId}:${period.id}`,
      });
      if (response.error) throw new Error(response.error.message);
      showNotification(`Settlement batch generated for ${period.periodNumber}. Owners without authoritative settled revenue were skipped safely.`);
      await loadAll();
      setActiveTab("SETTLEMENTS");
    } catch (error: any) {
      showNotification(error.message || "Unable to generate settlement batch.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePayout = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPayable) return;
    setSubmitting(true);
    try {
      const response = await apiClient.payments.executeOwnerPayout({
        settlementPayableId: selectedPayable.id,
        provider: payoutProvider,
        idempotencyKey: `owner-payout:${selectedPayable.id}`,
        notes: `Owner settlement payout ${selectedPayable.payableNumber}`,
      });
      if (response.error) throw new Error(response.error.message);
      showNotification("Provider payout completed and the settlement has been sealed PAID.");
      setActionMode(null);
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to execute owner payout.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: Array<[Tab, string]> = selfMode
    ? [["SETTLEMENTS", "My settlements"]]
    : [
        ["SETTLEMENTS", "Settlements"],
        ["PERIODS", "Periods & batches"],
        ["PAYABLES", "Payout queue"],
        ["PROFITABILITY", "Vehicle profitability"],
      ];

  return (
    <div id="settlements-view" className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-950 dark:text-white">
              {selfMode ? "My Owner Settlements" : "Owner Settlements"}
            </h1>
            <p className="mt-0.5 max-w-3xl text-xs text-slate-500 dark:text-slate-400">
              {selfMode
                ? "Your resource-scoped revenue statements, deductions, payout status and dispute history."
                : "Historical ownership terms + settled Finance revenue + approved expenses → governed owner payable → independent provider payout."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!selfMode && hasPermission("settlement.calculate") && (
            <button
              disabled={restoration}
              onClick={() => {
                setCalcOwnerId("");
                setActionMode("CALCULATE");
              }}
              className="rounded-xl bg-indigo-700 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-800 disabled:opacity-50"
            >
              Calculate settlement
            </button>
          )}
          <button
            onClick={() => void loadAll()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Awaiting approval", metrics.pendingApproval, History],
          ["Disputed", metrics.disputed, AlertTriangle],
          ["Ready / processing", metrics.approved, WalletCards],
          ["Payable now", money(metrics.currentPayable), CircleDollarSign],
          ["Paid", money(metrics.paid), CheckCircle2],
        ].map(([title, value, Icon]: any) => (
          <div key={title} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</span>
              <Icon className="h-4 w-4 text-slate-400" />
            </div>
            <div className="text-xl font-bold text-slate-950 dark:text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        {tabs.map(([id, text]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              activeTab === id
                ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      {loading && settlements.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
        </div>
      ) : activeTab === "SETTLEMENTS" ? (
        <div className="space-y-3">
          {settlements.length === 0 ? (
            <EmptyState text={selfMode ? "No settlement statements are available for your linked owner record." : "No owner settlements calculated yet."} />
          ) : (
            settlements.map((settlement) => (
              <button
                key={settlement.id}
                onClick={() => setSelectedSettlementId(settlement.id)}
                className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-indigo-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-800 sm:p-5"
              >
                <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-slate-950 dark:text-white">{settlement.settlementNumber}</span>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass(settlement.status)}`}>
                        {label(settlement.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {settlement.ownerName || vehicleOwners.find((owner) => owner.id === settlement.ownerId)?.name || settlement.ownerId}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">{settlement.periodStart} → {settlement.periodEnd}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/60">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Settled eligible revenue</p>
                    <p className="mt-1 font-bold text-slate-900 dark:text-white">{money(settlement.totalEligibleRentalRevenue, settlement.currency)}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{settlement.rentalLines?.length || 0} Finance-backed rental lines</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/60">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Net owner payout</p>
                    <p className="mt-1 font-bold text-indigo-700 dark:text-indigo-300">{money(settlement.netPayoutAmount, settlement.currency)}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      Deductions {money(settlement.totalDeductions, settlement.currency)}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                    Open statement <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      ) : activeTab === "PERIODS" ? (
        <div className="space-y-4">
          {hasPermission("settlement.period.manage") && (
            <button onClick={() => setActionMode("CREATE_PERIOD")} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white dark:bg-white dark:text-slate-950">
              Create settlement period
            </button>
          )}
          {periods.length === 0 ? <EmptyState text="No settlement periods configured." /> : periods.map((period) => {
            const periodBatches = batches.filter((batch) => batch.periodId === period.id);
            return (
              <div key={period.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold">{period.periodNumber}</span>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass(period.status)}`}>{label(period.status)}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{period.startDate} → {period.endDate} · {label(period.periodType)}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{period.settlementCount} settlements · {periodBatches.length} batches</p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="text-slate-400">Owner payout</p>
                    <strong>{money(period.totalOwnerPayout)}</strong>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {period.status !== "CLOSED" && hasPermission("settlement.batch.generate") && (
                      <button disabled={submitting} onClick={() => void handleGenerateBatch(period)} className="rounded-lg bg-indigo-700 px-3 py-2 text-[11px] font-bold text-white">Generate batch</button>
                    )}
                    {period.status !== "CLOSED" && hasPermission("settlement.period.manage") && (
                      <button disabled={submitting} onClick={() => void handleClosePeriod(period)} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold dark:border-slate-700">Close period</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : activeTab === "PAYABLES" ? (
        <div className="space-y-3">
          {payables.length === 0 ? <EmptyState text="No approved owner payout obligations." /> : payables.map((payable) => (
            <div key={payable.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_auto] md:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold">{payable.payableNumber}</span>
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass(payable.status)}`}>{label(payable.status)}</span>
                  </div>
                  <p className="mt-2 text-xs font-semibold">{payable.recipientName}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {label(payable.payoutMethod)} · {payable.destinationMpesaNumber || payable.destinationAccount || "No payout destination"}
                  </p>
                </div>
                <div className="text-xs">
                  <p className="text-slate-400">Net disbursement</p>
                  <p className="mt-1 text-lg font-bold">{money(payable.netDisbursementAmount, payable.currency)}</p>
                </div>
                {payable.status === "PENDING" && hasPermission("settlement.pay") && (
                  <button
                    disabled={submitting || (!payable.destinationMpesaNumber && payable.payoutMethod !== "MPESA_B2C")}
                    onClick={() => {
                      setSelectedSettlementId(payable.settlementId);
                      setPayoutProvider(payable.payoutMethod.includes("MPESA") ? "MPESA_DARAJA" : "STRIPE_CARD");
                      setActionMode("PAYOUT");
                    }}
                    className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    Execute provider payout
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {!profitability ? <EmptyState text="No profitability projection for this period." /> : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard title="Gross rental revenue" value={money(profitability.summary.totalGrossRentalRevenue, profitability.currency)} />
                <MetricCard title="Owner payouts" value={money(profitability.summary.totalOwnerPayouts, profitability.currency)} />
                <MetricCard title="Net operator profit" value={money(profitability.summary.totalNetProfit, profitability.currency)} />
              </div>
              <div className="space-y-2">
                {profitability.items.map((item) => (
                  <div key={item.vehicleId} className="rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-slate-900">
                    <div className="grid gap-3 md:grid-cols-[1fr_repeat(3,auto)] md:items-center">
                      <div><strong>{item.registrationPlate} · {item.make} {item.model}</strong><p className="mt-1 text-slate-400">{item.ownerName}</p></div>
                      <div><span className="text-slate-400">Revenue</span><p className="font-semibold">{money(item.grossRentalRevenue, item.currency)}</p></div>
                      <div><span className="text-slate-400">Owner payout</span><p className="font-semibold">{money(item.ownerPayouts, item.currency)}</p></div>
                      <div><span className="text-slate-400">Net profit</span><p className="font-semibold">{money(item.netProfit, item.currency)}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {selectedSettlement && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm">
          <button className="absolute inset-0 cursor-default" aria-label="Close settlement statement" onClick={() => setSelectedSettlementId(null)} />
          <div className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start justify-between border-b border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-bold">{selectedSettlement.settlementNumber}</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass(selectedSettlement.status)}`}>{label(selectedSettlement.status)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {selectedSettlement.ownerName || statement?.owner.name || selectedSettlement.ownerId} · {selectedSettlement.periodStart} → {selectedSettlement.periodEnd}
                </p>
              </div>
              <button onClick={() => setSelectedSettlementId(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard title="Eligible settled revenue" value={money(selectedSettlement.totalEligibleRentalRevenue, selectedSettlement.currency)} />
                <MetricCard title="Net owner payout" value={money(selectedSettlement.netPayoutAmount, selectedSettlement.currency)} />
                <MetricCard title="Owner deductions" value={money(selectedSettlement.totalDeductions, selectedSettlement.currency)} />
                <MetricCard title="Operator share" value={money(selectedSettlement.operatorGrossRevenueShare, selectedSettlement.currency)} />
              </div>

              {selectedSettlement.termsSnapshot && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-3 flex items-center gap-2"><History className="h-4 w-4 text-indigo-600" /><h3 className="text-xs font-bold">Frozen historical ownership terms</h3></div>
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <Row labelText="Ownership" value={label(selectedSettlement.termsSnapshot.ownershipType)} />
                    <Row labelText="Revenue share" value={`${selectedSettlement.termsSnapshot.revenueSharePercent}%`} />
                    <Row labelText="Agreement start" value={selectedSettlement.termsSnapshot.agreementStartDate} />
                    <Row labelText="Agreement end" value={selectedSettlement.termsSnapshot.agreementEndDate || "Open-ended"} />
                    <Row labelText="Expense deductions" value={selectedSettlement.termsSnapshot.allowableExpenseDeductions ? "Allowed by agreement" : "Operator borne"} />
                    <Row labelText="Terms version" value={String(selectedSettlement.termsSnapshot.termsVersion || "—")} />
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="mb-3 text-xs font-bold">Finance-backed rental revenue</h3>
                {(selectedSettlement.rentalLines || []).length === 0 ? <p className="text-xs text-slate-400">No eligible rental revenue lines.</p> : (
                  <div className="space-y-2">
                    {(selectedSettlement.rentalLines || []).map((line) => (
                      <div key={line.id} className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div><strong>{line.rentalNumber}</strong><p className="mt-1 text-[11px] text-slate-400">Invoice {line.invoiceNumber || line.invoiceId || "—"} · {line.vehiclePlate}</p></div>
                          <strong className="text-indigo-700 dark:text-indigo-300">{money(line.ownerShareAmount, selectedSettlement.currency)}</strong>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                          <span>Eligible {money(line.totalRentalRevenue, selectedSettlement.currency)}</span>
                          <span>Excluded {money(line.nonShareableRevenue, selectedSettlement.currency)}</span>
                          <span>Share {line.revenueSharePercent}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="mb-3 text-xs font-bold">Expense deductions & adjustments</h3>
                {(selectedSettlement.expenseLines || []).map((line) => (
                  <div key={line.id} className="mb-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/60">
                    <div className="flex justify-between gap-3"><span>{line.description}</span><strong>- {money(line.ownerDeductionAmount, selectedSettlement.currency)}</strong></div>
                    <p className="mt-1 text-[10px] text-slate-400">{label(line.allocationType)} · {line.expenseDate}</p>
                  </div>
                ))}
                {(selectedSettlement.adjustmentLines || []).map((line) => (
                  <div key={line.id} className="mb-2 rounded-xl bg-amber-50 p-3 text-xs dark:bg-amber-950/20">
                    <div className="flex justify-between gap-3"><span>{line.reason}</span><strong>{money(line.amount, line.currency)}</strong></div>
                    <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">{label(line.type)}</p>
                  </div>
                ))}
                {(selectedSettlement.expenseLines || []).length === 0 && (selectedSettlement.adjustmentLines || []).length === 0 && (
                  <p className="text-xs text-slate-400">No deductions or adjustments.</p>
                )}
              </section>

              {selectedSettlement.status === "DISPUTED" && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs dark:border-rose-900 dark:bg-rose-950/20">
                  <strong className="text-rose-800 dark:text-rose-200">Payout blocked by dispute</strong>
                  <p className="mt-1 text-rose-700 dark:text-rose-300">{selectedSettlement.disputeReason}</p>
                </div>
              )}

              {selectedPayable && (
                <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
                  <div className="mb-2 flex items-center gap-2"><Banknote className="h-4 w-4 text-emerald-700" /><h3 className="text-xs font-bold">Payout obligation</h3></div>
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <Row labelText="Payable" value={selectedPayable.payableNumber} />
                    <Row labelText="Status" value={label(selectedPayable.status)} />
                    <Row labelText="Method" value={label(selectedPayable.payoutMethod)} />
                    <Row labelText="Net disbursement" value={money(selectedPayable.netDisbursementAmount, selectedPayable.currency)} />
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
                <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-indigo-700" /><h3 className="text-xs font-bold">Governed actions</h3></div>
                <div className="flex flex-wrap gap-2">
                  {!selfMode && selectedSettlement.status === "CALCULATED" && hasPermission("settlement.approve") && (
                    <button disabled={submitting} onClick={() => void handleApprove(selectedSettlement)} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Approve</button>
                  )}
                  {selectedSettlement.status === "CALCULATED" && (selfMode ? hasPermission("settlement.self.dispute") : hasPermission("settlement.dispute")) && (
                    <button onClick={() => setActionMode("DISPUTE")} className="rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-slate-900">Open dispute</button>
                  )}
                  {!selfMode && selectedSettlement.status === "DISPUTED" && hasPermission("settlement.dispute") && (
                    <button onClick={() => setActionMode("RESOLVE_DISPUTE")} className="rounded-xl bg-indigo-700 px-3 py-2 text-xs font-bold text-white">Resolve dispute</button>
                  )}
                  {!selfMode && ["CALCULATED", "DISPUTED"].includes(selectedSettlement.status) && hasPermission("settlement.adjust") && (
                    <button onClick={() => setActionMode("ADJUST")} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900">Add adjustment</button>
                  )}
                  {!selfMode && selectedSettlement.status === "APPROVED" && selectedPayable?.status === "PENDING" && hasPermission("settlement.pay") && (
                    <button
                      onClick={() => {
                        setPayoutProvider(selectedPayable.payoutMethod.includes("MPESA") ? "MPESA_DARAJA" : "STRIPE_CARD");
                        setActionMode("PAYOUT");
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white"
                    >
                      Execute payout <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {!selfMode && selectedSettlement.status === "CALCULATED" && (
                  <p className="mt-3 text-[11px] text-indigo-700 dark:text-indigo-300">Calculator cannot approve the same settlement; the API enforces four-eyes approval.</p>
                )}
                {!selfMode && selectedSettlement.status === "APPROVED" && (
                  <p className="mt-3 text-[11px] text-indigo-700 dark:text-indigo-300">Settlement approver cannot execute its payout; Payments enforces an independent payout actor.</p>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {actionMode && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="font-bold text-slate-950 dark:text-white">
                  {actionMode === "CALCULATE" ? "Calculate Owner Settlement" :
                   actionMode === "CREATE_PERIOD" ? "Create Settlement Period" :
                   actionMode === "DISPUTE" ? "Open Settlement Dispute" :
                   actionMode === "RESOLVE_DISPUTE" ? "Resolve Settlement Dispute" :
                   actionMode === "ADJUST" ? "Add Settlement Adjustment" : "Execute Owner Payout"}
                </h2>
                <p className="mt-1 text-xs text-slate-400">Canonical backend rules remain authoritative.</p>
              </div>
              <button onClick={() => setActionMode(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>

            {actionMode === "CALCULATE" && (
              <form onSubmit={handleCalculate} className="space-y-4">
                <Field labelText="Vehicle owner">
                  <select required value={calcOwnerId} onChange={(e) => setCalcOwnerId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950">
                    <option value="">Select owner</option>
                    {vehicleOwners.filter((o) => o.tenantId === activeTenantId && o.status === "ACTIVE").map((owner) => <option key={owner.id} value={owner.id}>{owner.name}{owner.companyName ? ` · ${owner.companyName}` : ""}</option>)}
                  </select>
                </Field>
                {periods.length > 0 && (
                  <Field labelText="Governed period (optional)">
                    <select value={calcPeriodId} onChange={(e) => setCalcPeriodId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950">
                      <option value="">Custom dates</option>
                      {periods.filter((p) => p.status !== "CLOSED").map((period) => <option key={period.id} value={period.id}>{period.periodNumber} · {period.startDate} → {period.endDate}</option>)}
                    </select>
                  </Field>
                )}
                {!calcPeriodId && <div className="grid gap-3 sm:grid-cols-2"><Field labelText="Start date"><input required type="date" value={calcStart} onChange={(e) => setCalcStart(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950" /></Field><Field labelText="End date"><input required type="date" value={calcEnd} onChange={(e) => setCalcEnd(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950" /></Field></div>}
                <div className="rounded-xl bg-indigo-50 p-3 text-[11px] text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300">Only paid/settled Finance invoice components are eligible. Missing historical ownership terms block calculation; no default rate or share is fabricated.</div>
                <SubmitButton disabled={submitting} text={submitting ? "Calculating…" : "Calculate from authoritative facts"} />
              </form>
            )}

            {actionMode === "CREATE_PERIOD" && (
              <form onSubmit={handleCreatePeriod} className="space-y-4">
                <Field labelText="Period type"><select value={periodType} onChange={(e) => setPeriodType(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950"><option>MONTHLY</option><option>WEEKLY</option><option>BI_WEEKLY</option><option>CUSTOM</option></select></Field>
                <div className="grid gap-3 sm:grid-cols-2"><Field labelText="Start date"><input required type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950" /></Field><Field labelText="End date"><input required type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950" /></Field></div>
                <Field labelText="Description"><input value={periodDescription} onChange={(e) => setPeriodDescription(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950" placeholder="October owner settlements" /></Field>
                <SubmitButton disabled={submitting} text="Create period" />
              </form>
            )}

            {actionMode === "DISPUTE" && (
              <form onSubmit={handleDispute} className="space-y-4">
                <Field labelText="Dispute reason"><textarea required minLength={5} rows={4} value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950" /></Field>
                <SubmitButton disabled={submitting} text="Open dispute" />
              </form>
            )}

            {actionMode === "RESOLVE_DISPUTE" && (
              <form onSubmit={handleResolveDispute} className="space-y-4">
                <Field labelText="Resolution notes"><textarea required minLength={5} rows={3} value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950" /></Field>
                <p className="text-[11px] font-semibold text-slate-500">Optional resolution adjustment</p>
                <Field labelText="Adjustment type"><select value={adjustmentType} onChange={(e) => setAdjustmentType(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950"><option>CREDIT_ADJUSTMENT</option><option>DEBIT_ADJUSTMENT</option><option>DISPUTE_SETTLEMENT</option><option>CARRYOVER_DEDUCTION</option><option>HOLD</option></select></Field>
                <div className="grid gap-3 sm:grid-cols-2"><Field labelText="Amount"><input type="number" min="0" step="0.01" value={adjustmentAmount} onChange={(e) => setAdjustmentAmount(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950" /></Field><Field labelText="Reason"><input value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950" /></Field></div>
                <div className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Resolution returns the statement to CALCULATED. It cannot silently self-approve or create a payable.</div>
                <SubmitButton disabled={submitting} text="Resolve & recalculate" />
              </form>
            )}

            {actionMode === "ADJUST" && (
              <form onSubmit={handleAdjustment} className="space-y-4">
                <Field labelText="Adjustment type"><select value={adjustmentType} onChange={(e) => setAdjustmentType(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950"><option>CREDIT_ADJUSTMENT</option><option>DEBIT_ADJUSTMENT</option><option>DISPUTE_SETTLEMENT</option><option>CARRYOVER_DEDUCTION</option><option>HOLD</option></select></Field>
                <Field labelText="Amount"><input required type="number" min="0.01" step="0.01" value={adjustmentAmount} onChange={(e) => setAdjustmentAmount(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950" /></Field>
                <Field labelText="Reason"><textarea required minLength={3} rows={3} value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950" /></Field>
                <SubmitButton disabled={submitting} text="Record adjustment & recalculate" />
              </form>
            )}

            {actionMode === "PAYOUT" && selectedPayable && (
              <form onSubmit={handlePayout} className="space-y-4">
                <div className="rounded-xl bg-slate-50 p-4 text-xs dark:bg-slate-950/60">
                  <Row labelText="Owner" value={selectedPayable.recipientName} />
                  <Row labelText="Payable" value={selectedPayable.payableNumber} />
                  <Row labelText="Amount" value={money(selectedPayable.netDisbursementAmount, selectedPayable.currency)} />
                  <Row labelText="Destination" value={selectedPayable.destinationMpesaNumber || selectedPayable.destinationAccount || "Not configured"} />
                </div>
                <Field labelText="Provider">
                  <select value={payoutProvider} onChange={(e) => setPayoutProvider(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950">
                    <option value="MPESA_DARAJA">M-Pesa Daraja B2C</option>
                    <option value="STRIPE_CARD">Stripe transfer adapter (development/test only)</option>
                  </select>
                </Field>
                <div className="rounded-xl bg-rose-50 p-3 text-[11px] text-rose-800 dark:bg-rose-950/30 dark:text-rose-300">The settlement approver cannot execute this payout. Production rejects fake providers and the non-certified Stripe owner-payout path.</div>
                <SubmitButton disabled={submitting} text={submitting ? "Executing…" : "Execute provider payout"} />
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">{text}</div>
);

const MetricCard: React.FC<{ title: string; value: string }> = ({ title, value }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
    <p className="mt-1 font-bold text-slate-950 dark:text-white">{value}</p>
  </div>
);

const Row: React.FC<{ labelText: string; value: string }> = ({ labelText, value }) => (
  <div className="flex justify-between gap-3 py-1"><span className="text-slate-500">{labelText}</span><strong className="text-right">{value}</strong></div>
);

const Field: React.FC<{ labelText: string; children: React.ReactNode }> = ({ labelText, children }) => (
  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">{labelText}{children}</label>
);

const SubmitButton: React.FC<{ disabled: boolean; text: string }> = ({ disabled, text }) => (
  <button disabled={disabled} className="w-full rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{text}</button>
);
