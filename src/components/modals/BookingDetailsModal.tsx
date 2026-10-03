import React, { useState } from "react";
import {
  X,
  CalendarCheck,
  Car,
  User,
  Clock,
  Receipt,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileCheck,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Key,
  Ban,
  Calendar,
  History,
  Tag,
  DollarSign,
  Layers,
} from "lucide-react";
import { useApp } from "../../lib/store";
import { BookingStatus } from "../../types";

export const BookingDetailsModal: React.FC = () => {
  const {
    selectedBookingId,
    setSelectedBookingId,
    bookings,
    vehicles,
    customers,
    drivers,
    activeTenant,
    activeTenantId,
    confirmBooking,
    cancelBooking,
    rejectBooking,
    rescheduleBooking,
    substituteVehicle,
    createRentalFromBooking,
    setIsMpesaModalOpen,
    setMpesaTargetBooking,
  } = useApp();

  const [activeTab, setActiveTab] = useState<"overview" | "readiness" | "allocation" | "timeline">("overview");
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [subVehicleId, setSubVehicleId] = useState("");
  const [subReason, setSubReason] = useState("");

  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");

  if (!selectedBookingId) return null;

  const b = bookings.find((book) => book.id === selectedBookingId && book.tenantId === activeTenantId);
  if (!b) return null;

  const v = vehicles.find((veh) => veh.id === (b.assignedVehicleId || b.vehicleId));
  const c = customers.find((cust) => cust.id === b.customerId);
  const d = drivers.find((drv) => drv.id === (b.primaryDriverId || b.driverId));
  const tenantVehicles = vehicles.filter((veh) => veh.tenantId === activeTenantId && veh.id !== v?.id);

  // Evaluate Handover Readiness
  const isCustomerEligible = c && c.status !== "BLOCKED";
  const isDriverEligible = !b.primaryDriverId || (d && d.status !== "BLACKLISTED");
  const isVehicleOperable = v && v.lifecycleStatus !== "RETIRED" && v.lifecycleStatus !== "SOLD";
  const isDepositSecured = b.depositStatus === "HELD" || (b.depositRequired || 0) === 0 || b.depositStatus === "NOT_REQUIRED";
  const isStatusConfirmed = b.status === "CONFIRMED";
  const isHandoverReady = isStatusConfirmed && isCustomerEligible && isDriverEligible && isVehicleOperable;

  const handleSubstituteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subVehicleId || !subReason.trim()) return;
    const ok = substituteVehicle(b.id, subVehicleId, subReason.trim());
    if (ok) {
      setIsSubModalOpen(false);
      setSubVehicleId("");
      setSubReason("");
    }
  };

  const handleRescheduleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStartDate || !newEndDate) return;
    const ok = rescheduleBooking(b.id, newStartDate, newEndDate);
    if (ok) {
      setIsRescheduleOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-850">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base text-slate-900 dark:text-white">
                  Booking Dossier #{b.bookingNumber}
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                  {b.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Source: {b.source} • Version {b.version || 1} • Snapshot v{b.pricingSnapshotVersion || 1}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSelectedBookingId(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-750 px-6 bg-slate-50/30 dark:bg-slate-800/40 text-xs font-semibold gap-4">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "overview"
                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Overview & Pricing</span>
          </button>
          <button
            onClick={() => setActiveTab("readiness")}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "readiness"
                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Handover Readiness</span>
            {isHandoverReady ? (
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("allocation")}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "allocation"
                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            <Car className="w-3.5 h-3.5" />
            <span>Vehicle Allocation & Substitution</span>
          </button>
          <button
            onClick={() => setActiveTab("timeline")}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "timeline"
                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit & Status History</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
          {/* TAB 1: OVERVIEW & PRICING */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {/* Customer & Asset Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Primary Customer</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      {c?.customerType || "INDIVIDUAL"}
                    </span>
                  </div>
                  <p className="font-bold text-sm text-slate-900 dark:text-white">{c?.fullName || "Guest Customer"}</p>
                  <p className="text-slate-500">{c?.email || "No email"} • {c?.phone || "No phone"}</p>
                  <p className="text-slate-400 font-mono">ID / License: {c?.licenseNumber || c?.idOrPassportNumber || "N/A"}</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned Asset</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {v?.availabilityStatus || "RESERVED"}
                    </span>
                  </div>
                  <p className="font-bold text-sm text-slate-900 dark:text-white">
                    {v ? `${v.make} ${v.model} (${v.year})` : "Unassigned"}
                  </p>
                  <p className="text-slate-500 font-mono">Plate: {v?.registrationPlate || "Pending"}</p>
                  <p className="text-slate-400">Category: {v?.category || b.requestedVehicleCategoryId || "Standard"}</p>
                </div>
              </div>

              {/* Schedule & Routing */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Rental Window ({(b.pricing && ("billableDays" in b.pricing ? b.pricing.billableDays : b.pricing.totalDays)) || 1} Billable Days)
                  </span>
                  <button
                    onClick={() => {
                      setNewStartDate(b.pickupAt || b.startDate || "");
                      setNewEndDate(b.returnAt || b.endDate || "");
                      setIsRescheduleOpen(true);
                    }}
                    className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                  >
                    Amend Dates
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <span className="text-[11px] text-slate-400">Pick-up Station & Time:</span>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {new Date(b.pickupAt || b.startDate || Date.now()).toLocaleString()}
                    </p>
                    <p className="text-slate-500">{b.pickupLocationName || b.pickupLocation || "Main Station"}</p>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400">Return Station & Time:</span>
                    <p className="font-bold text-slate-900 dark:text-white">
                      {new Date(b.returnAt || b.endDate || Date.now()).toLocaleString()}
                    </p>
                    <p className="text-slate-500">{b.returnLocationName || b.returnLocation || "Main Station"}</p>
                  </div>
                </div>
              </div>

              {/* Frozen Pricing Snapshot (BRS-004) */}
              <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-200 dark:border-slate-750">
                  <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Immutable Pricing Snapshot (v{b.pricingSnapshotVersion || 1})</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Snapshot ID: {(b.pricing as any)?.snapshotId || (b.pricingSnapshot as any)?.snapshotId || "SYS-SNAP-01"}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Base Hire Subtotal:</span>
                    <span>{activeTenant.currencySymbol} {(b.netRentalSubtotal ?? b.pricing?.baseRentalAmount ?? b.pricing?.baseRental ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Collision Damage Waiver (CDW):</span>
                    <span>{activeTenant.currencySymbol} {(b.pricing?.insuranceCdw ?? b.pricing?.insuranceAmount ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Security Deposit Escrow:</span>
                    <span>{activeTenant.currencySymbol} {(b.depositRequired ?? (typeof b.pricing?.securityDeposit === "object" ? b.pricing?.securityDeposit.amount : b.pricing?.securityDeposit || 0)).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>Tax Amount ({b.pricing?.tax?.taxRatePercent ?? 16}%):</span>
                    <span>{activeTenant.currencySymbol} {(b.taxAmount ?? b.pricing?.tax?.taxAmount ?? b.pricing?.vatAmount ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-extrabold text-sm text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
                    <span>Gross Rental Total:</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      {activeTenant.currencySymbol} {(b.grossTotal ?? b.pricing?.grossRentalTotal ?? b.pricing?.netPayable ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500 pt-1">
                    <span>Amount Paid to Date:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {activeTenant.currencySymbol} {(b.amountPaid || 0).toLocaleString()} ({b.paymentStatus || "UNPAID"})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HANDOVER READINESS */}
          {activeTab === "readiness" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    Sprint 14 Handover Verification Protocol
                  </span>
                  <span className={`px-2.5 py-1 rounded-full font-bold text-xs ${
                    isHandoverReady
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  }`}>
                    {isHandoverReady ? "READY FOR KEY DISPATCH" : "ACTION REQUIRED"}
                  </span>
                </div>
                <p className="text-slate-500 text-[11px]">
                  Authoritative multi-check protocol required prior to transitioning Booking reservation into an Active Executed Rental.
                </p>

                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      {isStatusConfirmed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                      )}
                      <span>Booking in CONFIRMED Status</span>
                    </div>
                    <span className="font-mono font-bold">{b.status}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      {isCustomerEligible ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                      )}
                      <span>Customer Identity & Clearance</span>
                    </div>
                    <span className="font-mono font-bold">{c?.status || "VERIFIED"}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      {isDriverEligible ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                      )}
                      <span>Driver License Verification</span>
                    </div>
                    <span className="font-mono font-bold">{d ? d.status : "CUSTOMER_IS_DRIVER"}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      {isVehicleOperable ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                      )}
                      <span>Asset Operability & Fleet Clearance</span>
                    </div>
                    <span className="font-mono font-bold">{v?.lifecycleStatus || "OPERATIONAL"}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      {isDepositSecured ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                      )}
                      <span>Security Deposit Status</span>
                    </div>
                    <span className="font-mono font-bold">{b.depositStatus || "REQUESTED"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: VEHICLE ALLOCATION & SUBSTITUTION */}
          {activeTab === "allocation" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    Assigned Vehicle: {v ? `${v.registrationPlate} (${v.make} ${v.model})` : "Unassigned"}
                  </span>
                  <button
                    onClick={() => setIsSubModalOpen(true)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Substitute Asset</span>
                  </button>
                </div>

                <div className="text-xs text-slate-500 space-y-1">
                  <p>Allocation Hold ID: <span className="font-mono text-slate-700 dark:text-slate-300">{b.allocationId || "AUTO-ALLOC-EXCLUSIVE"}</span></p>
                  <p>Guaranteed Interval: <span className="font-mono text-slate-700 dark:text-slate-300">{new Date(b.pickupAt || b.startDate || Date.now()).toLocaleDateString()} → {new Date(b.returnAt || b.endDate || Date.now()).toLocaleDateString()}</span></p>
                </div>

                {/* Substitution History */}
                <div className="pt-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Substitution Audit Records ({b.substitutions?.length || 0})
                  </span>
                  {(!b.substitutions || b.substitutions.length === 0) ? (
                    <div className="p-3 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px]">
                      No vehicle substitutions recorded for this booking.
                    </div>
                  ) : (
                    b.substitutions.map((sub, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] space-y-1">
                        <div className="flex justify-between font-mono font-bold">
                          <span>{sub.originalVehicleId} → {sub.replacementVehicleId}</span>
                          <span className="text-slate-400">{new Date(sub.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-slate-500">Reason: {sub.reason}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT & STATUS TIMELINE */}
          {activeTab === "timeline" && (
            <div className="space-y-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Canonical State Machine Transitions & Audit Log
              </span>
              {(!b.statusHistory || b.statusHistory.length === 0) ? (
                <div className="p-4 text-center text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px]">
                  No status transition records found.
                </div>
              ) : (
                <div className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-4 space-y-4 py-2">
                  {b.statusHistory.map((hist, idx) => (
                    <div key={idx} className="relative pl-6">
                      <span className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-emerald-600 border-2 border-white dark:border-slate-800"></span>
                      <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {hist.fromStatus ? `${hist.fromStatus} → ${hist.toStatus}` : hist.toStatus}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(hist.occurredAt || hist.timestamp || "").toLocaleString()}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300">{hist.reason}</p>
                        <p className="text-[10px] text-slate-400">Actor: {hist.actorName || hist.actorId || "System"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer / State Machine Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-850 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {(b.status === "QUOTED" || b.status === "AWAITING_PAYMENT" || b.status === "CONFIRMED") && (
              <button
                onClick={() => {
                  const reason = prompt("Enter cancellation reason for audit log:", "Customer requested cancellation");
                  if (reason) cancelBooking(b.id, reason);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 text-slate-600 dark:text-slate-300 text-xs font-medium"
              >
                Cancel Booking
              </button>
            )}

            {(b.status === "DRAFT" || b.status === "PENDING") && (
              <button
                onClick={() => {
                  const reason = prompt("Enter rejection reason for audit log:", "Compliance verification failed");
                  if (reason) rejectBooking(b.id, reason);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 text-slate-600 dark:text-slate-300 text-xs font-medium"
              >
                Reject Dossier
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {b.status === "QUOTED" && (
              <button
                onClick={() => confirmBooking(b.id)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs"
              >
                Confirm & Allocate Vehicle
              </button>
            )}

            {b.status === "CONFIRMED" && (
              <>
                <button
                  onClick={() => {
                    setMpesaTargetBooking(b);
                    setIsMpesaModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold border border-emerald-300 dark:border-emerald-800"
                >
                  Prompt M-Pesa STK
                </button>
                <button
                  onClick={() => {
                    const rental = createRentalFromBooking(b.id);
                    if (rental) {
                      setSelectedBookingId(null);
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs flex items-center gap-1.5"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Dispatch Active Rental</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Vehicle Substitution Nested Modal */}
        {isSubModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-white dark:bg-slate-850 p-6 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-700 space-y-4 shadow-2xl">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-600" />
                <span>Vehicle Substitution (DOM-003)</span>
              </h3>
              <p className="text-xs text-slate-500">
                Replace current allocated asset with another operational vehicle in fleet.
              </p>

              <form onSubmit={handleSubstituteSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Select Replacement Vehicle:</label>
                  <select
                    value={subVehicleId}
                    onChange={(e) => setSubVehicleId(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="">-- Choose replacement asset --</option>
                    {tenantVehicles.map((veh) => (
                      <option key={veh.id} value={veh.id}>
                        {veh.registrationPlate} — {veh.make} {veh.model} ({veh.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Audit Substitution Reason:</label>
                  <input
                    type="text"
                    value={subReason}
                    onChange={(e) => setSubReason(e.target.value)}
                    placeholder="e.g. Scheduled workshop inspection, upgrade"
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsSubModalOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                  >
                    Confirm Substitution
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Reschedule Dates Nested Modal */}
        {isRescheduleOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-white dark:bg-slate-850 p-6 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-700 space-y-4 shadow-2xl">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>Amend Booking Dates</span>
              </h3>

              <form onSubmit={handleRescheduleSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold block mb-1">Pick-up Date:</label>
                  <input
                    type="datetime-local"
                    value={newStartDate.substring(0, 16)}
                    onChange={(e) => setNewStartDate(new Date(e.target.value).toISOString())}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="font-semibold block mb-1">Return Date:</label>
                  <input
                    type="datetime-local"
                    value={newEndDate.substring(0, 16)}
                    onChange={(e) => setNewEndDate(new Date(e.target.value).toISOString())}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRescheduleOpen(false)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  >
                    Save & Re-allocate
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
