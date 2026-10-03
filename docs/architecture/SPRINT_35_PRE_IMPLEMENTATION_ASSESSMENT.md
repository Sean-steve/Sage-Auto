# CAR HIRE OS — SPRINT 35 PRE-IMPLEMENTATION ASSESSMENT
## PLATFORM SAAS ANALYTICS, SUBSCRIPTION INTELLIGENCE, MRR/ARR, CHURN, COHORTS, PLAN PERFORMANCE, BILLING HEALTH, ENTITLEMENT ADOPTION & PLATFORM BUSINESS REPORTING

**Document Identifier:** DOC-SPRINT-35-ASSESSMENT  
**Status:** COMPLETED & APPROVED FOR EXECUTION  
**Author:** Principal Platform Architect & Antigravity Engineering  
**Governing Architecture Standards:** ARCH-001, SEC-001, TEN-001, DEV-001, DEV-004, DEV-006, DEV-009, DEV-011, BRS-001, BRS-002, BRS-003, ADR-001, ADR-009  

---

### EXECUTIVE SUMMARY

Sprint 35 delivers the production **Platform SaaS Analytics & Subscription Intelligence Engine** for Car Hire OS. 
Where Sprint 34 established the operational and financial analytics platform for individual tenant operators (Fleet Utilization, Rental Revenue, Customer Aging, Double-Entry Reconciliation, Branch KPIs), Sprint 35 establishes the executive intelligence plane for the Car Hire OS SaaS platform company itself.

In strict adherence to foundational architecture invariants:
1. **Platform SaaS Analytics ≠ Tenant Business Analytics:** These domains are mathematically and structurally isolated. Tenant analytics tracks car rental operations; Platform analytics tracks subscription contracts, SaaS billing, platform ARR/MRR, tenant cohorts, plan migrations, and system-wide capability adoption.
2. **Platform SaaS Revenue ≠ Tenant Rental Revenue:** Platform SaaS revenue originates exclusively from SaaS Subscription billings, plan fees, and enterprise add-ons. It never incorporates tenant booking charges, security deposits, vehicle damages, or rental invoices.
3. **Canonical Normalization of MRR/ARR:** MRR is normalized using authoritative commercial snapshots: Monthly contracts contribute 100% of their net recurring value; Annual contracts contribute exactly `AnnualAmount / 12`. One-time setup fees, usage overages, and refundable deposits are explicitly excluded from recurring metrics.
4. **No Surveillance Backdoor (Strict Privacy & Data Minimization):** Platform analytics never queries or stores individual car rental customer names, phone numbers, driver licenses, CRM notes, or booking itineraries. All cross-tenant telemetries are strictly aggregated, anonymized, and tenant-level minimized.
5. **Read-Only Analytical Guarantee:** Analytics projections and reporting engines strictly observe SaaS state transitions. Under no circumstance does an analytical evaluation mutate subscription states, trigger dunning, or adjust billing amounts.
6. **Modular Monolith Integrity:** The platform uses PostgreSQL read models and relational projections. No external OLAP clusters, data warehouses, or distributed streaming brokers (Kafka) are introduced.

---

### SPRINT 35 IMPLEMENTATION ASSESSMENT (43 EVALUATION POINTS)

#### 1. Governing Specifications & Architectural Standards
Sprint 35 is strictly governed by:
- **ARCH-001 (Modular Monolith & Layered Bounded Contexts):** Distinct boundary in `apps/api/src/modules/platform-analytics/`, decoupled from tenant analytics (`apps/api/src/modules/analytics/`).
- **SEC-001 & TEN-001 (Isolation & Multi-Tenancy):** Platform Analytics queries across tenants for macro SaaS aggregates under `PlatformMembership` authority without violating tenant data isolation or leaking tenant operational secrets.
- **DEV-009 (Spreadsheet Injection Defense):** All CSV/Excel exports enforce OWASP formula sanitization.
- **DEV-011 (Event Bus & Projections):** Event-driven subscription event consumption with idempotent transactional guarantees.
- **ADR-001 & ADR-009 (Shared Packages & Monorepo Contracts):** Strict typing via `packages/types` and unified data models in `packages/database`.

