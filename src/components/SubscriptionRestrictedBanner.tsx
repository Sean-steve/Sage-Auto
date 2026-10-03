// ============================================================================
// CAR HIRE OS — SUBSCRIPTION RESTRICTED BANNER (Sprint 8: ENT-001, ARCH-004)
// High-Visibility, Accessible Workspace Access Mode Status Banner
// ============================================================================

import React from "react";
import { AlertTriangle, ShieldAlert, CreditCard, Clock, RefreshCw, ChevronRight } from "lucide-react";
import { useApp } from "../lib/store";

export const SubscriptionRestrictedBanner: React.FC = () => {
  const { statusBanner, setCurrentView } = useApp();

  if (!statusBanner) {
    return null;
  }

  const getStyle = () => {
    switch (statusBanner.type) {
      case "WARNING":
        return {
          bg: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200",
          icon: <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />,
          btn: "bg-amber-600 hover:bg-amber-700 text-white shadow-xs",
        };
      case "RESTRICTED":
        return {
          bg: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800 text-orange-900 dark:text-orange-200",
          icon: <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0" />,
          btn: "bg-orange-600 hover:bg-orange-700 text-white shadow-xs",
        };
      case "SUSPENDED":
      case "EXPIRED":
      default:
        return {
          bg: "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200",
          icon: <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />,
          btn: "bg-rose-600 hover:bg-rose-700 text-white shadow-xs",
        };
    }
  };

  const style = getStyle();

  return (
    <div
      id="subscription-status-banner"
      className={`w-full border-b px-6 py-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${style.bg} transition-all select-none`}
    >
      <div className="flex items-center gap-3">
        {style.icon}
        <div>
          <span className="text-xs font-bold mr-2">{statusBanner.title}:</span>
          <span className="text-xs opacity-90">{statusBanner.message}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          id="subscription-banner-action-btn"
          onClick={() => setCurrentView("settings")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${style.btn}`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>{statusBanner.actionLabel || "Manage Billing"}</span>
          <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
        </button>
      </div>
    </div>
  );
};
