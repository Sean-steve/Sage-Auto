import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Car,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileWarning,
  Fuel,
  Gauge,
  History,
  KeyRound,
  Loader2,
  MapPin,
  RefreshCw,
  Route,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { useApp } from "../lib/store";
import { apiClient } from "../lib/api-client";
import { Rental, RentalState } from "../types";

type ActionMode = "EXTEND" | "INCIDENT" | "RETURN" | null;

const ACTIVE_STATES: RentalState[] = [
  "ACTIVE_ON_ROAD",
  "OVERDUE",
  "RETURN_SCHEDULED",
  "VEHICLE_RECEIVED",
  "RETURN_INSPECTION_PENDING",
  "INSPECTION",
  "DAMAGE_ASSESSMENT",
  "FINAL_CALCULATION",
  "FINAL_SETTLEMENT_PENDING",
  "DEPOSIT_PROCESSING",
];

const stateLabel = (state: string) => state.replace(/_/g, " ");

const stateBadgeClass = (state: RentalState) => {
  if (state === "ACTIVE_ON_ROAD") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";
  if (state === "OVERDUE") return "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300";
  if (state === "RETURN_SCHEDULED" || state === "RETURN_INSPECTION_PENDING" || state === "VEHICLE_RECEIVED")
    return "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300";
  if (state === "FINAL_CALCULATION" || state === "FINAL_SETTLEMENT_PENDING" || state === "DEPOSIT_PROCESSING")
    return "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300";
  if (state === "COMPLETED" || state === "RETURN_COMPLETED")
    return "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300";
  return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300";
};

