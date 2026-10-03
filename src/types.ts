// ============================================================================
// CAR HIRE OS — CANONICAL TYPES FORWARDER & PROTOTYPE ADAPTER
// ============================================================================
export * from "@carhire/types";
export * from "@carhire/contracts";

// ----------------------------------------------------------------------------
// UI NAVIGATION TABS & PROTOTYPE VIEW STATE
// ----------------------------------------------------------------------------
export type ActiveTab =
  | "dashboard"
  | "fleet"
  | "availability"
  | "owners"
  | "bookings"
  | "rentals"
  | "inspections"
  | "maintenance"
  | "compliance"
  | "customers"
  | "pricing"
  | "finance"
  | "settlements"
  | "website"
  | "control-plane"
  | "settings";

// ----------------------------------------------------------------------------
// PROTOTYPE COMPATIBILITY ADAPTERS
// ----------------------------------------------------------------------------
export type FeatureKey =
  | "fleet.vehicle.create"
  | "analytics.advanced"
  | "custom_domain"
  | "api_access"
  | "multi_branch"
  | "double_entry_ledger"
  | "owner_settlements"
  | string;

export type PrototypeLedgerAccount = import("@carhire/types").PrototypeLedgerAccount;
export type PrototypeLedgerEntry = import("@carhire/types").PrototypeLedgerEntry;
export type PrototypeLedgerTransaction = import("@carhire/types").PrototypeLedgerTransaction;

export interface InspectionDamage {
  id: string;
  zone: string;
  type: string;
  severity: string;
  description: string;
  photoUrl?: string;
  estimatedCost: number;
  isPreExisting: boolean;
}

export type InspectionZone =
  | "FRONT_BUMPER"
  | "HOOD"
  | "WINDSHIELD"
  | "ROOF"
  | "LEFT_FRONT_DOOR"
  | "RIGHT_FRONT_DOOR"
  | "LEFT_REAR_DOOR"
  | "RIGHT_REAR_DOOR"
  | "LEFT_MIRROR"
  | "RIGHT_MIRROR"
  | "LEFT_QUARTER_PANEL"
  | "RIGHT_QUARTER_PANEL"
  | "REAR_BUMPER"
  | "TAILGATE"
  | string;
