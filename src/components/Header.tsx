import React, { useState } from "react";
import {
  Search,
  Plus,
  Building2,
  ChevronDown,
  Bell,
  Clock,
  Shield,
  User as UserIcon,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Laptop,
  KeyRound,
  LogOut,
  UserPlus,
  ShieldCheck,
} from "lucide-react";
import { useApp } from "../lib/store";
import { CreateTenantModal } from "./CreateTenantModal";

export const Header: React.FC = () => {
  const {
    activeTenant,
    tenants,
    setActiveTenantId,
    switchTenant,
    currentUser,
    activeMembership,
    searchQuery,
    setSearchQuery,
    isPlatformAdminMode,
    setIsPlatformAdminMode,
    isSupportAccessActive,
    endSupportAccess,
    startSupportAccess,
    setIsNewBookingOpen,
    setIsNewVehicleOpen,
    setIsNewCustomerOpen,
    setIsInspectionModalOpen,
    notification,
    activeTenantId,
    setIsAuthModalOpen,
    setAuthModalMode,
    logoutUser,
  } = useApp();

  const [isTenantDropdownOpen, setIsTenantDropdownOpen] = useState(false);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCreateTenantOpen, setIsCreateTenantOpen] = useState(false);


  // Time in tenant timezone
  const currentTime = new Date().toLocaleTimeString("en-KE", {
    timeZone: activeTenant.timezone || "Africa/Nairobi",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <header
      id="app-header"
      className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 flex items-center justify-between sticky top-0 z-10 select-none shadow-xs"
    >
      {/* Left: Tenant Selector & Live Operational Time */}
      <div className="flex items-center gap-4">
        {/* Multi-Tenant Switcher */}
        <div className="relative">
          <button
            id="tenant-dropdown-btn"
            onClick={() => setIsTenantDropdownOpen(!isTenantDropdownOpen)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors text-xs font-semibold text-slate-800 dark:text-slate-100"
          >
            <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate max-w-[180px]">{activeTenant.name}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isTenantDropdownOpen && (
            <div
              id="tenant-dropdown-menu"
              className="absolute left-0 mt-2 w-72 rounded-xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50 animate-in fade-in slide-in-from-top-2"
            >
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Switch Organization Workspace
              </div>
              <div className="max-h-64 overflow-y-auto">
                {tenants.map((t) => {
                  const isCurrent = t.id === activeTenantId;
                  const isSuspended = t.status === "SUSPENDED";
                  return (
                    <button
                      key={t.id}
                      onClick={async () => {
                        await switchTenant(t.id);
                        setIsTenantDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 flex items-center justify-between text-xs transition-colors ${
                        isCurrent
                          ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold"
                          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <div className="truncate mr-2">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium truncate">{t.name}</p>
                          {isSuspended && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              SUSPENDED
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">
                          {t.slug} • {t.city || "Kenya"} • {t.currency}
                        </p>
                      </div>
                      {isCurrent && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="pt-1.5 mt-1 border-t border-slate-100 dark:border-slate-700/60 px-2">
                <button
                  id="provision-new-tenant-dropdown-btn"
                  onClick={() => {
                    setIsTenantDropdownOpen(false);
                    setIsCreateTenantOpen(true);
                  }}
                  className="w-full text-left px-2.5 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Provision New Workspace</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Live Clock */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 text-xs font-mono">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{currentTime}</span>
          <span className="text-[10px] text-slate-400 uppercase font-sans">EAT</span>
        </div>
      </div>

      {/* Center: Global Filter / Quick Search */}
      <div className="flex-1 max-w-md mx-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="global-search-input"
            type="text"
            placeholder="Search license plate, booking #, customer name, VIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-100 dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 border border-transparent focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-900 rounded-lg outline-none transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Right: Quick Action Button & Platform Staff Switcher */}
      <div className="flex items-center gap-3">
        {/* Support Impersonation Toggle (DEV-004 §6) */}
        {isSupportAccessActive ? (
          <button
            onClick={endSupportAccess}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-900/60 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs font-medium hover:bg-amber-200 transition-colors"
          >
            <Shield className="w-3.5 h-3.5 text-amber-600" />
            <span>End Support Session</span>
          </button>
        ) : (
          <button
            onClick={() => startSupportAccess("Customer requested emergency booking assistance")}
            title="SaaS Platform Support Impersonation"
            className="hidden lg:flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-400"
          >
            <Shield className="w-3 h-3 text-slate-400" />
            <span>Support Access</span>
          </button>
        )}

        {/* Notification Toast Alert if present */}
        {notification && (
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium shadow-sm animate-in fade-in ${
              notification.type === "error"
                ? "bg-rose-100 text-rose-800 border border-rose-200"
                : "bg-emerald-100 text-emerald-800 border border-emerald-200"
            }`}
          >
            {notification.type === "error" ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span className="truncate max-w-[200px]">{notification.message}</span>
          </div>
        )}

        {/* New Action Dropdown */}
        <div className="relative">
          <button
            id="quick-action-btn"
            onClick={() => setIsQuickActionOpen(!isQuickActionOpen)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Action</span>
            <ChevronDown className="w-3 h-3 ml-0.5" />
          </button>

          {isQuickActionOpen && (
            <div
              id="quick-action-menu"
              className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 py-1.5 z-50"
            >
              <button
                onClick={() => {
                  setIsNewBookingOpen(true);
                  setIsQuickActionOpen(false);
                }}
                className="w-full text-left px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
              >
                <span>📅 Create Booking / Quote</span>
              </button>
              <button
                onClick={() => {
                  setIsNewVehicleOpen(true);
                  setIsQuickActionOpen(false);
                }}
                className="w-full text-left px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
              >
                <span>🚗 Register Fleet Vehicle</span>
              </button>
              <button
                onClick={() => {
                  setIsNewCustomerOpen(true);
                  setIsQuickActionOpen(false);
                }}
                className="w-full text-left px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
              >
                <span>👤 Onboard Customer / KYC</span>
              </button>
              <button
                onClick={() => {
                  setIsInspectionModalOpen(true);
                  setIsQuickActionOpen(false);
                }}
                className="w-full text-left px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
              >
                <span>📋 Conduct OPS-001 Inspection</span>
              </button>
            </div>
          )}
        </div>

        {/* User Role Profile Badge & Identity Session Menu */}
        <div className="relative pl-2 border-l border-slate-200 dark:border-slate-800">
          <button
            id="user-profile-btn"
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 font-bold text-xs">
              {currentUser.fullName ? currentUser.fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "US"}
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                  {currentUser.fullName}
                </p>
                {currentUser.emailVerified ? (
                  <span title="Email Verified"><ShieldCheck className="w-3 h-3 text-emerald-500" /></span>
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Email Unverified" />
                )}
              </div>
              <p className="text-[10px] text-slate-400">{activeMembership?.roleName || (currentUser.isPlatformStaff ? "Platform Staff" : "User")}</p>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400 hidden sm:block ml-0.5" />
          </button>

          {isUserMenuOpen && (
            <div
              id="user-menu-dropdown"
              className="absolute right-0 mt-2 w-64 rounded-xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50 animate-in fade-in slide-in-from-top-2"
            >
              <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-700/60">
                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {currentUser.fullName}
                </p>
                <p className="text-[11px] text-slate-400 truncate">{currentUser.email}</p>
                <div className="mt-1 flex items-center gap-1">
                  {currentUser.emailVerified ? (
                    <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300 flex items-center gap-1">
                      <ShieldCheck className="w-2.5 h-2.5" /> Verified
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setAuthModalMode("VERIFY_EMAIL");
                        setIsAuthModalOpen(true);
                        setIsUserMenuOpen(false);
                      }}
                      className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-300 hover:underline"
                    >
                      Unverified • Verify Now
                    </button>
                  )}
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setAuthModalMode("SESSIONS");
                    setIsAuthModalOpen(true);
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2.5"
                >
                  <Laptop className="w-3.5 h-3.5 text-slate-400" />
                  <span>Active Sessions</span>
                </button>
                <button
                  onClick={() => {
                    setAuthModalMode("LOGIN");
                    setIsAuthModalOpen(true);
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2.5"
                >
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  <span>Switch Account / Sign In</span>
                </button>
                <button
                  onClick={() => {
                    setAuthModalMode("REGISTER");
                    setIsAuthModalOpen(true);
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2.5"
                >
                  <UserPlus className="w-3.5 h-3.5 text-slate-400" />
                  <span>Register New Account</span>
                </button>
              </div>

              <div className="pt-1 border-t border-slate-100 dark:border-slate-700/60">
                <button
                  onClick={async () => {
                    await logoutUser();
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Provision New Tenant Modal */}
      <CreateTenantModal
        isOpen={isCreateTenantOpen}
        onClose={() => setIsCreateTenantOpen(false)}
      />
    </header>
  );
};

