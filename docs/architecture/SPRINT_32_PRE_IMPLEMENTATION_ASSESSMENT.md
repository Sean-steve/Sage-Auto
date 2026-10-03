# CAR HIRE OS — SPRINT 32 PRE-IMPLEMENTATION ASSESSMENT
## NOTIFICATIONS, COMMUNICATION ORCHESTRATION, EMAIL, SMS, WHATSAPP, DELIVERY RECEIPTS, TEMPLATES, PREFERENCES & COMMUNICATION RELIABILITY

**Document Identifier:** DOC-SPRINT-32-ASSESSMENT  
**Status:** APPROVED & READY FOR IMPLEMENTATION  
**Author:** Principal Platform Architect & Antigravity Engineering  
**Governing Architecture Standards:** ARCH-001, SEC-001, TEN-001, DEV-001, DEV-004, DEV-006, DEV-007, DEV-008, DEV-009, DEV-010, DEV-011, BRS-001, BRS-002, BRS-003, ADR-001, ADR-009  

---

### EXECUTIVE SUMMARY

Sprint 32 delivers the enterprise notification and communication orchestration platform for Car Hire OS. Building directly upon:
- Monorepo & Transactional Foundations (Sprints 1–4),
- RBAC, Entitlements & Subscription Policies (Sprints 5–8),
- Fleet, Availability, Bookings & Rentals (Sprints 9–14),
- Double-Entry Finance & Canonical Payments (Sprints 19–23),
- Transactional Outbox & Canonical Domain Events (Sprint 25/26),
- Secure Files & Media Assets (Sprints 27–28), and
- Multi-Tenant Websites & Host Resolution (Sprints 29–31),

