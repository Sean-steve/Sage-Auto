// ============================================================================
// CAR HIRE OS — SPRINT 33: LEADS, SALES QUOTES & CRM DOMAIN TYPES
// ============================================================================

export type LeadType = "INDIVIDUAL" | "CORPORATE";

export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "PROPOSAL_SENT"
  | "NEGOTIATING"
  | "CONVERTED"
  | "LOST"
  | "DISQUALIFIED";

export type LeadSource =
  | "WEBSITE_ENQUIRY"
  | "WALK_IN"
  | "PHONE_CALL"
  | "EMAIL"
  | "REFERRAL_AGENT"
  | "CORPORATE_PARTNER"
  | "SOCIAL_MEDIA"
  | "CAMPAIGN"
  | "OTHER";

export type LeadLossReason =
  | "PRICE_TOO_HIGH"
  | "VEHICLE_UNAVAILABLE"
  | "COMPETITOR_CHOSEN"
  | "DATES_CHANGED"
  | "CUSTOMER_UNRESPONSIVE"
  | "UNQUALIFIED_REQUIREMENTS"
  | "OTHER";

export interface LeadRecord {
  id: string;
  tenantId: string;
  leadNumber: string;
  type: LeadType;
  status: LeadStatus;
  stageId?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  taxNumber?: string;
  email: string;
  phone?: string;
  source: LeadSource;
  sourceDetails?: string;
  assignedUserId?: string;
  estimatedValue: number;
  currency: string;
  confidenceScore: number; // 0 to 100
  pickupDate?: string;
  returnDate?: string;
  pickupLocation?: string;
  returnLocation?: string;
  preferredVehicleCategoryId?: string;
  preferredVehicleId?: string;
  convertedCustomerId?: string;
  convertedCorporateAccountId?: string;
  convertedAt?: string;
  lossReason?: LeadLossReason;
  lossNotes?: string;
  marketingConsent: boolean;
  metadata?: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type SalesQuoteStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "SENT"
  | "VIEWED"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "SUPERSEDED"
  | "CONVERTED"
  | "CANCELLED";

export type QuoteLineItemType =
  | "VEHICLE_RENTAL"
  | "BASE_RATE"
  | "INSURANCE_CDW"
  | "INSURANCE"
  | "ADDITIONAL_DRIVER"
  | "GPS_NAVIGATION"
  | "BABY_SEAT"
  | "DELIVERY_FEE"
  | "AIRPORT_SURCHARGE"
  | "ADDON"
  | "DISCOUNT"
  | "CUSTOM_EXTRA";

export interface QuoteLineItem {
  id: string;
  type: QuoteLineItemType;
  description: string;
  unitPrice: number;
  quantity: number;
  taxRatePercent?: number;
  discountAmount?: number;
  totalPrice: number;
}

export interface QuoteVersionRecord {
  id: string;
  tenantId: string;
  quoteId: string;
  versionNumber: number;
  lineItems: QuoteLineItem[];
  pricingSnapshot: Record<string, unknown>;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  depositTotal: number;
  grandTotal: number;
  termsAndConditions?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface SalesQuoteRecord {
  id: string;
  tenantId: string;
  quoteNumber: string;
  leadId?: string;
  customerId?: string;
  corporateAccountId?: string;
  status: SalesQuoteStatus;
  currentVersion: number;
  currency: string;
  validUntil: string;
  pickupDate: string;
  returnDate: string;
  pickupLocation: string;
  returnLocation: string;
  vehicleCategoryId?: string;
  vehicleId?: string;
  publicToken: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  depositTotal: number;
  grandTotal: number;
  requiredDepositAmount: number;
  paymentTerms?: string;
  convertedBookingId?: string;
  convertedAt?: string;
  createdBy: string;
  assignedUserId?: string;
  customerNotes?: string;
  internalNotes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CrmPipelineStageRecord {
  id: string;
  tenantId: string;
  name: string;
  code: string;
  orderIndex: number;
  isWonStage: boolean;
  isLostStage: boolean;
  colorHex: string;
  slaHours?: number;
  createdAt: string;
  updatedAt: string;
}

export type CrmActivityType =
  | "NOTE"
  | "CALL"
  | "EMAIL_SENT"
  | "MEETING"
  | "STATUS_CHANGE"
  | "STAGE_CHANGE"
  | "QUOTE_SENT"
  | "QUOTE_ACCEPTED"
  | "CONVERSION";

export interface CrmActivityRecord {
  id: string;
  tenantId: string;
  entityType: "LEAD" | "SALES_QUOTE";
  entityId: string;
  type: CrmActivityType;
  title: string;
  description: string;
  performedBy: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type CrmTaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type CrmTaskStatus = "PENDING" | "COMPLETED" | "CANCELLED";

export interface CrmTaskRecord {
  id: string;
  tenantId: string;
  entityType: "LEAD" | "SALES_QUOTE";
  entityId: string;
  title: string;
  description?: string;
  dueDate: string;
  priority: CrmTaskPriority;
  status: CrmTaskStatus;
  assignedUserId: string;
  completedAt?: string;
  completedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadFilterParams {
  tenantId: string;
  status?: LeadStatus;
  stageId?: string;
  assignedUserId?: string;
  type?: LeadType;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SalesQuoteFilterParams {
  tenantId: string;
  leadId?: string;
  customerId?: string;
  status?: SalesQuoteStatus;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface PublicEnquiryDto {
  tenantSlugOrHost?: string;
  tenantId?: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  email: string;
  phone?: string;
  pickupDate?: string;
  returnDate?: string;
  pickupLocation?: string;
  returnLocation?: string;
  preferredVehicleCategory?: string;
  message?: string;
  source?: LeadSource;
  marketingConsent?: boolean;
}
