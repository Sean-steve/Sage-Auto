import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  FileCheck2,
  Fuel,
  Gauge,
  Loader2,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { apiClient } from "../lib/api-client";
import { useApp } from "../lib/store";
import { OperationsLifecycleBar } from "./OperationsLifecycleBar";
import type { InspectionComparison, Rental, RentalFinalCalculation, RentalReturnRecord } from "../types";

type ActionMode = "RECEIVE" | "INSPECT" | "CALCULATE" | "COMPLETE" | null;

type DamageDraft = {
  bodyZone: string;
  damageType: string;
  severity: string;
  description: string;
  estimatedCost: number;
};

const RETURN_STATES = new Set([
  "RETURN_SCHEDULED",
  "VEHICLE_RECEIVED",
  "RETURN_INSPECTION_PENDING",
  "INSPECTION",
  "DAMAGE_ASSESSMENT",
  "FINAL_CALCULATION",
  "FINAL_SETTLEMENT_PENDING",
  "DEPOSIT_PROCESSING",
]);

const stateLabel = (value: string) => value.replace(/_/g, " ");

const badgeClass = (state: string) => {
  if (state === "RETURN_SCHEDULED") return "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300";
  if (state === "VEHICLE_RECEIVED" || state === "RETURN_INSPECTION_PENDING" || state === "INSPECTION")
    return "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300";
  if (state === "DAMAGE_ASSESSMENT") return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300";
  if (state === "FINAL_CALCULATION" || state === "FINAL_SETTLEMENT_PENDING")
    return "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300";
  if (state === "DEPOSIT_PROCESSING") return "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950/60 dark:text-fuchsia-300";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
};

