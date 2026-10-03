// ============================================================================
// CAR HIRE OS — CANONICAL DOMAIN EVENT CONTRACTS & ENVELOPE (DEV-010, BRS-002)
// Standardized event envelope, typed payloads, and event catalog for at-least-once delivery
// ============================================================================

export type EventActorType = "USER" | "SYSTEM" | "API_CLIENT" | "SUPPORT" | "ANONYMOUS";

export interface DomainEventActor {
  type: EventActorType;
  id?: string;
  supportActorId?: string;
  impersonatorId?: string;
}

export interface DomainEventAggregate {
  type: string;
  id: string;
  version?: number;
}

export interface DomainEventContract<T = any> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string; // ISO-8601 UTC
  tenantId?: string | null;
  source: string; // e.g. "carhire.api.billing", "carhire.worker"
  correlationId: string;
  causationId?: string | null;
  aggregate: DomainEventAggregate;
  actor: DomainEventActor;
  data: T;
  metadata?: Record<string, unknown>;
}

// Alias for canonical nomenclature
export type DomainEventEnvelope<T = any> = DomainEventContract<T>;

// ----------------------------------------------------------------------------
// CANONICAL EVENT CATALOG (EVENT TYPES)
// ----------------------------------------------------------------------------
export const EVENT_TYPES = {
  // Fleet Domain
  FLEET_VEHICLE_CREATED: "fleet.vehicle.created",
  FLEET_VEHICLE_UPDATED: "fleet.vehicle.updated",
  FLEET_VEHICLE_STATUS_CHANGED: "fleet.vehicle.status_changed",
  FLEET_VEHICLE_ODOMETER_UPDATED: "fleet.vehicle.odometer_updated",
  FLEET_VEHICLE_DECOMMISSIONED: "fleet.vehicle.decommissioned",

  // Bookings Domain
  BOOKING_RESERVATION_CREATED: "booking.reservation.created",
  BOOKING_RESERVATION_CONFIRMED: "booking.reservation.confirmed",
  BOOKING_RESERVATION_CANCELLED: "booking.reservation.cancelled",
  BOOKING_RESERVATION_EXPIRED: "booking.reservation.expired",
  BOOKING_RESERVATION_AMENDED: "booking.reservation.amended",

  // Rentals Domain
  RENTAL_CONTRACT_GENERATED: "rental.contract.generated",
  RENTAL_CONTRACT_SIGNED: "rental.contract.signed",
  RENTAL_HANDOVER_COMPLETED: "rental.handover.completed",
  RENTAL_DISPATCHED: "rental.dispatched",
  RENTAL_STARTED: "rental.started",
  RENTAL_RETURNED: "rental.returned",
  RENTAL_COMPLETED: "rental.completed",
  RENTAL_CANCELLED: "rental.cancelled",

  // Inspections & Damage Domain
  INSPECTION_COMPLETED: "inspection.completed",
  DAMAGE_REPORTED: "damage.reported",
  DAMAGE_REPAIRED: "damage.repaired",

  // Maintenance Domain
  MAINTENANCE_SCHEDULED: "maintenance.scheduled",
  MAINTENANCE_STARTED: "maintenance.started",
  MAINTENANCE_COMPLETED: "maintenance.completed",

  // Compliance Domain
  COMPLIANCE_DOCUMENT_EXPIRED: "compliance.document.expired",
  COMPLIANCE_OVERRIDE_GRANTED: "compliance.override.granted",

  // Billing & Invoicing Domain
  BILLING_INVOICE_ISSUED: "billing.invoice.issued",
  BILLING_INVOICE_PAID: "billing.invoice.paid",
  BILLING_INVOICE_VOIDED: "billing.invoice.voided",
  BILLING_CREDIT_NOTE_ISSUED: "billing.credit_note.issued",

  // Payments & Refunds Domain
  PAYMENT_INTENT_CREATED: "payment.intent.created",
  PAYMENT_ATTEMPTED: "payment.attempted",
  PAYMENT_SUCCEEDED: "payment.succeeded",
  PAYMENT_FAILED: "payment.failed",
  PAYMENT_REFUND_INITIATED: "payment.refund.initiated",
  PAYMENT_REFUND_COMPLETED: "payment.refund.completed",

  // Ledger & Accounting Domain
  LEDGER_JOURNAL_ENTRY_POSTED: "ledger.journal_entry.posted",

  // Owner Settlements Domain
  SETTLEMENT_PERIOD_CLOSED: "settlement.period.closed",
  SETTLEMENT_BATCH_CALCULATED: "settlement.batch.calculated",
  SETTLEMENT_PAYOUT_INITIATED: "settlement.payout.initiated",
  SETTLEMENT_PAYOUT_COMPLETED: "settlement.payout.completed",

  // Customers & Parties Domain
  CUSTOMER_CREATED: "customer.created",
  CUSTOMER_UPDATED: "customer.updated",
  CUSTOMER_BLACKLISTED: "customer.blacklisted",

  // Subscriptions & Tenancy Domain
  SUBSCRIPTION_PLAN_CHANGED: "subscription.plan.changed",
  SUBSCRIPTION_RENEWED: "subscription.renewed",
  SUBSCRIPTION_PAST_DUE: "subscription.past_due",
  SUBSCRIPTION_CANCELLED: "subscription.cancelled",
  TENANT_PROVISIONED: "tenant.provisioned",
  TENANT_SUSPENDED: "tenant.suspended",

  // Secure Files & Documents Domain (Sprint 27)
  FILE_UPLOAD_INITIATED: "file.upload_initiated",
  FILE_UPLOADED: "file.uploaded",
  FILE_SCAN_REQUESTED: "file.scan_requested",
  FILE_SCAN_COMPLETED: "file.scan_completed",
  FILE_AVAILABLE: "file.available",
  FILE_REJECTED: "file.rejected",
  DOCUMENT_CREATED: "document.created",
  DOCUMENT_VERSION_CREATED: "document.version_created",
  DOCUMENT_ARCHIVED: "document.archived",

  // Media & Image Processing Domain (Sprint 28)
  MEDIA_PROCESSING_REQUESTED: "media.processing.requested",
  MEDIA_PROCESSING_STARTED: "media.processing.started",
  MEDIA_DERIVATIVE_CREATED: "media.derivative.created",
  MEDIA_PROCESSING_COMPLETED: "media.processing.completed",
  MEDIA_PROCESSING_FAILED: "media.processing.failed",
  MEDIA_REGENERATED: "media.regenerated",
  MEDIA_PUBLISHED: "media.published",
  MEDIA_UNPUBLISHED: "media.unpublished",

  // Website CMS, Branding & Public Engine Domain (Sprint 29)
  WEBSITE_INITIALIZED: "website.initialized",
  WEBSITE_DRAFT_UPDATED: "website.draft_updated",
  WEBSITE_PUBLISHED: "website.published",
  WEBSITE_UNPUBLISHED: "website.unpublished",
  WEBSITE_MAINTENANCE_TOGGLED: "website.maintenance_toggled",
  WEBSITE_PAGE_CREATED: "website.page.created",
  WEBSITE_PAGE_UPDATED: "website.page.updated",
  WEBSITE_PAGE_DELETED: "website.page.deleted",
  WEBSITE_DOMAIN_REGISTERED: "website.domain.registered",
  WEBSITE_DOMAIN_VERIFIED: "website.domain.verified",
  WEBSITE_DOMAIN_VERIFICATION_FAILED: "website.domain.verification_failed",
  WEBSITE_DOMAIN_PRIMARY_SET: "website.domain.primary_set",
  WEBSITE_DOMAIN_REMOVED: "website.domain.removed",
  WEBSITE_DOMAIN_TLS_UPDATED: "website.domain.tls_updated",
  WEBSITE_ROLLBACK_EXECUTED: "website.rollback_executed",

  // Notifications & Communication Orchestration (Sprint 32)
  NOTIFICATION_CREATED: "notification.created",
  NOTIFICATION_QUEUED: "notification.queued",
  NOTIFICATION_SENT: "notification.sent",
  NOTIFICATION_DELIVERED: "notification.delivered",
  NOTIFICATION_FAILED: "notification.failed",
  NOTIFICATION_SUPPRESSED: "notification.suppressed",
  NOTIFICATION_BOUNCED: "notification.bounced",

  // Leads, Sales Quotes & CRM Pipeline (Sprint 33)
  CRM_LEAD_CREATED: "crm.lead.created",
  CRM_LEAD_ASSIGNED: "crm.lead.assigned",
  CRM_LEAD_QUALIFIED: "crm.lead.qualified",
  CRM_LEAD_STAGE_CHANGED: "crm.lead.stage_changed",
  CRM_LEAD_LOST: "crm.lead.lost",
  CRM_LEAD_DISQUALIFIED: "crm.lead.disqualified",
  CRM_LEAD_CONVERTED: "crm.lead.converted",
  CRM_SALES_QUOTE_CREATED: "crm.quote.created",
  CRM_SALES_QUOTE_VERSION_CREATED: "crm.quote.version_created",
  CRM_SALES_QUOTE_SENT: "crm.quote.sent",
  CRM_SALES_QUOTE_VIEWED: "crm.quote.viewed",
  CRM_SALES_QUOTE_ACCEPTED: "crm.quote.accepted",
  CRM_SALES_QUOTE_REJECTED: "crm.quote.rejected",
  CRM_SALES_QUOTE_EXPIRED: "crm.quote.expired",
  CRM_SALES_QUOTE_SUPERSEDED: "crm.quote.superseded",
  CRM_SALES_QUOTE_CONVERTED: "crm.quote.converted",
  CRM_SALES_QUOTE_CANCELLED: "crm.quote.cancelled",
  CRM_ACTIVITY_CREATED: "crm.activity.created",
  CRM_TASK_CREATED: "crm.task.created",
  CRM_TASK_COMPLETED: "crm.task.completed",
  CRM_TASK_RESCHEDULED: "crm.task.rescheduled",
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES] | string;

