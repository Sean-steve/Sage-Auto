import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRightLeft,
  CircleDollarSign,
  FileCheck2,
  FileText,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
  ShieldCheck,
  WalletCards,
  X,
} from "lucide-react";
import { apiClient } from "../lib/api-client";
import { useApp } from "../lib/store";
import type {
  DepositPosition,
  OperationalExpense,
  OperationalFinanceSummary,
  OperationalInvoice,
  Payment,
  PaymentAttempt,
  PaymentReconciliationIssue,
  Refund,
  RefundObligation,
  Rental,
} from "../types";

type FinanceTab = "INVOICES" | "PAYMENTS" | "DEPOSITS" | "EXPENSES" | "RECONCILIATION" | "LEDGER";
type ActionMode =
  | "GENERATE_INVOICE"
  | "MANUAL_PAYMENT"
  | "MPESA"
  | "ALLOCATE"
  | "REFUND"
  | "APPLY_DEPOSIT"
  | "CREATE_EXPENSE"
  | null;

const money = (value: string | number | undefined) => Number(value || 0);
const label = (value?: string) => (value || "—").replace(/_/g, " ");

const statusClass = (status?: string) => {
  const s = status || "";
  if (["PAID", "ALLOCATED", "VERIFIED", "COMPLETED", "APPROVED", "REFUNDED", "SUCCEEDED", "HELD"].includes(s)) {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";
  }
  if (["OVERDUE", "FAILED", "VOIDED", "REJECTED", "DISPUTED", "CRITICAL"].includes(s)) {
    return "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300";
  }
  if (["PENDING", "PENDING_CALLBACK", "PENDING_REDIRECT", "PARTIALLY_PAID", "PARTIALLY_ALLOCATED", "PROCESSING", "REFUND_DUE"].includes(s)) {
    return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300";
  }
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
};

