import React, { useState } from "react";
import { X, Calendar, ShieldAlert, Clock, Gauge, Tag } from "lucide-react";
import { useApp } from "../../lib/store";
import { MaintenanceType } from "../../types";

export const NewScheduleModal: React.FC = () => {
  const {
    isNewScheduleModalOpen,
    setIsNewScheduleModalOpen,
    vehicles,
    activeTenantId,
    createMaintenanceSchedule,
  } = useApp();

  const [vehicleId, setVehicleId] = useState("");
  const [name, setName] = useState("");
  const [maintenanceType, setMaintenanceType] = useState<MaintenanceType>("PREVENTIVE");
  const [intervalDistanceKm, setIntervalDistanceKm] = useState("10000");
  const [intervalDays, setIntervalDays] = useState("180");
  const [dueSoonKm, setDueSoonKm] = useState("500");
  const [dueSoonDays, setDueSoonDays] = useState("14");
  const [isSafetyCritical, setIsSafetyCritical] = useState(false);
  const [notes, setNotes] = useState("");

  if (!isNewScheduleModalOpen) return null;

  const tenantVehicles = vehicles.filter((v) => v.tenantId === activeTenantId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    createMaintenanceSchedule({
      name,
      maintenanceType,
      vehicleId: vehicleId || undefined,
      intervalDistanceKm: intervalDistanceKm ? parseInt(intervalDistanceKm, 10) : undefined,
      intervalDays: intervalDays ? parseInt(intervalDays, 10) : undefined,
      dueSoonDistanceThresholdKm: dueSoonKm ? parseInt(dueSoonKm, 10) : 500,
      dueSoonDaysThreshold: dueSoonDays ? parseInt(dueSoonDays, 10) : 14,
      isSafetyCritical,
      notes: notes || undefined,
    });

    setName("");
    setVehicleId("");
    setIntervalDistanceKm("10000");
    setIntervalDays("180");
    setDueSoonKm("500");
    setDueSoonDays("14");
    setIsSafetyCritical(false);
    setNotes("");
    setIsNewScheduleModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">New Preventive Service Schedule</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Configure time and mileage-based recurrence rules</p>
            </div>
          </div>
          <button
            onClick={() => setIsNewScheduleModalOpen(false)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
              Schedule Name <span className="text-rose-500">*</span>
            </label>
            <input
              required
              type="text"
              placeholder="e.g. 10,000 KM Engine & Transmission Service"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Maintenance Type</label>
              <select
                value={maintenanceType}
                onChange={(e) => setMaintenanceType(e.target.value as MaintenanceType)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                <option value="PREVENTIVE">Preventive Maintenance</option>
                <option value="ROUTINE_SERVICE">Routine Servicing</option>
                <option value="BRAKE">Brake Inspection & Flush</option>
                <option value="TIRE">Tire Rotation & Balance</option>
                <option value="ELECTRICAL">Battery & Alternator Test</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5 flex items-center justify-between">
                <span>Assigned Vehicle</span>
                <span className="text-[10px] text-slate-400 font-normal">Optional (All if blank)</span>
              </label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium"
              >
                <option value="">Apply to Entire Workspace Fleet</option>
                {tenantVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registrationPlate} — {v.make} {v.model}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Recurrence Intervals */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700/80 space-y-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              Recurrence Triggers (Distance & Time Intervals)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Interval Mileage (Kilometers)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 10000"
                    value={intervalDistanceKm}
                    onChange={(e) => setIntervalDistanceKm(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono pr-10"
                  />
                  <span className="absolute right-3 top-2 text-[10px] font-mono text-slate-400">km</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Interval Time (Days)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 180"
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono pr-12"
                  />
                  <span className="absolute right-3 top-2 text-[10px] font-mono text-slate-400">days</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Due-Soon Warning Threshold (Km)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="500"
                  value={dueSoonKm}
                  onChange={(e) => setDueSoonKm(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Due-Soon Warning Threshold (Days)
                </label>
                <input
                  type="number"
                  min="0"
                  placeholder="14"
                  value={dueSoonDays}
                  onChange={(e) => setDueSoonDays(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
            </div>
          </div>

          <div>
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
                  Mandatory Safety Regulation
                </span>
                <p className="text-[10px] text-slate-400">Flags vehicles as non-compliant if schedule is overdue</p>
              </div>
            </label>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Schedule Notes</label>
            <textarea
              rows={2}
              placeholder="Checklist or instructions to follow on this service..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700/80">
            <button
              type="button"
              onClick={() => setIsNewScheduleModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Calendar className="w-4 h-4" />
              <span>Save Schedule</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