#### 2. Business Purpose & Operational Value
Enables the platform leadership, executive team, and finance operations to:
- Monitor true recurring revenue (MRR, ARR, Net Revenue Retention, Gross Revenue Retention).
- Track tenant lifecycle dynamics (New, Expansion, Contraction, Churn, Reactivation).
- Detect billing vulnerabilities (Dunning rate, DSO, failed recurring card/M-Pesa payments).
- Analyze plan tier performance (ARPU, LTV, conversion velocity across Growth, Pro, Enterprise).
- Evaluate entitlement adoption to inform product roadmap and pricing strategy.

#### 3. Platform SaaS Analytics vs. Tenant Business Analytics Boundary (Critical Invariant)
- `apps/api/src/modules/analytics/` (Sprint 34) is strictly tenant-scoped (`where: { tenantId }`), calculating fleet utilization, rental yield, and driver compliance.
- `apps/api/src/modules/platform-analytics/` (Sprint 35) is platform-scoped, aggregating B2B subscriber relationships, SaaS subscription tiers, and platform revenue. The two bounded contexts share no database tables, no read models, and no report registries.

#### 4. Platform SaaS Revenue vs. Tenant Rental Revenue Separation (Critical Invariant)
- **Tenant Rental Revenue:** Sum of rental agreements, customer booking invoices, mileage fees, and incidental charges recorded in tenant sub-ledgers.
- **Platform SaaS Revenue:** Invoiced software subscriptions paid by tenant organizations to Car Hire OS (e.g., Growth KES 24,500/mo, Enterprise KES 65,000/mo). The platform revenue engine never reads tenant rental invoices.

#### 5. Canonical MRR/ARR Definition & Mathematical Specification
- **Canonical MRR Formula:**
  $$\text{MRR} = \sum_{s \in \text{ActivePaidSubs}} \begin{cases} \text{SnapshotAmount}(s) & \text{if interval is MONTHLY} \\ \frac{\text{SnapshotAmount}(s)}{12} & \text{if interval is ANNUAL} \end{cases}$$
- **Canonical ARR Formula:** $\text{ARR} = \text{MRR} \times 12$.
- Subscriptions in `TRIAL`, `SUSPENDED`, `CANCELLED`, or `EXPIRED` contribute KES 0 to active MRR.
- Subscriptions in `RENEWAL_DUE` or `GRACE_PERIOD` continue to contribute to MRR until their transition to `SUSPENDED` or `CANCELLED`.

#### 6. Movement Accounting: New, Expansion, Contraction, Churn, Reactivation
Every change in subscription MRR emits a canonical `MrrMovementRecord`:
- **NEW:** Initial transition from `TRIAL` or unbilled state to paid `ACTIVE`.
- **EXPANSION:** Plan upgrade or tier expansion increasing normalized MRR ($MRR_{\text{new}} > MRR_{\text{old}}$).
- **CONTRACTION:** Plan downgrade decreasing normalized MRR without cancellation ($MRR_{\text{new}} < MRR_{\text{old}}$).
- **CHURN:** Transition from paid active status to `CANCELLED` or `EXPIRED` ($MRR_{\text{new}} = 0$).
- **REACTIVATION:** Churned or suspended subscriber returning to paid active status.
$$\text{Net MRR Delta} = \text{New} + \text{Expansion} + \text{Reactivation} - \text{Contraction} - \text{Churn}$$

#### 7. Subscription Lifecycle Historical Reconstruction (Snapshot vs. Dynamic Price)
Historical analytics must never recalculate past revenue by looking up current plan prices in the `plans` table. If the Enterprise plan price increases from KES 65,000 to KES 75,000 today, past snapshots for August 2026 must continue to reflect KES 65,000. All metrics leverage immutable commercial snapshots stored on subscription creation/renewal.

#### 8. Multi-Currency Normalization & Currency Conversion Policy
- Primary Platform Reporting Currency: **KES (Kenya Shillings)**.
- Baseline ISO 4217 Currency Standard: Each subscriber record contains an explicit currency code.
- Normalization Policy: Foreign currency subscriptions (e.g., USD, EUR, TZS) must specify an authoritative FX snapshot rate at issuance or use a strict conversion rate table. Unconverted mixed currency summation is strictly forbidden.

