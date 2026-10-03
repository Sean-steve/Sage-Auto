// ============================================================================
// CAR HIRE OS — PROVISION NEW TENANT MODAL (DEV-004, DOM-003 §4)
// Allows authenticated users to provision fresh tenant workspaces with customized settings.
// ============================================================================

import React, { useState } from "react";
import { Building2, X, Globe, DollarSign, Clock, ShieldCheck, Check } from "lucide-react";
import { useAppStore } from "../lib/store";

interface CreateTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateTenantModal: React.FC<CreateTenantModalProps> = ({ isOpen, onClose }) => {
  const { provisionNewTenant, showNotification } = useAppStore();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [currencySymbol, setCurrencySymbol] = useState("KSh");
  const [timezone, setTimezone] = useState("Africa/Nairobi");
  const [countryCode, setCountryCode] = useState("KE");
  const [vatRate, setVatRate] = useState(16);
  const [allowedKm, setAllowedKm] = useState(250);
  const [excessKmRate, setExcessKmRate] = useState(25);
  const [depositAmount, setDepositAmount] = useState(25000);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    const autoSlug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setSlug(autoSlug);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Please provide a tenant organization name.");
      return;
    }

    if (!slug.trim() || slug.length < 3) {
      setError("Slug must be at least 3 lowercase alphanumeric characters.");
      return;
    }

    try {
      setIsSubmitting(true);
      await provisionNewTenant({
        name: name.trim(),
        slug: slug.trim(),
        defaultCurrency: currency,
        currencySymbol,
        timezone,
        countryCode,
        initialSettings: {
          vatRatePercent: Number(vatRate),
          allowedDailyKm: Number(allowedKm),
          excessKmRate: Number(excessKmRate),
          depositDefaultAmount: Number(depositAmount),
        },
      });

      showNotification(`Tenant workspace '${name}' provisioned successfully!`);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to provision tenant workspace.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="create-tenant-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div
        id="create-tenant-modal-dialog"
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Provision Tenant Workspace
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Initialize an isolated multi-tenant fleet organization
              </p>
            </div>
          </div>
          <button
            id="close-create-tenant-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Organization Name *
            </label>
            <input
              id="tenant-name-input"
              type="text"
              required
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. Serengeti Luxury Safaris"
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tenant Slug (Subdomain / Identifier) *
            </label>
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden">
              <span className="px-3 py-2 text-xs text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-850">
                carhire.os/
              </span>
              <input
                id="tenant-slug-input"
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
                placeholder="serengeti-safaris"
                className="w-full px-3 py-2 text-xs bg-transparent text-slate-900 dark:text-slate-100 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Base Currency
              </label>
              <select
                id="tenant-currency-select"
                value={currency}
                onChange={(e) => {
                  setCurrency(e.target.value);
                  setCurrencySymbol(e.target.value === "USD" ? "$" : e.target.value === "EUR" ? "€" : "KSh");
                }}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                <option value="KES">KES - Kenyan Shilling (KSh)</option>
                <option value="USD">USD - US Dollar ($)</option>
                <option value="EUR">EUR - Euro (€)</option>
                <option value="GBP">GBP - British Pound (£)</option>
                <option value="TZS">TZS - Tanzanian Shilling</option>
                <option value="UGX">UGX - Ugandan Shilling</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Primary Timezone
              </label>
              <select
                id="tenant-timezone-select"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              >
                <option value="Africa/Nairobi">Africa/Nairobi (EAT, UTC+3)</option>
                <option value="Africa/Dar_es_Salaam">Africa/Dar_es_Salaam (EAT, UTC+3)</option>
                <option value="Africa/Kampala">Africa/Kampala (EAT, UTC+3)</option>
                <option value="Africa/Kigali">Africa/Kigali (CAT, UTC+2)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
              </select>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Statutory & Fleet Defaults
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  VAT Rate (%)
                </label>
                <input
                  id="tenant-vat-input"
                  type="number"
                  min="0"
                  max="100"
                  value={vatRate}
                  onChange={(e) => setVatRate(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Daily KM Allowance
                </label>
                <input
                  id="tenant-km-input"
                  type="number"
                  min="50"
                  max="2000"
                  value={allowedKm}
                  onChange={(e) => setAllowedKm(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              id="cancel-create-tenant-btn"
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              id="submit-create-tenant-btn"
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center gap-2 shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Provisioning...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Create Workspace</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
