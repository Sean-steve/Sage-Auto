import React, { useState } from "react";
import {
  Users,
  Plus,
  Search,
  UserCheck,
  UserX,
  Building2,
  Mail,
  Phone,
  CreditCard,
  ShieldAlert,
  Star,
  CheckCircle2,
  Award,
} from "lucide-react";
import { useApp } from "../lib/store";
import { Customer, Driver, CustomerStatus } from "../types";

export const CustomersView: React.FC = () => {
  const {
    customers,
    drivers,
    corporateAccounts,
    activeTenant,
    activeTenantId,
    setIsNewCustomerOpen,
    updateCustomer,
    searchQuery,
    restoration,
  } = useApp();

  const [activeTab, setActiveTab] = useState<"CUSTOMERS" | "DRIVERS" | "CORPORATE">("CUSTOMERS");

  const tenantCustomers = customers.filter((c) => c.tenantId === activeTenantId);
  const tenantDrivers = drivers.filter((d) => d.tenantId === activeTenantId);
  const tenantCorporate = corporateAccounts.filter((c) => c.tenantId === activeTenantId);

  const filteredCustomers = tenantCustomers.filter((c) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        c.fullName.toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.idOrPassportNumber || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div id="customers-view" className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Customer & Driver Registry</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {tenantCustomers.length} Customers • {restoration ? "Driver records not connected" : `${tenantDrivers.length} Drivers`}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            KYC verification, corporate credit accounts, commercial driver badges, and high-risk blacklist enforcement.
          </p>
        </div>

        <button disabled={restoration} aria-describedby="restoration-actions-note"
          onClick={() => setIsNewCustomerOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Onboard New Customer</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab("CUSTOMERS")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "CUSTOMERS"
              ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
          }`}
        >
          Individual & VIP Customers ({tenantCustomers.length})
        </button>
        <button
          onClick={() => setActiveTab("DRIVERS")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "DRIVERS"
              ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
          }`}
        >
          Designated Drivers ({tenantDrivers.length})
        </button>
        <button
          onClick={() => setActiveTab("CORPORATE")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "CORPORATE"
              ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
          }`}
        >
          Corporate Accounts ({tenantCorporate.length})
        </button>
      </div>

      {restoration && activeTab !== "CUSTOMERS" && <p role="status">{activeTab === "DRIVERS" ? "Driver" : "Corporate account"} records are not connected to this screen yet.</p>}
      {activeTab === "CUSTOMERS" && filteredCustomers.length === 0 && <p role="status">No saved customers match your search.</p>}
      {/* Customers List */}
      {activeTab === "CUSTOMERS" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCustomers.map((cust) => (
            <div
              key={cust.id}
              className={`bg-white dark:bg-slate-800 rounded-2xl border p-5 shadow-xs flex flex-col justify-between ${
                cust.status === "BLOCKED"
                  ? "border-rose-300 dark:border-rose-900/60 bg-rose-50/20"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{cust.fullName}</h3>
                    <p className="text-xs text-slate-400 font-mono">ID/Passport: {cust.idOrPassportNumber}</p>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      cust.status === "BLOCKED"
                        ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    }`}
                  >
                    {cust.status}
                  </span>
                </div>

                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span className="truncate">{cust.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{cust.phone}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 text-xs flex justify-between">
                  <span>License #{cust.licenseNumber}</span>
                  <span className="text-slate-400 font-mono">Exp: {cust.licenseExpiryDate}</span>
                </div>

                {cust.notes && (
                  <p className="text-[11px] text-slate-500 italic">"{cust.notes}"</p>
                )}
              </div>

              <div className="pt-3 mt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs text-slate-500">{cust.totalRentalsCount} completed hires</span>
                {cust.status === "ACTIVE" ? (
                  <button disabled={restoration} aria-describedby="restoration-actions-note"
                    onClick={() => {
                      if (confirm(`Block customer ${cust.fullName}? This will prohibit future bookings.`)) {
                        const reason = prompt("Reason for blocking this customer:");
                        if (reason?.trim()) updateCustomer(cust.id, { status: "BLOCKED", notes: reason.trim() });
                      }
                    }}
                    className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                  >
                    Block Customer
                  </button>
                ) : (
                  <button disabled={restoration} aria-describedby="restoration-actions-note"
                    onClick={() => updateCustomer(cust.id, { status: "ACTIVE" })}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    Reinstate
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drivers List */}
      {activeTab === "DRIVERS" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tenantDrivers.map((drv) => (
            <div
              key={drv.id}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{drv.fullName}</h3>
                  <p className="text-xs text-slate-500">{drv.phone}</p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                  {drv.status}
                </span>
              </div>
              <div className="text-xs space-y-1 text-slate-600 dark:text-slate-400">
                <p>PSV Badge: <span className="font-mono font-bold text-slate-900 dark:text-white">{drv.badgeNumber}</span></p>
                <p>License: <span className="font-mono">{drv.licenseNumber}</span></p>
                <p>Medical Expiry: <span className="font-mono">{drv.medicalExpiryDate}</span></p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Corporate Accounts */}
      {activeTab === "CORPORATE" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {tenantCorporate.map((corp) => (
            <div
              key={corp.id}
              className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{corp.companyName}</h3>
                  <p className="text-xs text-slate-400">Reg: {corp.registrationNumber}</p>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                  {corp.paymentTermsDays} Days Credit
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                <div>Contact: {corp.contactPerson}</div>
                <div>Discount: {corp.discountRatePercent}%</div>
                <div className="col-span-2">Credit Limit: {activeTenant.currencySymbol} {corp.creditLimit.toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
