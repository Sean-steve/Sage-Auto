import React, { useState } from "react";
import { Users, Fuel, ArrowRight } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button } from "@carhire/ui";

export const CatalogueView: React.FC = () => {
  const { vehicles = [], activeTenant, activeTenantId } = useApp();
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  const availableVehicles = vehicles.filter(
    (v) => v.tenantId === activeTenantId && v.availabilityStatus === "AVAILABLE" && v.isPublishedToWebsite
  );

  const filtered = availableVehicles.filter((v) => {
    if (selectedCategory !== "ALL" && v.category !== selectedCategory) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Public Vehicle Catalogue</h2>
        <div className="flex gap-2">
          {["ALL", "SUV", "Sedan", "4x4 Offroad", "Luxury"].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 text-xs font-semibold rounded-lg ${
                selectedCategory === cat
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {filtered.map((v) => (
          <div key={v.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
            <img src={v.imageUrl} alt={v.make} className="h-44 w-full object-cover" />
            <div className="p-4 space-y-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">{v.make} {v.model} ({v.year})</h3>
              <p className="text-xs text-slate-500 font-mono">KES {v.dailyRate.toLocaleString()} / day</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
