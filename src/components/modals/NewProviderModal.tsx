import React, { useState } from "react";
import { X, Building2, Phone, Mail, MapPin, Star, Wrench } from "lucide-react";
import { useApp } from "../../lib/store";

import { MaintenanceType } from "../../types";

export const NewProviderModal: React.FC = () => {
  const {
    isNewProviderModalOpen,
    setIsNewProviderModalOpen,
    createServiceProvider,
  } = useApp();

  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [address, setAddress] = useState("");
  const [servicesProvided, setServicesProvided] = useState<MaintenanceType[]>(["ROUTINE_SERVICE"]);
  const [paymentMethods,setPaymentMethods]=useState<Array<"MPESA"|"BANK_TRANSFER"|"CASH"|"CARD">>([]);
  const [mpesaNumber,setMpesaNumber]=useState("");
  const [bankName,setBankName]=useState("");
  const [bankAccountName,setBankAccountName]=useState("");
  const [bankAccountNumber,setBankAccountNumber]=useState("");
  const [notes, setNotes] = useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  if (!isNewProviderModalOpen) return null;

  const handleToggleService = (svc: MaintenanceType) => {
    if (servicesProvided.includes(svc)) {
      setServicesProvided(servicesProvided.filter((s) => s !== svc));
    } else {
      setServicesProvided([...servicesProvided, svc]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || busy) return;
    setBusy(true);setError("");
    const saved=await createServiceProvider({
      name,
      // Vendor code is generated centrally as GAR-#### so users never invent identifiers.
      contactPerson: contactPerson || undefined,
      phone: phone || undefined,
      email: email || undefined,
      location: location || "Nairobi, Kenya",
      address: address || undefined,
      servicesProvided: servicesProvided.length > 0 ? servicesProvided : ["ROUTINE_SERVICE"],
      paymentMethods,
      mpesaNumber: paymentMethods.includes("MPESA") ? mpesaNumber || undefined : undefined,
      bankName: paymentMethods.includes("BANK_TRANSFER") ? bankName || undefined : undefined,
      bankAccountName: paymentMethods.includes("BANK_TRANSFER") ? bankAccountName || undefined : undefined,
      bankAccountNumber: paymentMethods.includes("BANK_TRANSFER") ? bankAccountNumber || undefined : undefined,
      notes: notes || undefined,
    });
    if(!saved){setError("The garage could not be registered. Review any duplicate or required details and try again.");setBusy(false);return;}

    setName("");
    setContactPerson("");
    setPhone("");
    setEmail("");
    setLocation("");
    setAddress("");
    setServicesProvided(["ROUTINE_SERVICE"]);
    setPaymentMethods([]);setMpesaNumber("");setBankName("");setBankAccountName("");setBankAccountNumber("");
    setNotes("");
    setIsNewProviderModalOpen(false);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">{busy?"Registering…":"Register Service Provider"} / Garage</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Add trusted workshop vendor to workspace network</p>
            </div>
          </div>
          <button
            onClick={() => setIsNewProviderModalOpen(false)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                Garage / Business Name <span className="text-rose-500">*</span>
              </label>
              <input
                required
                type="text"
                placeholder="e.g. Apex Auto Precision Ltd"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium"
              />
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <label className="block text-emerald-800 font-semibold mb-1">Vendor Code</label>
              <p className="font-mono text-sm font-bold text-emerald-900">Assigned automatically</p>
              <p className="mt-1 text-[10px] leading-4 text-emerald-700">Sage Auto assigns the next workspace code such as GAR-0004 after registration.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Contact Person / Foreman</label>
              <input
                type="text"
                placeholder="e.g. Samuel Mureithi"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Phone Number</label>
              <input
                type="text"
                placeholder="+254 711 000 999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Email Address</label>
              <input
                type="email"
                placeholder="service@apexauto.co.ke"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">City / Location</label>
              <input
                type="text"
                placeholder="Industrial Area, Nairobi"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Physical Workshop Address</label>
            <input
              type="text"
              placeholder="Enterprise Road, Plot 14B, Nairobi"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Specialized Services</label>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "ROUTINE_SERVICE" as MaintenanceType, label: "Routine Servicing" },
                { id: "PREVENTIVE" as MaintenanceType, label: "Preventive Inspection" },
                { id: "BRAKE" as MaintenanceType, label: "Brakes & Rotors" },
                { id: "TIRE" as MaintenanceType, label: "Tires & Alignment" },
                { id: "BODYWORK" as MaintenanceType, label: "Body & Paint" },
                { id: "ELECTRICAL" as MaintenanceType, label: "Diagnostics & Electrical" },
                { id: "TRANSMISSION" as MaintenanceType, label: "Gearbox & Transmission" },
              ].map((svc) => (
                <button
                  type="button"
                  key={svc.id}
                  onClick={() => handleToggleService(svc.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                    servicesProvided.includes(svc.id)
                      ? "bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-700 shadow-2xs"
                      : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700"
                  }`}
                >
                  {svc.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-2">Accepted payment methods</label>
            <div className="flex flex-wrap gap-2">
              {(["MPESA","BANK_TRANSFER","CASH","CARD"] as const).map(method=><label key={method} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-semibold dark:border-slate-700"><input type="checkbox" checked={paymentMethods.includes(method)} onChange={e=>setPaymentMethods(current=>e.target.checked?[...current,method]:current.filter(item=>item!==method))}/>{method.replaceAll("_"," ")}</label>)}
            </div>
            {paymentMethods.includes("MPESA")&&<div className="mt-3"><label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Garage M-Pesa number / Till / Paybill</label><input value={mpesaNumber} onChange={e=>setMpesaNumber(e.target.value)} placeholder="e.g. 0712 345 678 or Till 123456" className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"/></div>}
            {paymentMethods.includes("BANK_TRANSFER")&&<div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="font-semibold text-slate-700 dark:text-slate-300">Bank<input value={bankName} onChange={e=>setBankName(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"/></label><label className="font-semibold text-slate-700 dark:text-slate-300">Account name<input value={bankAccountName} onChange={e=>setBankAccountName(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"/></label><label className="font-semibold text-slate-700 dark:text-slate-300">Account number<input value={bankAccountNumber} onChange={e=>setBankAccountNumber(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700"/></label></div>}
          </div>

          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">Notes & Terms</label>
            <textarea
              rows={2}
              placeholder="Payment terms, warranty periods, negotiated labor rates..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-700/80">
            <button
              type="button"
              onClick={() => setIsNewProviderModalOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Building2 className="w-4 h-4" />
              <span>Register Vendor</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