// ----------------------------------------------------------------------------
// DOMAIN EVENT DATA CONTRACTS
// ----------------------------------------------------------------------------

// 1. Fleet
export interface VehicleCreatedEventData {
  vehicleId: string;
  registrationPlate: string;
  dailyRate: number;
  ownerId: string;
  make?: string;
  model?: string;
  category?: string;
}

export interface VehicleUpdatedEventData {
  vehicleId: string;
  registrationPlate?: string;
  dailyRate?: number;
  status?: string;
  category?: string;
}

export interface VehicleStatusChangedEventData {
  vehicleId: string;
  previousStatus: string;
  newStatus: string;
  reason?: string;
}

export interface VehicleOdometerUpdatedEventData {
  vehicleId: string;
  previousOdometer: number;
  newOdometer: number;
  source: string;
}

export interface VehicleDecommissionedEventData {
  vehicleId: string;
  decommissionReason: string;
  decommissionedAt: string;
}

// 2. Bookings
export interface BookingConfirmedEventData {
  bookingId: string;
  bookingNumber: string;
  vehicleId: string;
  customerId: string;
  grossTotal: number;
  depositStatus: string;
}

export interface BookingCreatedEventData {
  bookingId: string;
  bookingNumber: string;
  vehicleId: string;
  customerId: string;
  startDate: string;
  endDate: string;
  totalAmount: number;
}

