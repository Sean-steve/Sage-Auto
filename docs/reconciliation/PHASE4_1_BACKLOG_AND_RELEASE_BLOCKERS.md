# Phase 4.1 — Integration Backlog & Release Blockers

**Generated:** 14 Oct 2026 · **Scope:** both repositories, before application code migration. Status values are evidence-bound, not guesses.

## Gate W0 — restore baseline first
The original engineering app's latest CI at base `37ff96b` is RED: 51 passing / 8 failing out of 59 tested. The lint and TypeScript jobs pass, but image build, staging and production promotion were **skipped**. Evidence: https://github.com/Sean-steve/Sage-Auto/actions/runs/38304115430 .

| ID | Failing suite | Actual failure observed in CI logs | Triage required | Exit |
|---|---|---|---|---|
| CI-01 | bookings-and-reservations | Security-deposit escrow expected 30,000 mismatch | Compare authoritative deposit policy against fixture and quote | Booking/deposit tests pass; no financial invariant relaxed |
| CI-02 | bullmq-background-platform | Assertion 0 !== 1 | Check scheduler/event configuration, worker queue and deterministic fixture | Queue count and idempotent worker test green |
| CI-03 | execution1-operational-repairs | Timeout/TTL error text contract mismatch | Confirm actual lock expiration behavior before adjusting message | Lock self-release and regression pass |
| CI-04 | operational-finance-and-invoicing | Return & Final Calculation lifecycle assertion vs ACTIVE_ON_ROAD | Confirm hard financial prerequisite and align client/test behavior | No invoice before authoritative return finalization |
| CI-05 | pricing-experience-contract | Server quote authority not detected | Verify real rate/quote endpoint wiring and diagnostics | Source-of-truth quote integration test passes |
| CI-06 | public-booking-and-checkout | 10% duration discount for >=3 days not applied as expected | Validate promotion policy, currency precision and pricing snapshot | Booking quote equals checkout total |
| CI-07 | rentals-and-return-lifecycle | RentalAlreadyCompletedError on already completed rental | Review transition idempotence and test expectation, never allow replay corruption | Duplicate return handled safely |
| CI-08 | stripe-card-provider-and-lifecycle | Missing backing payable in settlement fixture | Examine payable linkage and provider event order | Provider callback/settlement tests green |

**Rules:** Do not fix any financial failure by changing an expected number without verifying the business requirement. Don't bypass a guard or make CI non-blocking. Preserve test evidence and explain semantic changes in ADRs.

## W1–W12 scoped execution backlog

