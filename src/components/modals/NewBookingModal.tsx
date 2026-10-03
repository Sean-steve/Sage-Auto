import React, { useState } from "react";
import { X, Calendar, Car, User, Shield, CreditCard, Sparkles, AlertTriangle } from "lucide-react";
import { useApp } from "../../lib/store";

export const NewBookingModal: React.FC = () => {
  const {
    isNewBookingOpen,
    setIsNewBookingOpen,
    vehicles,
    customers,
    activeTenant,
    activeTenantId,
    createBooking,
    checkVehicleAvailability,
    activeRateRules,
  } = useApp();

  const tenantVehicles = vehicles.filter((v) => v.tenantId === activeTenantId);
  const tenantCustomers = customers.filter((c) => c.tenantId === activeTenantId && c.status !== "BLOCKED");

  const [customerId, setCustomerId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0]
  );
  const [pickupLoc, setPickupLoc] = useState("Nairobi Headquarters");
  const [returnLoc, setReturnLoc] = useState("Nairobi Headquarters");
  const [includeCdw, setIncludeCdw] = useState(true);

  if (!isNewBookingOpen) return null;

  // Selected vehicle pricing
  const selectedVehicle = tenantVehicles.find((v) => v.id === vehicleId);

  // Compute days
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const diffDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));

  // Availability check
  const availabilityResult = vehicleId
    ? checkVehicleAvailability(vehicleId, `${startDate}T09:00:00Z`, `${endDate}T18:00:00Z`)
    : { available: true };

  // Calculate pricing snapshot
  const dailyRate = selectedVehicle?.dailyRate || 8000;
  const baseRental = dailyRate * diffDays;
  const insuranceCdw = includeCdw ? 1500 * diffDays : 0;
  const fuelDeposit = 5000;
  const securityDeposit = selectedVehicle?.category === "Luxury" ? 50000 : 25000;
  const vatAmount = Math.round((baseRental + insuranceCdw) * 0.16);
  const grossTotal = baseRental + insuranceCdw + fuelDeposit + securityDeposit + vatAmount;
  const netPayable = grossTotal;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !vehicleId) return;

    if (!availabilityResult.available) {
      alert(`Vehicle conflict: ${availabilityResult.conflictReason || "Vehicle unavailable"}`);
      return;
    }

    const booking = await createBooking({
      customerId,
      vehicleId,
      assignedVehicleId: vehicleId,
      requestedVehicleId: vehicleId,
      startDate: `${startDate}T09:00:00Z`,
      endDate: `${endDate}T18:00:00Z`,
      pickupAt: `${startDate}T09:00:00Z`,
      returnAt: `${endDate}T18:00:00Z`,
      pickupLocation: pickupLoc,
      returnLocation: returnLoc,
      pickupLocationName: pickupLoc,
      returnLocationName: returnLoc,
      source: "WALK_IN",
      status: "CONFIRMED",
      currency: activeTenant?.currency || "KES",
      grossTotal,
      netRentalSubtotal: baseRental,
      depositRequired: securityDeposit,
      taxAmount: vatAmount,
      amountPaid: 0,
      paymentStatus: "UNPAID",
      depositStatus: "REQUESTED",
      pricing: {
        currency: activeTenant?.currency || "KES",
        dailyRate,
        totalDays: diffDays,
        baseRental,
        insuranceAmount: insuranceCdw,
        insuranceCdw,
        extrasAmount: 0,
        securityDeposit,
        fuelDeposit,
        taxRatePercent: 16,
        taxAmount: vatAmount,
        vatAmount,
        discountPercent: 0,
        discountAmount: 0,
        grossTotal,
        netPayable,
        frozenAt: new Date().toISOString(),
      },
    });

    if (booking) {
      setIsNewBookingOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-base text-slate-900 dark:text-white">Create Booking Dossier & Quote</h2>
          </div>
          <button
            onClick={() => setIsNewBookingOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {/* Customer & Vehicle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Select Customer *</label>
              <select
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              >
                <option value="">Choose customer...</option>
                {tenantCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.fullName} ({c.phone})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Select Vehicle Asset *</label>
              <select
                required
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              >
                <option value="">Choose vehicle...</option>
                {tenantVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registrationPlate} — {v.make} {v.model} ({activeTenant.currencySymbol} {v.dailyRate}/d)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Availability Alert if blocked */}
          {vehicleId && !availabilityResult.available && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Availability Conflict: {availabilityResult.conflictReason || "Vehicle unavailable"}</span>
            </div>
          )}

          {/* Dates & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Pick-up Date *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Return Date *</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          {/* Locations */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Pick-up Location</label>
              <input
                type="text"
                value={pickupLoc}
                onChange={(e) => setPickupLoc(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Return Location</label>
              <input
                type="text"
                value={returnLoc}
                onChange={(e) => setReturnLoc(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          {/* Add-ons */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCdw}
                onChange={(e) => setIncludeCdw(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600"
              />
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Include Full Comprehensive Collision Damage Waiver (CDW) Insurance
              </span>
            </label>
          </div>

          {/* Real-time Pricing Breakdown */}
          <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 space-y-1.5">
            <div className="flex justify-between font-bold text-slate-700 dark:text-slate-300 pb-1 border-b border-slate-200 dark:border-slate-750">
              <span>Pricing Snapshot ({diffDays} days @ {activeTenant.currencySymbol} {dailyRate.toLocaleString()}/d)</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Base Hire:</span>
              <span>{activeTenant.currencySymbol} {baseRental.toLocaleString()}</span>
            </div>
            {includeCdw && (
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Insurance CDW:</span>
                <span>{activeTenant.currencySymbol} {insuranceCdw.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Security Deposit Escrow:</span>
              <span>{activeTenant.currencySymbol} {securityDeposit.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>16% VAT:</span>
              <span>{activeTenant.currencySymbol} {vatAmount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between font-extrabold text-sm text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
              <span>Gross Payable:</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                {activeTenant.currencySymbol} {netPayable.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsNewBookingOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={vehicleId ? !availabilityResult.available : false}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white text-xs font-bold shadow-xs transition-colors"
            >
              Generate Quoted Reservation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
