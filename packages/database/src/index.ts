// ============================================================================
// CAR HIRE OS — DATABASE PACKAGE PUBLIC API
// ============================================================================

export * from "./errors";
export * from "./transaction-manager";
export * from "./health";
export * from "./migration-engine";
export * from "./repositories/tenant.repository";
export * from "./repositories/tenant-settings.repository";
export * from "./repositories/tenant-membership.repository";
export * from "./repositories/user.repository";
export * from "./repositories/auth-session.repository";
export * from "./repositories/password-reset-token.repository";
export * from "./repositories/email-verification-token.repository";
export * from "./repositories/outbox.repository";
export * from "./repositories/event-consumption.repository";
export * from "./repositories/idempotency.repository";
export * from "./repositories/webhook.repository";
export * from "./repositories/audit.repository";
export * from "./repositories/role.repository";
export { InMemoryRoleRepository as RoleRepository } from "./repositories/role.repository";
export * from "./repositories/tenant-membership-role.repository";
export { InMemoryTenantMembershipRoleRepository as TenantMembershipRoleRepository } from "./repositories/tenant-membership-role.repository";
export * from "./repositories/platform-role.repository";
export { InMemoryPlatformRoleRepository as PlatformRoleRepository } from "./repositories/platform-role.repository";
export * from "./repositories/platform-membership.repository";
export { InMemoryPlatformMembershipRepository as PlatformMembershipRepository } from "./repositories/platform-membership.repository";
export * from "./repositories/support-access-session.repository";
export { InMemorySupportAccessSessionRepository as SupportAccessSessionRepository } from "./repositories/support-access-session.repository";
export * from "./repositories/plan.repository";
export * from "./repositories/subscription.repository";
export * from "./repositories/subscription-status-history.repository";
export * from "./repositories/billing-account.repository";
export * from "./repositories/saas-billing-invoice.repository";
export * from "./repositories/saas-payment-record.repository";
export * from "./repositories/feature.repository";
export * from "./repositories/plan-feature.repository";
export * from "./repositories/tenant-entitlement.repository";
export * from "./repositories/entitlement-override.repository";
export * from "./repositories/entitlement-restriction.repository";
export * from "./repositories/entitlement-usage.repository";
export * from "./repositories/feature-flag.repository";
export * from "./repositories/vehicle.repository";
export * from "./repositories/vehicle-owner.repository";
export * from "./repositories/vehicle-ownership.repository";
export * from "./repositories/vehicle-category.repository";
export * from "./repositories/vehicle-document.repository";
export * from "./repositories/customer.repository";
export * from "./repositories/corporate-account.repository";
export * from "./repositories/driver.repository";
export * from "./repositories/agent.repository";
export * from "./repositories/party-document.repository";
export * from "./repositories/rate-plan.repository";
export * from "./repositories/promo-code.repository";
export * from "./repositories/pricing-rule.repository";
export * from "./repositories/vehicle-allocation.repository";
export * from "./repositories/vehicle-block.repository";
export * from "./repositories/booking.repository";
export * from "./repositories/contract.repository";
export * from "./repositories/handover.repository";
export * from "./repositories/rental.repository";
export * from "./repositories/inspection-template.repository";
export * from "./repositories/damage.repository";
export * from "./repositories/inspection.repository";
export * from "./repositories/service-provider.repository";
export * from "./repositories/maintenance-schedule.repository";
export * from "./repositories/maintenance.repository";
export * from "./repositories/compliance-requirement.repository";
export * from "./repositories/compliance-record.repository";
export * from "./repositories/compliance-issue.repository";
export * from "./repositories/compliance-override.repository";
export * from "./repositories/operational-invoice.repository";
export * from "./repositories/credit-note.repository";
export * from "./repositories/expense.repository";
export * from "./repositories/deposit-position.repository";
export * from "./repositories/refund-obligation.repository";
export * from "./repositories/ledger-account.repository";
export * from "./repositories/journal-transaction.repository";
export * from "./repositories/journal-entry.repository";
export * from "./repositories/owner-settlement.repository";
export * from "./repositories/owner-settlement-period.repository";
export * from "./repositories/owner-settlement-batch.repository";
export * from "./repositories/payment-attempt.repository";
export * from "./repositories/payment.repository";
export * from "./repositories/payment-allocation.repository";
export * from "./repositories/refund.repository";
export * from "./repositories/payment-reconciliation.repository";

// Secure Files & Documents (Sprint 27)
export * from "./repositories/file.repository";
export * from "./repositories/file-upload-session.repository";
export * from "./repositories/file-scan-record.repository";
export * from "./repositories/document.repository";
export * from "./repositories/document-version.repository";
export * from "./repositories/file-resource-link.repository";
export * from "./repositories/file-access-record.repository";
export * from "./repositories/storage-reconciliation.repository";

// Media & Image Processing (Sprint 28)
export * from "./repositories/media-asset.repository";
export * from "./repositories/media-derivative.repository";
export * from "./repositories/media-processing-request.repository";
export * from "./repositories/media-reconciliation.repository";
export * from "./repositories/vehicle-media.repository";

// Tenant Website CMS & Branding (Sprint 29)
export * from "./repositories/tenant-website.repository";

// Notifications & Communication Orchestration (Sprint 32)
export * from "./repositories/notification.repository";
export * from "./repositories/notification-receipt.repository";
export * from "./repositories/notification-template.repository";
export * from "./repositories/communication-preference.repository";
export * from "./repositories/notification-suppression.repository";
export * from "./repositories/notification-provider-config.repository";

// Leads, Sales Quotes & CRM Pipeline (Sprint 33)
export * from "./repositories/lead.repository";
export * from "./repositories/sales-quote.repository";
export * from "./repositories/crm-activity.repository";
export * from "./repositories/crm-task.repository";
export * from "./repositories/crm-pipeline-stage.repository";

// Tenant Analytics, Metrics & Reporting (Sprint 34)
export * from "./repositories/report-execution.repository";
export * from "./repositories/saved-report.repository";
export * from "./repositories/report-schedule.repository";
export * from "./repositories/reporting-projection.repository";

// Platform SaaS Analytics, Subscriptions & MRR Intelligence (Sprint 35)
export * from "./repositories/platform-snapshot.repository";
export * from "./repositories/mrr-movement.repository";
export * from "./repositories/platform-cohort.repository";
export * from "./repositories/platform-report.repository";

// Backup, Restore & Disaster Recovery Architecture (Sprint 43)
export * from "./backup-and-dr";

// Production Readiness, Acceptance & Launch-Gate Governance (Sprint 44)
export * from "./production-readiness";

// Post-Launch Stabilization, Real-World Reconciliation & Formal V1 Closure (Sprint 47)
export * from "./v1-closure";








export { withRecordTransaction } from "./record-store";