export interface BookingCancelledEventData {
  bookingId: string;
  bookingNumber: string;
  cancellationReason?: string;
  cancelledAt: string;
}

export interface BookingExpiredEventData {
  bookingId: string;
  bookingNumber: string;
  expiredAt: string;
}

export interface BookingAmendedEventData {
  bookingId: string;
  bookingNumber: string;
  previousEndDate: string;
  newEndDate: string;
  differenceAmount: number;
}

export interface BookingActivatedEventData {
  bookingId: string;
  bookingNumber: string;
  rentalId: string;
  vehicleId: string;
  activatedAt: string;
}

// 3. Rentals
export interface RentalDispatchedEventData {
  rentalId: string;
  rentalNumber: string;
  bookingId: string;
  vehicleId: string;
  checkoutOdometer: number;
}

export interface ContractGeneratedEventData {
  contractId: string;
  contractNumber: string;
  bookingId: string;
  customerId: string;
  vehicleId: string;
  contractVersion: number;
}

export interface ContractSignedEventData {
  contractId: string;
  contractNumber: string;
  signerType: string;
  signerId: string;
  signerName: string;
  signatureMethod: string;
  isFullySigned: boolean;
}

export interface HandoverScheduledEventData {
  handoverId: string;
  handoverNumber: string;
  bookingId: string;
  contractId: string;
  vehicleId: string;
  scheduledAt: string;
}

export interface HandoverCompletedEventData {
  handoverId: string;
  handoverNumber: string;
  bookingId: string;
  contractId: string;
  vehicleId: string;
  checkoutOdometer: number;
  checkoutFuelLevel: number;
  completedAt: string;
}

export interface RentalStartedEventData {
  rentalId: string;
  rentalNumber: string;
  bookingId: string;
  contractId: string;
  handoverId: string;
  vehicleId: string;
  customerId: string;
  primaryDriverId: string;
  startedAt: string;
  scheduledReturnAt: string;
  startOdometer: number;
  startFuelLevel: number;
}