export const RentalsView: React.FC = () => {
  const {
    rentals: cachedRentals,
    vehicles,
    customers,
    drivers,
    bookings,
    activeTenant,
    activeTenantId,
    searchQuery,
    restoration,
    hasPermission,
    showNotification,
    setCurrentView,
  } = useApp();

  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState("ACTIVE");
  const [selectedRentalId, setSelectedRentalId] = useState<string | null>(null);
  const [startSnapshot, setStartSnapshot] = useState<any>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [submitting, setSubmitting] = useState(false);

  const [extensionEnd, setExtensionEnd] = useState("");
  const [extensionReason, setExtensionReason] = useState("");

  const [incidentType, setIncidentType] = useState("ACCIDENT");
  const [incidentDescription, setIncidentDescription] = useState("");
  const [incidentLocation, setIncidentLocation] = useState("");
  const [incidentPoliceRef, setIncidentPoliceRef] = useState("");
  const [incidentEstimatedCost, setIncidentEstimatedCost] = useState("0");

  const [returnAt, setReturnAt] = useState("");
  const [returnLocation, setReturnLocation] = useState("");
  const [returnNotes, setReturnNotes] = useState("");

  const loadRentals = useCallback(async () => {
    setLoading(true);
    const response = await apiClient.rentals.listRentals();
    if (!response.error && Array.isArray(response.data)) {
      setRentals(response.data as Rental[]);
    } else {
      setRentals(cachedRentals.filter((r) => r.tenantId === activeTenantId));
    }
    setLoading(false);
  }, [activeTenantId, cachedRentals]);

  useEffect(() => {
    void loadRentals();
  }, [loadRentals]);

  useEffect(() => {
    if (!selectedRentalId) {
      setStartSnapshot(null);
      return;
    }
    void apiClient.rentals.getStartSnapshot(selectedRentalId).then((response) => {
      if (!response.error) setStartSnapshot(response.data || null);
    });
  }, [selectedRentalId]);

  const selectedRental = rentals.find((r) => r.id === selectedRentalId) || null;

  const filteredRentals = useMemo(() => {
    return rentals.filter((r) => {
      if (r.tenantId !== activeTenantId) return false;
      if (stateFilter === "ACTIVE" && !ACTIVE_STATES.includes(r.state)) return false;
      if (stateFilter !== "ALL" && stateFilter !== "ACTIVE" && r.state !== stateFilter) return false;

      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      const vehicle = vehicles.find((v) => v.id === r.vehicleId);
      const customer = customers.find((c) => c.id === r.customerId);
      const driver = drivers.find((d) => d.id === r.driverId);
      return [
        r.rentalNumber,
        vehicle?.registrationPlate,
        vehicle?.make,
        vehicle?.model,
        customer?.fullName,
        driver?.fullName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [activeTenantId, customers, drivers, rentals, searchQuery, stateFilter, vehicles]);

  const metrics = useMemo(() => {
    const tenantRentals = rentals.filter((r) => r.tenantId === activeTenantId);
    const now = Date.now();
    const next24h = now + 24 * 60 * 60 * 1000;
    return {
      active: tenantRentals.filter((r) => r.state === "ACTIVE_ON_ROAD").length,
      overdue: tenantRentals.filter((r) => r.state === "OVERDUE" || (r.state === "ACTIVE_ON_ROAD" && new Date(r.scheduledEnd).getTime() < now)).length,
      returnsSoon: tenantRentals.filter((r) => {
        const end = new Date(r.scheduledEnd).getTime();
        return ACTIVE_STATES.includes(r.state) && end >= now && end <= next24h;
      }).length,
      extensionRequests: tenantRentals.reduce(
        (count, r) => count + (r.extensions || []).filter((e: any) => e.status === "REQUESTED").length,
        0
      ),
      openIncidents: tenantRentals.reduce(
        (count, r) => count + (r.incidents || []).filter((i) => !i.resolved).length,
        0
      ),
    };
  }, [activeTenantId, rentals]);

  const refreshOne = async (rentalId: string) => {
    const response = await apiClient.rentals.getRental(rentalId);
    if (!response.error && response.data) {
      const rental = response.data as Rental;
      setRentals((prev) => [rental, ...prev.filter((item) => item.id !== rental.id)]);
      return rental;
    }
    return null;
  };

  const handleDispatch = async (rental: Rental) => {
    setSubmitting(true);
    try {
      const readiness = await apiClient.rentals.getReadiness(rental.bookingId);
      if (readiness.error) throw new Error(readiness.error.message);
      const result = readiness.data as any;
      if (!result?.isReady) {
        throw new Error((result?.blockers || [])[0] || "Rental dispatch prerequisites are incomplete.");
      }
      const response = await apiClient.rentals.startRental({
        bookingId: rental.bookingId,
        idempotencyKey: `dispatch:${activeTenantId}:${rental.bookingId}`,
      });
      if (response.error || !response.data) throw new Error(response.error?.message || "Dispatch failed.");
      const authoritative = response.data as Rental;
      setRentals((prev) => [authoritative, ...prev.filter((item) => item.bookingId !== rental.bookingId && item.id !== authoritative.id)]);
      showNotification(`Rental ${authoritative.rentalNumber} is ACTIVE ON ROAD.`);
      setSelectedRentalId(authoritative.id);
    } catch (error: any) {
      showNotification(error.message || "Unable to dispatch rental.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExtensionRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRental || !extensionEnd) return;
    setSubmitting(true);
    try {
      const response = await apiClient.rentals.requestExtension(selectedRental.id, {
        newEndDate: new Date(extensionEnd).toISOString(),
        reason: extensionReason || "Customer requested extension",
        idempotencyKey: `extension:${selectedRental.id}:${new Date(extensionEnd).toISOString()}`,
      });
      if (response.error) throw new Error(response.error.message);
      await refreshOne(selectedRental.id);
      showNotification("Extension request recorded. Approval is required before the rental end date changes.");
      setActionMode(null);
      setExtensionEnd("");
      setExtensionReason("");
    } catch (error: any) {
      showNotification(error.message || "Unable to request extension.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExtensionDecision = async (extensionId: string, approve: boolean) => {
    if (!selectedRental) return;
    setSubmitting(true);
    try {
      const response = approve
        ? await apiClient.rentals.approveExtension(selectedRental.id, extensionId, {})
        : await apiClient.rentals.rejectExtension(selectedRental.id, extensionId, { rejectionReason: "Rejected by rental operator" });
      if (response.error) throw new Error(response.error.message);
      await refreshOne(selectedRental.id);
      showNotification(approve ? "Extension approved and rental schedule updated." : "Extension request rejected.");
    } catch (error: any) {
      showNotification(error.message || "Unable to process extension.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleIncident = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRental) return;
    setSubmitting(true);
    try {
      const response = await apiClient.rentals.recordIncident(selectedRental.id, {
        type: incidentType,
        description: incidentDescription.trim(),
        location: incidentLocation.trim(),
        policeReportNumber: incidentPoliceRef.trim() || undefined,
        estimatedCost: Number(incidentEstimatedCost || 0),
        reportedAt: new Date().toISOString(),
      });
      if (response.error) throw new Error(response.error.message);
      await refreshOne(selectedRental.id);
      showNotification("Incident recorded in the rental dossier and audit trail.");
      setActionMode(null);
      setIncidentDescription("");
      setIncidentLocation("");
      setIncidentPoliceRef("");
      setIncidentEstimatedCost("0");
    } catch (error: any) {
      showNotification(error.message || "Unable to record incident.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleScheduleReturn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRental || !returnAt) return;
    setSubmitting(true);
    try {
      const response = await apiClient.rentals.scheduleReturn(selectedRental.id, {
        scheduledReturnAt: new Date(returnAt).toISOString(),
        scheduledReturnLocationId: returnLocation.trim() || undefined,
        notes: returnNotes.trim() || undefined,
        idempotencyKey: `return:${selectedRental.id}:${new Date(returnAt).toISOString()}`,
      });
      if (response.error) throw new Error(response.error.message);
      await refreshOne(selectedRental.id);
      showNotification("Return scheduled. Physical receipt and final calculation continue in the Return experience.");
      setActionMode(null);
      setReturnAt("");
      setReturnLocation("");
      setReturnNotes("");
    } catch (error: any) {
      showNotification(error.message || "Unable to schedule return.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateTime = (value?: string) =>
    value ? new Date(value).toLocaleString() : "—";

  return (
    <div id="rentals-view" className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Route className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-950 dark:text-white">Rental Operations</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Dispatch authority, on-road control, extensions, incidents, overdue attention and return handoff.
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => void loadRentals()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh operations
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Active on road", metrics.active, Car],
          ["Overdue", metrics.overdue, AlertTriangle],
          ["Returns <24h", metrics.returnsSoon, CalendarClock],
          ["Extension requests", metrics.extensionRequests, Clock3],
          ["Open incidents", metrics.openIncidents, FileWarning],
        ].map(([label, value, Icon]: any) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
              <Icon className="h-4 w-4 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-950 dark:text-white">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        {["ACTIVE", "OVERDUE", "RETURN_SCHEDULED", "FINAL_SETTLEMENT_PENDING", "COMPLETED", "ALL"].map((state) => (
          <button
            key={state}
            onClick={() => setStateFilter(state)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              stateFilter === state
                ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {stateLabel(state)}
          </button>
        ))}
      </div>

      {loading && rentals.length === 0 ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
        </div>
      ) : filteredRentals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <Car className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="font-semibold text-slate-700 dark:text-slate-200">No rentals match this operational view.</p>
          <p className="mt-1 text-xs text-slate-400">A rental appears here only after the booking, contract, handover and compliance gates permit dispatch.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRentals.map((rental) => {
            const vehicle = vehicles.find((v) => v.id === rental.vehicleId);
            const customer = customers.find((c) => c.id === rental.customerId);
            const driver = drivers.find((d) => d.id === rental.driverId);
            const booking = bookings.find((b) => b.id === rental.bookingId);
            const isLate =
              (rental.state === "ACTIVE_ON_ROAD" && new Date(rental.scheduledEnd).getTime() < Date.now()) ||
              rental.state === "OVERDUE";
            const pendingExtensions = (rental.extensions || []).filter((e: any) => e.status === "REQUESTED").length;
            const openIncidents = (rental.incidents || []).filter((i) => !i.resolved).length;

            return (
              <button
                key={rental.id}
                onClick={() => setSelectedRentalId(rental.id)}
                className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:border-emerald-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-emerald-800 sm:p-5"
              >
                <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-slate-950 dark:text-white">{rental.rentalNumber}</span>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${stateBadgeClass(rental.state)}`}>
                        {stateLabel(rental.state)}
                      </span>
                      {isLate && <span className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">ATTENTION</span>}
                    </div>
                    <div className="grid gap-2 text-xs sm:grid-cols-2">
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <Car className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span className="truncate font-semibold">
                          {vehicle ? `${vehicle.registrationPlate} · ${vehicle.make} ${vehicle.model}` : rental.vehicleId}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <User className="h-4 w-4 shrink-0 text-blue-600" />
                        <span className="truncate font-semibold">{customer?.fullName || rental.customerId}</span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
                      <span>Booking {booking?.bookingNumber || rental.bookingId}</span>
                      <span>Driver {driver?.fullName || "Primary renter"}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/60">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Due back</p>
                      <p className={`mt-1 font-semibold ${isLate ? "text-rose-600" : "text-slate-800 dark:text-slate-200"}`}>
                        {formatDateTime(rental.scheduledEnd)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Start condition</p>
                      <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
                        {rental.checkoutOdometer.toLocaleString()} km · {rental.checkoutFuelLevel}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Extensions</p>
                      <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
                        {(rental.extensions || []).length}{pendingExtensions ? ` · ${pendingExtensions} pending` : ""}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Incidents</p>
                      <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">
                        {(rental.incidents || []).length}{openIncidents ? ` · ${openIncidents} open` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    Open dossier <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedRental && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm">
          <button aria-label="Close rental dossier" className="absolute inset-0 cursor-default" onClick={() => setSelectedRentalId(null)} />
          <div className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start justify-between border-b border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-bold text-slate-950 dark:text-white">{selectedRental.rentalNumber}</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${stateBadgeClass(selectedRental.state)}`}>
                    {stateLabel(selectedRental.state)}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Authoritative on-road dossier · Booking {bookings.find((b) => b.id === selectedRental.bookingId)?.bookingNumber || selectedRental.bookingId}
                </p>
              </div>
              <button onClick={() => setSelectedRentalId(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Vehicle & start snapshot</p>
                  <div className="space-y-2 text-xs">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {(() => {
                        const vehicle = vehicles.find((v) => v.id === selectedRental.vehicleId);
                        return vehicle ? `${vehicle.registrationPlate} · ${vehicle.make} ${vehicle.model}` : selectedRental.vehicleId;
                      })()}
                    </p>
                    <div className="flex items-center gap-2 text-slate-500"><Gauge className="h-3.5 w-3.5" /> {selectedRental.checkoutOdometer.toLocaleString()} km at dispatch</div>
                    <div className="flex items-center gap-2 text-slate-500"><Fuel className="h-3.5 w-3.5" /> {selectedRental.checkoutFuelLevel}% fuel at dispatch</div>
                    <div className="flex items-center gap-2 text-slate-500"><Clock3 className="h-3.5 w-3.5" /> Started {formatDateTime(selectedRental.actualStart)}</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Commercial & return window</p>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Scheduled return</span><strong>{formatDateTime(selectedRental.scheduledEnd)}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Deposit requirement</span><strong>{activeTenant.currencySymbol} {Number(startSnapshot?.depositRequirement || 0).toLocaleString()}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Contract version</span><strong>v{startSnapshot?.contractVersion || "—"}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Immutable pricing</span><strong>{startSnapshot?.pricingSnapshot ? "Captured" : "Loading…"}</strong></div>
                  </div>
                </div>
              </div>

              {(selectedRental.state === "ACTIVE_ON_ROAD" || selectedRental.state === "OVERDUE" || selectedRental.state === "SCHEDULED_HANDOVER") && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">Operational controls</p>
                      <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400">Actions are permission-gated and persisted by the Rental service.</p>
                    </div>
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedRental.state === "SCHEDULED_HANDOVER" && hasPermission("rental.start") && (
                      <button
                        disabled={restoration || submitting}
                        onClick={() => void handleDispatch(selectedRental)}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Verify & dispatch
                      </button>
                    )}
                    {(selectedRental.state === "ACTIVE_ON_ROAD" || selectedRental.state === "OVERDUE") && hasPermission("rental.extend") && (
                      <button onClick={() => setActionMode("EXTEND")} className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300">
                        Request extension
                      </button>
                    )}
                    {(selectedRental.state === "ACTIVE_ON_ROAD" || selectedRental.state === "OVERDUE") && hasPermission("rental.incident_report") && (
                      <button onClick={() => setActionMode("INCIDENT")} className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300">
                        Log incident
                      </button>
                    )}
                    {(selectedRental.state === "ACTIVE_ON_ROAD" || selectedRental.state === "OVERDUE") && hasPermission("rental.return_schedule") && (
                      <button onClick={() => setActionMode("RETURN")} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800">
                        Schedule return <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-slate-400" />
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Extensions</h3>
                </div>
                {(selectedRental.extensions || []).length === 0 ? (
                  <p className="text-xs text-slate-400">No extension activity.</p>
                ) : (
                  <div className="space-y-2">
                    {(selectedRental.extensions || []).map((extension: any) => (
                      <div key={extension.id} className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">{extension.extensionNumber || extension.id}</p>
                            <p className="mt-1 text-slate-500">
                              {formatDateTime(extension.previousEndDate)} → {formatDateTime(extension.newEndDate)}
                            </p>
                          </div>
                          <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold dark:bg-slate-800">{extension.status || "REQUESTED"}</span>
                        </div>
                        {extension.status === "REQUESTED" && hasPermission("rental.extend") && (
                          <div className="mt-3 flex gap-2">
                            <button disabled={submitting} onClick={() => void handleExtensionDecision(extension.id, true)} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-semibold text-white">Approve</button>
                            <button disabled={submitting} onClick={() => void handleExtensionDecision(extension.id, false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">Reject</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center gap-2">
                  <FileWarning className="h-4 w-4 text-slate-400" />
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Incidents</h3>
                </div>
                {(selectedRental.incidents || []).length === 0 ? (
                  <p className="text-xs text-slate-400">No incidents recorded for this rental.</p>
                ) : (
                  <div className="space-y-2">
                    {(selectedRental.incidents || []).map((incident) => (
                      <div key={incident.id} className="rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900 dark:text-white">{stateLabel(incident.type)}</span>
                          <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${incident.resolved ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                            {incident.resolved ? "RESOLVED" : "OPEN"}
                          </span>
                        </div>
                        <p className="mt-2 text-slate-600 dark:text-slate-300">{incident.description}</p>
                        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{incident.location}</span>
                          <span>{formatDateTime(incident.reportedAt)}</span>
                          <span>{activeTenant.currencySymbol} {Number(incident.estimatedCost || 0).toLocaleString()} exposure</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-3 flex items-center gap-2">
                  <History className="h-4 w-4 text-slate-400" />
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Lifecycle position</h3>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                  {[
                    ["Dispatch", !!selectedRental.actualStart],
                    ["On road", ["ACTIVE_ON_ROAD", "OVERDUE", "RETURN_SCHEDULED"].includes(selectedRental.state)],
                    ["Return", ["RETURN_SCHEDULED", "VEHICLE_RECEIVED", "RETURN_INSPECTION_PENDING", "INSPECTION", "DAMAGE_ASSESSMENT"].includes(selectedRental.state)],
                    ["Settlement", ["FINAL_CALCULATION", "FINAL_SETTLEMENT_PENDING", "DEPOSIT_PROCESSING", "COMPLETED", "RETURN_COMPLETED"].includes(selectedRental.state)],
                  ].map(([label, done]: any) => (
                    <div key={label} className={`rounded-xl border p-3 text-center text-[11px] font-semibold ${done ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300" : "border-slate-200 text-slate-400 dark:border-slate-800"}`}>
                      {done ? <CheckCircle2 className="mx-auto mb-1 h-4 w-4" /> : <Clock3 className="mx-auto mb-1 h-4 w-4" />}
                      {label}
                    </div>
                  ))}
                </div>
              </div>

              {selectedRental.state === "RETURN_SCHEDULED" && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs dark:border-blue-900 dark:bg-blue-950/20">
                  <div className="flex items-start gap-3">
                    <ClipboardCheck className="mt-0.5 h-5 w-5 text-blue-600" />
                    <div className="flex-1">
                      <p className="font-bold text-blue-900 dark:text-blue-200">Return handoff is active</p>
                      <p className="mt-1 text-blue-700 dark:text-blue-300">
                        Rental Operations has completed its handoff. Vehicle receipt, return inspection, damage assessment, final calculation and deposit settlement continue in the Return & Final Calculation experience.
                      </p>
                      <button
                        onClick={() => {
                          setSelectedRentalId(null);
                          setCurrentView("returns");
                        }}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-800"
                      >
                        Open Return & Final Calculation <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {actionMode && selectedRental && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="font-bold text-slate-950 dark:text-white">
                  {actionMode === "EXTEND" ? "Request Rental Extension" : actionMode === "INCIDENT" ? "Record Rental Incident" : "Schedule Vehicle Return"}
                </h2>
                <p className="mt-1 text-xs text-slate-400">{selectedRental.rentalNumber} · all changes are persisted and audited.</p>
              </div>
              <button onClick={() => setActionMode(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>

            {actionMode === "EXTEND" && (
              <form onSubmit={handleExtensionRequest} className="space-y-4">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Requested new return date
                  <input type="datetime-local" required value={extensionEnd} onChange={(e) => setExtensionEnd(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Reason
                  <textarea required value={extensionReason} onChange={(e) => setExtensionReason(e.target.value)} rows={3} placeholder="Customer request, operational reason, notes…" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <p className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  Requesting does not mutate the rental dates. Availability/compliance are rechecked when an authorized operator approves.
                </p>
                <button disabled={submitting} className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                  {submitting ? "Submitting…" : "Submit extension request"}
                </button>
              </form>
            )}

            {actionMode === "INCIDENT" && (
              <form onSubmit={handleIncident} className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Incident type
                  <select value={incidentType} onChange={(e) => setIncidentType(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                    <option value="ACCIDENT">Accident</option>
                    <option value="MECHANICAL_BREAKDOWN">Mechanical breakdown</option>
                    <option value="TRAFFIC_FINE">Traffic fine</option>
                    <option value="THEFT">Theft</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Description
                  <textarea required value={incidentDescription} onChange={(e) => setIncidentDescription(e.target.value)} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Location
                    <input required value={incidentLocation} onChange={(e) => setIncidentLocation(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Estimated exposure
                    <input min="0" type="number" value={incidentEstimatedCost} onChange={(e) => setIncidentEstimatedCost(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                  </label>
                </div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Police / reference number
                  <input value={incidentPoliceRef} onChange={(e) => setIncidentPoliceRef(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <button disabled={submitting} className="w-full rounded-xl bg-rose-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                  {submitting ? "Recording…" : "Record incident"}
                </button>
              </form>
            )}

            {actionMode === "RETURN" && (
              <form onSubmit={handleScheduleReturn} className="space-y-4">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Planned return date & time
                  <input type="datetime-local" required value={returnAt} onChange={(e) => setReturnAt(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Return location / branch reference
                  <input value={returnLocation} onChange={(e) => setReturnLocation(e.target.value)} placeholder="Optional branch/location ID" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Notes
                  <textarea value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} rows={3} placeholder="Collection instructions, customer notes, expected condition…" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
                  This does not complete the rental or release the vehicle. It moves the dossier into RETURN SCHEDULED for the Return & Final Calculation workflow.
                </div>
                <button disabled={submitting} className="w-full rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
                  {submitting ? "Scheduling…" : "Schedule return"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