const nowLocalInput = () => {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export const ReturnFinalCalculationView: React.FC = () => {
  const {
    vehicles,
    customers,
    activeTenant,
    activeTenantId,
    currentUser,
    searchQuery,
    restoration,
    hasPermission,
    showNotification,
    setCurrentView,
  } = useApp();

  const [rentals, setRentals] = useState<Rental[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("IN_RETURN");
  const [selectedRentalId, setSelectedRentalId] = useState<string | null>(null);
  const [returnRecord, setReturnRecord] = useState<RentalReturnRecord | null>(null);
  const [finalCalculation, setFinalCalculation] = useState<RentalFinalCalculation | null>(null);
  const [comparison, setComparison] = useState<InspectionComparison | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [submitting, setSubmitting] = useState(false);

  const [receivedAt, setReceivedAt] = useState(nowLocalInput());
  const [returnOdometer, setReturnOdometer] = useState("");
  const [returnFuel, setReturnFuel] = useState("100");
  const [returnLocation, setReturnLocation] = useState("");
  const [conditionNotes, setConditionNotes] = useState("");

  const [overallCondition, setOverallCondition] = useState("GOOD");
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [customerAcknowledged, setCustomerAcknowledged] = useState(false);
  const [customerSignerName, setCustomerSignerName] = useState("");
  const [damages, setDamages] = useState<DamageDraft[]>([]);
  const [damageZone, setDamageZone] = useState("FRONT_BUMPER");
  const [damageType, setDamageType] = useState("SCRATCH");
  const [damageSeverity, setDamageSeverity] = useState("MINOR");
  const [damageDescription, setDamageDescription] = useState("");
  const [damageCost, setDamageCost] = useState("0");

  const [fuelPrice, setFuelPrice] = useState("185");
  const [tankCapacity, setTankCapacity] = useState("55");
  const [refuelingFee, setRefuelingFee] = useState("500");
  const [lateHourlyRate, setLateHourlyRate] = useState("500");
  const [lateGraceHours, setLateGraceHours] = useState("1");
  const [additionalFeeLabel, setAdditionalFeeLabel] = useState("");
  const [additionalFeeAmount, setAdditionalFeeAmount] = useState("0");

  const [releaseStatus, setReleaseStatus] = useState("AVAILABLE");
  const [completionNotes, setCompletionNotes] = useState("");

  const selectedRental = rentals.find((r) => r.id === selectedRentalId) || null;

  const loadRentals = useCallback(async () => {
    setLoading(true);
    const response = await apiClient.rentals.listRentals();
    if (!response.error && Array.isArray(response.data)) {
      setRentals(response.data as Rental[]);
    } else if (response.error) {
      showNotification(response.error.message || "Unable to load return operations.", "error");
    }
    setLoading(false);
  }, [showNotification]);

  const refreshRental = useCallback(async (rentalId: string) => {
    const response = await apiClient.rentals.getRental(rentalId);
    if (!response.error && response.data) {
      const rental = response.data as Rental;
      setRentals((prev) => [rental, ...prev.filter((item) => item.id !== rental.id)]);
      return rental;
    }
    return null;
  }, []);

  const loadArtifacts = useCallback(async (rentalId: string) => {
    const [returnResponse, calcResponse, comparisonResponse] = await Promise.all([
      apiClient.rentals.getReturnRecord(rentalId),
      apiClient.rentals.getFinalCalculation(rentalId),
      apiClient.inspections.getRentalComparison(rentalId),
    ]);
    setReturnRecord(!returnResponse.error && returnResponse.data ? (returnResponse.data as RentalReturnRecord) : null);
    setFinalCalculation(!calcResponse.error && calcResponse.data ? (calcResponse.data as RentalFinalCalculation) : null);
    setComparison(!comparisonResponse.error && comparisonResponse.data ? (comparisonResponse.data as InspectionComparison) : null);
  }, []);

  useEffect(() => {
    void loadRentals();
  }, [loadRentals]);

  useEffect(() => {
    if (!selectedRentalId) {
      setReturnRecord(null);
      setFinalCalculation(null);
      setComparison(null);
      return;
    }
    void loadArtifacts(selectedRentalId);
  }, [loadArtifacts, selectedRentalId]);

  useEffect(() => {
    if (!selectedRental) return;
    setReturnOdometer(String(selectedRental.returnOdometer ?? selectedRental.checkoutOdometer));
    setReturnFuel(String(selectedRental.returnFuelLevel ?? selectedRental.checkoutFuelLevel));
    const customer = customers.find((item) => item.id === selectedRental.customerId);
    setCustomerSignerName(customer?.fullName || "");
  }, [customers, selectedRental]);

  const filteredRentals = useMemo(() => {
    return rentals.filter((rental) => {
      if (rental.tenantId !== activeTenantId) return false;
      if (filter === "IN_RETURN" && !RETURN_STATES.has(rental.state)) return false;
      if (filter === "COMPLETED" && !["COMPLETED", "RETURN_COMPLETED"].includes(rental.state)) return false;
      if (filter !== "ALL" && filter !== "IN_RETURN" && filter !== "COMPLETED" && rental.state !== filter) return false;

      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      const vehicle = vehicles.find((item) => item.id === rental.vehicleId);
      const customer = customers.find((item) => item.id === rental.customerId);
      return [rental.rentalNumber, vehicle?.registrationPlate, vehicle?.make, vehicle?.model, customer?.fullName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [activeTenantId, customers, filter, rentals, searchQuery, vehicles]);

  const metrics = useMemo(() => {
    const tenant = rentals.filter((item) => item.tenantId === activeTenantId);
    return {
      awaitingReceipt: tenant.filter((item) => item.state === "RETURN_SCHEDULED").length,
      inspection: tenant.filter((item) => ["VEHICLE_RECEIVED", "RETURN_INSPECTION_PENDING", "INSPECTION"].includes(item.state)).length,
      damage: tenant.filter((item) => item.state === "DAMAGE_ASSESSMENT").length,
      calculation: tenant.filter((item) => ["FINAL_CALCULATION", "FINAL_SETTLEMENT_PENDING"].includes(item.state)).length,
      settlement: tenant.filter((item) => item.state === "DEPOSIT_PROCESSING").length,
    };
  }, [activeTenantId, rentals]);

  const formatMoney = (value?: number) =>
    `${activeTenant.currencySymbol} ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : "—");

  const openAction = (mode: ActionMode) => {
    if (!selectedRental) return;
    if (mode === "RECEIVE") {
      setReceivedAt(nowLocalInput());
      setReturnOdometer(String(selectedRental.returnOdometer ?? selectedRental.checkoutOdometer));
      setReturnFuel(String(selectedRental.returnFuelLevel ?? selectedRental.checkoutFuelLevel));
    }
    setActionMode(mode);
  };

  const handleReceive = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRental) return;
    if (!hasPermission("rental.return_receive")) {
      showNotification("You do not have permission to receive returned vehicles.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const odometer = Number(returnOdometer);
      const fuel = Number(returnFuel);
      if (!Number.isFinite(odometer) || odometer < selectedRental.checkoutOdometer) {
        throw new Error(`Return odometer cannot be below the dispatch baseline of ${selectedRental.checkoutOdometer.toLocaleString()} km.`);
      }
      if (!Number.isFinite(fuel) || fuel < 0 || fuel > 100) {
        throw new Error("Return fuel level must be between 0% and 100%.");
      }

      const response = await apiClient.rentals.receiveReturnedVehicle(selectedRental.id, {
        receivedAt: receivedAt ? new Date(receivedAt).toISOString() : undefined,
        returnOdometer: odometer,
        returnFuelLevel: fuel,
        returnLocationId: returnLocation.trim() || undefined,
        conditionNotes: conditionNotes.trim() || undefined,
        idempotencyKey: `receive:${selectedRental.id}:${receivedAt || "now"}`,
      });
      if (response.error) throw new Error(response.error.message);

      await refreshRental(selectedRental.id);
      await loadArtifacts(selectedRental.id);
      showNotification("Vehicle received. Return inspection is now the next required checkpoint.");
      setActionMode(null);
    } catch (error: any) {
      showNotification(error.message || "Unable to receive returned vehicle.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const addDamage = () => {
    if (!damageDescription.trim()) return;
    setDamages((prev) => [
      ...prev,
      {
        bodyZone: damageZone,
        damageType,
        severity: damageSeverity,
        description: damageDescription.trim(),
        estimatedCost: Math.max(0, Number(damageCost || 0)),
      },
    ]);
    setDamageDescription("");
    setDamageCost("0");
  };

  const handleInspection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRental) return;
    if (!hasPermission("rental.return_inspection_link")) {
      showNotification("You do not have permission to advance rentals from return inspection.", "error");
      return;
    }
    if (!hasPermission("inspection.create") || !hasPermission("inspection.sign")) {
      showNotification("Return inspection requires inspection.create and inspection.sign permissions.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const odometer = selectedRental.returnOdometer;
      const fuelLevel = selectedRental.returnFuelLevel;
      if (odometer === undefined || fuelLevel === undefined) {
        throw new Error("Vehicle receipt must capture odometer and fuel before inspection.");
      }

      const created = await apiClient.inspections.createInspection({
        inspectionType: "RETURN",
        vehicleId: selectedRental.vehicleId,
        bookingId: selectedRental.bookingId,
        rentalId: selectedRental.id,
        customerId: selectedRental.customerId,
        driverId: selectedRental.driverId,
        odometer,
        fuelLevel,
        overallCondition,
        notes: inspectionNotes.trim() || undefined,
        idempotencyKey: `return-inspection:${selectedRental.id}`,
      });
      if (created.error || !created.data) throw new Error(created.error?.message || "Unable to create return inspection.");
      const inspection: any = created.data;

      for (const damage of damages) {
        const damageResponse = await apiClient.inspections.recordDamage(inspection.id, {
          ...damage,
          preExisting: false,
          attribution: "RENTAL_PERIOD_OBSERVED",
        });
        if (damageResponse.error) throw new Error(damageResponse.error.message);
      }

      const inspectorSignature = await apiClient.inspections.addSignature(inspection.id, {
        signerType: "INSPECTOR",
        signerId: currentUser.id,
        signerName: currentUser.fullName,
        signatureMethod: "MANUAL_UPLOAD",
        signatureReference: `return-workflow:${selectedRental.id}:inspector:${Date.now()}`,
      });
      if (inspectorSignature.error) throw new Error(inspectorSignature.error.message);

      if (customerAcknowledged) {
        const customerSignature = await apiClient.inspections.addSignature(inspection.id, {
          signerType: selectedRental.driverId ? "PRIMARY_DRIVER" : "CUSTOMER",
          signerId: selectedRental.driverId || selectedRental.customerId,
          signerName: customerSignerName.trim() || "Customer / Driver",
          signatureMethod: "MANUAL_UPLOAD",
          signatureReference: `return-workflow:${selectedRental.id}:customer:${Date.now()}`,
        });
        if (customerSignature.error) throw new Error(customerSignature.error.message);
      }

      const completed = await apiClient.inspections.completeInspection(inspection.id, {
        odometer,
        fuelLevel,
        overallCondition,
        notes: inspectionNotes.trim() || undefined,
        idempotencyKey: `return-inspection-complete:${selectedRental.id}`,
      });
      if (completed.error) throw new Error(completed.error.message);

      const linked = await apiClient.rentals.linkReturnInspection(selectedRental.id, {
        inspectionId: inspection.id,
        damageCaseIds: [],
      });
      if (linked.error) throw new Error(linked.error.message);

      const startSnapshot = await apiClient.rentals.getStartSnapshot(selectedRental.id);
      const baselineInspectionId = (startSnapshot.data as any)?.preRentalInspectionId;
      if (baselineInspectionId) {
        const comparisonResponse = await apiClient.inspections.compare(baselineInspectionId, inspection.id);
        if (!comparisonResponse.error && comparisonResponse.data) {
          setComparison(comparisonResponse.data as InspectionComparison);
        }
      }

      await refreshRental(selectedRental.id);
      await loadArtifacts(selectedRental.id);
      showNotification("Return inspection sealed and linked. Damage assessment is ready for final calculation.");
      setDamages([]);
      setInspectionNotes("");
      setCustomerAcknowledged(false);
      setActionMode(null);
    } catch (error: any) {
      showNotification(error.message || "Unable to complete return inspection.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCalculate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRental) return;
    if (!hasPermission("rental.final_calculate")) {
      showNotification("You do not have permission to calculate final rental charges.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const additionalFees =
        Number(additionalFeeAmount || 0) > 0
          ? [
              {
                code: "RETURN_ADDITIONAL_FEE",
                label: additionalFeeLabel.trim() || "Return handling fee",
                amount: Number(additionalFeeAmount),
                category: "ADDITIONAL_FEE",
              },
            ]
          : undefined;

      const response = await apiClient.rentals.calculateFinal(selectedRental.id, {
        fuelPricePerLiter: Number(fuelPrice),
        tankCapacityLitres: Number(tankCapacity),
        refuelingFee: Number(refuelingFee),
        lateHourlyRate: Number(lateHourlyRate),
        lateGracePeriodHours: Number(lateGraceHours),
        additionalFees,
        idempotencyKey: `final-calc:${selectedRental.id}`,
      });
      if (response.error || !response.data) throw new Error(response.error?.message || "Final calculation failed.");

      const payload: any = response.data;
      setFinalCalculation(payload.calculation || null);
      if (payload.rental) {
        setRentals((prev) => [payload.rental, ...prev.filter((item) => item.id !== payload.rental.id)]);
      } else {
        await refreshRental(selectedRental.id);
      }
      await loadArtifacts(selectedRental.id);
      showNotification("Final calculation generated from return evidence and immutable rental start data.");
      setActionMode(null);
    } catch (error: any) {
      showNotification(error.message || "Unable to calculate final rental charges.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRental) return;
    if (!hasPermission("rental.final_complete")) {
      showNotification("You do not have permission to complete the rental lifecycle.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiClient.rentals.completeRental(selectedRental.id, {
        releaseVehicleToStatus: releaseStatus,
        notes: completionNotes.trim() || "Return workflow completed and reconciled.",
        idempotencyKey: `return-complete:${selectedRental.id}`,
      });
      if (response.error || !response.data) throw new Error(response.error?.message || "Rental completion failed.");
      const rental = response.data as Rental;
      setRentals((prev) => [rental, ...prev.filter((item) => item.id !== rental.id)]);
      await loadArtifacts(selectedRental.id);
      showNotification(`Rental ${rental.rentalNumber} completed. Vehicle disposition: ${releaseStatus}. Availability now reflects the released vehicle state.`);
      setActionMode(null);
    } catch (error: any) {
      showNotification(error.message || "Unable to complete rental.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const stepState = (rental: Rental, step: number) => {
    const order: Record<string, number> = {
      RETURN_SCHEDULED: 1,
      VEHICLE_RECEIVED: 2,
      RETURN_INSPECTION_PENDING: 2,
      INSPECTION: 2,
      DAMAGE_ASSESSMENT: 3,
      FINAL_CALCULATION: 4,
      FINAL_SETTLEMENT_PENDING: 4,
      DEPOSIT_PROCESSING: 5,
      COMPLETED: 6,
      RETURN_COMPLETED: 6,
    };
    return (order[rental.state] || 0) >= step;
  };

  return (
    <div id="returns-view" className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <div className="rounded-xl bg-blue-100 p-2 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-950 dark:text-white">Return & Final Calculation</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Receive the vehicle, seal return evidence, assess damage, reconcile charges and deposits, then release the asset.
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => void loadRentals()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh returns
        </button>
      </div>

      <OperationsLifecycleBar current="returns"/>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Awaiting receipt", metrics.awaitingReceipt, Car],
          ["Return inspection", metrics.inspection, ClipboardCheck],
          ["Damage review", metrics.damage, AlertTriangle],
          ["Final calculation", metrics.calculation, Calculator],
          ["Settlement sealed", metrics.settlement, Coins],
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
        {["IN_RETURN", "RETURN_SCHEDULED", "VEHICLE_RECEIVED", "DAMAGE_ASSESSMENT", "FINAL_CALCULATION", "DEPOSIT_PROCESSING", "COMPLETED", "ALL"].map((state) => (
          <button
            key={state}
            onClick={() => setFilter(state)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              filter === state
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
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        </div>
      ) : filteredRentals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <FileCheck2 className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="font-semibold text-slate-700 dark:text-slate-200">No rentals are in this return stage.</p>
          <p className="mt-1 text-xs text-slate-400">Active rentals enter here only after Rental Operations schedules a return.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRentals.map((rental) => {
            const vehicle = vehicles.find((item) => item.id === rental.vehicleId);
            const customer = customers.find((item) => item.id === rental.customerId);
            return (
              <button
                key={rental.id}
                onClick={() => setSelectedRentalId(rental.id)}
                className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5"
              >
                <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-slate-950 dark:text-white">{rental.rentalNumber}</span>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${badgeClass(rental.state)}`}>{stateLabel(rental.state)}</span>
                    </div>
                    <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      <p className="font-semibold">{vehicle ? `${vehicle.registrationPlate} · ${vehicle.make} ${vehicle.model}` : rental.vehicleId}</p>
                      <p>{customer?.fullName || rental.customerId}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/60">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Scheduled return</p>
                      <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">{formatDate(rental.scheduledEnd)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Actual receipt</p>
                      <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">{formatDate(rental.actualEnd)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Distance baseline</p>
                      <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">{rental.checkoutOdometer.toLocaleString()} km</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Return reading</p>
                      <p className="mt-1 font-semibold text-slate-800 dark:text-slate-200">{rental.returnOdometer?.toLocaleString() || "Pending"} km</p>
                    </div>
                  </div>

                  <span className="flex items-center justify-end gap-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    Open return dossier <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedRental && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm">
          <button aria-label="Close return dossier" className="absolute inset-0 cursor-default" onClick={() => setSelectedRentalId(null)} />
          <div className="relative flex h-full w-full max-w-3xl flex-col overflow-hidden border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start justify-between border-b border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-base font-bold text-slate-950 dark:text-white">{selectedRental.rentalNumber}</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${badgeClass(selectedRental.state)}`}>{stateLabel(selectedRental.state)}</span>
                </div>
                <p className="text-xs text-slate-400">Authoritative check-in, evidence, charge reconciliation and fleet release.</p>
              </div>
              <button onClick={() => setSelectedRentalId(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ["Receipt", 1, Car],
                  ["Inspection", 2, ClipboardCheck],
                  ["Assessment", 3, AlertTriangle],
                  ["Calculation", 4, Calculator],
                  ["Settlement", 5, Coins],
                ].map(([label, step, Icon]: any) => {
                  const done = stepState(selectedRental, step);
                  return (
                    <div key={label} className={`rounded-xl border p-3 text-center text-[10px] font-semibold ${done ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300" : "border-slate-200 text-slate-400 dark:border-slate-800"}`}>
                      <Icon className="mx-auto mb-1 h-4 w-4" />
                      {label}
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Vehicle receipt</p>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Scheduled</span><strong>{formatDate(returnRecord?.scheduledReturnAt || selectedRental.scheduledEnd)}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Received</span><strong>{formatDate(returnRecord?.actualReturnAt || selectedRental.actualEnd)}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Odometer</span><strong>{selectedRental.returnOdometer !== undefined ? `${selectedRental.returnOdometer.toLocaleString()} km` : "Pending"}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Fuel</span><strong>{selectedRental.returnFuelLevel !== undefined ? `${selectedRental.returnFuelLevel}%` : "Pending"}</strong></div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Return evidence</p>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Inspection</span><strong>{selectedRental.returnInspectionId || "Pending"}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Damage charge</span><strong>{formatMoney(selectedRental.finalDamageCharge)}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Mileage charge</span><strong>{formatMoney(selectedRental.finalExcessKmCharge)}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Fuel / late</span><strong>{formatMoney((selectedRental.finalFuelDeficitCharge || 0) + (selectedRental.finalLateReturnFee || 0))}</strong></div>
                  </div>
                </div>
              </div>

              {!["COMPLETED", "RETURN_COMPLETED"].includes(selectedRental.state) && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/20">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-blue-900 dark:text-blue-200">Next authoritative action</p>
                      <p className="text-[11px] text-blue-700 dark:text-blue-300">Only the action valid for the current lifecycle state is enabled.</p>
                    </div>
                    <ShieldCheck className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedRental.state === "RETURN_SCHEDULED" && hasPermission("rental.return_receive") && (
                      <button disabled={restoration} onClick={() => openAction("RECEIVE")} className="rounded-xl bg-blue-700 px-3 py-2 text-xs font-bold text-white">Receive vehicle</button>
                    )}
                    {["VEHICLE_RECEIVED", "RETURN_INSPECTION_PENDING", "INSPECTION"].includes(selectedRental.state) && hasPermission("rental.return_inspection_link") && (
                      <button disabled={restoration || !hasPermission("inspection.create") || !hasPermission("inspection.sign")} onClick={() => openAction("INSPECT")} className="rounded-xl bg-cyan-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Perform return inspection</button>
                    )}
                    {selectedRental.state === "DAMAGE_ASSESSMENT" && hasPermission("rental.final_calculate") && (
                      <button disabled={restoration} onClick={() => openAction("CALCULATE")} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-bold text-white">Calculate final charges</button>
                    )}
                    {["FINAL_CALCULATION", "FINAL_SETTLEMENT_PENDING"].includes(selectedRental.state) && finalCalculation && (
                      <button disabled={restoration || !hasPermission("invoice.read")} onClick={() => setCurrentView("finance")} className="rounded-xl bg-fuchsia-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Continue in Finance & Payments</button>
                    )}
                    {selectedRental.state === "DEPOSIT_PROCESSING" && finalCalculation?.isImmutable && hasPermission("rental.final_complete") && (
                      <button disabled={restoration} onClick={() => openAction("COMPLETE")} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Complete & release vehicle</button>
                    )}
                  </div>
                </div>
              )}

              {comparison && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Departure vs return condition</p>
                      <p className="text-[11px] text-slate-400">Canonical comparison against the pre-rental inspection baseline.</p>
                    </div>
                    <ClipboardCheck className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      ["New damage", comparison.newDamageCount],
                      ["Worsened", comparison.worsenedDamageCount],
                      ["Unchanged", comparison.unchangedDamageCount],
                      ["Resolved", comparison.resolvedDamageCount],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-950/60">
                        <div className="text-lg font-bold text-slate-950 dark:text-white">{String(value)}</div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">{String(label)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
                    <span>Odometer delta: <strong>{comparison.odometerDelta.toLocaleString()} km</strong></span>
                    <span>Fuel delta: <strong>{comparison.fuelLevelDelta}%</strong></span>
                  </div>
                </div>
              )}

              {finalCalculation && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Final calculation</p>
                      <p className="text-[11px] text-slate-400">{finalCalculation.isImmutable ? "Sealed immutable settlement snapshot" : "Authoritative return calculation · Finance settlement pending"}</p>
                    </div>
                    <ReceiptText className="h-5 w-5 text-violet-600" />
                  </div>

                  <div className="space-y-2">
                    {finalCalculation.lineItems.map((item) => (
                      <div key={item.code} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 text-xs last:border-0 dark:border-slate-800">
                        <div>
                          <p className="font-medium text-slate-800 dark:text-slate-200">{item.label}</p>
                          <p className="text-[10px] text-slate-400">{stateLabel(item.category)}</p>
                        </div>
                        <strong>{formatMoney(item.totalAmount)}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/60 sm:grid-cols-2">
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Gross final total</span><strong>{formatMoney(finalCalculation.grossFinalTotal)}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Deposit held</span><strong>{formatMoney(finalCalculation.depositHeldAmount)}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Deposit deductions</span><strong>{formatMoney(finalCalculation.depositDeductionsTotal)}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Refund due</span><strong className="text-emerald-600">{formatMoney(finalCalculation.depositRefundDue)}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Additional payment due</span><strong className="text-rose-600">{formatMoney(finalCalculation.depositAdditionalPaymentDue)}</strong></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Settlement status</span><strong>{stateLabel(finalCalculation.depositSettlementStatus)}</strong></div>
                  </div>
                </div>
              )}

              {["COMPLETED", "RETURN_COMPLETED"].includes(selectedRental.state) && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
                    <div>
                      <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">Return lifecycle completed</p>
                      <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                        Receipt, return evidence, calculation and settlement are complete. The linked Booking and Contract are closed and the vehicle disposition has been applied.
                      </p>
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
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="font-bold text-slate-950 dark:text-white">
                  {actionMode === "RECEIVE" && "Receive Returned Vehicle"}
                  {actionMode === "INSPECT" && "Return Inspection & Damage Evidence"}
                  {actionMode === "CALCULATE" && "Final Charge Calculation"}
                                    {actionMode === "COMPLETE" && "Complete Rental & Release Vehicle"}
                </h2>
                <p className="mt-1 text-xs text-slate-400">{selectedRental.rentalNumber} · authoritative return workflow</p>
              </div>
              <button onClick={() => setActionMode(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </div>

            {actionMode === "RECEIVE" && (
              <form onSubmit={handleReceive} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Received at
                    <input type="datetime-local" required value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                  </label>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Return location / branch
                    <input value={returnLocation} onChange={(e) => setReturnLocation(e.target.value)} placeholder="Branch or location reference" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Odometer reading (km)
                    <input type="number" min={selectedRental.checkoutOdometer} required value={returnOdometer} onChange={(e) => setReturnOdometer(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                  </label>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Fuel level (%)
                    <input type="number" min="0" max="100" required value={returnFuel} onChange={(e) => setReturnFuel(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                  </label>
                </div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Initial condition notes
                  <textarea rows={3} value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                </label>
                <button disabled={submitting} className="w-full rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{submitting ? "Receiving…" : "Confirm vehicle receipt"}</button>
              </form>
            )}

            {actionMode === "INSPECT" && (
              <form onSubmit={handleInspection} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/60">
                    <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-slate-400" /><strong>{selectedRental.returnOdometer?.toLocaleString()} km</strong></div>
                    <p className="mt-1 text-[10px] text-slate-400">Locked from vehicle receipt</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-950/60">
                    <div className="flex items-center gap-2"><Fuel className="h-4 w-4 text-slate-400" /><strong>{selectedRental.returnFuelLevel}% fuel</strong></div>
                    <p className="mt-1 text-[10px] text-slate-400">Locked from vehicle receipt</p>
                  </div>
                </div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Overall return condition
                  <select value={overallCondition} onChange={(e) => setOverallCondition(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                    <option value="EXCELLENT">Excellent</option>
                    <option value="GOOD">Good</option>
                    <option value="FAIR">Fair</option>
                    <option value="POOR">Poor</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Inspection notes
                  <textarea rows={3} value={inspectionNotes} onChange={(e) => setInspectionNotes(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                </label>

                <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">New damage observations</p>
                      <p className="text-[10px] text-slate-400">Each observation becomes part of the canonical damage assessment.</p>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold dark:bg-slate-800">{damages.length} added</span>
                  </div>
                  {!hasPermission("damage.record") && (
                    <div className="mb-3 rounded-xl bg-amber-50 p-3 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                      You can complete the return inspection, but recording new damage requires the damage.record permission.
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-3">
                    <select disabled={!hasPermission("damage.record")} value={damageZone} onChange={(e) => setDamageZone(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-950">
                      {["FRONT_BUMPER","REAR_BUMPER","HOOD","ROOF","WINDSHIELD","REAR_GLASS","LEFT_FRONT_DOOR","RIGHT_FRONT_DOOR","LEFT_REAR_DOOR","RIGHT_REAR_DOOR","LEFT_MIRROR","RIGHT_MIRROR","WHEELS_TIRES","INTERIOR","UNDERBODY"].map((zone) => <option key={zone} value={zone}>{stateLabel(zone)}</option>)}
                    </select>
                    <select disabled={!hasPermission("damage.record")} value={damageType} onChange={(e) => setDamageType(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-950">
                      {["SCRATCH","DENT","CRACK","BROKEN","MISSING","STAIN","MECHANICAL","TIRE","GLASS","INTERIOR","OTHER"].map((type) => <option key={type} value={type}>{stateLabel(type)}</option>)}
                    </select>
                    <select disabled={!hasPermission("damage.record")} value={damageSeverity} onChange={(e) => setDamageSeverity(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-950">
                      {["MINOR","MODERATE","MAJOR"].map((severity) => <option key={severity} value={severity}>{severity}</option>)}
                    </select>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                    <input disabled={!hasPermission("damage.record")} value={damageDescription} onChange={(e) => setDamageDescription(e.target.value)} placeholder="Observed damage description" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950" />
                    <input disabled={!hasPermission("damage.record")} type="number" min="0" value={damageCost} onChange={(e) => setDamageCost(e.target.value)} placeholder="Est. cost" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-950" />
                    <button disabled={!hasPermission("damage.record")} type="button" onClick={addDamage} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold dark:border-slate-700">Add damage</button>
                  </div>
                  {damages.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {damages.map((damage, index) => (
                        <div key={`${damage.bodyZone}-${index}`} className="flex items-start justify-between gap-3 rounded-lg bg-rose-50 p-2.5 text-xs dark:bg-rose-950/20">
                          <div><strong>{stateLabel(damage.bodyZone)} · {stateLabel(damage.damageType)}</strong><p className="mt-0.5 text-[11px] text-slate-500">{damage.description}</p></div>
                          <button type="button" onClick={() => setDamages((prev) => prev.filter((_, i) => i !== index))} className="text-[11px] font-semibold text-rose-700">Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800">
                  <input type="checkbox" checked={customerAcknowledged} onChange={(e) => setCustomerAcknowledged(e.target.checked)} className="mt-0.5" />
                  <span><strong>Customer / driver acknowledgement captured</strong><span className="mt-0.5 block text-[10px] text-slate-400">Inspector acknowledgement is always captured from the signed-in operator.</span></span>
                </label>
                {customerAcknowledged && (
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Customer / driver signer name
                    <input required value={customerSignerName} onChange={(e) => setCustomerSignerName(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" />
                  </label>
                )}
                <button disabled={submitting} className="w-full rounded-xl bg-cyan-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{submitting ? "Sealing inspection…" : "Seal return inspection"}</button>
              </form>
            )}

            {actionMode === "CALCULATE" && (
              <form onSubmit={handleCalculate} className="space-y-4">
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-[11px] text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300">
                  Mileage allowance and excess-km rate come from the immutable rental pricing snapshot unless overridden server-side. Review the operational return rates below before calculation.
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold">Fuel price / litre<input type="number" min="0" step="0.01" required value={fuelPrice} onChange={(e) => setFuelPrice(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
                  <label className="text-xs font-semibold">Tank capacity (L)<input type="number" min="1" step="0.1" required value={tankCapacity} onChange={(e) => setTankCapacity(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
                  <label className="text-xs font-semibold">Refueling service fee<input type="number" min="0" step="0.01" required value={refuelingFee} onChange={(e) => setRefuelingFee(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
                  <label className="text-xs font-semibold">Late hourly rate<input type="number" min="0" step="0.01" required value={lateHourlyRate} onChange={(e) => setLateHourlyRate(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
                  <label className="text-xs font-semibold">Late grace period (hours)<input type="number" min="0" step="0.5" required value={lateGraceHours} onChange={(e) => setLateGraceHours(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                  <label className="text-xs font-semibold">Optional additional fee label<input value={additionalFeeLabel} onChange={(e) => setAdditionalFeeLabel(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
                  <label className="text-xs font-semibold">Amount<input type="number" min="0" step="0.01" value={additionalFeeAmount} onChange={(e) => setAdditionalFeeAmount(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
                </div>
                <button disabled={submitting} className="w-full rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{submitting ? "Calculating…" : "Generate final calculation"}</button>
              </form>
            )}

            {actionMode === "COMPLETE" && (
              <form onSubmit={handleComplete} className="space-y-4">
                <label className="block text-xs font-semibold">Vehicle disposition
                  <select value={releaseStatus} onChange={(e) => setReleaseStatus(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950">
                    <option value="AVAILABLE">Available — return to bookable fleet</option>
                    <option value="MAINTENANCE">Maintenance — workshop required</option>
                    <option value="INSPECTION">Inspection — additional review required</option>
                    <option value="GROUNDED">Grounded — do not allocate</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold">Completion notes<textarea rows={3} value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950" /></label>
                {releaseStatus === "AVAILABLE" ? (
                  <div className="rounded-xl bg-emerald-50 p-3 text-[11px] text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">The vehicle will be released from the Booking allocation and become bookable again.</div>
                ) : (
                  <div className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"><Wrench className="mr-1 inline h-3.5 w-3.5" />The vehicle will close this rental but remain unavailable for new allocation.</div>
                )}
                <button disabled={submitting} className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{submitting ? "Completing…" : "Complete rental & apply disposition"}</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