export const FinanceView: React.FC = () => {
  const {
    activeTenant,
    activeTenantId,
    rentals,
    customers,
    restoration,
    hasPermission,
    showNotification,
  } = useApp();

  const [activeTab, setActiveTab] = useState<FinanceTab>("INVOICES");
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<OperationalFinanceSummary | null>(null);
  const [invoices, setInvoices] = useState<OperationalInvoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [attempts, setAttempts] = useState<PaymentAttempt[]>([]);
  const [deposits, setDeposits] = useState<DepositPosition[]>([]);
  const [refundObligations, setRefundObligations] = useState<RefundObligation[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [expenses, setExpenses] = useState<OperationalExpense[]>([]);
  const [reconciliation, setReconciliation] = useState<PaymentReconciliationIssue[]>([]);
  const [ledgerAccounts, setLedgerAccounts] = useState<any[]>([]);
  const [journals, setJournals] = useState<any[]>([]);

  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<OperationalInvoice | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedDeposit, setSelectedDeposit] = useState<DepositPosition | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [rentalId, setRentalId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [payerReference, setPayerReference] = useState("");
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [allocationInvoiceId, setAllocationInvoiceId] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [depositInvoiceId, setDepositInvoiceId] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseTax, setExpenseTax] = useState("0");
  const [expenseCategory, setExpenseCategory] = useState("OTHER");
  const [expensePayee, setExpensePayee] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    const jobs: Array<Promise<any>> = [
      hasPermission("finance.read") ? apiClient.finance.getSummary() : Promise.resolve({}),
      hasPermission("invoice.read") ? apiClient.finance.getInvoices() : Promise.resolve({}),
      hasPermission("payment.read") ? apiClient.payments.listPayments() : Promise.resolve({}),
      hasPermission("payment.read") ? apiClient.payments.listAttempts() : Promise.resolve({}),
      hasPermission("deposit.read") ? apiClient.finance.getDeposits() : Promise.resolve({}),
      hasPermission("refund.read") ? apiClient.finance.getRefundObligations() : Promise.resolve({}),
      hasPermission("refund.read") ? apiClient.payments.listRefunds() : Promise.resolve({}),
      hasPermission("expense.read") ? apiClient.finance.getExpenses() : Promise.resolve({}),
      hasPermission("payment.reconciliation.read") ? apiClient.payments.listReconciliationIssues(false) : Promise.resolve({}),
      hasPermission("ledger.account.read") ? apiClient.finance.getLedgerAccounts() : Promise.resolve({}),
      hasPermission("ledger.read") ? apiClient.finance.getLedgerTransactions() : Promise.resolve({}),
    ];

    const [
      summaryRes,
      invoicesRes,
      paymentsRes,
      attemptsRes,
      depositsRes,
      obligationsRes,
      refundsRes,
      expensesRes,
      reconRes,
      accountsRes,
      journalsRes,
    ] = await Promise.all(jobs);

    if (!summaryRes.error && summaryRes.data) setSummary(summaryRes.data);
    if (!invoicesRes.error && Array.isArray(invoicesRes.data)) setInvoices(invoicesRes.data);
    if (!paymentsRes.error && Array.isArray(paymentsRes.data)) setPayments(paymentsRes.data);
    if (!attemptsRes.error && Array.isArray(attemptsRes.data)) setAttempts(attemptsRes.data);
    if (!depositsRes.error && Array.isArray(depositsRes.data)) setDeposits(depositsRes.data);
    if (!obligationsRes.error && Array.isArray(obligationsRes.data)) setRefundObligations(obligationsRes.data);
    if (!refundsRes.error && Array.isArray(refundsRes.data)) setRefunds(refundsRes.data);
    if (!expensesRes.error && Array.isArray(expensesRes.data)) setExpenses(expensesRes.data);
    if (!reconRes.error && Array.isArray(reconRes.data)) setReconciliation(reconRes.data);
    if (!accountsRes.error && Array.isArray(accountsRes.data)) setLedgerAccounts(accountsRes.data);
    if (!journalsRes.error && Array.isArray(journalsRes.data)) setJournals(journalsRes.data);
    setLoading(false);
  }, [hasPermission]);

  useEffect(() => {
    void loadAll();
  }, [activeTenantId, loadAll]);

  const completedRentals = useMemo(
    () =>
      rentals.filter(
        (r: Rental) =>
          r.tenantId === activeTenantId &&
          ["COMPLETED", "RETURN_COMPLETED"].includes(r.state) &&
          !invoices.some((invoice) => invoice.rentalId === r.id)
      ),
    [activeTenantId, invoices, rentals]
  );

  const metrics = useMemo(() => {
    const verifiedInbound = payments
      .filter((p) => p.direction === "INBOUND" && p.status !== "VOIDED")
      .reduce((sum, p) => sum + money(p.amount), 0);
    const unallocated = payments.reduce((sum, p) => sum + money(p.unallocatedAmount), 0);
    return {
      invoiced: money(summary?.totalInvoiced),
      collected: money(summary?.totalCollected) || verifiedInbound,
      receivables: money(summary?.totalReceivables),
      overdue: money(summary?.totalOverdue),
      deposits: money(summary?.totalDepositsHeld),
      refundsDue: money(summary?.totalRefundsDue),
      unallocated,
      reconciliation: reconciliation.length,
    };
  }, [payments, reconciliation.length, summary]);

  const outstandingInvoices = invoices.filter(
    (invoice) => !["VOIDED", "PAID"].includes(invoice.status) && money(invoice.amountOutstanding) > 0
  );

  const formatMoney = (value: string | number | undefined, currency = activeTenant.currency || "KES") =>
    `${currency} ${money(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const resetModal = () => {
    setActionMode(null);
    setSelectedInvoice(null);
    setSelectedPayment(null);
    setSelectedDeposit(null);
    setRentalId("");
    setDueDate("");
    setPaymentAmount("");
    setPaymentReference("");
    setPayerReference("");
    setMpesaPhone("");
    setAllocationInvoiceId("");
    setRefundReason("");
    setDepositInvoiceId("");
    setExpenseDescription("");
    setExpenseAmount("");
    setExpenseTax("0");
    setExpenseCategory("OTHER");
    setExpensePayee("");
  };

  const openPayment = (mode: ActionMode, invoice: OperationalInvoice) => {
    setSelectedInvoice(invoice);
    setPaymentAmount(String(money(invoice.amountOutstanding)));
    setActionMode(mode);
  };

  const handleGenerateInvoice = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rentalId) return;
    setSubmitting(true);
    try {
      const response = await apiClient.finance.generateRentalInvoice({
        rentalId,
        dueDate: dueDate || undefined,
        applyDepositDeduction: true,
      });
      if (response.error) throw new Error(response.error.message);
      showNotification("Authoritative rental invoice generated from the completed Return record.");
      resetModal();
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to generate rental invoice.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleIssueInvoice = async (invoice: OperationalInvoice) => {
    setSubmitting(true);
    try {
      const response = await apiClient.finance.issueInvoice(invoice.id);
      if (response.error) throw new Error(response.error.message);
      showNotification(`Invoice ${invoice.invoiceNumber} issued.`);
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to issue invoice.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedInvoice) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setSubmitting(true);
    try {
      const recorded = await apiClient.payments.recordManual({
        purpose: "CUSTOMER_INVOICE",
        amount: String(amount),
        currency: selectedInvoice.currency,
        targetId: selectedInvoice.id,
        customerId: selectedInvoice.customerId,
        payerReference: payerReference.trim() || selectedInvoice.billingSnapshot.customerName,
        providerTransactionId: paymentReference.trim(),
        notes: `Manual collection for ${selectedInvoice.invoiceNumber}`,
      });
      if (recorded.error || !recorded.data) throw new Error(recorded.error?.message || "Payment could not be recorded.");

      const payment = recorded.data as Payment;
      if (money(payment.unallocatedAmount) > 0) {
        showNotification(
          `Payment ${payment.paymentNumber} was recorded, but ${formatMoney(payment.unallocatedAmount, payment.currency)} remains unallocated and requires Finance review.`,
          "error"
        );
      } else {
        showNotification(`Payment ${payment.paymentNumber} verified and allocated to ${selectedInvoice.invoiceNumber}.`);
      }
      resetModal();
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to record payment.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMpesa = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedInvoice) return;
    setSubmitting(true);
    try {
      const response = await apiClient.payments.stkPush({
        invoiceId: selectedInvoice.id,
        phoneNumber: mpesaPhone.trim(),
        amount: Number(paymentAmount),
        customerId: selectedInvoice.customerId,
      });
      if (response.error) throw new Error(response.error.message);
      showNotification("M-Pesa collection initiated. The invoice remains unpaid until provider verification and allocation.");
      resetModal();
      await loadAll();
      setActiveTab("PAYMENTS");
    } catch (error: any) {
      showNotification(error.message || "Unable to initiate M-Pesa collection.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyAttempt = async (attempt: PaymentAttempt) => {
    setSubmitting(true);
    try {
      const response = await apiClient.payments.verifyAttempt(attempt.id);
      if (response.error) throw new Error(response.error.message);
      showNotification("Provider verification completed. Verified money is now available for allocation.");
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Provider verification did not confirm the payment.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAllocation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPayment || !allocationInvoiceId) return;
    setSubmitting(true);
    try {
      const response = await apiClient.payments.allocate(selectedPayment.id, {
        sourceType: "CUSTOMER_INVOICE",
        sourceId: allocationInvoiceId,
        amount: paymentAmount,
      });
      if (response.error) throw new Error(response.error.message);
      showNotification(`Payment ${selectedPayment.paymentNumber} allocated.`);
      resetModal();
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to allocate payment.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefundRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPayment) return;
    setSubmitting(true);
    try {
      const response = await apiClient.payments.requestRefund({
        paymentId: selectedPayment.id,
        amount: paymentAmount,
        reason: refundReason.trim(),
        sourceObligationType: "CUSTOMER_INVOICE",
      });
      if (response.error) throw new Error(response.error.message);
      showNotification("Refund request created. A user with refund approval authority must execute it.");
      resetModal();
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to request refund.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveRefund = async (refund: Refund) => {
    setSubmitting(true);
    try {
      const response = await apiClient.payments.approveAndExecuteRefund(refund.id);
      if (response.error) throw new Error(response.error.message);
      showNotification(`Refund ${refund.refundNumber} approved and executed through the payment provider.`);
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to execute refund.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveObligation = async (refund: RefundObligation) => {
    setSubmitting(true);
    try {
      const response = await apiClient.finance.approveRefundObligation(refund.id);
      if (response.error) throw new Error(response.error.message);
      showNotification("Refund liability approved. Provider disbursement remains a separate Payment refund action.");
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to approve refund obligation.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApplyDeposit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedDeposit || !depositInvoiceId) return;
    setSubmitting(true);
    try {
      const response = await apiClient.finance.applyDeposit(selectedDeposit.id, {
        invoiceId: depositInvoiceId,
        amountToApply: paymentAmount,
      });
      if (response.error) throw new Error(response.error.message);
      showNotification("Held deposit applied to invoice through the authoritative liability record.");
      resetModal();
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to apply deposit.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReconciliationScan = async () => {
    setSubmitting(true);
    try {
      const response = await apiClient.payments.runReconciliation();
      if (response.error) throw new Error(response.error.message);
      showNotification("Payment reconciliation scan completed.");
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to run reconciliation.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveIssue = async (issue: PaymentReconciliationIssue) => {
    setSubmitting(true);
    try {
      const response = await apiClient.payments.resolveReconciliationIssue(issue.id);
      if (response.error) throw new Error(response.error.message);
      showNotification("Reconciliation exception marked resolved.");
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to resolve reconciliation issue.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateExpense = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await apiClient.finance.createExpense({
        category: expenseCategory,
        description: expenseDescription.trim(),
        expenseDate: new Date().toISOString().split("T")[0],
        netAmount: expenseAmount,
        taxAmount: expenseTax,
        currency: activeTenant.currency || "KES",
        payeeName: expensePayee.trim() || undefined,
      });
      if (response.error) throw new Error(response.error.message);
      showNotification("Expense draft recorded. Approval remains a separate four-eyes step.");
      resetModal();
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to record expense.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpenseAction = async (expense: OperationalExpense, action: "SUBMIT" | "APPROVE") => {
    setSubmitting(true);
    try {
      const response =
        action === "SUBMIT"
          ? await apiClient.finance.submitExpense(expense.id)
          : await apiClient.finance.approveExpense(expense.id);
      if (response.error) throw new Error(response.error.message);
      showNotification(action === "SUBMIT" ? "Expense submitted for approval." : "Expense approved and ready for posting.");
      await loadAll();
    } catch (error: any) {
      showNotification(error.message || "Unable to update expense.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const tabs: Array<[FinanceTab, string]> = [
    ["INVOICES", "Invoices & receivables"],
    ["PAYMENTS", "Payments"],
    ["DEPOSITS", "Deposits & refunds"],
    ["EXPENSES", "Expenses"],
    ["RECONCILIATION", "Reconciliation"],
    ["LEDGER", "Ledger"],
  ];

  return (
    <div id="finance-view" className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CircleDollarSign className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-950 dark:text-white">Finance & Payments</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Invoices establish what is owed. Verified provider/payment records establish what actually moved.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPermission("invoice.create") && completedRentals.length > 0 && (
            <button
              onClick={() => setActionMode("GENERATE_INVOICE")}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white dark:bg-white dark:text-slate-950"
            >
              <FileText className="h-3.5 w-3.5" /> Generate rental invoice
            </button>
          )}
          <button
            onClick={() => void loadAll()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        {[
          ["Invoiced", metrics.invoiced, FileText],
          ["Collected", metrics.collected, ArrowDownLeft],
          ["Receivable", metrics.receivables, WalletCards],
          ["Overdue", metrics.overdue, AlertTriangle],
          ["Deposits held", metrics.deposits, ShieldCheck],
          ["Refunds due", metrics.refundsDue, RotateCcw],
          ["Unallocated", metrics.unallocated, ArrowRightLeft],
          ["Recon issues", metrics.reconciliation, Scale],
        ].map(([title, value, Icon]: any) => (
          <div key={title} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{title}</span>
              <Icon className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <p className="mt-2 truncate text-base font-bold text-slate-950 dark:text-white">
              {title === "Recon issues" ? value : formatMoney(value)}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-3 dark:border-slate-800">
        {tabs.map(([tab, title]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold ${
              activeTab === tab
                ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {title}
          </button>
        ))}
      </div>

      {loading && invoices.length === 0 && payments.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
        </div>
      ) : null}

      {activeTab === "INVOICES" && (
        <div className="space-y-3">
          {completedRentals.length > 0 && hasPermission("invoice.create") && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs dark:border-blue-900 dark:bg-blue-950/20">
              <div className="flex items-start gap-3">
                <FileCheck2 className="mt-0.5 h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-bold text-blue-900 dark:text-blue-200">{completedRentals.length} completed rental(s) are not yet invoiced</p>
                  <p className="mt-1 text-blue-700 dark:text-blue-300">Finance may generate an invoice only after Return & Final Calculation is complete.</p>
                </div>
              </div>
            </div>
          )}

          {invoices.length === 0 ? (
            <EmptyState text="No operational invoices found." />
          ) : invoices.map((invoice) => {
            const overdue =
              !["PAID", "VOIDED"].includes(invoice.status) &&
              invoice.dueDate < new Date().toISOString().split("T")[0] &&
              money(invoice.amountOutstanding) > 0;
            return (
              <div key={invoice.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-slate-950 dark:text-white">{invoice.invoiceNumber}</span>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass(overdue ? "OVERDUE" : invoice.status)}`}>
                        {overdue ? "OVERDUE" : label(invoice.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{invoice.billingSnapshot.customerName}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Issued {invoice.issueDate} · Due {invoice.dueDate}{invoice.rentalId ? ` · Rental ${invoice.rentalId}` : ""}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/60">
                    <div><span className="text-[10px] uppercase text-slate-400">Total</span><p className="font-bold">{formatMoney(invoice.total, invoice.currency)}</p></div>
                    <div><span className="text-[10px] uppercase text-slate-400">Outstanding</span><p className={`font-bold ${money(invoice.amountOutstanding) > 0 ? "text-rose-600" : "text-emerald-600"}`}>{formatMoney(invoice.amountOutstanding, invoice.currency)}</p></div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {invoice.status === "DRAFT" && hasPermission("invoice.issue") && (
                      <button disabled={submitting || restoration} onClick={() => void handleIssueInvoice(invoice)} className="rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white dark:bg-white dark:text-slate-900">Issue</button>
                    )}
                    {money(invoice.amountOutstanding) > 0 && hasPermission("payment.record") && (
                      <button onClick={() => openPayment("MANUAL_PAYMENT", invoice)} className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold dark:border-slate-700">Record payment</button>
                    )}
                    {money(invoice.amountOutstanding) > 0 && hasPermission("payment.initiate") && (
                      <button onClick={() => openPayment("MPESA", invoice)} className="rounded-lg bg-emerald-700 px-3 py-2 text-[11px] font-bold text-white">M-Pesa collect</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === "PAYMENTS" && (
        <div className="space-y-5">
          {attempts.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Provider attempts</h3>
              <div className="space-y-2">
                {attempts.slice(0, 10).map((attempt) => (
                  <div key={attempt.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold">{attempt.paymentIntentReference}</span>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass(attempt.status)}`}>{label(attempt.status)}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">{attempt.provider} · {formatMoney(attempt.amount, attempt.currency)} · target {attempt.targetId || "—"}</p>
                    </div>
                    {hasPermission("payment.verify") && ["SUCCEEDED", "PENDING_CALLBACK", "PENDING_REDIRECT"].includes(attempt.status) && (
                      <button disabled={submitting} onClick={() => void handleVerifyAttempt(attempt)} className="rounded-lg border border-emerald-200 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900">Verify with provider</button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Verified payment facts</h3>
            {payments.length === 0 ? <EmptyState text="No verified payments found." /> : (
              <div className="space-y-2">
                {payments.map((payment) => {
                  const refundable = Math.max(0, money(payment.amount) - money(payment.refundedAmount));
                  return (
                    <div key={payment.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-bold">{payment.paymentNumber}</span>
                            <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass(payment.status)}`}>{label(payment.status)}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{payment.provider} · {payment.providerTransactionId}</p>
                          <p className="mt-1 text-[11px] text-slate-400">{label(payment.purpose)} · verified {new Date(payment.verifiedAt).toLocaleString()}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/60">
                          <div><span className="text-[10px] uppercase text-slate-400">Amount</span><p className="font-bold text-emerald-600">{formatMoney(payment.amount, payment.currency)}</p></div>
                          <div><span className="text-[10px] uppercase text-slate-400">Unallocated</span><p className={`font-bold ${money(payment.unallocatedAmount) > 0 ? "text-amber-600" : "text-slate-700 dark:text-slate-200"}`}>{formatMoney(payment.unallocatedAmount, payment.currency)}</p></div>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          {money(payment.unallocatedAmount) > 0 && hasPermission("payment.allocate") && (
                            <button onClick={() => { setSelectedPayment(payment); setPaymentAmount(String(money(payment.unallocatedAmount))); setActionMode("ALLOCATE"); }} className="rounded-lg bg-blue-700 px-3 py-2 text-[11px] font-bold text-white">Allocate</button>
                          )}
                          {refundable > 0 && hasPermission("refund.create") && (
                            <button onClick={() => { setSelectedPayment(payment); setPaymentAmount(String(refundable)); setActionMode("REFUND"); }} className="rounded-lg border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700 dark:border-rose-900">Refund</button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === "DEPOSITS" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Deposit liabilities</h3>
            <div className="space-y-2">
              {deposits.length === 0 ? <EmptyState text="No recorded deposit positions." /> : deposits.map((deposit) => (
                <div key={deposit.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass(deposit.status)}`}>{label(deposit.status)}</span>
                      <p className="mt-2 text-xs font-semibold">Rental {deposit.rentalId}</p>
                      <p className="mt-1 text-[11px] text-slate-400">Customer {customers.find((c) => c.id === deposit.customerId)?.fullName || deposit.customerId}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-bold">{formatMoney(deposit.heldAmount, deposit.currency)} held</p>
                      <p className="text-[11px] text-slate-400">{formatMoney(deposit.appliedAmount, deposit.currency)} applied</p>
                    </div>
                  </div>
                  {money(deposit.heldAmount) > 0 && hasPermission("deposit.apply") && outstandingInvoices.length > 0 && (
                    <button onClick={() => { setSelectedDeposit(deposit); setPaymentAmount(String(money(deposit.heldAmount))); setActionMode("APPLY_DEPOSIT"); }} className="mt-3 rounded-lg border border-blue-200 px-3 py-2 text-[11px] font-semibold text-blue-700 dark:border-blue-900">Apply to invoice</button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-5">
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Refund liabilities</h3>
              <div className="space-y-2">
                {refundObligations.length === 0 ? <EmptyState text="No refund obligations." /> : refundObligations.map((refund) => (
                  <div key={refund.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3">
                      <div><span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass(refund.status)}`}>{label(refund.status)}</span><p className="mt-2 text-xs">{refund.reason}</p></div>
                      <strong className="text-xs">{formatMoney(refund.amount, refund.currency)}</strong>
                    </div>
                    {refund.status === "PENDING" && hasPermission("refund.execute") && (
                      <button disabled={submitting} onClick={() => void handleApproveObligation(refund)} className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-bold text-white dark:bg-white dark:text-slate-900">Approve liability</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Provider refunds</h3>
              <div className="space-y-2">
                {refunds.length === 0 ? <EmptyState text="No payment refund transactions." /> : refunds.map((refund) => (
                  <div key={refund.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3">
                      <div><span className="font-mono text-xs font-bold">{refund.refundNumber}</span><p className="mt-1 text-[11px] text-slate-400">{refund.reason}</p></div>
                      <div className="text-right"><span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass(refund.status)}`}>{label(refund.status)}</span><p className="mt-1 text-xs font-bold">{formatMoney(refund.amount, refund.currency)}</p></div>
                    </div>
                    {refund.status === "PENDING" && hasPermission("refund.execute") && (
                      <button disabled={submitting} onClick={() => void handleApproveRefund(refund)} className="mt-3 rounded-lg bg-rose-700 px-3 py-2 text-[11px] font-bold text-white">Approve & execute</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === "EXPENSES" && (
        <div className="space-y-3">
          {hasPermission("expense.create") && (
            <button onClick={() => setActionMode("CREATE_EXPENSE")} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white dark:bg-white dark:text-slate-950"><Plus className="h-3.5 w-3.5" /> Record expense</button>
          )}
          {expenses.length === 0 ? <EmptyState text="No operating expenses found." /> : expenses.map((expense) => (
            <div key={expense.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="flex items-center gap-2"><span className="font-mono text-xs font-bold">{expense.expenseNumber}</span><span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass(expense.status)}`}>{label(expense.status)}</span></div>
                  <p className="mt-1 text-xs font-semibold">{expense.description}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{label(expense.category)} · {expense.payeeName || "No payee"} · {expense.expenseDate}</p>
                </div>
                <div className="text-right">
                  <strong className="text-sm">{formatMoney(expense.grossAmount, expense.currency)}</strong>
                  <div className="mt-2 flex justify-end gap-2">
                    {expense.status === "DRAFT" && hasPermission("expense.submit") && <button disabled={submitting} onClick={() => void handleExpenseAction(expense, "SUBMIT")} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold dark:border-slate-700">Submit</button>}
                    {expense.status === "SUBMITTED" && hasPermission("expense.approve") && <button disabled={submitting} onClick={() => void handleExpenseAction(expense, "APPROVE")} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white">Approve</button>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "RECONCILIATION" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div><p className="text-xs font-bold">Payment reconciliation</p><p className="mt-1 text-[11px] text-slate-400">Find stale attempts, unallocated verified money, duplicate provider references and other exceptions.</p></div>
            {hasPermission("payment.reconciliation.run") && <button disabled={submitting} onClick={() => void handleReconciliationScan()} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white dark:bg-white dark:text-slate-950">Run scan</button>}
          </div>
          {reconciliation.length === 0 ? <EmptyState text="No unresolved payment reconciliation issues." /> : reconciliation.map((issue) => (
            <div key={issue.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><div className="flex items-center gap-2"><span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass(issue.severity)}`}>{issue.severity}</span><strong className="text-xs">{label(issue.issueType)}</strong></div><p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{issue.description}</p><p className="mt-1 text-[10px] text-slate-400">{issue.entityType} · {issue.entityId}</p></div>
                {hasPermission("payment.reconciliation.resolve") && <button disabled={submitting} onClick={() => void handleResolveIssue(issue)} className="rounded-lg border border-amber-300 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:border-amber-800 dark:text-amber-300">Mark resolved</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "LEDGER" && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center gap-2"><Landmark className="h-4 w-4 text-slate-400" /><h3 className="text-xs font-bold">Chart of accounts</h3></div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ledgerAccounts.map((account: any) => (
                <div key={account.id} className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/60">
                  <div className="flex justify-between gap-2"><span className="font-mono font-bold text-slate-500">{account.accountCode || account.code}</span><span className="text-[10px] text-slate-400">{label(account.classification || account.type)}</span></div>
                  <p className="mt-1 font-semibold">{account.name}</p>
                  {account.balance !== undefined && <p className="mt-1 font-mono font-bold">{formatMoney(account.balance, account.currency)}</p>}
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Posted journals</h3>
            <div className="space-y-2">
              {journals.length === 0 ? <EmptyState text="No posted journals available." /> : journals.map((journal: any) => (
                <div key={journal.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-3"><div><span className="font-mono text-xs font-bold">{journal.journalNumber || journal.reference || journal.id}</span><p className="mt-1 text-[11px] text-slate-400">{journal.description || journal.memo || label(journal.sourceType)}</p></div><span className={`rounded px-2 py-0.5 text-[10px] font-bold ${statusClass(journal.status)}`}>{label(journal.status || "POSTED")}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {actionMode && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between">
              <div><h2 className="font-bold text-slate-950 dark:text-white">{label(actionMode)}</h2><p className="mt-1 text-xs text-slate-400">Server-authoritative finance operation.</p></div>
              <button onClick={resetModal} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>

            {actionMode === "GENERATE_INVOICE" && (
              <form onSubmit={handleGenerateInvoice} className="space-y-4">
                <label className="block text-xs font-semibold">Completed rental
                  <select required value={rentalId} onChange={(e) => setRentalId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                    <option value="">Select rental</option>
                    {completedRentals.map((r: Rental) => <option key={r.id} value={r.id}>{r.rentalNumber} · {customers.find((c) => c.id === r.customerId)?.fullName || r.customerId}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-semibold">Due date
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <p className="rounded-xl bg-blue-50 p-3 text-[11px] text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">Only an actually recorded held deposit can be applied. A deposit requirement alone is never treated as money received.</p>
                <SubmitButton busy={submitting} text="Generate authoritative invoice" />
              </form>
            )}

            {actionMode === "MANUAL_PAYMENT" && selectedInvoice && (
              <form onSubmit={handleManualPayment} className="space-y-3">
                <InvoiceContext invoice={selectedInvoice} />
                <Field label="Amount" value={paymentAmount} setValue={setPaymentAmount} type="number" required />
                <Field label="Bank / cash / receipt reference" value={paymentReference} setValue={setPaymentReference} required />
                <Field label="Payer reference" value={payerReference} setValue={setPayerReference} placeholder={selectedInvoice.billingSnapshot.customerName} />
                <p className="rounded-xl bg-emerald-50 p-3 text-[11px] text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">The Payment fact is created first, then allocated to this invoice. If allocation fails, money remains visible as unallocated rather than disappearing.</p>
                <SubmitButton busy={submitting} text="Record & allocate payment" />
              </form>
            )}

            {actionMode === "MPESA" && selectedInvoice && (
              <form onSubmit={handleMpesa} className="space-y-3">
                <InvoiceContext invoice={selectedInvoice} />
                <Field label="Amount" value={paymentAmount} setValue={setPaymentAmount} type="number" required />
                <Field label="Customer phone" value={mpesaPhone} setValue={setMpesaPhone} placeholder="+2547…" required />
                <p className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Starting STK does not mark the invoice paid. Provider verification creates the authoritative Payment; allocation then settles the invoice.</p>
                <SubmitButton busy={submitting} text="Initiate M-Pesa collection" />
              </form>
            )}

            {actionMode === "ALLOCATE" && selectedPayment && (
              <form onSubmit={handleAllocation} className="space-y-3">
                <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/60"><strong>{selectedPayment.paymentNumber}</strong><p className="mt-1 text-slate-400">{formatMoney(selectedPayment.unallocatedAmount, selectedPayment.currency)} unallocated</p></div>
                <label className="block text-xs font-semibold">Invoice
                  <select required value={allocationInvoiceId} onChange={(e) => setAllocationInvoiceId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                    <option value="">Select outstanding invoice</option>
                    {outstandingInvoices.filter((i) => i.currency === selectedPayment.currency).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · {formatMoney(invoice.amountOutstanding, invoice.currency)}</option>)}
                  </select>
                </label>
                <Field label="Amount to allocate" value={paymentAmount} setValue={setPaymentAmount} type="number" required />
                <SubmitButton busy={submitting} text="Allocate verified payment" />
              </form>
            )}

            {actionMode === "REFUND" && selectedPayment && (
              <form onSubmit={handleRefundRequest} className="space-y-3">
                <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/60"><strong>{selectedPayment.paymentNumber}</strong><p className="mt-1 text-slate-400">Original verified payment {formatMoney(selectedPayment.amount, selectedPayment.currency)}</p></div>
                <Field label="Refund amount" value={paymentAmount} setValue={setPaymentAmount} type="number" required />
                <label className="block text-xs font-semibold">Reason<textarea required rows={3} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
                <p className="rounded-xl bg-rose-50 p-3 text-[11px] text-rose-800 dark:bg-rose-950/30 dark:text-rose-300">Creating a refund request does not disburse money. Execution requires separate refund approval authority.</p>
                <SubmitButton busy={submitting} text="Request refund" />
              </form>
            )}

            {actionMode === "APPLY_DEPOSIT" && selectedDeposit && (
              <form onSubmit={handleApplyDeposit} className="space-y-3">
                <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/60"><strong>{formatMoney(selectedDeposit.heldAmount, selectedDeposit.currency)} held</strong><p className="mt-1 text-slate-400">Rental {selectedDeposit.rentalId}</p></div>
                <label className="block text-xs font-semibold">Invoice
                  <select required value={depositInvoiceId} onChange={(e) => setDepositInvoiceId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                    <option value="">Select invoice</option>
                    {outstandingInvoices.filter((i) => i.customerId === selectedDeposit.customerId && i.currency === selectedDeposit.currency).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · {formatMoney(invoice.amountOutstanding, invoice.currency)}</option>)}
                  </select>
                </label>
                <Field label="Amount to apply" value={paymentAmount} setValue={setPaymentAmount} type="number" required />
                <SubmitButton busy={submitting} text="Apply held deposit" />
              </form>
            )}

            {actionMode === "CREATE_EXPENSE" && (
              <form onSubmit={handleCreateExpense} className="space-y-3">
                <label className="block text-xs font-semibold">Category
                  <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                    {["MAINTENANCE","FUEL","CLEANING","PARKING","TOLL","INSURANCE","LICENSING","OFFICE","DRIVER","MARKETING","OTHER"].map((c) => <option key={c} value={c}>{label(c)}</option>)}
                  </select>
                </label>
                <Field label="Description" value={expenseDescription} setValue={setExpenseDescription} required />
                <Field label="Payee" value={expensePayee} setValue={setExpensePayee} />
                <div className="grid grid-cols-2 gap-3"><Field label="Net amount" value={expenseAmount} setValue={setExpenseAmount} type="number" required /><Field label="Tax amount" value={expenseTax} setValue={setExpenseTax} type="number" /></div>
                <SubmitButton busy={submitting} text="Create expense draft" />
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">{text}</div>
);

const Field: React.FC<{
  label: string;
  value: string;
  setValue: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}> = ({ label: fieldLabel, value, setValue, type = "text", placeholder, required }) => (
  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">{fieldLabel}
    <input type={type} required={required} value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
  </label>
);

const SubmitButton: React.FC<{ busy: boolean; text: string }> = ({ busy, text }) => (
  <button disabled={busy} className="w-full rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50 dark:bg-white dark:text-slate-950">{busy ? "Processing…" : text}</button>
);

const InvoiceContext: React.FC<{ invoice: OperationalInvoice }> = ({ invoice }) => (
  <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/60">
    <strong>{invoice.invoiceNumber}</strong>
    <p className="mt-1 text-slate-400">{invoice.billingSnapshot.customerName} · {invoice.currency} {money(invoice.amountOutstanding).toLocaleString()} outstanding</p>
  </div>
);