Sprint 32 bridges the critical gap between domain event mutations and outward multi-channel communication (Email, SMS, WhatsApp). In strict adherence to Car Hire OS architectural principles:
1. **Domain Events are NOT Notifications:** Domains emit past-tense immutable facts (`booking.reservation.confirmed`, `payment.succeeded`, `rental.handover.completed`). The Notification Policy Orchestrator evaluates policy, preferences, suppression, and entitlements to issue deduplicated `NotificationIntent` records.
2. **Provider API Acceptance is NOT Delivery:** The system explicitly distinguishes between `QUEUED`, `SENDING`, `PROVIDER_ACCEPTED`, `DELIVERED`, `FAILED`, `BOUNCED`, and `SUPPRESSED`.
3. **Background Delivery is At-Least-Once & Idempotent:** Every message has a deterministic idempotency key, preventing duplicate SMS/email/WhatsApp transmissions during worker crashes or network retries.
4. **Provider Isolation:** Direct vendor coupling (SendGrid, Twilio, Africa's Talking, Meta Cloud API) is strictly prohibited in business logic; all transport occurs via pluggable `INotificationProvider` adapters.
5. **Canonical Domain Links:** Notification hyperlinks leverage the authoritative domain architecture from Sprints 29/30 (`HostResolutionService`), generating authentic tenant-branded URLs.

---

### PRE-IMPLEMENTATION CHECKLIST & DISCOVERY (ITEMS 1–46)

#### 1. Canonical Notification Bounded Context
A dedicated bounded context `NotificationModule` is established within `apps/api/src/modules/notifications/`, paired with database schema/repositories in `packages/database`, contracts in `packages/contracts`, types in `packages/types`, background workers in `apps/worker`, and a unified management console in `apps/tenant-admin`.

#### 2. Domain Events vs Notifications Separation
Domain aggregates never invoke communication ports directly. Mutation methods write domain events into the Transactional Outbox. The Outbox Relay pushes events to the EventBus, where the `NotificationPolicyConsumer` evaluates whether an event warrants outward communication.

#### 3. Outbox and Event-Driven Ingestion
All communications originate from authoritative domain events (`EVENT_TYPES`). The event payload, tenant context, correlation ID, and causation ID are captured without bypassing the database transaction.

#### 4. Notification Intent and Life Cycle
A `NotificationIntent` aggregate represents the desire to communicate. It transitions through: `PENDING` -> `QUEUED` -> `SENDING` -> `PROVIDER_ACCEPTED` -> `DELIVERED` (or `FAILED`, `BOUNCED`, `REJECTED`, `SUPPRESSED`).

#### 5. Background Queue and BullMQ Topology
Queue `carhire.notifications` handles asynchronous processing. Jobs carry `notificationId`, `tenantId`, `channel`, `recipient`, and `attemptNumber`. Concurrency, rate limits, backoff, and DLQ (`carhire.dlq`) are enforced.

#### 6. Multi-Channel Support (Email, SMS, WhatsApp)
Three canonical channels are supported:
- `EMAIL`: HTML & plaintext multipart rendering, MIME headers, DKIM/SPF tenant alignment.
- `SMS`: Character counting, GSM-7/Unicode segment calculation, E.164 normalization.
- `WHATSAPP`: Template name, namespace, language code, component parameters compliant with WhatsApp Cloud API specs.

#### 7. Delivery Receipt & Provider Webhook Ingestion
Public webhook ingress (`/api/v1/webhooks/notifications/:provider`) receives asynchronous delivery receipts from providers, validates signatures, correlates `providerMessageId` to the internal notification, and logs `NotificationReceiptRecord`.

#### 8. At-Least-Once Delivery & Worker Idempotency
Each delivery attempt calculates an `idempotencyKey = sha256(tenantId:channel:recipient:templateId:correlationId)`. A distributed idempotency repository prevents duplicate provider API invocations.

#### 9. Template Engine & Variable Interpolation
A secure template engine parses double-bracket tokens `{{variable}}` with strict HTML-escaping, nested path resolution (`{{booking.reference}}`), and fallback defaults. Script injection or arbitrary code execution is strictly prevented.

#### 10. Default System Templates
Pre-seeded, localized default system templates are provided for all canonical lifecycle events:
- Booking Confirmation, Cancellation, Expiry, Reminder
- Rental Agreement Ready, Dispatch, Return Reminder
- Invoice Issued, Payment Receipt, Payment Failed
- Security Password Reset, Email Verification

#### 11. Tenant Template Overrides & Branding
Tenants can customize template subjects, bodies, header/footer branding, and call-to-action colors while inheriting system-level fallback safeguards.

#### 12. Recipient Communication Preferences & Opt-In/Opt-Out
Customers and drivers have granular preference matrices by category (`TRANSACTIONAL`, `OPERATIONAL`, `SECURITY`, `MARKETING`) and channel (`EMAIL`, `SMS`, `WHATSAPP`).

#### 13. Category Distinction (Transactional, Operational, Security, Marketing)
- `TRANSACTIONAL`: Critical customer actions (booking, payments, contracts); bypasses marketing opt-outs.
- `OPERATIONAL`: Fleet, maintenance, and vehicle owner notifications.
- `SECURITY`: Password reset, MFA, login alerts; non-suppressible except on invalid address.
- `MARKETING`: Subject to explicit opt-in, mandatory unsubscribe headers (List-Unsubscribe), and opt-out links.

#### 14. Suppression List Management
Tenant-isolated and global suppression lists track bounces (hard/soft), spam complaints, unsubscriptions, and manual blocks with automated delivery pre-filtering.

#### 15. Canonical Website Domain Link Generation
All links embedded in emails/SMS (e.g. `/booking/view/:id`, `/portal/contracts/:id`) are computed using `HostResolutionService` from Sprints 29–31, ensuring custom domain or verified subdomain resolution instead of internal origin addresses.

#### 16. Provider Abstraction Architecture
`INotificationProvider` defines `sendEmail()`, `sendSms()`, and `sendWhatsApp()`. Pluggable implementations include:
- `MockNotificationProvider`: In-memory development/test provider with capture inspection.
- `SendGridEmailProvider` / `SmtpEmailProvider`: Production email adapters.
- `TwilioSmsProvider` / `AfricasTalkingSmsProvider`: E.164 SMS adapters with alphanumeric sender ID.
- `WhatsAppCloudApiProvider`: Meta Business Cloud API adapter.

#### 17. Tenant Multi-Tenancy & TenantContext Enforcement
Every notification, template, preference, and receipt is strictly partitioned by `tenantId`. Tenant context is validated in all API routes and background worker jobs.

#### 18. Existing Identity Email Transport Migration
Sprint 3 `DevelopmentEmailDeliveryAdapter` in `apps/api/src/modules/identity/` is unified with the canonical notification platform. Password reset and verification emails become `SECURITY` category notifications with zero token exposure in logs.

#### 19. Security: Credential & Secret Protection
Provider API keys (SendGrid API key, Twilio Auth Token, WhatsApp System Token) are encrypted or sourced from environment configuration. Raw secret keys are never exposed over tenant APIs.

#### 20. Sensitive Data Masking & PII Redaction
Recipient phone numbers and email addresses are masked in audit logs and tenant-admin summary lists (e.g. `j***e@domain.com`, `+254 7****123`).

#### 21. Rate Limiting & Provider Throttling
Tenant-level and provider-level token bucket rate limiters prevent provider quota exhaustion and protect against accidental loop broadcasts.

#### 22. Dead Letter Queue & Poison Pill Isolation
Unrecoverable errors (e.g. invalid recipient syntax, template syntax error) fail immediately without useless retries. Transient errors (network timeout, 429, 503) retry with exponential backoff before landing in `carhire.dlq`.

#### 23. Retry Policies & Exponential Backoff
Transient failures utilize exponential backoff (e.g. 1m, 5m, 15m, 1h) capped at 5 attempts, with jitter to prevent thundering herd problems.

#### 24. Notification Audit Logs
Every notification intent mutation and delivery receipt produces an audit log record with timestamps, provider response codes, and operator causation.

#### 25. Database Schema & PostgreSQL Migration
New migration `20260911_012_notifications_and_communication_orchestration.sql` provisions:
- `notifications`
- `notification_receipts`
- `notification_templates`
- `communication_preferences`
- `notification_suppressions`
- `notification_provider_configs`

#### 26. Database Repositories
Interfaces and production/in-memory implementations:
- `INotificationRepository`
- `INotificationReceiptRepository`
- `INotificationTemplateRepository`
- `ICommunicationPreferenceRepository`
- `INotificationSuppressionRepository`

#### 27. Contracts & Event Catalog Extension
`packages/contracts/src/events.contract.ts` and `jobs.contract.ts` updated with:
- `notification.created`, `notification.queued`, `notification.sent`, `notification.delivered`, `notification.failed`, `notification.suppressed`
- Queue names and job payload contracts.

#### 28. Types & Shared Interfaces
`packages/types/src/index.ts` expanded with comprehensive notification domain entities, enums, DTOs, and view models.

#### 29. Notification Policy Orchestrator
Maps canonical domain events to target recipients:
- `booking.reservation.confirmed` -> Customer email & WhatsApp confirmation
- `booking.reservation.cancelled` -> Customer cancellation notice
- `rental.handover.completed` -> Customer rental receipt & return inspection link
- `billing.invoice.issued` -> Customer invoice notice with payment link
- `payment.succeeded` -> Customer payment receipt
- `compliance.document.expired` -> Fleet operator operational alert
- `maintenance.scheduled` -> Service provider work order notice

#### 30. Notification Intent Deduplication
Correlation IDs and event IDs prevent duplicate notification intent creation if domain events are replayed or duplicate outbox messages are delivered.

#### 31. Multi-Language & Localization
Templates support ISO language codes (e.g., `en`, `sw`, `fr`) with automatic fallback to tenant default language (`en`).

#### 32. Email Rendering & Styling
Responsive, cross-client email markup with clean typography, branded primary buttons, company header, and footer compliance disclosures.

#### 33. SMS Splitting & Concatenation Warning
SMS content engine calculates message character count, warns on multipart concatenation (>160 GSM-7 or >70 Unicode characters), and validates GSM-7 character sets.

#### 34. WhatsApp Message Templates
Enforces WhatsApp Cloud API constraints: pre-approved template names, category classification (`UTILITY`, `AUTHENTICATION`, `MARKETING`), and variable mapping.

#### 35. Public Webhook Security
Webhook endpoint verifies HMAC signatures (e.g. Twilio signature, SendGrid webhook signature, Meta X-Hub-Signature-256) before processing delivery payloads.

#### 36. Tenant Admin UI: Notification Center
Tenant admin dashboard features:
- Overview metrics (Sent, Delivered, Open/Click Rate, Bounce Rate)
- Real-time Delivery Log with filter by channel, status, recipient, date
- Template Editor with live preview and variable picker
- Channel Configuration (Email, SMS, WhatsApp provider toggles)
- Suppression & Unsubscribe list management

#### 37. Super Admin & Platform Visibility
Platform administrators have visibility across aggregate provider health, deliverability rates, and cross-tenant failure spikes.

#### 38. Performance & Asynchronous Non-Blocking
Event consumption and notification creation execute asynchronously; no user API request blocks on third-party provider latency.

#### 39. Mock Transport for CI/CD & Local Development
`MockNotificationProvider` allows full end-to-end integration testing and frontend verification without live API keys or billable provider charges.

#### 40. Entitlements & Subscription Tier Gating
Notification features are gated by tenant plan (e.g. WhatsApp channel requires Business tier; custom SMS sender ID requires Enterprise tier).

#### 41. Cost Protection & Quotas
Tenants have monthly SMS and WhatsApp volume quotas based on their active subscription plan to prevent billing runaway.

#### 42. Compliance & Legal Disclosures
All commercial and transactional communications include mandatory legal disclosures, registered business name, and physical address.

#### 43. Unsubscribe Token Generation & Handling
One-click unsubscribe links with tamper-proof HMAC tokens allow recipients to manage marketing preferences without logging in.

#### 44. Public-Web Integration
Public checkout in `apps/public-web` seamlessly triggers real-time booking confirmation emails upon successful reservation or M-Pesa STK push.

#### 45. Health Checks & Provider Readiness
Health check endpoint `/api/health` includes notification queue health and provider connectivity status.

#### 46. Backward Compatibility & Zero Regressions
Existing database repositories, domain tests, and API routes continue operating without disruption; notification listeners attach non-invasively via EventBus.

---
