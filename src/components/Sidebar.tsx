import React from "react";
import {
  LayoutDashboard,
  Car,
  Users,
  CalendarCheck,
  CalendarDays,
  KeyRound,
  RotateCcw,
  ClipboardCheck,
  Wrench,
  ShieldCheck,
  UserCheck,
  Receipt,
  FileSpreadsheet,
  Globe,
  Server,
  Settings,
  Building2,
  AlertTriangle,
  ChevronRight,
  Zap,
  Tag,
} from "lucide-react";
import { useApp } from "../lib/store";
import { ActiveTab } from "../types";

export const Sidebar: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    activeTenant,
    activeSubscription,
    activePlan,
    vehicles,
    bookings,
    rentals,
    complianceDocs,
    maintenance,
    isPlatformAdminMode,
    isSupportAccessActive,
    activeTenantId,
  } = useApp();

  const tenantVehicles = (vehicles || []).filter((v) => v.tenantId === activeTenantId);
  const onRentCount = tenantVehicles.filter((v) => v.availabilityStatus === "ON_RENT").length;
  const activeBookingsCount = (bookings || []).filter(
    (b) => b.tenantId === activeTenantId && (b.status === "CONFIRMED" || b.status === "ACTIVE")
  ).length;
  const activeRentalsCount = (rentals || []).filter(
    (r) => r.tenantId === activeTenantId && r.state === "ACTIVE_ON_ROAD"
  ).length;
  const activeReturnsCount = (rentals || []).filter(
    (r) =>
      r.tenantId === activeTenantId &&
      ["RETURN_SCHEDULED", "VEHICLE_RECEIVED", "RETURN_INSPECTION_PENDING", "INSPECTION", "DAMAGE_ASSESSMENT", "FINAL_CALCULATION", "FINAL_SETTLEMENT_PENDING", "DEPOSIT_PROCESSING"].includes(r.state)
  ).length;
  const urgentComplianceCount = (complianceDocs || []).filter(
    (c) => c.tenantId === activeTenantId && (c.expiryState === "EXPIRING_SOON" || c.expiryState === "URGENT" || c.expiryState === "EXPIRED")
  ).length;
  const activeMaintCount = (maintenance || []).filter(
    (m) => m.tenantId === activeTenantId && m.status === "IN_PROGRESS"
  ).length;

  interface NavItem {
    id: ActiveTab;
    label: string;
    icon: React.ReactNode;
    badge?: number | string;
    badgeColor?: string;
    category: "OPERATIONS" | "FLEET_ASSETS" | "FINANCE" | "PLATFORM";
  }

  const navItems: NavItem[] = [
    {
      id: "dashboard",
      label: "Command Center",
      icon: <LayoutDashboard className="w-4 h-4" />,
      category: "OPERATIONS",
    },
    {
      id: "bookings",
      label: "Booking Engine",
      icon: <CalendarCheck className="w-4 h-4" />,
      badge: activeBookingsCount > 0 ? activeBookingsCount : undefined,
      badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
      category: "OPERATIONS",
    },
    {
      id: "availability",
      label: "Availability & Dispatch",
      icon: <CalendarDays className="w-4 h-4" />,
      category: "OPERATIONS",
    },
    {
      id: "rentals",
      label: "Active Rentals",
      icon: <KeyRound className="w-4 h-4" />,
      badge: activeRentalsCount > 0 ? activeRentalsCount : undefined,
      badgeColor: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
      category: "OPERATIONS",
    },
    {
      id: "returns",
      label: "Returns & Final Calculation",
      icon: <RotateCcw className="w-4 h-4" />,
      badge: activeReturnsCount > 0 ? activeReturnsCount : undefined,
      badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
      category: "OPERATIONS",
    },
    {
      id: "inspections",
      label: "OPS-001 Inspections",
      icon: <ClipboardCheck className="w-4 h-4" />,
      category: "OPERATIONS",
    },
    {
      id: "fleet",
      label: "Fleet Inventory",
      icon: <Car className="w-4 h-4" />,
      badge: `${onRentCount}/${tenantVehicles.length}`,
      badgeColor: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
      category: "FLEET_ASSETS",
    },
    {
      id: "owners",
      label: "Vehicle Owners & Shares",
      icon: <Users className="w-4 h-4" />,
      category: "FLEET_ASSETS",
    },
    {
      id: "maintenance",
      label: "Maintenance & Service",
      icon: <Wrench className="w-4 h-4" />,
      badge: activeMaintCount > 0 ? activeMaintCount : undefined,
      badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
      category: "FLEET_ASSETS",
    },
    {
      id: "compliance",
      label: "Regulatory Compliance",
      icon: <ShieldCheck className="w-4 h-4" />,
      badge: urgentComplianceCount > 0 ? urgentComplianceCount : undefined,
      badgeColor: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
      category: "FLEET_ASSETS",
    },
    {
      id: "customers",
      label: "Customers & Drivers",
      icon: <UserCheck className="w-4 h-4" />,
      category: "OPERATIONS",
    },
    {
      id: "pricing",
      label: "Pricing & Rate Engine",
      icon: <Tag className="w-4 h-4" />,
      category: "FINANCE",
    },
    {
      id: "finance",
      label: "Finance & General Ledger",
      icon: <Receipt className="w-4 h-4" />,
      category: "FINANCE",
    },
    {
      id: "settlements",
      label: "Owner Settlements",
      icon: <FileSpreadsheet className="w-4 h-4" />,
      category: "FINANCE",
    },
    {
      id: "website",
      label: "Public Website Engine",
      icon: <Globe className="w-4 h-4" />,
      category: "PLATFORM",
    },
    {
      id: "control-plane",
      label: "SaaS Control Plane",
      icon: <Server className="w-4 h-4" />,
      badge: "SaaS Admin",
      badgeColor: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
      category: "PLATFORM",
    },
    {
      id: "settings",
      label: "Workspace Settings",
      icon: <Settings className="w-4 h-4" />,
      category: "PLATFORM",
    },
  ];

  const categories = [
    { key: "OPERATIONS", label: "Operations & Bookings" },
    { key: "FLEET_ASSETS", label: "Fleet & Asset Controls" },
    { key: "FINANCE", label: "Financial Accounting" },
    { key: "PLATFORM", label: "Platform & Administration" },
  ];

  return (
    <aside
      id="sidebar-container"
      className="w-64 bg-slate-900 text-slate-300 flex flex-col flex-shrink-0 border-r border-slate-800 select-none z-20 h-screen sticky top-0"
    >
      {/* Brand & Active Tenant Banner */}
      <div id="sidebar-header" className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-md shadow-emerald-900/30">
            <Car className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-white text-base tracking-tight truncate">Car Hire OS</span>
              <span className="text-[10px] px-1.5 py-0.5 font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/60 rounded">
                v2.6
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">{activeTenant.name}</p>
          </div>
        </div>

        {/* Tenant Plan & Support Warning Pill */}
        <div className="mt-3 flex items-center justify-between px-2.5 py-1.5 rounded-md bg-slate-800/80 border border-slate-700/60 text-xs">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-medium text-slate-200">{activePlan.name}</span>
          </div>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
              activeSubscription.state === "ACTIVE"
                ? "bg-emerald-900/50 text-emerald-300"
                : "bg-rose-900/50 text-rose-300"
            }`}
          >
            {activeSubscription.state}
          </span>
        </div>

        {isSupportAccessActive && (
          <div className="mt-2 flex items-center gap-1.5 px-2 py-1 rounded bg-amber-950/80 border border-amber-800/60 text-[11px] text-amber-300 animate-pulse">
            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">Support Session Active</span>
          </div>
        )}
      </div>

      {/* Navigation Groups */}
      <div id="sidebar-nav" className="flex-1 overflow-y-auto py-3 px-2 space-y-4 custom-scrollbar">
        {categories.map((cat) => {
          const items = navItems.filter((i) => i.category === cat.key);
          return (
            <div key={cat.key} className="space-y-1">
              <p className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {cat.label}
              </p>
              {items.map((item) => {
                const isActive = currentView === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-tab-${item.id}`}
                    onClick={() => setCurrentView(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? "bg-emerald-600 text-white shadow-sm shadow-emerald-950 font-semibold"
                        : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className={isActive ? "text-white" : "text-slate-400"}>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1 flex-shrink-0 ${
                          isActive ? "bg-emerald-700 text-white" : item.badgeColor || "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer Tenant Info */}
      <div id="sidebar-footer" className="p-3 border-t border-slate-800 bg-slate-950/40 text-xs">
        <div className="flex items-center justify-between text-slate-400">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="truncate text-[11px]">{activeTenant.city}, {activeTenant.country}</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">{activeTenant.currency}</span>
        </div>
      </div>
    </aside>
  );
};
