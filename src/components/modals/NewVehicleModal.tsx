import React, { useState } from "react";
import { X, Car, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useApp } from "../../lib/store";
import { VehicleCategory } from "../../types";

export const NewVehicleModal: React.FC = () => {
  const {
    isNewVehicleOpen,
    setIsNewVehicleOpen,
    activeTenant,
    activeTenantId,
    vehicleOwners,
    registerVehicle,
    checkEntitlement,
  } = useApp();

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("2023");
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [category, setCategory] = useState<VehicleCategory>("SUV");
  const [fuelType, setFuelType] = useState<"DIESEL" | "PETROL" | "HYBRID" | "ELECTRIC">("DIESEL");
  const [transmission, setTransmission] = useState<"AUTOMATIC" | "MANUAL">("AUTOMATIC");
  const [seats, setSeats] = useState("7");
  const [dailyRate, setDailyRate] = useState("");
  const [odometer, setOdometer] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [imageUrl, setImageUrl] = useState(
    "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=800"
  );

  if (!isNewVehicleOpen) return null;

  const tenantOwners = vehicleOwners.filter((o) => o.tenantId === activeTenantId);
  const entitlement = checkEntitlement("fleet.vehicle.create");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entitlement.allowed) {
      alert(entitlement.reason);
      return;
    }

    const vehicle = await registerVehicle({
      make,
      model,
      year: parseInt(year, 10),
      registrationPlate: plate.toUpperCase(),
      vin: vin.toUpperCase(),
      category,
      fuelType,
      transmission,
      seats: parseInt(seats, 10),
      dailyRate: parseFloat(dailyRate),
      odometer: parseInt(odometer, 10),
      fuelLevel: 100,
      availabilityStatus: "AVAILABLE",
      lifecycleStatus: "OPERATIONAL",
      ownerId: ownerId || undefined,
      imageUrl,
      features: [],
      allowedDailyKm: 300,
      excessKmRate: 45,
    });

    if (vehicle) {
      setIsNewVehicleOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-base text-slate-900 dark:text-white">Register Fleet Vehicle Asset</h2>
          </div>
          <button
            onClick={() => setIsNewVehicleOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quota warning */}
        {!entitlement.allowed && (
          <div className="px-6 py-3 bg-rose-50 dark:bg-rose-950/60 border-b border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{entitlement.reason}. Please upgrade to Enterprise in SaaS Control Plane.</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Make *</label>
              <input
                required
                type="text"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Model *</label>
              <input
                required
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Year *</label>
              <input
                required
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Registration Plate *</label>
              <input
                required
                type="text"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">VIN / Chassis Number *</label>
              <input
                required
                type="text"
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              >
                <option value="SUV">SUV</option>
                <option value="4x4 Offroad">4x4 Offroad Safari</option>
                <option value="Luxury">Luxury Sedan/SUV</option>
                <option value="Sedan">Sedan</option>
                <option value="Van/Bus">Van / Safari Bus</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Fuel Type</label>
              <select
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value as any)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              >
                <option value="DIESEL">Diesel</option>
                <option value="PETROL">Petrol</option>
                <option value="HYBRID">Hybrid</option>
                <option value="ELECTRIC">Electric (EV)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Daily Hire Rate ({activeTenant.currencySymbol}) *</label>
              <input
                required
                type="number"
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Assign Ownership Pool *</label>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              >
                <option value="">Internal Fleet Pool (100% Retained)</option>
                {tenantOwners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} · {o.companyName || o.email || o.phone || "Investor"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Current Odometer (km)</label>
              <input
                type="number"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Vehicle Image URL</label>
            <input
              type="text"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsNewVehicleOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!entitlement.allowed}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white text-xs font-bold shadow-xs transition-colors"
            >
              Register & Add to Catalog
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