export interface RentalReturnedEventData {
  rentalId: string;
  rentalNumber: string;
  vehicleId: string;
  returnOdometer: number;
  returnFuelLevel: number;
  returnedAt: string;
}

export interface RentalCompletedEventData {
  rentalId: string;
  rentalNumber: string;
  finalInvoiceId?: string;
  depositRefunded: number;
  completedAt: string;
}

// 4. Inspections & Damage
export interface InspectionCompletedEventData {
  inspectionId: string;
  rentalId?: string;
  vehicleId: string;
  inspectionType: "CHECK_OUT" | "CHECK_IN" | "MAINTENANCE" | "ROUTINE";
  inspectorId: string;
  odometerReading: number;
  fuelLevel: number;
  hasDamage: boolean;
  damageCount: number;
}

export interface DamageReportedEventData {
  damageId: string;
  vehicleId: string;
  inspectionId?: string;
  severity: "MINOR" | "MODERATE" | "SEVERE";
  estimatedRepairCost: number;
  description: string;
}

export interface DamageRepairedEventData {
  damageId: string;
  vehicleId: string;
  actualCost: number;
  repairedAt: string;
}

// 5. Maintenance
export interface MaintenanceScheduledEventData {
  maintenanceId: string;
  vehicleId: string;
  maintenanceType: string;
  scheduledDate: string;
  estimatedDurationHours: number;
}

export interface MaintenanceStartedEventData {
  maintenanceId: string;
  vehicleId: string;
  startedAt: string;
}

export interface MaintenanceCompletedEventData {
  maintenanceId: string;
  vehicleId: string;
  cost: number;
  completedAt: string;
}

// 6. Compliance
export interface ComplianceDocumentExpiredEventData {
  documentId: string;
  entityType: "VEHICLE" | "DRIVER" | "CUSTOMER";
  entityId: string;
  documentType: string;
  expiredAt: string;
}

export interface ComplianceOverrideGrantedEventData {
  overrideId: string;
  requirementId: string;
  vehicleId?: string;
  driverId?: string;
  grantedBy: string;
  reason: string;
}

// 7. Billing & Invoicing
export interface InvoiceIssuedEventData {
  invoiceId: string;
  invoiceNumber: string;
  recipientId: string;
  totalAmount: number;
  currency: string;
  dueDate: string;
  lineItemsCount: number;
}

export interface InvoicePaidEventData {
  invoiceId: string;
  invoiceNumber: string;
  totalAmount: number;
  paidAt: string;
  paymentId?: string;
}

export interface CreditNoteIssuedEventData {
  creditNoteId: string;
  creditNoteNumber: string;
  invoiceId: string;
  amount: number;
  currency: string;
}

// 8. Payments & Refunds
export interface PaymentIntentCreatedEventData {
  intentId: string;
  amount: number;
  currency: string;
  customerId: string;
  provider: string;
}

export interface PaymentAttemptedEventData {
  attemptId: string;
  paymentId?: string;
  amount: number;
  currency: string;
  provider: string;
  channel: string;
}

export interface PaymentSucceededEventData {
  paymentId: string;
  paymentNumber: string;
  amount: number;
  currency: string;
  providerReference: string;
  obligationId?: string;
  paidAt?: string;
}

export interface PaymentFailedEventData {
  attemptId: string;
  amount: number;
  currency: string;
  provider: string;
  failureReason: string;
  errorCode?: string;
}

export interface RefundInitiatedEventData {
  refundId: string;
  paymentId: string;
  amount: number;
  currency: string;
  reason: string;
}

export interface RefundCompletedEventData {
  refundId: string;
  paymentId: string;
  amount: number;
  currency: string;
  providerReference: string;
  completedAt: string;
}

// 9. Ledger
export interface JournalEntryPostedEventData {
  journalEntryId: string;
  entryNumber: string;
  transactionType: string;
  sourceDocumentType: string;
  sourceDocumentId: string;
  totalDebits: number;
  totalCredits: number;
  postedAt: string;
}

// 10. Settlements
export interface SettlementPeriodClosedEventData {
  periodId: string;
  periodName: string;
  startDate: string;
  endDate: string;
  closedAt: string;
}

export interface SettlementBatchCalculatedEventData {
  batchId: string;
  periodId: string;
  totalAmount: number;
  ownerPayablesCount: number;
}

