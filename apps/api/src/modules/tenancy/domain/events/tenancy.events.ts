// ============================================================================
// CAR HIRE OS — TENANCY DOMAIN EVENTS (DEV-010, DATA-002 §11)
// ============================================================================

export interface TenantProvisionedEventPayload {
  tenantId: string;
  name: string;
  slug: string;
  creatorUserId: string;
  currency: string;
  timezone: string;
  occurredAt: string;
}

export interface TenantSettingsUpdatedEventPayload {
  tenantId: string;
  updatedByUserId: string;
  changedFields: string[];
  occurredAt: string;
}

export interface TenantMembershipGrantedEventPayload {
  membershipId: string;
  tenantId: string;
  userId: string;
  role: string;
  grantedByUserId: string;
  occurredAt: string;
}

export interface TenantMembershipRevokedEventPayload {
  membershipId: string;
  tenantId: string;
  userId: string;
  revokedByUserId: string;
  occurredAt: string;
}
