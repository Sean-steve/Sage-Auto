import React, { useState } from "react";
import {
  Car,
  Plus,
  Filter,
  Search,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Fuel,
  Gauge,
  Calendar,
  Users,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Info,
} from "lucide-react";
import { useApp } from "../lib/store";
import { Vehicle, VehicleCategory, VehicleAvailabilityStatus } from "../types";

export const FleetView: React.FC = () => {
  const {
    vehicles,
    vehicleOwners,
    vehicleOwnerships,
    activeTenant,
    activePlan,
    activeTenantId,
    setIsNewVehicleOpen,
    setSelectedVehicleId,
    checkEntitlement,
    searchQuery,
    restoration,
  } = useApp();

  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const tenantVehicles = vehicles.filter((v) => v.tenantId === activeTenantId);
  const entitlementDecision = checkEntitlement("fleet.vehicle.create");

  const filteredVehicles = tenantVehicles.filter((v) => {
    if (categoryFilter !== "ALL" && v.category !== categoryFilter) return false;
    if (statusFilter !== "ALL" && v.availabilityStatus !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        v.registrationPlate.toLowerCase().includes(q) ||
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        (v.vin||'').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getStatusBadge = (status: VehicleAvailabilityStatus) => {
    switch (status) {
      case "AVAILABLE":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">AVAILABLE</span>;
      case "ON_RENT":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">ON RENT</span>;
      case "RESERVED":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">RESERVED</span>;
      case "MAINTENANCE":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">MAINTENANCE</span>;
      case "BLOCKED":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">BLOCKED</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">{status}</span>;
    }
  };

  return (
    <div id="fleet-view" className="p-6 max-w-7xl mx-auto space-y-6">
      {filteredVehicles.length === 0 && <p role="status">No saved vehicles match your filters.</p>}
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Fleet Asset Inventory</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {tenantVehicles.length} / {activePlan?.maxVehicles ?? '—'} Allocated
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Vehicle lifecycle, live availability telemetry, ownership split, and roadworthiness records.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!entitlementDecision.allowed && (
            <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{restoration ? "Vehicle registration is awaiting saved-data verification." : `Plan limit (${entitlementDecision.limit} vehicles) reached`}</span>
            </div>
          )}
          <button
            id="register-vehicle-btn"
            disabled={restoration}
            onClick={() => setIsNewVehicleOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Register Vehicle</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          {["ALL", "SUV", "4x4 Offroad", "Luxury", "Sedan", "Van/Bus"].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                categoryFilter === cat
                  ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                  : "bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1 bg-slate-100 dark:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg border-0 outline-none"
          >
            <option value="ALL">All Operational Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="ON_RENT">On Rent</option>
            <option value="RESERVED">Reserved</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>
        </div>
      </div>

      {/* Vehicle Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredVehicles.map((v) => {
          const owner = vehicleOwners.find((o) => o.id === v.ownerId);
          const ownership = vehicleOwnerships.find((own) => own.vehicleId === v.id && own.isActive);

          return (
            <div
              key={v.id}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                {/* Vehicle Image & Plate Header */}
                <div className="relative h-44 w-full bg-slate-900 overflow-hidden group">
                  <img
                    src={v.imageUrl}
                    alt={`${v.make} ${v.model}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
                  
                  {/* Plate Badge */}
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-black/70 backdrop-blur-md border border-white/20 text-white font-mono font-bold text-xs tracking-wider">
                    {v.registrationPlate}
                  </div>

                  {/* Status Badge */}
                  <div className="absolute top-3 right-3">
                    {getStatusBadge(v.availabilityStatus)}
                  </div>

                  {/* Vehicle Name & Year */}
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                      {v.category} • {v.year}
                    </span>
                    <h3 className="text-base font-bold truncate">{v.make} {v.model}</h3>
                  </div>
                </div>

                {/* Body Specs */}
                <div className="p-4 space-y-3">
                  <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 text-[11px] text-slate-600 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-slate-400" />
                      <span>{v.odometer.toLocaleString()} km</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Fuel className="w-3.5 h-3.5 text-slate-400" />
                      <span>{v.fuelLevel}% Fuel</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{v.seats} Seats</span>
                    </div>
                  </div>

                  {/* Owner & Revenue Agreement */}
                  <div className="text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                      <span>Ownership Pool:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[150px]">
                        {owner?.name || "Internal Company Pool"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                      <span>Revenue Split:</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        {ownership ? `${ownership.revenueSharePercent}% Owner / ${100 - ownership.revenueSharePercent}% Operator` : "100% Operator"}
                      </span>
                    </div>
                  </div>

                  {/* Features Chips */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(v.features || []).slice(0, 3).map((f) => (
                      <span
                        key={f}
                        className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300 rounded-md font-medium"
                      >
                        {f}
                      </span>
                    ))}
                    {(v.features || []).length > 3 && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-750 text-slate-400 rounded-md">
                        +{(v.features || []).length - 3}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Footer: Pricing & Action */}
              <div className="p-4 pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">Daily Rate</span>
                  <p className="text-sm font-extrabold text-slate-900 dark:text-white font-mono">
                    {activeTenant.currencySymbol} {v.dailyRate.toLocaleString()}
                  </p>
                </div>

                <button
                  disabled={restoration} aria-describedby="restoration-actions-note"
                  onClick={() => setSelectedVehicleId(v.id)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-650 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <span>Asset Profile</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