export interface SettlementPayoutCompletedEventData {
  payoutId: string;
  batchId: string;
  ownerId: string;
  amount: number;
  payoutMethod: string;
  completedAt: string;
}

// 11. Customers
export interface CustomerCreatedEventData {
  customerId: string;
  name: string;
  email: string;
  phone?: string;
  isCorporate: boolean;
}

export interface CustomerUpdatedEventData {
  customerId: string;
  name?: string;
  email?: string;
  phone?: string;
}

export interface CustomerBlacklistedEventData {
  customerId: string;
  reason: string;
  blacklistedBy: string;
  blacklistedAt: string;
}

// 12. Subscriptions & Tenancy
export interface SubscriptionPlanChangedEventData {
  subscriptionId: string;
  tenantId: string;
  previousPlanId: string;
  newPlanId: string;
  effectiveDate: string;
}

export interface TenantProvisionedEventData {
  tenantId: string;
  tenantName: string;
  planId: string;
  adminUserId: string;
  provisionedAt: string;
}

// 13. Secure Files & Documents (Sprint 27)
export interface FileUploadInitiatedEventData {
  fileId: string;
  uploadSessionId: string;
  tenantId: string;
  resourceType: string;
  resourceId: string;
  resourceRole: string;
  originalFilename: string;
  declaredContentType: string;
  maxSizeBytes: number;
  initiatedBy: string;
}

export interface FileUploadedEventData {
  fileId: string;
  uploadSessionId: string;
  tenantId: string;
  objectKey: string;
  sizeBytes: number;
  checksumSha256?: string;
  uploadedBy: string;
}

export interface FileScanRequestedEventData {
  fileId: string;
  tenantId: string;
  objectKey: string;
  sizeBytes: number;
  contentType: string;
  attempt: number;
}

export interface FileScanCompletedEventData {
  fileId: string;
  tenantId: string;
  scanStatus: "CLEAN" | "INFECTED" | "ERROR" | "SKIPPED";
  scannerEngine: string;
  findings?: string[];
  durationMs: number;
}

export interface FileAvailableEventData {
  fileId: string;
  tenantId: string;
  resourceType: string;
  resourceId: string;
  resourceRole: string;
  sizeBytes: number;
  checksumSha256?: string;
}

export interface FileRejectedEventData {
  fileId: string;
  tenantId: string;
  reason: string;
  scanStatus?: string;
  rejectedAt: string;
}

export interface DocumentCreatedEventData {
  documentId: string;
  tenantId: string;
  documentType: string;
  resourceType: string;
  resourceId: string;
  currentVersionNumber: number;
  fileId: string;
  createdBy: string;
}

export interface DocumentVersionCreatedEventData {
  documentId: string;
  tenantId: string;
  versionNumber: number;
  fileId: string;
  changeReason?: string;
  uploadedBy: string;
}

export interface DocumentArchivedEventData {
  documentId: string;
  tenantId: string;
  reason: string;
  archivedBy: string;
  archivedAt: string;
}

// Media & Image Processing Event Payloads (Sprint 28)
export interface MediaProcessingRequestedEventData {
  requestId: string;
  tenantId: string;
  sourceFileId: string;
  profileName: string;
  profileVersion: number;
  requestedVariants: string[];
}

export interface MediaProcessingStartedEventData {
  requestId: string;
  tenantId: string;
  sourceFileId: string;
  profileName: string;
  profileVersion: number;
}

export interface MediaDerivativeCreatedEventData {
  derivativeId: string;
  mediaAssetId: string;
  tenantId: string;
  sourceFileId: string;
  profileName: string;
  profileVersion: number;
  variantName: string;
  format: string;
  width: number;
  height: number;
  sizeBytes: number;
  isPublic: boolean;
  objectKey: string;
}

export interface MediaProcessingCompletedEventData {
  requestId: string;
  mediaAssetId: string;
  tenantId: string;
  sourceFileId: string;
  profileName: string;
  profileVersion: number;
  generatedVariantsCount: number;
  durationMs: number;
}

export interface MediaProcessingFailedEventData {
  requestId: string;
  tenantId: string;
  sourceFileId: string;
  profileName: string;
  profileVersion: number;
  errorCode: string;
  errorMessage: string;
  attemptsMade: number;
}

export interface MediaRegeneratedEventData {
  mediaAssetId: string;
  tenantId: string;
  sourceFileId: string;
  targetProfileName: string;
  targetVersion: number;
  regeneratedVariantsCount: number;
}

