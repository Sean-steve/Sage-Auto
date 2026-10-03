// ============================================================================
// CAR HIRE OS — DOMAIN RESOURCE POLICIES (DEV-005 §14-19)
// Concrete ABAC policies for Vehicles, Bookings, Settlements, and Users.
// ============================================================================

import type { Vehicle, Booking, OwnerSettlement, User } from "@carhire/types";
import { TENANT_PERMISSIONS } from "@carhire/constants";
import type { ResourcePolicy } from "./resource-policy.interface";
import type { TrustedTenantContext } from "../../../tenancy/application/context/tenant-context.interface";

/**
 * Policy governing Vehicle access:
 * - Tenant isolation invariant (resource.tenantId === context.tenantId)
 * - Vehicle owner resource scoping (owners may read their own vehicles)
 */
export class VehicleResourcePolicy implements ResourcePolicy<TrustedTenantContext, Vehicle> {
  canRead(context: TrustedTenantContext, vehicle: Vehicle): boolean {
    if (!vehicle || vehicle.tenantId !== context.tenantId) return false;

    // Direct permission
    if (context.permissions.includes(TENANT_PERMISSIONS.VEHICLE_READ) || context.permissions.includes("*")) {
      return true;
    }

    // Contextual owner self-scope
    if (vehicle.ownerId && vehicle.ownerId === context.userId) {
      return true;
    }

    return false;
  }

  canUpdate(context: TrustedTenantContext, vehicle: Vehicle): boolean {
    if (!vehicle || vehicle.tenantId !== context.tenantId) return false;
    return context.permissions.includes(TENANT_PERMISSIONS.VEHICLE_UPDATE) || context.permissions.includes("*");
  }

  canDelete(context: TrustedTenantContext, vehicle: Vehicle): boolean {
    if (!vehicle || vehicle.tenantId !== context.tenantId) return false;
    return context.permissions.includes(TENANT_PERMISSIONS.VEHICLE_DELETE) || context.permissions.includes("*");
  }
}

/**
 * Policy governing Booking access:
 * - Tenant isolation invariant
 * - Customer self-scope & driver assignment scope
 */
export class BookingResourcePolicy implements ResourcePolicy<TrustedTenantContext, Booking> {
  canRead(context: TrustedTenantContext, booking: Booking): boolean {
    if (!booking || booking.tenantId !== context.tenantId) return false;

    if (context.permissions.includes(TENANT_PERMISSIONS.BOOKING_READ) || context.permissions.includes("*")) {
      return true;
    }

    // Customer self access
    if (booking.customerId && booking.customerId === context.userId) {
      return true;
    }

    // Assigned driver access
    if (booking.driverId && booking.driverId === context.userId) {
      return true;
    }

    return false;
  }

  canUpdate(context: TrustedTenantContext, booking: Booking): boolean {
    if (!booking || booking.tenantId !== context.tenantId) return false;
    return context.permissions.includes(TENANT_PERMISSIONS.BOOKING_UPDATE) || context.permissions.includes("*");
  }

  canDelete(context: TrustedTenantContext, booking: Booking): boolean {
    if (!booking || booking.tenantId !== context.tenantId) return false;
    return context.permissions.includes(TENANT_PERMISSIONS.BOOKING_CANCEL) || context.permissions.includes("*");
  }
}

/**
 * Policy governing Owner Settlement statements:
 * - Tenant isolation invariant
 * - Asset owner self-scope (can view own settlement, but cannot approve/pay own statement)
 */
export class SettlementResourcePolicy implements ResourcePolicy<TrustedTenantContext, OwnerSettlement> {
  canRead(context: TrustedTenantContext, settlement: OwnerSettlement): boolean {
    if (!settlement || settlement.tenantId !== context.tenantId) return false;

    if (context.permissions.includes(TENANT_PERMISSIONS.SETTLEMENT_READ) || context.permissions.includes("*")) {
      return true;
    }

    // Owner self access
    if (settlement.ownerId && settlement.ownerId === context.userId) {
      return true;
    }

    return false;
  }

  canUpdate(context: TrustedTenantContext, settlement: OwnerSettlement): boolean {
    if (!settlement || settlement.tenantId !== context.tenantId) return false;
    // Approving/calculating requires settlement calculation/approval permissions
    return (
      context.permissions.includes(TENANT_PERMISSIONS.SETTLEMENT_CALCULATE) ||
      context.permissions.includes(TENANT_PERMISSIONS.SETTLEMENT_APPROVE) ||
      context.permissions.includes("*")
    );
  }

  canDelete(context: TrustedTenantContext, settlement: OwnerSettlement): boolean {
    if (!settlement || settlement.tenantId !== context.tenantId) return false;
    return context.permissions.includes(TENANT_PERMISSIONS.SETTLEMENT_APPROVE) || context.permissions.includes("*");
  }
}

/**
 * Policy governing User Profile access:
 * - Users can always view and edit their own identity profile
 * - Managing other users requires user.update/user.remove permissions
 */
export class UserProfileResourcePolicy implements ResourcePolicy<TrustedTenantContext, User> {
  canRead(context: TrustedTenantContext, user: User): boolean {
    if (user.id === context.userId) return true;
    return context.permissions.includes(TENANT_PERMISSIONS.USER_READ) || context.permissions.includes("*");
  }

  canUpdate(context: TrustedTenantContext, user: User): boolean {
    if (user.id === context.userId) return true;
    return context.permissions.includes(TENANT_PERMISSIONS.USER_UPDATE) || context.permissions.includes("*");
  }

  canDelete(context: TrustedTenantContext, user: User): boolean {
    if (user.id === context.userId) return false; // Cannot self-delete via user removal
    return context.permissions.includes(TENANT_PERMISSIONS.USER_REMOVE) || context.permissions.includes("*");
  }
}
