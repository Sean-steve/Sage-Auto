import React, { useEffect, useState } from "react";
import {
  X,
  ClipboardCheck,
  Car,
  CheckCircle2,
  AlertTriangle,
  Fuel,
  Gauge,
  Camera,
  ShieldCheck,
  PenTool,
} from "lucide-react";
import { useApp } from "../../lib/store";
import { apiClient } from "../../lib/api-client";
import { InspectionDamage, InspectionZone, DamageType } from "../../types";

const DAMAGE_ZONES: { id: InspectionZone; label: string }[] = [
  { id: "FRONT_BUMPER", label: "Front Bumper" },
  { id: "HOOD", label: "Hood / Bonnet" },
  { id: "WINDSHIELD", label: "Front Windshield" },
  { id: "ROOF", label: "Roof & Rails" },
  { id: "LEFT_FRONT_DOOR", label: "Left Front Door" },
  { id: "RIGHT_FRONT_DOOR", label: "Right Front Door" },
  { id: "LEFT_REAR_DOOR", label: "Left Rear Door" },
  { id: "RIGHT_REAR_DOOR", label: "Right Rear Door" },
  { id: "LEFT_MIRROR", label: "Left Wing Mirror" },
  { id: "RIGHT_MIRROR", label: "Right Wing Mirror" },
  { id: "LEFT_QUARTER_PANEL", label: "Left Quarter Panel" },
  { id: "RIGHT_QUARTER_PANEL", label: "Right Quarter Panel" },
  { id: "REAR_BUMPER", label: "Rear Bumper" },
  { id: "TAILGATE", label: "Tailgate / Boot" },
];

