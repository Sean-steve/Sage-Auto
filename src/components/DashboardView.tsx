// ============================================================================
// CAR HIRE OS — TENANT EXECUTIVE DASHBOARD VIEW (Sprint 34: UX-004, DOM-003)
// Backend-driven metrics, authoritative GL trial balance verification & reports hub
// ============================================================================

import React, { useState, useEffect } from "react";
import {
  Car,
  CalendarCheck,
  KeyRound,
  TrendingUp,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ArrowUpRight,
  ArrowRight,
  CheckCircle2,
  Wrench,
  Radio,
  FileCheck,
  ChevronRight,
  Receipt,
  UserCheck,
  FileSpreadsheet,
  RefreshCw,
  Sliders,
  DollarSign,
  TrendingDown,
  Minus,
  Sparkles,
  Activity,
  Layers,
} from "lucide-react";
import { useApp } from "../lib/store";
import type {
  TenantDashboardOverviewDto,
  PeriodPreset,
} from "@carhire/types";
import { ReportsHubModal } from "./analytics/ReportsHubModal";
import { apiClient } from "../lib/api-client";

export const DashboardView: React.FC = () => {
  const {
    activeTenant,
    restoration,
    vehicles,
    bookings,
    rentals,
    complianceDocs,
    maintenance,
    payments,
    outboxEvents,
    isAuthenticated,
    setCurrentView,
    setSelectedBookingId,
    setSelectedVehicleId,
    setIsNewBookingOpen,
    setIsInspectionModalOpen,
    activeTenantId,
  } = useApp();

  // Filters & State
  const [preset, setPreset] = useState<PeriodPreset>("THIS_MONTH");
  const [currency, setCurrency] = useState<string>(activeTenant?.currency || "KES");
  const [overview, setOverview] = useState<TenantDashboardOverviewDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isReportsHubOpen, setIsReportsHubOpen] = useState<boolean>(false);

  // Fetch backend dashboard overview
  const fetchDashboardData = async () => {
    if (restoration || !isAuthenticated) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        preset,
        currency,
        timezone: "Africa/Nairobi",
      });
      const res = await apiClient.analytics.getDashboard(Object.fromEntries(params));
      if (!res.error && res.data) {
        setOverview(res.data as TenantDashboardOverviewDto);
      }
    } catch (err) {
      console.warn("Backend analytics API unavailable, calculating from store state", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [preset, currency, activeTenantId, isAuthenticated]);

  useEffect(() => {
    setCurrency(activeTenant?.currency || "KES");
  }, [activeTenant?.id, activeTenant?.currency]);

  // Fallback calculations from client store if backend call hasn't resolved
  const tenantVehicles = (vehicles || []).filter((v) => v.tenantId === activeTenantId);
  const tenantBookings = (bookings || []).filter((b) => b.tenantId === activeTenantId);
  const tenantRentals = (rentals || []).filter((r) => r.tenantId === activeTenantId);
  const tenantPayments = (payments || []).filter((p) => p.tenantId === activeTenantId);
  const tenantCompliance = (complianceDocs || []).filter((c) => c.tenantId === activeTenantId);
  const tenantOutbox = (outboxEvents || []).filter((e) => e.tenantId === activeTenantId);

  const fallbackTotalVehicles = tenantVehicles.length;
  const fallbackAvailable = tenantVehicles.filter((v) => v.availabilityStatus === "AVAILABLE").length;
  const fallbackOnRent = tenantVehicles.filter((v) => v.availabilityStatus === "ON_RENT").length;
  const fallbackReserved = tenantVehicles.filter((v) => v.availabilityStatus === "RESERVED").length;
  const fallbackMaint = tenantVehicles.filter((v) => v.availabilityStatus === "MAINTENANCE").length;
  const fallbackUtil = fallbackTotalVehicles > 0 ? Math.round((fallbackOnRent / fallbackTotalVehicles) * 100) : 0;
  const fallbackRevenue = tenantPayments.reduce((acc, curr) => acc + curr.amount, 0);

  // Authoritative metrics from backend overview (with fallback)
  const utilizationRate = overview?.headlineKpis.utilizationRate.value ?? fallbackUtil;
  const utilizationDelta = overview?.headlineKpis.utilizationRate.changePercentage;

  const cashCollections = overview?.financialSummary.cashReceipts ?? fallbackRevenue;
  const postedRevenue = overview?.financialSummary.postedRevenue ?? fallbackRevenue;
  const activeRentalsCount = overview?.headlineKpis.activeRentals.value ?? tenantRentals.filter((r) => r.state === "ACTIVE_ON_ROAD").length;
  const availableVehiclesCount = overview?.fleetStatus.available ?? fallbackAvailable;
  const trialBalanceOk = overview?.financialSummary.trialBalanceReconciled;
  const pendingHandoverBookings = tenantBookings.filter((b) => b.status === "CONFIRMED");
  const urgentComplianceCount = overview?.headlineKpis.urgentComplianceCount.value ?? tenantCompliance.filter((c) => c.expiryState === "EXPIRING_SOON" || c.expiryState === "URGENT").length;

  return (
    <div id="dashboard-view" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner / Welcome with Control Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 rounded-2xl text-white shadow-lg border border-slate-700">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              OPERATIONAL HUB
            </span>
            <span className="text-xs text-slate-400">
              Saved workspace overview
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-600 flex items-center gap-1">
              <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
              {overview ? "LIVE METRICS" : isLoading ? "LOADING…" : "PARTIAL DATA"}
            </span>
          </div>
          <h1 className="text-2xl font-black mt-1 tracking-tight">{activeTenant.name}</h1>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            {activeTenant.tagline} • Serving {activeTenant.city}, {activeTenant.country}
          </p>
        </div>

        {/* Global Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Preset Selector */}
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as PeriodPreset)}
            className="px-3 py-2 bg-slate-800/90 hover:bg-slate-750 text-white font-medium rounded-xl text-xs border border-slate-600 focus:outline-hidden focus:border-emerald-500"
          >
            <option value="TODAY">Today</option>
            <option value="YESTERDAY">Yesterday</option>
            <option value="THIS_WEEK">This Week</option>
            <option value="LAST_WEEK">Last Week</option>
            <option value="THIS_MONTH">This Month</option>
            <option value="LAST_MONTH">Last Month</option>
            <option value="THIS_QUARTER">This Quarter</option>
            <option value="THIS_YEAR">This Year</option>
          </select>

          {/* Currency Selector */}
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="px-3 py-2 bg-slate-800/90 hover:bg-slate-750 text-white font-medium rounded-xl text-xs border border-slate-600 focus:outline-hidden focus:border-emerald-500"
          >
            <option value="KES">KES (KSh)</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
          </select>

          {/* Refresh button */}
          <button
            onClick={fetchDashboardData}
            title="Refresh authoritative metrics"
            className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl border border-slate-600 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
          </button>

          {/* Reports Hub Trigger */}
          <button
            onClick={() => setIsReportsHubOpen(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold rounded-xl text-xs border border-emerald-500/40 flex items-center gap-1.5 transition-all shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Reports Hub</span>
          </button>

          {/* Quick Dispatch */}
          <button
            onClick={() => setIsNewBookingOpen(true)}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md"
          >
            <span>+ Quick Dispatch</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Fleet Utilization */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Fleet Utilization</span>
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{utilizationRate}%</span>
              <span className="text-xs text-slate-500">
                ({overview?.fleetStatus.onRent ?? fallbackOnRent}/{overview?.fleetStatus.total ?? fallbackTotalVehicles} active)
              </span>
            </div>
          </div>
          <div className="mt-3">
            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Number(utilizationRate))}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">vs Prior Window:</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                {utilizationDelta !== null && utilizationDelta !== undefined ? (
                  <>
                    <ArrowUpRight className="w-3 h-3" />
                    <span>{utilizationDelta > 0 ? `+${utilizationDelta}%` : `${utilizationDelta}%`}</span>
                  </>
                ) : (
                  <span className="text-slate-400">N/A (baseline)</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* KPI 2: Verified Cash Receipts */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Verified Cash Receipts</span>
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {restoration && !overview ? "Not connected" : `${currency} ${Number(cashCollections).toLocaleString()}`}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">GL Posted Rev:</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {restoration && !overview ? "Not connected" : `${currency} ${Number(postedRevenue).toLocaleString()}`}
            </span>
          </div>
        </div>

        {/* KPI 3: Active Road Dispatches */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Active On-Road Rentals</span>
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600">
                <KeyRound className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">{restoration && !overview ? "—" : String(activeRentalsCount)}</span>
              <span className="text-xs text-slate-500">rentals dispatched</span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">Available on Lot:</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">
              {availableVehiclesCount} ready
            </span>
          </div>
        </div>

        {/* KPI 4: Financial Integrity & Compliance */}
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Audit & Compliance</span>
              <div
                className={`p-2 rounded-lg ${
                  trialBalanceOk ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600" : "bg-rose-50 text-rose-600"
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900 dark:text-white">
                {trialBalanceOk === undefined ? "Not verified" : trialBalanceOk ? "GL Balanced" : "Audit Alert"}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">Doc Expiries:</span>
            <span className={`font-bold ${Number(urgentComplianceCount) > 0 ? "text-amber-500" : "text-emerald-600"}`}>
              {!overview ? "Not verified" : Number(urgentComplianceCount) > 0 ? `${urgentComplianceCount} expiring` : "No urgent expiries reported"}
            </span>
          </div>
        </div>
      </div>

      {/* CRM Sales Velocity & Funnel Conversion Bar */}
      {overview?.crmFunnel && (
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-700">
            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-500" />
                Commercial CRM Pipeline & Sales Velocity
              </h2>
              <p className="text-xs text-slate-500">Inbound Leads to Confirmed Won Rentals</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Pipeline Value:</span>
              <span className="font-bold text-slate-900 dark:text-white font-mono">
                {currency} {overview.crmFunnel.pipelineValue.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 text-center">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-700/60">
              <span className="text-[10px] font-bold uppercase text-slate-400">Inbound Leads</span>
              <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{overview.crmFunnel.newLeads}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-700/60">
              <span className="text-[10px] font-bold uppercase text-slate-400">Qualified</span>
              <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{overview.crmFunnel.qualifiedLeads}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-700/60">
              <span className="text-[10px] font-bold uppercase text-slate-400">Quotes Sent</span>
              <p className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{overview.crmFunnel.quotesSent}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-700/60">
              <span className="text-[10px] font-bold uppercase text-slate-400">Accepted Quotes</span>
              <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{overview.crmFunnel.quotesAccepted}</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300">Conversion %</span>
              <p className="text-lg font-black text-emerald-700 dark:text-emerald-300 mt-0.5">{overview.crmFunnel.conversionRate}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Pending Operations & Fleet Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Action Queue & Fleet Matrix */}
        <div className="lg:col-span-2 space-y-6">
          {/* Confirmed Bookings Ready for Handover */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-emerald-600" />
                <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Ready for Digital Handover & Key Release
                </h2>
              </div>
              <button
                onClick={() => setCurrentView("bookings")}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
              >
                <span>View All Bookings</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-750 mt-2">
              {pendingHandoverBookings.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No confirmed bookings awaiting handover.
                </div>
              ) : (
                pendingHandoverBookings.slice(0, 3).map((b) => {
                  const v = tenantVehicles.find((veh) => veh.id === b.vehicleId);
                  return (
                    <div key={b.id} className="py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 font-mono text-xs font-bold">
                          {v?.registrationPlate || "CAR"}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 dark:text-slate-100">{b.bookingNumber}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded">
                              {((b.pricing || b.pricingSnapshot) as any)?.billableDays ?? ((b.pricing || b.pricingSnapshot) as any)?.totalDays ?? 1} Days
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {v?.make} {v?.model} • Pickup: {new Date(b.startDate || b.pickupAt || Date.now()).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedBookingId(b.id);
                            setCurrentView("bookings");
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium"
                        >
                          Details
                        </button>
                        <button
                          onClick={() => {
                            setIsInspectionModalOpen(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
                        >
                          Start OPS-001 Handover
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Active Fleet Breakdown Matrix */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Car className="w-4 h-4 text-emerald-600" />
                <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100">Fleet Availability Matrix</h2>
              </div>
              <button
                onClick={() => setCurrentView("fleet")}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
              >
                <span>Full Catalog</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Available
                </span>
                <p className="text-xl font-black text-emerald-900 dark:text-emerald-100 mt-1">
                  {overview?.fleetStatus.available ?? fallbackAvailable}
                </p>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Ready for instant hire</span>
              </div>
              <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  On Rent
                </span>
                <p className="text-xl font-black text-blue-900 dark:text-blue-100 mt-1">
                  {overview?.fleetStatus.onRent ?? fallbackOnRent}
                </p>
                <span className="text-[10px] text-blue-600 dark:text-blue-400">Active customer road trips</span>
              </div>
              <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                  Reserved
                </span>
                <p className="text-xl font-black text-purple-900 dark:text-purple-100 mt-1">
                  {overview?.fleetStatus.reserved ?? fallbackReserved}
                </p>
                <span className="text-[10px] text-purple-600 dark:text-purple-400">Deposit escrow confirmed</span>
              </div>
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Service / Hold
                </span>
                <p className="text-xl font-black text-amber-900 dark:text-amber-100 mt-1">
                  {overview?.fleetStatus.maintenance ?? fallbackMaint}
                </p>
                <span className="text-[10px] text-amber-600 dark:text-amber-400">Scheduled maintenance</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Live Domain Outbox Feed (BRS-002, DEV-010) */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs flex flex-col h-full">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
                <h2 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Transactional Outbox
                </h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                Event history
              </span>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto space-y-3 max-h-[420px] pr-1">
              {tenantOutbox.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">No event history is connected to this screen.</div>
              ) : (
                tenantOutbox.slice(0, 8).map((evt) => (
                  <div
                    key={evt.eventId}
                    className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-[11px]">
                        {evt.eventType}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(evt.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                      <span>Aggregate: {evt.aggregate.type}#{evt.aggregate.id.substring(0, 8)}</span>
                      <span className="text-[10px] font-mono bg-slate-200 dark:bg-slate-800 px-1 py-0.2 rounded">
                        v{evt.eventVersion}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 text-[11px] text-slate-500 text-center">
              Event delivery status is not verified here.
            </div>
          </div>
        </div>
      </div>

      {/* Reports Hub Modal */}
      <ReportsHubModal
        isOpen={isReportsHubOpen}
        onClose={() => setIsReportsHubOpen(false)}
        tenantId={activeTenantId}
        currency={currency}
      />
    </div>
  );
};