| ID | Phase | Objective | Source of truth | Deliverables | Exit gate |
|---|---|---|---|---|---|
| P4-01 | W1 | Implement React design-token system from V2 | Canonical `src/components/sage-design-system.css` + V2 `experience-foundation.css` | Token parity, reusable primitives, responsive shell, component storybook/demo | Before/after screenshots, keyboard, contrast, accessible statuses |
| P4-02 | W1 | Secure login, onboarding & permissions | Auth, authorization, tenancy services | Signup/recovery/session/denied states, tokens and role-scoped route guard | Real API + production email sandbox + forbidden tenant test |
| P4-03 | W2 | Company, branches, membership/team settings | Tenant/authorization services | Branch-aware company setup and team UX | Persisted company+branch, expired invite, permission revocation |
| P4-04 | W3 | Asset data model & media | Fleet, owners, files/media | Asset cards/profile and complete original field union + both media upload/reference options | CRUD + file access + readiness and owner links |
| P4-05 | W3 | Compliance, inspections, maintenance readiness | Compliance/maintenance/inspections | Checklists, document expiry, holds and service order UX | Backend blocks unsafe handover/booking |
| P4-06 | W4 | Customers, verification and drivers | Customers/drivers service | Complete people data, verification, roles and driver profiles | Tenant isolation + driver eligibility errors |
| P4-07 | W4 | Pricing Centre/quote lab | Pricing engine | V2 quote UI backed by canonical server quote | Quote snapshot, tax/discount precision and no client authority |
| P4-08 | W5 | Availability planner, allocation | Availability engine + DB constraints | Full grid and named-car conflict/alternatives, booking hold | Concurrent same-car tests and TTL expiry |
| P4-09 | W6 | Booking pipeline and amendments | Bookings/availability/pricing | V2 pipeline and original state transitions, signature/repricing gates | Confirm/cancel/amend without double allocation |
| P4-10 | W6 | Public branded checkout | Public-booking + payments + CRM | Quote, identity, payment intent, enquiry vs confirmed status | Explicit confirmation, idempotent PSP callback |
| P4-11 | W7 | Contracts/inspection/handover | Contracts, inspection, handovers | Full 12 checks, image evidence, no-defect pass, signature, possession event | Block unsafe transitions; driver/renter sync |
| P4-12 | W8 | Active rentals and returns | Rentals/return domain | Vehicle possession, extensions, inspection, final charges | Backend state and financial finalization split |
| P4-13 | W9 | Finance, payments, invoice and deposit | Finance/payments/ledger | V2 reconciliation with old-only transaction and ledger capabilities | Balanced postings, refund failure/retry, PSP recon |
| P4-14 | W10 | Owner settlements | Owner-settlements/ledger/payments | Waterfall, review, approval, verified transfer and statements | No fake paid status; ledgers and agreement rules |
| P4-15 | W11 | External renter/owner/driver portals | Same canonical API contracts | Rebuild V2 distinctive experiences and states in React | 3-role cross-portal workflows, RLS/tenant isolation |
| P4-16 | W11 | Corporate/agent/service partner portals | Corporate, agents, CRM, maintenance | V2 portals with old-only capabilities preserved | Delegation and commission/work-order audit |
| P4-17 | W12 | Tenant website studio, live custom domains | Website/domain/public-booking APIs | Publish/preview domain and CMS editor | Tenant route resolution and unpublish |
| P4-18 | W12 | Platform control plane, revenue/insights | Platform admin, billing, platform analytics | Real subscription MRR, usage, audit, support gate | Source tagged real KPI, reconciliation, permissions |
| P4-19 | W12 | Marketplace future-concept gate | Product policy | Continue future portal without fictitious bookability | Feature gated until business rules and independent providers tested |
| P4-20 | ALL | Parity certification | Both repos and product blueprint | Close screen, endpoint, field, action and journey ledger | 215 screens, 22 end-to-end journeys and full negative tests evidenced |

## No-deletion preservation register

These **original-only or partly represented** capabilities MUST NOT be dropped to fit the V2 aesthetic:
- Tenant membership, server-enforced permissions, support grants and audit history.
- Backend readiness/compliance maintenance locks and all inspection evidence.
- File upload intent, access authorization, virus scan and image processing.
- Refunds, credit notes, general ledger/double-entry, legal invoices and posting contracts.
- Event bus, queue retries/dead letter processing and notification templates.
- Corporate accounts, CRM tasks, quotes and agent commissions.
- Backup, DR, observability, emergency rollback and security gates.
- Full vehicle fields, agreement terms, transaction metadata and historical records.

These **V2-led features** require full server integration or feature flags:
- Company Work Mode urgency board, visual staff focus lenses, renter/owner/driver editorial homes.
- Interactive 7-day availability grid and named conflict alternatives.
- V2 booking-change comparison and renter nonbinding checkout.
- Visible physical-return vs financial-review split.
- New revenue truthfulness UX and onboarding resumption.
- Agent/corporate/service partner standalone experiences.
- Future marketplace preview (explicitly non-operational).

## Source confidence and decisions

The matrices use candidate mapping, not proven route coverage. Do not write "backend missing" merely because a matching controller name was not discovered. Validate exact API DTOs, store handlers, permissions, persisted DB rows and events per feature. Every accepted task must link to a test and original/V2 feature reference. Keep both repositories and preserve the baseline commits.

**Stop condition:** no release if CI is red, permission/tenancy bypass is possible, money states are fabricated, or original-only functionality disappeared during merge.
