import React, { useState } from "react";
import { X, Wrench, ShieldAlert, DollarSign, Calendar, FileText, Building2 } from "lucide-react";
import { useApp } from "../../lib/store";
import { MaintenanceType, MaintenancePriority } from "../../types";

export const NewWorkOrderModal: React.FC = () => {
  const {
    isNewWorkOrderModalOpen,
    setIsNewWorkOrderModalOpen,
    vehicles,
    serviceProviders,
    activeTenant,
    activeTenantId,
    createMaintenanceRequest,
  } = useApp();

  const [vehicleId, setVehicleId] = useState("");
  const [maintenanceType, setMaintenanceType] = useState<MaintenanceType>("ROUTINE_SERVICE");
  const [priority, setPriority] = useState<MaintenancePriority>("NORMAL");
  const [isSafetyCritical, setIsSafetyCritical] = useState(false);
  const [garageId, setGarageId] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");

  if (!isNewWorkOrderModalOpen) return null;

  const tenantVehicles = vehicles.filter((v) => v.tenantId === activeTenantId);
  const tenantProviders = serviceProviders.filter((p) => p.tenantId === activeTenantId && p.status === "ACTIVE");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId) return;

    createMaintenanceRequest({
      vehicleId,
      maintenanceType,
      priority,
      reason: reason || `${maintenanceType.replace(/_/g, " ")} service request`,
      description: description || undefined,
      garageId: garageId || undefined,
      estimatedCost: estimatedCost ? parseFloat(estimatedCost) : undefined,
      isSafetyCritical,
      sourceType: "MANUAL",
    });

    // Reset and close
    setVehicleId("");
    setMaintenanceType("ROUTINE_SERVICE");
    setPriority("NORMAL");
    setIsSafetyCritical(false);
    setGarageId("");
    setReason("");
    setDescription("");
    setEstimatedCost("");
    setIsNewWorkOrderModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">New Maintenance Work Order</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Initiate service request with full lifecycle tracking</p>
            </div>
          </div>
          <button
            onClick={() => setIsNewWorkOrderModalOpen(false)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Target Vehicle */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
              Target Vehicle <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium"
            >
              <option value="">Select vehicle from fleet...</option>
              {tenantVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registrationPlate} — {v.make} {v.model} ({v.odometer.toLocaleString()} km)
                </option>
              ))}
            </select>
          </div>

          {/* Maintenance Type & Priority */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                Maintenance Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={maintenanceType}
                onChange={(e) => setMaintenanceType(e.target.value as MaintenanceType)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                <option value="ROUTINE_SERVICE">Routine Servicing / Oil Change</option>
                <option value="PREVENTIVE">Scheduled Preventive Maintenance</option>
                <option value="CORRECTIVE">Corrective Mechanical Repair</option>
                <option value="REPAIR">General Breakdown Repair</option>
                <option value="INSPECTION_REMEDIATION">Inspection / Return Item</option>
                <option value="TIRE">Tire Replacement & Alignment</option>
                <option value="BRAKE">Brake Pads & Hydraulics</option>
                <option value="BODYWORK">Bodywork & Paint Touch-up</option>
                <option value="ELECTRICAL">Electrical & Diagnostics</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Priority Level</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as MaintenancePriority)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                <option value="LOW">Low (Routine / Non-urgent)</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High (Fleet priority)</option>
                <option value="CRITICAL">Critical (Ground vehicle immediately)</option>
              </select>
            </div>
          </div>

          {/* Assigned Workshop / Service Provider */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5 flex items-center justify-between">
              <span>Designated Garage / Workshop</span>
              <span className="text-[10px] text-slate-400 font-normal">Optional at request stage</span>
            </label>
            <select
              value={garageId}
              onChange={(e) => setGarageId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium"
            >
              <option value="">Select approved garage or unassigned...</option>
              {tenantProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.location}) — ⭐ {p.rating}
                </option>
              ))}
            </select>
          </div>

          {/* Reason / Summary */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
              Service Reason / Summary <span className="text-rose-500">*</span>
            </label>
            <input
              required
              type="text"
              placeholder="e.g. 10,000 km Scheduled Service & Brake Pad Replacement"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Detailed Description */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Detailed Scope of Work & Symptoms</label>
            <textarea
              rows={3}
              placeholder="Detailed instructions for the workshop technician..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Estimated Cost & Safety Critical Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                Estimated Cost ({activeTenant.currencySymbol})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 15000"
                value={estimatedCost}
                onChange={(e) => setEstimatedCost(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
              />
            </div>

            <div className="pt-4">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isSafetyCritical}
                  onChange={(e) => setIsSafetyCritical(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-slate-600"
                />
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                    Safety Critical Item
                  </span>
                  <p className="text-[10px] text-slate-400">Strict quality sign-off required</p>
                </div>
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700/80">
            <button
              type="button"
              onClick={() => setIsNewWorkOrderModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Wrench className="w-4 h-4" />
              <span>Create Work Order</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
