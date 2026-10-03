import React, { useState } from "react";
import {
  ShieldCheck,
  Plus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Car,
  User,
  FileText,
  Lock,
  Unlock,
} from "lucide-react";
import { useApp } from "../lib/store";
import { ComplianceDocument, ComplianceExpiryState } from "../types";

export const ComplianceView: React.FC = () => {
  const { restoration } = useApp();
  const {
    complianceDocs,
    vehicles,
    drivers,
    activeTenantId,
    addComplianceDocument,
    overrideComplianceHold,
  } = useApp();

  const [isNewDocOpen, setIsNewDocOpen] = useState(false);
  const [subjectType, setSubjectType] = useState<"VEHICLE" | "DRIVER">("VEHICLE");
  const [subjectId, setSubjectId] = useState("");
  const [docType, setDocType] = useState<ComplianceDocument["documentType"]>("COMMERCIAL_INSURANCE");
  const [docNumber, setDocNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const tenantCompliance = (complianceDocs || []).filter((c) => c.tenantId === activeTenantId);
  const tenantVehicles = (vehicles || []).filter((v) => v.tenantId === activeTenantId);
  const tenantDrivers = (drivers || []).filter((d) => d.tenantId === activeTenantId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !docNumber || !expiryDate) return;

    const expTime = new Date(expiryDate).getTime();
    const now = Date.now();
    const daysLeft = Math.ceil((expTime - now) / 86400000);

    let expiryState: ComplianceExpiryState = "VALID";
    if (daysLeft < 0) expiryState = "EXPIRED";
    else if (daysLeft <= 7) expiryState = "URGENT";
    else if (daysLeft <= 30) expiryState = "EXPIRING_SOON";

    addComplianceDocument({
      subjectType,
      subjectId,
      documentType: docType,
      documentNumber: docNumber,
      issueDate: new Date().toISOString().split("T")[0],
      expiryDate,
      expiryState,
      isMandatory: true,
      isBlocked: expiryState === "EXPIRED",
    });

    setIsNewDocOpen(false);
    setDocNumber("");
    setExpiryDate("");
  };

  const getExpiryBadge = (state: ComplianceExpiryState) => {
    switch (state) {
      case "VALID":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">VALID</span>;
      case "EXPIRING_SOON":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">EXPIRING SOON</span>;
      case "URGENT":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300">URGENT</span>;
      case "EXPIRED":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">EXPIRED & BLOCKED</span>;
    }
  };

  return (
    <div id="compliance-view" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Regulatory Compliance & Expiry Holds
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {tenantCompliance.length} Documents Monitored
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Commercial PSV insurance, speed governors, NTSA certificates, and driver medical validity tracking.
          </p>
        </div>

        <button
          onClick={() => setIsNewDocOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Register Compliance Document</span>
        </button>
      </div>

      {/* New Compliance Document Form */}
      {isNewDocOpen && (
        <form onSubmitCapture={restoration ? e => {e.preventDefault();e.stopPropagation();} : undefined} onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md space-y-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Register Regulatory Document</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Subject Type</label>
              <select
                value={subjectType}
                onChange={(e) => setSubjectType(e.target.value as any)}
                className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              >
                <option value="VEHICLE">Fleet Vehicle</option>
                <option value="DRIVER">Designated Driver</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Select Subject *</label>
              <select
                required
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              >
                <option value="">Choose subject...</option>
                {subjectType === "VEHICLE"
                  ? tenantVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.registrationPlate} — {v.make} {v.model}
                      </option>
                    ))
                  : tenantDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.fullName} (Badge: {d.badgeNumber || "N/A"})
                      </option>
                    ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Document Type *</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as any)}
                className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              >
                <option value="COMMERCIAL_INSURANCE">Commercial PSV Insurance</option>
                <option value="INSPECTION_CERTIFICATE">NTSA Inspection Certificate</option>
                <option value="LOGBOOK">Vehicle Logbook</option>
                <option value="SPEED_GOVERNOR_CERT">Speed Governor Calibration</option>
                <option value="DRIVER_DRIVING_LICENSE">Driver's License</option>
                <option value="DRIVER_MEDICAL_FITNESS">Medical Fitness Certificate</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Certificate / Policy Number *</label>
              <input
                required
                type="text"
                placeholder="e.g. INS-JUB-2026-9410"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Official Expiry Date *</label>
              <input
                required
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsNewDocOpen(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium"
            >
              Cancel
            </button>
            <button disabled={restoration} aria-describedby="restoration-actions-note"
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold shadow-xs"
            >
              Register & Enforce Rules
            </button>
          </div>
        </form>
      )}

      {/* Compliance Documents List */}
      <div className="space-y-3">
        {tenantCompliance.map((doc) => {
          const subjectName =
            doc.subjectType === "VEHICLE"
              ? tenantVehicles.find((v) => v.id === doc.subjectId)?.registrationPlate
              : tenantDrivers.find((d) => d.id === doc.subjectId)?.fullName;

          return (
            <div
              key={doc.id}
              className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    doc.expiryState === "EXPIRED"
                      ? "bg-rose-50 dark:bg-rose-950/40 text-rose-600"
                      : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600"
                  }`}
                >
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900 dark:text-white">
                      {subjectName || "Unknown Subject"} — {doc.documentType.replace(/_/g, " ")}
                    </span>
                    {getExpiryBadge(doc.expiryState)}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cert #{doc.documentNumber} • Expiry: {new Date(doc.expiryDate).toLocaleDateString()}
                  </p>
                  {doc.overrideReason && (
                    <p className="text-[11px] text-amber-600 italic mt-0.5">
                      ⚠️ Overridden by {doc.overriddenBy}: "{doc.overrideReason}"
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {doc.isBlocked && (
                  <button disabled={restoration} aria-describedby="restoration-actions-note"
                    onClick={() => {
                      const reason = prompt("Enter justification reason for overriding compliance hold:", "Special temporary transit exemption approved by Operations Director");
                      if (reason) overrideComplianceHold(doc.id, reason);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-semibold border border-amber-300 dark:border-amber-700 hover:bg-amber-100 flex items-center gap-1"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Override Hold (Audit Note)</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
