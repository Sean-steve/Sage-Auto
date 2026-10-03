// ============================================================================
// CAR HIRE OS — PRICING & RATE ENGINE MANAGEMENT VIEW (DEV-006, DEV-007, BRS-001)
// Production Rate Plans, Seasonal Multipliers, Tiers, Fees, Promos & Instant Quote Calculator
// ============================================================================

import React, { useState, useMemo } from "react";
import {
  Tag,
  Plus,
  Search,
  Calendar,
  Layers,
  Sparkles,
  Percent,
  CheckCircle2,
  Clock,
  Car,
  AlertCircle,
  HelpCircle,
  Copy,
  ChevronRight,
  ShieldCheck,
  Zap,
  ArrowRight,
  DollarSign,
  Fuel,
  Users,
  MapPin,
  FileText,
  Sliders,
  Archive,
  RefreshCw,
} from "lucide-react";
import { useApp } from "../lib/store";
import {
  RatePlan,
  RatePlanRate,
  SeasonalRateRule,
  DurationTierRule,
  PricingFeeRule,
  PromoCode,
  PricingRequest,
  PricingResult,
  PricingSnapshot,
} from "../types";

export const PricingView: React.FC = () => {
  const { restoration } = useApp();
  const {
    activeTenant,
    activeTenantId,
    vehicles,
    customers,
    corporateAccounts,
    ratePlans = [],
    ratePlanRates = [],
    seasonalRules = [],
    durationTiers = [],
    pricingFees = [],
    promoCodes = [],
    createRatePlan,
    updateRatePlan,
    activateRatePlan,
    archiveRatePlan,
    saveRatePlanRates,
    createSeasonalRule,
    deleteSeasonalRule,
    createDurationTier,
    deleteDurationTier,
    createPricingFee,
    createPromoCode,
    togglePromoStatus,
    calculateInstantQuote,
    showNotification,
  } = useApp();

  const [activeTab, setActiveTab] = useState<
    "RATE_PLANS" | "SEASONAL_TIERS" | "FEES" | "PROMO_CODES" | "QUOTE_SIMULATOR"
  >("RATE_PLANS");

  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    ratePlans[0]?.id || "rp-standard-nairobi"
  );
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals state
  const [isNewPlanModalOpen, setIsNewPlanModalOpen] = useState(false);
  const [isNewSeasonModalOpen, setIsNewSeasonModalOpen] = useState(false);
  const [isNewTierModalOpen, setIsNewTierModalOpen] = useState(false);
  const [isNewFeeModalOpen, setIsNewFeeModalOpen] = useState(false);
  const [isNewPromoModalOpen, setIsNewPromoModalOpen] = useState(false);

  // New Plan Form State
  const [newPlanCode, setNewPlanCode] = useState("");
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanDesc, setNewPlanDesc] = useState("");
  const [newPlanCurrency, setNewPlanCurrency] = useState("KES");
  const [newPlanPriority, setNewPlanPriority] = useState(10);
  const [newPlanTaxInclusive, setNewPlanTaxInclusive] = useState(false);

  // Rate Matrix Edit Form State
  const selectedPlan = useMemo(
    () => ratePlans.find((p) => p.id === selectedPlanId) || ratePlans[0],
    [ratePlans, selectedPlanId]
  );

  const planRates = useMemo(
    () => ratePlanRates.filter((r) => r.ratePlanId === selectedPlan?.id),
    [ratePlanRates, selectedPlan]
  );

  const planSeasons = useMemo(
    () => seasonalRules.filter((s) => s.ratePlanId === selectedPlan?.id),
    [seasonalRules, selectedPlan]
  );

  const planTiers = useMemo(
    () => durationTiers.filter((t) => t.ratePlanId === selectedPlan?.id),
    [durationTiers, selectedPlan]
  );

  // Quote Simulator State
  const [simCategoryId, setSimCategoryId] = useState("cat-economy");
  const [simVehicleId, setSimVehicleId] = useState<string>("");
  const [simCorporateId, setSimCorporateId] = useState<string>("");
  const [simPickupDate, setSimPickupDate] = useState("2026-09-01T09:00");
  const [simReturnDate, setSimReturnDate] = useState("2026-09-05T10:00");
  const [simDriverAge, setSimDriverAge] = useState<number>(30);
  const [simAdditionalDrivers, setSimAdditionalDrivers] = useState<number>(0);
  const [simDriverService, setSimDriverService] = useState<boolean>(false);
  const [simDelivery, setSimDelivery] = useState<boolean>(false);
  const [simDeliveryKm, setSimDeliveryKm] = useState<number>(15);
  const [simCollection, setSimCollection] = useState<boolean>(false);
  const [simCollectionKm, setSimCollectionKm] = useState<number>(15);
  const [simSelectedFees, setSimSelectedFees] = useState<string[]>([]);
  const [simPromoCode, setSimPromoCode] = useState<string>("");
  const [simManualDiscPercent, setSimManualDiscPercent] = useState<number>(0);

  // Calculate live quote
  const liveQuoteResult = useMemo<PricingResult | null>(() => {
    if (!calculateInstantQuote) return null;
    try {
      return calculateInstantQuote({
        vehicleCategoryId: simCategoryId,
        vehicleId: simVehicleId || undefined,
        corporateAccountId: simCorporateId || undefined,
        pickupDateTime: new Date(simPickupDate).toISOString(),
        returnDateTime: new Date(simReturnDate).toISOString(),
        primaryDriverAge: simDriverAge,
        additionalDriversCount: simAdditionalDrivers,
        driverServiceRequested: simDriverService,
        deliveryRequested: simDelivery,
        deliveryDistanceKm: simDelivery ? simDeliveryKm : undefined,
        collectionRequested: simCollection,
        collectionDistanceKm: simCollection ? simCollectionKm : undefined,
        selectedFeeCodes: simSelectedFees,
        promoCode: simPromoCode.trim() || undefined,
        manualDiscountPercent: simManualDiscPercent > 0 ? simManualDiscPercent : undefined,
        currency: "KES",
      });
    } catch (err: any) {
      return null;
    }
  }, [
    calculateInstantQuote,
    simCategoryId,
    simVehicleId,
    simCorporateId,
    simPickupDate,
    simReturnDate,
    simDriverAge,
    simAdditionalDrivers,
    simDriverService,
    simDelivery,
    simDeliveryKm,
    simCollection,
    simCollectionKm,
    simSelectedFees,
    simPromoCode,
    simManualDiscPercent,
  ]);

  const handleCreatePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanCode.trim() || !newPlanName.trim()) {
      showNotification("Please provide a valid code and name", "error");
      return;
    }

    const created = createRatePlan({
      code: newPlanCode.trim().toUpperCase(),
      name: newPlanName.trim(),
      description: newPlanDesc.trim(),
      currency: newPlanCurrency,
      priority: Number(newPlanPriority),
      taxInclusive: newPlanTaxInclusive,
      isDefault: false,
    });

    setSelectedPlanId(created.id);
    setIsNewPlanModalOpen(false);
    setNewPlanCode("");
    setNewPlanName("");
    setNewPlanDesc("");
    showNotification(`Rate plan ${created.code} created successfully`, "success");
  };

  const copySnapshotJson = () => {
    if (!liveQuoteResult?.pricingSnapshot) return;
    navigator.clipboard.writeText(JSON.stringify(liveQuoteResult.pricingSnapshot, null, 2));
    showNotification("Immutable Pricing Snapshot copied to clipboard", "success");
  };

  return (
    <div id="pricing-rate-engine-view" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Pricing & Rate Engine
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sprint 11 • Deterministic Money Math • Category Rates • Seasonal Multipliers • Dynamic Quotations
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="open-quote-simulator-btn"
            onClick={() => setActiveTab("QUOTE_SIMULATOR")}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
          >
            <Zap className="w-4 h-4 text-emerald-200" />
            <span>Instant Quote Workbench</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto pb-px">
        <button
          id="tab-rate-plans"
          onClick={() => setActiveTab("RATE_PLANS")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "RATE_PLANS"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Rate Plans & Matrices</span>
          <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {ratePlans.length}
          </span>
        </button>

        <button
          id="tab-seasonal-tiers"
          onClick={() => setActiveTab("SEASONAL_TIERS")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "SEASONAL_TIERS"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Seasonal & Duration Rules</span>
          <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {seasonalRules.length + durationTiers.length}
          </span>
        </button>

        <button
          id="tab-fees"
          onClick={() => setActiveTab("FEES")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "FEES"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Ancillary Fees & Add-ons</span>
          <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {pricingFees.length}
          </span>
        </button>

        <button
          id="tab-promo-codes"
          onClick={() => setActiveTab("PROMO_CODES")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "PROMO_CODES"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Percent className="w-4 h-4" />
          <span>Promotions & Coupons</span>
          <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {promoCodes.length}
          </span>
        </button>

        <button
          id="tab-quote-simulator"
          onClick={() => setActiveTab("QUOTE_SIMULATOR")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "QUOTE_SIMULATOR"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          <Zap className="w-4 h-4 text-emerald-500" />
          <span>Instant Quote Simulator</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. RATE PLANS & MATRICES TAB                                              */}
      {/* ========================================================================= */}
      {activeTab === "RATE_PLANS" && (
        <div className="space-y-6">
          {/* Rate Plan Selector Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Select Rate Plan:
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {ratePlans.map((plan) => (
                  <button
                    key={plan.id}
                    id={`select-plan-${plan.id}`}
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-2 ${
                      selectedPlan?.id === plan.id
                        ? "bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-500/80 dark:text-emerald-300 shadow-sm"
                        : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    <span>{plan.name}</span>
                    {plan.isDefault && (
                      <span className="px-1.5 py-0.2 bg-emerald-200/80 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-[10px] rounded uppercase font-bold">
                        Default
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">v{plan.version}</span>
                  </button>
                ))}
              </div>
            </div>

            <button disabled={restoration} aria-describedby="restoration-actions-note"
              id="create-new-rate-plan-btn"
              onClick={() => setIsNewPlanModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 shadow-sm transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Rate Plan</span>
            </button>
          </div>

          {/* Rate Plan Details Card */}
          {selectedPlan && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {selectedPlan.name}
                    </h2>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {selectedPlan.code}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                        selectedPlan.status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {selectedPlan.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {selectedPlan.description || "Configured rate rules and mileage matrix"} • Priority:{" "}
                    {selectedPlan.priority} • Currency: {selectedPlan.currency} • Version: {selectedPlan.version}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {selectedPlan.status === "ACTIVE" ? (
                    <button disabled={restoration} aria-describedby="restoration-actions-note"
                      id="archive-plan-btn"
                      onClick={() => {
                        archiveRatePlan(selectedPlan.id);
                        showNotification(`Plan ${selectedPlan.code} archived`, "info");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <Archive className="w-3.5 h-3.5 text-slate-400" />
                      <span>Archive</span>
                    </button>
                  ) : (
                    <button disabled={restoration} aria-describedby="restoration-actions-note"
                      id="activate-plan-btn"
                      onClick={() => {
                        activateRatePlan(selectedPlan.id);
                        showNotification(`Plan ${selectedPlan.code} activated`, "success");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Activate</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Category Rate Matrix */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Car className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Category Pricing Matrix</span>
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Amounts in {selectedPlan.currency} (excl. VAT unless specified)
                  </span>
                </div>

                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Category / Vehicle</th>
                        <th className="px-3 py-3 text-right">Daily Rate</th>
                        <th className="px-3 py-3 text-right">Weekend Rate</th>
                        <th className="px-3 py-3 text-right">Weekly Rate/Day</th>
                        <th className="px-3 py-3 text-right">Monthly Rate/Day</th>
                        <th className="px-3 py-3">Mileage Allowance</th>
                        <th className="px-3 py-3 text-right">Excess /Km</th>
                        <th className="px-4 py-3 text-right">Security Deposit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {planRates.length > 0 ? (
                        planRates.map((rate) => (
                          <tr
                            key={rate.id}
                            className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                          >
                            <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                              {rate.vehicleCategoryId === "cat-economy" && "Economy Sedans (Axio / Fit)"}
                              {rate.vehicleCategoryId === "cat-suv" && "Offroad 4x4 SUVs (Prado / Fortuner)"}
                              {rate.vehicleCategoryId === "cat-luxury" && "Executive Luxury (Mercedes / Land Cruiser)"}
                              {!rate.vehicleCategoryId && (rate.vehicleId ? `Vehicle #${rate.vehicleId}` : "All Fleet")}
                            </td>
                            <td className="px-3 py-3 text-right font-mono font-bold text-slate-900 dark:text-emerald-400">
                              {rate.dailyRate.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-slate-700 dark:text-slate-300">
                              {rate.weekendDailyRate ? rate.weekendDailyRate.toLocaleString() : "—"}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-slate-700 dark:text-slate-300">
                              {rate.weeklyDailyRate ? rate.weeklyDailyRate.toLocaleString() : "—"}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-slate-700 dark:text-slate-300">
                              {rate.monthlyDailyRate ? rate.monthlyDailyRate.toLocaleString() : "—"}
                            </td>
                            <td className="px-3 py-3 text-slate-600 dark:text-slate-300">
                              {rate.mileageAllowanceModel === "UNLIMITED" ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                                  <Sparkles className="w-3 h-3" /> Unlimited
                                </span>
                              ) : (
                                <span>{rate.includedKmPerDay || 200} km / day</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-slate-600 dark:text-slate-400">
                              {rate.excessKmRate ? `${rate.excessKmRate}` : "0"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-slate-900 dark:text-slate-200">
                              {rate.depositAmount.toLocaleString()}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                            No category rates configured for this plan.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SEASONAL RULES & DURATION TIERS TAB                                    */}
      {/* ========================================================================= */}
      {activeTab === "SEASONAL_TIERS" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Seasonal Surcharges */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Seasonal High-Demand Rules</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Peak-season percentage multipliers applied day-by-day
                </p>
              </div>
              <button disabled={restoration} aria-describedby="restoration-actions-note"
                id="create-season-btn"
                onClick={() => setIsNewSeasonModalOpen(true)}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-100"
              >
                + Add Rule
              </button>
            </div>

            <div className="space-y-3">
              {seasonalRules.map((season) => (
                <div
                  key={season.id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {season.name}
                      </span>
                      <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        x{season.multiplier} ({((season.multiplier - 1) * 100).toFixed(0)}% surcharge)
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                      <span>
                        {season.startDate} to {season.endDate}
                      </span>
                      <span>•</span>
                      <span>Priority: {season.priority}</span>
                    </div>
                  </div>

                  <button disabled={restoration} aria-describedby="restoration-actions-note"
                    onClick={() => {
                      deleteSeasonalRule(season.id);
                      showNotification("Seasonal rule removed", "info");
                    }}
                    className="text-xs text-rose-600 hover:text-rose-700 px-2 py-1"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Duration Tiers */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Duration Tiers & Long-Term Discounts</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Automatic tier-based discounts based on billable days
                </p>
              </div>
              <button disabled={restoration} aria-describedby="restoration-actions-note"
                id="create-tier-btn"
                onClick={() => setIsNewTierModalOpen(true)}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-100"
              >
                + Add Tier
              </button>
            </div>

            <div className="space-y-3">
              {durationTiers.map((tier) => (
                <div
                  key={tier.id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        {tier.minDays} – {tier.maxDays} Days
                      </span>
                      {tier.discountPercent && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                          {tier.discountPercent}% OFF
                        </span>
                      )}
                      {tier.customDailyRate && (
                        <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                          Fixed: KES {tier.customDailyRate.toLocaleString()}/day
                        </span>
                      )}
                    </div>
                  </div>

                  <button disabled={restoration} aria-describedby="restoration-actions-note"
                    onClick={() => {
                      deleteDurationTier(tier.id);
                      showNotification("Duration tier deleted", "info");
                    }}
                    className="text-xs text-rose-600 hover:text-rose-700 px-2 py-1"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ANCILLARY FEES & ADD-ONS TAB                                           */}
      {/* ========================================================================= */}
      {activeTab === "FEES" && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Ancillary Fee & Add-On Catalog</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Itemized add-ons, driver surcharges, GPS, Child Seats, and CDW waivers
              </p>
            </div>
            <button disabled={restoration} aria-describedby="restoration-actions-note"
              id="create-fee-btn"
              onClick={() => setIsNewFeeModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
            >
              + Create Fee Rule
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pricingFees.map((fee) => (
              <div
                key={fee.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 space-y-2 hover:border-emerald-500/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">{fee.name}</h4>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/60 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {fee.code}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-mono font-bold text-slate-900 dark:text-emerald-400">
                      KES {fee.amount.toLocaleString()}
                    </span>
                    <p className="text-[10px] text-slate-400">{fee.calculationType}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span>Type: {fee.feeType}</span>
                  <span className={fee.isTaxable ? "text-slate-600" : "text-amber-600"}>
                    {fee.isTaxable ? "Taxable (16% VAT)" : "Tax Exempt"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. PROMOTIONS & PROMO CODES TAB                                           */}
      {/* ========================================================================= */}
      {activeTab === "PROMO_CODES" && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Percent className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Promotional Discount Codes</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Managed coupon codes, usage quotas, minimum spend and expiration gates
              </p>
            </div>
            <button disabled={restoration} aria-describedby="restoration-actions-note"
              id="create-promo-btn"
              onClick={() => setIsNewPromoModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
            >
              + Create Promo Code
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {promoCodes.map((promo) => (
              <div
                key={promo.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-400/40">
                      {promo.code}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        promo.status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                          : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {promo.status}
                    </span>
                  </div>

                  <div className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    {promo.discountType === "PERCENTAGE"
                      ? `${promo.discountValue}% OFF`
                      : `KES ${promo.discountValue.toLocaleString()} OFF`}
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {promo.description || "General promotion code"}
                </p>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div>
                    <span>Min Days: </span>
                    <strong className="text-slate-700 dark:text-slate-300">
                      {promo.minRentalDays ? `${promo.minRentalDays} days` : "None"}
                    </strong>
                  </div>
                  <div>
                    <span>Min Subtotal: </span>
                    <strong className="text-slate-700 dark:text-slate-300">
                      {promo.minSubtotalAmount ? `KES ${promo.minSubtotalAmount.toLocaleString()}` : "None"}
                    </strong>
                  </div>
                  <div>
                    <span>Usage: </span>
                    <strong className="text-slate-700 dark:text-slate-300">
                      {promo.usageCount} / {promo.usageLimit || "∞"}
                    </strong>
                  </div>
                  <div>
                    <span>Expires: </span>
                    <strong className="text-slate-700 dark:text-slate-300">
                      {promo.validTo ? new Date(promo.validTo).toLocaleDateString() : "Never"}
                    </strong>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button disabled={restoration} aria-describedby="restoration-actions-note"
                    onClick={() => {
                      togglePromoStatus(promo.id);
                      showNotification(`Promo code ${promo.code} status updated`, "info");
                    }}
                    className="text-xs text-slate-600 dark:text-slate-400 hover:underline"
                  >
                    Toggle Status
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. INSTANT QUOTE WORKBENCH & SIMULATOR TAB                                 */}
      {/* ========================================================================= */}
      {activeTab === "QUOTE_SIMULATOR" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Inputs Column */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Quotation Parameters</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Adjust pickup dates, add-ons, driver age and corporate discounts
              </p>
            </div>

            <div className="space-y-3">
              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Vehicle Category
                </label>
                <select
                  id="sim-category-select"
                  value={simCategoryId}
                  onChange={(e) => setSimCategoryId(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2.5"
                >
                  <option value="cat-economy">Economy Sedans (Axio, Fit, Premio)</option>
                  <option value="cat-suv">Offroad 4x4 SUVs (Prado, Fortuner, Safari Land Cruiser)</option>
                  <option value="cat-luxury">Executive Luxury (Mercedes E-Class, V-Class)</option>
                </select>
              </div>

              {/* Date / Time */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Pickup Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={simPickupDate}
                    onChange={(e) => setSimPickupDate(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Return Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={simReturnDate}
                    onChange={(e) => setSimReturnDate(e.target.value)}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2"
                  />
                </div>
              </div>

              {/* Corporate Partner Override */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Corporate Account (Optional)
                </label>
                <select
                  value={simCorporateId}
                  onChange={(e) => setSimCorporateId(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2"
                >
                  <option value="">None (Standard Retail Customer)</option>
                  {corporateAccounts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.discountRatePercent || 0}% Negotiated Discount)
                    </option>
                  ))}
                </select>
              </div>

              {/* Driver & Delivery Options */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Primary Driver Age
                  </label>
                  <input
                    type="number"
                    min="18"
                    max="90"
                    value={simDriverAge}
                    onChange={(e) => setSimDriverAge(Number(e.target.value))}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Additional Drivers
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="4"
                    value={simAdditionalDrivers}
                    onChange={(e) => setSimAdditionalDrivers(Number(e.target.value))}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2 pt-1 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simDriverService}
                    onChange={(e) => setSimDriverService(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Chauffeur / Dedicated Professional Driver (+3,500/day)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={simDelivery}
                    onChange={(e) => setSimDelivery(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Delivery to Hotel / Airport (+1,500 base + 50/km)</span>
                </label>
              </div>

              {/* Promo Code & Discounts */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Promo Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SAFARI15"
                    value={simPromoCode}
                    onChange={(e) => setSimPromoCode(e.target.value.toUpperCase())}
                    className="w-full text-xs uppercase font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Manual Discount %
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={simManualDiscPercent}
                    onChange={(e) => setSimManualDiscPercent(Number(e.target.value))}
                    className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white p-2"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Live Calculation Output Column */}
          <div className="lg:col-span-7 space-y-4">
            {liveQuoteResult ? (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-5">
                {/* Big Total Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-4 rounded-xl border border-emerald-500/20">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Deterministic Rental Quote
                    </span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-3xl font-bold font-mono text-slate-900 dark:text-white">
                        {liveQuoteResult.currency} {liveQuoteResult.grossRentalTotal.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        ({liveQuoteResult.taxCalculation.isTaxInclusive ? "VAT Included" : "+ 16% VAT Inc."})
                      </span>
                    </div>
                  </div>

                  <div className="text-right space-y-1">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {liveQuoteResult.rentalDuration.billableDays} Billable Day(s)
                    </span>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      {liveQuoteResult.rentalDuration.totalHours} Total Hours
                    </p>
                  </div>
                </div>

                {/* Day-by-Day Rate Breakdown */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Day-by-Day Rate Computation
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {liveQuoteResult.dayBreakdown.map((day, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{day.date}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                              {day.dayType}
                            </span>
                          </div>
                          {day.seasonalMultiplier > 1 && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                              Seasonal Peak x{day.seasonalMultiplier}
                            </span>
                          )}
                        </div>
                        <span className="font-mono font-bold text-slate-900 dark:text-emerald-400">
                          KES {day.effectiveRate.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Itemized Calculation Summary */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Price Breakdown
                  </h4>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-slate-700 dark:text-slate-300">
                      <span>Base Rental Subtotal ({liveQuoteResult.rentalDuration.billableDays} days)</span>
                      <span className="font-mono font-semibold">
                        KES {liveQuoteResult.baseRentalAmount.toLocaleString()}
                      </span>
                    </div>

                    {liveQuoteResult.driverCharges.totalDriverCharges > 0 && (
                      <div className="flex justify-between text-slate-700 dark:text-slate-300">
                        <span>Driver & Chauffeur Charges</span>
                        <span className="font-mono">
                          KES {liveQuoteResult.driverCharges.totalDriverCharges.toLocaleString()}
                        </span>
                      </div>
                    )}

                    {liveQuoteResult.locationCharges.totalLocationCharges > 0 && (
                      <div className="flex justify-between text-slate-700 dark:text-slate-300">
                        <span>Delivery & Collection Services</span>
                        <span className="font-mono">
                          KES {liveQuoteResult.locationCharges.totalLocationCharges.toLocaleString()}
                        </span>
                      </div>
                    )}

                    {liveQuoteResult.totalDiscount > 0 && (
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                        <span>Applied Discounts ({liveQuoteResult.appliedDiscounts.map((d) => d.description).join(", ")})</span>
                        <span className="font-mono">- KES {liveQuoteResult.totalDiscount.toLocaleString()}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-slate-700 dark:text-slate-300 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span>Net Subtotal (Before Tax)</span>
                      <span className="font-mono font-semibold">
                        KES {liveQuoteResult.taxCalculation.taxableAmount.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-500 dark:text-slate-400">
                      <span>VAT Tax ({liveQuoteResult.taxCalculation.taxRatePercent}%)</span>
                      <span className="font-mono">
                        KES {liveQuoteResult.taxCalculation.taxAmount.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between text-slate-900 dark:text-white font-bold text-sm pt-2 border-t border-slate-200 dark:border-slate-800">
                      <span>Gross Total Due</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400">
                        KES {liveQuoteResult.grossRentalTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Deposit & Mileage Snapshot Box */}
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[11px]">
                      Refundable Security Deposit:
                    </span>
                    <strong className="text-slate-900 dark:text-white font-mono">
                      KES {liveQuoteResult.securityDeposit.amount.toLocaleString()} ({liveQuoteResult.securityDeposit.model})
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400 block text-[11px]">
                      Mileage Allowance:
                    </span>
                    <strong className="text-slate-900 dark:text-white">
                      {liveQuoteResult.mileageAllowance.model === "UNLIMITED"
                        ? "Unlimited Kilometres"
                        : `${liveQuoteResult.mileageAllowance.includedKm} km included (Excess: KES ${liveQuoteResult.mileageAllowance.excessKmRate}/km)`}
                    </strong>
                  </div>
                </div>

                {/* Copy Snapshot Button & Trace */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] text-slate-400 font-mono">
                    Snapshot ID: {liveQuoteResult.pricingSnapshot.snapshotId.slice(0, 16)}...
                  </span>
                  <button disabled={restoration} aria-describedby="restoration-actions-note"
                    id="copy-pricing-snapshot-btn"
                    onClick={copySnapshotJson}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Immutable Snapshot JSON</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-500">
                <AlertCircle className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                <p className="text-sm font-semibold">Enter valid rental dates to calculate instant price</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE RATE PLAN                                                   */}
      {/* ========================================================================= */}
      {isNewPlanModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Create New Rate Plan
            </h3>
            <form onSubmitCapture={restoration ? e => {e.preventDefault();e.stopPropagation();} : undefined} onSubmit={handleCreatePlan} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Plan Code (Unique)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SUMMER_PROMO_2026"
                  value={newPlanCode}
                  onChange={(e) => setNewPlanCode(e.target.value.toUpperCase())}
                  className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Plan Display Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Summer Holiday Special"
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Details regarding eligibility and seasonal application"
                  value={newPlanDesc}
                  onChange={(e) => setNewPlanDesc(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Currency
                  </label>
                  <input
                    type="text"
                    value={newPlanCurrency}
                    onChange={(e) => setNewPlanCurrency(e.target.value.toUpperCase())}
                    className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Priority (Higher Wins)
                  </label>
                  <input
                    type="number"
                    value={newPlanPriority}
                    onChange={(e) => setNewPlanPriority(Number(e.target.value))}
                    className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button disabled={restoration} aria-describedby="restoration-actions-note"
                  type="button"
                  onClick={() => setIsNewPlanModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button disabled={restoration} aria-describedby="restoration-actions-note"
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 shadow-sm"
                >
                  Create Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
