import React, { useState } from "react";
import {
  ClipboardCheck,
  Plus,
  Car,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Fuel,
  Gauge,
  Camera,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import { useApp } from "../lib/store";
import { VehicleInspection } from "../types";

export const InspectionsView: React.FC = () => {
  const { restoration } = useApp();
  const {
    inspections,
    vehicles,
    activeTenant,
    activeTenantId,
    setIsInspectionModalOpen,
    setSelectedInspectionId,
  } = useApp();

  const tenantInspections = inspections.filter((i) => i.tenantId === activeTenantId);
  const tenantVehicles = vehicles.filter((v) => v.tenantId === activeTenantId);

  return (
    <div id="inspections-view" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              OPS-001 Vehicle Condition & Digital Handover
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {tenantInspections.length} Audit Certificates
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            4-step inspection audit trail, 360° damage mapping across 14 zones, fuel/mileage deficit calculation, and digital signatures.
          </p>
        </div>

        <button disabled={restoration} aria-describedby="restoration-actions-note"
          onClick={() => setIsInspectionModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Launch Inspection Audit</span>
        </button>
      </div>

      {/* Inspections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {tenantInspections.map((insp) => {
          const v = tenantVehicles.find((veh) => veh.id === insp.vehicleId);

          return (
            <div
              key={insp.id}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs flex flex-col justify-between"
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        insp.type === "HANDOVER"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      }`}
                    >
                      {insp.type} INSPECTION
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-1">
                      {v ? `${v.registrationPlate} (${v.make} ${v.model})` : "Vehicle"}
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    {new Date(insp.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                    <Gauge className="w-3.5 h-3.5 text-slate-400" />
                    <span>{insp.odometer.toLocaleString()} km</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                    <Fuel className="w-3.5 h-3.5 text-slate-400" />
                    <span>{insp.fuelLevel}% Fuel</span>
                  </div>
                </div>

                {/* Damage Summary */}
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>Mapped Damages:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {(insp.damages || []).length} incidents recorded
                    </span>
                  </div>
                  {(insp.damages || []).map((d) => (
                    <div
                      key={d.id}
                      className="text-[11px] px-2 py-1 rounded bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border border-rose-100 dark:border-rose-900/40 flex items-center justify-between"
                    >
                      <span>{d.zone.replace(/_/g, " ")} ({d.type})</span>
                      <span className="font-mono font-bold">
                        {activeTenant.currencySymbol} {d.estimatedCost.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Signatures */}
                <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 pt-1">
                  <p>Inspector: <span className="font-medium text-slate-800 dark:text-slate-200">{insp.inspectorName}</span></p>
                  <p>Customer: <span className="font-medium text-slate-800 dark:text-slate-200">{insp.customerName}</span></p>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-3 mt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Digitally Certified
                </span>
                <button disabled={restoration} aria-describedby="restoration-actions-note"
                  onClick={() => setSelectedInspectionId(insp.id)}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
                >
                  <span>View Certificate</span>
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
