import React, { useState } from "react";
import {
  Users,
  Plus,
  Car,
  FileSpreadsheet,
  Building2,
  Phone,
  Mail,
  CreditCard,
  ChevronRight,
  TrendingUp,
  Percent,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "../lib/store";
import { VehicleOwner, OwnershipType } from "../types";

export const VehicleOwnersView: React.FC = () => {
  const { restoration } = useApp();
  const {
    vehicleOwners,
    vehicleOwnerships,
    vehicles,
    activeTenant,
    activeTenantId,
    setIsNewOwnerOpen,
    setSelectedOwnerId,
    calculateOwnerSettlement,
    setCurrentView,
  } = useApp();

  const tenantOwners = vehicleOwners.filter((o) => o.tenantId === activeTenantId);
  const tenantVehicles = vehicles.filter((v) => v.tenantId === activeTenantId);

  return (
    <div id="vehicle-owners-view" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Vehicle Owners & Revenue Agreements</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {tenantOwners.length} Registered
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Asset investor contracts, time-bounded revenue-sharing agreements, allowable expense deductions, and disbursement ledgers.
          </p>
        </div>

        <button disabled={restoration} aria-describedby="restoration-actions-note"
          onClick={() => setIsNewOwnerOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Add Vehicle Owner</span>
        </button>
      </div>

      {/* Owners Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {tenantOwners.map((owner) => {
          const ownedVehicles = tenantVehicles.filter((v) => v.ownerId === owner.id);
          const ownershipRecords = vehicleOwnerships.filter((own) => own.ownerId === owner.id && own.isActive);
          const primaryAgreement = ownershipRecords[0];

          return (
            <div
              key={owner.id}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs flex flex-col justify-between"
            >
              <div className="space-y-3">
                {/* Header: Name and Status */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-sm">
                      {owner.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{owner.name}</h3>
                      {owner.companyName && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{owner.companyName}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {owner.status}
                  </span>
                </div>

                {/* Contact & ID */}
                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate">{owner.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{owner.phone}</span>
                  </div>
                  {owner.payoutBank && (
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                      <span className="truncate">{owner.payoutBank} (Acc: {owner.payoutAccountNumber})</span>
                    </div>
                  )}
                </div>

                {/* Agreement Terms Box */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/70 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Contract Agreement
                    </span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {primaryAgreement ? `${primaryAgreement.revenueSharePercent}% Revenue Split` : "100% Retained"}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 italic">
                    {primaryAgreement?.termsSnapshot || "Standard company fleet terms."}
                  </p>
                </div>

                {/* Attached Vehicles Chips */}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Attached Asset Vehicles ({ownedVehicles.length})
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {ownedVehicles.length === 0 ? (
                      <span className="text-xs text-slate-400">No vehicles assigned</span>
                    ) : (
                      ownedVehicles.map((v) => (
                        <span
                          key={v.id}
                          className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-750 text-slate-700 dark:text-slate-300 font-mono text-[11px] font-semibold border border-slate-200 dark:border-slate-700"
                        >
                          {v.registrationPlate} ({v.model})
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <button disabled={restoration} aria-describedby="restoration-actions-note"
                  onClick={() => {
                    const now = new Date();
                    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
                    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
                    calculateOwnerSettlement(owner.id, startOfMonth, endOfMonth);
                    setCurrentView("settlements");
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100 transition-colors flex items-center gap-1"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Generate Statement</span>
                </button>

                <button disabled={restoration} aria-describedby="restoration-actions-note"
                  onClick={() => setSelectedOwnerId(owner.id)}
                  className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium"
                >
                  Manage Terms
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
