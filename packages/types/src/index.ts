export * from "./money";
export * from "./finance";
export * from "./ledger";
export * from "./settlements";
export * from "./payments";
export * from "./mpesa";
export * from "./cards";
export * from "./notifications";
export * from "./crm";
export * from "./analytics";
export * from "./platform-analytics";

// ----------------------------------------------------------------------------
// 1. TENANCY & GLOBAL IDENTITY (DEV-004, DOM-003 §4-6, ADR-009)
// ----------------------------------------------------------------------------
export type TenantStatus = "ACTIVE" | "SUSPENDED" | "PAST_DUE" | "TRIAL" | "CANCELLED";

export interface TenantWebsiteConfig {
  customDomain?: string;
  primaryColor?: string;
  isCustomDomainVerified?: boolean;
}

export interface TenantSetting {
  id: string;
  tenantId: string;
  vatRatePercent: number;
  mpesaPaybill?: string;
  mpesaShortcode?: string;
  mpesaPasskey?: string;
  mpesaSandbox: boolean;
  allowedDailyKm: number;
  excessKmRate: number;
  depositDefaultAmount: number;
  cdwDailyRate: number;
  enableGpsTracking: boolean;
  requirePreauthDeposit: boolean;
  flexibleConfig?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  companyName?: string;
  tagline?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  currency: string; // ISO 4217 (e.g., 'KES', 'USD')
  defaultCurrency?: string;
  currencySymbol?: string;
  timezone?: string; // IANA (e.g., 'Africa/Nairobi')
  status: TenantStatus;
  planId: string;
  taxRatePercent?: number;
  defaultSecurityDeposit?: number;
  freeKmPerDay?: number;
  excessKmRate?: number;
  fuelRatePerLiter?: number;
  mpesaPaybill?: string;
  mpesaPasskey?: string;
  mpesaSandbox?: boolean;
  enableGpsTracking?: boolean;
  requirePreAuthDeposit?: boolean;
  websiteConfig?: TenantWebsiteConfig;
  paymentGateways?: {
    mpesa?: { enabled: boolean; paybill: string };
    card?: { enabled: boolean };
  };
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export type MembershipStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "REVOKED" | "REMOVED";

export interface User {
  id: string;
  email: string;
  normalizedEmail?: string;
  passwordHash?: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  isPlatformStaff: boolean;
  emailVerified?: boolean;
  emailVerifiedAt?: Date | string;
  status: "ACTIVE" | "SUSPENDED" | "DISABLED" | string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  tokenFamilyId: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt?: string;
  revocationReason?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceLabel?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
}

export interface UserJwtPayload {
  sub: string;
  sid: string;
  email: string;
  fullName: string;
  isPlatformStaff: boolean;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

export interface EmailVerificationToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

export interface RegisterUserDto {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface SanitizedSession {
  id: string;
  userId: string;
  deviceLabel?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent?: boolean;
}

export interface CreateTenantDto {
  name: string;
  slug: string;
  defaultCurrency?: string;
  currencySymbol?: string;
  timezone?: string;
  countryCode?: string;
  initialSettings?: Partial<TenantSetting>;
}

export interface UpdateTenantSettingsDto {
  vatRatePercent?: number;
  mpesaPaybill?: string;
  mpesaShortcode?: string;
  mpesaPasskey?: string;
  mpesaSandbox?: boolean;
  allowedDailyKm?: number;
  excessKmRate?: number;
  depositDefaultAmount?: number;
  cdwDailyRate?: number;
  enableGpsTracking?: boolean;
  requirePreauthDeposit?: boolean;
  flexibleConfig?: Record<string, unknown>;
}

export interface UserTenantMembershipDto {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantStatus: TenantStatus;
  role: string;
  status: MembershipStatus;
  joinedAt: string;
}

export interface TenantMembership {
  id: string;
  tenantId: string;
  userId: string;
  role?: string;
  roleId?: string;
  roleName?: string;
  status: MembershipStatus;
  joinedAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlatformMembership {
  id: string;
  userId: string;
  role: "PLATFORM_OWNER" | "PLATFORM_ADMIN" | "BILLING_ADMIN" | "SUPPORT_ADMIN" | "ANALYTICS_ADMIN" | "COMPLIANCE_ADMIN";
  permissions: string[];
  email?: string;
  name?: string;
  status?: "ACTIVE" | "SUSPENDED";
  createdAt?: string;
  updatedAt?: string;
}

export interface TenantContext {
  tenantId: string;
  membershipId: string;
  userId: string;
  roles: string[];
  permissions: string[];
}

export interface SupportAccessSession {
  id: string;
  platformUserId: string;
  targetTenantId: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
  endedAt?: string;
  isActive: boolean;
  scope?: "READ_ONLY" | "DIAGNOSTIC_WRITE" | "FULL_ADMIN";
  actorEmail?: string;
  targetTenantName?: string;
}

// ----------------------------------------------------------------------------
// 2. AUTHORIZATION & RBAC (DEV-005, DOM-003 §8, SEC-005)
// ----------------------------------------------------------------------------
export interface Role {
  id: string;
  tenantId?: string; // null for global/system roles; string for custom tenant roles
  code?: string; // e.g., 'COMPANY_OWNER', 'MANAGER', or custom slug
  name: string;
  description: string;
  isSystem: boolean;
  isOwnerRole?: boolean;
  status: "ACTIVE" | "DISABLED";
  permissions: string[]; // resource.action
  createdAt?: string;
  updatedAt?: string;
}

export interface RolePermission {
  id: string;
  roleId: string;
  permissionKey: string;
  createdAt: string;
}

export interface TenantMembershipRole {
  id: string;
  tenantId: string;
  membershipId: string;
  roleId: string;
  assignedBy?: string;
  assignedAt: string;
}

export interface PlatformRole {
  id: string;
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
  createdAt?: string;
}

export interface PlatformMembershipRole {
  id: string;
  platformMembershipId: string;
  platformRoleId: string;
  assignedBy?: string;
  assignedAt: string;
}

export interface PlatformAuthorizationContext {
  userId: string;
  platformMembershipId: string;
  platformRoles: string[];
  permissions: string[];
  requestId: string;
  resolvedAt: string;
}

export interface EffectiveAuthorization {
  userId: string;
  tenantId?: string;
  membershipId?: string;
  roles: Array<{ id: string; name: string; code?: string; isSystem: boolean; isOwnerRole?: boolean }>;
  permissions: string[];
  isOwner: boolean;
  isPlatformStaff: boolean;
  supportSession?: {
    sessionId: string;
    expiresAt: string;
    reason: string;
  };
}

export interface CreateRoleDto {
  name: string;
  description: string;
  permissions: string[];
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  permissions?: string[];
  status?: "ACTIVE" | "DISABLED";
}

export interface AssignRoleDto {
  roleId: string;
}

// ----------------------------------------------------------------------------
// 3. SAAS CONTROL PLANE & ENTITLEMENTS (ARCH-004, ENT-001, DOM-003 §37-39)
// ----------------------------------------------------------------------------
export type PlanStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type BillingInterval = "MONTHLY" | "YEARLY" | "ANNUAL";

export type OperationCategory =
  | "READ_EXISTING_DATA"
  | "CREATE_NEW_RESOURCE"
  | "UPDATE_EXISTING_RESOURCE"
  | "DELETE_RESOURCE"
  | "COMPLETE_EXISTING_RENTAL"
  | "MANAGE_EXISTING_BOOKING"
  | "BILLING_ACCESS"
  | "SUBSCRIPTION_MANAGEMENT"
  | "DATA_EXPORT"
  | "PUBLIC_BOOKING"
  | "PLATFORM_SUPPORT_ACTION";

export type TenantAccessMode = "FULL" | "WARNING" | "RESTRICTED" | "SUSPENDED";
export type RestrictedMode = TenantAccessMode;

export interface SubscriptionAccessDecision {
  allowed: boolean;
  subscriptionStatus: SubscriptionStatus;
  accessMode: TenantAccessMode;
  operationCategory: OperationCategory;
  code?: string;
  message?: string;
  allowedOperations: OperationCategory[];
  restrictedOperations: OperationCategory[];
  requiresUpgrade?: boolean;
  requiresPayment?: boolean;
  effectiveAt?: string;
}

export interface AccessContextResponse {
  tenantId: string;
  subscription: {
    id: string;
    planId: string;
    planCode: string;
    status: SubscriptionStatus;
    currentPeriodEnd: string;
    cancelAtPeriodEnd?: boolean;
    autoRenew: boolean;
  } | null;
  accessMode: TenantAccessMode;
  isRestricted: boolean;
  statusBanner?: {
    type: "WARNING" | "RESTRICTED" | "SUSPENDED" | "EXPIRED";
    title: string;
    message: string;
    actionUrl?: string;
    actionLabel?: string;
  } | null;
  allowedOperations: OperationCategory[];
  restrictedOperations: OperationCategory[];
  permissions: string[];
  isOwner: boolean;
  entitlements: Record<string, EntitlementDecision>;
  limits: {
    maxVehicles: { limit: number | null; usage: number; remaining: number | null; isUnlimited: boolean };
    maxMembers: { limit: number | null; usage: number; remaining: number | null; isUnlimited: boolean };
  };
}

export interface Plan {
  id: string;
  code: string; // e.g., "STARTER" | "GROWTH" | "ENTERPRISE" | custom
  name: string;
  description?: string;
  status?: PlanStatus;
  currency: string;
  price?: number; // monthly or base price in decimal
  monthlyPrice: number;
  annualPrice: number;
  billingInterval?: BillingInterval;
  trialDurationDays?: number;
  isPublic?: boolean;
  sortOrder?: number;
  maxVehicles: number;
  maxMembers: number;
  allowCustomDomain: boolean;
  allowDoubleEntryLedger: boolean;
  allowOwnerSettlements: boolean;
  allowPublicWebsite: boolean;
  allowMpesaDaraja: boolean;
  features: string[];
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type SubscriptionState =
  | "TRIAL"
  | "ACTIVE"
  | "RENEWAL_DUE"
  | "PAST_DUE"
  | "GRACE_PERIOD"
  | "SUSPENDED"
  | "CANCELLED"
  | "EXPIRED";

export type SubscriptionStatus = SubscriptionState;

export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  status?: SubscriptionStatus;
  state: SubscriptionState; // Alias for backward compatibility
  startedAt?: string;
  trialEndsAt?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  renewalDueAt?: string;
  graceEndsAt?: string;
  gracePeriodEndsAt?: string; // Alias for backward compatibility
  cancelAtPeriodEnd?: boolean;
  cancelledAt?: string;
  endedAt?: string;
  billingInterval?: BillingInterval;
  billingCycle: "MONTHLY" | "ANNUAL";
  amount: number;
  currency: string;
  autoRenew: boolean;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SubscriptionStatusHistory {
  id: string;
  subscriptionId: string;
  tenantId: string;
  previousStatus?: SubscriptionStatus;
  newStatus: SubscriptionStatus;
  reason: string;
  actorType: "PLATFORM_STAFF" | "USER" | "SYSTEM";
  actorId?: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
}

export interface BillingAccount {
  id: string;
  tenantId: string;
  billingEmail: string;
  legalName: string;
  taxNumber?: string;
  billingAddress?: {
    street?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  currency: string;
  status: "ACTIVE" | "SUSPENDED" | "CLOSED";
  createdAt: string;
  updatedAt: string;
}

export type SaaSBillingInvoiceStatus =
  | "DRAFT"
  | "OPEN"
  | "ISSUED"
  | "PAID"
  | "OVERDUE"
  | "VOID"
  | "UNCOLLECTIBLE";

export interface SaaSBillingInvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  referenceType?: "SUBSCRIPTION_BASE" | "ADDON" | "ADJUSTMENT" | "PRORATION";
  referenceId?: string;
  createdAt: string;
}

export interface SaaSBillingInvoice {
  id: string;
  tenantId: string;
  billingAccountId?: string;
  subscriptionId?: string;
  invoiceNumber: string;
  status: SaaSBillingInvoiceStatus;
  currency: string;
  subtotal?: number;
  tax?: number;
  discount?: number;
  total?: number;
  amountPaid?: number;
  amountDue?: number;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  issuedAt?: string;
  dueAt?: string;
  paidAt?: string;
  lineItems?: SaaSBillingInvoiceItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BillingInvoice extends Partial<SaaSBillingInvoice> {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  status: any;
  currency: string;
  amount: number; // Alias for total
  issueDate: string; // Alias for issuedAt
  dueDate: string; // Alias for dueAt
  paidAt?: string;
}

export interface SaaSPaymentRecord {
  id: string;
  tenantId: string;
  invoiceId: string;
  provider: "STRIPE" | "MPESA_DARAJA" | "MANUAL_BANK" | "PESAPAL" | "DEVELOPMENT_MOCK";
  providerReference: string;
  amount: number;
  currency: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
  receivedAt: string;
  recordedBy?: string;
  notes?: string;
  createdAt: string;
}

export interface CreatePlanDto {
  code: string;
  name: string;
  description?: string;
  currency: string;
  price: number;
  billingInterval: BillingInterval;
  trialDurationDays?: number;
  isPublic?: boolean;
  sortOrder?: number;
  maxVehicles?: number;
  maxMembers?: number;
  allowCustomDomain?: boolean;
  allowDoubleEntryLedger?: boolean;
  allowOwnerSettlements?: boolean;
  allowPublicWebsite?: boolean;
  allowMpesaDaraja?: boolean;
  features?: string[];
}

export interface UpdatePlanDto {
  name?: string;
  description?: string;
  status?: PlanStatus;
  price?: number;
  isPublic?: boolean;
  sortOrder?: number;
  maxVehicles?: number;
  maxMembers?: number;
  allowCustomDomain?: boolean;
  allowDoubleEntryLedger?: boolean;
  allowOwnerSettlements?: boolean;
  allowPublicWebsite?: boolean;
  allowMpesaDaraja?: boolean;
  features?: string[];
}

export interface CreateSubscriptionDto {
  tenantId: string;
  planId: string;
  billingInterval?: BillingInterval;
  autoRenew?: boolean;
  startAsTrial?: boolean;
}

export interface ChangePlanDto {
  newPlanId: string;
  billingInterval?: BillingInterval;
  reason?: string;
}

export interface RecordSaaSPaymentDto {
  invoiceId: string;
  amount: number;
  currency: string;
  provider?: "STRIPE" | "MPESA_DARAJA" | "MANUAL_BANK" | "PESAPAL" | "DEVELOPMENT_MOCK";
  providerReference: string;
  notes?: string;
}

export type EntitlementDenialCode =
  | "SUBSCRIPTION_INACTIVE"
  | "SUBSCRIPTION_SUSPENDED"
  | "FEATURE_NOT_INCLUDED"
  | "ENTITLEMENT_DISABLED"
  | "LIMIT_REACHED"
  | "USAGE_EXCEEDED"
  | "ADDON_REQUIRED"
  | "PLAN_UPGRADE_REQUIRED"
  | "TENANT_RESTRICTED"
  | "PLATFORM_RESTRICTED";

export type EntitlementDenialReason = EntitlementDenialCode;

export type FeatureType =
  | "BOOLEAN"
  | "NUMERIC_LIMIT"
  | "USAGE_LIMIT"
  | "MODULE"
  | "ACTION"
  | "RESOURCE";

export type FeatureCategory =
  | "FLEET"
  | "ANALYTICS"
  | "WEBSITE"
  | "FINANCE"
  | "INTEGRATIONS"
  | "USERS"
  | "NOTIFICATIONS"
  | "GENERAL";

export interface Feature {
  id: string;
  key: string;
  name: string;
  description: string;
  type: FeatureType;
  category: FeatureCategory;
  status: "ACTIVE" | "DEPRECATED" | "DISABLED";
  defaultValue?: boolean | number | string | Record<string, unknown>;
  isAddonEligible?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlanFeature {
  id: string;
  planId: string;
  featureId: string;
  featureKey: string;
  enabled: boolean;
  limitValue?: number | null;
  isUnlimited?: boolean;
  configuration?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TenantEntitlement {
  id: string;
  tenantId: string;
  featureId: string;
  featureKey: string;
  source: "PLAN" | "ADDON" | "OVERRIDE" | "DEFAULT";
  sourceId?: string;
  enabled: boolean;
  limitValue?: number | null;
  isUnlimited?: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EntitlementOverride {
  id: string;
  tenantId: string;
  featureId?: string;
  featureKey: string;
  enabled: boolean;
  limitValue?: number | null;
  isUnlimited?: boolean;
  reason: string;
  createdBy: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  effectiveFrom: string;
  effectiveTo?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntitlementRestriction {
  id: string;
  tenantId?: string; // null for global platform restriction, or tenant ID
  scope: "PLATFORM" | "TENANT";
  featureKey: string;
  restrictionType: "BLOCK" | "FORCE_LIMIT";
  enforcedLimit?: number | null;
  reason: string;
  imposedBy: string;
  status: "ACTIVE" | "LIFTED";
  effectiveFrom: string;
  effectiveTo?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EntitlementUsage {
  id: string;
  tenantId: string;
  featureKey: string;
  periodKey: string;
  periodStart: string;
  periodEnd?: string;
  currentUsage: number;
  lastIncrementAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface EntitlementDecision {
  allowed: boolean;
  feature: string;
  code?: EntitlementDenialCode;
  reason?: EntitlementDenialReason;
  limit?: number | null;
  isUnlimited?: boolean;
  usage?: number;
  currentUsage?: number;
  remaining?: number | null;
  source?: "PLATFORM_RESTRICTION" | "TENANT_RESTRICTION" | "OVERRIDE" | "ADDON" | "PLAN" | "DEFAULT";
  message?: string;
  upgradeRecommended?: boolean;
}

export interface CreateFeatureDto {
  key: string;
  name: string;
  description: string;
  type: FeatureType;
  category: FeatureCategory;
  defaultValue?: boolean | number | string | Record<string, unknown>;
  isAddonEligible?: boolean;
}

export interface ConfigurePlanFeatureDto {
  featureKey: string;
  enabled: boolean;
  limitValue?: number | null;
  isUnlimited?: boolean;
  configuration?: Record<string, unknown>;
}

export interface CreateEntitlementOverrideDto {
  featureKey: string;
  enabled?: boolean;
  limitValue?: number | null;
  isUnlimited?: boolean;
  reason: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
}

export interface CreateEntitlementRestrictionDto {
  featureKey: string;
  scope: "PLATFORM" | "TENANT";
  tenantId?: string;
  restrictionType?: "BLOCK" | "FORCE_LIMIT";
  enforcedLimit?: number | null;
  reason: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
}

export interface ReserveCapacityDto {
  featureKey: string;
  quantity?: number;
}

// ----------------------------------------------------------------------------
// 4. FLEET & VEHICLE OWNERSHIP (DOM-001 §9-10, DOM-003 §7-10, BRS-001 §4-8)
// ----------------------------------------------------------------------------
export type VehicleCategory = "SUV" | "Sedan" | "4x4 Offroad" | "Luxury" | "Hatchback" | "Van/Bus";

export type VehicleLifecycleStatus =
  | "DRAFT"
  | "PENDING_VERIFICATION"
  | "ACTIVE"
  | "SUSPENDED"
  | "INACTIVE"
  | "SOLD"
  | "RETIRED"
  | "OPERATIONAL";

export type VehicleAvailabilityStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "ON_RENT"
  | "MAINTENANCE"
  | "BLOCKED";

export interface Vehicle {
  id: string;
  tenantId: string;
  registrationPlate: string;
  make: string;
  model: string;
  year: number;
  category: VehicleCategory;
  color?: string;
  vin: string;
  odometer: number;
  fuelLevel: number; // 0 to 100%
  dailyRate: number;
  lifecycleStatus: VehicleLifecycleStatus;
  availabilityStatus: VehicleAvailabilityStatus;
  transmission: "Automatic" | "Manual" | "AUTOMATIC" | "MANUAL";
  seats: number;
  fuelType: "Petrol" | "Diesel" | "Hybrid" | "Electric" | "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC";
  features: string[];
  imageUrl: string;
  currentLocation?: string;
  isPublishedToWebsite?: boolean;
  assignedDriverId?: string;
  ownerId?: string;
  activeOwnershipId?: string;
  insuranceExpiryDate?: string;
  inspectionExpiryDate?: string;
  allowedDailyKm?: number;
  excessKmRate?: number;
  lastServiceMileage?: number;
  nextServiceMileage?: number;
  version?: number;
  createdAt: string;
  updatedAt: string;
}

export type OwnershipType =
  | "COMPANY_OWNED"
  | "THIRD_PARTY_OWNED"
  | "LEASED"
  | "MANAGED"
  | "PARTNERSHIP"
  | "COMPANY"
  | "INDIVIDUAL";

export type OwnerStatus = "ACTIVE" | "SUSPENDED" | "INACTIVE";

export type VehicleOwnerType = "INDIVIDUAL" | "COMPANY";

export interface VehicleOwner {
  id: string;
  tenantId: string;
  name: string;
  companyName?: string;
  ownerType?: VehicleOwnerType;
  email: string;
  phone: string;
  idOrPassportNumber?: string;
  taxPinNumber?: string;
  payoutBank?: string;
  payoutAccountNumber?: string;
  payoutMpesaNumber?: string;
  ownershipType?: OwnershipType;
  status: OwnerStatus;
  notes?: string;
  version?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface VehicleOwnership {
  id: string;
  tenantId: string;
  vehicleId: string;
  ownerId: string;
  ownershipType: OwnershipType;
  startDate: string;
  endDate?: string;
  revenueSharePercent: number; // e.g. 75.0000
  fixedMonthlyPayout?: number;
  allowableExpenseDeductions: boolean;
  termsSnapshot?: string;
  notes?: string;
  isActive: boolean;
  version?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface VehicleCategoryItem {
  id: string;
  tenantId?: string;
  name: string;
  code: string;
  description?: string;
  icon?: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
}

export interface VehicleFeatureItem {
  id: string;
  tenantId?: string;
  code: string;
  name: string;
  category?: string;
  icon?: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  updatedAt: string;
}

export interface VehicleDocumentItem {
  id: string;
  tenantId: string;
  vehicleId: string;
  documentType: "INSURANCE_CERTIFICATE" | "NTSA_INSPECTION" | "PSV_LICENSE" | "LOGBOOK_TITLE" | "LEASE_AGREEMENT" | "SERVICE_RECORD" | "OTHER";
  documentNumber?: string;
  fileId?: string;
  fileName?: string;
  fileUrl?: string;
  issuedAt?: string;
  expiresAt?: string;
  status: "VALID" | "EXPIRING_SOON" | "EXPIRED" | "REJECTED";
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED";
  createdAt: string;
  updatedAt: string;
}

export interface VehicleMileageRecord {
  id: string;
  tenantId: string;
  vehicleId: string;
  recordedMileage: number;
  recordedAt: string;
  source: "RENTAL_CHECKOUT" | "RENTAL_RETURN" | "INSPECTION" | "MAINTENANCE" | "MANUAL_AUDIT" | "TELEMATICS";
  recordedBy?: string;
  notes?: string;
  createdAt: string;
}

export interface VehicleFuelRecord {
  id: string;
  tenantId: string;
  vehicleId: string;
  fuelLevelPercent: number;
  litersAdded?: number;
  cost?: number;
  recordedAt: string;
  source?: string;
  recordedBy?: string;
  createdAt: string;
}

export interface VehicleStatusHistory {
  id: string;
  tenantId: string;
  vehicleId: string;
  previousLifecycleStatus: VehicleLifecycleStatus;
  newLifecycleStatus: VehicleLifecycleStatus;
  previousAvailabilityStatus: VehicleAvailabilityStatus;
  newAvailabilityStatus: VehicleAvailabilityStatus;
  reason?: string;
  actorId?: string;
  actorName?: string;
  timestamp: string;
}

export interface VehicleDigitalTwin {
  vehicle: Vehicle;
  category?: VehicleCategoryItem;
  currentOwnership?: (VehicleOwnership & { owner?: VehicleOwner }) | null;
  ownershipHistory: (VehicleOwnership & { owner?: VehicleOwner })[];
  documents: VehicleDocumentItem[];
  recentMileage: VehicleMileageRecord[];
  recentFuel: VehicleFuelRecord[];
  statusHistory: VehicleStatusHistory[];
  stats: {
    totalRentals: number;
    totalRevenue: number;
    totalDaysOnRent: number;
    utilizationRatePercent: number;
  };
}

// Fleet DTOs
export interface CreateVehicleDto {
  registrationPlate: string;
  make: string;
  model: string;
  year: number;
  category: VehicleCategory;
  color?: string;
  vin?: string;
  odometer?: number;
  fuelLevel?: number;
  dailyRate: number;
  transmission?: "Automatic" | "Manual" | "AUTOMATIC" | "MANUAL";
  seats?: number;
  fuelType?: "Petrol" | "Diesel" | "Hybrid" | "Electric" | "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC";
  features?: string[];
  imageUrl?: string;
  currentLocation?: string;
  isPublishedToWebsite?: boolean;
  ownerId?: string;
  ownershipType?: OwnershipType;
  revenueSharePercent?: number;
  insuranceExpiryDate?: string;
  inspectionExpiryDate?: string;
  allowedDailyKm?: number;
  excessKmRate?: number;
}

export interface UpdateVehicleDto {
  make?: string;
  model?: string;
  year?: number;
  category?: VehicleCategory;
  color?: string;
  vin?: string;
  odometer?: number;
  fuelLevel?: number;
  dailyRate?: number;
  transmission?: "Automatic" | "Manual" | "AUTOMATIC" | "MANUAL";
  seats?: number;
  fuelType?: "Petrol" | "Diesel" | "Hybrid" | "Electric" | "PETROL" | "DIESEL" | "HYBRID" | "ELECTRIC";
  features?: string[];
  imageUrl?: string;
  currentLocation?: string;
  isPublishedToWebsite?: boolean;
  assignedDriverId?: string;
  insuranceExpiryDate?: string;
  inspectionExpiryDate?: string;
  allowedDailyKm?: number;
  excessKmRate?: number;
  lastServiceMileage?: number;
  nextServiceMileage?: number;
  expectedVersion?: number;
}

export interface ChangeVehicleLifecycleStatusDto {
  status: VehicleLifecycleStatus;
  reason?: string;
  expectedVersion?: number;
}

export interface ChangeVehicleAvailabilityStatusDto {
  status: VehicleAvailabilityStatus;
  reason?: string;
  expectedVersion?: number;
}

export interface RecordVehicleMileageDto {
  recordedMileage: number;
  source?: "RENTAL_CHECKOUT" | "RENTAL_RETURN" | "INSPECTION" | "MAINTENANCE" | "MANUAL_AUDIT" | "TELEMATICS";
  notes?: string;
}

export interface VehicleFilterQueryDto {
  lifecycleStatus?: VehicleLifecycleStatus;
  availabilityStatus?: VehicleAvailabilityStatus;
  category?: string;
  ownerId?: string;
  search?: string;
  isPublishedToWebsite?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// Vehicle Owner DTOs
export interface CreateVehicleOwnerDto {
  name: string;
  companyName?: string;
  ownerType?: VehicleOwnerType;
  email: string;
  phone: string;
  idOrPassportNumber?: string;
  taxPinNumber?: string;
  payoutBank?: string;
  payoutAccountNumber?: string;
  payoutMpesaNumber?: string;
  ownershipType?: OwnershipType;
  notes?: string;
}

export interface UpdateVehicleOwnerDto {
  name?: string;
  companyName?: string;
  ownerType?: VehicleOwnerType;
  email?: string;
  phone?: string;
  idOrPassportNumber?: string;
  taxPinNumber?: string;
  payoutBank?: string;
  payoutAccountNumber?: string;
  payoutMpesaNumber?: string;
  ownershipType?: OwnershipType;
  status?: OwnerStatus;
  notes?: string;
  expectedVersion?: number;
}

export interface AssignVehicleOwnershipDto {
  vehicleId: string;
  ownerId: string;
  ownershipType: OwnershipType;
  startDate?: string;
  revenueSharePercent: number;
  fixedMonthlyPayout?: number;
  allowableExpenseDeductions?: boolean;
  termsSnapshot?: string;
  notes?: string;
}

export interface TransferVehicleOwnershipDto {
  newOwnerId: string;
  ownershipType: OwnershipType;
  effectiveDate?: string;
  revenueSharePercent: number;
  fixedMonthlyPayout?: number;
  allowableExpenseDeductions?: boolean;
  termsSnapshot?: string;
  notes?: string;
}

export interface ChangeOwnershipAgreementDto {
  revenueSharePercent: number;
  fixedMonthlyPayout?: number;
  allowableExpenseDeductions?: boolean;
  effectiveDate?: string;
  notes?: string;
}

export interface VehicleOwnerFilterQueryDto {
  status?: OwnerStatus;
  ownershipType?: OwnershipType;
  search?: string;
  page?: number;
  limit?: number;
}

// ----------------------------------------------------------------------------
// 5. CUSTOMERS, CORPORATE ACCOUNTS, DRIVERS & AGENTS (DOM-001 §11-12, DOM-003 §11-13)
// ----------------------------------------------------------------------------
export type CustomerType = "INDIVIDUAL" | "CORPORATE_AFFILIATED" | "VIP";
export type CustomerStatus = "ACTIVE" | "RESTRICTED" | "BLOCKED" | "INACTIVE";
export type VerificationStatus = "UNVERIFIED" | "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED";
export type CustomerVerificationStatus = VerificationStatus;

export interface Customer {
  id: string;
  tenantId: string;
  customerNumber: string; // e.g. CUS-2026-000123
  customerType: CustomerType;
  fullName: string;
  email: string;
  phone: string;
  idOrPassportNumber: string;
  taxPinNumber?: string;
  licenseNumber: string;
  licenseExpiryDate: string;
  nationality?: string;
  address?: string;
  city?: string;
  country?: string;
  status: CustomerStatus;
  verificationStatus: VerificationStatus;
  corporateAccountId?: string;
  totalRentalsCount: number;
  rating?: number;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  tags?: string[];
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt?: string;
}

export type CorporateAccountStatus = "ACTIVE" | "SUSPENDED" | "INACTIVE";

export interface CorporateAccount {
  id: string;
  tenantId: string;
  accountNumber: string; // e.g. CORP-2026-000045
  companyName: string;
  registrationNumber: string;
  taxPinNumber?: string;
  contactPerson: string;
  email: string;
  phone: string;
  billingAddress?: string;
  creditLimit: number;
  paymentTermsDays: number;
  discountRatePercent: number;
  status: CorporateAccountStatus;
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt?: string;
}

export type DriverStatus = "ACTIVE" | "SUSPENDED" | "OFF_DUTY" | "ON_TRIP" | "BLACKLISTED";
export type DriverVerificationStatus = VerificationStatus;

export interface Driver {
  id: string;
  tenantId: string;
  driverNumber: string; // e.g. DRV-2026-000088
  fullName: string;
  email?: string;
  phone: string;
  nationalId?: string;
  licenseNumber: string;
  licenseClasses?: string[];
  licenseExpiryDate: string;
  badgeNumber?: string; // PSV Commercial Badge
  medicalExpiryDate?: string;
  verificationStatus: DriverVerificationStatus;
  status: DriverStatus;
  rating: number;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt?: string;
}

export interface AuthorizedCorporateDriver {
  id: string;
  tenantId: string;
  corporateAccountId: string;
  driverId?: string;
  customerId?: string;
  roleTitle?: string;
  isPrimaryContact?: boolean;
  status: "ACTIVE" | "REVOKED";
  createdAt: string;
  updatedAt?: string;
}

export interface CustomerDriverRelationship {
  id: string;
  tenantId: string;
  customerId: string;
  driverId: string;
  relationshipType: "PERSONAL_CHAUFFEUR" | "FAMILY_MEMBER" | "CORPORATE_DESIGNATED" | "OTHER";
  isDefault: boolean;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
}

export type AgentStatus = "ACTIVE" | "SUSPENDED" | "INACTIVE";
export type CommissionType = "PERCENTAGE" | "FIXED_PER_BOOKING" | "TIERED" | "FIXED";

export interface Agent {
  id: string;
  tenantId: string;
  agentNumber: string; // e.g. AGT-2026-000012
  name: string;
  agencyName?: string;
  email: string;
  phone: string;
  commissionType: CommissionType;
  commissionRatePercent: number; // e.g. 10.00
  fixedCommissionAmount?: number;
  payoutBank?: string;
  payoutAccountNumber?: string;
  payoutMpesaNumber?: string;
  status: AgentStatus;
  notes?: string;
  totalReferralsCount: number;
  totalCommissionEarned: number;
  version: number;
  createdAt: string;
  updatedAt?: string;
}

export type PartyDocumentType =
  | "NATIONAL_ID"
  | "PASSPORT"
  | "DRIVING_LICENSE_FRONT"
  | "DRIVING_LICENSE_BACK"
  | "UTILITY_BILL"
  | "CORPORATE_AUTH_LETTER"
  | "MEDICAL_CERTIFICATE"
  | "POLICE_CLEARANCE"
  | "OTHER";

export interface PartyDocumentItem {
  id: string;
  tenantId: string;
  partyType?: "CUSTOMER" | "DRIVER" | "CORPORATE_ACCOUNT" | "AGENT" | string;
  partyId?: string;
  customerId?: string;
  driverId?: string;
  corporateAccountId?: string;
  agentId?: string;
  documentType: PartyDocumentType;
  documentNumber?: string;
  fileId?: string;
  fileName?: string;
  fileUrl?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  issuedAt?: string;
  expiresAt?: string;
  status: "VALID" | "EXPIRING_SOON" | "EXPIRED" | "REJECTED";
  verificationStatus: "PENDING" | "VERIFIED" | "REJECTED";
  verifiedBy?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartyStatusHistory {
  id: string;
  tenantId: string;
  partyType: "CUSTOMER" | "DRIVER" | "CORPORATE_ACCOUNT" | "AGENT";
  partyId: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
  actorId?: string;
  actorName?: string;
  timestamp: string;
}

// ----------------------------------------------------------------------------
// Customer, Driver, Corporate & Agent DTOs
// ----------------------------------------------------------------------------
export interface CreateCustomerDto {
  customerType?: CustomerType;
  fullName: string;
  email: string;
  phone: string;
  idOrPassportNumber: string;
  taxPinNumber?: string;
  licenseNumber: string;
  licenseExpiryDate: string;
  nationality?: string;
  address?: string;
  city?: string;
  country?: string;
  corporateAccountId?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  tags?: string[];
  notes?: string;
}

export interface UpdateCustomerDto {
  customerType?: CustomerType;
  fullName?: string;
  email?: string;
  phone?: string;
  idOrPassportNumber?: string;
  taxPinNumber?: string;
  licenseNumber?: string;
  licenseExpiryDate?: string;
  nationality?: string;
  address?: string;
  city?: string;
  country?: string;
  corporateAccountId?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  tags?: string[];
  notes?: string;
  expectedVersion?: number;
}

export interface ChangeCustomerStatusDto {
  status: CustomerStatus;
  reason: string;
  expectedVersion?: number;
}

export interface VerifyCustomerDto {
  verificationStatus: VerificationStatus;
  notes?: string;
  expectedVersion?: number;
}

export interface CustomerFilterQueryDto {
  status?: CustomerStatus;
  verificationStatus?: VerificationStatus;
  customerType?: CustomerType;
  corporateAccountId?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface CreateCorporateAccountDto {
  companyName: string;
  registrationNumber: string;
  taxPinNumber?: string;
  contactPerson: string;
  email: string;
  phone: string;
  billingAddress?: string;
  creditLimit?: number;
  paymentTermsDays?: number;
  discountRatePercent?: number;
  notes?: string;
}

export interface UpdateCorporateAccountDto {
  companyName?: string;
  registrationNumber?: string;
  taxPinNumber?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  creditLimit?: number;
  paymentTermsDays?: number;
  discountRatePercent?: number;
  status?: CorporateAccountStatus;
  notes?: string;
  expectedVersion?: number;
}

export interface CorporateAccountFilterQueryDto {
  status?: CorporateAccountStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateDriverDto {
  fullName: string;
  email?: string;
  phone: string;
  nationalId?: string;
  licenseNumber: string;
  licenseClasses?: string[];
  licenseExpiryDate: string;
  badgeNumber?: string;
  medicalExpiryDate?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
}

export interface UpdateDriverDto {
  fullName?: string;
  email?: string;
  phone?: string;
  nationalId?: string;
  licenseNumber?: string;
  licenseClasses?: string[];
  licenseExpiryDate?: string;
  badgeNumber?: string;
  medicalExpiryDate?: string;
  status?: DriverStatus;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  notes?: string;
  expectedVersion?: number;
}

export interface ChangeDriverStatusDto {
  status: DriverStatus;
  reason: string;
  expectedVersion?: number;
}

export interface VerifyDriverDto {
  verificationStatus: DriverVerificationStatus;
  notes?: string;
  expectedVersion?: number;
}

export interface DriverFilterQueryDto {
  status?: DriverStatus;
  verificationStatus?: DriverVerificationStatus;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface CreateAgentDto {
  name: string;
  agencyName?: string;
  email: string;
  phone: string;
  commissionType?: CommissionType;
  commissionRatePercent?: number;
  fixedCommissionAmount?: number;
  payoutBank?: string;
  payoutAccountNumber?: string;
  payoutMpesaNumber?: string;
  notes?: string;
}

export interface UpdateAgentDto {
  name?: string;
  agencyName?: string;
  email?: string;
  phone?: string;
  commissionType?: CommissionType;
  commissionRatePercent?: number;
  fixedCommissionAmount?: number;
  payoutBank?: string;
  payoutAccountNumber?: string;
  payoutMpesaNumber?: string;
  status?: AgentStatus;
  notes?: string;
  expectedVersion?: number;
}

export interface AgentFilterQueryDto {
  status?: AgentStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface UploadPartyDocumentDto {
  customerId?: string;
  driverId?: string;
  corporateAccountId?: string;
  agentId?: string;
  documentType: PartyDocumentType;
  documentNumber?: string;
  fileName: string;
  fileUrl: string;
  issuedAt?: string;
  expiresAt?: string;
}

export interface VerifyPartyDocumentDto {
  verificationStatus: "VERIFIED" | "REJECTED";
  rejectionReason?: string;
}

// ----------------------------------------------------------------------------
// 6. BOOKING ENGINE (DOM-003 §14-16, DEV-006, DEV-007, BRS-001)
// ----------------------------------------------------------------------------
export type BookingStatus =
  | "DRAFT"
  | "PENDING"
  | "PENDING_CONFIRMATION"
  | "QUOTED"
  | "AWAITING_PAYMENT"
  | "CONFIRMED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED"
  | "NO_SHOW";

export type BookingSource =
  | "TENANT_ADMIN"
  | "OPERATIONS_DESK"
  | "PUBLIC_WEBSITE"
  | "PUBLIC_PORTAL"
  | "AGENT_REFERRAL"
  | "CORPORATE"
  | "CORPORATE_PORTAL"
  | "PHONE"
  | "WALK_IN"
  | "API"
  | "BACKOFFICE"
  | "WEB";

export type BookingPaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "FULLY_PAID";
export type BookingDepositStatus =
  | "NOT_REQUIRED"
  | "REQUESTED"
  | "HELD"
  | "RELEASE_PENDING"
  | "RELEASED"
  | "DEDUCTED";

export interface BookingStatusHistory {
  id?: string;
  bookingId?: string;
  tenantId?: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actorType?: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT";
  actorId: string;
  actorName?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
  // Legacy compatibility
  timestamp?: string;
}

export type BookingStatusTransition = BookingStatusHistory;

export interface BookingVehicleAssignment {
  id: string;
  bookingId: string;
  tenantId: string;
  vehicleId: string;
  vehicleCategoryId?: string | null;
  isCurrent: boolean;
  assignedAt: string;
  releasedAt?: string | null;
  assignedBy: string;
  reason?: string | null;
}

export interface BookingPricingSnapshotRecord {
  id: string;
  bookingId: string;
  tenantId: string;
  version: number;
  isCurrent: boolean;
  snapshot: PricingSnapshot;
  schemaVersion: number;
  createdAt: string;
  createdBy: string;
}

export interface VehicleSubstitution {
  id: string;
  bookingId: string;
  originalVehicleId?: string;
  replacementVehicleId: string;
  reason: string;
  actorId: string;
  timestamp: string;
}

export interface BookingLegacyPricingSnapshot {
  currency: string;
  dailyRate: number;
  totalDays: number;
  baseRental: number;
  insuranceAmount: number;
  insuranceCdw?: number;
  extrasAmount: number;
  securityDeposit: number;
  fuelDeposit: number;
  taxRatePercent: number;
  taxAmount: number;
  vatAmount?: number;
  discountPercent: number;
  discountAmount: number;
  grossTotal: number;
  netPayable: number;
  frozenAt: string;

  // Modern schema aliases
  billableDays?: number;
  baseRentalAmount?: number;
  grossRentalTotal?: number;
  baseDailyRate?: number;
  netRentalSubtotal?: number;
  tax?: {
    taxRatePercent: number;
    isTaxInclusive: boolean;
    taxableAmount: number;
    taxAmount: number;
  };
}

export interface Booking {
  id: string;
  tenantId: string;
  bookingNumber: string;
  status: BookingStatus;
  customerId: string;
  corporateAccountId?: string | null;
  primaryDriverId?: string | null;
  additionalDriverIds?: string[];
  agentId?: string | null;
  agentCommissionRatePercent?: number | null;
  requestedVehicleId?: string | null;
  requestedVehicleCategoryId?: string | null;
  assignedVehicleId?: string | null;
  pickupAt?: string;
  returnAt?: string;
  pickupLocationId?: string | null;
  pickupLocationName?: string;
  returnLocationId?: string | null;
  returnLocationName?: string;
  source?: BookingSource;
  pricingSnapshot?: PricingSnapshot;
  pricingSnapshotVersion?: number;
  currency?: string;
  grossTotal?: number;
  netRentalSubtotal?: number;
  depositRequired?: number;
  taxAmount?: number;
  amountPaid?: number;
  paymentStatus?: BookingPaymentStatus;
  depositStatus?: BookingDepositStatus;
  specialInstructions?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  allocationId?: string | null;
  holdToken?: string | null;
  activeRentalId?: string | null;
  cancellationReason?: string | null;
  rejectionReason?: string | null;
  expiresAt?: string | null;
  confirmedAt?: string | null;
  cancelledAt?: string | null;
  completedAt?: string | null;
  activatedAt?: string | null;
  noShowAt?: string | null;
  version?: number;
  createdAt: string;
  updatedAt: string;

  // Relations & Sub-records
  statusHistory: BookingStatusHistory[];
  vehicleAssignments?: BookingVehicleAssignment[];
  pricingSnapshots?: BookingPricingSnapshotRecord[];
  substitutions?: VehicleSubstitution[];

  // Legacy field compatibility
  vehicleId?: string;
  requestedCategoryId?: VehicleCategory;
  driverId?: string;
  startDate?: string;
  endDate?: string;
  pickupLocation?: string;
  returnLocation?: string;
  pricing?: PricingSnapshot | BookingLegacyPricingSnapshot;
  notes?: string;
}

export interface CreateBookingDto {
  customerId: string;
  corporateAccountId?: string | null;
  primaryDriverId?: string | null;
  additionalDriverIds?: string[];
  agentId?: string | null;
  requestedVehicleId?: string | null;
  requestedVehicleCategoryId?: string | null;
  assignedVehicleId?: string | null;
  pickupAt: string;
  returnAt: string;
  pickupLocationName?: string;
  pickupLocationId?: string | null;
  returnLocationName?: string;
  returnLocationId?: string | null;
  source?: BookingSource;
  ratePlanId?: string | null;
  promoCode?: string | null;
  requestedFeeCodes?: string[];
  customDailyRate?: number | null;
  includeCdw?: boolean;
  specialInstructions?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  autoQuote?: boolean;
  holdToken?: string | null;
  idempotencyKey?: string | null;
  // Legacy aliases
  vehicleId?: string;
  driverId?: string;
  startDate?: string;
  endDate?: string;
  pickupLocation?: string;
  returnLocation?: string;
  notes?: string;
  status?: BookingStatus;
  pricing?: PricingSnapshot | BookingLegacyPricingSnapshot;
  amountPaid?: number;
  depositStatus?: BookingDepositStatus;
}

export interface UpdateDraftBookingDto {
  customerId?: string;
  corporateAccountId?: string | null;
  primaryDriverId?: string | null;
  additionalDriverIds?: string[];
  agentId?: string | null;
  requestedVehicleId?: string | null;
  requestedVehicleCategoryId?: string | null;
  assignedVehicleId?: string | null;
  pickupAt?: string;
  returnAt?: string;
  pickupLocationName?: string;
  pickupLocationId?: string | null;
  returnLocationName?: string;
  returnLocationId?: string | null;
  source?: BookingSource;
  promoCode?: string | null;
  requestedFeeCodes?: string[];
  specialInstructions?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
}

export interface CalculateBookingQuoteDto {
  pickupAt: string;
  returnAt: string;
  vehicleId?: string | null;
  vehicleCategoryId?: string | null;
  customerId?: string | null;
  corporateAccountId?: string | null;
  agentId?: string | null;
  ratePlanId?: string | null;
  promoCode?: string | null;
  requestedFeeCodes?: string[];
  currency?: string;
}

export interface QuoteBookingDto {
  ratePlanId?: string | null;
  promoCode?: string | null;
  requestedFeeCodes?: string[];
  overrideDailyRate?: number | null;
  reason?: string;
}

export interface ConfirmBookingDto {
  assignedVehicleId?: string | null;
  holdToken?: string | null;
  paymentReference?: string | null;
  depositReference?: string | null;
  reason?: string;
  expectedVersion?: number;
}

export interface CancelBookingDto {
  reason: string;
  chargeCancellationFee?: boolean;
  cancellationFeeAmount?: number;
  expectedVersion?: number;
}

export interface RejectBookingDto {
  reason: string;
  expectedVersion?: number;
}

export interface ExpireBookingDto {
  reason?: string;
  expectedVersion?: number;
}

export interface NoShowBookingDto {
  reason?: string;
  penaltyFeeAmount?: number;
  expectedVersion?: number;
}

export interface SubstituteBookingVehicleDto {
  replacementVehicleId: string;
  reason: string;
  preservePricing?: boolean;
  expectedVersion?: number;
}

export interface AmendBookingDatesDto {
  pickupAt: string;
  returnAt: string;
  recalculatePricing?: boolean;
  reason: string;
  expectedVersion?: number;
}

export interface SimulateBookingPaymentDto {
  amount: number;
  paymentType: "RENTAL_CHARGE" | "SECURITY_DEPOSIT";
  paymentMethod: "MPESA" | "CARD" | "BANK_TRANSFER" | "CASH";
  transactionReference: string;
}

export interface BookingListQueryDto {
  status?: BookingStatus | BookingStatus[];
  customerId?: string;
  corporateAccountId?: string;
  vehicleId?: string;
  driverId?: string;
  agentId?: string;
  source?: BookingSource;
  pickupFrom?: string;
  pickupTo?: string;
  returnFrom?: string;
  returnTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: "createdAt" | "pickupAt" | "returnAt" | "bookingNumber" | "grossTotal";
  sortOrder?: "asc" | "desc";
}

export interface BookingReadinessForHandoverDto {
  isReady: boolean;
  blockers: string[];
  warnings: string[];
  booking: Booking;
  customerEligible: boolean;
  driverEligible: boolean;
  vehicleOperable: boolean;
  depositSecured: boolean;
  allocationActive: boolean;
}

// ----------------------------------------------------------------------------
// 7. RENTAL OPERATIONS (DOM-003 §18-20)
// ----------------------------------------------------------------------------
export type RentalState =
  | "SCHEDULED_HANDOVER"
  | "ACTIVE_ON_ROAD"
  | "RETURN_SCHEDULED"
  | "VEHICLE_RECEIVED"
  | "RETURN_INSPECTION_PENDING"
  | "INSPECTION"
  | "DAMAGE_ASSESSMENT"
  | "FINAL_CALCULATION"
  | "FINAL_SETTLEMENT_PENDING"
  | "DEPOSIT_PROCESSING"
  | "COMPLETED"
  | "RETURN_COMPLETED"
  | "OVERDUE"
  | "TERMINATED_EARLY";

export type RentalExtensionStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface RentalExtension {
  id: string;
  tenantId?: string;
  rentalId: string;
  extensionNumber?: string;
  previousEndDate: string;
  newEndDate: string;
  additionalDays: number;
  dailyRate?: number;
  additionalCost: number;
  additionalTax?: number;
  grossAdditionalTotal?: number;
  status?: RentalExtensionStatus;
  reason?: string;
  requestedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
  allocationExtended?: boolean;
  notes?: string;
  timestamp: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface RentalIncident {
  id: string;
  rentalId: string;
  type: "ACCIDENT" | "MECHANICAL_BREAKDOWN" | "TRAFFIC_FINE" | "THEFT" | "OTHER";
  description: string;
  location: string;
  reportedAt: string;
  policeReportNumber?: string;
  estimatedCost: number;
  resolved: boolean;
}

export interface Rental {
  id: string;
  tenantId: string;
  rentalNumber: string;
  bookingId: string;
  vehicleId: string;
  customerId: string;
  driverId?: string;
  state: RentalState;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart?: string;
  actualEnd?: string;
  checkoutOdometer: number;
  checkoutFuelLevel: number;
  returnOdometer?: number;
  returnFuelLevel?: number;
  handoverInspectionId?: string;
  returnInspectionId?: string;
  contractId?: string;
  extensions: RentalExtension[];
  incidents: RentalIncident[];
  finalCalculationId?: string;
  finalExcessKmCharge: number;
  finalFuelDeficitCharge: number;
  finalDamageCharge: number;
  finalLateReturnFee: number;
  depositRefundedAmount: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------------------------------
// 8. INSPECTIONS & DAMAGES (DOM-003 §21-22)
// ----------------------------------------------------------------------------
export type DamageZone =
  | "front_bumper"
  | "rear_bumper"
  | "hood"
  | "roof"
  | "windshield"
  | "rear_window"
  | "driver_front_door"
  | "driver_rear_door"
  | "passenger_front_door"
  | "passenger_rear_door"
  | "driver_side_mirror"
  | "passenger_side_mirror"
  | "wheels_tires"
  | "interior_seats"
  | "dashboard_screens";

export type DamageType =
  | "scratch"
  | "dent"
  | "crack"
  | "chip"
  | "stain"
  | "tear"
  | "missing_item"
  | "SCRATCH"
  | "DENT"
  | "CRACK"
  | "BROKEN"
  | "MISSING"
  | "STAIN"
  | "MECHANICAL"
  | "TIRE"
  | "GLASS"
  | "INTERIOR"
  | "OTHER";

export type DamageSeverity =
  | "minor"
  | "moderate"
  | "severe"
  | "MINOR"
  | "MODERATE"
  | "MAJOR"
  | "CRITICAL"
  | "SEVERE";

export interface DamageReport {
  id: string;
  zone: DamageZone;
  type: DamageType;
  severity: DamageSeverity;
  description: string;
  estimatedCost: number;
  photoUrl?: string;
  isPreExisting: boolean;
  responsibleParty?: "CUSTOMER" | "OPERATOR" | "THIRD_PARTY" | "UNASSIGNED";
}

export interface InspectionChecklist {
  headlights: boolean;
  taillights: boolean;
  indicators: boolean;
  horn: boolean;
  airConditioning: boolean;
  wipers: boolean;
  spareWheel: boolean;
  jackAndTools: boolean;
  firstAidKit: boolean;
  fireExtinguisher: boolean;
  cleanlinessInterior: "Clean" | "Moderate" | "Dirty";
  cleanlinessExterior: "Clean" | "Moderate" | "Dirty";
}

export interface VehicleInspection {
  id: string;
  tenantId: string;
  rentalId?: string;
  bookingId?: string;
  vehicleId: string;
  type: "HANDOVER" | "RETURN" | "ROUTINE_AUDIT";
  inspectorName: string;
  customerName: string;
  odometer: number;
  fuelLevel: number;
  checklist: InspectionChecklist;
  damages: DamageReport[];
  photos: string[];
  customerSignature?: string;
  inspectorSignature?: string;
  fuelChargeDeduction: number;
  damageChargeDeduction: number;
  excessMileageDeduction: number;
  finalRefundAmount: number;
  status: "DRAFT" | "COMPLETED";
  completedAt?: string;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// 9. LEGACY MAINTENANCE RECORD (Sprint 17 replaces with MaintenanceWorkOrder)
// ----------------------------------------------------------------------------
export type LegacyMaintenanceType =
  | "OIL_CHANGE"
  | "BRAKE_SERVICE"
  | "TIRE_ROTATION"
  | "SCHEDULED_SERVICE"
  | "INSPECTION_REPAIR"
  | "ENGINE_DIAGNOSTICS"
  | "EMERGENCY_REPAIR";

export interface MaintenanceRecord {
  id: string;
  tenantId: string;
  vehicleId: string;
  vendorId?: string;
  workshop: string;
  serviceType: MaintenanceType | LegacyMaintenanceType;
  description: string;
  scheduledDate: string;
  completedDate?: string;
  cost: number;
  currency: string;
  status: MaintenanceStatus;
  odometerAtService: number;
  replacedParts?: string[];
  invoiceNumber?: string;
  blocksAvailability: boolean;
  createdAt: string;
}

export type ComplianceDocumentType =
  | "LOGBOOK"
  | "COMMERCIAL_INSURANCE"
  | "INSPECTION_CERTIFICATE"
  | "PSV_ROAD_LICENSE"
  | "SPEED_GOVERNOR_CERT"
  | "DRIVER_DRIVING_LICENSE"
  | "DRIVER_MEDICAL_FITNESS";

export type ComplianceExpiryState = "VALID" | "EXPIRING_SOON" | "URGENT" | "EXPIRED";

export interface ComplianceDocument {
  id: string;
  tenantId: string;
  subjectType: "VEHICLE" | "DRIVER";
  subjectId: string;
  documentType: ComplianceDocumentType;
  documentNumber: string;
  issueDate: string;
  expiryDate: string;
  expiryState: ComplianceExpiryState;
  isMandatory: boolean;
  fileId?: string;
  isBlocked: boolean;
  overrideReason?: string;
  overriddenBy?: string;
  overriddenAt?: string;
}

// ----------------------------------------------------------------------------
// 10. FINANCE & GENERAL LEDGER (DOM-003 §28-34)
// ----------------------------------------------------------------------------
export type InvoiceStatus = "DRAFT" | "ISSUED" | "PAID" | "PARTIALLY_PAID" | "VOID" | "CANCELLED";

export interface TenantInvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxAmount: number;
}

export interface TenantInvoice {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  customerId: string;
  bookingId?: string;
  rentalId?: string;
  items: TenantInvoiceItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  currency: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  paidAt?: string;
  createdAt: string;
}

export type PaymentMethod = "MPESA" | "CARD" | "BANK_TRANSFER" | "CASH";

export interface TenantPayment {
  id: string;
  tenantId: string;
  paymentNumber: string;
  invoiceId?: string;
  bookingId?: string;
  customerId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  providerTransactionId: string;
  status: "SUCCEEDED" | "FAILED" | "PENDING";
  recordedAt: string;
  postedToLedger: boolean;
}

export interface TenantExpense {
  id: string;
  tenantId: string;
  category: "MAINTENANCE" | "FUEL" | "INSURANCE" | "CLEANING" | "SALARIES" | "OFFICE" | "TAXES";
  description: string;
  amount: number;
  currency: string;
  vehicleId?: string;
  vendorName?: string;
  receiptNumber?: string;
  date: string;
  createdAt: string;
}

export interface PrototypeLedgerAccount {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  balance: number;
  currency: string;
}

export interface PrototypeLedgerEntry {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  description: string;
}

export interface PrototypeLedgerTransaction {
  id: string;
  tenantId: string;
  reference: string;
  description: string;
  entries: PrototypeLedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  postedAt: string;
}

// ----------------------------------------------------------------------------
// 11. TRANSACTIONAL OUTBOX (DEV-010, BRS-002)
// ----------------------------------------------------------------------------
export interface OutboxEvent {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  tenantId: string;
  source: string;
  correlationId: string;
  aggregate: {
    type: string;
    id: string;
  };
  data: Record<string, any>;
  status: "PENDING" | "DISPATCHED" | "PROCESSED" | "FAILED";
  attempts: number;
  lastAttemptAt?: string;
}

// ----------------------------------------------------------------------------
// 12. AUDIT LOG (SEC-005, DOM-003 §44)
// ----------------------------------------------------------------------------
export interface AuditRecord {
  id: string;
  tenantId: string;
  actorId: string;
  actorEmail: string;
  actorType: "USER" | "PLATFORM_STAFF" | "SYSTEM_WORKER";
  action: string;
  resourceType: string;
  resourceId: string;
  correlationId: string;
  details: Record<string, any>;
  timestamp: string;
}

// ----------------------------------------------------------------------------
// 13. TENANT PUBLIC WEBSITE (DEV-008 §34-38)
// ----------------------------------------------------------------------------
export interface WebsiteTheme {
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  heroHeadline: string;
  heroSubheadline: string;
  heroImageUrl: string;
  showTestimonials: boolean;
  showFleetGrid: boolean;
  showContactForm: boolean;
}

export interface WebsitePage {
  id: string;
  title: string;
  slug: string;
  content: string;
  isPublished: boolean;
}

export interface TenantDomain {
  id: string;
  tenantId: string;
  hostname: string;
  type: "PLATFORM_SUBDOMAIN" | "CUSTOM_DOMAIN";
  verificationToken?: string;
  isVerified: boolean;
  tlsStatus: "PENDING" | "ACTIVE" | "FAILED";
  isActive: boolean;
}

export interface TenantWebsite {
  id: string;
  tenantId: string;
  isPublished: boolean;
  theme: WebsiteTheme;
  pages: WebsitePage[];
  subdomain: string;
  customDomain?: string;
}

// ----------------------------------------------------------------------------
// 14. UI NAVIGATION TABS
// ----------------------------------------------------------------------------
export type ActiveTab =
  | "dashboard"
  | "fleet"
  | "owners"
  | "bookings"
  | "rentals"
  | "inspections"
  | "maintenance"
  | "compliance"
  | "customers"
  | "finance"
  | "settlements"
  | "website"
  | "control-plane"
  | "settings";

// ----------------------------------------------------------------------------
// 15. ALIASES & COMPATIBILITY HELPERS
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

// ----------------------------------------------------------------------------
// 16. PRICING & RATE ENGINE DOMAIN TYPES (Sprint 11: DEV-006, DEV-007, BRS-001)
// ----------------------------------------------------------------------------

export type RatePlanStatus = "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
export type MileageAllowanceModel = "UNLIMITED" | "DAILY_CAPPED" | "FIXED_TOTAL" | "INCLUDED_DAILY" | "DAILY_INCLUDED" | "INCLUDED_TOTAL";
export type DepositModel = "FIXED" | "PERCENTAGE" | "CATEGORY_BASED";
export type PricingFeeType =
  | "MANDATORY"
  | "OPTIONAL"
  | "LOCATION_BASED"
  | "DRIVER_BASED"
  | "EQUIPMENT"
  | "DRIVER_SERVICE"
  | "INSURANCE_WAIVER";
export type PricingFeeCalculationType = "FLAT_PER_RENTAL" | "DAILY" | "PERCENTAGE_OF_BASE" | "PER_KM";
export type DiscountType = "PERCENTAGE" | "FIXED_AMOUNT";
export type PromoCodeStatus = "ACTIVE" | "EXPIRED" | "DISABLED" | "INACTIVE";

export interface RatePlan {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  status: RatePlanStatus;
  currency: string;
  priority: number;
  isDefault: boolean;
  effectiveFrom: string; // ISO8601
  effectiveTo?: string | null;
  taxInclusive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RatePlanRate {
  id: string;
  tenantId: string;
  ratePlanId: string;
  vehicleCategoryId?: string | null;
  vehicleId?: string | null;
  hourlyRate?: number | null;
  dailyRate: number;
  weeklyDailyRate?: number | null;
  monthlyDailyRate?: number | null;
  weekendDailyRate?: number | null;
  mileageAllowanceModel: MileageAllowanceModel;
  includedKmPerDay?: number | null;
  includedKmTotal?: number | null;
  excessKmRate?: number | null;
  depositAmount: number;
  depositModel: DepositModel;
  depositPercent?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeasonalRateRule {
  id: string;
  tenantId: string;
  ratePlanId?: string | null;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  multiplier: number; // e.g. 1.25 for peak season
  vehicleCategoryId?: string | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DurationTierRule {
  id: string;
  tenantId: string;
  ratePlanId?: string | null;
  minDays: number;
  maxDays: number;
  discountPercent?: number | null;
  customDailyRate?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PricingFeeRule {
  id: string;
  tenantId: string;
  ratePlanId?: string | null;
  code: string;
  name: string;
  feeType: PricingFeeType;
  calculationType: PricingFeeCalculationType;
  amount: number;
  isTaxable: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromoCode {
  id: string;
  tenantId: string;
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  applicableTo: "BASE_RENTAL" | "TOTAL_SUBTOTAL" | "ALL";
  minRentalDays?: number | null;
  minSubtotalAmount?: number | null;
  maxDiscountAmount?: number | null;
  validFrom: string;
  validTo?: string | null;
  usageLimit?: number | null;
  usageCount: number;
  applicableCategories?: string[] | null;
  isStackable: boolean;
  status: PromoCodeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RatePlanAssignment {
  id: string;
  tenantId: string;
  ratePlanId: string;
  targetType: "CATEGORY" | "VEHICLE" | "CORPORATE_ACCOUNT" | "CUSTOMER" | "AGENT";
  targetId: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface PricingRequest {
  tenantId?: string;
  ratePlanId?: string;
  vehicleId?: string;
  vehicleCategoryId?: string;
  pickupDateTime: string; // ISO8601
  returnDateTime: string; // ISO8601
  customerId?: string;
  corporateAccountId?: string;
  agentId?: string;
  driverServiceRequested?: boolean;
  hasChauffeur?: boolean;
  additionalDriversCount?: number;
  hasAdditionalDriver?: boolean;
  primaryDriverAge?: number;
  pickupLocationId?: string;
  returnLocationId?: string;
  deliveryRequested?: boolean;
  deliveryDistanceKm?: number;
  collectionRequested?: boolean;
  collectionDistanceKm?: number;
  selectedFeeCodes?: string[];
  promoCode?: string;
  manualDiscountPercent?: number;
  manualDiscountAmount?: number;
  currency?: string;
  evaluationTime?: string;
}

export interface DayRateItem {
  date: string;
  dayType: "WEEKDAY" | "WEEKEND" | "SEASONAL_PEAK" | "STANDARD";
  baseRate: number;
  seasonalMultiplier: number;
  effectiveRate: number;
  seasonName?: string;
  seasonRuleId?: string;
}

export interface ItemizedFeeItem {
  code: string;
  name: string;
  type: PricingFeeType;
  calculationType: PricingFeeCalculationType;
  unitAmount: number;
  units: number;
  amount: number;
  isTaxable: boolean;
}

export interface AppliedDiscountItem {
  code?: string;
  description: string;
  type: "PROMO_CODE" | "CORPORATE" | "DURATION_TIER" | "MANUAL";
  amount: number;
}

export interface PricingSnapshot {
  snapshotId: string;
  calculatedAt: string;
  ratePlanId: string;
  ratePlanCode: string;
  ratePlanName: string;
  ratePlanVersion: number;
  currency: string;
  pickupDateTime: string;
  returnDateTime: string;
  totalHours: number;
  billableDays: number;
  baseDailyRate: number;
  appliedAverageDailyRate: number;
  baseRentalAmount: number;
  dayBreakdown: DayRateItem[];
  driverCharges: {
    primaryDriverCharge: number;
    additionalDriversCharge: number;
    chauffeurCharge: number;
    youngDriverSurcharge: number;
    totalDriverCharges: number;
  };
  locationCharges: {
    deliveryCharge: number;
    collectionCharge: number;
    oneWayFee: number;
    totalLocationCharges: number;
  };
  fees: ItemizedFeeItem[];
  totalFees: number;
  discounts: AppliedDiscountItem[];
  totalDiscount: number;
  netRentalSubtotal: number;
  tax: {
    taxRatePercent: number;
    isTaxInclusive: boolean;
    taxableAmount: number;
    taxAmount: number;
  };
  grossRentalTotal: number;
  securityDeposit: {
    required: boolean;
    model: DepositModel;
    amount: number;
    isRefundable: boolean;
  };
  mileageAllowance: {
    model: MileageAllowanceModel;
    includedKm: number;
    excessKmRate: number;
  };
  appliedRules: string[];

  // Legacy backward-compatibility aliases
  totalDays?: number;
  days?: number;
  dailyRate?: number;
  baseRental?: number;
  netPayable?: number;
  grossTotal?: number;
  freeKmPerDay?: number;
  excessKmRate?: number;
  insuranceAmount?: number;
  insuranceCdw?: number;
  vatAmount?: number;
  taxAmount?: number;
  taxRatePercent?: number;
  extrasAmount?: number;
  fuelDeposit?: number;
  frozenAt?: string;
}

export interface PricingResult {
  currency: string;
  rentalDuration: {
    totalHours: number;
    billableDays: number;
    partialDayGraceApplied: boolean;
  };
  ratePlanSummary: {
    id: string;
    code: string;
    name: string;
    version: number;
    isCorporateNegotiated: boolean;
  };
  baseRate: {
    standardDailyRate: number;
    appliedAverageDailyRate: number;
    rateUnit: "DAILY" | "WEEKLY" | "MONTHLY" | "TIERED";
  };
  baseRentalAmount: number;
  dayBreakdown: DayRateItem[];
  driverCharges: {
    primaryDriverCharge: number;
    additionalDriversCharge: number;
    chauffeurCharge: number;
    youngDriverSurcharge: number;
    totalDriverCharges: number;
  };
  locationCharges: {
    deliveryCharge: number;
    collectionCharge: number;
    oneWayFee: number;
    totalLocationCharges: number;
  };
  itemizedFees: ItemizedFeeItem[];
  totalFees: number;
  appliedDiscounts: AppliedDiscountItem[];
  totalDiscount: number;
  netRentalSubtotal: number;
  taxCalculation: {
    taxRatePercent: number;
    isTaxInclusive: boolean;
    taxableAmount: number;
    taxAmount: number;
  };
  grossRentalTotal: number;
  securityDeposit: {
    required: boolean;
    model: DepositModel;
    amount: number;
    isRefundable: boolean;
  };
  totalDueAtBooking?: number;
  mileageAllowance: {
    model: MileageAllowanceModel;
    includedKm: number;
    excessKmRate: number;
  };
  appliedRules?: string[];
  pricingVersion?: number;
  appliedRuleTrace?: string[];
  calculatedAt?: string;
  pricingSnapshot: PricingSnapshot;
}

export interface CreateRatePlanDto {
  code: string;
  name: string;
  description?: string;
  currency?: string;
  priority?: number;
  isDefault?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  taxInclusive?: boolean;
}

export interface UpdateRatePlanDto {
  name?: string;
  description?: string;
  priority?: number;
  isDefault?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  taxInclusive?: boolean;
  expectedVersion?: number;
}

export interface SetRatePlanRatesDto {
  vehicleCategoryId?: string | null;
  vehicleId?: string | null;
  hourlyRate?: number;
  dailyRate: number;
  weeklyDailyRate?: number;
  monthlyDailyRate?: number;
  weekendDailyRate?: number;
  mileageAllowanceModel?: MileageAllowanceModel;
  includedKmPerDay?: number;
  includedKmTotal?: number;
  excessKmRate?: number;
  depositAmount: number;
  depositModel?: DepositModel;
  depositPercent?: number;
  includedKilometersPerDay?: number;
  extraKilometerRate?: number;
  extraHourRate?: number;
}

export interface CreateSeasonalRateDto {
  name: string;
  startDate: string;
  endDate: string;
  multiplier: number;
  vehicleCategoryId?: string | null;
  priority?: number;
  isActive?: boolean;
  description?: string;
}

export interface CreateDurationTierDto {
  minDays: number;
  maxDays: number;
  discountPercent?: number;
  customDailyRate?: number;
}

export interface CreatePricingFeeDto {
  code: string;
  name: string;
  feeType: PricingFeeType;
  calculationType: PricingFeeCalculationType;
  amount: number;
  isTaxable?: boolean;
  ratePlanId?: string | null;
}

export interface CreatePromoCodeDto {
  code: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  applicableTo?: "BASE_RENTAL" | "TOTAL_SUBTOTAL" | "ALL";
  minRentalDays?: number;
  minSubtotalAmount?: number;
  maxDiscountAmount?: number;
  validFrom: string;
  validTo: string;
  usageLimit?: number;
  applicableCategories?: string[];
  isStackable?: boolean;
}

export interface AssignRatePlanDto {
  targetType: "CATEGORY" | "VEHICLE" | "CORPORATE_ACCOUNT" | "CUSTOMER" | "AGENT";
  targetId: string;
  priority?: number;
}

// ============================================================================
// SPRINT 12: AVAILABILITY ENGINE & CONCURRENCY-SAFE VEHICLE ALLOCATION
// ============================================================================

export type AllocationType =
  | "BOOKING"
  | "RENTAL"
  | "MAINTENANCE"
  | "MANUAL_BLOCK"
  | "TEMPORARY_HOLD"
  | "EXCLUSIVE_RESERVATION"
  | "EXCLUSIVE_HOLD";

export type AllocationStatus =
  | "HELD"
  | "CONFIRMED"
  | "ACTIVE"
  | "RELEASED"
  | "EXPIRED"
  | "CANCELLED";

export type VehicleBlockType =
  | "MAINTENANCE"
  | "ACCIDENT"
  | "IMPOUND"
  | "COMPLIANCE"
  | "OPERATIONAL"
  | "PRIVATE_USE"
  | "CLEANING"
  | "ADMINISTRATIVE";

export type VehicleBlockStatus = "ACTIVE" | "RELEASED" | "SCHEDULED";

export type HoldStatus = "PENDING" | "CONVERTED" | "EXPIRED" | "RELEASED";

export interface VehicleAllocation {
  id: string;
  tenantId: string;
  vehicleId: string;
  allocationType: AllocationType;
  sourceType?: string | null; // e.g. "BOOKING", "RENTAL", "MAINTENANCE_TICKET", "MANUAL"
  sourceId?: string | null;   // e.g. booking UUID, maintenance order UUID
  status: AllocationStatus;
  startsAt: string; // ISO8601 UTC
  endsAt: string;   // ISO8601 UTC (half-open [startsAt, endsAt))
  bufferMinutes?: number;
  effectiveStartsAt?: string; // startsAt minus prep buffer if applicable
  effectiveEndsAt?: string;   // endsAt plus turnaround buffer if applicable
  holdExpiresAt?: string | null;
  holdToken?: string | null;
  reason?: string | null;
  notes?: string | null;
  actorUserId?: string | null;
  version: number;
  releasedAt?: string | null;
  releasedBy?: string | null;
  releaseReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleBlock {
  id: string;
  tenantId: string;
  vehicleId: string;
  blockType: VehicleBlockType;
  status: VehicleBlockStatus;
  startsAt: string;
  endsAt: string;
  reason: string;
  notes?: string | null;
  actorUserId?: string | null;
  releasedAt?: string | null;
  releasedBy?: string | null;
  releaseReason?: string | null;
  allocationId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AllocationHold {
  id: string;
  tenantId: string;
  vehicleId: string;
  allocationId: string;
  holdToken: string;
  status: HoldStatus;
  startsAt: string;
  endsAt: string;
  expiresAt: string;
  customerId?: string | null;
  bookingDraftId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityRequest {
  tenantId?: string;
  pickupAt: string; // ISO8601 UTC
  returnAt: string; // ISO8601 UTC
  vehicleId?: string;
  vehicleCategoryId?: string;
  branchId?: string;
  pickupLocationId?: string;
  returnLocationId?: string;
  excludeAllocationId?: string;
  turnaroundMinutes?: number;
  purpose?: string;
}

export interface AvailabilityCheckResult {
  available: boolean;
  vehicleId?: string;
  code?: string;
  message?: string;
  requestedInterval: {
    startsAt: string;
    endsAt: string;
    durationHours: number;
  };
  effectiveInterval?: {
    startsAt: string;
    endsAt: string;
  };
  conflictingAllocationId?: string;
  conflictingType?: AllocationType | null;
  nextAvailableAt?: string;
  alternativeVehicleIds?: string[];
}

export interface AvailabilitySearchRequestDto {
  pickupAt: string;
  returnAt: string;
  vehicleCategoryId?: string;
  branchId?: string;
  features?: string[];
  turnaroundMinutes?: number;
  limit?: number;
  offset?: number;
}

export interface AvailableCandidateVehicle {
  id: string;
  tenantId: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  vehicleCategoryId: string;
  categoryName?: string;
  branchId?: string;
  dailyRate?: number;
  operationalStatus: string;
  availabilityStatus: string;
  fuelType?: string;
  transmission?: string;
  features?: string[];
}

export interface AvailabilitySearchResultDto {
  vehicles: AvailableCandidateVehicle[];
  totalAvailable: number;
  requestedInterval: {
    startsAt: string;
    endsAt: string;
    durationHours: number;
  };
}

export interface CreateAllocationDto {
  vehicleId: string;
  allocationType: AllocationType;
  startsAt: string;
  endsAt: string;
  sourceType?: string;
  sourceId?: string;
  turnaroundMinutes?: number;
  reason?: string;
  notes?: string;
  holdExpiresAt?: string;
  holdToken?: string;
  status?: AllocationStatus;
}

export interface ReleaseAllocationDto {
  reason?: string;
}

export interface CreateHoldDto {
  vehicleId: string;
  startsAt: string;
  endsAt: string;
  ttlMinutes?: number; // default 15
  customerId?: string;
  bookingDraftId?: string;
  reason?: string;
}

export interface ConfirmHoldDto {
  holdToken: string;
  sourceType: string;
  sourceId: string;
  reason?: string;
}

export interface CreateVehicleBlockDto {
  vehicleId: string;
  blockType: VehicleBlockType;
  startsAt: string;
  endsAt: string;
  reason: string;
  notes?: string;
}

export interface ReleaseVehicleBlockDto {
  reason?: string;
}

export interface VehicleAvailabilityCalendarEntry {
  id: string;
  type: "ALLOCATION" | "BLOCK" | "HOLD";
  subType: string;
  status: string;
  startsAt: string;
  endsAt: string;
  isBlocking: boolean;
  sourceId?: string | null;
  summary: string;
}

export interface VehicleAvailabilityCalendarResponse {
  vehicleId: string;
  windowStartsAt: string;
  windowEndsAt: string;
  entries: VehicleAvailabilityCalendarEntry[];
  totalEntries: number;
}

// ============================================================================
// SPRINT 14: CONTRACTS, HANDOVER & RENTAL START AGGREGATES & DTOS (DOM-003 §17-20)
// ============================================================================

export type ContractStatus =
  | "DRAFT"
  | "GENERATED"
  | "SENT"
  | "SIGNED"
  | "ACTIVE"
  | "COMPLETED"
  | "ARCHIVED";

export interface ContractTermsSnapshot {
  templateId: string;
  templateVersion: string;
  vehicleRegistrationPlate: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleCategory: string;
  customerFullName: string;
  customerIdNumber?: string;
  customerPhone?: string;
  primaryDriverFullName: string;
  primaryDriverLicenseNumber?: string;
  pickupAt: string;
  returnAt: string;
  pickupLocation: string;
  returnLocation: string;
  baseDailyRate: number;
  billableDays: number;
  grossTotal: number;
  netRentalSubtotal: number;
  depositAmount: number;
  taxAmount: number;
  currency: string;
  freeKmPerDay?: number;
  excessKmRate?: number;
  lateReturnHourlyFee?: number;
  cdwCoverIncluded: boolean;
  specialTerms?: string[];
  governingLaw: string;
}

export interface ContractSignature {
  id: string;
  contractId: string;
  contractVersion: number;
  signerType: "CUSTOMER" | "PRIMARY_DRIVER" | "OPERATOR" | "CORPORATE_REP" | "GUARANTOR";
  signerId: string;
  signerName: string;
  signatureMethod: "ELECTRONIC_OTP" | "DRAWN_CANVAS" | "BIOMETRIC" | "MANUAL_UPLOAD";
  signatureReference: string;
  ipAddress?: string;
  userAgent?: string;
  signedAt: string;
  metadata?: Record<string, any>;
}

export interface ContractVersionRecord {
  id: string;
  contractId: string;
  tenantId: string;
  version: number;
  termsSnapshot: ContractTermsSnapshot;
  pricingSnapshot: PricingSnapshot;
  vehicleId: string;
  customerId: string;
  primaryDriverId: string;
  isCurrent: boolean;
  createdAt: string;
  createdBy?: string;
  changeReason?: string;
}

export interface ContractStatusHistory {
  id: string;
  contractId: string;
  tenantId: string;
  fromStatus: ContractStatus;
  toStatus: ContractStatus;
  actorType: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
  actorId?: string;
  actorName?: string;
  reason?: string;
  occurredAt: string;
}

export interface RentalContract {
  id: string;
  tenantId: string;
  contractNumber: string;
  bookingId: string;
  rentalId?: string | null;
  customerId: string;
  corporateAccountId?: string | null;
  primaryDriverId: string;
  vehicleId: string;
  status: ContractStatus;
  templateVersion: string;
  contractVersion: number;
  termsSnapshot: ContractTermsSnapshot;
  pricingSnapshot: PricingSnapshot;
  ownershipTermsSnapshot?: Record<string, any> | null;
  generatedAt?: string;
  sentAt?: string;
  signedAt?: string;
  activatedAt?: string;
  completedAt?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;

  signatures: ContractSignature[];
  versions?: ContractVersionRecord[];
  statusHistory?: ContractStatusHistory[];
}

export interface GenerateContractDto {
  bookingId: string;
  templateVersion?: string;
  specialTerms?: string[];
  idempotencyKey?: string;
}

export interface SignContractDto {
  signerType: "CUSTOMER" | "PRIMARY_DRIVER" | "OPERATOR" | "CORPORATE_REP" | "GUARANTOR";
  signerId: string;
  signerName: string;
  signatureMethod: "ELECTRONIC_OTP" | "DRAWN_CANVAS" | "BIOMETRIC" | "MANUAL_UPLOAD";
  signatureReference: string;
  ipAddress?: string;
  userAgent?: string;
  expectedVersion?: number;
}

export interface SendContractDto {
  deliveryMethod: "EMAIL" | "SMS" | "WHATSAPP" | "IN_PERSON";
  recipientEmail?: string;
  recipientPhone?: string;
}

export interface ContractListQueryDto {
  status?: ContractStatus;
  bookingId?: string;
  customerId?: string;
  vehicleId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export type HandoverStatus =
  | "SCHEDULED"
  | "CUSTOMER_ARRIVED"
  | "DOCUMENT_VERIFIED"
  | "PRE_RENTAL_INSPECTION"
  | "SIGNATURE"
  | "KEY_HANDOVER"
  | "HANDOVER_COMPLETED";

export interface HandoverStatusHistory {
  id: string;
  handoverId: string;
  tenantId: string;
  fromStatus: HandoverStatus;
  toStatus: HandoverStatus;
  actorType: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
  actorId?: string;
  actorName?: string;
  reason?: string;
  occurredAt: string;
}

export interface VehicleHandover {
  id: string;
  tenantId: string;
  handoverNumber: string;
  bookingId: string;
  contractId: string;
  rentalId?: string | null;
  vehicleId: string;
  customerId: string;
  primaryDriverId: string;
  status: HandoverStatus;
  scheduledAt: string;
  customerArrivedAt?: string | null;
  documentsVerifiedAt?: string | null;
  inspectionCompletedAt?: string | null;
  inspectionId?: string | null;
  signatureCompletedAt?: string | null;
  keyHandedOverAt?: string | null;
  completedAt?: string | null;
  checkoutOdometer: number;
  checkoutFuelLevel: number;
  performedByMembershipId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;

  statusHistory?: HandoverStatusHistory[];
}

export interface ScheduleHandoverDto {
  bookingId: string;
  scheduledAt?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface RecordCustomerArrivalDto {
  arrivedAt?: string;
  notes?: string;
  expectedVersion?: number;
}

export interface VerifyHandoverDocumentsDto {
  driverLicenseVerified: boolean;
  idDocumentVerified: boolean;
  verifiedBy: string;
  notes?: string;
  expectedVersion?: number;
}

export interface CompleteInspectionCheckpointDto {
  inspectionId: string;
  odometer: number;
  fuelLevel: number;
  passed: boolean;
  notes?: string;
  expectedVersion?: number;
}

export interface ConfirmSignatureCheckpointDto {
  contractSigned: boolean;
  signatureReference?: string;
  notes?: string;
  expectedVersion?: number;
}

export interface HandoverKeysDto {
  checkoutOdometer: number;
  checkoutFuelLevel: number;
  handedOverTo: string;
  keyTagNumber?: string;
  notes?: string;
  expectedVersion?: number;
}

export interface CompleteHandoverDto {
  checkoutOdometer?: number;
  checkoutFuelLevel?: number;
  notes?: string;
  idempotencyKey?: string;
  expectedVersion?: number;
}

export interface HandoverListQueryDto {
  status?: HandoverStatus;
  bookingId?: string;
  vehicleId?: string;
  customerId?: string;
  scheduledDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface RentalStatusHistory {
  id: string;
  rentalId: string;
  tenantId: string;
  fromStatus: string;
  toStatus: string;
  actorType: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
  actorId?: string;
  actorName?: string;
  changedByUserId?: string;
  reason?: string;
  occurredAt: string;
}

export interface RentalStartSnapshot {
  id: string;
  rentalId: string;
  tenantId: string;
  actualVehicleId: string;
  startedAt: string;
  scheduledReturnAt: string;
  startOdometer: number;
  startFuelLevel: number;
  preRentalInspectionId?: string | null;
  pricingSnapshot: PricingSnapshot;
  depositRequirement: number;
  contractVersion: number;
  driverId: string;
  ownershipTermsSnapshot?: Record<string, any> | null;
  createdAt: string;
}

export interface RentalStartReadiness {
  isReady: boolean;
  blockers: string[];
  warnings: string[];
  bookingStatus: BookingStatus;
  contractStatus: ContractStatus;
  handoverStatus: HandoverStatus;
  documentsVerified: boolean;
  inspectionCompleted: boolean;
  contractSigned: boolean;
  vehicleOperational: boolean;
  allocationValid: boolean;
}

export interface CreateRentalFromBookingDto {
  bookingId: string;
  contractId: string;
  handoverId: string;
  startOdometer: number;
  startFuelLevel: number;
  notes?: string;
  idempotencyKey?: string;
}

export interface StartRentalDto {
  startOdometer: number;
  startFuelLevel: number;
  notes?: string;
  idempotencyKey?: string;
  expectedVersion?: number;
}

export interface RentalListQueryDto {
  status?: RentalState | string;
  bookingId?: string;
  customerId?: string;
  vehicleId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// SPRINT 15: INSPECTIONS, DAMAGE & EVIDENCE AGGREGATES & DTOS (DOM-003 §21-22)
// ============================================================================

export type InspectionType =
  | "PRE_RENTAL"
  | "RETURN"
  | "AD_HOC"
  | "MAINTENANCE"
  | "COMPLIANCE";

export type InspectionStatus =
  | "DRAFT"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "VOIDED";

export type BodyZone =
  | "FRONT_BUMPER"
  | "REAR_BUMPER"
  | "HOOD"
  | "ROOF"
  | "LEFT_FRONT_DOOR"
  | "LEFT_REAR_DOOR"
  | "RIGHT_FRONT_DOOR"
  | "RIGHT_REAR_DOOR"
  | "LEFT_FRONT_FENDER"
  | "RIGHT_FRONT_FENDER"
  | "LEFT_REAR_QUARTER"
  | "RIGHT_REAR_QUARTER"
  | "WINDSHIELD"
  | "REAR_GLASS"
  | "LEFT_MIRROR"
  | "RIGHT_MIRROR"
  | "WHEELS_TIRES"
  | "INTERIOR"
  | "UNDERBODY";

export type DamageAttribution = "PRE_EXISTING" | "RENTAL_PERIOD_OBSERVED" | "UNKNOWN";

export type DamageCaseStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "CONFIRMED"
  | "DISPUTED"
  | "RESOLVED"
  | "CLOSED";

export type EvidenceType = "PHOTO" | "VIDEO" | "DOCUMENT" | "SIGNATURE" | "AUDIO";

export type InspectionTemplateItemType =
  | "BOOLEAN"
  | "TEXT"
  | "NUMBER"
  | "SELECT"
  | "MULTI_SELECT"
  | "CONDITION"
  | "PHOTO_REQUIRED"
  | "ODOMETER"
  | "FUEL_LEVEL";

export interface InspectionTemplateItem {
  id: string;
  code: string;
  label: string;
  description?: string;
  itemType: InspectionTemplateItemType;
  required: boolean;
  requiresEvidence: boolean;
  options?: string[];
  defaultCondition?: string;
  order: number;
}

export interface InspectionTemplateSection {
  id: string;
  title: string;
  description?: string;
  order: number;
  items: InspectionTemplateItem[];
}

export interface InspectionTemplate {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  category: "STANDARD" | "PREMIUM" | "COMMERCIAL" | "MOTORCYCLE" | "HEAVY";
  version: number;
  isDefault: boolean;
  isActive: boolean;
  sections: InspectionTemplateSection[];
  createdAt: string;
  updatedAt: string;
}

export interface InspectionResponse {
  id: string;
  inspectionId: string;
  templateItemId: string;
  itemCode: string;
  responseValue: any;
  condition?: "GOOD" | "FAIR" | "POOR" | "DAMAGED" | "N_A";
  notes?: string;
  evidenceIds?: string[];
  createdAt: string;
}

export interface EvidenceRecord {
  id: string;
  tenantId: string;
  inspectionId: string;
  damageObservationId?: string | null;
  fileId?: string;
  evidenceType: EvidenceType;
  url: string;
  storageReference?: string;
  checksumSha256?: string;
  mimeType?: string;
  fileSize?: number;
  capturedAt: string;
  capturedByMembershipId?: string;
  source: "MOBILE_APP" | "WEB_PORTAL" | "API" | "DEVICE_CAMERA";
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface DamageObservation {
  id: string;
  tenantId: string;
  inspectionId: string;
  damageCaseId?: string | null;
  bodyZone: BodyZone;
  damageType: DamageType;
  severity: DamageSeverity;
  description: string;
  preExisting: boolean;
  attribution: DamageAttribution;
  estimatedCost?: number;
  photoUrls: string[];
  evidenceIds: string[];
  observedAt: string;
  createdAt: string;
}

export interface DamageStatusHistory {
  id: string;
  damageCaseId: string;
  tenantId: string;
  fromStatus: DamageCaseStatus;
  toStatus: DamageCaseStatus;
  actorType: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
  actorId?: string;
  actorName?: string;
  reason?: string;
  occurredAt: string;
}

export interface DamageCase {
  id: string;
  tenantId: string;
  damageNumber: string;
  vehicleId: string;
  rentalId?: string | null;
  bookingId?: string | null;
  inspectionId: string;
  status: DamageCaseStatus;
  damageType: DamageType;
  severity: DamageSeverity;
  bodyZone: BodyZone;
  description: string;
  estimatedRepairCost?: number;
  actualRepairCost?: number;
  responsibleParty?: "CUSTOMER" | "OPERATOR" | "THIRD_PARTY" | "UNASSIGNED";
  firstObservedAt: string;
  preExisting: boolean;
  isRepaired: boolean;
  repairedAt?: string;
  insuranceClaimNumber?: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  version: number;

  statusHistory?: DamageStatusHistory[];
}

export interface InspectionAcknowledgement {
  id: string;
  inspectionId: string;
  inspectionVersion: number;
  signerType: "CUSTOMER" | "PRIMARY_DRIVER" | "INSPECTOR" | "WITNESS";
  signerId: string;
  signerName: string;
  signatureMethod: "ELECTRONIC_OTP" | "DRAWN_CANVAS" | "BIOMETRIC" | "MANUAL_UPLOAD";
  signatureReference: string;
  acknowledgedAt: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface InspectionStatusHistory {
  id: string;
  inspectionId: string;
  tenantId: string;
  fromStatus: InspectionStatus;
  toStatus: InspectionStatus;
  actorType: "USER" | "SYSTEM" | "CUSTOMER" | "AGENT" | "PLATFORM_STAFF";
  actorId?: string;
  actorName?: string;
  reason?: string;
  occurredAt: string;
}

export interface InspectionCorrection {
  id: string;
  inspectionId: string;
  tenantId: string;
  correctionReason: string;
  correctedFields: Record<string, any>;
  previousSnapshot: Record<string, any>;
  correctedByMembershipId: string;
  correctedAt: string;
}

export interface InspectionComparisonObservationDiff {
  bodyZone: BodyZone;
  damageType: DamageType;
  severity: DamageSeverity;
  description: string;
  classification: "UNCHANGED" | "NEW" | "WORSENED" | "RESOLVED";
  baselineObservationId?: string;
  returnObservationId?: string;
  evidenceUrls?: string[];
}

export interface InspectionComparison {
  id: string;
  tenantId: string;
  rentalId?: string | null;
  vehicleId: string;
  baselineInspectionId: string;
  baselineInspectionNumber: string;
  returnInspectionId: string;
  returnInspectionNumber: string;
  comparedAt: string;
  comparedByMembershipId?: string;
  baselineOdometer: number;
  returnOdometer: number;
  odometerDelta: number;
  baselineFuelLevel: number;
  returnFuelLevel: number;
  fuelLevelDelta: number;
  observationDiffs: InspectionComparisonObservationDiff[];
  newDamageCount: number;
  worsenedDamageCount: number;
  unchangedDamageCount: number;
  resolvedDamageCount: number;
}

export interface Inspection {
  id: string;
  tenantId: string;
  inspectionNumber: string;
  inspectionType: InspectionType;
  status: InspectionStatus;
  vehicleId: string;
  bookingId?: string | null;
  rentalId?: string | null;
  handoverId?: string | null;
  performedByMembershipId: string;
  customerId?: string | null;
  driverId?: string | null;
  templateId: string;
  templateVersion: number;
  startedAt?: string | null;
  completedAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  odometer: number;
  fuelLevel: number;
  overallCondition: "EXCELLENT" | "GOOD" | "FAIR" | "POOR";
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;

  responses: InspectionResponse[];
  damageObservations: DamageObservation[];
  evidence: EvidenceRecord[];
  acknowledgements: InspectionAcknowledgement[];
  statusHistory?: InspectionStatusHistory[];
  corrections?: InspectionCorrection[];
}

export interface InspectionReadinessResult {
  isReady: boolean;
  blockers: string[];
  warnings: string[];
  answeredItemsCount: number;
  requiredItemsCount: number;
  evidenceItemsCount: number;
  damageObservationsCount: number;
  isOdometerValid: boolean;
  isFuelLevelValid: boolean;
}

export interface CreateInspectionDto {
  inspectionType: InspectionType;
  vehicleId: string;
  bookingId?: string;
  rentalId?: string;
  handoverId?: string;
  customerId?: string;
  driverId?: string;
  templateId?: string;
  odometer?: number;
  fuelLevel?: number;
  overallCondition?: "EXCELLENT" | "GOOD" | "FAIR" | "POOR";
  notes?: string;
  idempotencyKey?: string;
}

export interface StartInspectionDto {
  startedAt?: string;
  expectedVersion?: number;
}

export interface RecordInspectionResponsesDto {
  responses: Array<{
    templateItemId?: string;
    itemCode: string;
    responseValue: any;
    condition?: "GOOD" | "FAIR" | "POOR" | "DAMAGED" | "N_A";
    notes?: string;
    evidenceIds?: string[];
  }>;
  expectedVersion?: number;
}

export interface RecordDamageObservationDto {
  bodyZone: BodyZone;
  damageType: DamageType;
  severity: DamageSeverity;
  description: string;
  preExisting?: boolean;
  attribution?: DamageAttribution;
  estimatedCost?: number;
  photoUrls?: string[];
  evidenceIds?: string[];
  expectedVersion?: number;
}

export interface AddInspectionEvidenceDto {
  damageObservationId?: string;
  fileId?: string;
  evidenceType: EvidenceType;
  url: string;
  storageReference?: string;
  checksumSha256?: string;
  mimeType?: string;
  fileSize?: number;
  source?: "MOBILE_APP" | "WEB_PORTAL" | "API" | "DEVICE_CAMERA";
  metadata?: Record<string, any>;
  expectedVersion?: number;
}

export interface CompleteInspectionDto {
  odometer: number;
  fuelLevel: number;
  overallCondition?: "EXCELLENT" | "GOOD" | "FAIR" | "POOR";
  notes?: string;
  idempotencyKey?: string;
  expectedVersion?: number;
}

export interface VoidInspectionDto {
  voidReason: string;
  expectedVersion?: number;
}

export interface CorrectInspectionDto {
  correctionReason: string;
  correctedFields: {
    odometer?: number;
    fuelLevel?: number;
    overallCondition?: "EXCELLENT" | "GOOD" | "FAIR" | "POOR";
    notes?: string;
    responses?: Array<{
      templateItemId: string;
      itemCode: string;
      responseValue: any;
      condition?: "GOOD" | "FAIR" | "POOR" | "DAMAGED" | "N_A";
      notes?: string;
    }>;
  };
}

export interface AcknowledgeInspectionDto {
  signerType: "CUSTOMER" | "PRIMARY_DRIVER" | "INSPECTOR" | "WITNESS";
  signerId: string;
  signerName: string;
  signatureMethod: "ELECTRONIC_OTP" | "DRAWN_CANVAS" | "BIOMETRIC" | "MANUAL_UPLOAD";
  signatureReference: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateDamageCaseDto {
  vehicleId: string;
  inspectionId: string;
  rentalId?: string;
  bookingId?: string;
  damageType: DamageType;
  severity: DamageSeverity;
  bodyZone: BodyZone;
  description: string;
  estimatedRepairCost?: number;
  responsibleParty?: "CUSTOMER" | "OPERATOR" | "THIRD_PARTY" | "UNASSIGNED";
  preExisting?: boolean;
  idempotencyKey?: string;
}

export interface UpdateDamageCaseDto {
  status?: DamageCaseStatus;
  damageType?: DamageType;
  severity?: DamageSeverity;
  description?: string;
  estimatedRepairCost?: number;
  actualRepairCost?: number;
  responsibleParty?: "CUSTOMER" | "OPERATOR" | "THIRD_PARTY" | "UNASSIGNED";
  isRepaired?: boolean;
  insuranceClaimNumber?: string;
  notes?: string;
  expectedVersion?: number;
}

export interface CreateInspectionTemplateDto {
  code: string;
  name: string;
  description?: string;
  category?: "STANDARD" | "PREMIUM" | "COMMERCIAL" | "MOTORCYCLE" | "HEAVY";
  isDefault?: boolean;
  sections: Array<{
    title: string;
    description?: string;
    order: number;
    items: Array<{
      code: string;
      label: string;
      description?: string;
      itemType: InspectionTemplateItemType;
      required: boolean;
      requiresEvidence: boolean;
      options?: string[];
      defaultCondition?: string;
      order: number;
    }>;
  }>;
}

export interface InspectionListQueryDto {
  inspectionType?: InspectionType;
  status?: InspectionStatus;
  vehicleId?: string;
  rentalId?: string;
  bookingId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface DamageCaseListQueryDto {
  vehicleId?: string;
  rentalId?: string;
  status?: DamageCaseStatus;
  severity?: DamageSeverity;
  bodyZone?: BodyZone;
  search?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// SPRINT 16: RENTAL RETURN, EXTENSION & COMPLETION LIFECYCLE (DOM-003 §19-20)
// ============================================================================

export type DepositSettlementStatus =
  | "PENDING"
  | "REFUND_QUEUED"
  | "REFUNDED"
  | "CHARGE_QUEUED"
  | "CHARGED"
  | "SETTLED"
  | "WAIVED";

export interface RentalReturnRecord {
  id: string;
  tenantId: string;
  rentalId: string;
  scheduledReturnAt?: string;
  scheduledReturnLocationId?: string;
  actualReturnAt?: string;
  actualReturnLocationId?: string;
  receivedByStaffId?: string;
  receivedByStaffName?: string;
  returnOdometer?: number;
  returnFuelLevel?: number;
  returnInspectionId?: string;
  conditionNotes?: string;
  status: RentalState;
  createdAt: string;
  updatedAt: string;
}

export type FinalCalculationCategory =
  | "BASE_RENTAL"
  | "EXTENSION"
  | "EXCESS_MILEAGE"
  | "FUEL_DEFICIT"
  | "LATE_RETURN"
  | "DAMAGE"
  | "CLEANING"
  | "TOLL_OR_FINE"
  | "ADDITIONAL_FEE"
  | "DISCOUNT";

export interface RentalFinalCalculationItem {
  code: string;
  label: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  taxAmount: number;
  category: FinalCalculationCategory;
  notes?: string;
}

export interface RentalFinalCalculation {
  id: string;
  tenantId: string;
  rentalId: string;
  bookingId: string;
  calculatedAt: string;
  
  startOdometer: number;
  returnOdometer: number;
  totalDistanceKm: number;
  allowedDistanceKm: number;
  excessDistanceKm: number;
  excessKmRate: number;
  excessKmCharge: number;
  
  startFuelLevel: number;
  returnFuelLevel: number;
  fuelDeficitPercent: number;
  fuelDeficitLitres: number;
  fuelPricePerUnit: number;
  fuelDeficitCharge: number;
  fuelRefuelingFee: number;

  scheduledReturnAt: string;
  actualReturnAt: string;
  lateReturnDurationHours: number;
  gracePeriodHours: number;
  billableLateHours: number;
  lateReturnFee: number;

  damageCaseIds: string[];
  totalDamageCharge: number;
  
  totalAdditionalFees: number;
  lineItems: RentalFinalCalculationItem[];

  baseRentalAmount: number;
  extensionsTotalAmount: number;
  grossFinalTotal: number;
  totalTaxAmount: number;
  netFinalTotal: number;

  depositHeldAmount: number;
  depositDeductionsTotal: number;
  depositRefundDue: number;
  depositAdditionalPaymentDue: number;
  depositSettlementStatus: DepositSettlementStatus;
  
  isImmutable: boolean;
  sealedAt?: string;
  sealedBy?: string;
}

// ----------------------------------------------------------------------------
// SPRINT 16 DTOs
// ----------------------------------------------------------------------------

export interface RequestRentalExtensionDto {
  newEndDate: string; // ISO8601 UTC
  additionalDays?: number;
  reason?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface ApproveRentalExtensionDto {
  approvedDailyRate?: number;
  approvedAdditionalCost?: number;
  notes?: string;
  idempotencyKey?: string;
}

export interface RejectRentalExtensionDto {
  rejectionReason: string;
  notes?: string;
}

export interface ScheduleRentalReturnDto {
  scheduledReturnAt: string; // ISO8601 UTC
  scheduledReturnLocationId?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface ReceiveReturnedVehicleDto {
  receivedAt?: string; // ISO8601 UTC
  returnOdometer: number;
  returnFuelLevel: number;
  returnLocationId?: string;
  conditionNotes?: string;
  idempotencyKey?: string;
}

export interface PerformReturnInspectionDto {
  inspectionId: string;
  odometer?: number;
  fuelLevel?: number;
  damageCaseIds?: string[];
  notes?: string;
}

export interface CalculateFinalRentalDto {
  returnOdometer?: number;
  returnFuelLevel?: number;
  actualReturnAt?: string;
  fuelPricePerLiter?: number;
  excessKmRate?: number;
  freeKmPerDay?: number;
  tankCapacityLitres?: number;
  refuelingFee?: number;
  lateHourlyRate?: number;
  lateGracePeriodHours?: number;
  damageChargesOverride?: number;
  additionalFees?: Array<{
    code: string;
    label: string;
    amount: number;
    taxAmount?: number;
    category?: FinalCalculationCategory;
  }>;
  idempotencyKey?: string;
}

export interface ProcessDepositSettlementDto {
  settlementStatus: DepositSettlementStatus;
  refundAmount?: number;
  additionalChargedAmount?: number;
  paymentMethod?: "MPESA" | "CARD" | "BANK_TRANSFER" | "CASH" | "SECURITY_DEPOSIT_HOLD";
  transactionReference?: string;
  notes?: string;
}

export interface CompleteRentalDto {
  notes?: string;
  releaseVehicleToStatus?: "AVAILABLE" | "MAINTENANCE" | "INSPECTION" | "GROUNDED";
  idempotencyKey?: string;
}

// ============================================================================
// SPRINT 17: MAINTENANCE MANAGEMENT BOUNDED CONTEXT TYPES
// ============================================================================

export type MaintenanceStatus =
  | "REQUESTED"
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "VERIFIED"
  | "CANCELLED";

export type MaintenanceType =
  | "ROUTINE_SERVICE"
  | "PREVENTIVE"
  | "CORRECTIVE"
  | "REPAIR"
  | "TIRE"
  | "BRAKE"
  | "ENGINE"
  | "TRANSMISSION"
  | "ELECTRICAL"
  | "BODYWORK"
  | "CLEANING"
  | "INSPECTION_REMEDIATION";

export type MaintenancePriority =
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "URGENT"
  | "CRITICAL";

export type MaintenanceSourceType =
  | "MANUAL"
  | "SCHEDULE"
  | "ODOMETER_THRESHOLD"
  | "INSPECTION"
  | "DAMAGE_CASE"
  | "RENTAL_RETURN"
  | "COMPLIANCE";

export type MaintenanceDueStatus =
  | "NOT_DUE"
  | "DUE_SOON"
  | "DUE"
  | "OVERDUE";

export type MaintenanceTaskType =
  | "INSPECTION"
  | "OIL_CHANGE"
  | "AIR_FILTER"
  | "CABIN_FILTER"
  | "SPARK_PLUGS"
  | "BRAKE_PADS"
  | "BRAKE_DISCS"
  | "FLUID_SERVICE"
  | "TIRE_REPLACEMENT"
  | "TIRE_ROTATION"
  | "WHEEL_ALIGNMENT"
  | "BATTERY_TEST"
  | "BATTERY_REPLACEMENT"
  | "ALTERNATOR_REPAIR"
  | "SUSPENSION_REPAIR"
  | "BODYWORK"
  | "PAINT_TOUCHUP"
  | "WINDSHIELD_REPAIR"
  | "DISASSEMBLY"
  | "PART_REPLACEMENT"
  | "CLEANING"
  | "OTHER"
  | string;

export type MaintenanceTaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "SKIPPED";

export type MaintenanceCostCategory =
  | "LABOUR"
  | "PARTS"
  | "FLUIDS"
  | "EXTERNAL_SERVICE"
  | "TAX"
  | "OTHER";

export type ServiceProviderStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED";

export type MaintenanceScheduleStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "DEACTIVATED";

export interface ServiceProvider {
  id: string;
  tenantId: string;
  name: string;
  code?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  location?: string;
  address?: string;
  status: ServiceProviderStatus;
  notes?: string;
  rating?: number;
  servicesProvided?: MaintenanceType[];
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceSchedule {
  id: string;
  tenantId: string;
  vehicleId?: string; // If specific to a vehicle
  vehicleCategoryId?: string; // If scoped to category
  modelScope?: string; // e.g. "Toyota Prado TX"
  name: string;
  maintenanceType: MaintenanceType;
  intervalDistanceKm?: number;
  intervalDays?: number;
  intervalMonths?: number;
  lastCompletedAt?: string;
  lastCompletedOdometer?: number;
  nextDueAt?: string;
  nextDueOdometer?: number;
  dueSoonDistanceThresholdKm?: number; // e.g. 500 km
  dueSoonDaysThreshold?: number; // e.g. 14 days
  status: MaintenanceScheduleStatus;
  isSafetyCritical?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceTask {
  id: string;
  maintenanceId: string;
  tenantId: string;
  taskType: string;
  description: string;
  isRequired: boolean;
  status: MaintenanceTaskStatus;
  estimatedCost?: number;
  actualCost?: number;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
  technicianNotes?: string;
}

export interface MaintenancePartItem {
  id: string;
  maintenanceId: string;
  tenantId: string;
  partNumber?: string;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  currency: string;
  supplierId?: string;
  supplierName?: string;
  invoiceReference?: string;
  notes?: string;
}

export interface MaintenanceCostItem {
  id: string;
  maintenanceId: string;
  tenantId: string;
  category: MaintenanceCostCategory;
  description: string;
  estimatedCost: number;
  actualCost: number;
  currency: string;
  invoiceNumber?: string;
  notes?: string;
}

export interface MaintenanceEvidence {
  id: string;
  maintenanceId: string;
  tenantId: string;
  fileReference: string;
  fileType: "INVOICE" | "SERVICE_SHEET" | "PHOTO" | "DIAGNOSTIC_REPORT" | "RECEIPT" | "WARRANTY" | "OTHER";
  description?: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface MaintenanceStatusHistory {
  id: string;
  maintenanceId: string;
  tenantId: string;
  fromStatus?: MaintenanceStatus | null;
  toStatus: MaintenanceStatus;
  reason?: string;
  changedBy: string;
  changedAt: string;
}

export interface MaintenanceVerification {
  id: string;
  maintenanceId: string;
  tenantId: string;
  verifiedBy: string;
  verifiedAt: string;
  passedInspection: boolean;
  roadTested?: boolean;
  qualityScore?: number;
  releaseVehicleStatus: "AVAILABLE" | "MAINTENANCE" | "INSPECTION" | "GROUNDED";
  verificationNotes?: string;
  evidenceIds?: string[];
}

export interface MaintenanceOwnershipTermsSnapshot {
  ownerId?: string;
  ownerName?: string;
  agreementId?: string;
  maintenanceCostResponsibility?: "TENANT" | "OWNER" | "SHARED_50_50" | "PERCENTAGE";
  ownerPercentage?: number;
  tenantPercentage?: number;
  capturedAt: string;
}

export interface MaintenanceWorkOrder {
  id: string;
  tenantId: string;
  maintenanceNumber: string; // e.g. MNT-2026-0001
  vehicleId: string;
  status: MaintenanceStatus;
  maintenanceType: MaintenanceType;
  priority: MaintenancePriority;
  sourceType: MaintenanceSourceType;
  sourceId?: string; // e.g. damageCaseId, inspectionId, rentalId, scheduleId
  requestedAt: string;
  requestedBy: string;
  reason: string;
  description?: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  actualStartAt?: string;
  actualCompletedAt?: string;
  verifiedAt?: string;
  garageId?: string;
  garageName?: string;
  assignedTechnician?: string;
  odometerAtRequest?: number;
  startOdometer?: number;
  completionOdometer?: number;
  allocationId?: string; // Availability engine lock
  estimatedCost: number;
  actualCost: number;
  currency: string;
  isSafetyCritical?: boolean;
  ownershipTermsSnapshot?: MaintenanceOwnershipTermsSnapshot;
  tasks: MaintenanceTask[];
  parts: MaintenancePartItem[];
  costItems: MaintenanceCostItem[];
  evidence?: MaintenanceEvidence[];
  verification?: MaintenanceVerification;
  statusHistory: MaintenanceStatusHistory[];
  cancellationReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceDueEvaluation {
  scheduleId: string;
  vehicleId: string;
  vehicleRegistration?: string;
  scheduleName: string;
  maintenanceType: MaintenanceType;
  dueStatus: MaintenanceDueStatus;
  distanceToDueKm?: number;
  daysToDue?: number;
  nextDueAt?: string;
  nextDueOdometer?: number;
  currentOdometer?: number;
  isSafetyCritical: boolean;
  reason: string;
}

export interface MaintenanceDueResult {
  scheduleId: string;
  vehicleId: string;
  scheduleName: string;
  maintenanceType: MaintenanceType;
  status: "OK" | "DUE_SOON" | "OVERDUE";
  distanceRemainingKm?: number;
  daysRemaining?: number;
  isSafetyCritical?: boolean;
  reasons?: string[];
}

// SPRINT 17 DTOs
export interface CreateMaintenanceRequestDto {
  vehicleId: string;
  maintenanceType: MaintenanceType;
  priority?: MaintenancePriority;
  reason: string;
  description?: string;
  sourceType?: MaintenanceSourceType;
  sourceId?: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  garageId?: string;
  garageName?: string;
  assignedTechnician?: string;
  estimatedCost?: number;
  currency?: string;
  isSafetyCritical?: boolean;
  tasks?: Array<{
    taskType: string;
    description: string;
    isRequired?: boolean;
    estimatedCost?: number;
  }>;
  idempotencyKey?: string;
}

export interface ScheduleMaintenanceDto {
  scheduledStartAt: string;
  scheduledEndAt?: string;
  garageId?: string;
  garageName?: string;
  assignedTechnician?: string;
  estimatedCost?: number;
  notes?: string;
  idempotencyKey?: string;
}

export interface StartMaintenanceDto {
  actualStartAt?: string;
  startOdometer?: number;
  garageId?: string;
  assignedTechnician?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface AddMaintenanceTaskDto {
  taskType: string;
  description: string;
  isRequired?: boolean;
  estimatedCost?: number;
}

export interface UpdateMaintenanceTaskDto {
  status?: MaintenanceTaskStatus;
  actualCost?: number;
  notes?: string;
  technicianNotes?: string;
}

export interface AddMaintenancePartDto {
  partNumber?: string;
  description: string;
  quantity: number;
  unitCost: number;
  currency?: string;
  supplierId?: string;
  supplierName?: string;
  invoiceReference?: string;
  notes?: string;
}

export type AddPartItemDto = AddMaintenancePartDto;

export interface RecordMaintenanceCostDto {
  category: MaintenanceCostCategory;
  description: string;
  estimatedCost?: number;
  actualCost: number;
  currency?: string;
  invoiceNumber?: string;
  notes?: string;
}

export type RecordCostItemDto = RecordMaintenanceCostDto;

export interface AddMaintenanceEvidenceDto {
  fileReference: string;
  fileType: "INVOICE" | "SERVICE_SHEET" | "PHOTO" | "DIAGNOSTIC_REPORT" | "RECEIPT" | "WARRANTY" | "OTHER";
  description?: string;
}

export interface CompleteMaintenanceDto {
  actualCompletedAt?: string;
  completionOdometer?: number;
  actualCost?: number;
  invoiceReference?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface VerifyMaintenanceDto {
  verifiedAt?: string;
  passedInspection: boolean;
  roadTested?: boolean;
  qualityScore?: number;
  releaseVehicleStatus?: "AVAILABLE" | "MAINTENANCE" | "INSPECTION" | "GROUNDED";
  verificationNotes?: string;
  evidenceIds?: string[];
  recalculateNextSchedule?: boolean;
  idempotencyKey?: string;
}

export interface CancelMaintenanceDto {
  reason: string;
  notes?: string;
}

export interface CreateMaintenanceScheduleDto {
  vehicleId?: string;
  vehicleCategoryId?: string;
  modelScope?: string;
  name: string;
  maintenanceType: MaintenanceType;
  intervalDistanceKm?: number;
  intervalDays?: number;
  intervalMonths?: number;
  dueSoonDistanceThresholdKm?: number;
  dueSoonDaysThreshold?: number;
  isSafetyCritical?: boolean;
  lastCompletedAt?: string;
  lastCompletedOdometer?: number;
  nextDueAt?: string;
  nextDueOdometer?: number;
  notes?: string;
}

export interface UpdateMaintenanceScheduleDto {
  name?: string;
  maintenanceType?: MaintenanceType;
  intervalDistanceKm?: number;
  intervalDays?: number;
  intervalMonths?: number;
  dueSoonDistanceThresholdKm?: number;
  dueSoonDaysThreshold?: number;
  isSafetyCritical?: boolean;
  status?: MaintenanceScheduleStatus;
  lastCompletedAt?: string;
  lastCompletedOdometer?: number;
  nextDueAt?: string;
  nextDueOdometer?: number;
  notes?: string;
}

export interface CreateServiceProviderDto {
  name: string;
  code?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  location?: string;
  address?: string;
  servicesProvided?: MaintenanceType[];
  notes?: string;
}

export interface UpdateServiceProviderDto {
  name?: string;
  code?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  location?: string;
  address?: string;
  status?: ServiceProviderStatus;
  servicesProvided?: MaintenanceType[];
  notes?: string;
  rating?: number;
}

// ----------------------------------------------------------------------------
// 20. COMPLIANCE, DOCUMENT EXPIRY & OPERATIONAL ELIGIBILITY (SPRINT 18, DOM-001, DOM-003, DEV-006, DEV-007, DEV-009, BRS-001)
// ----------------------------------------------------------------------------

export type ComplianceSubjectType =
  | "VEHICLE"
  | "DRIVER"
  | "CUSTOMER"
  | "TENANT"
  | "VEHICLE_OWNER"
  | "CORPORATE_ACCOUNT";

export type ComplianceRequirementType =
  | "DOCUMENT"
  | "CERTIFICATION"
  | "INSURANCE"
  | "PERMIT"
  | "LICENCE"
  | "INSPECTION"
  | "POLICY_ACKNOWLEDGEMENT";

export type ComplianceBlockingPolicy =
  | "WARNING_ONLY"
  | "BLOCK_NEW_BOOKING"
  | "BLOCK_HANDOVER"
  | "BLOCK_RENTAL_START"
  | "BLOCK_VEHICLE_OPERATION"
  | "BLOCK_ALL_NEW_OPERATIONS";

export type ComplianceRecordStatus =
  | "PENDING"
  | "VALID"
  | "DUE_SOON"
  | "EXPIRED"
  | "REJECTED"
  | "SUSPENDED"
  | "NOT_APPLICABLE";

export type ComplianceVerificationStatus =
  | "UNVERIFIED"
  | "PENDING"
  | "VERIFIED"
  | "REJECTED"
  | "REVOKED";

export type ComplianceOperationContext =
  | "BOOKING_CONFIRMATION"
  | "VEHICLE_ALLOCATION"
  | "HANDOVER"
  | "RENTAL_START"
  | "ACTIVE_RENTAL"
  | "RETURN"
  | "RENTAL_EXTENSION"
  | "POST_MAINTENANCE_RELEASE";

export type ComplianceIssueType =
  | "MISSING"
  | "UNVERIFIED"
  | "EXPIRED"
  | "EXPIRING_SOON"
  | "REJECTED"
  | "REVOKED"
  | "COVERAGE_GAP";

export type ComplianceIssueSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ComplianceIssueStatus = "OPEN" | "IN_REMEDIATION" | "RESOLVED" | "OVERRIDDEN";

export interface ComplianceRequirement {
  id: string;
  tenantId?: string;
  code: string;
  name: string;
  description?: string;
  subjectType: ComplianceSubjectType;
  requirementType: ComplianceRequirementType;
  jurisdiction?: string;
  mandatory: boolean;
  blockingPolicy: ComplianceBlockingPolicy;
  verificationRequired: boolean;
  expiryRequired: boolean;
  warningThresholdDays: number;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceRecord {
  id: string;
  tenantId: string;
  requirementId: string;
  requirementCode: string;
  subjectType: ComplianceSubjectType;
  subjectId: string;
  status: ComplianceRecordStatus;
  verificationStatus: ComplianceVerificationStatus;
  documentReference?: string;
  fileId?: string;
  identifierNumber?: string;
  maskedIdentifier?: string;
  issuedAt?: string;
  validFrom: string;
  expiresAt: string;
  verifiedAt?: string;
  verifiedBy?: string;
  verificationMethod?: string;
  rejectionReason?: string;
  revocationReason?: string;
  revokedAt?: string;
  issuer?: string;
  jurisdiction?: string;
  notes?: string;
  renewalOfRecordId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceRecordHistoryItem {
  id: string;
  tenantId: string;
  recordId: string;
  action: "CREATED" | "SUBMITTED" | "VERIFIED" | "REJECTED" | "REVOKED" | "RENEWED" | "EXPIRED" | "STATUS_RECALCULATED";
  previousStatus?: ComplianceRecordStatus;
  newStatus: ComplianceRecordStatus;
  previousVerificationStatus?: ComplianceVerificationStatus;
  newVerificationStatus: ComplianceVerificationStatus;
  actorId?: string;
  reason?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface ComplianceIssue {
  id: string;
  tenantId: string;
  subjectType: ComplianceSubjectType;
  subjectId: string;
  requirementCode: string;
  requirementName?: string;
  issueType: ComplianceIssueType;
  severity: ComplianceIssueSeverity;
  blockingPolicy: ComplianceBlockingPolicy;
  status: ComplianceIssueStatus;
  detectedAt: string;
  resolvedAt?: string;
  resolutionReference?: string;
  resolutionNotes?: string;
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceOverride {
  id: string;
  tenantId: string;
  subjectType: ComplianceSubjectType;
  subjectId: string;
  requirementCode: string;
  operationContext: ComplianceOperationContext;
  approvedBy: string;
  reason: string;
  validUntil: string;
  createdAt: string;
}

export interface ComplianceReadinessResult {
  isReady: boolean;
  subjectType: ComplianceSubjectType;
  subjectId: string;
  operationContext: ComplianceOperationContext;
  evaluatedAt: string;
  effectiveUntil?: string;
  blockingIssues: ComplianceReadinessIssueItem[];
  warnings: ComplianceReadinessIssueItem[];
  verifiedItemsCount: number;
  totalRequirementsCount: number;
}

export interface ComplianceReadinessIssueItem {
  requirementCode: string;
  requirementName: string;
  issueType: ComplianceIssueType;
  severity: ComplianceIssueSeverity;
  blockingPolicy: ComplianceBlockingPolicy;
  message: string;
  expiresAt?: string;
  daysRemaining?: number;
  remediationAction?: string;
}

export interface CreateComplianceRequirementDto {
  code: string;
  name: string;
  description?: string;
  subjectType: ComplianceSubjectType;
  requirementType: ComplianceRequirementType;
  jurisdiction?: string;
  mandatory?: boolean;
  blockingPolicy?: ComplianceBlockingPolicy;
  verificationRequired?: boolean;
  expiryRequired?: boolean;
  warningThresholdDays?: number;
  isActive?: boolean;
}

export interface UpdateComplianceRequirementDto {
  name?: string;
  description?: string;
  jurisdiction?: string;
  mandatory?: boolean;
  blockingPolicy?: ComplianceBlockingPolicy;
  verificationRequired?: boolean;
  expiryRequired?: boolean;
  warningThresholdDays?: number;
  isActive?: boolean;
}

export interface CreateComplianceRecordDto {
  requirementId?: string;
  requirementCode: string;
  subjectType: ComplianceSubjectType;
  subjectId: string;
  documentReference?: string;
  fileId?: string;
  identifierNumber?: string;
  issuedAt?: string;
  validFrom: string;
  expiresAt: string;
  issuer?: string;
  jurisdiction?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface VerifyComplianceRecordDto {
  verificationMethod?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface RejectComplianceRecordDto {
  reason: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface RevokeComplianceRecordDto {
  reason: string;
  effectiveRevocationAt?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface RenewComplianceRecordDto {
  identifierNumber?: string;
  validFrom: string;
  expiresAt: string;
  documentReference?: string;
  fileId?: string;
  issuer?: string;
  jurisdiction?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface OverrideComplianceIssueDto {
  reason: string;
  operationContext: ComplianceOperationContext;
  validUntil?: string;
}

export interface ComplianceDashboardSummary {
  totalRecords: number;
  validRecords: number;
  dueSoonRecords: number;
  expiredRecords: number;
  unverifiedRecords: number;
  openIssuesCount: number;
  criticalIssuesCount: number;
  blockingIssuesCount: number;
  activeOverridesCount: number;
  vehicleReadinessRate: number;
  driverReadinessRate: number;
}

// ============================================================================
// SPRINT 27: SECURE FILES & ENTERPRISE DOCUMENT MANAGEMENT
// ============================================================================

export type FileClassification = "PRIVATE" | "TENANT_INTERNAL" | "RESOURCE_SHARED" | "PUBLIC" | "CONFIDENTIAL" | "RESTRICTED";

export type FileStatus =
  | "PENDING_UPLOAD"
  | "UPLOADED"
  | "QUARANTINED"
  | "SCANNING"
  | "AVAILABLE"
  | "ACTIVE"
  | "REJECTED"
  | "ARCHIVED"
  | "DELETED";

export type FileScanStatus = "PENDING" | "IN_PROGRESS" | "CLEAN" | "INFECTED" | "ERROR" | "SKIPPED";

export type FileResourceType =
  | "CUSTOMER"
  | "DRIVER"
  | "VEHICLE"
  | "VEHICLE_OWNER"
  | "BOOKING"
  | "CONTRACT"
  | "HANDOVER"
  | "RENTAL"
  | "INSPECTION"
  | "DAMAGE_CASE"
  | "MAINTENANCE"
  | "COMPLIANCE"
  | "INVOICE"
  | "EXPENSE"
  | "SETTLEMENT"
  | "WEBSITE";

export type FileResourceRole =
  | "DRIVER_LICENCE_FRONT"
  | "DRIVER_LICENCE_BACK"
  | "ID_DOCUMENT_FRONT"
  | "ID_DOCUMENT_BACK"
  | "NATIONAL_ID"
  | "PASSPORT"
  | "VEHICLE_PHOTO"
  | "VEHICLE_LOGBOOK"
  | "INSURANCE_CERTIFICATE"
  | "CONTRACT_SIGNED_PDF"
  | "INSPECTION_PHOTO"
  | "DAMAGE_EVIDENCE"
  | "MAINTENANCE_INVOICE"
  | "EXPENSE_RECEIPT"
  | "SETTLEMENT_STATEMENT"
  | "WEBSITE_LOGO"
  | "OTHER";

export interface FileRecord {
  id: string;
  tenantId: string;
  storageProvider: string;
  bucket: string;
  objectKey: string;
  originalFilename: string;
  sanitizedFilename: string;
  contentType: string;
  detectedContentType?: string;
  sizeBytes: number;
  checksumAlgorithm: string;
  checksum?: string;
  classification: FileClassification;
  status: FileStatus;
  scanStatus: FileScanStatus;
  uploadedBy: string;
  createdAt: string;
  finalizedAt?: string;
  scannedAt?: string;
  archivedAt?: string;
  deletedAt?: string;
  version: number;
}

export interface FileUploadSession {
  id: string;
  sessionId?: string;
  tenantId: string;
  fileId: string;
  resourceType: FileResourceType;
  resourceId: string;
  resourceRole: FileResourceRole;
  classification: FileClassification;
  originalFilename: string;
  declaredContentType: string;
  maxSizeBytes: number;
  reservedBytes: number;
  objectKey: string;
  uploadUrl: string;
  uploadMethod: "PUT" | "POST";
  status: "INITIATED" | "FINALIZED" | "CANCELLED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
  finalizedAt?: string;
  cancelledAt?: string;
  actorId: string;
  idempotencyKey?: string;
}

export interface FileScanRecord {
  id: string;
  tenantId: string;
  fileId: string;
  scannerEngine: string;
  scannerVersion?: string;
  status: FileScanStatus;
  findings?: string[];
  startedAt: string;
  completedAt?: string;
  attempt: number;
}

export interface DocumentRecord {
  id: string;
  tenantId: string;
  documentType: string;
  resourceType: FileResourceType;
  resourceId: string;
  title: string;
  description?: string;
  status: "ACTIVE" | "SUPERSEDED" | "ARCHIVED" | "DELETED";
  currentVersionId?: string;
  currentVersionNumber: number;
  classification: FileClassification;
  issuedAt?: string;
  expiresAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  version: number;
}

export interface DocumentVersionRecord {
  id: string;
  tenantId: string;
  documentId: string;
  versionNumber: number;
  fileId: string;
  uploadedBy: string;
  changeReason?: string;
  metadataSnapshot?: Record<string, any>;
  createdAt: string;
  supersededAt?: string;
}

export interface FileResourceLink {
  id: string;
  tenantId: string;
  fileId: string;
  resourceType: FileResourceType;
  resourceId: string;
  role: FileResourceRole;
  createdAt: string;
}

export interface FileAccessRecord {
  id: string;
  tenantId: string;
  fileId: string;
  actorId: string;
  actorType: "USER" | "SUPPORT" | "SYSTEM" | "CUSTOMER" | "OWNER";
  accessType: "METADATA_READ" | "DOWNLOAD_URL_ISSUED" | "DIRECT_DOWNLOAD";
  resourceType?: FileResourceType;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface StorageReconciliationIssue {
  id: string;
  tenantId: string;
  fileId?: string;
  objectKey: string;
  issueType: "MISSING_OBJECT" | "ORPHAN_OBJECT" | "STUCK_PENDING" | "STUCK_QUARANTINED" | "CHECKSUM_MISMATCH" | "SIZE_MISMATCH";
  status: "DETECTED" | "RESOLVED" | "IGNORED";
  details?: Record<string, any>;
  detectedAt: string;
  resolvedAt?: string;
}

export interface StorageUsageSummary {
  tenantId: string;
  totalSizeBytes: number;
  fileCount: number;
  quotaSizeBytes: number;
  reservedBytes: number;
  usagePercentage: number;
}

export interface InitiateUploadDto {
  resourceType: FileResourceType;
  resourceId: string;
  resourceRole: FileResourceRole;
  originalFilename: string;
  declaredContentType: string;
  sizeBytes?: number;
  declaredSizeBytes?: number;
  classification?: FileClassification;
  idempotencyKey?: string;
}

export interface InitiateUploadResult {
  uploadSessionId: string;
  fileId: string;
  uploadUrl: string;
  uploadMethod: "PUT" | "POST";
  headers: Record<string, string>;
  expiresAt: string;
  maxSizeBytes: number;
}

export interface FinalizeUploadDto {
  uploadSessionId?: string;
  sessionId?: string;
  actualSizeBytes?: number;
  checksumSha256?: string;
  idempotencyKey?: string;
}

export interface CreateAuthorizedDownloadUrlDto {
  fileId: string;
  expiresInSeconds?: number;
  disposition?: "inline" | "attachment";
}

export interface AuthorizedDownloadUrlResult {
  fileId: string;
  downloadUrl: string;
  expiresAt: string;
  disposition: "inline" | "attachment";
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface CreateDocumentDto {
  documentType: string;
  resourceType: FileResourceType;
  resourceId: string;
  title: string;
  description?: string;
  fileId: string;
  classification?: FileClassification;
  issuedAt?: string;
  expiresAt?: string;
  changeReason?: string;
  idempotencyKey?: string;
}

export interface CreateDocumentVersionDto {
  fileId: string;
  changeReason?: string;
  metadataSnapshot?: Record<string, any>;
  idempotencyKey?: string;
  expiresAt?: string;
  issuedAt?: string;
}

export interface ArchiveDocumentDto {
  reason: string;
}

export type UploadDocumentVersionDto = CreateDocumentVersionDto;
export type RequestUploadIntentDto = InitiateUploadDto;

export interface FileUploadSessionDto {
  id?: string;
  sessionId: string;
  fileId: string;
  objectKey: string;
  uploadUrl: string;
  uploadMethod: "PUT" | "POST";
  headers?: Record<string, string>;
  expiresAt: string;
  maxSizeBytes: number;
}

export interface FinalizeUploadResultDto {
  file: FileRecord;
  scanRecord?: FileScanRecord;
  fileId?: string;
  status?: FileStatus;
  scanStatus?: FileScanStatus;
  detectedContentType?: string;
  findings?: string[];
  quarantined?: boolean;
  sizeBytes?: number;
  checksum?: string;
}

export interface StorageReconciliationReport {
  tenantId: string;
  checkedAt?: string;
  scannedAt?: string;
  totalDbRecords?: number;
  totalStorageObjects?: number;
  missingInStorage?: string[];
  orphanedInStorage?: string[];
  issuesCreated?: number;
  missingObjectsCount: number;
  orphanObjectsCount: number;
  stuckPendingCount: number;
  stuckQuarantinedCount: number;
  issues: StorageReconciliationIssue[];
}

// ============================================================================
// CAR HIRE OS — MEDIA & IMAGE PROCESSING TYPES (SPRINT 28, DEV-006, SEC-001)
// ============================================================================

export type MediaType = "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT";

export type MediaAssetStatus =
  | "PENDING"
  | "PROCESSING"
  | "AVAILABLE"
  | "FAILED"
  | "DELETED";

export type MediaDerivativeStatus =
  | "PENDING"
  | "PROCESSING"
  | "AVAILABLE"
  | "FAILED"
  | "PROCESSING_FAILED"
  | "SUPERSEDED"
  | "DELETED";

export type MediaProcessingRequestStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type MediaDerivativeFormat = "JPEG" | "PNG" | "WEBP" | "AVIF";

export type MediaFitMode = "cover" | "contain" | "inside" | "fill";

export interface MediaAssetRecord {
  id: string;
  tenantId: string;
  sourceFileId: string;
  mediaType: MediaType;
  classification: FileClassification;
  status: MediaAssetStatus;
  processingProfile: string;
  profileVersion: number;
  dominantColor?: string;
  blurHash?: string;
  width?: number;
  height?: number;
  exifStripped: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface MediaDerivativeRecord {
  id: string;
  tenantId: string;
  mediaAssetId: string;
  sourceFileId: string;
  profileName: string;
  profileVersion: number;
  variantName: string;
  format: MediaDerivativeFormat;
  width: number;
  height: number;
  sizeBytes: number;
  objectKey: string;
  storageBucket: string;
  storageProvider: string;
  checksum: string;
  contentType: string;
  quality: number;
  status: MediaDerivativeStatus;
  isPublic: boolean;
  version: number;
  createdAt: string;
  availableAt?: string;
  supersededAt?: string;
  deletedAt?: string;
}

export interface MediaProcessingRequestRecord {
  id: string;
  tenantId: string;
  sourceFileId: string;
  mediaAssetId?: string;
  profileName: string;
  profileVersion: number;
  requestedVariants: string[];
  status: MediaProcessingRequestStatus;
  attempts: number;
  maxAttempts: number;
  errorMessage?: string;
  errorCode?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaReconciliationIssueRecord {
  id: string;
  tenantId: string;
  mediaAssetId?: string;
  mediaDerivativeId?: string;
  objectKey: string;
  issueType:
    | "ORPHAN_DERIVATIVE_OBJECT"
    | "MISSING_DERIVATIVE_OBJECT"
    | "STUCK_PROCESSING_REQUEST"
    | "PROFILE_VERSION_INCOMPLETE";
  status: "DETECTED" | "RESOLVED" | "DISMISSED";
  details?: Record<string, unknown>;
  detectedAt: string;
  resolvedAt?: string;
}

export interface VehicleMediaRecord {
  id: string;
  tenantId: string;
  vehicleId: string;
  mediaAssetId: string;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface MediaVariantDto {
  id: string;
  variantName: string;
  format: MediaDerivativeFormat;
  width: number;
  height: number;
  sizeBytes: number;
  url: string;
  isPublic: boolean;
  checksum: string;
  contentType: string;
  quality: number;
}

export interface MediaAssetDto {
  id: string;
  tenantId: string;
  sourceFileId: string;
  mediaType: MediaType;
  classification: FileClassification;
  status: MediaAssetStatus;
  processingProfile: string;
  profileVersion: number;
  dominantColor?: string;
  blurHash?: string;
  width?: number;
  height?: number;
  variants: MediaVariantDto[];
  primaryUrl?: string;
  thumbnailUrl?: string;
  createdAt: string;
}

export interface ResponsiveSrcsetDto {
  mediaAssetId: string;
  format: MediaDerivativeFormat;
  src: string;
  srcSet: string;
  width: number;
  height: number;
  aspectRatio: number;
  blurPlaceholder?: string;
  variants: Array<{
    width: number;
    url: string;
    descriptor: string;
  }>;
}

export interface VehicleMediaDto {
  id: string;
  vehicleId: string;
  mediaAssetId: string;
  isPrimary: boolean;
  sortOrder: number;
  status: MediaAssetStatus;
  thumbnailUrl?: string;
  mediumUrl?: string;
  largeUrl?: string;
  isPublic: boolean;
  availableVariants: string[];
}

export interface RequestMediaProcessingDto {
  sourceFileId: string;
  profileName: string;
  profileVersion?: number;
}

export interface RegenerateMediaDto {
  sourceFileId: string;
  targetProfileName: string;
  targetVersion?: number;
}

export interface MediaReconciliationReportDto {
  tenantId: string;
  scannedDerivativesCount: number;
  missingDerivativesCount: number;
  orphanObjectsCount: number;
  stuckRequestsRecovered: number;
  openIssues: Array<{
    id: string;
    issueType: string;
    status: string;
    objectKey: string;
    detectedAt: string;
  }>;
  timestamp: string;
}

export interface MediaProcessingJobPayload {
  tenantId: string;
  requestId: string;
  sourceFileId: string;
  profileName: string;
  profileVersion?: number;
}

export interface MediaRegenerateJobPayload {
  tenantId: string;
  sourceFileId: string;
  targetProfileName: string;
  targetVersion?: number;
}

export interface MediaReconciliationJobPayload {
  tenantId: string;
}

// ============================================================================
// SPRINT 29: TENANT WEBSITE CMS, BRANDING, CONTENT MANAGEMENT,
// VEHICLE PRESENTATION & SHARED PUBLIC-WEB ENGINE FOUNDATION (ARCH-001, DEV-008)
// ============================================================================

export type WebsiteStatus =
  | "UNCONFIGURED"
  | "DRAFT"
  | "PUBLISHED"
  | "MAINTENANCE"
  | "ARCHIVED";

export interface WebsiteBranding {
  logoMediaAssetId?: string;
  logoUrl?: string;
  faviconMediaAssetId?: string;
  faviconUrl?: string;
  primaryColor: string; // Hex color (e.g. #059669)
  secondaryColor: string; // Hex color (e.g. #0f172a)
  accentColor: string; // Hex color (e.g. #f59e0b)
  backgroundColor?: string; // Optional background override (e.g. #ffffff)
  fontHeading: string; // 'Outfit' | 'Plus Jakarta Sans' | 'Inter' | 'Playfair Display' | 'Montserrat'
  fontBody: string; // 'Plus Jakarta Sans' | 'Inter' | 'System Sans'
  borderRadius: "none" | "sm" | "md" | "lg" | "full";
  buttonStyle: "solid" | "outline" | "soft";
}

export type ContentBlockType =
  | "HERO"
  | "VEHICLE_SHOWCASE"
  | "FEATURE_GRID"
  | "TEXT_IMAGE"
  | "TESTIMONIALS"
  | "FAQ"
  | "CONTACT_INFO"
  | "CALL_TO_ACTION";

export interface HeroBlockData {
  headline: string;
  subheadline: string;
  mediaAssetId?: string;
  imageUrl?: string;
  primaryCtaLabel?: string;
  primaryCtaLink?: string;
  secondaryCtaLabel?: string;
  secondaryCtaLink?: string;
  showSearchWidget?: boolean;
  badge?: string;
}

export interface VehicleShowcaseBlockData {
  categoryFilter?: string; // "ALL" or specific category ID / name
  limit?: number;
  layout?: "GRID_3" | "GRID_4" | "CAROUSEL";
  sortOrder?: "PRICE_ASC" | "POPULARITY" | "FEATURED";
  featuredVehicleIds?: string[];
  customBadge?: string;
}

export interface FeatureGridItem {
  icon: string; // Lucide icon identifier
  title: string;
  description: string;
}

export interface FeatureGridBlockData {
  items: FeatureGridItem[];
  columns?: 3 | 4;
}

export interface TextImageBlockData {
  richText: string;
  mediaAssetId?: string;
  imageUrl?: string;
  imageAlignment: "LEFT" | "RIGHT";
  ctaLabel?: string;
  ctaLink?: string;
}

export interface TestimonialItem {
  quote: string;
  author: string;
  role?: string;
  rating: number; // 1-5
  avatarUrl?: string;
}

export interface TestimonialsBlockData {
  testimonials: TestimonialItem[];
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqBlockData {
  faqs: FaqItem[];
}

export interface ContactInfoBlockData {
  address?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  operatingHours?: string;
  coordinates?: { lat: number; lng: number };
}

export interface CallToActionBlockData {
  headline: string;
  description?: string;
  buttonLabel: string;
  buttonLink: string;
  accentBadge?: string;
}

export interface ContentBlock {
  id: string;
  type: ContentBlockType;
  sortOrder: number;
  title?: string;
  subtitle?: string;
  data:
    | HeroBlockData
    | VehicleShowcaseBlockData
    | FeatureGridBlockData
    | TextImageBlockData
    | TestimonialsBlockData
    | FaqBlockData
    | ContactInfoBlockData
    | CallToActionBlockData
    | Record<string, any>;
}

export type WebPageType =
  | "HOME"
  | "FLEET_CATALOGUE"
  | "ABOUT"
  | "CONTACT"
  | "CUSTOM"
  | "LEGAL";

export type WebPageStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface PageSeoConfig {
  metaTitle?: string;
  metaDescription?: string;
  socialShareImageUrl?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
}

export interface WebPageRecord {
  id: string;
  websiteId: string;
  tenantId: string;
  slug: string;
  title: string;
  pageType: WebPageType;
  isStandardPage: boolean;
  status: WebPageStatus;
  displayOrder: number;
  seoConfig: PageSeoConfig;
  contentBlocks: ContentBlock[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface NavigationItem {
  id: string;
  label: string;
  type: "INTERNAL_PAGE" | "EXTERNAL_URL" | "CATEGORY_FILTER" | "ANCHOR";
  pageId?: string;
  slug?: string;
  url?: string;
  target?: "_self" | "_blank";
  sortOrder: number;
  children?: NavigationItem[];
}

export interface FooterNavigationColumn {
  columnTitle: string;
  items: NavigationItem[];
}

export interface WebsiteNavigation {
  headerNavigation: NavigationItem[];
  footerNavigation: FooterNavigationColumn[];
}

export type DomainType = "PLATFORM_SUBDOMAIN" | "CUSTOM_DOMAIN";
export type DomainVerificationStatus =
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "FAILED"
  | "REVOKED";
export type DomainSslStatus =
  | "INITIALIZING"
  | "ACTIVE"
  | "RENEWAL_PENDING"
  | "FAILED";

export interface WebsiteDomainRecord {
  id: string;
  tenantId: string;
  websiteId: string;
  hostname: string;
  type: DomainType;
  verificationStatus: DomainVerificationStatus;
  verificationMethod: "DNS_TXT" | "DNS_CNAME";
  verificationToken: string;
  expectedTxtRecord: string;
  expectedCnameRecord: string;
  sslStatus: DomainSslStatus;
  isPrimary: boolean;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantWebsiteRecord {
  id: string;
  tenantId: string;
  subdomain: string;
  status: WebsiteStatus;
  branding: WebsiteBranding;
  navigation: WebsiteNavigation;
  activeSnapshotId?: string;
  publishedVersion?: number;
  maintenanceMessage?: string;
  isMaintenanceMode?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteSnapshotRecord {
  id: string;
  websiteId: string;
  tenantId: string;
  versionNumber: number;
  snapshotData: {
    website: TenantWebsiteRecord;
    branding: WebsiteBranding;
    pages: WebPageRecord[];
    navigation: WebsiteNavigation;
  };
  publishedByUserId: string;
  changeSummary: string;
  publishedAt: string;
}

// Website DTOs
export interface CreateTenantWebsiteDto {
  subdomain: string;
  branding?: Partial<WebsiteBranding>;
}

export interface UpdateTenantWebsiteBrandingDto {
  branding: Partial<WebsiteBranding>;
}

export interface CreateWebPageDto {
  slug: string;
  title: string;
  pageType: WebPageType;
  seoConfig?: PageSeoConfig;
  contentBlocks?: ContentBlock[];
}

export interface UpdateWebPageDto {
  title?: string;
  slug?: string;
  status?: WebPageStatus;
  seoConfig?: Partial<PageSeoConfig>;
  contentBlocks?: ContentBlock[];
  displayOrder?: number;
}

export interface RegisterCustomDomainDto {
  hostname: string;
}

export interface PublishWebsiteDto {
  changeSummary?: string;
}

export interface ToggleMaintenanceModeDto {
  enabled: boolean;
  maintenanceMessage?: string;
}

export interface RollbackWebsiteDto {
  targetVersionNumber: number;
}

export interface PublicWebsiteResolvedDto {
  tenantId: string;
  websiteId: string;
  domainId?: string;
  domainType?: DomainType;
  isPrimary?: boolean;
  subdomain: string;
  hostname: string;
  status: WebsiteStatus;
  isMaintenanceMode: boolean;
  maintenanceMessage?: string;
  publishedVersion: number;
  branding: WebsiteBranding;
  navigation: WebsiteNavigation;
  activePages: Array<{
    id: string;
    slug: string;
    title: string;
    pageType: WebPageType;
    displayOrder: number;
  }>;
}

export type PublicWebsiteContext = PublicWebsiteResolvedDto;

export interface PublicVehicleCatalogueItemDto {
  id: string;
  tenantId: string;
  make: string;
  model: string;
  year: number;
  category: string;
  transmission: string;
  fuelType: string;
  seats: number;
  dailyRate: number;
  currency: string;
  currencySymbol: string;
  isAvailable: boolean;
  thumbnailUrl?: string;
  mediumUrl?: string;
  largeUrl?: string;
  primaryImageUrl?: string;
  badges?: string[];
  features?: string[];
}

export type VehicleRecord = Vehicle;

