import React from "react";
import { CreditCard, DollarSign, TrendingUp, Download } from "lucide-react";
import { useApp } from "@/lib/store";
import { Card, CardHeader, CardTitle, Badge, Button } from "@carhire/ui";

export const PlatformBillingView: React.FC = () => {
  const { subscriptions = [], plans = [], tenants = [] } = useApp();

  const totalMRR = (subscriptions || []).reduce((acc, sub) => {
    const plan = (plans || []).find((p) => p.id === sub.planId);
    return acc + (sub.state === "ACTIVE" ? plan?.monthlyPrice || 0 : 0);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Platform Billing & Invoicing</h2>
          <p className="text-xs text-slate-500">Global SaaS recurring billing, automated Stripe sync, and plan quotas</p>
        </div>
        <Button variant="outline" size="sm">
          <Download className="w-3.5 h-3.5" />
          <span>Export Financials</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <span className="text-xs text-slate-500 font-medium">Monthly Recurring Revenue</span>
          <p className="text-2xl font-extrabold text-purple-600 mt-1">KES {totalMRR.toLocaleString()}</p>
        </Card>
        <Card>
          <span className="text-xs text-slate-500 font-medium">Active Paid Subscriptions</span>
          <p className="text-2xl font-extrabold text-emerald-600 mt-1">
            {subscriptions.filter((s) => s.state === "ACTIVE").length} / {tenants.length}
          </p>
        </Card>
        <Card>
          <span className="text-xs text-slate-500 font-medium">Payment Gateway Status</span>
          <p className="text-sm font-bold text-slate-900 dark:text-white mt-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Stripe Connect / M-Pesa Live
          </p>
        </Card>
      </div>
    </div>
  );
};
