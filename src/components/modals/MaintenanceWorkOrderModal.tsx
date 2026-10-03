import React, { useState } from "react";
import {
  X,
  Wrench,
  Calendar,
  Clock,
  Car,
  Building2,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Trash2,
  FileText,
  User,
  Gauge,
  Tag,
  ArrowRight,
  ListTodo,
  Package,
  History,
  Check,
} from "lucide-react";
import { useApp } from "../../lib/store";
import { MaintenanceTaskType, MaintenanceCostCategory } from "../../types";

export const MaintenanceWorkOrderModal: React.FC = () => {
  const {
    selectedMaintenanceId,
    setSelectedMaintenanceId,
    maintenanceWorkOrders,
    vehicles,
    serviceProviders,
    activeTenant,
    activeTenantId,
    scheduleMaintenanceWorkOrder,
    startMaintenanceWorkOrder,
    addMaintenanceTask,
    updateMaintenanceTask,
    addMaintenancePart,
    recordMaintenanceCost,
    completeMaintenanceWorkOrder,
    verifyMaintenanceWorkOrder,
    cancelMaintenanceWorkOrder,
  } = useApp();

  const [activeTab, setActiveTab] = useState<"overview" | "tasks" | "parts" | "costs" | "history">("overview");

  // Workflow sub-states
  const [isSchedulingOpen, setIsSchedulingOpen] = useState(false);
  const [scheduleGarageId, setScheduleGarageId] = useState("");
  const [scheduleTech, setScheduleTech] = useState("");
  const [scheduleStartDate, setScheduleStartDate] = useState("");
  const [scheduleEndDate, setScheduleEndDate] = useState("");
  const [scheduleEstCost, setScheduleEstCost] = useState("");

  const [isStartingOpen, setIsStartingOpen] = useState(false);
  const [startOdo, setStartOdo] = useState("");
  const [startTech, setStartTech] = useState("");
  const [startNotes, setStartNotes] = useState("");

  const [isCompletingOpen, setIsCompletingOpen] = useState(false);
  const [completionOdo, setCompletionOdo] = useState("");
  const [completionCost, setCompletionCost] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");

  const [isVerifyingOpen, setIsVerifyingOpen] = useState(false);
  const [passedInspection, setPassedInspection] = useState(true);
  const [roadTested, setRoadTested] = useState(true);
  const [qualityScore, setQualityScore] = useState("100");
  const [releaseStatus, setReleaseStatus] = useState<"AVAILABLE" | "GROUNDED">("AVAILABLE");
  const [verificationNotes, setVerificationNotes] = useState("");

  const [isCancellingOpen, setIsCancellingOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");

  // New item sub-forms
  const [isAddingTaskOpen, setIsAddingTaskOpen] = useState(false);
  const [taskType, setTaskType] = useState<MaintenanceTaskType>("INSPECTION");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskEstCost, setTaskEstCost] = useState("");

  const [isAddingPartOpen, setIsAddingPartOpen] = useState(false);
  const [partNumber, setPartNumber] = useState("");
  const [partDescription, setPartDescription] = useState("");
  const [partQty, setPartQty] = useState("1");
  const [partUnitCost, setPartUnitCost] = useState("");
  const [partSupplier, setPartSupplier] = useState("");
  const [partInvoiceRef, setPartInvoiceRef] = useState("");

  const [isAddingCostOpen, setIsAddingCostOpen] = useState(false);
  const [costCategory, setCostCategory] = useState<MaintenanceCostCategory>("LABOUR");
  const [costDescription, setCostDescription] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [costInvoiceNum, setCostInvoiceNum] = useState("");

  if (!selectedMaintenanceId) return null;

  const order = maintenanceWorkOrders.find((m) => m.id === selectedMaintenanceId && m.tenantId === activeTenantId);
  if (!order) return null;

  const vehicle = vehicles.find((v) => v.id === order.vehicleId && v.tenantId === activeTenantId);
  const garage = order.garageId ? serviceProviders.find((p) => p.id === order.garageId) : undefined;
  const tenantProviders = serviceProviders.filter((p) => p.tenantId === activeTenantId && p.status === "ACTIVE");

  const handleSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleStartDate) return;

    scheduleMaintenanceWorkOrder(order.id, {
      garageId: scheduleGarageId || order.garageId,
      assignedTechnician: scheduleTech || undefined,
      scheduledStartAt: scheduleStartDate,
      scheduledEndAt: scheduleEndDate || undefined,
      estimatedCost: scheduleEstCost ? parseFloat(scheduleEstCost) : undefined,
    });
    setIsSchedulingOpen(false);
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    startMaintenanceWorkOrder(order.id, {
      startOdometer: startOdo ? parseInt(startOdo, 10) : undefined,
      assignedTechnician: startTech || undefined,
      notes: startNotes || undefined,
    });
    setIsStartingOpen(false);
  };

  const handleComplete = (e: React.FormEvent) => {
    e.preventDefault();
    completeMaintenanceWorkOrder(order.id, {
      completionOdometer: completionOdo ? parseInt(completionOdo, 10) : undefined,
      actualCost: completionCost ? parseFloat(completionCost) : undefined,
      notes: completionNotes || undefined,
    });
    setIsCompletingOpen(false);
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    verifyMaintenanceWorkOrder(order.id, {
      passedInspection,
      roadTested,
      qualityScore: parseInt(qualityScore, 10) || 100,
      releaseVehicleStatus: releaseStatus,
      verificationNotes: verificationNotes || undefined,
    });
    setIsVerifyingOpen(false);
  };

  const handleCancel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellationReason) return;
    cancelMaintenanceWorkOrder(order.id, { reason: cancellationReason });
    setIsCancellingOpen(false);
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskDescription) return;
    addMaintenanceTask(order.id, {
      taskType,
      description: taskDescription,
      isRequired: true,
      estimatedCost: taskEstCost ? parseFloat(taskEstCost) : undefined,
    });
    setTaskDescription("");
    setTaskEstCost("");
    setIsAddingTaskOpen(false);
  };

  const handleAddPart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partDescription || !partUnitCost) return;
    addMaintenancePart(order.id, {
      partNumber: partNumber || undefined,
      description: partDescription,
      quantity: parseFloat(partQty) || 1,
      unitCost: parseFloat(partUnitCost) || 0,
      supplierName: partSupplier || undefined,
      invoiceReference: partInvoiceRef || undefined,
    });
    setPartNumber("");
    setPartDescription("");
    setPartQty("1");
    setPartUnitCost("");
    setPartSupplier("");
    setPartInvoiceRef("");
    setIsAddingPartOpen(false);
  };

  const handleAddCost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!costDescription || !costAmount) return;
    recordMaintenanceCost(order.id, {
      category: costCategory,
      description: costDescription,
      actualCost: parseFloat(costAmount) || 0,
      invoiceNumber: costInvoiceNum || undefined,
    });
    setCostDescription("");
    setCostAmount("");
    setCostInvoiceNum("");
    setIsAddingCostOpen(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "REQUESTED":
        return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800";
      case "SCHEDULED":
        return "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800";
      case "IN_PROGRESS":
        return "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800";
      case "COMPLETED":
        return "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800";
      case "VERIFIED":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
      case "CANCELLED":
        return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700";
      default:
        return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-base text-slate-900 dark:text-white">
                  {order.maintenanceNumber}
                </span>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getStatusColor(order.status)}`}>
                  {order.status}
                </span>
                {order.isSafetyCritical && (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    <ShieldAlert className="w-3 h-3" /> Safety Critical
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {order.maintenanceType.replace(/_/g, " ")} • Requested {new Date(order.requestedAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Primary Workflow Actions */}
            {order.status === "REQUESTED" && (
              <button
                onClick={() => {
                  setScheduleStartDate(new Date().toISOString().substring(0, 10));
                  setScheduleEstCost(order.estimatedCost?.toString() || "");
                  setIsSchedulingOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Schedule Service</span>
              </button>
            )}

            {order.status === "SCHEDULED" && (
              <button
                onClick={() => {
                  setStartOdo(vehicle?.odometer.toString() || "");
                  setIsStartingOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Start Service Work</span>
              </button>
            )}

            {order.status === "IN_PROGRESS" && (
              <button
                onClick={() => {
                  setCompletionOdo(vehicle?.odometer.toString() || "");
                  setCompletionCost(order.actualCost?.toString() || order.estimatedCost?.toString() || "");
                  setIsCompletingOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Complete Repairs</span>
              </button>
            )}

            {order.status === "COMPLETED" && (
              <button
                onClick={() => setIsVerifyingOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Quality Verification</span>
              </button>
            )}

            {order.status !== "VERIFIED" && order.status !== "CANCELLED" && (
              <button
                onClick={() => setIsCancellingOpen(true)}
                className="px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
            )}

            <button
              onClick={() => setSelectedMaintenanceId(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Drawers / Form Popups */}
        {isSchedulingOpen && (
          <form onSubmit={handleSchedule} className="p-4 bg-blue-50/70 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900/60 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-blue-600" /> Schedule Maintenance Appointment
              </span>
              <button type="button" onClick={() => setIsSchedulingOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Workshop / Garage</label>
                <select
                  value={scheduleGarageId}
                  onChange={(e) => setScheduleGarageId(e.target.value)}
                  className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <option value="">{order.garageName || "Select Garage..."}</option>
                  {tenantProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.location})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Assigned Lead Tech</label>
                <input
                  type="text"
                  placeholder="e.g. Samuel Mureithi"
                  value={scheduleTech}
                  onChange={(e) => setScheduleTech(e.target.value)}
                  className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Service Start Date *</label>
                <input
                  required
                  type="date"
                  value={scheduleStartDate}
                  onChange={(e) => setScheduleStartDate(e.target.value)}
                  className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Target End Date</label>
                <input
                  type="date"
                  value={scheduleEndDate}
                  onChange={(e) => setScheduleEndDate(e.target.value)}
                  className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsSchedulingOpen(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600">
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 rounded-lg bg-blue-600 text-white font-bold">
                Confirm Schedule
              </button>
            </div>
          </form>
        )}

        {isStartingOpen && (
          <form onSubmit={handleStart} className="p-4 bg-purple-50/70 dark:bg-purple-950/40 border-b border-purple-200 dark:border-purple-900/60 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-purple-600" /> Start Service (Vehicle Availability Hold)
              </span>
              <button type="button" onClick={() => setIsStartingOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Intake Odometer (Km)</label>
                <input
                  type="number"
                  value={startOdo}
                  onChange={(e) => setStartOdo(e.target.value)}
                  className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Technician on Job</label>
                <input
                  type="text"
                  placeholder="Technician name"
                  value={startTech}
                  onChange={(e) => setStartTech(e.target.value)}
                  className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Intake Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Engine bay washed, ready for teardown"
                  value={startNotes}
                  onChange={(e) => setStartNotes(e.target.value)}
                  className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsStartingOpen(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600">
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 rounded-lg bg-purple-600 text-white font-bold">
                Commence Work & Hold Vehicle
              </button>
            </div>
          </form>
        )}

        {isCompletingOpen && (
          <form onSubmit={handleComplete} className="p-4 bg-teal-50/70 dark:bg-teal-950/40 border-b border-teal-200 dark:border-teal-900/60 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600" /> Complete Workshop Repairs
              </span>
              <button type="button" onClick={() => setIsCompletingOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Completion Odometer (Km)</label>
                <input
                  type="number"
                  value={completionOdo}
                  onChange={(e) => setCompletionOdo(e.target.value)}
                  className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Final Actual Cost ({activeTenant.currencySymbol})</label>
                <input
                  type="number"
                  step="0.01"
                  value={completionCost}
                  onChange={(e) => setCompletionCost(e.target.value)}
                  className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Completion Summary</label>
                <input
                  type="text"
                  placeholder="All tasks finished, oil levels topped"
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsCompletingOpen(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600">
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 rounded-lg bg-teal-600 text-white font-bold">
                Submit For Quality Verification
              </button>
            </div>
          </form>
        )}

        {isVerifyingOpen && (
          <form onSubmit={handleVerify} className="p-4 bg-emerald-50/70 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-900/60 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> Quality Sign-Off & Vehicle Release
              </span>
              <button type="button" onClick={() => setIsVerifyingOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-center">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chk-pass"
                  checked={passedInspection}
                  onChange={(e) => setPassedInspection(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600"
                />
                <label htmlFor="chk-pass" className="font-semibold text-slate-800 dark:text-slate-200">
                  Passed Quality Check
                </label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chk-road"
                  checked={roadTested}
                  onChange={(e) => setRoadTested(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600"
                />
                <label htmlFor="chk-road" className="font-semibold text-slate-800 dark:text-slate-200">
                  Road Tested (5+ km)
                </label>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Quality Score (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={qualityScore}
                  onChange={(e) => setQualityScore(e.target.value)}
                  className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Release Vehicle To</label>
                <select
                  value={releaseStatus}
                  onChange={(e) => setReleaseStatus(e.target.value as any)}
                  className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-medium"
                >
                  <option value="AVAILABLE">AVAILABLE (Rental Ready)</option>
                  <option value="GROUNDED">GROUNDED (Further work required)</option>
                </select>
              </div>
            </div>

            <div>
              <input
                type="text"
                placeholder="Verification notes or inspector comments..."
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsVerifyingOpen(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600">
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-bold">
                Verify & Release Vehicle
              </button>
            </div>
          </form>
        )}

        {isCancellingOpen && (
          <form onSubmit={handleCancel} className="p-4 bg-rose-50/70 dark:bg-rose-950/40 border-b border-rose-200 dark:border-rose-900/60 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-rose-900 dark:text-rose-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" /> Cancel Work Order
              </span>
              <button type="button" onClick={() => setIsCancellingOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">Cancellation Reason *</label>
              <input
                required
                type="text"
                placeholder="e.g. Workshop parts out of stock, deferred to next week"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsCancellingOpen(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600">
                Back
              </button>
              <button type="submit" className="px-4 py-1.5 rounded-lg bg-rose-600 text-white font-bold">
                Confirm Cancellation
              </button>
            </div>
          </form>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center px-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 gap-6 text-xs">
          {[
            { id: "overview", label: "Overview & Specs", icon: FileText },
            { id: "tasks", label: `Tasks & Checklist (${order.tasks.length})`, icon: ListTodo },
            { id: "parts", label: `Parts & Materials (${order.parts.length})`, icon: Package },
            { id: "costs", label: `Financial Line-Items (${order.costItems.length})`, icon: DollarSign },
            { id: "history", label: `Audit Trail (${order.statusHistory.length})`, icon: History },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 py-3 border-b-2 font-semibold transition-colors ${
                activeTab === tab.id
                  ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs">
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Vehicle & Garage Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Vehicle Card */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Car className="w-4 h-4 text-emerald-600" /> Target Vehicle
                    </span>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                      {vehicle?.registrationPlate || "Unknown"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-400">Make & Model</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {vehicle?.make} {vehicle?.model} ({vehicle?.year})
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Current Odometer</span>
                      <p className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {vehicle?.odometer.toLocaleString()} km
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Availability State</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {vehicle?.availabilityStatus}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Category</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {vehicle?.category}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Workshop / Provider Card */}
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-blue-600" /> Service Provider / Garage
                    </span>
                    {garage && (
                      <span className="text-amber-500 font-bold text-xs flex items-center gap-1">
                        ⭐ {garage.rating}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-400">Workshop</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {order.garageName || garage?.name || "Unassigned"}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Lead Technician</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {order.assignedTechnician || "Not specified"}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Location</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {garage?.location || "N/A"}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Contact</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {garage?.phone || "N/A"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Details & Financials */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-slate-400 text-[11px]">Estimated Cost</span>
                  <p className="text-base font-bold font-mono text-slate-900 dark:text-white">
                    {activeTenant.currencySymbol} {(order.estimatedCost || 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-slate-400 text-[11px]">Actual Operational Cost</span>
                  <p className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {activeTenant.currencySymbol} {(order.actualCost || 0).toLocaleString()}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-slate-400 text-[11px]">Odometer at Intake / Exit</span>
                  <p className="text-base font-bold font-mono text-slate-900 dark:text-white">
                    {order.startOdometer ? `${order.startOdometer.toLocaleString()} km` : "Pending"} →{" "}
                    {order.completionOdometer ? `${order.completionOdometer.toLocaleString()} km` : "Pending"}
                  </p>
                </div>
              </div>

              {/* Description & Reason */}
              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <span className="font-semibold text-slate-900 dark:text-white">Primary Reason / Issue</span>
                  <p className="text-slate-700 dark:text-slate-300">{order.reason}</p>
                </div>

                {order.description && (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5">
                    <span className="font-semibold text-slate-900 dark:text-white">Detailed Work Description</span>
                    <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{order.description}</p>
                  </div>
                )}
              </div>

              {/* Quality Verification Certificate (if verified) */}
              {order.verification && (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" /> Quality Sign-Off Certification
                    </span>
                    <span className="font-mono font-bold text-xs px-2.5 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                      Score: {order.verification.qualityScore}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                    <div>
                      <span className="text-emerald-700 dark:text-emerald-400">Passed Inspection</span>
                      <p className="font-bold text-emerald-900 dark:text-emerald-100">
                        {order.verification.passedInspection ? "YES (CERTIFIED)" : "NO"}
                      </p>
                    </div>
                    <div>
                      <span className="text-emerald-700 dark:text-emerald-400">Road Tested</span>
                      <p className="font-bold text-emerald-900 dark:text-emerald-100">
                        {order.verification.roadTested ? "YES (5+ KM TESTED)" : "NO"}
                      </p>
                    </div>
                    <div>
                      <span className="text-emerald-700 dark:text-emerald-400">Released Status</span>
                      <p className="font-bold text-emerald-900 dark:text-emerald-100">
                        {order.verification.releaseVehicleStatus}
                      </p>
                    </div>
                    <div>
                      <span className="text-emerald-700 dark:text-emerald-400">Certified At</span>
                      <p className="font-mono text-emerald-900 dark:text-emerald-100">
                        {new Date(order.verification.verifiedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {order.verification.verificationNotes && (
                    <p className="text-xs text-emerald-800 dark:text-emerald-300 italic">
                      "{order.verification.verificationNotes}"
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "tasks" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white">Service Checklist & Inspection Items</span>
                <button
                  onClick={() => setIsAddingTaskOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Checklist Task</span>
                </button>
              </div>

              {isAddingTaskOpen && (
                <form onSubmit={handleAddTask} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">Task Category</label>
                      <select
                        value={taskType}
                        onChange={(e) => setTaskType(e.target.value as any)}
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      >
                        <option value="INSPECTION">Inspection / Check</option>
                        <option value="REPLACE">Replacement / Swap</option>
                        <option value="REPAIR">Repair / Refurbish</option>
                        <option value="CLEAN">Cleaning / Flushing</option>
                        <option value="ADJUST">Adjustment / Calibration</option>
                        <option value="TEST">Diagnostic / Road Test</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">Task Description *</label>
                      <input
                        required
                        type="text"
                        placeholder="e.g. Inspect brake pad thickness on all four wheels"
                        value={taskDescription}
                        onChange={(e) => setTaskDescription(e.target.value)}
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setIsAddingTaskOpen(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600">
                      Cancel
                    </button>
                    <button type="submit" className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-bold">
                      Add Task
                    </button>
                  </div>
                </form>
              )}

              {order.tasks.length === 0 ? (
                <div className="text-center py-8 text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  <ListTodo className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p>No individual checklist items defined for this work order.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {order.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() =>
                            updateMaintenanceTask(order.id, task.id, {
                              status: task.status === "COMPLETED" ? "PENDING" : "COMPLETED",
                            })
                          }
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                            task.status === "COMPLETED"
                              ? "bg-emerald-600 text-white"
                              : "border border-slate-300 dark:border-slate-600 text-transparent hover:border-emerald-500"
                          }`}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-semibold ${
                                task.status === "COMPLETED"
                                  ? "line-through text-slate-400 dark:text-slate-500"
                                  : "text-slate-900 dark:text-white"
                              }`}
                            >
                              {task.description}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                              {task.taskType}
                            </span>
                          </div>
                          {task.technicianNotes && (
                            <p className="text-[11px] text-slate-500 mt-0.5">{task.technicianNotes}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {task.actualCost && (
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                            {activeTenant.currencySymbol} {task.actualCost.toLocaleString()}
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            task.status === "COMPLETED"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          }`}
                        >
                          {task.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "parts" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-white">Replaced Parts & Consumables</span>
                <button
                  onClick={() => setIsAddingPartOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Part Line-Item</span>
                </button>
              </div>

              {isAddingPartOpen && (
                <form onSubmit={handleAddPart} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">Part Number</label>
                      <input
                        type="text"
                        placeholder="e.g. 04152-YZZA6"
                        value={partNumber}
                        onChange={(e) => setPartNumber(e.target.value)}
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">Part Description *</label>
                      <input
                        required
                        type="text"
                        placeholder="e.g. Genuine Toyota Oil Filter Cartridge"
                        value={partDescription}
                        onChange={(e) => setPartDescription(e.target.value)}
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={partQty}
                        onChange={(e) => setPartQty(e.target.value)}
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">
                        Unit Price ({activeTenant.currencySymbol}) *
                      </label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        placeholder="1800"
                        value={partUnitCost}
                        onChange={(e) => setPartUnitCost(e.target.value)}
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">Supplier / Parts Vendor</label>
                      <input
                        type="text"
                        placeholder="Toyota Kenya Ltd"
                        value={partSupplier}
                        onChange={(e) => setPartSupplier(e.target.value)}
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">Invoice / Receipt Ref</label>
                      <input
                        type="text"
                        placeholder="INV-99812"
                        value={partInvoiceRef}
                        onChange={(e) => setPartInvoiceRef(e.target.value)}
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setIsAddingPartOpen(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600">
                      Cancel
                    </button>
                    <button type="submit" className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-bold">
                      Add Part Line-Item
                    </button>
                  </div>
                </form>
              )}

              {order.parts.length === 0 ? (
                <div className="text-center py-8 text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  <Package className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p>No spare parts or material line-items recorded yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="px-4 py-2.5">Part #</th>
                        <th className="px-4 py-2.5">Description</th>
                        <th className="px-4 py-2.5">Qty</th>
                        <th className="px-4 py-2.5">Unit Cost</th>
                        <th className="px-4 py-2.5">Total</th>
                        <th className="px-4 py-2.5">Supplier / Invoice</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-800 dark:text-slate-200">
                      {order.parts.map((part) => (
                        <tr key={part.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{part.partNumber || "—"}</td>
                          <td className="px-4 py-2.5 font-semibold">{part.description}</td>
                          <td className="px-4 py-2.5 font-mono">{part.quantity}</td>
                          <td className="px-4 py-2.5 font-mono">
                            {activeTenant.currencySymbol} {part.unitCost.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {activeTenant.currencySymbol} {part.totalCost.toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 text-slate-500 text-[11px]">
                            {part.supplierName || "—"} {part.invoiceReference && `(${part.invoiceReference})`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "costs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">Operational Cost Items</span>
                  <p className="text-[11px] text-slate-400">Immutable source facts feeding general ledger and owner settlement expense deductions</p>
                </div>
                <button
                  onClick={() => setIsAddingCostOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Record Cost Item</span>
                </button>
              </div>

              {isAddingCostOpen && (
                <form onSubmit={handleAddCost} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">Category</label>
                      <select
                        value={costCategory}
                        onChange={(e) => setCostCategory(e.target.value as MaintenanceCostCategory)}
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      >
                        <option value="LABOUR">Labor & Technician Time</option>
                        <option value="PARTS">Spare Parts / Consumables</option>
                        <option value="FLUIDS">Fluids, Oils & Coolants</option>
                        <option value="EXTERNAL_SERVICE">Sublet / External Machining</option>
                        <option value="TAX">Taxes & Levies</option>
                        <option value="OTHER">Other / Sundries</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">Description *</label>
                      <input
                        required
                        type="text"
                        placeholder="e.g. 3.5 Hours Workshop Labor @ KES 2,500/hr"
                        value={costDescription}
                        onChange={(e) => setCostDescription(e.target.value)}
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 dark:text-slate-400 mb-1">
                        Amount ({activeTenant.currencySymbol}) *
                      </label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        placeholder="8750"
                        value={costAmount}
                        onChange={(e) => setCostAmount(e.target.value)}
                        className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setIsAddingCostOpen(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600">
                      Cancel
                    </button>
                    <button type="submit" className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-bold">
                      Post Cost Item
                    </button>
                  </div>
                </form>
              )}

              {order.costItems.length === 0 ? (
                <div className="text-center py-8 text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  <DollarSign className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <p>No itemized cost items recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {order.costItems.map((cost) => (
                    <div
                      key={cost.id}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-xs">
                          {cost.category.substring(0, 3)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{cost.description}</p>
                          <span className="text-[10px] text-slate-400 font-mono">Category: {cost.category}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                          {activeTenant.currencySymbol} {(cost.actualCost || cost.estimatedCost || 0).toLocaleString()}
                        </span>
                        {cost.invoiceNumber && (
                          <p className="text-[10px] text-slate-400 font-mono">Inv: {cost.invoiceNumber}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="space-y-4">
              <span className="font-bold text-slate-900 dark:text-white">Canonical Lifecycle Audit Trail</span>
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
                {order.statusHistory.map((item, idx) => (
                  <div key={item.id} className="relative">
                    <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-emerald-600 border-2 border-white dark:border-slate-850" />
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {item.fromStatus ? `${item.fromStatus} → ${item.toStatus}` : item.toStatus}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(item.changedAt).toLocaleString()}
                        </span>
                      </div>
                      {item.reason && <p className="text-slate-600 dark:text-slate-400">{item.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
