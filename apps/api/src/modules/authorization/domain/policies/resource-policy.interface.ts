// ============================================================================
// CAR HIRE OS — RESOURCE POLICY INTERFACE (DEV-005 §14-19)
// Contextual ABAC evaluation applied AFTER RBAC permission authorization.
// ============================================================================

import type { TrustedTenantContext } from "../../../tenancy/application/context/tenant-context.interface";

export interface ResourcePolicy<TContext = TrustedTenantContext, TResource = any> {
  canRead(context: TContext, resource: TResource): Promise<boolean> | boolean;
  canCreate?(context: TContext, resource?: Partial<TResource>): Promise<boolean> | boolean;
  canUpdate(context: TContext, resource: TResource): Promise<boolean> | boolean;
  canDelete(context: TContext, resource: TResource): Promise<boolean> | boolean;
}