export interface MediaPublishedEventData {
  mediaAssetId: string;
  tenantId: string;
  sourceFileId: string;
  profileName: string;
  publishedAt: string;
}

export interface MediaUnpublishedEventData {
  mediaAssetId: string;
  tenantId: string;
  sourceFileId: string;
  unpublishedAt: string;
}

// ----------------------------------------------------------------------------
// 19. Website CMS, Branding & Public Engine Domain (Sprint 29)
// ----------------------------------------------------------------------------
export interface WebsiteInitializedEventData {
  websiteId: string;
  tenantId: string;
  subdomain: string;
  initializedAt: string;
}

export interface WebsiteDraftUpdatedEventData {
  websiteId: string;
  tenantId: string;
  updatedFields: string[];
  updatedAt: string;
}

export interface WebsitePublishedEventData {
  websiteId: string;
  tenantId: string;
  snapshotId: string;
  versionNumber: number;
  publishedByUserId: string;
  changeSummary: string;
  publishedAt: string;
}

export interface WebsiteUnpublishedEventData {
  websiteId: string;
  tenantId: string;
  unpublishedAt: string;
}

export interface WebsiteMaintenanceToggledEventData {
  websiteId: string;
  tenantId: string;
  isMaintenanceMode: boolean;
  maintenanceMessage?: string;
  toggledAt: string;
}

export interface WebsitePageCreatedEventData {
  pageId: string;
  websiteId: string;
  tenantId: string;
  slug: string;
  title: string;
  pageType: string;
  createdAt: string;
}

export interface WebsitePageUpdatedEventData {
  pageId: string;
  websiteId: string;
  tenantId: string;
  slug: string;
  updatedAt: string;
}

export interface WebsitePageDeletedEventData {
  pageId: string;
  websiteId: string;
  tenantId: string;
  slug: string;
  deletedAt: string;
}

export interface WebsiteDomainRegisteredEventData {
  domainId: string;
  websiteId: string;
  tenantId: string;
  hostname: string;
  type: string;
  verificationToken: string;
  registeredAt: string;
}

export interface WebsiteDomainVerifiedEventData {
  domainId: string;
  websiteId: string;
  tenantId: string;
  hostname: string;
  verifiedAt: string;
}

export interface WebsiteDomainVerificationFailedEventData {
  domainId: string;
  websiteId: string;
  tenantId: string;
  hostname: string;
  failureReason: string;
  failedAt: string;
}

export interface WebsiteDomainPrimarySetEventData {
  domainId: string;
  websiteId: string;
  tenantId: string;
  hostname: string;
  updatedAt: string;
}

export interface WebsiteDomainTlsUpdatedEventData {
  domainId: string;
  websiteId: string;
  tenantId: string;
  hostname: string;
  sslStatus: string;
  updatedAt: string;
}

export interface WebsiteDomainRemovedEventData {
  domainId: string;
  websiteId: string;
  tenantId: string;
  hostname: string;
  removedAt: string;
}

export interface WebsiteRollbackExecutedEventData {
  websiteId: string;
  tenantId: string;
  targetVersionNumber: number;
  rolledBackByUserId: string;
  executedAt: string;
}

// 18. Notifications (Sprint 32)
export interface NotificationCreatedEventData {
  notificationId: string;
  tenantId: string;
  channel: string;
  category: string;
  recipient: string;
  templateKey?: string;
  idempotencyKey: string;
  correlationId?: string;
}

export interface NotificationQueuedEventData {
  notificationId: string;
  tenantId: string;
  channel: string;
  recipient: string;
  priority: string;
  scheduledFor?: string;
}

export interface NotificationSentEventData {
  notificationId: string;
  tenantId: string;
  channel: string;
  recipient: string;
  provider: string;
  providerMessageId?: string;
  attempts: number;
  sentAt: string;
}

export interface NotificationDeliveredEventData {
  notificationId: string;
  tenantId: string;
  channel: string;
  recipient: string;
  provider: string;
  providerMessageId: string;
  deliveredAt: string;
}

export interface NotificationFailedEventData {
  notificationId: string;
  tenantId: string;
  channel: string;
  recipient: string;
  error: string;
  attempts: number;
  isTerminal: boolean;
}

export interface NotificationSuppressedEventData {
  tenantId: string;
  channel: string;
  recipient: string;
  category: string;
  reason: string;
}