#### 9. Platform Privacy & Zero Cross-Tenant Surveillance Policy
- **Data Minimization:** Platform analytics stores only tenant metadata (`tenantId`, `planCode`, `status`, `countryCode`, `industrySegment`).
- **Zero Operational PII:** No driver names, customer contact info, vehicle GPS coordinates, or inspection damage photos are ingested into platform analytics read models.

#### 10. Read-Only Analytical Guarantee
- Platform analytics components, query engines, and background aggregation jobs execute with read-only semantics against operational tables. No plan prices, subscription states, or billing statuses are mutated by analytics queries.

#### 11. Bounded Context & Modular Monolith Placement
- Domain, Application, Infrastructure, and Presentation layers are placed in:
  - `apps/api/src/modules/platform-analytics/domain/`
  - `apps/api/src/modules/platform-analytics/application/`
  - `apps/api/src/modules/platform-analytics/infrastructure/`
  - `apps/api/src/modules/platform-analytics/presentation/`
- Shared types exported via `packages/types/src/platform-analytics.ts`.
- Repositories in `packages/database/src/repositories/platform-*.ts`.

#### 12. Relational Read Models & PostgreSQL Projections
- Instead of external warehouse solutions (Snowflake/BigQuery/ClickHouse), PostgreSQL relational projection tables with JSONB aggregations and indexed date partitions provide sub-millisecond platform intelligence.

#### 13. Platform Metric Definition Registry
A canonical, immutable `PlatformMetricRegistry` registers all platform metrics with:
- Metric Code (e.g., `SAAS_MRR_TOTAL`, `SAAS_NET_REVENUE_RETENTION`, `SAAS_LOGO_CHURN_RATE`).
- Mathematical formula, source domain, calculation grain, aggregation type, and unit.
- SemVer version (e.g., `1.0.0`).

#### 14. Metric Versioning & Governance
- Metric definitions cannot be altered ad-hoc. Modifying a metric's mathematical definition requires incrementing the version and registering a migration/reconciliation path, ensuring historical reporting stability.

#### 15. Metric Invariants & Audit Equilibrium
- Audit rule: The sum of individual tenant subscription MRR snapshots must equal the aggregate `SAAS_MRR_TOTAL` for that date:
  $$\left| \sum \text{ActiveSubMRR} - \text{TotalPlatformMRR} \right| < 0.01$$
- Discrepancies generate a platform reconciliation warning.

#### 16. Subscription Event Ingestion & Outbox Relay Integration
- Subscribes to canonical events via EventBus:
  - `saas.subscription.created`
  - `saas.subscription.state_transitioned`
  - `saas.subscription.plan_changed`
  - `saas.billing.invoice_paid`
  - `saas.billing.invoice_payment_failed`
- Handlers idempotently record MRR movements and update daily platform snapshots.

#### 17. Daily Platform Snapshot Aggregate & Time Series Schema
- `PlatformDailySnapshotRecord`:
  - `snapshotDate`: ISO date (YYYY-MM-DD).
  - `totalTenants`, `activePaidTenants`, `trialTenants`, `suspendedTenants`, `churnedTenants`.
  - `totalMrr`, `newMrr`, `expansionMrr`, `contractionMrr`, `churnMrr`, `reactivationMrr`, `totalArr`.
  - `totalInvoiced`, `totalCollected`, `outstandingAr`, `arpu`.
  - `currency`: "KES".

#### 18. Cohort Analysis Engine
- Tracks tenant acquisition cohorts grouped by `YYYY-MM`:
  - Size of cohort ($N_0$).
  - Month-over-month active subscriber retention (Month 1, 2, 3... 12).
  - Net revenue retention (NRR) and logo retention percentages per cohort.

#### 19. Plan Performance & Tier Distribution Analytics
- Aggregates metrics per plan tier (`GROWTH`, `PRO`, `ENTERPRISE`):
  - Subscriber count and share percentage.
  - Tier MRR contribution and Average Revenue Per User (ARPU).
  - Migration trends (e.g., Growth to Enterprise upgrades).

#### 20. Billing Health, Dunning & Invoicing Aging Metrics
- Invoicing health metrics:
  - Invoiced SaaS revenue vs. settled revenue.
  - Payment failure rate (failed card charges / failed M-Pesa STK pushes).
  - Days Sales Outstanding (DSO) for enterprise wire transfers.
  - Accounts Receivable Aging buckets (Current, 1-15 days, 16-30 days, 30+ days).

