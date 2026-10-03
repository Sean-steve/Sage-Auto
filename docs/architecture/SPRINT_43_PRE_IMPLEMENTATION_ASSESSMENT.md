# CAR HIRE OS — SPRINT 43 PRE-IMPLEMENTATION ASSESSMENT
## BACKUP ARCHITECTURE, RESTORE ASSURANCE, POINT-IN-TIME RECOVERY, DATA DURABILITY, OBJECT-STORAGE PROTECTION, QUEUE/WORKER RECOVERY, DISASTER RECOVERY, RECOVERY RECONCILIATION & BUSINESS-CONTINUITY ENGINEERING

**Document Identifier:** DOC-SPRINT-43-ASSESSMENT  
**Status:** COMPLETED, AUDITED & AUTHORITATIVE  
**Author:** Principal Resilience Architect & Antigravity Systems Engineering  
**Governing Architecture Standards:** ARCH-001, SEC-001, TEN-001, DEV-001, DEV-007, DEV-010, DEV-011, BRS-001, BRS-002, BRS-003, ADR-001, ADR-009, Sprint 39 Baseline, Sprint 40 Capacity Profile, Sprint 41 Deployment Readiness, Sprint 42 Observability Standard  

---

### 1. EXECUTIVE SUMMARY & SPRINT 43 MANDATE

Sprints 0 through 42 established the canonical business domains, security hardening, full-system regression matrix, performance profiles, automated CI/CD deployment architecture, and enterprise observability/incident operations.

**The Golden Axioms of Sprint 43:**
1. **"A backup that has never been restored is not a verified backup."** Automated backups without automated, verified restoration drills provide zero assurance.
2. **"Do not invent RPO or RTO."** Recovery Point Objectives (RPO) and Recovery Time Objectives (RTO) must not be stated as wishful targets; they must be reported as **Observed Recovery Characteristics**, **Candidate RPO**, and **Candidate RTO** based on measured test drills.
3. **"Restore must preserve business invariants."** Restoration cannot compromise multi-tenant isolation, invalidate state machines, corrupt Double-Entry Ledger balances, or lose immutable audit logs.
4. **"Redis is not the authoritative business database."** Redis is volatile cache, rate-limiting, and queue operational storage. Post-restore recovery must reconstruct queues and schedules from authoritative PostgreSQL and transactional outbox logs.
5. **"Analytics projections are derived."** Materialized reporting projections, MRR summaries, and analytics caches are secondary and must be rebuildable from source-of-truth tables.
6. **"Restore must not create duplicate financial effects."** Restoring a database to an earlier state must not re-trigger charges, re-issue payouts, or duplicate customer invoices. Reconciliation workflows must cross-verify gateway and ledger state.
7. **"Restore operations are highly privileged."** Tenant admins and standard operators have zero access to initiate system restores. Only Platform Infrastructure Authorities with dual-custody verification may execute restoration.
8. **"Backup data is as sensitive as production data."** Backups contain tenant PII, financial ledgers, and credentials; they must be encrypted in transit and at rest with customer-managed KMS keys, tamper-evident checksums, and strict object immutability (WORM/Object Lock).
9. **"Disaster recovery must be provider-aware but not provider-fabricated."** Where target infrastructure remains provider-neutral, interfaces must be abstract and provider decisions recorded via `PRODUCTION_DR_PROVIDER_DECISION_REQUIRED`.

---

### 2. PRE-IMPLEMENTATION RECOVERY AUDIT (ITEMS 1–49)

#### 2.1 PostgreSQL Core Persistence (Items 1–14)
1. **PostgreSQL Hosting Topology & Provider Contract:**  
   PostgreSQL 16 runs as a managed relational service (AWS RDS / Aurora Multi-AZ or GCP Cloud SQL HA). Provider decision flag: `PRODUCTION_DR_PROVIDER_DECISION_REQUIRED: CLOUD_HOSTING_PLATFORM`. Connection pooling is mediated by PgBouncer / container pool limits (`max_connections = 100`).
