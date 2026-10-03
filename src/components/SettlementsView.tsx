import React, { useState } from "react";
import {
  FileSpreadsheet,
  Plus,
  Building2,
  Users,
  CheckCircle2,
  Calendar,
  CreditCard,
  TrendingUp,
  Percent,
  Download,
} from "lucide-react";
import { useApp } from "../lib/store";
import { OwnerSettlement, SettlementStatus } from "../types";

export const SettlementsView: React.FC = () => {
  const { restoration } = useApp();
  const {
    settlements,
    vehicleOwners,
    activeTenant,
    activeTenantId,
    calculateOwnerSettlement,
    approveOwnerSettlement,
    payOwnerSettlement,
  } = useApp();

  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const tenantStatements = (settlements || []).filter((s) => s.tenantId === activeTenantId);
  const tenantOwners = (vehicleOwners || []).filter((o) => o.tenantId === activeTenantId);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOwnerId) return;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    calculateOwnerSettlement(selectedOwnerId, startOfMonth, endOfMonth);
    setSelectedOwnerId("");
  };

  const getStatusBadge = (status: SettlementStatus) => {
    switch (status) {
      case "PENDING":
      case "CALCULATED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">CALCULATED</span>;
      case "APPROVED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300">APPROVED</span>;
      case "PAYMENT_PENDING":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">PAYMENT PENDING</span>;
      case "PAID":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">PAID & SETTLED</span>;
      case "DISPUTED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300">DISPUTED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  return (
    <div id="settlements-view" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Owner Settlements & Payout Statements</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {tenantStatements.length} Statements
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Automated monthly revenue distributions, allowable expense deductions, commission retentions, and bank disbursement audit trails.
          </p>
        </div>

        {/* Generate Statement Form */}
        <form onSubmitCapture={restoration ? e => {e.preventDefault();e.stopPropagation();} : undefined} onSubmit={handleGenerate} className="flex items-center gap-2">
          <select
            required
            value={selectedOwnerId}
            onChange={(e) => setSelectedOwnerId(e.target.value)}
            className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200"
          >
            <option value="">Select vehicle owner...</option>
            {tenantOwners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.ownershipType === "COMPANY_OWNED" ? "Company Asset" : "Third Party"})
              </option>
            ))}
          </select>
          <button disabled={restoration} aria-describedby="restoration-actions-note"
            type="submit"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Generate Statement</span>
          </button>
        </form>
      </div>

      {/* Statements List */}
      <div className="space-y-4">
        {tenantStatements.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-400 text-xs">
            No settlement statements generated yet for this period.
          </div>
        ) : (
          tenantStatements.map((stmt) => {
            const owner = tenantOwners.find((o) => o.id === stmt.ownerId);

            return (
              <div
                key={stmt.id}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-5"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">{stmt.settlementNumber}</span>
                    {getStatusBadge(stmt.status)}
                    <span className="text-xs text-slate-400 font-medium">Owner: {owner?.name || stmt.ownerName}</span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      Period: {new Date(stmt.periodStart).toLocaleDateString()} → {new Date(stmt.periodEnd).toLocaleDateString()}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Payout Destination: {owner?.payoutBank || "Bank Wire / M-Pesa"} (Acc: {owner?.payoutAccountNumber || "Standard Account"})
                  </p>
                </div>

                {/* Calculation Snapshot */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 text-xs space-y-1 min-w-[240px]">
                  <div className="flex justify-between text-slate-500">
                    <span>Gross Revenue:</span>
                    <span>{stmt.currency} {Number(stmt.grossRevenue || stmt.totalGrossRevenue || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Operator Retained Share:</span>
                    <span>- {stmt.currency} {Number(stmt.operatorGrossRevenueShare || ((Number(stmt.grossRevenue || stmt.totalGrossRevenue || 0)) - (Number(stmt.ownerGrossRevenueShare || stmt.totalOwnerShare || 0)))).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Direct Deductions:</span>
                    <span>- {stmt.currency} {Number(stmt.totalDeductions || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
                    <span>Net Disbursable Payout:</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                      {stmt.currency} {Number(stmt.netPayoutAmount || 0).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {(stmt.status === "PENDING" || stmt.status === "CALCULATED") && (
                    <button disabled={restoration} aria-describedby="restoration-actions-note"
                      onClick={() => approveOwnerSettlement(stmt.id)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
                    >
                      Approve Payout
                    </button>
                  )}

                  {stmt.status === "APPROVED" && (
                    <button disabled={restoration} aria-describedby="restoration-actions-note"
                      onClick={() => {
                        const ref = prompt("Enter bank or M-Pesa transaction reference:", `BNK-DISB-${Date.now().toString().slice(-6)}`);
                        if (ref) payOwnerSettlement(stmt.id, ref);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Disburse Payout</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
