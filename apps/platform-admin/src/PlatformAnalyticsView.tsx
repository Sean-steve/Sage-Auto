import React from "react";
import { TrendingUp, Users, Car, Globe } from "lucide-react";
import { useApp } from "@/lib/store";
import { Card } from "@carhire/ui";

export const PlatformAnalyticsView: React.FC = () => {
  const { tenants = [], vehicles = [], bookings = [] } = useApp();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Platform Health & Cross-Tenant Telemetry</h2>
        <p className="text-xs text-slate-500">Aggregated utilization, fleet density, and system activity</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <span className="text-xs text-slate-500 font-medium">B2B Tenants</span>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{tenants.length}</p>
        </Card>
        <Card>
          <span className="text-xs text-slate-500 font-medium">Fleet Assets</span>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{vehicles.length}</p>
        </Card>
        <Card>
          <span className="text-xs text-slate-500 font-medium">Lifetime Bookings</span>
          <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">{bookings.length}</p>
        </Card>
        <Card>
          <span className="text-xs text-slate-500 font-medium">System Availability</span>
          <p className="text-2xl font-extrabold text-emerald-600 mt-1">99.98%</p>
        </Card>
      </div>
    </div>
  );
};