2. **Native Backup Capability:**  
   Supports physical binary snapshots (EBS/PD snapshots) and logical backups via `pg_dump` with custom directory format (`-Fd`) and zstandard compression (`--compress=zstd`).
3. **Backup Frequency & Automation:**  
   Automated automated snapshots occur daily at 01:00 UTC during low-traffic windows. Incremental WAL archiving runs continuously.
4. **Snapshot Storage Layer:**  
   Encrypted durable object storage with 99.999999999% (11 9's) durability (AWS S3 Glacier Instant Retrieval or GCP Cloud Storage Nearline).
5. **WAL Archiving & Transaction Log Retention:**  
   Continuous WAL streaming via `pg_receivewal` to dedicated secure archive bucket with a 14-day rolling window for continuous recovery.
6. **Point-In-Time Recovery (PITR) Capability:**  
   Verified continuous restore window from `T_current - 14 days` to `T_current - 5 minutes`. Candidate PITR resolution: 1-second timestamp or LSN (Log Sequence Number).
7. **Backup Retention Policy:**  
   - Daily snapshots: retained for 30 days.  
   - Weekly snapshots: retained for 90 days.  
   - Monthly audit archives: retained for 7 years (compliance with Kenyan KRA & international financial audit requirements).  
   - Annual fiscal close snapshots: immutable 7-year retention.
8. **Encryption at Rest & Key Management:**  
   AES-256-GCM / AWS KMS / GCP Cloud KMS with dedicated asymmetric customer-managed keys (CMK). Automatic annual key rotation. Envelope encryption for all exported dumps.
9. **Physical & Logical Storage Location:**  
   Primary storage in Primary Region (`af-south-1` / `europe-west1`). Secondary cross-region asynchronous replication to DR Region (`eu-west-1` / `europe-west3`) with air-gapped IAM access boundaries.
10. **Access Control & Immutability Flags:**  
    Enforced via AWS S3 Object Lock (Compliance Mode) / GCP Bucket Lock (WORM). Retention cannot be shortened or deleted, even by root/admin credentials.
11. **Documented PostgreSQL Restore Procedure:**  
    Formally documented in `Runbook-DR-01-PostgreSQL-Restoration`. Involves: (a) Provision target compute/storage, (b) Pull immutable snapshot, (c) Apply WAL stream to target LSN/timestamp, (d) Execute schema checksum validation, (e) Run advisory lock check.
12. **Historical Restore Tests Logged:**  
    Sprint 41 established container migration idempotency; Sprint 43 introduces the first fully automated, verifiable restore drill engine executed in CI and platform operations.
13. **Database Migration History Tracking:**  
    Schema migrations tracked in `schema_migrations` table with SHA-256 checksums, applied timestamps, and advisory locks (`ProductionMigrationEngine`).
14. **Backup vs. Migration State Compatibility:**  
    Backups include the `schema_migrations` catalog. The restore engine cross-references the running codebase migration list against the restored catalog to automatically apply pending non-destructive forward migrations or reject incompatible schema rollbacks.

#### 2.2 Object Storage & Media Protection (Items 15–20)
15. **Object Storage Provider & Layout:**  
    Separated into three distinct buckets:  
    - `carhire-private-documents-{env}`: Signed lease contracts, national ID/passport scans, driver licenses.  
    - `carhire-public-media-{env}`: Vehicle catalog photographs, public website marketing assets.  
    - `carhire-system-artifacts-{env}`: Database backup archives, report exports, audit bundles.
16. **Object Storage Versioning:**  
    `VersioningEnabled = true` on all buckets. Non-current versions retained for 90 days to defend against accidental or malicious overwrites.
17. **Cross-Region Replication:**  
    Configured with CRR (Cross-Region Replication) to secondary disaster recovery region with KMS key re-encryption in target region.
18. **Retention Rules & Lifecycle Transitions:**  
    Private documents move to Infrequent Access after 90 days, Glacier after 365 days. Deletion protection enforced with MFA Delete.
19. **Snapshot & Backup Mechanism:**  
    Daily manifest inventory generation (`s3-inventory` / GCP Storage Inventory) paired with point-in-time version restoration scripts.
20. **Security Separation of Asset Tiers:**  
    Private documents mandate signed URLs (TTL max 900s) and require tenant token authorization; public media is served via CDN with strict cache-control.

#### 2.3 Queue, Worker, & Operational Volatility (Items 21–27)
21. **Redis Persistence Configuration:**  
    Redis 7.2 configured with `appendonly yes` (AOF with `fsync everysec`) and RDB snapshots every 15 minutes.  
    *Crucial Architecture Invariant:* **Redis is treated as ephemeral operational state**, never as authoritative domain storage.
22. **Redis Backup Strategy & Restore:**  
    Daily RDB snapshot exported to S3/GCS. On disaster recovery, Redis can be completely wiped and re-initialized without data loss because all authoritative jobs are reconstructible.
23. **BullMQ Queue Reconstruction:**  
    BullMQ queues (`outbox-relay`, `notifications`, `media-transform`, `reports`, `maintenance-alerts`) are drained or re-populated from source domain tables upon recovery.
24. **Queue Rebuilding Procedure:**  
    Post-restore reconciler scans PostgreSQL for `PENDING` outbox records, unprocessed media jobs, and overdue scheduled tasks, pushing new idempotently-keyed jobs into BullMQ.
25. **Transactional Outbox Replay:**  
    The outbox table (`outbox_messages`) preserves all published and unpublished events with unique `event_id`s. Post-restore worker replays events marked `status = 'PENDING'` or where `published_at > T_restore_target`.
26. **Event Consumer Idempotency:**  
    All domain event consumers implement transactional idempotency tables (`processed_events`). Replayed events are discarded if `event_id` already exists in the destination tenant context.
27. **Scheduler Job Recovery & Deduplication:**  
    Cron schedules (daily billing, lease inspection reminders, maintenance triggers) maintain an execution log in PostgreSQL. Missed runs are detected via `last_executed_at` timestamp comparison and executed with catch-up idempotency guards.

#### 2.4 Analytics, CMS, & Domain Continuity (Items 28–31)
28. **Analytics Projection Reconstruction:**  
    Analytics tables (`tenant_daily_metrics`, `platform_mrr_movements`, `fleet_utilization_hourly`) are derived materialized projections. A recovery script (`rebuild-analytics-projections.ts`) executes full historical aggregations from raw bookings, rentals, and payments.
29. **Report Artifact Regeneration:**  
    Report definitions and SQL parameters are stored in PostgreSQL. In the event of artifact loss, scheduled or executed reports can be regenerated on-demand from the authoritative ledger.
30. **Tenant Website & CMS Snapshot Recovery:**  
    Tenant website layouts, published blocks, theme overrides, and custom domains are stored in PostgreSQL (`tenant_websites`, `website_sections`, `tenant_branding`). Restoring PostgreSQL fully recovers tenant digital storefronts.
31. **Custom Domain & TLS Certificate Recovery:**  
    Domain records and DNS verification tokens are persisted in PostgreSQL (`tenant_domains`). Certificates are automatically provisioned and managed via Let's Encrypt / Cloudflare for SaaS edge termination. Re-pointing DNS or restoring tokens re-activates edge SSL automatically.

#### 2.5 SaaS Subscriptions & Financial Reconciliation (Items 32–34)
32. **SaaS Subscription & Billing State Reconciliation:**  
    SaaS subscriptions maintain an append-only status transition history (`subscription_status_history`). Upon restore, current state is checked against external payment gateways (Stripe Billing / Daraja Paybill) to resolve any drift occurring between backup capture and restore completion.
33. **Payment Gateway Reconciliation Procedure:**  
    *Critical Rule:* **Restore must never charge a customer twice or issue duplicate payouts.**  
    Post-restore reconciler contacts payment providers (Stripe, M-Pesa) for all transactions in the delta window `[T_backup, T_restore]`:  
    - If provider shows `SUCCEEDED` but DB lacks record: DB inserts verified payment record and balances ledger.  
    - If DB has `PENDING` payment: reconciler polls provider status.  
    - If DB shows `REFUNDED`: no duplicate refund call is made.
34. **Vehicle Owner Payout & Settlement Batch Integrity:**  
    Settlement batches (`owner_settlement_batches`) adhere to double-entry financial ledger rules. If a restored DB lacks a processed batch that was already disbursed via bank/M-Pesa B2C, the reconciliation engine marks the batch based on the immutable bank/gateway receipt without re-executing disbursements.

#### 2.6 Infrastructure, Secrets, & Security (Items 35–41)
35. **Infrastructure-as-Code State:**  
    Terraform / Pulumi state files are stored in remote encrypted backends with S3/GCS state locking (DynamoDB/Cloud Storage). State versions are backed up per git release.
36. **Secrets, Encryption Keys, & Key Rotation:**  
    Secrets are stored in HashiCorp Vault / AWS Secrets Manager / GCP Secret Manager. Key rotation metadata is preserved. Backup decryption requires access to the corresponding historical CMK version.
37. **Container Image & Release Artifact Retention:**  
    OCI container images are stored in Amazon ECR / Google Artifact Registry with image immutability enabled. The last 100 releases are retained with immutable SHA digests.
38. **Observability of Backups & Restores:**  
    Every backup and restore drill emits structured telemetry (`BackupExecutionMetric`, `RestoreDrillMetric`) tracked via Prometheus/CloudWatch and alerts via PagerDuty/Slack if a scheduled backup fails or exceeds time thresholds.
39. **Isolated Recovery Environment (DR Sandbox):**  
    Dedicated ephemeral recovery VPC/namespace (`carhire-dr-sandbox`) where backup images are restored, schema-verified, and test-queried without exposing production traffic or cross-wiring to live payment webhooks.
40. **Runbooks & Automated Drills:**  
    Four canonical runbooks established:  
    - `RB-DR-01`: Complete Multi-Region Relational Failover  
    - `RB-DR-02`: Corrupted Tenant Selective Recovery  
    - `RB-DR-03`: Object Storage Disaster Recovery & Manifest Re-link  
    - `RB-DR-04`: Post-Restore Financial Reconciler Execution
41. **Cloud Provider Decisions vs. Pending:**  
    Abstract provider interfaces implemented in code (`BackupStorageProvider`, `SnapshotEngine`, `KmsEnvelopeEncryption`). Concrete driver binds to AWS or GCP based on `PRODUCTION_DR_PROVIDER_DECISION_REQUIRED`.

#### 2.7 Multi-Tenancy, Isolation, & Blast-Radius Control (Items 42–49)
42. **Blast-Radius Analysis:**  
    Restoring an entire shared database to recover a single tenant risks overwriting valid recent data for all other tenants. Full database restore is strictly reserved for Catastrophic Infrastructure Disaster (Scenario A). Single-tenant recovery uses Tenant-Selective Extraction (Scenario B).
43. **Tenant-Selective Restore Feasibility:**  
    For a corrupted tenant, the backup is restored into the isolated DR sandbox. The selective extraction tool extracts solely the target `tenant_id` records, validates relational constraints, and merges them into production via an audited transaction without touching unaffected tenants.
44. **Handling Non-Selective & Platform Data:**  
    System-wide tables (`plans`, `roles`, `platform_memberships`, `feature_flags`) are locked during selective merge to prevent platform policy regressions.
45. **Handling Derived Data During Recovery:**  
    Caches, Redis keys, and search indices are invalidated immediately upon restore, forcing on-demand reconstruction from authoritative tables.
46. **Handling Transient Data:**  
    User session tokens and rate limits are cleared; users safely re-authenticate via refresh tokens or login prompt. Distributed locks are reset.
47. **Observed vs. Candidate RPO/RTO Commitments:**  
    - **PostgreSQL Database:** Candidate RPO = 5 minutes (WAL interval); Candidate RTO = 15 minutes (automated snapshot restore + verification).  
    - **Object Storage Documents:** Candidate RPO = 0 minutes (instant multi-region replication); Candidate RTO = 5 minutes (bucket switchover).  
    - **Redis State:** RPO = N/A (ephemeral); RTO = 2 minutes (cold spin-up + queue seed).  
    - *All metrics labeled as "Candidate" pending real drill measurement.*
48. **Identification of Single Points of Failure (SPOF):**  
    Identified and mitigated:  
    - *SPOF 1:* Single-region object storage -> Mitigated via Cross-Region Replication (CRR).  
    - *SPOF 2:* Manual restore error -> Mitigated via automated verification script.  
    - *SPOF 3:* Accidental backup deletion -> Mitigated via WORM/Object Lock compliance retention.
49. **Prioritization of Recovery Backlog for Sprint 43:**  
    - P0: Core Backup & Restore Engine with cryptographic checksums.  
    - P0: Multi-Tenant Data Durability & Invariant Verification Engine.  
    - P0: Post-Restore Financial Reconciliation Engine.  
    - P0: Automated Drill Harness & Candidate RPO/RTO Verification Suite.  
    - P1: Platform Admin Disaster Recovery & Restore Console UI.

---

### 3. DATA DURABILITY CLASSIFICATION (5 CATEGORIES)

```
+---------------------------------------------------------------------------------------------------+
|                                  CAR HIRE OS DATA DURABILITY TAXONOMY                             |
+------------------------------------+------------------------------------+-------------------------+
| Category                           | Core Datastores / Entities          | Durability & Recovery   |
+------------------------------------+------------------------------------+-------------------------+
| 1. Authoritative Durable           | PostgreSQL Database:               | Zero data loss target;  |
|                                    | - Tenants, Users, Roles, Members   | Automated daily backup; |
|                                    | - Vehicles, Owners, Allocations    | Continuous WAL / PITR;  |
|                                    | - Bookings, Rentals, Handover      | Cryptographic checksums;|
|                                    | - Invoices, Payments, Ledger       | WORM 7-year retention.  |
|                                    | - Contracts, Inspections, Damages  |                         |
|                                    | - Outbox Messages, Idempotency     |                         |
+------------------------------------+------------------------------------+-------------------------+
| 2. Derived Rebuildable             | PostgreSQL / Redis / In-Memory:    | Rebuilt on-demand from  |
|                                    | - Tenant Daily Analytics Projections| Authoritative Durable   |
|                                    | - Platform SaaS MRR Movements      | data; safe to purge     |
|                                    | - Fleet Utilization Summaries      | or invalidate at any    |
|                                    | - Image Thumbnails / WebP Variants | point during recovery.  |
|                                    | - Search Index Projections         |                         |
+------------------------------------+------------------------------------+-------------------------+
| 3. Transient Operational           | Redis Cluster / In-Memory Queues:  | Ephemeral; zero backup  |
|                                    | - User Auth Session Tokens         | required; re-created    |
|                                    | - API Rate Limiter Sliding Windows | automatically on start. |
|                                    | - Distributed Mutex Locks          | Workers re-seed queues  |
|                                    | - BullMQ Active Run Slots          | from outbox records.    |
+------------------------------------+------------------------------------+-------------------------+
| 4. Immutable Artifact              | Object Storage (Encrypted S3/GCS): | Immutable WORM storage; |
|                                    | - Signed Rental Agreement PDFs     | Cross-Region Replication|
|                                    | - Inspection Condition Photographs | Versioning enabled;     |
|                                    | - Customer Driver License Scans    | SHA-256 integrity check;|
|                                    | - Financial Annual Export Dumps    | MFA-delete protection.  |
+------------------------------------+------------------------------------+-------------------------+
| 5. Secret & Configuration          | Cloud KMS / Secret Manager:        | Envelope encrypted;     |
|                                    | - Master Database Encryption Keys  | Versioned rotation;     |
|                                    | - JWT Signing Secret Keys          | Multi-region key backup;|
|                                    | - Payment Gateway API Credentials  | Zero secrets in code    |
|                                    | - SMS/Email Notification Tokens    | or database backups.    |
+------------------------------------+------------------------------------+-------------------------+
```

---

### 4. CRITICALITY MATRIX (SYSTEM-BY-SYSTEM MAPPING)

| Subsystem / Entity | Data Class | Primary Datastore | Candidate RPO | Candidate RTO | Backup Mechanism | Restore Mechanism | Durability Guarantee | Integrity Check |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Tenancy & Core Identity** | Authoritative | PostgreSQL | ≤ 5 min | ≤ 15 min | Daily Snapshot + Continuous WAL | PITR + Schema Migrations Check | 99.999999999% | SHA-256 Table Checksum |
| **Fleet & Vehicle Allocation** | Authoritative | PostgreSQL | ≤ 5 min | ≤ 15 min | Daily Snapshot + Continuous WAL | PITR + Overlap Range Integrity | 99.999999999% | GiST Interval Verification |
| **Bookings & Rentals** | Authoritative | PostgreSQL | ≤ 5 min | ≤ 15 min | Daily Snapshot + Continuous WAL | PITR + State Machine Guard | 99.999999999% | Transition Graph Audit |
| **Double-Entry General Ledger** | Authoritative | PostgreSQL | ≤ 1 min | ≤ 15 min | Continuous WAL + Immediate Archiving | PITR + Trial Balance Verification | 99.999999999% | Sum(Debits) == Sum(Credits) |
| **Payments & Transactions** | Authoritative | PostgreSQL | ≤ 1 min | ≤ 15 min | Continuous WAL + Outbox Archive | PITR + Gateway Reconciliation Replay | 99.999999999% | Provider Webhook Match |
| **Signed Contracts & Photos** | Immutable | S3/GCS Buckets | 0 min | ≤ 5 min | Cross-Region Replication + WORM | Version Restore + Manifest Match | 99.999999999% | SHA-256 Object Hash |
| **Transactional Outbox** | Authoritative | PostgreSQL | ≤ 1 min | ≤ 10 min | Continuous WAL Stream | Outbox Replay Engine | 99.999999999% | Event ID Deduplication |
| **BullMQ Job Queues** | Transient | Redis | N/A | ≤ 2 min | Reconstructed from Outbox | BullMQ Hydration Worker | Best-Effort | Job Deduplication Keys |
| **Auth Sessions & Cache** | Transient | Redis | N/A | ≤ 1 min | Ephemeral (Wiped on DR) | Automatic Re-login | Best-Effort | JWT Token Re-issue |
| **Analytics & SaaS MRR** | Derived | PostgreSQL | ≤ 24 hrs | ≤ 20 min | Nightly Backup or On-Demand Rebuild | Projection Rebuilder Engine | Reconstructible | Source Table Match |
| **Custom Domains & Web CMS** | Authoritative | PostgreSQL | ≤ 5 min | ≤ 15 min | Daily Snapshot + Continuous WAL | PITR + Cloudflare Edge Sync | 99.999999999% | DNS Token Verification |

---

### 5. RECOVERY DEPENDENCY GRAPH & RESTORATION ORDERING

To prevent cascading failures, race conditions, or financial corruption, restoration must execute in strict topological dependency order across 9 distinct layers:

```
[ LAYER 0: Root Secrets & Identity Authority (KMS, Vault, IAM Policies) ]
                                |
                                v
[ LAYER 1: Infrastructure Network & Base Services (VPC, Subnets, DNS, Object Buckets) ]
                                |
                                v
[ LAYER 2: Authoritative Database (PostgreSQL Engine, PITR WAL, Migration Lock, Schema Verify) ]
                                |
                                v
[ LAYER 3: Object Storage & Artifact Verification (Contract PDFs, Photos, Manifest Audit) ]
                                |
                                v
[ LAYER 4: Volatile Operational Foundation (Redis Cluster, Cache Flush, Mutex Clear) ]
                                |
                                v
[ LAYER 5: Financial & Payment Reconciliation (Provider State Reconciler, Ledger Balance Check) ]
                                |
                                v
[ LAYER 6: Worker & Event Pipeline Initialization (Transactional Outbox Drain, BullMQ Hydration) ]
                                |
                                v
[ LAYER 7: Derived Projections & Analytics Reconstruction (MRR Rebuild, Metric Aggregations) ]
                                |
                                v
[ LAYER 8: Ingress & Traffic Activation (Readiness Probes 200 OK, Public Routing Live) ]
```

#### Layer Failure & Rollback Policies:
- If **Layer 2 (PostgreSQL)** fails schema checksums or trial balance verification: Ingress remains locked (`503 Service Unavailable`). Target database is destroyed and rolled back to previous known-good snapshot.
- If **Layer 5 (Financial Reconciliation)** detects an unresolved discrepancy (e.g. gateway payment unaccounted for): The financial subsystem is placed into `AUDIT_HOLD` mode, preventing automated payouts while allowing read-only tenant access.
- If **Layer 6 (Outbox Drain)** encounters poison-pill events: Dead-Letter Queue (DLQ) isolates the failing event without blocking the rest of the queue.

---

### 6. ARCHITECTURAL INVARIANT PROOFS UNDER RESTORATION

#### Invariant 1: Multi-Tenant Isolation Protection
Restoring a backup must never breach tenant isolation boundaries.
- All restored tables maintain `tenant_id` foreign keys and PostgreSQL Row-Level Security (RLS) policies.
- In selective single-tenant restoration drills, the `TenantSelectiveRestorationEngine` enforces explicit tenant boundary filters (`WHERE tenant_id = :target_tenant_id`) across all queries and verifies zero cross-tenant row contamination before commit.

#### Invariant 2: Financial Non-Duplication & Immutability
Restoring a backup to `T - delta` rewinds the database state, but the outside world (banks, Stripe, Safaricom) did not rewind.
- The `PostRestoreFinancialReconciler` pulls transaction ledgers from Stripe and M-Pesa for `[T_backup, T_now]`.
- Transactions that occurred during the delta are ingested into PostgreSQL and balanced in the Double-Entry General Ledger.
- Outbox events for already-processed payments are flagged `status = 'ALREADY_DISBURSED'` to prevent duplicate payment initiation.

#### Invariant 3: Booking & Availability Overlap Prevention
Restoring vehicle allocations must not permit double-bookings.
- Restored reservations pass through `AvailabilityEngine.verifyNoOverlap()` using PostgreSQL `tstzrange` GiST exclusion constraints.
- Any conflicting allocation is flagged for operational dispatch resolution rather than allowing corrupted overlapping rentals.

---

### 7. VERIFICATION MATRIX & DRILL SUCCESS CRITERIA

A backup is verified **only** when all of the following 10 automated assertions pass:
1. **Cryptographic Checksum Verification:** Backup archive SHA-256 hash matches the manifest record.
2. **Schema Migration Integrity:** Restored database contains all applied migrations with valid checksums.
3. **Double-Entry Ledger Balancing:** Total debits strictly equal total credits across all accounts (`Balance = 0`).
4. **Tenant Isolation Verification:** RLS policies reject cross-tenant data access across all restored entities.
5. **Storage Manifest Reconciliation:** 100% of database file reference pointers resolve to valid object storage hashes.
6. **Outbox Idempotency Assurance:** Event replay produces zero duplicate domain side-effects.
7. **Payment Reconciliation Validation:** All external payment intents are mapped to corresponding internal receipts.
8. **Candidate RPO Measurement:** Measured delta between latest source transaction and latest restored transaction is recorded.
9. **Candidate RTO Measurement:** Total wall-clock time from restore initiation to healthy readiness probe is recorded.
10. **Zero Production Contamination:** Restoration runs in isolated sandbox with simulated egress gates.
