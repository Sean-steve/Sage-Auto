import React from "react";
import { Building2, Shield, Settings } from "lucide-react";
import { useApp } from "@/lib/store";
import { Card, Button, Badge } from "@carhire/ui";

export const PlatformTenantControls: React.FC = () => {
  const { tenants = [], activeTenantId, setActiveTenantId } = useApp();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Tenant Registry & Provisioning Controls</h2>
        <p className="text-xs text-slate-500">Manage tenant isolation partitions, database tenancy, and active context</p>
      </div>

      <div className="space-y-3">
        {tenants.map((t) => (
          <Card key={t.id} className="flex items-center justify-between p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900 dark:text-white">{t.name}</span>
                <Badge variant={t.status === "ACTIVE" ? "success" : "warning"}>{t.status}</Badge>
                {t.id === activeTenantId && <Badge variant="info">Active Context</Badge>}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Slug: {t.slug} • Plan: {t.planId} • Currency: {t.currency}
              </p>
            </div>
            {t.id !== activeTenantId && (
              <Button size="sm" variant="outline" onClick={() => setActiveTenantId(t.id)}>
                Switch Context
              </Button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};
