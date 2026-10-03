import React from "react";
import {
  X,
  Car,
  Gauge,
  Fuel,
  Users,
  ShieldCheck,
  Calendar,
  Wrench,
  FileSpreadsheet,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "../../lib/store";

export const VehicleDetailsModal: React.FC = () => {
  const {
    selectedVehicleId,
    setSelectedVehicleId,
    vehicles,
    vehicleOwners,
    complianceDocs,
    maintenance,
    inspections,
    activeTenant,
    activeTenantId,
    updateVehicle,
  } = useApp();

  if (!selectedVehicleId) return null;

  const v = (vehicles || []).find((veh) => veh.id === selectedVehicleId);
  if (!v) return null;

  const owner = (vehicleOwners || []).find((o) => o.id === v.ownerId);
  const vCompliance = (complianceDocs || []).filter((c) => c.subjectId === v.id);
  const vMaint = (maintenance || []).filter((m) => m.vehicleId === v.id);
  const vInsp = (inspections || []).filter((i) => i.vehicleId === v.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header with image */}
        <div className="relative h-48 bg-slate-900 overflow-hidden flex-shrink-0">
          <img
            src={v.imageUrl}
            alt={v.model}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

          <button
            onClick={() => setSelectedVehicleId(null)}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="absolute bottom-4 left-6 text-white">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 uppercase">
              {v.category} • {v.year}
            </span>
            <h2 className="text-xl font-bold mt-0.5">
              {v.make} {v.model} ({v.registrationPlate})
            </h2>
            <p className="text-xs text-slate-300 font-mono">VIN: {v.vin}</p>
          </div>
        </div>

        {/* Content Tabs */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Key Specs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
            <div>
              <span className="text-slate-400">Daily Hire:</span>
              <p className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                {activeTenant.currencySymbol} {v.dailyRate.toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-slate-400">Odometer:</span>
              <p className="font-bold text-slate-900 dark:text-white">{v.odometer.toLocaleString()} km</p>
            </div>
            <div>
              <span className="text-slate-400">Fuel Level:</span>
              <p className="font-bold text-slate-900 dark:text-white">{v.fuelLevel}%</p>
            </div>
            <div>
              <span className="text-slate-400">Transmission:</span>
              <p className="font-bold text-slate-900 dark:text-white">{v.transmission}</p>
            </div>
          </div>

          {/* Status Switcher */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
            <div>
              <span className="font-bold text-slate-800 dark:text-slate-200">Current Availability State:</span>
              <p className="text-slate-500">Manual operational state override</p>
            </div>
            <select
              value={v.availabilityStatus}
              onChange={(e) => updateVehicle(v.id, { availabilityStatus: e.target.value as any })}
              className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-xs"
            >
              <option value="AVAILABLE">AVAILABLE</option>
              <option value="ON_RENT">ON_RENT</option>
              <option value="RESERVED">RESERVED</option>
              <option value="MAINTENANCE">MAINTENANCE</option>
              <option value="BLOCKED">BLOCKED</option>
            </select>
          </div>

          {/* Regulatory Compliance Documents */}
          <div className="space-y-2">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Compliance Documents ({vCompliance.length})</span>
            </h3>
            {vCompliance.length === 0 ? (
              <p className="text-slate-400 py-1">No compliance documents attached.</p>
            ) : (
              <div className="space-y-1.5">
                {vCompliance.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                  >
                    <span>{doc.documentType.replace(/_/g, " ")} (#{doc.documentNumber})</span>
                    <span className="font-mono text-[11px] text-slate-500">Exp: {doc.expiryDate}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Maintenance History */}
          <div className="space-y-2">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-amber-600" />
              <span>Servicing & Maintenance Logs ({vMaint.length})</span>
            </h3>
            {vMaint.length === 0 ? (
              <p className="text-slate-400 py-1">No maintenance jobs logged.</p>
            ) : (
              <div className="space-y-1.5">
                {vMaint.map((m) => (
                  <div
                    key={m.id}
                    className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold">{m.serviceType.replace(/_/g, " ")}</span>
                      <p className="text-[11px] text-slate-500">{m.workshop} • {m.description}</p>
                    </div>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {m.currency} {m.cost.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
