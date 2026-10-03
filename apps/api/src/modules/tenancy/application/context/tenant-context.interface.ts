// ============================================================================
// CAR HIRE OS — TRUSTED TENANT CONTEXT INTERFACE (DEV-004 §4, DOM-003 §4)
// Created only after Authentication AND Active Tenant Membership Verification.
// ============================================================================

import type { TenantStatus, MembershipStatus } from "@carhire/types";

export interface TrustedTenantContext {
  tenantId: string;
  membershipId: string;
  userId: string;
  role: string;
  roles: string[];
  permissions: string[];
  tenantStatus: TenantStatus;
  tenantSlug: string;
  tenantName: string;
  currency: string;
  timezone: string;
  isPlatformBypass: boolean;
  resolvedAt: string;
}

export interface TenantResolutionOptions {
  allowSuspended?: boolean;
  platformBypass?: boolean;
  supportAccessSessionId?: string;
}