#### 21. Entitlement Adoption & Quota Utilization Telemetry
- Aggregates system utilization across tenants:
  - Fleet capacity utilization (% of allotted vehicles registered).
  - Team member seats utilized vs. quota.
  - Advanced feature activation rates (Double-entry ledger, custom domain, SMS notifications).

#### 22. Churn Analysis: Logo Churn vs. Net Revenue Churn vs. Gross Revenue Churn
- **Logo Churn Rate:** $\frac{\text{Tenants Lost in Period}}{\text{Tenants at Start of Period}} \times 100\%$
- **Gross Revenue Churn Rate:** $\frac{\text{Churned MRR} + \text{Contraction MRR}}{\text{MRR at Start of Period}} \times 100\%$
- **Net Revenue Retention (NRR):** $\frac{\text{Start MRR} + \text{Expansion} - \text{Contraction} - \text{Churn}}{\text{Start MRR}} \times 100\%$

#### 23. Trial Conversion Rate & Time-to-Convert Analytics
- Tracks conversion funnel:
  - Total trial signups.
  - Trial-to-paid conversion rate (e.g., 25%).
  - Average days from signup to paid conversion (median and mean).

#### 24. Platform Financial Ledger vs. SaaS Invoicing Reconciliation Engine
- Cross-references Stripe / M-Pesa gateway settlement logs with `SaaSBillingInvoice` and `JournalTransaction` records. Confirms that all collected subscription cash is accounted for in platform bank accounts.

#### 25. Real-Time Projections vs. Batch Rollups Topology
- **Real-Time Projection:** Updates operational counters and MRR movement entries on domain events.
- **Daily Batch Rollup:** Executes nightly at 00:05 UTC to freeze the official daily snapshot, reconcile balances, and compute multi-period cohort metrics.

#### 26. Historical Backfill Service & Idempotent Projection Replay
- Provides `PlatformBackfillService` capable of replaying the entire history of subscription mutations from inception to rebuild all daily snapshots and MRR movements idempotently.

#### 27. Background Job Topology & BullMQ Worker Jobs
- Integrated in `apps/worker/src/jobs/platform-analytics/`:
  - `platform-analytics.daily-rollup`: Nightly snapshot computation.
  - `platform-analytics.reconciliation`: Daily ledger & subscription audit.
  - `platform-analytics.export-generator`: Asynchronous large dataset report generation.

#### 28. Platform Admin Dashboard Foundation
- Overhauls `apps/platform-admin/src/PlatformAnalyticsView.tsx` with authoritative, real-time metrics loaded from the platform analytics engine, replacing hardcoded placeholders.

#### 29. Replacement of Prototype Platform Dashboard
- Eliminates naive prototype calculations (e.g., `(subscriptions || []).reduce(...)` that ignores intervals and discounts).
- Wires the UI directly to the canonical metric registry and server-backed projection feeds.

#### 30. Platform Admin Authorization & RBAC
- Guarded by platform authorization checks:
  - Only authenticated identities with valid `PlatformMembership` and roles `PLATFORM_SUPERADMIN` or `PLATFORM_ANALYST` can access platform analytics endpoints.
  - Tenant users attempting to access platform analytics receive HTTP 403 Forbidden.

#### 31. Zero `TenantContext` Requirement
- Unlike tenant-scoped endpoints that mandate an active `X-Tenant-Id` or `TenantContext`, platform analytics endpoints operate strictly at the platform level without tenant wrapping.

#### 32. Security & SQL Injection / Privilege Escalation Defenses
- Strict parameter validation using Zod schemas for all date ranges, filters, and cohort dimensions.
- Repository layer uses parameterized queries and strict types, eliminating raw string concatenations.

#### 33. CSV / Excel Export Sanitization & OWASP DEV-009 Defense
- All exported CSV or XLSX files from platform analytics pass through the canonical `CsvSanitizer`, prefixing risky characters (`=`, `+`, `-`, `@`, `\t`, `\r`) with single quotes (`'`).

#### 34. Report Scheduling & Delivery Orchestration for Platform Stakeholders
- Enables automated recurring delivery (Daily Executive Summary, Monthly SaaS Financial Report) to platform leadership via the notification orchestration infrastructure.

