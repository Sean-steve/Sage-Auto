import React, { useState } from "react";
import {
  Receipt,
  Plus,
  CreditCard,
  Building2,
  TrendingUp,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  DollarSign,
  Scale,
} from "lucide-react";
import { useApp } from "../lib/store";
import { TenantInvoice, TenantPayment, PrototypeLedgerTransaction, TenantExpense } from "../types";

export const FinanceView: React.FC = () => {
  const { restoration } = useApp();
  const {
    invoices,
    payments,
    paymentAttempts,
    expenses,
    ledgerAccounts,
    ledgerTransactions,
    activeTenant,
    activeTenantId,
    recordPayment,
    addExpense,
    postLedgerTransaction,
  } = useApp();

  const [activeTab, setActiveTab] = useState<"INVOICES" | "PAYMENTS" | "EXPENSES" | "LEDGER">("INVOICES");

  const tenantInvoices = invoices.filter((i) => i.tenantId === activeTenantId);
  const tenantPayments = payments.filter((p) => p.tenantId === activeTenantId);
  const tenantAttempts = paymentAttempts.filter((pa) => pa.tenantId === activeTenantId);
  const tenantExpenses = expenses.filter((e) => e.tenantId === activeTenantId);
  const tenantAccounts = ledgerAccounts.filter((a) => a.tenantId === activeTenantId);
  const tenantTransactions = ledgerTransactions.filter((t) => t.tenantId === activeTenantId);

  const totalInvoiced = tenantInvoices.reduce((acc, curr) => acc + curr.totalAmount, 0);
  const totalPaid = tenantPayments.reduce((acc, curr) => acc + curr.amount, 0);
  const totalExp = tenantExpenses.reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div id="finance-view" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Financial Accounting & General Ledger</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              Financial records
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Invoices, payments, expenses and accounting records. Balances are not verified in this restored screen.
          </p>
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Gross Invoiced Revenue</span>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
            {activeTenant.currencySymbol} {totalInvoiced.toLocaleString()}
          </p>
          <span className="text-[11px] text-slate-400">Inclusive of 16% VAT</span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Collected Customer Payments</span>
          <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
            {activeTenant.currencySymbol} {totalPaid.toLocaleString()}
          </p>
          <span className="text-[11px] text-emerald-600 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" /> M-Pesa STK receipts settled
          </span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Direct Fleet Expenses</span>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
            {activeTenant.currencySymbol} {totalExp.toLocaleString()}
          </p>
          <span className="text-[11px] text-slate-400">Maintenance, fuel & valeting</span>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab("INVOICES")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "INVOICES"
              ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
          }`}
        >
          Customer Invoices ({tenantInvoices.length})
        </button>
        <button
          onClick={() => setActiveTab("PAYMENTS")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "PAYMENTS"
              ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
          }`}
        >
          Payment Receipts & STK Attempts ({tenantPayments.length})
        </button>
        <button
          onClick={() => setActiveTab("EXPENSES")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "EXPENSES"
              ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
          }`}
        >
          Operating Expenses ({tenantExpenses.length})
        </button>
        <button
          onClick={() => setActiveTab("LEDGER")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "LEDGER"
              ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
          }`}
        >
          Double-Entry General Ledger ({tenantTransactions.length})
        </button>
      </div>

      {/* Invoices View */}
      {activeTab === "INVOICES" && (
        <div className="space-y-3">
          {tenantInvoices.map((inv) => (
            <div
              key={inv.id}
              className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">{inv.invoiceNumber}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {inv.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Issued: {new Date(inv.issueDate).toLocaleDateString()} • Items: {(inv.items || []).length} line items
                </p>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Amount</span>
                <p className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                  {inv.currency} {inv.totalAmount.toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payments & Attempts View */}
      {activeTab === "PAYMENTS" && (
        <div className="space-y-3">
          {tenantPayments.map((p) => (
            <div
              key={p.id}
              className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center font-bold text-xs">
                  KES
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">{p.paymentNumber}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800">
                      M-Pesa: {p.providerTransactionId}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Recorded: {new Date(p.recordedAt).toLocaleString()} • Method: {p.paymentMethod}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-emerald-600 font-semibold uppercase">Payment Received</span>
                <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                  + {p.currency} {p.amount.toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Expenses */}
      {activeTab === "EXPENSES" && (
        <div className="space-y-3">
          {tenantExpenses.map((exp) => (
            <div
              key={exp.id}
              className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div>
                <span className="font-bold text-xs text-slate-900 dark:text-white">{exp.description}</span>
                <p className="text-xs text-slate-500 mt-0.5">
                  Category: {exp.category} • Vendor: {exp.vendorName || "N/A"} • Receipt: {exp.receiptNumber || "N/A"}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-rose-500 font-semibold uppercase">Expense</span>
                <p className="text-base font-extrabold text-rose-600 dark:text-rose-400 font-mono">
                  - {exp.currency} {exp.amount.toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Double-Entry Ledger */}
      {activeTab === "LEDGER" && (
        <div className="space-y-6">
          {/* Chart of Accounts Balance Snapshot */}
          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Chart of Accounts Balances</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {tenantAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/70 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-500">{acc.code}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 bg-slate-200 dark:bg-slate-800 rounded">
                      {acc.type}
                    </span>
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{acc.name}</p>
                  <p className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {acc.currency} {acc.balance.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Journal Transactions */}
          <div className="space-y-4">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">Posted Journal Transactions</h3>
            {tenantTransactions.map((tx) => (
              <div
                key={tx.id}
                className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-2">
                  <div>
                    <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">{tx.reference}</span>
                    <p className="text-xs text-slate-500">{tx.description}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Balanced: {activeTenant.currencySymbol} {tx.totalDebit.toLocaleString()}
                  </span>
                </div>

                <div className="space-y-1 text-xs">
                  {tx.entries.map((e) => (
                    <div key={e.id} className="flex items-center justify-between text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                      <span>
                        [{e.accountCode}] {e.accountName}
                      </span>
                      <span className={e.type === "DEBIT" ? "text-blue-600 font-bold" : "text-emerald-600 font-bold"}>
                        {e.type}: {activeTenant.currencySymbol} {e.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
