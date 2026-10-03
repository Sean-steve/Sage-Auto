import React, { useState } from "react";
import {
  CalendarCheck,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Car,
  User,
  Phone,
  CreditCard,
  ChevronRight,
  RefreshCw,
  Key,
} from "lucide-react";
import { useApp } from "../lib/store";
import { Booking, BookingStatus } from "../types";

export const BookingsView: React.FC = () => {
  const {
    bookings,
    vehicles,
    customers,
    activeTenant,
    activeTenantId,
    setIsNewBookingOpen,
    setSelectedBookingId,
    confirmBooking,
    cancelBooking,
    rejectBooking,
    createRentalFromBooking,
    setIsMpesaModalOpen,
    setMpesaTargetBooking,
    setCurrentView,
    searchQuery,
    restoration,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const tenantBookings = (bookings || []).filter((b) => b.tenantId === activeTenantId);
  const tenantVehicles = (vehicles || []).filter((v) => v.tenantId === activeTenantId);
  const tenantCustomers = (customers || []).filter((c) => c.tenantId === activeTenantId);

  const filteredBookings = tenantBookings.filter((b) => {
    if (statusFilter !== "ALL" && b.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const v = tenantVehicles.find((veh) => veh.id === b.vehicleId);
      const c = tenantCustomers.find((cust) => cust.id === b.customerId);
      return (
        b.bookingNumber.toLowerCase().includes(q) ||
        v?.registrationPlate.toLowerCase().includes(q) ||
        c?.fullName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getStatusBadge = (status: BookingStatus) => {
    switch (status) {
      case "DRAFT":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-750 dark:text-slate-300">DRAFT</span>;
      case "QUOTED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">QUOTED</span>;
      case "AWAITING_PAYMENT":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">AWAITING PAYMENT</span>;
      case "CONFIRMED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">CONFIRMED</span>;
      case "ACTIVE":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300">ACTIVE ON ROAD</span>;
      case "COMPLETED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300">COMPLETED</span>;
      case "CANCELLED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">CANCELLED</span>;
      case "REJECTED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-800">REJECTED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  return (
    <div id="bookings-view" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Booking Reservations & State Machine</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {tenantBookings.length} Dossiers
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Full lifecycle quote engine, frozen pricing snapshots, vehicle substitutions, and deposit escrow handling.
          </p>
        </div>

        <button disabled={restoration} aria-describedby="restoration-actions-note"
          id="new-booking-btn"
          onClick={() => setIsNewBookingOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Create Quote / Booking</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {["ALL", "CONFIRMED", "ACTIVE", "QUOTED", "COMPLETED", "CANCELLED"].map((st) => {
          const count = st === "ALL" ? tenantBookings.length : tenantBookings.filter((b) => b.status === st).length;
          return (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                statusFilter === st
                  ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
              }`}
            >
              <span>{st}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bookings List Table / Cards */}
      <div className="space-y-4">
        {filteredBookings.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-400 text-xs">
            No bookings found matching selected status or search filter.
          </div>
        ) : (
          filteredBookings.map((b) => {
            const v = tenantVehicles.find((veh) => veh.id === b.vehicleId);
            const c = tenantCustomers.find((cust) => cust.id === b.customerId);

            return (
              <div
                key={b.id}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs hover:shadow-md transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-5"
              >
                {/* Left: Booking & Customer Info */}
                <div className="space-y-2 max-w-md">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">
                      {b.bookingNumber}
                    </span>
                    {getStatusBadge(b.status)}
                    <span className="text-[11px] text-slate-400 font-mono">
                      Source: {b.source}
                    </span>
                  </div>

                  {/* Vehicle & Customer Links */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <Car className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span className="font-semibold truncate">
                        {v ? `${v.registrationPlate} (${v.make} ${v.model})` : "Vehicle Unassigned"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <User className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span className="font-semibold truncate">{c?.fullName || "Guest Customer"}</span>
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {new Date(b.startDate || b.pickupAt || Date.now()).toLocaleDateString()} → {new Date(b.endDate || b.returnAt || Date.now()).toLocaleDateString()}
                    </span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      ({((b.pricing || b.pricingSnapshot) as any)?.billableDays ?? ((b.pricing || b.pricingSnapshot) as any)?.totalDays ?? 1} Days)
                    </span>
                  </div>
                </div>

                {/* Center: Frozen Pricing Snapshot */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 text-xs space-y-1 min-w-[220px]">
                  <div className="flex justify-between text-slate-500">
                    <span>Base Hire:</span>
                    <span>{activeTenant.currencySymbol} {(((b.pricing || b.pricingSnapshot) as any)?.baseRentalAmount ?? ((b.pricing || b.pricingSnapshot) as any)?.baseRental ?? b.netRentalSubtotal ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Deposit Escrow:</span>
                    <span>{activeTenant.currencySymbol} {(typeof ((b.pricing || b.pricingSnapshot) as any)?.securityDeposit === "object" ? ((b.pricing || b.pricingSnapshot) as any)?.securityDeposit?.amount : ((b.pricing || b.pricingSnapshot) as any)?.securityDeposit ?? b.depositRequired ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
                    <span>Net Payable:</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      {activeTenant.currencySymbol} {(((b.pricing || b.pricingSnapshot) as any)?.grossRentalTotal ?? ((b.pricing || b.pricingSnapshot) as any)?.netPayable ?? b.grossTotal ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Paid to Date:</span>
                    <span className="font-mono">{activeTenant.currencySymbol} {(b.amountPaid || 0).toLocaleString()}</span>
                  </div>
                </div>

                {/* Right: State Machine Actions */}
                <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
                  {b.status === "QUOTED" && (
                    <button disabled={restoration} aria-describedby="restoration-actions-note"
                      onClick={() => confirmBooking(b.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
                    >
                      Confirm Booking
                    </button>
                  )}

                  {b.status === "CONFIRMED" && (
                    <>
                      <button disabled={restoration} aria-describedby="restoration-actions-note"
                        onClick={async () => {
                          const rental = await createRentalFromBooking(b.id);
                          if (rental) {
                            setCurrentView("rentals");
                          }
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                      >
                        <Key className="w-3.5 h-3.5" />
                        <span>Dispatch Handover</span>
                      </button>

                      <button disabled={restoration} aria-describedby="restoration-actions-note"
                        onClick={() => {
                          setMpesaTargetBooking(b);
                          setIsMpesaModalOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold border border-emerald-300 dark:border-emerald-800"
                      >
                        M-Pesa STK Push
                      </button>
                    </>
                  )}

                  {(b.status === "CONFIRMED" || b.status === "QUOTED") && (
                    <button disabled={restoration} aria-describedby="restoration-actions-note"
                      onClick={() => {
                        const reason = prompt("Enter cancellation reason for audit log:", "Customer requested cancellation");
                        if (reason) cancelBooking(b.id, reason);
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 text-slate-600 dark:text-slate-300 text-xs font-medium"
                    >
                      Cancel
                    </button>
                  )}

                  <button disabled={restoration} aria-describedby="restoration-actions-note"
                    onClick={() => setSelectedBookingId(b.id)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium flex items-center gap-1"
                  >
                    <span>Audit Trail</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
