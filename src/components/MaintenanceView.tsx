import React, { useState, useMemo } from "react";
import {
  Wrench,
  Plus,
  Car,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Receipt,
  Building2,
  ChevronRight,
  Calendar,
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  DollarSign,
  Gauge,
  ListTodo,
  Package,
  Sparkles,
  ArrowUpRight,
  ExternalLink,
} from "lucide-react";
import { useApp } from "../lib/store";
import { MaintenanceWorkOrder, MaintenanceSchedule, ServiceProvider, MaintenanceType } from "../types";

export const MaintenanceView: React.FC = () => {
  const { restoration } = useApp();
  const {
    maintenanceWorkOrders,
    maintenanceSchedules,
    serviceProviders,
    vehicles,
    activeTenant,
    activeTenantId,
    setSelectedMaintenanceId,
    setIsNewWorkOrderModalOpen,
    setIsNewScheduleModalOpen,
    setIsNewProviderModalOpen,
    createMaintenanceRequest,
    evaluateMaintenanceDue,
  } = useApp();

  const [activeTab, setActiveTab] = useState<"orders" | "schedules" | "due" | "providers">("orders");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [dispatchingScheduleId,setDispatchingScheduleId]=useState<string|null>(null);

  const tenantOrders = useMemo(
    () => (maintenanceWorkOrders || []).filter((m) => m.tenantId === activeTenantId),
    [maintenanceWorkOrders, activeTenantId]
  );

  const tenantSchedules = useMemo(
    () => (maintenanceSchedules || []).filter((s) => s.tenantId === activeTenantId),
    [maintenanceSchedules, activeTenantId]
  );

  const tenantProviders = useMemo(
    () => (serviceProviders || []).filter((p) => p.tenantId === activeTenantId),
    [serviceProviders, activeTenantId]
  );

  const tenantVehicles = useMemo(
    () => (vehicles || []).filter((v) => v.tenantId === activeTenantId),
    [vehicles, activeTenantId]
  );

  const dueResults = useMemo(
    () => evaluateMaintenanceDue(),
    [evaluateMaintenanceDue]
  );

  const overdueCount = dueResults.filter((r) => r.status === "OVERDUE").length;
  const dueSoonCount = dueResults.filter((r) => r.status === "DUE_SOON").length;

  const inProgressCount = tenantOrders.filter((o) => o.status === "IN_PROGRESS").length;
  const requestedCount = tenantOrders.filter((o) => o.status === "REQUESTED").length;
  const scheduledCount = tenantOrders.filter((o) => o.status === "SCHEDULED").length;
  const vehiclesInMaintCount = tenantVehicles.filter((v) => v.availabilityStatus === "MAINTENANCE").length;

  const totalCost = tenantOrders
    .filter((o) => o.status === "COMPLETED" || o.status === "VERIFIED")
    .reduce((sum, o) => sum + (o.actualCost || o.estimatedCost || 0), 0);

  // Filtered Work Orders
  const filteredOrders = useMemo(() => {
    return tenantOrders.filter((o) => {
      const matchesStatus = statusFilter === "ALL" || o.status === statusFilter;
      const v = tenantVehicles.find((veh) => veh.id === o.vehicleId);
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        o.maintenanceNumber.toLowerCase().includes(q) ||
        o.reason.toLowerCase().includes(q) ||
        (o.garageName && o.garageName.toLowerCase().includes(q)) ||
        (v && v.registrationPlate.toLowerCase().includes(q)) ||
        (v && `${v.make} ${v.model}`.toLowerCase().includes(q));

      return matchesStatus && matchesSearch;
    });
  }, [tenantOrders, statusFilter, searchQuery, tenantVehicles]);

  const getStatusBadge = (status: string) => {
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

  const handleSpawnOrderFromDue = (result: (typeof dueResults)[0]) => {
    if(dispatchingScheduleId===result.scheduleId)return;
    const existing=tenantOrders.find(order=>order.vehicleId===result.vehicleId&&order.sourceType==="SCHEDULE"&&order.sourceId===result.scheduleId&&!["COMPLETED","VERIFIED","CANCELLED"].includes(order.status));
    if(existing){setSelectedMaintenanceId(existing.id);return;}
    const v = tenantVehicles.find((veh) => veh.id === result.vehicleId);
    if (!v) return;

    setDispatchingScheduleId(result.scheduleId);
    try{
      const created=createMaintenanceRequest({
        vehicleId: v.id,
        maintenanceType: result.maintenanceType,
        priority: result.status === "OVERDUE" || result.isSafetyCritical ? "CRITICAL" : "NORMAL",
        reason: `Preventive service trigger: ${result.scheduleName}`,
        description: result.reasons?.join(". ") || "Preventive maintenance due threshold reached",
        isSafetyCritical: result.isSafetyCritical,
        sourceType: "SCHEDULE",
        sourceId: result.scheduleId,
      });
      if(created)setSelectedMaintenanceId(created.id);
    }finally{
      window.setTimeout(()=>setDispatchingScheduleId(current=>current===result.scheduleId?null:current),400);
    }
  };

  return (
    <div id="maintenance-view" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Fleet Maintenance & Repair Operations
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold">
              Sprint 17 Ready
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Canonical lifecycle state engine, preventive intervals, garage dispatch, and strict vehicle availability blocking.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button disabled={restoration} aria-describedby="restoration-actions-note"
            onClick={() => setIsNewScheduleModalOpen(true)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Calendar className="w-4 h-4 text-blue-500" />
            <span>New Schedule</span>
          </button>

          <button disabled={restoration} aria-describedby="restoration-actions-note"
            onClick={() => setIsNewProviderModalOpen(true)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Building2 className="w-4 h-4 text-purple-500" />
            <span>Add Garage</span>
          </button>

          <button disabled={restoration} aria-describedby="restoration-actions-note"
            onClick={() => setIsNewWorkOrderModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>New Work Order</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium">Active Jobs</span>
            <Wrench className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {inProgressCount + scheduledCount + requestedCount}
          </p>
          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
            {inProgressCount} in workshop
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium">Grounded / Hold</span>
            <Car className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
            {vehiclesInMaintCount}
          </p>
          <span className="text-[10px] text-slate-400">Blocked in Availability</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium">Service Overdue</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
            {overdueCount}
          </p>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
            +{dueSoonCount} due soon
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium">Completed Spend</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono truncate">
            {activeTenant.currencySymbol} {totalCost.toLocaleString()}
          </p>
          <span className="text-[10px] text-slate-400">Source ledger facts</span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-xs font-medium">Garage Network</span>
            <Building2 className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {tenantProviders.length}
          </p>
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">Approved vendors</span>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-2">
        <div className="flex items-center gap-2">
          {[
            { id: "orders", label: `Work Orders (${tenantOrders.length})`, icon: Wrench },
            { id: "schedules", label: `Preventive Schedules (${tenantSchedules.length})`, icon: Calendar },
            { id: "due", label: `Service Due & Alerts (${dueResults.filter((r) => r.status !== "OK").length})`, icon: AlertTriangle },
            { id: "providers", label: `Garages & Vendors (${tenantProviders.length})`, icon: Building2 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search work orders, plates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* TAB 1: WORK ORDERS */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          {/* Status Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {[
              { id: "ALL", label: "All Orders" },
              { id: "REQUESTED", label: `Requested (${requestedCount})` },
              { id: "SCHEDULED", label: `Scheduled (${scheduledCount})` },
              { id: "IN_PROGRESS", label: `In Progress (${inProgressCount})` },
              { id: "COMPLETED", label: `Completed (${tenantOrders.filter((o) => o.status === "COMPLETED").length})` },
              { id: "VERIFIED", label: `Verified (${tenantOrders.filter((o) => o.status === "VERIFIED").length})` },
              { id: "CANCELLED", label: "Cancelled" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1 rounded-lg font-semibold whitespace-nowrap transition-colors ${
                  statusFilter === f.id
                    ? "bg-emerald-600 text-white shadow-2xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Orders Table */}
          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
              <Wrench className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No maintenance work orders found</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting filters or submit a new service request</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 dark:bg-slate-900/60 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-5 py-3">Work Order #</th>
                      <th className="px-5 py-3">Vehicle</th>
                      <th className="px-5 py-3">Type & Reason</th>
                      <th className="px-5 py-3">Workshop</th>
                      <th className="px-5 py-3">Dates & Odo</th>
                      <th className="px-5 py-3">Cost</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-750 font-medium">
                    {filteredOrders.map((order) => {
                      const v = tenantVehicles.find((veh) => veh.id === order.vehicleId);

                      return (
                        <tr
                          key={order.id}
                          onClick={() => setSelectedMaintenanceId(order.id)}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-750/50 cursor-pointer transition-colors"
                        >
                          {/* Order Number & Priority */}
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900 dark:text-white">
                                {order.maintenanceNumber}
                              </span>
                              {order.isSafetyCritical && (
                                <span title="Safety Critical">
                                  <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Priority: {order.priority}
                            </span>
                          </td>

                          {/* Vehicle */}
                          <td className="px-5 py-3.5">
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {v?.registrationPlate}
                            </span>
                            <p className="text-[11px] text-slate-500">
                              {v?.make} {v?.model}
                            </p>
                          </td>

                          {/* Type & Reason */}
                          <td className="px-5 py-3.5 max-w-xs">
                            <span className="font-semibold text-slate-900 dark:text-white block truncate">
                              {order.reason}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {order.maintenanceType.replace(/_/g, " ")}
                            </span>
                          </td>

                          {/* Garage */}
                          <td className="px-5 py-3.5">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {order.garageName || "Unassigned"}
                            </span>
                            {order.assignedTechnician && (
                              <p className="text-[10px] text-slate-400">Tech: {order.assignedTechnician}</p>
                            )}
                          </td>

                          {/* Dates & Odo */}
                          <td className="px-5 py-3.5 text-[11px]">
                            <span className="text-slate-700 dark:text-slate-300 font-mono">
                              {new Date(order.requestedAt).toLocaleDateString()}
                            </span>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {order.startOdometer
                                ? `${order.startOdometer.toLocaleString()} km`
                                : v
                                ? `${v.odometer.toLocaleString()} km`
                                : ""}
                            </p>
                          </td>

                          {/* Cost */}
                          <td className="px-5 py-3.5">
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {activeTenant.currencySymbol}{" "}
                              {(order.actualCost || order.estimatedCost || 0).toLocaleString()}
                            </span>
                            {order.actualCost ? (
                              <span className="block text-[10px] text-emerald-600 font-semibold">Actual</span>
                            ) : (
                              <span className="block text-[10px] text-slate-400">Estimated</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-5 py-3.5">
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${getStatusBadge(order.status)}`}>
                              {order.status}
                            </span>
                          </td>

                          {/* Action */}
                          <td className="px-5 py-3.5 text-right">
                            <button disabled={restoration} aria-describedby="restoration-actions-note"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMaintenanceId(order.id);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-[11px] font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                            >
                              Manage
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PREVENTIVE SCHEDULES */}
      {activeTab === "schedules" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Preventive Maintenance Plans
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Automatic mileage triggers and calendar intervals for routine servicing
              </p>
            </div>
            <button disabled={restoration} aria-describedby="restoration-actions-note"
              onClick={() => setIsNewScheduleModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Schedule</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tenantSchedules.map((sch) => {
              const v = sch.vehicleId ? tenantVehicles.find((veh) => veh.id === sch.vehicleId) : null;

              return (
                <div
                  key={sch.id}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="font-bold text-xs text-slate-900 dark:text-white">{sch.name}</h3>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {sch.maintenanceType.replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>
                      {sch.isSafetyCritical && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3" /> Safety
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/60">
                      <div>
                        <span className="text-slate-400">Distance Interval</span>
                        <p className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {sch.intervalDistanceKm ? `${sch.intervalDistanceKm.toLocaleString()} km` : "N/A"}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Time Interval</span>
                        <p className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {sch.intervalDays ? `${sch.intervalDays} days` : "N/A"}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Target Vehicle</span>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {v ? v.registrationPlate : "Entire Fleet"}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-400">Status</span>
                        <span className="text-emerald-600 font-bold text-[10px]">ACTIVE</span>
                      </div>
                    </div>

                    {sch.notes && (
                      <p className="text-[11px] text-slate-500 italic">"{sch.notes}"</p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700/80 flex items-center justify-between text-xs">
                    <span className="text-[10px] text-slate-400">
                      Threshold: {sch.dueSoonDistanceThresholdKm}km / {sch.dueSoonDaysThreshold}d
                    </span>
                    <button disabled={restoration} aria-describedby="restoration-actions-note"
                      onClick={() => {
                        if (v) {
                          createMaintenanceRequest({
                            vehicleId: v.id,
                            maintenanceType: sch.maintenanceType,
                            reason: `Manual trigger: ${sch.name}`,
                            sourceType: "SCHEDULE",
                            sourceId: sch.id,
                          });
                        } else {
                          setIsNewWorkOrderModalOpen(true);
                        }
                      }}
                      className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold text-[11px] flex items-center gap-1"
                    >
                      <span>Dispatch Job</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: DUE & OVERDUE MATRIX */}
      {activeTab === "due" && (
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Preventive Maintenance Due Matrix
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Real-time synchronization between vehicle odometers, elapsed service days, and safety rules
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 dark:bg-slate-900/60 text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-5 py-3">Vehicle</th>
                    <th className="px-5 py-3">Schedule / Requirement</th>
                    <th className="px-5 py-3">Current Odometer</th>
                    <th className="px-5 py-3">Remaining Distance / Days</th>
                    <th className="px-5 py-3">Compliance State</th>
                    <th className="px-5 py-3 text-right">Dispatch Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-750 font-medium">
                  {dueResults.map((result, idx) => {
                    const v = tenantVehicles.find((veh) => veh.id === result.vehicleId);

                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-750/40">
                        <td className="px-5 py-3.5">
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {v?.registrationPlate}
                          </span>
                          <p className="text-[11px] text-slate-500">
                            {v?.make} {v?.model}
                          </p>
                        </td>

                        <td className="px-5 py-3.5">
                          <span className="font-semibold text-slate-900 dark:text-white block">
                            {result.scheduleName}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {result.maintenanceType.replace(/_/g, " ")}
                          </span>
                        </td>

                        <td className="px-5 py-3.5 font-mono text-slate-800 dark:text-slate-200">
                          {v?.odometer.toLocaleString()} km
                        </td>

                        <td className="px-5 py-3.5 text-[11px]">
                          {result.distanceRemainingKm !== undefined && (
                            <span
                              className={`font-mono font-semibold block ${
                                result.distanceRemainingKm <= 0 ? "text-rose-600 font-bold" : "text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              {result.distanceRemainingKm <= 0
                                ? `${Math.abs(result.distanceRemainingKm).toLocaleString()} km OVERDUE`
                                : `${result.distanceRemainingKm.toLocaleString()} km remaining`}
                            </span>
                          )}
                          {result.daysRemaining !== undefined && (
                            <span
                              className={`text-[10px] font-mono ${
                                result.daysRemaining <= 0 ? "text-rose-600 font-bold" : "text-slate-400"
                              }`}
                            >
                              {result.daysRemaining <= 0
                                ? `${Math.abs(result.daysRemaining)} days overdue`
                                : `${result.daysRemaining} days remaining`}
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-3.5">
                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                              result.status === "OVERDUE"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200"
                                : result.status === "DUE_SOON"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200"
                                : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200"
                            }`}
                          >
                            {result.status}
                          </span>
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          {(()=>{
                            const activeOrder=tenantOrders.find(order=>order.vehicleId===result.vehicleId&&order.sourceType==="SCHEDULE"&&order.sourceId===result.scheduleId&&!["COMPLETED","VERIFIED","CANCELLED"].includes(order.status));
                            const dispatching=dispatchingScheduleId===result.scheduleId;
                            return <button disabled={restoration||Boolean(activeOrder)||dispatching} aria-describedby="restoration-actions-note"
                              onClick={() => handleSpawnOrderFromDue(result)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-600 text-white font-bold text-[11px] shadow-xs transition-colors flex items-center gap-1 ml-auto"
                            >
                              {activeOrder?<CheckCircle2 className="w-3 h-3"/>:<Wrench className="w-3 h-3"/>}
                              <span>{activeOrder?`Active · ${activeOrder.maintenanceNumber}`:dispatching?"Dispatching…":"Dispatch Work Order"}</span>
                            </button>;
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: GARAGES & SERVICE PROVIDERS */}
      {activeTab === "providers" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Approved Garages & Service Vendors
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Partnered repair shops, specialized mechanics, and external workshops
              </p>
            </div>
            <button disabled={restoration} aria-describedby="restoration-actions-note"
              onClick={() => setIsNewProviderModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Garage</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tenantProviders.map((provider) => {
              const activeJobs = tenantOrders.filter(
                (o) => o.garageId === provider.id && (o.status === "SCHEDULED" || o.status === "IN_PROGRESS")
              ).length;

              return (
                <div
                  key={provider.id}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">{provider.name}</h3>
                        <p className="text-[11px] text-slate-400">{provider.location}</p>
                      </div>
                    </div>
                    <span className="font-bold text-xs text-amber-500">⭐ {provider.rating || "5.0"}</span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    {provider.contactPerson && (
                      <p className="text-[11px]">Contact: <span className="font-semibold text-slate-900 dark:text-white">{provider.contactPerson}</span></p>
                    )}
                    {provider.phone && (
                      <p className="text-[11px] font-mono">Phone: {provider.phone}</p>
                    )}
                    {provider.email && (
                      <p className="text-[11px]">Email: {provider.email}</p>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase block mb-1">Services</span>
                    <div className="flex flex-wrap gap-1">
                      {provider.servicesProvided?.map((svc) => (
                        <span key={svc} className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          {svc}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs">
                    <span className="text-purple-600 dark:text-purple-400 font-bold text-xs">
                      {activeJobs} Active Jobs
                    </span>
                    <span className="text-[10px] text-emerald-600 font-bold">APPROVED VENDOR</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