#### 35. Performance & Query Indexing Strategy
- Relational read tables indexed on `(snapshot_date DESC)`, `(tenant_id, occurred_at DESC)`, and `(cohort_month, period_month)`.
- Pre-aggregated daily snapshots ensure instant dashboard rendering without scanning millions of operational rows.

#### 36. Cross-Tenant Aggregation Privacy Safeguards
- Any cohort or industry breakdown requires a minimum cohort size ($k \ge 3$) to prevent inferring individual tenant financial data in multi-analyst environments.

#### 37. API Presentation Layer: Controller & REST Endpoints Specification
- `GET /api/v1/platform/analytics/overview`: High-level SaaS KPIs (MRR, ARR, active paid, churn rate, NRR).
- `GET /api/v1/platform/analytics/mrr-movements`: Time series of New, Expansion, Contraction, Churn.
- `GET /api/v1/platform/analytics/cohorts`: Acquisition cohort retention matrix.
- `GET /api/v1/platform/analytics/plans`: Plan tier breakdown and migration velocity.
- `GET /api/v1/platform/analytics/billing-health`: Dunning, overdue invoices, collection efficiency.
- `GET /api/v1/platform/analytics/entitlements`: Capability and quota adoption telemetry.
- `POST /api/v1/platform/analytics/reports/execute`: Run canonical platform report.
- `POST /api/v1/platform/analytics/reports/export`: Trigger sanitized CSV/Excel export.

#### 38. Frontend Consumption & UI Components Hierarchy
- `apps/platform-admin/src/PlatformAnalyticsView.tsx`:
  - `PlatformKpiOverviewRibbon`: High-contrast display cards for MRR, ARR, NRR, Active Subscribers.
  - `MrrMovementChart`: Waterfall / breakdown of recurring revenue dynamics.
  - `SubscriptionCohortMatrix`: Interactive heatmap of cohort retention over 12 months.
  - `PlanPerformanceDistribution`: Tier allocation, ARPU, and quota telemetry.
  - `BillingHealthAndAging`: Dunning alerts, collection rate, and AR aging buckets.
  - `PlatformReportExportDialog`: Export modal with format selection and OWASP protection badge.

#### 39. Error Handling, Degraded State & Fault Tolerance Policies
- If historical projections are undergoing re-index, queries seamlessly fall back to the most recent validated daily snapshot with a `degraded: true` telemetry flag.

#### 40. Observability, Structured Logging & Audit Trail of Analytical Access
- Every export or sensitive platform metrics query logs an audit event (`PLATFORM_ANALYTICS_ACCESSED`, `PLATFORM_REPORT_EXPORTED`) with actor ID, timestamp, and query parameters.

#### 41. Data Retention, Archival & Pruning Policies
- Daily snapshots are retained indefinitely for lifetime financial auditing.
- Fine-grained minute-by-minute worker telemetry is pruned after 90 days.

#### 42. End-to-End Integration Verification & Test Strategy (14 Test Cases)
A comprehensive integration test suite `packages/database/test/platform-saas-analytics.test.ts` validates:
1. Platform Metric Registry Catalog & Formal Definitions.
2. Canonical MRR & ARR Normalization Engine (Monthly vs. Annual).
3. MRR Movement Accounting (New, Expansion, Contraction, Churn, Reactivation).
4. Subscription Commercial Snapshot vs. Current Plan Price Invariant.
5. Cohort Analysis Engine & Retention Matrix.
6. Plan Tier Performance & Quota Telemetry.
7. Billing Health, Dunning & Invoice Aging Calculations.
8. Entitlement Adoption Telemetry.
9. Real-Time Subscription Domain Event Projections.
10. Historical Backfill Service & Idempotent Replay.
11. Platform Financial Ledger Equilibrium & Reconciliation.
12. CSV Formula Injection Defense for Platform Reports.
13. Platform Role Authorization & Non-Tenant Isolation.
14. Prototype Dashboard Elimination & Live Control Plane Verification.

#### 43. Sprint 35 Acceptance Criteria & Transition Sign-Off Matrix
- Zero mock metrics in Platform Admin dashboard.
- All 14 tests passing green.
- Strict isolation from tenant business analytics.
- Zero TypeScript compiler errors across the monorepo.
