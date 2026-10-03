import React, { useState } from "react";
import {
  KeyRound,
  Plus,
  Car,
  User,
  Clock,
  Gauge,
  Fuel,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
} from "lucide-react";
import { useApp } from "../lib/store";
import { Rental, RentalState } from "../types";

export const RentalsView: React.FC = () => {
  const { restoration } = useApp();
  const {
    rentals,
    vehicles,
    customers,
    bookings,
    activeTenant,
    activeTenantId,
    startRental,
    completeRental,
    extendRental,
    recordRentalIncident,
    setSelectedRentalId,
    setIsInspectionModalOpen,
    setInspectionTarget,
    setCurrentView,
    searchQuery,
  } = useApp();

  const [stateFilter, setStateFilter] = useState<string>("ALL");

  const tenantRentals = rentals.filter((r) => r.tenantId === activeTenantId);
  const tenantVehicles = vehicles.filter((v) => v.tenantId === activeTenantId);
  const tenantCustomers = customers.filter((c) => c.tenantId === activeTenantId);

  const filteredRentals = tenantRentals.filter((r) => {
    if (stateFilter !== "ALL" && r.state !== stateFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const v = tenantVehicles.find((veh) => veh.id === r.vehicleId);
      const c = tenantCustomers.find((cust) => cust.id === r.customerId);
      return (
        r.rentalNumber.toLowerCase().includes(q) ||
        v?.registrationPlate.toLowerCase().includes(q) ||
        c?.fullName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getRentalStateBadge = (state: RentalState) => {
    switch (state) {
      case "SCHEDULED_HANDOVER":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">HANDOVER PENDING</span>;
      case "ACTIVE_ON_ROAD":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">ACTIVE ON ROAD</span>;
      case "RETURN_INSPECTION_PENDING":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">RETURN INSPECTION</span>;
      case "FINAL_SETTLEMENT_PENDING":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">SETTLEMENT PENDING</span>;
      case "COMPLETED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">COMPLETED</span>;
      case "OVERDUE":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">OVERDUE</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">{state}</span>;
    }
  };

  return (
    <div id="rentals-view" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Active Operational Rentals</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {tenantRentals.length} Operational Records
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Physical vehicle dispatches, checkout/return fuel and odometer audits, trip extensions, and incident tracking.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {["ALL", "ACTIVE_ON_ROAD", "SCHEDULED_HANDOVER", "COMPLETED"].map((st) => (
          <button
            key={st}
            onClick={() => setStateFilter(st)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              stateFilter === st
                ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
            }`}
          >
            <span>{st.replace(/_/g, " ")}</span>
          </button>
        ))}
      </div>

      {/* Rentals List */}
      <div className="space-y-4">
        {filteredRentals.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-400 text-xs">
            No active operational rentals found.
          </div>
        ) : (
          filteredRentals.map((r) => {
            const v = tenantVehicles.find((veh) => veh.id === r.vehicleId);
            const c = tenantCustomers.find((cust) => cust.id === r.customerId);
            const b = bookings.find((book) => book.id === r.bookingId);

            return (
              <div
                key={r.id}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-5"
              >
                {/* Left: Info */}
                <div className="space-y-2 max-w-md">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">
                      {r.rentalNumber}
                    </span>
                    {getRentalStateBadge(r.state)}
                    <span className="text-[11px] font-mono text-slate-400">
                      Ref Booking: {b?.bookingNumber}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <Car className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="font-semibold">{v?.registrationPlate} ({v?.model})</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <User className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span className="font-semibold">{c?.fullName}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5" />
                      <span>Checkout: {r.checkoutOdometer.toLocaleString()} km</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Fuel className="w-3.5 h-3.5" />
                      <span>Fuel: {r.checkoutFuelLevel}%</span>
                    </div>
                  </div>
                </div>

                {/* Center: Incidents & Extensions */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 text-xs space-y-1 min-w-[220px]">
                  <div className="flex justify-between text-slate-500">
                    <span>Scheduled Return:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {new Date(r.scheduledEnd).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Logged Incidents:</span>
                    <span className="font-semibold">{(r.incidents || []).length}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Extensions:</span>
                    <span className="font-semibold">{(r.extensions || []).length}</span>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
                  {r.state === "SCHEDULED_HANDOVER" && (
                    <button disabled={restoration} aria-describedby="restoration-actions-note"
                      onClick={() => startRental(r.id)}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Confirm Key Handover</span>
                    </button>
                  )}

                  {r.state === "ACTIVE_ON_ROAD" && (
                    <>
                      <button disabled={restoration} aria-describedby="restoration-actions-note"
                        onClick={() => {
                          const returnKm = prompt("Enter final return odometer reading (km):", `${r.checkoutOdometer + 450}`);
                          const returnFuel = prompt("Enter return fuel level (0-100%):", "100");
                          if (returnKm && returnFuel) {
                            completeRental(r.id, parseInt(returnKm, 10), parseInt(returnFuel, 10));
                          }
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                        <span>Process Vehicle Return</span>
                      </button>

                      <button disabled={restoration} aria-describedby="restoration-actions-note"
                        onClick={() => {
                          const days = prompt("Enter additional days to extend:", "2");
                          if (days) {
                            const addDays = parseInt(days, 10);
                            const newEnd = new Date(new Date(r.scheduledEnd).getTime() + addDays * 86400000).toISOString();
                            const rate = v?.dailyRate || 10000;
                            extendRental(r.id, newEnd, addDays, rate * addDays);
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold"
                      >
                        + Extend Trip
                      </button>

                      <button disabled={restoration} aria-describedby="restoration-actions-note"
                        onClick={() => {
                          const desc = prompt("Enter incident description (Traffic fine, scratch, etc.):", "Minor parking ticket in Nairobi CBD");
                          if (desc) {
                            recordRentalIncident(r.id, {
                              rentalId: r.id,
                              type: "TRAFFIC_FINE",
                              description: desc,
                              location: "Nairobi CBD",
                              reportedAt: new Date().toISOString(),
                              estimatedCost: 3000,
                              resolved: false,
                            });
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 text-rose-700 dark:hover:bg-rose-950/40 text-xs font-medium"
                      >
                        Log Incident
                      </button>
                    </>
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