export const InspectionModal: React.FC = () => {
  const {
    isInspectionModalOpen,
    setIsInspectionModalOpen,
    vehicles,
    activeTenant,
    activeTenantId,
    bookings,
    rentals,
    customers,
    drivers,
    inspectionTarget,
    setInspectionTarget,
  } = useApp();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const tenantVehicles = vehicles.filter((v) => v.tenantId === activeTenantId);

  const [vehicleId, setVehicleId] = useState(inspectionTarget?.vehicleId || "");
  const [inspectionType, setInspectionType] = useState<"HANDOVER" | "RETURN">("HANDOVER");
  const [odometer, setOdometer] = useState("45000");
  const [fuelLevel, setFuelLevel] = useState("100");
  const [cleanliness, setCleanliness] = useState<"EXCELLENT" | "CLEAN" | "MODERATE" | "DIRTY">("CLEAN");

  // Damage items
  const [damages, setDamages] = useState<InspectionDamage[]>([]);
  const [selectedZone, setSelectedZone] = useState<InspectionZone>("FRONT_BUMPER");
  const [damageType, setDamageType] = useState<DamageType>("SCRATCH");
  const [damageDesc, setDamageDesc] = useState("");
  const [damageCost, setDamageCost] = useState("3500");

  // Checklist
  const [checklist, setChecklist] = useState({
    spareWheel: true,
    jack: true,
    wheelSpanner: true,
    firstAidKit: true,
    fireExtinguisher: true,
    warningTriangles: true,
  });

  // Signatures
  const [inspectorName, setInspectorName] = useState("Stanley Njoroge");
  const [customerName, setCustomerName] = useState("Kiprono Koech");
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState("");

  useEffect(()=>{
    if(!isInspectionModalOpen)return;
    if(inspectionTarget?.vehicleId)setVehicleId(inspectionTarget.vehicleId);
    if(inspectionTarget?.type)setInspectionType(inspectionTarget.type);
    const rental=inspectionTarget?.rentalId?rentals.find((r:any)=>r.id===inspectionTarget.rentalId):undefined;
    const bookingId=inspectionTarget?.bookingId||rental?.bookingId;
    const booking=bookingId?bookings.find((b:any)=>b.id===bookingId):undefined;
    const customer=customers.find((item:any)=>item.id===booking?.customerId);
    const driver=drivers.find((item:any)=>item.id===booking?.primaryDriverId);
    setCustomerName(driver?.fullName||customer?.fullName||"");
    const vehicle=vehicles.find((item:any)=>item.id===inspectionTarget?.vehicleId);
    if(vehicle){
      setOdometer(String(vehicle.odometer||0));
      setFuelLevel(String(vehicle.fuelLevel??100));
    }
    setSaveError("");
  },[isInspectionModalOpen,inspectionTarget?.vehicleId,inspectionTarget?.bookingId,inspectionTarget?.rentalId,inspectionTarget?.type]);

  if (!isInspectionModalOpen) return null;

  const handleAddDamage = () => {
    if (!damageDesc) return;
    const newDamage: InspectionDamage = {
      id: `dmg_${Date.now()}`,
      zone: selectedZone,
      type: damageType,
      severity: "MINOR",
      description: damageDesc,
      photoUrl: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&q=80&w=400",
      estimatedCost: parseFloat(damageCost) || 0,
      isPreExisting: inspectionType === "HANDOVER",
    };
    setDamages([...damages, newDamage]);
    setDamageDesc("");
  };

  const handleRemoveDamage = (id: string) => {
    setDamages(damages.filter((d) => d.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId || saving) return;
    setSaving(true);setSaveError("");

    try {
      const targetRental=inspectionTarget?.rentalId?rentals.find((r:any)=>r.id===inspectionTarget.rentalId):undefined;
      const bookingId=inspectionTarget?.bookingId||targetRental?.bookingId;
      const booking=bookingId?bookings.find((b:any)=>b.id===bookingId):undefined;
      const canonicalType=inspectionType==="RETURN"?"RETURN":"PRE_RENTAL";
      const customerId=booking?.customerId||targetRental?.customerId||undefined;
      const driverId=booking?.primaryDriverId||targetRental?.primaryDriverId||undefined;

      const createdResponse=await apiClient.inspections.createInspection({
        inspectionType:canonicalType,
        vehicleId,
        bookingId:bookingId||undefined,
        rentalId:inspectionTarget?.rentalId||undefined,
        customerId,
        driverId,
        odometer:Number(odometer),
        fuelLevel:Number(fuelLevel),
        overallCondition:cleanliness==="EXCELLENT"?"EXCELLENT":cleanliness==="DIRTY"?"FAIR":"GOOD",
        notes:[inspectorName&&`Inspector: ${inspectorName}`,customerName&&`Customer/driver present: ${customerName}`].filter(Boolean).join(" · "),
        idempotencyKey:typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():`inspection-${Date.now()}`,
      });
      if(createdResponse.error)throw new Error(createdResponse.error.message);
      let inspection:any=createdResponse.data;

      const started=await apiClient.inspections.startInspection(inspection.id,{expectedVersion:inspection.version});
      if(started.error)throw new Error(started.error.message);
      inspection=started.data||inspection;

      const checklistResponses=Object.entries(checklist).map(([key,value])=>({
        itemCode:key.replace(/([a-z])([A-Z])/g,"$1_$2").toUpperCase(),
        responseValue:Boolean(value),
        condition:value?"GOOD":"DAMAGED",
        notes:value?"Present / satisfactory":"Missing or requires attention",
      }));
      const responses=await apiClient.inspections.recordResponses(inspection.id,{responses:checklistResponses,expectedVersion:inspection.version});
      if(responses.error)throw new Error(responses.error.message);
      inspection=responses.data||inspection;

      const zoneMap:Record<string,string>={
        LEFT_QUARTER_PANEL:"LEFT_REAR_QUARTER",
        RIGHT_QUARTER_PANEL:"RIGHT_REAR_QUARTER",
        TAILGATE:"REAR_BUMPER",
      };
      for(const defect of damages){
        const result=await apiClient.inspections.recordDamage(inspection.id,{
          bodyZone:zoneMap[defect.zone]||defect.zone,
          damageType:defect.type,
          severity:defect.severity||"MINOR",
          description:defect.description,
          preExisting:canonicalType==="PRE_RENTAL"||defect.isPreExisting,
          attribution:canonicalType==="PRE_RENTAL"?"PRE_EXISTING":"RENTAL_PERIOD_OBSERVED",
          estimatedCost:defect.estimatedCost||0,
        });
        if(result.error)throw new Error(result.error.message);
      }

      const latest=await apiClient.inspections.getInspection(inspection.id);
      if(latest.error)throw new Error(latest.error.message);
      inspection=latest.data||inspection;
      const completed=await apiClient.inspections.completeInspection(inspection.id,{
        odometer:Number(odometer),
        fuelLevel:Number(fuelLevel),
        overallCondition:cleanliness==="EXCELLENT"?"EXCELLENT":cleanliness==="DIRTY"?"FAIR":"GOOD",
        notes:[inspection.notes,damages.length?`${damages.length} defect(s) recorded`:"No defects recorded"].filter(Boolean).join(" · "),
        idempotencyKey:typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():`inspection-complete-${Date.now()}`,
        expectedVersion:inspection.version,
      });
      if(completed.error)throw new Error(completed.error.message);

      window.dispatchEvent(new CustomEvent("sage:inspection-saved",{detail:{inspectionId:(completed.data as any)?.id}}));
      setIsInspectionModalOpen(false);
      setInspectionTarget(null);
      setStep(1);
      setDamages([]);
    } catch(err:any) {
      setSaveError(err.message||"Inspection could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const totalDamageCost = damages.reduce((acc, curr) => acc + curr.estimatedCost, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                OPS-001 Digital Vehicle Handover & Return Audit
              </h2>
              <span className="text-[10px] text-slate-400 font-mono">Step {step} of 4</span>
            </div>
          </div>
          <button
            onClick={() => {
              setIsInspectionModalOpen(false);
              setInspectionTarget(null);
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Navigation Bar */}
        <div className="grid grid-cols-4 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold">
          <button
            onClick={() => setStep(1)}
            className={`py-2 text-center border-b-2 ${step === 1 ? "border-emerald-600 text-emerald-600" : "border-transparent text-slate-500"}`}
          >
            1. Odometer & Fuel
          </button>
          <button
            onClick={() => setStep(2)}
            className={`py-2 text-center border-b-2 ${step === 2 ? "border-emerald-600 text-emerald-600" : "border-transparent text-slate-500"}`}
          >
            2. 360° Damage Map
          </button>
          <button
            onClick={() => setStep(3)}
            className={`py-2 text-center border-b-2 ${step === 3 ? "border-emerald-600 text-emerald-600" : "border-transparent text-slate-500"}`}
          >
            3. Safety Checklist
          </button>
          <button
            onClick={() => setStep(4)}
            className={`py-2 text-center border-b-2 ${step === 4 ? "border-emerald-600 text-emerald-600" : "border-transparent text-slate-500"}`}
          >
            4. Digital Signatures
          </button>
        </div>

        {/* Step 1: Odometer & Fuel */}
        {step === 1 && (
          <div className="p-6 overflow-y-auto space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Target Vehicle *</label>
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                >
                  <option value="">Select vehicle...</option>
                  {tenantVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registrationPlate} — {v.make} {v.model}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Inspection Phase</label>
                <select
                  value={inspectionType}
                  onChange={(e) => setInspectionType(e.target.value as any)}
                  className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                >
                  <option value="HANDOVER">Pre-Handover Departure Audit</option>
                  <option value="RETURN">Post-Return Final Audit</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Odometer Reading (km) *</label>
                <input
                  type="number"
                  value={odometer}
                  onChange={(e) => setOdometer(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Fuel Tank Level (%) *</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={fuelLevel}
                  onChange={(e) => setFuelLevel(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Cabin Cleanliness</label>
                <select
                  value={cleanliness}
                  onChange={(e) => setCleanliness(e.target.value as any)}
                  className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                >
                  <option value="EXCELLENT">Showroom Clean</option>
                  <option value="CLEAN">Clean / Valeted</option>
                  <option value="MODERATE">Moderate Dust</option>
                  <option value="DIRTY">Requires Deep Valeting</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs"
              >
                Next: 360° Damage Mapping →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: 14 Damage Zones */}
        {step === 2 && (
          <div className="p-6 overflow-y-auto space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 dark:text-white">Interactive 14-Zone Vehicle Map</h3>

            {/* Zone Selector Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DAMAGE_ZONES.map((z) => {
                const zoneDamages = damages.filter((d) => d.zone === z.id);
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() => setSelectedZone(z.id)}
                    className={`p-2 rounded-lg text-left text-[11px] font-medium border transition-colors flex items-center justify-between ${
                      selectedZone === z.id
                        ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent font-bold"
                        : "bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <span>{z.label}</span>
                    {zoneDamages.length > 0 && (
                      <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] flex items-center justify-center font-bold">
                        {zoneDamages.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Add Damage for Selected Zone */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Add Defect to: {DAMAGE_ZONES.find((z) => z.id === selectedZone)?.label}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">Defect Type</label>
                  <select
                    value={damageType}
                    onChange={(e) => setDamageType(e.target.value as any)}
                    className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    <option value="SCRATCH">Paint Scratch</option>
                    <option value="DENT">Body Dent</option>
                    <option value="CHIP">Stone Chip</option>
                    <option value="CRACK">Glass Crack</option>
                    <option value="BROKEN">Broken / Missing Part</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Description</label>
                  <input
                    type="text"
                    placeholder="e.g. 5cm surface scratch near corner"
                    value={damageDesc}
                    onChange={(e) => setDamageDesc(e.target.value)}
                    className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 mb-1">Estimated Cost ({activeTenant.currencySymbol})</label>
                  <input
                    type="number"
                    value={damageCost}
                    onChange={(e) => setDamageCost(e.target.value)}
                    className="w-full p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddDamage}
                className="px-4 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs"
              >
                + Pin Damage Zone
              </button>
            </div>

            {/* List of recorded damages */}
            <div className="space-y-2">
              <span className="font-bold text-slate-700 dark:text-slate-300">
                Logged Defects ({damages.length}) — Total Est: {activeTenant.currencySymbol} {totalDamageCost.toLocaleString()}
              </span>
              {damages.map((d) => (
                <div
                  key={d.id}
                  className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-rose-900 dark:text-rose-200">{d.zone.replace(/_/g, " ")}:</span>{" "}
                    <span className="text-rose-800 dark:text-rose-300">{d.description} ({d.type})</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-rose-700 dark:text-rose-300">
                      {activeTenant.currencySymbol} {d.estimatedCost.toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDamage(d.id)}
                      className="text-rose-500 hover:text-rose-700 font-bold"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-xl border text-slate-600 text-xs"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs"
              >
                Next: Safety Checklist →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Safety Checklist */}
        {step === 3 && (
          <div className="p-6 overflow-y-auto space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 dark:text-white">Emergency & Safety Equipment Checklist</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: "spareWheel", label: "Spare Wheel / Inflated Tire" },
                { key: "jack", label: "Hydraulic / Scissor Jack" },
                { key: "wheelSpanner", label: "Wheel Spanner" },
                { key: "firstAidKit", label: "NTSA Approved First Aid Kit" },
                { key: "fireExtinguisher", label: "Fire Extinguisher (Inspected)" },
                { key: "warningTriangles", label: "2x Reflective Warning Triangles" },
              ].map((item) => (
                <label
                  key={item.key}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 flex items-center gap-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={(checklist as any)[item.key]}
                    onChange={(e) =>
                      setChecklist({ ...checklist, [item.key]: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-emerald-600 border-slate-300"
                  />
                  <span className="font-medium text-slate-800 dark:text-slate-200">{item.label}</span>
                </label>
              ))}
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 rounded-xl border text-slate-600 text-xs"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs"
              >
                Next: Signatures & Certification →
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Signatures & Submit */}
        {step === 4 && (
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
            <h3 className="font-bold text-slate-900 dark:text-white">Inspection acknowledgement & certification</h3>
            {saveError&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800">{saveError}</div>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Inspector Name *</label>
                <input
                  required
                  type="text"
                  value={inspectorName}
                  onChange={(e) => setInspectorName(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                />
                <div className="mt-2 p-3 rounded-lg bg-slate-100 dark:bg-slate-900 font-mono text-[11px] text-slate-400 italic text-center">
                  Authenticated inspector identity will be retained with the canonical audit record.
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Customer / Driver Name *</label>
                <input
                  required
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
                />
                <div className="mt-2 p-3 rounded-lg bg-slate-100 dark:bg-slate-900 font-mono text-[11px] text-slate-400 italic text-center">
                  Customer/driver association is retained on the inspection. Signature evidence is recorded only when actually captured.
                </div>
              </div>
            </div>

            {/* Final summary box */}
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>OPS-001 Verification Certificate Ready</span>
              </div>
              <p className="text-[11px]">
                {damages.length} damage points pinned. Total damage liability: {activeTenant.currencySymbol} {totalDamageCost.toLocaleString()}.
              </p>
            </div>

            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-4 py-2 rounded-xl border text-slate-600 text-xs"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs"
              >
                {saving?"Saving canonical inspection…":"Certify & Save Inspection Audit"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
