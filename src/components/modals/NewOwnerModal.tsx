import React, { useState } from "react";
import { X, Users, CreditCard } from "lucide-react";
import { useApp } from "../../lib/store";

export const NewOwnerModal: React.FC = () => {
  const { isNewOwnerOpen, setIsNewOwnerOpen, addVehicleOwner, activeTenant } = useApp();

  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("+254 7");
  const [payoutBank, setPayoutBank] = useState("KCB Bank Kenya");
  const [payoutAcc, setPayoutAcc] = useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  if (!isNewOwnerOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !payoutAcc) return;
    setBusy(true);setError("");
    try{
      const saved=await addVehicleOwner({
        name,
        companyName: companyName || undefined,
        email,
        phone,
        ownershipType: companyName ? "COMPANY" : "INDIVIDUAL",
        payoutBank,
        payoutAccountNumber: payoutAcc,
        status: "ACTIVE",
      });
      if(saved)setIsNewOwnerOpen(false);
      else setError("This owner could not be registered. Check for an existing owner using the same email or phone number.");
    }catch(err:any){setError(err.message||"Vehicle owner could not be registered.");}
    finally{setBusy(false);}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-base text-slate-900 dark:text-white">Register Vehicle Owner / Asset Investor</h2>
          </div>
          <button
            onClick={() => setIsNewOwnerOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error&&<div role="alert" className="rounded-xl bg-rose-50 p-3 font-medium text-rose-700">{error}</div>}
          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Owner Full Name *</label>
            <input
              required
              type="text"
              placeholder="e.g. David Mwangi"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Company Name (If applicable)</label>
            <input
              type="text"
              placeholder="e.g. Mwangi Fleet Holdings Ltd"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Email Address *</label>
              <input
                required
                type="email"
                placeholder="investor@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Phone Number *</label>
              <input
                required
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Disbursement Bank *</label>
              <input
                required
                type="text"
                value={payoutBank}
                onChange={(e) => setPayoutBank(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Account Number *</label>
              <input
                required
                type="text"
                placeholder="1102938475"
                value={payoutAcc}
                onChange={(e) => setPayoutAcc(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
            <p className="font-semibold">Commercial terms are set per vehicle.</p>
            <p className="mt-1 text-[11px] leading-4">Register the owner first. When you assign a vehicle in Fleet → Ownership, set that vehicle's revenue share, fixed payout and deduction rules. Sage Auto does not apply a hidden global default.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsNewOwnerOpen(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors"
            >
              Register Owner & Agreement
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
